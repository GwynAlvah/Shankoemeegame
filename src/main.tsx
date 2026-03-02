import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Global Error Catch for Debugging
window.onerror = (message, source, lineno, colno, error) => {
  // Ignore errors from browser extensions
  if (source?.toString().includes('chrome-extension://')) return;
  
  const errorDiv = document.createElement('div');
  errorDiv.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#000;color:#ef4444;padding:50px;z-index:9999;font-family:monospace;overflow:auto;';
  errorDiv.innerHTML = `<h1>CRITICAL ERROR DETECTED</h1><p>${message}</p><pre>${error?.stack || ''}</pre><button onclick="location.reload()" style="padding:10px 20px;background:#fff;color:#000;border:none;cursor:pointer;font-weight:bold;">RELOAD APPLICATION</button>`;
  document.body.appendChild(errorDiv);
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
