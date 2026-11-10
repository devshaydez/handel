import test from "node:test";
import assert from "node:assert/strict";
import { NearRpcReceiptInspector, QuorumNearRpcReceiptInspector } from "./near-rpc-receipt-inspector.js";

const event = {
  operationId: "op-1",
  positionId: "pos-1",
  operationKind: "exercise_delivery",
  assetId: "nep141:stock.testnet",
  amount: "1000",
  sender: "writer.testnet",
  receiver: "holder.testnet",
};

function response(overrides: Record<string, unknown> = {}): any {
  return {
    result: {
      final_execution_status: "FINAL",
      transaction: { hash: "tx-1", signer_id: "alice.testnet" },
      status: { SuccessValue: "" },
      receipts_outcome: [{
        id: "receipt-1",
        block_hash: "block-100",
        block_height: 100,
        outcome: {
          executor_id: "verifier.testnet",
          status: { SuccessValue: "" },
          logs: [
            "ordinary log",
            "EVENT_JSON:" + JSON.stringify({
              standard: "handel.settlement.v1",
              data: [event],
            }),
          ],
        },
      }],
      ...overrides,
    },
  };
}

function inspector(body: unknown, rpcUrl = "https://rpc.testnet.near.org") {
  return new NearRpcReceiptInspector({
    verifierAccountId: "verifier.testnet",
    transactionSignerAccountId: "alice.testnet",
    rpcUrl,
    fetcher: async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as {
        method: string;
        params: { tx_hash: string; sender_account_id: string; wait_until: string };
      };
      assert.equal(request.method, "tx");
      assert.equal(request.params.tx_hash, "tx-1");
      assert.equal(request.params.sender_account_id, "alice.testnet");
      assert.equal(request.params.wait_until, "FINAL");
      return new Response(JSON.stringify(body), { status: 200 });
    },
  });
}

test("NEAR receipt inspector binds a settlement event to a finalized verifier receipt", async () => {
  const result = await inspector(response()).inspect("tx-1", "receipt-1");
  assert.equal(result.executionStatus, "success");
  assert.equal(result.finalized, true);
  assert.equal(result.canonical, true);
  assert.equal(result.blockHeight, 100);
  assert.equal(result.events.length, 1);
  assert.deepEqual(result.events[0], {
    standard: "handel.settlement.v1",
    ...event,
    transactionHash: "tx-1",
    receiptId: "receipt-1",
    eventIndex: 0,
  });
});

test("NEAR receipt inspector rejects missing transaction identity and signer mismatch", async () => {
  const noHash = response();
  delete noHash.result.transaction.hash;
  await assert.rejects(() => inspector(noHash).inspect("tx-1", "receipt-1"), /hash or signer/);
  const wrongSigner = response();
  wrongSigner.result.transaction.signer_id = "mallory.testnet";
  await assert.rejects(() => inspector(wrongSigner).inspect("tx-1", "receipt-1"), /hash or signer/);
});

test("NEAR receipt inspector rejects a receipt executed by another account", async () => {
  const body = response();
  body.result.receipts_outcome[0].outcome.executor_id = "attacker.testnet";
  await assert.rejects(() => inspector(body).inspect("tx-1", "receipt-1"),
    /not executed by the configured verifier/);
});

test("NEAR receipt inspector preserves failed and non-final execution as non-success", async () => {
  const failed = response();
  failed.result.receipts_outcome[0].outcome.status = { Failure: { error: "failed" } };
  assert.equal((await inspector(failed).inspect("tx-1", "receipt-1")).executionStatus, "failure");

  const pending = response({ final_execution_status: "EXECUTED_OPTIMISTIC" });
  const inspected = await inspector(pending).inspect("tx-1", "receipt-1");
  assert.equal(inspected.finalized, false);
  assert.equal(inspected.canonical, false);
});

test("NEAR receipt inspector rejects absent receipts, malformed events, and bad block identity", async () => {
  await assert.rejects(() => inspector(response()).inspect("tx-1", "missing"),
    /receipt is absent/);

  const malformed = response();
  malformed.result.receipts_outcome[0].outcome.logs = ["EVENT_JSON:{broken"];
  await assert.rejects(() => inspector(malformed).inspect("tx-1", "receipt-1"),
    /malformed EVENT_JSON/);

  const noBlock = response();
  noBlock.result.receipts_outcome[0].block_hash = "";
  await assert.rejects(() => inspector(noBlock).inspect("tx-1", "receipt-1"),
    /block identity is invalid/);
});

test("NEAR receipt inspector rejects non-HTTPS endpoints", () => {
  assert.throws(() => new NearRpcReceiptInspector({
    verifierAccountId: "verifier.testnet",
    transactionSignerAccountId: "alice.testnet",
    rpcUrl: "http://remote.example",
  }), /must use HTTPS/);
});

test("quorum inspector requires two independent matching receipt views", async () => {
  const matching = new QuorumNearRpcReceiptInspector([
    inspector(response(), "https://rpc.testnet.fastnear.com"),
    inspector(response(), "https://near-testnet.drpc.org"),
  ]);
  assert.equal((await matching.inspect("tx-1", "receipt-1")).blockHash, "block-100");
  const forked = response();
  forked.result.receipts_outcome[0].block_hash = "forked-block";
  const disagreeing = new QuorumNearRpcReceiptInspector([
    inspector(response(), "https://rpc.testnet.fastnear.com"),
    inspector(forked, "https://near-testnet.drpc.org"),
  ]);
  await assert.rejects(() => disagreeing.inspect("tx-1", "receipt-1"), /endpoints disagree/);
  assert.throws(() => new QuorumNearRpcReceiptInspector([inspector(response())]), /at least two/);
  assert.throws(() => new QuorumNearRpcReceiptInspector([
    inspector(response(), "https://rpc.testnet.fastnear.com"),
    inspector(response(), "https://rpc.testnet.fastnear.com"),
  ]), /distinct endpoint origins/);
});
