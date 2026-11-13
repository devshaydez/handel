import { createServer, type Server } from "node:http";
import { Pool } from "pg";
import { NearOptionsPositionReader, OptionsPositionIndexer } from "./onchain-indexer.js";
import { PostgresPositionSnapshotRepository } from "./postgres-position-store.js";
import { NearFinalizedReceiptIndexer } from "./near-finalized-receipt-indexer.js";

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
  const receiptStartHeightRaw = process.env.HANDEL_RECEIPT_INDEXER_START_HEIGHT?.trim();
  const receiptWatchAccounts = (process.env.HANDEL_RECEIPT_INDEXER_WATCH_ACCOUNTS ?? "options.shaydez.testnet,escrow.shaydez.testnet,handel-agent.testnet,wnear.tidepool-sandbox.testnet,usdc.tidepool-sandbox.testnet").split(",").map(value => value.trim()).filter(Boolean);
  const receiptIndexer = receiptStartHeightRaw ? new NearFinalizedReceiptIndexer(pool, rpcUrl, Number(receiptStartHeightRaw), receiptWatchAccounts) : null;
  let receiptLastRun: Awaited<ReturnType<NearFinalizedReceiptIndexer["reconcile"]>> | null = null;
  let receiptLastError: string | null = null;
  let receiptRunning = false;
  const receiptPollMs = Number(process.env.HANDEL_RECEIPT_INDEXER_POLL_MS ?? "15000");
  if (!Number.isSafeInteger(receiptPollMs) || receiptPollMs < 5000) throw new Error("HANDEL_RECEIPT_INDEXER_POLL_MS must be at least 5000");
  if (receiptIndexer) await receiptIndexer.migrate();
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
  const reconcileReceipts = async () => {
    if (!receiptIndexer || receiptRunning || stopped) return;
    receiptRunning = true;
    try { receiptLastRun = await receiptIndexer.reconcile(10); receiptLastError = null; }
    catch (error) { receiptLastError = error instanceof Error ? error.message : "receipt indexing failed"; }
    finally { receiptRunning = false; }
  };
  await reconcileReceipts();
  const receiptInterval = receiptIndexer ? setInterval(() => { void reconcileReceipts(); }, receiptPollMs) : null;

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (req.method !== "GET") { send(res, 405, { error: "method_not_allowed" }); return; }
      if (url.pathname === "/health") {
        send(res, lastError ? 503 : 200, {
          ok: !lastError, service: "handel-testnet-indexer", contractId,
          indexing: running, lastRun, lastError, pollMs,
          receiptHistory: { enabled: Boolean(receiptIndexer), indexing: receiptRunning, lastRun: receiptLastRun, lastError: receiptLastError, pollMs: receiptPollMs, startHeight: receiptStartHeightRaw ? Number(receiptStartHeightRaw) : null },
        });
        return;
      }
      if (url.pathname !== "/v1/portfolio" && url.pathname !== "/v1/activity" && url.pathname !== "/v1/receipts") {
        send(res, 404, { error: "not_found" }); return;
      }
      const account = url.searchParams.get("account") ?? "";
      if (!validAccount(account)) { send(res, 400, { error: "valid account query parameter required" }); return; }
      const limit = Math.min(250, Math.max(1, Number(url.searchParams.get("limit") ?? "100") || 100));
      if (url.pathname === "/v1/portfolio") {
        send(res, 200, { account, contractId, positions: await repository.listPositions(account, limit), indexedAt: lastRun });
      } else if (url.pathname === "/v1/receipts") {
        if (!receiptIndexer) { send(res, 503, { error: "receipt_history_not_configured", required: "HANDEL_RECEIPT_INDEXER_START_HEIGHT" }); return; }
        send(res, 200, { account, contractId, receipts: await receiptIndexer.listAccountHistory(account, limit), indexedAt: receiptLastRun });
      } else {
        const events = await repository.listActivity(account, limit);
        const receipts = receiptIndexer ? await receiptIndexer.listAccountHistory(account, limit) : [];
        send(res, 200, { account, contractId, events, receipts, indexedAt: lastRun, historyKind: receiptIndexer ? "finalized_transaction_and_receipt_history_plus_position_state_changes" : "reconciled_on_chain_position_state_changes", receiptHistoryEnabled: Boolean(receiptIndexer) });
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
    if (receiptInterval) clearInterval(receiptInterval);
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
