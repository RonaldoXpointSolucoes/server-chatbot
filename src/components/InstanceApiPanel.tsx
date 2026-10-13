import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, Code2, Copy, Eye, EyeOff, KeyRound, Loader2, Send, X } from 'lucide-react';
import { apiTestOutcome, instanceApiEndpoint, instanceApiSnippet, instanceApiUrl, redactApiResponse } from '../utils/instanceApi.mjs';

interface ApiInstance {
  id: string;
  display_name: string;
  status: string;
  api_key?: string | null;
  assigned_node_id?: string | null;
}

type TestResult = ReturnType<typeof apiTestOutcome> & { http: number | null; elapsed: number; detail: string; serverStatus?: string; queueId?: string };

export function InstanceApiPanel({ instance, onClose, onGenerateKey }: { instance: ApiInstance; onClose: () => void; onGenerateKey: () => Promise<void> }) {
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [copyError, setCopyError] = useState('');
  const [kind, setKind] = useState<'text' | 'media'>('text');
  const [language, setLanguage] = useState<'curl' | 'node'>('curl');
  const [number, setNumber] = useState('');
  const [text, setText] = useState('Olá! Teste de envio pela API externa.');
  const [mediatype, setMediatype] = useState('image');
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const productionUrl = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim();
  const baseUrl = instanceApiUrl(instance, productionUrl);
  const endpoint = instanceApiEndpoint(instance, kind, productionUrl);
  const isAlpha = baseUrl.includes('wh1ss8sy');
  const options = { instance, kind, language, number: number.replace(/\D/g, '') || '5511975960999', text, mediatype, productionUrl };
  const displayedCode = instanceApiSnippet({ ...options, apiKey: showKey ? instance.api_key || undefined : undefined });

  useEffect(() => () => controllerRef.current?.abort(), []);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  const copy = async (value: string, id: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(id);
      setCopyError('');
      setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopyError('Não foi possível copiar. Selecione e copie o conteúdo manualmente.');
    }
  };

  const sendTest = async (event: React.FormEvent) => {
    event.preventDefault();
    if (sending) return;
    const phone = number.replace(/\D/g, '');
    if (phone.length < 10 || phone.length > 15) {
      setResult({ state: 'error', messageId: null, http: null, elapsed: 0, detail: '', message: 'Informe o número com código do país e DDD, entre 10 e 15 dígitos.' });
      return;
    }
    if (!instance.api_key || (kind === 'text' && !text.trim()) || (kind === 'media' && !file)) return;
    const start = performance.now();
    setSending(true);
    setResult(null);
    const controller = new AbortController();
    controllerRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 90000);
    try {
      const headers: Record<string, string> = { apikey: instance.api_key };
      let body: string | FormData;
      if (kind === 'media') {
        const form = new FormData();
        form.append('number', phone);
        form.append('instance', instance.id);
        form.append('mediatype', mediatype);
        form.append('caption', text);
        form.append('file', file!);
        body = form;
      } else {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify({ number: phone, text, instance: instance.id });
      }
      // Public application contract only. Never inherit the manager's master/session headers.
      const response = await fetch(endpoint, { method: 'POST', headers, body, credentials: 'omit', referrerPolicy: 'no-referrer', signal: controller.signal });
      const raw = await response.text();
      let payload: any;
      try { payload = JSON.parse(raw); } catch {
        payload = { error: `O servidor respondeu HTTP ${response.status} sem uma resposta JSON. Tente novamente quando o serviço estiver disponível.` };
      }
      const outcome = apiTestOutcome(response.status, payload);
      const safeMessage = String(outcome.message).split(instance.api_key).join('[oculto]');
      setResult({ ...outcome, message: safeMessage, http: response.status, elapsed: Math.round(performance.now() - start), detail: redactApiResponse(payload, instance.api_key), serverStatus: payload.status, queueId: payload.queue_id });
    } catch (error: any) {
      setResult({ state: 'error', messageId: null, http: null, elapsed: Math.round(performance.now() - start), detail: '', message: error?.name === 'AbortError' ? 'A resposta não chegou em 90 segundos. O envio pode ter sido processado; confira o WhatsApp antes de repetir.' : 'Não foi possível acessar a API. Verifique a rede e a disponibilidade do servidor.' });
    } finally {
      clearTimeout(timeout);
      controllerRef.current = null;
      setSending(false);
    }
  };

  const inputClass = 'w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-cyan-500';
  const copyButton = (value: string, id: string, label: string) => <button type="button" onClick={() => copy(value, id)} className="shrink-0 rounded-lg border border-slate-700 p-2 text-slate-400 hover:bg-slate-800 hover:text-white" title={label} aria-label={label}>{copied === id ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}</button>;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-2 backdrop-blur-md sm:p-5">
      <section role="dialog" aria-modal="true" aria-labelledby="instance-api-title" className="flex max-h-[95vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 shadow-2xl">
        <header className="flex items-center justify-between gap-4 border-b border-slate-800 p-5 sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-xl bg-cyan-500/10 p-3 text-cyan-400"><Code2 className="h-5 w-5" /></div>
            <div className="min-w-0"><h2 id="instance-api-title" className="text-lg font-bold text-white">API da instância</h2><p className="truncate text-sm text-slate-400">{instance.display_name} <span className="ml-2 text-xs text-cyan-400">{isAlpha ? 'Homologação · Alpha' : 'Produção'}</span></p></div>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Fechar painel API"><X className="h-5 w-5" /></button>
        </header>
        <div className="grid gap-6 overflow-y-auto p-5 sm:p-7 lg:grid-cols-2">
          <div className="space-y-5">
            <p className="text-sm leading-relaxed text-slate-300">Use esta caixa de WhatsApp no seu sistema, ERP ou automação. Copie a URL e a chave, informe o destinatário e envie uma mensagem.</p>
            <div className="space-y-4 rounded-2xl border border-slate-700/80 bg-slate-950/50 p-4">
              <div><label className="mb-2 block text-xs font-semibold text-slate-400">URL da API</label><div className="flex items-center gap-2"><input className={`${inputClass} font-mono text-xs`} readOnly value={baseUrl} aria-label="URL da API" />{copyButton(baseUrl, 'url', 'Copiar URL da API')}</div></div>
              <div><label className="mb-2 block text-xs font-semibold text-slate-400">ID da instância · campo instance</label><div className="flex items-center gap-2"><input className={`${inputClass} font-mono text-xs`} readOnly value={instance.id} aria-label="ID da instância para API" />{copyButton(instance.id, 'instance', 'Copiar ID da instância')}</div></div>
              <div><label className="mb-2 block text-xs font-semibold text-slate-400">Chave de acesso · cabeçalho apikey</label>
                {instance.api_key ? <div className="flex items-center gap-2"><input className={`${inputClass} font-mono text-xs`} type={showKey ? 'text' : 'password'} readOnly value={instance.api_key} autoComplete="off" aria-label="Chave de API da instância" /><button type="button" onClick={() => setShowKey(!showKey)} className="rounded-lg border border-slate-700 p-2 text-slate-400 hover:text-white" aria-label={showKey ? 'Ocultar chave API' : 'Revelar chave API'}>{showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>{copyButton(instance.api_key, 'key', 'Copiar chave API')}</div>
                  : <button type="button" disabled={generating} onClick={async () => { setGenerating(true); try { await onGenerateKey(); } finally { setGenerating(false); } }} className="flex items-center gap-2 rounded-xl bg-cyan-500/10 px-4 py-2.5 text-sm font-semibold text-cyan-400"><KeyRound className="h-4 w-4" />{generating ? 'Gerando chave...' : 'Gerar chave desta instância'}</button>}
              </div>
              <p className="text-xs leading-relaxed text-slate-500">Esta chave dá acesso a esta instância. Guarde-a nas configurações do seu sistema. O modo “Apenas API” também permite enviar por aqui.</p>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-bold text-white">Exemplo pronto para usar</h3><div className="flex rounded-lg bg-slate-950 p-1">{(['curl', 'node'] as const).map(value => <button key={value} type="button" onClick={() => setLanguage(value)} className={`rounded-md px-3 py-1 text-xs font-semibold ${language === value ? 'bg-cyan-500/15 text-cyan-400' : 'text-slate-500'}`}>{value === 'curl' ? 'cURL' : 'Node.js'}</button>)}</div></div>
              <pre className="max-h-72 overflow-auto rounded-xl border border-slate-800 bg-slate-950 p-4 text-[11px] leading-relaxed text-slate-300"><code>{displayedCode}</code></pre>
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs text-slate-500">{language === 'curl' ? 'Terminal Bash / cURL' : 'Node.js 22+ · arquivo .mjs'}. A cópia inclui sua chave.</span><button type="button" disabled={!instance.api_key} onClick={() => copy(instanceApiSnippet({ ...options, apiKey: instance.api_key! }), 'code')} className="flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-400 disabled:opacity-40">{copied === 'code' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}Copiar exemplo completo</button></div>
              {copyError && <p role="alert" className="text-xs text-amber-400">{copyError}</p>}
            </div>
          </div>
          <div className="space-y-4 rounded-2xl border border-slate-700/80 bg-slate-950/40 p-4 sm:p-5">
            <div><h3 className="text-base font-bold text-white">Testar envio pela API</h3><p className="mt-1 text-xs leading-relaxed text-slate-400">Envia uma mensagem real usando somente a chave desta instância, como uma aplicação externa.</p></div>
            <form onSubmit={sendTest} className="space-y-4">
              <div className="flex rounded-xl border border-slate-700 bg-slate-950 p-1">{(['text', 'media'] as const).map(value => <button key={value} type="button" disabled={sending} onClick={() => { setKind(value); setResult(null); }} className={`flex-1 rounded-lg py-2 text-xs font-bold ${kind === value ? 'bg-cyan-500/15 text-cyan-400' : 'text-slate-400'}`}>{value === 'text' ? 'Texto' : 'Mídia'}</button>)}</div>
              <label className="block text-xs font-semibold text-slate-300">Número de destino<input value={number} onChange={event => setNumber(event.target.value)} className={`${inputClass} mt-2`} placeholder="55 + DDD + número" inputMode="tel" required maxLength={25} disabled={sending} /><span className="mt-1 block font-normal text-slate-500">Exemplo: 5511975960999. Use um número de teste autorizado.</span></label>
              {kind === 'media' && <div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs font-semibold text-slate-300">Tipo de mídia<select className={`${inputClass} mt-2`} value={mediatype} onChange={event => setMediatype(event.target.value)} disabled={sending}><option value="image">Imagem</option><option value="video">Vídeo</option><option value="audio">Áudio</option><option value="document">Documento</option></select></label><label className="block text-xs font-semibold text-slate-300">Arquivo<input type="file" required disabled={sending} onChange={event => setFile(event.target.files?.[0] || null)} className="mt-2 block w-full text-xs text-slate-400 file:mr-2 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-slate-300" /></label></div>}
              <label className="block text-xs font-semibold text-slate-300">{kind === 'text' ? 'Mensagem' : 'Legenda (opcional)'}<textarea value={text} onChange={event => setText(event.target.value)} className={`${inputClass} mt-2 min-h-24`} required={kind === 'text'} disabled={sending} /></label>
              <div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-[10px] text-slate-500 break-all">POST {endpoint}<br />Autenticação: apikey · {kind === 'text' ? 'application/json' : 'multipart/form-data'}</div>
              <button type="submit" disabled={sending || !instance.api_key || !number.replace(/\D/g, '') || (kind === 'media' && !file) || (kind === 'text' && !text.trim())} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 px-4 py-3 text-sm font-bold text-slate-950 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}{sending ? 'Aguardando resposta da API...' : 'Enviar teste real'}</button>
            </form>
            {result && <div aria-live="polite" className={`space-y-3 rounded-xl border p-4 ${result.state === 'accepted' ? 'border-emerald-500/30 bg-emerald-500/5' : result.state === 'error' ? 'border-rose-500/30 bg-rose-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
              <p className={`text-sm font-semibold ${result.state === 'accepted' ? 'text-emerald-400' : result.state === 'error' ? 'text-rose-400' : 'text-amber-400'}`}>{result.message}</p>
              <div className="flex flex-wrap gap-2 text-xs text-slate-300"><span>HTTP {result.http ?? 'sem resposta'}</span><span>· {result.elapsed} ms</span>{result.serverStatus && <span>· Status: {result.serverStatus}</span>}</div>
              {result.messageId && <p className="break-all font-mono text-xs text-emerald-300">ID WhatsApp: {result.messageId}</p>}{result.queueId && <p className="break-all font-mono text-xs text-amber-300">ID da fila: {result.queueId}</p>}
              {result.detail && <details className="text-xs text-slate-400"><summary className="cursor-pointer font-semibold">Ver resposta do servidor</summary><pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-950 p-3 text-[10px]">{result.detail}</pre></details>}
            </div>}
            <p className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-500"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />Uma resposta de envio com ID ainda não comprova entrega. HTTP 202 representa mensagem aguardando na fila.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
