import { Fragment, useEffect } from 'react';
import { initFx } from './fx';
import { go, useRoute } from './router';
import { Shell, Toasts } from './components/Shell';
import { connectWallet, useStore } from './state/store';
import { currentNearAccount } from './lib/near-wallet';
import Landing from './screens/Landing';
import Onboarding from './screens/Onboarding';
import Dashboard from './screens/Dashboard';
import Markets from './screens/Markets';
import AssetDetail from './screens/AssetDetail';
import OptionsChain from './screens/OptionsChain';
import TradeBuilder from './screens/TradeBuilder';
import Portfolio from './screens/Portfolio';
import PositionDetail from './screens/PositionDetail';
import Assistant from './screens/Assistant';
import Agent from './screens/Agent';
import Proposals from './screens/Proposals';
import Activity from './screens/Activity';
import Settings from './screens/Settings';

export default function App() {
  const route = useRoute();
  const s = useStore();
  const inApp = route.parts[0] === 'app';
  const allowed = s.wallet.connected || s.wallet.readOnly;

  useEffect(() => initFx(), []);
  useEffect(() => {
    let active = true;
    currentNearAccount().then((account) => {
      if (active && account) connectWallet(account, 'testnet');
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (inApp && !allowed) go('/connect', { replace: true });
  }, [inApp, allowed]);

  if (route.parts.length === 0) return (<><div className="scroll-progress" /><Landing /><Toasts /></>);
  if (route.parts[0] === 'connect') return (<><div className="scroll-progress" /><Onboarding /><Toasts /></>);
  if (!inApp) return <Landing />;
  if (!allowed) return null;

  const [, a, b, c] = route.parts;
  let page;
  switch (a) {
    case undefined: page = <Dashboard />; break;
    case 'markets':
      page = b ? (c === 'chain' ? <OptionsChain sym={b} /> : <AssetDetail sym={b} />) : <Markets />;
      break;
    case 'trade': page = <TradeBuilder />; break;
    case 'portfolio': page = b ? <PositionDetail id={b} /> : <Portfolio />; break;
    case 'assistant': page = <Assistant />; break;
    case 'agent': page = <Agent />; break;
    case 'proposals': page = <Proposals />; break;
    case 'activity': page = <Activity id={b} />; break;
    case 'settings': page = <Settings />; break;
    default: page = <Dashboard />;
  }
  return (<><div className="scroll-progress" /><Shell route={route}><Fragment key={route.path}>{page}</Fragment></Shell></>);
}
