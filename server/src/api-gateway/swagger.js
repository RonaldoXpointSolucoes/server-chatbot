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
       }
    })
  );

  // Endpoint para expor o json cru caso o Front decida consumir as specs
  app.get('/api-docs/swagger.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(specs);
  });
};
