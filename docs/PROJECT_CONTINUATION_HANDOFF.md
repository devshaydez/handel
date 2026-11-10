# Handel — Project Continuation Handoff

**Last updated:** 2026-11-09  
**Repository:** https://github.com/devshaydez/handel  
**Working base branch:** `feat/handel-archive-core`  
**Hackathon deadline recorded in the project plan:** 2026-11-14 23:59 UTC

> This file is the durable handoff for future ChatGPT conversations. Read it before doing more work. Update this file whenever scope, implementation, PRs, CI, credentials, deployment state, or release gates change. Do not assume facts not explicitly recorded here.

## 1. User's intended product and source of truth

The user's uploaded planning documents (including `HACKATHON.md` and the sprint/implementation plan) define the intended scope. Do not silently replace this scope with the narrower work already merged.

The intended product is Handel: fully collateralized European Calls and Puts on Ondo tokenized stocks, with physical settlement in the actual Ondo token and USDC, using NEAR Intents. The AI agent proposes strategies and assists the user, but must remain constrained by revocable on-chain permissions and policy enforcement. It must not bypass contract policy or custody controls.

The planned vertical slice includes:
- Live NEAR AI Cloud inference, using the user's available **$10 credit**.
- A working AI agent runtime/orchestration loop, not just a prompt or generic provider interface.
- Reliable market context and premium/strategy calculations; model output is not a price oracle.
- On-chain permissions, limits, allowlists and revocation.
- NEAR Intents routing for the actual supported Ondo tokenized stock assets and USDC.
- Fully collateralized option lifecycle: create, premium, exercise, expiry, payout and reconciliation.
- A usable frontend for wallet connection, option creation, AI assistant, positions and exercise.
- Reproducible end-to-end demo and hackathon evidence.

**Do not claim the product is complete, live, secure for real assets, or settled on-chain until the corresponding behavior is implemented and independently evidenced.**

## 2. Current honest status

The repository has meaningful contract, escrow, SDK, workflow and Testnet-readiness foundations. It is **not yet the complete product described by the plans**.

Current AI implementation is a provider-neutral gateway client and approval workflow. It is not a verified NEAR AI Cloud integration and not a complete agent runtime. The README explicitly describes a NEAR AI Cloud adapter as future work and the default demo as offline/mock.

Current contract/settlement architecture contains useful lifecycle state machines and escrow code, but the documented OptionsContract path does not yet prove actual collateral custody or NEAR Intents settlement. The settlement docs explicitly describe expected-transfer records and receipt-shaped reconciliation evidence; they do not prove that real assets were received or paid out. The current reconciler trust boundary needs independent review.

No real token transfer, Intents trade, account provisioning, storage funding, contract deployment, or mainnet asset movement has been performed in the work recorded below.

## 3. Repository and pull request state

Default/working base branch recorded: `feat/handel-archive-core`.

### Merged work
- PR #2 — Batch 1 / lifecycle and escrow foundation; merged. Commit: `d9c188ba29e51d2e39a44146c37fbcfbe7138178`.
- PR #3 — Batch 2 / settlement adapter and evidence workflow; merged. Commit: `8d34211a3ca4729178a318da12c8777d33f27b52`.
- PR #4 — Batch 3 / monitoring and ownership handoff; merged. Commit: `cb3c02485b00cb5259014a72fa9b5cc1d8be11d3`. CI #42610297142 passed.
- PR #5 — Batch 4 / AI provider-neutral gateway, proposal workflow and policy validation; merged. Commit: `94ad578f6219a53d2b4c8292ae8816dec160db1a`. CI #42654231798 passed.
- PR #6 — Batch 5 / deployment helper and release-readiness foundation; previously recorded as merged after user approval. Verify if exact merge metadata is needed.
- PR #7 — Batch 6 / Testnet infrastructure readiness; merged 2026-11-09. Merge commit: `e6a37f33aaac5249934be59a7dc6862ddfdcaf19`. PR head: `50c58c6981532a5d8c7831d1bdf6420388c3c0ca`. CI #42686870141 passed; PR-triggered CI #42686880752 passed.

### Open PRs — do not merge without explicit user approval
- **PR #8 — Documentation reconciliation:** https://github.com/devshaydez/handel/pull/8  
  Branch: `docs/reconcile-batch6-merge-status`. Documentation-only correction to `docs/ALL_BATCH_LIMITATIONS.md`. CI #42692094511 passed on `8f12e4fe3fda2fa3388968f3b6472dcae994898e`.
- **PR #9 — Testnet deployment preflight:** https://github.com/devshaydez/handel/pull/9  
  Branch: `work/testnet-deployment-preflight`. Adds fail-closed read-only deployment manifest validator, six tests, example manifest, runbook and CI checks. Last observed CI #42696820178 was **in progress**, not confirmed passed. Rust job had passed formatting and was installing cargo-near; Wasm build and Sandbox tests were still pending. Poll this run before making any claim about its final result.

### Current continuation handoff PR
This document is being added on branch `docs/project-continuation-handoff-2026-11-09` as a standalone documentation change. It must not overwrite or merge PR #8 or #9.



### Product refinement — assisted stock trading and beginner education (2026-11-09)

The user clarified that Handel is intended to be an **AI-assisted stock-trading product**, with options trading on Ondo tokenized equities as its initial protocol/execution mechanism. It must also educate beginners. The user wants automatic execution to be available when an individual user explicitly opts in; users who do not opt in retain recommendation-and-approval control.

The full durable requirements are in [`docs/PRODUCT_VISION_AND_AI_AUTONOMY.md`](./PRODUCT_VISION_AND_AI_AUTONOMY.md). Treat that document as a product requirement, not evidence that the features are already implemented.

Important scope distinction: current Handel contracts/SDK are designed around fully collateralized European options. Direct spot-equity buy/sell execution is **not established** by the current architecture. Do not claim that Handel can already buy or sell the underlying stock directly. Decide and document whether spot trading is a later execution rail or outside the initial hackathon vertical slice. The first delivery should truthfully support the actual options actions and explain their relationship to bullish/bearish stock views.

Autonomous execution is opt-in, bounded, auditable and revocable. It must not be implemented by giving the agent a user's full-access private key or seed phrase. The current NEP-413/full-access-key limitation remains unresolved and must be respected.

## 4. Remaining work grouped into three delivery batches

- **Batch 8 — Intelligence (Phases 14–16):** (14) NEAR AI Cloud verified inference and budget guard; (15) bounded AI agent runtime/tools/audit; (16) market-data adapter and deterministic premium/risk engine.
- **Batch 9 — Execution and safety (Phases 17–19):** (17) on-chain agent permissions/revocation and safe signing; (18) real Ondo/USDC NEAR Intents dry quotes, NEP-413 and settlement adapter; (19) actual collateral custody, physical settlement and independently verifiable proof.
- **Batch 10 — Product and release (Phases 20–22):** (20) frontend wallet/agent/options/positions integration; (21) end-to-end adversarial/security review and evidence; (22) reproducible demo, README, video/screenshots and hackathon submission.

Current branch `work/batch-8-ai-agent-intelligence` has initial code for Phases 14–15 and market-context validation groundwork for Phase 16. It does not yet have a configured official SDK install in a runtime, live key test, real market-data provider or deterministic premium model. CI must verify this branch before calling the batch CI-verified.

## 5. Work still required — ordered delivery backlog

### P0 — Establish a working, verifiable vertical slice
1. Re-read the original uploaded plan files and preserve their exact requirements and terminology.
2. Inspect the current repository tree and actual code before editing. Do not guess paths.
3. Reconcile PR #8 and #9 status and the current base branch SHA.
4. Implement and test the real NEAR AI Cloud integration described below.
5. Implement the agent orchestration and deterministic risk/policy tools.
6. Implement or prove the real NEAR Intents path for the planned Ondo assets and USDC, with dry-quote evidence first.
7. Connect the frontend to the real wallet/agent/contract flow, or identify the separate frontend repository if it is not in this repo.
8. Deliver one integrated demo path and evidence pack. Run CI after the grouped batch is complete rather than after every tiny change.

### P1 — NEAR AI Cloud integration (not done)
Current relevant code: `sdk/src/ai-provider.ts`, `sdk/src/proposal-workflow.ts`, `sdk/src/policy.ts`, `agent/PROMPT.md`, `sdk/package.json`.

Required:
- Add the official JavaScript/TypeScript package `@nearai/inference-sdk` and use its documented API; verify the exact import/API against current official docs before implementation.
- Configure via environment variables, e.g. `NEARAI_API_KEY`, `NEARAI_BASE_URL`, `NEARAI_MODEL`. Never hard-code, log, commit, or expose the key.
- Use the official gateway endpoint unless current official docs specify otherwise: `https://cloud-api.near.ai/v1/`.
- Perform Gateway/model deployment preflight/attestation verification and response signature verification using the official SDK. Fail closed on verification errors.
- Be precise about what is attested: a gateway signature alone is not proof of TEE execution; do not overclaim model TEE provenance.
- Preserve strict structured proposal schema validation and deterministic policy checks. LLM output is untrusted input.
- Add explicit usage controls to protect the user's $10 credit: request/token caps, call limits, bounded retries, rate limiting, cost/usage ledger, and a hard stop when the configured budget is reached. Do not invent a provider balance API or prices; use verified model pricing where available and conservative controls otherwise.
- Unit tests must use mocks and consume no credit. Live integration tests must be opt-in and run only when the repository secret exists. Never print the secret or raw authorization header.
- The user must add the API key as a GitHub Actions repository secret named `NEARAI_API_KEY` in repo Settings → Secrets and variables → Actions. The user must not paste it into chat. **As of this handoff, the secret has not been confirmed present and no live inference has been verified.**
- Record model ID, request IDs, verification results and usage metadata without storing secrets or unnecessary sensitive prompts.

Official references previously checked:
- `@nearai/inference-sdk` README: https://github.com/nearai/inference-sdk
- NEAR AI Cloud API: https://cloud-api.near.ai/v1/
- NEAR AI Cloud: https://cloud.near.ai

### P2 — Actual AI agent runtime and orchestration (not done)
Current prompt: `agent/PROMPT.md`. Current workflow is proposal preparation plus approval-before-signing, not a complete autonomous agent loop.

Required:
- Implement a host-controlled agent runtime with explicit bounded tools, structured inputs/outputs, timeouts and audit trail.
- Agent can read approved market data, supported asset metadata, contract state and the caller's on-chain permissions.
- Agent can propose Call/Put terms and explain assumptions, risks, freshness and calculations.
- Use deterministic pricing/risk/collateral calculations; model may explain or suggest, but may not invent prices, asset IDs, balances, permissions or execution results.
- Run proposal schema validation and policy checks before any wallet prompt or transaction construction.
- Enforce all limits on-chain; off-chain checks are defense-in-depth only.
- Agent must not have access to a user's full-access private key or seed phrase.
- Add adversarial tests for prompt injection, malformed outputs, stale/missing market data, unsupported assets, excessive quantity/premium, expired permissions, duplicate/replayed proposals and tool failures.
- Make agent actions auditable and replayable without leaking secrets.

### P3 — Permissions and safe signing architecture (not done / unresolved design)
Important constraint:
- NEP-413 signing requires a full-access key. Ordinary NEAR Function Call Keys cannot sign NEP-413.
- A full-access key grants broad account control. Do not hand it to an AI agent or label that arrangement safe delegation.
- Existing `sdk/src/intents.ts` builds NEP-413 payloads/envelopes but does not itself sign or submit them.
- Existing `approveAndSignAgentProposal` requires explicit user approval and delegates signing to a caller-provided connected wallet signer.

Required:
- Preserve explicit user approval for NEP-413 and asset-moving actions unless a separately reviewed safe delegated architecture is implemented.
- If autonomous pre-authorized actions are desired, design a constrained delegated account/key architecture and verify exactly which actions it can perform. Do not imply a Function Call Key can sign NEP-413.
- Implement permission grant, update, expiry, per-asset allowlist, quantity/premium caps, method restrictions and revocation; test revocation immediately blocks further actions.
- Verify any verifier-side key registration/removal requirements and ensure revocation is mirrored correctly.
- Document authority boundaries, threat model, recovery and compromised-key response.
- No private key/seed phrase should be requested in chat or stored in the repo.

### P4 — Market data, pricing and risk (not done)
- Inspect the sprint plan for the intended market-data source; do not silently choose a different provider.
- Implement a live data adapter with source, timestamp, asset identity, decimals and freshness metadata.
- Reject missing, stale, inconsistent or unsupported prices; never let the LLM supply an authoritative oracle price.
- Implement deterministic European option premium/valuation and payoff calculations consistent with the plan, with tests for Calls and Puts, expiry, precision, decimals, bounds and edge cases.
- Make all assumptions visible to the user and record the source/provenance used in a proposal.
- Do not call a quote live unless it was obtained from the actual source at runtime.

### P5 — NEAR Intents and Ondo asset route (not proven)
Current helper: `sdk/src/intents.ts`. Asset registry: `sdk/src/assets.ts`.

Known configured identifiers in code:
- USDC: `nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1`
- NVDAon: `nep141:bnb-0xa9ee28c80f960b889dfbd1902055218cba016f75.omdep.near`
- TSLAon: `nep141:bnb-0x2494b603319d4d9f9715c9f4496d9e0364b59d93.omdep.near`
- AAPLOn: `nep141:bnb-0x390a684ef9cade28a7ad0dfa61ab1eb3842618c4.omdep.near`
- SPYon: `nep141:bnb-0x6a708ead771238919d85930b5a0f10454e1c331a.omdep.near`

These are configured IDs, **not proof of current route support, liquidity, or successful settlement**. Verify each exact asset and route live.

Required:
- Implement the planned NEAR Intents integration, using current official API/SDK and the correct verifier/settlement evidence.
- Fetch dry quotes for both directions and capture route, amount, fees, minimum received, expiry and provider response evidence.
- Verify the actual Ondo token and USDC routes; do not substitute unrelated tokens or relabel test assets.
- Build and validate NEP-413 messages, obtain signature from the user's connected wallet, submit only after approval, poll status and reconcile independently.
- Prove finality and exact token/amount/recipient/operation matching; prevent replay and duplicate settlement.
- No actual transfer, swap, option creation with real funds, or mainnet trade without explicit user authorization.
- Keep all dry-quote and testnet evidence distinct from settled transaction evidence.

### P6 — Contract custody, collateral and settlement correctness (not complete)
Relevant docs: `docs/CUSTODY_AND_SETTLEMENT.md`, `docs/SETTLEMENT_ARCHITECTURE.md`; code includes `contracts/escrow/src/lib.rs` and the OptionsContract implementation (inspect actual tree/path).

Documented gaps:
- OptionsContract has no proven NEP-141 `ft_on_transfer` or NEP-245 `mt_on_transfer` collateral deposit handler in the documented path.
- Contract lifecycle records and expected-transfer records do not establish receipt of tokens.
- Contract does not control NEAR Intents internal balances.
- `reconcile_operation` accepts receipt-shaped evidence from a trusted account; independent verifier evidence is not yet demonstrated.
- Expiry release operation records do not themselves prove an external token transfer.
- Successful synthetic/offline lifecycle tests do not prove real custody.

Required:
- Trace actual escrow code and determine the exact supported deposit/payout standard and asset custody path.
- Implement or integrate real collateral reservation/custody with exact token, amount, owner, position and operation binding.
- Prevent under-collateralized positions and double-spend/double-release across concurrent calls.
- Use independently verifiable settlement evidence and finality, not an untrusted assertion.
- Test actual NEP-141/NEP-245 behavior, callback failures, retries, ambiguity, replay, partial payout and insolvency/under-collateralization.
- Review migration and Borsh compatibility before redeploying/upgrading existing state.
- No real-asset safety claim until independent security review and live end-to-end evidence.

### P7 — Frontend and user experience (missing / not wired)
Previous repo inspection found no complete frontend app in this repository; README says frontend was deferred. Re-check the repo and ask for the frontend repo only if necessary.

Planned UI flow:
1. Connect wallet and show account/network.
2. Select supported Ondo underlying and Call/Put.
3. Enter strike, quantity, expiry and see deterministic premium/collateral estimate.
4. Ask AI for a strategy/proposal with rationale, data freshness and risk.
5. Show contract-policy result and permission limits.
6. User reviews and explicitly approves.
7. Wallet signs the required message/transaction.
8. Show pending/finalized settlement and evidence.
9. Show positions, collateral, expiry, exercise and payout status.
10. Make errors, stale data, unsupported routes and unavailable services explicit.

No fake balances, fake fills, fabricated quotes or simulated transaction IDs in a live-mode UI. Demo/mock mode must be visibly labelled.

### P8 — Testnet, deployment and release operations (not complete)
PR #9 adds a read-only preflight manifest validator; it does not deploy or provision anything.

Known Tidepool Testnet discovery:
- Registry was queried on 2026-11-09. Six community-operated test tokens were found: USDC, USDT, wNEAR, wBTC, ETH, XAUT.
- NEAR token contracts: `usdc.tidepool-sandbox.testnet`, `usdt.tidepool-sandbox.testnet`, `wnear.tidepool-sandbox.testnet`, `wbtc.tidepool-sandbox.testnet`, `eth.tidepool-sandbox.testnet`, `xaut.tidepool-sandbox.testnet`.
- All six metadata/decimals were verified via two RPCs in CI. Shared code hash: `DgV3WsKJsGtCjNWxYzFvi599szo7oojkKXWCoGBBAHwj`. Owner `privacei.testnet`; provider root/maker are authorized minters. NEP-145 minimum storage deposit recorded as 0.00125 NEAR per token contract.
- Handel Escrow account does not yet exist, so its own storage registration is unverified. No storage registration/funding was performed.
- Tidepool is community-operated, Testnet only, not affiliated with NEAR/1Click, and does not provide Ondo stock-token settlement. Never use Tidepool test tokens as proxies for NVDAon/TSLAon/AAPLOn/SPYon.
- Sprint plan and hackathon file contain a conflict: sprint suggests Tidepool for generic Testnet development; `HACKATHON.md` Q-007 says no official Intents Testnet and requires Mainnet for Intents, with separate dev accounts and tiny amounts after dry quotes. Follow the hackathon-specific constraint for Ondo/Intents proof. Tidepool may only be used for generic test token flows.

Release gates still open:
- Dedicated OptionsContract and Escrow Testnet accounts; documented account-key policy.
- Explicit state disposition: fresh deploy, audited redeploy or migration-approved.
- Verified Wasm hashes and deployment approvals.
- Exact supported Testnet assets and NEP-145 storage registration/funding.
- Independent settlement event/proof source; reconciler trust boundary reviewed.
- Enforceable collateral custody/reservation.
- Deployed end-to-end premium, exercise, expiry, payout retry, ambiguous reconciliation and replay tests.
- Independent RPC/receipt verification and captured transaction evidence.
- Monitoring, alert delivery, incident response, key compromise and rollback runbooks.
- Independent security review.
- Explicit project-owner release approval.
- No deployment, provisioning, funding, transfer or key handling has been performed as part of the recorded work.

### P9 — Hackathon demo and evidence
- Build one reproducible path from wallet connection → live market context → verified NEAR AI proposal → deterministic policy checks → user approval → Intents dry quote / authorized execution → contract state and settlement evidence → position view.
- If actual settlement is not safe/available, clearly show the boundary and provide a truthful mock/testnet path without claiming real settlement.
- Capture reproducible commands, test results, transaction IDs, quote snapshots, attestation/verification metadata, screenshots and a short demo script.
- Update README to accurately distinguish implemented, mocked, testnet-verified, mainnet-dry-quoted and actually settled behavior.
- Prepare hackathon submission materials only after the vertical slice is demonstrable.

## 5. Security and operational rules

- Never ask the user for a seed phrase, private key or raw API key in chat.
- Never commit secrets or print them in logs/artifacts.
- User confirmed adding `NEARAI_API_KEY` as a GitHub Actions repository secret. Do not ask them to paste it. Backend runtime configuration and live inference still need verification.
- Do not sign or submit real-asset transactions without explicit user approval.
- Do not deploy contracts, provision accounts, fund storage or move tokens without explicit user approval.
- Do not merge PRs without explicit user approval.
- Do not claim CI passed until the run is completed with success.
- Do not treat a passing CI, local simulation, mock quote, dry quote or deployment-preflight validation as proof of custody/settlement.
- Fail closed on stale data, unsupported assets, invalid agent output, policy failures, attestation failures, missing permissions and uncertain transaction outcomes.
- Preserve idempotency, replay protection, exact amount/token/account binding and auditable operation state.

## 6. User workflow preferences for future chats

- Execute the work directly in GitHub where possible; user is on Android and does not have Termux.
- Keep updates concise and substantive. Avoid repeated “continue?” interruptions.
- Group related implementation into a coherent batch; run CI after the batch rather than for each small change.
- Do not claim background work. Work in the current turn and report actual results.
- Keep a running limitations/release-gates document, updating it from the first batch through final release.
- Do not merge PRs without explicit approval.
- User wants the full planned scope, not just the contract/SDK foundation.

## 8. Exact next actions when resuming

1. Read this file first.
2. Check current repo default/base branch and PR #8, #9, plus this handoff PR. Poll CI #42696820178 for PR #9; do not assume it passed.
3. Re-read `HACKATHON.md`, sprint plan and `docs/ALL_BATCH_LIMITATIONS.md` from the repository/current attachments. Resolve discrepancies by preserving source requirements and documenting conflicts.
4. Inspect the actual repo tree, especially `sdk/src/ai-provider.ts`, `sdk/src/proposal-workflow.ts`, `sdk/src/policy.ts`, `sdk/src/intents.ts`, `sdk/src/assets.ts`, `agent/PROMPT.md`, `contracts/escrow/src/lib.rs`, the actual OptionsContract path, package manifests and any frontend directories.
5. Ask the user to add `NEARAI_API_KEY` as a GitHub Actions secret only when needed for a live inference test. Do not ask them to paste it. Proceed with mock/unit implementation while waiting.
6. Implement the NEAR AI SDK adapter, verified inference, $10 budget controls and tests as one cohesive batch.
7. Implement the bounded agent runtime and deterministic tool/policy integration.
8. Continue with live market data, Intents route validation, custody/settlement proof and frontend wiring in grouped batches, keeping each gate explicit.
9. Run CI once the cohesive batch is complete; fix all failures before opening/updating its PR.
10. Present a truthful demo/release readiness matrix. Never imply mainnet readiness without evidence.

## 9. Status vocabulary

Use these labels consistently:
- **Implemented:** code exists and is reviewed; does not imply live operation.
- **Unit-tested:** isolated tests pass.
- **CI-verified:** the relevant complete CI run passed on the exact commit.
- **Live-read verified:** external read-only endpoint/RPC data was retrieved and checked.
- **Dry-quoted:** route quote exists; no transaction submitted.
- **Testnet-executed:** transaction executed on Testnet with transaction evidence.
- **Mainnet-executed:** transaction executed on Mainnet with transaction evidence and explicit approval.
- **Independently verified:** evidence checked independently of the component making the claim.
- **Blocked:** missing external prerequisite or unresolved design/security decision.

Never use one status label as a substitute for another.

## New durable product requirement — AI education and decision accountability

See [`docs/AGENT_EDUCATION_AND_DECISION_ACCOUNTABILITY.md`](./AGENT_EDUCATION_AND_DECISION_ACCOUNTABILITY.md). This requirement applies across Batches 8–10: one agent combines contextual education with permissioned trading; every consequential action and no-trade decision must have a traceable, evidence-grounded explanation and durable decision record. Education never grants trading authority. This is a product requirement, not evidence of implementation. Do not omit it from future handoffs, implementation plans, acceptance tests, or release reviews.


## Batch 9 progress — Execution & Safety (Phases 17–19)

Work is underway on branch `work/batch-9-execution-safety`, stacked on Batch 8 branch `work/batch-8-ai-agent-intelligence`.

- Phase 17: implemented on-chain Education/Advisory/ManualApproval/Delegated modes (new policies default to ManualApproval), principal-only mode changes, direct Call/Put gating, live-policy approval checks, approval-time revalidation against changed principal/caps/assets/expiry/position terms/open-position count, and SDK stale-snapshot/mode preflight. Tests added; integrated CI passed on code commit `95278bf7b2b13425b928c0e6bdec982a2c63b8f6` (run [#42708258643](https://github.com/devshaydez/handel/actions/runs/42708258643)).
- Phase 18: added connected-wallet NEP-413 signing boundary, distinct-nonce paired intent validation, read-only finality simulation, and SHA-256 binding of the exact signed pair/verifier to the simulation before explicit-approval wallet submission. No private key handling. Verifier Mainnet-only; no Mainnet transaction or asset movement performed.
- Phase 19: added NEP-141 escrow transfer_call builder and regression coverage for partial exercise payout recovery (confirmed payment leg is never repeated when collateral payout fails). Existing Escrow ft_on_transfer validates exact sender/token/amount/position/leg. Payout remains sequential; trusted reconciler, independent finality proof, exact Ondo route and Intents-ledger reservation remain open.
- Batch 9 detail: [BATCH_9_EXECUTION_SAFETY.md](./BATCH_9_EXECUTION_SAFETY.md).
- AI security architecture: [AI_GUARDRAILS_AND_TEE_ARCHITECTURE.md](./AI_GUARDRAILS_AND_TEE_ARCHITECTURE.md). NEAR TEE attestation is not a substitute for deterministic trade/risk/authority gates; E2EE/OHTTP and System One guardrails remain integration work.
- Project-wide remaining gates: [ALL_BATCH_LIMITATIONS.md](./ALL_BATCH_LIMITATIONS.md).

Batch 9 is not complete until all phases are implemented, the full branch passes one final integrated CI run, and the outstanding custody, verifier, wallet, and security-review gates are accurately recorded. No deployment, signing, funding, or asset movement is implied by SDK helpers or passing CI.


## Batch 10 continuation — 2026-11-10

The user explicitly chose to build the frontend manually. Batch 10 must not create frontend pages, CSS, UI framework setup, or visual design. Work on the SDK/backend integration contract, adversarial tests, documentation, and reproducible release evidence only.

- Batch 9 exact head `115ffd10e47f98d6548a8192c612f9d1bfc3958e` passed integrated CI run #42729697264 (Rust, SDK, read-only Testnet asset/verifier/dry-quote jobs).
- Batch 9 PR #12 remains open; do not merge without explicit user approval.
- Batch 10 branch: `work/batch-10-product-release`, initially based on the verified Batch 9 head.
- Batch 10 first commit: `313b69ad94a943c8e3951ea8b27013ae7f842313`.
- Added `sdk/src/frontend-contract.ts` and its tests. It defines typed portfolio/position/operation/agent/proposal DTOs, wallet-backed host adapter interfaces, exact string handling for u64/u128, and distinct submitted/finality/unknown states.
- Added `docs/BATCH_10_PRODUCT_RELEASE.md` and `docs/MANUAL_FRONTEND_INTEGRATION.md`.
- Exported the new contract from `sdk/src/index.ts`.
- CI workflow is being extended to run for Batch 10 pushes and a stacked PR targeting Batch 9.
- No frontend source or live wallet/contract integration has been created. The new port is a typed integration contract; host adapters and the manually authored frontend remain future work.
- No deployment, wallet signing, funding, or asset movement was performed.

- Batch 10 follow-up commit `7ff955d1a8ed77ac416c2ed9a7c8ae28c9f8c9b9` adds typed raw token balances to portfolio snapshots, validates amount/decimals/provenance metadata, and documents that `OperationView` is lifecycle activity rather than exchange fill history. It also records the Rust-backed distinction that agent proposal creation is agent-signed while approval/rejection are principal-signed.
- Batch 10 follow-up commit `b2891bb177edf35de558cd43eeb71126caa4e11a` rechecks Wallet Selector account presence after the signing prompt and binds the returned public key to the account key when Wallet Selector exposes it. This narrows account-switch races; it does not replace a browser-level test with the actual selected wallet implementation.

- Batch 10 follow-up commit `6fefc45cd346a8de5c28b6b2f96e8db05b707aa7` binds agent-policy reads to both principal and agent ID and rejects portfolio responses whose completeness flag is not a boolean.
- Batch 10 follow-up commit `265ed57c800bef99d96267598be4bbaecb606e54` rejects zero-valued agent proposal terms before invoking the connected agent wallet.


## 2026-11-10 — Batch 11 AI verification correction

The live NEAR AI workflow now verifies two deliberately separate paths:

- Chat proposal inference: `deepseek-ai/DeepSeek-V4.1-Flash-1017`, with E2EE and OHTTP enabled, Ed25519, zero attestation cache TTL, UpToDate Gateway/model TEE evidence, and a `provider_tee` response signature. The live smoke returned the expected sentinel response. This validates the provider connection and cryptographic response path only; it does not validate a trading proposal, market data, wallet, or execution.
- System One screening: `levanto/sage-2`, with E2EE/OHTTP disabled as required. The live smoke verified an UpToDate Gateway and a Gateway-signed decision. The model returned no model-attestation reports; therefore the evidence is **Gateway TEE + Gateway receipt**, not proof that the System One model itself executed in a TEE. The runtime now requires an explicit `signaturePolicy` of `gateway` or `provider_tee`; there is no automatic downgrade. Gateway mode is suitable only as a non-authoritative screening signal alongside deterministic policy checks. If a deployment requires model-level TEE for System One, configure `provider_tee` with model signer and measurement allowlists and fail closed when unsupported.

The SDK tests now cover both explicit policies, missing model attestations, signer allowlists, and signature-policy mismatch. The first CI attempt exposed a test assertion that still expected the old error text; it was corrected. The follow-up TypeScript job passed. Full Rust, live AI, and final CI status must be read from the newest workflow run for the branch, not inferred from an earlier run.

The live smoke does **not** mean the Handel agent is a deployed/always-on service. `HandelAgentRuntime` remains an orchestration component requiring a trusted market-evidence adapter, validated premium inputs, durable decision storage, and a separately authorized execution service. No Testnet trade or real-asset settlement has been executed.

## Remaining release blockers after Batch 11

1. No approved authoritative spot/volatility oracle for the exact Ondo instruments; Ondo display feeds and soft quotes must not be promoted to execution/risk prices.
2. No proven live Handel collateral reservation/custody path for the exact Ondo assets through NEAR Intents.
3. No live end-to-end Testnet option lifecycle using a Handel-deployed contract and wallet, including final transaction/receipt inspection.
4. Settlement verification still depends on a configured trusted verifier/reconciler and one RPC endpoint; independent proof/quorum and production recovery remain outstanding.
5. No always-on backend agent service has been deployed. The user is building the frontend manually; do not modify frontend files.
