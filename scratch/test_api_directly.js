
import fs from 'fs';

async function run() {
  const url = "https://service.xpointsolucoes.com.br:8443/v6/server/nuvem/ProdutoPdvService/GetCardapioCompleto";
  const token = "Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpYXQiOjE1OTgyNzA4NTksImV4cCI6MTg5MzQxMzI1OX0.mhHkRKeJgvfHmKDe4cZFKLAJKUBVplIlB5GJVBMkjQw";
  const payload = { AGuidEstab: "6D0187D9-E905-4479-AB15-B908F0222607" };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      console.error("HTTP error:", res.status);
      return;
    }

    const data = await res.json();
    console.log("Total produtos retornados pela API externa:", data.produtos?.length);

    // Salva a resposta completa em um arquivo JSON para análise
    fs.writeFileSync('scratch/api_cardapio_completo.json', JSON.stringify(data, null, 2));
    console.log("Salvo scratch/api_cardapio_completo.json");

    // Vamos filtrar por "Salada Caesar" no retorno bruto
    const prods = data.produtos || [];
    const caesar = prods.filter(p => p.name?.toLowerCase().includes("salad") || p.name?.toLowerCase().includes("caesar"));
    console.log("Produtos correspondentes a 'Salada' ou 'Caesar':");
    console.log(JSON.stringify(caesar, null, 2));

  } catch (err) {
    console.error("Erro na consulta direta:", err);
  }
}

run();
