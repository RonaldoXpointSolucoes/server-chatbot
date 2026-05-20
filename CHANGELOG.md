# Changelog

## [2.5.2] - 2026-05-20

### Corrigido
- **Persistência de Fechamento de Tickets em Lote (Bug do F5)**: Corrigido o erro HTTP 400 Bad Request que ocorria ao atualizar o status de muitas conversas de uma só vez. Agora o update na tabela `conversations` do Supabase é executado em chunks (lotes) de no máximo 100 IDs por vez.
- **Desfazer Fechamento de Tickets**: O comando de rollback do fechamento em lote (`undoLastBatchResolve`) também foi refatorado para processar atualizações em chunks de 100 IDs, evitando falhas silenciosas na reabertura.
- **Realtime Sync e Reabertura**: Validado o comportamento onde o operador visualiza imediatamente o fechamento ou reabertura automática de tickets gerada por novas interações ou mensagens inbound de clientes, sincronizado em tempo real.
