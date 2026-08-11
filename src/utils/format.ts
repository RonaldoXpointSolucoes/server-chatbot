export const formatDocumentNumber = (value: string | null | undefined, type?: string) => {
  if (!value) return '';
  const v = value.replace(/\D/g, '');
  
  const resolvedType = type || (v.length === 14 ? 'cnpj' : 'cpf');
  
  if (resolvedType === 'cnpj' || v.length === 14) {
    return v.replace(/(\d{2})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d)/, '$1/$2')
            .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
            .slice(0, 18);
  } else if (resolvedType === 'cpf' || v.length === 11) {
    return v.replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d)/, '$1.$2')
            .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
            .slice(0, 14);
  }
  return v;
};

export const formatPhoneNumber = (phone: string | undefined | null): string => {
  if (!phone) return '';
  let cleaned = phone.split('@')[0];
  if (/[a-zA-Z]/.test(cleaned)) return cleaned;
  
  const cleanPhone = cleaned.replace(/\D/g, '');
  
  if (cleanPhone.startsWith('55') && (cleanPhone.length === 12 || cleanPhone.length === 13)) {
    const ddd = cleanPhone.substring(2, 4);
    let num = cleanPhone.substring(4);
    if (num.length === 8) {
      num = '9' + num;
    }
    if (num.length === 9) {
      return `(${ddd}) ${num.substring(0, 5)}-${num.substring(5)}`;
    }
  } else if (cleanPhone.length === 10 || cleanPhone.length === 11) {
    const ddd = cleanPhone.substring(0, 2);
    let num = cleanPhone.substring(2);
    if (num.length === 8) {
      num = '9' + num;
    }
    if (num.length === 9) {
      return `(${ddd}) ${num.substring(0, 5)}-${num.substring(5)}`;
    }
  } else if (cleanPhone.length === 9) {
    return `${cleanPhone.substring(0, 5)}-${cleanPhone.substring(5)}`;
  } else if (cleanPhone.length === 8) {
    return `9${cleanPhone.substring(0, 4)}-${cleanPhone.substring(4)}`;
  }
  return cleaned;
};
