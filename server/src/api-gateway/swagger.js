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
      description: 'API RESTful completa para envio de mensagens, mídias e gestão de instâncias de WhatsApp.',
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
