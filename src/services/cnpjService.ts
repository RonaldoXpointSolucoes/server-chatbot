/**
 * Serviço de Consulta de CNPJ com Fallback Resiliente (BrasilAPI -> CNPJ.ws -> ReceitaWS)
 */

export interface CnpjData {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  uf: string;
  telefone: string;
  email: string;
  atividadePrincipal: string;
  naturezaJuridica: string;
  dataAbertura: string;
  statusCnpj: string;
}

export function formatCnpj(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
}

export function formatCep(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5, 8)}`;
}

export async function lookupCnpj(rawCnpj: string): Promise<CnpjData> {
  const cleanCnpj = rawCnpj.replace(/\D/g, '');
  if (cleanCnpj.length !== 14) {
    throw new Error('CNPJ deve conter exatamente 14 dígitos numéricos.');
  }

  // 1ª Tentativa: BrasilAPI (Rápida, sem rate limit restritivo e sem necessidade de chave)
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`);
    if (res.ok) {
      const data = await res.json();
      return {
        cnpj: formatCnpj(cleanCnpj),
        razaoSocial: data.razao_social || data.nome_fantasia || '',
        nomeFantasia: data.nome_fantasia || data.razao_social || '',
        cep: formatCep(data.cep || ''),
        logradouro: `${data.descricao_tipo_de_logradouro ? data.descricao_tipo_de_logradouro + ' ' : ''}${data.logradouro || ''}`.trim(),
        numero: data.numero || '',
        complemento: data.complemento || '',
        bairro: data.bairro || '',
        municipio: data.municipio || '',
        uf: data.uf || '',
        telefone: data.ddd_telefone_1 ? `${data.ddd_telefone_1}`.replace(/\D/g, '') : '',
        email: data.email || '',
        atividadePrincipal: data.cnae_fiscal_descricao || (data.cnaes_secundarios?.[0]?.descricao || ''),
        naturezaJuridica: data.natureza_juridica || '',
        dataAbertura: data.data_inicio_atividade || '',
        statusCnpj: data.descricao_situacao_cadastral || 'ATIVA'
      };
    }
  } catch (err) {
    console.warn('[CnpjService] Falha na BrasilAPI, tentando fallback...', err);
  }

  // 2ª Tentativa: CNPJ.ws Pública
  try {
    const res = await fetch(`https://publica.cnpj.ws/cnpj/${cleanCnpj}`);
    if (res.ok) {
      const data = await res.json();
      const estab = data.estabelecimento || {};
      return {
        cnpj: formatCnpj(cleanCnpj),
        razaoSocial: data.razao_social || estab.nome_fantasia || '',
        nomeFantasia: estab.nome_fantasia || data.razao_social || '',
        cep: formatCep(estab.cep || ''),
        logradouro: `${estab.tipo_logradouro ? estab.tipo_logradouro + ' ' : ''}${estab.logradouro || ''}`.trim(),
        numero: estab.numero || '',
        complemento: estab.complemento || '',
        bairro: estab.bairro || '',
        municipio: estab.cidade?.nome || estab.municipio || '',
        uf: estab.estado?.sigla || estab.uf || '',
        telefone: estab.telefone1 ? `${estab.ddd1 || ''}${estab.telefone1}`.replace(/\D/g, '') : '',
        email: estab.email || '',
        atividadePrincipal: estab.atividade_principal?.descricao || '',
        naturezaJuridica: data.natureza_juridica?.descricao || '',
        dataAbertura: estab.data_inicio_atividade || '',
        statusCnpj: estab.situacao_cadastral || 'ATIVA'
      };
    }
  } catch (err) {
    console.warn('[CnpjService] Falha no CNPJ.ws, tentando ReceitaWS...', err);
  }

  // 3ª Tentativa: ReceitaWS via jsonp ou fetch simples
  try {
    const res = await fetch(`https://minhareceita.org/${cleanCnpj}`);
    if (res.ok) {
      const data = await res.json();
      return {
        cnpj: formatCnpj(cleanCnpj),
        razaoSocial: data.razao_social || data.nome_fantasia || '',
        nomeFantasia: data.nome_fantasia || data.razao_social || '',
        cep: formatCep(data.cep || ''),
        logradouro: `${data.descricao_tipo_de_logradouro ? data.descricao_tipo_de_logradouro + ' ' : ''}${data.logradouro || ''}`.trim(),
        numero: data.numero || '',
        complemento: data.complemento || '',
        bairro: data.bairro || '',
        municipio: data.municipio || '',
        uf: data.uf || '',
        telefone: data.ddd_telefone_1 ? `${data.ddd_telefone_1}`.replace(/\D/g, '') : '',
        email: data.email || '',
        atividadePrincipal: data.cnae_fiscal_descricao || '',
        naturezaJuridica: data.natureza_juridica || '',
        dataAbertura: data.data_inicio_atividade || '',
        statusCnpj: data.descricao_situacao_cadastral || 'ATIVA'
      };
    }
  } catch (err) {
    console.warn('[CnpjService] Falha no Minhareceita...', err);
  }

  throw new Error('CNPJ não encontrado ou serviços de consulta temporariamente indisponíveis.');
}
