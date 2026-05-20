# AI Writing Assistant - one-click startup
$ErrorActionPreference = "Stop"

function Enable-Utf8Console {
    try {
        chcp 65001 | Out-Null
        $utf8NoBom = New-Object System.Text.UTF8Encoding $false
        [Console]::InputEncoding = $utf8NoBom
        [Console]::OutputEncoding = $utf8NoBom
        $script:OutputEncoding = $utf8NoBom
    } catch {
        Write-Warning "Unable to switch the console to UTF-8: $($_.Exception.Message)"
    }

    $env:PYTHONUTF8 = "1"
    $env:PYTHONIOENCODING = "utf-8"
    $env:NPM_CONFIG_UNICODE = "true"
}

function New-Utf8PowerShellCommand {
    param([string[]]$CommandParts)

    $bootstrap = @(
        "chcp 65001 | Out-Null",
        "`$utf8NoBom = New-Object System.Text.UTF8Encoding `$false",
        "[Console]::InputEncoding = `$utf8NoBom",
        "[Console]::OutputEncoding = `$utf8NoBom",
        "`$OutputEncoding = `$utf8NoBom",
        "`$env:PYTHONUTF8 = '1'",
        "`$env:PYTHONIOENCODING = 'utf-8'",
        "`$env:NPM_CONFIG_UNICODE = 'true'"
    )

    return ($bootstrap + $CommandParts) -join "; "
}

Enable-Utf8Console

$PackageDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Join-Path $PackageDir "backend"
$FrontendDir = Join-Path $PackageDir "frontend"
$DesktopEnv = "C:\Users\Administrator\Desktop\.env"
$PackageEnv = Join-Path $PackageDir ".env"
$BackendEnv = Join-Path $BackendDir ".env"

function Stop-PortProcess {
    param([int]$Port)
    $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    $processIds = @($connections | Select-Object -ExpandProperty OwningProcess -Unique)
    foreach ($processId in $processIds) {
        try {
            Stop-Process -Id $processId -Force -Confirm:$false
            Write-Host "Stopped old process on port $Port, PID=$processId"
        } catch {}
    }
}

function Wait-Url {
    param(
        [string]$Url,
        [int]$TimeoutSeconds = 30
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
                return $true
            }
        } catch {}
        Start-Sleep -Seconds 1
    }
    return $false
}

function Wait-FrontendUrl {
    param(
        [int]$StartPort = 5174,
        [int]$PortCount = 10,
        [int]$TimeoutSeconds = 60
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        for ($port = $StartPort; $port -lt ($StartPort + $PortCount); $port++) {
            $url = "http://localhost:$port"
            try {
                $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3
                if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
                    return $url
                }
            } catch {}
        }
        Start-Sleep -Seconds 1
    }

    return $null
}

Write-Host "=== AI Writing Assistant Startup ==="
Write-Host "Package directory: $PackageDir"

if (Test-Path $DesktopEnv) {
    Copy-Item -Path $DesktopEnv -Destination $PackageEnv -Force
    Copy-Item -Path $DesktopEnv -Destination $BackendEnv -Force
    Write-Host "Synced Desktop .env to package and backend directories."
} elseif (-not (Test-Path $BackendEnv)) {
    Write-Warning "No .env file found at Desktop or backend directory."
}

Stop-PortProcess -Port 9800
Stop-PortProcess -Port 5174
Start-Sleep -Seconds 1

$env:PYTHONPATH = $BackendDir
$backendCommand = New-Utf8PowerShellCommand @(
    "`$env:PYTHONPATH = '$BackendDir'",
    "python -m uvicorn app.main:app --host 0.0.0.0 --port 9800"
)
Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-NoExit", "-Command", $backendCommand) -WorkingDirectory $BackendDir -WindowStyle Normal
Write-Host "Starting backend at http://localhost:9800 ..."

if (-not (Wait-Url -Url "http://localhost:9800/health" -TimeoutSeconds 40)) {
    Write-Warning "Backend health check timed out. Check the backend window."
} else {
    Write-Host "Backend started."
}

if (-not (Test-Path (Join-Path $FrontendDir "node_modules"))) {
    Write-Host "Frontend dependencies not found. Running npm ci ..."
    Push-Location $FrontendDir
    npm ci
    Pop-Location
}

$frontendCommand = New-Utf8PowerShellCommand @(
    "npm.cmd run dev"
)
Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-NoExit", "-Command", $frontendCommand) -WorkingDirectory $FrontendDir -WindowStyle Normal
Write-Host "Starting frontend at http://localhost:5174 ..."

$FrontendUrl = Wait-FrontendUrl -StartPort 5174 -PortCount 10 -TimeoutSeconds 60
if (-not $FrontendUrl) {
    Write-Warning "Frontend check timed out. Check the frontend window."
} else {
    Write-Host "Frontend started at $FrontendUrl"
    Start-Process $FrontendUrl
}

Write-Host ""
$DisplayFrontendUrl = if ($FrontendUrl) { $FrontendUrl } else { "http://localhost:5174" }
Write-Host "User UI: $DisplayFrontendUrl"
Write-Host "Admin UI: $DisplayFrontendUrl/admin"
Write-Host "API docs: http://localhost:9800/docs"
Write-Host ""
Write-Host "To stop the app, close the backend and frontend command windows."
Read-Host "Press Enter to close this startup window. Service windows will keep running"
