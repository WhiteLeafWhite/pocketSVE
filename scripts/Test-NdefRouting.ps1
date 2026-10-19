$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$jdk = Get-ChildItem -LiteralPath (Join-Path $projectRoot '.tools/java') -Directory | Where-Object { Test-Path (Join-Path $_.FullName 'bin/javac.exe') } | Select-Object -First 1
if (-not $jdk) { throw 'Project JDK not found.' }
$output = Join-Path $projectRoot ('build/ndef-test-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $output | Out-Null
& (Join-Path $jdk.FullName 'bin/javac.exe') -encoding UTF-8 -d $output (Join-Path $projectRoot 'app/src/main/java/io/pocketsve/app/PocketTagFormat.java') (Join-Path $projectRoot 'tests/PocketTagFormatTest.java')
if ($LASTEXITCODE -ne 0) { throw 'NDEF routing test compilation failed.' }
& (Join-Path $jdk.FullName 'bin/java.exe') -cp $output io.pocketsve.app.PocketTagFormatTest
if ($LASTEXITCODE -ne 0) { throw 'NDEF routing test failed.' }
