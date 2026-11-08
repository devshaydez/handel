use near_sdk::NearToken;
use serde_json::json;

#[tokio::test]
async fn benchmark_position_creation_gas_at_increasing_cardinalities() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let escrow_wasm = std::fs::read(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../target/near/handel_escrow/handel_escrow.wasm"
    ))?;
    let escrow = worker.dev_deploy(&escrow_wasm).await?;
    root.call(escrow.id(), "new")
        .args_json(json!({}))
        .transact()
        .await?
        .into_result()?;
    root.call(escrow.id(), "set_controller")
        .args_json(json!({"controller": root.id()}))
        .transact()
        .await?
        .into_result()?;

    let expiry = worker.view_block().await?.header().timestamp_nanosec() + 86_400_000_000_000;
    for index in 1..=100u64 {
        let result = root
            .call(escrow.id(), "create_position")
            .args_json(json!({
                "writer": "writer.testnet",
                "holder": "holder.testnet",
                "collateral_token": "stock.testnet",
                "collateral_amount": "100",
                "payment_token": "usdc.testnet",
                "payment_amount": "50",
                "expiry_ns": expiry
            }))
            .deposit(NearToken::from_near(1))
            .transact()
            .await?;
        let gas = result.total_gas_burnt;
        result.into_result()?;
        if [1, 10, 25, 50, 75, 100].contains(&index) {
            println!("STORAGE_GAS_BENCHMARK positions={index} create_position_total_gas={gas}");
        }
    }
    Ok(())
}
