[CmdletBinding()]
param([string]$JavaHome)

$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $JavaHome) {
    $installedJdk = Get-ChildItem -LiteralPath (Join-Path $projectRoot '.tools/java') -Directory |
        Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'bin/javac.exe') } |
        Sort-Object Name -Descending | Select-Object -First 1
    if ($installedJdk) { $JavaHome = $installedJdk.FullName } else { $JavaHome = $env:JAVA_HOME }
}
if (-not $JavaHome) { throw 'Supply -JavaHome or install the project JDK.' }
$androidJar = Join-Path $projectRoot '.tools/android/platforms/android-35/android.jar'
$classes = Join-Path $projectRoot ('build/nfc-test-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $classes | Out-Null
$sources = @((Get-ChildItem -LiteralPath (Join-Path $projectRoot 'app/src/main/java') -Recurse -Filter '*.java').FullName)
$sources += @((Get-ChildItem -LiteralPath (Join-Path $projectRoot 'tests/native') -Recurse -Filter '*.java').FullName)
& (Join-Path $JavaHome 'bin/javac.exe') -encoding UTF-8 -source 8 -target 8 -Xlint:-options -cp $androidJar -d $classes @sources
if ($LASTEXITCODE -ne 0) { throw 'Native protocol test compilation failed.' }
$fixture = Get-Content -LiteralPath (Join-Path $projectRoot 'tests/fixtures/nfc-synthetic.json') -Raw | ConvertFrom-Json
if ($fixture.synthetic -ne $true) { throw 'This offline test accepts synthetic fixtures only.' }
$catalog = Get-Content -LiteralPath (Join-Path $projectRoot 'app/src/main/assets/data/nfc-cards.json') -Raw | ConvertFrom-Json
$card = $catalog.PSObject.Properties[$fixture.cardId].Value
if (-not $card) { throw 'Fixture card is absent from the local NFC catalog.' }
$readHex = @($fixture.reads5to27 | ForEach-Object { -join ($_ | ForEach-Object { '{0:X2}' -f [int]$_ }) })
$testArguments = @($fixture.uid, $fixture.payload, $card.password, $fixture.cardId, $fixture.authCommandHex) + $readHex
$classPath = $classes + [IO.Path]::PathSeparator + $androidJar
& (Join-Path $JavaHome 'bin/java.exe') -cp $classPath io.pocketsve.app.NativeCryptoCheck @testArguments
if ($LASTEXITCODE -ne 0) { throw 'Native protocol consistency check failed.' }
