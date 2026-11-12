import { useEffect, useState } from 'react';
import { LuLoader, LuFingerprint, LuWallet } from 'react-icons/lu';
import { useStore } from '../state/store';
import type { WalletTransactionResult } from '../lib/near-wallet';
import { Button, Modal } from './ui';

export function SignModal({
  open, onClose, onSigned, action, rows, execute,
}: {
  open: boolean;
  onClose: () => void;
  onSigned: (result: WalletTransactionResult) => void | Promise<void>;
  action: string;
  rows: { k: string; v: string }[];
  execute: () => Promise<WalletTransactionResult>;
}) {
  const s = useStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (open) { setBusy(false); setError(''); } }, [open]);
  const sign = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await execute();
      await onSigned(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Wallet transaction failed.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title={<span className="row gap8"><LuWallet size={20} />Wallet request</span>} className="wallet-modal">
      <div className="col gap12">
        <div className="banner gold">
          <LuFingerprint size={16} />
          <div>Real NEAR Testnet escrow workflow. Your wallet may request separate approvals for agent approval, token registration, collateral transfer and premium transfer. Review every transaction and amount; Handel never receives your private key.</div>
        </div>
        <div>
          <div className="small muted">Handel requests approval to</div>
          <div className="big bold">{action}</div>
        </div>
        <div>
          {[{ k: 'Account', v: s.wallet.account || 'Not connected' }, { k: 'Network', v: s.wallet.network }, ...rows].map((r) => (
            <div className="kv" key={r.k}>
              <span className="k">{r.k}</span>
              <span className="v">{r.v}</span>
            </div>
          ))}
        </div>
        {error && <div className="banner red">{error}</div>}
        <div className="small muted">This creates a Testnet option and funds its escrow using test tokens. It does not grant the agent ongoing trading permission.</div>
        <div className="row gap8">
          <Button block onClick={onClose} disabled={busy}>Reject</Button>
          <Button block variant="gold" onClick={sign} disabled={busy || !s.wallet.connected} icon={busy ? <LuLoader size={15} className="spin" /> : undefined}>
            {busy ? 'Waiting for wallet…' : 'Approve and sign'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
