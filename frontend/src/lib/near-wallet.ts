import { setupWalletSelector } from '@near-wallet-selector/core';
import { setupModal } from '@near-wallet-selector/modal-ui';
import { setupMyNearWallet } from '@near-wallet-selector/my-near-wallet';
import '@near-wallet-selector/modal-ui/styles.css';

const NETWORK_ID = 'testnet';
const CONTRACT_ID = import.meta.env.VITE_HANDEL_OPTIONS_CONTRACT_ID as string | undefined;

let selectorPromise: ReturnType<typeof setupWalletSelector> | undefined;
let modalPromise: Promise<ReturnType<typeof setupModal>> | undefined;

async function selector() {
  if (!selectorPromise) {
    selectorPromise = setupWalletSelector({
      network: { networkId: NETWORK_ID, nodeUrl: 'https://rpc.testnet.near.org', walletUrl: 'https://testnet.mynearwallet.com', helperUrl: 'https://helper.testnet.near.org', explorerUrl: 'https://testnet.nearblocks.io' },
      modules: [setupMyNearWallet()],
    });
  }
  return selectorPromise;
}

async function modal() {
  if (!modalPromise) {
    modalPromise = selector().then((s) => setupModal(s, { contractId: CONTRACT_ID ?? '' }));
  }
  return modalPromise;
}

export async function connectNearWallet(): Promise<{ accountId: string; network: string }> {
  const s = await selector();
  if (!s.isSignedIn()) (await modal()).show();
  // The modal completes asynchronously after the user selects a wallet.
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
  return s.store.getState().accounts.find((item) => item.active)?.accountId ?? null;
}

export async function signNearContractCall(methodName: string, args: Record<string, unknown>): Promise<{ transactionHash: string; accountId: string }> {
  if (!CONTRACT_ID) throw new Error('VITE_HANDEL_OPTIONS_CONTRACT_ID is not configured.');
  const s = await selector();
  const accountId = s.store.getState().accounts.find((item) => item.active)?.accountId ?? s.store.getState().accounts[0]?.accountId;
  if (!accountId) throw new Error('Connect your NEAR Testnet wallet before approving.');
  const wallet = await s.wallet();
  const result = await wallet.signAndSendTransaction({
    receiverId: CONTRACT_ID,
    actions: [{
      type: 'FunctionCall',
      params: {
        methodName,
        args,
        gas: '30000000000000',
        deposit: '0',
      },
    }],
  });
  const transactionHash = result.transaction?.hash;
  if (!transactionHash) throw new Error('Wallet returned without a transaction hash.');
  return { transactionHash, accountId };
}

export async function disconnectNearWallet(): Promise<void> {
  const s = await selector();
  const wallet = await s.wallet();
  await wallet.signOut();
}
