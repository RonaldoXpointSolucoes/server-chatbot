import React, { useState, useEffect } from 'react';
import { useChatStore } from '../store/chatStore';
import { Plus, Search, Edit2, Trash2, MessageSquareText, Zap, ChevronLeft, Save, Building } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function CannedResponses() {
  const navigate = useNavigate();
  const { quickReplies, fetchQuickReplies, addQuickReply, updateQuickReply, deleteQuickReply, tenantInfo } = useChatStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Form State
  const [shortcut, setShortcut] = useState('');
  const [content, setContent] = useState('');

  useEffect(() => {
    fetchQuickReplies();
  }, [fetchQuickReplies]);

  const filteredReplies = quickReplies?.filter(reply => 
    reply.shortcut.toLowerCase().includes(searchTerm.toLowerCase()) ||
    reply.content.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const handleSave = async () => {
    if (!shortcut.startsWith('/')) {
      alert('O atalho deve começar com uma barra (ex: /ola)');
      return;
    }
    if (!shortcut.trim() || !content.trim()) {
      alert('Preencha todos os campos!');
      return;
    }

    try {
      if (editingId) {
        await updateQuickReply(editingId, shortcut, content);
      } else {
        await addQuickReply(shortcut, content);
      }
      
      setIsModalOpen(false);
      resetForm();
    } catch (error: any) {
      console.error(error);
      alert('Erro ao salvar resposta: ' + (error?.message || 'Tente novamente.'));
    }
  };

  const handleEdit = (reply: any) => {
    setEditingId(reply.id);
    setShortcut(reply.shortcut);
    setContent(reply.content);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja excluir esta resposta pronta?')) {
      try {
        await deleteQuickReply(id);
      } catch (error: any) {
        console.error(error);
        alert('Erro ao excluir: ' + (error?.message || 'Tente novamente.'));
      }
    }
  };

  const resetForm = () => {
    setShortcut('/');
    setContent('');
    setEditingId(null);
  };

  const openNewModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  return (
    <div className="h-screen bg-gray-50 dark:bg-[#0b141a] flex flex-col transition-colors duration-200">
      {/* Header Premium */}
      <header className="bg-white dark:bg-[#111B21] border-b dark:border-white/5 px-6 py-4 flex items-center justify-between sticky top-0 z-10 transition-colors duration-200">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/admin')}
            className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-full transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-[#d1d7db]" />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-gray-800 dark:text-[#e9edef] flex items-center gap-2">
              <MessageSquareText className="w-6 h-6 text-blue-600" />
              Respostas Prontas
            </h1>
            <p className="text-sm text-gray-500 dark:text-[#8696a0]">
              Gerencie atalhos para respostas rápidas (ex: /ola).
            </p>
          </div>
        </div>
        
        <button 
          onClick={openNewModal}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-all shadow-sm shadow-blue-200"
        >
          <Plus className="w-5 h-5" />
          Nova Resposta
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          
          {/* Barra de Pesquisa */}
          <div className="relative">
            <Search className="w-5 h-5 text-gray-400 dark:text-[#8696a0] absolute left-4 top-1/2 -translate-y-1/2" />
            <input 
              type="text"
              placeholder="Buscar por atalho ou conteúdo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-3 rounded-2xl border border-gray-200 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-[#202C33] dark:text-[#e9edef] dark:placeholder-[#8696a0] shadow-sm transition-colors duration-200"
            />
          </div>

          {/* Lista de Respostas */}
          {filteredReplies.length === 0 ? (
            <div className="text-center py-20 bg-white dark:bg-[#111B21] rounded-3xl border border-gray-100 dark:border-white/5 shadow-sm transition-colors duration-200">
              <Zap className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-[#e9edef] mb-2">Nenhuma resposta pronta encontrada</h3>
              <p className="text-gray-500 dark:text-[#8696a0]">
                {searchTerm ? 'Tente buscar com outros termos.' : 'Clique no botão acima para criar seu primeiro atalho.'}
              </p>
            </div>
          ) : (
            <div className="grid gap-4">
              {filteredReplies.map((reply) => (
                <div key={reply.id} className="bg-white dark:bg-[#111B21] rounded-2xl p-5 border border-gray-100 dark:border-white/5 shadow-sm hover:shadow-md dark:hover:shadow-black/50 transition-all duration-300 group animate-in slide-in-from-bottom-2 fade-in">
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-3">
                        <div className="inline-flex items-center px-3 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 font-medium text-sm">
                          {reply.shortcut}
                        </div>
                        {tenantInfo?.name && (
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-white/5 text-gray-600 dark:text-[#8696a0] text-xs font-medium border border-gray-200 dark:border-white/10" title="Empresa">
                            <Building className="w-3.5 h-3.5" />
                            {tenantInfo.name}
                          </div>
                        )}
                      </div>
                      <p className="text-gray-700 dark:text-[#d1d7db] whitespace-pre-wrap">{reply.content}</p>
                    </div>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => handleEdit(reply)}
                        className="p-2 text-gray-400 dark:text-[#8696a0] hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                        title="Editar"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDelete(reply.id)}
                        className="p-2 text-gray-400 dark:text-[#8696a0] hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        title="Excluir"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Modal Criar/Editar */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#111B21] rounded-3xl w-full max-w-lg shadow-2xl dark:shadow-black/80 overflow-hidden animate-in zoom-in-95 duration-200 border dark:border-white/5">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-white/5 flex justify-between items-center bg-gray-50/50 dark:bg-[#202C33]">
              <h2 className="text-xl font-semibold text-gray-800 dark:text-[#e9edef] flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-500" />
                {editingId ? 'Editar Resposta' : 'Nova Resposta Pronta'}
              </h2>
            </div>
            
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-[#d1d7db] mb-1">Atalho (Shortcut)</label>
                <div className="relative">
                  <input
                    type="text"
                    value={shortcut}
                    onChange={(e) => setShortcut(e.target.value)}
                    placeholder="/ola"
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 dark:border-white/10 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all font-mono text-sm bg-white dark:bg-[#202C33] text-gray-900 dark:text-[#e9edef] placeholder-gray-400 dark:placeholder-[#8696a0]"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 dark:text-[#8696a0]">
                    Obrigatório iniciar com /
                  </div>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-[#d1d7db] mb-1">Conteúdo da Mensagem</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Olá! Como posso ajudar você hoje?"
                  rows={6}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-white/10 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all resize-none bg-white dark:bg-[#202C33] text-gray-900 dark:text-[#e9edef] placeholder-gray-400 dark:placeholder-[#8696a0]"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 dark:border-white/5 bg-gray-50 dark:bg-[#202C33] flex justify-end gap-3 transition-colors duration-200">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-5 py-2.5 rounded-xl font-medium text-gray-600 dark:text-[#d1d7db] hover:bg-gray-200 dark:hover:bg-white/10 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                className="px-5 py-2.5 rounded-xl font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-sm shadow-blue-200 flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                {editingId ? 'Salvar Alterações' : 'Criar Atalho'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
