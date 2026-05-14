const fs = require('fs');

let content = fs.readFileSync('src/components/ChatModals.tsx', 'utf8');

const startStr = '  const handleSubmit = async (e: React.FormEvent) => {';
const endStr = '  const renderPremiumCompanySelect = () => (';

const startIndex = content.indexOf(startStr);
const endIndex = content.indexOf(endStr);

if (startIndex !== -1 && endIndex !== -1) {
  const replacement = `  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.name.trim()) {
      setIsSaving(true);
      setDocFeedback(null);
      try {
        if (formData.document_number && (formData.document_type === 'cnpj' || formData.document_type === 'cpf')) {
          const tenantId = localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id');
          const { supabase } = await import('../services/supabase');
          
          // Remove a mascara do documento para garantir busca consistente
          const cleanDoc = formData.document_number.replace(/\\D/g, '');
          
          let query = supabase
            .from('contacts')
            .select('id, name')
            .eq('tenant_id', tenantId)
            // Filtra comparando o documento com e sem mascara, ja que o BD pode ter de um jeito ou de outro
            .or(\`document_number.eq.\${formData.document_number},document_number.eq.\${cleanDoc}\`);
            
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

  content = content.substring(0, startIndex) + replacement + content.substring(endIndex);
  fs.writeFileSync('src/components/ChatModals.tsx', content, 'utf8');
  console.log('Successfully replaced handleSubmit with robust CNPJ validation and no encoding issues.');
} else {
  console.log('Could not find boundaries.');
}
