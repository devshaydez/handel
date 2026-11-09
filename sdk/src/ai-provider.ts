/** Provider-neutral client for a Handel-controlled backend AI gateway. */
import { createHash } from "node:crypto";
import type { AgentProposal } from "./types.js";
export interface AiGatewayConfig { endpoint:string; apiKey?:string; model:string; timeoutMs?:number; maxResponseBytes?:number; maxRequests?:number; windowMs?:number; }
export interface ProposalProvenance { source:"ai_gateway"|"deterministic_fallback"; provider:string; model:string; requestId:string|null; requestHash:string; responseHash:string; receivedAt:string; }
export interface GeneratedProposal { proposal:AgentProposal; provenance:ProposalProvenance; }
export type FetchLike=(input:string|URL|Request,init?:RequestInit)=>Promise<Response>;
const KEYS=["proposalId","type","underlyingAssetId","strike","quantity","premium","expiryNs","estimatedPayoff","risks","dataFreshness","rationale","createdAt"] as const;
export class AiGatewayError extends Error { constructor(message:string,readonly code:string){super(message);this.name="AiGatewayError";} }
export class SlidingWindowRateLimiter {
 private hits:number[]=[];
 constructor(private limit:number,private windowMs:number){if(!Number.isSafeInteger(limit)||limit<1||!Number.isSafeInteger(windowMs)||windowMs<1)throw Error("invalid rate-limit configuration");}
 take(now=Date.now()):boolean{while(this.hits.length&&this.hits[0]<=now-this.windowMs)this.hits.shift();if(this.hits.length>=this.limit)return false;this.hits.push(now);return true;}
}
export class AiProposalGateway {
 private limiter:SlidingWindowRateLimiter; private fetcher:FetchLike;
 constructor(private config:AiGatewayConfig,fetcher:FetchLike=fetch){
  const url=new URL(config.endpoint);if(url.protocol!=="https:"&&url.hostname!=="localhost"&&url.hostname!=="127.0.0.1")throw Error("AI gateway endpoint must use HTTPS");
  if(!config.model.trim())throw Error("AI gateway model is required");this.fetcher=fetcher;this.limiter=new SlidingWindowRateLimiter(config.maxRequests??10,config.windowMs??60000);
 }
 async generate(input:unknown,fallback:()=>AgentProposal):Promise<GeneratedProposal>{
  const body=JSON.stringify({schema_version:"1",task:"handel_option_proposal",input});const requestHash=hash(body);
  if(!this.config.apiKey){const proposal=validateProposalShape(fallback());return{proposal,provenance:{source:"deterministic_fallback",provider:"none",model:"deterministic",requestId:null,requestHash,responseHash:hash(JSON.stringify(proposal)),receivedAt:new Date().toISOString()}};}
  if(!this.limiter.take())throw new AiGatewayError("AI proposal rate limit exceeded","RATE_LIMITED");
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),this.config.timeoutMs??12000);
  try{
   const res=await this.fetcher(this.config.endpoint,{method:"POST",headers:{"content-type":"application/json","authorization":`Bearer ${this.config.apiKey}`,"x-handel-schema-version":"1"},body,signal:controller.signal});
   const raw=await res.text();if(new TextEncoder().encode(raw).byteLength>(this.config.maxResponseBytes??32768))throw new AiGatewayError("AI gateway response exceeded size limit","RESPONSE_TOO_LARGE");
   if(!res.ok)throw new AiGatewayError(`AI gateway returned HTTP ${res.status}`,"UPSTREAM_ERROR");
   let value:unknown;try{value=JSON.parse(raw);}catch{throw new AiGatewayError("AI gateway returned malformed JSON","INVALID_JSON");}
   if(!record(value)||!exact(value,["proposal","provider","model","requestId"]))throw new AiGatewayError("AI gateway envelope has an invalid shape","INVALID_ENVELOPE");
   for(const k of ["provider","model","requestId"] as const)if(typeof value[k]!=="string"||!value[k].trim()||value[k].length>128)throw new AiGatewayError(`AI gateway ${k} is invalid`,"INVALID_ENVELOPE");
   if(value.model!==this.config.model)throw new AiGatewayError("AI gateway model does not match configured model","MODEL_MISMATCH");
   const proposal=validateProposalShape(value.proposal);
   return{proposal,provenance:{source:"ai_gateway",provider:value.provider as string,model:value.model as string,requestId:value.requestId as string,requestHash,responseHash:hash(raw),receivedAt:new Date().toISOString()}};
  }catch(e){if(e instanceof AiGatewayError)throw e;if(controller.signal.aborted)throw new AiGatewayError("AI gateway request timed out","TIMEOUT");throw new AiGatewayError("AI gateway request failed","NETWORK_ERROR");}finally{clearTimeout(timer);}
 }
}
export function validateProposalShape(v:unknown):AgentProposal{
 if(!record(v)||!exact(v,KEYS))throw new AiGatewayError("proposal has missing or unexpected fields","INVALID_PROPOSAL");
 if(v.type!=="Call"&&v.type!=="Put")throw new AiGatewayError("proposal type must be Call or Put","INVALID_PROPOSAL");
 for(const k of ["proposalId","underlyingAssetId","strike","quantity","premium","expiryNs","estimatedPayoff","dataFreshness","rationale","createdAt"] as const)
  if(typeof v[k]!=="string"||v[k].length===0||v[k].length>4000)throw new AiGatewayError(`proposal ${k} is invalid`,"INVALID_PROPOSAL");
 if(v.proposalId.length>128||v.underlyingAssetId.length>128)throw new AiGatewayError("proposal identifier exceeds size limit","INVALID_PROPOSAL");
 if(!Array.isArray(v.risks)||v.risks.length>20||v.risks.some(x=>typeof x!=="string"||x.length>500))throw new AiGatewayError("proposal risks are invalid","INVALID_PROPOSAL");
 return v as unknown as AgentProposal;
}
function record(v:unknown):v is Record<string,any>{return typeof v==="object"&&v!==null&&!Array.isArray(v);}
function exact(v:Record<string,unknown>,keys:readonly string[]):boolean{return Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));}
function hash(v:string):string{return"sha256:"+createHash("sha256").update(v).digest("hex");}
