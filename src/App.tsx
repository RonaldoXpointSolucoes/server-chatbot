import { Suspense, lazy, ComponentType } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import { ErrorBoundary } from './components/ErrorBoundary';
import ChatDashboard from './pages/ChatDashboard';
import ClientLogin from './pages/ClientLogin';
import DevLogger from './components/DevLogger';
import { InstallPWA } from './components/InstallPWA';
import { UpdatePrompt } from './components/UpdatePrompt';
import { usePushNotifications } from './hooks/usePushNotifications';
import { MainLayout } from './components/MainLayout';
import { NetworkStatusToast } from './components/NetworkStatusToast';
import { GlobalToast } from './components/GlobalToast';

function lazyWithRetry<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>): React.LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      return await factory();
    } catch (error: any) {
      const msg = String(error?.message || '');
      const isChunkError =
        msg.includes('Failed to fetch dynamically imported module') ||
        msg.includes('Importing a module script failed') ||
        msg.includes('Unable to preload CSS');
      if (isChunkError && !sessionStorage.getItem('lazy_chunk_reloaded')) {
        sessionStorage.setItem('lazy_chunk_reloaded', '1');
        window.location.reload();
      }
      throw error;
    }
  });
}

const ContactsManager = lazyWithRetry(() => import('./pages/ContactsManager'));
const CrmDashboard = lazyWithRetry(() => import('./pages/CrmDashboard'));
const CrmKanban = lazyWithRetry(() => import('./pages/CrmKanban'));
const AdminDashboard = lazyWithRetry(() => import('./pages/AdminDashboard'));
const AdminLogin = lazyWithRetry(() => import('./pages/AdminLogin'));
const BaileysFeatures = lazyWithRetry(() => import('./pages/BaileysFeatures'));
const InstancesDashboard = lazyWithRetry(() => import('./pages/InstancesDashboard'));
const KnowledgeBase = lazyWithRetry(() => import('./pages/KnowledgeBase'));
const HelpCenter = lazyWithRetry(() => import('./pages/HelpCenter'));
const InboxesList = lazyWithRetry(() => import('./pages/settings/InboxesList'));
const InboxSettings = lazyWithRetry(() => import('./pages/settings/InboxSettings'));
const InstanceSettings = lazyWithRetry(() => import('./pages/settings/InstanceSettings'));
const AgentsList = lazyWithRetry(() => import('./pages/settings/AgentsList'));
const LabelsSettings = lazyWithRetry(() => import('./pages/settings/LabelsSettings'));
const BotsList = lazyWithRetry(() => import('./pages/settings/BotsList'));
const FlowManager = lazyWithRetry(() => import('./pages/FlowManager'));
const FlowBuilder = lazyWithRetry(() => import('./pages/FlowBuilder'));
const PromptBuilder = lazyWithRetry(() => import('./pages/settings/PromptBuilder'));
const AutomationSettings = lazyWithRetry(() => import('./pages/settings/AutomationSettings'));
const OperationLogs = lazyWithRetry(() => import('./pages/settings/OperationLogs'));
const CannedResponses = lazyWithRetry(() => import('./pages/CannedResponses').then(m => ({ default: m.CannedResponses })));
const PortalApp = lazyWithRetry(() => import('./pages/PortalApp'));
const DeliveryApp = lazyWithRetry(() => import('./pages/DeliveryApp'));
const KdsApp = lazyWithRetry(() => import('./pages/KdsApp'));
const CardapioApp = lazyWithRetry(() => import('./pages/CardapioApp'));
const FinanceiroApp = lazyWithRetry(() => import('./pages/FinanceiroApp'));
const AccountSettings = lazyWithRetry(() => import('./pages/settings/AccountSettings'));
const Integrations = lazyWithRetry(() => import('./pages/settings/Integrations'));
const ScheduleManager = lazyWithRetry(() => import('./pages/ScheduleManager').then(m => ({ default: m.ScheduleManager })));
const ChecklistDashboard = lazyWithRetry(() => import('./pages/checklist/ChecklistDashboard'));
const ChecklistBuilder = lazyWithRetry(() => import('./pages/checklist/ChecklistBuilder'));
const ChecklistTablet = lazyWithRetry(() => import('./pages/checklist/ChecklistTablet'));
const ChecklistSettings = lazyWithRetry(() => import('./pages/checklist/ChecklistSettings'));
const InstanceManagerStandalone = lazyWithRetry(() => import('./pages/InstanceManagerStandalone'));
const ConnectInstanceStandalone = lazyWithRetry(() => import('./pages/ConnectInstanceStandalone'));
const VoucherDashboard = lazyWithRetry(() => import('./pages/voucher/VoucherDashboard'));
const VoucherViewer = lazyWithRetry(() => import('./pages/voucher/VoucherViewer'));
const VoucherScanner = lazyWithRetry(() => import('./pages/voucher/VoucherScanner'));
const CompanyPortalLogin = lazyWithRetry(() => import('./pages/voucher/CompanyPortalLogin'));
const CompanyPortalDashboard = lazyWithRetry(() => import('./pages/voucher/CompanyPortalDashboard'));
const TechnicalDocumentationPage = lazyWithRetry(() => import('./pages/TechnicalDocumentationPage'));

function RouteLoadingFallback() {
  return (
    <div className="flex h-full min-h-[50vh] w-full items-center justify-center bg-transparent">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
    </div>
  );
}

// Inicializa o tema globalmente no boot
const savedTheme = localStorage.getItem('theme') || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
const isDark = savedTheme === 'dark';
if (isDark) {
  document.documentElement.classList.add('dark');
} else {
  document.documentElement.classList.remove('dark');
}
const bootThemeColor = isDark ? '#202c33' : '#f0f2f5';
document.querySelectorAll('meta[name="theme-color"]').forEach(el => el.setAttribute('content', bootThemeColor));
document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', isDark ? 'dark' : 'light');
document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.setAttribute('content', isDark ? 'black-translucent' : 'default');

function PushNotificationManager() {
  usePushNotifications();
  return null;
}

// Roteador Raiz Inteligente (Detecta se o acesso é via domínio de voucher ou Totem Cozinha instalado em modo PWA)
function RootRouter() {
  const hostname = window.location.hostname.toLowerCase();
  const isVoucherDomain = hostname.includes('voucher') || hostname.includes('xpointsolucoes') && hostname.includes('voucher') || hostname.startsWith('vch.') || hostname.startsWith('vouchers.');

  if (isVoucherDomain) {
    try {
      const activeSession = sessionStorage.getItem('active_company_session') || localStorage.getItem('active_company_session');
      if (activeSession) {
        const parsed = JSON.parse(activeSession);
        if (parsed?.id) {
          return <CompanyPortalDashboard />;
        }
      }
    } catch (_) {}
    return <CompanyPortalLogin />;
  }

  // Na rota raiz (/), garante sempre a abertura do App Principal (Chat no Celular / Login).
  // O PWA do Tablet da Cozinha possui rota própria isolada (/totem-cozinha).
  try {
    localStorage.removeItem('totem_standalone_mode');
  } catch (_) {}

  if (window.location.search.includes('totem=1')) {
    return (
      <ErrorBoundary>
        <ChecklistTablet />
      </ErrorBoundary>
    );
  }

  return <ClientLogin />;
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
      <Suspense fallback={<RouteLoadingFallback />}>
      <Routes>
        {/* Rota Raiz Inteligente (ChatBoot vs Portal Voucher Corporativo vs Totem Cozinha PWA) */}
        <Route path="/" element={<RootRouter />} />
        <Route path="/login" element={<ClientLogin />} />

        {/* Rotas Exclusivas e Autônomas do Totem Cozinha (PWA Android para Tablet sem exigir login administrativo) */}
        <Route path="/totem-cozinha" element={<ErrorBoundary><ChecklistTablet /></ErrorBoundary>} />
        <Route path="/totem-cozinha/:tenantIdParam" element={<ErrorBoundary><ChecklistTablet /></ErrorBoundary>} />
        <Route path="/totem" element={<ErrorBoundary><ChecklistTablet /></ErrorBoundary>} />
        <Route path="/totem/:tenantIdParam" element={<ErrorBoundary><ChecklistTablet /></ErrorBoundary>} />
        <Route path="/checklist/tablet" element={<ErrorBoundary><ChecklistTablet /></ErrorBoundary>} />

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
            <Route path="/docs" element={<ErrorBoundary><TechnicalDocumentationPage /></ErrorBoundary>} />


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

            {/* Módulo de Fluxos e Typebot */}
            <Route path="/flows" element={<FlowManager />} />

            {/* Rotas Nativas do Módulo de Checklists Operacionais (Tema Administrativo) */}
            <Route path="/checklist/dashboard" element={<ErrorBoundary><ChecklistDashboard /></ErrorBoundary>} />
            <Route path="/checklist/builder" element={<ErrorBoundary><ChecklistBuilder /></ErrorBoundary>} />
            <Route path="/checklist/settings" element={<ErrorBoundary><ChecklistSettings /></ErrorBoundary>} />

            {/* Módulo de Vouchers Digitais Corporativos */}
            <Route path="/vouchers" element={<ErrorBoundary><VoucherDashboard /></ErrorBoundary>} />
            <Route path="/voucher-gestao" element={<ErrorBoundary><VoucherDashboard /></ErrorBoundary>} />

            {/* Apps Embedados */}
            <Route path="/apps/portal" element={<PortalApp />} />
            <Route path="/apps/delivery" element={<DeliveryApp />} />
            <Route path="/apps/kds" element={<KdsApp />} />
            <Route path="/apps/cardapio" element={<CardapioApp />} />
            <Route path="/apps/financeiro" element={<FinanceiroApp />} />
            <Route path="/apps/agenda" element={<ScheduleManager />} />
          </Route>

          {/* FlowBuilder Fullscreen (Experiência Imersiva Estilo Typebot Original) */}
          <Route path="/flows/:id/edit" element={<ErrorBoundary><FlowBuilder /></ErrorBoundary>} />
        </Route>

        {/* Rotas Públicas do Módulo Voucher (Colaborador e Caixa) */}
        <Route path="/voucher/:token" element={<VoucherViewer />} />
        <Route path="/voucher-scanner" element={<VoucherScanner />} />
        <Route path="/voucher-validar" element={<VoucherScanner />} />

        {/* Portal B2B Exclusivo de Empresas Parceiras (Gestão de Crédito e Auto-Emissão) */}
        <Route path="/voucher-empresa/login" element={<CompanyPortalLogin />} />
        <Route path="/voucher-empresa" element={<CompanyPortalDashboard />} />
        <Route path="/portal-empresa" element={<CompanyPortalDashboard />} />
        <Route path="/voucher-b2b" element={<CompanyPortalLogin />} />
        <Route path="/empresa/login" element={<CompanyPortalLogin />} />
        <Route path="/empresa" element={<CompanyPortalLogin />} />

        {/* Gerenciamento Master SaaS */}
        <Route path="/admin/login" element={<AdminLogin />} />

        {/* Rotas Privadas (App Master Admin) */}
        <Route element={<ProtectedRoute role="admin" />}>
          <Route path="/admin/*" element={<AdminDashboard />} />
        </Route>

        {/* Gerenciador Autônomo de Instâncias Master */}
        <Route path="/instance-manager" element={<InstanceManagerStandalone />} />

        {/* Conexão Direta Standalone (Pública, sem necessidade de login) */}
        <Route path="/connect-instance/:id" element={<ConnectInstanceStandalone />} />
        <Route path="/connect-instance" element={<ConnectInstanceStandalone />} />

        {/* Vitrine Baileys V6 */}
        <Route path="/features" element={<BaileysFeatures />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
