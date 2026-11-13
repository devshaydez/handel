export interface TestnetAsset {
  symbol: string;
  assetId: string;
  tokenAccount: string;
  decimals: number;
  status: 'configured' | 'candidate' | 'not_enabled';
  role: string;
}

export const TESTNET_ASSETS: TestnetAsset[] = [
  {
    symbol: 'USDC',
    assetId: 'nep141:usdc.tidepool-sandbox.testnet',
    tokenAccount: 'usdc.tidepool-sandbox.testnet',
    decimals: 6,
    status: 'configured',
    role: 'Configured premium and exercise-payment asset',
  },
  {
    symbol: 'wNEAR',
    assetId: 'nep141:wnear.tidepool-sandbox.testnet',
    tokenAccount: 'wnear.tidepool-sandbox.testnet',
    decimals: 24,
    status: 'candidate',
    role: 'Candidate underlying; verify the contract asset registry before execution',
  },
  {
    symbol: 'USDT',
    assetId: 'nep141:usdt.tidepool-sandbox.testnet',
    tokenAccount: 'usdt.tidepool-sandbox.testnet',
    decimals: 6,
    status: 'not_enabled',
    role: 'Not enabled for Handel option execution',
  },
  {
    symbol: 'wBTC',
    assetId: 'nep141:wbtc.tidepool-sandbox.testnet',
    tokenAccount: 'wbtc.tidepool-sandbox.testnet',
    decimals: 8,
    status: 'not_enabled',
    role: 'Not enabled for Handel option execution',
  },
  {
    symbol: 'ETH',
    assetId: 'nep141:eth.tidepool-sandbox.testnet',
    tokenAccount: 'eth.tidepool-sandbox.testnet',
    decimals: 18,
    status: 'not_enabled',
    role: 'Not enabled for Handel option execution',
  },
  {
    symbol: 'XAUT',
    assetId: 'nep141:xaut.tidepool-sandbox.testnet',
    tokenAccount: 'xaut.tidepool-sandbox.testnet',
    decimals: 6,
    status: 'not_enabled',
    role: 'Not enabled for Handel option execution',
  },
];
