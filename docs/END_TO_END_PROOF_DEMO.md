# Handel judge-runnable end-to-end proof demo

**Purpose:** one sequential command that exercises the real NEAR AI Cloud proposal path and the on-chain Options/NEP-141 Escrow lifecycle in an isolated NEAR Sandbox.

## Run

From the repository root on Linux/macOS/WSL:

```bash
export NEARAI_API_KEY='...'
bash scripts/run-e2e-proof-demo.sh
```

Use the repository's GitHub Actions secret for CI. Do not paste API keys into chat, commit them, or print them in logs. The script requires:
- Node.js 24.22.1 or newer and npm;
- Rust/Cargo and the repository-pinned `cargo-near 0.22.0`;
- enough disk space to build the optimized Wasm artifacts;
- a working local NEAR Sandbox runtime (provided by the Rust integration-test harness);
- a NEAR AI Cloud API key for the low-token live inference and System One guard check.

## What it runs

1. Builds the OptionsContract, Escrow and mock NEP-141 token Wasm artifacts, including isolated callback-failure variants.
2. Builds and tests the TypeScript SDK and runs the offline fallback lifecycle example.
3. Calls the official NEAR AI inference SDK against the pinned Chat model, verifies Gateway/model TEE evidence and the provider-TEE response signature, asks for a structured **simulated** option proposal, and sends that proposal to System One for a separately signed safety classification.
4. Runs the Sandbox integration test `call_and_put_registration_deposit_and_settle_through_escrow`. Its Call path now uses the on-chain agent policy, creates an agent proposal, proves that escrow registration is rejected before principal approval, records principal approval, registers immutable terms, locks mock NEP-141 collateral, pays premium, waits for maturity, exercises, and verifies the two payout legs and final token balances. The same test also exercises the Put path.

## Receipt-bound evidence emitted by Escrow

On the normal successful NEP-141 payout path, Escrow now emits a NEP-297-style `EVENT_JSON` log with standard `handel.settlement.v1` from the callback receipt, **only after** the NEP-141 `ft_transfer` promise returns success. The event binds:
- source Options position ID and deterministic per-leg operation ID;
- operation kind (premium, exercise payment, exercise delivery, premium refund, or expiry release);
- exact `nep141:<token-account>` asset ID and raw integer amount;
- Escrow sender and intended recipient.

The SDK `NearRpcReceiptInspector` can inspect the finalized callback receipt, require that the receipt executor is the configured Escrow account, and match the complete event binding. `QuorumNearRpcReceiptInspector` can require matching results from at least two distinct RPC origins. The unit tests assert that the success callbacks emit the expected payment and delivery events.

This strengthens evidence for **successful NEAR-native escrow transfers**. It does not turn RPC responses into a cryptographic light-client proof, prove a remote-chain transfer, establish that an arbitrary token contract is honest, or resolve a callback receipt that itself failed after the token transfer. Trusted-reconciler overrides remain a separate, explicitly disclosed exception and are not allowed to emit this settlement event.

## Evidence and limitations

This is a **reproducible development/hackathon demo**, not production deployment:
- The AI request is synthetic and explicitly marked simulation-only. It does not use live market data or claim to calculate a real premium. The model's premium field is only a placeholder; the production runtime must replace it with a verified deterministic quote.
- The live AI smoke proves that the pinned NEAR AI Cloud Chat model and System One Gateway path respond and that the Chat response is provider-TEE signed under the current allowlist. It does not prove the entire Handel agent runtime has been deployed as a hosted service.
- Contract settlement runs against local Sandbox and repository mock NEP-141 tokens. It demonstrates actual contract callbacks and token-balance changes in the local test chain, not real Testnet/Intents or Ondo settlement.
- The OptionsContract's external-operation `reconcile_operation` and Escrow's ambiguous-callback `reconcile_ambiguous_payout` remain trusted-reconciler boundaries. The normal Sandbox payout path does not need that override, but the override is still not a cryptographic proof.
- The SDK's two-RPC receipt quorum is independent RPC corroboration, not a NEAR light client or proof of remote-chain asset custody.
- The published Tidepool Testnet registry does not establish support for the configured Ondo stock identifiers. Do not relabel Tidepool test assets as Ondo or real USDC.

## Release gates still open

1. Replace trusted-reconciler success assertions with a separately audited, independently verifiable proof path or remove the success override and leave ambiguous outcomes frozen.
2. Demonstrate supported Ondo/USDC route, exact canonical asset IDs/decimals, enforceable per-position reservation and real paired-intent settlement.
3. Run a real Testnet deployment and wallet-authorized lifecycle only after contract and asset compatibility review.
4. Connect the user's manually built frontend to the same proposal/approval/position/finality APIs.
5. Capture a clean run transcript, transaction/receipt identifiers, state snapshots and balances for the judge evidence pack.

A green run of this script closes the **local reproducibility** gap only. It does not close production settlement or Testnet asset-support gates.
