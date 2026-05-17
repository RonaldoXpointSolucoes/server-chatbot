const fs = require('fs');

function updateVersion(file, oldV, newV, oldD, newD) {
    if(fs.existsSync(file)) {
        let content = fs.readFileSync(file, 'utf8');
        content = content.replace(new RegExp(oldV, 'g'), newV);
        content = content.replace(new RegExp(oldD, 'g'), newD);
        fs.writeFileSync(file, content);
    }
}

updateVersion('package.json', '"version": "2.4.6"', '"version": "2.4.7"', '15/05/2026, 11:28', '15/05/2026, 16:30');
updateVersion('src/pages/AdminDashboard.tsx', '2.4.6', '2.4.7', '15/05/2026, 11:28', '15/05/2026, 16:30');
updateVersion('src/pages/ChatDashboard.tsx', '2.4.6', '2.4.7', '15/05/2026, 11:28', '15/05/2026, 16:30');

console.log('Version updated to 2.4.7');
