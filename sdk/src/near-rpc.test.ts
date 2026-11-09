import test from "node:test";
import assert from "node:assert/strict";
import { NearRpcTransactionObserver } from "./near-rpc.js";

function rpcResponse(result: unknown) {
  return async (_input: string | URL, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)) as { method: string; params: { wait_until: string; sender_account_id: string } };
    assert.equal(request.method, "tx");
    assert.equal(request.params.wait_until, "FINAL");
    assert.equal(request.params.sender_account_id, "alice.testnet");
    return new Response(JSON.stringify(result), { status: 200 });
  };
}

test("NEAR observer returns success only after FINAL receipt execution", async () => {
  const observer = new NearRpcTransactionObserver("https://rpc.testnet.near.org", rpcResponse({
    result: { final_execution_status: "FINAL", status: { SuccessValue: "" },
      transaction_outcome: { outcome: { receipt_ids: ["r-1"] } },
      receipts_outcome: [{ id: "r-1", outcome: { status: { SuccessValue: "" } } }],
    },
  }));
  assert.deepEqual(await observer.waitForFinalExecution("tx-1", "alice.testnet"),
    { outcome: "success", transactionId: "tx-1", receiptIds: ["r-1"] });
});

test("NEAR observer treats RPC errors and non-final status as unknown", async () => {
  const unknown = new NearRpcTransactionObserver("https://rpc.testnet.near.org", rpcResponse({
    error: { cause: { name: "UNKNOWN_TRANSACTION" } },
  }));
  assert.deepEqual(await unknown.waitForFinalExecution("tx-unknown", "alice.testnet"),
    { outcome: "unknown", transactionId: "tx-unknown" });
  const pending = new NearRpcTransactionObserver("https://rpc.testnet.near.org", rpcResponse({
    result: { final_execution_status: "EXECUTED_OPTIMISTIC", status: { SuccessValue: "" } },
  }));
  assert.deepEqual(await pending.waitForFinalExecution("tx-pending", "alice.testnet"),
    { outcome: "unknown", transactionId: "tx-pending" });
});

test("NEAR observer returns definitive failure only at FINAL", async () => {
  const observer = new NearRpcTransactionObserver("https://rpc.testnet.near.org", rpcResponse({
    result: { final_execution_status: "FINAL", status: { Failure: { ActionError: "rejected" } } },
  }));
  const result = await observer.waitForFinalExecution("tx-failed", "alice.testnet");
  assert.equal(result.outcome, "failure");
  if (result.outcome === "failure") assert.match(result.failureCode, /rejected/);
});

test("NEAR observer rejects insecure endpoints", () => {
  assert.throws(() => new NearRpcTransactionObserver("http://example.com"), /HTTPS/);
});
