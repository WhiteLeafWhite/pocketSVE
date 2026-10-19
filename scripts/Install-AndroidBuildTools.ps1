[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$projectRoot = Split-Path -Parent $PSScriptRoot
$downloads = Join-Path $projectRoot '.tools/downloads'
New-Item -ItemType Directory -Force $downloads | Out-Null
$packages = @(
    @{ File = 'platform-35_r02.zip'; Url = 'https://dl.google.com/android/repository/platform-35_r02.zip'; Hash = '0bb560a90a7a2cbd0dd8348224d518b638fe7949'; Extract = '.tools/android/platforms'; Probe = '.tools/android/platforms/android-35/android.jar' },
    @{ File = 'build-tools_r35_windows.zip'; Url = 'https://dl.google.com/android/repository/build-tools_r35_windows.zip'; Hash = 'af059bb67cf7786f45ee0db85e2d24985df1b4b6'; Extract = '.tools/android/build-tools'; Probe = '.tools/android/build-tools/android-15/aapt2.exe' }
)
foreach ($package in $packages) {
    if (Test-Path -LiteralPath (Join-Path $projectRoot $package.Probe)) { continue }
    $archive = Join-Path $downloads $package.File
    if (-not (Test-Path -LiteralPath $archive)) { Invoke-WebRequest -Uri $package.Url -OutFile $archive -UseBasicParsing -TimeoutSec 600 }
    if ((Get-FileHash -LiteralPath $archive -Algorithm SHA1).Hash.ToLowerInvariant() -ne $package.Hash) { throw "Google SDK checksum mismatch: $archive" }
    $destination = Join-Path $projectRoot $package.Extract
    New-Item -ItemType Directory -Force $destination | Out-Null
    & tar.exe -xf $archive -C $destination
    if ($LASTEXITCODE -ne 0) { throw "SDK extraction failed: $archive" }
    Write-Host "Installed $($package.File)"
}
