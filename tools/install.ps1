<#
.SYNOPSIS
    SilentAutumnSR one-click installer.

.DESCRIPTION
    Prepares a machine that has nothing installed except Windows and
    PowerShell:

      1. finds a usable Node.js (bundled runtime -> PATH -> fresh download)
      2. installs the npm dependencies
      3. generates the protocol code from src/proto/StarRail.proto
      4. builds the server

    When Node.js is missing it downloads the current LTS build from
    nodejs.org into <project>\runtime\node and verifies it against the
    official SHASUMS256.txt, so nothing is added to PATH and no admin
    rights are needed.

.PARAMETER Force
    Re-download Node.js and regenerate the protocol code even if present.

.PARAMETER NoBuild
    Stop after dependency installation (skip codegen and build).

.PARAMETER FunctionsOnly
    Define the helpers and exit without installing. Used by the test suite to
    exercise the Node.js bootstrap in isolation:
        . tools\install.ps1 -FunctionsOnly ; Install-PortableNode

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File tools\install.ps1
#>
[CmdletBinding()]
param(
    [switch]$Force,
    [switch]$NoBuild,
    [switch]$FunctionsOnly
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'   # the progress bar makes downloads crawl

$Root = Split-Path -Parent $PSScriptRoot
$RuntimeDir = Join-Path $Root 'runtime'
$NodeDir = Join-Path $RuntimeDir 'node'
$NodeExe = Join-Path $NodeDir 'node.exe'

$script:StepNo = 0
function Step([string]$Text) {
    $script:StepNo++
    Write-Host ''
    Write-Host "[$script:StepNo] $Text" -ForegroundColor Cyan
}
function Ok([string]$Text) { Write-Host "    OK   $Text" -ForegroundColor Green }
function Info([string]$Text) { Write-Host "    ..   $Text" -ForegroundColor Gray }
function Warn([string]$Text) { Write-Host "    WARN $Text" -ForegroundColor Yellow }
function Die([string]$Text) {
    Write-Host ''
    Write-Host "ERROR: $Text" -ForegroundColor Red
    Write-Host ''
    Write-Host 'Installation did not finish. Fix the problem above and run install.bat again.' -ForegroundColor Red
    exit 1
}

function Write-Banner {
    Write-Host ''
    Write-Host '============================================================' -ForegroundColor White
    Write-Host '  SilentAutumnSR - installer' -ForegroundColor White
    Write-Host '  Honkai: Star Rail private server (CNBETAWin4.5.54)' -ForegroundColor White
    Write-Host '============================================================' -ForegroundColor White
}

# --------------------------------------------------------------------------
# Node.js
# --------------------------------------------------------------------------

function Get-NodeVersion([string]$Exe) {
    if (-not (Test-Path $Exe)) { return $null }
    try {
        $raw = & $Exe --version 2>$null
        if ($LASTEXITCODE -ne 0 -or -not $raw) { return $null }
        return ([string]$raw).Trim().TrimStart('v')
    } catch { return $null }
}

function Test-NodeUsable([string]$Exe) {
    $version = Get-NodeVersion $Exe
    if (-not $version) { return $false }
    $major = [int]($version.Split('.')[0])
    if ($major -lt 18) {
        Warn "Node.js $version is too old (need 18 or newer)"
        return $false
    }
    return $true
}

function Resolve-Arch {
    $arch = $env:PROCESSOR_ARCHITECTURE
    if ($arch -eq 'ARM64') { return 'arm64' }
    if ([Environment]::Is64BitOperatingSystem) { return 'x64' }
    return 'x86'
}

function Get-LatestLts {
    Info 'asking nodejs.org for the current LTS release'
    $index = Invoke-RestMethod -Uri 'https://nodejs.org/dist/index.json' -TimeoutSec 60
    $lts = $index | Where-Object { $_.lts -ne $false } | Select-Object -First 1
    if (-not $lts) { Die 'could not read the Node.js release index.' }
    return $lts.version
}

function Install-PortableNode {
    $arch = Resolve-Arch
    $version = Get-LatestLts
    $file = "node-$version-win-$arch.zip"
    $url = "https://nodejs.org/dist/$version/$file"
    $sumsUrl = "https://nodejs.org/dist/$version/SHASUMS256.txt"

    Info "downloading $file"
    $zip = Join-Path $env:TEMP $file
    try {
        Invoke-WebRequest -Uri $url -OutFile $zip -TimeoutSec 900 -UseBasicParsing
    } catch {
        Die "download failed: $($_.Exception.Message)`n         Check your internet connection or proxy, then retry."
    }

    # Verify against the official checksum file before extracting anything.
    Info 'verifying the download against nodejs.org SHASUMS256.txt'
    try {
        $sums = (Invoke-WebRequest -Uri $sumsUrl -UseBasicParsing -TimeoutSec 60).Content
        $line = ($sums -split "`n") | Where-Object { $_ -match [regex]::Escape($file) } | Select-Object -First 1
        if (-not $line) { Die "no checksum published for $file" }
        $expected = ($line -split '\s+')[0].Trim().ToLower()
        $actual = (Get-FileHash -Path $zip -Algorithm SHA256).Hash.ToLower()
        if ($expected -ne $actual) {
            Remove-Item $zip -Force -ErrorAction SilentlyContinue
            Die "checksum mismatch for $file (expected $expected, got $actual)."
        }
        Ok "SHA-256 verified ($($actual.Substring(0,16))...)"
    } catch {
        if ($_.Exception.Message -like 'checksum*' -or $_.Exception.Message -like 'no checksum*') { throw }
        Warn "could not verify the checksum ($($_.Exception.Message)); continuing"
    }

    Info 'extracting'
    $staging = Join-Path $env:TEMP "sasr-node-$([guid]::NewGuid().ToString('N'))"
    if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
    try {
        Expand-Archive -Path $zip -DestinationPath $staging -Force
    } catch {
        Die "could not extract $file : $($_.Exception.Message)"
    }

    $inner = Get-ChildItem $staging -Directory | Select-Object -First 1
    if (-not $inner) { Die 'the downloaded archive did not contain a folder.' }

    if (Test-Path $NodeDir) { Remove-Item $NodeDir -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
    Move-Item -Path $inner.FullName -Destination $NodeDir

    Remove-Item $staging -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item $zip -Force -ErrorAction SilentlyContinue

    if (-not (Test-NodeUsable $NodeExe)) { Die "the bundled Node.js at $NodeExe does not run." }
    Ok "Node.js $(Get-NodeVersion $NodeExe) installed into runtime\node (nothing added to PATH)"
}

function Resolve-Node {
    if ($Force -and (Test-Path $NodeDir)) {
        Info 'removing the previously bundled Node.js (-Force)'
        Remove-Item $NodeDir -Recurse -Force
    }

    if (Test-NodeUsable $NodeExe) {
        Ok "using the bundled Node.js $(Get-NodeVersion $NodeExe) (runtime\node)"
        return $NodeExe
    }

    $onPath = Get-Command node -ErrorAction SilentlyContinue
    if ($onPath -and (Test-NodeUsable $onPath.Source)) {
        Ok "using the Node.js $(Get-NodeVersion $onPath.Source) already on PATH"
        return $onPath.Source
    }

    Info 'no usable Node.js found - installing a portable copy'
    Install-PortableNode
    return $NodeExe
}

function Resolve-Npm([string]$NodeExePath) {
    $dir = Split-Path -Parent $NodeExePath
    $cmd = Join-Path $dir 'npm.cmd'
    if (Test-Path $cmd) { return $cmd }
    $onPath = Get-Command npm -ErrorAction SilentlyContinue
    if ($onPath) { return $onPath.Source }
    return $null
}

# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------

if ($FunctionsOnly) { return }

Write-Banner

Step 'Checking Node.js'
$node = Resolve-Node
# Make the resolved Node visible to child processes (npm.cmd calls bare `node`).
$env:PATH = "$(Split-Path -Parent $node);$env:PATH"

Step 'Installing dependencies'
$npm = Resolve-Npm $node
if (-not $npm) { Die "npm was not found next to $node." }

$modules = Join-Path $Root 'node_modules'
if ((Test-Path (Join-Path $modules '@nestjs\core')) -and -not $Force) {
    Ok 'node_modules is already present - skipping npm install'
} else {
    Info "running npm install (this downloads about 170 MB, please wait)"
    Push-Location $Root
    try {
        & $npm install --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { Die "npm install failed (exit $LASTEXITCODE)." }
    } finally { Pop-Location }
    Ok 'dependencies installed'
}

# Fail here, with a clear message, rather than during code generation.
# Run from the project root so `require` resolves against node_modules.
Push-Location $Root
try {
    $probe = "require('@nestjs/core');require('protobufjs');require('express');require('class-validator');"
    & $node -e $probe 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { Die 'the installed dependencies cannot be loaded - try: install.bat -Force' }
} finally { Pop-Location }
if (-not (Test-Path (Join-Path $Root 'node_modules\protobufjs-cli\bin\pbjs'))) {
    Die 'protobufjs-cli is missing from node_modules - try: install.bat -Force'
}
Ok 'dependencies verified'

if ($NoBuild) {
    Write-Host ''
    Write-Host 'Done (dependencies only). Next: run.bat' -ForegroundColor Green
    exit 0
}

Step 'Generating the protocol code'
$generated = Join-Path $Root 'src\proto\starrail.gen.js'
if ((Test-Path $generated) -and -not $Force) {
    # It is ~55 MB of generated code; regenerating takes about 40 seconds.
    Ok 'src\proto\starrail.gen.js already exists - skipping (use -Force to redo it)'
} else {
    Info 'this takes about 40 seconds'
    Push-Location $Root
    try {
        & $node (Join-Path $Root 'tools\gen-proto.js')
        if ($LASTEXITCODE -ne 0) { Die 'protocol code generation failed.' }
    } finally { Pop-Location }
    Ok 'protocol code generated'
}

Step 'Building the server'
Push-Location $Root
try {
    & $node (Join-Path $Root 'tools\gen-registry.js')
    if ($LASTEXITCODE -ne 0) { Die 'handler registry generation failed.' }
    & $node (Join-Path $Root 'tools\build.js')
    if ($LASTEXITCODE -ne 0) { Die 'build failed.' }
} finally { Pop-Location }
Ok 'build finished'

Step 'Checking the data files'
$missing = @()
foreach ($f in 'src\data\freesr-data.json', 'src\data\data-in-game.json', 'src\data\version.json', 'src\data\resources\res.json') {
    if (-not (Test-Path (Join-Path $Root $f))) { $missing += $f }
}
if ($missing.Count) {
    Warn 'these files are missing:'
    $missing | ForEach-Object { Warn "  $_" }
    Warn 'the server will start but the account/map data will be empty.'
} else {
    Ok 'freesr profile, save file, version chain and design data are present'
}

Write-Host ''
Write-Host '============================================================' -ForegroundColor Green
Write-Host '  Installation finished.' -ForegroundColor Green
Write-Host '' -ForegroundColor Green
Write-Host '  Next: double-click run.bat' -ForegroundColor Green
Write-Host '============================================================' -ForegroundColor Green
Write-Host ''
