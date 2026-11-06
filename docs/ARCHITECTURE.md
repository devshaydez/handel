# Architecture — Handel Options Core

## Custody model: Path A (shipped)

```
User (or dedicated full-access key user can revoke)
        │
        │  signs NEP-413 intent
        ▼
  Verifier (intents.near / Tidepool)
        │
        │  transfer / token_diff executes
        ▼
  Options contract (source of truth)
        │  validates amounts, limits, status, op_ids
        ▼
  Position state machine
```

- Function-call keys **cannot** sign NEP-413.
- Named accounts must `add_public_key` on the Verifier before their keys can sign.
- The options contract does **not** hold tokens in MVP; it records economic state and gates every transition.

## State machine

```
Created
  │ confirm_collateral_locked
  ▼
CollateralLocked
  │ open_position (premium paid via Intents)
  ▼
Open
  │ exercise
  ▼
PendingSettlement
  │ confirm_settlement
  ▼
Settled

Open / CollateralLocked ──(after expiry)──► Expired
Created / CollateralLocked ──(writer)──► Cancelled
```

## Agent path

1. User calls `grant_agent` with hard limits (assets, size, premium, open count, expiry window).
2. AI produces `AgentProposal` JSON.
3. Off-chain `validateProposal` checks limits.
4. If ok → `create_position(..., as_agent_for: user)`.
5. Contract re-checks the same limits.
6. User can `revoke_agent` in one transaction at any time.

## Settlement (physical)

**Call:** holder pays strike USDC → writer; writer delivers underlying → holder.
**Put:** holder delivers underlying → writer; writer pays strike USDC → holder.

Built as recipient-specific `transfer` intents (not open matching) for the vertical slice.

## What is intentionally not built

- Path B (Chain Signatures → contract-signed NEP-413)
- Oracle cash settlement
- American early exercise / partial exercise
- Secondary options order book
- Frontend
- Claiming mock assets are real Ondo stock
