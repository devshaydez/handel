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
