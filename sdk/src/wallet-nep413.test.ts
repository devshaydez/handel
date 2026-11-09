import {describe,it} from "node:test"; import assert from "node:assert/strict";
import {signNep413WithConnectedWallet} from "./wallet-nep413.js";
import type {Nep413Payload} from "./types.js";
const payload: Nep413Payload={recipient:"verifier.testnet",nonce:"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",message:JSON.stringify({signer_id:"alice.testnet",deadline:"2026-11-09T22:00:00.000Z",intents:[{intent:"transfer"}]})};
const wallet={accountId:"alice.testnet",async signMessage(){return{publicKey:"ed25519:test",signature:"sig"}}};
const approval={approved:true,expectedAccountId:"alice.testnet",allowedVerifierIds:["verifier.testnet"] as const};
describe("NEP-413 connected wallet boundary",()=>{
 it("signs only after explicit approval using matching connected wallet",async()=>{const r=await signNep413WithConnectedWallet({payload,approval,wallet,nowMs:Date.parse("2026-11-09T21:45:00Z")});assert.equal(r.standard,"nep413");assert.equal(r.public_key,"ed25519:test")});
 it("rejects missing principal approval before wallet call",async()=>{await assert.rejects(()=>signNep413WithConnectedWallet({payload,approval:{...approval,approved:false},wallet,nowMs:Date.parse("2026-11-09T21:45:00Z")}),/approval required/)});
 it("rejects wrong wallet and verifier",async()=>{await assert.rejects(()=>signNep413WithConnectedWallet({payload,approval,wallet:{...wallet,accountId:"mallory.testnet"},nowMs:Date.parse("2026-11-09T21:45:00Z")}),/does not match/);await assert.rejects(()=>signNep413WithConnectedWallet({payload,approval:{...approval,allowedVerifierIds:["other.testnet"]},wallet,nowMs:Date.parse("2026-11-09T21:45:00Z")}),/not an approved verifier/)});
 it("rejects expired or overlong deadlines",async()=>{await assert.rejects(()=>signNep413WithConnectedWallet({payload:{...payload,message:JSON.stringify({signer_id:"alice.testnet",deadline:"2026-11-09T21:40:00Z",intents:[{}]})},approval,wallet,nowMs:Date.parse("2026-11-09T21:45:00Z")}),/expired/);await assert.rejects(()=>signNep413WithConnectedWallet({payload:{...payload,message:JSON.stringify({signer_id:"alice.testnet",deadline:"2026-11-09T23:00:00Z",intents:[{}]})},approval,wallet,nowMs:Date.parse("2026-11-09T21:45:00Z")}),/exceeds/)});
});
