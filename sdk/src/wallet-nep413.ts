/**
 * Phase 18 wallet boundary for NEP-413.
 * This adapter delegates signing to the connected user's wallet. It never
 * accepts a private key or server-side signer and refuses unapproved actions.
 */
import type { Nep413Payload, SignedNep413 } from "./types.js";

export interface ConnectedWalletNep413Signer {
  accountId: string;
  signMessage(payload: Nep413Payload): Promise<{ publicKey: string; signature: string }>;
}

export interface WalletIntentApproval {
  approved: boolean;
  expectedAccountId: string;
  allowedVerifierIds: readonly string[];
  maxDeadlineMs?: number;
}

export async function signNep413WithConnectedWallet(input: {
  payload: Nep413Payload;
  approval: WalletIntentApproval;
  wallet: ConnectedWalletNep413Signer;
  nowMs?: number;
}): Promise<SignedNep413> {
  const { payload, approval, wallet } = input;
  if (approval.approved !== true) throw new Error("explicit principal approval required before signing");
  if (!wallet || wallet.accountId !== approval.expectedAccountId) throw new Error("connected wallet account does not match approved principal");
  if (!approval.allowedVerifierIds.includes(payload.recipient)) throw new Error("NEP-413 recipient is not an approved verifier");
  if (!payload.nonce || !payload.message || !payload.recipient) throw new Error("incomplete NEP-413 payload");
  let message: unknown;
  try { message = JSON.parse(payload.message); } catch { throw new Error("NEP-413 message must be valid JSON"); }
  if (!message || typeof message !== "object" || Array.isArray(message)) throw new Error("NEP-413 message must be an object");
  const body = message as Record<string, unknown>;
  if (body.signer_id !== wallet.accountId) throw new Error("NEP-413 signer_id does not match connected wallet");
  if (typeof body.deadline !== "string" || !Number.isFinite(Date.parse(body.deadline))) throw new Error("NEP-413 deadline is invalid");
  const now = input.nowMs ?? Date.now();
  const maxDeadline = approval.maxDeadlineMs ?? 30 * 60_000;
  const deadline = Date.parse(body.deadline);
  if (deadline <= now || deadline > now + maxDeadline) throw new Error("NEP-413 deadline is expired or exceeds the approved window");
  if (!Array.isArray(body.intents) || body.intents.length === 0) throw new Error("NEP-413 intents must be a non-empty array");

  // The only signing operation is a call into the already-connected user wallet.
  const signed = await wallet.signMessage(payload);
  if (!signed.publicKey || !signed.signature) throw new Error("wallet returned an incomplete NEP-413 signature");
  return {
    standard: "nep413",
    payload: structuredClone(payload),
    public_key: signed.publicKey,
    signature: signed.signature,
  };
}
