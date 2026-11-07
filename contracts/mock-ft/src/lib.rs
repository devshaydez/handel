use near_sdk::{
    env, ext_contract, json_types::U128, near, AccountId, Gas, NearToken, PanicOnDefault,
    Promise, PromiseOrValue, PromiseResult,
};
use std::collections::BTreeMap;

const RECEIVER_GAS: Gas = Gas::from_tgas(20);
const CALLBACK_GAS: Gas = Gas::from_tgas(10);

#[ext_contract(ext_receiver)]
trait ExtReceiver {
    fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String)
        -> PromiseOrValue<U128>;
}

#[ext_contract(ext_self)]
trait ExtMockFt {
    fn resolve_transfer_call(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        amount: U128,
    ) -> U128;
}

/// Minimal NEP-141 test token. It intentionally exposes owner-controlled pause
/// and registration helpers so sandbox tests can force payout failures.
#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct MockFt {
    owner_id: AccountId,
    balances: BTreeMap<AccountId, u128>,
    total_supply: u128,
    paused: bool,
}

#[near]
impl MockFt {
    #[init]
    pub fn new(owner_id: AccountId) -> Self {
        Self {
            owner_id,
            balances: BTreeMap::new(),
            total_supply: 0,
            paused: false,
        }
    }

    pub fn register_account(&mut self, account_id: AccountId) {
        self.assert_owner();
        self.balances.entry(account_id).or_insert(0);
    }

    pub fn mint(&mut self, account_id: AccountId, amount: U128) {
        self.assert_owner();
        self.balances.entry(account_id.clone()).or_insert(0);
        let balance = self.balances.get(&account_id).copied().unwrap_or(0);
        self.balances.insert(account_id, balance.checked_add(amount.0).expect("balance overflow"));
        self.total_supply = self.total_supply.checked_add(amount.0).expect("supply overflow");
    }

    pub fn set_paused(&mut self, paused: bool) {
        self.assert_owner();
        self.paused = paused;
    }

    pub fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        U128(self.balances.get(&account_id).copied().unwrap_or(0))
    }

    pub fn ft_total_supply(&self) -> U128 {
        U128(self.total_supply)
    }

    pub fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, _memo: Option<String>) {
        self.assert_transferable();
        assert_eq!(env::attached_deposit(), NearToken::from_yoctonear(1), "one yocto required");
        let sender_id = env::predecessor_account_id();
        self.internal_transfer(&sender_id, &receiver_id, amount.0);
    }

    #[payable]
    pub fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        _memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<U128> {
        self.assert_transferable();
        assert_eq!(env::attached_deposit(), NearToken::from_yoctonear(1), "one yocto required");
        let sender_id = env::predecessor_account_id();
        self.internal_transfer(&sender_id, &receiver_id, amount.0);
        ext_receiver::ext(receiver_id.clone())
            .with_static_gas(RECEIVER_GAS)
            .ft_on_transfer(sender_id.clone(), amount, msg)
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(CALLBACK_GAS)
                    .resolve_transfer_call(sender_id, receiver_id, amount),
            )
            .into()
    }

    #[private]
    pub fn resolve_transfer_call(
        &mut self,
        sender_id: AccountId,
        receiver_id: AccountId,
        amount: U128,
    ) -> U128 {
        let unused = match env::promise_result(0) {
            PromiseResult::Successful(bytes) => near_sdk::serde_json::from_slice::<U128>(&bytes)
                .map(|value| value.0)
                .unwrap_or(amount.0),
            _ => amount.0,
        }
        .min(amount.0);
        let receiver_balance = self.balances.get(&receiver_id).copied().unwrap_or(0);
        let refund = unused.min(receiver_balance);
        if refund > 0 {
            self.internal_transfer(&receiver_id, &sender_id, refund);
        }
        U128(amount.0 - refund)
    }
}

impl MockFt {
    fn assert_owner(&self) {
        assert_eq!(env::predecessor_account_id(), self.owner_id, "owner only");
    }

    fn assert_transferable(&self) {
        assert!(!self.paused, "token paused");
    }

    fn internal_transfer(&mut self, sender: &AccountId, receiver: &AccountId, amount: u128) {
        assert_ne!(sender, receiver, "self transfer");
        let sender_balance = self.balances.get(sender).copied().expect("sender not registered");
        let receiver_balance = self.balances.get(receiver).copied().expect("receiver not registered");
        assert!(sender_balance >= amount, "insufficient balance");
        self.balances.insert(sender.clone(), sender_balance - amount);
        self.balances.insert(
            receiver.clone(),
            receiver_balance.checked_add(amount).expect("balance overflow"),
        );
    }
}
