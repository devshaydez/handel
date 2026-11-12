import test from "node:test";
import assert from "node:assert/strict";
import {
  createHandelAdvisoryHttpServer,
  readOnChainAgentPermission,
} from "./server.js";

function rpcResponse(value: unknown, blockHeight = 123) {
  return {
    result: {
      result: [...Buffer.from(JSON.stringify(value), "utf8")],
      block_height: blockHeight,
      block_hash: "sandbox-block",
    },
  };
}

test("reads agent permission and ManualApproval mode from the same finalized block", async () => {
  const calls: Array<Record<string, unknown>> = [];
  const fetcher = async (_input: string | URL, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)) as { params: Record<string, unknown> };
    calls.push(request.params);
    const value = request.params.method_name === "get_agent_policy" ? {
      principal: "principal.testnet",
      allowed_assets: ["ondo:test-stock"],
      max_underlying_amount: "1000000",
      max_premium_usdc: "100000",
      max_collateral_usdc: "2500000",
      max_open_positions: 2,
      expires_at_ns: "999999999999999999",
      enabled: true,
    } : "ManualApproval";
    return new Response(JSON.stringify(rpcResponse(value)), { status: 200 });
  };
  const result = await readOnChainAgentPermission({
    rpcUrl: "https://rpc.testnet.fastnear.com",
    contractId: "options.testnet",
    agentId: "agent.testnet",
    fetcher,
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].finality, "final");
  assert.equal(calls[1].block_id, "sandbox-block");
  assert.equal(calls[1].finality, undefined);
  assert.equal(result.blockHeight, 123);
  assert.equal(result.permission.agent, "agent.testnet");
  assert.equal(result.permission.owner, "principal.testnet");
  assert.deepEqual(result.permission.allowedAssets, ["ondo:test-stock"]);
  assert.equal(result.permission.maxCollateralUsdc, "2500000");
  assert.equal(result.permission.enabled, true);
});

test("rejects disabled, absent, malformed or non-manual on-chain policies", async () => {
  const disabled = rpcResponse({ enabled: false });
  const mode = rpcResponse("ManualApproval");
  await assert.rejects(() => readOnChainAgentPermission({
    rpcUrl: "https://rpc.testnet.fastnear.com",
    contractId: "options.testnet",
    agentId: "agent.testnet",
    fetcher: async () => new Response(JSON.stringify(disabled), { status: 200 }),
  }), /missing, disabled, or malformed/);

  const policy = rpcResponse({
    principal: "principal.testnet", allowed_assets: ["ondo:test-stock"],
    max_underlying_amount: "100", max_premium_usdc: "10", max_collateral_usdc: "100",
    max_open_positions: 1, expires_at_ns: "999999999999999999", enabled: true,
  });
  await assert.rejects(() => readOnChainAgentPermission({
    rpcUrl: "https://rpc.testnet.fastnear.com",
    contractId: "options.testnet",
    agentId: "agent.testnet",
    fetcher: async () => new Response(JSON.stringify(policy), { status: 200 }),
  }), /ManualApproval/);

  const pinnedCalls: Array<Record<string, unknown>> = [];
  const result = await readOnChainAgentPermission({
    rpcUrl: "https://rpc.testnet.fastnear.com",
    contractId: "options.testnet",
    agentId: "agent.testnet",
    fetcher: async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as { params: Record<string, unknown> };
      pinnedCalls.push(request.params);
      const value = request.params.method_name === "get_agent_policy" ? policy.result.result : rpcResponse("ManualApproval", 124).result.result;
      return new Response(JSON.stringify({ result: { result: value, block_height: 123, block_hash: "sandbox-block" } }), { status: 200 });
    },
  });
  assert.equal(result.permission.enabled, true);
  assert.equal(pinnedCalls[1].block_id, "sandbox-block");
});

test("HTTP service exposes health and returns advisory-only proposals without wallet or transaction calls", async () => {
  let prepared = 0;
  const server = createHandelAdvisoryHttpServer({
    prepare: async input => {
      prepared++;
      return {
        advisory: { proposal: { proposalId: "proposal-1" }, executionEligible: false },
        prepared: { args: { proposal_id: "proposal-1", holder: input.holder } },
        nextStep: "agent_submits_pending_proposal_then_principal_approves",
        executionEligible: false,
      } as never;
    },
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = "http://127.0.0.1:" + address.port;
  try {
    const health = await fetch(base + "/health");
    assert.equal(health.status, 200);
    assert.equal((await health.json() as { transactionSubmission: boolean }).transactionSubmission, false);

    const response = await fetch(base + "/v1/advisory/proposals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        agentId: "agent.testnet",
        holder: "holder.testnet",
        request: {
          type: "Call", assetId: "ondo:test-stock", quantity: "1000000",
          strike: "2500000", expiryNs: "999999999999999999",
          objective: "Create a simulated proposal for review",
        },
      }),
    });
    assert.equal(response.status, 200);
    const body = await response.json() as { executionEligible: boolean; transactionSubmitted: boolean; walletSignatureRequested: boolean };
    assert.equal(body.executionEligible, false);
    assert.equal(body.transactionSubmitted, false);
    assert.equal(body.walletSignatureRequested, false);
    assert.equal(prepared, 1);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test("HTTP service rejects invalid origins, malformed requests and missing bearer auth", async () => {
  const server = createHandelAdvisoryHttpServer(
    { prepare: async () => { throw new Error("must not run"); } },
    { allowedOrigins: ["http://localhost:5173"], requireAuth: true, bearerToken: "local-demo-token" },
  );
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = "http://127.0.0.1:" + address.port;
  try {
    const origin = await fetch(base + "/v1/advisory/proposals", {
      method: "POST",
      headers: { origin: "https://evil.example", "content-type": "application/json", authorization: "Bearer local-demo-token" },
      body: "{}",
    });
    assert.equal(origin.status, 403);
    const auth = await fetch(base + "/v1/advisory/proposals", {
      method: "POST", headers: { "content-type": "application/json" }, body: "{}",
    });
    assert.equal(auth.status, 401);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test("HTTP education route returns a guarded education-only answer without wallet activity", async () => {
  const server = createHandelAdvisoryHttpServer({
    prepare: async () => { throw new Error("proposal route must not run"); },
    answerEducation: async input => ({
      answer: "A put option gives its buyer the right, but not the obligation, to sell at the strike price.",
      mode: "EDUCATION_ONLY",
      executionEligible: false,
      transactionSubmitted: false,
      question: input.question,
    }) as never,
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    const response = await fetch("http://127.0.0.1:" + address.port + "/v1/education/answer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "What is a put option?" }),
    });
    assert.equal(response.status, 200);
    const body = await response.json() as { mode: string; executionEligible: boolean; transactionSubmitted: boolean; walletSignatureRequested: boolean };
    assert.equal(body.mode, "EDUCATION_ONLY");
    assert.equal(body.executionEligible, false);
    assert.equal(body.transactionSubmitted, false);
    assert.equal(body.walletSignatureRequested, false);

    const invalid = await fetch("http://127.0.0.1:" + address.port + "/v1/education/answer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: " " }),
    });
    assert.equal(invalid.status, 400);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});


test("delegated execution route requires bearer auth and reports the token-authority boundary", async () => {
  let executed = 0;
  const server = createHandelAdvisoryHttpServer({
    prepare: async () => { throw new Error("not used"); },
    executeDelegated: async input => {
      executed++;
      assert.equal(input.principal, "principal.testnet");
      return { status: "awaiting_principal_collateral", positionId: "7", escrowPositionId: "12" };
    },
  }, { requireAuth: true, bearerToken: "local-agent-token" });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = "http://127.0.0.1:" + address.port;
  const body = {
    agentId: "handel-agent.shaydez.testnet",
    principal: "principal.testnet",
    holder: "holder.testnet",
    request: { type: "Call", assetId: "nep141:wnear.tidepool-sandbox.testnet", quantity: "1000000",
      strike: "1000000", expiryNs: "999999999999999999", objective: "test" },
  };
  try {
    const denied = await fetch(base + "/v1/delegated/trades", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    assert.equal(denied.status, 401);
    assert.equal(executed, 0);
    const response = await fetch(base + "/v1/delegated/trades", {
      method: "POST", headers: { "content-type": "application/json", authorization: "Bearer local-agent-token" },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 200);
    const result = await response.json() as Record<string, unknown>;
    assert.equal(result.transactionSubmitted, true);
    assert.equal(result.collateralTransferAuthorized, false);
    assert.equal(result.premiumPaymentAuthorized, false);
    assert.equal(executed, 1);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
