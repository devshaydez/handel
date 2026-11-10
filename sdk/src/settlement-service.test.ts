import test from "node:test";
import assert from "node:assert/strict";
import { DurableSettlementEvidenceService, type SettlementEvidenceSnapshot } from "./settlement-service.js";
import type { JsonSnapshotStore } from "./durable-orchestration.js";
import type { ReceiptInspection, SettlementExpectation } from "./settlement-verifier.js";

const expected: SettlementExpectation = {
  operationId: "op-2", positionId: "pos-2", operationKind: "premium_payout",
  assetId: "nep141:usdc.testnet", amount: "5000000", sender: "escrow.testnet", receiver: "writer.testnet",
};
const receipt: ReceiptInspection = {
  transactionHash: "tx-2", receiptId: "receipt-2", blockHeight: 200,
  blockHash: "block-200", executionStatus: "success", finalized: true, canonical: true,
  events: [{
    standard: "handel.settlement.v1", ...expected,
    transactionHash: "tx-2", receiptId: "receipt-2", eventIndex: 1,
  }],
};
class MemoryStore implements JsonSnapshotStore<SettlementEvidenceSnapshot> {
  value: SettlementEvidenceSnapshot | null = null;
  failSave = false;
  async load() { return this.value; }
  async save(value: SettlementEvidenceSnapshot) {
    if (this.failSave) throw new Error("disk unavailable");
    this.value = structuredClone(value);
  }
}

test("durable settlement service records evidence and rejects replay after restart", async () => {
  const store = new MemoryStore();
  const inspector = { inspect: async () => receipt };
  const service = await DurableSettlementEvidenceService.open(store, inspector);
  const evidence = await service.verifyAndRecord(expected, "tx-2", "receipt-2", 456);
  assert.equal(evidence.verifiedAt, 456);
  assert.equal(service.list().length, 1);
  const restored = await DurableSettlementEvidenceService.open(store, inspector);
  assert.equal(restored.list().length, 1);
  await assert.rejects(() => restored.verifyAndRecord(expected, "tx-2", "receipt-2"), /replay/);
});

test("failed evidence persistence does not consume replay key", async () => {
  const store = new MemoryStore();
  const service = await DurableSettlementEvidenceService.open(store, { inspect: async () => receipt });
  store.failSave = true;
  await assert.rejects(() => service.verifyAndRecord(expected, "tx-2", "receipt-2"), /disk unavailable/);
  store.failSave = false;
  await service.verifyAndRecord(expected, "tx-2", "receipt-2");
  assert.equal(service.list().length, 1);
});

test("concurrent duplicate receipt evidence is serialized", async () => {
  const store = new MemoryStore();
  const service = await DurableSettlementEvidenceService.open(store, { inspect: async () => receipt });
  const results = await Promise.allSettled([
    service.verifyAndRecord(expected, "tx-2", "receipt-2"),
    service.verifyAndRecord(expected, "tx-2", "receipt-2"),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.equal(service.list().length, 1);
});
