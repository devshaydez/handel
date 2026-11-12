param(
  [Parameter(Mandatory = $true, Position = 0)]
  [ValidatePattern('\.testnet$')]
  [string]$ContractAccount,

  [Parameter(Mandatory = $true)]
  [switch]$ConfirmTestnetDeployment,

  [switch]$Initialize
)

$ErrorActionPreference = "Stop"

if (-not $ConfirmTestnetDeployment) {
  throw "Refusing deployment: pass -ConfirmTestnetDeployment explicitly."
}
if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
  throw "cargo is required. Install Rust first."
}
if (-not (Get-Command near -ErrorAction SilentlyContinue)) {
  throw "near-cli-rs is required. Configure its keychain first."
}
# Use the checksum-pinned Windows installer so users do not compile cargo-near/wasm-opt-sys.
$cargoBin = Join-Path $env:USERPROFILE ".cargo\bin"
if (Test-Path $cargoBin) {
  $env:PATH = "$cargoBin;$env:PATH"
}
if (-not (Get-Command cargo-near -ErrorAction SilentlyContinue)) {
  $installer = Join-Path $env:TEMP "cargo-near-installer.ps1"
  $installerUrl = "https://github.com/near/cargo-near/releases/download/cargo-near-v0.22.0/cargo-near-installer.ps1"
  Invoke-WebRequest -Uri $installerUrl -OutFile $installer -UseBasicParsing
  $installerHash = (Get-FileHash -Algorithm SHA256 -Path $installer).Hash.ToLowerInvariant()
  if ($installerHash -ne "78c477ce11ddb1d5e3874fc69f0e990a9fb2f49d34bc79d29801b201401ffc49") {
    throw "cargo-near installer checksum mismatch; refusing to execute it."
  }
  & $installer
  if ($LASTEXITCODE -ne 0) {
    throw "Pinned cargo-near 0.22.0 installer failed with exit code $LASTEXITCODE."
  }
  $env:PATH = "$cargoBin;$env:PATH"
}
if (-not (Get-Command cargo-near -ErrorAction SilentlyContinue)) {
  throw "Pinned cargo-near 0.22.0 installation completed but cargo-near was not found on PATH."
}
& cargo near --version *> $null
if ($LASTEXITCODE -ne 0) {
  throw "cargo-near is installed but 'cargo near' cannot run. Check the Rust Cargo bin directory on PATH."
}

& near --version *> $null
if ($LASTEXITCODE -ne 0) {
  throw "near-cli-rs was found on PATH but cannot run. Repair the near-cli-rs installation before deploying; this is separate from cargo-near."
}

Push-Location (Join-Path $PSScriptRoot "..")
try {
  $escrowDir = Join-Path (Get-Location) "contracts/escrow"
  Write-Host "Building Handel Escrow from contracts/escrow..."
  Push-Location $escrowDir
  try {
    & cargo near build non-reproducible-wasm --no-abi
    if ($LASTEXITCODE -ne 0) { throw "cargo near Escrow build failed." }
  }
  finally {
    Pop-Location
  }

  $wasm = Join-Path (Get-Location) "target/near/handel_escrow/handel_escrow.wasm"
  if (-not (Test-Path $wasm)) {
    throw "Expected Escrow artifact not found: $wasm. Refusing to select an arbitrary workspace Wasm."
  }

  $hash = (Get-FileHash -Algorithm SHA256 -Path $wasm).Hash
  Write-Host "Network: NEAR Testnet"
  Write-Host "Escrow contract account: $ContractAccount"
  Write-Host "Artifact: $wasm"
  Write-Host "SHA-256: $hash"
  Write-Host "The account must already exist and its full-access key must be available in the near-cli-rs keychain."
  Write-Host "This script does not create accounts, keys, token registrations, or fund storage."

  $nearArgs = @("contract", "deploy", $ContractAccount, "use-file", $wasm)
  if ($Initialize) {
    Write-Warning "One-time initializer requested. Do not use -Initialize for an account with existing contract state."
    $nearArgs += @(
      "with-init-call", "new",
      "json-args", "{}",
      "prepaid-gas", "100 TGas",
      "attached-deposit", "0 NEAR"
    )
  } else {
    Write-Host "Deploy only: no initializer will be called."
  }
  $nearArgs += @("network-config", "testnet", "sign-with-keychain", "send")

  & near @nearArgs
  if ($LASTEXITCODE -ne 0) { throw "NEAR Testnet Escrow deployment failed." }
  Write-Host "Escrow deployment command completed. Independently verify code hash, owner/controller state, and transaction receipts before proceeding."
}
finally {
  Pop-Location
}
