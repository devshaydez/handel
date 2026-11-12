import { assetBySym, dteOf, makeContract } from '../data/mock';
import type { DataQuality, FeedState, Position } from '../data/types';
import { CONTRACT_SIZE } from './pricing';

export interface Mark {
  mark: number | null;
  quality: DataQuality;
  value: number;
  cost: number;
  pnl: number;
  pnlPct: number;
  intrinsic: number;
  itm: boolean;
  delta: number;
  valued: boolean;
}

export function markPosition(p: Position, feed: FeedState): Mark {
  const a = assetBySym(p.sym)!;
  const cost = p.entryPremium * CONTRACT_SIZE * p.qty;
  const intrinsic = p.side === 'call' ? Math.max(a.price - p.strike, 0) : Math.max(p.strike - a.price, 0);
  const itm = intrinsic > 0;
  if (p.status === 'closed') {
    const v = (p.exitPremium ?? 0) * CONTRACT_SIZE * p.qty;
    const pnl = p.realized ?? v - cost;
    return { mark: p.exitPremium ?? 0, quality: 'verified', value: v, cost, pnl, pnlPct: (pnl / cost) * 100, intrinsic, itm, delta: 0, valued: true };
  }
  if (p.status === 'pending' || p.status === 'unresolved' || p.status === 'failed') {
    return { mark: null, quality: 'unavailable', value: 0, cost, pnl: 0, pnlPct: 0, intrinsic, itm, delta: 0, valued: false };
  }
  const dte = dteOf(p.expiry);
  if (dte <= 0) {
    const v = intrinsic * CONTRACT_SIZE * p.qty;
    return { mark: intrinsic, quality: 'verified', value: v, cost, pnl: v - cost, pnlPct: ((v - cost) / cost) * 100, intrinsic, itm, delta: 0, valued: true };
  }
  const c = makeContract(p.sym, p.expiry, p.side, p.strike, feed);
  if (c.mid == null) {
    return { mark: null, quality: 'unavailable', value: 0, cost, pnl: 0, pnlPct: 0, intrinsic, itm, delta: c.delta, valued: false };
  }
  const v = c.mid * CONTRACT_SIZE * p.qty;
  return { mark: c.mid, quality: c.quality, value: v, cost, pnl: v - cost, pnlPct: ((v - cost) / cost) * 100, intrinsic, itm, delta: c.delta, valued: true };
}
