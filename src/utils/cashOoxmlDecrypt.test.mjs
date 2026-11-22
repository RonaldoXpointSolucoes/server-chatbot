import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  isEncryptedOoxmlBuffer,
  decryptOoxmlPackage
} from './cashOoxmlDecrypt.mjs';

test('isEncryptedOoxmlBuffer returns false for standard ZIP xlsx bytes and true for OLE2 EncryptedPackage', () => {
  const plainZip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
  assert.equal(isEncryptedOoxmlBuffer(plainZip), false);

  const realPlain = fs.readFileSync(
    'C:/Users/NOTE-(FORM)02JUL26/.gemini/antigravity/brain/15c2c45d-2e4f-4867-9efb-2507905522dd/.user_uploaded/media_1795378748853_11a72afc.xlsx'
  );
  assert.equal(isEncryptedOoxmlBuffer(realPlain), false);

  const realEncrypted = fs.readFileSync(
    'C:/Users/NOTE-(FORM)02JUL26/.gemini/antigravity/brain/15c2c45d-2e4f-4867-9efb-2507905522dd/.user_uploaded/media_1795378790616_7c37f118.xlsx'
  );
  assert.equal(isEncryptedOoxmlBuffer(realEncrypted), true);
});

test('decryptOoxmlPackage rejects wrong password with INVALID_PASSWORD and rejects non-encrypted input cleanly', async () => {
  const realEncrypted = fs.readFileSync(
    'C:/Users/NOTE-(FORM)02JUL26/.gemini/antigravity/brain/15c2c45d-2e4f-4867-9efb-2507905522dd/.user_uploaded/media_1795378790616_7c37f118.xlsx'
  );

  await assert.rejects(
    () => decryptOoxmlPackage(realEncrypted, '__WRONG_PASSWORD_123__'),
    (err) => err && err.code === 'INVALID_PASSWORD'
  );
});
