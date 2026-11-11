#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v cargo-near >/dev/null 2>&1; then
  echo "cargo-near is required. Install the repository-pinned version: cargo install --locked cargo-near --version 0.22.0" >&2
  exit 2
fi
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.js 24.22.1+ and npm are required." >&2
  exit 2
fi
node -e 'const [major,minor,patch]=process.versions.node.split(".").map(Number); if (major<24 || (major===24 && (minor<22 || (minor===22 && patch<1)))) { console.error("Node.js 24.22.1 or newer is required."); process.exit(2); }'
if [[ -z "${NEARAI_API_KEY:-}" ]]; then
  echo "NEARAI_API_KEY is required for the live AI proposal/guard smoke. Set it in your shell; never commit it." >&2
  exit 2
fi

HANDEL_DEMO_PROPOSAL_FILE="$(mktemp)"
HANDEL_DEMO_PREPARED_FILE="$(mktemp)"
export HANDEL_DEMO_PROPOSAL_FILE HANDEL_DEMO_PREPARED_FILE
trap 'rm -f "$HANDEL_DEMO_PROPOSAL_FILE" "$HANDEL_DEMO_PREPARED_FILE"' EXIT

echo "== 1/5: Build OptionsContract fault-injection artifact =="
cargo near build non-reproducible-wasm --no-abi --features fault-injection
cp target/near/handel_options.wasm target/near/handel_options_fault_injection.wasm
cargo near build non-reproducible-wasm --no-abi

echo "== 2/5: Build Escrow and mock token artifacts =="
(
  cd contracts/escrow
  cargo near build non-reproducible-wasm --no-abi --features fault-injection
)
cp target/near/handel_escrow.wasm target/near/handel_escrow_fault_injection_payment.wasm
(
  cd contracts/escrow
  cargo near build non-reproducible-wasm --no-abi --features "fault-injection expiry-fast-forward"
)
cp target/near/handel_escrow.wasm target/near/handel_escrow_fault_injection.wasm
(
  cd contracts/escrow
  cargo near build non-reproducible-wasm --no-abi
)
(
  cd contracts/mock-ft
  cargo near build non-reproducible-wasm --no-abi
)

echo "== 3/5: Run SDK build, tests, and offline fallback demo =="
npm --prefix sdk install --no-audit --no-fund
npm --prefix sdk run build
npm --prefix sdk test
npm --prefix sdk run lifecycle

echo "== 4/5: Run live NEAR AI Cloud structured-proposal and System One smoke =="
npm --prefix sdk/ai-smoke install --no-audit --no-fund
(
  cd sdk/ai-smoke
  node verify-nearai-live-inference.mjs
)
test -s "$HANDEL_DEMO_PROPOSAL_FILE"

echo "== 5/5: Run the Options → agent approval → NEP-141 escrow → exercise → settlement Sandbox demo =="
cargo test -p handel-escrow --test options_registration -- --nocapture

echo
echo "PASS: judge-runnable vertical slice completed."
echo "Scope: live NEAR AI proposal/guard smoke + simulated Sandbox assets and contracts."
echo "Not proven: live Ondo asset support, production Intents settlement, external-chain proof, or production custody."
