# Batch 9 — Execution and safety (Phases 17–19)

Branch: work/batch-9-execution-safety  
Base: work/batch-8-ai-agent-intelligence  
Status: in progress. No deployment, signing, funding, or asset movement performed.

## Phase 17 — bounded agent authority

The existing OptionsContract stores a principal-bound AgentPolicy with allowed assets, underlying/premium/collateral caps, open-position limit, expiry, enabled state, and principal-only revocation. Execution mode is stored separately under a versioned storage key to avoid changing the Borsh layout of AgentPolicy. New policies default to ManualApproval; only the principal can explicitly switch to Delegated. Direct delegated Call/Put methods require Delegated mode. Proposal creation and approval require ManualApproval mode and a live policy; revocation/expiry blocks pending approval. Education and Advisory modes cannot create trade proposals.

This batch adds an SDK fail-closed permission snapshot validator and exposure preflight. It checks the connected principal, expiry and enabled state, allowed assets, canonical uint256 values, all configured caps, open-position count, and execution mode. This is a preflight only; the contract remains authoritative.

Execution modes:
- education and advisory: no signing authority;
- manual_approval: every transaction requires connected-principal approval;
- delegated: may skip per-trade approval only within a live, revocable on-chain policy.

The SDK does not store private keys or sign NEP-413 messages. NEP-413 signing continues to require the user's wallet/full-access key; an AI service must never receive an unrestricted wallet key. A function-call key is not a NEP-413 signing substitute.

## Phase 18 — NEAR Intents execution

Implemented SDK boundary:
- Connected-wallet NEP-413 signing helper requires explicit approval, connected-principal match, verifier allowlist, signer/deadline/intent checks and does not receive a private key.
- Paired signed-intent builder validates both signatures and requires distinct 32-byte nonces.
- Read-only `simulate_intents` call runs at finality. The returned simulation is bound to the SHA-256 of the exact signed pair and verifier; submission rejects a different payload or verifier.
- `execute_intents` submission requires explicit approval and the connected wallet callback.

Still blocked: production wallet-selector integration; exact current Verifier ABI/signature conformance; canonical Verifier event/receipt parsing; exact Ondo/USDC IDs and routes; and real-asset execution proof. The Verifier is Mainnet-only; no Mainnet signature, transaction or asset movement was attempted. Tidepool test assets remain segregated and cannot be represented as Ondo stock collateral.

## Phase 19 — custody and settlement

Implemented custody primitives:
- Escrow accepts exact configured NEP-141 token, sender, amount, position and lifecycle leg through `ft_on_transfer`; invalid transfers are returned.
- SDK builds exact collateral, premium and exercise-payment `ft_transfer_call` arguments and preserves uint64 position IDs without JavaScript number truncation.
- Exercise payout is sequential but recoverable: the payment leg is recorded before collateral payout; a definitive second-leg failure records `ExerciseCollateral`; retry submits only the failed collateral leg. A new regression test proves the first successful leg is not repeated.
- A missing callback remains pending and is not timeout-retried. Ambiguous outcomes require the configured reconciler.

Still blocked: deployed token custody evidence; exact Ondo/USDC route support; independent proof of payout/finality and balances; reconciler trust minimisation; Sandbox callback-failure verification; and proof that no collateral can be withdrawn/reused while a position remains open.

## Non-negotiable safety limits

- No private key, seed phrase, or unrestricted full-access key enters the AI runtime.
- No autonomous trade may exceed on-chain asset, amount, collateral, position-count, or expiry limits.
- Revocation and policy expiry must be checked at the contract boundary, not only in the SDK.
- Unknown or delayed outcomes remain unknown; no timeout-based duplicate retry.
- A quote, API status, indexer row, or trusted reconciler assertion is not proof of custody or settlement.
- No real assets or Mainnet claims until independent review and end-to-end proof.

## Current implementation evidence

### Phase 17 — implementation complete; final integrated CI required
- Added SDK permission snapshot validation and exposure preflight in sdk/src/agent-permissions.ts, including stale/future snapshot rejection and hard denial in Education/Advisory modes.
- Added on-chain Education, Advisory, ManualApproval and Delegated modes. Mode is stored separately under a versioned storage key so the AgentPolicy Borsh layout is unchanged. New policies default to ManualApproval; only the principal can change mode.
- Direct delegated Call and Put entry points require explicit Delegated mode, live enabled policy, allowlisted asset, configured caps, expiry bound and open-position cap. Expired positions no longer consume the open-position limit.
- Manual proposal creation and approval require ManualApproval mode and a still-live, non-revoked policy. Education/Advisory cannot create trade proposals. Added tests for default-deny, principal-only mode change, mode boundaries, revocation before approval, collateral cap and delegated Put.
- The SDK preflight is advisory only; the contract remains authoritative.

### Phase 18 — integration boundary added; live route still open
- Added connected-wallet NEP-413 signing helper with explicit approval, principal matching, verifier allowlist, signer_id/deadline/intent validation. It never receives a private key.
- Added paired signed-intent argument validation, read-only simulate_intents RPC call, and an explicit-approval wallet callback for execute_intents.
- The Verifier is deployed on Mainnet; official docs state there is no Testnet deployment. No Mainnet signature, transaction, or asset movement was attempted. Exact Ondo token support and an enforceable reservation inside the Verifier ledger are not established.
- Simulation is not a proof of external token transfer completion; external withdrawal/deposit callbacks require separate finality and reconciliation.

### Phase 19 — custody primitives exist; production proof remains open
- The Escrow contract already implements NEP-141 ft_on_transfer and accepts only exact configured token, sender, amount, position, and allowed lifecycle leg. Rejected transfers are returned to the sender.
- Added an SDK builder for exact collateral, premium, and exercise-payment transfer_call arguments, preserving uint64 position IDs without JavaScript number truncation.
- Escrow exercise payout is sequential and non-atomic. Ambiguous callback outcomes remain pending; the configured reconciler is a trust assumption, not a trustless proof.
- Per-position NEP-141 collateral custody is not equivalent to a locked balance in the NEAR Intents internal ledger. No Ondo collateral is currently proven supported by the Testnet sandbox.

## Remaining acceptance gates
1. Verify all new SDK and Rust tests on the same final commit. Earlier runs exposed Rust formatting and one simulation-test assertion mismatch; both were corrected, and a partial-payout recovery regression test was added. Final integrated CI is still pending.
2. Integrate a production wallet-selector implementation and verify NEP-413 payloads/signatures against the deployed Verifier ABI.
3. Add canonical Verifier event/receipt parsing and independently reconcile the final transaction plus resulting balances.
4. Prove the exact underlying and USDC asset IDs, decimals, and deposit/withdraw routes.
5. Design and audit per-position reservation for Intents-ledger balances; an ordinary account balance is not locked collateral.
6. Run the partial-failure recovery and callback-receipt failure scenarios in Sandbox; unit coverage is not a substitute for deployed receipt/finality proof.
7. Independent security review before any real-asset use.
