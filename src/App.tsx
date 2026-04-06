
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import { ErrorBoundary } from './components/ErrorBoundary';
import ChatDashboard from './pages/ChatDashboard';
import AdminDashboard from './pages/AdminDashboard';
import AdminLogin from './pages/AdminLogin';
import ClientLogin from './pages/ClientLogin';
import BaileysFeatures from './pages/BaileysFeatures';
import InstancesDashboard from './pages/InstancesDashboard';
import DevLogger from './components/DevLogger';

// Provedor Global de Rotas
export default function App() {
  return (
    <BrowserRouter>
      <DevLogger />
      <Routes>
        {/* Rota do Cliente Comum */}
        <Route path="/" element={<ClientLogin />} />
        
        {/* Rotas Privadas (Client SaaS) */}
        <Route element={<ProtectedRoute role="client" />}>
          <Route path="/chat" element={<ErrorBoundary><ChatDashboard /></ErrorBoundary>} />
          <Route path="/instances" element={<InstancesDashboard />} />
        </Route>

        {/* Gerenciamento Master SaaS */}
        <Route path="/admin/login" element={<AdminLogin />} />
        
        {/* Rotas Privadas (App Master Admin) */}
        <Route element={<ProtectedRoute role="admin" />}>
          <Route path="/admin/*" element={<AdminDashboard />} />
        </Route>

        {/* Vitrine Baileys V6 */}
        <Route path="/features" element={<BaileysFeatures />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
