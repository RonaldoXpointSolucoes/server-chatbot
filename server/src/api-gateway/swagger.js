import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Antigravity ChatBoot API',
      version: packageJson.version,
      description: `
**🚀 Bem-vindo à API RESTful do Antigravity ChatBoot**

Esta documentação interativa (Swagger) permite que você teste as rotas de conexão do motor Baileys, evios de mensagens e mídias de forma segura e imediata.

---

### 💡 Dicas de Uso

1. **Autenticação 🔑**
   Alguns endpoints sensíveis requerem o cabeçalho \`apikey\`. O valor desse cabeçalho é a chave da instância, visível no banco de dados Supabase na tabela de instâncias.

2. **Entendendo as Rotas 🔄**
   - **\`POST /instance/create\`**: Crie novas conexões. Vai retornar o \`qrcode\` ou indicar se já está conectado na sessão.
   - **\`POST /message/sendText\`**: Disparador direto. Basta preencher o \`number\` (Ex: \`5511999999999\`) e a propriedade \`text\`.

3. **Status do Servidor HTTPS 🌐**
   O menu drop-down *Servers* agora reconhece de forma dinâmica o seu DNS na Nuvem (Coolify) sem problemas de "localhost".

> **Aviso de Testes:** As ações tomadas por essa tela afetam as camadas reais do seu motor NodeJS. As mensagens que você disparar por aqui chegarão nos celulares destinatários.
`,
    },
    servers: [
      {
        url: '/',
        description: 'Servidor Atual (Auto)'
      },
      {
        url: 'http://localhost:3000',
        description: 'Servidor Local (Dev)'
      }
    ],
  },
  apis: [path.join(__dirname, './public-rest.js')], 
};

const specs = swaggerJsdoc(options);

export const setupSwagger = (app) => {
  app.use(
    '/swagger/teste.html',
    swaggerUi.serve,
    swaggerUi.setup(specs, {
       explorer: true,
       swaggerOptions: {
           url: '/api-docs/swagger.json'
       },
       customSiteTitle: "Baileys API Gateway",
       customCss: `
         @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
         body { background-color: #09090b; font-family: 'Inter', sans-serif; margin: 0; padding: 0; }
         .swagger-ui { color: #e4e4e7; }
         .swagger-ui .topbar { background-color: #09090b; border-bottom: 1px solid #27272a; padding: 10px 0; }
         .swagger-ui .topbar a { max-width: 150px; }
         .swagger-ui .info .title { color: #fafafa !important; font-weight: 700; font-size: 36px; }
         .swagger-ui .info p { color: #a1a1aa !important; }
         .swagger-ui .scheme-container { background: transparent; padding: 0; box-shadow: none; margin-bottom: 20px; }
         .swagger-ui .servers > label select { background-color: #18181b; border: 1px solid #27272a; color: #fafafa; border-radius: 8px; padding: 8px 16px; font-family: 'Inter', sans-serif; }
         .swagger-ui .opblock { border-radius: 16px; border: 1px solid #27272a; background: rgba(24, 24, 27, 0.6); backdrop-filter: blur(12px); box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); margin-bottom: 24px; transition: all 0.2s ease; overflow: hidden; }
         .swagger-ui .opblock:hover { border-color: #3f3f46; transform: translateY(-2px); box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.2), 0 4px 6px -2px rgba(0, 0, 0, 0.1); }
         .swagger-ui .opblock-post { border-color: rgba(34, 197, 94, 0.3); }
         .swagger-ui .opblock-post .opblock-summary-method { background: #166534; color: #4ade80; border-radius: 8px; font-weight: 600; }
         .swagger-ui .opblock-post .opblock-summary { border-bottom: 1px solid rgba(34, 197, 94, 0.1); background: rgba(34, 197, 94, 0.05); }
         .swagger-ui .opblock-get { border-color: rgba(59, 130, 246, 0.3); }
         .swagger-ui .opblock-get .opblock-summary-method { background: #1e3a8a; color: #60a5fa; border-radius: 8px; font-weight: 600; }
         .swagger-ui .opblock-get .opblock-summary { border-bottom: 1px solid rgba(59, 130, 246, 0.1); background: rgba(59, 130, 246, 0.05); }
         .swagger-ui .opblock-delete { border-color: rgba(239, 68, 68, 0.3); }
         .swagger-ui .opblock-delete .opblock-summary-method { background: #7f1d1d; color: #f87171; border-radius: 8px; font-weight: 600; }
         .swagger-ui .opblock-delete .opblock-summary { border-bottom: 1px solid rgba(239, 68, 68, 0.1); background: rgba(239, 68, 68, 0.05); }
         
         .swagger-ui .opblock .opblock-summary-path { color: #e4e4e7; font-family: 'Inter', monospace; }
         .swagger-ui .opblock .opblock-summary-description { color: #a1a1aa; }
         .swagger-ui .opblock-body { background: transparent; padding: 20px; }
         
         .swagger-ui .parameter__name { color: #38bdf8; font-weight: 600; }
         .swagger-ui .parameter__type { color: #94a3b8; }
         .swagger-ui table thead tr th { border-bottom: 1px solid #27272a; color: #a1a1aa; font-family: 'Inter', sans-serif; padding-bottom: 10px; }
         .swagger-ui table tbody tr td { border-bottom: 1px solid #27272a; padding: 15px 0; }
         .swagger-ui h4, .swagger-ui h5 { color: #e4e4e7 !important; }
         
         .swagger-ui input[type=text], .swagger-ui textarea, .swagger-ui select { background-color: #09090b; border: 1px solid #3f3f46; color: #fafafa; border-radius: 8px; padding: 10px 14px; font-family: 'Inter', monospace; box-shadow: inset 0 1px 2px rgba(0,0,0,0.5); outline: none; transition: border-color 0.2s; }
         .swagger-ui input[type=text]:focus, .swagger-ui textarea:focus { border-color: #38bdf8; }
         .swagger-ui input[type=file] { color: #a1a1aa; background: #18181b; padding: 10px; border-radius: 8px; border: 1px dashed #3f3f46; width: 100%; box-sizing: border-box; }
         
         .swagger-ui .btn { background: #27272a; border: 1px solid #3f3f46; color: #fafafa; border-radius: 8px; font-weight: 500; text-transform: none; padding: 8px 16px; box-shadow: 0 1px 2px rgba(0,0,0,0.2); transition: all 0.2s; }
         .swagger-ui .btn:hover { background: #3f3f46; border-color: #52525b; box-shadow: 0 2px 4px rgba(0,0,0,0.3); }
         .swagger-ui .btn.execute { background: #0ea5e9; color: white; border: none; padding: 10px 24px; box-shadow: 0 4px 12px rgba(14, 165, 233, 0.3); width: 100%; margin-top: 15px; }
         .swagger-ui .btn.execute:hover { background: #0284c7; box-shadow: 0 6px 16px rgba(14, 165, 233, 0.4); transform: translateY(-1px); }
         .swagger-ui .btn.cancel { border-color: #ef4444; color: #ef4444; background: rgba(239, 68, 68, 0.1); }
         
         .swagger-ui .responses-inner h4, .swagger-ui .responses-inner h5 { color: #fafafa !important; }
         .swagger-ui .response-col_status { color: #10b981; font-weight: 600; }
         .swagger-ui .response-col_description { color: #a1a1aa; }
         
         .swagger-ui .model-box { border-radius: 12px; background: #09090b; border: 1px solid #27272a; padding: 15px; }
         .swagger-ui section.models { border: 1px solid #27272a; border-radius: 16px; background: #18181b; padding: 20px; margin-top: 40px; }
         .swagger-ui section.models h4 { color: #fafafa !important; }
         
         .swagger-ui .markdown p, .swagger-ui .markdown pre, .swagger-ui .markdown code { color: #d4d4d8; }
         .swagger-ui .markdown code { background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
         
         .swagger-ui select { border-radius: 8px !important; }
       `
    })
  );

  // Endpoint para expor o json cru caso o Front decida consumir as specs
  app.get('/api-docs/swagger.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(specs);
  });
};
