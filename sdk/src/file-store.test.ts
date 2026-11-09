import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileJsonSnapshotStore } from "./file-store.js";

test("file snapshot store atomically persists and reloads JSON", async () => {
  const directory = await mkdtemp(join(tmpdir(), "handel-store-"));
  const path = join(directory, "journal", "operations.json");
  try {
    const store = new FileJsonSnapshotStore<{ sequence: number }[]>(path);
    assert.equal(await store.load(), null);
    await store.save([{ sequence: 1 }, { sequence: 2 }]);
    assert.deepEqual(await store.load(), [{ sequence: 1 }, { sequence: 2 }]);
    const raw = await readFile(path, "utf8");
    assert.equal(raw, '[{"sequence":1},{"sequence":2}]');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
