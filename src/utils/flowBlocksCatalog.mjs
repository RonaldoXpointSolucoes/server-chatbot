let _seqCounter = 0;

function nextShortId(prefix = 'id') {
  _seqCounter = (_seqCounter + 1) % 100000;
  const rand = Math.random().toString(36).slice(2, 6);
  const ts = Date.now().toString(36).slice(-4);
  return `${prefix}-${ts}${_seqCounter.toString(36)}${rand}`;
}

export const PAUSABLE_FLOW_BLOCK_TYPES = new Set([
  'ask',
  'input',
  'number_input',
  'email_input',
  'website_input',
  'date_input',
  'time_input',
  'phone_input',
  'buttons',
  'poll',
  'pic_choice',
  'cards',
  'payment',
  'rating',
  'file_input',
  'handoff',
]);

export const FLOW_BLOCK_PALETTE = [
  // ===================== BUBBLES (5) =====================
  {
    type: 'send_message',
    label: 'Texto',
    category: 'Bubbles',
    supportsSimulator: true,
    supportsWhatsApp: true,
    instructions: {
      summary: 'Envia uma mensagem de texto formatada para o cliente com suporte a variáveis dinâmicas e links clicáveis.',
      howToUse: [
        'Arraste o bloco Texto para dentro de um Painel/Grupo existente ou solte no canvas.',
        'Dê clique duplo no texto ou use o painel direito Propriedades para editar a mensagem.',
        'Insira variáveis com {{pushName}}, {{saudacao}}, {{NomeEmpresa}} ou variáveis capturadas anteriormente.'
      ],
      variables: ['{{pushName}}', '{{saudacao}}', '{{NomeEmpresa}}', '{{cardapio}}'],
      whatsappBehavior: 'Envia mensagem de texto Baileys ({ text }) normalizando URLs com https:// e protegendo UUIDs contra quebra no WhatsApp Mobile, com pausa humanizada de 1,5s entre balões.',
      bestPractices: 'Evite blocos gigantes em uma única mensagem; quebre em 2-3 balões curtos para leitura natural no celular e sempre mantenha links com https://.',
      testTips: 'No simulador ou enviando o gatilho via Ronaldo-Web -> FoodNext, verifique se {{pushName}} e {{saudacao}} foram substituídos pelos dados reais do contato.'
    }
  },
  {
    type: 'image',
    label: 'Imagem',
    category: 'Bubbles',
    supportsSimulator: true,
    supportsWhatsApp: true,
    instructions: {
      summary: 'Envia uma imagem (PNG, JPG ou WebP) a partir de uma URL pública HTTPS, com legenda opcional.',
      howToUse: [
        'Selecione o bloco no canvas e preencha o campo "URL da Mídia / Embed" com um link HTTPS direto da imagem.',
        'Preencha "Legenda (Opcional)" aceitando negrito (*texto*) e variáveis como {{pushName}}.'
      ],
      variables: ['{{pushName}}', '{{NomeEmpresa}}'],
      whatsappBehavior: 'Baixa a mídia da URL no servidor Node.js e envia via Baileys como imageMessage nativo com miniatura e legenda.',
      bestPractices: 'Use URLs públicas diretas (sem exigir login/cookie) e arquivos menores que 5 MB para entrega instantânea na Baileys.',
      testTips: 'Teste com a imagem oficial https://chat-boot-theta.vercel.app/pwa-192x192.png para validar entrega real no WhatsApp antes de trocar pelo banner final.'
    }
  },
  {
    type: 'video',
    label: 'Vídeo',
    category: 'Bubbles',
    supportsSimulator: true,
    supportsWhatsApp: true,
    instructions: {
      summary: 'Envia um arquivo de vídeo MP4 via URL pública HTTPS com legenda opcional para o cliente.',
      howToUse: [
        'Informe no painel Propriedades a URL direta (.mp4) hospedada em CDN ou Storage público.',
        'Adicione uma legenda curta explicando o vídeo, se desejar.'
      ],
      variables: ['{{pushName}}', '{{NomeEmpresa}}'],
      whatsappBehavior: 'Envia via Baileys como videoMessage reproduzível diretamente no player do WhatsApp.',
      bestPractices: 'Prefira MP4 (H.264/AAC) abaixo de 16 MB; vídeos muito pesados podem sofrer timeout de download no socket.',
      testTips: 'Sempre valide no WhatsApp real (Ronaldo-Web) se o servidor de origem libera download sem bloqueio CORS/hotlink.'
    }
  },
  {
    type: 'embed',
    label: 'Incorporar',
    category: 'Bubbles',
    supportsSimulator: true,
    supportsWhatsApp: true,
    instructions: {
      summary: 'Envia um documento/PDF anexo (ou link de página incorporada) diretamente na conversa do WhatsApp.',
      howToUse: [
        'Informe a URL pública do arquivo (ex: catálogo PDF, contrato ou tabela) em "URL da Mídia / Embed".',
        'Defina "Nome do Arquivo / PDF" (ex: catalogo-xpoint.pdf) para aparecer corretamente no WhatsApp do cliente.'
      ],
      variables: ['{{NomeEmpresa}}'],
      whatsappBehavior: 'Envia como documentMessage no WhatsApp com o nome e mimetype adequados (.pdf, .png, etc.), ou como link clicável se configurado como link web.',
      bestPractices: 'Sempre inclua a extensão no Nome do Arquivo (ex: .pdf) para o Android/iOS abrir o visualizador correto sem erro.',
      testTips: 'Envie para Ronaldo-Web e clique para abrir o anexo no cliente WhatsApp verificando título e extensão.'
    }
  },
  {
    type: 'audio',
    label: 'Áudio',
    category: 'Bubbles',
    supportsSimulator: true,
    supportsWhatsApp: true,
    instructions: {
      summary: 'Envia uma mensagem de voz gravada (PTT) ou arquivo de áudio no WhatsApp a partir de uma URL pública.',
      howToUse: [
        'Cole a URL direta do áudio (.ogg, .mp3 ou .mp4/m4a) no campo "URL da Mídia / Embed".',
        'Combine antes com um bloco "Espera" se quiser simular gravação/digitação natural.'
      ],
      variables: [],
      whatsappBehavior: 'Dispara audioMessage com ptt: true (aparece como áudio de microfone gravado na hora no WhatsApp) detectando mimetype pela extensão.',
      bestPractices: 'Áudios curtos (5s a 30s) em MP3 ou OGG Opus garantem compatibilidade total em iPhone e Android.',
      testTips: 'Valide no aparelho/WhatsApp Web se a reprodução funciona sem ruído ou corte inicial.'
    }
  },

  // ===================== INPUTS (12) =====================
  {
    type: 'ask',
    label: 'Texto',
    category: 'Inputs',
    supportsSimulator: true,
    supportsWhatsApp: true,
    instructions: {
      summary: 'Faz uma pergunta aberta, pausa o robô aguardando a resposta do cliente e salva o texto digitado em uma variável.',
      howToUse: [
        'Escreva a pergunta em "Texto / Pergunta".',
        'Defina o nome da variável em "Salvar em Variável" (ex: nome_cliente ou observacao).',
        'Use {{nome_cliente}} nos próximos blocos para confirmar o valor recebido.'
      ],
      variables: ['Grava em: {{var_name}} (padrão user_response)'],
      whatsappBehavior: 'Envia o texto da pergunta e grava conversation_states.status = BOT_ACTIVE aguardando a próxima mensagem inbound do cliente.',
      bestPractices: 'Use perguntas diretas e claras e evite colocar dois Inputs seguidos no mesmo sentido sem feedback visual ao cliente.',
      testTips: 'Envie o gatilho via Ronaldo-Web, aguarde a pergunta da FoodNext e responda um nome para ver o próximo bloco ecoar {{var_name}}.'
    }
  },
  {
    type: 'number_input',
    label: 'Número',
    category: 'Inputs',
    supportsSimulator: true,
    supportsWhatsApp: true,
    instructions: {
      summary: 'Solicita um número ao cliente, limpa texto extra (como "R$" ou "unidades"), normaliza vírgula em ponto e salva em variável.',
      howToUse: [
        'Configure a pergunta pedindo quantidade, idade ou valor numérico.',
        'Defina "Salvar em Variável" (ex: quantidade).',
        'Opcionalmente ative a validação estrita para pedir novamente caso não contenha dígitos (com trava anti-loop de 3 tentativas).'
      ],
      variables: ['Grava em: {{var_name}} (valor numérico normalizado)'],
      whatsappBehavior: 'Pausa aguardando o cliente; ao receber resposta, extrai números e converte "," em "." antes de avaliar próximas condições (>, <, =).',
      bestPractices: 'Mantenha o limite máximo de tentativas (max 3) para não prender o cliente em loop se ele responder por extenso.',
      testTips: 'Teste enviando "2 unidades" ou "abc" -> "5" e confirme que a variável salva "2" / "5".'
    }
  },
  {
    type: 'email_input',
    label: 'Email',
    category: 'Inputs',
    supportsSimulator: true,
    supportsWhatsApp: true,
    instructions: {
      summary: 'Captura o endereço de e-mail do cliente, valida formato (presença de @ e domínio) e converte para minúsculas sem espaços.',
      howToUse: [
        'Informe o texto solicitando o e-mail (ex: "Qual seu melhor e-mail para envio da nota?").',
        'Defina a variável de destino (ex: email_cliente).'
      ],
      variables: ['Grava em: {{var_name}} (e-mail higienizado em minúsculas)'],
      whatsappBehavior: 'Pausa aguardando resposta; se o formato for inválido (ex: sem @), envia aviso amigável por até 3 tentativas antes de liberar ou seguir.',
      bestPractices: 'Sempre confirme o e-mail capturado no balão seguinte ({{email_cliente}}) para transmitir confiança.',
      testTips: 'Teste primeiro com "texto-invalido" para validar a mensagem de correção e depois envie "teste@xpoint.com.br".'
    }
  },
  {
    type: 'website_input',
    label: 'Website',
    category: 'Inputs',
    supportsSimulator: true,
    supportsWhatsApp: true,
    instructions: {
      summary: 'Captura uma URL/site informado pelo cliente e adiciona automaticamente https:// caso o cliente envie apenas www. ou domínio.',
      howToUse: [
        'Configure a pergunta solicitando o site ou link (ex: "Informe o site da sua empresa").',
        'Defina "Salvar em Variável" (ex: site_cliente).'
      ],
      variables: ['Grava em: {{var_name}} (URL normalizada com https://)'],
      whatsappBehavior: 'Normaliza domínios digitados sem protocolo para https://... facilitando cliques posteriores no CRM.',
      bestPractices: 'Explique no texto um exemplo como "ex: minhaempresa.com.br" para orientar usuários leigos.',
      testTips: 'Envie "xpointsolucoes.com.br" (sem https) e confirme que a variável salva "https://xpointsolucoes.com.br".'
    }
  },
  {
    type: 'date_input',
    label: 'Data',
    category: 'Inputs',
    supportsSimulator: true,
    supportsWhatsApp: true,
    instructions: {
      summary: 'Captura e padroniza uma data informada pelo cliente (ex: agendamento ou nascimento) no formato DD/MM/AAAA.',
      howToUse: [
        'Solicite a data deixando claro o formato esperado (ex: "Informe a data desejada (DD/MM/AAAA):").',
        'Defina a variável (ex: data_agendamento).'
      ],
      variables: ['Grava em: {{var_name}} (data formatada DD/MM/AAAA)'],
      whatsappBehavior: 'Aceita separadores "/" ou "-" e normaliza datas como 25-12-2026 ou 25/12/2026, solicitando correção se não houver dia/mês válidos (máx. 3 tentativas).',
      bestPractices: 'Sempre informe "(ex: 25/12/2026)" no enunciado para reduzir erros de digitação no WhatsApp.',
      testTips: 'Envie "25-11-2026" no chat de teste e valide que retorna "25/11/2026".'
    }
  },
  {
    type: 'phone_input',
    label: 'Telefone',
    category: 'Inputs',
    supportsSimulator: true,
    supportsWhatsApp: true,
    instructions: {
      summary: 'Captura um telefone/WhatsApp digitado, remove máscara e adiciona automaticamente DDI 55 para números brasileiros (10/11 dígitos).',
      howToUse: [
        'Peça o número com DDD (ex: "(11) 99999-9999").',
        'Defina a variável de saída (ex: whatsapp_contato).'
      ],
      variables: ['Grava em: {{var_name}} (apenas dígitos, ex: 5511975960999)'],
      whatsappBehavior: 'Extrai dígitos puros; se tiver 10 ou 11 dígitos sem DDI, prefixa com "55". Se tiver menos de 10 dígitos, pede correção até 3 vezes.',
      bestPractices: 'Lembre-se que {{telefone}} e {{remoteJid}} já vêm preenchidos automaticamente com o número que iniciou a conversa.',
      testTips: 'Envie "(11) 97596-0999" e confirme que a variável salva "5511975960999".'
    }
  },
  {
    type: 'buttons',
    label: 'Botão',
    category: 'Inputs',
    supportsSimulator: true,
    supportsWhatsApp: true,
    instructions: {
      summary: 'Envia um menu numerado estruturado (*1* - Opção A, *2* - Opção B...) com uma porta de saída individual para cada botão.',
      howToUse: [
        'Escreva o título/pergunta em "Texto / Pergunta".',
        'Lista as opções separadas por vírgula (ex: Comercial, Suporte, Financeiro).',
        'Puxe uma linha da bolinha laranja à direita de CADA opção até o grupo correspondente.'
      ],
      variables: ['Grava opção escolhida em: {{var_name}} (padrão opcao_menu)'],
      whatsappBehavior: 'Formata menu numerado legível e seguro contra bloqueios da Meta; aceita o cliente responder pelo número ("1", "2") ou pelo texto da opção. Se responder algo inválido, orienta sem pular errado.',
      bestPractices: 'Sempre conecte todas as opções criadas; respostas fora da lista nunca devem avançar para a primeira opção por acidente (trava com máx. 3 tentativas).',
      testTips: 'Teste clicando no botão no Simulador e enviando "1" ou "2" pelo Ronaldo-Web para checar o roteamento exato de cada porta.'
    }
  },
  {
    type: 'poll',
    label: 'Enquete Nativa',
    category: 'Inputs',
    supportsSimulator: true,
    supportsWhatsApp: true,
    instructions: {
      summary: 'Dispara uma Enquete Nativa clicável oficial do WhatsApp onde o cliente vota com 1 toque e o fluxo segue pela porta da opção votada.',
      howToUse: [
        'Escreva a pergunta principal da enquete em "Texto / Pergunta".',
        'Defina de 2 a 12 opções separadas por vírgula.',
        'Escolha se permite 1 escolha (recomendado para menus) ou múltipla escolha, e conecte cada porta de saída.'
      ],
      variables: ['Grava voto em: {{var_name}}'],
      whatsappBehavior: 'Envia pollCreationMessage oficial via Baileys; quando o cliente clica na enquete no WhatsApp, o EventProcessor decifra o voto criptografado (pollUpdateMessage) ou texto numérico ("1", "2") e retoma o fluxo automaticamente.',
      bestPractices: 'Use títulos curtos (até 40 caracteres) nas opções e evite enquetes com menos de 2 opções.',
      testTips: 'Dispare o fluxo na FoodNext e verifique a enquete no WhatsApp da Ronaldo-Web; vote tocando na opção ou respondendo o número correspondente.'
    }
  },
  {
    type: 'pic_choice',
    label: 'Seleção de Imagem',
    category: 'Inputs',
    supportsSimulator: true,
    supportsWhatsApp: true,
    instructions: {
      summary: 'Apresenta opções visuais numeradas (com imagens individuais opcionais + legendas) e direciona o fluxo conforme a escolha do cliente.',
      howToUse: [
        'Configure o enunciado e as opções no painel Propriedades.',
        'Opcionalmente preencha URL de imagem de cada item na seção de Cartões Visuais.',
        'Conecte a porta direita de cada item ao grupo de destino correspondente.'
      ],
      variables: ['Grava escolha em: {{var_name}}'],
      whatsappBehavior: 'Se houver URLs de imagem nos itens, envia as fotos com legenda numerada (*1*, *2*...) seguido do prompt; caso contrário, envia o menu visual numerado.',
      bestPractices: 'Limite a 2-4 imagens por bloco para não poluir a tela do cliente no celular.',
      testTips: 'Teste com 2 opções usando imagens leves HTTPS e responda "1" ou "2" pela caixa cliente.'
    }
  },
  {
    type: 'payment',
    label: 'Pagamento',
    category: 'Inputs',
    supportsSimulator: true,
    supportsWhatsApp: true,
    instructions: {
      summary: 'Envia os dados formatados de cobrança Pix (Valor, Chave Pix, Copia e Cola ou Link) e pode aguardar confirmação/comprovante do cliente.',
      howToUse: [
        'Preencha Valor, Chave Pix, Código Copia e Cola ou Link de Pagamento no card âmbar de Propriedades.',
        'Opcionalmente escreva uma mensagem personalizada ou deixe em branco para usar o template automático completo.',
        'Conecte a saída a um grupo de confirmação ("Comprovante recebido!").'
      ],
      variables: ['Lê: {{chave_pix}}, {{amount}} | Grava confirmação em: {{var_name}}'],
      whatsappBehavior: 'Monta bloco organizado com código Copia e Cola em monoespaçado fácil de copiar no WhatsApp Mobile e pausa aguardando retorno do cliente.',
      bestPractices: 'Use um bloco "Arquivo" logo depois ou aproveite a própria pausa do Pagamento para pedir o comprovante e encaminhar ao atendente.',
      testTips: 'No Simulador e WhatsApp, confira a formatação do valor e chave Pix e responda "Paguei" para avançar ao grupo de confirmação.'
    }
  },
  {
    type: 'rating',
    label: 'Avaliação',
    category: 'Inputs',
    supportsSimulator: true,
    supportsWhatsApp: true,
    instructions: {
      summary: 'Envia pesquisa de satisfação (NPS/Estrelas de 1 a 5), valida nota de 1 a 5 e grava tanto em {{var_name}} quanto em {{avaliacao_nota}}.',
      howToUse: [
        'Personalize a pergunta de avaliação (ex: "Como foi seu atendimento hoje?").',
        'Defina o nome da variável (ex: nota_nps).',
        'Conecte uma Condição em seguida se quiser tratar notas baixas (<= 2) diferente das notas altas.'
      ],
      variables: ['Grava em: {{var_name}} e {{avaliacao_nota}} (1 a 5)'],
      whatsappBehavior: 'Exibe escala visual de 1 (Péssimo) a 5 (Excelente). Se o cliente digitar algo sem número de 1 a 5, solicita nota válida (máx. 3 tentativas anti-loop).',
      bestPractices: 'Coloque a Avaliação perto do encerramento ou antes do comando close_ticket.',
      testTips: 'Responda "5" (ou "4 estrelas") e verifique no próximo balão que {{avaliacao_nota}} exibiu o número exato.'
    }
  },
  {
    type: 'file_input',
    label: 'Arquivo',
    category: 'Inputs',
    supportsSimulator: true,
    supportsWhatsApp: true,
    instructions: {
      summary: 'Solicita que o cliente envie um arquivo, imagem, áudio ou documento PDF no WhatsApp e salva o anexo/URL ou descrição na variável.',
      howToUse: [
        'Escreva a instrução solicitando o envio (ex: "Envie a foto do comprovante ou PDF aqui:").',
        'Configure a variável de destino (ex: arquivo_comprovante).'
      ],
      variables: ['Grava URL/descrição do anexo em: {{var_name}}'],
      whatsappBehavior: 'Pausa em BOT_ACTIVE; aceita documentos PDF mesmo SEM legenda e imagens/áudios, armazenando a media_url (quando enviada) ou indicação do arquivo recebido.',
      bestPractices: 'Oriente o cliente sobre quais formatos aceita (PDF, foto nítida) e confirme o recebimento no próximo balão.',
      testTips: 'Envie uma imagem ou PDF sem legenda da caixa Ronaldo-Web para FoodNext e confirme que o fluxo retoma sem travar.'
    }
  },

  // ===================== CONDICIONAIS (9) =====================
  {
    type: 'set_variable',
    label: 'Variável',
    category: 'Condicionais',
    supportsSimulator: true,
    supportsWhatsApp: true,
    instructions: {
      summary: 'Define ou recalcula uma variável interna silenciosamente (sem enviar mensagem ao cliente) para uso em condições, textos ou webhooks.',
      howToUse: [
        'Informe o nome da variável em "Salvar em Variável" (ex: etapa_atendimento).',
        'Preencha "Texto / Pergunta" (valor da variável) aceitando texto fixo ou outras variáveis como "Cliente {{pushName}}".'
      ],
      variables: ['Grava em: {{var_name}}'],
      whatsappBehavior: 'Executa instantaneamente no servidor atualizando conversation_states.variables sem disparar nenhuma mensagem no WhatsApp.',
      bestPractices: 'Evite nomes com espaços ou acentos nas variáveis (prefira snake_case como valor_total ou status_loja).',
      testTips: 'Defina var_teste = "XPoint-OK" antes de um balão de Texto e confira {{var_teste}} impresso na resposta.'
    }
  },
  {
    type: 'condition',
    label: 'Condição',
    category: 'Condicionais',
    supportsSimulator: true,
    supportsWhatsApp: true,
    instructions: {
      summary: 'Roteia a conversa em múltiplos caminhos lógicos (SE variável = valor ... SENÃO fallback), cada um com sua própria porta de saída.',
      howToUse: [
        'Clique em "+ Regra SE" para adicionar uma ou mais condições na lista.',
        'Em cada regra, informe Variável, Operador (=, ≠, Contém, >, <, Existe) e Valor esperado.',
        'Ligue a porta direita de cada "SE #N" ao seu grupo destino e a porta "Senão" ao caminho alternativo.'
      ],
      variables: ['Lê qualquer variável configurada em cada item (ex: NumeroMenu, aberta, nota_nps)'],
      whatsappBehavior: 'Avalia item por item de cima para baixo usando comparação case-insensitive; o primeiro que casar segue pela porta exata (item.id), ou cai na porta "-else" (Senão).',
      bestPractices: 'Sempre conecte a porta "Senão" a uma mensagem amigável ou retorno seguro; se ligar "Senão" de volta a um menu, use um bloco Pausável no meio para evitar loop infinito.',
      testTips: 'Teste os 3 cenários: valor que casa com SE #1, valor que casa com SE #2 e valor fora da lista caindo no Senão.'
    }
  },
  {
    type: 'redirect',
    label: 'Redirecionar',
    category: 'Condicionais',
    supportsSimulator: true,
    supportsWhatsApp: true,
    instructions: {
      summary: 'Envia um link de redirecionamento externo clicável ao cliente no WhatsApp (ou redireciona para outro fluxo modular).',
      howToUse: [
        'Informe a URL de destino em "URL de Redirecionamento" (ex: https://chat-boot-theta.vercel.app) e texto opcional.',
        'Alternativamente selecione um subfluxo se quiser transferir a execução para outro fluxo publicado.'
      ],
      variables: ['Aceita {{variavel}} dentro da URL ou do texto introdutório'],
      whatsappBehavior: 'No WhatsApp Web/Mobile não é possível abrir abas do navegador à força, então o bot envia o link formatado com https:// e preview clicável.',
      bestPractices: 'Sempre use URLs completas iniciadas por https:// e acompanhe com uma chamada à ação clara ("Toque no link acima").',
      testTips: 'Teste no Simulador e no WhatsApp se o link chega clicável com https:// preservado.'
    }
  },
  {
    type: 'script',
    label: 'Script',
    category: 'Condicionais',
    supportsSimulator: true,
    supportsWhatsApp: true,
    instructions: {
      summary: 'Executa lógica JavaScript segura (sandbox com timeout de 100ms) para cálculos, formatação de JSON de Webhooks ou manipulação de texto.',
      howToUse: [
        'No campo "Código JavaScript (Sandbox)", use o objeto `vars` para ler variáveis e retorne o resultado com `return ...`.',
        'Configure "Salvar em Variável" para guardar o valor retornado (ou use `setVar("chave", valor)`).'
      ],
      variables: ['Lê todas via `vars.nome` | Grava retorno em: {{var_name}}'],
      whatsappBehavior: 'Roda isolado em node:vm no backend sem acesso a rede/disco/processo e com limite rígido de 100ms anti-loop; atualiza as variáveis no Supabase em seguida.',
      bestPractices: 'Mantenha scripts curtos e puros (cálculos, JSON.parse, formatação). Nunca faça laços sem limite; o timeout de 100ms aborta travamentos automaticamente.',
      testTips: 'Use `return Number(vars.qtd || 2) * 25;` salvando em `total_calculado` e imprima R$ {{total_calculado}} no bloco seguinte.'
    }
  },
  {
    type: 'typebot_link',
    label: 'Typebot',
    category: 'Condicionais',
    supportsSimulator: true,
    supportsWhatsApp: true,
    instructions: {
      summary: 'Transfere a conversa atual para outro Fluxo modular já publicado na mesma empresa (subfluxo reutilizável).',
      howToUse: [
        'Selecione no painel direito qual fluxo de destino deseja chamar (precisa estar Publicado no Ar).',
        'As variáveis já capturadas (nome, telefone, respostas) são preservadas para o subfluxo.'
      ],
      variables: ['Preserva todas as variáveis existentes do atendimento'],
      whatsappBehavior: 'Troca o ponteiro flow_version_id da sessão atual para o fluxo de destino e continua executando a partir do nó inicial dele (máx. 5 saltos entre subfluxos anti-loop).',
      bestPractices: 'NUNCA aponte um fluxo para ele mesmo (auto-referência) nem crie ciclo Fluxo A -> Fluxo B -> Fluxo A sem pausa; o validador detecta e alerta antes de publicar.',
      testTips: 'Crie um subfluxo simples de "Pesquisa NPS", publique-o e chame-o a partir do fluxo principal para validar transição.'
    }
  },
  {
    type: 'wait',
    label: 'Espera',
    category: 'Condicionais',
    supportsSimulator: true,
    supportsWhatsApp: true,
    instructions: {
      summary: 'Aguarda N segundos exibindo o status "digitando..." ao cliente no WhatsApp para tornar o atendimento mais natural.',
      howToUse: [
        'Informe o tempo desejado em "Tempo (Segundos)" (entre 1 e 10 segundos no WhatsApp).',
        'Conecte a saída para o próximo bloco que deverá aparecer logo após a pausa.'
      ],
      variables: [],
      whatsappBehavior: 'Dispara presença `composing` ("digitando...") na Baileys, aguarda os segundos configurados (limitado a 10s por segurança) e envia `paused` antes de prosseguir.',
      bestPractices: 'Use entre 1s e 3s antes de mensagens longas ou após chamadas de API; tempos acima de 10s são truncados para não expirar o tick.',
      testTips: 'Observe na conversa da Ronaldo-Web o indicador "digitando..." aparecer antes da resposta seguinte da FoodNext.'
    }
  },
  {
    type: 'jump',
    label: 'Pular',
    category: 'Condicionais',
    supportsSimulator: true,
    supportsWhatsApp: true,
    instructions: {
      summary: 'Salta a execução diretamente para o primeiro bloco de outro Grupo/Painel do mesmo fluxo (ex: voltar ao Menu Principal).',
      howToUse: [
        'Selecione no dropdown "Pular para o Grupo (Destino)" qual painel deve receber a execução.',
        'Útil ao final de uma sub-etapa quando o cliente escolheu "Voltar ao Menu".'
      ],
      variables: ['Mantém todas as variáveis da conversa'],
      whatsappBehavior: 'Redireciona o ponteiro para o primeiro bloco do grupo destino. Possui trava anti-loop que detecta se o mesmo bloco rodar repetidamente sem pausa no mesmo turno.',
      bestPractices: 'NUNCA use Pular formando ciclo que não passe por um bloco de Input (Botão, Pergunta, Enquete). Ciclos sem pausa serão bloqueados pelo detector anti-loop.',
      testTips: 'Conecte um Jump de volta ao Menu somente após uma opção escolhida pelo usuário e confirme a reexibição controlada.'
    }
  },
  {
    type: 'ab_test',
    label: 'Teste AB',
    category: 'Condicionais',
    supportsSimulator: true,
    supportsWhatsApp: true,
    instructions: {
      summary: 'Divide aleatoriamente os clientes entre Caminho A e Caminho B conforme a porcentagem configurada para testar variações de texto.',
      howToUse: [
        'Defina no painel Propriedades o percentual da Variante A (ex: 50% para A e 50% para B).',
        'Conecte a porta "A" a um grupo e a porta "B" ao grupo alternativo.'
      ],
      variables: ['Grava em: {{var_name}} (ou {{ab_variant}}) os valores "A" ou "B"'],
      whatsappBehavior: 'Sorteia uma variante por execução respeitando o peso percentual configurado e roteia apenas pelo ramo escolhido.',
      bestPractices: 'Para validação determinística em testes, deixe 100% em A ou cheque qual variante foi gravada em {{ab_variant}} no balão seguinte.',
      testTips: 'Use 50/50 no Simulador clicando várias vezes em Reiniciar para observar o sorteio alternar entre Variante A e Variante B.'
    }
  },
  {
    type: 'webhook',
    label: 'Webhook',
    category: 'Condicionais',
    supportsSimulator: true,
    supportsWhatsApp: true,
    instructions: {
      summary: 'Faz requisição HTTP REST (GET, POST, PUT ou DELETE) para APIs/ERPs externos e salva a resposta JSON em uma variável.',
      howToUse: [
        'Escolha o Método HTTP (GET não envia body; POST/PUT aceitam body JSON personalizado).',
        'Informe a Webhook URL e a "Variável de Retorno" (ex: status_api).',
        'Opcional: preencha "Caminho JSON de Extração" (ex: status ou data.aberto) para extrair um campo específico.'
      ],
      variables: ['Grava retorno em: {{response_var_name}} e HTTP status em {{response_var_name_status}}'],
      whatsappBehavior: 'Executa no servidor Node.js com timeout de 10s (suportando variáveis {{...}} na URL e no JSON body) sem travar a fila caso a API externa caia.',
      bestPractices: 'Use método GET para consultas (sem body) e sempre conecte uma Condição tratando caso a API retorne vazio ou erro.',
      testTips: 'Use o botão "Testar Webhook Agora" no painel direito ou aponte para https://wh1ss8sy848ufj6zh8t492y7.69.62.92.212.sslip.io/health (GET, extração: status) para receber "ok" ao vivo.'
    }
  },

  // ===================== EVENTOS (4) =====================
  {
    type: 'start',
    label: 'Início',
    category: 'Eventos',
    supportsSimulator: true,
    supportsWhatsApp: true,
    instructions: {
      summary: 'Marca explicitamente o ponto de entrada por onde o fluxo começa quando um gatilho (palavra-chave ou ALL) é acionado.',
      howToUse: [
        'Mantenha exatamente um bloco Início conectado ao primeiro grupo de mensagens.',
        'Configure os gatilhos reais (ex: "oi", "#teste") na aba Configurações.'
      ],
      variables: ['Inicializa: {{pushName}}, {{saudacao}}, {{NomeEmpresa}}, {{remoteJid}}, {{telefone}}, {{data_atual}}, {{hora_atual}}'],
      whatsappBehavior: 'Quando o EventProcessor casa uma mensagem recebida com as trigger_rules publicadas do fluxo, o FlowEngine inicia pelo nó que contém o bloco Início.',
      bestPractices: 'Para testes entre caixas da mesma empresa, configure na aba Configurações um gatilho único (ex: #teste) e restrinja à caixa de teste (FoodNext) para não responder clientes reais.',
      testTips: 'Clique em Play no painel que contém o Início ou envie a palavra-chave configurada pela Ronaldo-Web para a FoodNext.'
    }
  },
  {
    type: 'handoff',
    label: 'Atendente Humano',
    category: 'Eventos',
    supportsSimulator: true,
    supportsWhatsApp: true,
    instructions: {
      summary: 'Envia mensagem opcional de despedida/aviso, encerra o robô e transfere o atendimento para um operador humano no chat.',
      howToUse: [
        'Opcionalmente escreva a mensagem de aviso (ex: "Transferindo você para nossa equipe...").',
        'Conecte este bloco ao final dos ramos onde um humano deve assumir.'
      ],
      variables: ['Aceita variáveis no texto de transferência'],
      whatsappBehavior: 'Envia a mensagem configurada ao cliente, marca conversation_states como HANDOFF_HUMAN e atualiza a conversa no CRM (status = open, ai_paused = true) para impedir novos disparos do bot.',
      bestPractices: 'Sempre finalize ramos humanos com Atendente Humano para que o cliente não fique preso em estado BOT_ACTIVE.',
      testTips: 'Após atingir o Atendente Humano no teste, envie outra mensagem da Ronaldo-Web e verifique que o bot permanece silenciado.'
    }
  },
  {
    type: 'reply',
    label: 'Reply',
    category: 'Eventos',
    supportsSimulator: true,
    supportsWhatsApp: true,
    instructions: {
      summary: 'Responde citando (Quote / Responder mensagem) diretamente a última mensagem enviada pelo cliente no WhatsApp.',
      howToUse: [
        'Configure o texto da resposta em "Texto / Pergunta".',
        'Deixe marcada a opção "Citar mensagem recebida (Quote)" para vincular visualmente à mensagem anterior do cliente.'
      ],
      variables: ['Aceita {{pushName}} e variáveis anteriores da conversa'],
      whatsappBehavior: 'Envia via Baileys com `{ quoted: rawPayload }` usando a chave exata da última mensagem recebida naquele turno.',
      bestPractices: 'Ideal logo após um Input (Pergunta/Número/Botão) quando você quer destacar exatamente a qual resposta do usuário o robô está reagindo.',
      testTips: 'Coloque um Pergunta -> Reply "Recebi sua resposta!" e confirme no WhatsApp da Ronaldo-Web que a resposta chega com balão de citação.'
    }
  },
  {
    type: 'command',
    label: 'Comando',
    category: 'Eventos',
    supportsSimulator: true,
    supportsWhatsApp: true,
    instructions: {
      summary: 'Executa ações internas automáticas no CRM do ChatBoot durante o fluxo (aplicar etiqueta, atualizar nome do contato, pausar/reativar IA ou finalizar ticket).',
      howToUse: [
        'Selecione a Ação CRM desejada no painel Propriedades (ex: Adicionar Etiqueta, Atualizar Nome, Encerrar Ticket).',
        'Preencha o Parâmetro/Valor (ex: nome da etiqueta ou {{nome_cliente}}) aceitando interpolação de variáveis.'
      ],
      variables: ['Aceita variáveis {{...}} no valor do comando'],
      whatsappBehavior: 'Executa a operação silenciosamente no Supabase (`contacts` / `conversations` / `conversation_states`) sem poluir o WhatsApp do cliente e avança para o próximo bloco.',
      bestPractices: 'Excelente para classificar leads automaticamente ("Cliente VIP", "Suporte") antes de transferir para um atendente humano.',
      testTips: 'Configure Comando -> "Atualizar Nome do Contato" ou "Adicionar Etiqueta" com texto "teste-blocos" e confira o efeito registrado no CRM/logs.'
    }
  }
];

const BLOCK_SPEC_MAP = new Map(FLOW_BLOCK_PALETTE.map((item) => [item.type, item]));

const TYPE_ALIASES = {
  text: 'send_message',
  message: 'send_message',
  text_input: 'ask',
  input: 'ask',
  delay: 'wait',
};

export function resolveBlockTypeAlias(type) {
  return TYPE_ALIASES[type] || type;
}

export function getFlowBlockSpec(type) {
  return BLOCK_SPEC_MAP.get(resolveBlockTypeAlias(type));
}

/**
 * Gera bloco inicial devidamente estruturado e pronto para edição/execução ao arrastar ou adicionar ao canvas.
 */
export function createDefaultBlockForType(type, labelOverride) {
  const canonicalType = resolveBlockTypeAlias(type);
  const spec = getFlowBlockSpec(canonicalType);
  const label = labelOverride || spec?.label || canonicalType;
  const base = {
    id: nextShortId(canonicalType),
    flowType: canonicalType,
    label,
    text: '',
    var_name: '',
  };

  switch (canonicalType) {
    case 'send_message':
      return { ...base, text: 'Olá {{pushName}}! Como posso ajudar hoje?' };
    case 'image':
      return { ...base, url: 'https://chat-boot-theta.vercel.app/pwa-192x192.png', caption: 'Confira nossa imagem!' };
    case 'video':
      return { ...base, url: '', caption: 'Veja este vídeo rápido' };
    case 'embed':
      return { ...base, url: 'https://chat-boot-theta.vercel.app/pwa-192x192.png', fileName: 'documento-informativo.png' };
    case 'audio':
      return { ...base, url: '' };
    case 'ask':
      return { ...base, text: 'Qual é o seu nome completo?', var_name: 'nome_cliente' };
    case 'number_input':
      return { ...base, text: 'Informe a quantidade desejada (somente números):', var_name: 'quantidade', validate: true, max_retries: 3 };
    case 'email_input':
      return { ...base, text: 'Qual é o seu melhor e-mail?', var_name: 'email_cliente', validate: true, max_retries: 3 };
    case 'website_input':
      return { ...base, text: 'Qual é o site da sua empresa? (ex: xpointsolucoes.com.br)', var_name: 'site_cliente', validate: true, max_retries: 3 };
    case 'date_input':
      return { ...base, text: 'Informe a data desejada (ex: DD/MM/AAAA):', var_name: 'data_escolhida', validate: true, max_retries: 3 };
    case 'phone_input':
      return { ...base, text: 'Informe o WhatsApp com DDD (ex: 11 99999-9999):', var_name: 'telefone_contato', validate: true, max_retries: 3 };
    case 'buttons':
      return {
        ...base,
        text: 'Escolha uma das opções abaixo:',
        var_name: 'opcao_menu',
        options: ['Comercial', 'Suporte Técnico'],
        max_retries: 3,
      };
    case 'poll':
      return {
        ...base,
        text: 'Selecione uma opção na enquete:',
        var_name: 'voto_enquete',
        options: ['Quero Orçamento', 'Preciso de Suporte'],
        selectableCount: 1,
        max_retries: 3,
      };
    case 'pic_choice':
      return {
        ...base,
        text: 'Escolha uma opção visual:',
        var_name: 'escolha_imagem',
        options: ['Modelo Padrão', 'Modelo Pro'],
        choiceItems: [
          { content: 'Modelo Padrão', pictureSrc: 'https://chat-boot-theta.vercel.app/pwa-192x192.png' },
          { content: 'Modelo Pro', pictureSrc: 'https://chat-boot-theta.vercel.app/icon-circle-192x192.png' },
        ],
        max_retries: 3,
      };
    case 'payment':
      return {
        ...base,
        amount: '49,90',
        pix_key: 'financeiro@xpointsolucoes.com.br',
        pix_code: '',
        payment_link: '',
        text: '',
        var_name: 'status_pagamento',
      };
    case 'rating':
      return {
        ...base,
        text: 'De 1 a 5, como você avalia nosso atendimento?',
        var_name: 'nota_avaliacao',
        validate: true,
        max_retries: 3,
      };
    case 'file_input':
      return {
        ...base,
        text: 'Por favor, envie uma foto, áudio ou arquivo PDF por aqui:',
        var_name: 'arquivo_cliente',
      };
    case 'set_variable':
      return { ...base, var_name: 'etapa_atual', text: 'triagem_inicial' };
    case 'condition': {
      const id = base.id;
      return {
        ...base,
        var_name: 'opcao_menu',
        variable: 'opcao_menu',
        operator: '=',
        value: '1',
        items: [
          { id: `${id}-item-1`, varName: 'opcao_menu', operator: '=', value: '1', label: 'SE opcao_menu = 1' },
          { id: `${id}-item-2`, varName: 'opcao_menu', operator: '=', value: '2', label: 'SE opcao_menu = 2' },
        ],
        hasElse: true,
      };
    }
    case 'redirect':
      return {
        ...base,
        url: 'https://chat-boot-theta.vercel.app',
        text: 'Acesse nosso portal oficial no link abaixo:',
      };
    case 'script':
      return {
        ...base,
        var_name: 'resultado_script',
        script_code: 'return `Olá ${vars.pushName || "Cliente"}, cálculo: ${Number(vars.qtd || 2) * 10}`;',
      };
    case 'typebot_link':
      return { ...base, target_flow_id: '' };
    case 'wait':
      return { ...base, wait_time: 2 };
    case 'jump':
      return { ...base, target_group_id: '', target_group_name: '' };
    case 'ab_test':
      return { ...base, split_percent: 50, var_name: 'variante_ab' };
    case 'webhook':
      return {
        ...base,
        method: 'GET',
        url: 'https://wh1ss8sy848ufj6zh8t492y7.69.62.92.212.sslip.io/health',
        response_var_name: 'api_status',
        response_path: 'status',
      };
    case 'start':
      return { ...base, text: 'Ponto de Partida' };
    case 'handoff':
      return { ...base, text: 'Estou transferindo seu atendimento para um especialista humano. Aguarde um instante!' };
    case 'reply':
      return { ...base, text: 'Recebemos sua mensagem e já estamos dando sequência!', quote_message: true };
    case 'command':
      return { ...base, command_action: 'add_tag', command_value: 'atendimento-bot', var_name: 'ultimo_comando' };
    default:
      return base;
  }
}

function makeGroup(label, blocks, position) {
  const id = nextShortId('group');
  return {
    id,
    type: 'typebot_group',
    position,
    data: {
      id,
      label,
      blocks,
    },
  };
}

function makeEdge(sourceGroupId, sourceHandle, targetGroupId, label) {
  return {
    id: nextShortId('edge'),
    source: sourceGroupId,
    sourceHandle,
    target: targetGroupId,
    targetHandle: `${targetGroupId}-in`,
    ...(label ? { label } : {}),
    type: 'smoothstep',
    animated: true,
    style: { stroke: '#818cf8', strokeWidth: 3 },
  };
}

/**
 * Gera um mini-fluxo técnico funcional e pronto para testar no Simulador ou no WhatsApp para cada um dos 30 botões.
 */
export function buildBlockExampleFlow(type, options = {}) {
  type = resolveBlockTypeAlias(type);
  const existingNodes = Array.isArray(options.existingNodes) ? options.existingNodes : [];
  const companyName = options.companyName || 'X-Point Soluções';
  const maxY = existingNodes.length > 0
    ? Math.max(...existingNodes.map((n) => Number(n?.position?.y || 0))) + 320
    : 80;
  const baseX = 120;
  const baseY = maxY;
  const spec = getFlowBlockSpec(type);
  const labelTitle = spec ? `${spec.category}: ${spec.label}` : type;

  // Helpers para fluxos simples de 2 passos (Bloco Alvo -> Confirmação)
  const buildLinearTwoStep = (mainLabel, mainBlock, nextBlockText, description) => {
    const confirmBlock = {
      ...createDefaultBlockForType('send_message'),
      text: nextBlockText,
    };
    const g1 = makeGroup(`Exemplo • ${mainLabel}`, [mainBlock], { x: baseX, y: baseY });
    const g2 = makeGroup('Confirmação (Saída)', [confirmBlock], { x: baseX + 410, y: baseY });
    const edge = makeEdge(g1.id, mainBlock.id, g2.id);
    return {
      title: `Exemplo Funcional: ${labelTitle}`,
      description,
      triggerSuggestion: `#teste-${type}`,
      nodes: [g1, g2],
      edges: [edge],
      focusGroupId: g1.id,
    };
  };

  switch (type) {
    case 'send_message': {
      const b1 = {
        ...createDefaultBlockForType('send_message'),
        text: `{{saudacao}}, {{pushName}}! Bem-vindo à *${companyName}*.\nVeja nosso portal: https://chat-boot-theta.vercel.app`,
      };
      return buildLinearTwoStep('Texto', b1, '✅ Exemplo de Texto concluído com interpolação e link https:// clicável!', 'Envia mensagem personalizada com variáveis automáticas e URL normalizada.');
    }
    case 'image': {
      const b1 = {
        ...createDefaultBlockForType('image'),
        url: 'https://chat-boot-theta.vercel.app/pwa-192x192.png',
        caption: `🖼️ Logo oficial de exemplo (${companyName})`,
      };
      return buildLinearTwoStep('Imagem', b1, '✅ Imagem entregue! Próximo passo do atendimento executado.', 'Envia imagem real hospedada em HTTPS com legenda personalizada.');
    }
    case 'video': {
      const b1 = {
        ...createDefaultBlockForType('video'),
        url: 'https://www.w3schools.com/html/mov_bbb.mp4',
        caption: '🎬 Vídeo demonstrativo enviado automaticamente',
      };
      return buildLinearTwoStep('Vídeo', b1, '✅ Bloco de Vídeo validado no fluxo!', 'Envia MP4 público com legenda para reprodução nativa no WhatsApp.');
    }
    case 'embed': {
      const b1 = {
        ...createDefaultBlockForType('embed'),
        url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
        fileName: 'manual-exemplo-xpoint.pdf',
      };
      return buildLinearTwoStep('Incorporar / PDF', b1, '✅ Arquivo PDF anexado e enviado ao cliente!', 'Anexa e envia documento PDF/arquivo a partir de URL pública.');
    }
    case 'audio': {
      const b1 = {
        ...createDefaultBlockForType('audio'),
        url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
      };
      return buildLinearTwoStep('Áudio (Voz)', b1, '✅ Nota de áudio disparada no fluxo!', 'Dispara arquivo de áudio como mensagem de voz PTT na conversa.');
    }
    case 'ask': {
      const b1 = {
        ...createDefaultBlockForType('ask'),
        text: '📝 *Teste Input Texto*\nPor favor, digite seu *nome ou apelido* para testar a captura:',
        var_name: 'nome_digitado',
      };
      return buildLinearTwoStep('Input Texto', b1, 'Prazer em falar com você, *{{nome_digitado}}*! Variável capturada com sucesso.', 'Pausa o atendimento, captura o texto respondido e ecoa em {{nome_digitado}}.');
    }
    case 'number_input': {
      const b1 = {
        ...createDefaultBlockForType('number_input'),
        text: '🔢 *Teste Input Número*\nQuantas licenças/unidades você deseja cotar?',
        var_name: 'qtd_licencas',
      };
      return buildLinearTwoStep('Input Número', b1, '✅ Quantidade registrada: *{{qtd_licencas}}* unidade(s).', 'Extrai números válidos (inclusive com vírgula decimal) e salva em {{qtd_licencas}}.');
    }
    case 'email_input': {
      const b1 = {
        ...createDefaultBlockForType('email_input'),
        text: '📧 *Teste Input Email*\nDigite seu endereço de e-mail para envio da proposta:',
        var_name: 'email_proposta',
      };
      return buildLinearTwoStep('Input Email', b1, '✅ E-mail validado e salvo: `{{email_proposta}}`', 'Valida presença de @ e domínio, higieniza para minúsculas e confirma.');
    }
    case 'website_input': {
      const b1 = {
        ...createDefaultBlockForType('website_input'),
        text: '🌐 *Teste Input Website*\nInforme o domínio ou site da sua empresa (ex: xpointsolucoes.com.br):',
        var_name: 'site_empresa',
      };
      return buildLinearTwoStep('Input Website', b1, '✅ Link normalizado com HTTPS: {{site_empresa}}', 'Recebe domínio do usuário, normaliza para https:// e exibe clicável.');
    }
    case 'date_input': {
      const b1 = {
        ...createDefaultBlockForType('date_input'),
        text: '📅 *Teste Input Data*\nInforme uma data para agendamento (formato DD/MM/AAAA):',
        var_name: 'data_agendada',
      };
      return buildLinearTwoStep('Input Data', b1, '✅ Data agendada com sucesso para *{{data_agendada}}*!', 'Valida dia/mês/ano e padroniza a data no formato brasileiro DD/MM/AAAA.');
    }
    case 'phone_input': {
      const b1 = {
        ...createDefaultBlockForType('phone_input'),
        text: '📱 *Teste Input Telefone*\nDigite um WhatsApp com DDD (ex: 11 97596-0999):',
        var_name: 'whatsapp_informado',
      };
      return buildLinearTwoStep('Input Telefone', b1, '✅ Telefone padronizado com DDI: *{{whatsapp_informado}}*', 'Remove máscara e adiciona DDI 55 automaticamente para números BR.');
    }
    case 'buttons': {
      const b1 = {
        ...createDefaultBlockForType('buttons'),
        text: '🎯 *Exemplo de Menu com Botões*\nEscolha para onde deseja seguir:',
        var_name: 'opcao_botao',
        options: ['Ver Planos', 'Falar com Técnico'],
      };
      const g1 = makeGroup('Exemplo • Menu Botões', [b1], { x: baseX, y: baseY });
      const bOpt1 = { ...createDefaultBlockForType('send_message'), text: '💼 Você escolheu *1 - Ver Planos*! Variável: {{opcao_botao}}' };
      const bOpt2 = { ...createDefaultBlockForType('send_message'), text: '🛠️ Você escolheu *2 - Falar com Técnico*! Variável: {{opcao_botao}}' };
      const g2 = makeGroup('Ramo 1 • Planos', [bOpt1], { x: baseX + 420, y: baseY - 60 });
      const g3 = makeGroup('Ramo 2 • Técnico', [bOpt2], { x: baseX + 420, y: baseY + 140 });
      return {
        title: `Exemplo Funcional: ${labelTitle}`,
        description: 'Menu interativo numerado com cada opção roteando para um grupo diferente.',
        triggerSuggestion: `#teste-buttons`,
        nodes: [g1, g2, g3],
        edges: [
          makeEdge(g1.id, `${b1.id}-opt-0`, g2.id, '1 - Ver Planos'),
          makeEdge(g1.id, `${b1.id}-opt-1`, g3.id, '2 - Falar com Técnico'),
        ],
        focusGroupId: g1.id,
      };
    }
    case 'poll': {
      const b1 = {
        ...createDefaultBlockForType('poll'),
        text: '📊 Enquete Teste: Qual setor deseja acionar?',
        var_name: 'voto_setor',
        options: ['Comercial', 'Suporte'],
        selectableCount: 1,
      };
      const g1 = makeGroup('Exemplo • Enquete Nativa', [b1], { x: baseX, y: baseY });
      const bOpt1 = { ...createDefaultBlockForType('send_message'), text: '✅ Voto recebido em *Comercial* ({{voto_setor}})!' };
      const bOpt2 = { ...createDefaultBlockForType('send_message'), text: '✅ Voto recebido em *Suporte* ({{voto_setor}})!' };
      const g2 = makeGroup('Ramo Comercial', [bOpt1], { x: baseX + 420, y: baseY - 60 });
      const g3 = makeGroup('Ramo Suporte', [bOpt2], { x: baseX + 420, y: baseY + 140 });
      return {
        title: `Exemplo Funcional: ${labelTitle}`,
        description: 'Dispara Enquete Nativa clicável do WhatsApp com decifração automática do voto.',
        triggerSuggestion: `#teste-poll`,
        nodes: [g1, g2, g3],
        edges: [
          makeEdge(g1.id, `${b1.id}-opt-0`, g2.id, '1 - Comercial'),
          makeEdge(g1.id, `${b1.id}-opt-1`, g3.id, '2 - Suporte'),
        ],
        focusGroupId: g1.id,
      };
    }
    case 'pic_choice': {
      const b1 = {
        ...createDefaultBlockForType('pic_choice'),
        text: '🖼️ *Exemplo Seleção de Imagem*\nResponda *1* ou *2* para selecionar o card:',
        var_name: 'card_escolhido',
        options: ['Layout Light', 'Layout Dark'],
        choiceItems: [
          { content: 'Layout Light', pictureSrc: 'https://chat-boot-theta.vercel.app/pwa-192x192.png' },
          { content: 'Layout Dark', pictureSrc: 'https://chat-boot-theta.vercel.app/icon-circle-192x192.png' },
        ],
      };
      const g1 = makeGroup('Exemplo • Seleção Visual', [b1], { x: baseX, y: baseY });
      const g2 = makeGroup('Card 1 Escolhido', [{ ...createDefaultBlockForType('send_message'), text: '☀️ Você selecionou *Layout Light*!' }], { x: baseX + 420, y: baseY - 60 });
      const g3 = makeGroup('Card 2 Escolhido', [{ ...createDefaultBlockForType('send_message'), text: '🌙 Você selecionou *Layout Dark*!' }], { x: baseX + 420, y: baseY + 140 });
      return {
        title: `Exemplo Funcional: ${labelTitle}`,
        description: 'Envia cards com imagens individuais numeradas e encaminha conforme a escolha.',
        triggerSuggestion: `#teste-pic`,
        nodes: [g1, g2, g3],
        edges: [
          makeEdge(g1.id, `${b1.id}-opt-0`, g2.id, '1 - Layout Light'),
          makeEdge(g1.id, `${b1.id}-opt-1`, g3.id, '2 - Layout Dark'),
        ],
        focusGroupId: g1.id,
      };
    }
    case 'payment': {
      const b1 = {
        ...createDefaultBlockForType('payment'),
        amount: '10,00',
        pix_key: 'pix@xpointsolucoes.com.br',
        pix_code: '00020126580014BR.GOV.BCB.PIX0114000000000000005204000053039865802BR5913XPoint Teste6009SAO PAULO62070503***6304ABCD',
        var_name: 'confirmacao_pix',
      };
      return buildLinearTwoStep('Pagamento Pix', b1, '✅ Recebemos sua confirmação ("{{confirmacao_pix}}"). Pedido encaminhado!', 'Envia dados completos de cobrança Pix e aguarda confirmação do pagamento.');
    }
    case 'rating': {
      const b1 = {
        ...createDefaultBlockForType('rating'),
        text: 'Avalie este teste técnico de fluxo agora:',
        var_name: 'nota_cliente',
      };
      return buildLinearTwoStep('Avaliação 1-5', b1, '⭐ Obrigado pela nota *{{avaliacao_nota}}/5* registrada em {{nota_cliente}}!', 'Coleta avaliação de 1 a 5 estrelas com validação automática de nota.');
    }
    case 'file_input': {
      const b1 = {
        ...createDefaultBlockForType('file_input'),
        text: '📎 *Teste Input Arquivo*\nEnvie uma foto ou PDF qualquer (mesmo sem legenda):',
        var_name: 'anexo_enviado',
      };
      return buildLinearTwoStep('Input Arquivo', b1, '✅ Anexo detectado com sucesso!\nRegistro salvo: `{{anexo_enviado}}`', 'Captura mídia/PDF enviado pelo cliente mesmo sem legenda.');
    }
    case 'set_variable': {
      const b1 = {
        ...createDefaultBlockForType('set_variable'),
        var_name: 'codigo_atendimento',
        text: 'XP-{{hora_atual}}',
      };
      return buildLinearTwoStep('Definir Variável', b1, '🏷️ Variável calculada silenciosamente:\n*codigo_atendimento* = `{{codigo_atendimento}}`', 'Define uma variável dinâmica antes de enviá-la ao cliente.');
    }
    case 'condition': {
      const askB = {
        ...createDefaultBlockForType('ask'),
        text: '🔀 *Teste Condição (SE / SENÃO)*\nDigite *1* (Suporte), *2* (Vendas) ou qualquer outra coisa (Senão):',
        var_name: 'rota_teste',
      };
      const condId = nextShortId('condition');
      const item1Id = `${condId}-item-1`;
      const item2Id = `${condId}-item-2`;
      const condB = {
        id: condId,
        flowType: 'condition',
        label: 'Condição',
        text: '',
        var_name: 'rota_teste',
        variable: 'rota_teste',
        operator: '=',
        value: '1',
        items: [
          { id: item1Id, varName: 'rota_teste', operator: '=', value: '1', label: 'SE rota_teste = 1' },
          { id: item2Id, varName: 'rota_teste', operator: '=', value: '2', label: 'SE rota_teste = 2' },
        ],
        hasElse: true,
      };
      const g1 = makeGroup('Exemplo • Condição SE/SENÃO', [askB, condB], { x: baseX, y: baseY });
      const gR1 = makeGroup('Saída SE = 1', [{ ...createDefaultBlockForType('send_message'), text: '✅ Entrou na regra *SE #1* (Suporte)!' }], { x: baseX + 420, y: baseY - 120 });
      const gR2 = makeGroup('Saída SE = 2', [{ ...createDefaultBlockForType('send_message'), text: '💼 Entrou na regra *SE #2* (Vendas)!' }], { x: baseX + 420, y: baseY + 40 });
      const gElse = makeGroup('Saída Senão (Fallback)', [{ ...createDefaultBlockForType('send_message'), text: '⚠️ Você digitou "{{rota_teste}}", caindo na porta *Senão*!' }], { x: baseX + 420, y: baseY + 200 });
      return {
        title: `Exemplo Funcional: ${labelTitle}`,
        description: 'Pergunta um valor e avalia 2 regras SE + caminho alternativo Senão sem ambiguidade.',
        triggerSuggestion: `#teste-condition`,
        nodes: [g1, gR1, gR2, gElse],
        edges: [
          makeEdge(g1.id, item1Id, gR1.id, 'SE = 1'),
          makeEdge(g1.id, item2Id, gR2.id, 'SE = 2'),
          makeEdge(g1.id, `${condId}-else`, gElse.id, 'Senão'),
        ],
        focusGroupId: g1.id,
      };
    }
    case 'redirect': {
      const b1 = {
        ...createDefaultBlockForType('redirect'),
        url: 'https://chat-boot-theta.vercel.app',
        text: '🔗 *Exemplo Redirecionar*\nClique no link oficial abaixo para continuar:',
      };
      return buildLinearTwoStep('Redirecionar', b1, '✅ Link de redirecionamento enviado ao cliente.', 'Envia URL clicável com preview seguro no WhatsApp.');
    }
    case 'script': {
      const setB = { ...createDefaultBlockForType('set_variable'), var_name: 'valor_base', text: '100' };
      const scriptB = {
        ...createDefaultBlockForType('script'),
        var_name: 'valor_com_desconto',
        script_code: 'const v = Number(vars.valor_base || 100);\nreturn (v * 0.9).toFixed(2);',
      };
      const msgB = {
        ...createDefaultBlockForType('send_message'),
        text: '⚙️ *Exemplo Script Sandbox*\nValor base: R$ {{valor_base}}\nCom 10% desc.: *R$ {{valor_com_desconto}}*',
      };
      const g1 = makeGroup('Exemplo • Script Seguro', [setB, scriptB, msgB], { x: baseX, y: baseY });
      return {
        title: `Exemplo Funcional: ${labelTitle}`,
        description: 'Executa cálculo JS isolado em sandbox com timeout 100ms e exibe resultado.',
        triggerSuggestion: `#teste-script`,
        nodes: [g1],
        edges: [],
        focusGroupId: g1.id,
      };
    }
    case 'typebot_link': {
      const infoB = {
        ...createDefaultBlockForType('send_message'),
        text: '🤖 Preparando transferência para o subfluxo selecionado...',
      };
      const linkB = {
        ...createDefaultBlockForType('typebot_link'),
        target_flow_id: '',
      };
      const fallbackB = {
        ...createDefaultBlockForType('send_message'),
        text: 'ℹ️ Configure um Fluxo de destino publicado no bloco Typebot (evitando selecionar o próprio fluxo para não criar loop).',
      };
      const g1 = makeGroup('Exemplo • Chamada de Subfluxo', [infoB, linkB], { x: baseX, y: baseY });
      const g2 = makeGroup('Fallback se sem destino', [fallbackB], { x: baseX + 420, y: baseY });
      return {
        title: `Exemplo Funcional: ${labelTitle}`,
        description: 'Estrutura pronta para encadear um fluxo secundário publicado.',
        triggerSuggestion: `#teste-subfluxo`,
        nodes: [g1, g2],
        edges: [makeEdge(g1.id, linkB.id, g2.id)],
        focusGroupId: g1.id,
      };
    }
    case 'wait': {
      const bMsg1 = { ...createDefaultBlockForType('send_message'), text: '⏳ Vou consultar seu cadastro... (repare no "digitando..." por 2s)' };
      const bWait = { ...createDefaultBlockForType('wait'), wait_time: 2 };
      const bMsg2 = { ...createDefaultBlockForType('send_message'), text: '✅ Consulta finalizada após aguardar 2 segundos!' };
      const g1 = makeGroup('Exemplo • Espera (Digitando)', [bMsg1, bWait, bMsg2], { x: baseX, y: baseY });
      return {
        title: `Exemplo Funcional: ${labelTitle}`,
        description: 'Simula digitação no WhatsApp (composing) por 2s entre duas mensagens.',
        triggerSuggestion: `#teste-wait`,
        nodes: [g1],
        edges: [],
        focusGroupId: g1.id,
      };
    }
    case 'jump': {
      // IMPORTANTE: Para evitar ciclo sem pausa (UNPAUSED_CYCLE), o exemplo coloca um menu pausável no Grupo A antes de saltar para B -> A!
      const bAsk = {
        ...createDefaultBlockForType('buttons'),
        text: '🧭 *Exemplo Pular (Jump) Seguro*\nEscolha *1* para testar o salto de volta ou *2* para encerrar:',
        var_name: 'escolha_jump',
        options: ['Testar Salto (Voltar aqui)', 'Finalizar Teste'],
      };
      const gMenu = makeGroup('Menu Principal (Com Pausa)', [bAsk], { x: baseX, y: baseY });
      const bJumpMsg = { ...createDefaultBlockForType('send_message'), text: '↪️ Executando Pular (Jump) de volta ao Menu Principal!' };
      const bJump = {
        ...createDefaultBlockForType('jump'),
        target_group_id: gMenu.id,
        target_group_name: 'Menu Principal (Com Pausa)',
      };
      const gJump = makeGroup('Executa Salto Seguro', [bJumpMsg, bJump], { x: baseX + 420, y: baseY - 60 });
      const gEnd = makeGroup('Fim do Exemplo', [{ ...createDefaultBlockForType('send_message'), text: '✅ Teste de Jump encerrado sem loop!' }], { x: baseX + 420, y: baseY + 140 });
      return {
        title: `Exemplo Funcional: ${labelTitle}`,
        description: 'Demonstra Jump seguro de volta ao Menu passando por um bloco de pausa obrigatório (anti-loop).',
        triggerSuggestion: `#teste-jump`,
        nodes: [gMenu, gJump, gEnd],
        edges: [
          makeEdge(gMenu.id, `${bAsk.id}-opt-0`, gJump.id, '1 - Testar Salto (Voltar aqui)'),
          makeEdge(gMenu.id, `${bAsk.id}-opt-1`, gEnd.id, '2 - Finalizar Teste'),
        ],
        focusGroupId: gMenu.id,
      };
    }
    case 'ab_test': {
      const bAb = { ...createDefaultBlockForType('ab_test'), split_percent: 50, var_name: 'variante_ab' };
      const g1 = makeGroup('Exemplo • Teste A/B (50/50)', [bAb], { x: baseX, y: baseY });
      const gA = makeGroup('Variante A', [{ ...createDefaultBlockForType('send_message'), text: '🅰️ Caiu no *Caminho A*! (variável: {{variante_ab}})' }], { x: baseX + 420, y: baseY - 60 });
      const gB = makeGroup('Variante B', [{ ...createDefaultBlockForType('send_message'), text: '🅱️ Caiu no *Caminho B*! (variável: {{variante_ab}})' }], { x: baseX + 420, y: baseY + 140 });
      return {
        title: `Exemplo Funcional: ${labelTitle}`,
        description: 'Sorteia 50% Variante A e 50% Variante B e segue pela porta correspondente.',
        triggerSuggestion: `#teste-ab`,
        nodes: [g1, gA, gB],
        edges: [
          makeEdge(g1.id, `${bAb.id}-a`, gA.id, 'A (50%)'),
          makeEdge(g1.id, `${bAb.id}-b`, gB.id, 'B (50%)'),
        ],
        focusGroupId: g1.id,
      };
    }
    case 'webhook': {
      const bWh = {
        ...createDefaultBlockForType('webhook'),
        method: 'GET',
        url: 'https://wh1ss8sy848ufj6zh8t492y7.69.62.92.212.sslip.io/health',
        response_var_name: 'saude_servidor',
        response_path: 'status',
      };
      const bMsg = {
        ...createDefaultBlockForType('send_message'),
        text: '⚡ *Exemplo Webhook GET*\nStatus da API Alpha: *{{saude_servidor}}* (HTTP {{saude_servidor_status}})',
      };
      const g1 = makeGroup('Exemplo • Webhook GET Real', [bWh, bMsg], { x: baseX, y: baseY });
      return {
        title: `Exemplo Funcional: ${labelTitle}`,
        description: 'Consulta o endpoint /health da API Alpha via GET e exibe o campo extraído.',
        triggerSuggestion: `#teste-webhook`,
        nodes: [g1],
        edges: [],
        focusGroupId: g1.id,
      };
    }
    case 'start': {
      const bStart = createDefaultBlockForType('start');
      const bWelcome = {
        ...createDefaultBlockForType('send_message'),
        text: '🚀 *Fluxo Iniciado!* Você disparou o ponto de entrada oficial para {{pushName}}.',
      };
      const g1 = makeGroup('Início (Ponto de Partida)', [bStart], { x: baseX, y: baseY });
      const g2 = makeGroup('Boas-Vindas', [bWelcome], { x: baseX + 380, y: baseY });
      return {
        title: `Exemplo Funcional: ${labelTitle}`,
        description: 'Ponto de entrada oficial ligado ao primeiro grupo de boas-vindas.',
        triggerSuggestion: `#teste-start`,
        nodes: [g1, g2],
        edges: [makeEdge(g1.id, bStart.id, g2.id)],
        focusGroupId: g1.id,
      };
    }
    case 'handoff': {
      const bHandoff = {
        ...createDefaultBlockForType('handoff'),
        text: '👤 *Transferência Humana*\nEstou encerrando a automação e direcionando você para um atendente agora!',
      };
      const g1 = makeGroup('Exemplo • Atendente Humano', [bHandoff], { x: baseX, y: baseY });
      return {
        title: `Exemplo Funcional: ${labelTitle}`,
        description: 'Envia aviso de transferência, marca ai_paused=true e entrega conversa ao atendente.',
        triggerSuggestion: `#teste-handoff`,
        nodes: [g1],
        edges: [],
        focusGroupId: g1.id,
      };
    }
    case 'reply': {
      const bAsk = {
        ...createDefaultBlockForType('ask'),
        text: '💬 Envie qualquer frase curta agora para eu testar o *Reply com Citação*:',
        var_name: 'frase_cliente',
      };
      const bReply = {
        ...createDefaultBlockForType('reply'),
        text: '↩️ Respondendo com citação direta à sua mensagem ("{{frase_cliente}}")!',
        quote_message: true,
      };
      const g1 = makeGroup('Exemplo • Reply (Quote)', [bAsk, bReply], { x: baseX, y: baseY });
      return {
        title: `Exemplo Funcional: ${labelTitle}`,
        description: 'Pede uma mensagem e responde citando-a nativamente no WhatsApp.',
        triggerSuggestion: `#teste-reply`,
        nodes: [g1],
        edges: [],
        focusGroupId: g1.id,
      };
    }
    case 'command': {
      const bCmd = {
        ...createDefaultBlockForType('command'),
        command_action: 'add_tag',
        command_value: 'teste-tecnico-bot',
        var_name: 'cmd_status',
      };
      const bMsg = {
        ...createDefaultBlockForType('send_message'),
        text: '⚙️ *Exemplo Comando CRM*\nAção `add_tag` executada com valor: `teste-tecnico-bot` ({{cmd_status}}).',
      };
      const g1 = makeGroup('Exemplo • Comando CRM', [bCmd, bMsg], { x: baseX, y: baseY });
      return {
        title: `Exemplo Funcional: ${labelTitle}`,
        description: 'Aplica etiqueta CRM automaticamente no contato durante o atendimento.',
        triggerSuggestion: `#teste-command`,
        nodes: [g1],
        edges: [],
        focusGroupId: g1.id,
      };
    }
    default: {
      const def = createDefaultBlockForType(type);
      const g1 = makeGroup(`Exemplo • ${labelTitle}`, [def], { x: baseX, y: baseY });
      return {
        title: `Exemplo: ${labelTitle}`,
        description: 'Exemplo padrão de bloco.',
        triggerSuggestion: `#teste-${type}`,
        nodes: [g1],
        edges: [],
        focusGroupId: g1.id,
      };
    }
  }
}

/**
 * Valida a saúde do fluxo no editor: detecta ciclos infinitos sem pausa, loops de subfluxo,
 * portas desconectadas e campos obrigatórios ausentes.
 */
export function analyzeFlowHealth(nodes = [], edges = [], context = {}) {
  const issues = [];
  if (!Array.isArray(nodes) || nodes.length === 0) {
    issues.push({
      severity: 'warning',
      code: 'EMPTY_FLOW',
      message: 'O fluxo não possui nenhum painel ou bloco no canvas.',
      suggestion: 'Arraste um bloco da barra lateral ou gere um Exemplo em qualquer botão.'
    });
    return issues;
  }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const currentFlowId = context.currentFlowId;

  // Mapeia grupos com bloco pausável e verifica qualidade bloco a bloco
  const groupIsPausable = new Map();

  for (const node of nodes) {
    if (node.type !== 'typebot_group' && node.type !== 'group') {
      groupIsPausable.set(node.id, false);
      continue;
    }

    const blocks = Array.isArray(node.data?.blocks) ? node.data.blocks : [];
    const hasPause = blocks.some((b) => PAUSABLE_FLOW_BLOCK_TYPES.has(b?.flowType || b?.type));
    groupIsPausable.set(node.id, hasPause);

    for (const blk of blocks) {
      const ft = blk?.flowType || blk?.type;
      if (['image', 'video', 'audio', 'embed'].includes(ft) && !String(blk.url || '').trim()) {
        issues.push({
          severity: 'warning',
          code: 'MISSING_MEDIA_URL',
          nodeId: node.id,
          blockId: blk.id,
          message: `Bloco "${blk.label || ft}" no grupo "${node.data?.label || node.id}" está sem URL configurada.`,
          suggestion: 'Informe uma URL HTTPS pública no painel Propriedades ou gere o Exemplo do botão.'
        });
      }
      if (ft === 'webhook' && !String(blk.url || blk.webhookUrl || '').trim()) {
        issues.push({
          severity: 'warning',
          code: 'MISSING_WEBHOOK_URL',
          nodeId: node.id,
          blockId: blk.id,
          message: `Bloco Webhook no grupo "${node.data?.label || node.id}" está sem URL.`,
          suggestion: 'Preencha a Webhook URL antes de publicar.'
        });
      }
      if (ft === 'typebot_link') {
        if (!blk.target_flow_id) {
          issues.push({
            severity: 'warning',
            code: 'MISSING_SUBFLOW',
            nodeId: node.id,
            blockId: blk.id,
            message: `Bloco Typebot (Subfluxo) em "${node.data?.label || node.id}" não tem fluxo de destino selecionado.`,
            suggestion: 'Escolha outro fluxo publicado nas Propriedades.'
          });
        } else if (currentFlowId && blk.target_flow_id === currentFlowId) {
          issues.push({
            severity: 'error',
            code: 'SELF_SUBFLOW',
            nodeId: node.id,
            blockId: blk.id,
            message: `Loop crítico: o bloco Typebot em "${node.data?.label || node.id}" aponta para este próprio fluxo!`,
            suggestion: 'Selecione um fluxo diferente para evitar recursão infinita.'
          });
        }
      }
      if (ft === 'jump' && !blk.target_group_id) {
        issues.push({
          severity: 'warning',
          code: 'MISSING_JUMP_TARGET',
          nodeId: node.id,
          blockId: blk.id,
          message: `Bloco Pular (Jump) em "${node.data?.label || node.id}" está sem grupo de destino.`,
          suggestion: 'Selecione um grupo de destino válido nas Propriedades.'
        });
      }
      if (['buttons', 'poll', 'pic_choice'].includes(ft)) {
        const opts = Array.isArray(blk.options) ? blk.options : [];
        if (opts.length < 2 && ft === 'poll') {
          issues.push({
            severity: 'warning',
            code: 'POLL_MIN_OPTIONS',
            nodeId: node.id,
            blockId: blk.id,
            message: `Enquete "${blk.label || 'Poll'}" precisa de pelo menos 2 opções para envio nativo no WhatsApp.`,
            suggestion: 'Adicione pelo menos 2 opções separadas por vírgula.'
          });
        }
      }
    }
  }

  // Constrói grafo direcionado de grupos não-pausáveis para detectar ciclos síncronos infinitos (anti-loop)
  const nonPausableAdj = new Map();
  const addNonPausableEdge = (src, tgt) => {
    if (!src || !tgt || !nodeMap.has(tgt)) return;
    if (groupIsPausable.get(src) || groupIsPausable.get(tgt)) return;
    if (!nonPausableAdj.has(src)) nonPausableAdj.set(src, new Set());
    nonPausableAdj.get(src).add(tgt);
  };

  for (const edge of edges || []) {
    addNonPausableEdge(edge.source, edge.target);
  }
  for (const node of nodes) {
    const blocks = Array.isArray(node.data?.blocks) ? node.data.blocks : [];
    for (const blk of blocks) {
      if ((blk.flowType || blk.type) === 'jump' && blk.target_group_id) {
        addNonPausableEdge(node.id, blk.target_group_id);
      }
    }
  }

  // DFS para detectar ciclos no subgrafo de grupos sem pausa
  const color = new Map(); // 0=unvisited, 1=visiting, 2=visited
  let cycleFoundNodeId = null;

  const dfs = (u) => {
    color.set(u, 1);
    const neighbors = nonPausableAdj.get(u);
    if (neighbors) {
      for (const v of neighbors) {
        if (color.get(v) === 1) {
          cycleFoundNodeId = v;
          return true;
        }
        if (!color.get(v) && dfs(v)) return true;
      }
    }
    color.set(u, 2);
    return false;
  };

  for (const node of nodes) {
    if (!groupIsPausable.get(node.id) && !color.get(node.id)) {
      if (dfs(node.id)) {
        const cycleNode = nodeMap.get(cycleFoundNodeId);
        issues.push({
          severity: 'error',
          code: 'UNPAUSED_CYCLE',
          nodeId: cycleFoundNodeId,
          message: `Loop infinito detectado envolvendo o grupo "${cycleNode?.data?.label || cycleFoundNodeId}" sem nenhum bloco de pausa (Input/Botão/Enquete).`,
          suggestion: 'Adicione um bloco de Botão, Enquete ou Pergunta antes de saltar de volta para que o robô aguarde o cliente.'
        });
        break;
      }
    }
  }

  // Aviso para gatilho ALL sem filtro de caixa
  const rules = Array.isArray(context.triggerRules) ? context.triggerRules : [];
  const hasAll = rules.some((r) => r?.type === 'ALL');
  const hasInstanceFilter = rules.some((r) => r?.type === '__META__' && Array.isArray(r.allowedInstanceIds) && r.allowedInstanceIds.length > 0);
  if (hasAll && !hasInstanceFilter) {
    issues.push({
      severity: 'info',
      code: 'TRIGGER_ALL_UNSCOPED',
      message: 'Gatilho "Qualquer Mensagem (ALL)" ativo para todas as caixas da empresa.',
      suggestion: 'Em testes, prefira restringir o fluxo apenas à caixa FoodNext ou usar gatilho explícito (ex: #teste).'
    });
  }

  return issues;
}
