[CmdletBinding()]
param([string]$Version = '0.4.0')
$ErrorActionPreference = 'Stop'
if ($Version -notmatch '^\d+\.\d+\.\d+$') { throw 'Version must be major.minor.patch.' }
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$destination = Join-Path $projectRoot ('dist/pocketSVE-v' + $Version + '-source.zip')
Add-Type -AssemblyName System.IO.Compression.FileSystem
$stream = [IO.File]::Open($destination, [IO.FileMode]::Create)
$archive = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create)
try {
    $files = @()
    foreach ($directory in @('app', 'docs', 'scripts', 'tests')) {
        $files += Get-ChildItem -LiteralPath (Join-Path $projectRoot $directory) -File -Recurse
    }
    foreach ($name in @('README.md', 'build.gradle', 'settings.gradle', '.gitignore', 'rea.ps1')) {
        $files += Get-Item -LiteralPath (Join-Path $projectRoot $name)
    }
    foreach ($file in $files) {
        $relative = [IO.Path]::GetRelativePath($projectRoot, $file.FullName).Replace('\', '/')
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.FullName, $relative, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
} finally { $archive.Dispose(); $stream.Dispose() }
Get-Item -LiteralPath $destination | Select-Object FullName, Length
Get-FileHash -LiteralPath $destination -Algorithm SHA256
