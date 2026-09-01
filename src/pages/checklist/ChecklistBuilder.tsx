import React, { useState, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { supabase } from '../../services/supabase';
import { useDevStore } from '../../store/devStore';
import { useChatStore } from '../../store/chatStore';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { geminiService } from '../../services/geminiService';
import * as XLSX from 'xlsx';
import { 
  Sparkles, 
  Plus, 
  Trash2, 
  Edit2, 
  Zap,
  Check, 
  X, 
  AlertTriangle, 
  CheckCircle2, 
  CalendarDays, 
  Eye, 
  HelpCircle, 
  Star, 
  Camera, 
  Compass, 
  Info,
  Layers,
  ArrowRight,
  ClipboardList,
  Utensils,
  Coffee,
  Calculator,
  Beer,
  Crown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Users,
  Search,
  Upload,
  FileSpreadsheet,
  Table2,
  Download
} from 'lucide-react';

interface Checklist {
  id: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  sector_id: string;
  use_unit_schedule_rules: boolean;
  min_time_lead_minutes: number;
  max_time_lag_minutes: number;
  weight: number;
  is_active: boolean;
  items_count?: number;
  responsible_ids?: string[];
}

interface ChecklistItem {
  id?: string;
  title: string;
  description: string;
  response_type: string;
  is_required: boolean;
  weight: number;
  sort_order: number;
  is_critical: boolean;
  require_evidence: boolean;
  permit_observation: boolean;
  min_meta?: number | null;
  max_meta?: number | null;
  measurement_unit?: string;
  options?: string[] | null;
}

interface Schedule {
  id?: string;
  checklist_id: string;
  unit_id: string;
  responsible_user_id: string | null;
  start_time: string;
  recurrency: 'daily' | 'weekly' | 'monthly' | 'custom';
  days_of_week: number[] | null;
  days_of_month: number[] | null;
  shift: string;
  start_date: string;
  end_date?: string | null;
  is_active: boolean;
}

const TEMPLATES_LIST = [
  {
    id: 'novo_em_branco',
    title: 'Criar Novo',
    description: 'Crie um novo checklist do zero, definindo cada tarefa e agendamento manualmente.',
    category: 'Geral',
    tags: ['CUSTOMIZADO'],
    icon: 'plus',
    items: []
  },
  {
    id: 'criar_ia',
    title: 'Criar com IA',
    description: 'Crie um novo checklist usando nossa inteligência artificial do Gemini.',
    category: 'Inteligência Artificial',
    tags: ['GEMINI_IA'],
    icon: 'sparkles',
    items: []
  },
  {
    id: 'template_padrao',
    title: 'Template Padrão',
    description: 'Use como ponto de partida contendo tarefas básicas operacionais gerais de conformidade.',
    category: 'Geral',
    tags: ['GERAL'],
    icon: 'clipboard-list',
    items: [
      { title: 'Higienização e organização geral do ambiente', description: 'Garantir que o espaço de trabalho esteja limpo.', response_type: 'boolean', is_required: true, weight: 1, sort_order: 0, is_critical: false, require_evidence: false, permit_observation: true, options: ['Limpar superfícies de contato', 'Esvaziar lixeiras pequenas', 'Organizar materiais de uso frequente'] },
      { title: 'Conferência física de insumos de trabalho', description: 'Checar se todos os materiais estão disponíveis.', response_type: 'conformity', is_required: true, weight: 1, sort_order: 1, is_critical: false, require_evidence: false, permit_observation: true, options: ['Verificar bobinas extras', 'Checar estoque de embalagens básicas', 'Validar canetas e etiquetas'] }
    ]
  },
  {
    id: 'abertura_cozinha',
    title: 'Abertura Cozinha',
    description: 'Checklist para garantir a correta abertura e mise en place da cozinha.',
    category: 'Abertura',
    tags: ['COZINHA', 'ABERTURA'],
    icon: 'utensils',
    items: [
      { title: 'Higienização prévia das mãos e braços da equipe', description: 'Lavagem com sabonete antisséptico por 20 segundos.', response_type: 'boolean', is_required: true, weight: 1, sort_order: 0, is_critical: true, require_evidence: false, permit_observation: true, options: ['Lavar mãos com sabonete bactericida', 'Limpar embaixo das unhas com escovinha', 'Secar com papel toalha descartável', 'Aplicar álcool em gel 70%'] },
      { title: 'Verificar funcionamento dos equipamentos de cocção', description: 'Ligar e certificar funcionamento de fritadeiras, fornos e chapas.', response_type: 'conformity', is_required: true, weight: 1, sort_order: 1, is_critical: false, require_evidence: false, permit_observation: true, options: ['Ligar exaustores e coifas', 'Acender fritadeiras e testar termostato', 'Pré-aquecer fornos na temperatura ideal', 'Verificar se mangueiras de gás estão firmes'] },
      { title: 'Mise en place e qualidade de insumos perecíveis', description: 'Verificar temperatura, frescor e data de validade de carnes, molhos e queijos.', response_type: 'conformity', is_required: true, weight: 1.5, sort_order: 2, is_critical: true, require_evidence: false, permit_observation: true, options: ['Conferir datas de validade das proteínas', 'Verificar textura e frescor de molhos artesanais', 'Fracionar insumos in potes higienizados e etiquetados'] },
      { title: 'Organização das tábuas de corte coloridas', description: 'Vermelha para carnes, verde para vegetais, azul para peixes, amarela para aves.', response_type: 'conformity', is_required: true, weight: 1, sort_order: 3, is_critical: false, require_evidence: false, permit_observation: true, options: ['Higienizar todas as tábuas antes de dispor na bancada', 'Garantir que não haja contaminação cruzada', 'Substituir tábuas com ranhuras profundas'] },
      { title: 'Abastecimento de sabão antisséptico e papel toalha', description: 'Garantir estoque nas pias de higienização de mãos.', response_type: 'yes_no', is_required: true, weight: 1, sort_order: 4, is_critical: false, require_evidence: false, permit_observation: true, options: ['Abastecer dispenser de sabonete líquido', 'Repor rolos de papel toalha descartável', 'Sanitizar a torneira e dispenser'] }
    ]
  },
  {
    id: 'fechamento_cozinha',
    title: 'Fechamento Cozinha',
    description: 'Checklist para garantir o correto fechamento e segurança alimentar da cozinha.',
    category: 'Fechamento',
    tags: ['COZINHA', 'FECHAMENTO'],
    icon: 'utensils',
    items: [
      { title: 'Limpeza e higienização das bancadas de inox', description: 'Limpeza profunda com detergente e sanitizante clorado.', response_type: 'conformity', is_required: true, weight: 1.5, sort_order: 0, is_critical: true, require_evidence: true, permit_observation: true, options: ['Remover restos de alimentos com espátula', 'Esfregar com detergente neutro e fibra de limpeza', 'Aplicar sanitizante clorado (200 ppm)', 'Deixar secar naturalmente ao ar'] },
      { title: 'Temperatura da câmara fria de congelados', description: 'Aferir termômetro digital da câmara.', response_type: 'temperature', is_required: true, weight: 1.5, sort_order: 1, is_critical: true, require_evidence: false, permit_observation: true, min_meta: -18, max_meta: -12, measurement_unit: '°C', options: ['Checar termômetro analógico e painel externo', 'Verificar se a borracha da porta está vedando', 'Conferir se não há gelo acumulado no teto/evaporador'] },
      { title: 'Temperatura da câmara fria de refrigerados', description: 'Aferir termômetro digital de produtos resfriados.', response_type: 'temperature', is_required: true, weight: 1.5, sort_order: 2, is_critical: true, require_evidence: false, permit_observation: true, min_meta: 1, max_meta: 4, measurement_unit: '°C', options: ['Registrar temperatura no visor externo', 'Checar termômetro físico interno', 'Verificar se as mercadorias estão organizadas a 10cm da parede'] },
      { title: 'Garantir desligamento total da central de gás', description: 'Verificar válvulas de segurança física e fechar o registro geral.', response_type: 'yes_no', is_required: true, weight: 2, sort_order: 3, is_critical: true, require_evidence: false, permit_observation: true, options: ['Fechar os registros de cada equipamento', 'Fechar a válvula de corte rápido interna', 'Confirmar trancamento da central de gás externa'] },
      { title: 'Descarte e retirada de lixos da cozinha', description: 'Retirar lixo orgânico e reciclável para a área externa.', response_type: 'boolean', is_required: true, weight: 1, sort_order: 4, is_critical: false, require_evidence: false, permit_observation: true, options: ['Retirar todos os sacos de lixo da cozinha', 'Lavar os latões de pedal com cloro', 'Recolocarem sacos pretos reforçados novos', 'Levar resíduos para a área externa de coleta'] },
      { title: 'Higienização e desinfecção do piso da cozinha', description: 'Lavagem com cloro e secagem completa das canaletas.', response_type: 'boolean', is_required: true, weight: 1, sort_order: 5, is_critical: false, require_evidence: false, permit_observation: true, options: ['Remover detritos sólidos com vassoura', 'Esfregar piso com detergente alcalino e cloro', 'Puxar água com rodo e sanitizar canaletas', 'Deixar o chão totalmente seco para evitar acidentes'] }
    ]
  },
  {
    id: 'abertura_salao',
    title: 'Abertura Salão',
    description: 'Checklist para garantir a correta abertura e ambientação do salão.',
    category: 'Abertura',
    tags: ['SALÃO', 'ABERTURA'],
    icon: 'coffee',
    items: [
      { title: 'Alinhamento e limpeza das mesas e cadeiras', description: 'Verificar firmeza física e limpar com álcool 70%.', response_type: 'conformity', is_required: true, weight: 1, sort_order: 0, is_critical: false, require_evidence: false, permit_observation: true, options: ['Alinhar as mesas conforme o layout padrão', 'Passar álcool 70% em cada tampo de mesa', 'Verificar se alguma cadeira está bamba ou instável'] },
      { title: 'Varredura e passagem de pano no piso do salão', description: 'Garantir salão totalmente limpo e livre de poeira.', response_type: 'boolean', is_required: true, weight: 1, sort_order: 1, is_critical: false, require_evidence: false, permit_observation: true, options: ['Varrer cantos e embaixo dos móveis', 'Passar pano úmido com odorizador suave', 'Garantir piso antiderrapante seco antes da entrada dos clientes'] },
      { title: 'Abastecimento de galheteiros, guardanapos e sachês', description: 'Repor azeite, sal, pimenta, guardanapos e açúcares.', response_type: 'conformity', is_required: true, weight: 1, sort_order: 2, is_critical: false, require_evidence: false, permit_observation: true, options: ['Limpar galheteiros de azeite e vinagre', 'Completar sachês de sal, pimenta e palitos', 'Abastecer guardanapos de papel de alta qualidade'] },
      { title: 'Aparelhos de ar-condicionado na temperatura ideal', description: 'Aferir no controle remoto da climatização.', response_type: 'temperature', is_required: true, weight: 1, sort_order: 3, is_critical: false, require_evidence: false, permit_observation: true, min_meta: 21, max_meta: 23, measurement_unit: '°C', options: ['Ligar todas as evaporadoras', 'Verificar se os flaps estão em oscilação', 'Confirmar se os filtros de ar estão limpos e sem odores'] },
      { title: 'Organização e polimento de pratos e talheres', description: 'Garantir utensílios de serviço brilhando e sem marcas d\'água.', response_type: 'conformity', is_required: true, weight: 1.5, sort_order: 4, is_critical: true, require_evidence: false, permit_observation: true, options: ['Polir talheres com pano de prato macio e álcool 70%', 'Verificar se pratos e copos estão sem trincados', 'Dispor jogo americano de forma simétrica'] }
    ]
  },
  {
    id: 'fechamento_salao',
    title: 'Fechamento Salão',
    description: 'Checklist para garantir o correto fechamento do salão e controle físico.',
    category: 'Fechamento',
    tags: ['SALÃO', 'FECHAMENTO'],
    icon: 'coffee',
    items: [
      { title: 'Limpeza minuciosa de mesas e cadeiras', description: 'Passar produto multiuso em cada superfície.', response_type: 'boolean', is_required: true, weight: 1, sort_order: 0, is_critical: false, require_evidence: false, permit_observation: true, options: ['Remover migalhas das cadeiras e estofados', 'Limpar pés e pernas de metal/madeira', 'Organizar os cardápios físicos na recepção'] },
      { title: 'Recolhimento e lavagem dos utensílios do salão', description: 'Copos, pratos e talheres restantes encaminhados à pia.', response_type: 'boolean', is_required: true, weight: 1, sort_order: 1, is_critical: false, require_evidence: false, permit_observation: true, options: ['Recolher copos e xícaras de mesas remanescentes', 'Enviar galheteiros e decantadores para higienização', 'Garantir que a área de descarte da copa esteja limpa'] },
      { title: 'Limpeza do chão e esvaziamento das lixeiras', description: 'Retirar sacos plásticos e lavar as lixeiras.', response_type: 'boolean', is_required: true, weight: 1, sort_order: 2, is_critical: false, require_evidence: false, permit_observation: true, options: ['Retirar sacos de lixo e higienizar recipientes', 'Passar pano úmido desinfetante no salão completo', 'Levantar cadeiras sobre as mesas para facilitar a limpeza profunda'] },
      { title: 'Verificar desligamento de luzes, ar e TVs', description: 'Evitar consumo elétrico noturno desnecessário.', response_type: 'yes_no', is_required: true, weight: 1.5, sort_order: 3, is_critical: true, require_evidence: false, permit_observation: true, options: ['Desligar todos os ares-condicionados', 'Desligar TVs e painéis luminosos de LED', 'Apagar luzes decorativas do salão, mantendo a de emergência'] }
    ]
  },
  {
    id: 'abertura_caixa',
    title: 'Abertura Caixa',
    description: 'Checklist para garantir a correta abertura e segurança do caixa.',
    category: 'Abertura',
    tags: ['CAIXA', 'ABERTURA'],
    icon: 'calculator',
    items: [
      { title: 'Conferência do fundo de troco operacional', description: 'Contar moedas e notas para troco inicial.', response_type: 'numeric', is_required: true, weight: 1.5, sort_order: 0, is_critical: true, require_evidence: false, permit_observation: true, min_meta: 200, max_meta: 500, measurement_unit: 'R$', options: ['Contar notas físicas de menor valor', 'Contar moedas organizadas na colmeia', 'Confirmar valor final contra relatório de fechamento anterior'] },
      { title: 'Verificar funcionamento da impressora fiscal', description: 'Emitir cupom de teste rápido.', response_type: 'yes_no', is_required: true, weight: 1, sort_order: 1, is_critical: false, require_evidence: false, permit_observation: true, options: ['Ligar a impressora e checar LEDs', 'Fazer avanço do papel manual', 'Emitir cupom de leitura X ou relatório de teste'] },
      { title: 'Limpeza do balcão de atendimento e telas', description: 'Passar álcool isopropílico no teclado e mouse.', response_type: 'boolean', is_required: true, weight: 1, sort_order: 2, is_critical: false, require_evidence: false, permit_observation: true, options: ['Passar microfibra com álcool isopropílico na tela touch screen', 'Sanitizar teclado, mouse e leitor de código de barras', 'Remover copos vazios e papéis soltos do balcão'] },
      { title: 'Verificar estoque de bobinas térmicas', description: 'Garantir no mínimo 3 bobinas reservas no local.', response_type: 'boolean', is_required: true, weight: 1, sort_order: 3, is_critical: false, require_evidence: false, permit_observation: true, options: ['Conferir bobinas de reserva no armário inferior', 'Instalar bobina nova na impressora se estiver no final (tarja vermelha)', 'Confirmar papel térmico de alta durabilidade'] },
      { title: 'Ligar e testar terminais de cartão (POS)', description: 'Certificar que estão com carga e sinal ativo.', response_type: 'yes_no', is_required: true, weight: 1, sort_order: 4, is_critical: false, require_evidence: false, permit_observation: true, options: ['Conferir bateria e colocar no carregador', 'Testar conexão Wi-Fi ou chip celular GPRS', 'Imprimir comprovante de teste rápido de rede'] }
    ]
  },
  {
    id: 'fechamento_caixa',
    title: 'Fechamento Caixa',
    description: 'Checklist para garantir o correto fechamento de caixa e conciliação financeira.',
    category: 'Fechamento',
    tags: ['CAIXA', 'FECHAMENTO'],
    icon: 'calculator',
    items: [
      { title: 'Sangria total e contagem física do dinheiro', description: 'Contar notas e separar o fundo de troco do dia seguinte.', response_type: 'numeric', is_required: true, weight: 2, sort_order: 0, is_critical: true, require_evidence: false, permit_observation: true, measurement_unit: 'R$', options: ['Contar notas em notas separadas por lote', 'Separar exatamente o troco físico de abertura do dia seguinte', 'Depositar a sangria principal no envelope de segurança'] },
      { title: 'Conferência de vendas in cartões e PIX', description: 'Conciliar relatórios das maquininhas com o sistema ERP.', response_type: 'text', is_required: true, weight: 1.5, sort_order: 1, is_critical: true, require_evidence: false, permit_observation: true, options: ['Extrair relatório diário unificado das maquininhas', 'Checar transações PIX diretamente no extrato/app financeiro', 'Inserir observações sobre possíveis cancelamentos de vendas'] },
      { title: 'Emissão e envio do relatório diário de vendas', description: 'Imprimir e tirar foto legível do cupom de fechamento (Redução Z).', response_type: 'photo', is_required: true, weight: 2, sort_order: 2, is_critical: true, require_evidence: true, permit_observation: true, options: ['Emitir relatório final de Redução Z no software PDV', 'Tirar foto nítida e bem enquadrada do comprovante físico', 'Enviar o arquivo digital no grupo operacional da gestão'] },
      { title: 'Gaveta do caixa trancada e PC desligado', description: 'Garantir segurança física do PDV.', response_type: 'yes_no', is_required: true, weight: 1, sort_order: 3, is_critical: false, require_evidence: false, permit_observation: true, options: ['Remover moedas soltas da gaveta e trancar a chave', 'Desligar monitor, computador e estabilizador', 'Guardar chave do caixa em local seguro pré-definido'] }
    ]
  },
  {
    id: 'abertura_bar',
    title: 'Abertura Bar',
    description: 'Checklist para garantir a correta abertura e mise en place do bar.',
    category: 'Abertura',
    tags: ['BAR', 'ABERTURA'],
    icon: 'beer',
    items: [
      { title: 'Higienização inicial das pias e balcões do bar', description: 'Limpeza com desinfetante apropriado.', response_type: 'boolean', is_required: true, weight: 1, sort_order: 0, is_critical: false, require_evidence: false, permit_observation: true, options: ['Higienizar superfícies de inox com desinfetante alimentar', 'Limpar torneiras de chope com álcool 70%', 'Verificar drenagem das cubas de lavagem'] },
      { title: 'Corte e abastecimento de guarnições frescas', description: 'Limões cortados em gomos, hortelã e laranja abastecidas.', response_type: 'conformity', is_required: true, weight: 1, sort_order: 1, is_critical: false, require_evidence: false, permit_observation: true, options: ['Lavar e sanitizar limões, laranjas e hortelã', 'Cortar frutas em tamanhos padrão de serviço', 'Dispor em potes herméticos organizadores com etiquetas de data/hora'] },
      { title: 'Verificar temperatura das chopeiras e geladeiras', description: 'Chopeiras ligadas e geladeiras resfriando.', response_type: 'conformity', is_required: true, weight: 1.5, sort_order: 2, is_critical: true, require_evidence: false, permit_observation: true, options: ['Verificar se o glicol da chopeira está no nível correto', 'Registrar temperatura no termômetro do expositor de cervejas', 'Garantir que as garrafas estejam organizadas'] },
      { title: 'Abastecimento de copos, gelo e insumos', description: 'Repor insumos secos e encher a cuba de gelo filtrado.', response_type: 'conformity', is_required: true, weight: 1, sort_order: 3, is_critical: false, require_evidence: false, permit_observation: true, options: ['Pegar gelo na máquina e encher a cuba térmica do bar', 'Polir taças de gin, copos de chope e copos de drinks', 'Repor sachês de açúcar, adoçante e canudos ecológicos'] }
    ]
  },
  {
    id: 'fechamento_bar',
    title: 'Fechamento Bar',
    description: 'Checklist para garantir o correto fechamento e limpeza profunda do bar.',
    category: 'Fechamento',
    tags: ['BAR', 'FECHAMENTO'],
    icon: 'beer',
    items: [
      { title: 'Lavagem e polimento de taças e coqueteleiras', description: 'Garantir louças totalmente limpas e higienizadas.', response_type: 'boolean', is_required: true, weight: 1, sort_order: 0, is_critical: false, require_evidence: false, permit_observation: true, options: ['Lavar coqueteleiras e dosadores com água quente', 'Polir taças de drink e copos finos para evitar manchas', 'Guardar copos organizados em caixas ou prateleiras limpas'] },
      { title: 'Aferir temperatura de chopeiras e geladeiras', description: 'Registrar temperatura no final do turno.', response_type: 'temperature', is_required: true, weight: 1.5, sort_order: 1, is_critical: true, require_evidence: false, permit_observation: true, min_meta: -2, max_meta: 4, measurement_unit: '°C', options: ['Aferir termômetro do freezer de copos', 'Aferir painel digital da chopeira de nitrogênio/chope', 'Checar se as portas das geladeiras de bebidas fecharam completamente'] },
      { title: 'Limpeza profunda de balcões e torneiras de chope', description: 'Evitar acúmulo de levedura e sujeira.', response_type: 'conformity', is_required: true, weight: 1, sort_order: 2, is_critical: false, require_evidence: false, permit_observation: true, options: ['Passar escova interna nas torneiras de chope', 'Aplicar sanitizante na canaleta de coleta de chope do balcão', 'Esfregar ralos de bar com escovão e cloro'] },
      { title: 'Recolhimento de insumos e fechamento de gás', description: 'Xaropes e frutas armazenadas em geladeira.', response_type: 'yes_no', is_required: true, weight: 1.5, sort_order: 3, is_critical: true, require_evidence: false, permit_observation: true, options: ['Guardar xaropes e frutas restantes na geladeira', 'Fechar o registro do cilindro de gás CO2 da chopeira', 'Sanitizar coqueteleiras e dosadores'] }
    ]
  },
  {
    id: 'fechamento_gerencia',
    title: 'Fechamento Gerência',
    description: 'Checklist para garantir o correto fechamento administrativo e segurança física.',
    category: 'Gerência',
    tags: ['GERÊNCIA', 'FECHAMENTO'],
    icon: 'crown',
    items: [
      { title: 'Reunião de fechamento rápido com a equipe', description: 'Dar feedbacks do dia e alinhar tarefas pendentes.', response_type: 'boolean', is_required: true, weight: 1, sort_order: 0, is_critical: false, require_evidence: false, permit_observation: true, options: ['Reunir equipe por 5 min (Briefing de Fechamento)', 'Destacar pontos positivos e feedbacks de clientes', 'Alinhar escalas e horários de folga do dia seguinte'] },
      { title: 'Verificação e contagem do cofre principal', description: 'Registrar valores físicos depositados no cofre.', response_type: 'numeric', is_required: true, weight: 2, sort_order: 1, is_critical: true, require_evidence: false, permit_observation: true, measurement_unit: 'R$', options: ['Contar envelopes de sangria depositados pelos caixas', 'Contar fundo de reserva física no cofre principal', 'Registrar a entrada física e emitir recibo digital'] },
      { title: 'Conferência de dados fiscais do dia', description: 'Validar se todos os SATs/NFCes foram transmitidos.', response_type: 'yes_no', is_required: true, weight: 1, sort_order: 2, is_critical: false, require_evidence: false, permit_observation: true, options: ['Verificar no sistema fiscal se há notas em contingência', 'Confirmar envio de notas de cancelamento', 'Checar status de conexão do aparelho SAT fiscal'] },
      { title: 'Vistoria geral de segurança do estabelecimento', description: 'Vistoriar trancas de portas, saídas de ar, desligamento de luzes e ativar o alarme. Tirar foto da porta principal trancada.', response_type: 'photo', is_required: true, weight: 2, sort_order: 3, is_critical: true, require_evidence: true, permit_observation: true, options: ['Checar trincas de todas as janelas e portas externas', 'Confirmar desligamento de motores de coifa e ar-condicionado', 'Ativar o alarme de presença e monitoramento no teclado principal', 'Trancar a porta e registrar foto nítida e bem enquadrada'] },
      { title: 'Registro do relatório diário de ocorrências', description: 'Digitar observações do dia relevantes (quebra de equipamentos, faltas, etc.).', response_type: 'text', is_required: true, weight: 1, sort_order: 4, is_critical: false, require_evidence: false, permit_observation: true, options: ['Digitar faltas ou atrasos de equipe', 'Relatar quebras de utensílios ou falhas físicas em maquinário', 'Registrar reclamações graves de clientes ou visitas fiscais'] }
    ]
  },
  {
    id: 'recebimento_estoque',
    title: 'Recebimento de Mercadorias',
    description: 'Checklist para controle no recebimento de mercadorias: conformidades de temperatura, integridade, prazos e armazenamento rápido.',
    category: 'Estoque',
    tags: ['RECEBIMENTO', 'ESTOQUE'],
    icon: 'layers',
    items: [
      { title: 'Temperatura de caminhões refrigerados no recebimento', description: 'Medir temperatura interna com termômetro laser.', response_type: 'temperature', is_required: true, weight: 1.5, sort_order: 0, is_critical: true, require_evidence: false, permit_observation: true, min_meta: -18, max_meta: 4, measurement_unit: '°C', options: ['Garantir que a cabine fria do fornecedor esteja limpa e organizada', 'Registrar temperatura no laudo de entrega', 'Verificar integridade física das caixas de congelados'] },
      { title: 'Conferência física de validade e lotes das mercadorias', description: 'Verificar se possuem no mínimo 60% da vida útil disponível.', response_type: 'conformity', is_required: true, weight: 1, sort_order: 1, is_critical: false, require_evidence: false, permit_observation: true, options: ['Checar código de lote contra nota fiscal', 'Rejeitar qualquer caixa amassada, molhada ou estufada', 'Garantir presença de selos oficiais de inspeção sanitária (S.I.F)'] },
      { title: 'Armazenamento seguindo regra PVPS (Vence primeiro, sai primeiro)', description: 'Organizar itens novos nos freezers e câmaras frias.', response_type: 'boolean', is_required: true, weight: 1, sort_order: 2, is_critical: false, require_evidence: false, permit_observation: true, options: ['Posicionar mercadorias com validade mais próxima à frente', 'Garantir que caixas de papelão externas não entrem na câmara fria', 'Manter espaçamento de 10cm das paredes e piso'] }
    ]
  },
  {
    id: 'limpeza_pesada',
    title: 'Higienização e Limpeza Pesada',
    description: 'Checklist quinzenal focado em limpeza pesada técnica de coifas, calhas de gordura, ralos e maquinários.',
    category: 'Higiene',
    tags: ['LIMPEZA', 'MANUTENÇÃO'],
    icon: 'utensils',
    items: [
      { title: 'Limpeza profunda e desengorduramento de coifas e filtros', description: 'Remover filtros metálicos e aplicar desengordurante alcalino.', response_type: 'photo', is_required: true, weight: 1.5, sort_order: 0, is_critical: true, require_evidence: true, permit_observation: true, options: ['Desligar disjuntor do exaustor antes de iniciar', 'Deixar filtros de molho em água quente com desengordurante por 30 min', 'Esfregar calhas de gordura internas', 'Secar totalmente antes de reinstalar'] },
      { title: 'Desinfecção e desobstrução de ralos e canaletas', description: 'Retirar grelhas, remover resíduos e aplicar cloro.', response_type: 'conformity', is_required: true, weight: 1, sort_order: 1, is_critical: false, require_evidence: false, permit_observation: true, options: ['Retirar resíduos sólidos com luvas de cano longo', 'Esfregar canaletas com escovão de cerdas rígidas', 'Aplicar pastilhas bactericidas de ralo', 'Despejar 5 litros de água fervente com cloro'] },
      { title: 'Calibração e degelo preventivo de freezers/geladeiras', description: 'Realizar degelo completo para evitar sobrecarga no compressor.', response_type: 'boolean', is_required: true, weight: 1, sort_order: 2, is_critical: false, require_evidence: false, permit_observation: true, options: ['Transferir alimentos temporariamente para outra câmara fria', 'Desligar equipamentos e aguardar derretimento natural', 'Limpar borrachas magnéticas de vedação', 'Religar e aguardar atingir temperatura ideal antes de reabastecer'] }
    ]
  },
  {
    id: 'cadeia_frio',
    title: 'Controle de Cadeia de Frio',
    description: 'Controle diário de termometria operacional para segurança alimentar (geladeiras, freezers e pista quente).',
    category: 'Segurança Alimentar',
    tags: ['TEMPERATURA', 'CONFORMIDADE'],
    icon: 'calculator',
    items: [
      { title: 'Aferir temperatura da Câmara Fria de Carnes', description: 'Aferir termômetro interno analógico/digital.', response_type: 'temperature', is_required: true, weight: 1.5, sort_order: 0, is_critical: true, require_evidence: false, permit_observation: true, min_meta: -22, max_meta: -15, measurement_unit: '°C', options: ['Conferir se a cortina de PVC anti-mosca está íntegra', 'Verificar se o evaporador está livre de obstruções de caixas', 'Garantir que a porta esteja vedando perfeitamente'] },
      { title: 'Aferir temperatura do Balcão Refrigerado de Mise en Place', description: 'Aferir temperatura de cubas de molhos e recheios.', response_type: 'temperature', is_required: true, weight: 1.5, sort_order: 1, is_critical: true, require_evidence: false, permit_observation: true, min_meta: 1, max_meta: 5, measurement_unit: '°C', options: ['Garantir que o compressor esteja limpo de poeira externa', 'Verificar se o nível de gelo/água na pista fria está correto', 'Medir temperatura interna de um molho com termômetro espeto'] },
      { title: 'Aferir temperatura da Estufa Quente (Passadeira / Gantry)', description: 'Manter sanduíches e porções aquecidas antes da entrega.', response_type: 'temperature', is_required: true, weight: 1, sort_order: 2, is_critical: false, require_evidence: false, permit_observation: true, min_meta: 60, max_meta: 75, measurement_unit: '°C', options: ['Verificar lâmpadas infravermelhas de aquecimento', 'Limpar vidros protetores térmicos', 'Garantir que nenhum prato de cliente passe de 10 min na estufa'] }
    ]
  },
  {
    id: 'qualidade_delivery',
    title: 'Qualidade Expedição Delivery',
    description: 'Auditoria de saída de pedidos para delivery para evitar erros e insatisfação do cliente.',
    category: 'Operação',
    tags: ['DELIVERY', 'QUALIDADE'],
    icon: 'clipboard-list',
    items: [
      { title: 'Conferência minuciosa de pedidos contra a comanda', description: 'Evitar reclamações de itens faltantes.', response_type: 'boolean', is_required: true, weight: 1.5, sort_order: 0, is_critical: true, require_evidence: false, permit_observation: true, options: ['Checar se refrigerantes e bebidas estão corretos', 'Conferir se observações do cliente (sem cebola, com molho extra) foram atendidas', 'Garantir presença de talheres descartáveis, guardanapos e sachês solicitados'] },
      { title: 'Aplicação de lacres invioláveis nas embalagens', description: 'Garantir segurança física durante o trajeto.', response_type: 'photo', is_required: true, weight: 1.5, sort_order: 1, is_critical: false, require_evidence: true, permit_observation: true, options: ['Colar fita adesiva de segurança na tampa principal', 'Garantir que o saco delivery esteja grampeado ou selado', 'Escrever mensagem de agradecimento ou nome do cliente de forma legível'] },
      { title: 'Conferência de higiene e conservação térmica das bags', description: 'Auditoria na saída dos motoboys operacionais.', response_type: 'conformity', is_required: true, weight: 1, sort_order: 2, is_critical: false, require_evidence: false, permit_observation: true, options: ['Higienizar interior da bag de delivery com álcool 70% diariamente', 'Verificar se zíperes e alças estão em perfeito estado', 'Garantir que a bag esteja seca e sem odores de entregas passadas'] }
    ]
  },
  {
    id: 'boas_praticas_bpf',
    title: 'Auto-Auditoria de BPF',
    description: 'Auto-auditoria diária para controle sanitário de segurança alimentar (BPF).',
    category: 'Segurança Alimentar',
    tags: ['AUDITORIA', 'VIGILÂNCIA'],
    icon: 'crown',
    items: [
      { title: 'Higiene pessoal e asseio dos manipuladores', description: 'Auditoria visual rápida de asseio pessoal da equipe.', response_type: 'conformity', is_required: true, weight: 1.5, sort_order: 0, is_critical: true, require_evidence: false, permit_observation: true, options: ['Verificar unhas curtas, limpas e sem esmalte', 'Garantir uso correto e completo de toucas descartáveis de cabelo', 'Confirmar ausência de anéis, alianças, relógios, brincos ou piercings', 'Verificar se os uniformes de trabalho estão limpos e sem rags'] },
      { title: 'Estado físico das barreiras sanitárias e telas', description: 'Prevenção contra vetores e pragas.', response_type: 'yes_no', is_required: true, weight: 1, sort_order: 1, is_critical: false, require_evidence: false, permit_observation: true, options: ['Verificar se a porta de entrada da cozinha possui mola de fechamento automática ativa', 'Checar se as telas de proteção contra insetos nas janelas estão íntegras e sem furos', 'Garantir que as lixeiras de pedal estejam tampadas'] },
      { title: 'Controle de potabilidade e limpeza da caixa d\'água', description: 'Pureza da água para alimentos e produção de gelo.', response_type: 'boolean', is_required: true, weight: 1, sort_order: 2, is_critical: false, require_evidence: false, permit_observation: true, options: ['Verificar validade do laudo bacteriológico de limpeza da caixa d\'água (máximo 6 meses)', 'Trocar elemento filtrante da máquina de gelo e pias', 'Checar se a tampa da caixa d\'água principal está perfeitamente vedada'] }
    ]
  },
  {
    id: 'contagem_estoque',
    title: 'Contagem de Estoque',
    description: 'Checklist com riqueza de detalhes para inventário físico e contagem de itens de estoque (secos, frios, congelados, bebidas, embalagens e limpeza).',
    category: 'Estoque',
    tags: ['ESTOQUE', 'INVENTÁRIO'],
    icon: 'layers',
    items: [
      { title: '[Secos] Arroz tipo 1 (saco 5kg)', description: 'Contar sacos fechados no estoque seco.', response_type: 'numeric', is_required: true, weight: 1, sort_order: 0, is_critical: false, require_evidence: false, permit_observation: true, measurement_unit: 'un' },
      { title: '[Secos] Feijão Carioca (saco 1kg)', description: 'Contar pacotes individuais de 1kg.', response_type: 'numeric', is_required: true, weight: 1, sort_order: 1, is_critical: false, require_evidence: false, permit_observation: true, measurement_unit: 'un' },
      { title: '[Secos] Farinha de Trigo Especial (saco 5kg)', description: 'Contar sacos de farinha no almoxarifado.', response_type: 'numeric', is_required: true, weight: 1, sort_order: 2, is_critical: false, require_evidence: false, permit_observation: true, measurement_unit: 'un' },
      { title: '[Secos] Óleo de Soja (garrafa 900ml)', description: 'Contar garrafas individuais.', response_type: 'numeric', is_required: true, weight: 1, sort_order: 3, is_critical: false, require_evidence: false, permit_observation: true, measurement_unit: 'un' },
      { title: '[Secos] Sal Refinado (pacote 1kg)', description: 'Contar pacotes de sal de 1kg.', response_type: 'numeric', is_required: true, weight: 1, sort_order: 4, is_critical: false, require_evidence: false, permit_observation: true, measurement_unit: 'un' },
      { title: '[Frios] Queijo Muçarela (peça/kg)', description: 'Pesar ou estimar peças fechadas e abertas.', response_type: 'numeric', is_required: true, weight: 1, sort_order: 5, is_critical: false, require_evidence: false, permit_observation: true, measurement_unit: 'kg' },
      { title: '[Frios] Presunto Cozido (peça/kg)', description: 'Pesar ou estimar peças fechadas e abertas.', response_type: 'numeric', is_required: true, weight: 1, sort_order: 6, is_critical: false, require_evidence: false, permit_observation: true, measurement_unit: 'kg' },
      { title: '[Frios] Creme de Leite UHT (caixa 1L)', description: 'Contar caixas individuais de 1 litro.', response_type: 'numeric', is_required: true, weight: 1, sort_order: 7, is_critical: false, require_evidence: false, permit_observation: true, measurement_unit: 'un' },
      { title: '[Frios] Manteiga com Sal (barra 500g)', description: 'Contar tabletes de 500g.', response_type: 'numeric', is_required: true, weight: 1, sort_order: 8, is_critical: false, require_evidence: false, permit_observation: true, measurement_unit: 'un' },
      { title: '[Congelados] Hambúrguer Blend (caixa c/ 50)', description: 'Contar caixas lacradas e estimar frações.', response_type: 'numeric', is_required: true, weight: 1.5, sort_order: 9, is_critical: true, require_evidence: false, permit_observation: true, measurement_unit: 'cx' },
      { title: '[Congelados] Peito de Frango (kg)', description: 'Pesar ou contar pacotes fechados de peito de frango.', response_type: 'numeric', is_required: true, weight: 1, sort_order: 10, is_critical: false, require_evidence: false, permit_observation: true, measurement_unit: 'kg' },
      { title: '[Congelados] Batata Pré-Frita (caixa 10kg)', description: 'Contar caixas de batata palito.', response_type: 'numeric', is_required: true, weight: 1, sort_order: 11, is_critical: false, require_evidence: false, permit_observation: true, measurement_unit: 'cx' },
      { title: '[Bebidas] Coca-Cola Lata 350ml (unidade)', description: 'Contar latas individuais no estoque ou geladeira.', response_type: 'numeric', is_required: true, weight: 1, sort_order: 12, is_critical: false, require_evidence: false, permit_observation: true, measurement_unit: 'un' },
      { title: '[Bebidas] Guaraná Lata 350ml (unidade)', description: 'Contar latas individuais.', response_type: 'numeric', is_required: true, weight: 1, sort_order: 13, is_critical: false, require_evidence: false, permit_observation: true, measurement_unit: 'un' },
      { title: '[Bebidas] Água Mineral sem Gás 500ml (unidade)', description: 'Contar garrafas individuais.', response_type: 'numeric', is_required: true, weight: 1, sort_order: 14, is_critical: false, require_evidence: false, permit_observation: true, measurement_unit: 'un' },
      { title: '[Bebidas] Barril de Chope Pilsen 50L (unidade)', description: 'Contar barris cheios.', response_type: 'numeric', is_required: true, weight: 1.5, sort_order: 15, is_critical: true, require_evidence: false, permit_observation: true, measurement_unit: 'un' },
      { title: '[Embalagens] Caixa de Delivery para Hambúrguer', description: 'Contar pacotes fechados ou unidades avulsas.', response_type: 'numeric', is_required: true, weight: 1, sort_order: 16, is_critical: false, require_evidence: false, permit_observation: true, measurement_unit: 'un' },
      { title: '[Embalagens] Sacola Kraft para Delivery', description: 'Contar pacotes ou unidades.', response_type: 'numeric', is_required: true, weight: 1, sort_order: 17, is_critical: false, require_evidence: false, permit_observation: true, measurement_unit: 'un' },
      { title: '[Limpeza] Detergente Neutro Concentrado (galão 5L)', description: 'Contar galões cheios.', response_type: 'numeric', is_required: true, weight: 1, sort_order: 18, is_critical: false, require_evidence: false, permit_observation: true, measurement_unit: 'un' },
      { title: '[Limpeza] Cloro Sanitizante (galão 5L)', description: 'Contar galões cheios no abrigo de química.', response_type: 'numeric', is_required: true, weight: 1, sort_order: 19, is_critical: false, require_evidence: false, permit_observation: true, measurement_unit: 'un' }
    ]
  },
  {
    id: 'corte_proteinas',
    title: 'Ficha de Produção - Corte de Proteínas',
    description: 'Checklist para controle de estoque de peças de carne, descarte/percas e rendimento de bifes chapa, empanados e retalhos.',
    category: 'Estoque',
    tags: ['ESTOQUE', 'COZINHA'],
    icon: 'layers',
    items: [
      { title: '[Estoque] Peças no Estoque (Inicial)', description: 'Quantidade total de peças inteiras no estoque antes de retirar para a produção.', response_type: 'numeric', is_required: true, weight: 1, sort_order: 0, is_critical: false, require_evidence: false, permit_observation: true, measurement_unit: 'un' },
      { title: '[Estoque] Peças Retiradas para Corte', description: 'Quantidade de peças inteiras retiradas para a produção atual.', response_type: 'numeric', is_required: true, weight: 1, sort_order: 1, is_critical: false, require_evidence: false, permit_observation: true, measurement_unit: 'un' },
      { title: '[Estoque] Peças Restantes no Estoque', description: 'Quantidade de peças inteiras que restaram no estoque (Ex: de 6 retirou 1, restam 5).', response_type: 'numeric', is_required: true, weight: 1, sort_order: 2, is_critical: false, require_evidence: false, permit_observation: true, measurement_unit: 'un' },
      { title: '[Estoque] Peso Total da(s) Peça(s) Retirada(s)', description: 'Peso total em kg da(s) peça(s) retirada(s) do estoque para a produção.', response_type: 'numeric', is_required: true, weight: 1.5, sort_order: 3, is_critical: true, require_evidence: false, permit_observation: true, measurement_unit: 'kg' },
      { title: '[Bife Chapa 160g] Quantidade de Bifes', description: 'Quantidade total de unidades de bife para chapa (meta de 160g) produzidas.', response_type: 'numeric', is_required: true, weight: 1, sort_order: 4, is_critical: false, require_evidence: false, permit_observation: true, measurement_unit: 'un' },
      { title: '[Bife Chapa 160g] Peso Total dos Bifes (kg)', description: 'Peso total em kg de todos os bifes de chapa de 160g produzidos.', response_type: 'numeric', is_required: true, weight: 1, sort_order: 5, is_critical: false, require_evidence: false, permit_observation: true, measurement_unit: 'kg' },
      { title: '[Bife Empanado 100g] Quantidade de Bifes Empanados', description: 'Quantidade total de unidades de bife empanado (meta de 100g) produzidas.', response_type: 'numeric', is_required: true, weight: 1, sort_order: 6, is_critical: false, require_evidence: false, permit_observation: true, measurement_unit: 'un' },
      { title: '[Bife Empanado 100g] Peso Total dos Bifes Empanados (kg)', description: 'Peso total em kg de todos os bifes empanados de 100g produzidos.', response_type: 'numeric', is_required: true, weight: 1, sort_order: 7, is_critical: false, require_evidence: false, permit_observation: true, measurement_unit: 'kg' },
      { title: '[Retalho 150g] Quantidade de Pacotes de Retalho', description: 'Quantidade total de pacotes de retalho (meta de 150g) produzidos.', response_type: 'numeric', is_required: true, weight: 1, sort_order: 8, is_critical: false, require_evidence: false, permit_observation: true, measurement_unit: 'pct' },
      { title: '[Retalho 150g] Peso Total dos Retalhos (kg)', description: 'Peso total em kg de todos os pacotes de retalho de 150g produzidos.', response_type: 'numeric', is_required: true, weight: 1, sort_order: 9, is_critical: false, require_evidence: false, permit_observation: true, measurement_unit: 'kg' },
      { title: '[Perca] Peso Total de Perca / Descarte (kg)', description: 'Peso total em kg de perdas e descarte não aproveitáveis.', response_type: 'numeric', is_required: true, weight: 1, sort_order: 10, is_critical: false, require_evidence: false, permit_observation: true, measurement_unit: 'kg' },
      { title: '[Rendimento] Peso Total do Rendimento (kg)', description: 'Soma dos pesos dos Bifes Chapa + Bifes Empanados + Retalhos + Percas. Deve coincidir com o peso total retirado.', response_type: 'numeric', is_required: true, weight: 1.5, sort_order: 11, is_critical: true, require_evidence: false, permit_observation: true, measurement_unit: 'kg' }
    ]
  }
];

const getResponseTypeGuideline = (type: string) => {
  switch(type) {
    case 'boolean':
      return {
        title: 'Feito / Não Feito (Binário)',
        description: 'O operador simplesmente clica para marcar se a tarefa foi executada ou não com um switch visual.',
        useCase: 'Ideal para tarefas simples e diretas, como "Varrer o chão" ou "Retirar lixo".',
        preview: '🟢 Realizado  /  ⚪ Não Realizado',
        borderColor: 'border-indigo-500/30 bg-indigo-500/5',
        textColor: 'text-indigo-400'
      };
    case 'conformity':
      return {
        title: 'Conforme / Não Conforme',
        description: 'O operador avalia se o item está de acordo com as regras (Conforme) ou irregular (Não Conforme). Se irregular, abre campo para justificativa e foto.',
        useCase: 'Perfeito para auditorias de qualidade e segurança de padrões, como "Organização de talheres" ou "Higiene da bancada".',
        preview: '✅ Conforme (C)  /  ❌ Não Conforme (NC)',
        borderColor: 'border-emerald-500/30 bg-emerald-500/5',
        textColor: 'text-emerald-400'
      };
    case 'yes_no':
      return {
        title: 'Pergunta explícita Sim / Não',
        description: 'O operador escolhe entre dois botões claros: Sim ou Não. Muito objetivo.',
        useCase: 'Verificações gerais de presença ou tomadas de decisão rápidas, como "Há bobinas de papel de reserva?".',
        preview: '👍 Sim  /  👎 Não',
        borderColor: 'border-blue-500/30 bg-blue-500/5',
        textColor: 'text-blue-400'
      };
    case 'numeric':
      return {
        title: 'Campo Numérico Geral',
        description: 'Abre um teclado numérico para o operador digitar um valor. Você pode configurar metas de limite Mínimo e Máximo que geram alertas automáticos se ultrapassados.',
        useCase: 'Leituras de medidores ou registros quantitativos, como "Fundo de troco em R$" ou "Contagem física de cadeiras".',
        preview: '[ 1234 ] (Validação de limites automáticos)',
        borderColor: 'border-purple-500/30 bg-purple-500/5',
        textColor: 'text-purple-400'
      };
    case 'temperature':
      return {
        title: 'Temperatura em °C',
        description: 'O operador digita a temperatura medida em graus Celsius. Indispensável para controle de segurança alimentar com metas térmicas estritas de segurança alimentar.',
        useCase: 'Aferição de câmaras frias, freezers de proteínas e pistas quentes de cozimento.',
        preview: '[ -18 ] °C (Validação térmica estrita)',
        borderColor: 'border-rose-500/30 bg-rose-500/5',
        textColor: 'text-rose-400'
      };
    case 'kg':
      return {
        title: 'Controle de Peso (Kilograma - kg)',
        description: 'Permite digitar valores decimais com até 3 casas (ex: 2,820 kg) para controle de peso e rendimento. Suporta limites Mínimo e Máximo.',
        useCase: 'Pesagem de proteínas retiradas do estoque, controle de rendimento de bifes e fichas técnicas de produção.',
        preview: '[ 2,820 ] kg (Casas decimais ativas)',
        borderColor: 'border-cyan-500/30 bg-cyan-500/5',
        textColor: 'text-cyan-400'
      };
    case 'counter':
      return {
        title: 'Contador Físico (+ / -)',
        description: 'O operador clica nos botões de mais (+) ou menos (-) para contar quantidades no tablet de forma rápida, sem precisar abrir o teclado de digitação.',
        useCase: 'Controle de estoques pequenos de copos, talheres, pratos ou bebidas remanescentes no bar no final do dia.',
        preview: '➖  [ 5 ]  ➕',
        borderColor: 'border-amber-500/30 bg-amber-500/5',
        textColor: 'text-amber-400'
      };
    case 'text':
      return {
        title: 'Resposta em Texto Livre',
        description: 'Abre uma caixa de diálogo para o operador digitar justificativas ou observações livres extensas de próprio punho.',
        useCase: 'Relatos descritivos de ocorrências, avarias de equipamentos ou anotações de auditorias.',
        preview: '✍️ "O compressor apresentou um ruído diferente..."',
        borderColor: 'border-slate-500/30 bg-slate-500/5',
        textColor: 'text-slate-400'
      };
    case 'photo':
      return {
        title: 'Foto Obrigatória como Evidência',
        description: 'O operador é obrigado a abrir a câmera do celular/tablet e tirar uma foto da tarefa concluída para conseguir encerrar o roteiro.',
        useCase: 'Auditoria de evidência indiscutível de padrão, como "Foto da fechadura trancada" ou "Foto do salão limpo".',
        preview: '📷 [ Tirar Foto Evidência ]',
        borderColor: 'border-sky-500/30 bg-sky-500/5',
        textColor: 'text-sky-400'
      };
    case 'stars':
      return {
        title: 'Avaliação por Estrelas (1-5)',
        description: 'O operador avalia a qualidade do item tocando em estrelas (de 1 a 5), oferecendo uma nota de qualidade extremamente visual e ágil.',
        useCase: 'Auditorias subjetivas de padrão e capricho estético, como "Apresentação dos pratos no balcão" ou "Higiene visual da copa".',
        preview: '⭐ ⭐ ⭐ ⭐ ⭐',
        borderColor: 'border-yellow-500/30 bg-yellow-500/5',
        textColor: 'text-yellow-400'
      };
    default:
      return null;
  }
};

export default function ChecklistBuilder() {
  const { showMainSidebar, setShowMainSidebar } = (useOutletContext() as { showMainSidebar: boolean, setShowMainSidebar: (v: boolean) => void }) || { showMainSidebar: true, setShowMainSidebar: () => {} };
  const geminiApiKey = geminiService.getApiKey();
  const storeTenantId = useChatStore((state) => state.tenantInfo?.id);
  const tenantId = storeTenantId || localStorage.getItem('current_tenant_id') || sessionStorage.getItem('current_tenant_id');

  // Listas de Carregamento
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [sectors, setSectors] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [cargos, setCargos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Estados para Categorias e Setores Rápidos
  const [categories, setCategories] = useState<string[]>(['Higiene', 'Abertura', 'Fechamento', 'Estoque', 'Segurança Alimentar']);
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const [showAddSectorModal, setShowAddSectorModal] = useState(false);
  const [newSectorName, setNewSectorName] = useState('');
  const [newSectorUnitId, setNewSectorUnitId] = useState('');
  const [showInlineUnitCreation, setShowInlineUnitCreation] = useState(false);
  const [newUnitName, setNewUnitName] = useState('');
  const [creatingUnit, setCreatingUnit] = useState(false);

  // Estados para Controle de UX de Abas e Drawer de Tarefas
  const [activeTab, setActiveTab] = useState<'info' | 'items' | 'schedules'>('info');
  const [showTaskDrawer, setShowTaskDrawer] = useState(false);
  const [editingTaskIndex, setEditingTaskIndex] = useState<number | null>(null);
  const [newSubTaskName, setNewSubTaskName] = useState('');
  const [expandedTaskIndexes, setExpandedTaskIndexes] = useState<number[]>([]);
  const [showResponseTypeGuide, setShowResponseTypeGuide] = useState(false);
  const [showResponsiblesDropdown, setShowResponsiblesDropdown] = useState(false);
  const [responsiblesSearchQuery, setResponsiblesSearchQuery] = useState('');
  const [activeCardResponsiblePopoverId, setActiveCardResponsiblePopoverId] = useState<string | null>(null);
  const [cardResponsiblesSearchQuery, setCardResponsiblesSearchQuery] = useState('');

  // Estados de Criação / Edição do Checklist Principal
  const [editingChecklist, setEditingChecklist] = useState<Partial<Checklist> | null>(null);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);

  // Estados para Tolerância baseada em Janela Operacional
  const [toleranceMode, setToleranceMode] = useState<'minutes' | 'window'>('window');
  const [refPrevTime, setRefPrevTime] = useState<string>('10:00');
  const [refEndTime, setRefEndTime] = useState<string>('10:20');
  const [refAlarmMinutes, setRefAlarmMinutes] = useState<number>(5);

  // Estados de Edição Inline de Item
  const [newItem, setNewItem] = useState<ChecklistItem>({
    title: '',
    description: '',
    response_type: 'boolean',
    is_required: true,
    weight: 1,
    sort_order: 0,
    is_critical: false,
    require_evidence: false,
    permit_observation: true,
    min_meta: null,
    max_meta: null,
    measurement_unit: '',
    options: null
  });

  const [tempItemCategory, setTempItemCategory] = useState('');
  const [tempItemName, setTempItemName] = useState('');
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);

  // Estados de Edição Rápida Inline na lista
  const [quickEditingIndex, setQuickEditingIndex] = useState<number | null>(null);
  const [quickCategory, setQuickCategory] = useState('');
  const [quickType, setQuickType] = useState('');
  const [quickProvider, setQuickProvider] = useState('');
  const [quickMin, setQuickMin] = useState<number | null>(null);
  const [quickMax, setQuickMax] = useState<number | null>(null);

  // Estados do Modal do Assistente de I.A (Gemini)
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [generatingAi, setGeneratingAi] = useState(false);

  // Estados do Modal de Importação de Excel
  const [showExcelImportModal, setShowExcelImportModal] = useState(false);
  const [excelImportItems, setExcelImportItems] = useState<ChecklistItem[]>([]);
  const [excelFileName, setExcelFileName] = useState('');
  const [excelParsingError, setExcelParsingError] = useState('');
  const [excelEditingIdx, setExcelEditingIdx] = useState<number | null>(null);
  const excelFileInputRef = useRef<HTMLInputElement>(null);

  // Mensagens do Sistema
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (tenantId) {
      loadInitialData();
    }
  }, [tenantId, storeTenantId]);

  // Função para converter horários da Janela Operacional para minutos de tolerância
  const updateMinutesFromWindow = (prevTime: string, endTime: string, alarmMin: number) => {
    if (!editingChecklist) return;
    const parseTimeToMin = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
    };

    const mRef = parseTimeToMin(prevTime);
    const mEnd = parseTimeToMin(endTime);

    // min_time_lead_minutes é o tempo de alarme antes
    const lead = Math.max(0, alarmMin);

    // max_time_lag_minutes é a diferença entre a hora fim e o horário previsto
    let lag = mEnd - mRef;
    if (lag < 0) lag += 1440; // Trata virada do dia

    setEditingChecklist(p => p ? {
      ...p,
      min_time_lead_minutes: lead,
      max_time_lag_minutes: lag
    } : null);
  };

  // Efeito para sincronizar os inputs locais de horário a partir dos minutos de tolerância
  useEffect(() => {
    if (editingChecklist) {
      // Tenta pegar o horário do primeiro agendamento como referência. Senão usa o refPrevTime atual.
      const firstSchTime = schedules[0]?.start_time || refPrevTime || '10:00';
      setRefPrevTime(firstSchTime);

      const parseTimeToMin = (t: string) => {
        const [h, m] = t.split(':').map(Number);
        return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
      };

      const mRef = parseTimeToMin(firstSchTime);
      const lead = editingChecklist.min_time_lead_minutes || 0;
      const lag = editingChecklist.max_time_lag_minutes || 0;

      // Sincroniza minutos de alarme
      setRefAlarmMinutes(lead);

      // Calcula Hora Fim = mRef + lag
      const mEnd = (mRef + lag) % 1440;

      const minToTimeString = (m: number) => {
        const h = Math.floor(m / 60);
        const min = m % 60;
        return `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
      };

      setRefEndTime(minToTimeString(mEnd));
    }
  }, [editingChecklist?.id, schedules.length]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      // Executar todas as requisições principais de forma concorrente em paralelo (Promise.all)
      const [secRes, uniRes, usersRes, checklistsRes, cargosRes] = await Promise.all([
        supabase.from('sectors').select('id, name, unit_id').eq('tenant_id', tenantId),
        supabase.from('units').select('id, name').eq('tenant_id', tenantId),
        supabase.from('v_checklist_operators').select('id, name, role, cargo_id').eq('tenant_id', tenantId).eq('is_active', true),
        // Faz o join leve para obter os IDs dos itens e contar a quantidade sem N+1 HTTP queries!
        supabase.from('checklists').select('*, checklist_items(id)').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
        supabase.from('cargos').select('*').eq('tenant_id', tenantId)
      ]);

      if (secRes.error) throw secRes.error;
      if (uniRes.error) throw uniRes.error;
      if (usersRes.error) throw usersRes.error;
      if (checklistsRes.error) throw checklistsRes.error;
      if (cargosRes.error) throw cargosRes.error;

      const secData = secRes.data || [];
      const uniData = uniRes.data || [];
      const usersData = usersRes.data || [];
      const checklistsData = checklistsRes.data || [];
      const cargosData = cargosRes.data || [];

      setSectors(secData);
      setUnits(uniData);
      setUsers(usersData);
      setCargos(cargosData);

      // Calcular contagem de itens em memória local para evitar N+1 HTTP queries
      const checklistsWithCounts = checklistsData.map((chk: any) => {
        const items = chk.checklist_items || [];
        return {
          ...chk,
          items_count: items.length
        };
      });

      setChecklists(checklistsWithCounts);

      // Mapeamento dinâmico de categorias existentes
      const defaultCategories = ['Higiene', 'Abertura', 'Fechamento', 'Estoque', 'Segurança Alimentar'];
      const dbCategories = checklistsData ? checklistsData.map((c: any) => c.category).filter(Boolean) : [];
      const combinedCategories = Array.from(new Set([...defaultCategories, ...dbCategories]));
      setCategories(combinedCategories);
    } catch (err: any) {
      console.error(err);
      showToast('error', 'Falha ao carregar checklists e configurações.');
    } finally {
      setLoading(false);
    }
  };

  const showToast = (type: 'success' | 'error', msg: string) => {
    if (type === 'success') {
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(''), 4000);
    } else {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(''), 4000);
    }
    // Log no Antigravity DevLogger
    useDevStore.getState().addLog({
      type: type === 'success' ? 'success' : 'error',
      message: msg,
      source: 'ChecklistBuilder',
    });
  };

  const loadChecklistItemsAndSchedules = async (chkId: string) => {
    try {
      // Carregar itens
      const { data: items } = await supabase
        .from('checklist_items')
        .select('*')
        .eq('checklist_id', chkId)
        .order('sort_order', { ascending: true });
      setChecklistItems(items || []);

      // Carregar agendamentos
      const { data: schs } = await supabase
        .from('checklist_schedules')
        .select('*')
        .eq('checklist_id', chkId);
      setSchedules(schs || []);
    } catch (err) {
      console.error('Erro ao carregar itens de checklist:', err);
    }
  };

  const handleEditChecklist = (chk: Checklist) => {
    setEditingChecklist(chk);
    loadChecklistItemsAndSchedules(chk.id);
  };

  const handleAddChecklist = () => {
    setEditingChecklist({
      title: '',
      description: '',
      category: 'Higiene',
      sector_id: sectors[0]?.id || '',
      use_unit_schedule_rules: true,
      min_time_lead_minutes: 60,
      max_time_lag_minutes: 60,
      weight: 1,
      is_active: true,
      responsible_ids: []
    });
    setChecklistItems([]);
    setSchedules([]);
  };

  const handleSelectTemplate = (template: typeof TEMPLATES_LIST[0]) => {
    if (template.id === 'novo_em_branco') {
      handleAddChecklist();
      setShowTemplateSelector(false);
      return;
    }

    if (template.id === 'criar_ia') {
      setAiPrompt('');
      setShowAiModal(true);
      setShowTemplateSelector(false);
      return;
    }

    // Tenta encontrar o setor adequado para o template de forma inteligente
    let matchedSectorId = sectors[0]?.id || '';
    
    // Se o template tem uma tag, tenta mapear para o setor correspondente
    if (template.tags && template.tags.length > 0) {
      const templateSectorTag = template.tags[0].toLowerCase(); // ex: 'cozinha', 'salão', 'caixa', 'bar', 'gerência'
      const matchedSector = sectors.find(s => s.name.toLowerCase().includes(templateSectorTag));
      if (matchedSector) {
        matchedSectorId = matchedSector.id;
      }
    }

    setEditingChecklist({
      title: template.title,
      description: template.description,
      category: template.category,
      sector_id: matchedSectorId,
      use_unit_schedule_rules: true,
      min_time_lead_minutes: 60,
      max_time_lag_minutes: 60,
      weight: 1,
      is_active: true,
      responsible_ids: []
    });

    const mappedItems = (template.items || []).map((item: any, idx: number) => ({
      title: item.title,
      description: item.description,
      response_type: item.response_type,
      is_required: item.is_required,
      weight: item.weight,
      sort_order: idx,
      is_critical: item.is_critical,
      require_evidence: item.require_evidence,
      permit_observation: item.permit_observation,
      min_meta: item.min_meta ?? null,
      max_meta: item.max_meta ?? null,
      measurement_unit: item.measurement_unit || '',
      options: item.options ? [...item.options] : null
    }));

    setChecklistItems(mappedItems);
    setSchedules([]);
    setShowTemplateSelector(false);
  };

  // ==========================================
  // ASSISTENTE DE CRIAÇÃO INTELIGENTE COM I.A (GEMINI)
  // ==========================================
  const handleGenerateWithAi = async () => {
    if (!aiPrompt.trim()) {
      showToast('error', 'Digite um prompt para a I.A criar.');
      return;
    }

    if (!geminiApiKey) {
      showToast('error', 'Chave de API do Gemini não configurada. Por favor, sete VITE_GEMINI_API_KEY.');
      return;
    }

    setGeneratingAi(true);
    try {
      const genAI = new GoogleGenerativeAI(geminiApiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

      const systemInstruction = `
        Você é um arquiteto especialista em segurança alimentar e processos operacionais de restaurantes e hamburguerias.
        Você deve gerar um checklist completo e realista com base no prompt do usuário no formato de um objeto JSON válido.
        O JSON gerado DEVE seguir a seguinte tipagem TypeScript descrita abaixo e não conter explicações em markdown, apenas o JSON:
        
        {
          "title": "Título sugerido para o checklist",
          "description": "Breve explicação do propósito operacional",
          "category": "Higiene / Abertura / Fechamento / Recebimento / Controle de Temperatura",
          "items": [
            {
              "title": "Título da tarefa (Ex: Verificar temperatura freezer principal)",
              "description": "Explicação curta de como o operador realiza a tarefa",
              "response_type": "boolean / conformity / yes_no / numeric / temperature / counter / text / photo / stars",
              "is_required": true,
              "weight": 1.0,
              "is_critical": true,
              "require_evidence": true,
              "min_meta": -18.00,
              "max_meta": -12.00,
              "measurement_unit": "°C"
            }
          ]
        }

        Restrições importantes para o JSON:
        1. Em response_type use EXCLUSIVAMENTE um destes: 'boolean', 'conformity', 'yes_no', 'numeric', 'temperature', 'counter', 'text', 'photo', 'stars'.
        2. Se o item for numérico ou temperatura, forneça obrigatoriamente min_meta e max_meta coerentes se aplicável.
        3. Marque os itens cruciais para segurança alimentar (como cadeia de frio ou mise en place perecível) como is_critical: true.
      `;

      const prompt = `Gere o checklist conforme as instruções anteriores para: ${aiPrompt}`;

      const result = await model.generateContent([systemInstruction, prompt]);
      const text = result.response.text();
      
      // Limpa possível formatação de markdown da resposta do Gemini
      const cleanJsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
      const generatedData = JSON.parse(cleanJsonStr);

      if (generatedData && generatedData.items) {
        setEditingChecklist(prev => ({
          ...prev,
          title: generatedData.title || prev?.title || 'Checklist Gerado por IA',
          description: generatedData.description || prev?.description || 'Estruturado por IA',
          category: generatedData.category || prev?.category || 'Geral'
        }));

        const itemsWithOrders = generatedData.items.map((item: any, idx: number) => ({
          title: item.title,
          description: item.description || '',
          response_type: item.response_type || 'boolean',
          is_required: item.is_required ?? true,
          weight: item.weight || 1,
          sort_order: idx,
          is_critical: item.is_critical ?? false,
          require_evidence: item.require_evidence ?? false,
          permit_observation: true,
          min_meta: item.min_meta || null,
          max_meta: item.max_meta || null,
          measurement_unit: item.measurement_unit || '',
          options: item.options || null
        }));

        setChecklistItems(itemsWithOrders);
        showToast('success', 'Checklist estruturado com sucesso pela I.A do Gemini!');
        setShowAiModal(false);
      }
    } catch (err: any) {
      console.error(err);
      showToast('error', 'A I.A falhou em estruturar o JSON. Tente um prompt mais claro.');
    } finally {
      setGeneratingAi(false);
    }
  };

  // ==========================================
  // MANIPULAÇÃO DE ITENS INLINE
  // ==========================================
  const handleAddItem = () => {
    if (!newItem.title.trim()) {
      showToast('error', 'O item precisa de um título.');
      return;
    }

    setChecklistItems(prev => [
      ...prev,
      {
        ...newItem,
        sort_order: prev.length
      }
    ]);

    // Reseta form inline do item
    setNewItem({
      title: '',
      description: '',
      response_type: 'boolean',
      is_required: true,
      weight: 1,
      sort_order: 0,
      is_critical: false,
      require_evidence: false,
      permit_observation: true,
      min_meta: null,
      max_meta: null,
      measurement_unit: '',
      options: null
    });
  };

  const handleRemoveItem = (index: number) => {
    setChecklistItems(prev => {
      const filtered = prev.filter((_, idx) => idx !== index);
      // Reordena os sort_orders
      return filtered.map((item, idx) => ({ ...item, sort_order: idx }));
    });
  };

  // ==========================================
  // MANIPULAÇÃO DE AGENDAMENTOS
  // ==========================================
  const handleAddSchedule = (recurrency: 'daily' | 'weekly' | 'monthly' = 'daily') => {
    const newSch: Schedule = {
      checklist_id: editingChecklist?.id || '',
      unit_id: 'ALL',
      responsible_user_id: null,
      start_time: '08:00',
      recurrency,
      days_of_week: recurrency === 'weekly' ? [1, 2, 3, 4, 5] : null, // Segunda a Sexta por padrão
      days_of_month: recurrency === 'monthly' ? [1] : null, // Dia 1 por padrão
      shift: 'Manhã',
      start_date: new Date().toISOString().split('T')[0],
      is_active: true
    };
    setSchedules(prev => [...prev, newSch]);
  };

  const handleRemoveSchedule = (idx: number) => {
    setSchedules(prev => prev.filter((_, i) => i !== idx));
  };

  // ==========================================
  // SALVAR NO BANCO DE DADOS (TRANSAÇÃO COMPLETA)
  // ==========================================
  const handleSaveAll = async () => {
    if (!editingChecklist?.title?.trim()) {
      showToast('error', 'O Checklist precisa de um Título.');
      return;
    }
    if (!editingChecklist.sector_id) {
      showToast('error', 'Selecione um Setor Responsável antes de salvar.');
      return;
    }

    setSaving(true);
    try {
      const checklistPayload = {
        tenant_id: tenantId,
        sector_id: editingChecklist.sector_id,
        created_by: supabase.auth.user?.id || null,
        title: editingChecklist.title,
        description: editingChecklist.description || '',
        category: editingChecklist.category || 'Geral',
        tags: editingChecklist.tags || [],
        use_unit_schedule_rules: editingChecklist.use_unit_schedule_rules ?? true,
        min_time_lead_minutes: editingChecklist.min_time_lead_minutes || 60,
        max_time_lag_minutes: editingChecklist.max_time_lag_minutes || 60,
        is_active: editingChecklist.is_active ?? true,
        weight: editingChecklist.weight || 1,
        responsible_ids: editingChecklist.responsible_ids || []
      };

      let finalChecklistId = editingChecklist.id;

      const checklistBefore = editingChecklist.id ? checklists.find(c => c.id === editingChecklist.id) : null;
      if (editingChecklist.id) {
        // 1. Atualizar Checklist
        const { error: chkErr } = await supabase
          .from('checklists')
          .update(checklistPayload)
          .eq('id', editingChecklist.id);
        if (chkErr) throw chkErr;
        const checklistAfter = { ...checklistBefore, ...checklistPayload };
        await useChatStore.getState().logOperation('UPDATE', 'checklists', editingChecklist.id, checklistBefore || null, checklistAfter);
      } else {
        // 1. Inserir Checklist
        const { data: newChk, error: chkErr } = await supabase
          .from('checklists')
          .insert(checklistPayload)
          .select()
          .single();
        if (chkErr) throw chkErr;
        finalChecklistId = newChk.id;
        await useChatStore.getState().logOperation('INSERT', 'checklists', finalChecklistId, null, newChk);
      }

      // Ler itens anteriores para permitir rollback em caso de falhas catastróficas
      const { data: previousItems } = await supabase.from('checklist_items').select('*').eq('checklist_id', finalChecklistId);

      // 2. Salvar Itens (Exclui os antigos e insere todos para garantir sincronia e sort_order)
      await supabase.from('checklist_items').delete().eq('checklist_id', finalChecklistId);
      if (checklistItems.length > 0) {
        const itemsPayload = checklistItems.map(item => ({
          checklist_id: finalChecklistId,
          title: item.title,
          description: item.description || '',
          response_type: item.response_type,
          is_required: item.is_required,
          weight: item.weight || 1,
          sort_order: item.sort_order,
          is_critical: item.is_critical,
          require_evidence: item.require_evidence,
          permit_observation: item.permit_observation,
          min_meta: item.min_meta || null,
          max_meta: item.max_meta || null,
          measurement_unit: item.measurement_unit || '',
          options: item.options || null
        }));
        const { error: itemsErr } = await supabase.from('checklist_items').insert(itemsPayload);
        if (itemsErr) {
          // ROLLBACK MANUAL: Restaura os itens antigos no banco se a inserção falhar
          if (previousItems && previousItems.length > 0) {
            const rollbackPayloads = previousItems.map(pi => {
              const { id, created_at, ...cleanItem } = pi;
              return cleanItem;
            });
            await supabase.from('checklist_items').insert(rollbackPayloads);
          }
          throw itemsErr;
        }
      }

      // 3. Vincular Checklist a Unidade ativa (checklist_units)
      await supabase.from('checklist_units').delete().eq('checklist_id', finalChecklistId);
      // Vincula a todas as unidades que o setor selecionado ou agendamento pertence
      const selectedSector = sectors.find(s => s.id === editingChecklist.sector_id);
      if (selectedSector) {
        await supabase.from('checklist_units').insert({
          checklist_id: finalChecklistId,
          unit_id: selectedSector.unit_id
        });
      }

      // 4. Salvar Agendamentos (Schedules)
      await supabase.from('checklist_schedules').delete().eq('checklist_id', finalChecklistId);
      if (schedules.length > 0) {
        const schPayloads: any[] = [];
        
        schedules.forEach(sch => {
          if (sch.unit_id === 'ALL') {
             // Create one for each unit
             units.forEach(u => {
               schPayloads.push({
                 tenant_id: tenantId,
                 checklist_id: finalChecklistId,
                 unit_id: u.id,
                 responsible_user_id: sch.responsible_user_id,
                 start_time: sch.start_time,
                 recurrency: sch.recurrency,
                 days_of_week: sch.days_of_week,
                 days_of_month: sch.days_of_month,
                 shift: sch.shift,
                 start_date: sch.start_date,
                 end_date: sch.end_date,
                 is_active: sch.is_active
               });
             });
          } else {
             schPayloads.push({
               tenant_id: tenantId,
               checklist_id: finalChecklistId,
               unit_id: sch.unit_id,
               responsible_user_id: sch.responsible_user_id,
               start_time: sch.start_time,
               recurrency: sch.recurrency,
               days_of_week: sch.days_of_week,
               days_of_month: sch.days_of_month,
               shift: sch.shift,
               start_date: sch.start_date,
               end_date: sch.end_date,
               is_active: sch.is_active
             });
          }
        });

        const { error: schErr } = await supabase.from('checklist_schedules').insert(schPayloads);
        if (schErr) throw schErr;
      }

      showToast('success', 'Checklist operacional e agendamentos salvos!');
      setEditingChecklist(null);
      loadInitialData();
    } catch (err: any) {
      console.error(err);
      showToast('error', `Falha ao salvar: ${err.message}`);
      useDevStore.getState().addLog({
        type: 'error',
        message: `[handleSaveAll] Erro ao salvar checklist: ${err.message}`,
        source: 'ChecklistBuilder',
        details: { stack: err.stack, code: err.code, hint: err.hint }
      });
    } finally {
      setSaving(false);
    }
  };

  // ==========================================
  // FUNÇÕES DE AÇÃO RÁPIDA DIRETAMENTE NOS CARDS
  // ==========================================
  const handleToggleChecklistStatus = async (chk: Checklist) => {
    const newStatus = !chk.is_active;
    
    // 1. Atualização Instantânea na UI (Optimistic Update)
    setChecklists(prev => 
      prev.map(c => c.id === chk.id ? { ...c, is_active: newStatus } : c)
    );

    showToast('success', `Checklist "${chk.title}" ${newStatus ? 'ativado' : 'inativado'}!`);

    try {
      // 2. Sincroniza em background com o Supabase
      const { error } = await supabase
        .from('checklists')
        .update({ is_active: newStatus })
        .eq('id', chk.id);
      
      if (error) throw error;
    } catch (err: any) {
      console.error(err);
      showToast('error', `Falha ao atualizar status: ${err.message}`);
      // Reverte o estado local em caso de erro no banco
      setChecklists(prev => 
        prev.map(c => c.id === chk.id ? { ...c, is_active: chk.is_active } : c)
      );
    }
  };

  const getJobBadgeText = (cargoId: string) => {
    const cargo = cargos.find(c => c.id === cargoId);
    if (!cargo) return '';
    const DAYS_NAMES: Record<string, string> = {
      seg: 'Seg', ter: 'Ter', qua: 'Qua', qui: 'Qui', sex: 'Sex', sab: 'Sáb', dom: 'Dom'
    };
    const formattedDays = cargo.work_days && cargo.work_days.length > 0
      ? cargo.work_days.map((d: string) => DAYS_NAMES[d] || d).join(',')
      : 'Sem escala';
    const start = cargo.start_time?.slice(0, 5) || '08:00';
    const end = cargo.end_time?.slice(0, 5) || '18:00';
    return `${cargo.name} (${formattedDays} • ${start}-${end})`;
  };

  const handleUpdateCardResponsibles = async (chk: Checklist, userId: string) => {
    const currentIds = chk.responsible_ids || [];
    const newIds = currentIds.includes(userId)
      ? currentIds.filter(id => id !== userId)
      : [...currentIds, userId];

    // 1. Atualização Instantânea na UI (Optimistic Update)
    setChecklists(prev => 
      prev.map(c => c.id === chk.id ? { ...c, responsible_ids: newIds } : c)
    );

    try {
      // 2. Sincroniza em background com o Supabase
      const { error } = await supabase
        .from('checklists')
        .update({ responsible_ids: newIds })
        .eq('id', chk.id);
      
      if (error) throw error;
      showToast('success', `Responsáveis de "${chk.title}" atualizados!`);
    } catch (err: any) {
      console.error(err);
      showToast('error', `Falha ao atualizar responsáveis: ${err.message}`);
      // Reverte o estado local em caso de erro no banco
      setChecklists(prev => 
        prev.map(c => c.id === chk.id ? { ...c, responsible_ids: currentIds } : c)
      );
    }
  };

  const handleDeleteChecklist = async (id: string) => {
    if (!window.confirm('Tem certeza absoluta que deseja remover este checklist e todos os seus históricos operacionais? Esta ação é irreversível.')) return;
    try {
      const checklistBefore = checklists.find(c => c.id === id);
      const { error } = await supabase.from('checklists').delete().eq('id', id);
      if (error) throw error;
      await useChatStore.getState().logOperation('DELETE', 'checklists', id, checklistBefore || null, null);
      showToast('success', 'Checklist excluído.');
      loadInitialData();
    } catch (err: any) {
      console.error(err);
      showToast('error', `Erro ao deletar: ${err.message}`);
    }
  };

  const handleCreateCategory = () => {
    if (!newCategoryName.trim()) {
      showToast('error', 'O nome da categoria não pode estar vazio.');
      return;
    }
    const cleanCat = newCategoryName.trim();
    if (categories.includes(cleanCat)) {
      showToast('error', 'Esta categoria já existe.');
      return;
    }
    setCategories(prev => [...prev, cleanCat]);
    setEditingChecklist(p => p ? { ...p, category: cleanCat } : null);
    setNewCategoryName('');
    setShowAddCategoryModal(false);
    showToast('success', `Categoria "${cleanCat}" adicionada com sucesso!`);
  };

  const handleCreateUnit = async () => {
    if (!newUnitName.trim()) {
      showToast('error', 'O nome da filial não pode estar vazio.');
      return;
    }

    setCreatingUnit(true);
    try {
      const { data: newUnit, error } = await supabase
        .from('units')
        .insert({
          tenant_id: tenantId,
          name: newUnitName.trim(),
          cep: '00000000',
          street: 'Não informado',
          number: 'S/N',
          neighborhood: 'Não informado',
          city: 'Não informado',
          state: 'NA'
        })
        .select()
        .single();

      if (error) throw error;

      // Recarregar lista de filiais
      const { data: uniData } = await supabase.from('units').select('id, name').eq('tenant_id', tenantId);
      setUnits(uniData || []);

      // Auto-selecionar a filial recém-criada
      setNewSectorUnitId(newUnit.id);
      setNewUnitName('');
      setShowInlineUnitCreation(false);
      showToast('success', `Filial "${newUnit.name}" criada com sucesso!`);

      useDevStore.getState().addLog({
        type: 'success',
        message: `[handleCreateUnit] Filial criada: ${newUnit.name} (${newUnit.id})`,
        source: 'ChecklistBuilder',
      });
    } catch (err: any) {
      console.error(err);
      showToast('error', `Falha ao criar filial: ${err.message}`);
      useDevStore.getState().addLog({
        type: 'error',
        message: `[handleCreateUnit] Erro: ${err.message}`,
        source: 'ChecklistBuilder',
        details: { stack: err.stack, code: err.code }
      });
    } finally {
      setCreatingUnit(false);
    }
  };

  const handleCreateSector = async () => {
    if (!newSectorName.trim()) {
      showToast('error', 'O nome do setor não pode estar vazio.');
      return;
    }
    if (!newSectorUnitId) {
      showToast('error', 'Selecione ou crie uma filial para o setor.');
      return;
    }
    
    setSaving(true);
    try {
      const { data: newSec, error } = await supabase
        .from('sectors')
        .insert({
          tenant_id: tenantId,
          unit_id: newSectorUnitId,
          name: newSectorName.trim()
        })
        .select()
        .single();

      if (error) throw error;

      const { data: secData } = await supabase.from('sectors').select('id, name, unit_id').eq('tenant_id', tenantId);
      setSectors(secData || []);

      setEditingChecklist(p => p ? { ...p, sector_id: newSec.id } : null);

      setNewSectorName('');
      setNewSectorUnitId('');
      setShowAddSectorModal(false);
      showToast('success', `Setor "${newSec.name}" cadastrado com sucesso!`);

      useDevStore.getState().addLog({
        type: 'success',
        message: `[handleCreateSector] Setor criado: ${newSec.name} (${newSec.id})`,
        source: 'ChecklistBuilder',
      });
    } catch (err: any) {
      console.error(err);
      showToast('error', `Falha ao cadastrar setor: ${err.message}`);
      useDevStore.getState().addLog({
        type: 'error',
        message: `[handleCreateSector] Erro: ${err.message}`,
        source: 'ChecklistBuilder',
        details: { stack: err.stack, code: err.code }
      });
    } finally {
      setSaving(false);
    }
  };

  // Funções de Ordenação Vertical de Itens do Roteiro
  const handleMoveItemUp = (index: number) => {
    if (index === 0) return;
    setChecklistItems(prev => {
      const items = [...prev];
      const temp = items[index];
      items[index] = items[index - 1];
      items[index - 1] = temp;
      return items.map((item, idx) => ({ ...item, sort_order: idx }));
    });
  };

  const handleMoveItemDown = (index: number) => {
    setChecklistItems(prev => {
      if (index === prev.length - 1) return prev;
      const items = [...prev];
      const temp = items[index];
      items[index] = items[index + 1];
      items[index + 1] = temp;
      return items.map((item, idx) => ({ ...item, sort_order: idx }));
    });
  };

  // Funções Controladoras do Drawer Lateral de Tarefas (Adição & Edição Inline)
  const handleSaveTaskDrawer = () => {
    if (!tempItemName.trim()) {
      showToast('error', 'A tarefa precisa de um nome.');
      return;
    }

    const finalTitle = tempItemCategory.trim()
      ? `[${tempItemCategory.trim()}] ${tempItemName.trim()}`
      : tempItemName.trim();

    const updatedItem = {
      ...newItem,
      title: finalTitle
    };

    setChecklistItems(prev => {
      const items = [...prev];
      if (editingTaskIndex !== null) {
        items[editingTaskIndex] = {
          ...updatedItem,
          sort_order: editingTaskIndex
        };
        showToast('success', 'Tarefa updated com sucesso!');
      } else {
        items.push({
          ...updatedItem,
          sort_order: items.length
        });
        showToast('success', 'Tarefa adicionada com sucesso!');
      }
      return items;
    });

    setNewItem({
      title: '',
      description: '',
      response_type: 'boolean',
      is_required: true,
      weight: 1,
      sort_order: 0,
      is_critical: false,
      require_evidence: false,
      permit_observation: true,
      min_meta: null,
      max_meta: null,
      measurement_unit: '',
      options: null
    });
    setTempItemCategory('');
    setTempItemName('');
    setShowCategoryDropdown(false);
    setEditingTaskIndex(null);
    setShowTaskDrawer(false);
  };

  const handleOpenEditTask = (index: number) => {
    const task = checklistItems[index];
    setNewItem({ ...task });
    
    const match = task.title.match(/^\[(.*?)\]\s*(.*)$/);
    if (match) {
      setTempItemCategory(match[1]);
      setTempItemName(match[2]);
    } else {
      setTempItemCategory('');
      setTempItemName(task.title);
    }

    setShowCategoryDropdown(false);
    setEditingTaskIndex(index);
    setShowResponseTypeGuide(false);
    setShowTaskDrawer(true);
  };

  const handleOpenAddTask = () => {
    setNewItem({
      title: '',
      description: '',
      response_type: 'boolean',
      is_required: true,
      weight: 1,
      sort_order: 0,
      is_critical: false,
      require_evidence: false,
      permit_observation: true,
      min_meta: null,
      max_meta: null,
      measurement_unit: '',
      options: null
    });
    setTempItemCategory('');
    setTempItemName('');
    setShowCategoryDropdown(false);
    setEditingTaskIndex(null);
    setShowResponseTypeGuide(false);
    setShowTaskDrawer(true);
  };

  // Funções de Edição Rápida Inline na Lista
  const handleStartQuickEdit = (index: number) => {
    const item = checklistItems[index];
    
    const match = item.title.match(/^\[(.*?)\]\s*(.*)$/);
    setQuickCategory(match ? match[1] : '');
    
    setQuickType(item.response_type);
    
    const provMatch = item.description ? item.description.match(/Fornecedor:\s*([^|]+)/) : null;
    setQuickProvider(provMatch ? provMatch[1].trim() : '');
    
    setQuickMin(item.min_meta);
    setQuickMax(item.max_meta);
    
    setQuickEditingIndex(index);
  };

  const handleCancelQuickEdit = () => {
    setQuickEditingIndex(null);
    setQuickCategory('');
    setQuickType('');
    setQuickProvider('');
    setQuickMin(null);
    setQuickMax(null);
  };

  const handleSaveQuickEdit = (index: number) => {
    const item = checklistItems[index];
    
    const match = item.title.match(/^\[(.*?)\]\s*(.*)$/);
    const cleanTitle = match ? match[2] : item.title;
    const finalTitle = quickCategory.trim() 
      ? `[${quickCategory.trim()}] ${cleanTitle}`
      : cleanTitle;

    const providerStr = quickProvider.trim() ? `Fornecedor: ${quickProvider.trim()}` : '';
    let finalDesc = item.description || '';
    if (finalDesc.includes('Fornecedor:')) {
      finalDesc = finalDesc.replace(/Fornecedor:\s*[^|]+/, providerStr)
        .split(' | ')
        .filter(part => part.trim().length > 0)
        .join(' | ');
    } else {
      const parts = finalDesc.split(' | ').filter(Boolean);
      if (providerStr) parts.push(providerStr);
      finalDesc = parts.join(' | ');
    }

    setChecklistItems(prev => {
      const newItems = [...prev];
      newItems[index] = {
        ...item,
        title: finalTitle,
        response_type: quickType,
        description: finalDesc,
        min_meta: (quickType === 'numeric' || quickType === 'temperature') ? quickMin : null,
        max_meta: (quickType === 'numeric' || quickType === 'temperature') ? quickMax : null
      };
      return newItems;
    });

    showToast('success', 'Tarefa atualizada com sucesso!');
    handleCancelQuickEdit();
  };

  // Funções Auxiliares de Gerenciamento de Sub-tarefas
  const handleAddSubTask = () => {
    if (!newSubTaskName.trim()) return;
    const cleanSub = newSubTaskName.trim();
    
    setNewItem(prev => {
      const currentOptions = prev.options || [];
      if (currentOptions.includes(cleanSub)) {
        showToast('error', 'Esta sub-tarefa já foi adicionada.');
        return prev;
      }
      return {
        ...prev,
        options: [...currentOptions, cleanSub]
      };
    });
    setNewSubTaskName('');
  };

  const handleRemoveSubTask = (idxToRemove: number) => {
    setNewItem(prev => {
      const currentOptions = prev.options || [];
      return {
        ...prev,
        options: currentOptions.filter((_, idx) => idx !== idxToRemove)
      };
    });
  };

  const toggleExpandTask = (index: number) => {
    setExpandedTaskIndexes(prev => {
      if (prev.includes(index)) {
        return prev.filter(idx => idx !== index);
      }
      return [...prev, index];
    });
  };

  // ==========================================
  // IMPORTAÇÃO DE PLANILHA EXCEL
  // ==========================================
  const VALID_RESPONSE_TYPES = ['boolean', 'conformity', 'yes_no', 'numeric', 'temperature', 'counter', 'text', 'photo', 'stars', 'single_select', 'multi_select', 'datetime', 'kg'];

  const normalizeHeader = (header: string): string => {
    const h = header.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    // Title / Descrição (nome do produto)
    if (['titulo', 'title', 'nome', 'item', 'produto', 'insumo', 'descricao do item', 'nome do item', 'nome do produto', 'descricao'].includes(h)) return 'title';
    // Detailed description / instructions
    if (['instrucao', 'instrucoes', 'detalhe', 'detalhes', 'obs', 'observacao', 'observacoes'].includes(h)) return 'description';
    // Response type
    if (['tipo', 'type', 'tipo_resposta', 'response_type', 'tipo de resposta'].includes(h)) return 'response_type';
    // Unit
    if (['unidade', 'unit', 'un', 'medida', 'unidade de medida', 'measurement_unit', 'un.', 'und', 'und.'].includes(h)) return 'measurement_unit';
    // Quantity / expected count
    if (['quantidade', 'qtd', 'qty', 'qtde', 'qtd.', 'quantidade esperada', 'estoque', 'saldo', 'contado'].includes(h)) return 'quantity_hint';
    // Critical
    if (['critico', 'critical', 'is_critical', 'e critico'].includes(h)) return 'is_critical';
    // Category / sector / grupo
    if (['categoria', 'category', 'setor', 'secao', 'grupo', 'area'].includes(h)) return 'category_group';
    // Weight
    if (['peso', 'weight', 'peso_item'].includes(h)) return 'weight';
    // Fornecedor / Supplier
    if (['fornecedor', 'supplier', 'fabricante', 'marca'].includes(h)) return 'supplier';
    // Custo / Cost
    if (['custo', 'cost', 'preco', 'valor', 'preco unitario', 'custo unitario', 'valor unitario'].includes(h)) return 'cost';
    // Min / Max
    if (h.includes('min') && h.includes('max')) return 'min_max';
    if (h === 'min' || h === 'minimo') return 'min_only';
    if (h === 'max' || h === 'maximo') return 'max_only';
    return h;
  };

  // Auto-detect the header row in a spreadsheet (skip decorative title rows)
  const findHeaderRow = (rawData: any[][]): number => {
    const headerKeywords = ['descricao', 'titulo', 'nome', 'item', 'produto', 'fornecedor', 'grupo', 'categoria', 'custo', 'title', 'description'];
    for (let i = 0; i < Math.min(20, rawData.length); i++) {
      const row = rawData[i];
      if (!row || row.length < 2) continue;
      const normalized = row.map((c: any) => String(c || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim());
      const matchCount = normalized.filter((cell: string) => headerKeywords.some(kw => cell.includes(kw))).length;
      if (matchCount >= 2) return i; // Found at least 2 header keywords in this row
    }
    return 0; // Fallback to first row
  };

  const handleExcelFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExcelFileName(file.name);
    setExcelParsingError('');
    setExcelEditingIdx(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const rawData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        if (rawData.length < 2) {
          setExcelParsingError('A planilha precisa ter pelo menos um cabeçalho e uma linha de dados.');
          return;
        }

        // Auto-detect the actual header row (skip title/summary rows)
        const headerRowIdx = findHeaderRow(rawData);
        const headerRow = rawData[headerRowIdx];

        // Map headers
        const headers = headerRow.map((h: any) => normalizeHeader(String(h || '')));
        const titleIdx = headers.indexOf('title');
        const descIdx = headers.indexOf('description');
        const typeIdx = headers.indexOf('response_type');
        const unitIdx = headers.indexOf('measurement_unit');
        const qtyIdx = headers.indexOf('quantity_hint');
        const critIdx = headers.indexOf('is_critical');
        const catIdx = headers.indexOf('category_group');
        const weightIdx = headers.indexOf('weight');
        const supplierIdx = headers.indexOf('supplier');
        const costIdx = headers.indexOf('cost');
        const minMaxIdx = headers.indexOf('min_max');
        const minOnlyIdx = headers.indexOf('min_only');
        const maxOnlyIdx = headers.indexOf('max_only');

        if (titleIdx === -1) {
          // Fallback: use first non-empty column as title
          let fallbackTitleIdx = 0;
          // Find first column that has data in the first data row
          const firstDataRow = rawData[headerRowIdx + 1];
          if (firstDataRow) {
            for (let c = 0; c < firstDataRow.length; c++) {
              if (String(firstDataRow[c] || '').trim()) { fallbackTitleIdx = c; break; }
            }
          }

          const items: ChecklistItem[] = [];
          for (let i = headerRowIdx + 1; i < rawData.length; i++) {
            const row = rawData[i];
            const title = String(row[fallbackTitleIdx] || '').trim();
            if (!title || title.toLowerCase() === 'total') continue;
            items.push({
              title,
              description: '',
              response_type: 'numeric',
              is_required: true,
              weight: 1,
              sort_order: items.length,
              is_critical: false,
              require_evidence: false,
              permit_observation: true,
              min_meta: null,
              max_meta: null,
              measurement_unit: 'un',
              options: null
            });
          }
          setExcelImportItems(items);
          if (items.length === 0) {
            setExcelParsingError('Nenhum item válido encontrado na planilha.');
          }
          return;
        }

        // Standard parsing with detected columns
        const items: ChecklistItem[] = [];
        for (let i = headerRowIdx + 1; i < rawData.length; i++) {
          const row = rawData[i];
          const title = String(row[titleIdx] || '').trim();
          if (!title || title.toLowerCase() === 'total') continue;

          let responseType = typeIdx >= 0 ? String(row[typeIdx] || '').trim().toLowerCase() : 'numeric';
          if (responseType === 'kilo' || responseType === 'kilograma' || responseType === 'kg' || responseType === 'quilo') {
            responseType = 'kg';
          }
          if (!VALID_RESPONSE_TYPES.includes(responseType)) responseType = 'numeric';

          const isCritical = critIdx >= 0 ? ['sim', 'yes', 'true', '1', 'x', 'critico'].includes(String(row[critIdx] || '').trim().toLowerCase()) : false;
          const unit = unitIdx >= 0 ? String(row[unitIdx] || '').trim() || 'un' : 'un';
          const weight = weightIdx >= 0 ? parseFloat(String(row[weightIdx] || '1')) || 1 : 1;
          const catGroup = catIdx >= 0 ? String(row[catIdx] || '').trim() : '';
          const supplier = supplierIdx >= 0 ? String(row[supplierIdx] || '').trim() : '';
          const costRaw = costIdx >= 0 ? row[costIdx] : '';
          const costVal = typeof costRaw === 'number' ? costRaw : parseFloat(String(costRaw || '0').replace(/[R$\s.]/g, '').replace(',', '.')) || 0;
          const costStr = costVal > 0 ? `R$ ${costVal.toFixed(2).replace('.', ',')}` : '';

          // Parse Min / Max (format: "10/30" or separate columns)
          let minMeta: number | null = null;
          let maxMeta: number | null = null;
          if (minMaxIdx >= 0) {
            const minMaxStr = String(row[minMaxIdx] || '').trim();
            const parts = minMaxStr.split('/').map(s => parseFloat(s.trim()));
            if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
              minMeta = parts[0];
              maxMeta = parts[1];
            }
          } else {
            if (minOnlyIdx >= 0) minMeta = parseFloat(String(row[minOnlyIdx] || '')) || null;
            if (maxOnlyIdx >= 0) maxMeta = parseFloat(String(row[maxOnlyIdx] || '')) || null;
          }

          // Build description with supplier and cost
          const descParts: string[] = [];
          if (descIdx >= 0) { const d = String(row[descIdx] || '').trim(); if (d) descParts.push(d); }
          if (supplier) descParts.push(`Fornecedor: ${supplier}`);
          if (costStr) descParts.push(`Custo: ${costStr}`);
          const desc = descParts.join(' | ');

          // Build the title prefix with category group
          const prefixedTitle = catGroup ? `[${catGroup}] ${title}` : title;

          items.push({
            title: prefixedTitle,
            description: desc,
            response_type: responseType,
            is_required: true,
            weight,
            sort_order: items.length,
            is_critical: isCritical,
            require_evidence: false,
            permit_observation: true,
            min_meta: minMeta,
            max_meta: maxMeta,
            measurement_unit: unit,
            options: null
          });
        }

        setExcelImportItems(items);
        if (items.length === 0) {
          setExcelParsingError('Nenhum item válido encontrado na planilha.');
        }
      } catch (err: any) {
        console.error('Erro ao parsear Excel:', err);
        setExcelParsingError(`Erro ao ler o arquivo: ${err.message || 'formato inválido'}`);
        useDevStore.getState().addLog({
          type: 'error',
          message: `[Excel Import] Erro ao parsear planilha: ${err.message}`,
          source: 'ChecklistBuilder',
          details: { fileName: file.name, stack: err.stack }
        });
      }
    };
    reader.readAsBinaryString(file);

    // Reset file input
    if (excelFileInputRef.current) {
      excelFileInputRef.current.value = '';
    }
  };

  const handleConfirmExcelImport = () => {
    if (excelImportItems.length === 0) return;
    
    setChecklistItems(prev => {
      const startIdx = prev.length;
      const newItems = excelImportItems.map((item, idx) => ({
        ...item,
        sort_order: startIdx + idx
      }));
      return [...prev, ...newItems];
    });

    showToast('success', `${excelImportItems.length} itens importados da planilha com sucesso!`);
    setShowExcelImportModal(false);
    setExcelImportItems([]);
    setExcelFileName('');
  };

  const handleExcelItemEdit = (idx: number, field: keyof ChecklistItem, value: any) => {
    setExcelImportItems(prev => {
      const items = [...prev];
      items[idx] = { ...items[idx], [field]: value };
      return items;
    });
  };

  const handleExcelItemRemove = (idx: number) => {
    setExcelImportItems(prev => prev.filter((_, i) => i !== idx).map((item, i) => ({ ...item, sort_order: i })));
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#182229] dark:bg-[#0b141a] text-[#d1d7db] overflow-y-auto p-6 styled-scrollbar">
      
      {/* Toast Messages */}
      {successMsg && (
        <div className="fixed top-4 right-4 bg-emerald-500 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
          <CheckCircle2 size={20} />
          <span className="text-sm font-medium">{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="fixed top-4 right-4 bg-rose-500 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2 z-50 animate-in fade-in slide-in-from-top-4 duration-300">
          <AlertTriangle size={20} />
          <span className="text-sm font-medium">{errorMsg}</span>
        </div>
      )}

      {/* MODAL: ASSISTENTE DE I.A (GEMINI) */}
      {showAiModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-[#202c33] border border-[#2a3942] rounded-[36px] p-6 max-w-lg w-full shadow-2xl relative animate-in zoom-in-95 duration-300">
            <button onClick={() => setShowAiModal(false)} className="absolute top-4 right-4 p-1 hover:bg-white/10 rounded-full text-[#8696a0]">
              <X size={18} />
            </button>
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
                <Sparkles size={20} className="animate-pulse" />
              </div>
              <div>
                <h3 className="font-bold text-white text-lg">Criar Checklist com I.A</h3>
                <p className="text-xs text-[#8696a0]">Crie rotinas detalhadas e metas operacionais em segundos.</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#8696a0] mb-1.5">O que deve conter no seu checklist?</label>
                <textarea
                  rows={4}
                  value={aiPrompt}
                  onChange={e => setAiPrompt(e.target.value)}
                  placeholder="Ex: Checklist completo de encerramento da cozinha de pizzaria, verificando temperaturas de fornos (meta até 40°C), fechamento de gás, câmara fria (meta até 4°C) e higienização geral de utensílios."
                  className="w-full bg-[#111b21] border border-[#2a3942] rounded-2xl p-4 text-xs text-[#d1d7db] focus:outline-none focus:border-indigo-500 placeholder-[#8696a0]"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleGenerateWithAi}
                  disabled={generatingAi}
                  className="flex-1 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-semibold py-3 rounded-2xl flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95 disabled:opacity-50"
                >
                  {generatingAi ? 'IA Estruturando Rotina...' : 'Estruturar Checklist'}
                  <Sparkles size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: NOVA CATEGORIA */}
      {showAddCategoryModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-[#202c33] border border-[#2a3942] rounded-[36px] p-6 max-w-sm w-full shadow-2xl relative animate-in zoom-in-95 duration-300">
            <button onClick={() => setShowAddCategoryModal(false)} className="absolute top-4 right-4 p-1 hover:bg-white/10 rounded-full text-[#8696a0]">
              <X size={18} />
            </button>
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
                <Plus size={20} />
              </div>
              <div>
                <h3 className="font-bold text-white text-base">Nova Categoria</h3>
                <p className="text-xs text-[#8696a0]">Adicione uma categoria personalizada para classificar o roteiro.</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#8696a0] mb-1.5">Nome da Categoria</label>
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={e => setNewCategoryName(e.target.value)}
                  placeholder="Ex: Bar / Bebidas"
                  className="w-full bg-[#111b21] border border-[#2a3942] rounded-xl px-3 py-2.5 text-xs text-[#d1d7db] focus:outline-none focus:border-indigo-500 placeholder-[#8696a0]"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCreateCategory}
                  className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-semibold py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95 text-xs"
                >
                  Adicionar Categoria
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: NOVO SETOR */}
      {showAddSectorModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-[#202c33] border border-[#2a3942] rounded-[36px] p-6 max-w-sm w-full shadow-2xl relative animate-in zoom-in-95 duration-300">
            <button onClick={() => setShowAddSectorModal(false)} className="absolute top-4 right-4 p-1 hover:bg-white/10 rounded-full text-[#8696a0]">
              <X size={18} />
            </button>
            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
                <Plus size={20} />
              </div>
              <div>
                <h3 className="font-bold text-white text-base">Novo Setor</h3>
                <p className="text-xs text-[#8696a0]">Cadastre um setor responsável e vincule a uma filial.</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#8696a0] mb-1.5">Nome do Setor</label>
                <input
                  type="text"
                  value={newSectorName}
                  onChange={e => setNewSectorName(e.target.value)}
                  placeholder="Ex: Cozinha, Salão, Bar"
                  className="w-full bg-[#111b21] border border-[#2a3942] rounded-xl px-3 py-2.5 text-xs text-[#d1d7db] focus:outline-none focus:border-indigo-500 placeholder-[#8696a0]"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-[#8696a0]">Filial / Unidade de Vínculo</label>
                  {units.length > 0 && (
                    <button
                      onClick={() => setShowInlineUnitCreation(!showInlineUnitCreation)}
                      className="text-[10px] text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-0.5 transition-all"
                    >
                      <Plus size={11} /> Nova Filial
                    </button>
                  )}
                </div>

                {units.length === 0 && !showInlineUnitCreation ? (
                  /* No units exist — show prominent creation UI */
                  <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-3 space-y-3">
                    <p className="text-[11px] text-amber-300 leading-relaxed">
                      <AlertTriangle size={12} className="inline mr-1 -mt-0.5" />
                      Nenhuma filial cadastrada. Crie sua primeira filial para vincular o setor.
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newUnitName}
                        onChange={e => setNewUnitName(e.target.value)}
                        placeholder="Nome da filial (ex: Matriz, Filial Centro)"
                        className="flex-1 bg-[#111b21] border border-[#2a3942] rounded-xl px-3 py-2 text-xs text-[#d1d7db] focus:outline-none focus:border-amber-500 placeholder-[#8696a0]"
                        onKeyDown={e => e.key === 'Enter' && handleCreateUnit()}
                      />
                      <button
                        onClick={handleCreateUnit}
                        disabled={creatingUnit || !newUnitName.trim()}
                        className="bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-black font-bold px-4 py-2 rounded-xl text-xs transition-all active:scale-95 whitespace-nowrap"
                      >
                        {creatingUnit ? '...' : 'Criar'}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Units exist — show select + optional inline creation */
                  <>
                    <select
                      value={newSectorUnitId}
                      onChange={e => setNewSectorUnitId(e.target.value)}
                      className="w-full bg-[#111b21] border border-[#2a3942] rounded-xl px-3 py-2.5 text-xs text-[#d1d7db] focus:outline-none focus:border-indigo-500"
                    >
                      <option value="" disabled>Selecione a filial</option>
                      {units.map(u => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>

                    {showInlineUnitCreation && (
                      <div className="mt-2 bg-indigo-500/10 border border-indigo-500/25 rounded-xl p-3 space-y-2 animate-in slide-in-from-top-2 duration-200">
                        <p className="text-[10px] text-indigo-300 font-semibold">Criar Nova Filial</p>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={newUnitName}
                            onChange={e => setNewUnitName(e.target.value)}
                            placeholder="Nome da filial"
                            className="flex-1 bg-[#111b21] border border-[#2a3942] rounded-xl px-3 py-2 text-xs text-[#d1d7db] focus:outline-none focus:border-indigo-500 placeholder-[#8696a0]"
                            onKeyDown={e => e.key === 'Enter' && handleCreateUnit()}
                          />
                          <button
                            onClick={handleCreateUnit}
                            disabled={creatingUnit || !newUnitName.trim()}
                            className="bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 text-white font-bold px-4 py-2 rounded-xl text-xs transition-all active:scale-95 whitespace-nowrap"
                          >
                            {creatingUnit ? '...' : 'Criar'}
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleCreateSector}
                  disabled={saving || !newSectorName.trim() || !newSectorUnitId}
                  className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95 text-xs"
                >
                  Cadastrar Setor
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Botão Flutuante de Toggle da Sidebar Principal */}
      <button
        onClick={() => setShowMainSidebar(!showMainSidebar)}
        className="fixed left-0 top-1/2 -translate-y-1/2 z-40 bg-[#202c33] border border-l-0 border-[#2a3942] rounded-r-2xl p-2.5 hover:bg-[#2a3942] hover:text-indigo-400 text-[#8696a0] shadow-xl transition-all cursor-pointer flex items-center justify-center group animate-in slide-in-from-left duration-300"
        title={showMainSidebar ? "Ocultar Menu Principal" : "Mostrar Menu Principal"}
      >
        {showMainSidebar ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
      </button>

      {/* SELETOR PREMIUM DE TEMPLATES OPERACIONAIS */}
      {!editingChecklist && showTemplateSelector && (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-300">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#2a3942]/60 pb-6">
            <div>
              <h2 className="text-xl font-bold text-[#e9edef] tracking-tight flex items-center gap-2">
                <Layers className="text-indigo-400 animate-pulse" />
                Modelos & Rotinas de Checklists
              </h2>
              <p className="text-sm text-[#8696a0] mt-1">
                Selecione um de nossos templates operacionais prontos de alto nível ou crie algo personalizado.
              </p>
            </div>
            <button
              onClick={() => setShowTemplateSelector(false)}
              className="bg-[#202c33] hover:bg-[#2a3942] text-[#d1d7db] text-xs font-semibold px-4 py-2.5 rounded-xl border border-[#2a3942] transition-all"
            >
              Voltar para Lista
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {TEMPLATES_LIST.map((tpl) => {
              // Mapeamento dinâmico de ícones temáticos lucide
              const renderIcon = () => {
                switch(tpl.icon) {
                  case 'plus': return <Plus size={24} className="text-slate-400" />;
                  case 'sparkles': return <Sparkles size={24} className="text-indigo-400 animate-pulse" />;
                  case 'clipboard-list': return <ClipboardList size={24} className="text-blue-400" />;
                  case 'utensils': return <Utensils size={24} className="text-amber-500" />;
                  case 'coffee': return <Coffee size={24} className="text-emerald-400" />;
                  case 'calculator': return <Calculator size={24} className="text-rose-400" />;
                  case 'beer': return <Beer size={24} className="text-sky-400" />;
                  case 'crown': return <Crown size={24} className="text-purple-400" />;
                  case 'layers': return <Layers size={24} className="text-teal-400" />;
                  default: return <ClipboardList size={24} />;
                }
              };

              return (
                <div 
                  key={tpl.id}
                  className={`bg-[#202c33]/80 rounded-[32px] border p-6 flex flex-col justify-between min-h-[260px] hover:shadow-xl hover:scale-[1.02] transition-all duration-300 ${
                    tpl.id === 'criar_ia' ? 'border-indigo-500/40 bg-gradient-to-br from-[#202c33]/80 to-indigo-950/20' : 'border-[#2a3942]/60'
                  }`}
                >
                  <div>
                    <div className="flex justify-between items-start">
                      <div className={`p-3 rounded-2xl ${
                        tpl.id === 'criar_ia' ? 'bg-indigo-500/10' :
                        tpl.id === 'novo_em_branco' ? 'bg-slate-500/10' : 'bg-black/20'
                      }`}>
                        {renderIcon()}
                      </div>
                      
                      <div className="flex flex-wrap gap-1 justify-end">
                        {tpl.tags.map((tag, tIdx) => (
                          <span key={tIdx} className={`text-[8px] font-bold px-2.5 py-0.5 rounded-full ${
                            tag === 'GEMINI_IA' ? 'bg-indigo-500/20 text-indigo-300' :
                            tag === 'CUSTOMIZADO' ? 'bg-slate-500/20 text-slate-300' :
                            tag === 'FECHAMENTO' ? 'bg-rose-500/10 text-rose-400' : 'bg-emerald-500/10 text-emerald-400'
                          }`}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>

                    <h3 className="font-extrabold text-white text-base mt-4 tracking-tight leading-snug">{tpl.title}</h3>
                    <p className="text-xs text-[#8696a0] mt-2 leading-relaxed line-clamp-3">{tpl.description}</p>
                  </div>

                  <button
                    onClick={() => handleSelectTemplate(tpl)}
                    className={`w-full mt-6 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 ${
                      tpl.id === 'criar_ia' ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/10' :
                      'bg-[#182229] hover:bg-[#111b21] text-indigo-400 hover:text-indigo-300 border border-indigo-500/10'
                    }`}
                  >
                    {tpl.id === 'criar_ia' ? 'Usar IA do Gemini' : 'Usar esse template'}
                    <ArrowRight size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* HEADER DE TELA */}
      {!editingChecklist && !showTemplateSelector && (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#2a3942]/60 pb-6 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#e9edef] tracking-tight flex items-center gap-2">
              <ClipboardList className="text-indigo-400" />
              Modelos & Rotinas de Checklists
            </h1>
            <p className="text-sm text-[#8696a0] mt-1">
              Desenhe roteiros operacionais, controle conformidades, marque tarefas críticas e agende execuções recorrentes.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setAiPrompt(''); setShowAiModal(true); }}
              className="bg-[#202c33] border border-[#2a3942]/60 hover:border-indigo-500/50 hover:bg-[#202c33]/90 text-indigo-400 text-xs font-semibold px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition-all"
            >
              <Sparkles size={14} /> Criar com I.A
            </button>
            <button
              onClick={() => setShowTemplateSelector(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition-all shadow-md active:scale-95"
            >
              <Plus size={14} /> Novo Checklist
            </button>
          </div>
        </div>
      )}

      {/* LISTAGEM DE MODELOS DE CHECKLIST */}
      {!editingChecklist && !showTemplateSelector && (
        <>
          {loading ? (
            <div className="p-12 text-center text-[#8696a0] bg-[#202c33]/50 rounded-3xl border border-[#2a3942]/40 animate-pulse">
              Carregando modelos operacionais...
            </div>
          ) : checklists.length === 0 ? (
            <div className="p-16 text-center text-[#8696a0] bg-[#202c33]/40 rounded-3xl border border-dashed border-[#2a3942]/60 flex flex-col items-center gap-4">
              <ClipboardList size={48} className="text-[#2a3942] animate-bounce" />
              <div>
                <h3 className="font-semibold text-white text-lg">Nenhum Checklist Ativo</h3>
                <p className="text-xs text-[#8696a0] mt-1">Sua empresa ainda não possui rotinas ou checklists cadastrados.</p>
              </div>
              <button 
                onClick={() => setShowTemplateSelector(true)}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded-xl animate-bounce"
              >
                Escolher um Modelo Operacional
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {checklists.map((chk) => {
                const sector = sectors.find(s => s.id === chk.sector_id);
                const unit = sector ? units.find(u => u.id === sector.unit_id) : null;

                return (
                  <div 
                    key={chk.id}
                    className="relative bg-gradient-to-b from-[#202c33]/90 to-[#182229]/95 backdrop-blur-md rounded-3xl border border-[#2a3942]/50 p-6 shadow-[0_8px_32px_rgba(0,0,0,0.24)] hover:border-indigo-500/40 hover:shadow-[0_12px_40px_rgba(99,102,241,0.12)] hover:scale-[1.01] transition-all duration-300 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-[9px] px-2.5 py-1 rounded-md font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 uppercase tracking-wider">
                          {chk.category || 'Operação'}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleChecklistStatus(chk);
                          }}
                          className={`flex items-center gap-1.5 text-[10px] px-3 py-1 rounded-full font-extrabold transition-all duration-200 active:scale-95 border cursor-pointer ${
                            chk.is_active 
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20' 
                              : 'bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/20'
                          }`}
                          title="Clique para alternar o status rápido"
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${chk.is_active ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
                          {chk.is_active ? 'Ativo' : 'Inativo'}
                        </button>
                      </div>
                      
                      <h3 className="font-extrabold text-[#f1f5f9] text-base mt-4 tracking-tight leading-snug hover:text-white transition-colors">{chk.title}</h3>
                      <p className="text-xs text-[#94a3b8] mt-2 leading-relaxed line-clamp-2">{chk.description || 'Sem descrição cadastrada.'}</p>

                      <div className="mt-5 pt-4 border-t border-[#2a3942]/40 grid grid-cols-2 gap-3 text-xs text-[#94a3b8]">
                        <div className="flex flex-col gap-1 p-2.5 rounded-xl bg-black/10 border border-[#2a3942]/30">
                          <span className="text-[9px] text-[#64748b] font-bold uppercase tracking-wider flex items-center gap-1">
                            <Layers size={11} className="text-slate-400" /> Setor
                          </span>
                          <span className="text-white font-semibold truncate" title={sector?.name || 'Geral'}>
                            {sector?.name || 'Geral'}
                          </span>
                        </div>
                        <div className="flex flex-col gap-1 p-2.5 rounded-xl bg-black/10 border border-[#2a3942]/30">
                          <span className="text-[9px] text-[#64748b] font-bold uppercase tracking-wider flex items-center gap-1">
                            <CalendarDays size={11} className="text-slate-400" /> Tarefas
                          </span>
                          <span className="text-white font-bold">{chk.items_count || 0} Itens</span>
                        </div>
                      </div>
                        
                        {/* Pilha Premium de Avatares dos Responsáveis (Interativa e Clicável) */}
                        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-[#2a3942]/20">
                          <Users size={12} className="text-indigo-400 shrink-0" />
                          <span className="text-[11px] text-[#8696a0] shrink-0">Responsáveis:</span>
                          <div className="flex items-center -space-x-1.5 overflow-hidden">
                            {(chk.responsible_ids || []).length === 0 ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveCardResponsiblePopoverId(chk.id);
                                  setCardResponsiblesSearchQuery('');
                                }}
                                className="text-[10px] text-amber-500/80 bg-amber-500/5 hover:bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/10 font-bold transition-all duration-200 active:scale-95 cursor-pointer"
                                title="Clique para gerenciar responsáveis inline"
                              >
                                Sem responsáveis
                              </button>
                            ) : (
                              <>
                                {(chk.responsible_ids || []).map((userId, idx) => {
                                  const user = users.find(u => u.id === userId);
                                  if (!user) return null;
                                  const initials = user.name
                                    ? user.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
                                    : 'OP';
                                  
                                  const bgColors = [
                                    'bg-indigo-600/30 text-indigo-300 border-indigo-500/30',
                                    'bg-purple-600/30 text-purple-300 border-purple-500/30',
                                    'bg-emerald-600/30 text-emerald-300 border-emerald-500/30',
                                    'bg-amber-600/30 text-amber-300 border-amber-500/30',
                                    'bg-sky-600/30 text-sky-300 border-sky-500/30'
                                  ];
                                  const colorClass = bgColors[idx % bgColors.length];

                                  return (
                                    <div
                                      key={userId}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveCardResponsiblePopoverId(chk.id);
                                        setCardResponsiblesSearchQuery('');
                                      }}
                                      className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[9px] font-bold border-2 border-[#202c33] shrink-0 ${colorClass} hover:-translate-y-0.5 hover:scale-105 transition-all duration-150 cursor-pointer`}
                                      title={`${user.name} (Clique para gerenciar)`}
                                    >
                                      {initials}
                                    </div>
                                  );
                                })}
                                {/* Botão de + empilhado no final da pilha */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveCardResponsiblePopoverId(chk.id);
                                    setCardResponsiblesSearchQuery('');
                                  }}
                                  className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold border-2 border-[#202c33] bg-[#2a3942] hover:bg-[#3b4a54] text-indigo-400 hover:text-indigo-300 transition-all shrink-0 active:scale-95 cursor-pointer"
                                  title="Gerenciar responsáveis rápidos"
                                >
                                  +
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Popover Inline Premium para Editar Responsáveis do Card */}
                        {activeCardResponsiblePopoverId === chk.id && (
                          <>
                            {/* Overlay local invisível para fechar ao clicar fora */}
                            <div 
                              className="fixed inset-0 z-[40]"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveCardResponsiblePopoverId(null);
                                setCardResponsiblesSearchQuery('');
                              }}
                            />
                            
                            <div 
                              className="absolute left-4 right-4 bottom-16 bg-[#202c33]/95 backdrop-blur-md rounded-2xl border border-[#2a3942] p-3 shadow-2xl z-[45] animate-in fade-in slide-in-from-bottom-3 duration-200"
                              onClick={(e) => e.stopPropagation()} // Impede propagar o clique para o card
                            >
                              <div className="flex items-center justify-between border-b border-[#2a3942]/50 pb-2 mb-2">
                                <span className="text-xs font-bold text-white flex items-center gap-1">
                                  <Users size={12} className="text-indigo-400" />
                                  Responsáveis Rápidos
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setActiveCardResponsiblePopoverId(null)}
                                  className="text-[#8696a0] hover:text-white p-0.5 hover:bg-white/5 rounded-md transition-all"
                                >
                                  <X size={12} />
                                </button>
                              </div>

                              <div className="flex items-center gap-1.5 bg-[#111b21] border border-[#2a3942] rounded-xl px-2.5 py-1.5 mb-2">
                                <Search size={12} className="text-[#8696a0]" />
                                <input
                                  type="text"
                                  value={cardResponsiblesSearchQuery}
                                  onChange={(e) => setCardResponsiblesSearchQuery(e.target.value)}
                                  placeholder="Filtrar colaboradores..."
                                  className="w-full bg-transparent border-none text-[11px] text-white focus:outline-none placeholder-[#8696a0]/50"
                                />
                              </div>

                              <div className="max-h-36 overflow-y-auto space-y-0.5 pr-1 scrollbar-thin">
                                {users
                                  .filter(u => u.name.toLowerCase().includes(cardResponsiblesSearchQuery.toLowerCase()))
                                  .length === 0 ? (
                                    <p className="text-center text-[10px] text-[#8696a0] py-3">Nenhum operador encontrado.</p>
                                  ) : (
                                    users
                                      .filter(u => u.name.toLowerCase().includes(cardResponsiblesSearchQuery.toLowerCase()))
                                      .map(user => {
                                        const isSelected = (chk.responsible_ids || []).includes(user.id);
                                        const initials = user.name
                                          ? user.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
                                          : 'OP';
                                        return (
                                          <button
                                            type="button"
                                            key={user.id}
                                            onClick={() => handleUpdateCardResponsibles(chk, user.id)}
                                            className={`w-full flex items-center justify-between p-1.5 rounded-lg text-left text-[11px] transition-all ${
                                              isSelected 
                                                ? 'bg-indigo-600/10 text-indigo-400 hover:bg-indigo-600/20' 
                                                : 'hover:bg-[#111b21] text-slate-300'
                                            }`}
                                          >
                                            <div className="flex items-center gap-1.5 min-w-0">
                                              <div className={`w-5 h-5 rounded-md flex items-center justify-center text-[9px] font-bold shrink-0 ${
                                                isSelected ? 'bg-indigo-500/20 text-indigo-300' : 'bg-[#111b21] text-[#8696a0]'
                                              }`}>
                                                {initials}
                                              </div>
                                              <div className="flex flex-col min-w-0">
                                                <span className="truncate pr-1 font-medium text-white">{user.name}</span>
                                                {user.cargo_id && (
                                                  <span className="text-[9px] text-indigo-400 truncate">
                                                    {getJobBadgeText(user.cargo_id)}
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                            <div className="shrink-0">
                                              {isSelected ? (
                                                <div className="w-3.5 h-3.5 rounded-full bg-indigo-500 flex items-center justify-center text-white text-[9px]">
                                                  <Check size={9} strokeWidth={3} />
                                                </div>
                                              ) : (
                                                <div className="w-3.5 h-3.5 rounded-full border border-[#2a3942] hover:border-indigo-500 transition-all" />
                                              )}
                                            </div>
                                          </button>
                                        );
                                      })
                                  )}
                              </div>
                            </div>
                          </>
                        )}
                      </div>

                    <div className="flex gap-2.5 mt-5 pt-4 border-t border-[#2a3942]/40">
                      <button
                        type="button"
                        onClick={() => handleEditChecklist(chk)}
                        className="flex-1 bg-gradient-to-r from-indigo-600/80 to-indigo-700/80 hover:from-indigo-600 hover:to-indigo-700 active:from-indigo-700 active:to-indigo-800 text-white text-xs font-bold py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md shadow-indigo-600/10 active:scale-[0.98] cursor-pointer"
                      >
                        <Edit2 size={12} /> Gerenciar Roteiro
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteChecklist(chk.id)}
                        className="p-2.5 bg-rose-500/10 hover:bg-rose-500/20 active:bg-rose-500/30 text-rose-400 hover:text-rose-300 rounded-xl border border-rose-500/20 hover:border-rose-500/40 transition-all active:scale-95 cursor-pointer"
                        title="Deletar Checklist"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* TELA DE CONSTRUÇÃO / EDIÇÃO DO CHECKLIST */}
      {editingChecklist && (
        <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-300 pb-24 lg:pb-6">
          
          {/* Header de Edição */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#2a3942]/60 pb-4">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <ClipboardList className="text-indigo-400" />
                {editingChecklist.id ? 'Editar Roteiro Operacional' : 'Criar Novo Roteiro'}
              </h2>
              <p className="text-xs text-[#8696a0] mt-0.5">Configure as regras, tarefas e agendamentos com facilidade.</p>
            </div>
            
            {/* Botões do Topo (Escondidos no mobile pois há a barra ergonômica fixa no rodapé) */}
            <div className="hidden lg:flex gap-2">
              <button
                onClick={handleSaveAll}
                disabled={saving}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-md active:scale-95 disabled:opacity-50"
              >
                {saving ? 'Gravando Alterações...' : 'Salvar Checklist Completo'}
              </button>
              <button
                onClick={() => setEditingChecklist(null)}
                className="bg-[#202c33] hover:bg-[#2a3942] text-[#d1d7db] text-xs font-bold px-4 py-2.5 rounded-xl border border-[#2a3942] transition-all"
              >
                Cancelar
              </button>
            </div>
          </div>

          {/* Abas de Navegação Premium (Tabs Glassmorphic) */}
          <div className="flex bg-[#202c33]/60 p-1 rounded-2xl border border-[#2a3942]/60 w-fit gap-1 animate-in fade-in duration-200">
            <button
              onClick={() => setActiveTab('info')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'info' ? 'bg-indigo-600 text-white shadow-md' : 'text-[#8696a0] hover:text-[#d1d7db]'
              }`}
            >
              <Info size={14} />
              Geral
            </button>
            <button
              onClick={() => setActiveTab('items')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'items' ? 'bg-indigo-600 text-white shadow-md' : 'text-[#8696a0] hover:text-[#d1d7db]'
              }`}
            >
              <ClipboardList size={14} />
              Tarefas ({checklistItems.length})
            </button>
            <button
              onClick={() => setActiveTab('schedules')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'schedules' ? 'bg-indigo-600 text-white shadow-md' : 'text-[#8696a0] hover:text-[#d1d7db]'
              }`}
            >
              <CalendarDays size={14} />
              Agendamentos ({schedules.length})
            </button>
          </div>

          {/* ÁREA DE CONTEÚDO COM BASE NA ABA ATIVA */}
          <div className="w-full">
            
            {/* ABA 1: INFORMAÇÕES BÁSICAS */}
            {activeTab === 'info' && (
              <div className="max-w-2xl mx-auto bg-[#202c33]/85 rounded-[32px] border border-[#2a3942]/60 p-6 space-y-5 animate-in fade-in duration-200">
                <div className="border-b border-[#2a3942]/40 pb-3 flex items-center gap-2">
                  <Info size={18} className="text-indigo-400" />
                  <h3 className="font-extrabold text-white text-base">Identificação e Configurações Gerais</h3>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#8696a0] mb-1.5">Título do Checklist *</label>
                    <input
                      type="text"
                      value={editingChecklist.title || ''}
                      onChange={e => setEditingChecklist(p => ({ ...p, title: e.target.value }))}
                      placeholder="Ex: Abertura Diária da Cozinha"
                      className="w-full bg-[#111b21] border border-[#2a3942] rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-indigo-500 placeholder-[#8696a0]/50"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#8696a0] mb-1.5">Descrição / Instruções</label>
                    <textarea
                      rows={4}
                      value={editingChecklist.description || ''}
                      onChange={e => setEditingChecklist(p => ({ ...p, description: e.target.value }))}
                      placeholder="Oriente a equipe operacional sobre como executar este roteiro corretamente."
                      className="w-full bg-[#111b21] border border-[#2a3942] rounded-xl px-4 py-3 text-xs text-slate-300 focus:outline-none focus:border-indigo-500 placeholder-[#8696a0]/50"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="flex justify-between items-center mb-1.5">
                        <label className="block text-xs font-semibold text-[#8696a0]">Categoria</label>
                        <button
                          type="button"
                          onClick={() => {
                            setNewCategoryName('');
                            setShowAddCategoryModal(true);
                          }}
                          className="text-indigo-400 hover:text-indigo-300 p-0.5 rounded hover:bg-white/5 transition-all"
                          title="Nova Categoria"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                      <select
                        value={editingChecklist.category || 'Higiene'}
                        onChange={e => setEditingChecklist(p => ({ ...p, category: e.target.value }))}
                        className="w-full bg-[#111b21] border border-[#2a3942] rounded-xl px-3 py-3 text-xs text-white focus:outline-none focus:border-indigo-500"
                      >
                        {categories.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1.5">
                        <label className="block text-xs font-semibold text-[#8696a0]">Setor Responsável *</label>
                        <button
                          type="button"
                          onClick={() => {
                            setNewSectorName('');
                            setNewSectorUnitId(units[0]?.id || '');
                            setShowAddSectorModal(true);
                          }}
                          className="text-indigo-400 hover:text-indigo-300 p-0.5 rounded hover:bg-white/5 transition-all"
                          title="Novo Setor"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                      <select
                        value={editingChecklist.sector_id || ''}
                        onChange={e => setEditingChecklist(p => ({ ...p, sector_id: e.target.value }))}
                        className="w-full bg-[#111b21] border border-[#2a3942] rounded-xl px-3 py-3 text-xs text-white focus:outline-none focus:border-indigo-500"
                      >
                        <option value="" disabled>Selecione o setor</option>
                        {sectors.map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Seletor Premium de Operadores Responsáveis */}
                  <div className="pt-4 border-t border-[#2a3942]/40 relative">
                    <label className="block text-xs font-semibold text-[#8696a0] mb-2 flex items-center gap-1.5">
                      <Users size={14} className="text-indigo-400" />
                      Operadores Responsáveis
                    </label>

                    {/* Área de Visualização e Chips selecionados */}
                    <div className="flex flex-wrap gap-2 p-3 bg-[#111b21] border border-[#2a3942] rounded-xl min-h-[46px] items-center">
                      {(editingChecklist.responsible_ids || []).length === 0 ? (
                        <span className="text-xs text-[#8696a0]/50 pl-1 select-none">
                          Nenhum responsável associado. Clique para gerenciar.
                        </span>
                      ) : (
                        (editingChecklist.responsible_ids || []).map(userId => {
                          const user = users.find(u => u.id === userId);
                          if (!user) return null;
                          const initials = user.name
                            ? user.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
                            : 'OP';
                          return (
                            <div 
                              key={userId} 
                              className="flex items-center gap-1.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 pl-1.5 pr-1 py-1 rounded-xl text-xs font-semibold animate-in fade-in zoom-in-95 duration-150"
                            >
                              <div className="w-5 h-5 rounded-lg bg-indigo-500/20 flex items-center justify-center text-[10px] text-indigo-300 font-bold shrink-0">
                                {initials}
                              </div>
                              <span className="truncate max-w-[120px]">{user.name}</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingChecklist(prev => ({
                                    ...prev,
                                    responsible_ids: (prev.responsible_ids || []).filter(id => id !== userId)
                                  }));
                                }}
                                className="p-0.5 hover:bg-indigo-500/20 rounded-md text-indigo-400 hover:text-indigo-300 transition-all shrink-0"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          );
                        })
                      )}

                      {/* Botão de Adição no Canto Direito */}
                      <button
                        type="button"
                        onClick={() => setShowResponsiblesDropdown(!showResponsiblesDropdown)}
                        className="ml-auto text-xs text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-500/5 hover:bg-indigo-500/10 border border-indigo-500/10 hover:border-indigo-500/20 transition-all shrink-0"
                      >
                        <Plus size={12} />
                        Gerenciar
                      </button>
                    </div>

                    {/* Dropdown Flutuante Premium de Seleção (Estilo Glassmorphism) */}
                    {showResponsiblesDropdown && (
                      <>
                        {/* Overlay para fechar ao clicar fora */}
                        <div 
                          className="fixed inset-0 z-[99]"
                          onClick={() => {
                            setShowResponsiblesDropdown(false);
                            setResponsiblesSearchQuery('');
                          }}
                        />
                        <div className="absolute right-0 bottom-full mb-2 w-72 bg-[#202c33]/95 backdrop-blur-md rounded-2xl border border-[#2a3942] p-3 shadow-2xl z-[100] animate-in fade-in slide-in-from-bottom-2 duration-200">
                          <div className="flex items-center gap-1.5 bg-[#111b21] border border-[#2a3942] rounded-xl px-2.5 py-2 mb-2">
                            <Search size={13} className="text-[#8696a0]" />
                            <input
                              type="text"
                              value={responsiblesSearchQuery}
                              onChange={(e) => setResponsiblesSearchQuery(e.target.value)}
                              placeholder="Pesquisar operadores..."
                              className="w-full bg-transparent border-none text-xs text-white focus:outline-none placeholder-[#8696a0]/50"
                            />
                          </div>

                          <div className="max-h-48 overflow-y-auto space-y-0.5 pr-1 scrollbar-thin">
                            {users
                              .filter(u => u.name.toLowerCase().includes(responsiblesSearchQuery.toLowerCase()))
                              .length === 0 ? (
                                <p className="text-center text-[10px] text-[#8696a0] py-4">Nenhum operador encontrado.</p>
                              ) : (
                                users
                                  .filter(u => u.name.toLowerCase().includes(responsiblesSearchQuery.toLowerCase()))
                                  .map(user => {
                                    const isSelected = (editingChecklist.responsible_ids || []).includes(user.id);
                                    const initials = user.name
                                      ? user.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
                                      : 'OP';
                                    return (
                                      <button
                                        type="button"
                                        key={user.id}
                                        onClick={() => {
                                          setEditingChecklist(prev => {
                                            const ids = prev.responsible_ids || [];
                                            const newIds = ids.includes(user.id)
                                              ? ids.filter(id => id !== user.id)
                                              : [...ids, user.id];
                                            return { ...prev, responsible_ids: newIds };
                                          });
                                        }}
                                        className={`w-full flex items-center justify-between p-2 rounded-xl text-left text-xs transition-all ${
                                          isSelected 
                                            ? 'bg-indigo-600/10 text-indigo-400 hover:bg-indigo-600/20' 
                                            : 'hover:bg-[#111b21] text-slate-300'
                                        }`}
                                      >
                                        <div className="flex items-center gap-2 min-w-0">
                                          <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0 ${
                                            isSelected ? 'bg-indigo-500/20 text-indigo-300' : 'bg-[#111b21] text-[#8696a0]'
                                          }`}>
                                            {initials}
                                          </div>
                                          <div className="flex flex-col min-w-0">
                                            <span className="truncate pr-2 font-medium text-white">{user.name}</span>
                                            {user.cargo_id && (
                                              <span className="text-[10px] text-indigo-400 truncate">
                                                {getJobBadgeText(user.cargo_id)}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                        <div className="shrink-0">
                                          {isSelected ? (
                                            <div className="w-4 h-4 rounded-full bg-indigo-500 flex items-center justify-center text-white text-[10px]">
                                              <Check size={10} strokeWidth={3} />
                                            </div>
                                          ) : (
                                            <div className="w-4 h-4 rounded-full border border-[#2a3942] hover:border-indigo-500 transition-all" />
                                          )}
                                        </div>
                                      </button>
                                    );
                                  })
                              )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-[#2a3942]/40">
                    <div>
                      <span className="text-xs font-semibold text-white block">Status Ativo</span>
                      <span className="text-[10px] text-[#8696a0]">Checklists inativos não são disparados para a equipe.</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="sr-only peer"
                        checked={editingChecklist.is_active ?? true}
                        onChange={e => setEditingChecklist(p => ({ ...p, is_active: e.target.checked }))}
                      />
                      <div className="w-9 h-5 bg-[#3b4a54] rounded-full peer peer-checked:after:translate-x-[16px] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#8696a0] peer-checked:after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#00a884]"></div>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* ABA 2: TAREFAS DO ROTEIRO */}
            {activeTab === 'items' && (
              <div className="max-w-4xl mx-auto bg-[#202c33]/85 rounded-[32px] border border-[#2a3942]/60 p-6 space-y-6 animate-in fade-in duration-200">
                <div className="flex justify-between items-center border-b border-[#2a3942]/40 pb-3">
                  <div className="flex items-center gap-2">
                    <ClipboardList size={18} className="text-indigo-400" />
                    <h3 className="font-extrabold text-white text-base">Tarefas Cadastradas ({checklistItems.length})</h3>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setExcelImportItems([]);
                        setExcelFileName('');
                        setExcelParsingError('');
                        setExcelEditingIdx(null);
                        setShowExcelImportModal(true);
                      }}
                      className="bg-teal-600/15 hover:bg-teal-600/30 text-teal-400 border border-teal-500/20 text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition-all active:scale-95"
                    >
                      <FileSpreadsheet size={14} /> Importar Excel
                    </button>
                    <button
                      onClick={handleOpenAddTask}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition-all active:scale-95 shadow-md shadow-indigo-600/10"
                    >
                      <Plus size={14} /> Adicionar Tarefa
                    </button>
                  </div>
                </div>

                {checklistItems.length === 0 ? (
                  <div className="p-16 text-center text-[#8696a0] border border-dashed border-[#2a3942]/60 rounded-3xl bg-[#111b21]/30 flex flex-col items-center gap-3">
                    <ClipboardList size={40} className="text-[#2a3942]" />
                    <div>
                      <h4 className="font-semibold text-white text-sm">Roteiro Sem Tarefas</h4>
                      <p className="text-[11px] text-[#8696a0] mt-0.5">Clique no botão acima ou use o Assistente de I.A do topo para iniciar.</p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {checklistItems.map((item, idx) => {
                      if (quickEditingIndex === idx) {
                        return (
                          <div 
                            key={idx}
                            className="p-4 rounded-2xl border border-indigo-500/40 bg-[#1f1b2e]/60 shadow-lg shadow-indigo-500/5 flex flex-col gap-3.5 transition-all"
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[10px] font-bold font-mono text-[#8696a0] bg-black/20 w-5 h-5 flex items-center justify-center rounded-full shrink-0">
                                {idx + 1}
                              </span>
                              <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider">Edição Rápida Inline</span>
                            </div>

                            {/* Grid de Inputs Rápidos */}
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                              {/* 1. Grupo (Categoria) */}
                              <div className="col-span-1">
                                <label className="block text-[9px] font-bold text-[#8696a0] mb-1 uppercase tracking-wider">Grupo (Categoria)</label>
                                <input
                                  type="text"
                                  list="quick-categories"
                                  value={quickCategory}
                                  onChange={e => setQuickCategory(e.target.value.toUpperCase())}
                                  className="w-full bg-[#111b21] border border-[#2a3942] rounded-xl px-2.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                                  placeholder="Sem Grupo"
                                />
                                <datalist id="quick-categories">
                                  {Array.from(new Set(checklistItems.map(item => {
                                    const m = item.title.match(/^\[(.*?)\]\s*(.*)$/);
                                    return m ? m[1] : null;
                                  }).filter(Boolean))).map(cat => (
                                    <option key={cat} value={cat} />
                                  ))}
                                </datalist>
                              </div>

                              {/* 2. Tipo */}
                              <div className="col-span-1">
                                <label className="block text-[9px] font-bold text-[#8696a0] mb-1 uppercase tracking-wider">Tipo</label>
                                <select
                                  value={quickType}
                                  onChange={e => setQuickType(e.target.value)}
                                  className="w-full bg-[#111b21] border border-[#2a3942] rounded-xl px-2.5 py-2 text-xs text-[#d1d7db] focus:outline-none focus:border-indigo-500 cursor-pointer"
                                >
                                  <option value="boolean">Feito/Não Feito</option>
                                  <option value="conformity">Conformidade</option>
                                  <option value="yes_no">Sim/Não</option>
                                  <option value="numeric">Numérico Geral</option>
                                  <option value="kg">Quilograma (kg)</option>
                                  <option value="temperature">Temperatura °C</option>
                                  <option value="counter">Contagem física</option>
                                  <option value="text">Texto livre</option>
                                  <option value="photo">Foto obrigatória</option>
                                  <option value="stars">Estrelas (1-5)</option>
                                </select>
                              </div>

                              {/* 3. Fornecedor */}
                              <div className="col-span-1">
                                <label className="block text-[9px] font-bold text-[#8696a0] mb-1 uppercase tracking-wider">Fornecedor</label>
                                <input
                                  type="text"
                                  value={quickProvider}
                                  onChange={e => setQuickProvider(e.target.value)}
                                  className="w-full bg-[#111b21] border border-[#2a3942] rounded-xl px-2.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                                  placeholder="Fornecedor"
                                />
                              </div>

                              {/* 4. Min */}
                              <div className="col-span-1">
                                <label className="block text-[9px] font-bold text-[#8696a0] mb-1 uppercase tracking-wider">Mín Meta</label>
                                <input
                                  type="number"
                                  step="any"
                                  value={quickMin ?? ''}
                                  onChange={e => setQuickMin(e.target.value !== '' ? parseFloat(e.target.value) : null)}
                                  disabled={quickType !== 'numeric' && quickType !== 'temperature' && quickType !== 'kg'}
                                  className="w-full bg-[#111b21] disabled:opacity-40 border border-[#2a3942] rounded-xl px-2.5 py-2 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
                                  placeholder="-"
                                />
                              </div>

                              {/* 5. Max */}
                              <div className="col-span-1">
                                <label className="block text-[9px] font-bold text-[#8696a0] mb-1 uppercase tracking-wider">Máx Meta</label>
                                <input
                                  type="number"
                                  step="any"
                                  value={quickMax ?? ''}
                                  onChange={e => setQuickMax(e.target.value !== '' ? parseFloat(e.target.value) : null)}
                                  disabled={quickType !== 'numeric' && quickType !== 'temperature' && quickType !== 'kg'}
                                  className="w-full bg-[#111b21] disabled:opacity-40 border border-[#2a3942] rounded-xl px-2.5 py-2 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
                                  placeholder="-"
                                />
                              </div>
                            </div>

                            {/* Ações da Edição Rápida */}
                            <div className="flex justify-end gap-2 pt-1">
                              <button
                                type="button"
                                onClick={handleCancelQuickEdit}
                                className="bg-[#182229] hover:bg-[#111b21] text-[#d1d7db] text-[10px] font-bold px-3 py-1.5 rounded-lg border border-[#2a3942] transition-colors"
                              >
                                Cancelar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSaveQuickEdit(idx)}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold px-4 py-1.5 rounded-lg transition-colors shadow-sm"
                              >
                                Salvar
                              </button>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div 
                          key={idx}
                          className={`p-4 rounded-2xl border bg-[#111b21]/50 flex flex-col gap-3 hover:border-indigo-500/20 transition-all ${item.is_critical ? 'border-amber-500/40 shadow-sm shadow-amber-500/5' : 'border-[#2a3942]/60'}`}
                        >
                          {/* Linha 1: Conteúdo Principal e Ações */}
                          <div className="flex justify-between items-center gap-4">
                            <div className="min-w-0 flex-1">
                              {(() => {
                                const match = item.title.match(/^\[(.*?)\]\s*(.*)$/);
                                const groupName = match ? match[1] : null;
                                const cleanTitle = match ? match[2] : item.title;
                                const cleanDescription = item.description ? item.description.replace(/Fornecedor:\s*/g, '').replace(/Custo:\s*/g, '').split(' | ').join(' • ') : null;

                                return (
                                  <>
                                    <div className="flex items-center gap-2 flex-wrap mb-1">
                                      <span className="text-[10px] font-bold font-mono text-[#8696a0] bg-black/20 w-5 h-5 flex items-center justify-center rounded-full shrink-0">
                                        {idx + 1}
                                      </span>
                                      {groupName && (
                                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#2a3942] text-[#8696a0] font-bold tracking-wider uppercase shrink-0">
                                          {groupName}
                                        </span>
                                      )}
                                      <h4 className="font-semibold text-white text-sm truncate">{cleanTitle}</h4>
                                      <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-slate-500/15 text-[#8696a0] font-bold shrink-0 uppercase tracking-wider">
                                        {item.response_type === 'boolean' ? 'Feito/Não Feito' : 
                                         item.response_type === 'conformity' ? 'Conformidade' : 
                                         item.response_type === 'yes_no' ? 'Sim/Não' : item.response_type}
                                      </span>
                                      {item.is_critical && (
                                        <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-bold shrink-0">
                                          Crítico
                                        </span>
                                      )}
                                      {item.options && item.options.length > 0 && (
                                        <button
                                          type="button"
                                          onClick={() => toggleExpandTask(idx)}
                                          className="text-[8px] px-1.5 py-0.5 rounded-full bg-indigo-500/25 hover:bg-indigo-500/35 text-indigo-400 font-bold shrink-0 flex items-center gap-1.5 transition-all"
                                          title={expandedTaskIndexes.includes(idx) ? 'Ocultar Passos' : 'Visualizar Passos'}
                                        >
                                          <span>📋 {item.options.length} sub-tarefas</span>
                                        </button>
                                      )}
                                    </div>
                                    
                                    {cleanDescription && (
                                      <p className="text-[10px] text-[#8696a0] mt-0.5 pl-7 line-clamp-1">{cleanDescription}</p>
                                    )}
                                    
                                    {/* Metas */}
                                    {(item.response_type === 'numeric' || item.response_type === 'temperature' || item.response_type === 'kg') && (item.min_meta !== null || item.max_meta !== null) && (
                                      <p className="text-[10px] text-teal-400 mt-1 pl-7 font-mono font-bold">
                                        {item.min_meta !== null ? `Mín: ${item.min_meta}` : ''} {item.max_meta !== null ? `Meta Máx: ${item.max_meta}` : ''} {item.measurement_unit}
                                      </p>
                                    )}
                                  </>
                                );
                              })()}
                            </div>

                            {/* Ações de Reordenação e Edição */}
                            <div className="flex items-center gap-1.5 shrink-0">
                              {/* Setas de Reordenação */}
                              <div className="flex flex-col gap-0.5 mr-1 bg-black/15 p-1 rounded-xl border border-[#2a3942]/30">
                                <button
                                  type="button"
                                  onClick={() => handleMoveItemUp(idx)}
                                  disabled={idx === 0}
                                  className="p-1 hover:bg-white/5 disabled:opacity-20 text-[#8696a0] hover:text-white rounded-lg transition-all"
                                  title="Mover para Cima"
                                >
                                  <ChevronUp size={13} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleMoveItemDown(idx)}
                                  disabled={idx === checklistItems.length - 1}
                                  className="p-1 hover:bg-white/5 disabled:opacity-20 text-[#8696a0] hover:text-white rounded-lg transition-all"
                                  title="Mover para Baixo"
                                >
                                  <ChevronDown size={13} />
                                </button>
                              </div>

                              {/* Edição Rápida */}
                              <button
                                type="button"
                                onClick={() => handleStartQuickEdit(idx)}
                                className="p-2 hover:bg-amber-500/15 text-[#8696a0] hover:text-amber-400 rounded-xl transition-all border border-transparent hover:border-amber-500/20"
                                title="Edição Rápida Inline"
                              >
                                <Zap size={13} />
                              </button>

                              {/* Editar */}
                              <button
                                type="button"
                                onClick={() => handleOpenEditTask(idx)}
                                className="p-2 hover:bg-indigo-500/15 text-[#8696a0] hover:text-indigo-400 rounded-xl transition-all border border-transparent hover:border-indigo-500/20"
                                title="Editar Tarefa Completa"
                              >
                                <Edit2 size={13} />
                              </button>

                              {/* Excluir */}
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(idx)}
                                className="p-2 hover:bg-rose-500/15 text-[#8696a0] hover:text-rose-400 rounded-xl transition-all border border-transparent hover:border-rose-500/20"
                                title="Remover Item"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>

                          {/* Linha 2: Visualização de Sub-tarefas Expansíveis */}
                          {item.options && item.options.length > 0 && expandedTaskIndexes.includes(idx) && (
                            <div className="mt-1 pl-7 border-t border-[#2a3942]/30 pt-3 space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
                              <span className="text-[9px] font-black text-indigo-400/80 block uppercase tracking-widest">Lista de Verificação (Sub-tarefas)</span>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                {item.options.map((sub, sIdx) => (
                                  <div key={sIdx} className="flex items-center gap-2 p-2 bg-black/15 border border-[#2a3942]/30 rounded-xl select-none">
                                    <input
                                      type="checkbox"
                                      disabled
                                      className="rounded border-[#2a3942] text-indigo-600 bg-transparent opacity-65 cursor-not-allowed w-3.5 h-3.5"
                                    />
                                    <span className="text-xs text-slate-300 truncate">{sub}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ABA 3: CRONOGRAMA / AGENDAMENTOS */}
            {activeTab === 'schedules' && (
              <div className="max-w-2xl mx-auto bg-[#202c33]/85 rounded-[32px] border border-[#2a3942]/60 p-6 space-y-6 animate-in fade-in duration-200">
                <div className="flex justify-between items-center border-b border-[#2a3942]/40 pb-3">
                  <div className="flex items-center gap-2">
                    <CalendarDays size={18} className="text-indigo-400" />
                    <h3 className="font-extrabold text-white text-base">Cronogramas / Agendamentos</h3>
                  </div>
                  <button
                    onClick={handleAddSchedule}
                    className="text-indigo-400 hover:text-indigo-300 text-xs font-bold flex items-center gap-1 bg-indigo-500/5 hover:bg-indigo-500/10 px-3 py-1.5 rounded-xl border border-indigo-500/20 transition-all"
                  >
                    <Plus size={14} /> Adicionar Agendamento
                  </button>
                </div>

                {/* Previsão Tolerância Global */}
                <div className="bg-[#111b21] p-5 rounded-3xl border border-[#2a3942]/60 mb-6 space-y-4">
                  <div className="flex justify-between items-center border-b border-[#2a3942]/30 pb-3 flex-wrap gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">Tolerância de Execução (Previsão)</h4>
                      <p className="text-[10px] text-[#8696a0] mt-0.5">Defina a janela de horário ou minutos permitidos para a execução da rotina.</p>
                    </div>
                    {/* Toggle de Modo */}
                    <div className="flex bg-black/20 p-1 rounded-xl border border-[#2a3942]/40 select-none">
                      <button
                        type="button"
                        onClick={() => setToleranceMode('window')}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                          toleranceMode === 'window'
                            ? 'bg-indigo-600 text-white shadow-md'
                            : 'text-[#8696a0] hover:text-[#d1d7db]'
                        }`}
                      >
                        Janela Operacional
                      </button>
                      <button
                        type="button"
                        onClick={() => setToleranceMode('minutes')}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                          toleranceMode === 'minutes'
                            ? 'bg-indigo-600 text-white shadow-md'
                            : 'text-[#8696a0] hover:text-[#d1d7db]'
                        }`}
                      >
                        Modo Minutos
                      </button>
                    </div>
                  </div>

                  {toleranceMode === 'window' ? (
                    <div className="space-y-4 animate-in fade-in duration-200">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-[10px] font-semibold text-[#8696a0] mb-1.5">1. Horário Previsto (Início Desejado)</label>
                          <input
                            type="time"
                            value={refPrevTime}
                            onChange={e => {
                              const val = e.target.value;
                              setRefPrevTime(val);
                              updateMinutesFromWindow(val, refEndTime, refAlarmMinutes);
                            }}
                            className="w-full bg-[#182229] border border-[#2a3942] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-[#8696a0] mb-1.5">2. Hora Fim (Conclusão Esperada)</label>
                          <input
                            type="time"
                            value={refEndTime}
                            onChange={e => {
                              const val = e.target.value;
                              setRefEndTime(val);
                              updateMinutesFromWindow(refPrevTime, val, refAlarmMinutes);
                            }}
                            className="w-full bg-[#182229] border border-[#2a3942] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-[#8696a0] mb-1.5">3. Alarme / Aviso (Minutos Antes)</label>
                          <input
                            type="number"
                            min="0"
                            value={refAlarmMinutes}
                            onChange={e => {
                              const val = parseInt(e.target.value) || 0;
                              setRefAlarmMinutes(val);
                              updateMinutesFromWindow(refPrevTime, refEndTime, val);
                            }}
                            className="w-full bg-[#182229] border border-[#2a3942] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                            placeholder="Ex: 5"
                          />
                        </div>
                      </div>

                      {/* Display Informativo do Tempo Total de Produção */}
                      {(() => {
                        const parseTimeToMin = (t: string) => {
                          const [h, m] = t.split(':').map(Number);
                          return (isNaN(h) ? 0 : h) * 60 + (isNaN(m) ? 0 : m);
                        };
                        const mRef = parseTimeToMin(refPrevTime);
                        const mEnd = parseTimeToMin(refEndTime);
                        
                        let durationMin = mEnd - mRef;
                        if (durationMin < 0) durationMin += 1440; // Virada de dia

                        let mAlarm = mRef - refAlarmMinutes;
                        if (mAlarm < 0) mAlarm += 1440; // Trata minutos de alarme negativos

                        const minToTimeString = (m: number) => {
                          const h = Math.floor(m / 60);
                          const min = m % 60;
                          return `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
                        };

                        const formatDuration = (totalMin: number) => {
                          const hrs = Math.floor(totalMin / 60);
                          const mins = totalMin % 60;
                          return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')} min`;
                        };

                        return (
                          <div className="bg-indigo-500/5 border border-indigo-500/20 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
                            <div className="text-[11px] text-[#8696a0] leading-relaxed">
                              💡 O sistema alarmará às <span className="text-white font-bold">{minToTimeString(mAlarm)}</span> ({refAlarmMinutes} min antes do início). A produção está prevista para ocorrer entre as <span className="text-white font-bold">{refPrevTime}</span> e <span className="text-white font-bold">{refEndTime}</span>.
                            </div>
                            <div className="shrink-0 bg-indigo-500/10 border border-indigo-500/20 px-3.5 py-2 rounded-xl text-center">
                              <span className="text-[9px] text-[#8696a0] block uppercase font-bold tracking-wider">Tempo de Produção</span>
                              <span className="text-sm font-black text-indigo-400 tracking-tight font-mono">{formatDuration(durationMin)}</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in duration-200">
                      <div>
                        <label className="block text-[10px] font-semibold text-[#8696a0] mb-1.5">Hora Início (Minutos antes permitidos)</label>
                        <input
                          type="number"
                          min="0"
                          value={editingChecklist.min_time_lead_minutes || 0}
                          onChange={e => setEditingChecklist(p => ({ ...p, min_time_lead_minutes: parseInt(e.target.value) || 0 }))}
                          className="w-full bg-[#182229] border border-[#2a3942] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                          placeholder="Ex: 60"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-[#8696a0] mb-1.5">Hora Fim / Previsão (Minutos após para concluir)</label>
                        <input
                          type="number"
                          min="0"
                          value={editingChecklist.max_time_lag_minutes || 0}
                          onChange={e => setEditingChecklist(p => ({ ...p, max_time_lag_minutes: parseInt(e.target.value) || 0 }))}
                          className="w-full bg-[#182229] border border-[#2a3942] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                          placeholder="Ex: 120"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {schedules.length === 0 ? (
                  <div className="p-8 text-center text-[#8696a0] border border-dashed border-[#2a3942]/60 rounded-[32px] bg-[#111b21]/30 flex flex-col items-center gap-4 animate-in fade-in duration-200">
                    <div className="w-12 h-12 rounded-2xl bg-[#202c33] border border-[#2a3942]/50 flex items-center justify-center text-[#8696a0]">
                      <CalendarDays size={22} />
                    </div>
                    <div>
                      <p className="text-xs text-white font-bold">Sem Agendamento Automático</p>
                      <p className="text-[11px] text-[#8696a0] mt-1 max-w-[280px] mx-auto leading-relaxed">
                        Este checklist é gerado sob demanda. Se desejar que ele se repita automaticamente, crie um agendamento rápido abaixo:
                      </p>
                    </div>
                    
                    {/* Botões de Atalho Rápido para Agendamento */}
                    <div className="flex flex-wrap gap-2.5 justify-center mt-1">
                      <button
                        type="button"
                        onClick={() => handleAddSchedule('daily')}
                        className="bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/20 px-3.5 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer select-none"
                      >
                        <CalendarDays size={13} /> Diário
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAddSchedule('weekly')}
                        className="bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/20 px-3.5 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer select-none"
                      >
                        <CalendarDays size={13} /> Semanal
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAddSchedule('monthly')}
                        className="bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/20 px-3.5 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer select-none"
                      >
                        <CalendarDays size={13} /> Mensal
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {schedules.map((sch, idx) => (
                      <div key={idx} className="bg-[#111b21] p-4 rounded-3xl border border-[#2a3942]/60 space-y-3 relative animate-in fade-in duration-200">
                        <button
                          onClick={() => handleRemoveSchedule(idx)}
                          className="absolute top-4 right-4 p-1 hover:bg-rose-500/10 rounded-full text-[#8696a0] hover:text-rose-400 transition-all"
                        >
                          <X size={16} />
                        </button>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                          <div>
                            <label className="block text-[10px] font-semibold text-[#8696a0] mb-1">Filial</label>
                            <select
                              value={sch.unit_id}
                              onChange={e => {
                                  const newSchs = [...schedules];
                                  newSchs[idx].unit_id = e.target.value;
                                  setSchedules(newSchs);
                              }}
                              className="w-full bg-[#182229] border border-[#2a3942] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                            >
                              <option value="ALL">⭐ Todas as Unidades (Global)</option>
                              {units.map(u => (
                                <option key={u.id} value={u.id}>{u.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-[#8696a0] mb-1">Horário Previsto</label>
                            <input
                              type="time"
                              value={sch.start_time}
                              onChange={e => {
                                  const newSchs = [...schedules];
                                  newSchs[idx].start_time = e.target.value;
                                  setSchedules(newSchs);
                              }}
                              className="w-full bg-[#182229] border border-[#2a3942] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 font-mono"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                          <div>
                            <label className="block text-[10px] font-semibold text-[#8696a0] mb-1">Recorrência</label>
                            <select
                              value={sch.recurrency}
                              onChange={e => {
                                  const newSchs = [...schedules];
                                  newSchs[idx].recurrency = e.target.value as any;
                                  if (e.target.value !== 'weekly') newSchs[idx].days_of_week = null;
                                  if (e.target.value !== 'monthly') newSchs[idx].days_of_month = null;
                                  setSchedules(newSchs);
                              }}
                              className="w-full bg-[#182229] border border-[#2a3942] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                            >
                              <option value="daily">Diário</option>
                              <option value="weekly">Semanal</option>
                              <option value="monthly">Mensal</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-[#8696a0] mb-1">Responsável</label>
                            <select
                              value={sch.responsible_user_id || ''}
                              onChange={e => {
                                  const newSchs = [...schedules];
                                  newSchs[idx].responsible_user_id = e.target.value || null;
                                  setSchedules(newSchs);
                              }}
                              className="w-full bg-[#182229] border border-[#2a3942] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                            >
                              <option value="">Qualquer Operador</option>
                              {users.map(u => (
                                <option key={u.id} value={u.id}>{u.name}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {sch.recurrency === 'weekly' && (
                          <div className="mt-3">
                            <label className="block text-[10px] font-semibold text-[#8696a0] mb-2">Dias da Semana</label>
                            <div className="flex flex-wrap gap-2">
                              {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map((day, dIdx) => (
                                <button
                                  key={day}
                                  type="button"
                                  onClick={() => {
                                    const newSchs = [...schedules];
                                    const currentDays = newSchs[idx].days_of_week || [];
                                    if (currentDays.includes(dIdx)) {
                                      newSchs[idx].days_of_week = currentDays.filter(d => d !== dIdx);
                                    } else {
                                      newSchs[idx].days_of_week = [...currentDays, dIdx].sort();
                                    }
                                    setSchedules(newSchs);
                                  }}
                                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                                    (sch.days_of_week || []).includes(dIdx)
                                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                                      : 'bg-[#182229] text-[#8696a0] border border-[#2a3942] hover:bg-[#2a3942]'
                                  }`}
                                >
                                  {day}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {sch.recurrency === 'monthly' && (
                          <div className="mt-3">
                            <label className="block text-[10px] font-semibold text-[#8696a0] mb-2">Dias do Mês</label>
                            <div className="flex flex-wrap gap-1.5">
                              {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                                <button
                                  key={day}
                                  type="button"
                                  onClick={() => {
                                    const newSchs = [...schedules];
                                    const currentDays = newSchs[idx].days_of_month || [];
                                    if (currentDays.includes(day)) {
                                      newSchs[idx].days_of_month = currentDays.filter(d => d !== day);
                                    } else {
                                      newSchs[idx].days_of_month = [...currentDays, day].sort((a, b) => a - b);
                                    }
                                    setSchedules(newSchs);
                                  }}
                                  className={`w-8 h-8 flex items-center justify-center text-[11px] font-bold rounded-lg transition-all ${
                                    (sch.days_of_month || []).includes(day)
                                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                                      : 'bg-[#182229] text-[#8696a0] border border-[#2a3942] hover:bg-[#2a3942]'
                                  }`}
                                >
                                  {day}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </div>

          {/* Rodapé Fixo Mobile para Ações Globais (Ergonomia Ergonômica) */}
          <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-[#202c33]/95 backdrop-blur-md border-t border-[#2a3942]/60 p-4 flex gap-3 z-30 shadow-2xl animate-in slide-in-from-bottom duration-300">
            <button
              onClick={() => setEditingChecklist(null)}
              className="flex-1 bg-[#182229] hover:bg-[#111b21] text-[#d1d7db] text-xs font-bold py-3 rounded-xl border border-[#2a3942] active:scale-95 transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={handleSaveAll}
              disabled={saving}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-3 rounded-xl active:scale-95 transition-all shadow-md shadow-indigo-600/10"
            >
              {saving ? 'Salvando...' : 'Salvar Roteiro'}
            </button>
          </div>

        </div>
      )}

      {/* DRAWER: CADASTRO E EDIÇÃO DE TAREFAS */}
      {showTaskDrawer && (
        <div className="fixed inset-0 z-[60] overflow-hidden animate-in fade-in duration-200">
          {/* Backdrop Focado */}
          <div 
            onClick={() => { setShowTaskDrawer(false); setEditingTaskIndex(null); }}
            className="absolute inset-0 bg-black/65 backdrop-blur-sm transition-opacity" 
          />
          
          <div className="absolute inset-x-0 bottom-0 lg:inset-y-0 lg:right-0 lg:left-auto max-w-full flex lg:pl-10 z-50">
            <div className="w-screen max-w-md bg-[#202c33] border-t lg:border-t-0 lg:border-l border-[#2a3942] shadow-2xl flex flex-col justify-between rounded-t-[32px] lg:rounded-t-none lg:rounded-l-[32px] h-[85vh] lg:h-full transition-transform duration-300 transform animate-in slide-in-from-bottom lg:slide-in-from-right overflow-hidden">
              
              {/* Header do Drawer */}
              <div className="p-5 border-b border-[#2a3942]/60 flex justify-between items-center bg-[#111b21]/30">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
                    {editingTaskIndex !== null ? <Edit2 size={16} /> : <Plus size={16} />}
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-sm">
                      {editingTaskIndex !== null ? 'Editar Tarefa' : 'Nova Tarefa'}
                    </h3>
                    <p className="text-[10px] text-[#8696a0] mt-0.5">Configure as regras operacionais da rotina.</p>
                  </div>
                </div>
                <button 
                  onClick={() => { setShowTaskDrawer(false); setEditingTaskIndex(null); }} 
                  className="p-1.5 hover:bg-white/10 rounded-full text-[#8696a0] transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Corpo do Drawer (Rolagem Interna) */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4 styled-scrollbar bg-[#202c33]">
                
                {/* Nome do Item e Categoria Separados */}
                <div className="space-y-3.5">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="col-span-1 relative">
                      <label className="block text-[10px] font-semibold text-[#8696a0] mb-1.5 uppercase tracking-wider">Categoria</label>
                      <div className="relative">
                        <input
                          type="text"
                          value={tempItemCategory}
                          onChange={e => {
                            setTempItemCategory(e.target.value.toUpperCase());
                            setShowCategoryDropdown(true);
                          }}
                          onFocus={() => setShowCategoryDropdown(true)}
                          placeholder="Ex: CAFÉ"
                          className="w-full bg-[#111b21] border border-[#2a3942] rounded-xl pl-3.5 pr-8 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 placeholder-[#8696a0]/40"
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowCategoryDropdown(!showCategoryDropdown);
                          }}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8696a0] hover:text-white transition-colors"
                        >
                          <ChevronDown size={14} className={`transition-transform duration-200 ${showCategoryDropdown ? 'rotate-180' : ''}`} />
                        </button>
                      </div>

                      {showCategoryDropdown && (
                        <>
                          <div 
                            className="fixed inset-0 z-40" 
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowCategoryDropdown(false);
                            }}
                          />
                          <div className="absolute left-0 right-0 mt-1.5 max-h-40 overflow-y-auto bg-[#202c33] border border-[#2a3942] rounded-xl p-1 z-50 shadow-2xl styled-scrollbar">
                            {(() => {
                              const cats = Array.from(new Set(checklistItems.map(item => {
                                const m = item.title.match(/^\[(.*?)\]\s*(.*)$/);
                                return m ? m[1] : null;
                              }).filter(Boolean)));
                              
                              if (cats.length === 0) {
                                return (
                                  <span className="text-[10px] text-[#8696a0] block p-2 text-center">Nenhuma categoria</span>
                                );
                              }

                              return cats.map(cat => (
                                <button
                                  key={cat}
                                  type="button"
                                  onClick={() => {
                                    setTempItemCategory(cat);
                                    setShowCategoryDropdown(false);
                                  }}
                                  className="w-full text-left text-xs text-[#d1d7db] hover:bg-[#111b21] hover:text-white px-3 py-2 rounded-lg transition-colors truncate"
                                >
                                  {cat}
                                </button>
                              ));
                            })()}
                          </div>
                        </>
                      )}
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[10px] font-semibold text-[#8696a0] mb-1.5 uppercase tracking-wider">Nome do Produto / Tarefa *</label>
                      <input
                        type="text"
                        value={tempItemName}
                        onChange={e => setTempItemName(e.target.value)}
                        placeholder="Ex: ACHOCOLATADO ESPECIAL CREMOSO"
                        className="w-full bg-[#111b21] border border-[#2a3942] rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 placeholder-[#8696a0]/40"
                      />
                    </div>
                  </div>
                </div>

                {/* Tipo de Resposta */}
                <div>
                  <label className="block text-[10px] font-semibold text-[#8696a0] mb-1.5 uppercase tracking-wider">Tipo de Resposta *</label>
                  <select
                    value={newItem.response_type}
                    onChange={e => setNewItem(p => ({ ...p, response_type: e.target.value }))}
                    className="w-full bg-[#111b21] border border-[#2a3942] rounded-xl px-3.5 py-2.5 text-xs text-[#d1d7db] focus:outline-none focus:border-indigo-500 mb-3"
                  >
                    <option value="boolean">Feito / Não Feito</option>
                    <option value="conformity">Conforme / Não Conforme</option>
                    <option value="yes_no">Sim / Não</option>
                    <option value="numeric">Campo Numérico geral</option>
                    <option value="kg">Quilograma (kg)</option>
                    <option value="temperature">Temperatura em °C</option>
                    <option value="counter">Contagem física</option>
                    <option value="text">Resposta em texto livre</option>
                    <option value="photo">Foto obrigatória como resposta</option>
                    <option value="stars">Avaliação por estrelas (1-5)</option>
                  </select>

                  {/* Gatilho do Menu Suspenso (Accordion) do Guia Didático */}
                  <button
                    type="button"
                    onClick={() => setShowResponseTypeGuide(!showResponseTypeGuide)}
                    className="mt-1 text-xs font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1.5 bg-indigo-500/5 hover:bg-indigo-500/10 px-3.5 py-2 rounded-xl border border-indigo-500/15 transition-all select-none w-full justify-between active:scale-[0.98]"
                  >
                    <span className="flex items-center gap-2">
                      <HelpCircle size={14} className="text-indigo-400" />
                      Dúvida sobre qual escolher? Ver Guia Prático
                    </span>
                    {showResponseTypeGuide ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>

                  {/* Guia Didático e Simulador de Campo Mobile (Seção Colapsável) */}
                  {showResponseTypeGuide && (() => {
                    const guide = getResponseTypeGuideline(newItem.response_type);
                    if (!guide) return null;
                    return (
                      <div className={`mt-2.5 p-4 rounded-2xl border ${guide.borderColor} transition-all duration-300 animate-in fade-in slide-in-from-top-2 bg-[#202c33]/40 backdrop-blur-sm shadow-inner`}>
                        <div className="flex items-center gap-1.5 mb-2">
                          <span className="text-[9px] font-black uppercase tracking-widest text-[#8696a0]">Guia Didático</span>
                          <span className="w-1 h-1 rounded-full bg-indigo-400/60 shrink-0"></span>
                          <span className={`text-[10px] font-extrabold uppercase tracking-wide ${guide.textColor}`}>{guide.title}</span>
                        </div>
                        <p className="text-[11px] text-[#e9edef] leading-relaxed mb-3">{guide.description}</p>
                        
                        <div className="space-y-2.5 pt-2.5 border-t border-[#2a3942]/20">
                          <div>
                            <span className="text-[9px] font-black text-[#8696a0] block uppercase tracking-wider mb-0.5">💡 Caso de Uso Ideal:</span>
                            <span className="text-[10px] text-[#d1d7db] leading-relaxed">{guide.useCase}</span>
                          </div>
                          <div>
                            <span className="text-[9px] font-black text-[#8696a0] block uppercase tracking-wider mb-1">📱 Como o operador responde no PWA (Mobile):</span>
                            <span className="inline-block font-mono text-[10px] font-bold text-white/95 bg-[#111b21] border border-[#2a3942]/60 px-3 py-1.5 rounded-xl select-none shadow-sm">
                              {guide.preview}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Descrição */}
                <div>
                  <label className="block text-[10px] font-semibold text-[#8696a0] mb-1.5 uppercase tracking-wider">Instruções para a equipe</label>
                  <textarea
                    rows={3}
                    value={newItem.description}
                    onChange={e => setNewItem(p => ({ ...p, description: e.target.value }))}
                    placeholder="Oriente como o operador realiza a tarefa..."
                    className="w-full bg-[#111b21] border border-[#2a3942] rounded-xl px-3.5 py-2.5 text-xs text-slate-300 focus:outline-none focus:border-indigo-500 placeholder-[#8696a0]/40"
                  />
                </div>

                {/* Limites de conformidade (Se aplicável) */}
                {(newItem.response_type === 'numeric' || newItem.response_type === 'temperature' || newItem.response_type === 'kg') && (
                  <div className="bg-[#111b21]/50 p-4 rounded-2xl border border-[#2a3942]/60 space-y-3.5 animate-in fade-in duration-200">
                    <span className="text-[9px] font-black text-indigo-400 block uppercase tracking-widest">Metas e Limites</span>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[9px] text-[#8696a0] mb-1">Mínimo Aceitável</label>
                        <input
                          type="number"
                          step="any"
                          value={newItem.min_meta ?? ''}
                          onChange={e => setNewItem(p => ({ ...p, min_meta: e.target.value !== '' ? parseFloat(e.target.value) : null }))}
                          placeholder="Mínimo"
                          className="w-full bg-[#182229] border border-[#2a3942] rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] text-[#8696a0] mb-1">Máximo Aceitável</label>
                        <input
                          type="number"
                          step="any"
                          value={newItem.max_meta ?? ''}
                          onChange={e => setNewItem(p => ({ ...p, max_meta: e.target.value !== '' ? parseFloat(e.target.value) : null }))}
                          placeholder="Máximo"
                          className="w-full bg-[#182229] border border-[#2a3942] rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[9px] text-[#8696a0] mb-1">Unidade de Medida</label>
                      <input
                        type="text"
                        value={newItem.measurement_unit || ''}
                        onChange={e => setNewItem(p => ({ ...p, measurement_unit: e.target.value }))}
                        placeholder="Ex: °C, kg, pratos"
                        className="w-full bg-[#182229] border border-[#2a3942] rounded-xl px-3 py-2 text-xs text-white focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                {/* Configurações Avançadas de Itens */}
                <div className="space-y-3 bg-[#111b21]/30 p-4 rounded-2xl border border-[#2a3942]/40">
                  <span className="text-[9px] font-black text-[#8696a0] block uppercase tracking-widest">Regras Avançadas</span>
                  <label className="flex items-center gap-2 cursor-pointer text-xs select-none">
                    <input
                      type="checkbox"
                      checked={newItem.is_critical}
                      onChange={e => setNewItem(p => ({ ...p, is_critical: e.target.checked }))}
                      className="rounded border-[#2a3942] text-indigo-600 focus:ring-0 bg-transparent"
                    />
                    <span className="text-[#d1d7db]">
                      ⚠️ Marcar como Tarefa Crítica
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-xs select-none">
                    <input
                      type="checkbox"
                      checked={newItem.require_evidence}
                      onChange={e => setNewItem(p => ({ ...p, require_evidence: e.target.checked }))}
                      className="rounded border-[#2a3942] text-indigo-600 focus:ring-0 bg-transparent"
                    />
                    <span className="text-[#d1d7db]">
                      📷 Exigir Evidência por Foto
                    </span>
                  </label>
                </div>

                {/* Seção de Sub-tarefas / Passos Detalhados */}
                <div className="bg-[#111b21]/50 p-4 rounded-2xl border border-[#2a3942]/60 space-y-3.5">
                  <span className="text-[9px] font-black text-indigo-400 block uppercase tracking-widest flex items-center gap-1.5">
                    <ClipboardList size={12} />
                    Sub-tarefas / Passos Detalhados
                  </span>
                  <p className="text-[10px] text-[#8696a0] leading-relaxed">
                    Adicione subtarefas ou passos detalhados que o operador deve concluir para validar esta tarefa principal.
                  </p>
                  
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newSubTaskName}
                      onChange={e => setNewSubTaskName(e.target.value)}
                      placeholder="Ex: Limpar borracha da porta"
                      className="flex-1 bg-[#111b21] border border-[#2a3942] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 placeholder-[#8696a0]/30"
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddSubTask();
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleAddSubTask}
                      className="bg-indigo-600/20 hover:bg-indigo-600/35 border border-indigo-500/30 text-indigo-400 hover:text-indigo-300 font-bold px-3 py-2 rounded-xl text-xs transition-all active:scale-95 flex items-center justify-center shrink-0"
                    >
                      <Plus size={14} />
                    </button>
                  </div>

                  {/* Listagem de Sub-tarefas */}
                  {(!newItem.options || newItem.options.length === 0) ? (
                    <span className="text-[10px] text-[#8696a0] italic block py-1">Sem subtarefas cadastradas.</span>
                  ) : (
                    <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1 custom-scrollbar">
                      {newItem.options.map((sub, sIdx) => (
                        <div key={sIdx} className="flex items-center justify-between gap-2 p-2.5 bg-[#182229]/60 border border-[#2a3942]/40 rounded-xl animate-in fade-in duration-200">
                          <span className="text-xs text-[#d1d7db] truncate flex items-center gap-1.5 min-w-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0"></span>
                            <span className="truncate">{sub}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveSubTask(sIdx)}
                            className="p-1 hover:bg-rose-500/10 text-[#8696a0] hover:text-rose-400 rounded-lg transition-colors shrink-0"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>

              {/* Rodapé do Drawer */}
              <div className="p-4 border-t border-[#2a3942]/60 bg-[#111b21]/30 flex gap-3">
                <button
                  type="button"
                  onClick={() => { setShowTaskDrawer(false); setEditingTaskIndex(null); }}
                  className="flex-1 bg-[#182229] hover:bg-[#111b21] text-[#d1d7db] font-bold py-2.5 rounded-xl border border-[#2a3942] text-xs transition-all active:scale-95"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveTaskDrawer}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl text-xs transition-all active:scale-95 shadow-md shadow-indigo-600/10"
                >
                  Confirmar Tarefa
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* =============================================
          MODAL FULLSCREEN: IMPORTAÇÃO DE PLANILHA EXCEL
         ============================================= */}
      {showExcelImportModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex flex-col z-[70] animate-in fade-in duration-200">
          {/* Header */}
          <div className="h-16 bg-[#202c33] border-b border-[#2a3942]/60 px-6 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-2xl bg-teal-500/15 flex items-center justify-center text-teal-400 border border-teal-500/20">
                <FileSpreadsheet size={18} />
              </div>
              <div>
                <h2 className="font-bold text-white text-sm">Importar Planilha de Estoque</h2>
                <p className="text-[10px] text-[#8696a0]">Faça upload, revise, edite e confirme os itens antes de importar.</p>
              </div>
            </div>
            <button
              onClick={() => setShowExcelImportModal(false)}
              className="p-2 hover:bg-white/10 rounded-xl text-[#8696a0] hover:text-white transition-all"
            >
              <X size={20} />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto styled-scrollbar p-6">
            <div className="max-w-6xl mx-auto space-y-6">

              {/* Upload Area */}
              {excelImportItems.length === 0 && (
                <div className="space-y-4">
                  <div 
                    className="border-2 border-dashed border-[#2a3942] hover:border-teal-500/40 rounded-3xl p-12 text-center transition-all cursor-pointer group bg-[#202c33]/40 hover:bg-teal-500/5"
                    onClick={() => excelFileInputRef.current?.click()}
                  >
                    <Upload size={48} className="mx-auto text-[#2a3942] group-hover:text-teal-400 transition-colors mb-4" />
                    <h3 className="font-bold text-white text-base mb-2">Arraste ou clique para selecionar a planilha</h3>
                    <p className="text-xs text-[#8696a0] max-w-md mx-auto leading-relaxed">
                      Formatos aceitos: <span className="text-teal-400 font-bold">.xlsx</span>, <span className="text-teal-400 font-bold">.xls</span> e <span className="text-teal-400 font-bold">.csv</span>. 
                      A primeira linha será interpretada como cabeçalho. Colunas reconhecidas automaticamente: 
                      <span className="text-white font-semibold"> Título, Descrição, Unidade, Quantidade, Categoria, Crítico, Peso</span>.
                    </p>
                    <input 
                      ref={excelFileInputRef}
                      type="file" 
                      accept=".xlsx,.xls,.csv" 
                      onChange={handleExcelFileChange} 
                      className="hidden" 
                    />
                  </div>

                  {/* Dica de formato */}
                  <div className="bg-[#202c33]/60 border border-[#2a3942]/60 rounded-2xl p-5">
                    <h4 className="text-xs font-bold text-white mb-3 flex items-center gap-2">
                      <Table2 size={14} className="text-teal-400" />
                      Exemplo de Formato Esperado (compatível com sua planilha de compras)
                    </h4>
                    <div className="overflow-x-auto rounded-xl border border-[#2a3942]/40">
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr className="bg-[#111b21]">
                            <th className="px-3 py-2 text-left text-teal-400 font-bold">Descrição</th>
                            <th className="px-3 py-2 text-left text-teal-400 font-bold">Fornecedor</th>
                            <th className="px-3 py-2 text-left text-teal-400 font-bold">Custo</th>
                            <th className="px-3 py-2 text-left text-teal-400 font-bold">Grupo</th>
                            <th className="px-3 py-2 text-left text-teal-400 font-bold">Min / Max</th>
                          </tr>
                        </thead>
                        <tbody className="text-[#d1d7db]">
                          <tr className="border-t border-[#2a3942]/30">
                            <td className="px-3 py-2">AGUA 500ML</td>
                            <td className="px-3 py-2 text-sky-400/70">AMBEV SA CDD EMBU</td>
                            <td className="px-3 py-2 text-emerald-400/70 font-mono">R$ 1,32</td>
                            <td className="px-3 py-2">REFRIGERANTES</td>
                            <td className="px-3 py-2 font-mono">48/60</td>
                          </tr>
                          <tr className="border-t border-[#2a3942]/30">
                            <td className="px-3 py-2">BATATA CRINKLES PORCAO</td>
                            <td className="px-3 py-2 text-sky-400/70">NOVA MEGA G ATACADISTA</td>
                            <td className="px-3 py-2 text-emerald-400/70 font-mono">R$ 4,28</td>
                            <td className="px-3 py-2">PORCOES</td>
                            <td className="px-3 py-2 font-mono">50/80</td>
                          </tr>
                          <tr className="border-t border-[#2a3942]/30">
                            <td className="px-3 py-2">BOMBOM OURO BRANCO</td>
                            <td className="px-3 py-2 text-sky-400/70">DOCERIA MARINGA</td>
                            <td className="px-3 py-2 text-emerald-400/70 font-mono">R$ 1,28</td>
                            <td className="px-3 py-2">DOCES</td>
                            <td className="px-3 py-2 font-mono">20/100</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <p className="text-[10px] text-[#8696a0] mt-3 leading-relaxed">
                      💡 <span className="text-white font-semibold">Dica:</span> O sistema detecta automaticamente o cabeçalho mesmo que a planilha tenha linhas de título e resumo acima. Colunas como <span className="text-teal-400 font-semibold">Descrição</span>, <span className="text-teal-400 font-semibold">Fornecedor</span>, <span className="text-teal-400 font-semibold">Custo</span>, <span className="text-teal-400 font-semibold">Grupo</span> e <span className="text-teal-400 font-semibold">Min/Max</span> são reconhecidas automaticamente.
                    </p>
                  </div>

                  {excelParsingError && (
                    <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 flex items-center gap-3">
                      <AlertTriangle size={18} className="text-rose-400 shrink-0" />
                      <p className="text-xs text-rose-300">{excelParsingError}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Review Table */}
              {excelImportItems.length > 0 && (
                <div className="space-y-4">
                  {/* Stats Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2 bg-teal-500/10 border border-teal-500/20 px-4 py-2 rounded-xl">
                        <FileSpreadsheet size={14} className="text-teal-400" />
                        <span className="text-xs font-bold text-teal-400">{excelFileName}</span>
                      </div>
                      <div className="flex items-center gap-2 bg-indigo-500/10 border border-indigo-500/20 px-4 py-2 rounded-xl">
                        <ClipboardList size={14} className="text-indigo-400" />
                        <span className="text-xs font-bold text-indigo-400">{excelImportItems.length} itens detectados</span>
                      </div>
                      <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 px-4 py-2 rounded-xl">
                        <AlertTriangle size={14} className="text-amber-400" />
                        <span className="text-xs font-bold text-amber-400">{excelImportItems.filter(i => i.is_critical).length} críticos</span>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setExcelImportItems([]);
                        setExcelFileName('');
                        setExcelParsingError('');
                      }}
                      className="text-xs text-[#8696a0] hover:text-rose-400 font-semibold flex items-center gap-1 transition-all"
                    >
                      <Trash2 size={12} /> Descartar e Reenviar
                    </button>
                  </div>

                  {/* Table */}
                  <div className="bg-[#202c33]/80 border border-[#2a3942]/60 rounded-3xl overflow-hidden">
                    <div className="overflow-x-auto styled-scrollbar">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-[#111b21]/80 border-b border-[#2a3942]/60">
                            <th className="px-3 py-3 text-left text-[10px] font-black text-[#8696a0] uppercase tracking-widest w-10">#</th>
                            <th className="px-3 py-3 text-left text-[10px] font-black text-[#8696a0] uppercase tracking-widest min-w-[220px]">Descrição</th>
                            <th className="px-3 py-3 text-left text-[10px] font-black text-[#8696a0] uppercase tracking-widest min-w-[180px]">Fornecedor / Custo</th>
                            <th className="px-3 py-3 text-left text-[10px] font-black text-[#8696a0] uppercase tracking-widest w-24">Grupo</th>
                            <th className="px-3 py-3 text-center text-[10px] font-black text-[#8696a0] uppercase tracking-widest w-24">Min / Max</th>
                            <th className="px-3 py-3 text-left text-[10px] font-black text-[#8696a0] uppercase tracking-widest w-28">Tipo Resposta</th>
                            <th className="px-3 py-3 text-center text-[10px] font-black text-[#8696a0] uppercase tracking-widest w-16">Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {excelImportItems.map((item, idx) => {
                            const isEditing = excelEditingIdx === idx;
                            // Extract group from title prefix [GROUP] 
                            const groupMatch = item.title.match(/^\[([^\]]+)\]\s*/);
                            const groupName = groupMatch ? groupMatch[1] : '';
                            const cleanTitle = groupMatch ? item.title.replace(groupMatch[0], '') : item.title;
                            return (
                              <tr 
                                key={idx} 
                                className={`border-b border-[#2a3942]/30 transition-all ${
                                  isEditing ? 'bg-indigo-500/10' : 
                                  item.is_critical ? 'bg-amber-500/5' : 
                                  idx % 2 === 0 ? 'bg-transparent' : 'bg-[#111b21]/20'
                                } hover:bg-white/5`}
                              >
                                {/* # */}
                                <td className="px-3 py-3">
                                  <span className="text-[10px] font-bold font-mono text-[#8696a0] bg-black/20 w-5 h-5 flex items-center justify-center rounded-full">
                                    {idx + 1}
                                  </span>
                                </td>

                                {/* Descrição (Title) */}
                                <td className="px-3 py-3">
                                  {isEditing ? (
                                    <input
                                      value={item.title}
                                      onChange={e => handleExcelItemEdit(idx, 'title', e.target.value)}
                                      className="w-full bg-[#111b21] border border-indigo-500/40 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                                    />
                                  ) : (
                                    <div>
                                      <span className="font-semibold text-white">{cleanTitle}</span>
                                      {item.is_critical && (
                                        <span className="ml-2 text-[8px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 font-bold align-middle">CRÍTICO</span>
                                      )}
                                    </div>
                                  )}
                                </td>

                                {/* Fornecedor / Custo (from description) */}
                                <td className="px-3 py-3">
                                  {isEditing ? (
                                    <input
                                      value={item.description}
                                      onChange={e => handleExcelItemEdit(idx, 'description', e.target.value)}
                                      className="w-full bg-[#111b21] border border-indigo-500/40 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                                    />
                                  ) : (
                                    <div className="space-y-0.5">
                                      {item.description ? item.description.split(' | ').map((part, pIdx) => {
                                        const isSupplier = part.startsWith('Fornecedor:');
                                        const isCost = part.startsWith('Custo:');
                                        return (
                                          <div key={pIdx} className="text-[10px]">
                                            {isSupplier ? (
                                              <span className="text-sky-400">{part}</span>
                                            ) : isCost ? (
                                              <span className="text-emerald-400 font-mono font-semibold">{part}</span>
                                            ) : (
                                              <span className="text-[#8696a0]">{part}</span>
                                            )}
                                          </div>
                                        );
                                      }) : <span className="text-[#8696a0] text-[10px]">-</span>}
                                    </div>
                                  )}
                                </td>

                                {/* Grupo */}
                                <td className="px-3 py-3">
                                  {groupName ? (
                                    <span className="text-[9px] px-2 py-1 rounded-full bg-indigo-500/15 text-indigo-300 font-bold">{groupName}</span>
                                  ) : (
                                    <span className="text-[#8696a0] text-[10px]">-</span>
                                  )}
                                </td>

                                {/* Min / Max */}
                                <td className="px-3 py-3 text-center">
                                  {isEditing ? (
                                    <div className="flex items-center gap-1">
                                      <input
                                        type="number"
                                        placeholder="Min"
                                        value={item.min_meta ?? ''}
                                        onChange={e => handleExcelItemEdit(idx, 'min_meta', e.target.value ? parseFloat(e.target.value) : null)}
                                        className="w-12 bg-[#111b21] border border-indigo-500/40 rounded-lg px-1 py-1.5 text-[10px] text-white text-center focus:outline-none focus:border-indigo-500"
                                      />
                                      <span className="text-[#8696a0]">/</span>
                                      <input
                                        type="number"
                                        placeholder="Max"
                                        value={item.max_meta ?? ''}
                                        onChange={e => handleExcelItemEdit(idx, 'max_meta', e.target.value ? parseFloat(e.target.value) : null)}
                                        className="w-12 bg-[#111b21] border border-indigo-500/40 rounded-lg px-1 py-1.5 text-[10px] text-white text-center focus:outline-none focus:border-indigo-500"
                                      />
                                    </div>
                                  ) : (
                                    (item.min_meta !== null || item.max_meta !== null) ? (
                                      <span className="font-mono text-[10px] text-teal-400 font-bold">
                                        {item.min_meta ?? 0}/{item.max_meta ?? 0}
                                      </span>
                                    ) : (
                                      <span className="text-[#8696a0] text-[10px]">-</span>
                                    )
                                  )}
                                </td>

                                {/* Tipo de Resposta */}
                                <td className="px-3 py-3">
                                  {isEditing ? (
                                    <select
                                      value={item.response_type}
                                      onChange={e => handleExcelItemEdit(idx, 'response_type', e.target.value)}
                                      className="bg-[#111b21] border border-indigo-500/40 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 w-full"
                                    >
                                      <option value="numeric">Numérico</option>
                                      <option value="kg">Quilograma (kg)</option>
                                      <option value="boolean">Feito/Não Feito</option>
                                      <option value="conformity">Conformidade</option>
                                      <option value="yes_no">Sim/Não</option>
                                      <option value="temperature">Temperatura</option>
                                      <option value="counter">Contador (+/-)</option>
                                      <option value="text">Texto Livre</option>
                                      <option value="photo">Foto</option>
                                      <option value="stars">Estrelas</option>
                                    </select>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded-full bg-slate-500/15 text-[#8696a0] font-bold text-[9px] uppercase">
                                      {item.response_type === 'numeric' ? 'Numérico' :
                                       item.response_type === 'kg' ? 'Quilo (kg)' :
                                       item.response_type === 'boolean' ? 'Feito/Não' :
                                       item.response_type === 'conformity' ? 'Conform.' :
                                       item.response_type === 'yes_no' ? 'Sim/Não' :
                                       item.response_type === 'temperature' ? 'Temp.' :
                                       item.response_type === 'counter' ? 'Contador' :
                                       item.response_type}
                                    </span>
                                  )}
                                </td>

                                {/* Ações */}
                                <td className="px-3 py-3 text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    <button
                                      onClick={() => setExcelEditingIdx(isEditing ? null : idx)}
                                      className={`p-1.5 rounded-lg transition-all ${
                                        isEditing ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25' : 'hover:bg-indigo-500/15 text-[#8696a0] hover:text-indigo-400'
                                      }`}
                                      title={isEditing ? 'Confirmar Edição' : 'Editar Item'}
                                    >
                                      {isEditing ? <Check size={13} /> : <Edit2 size={13} />}
                                    </button>
                                    <button
                                      onClick={() => handleExcelItemRemove(idx)}
                                      className="p-1.5 hover:bg-rose-500/15 text-[#8696a0] hover:text-rose-400 rounded-lg transition-all"
                                      title="Remover Item"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          {excelImportItems.length > 0 && (
            <div className="h-20 bg-[#202c33] border-t border-[#2a3942]/60 px-6 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <p className="text-xs text-[#8696a0]">
                  <span className="text-white font-bold">{excelImportItems.length}</span> itens prontos para importação
                  {checklistItems.length > 0 && (
                    <span> (serão adicionados aos <span className="text-white font-semibold">{checklistItems.length}</span> itens existentes)</span>
                  )}
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowExcelImportModal(false)}
                  className="text-xs text-[#8696a0] hover:text-[#d1d7db] font-semibold flex items-center gap-1 px-4 py-2.5 rounded-xl hover:bg-white/5 transition-all"
                >
                  <X size={14} /> Cancelar
                </button>
                <button
                  onClick={handleConfirmExcelImport}
                  className="bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs px-6 py-3 rounded-2xl flex items-center gap-2 transition-all shadow-md active:scale-95"
                >
                  <CheckCircle2 size={14} /> Confirmar Importação de {excelImportItems.length} Itens
                </button>
              </div>
            </div>
          )}
        </div>
      )}


    </div>
  );
}
