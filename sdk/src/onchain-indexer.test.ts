import test from "node:test";
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { NearOptionsPositionReader, OptionsPositionIndexer, type IndexedPosition, type PositionSnapshotRepository } from "./onchain-indexer.js";

function rpc(value: unknown, height = 100, hash = "final-block"): Response {
  return new Response(JSON.stringify({ result: {
    result: [...Buffer.from(JSON.stringify(value), "utf8")],
    block_height: height, block_hash: hash,
  } }), { status: 200 });
}

class MemoryRepository implements PositionSnapshotRepository {
  rows = new Map<string, IndexedPosition>();
  cursor = 0;
  async upsertPositions(rows: readonly IndexedPosition[]) {
    for (const row of rows) this.rows.set(String(row.position.id), row);
  }
  async getCursor() { return this.cursor; }
  async setCursor(_contract: string, next: number) { this.cursor = next; }
}

test("reader decodes final position count and pages pinned to a finalized block", async () => {
  const requests: Array<Record<string, unknown>> = [];
  const reader = new NearOptionsPositionReader("https://rpc.testnet.near.org", "options.testnet", async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { params: Record<string, unknown> };
    requests.push(body.params);
    if (body.params.method_name === "get_position_count") return rpc(2);
    return rpc([{ id: 0, writer: "writer.testnet", holder: "holder.testnet", state: "Open" }]);
  });
  const count = await reader.positionCount();
  assert.equal(count.count, 2);
  const page = await reader.positionsPage(0, 1, count.blockHash);
  assert.equal(page.positions[0]?.id, 0);
  assert.equal(requests[1]?.block_id, "final-block");
  assert.equal(requests[1]?.finality, undefined);
});

test("indexer performs idempotent full reconciliation and persists positions", async () => {
  let state = "Open";
  const reader = new NearOptionsPositionReader("https://rpc.testnet.near.org", "options.testnet", async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { params: Record<string, unknown> };
    if (body.params.method_name === "get_position_count") return rpc(1);
    return rpc([{ id: 0, writer: "writer.testnet", holder: "holder.testnet", state }]);
  });
  const repository = new MemoryRepository();
  const indexer = new OptionsPositionIndexer(reader, repository, 10, () => new Date("2026-11-13T00:00:00.000Z"));
  const first = await indexer.reconcile();
  assert.equal(first.discovered, 1);
  assert.equal(repository.rows.get("0")?.position.state, "Open");
  state = "Settled";
  const second = await indexer.reconcile();
  assert.equal(second.scannedFrom, 0);
  assert.equal(repository.rows.get("0")?.position.state, "Settled");
});

test("reader rejects invalid page bounds and malformed positions", async () => {
  const reader = new NearOptionsPositionReader("https://rpc.testnet.near.org", "options.testnet", async () => rpc([{ id: 100, writer: "writer.testnet", holder: "holder.testnet" }]));
  await assert.rejects(() => reader.positionsPage(0, 51), /bounds/);
  await assert.rejects(() => reader.positionsPage(0, 10), /malformed or out-of-range/);
});
