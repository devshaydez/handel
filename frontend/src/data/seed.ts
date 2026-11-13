import { assetBySym, DEFAULT_POLICY, isoAgo, MIN, DAY } from './mock';
import { buildProposal } from '../lib/proposals';
import { runChecks } from '../lib/policy';
import type { Activity, ChatMsg, Check, Notice, Position, Proposal, Tx } from './types';

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function mockHash(seed: number) {
  let s = seed * 9301 + 49297;
  let out = '';
  for (let i = 0; i < 44; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    out += B58[s % B58.length];
  }
  return out;
}
export const shortHash = (h: string) => `${h.slice(0, 6)}…${h.slice(-5)}`;

const H = (n: number) => mockHash(n);

export function seedPositions(): Position[] {
  const P = (p: Partial<Position> & Pick<Position, 'id' | 'sym' | 'side' | 'strike' | 'expiry' | 'qty' | 'entryPremium' | 'status' | 'openedAt'>): Position => ({
    contractId: `${p.sym}-${p.expiry.replace(/-/g, '')}-${p.side === 'call' ? 'C' : 'P'}-${p.strike}`,
    source: 'manual',
    txHashes: [],
    ...p,
  });
  return [
    P({ id: 'P-1042', sym: 'NVDA', side: 'call', strike: 190, expiry: '2026-12-18', qty: 2, entryPremium: 6.8, status: 'open', openedAt: isoAgo(9 * DAY), source: 'ai-approved', proposalId: 'PR-288', txHashes: [H(1042)] }),
    P({ id: 'P-1043', sym: 'AAPL', side: 'put', strike: 225, expiry: '2026-11-13', qty: 1, entryPremium: 2.1, status: 'open', openedAt: isoAgo(12 * DAY), txHashes: [H(1043)] }),
    P({ id: 'P-1044', sym: 'TSLA', side: 'call', strike: 330, expiry: '2026-12-04', qty: 1, entryPremium: 14.2, status: 'open', openedAt: isoAgo(20 * DAY), txHashes: [H(1044)] }),
    P({ id: 'P-1031', sym: 'MSFT', side: 'call', strike: 480, expiry: '2026-11-06', qty: 1, entryPremium: 11.5, status: 'expired', openedAt: isoAgo(30 * DAY), txHashes: [H(1031)] }),
    P({ id: 'P-1045', sym: 'AMZN', side: 'put', strike: 215, expiry: '2026-12-18', qty: 2, entryPremium: 6.1, status: 'unresolved', openedAt: isoAgo(3 * 60 * MIN), source: 'ai-approved', proposalId: 'PR-300', txHashes: [H(1045)] }),
    P({ id: 'P-1033', sym: 'AAPL', side: 'call', strike: 235, expiry: '2026-11-06', qty: 1, entryPremium: 3.2, status: 'closed', closeReason: 'closed', exitPremium: 5.0, realized: 180, openedAt: isoAgo(21 * DAY), closedAt: '2026-11-05T14:10:00Z', txHashes: [H(1033), H(10331)] }),
    P({ id: 'P-1019', sym: 'META', side: 'put', strike: 600, expiry: '2026-10-23', qty: 1, entryPremium: 9.4, status: 'closed', closeReason: 'exercised', exitPremium: 17.8, realized: 840, openedAt: isoAgo(44 * DAY), closedAt: '2026-10-22T15:30:00Z', txHashes: [H(1019), H(10191)] }),
    P({ id: 'P-1012', sym: 'AMZN', side: 'call', strike: 220, expiry: '2026-10-16', qty: 2, entryPremium: 5.2, status: 'closed', closeReason: 'closed', exitPremium: 9.9, realized: 940, openedAt: isoAgo(52 * DAY), closedAt: '2026-10-12T13:05:00Z', txHashes: [H(1012), H(10121)] }),
    P({ id: 'P-1008', sym: 'NVDA', side: 'put', strike: 170, expiry: '2026-10-09', qty: 2, entryPremium: 3.3, status: 'closed', closeReason: 'expired worthless', exitPremium: 0, realized: -660, openedAt: isoAgo(58 * DAY), closedAt: '2026-10-10T09:00:00Z', txHashes: [H(1008), H(10081)] }),
    P({ id: 'P-1004', sym: 'TSLA', side: 'call', strike: 340, expiry: '2026-09-25', qty: 1, entryPremium: 12.5, status: 'closed', closeReason: 'closed', exitPremium: 8.1, realized: -440, openedAt: isoAgo(70 * DAY), closedAt: '2026-09-21T16:20:00Z', txHashes: [H(1004), H(10041)] }),
    P({ id: 'P-0999', sym: 'MSFT', side: 'call', strike: 470, expiry: '2026-09-18', qty: 1, entryPremium: 7.9, status: 'closed', closeReason: 'exercised', exitPremium: 14.4, realized: 650, openedAt: isoAgo(78 * DAY), closedAt: '2026-09-17T14:40:00Z', txHashes: [H(999), H(9991)] }),
    P({ id: 'P-0961', sym: 'AAPL', side: 'call', strike: 225, expiry: '2026-08-21', qty: 1, entryPremium: 4.1, status: 'closed', closeReason: 'closed', exitPremium: 7.2, realized: 310, openedAt: isoAgo(95 * DAY), closedAt: '2026-08-14T13:00:00Z', txHashes: [H(961), H(9611)] }),
    P({ id: 'P-0944', sym: 'AMZN', side: 'put', strike: 210, expiry: '2026-07-17', qty: 1, entryPremium: 4.8, status: 'closed', closeReason: 'closed', exitPremium: 2.6, realized: -220, openedAt: isoAgo(120 * DAY), closedAt: '2026-07-10T15:00:00Z', txHashes: [H(944), H(9441)] }),
    P({ id: 'P-0921', sym: 'NVDA', side: 'call', strike: 160, expiry: '2026-06-18', qty: 2, entryPremium: 5.4, status: 'closed', closeReason: 'exercised', exitPremium: 11.3, realized: 1180, openedAt: isoAgo(150 * DAY), closedAt: '2026-06-17T14:00:00Z', txHashes: [H(921), H(9211)] }),
  ];
}

export function seedTxs(positions: Position[]): Record<string, Tx> {
  const txs: Record<string, Tx> = {};
  positions.forEach((p) => {
    p.txHashes.forEach((hash, i) => {
      const unresolved = p.status === 'unresolved';
      const isClose = i > 0;
      txs[hash] = {
        hash,
        kind: isClose ? (p.closeReason === 'exercised' ? 'exercise' : p.closeReason === 'expired worthless' ? 'release' : 'close') : 'open',
        title: `${isClose ? 'Close' : 'Open'} ${p.sym} ${p.strike} ${p.side}`,
        positionId: p.id,
        stage: unresolved ? 'unknown' : 'confirmed',
        outcome: unresolved ? 'unresolved' : 'success',
        delegated: false,
        startedAt: isClose && p.closedAt ? p.closedAt : p.openedAt,
        updatedAt: isClose && p.closedAt ? p.closedAt : p.openedAt,
        rechecks: 0,
        note: unresolved ? 'The transaction was submitted but no execution receipt has been found yet.' : 'Receipt verified and settlement confirmed.',
      };
    });
  });
  return txs;
}

export function seedProposals(): Proposal[] {
  const p301 = buildProposal({
    id: 'PR-301', sym: 'MSFT', side: 'call', strike: 490, expiry: '2026-12-18', qty: 1, origin: 'agent', createdAgoMin: 26, confidence: 0.67,
    headline: 'Long call on MSFT 490, 18 Dec',
    thesis: [
      'Price is trending up with low realised volatility, and implied volatility is below its yearly median, so premium is relatively cheap.',
      'The 490 strike is about 2.4% above the current price. The December expiry leaves 37 days for the trend to continue.',
      'Total premium stays inside your per-trade limit, and capital at risk remains well under your exposure cap.',
    ],
  });
  const p302 = buildProposal({
    id: 'PR-302', sym: 'META', side: 'put', strike: 590, expiry: '2026-12-18', qty: 3, origin: 'agent', createdAgoMin: 9, confidence: 0.55,
    headline: 'Long put on META 590, 18 Dec (3 contracts)',
    thesis: [
      'Momentum indicators are rolling over after a strong run, and price has stalled near its high.',
      'A put with a known cost gives exposure to a 5–8% pullback without margin risk.',
      'This is a counter-trend idea, so confidence is lower. Size is three contracts because the premium per contract is small relative to a pullback payoff.',
    ],
  });
  const p288 = buildProposal({
    id: 'PR-288', sym: 'NVDA', side: 'call', strike: 190, expiry: '2026-12-18', qty: 2, origin: 'agent', createdAgoMin: 9 * 24 * 60 + 60, status: 'executed', confidence: 0.71,
    headline: 'Long call on NVDA 190, 18 Dec (2 contracts)',
    thesis: ['Uptrend intact with mid-range implied volatility.', 'December expiry avoids steep short-term decay.'],
  });
  p288.decidedAt = isoAgo(9 * DAY);
  p288.txHash = H(1042);
  const p291 = buildProposal({
    id: 'PR-291', sym: 'AMZN', side: 'call', strike: 235, expiry: '2026-11-20', qty: 2, origin: 'agent', createdAgoMin: 5 * 24 * 60 + 30, status: 'rejected', confidence: 0.48,
    headline: 'Long call on AMZN 235, 20 Nov (2 contracts)',
    thesis: ['Breakout attempt above consolidation range.', 'Short expiry gives high leverage but fast decay.'],
  });
  p291.decidedAt = isoAgo(5 * DAY);
  p291.decisionNote = 'Rejected by you: expiry too short.';
  const p300 = buildProposal({
    id: 'PR-300', sym: 'AMZN', side: 'put', strike: 215, expiry: '2026-12-18', qty: 2, origin: 'agent', createdAgoMin: 3 * 60 + 6, status: 'approved', confidence: 0.58,
    headline: 'Long put on AMZN 215, 18 Dec (2 contracts)',
    thesis: ['Price is failing at resistance and could retest the lower band of its range.', 'Defined-risk way to hedge the rest of your tech exposure.'],
  });
  p300.decidedAt = isoAgo(3 * 60 * MIN + 2 * MIN);
  p300.decisionNote = 'Approved by you. Execution not yet confirmed.';
  p300.txHash = H(1045);
  return [p302, p301, p300, p291, p288];
}

const evFor = (sym: string, min: number) => [
  { label: 'Underlying price', value: `$${assetBySym(sym)!.price.toFixed(2)}`, source: 'Demo market feed', ts: isoAgo(min * MIN), quality: 'simulated' as const },
  { label: 'Implied volatility', value: `IV rank ${assetBySym(sym)!.ivRank}`, source: 'Demo volatility model', ts: isoAgo(min * MIN), quality: 'estimated' as const },
];

export function seedActivity(proposals: Proposal[], positions: Position[]): Activity[] {
  const ck = (p: Proposal): Check[] =>
    runChecks(
      { actor: 'agent', sym: p.sym, side: p.side, strategy: p.strategy, qty: p.qty, premium: p.premium, dte: p.dte, quality: p.quality, optionsSupported: true, pricingAgeMin: 2 },
      { policy: DEFAULT_POLICY, walletConnected: true, balance: 25000, locked: 3200, paused: false, revoked: false, mode: 'approval' },
    );
  const byId = Object.fromEntries(proposals.map((p) => [p.id, p]));
  const rec = (p: Proposal, authorization: string, result: string) => ({
    action: p.headline, strategy: p.strategy, evidence: p.evidence, risks: p.risks, alternatives: p.alternatives.map((a) => a.title),
    confidence: p.confidence, uncertainty: p.uncertainty, checks: ck(p), authorization, result,
  });
  const A = (id: string, minAgo: number, a: Omit<Activity, 'id' | 'ts'>): Activity => ({ id, ts: isoAgo(minAgo * MIN), ...a });
  void positions;
  return [
    A('A-0219', 9, { kind: 'proposal', actor: 'ai', title: 'Proposed long put on META 590, 18 Dec', summary: '3 contracts. Blocked at approval: premium exceeds your limit.', stage: 'awaiting_approval', sym: 'META', proposalId: 'PR-302', record: rec(byId['PR-302'], 'Awaiting your approval', 'Not executed') }),
    A('A-0218', 26, { kind: 'proposal', actor: 'ai', title: 'Proposed long call on MSFT 490, 18 Dec', summary: '1 contract. All policy checks passed. Awaiting your approval.', stage: 'awaiting_approval', sym: 'MSFT', proposalId: 'PR-301', record: rec(byId['PR-301'], 'Awaiting your approval', 'Not executed') }),
    A('A-0217', 41, {
      kind: 'no_trade', actor: 'ai', title: 'No trade: AAPL', summary: 'Volatility is near its 12-month low and price is range-bound. No setup meets the entry criteria.', sym: 'AAPL',
      record: { action: 'Abstain: no trade', strategy: 'None', evidence: evFor('AAPL', 41), risks: ['Paying decay in a sideways market is likely to lose money.'], alternatives: ['Re-check after a range breakout', 'Watch IV rank for a rise above 30'], confidence: 0.74, uncertainty: 'The decision to abstain is fairly firm. It could change quickly on a volatility spike.', checks: [], authorization: 'Not required (no action)', result: 'No action taken. Recorded as a valid outcome.' },
    }),
    A('A-0216', 58, {
      kind: 'no_trade', actor: 'ai', title: 'No trade: GOOGL', summary: 'Options on GOOGL are not connected to Handel, so no priced contract could be evaluated.', sym: 'GOOGL',
      record: { action: 'Abstain: missing evidence', strategy: 'None', evidence: [{ label: 'Option quotes', value: 'Unavailable', source: 'Demo pricing oracle', ts: isoAgo(58 * MIN), quality: 'unavailable' }], risks: ['Cannot size risk without pricing evidence.'], alternatives: ['Analyse the underlying only'], confidence: null, uncertainty: 'Not applicable. The asset is analysis-only.', checks: [], authorization: 'Not required (no action)', result: 'No action taken.' },
    }),
    A('A-0215', 180, { kind: 'tx_unknown', actor: 'system', title: 'Could not verify: open AMZN 215 put', summary: 'Submitted, but no execution receipt was found. The position is not yet counted as open.', stage: 'unknown', sym: 'AMZN', positionId: 'P-1045', proposalId: 'PR-300', txHash: H(1045),
      record: { ...rec(byId['PR-300'], 'Approved by you', 'Unresolved: settlement could not be confirmed'), result: 'Unresolved: submitted at 06:41 UTC, no receipt after 3 hours. Collateral stays reserved until this is resolved.' } }),
    A('A-0214', 182, { kind: 'approval', actor: 'user', title: 'You approved: long put on AMZN 215', summary: 'Wallet signature requested and submitted.', stage: 'approved', sym: 'AMZN', proposalId: 'PR-300' }),
    A('A-0213', 186, { kind: 'proposal', actor: 'ai', title: 'Proposed long put on AMZN 215, 18 Dec', summary: '2 contracts. All policy checks passed.', stage: 'awaiting_approval', sym: 'AMZN', proposalId: 'PR-300', record: rec(byId['PR-300'], 'Awaiting your approval', 'Approved later by you') }),
    A('A-0210', 24 * 60, { kind: 'permission_change', actor: 'user', title: 'Mode changed to Approval', summary: 'The agent now creates proposals. Nothing executes without your approval.' }),
    A('A-0207', 2 * 24 * 60, { kind: 'lifecycle', actor: 'system', title: 'MSFT 480 call expired', summary: 'Expired out of the money. An expiry release can be requested to finalise the position.', sym: 'MSFT', positionId: 'P-1031' }),
    A('A-0201', 5 * 24 * 60, { kind: 'rejection', actor: 'user', title: 'You rejected: long call on AMZN 235', summary: 'Reason: expiry too short.', sym: 'AMZN', proposalId: 'PR-291' }),
    A('A-0196', 9 * 24 * 60, { kind: 'tx_confirmed', actor: 'system', title: 'Confirmed: opened NVDA 190 call ×2', summary: 'Receipt verified. Position is now open.', stage: 'confirmed', sym: 'NVDA', positionId: 'P-1042', proposalId: 'PR-288', txHash: H(1042), record: rec(byId['PR-288'], 'Approved by you', 'Confirmed: position open') }),
    A('A-0195', 9 * 24 * 60 + 2, { kind: 'approval', actor: 'user', title: 'You approved: long call on NVDA 190', summary: 'Wallet signature completed.', sym: 'NVDA', proposalId: 'PR-288', stage: 'approved' }),
    A('A-0190', 12 * 24 * 60, { kind: 'tx_confirmed', actor: 'system', title: 'Confirmed: opened AAPL 225 put', summary: 'Manual trade. Receipt verified.', stage: 'confirmed', sym: 'AAPL', positionId: 'P-1043', txHash: H(1043) }),
    A('A-0181', 16 * 24 * 60, { kind: 'tx_failed', actor: 'system', title: 'Failed: open TSLA 300 put', summary: 'The transaction was rejected on chain. No collateral was moved.', stage: 'failed', sym: 'TSLA', txHash: H(1100) }),
    A('A-0170', 20 * 24 * 60, { kind: 'tx_confirmed', actor: 'system', title: 'Confirmed: opened TSLA 330 call', summary: 'Manual trade. Receipt verified.', stage: 'confirmed', sym: 'TSLA', positionId: 'P-1044', txHash: H(1044) }),
    A('A-0150', 30 * 24 * 60, { kind: 'permission_change', actor: 'user', title: 'Wallet connected, advisory mode', summary: 'Account handel-demo.testnet connected. No agent permissions were granted.' }),
  ];
}

export function seedNotices(): Notice[] {
  return [
    { id: 'N-9', ts: isoAgo(9 * MIN), tone: 'info', title: 'New proposal: META long put', body: 'Blocked by your premium limit. Review the risks.', href: '/app/proposals?id=PR-302', read: false },
    { id: 'N-8', ts: isoAgo(26 * MIN), tone: 'info', title: 'Approval needed: MSFT long call', body: 'All policy checks passed.', href: '/app/proposals?id=PR-301', read: false },
    { id: 'N-7', ts: isoAgo(3 * 60 * MIN), tone: 'warn', title: 'Unresolved transaction', body: 'AMZN 215 put: no receipt found after 3 hours.', href: '/app/portfolio/P-1045', read: false },
    { id: 'N-6', ts: isoAgo(24 * 60 * MIN), tone: 'warn', title: 'AAPL 225 put expires in 2 days', body: 'Currently out of the money.', href: '/app/portfolio/P-1043', read: true },
    { id: 'N-5', ts: isoAgo(48 * 60 * MIN), tone: 'info', title: 'MSFT 480 call expired', body: 'Request expiry release to free collateral.', href: '/app/portfolio/P-1031', read: true },
  ];
}

export function seedChat(): ChatMsg[] {
  return [
    {
      id: 'M-0', role: 'ai', ts: isoAgo(0),
      blocks: [
        { t: 'p', text: 'I can explain the supported NEAR Testnet options flow, read your on-chain agent limits, and help prepare an explicit wNEAR Call or Put. I do not provide live market prices. Eligible orders require an enabled on-chain policy; the principal signs collateral and the holder signs premium.' },
      ],
    },
  ];
}

export const SEED_AGENT_RUNS = (): import('../state/store').AgentRun[] => {
  const run = (id: string, min: number, title: string, result: import('../state/store').AgentRun['result'], sym: string, overrides: Partial<Parameters<typeof runChecks>[0]>, policyOverride?: Partial<typeof DEFAULT_POLICY>): import('../state/store').AgentRun => {
    const a = assetBySym(sym)!;
    void a;
    const checks = runChecks(
      { actor: 'agent', sym, side: 'call', strategy: 'Long call', qty: 1, premium: 6, dte: 37, quality: 'verified', optionsSupported: true, pricingAgeMin: 2, ...overrides },
      { policy: { ...DEFAULT_POLICY, ...policyOverride }, walletConnected: true, balance: 25000, locked: 3200, paused: false, revoked: false, mode: 'approval' },
    );
    return { id, ts: isoAgo(min * MIN), title, result, sym, checks };
  };
  return [
    run('R-4', 9, 'META long put 590 ×3', 'proposed', 'META', { side: 'put', strategy: 'Long put', qty: 3, premium: 9.4 }, { maxPremiumUsd: 2000 }),
    run('R-3', 26, 'MSFT long call 490 ×1', 'proposed', 'MSFT', { premium: 6.1 }),
    run('R-2', 50 * 60, 'TSLA long put 340 ×1', 'rejected', 'TSLA', { side: 'put', strategy: 'Long put', premium: 18.4 }),
    run('R-1', 9 * 24 * 60, 'NVDA long call 190 ×2', 'proposed', 'NVDA', { qty: 2, premium: 6.8 }),
  ];
};
