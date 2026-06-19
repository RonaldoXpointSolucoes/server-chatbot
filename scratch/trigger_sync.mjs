async function run() {
    const tenantId = '9057ca36-0b29-4fe5-89fb-be5e13387030';
    const response = await fetch('http://localhost:9000/api/v1/knowledge/corrections', {
        method: 'POST',
        headers: {
            'x-tenant-id': tenantId,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            user_query: "Olá! Gostaria de receber atualizações em tempo real sobre o andamento do meu pedido (Nº 12585).",
            original_response: "Olá! Entendo perfeitamente...",
            corrected_response: "Claro, assim que seu pedido estiver saindo para entrega eu aviso sim.",
            context_summary: "Cliente busca atualizações de status em tempo real para o pedido 12585."
        })
    });
    
    console.log('Status:', response.status);
    const data = await response.json();
    console.log('Response:', data);
}
run();
