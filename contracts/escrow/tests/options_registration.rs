use near_sdk::NearToken;
use near_workspaces::{network::Sandbox, Contract, Worker};
use serde_json::json;

async fn deploy(worker: &Worker<Sandbox>, path: &str) -> anyhow::Result<Contract> {
    let wasm = std::fs::read(path)?;
    Ok(worker.dev_deploy(&wasm).await?)
}

#[tokio::test]
async fn call_and_put_registration_create_matching_escrow_records_without_moving_tokens(
) -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let writer = worker.dev_create_account().await?;
    let holder = worker.dev_create_account().await?;
    let stock_token = deploy(
        &worker,
        concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../target/near/handel_mock_ft/handel_mock_ft.wasm"
        ),
    )
    .await?;
    let usdc_token = deploy(
        &worker,
        concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../target/near/handel_mock_ft/handel_mock_ft.wasm"
        ),
    )
    .await?;

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

    for token in [&stock_token, &usdc_token] {
        root.call(token.id(), "new")
            .args_json(json!({"owner_id": root.id()}))
            .transact()
            .await?
            .into_result()?;
        for account in [writer.id(), holder.id(), escrow.id()] {
            root.call(token.id(), "register_account")
                .args_json(json!({"account_id": account}))
                .transact()
                .await?
                .into_result()?;
        }
    }
    root.call(stock_token.id(), "mint")
        .args_json(json!({"account_id": writer.id(), "amount": "1000000"}))
        .transact()
        .await?
        .into_result()?;
    root.call(usdc_token.id(), "mint")
        .args_json(json!({"account_id": writer.id(), "amount": "2500000"}))
        .transact()
        .await?
        .into_result()?;
    root.call(stock_token.id(), "mint")
        .args_json(json!({"account_id": holder.id(), "amount": "1000000"}))
        .transact()
        .await?
        .into_result()?;
    root.call(usdc_token.id(), "mint")
        .args_json(json!({"account_id": holder.id(), "amount": "2500000"}))
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
    assert_eq!(
        escrow_position["collateral_token"],
        stock_token.id().as_str()
    );
    assert_eq!(escrow_position["collateral_amount"], 1000000);
    assert_eq!(escrow_position["payment_token"], usdc_token.id().as_str());
    assert_eq!(escrow_position["payment_amount"], 2500000);
    assert_eq!(escrow_position["state"], "AwaitingCollateral");

    // A Put reverses the token orientation: USDC is collateral and the
    // underlying token is the exercise payment asset.
    writer
        .call(options.id(), "create_put")
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

    writer
        .call(options.id(), "register_escrow_position")
        .args_json(json!({"position_id": 1}))
        .max_gas()
        .transact()
        .await?
        .into_result()?;

    let put_option = root
        .view(options.id(), "get_position")
        .args_json(json!({"id": 1}))
        .await?
        .json::<serde_json::Value>()?;
    assert_eq!(put_option["kind"], "Put");
    assert_eq!(put_option["escrow_position_id"], 1);
    assert_eq!(put_option["escrow_registration_pending"], false);
    assert_eq!(
        put_option["escrow_collateral_token"],
        usdc_token.id().as_str()
    );
    assert_eq!(
        put_option["escrow_payment_token"],
        stock_token.id().as_str()
    );

    let put_escrow_position = root
        .view(escrow.id(), "get_position")
        .args_json(json!({"position_id": 1}))
        .await?
        .json::<serde_json::Value>()?;
    assert_eq!(put_escrow_position["source_position_id"], 1);
    assert_eq!(put_escrow_position["writer"], writer.id().as_str());
    assert_eq!(put_escrow_position["holder"], holder.id().as_str());
    assert_eq!(
        put_escrow_position["collateral_token"],
        usdc_token.id().as_str()
    );
    assert_eq!(put_escrow_position["collateral_amount"], 2500000);
    assert_eq!(
        put_escrow_position["payment_token"],
        stock_token.id().as_str()
    );
    assert_eq!(put_escrow_position["payment_amount"], 1000000);
    assert_eq!(put_escrow_position["state"], "AwaitingCollateral");

    // Deposit the exact collateral for both option types through real NEP-141
    // transfer_call receipts using the repository's mock fungible-token Wasm.
    writer
        .call(stock_token.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": escrow.id(),
            "amount": "1000000",
            "memo": null,
            "msg": "{\"position_id\":0,\"leg\":\"collateral\"}"
        }))
        .deposit(NearToken::from_yoctonear(1))
        .max_gas()
        .transact()
        .await?
        .into_result()?;

    writer
        .call(usdc_token.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": escrow.id(),
            "amount": "2500000",
            "memo": null,
            "msg": "{\"position_id\":1,\"leg\":\"collateral\"}"
        }))
        .deposit(NearToken::from_yoctonear(1))
        .max_gas()
        .transact()
        .await?
        .into_result()?;

    let call_after_deposit = root
        .view(escrow.id(), "get_position")
        .args_json(json!({"position_id": 0}))
        .await?
        .json::<serde_json::Value>()?;
    assert_eq!(call_after_deposit["state"], "CollateralLocked");
    assert_eq!(call_after_deposit["collateral_received"], true);

    let put_after_deposit = root
        .view(escrow.id(), "get_position")
        .args_json(json!({"position_id": 1}))
        .await?
        .json::<serde_json::Value>()?;
    assert_eq!(put_after_deposit["state"], "CollateralLocked");
    assert_eq!(put_after_deposit["collateral_received"], true);

    let stock_escrow_balance = root
        .view(stock_token.id(), "ft_balance_of")
        .args_json(json!({"account_id": escrow.id()}))
        .await?
        .json::<near_sdk::json_types::U128>()?;
    assert_eq!(stock_escrow_balance.0, 1000000);
    let usdc_escrow_balance = root
        .view(usdc_token.id(), "ft_balance_of")
        .args_json(json!({"account_id": escrow.id()}))
        .await?
        .json::<near_sdk::json_types::U128>()?;
    assert_eq!(usdc_escrow_balance.0, 2500000);

    // Exercise both options after maturity. The holder pays the exact exercise
    // asset for each option, then escrow performs its two asynchronous payout legs.
    worker.fast_forward(100).await?;
    holder
        .call(usdc_token.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": escrow.id(),
            "amount": "2500000",
            "memo": null,
            "msg": "{\\"position_id\\":0,\\"leg\\":\\"exercise_payment\\"}"
        }))
        .deposit(NearToken::from_yoctonear(1))
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    holder
        .call(stock_token.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": escrow.id(),
            "amount": "1000000",
            "memo": null,
            "msg": "{\\"position_id\\":1,\\"leg\\":\\"exercise_payment\\"}"
        }))
        .deposit(NearToken::from_yoctonear(1))
        .max_gas()
        .transact()
        .await?
        .into_result()?;

    for position_id in [0u64, 1u64] {
        holder
            .call(escrow.id(), "settle_exercise")
            .args_json(json!({"position_id": position_id}))
            .max_gas()
            .transact()
            .await?
            .into_result()?;
        let settled = root
            .view(escrow.id(), "get_position")
            .args_json(json!({"position_id": position_id}))
            .await?
            .json::<serde_json::Value>()?;
        assert_eq!(settled["state"], "Settled");
        assert_eq!(settled["payment_paid"], true);
        assert_eq!(settled["collateral_delivered_to_holder"], true);
    }

    // Both token balances should be fully paid out of escrow. The writer receives
    // exercise consideration; the holder receives the writer's collateral.
    for token in [&stock_token, &usdc_token] {
        let remaining = root
            .view(token.id(), "ft_balance_of")
            .args_json(json!({"account_id": escrow.id()}))
            .await?
            .json::<near_sdk::json_types::U128>()?;
        assert_eq!(remaining.0, 0);
    }
    let writer_stock = root
        .view(stock_token.id(), "ft_balance_of")
        .args_json(json!({"account_id": writer.id()}))
        .await?
        .json::<near_sdk::json_types::U128>()?;
    assert_eq!(writer_stock.0, 1000000);
    let writer_usdc = root
        .view(usdc_token.id(), "ft_balance_of")
        .args_json(json!({"account_id": writer.id()}))
        .await?
        .json::<near_sdk::json_types::U128>()?;
    assert_eq!(writer_usdc.0, 2500000);
    let holder_stock = root
        .view(stock_token.id(), "ft_balance_of")
        .args_json(json!({"account_id": holder.id()}))
        .await?
        .json::<near_sdk::json_types::U128>()?;
    assert_eq!(holder_stock.0, 1000000);
    let holder_usdc = root
        .view(usdc_token.id(), "ft_balance_of")
        .args_json(json!({"account_id": holder.id()}))
        .await?
        .json::<near_sdk::json_types::U128>()?;
    assert_eq!(holder_usdc.0, 2500000);

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
