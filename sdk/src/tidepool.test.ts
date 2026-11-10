import test from "node:test";
import assert from "node:assert/strict";
import { TidepoolClient, TidepoolError, assessTidepoolStatus } from "./tidepool.js";

const tokenRows = [
  { assetId: "nep141:usdc.tidepool-sandbox.testnet", symbol: "USDC", decimals: 6, blockchain: "near" },
  { assetId: "nep141:wnear.tidepool-sandbox.testnet", symbol: "wNEAR", decimals: 24, blockchain: "near" },
  { assetId: "nep141:xrp.tp-omft.testnet", symbol: "XRP", decimals: 6, blockchain: "xrp" },
];

function fakeFetch(handler: (url: string, init?: RequestInit) => unknown) {
  return async (input: string | URL, init?: RequestInit) => {
    const value = handler(String(input), init);
    return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
  };
}

test("Tidepool token registry is discovered dynamically", async () => {
  const client = new TidepoolClient("https://www.usetidepool.tech", fakeFetch(() => tokenRows));
  const tokens = await client.listTokens();
  assert.equal(tokens[0]?.assetId, tokenRows[0]?.assetId);
});

test("dry quote validates registered test assets and base-unit amount", async () => {
  let body: Record<string, unknown> | undefined;
  const client = new TidepoolClient("https://www.usetidepool.tech", fakeFetch((_url, init) => {
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return { tokens: tokenRows };
  }));
  // The token endpoint returns an array; quote endpoint returns a quote object.
  const fetcher = async (input: string | URL, init?: RequestInit) => {
    if (String(input).endsWith("/v0/tokens")) return new Response(JSON.stringify(tokenRows), { status: 200 });
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ correlationId: "q-1", timestamp: new Date().toISOString(), quote: { amountIn: "1000" } }), { status: 200 });
  };
  const realClient = new TidepoolClient("https://www.usetidepool.tech", fetcher);
  const quote = await realClient.quote({
    originAsset: tokenRows[0]!.assetId, destinationAsset: tokenRows[1]!.assetId,
    amount: "1000", refundTo: "alice.testnet", recipient: "alice.testnet",
    deadline: new Date(Date.now() + 60_000).toISOString(),
  });
  assert.equal(quote.correlationId, "q-1");
  assert.equal(body?.dry, true);
  assert.equal(body?.amount, "1000");
});

test("Tidepool refuses Ondo and unknown assets", async () => {
  const client = new TidepoolClient("https://www.usetidepool.tech", fakeFetch(() => tokenRows));
  await assert.rejects(() => client.quote({
    originAsset: "nep141:bnb-0xa9ee28c80f960b889dfbd1902055218cba016f75.omdep.near",
    destinationAsset: tokenRows[0]!.assetId, amount: "1",
    refundTo: "alice.testnet", recipient: "alice.testnet",
    deadline: new Date(Date.now() + 60_000).toISOString(),
  }), TidepoolError);
});

test("live testnet quote requires explicit deposit-address opt-in", async () => {
  const client = new TidepoolClient("https://www.usetidepool.tech", fakeFetch(() => tokenRows));
  await assert.rejects(() => client.quote({
    originAsset: tokenRows[0]!.assetId, destinationAsset: tokenRows[1]!.assetId,
    amount: "1", refundTo: "alice.testnet", recipient: "alice.testnet",
    deadline: new Date(Date.now() + 60_000).toISOString(), dry: false,
  }), /allowTestnetDepositAddress/);
});

test("status assessment never calls provider success cryptographic proof", () => {
  const assessment = assessTidepoolStatus({
    status: "SUCCESS", swapDetails: { nearTxHashes: ["tx-1"] },
  });
  assert.equal(assessment.outcome, "provider_reported_success");
  assert.match(assessment.warning, /not independent proof/);
  const unknown = assessTidepoolStatus({ status: "PROCESSING" });
  assert.equal(unknown.outcome, "pending_or_unverified");
});

test("status and deposit submit encode the deposit address and tx hash", async () => {
  const seen: string[] = [];
  let submitted: Record<string, unknown> | undefined;
  const client = new TidepoolClient("https://www.usetidepool.tech", async (input, init) => {
    seen.push(String(input));
    if (init?.body) submitted = JSON.parse(String(init.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ status: "PROCESSING" }), { status: 200 });
  });
  await client.status("abc.testnet", "memo-7");
  await client.submitDeposit("tx-hash", "abc.testnet", { memo: "memo-7", nearSenderAccount: "alice.testnet" });
  assert.match(seen[0]!, /depositAddress=abc.testnet/);
  assert.match(seen[0]!, /depositMemo=memo-7/);
  assert.equal(seen[1], "https://www.usetidepool.tech/v0/deposit/submit");
  assert.deepEqual(submitted, { txHash: "tx-hash", depositAddress: "abc.testnet", memo: "memo-7", nearSenderAccount: "alice.testnet" });
});

test("client rejects insecure non-local endpoint", () => {
  assert.throws(() => new TidepoolClient("http://example.com"), /HTTPS/);
});

test("MEMO quote mode enforces origin-chain, supported chains, and no ANY_INPUT", async () => {
  const client = new TidepoolClient("https://www.usetidepool.tech", fakeFetch(() => tokenRows));
  const base = {
    originAsset: tokenRows[2]!.assetId, destinationAsset: tokenRows[0]!.assetId,
    amount: "100", refundTo: "alice.testnet", recipient: "alice.testnet",
    deadline: new Date(Date.now() + 60_000).toISOString(),
  };
  await assert.rejects(() => client.quote(base), /require depositType=ORIGIN_CHAIN/);
  await assert.rejects(() => client.quote({
    ...base, originAsset: tokenRows[1]!.assetId, depositType: "INTENTS", depositMode: "MEMO",
  }), /only with depositType=ORIGIN_CHAIN/);
  await assert.rejects(() => client.quote({
    ...base, depositType: "ORIGIN_CHAIN", depositMode: "MEMO", swapType: "ANY_INPUT",
  }), /cannot be used with ANY_INPUT/);
});
