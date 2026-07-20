$ErrorActionPreference = "Stop"

try {
    chcp 65001 | Out-Null
    $utf8 = New-Object System.Text.UTF8Encoding $false
    [Console]::InputEncoding = $utf8
    [Console]::OutputEncoding = $utf8
    $OutputEncoding = $utf8
} catch {
}

$env:PYTHONUTF8 = "1"
$env:PYTHONIOENCODING = "utf-8"
$env:NPM_CONFIG_UNICODE = "true"

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Join-Path $RootDir "package\backend"
$FrontendDir = Join-Path $RootDir "package\frontend"
$EnvPath = Join-Path $RootDir ".env"
$VenvDir = Join-Path $RootDir ".venv"
$VenvPython = Join-Path $VenvDir "Scripts\python.exe"
$RequirementsPath = Join-Path $BackendDir "requirements.txt"
$PackageLockPath = Join-Path $FrontendDir "package-lock.json"
$BackendStamp = Join-Path $VenvDir ".requirements.sha256"
$FrontendStamp = Join-Path $FrontendDir "node_modules\.package-lock.sha256"
$RuntimeDir = Join-Path $RootDir ".runtime"
$BackendPidPath = Join-Path $RuntimeDir "backend.pid"
$FrontendPidPath = Join-Path $RuntimeDir "frontend.pid"

function Stop-PortProcess {
    param([int]$Port)

    $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    foreach ($processId in @($connections | Select-Object -ExpandProperty OwningProcess -Unique)) {
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
}

function Stop-TrackedProcess {
    param([string]$PidPath)

    if (-not (Test-Path $PidPath)) {
        return
    }
    $trackedPid = (Get-Content $PidPath -Raw).Trim()
    if ($trackedPid -match "^\d+$") {
        Stop-Process -Id ([int]$trackedPid) -Force -ErrorAction SilentlyContinue
    }
    Remove-Item $PidPath -Force -ErrorAction SilentlyContinue
}

function Get-EnvValue {
    param([string]$Name, [string]$DefaultValue)

    if (-not (Test-Path $EnvPath)) {
        return $DefaultValue
    }
    $line = Get-Content $EnvPath -Encoding UTF8 |
        Where-Object { $_ -match "^\s*$([Regex]::Escape($Name))\s*=" } |
        Select-Object -Last 1
    if (-not $line) {
        return $DefaultValue
    }
    $value = ($line -split "=", 2)[1].Trim().Trim('"').Trim("'")
    if ([string]::IsNullOrWhiteSpace($value)) {
        return $DefaultValue
    }
    return $value
}

function Get-PowerShellLiteral {
    param([string]$Value)
    return "'" + $Value.Replace("'", "''") + "'"
}

if (-not (Test-Path $EnvPath)) {
    Write-Host "No .env file found. Starting quick setup..." -ForegroundColor Yellow
    & (Join-Path $RootDir "setup.ps1")
}

$apiKey = Get-EnvValue "OPENAI_API_KEY" ""
if ([string]::IsNullOrWhiteSpace($apiKey) -or $apiKey -like "replace-*") {
    Write-Host "OPENAI_API_KEY is not configured." -ForegroundColor Red
    Write-Host "Run setup.bat, or edit .env in the repository root."
    exit 1
}

$pythonCommand = Get-Command python -ErrorAction SilentlyContinue
if (-not $pythonCommand) {
    throw "Python 3.9+ was not found in PATH."
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "Node.js 18+ and npm were not found in PATH."
}

if (-not (Test-Path $VenvPython)) {
    Write-Host "[1/4] Creating Python environment..."
    & $pythonCommand.Source -m venv $VenvDir
}

$requirementsHash = (Get-FileHash $RequirementsPath -Algorithm SHA256).Hash
$installedRequirementsHash = if (Test-Path $BackendStamp) {
    (Get-Content $BackendStamp -Raw).Trim()
} else {
    ""
}
if ($requirementsHash -ne $installedRequirementsHash) {
    Write-Host "[2/4] Installing backend dependencies..."
    & $VenvPython -m pip install --disable-pip-version-check -r $RequirementsPath
    if ($LASTEXITCODE -ne 0) {
        throw "Backend dependency installation failed."
    }
    Set-Content -Path $BackendStamp -Value $requirementsHash -Encoding ASCII
} else {
    Write-Host "[2/4] Backend dependencies are ready."
}

$packageLockHash = (Get-FileHash $PackageLockPath -Algorithm SHA256).Hash
$installedPackageLockHash = if (Test-Path $FrontendStamp) {
    (Get-Content $FrontendStamp -Raw).Trim()
} else {
    ""
}
if ($packageLockHash -ne $installedPackageLockHash) {
    Write-Host "[3/4] Installing frontend dependencies..."
    Push-Location $FrontendDir
    try {
        npm ci --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) {
            throw "Frontend dependency installation failed."
        }
    } finally {
        Pop-Location
    }
    Set-Content -Path $FrontendStamp -Value $packageLockHash -Encoding ASCII
} else {
    Write-Host "[3/4] Frontend dependencies are ready."
}

$serverPort = [int](Get-EnvValue "SERVER_PORT" "9800")
$serverHost = Get-EnvValue "SERVER_HOST" "127.0.0.1"
$frontendPort = 5174
New-Item -ItemType Directory -Path $RuntimeDir -Force | Out-Null
Stop-TrackedProcess $BackendPidPath
Stop-TrackedProcess $FrontendPidPath
Stop-PortProcess $serverPort
Stop-PortProcess $frontendPort

$quotedEnvPath = Get-PowerShellLiteral $EnvPath
$quotedBackendDir = Get-PowerShellLiteral $BackendDir
$quotedPython = Get-PowerShellLiteral $VenvPython
$backendCommand = @(
    "chcp 65001 | Out-Null",
    "`$env:PYTHONUTF8='1'",
    "`$env:PYTHONIOENCODING='utf-8'",
    "`$env:PYTHONPATH=$quotedBackendDir",
    "`$env:BYPASSAIGC_ENV_FILE=$quotedEnvPath",
    "& $quotedPython -m uvicorn app.main:app --host $serverHost --port $serverPort"
) -join "; "

$quotedFrontendDir = Get-PowerShellLiteral $FrontendDir
$frontendCommand = @(
    "chcp 65001 | Out-Null",
    "`$env:NPM_CONFIG_UNICODE='true'",
    "`$env:VITE_API_TARGET='http://127.0.0.1:$serverPort'",
    "Set-Location $quotedFrontendDir",
    "npm run dev -- --host 127.0.0.1 --port $frontendPort"
) -join "; "

Write-Host "[4/4] Starting BypassAIGC..."
$windowStyle = "Normal"
if ($env:BYPASSAIGC_BACKGROUND -eq "1") {
    $windowStyle = "Hidden"
}
$backendProcess = Start-Process powershell.exe -ArgumentList @(
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-NoExit", "-Command", $backendCommand
) -WorkingDirectory $BackendDir -WindowStyle $windowStyle -PassThru
$frontendProcess = Start-Process powershell.exe -ArgumentList @(
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-NoExit", "-Command", $frontendCommand
) -WorkingDirectory $FrontendDir -WindowStyle $windowStyle -PassThru
Set-Content -Path $BackendPidPath -Value $backendProcess.Id -Encoding ASCII
Set-Content -Path $FrontendPidPath -Value $frontendProcess.Id -Encoding ASCII

$frontendUrl = "http://127.0.0.1:$frontendPort"
$localAccessKey = Get-EnvValue "LOCAL_ACCESS_KEY" ""
$openUrl = $frontendUrl
if (-not [string]::IsNullOrWhiteSpace($localAccessKey)) {
    $openUrl = "$frontendUrl/access/$([Uri]::EscapeDataString($localAccessKey))"
}
$backendUrl = "http://127.0.0.1:$serverPort/health"
$backendReady = $false
$frontendReady = $false
for ($attempt = 0; $attempt -lt 120; $attempt++) {
    Start-Sleep -Milliseconds 500
    if (-not $backendReady) {
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri $backendUrl -TimeoutSec 1
            $backendReady = $response.StatusCode -eq 200
        } catch {
        }
    }
    if (-not $frontendReady) {
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri $frontendUrl -TimeoutSec 1
            $frontendReady = $response.StatusCode -eq 200
        } catch {
        }
    }
    if ($backendReady -and $frontendReady) {
        break
    }
    if ($backendProcess.HasExited -or $frontendProcess.HasExited) {
        break
    }
}

if (-not $backendReady -or -not $frontendReady) {
    Stop-TrackedProcess $BackendPidPath
    Stop-TrackedProcess $FrontendPidPath
    Stop-PortProcess $serverPort
    Stop-PortProcess $frontendPort
    throw "Startup failed. Backend ready: $backendReady; frontend ready: $frontendReady"
}

if ($env:BYPASSAIGC_NO_BROWSER -ne "1") {
    Start-Process $openUrl
}
Write-Host ""
Write-Host "BypassAIGC is running:" -ForegroundColor Green
Write-Host "  User interface: $openUrl"
Write-Host "  Admin:         $frontendUrl/admin"
Write-Host "  API docs:      http://127.0.0.1:$serverPort/docs"
Write-Host ""
Write-Host "Run stop.bat to stop both services."
$global:LASTEXITCODE = 0
