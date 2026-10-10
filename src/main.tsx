import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { readConfig } from './app/config';
import { registerServiceWorker } from './app/registerServiceWorker';
import { createAppServices } from './app/services';
import { clearLegacySession } from './auth/tokenStore';
import './styles/app.css';

clearLegacySession();
const config = readConfig(import.meta.env, window.location.origin);
const services = createAppServices(config);

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

if (import.meta.env.PROD) registerServiceWorker(import.meta.env.BASE_URL);

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App services={services} />
  </React.StrictMode>,
);
