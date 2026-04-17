import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const apiKey = process.env.VITE_GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  console.log("Fetching sample audio...");
  const sampleUrl = "https://actions.google.com/sounds/v1/alarms/beep_short.ogg";
  const req = await fetch(sampleUrl);
  const buffer = await req.arrayBuffer();
  const base64Audio = Buffer.from(buffer).toString('base64');
  console.log("Audio size:", base64Audio.length);

  const payload = {
    contents: [
      {
        parts: [
          { text: "Transcribe exactly what you hear in this audio. If nothing is heard, return 'Nenhum som detectável'." },
          {
            inlineData: {
              mimeType: "audio/ogg",
              data: base64Audio
            }
          }
        ]
      }
    ]
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  console.log(JSON.stringify(data, null, 2));
}

run().catch(console.error);
