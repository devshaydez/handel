import type { JsonSnapshotStore } from "./durable-orchestration.js";
import {
  EvidenceReplayGuard,
  verifySettlementReceipt,
  type ReceiptInspector,
  type SettlementEvidence,
  type SettlementExpectation,
} from "./settlement-verifier.js";

export interface SettlementEvidenceSnapshot {
  schemaVersion: 1;
  evidence: SettlementEvidence[];
  replayKeys: string[];
}

/**
 * Durable, serialized evidence acceptance. The inspector must independently
 * inspect the chain; this service atomically persists accepted evidence and
 * replay keys through the host's snapshot store.
 *
 * Use a single service writer per snapshot. A file store is single-process;
 * multi-instance deployments must supply a transactional database adapter.
 */
export class DurableSettlementEvidenceService {
  private recordsByKey = new Map<string, SettlementEvidence>();
  private replayGuard = new EvidenceReplayGuard();
  private tail: Promise<void> = Promise.resolve();

  private constructor(
    private readonly store: JsonSnapshotStore<SettlementEvidenceSnapshot>,
    private readonly inspector: ReceiptInspector,
    snapshot: SettlementEvidenceSnapshot,
  ) {
    this.recordsByKey = new Map(snapshot.evidence.map((item) => [
      [item.transactionHash, item.receiptId, item.eventIndex].join(":"),
      item,
    ]));
    this.replayGuard = new EvidenceReplayGuard(snapshot.replayKeys);
  }

  static async open(
    store: JsonSnapshotStore<SettlementEvidenceSnapshot>,
    inspector: ReceiptInspector,
  ): Promise<DurableSettlementEvidenceService> {
    const loaded = await store.load();
    const snapshot = loaded ?? { schemaVersion: 1 as const, evidence: [], replayKeys: [] };
    if (snapshot.schemaVersion !== 1 || !Array.isArray(snapshot.evidence) ||
        !Array.isArray(snapshot.replayKeys)) {
      throw new Error("Unsupported or malformed settlement evidence snapshot");
    }
    const guard = new EvidenceReplayGuard(snapshot.replayKeys);
    if (guard.snapshot().length !== snapshot.evidence.length) {
      throw new Error("Settlement evidence and replay-key snapshot are inconsistent");
    }
    for (const item of snapshot.evidence) {
      const key = [item.transactionHash, item.receiptId, item.eventIndex].join(":");
      if (!snapshot.replayKeys.includes(key)) {
        throw new Error("Settlement evidence is missing its replay key");
      }
    }
    return new DurableSettlementEvidenceService(store, inspector, snapshot);
  }

  async verifyAndRecord(
    expectation: SettlementExpectation,
    transactionHash: string,
    receiptId: string,
    now?: number,
  ): Promise<SettlementEvidence> {
    const evidence = await verifySettlementReceipt(
      this.inspector, expectation, transactionHash, receiptId, now,
    );
    let release!: () => void;
    const previous = this.tail;
    this.tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      const key = [evidence.transactionHash, evidence.receiptId, evidence.eventIndex].join(":");
      const nextGuard = new EvidenceReplayGuard(this.replayGuard.snapshot());
      nextGuard.accept(evidence);
      const nextRecords = new Map(this.recordsByKey);
      nextRecords.set(key, evidence);
      const snapshot: SettlementEvidenceSnapshot = {
        schemaVersion: 1,
        evidence: [...nextRecords.values()],
        replayKeys: nextGuard.snapshot(),
      };
      await this.store.save(snapshot);
      this.recordsByKey = nextRecords;
      this.replayGuard = nextGuard;
      return evidence;
    } finally {
      release();
    }
  }

  list(): SettlementEvidence[] {
    return [...this.recordsByKey.values()].map((item) => ({
      ...item,
      expectation: { ...item.expectation },
    }));
  }
}
