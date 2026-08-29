import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App';
import './index.css';

// Força atualização imediata de Service Worker e limpeza de caches obsoletos
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.update();
    }
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Quando um novo Service Worker assume o controle, recarrega suavemente se necessário
    console.log('[ConectaZap] Novo Service Worker ativo.');
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/:id" element={<App />} />
        <Route path="/connect/:id" element={<App />} />
        <Route path="/connect-instance/:id" element={<App />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
