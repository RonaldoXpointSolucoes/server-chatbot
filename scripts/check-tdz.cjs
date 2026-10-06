const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function getAllFiles(dir, exts) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllFiles(fullPath, exts));
    } else {
      if (exts.some(ext => fullPath.endsWith(ext))) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

const files = getAllFiles('src', ['.ts', '.tsx']);
let totalIssues = 0;

for (const filePath of files) {
  const code = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(filePath, code, ts.ScriptTarget.Latest, true);

  function checkFunction(node) {
    if (!node.body || !node.body.statements) return;
    const statements = node.body.statements;
    const declaredVars = new Map();

    statements.forEach((stmt, idx) => {
      if (ts.isVariableStatement(stmt)) {
        stmt.declarationList.declarations.forEach(decl => {
          if (ts.isIdentifier(decl.name)) {
            declaredVars.set(decl.name.text, idx);
          }
        });
      }
    });

    function checkImmediateExpressions(childNode, currentStmtIdx) {
      if (ts.isCallExpression(childNode)) {
        childNode.arguments.forEach(arg => {
          if (ts.isArrayLiteralExpression(arg)) {
            checkIdentifiers(arg, currentStmtIdx, filePath, sourceFile);
          }
        });
      }
      ts.forEachChild(childNode, c => {
        if (!ts.isFunctionExpression(c) && !ts.isArrowFunction(c)) {
          checkImmediateExpressions(c, currentStmtIdx);
        }
      });
    }

    function checkIdentifiers(childNode, currentStmtIdx, filePath, sourceFile) {
      if (ts.isIdentifier(childNode)) {
        const varName = childNode.text;
        if (declaredVars.has(varName)) {
          const declIdx = declaredVars.get(varName);
          if (declIdx > currentStmtIdx) {
            const line = sourceFile.getLineAndCharacterOfPosition(childNode.getStart()).line + 1;
            console.error(`\x1b[31m[TDZ Guardrail Error]\x1b[0m ${filePath}:${line}: Variable '${varName}' used in dependency array at statement #${currentStmtIdx} before its declaration at statement #${declIdx}!`);
            totalIssues++;
          }
        }
      }
      ts.forEachChild(childNode, c => checkIdentifiers(c, currentStmtIdx, filePath, sourceFile));
    }

    statements.forEach((stmt, idx) => {
      checkImmediateExpressions(stmt, idx);
    });
  }

  function walk(node) {
    if (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
      checkFunction(node);
    }
    ts.forEachChild(node, walk);
  }

  walk(sourceFile);
}

if (totalIssues > 0) {
  console.error(`\x1b[31m[TDZ Guardrail Failed]\x1b[0m Found ${totalIssues} Temporal Dead Zone issue(s). Build aborted to prevent runtime crashes!`);
  process.exit(1);
} else {
  console.log('\x1b[32m[TDZ Guardrail Passed]\x1b[0m 0 variable-before-initialization issues detected in hooks.');
}
