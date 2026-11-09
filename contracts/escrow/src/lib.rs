use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_sdk::{
    borsh::BorshSerialize, env, ext_contract, json_types::U128, near, serde::Deserialize,
    store::LookupMap, AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise,
    PromiseError, PromiseOrValue,
};

#[cfg(not(feature = "expiry-fast-forward"))]
const EXERCISE_GRACE_NS: u64 = 24 * 60 * 60 * 1_000_000_000;
// Only the expiry-specific Sandbox artifact shortens the grace period. The
// payment-callback fault artifact retains production timing so exercise payment
// can be accepted after maturity during its normal grace window.
#[cfg(feature = "expiry-fast-forward")]
const EXERCISE_GRACE_NS: u64 = 0;
const FT_TRANSFER_GAS: Gas = Gas::from_tgas(10);
// The payment callback schedules the collateral transfer and its callback.
// Reserve enough prepaid gas for both downstream receipts plus callback work.
const PAYMENT_CALLBACK_GAS: Gas = Gas::from_tgas(30);
const CALLBACK_GAS: Gas = Gas::from_tgas(10);

#[derive(BorshSerialize, BorshStorageKey)]
enum StorageKey {
    Positions,
    SourcePositions,
}

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

#[near(serializers = [json])]
pub struct StorageEconomics {
    pub position_id: u64,
    pub storage_byte_cost_yocto: U128,
    pub estimated_record_bytes: U128,
    pub estimated_required_yocto: U128,
    pub attached_storage_reserve_yocto: U128,
    pub estimated_reserve_surplus_yocto: U128,
    pub estimate_only: bool,
    pub refund_available: bool,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct PremiumSidecar {
    pub schema_version: u8,
    pub revision: u64,
    pub token: AccountId,
    pub amount: u128,
    pub received: bool,
    pub paid: bool,
    pub payout_pending: bool,
    pub payout_failed: bool,
    pub refund_pending: bool,
    pub refund_failed: bool,
    pub refunded: bool,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct PayoutReconciliationRecord {
    pub position_id: u64,
    pub leg: String,
    pub token: AccountId,
    pub amount: u128,
    pub sender: AccountId,
    pub receiver: AccountId,
    pub succeeded: bool,
    pub evidence_hash: String,
    pub transfer_reference: String,
    pub reconciler: AccountId,
    pub recorded_at_ns: u64,
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
    /// Authoritative OptionsContract position ID; used to make registration retries idempotent.
    pub source_position_id: u64,
    pub writer: AccountId,
    pub holder: AccountId,
    pub collateral_token: AccountId,
    pub collateral_amount: u128,
    pub payment_token: AccountId,
    pub payment_amount: u128,
    pub expiry_ns: u64,
    pub storage_deposit: u128,
    pub state: EscrowState,
    pub collateral_received: bool,
    pub exercise_payment_received: bool,
    pub exercise_payment_received_at_ns: Option<u64>,
    pub payment_paid: bool,
    pub collateral_delivered_to_holder: bool,
    pub collateral_returned_to_writer: bool,
    pub failed_payout: Option<FailedPayout>,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct EscrowContract {
    owner: AccountId,
    controller: Option<AccountId>,
    next_position_id: u64,
    positions: LookupMap<u64, EscrowPosition>,
    source_positions: LookupMap<u64, u64>,
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
    fn on_premium_payout(&mut self, position_id: u64) -> bool;
    fn on_premium_refund(&mut self, position_id: u64) -> bool;
}

#[near]
impl EscrowContract {
    #[init]
    pub fn new() -> Self {
        Self {
            owner: env::predecessor_account_id(),
            controller: None,
            next_position_id: 0,
            positions: LookupMap::new(StorageKey::Positions),
            source_positions: LookupMap::new(StorageKey::SourcePositions),
            paused: false,
        }
    }

    pub fn propose_controller(&mut self, controller: AccountId) {
        self.assert_owner();
        assert_ne!(controller, env::current_account_id(), "invalid controller");
        let bytes =
            near_sdk::serde_json::to_vec(&controller).expect("serialize pending controller");
        env::storage_write(b"handel:escrow:pending-controller:v1", &bytes);
    }

    pub fn accept_controller(&mut self) {
        let caller = env::predecessor_account_id();
        let pending: Option<AccountId> = env::storage_read(b"handel:escrow:pending-controller:v1")
            .and_then(|bytes| near_sdk::serde_json::from_slice(&bytes).ok());
        assert_eq!(pending, Some(caller.clone()), "pending controller only");
        self.controller = Some(caller);
        env::storage_remove(b"handel:escrow:pending-controller:v1");
    }

    pub fn propose_ownership_transfer(&mut self, new_owner: AccountId) {
        self.assert_owner();
        assert_ne!(new_owner, self.owner, "new owner must differ");
        assert_ne!(new_owner, env::current_account_id(), "invalid owner");
        let bytes = near_sdk::serde_json::to_vec(&new_owner).expect("serialize pending owner");
        env::storage_write(b"handel:escrow:pending-owner:v1", &bytes);
    }

    pub fn accept_ownership_transfer(&mut self) {
        let caller = env::predecessor_account_id();
        let pending: Option<AccountId> = env::storage_read(b"handel:escrow:pending-owner:v1")
            .and_then(|bytes| near_sdk::serde_json::from_slice(&bytes).ok());
        assert_eq!(pending, Some(caller.clone()), "pending owner only");
        self.owner = caller;
        env::storage_remove(b"handel:escrow:pending-owner:v1");
    }

    pub fn get_owner(&self) -> AccountId {
        self.owner.clone()
    }

    pub fn get_pending_owner(&self) -> Option<AccountId> {
        env::storage_read(b"handel:escrow:pending-owner:v1")
            .and_then(|bytes| near_sdk::serde_json::from_slice(&bytes).ok())
    }

    pub fn set_paused(&mut self, paused: bool) {
        self.assert_owner();
        self.paused = paused;
    }

    #[payable]
    pub fn create_position_v2(
        &mut self,
        source_position_id: u64,
        writer: AccountId,
        holder: AccountId,
        collateral_token: AccountId,
        collateral_amount: U128,
        payment_token: AccountId,
        payment_amount: U128,
        expiry_ns: u64,
        premium_token: AccountId,
        premium_amount: U128,
    ) -> u64 {
        self.assert_controller();
        assert!(premium_amount.0 > 0, "premium must be positive");
        let storage_before = env::storage_usage();
        let id = self.create_position(
            source_position_id,
            writer,
            holder,
            collateral_token,
            collateral_amount,
            payment_token,
            payment_amount,
            expiry_ns,
        );
        let key = Self::premium_key(id);
        if let Some(bytes) = env::storage_read(&key) {
            let old: PremiumSidecar =
                near_sdk::serde_json::from_slice(&bytes).expect("invalid premium sidecar");
            assert_eq!(old.token, premium_token, "premium token mismatch");
            assert_eq!(old.amount, premium_amount.0, "premium amount mismatch");
        } else {
            let sidecar = PremiumSidecar {
                schema_version: 2,
                revision: 0,
                token: premium_token,
                amount: premium_amount.0,
                received: false,
                paid: false,
                payout_pending: false,
                payout_failed: false,
                refund_pending: false,
                refund_failed: false,
                refunded: false,
            };
            let bytes = near_sdk::serde_json::to_vec(&sidecar).expect("serialize premium sidecar");
            env::storage_write(&key, &bytes);
            let position = self.position(id);
            let added = env::storage_usage()
                .checked_sub(storage_before)
                .expect("storage usage underflow");
            let cost = u128::from(added)
                .checked_mul(env::storage_byte_cost().as_yoctonear())
                .expect("storage cost overflow");
            assert!(
                position.storage_deposit >= cost,
                "insufficient V2 storage deposit"
            );
        }
        id
    }

    pub fn get_premium_status(&self, position_id: u64) -> Option<PremiumSidecar> {
        let id = position_id;
        env::storage_read(&Self::premium_key(id))
            .and_then(|b| near_sdk::serde_json::from_slice(&b).ok())
            .filter(|value: &PremiumSidecar| value.schema_version == 2)
    }

    pub fn settle_premium(&mut self, position_id: u64) -> Promise {
        let id = position_id;
        let p = self.position(id);
        assert_eq!(env::predecessor_account_id(), p.holder, "holder only");
        assert_eq!(
            p.state,
            EscrowState::CollateralLocked,
            "collateral not locked"
        );
        assert!(
            env::block_timestamp() < p.expiry_ns,
            "premium window closed"
        );
        let mut premium = self.get_premium_status(id).expect("premium terms missing");
        assert!(
            premium.received && !premium.paid && !premium.payout_pending,
            "premium not payable"
        );
        assert!(
            !premium.refund_pending && !premium.refunded,
            "premium refund started"
        );
        premium.payout_pending = true;
        premium.payout_failed = false;
        self.store_premium_status(id, &premium);
        Self::transfer(premium.token, p.writer, premium.amount).then(
            ext_self::ext(env::current_account_id())
                .with_static_gas(CALLBACK_GAS)
                .on_premium_payout(id),
        )
    }

    pub fn retry_failed_premium_payout(&mut self, position_id: u64) -> Promise {
        let id = position_id;
        let p = self.position(id);
        let mut premium = self.get_premium_status(id).expect("premium terms missing");
        assert!(
            premium.received && !premium.paid && premium.payout_failed && !premium.payout_pending,
            "no definitive premium payout failure"
        );
        let deadline = p
            .expiry_ns
            .checked_add(EXERCISE_GRACE_NS)
            .expect("deadline overflow");
        assert!(
            env::block_timestamp() <= deadline,
            "premium refund window active"
        );
        assert!(
            !premium.refund_pending && !premium.refund_failed && !premium.refunded,
            "refund has priority"
        );
        premium.payout_pending = true;
        premium.payout_failed = false;
        self.store_premium_status(id, &premium);
        Self::transfer(premium.token, p.writer, premium.amount).then(
            ext_self::ext(env::current_account_id())
                .with_static_gas(CALLBACK_GAS)
                .on_premium_payout(id),
        )
    }

    pub fn refund_unpaid_premium(&mut self, position_id: u64) -> Promise {
        let id = position_id;
        let p = self.position(id);
        assert_eq!(env::predecessor_account_id(), p.holder, "holder only");
        let deadline = p
            .expiry_ns
            .checked_add(EXERCISE_GRACE_NS)
            .expect("deadline overflow");
        assert!(
            env::block_timestamp() > deadline,
            "exercise grace period active"
        );
        let mut premium = self.get_premium_status(id).expect("premium terms missing");
        assert!(premium.received && !premium.paid, "premium not refundable");
        assert!(
            !premium.payout_pending && !premium.refund_pending && !premium.refunded,
            "premium transfer unresolved"
        );
        premium.refund_pending = true;
        premium.refund_failed = false;
        self.store_premium_status(id, &premium);
        Self::transfer(premium.token, p.holder, premium.amount).then(
            ext_self::ext(env::current_account_id())
                .with_static_gas(CALLBACK_GAS)
                .on_premium_refund(id),
        )
    }

    pub fn retry_failed_premium_refund(&mut self, position_id: u64) -> Promise {
        let id = position_id;
        let p = self.position(id);
        let mut premium = self.get_premium_status(id).expect("premium terms missing");
        assert!(
            premium.refund_failed && !premium.refund_pending && !premium.refunded,
            "no definitive refund failure"
        );
        premium.refund_pending = true;
        premium.refund_failed = false;
        self.store_premium_status(id, &premium);
        Self::transfer(premium.token, p.holder, premium.amount).then(
            ext_self::ext(env::current_account_id())
                .with_static_gas(CALLBACK_GAS)
                .on_premium_refund(id),
        )
    }

    /// Registers immutable position terms before any token transfer is accepted.
    /// The controller funds the persistent record's NEAR storage stake.
    /// Only the configured OptionsContract may create a custody record.
    #[payable]
    pub fn create_position(
        &mut self,
        source_position_id: u64,
        writer: AccountId,
        holder: AccountId,
        collateral_token: AccountId,
        collateral_amount: U128,
        payment_token: AccountId,
        payment_amount: U128,
        expiry_ns: u64,
    ) -> u64 {
        self.assert_controller();
        // A controller may retry after an ambiguous cross-contract callback. Return the
        // original escrow ID only when every immutable term matches; never create a
        // second custody record for one OptionsContract position.
        if let Some(existing_id) = self.source_positions.get(&source_position_id).copied() {
            let mut existing = self.position(existing_id);
            assert_eq!(existing.writer, writer, "registration writer mismatch");
            assert_eq!(existing.holder, holder, "registration holder mismatch");
            assert_eq!(
                existing.collateral_token, collateral_token,
                "registration collateral token mismatch"
            );
            assert_eq!(
                existing.collateral_amount, collateral_amount.0,
                "registration collateral amount mismatch"
            );
            assert_eq!(
                existing.payment_token, payment_token,
                "registration payment token mismatch"
            );
            assert_eq!(
                existing.payment_amount, payment_amount.0,
                "registration payment amount mismatch"
            );
            assert_eq!(
                existing.expiry_ns, expiry_ns,
                "registration expiry mismatch"
            );
            // A retry may not know whether the original registration receipt committed.
            // Retain any retry deposit as additional storage reserve while returning the
            // same record ID; never create a second custody record.
            existing.storage_deposit = existing
                .storage_deposit
                .checked_add(env::attached_deposit().as_yoctonear())
                .expect("storage reserve overflow");
            self.positions.insert(existing_id, existing);
            return existing_id;
        }
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
        let storage_before = env::storage_usage();
        self.positions.insert(
            id,
            EscrowPosition {
                id,
                source_position_id,
                writer,
                holder,
                collateral_token,
                collateral_amount: collateral_amount.0,
                payment_token,
                payment_amount: payment_amount.0,
                expiry_ns,
                storage_deposit: 0,
                state: EscrowState::AwaitingCollateral,
                collateral_received: false,
                exercise_payment_received: false,
                exercise_payment_received_at_ns: None,
                payment_paid: false,
                collateral_delivered_to_holder: false,
                collateral_returned_to_writer: false,
                failed_payout: None,
            },
        );
        self.source_positions.insert(source_position_id, id);
        let storage_bytes = env::storage_usage()
            .checked_sub(storage_before)
            .expect("storage usage underflow");
        let required_deposit = u128::from(storage_bytes)
            .checked_mul(env::storage_byte_cost().as_yoctonear())
            .expect("storage deposit overflow");
        let attached = env::attached_deposit().as_yoctonear();
        assert!(
            attached >= required_deposit,
            "insufficient position storage deposit"
        );
        let mut position = self.position(id);
        // Retain the full attached amount as this record's storage reserve.
        // Excess is not refunded until a separately audited archival path exists.
        position.storage_deposit = attached;
        self.positions.insert(id, position);
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
        if let Some(premium) = self.get_premium_status(position_id) {
            assert!(premium.paid, "premium payout not confirmed");
        }
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
                .with_static_gas(PAYMENT_CALLBACK_GAS)
                .on_payment_payout(position_id),
        )
    }

    /// Anyone may retry only a payout whose transfer callback definitively recorded failure.
    /// A missing callback remains pending: retrying it could duplicate a successful transfer.
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
                assert!(
                    !position.collateral_delivered_to_holder,
                    "collateral already delivered to holder"
                );
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
                assert!(
                    !position.collateral_returned_to_writer,
                    "collateral already returned to writer"
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
        if let Some(premium) = self.get_premium_status(position_id) {
            assert!(
                !premium.received || premium.paid || premium.refunded,
                "unpaid premium must be refunded before collateral release"
            );
        }
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

    pub fn propose_payout_reconciler(&mut self, reconciler: AccountId) {
        self.assert_owner();
        assert_ne!(reconciler, env::current_account_id(), "invalid reconciler");
        let bytes =
            near_sdk::serde_json::to_vec(&reconciler).expect("serialize pending reconciler");
        env::storage_write(b"handel:escrow:pending-payout-reconciler:v1", &bytes);
    }

    pub fn accept_payout_reconciler(&mut self) {
        let caller = env::predecessor_account_id();
        let pending: Option<AccountId> =
            env::storage_read(b"handel:escrow:pending-payout-reconciler:v1")
                .and_then(|bytes| near_sdk::serde_json::from_slice(&bytes).ok());
        assert_eq!(pending, Some(caller.clone()), "pending reconciler only");
        let bytes = near_sdk::serde_json::to_vec(&caller).expect("serialize reconciler");
        env::storage_write(&Self::payout_reconciler_key(), &bytes);
        env::storage_remove(b"handel:escrow:pending-payout-reconciler:v1");
    }

    pub fn get_payout_reconciliation(
        &self,
        position_id: u64,
        leg: String,
    ) -> Option<PayoutReconciliationRecord> {
        let id = position_id;
        let seq =
            env::storage_read(&Self::reconciliation_sequence_key(id, &leg)).and_then(|b| {
                if b.len() == 8 {
                    Some(u64::from_le_bytes(b.try_into().ok()?))
                } else {
                    None
                }
            })?;
        env::storage_read(&Self::reconciliation_key(id, &leg, seq))
            .and_then(|b| near_sdk::serde_json::from_slice(&b).ok())
    }

    /// Human-governed evidence attestation for a payout whose callback receipt is ambiguous.
    /// This is an explicit trust root, not a trustless proof.
    pub fn reconcile_ambiguous_payout(
        &mut self,
        position_id: u64,
        leg: String,
        succeeded: bool,
        evidence_hash: String,
        transfer_reference: String,
    ) -> PromiseOrValue<bool> {
        let id = position_id;
        let reconciler: AccountId = env::storage_read(&Self::payout_reconciler_key())
            .and_then(|b| near_sdk::serde_json::from_slice(&b).ok())
            .expect("payout reconciler not configured");
        assert_eq!(
            env::predecessor_account_id(),
            reconciler,
            "payout reconciler only"
        );
        assert!(
            !evidence_hash.trim().is_empty() && evidence_hash.len() <= 256,
            "invalid evidence hash"
        );
        assert!(
            !transfer_reference.trim().is_empty() && transfer_reference.len() <= 512,
            "invalid transfer reference"
        );
        let mut p = self.position(id);
        let (token, amount, receiver) = match leg.as_str() {
            "exercise_payment" => (p.payment_token.clone(), p.payment_amount, p.writer.clone()),
            "exercise_collateral" => (
                p.collateral_token.clone(),
                p.collateral_amount,
                p.holder.clone(),
            ),
            "expiry_collateral" => (
                p.collateral_token.clone(),
                p.collateral_amount,
                p.writer.clone(),
            ),
            _ => env::panic_str("unsupported ambiguous payout leg"),
        };
        let record = PayoutReconciliationRecord {
            position_id: id,
            leg: leg.clone(),
            token,
            amount,
            sender: env::current_account_id(),
            receiver,
            succeeded,
            evidence_hash,
            transfer_reference,
            reconciler,
            recorded_at_ns: env::block_timestamp(),
        };
        match leg.as_str() {
            "exercise_payment" => {
                assert_eq!(
                    p.state,
                    EscrowState::PaymentPayoutPending,
                    "payment payout not ambiguous"
                );
                assert!(!p.payment_paid, "payment already confirmed");
                if succeeded {
                    p.payment_paid = true;
                    p.failed_payout = None;
                    p.state = EscrowState::CollateralPayoutPending;
                    self.positions.insert(id, p.clone());
                    self.store_payout_reconciliation(&record);
                    self.emit_lifecycle_event(&p);
                    PromiseOrValue::Promise(
                        Self::transfer(p.collateral_token, p.holder, p.collateral_amount).then(
                            ext_self::ext(env::current_account_id())
                                .with_static_gas(CALLBACK_GAS)
                                .on_collateral_payout(id),
                        ),
                    )
                } else {
                    p.state = EscrowState::ReconciliationRequired;
                    p.failed_payout = Some(FailedPayout::ExercisePayment);
                    self.positions.insert(id, p.clone());
                    self.store_payout_reconciliation(&record);
                    self.emit_lifecycle_event(&p);
                    PromiseOrValue::Value(false)
                }
            }
            "exercise_collateral" => {
                assert_eq!(
                    p.state,
                    EscrowState::CollateralPayoutPending,
                    "collateral payout not ambiguous"
                );
                assert!(
                    p.payment_paid && !p.collateral_delivered_to_holder,
                    "invalid collateral payout state"
                );
                if succeeded {
                    p.collateral_delivered_to_holder = true;
                    p.state = EscrowState::Settled;
                } else {
                    p.state = EscrowState::ReconciliationRequired;
                    p.failed_payout = Some(FailedPayout::ExerciseCollateral);
                }
                self.positions.insert(id, p.clone());
                self.store_payout_reconciliation(&record);
                self.emit_lifecycle_event(&p);
                PromiseOrValue::Value(succeeded)
            }
            "expiry_collateral" => {
                assert_eq!(
                    p.state,
                    EscrowState::ExpiryPayoutPending,
                    "expiry payout not ambiguous"
                );
                assert!(
                    !p.collateral_returned_to_writer,
                    "collateral already returned"
                );
                if succeeded {
                    p.collateral_returned_to_writer = true;
                    p.state = EscrowState::Expired;
                } else {
                    p.state = EscrowState::ReconciliationRequired;
                    p.failed_payout = Some(FailedPayout::ExpiryCollateral);
                }
                self.positions.insert(id, p.clone());
                self.store_payout_reconciliation(&record);
                self.emit_lifecycle_event(&p);
                PromiseOrValue::Value(succeeded)
            }
            _ => env::panic_str("unsupported ambiguous payout leg"),
        }
    }

    pub fn reconcile_ambiguous_premium_payout(
        &mut self,
        position_id: u64,
        succeeded: bool,
        evidence_hash: String,
        transfer_reference: String,
    ) -> bool {
        let id = position_id;
        let reconciler: AccountId = env::storage_read(&Self::payout_reconciler_key())
            .and_then(|b| near_sdk::serde_json::from_slice(&b).ok())
            .expect("payout reconciler not configured");
        assert_eq!(
            env::predecessor_account_id(),
            reconciler,
            "payout reconciler only"
        );
        assert!(
            !evidence_hash.trim().is_empty() && evidence_hash.len() <= 256,
            "invalid evidence hash"
        );
        assert!(
            !transfer_reference.trim().is_empty() && transfer_reference.len() <= 512,
            "invalid transfer reference"
        );
        let p = self.position(id);
        let mut premium = self.get_premium_status(id).expect("premium terms missing");
        assert!(
            premium.payout_pending && !premium.paid,
            "premium payout not ambiguous"
        );
        premium.payout_pending = false;
        premium.paid = succeeded;
        premium.payout_failed = !succeeded;
        self.store_premium_status(id, &premium);
        self.store_payout_reconciliation(&PayoutReconciliationRecord {
            position_id: id,
            leg: "premium_payout".into(),
            token: premium.token.clone(),
            amount: premium.amount,
            sender: env::current_account_id(),
            receiver: p.writer.clone(),
            succeeded,
            evidence_hash,
            transfer_reference,
            reconciler,
            recorded_at_ns: env::block_timestamp(),
        });
        self.emit_lifecycle_event_with_state(
            &p,
            if succeeded {
                "PremiumPaid"
            } else {
                "PremiumPayoutFailed"
            },
        );
        succeeded
    }

    pub fn reconcile_ambiguous_premium_refund(
        &mut self,
        position_id: u64,
        succeeded: bool,
        evidence_hash: String,
        transfer_reference: String,
    ) -> bool {
        let id = position_id;
        let reconciler: AccountId = env::storage_read(&Self::payout_reconciler_key())
            .and_then(|b| near_sdk::serde_json::from_slice(&b).ok())
            .expect("payout reconciler not configured");
        assert_eq!(
            env::predecessor_account_id(),
            reconciler,
            "payout reconciler only"
        );
        assert!(
            !evidence_hash.trim().is_empty() && evidence_hash.len() <= 256,
            "invalid evidence hash"
        );
        assert!(
            !transfer_reference.trim().is_empty() && transfer_reference.len() <= 512,
            "invalid transfer reference"
        );
        let p = self.position(id);
        let mut premium = self.get_premium_status(id).expect("premium terms missing");
        assert!(
            premium.refund_pending && !premium.refunded,
            "premium refund not ambiguous"
        );
        premium.refund_pending = false;
        premium.refunded = succeeded;
        premium.refund_failed = !succeeded;
        self.store_premium_status(id, &premium);
        self.store_payout_reconciliation(&PayoutReconciliationRecord {
            position_id: id,
            leg: "premium_refund".into(),
            token: premium.token.clone(),
            amount: premium.amount,
            sender: env::current_account_id(),
            receiver: p.holder.clone(),
            succeeded,
            evidence_hash,
            transfer_reference,
            reconciler,
            recorded_at_ns: env::block_timestamp(),
        });
        self.emit_lifecycle_event_with_state(
            &p,
            if succeeded {
                "PremiumRefunded"
            } else {
                "PremiumRefundFailed"
            },
        );
        succeeded
    }

    pub fn get_position(&self, position_id: u64) -> EscrowPosition {
        self.position(position_id)
    }

    /// Current NEAR storage economics for one record. Cost is computed at view time
    /// from the protocol's current storage byte price, never a hard-coded rate.
    pub fn get_storage_economics(&self, position_id: u64) -> StorageEconomics {
        let position = self.position(position_id);
        let byte_cost = env::storage_byte_cost().as_yoctonear();
        let estimated_record_bytes = near_sdk::serde_json::to_vec(&position)
            .expect("serialize position for storage estimate")
            .len() as u128;
        let estimated_required = estimated_record_bytes.saturating_mul(byte_cost);
        StorageEconomics {
            position_id,
            storage_byte_cost_yocto: U128(byte_cost),
            estimated_record_bytes: U128(estimated_record_bytes),
            estimated_required_yocto: U128(estimated_required),
            attached_storage_reserve_yocto: U128(position.storage_deposit),
            estimated_reserve_surplus_yocto: U128(
                position.storage_deposit.saturating_sub(estimated_required),
            ),
            estimate_only: true,
            refund_available: false,
        }
    }

    pub fn get_lifecycle_event(
        &self,
        position_id: u64,
        sequence: u64,
    ) -> Option<EscrowLifecycleEvent> {
        env::storage_read(&Self::event_key(position_id, sequence))
            .and_then(|bytes| near_sdk::serde_json::from_slice(&bytes).ok())
    }

    /// Redeliver a persisted event without initiating any token transfer.
    pub fn retry_lifecycle_event(&self, position_id: u64, sequence: u64) -> Promise {
        let event = self
            .get_lifecycle_event(position_id, sequence)
            .expect("lifecycle event not found");
        let controller = self.controller.clone().expect("controller not configured");
        Self::dispatch_lifecycle_event(controller, event)
    }

    pub fn get_latest_lifecycle_sequence(&self, position_id: u64) -> u64 {
        env::storage_read(&Self::sequence_key(position_id))
            .and_then(|bytes| {
                if bytes.len() == 8 {
                    Some(u64::from_le_bytes(bytes.try_into().ok()?))
                } else {
                    None
                }
            })
            .unwrap_or(0)
    }

    // This callback has a larger gas budget because it schedules the second transfer
    // and its callback. If this receipt itself fails, state remains pending by design;
    // no automatic retry is safe without independently proving the first transfer outcome.

    #[private]
    pub fn on_premium_payout(&mut self, position_id: u64) -> bool {
        let id = position_id;
        let p = self.position(id);
        let mut premium = self.get_premium_status(id).expect("premium terms missing");
        assert!(premium.payout_pending, "premium payout not pending");
        if Self::promise_succeeded() {
            premium.paid = true;
            premium.payout_pending = false;
            premium.payout_failed = false;
            self.store_premium_status(id, &premium);
            self.emit_lifecycle_event_with_state(&p, "PremiumPaid");
            true
        } else {
            premium.payout_pending = false;
            premium.payout_failed = true;
            self.store_premium_status(id, &premium);
            self.emit_lifecycle_event_with_state(&p, "PremiumPayoutFailed");
            false
        }
    }

    #[private]
    pub fn on_premium_refund(&mut self, position_id: u64) -> bool {
        let id = position_id;
        let p = self.position(id);
        let mut premium = self.get_premium_status(id).expect("premium terms missing");
        assert!(premium.refund_pending, "premium refund not pending");
        if Self::promise_succeeded() {
            premium.refunded = true;
            premium.refund_pending = false;
            premium.refund_failed = false;
            self.store_premium_status(id, &premium);
            self.emit_lifecycle_event_with_state(&p, "PremiumRefunded");
            true
        } else {
            premium.refund_pending = false;
            premium.refund_failed = true;
            self.store_premium_status(id, &premium);
            self.emit_lifecycle_event_with_state(&p, "PremiumRefundFailed");
            false
        }
    }

    #[private]
    pub fn on_payment_payout(&mut self, position_id: u64) -> PromiseOrValue<bool> {
        #[cfg(feature = "fault-injection")]
        env::panic_str("injected callback receipt failure (test-only Wasm)");

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
            self.emit_lifecycle_event(&position);
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
            self.positions.insert(position_id, position.clone());
            self.emit_lifecycle_event(&position);
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
            position.collateral_delivered_to_holder = true;
            position.state = EscrowState::Settled;
            self.positions.insert(position_id, position.clone());
            self.emit_lifecycle_event(&position);
            true
        } else {
            position.state = EscrowState::ReconciliationRequired;
            position.failed_payout = Some(FailedPayout::ExerciseCollateral);
            self.positions.insert(position_id, position.clone());
            self.emit_lifecycle_event(&position);
            false
        }
    }

    #[private]
    pub fn on_expiry_payout(&mut self, position_id: u64) -> bool {
        #[cfg(feature = "fault-injection")]
        env::panic_str("injected expiry callback receipt failure (test-only Wasm)");

        let mut position = self.position(position_id);
        assert_eq!(
            position.state,
            EscrowState::ExpiryPayoutPending,
            "unexpected callback"
        );
        if Self::promise_succeeded() {
            position.collateral_returned_to_writer = true;
            position.state = EscrowState::Expired;
            self.positions.insert(position_id, position.clone());
            self.emit_lifecycle_event(&position);
            true
        } else {
            position.state = EscrowState::ReconciliationRequired;
            position.failed_payout = Some(FailedPayout::ExpiryCollateral);
            self.positions.insert(position_id, position.clone());
            self.emit_lifecycle_event(&position);
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
            "premium" => {
                let Some(mut premium) = self.get_premium_status(message.position_id) else {
                    return PromiseOrValue::Value(amount);
                };
                if position.state != EscrowState::CollateralLocked
                    || !position.collateral_received
                    || premium.received
                    || sender_id != position.holder
                    || token_id != premium.token
                    || amount.0 != premium.amount
                    || env::block_timestamp() >= position.expiry_ns
                {
                    false
                } else {
                    premium.received = true;
                    self.store_premium_status(position.id, &premium);
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
                    || self
                        .get_premium_status(position.id)
                        .is_some_and(|premium| !premium.paid)
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
            self.positions.insert(position.id, position.clone());
            if message.leg != "premium"
                && (position.state == EscrowState::CollateralLocked
                    || position.state == EscrowState::ExercisePaymentReceived)
            {
                self.emit_lifecycle_event(&position);
            }
            PromiseOrValue::Value(U128(0))
        } else {
            PromiseOrValue::Value(amount)
        }
    }
}

impl EscrowContract {
    fn payout_reconciler_key() -> Vec<u8> {
        b"handel:escrow:v2:payout-reconciler".to_vec()
    }

    fn reconciliation_sequence_key(id: u64, leg: &str) -> Vec<u8> {
        format!("handel:escrow:v2:reconciliation-seq:{id}:{leg}").into_bytes()
    }

    fn reconciliation_key(id: u64, leg: &str, seq: u64) -> Vec<u8> {
        format!("handel:escrow:v2:reconciliation:{id}:{leg}:{seq}").into_bytes()
    }

    fn reconciliation_evidence_key(id: u64, leg: &str, hash: &str) -> Vec<u8> {
        format!("handel:escrow:v2:reconciliation-evidence:{id}:{leg}:{hash}").into_bytes()
    }

    fn store_payout_reconciliation(&self, record: &PayoutReconciliationRecord) {
        let evidence_key = Self::reconciliation_evidence_key(
            record.position_id,
            &record.leg,
            &record.evidence_hash,
        );
        assert!(
            env::storage_read(&evidence_key).is_none(),
            "reconciliation evidence replay"
        );
        let seq_key = Self::reconciliation_sequence_key(record.position_id, &record.leg);
        let previous = env::storage_read(&seq_key)
            .and_then(|b| {
                if b.len() == 8 {
                    Some(u64::from_le_bytes(b.try_into().ok()?))
                } else {
                    None
                }
            })
            .unwrap_or(0);
        let sequence = previous
            .checked_add(1)
            .expect("reconciliation sequence overflow");
        let bytes = near_sdk::serde_json::to_vec(record).expect("serialize reconciliation record");
        env::storage_write(&evidence_key, b"1");
        env::storage_write(&seq_key, &sequence.to_le_bytes());
        env::storage_write(
            &Self::reconciliation_key(record.position_id, &record.leg, sequence),
            &bytes,
        );
    }

    fn premium_key(id: u64) -> Vec<u8> {
        format!("handel:escrow:v2:premium:{id}").into_bytes()
    }

    fn store_premium_status(&self, id: u64, premium: &PremiumSidecar) {
        let previous = self
            .get_premium_status(id)
            .map(|value| value.revision)
            .unwrap_or(0);
        let mut updated = premium.clone();
        updated.schema_version = 2;
        updated.revision = previous.checked_add(1).expect("premium revision overflow");
        let bytes = near_sdk::serde_json::to_vec(&updated).expect("serialize premium sidecar");
        env::storage_write(&Self::premium_key(id), &bytes);
    }

    fn sequence_key(position_id: u64) -> Vec<u8> {
        format!("handel:escrow:v2:event-seq:{position_id}").into_bytes()
    }

    fn event_key(position_id: u64, sequence: u64) -> Vec<u8> {
        format!("handel:escrow:v2:event:{position_id}:{sequence}").into_bytes()
    }

    fn emit_lifecycle_event(&self, position: &EscrowPosition) {
        let state = match position.state {
            EscrowState::AwaitingCollateral => "AwaitingCollateral",
            EscrowState::CollateralLocked => "CollateralLocked",
            EscrowState::ExercisePaymentReceived => "ExercisePaymentReceived",
            EscrowState::PaymentPayoutPending => "PaymentPayoutPending",
            EscrowState::CollateralPayoutPending => "CollateralPayoutPending",
            EscrowState::ExpiryPayoutPending => "ExpiryPayoutPending",
            EscrowState::ReconciliationRequired => "ReconciliationRequired",
            EscrowState::Settled => "Settled",
            EscrowState::Expired => "Expired",
        };
        self.emit_lifecycle_event_with_state(position, state);
    }

    fn emit_lifecycle_event_with_state(&self, position: &EscrowPosition, state: &str) {
        let controller = self.controller.clone().expect("controller not configured");
        let key = Self::sequence_key(position.id);
        let previous = env::storage_read(&key)
            .and_then(|b| {
                if b.len() == 8 {
                    Some(u64::from_le_bytes(b.try_into().ok()?))
                } else {
                    None
                }
            })
            .unwrap_or(0);
        let sequence = previous.checked_add(1).expect("event sequence overflow");
        let event = EscrowLifecycleEvent {
            source_position_id: position.source_position_id,
            escrow_position_id: position.id,
            sequence,
            state: state.to_string(),
        };
        let bytes = near_sdk::serde_json::to_vec(&event).expect("serialize lifecycle event");
        env::storage_write(&key, &sequence.to_le_bytes());
        env::storage_write(&Self::event_key(position.id, sequence), &bytes);
        Self::dispatch_lifecycle_event(controller, event);
    }

    fn dispatch_lifecycle_event(controller: AccountId, event: EscrowLifecycleEvent) -> Promise {
        Promise::new(controller).function_call(
            "on_escrow_lifecycle_event".to_string(),
            near_sdk::serde_json::to_vec(&near_sdk::serde_json::json!({ "event": event }))
                .expect("serialize lifecycle callback"),
            NearToken::from_yoctonear(0),
            Gas::from_tgas(20),
        )
    }

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
        match env::promise_result_checked(0, 1_024) {
            Ok(_) => true,
            Err(PromiseError::Failed) => false,
            // An oversized result is ambiguous: do not classify it as a failed
            // transfer, because retrying could duplicate a successful payout.
            Err(PromiseError::TooLong(_)) => {
                env::panic_str("payout result too large; reconciliation required")
            }
            Err(_) => env::panic_str("payout result unknown; reconciliation required"),
        }
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
            .attached_deposit(NearToken::from_near(1))
            .build();
        testing_env!(context.clone());
        let mut contract = EscrowContract::new();
        contract.propose_controller(account("options.testnet"));
        context.predecessor_account_id = account("options.testnet");
        testing_env!(context.clone());
        contract.accept_controller();
        testing_env!(context);
        contract.create_position(
            0,
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

    fn setup_v2(timestamp: u64) -> EscrowContract {
        let mut context = VMContextBuilder::new()
            .current_account_id(account("escrow.testnet"))
            .predecessor_account_id(account("owner.testnet"))
            .block_timestamp(timestamp)
            .attached_deposit(NearToken::from_near(1))
            .build();
        testing_env!(context.clone());
        let mut contract = EscrowContract::new();
        contract.propose_controller(account("options.testnet"));
        context.predecessor_account_id = account("options.testnet");
        testing_env!(context.clone());
        contract.accept_controller();
        testing_env!(context);
        contract.create_position_v2(
            0,
            account("writer.testnet"),
            account("holder.testnet"),
            account("synthetic-stock.testnet"),
            U128(100),
            account("synthetic-usdc.testnet"),
            U128(500),
            1_000,
            account("synthetic-usdc.testnet"),
            U128(25),
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
        let premium_before = contract.get_premium_status(0);
        let context = VMContextBuilder::new()
            .current_account_id(account("escrow.testnet"))
            .predecessor_account_id(account(token))
            .block_timestamp(timestamp)
            .build();
        testing_env!(context);
        if let Some(premium) = premium_before.as_ref() {
            contract.store_premium_status(0, premium);
        }
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

    #[test]
    fn payout_still_pending_cannot_be_retried_without_a_definitive_failure() {
        let mut c = setup(10);
        let mut position = c.position(0);
        position.state = EscrowState::PaymentPayoutPending;
        c.positions.insert(0, position);
        let context = VMContextBuilder::new()
            .current_account_id(account("escrow.testnet"))
            .predecessor_account_id(account("writer.testnet"))
            .block_timestamp(2_000)
            .build();
        testing_env!(context);
        let result =
            std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| c.retry_failed_payout(0)));
        assert!(result.is_err());
        assert_eq!(c.get_position(0).state, EscrowState::PaymentPayoutPending);
    }

    #[test]
    fn expired_collateral_release_succeeds_after_grace_period() {
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

        let release_context = VMContextBuilder::new()
            .current_account_id(account("escrow.testnet"))
            .predecessor_account_id(account("writer.testnet"))
            .block_timestamp(1_000 + EXERCISE_GRACE_NS + 1)
            .build();
        testing_env!(release_context);
        let _payout = c.release_expired_collateral(0);
        assert_eq!(c.get_position(0).state, EscrowState::ExpiryPayoutPending);

        let callback_context = VMContextBuilder::new()
            .current_account_id(account("escrow.testnet"))
            .predecessor_account_id(account("escrow.testnet"))
            .block_timestamp(1_000 + EXERCISE_GRACE_NS + 2)
            .build();
        testing_env!(
            callback_context,
            near_sdk::test_vm_config(),
            near_sdk::RuntimeFeesConfig::test(),
            std::collections::HashMap::default(),
            vec![near_sdk::PromiseResult::Successful(vec![])],
        );
        assert!(c.on_expiry_payout(0));
        let position = c.get_position(0);
        assert_eq!(position.state, EscrowState::Expired);
        assert!(position.collateral_returned_to_writer);
        assert!(!position.exercise_payment_received);
    }

    #[test]
    fn failed_expiry_payout_can_be_retried_without_duplicate_release() {
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

        let release_context = VMContextBuilder::new()
            .current_account_id(account("escrow.testnet"))
            .predecessor_account_id(account("writer.testnet"))
            .block_timestamp(1_000 + EXERCISE_GRACE_NS + 1)
            .build();
        testing_env!(release_context);
        let _payout = c.release_expired_collateral(0);

        let failed_callback_context = VMContextBuilder::new()
            .current_account_id(account("escrow.testnet"))
            .predecessor_account_id(account("escrow.testnet"))
            .block_timestamp(1_000 + EXERCISE_GRACE_NS + 2)
            .build();
        testing_env!(
            failed_callback_context,
            near_sdk::test_vm_config(),
            near_sdk::RuntimeFeesConfig::test(),
            std::collections::HashMap::default(),
            vec![near_sdk::PromiseResult::Failed],
        );
        assert!(!c.on_expiry_payout(0));
        let failed = c.get_position(0);
        assert_eq!(failed.state, EscrowState::ReconciliationRequired);
        assert_eq!(failed.failed_payout, Some(FailedPayout::ExpiryCollateral));
        assert!(!failed.collateral_returned_to_writer);

        let retry_context = VMContextBuilder::new()
            .current_account_id(account("escrow.testnet"))
            .predecessor_account_id(account("writer.testnet"))
            .block_timestamp(1_000 + EXERCISE_GRACE_NS + 3)
            .build();
        testing_env!(retry_context);
        let _retry = c.retry_failed_payout(0);
        assert_eq!(c.get_position(0).state, EscrowState::ExpiryPayoutPending);

        let recovered_callback_context = VMContextBuilder::new()
            .current_account_id(account("escrow.testnet"))
            .predecessor_account_id(account("escrow.testnet"))
            .block_timestamp(1_000 + EXERCISE_GRACE_NS + 4)
            .build();
        testing_env!(
            recovered_callback_context,
            near_sdk::test_vm_config(),
            near_sdk::RuntimeFeesConfig::test(),
            std::collections::HashMap::default(),
            vec![near_sdk::PromiseResult::Successful(vec![])],
        );
        assert!(c.on_expiry_payout(0));
        let recovered = c.get_position(0);
        assert_eq!(recovered.state, EscrowState::Expired);
        assert!(recovered.collateral_returned_to_writer);
    }

    #[test]
    fn duplicate_controller_registration_returns_same_id_only_for_identical_terms() {
        let mut c = setup(10);
        let context = VMContextBuilder::new()
            .current_account_id(account("escrow.testnet"))
            .predecessor_account_id(account("options.testnet"))
            .block_timestamp(10)
            .build();
        testing_env!(context);
        let duplicate = c.create_position(
            0,
            account("writer.testnet"),
            account("holder.testnet"),
            account("synthetic-stock.testnet"),
            U128(100),
            account("synthetic-usdc.testnet"),
            U128(500),
            1_000,
        );
        assert_eq!(duplicate, 0);
        assert_eq!(c.next_position_id, 1);
        assert_eq!(c.get_position(0).source_position_id, 0);

        let mismatch = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            c.create_position(
                0,
                account("writer.testnet"),
                account("holder.testnet"),
                account("synthetic-stock.testnet"),
                U128(101),
                account("synthetic-usdc.testnet"),
                U128(500),
                1_000,
            )
        }));
        assert!(mismatch.is_err());
        assert_eq!(c.next_position_id, 1);
    }

    #[test]
    fn premium_requires_exact_holder_token_and_amount_and_must_be_paid_before_exercise() {
        let mut c = setup_v2(10);
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
                "wrong-token.testnet",
                "holder.testnet",
                25,
                "premium",
                30
            ),
            U128(25)
        );
        assert_eq!(
            receive(
                &mut c,
                "synthetic-usdc.testnet",
                "attacker.testnet",
                25,
                "premium",
                30
            ),
            U128(25)
        );
        assert_eq!(
            receive(
                &mut c,
                "synthetic-usdc.testnet",
                "holder.testnet",
                24,
                "premium",
                30
            ),
            U128(24)
        );
        assert_eq!(
            receive(
                &mut c,
                "synthetic-usdc.testnet",
                "holder.testnet",
                25,
                "premium",
                30
            ),
            U128(0)
        );
        assert!(c.get_premium_status(0).unwrap().received);

        assert_eq!(
            receive(
                &mut c,
                "synthetic-usdc.testnet",
                "holder.testnet",
                500,
                "exercise_payment",
                1_000
            ),
            U128(500)
        );
        let received = c.get_premium_status(0).unwrap();
        let holder_context = VMContextBuilder::new()
            .current_account_id(account("escrow.testnet"))
            .predecessor_account_id(account("holder.testnet"))
            .block_timestamp(40)
            .build();
        testing_env!(holder_context);
        c.store_premium_status(0, &received);
        let _payout = c.settle_premium(0);
        let pending = c.get_premium_status(0).unwrap();
        assert!(pending.payout_pending && !pending.paid);

        let callback_context = VMContextBuilder::new()
            .current_account_id(account("escrow.testnet"))
            .predecessor_account_id(account("escrow.testnet"))
            .block_timestamp(41)
            .build();
        testing_env!(
            callback_context,
            near_sdk::test_vm_config(),
            near_sdk::RuntimeFeesConfig::test(),
            std::collections::HashMap::default(),
            vec![near_sdk::PromiseResult::Successful(vec![])],
        );
        c.store_premium_status(0, &pending);
        assert!(c.on_premium_payout(0));
        assert!(c.get_premium_status(0).unwrap().paid);
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
    }

    #[test]
    fn definitively_failed_premium_payout_can_be_refunded_after_grace() {
        let mut c = setup_v2(10);
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
                25,
                "premium",
                30
            ),
            U128(0)
        );
        let received = c.get_premium_status(0).unwrap();
        let holder_context = VMContextBuilder::new()
            .current_account_id(account("escrow.testnet"))
            .predecessor_account_id(account("holder.testnet"))
            .block_timestamp(40)
            .build();
        testing_env!(holder_context);
        c.store_premium_status(0, &received);
        let _payout = c.settle_premium(0);
        let pending = c.get_premium_status(0).unwrap();

        let failed_context = VMContextBuilder::new()
            .current_account_id(account("escrow.testnet"))
            .predecessor_account_id(account("escrow.testnet"))
            .block_timestamp(41)
            .build();
        testing_env!(
            failed_context,
            near_sdk::test_vm_config(),
            near_sdk::RuntimeFeesConfig::test(),
            std::collections::HashMap::default(),
            vec![near_sdk::PromiseResult::Failed],
        );
        c.store_premium_status(0, &pending);
        assert!(!c.on_premium_payout(0));
        let failed = c.get_premium_status(0).unwrap();
        assert!(failed.payout_failed && !failed.payout_pending && !failed.paid);

        let refund_context = VMContextBuilder::new()
            .current_account_id(account("escrow.testnet"))
            .predecessor_account_id(account("holder.testnet"))
            .block_timestamp(1_000 + EXERCISE_GRACE_NS + 1)
            .build();
        testing_env!(refund_context);
        c.store_premium_status(0, &failed);
        let _refund = c.refund_unpaid_premium(0);
        let refund_pending = c.get_premium_status(0).unwrap();

        let refund_callback = VMContextBuilder::new()
            .current_account_id(account("escrow.testnet"))
            .predecessor_account_id(account("escrow.testnet"))
            .block_timestamp(1_000 + EXERCISE_GRACE_NS + 2)
            .build();
        testing_env!(
            refund_callback,
            near_sdk::test_vm_config(),
            near_sdk::RuntimeFeesConfig::test(),
            std::collections::HashMap::default(),
            vec![near_sdk::PromiseResult::Successful(vec![])],
        );
        c.store_premium_status(0, &refund_pending);
        assert!(c.on_premium_refund(0));
        assert!(c.get_premium_status(0).unwrap().refunded);
    }

    #[test]
    fn trusted_evidence_resolves_ambiguous_payment_without_repeating_that_leg() {
        let mut c = setup(10);
        let mut p = c.position(0);
        p.state = EscrowState::PaymentPayoutPending;
        c.positions.insert(0, p);

        let owner_context = VMContextBuilder::new()
            .current_account_id(account("escrow.testnet"))
            .predecessor_account_id(account("owner.testnet"))
            .block_timestamp(2_000)
            .build();
        testing_env!(owner_context);
        c.propose_payout_reconciler(account("reconciler.testnet"));
        let accept_context = VMContextBuilder::new()
            .current_account_id(account("escrow.testnet"))
            .predecessor_account_id(account("reconciler.testnet"))
            .block_timestamp(2_000)
            .build();
        testing_env!(accept_context);
        c.accept_payout_reconciler();

        let reconciler_context = VMContextBuilder::new()
            .current_account_id(account("escrow.testnet"))
            .predecessor_account_id(account("reconciler.testnet"))
            .block_timestamp(2_001)
            .build();
        testing_env!(reconciler_context);
        let result = c.reconcile_ambiguous_payout(
            0,
            "exercise_payment".into(),
            true,
            "sha256:independently-inspected-receipt".into(),
            "near-receipt:payment-0".into(),
        );
        assert!(matches!(result, PromiseOrValue::Promise(_)));
        let position = c.get_position(0);
        assert!(position.payment_paid);
        assert_eq!(position.state, EscrowState::CollateralPayoutPending);
        let record = c
            .get_payout_reconciliation(0, "exercise_payment".into())
            .unwrap();
        assert!(record.succeeded);
        assert_eq!(record.reconciler, account("reconciler.testnet"));

        let replay = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            c.reconcile_ambiguous_payout(
                0,
                "exercise_payment".into(),
                true,
                "sha256:another".into(),
                "near-receipt:payment-0".into(),
            )
        }));
        assert!(replay.is_err());
        assert!(c.get_position(0).payment_paid);
    }

    #[test]
    fn escrow_admin_handoffs_require_acceptance_by_the_proposed_account() {
        let owner_context = VMContextBuilder::new()
            .current_account_id(account("escrow.testnet"))
            .predecessor_account_id(account("owner.testnet"))
            .build();
        testing_env!(owner_context);
        let mut c = EscrowContract::new();
        c.propose_ownership_transfer(account("new-owner.testnet"));
        assert_eq!(c.get_owner(), account("owner.testnet"));
        assert_eq!(c.get_pending_owner(), Some(account("new-owner.testnet")));

        let attacker_context = VMContextBuilder::new()
            .current_account_id(account("escrow.testnet"))
            .predecessor_account_id(account("attacker.testnet"))
            .build();
        testing_env!(attacker_context);
        let denied = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            c.accept_ownership_transfer()
        }));
        assert!(denied.is_err());
        assert_eq!(c.get_owner(), account("owner.testnet"));

        let new_owner_context = VMContextBuilder::new()
            .current_account_id(account("escrow.testnet"))
            .predecessor_account_id(account("new-owner.testnet"))
            .build();
        testing_env!(new_owner_context);
        c.accept_ownership_transfer();
        assert_eq!(c.get_owner(), account("new-owner.testnet"));
        assert_eq!(c.get_pending_owner(), None);
    }

    #[test]
    fn persistent_position_map_handles_many_independent_records() {
        let mut c = setup(10);
        let context = VMContextBuilder::new()
            .current_account_id(account("escrow.testnet"))
            .predecessor_account_id(account("options.testnet"))
            .block_timestamp(10)
            .attached_deposit(NearToken::from_near(1))
            .build();
        testing_env!(context);
        for expected_id in 1..=128u64 {
            let id = c.create_position(
                expected_id,
                account("writer.testnet"),
                account("holder.testnet"),
                account("synthetic-stock.testnet"),
                U128(100),
                account("synthetic-usdc.testnet"),
                U128(500),
                1_000,
            );
            assert_eq!(id, expected_id);
        }
        assert_eq!(c.get_position(0).id, 0);
        assert_eq!(c.get_position(64).id, 64);
        assert_eq!(c.get_position(128).id, 128);
        assert_eq!(c.get_position(128).state, EscrowState::AwaitingCollateral);
    }
}
