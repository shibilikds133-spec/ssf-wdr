import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import {
  initPwaInstallCapture,
  registerServiceWorker,
} from './utils/registerSw';

initPwaInstallCapture();
registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
