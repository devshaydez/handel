# Handel — project-wide limitations and release register

**Scope:** All work from Batch 1 through the remaining release phases (Phases 1–13).  
**Last reconciled:** 2026-11-09  
**Source of truth:** This document is the project-wide register. Batch implementation notes and the backend gap register provide technical detail; this file keeps every unfinished item visible across batches.

## Status rules

- **Implemented:** code is present; this alone does not mean independently validated.
- **CI/Sandbox validated:** the relevant automated checks or Sandbox scenarios passed on the stated commit.
- **External integration pending:** requires a real service, wallet, asset, deployed contract, or independently operated infrastructure.
- **Open limitation:** known incomplete work. Do not mark complete merely because an interface, mock, unit test, or dry-run exists.

## Batch 1 — Phases 1–3: premium lifecycle, cross-contract synchronization, payout recovery

PR #2 was squash-merged as `d9c188ba29e51d2e39a44146c37fbcfbe7138178`. Its recorded CI run passed Rust formatting/unit tests, optimized Wasm builds, callback-failure Wasm, Sandbox integration tests, SDK build/tests, and the offline lifecycle demo. Sandbox assets were mocks.

### Implemented / validated
- Persistent OptionsContract and Escrow position records with distinct storage prefixes.
- Idempotent OptionsContract-to-Escrow registration, immutable terms, pinned escrow/token accounts, callback handling, and retry.
- Versioned Escrow premium sidecar; exact holder/token/amount checks for premium intake; asynchronous premium payout/refund.
- Authenticated, sequenced Escrow lifecycle outbox with replay protection and permissionless resend of stored events.
- Evidence-attested recovery for ambiguous premium, exercise, and expiry payout outcomes.
- SDK operation journal and lifecycle event cursor; wallet signing remains external.
- Sandbox coverage for Call/Put premium/exercise lifecycle, replay/gap recovery, registration callback failure/retry, and expiry payout callback failure/reconciliation.

### Open limitations
1. **Expiry propagation is not fully end-to-end.** Escrow expiry release and OptionsContract Expired-event mapping have separate coverage, but the combined OptionsContract expiry-event propagation scenario remains open.
2. **Evidence attestation is a trust assumption.** The configured reconciler is human-governed; it is not a trustless proof or an independent source-chain verifier. A production verifier service, independent receipt inspection, and broader adversarial tests remain required.
3. **Payout legs are sequential and non-atomic.** Payment-to-writer and collateral-to-holder can partially settle. Definitive failures retry only the failed leg; ambiguous outcomes must remain frozen until independently evidenced. Token pause/blacklist, unavailable-recipient policy, compensation, and complete operational recovery remain open.
4. **Settlement-rail exclusivity needs full lifecycle proof.** The competing rail is blocked for registered escrow positions in tested paths, but reconfiguration, retries, every terminal state, and all lifecycle combinations need systematic double-execution tests.
5. **Registration recovery still needs deployed integration evidence.** Sandbox fault injection passes; a separate end-to-end deployment test has not been performed.
6. **Premium callback failure coverage is incomplete.** The premium lifecycle is Sandbox-tested, but dedicated premium callback-failure injection remains a release gate.
7. **Legacy storage migration is unresolved.** No exact legacy Borsh root-state migration or approved redeployment/migration plan has been completed.
8. **Production asset and token-account readiness is not established.** Tests use mock assets and pre-registered token accounts. Real token compatibility, NEP-145 registration/funding, payout-recipient storage failures, and real Testnet verification remain.

## Batch 2 — Phases 4–6: asset routes, settlement verification, transaction orchestration

PR #3 was squash-merged as `8d34211a3ca4729178a318da12c8777d33f27b52`. CI #275 passed on commit `8fe0f24`.

### Implemented / validated
- Tidepool 1Click-compatible Testnet adapter with live token discovery, dry quotes, explicit deposit-address opt-in, deposit notification/status polling, and MEMO validation.
- Settlement evidence binding operation/position/action/asset/amount/sender/receiver/transaction/receipt/event index, finality checks, replay protection, and durable evidence snapshots.
- NEAR FINAL-level receipt inspector with exact receipt selection, configured executor check, block identity validation, and strict `handel.settlement.v1` event decoding.
- Crash-safe wallet operation runner and durable file-backed journal; ambiguous submissions become `outcome_unknown` and are not automatically resubmitted.
- Wallet signing stays in the connected wallet; Handel does not custody wallet private keys.

### Open limitations
1. **No supported Ondo route.** Tidepool's published Testnet registry does not list Handel's Ondo stock identifiers (NVDAon, TSLAon, AAPLon, SPYon). Do not claim or attempt Ondo settlement until a supported route, exact token IDs/decimals, custody model, and enforceable per-position reservation are demonstrated.
2. **No live settlement event producer is deployed.** The inspector expects a canonical `handel.settlement.v1` event, but the current OptionsContract and Tidepool adapter do not emit it. The inspector is an integration boundary, not proof of a live settlement path.
3. **RPC trust is centralized.** A single RPC endpoint is an infrastructure trust assumption. Independent RPC operators/quorum, reorg/finality policy, and stronger verification (or a light client where appropriate) remain.
4. **Durable orchestration is not multi-instance production infrastructure.** The file snapshot store is single-process. A transactional database-backed store, hosted worker, locking/lease model, credential provisioning, and operational recovery remain.
5. **Wallet and event integration remain incomplete.** Production wallet selector integration, canonical event ingestion, escrow-state indexer, and definitive-failure-only retry worker are not deployed.
6. **No live Testnet proof.** No live Tidepool deposit, wallet-signed Testnet settlement, or Testnet contract deployment has been performed. Never send real assets to the community-operated custodial Testnet deposit adapter.

## Batch 3 — Phases 7–9: monitoring, storage economics, administrative security

PR #4 was squash-merged as `cb3c02485b00cb5259014a72fa9b5cc1d8be11d3`. CI run #42610297142 passed before merge.

### Implemented in the current PR branch
- SDK operation/position status counters, configurable stuck-state thresholds, bounded in-memory event retention, and normalized event fields.
- Escrow per-position serialized-record storage-cost estimate using the current NEAR storage byte price; estimate-only and refund-unavailable are explicit.
- Two-step propose/accept ownership handoff for OptionsContract and Escrow, and two-step Escrow controller/payout-reconciler acceptance.

### Open limitations
1. **Monitoring is not production observability.** Durable telemetry sink, multi-instance aggregation, contract event/indexer ingestion, authoritative state reconciliation, alert delivery, dashboards, SLOs, runbooks, alert deduplication, and clock-skew policy remain.
2. **Storage estimate is not exact trie accounting.** Exact per-record storage delta (including trie/key/value overhead), aggregate reserve accounting, bounded overpayment policy, and gas/storage regression thresholds remain.
3. **No safe archival/refund lifecycle.** No pruning/archival or storage refund path exists. Any future process must preserve audit/legal evidence and never remove unsettled positions; storage stake is not automatically refundable.
4. **Admin handoff is not complete governance.** Pending-change cancellation/expiry/replacement, timelocks, multisig, role separation (owner/guardian/controller/treasury/reconciler), emergency recovery/break-glass policy, pending authority views, and admin audit alerts remain.
5. **Account keys are outside contract control.** NEAR access-key rotation/revocation and key-compromise procedures require account-level operations and a reviewed runbook; propose/accept contract methods do not rotate account keys.
6. **Deployment compatibility remains unproven.** Persistent-state migration and authority-transition review must precede upgrades to any already deployed account.

## Batch 4 — Phases 10–12: AI provider, UI/backend integration, adversarial testing

PR #5 was squash-merged as `94ad578f6219a53d2b4c8292ae8816dec160db1a`. CI run #42654231798 passed on rebased head `2b5d6f17a81c7f8216900e335387e4af3fd7a459`.

### Implemented in the Batch 4 branch (CI validated)
- Provider-neutral SDK client for a Handel-controlled AI backend gateway, with HTTPS enforcement (localhost development exception), bearer authentication, bounded response size, request timeout, process-local sliding-window rate limiting, strict response envelope/proposal schema, configured model identity, stable error codes, and request/response SHA-256 provenance.
- Deterministic fallback when no backend key is configured; fallback makes no network request. Configured-provider errors fail closed rather than silently substituting a model result.
- Explicit proposal preparation/preview and a separate approval-gated connected-wallet signer callback. The SDK does not hold keys or sign server-side; signer is not called without affirmative approval.
- Hardened uint256 decimal-string policy parsing, bounded identifiers, permission-bound validation, and adversarial/boundary tests.

### Open limitations / external gates
1. **No live AI provider is configured.** No vendor, endpoint, model, backend secret manager, shared/distributed rate-limit store, budget/quota policy, durable audit sink, or production monitoring is provisioned. The SDK expects a Handel-controlled gateway; deployment and real provider contract tests remain. No live provider credentials are stored in the repository.
2. **No existing UI application is present in this repository tree.** Phase 11 currently supplies a typed SDK boundary only. Actual UI screens, wallet adapter, position queries/indexer, status subscriptions, recovery UX, and production API deployment remain external integration work and require the UI/backend repository.
3. **Adversarial coverage is partial.** Tests cover malformed/extra provider fields, oversized responses, model mismatch, rate limiting, approval gating, amount parsing and policy boundaries. Comprehensive property/fuzz coverage for malicious NEP-141 callback messages, all timestamp overflow paths, callback ordering, and partial/ambiguous settlement state machines remains.
4. **Independent security review remains outstanding.** Access control, callback handling, storage/migration, pause semantics, payout recovery, verifier trust, and key-management boundaries require independent review before real-asset use.

## Batch 5 — Phase 13: Testnet deployment and release readiness

PR #6 was squash-merged as `a8f2cd3bca854a8774a9de71d2ed8ddcb2973f9a`. CI run #42676957790 passed both Rust/Sandbox and SDK jobs on exact head `81c41fe44db85dfca57928960f2a5a7757bf0bdf`.

### Implemented / CI-validated
- Safe-by-default Bash and PowerShell deployment helpers for OptionsContract.
- Explicit Testnet confirmation, deterministic artifact selection, SHA-256 display, deploy-only default, and opt-in one-time initializer.
- Testnet runbook with preflight, post-deployment verification, evidence capture, and release gates.

### Remaining release gates
- Dedicated OptionsContract and Escrow Testnet accounts and verified account-key policy.
- Escrow deployment/configuration and authority handoff execution on Testnet.
- Exact supported Testnet token IDs/decimals and NEP-145 registration/storage funding.
- Supported-asset deposit and wallet-signed settlement, with independently inspected receipts, events, resulting contract state, and token balances.
- End-to-end premium, exercise, expiry, payout retry, ambiguous-outcome reconciliation, and duplicate/replay tests on deployed contracts.
- Independent verifier/RPC configuration and operational monitoring/alert delivery.
- Migration/redeployment decision for existing persistent state, documented rollback and recovery plan.
- Independent security review sign-off and explicit release approval.

No Testnet deployment, token transaction, or release approval is claimed.

## Infrastructure readiness — Escrow deployment foundation

PR #7 was squash-merged into `feat/handel-archive-core` on 2026-11-09 as `e6a37f33aaac5249934be59a7dc6862ddfdcaf19`. The exact PR head `50c58c6981532a5d8c7831d1bdf6420388c3c0ca` passed the complete backend workflow before merge: [CI #42686870141](https://github.com/devshaydez/handel/actions/runs/42686870141). The PR-triggered validation also passed: [CI #42686880752](https://github.com/devshaydez/handel/actions/runs/42686880752).

### Implemented / CI-validated
- Dedicated Bash and PowerShell Escrow deployment helpers.
- Explicit `.testnet` account validation and Testnet confirmation required before invoking near-cli.
- Deterministic Escrow artifact path: `target/near/handel_escrow/handel_escrow.wasm`; no arbitrary Wasm fallback.
- Deploy-only default; one-time `new` initialization requires a separate explicit flag.
- SHA-256 artifact identity and existing-account/keychain preflight messaging.
- Mocked Bash regression tests for missing confirmation, non-Testnet account rejection, deploy-only behavior, and explicit initialization.
- CI trigger and Bash safety checks extended for this infrastructure branch.
- Runbook documents the two-step Escrow controller handoff, token-account mapping, and trusted reconciler/payout-reconciler setup sequence.
- Tidepool's live provider token registry observed 2026-11-09 and six NEAR-side token IDs/accounts/decimals recorded in `config/testnet-assets.tidepool.json`.
- SDK exposes distinct Tidepool Testnet USDC and wNEAR asset IDs; production/mainnet asset constants remain distinct.
- OptionsContract supports owner-only configuration of its USDC asset ID using a dedicated versioned storage key, preserving the serialized contract root layout. Configuration rejects missing, disabled, or non-six-decimal assets; existing deployments retain the previous mainnet USDC default unless explicitly changed.
- A read-only dual-RPC asset-verification script and CI job check the published registry against NEAR Testnet contract metadata, code hashes, owner/minter configuration, NEP-145 storage bounds, and provider-account storage balances. The final CI run passed using FastNEAR and dRPC.

### Still open — external release gates
- Provision dedicated OptionsContract and Escrow Testnet accounts and approve the account-key policy outside the repository.
- Verify the intended Handel Escrow account's own `storage_balance_of` after its account ID exists; provider-account checks do not substitute for this.
- Execute deployment only after explicit deployment approval and verified account/commit/artifact mapping.
- Independently verify deployed code hashes, initialization state, authority views, and transaction receipts.
- Complete NEP-145 registration/storage funding for the actual Handel accounts; no token transfer or storage funding has been performed by this work.
- Implement or configure independent settlement evidence production and verification; the current reconciler remains a trust root.
- Complete deployed synthetic-asset lifecycle tests (premium, exercise, expiry, payout retry, ambiguous-outcome reconciliation, duplicate/replay) and independent security review.
- Resolve the broader Batch 1–5 limitations above, including migration/redeployment, payout non-atomicity, governance, production monitoring, UI integration, and live AI-provider configuration.

No Testnet deployment, token transaction, account provisioning, or release approval is claimed. Passing CI and read-only token verification do not make the contracts safe for real assets or Mainnet.
 
## Cross-cutting limitations and rules

- **No mainnet or real-asset readiness claim** follows from CI or Sandbox tests.
- **No Testnet-deployed/Testnet-verified label** until actual deployment and real Testnet transactions have been independently inspected.
- **No automatic retry after ambiguous submission or payout.** Unknown outcomes must be reconciled with authoritative evidence first.
- **No wallet private keys or seed phrases** are handled by Handel SDK code.
- **No unsupported Ondo route** may be inferred from ticker similarity or a generic bridge adapter.
- **No destructive migration, archival, refund, or contract upgrade** should occur without an audited state/accounting plan and explicit release approval.
- Every limitation should have an owner, implementation/test evidence, and closure criterion before being marked resolved.

## Closure checklist

For each item, record:
- [ ] Code or infrastructure change landed.
- [ ] Unit/property tests added and passing.
- [ ] Sandbox/integration test passed where applicable.
- [ ] Testnet evidence captured where applicable.
- [ ] Security/review sign-off obtained where required.
- [ ] Documentation and operational runbook updated.
- [ ] Status changed here with commit/run/evidence references.


## Testnet deployment preflight — implementation in progress

Branch `work/testnet-deployment-preflight` adds a fail-closed, read-only deployment manifest validator, a non-secret example manifest, and regression tests. It requires distinct OptionsContract/Escrow `.testnet` accounts, exact Wasm SHA-256 hashes, operator/key-policy attestation, explicit state disposition, reviewed rollback plan, independent security review, explicit deployment approval, and enabled assets with verified metadata plus NEP-145 registration for both contracts. It rejects placeholders and credential-bearing fields. CI runs the Node syntax check and regression suite.

This is a preflight guard, not deployment automation or independent proof of the attestations. No populated manifest is checked in, and no accounts, keys, storage deposits, deployments, or token transfers are created by it. Actual account provisioning, account-specific storage verification, approvals, and deployed lifecycle evidence remain external gates.

## Batch 8–10 continuation plan (2026-11-09)

- Batch 8 — Intelligence: NEAR AI Cloud verified inference and budget guard; bounded agent runtime; market data and deterministic premium/risk engine. Initial SDK adapter, model-attestation gate, provider-TEE receipt gate, conservative local reservation ledger, market snapshot validator and host-side premium override have been added on `work/batch-8-ai-agent-intelligence`. These are implementation foundations only; no live NEAR AI request, live market feed or production pricing engine is verified. The budget ledger is process-local and the optional official SDK must be installed in the runtime.
- Batch 9 — Execution and safety: on-chain permissions/revocation and signing model; Ondo/USDC NEAR Intents route verification and NEP-413; real collateral custody, physical settlement and independent proof.
- Batch 10 — Product and release: frontend integration; end-to-end adversarial/security testing and evidence; reproducible demo and hackathon submission.

## Cross-batch product requirements — AI education and decision accountability

Tracked in [`docs/AGENT_EDUCATION_AND_DECISION_ACCOUNTABILITY.md`](./AGENT_EDUCATION_AND_DECISION_ACCOUNTABILITY.md). These are open acceptance requirements across Batches 8–10, not completed features: the same agent must teach in context and trade only under the user's selected authority mode; each consequential action, rejection, and no-trade decision must be linked to a durable, evidence-grounded decision record. User-facing explanations must distinguish proposals from confirmed execution and must never invent evidence or outcomes. Close only with implementation, tests, and auditable evidence.

## Batch 9 — Phases 17–19: execution and safety (implementation foundations CI-verified; live integration/release gates remain)

### Phase 17 — bounded agent authority: implemented in branch; final integrated CI pending
- Added on-chain Education, Advisory, ManualApproval and Delegated execution modes, stored separately from AgentPolicy to avoid changing its Borsh value layout. New policies default to ManualApproval; only the principal may change the mode.
- Direct delegated Call/Put methods require explicit Delegated mode and enforce live/revocable policy, allowlist, caps, expiry and open-position limits. Expired positions are excluded from the count.
- Manual proposal creation/approval requires ManualApproval mode and a live policy; approval revalidates current principal, asset, caps, expiry, position terms and open-position count. Revocation, principal rotation, or reduced limits cannot grandfather an unsafe pending proposal. Education/Advisory modes cannot trade.
- SDK preflight now rejects stale/future snapshots, invalid principal and Education/Advisory trading attempts. It remains a preflight; contract checks are authoritative.
- Rust tests cover safe default, principal-only policy updates and mode changes, education/advisory denial, revocation before manual proposal approval, and approval-time revalidation after policy changes.
- Integrated CI run [#42708258643](https://github.com/devshaydez/handel/actions/runs/42708258643) passed on code commit `95278bf7b2b13425b928c0e6bdec982a2c63b8f6`.
- Added connected-wallet NEP-413 signing boundary: explicit approval, connected-principal match, verifier allowlist, signer/deadline/intent checks; no private-key handling.
- Added paired NEAR Intents execution helpers: signed-intent validation with distinct nonces, read-only simulate_intents RPC call, and explicit-approval execute_intents wallet callback. Simulation is bound to the exact signed payload pair and verifier using SHA-256; mismatched payloads cannot reuse a prior simulation.
- Added SDK NEP-141 escrow transfer_call argument builder for collateral, premium, and exercise payment. uint64 position IDs are preserved as exact JSON integer text.
- Existing Escrow contract implements exact-token/sender/amount/position/leg validation in ft_on_transfer and rejects invalid transfers by returning the full amount.
- Initial SDK build, SDK unit tests and live read-only Tidepool dual-RPC asset verification passed on an earlier Batch 9 commit. Rust CI was still running; later Rust changes and latest Phase 18/19 helpers require a final integrated run.

### Open limitations / release gates
1. **Permission mode does not solve signing authority.** On-chain modes now gate proposal/delegated position creation, but no production key architecture grants the agent a narrow, revocable NEP-413 signing capability. Never provide an AI service with a user's unrestricted full-access key. NEP-413 wallet signing remains a user-wallet action unless a separately audited delegated authority is implemented.
2. **Wallet integration is an adapter, not a deployed wallet selector.** The SDK accepts a connected-wallet callback; a real wallet selector, key registration checks, signature-format verification, and end-to-end wallet tests remain.
3. **NEAR Intents Testnet is unavailable.** The Verifier is Mainnet-only according to its official integration documentation. No Mainnet signing, submission, or asset movement has been performed. Tidepool is a separate community Testnet and does not prove Ondo asset support.
4. **No production Ondo route is proven.** Exact Ondo stock token IDs, decimals, deposits, withdrawals, and verifier support remain unverified. Do not map Tidepool test assets to NVDAon, TSLAon, AAPL on or SPYon.
5. **No per-position Intents-ledger collateral reservation.** A balance inside intents.near is not automatically locked for a Handel option. A separately audited reservation mechanism is required before claiming fully collateralized options.
6. **Intents simulation is not settlement proof.** simulate_intents validates the verifier's proposed ledger execution, not external NEP-141 withdrawal callbacks or cross-chain settlement. Canonical event parsing, final transaction proof, balance reconciliation and ambiguous-outcome handling remain.
7. **Escrow exercise payouts are sequential, not atomic.** The first payout may succeed while the second fails. The position must remain in recovery/reconciliation; no automatic duplicate payout based on timeout is safe.
8. **Reconciler remains a trust root.** The configured account can attest to ambiguous payout outcomes; this is not a trustless light-client or verifier proof. Independent proof and audit remain.
9. **Independent security review and deployed end-to-end tests remain mandatory.** No Mainnet/real-asset readiness is claimed.
