import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";
import type { JsonSnapshotStore } from "./durable-orchestration.js";

/**
 * Node backend snapshot store. Writes a mode-0600 temporary file and atomically
 * renames it over the destination so a process crash cannot leave partial JSON.
 * The host must still back up and protect the containing directory.
 */
export class FileJsonSnapshotStore<T> implements JsonSnapshotStore<T> {
  constructor(private readonly filePath: string) {
    if (!filePath.trim()) throw new Error("filePath must not be empty");
  }

  async load(): Promise<T | null> {
    try {
      const content = await readFile(this.filePath, "utf8");
      return JSON.parse(content) as T;
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error &&
          (error as { code?: string }).code === "ENOENT") return null;
      throw error;
    }
  }

  async save(value: T): Promise<void> {
    const directory = dirname(this.filePath);
    await mkdir(directory, { recursive: true });
    const temporary = this.filePath + "." + randomBytes(8).toString("hex") + ".tmp";
    try {
      await writeFile(temporary, JSON.stringify(value), { encoding: "utf8", mode: 0o600, flag: "wx" });
      await rename(temporary, this.filePath);
    } catch (error) {
      const { unlink } = await import("node:fs/promises");
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }
}
