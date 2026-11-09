# Decision journal — Batch 8

The trading proposal runtime requires both:
1. A verified System One `provider_tee` allow decision.
2. A durable `DecisionRecorder` implementation.

The `DecisionJournal` stores structured proposal decisions through a host-supplied `DecisionSnapshotStore`. It serializes append operations, rejects duplicate decision IDs, chains records with SHA-256 hashes, verifies the chain when reopened, and generates a user explanation from the stored record rather than asking a model to reconstruct the event.

Each proposal record includes the exact action/terms, privacy-safe account reference, permission snapshot hash, market source/time/hash, deterministic premium source/method/time, guardrail decision ID/confidence/signature kind, rationale, risks, alternatives actually evaluated, uncertainty, policy result, approval state, and proposal execution state.

## Important integrity boundary

The hash chain is tamper-evident, not independently immutable. A host with write access to the entire snapshot can rewrite all records and recompute the chain. Production deployment must back the store with access controls, backups, append-only/WORM retention or an external checkpoint/anchor, and operational monitoring. The journal must never store wallet keys, seed phrases, API credentials, raw auth headers, or unnecessary prompt contents.

The current runtime records a proposal as `proposed` and marks approval as `not-requested-at-proposal-stage`. It does not claim user approval, submission, fill, settlement, or successful execution. Those lifecycle transitions must be appended by the execution workflow when independently verified evidence becomes available.

A missing/unavailable decision store blocks returning a trading proposal. The host must provide durable storage; an in-memory test store is only a test fixture.
