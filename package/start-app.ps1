$ErrorActionPreference = "Stop"

$PackageDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Executable = Join-Path $PackageDir "BypassAIGC.exe"
$Python = Join-Path $PackageDir "venv\Scripts\python.exe"
$EntryPoint = Join-Path $PackageDir "main.py"

try {
    Invoke-WebRequest -Uri "http://127.0.0.1:9800/health" -UseBasicParsing -TimeoutSec 2 | Out-Null
} catch {
    if (Test-Path $Executable) {
        Start-Process -FilePath $Executable -WorkingDirectory $PackageDir -WindowStyle Hidden
    } elseif ((Test-Path $Python) -and (Test-Path $EntryPoint)) {
        Start-Process -FilePath $Python -ArgumentList "`"$EntryPoint`"" -WorkingDirectory $PackageDir -WindowStyle Hidden
    } else {
        throw "Missing BypassAIGC.exe or Python runtime."
    }
}

for ($attempt = 0; $attempt -lt 20; $attempt++) {
    Start-Sleep -Milliseconds 500
    try {
        Invoke-WebRequest -Uri "http://127.0.0.1:9800/health" -UseBasicParsing -TimeoutSec 2 | Out-Null
        Start-Process "http://127.0.0.1:9800/workspace"
        exit 0
    } catch {
    }
}

throw "BypassAIGC startup timed out; check the logs directory."
