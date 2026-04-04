require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { processEvolutionWebhook } = require('./webhookController');

const app = express();
const PORT = process.env.PORT || 9000;

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(morgan('dev'));

// Rota Saudável
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'Webhook Server Running' });
});

// A Rota Principal Receptora da Evolution API
// Aceita querystrings: ?companyId=x&tenantId=y
app.post('/webhook/evolution', processEvolutionWebhook);

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
  console.log(`Webhook endpoint: http://localhost:${PORT}/webhook/evolution?companyId=XYZ&tenantId=ABC`);
});
