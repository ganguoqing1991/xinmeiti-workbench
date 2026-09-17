import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './app';
import ErrorBoundary from './components/ErrorBoundary';
import { WorkspaceProvider } from './store/workspace';
import './index.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root container not found');

createRoot(container).render(
  <React.StrictMode>
    {/* 最外层兜底：布局本身崩了也不至于整页白屏 */}
    <ErrorBoundary scope="app">
      <BrowserRouter>
        <WorkspaceProvider>
          <App />
        </WorkspaceProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
