const API_BASE = (import.meta.env.VITE_HANDEL_API_BASE_URL ?? '/api').replace(/\/$/, '');

export interface EducationReply {
  answer: string;
  mode: 'EDUCATION_ONLY';
  executionEligible: false;
  transactionSubmitted: false;
  limitations?: string[];
}

export class HandelApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'HandelApiError';
  }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new HandelApiError('Handel backend is unreachable. Start the SDK API and try again.');
  }

  const payload = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok) {
    throw new HandelApiError(payload?.error ?? `Handel backend returned HTTP ${response.status}`, response.status);
  }
  if (!payload) throw new HandelApiError('Handel backend returned an invalid response.');
  return payload;
}

export async function askHandelEducation(question: string, context?: unknown): Promise<EducationReply> {
  const reply = await post<EducationReply>('/v1/education/answer', { question, context });
  if (typeof reply.answer !== 'string' || !reply.answer.trim() ||
      reply.mode !== 'EDUCATION_ONLY' || reply.executionEligible !== false ||
      reply.transactionSubmitted !== false) {
    throw new HandelApiError('Handel backend returned an invalid education-only response.');
  }
  return reply;
}

export function checkHandelHealth(): Promise<{ ok: boolean; service: string; mode: string; transactionSubmission: false }> {
  return fetch(`${API_BASE}/health`, { cache: 'no-store' }).then(async (response) => {
    if (!response.ok) throw new HandelApiError(`Handel backend health check failed: HTTP ${response.status}`, response.status);
    return response.json();
  });
}


export interface AdvisoryProposalRequest {
  agentId: string;
  holder: string;
  request: {
    type: 'Call' | 'Put';
    assetId: string;
    quantity: string;
    strike: string;
    expiryNs: string;
    objective: string;
  };
}

export interface AdvisoryProposalReply {
  advisory: {
    proposal: {
      proposalId: string;
      type: 'Call' | 'Put';
      underlyingAssetId: string;
      quantity: string;
      strike: string;
      premium: string;
      expiryNs: string;
      rationale: string;
      risks: string[];
    };
    approvalRequired: true;
    executionEligible: false;
    mode: 'ADVISORY_ONLY';
    limitations: string[];
  };
  prepared: {
    method: 'create_agent_proposal';
    args: Record<string, string>;
  };
  nextStep: 'agent_submits_pending_proposal_then_principal_approves';
  executionEligible: false;
  transactionSubmitted: false;
  walletSignatureRequested: false;
  pricingMode: 'demo_fixture';
  policyBlockHeight: number;
  limitations: string[];
}

/**
 * Generates an advisory-only proposal from the production AI gateway.
 * The response is never treated as a transaction or a live market quote.
 */
export async function createAdvisoryProposal(input: AdvisoryProposalRequest): Promise<AdvisoryProposalReply> {
  const reply = await post<AdvisoryProposalReply>('/v1/advisory/proposals', input);
  if (!reply.advisory?.proposal?.proposalId ||
      reply.advisory.approvalRequired !== true ||
      reply.advisory.executionEligible !== false ||
      reply.executionEligible !== false ||
      reply.transactionSubmitted !== false ||
      reply.walletSignatureRequested !== false ||
      reply.pricingMode !== 'demo_fixture' ||
      !Number.isSafeInteger(reply.policyBlockHeight)) {
    throw new HandelApiError('Handel backend returned an invalid advisory proposal response.');
  }
  return reply;
}
