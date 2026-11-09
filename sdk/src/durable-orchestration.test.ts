import test from "node:test";
import assert from "node:assert/strict";
import { DurableOperationJournal, executeWalletOperation, submitWalletIntent, type JsonSnapshotStore } from "./durable-orchestration.js";
import type { WorkflowOperation } from "./orchestration.js";

class MemoryStore implements JsonSnapshotStore<WorkflowOperation[]> {
  value: WorkflowOperation[] | null = null;
  failSave = false;
  async load() { return this.value; }
  async save(value: WorkflowOperation[]) {
    if (this.failSave) throw new Error("storage unavailable");
    this.value = structuredClone(value);
  }
}

test("durable journal persists transitions and restores after restart", async () => {
  const store = new MemoryStore();
  const journal = await DurableOperationJournal.open(store);
  await journal.begin({ operationId: "op-1", positionId: "p-1", kind: "pay_premium", requestDigest: "sha256:req" });
  await journal.markSubmitted("op-1", "tx-1");
  const restored = await DurableOperationJournal.open(store);
  assert.equal(restored.snapshot()[0]?.status, "submitted");
  await restored.recordUnknown("op-1");
  const restoredAgain = await DurableOperationJournal.open(store);
  assert.equal(restoredAgain.snapshot()[0]?.status, "outcome_unknown");
});

test("failed persistence rolls back in-memory transition", async () => {
  const store = new MemoryStore();
  const journal = await DurableOperationJournal.open(store);
  store.failSave = true;
  await assert.rejects(() => journal.begin({
    operationId: "op-fail", positionId: "p-1", kind: "pay_premium", requestDigest: "sha256:req",
  }), /storage unavailable/);
  assert.equal(journal.snapshot().length, 0);
});

test("concurrent durable writes serialize without losing journal entries", async () => {
  const store = new MemoryStore();
  const journal = await DurableOperationJournal.open(store);
  await Promise.all([1, 2, 3].map((n) => journal.begin({
    operationId: "op-" + n, positionId: "p-1", kind: "pay_premium", requestDigest: "sha256:" + n,
  })));
  assert.equal(store.value?.length, 3);
});

test("wallet boundary signs exact payload and rejects altered signatures", async () => {
  const payload = { recipient: "verifier.testnet", nonce: "nonce", message: "{}" };
  let submitted = false;
  const result = await submitWalletIntent(
    { signNep413: async (p) => ({ standard: "nep413", payload: p, public_key: "ed25519:pub", signature: "ed25519:sig" }) },
    { submit: async (signed) => { submitted = true; assert.equal(signed.payload.message, "{}"); return { transactionId: "tx-1" }; } },
    payload,
  );
  assert.equal(submitted, true);
  assert.equal(result.transactionId, "tx-1");
  await assert.rejects(() => submitWalletIntent(
    { signNep413: async (p) => ({ standard: "nep413", payload: { ...p, message: "tampered" }, public_key: "ed25519:pub", signature: "ed25519:sig" }) },
    { submit: async () => ({ transactionId: "should-not-submit" }) },
    payload,
  ), /different NEP-413 payload/);
});

const operationInput = {
  operationId: "op-run", positionId: "p-run", kind: "pay_premium" as const,
  requestDigest: "sha256:run",
};
const payload = { recipient: "verifier.testnet", nonce: "nonce-2", message: "{}" };
const wallet = {
  signNep413: async (p: typeof payload) => ({
    standard: "nep413" as const, payload: p, public_key: "ed25519:pub", signature: "ed25519:sig",
  }),
};

test("wallet operation persists submitting before submit and records FINAL success", async () => {
  const store = new MemoryStore();
  const journal = await DurableOperationJournal.open(store);
  let submitted = 0;
  const result = await executeWalletOperation(
    journal, wallet,
    { submit: async () => { submitted++; return { transactionId: "tx-run" }; } },
    { waitForFinalExecution: async () => ({ outcome: "success", transactionId: "tx-run", receiptIds: ["r-1"] }) },
    operationInput, payload, "alice.testnet",
  );
  assert.equal(submitted, 1);
  assert.equal(result.status, "succeeded");
  assert.equal(store.value?.[0]?.status, "succeeded");
});

test("ambiguous submit response is quarantined and never automatically resubmitted", async () => {
  const store = new MemoryStore();
  const journal = await DurableOperationJournal.open(store);
  let submitted = 0;
  const submitter = { submit: async () => { submitted++; throw new Error("connection reset after request"); } };
  const observer = { waitForFinalExecution: async () => ({ outcome: "unknown" as const, transactionId: "none" }) };
  const first = await executeWalletOperation(journal, wallet, submitter, observer,
    operationInput, payload, "alice.testnet");
  assert.equal(first.status, "outcome_unknown");
  const restored = await DurableOperationJournal.open(store);
  const second = await executeWalletOperation(restored, wallet, submitter, observer,
    operationInput, payload, "alice.testnet");
  assert.equal(second.status, "outcome_unknown");
  assert.equal(submitted, 1);
});

test("crash-recovered submitting operation is quarantined without another submit", async () => {
  const store = new MemoryStore();
  const journal = await DurableOperationJournal.open(store);
  await journal.begin(operationInput);
  await journal.markSubmitting(operationInput.operationId);
  const restored = await DurableOperationJournal.open(store);
  let submitted = false;
  const result = await executeWalletOperation(
    restored, wallet, { submit: async () => { submitted = true; return { transactionId: "tx" }; } },
    { waitForFinalExecution: async () => ({ outcome: "unknown", transactionId: "tx" }) },
    operationInput, payload, "alice.testnet",
  );
  assert.equal(result.status, "outcome_unknown");
  assert.equal(submitted, false);
});

test("wallet rejection leaves operation prepared and safe to retry", async () => {
  const store = new MemoryStore();
  const journal = await DurableOperationJournal.open(store);
  const rejectingWallet = { signNep413: async () => { throw new Error("user rejected"); } };
  await assert.rejects(() => executeWalletOperation(
    journal, rejectingWallet, { submit: async () => ({ transactionId: "unused" }) },
    { waitForFinalExecution: async () => ({ outcome: "unknown", transactionId: "unused" }) },
    operationInput, payload, "alice.testnet",
  ), /user rejected/);
  assert.equal(journal.snapshot()[0]?.status, "prepared");
});
