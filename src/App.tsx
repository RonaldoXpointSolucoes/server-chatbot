
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
        <Route path="/chat" element={<ChatDashboard />} />

        {/* Gerenciamento Master SaaS */}
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/admin/*" element={<AdminDashboard />} />

        {/* Vitrine Baileys V6 */}
        <Route path="/features" element={<BaileysFeatures />} />

        {/* Gerenciador de Instâncias */}
        <Route path="/instances" element={<InstancesDashboard />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
