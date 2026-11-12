import type { Side } from '../lib/pricing';
export type { Side };

export type DataQuality = 'verified' | 'estimated' | 'unavailable';
export type FeedState = 'ok' | 'stale' | 'down';
export type Mode = 'advisory' | 'approval' | 'auto';
export type TxOutcome = 'success' | 'failed' | 'unresolved';

export interface NewsItem {
  title: string;
  source: string;
  ts: string; // ISO
}

export interface Asset {
  sym: string;
  name: string;
  sector: string;
  price: number;
  prevClose: number;
  hv30: number; // realised vol
  iv: number; // 30d implied
  ivRank: number; // 0-100
  series: number[]; // 90 daily closes
  news: NewsItem[];
  signal: 'opportunity' | 'watch' | 'none' | 'no-trade';
  optionsSupported: boolean;
  strikeStep: number;
  summary: string;
  bull: string;
  bear: string;
  risks: string[];
}

export interface Contract {
  id: string;
  sym: string;
  side: Side;
  strike: number;
  expiry: string; // yyyy-mm-dd
  dte: number;
  bid: number | null;
  ask: number | null;
  mid: number | null;
  iv: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  oi: number;
  volume: number;
  quality: DataQuality;
  aiHighlight?: string;
}

export type TradeStage =
  | 'draft'
  | 'awaiting_approval'
  | 'approved'
  | 'awaiting_signature'
  | 'submitted'
  | 'pending'
  | 'confirmed'
  | 'failed'
  | 'unknown';

export type CheckStatus = 'pass' | 'fail' | 'warn' | 'skip';
export interface Check {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  owner: 'platform' | 'policy';
}

export interface Evidence {
  label: string;
  value: string;
  source: string;
  ts: string;
  quality: DataQuality | 'simulated';
}

export interface Alternative {
  title: string;
  detail: string;
  tradeoff: string;
}

export interface Policy {
  assets: string[];
  sides: Side[];
  strategies: string[];
  maxContracts: number;
  maxPremiumUsd: number;
  expiryMinDays: number;
  expiryMaxDays: number;
  maxExposurePct: number;
  requireVerified: boolean;
  maxPricingAgeMin: number;
}

export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'blocked';

export interface Proposal {
  id: string;
  createdAt: string;
  origin: 'agent' | 'assistant';
  sym: string;
  contractId: string;
  side: Side;
  strike: number;
  expiry: string;
  dte: number;
  qty: number;
  premium: number; // per share, ask
  quality: DataQuality;
  strategy: string;
  headline: string;
  reasoning: string[];
  evidence: Evidence[];
  risks: string[];
  alternatives: Alternative[];
  confidence: number; // 0..1
  uncertainty: string;
  status: ProposalStatus;
  decidedAt?: string;
  decisionNote?: string;
  txHash?: string;
}

export type PositionStatus = 'open' | 'pending' | 'unresolved' | 'failed' | 'expired' | 'closed';

export interface Position {
  id: string;
  contractId: string;
  sym: string;
  side: Side;
  strike: number;
  expiry: string;
  qty: number;
  entryPremium: number;
  status: PositionStatus;
  closeReason?: 'exercised' | 'released' | 'closed' | 'expired worthless';
  exitPremium?: number;
  realized?: number;
  openedAt: string;
  closedAt?: string;
  source: 'manual' | 'ai-approved' | 'ai-auto';
  txHashes: string[];
  pendingOp?: 'exercise' | 'release' | 'close';
  proposalId?: string;
}

export type TxKind = 'open' | 'exercise' | 'release' | 'close';
export type Lane = 'idle' | 'active' | 'done' | 'failed' | 'unknown';
export interface Tx {
  hash: string;
  kind: TxKind;
  title: string;
  positionId: string;
  stage: TradeStage;
  outcome: TxOutcome;
  delegated: boolean;
  startedAt: string;
  updatedAt: string;
  rechecks: number;
  note: string;
}

export type ActKind =
  | 'proposal'
  | 'approval'
  | 'rejection'
  | 'ai_decision'
  | 'no_trade'
  | 'tx_submitted'
  | 'tx_confirmed'
  | 'tx_failed'
  | 'tx_unknown'
  | 'lifecycle'
  | 'exercise_request'
  | 'release_request'
  | 'permission_change';

export interface DecisionRecord {
  action: string;
  strategy: string;
  evidence: Evidence[];
  risks: string[];
  alternatives: string[];
  confidence: number | null;
  uncertainty: string;
  checks: Check[];
  authorization: string;
  result: string;
}

export interface Activity {
  id: string;
  ts: string;
  kind: ActKind;
  actor: 'ai' | 'user' | 'system';
  title: string;
  summary: string;
  stage?: TradeStage;
  sym?: string;
  positionId?: string;
  proposalId?: string;
  txHash?: string;
  record?: DecisionRecord;
}

export interface Notice {
  id: string;
  ts: string;
  tone: 'info' | 'warn' | 'danger' | 'success';
  title: string;
  body: string;
  href?: string;
  read: boolean;
}

export type Block =
  | { t: 'p'; text: string }
  | { t: 'list'; items: string[] }
  | { t: 'analysis'; sym: string }
  | { t: 'proposal'; draft: ProposalDraft }
  | { t: 'notrade'; sym: string; reasons: string[] }
  | { t: 'compare'; sym: string; rows: { label: string; a: string; b: string }[]; aTitle: string; bTitle: string }
  | { t: 'term'; k: string }
  | { t: 'evidence'; items: Evidence[] };

export interface ProposalDraft {
  sym: string;
  side: Side;
  strike: number;
  expiry: string;
  qty: number;
  headline: string;
  thesis: string[];
}

export interface ChatMsg {
  id: string;
  role: 'user' | 'ai';
  blocks: Block[];
  ts: string;
}

export interface DemoSettings {
  dataset: 'populated' | 'empty';
  feed: FeedState;
  outcome: TxOutcome;
  agentError: boolean;
}
