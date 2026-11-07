/**
 * Offline lifecycle proposal demo.
 *
 * This prints contract-compatible call arguments and mock Intents payloads.
 * It does not submit transactions or move assets.
 *
 * Run from sdk/: npm run lifecycle
 */

import { NVDAON_ASSET_ID, USDC_ASSET_ID, INTENTS_VERIFIER } from "./assets.js";
import { stubProposal, proposalToAgentProposalArgs } from "./proposal.js";
import {
  buildCollateralLockIntent,
  buildPremiumIntent,
  buildCallSettlementIntents,
} from "./intents.js";
import { validateProposal } from "./policy.js";
import type { AgentPermission } from "./types.js";

const WRITER = "writer.testnet";
const BUYER = "buyer.testnet";
const AGENT = "agent.testnet";
const CONTRACT = "handel-options.shaydez.testnet";

const permission: AgentPermission = {
  agent: AGENT,
  owner: WRITER,
  allowedAssets: [NVDAON_ASSET_ID],
  maxQuantity: "2000000000000000000",
  maxPremium: "10000000",
  maxOpenPositions: 3,
  minExpiryNs: "0",
  maxExpiryNs: "9999999999999999999",
  enabled: true,
};

console.log("=== Handel Options — Offline Testnet Lifecycle Proposal ===\n");

const proposal = stubProposal({
  underlyingAssetId: NVDAON_ASSET_ID,
  type: "Call",
  quantity: "1000000000000000000",
  strike: "100000000",
  premium: "5000000",
  daysToExpiry: 7,
});

console.log("1. Deterministic AI fallback proposal");
console.log(JSON.stringify(proposal, null, 2));

const policy = validateProposal(proposal, permission, { requireAgent: true });
console.log("\n2. Local policy pre-check", policy.ok ? "PASS" : "FAIL", policy);
if (!policy.ok) process.exit(1);

const create = proposalToAgentProposalArgs(proposal, BUYER, permission);
if (!create.ok) {
  console.error(create.errors);
  process.exit(1);
}

console.log("\n3. Contract-compatible create_agent_proposal call");
console.log(JSON.stringify({ method: create.method, args: create.args }, null, 2));
console.log("\n4. Principal must call approve_agent_proposal({ proposal_id }) before collateral can be locked.");

const collateralPayload = buildCollateralLockIntent(
  WRITER,
  INTENTS_VERIFIER,
  NVDAON_ASSET_ID,
  proposal.quantity
);
console.log("\n5. Illustrative collateral intent payload (mock only; not submitted)");
console.log(JSON.stringify(collateralPayload, null, 2));

const premiumPayload = buildPremiumIntent(
  BUYER,
  WRITER,
  USDC_ASSET_ID,
  proposal.premium
);
console.log("\n6. Illustrative premium intent payload (mock only; not submitted)");
console.log(JSON.stringify(premiumPayload, null, 2));

const settlement = buildCallSettlementIntents(
  BUYER,
  WRITER,
  NVDAON_ASSET_ID,
  USDC_ASSET_ID,
  proposal.quantity,
  proposal.strike
);
console.log("\n7. Illustrative call settlement payloads (mock only; not submitted)");
console.log("Holder pays strike USDC:", JSON.stringify(settlement.holderPayload, null, 2));
console.log("Writer delivers underlying:", JSON.stringify(settlement.writerPayload, null, 2));

console.log(`
=== Contract lifecycle methods ===
1. create_agent_proposal(args)       → PendingCollateral + PendingApproval
2. approve_agent_proposal(id)        → Approved
3. begin_collateral_lock(id, op_id)  → PendingCollateralReconciliation
4. reconcile_operation(evidence)    → CollateralLocked
5. begin_premium_payment(id, op_id) → PendingPremium
6. reconcile_operation(evidence)    → Open
7. exercise(id, payment_id, delivery_id) → PendingSettlement
8. reconcile both legs              → Settled

Testnet limitation: the NEAR Intents legs above are mock payloads, not live settlement.
`);
