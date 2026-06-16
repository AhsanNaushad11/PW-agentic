# =============================================================================
# PW-AGENTIC: Windows Redis Startup Script
# =============================================================================
# Downloads a portable Redis for Windows (tporadowski/redis) if not already
# present, then starts it on port 6379. This is the Windows equivalent of the
# bash "Verify Redis" task in .vscode/tasks.json.
#
# Redis for Windows: https://github.com/tporadowski/redis/releases
# =============================================================================

$ErrorActionPreference = "Stop"

$REDIS_PORT = 6379
# Use the workspace root (parent of scripts/) for .redis-win, not $PSScriptRoot
$WORKSPACE_ROOT = Split-Path -Parent $PSScriptRoot
$REDIS_DIR = Join-Path $WORKSPACE_ROOT ".redis-win"
$REDIS_SERVER = Join-Path $REDIS_DIR "redis-server.exe"
#$REDIS_CLI = Join-Path $REDIS_DIR "redis-cli.exe"
$REDIS_ZIP = Join-Path $REDIS_DIR "redis.zip"
$REDIS_VERSION = "7.2.4"
$REDIS_URL = "https://github.com/redis-windows/redis-windows/releases/download/${REDIS_VERSION}/Redis-${REDIS_VERSION}-Windows-x64-msys2.zip"

# --- Step 1: Check if Redis is already running ---
function Test-RedisAlive {
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $tcp.Connect("127.0.0.1", $REDIS_PORT)
        $tcp.Close()
        return $true
    } catch {
        return $false
    }
}

if (Test-RedisAlive) {
    Write-Host "[OK] Redis is already running on port $REDIS_PORT" -ForegroundColor Green
    exit 0
}

Write-Host "[WARN] Redis not detected on port $REDIS_PORT." -ForegroundColor Yellow

# --- Dynamic Discovery ---
$serverExe = Get-ChildItem -Path $REDIS_DIR -Filter "redis-server.exe" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
if ($serverExe) {
    $REDIS_SERVER = $serverExe.FullName
}

# --- Step 2: Download portable Redis if not present ---
if (-Not (Test-Path -LiteralPath $REDIS_SERVER)) {
    Write-Host "[INFO] Downloading portable Redis for Windows ($REDIS_VERSION)..." -ForegroundColor Cyan

    if (-Not (Test-Path -LiteralPath $REDIS_DIR)) {
        New-Item -ItemType Directory -Path $REDIS_DIR -Force | Out-Null
    }

    # Download the zip
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $REDIS_URL -OutFile $REDIS_ZIP -UseBasicParsing

    # Extract
    Write-Host "[INFO] Extracting..." -ForegroundColor Cyan
    Expand-Archive -LiteralPath $REDIS_ZIP -DestinationPath $REDIS_DIR -Force

    # Remove zip to save space
    Remove-Item -LiteralPath $REDIS_ZIP -Force -ErrorAction SilentlyContinue

    # Re-discover dynamically
    $serverExe = Get-ChildItem -Path $REDIS_DIR -Filter "redis-server.exe" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($serverExe) {
        $REDIS_SERVER = $serverExe.FullName
    }

    if (-Not (Test-Path -LiteralPath $REDIS_SERVER)) {
        Write-Host "[ERROR] Failed to extract Redis. redis-server.exe not found at $REDIS_SERVER" -ForegroundColor Red
        Write-Host "        Check that the ZIP contains redis-server.exe at the root level." -ForegroundColor Red
        exit 1
    }

    Write-Host "[OK] Redis for Windows extracted to $REDIS_DIR" -ForegroundColor Green
}

# --- Step 3: Start Redis ---
Write-Host "[INFO] Starting Redis on port $REDIS_PORT..." -ForegroundColor Cyan

# Start as a background process
Start-Process -FilePath $REDIS_SERVER -ArgumentList "--port $REDIS_PORT" -WindowStyle Hidden

# Wait for startup
Start-Sleep -Seconds 2

if (Test-RedisAlive) {
    Write-Host "[OK] Redis started successfully on port $REDIS_PORT" -ForegroundColor Green
    exit 0
} else {
    Write-Host "[ERROR] Redis failed to start. Check if port $REDIS_PORT is blocked." -ForegroundColor Red
    exit 1
}
