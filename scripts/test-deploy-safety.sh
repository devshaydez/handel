#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$TMP/repo/scripts" "$TMP/bin"
cp "$ROOT/scripts/deploy.sh" "$TMP/repo/scripts/deploy.sh"

cat > "$TMP/bin/cargo" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == "near" && "$2" == "--help" ]]; then
  exit 0
fi
if [[ "$1" == "near" && "$2" == "build" ]]; then
  mkdir -p target/near
  printf 'mock-wasm' > target/near/handel_options.wasm
  exit 0
fi
echo "unexpected cargo invocation: $*" >&2
exit 90
MOCK

cat > "$TMP/bin/near" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$@" > "$NEAR_ARGS_FILE"
MOCK

chmod +x "$TMP/bin/cargo" "$TMP/bin/near"
export PATH="$TMP/bin:$PATH"
export NEAR_ARGS_FILE="$TMP/near-args.txt"

# Missing explicit confirmation must fail before invoking the deployment CLI.
if bash "$TMP/repo/scripts/deploy.sh" demo.testnet >"$TMP/no-confirm.out" 2>&1; then
  echo "Expected missing confirmation to fail" >&2
  exit 1
fi
if [[ -e "$NEAR_ARGS_FILE" ]]; then
  echo "Deployment CLI was invoked without explicit confirmation" >&2
  exit 1
fi

# Non-Testnet account names must be rejected.
if bash "$TMP/repo/scripts/deploy.sh" demo.near --confirm-testnet-deployment >"$TMP/wrong-network.out" 2>&1; then
  echo "Expected non-Testnet account to fail" >&2
  exit 1
fi

# A normal deployment must target Testnet and must not invoke the initializer.
bash "$TMP/repo/scripts/deploy.sh" demo.testnet --confirm-testnet-deployment >"$TMP/deploy.out"
grep -qx 'testnet' <(grep -A1 '^network-config$' "$NEAR_ARGS_FILE" | tail -n1)
if grep -q '^with-init-call$' "$NEAR_ARGS_FILE"; then
  echo "Default deployment unexpectedly invoked initializer" >&2
  exit 1
fi

# Initialization must be separately opt-in.
bash "$TMP/repo/scripts/deploy.sh" demo.testnet --confirm-testnet-deployment --initialize >"$TMP/init.out"
grep -q '^with-init-call$' "$NEAR_ARGS_FILE"
grep -q '^new$' "$NEAR_ARGS_FILE"

echo "Deployment helper safety tests passed."
