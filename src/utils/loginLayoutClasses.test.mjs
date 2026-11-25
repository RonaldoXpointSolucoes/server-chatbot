import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../..');

function extractFirstReturnRootClass(tsxSource) {
  const match = tsxSource.match(/return\s*\(\s*<div\b[^>]*className=(?:"([^"]+)"|'([^']+)'|`([^`]+)`|\{`([^`]+)`\})/s);
  return match ? (match[1] || match[2] || match[3] || match[4] || '') : '';
}

test('loginLayoutClasses exporta classes de shell rolável sem travamento do flexbox', async () => {
  const mod = await import('./loginLayoutClasses.mjs');
  assert.match(mod.LOGIN_SCROLL_OUTER_CLASS, /\bh-\[100dvh\]/);
  assert.match(mod.LOGIN_SCROLL_OUTER_CLASS, /\boverflow-y-auto\b/);
  assert.doesNotMatch(mod.LOGIN_SCROLL_OUTER_CLASS, /\bjustify-center\b/, 'justify-center no próprio container com overflow-y-auto corta o topo ao rolar');
  assert.match(mod.LOGIN_SCROLL_INNER_CLASS, /\bmin-h-full\b/);
  assert.match(mod.LOGIN_SCROLL_INNER_CLASS, /\bjustify-center\b/);
  assert.match(mod.MODAL_SCROLL_BACKDROP_CLASS, /\boverflow-y-auto\b/);
  assert.match(mod.MODAL_SCROLL_INNER_CLASS, /\bmin-h-full\b/);
});

test('ClientLogin e AdminLogin usam o shell rolável compatível com #root fixed/overflow-hidden', () => {
  const indexCss = fs.readFileSync(path.join(rootDir, 'src/index.css'), 'utf8');
  assert.match(indexCss, /overflow:\s*hidden/);

  for (const relPath of ['src/pages/ClientLogin.tsx', 'src/pages/AdminLogin.tsx']) {
    const source = fs.readFileSync(path.join(rootDir, relPath), 'utf8');
    const rootClass = extractFirstReturnRootClass(source);
    assert.ok(rootClass.includes('LOGIN_SCROLL_OUTER_CLASS'), `${relPath} deve usar LOGIN_SCROLL_OUTER_CLASS no container raiz`);
    assert.ok(source.includes('LOGIN_SCROLL_INNER_CLASS'), `${relPath} deve usar LOGIN_SCROLL_INNER_CLASS`);
    assert.ok(!rootClass.includes('min-h-[100dvh]'), `${relPath} não deve usar min-h-[100dvh] estático sem scroll`);
  }

  const clientLoginSource = fs.readFileSync(path.join(rootDir, 'src/pages/ClientLogin.tsx'), 'utf8');
  assert.equal((clientLoginSource.match(/<div className=\{MODAL_SCROLL_BACKDROP_CLASS\}>/g) || []).length, 2, 'Os modais de Face ID devem permitir scroll em telas baixas');
  assert.equal((clientLoginSource.match(/<div className=\{MODAL_SCROLL_INNER_CLASS\}>/g) || []).length, 2);
});
