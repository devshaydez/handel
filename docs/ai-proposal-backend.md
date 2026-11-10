# AI proposal service contract

## Status

This is the backend integration contract for the future AI adapter. No API key or vendor has been selected or configured, and no AI network request is made by the Rust contract. The model is advisory only. On-chain policy and explicit principal approval remain authoritative.

## Required manual setup

Choose an AI provider that supports JSON-schema constrained output. Create a project-scoped API key in that provider's console and store it in the backend runtime secret manager as `AI_API_KEY` (or the provider-specific equivalent). Also configure the provider endpoint/model, request timeout, and rate limit as deployment secrets/config. Do not send keys in chat, commit them, expose them to the client, or place them in contract state. Use a local `.env` only for local development and ensure it is ignored by Git. The app should start in deterministic no-AI mode when the key is absent.

## Proposal JSON schema

The server adapter should accept untrusted user context and return only this strict shape, rejecting additional keys and invalid values:

```json
{
  "schema_version": "1",
  "proposal_id": "opaque unique id",
  "kind": "call",
  "asset_id": "configured asset id",
  "holder": "account.near",
  "underlying_amount": "integer base units as decimal string",
  "strike_amount_usdc": "integer base units as decimal string",
  "premium_amount_usdc": "integer base units as decimal string",
  "expiry_ns": "integer nanoseconds as decimal string",
  "rationale": "bounded plain-text explanation"
}
```

Treat every model field as untrusted. Parse integer strings with checked bounds, resolve assets against the configured allow-list, validate account identifiers, check expiry, and fetch the current principal policy. Reject hallucinated prices, unsigned data, malformed JSON, unexpected enum values, and oversized rationale. Hash the normalized proposal/rationale for the on-chain `rationale_hash` audit field. Do not allow the model to set the principal, agent identity, policy limits, recipient, reconciliation evidence, signature, or operation status.

## Deterministic validation and execution

1. Validate schema and normalize fields server-side.
2. Preview the exact normalized terms to the principal.
3. Submit a proposal through the principal's registered agent identity; contract checks its asset, amount, premium, expiry, and position-count policy.
4. Require explicit principal approval before transitioning the proposal to approved or constructing a wallet-signable intent.
5. Ask the user's wallet to sign the exact final intent; never have the server hold or use the user's private key.
6. Record request/response hashes, provider/model identifier, validation outcome, policy version/hash, and approval in a privacy-conscious audit trail. Do not log secrets or unnecessary personal data.

Provider key rotation, budgets, quota, access controls, and retention are managed by the user in their provider and deployment consoles. Without the key, use deterministic rules and no external model calls.
