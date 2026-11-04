# Windows: powershell -NoProfile -ExecutionPolicy Bypass -File .\verify_local.ps1
# Offline fixtures only; never creates, deletes or resets owner private SQLite DBs.
param([switch]$CoreOnly)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$script = Join-Path $root 'scripts\verify_local.mjs'
if (-not (Test-Path -LiteralPath $script -PathType Leaf)) {
  Write-Error 'VERIFY_SCRIPT_MISSING'
  exit 2
}
$arguments = @($script)
if ($CoreOnly) { $arguments += '--core' }
& node @arguments
exit $LASTEXITCODE
