/**
 * Tidepool 1Click-compatible adapter for NEAR Testnet integration tests.
 *
 * Tidepool is community-operated and custodial at its deposit-address layer.
 * This adapter never signs, submits wallet transactions, or treats API status
 * as cryptographic proof. Only use valueless testnet assets.
 */
import { isOndoUnderlying } from "./assets.js";

export const TIDEPOOL_BASE_URL = "https://www.usetidepool.tech";

export interface TidepoolToken {
  assetId: string;
  symbol: string;
  decimals: number;
  blockchain: string;
  contractAddress?: string;
  price?: number;
}

export interface TidepoolQuoteRequest {
  originAsset: string;
  destinationAsset: string;
  amount: string;
  refundTo: string;
  recipient: string;
  deadline: string;
  swapType?: "EXACT_INPUT" | "EXACT_OUTPUT" | "FLEX_INPUT" | "ANY_INPUT";
  slippageTolerance?: number;
  depositType?: "ORIGIN_CHAIN" | "INTENTS";
  refundType?: "ORIGIN_CHAIN" | "INTENTS";
  recipientType?: "DESTINATION_CHAIN" | "INTENTS";
  dry?: boolean;
  /** Must be true to create a live testnet deposit address (dry=false). */
  allowTestnetDepositAddress?: boolean;
}

export interface TidepoolQuote {
  correlationId: string;
  timestamp: string;
  signature?: string;
  quoteRequest?: Record<string, unknown>;
  quote: {
    amountIn?: string;
    amountOut?: string;
    minAmountIn?: string;
    minAmountOut?: string;
    depositAddress?: string;
    [key: string]: unknown;
  };
}

export interface TidepoolStatus {
  status: string;
  depositAddress?: string;
  swapDetails?: {
    amountIn?: string;
    amountOut?: string;
    nearTxHashes?: string[];
    intentHashes?: string[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export type ProviderSettlementAssessment =
  | { outcome: "provider_reported_success"; status: "SUCCESS"; transactionHashes: string[]; warning: string }
  | { outcome: "pending_or_unverified"; status: string; transactionHashes: string[]; warning: string }
  | { outcome: "provider_reported_failure"; status: "FAILED" | "REFUNDED"; transactionHashes: string[]; warning: string };

export class TidepoolError extends Error {
  constructor(message: string, readonly statusCode?: number) {
    super(message);
    this.name = "TidepoolError";
  }
}

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

function nonEmpty(value: string, field: string): void {
  if (!value.trim()) throw new TidepoolError(field + " must not be empty");
}

function positiveIntegerString(value: string, field: string): void {
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new TidepoolError(field + " must be a positive base-unit integer string");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class TidepoolClient {
  private readonly baseUrl: string;
  constructor(
    baseUrl = TIDEPOOL_BASE_URL,
    private readonly fetcher: FetchLike = fetch
  ) {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
      throw new TidepoolError("Tidepool endpoint must use HTTPS");
    }
    this.baseUrl = parsed.toString().replace(/\/$/, "");
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await this.fetcher(this.baseUrl + path, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
    const raw = await response.text();
    let body: unknown;
    try { body = raw ? JSON.parse(raw) : {}; }
    catch { throw new TidepoolError("Tidepool returned invalid JSON", response.status); }
    if (!response.ok) {
      const message = isRecord(body) && typeof body.message === "string" ? body.message : "Tidepool request failed";
      throw new TidepoolError(message, response.status);
    }
    return body as T;
  }

  async health(): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>("/v0/health");
  }

  async listTokens(): Promise<TidepoolToken[]> {
    const body = await this.request<unknown>("/v0/tokens");
    const values = Array.isArray(body) ? body : isRecord(body) && Array.isArray(body.tokens) ? body.tokens : null;
    if (!values) throw new TidepoolError("Tidepool token response has an unexpected shape");
    return values.map((item): TidepoolToken => {
      if (!isRecord(item) || typeof item.assetId !== "string" ||
          typeof item.symbol !== "string" || !Number.isInteger(item.decimals) ||
          typeof item.blockchain !== "string") {
        throw new TidepoolError("Tidepool token entry is malformed");
      }
      return {
        assetId: item.assetId, symbol: item.symbol, decimals: item.decimals as number,
        blockchain: item.blockchain,
        ...(typeof item.contractAddress === "string" ? { contractAddress: item.contractAddress } : {}),
        ...(typeof item.price === "number" ? { price: item.price } : {}),
      };
    });
  }

  private async assertTestAssets(...assetIds: string[]): Promise<void> {
    const tokens = await this.listTokens();
    const supported = new Set(tokens.map((token) => token.assetId));
    for (const assetId of assetIds) {
      nonEmpty(assetId, "assetId");
      if (isOndoUnderlying(assetId)) {
        throw new TidepoolError("Tidepool does not establish support for Handel Ondo assets");
      }
      if (!supported.has(assetId)) {
        throw new TidepoolError("Asset is not present in Tidepool's live testnet token registry: " + assetId);
      }
    }
  }

  async quote(request: TidepoolQuoteRequest): Promise<TidepoolQuote> {
    nonEmpty(request.refundTo, "refundTo");
    nonEmpty(request.recipient, "recipient");
    nonEmpty(request.deadline, "deadline");
    positiveIntegerString(request.amount, "amount");
    if (!Number.isFinite(Date.parse(request.deadline)) || Date.parse(request.deadline) <= Date.now()) {
      throw new TidepoolError("deadline must be a valid future timestamp");
    }
    if (request.slippageTolerance !== undefined &&
        (!Number.isInteger(request.slippageTolerance) || request.slippageTolerance < 0 || request.slippageTolerance > 10_000)) {
      throw new TidepoolError("slippageTolerance must be integer basis points from 0 to 10000");
    }
    const dry = request.dry ?? true;
    if (!dry && request.allowTestnetDepositAddress !== true) {
      throw new TidepoolError("Creating a deposit address requires allowTestnetDepositAddress=true");
    }
    await this.assertTestAssets(request.originAsset, request.destinationAsset);
    const {
      allowTestnetDepositAddress: _explicitConsent,
      dry: _requestedDry,
      ...body
    } = request;
    return this.request<TidepoolQuote>("/v0/quote", {
      method: "POST",
      body: JSON.stringify({
        ...body,
        dry,
        swapType: request.swapType ?? "EXACT_INPUT",
        slippageTolerance: request.slippageTolerance ?? 100,
        depositType: request.depositType ?? "INTENTS",
        refundType: request.refundType ?? "INTENTS",
        recipientType: request.recipientType ?? "INTENTS",
      }),
    });
  }

  async status(depositAddress: string): Promise<TidepoolStatus> {
    nonEmpty(depositAddress, "depositAddress");
    return this.request<TidepoolStatus>("/v0/status?depositAddress=" + encodeURIComponent(depositAddress));
  }

  async submitDeposit(txHash: string, depositAddress: string): Promise<Record<string, unknown>> {
    nonEmpty(txHash, "txHash");
    nonEmpty(depositAddress, "depositAddress");
    return this.request<Record<string, unknown>>("/v0/deposit/submit", {
      method: "POST",
      body: JSON.stringify({ txHash, depositAddress }),
    });
  }
}

/**
 * Classifies the API's status without upgrading it to cryptographic proof.
 * SUCCESS is only a provider-reported outcome; independently inspect verifier
 * receipts and finality before recording contract settlement.
 */
export function assessTidepoolStatus(status: TidepoolStatus): ProviderSettlementAssessment {
  const hashes = [
    ...(status.swapDetails?.nearTxHashes ?? []),
    ...(status.swapDetails?.intentHashes ?? []),
  ].filter((hash): hash is string => typeof hash === "string" && hash.length > 0);
  if (status.status === "SUCCESS") {
    return {
      outcome: "provider_reported_success", status: "SUCCESS", transactionHashes: hashes,
      warning: "Tidepool-reported success is not independent proof; inspect verifier receipts and finality.",
    };
  }
  if (status.status === "FAILED" || status.status === "REFUNDED") {
    return { outcome: "provider_reported_failure", status: status.status, transactionHashes: hashes,
      warning: "Provider status is not a substitute for inspecting the underlying transaction receipts." };
  }
  return { outcome: "pending_or_unverified", status: status.status, transactionHashes: hashes,
    warning: "Unknown, delayed, or non-terminal status must remain pending; do not retry a transfer." };
}
