/** Shared types for Handel off-chain SDK; values mirror src/lib.rs. */

export type OptionType = "Call" | "Put";

export type PositionStatus =
  | "PendingCollateral"
  | "PendingCollateralReconciliation"
  | "CollateralLocked"
  | "PendingPremium"
  | "Open"
  | "PendingSettlement"
  | "Settled"
  | "PendingExpiry"
  | "Expired"
  | "Cancelled"
  | "ReconciliationRequired";

export type OperationStatus =
  | "Pending"
  | "Succeeded"
  | "Failed"
  | "ReconciliationRequired";

export interface AssetInfo {
  assetId: string;
  symbol: string;
  decimals: number;
  enabled: boolean;
}

/** Structured proposal produced by a deterministic fallback or AI provider. */
export interface AgentProposal {
  proposalId: string;
  type: OptionType;
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
}

/** Off-chain mirror of the on-chain agent policy. */
export interface AgentPermission {
  agent: string;
  owner: string;
  allowedAssets: string[];
  maxQuantity: string;
  maxPremium: string;
  /** Required for Put proposals; mirrors AgentPolicy.max_collateral_usdc. */
  maxCollateralUsdc?: string;
  maxOpenPositions: number;
  minExpiryNs: string;
  maxExpiryNs: string;
  enabled: boolean;
}

export interface PolicyResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export interface Nep413Payload {
  recipient: string;
  nonce: string;
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
  deadline: string;
  intents: Array<TransferIntent | Record<string, unknown>>;
}
