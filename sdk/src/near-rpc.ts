import type { NearTransactionObserver } from "./durable-orchestration.js";

type RpcStatus = Record<string, unknown> | string;
interface NearTxResponse {
  result?: {
    final_execution_status?: string;
    status?: RpcStatus;
    transaction_outcome?: { outcome?: { receipt_ids?: string[]; status?: RpcStatus } };
    receipts_outcome?: Array<{ id?: string; outcome?: { status?: RpcStatus } }>;
  };
  error?: { cause?: { name?: string }; message?: string };
}

/**
 * Concrete NEAR JSON-RPC observer. Requests FINAL so both execution and
 * downstream receipts (including refunds) are finalized before success/failure
 * is considered definitive. RPC/network errors remain unknown.
 */
export class NearRpcTransactionObserver implements NearTransactionObserver {
  constructor(
    private readonly rpcUrl = "https://rpc.testnet.near.org",
    private readonly fetcher: (input: string | URL, init?: RequestInit) => Promise<Response> = fetch,
  ) {
    const url = new URL(rpcUrl);
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      throw new Error("NEAR RPC endpoint must use HTTPS");
    }
  }

  async waitForFinalExecution(
    transactionId: string,
    signerAccountId: string,
  ): Promise<
    | { outcome: "success"; transactionId: string; receiptIds: string[] }
    | { outcome: "failure"; transactionId: string; failureCode: string }
    | { outcome: "unknown"; transactionId: string }
  > {
    if (!transactionId.trim() || !signerAccountId.trim()) {
      throw new Error("transactionId and signerAccountId are required");
    }
    try {
      const response = await this.fetcher(this.rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: "handel-finality", method: "tx",
          params: { tx_hash: transactionId, sender_account_id: signerAccountId, wait_until: "FINAL" },
        }),
      });
      if (!response.ok) return { outcome: "unknown", transactionId };
      const body = await response.json() as NearTxResponse;
      if (body.error) {
        const cause = body.error.cause?.name ?? "";
        if (cause === "UNKNOWN_TRANSACTION" || cause === "TIMEOUT_ERROR") {
          return { outcome: "unknown", transactionId };
        }
        return { outcome: "unknown", transactionId };
      }
      const result = body.result;
      if (!result || result.final_execution_status !== "FINAL") {
        return { outcome: "unknown", transactionId };
      }
      const status = result.status;
      if (typeof status === "object" && status !== null && "Failure" in status) {
        const failure = status.Failure;
        const code = typeof failure === "string" ? failure : JSON.stringify(failure);
        return { outcome: "failure", transactionId, failureCode: code || "FINAL_EXECUTION_FAILURE" };
      }
      if (typeof status !== "object" || status === null || !("SuccessValue" in status)) {
        return { outcome: "unknown", transactionId };
      }
      const receiptIds = [
        ...(result.transaction_outcome?.outcome?.receipt_ids ?? []),
        ...(result.receipts_outcome ?? []).map((receipt) => receipt.id ?? ""),
      ].filter(Boolean);
      return { outcome: "success", transactionId, receiptIds: [...new Set(receiptIds)] };
    } catch {
      return { outcome: "unknown", transactionId };
    }
  }
}
