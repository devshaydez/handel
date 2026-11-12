import { actionCreators, setupWalletSelector } from '@near-wallet-selector/core';
import { setupModal } from '@near-wallet-selector/modal-ui';
import { setupMyNearWallet } from '@near-wallet-selector/my-near-wallet';
import { setupMeteorWallet } from '@near-wallet-selector/meteor-wallet';
import { setupSender } from '@near-wallet-selector/sender';
import { setupBitteWallet } from '@near-wallet-selector/bitte-wallet';
import '@near-wallet-selector/modal-ui/styles.css';

const NETWORK_ID = 'testnet';
const OPTIONS_CONTRACT = (import.meta.env.VITE_HANDEL_OPTIONS_CONTRACT_ID as string | undefined) || 'options.shaydez.testnet';
const ESCROW_CONTRACT = (import.meta.env.VITE_HANDEL_ESCROW_CONTRACT_ID as string | undefined) || 'escrow.shaydez.testnet';
const RPC = 'https://rpc.testnet.near.org';
const USDC_TOKEN = import.meta.env.VITE_HANDEL_TESTNET_USDC_ACCOUNT || 'usdc.tidepool-sandbox.testnet';
const UNDERLYING_TOKEN = import.meta.env.VITE_HANDEL_TESTNET_UNDERLYING_ACCOUNT || 'wnear.tidepool-sandbox.testnet';

let selectorPromise: ReturnType<typeof setupWalletSelector> | undefined;
let modalPromise: Promise<ReturnType<typeof setupModal>> | undefined;

async function selector() {
  if (!selectorPromise) {
    selectorPromise = setupWalletSelector({
      network: NETWORK_ID,
      modules: [setupMyNearWallet(), setupMeteorWallet(), setupSender(), setupBitteWallet()],
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
async function view<T>(accountId: string, methodName: string, args: Record<string, unknown>): Promise<T> {
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(args))));
  const response = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'handel-view', method: 'query',
      params: { request_type: 'call_function', finality: 'final', account_id: accountId,
        method_name: methodName, args_base64: encoded } }),
  });
  if (!response.ok) throw new Error('NEAR RPC returned HTTP ' + response.status);
  const body = await response.json() as { result?: { result?: number[] }; error?: { message?: string } };
  if (body.error || !body.result?.result) throw new Error('NEAR view call failed: ' + (body.error?.message ?? methodName));
  const bytes = new Uint8Array(body.result.result);
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
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
async function ensureTokenStorage(token: string, accountId: string) {
  const existing = await view<unknown | null>(token, 'storage_balance_of', { account_id: accountId });
  if (existing) return;
  const bounds = await view<{ min?: string }>(token, 'storage_balance_bounds', {});
  if (!bounds.min || !/^\d+$/.test(bounds.min)) throw new Error('Token returned invalid NEP-145 storage bounds: ' + token);
  await send(token, 'storage_deposit', { account_id: accountId, registration_only: true }, bounds.min);
}
async function transferCall(token: string, escrowPositionId: string, leg: 'collateral' | 'premium', amount: string) {
  const accountId = await currentNearAccount();
  if (!accountId) throw new Error('Wallet disconnected before escrow funding.');
  await ensureTokenStorage(token, accountId);
  await ensureTokenStorage(token, ESCROW_CONTRACT!);
  const balance = await view<string>(token, 'ft_balance_of', { account_id: accountId });
  if (BigInt(balance) < BigInt(amount)) throw new Error(`Insufficient ${token} balance for ${leg}. Need ${amount} base units; wallet has ${balance}.`);
  return send(token, 'ft_transfer_call', {
    receiver_id: ESCROW_CONTRACT,
    amount,
    msg: JSON.stringify({ position_id: Number(escrowPositionId), leg }),
  }, '1', '100000000000000');
}

/**
 * Testnet-only lifecycle: create offer, register the escrow terms, fund the
 * collateral and premium using NEP-141 transfer_call, then pay the premium
 * through the escrow's callback-verified NEP-141 transfer.
 */
async function createAndFundEscrowOption(methodName: 'create_call' | 'create_put', args: Record<string, unknown>) {
  if (!OPTIONS_CONTRACT || !ESCROW_CONTRACT) {
    throw new Error('Set VITE_HANDEL_OPTIONS_CONTRACT_ID and VITE_HANDEL_ESCROW_CONTRACT_ID before trading.');
  }
  const positionTx = await send(OPTIONS_CONTRACT, methodName, args);
  let lastHash = positionTx.transactionHash;
  try {
    const positionId = returnedId(positionTx.outcome);
    const registerTx = await send(OPTIONS_CONTRACT, 'register_escrow_position', { position_id: Number(positionId) });
    lastHash = registerTx.transactionHash;
    const option = await view<{ escrow_position_id?: number | string | null }>(OPTIONS_CONTRACT, 'get_position', { position_id: Number(positionId) });
    if (option.escrow_position_id === undefined || option.escrow_position_id === null) {
      throw new Error('Escrow registration is not confirmed by OptionsContract yet.');
    }
    const escrowPositionId = String(option.escrow_position_id);
    const isCall = methodName === 'create_call';
    const collateralToken = isCall ? UNDERLYING_TOKEN : USDC_TOKEN;
    const collateralAmount = String(isCall ? args.underlying_amount : args.strike_amount_usdc);
    const collateralTx = await transferCall(collateralToken, escrowPositionId, 'collateral', collateralAmount);
    lastHash = collateralTx.transactionHash;
    const escrowState = await view<{ collateral_received?: boolean }>(ESCROW_CONTRACT, 'get_position', { position_id: Number(escrowPositionId) });
    if (escrowState.collateral_received !== true) {
      throw new Error('Escrow has not confirmed collateral receipt. Position remains pending; transaction ' + lastHash);
    }
    const premiumAmount = String(args.premium_amount_usdc);
    const premiumTx = await transferCall(USDC_TOKEN, escrowPositionId, 'premium', premiumAmount);
    lastHash = premiumTx.transactionHash;
    const premiumReceived = await view<{ received?: boolean } | null>(ESCROW_CONTRACT, 'get_premium_status', { position_id: Number(escrowPositionId) });
    if (!premiumReceived || premiumReceived.received !== true) {
      throw new Error('Escrow has not confirmed the premium transfer. Transaction ' + lastHash);
    }
    const settleTx = await send(ESCROW_CONTRACT, 'settle_premium', { position_id: Number(escrowPositionId) });
    lastHash = settleTx.transactionHash;
    const premium = await view<{ paid?: boolean } | null>(ESCROW_CONTRACT, 'get_premium_status', { position_id: Number(escrowPositionId) });
    if (!premium || premium.paid !== true) {
      throw new Error('Escrow premium payout is not confirmed. Position remains pending; transaction ' + lastHash);
    }
    const optionState = await view<{ state?: string | Record<string, unknown> }>(OPTIONS_CONTRACT, 'get_position', { position_id: Number(positionId) });
    const stateName = typeof optionState.state === 'string' ? optionState.state :
      optionState.state && typeof optionState.state === 'object' ? Object.keys(optionState.state)[0] : '';
    if (stateName !== 'Open') {
      throw new Error('Escrow reports premium paid but OptionsContract has not confirmed the Open state. Transaction ' + lastHash);
    }
    return { transactionHash: lastHash, accountId: positionTx.accountId };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Escrow lifecycle failed.';
    throw new Error(message + ' Initial offer transaction: ' + positionTx.transactionHash);
  }
}

export async function signNearContractCall(methodName: string, args: Record<string, unknown>): Promise<{ transactionHash: string; accountId: string }> {
  if (methodName === 'create_call' || methodName === 'create_put') {
    return createAndFundEscrowOption(methodName, args);
  }
  if (!OPTIONS_CONTRACT) throw new Error('VITE_HANDEL_OPTIONS_CONTRACT_ID is not configured.');
  const result = await send(OPTIONS_CONTRACT, methodName, args);
  return { transactionHash: result.transactionHash, accountId: result.accountId };
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
  await send(ESCROW_CONTRACT, 'propose_controller', { controller: OPTIONS_CONTRACT });
  await send(OPTIONS_CONTRACT, 'accept_escrow_controller', {});
}
export async function disconnectNearWallet(): Promise<void> {
  const s = await selector();
  await (await s.wallet()).signOut();
}
