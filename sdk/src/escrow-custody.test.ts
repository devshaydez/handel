import {describe,it} from "node:test"; import assert from "node:assert/strict";
import {buildEscrowDepositTransferCall} from "./escrow-custody.js";
const base={tokenAccountId:"usdc.testnet",escrowAccountId:"escrow.testnet",callerAccountId:"alice.testnet",expectedSenderAccountId:"alice.testnet",positionId:"7",leg:"collateral" as const,amount:"1000000"};
describe("NEP-141 escrow deposit builder",()=>{
 it("builds exact ft_transfer_call args for the authorized writer",()=>{const r=buildEscrowDepositTransferCall(base);assert.equal(r.receiver_id,"escrow.testnet");assert.equal(r.amount,"1000000");assert.deepEqual(JSON.parse(r.msg),{position_id:7,leg:"collateral"})});
 it("rejects a different connected wallet",()=>assert.throws(()=>buildEscrowDepositTransferCall({...base,callerAccountId:"mallory.testnet"}),/authorized sender/));
 it("rejects zero, malformed and overflowing amounts",()=>{for(const amount of ["0","1.0","-1","1e6","340282366920938463463374607431768211456"])assert.throws(()=>buildEscrowDepositTransferCall({...base,amount}))});
 it("rejects malformed or overflowing position IDs",()=>{for(const positionId of ["-1","01","18446744073709551616"])assert.throws(()=>buildEscrowDepositTransferCall({...base,positionId}))});
 it("supports all three contract-defined deposit legs",()=>{for(const leg of ["collateral","premium","exercise_payment"] as const)assert.equal(JSON.parse(buildEscrowDepositTransferCall({...base,leg}).msg).leg,leg)});
});
