#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./scripts/deploy.sh <your-account.testnet>
# Example:
#   ./scripts/deploy.sh alice.testnet

ACCOUNT="${1:?Usage: $0 <account.testnet>}"
CONTRACT_ACCOUNT="handel-options.${ACCOUNT}"

echo "=== Building contract ==="
cd "$(dirname "$0")/../contracts/options"
cargo near build non-reproducible-wasm

WASM="./target/near/handel_options.wasm"
if [ ! -f "$WASM" ]; then
  # cargo-near sometimes uses a slightly different name
  WASM=$(find ./target -name "*.wasm" | head -1)
fi
echo "WASM: $WASM"

echo "=== Creating contract account (if needed) ==="
near create-account "$CONTRACT_ACCOUNT" --useAccount "$ACCOUNT" --initialBalance 5 || true

echo "=== Deploying ==="
near deploy "$CONTRACT_ACCOUNT" "$WASM" --useAccount "$ACCOUNT"

echo "=== Initializing ==="
near call "$CONTRACT_ACCOUNT" new "{\"owner\":\"$ACCOUNT\"}" --useAccount "$ACCOUNT"

echo "=== Done ==="
echo "Contract: $CONTRACT_ACCOUNT"
echo "View assets: near view $CONTRACT_ACCOUNT list_assets '{}'"
