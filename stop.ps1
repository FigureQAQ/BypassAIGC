$ErrorActionPreference = "SilentlyContinue"

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$EnvPath = Join-Path $RootDir ".env"
$RuntimeDir = Join-Path $RootDir ".runtime"
$serverPort = 9800

if (Test-Path $EnvPath) {
    $line = Get-Content $EnvPath -Encoding UTF8 |
        Where-Object { $_ -match "^\s*SERVER_PORT\s*=" } |
        Select-Object -Last 1
    if ($line) {
        $configuredPort = ($line -split "=", 2)[1].Trim().Trim('"').Trim("'")
        if ($configuredPort -match "^\d+$") {
            $serverPort = [int]$configuredPort
        }
    }
}

foreach ($pidFile in @("backend.pid", "frontend.pid")) {
    $pidPath = Join-Path $RuntimeDir $pidFile
    if (Test-Path $pidPath) {
        $trackedPid = (Get-Content $pidPath -Raw).Trim()
        if ($trackedPid -match "^\d+$") {
            Stop-Process -Id ([int]$trackedPid) -Force -ErrorAction SilentlyContinue
            Write-Host "Stopped tracked process PID $trackedPid"
        }
        Remove-Item $pidPath -Force -ErrorAction SilentlyContinue
    }
}

foreach ($port in @($serverPort, 5174)) {
    $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($processId in @($connections | Select-Object -ExpandProperty OwningProcess -Unique)) {
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
        Write-Host "Stopped port $port (PID $processId)"
    }
}

Write-Host "BypassAIGC services stopped."
$global:LASTEXITCODE = 0
