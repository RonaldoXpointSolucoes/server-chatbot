import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ArrowRight, Loader2, AlertCircle, Terminal, X, ChevronRight, Eye, EyeOff, Camera, ShieldCheck, KeyRound, UserCheck, RefreshCw } from 'lucide-react';
import { supabase } from '../services/supabase';
import ThemeToggle from '../components/ThemeToggle';
import { useChatStore } from '../store/chatStore';
import { geminiService } from '../services/geminiService';

export default function ClientLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [keepLogged, setKeepLogged] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  // Antigravity Dev Logger State
  const [devLogs, setDevLogs] = useState<{timestamp: string, step: string, details: any, type: 'info' | 'error' | 'success'}[]>([]);

  const addDevLog = (step: string, details: any, type: 'info' | 'error' | 'success' = 'info') => {
    setDevLogs(prev => [...prev, {
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 }),
      step,
      details,
      type
    }]);
  };

  // Estados do Face ID Premium
  const [faceIdActive, setFaceIdActive] = useState(false);
  const [faceEmail, setFaceEmail] = useState('');
  const [faceEmailStep, setFaceEmailStep] = useState(true);
  const [cameraActive, setCameraActive] = useState(false);
  const [faceScanning, setFaceScanning] = useState(false);
  const [faceRegisterModal, setFaceRegisterModal] = useState<{ email: string, pwdPlain: string } | null>(null);
  const [showFaceSuccess, setShowFaceSuccess] = useState(false);
  const [faceVerifyError, setFaceVerifyError] = useState('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Cifragem Simples Simétrica Ofuscada (XOR + Base64) usando chave baseada no email invertido
  const getCipherKey = (emailStr: string) => {
    return emailStr.split('').reverse().join('') + 'XP-FaceSecure-2026';
  };

  const encryptPassword = (pwd: string, emailStr: string) => {
    const key = getCipherKey(emailStr);
    let result = "";
    for (let i = 0; i < pwd.length; i++) {
      const charCode = pwd.charCodeAt(i) ^ key.charCodeAt(i % key.length);
      result += String.fromCharCode(charCode);
    }
    return btoa(result);
  };

  const decryptPassword = (encrypted: string, emailStr: string) => {
    try {
      const key = getCipherKey(emailStr);
      const raw = atob(encrypted);
      let result = "";
      for (let i = 0; i < raw.length; i++) {
        const charCode = raw.charCodeAt(i) ^ key.charCodeAt(i % key.length);
        result += String.fromCharCode(charCode);
      }
      return result;
    } catch (e) {
      return "";
    }
  };

  const startCamera = async () => {
    try {
      setFaceVerifyError('');
      addDevLog('CAMERA_INIT', "Iniciando captura de vídeo nativa...", 'info');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 480, height: 480 }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // Garante a reprodução do vídeo para evitar tela preta em alguns browsers do Windows
        await videoRef.current.play();
      }
      addDevLog('CAMERA_SUCCESS', "Câmera conectada e transmitindo!", 'success');
    } catch (err: any) {
      console.error("Erro ao iniciar câmera para Face ID:", err);
      addDevLog('CAMERA_ERROR', err.message || String(err), 'error');
      setFaceVerifyError("Não foi possível acessar a câmera. Verifique as permissões de vídeo.");
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    setFaceScanning(false);
  };

  const handleFaceLogin = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    setFaceScanning(true);
    setFaceVerifyError('');

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (context) {
        canvas.width = 480;
        canvas.height = 480;
        context.translate(480, 0);
        context.scale(-1, 1);
        context.drawImage(video, 0, 0, 480, 480);
        context.setTransform(1, 0, 0, 1, 0, 0);
      }

      const capPhotoBase64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];

      addDevLog('FACE_AUTH_FETCH', `Buscando biometria de Face ID para o e-mail: ${faceEmail.trim().toLowerCase()}`, 'info');
      const { data: faceRecord, error: fetchError } = await supabase
        .from('face_auth')
        .select('*')
        .eq('email', faceEmail.trim().toLowerCase())
        .maybeSingle();

      if (fetchError || !faceRecord) {
        addDevLog('FACE_AUTH_NOT_FOUND', `Nenhuma biometria cadastrada para: ${faceEmail.trim()}`, 'error');
        setFaceVerifyError("Nenhuma biometria facial encontrada para este e-mail.");
        setFaceScanning(false);
        return;
      }

      addDevLog('GEMINI_FACE_COMPARE', "Enviando biometria para a IA validar similaridade de face...", 'info');
      const compareResult = await geminiService.compareFaces(capPhotoBase64, faceRecord.face_photo_base64);

      addDevLog('GEMINI_FACE_RESULT', compareResult, 'info');

      if (compareResult.verified && compareResult.confidence >= 80) {
        addDevLog('FACE_AUTH_SUCCESS', `Face ID Verificado com ${compareResult.confidence}% de certeza!`, 'success');
        stopCamera();
        setFaceIdActive(false);

        const decryptedPwd = decryptPassword(faceRecord.encrypted_password, faceEmail.trim().toLowerCase());
        
        if (!decryptedPwd) {
           setErrorMsg("Erro de segurança ao decifrar a biometria cadastrada.");
           return;
        }

        setEmail(faceEmail.trim().toLowerCase());
        setPassword(decryptedPwd);
        
        setIsLoading(true);
        setErrorMsg('');
        useChatStore.getState().clearStore();

        const { data: authResult, error: authError } = await supabase.rpc('check_login', {
          p_email: faceEmail.trim().toLowerCase(),
          p_password: decryptedPwd
        });

        if (authError || !authResult) {
           setErrorMsg("Erro de sincronização de credenciais de Face ID.");
           setIsLoading(false);
           return;
        }

        let tenantData = null;
        let userRole = 'admin';
        let allowedInstances = null;
        let allowedCompanies = null;
        let userName = '';

        if (authResult.type === 'admin') {
           tenantData = authResult.user;
           userName = authResult.user.name;
           userRole = 'admin';
           
           // Busca o nome real do administrador na tabela tenant_users
           try {
              const { data: userProfile } = await supabase
                .from('tenant_users')
                .select('full_name')
                .eq('email', authResult.user.email)
                .maybeSingle();
                
              if (userProfile && userProfile.full_name) {
                 userName = userProfile.full_name;
              }
           } catch (err) {
              console.error("Erro ao buscar perfil real do admin no Face ID:", err);
           }
        } else if (authResult.type === 'agent') {
           tenantData = authResult.parent;
           userName = authResult.user.full_name;
           userRole = authResult.user.role;
           allowedInstances = authResult.user.allowed_instances || [];
           allowedCompanies = authResult.user.allowed_companies || [];
        }

        const { error: signInError } = await supabase.auth.signInWithPassword({
           email: faceEmail.trim().toLowerCase(),
           password: decryptedPwd
        });

        if (signInError) {
           setErrorMsg("Erro de sincronia de sessão do Face ID no Auth.");
           setIsLoading(false);
           return;
        }

        const storage = localStorage;
        storage.setItem('current_tenant_id', tenantData.id);
        storage.setItem('current_tenant_name', tenantData.name);
        storage.setItem('current_user_name', userName);
        storage.setItem('current_user_role', userRole);
        storage.setItem('current_user_email', faceEmail.trim().toLowerCase());
        storage.setItem('allowed_instances', JSON.stringify(allowedInstances || []));
        storage.setItem('allowed_companies', JSON.stringify(allowedCompanies || []));

        navigate('/chat', { replace: true });
      } else {
        addDevLog('FACE_AUTH_FAILED', `Reconhecimento falhou. Similaridade de apenas ${compareResult.confidence}%.`, 'error');
        setFaceVerifyError("Rosto não reconhecido. Aproxime mais da câmera e tente novamente.");
        setFaceScanning(false);
      }
    } catch (e: any) {
      console.error(e);
      addDevLog('FACE_AUTH_EXCEPTION', e.message || e, 'error');
      setFaceVerifyError("Erro temporário ao processar reconhecimento facial.");
      setFaceScanning(false);
    }
  };

  const handleRegisterFace = async () => {
    if (!videoRef.current || !canvasRef.current || !faceRegisterModal) return;
    setFaceScanning(true);
    setFaceVerifyError('');

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (context) {
        canvas.width = 480;
        canvas.height = 480;
        context.translate(480, 0);
        context.scale(-1, 1);
        context.drawImage(video, 0, 0, 480, 480);
        context.setTransform(1, 0, 0, 1, 0, 0);
      }

      const photoBase64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1];
      const encryptedPwd = encryptPassword(faceRegisterModal.pwdPlain, faceRegisterModal.email);

      addDevLog('REGISTER_FACE_SAVE', `Registrando biometria facial no banco para: ${faceRegisterModal.email}`, 'info');

      const { error: insertError } = await supabase.from('face_auth').upsert({
        email: faceRegisterModal.email,
        face_photo_base64: photoBase64,
        encrypted_password: encryptedPwd
      }, { onConflict: 'email' });

      if (insertError) {
        addDevLog('REGISTER_FACE_ERROR', insertError.message || JSON.stringify(insertError), 'error');
        setFaceVerifyError("Erro ao salvar biometria facial no banco de dados.");
        setFaceScanning(false);
        return;
      }

      addDevLog('REGISTER_FACE_SUCCESS', "Biometria cadastrada com absoluto sucesso!", 'success');
      stopCamera();
      setShowFaceSuccess(true);
      
      setTimeout(() => {
        setFaceRegisterModal(null);
        navigate('/chat', { replace: true });
      }, 2000);
    } catch (e: any) {
      console.error(e);
      setFaceVerifyError("Falha ao registrar biometria facial.");
      setFaceScanning(false);
    }
  };

  const navigate = useNavigate();

  // Redireciona automaticamente se já estiver logado (e com todos os dados essenciais)
  useEffect(() => {
    const tenantId = localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id');
    const tenantName = localStorage.getItem('current_tenant_name') || sessionStorage.getItem('current_tenant_name');
    
    if (tenantId && tenantId !== 'undefined' && tenantName && tenantName !== 'undefined') {
      navigate('/chat', { replace: true });
    } else if (tenantId) {
      // Limpa dados parciais para evitar loop de redirecionamento com ProtectedRoute
      localStorage.removeItem('current_tenant_id');
      sessionStorage.removeItem('current_tenant_id');
    }
  }, [navigate]);

  // Controle reativo robusto para iniciar/parar a câmera baseado no estado ativo do modal
  useEffect(() => {
    if (cameraActive) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [cameraActive]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!email.trim() || !password.trim()) return;

    setIsLoading(true);
    setErrorMsg('');
    setDevLogs([]); // Limpa logs anteriores
    useChatStore.getState().clearStore(); // Limpa store global antes do login

    try {
      addDevLog('INIT', `Iniciando login flow para: ${email.trim()}`, 'info');

      let tenantData = null;
      let userRole = 'admin';
      let allowedInstances = null;
      let allowedCompanies = null;
      let userName = '';

      // Tenta fazer o login usando a procedure segura (bypassa o RLS de companies)
      addDevLog('AUTH_RPC_START', 'Invocando procedure segura de login (check_login)...', 'info');
      const { data: authResult, error: authError } = await supabase.rpc('check_login', {
        p_email: email.trim().toLowerCase(),
        p_password: password.trim()
      });

      if (authError) {
         addDevLog('AUTH_RPC_ERROR', authError.message || JSON.stringify(authError), 'error');
         setErrorMsg('Erro interno no servidor ao validar credenciais.');
         setIsLoading(false);
         return;
      }

      if (!authResult) {
         addDevLog('AUTH_RPC_NOT_FOUND', 'Nenhuma credencial válida encontrada no banco.', 'error');
         setErrorMsg('E-mail ou senha inválidos.');
         setIsLoading(false);
         return;
      }

      addDevLog('AUTH_RPC_SUCCESS', `Login bem-sucedido via RPC. Tipo: ${authResult.type}`, 'success');

      if (authResult.type === 'admin') {
         tenantData = authResult.user;
         userName = authResult.user.name;
         userRole = 'admin';
      } else if (authResult.type === 'agent') {
         if (!authResult.parent) {
            addDevLog('FETCH_PARENT_COMPANY_NOT_FOUND', 'Empresa matriz não encontrada para o agente.', 'error');
            setErrorMsg('Configuração inválida. A empresa matriz foi excluída ou desativada.');
            setIsLoading(false);
            return;
         }
         tenantData = authResult.parent;
         userName = authResult.user.full_name;
         userRole = authResult.user.role;
         allowedInstances = authResult.user.allowed_instances || [];
         allowedCompanies = authResult.user.allowed_companies || [];
         
         if (allowedCompanies.length === 0) {
            addDevLog('NO_ALLOWED_COMPANIES', 'Agente não tem empresas permitidas.', 'error');
            setErrorMsg('Você não tem acesso a nenhuma empresa. Contate o administrador.');
            setIsLoading(false);
            return;
         }

         if (!allowedCompanies.includes(tenantData.id)) {
            // Se a empresa principal (matriz) não estiver nas permitidas, pega a primeira permitida.
            // O nome real será carregado pelo MainSidebar.tsx depois do login.
            tenantData = { id: allowedCompanies[0], name: "Carregando..." };
         }
      }

      if (tenantData.status === 'suspended') {
        addDevLog('LOGIN_VALIDATION_FAILED', 'Acesso bloqueado: Status da empresa é suspended.', 'error');
        setErrorMsg('Acesso bloqueado. Contate o administrador.');
        setIsLoading(false);
        return;
      }
      
      addDevLog('SUPABASE_AUTH_START', 'Iniciando sessão real no Supabase Auth...', 'info');
      const { error: signInError } = await supabase.auth.signInWithPassword({
         email: email.trim().toLowerCase(),
         password: password.trim()
      });

      if (signInError) {
         addDevLog('SUPABASE_AUTH_ERROR', signInError.message, 'error');
         setErrorMsg('Erro de sincronia de sessão. Senha pode estar incorreta no Auth. Contate o suporte.');
         setIsLoading(false);
         return;
      }

      addDevLog('LOGIN_SUCCESS', 'Processo de login concluído com sucesso. Redirecionando para o painel...', 'success');


      // Limpa dados antigos para evitar conflitos entre local e session storage
      localStorage.removeItem('current_tenant_id');
      localStorage.removeItem('current_tenant_name');
      localStorage.removeItem('current_user_name');
      localStorage.removeItem('current_user_role');
      localStorage.removeItem('allowed_instances');
      localStorage.removeItem('allowed_companies');
      
      sessionStorage.removeItem('current_tenant_id');
      sessionStorage.removeItem('current_tenant_name');
      sessionStorage.removeItem('current_user_name');
      sessionStorage.removeItem('current_user_role');
      sessionStorage.removeItem('allowed_instances');
      sessionStorage.removeItem('allowed_companies');

      const storage = keepLogged ? localStorage : sessionStorage;
      storage.setItem('current_tenant_id', tenantData.id);
      storage.setItem('current_tenant_name', tenantData.name);
      storage.setItem('current_user_name', userName);
      storage.setItem('current_user_role', userRole);
      storage.setItem('current_user_email', email.trim().toLowerCase());
      
      // RBAC Global: Salva as instâncias e empresas permitidas independentemente do papel
      storage.setItem('allowed_instances', JSON.stringify(allowedInstances || []));
      storage.setItem('allowed_companies', JSON.stringify(allowedCompanies || []));

      // Checa se o usuário tem Face ID cadastrado no banco de dados para sugerir cadastro pós-login
      addDevLog('CHECK_FACE_EXISTENCE', 'Verificando se o usuário já possui cadastro de Face ID...', 'info');
      const { data: faceRecord, error: faceCheckError } = await supabase
        .from('face_auth')
        .select('id')
        .eq('email', email.trim().toLowerCase())
        .maybeSingle();

      if (faceCheckError) {
        addDevLog('CHECK_FACE_ERROR', faceCheckError.message, 'warning');
      }

      if (!faceRecord) {
        addDevLog('FACE_AUTH_OFFER', `Usuário logado com sucesso. Sugerindo Face ID...`, 'info');
        setFaceRegisterModal({ email: email.trim().toLowerCase(), pwdPlain: password.trim() });
        setIsLoading(false);
      } else {
        addDevLog('LOGIN_SUCCESS_FINAL', 'Processo de login concluído com sucesso. Redirecionando...', 'success');
        navigate('/chat', { replace: true });
      }
    } catch (err) {
      addDevLog('UNHANDLED_EXCEPTION', err, 'error');
      console.error(err);
      setErrorMsg('Erro de conexão com o banco de dados.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[100dvh] bg-[#f0f2f5] dark:bg-[#111b21] font-sans relative p-4 lg:p-8">
      <div className="absolute top-6 right-6">
         <ThemeToggle />
      </div>
      <div className="w-full max-w-sm p-8 bg-white dark:bg-[#202c33] rounded-3xl shadow-xl animate-in slide-in-from-bottom-4 fade-in duration-500">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mb-4 text-blue-500">
             <Building2 size={32} />
          </div>
          <h1 className="text-2xl font-bold text-[#111b21] dark:text-[#e9edef]">Workspace Login</h1>
          <p className="text-[#54656f] text-sm mt-1 text-center font-medium">Acesse a central de mensageria da sua empresa.</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#54656f] uppercase tracking-wider ml-1">E-mail Corporativo</label>
            <input 
              type="email" 
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full bg-[#f0f2f5] dark:bg-[#111b21] border border-transparent rounded-xl px-4 py-3 text-[#111b21] dark:text-white placeholder:text-[#8696a0] outline-none focus:border-blue-500 focus:bg-white dark:focus:bg-[#202c33] transition-all"
              placeholder="exemplo@suaempresa.com"
              required
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#54656f] uppercase tracking-wider ml-1">Senha de Acesso</label>
            <div className="relative">
              <input 
                type={showPassword ? "text" : "password"} 
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-[#f0f2f5] dark:bg-[#111b21] border border-transparent rounded-xl px-4 py-3 pr-12 text-[#111b21] dark:text-white placeholder:text-[#8696a0] outline-none focus:border-blue-500 focus:bg-white dark:focus:bg-[#202c33] transition-all"
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-[#8696a0] hover:text-[#54656f] dark:hover:text-[#e9edef] transition-colors rounded-lg focus:outline-none"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-2">
            <input 
              type="checkbox" 
              id="keepLogged" 
              checked={keepLogged}
              onChange={(e) => setKeepLogged(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 bg-[#f0f2f5] dark:bg-[#111b21] dark:border-[#2a3942] cursor-pointer"
            />
            <label htmlFor="keepLogged" className="text-sm font-medium text-[#54656f] dark:text-[#8696a0] select-none cursor-pointer">
              Manter-me conectado
            </label>
          </div>

          <button 
            type="submit"
            disabled={isLoading}
            className="w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-xl shadow-lg shadow-blue-500/30 transition-all hover:-translate-y-0.5 flex items-center justify-center gap-2 disabled:opacity-70 disabled:hover:translate-y-0"
          >
            {isLoading ? <Loader2 size={18} className="animate-spin" /> : <>Acessar Chat <ArrowRight size={18} /></>}
          </button>
          
          <div className="flex items-center my-4">
            <div className="flex-grow border-t border-gray-200 dark:border-white/10"></div>
            <span className="mx-4 text-xs font-semibold text-[#8696a0] uppercase tracking-wider">ou acessar com</span>
            <div className="flex-grow border-t border-gray-200 dark:border-white/10"></div>
          </div>

          <button 
            type="button"
            onClick={() => {
              setFaceIdActive(true);
              setFaceEmailStep(true);
              setFaceEmail('');
              setFaceVerifyError('');
            }}
            className="w-full bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-600 dark:text-emerald-400 font-semibold py-3 px-4 rounded-xl border border-emerald-500/20 hover:border-emerald-500/30 transition-all hover:-translate-y-0.5 flex items-center justify-center gap-2"
          >
            <Camera size={18} className="text-emerald-500" />
            Entrar com Face ID
          </button>
          
          {errorMsg && (
            <div className="flex items-center gap-2 mt-4 text-red-500 text-sm font-medium bg-red-50 dark:bg-red-500/10 p-3 rounded-lg animate-in fade-in">
              <AlertCircle size={16} />
              {errorMsg}
            </div>
          )}
        </form>
      </div>

      {/* Antigravity Dev Logger UI (Premium Glassmorphism) */}
      {devLogs.length > 0 && (
        <div className="w-full max-w-4xl mt-8 bg-black/80 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-8 fade-in duration-700 z-10 flex flex-col">
          <div className="bg-white/5 border-b border-white/10 px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-blue-500/20 rounded-lg">
                <Terminal size={18} className="text-blue-400" />
              </div>
              <span className="text-sm font-semibold text-white tracking-wide">Antigravity Dev Logger</span>
            </div>
            <button 
              type="button" 
              onClick={() => setDevLogs([])} 
              className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
              title="Fechar Logger"
            >
              <X size={18} />
            </button>
          </div>
          
          <div className="p-5 max-h-[40vh] overflow-y-auto font-mono text-[12px] leading-relaxed space-y-4">
            {devLogs.map((log, idx) => (
              <div key={idx} className="flex flex-col border-l-2 pl-3 pb-2" style={{
                borderColor: log.type === 'error' ? '#ef4444' : log.type === 'success' ? '#22c55e' : '#3b82f6'
              }}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-white/40 text-[10px]">{log.timestamp}</span>
                  <ChevronRight size={12} className="text-white/30" />
                  <span className={`px-2 py-0.5 rounded-md font-bold uppercase tracking-wider text-[10px] ${
                    log.type === 'error' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                    log.type === 'success' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                    'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  }`}>
                    {log.step}
                  </span>
                </div>
                <div className="text-[#c9d1d9] whitespace-pre-wrap break-words bg-black/40 p-3 rounded-xl border border-white/5">
                  {typeof log.details === 'object' ? JSON.stringify(log.details, null, 2) : String(log.details)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal Premium de Login por Face ID */}
      {faceIdActive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="w-full max-w-md bg-white/95 dark:bg-[#1f2c34] border border-[#e9edef]/20 dark:border-white/5 rounded-3xl p-8 shadow-2xl relative flex flex-col items-center">
            
            <button
              onClick={() => {
                stopCamera();
                setFaceIdActive(false);
              }}
              className="absolute top-4 right-4 p-2 text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            >
              <X size={20} />
            </button>

            {faceEmailStep ? (
              <div className="w-full space-y-6">
                <div className="flex flex-col items-center text-center">
                  <div className="w-16 h-16 bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-500 rounded-2xl flex items-center justify-center mb-4">
                    <Camera size={32} />
                  </div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">Acessar com Face ID</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Insira seu e-mail corporativo cadastrado para iniciar a verificação facial biométrica.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Seu E-mail</label>
                    <input
                      type="email"
                      value={faceEmail}
                      onChange={(e) => setFaceEmail(e.target.value)}
                      className="w-full bg-gray-100 dark:bg-[#111b21] border border-transparent rounded-xl px-4 py-3 text-gray-950 dark:text-white placeholder:text-gray-400 dark:placeholder:text-[#8696a0] outline-none focus:border-emerald-500 transition-all"
                      placeholder="exemplo@suaempresa.com"
                      required
                    />
                  </div>

                  {faceVerifyError && (
                    <div className="flex items-start gap-2 text-red-500 text-sm font-medium bg-red-50 dark:bg-red-500/10 p-3 rounded-lg">
                      <AlertCircle size={16} className="mt-0.5 shrink-0" />
                      <span>{faceVerifyError}</span>
                    </div>
                  )}

                  <button
                    onClick={async () => {
                      if (!faceEmail.trim()) {
                        setFaceVerifyError("Por favor, preencha o e-mail.");
                        return;
                      }
                      setFaceVerifyError('');
                      
                      const { data, error } = await supabase
                        .from('face_auth')
                        .select('id')
                        .eq('email', faceEmail.trim().toLowerCase())
                        .maybeSingle();

                      if (error || !data) {
                        setFaceVerifyError("Nenhum cadastro de Face ID encontrado para este e-mail.");
                      } else {
                        setFaceEmailStep(false);
                        setCameraActive(true);
                      }
                    }}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-4 rounded-xl shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2"
                  >
                    Próximo <ArrowRight size={18} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="w-full flex flex-col items-center">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Escaneamento Facial</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 text-center">
                  Posicione seu rosto dentro da moldura verde.
                </p>

                {/* Scanner Circular Premium */}
                <div className="w-56 h-56 relative flex items-center justify-center mb-6">
                  {/* Círculo do Vídeo com bordas esmeralda e sombras futuristas */}
                  <div className="w-48 h-48 rounded-full overflow-hidden relative border-4 border-emerald-500 shadow-[0_0_40px_rgba(16,185,129,0.4)] z-10 bg-black">
                    <video
                      ref={(el) => {
                        videoRef.current = el;
                        if (el && streamRef.current && el.srcObject !== streamRef.current) {
                          el.srcObject = streamRef.current;
                        }
                      }}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover scale-x-[-1]"
                    />
                    
                    {/* Linha laser de escaneamento facial com animação */}
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500 to-transparent shadow-[0_0_15px_rgba(16,185,129,1)] z-20" style={{
                      animation: 'laser-scan 2.5s ease-in-out infinite'
                    }} />
                  </div>

                  {/* Anel Externo Giratório */}
                  <div className="absolute inset-0 border-2 border-dashed border-emerald-500/30 rounded-full" style={{
                    animation: 'spin-slow 15s linear infinite'
                  }} />
                  
                  {/* Aura Pulsante Externa */}
                  <div className="absolute -inset-2 border border-emerald-500/10 rounded-full" style={{
                    animation: 'ring-pulse 2s ease-in-out infinite'
                  }} />
                </div>

                <div className="w-full text-center space-y-4">
                  {faceVerifyError && (
                    <div className="flex items-start gap-2 text-red-500 text-sm font-medium bg-red-50 dark:bg-red-500/10 p-3 rounded-lg text-left">
                      <AlertCircle size={16} className="mt-0.5 shrink-0" />
                      <span>{faceVerifyError}</span>
                    </div>
                  )}

                  {faceScanning ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 size={32} className="animate-spin text-emerald-500" />
                      <span className="text-sm font-semibold text-emerald-500 animate-pulse">
                        Analisando traços biométricos com a IA...
                      </span>
                    </div>
                  ) : (
                    <button
                      onClick={handleFaceLogin}
                      className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-4 rounded-xl shadow-lg shadow-emerald-500/30 transition-all hover:-translate-y-0.5 flex items-center justify-center gap-2"
                    >
                      <ShieldCheck size={20} /> Autenticar Rosto
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setFaceEmailStep(true);
                      stopCamera();
                    }}
                    className="text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors"
                  >
                    Voltar ao e-mail
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Premium de Registro/Cadastro de Face ID pós-login tradicional */}
      {faceRegisterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="w-full max-w-md bg-white/95 dark:bg-[#1f2c34] border border-[#e9edef]/20 dark:border-white/5 rounded-3xl p-8 shadow-2xl relative flex flex-col items-center">
            
            {!faceScanning && !showFaceSuccess && (
              <button
                onClick={() => {
                  stopCamera();
                  setFaceRegisterModal(null);
                  navigate('/chat', { replace: true });
                }}
                className="absolute top-4 right-4 p-2 text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              >
                <X size={20} />
              </button>
            )}

            {!cameraActive ? (
              <div className="w-full space-y-6 text-center">
                <div className="flex flex-col items-center">
                  <div className="w-20 h-20 bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-500 rounded-3xl flex items-center justify-center mb-4">
                    <UserCheck size={40} />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Ativar Face ID Premium?</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">
                    Acesse sua conta instantaneamente nos próximos acessos usando apenas a sua câmera, de forma 100% segura e sem precisar digitar senhas.
                  </p>
                </div>

                <div className="space-y-3 pt-2">
                  <button
                    onClick={() => {
                      setCameraActive(true);
                    }}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3.5 px-4 rounded-xl shadow-lg shadow-emerald-500/30 transition-all hover:-translate-y-0.5 flex items-center justify-center gap-2"
                  >
                    <Camera size={18} /> Cadastrar Reconhecimento Facial
                  </button>
                  <button
                    onClick={() => {
                      setFaceRegisterModal(null);
                      navigate('/chat', { replace: true });
                    }}
                    className="w-full bg-gray-100 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-white/10 text-gray-600 dark:text-gray-300 font-semibold py-3 px-4 rounded-xl transition-all"
                  >
                    Lembrar mais tarde
                  </button>
                </div>
              </div>
            ) : (
              <div className="w-full flex flex-col items-center">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">Cadastrar Face ID</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 text-center">
                  Olhe diretamente para a câmera para capturar seu traço biométrico.
                </p>

                {showFaceSuccess ? (
                  <div className="flex flex-col items-center space-y-4 py-8 animate-in scale-in">
                    <div className="w-20 h-20 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center border-4 border-green-500 animate-pulse">
                      <ShieldCheck size={48} />
                    </div>
                    <span className="text-lg font-bold text-green-600 dark:text-green-400">
                      Face ID Cadastrado com Sucesso!
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Redirecionando para o painel de chat...
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="w-56 h-56 relative flex items-center justify-center mb-6">
                      <div className="w-48 h-48 rounded-full overflow-hidden relative border-4 border-emerald-500 shadow-[0_0_40px_rgba(16,185,129,0.4)] z-10 bg-black">
                        <video
                          ref={(el) => {
                            videoRef.current = el;
                            if (el && streamRef.current && el.srcObject !== streamRef.current) {
                              el.srcObject = streamRef.current;
                            }
                          }}
                          autoPlay
                          playsInline
                          muted
                          className="w-full h-full object-cover scale-x-[-1]"
                        />
                        
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500 to-transparent shadow-[0_0_15px_rgba(16,185,129,1)] z-20" style={{
                          animation: 'laser-scan 2.5s ease-in-out infinite'
                        }} />
                      </div>

                      <div className="absolute inset-0 border-2 border-dashed border-emerald-500/30 rounded-full" style={{
                        animation: 'spin-slow 15s linear infinite'
                      }} />
                      
                      <div className="absolute -inset-2 border border-emerald-500/10 rounded-full" style={{
                        animation: 'ring-pulse 2s ease-in-out infinite'
                      }} />
                    </div>

                    <div className="w-full text-center space-y-4">
                      {faceVerifyError && (
                        <div className="flex items-start gap-2 text-red-500 text-sm font-medium bg-red-50 dark:bg-red-500/10 p-3 rounded-lg text-left">
                          <AlertCircle size={16} className="mt-0.5 shrink-0" />
                          <span>{faceVerifyError}</span>
                        </div>
                      )}

                      {faceScanning ? (
                        <div className="flex flex-col items-center gap-2">
                          <Loader2 size={32} className="animate-spin text-emerald-500" />
                          <span className="text-sm font-semibold text-emerald-500 animate-pulse">
                            Processando e salvando biometria...
                          </span>
                        </div>
                      ) : (
                        <button
                          onClick={handleRegisterFace}
                          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-4 rounded-xl shadow-lg shadow-emerald-500/30 transition-all hover:-translate-y-0.5 flex items-center justify-center gap-2"
                        >
                          <ShieldCheck size={20} /> Salvar e Ativar
                        </button>
                      )}

                      <button
                        onClick={() => {
                          stopCamera();
                          setFaceRegisterModal(null);
                          navigate('/chat', { replace: true });
                        }}
                        className="text-xs font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors"
                      >
                        Cancelar e ir para o chat
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Canvas oculto para capturas em Base64 */}
      <canvas ref={canvasRef} style={{ display: 'none' }} className="hidden" />

      {/* Estilos embutidos para animações premium */}
      <style>{`
        @keyframes laser-scan {
          0%, 100% { top: 0%; opacity: 0.3; }
          50% { top: 100%; opacity: 1; }
        }
        @keyframes ring-pulse {
          0%, 100% { transform: scale(1); opacity: 0.3; }
          50% { transform: scale(1.08); opacity: 0.7; }
        }
        @keyframes spin-slow {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
