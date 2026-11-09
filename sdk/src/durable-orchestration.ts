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
