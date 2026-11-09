/**
 * Phase 19 — typed NEP-141 transfer_call requests into the audited Handel escrow.
 * This creates wallet transaction arguments only; it does not claim custody until
 * the token receipt and Escrow state are independently observed.
 */
export type EscrowDepositLeg = "collateral" | "premium" | "exercise_payment";
export interface EscrowDepositRequest {
  tokenAccountId: string;
  escrowAccountId: string;
  callerAccountId: string;
  expectedSenderAccountId: string;
  positionId: string;
  leg: EscrowDepositLeg;
  amount: string;
}
export interface FungibleTokenTransferCallArgs {
  receiver_id: string;
  amount: string;
  msg: string;
}
const UINT128_MAX=(1n<<128n)-1n;
const ACCOUNT=/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
function account(v:string,label:string):void { if(v.length<2||v.length>64||!ACCOUNT.test(v)) throw Error(`${label} is not a valid NEAR account ID`); }
export function buildEscrowDepositTransferCall(input:EscrowDepositRequest):FungibleTokenTransferCallArgs {
  account(input.tokenAccountId,"token account");
  account(input.escrowAccountId,"escrow account");
  account(input.callerAccountId,"caller account");
  account(input.expectedSenderAccountId,"expected sender");
  if(input.callerAccountId!==input.expectedSenderAccountId) throw Error("connected wallet is not the authorized sender for this deposit leg");
  if(!/^(0|[1-9][0-9]*)$/.test(input.positionId)||BigInt(input.positionId)>(1n<<64n)-1n) throw Error("positionId must be a canonical uint64 string");
  if(!/^[1-9][0-9]*$/.test(input.amount)||input.amount.length>39||BigInt(input.amount)>UINT128_MAX) throw Error("amount must be a positive uint128 integer string");
  if(!["collateral","premium","exercise_payment"].includes(input.leg)) throw Error("unsupported escrow deposit leg");
  return {
    receiver_id: input.escrowAccountId,
    amount: input.amount,
    msg: JSON.stringify({position_id:Number(input.positionId),leg:input.leg}),
  };
}
