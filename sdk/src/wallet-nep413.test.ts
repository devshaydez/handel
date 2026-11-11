import {describe,it} from "node:test";
import assert from "node:assert/strict";
import {
  createWalletSelectorNep413Signer,
  decodeNep413Nonce,
  signNep413WithConnectedWallet,
  type WalletSelectorNep413Wallet,
} from "./wallet-nep413.js";
import type {Nep413Payload} from "./types.js";

const payload: Nep413Payload = {
  recipient: "verifier.testnet",
  nonce: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  message: JSON.stringify({
    signer_id: "alice.testnet",
    deadline: "2026-11-10T02:00:00.000Z",
    intents: [{intent: "transfer"}],
  }),
};
const wallet = {
  accountId: "alice.testnet",
  async signMessage() { return {publicKey: "ed25519:test", signature: "sig"}; },
};
const approval = {
  approved: true,
  expectedAccountId: "alice.testnet",
  allowedVerifierIds: ["verifier.testnet"] as const,
};

describe("NEP-413 connected wallet boundary", () => {
  it("signs only after explicit approval using matching connected wallet", async () => {
    const r = await signNep413WithConnectedWallet({
      payload, approval, wallet, nowMs: Date.parse("2026-11-10T01:45:00Z"),
    });
    assert.equal(r.standard, "nep413");
    assert.equal(r.public_key, "ed25519:test");
  });

  it("rejects missing principal approval before wallet call", async () => {
    await assert.rejects(
      () => signNep413WithConnectedWallet({
        payload, approval: {...approval, approved: false}, wallet,
        nowMs: Date.parse("2026-11-10T01:45:00Z"),
      }),
      /approval required/,
    );
  });

  it("rejects wrong wallet and verifier", async () => {
    await assert.rejects(
      () => signNep413WithConnectedWallet({
        payload, approval, wallet: {...wallet, accountId: "mallory.testnet"},
        nowMs: Date.parse("2026-11-10T01:45:00Z"),
      }),
      /does not match/,
    );
    await assert.rejects(
      () => signNep413WithConnectedWallet({
        payload, approval: {...approval, allowedVerifierIds: ["other.testnet"]}, wallet,
        nowMs: Date.parse("2026-11-10T01:45:00Z"),
      }),
      /not an approved verifier/,
    );
  });

  it("rejects expired or overlong deadlines", async () => {
    const nowMs = Date.parse("2026-11-10T01:45:00Z");
    await assert.rejects(
      () => signNep413WithConnectedWallet({
        payload: {...payload, message: JSON.stringify({
          signer_id: "alice.testnet", deadline: "2026-11-10T01:40:00Z", intents: [{}],
        })},
        approval, wallet, nowMs,
      }),
      /expired/,
    );
    await assert.rejects(
      () => signNep413WithConnectedWallet({
        payload: {...payload, message: JSON.stringify({
          signer_id: "alice.testnet", deadline: "2026-11-10T03:00:00Z", intents: [{}],
        })},
        approval, wallet, nowMs,
      }),
      /exceeds/,
    );
  });

  it("decodes a base64 NEP-413 nonce to exactly 32 bytes", () => {
    const nonce = decodeNep413Nonce(payload.nonce);
    assert.equal(nonce.length, 32);
    assert.ok(nonce.every((byte) => byte === 0));
    assert.throws(() => decodeNep413Nonce("not-base64"), /valid base64/);
    assert.throws(() => decodeNep413Nonce("AQ=="), /32 bytes/);
  });

  it("maps the real Wallet Selector signMessage shape and rechecks active account", async () => {
    let received: {message: string; recipient: string; nonce: Uint8Array} | undefined;
    const selectorWallet: WalletSelectorNep413Wallet = {
      async getAccounts() { return [{accountId: "alice.testnet"}]; },
      async signMessage(args) {
        received = args;
        return {publicKey: "ed25519:selector", signature: "selector-sig"};
      },
    };
    const signer = createWalletSelectorNep413Signer({
      wallet: selectorWallet, expectedAccountId: "alice.testnet",
    });
    const result = await signNep413WithConnectedWallet({
      payload, approval, wallet: signer, nowMs: Date.parse("2026-11-10T01:45:00Z"),
    });
    assert.equal(result.signature, "selector-sig");
    assert.equal(received?.message, payload.message);
    assert.equal(received?.recipient, payload.recipient);
    assert.equal(received?.nonce.length, 32);

    const changedAccount = createWalletSelectorNep413Signer({
      wallet: {...selectorWallet, async getAccounts() { return [{accountId: "mallory.testnet"}]; }},
      expectedAccountId: "alice.testnet",
    });
    await assert.rejects(
      () => signNep413WithConnectedWallet({
        payload, approval, wallet: changedAccount, nowMs: Date.parse("2026-11-10T01:45:00Z"),
      }),
      /changed or disconnected/,
    );
  });

  it("rejects Wallet Selector redirect-only signing until callback completion", async () => {
    const redirectWallet: WalletSelectorNep413Wallet = {
      async getAccounts() { return [{accountId: "alice.testnet"}]; },
      async signMessage() { return undefined; },
    };
    const signer = createWalletSelectorNep413Signer({
      wallet: redirectWallet, expectedAccountId: "alice.testnet",
    });
    await assert.rejects(
      () => signNep413WithConnectedWallet({
        payload, approval, wallet: signer, nowMs: Date.parse("2026-11-10T01:45:00Z"),
      }),
      /redirected for signing/,
    );
  });
});

  it("rejects a wallet account removed while the signing prompt is open", async () => {
    let reads = 0;
    const switchingWallet: WalletSelectorNep413Wallet = {
      async getAccounts() {
        reads++;
        return reads === 1 ? [{accountId: "alice.testnet"}] : [{accountId: "mallory.testnet"}];
      },
      async signMessage() { return {publicKey: "ed25519:selector", signature: "selector-sig"}; },
    };
    const signer = createWalletSelectorNep413Signer({
      wallet: switchingWallet, expectedAccountId: "alice.testnet",
    });
    await assert.rejects(
      () => signNep413WithConnectedWallet({
        payload, approval, wallet: signer, nowMs: Date.parse("2026-11-10T01:45:00Z"),
      }),
      /changed or disconnected during signing/,
    );
  });

  it("binds a returned signature to the account public key when exposed", async () => {
    const keyedWallet: WalletSelectorNep413Wallet = {
      async getAccounts() { return [{accountId: "alice.testnet", publicKey: "ed25519:expected"}]; },
      async signMessage() { return {publicKey: "ed25519:mallory", signature: "sig"}; },
    };
    const signer = createWalletSelectorNep413Signer({
      wallet: keyedWallet, expectedAccountId: "alice.testnet",
    });
    await assert.rejects(
      () => signNep413WithConnectedWallet({
        payload, approval, wallet: signer, nowMs: Date.parse("2026-11-10T01:45:00Z"),
      }),
      /public key does not match/,
    );
  });
