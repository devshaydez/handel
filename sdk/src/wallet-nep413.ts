/**
 * Phase 18 wallet boundary for NEP-413.
 * This adapter delegates signing to the connected user's wallet. It never
 * accepts a private key or server-side signer and refuses unapproved actions.
 */

import type { Nep413Payload, SignedNep413 } from "./types.js";

/** Minimal shape implemented by the generic connected-wallet boundary. */
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

export interface WalletSelectorAccount {
  accountId: string;
  /** Wallet Selector may expose the account's active public key. */
  publicKey?: string;
}

export interface WalletSelectorSignedMessage {
  publicKey: string;
  signature: string;
}

/**
 * The subset of @near-wallet-selector/core's Wallet API used here.
 * nonce is passed as a Uint8Array (Buffer-compatible); NEP-413 requires 32 bytes.
 */
export interface WalletSelectorNep413Wallet {
  getAccounts(): Promise<WalletSelectorAccount[]>;
  signMessage(input: {
    message: string;
    recipient: string;
    nonce: Uint8Array;
  }): Promise<WalletSelectorSignedMessage | void>;
}

/** Decode canonical base64 without depending on Node Buffer in browser bundles. */
export function decodeNep413Nonce(nonceBase64: string): Uint8Array {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(nonceBase64)) {
    throw new Error("NEP-413 nonce must be valid base64");
  }
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const output: number[] = [];
  for (let i = 0; i < nonceBase64.length; i += 4) {
    const a = alphabet.indexOf(nonceBase64[i]);
    const b = alphabet.indexOf(nonceBase64[i + 1]);
    const c = nonceBase64[i + 2] === "=" ? 0 : alphabet.indexOf(nonceBase64[i + 2]);
    const d = nonceBase64[i + 3] === "=" ? 0 : alphabet.indexOf(nonceBase64[i + 3]);
    output.push((a << 2) | (b >> 4));
    if (nonceBase64[i + 2] !== "=") output.push(((b & 15) << 4) | (c >> 2));
    if (nonceBase64[i + 3] !== "=") output.push(((c & 3) << 6) | d);
  }
  if (output.length !== 32) throw new Error("NEP-413 nonce must decode to exactly 32 bytes");
  return Uint8Array.from(output);
}

/**
 * Adapt the real Wallet Selector API to Handel's strict signing boundary.
 * The active account is re-read immediately before each wallet prompt. Wallet
 * redirect flows that return void are rejected because no signature is yet
 * available to bind to the approved intent.
 */
export function createWalletSelectorNep413Signer(input: {
  wallet: WalletSelectorNep413Wallet;
  expectedAccountId: string;
}): ConnectedWalletNep413Signer {
  return {
    accountId: input.expectedAccountId,
    async signMessage(payload) {
      const accounts = await input.wallet.getAccounts();
      if (!accounts.some((account) => account.accountId === input.expectedAccountId)) {
        throw new Error("Wallet Selector account changed or disconnected before signing");
      }
      const selectedAccount = accounts.find((account) => account.accountId === input.expectedAccountId);
      const signed = await input.wallet.signMessage({
        message: payload.message,
        recipient: payload.recipient,
        nonce: decodeNep413Nonce(payload.nonce),
      });
      if (!signed) {
        throw new Error("Wallet Selector redirected for signing; complete the wallet callback before continuing");
      }
      if (typeof signed.publicKey !== "string" || !signed.publicKey ||
          typeof signed.signature !== "string" || !signed.signature) {
        throw new Error("Wallet Selector returned an incomplete NEP-413 signature");
      }
      // Re-check after the prompt because the wallet may switch or disconnect
      // while its approval dialog is open.
      const accountsAfter = await input.wallet.getAccounts();
      if (!accountsAfter.some((account) => account.accountId === input.expectedAccountId)) {
        throw new Error("Wallet Selector account changed or disconnected during signing");
      }
      if (selectedAccount?.publicKey && signed.publicKey !== selectedAccount.publicKey) {
        throw new Error("Wallet Selector signature public key does not match the approved account");
      }
      return { publicKey: signed.publicKey, signature: signed.signature };
    },
  };
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
  // Validate nonce shape before opening a wallet prompt, regardless of adapter type.
  decodeNep413Nonce(payload.nonce);
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
