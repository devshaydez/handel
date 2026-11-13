# Evidence Log — Handel Options

Record every critical command, expected result, actual result, and transaction hash.
Never claim a path works without an entry here.

| Date (UTC) | Step | Command / Action | Expected | Actual | Tx / Link | PASS/FAIL | Notes |
|------------|------|------------------|----------|--------|-----------|-----------|-------|
| 2026-11-06 | Scaffold | Push core contract to main | Repo has compilable contract | | | PASS | Initial core engine |
| | Dry quote NVDAon → USDC | `curl .../tokens?ondoTokens=true` + quote | Valid route | | | | Still required |
| | Tidepool transfer | Simple NEP-413 transfer | Balance updates | | | | |
| | Deploy testnet | `near deploy ...` | Contract live | | | | Needs testnet account |
| | create → lock → open → exercise → settle | Full CLI sequence | Status transitions | | | | |
| | Agent grant + revoke | | Limits enforced | | | | |
| | Adversarial: double exercise | | Rejected | | | | |
| | Adversarial: exercise after expiry | | Rejected | | | | |
| | Adversarial: replayed op_id | | Rejected | | | | |

## Dry-quote results (fill in)

```
# Request
# Response
```

## Known open questions

- [ ] Final confirmation that Ondo assetIds produce successful dry quotes both directions
- [ ] Exact serialization / nonce rules when constructing NEP-413 payloads from the contract side (Path B — not in scope)


## Delegated Assistant execution — implementation evidence

**Scope approved:** the Assistant and Agent are one system. Assistant is the single AI interface; Agent is the policy/configuration surface. A dedicated agent account may create trades and initiate/register writer-side collateral lifecycle actions under the on-chain policy. The principal signs collateral funding; the holder signs premium payment. The agent cannot call token transfer methods or spend either party's tokens.

| Scenario | Expected contract behavior | Evidence status |
|---|---|---|
| Agent creates an in-limit Call/Put | Position writer is the policy principal; agent and principal attribution recorded in separate raw storage; accepted NEP-297 event emitted | Unit tests already cover in-limit delegated create; updated branch adds attribution |
| Agent exceeds size/premium/Put collateral/open-position/asset/expiry policy | Contract reverts before creating the position | New Rust adversarial test added; latest-head CI required |
| Agent acts after revoke / enabled=false | Every delegated lifecycle method re-reads current policy and rejects immediately | New test checks create and collateral-initiation rejection after revoke; latest-head CI required |
| Agent attempts another agent's position | Attribution mismatch reverts | Branch adds cross-agent lifecycle test; CI pending |
| Agent initiates collateral | Only attributed agent may start operation; principal remains expected sender and must authorize token transfer | Branch test added; CI pending |
| Agent attempts premium payment | Not permitted; begin_premium_payment remains holder-only | New unit test asserts writer-agent cannot initiate holder premium payment; latest-head CI required |
| Rejected call event | Reverted transaction cannot persist a contract event | Use failed NEAR transaction receipt as rejection evidence |

**Important:** no Testnet trade has been executed by the delegated runtime as of this evidence note. Do not claim success until CI passes and a user-authorized Testnet agent key is provisioned and used. Tidepool assets remain synthetic Testnet assets; no Ondo/Mainnet settlement is claimed.


## Delegated execution integration update — 2026-11-12

- Baseline PR #25 commit `9331688a6c6a1ff7ebf884a1e69e2a0467153291`: [Actions run #43310008665](https://github.com/devshaydez/handel/actions/runs/43310008665) completed all seven jobs successfully. This run predates the restricted signer/executor/API integration added afterward.
- Contract now emits NEP-297 events for `agent_policy_set`, `agent_execution_mode_changed`, `agent_revoked`, `agent_trade_created`, `agent_collateral_initiated`, and `agent_escrow_registration_started`. A rejected transaction still cannot persist an event; the finalized failed receipt is the evidence.
- New code adds `sdk/src/near-function-call-signer.ts` (on-chain FunctionCall-key verification and exact method allowlist), `sdk/src/agent-execution.ts` (finalized policy read, create Call/Put, re-check revocation, Escrow registration and result verification), and tests for accepted/rejected/partial-failure paths.
- New Vercel handler `POST /api/v1/delegated/trades` uses `NEAR_AGENT_DELEGATED_FUNCTION_CALL_PRIVATE_KEY`, checks exact key scope/allowance before each call, and uses only the configured demo fixture. It requires `HANDEL_AGENT_API_TOKEN`.
- Frontend exports separate principal-only collateral and holder-only premium wallet actions. The Assistant UI is not yet wired to this endpoint; the bearer token must remain server-side.
- **No live delegated Testnet transaction has been recorded.** The deployed OptionsContract still requires a user-authorized upgrade to include the new entrypoints. The agent restricted key and Vercel environment variables have not been provisioned/verified in this work.


## Testnet deployment close-out — 2026-11-13

| Contract | Account | Deploy-only transaction | Artifact SHA-256 | Result |
|---|---|---|---|---|
| OptionsContract | `options.shaydez.testnet` | `7pWEFi8adgKeGF7aYYWSfSpMFc5vYWtYtbtkGaBC2z44` | `53a54422f9d0bd296bdff5a20d7f15d18d2f390fc986af16356aa1a84f12522a` | CLI reported successful deploy; no initializer called |
| Escrow | `escrow.shaydez.testnet` | `DrQ8m91nef1uzZ11aVcG5B7i8FvLCHqZMKryp496gqeR` | `a7d7f1184d813a94c5d1c431ebef01489720e906b4a6d4cf89b957d7245ab604` | CLI reported successful deploy; no initializer called |

- Production Vercel deployment for `8fb39e2`: READY.
- Live `GET /api/health`: `{ ok: true, service: "handel", network: "testnet", pricingMode: "demo_fixture", delegatedExecutionConfigured: true }`.
- CI run #43314638314: seven jobs passed on branch head `63d30387d85db728c4b26fba6d1ec4293597f087`; not a post-deployment main-commit run.
- No real delegated trade, collateral transfer, holder premium payment, or settlement receipt is recorded by this close-out. Deployment receipts are not lifecycle evidence.
- Remaining acceptance evidence: independent account code-hash/state verification; connect Assistant to the restricted delegated route without exposing the API token; execute a separately authorized principal/holder Testnet lifecycle; capture policy-limit and revocation rejection receipts.
