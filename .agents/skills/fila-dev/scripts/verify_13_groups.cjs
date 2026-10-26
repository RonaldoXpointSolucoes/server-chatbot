const fs = require('fs');
const path = require('path');

const cards = JSON.parse(fs.readFileSync(path.join(__dirname, 'cards_since_sep15.json'), 'utf8'));

// Mapeamento dos 13 grupos mestres
const groups = [
  {
    id: 'G01_CHAT_ORDER',
    title: '[Chat UI] Ordenação Estável da Lista de Conversas por Última Mensagem ao Resolver Tickets',
    mainCardId: '0070dfe0-6f82-4788-89b9-a43f7c8405c7', // #56
    cards: ['0070dfe0-6f82-4788-89b9-a43f7c8405c7', '35ecc473-ed5d-42b9-b101-c3ada7eaf61d']
  },
  {
    id: 'G02_KANBAN_FOLD',
    title: '[Kanban CRM] Persistência do Estado de Dobra/Colapso das Colunas no LocalStorage',
    mainCardId: '95836682-ec96-4e11-a4ce-942b5448e258', // #57
    cards: ['95836682-ec96-4e11-a4ce-942b5448e258']
  },
  {
    id: 'G03_QUICK_REPLIES',
    title: '[Chat UI] Inversão de Ordem no Modal de Respostas Rápidas: Mensagens Prontas antes das Pastas',
    mainCardId: 'aacf5f31-6a64-4a3f-b8d6-27d5a32ded1a', // #58
    cards: ['aacf5f31-6a64-4a3f-b8d6-27d5a32ded1a']
  },
  {
    id: 'G04_AUDIO_TRANSCRIBE',
    title: '[Chat & Mídia] Correção de Áudios Picotados, Gravação WebM Opus e Pipeline de Transcrição por IA',
    mainCardId: '65061852-5440-4bbc-b5ba-5288c5efeafd', // #60
    cards: ['65061852-5440-4bbc-b5ba-5288c5efeafd']
  },
  {
    id: 'G05_MESSAGES_DEDUP_MEDIA',
    title: '[Chat & Mensageria] Envio Otimista Rápido, Deduplicação de Mensagens e Prevenção de Perda de Mídias',
    mainCardId: 'a7108213-3e56-4fde-9c93-0e31ffc9ea3b', // #73
    cards: [
      'a7108213-3e56-4fde-9c93-0e31ffc9ea3b',
      'df62e4a1-1a48-4e9b-aeae-ddfa85bbab94',
      '6574d38b-cb8b-4eb0-9dba-dcd75461c4b4',
      '34ee5750-9e8c-46ee-af55-b1b07f26b7a5'
    ]
  },
  {
    id: 'G06_CRM_TICKETS_UI',
    title: '[CRM / UI/UX] Refatoração e Simplificação do Fluxo e Modais de Chamados (Mobile-First)',
    mainCardId: '6c488d16-42e2-470e-a7d1-90e6bde89256', // #52
    cards: ['6c488d16-42e2-470e-a7d1-90e6bde89256']
  },
  {
    id: 'G07_PRINT_PAUSE_AI',
    title: '[Automação / Atendimento] Pausa Automática da IA por 1 Hora após Disparo de Impressão de Recado',
    mainCardId: '67e06649-f8bd-4c44-bd12-87c641949be6', // #10
    cards: ['67e06649-f8bd-4c44-bd12-87c641949be6']
  },
  {
    id: 'G08_GASTROFOOD_INTEGRATION',
    title: '[Integração Gastrofood] Cache Inteligente de Cardápio, Resiliência a Falhas HTTP e Sanitização de Rotas',
    mainCardId: '76ea4e88-77e3-4386-83a0-4d0b36e1c05a', // #1
    cards: [
      '76ea4e88-77e3-4386-83a0-4d0b36e1c05a',
      'cf2525a4-fb74-489e-bdb0-6d28b8823e21',
      '0d62a46e-40c3-4b01-a09d-915db65e47d7',
      '0b008424-afcb-4538-ac13-6f4e0e091b37',
      'ddc63b7f-c654-4774-b180-694b859ccef6',
      '2b14497c-c38e-41bc-9b2b-a9f538d5cb52',
      'e376e146-2e5d-4f42-8bf7-90352afe3c76',
      'abbe500e-c3d5-4e3f-bc6b-eda6af2b6703'
    ]
  },
  {
    id: 'G09_DEVLOGGER_CONSOLE',
    title: '[DevTools & Observabilidade] Console do Servidor, Antigravity DevLogger com Filtros e Ação Criar Card CRM',
    mainCardId: '22e1900a-90c6-4899-9e21-426dc427502d', // #64
    cards: [
      '22e1900a-90c6-4899-9e21-426dc427502d',
      '7eb6faec-ab77-45c6-8524-208539623a99',
      '78c34f5a-0114-4473-8b47-a67be75344fd',
      'f4506bfc-0f67-441e-9fc7-4c71454e6a8e'
    ]
  },
  {
    id: 'G10_WHATSMEOW_ENGINE',
    title: '[WhatsApp Engine Next-Gen] Substituição da Baileys por Whatsmeow Worker em Go e Conexão com Appwrite',
    mainCardId: '8fa0675b-cda5-4981-8923-13248289ccc5', // #65
    cards: [
      '8fa0675b-cda5-4981-8923-13248289ccc5',
      'a0251eb0-80ea-4395-9df0-7d7d242637b5',
      '7ba0ca8d-71b3-40e1-a96e-eb58fcba47ae',
      'cb0899dd-2384-4863-822e-2e564d6db5f1',
      '1984f9c7-5ebc-4c49-8e43-8e4ce2ee2a4c',
      '6554f03f-05bb-4cf1-bfe0-dafbda3f9c66',
      '1e0e3db9-c70e-4ddc-87da-35c911b30ea8',
      'e455e759-dd9a-4c28-98e3-ea7cb817a863',
      '55498644-b049-43ee-8ecf-7557161e3898',
      'd4e8c1ea-9428-406a-a681-ae45d3bc6be4',
      '1364a66e-e9fa-47cb-9565-df0a28f58b6e',
      '0132fc4a-581d-400c-a1ba-2f883da89ec4',
      '6ad0ac65-edf0-4c4a-a029-2ad4f75b404b',
      '45b795b2-5f67-4e24-9f76-3a6f004adf4f',
      '05e93d18-a880-4cf6-88ad-61e4d8ec3d90',
      'abf282af-3916-4c2d-b8f3-96c4a9470744',
      '44d1c682-de7c-4145-8961-ed30cf03c3d3',
      '0143f779-8cf9-46b0-b888-ca4ba9ee6079',
      '5ccb12b8-edbe-493d-8263-401674f7c63d',
      'e68770a9-83c7-497d-aa2d-a6021272fc47',
      'df14c5c2-60ff-4e78-95ef-fcefb1eb3e58',
      '803e5c7d-089c-4db3-ae09-826f1c422c54',
      'b3e6ab55-46e7-4de1-a206-0e2f9817ed53',
      '1ae59814-8528-4e21-b830-9997842d7c63',
      'ea9d378a-73c7-4ee8-a2c9-ca724c095733',
      '78f1e591-357d-46da-84d3-fc55e8f6a9b6',
      'f2e4a81a-c75c-42cb-bdfa-c6031b4028dc',
      'd9861baa-a82f-4c17-91f1-3315a6b738e4',
      '6b4f6c5a-350b-47e0-af9d-b4b1a473b6aa'
    ]
  },
  {
    id: 'G11_GEMINI_AI_CIRCUITBREAKER',
    title: '[AI Engine Next-Gen] Pool Multi-Keys Gemini, Rotação em Rate Limit e CircuitBreaker Resiliente',
    mainCardId: '99a58067-0a72-4dee-8b58-c2b0b28ceb29', // #44
    cards: [
      '99a58067-0a72-4dee-8b58-c2b0b28ceb29',
      '0a98efed-8a90-482a-9f5b-9d224213a863',
      '97b004e3-b6c0-467a-8cb3-3cc4ed453f4f',
      'ec05f8c9-536e-4361-9d75-775569165165',
      '21a9471e-d713-4c76-819c-fa086ee179e9',
      '821e2cb3-5b84-4103-a33a-96c41cf79828'
    ]
  },
  {
    id: 'G12_APPWRITE_PERSISTENCE',
    title: '[Arquitetura de Dados Next-Gen] Migração Integral de Queries Supabase para Appwrite Self-Hosted (chatboot_db)',
    mainCardId: '29f5c615-aaa1-46c9-8451-d87803f90ef5', // #43
    cards: [
      '29f5c615-aaa1-46c9-8451-d87803f90ef5',
      '015f300c-25ed-483b-bf74-7d0dfcb0e6c0',
      '715c8eb5-9219-4c5d-bdce-58c41acfff79',
      '3cdd95ef-0b53-48b6-9959-9bd1662dea31',
      '0b2aebde-5054-4e64-8fbd-91fb0e187ecc',
      '943e1d31-72b7-4a4e-b606-01a32dbf1b8b',
      '17e79cc0-93ad-4a81-8685-9cdb020ac70b'
    ]
  },
  {
    id: 'G13_GOVERNANCE_FILA_DEV',
    title: '[Governança & Automação] Aprimoramento da Skill \'Fila Dev\' e Análise Visual de Screenshots por IA',
    mainCardId: 'd6058114-d7b7-47e0-b10b-05ba5a1df786', // #15
    cards: [
      'd6058114-d7b7-47e0-b10b-05ba5a1df786',
      'b21153a2-d977-4a5e-9dd0-92e36f372425'
    ]
  }
];

// Validar cobertura de todos os 73 cartões
const mappedIds = new Set();
groups.forEach(g => {
  g.cards.forEach(id => {
    if (mappedIds.has(id)) {
      console.warn(`DUPLICADO no grupo ${g.id}: ${id}`);
    }
    mappedIds.add(id);
  });
});

console.log(`Total de cards cobertos pelos grupos: ${mappedIds.size} de ${cards.length}`);

// Cards que faltam se houver
const unmapped = cards.filter(c => !mappedIds.has(c.id));
if (unmapped.length > 0) {
  console.log('Cards não mapeados:', unmapped.map(u => ({ id: u.id, title: u.title })));
} else {
  console.log('PERFEITO! Todos os 73 cards foram mapeados com precisão cirúrgica!');
}
