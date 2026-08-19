import { GastroFoodService, ClientData, AddressData, OrderItem, OrderPayload, OrderConfirmation } from '../services/gastroFoodService';
import { supabase } from '../services/supabase';

export type OrderStep = 
  | 'IDLE'
  | 'AWAITING_CLIENT_IDENTIFICATION'
  | 'AWAITING_REGISTRATION_NAME'
  | 'AWAITING_REGISTRATION_CEP'
  | 'AWAITING_REGISTRATION_NUMBER'
  | 'AWAITING_REGISTRATION_COMPLEMENT'
  | 'AWAITING_ITEMS_SELECTION'
  | 'AWAITING_DELIVERY_TYPE'
  | 'AWAITING_PAYMENT_METHOD'
  | 'AWAITING_CASH_CHANGE'
  | 'CONFIRMING_ORDER'
  | 'ORDER_PLACED';

export interface OrderSession {
  userId: string;
  tenantId: string;
  step: OrderStep;
  client?: ClientData;
  tempAddress?: Partial<AddressData>;
  items: OrderItem[];
  deliveryType: 'DELIVERY' | 'TAKEOUT' | 'DINE_IN';
  deliveryFee: number;
  paymentMethod?: 'PIX' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'CASH';
  cashChangeFor?: number;
  observations?: string;
  lastOrderId?: string | number;
  updatedAt: string;
}

export class OrderFlowManager {
  private static sessions: Map<string, OrderSession> = new Map();

  /**
   * Obtém a chave de sessão composta por tenantId e userId
   */
  private static getSessionKey(tenantId: string, userId: string): string {
    return `${tenantId}:${userId}`;
  }

  /**
   * Carrega a sessão atual do Supabase ou memória
   */
  public static async getSession(userId: string, tenantId: string): Promise<OrderSession> {
    const key = this.getSessionKey(tenantId, userId);
    if (this.sessions.has(key)) {
      return this.sessions.get(key)!;
    }

    try {
      const { data } = await supabase
        .from('customer_sessions')
        .select('*')
        .eq('user_id', userId)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (data && data.current_step_data) {
        const session: OrderSession = {
          userId,
          tenantId,
          step: data.status || 'IDLE',
          ...data.current_step_data,
          updatedAt: data.updated_at || new Date().toISOString()
        };
        this.sessions.set(key, session);
        return session;
      }
    } catch (e) {
      console.warn('[OrderFlowManager] Tabela customer_sessions offline ou indisponível, usando estado em memória');
    }

    const newSession: OrderSession = {
      userId,
      tenantId,
      step: 'IDLE',
      items: [],
      deliveryType: 'DELIVERY',
      deliveryFee: 0,
      updatedAt: new Date().toISOString()
    };
    this.sessions.set(key, newSession);
    return newSession;
  }

  /**
   * Salva o estado da sessão em memória e no Supabase
   */
  public static async saveSession(session: OrderSession): Promise<void> {
    const key = this.getSessionKey(session.tenantId, session.userId);
    session.updatedAt = new Date().toISOString();
    this.sessions.set(key, session);

    try {
      await supabase
        .from('customer_sessions')
        .upsert({
          user_id: session.userId,
          tenant_id: session.tenantId,
          status: session.step,
          current_step_data: session,
          updated_at: session.updatedAt
        }, { onConflict: 'tenant_id,user_id' });
    } catch (e) {
      // Ignora erro se RLS ou tabela não criada
    }
  }

  /**
   * Inicia um novo fluxo de pedido
   */
  public static async startOrder(userId: string, tenantId: string, phone?: string): Promise<{ message: string; nextStep: OrderStep; session: OrderSession }> {
    const session = await this.getSession(userId, tenantId);
    session.step = 'AWAITING_CLIENT_IDENTIFICATION';
    session.items = [];
    session.deliveryFee = 0;

    if (phone) {
      const client = await GastroFoodService.checkClient(phone, tenantId);
      if (client) {
        session.client = client;
        session.step = 'AWAITING_ITEMS_SELECTION';
        await this.saveSession(session);
        return {
          message: `Olá, ${client.name}! Que bom te ter aqui de novo na nossa loja. 😊\nO que você gostaria de pedir hoje?`,
          nextStep: 'AWAITING_ITEMS_SELECTION',
          session
        };
      }
    }

    await this.saveSession(session);
    return {
      message: 'Olá! Seja muito bem-vindo(a)! Para começar seu pedido, por favor me informe seu número de WhatsApp com DDD ou seu telefone cadastrado:',
      nextStep: 'AWAITING_CLIENT_IDENTIFICATION',
      session
    };
  }

  /**
   * Processa uma etapa do fluxo do pedido
   */
  public static async processStep(
    userId: string,
    input: string,
    tenantId: string
  ): Promise<{ responseText: string; isFinalized: boolean; confirmation?: OrderConfirmation; session: OrderSession }> {
    const session = await this.getSession(userId, tenantId);
    const cleanInput = input.trim();

    switch (session.step) {
      case 'AWAITING_CLIENT_IDENTIFICATION': {
        const phone = cleanInput.replace(/\D/g, '');
        if (phone.length < 8) {
          return {
            responseText: 'Por favor, informe um número de telefone válido com DDD (ex: 11999998888):',
            isFinalized: false,
            session
          };
        }

        const client = await GastroFoodService.checkClient(phone, tenantId);
        if (client) {
          session.client = client;
          session.step = 'AWAITING_ITEMS_SELECTION';
          await this.saveSession(session);
          return {
            responseText: `Localizei seu cadastro, ${client.name}! ✅\nVocê gostaria de ver o cardápio ou já sabe quais itens deseja pedir?`,
            isFinalized: false,
            session
          };
        } else {
          session.client = { phone };
          session.step = 'AWAITING_REGISTRATION_NAME';
          await this.saveSession(session);
          return {
            responseText: 'Ainda não encontrei seu cadastro no nosso sistema. Vamos fazer rapidinho!\nQual é o seu **Nome Completo**?',
            isFinalized: false,
            session
          };
        }
      }

      case 'AWAITING_REGISTRATION_NAME': {
        if (cleanInput.length < 2) {
          return {
            responseText: 'Por favor, digite seu nome completo:',
            isFinalized: false,
            session
          };
        }

        session.client = { ...(session.client || {}), name: cleanInput };
        session.step = 'AWAITING_REGISTRATION_CEP';
        await this.saveSession(session);
        return {
          responseText: `Prazer, ${cleanInput}! Agora, por favor, me informe o seu **CEP** para calcularmos a entrega:`,
          isFinalized: false,
          session
        };
      }

      case 'AWAITING_REGISTRATION_CEP': {
        const cepDigits = cleanInput.replace(/\D/g, '');
        if (cepDigits.length !== 8) {
          return {
            responseText: 'O CEP deve conter 8 dígitos (ex: 06764-365). Pode digitar novamente?',
            isFinalized: false,
            session
          };
        }

        try {
          const address = await GastroFoodService.queryCEP(cepDigits, tenantId);
          session.tempAddress = address;
          session.step = 'AWAITING_REGISTRATION_NUMBER';
          await this.saveSession(session);
          return {
            responseText: `Localizei: **${address.street}, ${address.neighborhood} - ${address.city}/${address.state}**.\nQual é o **Número** da sua residência?`,
            isFinalized: false,
            session
          };
        } catch (e: any) {
          return {
            responseText: 'Não consegui localizar este CEP. Por favor, verifique os números e digite novamente:',
            isFinalized: false,
            session
          };
        }
      }

      case 'AWAITING_REGISTRATION_NUMBER': {
        if (!cleanInput) {
          return {
            responseText: 'Por favor, informe o número da residência (ou S/N se não houver):',
            isFinalized: false,
            session
          };
        }

        session.tempAddress = { ...(session.tempAddress || {}), number: cleanInput };
        session.step = 'AWAITING_REGISTRATION_COMPLEMENT';
        await this.saveSession(session);
        return {
          responseText: 'Algum **Complemento** ou ponto de referência? (Ex: Apto 42, Bloco B, ou digite "Não"):',
          isFinalized: false,
          session
        };
      }

      case 'AWAITING_REGISTRATION_COMPLEMENT': {
        const comp = cleanInput.toLowerCase() === 'não' || cleanInput.toLowerCase() === 'nao' ? '' : cleanInput;
        const fullAddress: AddressData = {
          ...session.tempAddress,
          complement: comp
        };

        try {
          const createdClient = await GastroFoodService.registerClient({
            name: session.client?.name || 'Cliente',
            phone: session.client?.phone || '',
            address: fullAddress
          }, tenantId);

          session.client = createdClient;
          session.step = 'AWAITING_ITEMS_SELECTION';
          await this.saveSession(session);

          return {
            responseText: `Prontinho! Cadastro concluído com sucesso, ${createdClient.name}! 🎉\nAgora vamos ao pedido: o que você deseja pedir hoje?`,
            isFinalized: false,
            session
          };
        } catch (err: any) {
          session.step = 'AWAITING_ITEMS_SELECTION';
          await this.saveSession(session);
          return {
            responseText: `Maravilha! Endereço anotado. Vamos ao seu pedido: o que você gostaria de pedir?`,
            isFinalized: false,
            session
          };
        }
      }

      case 'AWAITING_ITEMS_SELECTION': {
        // Se o cliente enviar uma mensagem indicando que terminou a seleção ou quer fechar o pedido
        const lower = cleanInput.toLowerCase();
        if (lower.includes('fechar') || lower.includes('finalizar') || lower.includes('concluir') || lower.includes('só isso') || lower.includes('so isso')) {
          if (session.items.length === 0) {
            return {
              responseText: 'Seu carrinho ainda está vazio! 🛒\nPor favor, me diga qual item ou lanche você deseja adicionar ao seu pedido.',
              isFinalized: false,
              session
            };
          }

          session.step = 'AWAITING_DELIVERY_TYPE';
          await this.saveSession(session);
          return {
            responseText: 'Você prefere receber por **Entrega (Delivery)** ou fazer a **Retirada no Balcão**?',
            isFinalized: false,
            session
          };
        }

        // Caso padrão em items selection: orienta como pedir ou sugere o cardápio
        return {
          responseText: `Item anotado! Se desejar adicionar mais produtos, continue digitando. Quando terminar, basta digitar **"Finalizar Pedido"**!`,
          isFinalized: false,
          session
        };
      }

      case 'AWAITING_DELIVERY_TYPE': {
        const lower = cleanInput.toLowerCase();
        if (lower.includes('retir') || lower.includes('balcão') || lower.includes('balcao') || lower.includes('buscar')) {
          session.deliveryType = 'TAKEOUT';
          session.deliveryFee = 0;
        } else {
          session.deliveryType = 'DELIVERY';
          session.deliveryFee = 5.00; // Taxa padrão calculada
        }

        session.step = 'AWAITING_PAYMENT_METHOD';
        await this.saveSession(session);

        const subtotal = session.items.reduce((acc, it) => acc + (it.price * it.quantity), 0);
        const total = subtotal + session.deliveryFee;

        return {
          responseText: `Opção selecionada: **${session.deliveryType === 'DELIVERY' ? 'Entrega em domicílio' : 'Retirada na loja'}**.\n\n` +
            `Subtotal dos itens: R$ ${subtotal.toFixed(2)}\n` +
            (session.deliveryType === 'DELIVERY' ? `Taxa de Entrega: R$ ${session.deliveryFee.toFixed(2)}\n` : '') +
            `**Total a Pagar: R$ ${total.toFixed(2)}**\n\n` +
            `Qual será a forma de pagamento?\n` +
            `1️⃣ **PIX**\n` +
            `2️⃣ **Cartão de Crédito**\n` +
            `3️⃣ **Cartão de Débito**\n` +
            `4️⃣ **Dinheiro**`,
          isFinalized: false,
          session
        };
      }

      case 'AWAITING_PAYMENT_METHOD': {
        const lower = cleanInput.toLowerCase();
        if (lower.includes('pix') || lower === '1') {
          session.paymentMethod = 'PIX';
          return await this.finalizeOrder(session, tenantId);
        } else if (lower.includes('crédito') || lower.includes('credito') || lower === '2') {
          session.paymentMethod = 'CREDIT_CARD';
          return await this.finalizeOrder(session, tenantId);
        } else if (lower.includes('débito') || lower.includes('debito') || lower === '3') {
          session.paymentMethod = 'DEBIT_CARD';
          return await this.finalizeOrder(session, tenantId);
        } else if (lower.includes('dinheiro') || lower === '4') {
          session.paymentMethod = 'CASH';
          session.step = 'AWAITING_CASH_CHANGE';
          await this.saveSession(session);
          return {
            responseText: 'Você vai precisar de **troco** para quanto? (Ex: R$ 50,00 ou digite "Não preciso de troco"):',
            isFinalized: false,
            session
          };
        }

        return {
          responseText: 'Por favor, escolha uma forma de pagamento válida: **PIX**, **Crédito**, **Débito** ou **Dinheiro**.',
          isFinalized: false,
          session
        };
      }

      case 'AWAITING_CASH_CHANGE': {
        const troco = parseFloat(cleanInput.replace(/[^\d.,]/g, '').replace(',', '.'));
        if (!isNaN(troco) && troco > 0) {
          session.cashChangeFor = troco;
        }

        return await this.finalizeOrder(session, tenantId);
      }

      default:
        return {
          responseText: 'Como posso te ajudar hoje? Para fazer um pedido, digite "Fazer Pedido".',
          isFinalized: false,
          session
        };
    }
  }

  /**
   * Finaliza e envia o pedido para a API do GastroFood
   */
  private static async finalizeOrder(
    session: OrderSession,
    tenantId: string
  ): Promise<{ responseText: string; isFinalized: boolean; confirmation?: OrderConfirmation; session: OrderSession }> {
    const subtotal = session.items.reduce((acc, it) => acc + (it.price * it.quantity), 0);
    const total = subtotal + session.deliveryFee;

    const orderPayload: OrderPayload = {
      customerId: session.client?.id,
      customerName: session.client?.name || 'Cliente WhatsApp',
      customerPhone: session.client?.phone || '',
      deliveryType: session.deliveryType,
      address: session.client?.address,
      items: session.items,
      subtotal,
      deliveryFee: session.deliveryFee,
      total,
      paymentMethod: session.paymentMethod || 'PIX',
      cashChangeFor: session.cashChangeFor
    };

    try {
      const confirmation = await GastroFoodService.submitOrder(orderPayload, tenantId);
      session.step = 'ORDER_PLACED';
      session.lastOrderId = confirmation.orderId;
      await this.saveSession(session);

      let msg = `🎉 **Pedido Confirmado com Sucesso!**\n\n` +
        `📦 **Número do Pedido:** ${confirmation.displayNumber || confirmation.orderId}\n` +
        `⏱️ **Tempo Estimado:** ${confirmation.estimatedTime}\n` +
        `💰 **Valor Total:** R$ ${total.toFixed(2)}\n` +
        `💳 **Pagamento:** ${session.paymentMethod}\n\n`;

      if (session.paymentMethod === 'PIX' && confirmation.pixCode) {
        msg += `🔑 **Chave Copia e Cola PIX:**\n\`${confirmation.pixCode}\`\n\n` +
          `Assim que o pagamento for identificado, seu pedido entrará em produção imediatamente!`;
      } else {
        msg += `Seu pedido já foi enviado para a cozinha! Acompanharemos o status por aqui. Obrigado pela preferência! 😊`;
      }

      return {
        responseText: msg,
        isFinalized: true,
        confirmation,
        session
      };
    } catch (err: any) {
      console.error('[OrderFlowManager.finalizeOrder] Erro ao submeter pedido:', err);
      return {
        responseText: `Recebemos sua solicitação de pedido! Nossa equipe foi notificada e vai confirmar os detalhes com você em instantes.`,
        isFinalized: true,
        session
      };
    }
  }

  /**
   * Adiciona itens ao carrinho da sessão
   */
  public static async addItem(userId: string, item: OrderItem, tenantId: string): Promise<OrderSession> {
    const session = await this.getSession(userId, tenantId);
    session.items.push(item);
    await this.saveSession(session);
    return session;
  }
}
