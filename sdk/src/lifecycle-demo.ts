/**
 * Offline lifecycle demo — shows the exact sequence a judge (or you) follows.
 * Does NOT send transactions. Prints the payloads and contract calls.
 *
 * Run: npx tsx src/lifecycle-demo.ts
 */

import { NVDAON_ASSET_ID, USDC_ASSET_ID, INTENTS_VERIFIER } from "./assets.js";
import { stubProposal, proposalToCreateArgs } from "./proposal.js";
import {
  buildCollateralLockIntent,
  buildPremiumIntent,
  buildCallSettlementIntents,
} from "./intents.js";
import { validateProposal } from "./policy.js";
import type { AgentPermission } from "./types.js";

const WRITER = "writer.near";
const BUYER = "buyer.near";
const AGENT = "agent.near";

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

console.log("=== Handel Options — Lifecycle Demo (offline) ===\n");

// 1. AI proposal
const proposal = stubProposal({
  underlyingAssetId: NVDAON_ASSET_ID,
  type: "Call",
  quantity: "1000000000000000000",
  strike: "100000000",
  premium: "5000000",
  daysToExpiry: 7,
});
console.log("1. AI Proposal");
console.log(JSON.stringify(proposal, null, 2));

const policy = validateProposal(proposal, permission, { requireAgent: true });
console.log("\n2. Policy check", policy.ok ? "PASS" : "FAIL", policy);

if (!policy.ok) process.exit(1);

const create = proposalToCreateArgs(proposal, permission, WRITER);
if (!create.ok) {
  console.error(create.errors);
  process.exit(1);
}
console.log("\n3. create_position args");
console.log(JSON.stringify(create.args, null, 2));

// 4. Collateral lock intent (writer signs with full-access key)
const collateralPayload = buildCollateralLockIntent(
  WRITER,
  INTENTS_VERIFIER, // in real flow: escrow or verifier internal balance
  NVDAON_ASSET_ID,
  proposal.quantity
);
console.log("\n4. Collateral lock NEP-413 payload (writer signs)");
console.log(JSON.stringify(collateralPayload, null, 2));

// 5. Premium intent
const premiumPayload = buildPremiumIntent(
  BUYER,
  WRITER,
  USDC_ASSET_ID,
  proposal.premium
);
console.log("\n5. Premium payment NEP-413 payload (buyer signs)");
console.log(JSON.stringify(premiumPayload, null, 2));

// 6. Settlement intents after exercise
const settlement = buildCallSettlementIntents(
  BUYER,
  WRITER,
  NVDAON_ASSET_ID,
  USDC_ASSET_ID,
  proposal.quantity,
  proposal.strike
);
console.log("\n6. Call settlement payloads");
console.log("Holder pays strike USDC:");
console.log(JSON.stringify(settlement.holderPayload, null, 2));
console.log("Writer delivers underlying:");
console.log(JSON.stringify(settlement.writerPayload, null, 2));

console.log(`
=== Contract call sequence (after intents land) ===
1. create_position(...)           → status Created
2. confirm_collateral_locked(id)  → status CollateralLocked
3. open_position(id, buyer)       → status Open
4. exercise(id, op_id)            → status PendingSettlement
5. confirm_settlement(id)         → status Settled

Agent can be revoked any time:
  revoke_agent({ agent: "${AGENT}" })
`);
