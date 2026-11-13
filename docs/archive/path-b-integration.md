> Historical working note; superseded by README.md and docs/EVIDENCE.md.

# Path B integration notes

Status: architecture target only. No Chain Signatures signer contract, NEP-413 payload builder, wallet-signing adapter, Tidepool transfer, or signed transaction has been implemented or run. Do not treat this note as an executable protocol specification.

## Required trust separation

1. The user retains the wallet key and signs only the exact intent authorized by the user.
2. The AI service may return a typed proposal, but cannot sign, submit, change policy, or choose an unrestricted recipient.
3. The contract enforces allowed asset, amount, sender/receiver, operation ID, nonce, expiry, and principal policy before any signing request is eligible.
4. The external Chain Signatures MPC/key service must never receive user wallet secrets. Any MPC key derivation/sign request must be constrained to an audited allow-list and target chain context.
5. Receipt reconciliation must verify authenticated verifier evidence and its finality; a trusted service asserting success is insufficient for a trustless/deployable claim.

## Prototype gate

Before adding protocol-specific code, verify the exact current official Chain Signatures and NEP-413 specifications and interfaces. Add a pure payload encoder/decoder and deterministic test vectors first, then a mocked signer/verifier harness that cannot broadcast or access secrets. Only after signature/domain separation, replay protection, chain/verifier binding, expiry, and rejection tests pass should a user-authorized testnet flow be considered. Testnet signing requires a user-managed credential outside chat and Git.

## Blockers and non-claims

Official documentation retrieval in this work session was incomplete and the web research allowance is unavailable until Nov 7, 00:00 WAT. Protocol details are intentionally left unguessed. No external signing credential or AI provider key was read or created. No NEP-413 signature, transaction, deployment, or funds movement is claimed.
