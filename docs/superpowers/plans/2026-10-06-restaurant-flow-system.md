# Sistema de Atendimento para Restaurante no Flow Engine & WhatsApp E2E

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar um modelo completo de atendimento para restaurante com 3 fluxos integrados (Cardápio & Pedidos, Status do Pedido, Falar com Atendente), implementar CRUD completo com duplicação/clonagem com 1 clique no FlowManager, aprimorar o FlowEngine para suporte nativo a `typebot_group` e blocos no backend com canal FoodNext, e validar a interação conversacional real via WhatsApp entre as caixas FoodNext e Ronaldo-Web.

**Architecture:** 
1. **Frontend (React + Vite + ReactFlow)**: Adicionar capacidade de clonagem e templates de restaurante no `FlowManager.tsx`, garantindo CRUD completo (Create, Read, Update, Delete, Clone) e persistência no Supabase (`flows` e `flow_versions`).
2. **Backend (Node.js FlowEngine + EventProcessor)**: Expandir `server/src/flow-runtime/index.js` para iterar blocos internos de `typebot_group` (`send_message`, `ask`, `buttons`, `condition`, `handoff`), e priorizar a execução do fluxo quando houver conversa ativa ou quando a caixa vinculada receber mensagem gatilho.
3. **E2E Testing Script**: Script automatizado respeitando intervalos de 5s a 10s para simular as 3 situações conversacionais (Ronaldo-Web interagindo como cliente com FoodNext atuando como restaurante).

**Tech Stack:** React 18, ReactFlow / XYFlow, Node.js, Baileys WhatsApp Engine, Supabase PostgreSQL.

---

## Global Constraints
- Isolamento multi-tenant estrito na empresa X-Point Soluções (`tenant_id: 8b1e427b-2321-4ea7-9d7e-90f7d5cbad21`).
- Caixa do Restaurante: FoodNext (`id: cc4efe36-f391-4b3d-a24c-ddcd8a293cf6`, JID `5511947758860@s.whatsapp.net`).
- Caixa do Cliente de Teste: Ronaldo-Web (`id: 5c78d358-d449-41c4-b396-a04ab20a39e4`, JID `5511975960999@s.whatsapp.net`).
- Intervalo obrigatório de 5s a 15s entre envios para evitar qualquer bloqueio ou spam do WhatsApp.
- Preservação de versionamento de dígito único caso haja deploy.

---

## Tasks

### Task 1: Engine Backend - Suporte a `typebot_group` e Priorização no EventProcessor
- [ ] Implementar suporte a grupos de blocos (`typebot_group`) em `server/src/flow-runtime/index.js`.
- [ ] Suportar blocos: `send_message`, `ask`, `buttons`, `set_variable`, `handoff`, `condition`.
- [ ] Em `server/src/event-processor/index.js`: Priorizar o `FlowEngine` quando o contato estiver com estado ativo no bot (`BOT_ACTIVE`) ou quando a mensagem bater com os gatilhos dos fluxos da empresa.

### Task 2: Frontend - CRUD Completo e Recurso de Clonar / Templates no FlowManager
- [ ] Implementar botão "Clonar Fluxo" (Duplicar) em `src/pages/FlowManager.tsx` com duplicação dos nós e arestas da versão ativa.
- [ ] Implementar botão "Template Restaurante Completo" para criar instantaneamente o fluxo mestre de restaurante com 3 ramificações.
- [ ] Atualizar editor `src/pages/FlowBuilder.tsx` para assegurar que salvar/publicar preserve a integridade dos grupos e blocos.

### Task 3: Criação do Modelo de Restaurante com os 3 Fluxos na Empresa X-Point Soluções
- [ ] Criar no Supabase na empresa X-Point Soluções o fluxo:
  - **Restaurante Master - Autoatendimento**:
    - Menu com 3 opções claras (1: Cardápio & Fazer Pedido, 2: Status do Pedido, 3: Falar com Atendente).
    - Ramificação 1: Cardápio digital, seleção Delivery/Retirada e confirmação.
    - Ramificação 2: Consulta e acompanhamento de status do pedido.
    - Ramificação 3: Transferência para operador humano com handoff.
  - Gatilhos: `oi`, `olá`, `ola`, `cardapio`, `cardápio`, `menu`, `pedido`, `atendente`.

### Task 4: Script de Teste Conversacional E2E Real entre FoodNext e Ronaldo-Web
- [ ] Criar script `server/scripts/test_restaurant_flow_e2e.cjs` utilizando a API Baileys da FoodNext e Ronaldo-Web.
- [ ] Testar Situação 1: Enviar "olá" de Ronaldo-Web -> FoodNext responde com menu -> Ronaldo-Web escolhe "1" -> FoodNext envia cardápio.
- [ ] Testar Situação 2: Ronaldo-Web envia "2" -> FoodNext solicita e informa status do pedido.
- [ ] Testar Situação 3: Ronaldo-Web envia "3" -> FoodNext transfere para atendente humano.
- [ ] Validar intervalos de 5 a 10 segundos entre cada mensagem, verificando IDs oficiais da Baileys.
