#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/scripts" "$TMP/contracts/escrow" "$TMP/bin"
cp "$ROOT/scripts/deploy-escrow-testnet.sh" "$TMP/scripts/"
: > "$TMP/contracts/escrow/Cargo.toml"

cat > "$TMP/bin/cargo" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "near" && "${2:-}" == "--help" ]]; then exit 0; fi
if [[ "${1:-}" == "near" && "${2:-}" == "build" ]]; then
  mkdir -p "$MOCK_ROOT/target/near/handel_escrow"
  printf 'mock-wasm' > "$MOCK_ROOT/target/near/handel_escrow/handel_escrow.wasm"
  exit 0
fi
echo "unexpected cargo invocation: $*" >&2
exit 90
MOCK
cat > "$TMP/bin/near" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$MOCK_NEAR_LOG"
MOCK
chmod +x "$TMP/bin/cargo" "$TMP/bin/near"

export PATH="$TMP/bin:$PATH"
export MOCK_ROOT="$TMP"
export MOCK_NEAR_LOG="$TMP/near.log"
SCRIPT="$TMP/scripts/deploy-escrow-testnet.sh"

if bash "$SCRIPT" escrow.testnet >/dev/null 2>&1; then
  echo "FAIL: missing confirmation was accepted" >&2
  exit 1
fi
[[ ! -e "$MOCK_NEAR_LOG" ]] || { echo "FAIL: near CLI ran without confirmation" >&2; exit 1; }

if bash "$SCRIPT" escrow.near --confirm-testnet-deployment >/dev/null 2>&1; then
  echo "FAIL: non-Testnet account was accepted" >&2
  exit 1
fi
[[ ! -e "$MOCK_NEAR_LOG" ]] || { echo "FAIL: near CLI ran for non-Testnet account" >&2; exit 1; }

bash "$SCRIPT" escrow.testnet --confirm-testnet-deployment >/dev/null
grep -q '^contract deploy escrow.testnet use-file .*handel_escrow.wasm network-config testnet sign-with-keychain send$' "$MOCK_NEAR_LOG" || {
  echo "FAIL: default deployment did not use the deterministic Testnet deploy-only command" >&2
  exit 1
}
if grep -q 'with-init-call' "$MOCK_NEAR_LOG"; then
  echo "FAIL: default deployment unexpectedly invoked initializer" >&2
  exit 1
fi

: > "$MOCK_NEAR_LOG"
bash "$SCRIPT" escrow.testnet --confirm-testnet-deployment --initialize >/dev/null
grep -q 'with-init-call new json-args {} prepaid-gas 100 TGas attached-deposit 0 NEAR network-config testnet sign-with-keychain send' "$MOCK_NEAR_LOG" || {
  echo "FAIL: explicit initialization did not use the expected one-time initializer" >&2
  exit 1
}

echo "Escrow deployment safety checks passed."
