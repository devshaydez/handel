/** Principal-review and connected-wallet signing boundary. */
import type {AgentPermission,AgentProposal} from "./types.js";
import {validateProposal} from "./policy.js";
import {proposalToAgentProposalArgs} from "./proposal.js";
import type {CreateAgentProposalArgs} from "./proposal.js";
export interface PreparedAgentProposal{proposal:AgentProposal;holder:string;method:"create_agent_proposal";args:CreateAgentProposalArgs;warnings:string[];}
export function isAccountId(v:string):boolean{return v.length>=2&&v.length<=64&&/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(v);}
export function prepareAgentProposal(input:{proposal:AgentProposal;holder:string;permission:AgentPermission}):{ok:true;prepared:PreparedAgentProposal}|{ok:false;errors:string[]}{
 if(!isAccountId(input.holder))return{ok:false,errors:["holder account identifier is invalid"]};
 const policy=validateProposal(input.proposal,input.permission,{requireAgent:true});if(!policy.ok)return{ok:false,errors:policy.errors};
 const built=proposalToAgentProposalArgs(input.proposal,input.holder,input.permission);if(!built.ok)return built;
 return{ok:true,prepared:{proposal:structuredClone(input.proposal),holder:input.holder,method:built.method,args:built.args,warnings:policy.warnings}};
}
export async function approveAndSignAgentProposal<T>(input:{approved:boolean;prepared:PreparedAgentProposal;signWithConnectedWallet:(method:"create_agent_proposal",args:CreateAgentProposalArgs)=>Promise<T>}):Promise<T>{
 if(input.approved!==true)throw Error("principal approval is required before wallet signing");
 return input.signWithConnectedWallet(input.prepared.method,structuredClone(input.prepared.args));
}
