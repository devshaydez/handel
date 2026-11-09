/** Phase 17 bounded, revocable agent permissions. Contract remains authoritative. */
export interface OnChainAgentPolicy { principal:string; allowed_assets:string[]; max_underlying_amount:string; max_premium_usdc:string; max_collateral_usdc:string; max_open_positions:number; expires_at_ns:string; enabled:boolean; }
export type AgentExecutionMode = "education" | "advisory" | "manual_approval" | "delegated";
export interface AgentPermissionSnapshot { agentId:string; policy:OnChainAgentPolicy; mode:AgentExecutionMode; observedAtNs:string; blockHeight:number; }
export interface ProposedExposure { assetId:string; underlyingAmount:string; premiumUsdc:string; collateralUsdc:string; currentOpenPositions:number; }
export type PermissionDecision = {allowed:true;requiresPrincipalApproval:boolean;reason:string[]} | {allowed:false;requiresPrincipalApproval:true;reason:string[]};
const UINT=/^(0|[1-9][0-9]*)$/; const MAX_UINT256=(1n<<256n)-1n;
function parseUint(v:string,field:string):bigint { if(!UINT.test(v)||v.length>78) throw Error(`${field} must be a canonical unsigned integer string`); const n=BigInt(v); if(n>MAX_UINT256) throw Error(`${field} exceeds uint256`); return n; }
function validAccountId(v:string):boolean { return v.length>=2&&v.length<=64&&/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(v); }
export function validateAgentPermissionSnapshot(s:AgentPermissionSnapshot,principal:string,nowNs:bigint,maxSnapshotAgeNs=60_000_000_000n):string[] {
 const e:string[]=[]; const p=s?.policy;
 if(!s||!validAccountId(s.agentId)) e.push("agent account ID is invalid");
 if(!p||!validAccountId(p.principal)||p.principal!==principal) e.push("policy principal does not match connected user");
 if(!p||!Array.isArray(p.allowed_assets)||!p.allowed_assets.length||p.allowed_assets.some(x=>typeof x!=="string"||!x.trim())||new Set(p.allowed_assets).size!==p.allowed_assets.length) e.push("allowed asset list is invalid");
 if(!p||typeof p.enabled!=="boolean") e.push("policy enabled state is missing");
 if(!p||!Number.isSafeInteger(p.max_open_positions)||p.max_open_positions<=0) e.push("max_open_positions must be a positive safe integer");
 if(!validAccountId(principal)) e.push("connected principal account ID is invalid");
 if(!p||!UINT.test(p.expires_at_ns)) e.push("policy expiry is invalid"); else if(BigInt(p.expires_at_ns)<=nowNs) e.push("agent policy is expired");
 if(s&&typeof s.observedAtNs==="string"&&UINT.test(s.observedAtNs)){
  const observed=BigInt(s.observedAtNs);
  if(observed>nowNs) e.push("permission snapshot timestamp is in the future");
  else if(nowNs-observed>maxSnapshotAgeNs) e.push("permission snapshot is stale; refresh on-chain policy before trading");
 }
 for(const [field,v] of [["max_underlying_amount",p?.max_underlying_amount],["max_premium_usdc",p?.max_premium_usdc],["max_collateral_usdc",p?.max_collateral_usdc],["observedAtNs",s?.observedAtNs]] as const) { if(typeof v!=="string") e.push(`${field} is missing`); else try{parseUint(v,field)}catch(x){e.push(x instanceof Error?x.message:`${field} is invalid`)} }
 if(!s||!Number.isSafeInteger(s.blockHeight)||s.blockHeight<0) e.push("permission block height is invalid");
 if(!s||!["education","advisory","manual_approval","delegated"].includes(s.mode)) e.push("execution mode is invalid");
 return e;
}
/** Local preflight only. The contract must re-check every limit at execution time. */
export function authorizeAgentExposure(i:{snapshot:AgentPermissionSnapshot;expectedPrincipal:string;exposure:ProposedExposure;nowNs:bigint}):PermissionDecision {
 const reasons=validateAgentPermissionSnapshot(i.snapshot,i.expectedPrincipal,i.nowNs); const p=i.snapshot.policy; const x=i.exposure;
 if(!p?.enabled) reasons.push("agent permission is disabled or revoked");
 if(!x||!p?.allowed_assets?.includes(x.assetId)) reasons.push("asset is not permitted");
 for(const [label,value,cap] of [["underlying amount",x?.underlyingAmount,p?.max_underlying_amount],["premium",x?.premiumUsdc,p?.max_premium_usdc],["collateral",x?.collateralUsdc,p?.max_collateral_usdc]] as const){ try{if(typeof value!=="string"||typeof cap!=="string"||parseUint(value,label)===0n||parseUint(value,label)>parseUint(cap,`${label} cap`)) reasons.push(`${label} is zero, invalid, or exceeds the on-chain cap`)}catch(err){reasons.push(err instanceof Error?err.message:`${label} is invalid`)} }
 if(!Number.isSafeInteger(x?.currentOpenPositions)||x.currentOpenPositions<0||x.currentOpenPositions>=(p?.max_open_positions??0)) reasons.push("maximum open-position count reached or invalid");
 if(i.snapshot.mode==="education"||i.snapshot.mode==="advisory") reasons.push("education/advisory mode cannot execute trades");
 if(reasons.length) return {allowed:false,requiresPrincipalApproval:true,reason:[...new Set(reasons)]};
 const approval=i.snapshot.mode!=="delegated"; return {allowed:true,requiresPrincipalApproval:approval,reason:approval?["preflight passed; principal approval remains required"]:["preflight passed; delegated execution remains bounded by on-chain limits and revocation"]};
}
