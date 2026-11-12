// Deterministic policy and risk engine. Runs independently of the AI.
// In production this logic lives on the backend; the UI only renders its result.
import { CONTRACT_SIZE } from './pricing';
import type { Check, CheckStatus, DataQuality, Policy, Side } from '../data/types';
import { usd0 } from './pricing';

export interface CheckInput {
  actor: 'user' | 'agent';
  sym: string;
  side: Side;
  strategy: string;
  qty: number;
  premium: number | null; // per share
  dte: number;
  quality: DataQuality;
  optionsSupported: boolean;
  pricingAgeMin: number;
  demoMode?: boolean;
}
export interface CheckCtx {
  policy: Policy;
  walletConnected: boolean;
  balance: number;
  locked: number;
  paused: boolean;
  revoked: boolean;
  mode: 'advisory' | 'approval' | 'auto';
}

const C = (id: string, label: string, status: CheckStatus, detail: string, owner: 'platform' | 'policy' = 'policy'): Check => ({ id, label, status, detail, owner });

export function runChecks(i: CheckInput, c: CheckCtx): Check[] {
  const p = c.policy;
  const cost = i.premium == null ? 0 : i.premium * CONTRACT_SIZE * i.qty;
  const available = c.balance - c.locked;
  const agent = i.actor === 'agent';
  const out: Check[] = [];

  out.push(
    c.walletConnected
      ? C('wallet', 'Wallet and network', 'pass', 'NEAR Testnet (demo) account connected.', 'platform')
      : C('wallet', 'Wallet and network', 'fail', 'No wallet connected. Connect a wallet to sign.', 'platform'),
  );
  out.push(
    i.optionsSupported
      ? C('instrument', 'Supported instrument', 'pass', `${i.sym} options are connected for execution.`, 'platform')
      : C('instrument', 'Supported instrument', 'fail', `${i.sym} options are not connected for execution.`, 'platform'),
  );
  out.push(
    i.strategy === 'Long call' || i.strategy === 'Long put'
      ? C('strategy', 'Supported strategy', 'pass', `${i.strategy} is implemented by the backend.`, 'platform')
      : C('strategy', 'Supported strategy', 'fail', `${i.strategy} is not implemented yet.`, 'platform'),
  );

  const simulated = i.quality === 'estimated';
  const pricingOk = i.quality === 'verified' || (i.demoMode === true && simulated) || (!p.requireVerified && i.quality === 'estimated');
  out.push(
    i.quality === 'unavailable' || i.premium == null
      ? C('pricing', 'Pricing evidence', 'fail', 'No pricing evidence for this contract.', 'platform')
      : simulated
        ? C('pricing', 'Pricing evidence', 'warn', 'Synthetic Testnet demo price. It is not a live market quote and is not suitable for real-money execution.', 'platform')
          : i.pricingAgeMin > p.maxPricingAgeMin
            ? C('pricing', 'Pricing evidence', 'fail', `Quote is ${i.pricingAgeMin} min old. Maximum allowed is ${p.maxPricingAgeMin} min.`, 'platform')
            : C('pricing', 'Pricing evidence', pricingOk ? 'pass' : 'warn', `Verified quote, ${i.pricingAgeMin} min old.`, 'platform'),
  );

  out.push(
    cost <= available
      ? C('collateral', 'Collateral', 'pass', `${usd0(cost)} needed, ${usd0(available)} available.`, 'platform')
      : C('collateral', 'Collateral', 'fail', `${usd0(cost)} needed, only ${usd0(available)} available.`, 'platform'),
  );

  const exposureAfter = ((c.locked + cost) / Math.max(c.balance, 1)) * 100;
  const cap = agent ? p.maxExposurePct : 100;
  out.push(
    exposureAfter <= cap
      ? C('exposure', agent ? 'Exposure limit' : 'Capital at risk', 'pass', `${exposureAfter.toFixed(1)}% of balance at risk after this trade (limit ${cap}%).`, agent ? 'policy' : 'platform')
      : C('exposure', agent ? 'Exposure limit' : 'Capital at risk', 'fail', `${exposureAfter.toFixed(1)}% at risk after this trade, above the ${cap}% limit.`, agent ? 'policy' : 'platform'),
  );

  if (agent) {
    out.push(
      p.assets.includes(i.sym)
        ? C('asset', 'Allowed assets', 'pass', `${i.sym} is on your allowlist.`)
        : C('asset', 'Allowed assets', 'fail', `${i.sym} is not on your agent allowlist.`),
    );
    const sideOk = p.sides.includes(i.side) && p.strategies.includes(i.strategy);
    out.push(
      sideOk
        ? C('type', 'Allowed strategies', 'pass', `${i.strategy} is permitted.`)
        : C('type', 'Allowed strategies', 'fail', `${i.strategy} is not permitted by your policy.`),
    );
    out.push(
      i.qty <= p.maxContracts
        ? C('size', 'Position size', 'pass', `${i.qty} contract${i.qty > 1 ? 's' : ''} (limit ${p.maxContracts}).`)
        : C('size', 'Position size', 'fail', `${i.qty} contracts exceeds the limit of ${p.maxContracts}.`),
    );
    out.push(
      cost <= p.maxPremiumUsd
        ? C('premium', 'Premium limit', 'pass', `${usd0(cost)} total premium (limit ${usd0(p.maxPremiumUsd)}).`)
        : C('premium', 'Premium limit', 'fail', `${usd0(cost)} total premium exceeds your ${usd0(p.maxPremiumUsd)} limit.`),
    );
    out.push(
      i.dte >= p.expiryMinDays && i.dte <= p.expiryMaxDays
        ? C('expiry', 'Expiry range', 'pass', `${i.dte} days to expiry (allowed ${p.expiryMinDays}–${p.expiryMaxDays}).`)
        : C('expiry', 'Expiry range', 'fail', `${i.dte} days to expiry is outside ${p.expiryMinDays}–${p.expiryMaxDays}.`),
    );
    if (c.paused) out.push(C('agent', 'Agent status', 'fail', 'Agent is paused.'));
    if (c.revoked) out.push(C('auth', 'Authorization', 'fail', 'Agent access has been revoked.'));
  }
  return out;
}

export function overall(checks: Check[]): 'pass' | 'warn' | 'fail' {
  if (checks.some((c) => c.status === 'fail')) return 'fail';
  if (checks.some((c) => c.status === 'warn')) return 'warn';
  return 'pass';
}
