use near_sdk::NearToken;
use near_workspaces::{network::Sandbox, Contract, Worker};
use serde_json::json;

async fn deploy(worker: &Worker<Sandbox>, path: &str) -> anyhow::Result<Contract> {
    let wasm = std::fs::read(path)?;
    Ok(worker.dev_deploy(&wasm).await?)
}

#[tokio::test]
async fn call_and_put_registration_deposit_and_settle_through_escrow() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let writer = worker.dev_create_account().await?;
    let holder = worker.dev_create_account().await?;
    let agent = worker.dev_create_account().await?;
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
            "/../../target/near/handel_options_fault_injection.wasm"
        ),
    )
    .await?;
    let escrow = deploy(
        &worker,
        concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../target/near/handel_escrow_default.wasm"
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
        .args_json(json!({"account_id": holder.id(), "amount": "3000000"}))
        .transact()
        .await?
        .into_result()?;

    // Configure the escrow address, then have OptionsContract itself accept
    // the proposed controller role. An external root account cannot impersonate
    // the contract account when Escrow checks predecessor_account_id().
    root.call(options.id(), "set_escrow_contract")
        .args_json(json!({"escrow_contract": escrow.id()}))
        .transact()
        .await?
        .into_result()?;
    root.call(escrow.id(), "propose_controller")
        .args_json(json!({"controller": options.id()}))
        .transact()
        .await?
        .into_result()?;
    root.call(options.id(), "accept_escrow_controller")
        .args_json(json!({}))
        .max_gas()
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

    // The proof script supplies both the exact live-AI proposal and the SDK-prepared
    // create_agent_proposal arguments. CI without those files remains deterministic.
    let ai_proposal = match std::env::var("HANDEL_DEMO_PROPOSAL_FILE") {
        Ok(path) => Some(serde_json::from_slice::<serde_json::Value>(
            &std::fs::read(path)?,
        )?),
        Err(_) => None,
    };
    let ai_prepared = match std::env::var("HANDEL_DEMO_PREPARED_FILE") {
        Ok(path) => Some(serde_json::from_slice::<serde_json::Value>(
            &std::fs::read(path)?,
        )?),
        Err(_) => None,
    };
    let prepared_args = ai_prepared
        .as_ref()
        .map(|prepared| &prepared["prepared"]["args"]);
    let now_ns = worker.view_block().await?.header().timestamp_nanosec();
    let expiry = prepared_args
        .and_then(|args| args["expiry_ns"].as_str())
        .or_else(|| {
            ai_proposal
                .as_ref()
                .and_then(|proposal| proposal["expiryNs"].as_str())
        })
        .map(str::parse::<u64>)
        .transpose()?
        .unwrap_or(now_ns + 10 * 60 * 1_000_000_000);
    let underlying_amount = prepared_args
        .and_then(|args| args["underlying_amount"].as_str())
        .or_else(|| {
            ai_proposal
                .as_ref()
                .and_then(|proposal| proposal["quantity"].as_str())
        })
        .map(str::parse::<u128>)
        .transpose()?
        .unwrap_or(1_000_000);
    let strike_amount_usdc = prepared_args
        .and_then(|args| args["strike_amount_usdc"].as_str())
        .or_else(|| {
            ai_proposal
                .as_ref()
                .and_then(|proposal| proposal["strike"].as_str())
        })
        .map(str::parse::<u128>)
        .transpose()?
        .unwrap_or(2_500_000);
    let premium_amount_usdc = prepared_args
        .and_then(|args| args["premium_amount_usdc"].as_str())
        .or_else(|| {
            ai_proposal
                .as_ref()
                .and_then(|proposal| proposal["premium"].as_str())
        })
        .map(str::parse::<u128>)
        .transpose()?
        .unwrap_or(100_000);
    let proposal_id = prepared_args
        .and_then(|args| args["proposal_id"].as_str())
        .or_else(|| {
            ai_proposal
                .as_ref()
                .and_then(|proposal| proposal["proposalId"].as_str())
        })
        .unwrap_or("judge-demo-call-001");
    let kind = prepared_args
        .and_then(|args| args["kind"].as_str())
        .or_else(|| {
            ai_proposal
                .as_ref()
                .and_then(|proposal| proposal["type"].as_str())
        })
        .unwrap_or("Call");
    let asset_id = prepared_args
        .and_then(|args| args["asset_id"].as_str())
        .or_else(|| {
            ai_proposal
                .as_ref()
                .and_then(|proposal| proposal["underlyingAssetId"].as_str())
        })
        .unwrap_or(STOCK_ASSET);
    let rationale_hash = prepared_args
        .and_then(|args| args["rationale_hash"].as_str())
        .unwrap_or("sha256:simulated-market-rationale");

    if let Some(proposal) = ai_proposal.as_ref() {
        assert_eq!(proposal["proposalId"], proposal_id);
        assert_eq!(proposal["type"], kind);
        assert_eq!(proposal["underlyingAssetId"], asset_id);
        assert_eq!(proposal["quantity"], underlying_amount.to_string());
        assert_eq!(proposal["strike"], strike_amount_usdc.to_string());
        assert_eq!(proposal["premium"], "100000");
        assert!(
            expiry > now_ns + 5 * 60 * 1_000_000_000,
            "AI proposal expires too soon for Sandbox run"
        );
        assert!(!proposal["rationale"]
            .as_str()
            .unwrap_or_default()
            .trim()
            .is_empty());
        assert!(proposal["risks"]
            .as_array()
            .is_some_and(|risks| !risks.is_empty()));
    }
    if let (Some(proposal), Some(args)) = (ai_proposal.as_ref(), prepared_args) {
        assert_eq!(args["proposal_id"], proposal["proposalId"]);
        assert_eq!(args["kind"], proposal["type"]);
        assert_eq!(args["asset_id"], proposal["underlyingAssetId"]);
        assert_eq!(args["underlying_amount"], proposal["quantity"]);
        assert_eq!(args["strike_amount_usdc"], proposal["strike"]);
        assert_eq!(args["expiry_ns"], proposal["expiryNs"]);
        assert_eq!(args["premium_amount_usdc"], "100000");
        assert!(args["rationale_hash"]
            .as_str()
            .is_some_and(|hash| hash.starts_with("sha256:")));
    }

    // The contract receives the exact SDK-prepared terms. The agent account
    // submits the proposal; the principal must approve it in a separate call.
    writer
        .call(options.id(), "set_agent_policy")
        .args_json(json!({
            "agent_id": agent.id(),
            "allowed_assets": [asset_id],
            "max_underlying_amount": underlying_amount,
            "max_premium_usdc": premium_amount_usdc,
            "max_collateral_usdc": strike_amount_usdc,
            "max_open_positions": 5,
            "expires_at_ns": expiry + 60_000_000_000
        }))
        .transact()
        .await?
        .into_result()?;

    agent
        .call(options.id(), "create_agent_proposal")
        .args_json(json!({
            "proposal_id": proposal_id,
            "kind": kind,
            "holder": holder.id(),
            "asset_id": asset_id,
            "underlying_amount": underlying_amount,
            "strike_amount_usdc": strike_amount_usdc,
            "expiry_ns": expiry,
            "premium_amount_usdc": premium_amount_usdc,
            "rationale_hash": rationale_hash
        }))
        .transact()
        .await?
        .into_result()?;

    let pending_proposal = root
        .view(options.id(), "get_agent_proposal")
        .args_json(json!({"proposal_id": proposal_id}))
        .await?
        .json::<serde_json::Value>()?;
    assert_eq!(pending_proposal["state"], "PendingApproval");

    // A proposal cannot be registered into escrow before the principal approves.
    let premature_registration = writer
        .call(options.id(), "register_escrow_position")
        .args_json(json!({"position_id": 0}))
        .max_gas()
        .transact()
        .await?;
    assert!(premature_registration.is_failure());

    writer
        .call(options.id(), "approve_agent_proposal")
        .args_json(json!({"proposal_id": proposal_id}))
        .transact()
        .await?
        .into_result()?;
    let approved_proposal = root
        .view(options.id(), "get_agent_proposal")
        .args_json(json!({"proposal_id": proposal_id}))
        .await?
        .json::<serde_json::Value>()?;
    assert_eq!(approved_proposal["state"], "Approved");

    // Inject a one-time callback receipt failure after Escrow has committed its
    // idempotent source-position record. The Options state must remain pending.
    root.call(options.id(), "set_registration_callback_failure")
        .args_json(json!({"enabled": true}))
        .transact()
        .await?
        .into_result()?;
    let _ = writer
        .call(options.id(), "register_escrow_position")
        .args_json(json!({"position_id": 0}))
        .max_gas()
        .transact()
        .await?;

    let pending_option = root
        .view(options.id(), "get_position")
        .args_json(json!({"id": 0}))
        .await?
        .json::<serde_json::Value>()?;
    assert_eq!(
        pending_option["escrow_position_id"],
        serde_json::Value::Null
    );
    assert_eq!(pending_option["escrow_registration_pending"], true);
    let committed_escrow = root
        .view(escrow.id(), "get_position")
        .args_json(json!({"position_id": 0}))
        .await?
        .json::<serde_json::Value>()?;
    assert_eq!(committed_escrow["source_position_id"], 0);

    // Disable the injected failure and retry. Escrow must return the same record,
    // not create a duplicate position or transfer any tokens again.
    root.call(options.id(), "set_registration_callback_failure")
        .args_json(json!({"enabled": false}))
        .transact()
        .await?
        .into_result()?;
    writer
        .call(options.id(), "retry_escrow_registration")
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

    // Collect and pay both premiums in USDC before either option can become Open.
    // Call and Put both use USDC premium, although their collateral/exercise legs differ.
    for position_id in [0u64, 1u64] {
        holder
            .call(usdc_token.id(), "ft_transfer_call")
            .args_json(json!({
                "receiver_id": escrow.id(),
                "amount": "100000",
                "memo": null,
                "msg": format!(r#"{{"position_id":{},"leg":"premium"}}"#, position_id)
            }))
            .deposit(NearToken::from_yoctonear(1))
            .max_gas()
            .transact()
            .await?
            .into_result()?;

        holder
            .call(escrow.id(), "settle_premium")
            .args_json(json!({"position_id": position_id}))
            .max_gas()
            .transact()
            .await?
            .into_result()?;

        let latest_sequence = root
            .view(escrow.id(), "get_latest_lifecycle_sequence")
            .args_json(json!({"position_id": position_id}))
            .await?
            .json::<u64>()?;
        let last_accepted = root
            .view(options.id(), "get_last_accepted_escrow_sequence")
            .args_json(json!({"position_id": position_id}))
            .await?
            .json::<u64>()?;
        for sequence in (last_accepted + 1)..=latest_sequence {
            root.call(escrow.id(), "retry_lifecycle_event")
                .args_json(json!({"position_id": position_id, "sequence": sequence}))
                .max_gas()
                .transact()
                .await?
                .into_result()?;
        }

        let premium = root
            .view(escrow.id(), "get_premium_status")
            .args_json(json!({"position_id": position_id}))
            .await?
            .json::<serde_json::Value>()?;
        assert_eq!(premium["received"], true);
        assert_eq!(premium["paid"], true);

        let opened = root
            .view(options.id(), "get_position")
            .args_json(json!({"id": position_id}))
            .await?
            .json::<serde_json::Value>()?;
        assert_eq!(opened["state"], "Open");
    }

    // Exercise both options at maturity. Sandbox block timestamps do not have
    // a guaranteed one-second cadence, so advance in bounded batches and poll
    // the actual chain timestamp after every batch instead of estimating blocks.
    let mut exercise_timestamp = worker.view_block().await?.header().timestamp_nanosec();
    let mut fast_forward_batches = 0u32;
    while exercise_timestamp < expiry && fast_forward_batches < 1_000 {
        worker.fast_forward(1_000).await?;
        exercise_timestamp = worker.view_block().await?.header().timestamp_nanosec();
        fast_forward_batches += 1;
    }
    assert!(
        exercise_timestamp >= expiry,
        "Sandbox did not reach option expiry {expiry} after {} fast-forwarded blocks; current timestamp is {exercise_timestamp}",
        fast_forward_batches * 1_000
    );
    let exercise_deadline = expiry
        .checked_add(60 * 60 * 1_000_000_000)
        .expect("exercise deadline overflow");
    assert!(
        exercise_timestamp >= expiry && exercise_timestamp <= exercise_deadline,
        "Sandbox timestamp {exercise_timestamp} is outside exercise window [{expiry}, {exercise_deadline}]"
    );
    holder
        .call(usdc_token.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": escrow.id(),
            "amount": "2500000",
            "memo": null,
            "msg": "{\"position_id\":0,\"leg\":\"exercise_payment\"}"
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
            "msg": "{\"position_id\":1,\"leg\":\"exercise_payment\"}"
        }))
        .deposit(NearToken::from_yoctonear(1))
        .max_gas()
        .transact()
        .await?
        .into_result()?;

    // Assert the NEP-141 receiver accepted both exercise legs before attempting
    // settlement. ft_transfer_call itself succeeds even when the receiver
    // returns the transferred amount as unused.
    for position_id in [0u64, 1u64] {
        let payment_received = root
            .view(escrow.id(), "get_position")
            .args_json(json!({"position_id": position_id}))
            .await?
            .json::<serde_json::Value>()?;
        assert_eq!(
            payment_received["state"],
            "ExercisePaymentReceived",
            "escrow rejected exercise payment for position {position_id} at Sandbox timestamp {exercise_timestamp}"
        );
        assert_eq!(payment_received["exercise_payment_received"], true);
    }

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
        let latest_sequence = root
            .view(escrow.id(), "get_latest_lifecycle_sequence")
            .args_json(json!({"position_id": position_id}))
            .await?
            .json::<u64>()?;
        let last_accepted = root
            .view(options.id(), "get_last_accepted_escrow_sequence")
            .args_json(json!({"position_id": position_id}))
            .await?
            .json::<u64>()?;
        for sequence in (last_accepted + 1)..=latest_sequence {
            root.call(escrow.id(), "retry_lifecycle_event")
                .args_json(json!({"position_id": position_id, "sequence": sequence}))
                .max_gas()
                .transact()
                .await?
                .into_result()?;
        }

        let option_settled = root
            .view(options.id(), "get_position")
            .args_json(json!({"id": position_id}))
            .await?
            .json::<serde_json::Value>()?;
        assert_eq!(option_settled["state"], "Settled");
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
    assert_eq!(writer_usdc.0, 2700000);
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
    assert_eq!(holder_usdc.0, 2800000);

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
