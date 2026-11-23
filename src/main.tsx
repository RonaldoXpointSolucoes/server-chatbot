import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { setupGlobalErrorLogging } from './utils/errorLogger'

// Polyfill defensivo para WebKit/Safari no iOS (previne crash em EmptyRanges no media controller interno)
if (typeof window !== 'undefined' && !(window as any).EmptyRanges) {
  try {
    (window as any).EmptyRanges = class EmptyRanges {};
  } catch (e) {
    // Ignora se o objeto window for restrito
  }
}

// Em modo DEV (localhost), garante remoção de Service Workers legados para nunca servir bundles/queries em cache
if (import.meta.env.DEV && typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister().catch(() => {}));
  }).catch(() => {});
  if ('caches' in window) {
    caches.delete('static-resources').catch(() => {});
  }
}

// Inicializa a captura centralizada de erros no frontend
setupGlobalErrorLogging();

createRoot(document.getElementById('root')!).render(
  <App />
)
