import test from "node:test";
import assert from "node:assert/strict";
import { LifecycleEventCursor, OperationJournal } from "./orchestration.js";

test("operation begin is idempotent and rejects ID collisions", () => {
  const journal = new OperationJournal();
  const input = { operationId: "op-1", positionId: "p-1", kind: "pay_premium" as const,
    requestDigest: "sha256:abc", now: 10 };
  assert.deepEqual(journal.begin(input), journal.begin(input));
  assert.throws(() => journal.begin({ ...input, requestDigest: "sha256:changed" }));
});
test("only definitive failure can be retried with a fresh ID", () => {
  const journal = new OperationJournal();
  journal.begin({ operationId: "op-1", positionId: "p-1", kind: "exercise_payment",
    requestDigest: "sha256:payment", now: 10 });
  journal.markSubmitted("op-1", "tx-1", 11);
  journal.recordDefinitiveFailure("op-1", "tx-1", "TOKEN_TRANSFER_REJECTED", 12);
  const retry = journal.retry("op-1", { operationId: "op-2", positionId: "p-1",
    kind: "exercise_payment", requestDigest: "sha256:payment", now: 13 });
  assert.equal(retry.attempt, 2);
  assert.equal(retry.status, "prepared");
  assert.equal(journal.get("op-1")?.status, "failed_definitive");
});
test("unknown transaction outcome cannot be retried", () => {
  const journal = new OperationJournal();
  journal.begin({ operationId: "op-u", positionId: "p-2", kind: "expiry_release",
    requestDigest: "sha256:expiry" });
  journal.markSubmitted("op-u", "tx-u");
  journal.recordUnknown("op-u");
  assert.throws(() => journal.retry("op-u", { operationId: "op-u2", positionId: "p-2",
    kind: "expiry_release", requestDigest: "sha256:expiry" }), /unknown is not failure/);
});
test("result must correlate to the submitted transaction", () => {
  const journal = new OperationJournal();
  journal.begin({ operationId: "op-3", positionId: "p-3", kind: "register_escrow",
    requestDigest: "sha256:registration" });
  journal.markSubmitted("op-3", "tx-correct");
  assert.throws(() => journal.recordSuccess("op-3", "tx-other"), /does not match/);
  assert.equal(journal.recordSuccess("op-3", "tx-correct").status, "succeeded");
});
test("lifecycle cursor accepts order and deduplicates exact replay", () => {
  const cursor = new LifecycleEventCursor();
  const event = { positionId: "p-1", sequence: 1, digest: "sha256:e1",
    kind: "PremiumPaid", payload: { amount: "5000000" } };
  assert.equal(cursor.accept(event), "accepted");
  assert.equal(cursor.accept(event), "duplicate");
  assert.throws(() => cursor.accept({ ...event, digest: "sha256:forged" }), /conflicting/);
});
test("lifecycle cursor rejects gaps and restores from snapshot", () => {
  const cursor = new LifecycleEventCursor();
  assert.throws(() => cursor.accept({ positionId: "p-2", sequence: 2,
    digest: "sha256:e2", kind: "Settled", payload: null }), /sequence gap/);
  cursor.accept({ positionId: "p-2", sequence: 1, digest: "sha256:e1",
    kind: "CollateralLocked", payload: null });
  const saved = cursor.snapshot();
  const restored = new LifecycleEventCursor(saved.lastSequence, saved.digests);
  assert.equal(restored.accept({ positionId: "p-2", sequence: 2,
    digest: "sha256:e2", kind: "Settled", payload: null }), "accepted");
});
