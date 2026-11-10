import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { HandelMonitor } from "./observability.js";

describe("HandelMonitor", () => {
  it("counts states and alerts on stuck operations at configured thresholds", () => {
    const monitor = new HandelMonitor({ warningAfterMs: 1_000, criticalAfterMs: 5_000, maxEvents: 2 });
    const snapshot = monitor.observe(
      [{ id: "op-1", status: "outcome_unknown", updatedAt: 1_000 },
       { id: "op-2", status: "succeeded", updatedAt: 1_000 }],
      [{ id: "position-1", state: "ReconciliationRequired", updatedAt: 1_000 }],
      7_000,
    );
    assert.equal(snapshot.operationCounts.outcome_unknown, 1);
    assert.equal(snapshot.positionStateCounts.ReconciliationRequired, 1);
    assert.equal(snapshot.alerts.length, 2);
    assert.equal(snapshot.alerts[0].severity, "critical");
    assert.equal(snapshot.events.length, 2);
  });
  it("bounds and sanitizes audit events", () => {
    const monitor = new HandelMonitor({ warningAfterMs: 0, criticalAfterMs: 10, maxEvents: 1 });
    const result = monitor.observe([{ id: "op secret/key", status: "submitted", updatedAt: 1 }], [], 20);
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0].subjectId, "opsecretkey");
    assert.equal(monitor.listEvents().length, 1);
  });
  it("rejects unsafe policy and invalid timestamps", () => {
    assert.throws(() => new HandelMonitor({ warningAfterMs: 5, criticalAfterMs: 1, maxEvents: 1 }));
    const monitor = new HandelMonitor({ warningAfterMs: 0, criticalAfterMs: 1, maxEvents: 2 });
    assert.equal(monitor.observe([{ id: "x", status: "submitting", updatedAt: 99 }], [], 10).alerts[0].code,
      "invalid_observation_time");
  });
});
