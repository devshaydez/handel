# handel
## Contract status

`src/lib.rs` contains an uncompiled Day 1 state and entrypoint skeleton. The `create_call` and `create_put` methods only create `Created` records. They do not check an asset registry, take collateral or premiums, open a position, call NEAR Intents, or settle. Do not deploy or use with real funds. The build was not run because this environment has no Rust toolchain.
