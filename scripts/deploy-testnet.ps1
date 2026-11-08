param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('\.testnet$')]
  [string]$ContractAccount
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
  throw "cargo is required. Install Rust first."
}
if (-not (Get-Command near -ErrorAction SilentlyContinue)) {
  throw "near-cli-rs is required. Install and configure the NEAR CLI keychain first."
}

Push-Location (Join-Path $PSScriptRoot "..")
try {
  Write-Host "Building Handel from repository root..."
  & cargo near build non-reproducible-wasm
  if ($LASTEXITCODE -ne 0) { throw "cargo near build failed." }

  $wasm = Join-Path (Get-Location) "target/near/handel_options.wasm"
  if (-not (Test-Path $wasm)) {
    $candidate = Get-ChildItem -Path "target" -Filter "*.wasm" -Recurse -File |
      Select-Object -First 1
    if ($null -eq $candidate) { throw "No Wasm artifact found under target/." }
    $wasm = $candidate.FullName
  }

  Write-Host "Testnet target: $ContractAccount"
  Write-Host "The target account must already exist and its full-access key must be available in near-cli-rs keychain."
  Write-Host "This script does not create accounts, access keys, or perform mainnet operations."

  $nearArgs = @(
    "contract", "deploy", $ContractAccount,
    "use-file", $wasm,
    "with-init-call", "new",
    "json-args", "{}",
    "prepaid-gas", "100 TGas",
    "attached-deposit", "0 NEAR",
    "network-config", "testnet",
    "sign-with-keychain",
    "send"
  )
  & near @nearArgs
  if ($LASTEXITCODE -ne 0) { throw "NEAR Testnet deployment failed." }
  Write-Host "Deployment/init command completed for $ContractAccount"
}
finally {
  Pop-Location
}
