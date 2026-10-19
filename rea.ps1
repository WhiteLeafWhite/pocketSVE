. (Join-Path $PSScriptRoot 'scripts/Enter-ReverseEnv.ps1')
& node (Join-Path $PSScriptRoot '.tools/rea/node_modules/rea-agents/scripts/rea.mjs') @args
exit $LASTEXITCODE
