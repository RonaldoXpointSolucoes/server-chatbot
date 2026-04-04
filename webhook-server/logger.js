const { supabase } = require('./supabase');

/**
 * Função para salvar erro na nova tabela de system_logs e via console
 * @param {string} errorType - Tipo/Tópico (ex: "WEBHOOK_MISSING_DATA", "DB_INSERT_ERROR")
 * @param {string} message - Mensagem humana/descrita resumida
 * @param {object} payload - Dados JSON adicionais
 * @param {object} tags - Opcional. Metadados de empresa ou tenant
 */
async function logSystemError(errorType, message, payload = {}, tags = {}) {
  console.error(`[${errorType}] ${message}`, payload);

  try {
    const { error } = await supabase.from('system_logs').insert([{
      type: errorType,
      message,
      payload,
      tenant_id: tags.tenantId || null,
      company_id: tags.companyId || null,
      level: 'error',
    }]);

    if(error){
      console.error('Falha ao gravar no system_logs: ', error.message);
    }
  } catch (err) {
    console.error('Falha crítica no Logger: ', err.message);
  }
}

/**
 * Informação genérica
 */
async function logSystemInfo(infoType, message, payload = {}, tags={}) {
  console.log(`[INF - ${infoType}] ${message}`);

  try {
    const { error } = await supabase.from('system_logs').insert([{
      type: infoType,
      message,
      payload,
      tenant_id: tags.tenantId || null,
      company_id: tags.companyId || null,
      level: 'info',
    }]);

    if(error){
      console.error('Falha ao gravar no system_logs: ', error.message);
    }
  } catch (err) { }
}

module.exports = { logSystemError, logSystemInfo };
