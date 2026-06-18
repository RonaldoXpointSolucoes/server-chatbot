const fs = require('fs');
const path = require('path');

function bumpVersionString(versionStr) {
    const parts = versionStr.split('.').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) {
        throw new Error(`Invalid version format: ${versionStr}`);
    }

    let [major, minor, patch] = parts;

    // Increment patch
    patch += 1;

    // Check carrying
    if (patch > 9) {
        patch = 0;
        minor += 1;
    }
    if (minor > 9) {
        minor = 0;
        major += 1;
    }

    return `${major}.${minor}.${patch}`;
}

function updatePackageJson(filePath) {
    if (!fs.existsSync(filePath)) {
        console.warn(`File not found: ${filePath}`);
        return null;
    }
    try {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const pkg = JSON.parse(fileContent);
        const oldVersion = pkg.version || '0.0.0';
        const newVersion = bumpVersionString(oldVersion);
        
        // We parse and re-stringify to keep format, or we can replace it directly to preserve formatting.
        // Let's do string replacement of '"version": "X.Y.Z"' to keep exactly the file formatting.
        const versionRegex = /("version"\s*:\s*")([^"]+)(")/;
        if (versionRegex.test(fileContent)) {
            const updatedContent = fileContent.replace(versionRegex, `$1${newVersion}$3`);
            fs.writeFileSync(filePath, updatedContent, 'utf8');
            console.log(`Updated ${path.basename(filePath)}: ${oldVersion} -> ${newVersion}`);
            return { oldVersion, newVersion };
        } else {
            // Fallback to json stringify if regex matches nothing
            pkg.version = newVersion;
            fs.writeFileSync(filePath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
            console.log(`Updated ${path.basename(filePath)} (JSON fallback): ${oldVersion} -> ${newVersion}`);
            return { oldVersion, newVersion };
        }
    } catch (e) {
        console.error(`Error updating ${filePath}:`, e.message);
        return null;
    }
}

// Update root package.json
const rootPkgPath = path.join(__dirname, 'package.json');
const rootUpdate = updatePackageJson(rootPkgPath);

if (rootUpdate) {
    // Sync version with server/package.json
    const serverPkgPath = path.join(__dirname, 'server', 'package.json');
    if (fs.existsSync(serverPkgPath)) {
        try {
            const fileContent = fs.readFileSync(serverPkgPath, 'utf8');
            const versionRegex = /("version"\s*:\s*")([^"]+)(")/;
            if (versionRegex.test(fileContent)) {
                const updatedContent = fileContent.replace(versionRegex, `$1${rootUpdate.newVersion}$3`);
                fs.writeFileSync(serverPkgPath, updatedContent, 'utf8');
                console.log(`Synced server/package.json: -> ${rootUpdate.newVersion}`);
            }
        } catch (e) {
            console.error(`Error syncing server/package.json:`, e.message);
        }
    }
}
