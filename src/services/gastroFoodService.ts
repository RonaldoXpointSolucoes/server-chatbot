import { supabase } from './supabase';

export interface ClientData {
  id?: string | number;
  name?: string;
  phone?: string;
  document?: string;
  email?: string;
  address?: AddressData;
  raw?: any;
}

export interface ClientRegistrationData {
  name: string;
  phone: string;
  document?: string;
  email?: string;
  address?: AddressData;
}

export interface AddressData {
  cep?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  formattedAddress?: string;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface DeliveryInfo {
  fee: number;
  estimatedMinutes?: number;
  distanceKm?: number;
  available?: boolean;
}

export interface OrderItem {
  id: string | number;
  name: string;
  quantity: number;
  price: number;
  observations?: string;
  options?: Array<{
    id: string | number;
    name: string;
    price: number;
  }>;
}

export interface OrderPayload {
  customerId?: string | number;
  customerName: string;
  customerPhone: string;
  deliveryType: 'DELIVERY' | 'TAKEOUT' | 'DINE_IN';
  address?: AddressData;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  discount?: number;
  total: number;
  paymentMethod: 'PIX' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'CASH';
  cashChangeFor?: number;
  notes?: string;
  storeId?: string;
}

export interface OrderConfirmation {
  success: boolean;
  orderId?: string | number;
  displayNumber?: string;
  status: string;
  pixQrCode?: string;
  pixCode?: string;
  estimatedTime?: string;
  message?: string;
  raw?: any;
}

export interface MenuItem {
  id: string | number;
  groupId: string | number;
  name: string;
  description?: string;
  price: number;
  image?: string;
  active: boolean;
  steps?: any[];
}

export class GastroFoodService {
  private static apiBaseUrl = import.meta.env.VITE_WHATSAPP_ENGINE_URL?.trim() || window.location.origin;

  /**
   * Obtém as credenciais e URLs configuradas para o tenant no Supabase
   */
  private static async getTenantSettings(tenantId?: string): Promise<Record<string, any>> {
    try {
      const resolvedTenantId = tenantId || localStorage.getItem('current_tenant_id') || 'default';
      const { data: tenant } = await supabase
        .from('tenants')
        .select('settings')
        .eq('id', resolvedTenantId)
        .maybeSingle();

      return tenant?.settings || {};
    } catch (e) {
      console.warn('[GastroFoodService] Falha ao recuperar configurações do tenant:', e);
      return {};
    }
  }

  /**
   * Helper genérico para disparar requisições para a API do GastroFood via Proxy Backend
   */
  private static async callGastroFoodProxy(url: string, token: string, payload: any, method: string = 'POST') {
    if (!url) {
      throw new Error('URL do endpoint GastroFood não configurada.');
    }

    const response = await fetch(`${this.apiBaseUrl}/api/v1/utils/test-cardapio`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url,
        token: token || '',
        payload: payload || {},
        method
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Erro na comunicação com GastroFood (${response.status}): ${errText}`);
    }

    return await response.json();
  }

  /**
   * 1. Consulta de Cliente por Telefone
   */
  public static async checkClient(phoneNumber: string, tenantId?: string): Promise<ClientData | null> {
    const settings = await this.getTenantSettings(tenantId);
    const url = settings.cliente_json_url || 'https://api.gastrofood.com.br/v6/server/nuvem/ProdutoPdvService/ClientePorTelefone';
    const token = settings.cliente_json_token || '';

    // Sanitiza o número para manter apenas dígitos
    const cleanPhone = phoneNumber.replace(/\D/g, '');

    try {
      const result = await this.callGastroFoodProxy(url, token, {
        ATelefone: cleanPhone,
        AIdStore: settings.gfood_store_id
      });

      if (result && result.status === 200 && result.data) {
        const d = result.data;
        return {
          id: d.id || d.Id || d.IdCliente || cleanPhone,
          name: d.nome || d.Nome || d.name || '',
          phone: d.telefone || d.Telefone || cleanPhone,
          document: d.cpf || d.Cpf || '',
          email: d.email || d.Email || '',
          address: {
            cep: d.cep || d.Cep || '',
            street: d.endereco || d.Endereco || d.logradouro || '',
            number: d.numero || d.Numero || '',
            complement: d.complemento || d.Complemento || '',
            neighborhood: d.bairro || d.Bairro || '',
            city: d.cidade || d.Cidade || '',
            state: d.uf || d.Uf || 'SP'
          },
          raw: d
        };
      }
      return null;
    } catch (err: any) {
      console.warn(`[GastroFoodService.checkClient] Cliente não encontrado ou erro:`, err.message);
      return null;
    }
  }

  /**
   * 2. Cadastro de Novo Cliente
   */
  public static async registerClient(clientData: ClientRegistrationData, tenantId?: string): Promise<ClientData> {
    const settings = await this.getTenantSettings(tenantId);
    const url = settings.cadastro_cliente_json_url || 'https://api.gastrofood.com.br/v6/server/nuvem/ProdutoPdvService/CadastrarCliente';
    const token = settings.cadastro_cliente_json_token || '';

    const payload = {
      ANome: clientData.name,
      ATelefone: clientData.phone.replace(/\D/g, ''),
      ACpf: clientData.document || '',
      AEmail: clientData.email || '',
      ACep: clientData.address?.cep || '',
      AEndereco: clientData.address?.street || '',
      ANumero: clientData.address?.number || '',
      AComplemento: clientData.address?.complement || '',
      ABairro: clientData.address?.neighborhood || '',
      ACidade: clientData.address?.city || '',
      AUf: clientData.address?.state || 'SP',
      AIdStore: settings.gfood_store_id
    };

    const result = await this.callGastroFoodProxy(url, token, payload);
    if (result.status === 200) {
      return {
        id: result.data?.id || result.data?.Id || clientData.phone,
        name: clientData.name,
        phone: clientData.phone,
        document: clientData.document,
        email: clientData.email,
        address: clientData.address,
        raw: result.data
      };
    }

    throw new Error(result.data?.message || 'Falha ao cadastrar cliente no GastroFood.');
  }

  /**
   * 3. Consulta de Endereço por CEP
   */
  public static async queryCEP(cep: string, tenantId?: string): Promise<AddressData> {
    const settings = await this.getTenantSettings(tenantId);
    const url = settings.cep_json_url || 'https://api.gastrofood.com.br/v6/server/nuvem/ProdutoPdvService/BuscarCep';
    const token = settings.cep_json_token || '';

    const cleanCep = cep.replace(/\D/g, '');

    try {
      const result = await this.callGastroFoodProxy(url, token, {
        ACep: cleanCep,
        AIdStore: settings.gfood_store_id
      });

      if (result && result.status === 200 && result.data) {
        const d = result.data;
        return {
          cep: cleanCep,
          street: d.logradouro || d.endereco || d.Logradouro || d.Endereco || '',
          neighborhood: d.bairro || d.Bairro || '',
          city: d.cidade || d.Cidade || '',
          state: d.uf || d.Uf || 'SP',
          formattedAddress: `${d.logradouro || d.endereco || ''}, ${d.bairro || ''}, ${d.cidade || ''} - ${d.uf || 'SP'}`
        };
      }
    } catch (err) {
      console.warn('[GastroFoodService.queryCEP] Erro no endpoint Gastrofood, usando fallback ViaCEP');
    }

    // Fallback nativo via ViaCEP
    const viaCepRes = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
    if (viaCepRes.ok) {
      const data = await viaCepRes.json();
      if (!data.erro) {
        return {
          cep: cleanCep,
          street: data.logradouro || '',
          neighborhood: data.bairro || '',
          city: data.localidade || '',
          state: data.uf || 'SP',
          formattedAddress: `${data.logradouro}, ${data.bairro}, ${data.localidade} - ${data.uf}`
        };
      }
    }

    throw new Error('CEP não localizado.');
  }

  /**
   * 4. Consulta de Geolocalização (Lat/Lon)
   */
  public static async getGeolocation(address: AddressData, tenantId?: string): Promise<LatLng> {
    const settings = await this.getTenantSettings(tenantId);
    const url = settings.geoloc_json_url || 'https://api.gastrofood.com.br/v6/server/nuvem/ProdutoPdvService/BuscarCoordenadas';
    const token = settings.geoloc_json_token || '';

    const query = `${address.street || ''}, ${address.number || ''} - ${address.neighborhood || ''}, ${address.city || ''} - ${address.state || 'SP'}`;

    try {
      const result = await this.callGastroFoodProxy(url, token, {
        AEndereco: query,
        ACep: address.cep || '',
        AIdStore: settings.gfood_store_id
      });

      if (result && result.status === 200 && result.data) {
        return {
          lat: Number(result.data.latitude || result.data.lat || result.data.Latitude),
          lng: Number(result.data.longitude || result.data.lng || result.data.Longitude)
        };
      }
    } catch (e) {
      console.warn('[GastroFoodService.getGeolocation] Erro ao obter coordenadas:', e);
    }

    return { lat: 0, lng: 0 };
  }

  /**
   * 5. Cálculo de Taxa e Tempo de Entrega
   */
  public static async calculateDeliveryFee(
    origin: LatLng | AddressData,
    destination: LatLng | AddressData,
    tenantId?: string
  ): Promise<DeliveryInfo> {
    const settings = await this.getTenantSettings(tenantId);
    const url = settings.taxa_entrega_json_url || 'https://api.gastrofood.com.br/v6/server/nuvem/ProdutoPdvService/CalcularTaxaEntrega';
    const token = settings.taxa_entrega_json_token || '';

    try {
      const result = await this.callGastroFoodProxy(url, token, {
        Origem: origin,
        Destino: destination,
        AIdStore: settings.gfood_store_id
      });

      if (result && result.status === 200 && result.data) {
        return {
          fee: Number(result.data.taxa || result.data.valor || result.data.Taxa || 0),
          estimatedMinutes: Number(result.data.tempoEstimado || result.data.tempo || 45),
          distanceKm: Number(result.data.distancia || result.data.km || 0),
          available: result.data.disponivel !== false
        };
      }
    } catch (e) {
      console.warn('[GastroFoodService.calculateDeliveryFee] Erro no cálculo de frete:', e);
    }

    return { fee: 5.00, estimatedMinutes: 45, available: true };
  }

  /**
   * 6. Envio e Finalização de Pedido (FinalizeOrder)
   */
  public static async submitOrder(orderData: OrderPayload, tenantId?: string): Promise<OrderConfirmation> {
    const settings = await this.getTenantSettings(tenantId);
    const url = settings.pedido_json_url || 'https://api.gastrofood.com.br/v6/server/nuvem/ProdutoPdvService/FinalizeOrder';
    const token = settings.pedido_json_token || '';

    const payload = {
      ...orderData,
      AIdStore: settings.gfood_store_id || orderData.storeId
    };

    const result = await this.callGastroFoodProxy(url, token, payload);
    if (result && (result.status === 200 || result.status === 201)) {
      const d = result.data || {};
      return {
        success: true,
        orderId: d.id || d.Id || d.numeroPedido || String(Date.now()),
        displayNumber: d.numeroExibicao || d.displayNumber || `#${String(Date.now()).slice(-4)}`,
        status: 'CONFIRMED',
        pixQrCode: d.pixQrCode || d.qrCode,
        pixCode: d.pixCopiaCola || d.pixCode,
        estimatedTime: d.tempoEstimado || '40-50 min',
        message: 'Pedido enviado com sucesso para a cozinha!',
        raw: d
      };
    }

    throw new Error(result?.data?.message || 'Erro ao enviar pedido para o GastroFood.');
  }

  /**
   * 7. Consulta de Status de Pedido
   */
  public static async getOrderStatus(orderId: string | number, tenantId?: string): Promise<any> {
    const settings = await this.getTenantSettings(tenantId);
    const url = settings.status_pedido_json_url || 'https://api.gastrofood.com.br/v6/server/nuvem/ProdutoPdvService/StatusPedido';
    const token = settings.status_pedido_json_token || '';

    return await this.callGastroFoodProxy(url, token, {
      AIdPedido: orderId,
      AIdStore: settings.gfood_store_id
    });
  }

  /**
   * 8. Geração de Pagamento PIX Dinâmico
   */
  public static async generatePix(orderId: string | number, amount: number, tenantId?: string): Promise<{ qrCode: string; copyPaste: string }> {
    const settings = await this.getTenantSettings(tenantId);
    const url = settings.pagamento_pix_json_url || 'https://api.gastrofood.com.br/v6/server/nuvem/ProdutoPdvService/GerarPix';
    const token = settings.pagamento_pix_json_token || '';

    const result = await this.callGastroFoodProxy(url, token, {
      AIdPedido: orderId,
      AValor: amount,
      AIdStore: settings.gfood_store_id
    });

    return {
      qrCode: result.data?.qrCode || result.data?.imagemQrCode || '',
      copyPaste: result.data?.copiaCola || result.data?.chavePix || result.data?.pixCode || ''
    };
  }

  /**
   * 9. Obtenção do Cardápio Mapeado (Supabase / API)
   */
  public static async getMenu(tenantId?: string): Promise<MenuItem[]> {
    const resolvedTenantId = tenantId || localStorage.getItem('current_tenant_id') || 'default';
    const { data: dbProdutos, error } = await supabase
      .from('cardapio_produtos')
      .select('*')
      .eq('tenant_id', resolvedTenantId)
      .eq('ativo', true)
      .order('name', { ascending: true });

    if (error || !dbProdutos || dbProdutos.length === 0) {
      return [];
    }

    return dbProdutos.map(p => ({
      id: p.id,
      groupId: p.grupo_id,
      name: p.name,
      description: p.description,
      price: Number(p.price),
      image: p.image,
      active: p.ativo
    }));
  }
}
