# Final backend readiness — frontend excluded

**Scope:** backend, SDK, AI, contracts, Testnet preparation, proof automation and release evidence. The frontend implementation is intentionally excluded.

This document separates code that exists from the external setup needed to run the UI against a deployed Testnet contract. A green Sandbox proof is not a live Testnet trade.

## 1. Backend code delivered in this slice

- [x] Rust OptionsContract, Escrow and mock NEP-141 token contracts.
- [x] Contract policy checks, pending agent proposals, separate principal approval, collateral/escrow lifecycle, exercise and settlement callbacks.
- [x] TypeScript SDK build, policy validation, wallet-intent builders, frontend contract adapter and offline lifecycle.
- [x] Official NEAR AI Chat provider with explicit Gateway/model signer and TEE measurement allowlists, response-signature verification and a shared request-budget ledger.
- [x] Separate System One safety guard. Its configured evidence is Gateway-signed; it is not claimed to be an independently model-TEE-attested classifier.
- [x] Education-only answer path using the attested Chat provider and System One guard. It cannot create or submit a trade.
- [x] Advisory proposal path that rejects term mutation, validates the permission snapshot, replaces model premium/payoff claims with a fixed demo fixture, and always returns executionEligible=false.
- [x] Advisory-to-contract preparation path with an explicit advisory-only evidence mode.
- [x] Separate signer boundaries: the agent account submits create_agent_proposal; the principal account separately approves approve_agent_proposal.
- [x] Put proposal preflight includes the on-chain max_collateral_usdc cap.
- [x] Localhost HTTP service keeps NEARAI_API_KEY server-side, reads the agent policy and execution mode at NEAR finality, requires same-block reads and ManualApproval mode, and exposes education and advisory routes.
- [x] CI live-AI smoke exports the verified proposal and SDK-prepared call arguments; the Sandbox proof consumes those exact prepared arguments.
- [x] Windows PowerShell and Bash proof runners.

## 2. Required before a frontend-driven Testnet demo

These are deployment/configuration operations, not missing frontend code.

1. **Provision a distinct agent account.** The contract's agent must be distinct from the principal. The agent account must be funded and its signing key available in the wallet used by the UI. Do not use the OptionsContract or Escrow contract account as the agent.
2. **Deploy the contracts to Testnet.** Deploy and initialize OptionsContract and Escrow using the dedicated Testnet accounts. Verify deployed code hashes and owner/admin configuration. CI builds Wasm but does not deploy contracts.
3. **Configure assets and token custody.** Register the selected Testnet NEP-141 token accounts, set the collateral/settlement token identifiers, and complete required NEP-145 storage deposits. Use synthetic test assets only unless a real supported route is independently verified.
4. **Create the on-chain agent policy.** Set the principal, agent, allowed asset IDs, maximum underlying amount, premium cap, collateral cap, open-position limit and expiry. Set execution mode to ManualApproval. Verify the policy through the view methods before starting the API.
5. **Configure the local AI service.** Set NEARAI_API_KEY in the local process environment, the deployed OptionsContract account ID, the Testnet RPC URL, and the explicit budget reservation ceilings in sdk/.env.example. Set the frontend origin in HANDEL_ALLOWED_ORIGINS.
6. **Start the API.** Build the SDK and run npm run server from sdk. The service binds to 127.0.0.1 only. The frontend calls /v1/education/answer and /v1/advisory/proposals.
7. **Connect the two wallet roles in the UI.** The agent wallet signs proposal submission. The principal wallet separately reviews and signs approval. The frontend must show PendingApproval distinctly from Approved, Registered, Exercised and Settled.
8. **Run one small Testnet smoke lifecycle with synthetic assets.** Verify proposal, approval, registration, collateral, premium, maturity/exercise and final balances. Do not use real deposits for the hackathon proof.
9. **Record and submit the demo.** Clearly label the AI premium and asset route as simulated. Do not present a Sandbox or synthetic Testnet token as a live Ondo stock or real settlement.

If the user chooses to demonstrate only the local Sandbox proof rather than a wallet-connected Testnet UI, steps 1–8 are not prerequisites for that proof script. They are prerequisites for the frontend to call the live local API against a deployed Testnet contract.

## 3. Remaining product/production gaps — not required to record a simulation demo

- **Live market data:** no production-grade verified price, volatility, liquidity or corporate-action feed is wired into the advisory endpoint.
- **Live pricing:** the advisory path uses a fixed demo premium fixture. It is not a tradable quote and is not derived from a deterministic live pricing engine.
- **Ondo route:** Tidepool Testnet assets are synthetic. No verified live Ondo stock-token collateral/settlement route is proven by the current Sandbox or Testnet dry-quote checks.
- **Intents settlement:** no complete live 1Click deposit → solver execution → receipt → final settlement path is proven for the target Ondo assets.
- **Trustless settlement proof:** settlement still has trusted reconciliation for ambiguous callbacks. Receipt logs and multiple RPC origins are not equivalent to a NEAR light-client proof.
- **Durable decision history:** the general trading runtime has a decision journal, but the new advisory/education HTTP routes do not yet expose a durable, queryable user decision-history API with linked approvals, transactions and outcomes.
- **Hosted operations:** the bundled server is localhost-only. Public hosting needs wallet/session authentication, durable shared rate limits and budget accounting, persistent audit storage, monitoring, alerting, abuse controls and key rotation.
- **Autonomous execution:** the new advisory path intentionally cannot execute. Delegated execution must remain disabled until live market evidence, pricing, custody, revocation and settlement controls are independently proven.
- **Security release:** complete an independent review of deployment configuration, custody, callbacks, permissions, API abuse controls and the final frontend integration before handling real value.

## 4. Evidence rules

- A proposal is not a trade.
- A wallet signature is not proof of contract success.
- A pending callback is not settlement.
- A dry quote is not a deposit.
- A Sandbox mock token is not an Ondo asset.
- A fixed demo premium is not market pricing.
- A CI build is not a Testnet deployment.

Only mark a stage complete when the corresponding authoritative state or test evidence exists.
