use near_sdk::{near, AccountId, PanicOnDefault};
use std::collections::BTreeMap;

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum OptionKind {
    Call,
    Put,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum PositionState {
    Created,
    PendingCollateral,
    Open,
    PendingSettlement,
    Settled,
    Cancelled,
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
    pub state: PositionState,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct OptionsContract {
    next_id: u64,
    positions: BTreeMap<u64, OptionPosition>,
}

#[near] 
impl OptionsContract {
    #[init]
    pub fn new() -> Self {
        Self { next_id: 0, positions: BTreeMap::new() }
    }

    /// Day 1 stub. No collateral is locked and no position becomes OPEN.
    pub fn create_call(
        &mut self, holder: AccountId, asset_id: String, underlying_amount: u128,
        strike_amount_usdc: u128, expiry_ns: u64,
    ) -> u64 {
        self.create_stub(OptionKind::Call, holder, asset_id, underlying_amount, strike_amount_usdc, expiry_ns)
    }

    /// Day 1 stub. No collateral is locked and no position becomes OPEN.
    pub fn create_put(
        &mut self, holder: AccountId, asset_id: String, underlying_amount: u128,
        strike_amount_usdc: u128, expiry_ns: u64,
    ) -> u64 {
        self.create_stub(OptionKind::Put, holder, asset_id, underlying_amount, strike_amount_usdc, expiry_ns)
    }

    pub fn get_position(&self, id: u64) -> Option<OptionPosition> {
        self.positions.get(&id).cloned()
    }

    fn create_stub(
        &mut self, kind: OptionKind, holder: AccountId, asset_id: String,
        underlying_amount: u128, strike_amount_usdc: u128, expiry_ns: u64,
    ) -> u64 {
        assert!(underlying_amount > 0, "underlying amount must be positive");
        assert!(strike_amount_usdc > 0, "strike amount must be positive");
        assert!(expiry_ns > near_sdk::env::block_timestamp(), "expiry must be in the future");
        let id = self.next_id;
        self.next_id = self.next_id.checked_add(1).expect("position id overflow");
        let position = OptionPosition {
            id, kind, writer: near_sdk::env::predecessor_account_id(), holder, asset_id,
            underlying_amount, strike_amount_usdc, expiry_ns, state: PositionState::Created,
        };
        self.positions.insert(id, position);
        id
    }
}
