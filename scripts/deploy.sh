#!/usr/bin/env bash
set -euo pipefail

# Deploys to an existing NEAR Testnet account whose full-access key is available
# through near-cli-rs keychain. Create/control the account before running this.
#
# Usage:
#   ./scripts/deploy.sh handel-options.shaydez.testnet

CONTRACT_ACCOUNT="${1:?Usage: $0 <existing-contract-account.testnet>}"

if [[ "$CONTRACT_ACCOUNT" != *.testnet ]]; then
  echo "Refusing deployment: contract account must end in .testnet" >&2
  exit 1
fi

command -v cargo >/dev/null || { echo "cargo is required" >&2; exit 1; }
command -v near >/dev/null || { echo "near-cli-rs is required" >&2; exit 1; }
cargo near --help >/dev/null 2>&1 || { echo "cargo-near is required (cargo install cargo-near)" >&2; exit 1; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== Building Handel contract from repository root ==="
cargo near build non-reproducible-wasm

WASM="$ROOT/target/near/handel_options.wasm"
if [[ ! -f "$WASM" ]]; then
  WASM="$(find "$ROOT/target" -type f -name '*.wasm' -print -quit)"
fi
if [[ -z "${WASM:-}" || ! -f "$WASM" ]]; then
  echo "Could not find compiled Wasm artifact under target/" >&2
  exit 1
fi

echo "=== Testnet deployment target: $CONTRACT_ACCOUNT ==="
echo "The target account's full-access key must be available in the near-cli-rs keychain."
echo "No account creation, mainnet operation, or secret handling is performed by this script."

near contract deploy "$CONTRACT_ACCOUNT" \
  use-file "$WASM" \
  with-init-call new \
  json-args '{}' \
  prepaid-gas '100 TGas' \
  attached-deposit '0 NEAR' \
  network-config testnet \
  sign-with-keychain \
  send

echo "Deployment/init command completed for $CONTRACT_ACCOUNT"
