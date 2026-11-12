import { useEffect, useState } from 'react';
import { LuLoader, LuFingerprint, LuWallet } from 'react-icons/lu';
import { useStore } from '../state/store';
import { Button, Modal } from './ui';

// Mock wallet signing prompt. Replace the body of `onSigned` consumers with the
// real NEAR wallet-selector `signAndSendTransaction` call.
export function SignModal({
  open, onClose, onSigned, action, rows,
}: { open: boolean; onClose: () => void; onSigned: () => void; action: string; rows: { k: string; v: string }[] }) {
  const s = useStore();
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setBusy(false); }, [open]);
  const sign = () => {
    setBusy(true);
    setTimeout(() => { setBusy(false); onSigned(); }, 1100);
  };
  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title={<span className="row gap8"><LuWallet size={20} />Wallet request</span>} className="wallet-modal">
      <div className="col gap12">
        <div className="banner gold">
          <LuFingerprint size={16} />
          <div>Mock wallet. Nothing real is signed or sent. The production build opens your NEAR wallet here.</div>
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
        <div className="small muted">Signing authorizes only this action. It does not give the agent any trading permission.</div>
        <div className="row gap8">
          <Button block onClick={onClose} disabled={busy}>Reject</Button>
          <Button block variant="gold" onClick={sign} disabled={busy} icon={busy ? <LuLoader size={15} className="spin" /> : undefined}>
            {busy ? 'Signing…' : 'Approve and sign'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
