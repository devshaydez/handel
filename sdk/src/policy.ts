/**
 * Policy service — validates AI proposals against on-chain agent limits
 * BEFORE any transaction is constructed. Contract still re-validates everything.
 */

import type { AgentPermission, AgentProposal, PolicyResult } from "./types.js";
import { isOndoUnderlying, USDC_ASSET_ID } from "./assets.js";

export function validateProposal(
  proposal: AgentProposal,
  permission: AgentPermission | null,
  opts: { nowNs?: bigint; requireAgent?: boolean } = {}
): PolicyResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const now = opts.nowNs ?? BigInt(Date.now()) * 1_000_000n;

  // Basic shape
  if (!proposal.proposalId) errors.push("missing proposalId");
  if (proposal.type !== "Call" && proposal.type !== "Put") {
    errors.push("type must be Call or Put");
  }
  if (!isOndoUnderlying(proposal.underlyingAssetId)) {
    errors.push(`underlying not a supported Ondo asset: ${proposal.underlyingAssetId}`);
  }

  const strike = safeBigInt(proposal.strike);
  const quantity = safeBigInt(proposal.quantity);
  const premium = safeBigInt(proposal.premium);
  const expiry = safeBigInt(proposal.expiryNs);

  if (strike === null || strike <= 0n) errors.push("strike must be positive integer string");
  if (quantity === null || quantity <= 0n) errors.push("quantity must be positive integer string");
  if (premium === null || premium <= 0n) errors.push("premium must be positive integer string");
  if (expiry === null) errors.push("expiryNs must be integer string");
  else if (expiry <= now) errors.push("expiry must be in the future");

  // Agent limits (if acting as agent)
  if (opts.requireAgent || permission) {
    if (!permission) {
      errors.push("agent permission required but not provided");
    } else {
      if (!permission.enabled) errors.push("agent is disabled / revoked");
      if (!permission.allowedAssets.includes(proposal.underlyingAssetId)) {
        errors.push("underlying not in agent's allowedAssets");
      }
      const maxQ = safeBigInt(permission.maxQuantity);
      const maxP = safeBigInt(permission.maxPremium);
      if (maxQ !== null && quantity !== null && quantity > maxQ) {
        errors.push(`quantity ${quantity} exceeds agent maxQuantity ${maxQ}`);
      }
      if (maxP !== null && premium !== null && premium > maxP) {
        errors.push(`premium ${premium} exceeds agent maxPremium ${maxP}`);
      }
      const minE = safeBigInt(permission.minExpiryNs);
      const maxE = safeBigInt(permission.maxExpiryNs);
      if (minE !== null && expiry !== null && expiry < minE) {
        errors.push("expiry before agent minExpiryNs");
      }
      if (maxE !== null && expiry !== null && expiry > maxE) {
        errors.push("expiry after agent maxExpiryNs");
      }
    }
  }

  // Soft warnings
  if (!proposal.dataFreshness) {
    warnings.push("dataFreshness missing — market data age unknown");
  } else {
    const fresh = Date.parse(proposal.dataFreshness);
    if (Number.isNaN(fresh)) warnings.push("dataFreshness not parseable ISO date");
    else if (Date.now() - fresh > 5 * 60 * 1000) {
      warnings.push("market data older than 5 minutes");
    }
  }

  if (!proposal.risks?.length) {
    warnings.push("no risks listed in proposal");
  }

  return { ok: errors.length === 0, errors, warnings };
}

function safeBigInt(s: string): bigint | null {
  try {
    if (!/^\d+$/.test(s)) return null;
    return BigInt(s);
  } catch {
    return null;
  }
}

/**
 * Required collateral for a position (mirrors contract view).
 * Call → full underlying quantity
 * Put  → strike amount (treated as total USDC locked for the lot in MVP)
 */
export function requiredCollateral(
  type: "Call" | "Put",
  quantity: string,
  strike: string
): { assetId: string; amount: string } {
  if (type === "Call") {
    return { assetId: "underlying", amount: quantity };
  }
  return { assetId: USDC_ASSET_ID, amount: strike };
}
