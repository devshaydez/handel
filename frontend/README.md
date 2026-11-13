# Handel frontend

React + TypeScript + Vite client for Handel's NEAR Testnet options prototype.

## Run locally

From this directory:

```bash
npm install --no-audit --no-fund
npm run dev
npm run typecheck
npm run build
```

Vite serves the app at `http://localhost:5173`. Its development proxy forwards `/api/*` to the local SDK API on `127.0.0.1:8787`.

## Current integration boundary

| Surface | Current implementation | Limitation |
|---|---|---|
| Assistant | Single AI interface with a delegated Testnet Call/Put composer. | Executable path is for synthetic Tidepool wNEAR and a fixed premium fixture, not Ondo stocks or market-priced options. |
| Agent | Reads/configures on-chain policy and execution mode; supports wallet-authorized changes and revocation. | Requires the principal's wallet. Browser preferences are not authority. |
| Delegated trade | NEP-413 principal authorization → server-side restricted agent → OptionsContract create/register. | Requires configured server secrets, enabled on-chain policy and Delegated mode. Agent cannot transfer collateral or premium. |
| Collateral / premium | Separate wallet actions for principal collateral and holder premium. | A complete live two-party Testnet lifecycle is not yet recorded in the evidence ledger. |
| Portfolio | Reads available Testnet balances/positions where supported by current chain/indexer adapters. | Not a complete historical reconstruction of all positions. |
| Activity | Can display finalized receipt history from the optional persistent indexer and local observations. | Persistent history depends on indexer configuration; local observations are not a complete chain index. |
| Markets / pricing | Explicit unavailable/demo states and reference pricing utilities. | No approved live Ondo market feed, option surface or execution oracle is configured. |

## Environment variables

Copy `.env.example` to `.env.local` for local-only configuration. Never put `HANDEL_AGENT_API_TOKEN`, private keys or provider credentials in `VITE_*` variables. Public Vite variables are bundled into browser code.

The local SDK API is a development service, not a public production gateway. Remote hosting requires authenticated wallet sessions, server-side secrets, explicit CORS origins, rate limits, durable audit storage and operational monitoring.

## Related documentation

- [Repository README](../README.md)
- [Evidence ledger](../docs/EVIDENCE.md)
- [Threat model](../docs/THREAT_MODEL.md)
- [Settlement architecture](../docs/SETTLEMENT_ARCHITECTURE.md)
