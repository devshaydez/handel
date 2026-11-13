import type { Pool } from "pg";

type Fetcher = (input: string | URL, init?: RequestInit) => Promise<Response>;
interface RpcError { message?: string; }
interface RpcEnvelope<T> { result?: T; error?: RpcError; }
interface BlockResult { header?: { height?: number; hash?: string }; chunks?: Array<{ chunk_hash: string; shard_id: number }>; }
interface ChunkResult { transactions?: Array<{ hash: string; signer_id: string }>; }
interface TxResult {
  final_execution_status?: string;
  transaction?: { hash?: string; signer_id?: string; receiver_id?: string; actions?: unknown[] };
  status?: unknown;
  receipts_outcome?: Array<{
    id?: string;
    block_hash?: string;
    block_height?: number;
    outcome?: { executor_id?: string; status?: unknown; logs?: string[]; gas_burnt?: number; tokens_burnt?: string };
  }>;
}

export interface IndexedReceipt {
  transaction_hash: string;
  signer_id: string;
  receiver_id: string;
  receipt_id: string;
  executor_id: string;
  block_height: number;
  block_hash: string;
  execution_status: string;
  finalized: boolean;
  logs: string[];
  indexed_at: string;
}

/** Read-only finalized block/chunk/transaction scanner. It never submits transactions. */
export class NearFinalizedReceiptIndexer {
  private readonly fetcher: Fetcher;
  constructor(
    private readonly pool: Pool,
    private readonly rpcUrl: string,
    private readonly startHeight: number,
    fetcher: Fetcher = fetch,
  ) {
    const url = new URL(rpcUrl);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
      throw new Error("NEAR RPC endpoint must use HTTPS");
    }
    if (!Number.isSafeInteger(startHeight) || startHeight < 1) throw new Error("receipt indexer start height must be a positive integer");
    this.fetcher = fetcher;
  }

  private async rpc<T>(method: string, params: Record<string, unknown>): Promise<T> {
    const response = await this.fetcher(this.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: "handel-finalized-receipt-indexer", method, params }),
    });
    if (!response.ok) throw new Error("NEAR RPC returned HTTP " + response.status);
    const body = await response.json() as RpcEnvelope<T>;
    if (body.error || body.result === undefined) throw new Error("NEAR RPC " + method + " failed: " + (body.error?.message ?? "missing result"));
    return body.result;
  }

  async migrate(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS handel_receipt_indexer_cursor (
        id smallint PRIMARY KEY CHECK (id = 1),
        next_block_height bigint NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS handel_chain_transactions (
        transaction_hash text PRIMARY KEY,
        signer_id text NOT NULL,
        receiver_id text NOT NULL,
        block_height bigint NOT NULL,
        block_hash text NOT NULL,
        final_execution_status text NOT NULL,
        raw_status jsonb NOT NULL,
        indexed_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS handel_chain_transactions_signer_idx
        ON handel_chain_transactions (signer_id,block_height DESC);
      CREATE TABLE IF NOT EXISTS handel_chain_receipts (
        receipt_id text PRIMARY KEY,
        transaction_hash text NOT NULL REFERENCES handel_chain_transactions(transaction_hash) ON DELETE CASCADE,
        signer_id text NOT NULL,
        receiver_id text NOT NULL,
        executor_id text NOT NULL,
        block_height bigint NOT NULL,
        block_hash text NOT NULL,
        execution_status text NOT NULL,
        finalized boolean NOT NULL,
        logs jsonb NOT NULL,
        indexed_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS handel_chain_receipts_executor_idx
        ON handel_chain_receipts (executor_id,block_height DESC);
    `);
    await this.pool.query(
      "INSERT INTO handel_receipt_indexer_cursor (id,next_block_height) VALUES (1,$1) ON CONFLICT (id) DO NOTHING",
      [this.startHeight],
    );
  }

  async reconcile(maxBlocks = 20): Promise<{ fromHeight: number; toHeight: number; transactions: number; receipts: number }> {
    if (!Number.isInteger(maxBlocks) || maxBlocks < 1 || maxBlocks > 100) throw new Error("maxBlocks must be 1..100");
    const cursorResult = await this.pool.query<{ next_block_height: string }>(
      "SELECT next_block_height::text FROM handel_receipt_indexer_cursor WHERE id=1",
    );
    const cursor = cursorResult.rows[0] ? Number(cursorResult.rows[0].next_block_height) : this.startHeight;
    const latest = await this.rpc<BlockResult>("block", { finality: "final" });
    const finalHeight = Number(latest.header?.height);
    if (!Number.isSafeInteger(finalHeight) || finalHeight < 1) throw new Error("NEAR RPC returned invalid finalized block height");
    let height = cursor;
    let transactions = 0;
    let receipts = 0;
    const client = await this.pool.connect();
    try {
      while (height <= finalHeight && height < cursor + maxBlocks) {
        const block = await this.rpc<BlockResult>("block", { block_id: height });
        const blockHash = block.header?.hash;
        if (Number(block.header?.height) !== height || !blockHash || !Array.isArray(block.chunks)) {
          throw new Error("NEAR RPC returned malformed finalized block " + height);
        }
        for (const chunkMeta of block.chunks) {
          const chunk = await this.rpc<ChunkResult>("chunk", { chunk_id: chunkMeta.chunk_hash, block_id: height });
          for (const tx of chunk.transactions ?? []) {
            if (!tx.hash || !tx.signer_id) throw new Error("NEAR chunk contains malformed transaction");
            const result = await this.rpc<TxResult>("tx", {
              tx_hash: tx.hash, sender_account_id: tx.signer_id, wait_until: "FINAL",
            });
            const transaction = result.transaction;
            if (!transaction || transaction.hash !== tx.hash || transaction.signer_id !== tx.signer_id ||
                !transaction.receiver_id || result.final_execution_status !== "FINAL") {
              throw new Error("NEAR transaction result is not finalized or does not match chunk transaction " + tx.hash);
            }
            await client.query("BEGIN");
            try {
              await client.query(`
                INSERT INTO handel_chain_transactions
                  (transaction_hash,signer_id,receiver_id,block_height,block_hash,final_execution_status,raw_status)
                VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
                ON CONFLICT (transaction_hash) DO UPDATE SET
                  signer_id=EXCLUDED.signer_id,receiver_id=EXCLUDED.receiver_id,
                  block_height=EXCLUDED.block_height,block_hash=EXCLUDED.block_hash,
                  final_execution_status=EXCLUDED.final_execution_status,raw_status=EXCLUDED.raw_status
              `, [tx.hash,tx.signer_id,transaction.receiver_id,height,blockHash,result.final_execution_status,JSON.stringify(result.status ?? null)]);
              transactions += 1;
              for (const receipt of result.receipts_outcome ?? []) {
                if (!receipt.id || !receipt.outcome?.executor_id ||
                    !Number.isSafeInteger(receipt.block_height) || !receipt.block_hash) {
                  throw new Error("NEAR transaction contains malformed receipt outcome");
                }
                const status = receipt.outcome.status;
                const executionStatus = typeof status === "object" && status !== null
                  ? ("SuccessValue" in status ? "success" : "Failure" in status ? "failure" : "unknown")
                  : "unknown";
                await client.query(`
                  INSERT INTO handel_chain_receipts
                    (receipt_id,transaction_hash,signer_id,receiver_id,executor_id,block_height,block_hash,execution_status,finalized,logs)
                  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9::jsonb)
                  ON CONFLICT (receipt_id) DO UPDATE SET
                    transaction_hash=EXCLUDED.transaction_hash,signer_id=EXCLUDED.signer_id,
                    receiver_id=EXCLUDED.receiver_id,executor_id=EXCLUDED.executor_id,
                    block_height=EXCLUDED.block_height,block_hash=EXCLUDED.block_hash,
                    execution_status=EXCLUDED.execution_status,finalized=true,logs=EXCLUDED.logs
                `, [receipt.id,tx.hash,tx.signer_id,transaction.receiver_id,receipt.outcome.executor_id,
                  receipt.block_height,receipt.block_hash,executionStatus,JSON.stringify(receipt.outcome.logs ?? [])]);
                receipts += 1;
              }
              await client.query("COMMIT");
            } catch (error) {
              await client.query("ROLLBACK");
              throw error;
            }
          }
        }
        await this.pool.query(
          "UPDATE handel_receipt_indexer_cursor SET next_block_height=$1,updated_at=now() WHERE id=1",
          [height + 1],
        );
        height += 1;
      }
    } finally {
      client.release();
    }
    return { fromHeight: cursor, toHeight: height - 1, transactions, receipts };
  }

  async listAccountHistory(account: string, limit = 100): Promise<IndexedReceipt[]> {
    const safeLimit = Math.max(1, Math.min(250, Math.trunc(limit)));
    const result = await this.pool.query(
      `SELECT transaction_hash,signer_id,receiver_id,receipt_id,executor_id,
        block_height,block_hash,execution_status,finalized,logs,indexed_at
       FROM handel_chain_receipts
       WHERE signer_id=$1 OR receiver_id=$1 OR executor_id=$1
       ORDER BY block_height DESC,receipt_id DESC LIMIT $2`,
      [account,safeLimit],
    );
    return result.rows as IndexedReceipt[];
  }
}
