$projectRoot = Split-Path -Parent $PSScriptRoot
$toolsRoot = Join-Path $projectRoot '.tools'
$toolLock = Get-Content (Join-Path $PSScriptRoot 'tools.lock.json') -Raw | ConvertFrom-Json
$env:JAVA_HOME = Join-Path $toolsRoot $toolLock.javaDirectory
$env:REA_JADX_MCP_JAR = Join-Path $toolsRoot $toolLock.jadxJar
$env:REA_APKTOOL_COMMAND = Join-Path $PSScriptRoot 'apktool.cmd'
$env:REA_ADB_PATH = Join-Path $toolsRoot 'android/platform-tools/adb.exe'
$env:npm_config_cache = Join-Path $toolsRoot 'npm-cache'
$environmentPaths = @(
    (Join-Path $toolsRoot $toolLock.nodeDirectory),
    (Join-Path $env:JAVA_HOME 'bin'),
    (Join-Path $toolsRoot 'android/platform-tools'),
    (Join-Path $toolsRoot 'rea/node_modules/.bin'),
    $PSScriptRoot
)
$existingPaths = @($env:PATH -split ';' | Where-Object { $_ -and $_ -notin $environmentPaths })
$env:PATH = ($environmentPaths + $existingPaths) -join ';'
