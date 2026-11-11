#!/usr/bin/env node
import fs from "node:fs";
import process from "node:process";
const file=process.argv[2]??"config/testnet-deployment.json", errors=[];
const fail=m=>errors.push(m), obj=v=>v!==null&&typeof v==="object"&&!Array.isArray(v);
function account(v,l){if(typeof v!=="string"||!v.endsWith(".testnet")||v.length>64||!/^[a-z0-9._-]+$/.test(v)||/REPLACE|[<>]/.test(v))fail(l+" must be a real, valid-looking .testnet account ID (not a placeholder)");}
function digest(v,l){if(typeof v!=="string"||!/^[a-f0-9]{64}$/i.test(v))fail(l+" must be a 64-character SHA-256 hex digest");}
function required(v,l){if(v!==true)fail(l+" must be explicitly true");}
function nonempty(v,l){if(typeof v!=="string"||!v.trim()||/REPLACE|[<>]/.test(v))fail(l+" must be supplied (no placeholders)");}
function scan(v,p="manifest"){if(Array.isArray(v))return v.forEach((x,i)=>scan(x,p+"["+i+"]"));if(!obj(v))return;for(const [k,x] of Object.entries(v)){if(/(private.?key|seed.?phrase|mnemonic|secret|api.?key|keychain.?export)/i.test(k))fail(p+"."+k+" is prohibited; never put credentials or key material in this manifest");scan(x,p+"."+k);}}
let m;try{m=JSON.parse(fs.readFileSync(file,"utf8"));}catch(e){console.error("Cannot read deployment manifest "+file+": "+e.message);process.exit(2);}
if(!obj(m))fail("manifest root must be a JSON object");
if(m.version!==1)fail("version must be 1");
if(m.network!=="near-testnet")fail("network must be exactly near-testnet");
scan(m);
const o=m.contracts?.options,e=m.contracts?.escrow;
if(!obj(o))fail("contracts.options is required");else{account(o.accountId,"contracts.options.accountId");digest(o.artifactSha256,"contracts.options.artifactSha256");}
if(!obj(e))fail("contracts.escrow is required");else{account(e.accountId,"contracts.escrow.accountId");digest(e.artifactSha256,"contracts.escrow.artifactSha256");}
if(o?.accountId&&e?.accountId&&o.accountId===e.accountId)fail("OptionsContract and Escrow must use distinct accounts");
account(m.operator?.accountId,"operator.accountId");required(m.operator?.accountKeyPolicyReviewed,"operator.accountKeyPolicyReviewed");
const r=m.release;if(!obj(r))fail("release section is required");else{if(!["fresh-deployment","audited-redeployment","migration-approved"].includes(r.stateDisposition))fail("release.stateDisposition must explicitly select a reviewed disposition");required(r.migrationPlanReviewed,"release.migrationPlanReviewed");required(r.rollbackPlanReviewed,"release.rollbackPlanReviewed");required(r.independentSecurityReview,"release.independentSecurityReview");required(r.deploymentApproval,"release.deploymentApproval");}
if(!Array.isArray(m.assets)||!m.assets.length)fail("assets must contain at least one explicitly selected Testnet asset");else{const seen=new Set();m.assets.forEach((a,i)=>{const p="assets["+i+"]";if(!obj(a)){fail(p+" must be an object");return;}nonempty(a.assetId,p+".assetId");account(a.tokenAccount,p+".tokenAccount");if(!Number.isInteger(a.decimals)||a.decimals<0||a.decimals>255)fail(p+".decimals must be an integer from 0 to 255");if(a.enabled!==true)fail(p+".enabled must be true for each selected asset");required(a.metadataVerified,p+".metadataVerified");required(a.optionsStorageRegistered,p+".optionsStorageRegistered");required(a.escrowStorageRegistered,p+".escrowStorageRegistered");if(typeof a.assetId==="string"){if(seen.has(a.assetId))fail("duplicate asset ID: "+a.assetId);seen.add(a.assetId);}});}
if(errors.length){console.error("Testnet deployment preflight: BLOCKED");errors.forEach(x=>console.error("- "+x));console.error("No deployment or transaction was attempted.");process.exit(1);}
console.log(JSON.stringify({status:"PREFLIGHT_PASS",network:m.network,optionsAccount:o.accountId,escrowAccount:e.accountId,operatorAccount:m.operator.accountId,selectedAssets:m.assets.map(({assetId,tokenAccount,decimals})=>({assetId,tokenAccount,decimals})),safety:"Validation only. No account, key, storage deposit, deployment, or token transaction was created or submitted."},null,2));
