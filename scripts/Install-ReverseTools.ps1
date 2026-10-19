[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$projectRoot = Split-Path -Parent $PSScriptRoot
$toolsRoot = Join-Path $projectRoot '.tools'
$downloadRoot = Join-Path $toolsRoot 'downloads'
$lock = Get-Content (Join-Path $PSScriptRoot 'tools.lock.json') -Raw | ConvertFrom-Json
New-Item -ItemType Directory -Force $downloadRoot | Out-Null

function Get-VerifiedDownload {
    param($Tool)
    $destination = Join-Path $downloadRoot $Tool.file
    if (-not (Test-Path -LiteralPath $destination)) {
        Write-Host "Downloading $($Tool.name) $($Tool.version)..."
        Invoke-WebRequest -Uri $Tool.url -OutFile $destination -UseBasicParsing -TimeoutSec 600
    }
    $actual = (Get-FileHash -LiteralPath $destination -Algorithm $Tool.algorithm).Hash.ToLowerInvariant()
    if ($actual -ne $Tool.hash) { throw "Checksum mismatch: $destination. Remove this file and retry." }
    Write-Host "Verified $($Tool.name) ($($Tool.algorithm))."
    return $destination
}

foreach ($tool in $lock.downloads) {
    $archive = Get-VerifiedDownload $tool
    if ($tool.extractTo) {
        $directory = Join-Path $toolsRoot $tool.extractTo
        if (-not (Test-Path -LiteralPath (Join-Path $toolsRoot $tool.probe))) {
            New-Item -ItemType Directory -Force $directory | Out-Null
            & tar.exe -xf $archive -C $directory
            if ($LASTEXITCODE -ne 0) { throw "Extraction failed: $archive" }
        }
    }
}

$nodeDirectory = Join-Path $toolsRoot $lock.nodeDirectory
$env:PATH = "$nodeDirectory;$env:PATH"
$env:npm_config_cache = Join-Path $toolsRoot 'npm-cache'
& (Join-Path $nodeDirectory 'npm.cmd') install --prefix (Join-Path $toolsRoot 'rea') --cache $env:npm_config_cache --ignore-scripts --no-audit --no-fund --save-exact "rea-agents@$($lock.reaVersion)"
if ($LASTEXITCODE -ne 0) { throw 'REA npm installation failed.' }
Write-Host 'Tool installation completed.'
