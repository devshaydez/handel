/** Off-chain preflight; the contract remains the authoritative policy check. */
import type{AgentPermission,AgentProposal,PolicyResult}from"./types.js";
import{isOndoUnderlying,USDC_ASSET_ID}from"./assets.js";
const MAX=(1n<<256n)-1n;
export function validateProposal(p:AgentProposal,permission:AgentPermission|null,opts:{nowNs?:bigint;requireAgent?:boolean}={}):PolicyResult{
 const errors:string[]=[],warnings:string[]=[];const now=opts.nowNs??BigInt(Date.now())*1_000_000n;
 if(!p||typeof p!=="object")return{ok:false,errors:["proposal must be an object"],warnings};
 if(typeof p.proposalId!=="string"||!p.proposalId.trim()||p.proposalId.length>128)errors.push("proposalId is missing or invalid");
 if(p.type!=="Call"&&p.type!=="Put")errors.push("type must be Call or Put");
 if(typeof p.underlyingAssetId!=="string"||!isOndoUnderlying(p.underlyingAssetId))errors.push(`underlying not a supported Ondo asset: ${String(p.underlyingAssetId)}`);
 const strike=big(p.strike),quantity=big(p.quantity),premium=big(p.premium),expiry=big(p.expiryNs);
 if(strike===null||strike===0n)errors.push("strike must be positive uint256 integer string");
 if(quantity===null||quantity===0n)errors.push("quantity must be positive uint256 integer string");
 if(premium===null||premium===0n)errors.push("premium must be positive uint256 integer string");
 if(expiry===null)errors.push("expiryNs must be uint256 integer string");else if(expiry<=now)errors.push("expiry must be in the future");
 if(opts.requireAgent||permission){if(!permission)errors.push("agent permission required but not provided");else{
  if(!permission.enabled)errors.push("agent is disabled / revoked");
  if(!Array.isArray(permission.allowedAssets)||!permission.allowedAssets.includes(p.underlyingAssetId))errors.push("underlying not in agent's allowedAssets");
  const mq=big(permission.maxQuantity),mp=big(permission.maxPremium),mn=big(permission.minExpiryNs),mx=big(permission.maxExpiryNs);
  if(mq===null||mp===null||mn===null||mx===null||mn>mx)errors.push("agent limits are invalid");
  if(mq!==null&&quantity!==null&&quantity>mq)errors.push("quantity exceeds agent maxQuantity");
  if(mp!==null&&premium!==null&&premium>mp)errors.push("premium exceeds agent maxPremium");
  if(mn!==null&&expiry!==null&&expiry<mn)errors.push("expiry before agent minExpiryNs");
  if(mx!==null&&expiry!==null&&expiry>mx)errors.push("expiry after agent maxExpiryNs");
 }}
 if(typeof p.dataFreshness!=="string"||!p.dataFreshness)warnings.push("dataFreshness missing — market data age unknown");else{const d=Date.parse(p.dataFreshness);if(Number.isNaN(d))warnings.push("dataFreshness not parseable ISO date");else if(Date.now()-d>300000)warnings.push("market data older than 5 minutes");}
 if(!Array.isArray(p.risks)||!p.risks.length)warnings.push("no risks listed in proposal");
 return{ok:errors.length===0,errors,warnings};
}
function big(v:unknown):bigint|null{if(typeof v!=="string"||v.length>78||!/^\d+$/.test(v))return null;try{const n=BigInt(v);return n<=MAX?n:null;}catch{return null;}}
export function requiredCollateral(type:"Call"|"Put",quantity:string,strike:string):{assetId:string;amount:string}{return type==="Call"?{assetId:"underlying",amount:quantity}:{assetId:USDC_ASSET_ID,amount:strike};}
