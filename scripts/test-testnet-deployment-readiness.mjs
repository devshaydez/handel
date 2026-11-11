import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
const script=path.resolve("scripts/check-testnet-deployment-readiness.mjs");
const valid=()=>({version:1,network:"near-testnet",contracts:{options:{accountId:"handel-options.testnet",artifactSha256:"a".repeat(64)},escrow:{accountId:"handel-escrow.testnet",artifactSha256:"b".repeat(64)}},operator:{accountId:"handel-operator.testnet",accountKeyPolicyReviewed:true},release:{stateDisposition:"fresh-deployment",migrationPlanReviewed:true,rollbackPlanReviewed:true,independentSecurityReview:true,deploymentApproval:true},assets:[{assetId:"nep141:usdc.tidepool-sandbox.testnet",tokenAccount:"usdc.tidepool-sandbox.testnet",decimals:6,enabled:true,metadataVerified:true,optionsStorageRegistered:true,escrowStorageRegistered:true}]});
function run(m){const d=fs.mkdtempSync(path.join(os.tmpdir(),"handel-preflight-")),f=path.join(d,"manifest.json");fs.writeFileSync(f,JSON.stringify(m));const r=spawnSync(process.execPath,[script,f],{encoding:"utf8"});fs.rmSync(d,{recursive:true,force:true});return r;}
test("accepts complete approved manifest and submits nothing",()=>{const r=run(valid());assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/PREFLIGHT_PASS/);assert.match(r.stdout,/No account, key, storage deposit, deployment, or token transaction/);});
test("blocks missing Escrow NEP-145 registration",()=>{const m=valid();m.assets[0].escrowStorageRegistered=false;const r=run(m);assert.notEqual(r.status,0);assert.match(r.stderr,/escrowStorageRegistered/);});
test("blocks placeholders and non-Testnet accounts",()=>{const m=valid();m.contracts.options.accountId="REPLACE_ME.testnet";m.contracts.escrow.accountId="escrow.near";const r=run(m);assert.notEqual(r.status,0);assert.match(r.stderr,/not a placeholder/);assert.match(r.stderr,/valid-looking \.testnet account ID/);});
test("blocks missing approvals and key policy review",()=>{const m=valid();m.release.independentSecurityReview=false;m.release.deploymentApproval=false;m.operator.accountKeyPolicyReviewed=false;const r=run(m);assert.notEqual(r.status,0);assert.match(r.stderr,/independentSecurityReview/);assert.match(r.stderr,/deploymentApproval/);assert.match(r.stderr,/accountKeyPolicyReviewed/);});
test("rejects credentials in manifest",()=>{const m=valid();m.operator.privateKey="nope";const r=run(m);assert.notEqual(r.status,0);assert.match(r.stderr,/privateKey is prohibited/);});
test("blocks duplicate contract accounts and asset IDs",()=>{const m=valid();m.contracts.escrow.accountId=m.contracts.options.accountId;m.assets.push({...m.assets[0]});const r=run(m);assert.notEqual(r.status,0);assert.match(r.stderr,/distinct accounts/);assert.match(r.stderr,/duplicate asset ID/);});
