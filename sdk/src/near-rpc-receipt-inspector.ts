import {
  SettlementVerificationError,
  type NormalizedVerifierEvent,
  type ReceiptInspection,
  type ReceiptInspector,
} from "./settlement-verifier.js";

type RpcStatus = Record<string, unknown> | string;
interface RpcReceiptOutcome {
  id?: string;
  block_hash?: string;
  block_height?: number;
  outcome?: {
    executor_id?: string;
    status?: RpcStatus;
    logs?: string[];
  };
}
interface RpcTransactionResult {
  final_execution_status?: string;
  transaction?: { hash?: string; signer_id?: string };
  status?: RpcStatus;
  receipts_outcome?: RpcReceiptOutcome[];
}
interface RpcResponse {
  result?: RpcTransactionResult;
  error?: { message?: string; cause?: { name?: string } };
}

export interface NearRpcReceiptInspectorOptions {
  /** Account ID that actually executed the settlement receipt. */
  verifierAccountId: string;
  /** Signer account ID required by the NEAR tx-status JSON-RPC method. */
  transactionSignerAccountId: string;
  rpcUrl: string;
  fetcher?: (input: string | URL, init?: RequestInit) => Promise<Response>;
}

function statusOf(status: RpcStatus | undefined): "success" | "failure" | "unknown" {
  if (typeof status !== "object" || status === null) return "unknown";
  if ("SuccessValue" in status) return "success";
  if ("Failure" in status) return "failure";
  return "unknown";
}

/**
 * Independently inspects a finalized NEAR transaction through JSON-RPC and
 * decodes the configured verifier receipt's EVENT_JSON logs.
 *
 * The verifier must emit:
 *   EVENT_JSON:{"standard":"handel.settlement.v1","data":[{...settlement fields...}]}
 *
 * A single RPC endpoint remains an infrastructure trust assumption. Use an
 * independently operated endpoint/quorum for production. The adapter fails
 * closed when the receipt, verifier executor, finality, or event binding is absent.
 */
export class NearRpcReceiptInspector implements ReceiptInspector {
  private readonly verifierAccountId: string;
  private readonly transactionSignerAccountId: string;
  readonly endpointId: string;
  private readonly rpcUrl: string;
  private readonly fetcher: (input: string | URL, init?: RequestInit) => Promise<Response>;

  constructor(options: NearRpcReceiptInspectorOptions) {
    this.verifierAccountId = options.verifierAccountId;
    this.transactionSignerAccountId = options.transactionSignerAccountId;
    this.rpcUrl = options.rpcUrl;
    this.endpointId = new URL(this.rpcUrl).origin;
    this.fetcher = options.fetcher ?? fetch;
    if (!this.verifierAccountId.trim() || !this.transactionSignerAccountId.trim()) {
      throw new Error("verifierAccountId and transactionSignerAccountId are required");
    }
    const url = new URL(this.rpcUrl);
    if (url.protocol !== "https:" &&
        !(url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1"))) {
      throw new Error("NEAR RPC endpoint must use HTTPS");
    }
  }

  async inspect(transactionHash: string, receiptId: string): Promise<ReceiptInspection> {
    if (!transactionHash.trim() || !receiptId.trim()) {
      throw new SettlementVerificationError("transactionHash and receiptId are required");
    }
    let response: Response;
    try {
      response = await this.fetcher(this.rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "handel-receipt-inspection",
          method: "tx",
          params: {
            tx_hash: transactionHash,
            sender_account_id: this.transactionSignerAccountId,
            wait_until: "FINAL",
          },
        }),
      });
    } catch {
      throw new SettlementVerificationError("NEAR RPC request failed; receipt outcome is unknown");
    }
    if (!response.ok) {
      throw new SettlementVerificationError("NEAR RPC returned HTTP " + response.status);
    }

    let body: RpcResponse;
    try {
      body = await response.json() as RpcResponse;
    } catch {
      throw new SettlementVerificationError("NEAR RPC returned invalid JSON");
    }
    if (body.error || !body.result) {
      throw new SettlementVerificationError(
        "NEAR RPC could not inspect transaction: " + (body.error?.message ?? "missing result"),
      );
    }
    const result = body.result;
    if (!result.transaction || result.transaction.hash !== transactionHash ||
        result.transaction.signer_id !== this.transactionSignerAccountId) {
      throw new SettlementVerificationError("NEAR RPC transaction hash or signer does not match the requested transaction");
    }
    const finalized = result.final_execution_status === "FINAL";
    const receiptMatches = (result.receipts_outcome ?? []).filter((item) => item.id === receiptId);
    if (receiptMatches.length !== 1) {
      throw new SettlementVerificationError(
        receiptMatches.length === 0
          ? "requested verifier receipt is absent from transaction"
          : "NEAR RPC returned duplicate receipt outcomes",
      );
    }
    const receipt = receiptMatches[0]!;
    const outcome = receipt.outcome;
    if (!outcome || outcome.executor_id !== this.verifierAccountId) {
      throw new SettlementVerificationError("receipt was not executed by the configured verifier");
    }
    const executionStatus = statusOf(outcome.status);
    const blockHeight = receipt.block_height;
    const blockHash = receipt.block_hash;
    if (typeof blockHeight !== "number" || !Number.isSafeInteger(blockHeight) || blockHeight < 1 ||
        typeof blockHash !== "string" || !blockHash.trim()) {
      throw new SettlementVerificationError("receipt block identity is invalid");
    }

    const events: NormalizedVerifierEvent[] = [];
    let eventIndex = 0;
    for (const log of outcome.logs ?? []) {
      if (!log.startsWith("EVENT_JSON:")) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(log.slice("EVENT_JSON:".length));
      } catch {
        throw new SettlementVerificationError("verifier emitted malformed EVENT_JSON log");
      }
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) continue;
      const envelope = parsed as Record<string, unknown>;
      if (envelope.standard !== "handel.settlement.v1") continue;
      const rawData = envelope.data;
      const records = Array.isArray(rawData) ? rawData :
        (typeof rawData === "object" && rawData !== null ? [rawData] : null);
      if (!records || records.length === 0) {
        throw new SettlementVerificationError("verifier settlement event has invalid data");
      }
      for (const rawRecord of records) {
        if (typeof rawRecord !== "object" || rawRecord === null || Array.isArray(rawRecord)) {
          throw new SettlementVerificationError("verifier settlement event contains invalid data");
        }
        const record = rawRecord as Record<string, unknown>;
        const fields = [
          "operationId", "positionId", "operationKind", "assetId",
          "amount", "sender", "receiver",
        ] as const;
        if (!fields.every((field) => typeof record[field] === "string")) {
          throw new SettlementVerificationError("verifier settlement event is missing required string fields");
        }
        events.push({
          standard: "handel.settlement.v1",
          operationId: record.operationId as string,
          positionId: record.positionId as string,
          operationKind: record.operationKind as string,
          assetId: record.assetId as string,
          amount: record.amount as string,
          sender: record.sender as string,
          receiver: record.receiver as string,
          transactionHash,
          receiptId,
          eventIndex,
        });
        eventIndex += 1;
      }
    }

    return {
      transactionHash,
      receiptId,
      blockHeight,
      blockHash,
      executionStatus,
      finalized,
      canonical: finalized,
      events,
    };
  }
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  const object = value as Record<string, unknown>;
  return "{" + Object.keys(object).sort().map(key => JSON.stringify(key) + ":" + canonical(object[key])).join(",") + "}";
}

/**
 * Strict multi-provider RPC agreement. Every configured endpoint must return
 * the same finalized transaction/receipt/event view. This reduces dependence
 * on one RPC operator but is not a cryptographic light client or remote-chain proof.
 */
export class QuorumNearRpcReceiptInspector implements ReceiptInspector {
  constructor(private readonly inspectors: readonly NearRpcReceiptInspector[]) {
    if (inspectors.length < 2) {
      throw new Error("at least two independently operated NEAR RPC inspectors are required");
    }
    const endpoints = inspectors.map(inspector => inspector.endpointId);
    if (new Set(endpoints).size !== endpoints.length) {
      throw new Error("RPC quorum requires distinct endpoint origins");
    }
  }

  async inspect(transactionHash: string, receiptId: string): Promise<ReceiptInspection> {
    const results = await Promise.all(this.inspectors.map(inspector => inspector.inspect(transactionHash, receiptId)));
    const reference = canonical(results[0]);
    if (results.some(result => canonical(result) !== reference)) {
      throw new SettlementVerificationError("independent NEAR RPC endpoints disagree on transaction or receipt evidence");
    }
    return results[0]!;
  }
}
