# Handel — Product Vision: AI-Assisted Stock Trading and Education

**Status:** Product requirements clarified by the project owner on 2026-11-09. These are target requirements, not a claim that the current code already delivers them.

## 1. Product definition

Handel is an **AI-assisted stock-trading product with an integrated investing educator**. It helps users understand markets, analyse opportunities, form trading strategies and, when they explicitly choose to delegate authority, execute trades automatically within strict user-defined limits.

Handel must serve two audiences:
- **New investors:** people who need concepts explained in plain language, want to learn how markets and options work, and need to understand the risks before acting.
- **Experienced users:** people who want market analysis, strategy generation, options valuation, portfolio/position awareness and faster execution workflows.

The AI is more than a chatbot or a calculator. It should analyse evidence, form a view, explain its reasoning, recommend an action or no action, and participate in an execution workflow subject to deterministic protocol controls.

## 2. Initial instrument scope and an important distinction

The current protocol scope is fully collateralized European Calls and Puts on Ondo tokenized equities (including the configured NVDAon, TSLAon, AAPLOn and SPYon assets), collateralized with the relevant underlying or USDC and intended to settle through NEAR Intents.

Therefore, the initial supported trading decisions map to options:
- **Bullish view:** consider buying a Call, or another explicitly supported bullish options strategy.
- **Bearish view:** consider buying a Put, or another explicitly supported bearish options strategy.
- **Income / neutral-to-bullish view:** consider writing a fully collateralized Call where appropriate.
- **Income / neutral-to-bearish view:** consider writing a fully collateralized Put where appropriate.
- **No suitable opportunity:** recommend waiting or taking no trade.

Do not conflate an options position with buying or selling the underlying stock. The current Handel contract/SDK work does **not** prove a direct spot-stock buy/sell route. If direct spot trading is desired, it requires a separately specified and verified execution rail, asset custody/settlement support, user permissions, risk controls and UI. Until that exists, describe Handel's actual execution capability as options-first and do not claim it can directly buy/sell the underlying equity.

The user-facing product may discuss a stock's outlook and use plain-language terms such as bullish/bearish, but the executable order must clearly identify the actual instrument, side, strike, expiry, quantity, premium, collateral and settlement route.

## 3. Three user control modes

Users should be able to choose their desired level of assistance. Automatic execution must never be silently enabled.

### Mode A — Learn and explore

- Explain stocks, tokenized equities, Calls, Puts, strike price, expiry, premium, collateral, assignment/exercise, volatility, liquidity, slippage and settlement.
- Answer questions in beginner-friendly language, adapting depth to the user's experience.
- Walk through hypothetical examples and clearly label simulations.
- Explain the possible upside, downside, maximum loss where determinable, break-even, capital required and key risks.
- Let the user ask for market analysis without creating or executing a trade.
- Do not present education or simulated outcomes as live market quotes or guaranteed outcomes.

### Mode B — Assisted / approval required

- Analyse market data and propose a trade or explicitly recommend no trade.
- Explain the thesis, evidence, assumptions, data timestamps, freshness, risk/reward and alternatives.
- Construct a structured proposal for the exact instrument and terms.
- Run deterministic pricing, collateral, exposure, permission and policy checks.
- Present the complete order and all material risks to the user.
- Wait for the user to approve before any signing or asset-moving transaction.
- A conversation such as "that sounds good" must not be treated as blanket consent for future trades; approval must be clear and specific to the transaction.

### Mode C — Automatic execution (explicit opt-in)

A user may explicitly enable automatic execution and delegate a limited trading mandate. The mandate must be clear, reviewable, time-bounded where appropriate, and revocable.

At minimum, the user must configure or affirm:
- Allowed underlying assets and instruments.
- Permitted actions/strategies (buy Call, buy Put, write Call, write Put; spot actions only if separately supported).
- Maximum quantity and maximum collateral per position.
- Maximum premium, total exposure and aggregate open-position limits.
- Permitted strike/expiry ranges and minimum time to expiry.
- Maximum acceptable spread, slippage, fees and minimum liquidity.
- Daily/weekly loss or drawdown stop, and any other circuit-breaker threshold.
- Whether the agent may open, adjust, close, exercise or allow positions to expire.
- Mandate expiry, pause controls and immediate revocation.
- Whether the agent may act only on a defined strategy or may select among permitted strategies.

The AI may act only inside the mandate. The system must reject any action outside it, even if the model recommends it. Revocation and pause must prevent new actions promptly and must not depend on the model cooperating.

**Safe default:** automatic execution is off. Users who do not opt in remain in approval-required mode. Changing autonomy level requires an explicit user action and clear disclosure of what authority is being granted.

## 4. What the AI decision system does

The agent should perform a bounded analysis loop:

1. **Understand the user's intent:** learning question, market analysis, watchlist request, trade idea, or management of an existing position.
2. **Gather evidence:** approved market prices, volatility/market context, asset metadata, relevant news where supported, liquidity/route quotes, option terms, existing positions and on-chain permissions.
3. **Check evidence quality:** verify source identity, timestamps, freshness, asset identity, units/decimals and consistency. Missing, stale or contradictory evidence must lead to a warning or no-trade result.
4. **Analyse the opportunity:** identify trend/context, plausible scenarios, volatility and time-to-expiry effects, liquidity, costs, payoff and downside.
5. **Generate a decision:** propose a specific supported action or recommend no trade. It must state the thesis, evidence, assumptions, confidence limitations, invalidation conditions and risks.
6. **Calculate deterministically:** use trusted market inputs and deterministic pricing/payoff/collateral/risk calculations. The language model must not be the price oracle and must not invent balances, fills, quotes, permissions or transaction results.
7. **Enforce policy:** validate the exact proposal against contract state, user mandate, allowlists, collateral availability, exposure limits, freshness and execution constraints.
8. **Apply the user's chosen control mode:** teach only, request transaction-specific approval, or execute within a valid automatic mandate.
9. **Verify and report:** independently verify transaction/settlement status before reporting execution. Record the decision inputs, policy outcome, user approval or mandate, action and evidence in an auditable history.

The agent must be allowed to say **"no trade"**. It should not manufacture activity to appear useful or meet a trade-frequency target.

## 5. Separation of responsibilities

- **AI agent:** interprets goals, analyses evidence, explains scenarios, proposes strategy and chooses among permitted actions.
- **Market-data and pricing layer:** supplies validated market inputs and deterministic valuation/payoff calculations.
- **Risk/policy engine:** enforces collateral, position sizing, exposure, mandate, asset, expiry, liquidity and loss limits.
- **Smart contracts / permission layer:** enforce the authoritative on-chain permissions, state transitions, collateral rules and revocation constraints.
- **Wallet / signing and execution layer:** signs and submits only transactions authorized by the selected user mode and supported signing architecture.
- **Settlement verification:** confirms actual finality, asset, amount, recipient and operation identity from trusted, independently verifiable evidence.
- **Frontend:** makes the proposed action, control mode, permissions, costs, risks and transaction status understandable.

The model must never be able to bypass deterministic policy or contract checks. Off-chain checks are useful defense-in-depth, but they do not replace enforceable on-chain controls.

## 6. Beginner education is a first-class product feature

The educator should:
- Explain concepts using simple language first, with optional deeper technical detail.
- Define trading terms when they first appear and use concrete examples.
- Explain the difference between owning a stock/token and holding an option on it.
- Explain Calls and Puts, buyer vs writer, premium, strike, expiry, collateral, exercise and physical settlement.
- Show payoff and break-even examples with clearly stated assumptions.
- Explain that options can expire worthless, writers can face significant obligations, and collateral does not eliminate every risk.
- Explain fees, liquidity, spread, slippage, volatility and settlement delays where relevant.
- Compare possible strategies without presenting any as guaranteed or universally suitable.
- Identify when a user appears to misunderstand a material risk and pause before an approval or delegation action.
- Distinguish education, hypothetical examples, historical analysis, live data and executable proposals.
- Never pressure a beginner to trade or enable autonomy.

A user should be able to ask questions such as "What is a Call?", "Why would someone buy a Put?", "What happens if NVDA falls below my strike?", or "Why did Handel recommend no trade?" and receive an accessible explanation grounded in the actual instrument and terms.

## 7. Transparency and user experience

Every actionable recommendation should make visible:
- Underlying and exact instrument type.
- Buy/write direction and Call/Put.
- Strike, expiry, quantity and premium.
- Required collateral and fees.
- Break-even and payoff scenarios where calculable.
- Market-data source and timestamp/freshness.
- Liquidity, spread, slippage and route limitations.
- Main thesis, assumptions, downside and reasons the thesis could fail.
- Policy/permission result.
- Whether the action is hypothetical, awaiting approval, authorized for automation, submitted, pending, finalized or failed.

Never display simulated fills, fabricated balances, made-up quotes or fake transaction IDs as live results. If the route is unavailable or verification is incomplete, say so.

## 8. Security, consent and financial-risk boundaries

- Never request or store a user's seed phrase or raw private key.
- Do not give an AI agent a user's full-access key. The known NEP-413 signing constraint remains: ordinary Function Call Keys cannot sign NEP-413, and a full-access key grants broad authority. Any automatic execution design must resolve this safely rather than disguising broad authority as limited delegation.
- Automatic execution requires explicit opt-in, a narrow enforceable mandate, spending/exposure caps, monitoring, audit and fast revocation.
- The agent must not be able to expand its own permissions, change the user's risk limits, whitelist new assets or renew its own mandate.
- Fail closed on stale data, invalid signatures/attestation, unsupported assets, missing collateral, policy failure, expired permissions, ambiguous execution or unverifiable settlement.
- Never claim an order executed until the execution and settlement evidence supports that claim.
- No real-asset transfer, deployment, or Mainnet action without the required explicit authorization and release gates.
- Present risk in clear language; do not promise returns or imply that AI analysis removes investment risk.

## 9. Product delivery priorities

1. **Beginner education and explainable analysis:** establish a helpful learning experience alongside trading workflows.
2. **Reliable analysis and proposals:** live, validated market context; deterministic options pricing/payoff/risk; clear no-trade decisions.
3. **Approval-required execution:** make the complete user-reviewed options flow work safely before enabling automation.
4. **Opt-in bounded automation:** implement enforceable permissions, safe signing, limits, revocation, monitoring and audit. Do not ship an "auto-trade" toggle that is only enforced in the frontend or by an LLM prompt.
5. **Broader stock execution:** decide separately whether direct spot buy/sell is part of the roadmap. It is not implied by the existing options contract and requires its own verified route and custody model.

## 10. Acceptance criteria for the product vision

Handel should not be described as delivering this full vision until evidence demonstrates that:
- A beginner can learn the core concepts and understand an example trade.
- A user can request an analysis and receive an evidence-backed, explainable recommendation or no-trade result.
- Every proposal uses validated market data and deterministic pricing/risk/collateral calculations.
- Approval-required mode cannot submit a trade without transaction-specific user approval.
- Automatic mode is disabled by default and requires an explicit, visible, bounded mandate.
- On-chain or otherwise enforceable controls reject actions outside the mandate.
- Revocation/pause blocks further delegated actions and is tested.
- Signing does not expose a full-access user key to the model or agent.
- Execution and settlement are independently verified before being reported as complete.
- The UI clearly distinguishes options from direct stock ownership/spot trading.
- Live, testnet, dry-quoted, simulated and unsupported capabilities are accurately labelled.

---

**Core product statement:** Handel helps people learn about stocks and options, understand market opportunities, and make better-informed trading decisions with AI. Users remain in control: they can approve every trade or explicitly delegate a limited mandate for automatic execution. The AI analyses and proposes; deterministic risk controls, enforceable permissions and verified settlement govern what can actually happen.
