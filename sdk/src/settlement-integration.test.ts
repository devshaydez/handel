import test from "node:test";
import assert from "node:assert/strict";
import {
  DurableOperationJournal,
  executeWalletOperation,
  type JsonSnapshotStore,
} from "./durable-orchestration.js";
import {
  DurableSettlementEvidenceService,
  type SettlementEvidenceSnapshot,
} from "./settlement-service.js";
import { NearRpcReceiptInspector } from "./near-rpc-receipt-inspector.js";
import type { WorkflowOperation } from "./orchestration.js";
import type { SettlementExpectation } from "./settlement-verifier.js";

class SnapshotStore<T> implements JsonSnapshotStore<T> {
  value: T | null = null;
  async load() { return this.value; }
  async save(value: T) { this.value = structuredClone(value); }
}

const expectation: SettlementExpectation = {
  operationId: "op-e2e",
  positionId: "position-e2e",
  operationKind: "exercise_delivery",
  assetId: "nep141:stock.testnet",
  amount: "1000",
  sender: "writer.testnet",
  receiver: "holder.testnet",
};

const event = {
  operationId: expectation.operationId,
  positionId: expectation.positionId,
  operationKind: expectation.operationKind,
  assetId: expectation.assetId,
  amount: expectation.amount,
  sender: expectation.sender,
  receiver: expectation.receiver,
};

function rpcResponse(eventData: Record<string, string>) {
  return {
    result: {
      final_execution_status: "FINAL",
      transaction: { hash: "tx-e2e", signer_id: "alice.testnet" },
      receipts_outcome: [{
        id: "receipt-e2e",
        block_hash: "block-e2e",
        block_height: 222,
        outcome: {
          executor_id: "verifier.testnet",
          status: { SuccessValue: "" },
          logs: ["EVENT_JSON:" + JSON.stringify({
            standard: "handel.settlement.v1",
            data: [eventData],
          })],
        },
      }],
    },
  };
}

const input = {
  operationId: "op-e2e",
  positionId: "position-e2e",
  kind: "exercise_delivery" as const,
  requestDigest: "sha256:e2e",
};
const payload = {
  recipient: "verifier.testnet",
  nonce: "e2e-nonce",
  message: "{}",
};
const wallet = {
  signNep413: async (value: typeof payload) => ({
    standard: "nep413" as const,
    payload: value,
    public_key: "ed25519:public",
    signature: "ed25519:signature",
  }),
};

function makeInspector(body: unknown) {
  return new NearRpcReceiptInspector({
    verifierAccountId: "verifier.testnet",
    transactionSignerAccountId: "alice.testnet",
    fetcher: async () => new Response(JSON.stringify(body), { status: 200 }),
  });
}

test("end-to-end offline settlement path requires FINAL RPC receipt and persists verified evidence", async () => {
  const journalStore = new SnapshotStore<WorkflowOperation[]>();
  const evidenceStore = new SnapshotStore<SettlementEvidenceSnapshot>();
  const journal = await DurableOperationJournal.open(journalStore);
  const inspector = makeInspector(rpcResponse(event));
  const evidence = await DurableSettlementEvidenceService.open(evidenceStore, inspector);

  const result = await executeWalletOperation(
    journal,
    wallet,
    { submit: async () => ({ transactionId: "tx-e2e" }) },
    { waitForFinalExecution: async () => ({
      outcome: "success",
      transactionId: "tx-e2e",
      receiptIds: ["receipt-e2e"],
    }) },
    input,
    payload,
    "alice.testnet",
    { expectation, evidence },
  );

  assert.equal(result.status, "succeeded");
  assert.equal(evidence.list().length, 1);
  assert.equal(evidence.list()[0]?.blockHash, "block-e2e");

  const reopened = await DurableSettlementEvidenceService.open(evidenceStore, inspector);
  assert.equal(reopened.list().length, 1);
});

test("end-to-end settlement path quarantines FINAL transactions without the expected verifier event", async () => {
  const journalStore = new SnapshotStore<WorkflowOperation[]>();
  const evidenceStore = new SnapshotStore<SettlementEvidenceSnapshot>();
  const journal = await DurableOperationJournal.open(journalStore);
  const inspector = makeInspector(rpcResponse({ ...event, amount: "999" }));
  const evidence = await DurableSettlementEvidenceService.open(evidenceStore, inspector);

  const result = await executeWalletOperation(
    journal,
    wallet,
    { submit: async () => ({ transactionId: "tx-e2e" }) },
    { waitForFinalExecution: async () => ({
      outcome: "success",
      transactionId: "tx-e2e",
      receiptIds: ["receipt-e2e"],
    }) },
    input,
    payload,
    "alice.testnet",
    { expectation, evidence },
  );

  assert.equal(result.status, "outcome_unknown");
  assert.equal(evidence.list().length, 0);
});
