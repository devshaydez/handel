/** Off-chain preflight; the contract remains the authoritative policy check. */
import type { AgentPermission, AgentProposal, PolicyResult } from "./types.js";
import { isOndoUnderlying, USDC_ASSET_ID } from "./assets.js";

const MAX = (1n << 256n) - 1n;
const UINT = /^(0|[1-9][0-9]*)$/;
const ACCOUNT = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

export function validateProposal(
  p: AgentProposal,
  permission: AgentPermission | null,
  opts: { nowNs?: bigint; requireAgent?: boolean; requireFreshMarketData?: boolean; maxDataAgeMs?: number } = {},
): PolicyResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const nowNs = opts.nowNs ?? BigInt(Date.now()) * 1_000_000n;
  const nowMs = Number(nowNs / 1_000_000n);
  const strict = opts.requireFreshMarketData === true;

  if (!p || typeof p !== "object") return { ok: false, errors: ["proposal must be an object"], warnings };
  if (typeof p.proposalId !== "string" || !p.proposalId.trim() || p.proposalId.length > 128) errors.push("proposalId is missing or invalid");
  if (p.type !== "Call" && p.type !== "Put") errors.push("type must be Call or Put");
  if (typeof p.underlyingAssetId !== "string" || !p.underlyingAssetId.trim() || p.underlyingAssetId.length > 256) {
    errors.push("underlyingAssetId is missing or invalid");
  } else if (!permission && !isOndoUnderlying(p.underlyingAssetId)) {
    // Provider-level schema validation has no permission context. The contract
    // and the subsequent permission-bound runtime remain authoritative.
    warnings.push("asset is outside the curated Ondo registry; require an explicit on-chain allowlist before submission");
  }

  const strike = big(p.strike), quantity = big(p.quantity), premium = big(p.premium), expiry = big(p.expiryNs);
  if (strike === null || strike === 0n) errors.push("strike must be a positive canonical uint256 integer string");
  if (quantity === null || quantity === 0n) errors.push("quantity must be a positive canonical uint256 integer string");
  if (premium === null || premium === 0n) errors.push("premium must be a positive canonical uint256 integer string");
  if (expiry === null) errors.push("expiryNs must be a canonical uint256 integer string");
  else if (expiry <= nowNs) errors.push("expiry must be in the future");

  if (typeof p.estimatedPayoff !== "string" || !p.estimatedPayoff.trim() || p.estimatedPayoff.length > 512) {
    errors.push("estimatedPayoff is missing or invalid");
  }
  if (typeof p.rationale !== "string" || !p.rationale.trim() || p.rationale.length > 4096) {
    errors.push("rationale is missing or invalid");
  }
  const createdAt = typeof p.createdAt === "string" ? Date.parse(p.createdAt) : Number.NaN;
  if (!Number.isFinite(createdAt)) errors.push("createdAt must be a valid timestamp");
  else if (createdAt > nowMs + 30_000) errors.push("createdAt cannot be in the future");
  else if (strict && nowMs - createdAt > (opts.maxDataAgeMs ?? 300_000)) errors.push("proposal is stale");

  if (strict) {
    if (!Array.isArray(p.risks) || p.risks.length === 0 || p.risks.length > 20 ||
        p.risks.some((risk) => typeof risk !== "string" || !risk.trim() || risk.length > 500)) {
      errors.push("proposal must contain 1–20 valid risk descriptions");
    }
  } else if (!Array.isArray(p.risks) || p.risks.length === 0) {
    warnings.push("no risks listed in proposal");
  } else if (p.risks.length > 20 || p.risks.some((risk) => typeof risk !== "string" || !risk.trim() || risk.length > 500)) {
    errors.push("proposal risk descriptions are invalid");
  }

  if (typeof p.dataFreshness !== "string" || !p.dataFreshness) {
    if (strict) errors.push("dataFreshness is required for trading");
    else warnings.push("dataFreshness missing — market data age unknown");
  } else {
    const observedAt = Date.parse(p.dataFreshness);
    const maxAge = opts.maxDataAgeMs ?? 300_000;
    if (!Number.isFinite(observedAt)) {
      if (strict) errors.push("dataFreshness must be a valid timestamp");
      else warnings.push("dataFreshness not parseable ISO date");
    } else if (observedAt > nowMs + 30_000) {
      errors.push("dataFreshness cannot be in the future");
    } else if (nowMs - observedAt > maxAge) {
      if (strict) errors.push("market data older than configured maximum age");
      else warnings.push("market data older than 5 minutes");
    }
  }

  if (opts.requireAgent || permission) {
    if (!permission) errors.push("agent permission required but not provided");
    else {
      if (typeof permission.agent !== "string" || permission.agent.length > 64 || !ACCOUNT.test(permission.agent)) errors.push("agent account ID is invalid");
      if (typeof permission.owner !== "string" || permission.owner.length > 64 || !ACCOUNT.test(permission.owner)) errors.push("agent owner account ID is invalid");
      if (!permission.enabled) errors.push("agent is disabled / revoked");
      if (!Array.isArray(permission.allowedAssets) || !permission.allowedAssets.length ||
          new Set(permission.allowedAssets).size !== permission.allowedAssets.length ||
          !permission.allowedAssets.includes(p.underlyingAssetId)) errors.push("underlying is not in a valid, unique agent allowlist");
      if (!Number.isSafeInteger(permission.maxOpenPositions) || permission.maxOpenPositions <= 0) errors.push("agent maxOpenPositions is invalid");
      const mq = big(permission.maxQuantity), mp = big(permission.maxPremium), mn = big(permission.minExpiryNs), mx = big(permission.maxExpiryNs);
      if (mq === null || mp === null || mn === null || mx === null || mn > mx) errors.push("agent limits are invalid");
      if (mq !== null && quantity !== null && quantity > mq) errors.push("quantity exceeds agent maxQuantity");
      if (mp !== null && premium !== null && premium > mp) errors.push("premium exceeds agent maxPremium");
      if (mn !== null && expiry !== null && expiry < mn) errors.push("expiry before agent minExpiryNs");
      if (mx !== null && expiry !== null && expiry > mx) errors.push("expiry after agent maxExpiryNs");
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

function big(value: unknown): bigint | null {
  if (typeof value !== "string" || value.length > 78 || !UINT.test(value)) return null;
  try { const n = BigInt(value); return n <= MAX ? n : null; } catch { return null; }
}

export function requiredCollateral(type: "Call" | "Put", quantity: string, strike: string): { assetId: string; amount: string } {
  return type === "Call" ? { assetId: "underlying", amount: quantity } : { assetId: USDC_ASSET_ID, amount: strike };
}
