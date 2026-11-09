import type { AgentProposal } from "./types.js";
import { validateProposal } from "./policy.js";

export interface NearAiVerifiedDeployment {
  gateway?: { tcbStatus?: string; signer?: { signingAddress?: string } };
  models?: Array<{
    tcbStatus?: string;
    signer?: { signingAddress?: string };
    deployment?: {
      runtimeMeasurements?: { composeHash?: string; osImageHash?: string };
    };
  }>;
  verifiedAt?: number;
}

export interface NearAiClient {
  verify(model: string): Promise<NearAiVerifiedDeployment>;
  chat: {
    completions: {
      create(x: {
        model: string;
        messages: Array<{ role: "system" | "user"; content: string }>;
        temperature: number;
        max_tokens: number;
      }): Promise<{ id: string; choices?: Array<{ message?: { content?: string | null } }> }>;
    };
  };
  verifyResponse(id: string): Promise<{ signatureKind: string }>;
}

export interface NearAiBudget {
  budgetMicros: number;
  maxRequestCostMicros: number;
  maxRequests: number;
  maxCompletionTokens: number;
  maxPromptBytes: number;
}

export interface NearAiConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  budget: NearAiBudget;
  /** Exact model signer identities approved by Handel governance/configuration. */
  allowedGatewaySigners: string[];
  allowedModelSigners: string[];
  /** Exact authenticated TEE compose measurements approved for this model. */
  allowedComposeHashes: string[];
  /** Exact authenticated TEE OS image measurements approved for this model. */
  allowedOsImageHashes: string[];
  attestationCacheTimeToLiveMs?: number;
  requireProviderTee?: boolean;
}

export class NearAiError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = "NearAiError";
  }
}

/** Conservative reservation ledger: ambiguous calls are never refunded. */
export class NearAiBudgetLedger {
  private calls = 0;
  private reserved = 0;

  constructor(private c: NearAiBudget) {
    for (const [k, v] of Object.entries(c)) {
      if (!Number.isSafeInteger(v) || v <= 0) {
        throw new NearAiError("invalid budget field " + k, "INVALID_BUDGET");
      }
    }
    if (c.maxRequestCostMicros > c.budgetMicros) {
      throw new NearAiError("request reservation exceeds total budget", "INVALID_BUDGET");
    }
  }

  reserve() {
    if (this.calls >= this.c.maxRequests || this.reserved + this.c.maxRequestCostMicros > this.c.budgetMicros) {
      throw new NearAiError("NEAR AI budget exhausted", "BUDGET_EXHAUSTED");
    }
    this.calls++;
    this.reserved += this.c.maxRequestCostMicros;
    return this.snapshot();
  }

  snapshot() {
    return { requestsReserved: this.calls, reservedCostMicros: this.reserved, budgetMicros: this.c.budgetMicros };
  }
}

/**
 * Creates the official Node SDK client with Chat field-level E2EE and Gateway
 * OHTTP enabled. The SDK verifies Gateway/model evidence and the OHTTP key
 * binding; Handel additionally pins the authenticated model deployment.
 *
 * System One intentionally uses a separate client with E2EE/OHTTP disabled,
 * as required by the official SDK contract.
 */
export async function createOfficialNearAiClient(
  config: Pick<NearAiConfig, "apiKey" | "allowedGatewaySigners" | "allowedModelSigners" | "allowedComposeHashes" | "allowedOsImageHashes" | "attestationCacheTimeToLiveMs">,
  baseUrl = "https://cloud-api.near.ai/v1/",
): Promise<NearAiClient> {
  const { allowedModelSigners, allowedComposeHashes, allowedOsImageHashes } = config;
  if (!config.allowedGatewaySigners.length || !allowedModelSigners.length || !allowedComposeHashes.length || !allowedOsImageHashes.length) {
    throw new NearAiError("explicit model signer, compose and OS measurement allowlists are required", "DEPLOYMENT_ALLOWLIST_REQUIRED");
  }
  const name: string = "@nearai/inference-sdk/node";
  try {
    const sdk = await import(name) as {
      InferenceClient: new (o: {
        apiKey: string;
        baseUrl: string;
        e2ee: boolean;
        ohttp: boolean;
        signingAlgo: "ed25519";
        attestationCacheTimeToLiveMs: number;
        gatewayVerification: { policy: { acceptedTcbStatuses: string[] } };
        modelVerification: {
          policy: { acceptedTcbStatuses: string[]; gpuEvidence?: "if-present" | "required" };
          verifiers: { deployment: (deployment: { runtimeMeasurements: { composeHash?: string; osImageHash?: string } }) => void };
        };
      }) => NearAiClient;
    };
    return new sdk.InferenceClient({
      apiKey: config.apiKey,
      baseUrl,
      e2ee: true,
      ohttp: true,
      signingAlgo: "ed25519",
      attestationCacheTimeToLiveMs: config.attestationCacheTimeToLiveMs ?? 0,
      gatewayVerification: { policy: { acceptedTcbStatuses: ["UpToDate"] } },
      modelVerification: {
        policy: { acceptedTcbStatuses: ["UpToDate"], gpuEvidence: "required" },
        verifiers: {
          deployment: (deployment) => {
            const m = deployment.runtimeMeasurements;
            if (!m.composeHash || !allowedComposeHashes.includes(m.composeHash)) {
              throw new Error("model compose measurement is not allowlisted");
            }
            if (!m.osImageHash || !allowedOsImageHashes.includes(m.osImageHash)) {
              throw new Error("model OS image measurement is not allowlisted");
            }
          },
        },
      },
    });
  } catch (error) {
    if (error instanceof NearAiError) throw error;
    throw new NearAiError("Install @nearai/inference-sdk@0.3.0 and use a supported Node.js runtime", "SDK_NOT_INSTALLED");
  }
}

const SYSTEM = "You are Handel's strategy assistant. Return one JSON AgentProposal only. Use supplied asset IDs and market facts only. Never invent prices, premium, balances, permissions or execution results. The host replaces premium with a deterministic quote. Include concrete risks, rationale and data timestamp. Never claim execution.";

function parseProposal(raw: unknown): AgentProposal {
  if (typeof raw !== "string" || raw.length > 32000) throw new NearAiError("missing/oversized model response", "INVALID_RESPONSE");
  let x: unknown;
  try { x = JSON.parse(raw); } catch { throw new NearAiError("model response is not JSON", "INVALID_RESPONSE"); }
  if (!x || typeof x !== "object" || Array.isArray(x)) throw new NearAiError("proposal must be object", "INVALID_RESPONSE");
  const p = x as Record<string, unknown>;
  const keys = ["proposalId", "type", "underlyingAssetId", "strike", "quantity", "premium", "expiryNs", "estimatedPayoff", "risks", "dataFreshness", "rationale", "createdAt"];
  if (Object.keys(p).length !== keys.length || keys.some(k => !(k in p))) throw new NearAiError("proposal schema mismatch", "INVALID_RESPONSE");
  if (p.type !== "Call" && p.type !== "Put") throw new NearAiError("invalid option type", "INVALID_RESPONSE");
  for (const k of keys.filter(k => k !== "risks" && k !== "type")) if (typeof p[k] !== "string") throw new NearAiError("invalid field " + k, "INVALID_RESPONSE");
  if (!Array.isArray(p.risks) || p.risks.length > 20 || p.risks.some(v => typeof v !== "string")) throw new NearAiError("invalid risks", "INVALID_RESPONSE");
  return p as unknown as AgentProposal;
}

export class NearAiProposalProvider {
  private ledger: NearAiBudgetLedger;

  constructor(private c: NearAiConfig, private client: NearAiClient, ledger?: NearAiBudgetLedger) {
    if (!c.apiKey.trim() || !c.model.trim()) throw new NearAiError("API key and model required", "INVALID_CONFIG");
    if (new URL(c.baseUrl ?? "https://cloud-api.near.ai/v1/").protocol !== "https:") throw new NearAiError("HTTPS required", "INVALID_CONFIG");
    if (!c.allowedGatewaySigners.length || !c.allowedModelSigners.length || !c.allowedComposeHashes.length || !c.allowedOsImageHashes.length) {
      throw new NearAiError("explicit TEE deployment allowlists are required", "DEPLOYMENT_ALLOWLIST_REQUIRED");
    }
    this.ledger = ledger ?? new NearAiBudgetLedger(c.budget);
  }

  budgetSnapshot() { return this.ledger.snapshot(); }

  async propose(input: unknown) {
    const body = JSON.stringify(input);
    if (new TextEncoder().encode(body).byteLength > this.c.budget.maxPromptBytes) throw new NearAiError("prompt exceeds byte cap", "PROMPT_TOO_LARGE");
    const usage = this.ledger.reserve();
    let deployment: NearAiVerifiedDeployment;
    try { deployment = await this.client.verify(this.c.model); }
    catch { throw new NearAiError("deployment attestation failed", "ATTESTATION_FAILED"); }
    if (deployment.gateway?.tcbStatus !== "UpToDate") throw new NearAiError("Gateway TCB is not UpToDate", "GATEWAY_TCB_REJECTED");
    if (!deployment.gateway.signer?.signingAddress || !this.c.allowedGatewaySigners.includes(deployment.gateway.signer.signingAddress)) throw new NearAiError("Gateway signer is not allowlisted", "GATEWAY_SIGNER_REJECTED");
    if (!Array.isArray(deployment.models) || !deployment.models.length) throw new NearAiError("model deployment has no verified model attestation", "MODEL_NOT_ATTESTED");
    for (const model of deployment.models) {
      if (model.tcbStatus !== "UpToDate") throw new NearAiError("model TCB is not UpToDate", "MODEL_TCB_REJECTED");
      if (!model.signer?.signingAddress || !this.c.allowedModelSigners.includes(model.signer.signingAddress)) {
        throw new NearAiError("model signer is not allowlisted", "MODEL_SIGNER_REJECTED");
      }
      const m = model.deployment?.runtimeMeasurements;
      if (!m?.composeHash || !this.c.allowedComposeHashes.includes(m.composeHash) ||
          !m.osImageHash || !this.c.allowedOsImageHashes.includes(m.osImageHash)) {
        throw new NearAiError("model deployment measurement is not allowlisted", "DEPLOYMENT_MEASUREMENT_REJECTED");
      }
    }
    let completion;
    try {
      completion = await this.client.chat.completions.create({
        model: this.c.model,
        messages: [{ role: "system", content: SYSTEM }, { role: "user", content: body }],
        temperature: 0.1,
        max_tokens: this.c.budget.maxCompletionTokens,
      });
    } catch { throw new NearAiError("inference failed", "INFERENCE_FAILED"); }
    if (!completion.id) throw new NearAiError("completion ID missing", "INVALID_RESPONSE");
    let receipt;
    try { receipt = await this.client.verifyResponse(completion.id); }
    catch { throw new NearAiError("response signature verification failed", "RESPONSE_UNVERIFIED"); }
    if (receipt.signatureKind !== "provider_tee" && this.c.requireProviderTee !== false) {
      throw new NearAiError("response is not provider-TEE signed", "MODEL_SIGNATURE_REQUIRED");
    }
    if (receipt.signatureKind !== "provider_tee" && receipt.signatureKind !== "gateway") {
      throw new NearAiError("unknown signature kind", "INVALID_SIGNATURE");
    }
    const proposal = parseProposal(completion.choices?.[0]?.message?.content);
    const policy = validateProposal(proposal, null);
    if (!policy.ok) throw new NearAiError("proposal rejected: " + policy.errors.join("; "), "PROPOSAL_REJECTED");
    return {
      proposal,
      requestId: completion.id,
      verification: {
        gatewayVerified: true,
        modelAttested: true,
        signatureKind: receipt.signatureKind,
        verifiedAt: deployment.verifiedAt ?? Date.now(),
        modelSigners: deployment.models.map(m => m.signer?.signingAddress),
      },
      privacy: { e2ee: true, ohttp: true, signingAlgo: "ed25519" as const },
      usage,
    };
  }
}
