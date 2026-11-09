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

function statusOf(status: RpcStatus | undefined): "success" | "failure" | "unknown" {
  if (typeof status !== "object" || status === null) return "unknown";
  if ("SuccessValue" in status) return "success";
  if ("Failure" in status) return "failure";
  return "unknown";
}

function asEventRecords(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter(
    (item): item is Record<string, unknown> =>
      typeof item === "object" && item !== null && !Array.isArray(item),
  );
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return [value as Record<string, unknown>];
  }
  return [];
}

/**
 * Independently inspects a finalized NEAR transaction through JSON-RPC and
 * decodes the configured verifier receipt's NEP-297-style EVENT_JSON logs.
 *
 * The verifier must emit:
 *   EVENT_JSON:{"standard":"handel.settlement.v1","data":[{...settlement fields...}]}
 *
 * A single RPC endpoint remains an infrastructure trust assumption. Use an
 * independently operated endpoint/quorum for production. The adapter fails
 * closed when the receipt, verifier executor, finality, or event binding is absent.
 */
export class NearRpcReceiptInspector implements ReceiptInspector {
  constructor(
    private readonly verifierAccountId: string,
    private readonly rpcUrl = "https://rpc.testnet.near.org",
    private readonly fetcher: (input: string | URL, init?: RequestInit) => Promise<Response> = fetch,
  ) {
    if (!verifierAccountId.trim()) throw new Error("verifierAccountId is required");
    const url = new URL(rpcUrl);
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
            sender_account_id: this.verifierAccountId,
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
    if (result.transaction?.hash && result.transaction.hash !== transactionHash) {
      throw new SettlementVerificationError("NEAR RPC returned a different transaction");
    }
    const finalized = result.final_execution_status === "FINAL";
    const receiptMatches = (result.receipts_outcome ?? []).filter((item) => item.id === receiptId);
    if (receiptMatches.length !== 1) {
      throw new SettlementVerificationError(
        receiptMatches.length === 0
          ? "requested verifier receipt is absent from finalized transaction"
          : "NEAR RPC returned duplicate receipt outcomes",
      );
    }
    const receipt = receiptMatches[0]!;
    const outcome = receipt.outcome;
    if (outcome?.executor_id !== this.verifierAccountId) {
      throw new SettlementVerificationError("receipt was not executed by the configured verifier");
    }
    const executionStatus = statusOf(outcome.status);
    const blockHeight = receipt.block_height;
    const blockHash = receipt.block_hash;
    if (!Number.isSafeInteger(blockHeight) || (blockHeight ?? 0) < 1 ||
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
      for (const record of asEventRecords(envelope.data)) {
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
