import { Buffer } from "node:buffer";
import type { OptionPosition } from "./near-types.js";

export interface IndexedPosition {
  contractId: string;
  position: OptionPosition;
  blockHeight: number;
  blockHash: string;
  indexedAt: string;
}
export interface PositionSnapshotRepository {
  upsertPositions(rows: readonly IndexedPosition[]): Promise<void>;
  getCursor(contractId: string): Promise<number>;
  setCursor(contractId: string, nextId: number, blockHeight: number, blockHash: string): Promise<void>;
}
export interface PositionIndexResult {
  scannedFrom: number;
  scannedTo: number;
  discovered: number;
  blockHeight: number;
  blockHash: string;
}
interface RpcViewResult {
  result?: { result?: number[]; block_height?: number; block_hash?: string };
  error?: { message?: string };
}
type Fetcher = (input: string | URL, init?: RequestInit) => Promise<Response>;

function decode<T>(bytes: number[] | undefined): T {
  if (!Array.isArray(bytes)) throw new Error("NEAR view call returned no result bytes");
  return JSON.parse(new TextDecoder().decode(new Uint8Array(bytes))) as T;
}

/** Finalized, bounded view-call reader for the deployed OptionsContract. */
export class NearOptionsPositionReader {
  private readonly fetcher: Fetcher;
  constructor(
    readonly rpcUrl: string,
    readonly contractId: string,
    fetcher: Fetcher = fetch,
  ) {
    const url = new URL(rpcUrl);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
      throw new Error("NEAR RPC endpoint must use HTTPS");
    }
    if (!contractId.trim()) throw new Error("contractId is required");
    this.fetcher = fetcher;
  }

  private async call<T>(methodName: string, args: Record<string, unknown>, blockHash?: string): Promise<{ value: T; blockHeight: number; blockHash: string }> {
    const response = await this.fetcher(this.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: "handel-position-indexer", method: "query",
        params: {
          request_type: "call_function", ...(blockHash ? { block_id: blockHash } : { finality: "final" }), account_id: this.contractId,
          method_name: methodName, args_base64: Buffer.from(JSON.stringify(args), "utf8").toString("base64"),
        },
      }),
    });
    if (!response.ok) throw new Error("NEAR RPC returned HTTP " + response.status);
    const body = await response.json() as RpcViewResult;
    if (body.error || !body.result?.block_hash || typeof body.result.block_height !== "number") {
      throw new Error("NEAR final view call failed: " + (body.error?.message ?? "missing block identity"));
    }
    return {
      value: decode<T>(body.result.result),
      blockHeight: body.result.block_height,
      blockHash: body.result.block_hash,
    };
  }

  async positionCount(): Promise<{ count: number; blockHeight: number; blockHash: string }> {
    const result = await this.call<number | string>("get_position_count", {});
    const count = Number(result.value);
    if (!Number.isSafeInteger(count) || count < 0) throw new Error("OptionsContract returned an invalid position count");
    return { count, blockHeight: result.blockHeight, blockHash: result.blockHash };
  }

  async positionsPage(fromId: number, limit = 50, blockHash?: string): Promise<{ positions: OptionPosition[]; blockHeight: number; blockHash: string }> {
    if (!Number.isSafeInteger(fromId) || fromId < 0 || !Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw new Error("position page bounds are invalid");
    }
    const result = await this.call<OptionPosition[]>("get_positions_page", { from_id: fromId, limit }, blockHash);
    if (!Array.isArray(result.value)) throw new Error("OptionsContract returned an invalid position page");
    for (const position of result.value) {
      if (!position || !Number.isSafeInteger(Number(position.id)) || Number(position.id) < fromId ||
          Number(position.id) >= fromId + limit || typeof position.writer !== "string" || typeof position.holder !== "string") {
        throw new Error("OptionsContract returned a malformed or out-of-range position");
      }
    }
    return { positions: result.value, blockHeight: result.blockHeight, blockHash: result.blockHash };
  }
}

/**
 * Reconciles the full monotonic position-ID space against finalized contract
 * state. The repository upsert must be transactional and unique on
 * (contract_id, position_id). Repeating a pass is safe.
 */
export class OptionsPositionIndexer {
  constructor(
    private readonly reader: NearOptionsPositionReader,
    private readonly repository: PositionSnapshotRepository,
    private readonly pageSize = 50,
    private readonly now: () => Date = () => new Date(),
  ) {
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) throw new Error("pageSize must be 1..50");
  }

  async reconcile(): Promise<PositionIndexResult> {
    const start = await this.repository.getCursor(this.reader.contractId);
    const snapshot = await this.reader.positionCount();
    const from = Math.min(start, snapshot.count);
    let cursor = from;
    let discovered = 0;
    while (cursor < snapshot.count) {
      const page = await this.reader.positionsPage(cursor, Math.min(this.pageSize, snapshot.count - cursor), snapshot.blockHash);
      // Pin every page to the same finalized block as the count. If the chain
      // advanced between calls, restart on the next pass rather than mix states.
      if (page.blockHash !== snapshot.blockHash) {
        throw new Error("OptionsContract changed between finalized pagination reads; retry reconciliation");
      }
      const rows = page.positions.map(position => ({
        contractId: this.reader.contractId,
        position,
        blockHeight: page.blockHeight,
        blockHash: page.blockHash,
        indexedAt: this.now().toISOString(),
      }));
      await this.repository.upsertPositions(rows);
      discovered += rows.length;
      cursor += Math.min(this.pageSize, snapshot.count - cursor);
      await this.repository.setCursor(this.reader.contractId, cursor, snapshot.blockHeight, snapshot.blockHash);
    }
    return {
      scannedFrom: from,
      scannedTo: cursor,
      discovered,
      blockHeight: snapshot.blockHeight,
      blockHash: snapshot.blockHash,
    };
  }
}
