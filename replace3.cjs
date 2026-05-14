const fs = require('fs');
let content = fs.readFileSync('src/components/ChatModals.tsx', 'utf8');

const regex = /const\s+handleSubmit\s*=\s*async\s*\(\s*e:\s*React\.FormEvent\s*\)\s*=>\s*\{[\s\S]*?\n  \};\n/g;

const replacement = `  const handleSubmit = async (e: React.FormEvent) => {
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
          
          const { data: existingDocs, error } = await query.limit(1);
          
          if (existingDocs && existingDocs.length > 0) {
            setDocFeedback(\`⚠️ Bloqueio: Já existe um contato (\${existingDocs[0].name}) com este documento.\`);
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
  };
`;

content = content.replace(regex, replacement);
fs.writeFileSync('src/components/ChatModals.tsx', content);
console.log('Replaced handleSubmit with limit(1) fix');
