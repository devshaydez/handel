# Handel threat model and trust assumptions

**Status:** hackathon prototype; not an independent security audit.  
**Scope:** OptionsContract, Escrow prototype, delegated agent, server API, wallet flows, NEAR RPC, Tidepool and offline/Sandbox paths.

## Security objectives

1. A model-generated proposal must never override the principal's on-chain policy.
2. A delegated key must be unable to call arbitrary contracts or arbitrary methods.
3. Revocation, disabled policy or a mode change must block subsequent delegated operations.
4. The agent must not transfer principal collateral or holder premium.
5. Position terms, writer/holder roles and agent attribution must remain bound across creation and registration.
6. Ambiguous transfer outcomes must not be retried merely because a timeout or missing event occurred.
7. Demo assets and simulated settlement must never be presented as live Ondo or Mainnet settlement.

## Assets and security boundaries

| Asset / capability | Intended protection | Current boundary |
|---|---|---|
| Principal's NEAR account and wallet | User wallet signs policy and collateral actions. | Wallet/key security is external to Handel. |
| Holder's NEAR account and wallet | Holder signs premium payment and holder-only actions. | Handel cannot compel a holder signature. |
| Agent FunctionCall key | Exact contract receiver, explicit method allowlist, finite allowance. | Key compromise can still submit calls allowed by the contract policy. |
| On-chain policy | Principal binding, enabled/revoked state, execution mode, asset and numeric limits, expiry and open-position limits. | Policy protects calls to the contract; it does not custody an Intents balance. |
| Server API token/session | Kept server-side; used to authenticate delegated API requests. | Backend compromise or misconfiguration can expose API authority. Rotate secrets and revoke keys after suspected compromise. |
| Escrow-held NEP-141 test tokens | Per-position registration and transfer checks in prototype. | Sandbox tests use mocks; live production custody and Ondo compatibility are not established. |
| Settlement evidence | Bind operation, token, amount, parties and receipt observations. | Trusted reconciler and RPC provider remain trust assumptions. |

## Adversaries and failure modes

- **Prompt injection / malicious market content:** attempts to induce the model to exceed limits or use an unapproved asset. Mitigation: treat model output as untrusted; validate off-chain and re-check in contract.
- **Compromised agent key:** attempts arbitrary contract calls or excess trade creation. Mitigation: FunctionCall receiver/method/allowance checks, contract policy checks, short bounded key allowance, on-chain revocation and account-key operations. Residual risk: a compromised key can act within current policy until revoked.
- **Stale policy or TOCTOU:** policy changes after an off-chain check. Mitigation: contract is authoritative; SDK reads policy/mode at finalized state and rechecks before Escrow registration; contract checks each delegated entrypoint. Residual risk: multi-transaction workflow can stop part-way and needs recovery.
- **Replay / role confusion:** repeated or cross-principal proposal requests. Mitigation: signed request binding, deterministic proposal identity, principal/holder separation and agent attribution tests. Residual risk: session/API integration and wallet-signing behavior require operational testing.
- **RPC lies, outage or inconsistency:** fake or missing state/receipt observations. Mitigation: finalized reads and optional independent RPC corroboration. Residual risk: multiple RPCs are not a cryptographic light client.
- **Callback ambiguity / duplicate payout:** transfer may have succeeded while callback evidence is missing. Mitigation: freeze ambiguous state; only retry definitive failures; persist per-leg state. Residual risk: reconciler override remains trusted, and the two payout legs are not atomic.
- **Server compromise:** attacker obtains bearer token or restricted key. Mitigation: server-only secrets, restricted key scope, finite allowance and on-chain policy. Residual risk: deployment environment, secret management, logs and session boundary are trusted.
- **Model/provider failure:** hallucinated terms, unsafe advice, outage or changed TEE measurement. Mitigation: schema validation, policy checks, pinned model/TEE evidence in the CI smoke and fail-closed behavior where verification is required. Residual risk: TEE evidence does not establish output correctness or pricing accuracy.
- **Asset substitution:** ticker-like label maps to a different chain/token/decimal standard. Mitigation: exact asset IDs and allowlists; separate Tidepool test asset registry. Residual risk: Ondo asset route and per-position Intents custody are not implemented/evidenced.
- **Test/demo confusion:** Sandbox or Tidepool behavior mistaken for real settlement. Mitigation: explicit environment labels and evidence categories. Residual risk: UI and documentation must continue to preserve these labels.

## Key authority model

| Actor | Permitted role | Not permitted / not claimed |
|---|---|---|
| Principal | Sets policy, selects mode, revokes agent, signs writer collateral. | Agent cannot impersonate principal or sign the wallet transaction. |
| Agent | Creates policy-bounded Call/Put and initiates/registers the writer-side Escrow path when Delegated mode is enabled. | No NEP-141 transfer authority over principal or holder funds. |
| Holder | Signs premium and holder-side exercise actions. | Agent cannot substitute for holder. |
| Server | Orchestrates requests and uses dedicated restricted FunctionCall key. | No browser exposure of bearer token or unrestricted agent FullAccess key. |
| Contract owner/controller | Performs explicitly privileged configuration and upgrades. | No multisig/timelock governance claim. |

## Settlement-specific trust assumptions

1. OptionsContract is a policy/lifecycle state machine, not an Intents custody contract.
2. The current Escrow implementation uses NEP-141 transfer-call flows; it does not establish support for NEP-245 Ondo balances in the Intents verifier ledger.
3. The configured reconciler/evidence attestor can resolve some ambiguous operations based on submitted evidence fields. This is a human/service trust root, not an on-chain proof of remote settlement.
4. Two-RPC receipt corroboration is not a light client and does not prove a remote-chain transaction.
5. Escrow's two payout legs are asynchronous and non-atomic. Partial completion can leave a position pending; there is no general rollback of an irreversible first transfer.
6. Tidepool is community-operated and its synthetic tokens do not establish Ondo token support or production liquidity.
7. No Mainnet Intents settlement, Ondo collateral reservation or real-funds settlement is claimed.

## Operational controls and response

- Keep `HANDEL_AGENT_API_TOKEN`, NEAR AI credentials and private keys in server/CI secret stores only.
- Never place secrets in Vite `VITE_*` variables, source control, logs or screenshots.
- On suspected agent-key compromise: disable/revoke the on-chain agent policy, revoke the FunctionCall key at the NEAR account level, rotate the server token, inspect finalized receipts, and record the incident.
- On unknown transfer outcome: do not retry based only on timeout. Freeze the operation and obtain independent receipt evidence or use the explicitly trusted reconciliation procedure.
- On asset/route mismatch: fail closed; do not substitute an asset by ticker or decimals.
- Before real assets: require independent contract/security review, exact token/route verification, per-position collateral reservation, robust proof verification, atomic or explicitly consented settlement recovery, monitoring and key-governance procedures.

## What this model does not certify

This document is a threat-model disclosure, not an audit, formal verification, proof of correct deployment, proof of live policy configuration, or proof that any Testnet trade has completed. See [EVIDENCE.md](EVIDENCE.md) for current evidence and gaps.
