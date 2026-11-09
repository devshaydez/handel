# Handel — AI Education and Decision Accountability

**Status:** Product requirement; implementation and verification are pending unless explicitly recorded in code/tests.
**Applies to:** Batch 8 (intelligence), Batch 9 (execution and safety), and Batch 10 (frontend and release).

This document records the user's requirement that Handel's AI agent must combine education, trading assistance, and accountable decision-making. It is part of the existing Handel roadmap; it does not create a separate education product or a new batch.

## 1. One agent, integrated capabilities

Handel has one AI agent with two integrated responsibilities:

- **Education:** Explain stocks, tokenized assets, options, market conditions, strategies, risks, and the agent's own decisions. Adapt explanations to the user's knowledge level and answer follow-up questions in context.
- **Trading:** Analyse validated market information, evaluate permitted actions, recommend or execute trades according to the user's selected authorisation mode.

Education and trading share relevant context, but education never grants trading authority. Teaching, answering questions, or explaining a strategy must not silently approve a trade or expand permissions. Conversely, enabling bounded automatic trading must not remove the user's ability to ask questions or inspect decisions.

The agent should teach in context, including before and after a proposed or executed trade. It should explain unfamiliar terms and calculations without requiring the user to leave the trading workflow. It must not pressure a user to trade.

## 2. User-controlled operating modes

The product should support the user's chosen level of autonomy:

1. **Education only:** Teach and simulate; do not submit trades.
2. **Advisory:** Analyse and recommend; the user decides.
3. **Per-trade approval:** Prepare a proposal and rationale; require explicit approval for each action.
4. **Delegated automatic execution:** Act only within explicit, bounded, revocable permissions and enforced limits.

The effective mode, permissions, limits, and approval state must be checked for every consequential action. The agent must not infer consent from conversation, prior trades, or a user's learning activity. On-chain policy remains authoritative; off-chain checks are defense in depth.

## 3. Explain every consequential decision

The agent must provide a clear, user-understandable reason for every consequential action it takes or recommends, including:

- Buy Call / Buy Put / Write Call / Write Put.
- Hold, wait, or no trade.
- Close, exercise, or allow expiry where applicable.
- Rejecting, cancelling, or deferring a proposal.
- Any automated risk-reduction or position-management action.

An explanation should cover, where applicable:

1. **Action and status:** What was proposed, attempted, accepted, rejected, submitted, or confirmed. Never describe a proposal as an executed trade.
2. **Reason / thesis:** The actual rationale for the decision and the market condition it is intended to address.
3. **Evidence:** Relevant prices, trend/volatility/liquidity observations, news or events, and contract/position state used.
4. **Data provenance:** Source identity, asset identity, observation timestamp, freshness, and any missing or conflicting inputs.
5. **Strategy and terms:** Why the selected Call/Put or other permitted action fits the thesis; strike, quantity, premium, expiry and collateral as relevant.
6. **Risk:** Maximum loss where determinable, collateral exposure, liquidity/slippage, expiry and settlement risks, and material assumptions.
7. **Alternatives:** Material alternatives considered (including hold/no-trade) and why they were not selected. Do not claim alternatives were evaluated unless the runtime actually evaluated them.
8. **Uncertainty:** Confidence or evidence strength, key unknowns, and conditions that would invalidate the thesis. Do not present model confidence as a calibrated probability unless it has been calibrated and validated.
9. **Policy and authority:** Relevant user mode, permission/limit checks, and whether user approval was required or obtained.
10. **Outcome:** Execution result and authoritative transaction/evidence reference, or a clear pending/unknown/failed state.

The agent must also explain **why it did not act**. Examples include stale or conflicting data, insufficient liquidity, unsupported asset/route, premium or quantity outside limits, expired/revoked permission, unacceptable risk, or inconclusive evidence. A no-trade decision is a valid outcome.

## 4. Explanation integrity: no fabricated rationale

Explanations must be grounded in the actual inputs and decision process. The agent must not:

- Invent prices, news, market signals, balances, permissions, calculations, tool results, or execution receipts.
- Claim that it checked an alternative or risk factor if it did not.
- Claim an order was filled, a position closed, or settlement completed without authoritative confirmation.
- Hide stale, missing, conflicting, or simulated data.
- Rewrite the original rationale after the outcome to make the decision appear prescient.

Clearly label simulated examples and hypothetical trades. Distinguish live observations from cached data, model interpretation, deterministic calculations, and on-chain facts. If the evidence is insufficient, say so and abstain where required.

## 5. Durable decision record and audit trail

Every consequential agent decision must create a structured, durable record before execution is attempted. The record should be append-only or tamper-evident and link the decision to later approvals, transactions, and outcomes.

Minimum record fields:

- Unique decision ID and schema version.
- User/account reference using the product's privacy-safe identifier.
- Agent/runtime version and model identifier.
- Timestamp and correlation/request ID.
- User-selected autonomy mode and permission snapshot/version.
- Action, asset, option terms, and proposed quantity.
- Market-data snapshot or immutable content hash plus source, timestamp, asset identity, and freshness metadata.
- Deterministic premium, payoff, collateral, and risk outputs with engine/version and assumptions.
- Human-readable rationale, evidence references, alternatives actually evaluated, uncertainty and invalidation conditions.
- Policy validation result and failed constraints, if any.
- Approval requirement, approver, approval timestamp and signed-intent/transaction linkage where applicable.
- Execution lifecycle state: proposed, rejected, awaiting approval, approved, submitted, pending, outcome unknown, failed, confirmed, settled.
- Authoritative transaction, receipt, verifier, and settlement evidence references when available.
- Post-trade outcome and subsequent thesis review, stored as a separate linked event rather than overwriting the original decision.

Protect the record against unauthorised modification. Apply data minimisation, access control, retention rules, and secret redaction. Never store private keys, seed phrases, raw authorisation headers, or unnecessary sensitive prompt content.

## 6. User experience requirements

Users should be able to:

- Ask “Why did you do that?” and receive an explanation linked to the exact decision record.
- Inspect the evidence, timestamps, assumptions, risk checks, approval state, and execution status.
- Ask for a simpler or more technical explanation without changing the underlying recorded rationale.
- Understand why the agent held, waited, rejected a trade, or declined to act.
- Review past decisions and compare the original thesis with the eventual outcome.
- See clear distinctions between live, cached, simulated, pending, failed, and confirmed information.

The same agent should provide beginner-friendly explanations and deeper technical detail on request. This is an integrated agent capability, not a separate Academy application or independent product.

## 7. Delivery mapping

### Batch 8 — Intelligence (Phases 14–16)
- Implement structured agent decision outputs with rationale, evidence references, assumptions, uncertainty, and explicit no-trade/rejection reasons.
- Ground explanations in validated market context and deterministic premium/risk tools.
- Add decision-record schema, runtime correlation IDs, audit events, and tests for missing/stale/conflicting evidence and fabricated model claims.
- Keep the agent's narrative separate from authoritative market data and deterministic calculations.

### Batch 9 — Execution and safety (Phases 17–19)
- Bind each decision to the exact permission snapshot, limits, approval requirement, and revocation state used.
- Record approval and signing authority; never equate an AI recommendation with user consent.
- Link submission, pending/unknown/failure, transaction finality, custody, and settlement evidence to the originating decision.
- Never report success before independently sufficient execution/settlement evidence exists.

### Batch 10 — Product and release (Phases 20–22)
- Surface “Why this action?”, risk, evidence freshness, alternatives, and status in the trading interface.
- Provide conversational explanations at beginner/intermediate/advanced depth and contextual teaching during trading.
- Provide decision history and post-trade outcome review.
- Include adversarial tests for explanation integrity, audit tampering/access control, incorrect execution claims, and missing evidence in the release evidence pack.

## 8. Acceptance criteria

This requirement is not complete merely because the prompt asks the model to explain itself. At minimum:

- Every consequential decision has a durable structured record.
- The user-facing explanation is generated from that record and its linked evidence, not solely from a free-form model recollection.
- Every trade action is bound to the applicable user permission and approval/delegation state.
- No-trade and rejection decisions have recorded reasons.
- Simulated/cached/live data and proposed/submitted/confirmed/settled states are distinguishable.
- Tests prove that missing evidence, revoked permission, policy failure, or unconfirmed execution cannot be represented as a successful trade.
- Users can retrieve and understand the reason for a historical action.

**Release rule:** Do not claim explainable, accountable, or autonomous trading is complete until these acceptance criteria are implemented and evidenced. This document is a product requirement, not proof of implementation.
