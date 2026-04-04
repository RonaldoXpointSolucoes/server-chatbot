const { initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');

/**
 * Hook customizado para armazenar Sessões do WhatsApp no Supabase
 * substituindo o uso de arquivos locais em disco do servidor Nodejs da lib default.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase 
 * @param {string} tenantId 
 */
const useSupabaseAuthState = async (supabase, tenantId) => {
    
    // Função para Ler um KeyID Específico da Tabela
    const readData = async (key_id) => {
        try {
            const { data, error } = await supabase
                .from('wa_auth_states')
                .select('data')
                .eq('tenant_id', tenantId)
                .eq('key_id', key_id)
                .single();

            if (data && data.data) {
                // BufferJSON descompacta chaves binárias ArrayBuffer armazenadas em string
                return JSON.parse(data.data, BufferJSON.reviver);
            }
            return null;
        } catch (error) {
            console.error('SupabaseAuth Read Error: ', error.message);
            return null;
        }
    };

    // Função para Escrever um KeyID na Tabela (Upsert)
    const writeData = async (dataObj, key_id) => {
        try {
            const dataStr = JSON.stringify(dataObj, BufferJSON.replacer);
            const { error } = await supabase
                .from('wa_auth_states')
                .upsert({
                    tenant_id: tenantId,
                    key_id: key_id,
                    data: dataStr,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'tenant_id, key_id' });
            
            if(error) console.error('SupabaseAuth Write DB Error: ', error);
        } catch (error) {
            console.error('SupabaseAuth Write Error: ', error.message);
        }
    };

    // Função para Deletar 
    const removeData = async (key_id) => {
        try {
            await supabase
                .from('wa_auth_states')
                .delete()
                .eq('tenant_id', tenantId)
                .eq('key_id', key_id);
        } catch (error) {}
    };

    // Leitura inicial do 'creds' principal
    let creds = await readData('creds');
    if (!creds) {
        creds = initAuthCreds();
        await writeData(creds, 'creds');
    }

    const clearState = async () => {
        try {
            await supabase.from('wa_auth_states').delete().eq('tenant_id', tenantId);
        } catch (error) {
            console.error('Falha ao limpar state antigo', error);
        }
    };

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(
                        ids.map(async id => {
                            let value = await readData(`${type}-${id}`);
                            if (type === 'app-state-sync-key' && value) {
                                // Mapear dados base-64
                                value = typeof value === 'string' ? JSON.parse(value) : value; 
                            }
                            data[id] = value;
                        })
                    );
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const key_id = `${category}-${id}`;
                            if (value) {
                                tasks.push(writeData(value, key_id));
                            } else {
                                tasks.push(removeData(key_id));
                            }
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        },
        saveCreds: () => {
            return writeData(creds, 'creds');
        },
        clearState
    }
}

module.exports = { useSupabaseAuthState };
