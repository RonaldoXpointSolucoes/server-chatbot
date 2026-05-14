const fs = require('fs');

let content = fs.readFileSync('src/components/ChatModals.tsx', 'utf8');

const target1 = `  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.name.trim()) {
      setIsSaving(true);
      try {
        await onSave(formData);
        onClose();
      } catch (err) {
        alert("Erro ao salvar contato.");
      } finally {
        setIsSaving(false);
      }
    }
  };`;

const replacement1 = `  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.name.trim()) {
      setIsSaving(true);
      setDocFeedback(null);
      try {
        if (formData.document_number && (formData.document_type === 'cnpj' || formData.document_type === 'cpf')) {
          const tenantId = localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id');
          const { supabase } = await import('../services/supabase');
          
          let query = supabase
            .from('contacts')
            .select('id, name')
            .eq('tenant_id', tenantId)
            .eq('document_number', formData.document_number);
            
          if (contactData?.id) {
            query = query.neq('id', contactData.id);
          }
          
          const { data: existingDoc } = await query.maybeSingle();
          
          if (existingDoc) {
            setDocFeedback(\`⚠️ Bloqueio: Já existe um contato (\${existingDoc.name}) com este documento.\`);
            setIsSaving(false);
            return;
          }
        }

        await onSave(formData);
        onClose();
      } catch (err) {
        alert("Erro ao salvar contato.");
      } finally {
        setIsSaving(false);
      }
    }
  };`;

const target2 = `                      <div className="relative">
                         <FileText size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                         <input 
                           type="text" 
                           value={formData.document_number}
                           onChange={e => setFormData({...formData, document_number: formatDocumentNumber(e.target.value, formData.document_type)})}
                           placeholder={formData.document_type === 'cpf' ? '000.000.000-00' : '00.000.000/0000-00'}
                           className="w-full pl-10 pr-4 py-2.5 bg-[#f0f2f5] dark:bg-[#111b21] border border-transparent focus:border-[#00a884]/50 focus:bg-white dark:focus:bg-[#2a3942] rounded-xl outline-none text-[#111b21] dark:text-[#e9edef] transition-all"
                         />
                      </div>
                    </div>`;

const replacement2 = `                      <div className="relative">
                         <FileText size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                         <input 
                           type="text" 
                           value={formData.document_number}
                           onChange={e => {
                             setDocFeedback(null);
                             setFormData({...formData, document_number: formatDocumentNumber(e.target.value, formData.document_type)});
                           }}
                           placeholder={formData.document_type === 'cpf' ? '000.000.000-00' : '00.000.000/0000-00'}
                           className={cn(
                             "w-full pl-10 pr-4 py-2.5 bg-[#f0f2f5] dark:bg-[#111b21] border focus:bg-white dark:focus:bg-[#2a3942] rounded-xl outline-none text-[#111b21] dark:text-[#e9edef] transition-all",
                             docFeedback ? "border-red-500/50 focus:border-red-500" : "border-transparent focus:border-[#00a884]/50"
                           )}
                         />
                      </div>
                      {docFeedback && (
                        <div className="mt-2 text-xs text-red-500 dark:text-red-400 flex items-center gap-1.5 animate-in fade-in slide-in-from-top-1 bg-red-50 dark:bg-red-500/10 p-2 rounded-lg border border-red-100 dark:border-red-500/20">
                          <ShieldAlert size={14} className="shrink-0" /> 
                          <span className="font-medium">{docFeedback}</span>
                        </div>
                      )}
                    </div>`;

// Use regex to ignore differences in line endings
const escapeRegex = (string) => string.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&').replace(/\\r\\n|\\n|\\r/g, '\\s+');

content = content.replace(new RegExp(escapeRegex(target1)), replacement1);
content = content.replace(new RegExp(escapeRegex(target2)), replacement2);

fs.writeFileSync('src/components/ChatModals.tsx', content);
console.log('Replaced successfully');
