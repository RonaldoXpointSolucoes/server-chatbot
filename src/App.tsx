import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import { ErrorBoundary } from './components/ErrorBoundary';
import ChatDashboard from './pages/ChatDashboard';
import ContactsManager from './pages/ContactsManager';
import AdminDashboard from './pages/AdminDashboard';
import AdminLogin from './pages/AdminLogin';
import ClientLogin from './pages/ClientLogin';
import BaileysFeatures from './pages/BaileysFeatures';
import InstancesDashboard from './pages/InstancesDashboard';
import KnowledgeBase from './pages/KnowledgeBase';
import InboxesList from './pages/settings/InboxesList';
import InboxSettings from './pages/settings/InboxSettings';
import AgentsList from './pages/settings/AgentsList';
import LabelsSettings from './pages/settings/LabelsSettings';
import BotsList from './pages/settings/BotsList';
import PromptBuilder from './pages/settings/PromptBuilder';
import AutomationSettings from './pages/settings/AutomationSettings';
import OperationLogs from './pages/settings/OperationLogs';
import DevLogger from './components/DevLogger';
import { InstallPWA } from './components/InstallPWA';
import { usePushNotifications } from './hooks/usePushNotifications';
import FlowManager from './pages/FlowManager';
import FlowBuilder from './pages/FlowBuilder';
import { MainLayout } from './components/MainLayout';
import SettingsLayout from './pages/settings/SettingsLayout';
import SettingsPreferences from './pages/settings/SettingsPreferences';
import SettingsCredentials from './pages/settings/SettingsCredentials';
import { CannedResponses } from './pages/CannedResponses';
import PortalApp from './pages/PortalApp';
import DeliveryApp from './pages/DeliveryApp';
import KdsApp from './pages/KdsApp';
import CardapioApp from './pages/CardapioApp';
import FinanceiroApp from './pages/FinanceiroApp';
import AccountSettings from './pages/settings/AccountSettings';

// Inicializa o tema globalmente no boot
const savedTheme = localStorage.getItem('theme') || 'light';
if (savedTheme === 'dark') {
  document.documentElement.classList.add('dark');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#111b21');
} else {
  document.documentElement.classList.remove('dark');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#f0f2f5');
}

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
            <Route path="/contacts" element={<ErrorBoundary><ContactsManager /></ErrorBoundary>} />
            <Route path="/instances" element={<InstancesDashboard />} />
            <Route path="/knowledge" element={<ErrorBoundary><KnowledgeBase /></ErrorBoundary>} />
            <Route path="/flows" element={<ErrorBoundary><FlowManager /></ErrorBoundary>} />
            <Route path="/flows/:id/edit" element={<ErrorBoundary><FlowBuilder /></ErrorBoundary>} />

            {/* Configurações Globais originais conectadas à Sidebar Principal */}
            <Route path="/settings/inboxes" element={<InboxesList />} />
            <Route path="/settings/inboxes/:id" element={<InboxSettings />} />
            <Route path="/settings/agents" element={<AgentsList />} />
            <Route path="/settings/labels" element={<LabelsSettings />} />
            <Route path="/settings/bots" element={<BotsList />} />
            <Route path="/settings/canned-responses" element={<CannedResponses />} />
            <Route path="/settings/prompt-builder" element={<PromptBuilder />} />
            <Route path="/settings/automation" element={<AutomationSettings />} />
            <Route path="/settings/logs" element={<OperationLogs />} />
            <Route path="/settings/account" element={<AccountSettings />} />

            {/* Apps Embedados */}
            <Route path="/apps/portal" element={<PortalApp />} />
            <Route path="/apps/delivery" element={<DeliveryApp />} />
            <Route path="/apps/kds" element={<KdsApp />} />
            <Route path="/apps/cardapio" element={<CardapioApp />} />
            <Route path="/apps/financeiro" element={<FinanceiroApp />} />
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
