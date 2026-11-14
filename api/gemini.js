// Vercel Serverless Function Proxy Seguro para Google Generative AI (Gemini)
// Encaminha requisições autenticadas para o Backend Oficial (IP restrito no Google Cloud)
// e bloqueia qualquer uso não autorizado ou abuso externo de chaves de API.

const rateLimitWindowMs = 60 * 1000;
const maxRequestsPerMinutePerIp = 20;
const ipCounters = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = ipCounters.get(ip);
  if (!entry || now - entry.start > rateLimitWindowMs) {
    ipCounters.set(ip, { start: now, count: 1 });
    return true;
  }
  entry.count += 1;
  return entry.count <= maxRequestsPerMinutePerIp;
}

function sanitizeKey(raw) {
  if (!raw || typeof raw !== "string") return "";
  return raw.replace(/['"\s\r\n]+/g, "").trim();
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  const referer = req.headers.referer || "";
  const allowedOrigin =
    !origin ||
    origin.includes("vercel.app") ||
    origin.includes("localhost") ||
    origin.includes("127.0.0.1") ||
    origin.includes("xpointsolucoes.com");

  res.setHeader("Access-Control-Allow-Origin", allowedOrigin && origin ? origin : "https://chat-boot-theta.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-gemini-api-key, x-tenant-id, x-chatboot-shield, x-e2e-source");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: { message: "Method Not Allowed" } });
  }

  const callerIp =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket?.remoteAddress ||
    "unknown";

  if (!checkRateLimit(callerIp)) {
    return res.status(429).json({
      error: { message: "Limite de requisições de IA excedido. Aguarde um minuto." },
    });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const tenantId = req.headers["x-tenant-id"] || body.tenantId || "";

    // Bloqueia chamadas de bots externos que não venham da aplicação nem apresentem o escudo de integridade
    const customUserKey = sanitizeKey(body.apiKey || req.headers["x-gemini-api-key"]);
    const shieldHeader = String(req.headers["x-chatboot-shield"] || "");
    const userAgent = String(req.headers["user-agent"] || "").toLowerCase();
    const isInternalReferer =
      referer.includes("vercel.app") ||
      referer.includes("localhost") ||
      referer.includes("127.0.0.1") ||
      referer.includes("xpointsolucoes.com");

    const isSuspiciousBotUa = /curl|wget|python|scrapy|httpclient|postman|insomnia|go-http-client/i.test(userAgent);
    if ((isSuspiciousBotUa && !shieldHeader.startsWith("cbshield_v1_")) || (!isInternalReferer && !shieldHeader.startsWith("cbshield_v1_"))) {
      return res.status(403).json({
        error: { message: "Acesso negado pelo Firewall Anti-Hacker: origem ou assinatura inválida." },
      });
    }

    const rawRequestedModel = (body.model || "gemini-2.5-flash").replace(/^models\//, "");
    const requestedModel = rawRequestedModel.includes("flash") ? rawRequestedModel : "gemini-2.5-flash";
    const payload = body.payload || {
      contents: body.contents,
      generationConfig: {
        ...(body.generationConfig || {}),
        maxOutputTokens: Math.min(Number(body.generationConfig?.maxOutputTokens) || 3072, 4096),
      },
      systemInstruction: body.systemInstruction,
      safetySettings: body.safetySettings,
    };

    // 1. Prioridade Máxima: Encaminhar para o Motor Backend Oficial (IP autorizado na Google Cloud)
    const engineUrl = (
      process.env.VITE_WHATSAPP_ENGINE_URL ||
      "https://owckk0k8w8soo40w40owc4ss.69.62.92.212.sslip.io"
    )
      .replace(/\/$/, "")
      .trim();

    try {
      const backendRes = await fetch(`${engineUrl}/api/v1/knowledge/gemini-proxy`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-tenant-id": tenantId || "8b1e427b-2321-4ea7-9d7e-90f7d5cbad21",
          "x-chatboot-shield": shieldHeader || "cbshield_v1_vercel_internal",
        },
        body: JSON.stringify({
          model: requestedModel,
          payload,
          apiKey: customUserKey || undefined,
        }),
      });

      const backendData = await backendRes.json().catch(() => ({}));
      if (backendRes.ok && !backendData.error && backendData.candidates) {
        return res.status(200).json(backendData);
      }
    } catch (_) {
      // Prossegue para tentativa com chave explícita caso o usuário tenha passado uma chave própria
    }

    // 2. Fallback apenas se houver chave explícita sem restrição de IP configurada no ambiente
    const candidateKeys = Array.from(
      new Set(
        [
          customUserKey,
          sanitizeKey(process.env.GEMINI_API_KEY),
        ].filter((k) => k && k.length >= 20 && (k.startsWith("AIza") || k.startsWith("AQ.")))
      )
    );

    if (candidateKeys.length === 0) {
      return res.status(403).json({
        error: { message: "Proxy Gemini protegido por restrição de IP no servidor principal." },
      });
    }

    const candidateModels = Array.from(
      new Set(["gemini-2.5-flash", "gemini-2.0-flash"])
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

          if (lastStatus === 401 || lastStatus === 403 || lastStatus === 400) {
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
