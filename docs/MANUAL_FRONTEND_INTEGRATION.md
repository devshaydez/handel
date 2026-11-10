# Manual frontend integration guide

This guide is for the frontend the Handel owner is building manually. The repository intentionally contains no frontend application.

## Import surface

After building @handel/sdk, import HandelFrontendClient and HandelFrontendPort from the SDK entrypoint. Implement the port in the frontend's application/service layer.

```ts
import { HandelFrontendClient, type HandelFrontendPort } from "@handel/sdk";
const port: HandelFrontendPort = /* connected-wallet and read adapters */;
const handel = new HandelFrontendClient(port);
const portfolio = await handel.portfolio(connectedWallet.accountId);
```

## Data model and precision

- Account IDs are NEAR account IDs.
- Position IDs, timestamps, token amounts, u64 and u128 values are decimal strings.
- Never parse amounts into number; use BigInt for integer arithmetic and a decimal-aware formatter for display.
- Portfolio responses include source, observedAt, blockHeight and complete. Do not display a partial indexer result as a complete portfolio.
- Contract lifecycle state and settlement evidence are separate. A state label alone is not independent proof of external token movement.

## Wallet and transaction UX

Every contract write and NEP-413 signature must use the connected user's wallet. No private key, seed phrase, function-call secret or partner JWT belongs in browser storage, source control, analytics or chat.

A method returning SubmittedTransaction means only that the wallet/RPC adapter returned a transaction hash. It is not final success. Use finality(hash, signerAccountId):
- final_success: transaction execution reached finality; still inspect the required verifier receipt for settlement.
- final_failure: show the definitive failure code.
- unknown: preserve pending/unknown and do not automatically resubmit.

For redirect wallets, complete the Wallet Selector callback before continuing with an operation that requires signature bytes.

## Agent modes

| Mode | Frontend behavior |
|---|---|
| Education | Learning only; no trade execution |
| Advisory | Recommendations only; no trade execution |
| ManualApproval | Require fresh explicit principal wallet approval for each write |
| Delegated | Display exact on-chain limits, expiry, allowlist and revocation control; never imply unlimited autonomy |

Refresh on-chain policy immediately before a trade-sensitive action. Local SDK preflight is not authoritative; the contract is.

## Required integration tests before a demo

1. Connect/disconnect and switch wallet accounts; stale account-scoped data must be discarded.
2. Attempt a write after revocation and policy expiry; contract must reject it.
3. Submit a transaction and force RPC timeout; UI must show unknown and must not duplicate-submit.
4. Exercise a proposal from another principal; reject it.
5. Return an indexer page with a continuation token; mark portfolio incomplete until all pages are read.
6. Supply settlement event with mismatched amount, asset, sender, receiver or position; never show verified.
7. Confirm displayed quantities preserve exact integer precision.
8. Verify logs and analytics exclude signatures, access tokens, API keys and private data.
