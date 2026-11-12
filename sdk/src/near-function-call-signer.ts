import { Account, JsonRpcProvider, KeyPair, teraToGas } from "near-api-js";

export const DELEGATED_AGENT_METHODS = Object.freeze([
  "agent_begin_collateral_lock",
  "agent_create_call",
  "agent_create_put",
  "agent_register_escrow_position",
] as const);
export type DelegatedAgentMethod = typeof DELEGATED_AGENT_METHODS[number];

export interface AccessKeyAccount {
  getAccessKeys(): Promise<unknown[]>;
  functionCall(input: {
    contractId: string;
    methodName: string;
    args: Record<string, unknown>;
    gas: bigint;
    attachedDeposit: bigint;
    waitUntil: "FINAL";
  }): Promise<unknown>;
}
export interface AgentFunctionCallResult {
  transactionHash: string;
  successValue?: string;
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function parseFunctionCallPermission(entry: unknown): { receiverId: string; methodNames: string[]; allowance: bigint } | null {
  const root = record(entry);
  const access = record(root.access_key ?? root.accessKey);
  const permission = record(access.permission);
  const fc = record(permission.FunctionCall ?? permission.functionCall);
  if (!Object.keys(fc).length) return null;
  const receiverId = String(fc.receiver_id ?? fc.receiverId ?? "");
  const rawMethods = fc.method_names ?? fc.methodNames;
  const allowance = fc.allowance;
  if (!Array.isArray(rawMethods) || rawMethods.some(x => typeof x !== "string") ||
      typeof allowance !== "string" || !/^(0|[1-9][0-9]*)$/.test(allowance)) return null;
  return { receiverId, methodNames: rawMethods as string[], allowance: BigInt(allowance) };
}

/**
 * A fail-closed signer for a dedicated Testnet agent account. It verifies the
 * exact public key's on-chain FunctionCall permission before every transaction.
 * It never accepts a principal key and never calls a token contract.
 */
export class RestrictedAgentFunctionCallSigner {
  constructor(
    readonly accountId: string,
    readonly contractId: string,
    private readonly publicKey: string,
    private readonly account: AccessKeyAccount,
    private readonly maxAllowanceYocto = 1_000_000_000_000_000_000_000_000n,
  ) {
    if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(accountId) ||
        !/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(contractId) || !publicKey) {
      throw new Error("agent signer identity is invalid");
    }
    if (maxAllowanceYocto <= 0n) throw new Error("agent key allowance ceiling must be positive");
  }

  async verifyAuthority(): Promise<void> {
    const keys = await this.account.getAccessKeys();
    const match = keys.find(entry => String(record(entry).public_key ?? record(entry).publicKey ?? "") === this.publicKey);
    if (!match) throw new Error("configured agent key is not installed on the agent account");
    const permission = parseFunctionCallPermission(match);
    if (!permission) throw new Error("agent key is FullAccess or has an unsupported permission; restricted FunctionCall key required");
    if (permission.receiverId !== this.contractId) throw new Error("agent key receiver is not the configured OptionsContract");
    const expected = [...DELEGATED_AGENT_METHODS].sort();
    const actual = [...permission.methodNames].sort();
    if (actual.length !== expected.length || actual.some((method, i) => method !== expected[i])) {
      throw new Error("agent key method allowlist must contain only the four delegated OptionsContract methods");
    }
    if (permission.allowance <= 0n || permission.allowance > this.maxAllowanceYocto) {
      throw new Error("agent key NEAR allowance is missing, zero, or exceeds the configured ceiling");
    }
  }

  async call(methodName: DelegatedAgentMethod, args: Record<string, unknown>): Promise<AgentFunctionCallResult> {
    if (!DELEGATED_AGENT_METHODS.includes(methodName)) throw new Error("method is outside the delegated agent allowlist");
    await this.verifyAuthority();
    const outcome = record(await this.account.functionCall({
      contractId: this.contractId,
      methodName,
      args,
      gas: 100_000_000_000_000n,
      attachedDeposit: 0n,
      waitUntil: "FINAL",
    }));
    const transaction = record(outcome.transaction);
    const transactionHash = String(transaction.hash ?? "");
    if (!transactionHash) throw new Error("NEAR did not return a transaction hash");
    const status = record(outcome.status);
    if (status.Failure !== undefined) throw new Error("delegated transaction failed: " + JSON.stringify(status.Failure));
    return { transactionHash, successValue: typeof status.SuccessValue === "string" ? status.SuccessValue : undefined };
  }
}

/** Creates a Testnet signer from a dedicated restricted key held in the backend environment. */
export async function createRestrictedAgentFunctionCallSigner(input: {
  agentAccountId: string;
  optionsContractId: string;
  privateKey: string;
  rpcUrl?: string;
  maxAllowanceYocto?: bigint;
}): Promise<RestrictedAgentFunctionCallSigner> {
  if (!input.privateKey?.trim()) throw new Error("HANDEL_AGENT_PRIVATE_KEY is required");
  const rpcUrl = input.rpcUrl ?? "https://rpc.testnet.fastnear.com";
  if (!rpcUrl.startsWith("https://")) throw new Error("agent signer RPC must use HTTPS");
  const keyPair = KeyPair.fromString(input.privateKey.trim());
  const nearAccount = new Account(input.agentAccountId, new JsonRpcProvider({ url: rpcUrl }), input.privateKey.trim());
  const account: AccessKeyAccount = {
    async getAccessKeys() {
      const response = await fetch(rpcUrl, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: "handel-agent-access-keys", method: "query",
          params: { request_type: "view_access_key_list", finality: "final", account_id: input.agentAccountId } }),
      });
      if (!response.ok) throw new Error("unable to read agent access-key permissions");
      const body = await response.json() as { result?: { keys?: unknown[] }; error?: { message?: string } };
      if (body.error || !Array.isArray(body.result?.keys)) throw new Error("agent access-key permissions are unavailable");
      return body.result.keys;
    },
    async functionCall(call) {
      return nearAccount.callFunction({
        contractId: call.contractId,
        methodName: call.methodName,
        args: call.args,
        gas: teraToGas("100"),
        deposit: 0n,
      });
    },
  };
  return new RestrictedAgentFunctionCallSigner(
    input.agentAccountId,
    input.optionsContractId,
    keyPair.getPublicKey().toString(),
    account,
    input.maxAllowanceYocto,
  );
}
