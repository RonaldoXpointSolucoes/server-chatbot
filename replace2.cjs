const fs = require('fs');
let content = fs.readFileSync('src/components/ChatModals.tsx', 'utf8');

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

// Use a regex that ignores whitespace and matches the exact body
const regex = /const\s+handleSubmit\s*=\s*async\s*\(\s*e:\s*React\.FormEvent\s*\)\s*=>\s*\{\s*e\.preventDefault\(\);\s*if\s*\(formData\.name\.trim\(\)\)\s*\{\s*setIsSaving\(true\);\s*try\s*\{\s*await\s*onSave\(formData\);\s*onClose\(\);\s*\}\s*catch\s*\(err\)\s*\{\s*alert\("Erro ao salvar contato\."\);\s*\}\s*finally\s*\{\s*setIsSaving\(false\);\s*\}\s*\}\s*\};/g;

content = content.replace(regex, replacement1);

fs.writeFileSync('src/components/ChatModals.tsx', content);
console.log('Replaced handleSubmit');
