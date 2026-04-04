# Arquitetura SaaS e Multi-Tenant (ChatBoot)

Este documento dita as diretrizes fundamentais e arquiteturais para que a Inteligência Artificial e a equipe técnica baseiem o desenvolvimento deste projeto. 
Trata-se de um software as a Service (SaaS) Multi-Tenant.

## 1. Princípios de Multi-Tenant
- A base de dados principal está no PostgreSQL no Supabase.
- A tabela-mestre de governança é a tabela `companies`. O ID de uma `company` equivale ao `tenant_id` usado globalmente (seja nas edge functions ou no frontend).
- **Regra de Ouro:** Todas as tabelas que retêm dados pertencentes ao usuário (como `contacts` e `messages`) **devem possuir um campo `tenant_id`**.
- Toda consulta (SELECT/UPDATE/DELETE) efetuada fora da interface Administrativa Mestre (`/admin`) **obrigatoriamente deve conter `.eq('tenant_id', current_tenant_id)`**. A exceção são as regras de RLS do Supabase que já abstraem isso.

## 2. Acesso à Área de Administração
A plataforma contém um Painel Mestre localizado nativamente em `/admin`.
- Ele governa os SLAs, faturamento e as contas da tabela `companies`.
- O login para esse painel é hardcoded: `ronaldo.xpointsolucoes@gmail.com` com senha restrita.
- Nenhuma companhia pode enxergar ou ter acesso a telas da administração mestre.

## 3. Fluxo de Licenciamento (Billing & Access Barrier)
- As empresas assinam um `plan` (plano) gerido na tabela `plans`.
- Se um pagamento for marcado como vencido (`overdue`), ou o atributo geral de acesso estiver fora de contexo, a UI principal dos Clientes (`/chat`) implementará uma barreira limitadora (High-Order Component: Protector Barrier), que vai esconder toda a UI e bloquear os serviços WS da Evolution.
- A regra de status da tabela de empresa é:
  - `active`: Pagamentos em dia.
  - `trial`: Teste em andamento, verificação via campo `trial_ends_at`.
  - `suspended`: Bloqueio automático ou falta de pagamento. Acesso revogado.

## 4. Estilo Visual (UI/UX Premium)
Toda a UI (especialmente as novas páginas de /admin e criação de empresas) deverão obedecer regras de Premium UI:
- Vidro e minimalismo (Glassmorphism), sombras sutis, cores coesas.
- Arredondamento agressivo (2xl a 4xl nas bordas) para dar aparência ultramoderna de software.
- Botões que saltam à visão com efeitos de micro-animação (usando hover: e active: do tailwind).
- Uso contínuo de biblioteca `lucide-react` para iconografia unificada.

## 5. Setup Padrão de Uma Empresa (Tenant)
Quando o administrador criar uma nova Empresa, a UI deve:
1. Cadastrar dados empresariais nome/telefone em `companies`.
2. Registrar o ID do Plano vinculado (`plan_id`).
3. Registrar a string de instância da Evolution (`evolution_api_instance`) a qual este Tenant responde. 
   O webhook fará bind exato a essa string vindo no campo `"instance"` da API remota da Evolution.
