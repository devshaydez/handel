import { randomUUID } from "node:crypto";
import type { OptionType } from "./types.js";
import type { AgentFunctionCallResult, DelegatedAgentMethod } from "./near-function-call-signer.js";

export interface DelegatedAgentSigner {
  accountId: string;
  contractId: string;
  verifyAuthority(): Promise<void>;
  call(method: DelegatedAgentMethod, args: Record<string, unknown>): Promise<AgentFunctionCallResult>;
}
export interface DelegatedTradeRequest {
  principal: string;
  holder: string;
  type: OptionType;
  assetId: string;
  quantity: string;
  strike: string;
  premium: string;
  expiryNs: string;
}
export interface DelegatedTradeResult {
  status: "awaiting_principal_collateral";
  agentId: string;
  principal: string;
  positionId: string;
  escrowPositionId: string;
  createTransactionHash: string;
  registrationTransactionHash: string;
  nextAction: "principal_signs_collateral_transfer";
}
export class DelegatedExecutionError extends Error {
  constructor(message: string, readonly stage: "preflight" | "create" | "register" | "verify", readonly partial?: Partial<DelegatedTradeResult>) {
    super(message); this.name = "DelegatedExecutionError";
  }
}
type Fetcher = (input: string | URL, init?: RequestInit) => Promise<Response>;
interface RpcBody { result?: { result?: number[]; block_height?: number; block_hash?: string }; error?: { message?: string }; }
function validAccountId(value: string): boolean { return /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(value); }
function uint(value: string, label: string): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(value) || value.length > 78) throw new Error(label + " must be a canonical unsigned integer");
  return BigInt(value);
}
async function viewResult<T>(rpcUrl: string, contractId: string, method: string, args: unknown, fetcher: Fetcher, blockId?: string): Promise<{ value: T; blockHeight: number; blockHash: string }> {
  const response = await fetcher(rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
    jsonrpc: "2.0", id: "handel-agent-execution", method: "query",
    params: { request_type: "call_function", ...(blockId ? { block_id: blockId } : { finality: "final" }),
      account_id: contractId, method_name: method, args_base64: Buffer.from(JSON.stringify(args)).toString("base64") },
  }) });
  if (!response.ok) throw new Error("NEAR RPC returned HTTP " + response.status);
  const body = await response.json() as RpcBody;
  if (body.error || !Array.isArray(body.result?.result) || !body.result.block_hash) throw new Error(body.error?.message ?? "NEAR view returned no result");
  return {
    value: JSON.parse(Buffer.from(body.result.result).toString("utf8")) as T,
    blockHeight: body.result.block_height ?? 0,
    blockHash: body.result.block_hash,
  };
}
async function view<T>(rpcUrl: string, contractId: string, method: string, args: unknown, fetcher: Fetcher): Promise<T> {
  return (await viewResult<T>(rpcUrl, contractId, method, args, fetcher)).value;
}
async function readPolicyAndMode(rpcUrl: string, contractId: string, agentId: string, fetcher: Fetcher) {
  const policy = await viewResult<Record<string, unknown> | null>(rpcUrl, contractId, "get_agent_policy", { agent_id: agentId }, fetcher);
  const mode = await viewResult<string>(rpcUrl, contractId, "get_agent_execution_mode", { agent_id: agentId }, fetcher, policy.blockHash);
  if (policy.blockHeight !== mode.blockHeight) throw new Error("agent policy and mode were not read at the same finalized block");
  return { policy: policy.value, mode: mode.value };
}
function positionIdFrom(result: AgentFunctionCallResult): string {
  if (!result.successValue) throw new Error("OptionsContract did not return a position ID");
  const value = JSON.parse(Buffer.from(result.successValue, "base64").toString("utf8")) as unknown;
  if (!(typeof value === "number" && Number.isSafeInteger(value) && value >= 0) &&
      !(typeof value === "string" && /^(0|[1-9][0-9]*)$/.test(value) && BigInt(value) <= BigInt(Number.MAX_SAFE_INTEGER))) {
    throw new Error("OptionsContract returned an invalid or unsafe position ID");
  }
  return String(value);
}

/**
 * Creates and registers one fully collateralized Testnet option. The restricted
 * agent key only calls OptionsContract. The principal must separately sign the
 * NEP-141 collateral transfer; the holder separately signs premium payment.
 */
export async function executeDelegatedTrade(input: {
  request: DelegatedTradeRequest;
  signer: DelegatedAgentSigner;
  rpcUrl?: string;
  fetcher?: Fetcher;
}): Promise<DelegatedTradeResult> {
  const { request, signer } = input;
  const rpcUrl = input.rpcUrl ?? "https://rpc.testnet.fastnear.com";
  const fetcher = input.fetcher ?? fetch;
  try {
    if (!validAccountId(request.principal) || !validAccountId(request.holder) ||
        !validAccountId(signer.accountId) || request.principal === signer.accountId) throw new Error("principal, holder or agent account is invalid");
    if (signer.contractId !== "options.shaydez.testnet") throw new Error("delegated signer is not scoped to the configured Testnet OptionsContract");
    const { policy, mode } = await readPolicyAndMode(rpcUrl, signer.contractId, signer.accountId, fetcher);
    if (!policy || policy.enabled !== true) throw new Error("agent policy is absent, disabled or revoked");
    if (policy.principal !== request.principal) throw new Error("connected principal does not own this agent policy");
    if (mode !== "Delegated") throw new Error("on-chain execution mode is not Delegated");
    if (!Array.isArray(policy.allowed_assets) || !policy.allowed_assets.includes(request.assetId)) throw new Error("asset is not allowlisted by the on-chain policy");
    const quantity = uint(request.quantity, "underlying amount");
    const strike = uint(request.strike, "strike/collateral amount");
    const premium = uint(request.premium, "premium");
    const expiry = uint(request.expiryNs, "expiry");
    const nowNs = BigInt(Date.now()) * 1_000_000n;
    if (quantity <= 0n || strike <= 0n || premium <= 0n || expiry <= nowNs) throw new Error("trade amounts must be positive and expiry must be in the future");
    if (quantity > uint(String(policy.max_underlying_amount), "on-chain underlying cap")) throw new Error("underlying amount exceeds on-chain limit");
    if (premium > uint(String(policy.max_premium_usdc), "on-chain premium cap")) throw new Error("premium exceeds on-chain limit");
    if (request.type === "Put" && strike > uint(String(policy.max_collateral_usdc), "on-chain collateral cap")) throw new Error("Put collateral exceeds on-chain limit");
    if (expiry > uint(String(policy.expires_at_ns), "on-chain policy expiry")) throw new Error("option expiry exceeds on-chain policy expiry");
    await signer.verifyAuthority();
  } catch (error) {
    throw new DelegatedExecutionError(error instanceof Error ? error.message : "delegated preflight failed", "preflight");
  }

  const method = request.type === "Call" ? "agent_create_call" : "agent_create_put";
  let created: AgentFunctionCallResult;
  let positionId: string;
  try {
    created = await signer.call(method, {
      holder: request.holder,
      asset_id: request.assetId,
      underlying_amount: request.quantity,
      strike_amount_usdc: request.strike,
      expiry_ns: request.expiryNs,
      premium_amount_usdc: request.premium,
    });
    positionId = positionIdFrom(created);
  } catch (error) {
    throw new DelegatedExecutionError(error instanceof Error ? error.message : "agent create failed", "create");
  }

  const partial = {
    status: "awaiting_principal_collateral" as const,
    agentId: signer.accountId,
    principal: request.principal,
    positionId,
    escrowPositionId: "",
    createTransactionHash: created.transactionHash,
    registrationTransactionHash: "",
    nextAction: "principal_signs_collateral_transfer" as const,
  };
  try {
    // Re-check the key permission and contract policy immediately before this second call.
    const { policy, mode } = await readPolicyAndMode(rpcUrl, signer.contractId, signer.accountId, fetcher);
    if (!policy || policy.enabled !== true || policy.principal !== request.principal || mode !== "Delegated") {
      throw new Error("agent policy was revoked or changed between create and escrow registration");
    }
    const registered = await signer.call("agent_register_escrow_position", { position_id: Number(positionId) });
    const position = await view<Record<string, unknown> | null>(rpcUrl, signer.contractId, "get_position", { id: Number(positionId) }, fetcher);
    if (!position || position.writer !== request.principal || position.holder !== request.holder ||
        position.asset_id !== request.assetId || String(position.escrow_position_id ?? "") === "" ||
        position.escrow_registration_pending === true) {
      throw new Error("Escrow registration is not finalized or the returned position does not match the requested terms");
    }
    return { ...partial, escrowPositionId: String(position.escrow_position_id), registrationTransactionHash: registered.transactionHash };
  } catch (error) {
    throw new DelegatedExecutionError(error instanceof Error ? error.message : "Escrow registration failed", "register", partial);
  }
}
