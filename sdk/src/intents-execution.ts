/**
 * Phase 18 — paired NEAR Intents execution boundary.
 * Simulation is read-only; submission is delegated to an explicitly approved wallet.
 * No direct transaction signing or private-key handling exists in this module.
 */
import type { SignedNep413 } from "./types.js";
import { createHash } from "node:crypto";

export interface IntentsSimulation {
  intents_executed?: unknown[];
  logs?: string[];
  invariant_violated?: unknown;
  state?: Record<string, unknown>;
  /** SHA-256 of the exact validated signed payload pair used for simulation. */
  payloadHash?: string;
  verifier?: string;
  [key: string]: unknown;
}
export interface ExecuteIntentsArgs { signed: SignedNep413[]; }
export interface IntentsWalletSubmitter {
  accountId: string;
  callFunction(input: {
    contractId: string;
    methodName: "execute_intents";
    args: ExecuteIntentsArgs;
    gas: string;
    depositYocto: string;
  }): Promise<{ transactionHash: string }>;
}
const ACCOUNT=/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
function signedPayloadHash(args:ExecuteIntentsArgs):string{return createHash("sha256").update(JSON.stringify(args)).digest("hex");}

export function buildExecuteIntentsArgs(signed: SignedNep413[], verifier="intents.near"): ExecuteIntentsArgs {
  if(!Array.isArray(signed)||signed.length<2) throw new Error("paired settlement requires at least two independently signed intents");
  if(!ACCOUNT.test(verifier)) throw new Error("verifier account ID is invalid");
  const nonces=new Set<string>();
  for(const [index,item] of signed.entries()){
    if(item.standard!=="nep413") throw new Error(`signed intent ${index} must use NEP-413`);
    if(item.payload.recipient!==verifier) throw new Error(`signed intent ${index} targets a different verifier`);
    if(!item.public_key||!item.signature) throw new Error(`signed intent ${index} is incomplete`);
    let message:unknown;try{message=JSON.parse(item.payload.message)}catch{throw new Error(`signed intent ${index} message is invalid JSON`)}
    if(!message||typeof message!=="object"||Array.isArray(message)) throw new Error(`signed intent ${index} message must be an object`);
    const body=message as Record<string,unknown>;
    if(typeof body.signer_id!=="string"||typeof body.deadline!=="string"||!Array.isArray(body.intents)||!body.intents.length) throw new Error(`signed intent ${index} is missing required fields`);
    if(!/^[A-Za-z0-9+/]{43}=$/.test(item.payload.nonce)) throw new Error(`signed intent ${index} nonce must be base64-encoded 32 bytes`);
    if(nonces.has(item.payload.nonce)) throw new Error("paired intents must use distinct nonces");
    nonces.add(item.payload.nonce);
  }
  return {signed:structuredClone(signed)};
}

export async function simulateSignedIntents(input:{
  rpcUrl:string; signed:SignedNep413[]; verifier?:string;
  fetcher?:(input:string|URL,init?:RequestInit)=>Promise<Response>;
}):Promise<IntentsSimulation>{
  const verifier=input.verifier??"intents.near";
  const args=buildExecuteIntentsArgs(input.signed,verifier);
  const url=new URL(input.rpcUrl);
  if(url.protocol!=="https:"&&url.hostname!=="localhost"&&url.hostname!=="127.0.0.1") throw new Error("NEAR RPC endpoint must use HTTPS");
  const fetcher=input.fetcher??fetch;
  const response=await fetcher(input.rpcUrl,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
    jsonrpc:"2.0",id:"handel-intents-simulation",method:"query",
    params:{request_type:"call_function",finality:"final",account_id:verifier,method_name:"simulate_intents",args_base64:Buffer.from(JSON.stringify(args)).toString("base64")}
  })});
  if(!response.ok) throw new Error(`NEAR RPC simulation HTTP ${response.status}`);
  const body=await response.json() as {result?:{result?:number[]};error?:{message?:string}};
  if(body.error) throw new Error(body.error.message??"NEAR RPC simulation failed");
  if(!Array.isArray(body.result?.result)) throw new Error("NEAR RPC simulation returned no result bytes");
  const decoded=Buffer.from(body.result.result).toString("utf8");
  let result:IntentsSimulation;try{result=JSON.parse(decoded)}catch{throw new Error("NEAR Intents simulation result is invalid JSON")}
  return {...result,payloadHash:signedPayloadHash(args),verifier};
}

/** Submits only after a positive simulation and explicit user approval. */
export async function executeSimulatedIntents(input:{
  approved:boolean; connectedAccountId:string; submitter:IntentsWalletSubmitter;
  signed:SignedNep413[]; simulation:IntentsSimulation; verifier?:string;
}):Promise<{transactionHash:string}>{
  if(input.approved!==true) throw new Error("explicit user approval required before execute_intents");
  if(input.connectedAccountId!==input.submitter.accountId) throw new Error("connected wallet does not match transaction submitter");
  if(input.simulation.invariant_violated!==undefined&&input.simulation.invariant_violated!==null&&input.simulation.invariant_violated!==false) throw new Error("NEAR Intents simulation reports an invariant violation");
  if(!Array.isArray(input.simulation.intents_executed)||input.simulation.intents_executed.length===0) throw new Error("simulation did not confirm executable intents");
  const verifier=input.verifier??"intents.near";
  const args=buildExecuteIntentsArgs(input.signed,verifier);
  if(input.simulation.verifier!==verifier||input.simulation.payloadHash!==signedPayloadHash(args)) throw new Error("simulation does not bind to this exact signed intent pair and verifier");
  const result=await input.submitter.callFunction({contractId:input.verifier??"intents.near",methodName:"execute_intents",args,gas:"100000000000000",depositYocto:"0"});
  if(!result.transactionHash) throw new Error("wallet did not return a transaction hash");
  return result;
}
