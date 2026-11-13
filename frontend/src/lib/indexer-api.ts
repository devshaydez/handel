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
