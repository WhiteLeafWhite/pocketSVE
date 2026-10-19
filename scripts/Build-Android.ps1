[CmdletBinding()]
param(
    [string]$JavaHome,
    [string]$AndroidSdk,
    [string]$OutputPath
)

$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $JavaHome) {
    $installedJdk = Get-ChildItem -LiteralPath (Join-Path $projectRoot '.tools/java') -Directory |
        Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'bin/javac.exe') } |
        Sort-Object Name -Descending | Select-Object -First 1
    if ($installedJdk) { $JavaHome = $installedJdk.FullName } else { $JavaHome = $env:JAVA_HOME }
}
if (-not $AndroidSdk) { $AndroidSdk = Join-Path $projectRoot '.tools/android' }
if (-not $OutputPath) { $OutputPath = Join-Path $projectRoot 'dist/pocketSVE-debug.apk' }
if (-not $JavaHome -or -not (Test-Path -LiteralPath (Join-Path $JavaHome 'bin/javac.exe'))) {
    throw 'JDK not found. Supply -JavaHome with a JDK 17+ installation.'
}
$java = Join-Path $JavaHome 'bin/java.exe'
$javac = Join-Path $JavaHome 'bin/javac.exe'
$keytool = Join-Path $JavaHome 'bin/keytool.exe'
$androidJar = Join-Path $AndroidSdk 'platforms/android-35/android.jar'
if (-not (Test-Path -LiteralPath $androidJar)) { throw "Missing Android API 35 platform: $androidJar" }
$buildTools = Get-ChildItem -LiteralPath (Join-Path $AndroidSdk 'build-tools') -Directory |
    Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'aapt2.exe') } |
    Sort-Object Name -Descending | Select-Object -First 1
if (-not $buildTools) { throw 'Android SDK build-tools not found.' }
$toolsRoot = $buildTools.FullName
$aapt2 = Join-Path $toolsRoot 'aapt2.exe'
$zipalign = Join-Path $toolsRoot 'zipalign.exe'
$apksignerJar = Join-Path $toolsRoot 'lib/apksigner.jar'
$d8Jar = Join-Path $toolsRoot 'lib/d8.jar'
$assets = Join-Path $projectRoot 'app/src/main/assets'
if (-not (Test-Path -LiteralPath (Join-Path $assets 'index.html'))) { throw 'Missing app/src/main/assets/index.html.' }

function Invoke-BuildTool {
    param([string]$Executable, [string[]]$ToolArguments)
    & $Executable @ToolArguments
    if ($LASTEXITCODE -ne 0) { throw "Build tool failed ($LASTEXITCODE): $Executable" }
}

# Each build uses a fresh directory, preserving previous artifacts and avoiding recursive deletion.
$buildRoot = Join-Path $projectRoot ('build/android-' + [Guid]::NewGuid().ToString('N'))
$classes = Join-Path $buildRoot 'classes'
$dex = Join-Path $buildRoot 'dex'
$generated = Join-Path $buildRoot 'generated'
$outputDirectory = Split-Path -Parent ([IO.Path]::GetFullPath($OutputPath))
New-Item -ItemType Directory -Force -Path $buildRoot, $classes, $dex, $generated, $outputDirectory | Out-Null
$compiledResources = Join-Path $buildRoot 'compiled-resources'
New-Item -ItemType Directory -Force -Path $compiledResources | Out-Null
$unsignedApk = Join-Path $buildRoot 'unsigned.apk'
$alignedApk = Join-Path $buildRoot 'aligned.apk'
$buildManifest = Join-Path $buildRoot 'AndroidManifest.xml'
# Gradle supplies the namespace itself; the direct SDK pipeline supplies it in this build copy.
[xml]$manifestDocument = Get-Content -LiteralPath (Join-Path $projectRoot 'app/src/main/AndroidManifest.xml') -Raw
$manifestDocument.DocumentElement.SetAttribute('package', 'io.pocketsve.app')
$manifestDocument.Save($buildManifest)

Write-Host 'Compiling Android resources...'
# Compile an explicit resource inventory before linking the package.
Get-ChildItem -LiteralPath (Join-Path $projectRoot 'app/src/main/res') -File -Recurse | ForEach-Object {
    Invoke-BuildTool $aapt2 @('compile', $_.FullName, '-o', $compiledResources)
}
$resourceFiles = @((Get-ChildItem -LiteralPath $compiledResources -Filter '*.flat').FullName)
Invoke-BuildTool $aapt2 (@('link', '-o', $unsignedApk, '-I', $androidJar, '--manifest', $buildManifest, '--debug-mode', '--java', $generated) + $resourceFiles)

Write-Host 'Compiling Java and DEX...'
$javaFiles = @((Get-ChildItem -LiteralPath (Join-Path $projectRoot 'app/src/main/java') -Filter '*.java' -Recurse).FullName) + @((Get-ChildItem -LiteralPath $generated -Filter '*.java' -Recurse).FullName)
$sourceList = Join-Path $buildRoot 'sources.txt'
$sourceLines = $javaFiles | ForEach-Object { '"' + $_.Replace('\', '/') + '"' }
[IO.File]::WriteAllLines($sourceList, $sourceLines, (New-Object Text.UTF8Encoding($false)))
Invoke-BuildTool $javac @('-encoding', 'UTF-8', '-source', '8', '-target', '8', '-Xlint:-options', '-classpath', $androidJar, '-d', $classes, ('@' + $sourceList))
$classesJar = Join-Path $buildRoot 'classes.jar'
Invoke-BuildTool (Join-Path $JavaHome 'bin/jar.exe') @('--create', '--file', $classesJar, '-C', $classes, '.')
Invoke-BuildTool $java @('-cp', $d8Jar, 'com.android.tools.r8.D8', '--min-api', '23', '--lib', $androidJar, '--output', $dex, $classesJar)

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::Open($unsignedApk, [IO.Compression.ZipArchiveMode]::Update)
try {
    # Windows aapt2 can emit backslashes for nested asset names. Always write ZIP-standard paths.
    Get-ChildItem -LiteralPath $assets -Recurse -File | ForEach-Object {
        $relative = $_.FullName.Substring($assets.Length + 1).Replace('\', '/')
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $_.FullName, ('assets/' + $relative), [IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
    Get-ChildItem -LiteralPath $dex -Filter '*.dex' | ForEach-Object {
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $_.FullName, $_.Name, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
} finally { $archive.Dispose() }

Write-Host 'Aligning and signing debug APK...'
Invoke-BuildTool $zipalign @('-f', '-P', '16', '4', $unsignedApk, $alignedApk)
$keystore = Join-Path $projectRoot '.tools/debug.keystore'
if (-not (Test-Path -LiteralPath $keystore)) {
    Invoke-BuildTool $keytool @('-genkeypair', '-keystore', $keystore, '-storepass', 'android', '-keypass', 'android', '-alias', 'androiddebugkey', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000', '-dname', 'CN=Android Debug,O=PocketSVE,C=CN')
}
Invoke-BuildTool $java @('-jar', $apksignerJar, 'sign', '--ks', $keystore, '--ks-key-alias', 'androiddebugkey', '--ks-pass', 'pass:android', '--key-pass', 'pass:android', '--out', $OutputPath, $alignedApk)
Invoke-BuildTool $zipalign @('-c', '-P', '16', '4', $OutputPath)
Invoke-BuildTool $java @('-jar', $apksignerJar, 'verify', '--verbose', '--print-certs', $OutputPath)
$hash = (Get-FileHash -LiteralPath $OutputPath -Algorithm SHA256).Hash
Write-Host "Built debug APK: $OutputPath"
Write-Host "SHA256: $hash"
