param(
    [string]$ApiKey,
    [string]$BaseUrl,
    [string]$Model,
    [string]$AdminPassword,
    [switch]$Force
)

$ErrorActionPreference = "Stop"

try {
    chcp 65001 | Out-Null
    $utf8 = New-Object System.Text.UTF8Encoding $false
    [Console]::InputEncoding = $utf8
    [Console]::OutputEncoding = $utf8
    $OutputEncoding = $utf8
} catch {
}

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$TemplatePath = Join-Path $RootDir ".env.example"
$EnvPath = Join-Path $RootDir ".env"

function Set-EnvValue {
    param(
        [string]$Content,
        [string]$Name,
        [string]$Value
    )

    $escapedValue = $Value.Replace("\", "\\").Replace('"', '\"')
    $line = "$Name=`"$escapedValue`""
    $pattern = "(?m)^" + [Regex]::Escape($Name) + "=.*$"
    if ([Regex]::IsMatch($Content, $pattern)) {
        return [Regex]::Replace($Content, $pattern, $line)
    }
    return $Content.TrimEnd() + [Environment]::NewLine + $line + [Environment]::NewLine
}

if (-not (Test-Path $TemplatePath)) {
    throw "Missing configuration template: $TemplatePath"
}

if ((Test-Path $EnvPath) -and -not $Force) {
    $overwrite = Read-Host ".env already exists. Reconfigure it? [y/N]"
    if ($overwrite -notin @("y", "Y", "yes", "YES")) {
        Write-Host "Configuration unchanged: $EnvPath"
        exit 0
    }
}

Write-Host ""
Write-Host "BypassAIGC quick setup"
Write-Host "Only an OpenAI-compatible API is required."
Write-Host ""

if ([string]::IsNullOrWhiteSpace($ApiKey)) {
    $ApiKey = Read-Host "API key"
}
if ([string]::IsNullOrWhiteSpace($ApiKey)) {
    throw "API key cannot be empty."
}

if ([string]::IsNullOrWhiteSpace($BaseUrl)) {
    $BaseUrl = Read-Host "API base URL [https://api.openai.com/v1]"
}
if ([string]::IsNullOrWhiteSpace($BaseUrl)) {
    $BaseUrl = "https://api.openai.com/v1"
}

if ([string]::IsNullOrWhiteSpace($Model)) {
    $Model = Read-Host "Model name [gpt-5]"
}
if ([string]::IsNullOrWhiteSpace($Model)) {
    $Model = "gpt-5"
}

if ([string]::IsNullOrWhiteSpace($AdminPassword)) {
    $AdminPassword = Read-Host "Admin password [auto-generate]"
}
if ([string]::IsNullOrWhiteSpace($AdminPassword)) {
    $AdminPassword = ([Guid]::NewGuid().ToString("N") + [Guid]::NewGuid().ToString("N")).Substring(0, 24)
}

$secretKey = [Guid]::NewGuid().ToString("N") + [Guid]::NewGuid().ToString("N")
$localAccessKey = "local-" + [Guid]::NewGuid().ToString("N").Substring(0, 16)
$content = Get-Content $TemplatePath -Raw -Encoding UTF8
$content = Set-EnvValue $content "OPENAI_API_KEY" $ApiKey.Trim()
$content = Set-EnvValue $content "OPENAI_BASE_URL" $BaseUrl.TrimEnd("/")
$content = Set-EnvValue $content "POLISH_MODEL" $Model.Trim()
$content = Set-EnvValue $content "ENHANCE_MODEL" $Model.Trim()
$content = Set-EnvValue $content "COMPRESSION_MODEL" $Model.Trim()
$content = Set-EnvValue $content "AUTO_CREATE_LOCAL_USER" "true"
$content = Set-EnvValue $content "LOCAL_ACCESS_KEY" $localAccessKey
$content = Set-EnvValue $content "SECRET_KEY" $secretKey
$content = Set-EnvValue $content "ADMIN_PASSWORD" $AdminPassword

[System.IO.File]::WriteAllText($EnvPath, $content, (New-Object System.Text.UTF8Encoding $false))

Write-Host ""
Write-Host "Configuration saved: $EnvPath" -ForegroundColor Green
Write-Host "Admin user: admin"
Write-Host "Admin password: $AdminPassword" -ForegroundColor Yellow
Write-Host "Local access key: $localAccessKey" -ForegroundColor Cyan
Write-Host ""
Write-Host "Run start.bat to launch the application."
$global:LASTEXITCODE = 0
