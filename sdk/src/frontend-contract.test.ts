import test from "node:test";
import assert from "node:assert/strict";
import { HandelFrontendClient, HandelFrontendContractError, type HandelFrontendPort, type SubmittedTransaction } from "./frontend-contract.js";
const tx: SubmittedTransaction = { transactionHash: "abc123", signerAccountId: "alice.testnet", submittedAt: "2026-11-10T10:00:00.000Z", status: "submitted" };
function port(overrides: Partial<HandelFrontendPort> = {}): HandelFrontendPort {
 const base: HandelFrontendPort = {
  getPortfolio: async accountId => ({ accountId, balances: [], positions: [], operations: [], source: "rpc", observedAt: "2026-11-10T10:00:00.000Z", blockHeight: 10, complete: true }),
  getPosition: async () => null, getOperation: async () => null, getAgentPolicy: async () => null, getAgentProposal: async () => null,
  createOffer: async () => tx, setAgentPolicy: async () => tx, setAgentExecutionMode: async () => tx, revokeAgent: async () => tx,
  createAgentProposal: async () => ({ ...tx, signerAccountId: "agent.testnet" }), approveAgentProposal: async () => tx,
  rejectAgentProposal: async () => tx, exercisePosition: async () => tx, requestExpiryRelease: async () => tx,
  getFinality: async transactionHash => ({ status: "unknown", transactionHash }),
 };
 return { ...base, ...overrides };
}
test("portfolio is account-bound and defensively cloned", async () => {
 const c = new HandelFrontendClient(port()); const p = await c.portfolio("alice.testnet");
 assert.equal(p.accountId, "alice.testnet"); p.positions.push({} as never);
 assert.equal((await c.portfolio("alice.testnet")).positions.length, 0);
 await assert.rejects(() => c.portfolio("bad account"), HandelFrontendContractError);
});
test("portfolio rejects cross-account adapter responses", async () => {
 const c = new HandelFrontendClient(port({ getPortfolio: async () => ({ accountId: "mallory.testnet", balances: [], positions: [], operations: [], source: "rpc", observedAt: "2026-11-10T10:00:00.000Z", blockHeight: 10, complete: true }) }));
 await assert.rejects(() => c.portfolio("alice.testnet"), /mismatched snapshot/);
});
test("u128/u64 boundary values remain exact decimal strings", async () => {
 const c = new HandelFrontendClient(port());
 const r = await c.createOffer({ principal: "alice.testnet", holder: "bob.testnet", kind: "Call", assetId: "nep141:stock.testnet", underlyingAmount: "340282366920938463463374607431768211455", strikeAmountUsdc: "1000000", expiryNs: "18446744073709551615", premiumAmountUsdc: "1" });
 assert.equal(r.status, "submitted");
 await assert.rejects(() => c.createOffer({ principal: "alice.testnet", holder: "bob.testnet", kind: "Call", assetId: "nep141:stock.testnet", underlyingAmount: 9007199254740993 as never, strikeAmountUsdc: "1", expiryNs: "100", premiumAmountUsdc: "1" }), /canonical bounded integer string/);
});
test("zero amounts and duplicate allowlists are rejected before wallet calls", async () => {
 let calls = 0; const c = new HandelFrontendClient(port({ createOffer: async () => { calls++; return tx; }, setAgentPolicy: async () => { calls++; return tx; } }));
 await assert.rejects(() => c.createOffer({ principal: "alice.testnet", holder: "bob.testnet", kind: "Put", assetId: "nep141:usdc.testnet", underlyingAmount: "1", strikeAmountUsdc: "0", expiryNs: "100", premiumAmountUsdc: "1" }), /amounts must be positive/);
 await assert.rejects(() => c.updateAgentPolicy({ principal: "alice.testnet", agentId: "agent.testnet", allowedAssets: ["x", "x"], maxUnderlyingAmount: "1", maxPremiumUsdc: "1", maxCollateralUsdc: "1", maxOpenPositions: 1, expiresAtNs: "100" }), /non-empty and unique/);
 assert.equal(calls, 0);
});
test("submitted transaction is not promoted to final success", async () => {
 const c = new HandelFrontendClient(port()); const r = await c.exercise("alice.testnet", "18446744073709551615");
 assert.equal(r.status, "submitted"); assert.equal((await c.finality(r.transactionHash, "alice.testnet")).status, "unknown");
});
test("wallet adapter signer must match requested principal", async () => {
 const c = new HandelFrontendClient(port({ createOffer: async () => ({ ...tx, signerAccountId: "mallory.testnet" }) }));
 await assert.rejects(() => c.createOffer({ principal: "alice.testnet", holder: "bob.testnet", kind: "Call", assetId: "nep141:stock.testnet", underlyingAmount: "1", strikeAmountUsdc: "1", expiryNs: "100", premiumAmountUsdc: "1" }), /invalid submission receipt/);
});
test("finality response is bound to requested transaction", async () => {
 const c = new HandelFrontendClient(port({ getFinality: async () => ({ status: "final_success", transactionHash: "other", receiptIds: [] }) }));
 await assert.rejects(() => c.finality("tx-1", "alice.testnet"), /invalid result/);
});

test("position and operation reads are bound to requested IDs", async () => {
 const badPosition = new HandelFrontendClient(port({ getPosition: async () => ({ id: "2" } as never) }));
 await assert.rejects(() => badPosition.position("1"), /different position/);
 const badOperation = new HandelFrontendClient(port({ getOperation: async () => ({ id: "op-other" } as never) }));
 await assert.rejects(() => badOperation.operation("op-1"), /different operation/);
});
test("agent policy reads cannot cross principals", async () => {
 const c = new HandelFrontendClient(port({ getAgentPolicy: async () => ({
  principal: "mallory.testnet", allowedAssets: [], maxUnderlyingAmount: "1",
  maxPremiumUsdc: "1", maxCollateralUsdc: "1", maxOpenPositions: 1,
  expiresAtNs: "100", enabled: true, executionMode: "ManualApproval",
 }) }));
 await assert.rejects(() => c.agentPolicy("alice.testnet", "agent.testnet"), /different principal/);
});
test("proposal reads are bound to requested proposal IDs", async () => {
 const c = new HandelFrontendClient(port({ getAgentProposal: async () => ({ proposalId: "proposal-other" } as never) }));
 await assert.rejects(() => c.agentProposal("proposal-1"), /different proposal/);
});

test("portfolio rejects malformed or unsafe token balances", async () => {
 const malformed = new HandelFrontendClient(port({ getPortfolio: async accountId => ({
  accountId, balances: [{ assetId: "nep141:token.testnet", amount: 9007199254740993 as never, decimals: 6,
   observedAt: "2026-11-10T10:00:00.000Z", blockHeight: 10, source: "ft_balance_of" }],
  positions: [], operations: [], source: "rpc", observedAt: "2026-11-10T10:00:00.000Z", blockHeight: 10, complete: true
 }) }));
 await assert.rejects(() => malformed.portfolio("alice.testnet"), /invalid or mismatched snapshot/);
});
test("manual proposal creation must be submitted by the authorized agent account", async () => {
 const c = new HandelFrontendClient(port({ createAgentProposal: async () => ({ ...tx, signerAccountId: "alice.testnet" }) }));
 await assert.rejects(() => c.createProposal({
  principal: "alice.testnet", agentId: "agent.testnet", holder: "bob.testnet", kind: "Call",
  assetId: "nep141:stock.testnet", underlyingAmount: "1", strikeAmountUsdc: "100",
  expiryNs: "200", premiumAmountUsdc: "1", rationaleHash: "sha256:reason"
 }), /invalid submission receipt/);
});

test("portfolio preserves valid balances above JavaScript safe-integer precision", async () => {
 const exact = "340282366920938463463374607431768211455";
 const c = new HandelFrontendClient(port({ getPortfolio: async accountId => ({
  accountId, balances: [{ assetId: "nep141:token.testnet", amount: exact, decimals: 255,
   observedAt: "2026-11-10T10:00:00.000Z", blockHeight: 10, source: "ft_balance_of" }],
  positions: [], operations: [], source: "rpc", observedAt: "2026-11-10T10:00:00.000Z", blockHeight: 10, complete: true
 }) }));
 assert.equal((await c.portfolio("alice.testnet")).balances[0].amount, exact);
});
