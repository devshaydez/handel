/**
 * Stable application boundary for a manually-built Handel frontend.
 * No UI, wallet implementation, RPC transport, indexer, or persistence lives here.
 * All chain amounts and identifiers remain decimal strings; never coerce u64/u128 to JS number.
 */
import type { OptionType } from "./types.js";

export type PositionState = "PendingCollateral" | "PendingCollateralReconciliation" | "CollateralLocked" | "PendingPremium" | "Open" | "PendingSettlement" | "Settled" | "PendingExpiry" | "Expired" | "Cancelled" | "ReconciliationRequired";
export type OperationKind = "LockCollateral" | "PayPremium" | "ExercisePayment" | "ExerciseDelivery" | "ExpiryRelease";
export type OperationState = "Pending" | "Succeeded" | "Failed" | "ReconciliationRequired";
export type ProposalState = "PendingApproval" | "Approved" | "Rejected";
export type ContractAgentExecutionMode = "Education" | "Advisory" | "ManualApproval" | "Delegated";
export type SettlementEvidenceStatus = "verified" | "not_verified" | "unknown";

export interface PositionView {
  id: string; kind: OptionType; writer: string; holder: string; assetId: string;
  underlyingAmount: string; strikeAmountUsdc: string; expiryNs: string; premiumAmountUsdc: string;
  state: PositionState; collateralOperationId: string | null; premiumOperationId: string | null;
  exercisePaymentOperationId: string | null; exerciseDeliveryOperationId: string | null;
  expiryReleaseOperationId: string | null; escrowPositionId: string | null;
  escrowRegistrationPending: boolean; settlementEvidence: SettlementEvidenceStatus;
}
export interface OperationView {
  id: string; positionId: string; kind: OperationKind; state: OperationState;
  requestedAssetId: string; requestedAmount: string; expectedSender: string;
  expectedReceiver: string; externalReference: string | null;
}
export interface AgentPolicyView {
  principal: string; agentId: string; allowedAssets: string[]; maxUnderlyingAmount: string;
  maxPremiumUsdc: string; maxCollateralUsdc: string; maxOpenPositions: number;
  expiresAtNs: string; enabled: boolean; executionMode: ContractAgentExecutionMode;
}
export interface AgentProposalView {
  proposalId: string; positionId: string; principal: string; agentId: string;
  kind: OptionType; assetId: string; underlyingAmount: string; strikeAmountUsdc: string;
  expiryNs: string; premiumAmountUsdc: string; rationaleHash: string; state: ProposalState;
}
export interface AssetBalanceView {
  assetId: string;
  /** Raw smallest-unit balance. Never convert to JavaScript number. */
  amount: string;
  /** Token metadata supplied by the same trusted asset registry as assetId. */
  decimals: number;
  observedAt: string;
  blockHeight: number;
  source: "ft_balance_of" | "indexer";
}
export interface PortfolioSnapshot {
  accountId: string; balances: AssetBalanceView[]; positions: PositionView[]; operations: OperationView[];
  source: "rpc" | "indexer" | "combined"; observedAt: string; blockHeight: number; complete: boolean;
}
export interface SubmittedTransaction {
  transactionHash: string; signerAccountId: string; submittedAt: string; status: "submitted";
}
export type FinalityResult =
  | { status: "final_success"; transactionHash: string; receiptIds: string[] }
  | { status: "final_failure"; transactionHash: string; failureCode: string }
  | { status: "unknown"; transactionHash: string };
export interface CreateOfferInput {
  principal: string; holder: string; kind: OptionType; assetId: string;
  underlyingAmount: string; strikeAmountUsdc: string; expiryNs: string; premiumAmountUsdc: string;
}
export interface AgentPolicyUpdate {
  principal: string; agentId: string; allowedAssets: string[];
  maxUnderlyingAmount: string; maxPremiumUsdc: string; maxCollateralUsdc: string;
  maxOpenPositions: number; expiresAtNs: string;
}
export interface ProposalRequest extends CreateOfferInput { agentId: string; rationaleHash: string; }

export interface HandelFrontendPort {
  getPortfolio(accountId: string): Promise<PortfolioSnapshot>;
  getPosition(positionId: string): Promise<PositionView | null>;
  getOperation(operationId: string): Promise<OperationView | null>;
  getAgentPolicy(principal: string, agentId: string): Promise<AgentPolicyView | null>;
  getAgentProposal(proposalId: string): Promise<AgentProposalView | null>;
  createOffer(input: CreateOfferInput): Promise<SubmittedTransaction>;
  setAgentPolicy(input: AgentPolicyUpdate): Promise<SubmittedTransaction>;
  setAgentExecutionMode(input: { principal: string; agentId: string; mode: ContractAgentExecutionMode }): Promise<SubmittedTransaction>;
  revokeAgent(input: { principal: string; agentId: string }): Promise<SubmittedTransaction>;
  createAgentProposal(input: ProposalRequest): Promise<SubmittedTransaction>;
  approveAgentProposal(input: { principal: string; proposalId: string }): Promise<SubmittedTransaction>;
  rejectAgentProposal(input: { principal: string; proposalId: string }): Promise<SubmittedTransaction>;
  exercisePosition(input: { principal: string; positionId: string }): Promise<SubmittedTransaction>;
  requestExpiryRelease(input: { principal: string; positionId: string }): Promise<SubmittedTransaction>;
  getFinality(transactionHash: string, signerAccountId: string): Promise<FinalityResult>;
}
const ACCOUNT_ID = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const UINT = /^(0|[1-9][0-9]*)$/;
const MAX_U128 = (1n << 128n) - 1n;
const MAX_U64 = (1n << 64n) - 1n;
export class HandelFrontendContractError extends Error {
  constructor(message: string, readonly code: string) { super(message); this.name = "HandelFrontendContractError"; }
}
function account(value: string, field: string): void {
  if (typeof value !== "string" || value.length < 2 || value.length > 64 || !ACCOUNT_ID.test(value))
    throw new HandelFrontendContractError(field + " is not a valid NEAR account ID", "INVALID_ACCOUNT");
}
function uint(value: string, field: string, max: bigint): void {
  if (typeof value !== "string" || !UINT.test(value) || value.length > 39 || BigInt(value) > max)
    throw new HandelFrontendContractError(field + " must be a canonical bounded integer string", "INVALID_INTEGER");
}
function submitted(result: SubmittedTransaction, principal: string): SubmittedTransaction {
  if (!result || result.status !== "submitted" || !result.transactionHash?.trim() ||
      result.signerAccountId !== principal || !Number.isFinite(Date.parse(result.submittedAt)))
    throw new HandelFrontendContractError("wallet adapter returned an invalid submission receipt", "INVALID_SUBMISSION");
  return { ...result };
}

/** Small typed boundary intended to be consumed by a custom frontend. */
export class HandelFrontendClient {
  constructor(private readonly port: HandelFrontendPort) {}
  async position(positionId: string): Promise<PositionView | null> {
    uint(positionId, "positionId", MAX_U64);
    const value = await this.port.getPosition(positionId);
    if (value !== null && value.id !== positionId)
      throw new HandelFrontendContractError("position adapter returned a different position", "POSITION_MISMATCH");
    return value === null ? null : structuredClone(value);
  }
  async operation(operationId: string): Promise<OperationView | null> {
    if (!operationId?.trim()) throw new HandelFrontendContractError("operationId is required", "INVALID_OPERATION_ID");
    const value = await this.port.getOperation(operationId);
    if (value !== null && value.id !== operationId)
      throw new HandelFrontendContractError("operation adapter returned a different operation", "OPERATION_MISMATCH");
    return value === null ? null : structuredClone(value);
  }
  async agentPolicy(principal: string, agentId: string): Promise<AgentPolicyView | null> {
    account(principal, "principal"); account(agentId, "agentId");
    const value = await this.port.getAgentPolicy(principal, agentId);
    if (value !== null && (value.principal !== principal || value.agentId !== agentId))
      throw new HandelFrontendContractError("agent policy belongs to a different principal or agent", "PRINCIPAL_MISMATCH");
    return value === null ? null : structuredClone(value);
  }
  async agentProposal(proposalId: string): Promise<AgentProposalView | null> {
    if (!proposalId?.trim()) throw new HandelFrontendContractError("proposalId is required", "INVALID_PROPOSAL_ID");
    const value = await this.port.getAgentProposal(proposalId);
    if (value !== null && value.proposalId !== proposalId)
      throw new HandelFrontendContractError("proposal adapter returned a different proposal", "PROPOSAL_MISMATCH");
    return value === null ? null : structuredClone(value);
  }
  async portfolio(accountId: string): Promise<PortfolioSnapshot> {
    account(accountId, "accountId");
    const s = await this.port.getPortfolio(accountId);
    if (s.accountId !== accountId || !Number.isSafeInteger(s.blockHeight) || s.blockHeight < 0 ||
        !Number.isFinite(Date.parse(s.observedAt)) || !["rpc", "indexer", "combined"].includes(s.source) ||
        typeof s.complete !== "boolean" || !Array.isArray(s.balances) || !Array.isArray(s.positions) || !Array.isArray(s.operations) ||
        s.balances.some(b => !b || typeof b.assetId !== "string" || !b.assetId.trim() ||
          typeof b.amount !== "string" || !UINT.test(b.amount) || b.amount.length > 39 || BigInt(b.amount) > MAX_U128 ||
          !Number.isSafeInteger(b.decimals) || b.decimals < 0 || b.decimals > 255 ||
          !Number.isFinite(Date.parse(b.observedAt)) || !Number.isSafeInteger(b.blockHeight) || b.blockHeight < 0 ||
          !["ft_balance_of", "indexer"].includes(b.source)))
      throw new HandelFrontendContractError("portfolio adapter returned an invalid or mismatched snapshot", "INVALID_PORTFOLIO");
    return structuredClone(s);
  }
  async createOffer(i: CreateOfferInput): Promise<SubmittedTransaction> {
    account(i.principal, "principal"); account(i.holder, "holder");
    if (i.kind !== "Call" && i.kind !== "Put") throw new HandelFrontendContractError("option kind must be Call or Put", "INVALID_KIND");
    if (!i.assetId?.trim()) throw new HandelFrontendContractError("assetId is required", "INVALID_ASSET");
    uint(i.underlyingAmount, "underlyingAmount", MAX_U128); uint(i.strikeAmountUsdc, "strikeAmountUsdc", MAX_U128);
    uint(i.expiryNs, "expiryNs", MAX_U64); uint(i.premiumAmountUsdc, "premiumAmountUsdc", MAX_U128);
    if ([i.underlyingAmount, i.strikeAmountUsdc, i.premiumAmountUsdc].some(v => BigInt(v) === 0n))
      throw new HandelFrontendContractError("amounts must be positive", "ZERO_AMOUNT");
    return submitted(await this.port.createOffer({ ...i }), i.principal);
  }
  async updateAgentPolicy(i: AgentPolicyUpdate): Promise<SubmittedTransaction> {
    account(i.principal, "principal"); account(i.agentId, "agentId");
    if (!Array.isArray(i.allowedAssets) || !i.allowedAssets.length ||
        i.allowedAssets.some(v => typeof v !== "string" || !v.trim()) || new Set(i.allowedAssets).size !== i.allowedAssets.length)
      throw new HandelFrontendContractError("allowedAssets must be non-empty and unique", "INVALID_ALLOWLIST");
    uint(i.maxUnderlyingAmount, "maxUnderlyingAmount", MAX_U128);
    uint(i.maxPremiumUsdc, "maxPremiumUsdc", MAX_U128);
    uint(i.maxCollateralUsdc, "maxCollateralUsdc", MAX_U128);
    uint(i.expiresAtNs, "expiresAtNs", MAX_U64);
    if (!Number.isSafeInteger(i.maxOpenPositions) || i.maxOpenPositions < 1 || i.maxOpenPositions > 1000)
      throw new HandelFrontendContractError("maxOpenPositions must be between 1 and 1000", "INVALID_POSITION_CAP");
    return submitted(await this.port.setAgentPolicy({ ...i, allowedAssets: [...i.allowedAssets] }), i.principal);
  }
  async setAgentMode(principal: string, agentId: string, mode: ContractAgentExecutionMode): Promise<SubmittedTransaction> {
    account(principal, "principal"); account(agentId, "agentId");
    if (!["Education", "Advisory", "ManualApproval", "Delegated"].includes(mode))
      throw new HandelFrontendContractError("invalid agent execution mode", "INVALID_EXECUTION_MODE");
    return submitted(await this.port.setAgentExecutionMode({ principal, agentId, mode }), principal);
  }
  async revokeAgent(principal: string, agentId: string): Promise<SubmittedTransaction> {
    account(principal, "principal"); account(agentId, "agentId");
    return submitted(await this.port.revokeAgent({ principal, agentId }), principal);
  }
  async createProposal(i: ProposalRequest): Promise<SubmittedTransaction> {
    account(i.principal, "principal"); account(i.agentId, "agentId"); account(i.holder, "holder");
    if (i.kind !== "Call" && i.kind !== "Put") throw new HandelFrontendContractError("option kind must be Call or Put", "INVALID_KIND");
    if (!i.assetId?.trim() || !i.rationaleHash?.trim()) throw new HandelFrontendContractError("assetId and rationaleHash are required", "INVALID_PROPOSAL");
    uint(i.underlyingAmount, "underlyingAmount", MAX_U128); uint(i.strikeAmountUsdc, "strikeAmountUsdc", MAX_U128);
    uint(i.expiryNs, "expiryNs", MAX_U64); uint(i.premiumAmountUsdc, "premiumAmountUsdc", MAX_U128);
    return submitted(await this.port.createAgentProposal({ ...i }), i.agentId);
  }
  async approveProposal(principal: string, proposalId: string): Promise<SubmittedTransaction> {
    account(principal, "principal"); if (!proposalId?.trim()) throw new HandelFrontendContractError("proposalId is required", "INVALID_PROPOSAL_ID");
    return submitted(await this.port.approveAgentProposal({ principal, proposalId }), principal);
  }
  async rejectProposal(principal: string, proposalId: string): Promise<SubmittedTransaction> {
    account(principal, "principal"); if (!proposalId?.trim()) throw new HandelFrontendContractError("proposalId is required", "INVALID_PROPOSAL_ID");
    return submitted(await this.port.rejectAgentProposal({ principal, proposalId }), principal);
  }
  async exercise(principal: string, positionId: string): Promise<SubmittedTransaction> {
    account(principal, "principal"); uint(positionId, "positionId", MAX_U64);
    return submitted(await this.port.exercisePosition({ principal, positionId }), principal);
  }
  async requestExpiry(principal: string, positionId: string): Promise<SubmittedTransaction> {
    account(principal, "principal"); uint(positionId, "positionId", MAX_U64);
    return submitted(await this.port.requestExpiryRelease({ principal, positionId }), principal);
  }
  async finality(transactionHash: string, signerAccountId: string): Promise<FinalityResult> {
    if (!transactionHash?.trim()) throw new HandelFrontendContractError("transactionHash is required", "INVALID_TRANSACTION");
    account(signerAccountId, "signerAccountId");
    const r = await this.port.getFinality(transactionHash, signerAccountId);
    if (!r || r.transactionHash !== transactionHash || !["final_success", "final_failure", "unknown"].includes(r.status))
      throw new HandelFrontendContractError("finality adapter returned an invalid result", "INVALID_FINALITY");
    if (r.status === "final_success" && !Array.isArray(r.receiptIds))
      throw new HandelFrontendContractError("finality result omitted receipt IDs", "INVALID_FINALITY");
    if (r.status === "final_failure" && !r.failureCode?.trim())
      throw new HandelFrontendContractError("final failure omitted failure code", "INVALID_FINALITY");
    return structuredClone(r);
  }
}
