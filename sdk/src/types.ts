/** Shared types for Handel off-chain SDK */

export type OptionType = "Call" | "Put";

export type PositionStatus =
  | "Created"
  | "CollateralLocked"
  | "Open"
  | "PendingSettlement"
  | "Settled"
  | "Expired"
  | "Cancelled";

export interface AssetInfo {
  assetId: string;
  symbol: string;
  decimals: number;
  enabled: boolean;
}

/** Structured proposal produced by the AI agent (never trusted on-chain) */
export interface AgentProposal {
  proposalId: string;
  type: OptionType;
  underlyingAssetId: string;
  strike: string; // integer string (settlement units)
  quantity: string; // integer string (underlying units)
  premium: string; // integer string (settlement units)
  expiryNs: string;
  estimatedPayoff: string;
  risks: string[];
  dataFreshness: string; // ISO timestamp of market data used
  rationale: string;
  createdAt: string;
}

/** On-chain agent permission mirror */
export interface AgentPermission {
  agent: string;
  owner: string;
  allowedAssets: string[];
  maxQuantity: string;
  maxPremium: string;
  maxOpenPositions: number;
  minExpiryNs: string;
  maxExpiryNs: string;
  enabled: boolean;
}

/** Result of policy validation before any on-chain call */
export interface PolicyResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/** NEP-413 payload structure (message field is stringified JSON) */
export interface Nep413Payload {
  recipient: string;
  nonce: string; // base64 32 bytes
  message: string;
}

export interface SignedNep413 {
  standard: "nep413";
  payload: Nep413Payload;
  public_key: string;
  signature: string;
}

export interface TransferIntent {
  intent: "transfer";
  receiver_id: string;
  tokens: Record<string, string>;
}

export interface IntentMessage {
  signer_id: string;
  deadline: string; // ISO 8601
  intents: Array<TransferIntent | Record<string, unknown>>;
}
