// Templates oficiais de fluxos para o FlowBuilder do ChatBoot
export interface FlowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  badge?: string;
  icon: string;
  data: any;
}

export const OFFICIAL_FLOW_TEMPLATES: FlowTemplate[] = [
  {
    id: 'burguerplus',
    name: 'Burguer Plus (Oficial)',
    description: 'Fluxo completo de Hamburgueria com verificação de horário de loja aberta/fechada via webhook, menu com condições 1 a 5, avaliação Google e desvios de atendimento.',
    category: 'Restaurante & Delivery',
    badge: 'Recomendado',
    icon: '🍔',
    data: {
      "version": "6",
      "id": "huy45u5m6e7pyetvnax5yn8f",
      "name": "burguerplus",
      "events": [
        {
          "id": "tdxnbxeb0yfmtfqwkng6rbwc",
          "outgoingEdgeId": "dwzehe1h1x52quurkkp9jftj",
          "graphCoordinates": { "x": -3935.91, "y": -3973.72 },
          "type": "start"
        }
      ],
      "groups": [
        {
          "id": "kn417yxpz8vsugvx87bpzhju",
          "title": "1 - 2 - Acesso ao cardapio",
          "graphCoordinates": { "x": -2786.03, "y": -2710.44 },
          "blocks": [
            {
              "id": "tavvf78gu2ztkignv2vmokzu",
              "type": "text",
              "content": {
                "richText": [
                  { "type": "p", "children": [{ "text": "😃🍔🍟Click abaixo e faça seu pedido" }] },
                  { "type": "p", "children": [{ "text": "" }] },
                  { "type": "p", "children": [{ "text": "Aqui… 👇🏻👇🏻👇🏻👇🏻" }] },
                  { "type": "p", "children": [{ "text": "{{cardapio}}" }] }
                ]
              }
            }
          ]
        },
        {
          "id": "b7jkdkjwgfn7mgatrisa3dty",
          "title": "Menu",
          "graphCoordinates": { "x": -3326.5, "y": -2537.33 },
          "blocks": [
            {
              "id": "lzjn0mp09qcvj8weck4v2dmg",
              "type": "text input",
              "options": {
                "labels": { "placeholder": "NumeroMenu", "button": "Send" },
                "variableId": "vx5jnk5x9a3kehrkeo939y95v",
                "isLong": false
              }
            },
            {
              "id": "vfcu2mjjlcxufqqc4oxtj7np",
              "outgoingEdgeId": "nl2p1ga2aqznoddmvd58onw6",
              "type": "Condition",
              "items": [
                {
                  "id": "i4jw3hzzdy364zeahigx4oc8",
                  "outgoingEdgeId": "tnv3ydcsptrts55ed4iojab8",
                  "content": {
                    "logicalOperator": "AND",
                    "comparisons": [
                      {
                        "id": "qkrr6r8ui4zal80x14qfvvfv",
                        "variableId": "vx5jnk5x9a3kehrkeo939y95v",
                        "comparisonOperator": "Equal to",
                        "value": "1"
                      }
                    ]
                  }
                },
                {
                  "id": "k41n98n2nfjyr8ixaehkj0ek",
                  "outgoingEdgeId": "v70j004d6jqxxjngpl3dd2pz",
                  "content": {
                    "logicalOperator": "AND",
                    "comparisons": [
                      {
                        "id": "a4anxvbpzjpqnllc39cmkakt",
                        "variableId": "vx5jnk5x9a3kehrkeo939y95v",
                        "comparisonOperator": "Equal to",
                        "value": "2"
                      }
                    ]
                  }
                },
                {
                  "id": "ptw4su1tonpepklqz0sjlc20",
                  "outgoingEdgeId": "gp9xjcl45k66r6uj1gxijb92",
                  "content": {
                    "logicalOperator": "AND",
                    "comparisons": [
                      {
                        "id": "ysuec35ltvy5lbmgpcl63cpi",
                        "variableId": "vx5jnk5x9a3kehrkeo939y95v",
                        "comparisonOperator": "Equal to",
                        "value": "3"
                      }
                    ]
                  }
                },
                {
                  "id": "msxpvosm8zzp68ek9wxvg4mn",
                  "outgoingEdgeId": "zd5hj4ru33e0io0syo3awfq2",
                  "content": {
                    "comparisons": [
                      {
                        "id": "ja7hzea2r1rxw4zodxoclckt",
                        "variableId": "vx5jnk5x9a3kehrkeo939y95v",
                        "comparisonOperator": "Equal to",
                        "value": "4"
                      }
                    ]
                  }
                },
                {
                  "id": "up4epkba9xs1gt1u6wf0h59p",
                  "outgoingEdgeId": "pxz3dvcdjcpo9j18kk4lhh53",
                  "content": {
                    "comparisons": [
                      {
                        "id": "hu2gm2gio6dwwbd1uuf7b0qa",
                        "variableId": "vx5jnk5x9a3kehrkeo939y95v",
                        "comparisonOperator": "Equal to",
                        "value": "5"
                      }
                    ]
                  }
                }
              ]
            }
          ]
        },
        {
          "id": "wxkv5hr1lql9thhnulnsbhny",
          "title": "5 - Horario de Atendimento",
          "graphCoordinates": { "x": -2994.22, "y": -1938.77 },
          "blocks": [
            {
              "id": "bpl3m87ieeqe2zf5eyuzcxpq",
              "outgoingEdgeId": "wkgpkeq1xrke35cxr69c0801",
              "type": "text",
              "content": {
                "richText": [
                  { "type": "p", "children": [{ "text": "Ou para ver nosso cardapio." }] },
                  { "type": "p", "children": [{ "text": "" }] },
                  { "type": "p", "children": [{ "text": "Click Aqui… 👇🏻👇🏻👇🏻👇🏻" }] },
                  { "type": "p", "children": [{ "text": "" }] },
                  { "type": "p", "children": [{ "text": "{{cardapio}}" }] }
                ]
              }
            }
          ]
        },
        {
          "id": "jk2e6krr2k12ixmktf8u89zq",
          "title": "Api Horario",
          "graphCoordinates": { "x": -3877.78, "y": -3586.44 },
          "blocks": [
            {
              "id": "vp5f9lrrht430bkghmandtaw",
              "type": "Webhook",
              "options": {
                "variablesForTest": [],
                "responseVariableMapping": [
                  {
                    "id": "rb5k6edzje5gm8cize8ecqfw",
                    "variableId": "vk3nyesfb6025ki91gryd7x1x",
                    "bodyPath": "data.value"
                  }
                ],
                "isCustomBody": false,
                "webhook": {
                  "queryParams": [],
                  "headers": [],
                  "method": "GET",
                  "url": "https://service.xpointsolucoes.com.br:8443/v6/usuario_2.0/UsuarioService/LojaAberta?e=burguerplus"
                }
              }
            },
            {
              "id": "aa7alrrojdpm0yjio40ba8sm",
              "type": "Set variable",
              "options": {
                "variableId": "vs8v112wvquw1s1t4bh70qt7n",
                "expressionToEvaluate": "Ajuste manualmente os dois GET\nQue verifica se a loja esta abarta \nO que imprime a msg"
              }
            },
            {
              "id": "d9xicjbpg95ts9vyx5qf6kmi",
              "type": "Set variable",
              "options": {
                "variableId": "vk6yjec53ol0r4qg1jz9pnesj",
                "expressionToEvaluate": "burguerplus"
              }
            },
            {
              "id": "e2k4529t30rp85t4cofzksp3",
              "type": "Set variable",
              "options": {
                "variableId": "vy25zp0gnkis4cn0jub1t0tzq",
                "expressionToEvaluate": "Burguer Plus",
                "type": "Custom"
              }
            },
            {
              "id": "myhp7bnlwqwv5mouqgxg2v7c",
              "type": "Set variable",
              "options": {
                "variableId": "vqf6o7l7epwkwe01b5xxcrmuc",
                "expressionToEvaluate": "https://burguerplus.com.br"
              }
            },
            {
              "id": "i95cxjprg5ka3cq1y339edtt",
              "type": "Set variable",
              "options": {
                "variableId": "vsfcu9j7j5hao4xobe0omc2vt",
                "expressionToEvaluate": "https://maps.app.goo.gl/6souriEL2Fnmk9bh8"
              }
            },
            {
              "id": "mclqughbq4m87wc7mb9jgmyq",
              "type": "Set variable",
              "options": {
                "variableId": "vr0g0m3sx7p3q4i1x152r5skt",
                "expressionToEvaluate": "Praça Miguel Ortega, 380 - Parque Assuncao, Taboão da Serra - SP, 06754-160"
              }
            },
            {
              "id": "o6bu2g4aeqr6z03rbzt509xs",
              "type": "Set variable",
              "options": {
                "variableId": "vsri0uq2n42fefunc3u4kow40",
                "expressionToEvaluate": "Segunda a Sabado"
              }
            },
            {
              "id": "briadl10m49gtxlvjg55ua0y",
              "type": "Set variable",
              "options": {
                "variableId": "vw5zx9bwvjdk15f29w1t2o2at",
                "expressionToEvaluate": "11:00h as 22:45h"
              }
            },
            {
              "id": "vxcnwoyfbxzdy1h2q1k0l5u0",
              "type": "Set variable",
              "options": {
                "variableId": "voiaht3ugputcvglx256eq8ev",
                "expressionToEvaluate": "(11) 94321-6659"
              }
            },
            {
              "id": "dz88gx54mx2isq62ytjpt63f",
              "type": "Set variable",
              "options": {
                "variableId": "vpc85uwu7ljrjdz6q11om1yk0",
                "expressionToEvaluate": "{{remoteJid}}"
              }
            },
            {
              "id": "ex0ldht5uzwb3jfgbqpsmxzj",
              "type": "Set variable",
              "options": {
                "variableId": "vq1zcbfnqgaq1t9bsyxqtydso",
                "expressionToEvaluate": "https://www.instagram.com/burguerplusoficial?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw=="
              }
            },
            {
              "id": "irx6j4eelz5v6u46ru3ubs3w",
              "outgoingEdgeId": "z9kdk8al2120l888bmrnr5ul",
              "type": "Condition",
              "items": [
                {
                  "id": "seq8cakk6t2o5s7dep3v8grm",
                  "outgoingEdgeId": "k8jzkfhd5slt76g86rzp7doz",
                  "content": {
                    "logicalOperator": "AND",
                    "comparisons": [
                      {
                        "id": "qul3p0h26tq7f2d87ldhae1d",
                        "variableId": "vk3nyesfb6025ki91gryd7x1x",
                        "comparisonOperator": "Equal to",
                        "value": "true"
                      }
                    ]
                  }
                }
              ]
            }
          ]
        },
        {
          "id": "ycq2b72z73yy123yqrij55we",
          "title": "4 -Endereço",
          "graphCoordinates": { "x": -2520.14, "y": -1929.98 },
          "blocks": [
            {
              "id": "ju5htpzs8a7ac9hoenmr6i6z",
              "type": "text",
              "content": {
                "richText": [
                  { "type": "p", "children": [{ "text": "Aqui neste link voce ja pode abrir no GoogleMaps." }] },
                  { "type": "p", "children": [{ "text": "… 👇🏻👇🏻👇🏻👇🏻" }] },
                  { "type": "p", "children": [{ "text": "{{GoogleMaps}}" }] },
                  { "type": "p", "children": [{ "text": "" }] },
                  { "type": "p", "children": [{ "text": "Endereço:" }] },
                  { "type": "p", "children": [{ "text": "{{EndereçoEmpresa}}" }] }
                ]
              }
            },
            {
              "id": "o49t1vwwxbbtkd5n9t1enej9",
              "outgoingEdgeId": "r8t88s5dva5sg0gtj5oq75pp",
              "type": "text",
              "content": {
                "richText": [
                  { "type": "p", "children": [{ "text": "Ou para ver nosso cardapio." }] },
                  { "type": "p", "children": [{ "text": "" }] },
                  { "type": "p", "children": [{ "text": "Click Aqui… 👇🏻👇🏻👇🏻👇🏻" }] },
                  { "type": "p", "children": [{ "text": "" }] },
                  { "type": "p", "children": [{ "text": "{{cardapio}}" }] }
                ]
              }
            }
          ]
        },
        {
          "id": "pl8f6if2xel62chxgwmocglm",
          "title": "1 - Falar com Atendente",
          "graphCoordinates": { "x": -2846.53, "y": -3027.98 },
          "blocks": [
            {
              "id": "w2ygjw7bx60kln4jwwh5ypkf",
              "type": "Webhook",
              "options": {
                "variablesForTest": [],
                "responseVariableMapping": [
                  {
                    "id": "rb5k6edzje5gm8cize8ecqfw",
                    "variableId": "vr9dc0egxdk4judl1dkto4qav",
                    "bodyPath": "data.value"
                  }
                ],
                "isCustomBody": false,
                "webhook": {
                  "queryParams": [],
                  "headers": [],
                  "method": "GET",
                  "url": "https://api.patoxp.com.br/v6/server/nuvem/GestorPedidosService/EnviarMensagemAtendente?e=burguerplus&d=CAIXA&m=Cliente {{pushName}} no whatsApp Quer ser atendido!&n={{remoteJid}}"
                }
              }
            },
            {
              "id": "xzt60hq6xae644wngktisxi6",
              "type": "text",
              "content": {
                "richText": [
                  { "type": "p", "children": [{ "text": "Ja estamos transferindo para um atendente." }] }
                ]
              }
            }
          ]
        },
        {
          "id": "af4ib2ialri3rymp8r99cahc",
          "title": "Inicio Normal",
          "graphCoordinates": { "x": -3365.62, "y": -3347.48 },
          "blocks": [
            {
              "id": "e96ihp4rxvnouxeb7n24zdj1",
              "outgoingEdgeId": "rkb23u68pk3kk3n4fbhddwt0",
              "type": "text",
              "content": {
                "richText": [
                  { "type": "p", "children": [{ "text": "🌟 Ola, {{pushName}}" }] },
                  { "type": "p", "children": [{ "text": "" }] },
                  { "type": "p", "children": [{ "text": " 𝐃𝐄𝐋𝐈𝐕𝐄𝐑𝐘 𝐎𝐍𝐋𝐈𝐍𝐄 , ℂ𝕝𝕚𝕢𝕦𝕖 𝕒𝕢𝕦𝕚: ⤵" }] },
                  { "type": "p", "children": [{ "text": "" }] },
                  { "type": "p", "children": [{ "text": "{{cardapio}}" }] },
                  { "type": "p", "children": [{ "text": "-----‐--‐------------------------------" }] },
                  { "type": "p", "children": [{ "text": "🅸🅽🅵🅾🆁🅼🅰ÇÕ🅴🆂" }] },
                  { "type": "p", "children": [{ "text": "𝐄𝐬𝐜𝐨𝐥𝐡𝐚 𝐮𝐦𝐚 𝐨𝐩ç𝐚𝐨 ⤵" }] },
                  { "type": "p", "children": [{ "text": "" }] },
                  { "type": "p", "children": [{ "text": "Dɪɢɪᴛᴇ só o ɴᴜ́ᴍᴇʀᴏ;" }] },
                  { "type": "p", "children": [{ "text": "" }] },
                  { "type": "p", "children": [{ "text": "1️⃣ " }, { "text": "Falar com Atendente", "italic": true }, { "text": ": Precisa de ajuda? Estamos aqui para você! 🙋‍♂️" }] },
                  { "type": "p", "children": [{ "text": "" }] },
                  { "type": "p", "children": [{ "text": "2️⃣ " }, { "text": "Fazer Pedido", "italic": true }] },
                  { "type": "p", "children": [{ "text": "" }] },
                  { "type": "p", "children": [{ "text": "3️⃣ " }, { "text": "Ver o Cardápio", "italic": true }, { "text": " - Fotos reais dos nossos pratos!" }] },
                  { "type": "p", "children": [{ "text": "" }] },
                  { "type": "p", "children": [{ "text": "4️⃣ " }, { "text": "Localização", "italic": true }, { "text": " 📍" }] },
                  { "type": "p", "children": [{ "text": "" }] },
                  { "type": "p", "children": [{ "text": "5️⃣ " }, { "text": "Horário de Funcionamento", "italic": true }, { "text": " ⏰" }] }
                ]
              }
            }
          ]
        },
        {
          "id": "ochro25b72mw2ry9fd8jxhf7",
          "title": "Fechado",
          "graphCoordinates": { "x": -3867.53, "y": -2554.77 },
          "blocks": [
            {
              "id": "xrkngf9zbi6iva2hg9qjcw3h",
              "type": "text",
              "content": {
                "richText": [
                  { "type": "p", "children": [{ "text": "🌟 Ola, {{pushName}}" }] },
                  { "type": "p", "children": [{ "bold": true, "text": "" }] },
                  { "type": "p", "children": [{ "bold": true, "text": "Desculpe neste momento estamos fechado." }] },
                  { "type": "p", "children": [{ "bold": true, "text": "" }] },
                  { "type": "p", "children": [{ "bold": true, "text": "Atendemos de {{DiaFuncionamento}}" }] },
                  { "type": "p", "children": [{ "bold": true, "text": "" }] },
                  { "type": "p", "children": [{ "text": "🕰️ " }, { "bold": true, "text": "Horário de Atendimento:" }] },
                  { "type": "p", "children": [{ "text": "das: {{HoraFuncionamento}}" }] },
                  { "type": "p", "children": [{ "text": "" }] },
                  { "type": "p", "children": [{ "text": "Adoramos ver nossos clientes e estamos sempre prontos para oferecer uma experiência gastronômica incrível!" }] },
                  { "type": "p", "children": [{ "text": "" }] },
                  { "type": "p", "children": [{ "text": "Esperamos vê-lo em breve! 👋" }] }
                ]
              }
            },
            {
              "id": "zj230o5kkh578hxubv4kamhi",
              "outgoingEdgeId": "durhmwiqvr008nfhxml8izt0",
              "type": "text",
              "content": {
                "richText": [
                  { "type": "p", "children": [{ "text": "Mas você pode visualizar nosso cardapio normalmente." }] },
                  { "type": "p", "children": [{ "text": "" }] },
                  { "type": "p", "children": [{ "text": "Click Aqui… 👇🏻👇🏻👇🏻👇🏻" }] },
                  { "type": "p", "children": [{ "text": "{{cardapio}}" }] }
                ]
              }
            }
          ]
        },
        {
          "id": "hyvwiby5vctxpjw9n9kbx8r3",
          "title": "Escolha uma opção",
          "graphCoordinates": { "x": -3366.5, "y": -1883.07 },
          "blocks": [
            {
              "id": "hex8y8l3vv042det0684yta4",
              "type": "text",
              "content": {
                "richText": [
                  { "type": "p", "children": [{ "text": "Digite uma opção: 1, 2 ou 3." }] },
                  { "type": "p", "children": [{ "text": "" }] },
                  { "type": "p", "children": [{ "text": "1️⃣  " }, { "bold": true, "text": "Falar com Atendente" }, { "text": " - Precisa de ajuda? Estamos aqui para você! 🙋‍♂️ digita 1" }] },
                  { "type": "p", "children": [{ "text": "" }] },
                  { "type": "p", "children": [{ "text": "2️⃣ " }, { "bold": true, "text": "Fazer Pedido" }, { "text": "\n" }] },
                  { "type": "p", "children": [{ "text": "3️⃣  " }, { "bold": true, "text": "Ver o Cardapio" }, { "text": " - com fotos reais dos pratos." }] }
                ]
              }
            },
            {
              "id": "bct8yxx5m9pr9mxxesmcblx5",
              "type": "Jump",
              "options": {
                "groupId": "b7jkdkjwgfn7mgatrisa3dty",
                "blockId": "lzjn0mp09qcvj8weck4v2dmg"
              }
            }
          ]
        },
        {
          "id": "z1qnm69n6pzv0m6pirpwz7g0",
          "title": "Sem Motoboy",
          "graphCoordinates": { "x": -2172.51, "y": -2873.64 },
          "blocks": [
            {
              "id": "za6y8187oqrcl9clowgn0y9w",
              "type": "text",
              "content": {
                "richText": [
                  { "type": "p", "children": [{ "text": "🌟 Ola, {{pushName}}" }] },
                  { "type": "p", "children": [{ "text": "" }] },
                  { "type": "p", "children": [{ "text": "📢 Atenção! 📢" }] },
                  { "type": "p", "children": [{ "text": "" }] },
                  { "type": "p", "children": [{ "text": "Hoje, estamos aceitando pedidos apenas através do nosso cardápio digital." }] },
                  { "type": "p", "children": [{ "text": "" }] },
                  { "type": "p", "children": [{ "text": "Contamos com os entregadores do iFood para garantir que seus pedidos cheguem com segurança e no prazo." }] },
                  { "type": "p", "children": [{ "text": "" }] },
                  { "type": "p", "children": [{ "text": "Agradecemos pela compreensão e colaboração de todos os nossos clientes enquanto trabalhamos para oferecer o melhor serviço possível." }] }
                ]
              }
            }
          ]
        },
        {
          "id": "uz0jnwu12434zd4c0hkbqff6",
          "title": "Entrada Inicial",
          "graphCoordinates": { "x": -4019.26, "y": -3837 },
          "blocks": [
            {
              "id": "gnsbdqktlx2jnvvbo632gbsw",
              "outgoingEdgeId": "u0cawln343aon32u06z3j1xv",
              "type": "text input",
              "options": {
                "labels": { "placeholder": "texto" },
                "variableId": "tip60vunfc8dbvlgp1jij61w",
                "isLong": false
              }
            }
          ]
        },
        {
          "id": "naahtr2z262zvn24dx343ott",
          "title": "Momento 1 - classificação",
          "graphCoordinates": { "x": -3040.12, "y": -3461.57 },
          "blocks": [
            {
              "id": "krq1ydpku02zekxrummhwii3",
              "outgoingEdgeId": "jldh9a7smutp1wrhuwf84w2p",
              "type": "text",
              "content": {
                "richText": [
                  { "type": "p", "children": [{ "text": "🍔 Oi! Aqui é da *Burguer Plus* 💛 Ficamos MUITO felizes por ter você com a gente hoje! Se puder deixar uma avaliação no Google, ajuda MUITO nosso trabalho 👇 👉 " }, { "url": "https://g.page/r/CZ_55N8YBcItEAo/review", "type": "a", "children": [{ "text": "https://g.page/r/CZ_55N8YBcItEAo/review" }] }] }
                ]
              }
            }
          ]
        },
        {
          "id": "fd5fxfbavi7x3wrghd2nztap",
          "title": "fluxo - classificação",
          "graphCoordinates": { "x": -3448.05, "y": -3691.91 },
          "blocks": [
            {
              "id": "w74wyq7p83ffbdhldetnnv24",
              "outgoingEdgeId": "uo0v295imcmyupw5mqzo8zf1",
              "type": "Condition",
              "items": [
                {
                  "id": "zso6rfpxh9jjk61xl3e41m3w",
                  "outgoingEdgeId": "rmdeacu7ayuwl3ow4w99bvzt",
                  "content": {
                    "comparisons": [
                      {
                        "id": "cxw4sx6w9rw0jvk2l9m6pntk",
                        "variableId": "tip60vunfc8dbvlgp1jij61w",
                        "comparisonOperator": "Equal to",
                        "value": "Olá, quero classifica-los no google"
                      }
                    ]
                  }
                }
              ]
            }
          ]
        },
        {
          "id": "pusx8w72fguseq8mulwx5xhw",
          "title": "Momento 2 - classificação",
          "graphCoordinates": { "x": -3121.48, "y": -4061.04 },
          "blocks": [
            {
              "id": "r2evkyzxqy46kej8tmaxd1l4",
              "outgoingEdgeId": "jg5chviqqi5dany9z88s8nym",
              "type": "text",
              "content": {
                "richText": [
                  { "type": "p", "children": [{ "text": "Ah! E se curte ver bastidores, novidades e promoções… Segue a gente no Insta? 🤩 📸 👉 instagram.com/burguerplusoficial – Tem muita coisa gostosa por lá!\n#TimeBurguerPlus 🔥" }] }
                ]
              }
            }
          ]
        },
        {
          "id": "ft1y0nck5brteoltybig0gd2",
          "title": "Espera 30s",
          "graphCoordinates": { "x": -2654.68, "y": -3721.94 },
          "blocks": [
            {
              "id": "ctnhoz9hbs8gfr2n8dlvprlv",
              "outgoingEdgeId": "g3q1fvsw6t83lep9yr53ycs4",
              "type": "Wait",
              "options": { "secondsToWaitFor": "30" }
            }
          ]
        }
      ],
      "edges": [
        { "id": "v70j004d6jqxxjngpl3dd2pz", "from": { "blockId": "vfcu2mjjlcxufqqc4oxtj7np", "itemId": "k41n98n2nfjyr8ixaehkj0ek" }, "to": { "groupId": "kn417yxpz8vsugvx87bpzhju" } },
        { "id": "nl2p1ga2aqznoddmvd58onw6", "from": { "blockId": "vfcu2mjjlcxufqqc4oxtj7np" }, "to": { "groupId": "hyvwiby5vctxpjw9n9kbx8r3" } },
        { "id": "tnv3ydcsptrts55ed4iojab8", "from": { "blockId": "vfcu2mjjlcxufqqc4oxtj7np", "itemId": "i4jw3hzzdy364zeahigx4oc8" }, "to": { "groupId": "pl8f6if2xel62chxgwmocglm" } },
        { "id": "gp9xjcl45k66r6uj1gxijb92", "from": { "blockId": "vfcu2mjjlcxufqqc4oxtj7np", "itemId": "ptw4su1tonpepklqz0sjlc20" }, "to": { "groupId": "kn417yxpz8vsugvx87bpzhju" } },
        { "id": "zd5hj4ru33e0io0syo3awfq2", "from": { "blockId": "vfcu2mjjlcxufqqc4oxtj7np", "itemId": "msxpvosm8zzp68ek9wxvg4mn" }, "to": { "groupId": "ycq2b72z73yy123yqrij55we" } },
        { "id": "pxz3dvcdjcpo9j18kk4lhh53", "from": { "blockId": "vfcu2mjjlcxufqqc4oxtj7np", "itemId": "up4epkba9xs1gt1u6wf0h59p" }, "to": { "groupId": "wxkv5hr1lql9thhnulnsbhny" } },
        { "id": "durhmwiqvr008nfhxml8izt0", "from": { "blockId": "zj230o5kkh578hxubv4kamhi" }, "to": { "groupId": "b7jkdkjwgfn7mgatrisa3dty" } },
        { "id": "rkb23u68pk3kk3n4fbhddwt0", "from": { "blockId": "e96ihp4rxvnouxeb7n24zdj1" }, "to": { "groupId": "b7jkdkjwgfn7mgatrisa3dty" } },
        { "id": "rmdeacu7ayuwl3ow4w99bvzt", "from": { "blockId": "w74wyq7p83ffbdhldetnnv24", "itemId": "zso6rfpxh9jjk61xl3e41m3w" }, "to": { "groupId": "naahtr2z262zvn24dx343ott" } },
        { "id": "dwzehe1h1x52quurkkp9jftj", "from": { "eventId": "tdxnbxeb0yfmtfqwkng6rbwc" }, "to": { "groupId": "uz0jnwu12434zd4c0hkbqff6" } },
        { "id": "uo0v295imcmyupw5mqzo8zf1", "from": { "blockId": "w74wyq7p83ffbdhldetnnv24" }, "to": { "groupId": "jk2e6krr2k12ixmktf8u89zq" } },
        { "id": "jldh9a7smutp1wrhuwf84w2p", "from": { "blockId": "krq1ydpku02zekxrummhwii3" }, "to": { "groupId": "ft1y0nck5brteoltybig0gd2" } },
        { "id": "g3q1fvsw6t83lep9yr53ycs4", "from": { "blockId": "ctnhoz9hbs8gfr2n8dlvprlv" }, "to": { "groupId": "pusx8w72fguseq8mulwx5xhw" } },
        { "id": "u0cawln343aon32u06z3j1xv", "from": { "blockId": "gnsbdqktlx2jnvvbo632gbsw" }, "to": { "groupId": "fd5fxfbavi7x3wrghd2nztap" } },
        { "id": "z9kdk8al2120l888bmrnr5ul", "from": { "blockId": "irx6j4eelz5v6u46ru3ubs3w" }, "to": { "groupId": "ochro25b72mw2ry9fd8jxhf7" } },
        { "id": "k8jzkfhd5slt76g86rzp7doz", "from": { "blockId": "irx6j4eelz5v6u46ru3ubs3w", "itemId": "seq8cakk6t2o5s7dep3v8grm" }, "to": { "groupId": "af4ib2ialri3rymp8r99cahc" } }
      ],
      "variables": [
        { "id": "tip60vunfc8dbvlgp1jij61w", "name": "message" },
        { "id": "vq1zcbfnqgaq1t9bsyxqtydso", "name": "instagran" },
        { "id": "vpc85uwu7ljrjdz6q11om1yk0", "name": "remoteJid" },
        { "id": "vx5jnk5x9a3kehrkeo939y95v", "name": "NumeroMenu" },
        { "id": "vy25zp0gnkis4cn0jub1t0tzq", "name": "NomeEmpresa" },
        { "id": "vqf6o7l7epwkwe01b5xxcrmuc", "name": "cardapio" },
        { "id": "vsfcu9j7j5hao4xobe0omc2vt", "name": "GoogleMaps" },
        { "id": "vr0g0m3sx7p3q4i1x152r5skt", "name": "EndereçoEmpresa" },
        { "id": "vsri0uq2n42fefunc3u4kow40", "name": "DiaFuncionamento" },
        { "id": "vw5zx9bwvjdk15f29w1t2o2at", "name": "HoraFuncionamento" },
        { "id": "voiaht3ugputcvglx256eq8ev", "name": "NumeroTelefoneEmpresa" },
        { "id": "vk3nyesfb6025ki91gryd7x1x", "name": "AbertoFechado" },
        { "id": "vqaxdhyys2mqu28bbbnyuzepp", "name": "NomeCliente" },
        { "id": "vaaj41aet4cdsvvzqss4h9u0k", "name": "Start" },
        { "id": "vr9dc0egxdk4judl1dkto4qav", "name": "Menssagem" },
        { "id": "vakc7ai1h35mcvzs1ed5vuorv", "name": "pushName" },
        { "id": "vk6yjec53ol0r4qg1jz9pnesj", "name": "acesso" },
        { "id": "vs8v112wvquw1s1t4bh70qt7n", "name": "instruções" }
      ]
    }
  }
];
