/**
 * NEP-413 intent helpers for Path A.
 *
 * Important (from NEAR Intents docs + sprint plan):
 * - NEP-413 requires a FULL-ACCESS key. Function-call keys cannot sign these.
 * - For a named account, the key must be registered on the Verifier via add_public_key.
 * - Nonce is 32 random bytes, base64-encoded.
 * - Message is a single-line JSON string containing signer_id, deadline, intents.
 */

import { randomBytes } from "node:crypto";
import type { IntentMessage, Nep413Payload, SignedNep413, TransferIntent } from "./types.js";
import { INTENTS_VERIFIER, TIDEPOOL_VERIFIER } from "./assets.js";

export function randomNonce(): string {
  return randomBytes(32).toString("base64");
}

export function makeDeadline(minutesFromNow = 30): string {
  return new Date(Date.now() + minutesFromNow * 60_000).toISOString();
}

/** Build the inner message object (before stringifying) */
export function buildIntentMessage(
  signerId: string,
  intents: IntentMessage["intents"],
  deadlineMinutes = 30
): IntentMessage {
  return {
    signer_id: signerId,
    deadline: makeDeadline(deadlineMinutes),
    intents,
  };
}

/** Transfer intent helper */
export function transferIntent(
  receiverId: string,
  tokens: Record<string, string>
): TransferIntent {
  return {
    intent: "transfer",
    receiver_id: receiverId,
    tokens,
  };
}

/**
 * Produce the exact payload structure expected by the Verifier.
 * The wallet / full-access key signs `payload.message` under NEP-413 rules
 * with recipient = verifier contract.
 */
export function buildNep413Payload(
  message: IntentMessage,
  verifier: string = INTENTS_VERIFIER,
  nonce?: string
): Nep413Payload {
  // Single-line, no extra whitespace — matches docs examples
  const messageStr = JSON.stringify(message);
  return {
    recipient: verifier,
    nonce: nonce ?? randomNonce(),
    message: messageStr,
  };
}

/**
 * Placeholder for the signed object shape.
 * Actual signing must be done by the user's wallet / full-access key
 * (near-api-js signMessage, or wallet selector NEP-413 support).
 * Never attempt to sign with a function-call key.
 */
export function unsignedNep413Envelope(
  payload: Nep413Payload
): Omit<SignedNep413, "public_key" | "signature"> {
  return {
    standard: "nep413",
    payload,
  };
}

/** Convenience: collateral lock transfer (writer → escrow / verifier internal) */
export function buildCollateralLockIntent(
  signerId: string,
  receiverId: string,
  assetId: string,
  amount: string,
  verifier: string = INTENTS_VERIFIER
): Nep413Payload {
  const msg = buildIntentMessage(signerId, [
    transferIntent(receiverId, { [assetId]: amount }),
  ]);
  return buildNep413Payload(msg, verifier);
}

/** Convenience: premium payment (buyer → writer) */
export function buildPremiumIntent(
  signerId: string,
  writerId: string,
  usdcAssetId: string,
  amount: string,
  verifier: string = INTENTS_VERIFIER
): Nep413Payload {
  const msg = buildIntentMessage(signerId, [
    transferIntent(writerId, { [usdcAssetId]: amount }),
  ]);
  return buildNep413Payload(msg, verifier);
}

/** Physical settlement helpers */
export function buildCallSettlementIntents(
  holderId: string,
  writerId: string,
  underlyingAssetId: string,
  usdcAssetId: string,
  underlyingQty: string,
  strikeAmount: string,
  verifier: string = INTENTS_VERIFIER
): { holderPayload: Nep413Payload; writerPayload: Nep413Payload } {
  // Holder pays strike USDC to writer; writer delivers underlying to holder
  const holderMsg = buildIntentMessage(holderId, [
    transferIntent(writerId, { [usdcAssetId]: strikeAmount }),
  ]);
  const writerMsg = buildIntentMessage(writerId, [
    transferIntent(holderId, { [underlyingAssetId]: underlyingQty }),
  ]);
  return {
    holderPayload: buildNep413Payload(holderMsg, verifier),
    writerPayload: buildNep413Payload(writerMsg, verifier),
  };
}

export function buildPutSettlementIntents(
  holderId: string,
  writerId: string,
  underlyingAssetId: string,
  usdcAssetId: string,
  underlyingQty: string,
  strikeAmount: string,
  verifier: string = INTENTS_VERIFIER
): { holderPayload: Nep413Payload; writerPayload: Nep413Payload } {
  // Holder delivers underlying to writer; writer pays strike USDC to holder
  const holderMsg = buildIntentMessage(holderId, [
    transferIntent(writerId, { [underlyingAssetId]: underlyingQty }),
  ]);
  const writerMsg = buildIntentMessage(writerId, [
    transferIntent(holderId, { [usdcAssetId]: strikeAmount }),
  ]);
  return {
    holderPayload: buildNep413Payload(holderMsg, verifier),
    writerPayload: buildNep413Payload(writerMsg, verifier),
  };
}

export { INTENTS_VERIFIER, TIDEPOOL_VERIFIER };
