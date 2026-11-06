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
