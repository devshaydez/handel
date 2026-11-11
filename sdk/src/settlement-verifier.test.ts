import test from "node:test";
import assert from "node:assert/strict";
import { EvidenceReplayGuard, verifySettlementReceipt, type ReceiptInspection, type SettlementExpectation } from "./settlement-verifier.js";

const expected: SettlementExpectation = {
  operationId: "op-1", positionId: "pos-1", operationKind: "exercise_delivery",
  assetId: "nep141:stock.testnet", amount: "1000", sender: "writer.testnet", receiver: "holder.testnet",
};
const event = {
  standard: "handel.settlement.v1" as const, ...expected,
  transactionHash: "tx-1", receiptId: "receipt-1", eventIndex: 0,
};
const receipt: ReceiptInspection = {
  transactionHash: "tx-1", receiptId: "receipt-1", blockHeight: 100,
  blockHash: "block-100", executionStatus: "success", finalized: true,
  canonical: true, events: [event],
};

test("verifier accepts only finalized canonical receipt with exact position and asset binding", async () => {
  const evidence = await verifySettlementReceipt({ inspect: async () => receipt },
    expected, "tx-1", "receipt-1", 123);
  assert.equal(evidence.finalized, true);
  assert.equal(evidence.blockHeight, 100);
  assert.equal(evidence.verifiedAt, 123);
});

test("verifier rejects unknown, failed, or non-finalized receipts", async () => {
  await assert.rejects(() => verifySettlementReceipt({
    inspect: async () => ({ ...receipt, executionStatus: "unknown" }),
  }, expected, "tx-1", "receipt-1"), /did not execute successfully/);
  await assert.rejects(() => verifySettlementReceipt({
    inspect: async () => ({ ...receipt, finalized: false }),
  }, expected, "tx-1", "receipt-1"), /not finalized/);
});

test("verifier rejects a receipt with mismatched asset, amount, sender, or receiver", async () => {
  await assert.rejects(() => verifySettlementReceipt({
    inspect: async () => ({ ...receipt, events: [{ ...event, amount: "999" }] }),
  }, expected, "tx-1", "receipt-1"), /no verifier event matches/);
});

test("verifier rejects duplicate matching settlement events", async () => {
  await assert.rejects(() => verifySettlementReceipt({
    inspect: async () => ({ ...receipt, events: [event, { ...event, eventIndex: 1 }] }),
  }, expected, "tx-1", "receipt-1"), /multiple verifier events/);
});

test("replay guard persists and rejects duplicate receipt events", () => {
  const guard = new EvidenceReplayGuard();
  guard.accept({ transactionHash: "tx-1", receiptId: "receipt-1", eventIndex: 0 });
  assert.throws(() => guard.accept({ transactionHash: "tx-1", receiptId: "receipt-1", eventIndex: 0 }), /replay/);
  const restored = new EvidenceReplayGuard(guard.snapshot());
  assert.throws(() => restored.accept({ transactionHash: "tx-1", receiptId: "receipt-1", eventIndex: 0 }), /replay/);
});
