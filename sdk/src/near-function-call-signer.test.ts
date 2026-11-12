import test from "node:test";
import assert from "node:assert/strict";
import { DELEGATED_AGENT_METHODS, RestrictedAgentFunctionCallSigner, type AccessKeyAccount } from "./near-function-call-signer.js";

const key = "ed25519:delegated-public-key";
const allowance = "1000000000000000000000000";
function account(permission: unknown = { FunctionCall: {
  receiver_id: "options.shaydez.testnet",
  method_names: [...DELEGATED_AGENT_METHODS],
  allowance,
} }): AccessKeyAccount & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    async getAccessKeys() { return [{ public_key: key, access_key: { permission } }]; },
    async functionCall(input) {
      calls.push(input);
      return { transaction: { hash: "finalized-hash" }, status: { SuccessValue: "Nw==" } };
    },
  };
}
test("restricted signer accepts only the exact delegated function-call key and submits final calls", async () => {
  const a = account();
  const signer = new RestrictedAgentFunctionCallSigner("handel-agent.shaydez.testnet", "options.shaydez.testnet", key, a);
  const result = await signer.call("agent_create_call", { holder: "holder.testnet" });
  assert.equal(result.transactionHash, "finalized-hash");
  assert.equal(a.calls.length, 1);
  assert.equal((a.calls[0] as { waitUntil: string }).waitUntil, "FINAL");
});
test("restricted signer rejects full-access keys and any receiver/method expansion", async () => {
  for (const permission of [
    "FullAccess",
    { FunctionCall: { receiver_id: "usdc.tidepool-sandbox.testnet", method_names: [...DELEGATED_AGENT_METHODS], allowance } },
    { FunctionCall: { receiver_id: "options.shaydez.testnet", method_names: [], allowance } },
    { FunctionCall: { receiver_id: "options.shaydez.testnet", method_names: [...DELEGATED_AGENT_METHODS, "set_agent_policy"], allowance } },
    { FunctionCall: { receiver_id: "options.shaydez.testnet", method_names: [...DELEGATED_AGENT_METHODS], allowance: "999999999999999999999999999999" } },
  ]) {
    const a = account(permission);
    const signer = new RestrictedAgentFunctionCallSigner("handel-agent.shaydez.testnet", "options.shaydez.testnet", key, a);
    await assert.rejects(() => signer.call("agent_create_call", {}));
    assert.equal(a.calls.length, 0);
  }
});
test("restricted signer refuses methods outside the OptionsContract allowlist", async () => {
  const a = account();
  const signer = new RestrictedAgentFunctionCallSigner("handel-agent.shaydez.testnet", "options.shaydez.testnet", key, a);
  await assert.rejects(() => signer.call("agent_create_call;ft_transfer" as never, {}));
  assert.equal(a.calls.length, 0);
});
