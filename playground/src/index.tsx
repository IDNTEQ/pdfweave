import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import * as Sentry from '@sentry/react';
import './index.css';
import App from './App';

// Initialize Sentry
Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN || '',
});

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');
const root = createRoot(container);

// Strip the trailing slash from Vite's BASE_URL so React Router's
// basename has the right shape (e.g. '/pdfweave' for prod under
// GitHub Pages, '' for root-hosted dev).
const basename = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');

root.render(
  <React.StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
