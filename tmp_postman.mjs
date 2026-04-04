import fs from 'fs';

const data = JSON.parse(fs.readFileSync('c:/Users/david/Downloads/Evolution API - v2.3.-.postman_collection.json', 'utf8'));
let out = '';

function findReqs(items, pathPrefix) {
    items.forEach(item => {
        if (item.item) {
            findReqs(item.item, pathPrefix + item.name + '/');
        } else if (item.request) {
            if (item.name.toLowerCase().includes('media') || item.name.toLowerCase().includes('audio') || item.name.toLowerCase().includes('message')) {
                out += `\n--- ${pathPrefix}${item.name} ---\n`;
                const url = item.request.url?.raw || item.request.url || 'No URL';
                out += `${url}\n`;
                if (item.request.body && item.request.body.raw) {
                    out += item.request.body.raw + '\n';
                }
            }
        }
    });
}

findReqs(data.item, '');
fs.writeFileSync('c:/Users/david/OneDrive/Documentos/Projetos/Antigravity/ChatBoot/tmp_postman_out.txt', out, 'utf8');
