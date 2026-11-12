import test from "node:test";
import assert from "node:assert/strict";
import { HandelEducationAgent } from "./education-agent.js";

function make(guard: () => Promise<{ allowed: boolean; outcome: "allow" | "block" | "review"; confidence: number; decisionId: string; signatureKind: "provider_tee" | "gateway" }> = async () => ({
  allowed: true, outcome: "allow", confidence: 0.99, decisionId: "education-guard-1", signatureKind: "gateway",
})) {
  return new HandelEducationAgent(
    { explain: async () => ({ answer: "A call option gives its buyer the right, but not the obligation, to buy the underlying asset at the strike price before expiry.", requestId: "education-1", verification: { signatureKind: "provider_tee" } }) },
    { evaluate: guard },
  );
}

test("answers an educational question without granting trade authority", async () => {
  const result = await make().answer({ question: "What is a call option?" });
  assert.match(result.answer, /right, but not the obligation/);
  assert.equal(result.mode, "EDUCATION_ONLY");
  assert.equal(result.executionEligible, false);
  assert.equal(result.transactionSubmitted, false);
  assert.equal(result.guardrail.decisionId, "education-guard-1");
});

test("rejects empty/oversized questions and oversized or unserializable context", async () => {
  const agent = make();
  await assert.rejects(() => agent.answer({ question: " " }), e => e instanceof Error && "code" in e && e.code === "INVALID_QUESTION");
  await assert.rejects(() => agent.answer({ question: "x".repeat(2001) }), e => e instanceof Error && "code" in e && e.code === "INVALID_QUESTION");
  await assert.rejects(() => agent.answer({ question: "Explain options", context: "x".repeat(9000) }), e => e instanceof Error && "code" in e && e.code === "INVALID_CONTEXT");
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  await assert.rejects(() => agent.answer({ question: "Explain options", context: circular }), e => e instanceof Error && "code" in e && e.code === "INVALID_CONTEXT");
});

test("fails closed when the education provider or System One guard is unavailable or rejects", async () => {
  const providerDown = new HandelEducationAgent(
    { explain: async () => { throw new Error("offline"); } },
    { evaluate: async () => ({ allowed: true, outcome: "allow", confidence: 1, decisionId: "g", signatureKind: "gateway" }) },
  );
  await assert.rejects(() => providerDown.answer({ question: "What is a put?" }), /provider unavailable/);
  const guardDown = make(async () => { throw new Error("offline"); });
  await assert.rejects(() => guardDown.answer({ question: "What is a put?" }), /guard unavailable/);
  const review = make(async () => ({ allowed: false, outcome: "review", confidence: 0.9, decisionId: "g", signatureKind: "gateway" }));
  await assert.rejects(() => review.answer({ question: "What is a put?" }), /did not allow/);
});
