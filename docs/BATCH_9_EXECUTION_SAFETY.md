# Batch 9 — Execution and safety (Phases 17–19)

Branch: work/batch-9-execution-safety  
Base: work/batch-8-ai-agent-intelligence  
Status: in progress. No deployment, signing, funding, or asset movement performed.

## Phase 17 — bounded agent authority

The existing OptionsContract stores a principal-bound AgentPolicy with allowed assets, underlying/premium/collateral caps, open-position limit, expiry, enabled state, and principal-only revocation. Agent proposal creation checks those limits; manual proposals require principal approval before collateral entry.

This batch adds an SDK fail-closed permission snapshot validator and exposure preflight. It checks the connected principal, expiry and enabled state, allowed assets, canonical uint256 values, all configured caps, open-position count, and execution mode. This is a preflight only; the contract remains authoritative.

Execution modes:
- education and advisory: no signing authority;
- manual_approval: every transaction requires connected-principal approval;
- delegated: may skip per-trade approval only within a live, revocable on-chain policy.

The SDK does not store private keys or sign NEP-413 messages. NEP-413 signing continues to require the user's wallet/full-access key; an AI service must never receive an unrestricted wallet key. A function-call key is not a NEP-413 signing substitute.

## Phase 18 — NEAR Intents execution

Remaining: verified exact asset IDs and route support; wallet-side NEP-413 signing integration; verifier submission/receipt decoding; operation-to-intent binding; finality and ambiguous-outcome handling; real Ondo token support proof. Tidepool test assets remain segregated and cannot be represented as Ondo stock collateral.

## Phase 19 — custody and settlement

Remaining: actual NEP-141/NEP-245 collateral intake; immutable per-position reservation; no withdrawal/reuse while open; independently verified settlement outcomes; safe partial-failure recovery; payout/expiry release proof; replay protection and adversarial tests.

## Non-negotiable safety limits

- No private key, seed phrase, or unrestricted full-access key enters the AI runtime.
- No autonomous trade may exceed on-chain asset, amount, collateral, position-count, or expiry limits.
- Revocation and policy expiry must be checked at the contract boundary, not only in the SDK.
- Unknown or delayed outcomes remain unknown; no timeout-based duplicate retry.
- A quote, API status, indexer row, or trusted reconciler assertion is not proof of custody or settlement.
- No real assets or Mainnet claims until independent review and end-to-end proof.
