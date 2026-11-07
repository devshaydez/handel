use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_sdk::{
    env, ext_contract, json_types::U128, near, serde::Deserialize, AccountId, Gas, NearToken,
    PanicOnDefault, Promise, PromiseOrValue, PromiseResult,
};
use std::collections::BTreeMap;

const EXERCISE_GRACE_NS: u64 = 24 * 60 * 60 * 1_000_000_000;
const FT_TRANSFER_GAS: Gas = Gas::from_tgas(10);
const CALLBACK_GAS: Gas = Gas::from_tgas(10);

#[derive(Deserialize)]
#[serde(crate = "near_sdk::serde")]
struct TransferMessage {
    position_id: u64,
    leg: String,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum EscrowState {
    AwaitingCollateral,
    CollateralLocked,
    ExercisePaymentReceived,
    PaymentPayoutPending,
    CollateralPayoutPending,
    ExpiryPayoutPending,
    ReconciliationRequired,
    Settled,
    Expired,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum FailedPayout {
    ExercisePayment,
    ExerciseCollateral,
    ExpiryCollateral,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct EscrowPosition {
    pub id: u64,
    pub writer: AccountId,
    pub holder: AccountId,
    pub collateral_token: AccountId,
    pub collateral_amount: u128,
    pub payment_token: AccountId,
    pub payment_amount: u128,
    pub expiry_ns: u64,
    pub state: EscrowState,
    pub collateral_received: bool,
    pub exercise_payment_received: bool,
    pub exercise_payment_received_at_ns: Option<u64>,
    pub payment_paid: bool,
    pub collateral_paid: bool,
    pub failed_payout: Option<FailedPayout>,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct EscrowContract {
    owner: AccountId,
    controller: Option<AccountId>,
    next_position_id: u64,
    positions: BTreeMap<u64, EscrowPosition>,
    paused: bool,
}

#[ext_contract(ext_ft)]
trait ExtFungibleToken {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
}

#[ext_contract(ext_self)]
trait ExtEscrow {
    fn on_payment_payout(&mut self, position_id: u64) -> PromiseOrValue<bool>;
    fn on_collateral_payout(&mut self, position_id: u64) -> bool;
    fn on_expiry_payout(&mut self, position_id: u64) -> bool;
}

#[near]
impl EscrowContract {
    #[init]
    pub fn new() -> Self {
        Self {
            owner: env::predecessor_account_id(),
            controller: None,
            next_position_id: 0,
            positions: BTreeMap::new(),
            paused: false,
        }
    }

    pub fn set_controller(&mut self, controller: AccountId) {
        self.assert_owner();
        assert_ne!(controller, env::current_account_id(), "invalid controller");
        self.controller = Some(controller);
    }

    pub fn set_paused(&mut self, paused: bool) {
        self.assert_owner();
        self.paused = paused;
    }

    /// Registers immutable position terms before any token transfer is accepted.
    /// Only the configured OptionsContract may create a custody record.
    pub fn create_position(
        &mut self,
        writer: AccountId,
        holder: AccountId,
        collateral_token: AccountId,
        collateral_amount: U128,
        payment_token: AccountId,
        payment_amount: U128,
        expiry_ns: u64,
    ) -> u64 {
        self.assert_controller();
        assert!(!self.paused, "escrow paused");
        assert_ne!(writer, holder, "writer and holder must differ");
        assert_ne!(collateral_token, payment_token, "assets must differ");
        assert!(collateral_amount.0 > 0, "collateral must be positive");
        assert!(payment_amount.0 > 0, "payment must be positive");
        assert!(
            expiry_ns > env::block_timestamp(),
            "expiry must be in future"
        );

        let id = self.next_position_id;
        self.next_position_id = self.next_position_id.checked_add(1).expect("id overflow");
        self.positions.insert(
            id,
            EscrowPosition {
                id,
                writer,
                holder,
                collateral_token,
                collateral_amount: collateral_amount.0,
                payment_token,
                payment_amount: payment_amount.0,
                expiry_ns,
                state: EscrowState::AwaitingCollateral,
                collateral_received: false,
                exercise_payment_received: false,
                payment_paid: false,
                collateral_paid: false,
                failed_payout: None,
            },
        );
        id
    }

    /// Holder starts the sequential two-leg payout only after both deposits are in escrow.
    /// The two NEP-141 transfers are NOT atomic; callbacks preserve partial success.
    pub fn settle_exercise(&mut self, position_id: u64) -> Promise {
        let mut position = self.position(position_id);
        assert_eq!(
            env::predecessor_account_id(),
            position.holder,
            "holder only"
        );
        assert_eq!(
            position.state,
            EscrowState::ExercisePaymentReceived,
            "exercise payment missing"
        );
        assert!(position.collateral_received, "collateral missing");
        let received_at = position
            .exercise_payment_received_at_ns
            .expect("exercise receipt timestamp missing");
        let deadline = position
            .expiry_ns
            .checked_add(EXERCISE_GRACE_NS)
            .expect("deadline overflow");
        assert!(
            received_at >= position.expiry_ns && received_at <= deadline,
            "exercise payment was not received in the exercise window"
        );
        position.state = EscrowState::PaymentPayoutPending;
        position.failed_payout = None;
        self.positions.insert(position_id, position.clone());
        Self::transfer(
            position.payment_token,
            position.writer,
            position.payment_amount,
        )
        .then(
            ext_self::ext(env::current_account_id())
                .with_static_gas(CALLBACK_GAS)
                .on_payment_payout(position_id),
        )
    }

    /// Anyone may retry a definitively failed payout: destinations and amounts are immutable.
    /// A successful leg is never repeated.
    pub fn retry_failed_payout(&mut self, position_id: u64) -> Promise {
        let mut position = self.position(position_id);
        assert_eq!(
            position.state,
            EscrowState::ReconciliationRequired,
            "no failed payout"
        );
        let failed = position.failed_payout.expect("failed payout missing");
        position.failed_payout = None;
        match failed {
            FailedPayout::ExercisePayment => {
                assert!(!position.payment_paid, "payment already paid");
                position.state = EscrowState::PaymentPayoutPending;
                self.positions.insert(position_id, position.clone());
                Self::transfer(
                    position.payment_token,
                    position.writer,
                    position.payment_amount,
                )
                .then(
                    ext_self::ext(env::current_account_id())
                        .with_static_gas(CALLBACK_GAS)
                        .on_payment_payout(position_id),
                )
            }
            FailedPayout::ExerciseCollateral => {
                assert!(position.payment_paid, "payment leg not confirmed");
                assert!(!position.collateral_paid, "collateral already paid");
                position.state = EscrowState::CollateralPayoutPending;
                self.positions.insert(position_id, position.clone());
                Self::transfer(
                    position.collateral_token,
                    position.holder,
                    position.collateral_amount,
                )
                .then(
                    ext_self::ext(env::current_account_id())
                        .with_static_gas(CALLBACK_GAS)
                        .on_collateral_payout(position_id),
                )
            }
            FailedPayout::ExpiryCollateral => {
                assert!(!position.collateral_paid, "collateral already returned");
                position.state = EscrowState::ExpiryPayoutPending;
                self.positions.insert(position_id, position.clone());
                Self::transfer(
                    position.collateral_token,
                    position.writer,
                    position.collateral_amount,
                )
                .then(
                    ext_self::ext(env::current_account_id())
                        .with_static_gas(CALLBACK_GAS)
                        .on_expiry_payout(position_id),
                )
            }
        }
    }

    /// Writer may reclaim unused collateral only after maturity plus the exercise grace period.
    pub fn release_expired_collateral(&mut self, position_id: u64) -> Promise {
        let mut position = self.position(position_id);
        assert_eq!(
            env::predecessor_account_id(),
            position.writer,
            "writer only"
        );
        assert_eq!(
            position.state,
            EscrowState::CollateralLocked,
            "position not releasable"
        );
        assert!(
            !position.exercise_payment_received,
            "exercise already initiated"
        );
        let deadline = position
            .expiry_ns
            .checked_add(EXERCISE_GRACE_NS)
            .expect("deadline overflow");
        assert!(
            env::block_timestamp() > deadline,
            "exercise grace period active"
        );
        position.state = EscrowState::ExpiryPayoutPending;
        self.positions.insert(position_id, position.clone());
        Self::transfer(
            position.collateral_token,
            position.writer,
            position.collateral_amount,
        )
        .then(
            ext_self::ext(env::current_account_id())
                .with_static_gas(CALLBACK_GAS)
                .on_expiry_payout(position_id),
        )
    }

    pub fn get_position(&self, position_id: u64) -> EscrowPosition {
        self.position(position_id)
    }

    #[private]
    pub fn on_payment_payout(&mut self, position_id: u64) -> PromiseOrValue<bool> {
        let mut position = self.position(position_id);
        assert_eq!(
            position.state,
            EscrowState::PaymentPayoutPending,
            "unexpected callback"
        );
        if Self::promise_succeeded() {
            position.payment_paid = true;
            position.state = EscrowState::CollateralPayoutPending;
            self.positions.insert(position_id, position.clone());
            PromiseOrValue::Promise(
                Self::transfer(
                    position.collateral_token,
                    position.holder,
                    position.collateral_amount,
                )
                .then(
                    ext_self::ext(env::current_account_id())
                        .with_static_gas(CALLBACK_GAS)
                        .on_collateral_payout(position_id),
                ),
            )
        } else {
            position.state = EscrowState::ReconciliationRequired;
            position.failed_payout = Some(FailedPayout::ExercisePayment);
            self.positions.insert(position_id, position);
            PromiseOrValue::Value(false)
        }
    }

    #[private]
    pub fn on_collateral_payout(&mut self, position_id: u64) -> bool {
        let mut position = self.position(position_id);
        assert_eq!(
            position.state,
            EscrowState::CollateralPayoutPending,
            "unexpected callback"
        );
        if Self::promise_succeeded() {
            position.collateral_paid = true;
            position.state = EscrowState::Settled;
            self.positions.insert(position_id, position);
            true
        } else {
            position.state = EscrowState::ReconciliationRequired;
            position.failed_payout = Some(FailedPayout::ExerciseCollateral);
            self.positions.insert(position_id, position);
            false
        }
    }

    #[private]
    pub fn on_expiry_payout(&mut self, position_id: u64) -> bool {
        let mut position = self.position(position_id);
        assert_eq!(
            position.state,
            EscrowState::ExpiryPayoutPending,
            "unexpected callback"
        );
        if Self::promise_succeeded() {
            position.collateral_paid = true;
            position.state = EscrowState::Expired;
            self.positions.insert(position_id, position);
            true
        } else {
            position.state = EscrowState::ReconciliationRequired;
            position.failed_payout = Some(FailedPayout::ExpiryCollateral);
            self.positions.insert(position_id, position);
            false
        }
    }
}

#[near]
impl FungibleTokenReceiver for EscrowContract {
    fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        if self.paused {
            return PromiseOrValue::Value(amount);
        }
        let message: TransferMessage = match near_sdk::serde_json::from_str(&msg) {
            Ok(value) => value,
            Err(_) => return PromiseOrValue::Value(amount),
        };
        let token_id = env::predecessor_account_id();
        let Some(mut position) = self.positions.get(&message.position_id).cloned() else {
            return PromiseOrValue::Value(amount);
        };

        let accepted = match message.leg.as_str() {
            "collateral" => {
                if position.state != EscrowState::AwaitingCollateral
                    || position.collateral_received
                    || sender_id != position.writer
                    || token_id != position.collateral_token
                    || amount.0 != position.collateral_amount
                    || env::block_timestamp() >= position.expiry_ns
                {
                    false
                } else {
                    position.collateral_received = true;
                    position.state = EscrowState::CollateralLocked;
                    true
                }
            }
            "exercise_payment" => {
                let deadline = position.expiry_ns.checked_add(EXERCISE_GRACE_NS);
                if position.state != EscrowState::CollateralLocked
                    || !position.collateral_received
                    || position.exercise_payment_received
                    || sender_id != position.holder
                    || token_id != position.payment_token
                    || amount.0 != position.payment_amount
                    || env::block_timestamp() < position.expiry_ns
                    || deadline.is_none_or(|end| env::block_timestamp() > end)
                {
                    false
                } else {
                    position.exercise_payment_received = true;
                    position.exercise_payment_received_at_ns = Some(env::block_timestamp());
                    position.state = EscrowState::ExercisePaymentReceived;
                    true
                }
            }
            _ => false,
        };

        if accepted {
            self.positions.insert(position.id, position);
            PromiseOrValue::Value(U128(0))
        } else {
            PromiseOrValue::Value(amount)
        }
    }
}

impl EscrowContract {
    fn position(&self, id: u64) -> EscrowPosition {
        self.positions.get(&id).cloned().expect("unknown position")
    }

    fn assert_owner(&self) {
        assert_eq!(env::predecessor_account_id(), self.owner, "owner only");
    }

    fn assert_controller(&self) {
        assert_eq!(
            Some(env::predecessor_account_id()),
            self.controller,
            "controller only"
        );
    }

    fn promise_succeeded() -> bool {
        matches!(env::promise_result(0), PromiseResult::Successful(_))
    }

    fn transfer(token: AccountId, receiver: AccountId, amount: u128) -> Promise {
        ext_ft::ext(token)
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(FT_TRANSFER_GAS)
            .ft_transfer(receiver, U128(amount), None)
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

    fn setup(timestamp: u64) -> EscrowContract {
        let mut context = VMContextBuilder::new()
            .current_account_id(account("escrow.testnet"))
            .predecessor_account_id(account("owner.testnet"))
            .block_timestamp(timestamp)
            .build();
        testing_env!(context.clone());
        let mut contract = EscrowContract::new();
        contract.set_controller(account("options.testnet"));
        context.predecessor_account_id = account("options.testnet");
        testing_env!(context);
        contract.create_position(
            account("writer.testnet"),
            account("holder.testnet"),
            account("synthetic-stock.testnet"),
            U128(100),
            account("synthetic-usdc.testnet"),
            U128(500),
            1_000,
        );
        contract
    }

    fn receive(
        contract: &mut EscrowContract,
        token: &str,
        sender: &str,
        amount: u128,
        leg: &str,
        timestamp: u64,
    ) -> U128 {
        let context = VMContextBuilder::new()
            .current_account_id(account("escrow.testnet"))
            .predecessor_account_id(account(token))
            .block_timestamp(timestamp)
            .build();
        testing_env!(context);
        match contract.ft_on_transfer(
            account(sender),
            U128(amount),
            near_sdk::serde_json::json!({"position_id":0,"leg":leg}).to_string(),
        ) {
            PromiseOrValue::Value(unused) => unused,
            PromiseOrValue::Promise(_) => panic!("unexpected promise"),
        }
    }

    #[test]
    fn accepts_only_exact_writer_collateral_from_registered_token() {
        let mut c = setup(10);
        assert_eq!(
            receive(
                &mut c,
                "wrong-token.testnet",
                "writer.testnet",
                100,
                "collateral",
                20
            ),
            U128(100)
        );
        assert_eq!(
            receive(
                &mut c,
                "synthetic-stock.testnet",
                "attacker.testnet",
                100,
                "collateral",
                20
            ),
            U128(100)
        );
        assert_eq!(
            receive(
                &mut c,
                "synthetic-stock.testnet",
                "writer.testnet",
                99,
                "collateral",
                20
            ),
            U128(99)
        );
        assert_eq!(
            receive(
                &mut c,
                "synthetic-stock.testnet",
                "writer.testnet",
                100,
                "collateral",
                20
            ),
            U128(0)
        );
        assert_eq!(c.get_position(0).state, EscrowState::CollateralLocked);
    }

    #[test]
    fn rejects_duplicate_collateral_deposit() {
        let mut c = setup(10);
        assert_eq!(
            receive(
                &mut c,
                "synthetic-stock.testnet",
                "writer.testnet",
                100,
                "collateral",
                20
            ),
            U128(0)
        );
        assert_eq!(
            receive(
                &mut c,
                "synthetic-stock.testnet",
                "writer.testnet",
                100,
                "collateral",
                20
            ),
            U128(100)
        );
    }

    #[test]
    fn exercise_payment_requires_holder_exact_token_amount_and_maturity() {
        let mut c = setup(10);
        assert_eq!(
            receive(
                &mut c,
                "synthetic-stock.testnet",
                "writer.testnet",
                100,
                "collateral",
                20
            ),
            U128(0)
        );
        assert_eq!(
            receive(
                &mut c,
                "synthetic-usdc.testnet",
                "holder.testnet",
                500,
                "exercise_payment",
                999
            ),
            U128(500)
        );
        assert_eq!(
            receive(
                &mut c,
                "synthetic-usdc.testnet",
                "holder.testnet",
                500,
                "exercise_payment",
                1_000
            ),
            U128(0)
        );
        assert_eq!(
            c.get_position(0).state,
            EscrowState::ExercisePaymentReceived
        );
    }

    #[test]
    fn exercise_payment_rejects_wrong_sender_and_wrong_amount() {
        let mut c = setup(10);
        assert_eq!(
            receive(
                &mut c,
                "synthetic-stock.testnet",
                "writer.testnet",
                100,
                "collateral",
                20
            ),
            U128(0)
        );
        assert_eq!(
            receive(
                &mut c,
                "synthetic-usdc.testnet",
                "attacker.testnet",
                500,
                "exercise_payment",
                1_000
            ),
            U128(500)
        );
        assert_eq!(
            receive(
                &mut c,
                "synthetic-usdc.testnet",
                "holder.testnet",
                499,
                "exercise_payment",
                1_000
            ),
            U128(499)
        );
    }

    #[test]
    fn rejects_collateral_after_maturity() {
        let mut c = setup(10);
        assert_eq!(
            receive(
                &mut c,
                "synthetic-stock.testnet",
                "writer.testnet",
                100,
                "collateral",
                1_000
            ),
            U128(100)
        );
    }

    #[test]
    fn expired_collateral_cannot_be_released_during_grace_period() {
        let mut c = setup(10);
        assert_eq!(
            receive(
                &mut c,
                "synthetic-stock.testnet",
                "writer.testnet",
                100,
                "collateral",
                20
            ),
            U128(0)
        );
        let context = VMContextBuilder::new()
            .current_account_id(account("escrow.testnet"))
            .predecessor_account_id(account("writer.testnet"))
            .block_timestamp(1_000 + EXERCISE_GRACE_NS)
            .build();
        testing_env!(context);
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            c.release_expired_collateral(0)
        }));
        assert!(result.is_err());
    }

    #[test]
    fn accepted_exercise_can_settle_after_grace_even_if_paused() {
        let mut c = setup(10);
        assert_eq!(
            receive(
                &mut c,
                "synthetic-stock.testnet",
                "writer.testnet",
                100,
                "collateral",
                20
            ),
            U128(0)
        );
        assert_eq!(
            receive(
                &mut c,
                "synthetic-usdc.testnet",
                "holder.testnet",
                500,
                "exercise_payment",
                1_000
            ),
            U128(0)
        );

        let owner_context = VMContextBuilder::new()
            .current_account_id(account("escrow.testnet"))
            .predecessor_account_id(account("owner.testnet"))
            .block_timestamp(1_000)
            .build();
        testing_env!(owner_context);
        c.set_paused(true);

        let holder_context = VMContextBuilder::new()
            .current_account_id(account("escrow.testnet"))
            .predecessor_account_id(account("holder.testnet"))
            .block_timestamp(1_000 + EXERCISE_GRACE_NS + 1)
            .build();
        testing_env!(holder_context);
        let _payout = c.settle_exercise(0);
        assert_eq!(c.get_position(0).state, EscrowState::PaymentPayoutPending);
    }

    #[test]
    fn exercise_payment_cannot_be_replayed() {
        let mut c = setup(10);
        assert_eq!(
            receive(
                &mut c,
                "synthetic-stock.testnet",
                "writer.testnet",
                100,
                "collateral",
                20
            ),
            U128(0)
        );
        assert_eq!(
            receive(
                &mut c,
                "synthetic-usdc.testnet",
                "holder.testnet",
                500,
                "exercise_payment",
                1_000
            ),
            U128(0)
        );
        assert_eq!(
            receive(
                &mut c,
                "synthetic-usdc.testnet",
                "holder.testnet",
                500,
                "exercise_payment",
                1_001
            ),
            U128(500)
        );
    }
}
