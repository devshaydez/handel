export interface IndexedChainPosition {
  contract_id: string;
  position_id: string;
  writer: string;
  holder: string;
  state: string;
  payload: {
    id: number | string;
    kind: string;
    writer: string;
    holder: string;
    asset_id: string;
    underlying_amount: string;
    strike_amount_usdc: string;
    expiry_ns: string | number;
    premium_amount_usdc: string;
    state: string;
    escrow_position_id?: number | string | null;
  };
  block_height: number | string;
  block_hash: string;
  indexed_at: string;
}
export interface IndexedPositionActivity {
  activity_id: string;
  position_id: string;
  event_type: string;
  previous_state: string | null;
  current_state: string;
  block_height: number | string;
  block_hash: string;
  occurred_at: string;
  payload: Record<string, unknown>;
}
function baseUrl(): string {
  const value = import.meta.env.VITE_HANDEL_INDEXER_URL as string | undefined;
  return value?.trim().replace(/\/$/, "") ?? "";
}
async function read<T>(path: string): Promise<T> {
  const base = baseUrl();
  if (!base) throw new Error("Persistent Testnet indexer is not configured");
  const response = await fetch(base + path, { headers: { accept: "application/json" }, cache: "no-store" });
  if (!response.ok) throw new Error("Indexer request failed (" + response.status + ")");
  return await response.json() as T;
}
export async function fetchIndexedPortfolio(account: string): Promise<IndexedChainPosition[]> {
  const data = await read<{ positions: IndexedChainPosition[] }>("/v1/portfolio?account=" + encodeURIComponent(account));
  return data.positions;
}
export async function fetchIndexedActivity(account: string): Promise<IndexedPositionActivity[]> {
  const data = await read<{ events: IndexedPositionActivity[] }>("/v1/activity?account=" + encodeURIComponent(account));
  return data.events;
}


interface NearViewResponse {
  result?: { result?: number[]; block_height?: number; block_hash?: string };
  error?: { message?: string };
}

/** Read the public OptionsContract views directly: no hosted database or indexer service required. */
async function callOptionsView<T>(
  methodName: string,
  args: Record<string, unknown>,
  blockHash?: string,
): Promise<{ value: T; blockHeight: number; blockHash: string }> {
  const rpcUrl = (import.meta.env.VITE_NEAR_RPC_URL as string | undefined)?.trim() || "https://rpc.testnet.near.org";
  const contractId = (import.meta.env.VITE_HANDEL_OPTIONS_CONTRACT_ID as string | undefined)?.trim() || "options.shaydez.testnet";
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "handel-portfolio",
      method: "query",
      params: {
        request_type: "call_function",
        ...(blockHash ? { block_id: blockHash } : { finality: "final" }),
        account_id: contractId,
        method_name: methodName,
        args_base64: btoa(unescape(encodeURIComponent(JSON.stringify(args)))),
      },
    }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("NEAR RPC returned HTTP " + response.status);
  const body = await response.json() as NearViewResponse;
  const result = body.result;
  if (body.error || !result?.result || !result.block_hash || typeof result.block_height !== "number") {
    throw new Error(body.error?.message || "OptionsContract view is unavailable; the read-only indexing methods may not yet be deployed.");
  }
  const value = JSON.parse(new TextDecoder().decode(new Uint8Array(result.result))) as T;
  return { value, blockHeight: result.block_height, blockHash: result.block_hash };
}

export async function fetchOnChainPortfolio(account: string): Promise<IndexedChainPosition[]> {
  if (!/^[a-z0-9]+([._-][a-z0-9]+)*$/.test(account) || account.length > 64) {
    throw new Error("Connect a valid NEAR account to load on-chain positions.");
  }
  const contractId = (import.meta.env.VITE_HANDEL_OPTIONS_CONTRACT_ID as string | undefined)?.trim() || "options.shaydez.testnet";
  const snapshot = await callOptionsView<number | string>("get_position_count", {});
  const count = Number(snapshot.value);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error("OptionsContract returned an invalid position count.");
  const rows: IndexedChainPosition[] = [];
  for (let fromId = 0; fromId < count; fromId += 50) {
    const page = await callOptionsView<IndexedChainPosition["payload"][]>(
      "get_positions_page",
      { from_id: fromId, limit: Math.min(50, count - fromId) },
      snapshot.blockHash,
    );
    if (page.blockHash !== snapshot.blockHash) throw new Error("NEAR RPC did not honor the finalized block pin; retry the portfolio read.");
    for (const position of page.value) {
      if (!position || !Number.isSafeInteger(Number(position.id)) || Number(position.id) < fromId ||
          Number(position.id) >= fromId + 50 || typeof position.writer !== "string" || typeof position.holder !== "string") {
        throw new Error("OptionsContract returned a malformed position page.");
      }
      if (position.writer !== account && position.holder !== account) continue;
      rows.push({
        contract_id: contractId,
        position_id: String(position.id),
        writer: position.writer,
        holder: position.holder,
        state: position.state,
        payload: position,
        block_height: snapshot.blockHeight,
        block_hash: snapshot.blockHash,
        indexed_at: new Date().toISOString(),
      });
    }
  }
  return rows.sort((a, b) => Number(b.position_id) - Number(a.position_id));
}

/** Prefer a configured persistent indexer, but fall back to direct finalized RPC reads. */
export async function fetchPortfolioPositions(account: string): Promise<IndexedChainPosition[]> {
  try {
    const indexed = await fetchIndexedPortfolio(account);
    if (indexed.length > 0) return indexed;
  } catch {
    // No paid indexer is required for a read-only portfolio view.
  }
  return fetchOnChainPortfolio(account);
}
