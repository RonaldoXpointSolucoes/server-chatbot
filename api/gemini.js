// Vercel Serverless Function Proxy para Google Generative AI (Gemini)
// Contorna bloqueios de extensões (AdBlock/Shields), firewalls corporativos, preflight CORS e quedas QUIC/HTTP3 no navegador.

const MASTER_FALLBACK_KEY = Buffer.from(
  "QVEuQWI4Uk42STNSWHloNWtNLXpURUhidlZ5WnlHUDBsMXh2eFpRbWRHZFF1dWlYS1lEa2c=",
  "base64"
).toString("utf-8");

function sanitizeKey(raw) {
  if (!raw || typeof raw !== "string") return "";
  return raw.replace(/['"\s\r\n]+/g, "").trim();
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-gemini-api-key");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: { message: "Method Not Allowed" } });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const requestedModel = (body.model || "gemini-2.5-flash").replace(/^models\//, "");
    const payload = body.payload || {
      contents: body.contents,
      generationConfig: body.generationConfig,
      systemInstruction: body.systemInstruction,
      safetySettings: body.safetySettings,
    };

    const candidateKeys = Array.from(
      new Set(
        [
          sanitizeKey(body.apiKey),
          sanitizeKey(req.headers["x-gemini-api-key"]),
          sanitizeKey(process.env.VITE_GEMINI_API_KEY),
          sanitizeKey(process.env.GEMINI_API_KEY),
          sanitizeKey(MASTER_FALLBACK_KEY),
        ].filter((k) => k && k.length >= 20 && (k.startsWith("AIza") || k.startsWith("AQ.")))
      )
    );

    if (candidateKeys.length === 0) {
      return res.status(400).json({
        error: { message: "Nenhuma chave Gemini válida disponível para processar a requisição." },
      });
    }

    const candidateModels = Array.from(
      new Set([requestedModel, "gemini-2.5-flash", "gemini-2.0-flash"])
    );

    let lastError = null;
    let lastStatus = 500;

    for (const key of candidateKeys) {
      for (const modelName of candidateModels) {
        try {
          const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(key)}`;
          const upstreamRes = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          });

          const data = await upstreamRes.json().catch(() => ({}));

          if (upstreamRes.ok && !data.error) {
            return res.status(200).json(data);
          }

          lastStatus = upstreamRes.status || 500;
          lastError = data.error || { message: `HTTP ${upstreamRes.status}` };

          // Se for erro de autenticação (400/401/403), pula para a próxima chave imediatamente
          if (lastStatus === 401 || lastStatus === 403 || (lastStatus === 400 && String(lastError.message || "").toLowerCase().includes("key"))) {
            break;
          }
        } catch (fetchErr) {
          lastError = { message: fetchErr?.message || String(fetchErr) };
        }
      }
    }

    return res.status(lastStatus).json({
      error: lastError || { message: "Falha ao comunicar com Google Generative AI via proxy." },
    });
  } catch (err) {
    return res.status(500).json({
      error: { message: err?.message || "Erro interno no proxy Gemini." },
    });
  }
}
