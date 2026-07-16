import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import { ErrorBoundary } from './components/ErrorBoundary';
import ChatDashboard from './pages/ChatDashboard';
import ContactsManager from './pages/ContactsManager';
import CrmDashboard from './pages/CrmDashboard';
import CrmKanban from './pages/CrmKanban';
import AdminDashboard from './pages/AdminDashboard';
import AdminLogin from './pages/AdminLogin';
import ClientLogin from './pages/ClientLogin';
import BaileysFeatures from './pages/BaileysFeatures';
import InstancesDashboard from './pages/InstancesDashboard';
import KnowledgeBase from './pages/KnowledgeBase';
import HelpCenter from './pages/HelpCenter';
import InboxesList from './pages/settings/InboxesList';
import InboxSettings from './pages/settings/InboxSettings';
import InstanceSettings from './pages/settings/InstanceSettings';
import AgentsList from './pages/settings/AgentsList';
import LabelsSettings from './pages/settings/LabelsSettings';
import BotsList from './pages/settings/BotsList';
import PromptBuilder from './pages/settings/PromptBuilder';
import AutomationSettings from './pages/settings/AutomationSettings';
import OperationLogs from './pages/settings/OperationLogs';
import DevLogger from './components/DevLogger';
import { InstallPWA } from './components/InstallPWA';
import { UpdatePrompt } from './components/UpdatePrompt';
import { usePushNotifications } from './hooks/usePushNotifications';
import { MainLayout } from './components/MainLayout';
import { CannedResponses } from './pages/CannedResponses';
import PortalApp from './pages/PortalApp';
import DeliveryApp from './pages/DeliveryApp';
import KdsApp from './pages/KdsApp';
import CardapioApp from './pages/CardapioApp';
import FinanceiroApp from './pages/FinanceiroApp';
import AccountSettings from './pages/settings/AccountSettings';
import Integrations from './pages/settings/Integrations';
import { ScheduleManager } from './pages/ScheduleManager';
import ChecklistDashboard from './pages/checklist/ChecklistDashboard';
import ChecklistBuilder from './pages/checklist/ChecklistBuilder';
import ChecklistTablet from './pages/checklist/ChecklistTablet';
import ChecklistSettings from './pages/checklist/ChecklistSettings';
import { NetworkStatusToast } from './components/NetworkStatusToast';
import { GlobalToast } from './components/GlobalToast';

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
      <UpdatePrompt />
      <InstallPWA />
      <DevLogger />
      <PushNotificationManager />
      <NetworkStatusToast />
      <GlobalToast />
      <Routes>
        {/* Rota do Cliente Comum */}
        <Route path="/" element={<ClientLogin />} />

        {/* Rotas Privadas (Client SaaS) */}
        <Route element={<ProtectedRoute role="client" />}>
          <Route element={<MainLayout />}>
            <Route path="/chat" element={<ErrorBoundary><ChatDashboard /></ErrorBoundary>} />
            <Route path="/chat/closed-tickets" element={<ErrorBoundary><ChatDashboard /></ErrorBoundary>} />
            <Route path="/contacts" element={<ErrorBoundary><ContactsManager /></ErrorBoundary>} />
            <Route path="/crm" element={<ErrorBoundary><CrmDashboard /></ErrorBoundary>} />
            <Route path="/crm/kanban/:id" element={<ErrorBoundary><CrmKanban /></ErrorBoundary>} />
            <Route path="/instances" element={<InstancesDashboard />} />
            <Route path="/instances/:id/settings" element={<InstanceSettings />} />
            <Route path="/knowledge" element={<ErrorBoundary><KnowledgeBase /></ErrorBoundary>} />
            <Route path="/help" element={<HelpCenter />} />


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
            <Route path="/settings/integrations" element={<Integrations />} />

            {/* Rotas Nativas do Módulo de Checklists Operacionais (Tema Administrativo) */}
            <Route path="/checklist/dashboard" element={<ErrorBoundary><ChecklistDashboard /></ErrorBoundary>} />
            <Route path="/checklist/builder" element={<ErrorBoundary><ChecklistBuilder /></ErrorBoundary>} />
            <Route path="/checklist/settings" element={<ErrorBoundary><ChecklistSettings /></ErrorBoundary>} />

            {/* Apps Embedados */}
            <Route path="/apps/portal" element={<PortalApp />} />
            <Route path="/apps/delivery" element={<DeliveryApp />} />
            <Route path="/apps/kds" element={<KdsApp />} />
            <Route path="/apps/cardapio" element={<CardapioApp />} />
            <Route path="/apps/financeiro" element={<FinanceiroApp />} />
            <Route path="/apps/agenda" element={<ScheduleManager />} />
          </Route>

          {/* Rota Blindada de Operador (Sem Sidebar para tablets de cozinha compartilhados) */}
          <Route path="/checklist/tablet" element={<ErrorBoundary><ChecklistTablet /></ErrorBoundary>} />

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
