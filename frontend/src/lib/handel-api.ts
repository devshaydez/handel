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
  holder: string;
  authorization: { message: string; nonce: string; recipient: string; issuedAtMs: string; publicKey: string; signature: string };
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
  proposal: {
    proposalId: string;
    type: 'Call' | 'Put';
    underlyingAssetId: string;
    strike: string;
    quantity: string;
    premium: string;
    expiryNs: string;
    estimatedPayoff: string;
    risks: string[];
    dataFreshness: string;
    rationale: string;
    createdAt: string;
  };
  prepared: {
    method: 'approve_agent_proposal';
    args: Record<string, string>;
  };
  agentSubmission: { accountId: string; transactionHash: string };
  approvalRequired: true;
  pricingMode: 'demo_fixture';
  ai: { provider: string; model: string; responseVerified: boolean };
  executionEligible: false;
  transactionSubmitted: true;
  walletSignatureRequested: false;
  policySource: string;
  approvalMode: 'agent_submitted_principal_approval';
}
export async function createAdvisoryProposal(input: AdvisoryProposalRequest): Promise<AdvisoryProposalReply> {
  const reply = await post<AdvisoryProposalReply>('/v1/advisory/proposals', input);
  if (!reply.proposal?.proposalId ||
      reply.prepared?.method !== 'approve_agent_proposal' ||
      reply.approvalRequired !== true ||
      reply.executionEligible !== false ||
      reply.transactionSubmitted !== true ||
      reply.walletSignatureRequested !== false ||
      reply.pricingMode !== 'demo_fixture' ||
      reply.ai?.responseVerified !== true ||
      reply.approvalMode !== 'agent_submitted_principal_approval' ||
      !reply.agentSubmission?.accountId || !reply.agentSubmission?.transactionHash ||
      reply.prepared.args?.proposal_id !== reply.proposal.proposalId ||
      !/^\d+$/.test(reply.prepared.args?.position_id ?? '')) {
    throw new HandelApiError('Handel backend returned an invalid proposal response.');
  }
  return reply;
}
