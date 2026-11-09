/**
 * Deterministic client-side transaction orchestration primitives.
 * No transaction submission, signing, persistence, or external proof is performed here.
 * Host applications must persist snapshots and provide wallet/RPC adapters.
 */
export type WorkflowOperationKind =
  | "register_escrow" | "lock_collateral" | "pay_premium"
  | "exercise_payment" | "exercise_delivery" | "expiry_release";
export type WorkflowOperationStatus =
  | "prepared" | "submitted" | "succeeded" | "failed_definitive" | "outcome_unknown";
export interface WorkflowOperation {
  operationId: string; positionId: string; kind: WorkflowOperationKind;
  requestDigest: string; status: WorkflowOperationStatus; attempt: number;
  transactionId?: string; failureCode?: string; createdAt: number; updatedAt: number;
}
export interface OperationInput {
  operationId: string; positionId: string; kind: WorkflowOperationKind;
  requestDigest: string; now?: number;
}
export class OrchestrationError extends Error {
  constructor(message: string) { super(message); this.name = "OrchestrationError"; }
}
function required(value: string, field: string): void {
  if (!value.trim()) throw new OrchestrationError(field + " must not be empty");
}
const copy = (item: WorkflowOperation): WorkflowOperation => ({ ...item });

/** In-memory journal. Persist snapshot() output to survive reloads/devices. */
export class OperationJournal {
  private readonly items = new Map<string, WorkflowOperation>();
  constructor(initial: readonly WorkflowOperation[] = []) {
    for (const item of initial) {
      this.validate(item);
      if (this.items.has(item.operationId)) throw new OrchestrationError("duplicate operation ID");
      this.items.set(item.operationId, copy(item));
    }
  }
  begin(input: OperationInput): WorkflowOperation {
    required(input.operationId, "operationId");
    required(input.positionId, "positionId");
    required(input.requestDigest, "requestDigest");
    const old = this.items.get(input.operationId);
    if (old) {
      if (old.positionId !== input.positionId || old.kind !== input.kind ||
          old.requestDigest !== input.requestDigest) {
        throw new OrchestrationError("operation ID reused with different request data");
      }
      return copy(old);
    }
    const now = input.now ?? Date.now();
    const item: WorkflowOperation = { ...input, status: "prepared", attempt: 1,
      createdAt: now, updatedAt: now };
    delete (item as Partial<OperationInput>).now;
    this.items.set(item.operationId, item);
    return copy(item);
  }
  markSubmitted(id: string, tx: string, now = Date.now()): WorkflowOperation {
    required(tx, "transactionId");
    const item = this.require(id);
    if (item.status === "submitted" && item.transactionId === tx) return copy(item);
    if (item.status !== "prepared") throw new OrchestrationError("operation is not prepared");
    item.status = "submitted"; item.transactionId = tx; item.updatedAt = now;
    return copy(item);
  }
  recordSuccess(id: string, tx: string, now = Date.now()): WorkflowOperation {
    const item = this.require(id);
    if (item.status === "succeeded" && item.transactionId === tx) return copy(item);
    if (item.status !== "submitted" || item.transactionId !== tx)
      throw new OrchestrationError("success does not match submitted transaction");
    item.status = "succeeded"; item.updatedAt = now;
    return copy(item);
  }
  recordDefinitiveFailure(id: string, tx: string, code: string, now = Date.now()): WorkflowOperation {
    required(code, "failureCode");
    const item = this.require(id);
    if (item.status !== "submitted" || item.transactionId !== tx)
      throw new OrchestrationError("failure does not match submitted transaction");
    item.status = "failed_definitive"; item.failureCode = code; item.updatedAt = now;
    return copy(item);
  }
  recordUnknown(id: string, now = Date.now()): WorkflowOperation {
    const item = this.require(id);
    if (item.status === "outcome_unknown") return copy(item);
    if (item.status !== "submitted") throw new OrchestrationError("only submitted operations can be unknown");
    item.status = "outcome_unknown"; item.updatedAt = now;
    return copy(item);
  }
  retry(previousId: string, next: OperationInput): WorkflowOperation {
    const previous = this.require(previousId);
    if (previous.status !== "failed_definitive")
      throw new OrchestrationError("retry requires definitive failure; unknown is not failure");
    if (next.positionId !== previous.positionId || next.kind !== previous.kind ||
        next.requestDigest !== previous.requestDigest)
      throw new OrchestrationError("retry must preserve position, kind, and request digest");
    const created = this.begin(next);
    if (created.attempt !== 1 || created.operationId === previousId)
      throw new OrchestrationError("retry requires a fresh operation ID");
    const item = this.items.get(created.operationId)!;
    item.attempt = previous.attempt + 1;
    return copy(item);
  }
  get(id: string): WorkflowOperation | undefined {
    const item = this.items.get(id); return item ? copy(item) : undefined;
  }
  snapshot(): WorkflowOperation[] { return [...this.items.values()].map(copy); }
  private require(id: string): WorkflowOperation {
    const item = this.items.get(id);
    if (!item) throw new OrchestrationError("unknown operation ID: " + id);
    return item;
  }
  private validate(item: WorkflowOperation): void {
    required(item.operationId, "operationId"); required(item.positionId, "positionId");
    required(item.requestDigest, "requestDigest");
    if (!Number.isSafeInteger(item.attempt) || item.attempt < 1 ||
        !Number.isFinite(item.createdAt) || !Number.isFinite(item.updatedAt))
      throw new OrchestrationError("invalid operation snapshot");
  }
}
export interface LifecycleEvent<T = unknown> {
  positionId: string; sequence: number; digest: string; kind: string; payload: T;
}
/** Strict ordered consumer: exact replay is idempotent; gaps/conflicts are rejected. */
export class LifecycleEventCursor {
  private last: number;
  private readonly digests = new Map<number, string>();
  constructor(lastSequence = 0, priorDigests: Readonly<Record<number, string>> = {}) {
    if (!Number.isSafeInteger(lastSequence) || lastSequence < 0)
      throw new OrchestrationError("lastSequence must be non-negative");
    this.last = lastSequence;
    for (const [key, digest] of Object.entries(priorDigests)) {
      const sequence = Number(key);
      if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > lastSequence || !digest.trim())
        throw new OrchestrationError("invalid prior lifecycle digest");
      this.digests.set(sequence, digest);
    }
  }
  get currentSequence(): number { return this.last; }
  accept<T>(event: LifecycleEvent<T>): "accepted" | "duplicate" {
    required(event.positionId, "positionId"); required(event.digest, "digest"); required(event.kind, "kind");
    if (!Number.isSafeInteger(event.sequence) || event.sequence < 1)
      throw new OrchestrationError("event sequence must be positive");
    const known = this.digests.get(event.sequence);
    if (event.sequence <= this.last) {
      if (known === event.digest) return "duplicate";
      throw new OrchestrationError("conflicting or unverifiable lifecycle replay");
    }
    if (event.sequence !== this.last + 1)
      throw new OrchestrationError("lifecycle sequence gap: expected " + (this.last + 1));
    this.digests.set(event.sequence, event.digest); this.last = event.sequence;
    return "accepted";
  }
  snapshot(): { lastSequence: number; digests: Record<number, string> } {
    return { lastSequence: this.last, digests: Object.fromEntries(this.digests.entries()) };
  }
}
