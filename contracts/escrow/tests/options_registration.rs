use near_workspaces::{network::Sandbox, Account, Contract, Worker};
use serde_json::json;

async fn deploy(worker: &Worker<Sandbox>, path: &str) -> anyhow::Result<Contract> {
    let wasm = std::fs::read(path)?;
    Ok(worker.dev_deploy(&wasm).await?)
}

#[tokio::test]
async fn options_registration_creates_matching_escrow_record_without_moving_tokens(
) -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let writer = worker.dev_create_account().await?;
    let holder = worker.dev_create_account().await?;
    let stock_token = worker.dev_create_account().await?;
    let usdc_token = worker.dev_create_account().await?;

    let options = deploy(
        &worker,
        concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../target/near/handel_options.wasm"
        ),
    )
    .await?;
    let escrow = deploy(
        &worker,
        concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../target/near/handel_escrow/handel_escrow.wasm"
        ),
    )
    .await?;

    root.call(options.id(), "new")
        .args_json(json!({}))
        .transact()
        .await?
        .into_result()?;
    root.call(escrow.id(), "new")
        .args_json(json!({}))
        .transact()
        .await?
        .into_result()?;

    // The OptionsContract is the only account allowed to register escrow positions.
    root.call(escrow.id(), "set_controller")
        .args_json(json!({"controller": options.id()}))
        .transact()
        .await?
        .into_result()?;

    const STOCK_ASSET: &str = "ondo:test-stock";
    const USDC_ASSET: &str =
        "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";

    for asset_id in [STOCK_ASSET, USDC_ASSET] {
        root.call(options.id(), "set_asset")
            .args_json(json!({
                "asset_id": asset_id,
                "decimals": 6,
                "enabled": true
            }))
            .transact()
            .await?
            .into_result()?;
    }

    root.call(options.id(), "set_escrow_contract")
        .args_json(json!({"escrow_contract": escrow.id()}))
        .transact()
        .await?
        .into_result()?;
    root.call(options.id(), "set_escrow_token_account")
        .args_json(json!({
            "asset_id": STOCK_ASSET,
            "token_account": stock_token.id()
        }))
        .transact()
        .await?
        .into_result()?;
    root.call(options.id(), "set_escrow_token_account")
        .args_json(json!({
            "asset_id": USDC_ASSET,
            "token_account": usdc_token.id()
        }))
        .transact()
        .await?
        .into_result()?;

    let expiry = worker.view_block().await?.header().timestamp_nanosec() + 60_000_000_000;
    writer
        .call(options.id(), "create_call")
        .args_json(json!({
            "holder": holder.id(),
            "asset_id": STOCK_ASSET,
            "underlying_amount": 1000000,
            "strike_amount_usdc": 2500000,
            "expiry_ns": expiry,
            "premium_amount_usdc": 100000
        }))
        .transact()
        .await?
        .into_result()?;

    // This receipt schedules escrow.create_position and then the private Options callback.
    writer
        .call(options.id(), "register_escrow_position")
        .args_json(json!({"position_id": 0}))
        .max_gas()
        .transact()
        .await?
        .into_result()?;

    let option = root
        .view(options.id(), "get_position")
        .args_json(json!({"id": 0}))
        .await?
        .json::<serde_json::Value>()?;
    assert_eq!(option["escrow_position_id"], 0);
    assert_eq!(option["escrow_registration_pending"], false);
    assert_eq!(option["escrow_contract_id"], escrow.id().as_str());
    assert_eq!(option["escrow_collateral_token"], stock_token.id().as_str());
    assert_eq!(option["escrow_payment_token"], usdc_token.id().as_str());

    let escrow_position = root
        .view(escrow.id(), "get_position")
        .args_json(json!({"position_id": 0}))
        .await?
        .json::<serde_json::Value>()?;
    assert_eq!(escrow_position["source_position_id"], 0);
    assert_eq!(escrow_position["writer"], writer.id().as_str());
    assert_eq!(escrow_position["holder"], holder.id().as_str());
    assert_eq!(escrow_position["collateral_token"], stock_token.id().as_str());
    assert_eq!(escrow_position["collateral_amount"], 1000000);
    assert_eq!(escrow_position["payment_token"], usdc_token.id().as_str());
    assert_eq!(escrow_position["payment_amount"], 2500000);
    assert_eq!(escrow_position["state"], "AwaitingCollateral");

    // Registration is metadata-only: no collateral or payment tokens have moved.
    // These accounts are token identifiers in this test; balances are not fabricated.
    // The independent reconciliation rail must now be blocked for this position.
    let competing_rail = writer
        .call(options.id(), "begin_collateral_lock")
        .args_json(json!({
            "position_id": 0,
            "operation_id": "duplicate-collateral-rail"
        }))
        .transact()
        .await?;
    assert!(competing_rail.is_failure());

    Ok(())
}
