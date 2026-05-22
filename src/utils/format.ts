export const formatDocumentNumber = (value: string | null | undefined, type: string = 'cpf') => {
  if (!value) return '';
  const v = value.replace(/\D/g, '');
  if (type === 'cpf') {
    return v.replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
            .slice(0, 14);
  } else if (type === 'cnpj') {
    return v.replace(/(\d{2})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d)/, '$1/$2')
            .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
            .slice(0, 18);
  }
  return v;
};
