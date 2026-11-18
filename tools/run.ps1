<#
.SYNOPSIS
Start the SilentAutumnSR server, the traffic proxy and the game client.

.DESCRIPTION
Rebuilds and starts the game server, frees the two ports from a previous run,
sets up the traffic path (FireFly proxy or launcher injection) and launches the
game.

.PARAMETER ClientDir
Path to the folder that contains StarRail.exe. Defaults to the one client
folder sitting next to this project.

.PARAMETER NoBuild
Skip the TypeScript build and start the existing dist output.

.PARAMETER NoGame
Do not configure or launch the game. With -Proxy, still start the proxy.

.PARAMETER Proxy
Use the FireFly traffic proxy instead of the launcher injection.

.EXAMPLE
run.bat
#>
param(
    [string]$ClientDir = '',
    [switch]$NoBuild,
    [switch]$NoGame,
    [switch]$Proxy
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$Root = Split-Path -Parent $PSScriptRoot
$Project = Split-Path -Parent $Root
$NodeBundled = Join-Path $Root 'runtime\node\node.exe'
# Filled in from tools/server-config.js once Node is resolved: a server started
# with server.config.json or SASR_* overrides must be probed on the same ports.
$HealthUrl = ''
$ProxyExe = Join-Path $Root 'FireFly.Proxy.v2\FireflySR.Tool.Proxy.exe'
$launcher = Join-Path $Root 'launcher\launcher.exe'

if (-not $NoGame -and -not $ClientDir) {
    # The client normally sits next to this project; look for the one folder that
    # actually contains StarRail.exe rather than guessing a version number.
    $found = Get-ChildItem -Path $Project -Directory -ErrorAction SilentlyContinue |
        Where-Object { Test-Path (Join-Path $_.FullName 'StarRail.exe') } |
        Select-Object -First 1
    $ClientDir = if ($found) { $found.FullName } else { Join-Path $Project '4.6' }
}

function Ok([string]$T) { Write-Host "    OK   $T" -ForegroundColor Green }
function Info([string]$T) { Write-Host "    ..   $T" -ForegroundColor Gray }
function Warn([string]$T) { Write-Host "    WARN $T" -ForegroundColor Yellow }
function Die([string]$T) {
    Write-Host ''
    Write-Host "ERROR: $T" -ForegroundColor Red
    Write-Host ''
    exit 1
}

function Resolve-Node {
    if (Test-Path $NodeBundled) { return $NodeBundled }
    $onPath = Get-Command node -ErrorAction SilentlyContinue
    if ($onPath) { return $onPath.Source }
    return $null
}

Write-Host ''
Write-Host '============================================================' -ForegroundColor White
Write-Host '  SilentAutumnSR - starting' -ForegroundColor White
Write-Host '============================================================' -ForegroundColor White
Write-Host ''

# ---- server ----------------------------------------------------------------

$node = Resolve-Node
if (-not $node) {
    Die @"
Node.js was not found.

    Run install.bat in this folder first - it downloads a private copy of
    Node.js into runtime\node and installs the dependencies, without touching
    your PATH and without needing administrator rights.
"@
}
Ok "Node.js: $(& $node --version)"

# Effective settings: same precedence as the server (server.config.json, then
# SASR_* environment variables, then defaults). Keeping one resolver means the
# launcher cannot probe the wrong port after someone changes the config.
Push-Location $Root
try {
    $ConfigJson = & $node 'tools\server-config.js' --json
    if ($LASTEXITCODE -ne 0 -or -not $ConfigJson) {
        Die 'could not resolve server settings - see the error above (tools\server-config.js)'
    }
    $Cfg = $ConfigJson | ConvertFrom-Json
} finally { Pop-Location }
$HealthUrl = $Cfg.healthUrl
$HttpPort = [int]$Cfg.http.port
$GamePort = [int]$Cfg.game.port
$HttpPublic = $Cfg.httpPublicHost
$GamePublic = $Cfg.gamePublicHost
Ok "dispatch http://${HttpPublic}:${HttpPort} / game ${GamePublic}:${GamePort}"
if ($HttpPort -ne 21000) {
    Warn "http port is $HttpPort, but the bundled launcher injects 127.0.0.1:21000 - use -Proxy (and edit FireFly.Proxy.v2\config.json) for a non-default port"
}

if (-not (Test-Path (Join-Path $Root 'node_modules\@nestjs\core'))) {
    Die @"
Dependencies are not installed (node_modules is missing).

    Run install.bat in this folder first.
"@
}

if (-not (Test-Path (Join-Path $Root 'src\proto\starrail.gen.js'))) {
    Die @"
The generated protocol code is missing (src\proto\starrail.gen.js).

    Run install.bat in this folder first.
"@
}

if (-not $NoBuild) {
    Write-Host ''
    Write-Host '[1] Building' -ForegroundColor Cyan
    Push-Location $Root
    try {
        & $node (Join-Path $Root 'tools\gen-registry.js') | Out-Null
        & $node (Join-Path $Root 'tools\build.js')
        if ($LASTEXITCODE -ne 0) { Die 'build failed - see the errors above.' }
    } finally { Pop-Location }
    Ok 'build finished'
}

Write-Host ''
Write-Host '[2] Making sure the ports are free' -ForegroundColor Cyan
Push-Location $Root
try {
    # Only touches processes listening on this project's ports (default
    # 23301 / 21000, see tools/server-config.js) - never a blanket
    # "kill all node", which would take down unrelated Node applications.
    & $node (Join-Path $Root 'tools\stop.js')
} catch {
    Warn "could not run the stop helper: $($_.Exception.Message)"
} finally { Pop-Location }

Write-Host ''
Write-Host '[3] Starting the server' -ForegroundColor Cyan
$server = Start-Process -FilePath $node `
    -ArgumentList @('dist\main.js') `
    -WorkingDirectory $Root `
    -PassThru
Info "server process id $($server.Id)"

$healthy = $false
$status = ''
foreach ($attempt in 1..45) {
    Start-Sleep -Seconds 1
    if ($server.HasExited) {
        Die "the server exited immediately (exit code $($server.ExitCode)). Start it manually with 'node dist\main.js' to see why."
    }
    try {
        $status = (Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 3).Content
        $healthy = $true
        break
    } catch { }
}
if (-not $healthy) {
    Warn 'the server has not answered within 45 seconds; check its window for errors'
} else {
    Ok 'server is up:'
    foreach ($line in ($status -split "`r?`n")) {
        if ($line.Trim()) { Write-Host "         $line" -ForegroundColor DarkGray }
    }
}

# ---- a stale system proxy must not survive --------------------------------

if (-not $NoGame -and -not $Proxy) {
    # If an earlier proxy run exited without restoring the setting, every https
    # request on the machine times out - the game shows "network timeout" and the
    # server sees nothing at all.
    try {
        $key = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings'
        $current = Get-ItemProperty -Path $key -ErrorAction SilentlyContinue
        if ($current.ProxyEnable -ne 0) {
            Set-ItemProperty -Path $key -Name ProxyEnable -Value 0 -Type DWord
            Set-ItemProperty -Path $key -Name ProxyServer -Value ''
            Ok 'cleared a leftover system proxy that would have broken https'
        }
        $stale = Get-Process -Name 'FireflySR.Tool.Proxy' -ErrorAction SilentlyContinue
        if ($stale) {
            $stale | ForEach-Object { try { $_.Kill() } catch { } }
            Info 'stopped a FireFly proxy left over from an earlier run'
        }
    } catch {
        Warn "could not check the system proxy setting: $($_.Exception.Message)"
    }
}

# ---- traffic path ----------------------------------------------------------
#
# Two ways, and they must not be mixed:
#
#   launcher : launcher.exe + hkrpg.dll rewrite the game's own URLs inside the
#              process. Nothing system-wide is touched.
#   -Proxy   : FireFly.Proxy.v2 MITMs *.bhsr.com / *.mihoyo.com through the
#              Windows system proxy. It works, but when that process exits while
#              the setting is still on, every https request on the machine
#              times out.

Write-Host ''
if ($Proxy) {
    Write-Host '[4] Starting the FireFly proxy' -ForegroundColor Cyan
} elseif (-not $NoGame) {
    Write-Host '[4] Pointing the client at this server' -ForegroundColor Cyan
}

if ($Proxy) {
    if (-not (Test-Path $ProxyExe)) {
        if ($NoGame) { Die "bundled proxy not found at $ProxyExe" }
        Warn "proxy not found at FireFly.Proxy.v2\FireflySR.Tool.Proxy.exe - start your own proxy"
    } else {
        $proxyDir = Split-Path -Parent $ProxyExe
        $already = Get-Process -Name 'FireflySR.Tool.Proxy' -ErrorAction SilentlyContinue
        if ($already) {
            Ok "traffic proxy is already running (pid $($already[0].Id)) - leaving it alone"
        } else {
            $isAdmin = ([Security.Principal.WindowsPrincipal] `
                    [Security.Principal.WindowsIdentity]::GetCurrent()
                ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
            try {
                if ($isAdmin) {
                    Start-Process -FilePath $ProxyExe -WorkingDirectory $proxyDir | Out-Null
                } else {
                    Info 'requesting administrator rights for the proxy (UAC prompt)'
                    Start-Process -FilePath 'powershell' -Verb RunAs -ArgumentList @(
                        '-NoProfile', '-Command',
                        "Start-Process -FilePath '$ProxyExe' -WorkingDirectory '$proxyDir'"
                    ) | Out-Null
                }
                Ok 'traffic proxy started'
                Warn 'accept the certificate prompt if Windows shows one'
                Warn 'IMPORTANT: close this proxy only via the proxy''s own exit, or https on this machine breaks'
            } catch {
                if ($NoGame) { Die "could not start the proxy: $($_.Exception.Message)" }
                Warn "could not start the proxy: $($_.Exception.Message)"
            }
        }
    }
} elseif ($NoGame) {
    # -NoGame without -Proxy: the server is up and nothing else is needed.
} elseif (-not (Test-Path $launcher)) {
    Warn "launcher not found at launcher\launcher.exe"
    Warn 'start the game through your own proxy instead, then launch StarRail.exe'
} elseif (-not (Test-Path $ClientDir)) {
    Warn "client folder not found: $ClientDir"
    Warn "pass it explicitly:  run.bat -ClientDir ""D:\path\to\Star Rail"""
} else {
    foreach ($file in 'launcher.exe', 'hkrpg.dll') {
        $target = Join-Path $ClientDir $file
        if (-not (Test-Path $target)) {
            Copy-Item (Join-Path $Root "launcher\$file") $target -Force
            Info "copied $file into the client folder"
        }
    }

    $already = Get-Process -Name StarRail -ErrorAction SilentlyContinue
    if ($already) {
        Warn 'StarRail.exe is already running - close it so the injector can start it'
    } else {
        try {
            Start-Process -FilePath (Join-Path $ClientDir 'launcher.exe') -WorkingDirectory $ClientDir | Out-Null
            Ok "game launched through the injector (client: $ClientDir)"
            Info 'hkrpg.dll always redirects to http://127.0.0.1:21000 (built into the prebuilt DLL), so the launcher path is local-only'
            Info "for a client on another device run this proxy there with DestinationHost = $HttpPublic / DestinationPort = $HttpPort"
        } catch {
            Warn "could not launch the game: $($_.Exception.Message)"
            Warn "start '$ClientDir\launcher.exe' manually as administrator"
        }
    }
}

# ---- summary ---------------------------------------------------------------

Write-Host ''
Write-Host '============================================================' -ForegroundColor Green
Write-Host '  SilentAutumnSR is running' -ForegroundColor Green
Write-Host ''
Write-Host '    dispatch / SDK : http://' -ForegroundColor Green -NoNewline
Write-Host "${HttpPublic}:${HttpPort}" -ForegroundColor Green
Write-Host '    game server    : ' -ForegroundColor Green -NoNewline
Write-Host "${GamePublic}:${GamePort}" -ForegroundColor Green
Write-Host ''
Write-Host '  Log in with any account name and password.' -ForegroundColor Green
Write-Host "  Server log: $($Cfg.logsDir)" -ForegroundColor Green
Write-Host '  Another device: same settings, but set this proxy''s DestinationHost to' -ForegroundColor Green
Write-Host "                 $HttpPublic and DestinationPort to $HttpPort" -ForegroundColor Green
Write-Host '  To stop everything, double-click stop.bat.' -ForegroundColor Green
Write-Host '============================================================' -ForegroundColor Green
Write-Host ''

if (-not $healthy) { exit 1 }
