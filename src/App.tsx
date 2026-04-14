import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import { ErrorBoundary } from './components/ErrorBoundary';
import ChatDashboard from './pages/ChatDashboard';
import AdminDashboard from './pages/AdminDashboard';
import AdminLogin from './pages/AdminLogin';
import ClientLogin from './pages/ClientLogin';
import BaileysFeatures from './pages/BaileysFeatures';
import InstancesDashboard from './pages/InstancesDashboard';
import KnowledgeBase from './pages/KnowledgeBase';
import InboxesList from './pages/settings/InboxesList';
import InboxSettings from './pages/settings/InboxSettings';
import AgentsList from './pages/settings/AgentsList';
import DevLogger from './components/DevLogger';
import { InstallPWA } from './components/InstallPWA';
import { usePushNotifications } from './hooks/usePushNotifications';
import FlowManager from './pages/FlowManager';
import FlowBuilder from './pages/FlowBuilder';
import { MainLayout } from './components/MainLayout';
import SettingsLayout from './pages/settings/SettingsLayout';
import SettingsPreferences from './pages/settings/SettingsPreferences';
import SettingsCredentials from './pages/settings/SettingsCredentials';

function PushNotificationManager() {
  usePushNotifications();
  return null;
}


// Provedor Global de Rotas
export default function App() {
  return (
    <BrowserRouter>
      <InstallPWA />
      <DevLogger />
      <PushNotificationManager />
      <Routes>
        {/* Rota do Cliente Comum */}
        <Route path="/" element={<ClientLogin />} />
        
        {/* Rotas Privadas (Client SaaS) */}
        <Route element={<ProtectedRoute role="client" />}>
          <Route element={<MainLayout />}>
            <Route path="/chat" element={<ErrorBoundary><ChatDashboard /></ErrorBoundary>} />
            <Route path="/instances" element={<InstancesDashboard />} />
            <Route path="/knowledge" element={<ErrorBoundary><KnowledgeBase /></ErrorBoundary>} />
            <Route path="/flows" element={<ErrorBoundary><FlowManager /></ErrorBoundary>} />
            <Route path="/flows/:id/edit" element={<ErrorBoundary><FlowBuilder /></ErrorBoundary>} />
            
            {/* Configurações Globais originais conectadas à Sidebar Principal */}
            <Route path="/settings/inboxes" element={<InboxesList />} />
            <Route path="/settings/inboxes/:id" element={<InboxSettings />} />
            <Route path="/settings/agents" element={<AgentsList />} />
          </Route>
          
          {/* Settings do Modulo Flow (Typebot UI) */}
          <Route path="/flows/settings" element={<SettingsLayout />}>
             <Route index element={<Navigate to="preferences" replace />} />
             <Route path="preferences" element={<SettingsPreferences />} />
             <Route path="credentials" element={<SettingsCredentials />} />
          </Route>
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
