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
