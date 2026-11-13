# Backend readiness snapshot

**Current source of truth:** [README.md](../README.md) and [EVIDENCE.md](./EVIDENCE.md). This document replaces the older readiness checklist, which contained stale branch, deployment, and Assistant-integration status.

## Verified implementation

- The delegated Assistant composer is present in `frontend/src/components/TestnetProposalComposer.tsx`; it obtains a delegated session, submits create/register through the server API, and separates principal collateral and holder premium signatures.
- The delegated API route is `api/v1/delegated/trades.js`; the bearer token is injected from server-side environment configuration.
- Chat uses field-level E2EE and Gateway OHTTP, pins Gateway/model identities and TEE measurements, and verifies response signatures. System One is a separate E2EE/OHTTP-disabled path with Gateway-signature verification, not model-TEE attestation.
- The OptionsContract Testnet deployment and exact Wasm match are recorded in E-002.
- The evidence ledger records six successful CI jobs on the cited commit; frontend typecheck/build was skipped on that run (E-001).

## Release boundaries

- No completed live two-party Testnet create/register/collateral/premium lifecycle is recorded.
- No Ondo asset route, Mainnet NEAR Intents settlement, or enforceable per-position Intents collateral reservation is demonstrated.
- Escrow deployment was recorded, but independent deployed-code-hash verification and complete live custody/settlement evidence remain open (E-003, E-008).
- The reconciler remains a trust assumption, not independent cryptographic proof.
- The latest production deployment state must be checked independently; do not infer it from a source commit or successful CI.

## Required evidence before stronger claims

See the explicit open evidence checklist in [EVIDENCE.md](./EVIDENCE.md#evidence-still-required-before-stronger-claims), the [threat model](./THREAT_MODEL.md), and [custody and settlement boundaries](./CUSTODY_AND_SETTLEMENT.md).

A passing build, Sandbox lifecycle, dry quote, or deployed Wasm hash is not proof of a completed live trade, production custody, or settlement.
