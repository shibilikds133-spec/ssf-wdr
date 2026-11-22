import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import { initPwaAutoUpdate } from './utils/pwaAutoUpdate';
import { initPwaInstallCapture } from './utils/registerSw';

initPwaInstallCapture();
initPwaAutoUpdate();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
