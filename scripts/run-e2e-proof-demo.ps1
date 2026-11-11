[CmdletBinding()]
param(
    [switch]$UsePrebuiltWasm
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$proposalFile = [System.IO.Path]::GetTempFileName()
$preparedFile = [System.IO.Path]::GetTempFileName()
$previousProposal = $env:HANDEL_DEMO_PROPOSAL_FILE
$previousPrepared = $env:HANDEL_DEMO_PREPARED_FILE
$locationPushed = $false

function Invoke-Checked {
    param([string]$Command, [scriptblock]$Action)
    Write-Host ""
    Write-Host "== $Command =="
    & $Action
    if ($LASTEXITCODE -ne 0) {
        throw "$Command failed with exit code $LASTEXITCODE"
    }
}

try {
    if (-not $env:NEARAI_API_KEY) {
        throw "Set NEARAI_API_KEY in this PowerShell session. Do not paste it into source files or chat."
    }
    $nodeVersion = (node --version).TrimStart("v")
    if ([version]$nodeVersion -lt [version]"24.22.1") {
        throw "Node.js 24.22.1 or newer is required; found $nodeVersion"
    }
    if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
        throw "Rust/Cargo is required."
    }
    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        throw "npm is required."
    }
    if (-not $UsePrebuiltWasm -and -not (Get-Command cargo-near -ErrorAction SilentlyContinue)) {
        $installer = Join-Path $env:TEMP "cargo-near-installer.ps1"
        $installerUrl = "https://github.com/near/cargo-near/releases/download/cargo-near-v0.22.0/cargo-near-installer.ps1"
        Invoke-WebRequest -Uri $installerUrl -OutFile $installer
        $installerHash = (Get-FileHash -Algorithm SHA256 $installer).Hash.ToLowerInvariant()
        if ($installerHash -ne "78c477ce11ddb1d5e3874fc69f0e990a9fb2f49d34bc79d29801b201401ffc49") {
            throw "cargo-near installer checksum mismatch; refusing to execute it."
        }
        & $installer
        $env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
        if (-not (Get-Command cargo-near -ErrorAction SilentlyContinue)) {
            throw "Pinned cargo-near 0.22.0 installer completed but cargo-near was not found on PATH."
        }
    }

    $env:HANDEL_DEMO_PROPOSAL_FILE = $proposalFile
    $env:HANDEL_DEMO_PREPARED_FILE = $preparedFile
    Push-Location $root
    $locationPushed = $true

    if ($UsePrebuiltWasm) {
        $required = @(
            "target/near/handel_options.wasm",
            "target/near/handel_escrow/handel_escrow.wasm",
            "target/near/mock_ft/mock_ft.wasm"
        )
        foreach ($path in $required) {
            if (-not (Test-Path $path)) { throw "Missing prebuilt Wasm artifact: $path" }
        }
        Write-Host "Using verified prebuilt Wasm artifacts from GitHub Actions."
    }
    else {
        Invoke-Checked "Build OptionsContract fault-injection and release Wasm" {
            cargo near build non-reproducible-wasm --no-abi --features fault-injection
            if ($LASTEXITCODE -ne 0) { return }
            Copy-Item target/near/handel_options.wasm target/near/handel_options_fault_injection.wasm -Force
            cargo near build non-reproducible-wasm --no-abi
        }
        Invoke-Checked "Build Escrow and mock token Wasm" {
            Push-Location contracts/escrow
            cargo near build non-reproducible-wasm --no-abi --features fault-injection
            if ($LASTEXITCODE -ne 0) { Pop-Location; return }
            Copy-Item target/near/handel_escrow.wasm target/near/handel_escrow_fault_injection_payment.wasm -Force
            cargo near build non-reproducible-wasm --no-abi --features "fault-injection expiry-fast-forward"
            if ($LASTEXITCODE -ne 0) { Pop-Location; return }
            Copy-Item target/near/handel_escrow.wasm target/near/handel_escrow_fault_injection.wasm -Force
            cargo near build non-reproducible-wasm --no-abi
            Pop-Location
            if ($LASTEXITCODE -ne 0) { return }
            Push-Location contracts/mock-ft
            cargo near build non-reproducible-wasm --no-abi
            Pop-Location
        }
    }

    Invoke-Checked "Build and test TypeScript SDK" {
        npm --prefix sdk install --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { return }
        npm --prefix sdk run build
        if ($LASTEXITCODE -ne 0) { return }
        npm --prefix sdk test
        if ($LASTEXITCODE -ne 0) { return }
        npm --prefix sdk run lifecycle
    }

    Invoke-Checked "Run live NEAR AI Chat and System One smoke through Handel SDK" {
        npm --prefix sdk/ai-smoke install --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { return }
        node sdk/ai-smoke/verify-nearai-live-inference.mjs
    }
    if ((Get-Item $proposalFile).Length -eq 0 -or (Get-Item $preparedFile).Length -eq 0) {
        throw "Live AI smoke did not produce both proposal and SDK-prepared evidence files."
    }

    Invoke-Checked "Run approval-gated Options and NEP-141 Escrow Sandbox lifecycle" {
        cargo test -p handel-escrow --test options_registration -- --nocapture
    }

    Write-Host ""
    Write-Host "PASS: live AI -> System One -> Handel SDK -> Sandbox contract lifecycle completed."
    Write-Host "Scope is simulation-only. No live Ondo settlement or real asset movement is proven."
}
finally {
    if ($locationPushed) { Pop-Location }
    $env:HANDEL_DEMO_PROPOSAL_FILE = $previousProposal
    $env:HANDEL_DEMO_PREPARED_FILE = $previousPrepared
    Remove-Item $proposalFile, $preparedFile -Force -ErrorAction SilentlyContinue
}
