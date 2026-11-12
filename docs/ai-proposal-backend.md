# AI proposal service contract

## Status

The hosted backend uses the NEAR AI inference SDK and verifies the provider response before treating the model output as advisory rationale. No AI network request is made by the Rust contract. The model cannot set execution authority or move assets; on-chain policy and explicit principal approval remain authoritative.

## Required manual setup

Store `NEARAI_API_KEY` as an encrypted Vercel environment secret and configure `NEARAI_MODEL` as a non-secret deployment variable if a non-default model is needed. The backend verifies completed responses with the NEAR AI SDK. Do not send keys in chat, commit them, expose them to the client, or place them in contract state. Use a local `.env` only for local development and ensure it is ignored by Git.

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


## Implemented NEAR Testnet proposal authorization

The hosted advisory endpoint now uses the dedicated agent account configured with `NEAR_AGENT_ACCOUNT_ID` and the encrypted server-side `NEAR_AGENT_PRIVATE_KEY`. The principal must first sign a NEP-413 message binding the exact holder, option type, asset, underlying amount, strike, demo premium, expiry, recipient, callback URL, and short issue-time window. The backend verifies the signature and confirms that the signing public key is a current full-access key for the claimed principal before it calls NEAR AI or submits anything.

The proposal ID is deterministically derived from the principal and signed nonce. Replaying the same signed request therefore reuses the same proposal ID, which the contract rejects after the first successful submission. The backend also checks the on-chain agent policy and requires `ManualApproval` mode. The agent submits only `create_agent_proposal`; the principal wallet must separately sign `approve_agent_proposal` or reject it. Approval is followed by the existing escrow registration, collateral transfer, premium transfer, and settlement verification. The agent key never approves or funds a proposal.

Never expose the agent key to the browser or logs. If the principal wallet cannot return a NEP-413 signature (for example, a redirect-only wallet flow), fail closed and use a wallet integration that returns a verifiable signed message.
