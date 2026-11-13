import { StrictMode } from 'react';
import { Buffer } from 'buffer';

// NEAR wallet-selector dependencies expect the Node Buffer global in browsers.
Object.assign(globalThis, { Buffer });
import { createRoot } from 'react-dom/client';
const { default: App } = await import('./App');
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
