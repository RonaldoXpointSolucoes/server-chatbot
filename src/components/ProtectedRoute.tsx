import { Navigate, Outlet } from 'react-router-dom';

interface ProtectedRouteProps {
  role: 'client' | 'admin';
}

export default function ProtectedRoute({ role }: ProtectedRouteProps) {
  // Verificação de autenticação Client SaaS
  if (role === 'client') {
    const tenantId = sessionStorage.getItem('current_tenant_id');
    const tenantName = sessionStorage.getItem('current_tenant_name');
    
    // Se não estiver logado, redireciona para a tela inicial de Login corporativo
    if (!tenantId || !tenantName || tenantId === 'undefined') {
       return <Navigate to="/" replace />;
    }
    
    return <Outlet />;
  }

  // Verificação de autenticação Admin Master
  if (role === 'admin') {
    const isAdmin = sessionStorage.getItem('admin_token') === 'true';
    if (!isAdmin) {
       return <Navigate to="/admin/login" replace />;
    }
    return <Outlet />;
  }

  // Fallback seguro
  return <Navigate to="/" replace />;
}
