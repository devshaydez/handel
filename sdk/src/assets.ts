/** Verified asset registry — keep in sync with contracts/options/src/assets.rs */

export const USDC_ASSET_ID =
  "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";
export const USDC_DECIMALS = 6;

export const NVDAON_ASSET_ID =
  "nep141:bnb-0xa9ee28c80f960b889dfbd1902055218cba016f75.omdep.near";
export const TSLAON_ASSET_ID =
  "nep141:bnb-0x2494b603319d4d9f9715c9f4496d9e0364b59d93.omdep.near";
export const AAPLON_ASSET_ID =
  "nep141:bnb-0x390a684ef9cade28a7ad0dfa61ab1eb3842618c4.omdep.near";
export const SPYON_ASSET_ID =
  "nep141:bnb-0x6a708ead771238919d85930b5a0f10454e1c331a.omdep.near";
export const ONDO_DECIMALS = 18;

export const INTENTS_VERIFIER = "intents.near";
export const TIDEPOOL_VERIFIER = "verifier.tidepool-sandbox.testnet";

export const ASSETS = [
  { assetId: USDC_ASSET_ID, symbol: "USDC", decimals: USDC_DECIMALS, enabled: true },
  { assetId: NVDAON_ASSET_ID, symbol: "NVDAon", decimals: ONDO_DECIMALS, enabled: true },
  { assetId: TSLAON_ASSET_ID, symbol: "TSLAon", decimals: ONDO_DECIMALS, enabled: true },
  { assetId: AAPLON_ASSET_ID, symbol: "AAPLon", decimals: ONDO_DECIMALS, enabled: true },
  { assetId: SPYON_ASSET_ID, symbol: "SPYon", decimals: ONDO_DECIMALS, enabled: true },
] as const;

export function isOndoUnderlying(assetId: string): boolean {
  return [NVDAON_ASSET_ID, TSLAON_ASSET_ID, AAPLON_ASSET_ID, SPYON_ASSET_ID].includes(assetId);
}
