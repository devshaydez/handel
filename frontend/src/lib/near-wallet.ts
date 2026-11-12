import { actionCreators, setupWalletSelector, type WalletModuleFactory } from '@near-wallet-selector/core';
import { setupModal } from '@near-wallet-selector/modal-ui';
import { setupMyNearWallet } from '@near-wallet-selector/my-near-wallet';
import { setupMeteorWallet } from '@near-wallet-selector/meteor-wallet';
import { setupSender } from '@near-wallet-selector/sender';
import { setupBitteWallet } from '@near-wallet-selector/bitte-wallet';
import '@near-wallet-selector/modal-ui/styles.css';

const NETWORK_ID = 'testnet';
const OPTIONS_CONTRACT = (import.meta.env.VITE_HANDEL_OPTIONS_CONTRACT_ID as string | undefined) || 'options.shaydez.testnet';
const ESCROW_CONTRACT = (import.meta.env.VITE_HANDEL_ESCROW_CONTRACT_ID as string | undefined) || 'escrow.shaydez.testnet';
const RPCS = ['https://rpc.testnet.near.org', 'https://rpc.testnet.fastnear.com'];
const USDC_TOKEN = import.meta.env.VITE_HANDEL_TESTNET_USDC_ACCOUNT || 'usdc.tidepool-sandbox.testnet';
const UNDERLYING_TOKEN = import.meta.env.VITE_HANDEL_TESTNET_UNDERLYING_ACCOUNT || 'wnear.tidepool-sandbox.testnet';

export interface AgentProposalAuthorization {
  message: string;
  nonce: string;
  recipient: string;
  callbackUrl: string;
  issuedAtMs: string;
  publicKey: string;
  signature: string;
}
export async function signAgentProposalIntent(input: {
  holder: string;
  kind: 'Call' | 'Put';
  assetId: string;
  quantity: string;
  strike: string;
  premium: string;
  expiryNs: string;
}): Promise<AgentProposalAuthorization> {
  const accountId = await currentNearAccount();
  if (!accountId || accountId !== input.holder) throw new Error('Connect the principal wallet that owns this agent before requesting a proposal.');
  const s = await selector();
  const wallet = await s.wallet();
  if (typeof wallet.signMessage !== 'function') {
    throw new Error('The selected wallet does not support NEP-413 message signing. Use a connected wallet that supports signMessage.');
  }
  const nonceBytes = crypto.getRandomValues(new Uint8Array(32));
  const nonce = btoa(Array.from(nonceBytes, (byte) => String.fromCharCode(byte)).join(''));
  const issuedAtMs = String(Date.now());
  const recipient = 'handel-live.vercel.app';
  const callbackUrl = window.location.href;
  const message = [
    'Handel agent proposal authorization',
    'Action: submit one pending options proposal for principal approval',
    'Version: 1',
    'Principal: ' + input.holder,
    'Option type: ' + input.kind,
    'Asset ID: ' + input.assetId,
    'Underlying amount (base units): ' + input.quantity,
    'Strike amount (USDC base units): ' + input.strike,
    'Premium amount (USDC base units): ' + input.premium,
    'Expiry (nanoseconds): ' + input.expiryNs,
    'Issued at (milliseconds): ' + issuedAtMs,
  ].join('\n');
  const signed = await wallet.signMessage({ message, recipient, nonce: nonceBytes as never, callbackUrl });
  if (!signed || !signed.signature || !signed.publicKey || signed.accountId !== input.holder) {
    throw new Error('The wallet did not return a verifiable NEP-413 signature. No proposal was submitted.');
  }
  const signatureValue = signed.signature as unknown;
  const signature = typeof signatureValue === 'string'
    ? signatureValue
    : btoa(Array.from(new Uint8Array(signatureValue as ArrayLike<number>), (byte) => String.fromCharCode(byte)).join(''));
  return { message, nonce, recipient, callbackUrl, issuedAtMs, publicKey: signed.publicKey.toString(), signature };
}

export interface WalletTransactionResult {
  transactionHash: string;
  accountId: string;
  positionId?: string;
  escrowPositionId?: string;
  transactionSteps?: { hash: string; label: string }[];
}

let selectorPromise: ReturnType<typeof setupWalletSelector> | undefined;
let modalPromise: Promise<ReturnType<typeof setupModal>> | undefined;

async function selector() {
  if (!selectorPromise) {
    selectorPromise = setupWalletSelector({
      network: NETWORK_ID,
      modules: [setupMyNearWallet(), setupMeteorWallet(), setupSender(), setupBitteWallet()] as WalletModuleFactory[],
    });
  }
  return selectorPromise;
}
async function modal() {
  if (!modalPromise) modalPromise = selector().then((s) => setupModal(s, { contractId: OPTIONS_CONTRACT ?? '' }));
  return modalPromise;
}
export async function connectNearWallet(): Promise<{ accountId: string; network: string }> {
  const s = await selector();
  const existing = s.store.getState().accounts.find((item) => item.active)?.accountId ?? s.store.getState().accounts[0]?.accountId;
  if (existing) return { accountId: existing, network: NETWORK_ID };
  (await modal()).show();
  const accountId = await new Promise<string>((resolve, reject) => {
    let subscription: { unsubscribe: () => void } | undefined;
    const timeout = window.setTimeout(() => { subscription?.unsubscribe(); reject(new Error('Wallet connection timed out. Please try connecting again.')); }, 120_000);
    subscription = s.store.observable.subscribe((state) => {
      const account = state.accounts.find((item) => item.active)?.accountId ?? state.accounts[0]?.accountId;
      if (account) { window.clearTimeout(timeout); subscription?.unsubscribe(); resolve(account); }
    });
  });
  return { accountId, network: NETWORK_ID };
}
export async function currentNearAccount(): Promise<string | null> {
  const s = await selector();
  return s.store.getState().accounts.find((item) => item.active)?.accountId ?? s.store.getState().accounts[0]?.accountId ?? null;
}

async function send(receiverId: string, methodName: string, args: Record<string, unknown>, deposit = '0', gas = '30000000000000') {
  const s = await selector();
  const accountId = s.store.getState().accounts.find((item) => item.active)?.accountId ?? s.store.getState().accounts[0]?.accountId;
  if (!accountId) throw new Error('Connect your NEAR Testnet wallet before approving.');
  const wallet = await s.wallet();
  const result = await wallet.signAndSendTransaction({
    receiverId,
    actions: [actionCreators.functionCall(methodName, args, BigInt(gas), BigInt(deposit))],
  });
  if (!result) throw new Error('This wallet completed a redirect-based signing flow. Reopen Handel from the wallet return page and check the transaction before retrying.');
  const outcome = result as unknown as { transaction?: { hash?: string }; status?: { SuccessValue?: string } };
  const transactionHash = outcome.transaction?.hash;
  if (!transactionHash) throw new Error('Wallet returned without a transaction hash.');
  return { transactionHash, accountId, outcome };
}
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stableJson).join(',') + ']';
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return '{' + Object.keys(record).sort().map((key) => JSON.stringify(key) + ':' + stableJson(record[key])).join(',') + '}';
  }
  return JSON.stringify(value) ?? 'null';
}
async function view<T>(accountId: string, methodName: string, args: Record<string, unknown>): Promise<T> {
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(args))));
  const responses = await Promise.all(RPCS.map(async (rpc) => {
    const response = await fetch(rpc, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'handel-view', method: 'query',
        params: { request_type: 'call_function', finality: 'final', account_id: accountId,
          method_name: methodName, args_base64: encoded } }),
    });
    if (!response.ok) throw new Error(rpc + ' returned HTTP ' + response.status);
    const body = await response.json() as { result?: { result?: number[] }; error?: { message?: string } };
    if (body.error || !body.result?.result) throw new Error(rpc + ' view failed: ' + (body.error?.message ?? methodName));
    return JSON.parse(new TextDecoder().decode(new Uint8Array(body.result.result))) as T;
  }));
  if (stableJson(responses[0]) !== stableJson(responses[1])) {
    throw new Error('Independent Testnet RPCs disagree on ' + accountId + '.' + methodName + '; settlement remains unconfirmed.');
  }
  return responses[0]!;
}

async function getTestnetTokenBalance(tokenAccount: string, decimals: number, label: string, accountId?: string): Promise<number> {
  const owner = accountId ?? await currentNearAccount();
  if (!owner) return 0;
  const raw = await view<string>(tokenAccount, 'ft_balance_of', { account_id: owner });
  if (!/^\d+$/.test(raw)) throw new Error(`Testnet ${label} returned an invalid balance.`);
  const balance = Number(BigInt(raw)) / 10 ** decimals;
  if (!Number.isFinite(balance)) throw new Error(`Testnet ${label} balance is outside the supported display range.`);
  return balance;
}

export function getTestnetUsdcBalance(accountId?: string): Promise<number> {
  return getTestnetTokenBalance(USDC_TOKEN, 6, 'USDC', accountId);
}

export function getTestnetWnearBalance(accountId?: string): Promise<number> {
  return getTestnetTokenBalance(UNDERLYING_TOKEN, 24, 'wNEAR', accountId);
}

export interface OnChainAgentPolicy {
  principal: string;
  allowed_assets: string[];
  max_underlying_amount: string;
  max_premium_usdc: string;
  max_collateral_usdc: string;
  max_open_positions: number;
  expires_at_ns: number | string;
  enabled: boolean;
}
const AGENT_ACCOUNT = (import.meta.env.VITE_HANDEL_AGENT_ACCOUNT_ID as string | undefined) || 'handel-agent.shaydez.testnet';
export async function getOnChainAgentPolicy(): Promise<OnChainAgentPolicy | null> {
  return view<OnChainAgentPolicy | null>(OPTIONS_CONTRACT, 'get_agent_policy', { agent_id: AGENT_ACCOUNT });
}
export async function saveOnChainAgentPolicy(input: {
  allowedAssets: string[];
  maxUnderlyingAmount: string;
  maxPremiumUsdc: string;
  maxCollateralUsdc: string;
  maxOpenPositions: number;
  validityDays: number;
}): Promise<{ transactionHash: string; policy: OnChainAgentPolicy }> {
  const principal = await currentNearAccount();
  if (!principal) throw new Error('Connect the principal NEAR Testnet wallet before saving agent permissions.');
  if (!input.allowedAssets.length) throw new Error('Select at least one enabled asset.');
  for (const [label, value] of [['underlying', input.maxUnderlyingAmount], ['premium', input.maxPremiumUsdc], ['collateral', input.maxCollateralUsdc]] as const) {
    if (!/^\d+$/.test(value) || BigInt(value) <= 0n) throw new Error('The maximum ' + label + ' amount must be a positive integer in base units.');
  }
  if (!Number.isInteger(input.maxOpenPositions) || input.maxOpenPositions < 1) throw new Error('Maximum open positions must be a positive whole number.');
  if (!Number.isInteger(input.validityDays) || input.validityDays < 1 || input.validityDays > 365) throw new Error('Policy validity must be between 1 and 365 days.');
  const expiresAtNs = (BigInt(Date.now()) + BigInt(input.validityDays) * 86_400_000n) * 1_000_000n;
  const tx = await send(OPTIONS_CONTRACT, 'set_agent_policy_exact', {
    agent_id: AGENT_ACCOUNT,
    allowed_assets: input.allowedAssets,
    max_underlying_amount: input.maxUnderlyingAmount,
    max_premium_usdc: input.maxPremiumUsdc,
    max_collateral_usdc: input.maxCollateralUsdc,
    max_open_positions: input.maxOpenPositions,
    expires_at_ns: expiresAtNs.toString(),
  });
  const policy = await getOnChainAgentPolicy();
  const policyExpiryNs = policy ? BigInt(policy.expires_at_ns) : 0n;
  const expiryDifferenceNs = policyExpiryNs >= expiresAtNs
    ? policyExpiryNs - expiresAtNs
    : expiresAtNs - policyExpiryNs;
  const expectedAssets = [...input.allowedAssets].sort();
  const actualAssets = policy ? [...policy.allowed_assets].sort() : [];
  if (!policy || policy.principal !== principal || policy.enabled !== true ||
      policy.max_underlying_amount !== input.maxUnderlyingAmount ||
      policy.max_premium_usdc !== input.maxPremiumUsdc ||
      policy.max_collateral_usdc !== input.maxCollateralUsdc ||
      policy.max_open_positions !== input.maxOpenPositions ||
      actualAssets.length !== expectedAssets.length ||
      actualAssets.some((asset, index) => asset !== expectedAssets[index]) ||
      policyExpiryNs <= BigInt(Date.now()) * 1_000_000n ||
      expiryDifferenceNs > 1_000n) {
    throw new Error('The wallet transaction was submitted, but the on-chain agent policy could not be independently verified. Transaction: ' + tx.transactionHash);
  }
  return { transactionHash: tx.transactionHash, policy };
}
function returnedId(outcome: { status?: { SuccessValue?: string } }): string {
  const encoded = outcome.status?.SuccessValue;
  if (!encoded) throw new Error('OptionsContract did not return a position ID.');
  const value = JSON.parse(atob(encoded));
  if (!(typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value)))) {
    throw new Error('OptionsContract returned an invalid position ID.');
  }
  return String(value);
}
async function ensureTokenStorage(token: string, accountId: string): Promise<string | null> {
  const existing = await view<unknown | null>(token, 'storage_balance_of', { account_id: accountId });
  if (existing) return null;
  const bounds = await view<{ min?: string }>(token, 'storage_balance_bounds', {});
  if (!bounds.min || !/^\d+$/.test(bounds.min)) throw new Error('Token returned invalid NEP-145 storage bounds: ' + token);
  const registration = await send(token, 'storage_deposit', { account_id: accountId, registration_only: true }, bounds.min);
  return registration.transactionHash;
}
async function transferCall(
  token: string,
  escrowPositionId: string,
  leg: 'collateral' | 'premium' | 'exercise_payment',
  amount: string,
  onSubmitted?: (hash: string, label: string) => void,
) {
  const accountId = await currentNearAccount();
  if (!accountId) throw new Error('Wallet disconnected before escrow funding.');
  const balance = await view<string>(token, 'ft_balance_of', { account_id: accountId });
  if (BigInt(balance) < BigInt(amount)) throw new Error(`Insufficient ${token} balance for ${leg}. Need ${amount} base units; wallet has ${balance}.`);
  const preparatoryTransactions: string[] = [];
  const accountRegistration = await ensureTokenStorage(token, accountId);
  if (accountRegistration) {
    preparatoryTransactions.push(accountRegistration);
    onSubmitted?.(accountRegistration, 'Token storage registration');
  }
  const escrowRegistration = await ensureTokenStorage(token, ESCROW_CONTRACT!);
  if (escrowRegistration) {
    preparatoryTransactions.push(escrowRegistration);
    onSubmitted?.(escrowRegistration, 'Token storage registration');
  }
  const transfer = await send(token, 'ft_transfer_call', {
    receiver_id: ESCROW_CONTRACT,
    amount,
    msg: JSON.stringify({ position_id: Number(escrowPositionId), leg }),
  }, '1', '100000000000000');
  const label = leg === 'collateral' ? 'Collateral transfer' : leg === 'premium' ? 'Premium transfer' : 'Exercise payment';
  onSubmitted?.(transfer.transactionHash, label);
  return { ...transfer, preparatoryTransactions };
}

/**
 * Testnet-only lifecycle: create offer, register the escrow terms, fund the
 * collateral and premium using NEP-141 transfer_call, then pay the premium
 * through the escrow's callback-verified NEP-141 transfer.
 */
async function fundExistingEscrowPosition(positionId: string, methodName: 'create_call' | 'create_put', args: Record<string, unknown>, accountId: string, initialSteps: { hash: string; label: string }[]) {
  let lastHash = initialSteps.at(-1)?.hash || '';
  const transactionSteps = [...initialSteps];
  try {
    let option = await view<{ escrow_position_id?: number | string | null }>(OPTIONS_CONTRACT!, 'get_position', { position_id: Number(positionId) });
    if (option.escrow_position_id === undefined || option.escrow_position_id === null) {
      const registerTx = await send(OPTIONS_CONTRACT!, 'register_escrow_position', { position_id: Number(positionId) });
      lastHash = registerTx.transactionHash;
      transactionSteps.push({ hash: registerTx.transactionHash, label: 'Escrow registration' });
      option = await view<{ escrow_position_id?: number | string | null }>(OPTIONS_CONTRACT!, 'get_position', { position_id: Number(positionId) });
    }
    if (option.escrow_position_id === undefined || option.escrow_position_id === null) {
      throw new Error('Escrow registration is not confirmed by OptionsContract yet.');
    }
    const escrowPositionId = String(option.escrow_position_id);
    const isCall = methodName === 'create_call';
    const collateralToken = isCall ? UNDERLYING_TOKEN : USDC_TOKEN;
    const collateralAmount = String(isCall ? args.underlying_amount : args.strike_amount_usdc);
    let escrowState = await view<{ collateral_received?: boolean } | null>(ESCROW_CONTRACT!, 'get_position', { position_id: Number(escrowPositionId) });
    if (escrowState?.collateral_received !== true) {
      const collateralTx = await transferCall(collateralToken, escrowPositionId, 'collateral', collateralAmount, (hash, label) => {
        lastHash = hash;
        transactionSteps.push({ hash, label });
      });
      lastHash = collateralTx.transactionHash;
      escrowState = await view<{ collateral_received?: boolean } | null>(ESCROW_CONTRACT!, 'get_position', { position_id: Number(escrowPositionId) });
    }
    if (escrowState?.collateral_received !== true) {
      throw new Error('Escrow has not confirmed collateral receipt. Position remains pending; transaction ' + lastHash);
    }
    const premiumAmount = String(args.premium_amount_usdc);
    let premiumStatus = await view<{ received?: boolean; paid?: boolean } | null>(ESCROW_CONTRACT!, 'get_premium_status', { position_id: Number(escrowPositionId) });
    if (!premiumStatus?.received) {
      const premiumTx = await transferCall(USDC_TOKEN, escrowPositionId, 'premium', premiumAmount, (hash, label) => {
        lastHash = hash;
        transactionSteps.push({ hash, label });
      });
      lastHash = premiumTx.transactionHash;
      premiumStatus = await view<{ received?: boolean; paid?: boolean } | null>(ESCROW_CONTRACT!, 'get_premium_status', { position_id: Number(escrowPositionId) });
    }
    if (!premiumStatus?.received) {
      throw new Error('Escrow has not confirmed the premium transfer. Transaction ' + lastHash);
    }
    if (!premiumStatus.paid) {
      const settleTx = await send(ESCROW_CONTRACT!, 'settle_premium', { position_id: Number(escrowPositionId) });
      lastHash = settleTx.transactionHash;
      transactionSteps.push({ hash: settleTx.transactionHash, label: 'Premium settlement' });
      premiumStatus = await view<{ received?: boolean; paid?: boolean } | null>(ESCROW_CONTRACT!, 'get_premium_status', { position_id: Number(escrowPositionId) });
    }
    if (!premiumStatus?.paid) {
      throw new Error('Escrow premium payout is not confirmed. Position remains pending; transaction ' + lastHash);
    }
    const optionState = await view<{ state?: string | Record<string, unknown> }>(OPTIONS_CONTRACT!, 'get_position', { position_id: Number(positionId) });
    const stateName = typeof optionState.state === 'string' ? optionState.state :
      optionState.state && typeof optionState.state === 'object' ? Object.keys(optionState.state)[0] : '';
    if (stateName !== 'Open') {
      throw new Error('Escrow reports premium paid but OptionsContract has not confirmed the Open state. Transaction ' + lastHash);
    }
    return { transactionHash: lastHash || String(args.agent_tx_hash || ''), transactionSteps, accountId, positionId, escrowPositionId };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Escrow lifecycle failed.';
    const prior = transactionSteps.length ? ' Transactions submitted: ' + transactionSteps.map((step) => step.hash).join(', ') : '';
    throw new Error(message + prior);
  }
}
async function createAndFundEscrowOption(methodName: 'create_call' | 'create_put', args: Record<string, unknown>) {
  if (!OPTIONS_CONTRACT || !ESCROW_CONTRACT) {
    throw new Error('Set VITE_HANDEL_OPTIONS_CONTRACT_ID and VITE_HANDEL_ESCROW_CONTRACT_ID before trading.');
  }
  const positionTx = await send(OPTIONS_CONTRACT, methodName, args);
  const positionId = returnedId(positionTx.outcome);
  return fundExistingEscrowPosition(positionId, methodName, args, positionTx.accountId, [{ hash: positionTx.transactionHash, label: 'Option creation' }]);
}
async function approveAndFundAgentProposal(args: Record<string, unknown>): Promise<WalletTransactionResult> {
  if (!OPTIONS_CONTRACT || !ESCROW_CONTRACT) throw new Error('Handel Testnet contracts are not configured.');
  const proposalId = String(args.proposal_id || '');
  const positionId = String(args.position_id || '');
  const kind = String(args.kind || '');
  if (!proposalId || !/^\d+$/.test(positionId) || (kind !== 'Call' && kind !== 'Put')) {
    throw new Error('Agent proposal approval payload is incomplete or invalid.');
  }
  const methodName = kind === 'Call' ? 'create_call' : 'create_put';
  const optionArgs = {
    underlying_amount: String(args.underlying_amount),
    strike_amount_usdc: String(args.strike_amount_usdc),
    premium_amount_usdc: String(args.premium_amount_usdc),
    agent_tx_hash: String(args.agent_tx_hash || ''),
  };
  if (Object.values(optionArgs).slice(0, 3).some((value) => !/^\d+$/.test(value))) {
    throw new Error('Agent proposal contains invalid option amounts.');
  }
  const accountId = await currentNearAccount();
  if (!accountId) throw new Error('Connect the principal wallet to approve this agent proposal.');
  const proposal = await view<{ state?: string; principal?: string } | null>(OPTIONS_CONTRACT, 'get_agent_proposal', { proposal_id: proposalId });
  if (!proposal) throw new Error('The on-chain agent proposal could not be found.');
  if (proposal.principal !== accountId) throw new Error('Only the proposal principal can approve and fund this agent proposal.');
  const initialSteps: { hash: string; label: string }[] = [];
  const agentSubmissionHash = String(args.agent_tx_hash || '');
  if (agentSubmissionHash) initialSteps.push({ hash: agentSubmissionHash, label: 'Agent proposal submission' });
  if (proposal.state === 'PendingApproval') {
    const approvalTx = await send(OPTIONS_CONTRACT, 'approve_agent_proposal', { proposal_id: proposalId });
    initialSteps.push({ hash: approvalTx.transactionHash, label: 'Principal approval' });
  } else if (proposal.state !== 'Approved') {
    throw new Error('This agent proposal is no longer pending approval.');
  }
  return fundExistingEscrowPosition(positionId, methodName, optionArgs, accountId, initialSteps);
}
/**
 * Principal-authorized collateral funding for an agent-created Testnet option.
 * This intentionally transfers only the writer collateral leg. It never sends
 * premium: the holder must authorize premium payment from their own wallet.
 */
export async function authorizeDelegatedCollateralFunding(
  positionId: string,
  expectedEscrowPositionId: string,
): Promise<WalletTransactionResult> {
  if (!OPTIONS_CONTRACT || !ESCROW_CONTRACT) throw new Error('Handel Testnet contracts are not configured.');
  if (!/^\d+$/.test(positionId) || !/^\d+$/.test(expectedEscrowPositionId) ||
      !Number.isSafeInteger(Number(positionId)) || !Number.isSafeInteger(Number(expectedEscrowPositionId))) {
    throw new Error('Position identifiers must be safe unsigned integers.');
  }
  const principal = await currentNearAccount();
  if (!principal) throw new Error('Connect the principal wallet to authorize collateral funding.');
  const option = await view<{
    writer: string; kind: 'Call' | 'Put'; underlying_amount: string | number;
    strike_amount_usdc: string | number; state: string; escrow_position_id?: string | number | null;
  }>(OPTIONS_CONTRACT, 'get_position', { id: Number(positionId) });
  if (option.writer !== principal) throw new Error('Only the policy principal can fund this agent-created writer position.');
  if (String(option.escrow_position_id ?? '') !== expectedEscrowPositionId) {
    throw new Error('Escrow position does not match the OptionsContract position.');
  }
  if (option.state !== 'PendingCollateral') throw new Error('This position is not awaiting principal collateral funding.');
  const escrow = await view<{ collateral_received?: boolean }>(ESCROW_CONTRACT, 'get_position', {
    position_id: Number(expectedEscrowPositionId),
  });
  if (escrow.collateral_received === true) throw new Error('Escrow already confirms collateral receipt.');
  const token = option.kind === 'Call' ? UNDERLYING_TOKEN : USDC_TOKEN;
  const amount = String(option.kind === 'Call' ? option.underlying_amount : option.strike_amount_usdc);
  if (!/^\d+$/.test(amount) || BigInt(amount) <= 0n) throw new Error('OptionsContract returned an invalid collateral amount.');
  const transfer = await transferCall(token, expectedEscrowPositionId, 'collateral', amount);
  const confirmed = await view<{ collateral_received?: boolean }>(ESCROW_CONTRACT, 'get_position', {
    position_id: Number(expectedEscrowPositionId),
  });
  if (confirmed.collateral_received !== true) {
    throw new Error('Collateral transfer was submitted but Escrow has not confirmed receipt yet. Transaction: ' + transfer.transactionHash);
  }
  return {
    transactionHash: transfer.transactionHash,
    accountId: principal,
    positionId,
    escrowPositionId: expectedEscrowPositionId,
    transactionSteps: [{ hash: transfer.transactionHash, label: 'Principal-authorized collateral transfer' }],
  };
}

/**
 * Holder-authorized premium payment for an agent-created Testnet option.
 * This is a separate wallet action from writer collateral funding.
 */
export async function authorizeDelegatedPremiumPayment(
  positionId: string,
  expectedEscrowPositionId: string,
): Promise<WalletTransactionResult> {
  if (!OPTIONS_CONTRACT || !ESCROW_CONTRACT) throw new Error('Handel Testnet contracts are not configured.');
  if (!/^\d+$/.test(positionId) || !/^\d+$/.test(expectedEscrowPositionId)) {
    throw new Error('Position identifiers must be unsigned integers.');
  }
  const holder = await currentNearAccount();
  if (!holder) throw new Error('Connect the holder wallet to authorize premium payment.');
  const option = await view<{
    holder: string; premium_amount_usdc: string | number; escrow_position_id?: string | number | null;
  }>(OPTIONS_CONTRACT, 'get_position', { id: Number(positionId) });
  if (option.holder !== holder) throw new Error('Only the option holder can authorize premium payment.');
  if (String(option.escrow_position_id ?? '') !== expectedEscrowPositionId) {
    throw new Error('Escrow position does not match the OptionsContract position.');
  }
  const escrow = await view<{ collateral_received?: boolean }>(ESCROW_CONTRACT, 'get_position', {
    position_id: Number(expectedEscrowPositionId),
  });
  if (escrow.collateral_received !== true) throw new Error('Writer collateral must be confirmed before premium payment.');
  const premium = String(option.premium_amount_usdc);
  if (!/^\d+$/.test(premium) || BigInt(premium) <= 0n) throw new Error('OptionsContract returned an invalid premium amount.');
  let status = await view<{ received?: boolean; paid?: boolean }>(ESCROW_CONTRACT, 'get_premium_status', {
    position_id: Number(expectedEscrowPositionId),
  });
  const steps: { hash: string; label: string }[] = [];
  if (!status.received) {
    const transfer = await transferCall(USDC_TOKEN, expectedEscrowPositionId, 'premium', premium);
    steps.push({ hash: transfer.transactionHash, label: 'Holder-authorized premium transfer' });
    status = await view<{ received?: boolean; paid?: boolean }>(ESCROW_CONTRACT, 'get_premium_status', {
      position_id: Number(expectedEscrowPositionId),
    });
  }
  if (!status.received) throw new Error('Premium transfer was submitted but Escrow has not confirmed receipt yet.');
  if (!status.paid) {
    const settlement = await send(ESCROW_CONTRACT, 'settle_premium', { position_id: Number(expectedEscrowPositionId) });
    steps.push({ hash: settlement.transactionHash, label: 'Escrow premium settlement' });
    status = await view<{ received?: boolean; paid?: boolean }>(ESCROW_CONTRACT, 'get_premium_status', {
      position_id: Number(expectedEscrowPositionId),
    });
  }
  if (!status.paid) throw new Error('Escrow has not confirmed premium settlement.');
  return {
    transactionHash: steps.at(-1)?.hash ?? '',
    accountId: holder,
    positionId,
    escrowPositionId: expectedEscrowPositionId,
    transactionSteps: steps,
  };
}

export async function signNearContractCall(methodName: string, args: Record<string, unknown>): Promise<WalletTransactionResult> {
  if (methodName === 'create_call' || methodName === 'create_put') {
    return createAndFundEscrowOption(methodName, args);
  }
  if (methodName === 'approve_agent_proposal') {
    return approveAndFundAgentProposal(args);
  }
  if (!OPTIONS_CONTRACT) throw new Error('VITE_HANDEL_OPTIONS_CONTRACT_ID is not configured.');
  const result = await send(OPTIONS_CONTRACT, methodName, args);
  return { transactionHash: result.transactionHash, transactionSteps: [{ hash: result.transactionHash, label: methodName }], accountId: result.accountId };
}
export async function configureTestnetEscrow(): Promise<void> {
  if (!OPTIONS_CONTRACT || !ESCROW_CONTRACT) throw new Error('Set both Testnet contract IDs before configuring escrow.');
  const usdcAsset = 'nep141:usdc.tidepool-sandbox.testnet';
  const wnearAsset = 'nep141:wnear.tidepool-sandbox.testnet';
  await send(OPTIONS_CONTRACT, 'set_asset', { asset_id: usdcAsset, decimals: 6, enabled: true });
  await send(OPTIONS_CONTRACT, 'set_asset', { asset_id: wnearAsset, decimals: 24, enabled: true });
  await send(OPTIONS_CONTRACT, 'set_usdc_asset_id', { asset_id: usdcAsset });
  await send(OPTIONS_CONTRACT, 'set_escrow_contract', { escrow_contract: ESCROW_CONTRACT });
  await send(OPTIONS_CONTRACT, 'set_escrow_token_account', { asset_id: usdcAsset, token_account: USDC_TOKEN });
  await send(OPTIONS_CONTRACT, 'set_escrow_token_account', { asset_id: wnearAsset, token_account: UNDERLYING_TOKEN });
  await send(ESCROW_CONTRACT, 'set_demo_self_trade', { enabled: true });
  await send(ESCROW_CONTRACT, 'propose_controller', { controller: OPTIONS_CONTRACT });
  await send(OPTIONS_CONTRACT, 'accept_escrow_controller', {});
}
export async function exerciseEscrowPosition(positionId: string, escrowPositionId: string): Promise<WalletTransactionResult> {
  if (!OPTIONS_CONTRACT || !ESCROW_CONTRACT) throw new Error('Handel Testnet contracts are not configured.');
  const accountId = await currentNearAccount();
  if (!accountId) throw new Error('Connect your NEAR Testnet wallet first.');
  const position = await view<{ payment_token: string; payment_amount: string | number }>(ESCROW_CONTRACT, 'get_position', { position_id: Number(escrowPositionId) });
  const paymentSteps: { hash: string; label: string }[] = [];
  const paymentTx = await transferCall(position.payment_token, escrowPositionId, 'exercise_payment', String(position.payment_amount),
    (hash, label) => paymentSteps.push({ hash, label }));
  const received = await view<{ exercise_payment_received?: boolean }>(ESCROW_CONTRACT, 'get_position', { position_id: Number(escrowPositionId) });
  if (received.exercise_payment_received !== true) throw new Error('Escrow has not confirmed exercise payment. Transaction ' + paymentTx.transactionHash);
  const settleTx = await send(ESCROW_CONTRACT, 'settle_exercise', { position_id: Number(escrowPositionId) });
  const escrowState = await view<{ state?: string | Record<string, unknown>; payment_paid?: boolean; collateral_delivered_to_holder?: boolean }>(ESCROW_CONTRACT, 'get_position', { position_id: Number(escrowPositionId) });
  const stateName = typeof escrowState.state === 'string' ? escrowState.state :
    escrowState.state && typeof escrowState.state === 'object' ? Object.keys(escrowState.state)[0] : '';
  if (stateName !== 'Settled' || escrowState.payment_paid !== true || escrowState.collateral_delivered_to_holder !== true) {
    throw new Error('Escrow has not verified both exercise payout legs. Transaction ' + settleTx.transactionHash);
  }
  const option = await view<{ state?: string | Record<string, unknown> }>(OPTIONS_CONTRACT, 'get_position', { position_id: Number(positionId) });
  const optionState = typeof option.state === 'string' ? option.state :
    option.state && typeof option.state === 'object' ? Object.keys(option.state)[0] : '';
  if (optionState !== 'Settled') throw new Error('Escrow settled, but OptionsContract callback has not confirmed Settled. Transaction ' + settleTx.transactionHash);
  return { transactionHash: settleTx.transactionHash, transactionSteps: [
    ...paymentSteps,
    { hash: settleTx.transactionHash, label: 'Exercise settlement' },
  ], accountId, positionId, escrowPositionId };
}

export async function releaseExpiredEscrowPosition(positionId: string, escrowPositionId: string): Promise<WalletTransactionResult> {
  if (!OPTIONS_CONTRACT || !ESCROW_CONTRACT) throw new Error('Handel Testnet contracts are not configured.');
  const accountId = await currentNearAccount();
  if (!accountId) throw new Error('Connect your NEAR Testnet wallet first.');
  const releaseTx = await send(ESCROW_CONTRACT, 'release_expired_collateral', { position_id: Number(escrowPositionId) });
  const escrowState = await view<{ state?: string | Record<string, unknown>; collateral_returned_to_writer?: boolean }>(ESCROW_CONTRACT, 'get_position', { position_id: Number(escrowPositionId) });
  const stateName = typeof escrowState.state === 'string' ? escrowState.state :
    escrowState.state && typeof escrowState.state === 'object' ? Object.keys(escrowState.state)[0] : '';
  if (stateName !== 'Expired' || escrowState.collateral_returned_to_writer !== true) {
    throw new Error('Escrow has not verified the collateral return. Transaction ' + releaseTx.transactionHash);
  }
  const option = await view<{ state?: string | Record<string, unknown> }>(OPTIONS_CONTRACT, 'get_position', { position_id: Number(positionId) });
  const optionState = typeof option.state === 'string' ? option.state :
    option.state && typeof option.state === 'object' ? Object.keys(option.state)[0] : '';
  if (optionState !== 'Expired') throw new Error('Escrow returned collateral, but OptionsContract callback has not confirmed Expired. Transaction ' + releaseTx.transactionHash);
  return { transactionHash: releaseTx.transactionHash, transactionSteps: [{ hash: releaseTx.transactionHash, label: 'Expiry collateral release' }], accountId, positionId, escrowPositionId };
}

export async function disconnectNearWallet(): Promise<void> {
  const s = await selector();
  await (await s.wallet()).signOut();
}
