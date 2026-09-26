import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Immediately clean up local storage and caches every time the user enters the app,
// ensuring the app always loads fresh data directly from the database.
try {
  localStorage.clear();
  sessionStorage.clear();
} catch (e) {
  console.warn('Storage cleanup notice:', e);
}

// Unregister any stale service workers or browser caches to guarantee latest code version
if (typeof window !== 'undefined') {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
      for (const registration of registrations) {
        registration.unregister();
      }
    }).catch(() => {});
  }
  if ('caches' in window) {
    caches.keys().then(names => {
      for (const name of names) {
        caches.delete(name);
      }
    }).catch(() => {});
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
