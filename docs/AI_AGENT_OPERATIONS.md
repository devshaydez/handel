# Handel AI agent operations and verification

**Scope:** backend AI provider and screening configuration. This document does not claim that the agent is deployed as an always-on service.

## Credentials

- Store `NEARAI_API_KEY` as a GitHub Actions secret and as a server-side runtime secret in the eventual backend environment.
- Never expose it in browser code, frontend environment variables, committed files, logs, or client responses.
- The repository's live workflow has authenticated with this secret and completed real NEAR AI calls. The key is valid for the tested endpoint.

## Chat proposal model

The live CI smoke uses `deepseek-ai/DeepSeek-V4.1-Flash-1017` through `@nearai/inference-sdk/node` with:

- E2EE enabled for supported Chat fields;
- OHTTP enabled for the Chat exchange;
- Ed25519 signing;
- attestation cache TTL set to zero for the smoke;
- Gateway and model TCB status required to be `UpToDate`;
- response receipt verified and required to be `provider_tee`.

The Chat deployment was re-observed on 2026-11-11 in workflow run 43088851773. Gateway signer, model signer, TCB status and OS image measurement matched the existing allowlist; the provider reported a new UpToDate compose measurement `c53e254e8b70aa14b45ba3043730a0736ca2afb1df7fa3db9c61578845e470fe`. The allowlist was updated to this exact attested measurement. Any later deployment change must fail closed until reviewed and pinned.

The smoke is not a trading decision test. It sends no wallet, portfolio, market, order or transaction data.

## System One screening model

System One uses a separate client with E2EE and OHTTP disabled. The live smoke uses `levanto/sage-2` and verifies:

- the Gateway TCB status is `UpToDate`;
- the decision ID exists;
- `verifyResponse(decisionId)` validates the response receipt;
- the observed receipt kind is `gateway`;
- the structured guard decision has a valid outcome and confidence.

The observed model deployment returned no model-attestation reports. A Gateway receipt proves that the attested Gateway signed the exact response; it does **not** prove the Jev/System One model itself ran inside a model TEE. The runtime makes this distinction explicit through the mandatory `NearAiSystemOneConfig.signaturePolicy`:

- `gateway`: requires an allowlisted, UpToDate Gateway and a Gateway-signed response. This is only a screening signal. It never authorizes execution; deterministic policy, principal approval/delegated on-chain limits, and contract checks remain mandatory.
- `provider_tee`: requires UpToDate model evidence, allowlisted model signer, compose hash and OS image hash, plus a provider-TEE response signature. If the configured System One model cannot provide these, the request fails closed. There is no fallback to Gateway mode.

Choose the policy explicitly for each configured deployment. Do not describe Gateway mode as model-level TEE execution.

## Runtime boundary

The current `HandelAgentRuntime` is an orchestration library, not a daemon or hosted service. It composes:

1. a proposal provider;
2. a deterministic premium engine;
3. a System One screening guard;
4. an approved market-evidence verifier;
5. a durable decision recorder.

A production runtime still needs a trusted market-data implementation and pricing inputs, durable shared budget/audit stores, wallet/contract execution integration, deployment configuration, health monitoring and operator controls. Missing or unverified market evidence must stop trading. The model must never supply the authoritative premium, balance, price, permission state or execution result.

## Current proof and limitations

- Live Chat E2EE/OHTTP + provider-TEE receipt smoke: passed.
- Live System One Gateway-attested, Gateway-signed decision smoke: passed.
- Offline SDK tests: latest observed run passed after the signature-policy assertion fix.
- These checks do not prove the full Handel agent runtime, an always-on worker, market-data authority, wallet integration, a Testnet trade, custody, or settlement.

## Safe operating rule

Until the missing market-data, custody and settlement gates are closed, Handel must remain in proposal/advisory or synthetic Testnet mode. Do not enable automatic live execution based only on a model response or successful smoke test.


## Handel runtime assembly

`sdk/src/nearai-stack.ts` now provides `createHandelNearAiStack(apiKey, budget)`. It constructs the Chat proposal provider and the separate System One guard, applies the TEE signer/measurement pins captured from live workflow #42790111229, and shares one `NearAiBudgetLedger` across both clients. The factory also exposes `createHandelAgentRuntime(stack, { pricing, decisions, marketVerifier })` so the host can wire the two AI paths into the controlled proposal runtime.

The Chat allowlist pins the observed Gateway signer, model signer, compose measurement and OS image measurement. A provider redeployment that changes the measurement will fail closed until the allowlist is reviewed and updated. System One is explicitly configured as `signaturePolicy: "gateway"` because its live model response carried a Gateway signature and no model TEE report. This is a screening signal, not model-level TEE proof.

The factory requires a caller-supplied `NearAiBudget`; it does not invent model pricing or set a misleading dollar budget. The repository secret alone is sufficient for API authentication, but a backend host must still provide a conservative budget configuration and the trusted market/pricing evidence adapters before constructing a tradable runtime. No always-on worker or hosted backend has been deployed by this change.
