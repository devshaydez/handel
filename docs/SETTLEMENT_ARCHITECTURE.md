# Handel settlement architecture decision

**Status:** design decision for the hackathon prototype; production custody is not implemented.

## 1. Non-negotiable boundary

The current `OptionsContract` is a lifecycle and policy state machine. It is not an asset custodian.

- `begin_collateral_lock` creates an expected-transfer record; it does not receive NEP-141 tokens.
- There is no `ft_on_transfer` or `mt_on_transfer` handler in this contract.
- The supported Ondo identifiers currently point to BNB-chain representations. They are not automatically NEAR-native NEP-141 tokens.
- `reconcile_operation` accepts a receipt-shaped assertion from one configured account. It does not independently verify a remote chain transaction or a NEAR Intents verifier event.
- `request_expiry_release` creates an external operation record. It does not transfer tokens.
- A green test suite proves the state-machine code paths, not custody, settlement, or proof authenticity.

Therefore no real asset should be deposited or represented as collateral-locked/open/settled by this contract in its current form.

## 2. Testnet integration options

### Official Intents vs community sandbox

The hackathon materials describe NEAR Intents as having no official Testnet environment. A community project, Tidepool, now advertises a Testnet sandbox with a 1Click-compatible API and an unmodified deployment of the NEAR Intents verifier (Defuse v0.4.5) at `verifier.tidepool-sandbox.testnet`.

Tidepool is community-operated and explicitly not affiliated with NEAR or 1Click. Its own documentation describes a single maker/market-maker, so it is useful for integration and failure-path testing, not as an independent production liquidity or security guarantee.

Useful references:

- Tidepool announcement: https://gov.near.org/t/tidepool-a-1click-compatible-testnet-sandbox-for-near-intents/42746
- Tidepool quickstart: https://www.usetidepool.tech/docs/quickstart
- Tidepool verifier and flow: https://www.usetidepool.tech/docs/concepts/how-it-works
- Tidepool token list: https://www.usetidepool.tech/docs/resources/tokens
- Tidepool FAQ: https://www.usetidepool.tech/docs/resources/faq

### Asset compatibility limitation

Tidepool documents test USDC, USDT, wNEAR, wBTC, ETH and XAUT on NEAR Testnet, plus bridged test assets on selected EVM and other testnets. Its token API documentation says the `ondoTokens` query is accepted but ignored. The published token list does not include Handel's NVDAon/TSLAon/AAPLon/SPYon BNB-chain assets.

Consequently:

- Tidepool can test generic quote/deposit/status/refund flows using its own test assets.
- Tidepool cannot currently prove that Handel's Ondo stock collateral is supported.
- `nep141:usdc.tidepool-sandbox.testnet` is a test token and is not interchangeable with the configured NEAR USDC or BNB-chain asset IDs.
- Any Tidepool integration must use a separate test asset registry and label the demo as test-token settlement. Never relabel a Tidepool test token as NVDAon or real USDC.

**Decision:** Tidepool may be added as an optional Testnet integration adapter after its API and token availability are validated. Keep the deterministic mock adapter as the default/offline path. Do not replace the current asset IDs or claim Ondo support based on Tidepool.

## 3. Recommended production custody boundary

Split Handel into three independently testable layers:

1. **Options policy contract:** owns position terms, writer/holder identity, agent permissions, expiry, exercise authorization and lifecycle status.
2. **Custody/escrow layer:** holds the exact collateral for a specific position, prevents withdrawal/reuse, and releases only under immutable position rules.
3. **Settlement adapter:** coordinates the payment/delivery exchange and reports verifiable on-chain outcomes. An API status or a trusted service's database row is not settlement proof.

Every position should bind immutable values: option type, canonical asset IDs, raw integer amounts, decimals, writer, holder, strike amount, premium, maturity, exercise deadline, escrow account, settlement route and unique position nonce.

### Asset admission

Before an asset can be enabled, record and verify:

- source chain/network and token contract/address;
- canonical Intents/NEP-141/NEP-245 asset ID;
- decimals and raw-unit conversion;
- bridge/wrapper contract and issuer/administrator;
- supported deposit, withdrawal and refund routes;
- whether the exact asset is supported by the selected verifier and solver route.

Do not infer support from a ticker symbol. The same ticker on two chains is not the same asset.

## 4. Settlement options

### Preferred atomic exchange: paired NEAR Intents

The official NEAR Intents repository describes a peer-to-peer flow where both parties deposit assets into their Intents accounts, sign opposing intents, and submit the signed intents together to `execute_intents`. The verifier validates the pair and executes the swap atomically in its internal ledger.

For a call at maturity, the intended balance changes are:

- holder: `-strike USDC, +underlying`;
- writer: `+strike USDC, -underlying`.

For a put, the direction is reversed.

Official reference: https://github.com/near/intents

This is the best candidate for avoiding a one-sided *internal-ledger exchange*: both signed intents must be accepted in the same verifier execution or the swap does not complete.

**Important unresolved prerequisite:** the option writer's collateral must be reserved before maturity so it cannot be withdrawn or reused while the option is open. Merely having a balance in an Intents account is not a Handel-enforced lock. The exact per-position reservation/escrow mechanism, its signer authority, revocation rules and withdrawal restrictions must be designed and audited before this can be called fully collateralized. Do not claim this architecture is complete until that mechanism is proven.

External-chain withdrawals after the internal swap are separate operations. Track them separately from the atomic ledger exchange; do not mark an external-chain payout complete from a quote or API response alone.

### Persistent position storage and storage funding

The Testnet escrow stores positions in NEAR's storage-backed `LookupMap` rather than serializing every position inside one in-memory `BTreeMap`. This avoids whole-map serialization growth on each update, but it does not make storage free: every position consumes persistent account storage and must be backed by NEAR.

The current prototype does not yet collect a per-position storage deposit, refund storage stake, or expose a storage-balance ledger. The escrow account must be funded with sufficient NEAR before position creation, and this remains a production release blocker until a user/controller-funded storage-staking and refund policy is implemented. The 128-position unit test checks independent record access; it is not a substitute for Sandbox gas benchmarks under realistic state growth.

### NEP-141 / NEP-245 escrow contract

A per-position escrow can accept collateral using the supported token transfer-call interface, validate the token contract and sender, and hold immutable terms. It must enforce maturity and exercise-window rules, refund collateral after an unexercised expiry, and record all payout callbacks and failed transfers.

The NEAR Intents repository includes an escrow-swap contract supporting NEP-141 and NEP-245 assets. It is a useful reference, not a drop-in Handel options escrow: its published interface does not provide Handel's maturity gate, and its payout flow documents asynchronous legs and recoverable lost-payout accounting rather than a guarantee that two independent payouts always succeed atomically.

Reference: https://github.com/near/intents/tree/main/contracts/escrow-swap

If this path is selected, build or audit a dedicated options escrow with:
- immutable position terms and deterministic per-position identity;
- writer-only funding and exact token/amount validation;
- holder-only exercise during the maturity window;
- no early exercise;
- permissionless expiry cleanup only after the exercise deadline;
- no partial fills;
- per-leg callback state, idempotent retries and explicit lost-fund accounting;
- no admin function that can redirect collateral to an arbitrary account.

Unless both payouts are proven atomic, describe this as **escrowed but recoverable two-leg settlement**, not atomic settlement. Add an explicit dispute/compensation policy.

### Direct cross-chain transfers

Do not send collateral from one external chain and consideration from another as two unrelated transfers. If a cross-chain route cannot provide an atomic verifier settlement or enforceable escrow, the product must disclose counterparty risk and define timeout, dispute, refund and compensation authority before accepting funds.

## 5. European maturity and exercise window

The prior implementation allowed exercise while `block_timestamp < expiry_ns`, which is American-style early exercise despite the product being described as European-style.

The work branch now defines:
- no exercise before `expiry_ns`;
- exercise submission from maturity through a 24-hour transaction-submission grace period;
- writer expiry release only after that grace period has elapsed.

The 24-hour interval is an operational grace period for submitting a maturity exercise, not an early-exercise feature. The UI must display both maturity and the final exercise-submission deadline. The duration should be a protocol parameter before production, not silently changed after positions are created.

## 6. Proof and reconciliation requirements

For the current mock adapter, synthetic evidence is test-only. For a future real adapter, each settlement outcome must be bound to:

- contract/escrow account and position ID;
- unique operation ID and operation kind;
- source network and verifier identity;
- canonical asset ID and token contract;
- exact integer amount and decimals;
- sender and receiver;
- transaction hash and event/log index;
- verifier execution receipt and finality/reorg policy;
- proof version and replay-protection nonce.

Preferred trust hierarchy:

1. A state transition executed directly by the custody contract after validating an on-chain token callback.
2. A NEAR contract-to-contract call to the verifier, with a callback that records the verifier call's actual execution result.
3. An independently verified light-client/proof mechanism for remote chains.
4. A trusted relayer only as an explicitly disclosed fallback; it must not be presented as trustless proof.

An indexer, Tidepool API, 1Click status response, solver, or reconciler can help discover and relay data. None is itself cryptographic proof of custody.

## 7. Failure handling

- Unknown, delayed or unobserved transfers remain pending; they are not failed.
- A retry is permitted only after the transfer callback actually executes and records a definitive failure. A missing/failed callback is not evidence that the token transfer failed.
- The escrow cannot inspect historical NEP-141 transfer receipts or safely infer a position-specific transfer from a pooled token balance. Therefore a payout whose callback receipt fails remains pending and must not be retried automatically. Any future recovery path requires an independently verifiable proof mechanism and a separately audited state transition; an operator assertion alone is not trustless proof.
- The payment callback needs enough prepaid gas to record the first leg and schedule the collateral transfer plus its callback. The implementation reserves 30 Tgas for that callback; this is a tested budget, not a guarantee against every runtime or state-growth failure.
- If one exercise leg succeeds and the other fails, keep the position in reconciliation/dispute state. Never release the successful leg's value automatically.
- Exercise collateral delivered to the holder and expiry collateral returned to the writer are recorded in separate fields.
- If a payout is irreversible, the design must identify the party or escrow that can compensate the counterparty.
- Pausing blocks new risk but must not block safe completion/recovery of existing settlement obligations.
- Expiry release is available only after the exercise-submission deadline.

## 8. Delivery plan

1. Keep the current contract in simulation mode and add the European maturity guard (implemented in this branch).
2. Add an isolated Tidepool adapter using Tidepool's own test assets; test quote, deposit, status, expiry and refund paths without changing the Ondo asset registry.
3. Prove which exact Ondo token representations, if any, can be funded into the selected NEAR Intents verifier.
4. Prototype a per-position collateral reservation/escrow and threat-model its key/signing authority.
5. Prototype a paired-intent maturity exchange and verify atomic failure/success on Testnet.
6. Only then replace synthetic reconciliation with a contract-verified custody/settlement path and add adversarial tests.
7. Obtain an independent security review before any real-asset use.

## 9. Release gate

No mainnet deployment, real collateral, or user-facing claim of fully collateralized/atomic options until all of the following are demonstrated:

- exact asset support and verified decimals;
- enforceable per-position collateral reservation;
- maturity-gated exercise and expiry refund;
- independently verifiable settlement result;
- atomic exchange or a fully specified and consented compensation/dispute model;
- replay, duplicate, delayed receipt, callback-receipt failure, reorg, partial failure and pause/recovery tests;
- persistent storage and gas review, including callback gas under realistic state growth, measured Sandbox gas at increasing position counts, and explicit per-position storage staking/refunds;
- independent security review.
