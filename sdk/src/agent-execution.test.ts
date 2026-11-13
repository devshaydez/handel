import test from "node:test";
import assert from "node:assert/strict";
import { executeDelegatedTrade, type DelegatedAgentSigner } from "./agent-execution.js";
import { DELEGATED_AGENT_METHODS } from "./near-function-call-signer.js";

const policy = {
  principal: "principal.testnet",
  allowed_assets: ["nep141:wnear.tidepool-sandbox.testnet"],
  max_underlying_amount: "100000000000000000000",
  max_premium_usdc: "50000000",
  max_collateral_usdc: "100000000",
  max_open_positions: 2,
  expires_at_ns: "999999999999999999999999999999",
  enabled: true,
};
function rpc(fetcherState: { policy?: unknown; mode?: unknown; position?: unknown }) {
  return async (_url: string | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { params: { method_name: string } };
    const method = body.params.method_name;
    const value = method === "get_agent_policy" ? (fetcherState.policy ?? policy)
      : method === "get_agent_execution_mode" ? (fetcherState.mode ?? "Delegated")
      : method === "get_position" ? (fetcherState.position ?? {
        id: 7, kind: "Call", writer: "principal.testnet", holder: "holder.testnet",
        asset_id: "nep141:wnear.tidepool-sandbox.testnet", underlying_amount: "1000000000000000000",
        strike_amount_usdc: "1000000", premium_amount_usdc: "1000000",
        escrow_position_id: 12, escrow_registration_pending: false,
      }) : null;
    return new Response(JSON.stringify({ result: { result: [...Buffer.from(JSON.stringify(value))], block_height: 10, block_hash: "same-block" } }), { status: 200 });
  };
}
function makeSigner(overrides: Partial<DelegatedAgentSigner> = {}) {
  const calls: Array<{ method: string; args: Record<string, unknown> }> = [];
  const signer: DelegatedAgentSigner = {
    accountId: "handel-agent.shaydez.testnet",
    contractId: "options.shaydez.testnet",
    async verifyAuthority() {},
    async call(method, args) {
      calls.push({ method, args });
      if (method === "agent_create_call" || method === "agent_create_put") {
        return { transactionHash: "create-hash", successValue: Buffer.from("7").toString("base64") };
      }
      return { transactionHash: "register-hash" };
    },
    ...overrides,
  };
  return { signer, calls };
}
const request = {
  principal: "principal.testnet", holder: "holder.testnet", type: "Call" as const,
  assetId: "nep141:wnear.tidepool-sandbox.testnet", quantity: "1000000000000000000",
  strike: "1000000", premium: "1000000",
  expiryNs: (BigInt(Date.now() + 86_400_000) * 1_000_000n).toString(),
};
test("delegated trade creates and registers escrow, then leaves collateral funding to principal", async () => {
  const { signer, calls } = makeSigner();
  const result = await executeDelegatedTrade({ request, signer, fetcher: rpc({}) });
  assert.equal(result.positionId, "7");
  assert.equal(result.escrowPositionId, "12");
  assert.equal(result.status, "awaiting_principal_collateral");
  assert.equal(result.nextAction, "principal_signs_collateral_transfer");
  assert.deepEqual(calls.map(c => c.method), ["agent_create_call", "agent_register_escrow_position"]);
  assert.equal(calls[0].args.holder, request.holder);
});
test("delegated executor fails closed on revocation, wrong mode, and every per-trade cap", async () => {
  for (const state of [
    { policy: { ...policy, enabled: false } },
    { mode: "ManualApproval" },
    { policy: { ...policy, max_underlying_amount: "1" } },
    { policy: { ...policy, max_premium_usdc: "1" } },
    { policy: { ...policy, allowed_assets: [] } },
  ]) {
    const { signer, calls } = makeSigner();
    await assert.rejects(() => executeDelegatedTrade({ request, signer, fetcher: rpc(state) }));
    assert.equal(calls.length, 0);
  }
});
test("delegated executor preserves create receipt when escrow registration fails", async () => {
  const { signer, calls } = makeSigner({
    async call(method) {
      calls.push({ method, args: {} });
      if (method === "agent_create_call") return { transactionHash: "create-hash", successValue: Buffer.from("7").toString("base64") };
      throw new Error("escrow unavailable");
    },
  });
  await assert.rejects(
    () => executeDelegatedTrade({ request, signer, fetcher: rpc({}) }),
    error => error instanceof Error && "stage" in error && (error as { stage: string }).stage === "register" &&
      Boolean((error as { partial?: { positionId?: string } }).partial?.positionId),
  );
});

test("delegated Put creates and registers the correct option before principal-funded collateral", async () => {
  const putRequest = { ...request, type: "Put" as const };
  const { signer, calls } = makeSigner();
  const fetcher = rpc({ position: {
    id: 7, kind: "Put", writer: "principal.testnet", holder: "holder.testnet",
    asset_id: "nep141:wnear.tidepool-sandbox.testnet", underlying_amount: "1000000000000000000",
    strike_amount_usdc: "1000000", premium_amount_usdc: "1000000",
    escrow_position_id: 12, escrow_registration_pending: false,
  } });
  const result = await executeDelegatedTrade({ request: putRequest, signer, fetcher });
  assert.equal(result.positionId, "7");
  assert.equal(result.escrowPositionId, "12");
  assert.deepEqual(calls.map(call => call.method), ["agent_create_put", "agent_register_escrow_position"]);
  assert.equal(calls[0].args.holder, putRequest.holder);
  assert.equal(calls[0].args.strike_amount_usdc, putRequest.strike);
});
