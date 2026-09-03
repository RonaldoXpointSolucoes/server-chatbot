# 🚀 ChatBoot Next-Gen (v8.0) • SaaS WhatsApp Master

> **Nova Arquitetura de Produção na VPS Hostinger (`179.199.142.157`)**  
> Motor WhatsApp em Go puro (**Whatsmeow**), Banco de Dados Próprio (**Appwrite Self-Hosted**), Cofre de IA (**AI Engine**) e Regras de Negócio (**Business Engine**) operando com **HTTPS Let's Encrypt**.

---

### 📚 Documentações Oficiais de Transição & Arquitetura

* 📘 **[Manual Mestre de Transição ChatBoot-New](docs/MANUAL_MIGRACAO_CHATBOOT_NEW.md)**: Guia completo para inicializar e evoluir a nova pasta `ChatBoot-New` com todos os endpoints, credenciais e passos de desenvolvimento.
* 🏛️ **[Especificação Arquitetural Next-Gen v8](docs/ARQUITETURA_NEXT_GEN_V8.md)**: Topologia detalhada de microserviços, comparativo técnico e mapeamento de coleções.

---

## 🌐 Endpoints Oficiais com HTTPS Seguro (SSL Let's Encrypt)

* **Appwrite Console**: [https://appwrite-inwbueezn2gkpm4tqwvzkswy.179.199.142.157.sslip.io/console](https://appwrite-inwbueezn2gkpm4tqwvzkswy.179.199.142.157.sslip.io/console)
* **Appwrite API**: `https://appwrite-inwbueezn2gkpm4tqwvzkswy.179.199.142.157.sslip.io/v1`
* **Coolify Console**: [https://coolify.xpointsolucoes.com.br](https://coolify.xpointsolucoes.com.br)
* **Whatsmeow Go**: `https://whatsmeow.179.199.142.157.sslip.io`
* **AI Engine**: `https://ai.179.199.142.157.sslip.io`
* **Business Engine**: `https://api.179.199.142.157.sslip.io`

---

## React + TypeScript + Vite


If you are developing a production application, we recommend updating the configuration to enable type aware lint rules:

- Configure the top-level `parserOptions` property like this:

```js
export default tseslint.config({
  languageOptions: {
    // other options...
    parserOptions: {
      project: ['./tsconfig.node.json', './tsconfig.app.json'],
      tsconfigRootDir: import.meta.dirname,
    },
  },
})
```

- Replace `tseslint.configs.recommended` to `tseslint.configs.recommendedTypeChecked` or `tseslint.configs.strictTypeChecked`
- Optionally add `...tseslint.configs.stylisticTypeChecked`
- Install [eslint-plugin-react](https://github.com/jsx-eslint/eslint-plugin-react) and update the config:

```js
// eslint.config.js
import react from 'eslint-plugin-react'

export default tseslint.config({
  // Set the react version
  settings: { react: { version: '18.3' } },
  plugins: {
    // Add the react plugin
    react,
  },
  rules: {
    // other rules...
    // Enable its recommended rules
    ...react.configs.recommended.rules,
    ...react.configs['jsx-runtime'].rules,
  },
})
```
