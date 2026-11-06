use near_sdk::{env, near, AccountId, PanicOnDefault};
use std::collections::BTreeMap;

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, PartialEq, Eq)]
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
    Cancelled,
    ReconciliationRequired,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum OperationKind {
    LockCollateral,
    PayPremium,
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
#[derive(Clone)]
pub struct Operation {
    pub id: String,
    pub position_id: u64,
    pub kind: OperationKind,
    pub state: OperationState,
    pub requested_asset_id: String,
    pub requested_amount: u128,
    pub external_reference: Option<String>,
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
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct OptionsContract {
    next_id: u64,
    positions: BTreeMap<u64, OptionPosition>,
    operations: BTreeMap<String, Operation>,
    used_operation_ids: BTreeMap<String, bool>,
    paused: bool,
}

#[near]
impl OptionsContract {
    #[init]
    pub fn new() -> Self {
        Self {
            next_id: 0,
            positions: BTreeMap::new(),
            operations: BTreeMap::new(),
            used_operation_ids: BTreeMap::new(),
            paused: false,
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
            holder,
            asset_id,
            underlying_amount,
            strike_amount_usdc,
            expiry_ns,
            premium_amount_usdc,
        )
    }

    /// Starts a collateral operation after the writer has submitted their own NEP-413 transfer.
    /// Never accepts or stores a signature or signing key. Pending until explicit reconciliation.
    pub fn begin_collateral_lock(&mut self, position_id: u64, operation_id: String) {
        self.assert_not_paused();
        let position = self.position_owned_by_writer(position_id);
        assert_eq!(
            position.state,
            PositionState::PendingCollateral,
            "not awaiting collateral"
        );
        let amount = Self::required_collateral(&position);
        let asset_id = Self::collateral_asset_id(&position);
        self.begin_operation(
            operation_id.clone(),
            position_id,
            OperationKind::LockCollateral,
            asset_id,
            amount,
        );
        let position = self.positions.get_mut(&position_id).unwrap();
        position.state = PositionState::PendingCollateralReconciliation;
        position.collateral_operation_id = Some(operation_id);
    }

    /// Records verifier/indexer reconciliation for Path A. This permissionless hook is a
    /// prototype only. Production needs authenticated verifier evidence and access control.
    pub fn reconcile_operation(
        &mut self,
        operation_id: String,
        succeeded: bool,
        external_reference: String,
    ) {
        let mut operation = self
            .operations
            .get(&operation_id)
            .cloned()
            .expect("unknown operation");
        assert_eq!(
            operation.state,
            OperationState::Pending,
            "operation already reconciled"
        );
        assert!(
            !external_reference.is_empty(),
            "external reference required"
        );
        if let Some(expected) = operation.external_reference.as_deref() {
            assert_eq!(expected, external_reference, "external reference mismatch");
        }
        operation.external_reference = Some(external_reference);
        operation.state = if succeeded {
            OperationState::Succeeded
        } else {
            OperationState::Failed
        };
        let position_id = operation.position_id;
        let kind = operation.kind;
        self.operations.insert(operation_id, operation);
        self.apply_reconciliation(position_id, kind, succeeded);
    }

    /// Starts premium payment only after collateral is reconciled successfully.
    /// The holder separately signs/sends the USDC NEP-413 transfer to the writer.
    pub fn begin_premium_payment(&mut self, position_id: u64, premium_operation_id: String) {
        self.assert_not_paused();
        let position = self.position(position_id);
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
            Self::usdc_asset_id(),
            amount,
        );
        let p = self.positions.get_mut(&position_id).unwrap();
        p.state = PositionState::PendingPremium;
        p.premium_operation_id = Some(premium_operation_id);
    }

    pub fn get_position(&self, id: u64) -> Option<OptionPosition> {
        self.positions.get(&id).cloned()
    }

    pub fn get_operation(&self, operation_id: String) -> Option<Operation> {
        self.operations.get(&operation_id).cloned()
    }

    pub fn set_paused(&mut self, paused: bool) {
        self.assert_owner();
        self.paused = paused;
    }

    fn create_offer(
        &mut self,
        kind: OptionKind,
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
        assert!(!asset_id.is_empty(), "asset id required");
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
                writer: env::predecessor_account_id(),
                holder,
                asset_id,
                underlying_amount,
                strike_amount_usdc,
                expiry_ns,
                premium_amount_usdc,
                state: PositionState::PendingCollateral,
                collateral_operation_id: None,
                premium_operation_id: None,
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
                external_reference: None,
            },
        );
    }

    fn apply_reconciliation(&mut self, position_id: u64, kind: OperationKind, succeeded: bool) {
        let position = self
            .positions
            .get_mut(&position_id)
            .expect("position missing");
        match (kind, succeeded) {
            (OperationKind::LockCollateral, true) => {
                assert_eq!(
                    position.state,
                    PositionState::PendingCollateralReconciliation
                );
                position.state = PositionState::CollateralLocked;
            }
            (OperationKind::LockCollateral, false) => {
                assert_eq!(
                    position.state,
                    PositionState::PendingCollateralReconciliation
                );
                position.state = PositionState::ReconciliationRequired;
            }
            (OperationKind::PayPremium, true) => {
                assert_eq!(position.state, PositionState::PendingPremium);
                position.state = PositionState::Open;
            }
            (OperationKind::PayPremium, false) => {
                assert_eq!(position.state, PositionState::PendingPremium);
                position.state = PositionState::ReconciliationRequired;
            }
        }
    }

    fn position(&self, position_id: u64) -> OptionPosition {
        self.positions
            .get(&position_id)
            .cloned()
            .expect("position not found")
    }

    fn position_owned_by_writer(&self, position_id: u64) -> OptionPosition {
        let position = self.position(position_id);
        assert_eq!(
            position.writer,
            env::predecessor_account_id(),
            "writer only"
        );
        position
    }

    fn required_collateral(position: &OptionPosition) -> u128 {
        match position.kind {
            OptionKind::Call => position.underlying_amount,
            OptionKind::Put => position.strike_amount_usdc,
        }
    }

    fn collateral_asset_id(position: &OptionPosition) -> String {
        match position.kind {
            OptionKind::Call => position.asset_id.clone(),
            OptionKind::Put => Self::usdc_asset_id(),
        }
    }

    fn usdc_asset_id() -> String {
        "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1".to_string()
    }

    fn assert_not_paused(&self) {
        assert!(!self.paused, "contract paused");
    }

    fn assert_owner(&self) {
        assert_eq!(
            env::predecessor_account_id(),
            env::current_account_id(),
            "owner only"
        );
    }
}
