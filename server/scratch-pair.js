import { makeWASocket, fetchLatestBaileysVersion, BufferJSON } from '@whiskeysockets/baileys';
import { useSupabaseAuthState } from './src/session-manager/auth.js';
import { supabase } from './src/supabase.js';
import pino from 'pino';

// Carrega as variáveis de ambiente do arquivo .env
import dotenv from 'dotenv';
dotenv.config();

const instanceId = 'f695a096-cb11-48aa-b603-27f0d41ae97d';
const tenantId = '8b1e427b-2321-4ea7-9d7e-90f7d5cbad21';

async function run() {
  const phoneNumber = process.argv[2];
  if (!phoneNumber) {
    console.error('Por favor, informe o número de telefone no formato internacional. Exemplo: node scratch-pair.js 5521999999999');
    process.exit(1);
  }

  // Sanitiza o número (remove +, espaços, traços)
  const cleanPhone = phoneNumber.replace(/\D/g, '');

  console.log(`Limpando credenciais antigas do DB para a instância ${instanceId}...`);
  await supabase.from('wa_auth_credentials').delete().eq('instance_id', instanceId);
  await supabase.from('wa_auth_keys').delete().eq('instance_id', instanceId);
  await supabase.from('whatsapp_instance_runtime').delete().eq('instance_id', instanceId);

  console.log(`Inicializando Supabase Auth State...`);
  const { state, saveCreds } = await useSupabaseAuthState(tenantId, instanceId);
  const { version } = await fetchLatestBaileysVersion();

  console.log(`Usando WhatsApp v${version.join('.')}`);
  
  const sock = makeWASocket({
    version,
    logger: pino({ level: 'info' }),
    printQRInTerminal: false,
    auth: state,
    browser: ['Mac OS', 'Chrome', '131.0.0.0']
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'open') {
      console.log('\n====================================');
      console.log('✔ CONEXÃO CONCLUÍDA COM SUCESSO!');
      console.log(`Telefone conectado: ${sock.user.id}`);
      console.log('====================================\n');
      
      // Atualiza o status da instância no banco de dados para conectado
      await supabase.from('whatsapp_instances')
        .update({ 
          status: 'connected', 
          phone_number: cleanPhone, 
          whatsapp_name: sock.user.name || 'Comercial X-Point' 
        })
        .eq('id', instanceId);

      console.log('Aguardando 5 segundos para salvar todas as chaves no Supabase...');
      setTimeout(() => {
        console.log('Concluído! Encerrando script.');
        process.exit(0);
      }, 5000);
    }

    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode;
      console.log(`Conexão fechada. Código: ${reason}`);
    }
  });

  // Aguarda um pequeno delay para inicializar o socket e depois solicita o Pairing Code
  setTimeout(async () => {
    try {
      console.log(`Solicitando Código de Pareamento para o número: ${cleanPhone}...`);
      const code = await sock.requestPairingCode(cleanPhone);
      console.log('\n==================================================');
      console.log(`  SEU CÓDIGO DE PAREAMENTO DO WHATSAPP:  ${code}  `);
      console.log('==================================================\n');
      console.log('Instruções:');
      console.log('1. No seu celular, abra o WhatsApp.');
      console.log('2. Vá em Dispositivos Conectados > Conectar um dispositivo.');
      console.log('3. Escolha "Conectar com número de telefone em vez disso" (Link with phone number instead).');
      console.log(`4. Digite o código ${code} exibido acima.`);
      console.log('\nAguardando pareamento no celular...\n');
    } catch (err) {
      console.error('Erro ao solicitar Pairing Code:', err);
      process.exit(1);
    }
  }, 3000);
}

run().catch(console.error);
