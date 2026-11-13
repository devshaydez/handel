export interface OptionPosition {
  id: number | string;
  writer: string;
  holder: string;
  kind?: string;
  asset_id?: string;
  underlying_amount?: string;
  strike_amount_usdc?: string;
  expiry_ns?: string | number;
  premium_amount_usdc?: string;
  state?: string;
  [key: string]: unknown;
}
