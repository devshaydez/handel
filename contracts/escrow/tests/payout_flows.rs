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
    expiry_ns: u64,
) -> anyhow::Result<u64> {
    call_json(
        controller,
        escrow,
        "create_position",
        json!({
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
        concat!(env!("CARGO_MANIFEST_DIR"), "/../../target/wasm32-unknown-unknown/release/handel_escrow.wasm"),
    )
    .await?;
    let stock = deploy(
        &worker,
        concat!(env!("CARGO_MANIFEST_DIR"), "/../../target/wasm32-unknown-unknown/release/handel_mock_ft.wasm"),
    )
    .await?;
    let usdc = deploy(
        &worker,
        "target/wasm32-unknown-unknown/release/handel_mock_ft.wasm",
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
        expiry,
    )
    .await?;
    transfer_call(&writer, &stock, &escrow, first, "collateral", 100).await?;
    worker.fast_forward(40).await?;
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
    assert_eq!(balance(&root, &usdc, writer.id()).await?, 50);
    assert_eq!(balance(&root, &stock, holder.id()).await?, 100);

    // Failure case 2: payment succeeds, collateral fails. Retry only collateral.
    let second = make_position(
        &controller,
        &escrow,
        &writer,
        &holder,
        &stock,
        &usdc,
        expiry,
    )
    .await?;
    transfer_call(&writer, &stock, &escrow, second, "collateral", 100).await?;
    worker.fast_forward(40).await?;
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
