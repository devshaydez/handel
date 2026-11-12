// ─────────────────────────────────────────────────────────────
// UI STATE STORE
// Market data and demo scenarios are local fixtures. Live Testnet execution is
// implemented in near-wallet.ts; confirmed wallet results are recorded below.
// ─────────────────────────────────────────────────────────────
import { useSyncExternalStore } from 'react';
import { assetBySym, DAY, DEFAULT_POLICY, DEMO_NOW, dteOf, fmtShort, makeContract, NETWORK, parseContractId } from '../data/mock';
import { mockHash, seedActivity, seedChat, seedNotices, seedPositions, seedProposals, seedTxs, SEED_AGENT_RUNS, shortHash } from '../data/seed';
import type {
  Activity, ActKind, ChatMsg, Check, DemoSettings, Mode, Notice, Policy, Position, Proposal, Tx, TxKind, TxOutcome,
} from '../data/types';
import { buildProposal } from '../lib/proposals';
import { overall, runChecks } from '../lib/policy';
import { CONTRACT_SIZE, usd0 } from '../lib/pricing';
import { markPosition } from '../lib/valuation';
import { askHandelEducation } from '../lib/handel-api';
import { disconnectNearWallet, getTestnetUsdcBalance, type WalletTransactionResult } from '../lib/near-wallet';

export interface AgentRun {
  id: string;
  ts: string;
  title: string;
  sym: string;
  result: 'proposed' | 'executed' | 'rejected' | 'abstained';
  checks: Check[];
}
export interface Toast { id: string; tone: 'info' | 'success' | 'warn' | 'danger'; text: string }

export interface State {
  wallet: { connected: boolean; readOnly: boolean; account: string; network: string };
  guideDismissed: boolean;
  mode: Mode;
  paused: boolean;
  revoked: boolean;
  policy: Policy;
  authorization: { status: 'none' | 'per-proposal' | 'delegated' | 'revoked'; id: string; grantedAt?: string; expiresAt?: string };
  balance: number;
  positions: Position[];
  proposals: Proposal[];
  activity: Activity[];
  txs: Record<string, Tx>;
  notices: Notice[];
  watchlist: string[];
  chat: ChatMsg[];
  chatBusy: boolean;
  agentRuns: AgentRun[];
  agentActivity: 'idle' | 'analysing' | 'executing';
  demo: DemoSettings;
  toasts: Toast[];
  notifPrefs: Record<string, boolean>;
  txPrefs: { reviewBeforeSign: boolean; maxSlippagePct: number; defaultQty: number };
  clockOffset: number;
}

const START = Date.now();
const SEED_BALANCE = 0;

function fresh(dataset: 'populated' | 'empty'): Pick<State, 'positions' | 'proposals' | 'activity' | 'txs' | 'notices' | 'agentRuns' | 'chat'> {
  if (dataset === 'empty') {
    return { positions: [], proposals: [], activity: [], txs: {}, notices: [], agentRuns: [], chat: seedChat() };
  }
  const positions = seedPositions();
  const proposals = seedProposals();
  return {
    positions, proposals, activity: seedActivity(proposals, positions), txs: seedTxs(positions), notices: seedNotices(),
    agentRuns: SEED_AGENT_RUNS(), chat: seedChat(),
  };
}

const initial = (): State => ({
  wallet: { connected: false, readOnly: false, account: '', network: NETWORK },
  guideDismissed: false,
  mode: 'approval',
  paused: false,
  revoked: false,
  policy: { ...DEFAULT_POLICY },
  authorization: { status: 'none', id: '' },
  balance: SEED_BALANCE,
  ...fresh('empty'),
  watchlist: ['NVDA', 'MSFT', 'META'],
  chatBusy: false,
  agentActivity: 'idle',
  demo: { dataset: 'empty', feed: 'ok', outcome: 'success', agentError: false },
  toasts: [],
  notifPrefs: { proposals: true, approvals: true, tx: true, expiry: true, risk: true, restrictions: true, failed: true },
  txPrefs: { reviewBeforeSign: true, maxSlippagePct: 2, defaultQty: 1 },
  clockOffset: 0,
});

let state: State = initial();
const subs = new Set<() => void>();
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const getState = () => state;
function set(p: Partial<State> | ((s: State) => Partial<State>)) {
  state = { ...state, ...(typeof p === 'function' ? p(state) : p) };
  subs.forEach((f) => f());
}
export function useStore(): State {
  return useSyncExternalStore(subscribe, getState);
}

let counter = 400;
const nid = (p: string) => `${p}-${++counter}`;
export const nowMs = () => DEMO_NOW + (Date.now() - START) + state.clockOffset;
export const nowIso = () => new Date(nowMs()).toISOString();

// ── derived ──────────────────────────────────────────────────
export function lockedCollateral(s: State) {
  return s.positions
    .filter((p) => ['open', 'expired', 'pending', 'unresolved'].includes(p.status))
    .reduce((a, p) => a + p.entryPremium * CONTRACT_SIZE * p.qty, 0);
}

export function portfolio(s: State) {
  const locked = lockedCollateral(s);
  let unrealized = 0;
  let netDelta = 0;
  let openValue = 0;
  s.positions.forEach((p) => {
    if (p.status === 'open' || p.status === 'expired') {
      const m = markPosition(p, s.demo.feed);
      if (m.valued) { unrealized += m.pnl; openValue += m.value; netDelta += m.delta * CONTRACT_SIZE * p.qty * assetBySym(p.sym)!.price * (p.side === 'put' ? 1 : 1); }
    }
  });
  const realized = s.positions.filter((p) => p.status === 'closed').reduce((a, p) => a + (p.realized ?? 0), 0);
  const openCount = s.positions.filter((p) => p.status === 'open' || p.status === 'expired').length;
  return {
    balance: s.balance,
    locked,
    available: s.balance - locked,
    unrealized,
    realized,
    value: s.balance + unrealized,
    openValue,
    openCount,
    exposurePct: (locked / s.balance) * 100,
    netDelta,
  };
}

export type AgentKey = 'active' | 'analysing' | 'awaiting' | 'executing' | 'paused' | 'restricted' | 'error';
export function agentStatus(s: State): { key: AgentKey; label: string; sub: string } {
  const pendingApprovals = s.proposals.filter((p) => p.status === 'pending').length;
  if (s.demo.agentError) return { key: 'error', label: 'Error', sub: 'Market data adapter timed out' };
  if (s.revoked) return { key: 'restricted', label: 'Access revoked', sub: 'Re-authorize to use the agent' };
  if (s.paused) return { key: 'paused', label: 'Paused', sub: 'No analysis or actions' };
  if (s.agentActivity === 'executing') return { key: 'executing', label: 'Executing', sub: 'Authorized action in flight' };
  if (s.agentActivity === 'analysing') return { key: 'analysing', label: 'Analysing', sub: 'Reviewing market evidence' };
  if (s.mode === 'approval' && pendingApprovals > 0) return { key: 'awaiting', label: 'Awaiting approval', sub: `${pendingApprovals} proposal${pendingApprovals > 1 ? 's' : ''} need you` };
  if (s.demo.feed !== 'ok') return { key: 'restricted', label: 'Restricted', sub: s.demo.feed === 'down' ? 'Market data unavailable' : 'Market data is stale' };
  return { key: 'active', label: 'Active', sub: s.mode === 'advisory' ? 'Advisory only' : s.mode === 'approval' ? 'Proposing for approval' : 'Within your limits' };
}

// ── helpers ──────────────────────────────────────────────────
function log(a: Omit<Activity, 'id' | 'ts'> & { ts?: string }) {
  const entry: Activity = { id: nid('A'), ts: a.ts ?? nowIso(), ...a };
  set((s) => ({ activity: [entry, ...s.activity] }));
  return entry;
}
function notify(tone: Notice['tone'], title: string, body: string, href?: string, pref?: string) {
  if (pref && state.notifPrefs[pref] === false) return;
  const n: Notice = { id: nid('N'), ts: nowIso(), tone, title, body, href, read: false };
  set((s) => ({ notices: [n, ...s.notices] }));
}
export function toast(tone: Toast['tone'], text: string) {
  const t: Toast = { id: nid('T'), tone, text };
  set((s) => ({ toasts: [...s.toasts, t] }));
  setTimeout(() => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) })), 4200);
}
export const dismissToast = (id: string) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
export const markAllRead = () => set((s) => ({ notices: s.notices.map((n) => ({ ...n, read: true })) }));
export const markRead = (id: string) => set((s) => ({ notices: s.notices.map((n) => (n.id === id ? { ...n, read: true } : n)) }));

// ── wallet and onboarding ────────────────────────────────────
export async function connectWallet(account: string, network = NETWORK) {
  if (!account.trim()) throw new Error('A connected NEAR account is required.');
  if (network !== 'testnet') throw new Error('Handel only supports NEAR Testnet wallets.');
  set({ wallet: { connected: true, readOnly: false, account, network }, balance: 0 });
  try {
    const balance = await getTestnetUsdcBalance(account);
    set({ balance });
  } catch (error) {
    set({ balance: 0 });
    toast('warn', error instanceof Error ? 'Wallet connected, but the USDC balance could not be verified. On-chain funding checks remain authoritative.' : 'Wallet connected, but the USDC balance could not be verified.');
  }
}
export async function disconnectWallet() {
  await disconnectNearWallet();
  set({ wallet: { connected: false, readOnly: false, account: '', network: NETWORK } });
}
export function enterReadOnly() {
  set({ wallet: { connected: false, readOnly: true, account: '', network: NETWORK }, balance: 0 });
}
export function startMode(m: Mode) {
  if (m === 'auto') {
    toast('warn', 'Automatic execution is not enabled. On-chain proposals require your approval.');
    return;
  }
  set({ mode: m, authorization: { status: m === 'approval' ? 'per-proposal' : 'none', id: '' } });
}
export const dismissGuide = () => set({ guideDismissed: true });
export const setNotifPref = (k: string, v: boolean) => set((s) => ({ notifPrefs: { ...s.notifPrefs, [k]: v } }));
export const setTxPref = (p: Partial<State['txPrefs']>) => set((s) => ({ txPrefs: { ...s.txPrefs, ...p } }));

// ── agent permissions ────────────────────────────────────────
export function setMode(m: Mode) {
  if (m === 'auto') {
    toast('warn', 'Automatic execution is not enabled. OptionsContract enforces ManualApproval.');
    return;
  }
  const prev = state.mode;
  if (prev === m) return;
  const grantedAt = nowIso();
  set({
    mode: m,
    revoked: false,
    authorization:
      m === 'auto'
        ? { status: 'delegated', id: 'AUTH-' + mockHash(counter).slice(0, 4).toUpperCase(), grantedAt, expiresAt: new Date(nowMs() + 30 * DAY).toISOString() }
        : { status: m === 'approval' ? 'per-proposal' : 'none', id: state.authorization.id },
  });
  log({ kind: 'permission_change', actor: 'user', title: `Mode changed to ${m === 'auto' ? 'Automatic execution' : m === 'approval' ? 'Approval' : 'Advisory'}`, summary: m === 'auto' ? 'The agent may execute eligible trades within your policy. You can pause or revoke at any time.' : m === 'approval' ? 'The agent creates proposals. Nothing executes without your approval.' : 'The agent analyses and recommends only.' });
  notify('info', 'Agent mode updated', `Now in ${m} mode.`, '/app/agent', 'restrictions');
  toast('success', `Agent mode: ${m === 'auto' ? 'Automatic execution' : m === 'approval' ? 'Approval' : 'Advisory'}`);
}
export function pauseAgent() {
  set({ paused: true });
  log({ kind: 'permission_change', actor: 'user', title: 'Agent paused', summary: 'Analysis and automatic actions are stopped. Your permissions are unchanged.' });
  toast('warn', 'Agent paused');
}
export function resumeAgent() {
  set({ paused: false });
  log({ kind: 'permission_change', actor: 'user', title: 'Agent resumed', summary: 'The agent resumed within your existing permissions.' });
  toast('success', 'Agent resumed');
}
export function revokeAgent() {
  set({ revoked: true, mode: 'advisory', paused: false, authorization: { status: 'revoked', id: state.authorization.id } });
  log({ kind: 'permission_change', actor: 'user', title: 'Agent access revoked', summary: 'All delegated authority was removed and the mode returned to Advisory.' });
  notify('warn', 'Agent access revoked', 'The agent can no longer act. Choose a mode to re-enable it.', '/app/agent', 'restrictions');
  toast('warn', 'Agent access revoked');
}
export function reauthorize() {
  set({ revoked: false, authorization: { status: 'none', id: state.authorization.id } });
  log({ kind: 'permission_change', actor: 'user', title: 'Agent re-enabled in Advisory mode', summary: 'The agent can analyse again. No trading authority was granted.' });
}
export function updatePolicy(p: Policy) {
  const prev = state.policy;
  const diffs: string[] = [];
  if (prev.assets.join() !== p.assets.join()) diffs.push(`assets: ${p.assets.join(', ') || 'none'}`);
  if (prev.sides.join() !== p.sides.join()) diffs.push(`option types: ${p.sides.join(', ') || 'none'}`);
  if (prev.strategies.join() !== p.strategies.join()) diffs.push(`strategies: ${p.strategies.join(', ') || 'none'}`);
  if (prev.maxContracts !== p.maxContracts) diffs.push(`max contracts ${prev.maxContracts} → ${p.maxContracts}`);
  if (prev.maxPremiumUsd !== p.maxPremiumUsd) diffs.push(`max premium ${usd0(prev.maxPremiumUsd)} → ${usd0(p.maxPremiumUsd)}`);
  if (prev.expiryMinDays !== p.expiryMinDays || prev.expiryMaxDays !== p.expiryMaxDays) diffs.push(`expiry ${p.expiryMinDays}–${p.expiryMaxDays} days`);
  if (prev.maxExposurePct !== p.maxExposurePct) diffs.push(`exposure cap ${prev.maxExposurePct}% → ${p.maxExposurePct}%`);
  if (prev.requireVerified !== p.requireVerified) diffs.push(`verified pricing ${p.requireVerified ? 'required' : 'optional'}`);
  set({ policy: p });
  if (diffs.length) {
    log({ kind: 'permission_change', actor: 'user', title: 'Agent policy updated', summary: diffs.join(' · ') });
    toast('success', 'Policy saved');
  }
}

export const toggleWatch = (sym: string) =>
  set((s) => ({ watchlist: s.watchlist.includes(sym) ? s.watchlist.filter((x) => x !== sym) : [...s.watchlist, sym] }));

// ── demo-only transaction simulation ─────────────────────────
// The Trade Builder and Approval Centre do not call these mock helpers.
// Real wallet execution and receipt verification live in near-wallet.ts.
export interface TradeSpec {
  sym: string;
  side: 'call' | 'put';
  strike: number;
  expiry: string;
  qty: number;
  premium: number;
  source: Position['source'];
  proposalId?: string;
  delegated?: boolean;
}

function patchTx(hash: string, p: Partial<Tx>) {
  set((s) => ({ txs: { ...s.txs, [hash]: { ...s.txs[hash], ...p, updatedAt: nowIso() } } }));
}
function patchPos(id: string, p: Partial<Position>) {
  set((s) => ({ positions: s.positions.map((x) => (x.id === id ? { ...x, ...p } : x)) }));
}
function patchProposal(id: string, p: Partial<Proposal>) {
  set((s) => ({ proposals: s.proposals.map((x) => (x.id === id ? { ...x, ...p } : x)) }));
}

let posCounter = 1050;

function startPipeline(tx: Omit<Tx, 'stage' | 'startedAt' | 'updatedAt' | 'rechecks' | 'note' | 'outcome'>, onResolve: (r: 'success' | 'failed' | 'unresolved') => void) {
  const outcome: TxOutcome = state.demo.outcome;
  const t: Tx = { ...tx, stage: 'submitted', outcome, startedAt: nowIso(), updatedAt: nowIso(), rechecks: 0, note: 'Signed and sent to the network. Waiting for it to be included.' };
  set((s) => ({ txs: { ...s.txs, [t.hash]: t } }));
  setTimeout(() => patchTx(t.hash, { stage: 'pending', note: 'Included in a block. Waiting for execution receipts and settlement evidence.' }), 1600);
  setTimeout(() => {
    if (outcome === 'success') {
      patchTx(t.hash, { stage: 'confirmed', note: 'Receipt verified and settlement confirmed.' });
    } else if (outcome === 'failed') {
      patchTx(t.hash, { stage: 'failed', note: 'The network rejected this transaction. No funds moved.' });
    } else {
      patchTx(t.hash, { stage: 'unknown', note: 'Submitted, but no execution receipt has been found yet. This is not a failure and not a success.' });
    }
    onResolve(outcome);
  }, 4200);
}

export function recordManualOpen(spec: TradeSpec, result: WalletTransactionResult, premiumPerShare: number): { hash: string; positionId: string } {
  if (!result.positionId || !result.escrowPositionId) throw new Error('Escrow position identifiers were not returned.');
  const hash = result.transactionHash;
  const positionId = `NEAR-${hash.slice(0, 10)}`;
  const label = `${spec.sym} ${spec.strike} ${spec.side} ×${spec.qty}`;
  const transactionSteps = result.transactionSteps?.length
    ? result.transactionSteps
    : [{ hash, label: 'Verified Testnet execution' }];
  const transactionHashes = [...new Set(transactionSteps.map((step) => step.hash))];
  const position: Position = {
    id: positionId,
    contractId: `${spec.sym}-${spec.expiry.replace(/-/g, '')}-${spec.side === 'call' ? 'C' : 'P'}-${spec.strike}`,
    sym: spec.sym, side: spec.side, strike: spec.strike, expiry: spec.expiry, qty: spec.qty,
    entryPremium: premiumPerShare, status: 'open', openedAt: nowIso(), source: 'manual',
    txHashes: transactionHashes, chainPositionId: result.positionId, escrowPositionId: result.escrowPositionId,
  };
  const recordedAt = nowIso();
  const transactionRecords = Object.fromEntries(transactionSteps.map((step) => [step.hash, {
    hash: step.hash, kind: 'open' as const, title: `${step.label}: ${label}`, positionId, stage: 'confirmed' as const,
    outcome: 'success' as const, delegated: false, startedAt: recordedAt, updatedAt: recordedAt, rechecks: 0,
    note: 'This wallet transaction completed; the complete escrow lifecycle was independently verified through two Testnet RPCs.',
  }]));
  set((s) => ({
    positions: [position, ...s.positions],
    txs: { ...s.txs, ...transactionRecords },
  }));
  log({ kind: 'tx_confirmed', actor: 'user', title: `Escrow confirmed: opened ${label}`, summary: 'Testnet offer, collateral receipt, premium payout and OptionsContract Open state were verified. This is a self-traded demo position using synthetic prices and a wNEAR proxy.', stage: 'confirmed', sym: spec.sym, positionId, txHash: hash });
  toast('success', `Testnet escrow position opened: ${label}`);
  return { hash, positionId };
}

/** Demo-only simulated open. Never use this for wallet or Testnet execution. */
export function submitOpen(spec: TradeSpec): { hash: string; positionId: string } {
  const hash = mockHash(counter * 7 + 3);
  counter++;
  const positionId = `P-${++posCounter}`;
  const label = `${spec.sym} ${spec.strike} ${spec.side} ×${spec.qty}`;
  const pos: Position = {
    id: positionId,
    contractId: `${spec.sym}-${spec.expiry.replace(/-/g, '')}-${spec.side === 'call' ? 'C' : 'P'}-${spec.strike}`,
    sym: spec.sym, side: spec.side, strike: spec.strike, expiry: spec.expiry, qty: spec.qty, entryPremium: spec.premium,
    status: 'pending', openedAt: nowIso(), source: spec.source, txHashes: [hash], proposalId: spec.proposalId,
  };
  set((s) => ({ positions: [pos, ...s.positions] }));
  log({ kind: 'tx_submitted', actor: spec.delegated ? 'ai' : 'user', title: `Submitted: open ${label}`, summary: 'Transaction sent. This is not yet a completed trade. Execution and settlement are still being verified.', stage: 'submitted', sym: spec.sym, positionId, proposalId: spec.proposalId, txHash: hash });
  toast('info', `Submitted: open ${label}`);
  notify('info', 'Transaction submitted', `${label} is awaiting confirmation.`, `/app/portfolio/${positionId}`, 'tx');

  startPipeline({ hash, kind: 'open', title: `Open ${label}`, positionId, delegated: !!spec.delegated }, (r) => {
    if (r === 'success') {
      patchPos(positionId, { status: 'open' });
      if (spec.proposalId) patchProposal(spec.proposalId, { status: 'executed', txHash: hash });
      log({ kind: 'tx_confirmed', actor: 'system', title: `Confirmed: opened ${label}`, summary: 'Receipt verified. The position is now open.', stage: 'confirmed', sym: spec.sym, positionId, proposalId: spec.proposalId, txHash: hash });
      notify('success', 'Position confirmed', `${label} is open.`, `/app/portfolio/${positionId}`, 'tx');
      toast('success', `Confirmed: ${label} is open`);
    } else if (r === 'failed') {
      patchPos(positionId, { status: 'failed' });
      if (spec.proposalId) patchProposal(spec.proposalId, { decisionNote: 'Approved, but execution failed. No funds moved.' });
      log({ kind: 'tx_failed', actor: 'system', title: `Failed: open ${label}`, summary: 'The network rejected the transaction. No collateral was moved.', stage: 'failed', sym: spec.sym, positionId, proposalId: spec.proposalId, txHash: hash });
      notify('danger', 'Transaction failed', `${label} did not execute. No funds moved.`, `/app/portfolio/${positionId}`, 'failed');
      toast('danger', `Failed: ${label}`);
    } else {
      patchPos(positionId, { status: 'unresolved' });
      log({ kind: 'tx_unknown', actor: 'system', title: `Could not verify: open ${label}`, summary: 'No execution receipt found yet. Collateral stays reserved until this is resolved.', stage: 'unknown', sym: spec.sym, positionId, proposalId: spec.proposalId, txHash: hash });
      notify('warn', 'Unresolved transaction', `${label}: outcome could not be confirmed.`, `/app/portfolio/${positionId}`, 'failed');
      toast('warn', `Unresolved: ${label}`);
    }
  });
  return { hash, positionId };
}

function applyActionSuccess(p: Position, kind: TxKind) {
  const a = assetBySym(p.sym)!;
  const intrinsic = p.side === 'call' ? Math.max(a.price - p.strike, 0) : Math.max(p.strike - a.price, 0);
  let exit = intrinsic;
  let reason: Position['closeReason'] = 'exercised';
  if (kind === 'close') {
    exit = markPosition(p, state.demo.feed).mark ?? intrinsic;
    reason = 'closed';
  } else if (kind === 'release') {
    reason = intrinsic === 0 ? 'expired worthless' : 'released';
  }
  const realized = +((exit - p.entryPremium) * CONTRACT_SIZE * p.qty).toFixed(2);
  set((s) => ({ balance: +(s.balance + realized).toFixed(2) }));
  patchPos(p.id, { status: 'closed', closeReason: reason, exitPremium: +exit.toFixed(2), realized, closedAt: nowIso(), pendingOp: undefined });
  return realized;
}

export function recordEscrowAction(positionId: string, kind: 'exercise' | 'release', result: WalletTransactionResult): void {
  const position = state.positions.find((item) => item.id === positionId);
  if (!position) throw new Error('Position not found.');
  if (!result.transactionHash) throw new Error('Verified settlement transaction hash is required.');
  const asset = assetBySym(position.sym)!;
  const intrinsic = position.side === 'call' ? Math.max(asset.price - position.strike, 0) : Math.max(position.strike - asset.price, 0);
  const exitPremium = kind === 'exercise' ? intrinsic : 0;
  const closeReason: Position['closeReason'] = kind === 'exercise' ? 'exercised' : intrinsic === 0 ? 'expired worthless' : 'released';
  const realized = +((exitPremium - position.entryPremium) * CONTRACT_SIZE * position.qty).toFixed(2);
  patchPos(positionId, { status: 'closed', closeReason, exitPremium, realized, closedAt: nowIso(), pendingOp: undefined, txHashes: [...position.txHashes, ...(result.transactionSteps ?? [{ hash: result.transactionHash, label: kind }]).map((step) => step.hash)] });
  const label = `${position.sym} ${position.strike} ${position.side}`;
  const transactionSteps = result.transactionSteps?.length ? result.transactionSteps : [{ hash: result.transactionHash, label: kind }];
  const recordedAt = nowIso();
  const transactionRecords = Object.fromEntries(transactionSteps.map((step) => [step.hash, {
    hash: step.hash, kind, title: `${step.label}: ${label}`, positionId, stage: 'confirmed' as const, outcome: 'success' as const,
    delegated: false, startedAt: recordedAt, updatedAt: recordedAt, rechecks: 0,
    note: 'This wallet transaction completed; escrow payout callbacks and the OptionsContract terminal state were independently verified through two Testnet RPCs.',
  }]));
  set((s) => ({ txs: { ...s.txs, ...transactionRecords } }));
  log({ kind: kind === 'exercise' ? 'tx_confirmed' : 'lifecycle', actor: 'user', title: `Escrow settlement confirmed: ${kind} ${label}`, summary: 'NEP-141 escrow payout callbacks and the corresponding OptionsContract terminal state were verified on Testnet. This remains a synthetic, self-traded demo position.', stage: 'confirmed', sym: position.sym, positionId, txHash: result.transactionHash });
  toast('success', kind === 'exercise' ? 'Testnet exercise settled' : 'Testnet collateral released');
}

/** Demo-only simulated lifecycle action. Real exercise/release use near-wallet.ts. */
export function submitAction(positionId: string, kind: 'exercise' | 'release' | 'close'): string {
  const p = state.positions.find((x) => x.id === positionId)!;
  const hash = mockHash(counter * 13 + 5);
  counter++;
  const label = `${p.sym} ${p.strike} ${p.side}`;
  const verb = kind === 'exercise' ? 'Exercise' : kind === 'release' ? 'Expiry release' : 'Close';
  patchPos(positionId, { pendingOp: kind, txHashes: [...p.txHashes, hash] });
  log({ kind: kind === 'exercise' ? 'exercise_request' : kind === 'release' ? 'release_request' : 'tx_submitted', actor: 'user', title: `${verb} requested: ${label}`, summary: 'Transaction submitted. The position changes only after confirmation.', stage: 'submitted', sym: p.sym, positionId, txHash: hash });
  toast('info', `${verb} submitted: ${label}`);
  startPipeline({ hash, kind, title: `${verb} ${label}`, positionId, delegated: false }, (r) => {
    const cur = state.positions.find((x) => x.id === positionId)!;
    if (r === 'success') {
      const realized = applyActionSuccess(cur, kind);
      log({ kind: 'tx_confirmed', actor: 'system', title: `Confirmed: ${verb.toLowerCase()} ${label}`, summary: `Settlement verified. Realized P&L ${realized >= 0 ? '+' : ''}${usd0(realized)}.`, stage: 'confirmed', sym: p.sym, positionId, txHash: hash });
      notify('success', `${verb} confirmed`, `${label} is now closed.`, `/app/portfolio/${positionId}`, 'tx');
      toast('success', `${verb} confirmed: ${label}`);
    } else if (r === 'failed') {
      patchPos(positionId, { pendingOp: undefined });
      log({ kind: 'tx_failed', actor: 'system', title: `Failed: ${verb.toLowerCase()} ${label}`, summary: 'The network rejected the request. The position is unchanged.', stage: 'failed', sym: p.sym, positionId, txHash: hash });
      notify('danger', `${verb} failed`, `${label} is unchanged. You can try again.`, `/app/portfolio/${positionId}`, 'failed');
      toast('danger', `${verb} failed: ${label}`);
    } else {
      log({ kind: 'tx_unknown', actor: 'system', title: `Could not verify: ${verb.toLowerCase()} ${label}`, summary: 'No settlement evidence found yet. The position still shows its previous state.', stage: 'unknown', sym: p.sym, positionId, txHash: hash });
      notify('warn', 'Settlement unconfirmed', `${label}: ${verb.toLowerCase()} could not be confirmed.`, `/app/portfolio/${positionId}`, 'failed');
      toast('warn', `Unresolved: ${verb.toLowerCase()} ${label}`);
    }
  });
  return hash;
}

/** Demo-only simulated recheck. On-chain transactions are re-read from NEAR RPCs. */
export function recheckTx(hash: string) {
  const tx = state.txs[hash];
  if (!tx || tx.stage !== 'unknown') return;
  patchTx(hash, { note: 'Checking the network for receipts…', rechecks: tx.rechecks + 1 });
  setTimeout(() => {
    const t = state.txs[hash];
    if (t.rechecks < 2) {
      patchTx(hash, { note: 'Still no receipt found. Collateral stays reserved. Try again shortly.' });
      toast('warn', 'Still unresolved. No receipt found yet.');
      return;
    }
    patchTx(hash, { stage: 'confirmed', outcome: 'success', note: 'A receipt was found. Execution and settlement are now confirmed.' });
    const pos = state.positions.find((p) => p.id === t.positionId)!;
    const label = `${pos.sym} ${pos.strike} ${pos.side}`;
    if (t.kind === 'open') {
      patchPos(pos.id, { status: 'open' });
      if (pos.proposalId) patchProposal(pos.proposalId, { status: 'executed', txHash: hash, decisionNote: 'Executed after re-check.' });
    } else {
      applyActionSuccess(pos, t.kind);
    }
    log({ kind: 'tx_confirmed', actor: 'system', title: `Confirmed after re-check: ${label}`, summary: 'A receipt was found and verified. The position state is now updated.', stage: 'confirmed', sym: pos.sym, positionId: pos.id, txHash: hash });
    notify('success', 'Previously unresolved transaction confirmed', label, `/app/portfolio/${pos.id}`, 'tx');
    toast('success', `Confirmed: ${label}`);
  }, 1500);
}

// ── proposals ────────────────────────────────────────────────
export function proposalChecks(p: Proposal, s: State = state): Check[] {
  const a = assetBySym(p.sym)!;
  const c = makeContract(p.sym, p.expiry, p.side, p.strike, s.demo.feed);
  const premium = c.ask ?? p.premium;
  return runChecks(
    { actor: 'agent', sym: p.sym, side: p.side, strategy: p.strategy, qty: p.qty, premium: c.ask == null ? null : premium, dte: dteOf(p.expiry), quality: c.quality, optionsSupported: a.optionsSupported, pricingAgeMin: s.demo.feed === 'stale' ? 47 : 2, demoMode: true },
    { policy: s.policy, walletConnected: s.wallet.connected, balance: s.balance, locked: lockedCollateral(s), paused: s.paused, revoked: s.revoked, mode: s.mode },
  );
}

export function executeProposal(id: string, result: WalletTransactionResult, premiumPerShare?: number): { ok: boolean; reason?: string } {
  const p = state.proposals.find((x) => x.id === id);
  if (!p) return { ok: false, reason: 'Proposal not found' };
  if (!result.transactionHash?.trim() || !result.positionId || !result.escrowPositionId) return { ok: false, reason: 'Verified OptionsContract and escrow position identifiers are required.' };
  const checks = proposalChecks(p);
  const transactionHash = result.transactionHash;
  const transactionSteps = result.transactionSteps?.length
    ? result.transactionSteps
    : [{ hash: transactionHash, label: 'Verified Testnet execution' }];
  const transactionHashes = [...new Set(transactionSteps.map((step) => step.hash))];
  const positionId = `NEAR-${transactionHash.slice(0, 10)}`;
  const contract = makeContract(p.sym, p.expiry, p.side, p.strike, state.demo.feed);
  const position: Position = {
    id: positionId,
    contractId: p.contractId,
    sym: p.sym,
    side: p.side,
    strike: p.strike,
    expiry: p.expiry,
    qty: p.qty,
    entryPremium: premiumPerShare && Number.isFinite(premiumPerShare) && premiumPerShare > 0 ? premiumPerShare : contract.ask ?? p.premium,
    status: 'open',
    openedAt: nowIso(),
    source: 'ai-approved',
    txHashes: transactionHashes,
    proposalId: p.id,
    chainPositionId: result.positionId,
    escrowPositionId: result.escrowPositionId,
  };
  const recordedAt = nowIso();
  const transactionRecords = Object.fromEntries(transactionSteps.map((step) => [step.hash, {
    hash: step.hash, kind: 'open' as const, title: `${step.label}: Open ${p.sym} ${p.strike} ${p.side}`, positionId,
    stage: 'confirmed' as const, outcome: 'success' as const, delegated: false, startedAt: recordedAt, updatedAt: recordedAt,
    rechecks: 0, note: 'This wallet transaction completed; the complete escrow lifecycle was independently verified through two Testnet RPCs.',
  }]));
  set((s) => ({ positions: [position, ...s.positions], txs: { ...s.txs, ...transactionRecords } }));
  patchProposal(id, { status: 'executed', decidedAt: nowIso(), txHash: transactionHash, decisionNote: 'Created and funded through the NEAR Testnet NEP-141 escrow. This is a self-traded demo position: the connected account is both writer and holder. Collateral, premium payout, and OptionsContract Open state were verified on-chain.' });
  log({ kind: 'tx_confirmed', actor: 'system', title: `Escrow confirmed: ${p.strategy.toLowerCase()} on ${p.sym} ${p.strike}`, summary: 'NEAR Testnet offer, escrow collateral receipt, premium payout callback, and OptionsContract Open state were verified. The connected account is both writer and holder; there is no external counterparty. Underlying and option pricing are synthetic demo data.', stage: 'confirmed', sym: p.sym, positionId, proposalId: p.id, txHash: transactionHash, record: { action: p.headline, strategy: p.strategy, evidence: p.evidence, risks: p.risks, alternatives: p.alternatives.map((a) => a.title), confidence: p.confidence, uncertainty: p.uncertainty, checks, authorization: 'Principal wallet signed all Testnet transactions', result: 'Escrow-backed Testnet position opened.' } });
  toast('success', 'Testnet escrow position opened');
  return { ok: true };
}

export function rejectProposal(id: string, reason: string) {
  const p = state.proposals.find((x) => x.id === id);
  if (!p) return;
  patchProposal(id, { status: 'rejected', decidedAt: nowIso(), decisionNote: `Rejected by you: ${reason}.` });
  log({ kind: 'rejection', actor: 'user', title: `You rejected: ${p.strategy.toLowerCase()} on ${p.sym} ${p.strike}`, summary: `Reason: ${reason}.`, sym: p.sym, proposalId: p.id });
  toast('info', 'Proposal rejected');
}

export function createProposalFromDraft(d: import('../data/types').ProposalDraft): string {
  const id = nid('PR');
  const pr = buildProposal({ id, sym: d.sym, side: d.side, strike: d.strike, expiry: d.expiry, qty: d.qty, origin: 'assistant', headline: d.headline, thesis: d.thesis, feed: state.demo.feed });
  set((s) => ({ proposals: [pr, ...s.proposals] }));
  log({ kind: 'proposal', actor: 'ai', title: `Proposed ${pr.strategy.toLowerCase()} on ${pr.sym} ${pr.strike}, ${fmtShort(pr.expiry)}`, summary: 'Created from the assistant. Awaiting your approval.', stage: 'awaiting_approval', sym: pr.sym, proposalId: id });
  notify('info', `New proposal: ${pr.sym} ${pr.strategy.toLowerCase()}`, 'Created from the assistant.', `/app/proposals?id=${id}`, 'proposals');
  toast('success', 'Sent to the Approval Centre');
  return id;
}

// ── agent cycle (demo) ───────────────────────────────────────
let cycle = 0;
const SCENARIOS = [
  { kind: 'trade' as const, sym: 'MSFT', side: 'call' as const, strike: 490, qty: 1, headline: 'Long call on MSFT 490, 18 Dec', thesis: ['Uptrend with below-average implied volatility.', 'December expiry gives the move time to play out.'] },
  { kind: 'trade' as const, sym: 'TSLA', side: 'put' as const, strike: 340, qty: 1, headline: 'Long put on TSLA 340, 18 Dec', thesis: ['Implied volatility is elevated and price is failing near recent highs.', 'A put offers defined risk against a pullback.'] },
  { kind: 'none' as const, sym: 'AAPL', side: 'call' as const, strike: 235, qty: 1, headline: '', thesis: [] },
  { kind: 'trade' as const, sym: 'META', side: 'put' as const, strike: 590, qty: 3, headline: 'Long put on META 590, 18 Dec (3 contracts)', thesis: ['Momentum is rolling over from highs.', 'Defined-risk pullback trade.'] },
];

export function runAgentCycle() {
  if (state.agentActivity !== 'idle') return;
  if (state.mode === 'auto') {
    toast('warn', 'Automatic execution is disabled on Testnet. Use principal-approved proposals.');
    return;
  }
  if (state.demo.agentError) {
    set({ agentActivity: 'analysing' });
    setTimeout(() => {
      set({ agentActivity: 'idle' });
      log({ kind: 'ai_decision', actor: 'system', title: 'Agent error: no action taken', summary: 'The market data adapter timed out. The agent abstained rather than act on missing evidence.', stage: 'failed' });
      notify('danger', 'Agent error', 'Market data adapter timed out. No actions were taken.', '/app/agent', 'restrictions');
      toast('danger', 'Agent error: market data timed out');
    }, 1200);
    return;
  }
  if (state.revoked || state.paused) {
    toast('warn', state.revoked ? 'Agent access is revoked. No actions taken.' : 'Agent is paused. No actions taken.');
    return;
  }
  if (state.demo.feed === 'down') {
    toast('warn', 'Market data unavailable. The agent will abstain.');
  }
  const sc = SCENARIOS[cycle++ % SCENARIOS.length];
  set({ agentActivity: 'analysing' });
  setTimeout(() => {
    const mode = state.mode;
    if (sc.kind === 'none' || state.demo.feed === 'down') {
      const reason = state.demo.feed === 'down' ? 'Market data is unavailable, so no evidence could be evaluated.' : 'Volatility is low and price is range-bound. No setup meets the entry criteria.';
      log({ kind: 'no_trade', actor: 'ai', title: `No trade: ${sc.sym}`, summary: reason, sym: sc.sym, record: { action: 'Abstain: no trade', strategy: 'None', evidence: [{ label: 'Underlying price', value: `$${assetBySym(sc.sym)!.price.toFixed(2)}`, source: 'Demo market feed', ts: nowIso(), quality: 'simulated' }], risks: ['Paying time decay without a trend is likely to lose money.'], alternatives: ['Re-check after a range breakout'], confidence: 0.72, uncertainty: 'Firm, but could change on a volatility spike.', checks: [], authorization: 'Not required (no action)', result: 'No action taken. Recorded as a valid outcome.' } });
      set((s) => ({ agentActivity: 'idle', agentRuns: [{ id: nid('R'), ts: nowIso(), title: `${sc.sym}: no trade`, sym: sc.sym, result: 'abstained', checks: [] }, ...s.agentRuns] }));
      toast('info', `Agent decided not to trade ${sc.sym}`);
      return;
    }
    const exp = '2026-12-18';
    const id = nid('PR');
    const pr = buildProposal({ id, sym: sc.sym, side: sc.side, strike: sc.strike, expiry: exp, qty: sc.qty, origin: 'agent', headline: sc.headline, thesis: sc.thesis, feed: state.demo.feed });
    if (state.proposals.some((p) => p.contractId === pr.contractId && ['pending', 'approved'].includes(p.status))) {
      set({ agentActivity: 'idle' });
      toast('info', `${sc.sym}: that idea is already pending. No new proposal.`);
      return;
    }
    const checks = proposalChecks(pr);
    const verdict = overall(checks);
    const title = `${sc.sym} ${pr.strategy.toLowerCase()} ${sc.strike} ×${sc.qty}`;
    const rec = { action: pr.headline, strategy: pr.strategy, evidence: pr.evidence, risks: pr.risks, alternatives: pr.alternatives.map((a) => a.title), confidence: pr.confidence, uncertainty: pr.uncertainty, checks, authorization: '', result: '' };
    if (verdict === 'fail') {
      const f = checks.filter((c) => c.status === 'fail').map((c) => c.label).join(', ');
      pr.status = 'blocked';
      pr.decisionNote = `Blocked by the policy engine: ${f}.`;
      set((s) => ({ proposals: [pr, ...s.proposals], agentActivity: 'idle', agentRuns: [{ id: nid('R'), ts: nowIso(), title, sym: sc.sym, result: 'rejected', checks }, ...s.agentRuns] }));
      log({ kind: 'ai_decision', actor: 'ai', title: `Blocked by policy engine: ${title}`, summary: `The agent proposed this, but independent checks failed: ${f}. Nothing was submitted.`, stage: 'failed', sym: sc.sym, proposalId: id, record: { ...rec, authorization: 'Not authorized: policy engine rejected', result: 'Rejected before execution' } });
      notify('warn', 'Agent action blocked', `${title}: ${f}.`, `/app/proposals?id=${id}`, 'risk');
      toast('warn', `Blocked by policy engine: ${f}`);
      return;
    }
    set((s) => ({ proposals: [pr, ...s.proposals] }));
    if (mode === 'auto') {
      set({ agentActivity: 'executing' });
      patchProposal(id, { status: 'approved', decidedAt: nowIso(), decisionNote: 'Executed automatically within your policy.' });
      const c = makeContract(sc.sym, exp, sc.side, sc.strike, state.demo.feed);
      log({ kind: 'ai_decision', actor: 'ai', title: `Auto-executing: ${title}`, summary: 'All independent checks passed. Executing under your delegated authorization.', stage: 'submitted', sym: sc.sym, proposalId: id, record: { ...rec, authorization: `Delegated authorization ${state.authorization.id}, within policy`, result: 'Submitted' } });
      submitOpen({ sym: sc.sym, side: sc.side, strike: sc.strike, expiry: exp, qty: sc.qty, premium: c.ask ?? pr.premium, source: 'ai-auto', proposalId: id, delegated: true });
      set((s) => ({ agentRuns: [{ id: nid('R'), ts: nowIso(), title, sym: sc.sym, result: 'executed', checks }, ...s.agentRuns] }));
      setTimeout(() => set({ agentActivity: 'idle' }), 4600);
    } else {
      set((s) => ({ agentActivity: 'idle', agentRuns: [{ id: nid('R'), ts: nowIso(), title, sym: sc.sym, result: 'proposed', checks }, ...s.agentRuns] }));
      log({ kind: 'proposal', actor: 'ai', title: `${mode === 'advisory' ? 'Recommended' : 'Proposed'} ${pr.strategy.toLowerCase()} on ${sc.sym} ${sc.strike}, ${fmtShort(exp)}`, summary: mode === 'advisory' ? 'Advisory only. Nothing executes unless you act.' : 'All policy checks passed. Awaiting your approval.', stage: 'awaiting_approval', sym: sc.sym, proposalId: id, record: { ...rec, authorization: mode === 'advisory' ? 'Advisory: your action required' : 'Awaiting your approval', result: 'Not executed' } });
      notify('info', mode === 'advisory' ? `New recommendation: ${sc.sym}` : `Approval needed: ${sc.sym}`, pr.headline, `/app/proposals?id=${id}`, 'proposals');
      toast('info', mode === 'advisory' ? `New recommendation: ${sc.sym}` : `New proposal awaiting approval: ${sc.sym}`);
    }
  }, 2200);
}

// ── assistant ────────────────────────────────────────────────
export function sendChat(text: string, ctx: { sym?: string; positionId?: string } = {}) {
  const t = text.trim();
  if (!t || state.chatBusy) return;
  const u: ChatMsg = { id: nid('M'), role: 'user', blocks: [{ t: 'p', text: t }], ts: nowIso() };
  set((s) => ({ chat: [...s.chat, u], chatBusy: true }));

  const context = {
    ...(ctx.sym ? { symbol: ctx.sym } : {}),
    ...(ctx.positionId ? { positionId: ctx.positionId } : {}),
  };
  void askHandelEducation(t, context).then((reply) => {
    const a: ChatMsg = {
      id: nid('M'),
      role: 'ai',
      blocks: [{ t: 'p', text: reply.answer }],
      ts: nowIso(),
    };
    set((s) => ({ chat: [...s.chat, a], chatBusy: false }));
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'The Handel backend request failed.';
    const a: ChatMsg = {
      id: nid('M'),
      role: 'ai',
      blocks: [{ t: 'p', text: `I couldn’t reach the live Handel education service: ${message}` }],
      ts: nowIso(),
    };
    set((s) => ({ chat: [...s.chat, a], chatBusy: false }));
  });
}

// ── demo controls ────────────────────────────────────────────
export function setDemo(p: Partial<DemoSettings>) {
  const prev = state.demo;
  const next = { ...prev, ...p };
  if (p.dataset && p.dataset !== prev.dataset) {
    set({ demo: next, ...fresh(p.dataset), balance: SEED_BALANCE });
    return;
  }
  set({ demo: next });
  if (p.feed && p.feed !== prev.feed) {
    if (p.feed === 'stale') notify('warn', 'Market data is stale', 'Last verified update was 47 minutes ago. Pricing is now estimated.', undefined, 'risk');
    if (p.feed === 'down') notify('danger', 'Market data unavailable', 'The agent will abstain until data returns.', undefined, 'risk');
  }
}
export function resetDemo() {
  const w = state.wallet;
  state = { ...initial(), wallet: w };
  subs.forEach((f) => f());
}

export { parseContractId, shortHash };
