import test from "node:test";
import assert from "node:assert/strict";
import type { Pool } from "pg";
import { NearFinalizedReceiptIndexer } from "./near-finalized-receipt-indexer.js";

test("receipt indexer requires a positive deployment start height", () => {
  assert.throws(() => new NearFinalizedReceiptIndexer({} as Pool, "https://rpc.testnet.near.org", 0), /positive integer/);
});

test("receipt indexer rejects unsafe scan batch sizes before RPC or database access", async () => {
  const indexer = new NearFinalizedReceiptIndexer({} as Pool, "https://rpc.testnet.near.org", 1);
  await assert.rejects(indexer.reconcile(0), /maxBlocks must be 1\.\.100/);
  await assert.rejects(indexer.reconcile(101), /maxBlocks must be 1\.\.100/);
});

test("receipt indexer rejects non-HTTPS remote RPC endpoints", () => {
  assert.throws(() => new NearFinalizedReceiptIndexer({} as Pool, "http://rpc.testnet.near.org", 1), /HTTPS/);
});

interface RecordedQuery { text: string; values?: unknown[] }
function fakePool(cursor = 100) {
  const queries: RecordedQuery[] = [];
  const record = async (text: string, values?: unknown[]) => {
    queries.push({ text, values });
    if (text.includes("SELECT next_block_height")) return { rows: [{ next_block_height: String(cursor) }] };
    return { rows: [] };
  };
  const client = { query: record, release: () => {} };
  return { pool: { query: record, connect: async () => client } as unknown as Pool, queries };
}

function receiptFetcher(receiptOutcome: Record<string, unknown>) {
  return async (_url: string | URL, init?: RequestInit): Promise<Response> => {
    const body = JSON.parse(String(init?.body)) as { method: string; params: Record<string, unknown> };
    const result = (() => {
      if (body.method === "block" && body.params.finality === "final") return { header: { height: 101, hash: "final" } };
      if (body.method === "block" && body.params.block_id === 100) return { header: { height: 100, hash: "block-100" }, chunks: [{ chunk_hash: "chunk-1", shard_id: 0 }] };
      if (body.method === "block" && body.params.block_id === "receipt-block") return { header: { height: 99, hash: "receipt-block" } };
      if (body.method === "chunk") return { transactions: [{ hash: "tx-1", signer_id: "options.shaydez.testnet", receiver_id: "escrow.shaydez.testnet" }] };
      if (body.method === "tx") return {
        final_execution_status: "FINAL",
        transaction: { hash: "tx-1", signer_id: "options.shaydez.testnet", receiver_id: "escrow.shaydez.testnet", actions: [] },
        status: { SuccessValue: "" },
        receipts_outcome: [receiptOutcome],
      };
      throw new Error("unexpected RPC method " + body.method);
    })();
    return new Response(JSON.stringify({ result }), { status: 200 });
  };
}

test("receipt indexer resolves the real block height when the RPC omits it", async () => {
  const { pool, queries } = fakePool();
  const indexer = new NearFinalizedReceiptIndexer(pool, "https://rpc.testnet.near.org", 100, ["options.shaydez.testnet"],
    receiptFetcher({ id: "receipt-1", block_hash: "receipt-block", outcome: { executor_id: "escrow.shaydez.testnet", status: { SuccessValue: "" }, logs: [] } }));
  const result = await indexer.reconcile(1);
  assert.deepEqual(result, { fromHeight: 100, toHeight: 100, transactions: 1, receipts: 1 });
  const insert = queries.find(query => query.text.includes("INSERT INTO handel_chain_receipts"));
  assert.equal(insert?.values?.[5], 99);
  assert.equal(insert?.values?.[6], "receipt-block");
});

test("receipt indexer rejects a receipt outcome without any block identity", async () => {
  const { pool } = fakePool();
  const indexer = new NearFinalizedReceiptIndexer(pool, "https://rpc.testnet.near.org", 100, ["options.shaydez.testnet"],
    receiptFetcher({ id: "receipt-1", outcome: { executor_id: "escrow.shaydez.testnet", status: { SuccessValue: "" }, logs: [] } }));
  await assert.rejects(() => indexer.reconcile(1), /malformed receipt outcome/);
});
