> Historical working note; superseded by README.md and docs/EVIDENCE.md.

# Versioned lifecycle storage and migration design

Status: implementation and migration gate, 2026-11-08. Premium sidecars/transfers/refunds, lifecycle outbox/callbacks, evidence-attested payout recovery, and registration/expiry unit coverage are implemented in the PR branch. Runtime and test commit `f5e8460b3ac7cdf05328801da2743a7ab5686a74` passed CI run #42531159905 (Rust format/tests/Wasm/Sandbox and SDK build/tests/demo). Versioned root-state migration entrypoints and legacy deployment migration are not implemented.

## Safety invariant

Do not append fields to the deployed Borsh layouts of `OptionsContract`, `EscrowContract`, `OptionPosition`, or `EscrowPosition` and assume old state will deserialize. Existing positions and in-flight promises must remain readable before any new lifecycle path is enabled.

The current PR head has persistent collections, but its root contract state and position records are still serialized schemas. A code-only field addition is not a migration.

## Versioning strategy

Use an explicit V2 state envelope for each contract:

- `OptionsState::V1(LegacyOptionsState)`
- `OptionsState::V2(OptionsStateV2)`
- `EscrowStateEnvelope::V1(LegacyEscrowState)`
- `EscrowStateEnvelope::V2(EscrowStateV2)`

The V1 structs must preserve the exact field order, types, collection prefixes, and serialization behavior of the current deployed structs. Keep them frozen in source as migration-only types. Do not deserialize V1 records into V2 structs.

V2 lifecycle extensions are stored under disjoint raw-storage prefixes so existing position records are not rewritten in place. The Escrow premium sidecar is keyed by immutable escrow position ID and carries schema version 2 plus a monotonic revision. Options' accepted-event sequence/digest, Escrow's event sequence/outbox, reconciler configuration, and evidence records use separate prefixed keys. Existing root layouts and position records are not extended by these changes.

Implemented extension records and remaining design items:

- Options: OptionPosition pins escrow ID/contract; separate keys store last accepted event sequence and digest. Persisted last-state sidecar and migration marker remain open.
- Escrow: versioned premium sidecar stores token, amount, deposit/payout/refund flags, and revision. Separate keys store event sequence/outbox and append-only payout evidence records. Unified migration marker remains open.
- Event outbox: source position ID, escrow position ID, monotonic sequence, and lifecycle state are persisted before callback scheduling. Resend uses the stored event and does not transfer tokens; delivery-status tracking and automated retry workers remain open.

## Migration entrypoints

1. Add owner-authorized, `#[init(ignore_state)]` migration entrypoints that read the exact V1 root state type and construct the V2 envelope without changing existing collection prefixes.
2. Make migration idempotent. A second migration call must reject or return the already-migrated version without resetting counters or prefixes.
3. Preserve owner, pause state, controller, next IDs, all collection handles, and every existing position/operation.
4. Do not enable V2 escrow registration or premium collection until the corresponding migration version is present and verified.
5. Expose read-only schema-version views and a bounded migration audit view.
6. Test migration from serialized fixtures produced by the previous release, not fixtures created by the new structs.

If the NEAR SDK state layout does not permit a safe envelope conversion for an already-deployed account, deploy a new V2 contract and use an explicit, audited position-by-position migration/withdrawal procedure. Never silently reinterpret old state.

## V2 premium lifecycle

The premium token is USDC for both Calls and Puts. It is not interchangeable with the exercise-payment token:

- Call: collateral = underlying; exercise payment = USDC; premium = USDC.
- Put: collateral = USDC; exercise payment = underlying; premium = USDC.

The V2 `create_position_v2` registration pins premium token and amount in a schema-versioned sidecar in addition to collateral and exercise payment. The holder's `ft_transfer_call` premium leg must be accepted only for the exact holder, pinned USDC token, exact amount, and an eligible collateral-locked position. Premium payout to the writer is a separate asynchronous leg. OptionsContract may become `Open` only after Escrow has persisted a successful premium payout receipt.

The sidecar tracks premium received, payout pending/failed/paid, and refund pending/failed/refunded. A lost callback leaves the transfer pending and blocks automatic retry/refund. A definitive failed payout can be retried; an ambiguous transfer/callback cannot. If premium has been received but cannot be paid before expiry, refund handling must be a separately recorded transfer leg with its own definitive-failure and ambiguity rules. No exercise is allowed before premium-paid is authoritative.

## Lifecycle event delivery

Escrow is the source of truth for custody and payout outcomes. On every durable lifecycle transition, append an outbox event with a strictly increasing per-position sequence. Callback delivery is best-effort and never rolls back a token transfer or durable Escrow state.

OptionsContract accepts an event only when:

- `predecessor_account_id()` equals the escrow contract pinned on that position;
- source position ID and escrow position ID both match the registration receipt;
- sequence is exactly the next expected sequence, or is an identical replay of the last accepted event;
- the transition is valid from the current OptionsContract state.

Persist the accepted sequence and state atomically with the OptionsContract position update. Provide a permissionless or controller-authorized resend of the persisted outbox event. Resending an event must never initiate a token transfer. Duplicate event delivery must be harmless.

## Payout reconciliation trust boundary

NEAR contract state cannot independently prove that an external NEP-141 transfer succeeded if the transfer promise's callback receipt is missing. Escrow now exposes an owner-configured reconciler and durable evidence record for explicit human attestation. Do not retry a pending transfer based on elapsed time, operator assertion without evidence, or a generic timeout.

Keep definitive transfer failure distinct from ambiguous receipt loss. For ambiguous cases, the attestor must independently inspect token balances/receipts and submit a decision bound to token, amount, sender, receiver, position, leg, evidence hash, and transfer reference. The contract records the attestor and timestamp but cannot validate external evidence itself. Record who attested, the evidence reference/hash, decision, and timestamp. This is a documented trust root, not a trustless proof. If the evidence is insufficient, keep the position frozen for manual resolution.

Exercise remains two non-atomic transfers: payment to writer, then collateral to holder. A successful first leg must never be repeated when recovering the second. Expiry collateral return and premium refund are also independent transfer legs.

## Required migration and lifecycle tests

- Deserialize V1 OptionsContract and EscrowContract state fixtures and verify every owner/configuration/counter/collection remains available after migration.
- Preserve V1 position records and operation records exactly.
- Reject migration by non-owner; reject duplicate migration; reject unsupported schema versions.
- Migrate with positions in every existing state, including pending callbacks and reconciliation-required positions.
- Verify Call and Put premium token mapping independently.
- Verify wrong token, wrong sender, wrong amount, replayed transfer message, early exercise, and expiry refund boundaries.
- Verify premium payout success is the only path to Open.
- Verify definitive payout failure can retry only the unpaid leg.
- Simulate successful token transfer followed by failed callback; prove automatic retry is blocked.
- Verify outbox event resend does not transfer tokens and replayed/stale/out-of-order events are rejected.
- Verify OptionsContract cannot mark Settled until both exercise payout legs are confirmed.
- Verify a partially completed settlement cannot be routed through the external reconciliation rail.
- Run formatting, unit tests, optimized Wasm builds, and Sandbox integration tests once after the integrated batch is complete.

## Release gate

This document is not a production-readiness claim. Batch 1 code validation passed on the recorded CI head. Remaining P0 gaps include full expiry and registration-failure recovery integration, automated verifier/monitoring service, and migration/deployment compatibility review. Do not call the backend production-ready. The OptionsContract root layout still differs from the earlier standard-map implementation; do not upgrade an existing deployment without separately reviewed V1 migration or audited redeployment. Existing deployments must not be upgraded until the V1 fixture migration and independent review pass.
