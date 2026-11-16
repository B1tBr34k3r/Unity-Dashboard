import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Automatically reload on Vite dynamic import chunk mismatch (e.g. after a new deployment)
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', () => {
    const lastReload = sessionStorage.getItem('vite_preload_error_reload');
    const now = Date.now();
    if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
      sessionStorage.setItem('vite_preload_error_reload', String(now));
      window.location.reload();
    }
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
