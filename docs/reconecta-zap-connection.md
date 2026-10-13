# Conexão do ReconectaZap

O aplicativo `apps/reconecta-zap` e o painel `/instance-manager` usam o mesmo SessionManager Node/Baileys e o Supabase do ChatBoot. O aplicativo resolve o servidor pelo `assigned_node_id` da instância.

## Causa corrigida em 13/10/2026

A tela renovava o QR a cada 25 segundos usando `POST /connect?force_new=true`. O Node encerrava o socket, apagava as credenciais e iniciava outra sessão. A AllForno registrou sincronização de chaves às 16:36:03, seguida por nova emissão de QR às 16:36:19. Uma aba antiga podia interromper o pareamento iniciado por outra.

## Invariantes

- A emissão e a rotação do QR pertencem ao Baileys. O prazo inicial é 60 segundos e os seguintes 20 segundos, conforme o socket vendorizado.
- Atualizar o QR consulta `GET /status`. O contador nunca dispara `POST /connect`.
- `POST /connect` é idempotente enquanto existir socket ativo, inicialização ou autenticação. O parâmetro antigo `force_new` não apaga um dispositivo pareado.
- Uma leitura ou sincronização de chaves esconde o QR anterior e protege o handshake, incluindo o reinício `515` solicitado pelo WhatsApp.
- Credenciais com identidade persistida são preservadas na recuperação de conexão. Limpeza de sessão não deve ser inferida de `offline`, timeout HTTP ou pedido de atualização de QR.
- Eventos tardios de um socket substituído não podem alterar a sessão atual.
- Atualizações de credenciais após o evento `open` não podem retornar a interface para sincronização.
- HTTP `202` confirma a aceitação da solicitação pelo Node. Conectado exige identidade, socket aberto e autenticação confirmada pelo Baileys.

## Observabilidade

`status`, `connect`, `pairing-code` e `connection-logs` fornecem diagnósticos de fase, tentativa, duração, QR, socket, autenticação, servidor e último encerramento. Cada evento persistido em `system_logs` inclui `attemptId`, `requestId`, fase e duração. Códigos QR, pairing codes, chaves e credenciais não devem entrar nos logs.

Os logs de encerramento incluem também os transitórios. `515` indica reinício com credenciais preservadas; o término da espera pelo QR exige nova tentativa deliberada. Erros HTTP/rede ficam separados do encerramento do Baileys.

## Validação

Executar `node --test server/tests/connection-lifecycle.test.mjs`, os builds das duas telas e o Quality Gate E2E de homologação antes de promover o backend. Em produção, a leitura pelo celular é necessária para comprovar um novo pareamento; QR exibido sozinho não comprova conexão. Confirmar a mesma tentativa durante a leitura, autenticação real e status convergente no painel central e ReconectaZap.
