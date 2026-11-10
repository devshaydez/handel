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
& cargo near --help *> $null
if ($LASTEXITCODE -ne 0) {
  throw "cargo-near is required (cargo install cargo-near)."
}

Push-Location (Join-Path $PSScriptRoot "..")
try {
  Write-Host "Building Handel OptionsContract from repository root..."
  & cargo near build non-reproducible-wasm --no-abi
  if ($LASTEXITCODE -ne 0) { throw "cargo near build failed." }

  $wasm = Join-Path (Get-Location) "target/near/handel_options.wasm"
  if (-not (Test-Path $wasm)) {
    throw "Expected OptionsContract artifact not found: $wasm. Refusing to select an arbitrary workspace Wasm."
  }

  $hash = (Get-FileHash -Algorithm SHA256 -Path $wasm).Hash
  Write-Host "Network: NEAR Testnet"
  Write-Host "Contract account: $ContractAccount"
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
  if ($LASTEXITCODE -ne 0) { throw "NEAR Testnet deployment failed." }
  Write-Host "Deployment command completed. Independently verify code hash, account state, and transaction receipts before proceeding."
}
finally {
  Pop-Location
}
