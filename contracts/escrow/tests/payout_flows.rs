use near_sdk::NearToken;
use near_workspaces::{network::Sandbox, Account, Contract, Worker};
use serde_json::json;

const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);

async fn deploy(worker: &Worker<Sandbox>, path: &str) -> anyhow::Result<Contract> {
    let wasm = std::fs::read(path)?;
    Ok(worker.dev_deploy(&wasm).await?)
}

async fn call_json<T: serde::de::DeserializeOwned>(
    account: &Account,
    contract: &Contract,
    method: &str,
    args: serde_json::Value,
) -> anyhow::Result<T> {
    let result = account
        .call(contract.id(), method)
        .args_json(args)
        .deposit(NearToken::from_near(1))
        .transact()
        .await?;
    Ok(result.json()?)
}

async fn register_token_account(
    owner: &Account,
    token: &Contract,
    account_id: &near_workspaces::AccountId,
) -> anyhow::Result<()> {
    owner
        .call(token.id(), "register_account")
        .args_json(json!({"account_id": account_id}))
        .transact()
        .await?
        .into_result()?;
    Ok(())
}

async fn mint(
    owner: &Account,
    token: &Contract,
    account_id: &near_workspaces::AccountId,
    amount: u128,
) -> anyhow::Result<()> {
    owner
        .call(token.id(), "mint")
        .args_json(json!({"account_id": account_id, "amount": amount.to_string()}))
        .transact()
        .await?
        .into_result()?;
    Ok(())
}

async fn transfer_call(
    sender: &Account,
    token: &Contract,
    escrow: &Contract,
    position_id: u64,
    leg: &str,
    amount: u128,
) -> anyhow::Result<()> {
    sender
        .call(token.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": escrow.id(),
            "amount": amount.to_string(),
            "memo": null,
            "msg": json!({"position_id": position_id, "leg": leg}).to_string()
        }))
        .deposit(ONE_YOCTO)
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    Ok(())
}

async fn balance(
    account: &Account,
    token: &Contract,
    id: &near_workspaces::AccountId,
) -> anyhow::Result<u128> {
    let view = account
        .view(token.id(), "ft_balance_of")
        .args_json(json!({"account_id": id}))
        .await?;
    Ok(view.json::<near_sdk::json_types::U128>()?.0)
}

async fn make_position(
    controller: &Account,
    escrow: &Contract,
    writer: &Account,
    holder: &Account,
    stock: &Contract,
    usdc: &Contract,
    source_position_id: u64,
    expiry_ns: u64,
) -> anyhow::Result<u64> {
    call_json(
        controller,
        escrow,
        "create_position",
        json!({
            "source_position_id": source_position_id,
            "writer": writer.id(),
            "holder": holder.id(),
            "collateral_token": stock.id(),
            "collateral_amount": "100",
            "payment_token": usdc.id(),
            "payment_amount": "50",
            "expiry_ns": expiry_ns
        }),
    )
    .await
}

async fn settle_and_read(
    holder: &Account,
    escrow: &Contract,
    position_id: u64,
) -> anyhow::Result<serde_json::Value> {
    holder
        .call(escrow.id(), "settle_exercise")
        .args_json(json!({"position_id": position_id}))
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    let view = holder
        .view(escrow.id(), "get_position")
        .args_json(json!({"position_id": position_id}))
        .await?;
    Ok(view.json()?)
}

#[tokio::test]
async fn payout_failures_retry_only_the_unpaid_leg_and_callbacks_are_private() -> anyhow::Result<()>
{
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let writer = worker.dev_create_account().await?;
    let holder = worker.dev_create_account().await?;
    let controller = worker.dev_create_account().await?;
    let escrow = deploy(
        &worker,
        concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../target/near/handel_escrow/handel_escrow.wasm"
        ),
    )
    .await?;
    let stock = deploy(
        &worker,
        concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../target/near/handel_mock_ft/handel_mock_ft.wasm"
        ),
    )
    .await?;
    let usdc = deploy(
        &worker,
        concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../target/near/handel_mock_ft/handel_mock_ft.wasm"
        ),
    )
    .await?;

    root.call(escrow.id(), "new")
        .args_json(json!({}))
        .transact()
        .await?
        .into_result()?;
    root.call(stock.id(), "new")
        .args_json(json!({"owner_id": root.id()}))
        .transact()
        .await?
        .into_result()?;
    root.call(usdc.id(), "new")
        .args_json(json!({"owner_id": root.id()}))
        .transact()
        .await?
        .into_result()?;
    root.call(escrow.id(), "set_controller")
        .args_json(json!({"controller": controller.id()}))
        .transact()
        .await?
        .into_result()?;

    for token in [&stock, &usdc] {
        for account in [escrow.id(), writer.id(), holder.id()] {
            register_token_account(&root, token, account).await?;
        }
    }
    mint(&root, &stock, writer.id(), 200).await?;
    mint(&root, &usdc, holder.id(), 100).await?;

    let now = worker.view_block().await?.header().timestamp_nanosec();
    let expiry = now + 30_000_000_000;
    let first = make_position(
        &controller,
        &escrow,
        &writer,
        &holder,
        &stock,
        &usdc,
        1001,
        expiry,
    )
    .await?;
    transfer_call(&writer, &stock, &escrow, first, "collateral", 100).await?;
    worker.fast_forward(100).await?;
    transfer_call(&holder, &usdc, &escrow, first, "exercise_payment", 50).await?;

    // Failure case 1: payment leg fails. Retry it; collateral must then pay exactly once.
    root.call(usdc.id(), "set_paused")
        .args_json(json!({"paused": true}))
        .transact()
        .await?
        .into_result()?;
    let _ = settle_and_read(&holder, &escrow, first).await?;
    let state = holder
        .view(escrow.id(), "get_position")
        .args_json(json!({"position_id": first}))
        .await?
        .json::<serde_json::Value>()?;
    assert_eq!(state["state"], "ReconciliationRequired");
    assert_eq!(balance(&root, &usdc, writer.id()).await?, 0);
    root.call(usdc.id(), "set_paused")
        .args_json(json!({"paused": false}))
        .transact()
        .await?
        .into_result()?;
    holder
        .call(escrow.id(), "retry_failed_payout")
        .args_json(json!({"position_id": first}))
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    let first_state = holder
        .view(escrow.id(), "get_position")
        .args_json(json!({"position_id": first}))
        .await?
        .json::<serde_json::Value>()?;
    assert_eq!(first_state["state"], "Settled");
    assert_eq!(first_state["collateral_delivered_to_holder"], true);
    assert_eq!(first_state["collateral_returned_to_writer"], false);
    assert_eq!(balance(&root, &usdc, writer.id()).await?, 50);
    assert_eq!(balance(&root, &stock, holder.id()).await?, 100);

    // Failure case 2: payment succeeds, collateral fails. Retry only collateral.
    let second_expiry = worker.view_block().await?.header().timestamp_nanosec() + 30_000_000_000;
    let second = make_position(
        &controller,
        &escrow,
        &writer,
        &holder,
        &stock,
        &usdc,
        1002,
        second_expiry,
    )
    .await?;
    transfer_call(&writer, &stock, &escrow, second, "collateral", 100).await?;
    worker.fast_forward(100).await?;
    transfer_call(&holder, &usdc, &escrow, second, "exercise_payment", 50).await?;
    root.call(stock.id(), "set_paused")
        .args_json(json!({"paused": true}))
        .transact()
        .await?
        .into_result()?;
    let _ = settle_and_read(&holder, &escrow, second).await?;
    let second_state = holder
        .view(escrow.id(), "get_position")
        .args_json(json!({"position_id": second}))
        .await?
        .json::<serde_json::Value>()?;
    assert_eq!(second_state["state"], "ReconciliationRequired");
    assert_eq!(balance(&root, &usdc, writer.id()).await?, 100);
    assert_eq!(balance(&root, &stock, holder.id()).await?, 100);
    root.call(stock.id(), "set_paused")
        .args_json(json!({"paused": false}))
        .transact()
        .await?
        .into_result()?;
    holder
        .call(escrow.id(), "retry_failed_payout")
        .args_json(json!({"position_id": second}))
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    let second_done = holder
        .view(escrow.id(), "get_position")
        .args_json(json!({"position_id": second}))
        .await?
        .json::<serde_json::Value>()?;
    assert_eq!(second_done["state"], "Settled");
    assert_eq!(second_done["collateral_delivered_to_holder"], true);
    assert_eq!(second_done["collateral_returned_to_writer"], false);
    assert_eq!(balance(&root, &usdc, writer.id()).await?, 100);
    assert_eq!(balance(&root, &stock, holder.id()).await?, 200);

    // A callback replay from an ordinary account must be rejected.
    let replay = holder
        .call(escrow.id(), "on_collateral_payout")
        .args_json(json!({"position_id": second}))
        .transact()
        .await?;
    assert!(replay.is_failure());

    Ok(())
}

#[tokio::test]
async fn callback_receipt_failure_keeps_payout_pending_and_blocks_retry() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let writer = worker.dev_create_account().await?;
    let holder = worker.dev_create_account().await?;
    let controller = worker.dev_create_account().await?;
    let escrow = deploy(
        &worker,
        concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../target/near/handel_escrow_fault_injection.wasm"
        ),
    )
    .await?;
    let stock = deploy(
        &worker,
        concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../target/near/handel_mock_ft/handel_mock_ft.wasm"
        ),
    )
    .await?;
    let usdc = deploy(
        &worker,
        concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../target/near/handel_mock_ft/handel_mock_ft.wasm"
        ),
    )
    .await?;

    root.call(escrow.id(), "new")
        .args_json(json!({}))
        .transact()
        .await?
        .into_result()?;
    root.call(stock.id(), "new")
        .args_json(json!({"owner_id": root.id()}))
        .transact()
        .await?
        .into_result()?;
    root.call(usdc.id(), "new")
        .args_json(json!({"owner_id": root.id()}))
        .transact()
        .await?
        .into_result()?;
    root.call(escrow.id(), "set_controller")
        .args_json(json!({"controller": controller.id()}))
        .transact()
        .await?
        .into_result()?;

    for token in [&stock, &usdc] {
        for account in [escrow.id(), writer.id(), holder.id()] {
            register_token_account(&root, token, account).await?;
        }
    }
    mint(&root, &stock, writer.id(), 100).await?;
    mint(&root, &usdc, holder.id(), 50).await?;

    let now = worker.view_block().await?.header().timestamp_nanosec();
    let position_id = make_position(
        &controller,
        &escrow,
        &writer,
        &holder,
        &stock,
        &usdc,
        1003,
        now + 30_000_000_000,
    )
    .await?;
    transfer_call(&writer, &stock, &escrow, position_id, "collateral", 100).await?;
    worker.fast_forward(100).await?;
    transfer_call(&holder, &usdc, &escrow, position_id, "exercise_payment", 50).await?;

    // The token transfer succeeds, then the test-only callback receipt deliberately panics.
    // The original settle transaction may report a failed promise chain; inspect durable state.
    let _ = holder
        .call(escrow.id(), "settle_exercise")
        .args_json(json!({"position_id": position_id}))
        .max_gas()
        .transact()
        .await?;

    let state = holder
        .view(escrow.id(), "get_position")
        .args_json(json!({"position_id": position_id}))
        .await?
        .json::<serde_json::Value>()?;
    assert_eq!(state["state"], "PaymentPayoutPending");
    assert_eq!(state["payment_paid"], false);
    assert_eq!(balance(&root, &usdc, writer.id()).await?, 50);

    // A retry is unsafe: the transfer already happened, but its callback did not persist.
    let retry = holder
        .call(escrow.id(), "retry_failed_payout")
        .args_json(json!({"position_id": position_id}))
        .max_gas()
        .transact()
        .await?;
    assert!(retry.is_failure());
    let after_retry = holder
        .view(escrow.id(), "get_position")
        .args_json(json!({"position_id": position_id}))
        .await?
        .json::<serde_json::Value>()?;
    assert_eq!(after_retry["state"], "PaymentPayoutPending");
    assert_eq!(balance(&root, &usdc, writer.id()).await?, 50);
    Ok(())
}


#[tokio::test]
async fn expiry_release_returns_only_unexercised_collateral_and_retries_definitive_failure(
) -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let writer = worker.dev_create_account().await?;
    let holder = worker.dev_create_account().await?;
    let controller = worker.dev_create_account().await?;
    let escrow = deploy(
        &worker,
        concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../target/near/handel_escrow/handel_escrow.wasm"
        ),
    )
    .await?;
    let stock = deploy(
        &worker,
        concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../target/near/handel_mock_ft/handel_mock_ft.wasm"
        ),
    )
    .await?;
    let usdc = deploy(
        &worker,
        concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../target/near/handel_mock_ft/handel_mock_ft.wasm"
        ),
    )
    .await?;

    root.call(escrow.id(), "new")
        .args_json(json!({}))
        .transact()
        .await?
        .into_result()?;
    root.call(stock.id(), "new")
        .args_json(json!({"owner_id": root.id()}))
        .transact()
        .await?
        .into_result()?;
    root.call(usdc.id(), "new")
        .args_json(json!({"owner_id": root.id()}))
        .transact()
        .await?
        .into_result()?;
    root.call(escrow.id(), "set_controller")
        .args_json(json!({"controller": controller.id()}))
        .transact()
        .await?
        .into_result()?;

    for token in [&stock, &usdc] {
        for account in [escrow.id(), writer.id(), holder.id()] {
            register_token_account(&root, token, account).await?;
        }
    }
    mint(&root, &stock, writer.id(), 200).await?;

    // First position: normal expiry release after maturity plus the full grace period.
    let first_expiry = worker.view_block().await?.header().timestamp_nanosec() + 30_000_000_000;
    let first = make_position(
        &controller, &escrow, &writer, &holder, &stock, &usdc, 2001, first_expiry,
    ).await?;
    transfer_call(&writer, &stock, &escrow, first, "collateral", 100).await?;
    worker.fast_forward(100_000).await?;
    writer
        .call(escrow.id(), "release_expired_collateral")
        .args_json(json!({"position_id": first}))
        .max_gas()
        .transact()
        .await?
        .into_result()?;

    let first_state = root.view(escrow.id(), "get_position")
        .args_json(json!({"position_id": first}))
        .await?.json::<serde_json::Value>()?;
    assert_eq!(first_state["state"], "Expired");
    assert_eq!(first_state["collateral_returned_to_writer"], true);
    assert_eq!(first_state["exercise_payment_received"], false);
    assert_eq!(balance(&root, &stock, writer.id()).await?, 200);

    // Second position: definitive token-transfer failure is recorded and only that
    // unpaid expiry leg may be retried after the token is unpaused.
    let second_expiry = worker.view_block().await?.header().timestamp_nanosec() + 30_000_000_000;
    let second = make_position(
        &controller, &escrow, &writer, &holder, &stock, &usdc, 2002, second_expiry,
    ).await?;
    transfer_call(&writer, &stock, &escrow, second, "collateral", 100).await?;
    worker.fast_forward(100_000).await?;
    root.call(stock.id(), "set_paused")
        .args_json(json!({"paused": true}))
        .transact()
        .await?
        .into_result()?;
    writer
        .call(escrow.id(), "release_expired_collateral")
        .args_json(json!({"position_id": second}))
        .max_gas()
        .transact()
        .await?
        .into_result()?;

    let failed = root.view(escrow.id(), "get_position")
        .args_json(json!({"position_id": second}))
        .await?.json::<serde_json::Value>()?;
    assert_eq!(failed["state"], "ReconciliationRequired");
    assert_eq!(failed["failed_payout"], "ExpiryCollateral");
    assert_eq!(failed["collateral_returned_to_writer"], false);
    assert_eq!(balance(&root, &stock, writer.id()).await?, 200);

    root.call(stock.id(), "set_paused")
        .args_json(json!({"paused": false}))
        .transact()
        .await?
        .into_result()?;
    writer
        .call(escrow.id(), "retry_failed_payout")
        .args_json(json!({"position_id": second}))
        .max_gas()
        .transact()
        .await?
        .into_result()?;

    let recovered = root.view(escrow.id(), "get_position")
        .args_json(json!({"position_id": second}))
        .await?.json::<serde_json::Value>()?;
    assert_eq!(recovered["state"], "Expired");
    assert_eq!(recovered["collateral_returned_to_writer"], true);
    assert_eq!(balance(&root, &stock, writer.id()).await?, 300);

    Ok(())
}
