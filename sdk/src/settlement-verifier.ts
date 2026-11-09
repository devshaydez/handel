/**
 * Settlement evidence validation boundary.
 *
 * ReceiptInspector must independently fetch and decode NEAR verifier receipts.
 * This module validates the normalized evidence and replay bindings; it does
 * not itself implement an RPC client, light client, or cryptographic proof.
 */
export interface SettlementExpectation {
  operationId: string;
  positionId: string;
  operationKind: string;
  assetId: string;
  amount: string;
  sender: string;
  receiver: string;
}

export interface NormalizedVerifierEvent {
  standard: "handel.settlement.v1";
  operationId: string;
  positionId: string;
  operationKind: string;
  assetId: string;
  amount: string;
  sender: string;
  receiver: string;
  transactionHash: string;
  receiptId: string;
  eventIndex: number;
}

export interface ReceiptInspection {
  transactionHash: string;
  receiptId: string;
  blockHeight: number;
  blockHash: string;
  executionStatus: "success" | "failure" | "unknown";
  finalized: boolean;
  canonical: boolean;
  events: NormalizedVerifierEvent[];
}

export interface ReceiptInspector {
  inspect(transactionHash: string, receiptId: string): Promise<ReceiptInspection>;
}

export interface SettlementEvidence {
  expectation: SettlementExpectation;
  transactionHash: string;
  receiptId: string;
  blockHeight: number;
  blockHash: string;
  eventIndex: number;
  finalized: true;
  verifiedAt: number;
}

export class SettlementVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettlementVerificationError";
  }
}

function nonEmpty(value: string, field: string): void {
  if (!value.trim()) throw new SettlementVerificationError(field + " must not be empty");
}

function positiveInteger(value: string, field: string): void {
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new SettlementVerificationError(field + " must be a positive integer string");
  }
}

export async function verifySettlementReceipt(
  inspector: ReceiptInspector,
  expectation: SettlementExpectation,
  transactionHash: string,
  receiptId: string,
  now = Date.now(),
): Promise<SettlementEvidence> {
  for (const [field, value] of Object.entries(expectation)) {
    if (typeof value !== "string") throw new SettlementVerificationError(field + " must be a string");
    nonEmpty(value, field);
  }
  positiveInteger(expectation.amount, "amount");
  nonEmpty(transactionHash, "transactionHash");
  nonEmpty(receiptId, "receiptId");
  const receipt = await inspector.inspect(transactionHash, receiptId);
  if (receipt.transactionHash !== transactionHash || receipt.receiptId !== receiptId) {
    throw new SettlementVerificationError("inspected receipt does not match requested transaction and receipt");
  }
  if (receipt.executionStatus !== "success") {
    throw new SettlementVerificationError("verifier receipt did not execute successfully");
  }
  if (!receipt.finalized || !receipt.canonical) {
    throw new SettlementVerificationError("receipt is not finalized on the canonical chain");
  }
  if (!Number.isSafeInteger(receipt.blockHeight) || receipt.blockHeight < 1 ||
      !receipt.blockHash.trim()) {
    throw new SettlementVerificationError("receipt block identity is invalid");
  }
  const event = receipt.events.find((candidate) =>
    candidate.standard === "handel.settlement.v1" &&
    candidate.transactionHash === transactionHash &&
    candidate.receiptId === receiptId &&
    candidate.operationId === expectation.operationId &&
    candidate.positionId === expectation.positionId &&
    candidate.operationKind === expectation.operationKind &&
    candidate.assetId === expectation.assetId &&
    candidate.amount === expectation.amount &&
    candidate.sender === expectation.sender &&
    candidate.receiver === expectation.receiver
  );
  if (!event) {
    throw new SettlementVerificationError("no verifier event matches the full expected settlement binding");
  }
  if (!Number.isSafeInteger(event.eventIndex) || event.eventIndex < 0) {
    throw new SettlementVerificationError("event index is invalid");
  }
  return {
    expectation: { ...expectation },
    transactionHash,
    receiptId,
    blockHeight: receipt.blockHeight,
    blockHash: receipt.blockHash,
    eventIndex: event.eventIndex,
    finalized: true,
    verifiedAt: now,
  };
}

/** Persist this set alongside your evidence store to reject event replay. */
export class EvidenceReplayGuard {
  private readonly seen = new Set<string>();
  constructor(snapshot: readonly string[] = []) {
    for (const key of snapshot) {
      nonEmpty(key, "replay key");
      if (this.seen.has(key)) throw new SettlementVerificationError("duplicate replay key in snapshot");
      this.seen.add(key);
    }
  }
  accept(evidence: Pick<SettlementEvidence, "transactionHash" | "receiptId" | "eventIndex">): void {
    const key = [evidence.transactionHash, evidence.receiptId, evidence.eventIndex].join(":");
    if (this.seen.has(key)) throw new SettlementVerificationError("settlement evidence replay detected");
    this.seen.add(key);
  }
  snapshot(): string[] { return [...this.seen].sort(); }
}
