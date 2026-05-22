# Changelog

## [2.5.7] - 2026-05-21

### Adicionado
- **Deploy em Produção (v2.5.7)**: Correção cirúrgica de balanceamento de tags na estrutura de lista de contatos do chat para evitar erros de renderização (*Adjacent JSX elements*) e deploy oficial do aplicativo frontend na nuvem da Vercel.

## [2.5.6] - 2026-05-21

### Adicionado
- **Deploy em Produção (v2.5.6)**: Atualização incremental da aplicação em produção com toda a segurança, controle de auditoria de versão no Supabase e build robusta no pipeline oficial da Vercel.

## [2.5.5] - 2026-05-21

### Adicionado
- **Snooze Premium (Adiar Conversas)**: Integração robusta (frontend React + banco Supabase + servidor Node no Coolify executando monitoramento contínuo de 30 segundos) para adiar contatos e reabrir na tela no horário exato.
- **Exibição Condicional de Empresa ou Celular**: Exibição dinâmica no cabeçalho. Mostra botão "Ver Empresa" se o contato possuir empresa associada, ou badge azul translúcida premium com o telefone formatado nacionalmente e botão de cópia rápida com feedback tátil de 2 segundos.
- **Melhoria Técnica de Compilação Estática**: Rigorosa validação estática de tipos do compilador TypeScript (`npx tsc --noEmit`) resultando em zero erros no projeto.
- **Controle Dinâmico de Versão (Header)**: Indicador de versão dinâmico sincronizado nos cantos superiores esquerdos de `ChatDashboard` e `AdminDashboard`.

### Corrigido
- **Correção no Envio (Enter)**: Ajuste fino para desativar envio por enter apenas em telas mobile estritas (largura menor que 500px), permitindo que em resoluções maiores o enter funcione normalmente para enviar.

## [2.5.3] - 2026-05-20

### Adicionado
- **Deploy em Produção**: Deploy oficial do frontend no ambiente Vercel com todas as correções de estabilidade acumuladas.

## [2.5.2] - 2026-05-20

### Corrigido
- **Persistência de Fechamento de Tickets em Lote (Bug do F5)**: Corrigido o erro HTTP 400 Bad Request que ocorria ao atualizar o status de muitas conversas de uma só vez. Agora o update na tabela `conversations` do Supabase é executado em chunks (lotes) de no máximo 100 IDs por vez.
- **Desfazer Fechamento de Tickets**: O comando de rollback do fechamento em lote (`undoLastBatchResolve`) também foi refatorado para processar atualizações em chunks de 100 IDs, evitando falhas silenciosas na reabertura.
- **Realtime Sync e Reabertura**: Validado o comportamento onde o operador visualiza imediatamente o fechamento ou reabertura automática de tickets gerada por novas interações ou mensagens inbound de clientes, sincronizado em tempo real.
