$ErrorActionPreference = "Stop"

$PackageDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $PackageDir
$RootStartScript = Join-Path $RootDir "start.ps1"

if (-not (Test-Path $RootStartScript)) {
    throw "Missing root startup script: $RootStartScript"
}

Write-Host "Using the simplified root startup flow..."
& $RootStartScript
