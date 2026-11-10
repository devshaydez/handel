/**
 * Durable operation journal adapter and wallet/RPC boundaries.
 * Persistence is supplied by the host; signing remains inside the user's wallet.
 */
import type { Nep413Payload, SignedNep413 } from "./types.js";
import {
  OperationJournal,
  type OperationInput,
  type WorkflowOperation,
} from "./orchestration.js";
import type {
  SettlementEvidence,
  SettlementExpectation,
} from "./settlement-verifier.js";

export interface JsonSnapshotStore<T> {
  load(): Promise<T | null>;
  save(value: T): Promise<void>;
}

export class DurableOperationJournal {
  private journal: OperationJournal;
  private tail: Promise<void> = Promise.resolve();

  private constructor(private readonly store: JsonSnapshotStore<WorkflowOperation[]>,
    initial: WorkflowOperation[]) {
    this.journal = new OperationJournal(initial);
  }

  static async open(store: JsonSnapshotStore<WorkflowOperation[]>): Promise<DurableOperationJournal> {
    return new DurableOperationJournal(store, (await store.load()) ?? []);
  }

  private async mutate<T>(operation: () => T): Promise<T> {
    let release!: () => void;
    const previous = this.tail;
    this.tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    const before = this.journal.snapshot();
    try {
      const result = operation();
      await this.store.save(this.journal.snapshot());
      return result;
    } catch (error) {
      this.journal = new OperationJournal(before);
      throw error;
    } finally {
      release();
    }
  }

  begin(input: OperationInput): Promise<WorkflowOperation> {
    return this.mutate(() => this.journal.begin(input));
  }
  markSubmitting(id: string, now?: number): Promise<WorkflowOperation> {
    return this.mutate(() => this.journal.markSubmitting(id, now));
  }
  recordSubmissionUnknown(id: string, now?: number): Promise<WorkflowOperation> {
    return this.mutate(() => this.journal.recordSubmissionUnknown(id, now));
  }
  markSubmitted(id: string, transactionId: string, now?: number): Promise<WorkflowOperation> {
    return this.mutate(() => this.journal.markSubmitted(id, transactionId, now));
  }
  recordSuccess(id: string, transactionId: string, now?: number): Promise<WorkflowOperation> {
    return this.mutate(() => this.journal.recordSuccess(id, transactionId, now));
  }
  recordDefinitiveFailure(id: string, transactionId: string, code: string, now?: number): Promise<WorkflowOperation> {
    return this.mutate(() => this.journal.recordDefinitiveFailure(id, transactionId, code, now));
  }
  recordUnknown(id: string, now?: number): Promise<WorkflowOperation> {
    return this.mutate(() => this.journal.recordUnknown(id, now));
  }
  retry(previousId: string, next: OperationInput): Promise<WorkflowOperation> {
    return this.mutate(() => this.journal.retry(previousId, next));
  }
  snapshot(): WorkflowOperation[] { return this.journal.snapshot(); }
}

/** Adapter contract: wallet signs; Handel never receives or stores private keys. */
export interface Nep413Wallet {
  signNep413(payload: Nep413Payload): Promise<SignedNep413>;
}

/** Adapter contract for a NEAR RPC / indexer implementation supplied by the host. */
export interface NearTransactionObserver {
  waitForFinalExecution(transactionId: string, signerAccountId: string): Promise<
    | { outcome: "success"; transactionId: string; receiptIds: string[] }
    | { outcome: "failure"; transactionId: string; failureCode: string }
    | { outcome: "unknown"; transactionId: string }
  >;
}

export interface IntentSubmitter {
  submit(signedIntent: SignedNep413): Promise<{ transactionId: string }>;
}

export interface SettlementEvidenceRecorder {
  list(): SettlementEvidence[];
  verifyAndRecord(
    expectation: SettlementExpectation,
    transactionHash: string,
    receiptId: string,
  ): Promise<SettlementEvidence>;
}

export interface RequiredSettlementVerification {
  expectation: SettlementExpectation;
  evidence: SettlementEvidenceRecorder;
}

function sameExpectation(a: SettlementExpectation, b: SettlementExpectation): boolean {
  return a.operationId === b.operationId &&
    a.positionId === b.positionId &&
    a.operationKind === b.operationKind &&
    a.assetId === b.assetId &&
    a.amount === b.amount &&
    a.sender === b.sender &&
    a.receiver === b.receiver;
}

/**
 * Submit a NEP-413 payload through the connected wallet and transport.
 * This does not interpret API acceptance as settlement; observe the resulting
 * NEAR transaction and independently inspect the verifier's state change.
 */
export async function submitWalletIntent(
  wallet: Nep413Wallet,
  submitter: IntentSubmitter,
  payload: Nep413Payload,
): Promise<{ transactionId: string }> {
  const signed = await wallet.signNep413(payload);
  if (signed.standard !== "nep413" || !signed.payload ||
      signed.payload.recipient !== payload.recipient ||
      signed.payload.message !== payload.message ||
      signed.payload.nonce !== payload.nonce ||
      !signed.public_key || !signed.signature) {
    throw new Error("Wallet returned a signature for a different NEP-413 payload");
  }
  return submitter.submit(signed);
}

/**
 * Crash-safe wallet submission flow. A durable "submitting" marker is written
 * before network submission. If the process crashes or the submit call times
 * out before returning a transaction hash, the operation is quarantined as
 * unknown and is never automatically submitted again.
 *
 * When settlementVerification is supplied, a FINAL transaction alone is not
 * sufficient for success: at least one receipt must contain the exact expected
 * verifier event and that evidence must be durably accepted first.
 */
export async function executeWalletOperation(
  journal: DurableOperationJournal,
  wallet: Nep413Wallet,
  submitter: IntentSubmitter,
  observer: NearTransactionObserver,
  input: OperationInput,
  payload: Nep413Payload,
  signerAccountId: string,
  settlementVerification?: RequiredSettlementVerification,
): Promise<WorkflowOperation> {
  let operation = await journal.begin(input);
  if (operation.status === "succeeded" || operation.status === "failed_definitive" ||
      operation.status === "outcome_unknown") return operation;
  if (operation.status === "submitting") {
    return journal.recordSubmissionUnknown(input.operationId);
  }
  if (operation.status === "prepared") {
    const signed = await wallet.signNep413(payload);
    if (signed.standard !== "nep413" || !signed.payload ||
        signed.payload.recipient !== payload.recipient ||
        signed.payload.message !== payload.message ||
        signed.payload.nonce !== payload.nonce ||
        !signed.public_key || !signed.signature) {
      throw new Error("Wallet returned a signature for a different NEP-413 payload");
    }
    await journal.markSubmitting(input.operationId);
    let submitted: { transactionId: string };
    try {
      submitted = await submitter.submit(signed);
      if (!submitted.transactionId?.trim()) throw new Error("submitter returned an empty transaction ID");
    } catch {
      return journal.recordSubmissionUnknown(input.operationId);
    }
    operation = await journal.markSubmitted(input.operationId, submitted.transactionId);
  }
  if (operation.status !== "submitted" || !operation.transactionId) return operation;
  let outcome: Awaited<ReturnType<NearTransactionObserver["waitForFinalExecution"]>>;
  try {
    outcome = await observer.waitForFinalExecution(operation.transactionId, signerAccountId);
  } catch {
    outcome = { outcome: "unknown", transactionId: operation.transactionId };
  }
  if (outcome.outcome === "success" && outcome.transactionId === operation.transactionId) {
    if (settlementVerification) {
      // Recover the narrow crash window where evidence persisted but the journal
      // success transition did not. This makes evidence acceptance idempotent
      // across a process restart without weakening replay protection.
      const prior = settlementVerification.evidence.list().find((item) =>
        item.transactionHash === operation.transactionId &&
        sameExpectation(item.expectation, settlementVerification.expectation)
      );
      if (prior) return journal.recordSuccess(input.operationId, operation.transactionId);

      for (const receiptId of [...new Set(outcome.receiptIds)].filter(Boolean)) {
        try {
          await settlementVerification.evidence.verifyAndRecord(
            settlementVerification.expectation,
            operation.transactionId,
            receiptId,
          );
          return journal.recordSuccess(input.operationId, operation.transactionId);
        } catch {
          // A transaction can contain many receipts; inspect each until the
          // configured verifier event is found. No match means outcome unknown.
        }
      }
      return journal.recordUnknown(input.operationId);
    }
    return journal.recordSuccess(input.operationId, operation.transactionId);
  }
  if (outcome.outcome === "failure" && outcome.transactionId === operation.transactionId) {
    return journal.recordDefinitiveFailure(input.operationId, operation.transactionId, outcome.failureCode);
  }
  return journal.recordUnknown(input.operationId);
}
