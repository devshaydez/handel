#!/usr/bin/env bash
set -euo pipefail

# Safe-by-default NEAR Testnet deployment helper.
# Usage:
#   ./scripts/deploy.sh <existing-account.testnet> --confirm-testnet-deployment
#   ./scripts/deploy.sh <existing-account.testnet> --confirm-testnet-deployment --initialize
#
# --initialize is ONLY for a newly deployed, not-yet-initialized contract account.
# Never pass it when upgrading an account with existing contract state.

usage() {
  echo "Usage: $0 <existing-contract-account.testnet> --confirm-testnet-deployment [--initialize]" >&2
  exit 2
}

[[ $# -ge 2 ]] || usage
CONTRACT_ACCOUNT="$1"
shift

CONFIRMED=false
INITIALIZE=false
for arg in "$@"; do
  case "$arg" in
    --confirm-testnet-deployment) CONFIRMED=true ;;
    --initialize) INITIALIZE=true ;;
    *) echo "Unknown option: $arg" >&2; usage ;;
  esac
done

if [[ "$CONTRACT_ACCOUNT" != *.testnet ]]; then
  echo "Refusing deployment: account must end in .testnet" >&2
  exit 1
fi
if [[ "$CONFIRMED" != true ]]; then
  echo "Refusing deployment: pass --confirm-testnet-deployment explicitly." >&2
  exit 1
fi

command -v cargo >/dev/null || { echo "cargo is required" >&2; exit 1; }
command -v near >/dev/null || { echo "near-cli-rs is required" >&2; exit 1; }
cargo near --help >/dev/null 2>&1 || { echo "cargo-near is required (cargo install cargo-near)" >&2; exit 1; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== Building Handel OptionsContract from repository root ==="
cargo near build non-reproducible-wasm --no-abi

WASM="$ROOT/target/near/handel_options.wasm"
if [[ ! -f "$WASM" ]]; then
  echo "Expected OptionsContract artifact not found: $WASM" >&2
  echo "Refusing to select an arbitrary Wasm artifact from the workspace." >&2
  exit 1
fi

echo "=== Deployment preflight ==="
echo "Network: NEAR Testnet"
echo "Contract account: $CONTRACT_ACCOUNT"
echo "Artifact: $WASM"
sha256sum "$WASM"
echo "The account must already exist and its full-access key must be available in the near-cli-rs keychain."
echo "This script does not create accounts, keys, token registrations, or fund storage."
if [[ "$INITIALIZE" == true ]]; then
  echo "Initializer: new (one-time initialization requested)"
  echo "WARNING: do not use --initialize for an account with existing contract state."
else
  echo "Initializer: none (deploy only; existing state is not intentionally reinitialized)"
fi

DEPLOY_ARGS=(
  contract deploy "$CONTRACT_ACCOUNT"
  use-file "$WASM"
  network-config testnet
  sign-with-keychain
  send
)
if [[ "$INITIALIZE" == true ]]; then
  DEPLOY_ARGS=(
    contract deploy "$CONTRACT_ACCOUNT"
    use-file "$WASM"
    with-init-call new
    json-args '{}'
    prepaid-gas '100 TGas'
    attached-deposit '0 NEAR'
    network-config testnet
    sign-with-keychain
    send
  )
fi

near "${DEPLOY_ARGS[@]}"
echo "Deployment command completed. Independently verify code hash, account state, and transaction receipts before proceeding."
