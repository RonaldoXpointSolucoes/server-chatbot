import { pipeline } from '@xenova/transformers';
import { supabase } from '../../../../OneDrive/Documentos/Projetos/Antigravity/ChatBoot/server/src/supabase.js';

// Texto bruto do cardápio fornecido pelo usuário
const cardapioText = `
https://www.burguerplus.com.br/loja/burguerplus

MENU DE PRODUTOS BURGUER PLUS:

COMBO PLUS-ALOHA
Prepare-se para uma experiência única: hambúrguer artesanal suculento de carne bovina, servido no pão brioche macio, com queijo cheddar, uma fatia generosa de abacaxi grelhado e o toque especial da nossa geleia apimentada exclusiva. Uma combinação agridoce que vai te conquistar na primeira mordida! Acompanha batata fina crocante 250g e uma Coca-Cola 350ml bem geladinha pra fechar com chave de ouro.
Preço: R$ 57,00

COMBO COSTELA BURGUER
Feito para os apaixonados por sabor! Hambúrguer artesanal de costela prime com 24h de preparo, servido no pão crocante, queijo Catupiry cremoso, alface, tomate fresquinho e finalizado com nosso molho barbecue especial. Acompanha batata crocante e Coca-Cola.
Preço: R$ 60,00

COMBO PLUS AUSTRALIANO
Seu novo combo favorito! Um show de sabor do início ao fim! Hambúrguer artesanal de 150g no pão australiano macio, com mix de queijo prato e catupiry, duas unidades de cebola onions, alface e tomate, bacon e a combinação irresistível dos molhos barbecue e grill. Acompanha batata fina 250g e Coca-Cola 350ml gelada.
Preço: R$ 66,00

COMBO PLUS BACON
Simplesmente viciante! Hambúrguer artesanal de 150g, cheddar fatiado derretendo na carne suculenta, pão de gergelim selado, bacon crocante, ceboa caramelizada no ponto perfeito e molho grill defumado para fechar com chave de ouro. Acompanha batata fina crocante e Coca-Cola 350ml bem gelada. Uma explosão de sabor a cada mordida!
Preço: R$ 59,00

COMBO PLUS SALADA
Leve, saboroso e cheio de frescor! Hambúrguer artesanal de 150g com queijo muçarela derretido, alface crocante, tomate fresco, cebola roxa e nosso molho grill especial, tudo no pão de gergelim selado. Acompanha batata fina crocante e Coca-Cola 350ml gelada. O equilíbrio perfeito entre sabor e leveza!
Preço: R$ 49,00

COMBO PLUS MEGA
Sabor que faz jus ao nome! Hambúrguer artesanal de 150g no pão brioche macio e dourado, com queijo prato derretido, cebola caramelizada, alface fresca, tomate, bacon crocante e nosso irresistível molho grill. Acompanha batata fina crocante e Coca-Cola 350ml gelada. Um combo completo e poderoso!
Preço: R$ 61,00

COMBO PLUS ULTRA
O gigante do sabor! Duas carnes artesanais de 150g, cheddar fatiado derretendo, cebola caramelizada, bacon crocante, alface fresca, tomate e nosso molho grill especial, tudo no pão de gergelim selado. Acompanha batata fina crocante e Coca-Cola 350ml gelada. Potência máxima em cada mordida!
Preço: R$ 68,00

COMBO PLUS DORITOS
Crocrância e sabor em outro nível! Hambúrguer artesanal de 150g com cheddar cremoso derretido, camada generosa de Doritos crocantes, molho grill especial e tudo isso no incrível pão de gergelim vermelho. Acompanha batata fina crocante e Coca-Cola 350ml gelada. Um combo ousado, para quem ama experiências intensas!
Preço: R$ 58,00

COMBO PLUS ITALIANO
Inspirado nos sabores clássicos com um toque especial! Hambúrguer artesanal de 150g no pão francês crocante, com queijo prato derretido, alface fresca, tomate e a combinação perfeita dos molhos grill e tasty. Acompanha batata fina crocante e Coca-Cola 350ml gelada. Um clássico com personalidade única!
Preço: R$ 58,00

COMBO PLUS CHEDDAR
Para os verdadeiros amantes de cheddar! Hambúrguer artesanal de 150g no pão brioche macio, coberto com cheddar cremoso, cebola caramelizada no ponto certo e nosso molho grill especial. Acompanha batata fina crocante e Coca-Cola 350ml gelada. Cremoso, marcante e simplesmente irresistível!
Preço: R$ 51,00

COMBO PLUS BURGUER
Sabor fora do comum com um toque criativo! Hambúrguer artesanal de 150g no pão australiano levemente adocicado, cebola empanada de bacon, e uma mistura cremosa de ovo mexido com nosso exclusivo molho verde, queijo prato derretido, alface, tomate ,finalizado com molho grill especial. Acompanha batata fina crocante e Coca-Cola 350ml gelada. Um combo surpreendente em cada detalhe!
Preço: R$ 67,00

COMBO PLUS CHURRASCO
O sabor autêntico da brasa em um combo irresistível! Corte suculento de contrafilé 150g grelhado no ponto certo, servido no pão italiano crocante com queijo prato derretido, vinagrete fresquinho e nosso molho grill especial. Acompanha batata fina crocante e Coca-Cola 350ml gelada. Um verdadeiro churrasco no pão!
Preço: R$ 56,00

COMBO PLUS VEGANO
Sabor, equilíbrio em um só combo! Hambúrguer vegano de soja grelhado, queijo cheddar vegano, alface crocante, tomate fresco, cebola roxa, picles e pão australiano levemente adocicado,molho grill especial delicioso! Acompanha batata fina crocante e Coca-Cola 350ml gelada. Vegano com muito sabor!
Preço: R$ 56,00

COMBO PLUS VEGETARIANO
Sabor, equilíbrio e personalidade em um só combo! Hambúrguer de soja 150g grelhado, queijo prato e cheddar vegano, alface crocante, tomate fresco, cebola empanada (onions) e pão de gergelim selado, finalizado com nosso molho grill especial. cheio de sabor! Acompanha batata fina crocante e Coca-Cola 350ml gelada.
Preço: R$ 57,00

COMBO PLUS KIDS
Feito para os pequenos, com muito sabor e carinho! Hambúrguer artesanal de 150g no pão brioche macio, queijo prato derretido, ketchup, mostarda e um toque do nosso molho grill especial. Acompanha batata fina crocante e Coca-Cola 350ml gelada. Simples, gostoso e do jeitinho que eles adoram!
Preço: R$ 43,00

COMBO PLUS SIMPLES
Clássico, direto ao ponto e cheio de sabor! Hambúrguer artesanal de 150g com queijo muçarela derretido, molho grill especial e pão de gergelim selado. Acompanha batata fina crocante e Coca-Cola 350ml gelada. Simples, mas feito com excelência!
Preço: R$ 48,00

COMBO PLUS BIG BURGUER - MAIS CARNE, MAIS QUEIJO, MAIS PLUS !
2 hambúrgueres de 150g, queijo prato, bacon, alface, tomate, molho Tasty e molho Grill, servidos no pão italiano. Uma combinação saborosa e completa para quem gosta de um burger generoso.
Preço: R$ 68,00

LANCHES INDIVIDUAIS:

PLUS-ALOHA
Pão brioche, hambúrguer artesanal com carne bovina, queijo cheddar, abacaxi e geleia apimentada.
Preço: R$ 36,00

MONTE SEU LANCHE
Monte seu proprio lanche com diferentes tipos de carne, queijos e complementos !
Preço: A partir de R$ 25,00

COSTELA BURGUER
Uma experiência única! Nossa costela é preparada com técnica de cocção lenta por 12 horas em forno combinado, garantindo maciez extrema e sabor inconfundível. A carne desmancha na boca, com crosta dourada e aroma envolvente de ervas e especiarias.
Preço: De R$ 65,00 por R$ 49,00

PLUS AUSTRALIANO
Hambúrguer artesanal de 150g com queijos Prato e Catupiry, bacon crocante, anéis de cebola, alface, tomate e molhos especiais da casa e barbecue, servido em pão australiano.
Preço: R$ 49,00

LANCHE - PLUS SALADA
Hambúrguer artesanal de 150g com queijo mussarela derretido, cebola roxa fresca, alface e fatias de tomate, servido em pão de gergelim.
Preço: De R$ 30,00 por R$ 29,00

PLUS ITALIANO
Hambúrguer com molho Tasty, alface, tomate e queijo Prato, servido em pão italiano crocante por fora e macio por dentro.
Preço: R$ 37,00

PLUS MEGA
Hambúrguer artesanal de 150g com queijo Prato derretido, bacon crocante, cebola caramelizada, alface, tomate e molho especial, servido em pão brioche.
Preço: De R$ 42,00 por R$ 39,00

PLUS DORITOS
Hambúrguer artesanal de 150g com queijo cheddar, Doritos 25g, servido em pão vermelho clássico com gergelim.
Preço: R$ 37,00

PLUS BACON
Burguer Artesanal 150g - Queijo Cheddar - Bacon - Cebola caramelizada - Pão Clássico com gergelim
Preço: R$ 38,00

PLUS VEGANO
Hambúrguer Vegano - Cebola Roxa - Creme sabor cheddar - picles - tomate - alface - Pão Australiano.
Preço: R$ 35,00

PLUS VEGETARIANO
Hambúrguer vegano de 80g com queijo prato vegano, anéis de cebola, alface, tomate e cheddar vegano, servido em pão clássico
Preço: R$ 37,00

PLUS ULTRA
2 Burguers 150g - Queijo Cheddar - Parmesão - Bacon - Cebola caramelizada - Alface - Tomate - Molho Especial - Pao classico com gergelim
Preço: R$ 52,00

PLUS CHEDDAR
Hambúrguer artesanal de 150g com queijo cheddar derretido e cebola caramelizada, servido em pão brioche.
Preço: R$ 30,00

PLUS BURGUER
Burguer Artesanal, Onios de Bacon, Queijo Cheddar, Molho Especial, Alface, Tomate e cebola caramelizada.
Preço: R$ 48,00

LANCHE - PLUS A PARMEGIANA
Hambúrguer à parmegiana 180g - Queijo Prato - Molho de Tomate - Parmesão Ralado - Pão Clássico
Preço: R$ 45,00

LANCHE - PLUS SIMPLES
Burguer Artesanal 150g - Queijo Mussarela - Pão Clássico
Preço: R$ 27,00

PLUS CHURRASCO
Sanduíche com bife de contrafilé com sabor de churrasco, pão italiano assado e vinagrete.
Preço: R$ 35,00

LANCHE - PLUS KIDS
Burguer Artesanal 100g - Queijo Prato - Ketchup e mostarda - Pao brioche
Preço: R$ 22,00

PLUS BIG BURGUER - MAIS CARNE, MAIS QUEIJO, MAIS PLUS !
Hambúrguer artesanal com duas carnes de 150g, queijo prato derretido, bacon crocante, alface e tomate, combinado com molho tasty e molho grill, servido no pão italiano.
Preço: R$ 56,00

PORÇÕES:

PORÇAO BATATA FINA
Por ser uma batata fina e frita em óleo de algodão ela fica mais sequinha e crocante.
Preço: R$ 17,00

NUGGETS
Preço: R$ 19,00

PORCAO DE ONIOS
Cebola crocante e sequinha frita com óleo de algodão.
Preço: R$ 19,00

PORCAO DE BATATA CRINKLES
Batata sequinha e crocante, frita no óleo de algodão com uma pitada de sal a gosto e páprica.
Preço: R$ 20,00

PORCAO DE BATATA RUSTICA
Batata natural pré cozida no vapor e frita no óleo de algodão, finalizada com um fio de azeite + alho frito.
Preço: R$ 24,00

PORCAO DE SALAME
Salame servido em Fatias Fininhas.
Preço: R$ 24,00

BATATA PAPRIKA E PEPPER
Batata Fininha e crocante com casca, tempero de páprica e pimenta.
Preço: R$ 26,00

MANDIOCA CREMOSA
Preço: R$ 28,00

COXINHA DE FRANGO COM REQUEIJÃO
Crocante por fora, cremosa por dentro. Muito recheio com Frango com requeijão.
Preço: R$ 31,00

PORCAO DE CALABRESA
Acompanha cebola e limão.
Preço: R$ 32,00

BATATA FINA CHEDDAR E BACON
Deliciosa Batata Fina com Cheddar e Bacon.
Preço: R$ 35,00

FRANGO A PASSARINHO
Preço: R$ 44,00

ISCAS DE FRANGO EMPANADAS
Preço: R$ 44,00

CALABRESA COM FRITAS
Preço: R$ 52,00

CONTRA FILÉ PORÇÃO
Preço: R$ 65,00

AÇAÍ:

MONTE SEU SUCO DE AÇAI
Escolha 1 complemento.
Preço: R$ 19,00

MONTE SEU AÇAI OU CUPUAÇU
Escolha até 3 Acompanhamentos Grátis
Preço: A partir de R$ 21,00

AÇAÍ GRANOLA E CUPUAÇU
Açaí, Cupuaçu, Leite condensado, Granola e Banana. 355 ml
Preço: R$ 27,00

AÇAÍ PAÇOCA
Açaí, paçoca e Nutella. 355 ml
Preço: R$ 27,00

AÇAÍ SUFFLAIR
ACAI - SUFLAIR - MIX DE LEITE EM PO COM LEITE CONDENSADO - LEITE EM PO
Preço: R$ 29,00

OVOMALTINE COM SONHO DE VALSA
Açaí, Nutella, Ovomaltine e Sonho de Valsa. 355 ml
Preço: R$ 29,00

AÇAÍ KIT KAT.
Açaí, Nutella, leite em pó e Kit Kat. 355 ml
Preço: R$ 29,00

ACAÍ KINDER
Açaí, Nutella, 1 Kinder ovo e Amendoim. 355 ml
Preço: R$ 40,00

SOBREMESAS:

PUDIM
Preço: R$ 12,00

TORTA DE LIMÃO
Preço: R$ 13,00

BROWNE
Preço: R$ 21,00

SALADA DE FRUTAS
355 ml - Morango - Banana - Laranja - Manga - Kiwi - Abacaxi - Com leite condensado.
Preço: R$ 22,00

PETIT GATEAU
2 Bolas de sorvete creme - Petit gateau - Calda de chocolate - Morango
Preço: R$ 23,00

OURO BRANCO
Preço: R$ 2,00

SONHO DE VALSA
Preço: R$ 2,00

CHOCOLATE TALENTO AMÊNDOAS E PASSAS 85G
Preço: R$ 3,50

CHOCOLATE TALENTO CASTANHAS-DO-PARÁ 85G
Preço: R$ 3,50

PRESTÍGIO
Preço: R$ 4,00

CHOKITO
Preço: R$ 4,50

KIT KAT
Preço: R$ 5,00

KIT KAT WHITE
Preço: R$ 5,00

SUFLAIR - 50G
Preço: R$ 8,00

KINDER OVO
Preço: R$ 15,00

BEBIDAS:

ÁGUA 500 ML
Preço: A partir de R$ 4,00

DEL VALLE 290 ML
Preço: A partir de R$ 6,00

REFRIGERANTE 350 ML
Preço: R$ 7,00

H2O LIMÃO 500 ML
Preço: R$ 8,00

H2O LIMONETO 500 ML
Preço: R$ 8,00

REFRIGERANTE 600 ML
Preço: A partir de R$ 9,00

REFRIGERANTE 2 L
Preço: A partir de R$ 15,00

AMSTEL 269ML
Preço: R$ 5,00

BRAHMA DUPLO MALTE 350 ML
Preço: R$ 7,00

TONICA ANTARTICA 350 ML
Preço: R$ 7,00

CERV LAGER HEINEKEN LN 330ML
Preço: R$ 9,00

STELLA 310 ML
Preço: R$ 9,00

CORONA
Preço: R$ 9,00

CERVEJA ANTARCTICA ORIGINAL 600ML
Preço: R$ 16,00

HEINEKEN GARRAFA 600ML
Preço: R$ 18,00

RED BULL 250 ML
Preço: R$ 15,00

SUCOS:

SUCO DE LARANJA
Preço: R$ 11,00

SUCO DE MANGA
Preço: R$ 14,00

LIMONADA
Preço: R$ 11,00

SUCO DE MORANGO
Preço: R$ 17,50

SUCO DE AÇAÍ
Preço: R$ 19,00

MILK-SHAKE:

MILK-SHAKE OVOMALTINE
Preço: R$ 24,00

MILK-SHAKE DE MORANGO
Preço: R$ 24,00
`;

// ID da empresa Burguer Plus identificada
const tenantId = '9057ca36-0b29-4fe5-89fb-be5e13387030';

// Configurações do modelo
class EmbeddingsPipeline {
  static task = 'feature-extraction';
  static model = 'Xenova/all-MiniLM-L6-v2';
  static instance = null;

  static async getInstance() {
    if (this.instance === null) {
      this.instance = await pipeline(this.task, this.model, { quantized: true });
    }
    return this.instance;
  }
}

function splitTextIntoChunks(text, chunkSize = 300, overlap = 50) {
  const words = text.split(/\s+/);
  const chunks = [];
  let i = 0;
  while (i < words.length) {
    const chunk = words.slice(i, i + chunkSize).join(' ');
    chunks.push(chunk);
    i += (chunkSize - overlap);
  }
  return chunks;
}

async function run() {
  console.log("Iniciando injeção do cardápio no RAG...");
  try {
    // 1. Cadastra o documento
    const { data: docData, error: docError } = await supabase
      .from('knowledge_documents')
      .insert([{
        tenant_id: tenantId,
        name: 'cardapio_burguer_plus.txt',
        type: 'text/plain',
        status: 'processing',
        metadata: { size: cardapioText.length }
      }])
      .select('*')
      .single();

    if (docError) throw docError;
    const documentId = docData.id;
    console.log(`Documento registrado com ID: ${documentId}`);

    // 2. Fragmenta em chunks
    const chunks = splitTextIntoChunks(cardapioText, 150, 20); // Chunks menores para maior precisão em produtos
    console.log(`Texto dividido em ${chunks.length} chunks.`);

    const transformer = await EmbeddingsPipeline.getInstance();
    const dbChunks = [];

    // 3. Vetoriza e prepara inserção
    for (let i = 0; i < chunks.length; i++) {
      const chunkText = chunks[i];
      if (chunkText.trim().length < 5) continue;

      const output = await transformer(chunkText, { pooling: 'mean', normalize: true });
      const embeddingVector = Array.from(output.data);

      dbChunks.push({
        document_id: documentId,
        tenant_id: tenantId,
        content: chunkText,
        embedding: embeddingVector,
        chunk_index: i
      });
      
      console.log(`Chunk ${i+1}/${chunks.length} vetorizado.`);
    }

    // 4. Salva chunks no banco
    if (dbChunks.length > 0) {
      const { error: chunkError } = await supabase
        .from('knowledge_chunks')
        .insert(dbChunks);
        
      if (chunkError) throw chunkError;
    }

    // 5. Finaliza o status do documento
    const { error: finalError } = await supabase
      .from('knowledge_documents')
      .update({ status: 'ready' })
      .eq('id', documentId);

    if (finalError) throw finalError;

    console.log("Injeção do RAG finalizada com SUCESSO!");
  } catch (err) {
    console.error("Erro na injeção:", err);
  }
}

run();
