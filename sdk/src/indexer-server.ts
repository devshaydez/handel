import { createServer, type Server } from "node:http";
import { Pool } from "pg";
import { NearOptionsPositionReader, OptionsPositionIndexer } from "./onchain-indexer.js";
import { PostgresPositionSnapshotRepository } from "./postgres-position-store.js";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(name + " is required");
  return value;
}
function validAccount(value: string): boolean {
  return value.length >= 2 && value.length <= 64 &&
    /^[a-z0-9]+([._-][a-z0-9]+)*$/.test(value);
}
function send(res: import("node:http").ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

export async function startHandelIndexerServer(): Promise<Server> {
  const databaseUrl = required("DATABASE_URL");
  const contractId = process.env.HANDEL_OPTIONS_CONTRACT_ID ?? "options.shaydez.testnet";
  const rpcUrl = process.env.NEAR_RPC_URL ?? "https://rpc.testnet.near.org";
  const port = Number(process.env.PORT ?? process.env.HANDEL_INDEXER_PORT ?? "8788");
  const pollMs = Number(process.env.HANDEL_INDEXER_POLL_MS ?? "30000");
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535 ||
      !Number.isSafeInteger(pollMs) || pollMs < 5000) throw new Error("Invalid indexer port or poll interval");

  const pool = new Pool({ connectionString: databaseUrl, max: 5, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000 });
  const repository = new PostgresPositionSnapshotRepository(pool);
  await repository.migrate();
  const reader = new NearOptionsPositionReader(rpcUrl, contractId);
  const indexer = new OptionsPositionIndexer(reader, repository);
  let lastRun: Awaited<ReturnType<OptionsPositionIndexer["reconcile"]>> | null = null;
  let lastError: string | null = null;
  let running = false;
  let stopped = false;

  const reconcile = async () => {
    if (running || stopped) return;
    running = true;
    try {
      lastRun = await indexer.reconcile();
      lastError = null;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "indexing failed";
    } finally {
      running = false;
    }
  };
  await reconcile();
  const interval = setInterval(() => { void reconcile(); }, pollMs);

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (req.method !== "GET") { send(res, 405, { error: "method_not_allowed" }); return; }
      if (url.pathname === "/health") {
        send(res, lastError ? 503 : 200, {
          ok: !lastError, service: "handel-testnet-indexer", contractId,
          indexing: running, lastRun, lastError, pollMs,
        });
        return;
      }
      if (url.pathname !== "/v1/portfolio" && url.pathname !== "/v1/activity") {
        send(res, 404, { error: "not_found" }); return;
      }
      const account = url.searchParams.get("account") ?? "";
      if (!validAccount(account)) { send(res, 400, { error: "valid account query parameter required" }); return; }
      const limit = Math.min(250, Math.max(1, Number(url.searchParams.get("limit") ?? "100") || 100));
      if (url.pathname === "/v1/portfolio") {
        send(res, 200, { account, contractId, positions: await repository.listPositions(account, limit), indexedAt: lastRun });
      } else {
        send(res, 200, { account, contractId, events: await repository.listActivity(account, limit), indexedAt: lastRun,
          historyKind: "reconciled_on_chain_position_state_changes", transactionHashes: "not_available_from_view_state_reconciliation" });
      }
    } catch {
      send(res, 503, { error: "indexer_unavailable" });
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "0.0.0.0", resolve);
  });
  const shutdown = async () => {
    if (stopped) return;
    stopped = true;
    clearInterval(interval);
    await new Promise<void>(resolve => server.close(() => resolve()));
    await repository.close();
  };
  process.once("SIGTERM", () => { void shutdown(); });
  process.once("SIGINT", () => { void shutdown(); });
  return server;
}

if (process.argv[1] && import.meta.url === new URL("file://" + process.argv[1]).href) {
  startHandelIndexerServer().then(() => {
    process.stdout.write("Handel Testnet indexer listening\n");
  }).catch(error => {
    process.stderr.write((error instanceof Error ? error.message : "indexer startup failed") + "\n");
    process.exitCode = 1;
  });
}
