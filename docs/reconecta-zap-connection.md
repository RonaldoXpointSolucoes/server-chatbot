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

## Continuação do diagnóstico: reinício após leitura

Na tentativa `d01e4690-195c-4b70-be41-e8c625d8a589`, o celular entregou credenciais às 20:46:40 UTC. Uma consulta de status removeu da RAM o socket fechado antes do evento nativo de reinício; o guard de propriedade descartou sua continuação. O watchdog encerrou a tentativa às 20:47:16, mas o diagnóstico continuou em autenticação. O supervisor também reciclava sockets de QR abertos porque sua verificação exigia identidade antes de ela existir.

Em 7.8.4, `getSocket` é uma leitura sem remoções. O listener nativo continua responsável pelo encerramento e pela recuperação 515. Os supervisores distinguem transporte aberto de autenticação, respeitam atividade recente de handshake e registram o timeout como falha recuperável. Os testes reproduzem status polling antes do close, QR sem identidade e timeout depois da margem de autenticação. Credenciais e chaves não são apagadas.

O ReconectaZap 1.0.2 mantém um painel lateral visível de eventos, com assinatura de inserções e consulta de segurança a cada 2,5 segundos, identificação da fonte e horário da última atualização. Falhas de consulta mantêm os eventos anteriores e indicam indisponibilidade. O painel aparece abaixo da conexão em telas estreitas.

Um diagnóstico explícito `idle`, `error` ou `expired` prevalece sobre `CONNECTED_PENDING_SYNC` persistido. Essa proteção é compartilhada pelas telas de conexão em 1.0.3 / 7.8.7.

O teste em produção com QR ativo revelou que o snapshot do gateway ainda utilizava uma verificação que exigia identidade. Em 7.8.5 o gateway compartilha `sessionConnectionDiagnostics`, que usa transporte para `wsOpen` e confirma autenticação separadamente. Validar `force_new` durante QR ativo, além do teste com sessão autenticada.
