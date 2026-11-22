import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { initDevicePerfTier } from './utils/devicePerfTier';
import { initPwaAutoUpdate } from './utils/pwaAutoUpdate';
import { initPwaInstallCapture } from './utils/registerSw';

initDevicePerfTier();
initPwaInstallCapture();
initPwaAutoUpdate();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
