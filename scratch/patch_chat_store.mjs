import fs from 'fs';

const filePath = 'src/store/chatStore.ts';
let content = fs.readFileSync(filePath, 'utf8');

// Vamos procurar o bloco de exclusão da nota
const targetStr = `              return { ...c, messages: newMsgs };
            }
            return c;
          })
        }));`;

const targetStrCRLF = targetStr.replace(/\n/g, '\r\n');

const replacementStr = `              return { ...c, messages: newMsgs };
            }
            return c;
          })
        }));

        if (typeof window !== 'undefined' && (window as any).refreshGlobalActiveTasks) {
           (window as any).refreshGlobalActiveTasks();
        }`;

const replacementStrCRLF = replacementStr.replace(/\n/g, '\r\n');

if (content.includes(targetStr)) {
    content = content.replace(targetStr, replacementStr);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log("Patch aplicado com sucesso (LF)!");
} else if (content.includes(targetStrCRLF)) {
    content = content.replace(targetStrCRLF, replacementStrCRLF);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log("Patch aplicado com sucesso (CRLF)!");
} else {
    // Busca menos rígida se ainda não bater
    console.log("Não bateu a busca estrita. Tentando busca flexível...");
    const targetFlex = `contacts: s.contacts.map(c => {`;
    const lastNoteIndex = content.lastIndexOf(targetFlex);
    if (lastNoteIndex !== -1) {
        // Encontra o fim daquela arrow function (o primeiro "}));" após lastNoteIndex)
        const closeIndex = content.indexOf('}));', lastNoteIndex);
        if (closeIndex !== -1) {
            const insertPos = closeIndex + 4;
            const textToInsert = `\n\n        if (typeof window !== 'undefined' && (window as any).refreshGlobalActiveTasks) {\n           (window as any).refreshGlobalActiveTasks();\n        }`;
            const normalizedTextToInsert = content.includes('\r\n') ? textToInsert.replace(/\n/g, '\r\n') : textToInsert;
            content = content.substring(0, insertPos) + normalizedTextToInsert + content.substring(insertPos);
            fs.writeFileSync(filePath, content, 'utf8');
            console.log("Patch aplicado com sucesso via busca flexível!");
        } else {
            console.error("Fim do bloco de set() não encontrado.");
        }
    } else {
        console.error("Bloco do contacts.map do final não encontrado.");
    }
}
