use near_sdk::{
    env, json_types::U64, near, store::UnorderedMap, AccountId, Gas, NearToken, PanicOnDefault,
    Promise, PromiseResult,
};

/// Holders get a 24-hour post-maturity window to submit exercise transactions.
/// This is a transaction-submission grace period, not an American early-exercise window.
const EXERCISE_GRACE_NS: u64 = 24 * 60 * 60 * 1_000_000_000;
const ESCROW_REGISTER_GAS: Gas = Gas::from_tgas(20);
const ESCROW_CALLBACK_GAS: Gas = Gas::from_tgas(10);
const ESCROW_STORAGE_DEPOSIT: NearToken = NearToken::from_near(1);
const USDC_ASSET_ID_STORAGE_KEY: &[u8] = b"handel:options:usdc-asset-id:v1";
const AGENT_EXECUTION_MODE_STORAGE_PREFIX: &[u8] = b"handel:agent-execution-mode:v1:";
const AGENT_POSITION_STORAGE_PREFIX: &[u8] = b"handel:agent-position:v1:";

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum OptionKind {
    Call,
    Put,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum PositionState {
    PendingCollateral,
    PendingCollateralReconciliation,
    CollateralLocked,
    PendingPremium,
    Open,
    PendingSettlement,
    Settled,
    PendingExpiry,
    Expired,
    Cancelled,
    ReconciliationRequired,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum OperationKind {
    LockCollateral,
    PayPremium,
    ExercisePayment,
    ExerciseDelivery,
    ExpiryRelease,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum OperationState {
    Pending,
    Succeeded,
    Failed,
    ReconciliationRequired,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum EvidenceOutcome {
    Completed,
    Failed,
}

/// Evidence accepted only from the configured trusted reconciler. That service must
/// independently verify the receipt against the Tidepool verifier before submitting it.
#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct ReconciliationEvidence {
    pub operation_id: String,
    pub transfer_reference: String,
    pub asset_id: String,
    pub amount: u128,
    pub sender: AccountId,
    pub receiver: AccountId,
    pub outcome: EvidenceOutcome,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Operation {
    pub id: String,
    pub position_id: u64,
    pub kind: OperationKind,
    pub state: OperationState,
    pub requested_asset_id: String,
    pub requested_amount: u128,
    pub expected_sender: AccountId,
    pub expected_receiver: AccountId,
    pub external_reference: Option<String>,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct AssetMetadata {
    pub asset_id: String,
    pub decimals: u8,
    pub enabled: bool,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct EscrowLifecycleEvent {
    pub source_position_id: u64,
    pub escrow_position_id: u64,
    pub sequence: u64,
    pub state: String,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct OptionPosition {
    pub id: u64,
    pub kind: OptionKind,
    pub writer: AccountId,
    pub holder: AccountId,
    pub asset_id: String,
    pub underlying_amount: u128,
    pub strike_amount_usdc: u128,
    pub expiry_ns: u64,
    pub premium_amount_usdc: u128,
    pub state: PositionState,
    pub collateral_operation_id: Option<String>,
    pub premium_operation_id: Option<String>,
    pub exercise_payment_operation_id: Option<String>,
    pub exercise_delivery_operation_id: Option<String>,
    pub expiry_release_operation_id: Option<String>,
    pub exercised_at_ns: Option<u64>,
    pub escrow_position_id: Option<u64>,
    pub escrow_registration_pending: bool,
    pub escrow_contract_id: Option<AccountId>,
    pub escrow_collateral_token: Option<AccountId>,
    pub escrow_payment_token: Option<AccountId>,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AgentExecutionMode {
    Education,
    Advisory,
    ManualApproval,
    Delegated,
}

impl AgentExecutionMode {
    fn storage_byte(self) -> u8 {
        match self {
            Self::Education => 0,
            Self::Advisory => 1,
            Self::ManualApproval => 2,
            Self::Delegated => 3,
        }
    }

    fn from_storage_byte(value: u8) -> Self {
        match value {
            0 => Self::Education,
            1 => Self::Advisory,
            2 => Self::ManualApproval,
            3 => Self::Delegated,
            _ => env::panic_str("invalid stored agent execution mode"),
        }
    }
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct AgentPolicy {
    pub principal: AccountId,
    pub allowed_assets: Vec<String>,
    pub max_underlying_amount: u128,
    pub max_premium_usdc: u128,
    pub max_collateral_usdc: u128,
    pub max_open_positions: u32,
    pub expires_at_ns: u64,
    pub enabled: bool,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProposalState {
    PendingApproval,
    Approved,
    Rejected,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct AgentProposal {
    pub proposal_id: String,
    pub position_id: u64,
    pub principal: AccountId,
    pub agent_id: AccountId,
    pub kind: OptionKind,
    pub asset_id: String,
    pub underlying_amount: u128,
    pub strike_amount_usdc: u128,
    pub expiry_ns: u64,
    pub premium_amount_usdc: u128,
    pub rationale_hash: String,
    pub state: ProposalState,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct OptionsContract {
    owner: AccountId,
    next_id: u64,
    positions: UnorderedMap<u64, OptionPosition>,
    asset_registry: UnorderedMap<String, AssetMetadata>,
    operations: UnorderedMap<String, Operation>,
    used_operation_ids: UnorderedMap<String, bool>,
    paused: bool,
    trusted_reconciler: Option<AccountId>,
    agent_policies: UnorderedMap<AccountId, AgentPolicy>,
    proposals: UnorderedMap<String, AgentProposal>,
    escrow_contract: Option<AccountId>,
    escrow_token_accounts: UnorderedMap<String, AccountId>,
}

#[near]
impl OptionsContract {
    #[init]
    pub fn new() -> Self {
        Self {
            owner: env::predecessor_account_id(),
            next_id: 0,
            positions: UnorderedMap::new(b"p".to_vec()),
            asset_registry: UnorderedMap::new(b"a".to_vec()),
            operations: UnorderedMap::new(b"o".to_vec()),
            used_operation_ids: UnorderedMap::new(b"u".to_vec()),
            paused: false,
            trusted_reconciler: None,
            agent_policies: UnorderedMap::new(b"g".to_vec()),
            proposals: UnorderedMap::new(b"r".to_vec()),
            escrow_contract: None,
            escrow_token_accounts: UnorderedMap::new(b"e".to_vec()),
        }
    }

    /// Creates an offer. No assets move until collateral is confirmed.
    pub fn create_call(
        &mut self,
        holder: AccountId,
        asset_id: String,
        underlying_amount: u128,
        strike_amount_usdc: u128,
        expiry_ns: u64,
        premium_amount_usdc: u128,
    ) -> u64 {
        self.create_offer(
            OptionKind::Call,
            env::predecessor_account_id(),
            holder,
            asset_id,
            underlying_amount,
            strike_amount_usdc,
            expiry_ns,
            premium_amount_usdc,
        )
    }

    /// Creates an offer. No assets move until collateral is confirmed.
    pub fn create_put(
        &mut self,
        holder: AccountId,
        asset_id: String,
        underlying_amount: u128,
        strike_amount_usdc: u128,
        expiry_ns: u64,
        premium_amount_usdc: u128,
    ) -> u64 {
        self.create_offer(
            OptionKind::Put,
            env::predecessor_account_id(),
            holder,
            asset_id,
            underlying_amount,
            strike_amount_usdc,
            expiry_ns,
            premium_amount_usdc,
        )
    }

    /// Configure the isolated NEP-141 escrow contract. The escrow must set this
    /// OptionsContract account as its controller before registration is attempted.
    pub fn set_escrow_contract(&mut self, escrow_contract: AccountId) {
        self.assert_owner();
        assert_ne!(
            escrow_contract,
            env::current_account_id(),
            "invalid escrow contract"
        );
        self.escrow_contract = Some(escrow_contract);
    }

    /// Have this contract accept the Escrow controller role after its owner
    /// configures the Escrow and the Escrow owner proposes this contract.
    /// The cross-contract call originates from OptionsContract itself, which is
    /// the account that Escrow must authenticate as the proposed controller.
    pub fn accept_escrow_controller(&mut self) -> Promise {
        self.assert_owner();
        let escrow = self
            .escrow_contract
            .clone()
            .expect("escrow contract not configured");
        Promise::new(escrow).function_call(
            "accept_controller".to_string(),
            Vec::new(),
            NearToken::from_yoctonear(0),
            Gas::from_tgas(10),
        )
    }

    /// Bind a Handel asset identifier to its deployed NEP-141 token contract.
    /// This is explicit because some asset identifiers (notably the USDC registry ID)
    /// are not NEAR account IDs.
    pub fn set_escrow_token_account(&mut self, asset_id: String, token_account: AccountId) {
        self.assert_owner();
        assert!(
            self.asset_registry
                .get(&asset_id)
                .is_some_and(|asset| asset.enabled),
            "asset must be enabled"
        );
        self.escrow_token_accounts.insert(asset_id, token_account);
    }

    /// Register immutable option terms in the isolated NEP-141 escrow.
    /// This does not deposit collateral or move the option into the external-reconciliation
    /// lifecycle. The writer must use the escrow's NEP-141 transfer_call flow separately.
    pub fn register_escrow_position(&mut self, position_id: u64) -> Promise {
        self.assert_not_paused();
        let mut position = self.position_owned_by_writer_or_active_agent(position_id);
        assert_eq!(
            position.state,
            PositionState::PendingCollateral,
            "option already entered another lifecycle"
        );
        // The escrow rail must enforce the same principal-approval gate as the
        // external collateral rail. Otherwise an agent proposal could bypass approval
        // simply by choosing register_escrow_position instead of begin_collateral_lock.
        assert!(
            self.proposals.values().all(|proposal| {
                proposal.position_id != position_id || proposal.state == ProposalState::Approved
            }),
            "agent proposal requires principal approval"
        );
        for proposal in self
            .proposals
            .values()
            .filter(|proposal| proposal.position_id == position_id)
        {
            assert_eq!(
                proposal.state,
                ProposalState::Approved,
                "agent proposal not approved"
            );
        }
        assert!(
            position.escrow_position_id.is_none(),
            "escrow position already registered"
        );
        assert!(
            !position.escrow_registration_pending,
            "escrow registration already pending"
        );
        let escrow = position
            .escrow_contract_id
            .clone()
            .or_else(|| self.escrow_contract.clone())
            .expect("escrow contract not configured");
        let collateral_asset = self.collateral_asset_id(&position);
        let payment_asset = self.exercise_payment_asset_id(&position);
        let collateral_token = position
            .escrow_collateral_token
            .clone()
            .or_else(|| self.escrow_token_accounts.get(&collateral_asset).cloned())
            .expect("collateral NEP-141 token not configured");
        let payment_token = position
            .escrow_payment_token
            .clone()
            .or_else(|| self.escrow_token_accounts.get(&payment_asset).cloned())
            .expect("payment NEP-141 token not configured");
        // Pin all external contract/token addresses on the option at first attempt so
        // configuration changes cannot redirect an ambiguous retry to a different escrow.
        position.escrow_contract_id = Some(escrow.clone());
        position.escrow_collateral_token = Some(collateral_token.clone());
        position.escrow_payment_token = Some(payment_token.clone());
        let premium_token = if position.kind == OptionKind::Call {
            payment_token.clone()
        } else {
            collateral_token.clone()
        };
        let args = near_sdk::serde_json::json!({
            "source_position_id": position.id,
            "writer": position.writer,
            "holder": position.holder,
            "collateral_token": collateral_token,
            "collateral_amount": Self::required_collateral(&position).to_string(),
            "payment_token": payment_token,
            "payment_amount": Self::exercise_payment_amount(&position).to_string(),
            "expiry_ns": position.expiry_ns,
            "premium_token": premium_token,
            "premium_amount": position.premium_amount_usdc.to_string()
        });
        position.escrow_registration_pending = true;
        self.positions.insert(position_id, position.clone());
        if env::storage_read(&Self::agent_position_storage_key(position_id)).is_some() {
            env::log_str(&format!("EVENT_JSON:{}", near_sdk::serde_json::json!({
                "standard":"nep297","version":"1.0.0","event":"agent_escrow_registration_started",
                "data":[{"position_id":position_id.to_string(),"agent":env::predecessor_account_id(),"principal":position.writer}]
            })));
        }
        Promise::new(escrow)
            .function_call(
                "create_position_v2".to_string(),
                near_sdk::serde_json::to_vec(&args).expect("serialize escrow registration"),
                ESCROW_STORAGE_DEPOSIT,
                ESCROW_REGISTER_GAS,
            )
            .then(
                Promise::new(env::current_account_id()).function_call(
                    "on_escrow_position_registered".to_string(),
                    near_sdk::serde_json::to_vec(&near_sdk::serde_json::json!({
                        "position_id": position_id
                    }))
                    .expect("serialize escrow callback"),
                    NearToken::from_yoctonear(0),
                    ESCROW_CALLBACK_GAS,
                ),
            )
    }

    /// Retry an ambiguous/failed registration. Escrow registration is idempotent by source ID.
    pub fn retry_escrow_registration(&mut self, position_id: u64) -> Promise {
        let position = self.position_owned_by_writer(position_id);
        assert!(
            position.escrow_position_id.is_none(),
            "escrow position already registered"
        );
        // A callback receipt may have failed after escrow committed the registration.
        // Clear the local in-flight marker and safely repeat the idempotent escrow call.
        self.positions
            .get_mut(&position_id)
            .unwrap()
            .escrow_registration_pending = false;
        self.register_escrow_position(position_id)
    }

    #[cfg(feature = "fault-injection")]
    pub fn set_registration_callback_failure(&mut self, enabled: bool) {
        self.assert_owner();
        let key = b"handel:options:test:registration-callback-failure";
        if enabled {
            env::storage_write(key, b"1");
        } else {
            env::storage_remove(key);
        }
    }

    #[private]
    pub fn on_escrow_position_registered(&mut self, position_id: u64) -> bool {
        #[cfg(feature = "fault-injection")]
        if env::storage_read(b"handel:options:test:registration-callback-failure").is_some() {
            env::panic_str("injected registration callback receipt failure (test-only Wasm)");
        }

        let mut position = self.position(position_id);
        match env::promise_result(0) {
            PromiseResult::Successful(bytes) => {
                let escrow_id: u64 = near_sdk::serde_json::from_slice(&bytes)
                    .expect("invalid escrow registration result");
                if let Some(existing_id) = position.escrow_position_id {
                    assert_eq!(existing_id, escrow_id, "escrow registration ID changed");
                }
                position.escrow_position_id = Some(escrow_id);
                position.escrow_registration_pending = false;
                self.positions.insert(position_id, position);
                true
            }
            PromiseResult::Failed => {
                position.escrow_registration_pending = false;
                self.positions.insert(position_id, position);
                false
            }
        }
    }

    /// Starts a collateral operation after the writer has submitted their own NEP-413 transfer.
    /// Never accepts or stores a signature or signing key. Pending until explicit reconciliation.
    pub fn begin_collateral_lock(&mut self, position_id: u64, operation_id: String) {
        self.assert_not_paused();
        let position = self.position_owned_by_writer_or_active_agent(position_id);
        assert!(
            position.escrow_position_id.is_none() && !position.escrow_registration_pending,
            "position belongs to escrow lifecycle"
        );
        assert_eq!(
            position.state,
            PositionState::PendingCollateral,
            "not awaiting collateral"
        );
        assert!(
            self.proposals.values().all(|proposal| {
                proposal.position_id != position_id || proposal.state == ProposalState::Approved
            }),
            "agent proposal requires principal approval"
        );
        for proposal in self
            .proposals
            .values()
            .filter(|p| p.position_id == position_id)
        {
            assert_eq!(
                proposal.state,
                ProposalState::Approved,
                "agent proposal not approved"
            );
        }
        let amount = Self::required_collateral(&position);
        let asset_id = self.collateral_asset_id(&position);
        self.begin_operation(
            operation_id.clone(),
            position_id,
            OperationKind::LockCollateral,
            asset_id,
            amount,
            position.writer.clone(),
            env::current_account_id(),
        );
        let position = self.positions.get_mut(&position_id).unwrap();
        position.state = PositionState::PendingCollateralReconciliation;
        position.collateral_operation_id = Some(operation_id);
        if env::storage_read(&Self::agent_position_storage_key(position_id)).is_some() {
            let p = self.position(position_id);
            env::log_str(&format!("EVENT_JSON:{}", near_sdk::serde_json::json!({
                "standard":"nep297","version":"1.0.0","event":"agent_collateral_initiated",
                "data":[{"position_id":position_id.to_string(),"agent":env::predecessor_account_id(),"principal":p.writer}]
            })));
        }
    }

    /// Accept a lifecycle event only from the escrow contract pinned to this position.
    /// Sequence and digest are stored in disjoint raw-storage keys, preserving all existing
    /// Borsh root and OptionPosition layouts.
    pub fn on_escrow_lifecycle_event(&mut self, event: EscrowLifecycleEvent) -> bool {
        let position = self
            .positions
            .get(&event.source_position_id)
            .cloned()
            .expect("source option position missing");
        let escrow = position
            .escrow_contract_id
            .as_ref()
            .expect("escrow contract not pinned");
        assert_eq!(
            env::predecessor_account_id(),
            *escrow,
            "pinned escrow contract only"
        );
        assert_eq!(
            position.escrow_position_id,
            Some(event.escrow_position_id),
            "escrow position ID mismatch"
        );
        assert_eq!(
            position.id, event.source_position_id,
            "source position ID mismatch"
        );

        let sequence_key = format!("handel:options:v2:escrow-seq:{}", position.id).into_bytes();
        let digest_key = format!("handel:options:v2:escrow-digest:{}", position.id).into_bytes();
        let last_sequence = env::storage_read(&sequence_key)
            .and_then(|bytes| {
                if bytes.len() == 8 {
                    Some(u64::from_le_bytes(bytes.try_into().ok()?))
                } else {
                    None
                }
            })
            .unwrap_or(0);
        let encoded = near_sdk::serde_json::to_vec(&event).expect("serialize event");
        let digest = env::sha256(&encoded);
        if event.sequence == last_sequence {
            assert_eq!(
                env::storage_read(&digest_key),
                Some(digest),
                "conflicting lifecycle event replay"
            );
            return true;
        }
        assert_eq!(
            event.sequence,
            last_sequence
                .checked_add(1)
                .expect("event sequence overflow"),
            "stale or out-of-order lifecycle event"
        );

        let next_state = match event.state.as_str() {
            "CollateralLocked" => PositionState::CollateralLocked,
            "PremiumPaid" => PositionState::Open,
            "PremiumPayoutFailed" => PositionState::ReconciliationRequired,
            "PremiumRefunded" => PositionState::Expired,
            "PremiumRefundFailed" => PositionState::ReconciliationRequired,
            "ExercisePaymentReceived" | "PaymentPayoutPending" | "CollateralPayoutPending" => {
                PositionState::PendingSettlement
            }
            "ReconciliationRequired" => PositionState::ReconciliationRequired,
            "Settled" => PositionState::Settled,
            "Expired" => PositionState::Expired,
            "AwaitingCollateral" => PositionState::PendingCollateral,
            "ExpiryPayoutPending" => PositionState::PendingExpiry,
            other => env::panic_str(&format!("unsupported escrow lifecycle state: {other}")),
        };
        self.positions.get_mut(&position.id).unwrap().state = next_state;
        env::storage_write(&sequence_key, &event.sequence.to_le_bytes());
        env::storage_write(&digest_key, &digest);
        true
    }

    /// Configure the identity allowed to submit independently verified transfer receipts.
    /// Must be a dedicated service account, not an end-user controlled key.
    pub fn get_owner(&self) -> AccountId {
        self.owner.clone()
    }

    /// Propose a two-step ownership transfer. The pending account must accept it.
    pub fn propose_ownership_transfer(&mut self, new_owner: AccountId) {
        self.assert_owner();
        assert_ne!(new_owner, self.owner, "new owner must differ");
        assert_ne!(new_owner, env::current_account_id(), "invalid owner");
        let bytes = near_sdk::serde_json::to_vec(&new_owner).expect("serialize pending owner");
        env::storage_write(b"handel:options:pending-owner:v1", &bytes);
    }

    pub fn get_pending_owner(&self) -> Option<AccountId> {
        env::storage_read(b"handel:options:pending-owner:v1")
            .and_then(|bytes| near_sdk::serde_json::from_slice(&bytes).ok())
    }

    pub fn accept_ownership_transfer(&mut self) {
        let caller = env::predecessor_account_id();
        assert_eq!(
            self.get_pending_owner(),
            Some(caller.clone()),
            "pending owner only"
        );
        self.owner = caller;
        env::storage_remove(b"handel:options:pending-owner:v1");
    }

    pub fn set_trusted_reconciler(&mut self, reconciler: AccountId) {
        self.assert_owner();
        assert_ne!(reconciler, env::current_account_id(), "invalid reconciler");
        self.trusted_reconciler = Some(reconciler);
    }

    /// Reconcile only from the configured trusted service, with receipt fields bound to
    /// the operation's expected amount, asset, sender and receiver. The contract cannot
    /// itself prove the external verifier event, so the service remains a trust root.
    pub fn reconcile_operation(&mut self, evidence: ReconciliationEvidence) {
        assert_eq!(
            Some(env::predecessor_account_id()),
            self.trusted_reconciler,
            "trusted reconciler only"
        );
        assert!(
            !evidence.transfer_reference.trim().is_empty(),
            "receipt required"
        );
        let mut operation = self
            .operations
            .get(&evidence.operation_id)
            .cloned()
            .expect("unknown operation");
        assert_eq!(
            operation.state,
            OperationState::Pending,
            "operation already reconciled"
        );
        assert_eq!(
            operation.requested_asset_id, evidence.asset_id,
            "asset mismatch"
        );
        assert_eq!(
            operation.requested_amount, evidence.amount,
            "amount mismatch"
        );
        assert_eq!(
            operation.expected_sender, evidence.sender,
            "sender mismatch"
        );
        assert_eq!(
            operation.expected_receiver, evidence.receiver,
            "receiver mismatch"
        );
        let succeeded = evidence.outcome == EvidenceOutcome::Completed;
        operation.external_reference = Some(evidence.transfer_reference);
        operation.state = if succeeded {
            OperationState::Succeeded
        } else {
            OperationState::Failed
        };
        let position_id = operation.position_id;
        let kind = operation.kind;
        self.operations
            .insert(evidence.operation_id.clone(), operation);
        self.apply_reconciliation(position_id, kind, &evidence.operation_id, succeeded);
    }

    /// Retry a definitively failed collateral lock using a fresh operation ID.
    /// The reconciler must only report Failed when the external transfer is known not to have occurred.
    pub fn retry_collateral_lock(&mut self, position_id: u64, new_operation_id: String) {
        self.assert_not_paused();
        let position = self.position_owned_by_writer(position_id);
        assert_eq!(
            position.state,
            PositionState::ReconciliationRequired,
            "position does not require reconciliation"
        );
        let previous_id = position
            .collateral_operation_id
            .clone()
            .expect("collateral operation missing");
        let previous = self
            .operations
            .get(&previous_id)
            .expect("operation missing");
        assert_eq!(
            previous.kind,
            OperationKind::LockCollateral,
            "wrong operation kind"
        );
        assert_eq!(
            previous.state,
            OperationState::Failed,
            "collateral operation is not failed"
        );
        self.begin_operation(
            new_operation_id.clone(),
            position_id,
            OperationKind::LockCollateral,
            self.collateral_asset_id(&position),
            Self::required_collateral(&position),
            position.writer.clone(),
            env::current_account_id(),
        );
        let p = self.positions.get_mut(&position_id).unwrap();
        p.collateral_operation_id = Some(new_operation_id);
        p.state = PositionState::PendingCollateralReconciliation;
    }

    /// Starts premium payment only after collateral is reconciled successfully.
    /// The holder separately signs/sends the USDC NEP-413 transfer to the writer.
    pub fn begin_premium_payment(&mut self, position_id: u64, premium_operation_id: String) {
        self.assert_not_paused();
        let position = self.position(position_id);
        assert!(
            position.escrow_position_id.is_none(),
            "escrow position cannot use external premium rail"
        );
        assert_eq!(
            position.state,
            PositionState::CollateralLocked,
            "collateral not confirmed"
        );
        assert_eq!(
            env::predecessor_account_id(),
            position.holder,
            "holder only"
        );
        let amount = position.premium_amount_usdc;
        self.begin_operation(
            premium_operation_id.clone(),
            position_id,
            OperationKind::PayPremium,
            self.usdc_asset_id(),
            amount,
            position.holder.clone(),
            position.writer.clone(),
        );
        let p = self.positions.get_mut(&position_id).unwrap();
        p.state = PositionState::PendingPremium;
        p.premium_operation_id = Some(premium_operation_id);
    }

    /// Retry a definitively failed premium transfer. Collateral remains locked while pending.
    pub fn retry_premium_payment(&mut self, position_id: u64, new_operation_id: String) {
        self.assert_not_paused();
        let position = self.position(position_id);
        assert_eq!(
            env::predecessor_account_id(),
            position.holder,
            "holder only"
        );
        assert_eq!(
            position.state,
            PositionState::ReconciliationRequired,
            "position does not require reconciliation"
        );
        let collateral_id = position
            .collateral_operation_id
            .as_ref()
            .expect("collateral operation missing");
        let collateral = self
            .operations
            .get(collateral_id)
            .expect("collateral operation missing");
        assert_eq!(
            collateral.state,
            OperationState::Succeeded,
            "collateral is not confirmed"
        );
        let previous_id = position
            .premium_operation_id
            .as_ref()
            .expect("premium operation missing");
        let previous = self
            .operations
            .get(previous_id)
            .expect("premium operation missing");
        assert_eq!(
            previous.kind,
            OperationKind::PayPremium,
            "wrong operation kind"
        );
        assert_eq!(
            previous.state,
            OperationState::Failed,
            "premium operation is not failed"
        );
        self.begin_operation(
            new_operation_id.clone(),
            position_id,
            OperationKind::PayPremium,
            self.usdc_asset_id(),
            position.premium_amount_usdc,
            position.holder.clone(),
            position.writer.clone(),
        );
        let p = self.positions.get_mut(&position_id).unwrap();
        p.premium_operation_id = Some(new_operation_id);
        p.state = PositionState::PendingPremium;
    }

    /// Exercise a European option at/after maturity during the bounded settlement grace period.
    /// The 24-hour grace accommodates transaction submission; it does not permit early exercise.
    pub fn exercise(
        &mut self,
        position_id: u64,
        payment_operation_id: String,
        delivery_operation_id: String,
    ) {
        self.assert_not_paused();
        let position = self.position(position_id);
        assert!(
            position.escrow_position_id.is_none(),
            "escrow position cannot use external exercise rail"
        );
        assert_eq!(
            env::predecessor_account_id(),
            position.holder,
            "holder only"
        );
        assert_eq!(position.state, PositionState::Open, "position not open");
        let now = env::block_timestamp();
        let exercise_deadline_ns = position
            .expiry_ns
            .checked_add(EXERCISE_GRACE_NS)
            .expect("exercise deadline overflow");
        assert!(
            now >= position.expiry_ns,
            "European option cannot be exercised before maturity"
        );
        assert!(now <= exercise_deadline_ns, "exercise window closed");
        assert_ne!(
            payment_operation_id, delivery_operation_id,
            "operation ids must differ"
        );
        let (payment_asset, payment_amount, delivery_asset, delivery_amount) = match position.kind {
            OptionKind::Call => (
                self.usdc_asset_id(),
                position.strike_amount_usdc,
                position.asset_id.clone(),
                position.underlying_amount,
            ),
            OptionKind::Put => (
                position.asset_id.clone(),
                position.underlying_amount,
                self.usdc_asset_id(),
                position.strike_amount_usdc,
            ),
        };
        self.begin_operation(
            payment_operation_id.clone(),
            position_id,
            OperationKind::ExercisePayment,
            payment_asset,
            payment_amount,
            position.holder.clone(),
            position.writer.clone(),
        );
        self.begin_operation(
            delivery_operation_id.clone(),
            position_id,
            OperationKind::ExerciseDelivery,
            delivery_asset,
            delivery_amount,
            position.writer.clone(),
            position.holder.clone(),
        );
        let p = self.positions.get_mut(&position_id).unwrap();
        p.exercise_payment_operation_id = Some(payment_operation_id);
        p.exercise_delivery_operation_id = Some(delivery_operation_id);
        p.exercised_at_ns = Some(env::block_timestamp());
        p.state = PositionState::PendingSettlement;
    }

    /// Retry a failed holder-side exercise payment with a fresh operation ID.
    /// This remains available while paused because it reduces an existing settlement risk.
    pub fn retry_exercise_payment(&mut self, position_id: u64, new_operation_id: String) {
        let position = self.position(position_id);
        assert_eq!(
            env::predecessor_account_id(),
            position.holder,
            "holder only"
        );
        assert_eq!(
            position.state,
            PositionState::ReconciliationRequired,
            "position does not require reconciliation"
        );
        let previous_id = position
            .exercise_payment_operation_id
            .clone()
            .expect("payment operation missing");
        let previous = self
            .operations
            .get(&previous_id)
            .expect("operation missing");
        assert!(
            matches!(previous.kind, OperationKind::ExercisePayment),
            "wrong operation kind"
        );
        assert_eq!(
            previous.state,
            OperationState::Failed,
            "payment operation is not failed"
        );

        let (asset_id, amount) = match position.kind {
            OptionKind::Call => (self.usdc_asset_id(), position.strike_amount_usdc),
            OptionKind::Put => (position.asset_id.clone(), position.underlying_amount),
        };
        self.begin_operation(
            new_operation_id.clone(),
            position_id,
            OperationKind::ExercisePayment,
            asset_id,
            amount,
            position.holder.clone(),
            position.writer.clone(),
        );
        self.positions
            .get_mut(&position_id)
            .unwrap()
            .exercise_payment_operation_id = Some(new_operation_id);
        self.refresh_exercise_state(position_id);
    }

    /// Retry a failed writer-side exercise delivery with a fresh operation ID.
    /// This remains available while paused because it reduces an existing settlement risk.
    pub fn retry_exercise_delivery(&mut self, position_id: u64, new_operation_id: String) {
        let position = self.position(position_id);
        assert_eq!(
            env::predecessor_account_id(),
            position.writer,
            "writer only"
        );
        assert_eq!(
            position.state,
            PositionState::ReconciliationRequired,
            "position does not require reconciliation"
        );
        let previous_id = position
            .exercise_delivery_operation_id
            .clone()
            .expect("delivery operation missing");
        let previous = self
            .operations
            .get(&previous_id)
            .expect("operation missing");
        assert!(
            matches!(previous.kind, OperationKind::ExerciseDelivery),
            "wrong operation kind"
        );
        assert_eq!(
            previous.state,
            OperationState::Failed,
            "delivery operation is not failed"
        );

        let (asset_id, amount) = match position.kind {
            OptionKind::Call => (position.asset_id.clone(), position.underlying_amount),
            OptionKind::Put => (self.usdc_asset_id(), position.strike_amount_usdc),
        };
        self.begin_operation(
            new_operation_id.clone(),
            position_id,
            OperationKind::ExerciseDelivery,
            asset_id,
            amount,
            position.writer.clone(),
            position.holder.clone(),
        );
        self.positions
            .get_mut(&position_id)
            .unwrap()
            .exercise_delivery_operation_id = Some(new_operation_id);
        self.refresh_exercise_state(position_id);
    }

    pub fn request_expiry_release(&mut self, position_id: u64, operation_id: String) {
        self.assert_not_paused();
        let position = self.position_owned_by_writer(position_id);
        assert!(
            position.escrow_position_id.is_none(),
            "escrow position cannot use external expiry rail"
        );
        assert_eq!(position.state, PositionState::Open, "position not open");
        let exercise_deadline_ns = position
            .expiry_ns
            .checked_add(EXERCISE_GRACE_NS)
            .expect("exercise deadline overflow");
        assert!(
            env::block_timestamp() > exercise_deadline_ns,
            "exercise grace period still open"
        );
        self.begin_operation(
            operation_id.clone(),
            position_id,
            OperationKind::ExpiryRelease,
            self.collateral_asset_id(&position),
            Self::required_collateral(&position),
            env::current_account_id(),
            position.writer.clone(),
        );
        let p = self.positions.get_mut(&position_id).unwrap();
        p.expiry_release_operation_id = Some(operation_id);
        p.state = PositionState::PendingExpiry;
    }

    /// Offer cancellation is limited to the writer before any collateral lock starts.
    pub fn cancel_offer(&mut self, position_id: u64) {
        self.assert_not_paused();
        let position = self.position_owned_by_writer(position_id);
        assert_eq!(
            position.state,
            PositionState::PendingCollateral,
            "offer is no longer cancellable"
        );
        self.positions.get_mut(&position_id).unwrap().state = PositionState::Cancelled;
    }

    pub fn set_asset(&mut self, asset_id: String, decimals: u8, enabled: bool) {
        self.assert_owner();
        assert!(!asset_id.trim().is_empty(), "asset id required");
        assert!(decimals <= 38, "unsupported decimal precision");
        self.asset_registry.insert(
            asset_id.clone(),
            AssetMetadata {
                asset_id,
                decimals,
                enabled,
            },
        );
    }

    pub fn get_asset(&self, asset_id: String) -> Option<AssetMetadata> {
        self.asset_registry.get(&asset_id).cloned()
    }

    /// Select the USDC asset identifier used for premiums and strike settlement.
    /// The selected asset must already be enabled and use six decimal places.
    /// This allows isolated Testnet USDC registries without changing the default
    /// mainnet Intents USDC identifier or the contract's serialized root state.
    pub fn set_usdc_asset_id(&mut self, asset_id: String) {
        self.assert_owner();
        assert!(!asset_id.trim().is_empty(), "USDC asset id required");
        let metadata = self
            .asset_registry
            .get(&asset_id)
            .expect("USDC asset must be registered");
        assert!(metadata.enabled, "USDC asset must be enabled");
        assert_eq!(metadata.decimals, 6, "USDC asset must use 6 decimals");
        env::storage_write(USDC_ASSET_ID_STORAGE_KEY, asset_id.as_bytes());
    }

    pub fn get_usdc_asset_id(&self) -> String {
        self.usdc_asset_id()
    }

    pub fn get_last_accepted_escrow_sequence(&self, position_id: u64) -> u64 {
        let key = format!("handel:options:v2:escrow-seq:{position_id}").into_bytes();
        env::storage_read(&key)
            .and_then(|bytes| {
                if bytes.len() == 8 {
                    Some(u64::from_le_bytes(bytes.try_into().ok()?))
                } else {
                    None
                }
            })
            .unwrap_or(0)
    }

    pub fn get_position(&self, id: u64) -> Option<OptionPosition> {
        self.positions.get(&id).cloned()
    }

    pub fn get_operation(&self, operation_id: String) -> Option<Operation> {
        self.operations.get(&operation_id).cloned()
    }

    pub fn set_agent_policy(
        &mut self,
        agent_id: AccountId,
        allowed_assets: Vec<String>,
        max_underlying_amount: u128,
        max_premium_usdc: u128,
        max_collateral_usdc: u128,
        max_open_positions: u32,
        expires_at_ns: u64,
    ) {
        let principal = env::predecessor_account_id();
        assert_ne!(principal, agent_id, "agent must be distinct");
        if let Some(existing) = self.agent_policies.get(&agent_id) {
            assert_eq!(
                existing.principal, principal,
                "only the existing principal may update this agent policy"
            );
        }
        assert!(!allowed_assets.is_empty(), "allowed asset list required");
        assert!(
            max_underlying_amount > 0 && max_premium_usdc > 0 && max_collateral_usdc > 0,
            "limits must be positive"
        );
        assert!(max_open_positions > 0, "open position limit required");
        assert!(
            expires_at_ns > env::block_timestamp(),
            "expiry must be future"
        );
        assert!(
            allowed_assets.iter().all(|asset| self
                .asset_registry
                .get(asset)
                .is_some_and(|meta| meta.enabled)),
            "all allowed assets must be enabled"
        );
        self.agent_policies.insert(
            agent_id.clone(),
            AgentPolicy {
                principal,
                allowed_assets,
                max_underlying_amount,
                max_premium_usdc,
                max_collateral_usdc,
                max_open_positions,
                expires_at_ns,
                enabled: true,
            },
        );
        // Safe default: a newly granted agent must receive explicit delegated authority.
        self.store_agent_execution_mode(&agent_id, AgentExecutionMode::ManualApproval);
    }

    /// Precision-safe policy setter for JavaScript clients. NEAR's U64 JSON wrapper
    /// encodes the nanosecond timestamp as a decimal string, avoiding IEEE-754 loss.
    pub fn set_agent_policy_exact(
        &mut self,
        agent_id: AccountId,
        allowed_assets: Vec<String>,
        max_underlying_amount: u128,
        max_premium_usdc: u128,
        max_collateral_usdc: u128,
        max_open_positions: u32,
        expires_at_ns: U64,
    ) {
        self.set_agent_policy(
            agent_id,
            allowed_assets,
            max_underlying_amount,
            max_premium_usdc,
            max_collateral_usdc,
            max_open_positions,
            expires_at_ns.0,
        );
    }

    /// Change the authority mode for an existing agent. Only its principal can do this.
    pub fn set_agent_execution_mode(&mut self, agent_id: AccountId, mode: AgentExecutionMode) {
        let principal = env::predecessor_account_id();
        let policy = self
            .agent_policies
            .get(&agent_id)
            .cloned()
            .expect("agent policy missing");
        assert_eq!(policy.principal, principal, "principal only");
        self.store_agent_execution_mode(&agent_id, mode);
    }

    pub fn get_agent_execution_mode(&self, agent_id: AccountId) -> AgentExecutionMode {
        self.agent_execution_mode(&agent_id)
    }

    fn agent_execution_mode(&self, agent_id: &AccountId) -> AgentExecutionMode {
        let mut key = AGENT_EXECUTION_MODE_STORAGE_PREFIX.to_vec();
        key.extend_from_slice(agent_id.as_bytes());
        env::storage_read(&key)
            .map(|bytes| {
                assert_eq!(bytes.len(), 1, "invalid stored agent execution mode");
                AgentExecutionMode::from_storage_byte(bytes[0])
            })
            // Existing policies without a mode are treated as manual-approval only.
            .unwrap_or(AgentExecutionMode::ManualApproval)
    }

    fn store_agent_execution_mode(&self, agent_id: &AccountId, mode: AgentExecutionMode) {
        let mut key = AGENT_EXECUTION_MODE_STORAGE_PREFIX.to_vec();
        key.extend_from_slice(agent_id.as_bytes());
        env::storage_write(&key, &[mode.storage_byte()]);
    }

    pub fn revoke_agent(&mut self, agent_id: AccountId) {
        let principal = env::predecessor_account_id();
        assert_ne!(principal, agent_id, "agent cannot revoke another principal");
        if let Some(mut policy) = self.agent_policies.get(&agent_id).cloned() {
            assert_eq!(policy.principal, principal, "principal only");
            policy.enabled = false;
            self.agent_policies.insert(agent_id, policy);
        }
    }

    pub fn get_agent_policy(&self, agent_id: AccountId) -> Option<AgentPolicy> {
        self.agent_policies.get(&agent_id).cloned()
    }

    pub fn create_agent_proposal(
        &mut self,
        proposal_id: String,
        kind: OptionKind,
        holder: AccountId,
        asset_id: String,
        underlying_amount: u128,
        strike_amount_usdc: u128,
        expiry_ns: u64,
        premium_amount_usdc: u128,
        rationale_hash: String,
    ) {
        assert!(!proposal_id.trim().is_empty(), "proposal id required");
        assert!(!rationale_hash.trim().is_empty(), "rationale hash required");
        assert!(
            !self.proposals.contains_key(&proposal_id),
            "proposal id replay"
        );
        let agent_id = env::predecessor_account_id();
        let policy = self
            .agent_policies
            .get(&agent_id)
            .cloned()
            .expect("agent policy missing");
        assert_eq!(
            self.agent_execution_mode(&agent_id),
            AgentExecutionMode::ManualApproval,
            "agent is not in manual-approval mode"
        );
        assert!(
            policy.enabled && env::block_timestamp() < policy.expires_at_ns,
            "agent policy inactive"
        );
        assert!(
            policy.allowed_assets.contains(&asset_id),
            "asset not allowed"
        );
        assert!(
            underlying_amount <= policy.max_underlying_amount,
            "underlying cap"
        );
        assert!(
            premium_amount_usdc <= policy.max_premium_usdc,
            "premium cap"
        );
        if kind == OptionKind::Put {
            assert!(
                strike_amount_usdc <= policy.max_collateral_usdc,
                "USDC collateral cap"
            );
        }
        let principal = policy.principal.clone();
        let open_count = self
            .positions
            .values()
            .filter(|p| {
                p.writer == principal
                    && !matches!(
                        p.state,
                        PositionState::Settled | PositionState::Cancelled | PositionState::Expired
                    )
            })
            .count();
        assert!(
            open_count < policy.max_open_positions as usize,
            "open position limit"
        );
        assert!(expiry_ns <= policy.expires_at_ns, "expiry exceeds policy");
        let id = self.create_offer(
            kind,
            principal.clone(),
            holder,
            asset_id.clone(),
            underlying_amount,
            strike_amount_usdc,
            expiry_ns,
            premium_amount_usdc,
        );
        self.proposals.insert(
            proposal_id.clone(),
            AgentProposal {
                proposal_id,
                position_id: id,
                principal,
                agent_id,
                kind,
                asset_id,
                underlying_amount,
                strike_amount_usdc,
                expiry_ns,
                premium_amount_usdc,
                rationale_hash,
                state: ProposalState::PendingApproval,
            },
        );
    }

    pub fn approve_agent_proposal(&mut self, proposal_id: String) {
        let proposal = self
            .proposals
            .get(&proposal_id)
            .cloned()
            .expect("proposal missing");
        assert_eq!(
            proposal.principal,
            env::predecessor_account_id(),
            "principal approval required"
        );
        assert_eq!(
            proposal.state,
            ProposalState::PendingApproval,
            "proposal not pending"
        );
        let policy = self
            .agent_policies
            .get(&proposal.agent_id)
            .cloned()
            .expect("agent policy missing");
        assert_eq!(
            policy.principal, proposal.principal,
            "agent policy principal changed"
        );
        assert!(
            policy.enabled && env::block_timestamp() < policy.expires_at_ns,
            "agent policy inactive"
        );
        assert_eq!(
            self.agent_execution_mode(&proposal.agent_id),
            AgentExecutionMode::ManualApproval,
            "proposal is no longer in manual-approval mode"
        );
        assert!(
            policy.allowed_assets.contains(&proposal.asset_id),
            "proposal asset no longer allowed"
        );
        assert!(
            proposal.underlying_amount <= policy.max_underlying_amount,
            "proposal underlying cap changed"
        );
        assert!(
            proposal.premium_amount_usdc <= policy.max_premium_usdc,
            "proposal premium cap changed"
        );
        if proposal.kind == OptionKind::Put {
            assert!(
                proposal.strike_amount_usdc <= policy.max_collateral_usdc,
                "proposal collateral cap changed"
            );
        }
        assert!(
            proposal.expiry_ns > env::block_timestamp()
                && proposal.expiry_ns <= policy.expires_at_ns,
            "proposal expiry is no longer valid"
        );
        let position = self
            .positions
            .get(&proposal.position_id)
            .cloned()
            .expect("proposal position missing");
        assert_eq!(
            position.state,
            PositionState::PendingCollateral,
            "proposal position progressed"
        );
        assert_eq!(
            position.writer, proposal.principal,
            "proposal writer mismatch"
        );
        assert_eq!(position.kind, proposal.kind, "proposal kind mismatch");
        assert_eq!(
            position.asset_id, proposal.asset_id,
            "proposal asset mismatch"
        );
        assert_eq!(
            position.underlying_amount, proposal.underlying_amount,
            "proposal size mismatch"
        );
        assert_eq!(
            position.strike_amount_usdc, proposal.strike_amount_usdc,
            "proposal strike mismatch"
        );
        assert_eq!(
            position.expiry_ns, proposal.expiry_ns,
            "proposal expiry mismatch"
        );
        assert_eq!(
            position.premium_amount_usdc, proposal.premium_amount_usdc,
            "proposal premium mismatch"
        );
        let open_count = self
            .positions
            .values()
            .filter(|position| {
                position.writer == proposal.principal
                    && !matches!(
                        position.state,
                        PositionState::Settled | PositionState::Cancelled | PositionState::Expired
                    )
            })
            .count();
        assert!(
            open_count <= policy.max_open_positions as usize,
            "open position limit changed"
        );
        self.proposals.get_mut(&proposal_id).unwrap().state = ProposalState::Approved;
    }

    pub fn reject_agent_proposal(&mut self, proposal_id: String) {
        let proposal = self
            .proposals
            .get(&proposal_id)
            .cloned()
            .expect("proposal missing");
        assert_eq!(
            proposal.principal,
            env::predecessor_account_id(),
            "principal rejection required"
        );
        assert_eq!(
            proposal.state,
            ProposalState::PendingApproval,
            "proposal not pending"
        );
        let p = self.positions.get_mut(&proposal.position_id).unwrap();
        assert_eq!(
            p.state,
            PositionState::PendingCollateral,
            "offer already progressed"
        );
        p.state = PositionState::Cancelled;
        self.proposals.get_mut(&proposal_id).unwrap().state = ProposalState::Rejected;
    }

    pub fn get_agent_proposal(&self, proposal_id: String) -> Option<AgentProposal> {
        self.proposals.get(&proposal_id).cloned()
    }

    pub fn agent_create_call(
        &mut self,
        holder: AccountId,
        asset_id: String,
        underlying_amount: u128,
        strike_amount_usdc: u128,
        expiry_ns: u64,
        premium_amount_usdc: u128,
    ) -> u64 {
        self.assert_not_paused();
        let agent = env::predecessor_account_id();
        let policy = self
            .agent_policies
            .get(&agent)
            .cloned()
            .expect("agent not authorized");
        assert!(policy.enabled, "agent revoked");
        assert_eq!(
            self.agent_execution_mode(&agent),
            AgentExecutionMode::Delegated,
            "agent is not delegated"
        );
        assert!(
            env::block_timestamp() < policy.expires_at_ns,
            "agent policy expired"
        );
        assert!(
            policy.allowed_assets.iter().any(|a| a == &asset_id),
            "asset not allowed"
        );
        assert!(
            underlying_amount <= policy.max_underlying_amount,
            "size exceeds limit"
        );
        assert!(
            premium_amount_usdc <= policy.max_premium_usdc,
            "premium exceeds limit"
        );
        assert!(expiry_ns <= policy.expires_at_ns, "expiry exceeds policy");
        let open_count = self
            .positions
            .values()
            .filter(|p| {
                p.writer == policy.principal
                    && !matches!(
                        p.state,
                        PositionState::Settled | PositionState::Cancelled | PositionState::Expired
                    )
            })
            .count();
        assert!(
            open_count < policy.max_open_positions as usize,
            "open position limit"
        );
        let position_id = self.create_offer(
            OptionKind::Call, policy.principal.clone(), holder, asset_id.clone(),
            underlying_amount, strike_amount_usdc, expiry_ns, premium_amount_usdc,
        );
        self.record_agent_position(&agent, position_id, &policy.principal, &asset_id, OptionKind::Call, underlying_amount, strike_amount_usdc, premium_amount_usdc);
        position_id
    }

    /// Create a fully collateralized Put offer through the bounded delegated agent policy.
    /// The principal remains the writer and must still fund the position through the escrow.
    pub fn agent_create_put(
        &mut self,
        holder: AccountId,
        asset_id: String,
        underlying_amount: u128,
        strike_amount_usdc: u128,
        expiry_ns: u64,
        premium_amount_usdc: u128,
    ) -> u64 {
        self.assert_not_paused();
        let agent = env::predecessor_account_id();
        let policy = self
            .agent_policies
            .get(&agent)
            .cloned()
            .expect("agent not authorized");
        assert!(policy.enabled, "agent revoked");
        assert_eq!(
            self.agent_execution_mode(&agent),
            AgentExecutionMode::Delegated,
            "agent is not delegated"
        );
        assert!(
            env::block_timestamp() < policy.expires_at_ns,
            "agent policy expired"
        );
        assert!(
            policy.allowed_assets.iter().any(|asset| asset == &asset_id),
            "asset not allowed"
        );
        assert!(
            underlying_amount <= policy.max_underlying_amount,
            "size exceeds limit"
        );
        assert!(
            premium_amount_usdc <= policy.max_premium_usdc,
            "premium exceeds limit"
        );
        assert!(
            strike_amount_usdc <= policy.max_collateral_usdc,
            "USDC collateral exceeds limit"
        );
        assert!(expiry_ns <= policy.expires_at_ns, "expiry exceeds policy");
        let open_count = self
            .positions
            .values()
            .filter(|position| {
                position.writer == policy.principal
                    && !matches!(
                        position.state,
                        PositionState::Settled | PositionState::Cancelled | PositionState::Expired
                    )
            })
            .count();
        assert!(
            open_count < policy.max_open_positions as usize,
            "open position limit"
        );
        let position_id = self.create_offer(
            OptionKind::Put, policy.principal.clone(), holder, asset_id.clone(),
            underlying_amount, strike_amount_usdc, expiry_ns, premium_amount_usdc,
        );
        self.record_agent_position(&agent, position_id, &policy.principal, &asset_id, OptionKind::Put, underlying_amount, strike_amount_usdc, premium_amount_usdc);
        position_id
    }

    pub fn agent_begin_collateral_lock(&mut self, position_id: u64, operation_id: String) {
        self.assert_agent_position(position_id);
        self.begin_collateral_lock(position_id, operation_id);
    }

    pub fn agent_register_escrow_position(&mut self, position_id: u64) -> Promise {
        self.assert_agent_position(position_id);
        self.register_escrow_position(position_id)
    }

    pub fn set_paused(&mut self, paused: bool) {
        self.assert_owner();
        self.paused = paused;
    }

    fn create_offer(
        &mut self,
        kind: OptionKind,
        writer: AccountId,
        holder: AccountId,
        asset_id: String,
        underlying_amount: u128,
        strike_amount_usdc: u128,
        expiry_ns: u64,
        premium_amount_usdc: u128,
    ) -> u64 {
        self.assert_not_paused();
        assert!(underlying_amount > 0, "underlying amount must be positive");
        assert!(strike_amount_usdc > 0, "strike amount must be positive");
        assert!(premium_amount_usdc > 0, "premium must be positive");
        assert!(
            self.asset_registry
                .get(&asset_id)
                .is_some_and(|a| a.enabled),
            "asset is not enabled"
        );
        assert!(
            self.asset_registry
                .get(&self.usdc_asset_id())
                .is_some_and(|a| a.enabled),
            "usdc is not enabled"
        );
        assert!(
            expiry_ns > env::block_timestamp(),
            "expiry must be in the future"
        );
        let id = self.next_id;
        self.next_id = self.next_id.checked_add(1).expect("position id overflow");
        self.positions.insert(
            id,
            OptionPosition {
                id,
                kind,
                writer,
                holder,
                asset_id,
                underlying_amount,
                strike_amount_usdc,
                expiry_ns,
                premium_amount_usdc,
                state: PositionState::PendingCollateral,
                collateral_operation_id: None,
                premium_operation_id: None,
                exercise_payment_operation_id: None,
                exercise_delivery_operation_id: None,
                expiry_release_operation_id: None,
                exercised_at_ns: None,
                escrow_position_id: None,
                escrow_registration_pending: false,
                escrow_contract_id: None,
                escrow_collateral_token: None,
                escrow_payment_token: None,
            },
        );
        id
    }

    fn begin_operation(
        &mut self,
        operation_id: String,
        position_id: u64,
        kind: OperationKind,
        asset_id: String,
        amount: u128,
        expected_sender: AccountId,
        expected_receiver: AccountId,
    ) {
        assert!(!operation_id.trim().is_empty(), "operation id required");
        assert!(
            !self.used_operation_ids.contains_key(&operation_id),
            "operation id replay"
        );
        self.used_operation_ids.insert(operation_id.clone(), true);
        self.operations.insert(
            operation_id.clone(),
            Operation {
                id: operation_id,
                position_id,
                kind,
                state: OperationState::Pending,
                requested_asset_id: asset_id,
                requested_amount: amount,
                expected_sender,
                expected_receiver,
                external_reference: None,
            },
        );
    }

    fn apply_reconciliation(
        &mut self,
        position_id: u64,
        kind: OperationKind,
        operation_id: &str,
        succeeded: bool,
    ) {
        let payment_state = self
            .positions
            .get(&position_id)
            .and_then(|p| p.exercise_payment_operation_id.as_ref())
            .and_then(|id| self.operations.get(id))
            .map(|op| op.state);
        let delivery_state = self
            .positions
            .get(&position_id)
            .and_then(|p| p.exercise_delivery_operation_id.as_ref())
            .and_then(|id| self.operations.get(id))
            .map(|op| op.state);

        let position = self
            .positions
            .get_mut(&position_id)
            .expect("position missing");
        match kind {
            OperationKind::LockCollateral => {
                assert_eq!(
                    position.collateral_operation_id.as_deref(),
                    Some(operation_id),
                    "stale collateral operation"
                );
                assert_eq!(
                    position.state,
                    PositionState::PendingCollateralReconciliation
                );
                position.state = if succeeded {
                    PositionState::CollateralLocked
                } else {
                    PositionState::ReconciliationRequired
                };
            }
            OperationKind::PayPremium => {
                assert_eq!(
                    position.premium_operation_id.as_deref(),
                    Some(operation_id),
                    "stale premium operation"
                );
                assert_eq!(position.state, PositionState::PendingPremium);
                position.state = if succeeded {
                    PositionState::Open
                } else {
                    PositionState::ReconciliationRequired
                };
            }
            OperationKind::ExercisePayment | OperationKind::ExerciseDelivery => {
                assert!(
                    matches!(
                        position.state,
                        PositionState::PendingSettlement | PositionState::ReconciliationRequired
                    ),
                    "position is not awaiting exercise reconciliation"
                );
                let current_operation_id = match kind {
                    OperationKind::ExercisePayment => {
                        position.exercise_payment_operation_id.as_deref()
                    }
                    OperationKind::ExerciseDelivery => {
                        position.exercise_delivery_operation_id.as_deref()
                    }
                    _ => unreachable!(),
                };
                assert_eq!(
                    current_operation_id,
                    Some(operation_id),
                    "stale exercise operation"
                );

                position.state = match (payment_state, delivery_state) {
                    (Some(OperationState::Succeeded), Some(OperationState::Succeeded)) => {
                        PositionState::Settled
                    }
                    (Some(OperationState::Failed | OperationState::ReconciliationRequired), _)
                    | (_, Some(OperationState::Failed | OperationState::ReconciliationRequired)) => {
                        PositionState::ReconciliationRequired
                    }
                    _ => PositionState::PendingSettlement,
                };
            }
            OperationKind::ExpiryRelease => {
                assert_eq!(
                    position.expiry_release_operation_id.as_deref(),
                    Some(operation_id),
                    "stale expiry operation"
                );
                assert_eq!(position.state, PositionState::PendingExpiry);
                position.state = if succeeded {
                    PositionState::Expired
                } else {
                    PositionState::ReconciliationRequired
                };
            }
        }
    }

    fn refresh_exercise_state(&mut self, position_id: u64) {
        let payment_state = self
            .positions
            .get(&position_id)
            .and_then(|p| p.exercise_payment_operation_id.as_ref())
            .and_then(|id| self.operations.get(id))
            .map(|op| op.state);
        let delivery_state = self
            .positions
            .get(&position_id)
            .and_then(|p| p.exercise_delivery_operation_id.as_ref())
            .and_then(|id| self.operations.get(id))
            .map(|op| op.state);

        let state = match (payment_state, delivery_state) {
            (Some(OperationState::Succeeded), Some(OperationState::Succeeded)) => {
                PositionState::Settled
            }
            (Some(OperationState::Failed | OperationState::ReconciliationRequired), _)
            | (_, Some(OperationState::Failed | OperationState::ReconciliationRequired)) => {
                PositionState::ReconciliationRequired
            }
            _ => PositionState::PendingSettlement,
        };
        self.positions
            .get_mut(&position_id)
            .expect("position missing")
            .state = state;
    }

    fn position(&self, position_id: u64) -> OptionPosition {
        self.positions
            .get(&position_id)
            .cloned()
            .expect("position not found")
    }

    fn position_owned_by_writer(&self, position_id: u64) -> OptionPosition {
        let position = self.position(position_id);
        assert_eq!(position.writer, env::predecessor_account_id(), "writer only");
        position
    }

    fn agent_position_storage_key(position_id: u64) -> Vec<u8> {
        let mut key = AGENT_POSITION_STORAGE_PREFIX.to_vec();
        key.extend_from_slice(&position_id.to_le_bytes());
        key
    }

    fn assert_agent_policy_active(&self, agent: &AccountId) -> AgentPolicy {
        let policy = self.agent_policies.get(agent).cloned().expect("agent not authorized");
        assert!(policy.enabled, "agent revoked");
        assert_eq!(self.agent_execution_mode(agent), AgentExecutionMode::Delegated, "agent is not delegated");
        assert!(env::block_timestamp() < policy.expires_at_ns, "agent policy expired");
        policy
    }

    fn record_agent_position(&mut self, agent: &AccountId, position_id: u64, principal: &AccountId, asset_id: &str, kind: OptionKind, underlying: u128, strike: u128, premium: u128) {
        env::storage_write(&Self::agent_position_storage_key(position_id), agent.as_bytes());
        env::log_str(&format!("EVENT_JSON:{}", near_sdk::serde_json::json!({
            "standard":"nep297","version":"1.0.0","event":"agent_trade_created",
            "data":[{"agent":agent,"principal":principal,"position_id":position_id.to_string(),"kind":format!("{:?}",kind),"asset_id":asset_id,"underlying_amount":underlying.to_string(),"strike_amount_usdc":strike.to_string(),"premium_amount_usdc":premium.to_string()}]
        })));
    }

    fn assert_agent_position(&self, position_id: u64) -> OptionPosition {
        let position = self.position(position_id);
        let agent = env::predecessor_account_id();
        let attributed = env::storage_read(&Self::agent_position_storage_key(position_id)).expect("position is not attributed to an agent");
        assert_eq!(attributed.as_slice(), agent.as_bytes(), "agent does not own this delegated position");
        let policy = self.assert_agent_policy_active(&agent);
        assert_eq!(position.writer, policy.principal, "agent principal mismatch");
        assert!(policy.allowed_assets.iter().any(|a| a == &position.asset_id), "asset no longer allowed");
        assert!(position.underlying_amount <= policy.max_underlying_amount, "size exceeds current limit");
        assert!(position.premium_amount_usdc <= policy.max_premium_usdc, "premium exceeds current limit");
        if position.kind == OptionKind::Put { assert!(position.strike_amount_usdc <= policy.max_collateral_usdc, "USDC collateral exceeds current limit"); }
        let open_count = self.positions.values().filter(|p| p.writer == policy.principal && !matches!(p.state, PositionState::Settled | PositionState::Cancelled | PositionState::Expired)).count();
        assert!(open_count <= policy.max_open_positions as usize, "open position limit");
        position
    }

    fn position_owned_by_writer_or_active_agent(&self, position_id: u64) -> OptionPosition {
        let position = self.position(position_id);
        let caller = env::predecessor_account_id();
        if caller == position.writer { return position; }
        self.assert_agent_position(position_id)
    }

    fn required_collateral(position: &OptionPosition) -> u128 {
        match position.kind {
            OptionKind::Call => position.underlying_amount,
            OptionKind::Put => position.strike_amount_usdc,
        }
    }

    fn collateral_asset_id(&self, position: &OptionPosition) -> String {
        match position.kind {
            OptionKind::Call => position.asset_id.clone(),
            OptionKind::Put => self.usdc_asset_id(),
        }
    }

    fn exercise_payment_asset_id(&self, position: &OptionPosition) -> String {
        match position.kind {
            OptionKind::Call => self.usdc_asset_id(),
            OptionKind::Put => position.asset_id.clone(),
        }
    }

    fn exercise_payment_amount(position: &OptionPosition) -> u128 {
        match position.kind {
            OptionKind::Call => position.strike_amount_usdc,
            OptionKind::Put => position.underlying_amount,
        }
    }

    fn usdc_asset_id(&self) -> String {
        env::storage_read(USDC_ASSET_ID_STORAGE_KEY)
            .and_then(|bytes| String::from_utf8(bytes).ok())
            .unwrap_or_else(|| {
                "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1"
                    .to_string()
            })
    }

    fn assert_not_paused(&self) {
        assert!(!self.paused, "contract paused");
    }

    fn assert_owner(&self) {
        assert_eq!(env::predecessor_account_id(), self.owner, "owner only");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    fn account(value: &str) -> AccountId {
        value.parse().unwrap()
    }

    fn context(predecessor: &str) {
        context_at(predecessor, 10);
    }

    fn context_at(predecessor: &str, timestamp_ns: u64) {
        let mut builder = VMContextBuilder::new();
        builder
            .current_account_id(account("handel.testnet"))
            .predecessor_account_id(account(predecessor))
            .block_timestamp(timestamp_ns);
        testing_env!(builder.build());
    }

    fn contract() -> OptionsContract {
        context("owner.testnet");
        let mut c = OptionsContract::new();
        c.set_asset("nep141:stock.testnet".into(), 18, true);
        c.set_asset(OptionsContract::usdc_asset_id_for_test(), 6, true);
        c
    }

    #[test]
    fn initializer_sets_deployer_as_owner_and_enforces_ownership_transfer() {
        let mut c = contract();
        assert_eq!(c.get_owner(), account("owner.testnet"));

        context("attacker.testnet");
        let denied = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| c.set_paused(true)));
        assert!(denied.is_err());

        context("owner.testnet");
        c.set_paused(true);
        assert!(c.paused);
        c.propose_ownership_transfer(account("new-owner.testnet"));
        assert_eq!(c.get_owner(), account("owner.testnet"));
        assert_eq!(c.get_pending_owner(), Some(account("new-owner.testnet")));

        context("owner.testnet");
        let old_owner_still_authorized =
            std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| c.set_paused(false)));
        assert!(old_owner_still_authorized.is_ok());

        context("attacker.testnet");
        let wrong_accept = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            c.accept_ownership_transfer()
        }));
        assert!(wrong_accept.is_err());

        context("new-owner.testnet");
        c.accept_ownership_transfer();
        assert_eq!(c.get_owner(), account("new-owner.testnet"));
        assert_eq!(c.get_pending_owner(), None);
        context("owner.testnet");
        let old_owner_denied =
            std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| c.set_paused(false)));
        assert!(old_owner_denied.is_err());
        context("new-owner.testnet");
        c.set_paused(false);
        assert!(!c.paused);
    }

    fn create_call(c: &mut OptionsContract) -> u64 {
        context("writer.testnet");
        c.create_call(
            account("holder.testnet"),
            "nep141:stock.testnet".to_string(),
            42,
            1_500,
            20,
            75,
        )
    }

    fn evidence(
        operation_id: &str,
        asset_id: String,
        amount: u128,
        sender: &str,
        receiver: &str,
        outcome: EvidenceOutcome,
    ) -> ReconciliationEvidence {
        ReconciliationEvidence {
            operation_id: operation_id.to_string(),
            transfer_reference: format!("test-receipt-{operation_id}"),
            asset_id,
            amount,
            sender: account(sender),
            receiver: account(receiver),
            outcome,
        }
    }

    fn authorize_reconciler(c: &mut OptionsContract) {
        context("owner.testnet");
        c.set_trusted_reconciler(account("reconciler.testnet"));
    }

    fn lock_call(c: &mut OptionsContract, id: u64) -> String {
        context("writer.testnet");
        let op = format!("lock-{id}");
        c.begin_collateral_lock(id, op.clone());
        op
    }

    fn reconcile_call(c: &mut OptionsContract, op: &str) {
        context("reconciler.testnet");
        c.reconcile_operation(evidence(
            op,
            "nep141:stock.testnet".to_string(),
            42,
            "writer.testnet",
            "handel.testnet",
            EvidenceOutcome::Completed,
        ));
    }

    #[test]
    fn call_collateral_is_full_underlying_and_lifecycle_requires_both_receipts() {
        let mut c = contract();
        let id = create_call(&mut c);
        assert_eq!(
            c.get_position(id).unwrap().state,
            PositionState::PendingCollateral
        );
        let lock_id = lock_call(&mut c, id);
        let op = c.get_operation(lock_id.clone()).unwrap();
        assert_eq!(op.requested_amount, 42);
        assert_eq!(op.requested_asset_id, "nep141:stock.testnet");
        assert_eq!(
            c.get_position(id).unwrap().state,
            PositionState::PendingCollateralReconciliation
        );
        authorize_reconciler(&mut c);
        reconcile_call(&mut c, &lock_id);
        assert_eq!(
            c.get_position(id).unwrap().state,
            PositionState::CollateralLocked
        );
        context("holder.testnet");
        c.begin_premium_payment(id, "premium-1".to_string());
        assert_eq!(
            c.get_operation("premium-1".to_string())
                .unwrap()
                .requested_amount,
            75
        );
        assert_eq!(
            c.get_position(id).unwrap().state,
            PositionState::PendingPremium
        );
        context("reconciler.testnet");
        c.reconcile_operation(evidence(
            "premium-1",
            OptionsContract::usdc_asset_id_for_test(),
            75,
            "holder.testnet",
            "writer.testnet",
            EvidenceOutcome::Completed,
        ));
        assert_eq!(c.get_position(id).unwrap().state, PositionState::Open);
    }

    #[test]
    fn put_requires_exact_strike_amount_in_usdc() {
        let mut c = contract();
        context("writer.testnet");
        let id = c.create_put(
            account("holder.testnet"),
            "nep141:stock.testnet".to_string(),
            3,
            9_876,
            20,
            50,
        );
        let op = lock_call(&mut c, id);
        let requested = c.get_operation(op).unwrap();
        assert_eq!(requested.requested_amount, 9_876);
        assert_eq!(
            requested.requested_asset_id,
            OptionsContract::usdc_asset_id_for_test()
        );
    }

    #[test]
    fn failed_collateral_does_not_advance_to_locked() {
        let mut c = contract();
        let id = create_call(&mut c);
        let op = lock_call(&mut c, id);
        authorize_reconciler(&mut c);
        context("reconciler.testnet");
        c.reconcile_operation(evidence(
            &op,
            "nep141:stock.testnet".to_string(),
            42,
            "writer.testnet",
            "handel.testnet",
            EvidenceOutcome::Failed,
        ));
        assert_eq!(
            c.get_position(id).unwrap().state,
            PositionState::ReconciliationRequired
        );
        assert_eq!(c.get_operation(op).unwrap().state, OperationState::Failed);
    }

    #[test]
    #[should_panic(expected = "trusted reconciler only")]
    fn untrusted_caller_cannot_reconcile_success() {
        let mut c = contract();
        let id = create_call(&mut c);
        let op = lock_call(&mut c, id);
        authorize_reconciler(&mut c);
        context("attacker.testnet");
        c.reconcile_operation(evidence(
            &op,
            "nep141:stock.testnet".to_string(),
            42,
            "writer.testnet",
            "handel.testnet",
            EvidenceOutcome::Completed,
        ));
    }

    #[test]
    fn evidence_with_wrong_amount_or_asset_is_rejected() {
        let mut c = contract();
        let id = create_call(&mut c);
        let op = lock_call(&mut c, id);
        authorize_reconciler(&mut c);
        context("reconciler.testnet");
        let wrong_amount = evidence(
            &op,
            "nep141:stock.testnet".to_string(),
            41,
            "writer.testnet",
            "handel.testnet",
            EvidenceOutcome::Completed,
        );
        assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(
            || c.reconcile_operation(wrong_amount)
        ))
        .is_err());
    }

    #[test]
    fn exercise_is_holder_only_and_reconciles_both_legs_in_either_order() {
        let mut c = contract();
        let id = create_call(&mut c);
        authorize_reconciler(&mut c);
        let lock = lock_call(&mut c, id);
        reconcile_call(&mut c, &lock);
        context("holder.testnet");
        c.begin_premium_payment(id, "premium-exercise".to_string());
        context("reconciler.testnet");
        c.reconcile_operation(evidence(
            "premium-exercise",
            OptionsContract::usdc_asset_id_for_test(),
            75,
            "holder.testnet",
            "writer.testnet",
            EvidenceOutcome::Completed,
        ));
        context_at("attacker.testnet", 20);
        let bad = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            c.exercise(id, "pay-x".into(), "deliver-x".into());
        }));
        assert!(bad.is_err());
        context_at("holder.testnet", 20);
        c.exercise(id, "pay-x".into(), "deliver-x".into());
        let p = c.get_position(id).unwrap();
        assert_eq!(p.state, PositionState::PendingSettlement);
        assert_eq!(
            c.get_operation("pay-x".into()).unwrap().requested_amount,
            1_500
        );
        assert_eq!(
            c.get_operation("deliver-x".into())
                .unwrap()
                .requested_amount,
            42
        );
        assert_eq!(
            c.get_operation("pay-x".into()).unwrap().requested_asset_id,
            OptionsContract::usdc_asset_id_for_test()
        );
        let delivery = evidence(
            "deliver-x",
            "nep141:stock.testnet".into(),
            42,
            "writer.testnet",
            "holder.testnet",
            EvidenceOutcome::Completed,
        );
        context("reconciler.testnet");
        c.reconcile_operation(delivery);
        assert_eq!(
            c.get_position(id).unwrap().state,
            PositionState::PendingSettlement
        );
        c.reconcile_operation(evidence(
            "pay-x",
            OptionsContract::usdc_asset_id_for_test(),
            1_500,
            "holder.testnet",
            "writer.testnet",
            EvidenceOutcome::Completed,
        ));
        assert_eq!(c.get_position(id).unwrap().state, PositionState::Settled);
    }

    #[test]
    fn exercise_payment_failure_keeps_position_in_reconciliation_required() {
        let mut c = contract();
        let id = create_call(&mut c);
        authorize_reconciler(&mut c);
        let lock = lock_call(&mut c, id);
        reconcile_call(&mut c, &lock);
        context("holder.testnet");
        c.begin_premium_payment(id, "premium-f".into());
        context("reconciler.testnet");
        c.reconcile_operation(evidence(
            "premium-f",
            OptionsContract::usdc_asset_id_for_test(),
            75,
            "holder.testnet",
            "writer.testnet",
            EvidenceOutcome::Completed,
        ));
        context_at("holder.testnet", 20);
        c.exercise(id, "pay-f".into(), "deliver-f".into());
        context("reconciler.testnet");
        c.reconcile_operation(evidence(
            "pay-f",
            OptionsContract::usdc_asset_id_for_test(),
            1_500,
            "holder.testnet",
            "writer.testnet",
            EvidenceOutcome::Failed,
        ));
        assert_eq!(
            c.get_position(id).unwrap().state,
            PositionState::ReconciliationRequired
        );

        context("holder.testnet");
        c.retry_exercise_payment(id, "pay-f-retry".into());
        assert_eq!(
            c.get_position(id).unwrap().state,
            PositionState::PendingSettlement
        );
        context("reconciler.testnet");
        c.reconcile_operation(evidence(
            "pay-f-retry",
            OptionsContract::usdc_asset_id_for_test(),
            1_500,
            "holder.testnet",
            "writer.testnet",
            EvidenceOutcome::Completed,
        ));
        c.reconcile_operation(evidence(
            "deliver-f",
            "nep141:stock.testnet".into(),
            42,
            "writer.testnet",
            "holder.testnet",
            EvidenceOutcome::Completed,
        ));
        assert_eq!(c.get_position(id).unwrap().state, PositionState::Settled);
    }

    #[test]
    fn failed_collateral_lock_can_be_retried_only_by_writer_with_fresh_id() {
        let mut c = contract();
        let id = create_call(&mut c);
        authorize_reconciler(&mut c);
        let first = lock_call(&mut c, id);
        context("reconciler.testnet");
        c.reconcile_operation(evidence(
            &first,
            "nep141:stock.testnet".into(),
            42,
            "writer.testnet",
            "handel.testnet",
            EvidenceOutcome::Failed,
        ));
        assert_eq!(
            c.get_position(id).unwrap().state,
            PositionState::ReconciliationRequired
        );
        context("owner.testnet");
        c.set_paused(true);
        context("writer.testnet");
        assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(
            || c.retry_collateral_lock(id, "lock-retry".into())
        ))
        .is_err());
        context("owner.testnet");
        c.set_paused(false);
        context("attacker.testnet");
        assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(
            || c.retry_collateral_lock(id, "lock-retry".into())
        ))
        .is_err());
        context("writer.testnet");
        c.retry_collateral_lock(id, "lock-retry".into());
        assert_eq!(
            c.get_position(id).unwrap().state,
            PositionState::PendingCollateralReconciliation
        );
        assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(
            || c.retry_collateral_lock(id, "lock-retry".into())
        ))
        .is_err());
        context("reconciler.testnet");
        c.reconcile_operation(evidence(
            "lock-retry",
            "nep141:stock.testnet".into(),
            42,
            "writer.testnet",
            "handel.testnet",
            EvidenceOutcome::Completed,
        ));
        assert_eq!(
            c.get_position(id).unwrap().state,
            PositionState::CollateralLocked
        );
    }

    #[test]
    fn failed_premium_can_be_retried_by_holder_after_collateral_is_confirmed() {
        let mut c = contract();
        let id = create_call(&mut c);
        authorize_reconciler(&mut c);
        let lock = lock_call(&mut c, id);
        reconcile_call(&mut c, &lock);
        context("holder.testnet");
        c.begin_premium_payment(id, "premium-failed".into());
        context("reconciler.testnet");
        c.reconcile_operation(evidence(
            "premium-failed",
            OptionsContract::usdc_asset_id_for_test(),
            75,
            "holder.testnet",
            "writer.testnet",
            EvidenceOutcome::Failed,
        ));
        assert_eq!(
            c.get_position(id).unwrap().state,
            PositionState::ReconciliationRequired
        );
        context("owner.testnet");
        c.set_paused(true);
        context("holder.testnet");
        assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(
            || c.retry_premium_payment(id, "premium-retry".into())
        ))
        .is_err());
        context("owner.testnet");
        c.set_paused(false);
        context("attacker.testnet");
        assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(
            || c.retry_premium_payment(id, "premium-retry".into())
        ))
        .is_err());
        context("holder.testnet");
        c.retry_premium_payment(id, "premium-retry".into());
        assert_eq!(
            c.get_position(id).unwrap().state,
            PositionState::PendingPremium
        );
        context("reconciler.testnet");
        c.reconcile_operation(evidence(
            "premium-retry",
            OptionsContract::usdc_asset_id_for_test(),
            75,
            "holder.testnet",
            "writer.testnet",
            EvidenceOutcome::Completed,
        ));
        assert_eq!(c.get_position(id).unwrap().state, PositionState::Open);
    }

    #[test]
    fn agent_put_proposal_respects_usdc_collateral_policy_cap() {
        let mut c = contract();
        context("owner.testnet");
        c.set_agent_policy(
            account("agent.testnet"),
            vec!["nep141:stock.testnet".into()],
            50,
            100,
            5_000,
            2,
            100,
        );
        context("agent.testnet");
        let denied = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            c.create_agent_proposal(
                "put-over-cap".into(),
                OptionKind::Put,
                account("holder.testnet"),
                "nep141:stock.testnet".into(),
                1,
                5_001,
                90,
                10,
                "sha256:put".into(),
            )
        }));
        assert!(denied.is_err());
    }

    #[test]
    fn agent_policy_limits_principal_and_revoke_are_enforced() {
        let mut c = contract();
        context("writer.testnet");
        c.set_agent_policy(
            account("agent.testnet"),
            vec!["nep141:stock.testnet".into()],
            50,
            100,
            2_000,
            1,
            100,
        );
        c.set_agent_execution_mode(account("agent.testnet"), AgentExecutionMode::Delegated);
        context("agent.testnet");
        let id = c.agent_create_call(
            account("holder.testnet"),
            "nep141:stock.testnet".into(),
            42,
            1_500,
            90,
            75,
        );
        assert_eq!(
            c.get_position(id).unwrap().writer,
            account("writer.testnet")
        );
        let limited = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            c.agent_create_call(
                account("holder.testnet"),
                "nep141:stock.testnet".into(),
                42,
                1_500,
                90,
                75,
            );
        }));
        assert!(limited.is_err());
        context("writer.testnet");
        c.revoke_agent(account("agent.testnet"));
        context("agent.testnet");
        let revoked = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            c.agent_create_call(
                account("holder.testnet"),
                "nep141:stock.testnet".into(),
                1,
                1,
                90,
                1,
            );
        }));
        assert!(revoked.is_err());
    }

    #[test]
    fn caller_cannot_revoke_another_principals_agent() {
        let mut c = contract();
        context("writer.testnet");
        c.set_agent_policy(
            account("agent.testnet"),
            vec!["nep141:stock.testnet".into()],
            50,
            100,
            2_000,
            1,
            100,
        );
        context("attacker.testnet");
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            c.revoke_agent(account("agent.testnet"))
        }));
        assert!(result.is_err());
    }

    #[test]
    fn european_exercise_is_blocked_before_maturity_and_after_grace() {
        let mut c = contract();
        let id = create_call(&mut c);
        authorize_reconciler(&mut c);
        let lock = lock_call(&mut c, id);
        reconcile_call(&mut c, &lock);
        context("holder.testnet");
        c.begin_premium_payment(id, "premium-exp".into());
        context("reconciler.testnet");
        c.reconcile_operation(evidence(
            "premium-exp",
            OptionsContract::usdc_asset_id_for_test(),
            75,
            "holder.testnet",
            "writer.testnet",
            EvidenceOutcome::Completed,
        ));

        context_at("holder.testnet", 19);
        let early = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            c.exercise(id, "pay-early".into(), "deliver-early".into())
        }));
        assert!(early.is_err());

        context_at("holder.testnet", 20);
        let duplicate = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            c.exercise(id, "same".into(), "same".into())
        }));
        assert!(duplicate.is_err());
        c.exercise(id, "pay-at-maturity".into(), "deliver-at-maturity".into());
        assert_eq!(
            c.get_position(id).unwrap().state,
            PositionState::PendingSettlement
        );
    }

    #[test]
    fn writer_cannot_release_expired_collateral_during_exercise_grace() {
        let mut c = contract();
        let id = create_call(&mut c);
        authorize_reconciler(&mut c);
        let lock = lock_call(&mut c, id);
        reconcile_call(&mut c, &lock);
        context("holder.testnet");
        c.begin_premium_payment(id, "premium-release".into());
        context("reconciler.testnet");
        c.reconcile_operation(evidence(
            "premium-release",
            OptionsContract::usdc_asset_id_for_test(),
            75,
            "holder.testnet",
            "writer.testnet",
            EvidenceOutcome::Completed,
        ));

        let deadline = 20 + EXERCISE_GRACE_NS;
        context_at("writer.testnet", deadline);
        let too_early = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            c.request_expiry_release(id, "release-early".into())
        }));
        assert!(too_early.is_err());

        context_at("writer.testnet", deadline + 1);
        c.request_expiry_release(id, "release-after-grace".into());
        assert_eq!(
            c.get_position(id).unwrap().state,
            PositionState::PendingExpiry
        );
    }

    #[test]
    fn agent_proposal_requires_explicit_approval_before_collateral_and_rejection_cancels() {
        let mut c = contract();
        context("writer.testnet");
        c.set_agent_policy(
            account("agent.testnet"),
            vec!["nep141:stock.testnet".into()],
            50,
            100,
            2_000,
            2,
            80,
        );
        context("agent.testnet");
        c.create_agent_proposal(
            "proposal-1".into(),
            OptionKind::Call,
            account("holder.testnet"),
            "nep141:stock.testnet".into(),
            10,
            20,
            70,
            5,
            "sha256:abc".into(),
        );
        context("writer.testnet");
        let pending = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            c.begin_collateral_lock(0, "collateral-pending".into());
        }));
        assert!(pending.is_err());
        c.approve_agent_proposal("proposal-1".into());
        c.begin_collateral_lock(0, "collateral-approved".into());
        assert_eq!(
            c.get_position(0).unwrap().state,
            PositionState::PendingCollateralReconciliation
        );

        context("agent.testnet");
        c.create_agent_proposal(
            "proposal-2".into(),
            OptionKind::Put,
            account("holder.testnet"),
            "nep141:stock.testnet".into(),
            10,
            20,
            70,
            5,
            "sha256:def".into(),
        );
        context("writer.testnet");
        c.reject_agent_proposal("proposal-2".into());
        assert_eq!(c.get_position(1).unwrap().state, PositionState::Cancelled);
        assert_eq!(
            c.get_agent_proposal("proposal-2".into()).unwrap().state,
            ProposalState::Rejected
        );
    }

    #[test]
    fn agent_proposal_cannot_bypass_principal_approval_through_escrow_registration() {
        let mut c = contract();
        context("writer.testnet");
        c.set_agent_policy(
            account("agent.testnet"),
            vec!["nep141:stock.testnet".into()],
            50,
            100,
            2_000,
            2,
            80,
        );

        context("owner.testnet");
        c.set_escrow_contract(account("escrow.testnet"));
        c.set_escrow_token_account(
            "nep141:stock.testnet".into(),
            account("stock-token.testnet"),
        );
        c.set_escrow_token_account(
            OptionsContract::usdc_asset_id_for_test(),
            account("usdc-token.testnet"),
        );

        context("agent.testnet");
        c.create_agent_proposal(
            "escrow-approval-gate".into(),
            OptionKind::Call,
            account("holder.testnet"),
            "nep141:stock.testnet".into(),
            10,
            20,
            70,
            5,
            "sha256:approval-gate".into(),
        );

        context("writer.testnet");
        let bypass = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            c.register_escrow_position(0)
        }));
        assert!(bypass.is_err(), "unapproved proposal must not enter escrow");

        context("writer.testnet");
        c.approve_agent_proposal("escrow-approval-gate".into());
        context("writer.testnet");
        let approved = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            c.register_escrow_position(0)
        }));
        assert!(
            approved.is_ok(),
            "approved proposal may register with escrow"
        );
    }

    #[test]
    fn replay_operation_ids_are_rejected() {
        let mut c = contract();
        let id1 = create_call(&mut c);
        let _ = lock_call(&mut c, id1);
        let id2 = create_call(&mut c);
        context("writer.testnet");
        assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            c.begin_collateral_lock(id2, "lock-0".to_string())
        }))
        .is_err());
    }

    #[test]
    fn failed_exercise_leg_can_be_retried_after_other_leg_succeeds() {
        let mut c = contract();
        let id = create_call(&mut c);
        authorize_reconciler(&mut c);
        let lock = lock_call(&mut c, id);
        reconcile_call(&mut c, &lock);

        context("holder.testnet");
        c.begin_premium_payment(id, "premium-retry".into());
        context("reconciler.testnet");
        c.reconcile_operation(evidence(
            "premium-retry",
            OptionsContract::usdc_asset_id_for_test(),
            75,
            "holder.testnet",
            "writer.testnet",
            EvidenceOutcome::Completed,
        ));

        context_at("holder.testnet", 20);
        c.exercise(id, "payment-retry".into(), "delivery-failed".into());
        context("reconciler.testnet");
        c.reconcile_operation(evidence(
            "payment-retry",
            OptionsContract::usdc_asset_id_for_test(),
            1_500,
            "holder.testnet",
            "writer.testnet",
            EvidenceOutcome::Completed,
        ));
        c.reconcile_operation(evidence(
            "delivery-failed",
            "nep141:stock.testnet".into(),
            42,
            "writer.testnet",
            "holder.testnet",
            EvidenceOutcome::Failed,
        ));
        assert_eq!(
            c.get_position(id).unwrap().state,
            PositionState::ReconciliationRequired
        );

        context("writer.testnet");
        c.retry_exercise_delivery(id, "delivery-retry-2".into());
        assert_eq!(
            c.get_position(id).unwrap().state,
            PositionState::PendingSettlement
        );
        context("reconciler.testnet");
        c.reconcile_operation(evidence(
            "delivery-retry-2",
            "nep141:stock.testnet".into(),
            42,
            "writer.testnet",
            "holder.testnet",
            EvidenceOutcome::Completed,
        ));
        assert_eq!(c.get_position(id).unwrap().state, PositionState::Settled);
        assert_eq!(
            c.get_operation("delivery-failed".into()).unwrap().state,
            OperationState::Failed
        );
        assert_eq!(
            c.get_operation("delivery-retry-2".into()).unwrap().state,
            OperationState::Succeeded
        );
    }

    #[test]
    fn late_success_of_other_exercise_leg_does_not_panic_after_failure() {
        let mut c = contract();
        let id = create_call(&mut c);
        authorize_reconciler(&mut c);
        let lock = lock_call(&mut c, id);
        reconcile_call(&mut c, &lock);

        context("holder.testnet");
        c.begin_premium_payment(id, "premium-late".into());
        context("reconciler.testnet");
        c.reconcile_operation(evidence(
            "premium-late",
            OptionsContract::usdc_asset_id_for_test(),
            75,
            "holder.testnet",
            "writer.testnet",
            EvidenceOutcome::Completed,
        ));

        context_at("holder.testnet", 20);
        c.exercise(id, "payment-late".into(), "delivery-late".into());
        context("reconciler.testnet");
        c.reconcile_operation(evidence(
            "delivery-late",
            "nep141:stock.testnet".into(),
            42,
            "writer.testnet",
            "holder.testnet",
            EvidenceOutcome::Failed,
        ));
        assert_eq!(
            c.get_position(id).unwrap().state,
            PositionState::ReconciliationRequired
        );

        c.reconcile_operation(evidence(
            "payment-late",
            OptionsContract::usdc_asset_id_for_test(),
            1_500,
            "holder.testnet",
            "writer.testnet",
            EvidenceOutcome::Completed,
        ));
        assert_eq!(
            c.get_position(id).unwrap().state,
            PositionState::ReconciliationRequired
        );
        context("writer.testnet");
        c.retry_exercise_delivery(id, "delivery-late-retry".into());
        context("reconciler.testnet");
        c.reconcile_operation(evidence(
            "delivery-late-retry",
            "nep141:stock.testnet".into(),
            42,
            "writer.testnet",
            "holder.testnet",
            EvidenceOutcome::Completed,
        ));
        assert_eq!(c.get_position(id).unwrap().state, PositionState::Settled);
    }

    #[test]
    fn authenticated_escrow_expiry_event_marks_option_expired() {
        let mut c = contract();
        let id = create_call(&mut c);
        {
            let position = c.positions.get_mut(&id).unwrap();
            position.escrow_position_id = Some(7);
            position.escrow_contract_id = Some(account("escrow.testnet"));
            position.state = PositionState::CollateralLocked;
        }

        context("escrow.testnet");
        assert!(c.on_escrow_lifecycle_event(EscrowLifecycleEvent {
            source_position_id: id,
            escrow_position_id: 7,
            sequence: 1,
            state: "Expired".to_string(),
        }));
        assert_eq!(c.get_position(id).unwrap().state, PositionState::Expired);
    }

    #[test]
    fn failed_escrow_registration_callback_can_be_retried_idempotently() {
        let mut c = contract();
        context("owner.testnet");
        c.set_escrow_contract(account("escrow.testnet"));
        c.set_escrow_token_account(
            "nep141:stock.testnet".into(),
            account("stock-token.testnet"),
        );
        c.set_escrow_token_account(
            OptionsContract::usdc_asset_id_for_test(),
            account("usdc-token.testnet"),
        );
        let id = create_call(&mut c);

        context("writer.testnet");
        let _first_registration = c.register_escrow_position(id);
        assert!(c.get_position(id).unwrap().escrow_registration_pending);

        let mut callback = VMContextBuilder::new();
        callback
            .current_account_id(account("handel.testnet"))
            .predecessor_account_id(account("handel.testnet"))
            .block_timestamp(11);
        testing_env!(
            callback.build(),
            near_sdk::test_vm_config(),
            near_sdk::RuntimeFeesConfig::test(),
            std::collections::HashMap::default(),
            vec![near_sdk::PromiseResult::Failed],
        );
        assert!(!c.on_escrow_position_registered(id));
        let failed = c.get_position(id).unwrap();
        assert!(!failed.escrow_registration_pending);
        assert_eq!(failed.escrow_position_id, None);

        context("writer.testnet");
        let _retry = c.retry_escrow_registration(id);
        assert!(c.get_position(id).unwrap().escrow_registration_pending);

        let mut success = VMContextBuilder::new();
        success
            .current_account_id(account("handel.testnet"))
            .predecessor_account_id(account("handel.testnet"))
            .block_timestamp(12);
        testing_env!(
            success.build(),
            near_sdk::test_vm_config(),
            near_sdk::RuntimeFeesConfig::test(),
            std::collections::HashMap::default(),
            vec![near_sdk::PromiseResult::Successful(
                near_sdk::serde_json::to_vec(&7u64).unwrap(),
            )],
        );
        assert!(c.on_escrow_position_registered(id));
        let registered = c.get_position(id).unwrap();
        assert_eq!(registered.escrow_position_id, Some(7));
        assert!(!registered.escrow_registration_pending);
    }

    #[test]
    fn escrow_lifecycle_events_are_authenticated_ordered_and_idempotent() {
        let mut c = contract();
        let id = create_call(&mut c);
        {
            let position = c.positions.get_mut(&id).unwrap();
            position.escrow_position_id = Some(77);
            position.escrow_contract_id = Some(account("escrow.testnet"));
        }
        let event = EscrowLifecycleEvent {
            source_position_id: id,
            escrow_position_id: 77,
            sequence: 1,
            state: "CollateralLocked".into(),
        };
        context("attacker.testnet");
        assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            c.on_escrow_lifecycle_event(event.clone())
        }))
        .is_err());

        context("escrow.testnet");
        assert!(c.on_escrow_lifecycle_event(event.clone()));
        assert_eq!(
            c.get_position(id).unwrap().state,
            PositionState::CollateralLocked
        );
        assert!(c.on_escrow_lifecycle_event(event.clone()));

        let mut conflicting = event.clone();
        conflicting.state = "Settled".into();
        assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            c.on_escrow_lifecycle_event(conflicting)
        }))
        .is_err());

        let mut skipped = event;
        skipped.sequence = 3;
        skipped.state = "Settled".into();
        assert!(std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            c.on_escrow_lifecycle_event(skipped)
        }))
        .is_err());

        let settled = EscrowLifecycleEvent {
            source_position_id: id,
            escrow_position_id: 77,
            sequence: 2,
            state: "Settled".into(),
        };
        assert!(c.on_escrow_lifecycle_event(settled));
        assert_eq!(c.get_position(id).unwrap().state, PositionState::Settled);
    }

    #[test]
    fn owner_can_configure_six_decimal_testnet_usdc_without_changing_default_asset() {
        let mut c = contract();
        let testnet_usdc = "nep141:usdc.tidepool-sandbox.testnet".to_string();

        context("owner.testnet");
        c.set_asset(testnet_usdc.clone(), 6, true);
        c.set_usdc_asset_id(testnet_usdc.clone());
        assert_eq!(c.get_usdc_asset_id(), testnet_usdc);

        context("writer.testnet");
        let id = c.create_call(
            account("holder.testnet"),
            "nep141:stock.testnet".to_string(),
            1,
            1_000_000,
            100,
            10_000,
        );
        assert_eq!(c.get_position(id).unwrap().asset_id, "nep141:stock.testnet");
    }

    #[test]
    fn usdc_asset_configuration_rejects_unregistered_disabled_and_wrong_precision_assets() {
        let mut c = contract();
        context("owner.testnet");

        let missing = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            c.set_usdc_asset_id("nep141:missing.testnet".into())
        }));
        assert!(missing.is_err());

        c.set_asset("nep141:disabled.testnet".into(), 6, false);
        let disabled = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            c.set_usdc_asset_id("nep141:disabled.testnet".into())
        }));
        assert!(disabled.is_err());

        c.set_asset("nep141:wrong-precision.testnet".into(), 18, true);
        let wrong_precision = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            c.set_usdc_asset_id("nep141:wrong-precision.testnet".into())
        }));
        assert!(wrong_precision.is_err());
    }

    #[test]
    fn delegated_agent_can_create_put_only_within_usdc_collateral_cap() {
        let mut c = contract();
        context("writer.testnet");
        c.set_agent_policy(
            account("agent.testnet"),
            vec!["nep141:stock.testnet".into()],
            50,
            100,
            1_500,
            2,
            90,
        );
        c.set_agent_execution_mode(account("agent.testnet"), AgentExecutionMode::Delegated);
        context("agent.testnet");
        let id = c.agent_create_put(
            account("holder.testnet"),
            "nep141:stock.testnet".into(),
            5,
            1_400,
            80,
            75,
        );
        let position = c.get_position(id).unwrap();
        assert_eq!(position.kind, OptionKind::Put);
        assert_eq!(position.writer, account("writer.testnet"));
        let over_cap = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            c.agent_create_put(
                account("holder.testnet"),
                "nep141:stock.testnet".into(),
                5,
                1_501,
                80,
                75,
            )
        }));
        assert!(over_cap.is_err());
    }

    #[test]
    fn delegated_agent_put_is_blocked_after_revocation() {
        let mut c = contract();
        context("writer.testnet");
        c.set_agent_policy(
            account("agent.testnet"),
            vec!["nep141:stock.testnet".into()],
            50,
            100,
            1_500,
            2,
            90,
        );
        c.set_agent_execution_mode(account("agent.testnet"), AgentExecutionMode::Delegated);
        c.revoke_agent(account("agent.testnet"));
        context("agent.testnet");
        let denied = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            c.agent_create_put(
                account("holder.testnet"),
                "nep141:stock.testnet".into(),
                5,
                1_000,
                80,
                75,
            )
        }));
        assert!(denied.is_err());
    }

    #[test]
    fn revoked_or_expired_policy_cannot_approve_a_pending_proposal() {
        let mut c = contract();
        context("writer.testnet");
        c.set_agent_policy(
            account("agent.testnet"),
            vec!["nep141:stock.testnet".into()],
            50,
            100,
            1_500,
            2,
            90,
        );
        context("agent.testnet");
        c.create_agent_proposal(
            "pending-before-revoke".into(),
            OptionKind::Call,
            account("holder.testnet"),
            "nep141:stock.testnet".into(),
            5,
            1_000,
            80,
            75,
            "sha256:pending".into(),
        );
        context("writer.testnet");
        c.revoke_agent(account("agent.testnet"));
        let denied = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            c.approve_agent_proposal("pending-before-revoke".into())
        }));
        assert!(denied.is_err());
        assert_eq!(
            c.get_agent_proposal("pending-before-revoke".into())
                .unwrap()
                .state,
            ProposalState::PendingApproval
        );
    }

    #[test]
    fn manual_approval_revalidates_policy_caps_and_prevents_principal_takeover() {
        let mut c = contract();
        context("writer.testnet");
        c.set_agent_policy(
            account("agent.testnet"),
            vec!["nep141:stock.testnet".into()],
            50,
            100,
            1_500,
            2,
            90,
        );
        context("agent.testnet");
        c.create_agent_proposal(
            "proposal-policy-recheck".into(),
            OptionKind::Put,
            account("holder.testnet"),
            "nep141:stock.testnet".into(),
            10,
            1_000,
            80,
            75,
            "sha256:recheck".into(),
        );

        context("writer.testnet");
        c.set_agent_policy(
            account("agent.testnet"),
            vec!["nep141:stock.testnet".into()],
            5,
            100,
            1_500,
            2,
            90,
        );
        let reduced_cap = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            c.approve_agent_proposal("proposal-policy-recheck".into())
        }));
        assert!(reduced_cap.is_err());

        context("new-writer.testnet");
        let takeover = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            c.set_agent_policy(
                account("agent.testnet"),
                vec!["nep141:stock.testnet".into()],
                50,
                100,
                1_500,
                2,
                90,
            )
        }));
        assert!(
            takeover.is_err(),
            "a different principal cannot replace an existing policy"
        );
        context("writer.testnet");
        let changed_principal = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            c.approve_agent_proposal("proposal-policy-recheck".into())
        }));
        assert!(changed_principal.is_err());
    }

    #[test]
    fn education_and_advisory_modes_cannot_create_trade_proposals() {
        for mode in [AgentExecutionMode::Education, AgentExecutionMode::Advisory] {
            let mut c = contract();
            context("writer.testnet");
            c.set_agent_policy(
                account("agent.testnet"),
                vec!["nep141:stock.testnet".into()],
                50,
                100,
                1_500,
                2,
                90,
            );
            c.set_agent_execution_mode(account("agent.testnet"), mode);
            assert_eq!(c.get_agent_execution_mode(account("agent.testnet")), mode);
            context("agent.testnet");
            let denied = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                c.create_agent_proposal(
                    "education-mode-proposal".into(),
                    OptionKind::Call,
                    account("holder.testnet"),
                    "nep141:stock.testnet".into(),
                    5,
                    1_000,
                    80,
                    75,
                    "sha256:education".into(),
                )
            }));
            assert!(denied.is_err());
        }
    }

    #[test]
    fn agent_execution_mode_defaults_to_manual_and_requires_principal_delegation() {
        let mut c = contract();
        context("writer.testnet");
        c.set_agent_policy(
            account("agent.testnet"),
            vec!["nep141:stock.testnet".into()],
            50,
            100,
            1_500,
            2,
            90,
        );

        context("agent.testnet");
        let blocked = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            c.agent_create_call(
                account("holder.testnet"),
                "nep141:stock.testnet".into(),
                5,
                1_000,
                80,
                75,
            )
        }));
        assert!(
            blocked.is_err(),
            "default mode must not permit delegated execution"
        );

        context("attacker.testnet");
        let unauthorized = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            c.set_agent_execution_mode(account("agent.testnet"), AgentExecutionMode::Delegated)
        }));
        assert!(unauthorized.is_err(), "only the principal may delegate");

        context("writer.testnet");
        c.set_agent_execution_mode(account("agent.testnet"), AgentExecutionMode::Delegated);
        context("agent.testnet");
        let allowed = c.agent_create_call(
            account("holder.testnet"),
            "nep141:stock.testnet".into(),
            5,
            1_000,
            80,
            75,
        );
        assert_eq!(
            c.get_position(allowed).unwrap().writer,
            account("writer.testnet")
        );
    }

    #[test]
    fn delegated_agent_can_initiate_only_its_attributed_writer_collateral_and_revocation_is_immediate() {
        let mut c = contract();
        context("writer.testnet");
        c.set_agent_policy(account("agent.testnet"), vec!["nep141:stock.testnet".into()], 50, 100, 1_500, 2, 90);
        c.set_agent_execution_mode(account("agent.testnet"), AgentExecutionMode::Delegated);
        context("agent.testnet");
        let id = c.agent_create_call(account("holder.testnet"), "nep141:stock.testnet".into(), 5, 1_000, 80, 75);
        c.agent_begin_collateral_lock(id, "agent-collateral-1".into());
        assert_eq!(c.get_position(id).unwrap().state, PositionState::PendingCollateralReconciliation);
        assert_eq!(c.get_operation("agent-collateral-1".into()).unwrap().requested_amount, 5);
        context("writer.testnet");
        c.revoke_agent(account("agent.testnet"));
        context("agent.testnet");
        let denied = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| c.agent_register_escrow_position(id)));
        assert!(denied.is_err(), "revocation must block every delegated lifecycle method");
    }

    #[test]
    fn delegated_agent_cannot_initiate_another_agents_position() {
        let mut c = contract();
        context("writer.testnet");
        c.set_agent_policy(account("agent.testnet"), vec!["nep141:stock.testnet".into()], 50, 100, 1_500, 2, 90);
        c.set_agent_execution_mode(account("agent.testnet"), AgentExecutionMode::Delegated);
        context("agent.testnet");
        let id = c.agent_create_call(account("holder.testnet"), "nep141:stock.testnet".into(), 5, 1_000, 80, 75);
        context("attacker.testnet");
        let denied = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| c.begin_collateral_lock(id, "attacker-collateral".into())));
        assert!(denied.is_err());
    }

    impl OptionsContract {
        fn usdc_asset_id_for_test() -> String {
            "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1".to_string()
        }
    }
}
