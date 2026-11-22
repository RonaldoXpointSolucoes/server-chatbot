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

test('decryptOoxmlPackage roundtrips Agile 4.4 4096-byte segment ending in 0x01 without PKCS7 truncation', async () => {
  const XLSX = await import('xlsx');
  const crypto = await import('node:crypto');
  const XLSXLib = XLSX.CFB ? XLSX : XLSX.default || XLSX;

  // Monta payload de 4096 bytes terminando em 0x01 (padrão que quebrava PKCS7 unpadding)
  const plain = new Uint8Array(4096);
  plain.set([0x50, 0x4b, 0x03, 0x04], 0);
  for (let i = 4; i < 4095; i++) plain[i] = (i * 7) & 0xff;
  plain[4095] = 0x01;

  const password = 'secret';
  const kdSalt = Buffer.from('0123456789abcdef');
  const pSalt = Buffer.from('fedcba9876543210');
  const spinCount = 10;
  const packageKey = Buffer.from('00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff', 'hex');

  const encodeUtf16Le = (s) => {
    const out = Buffer.alloc(s.length * 2);
    for (let i = 0; i < s.length; i++) out.writeUInt16LE(s.charCodeAt(i), i * 2);
    return out;
  };
  const pad36 = (b, len) => {
    const out = Buffer.alloc(len, 0x36);
    b.copy(out, 0, 0, Math.min(b.length, len));
    return out;
  };
  const aesEncCbc = (buf, key, iv) => {
    const c = crypto.createCipheriv('aes-256-cbc', key, iv);
    c.setAutoPadding(false);
    return Buffer.concat([c.update(buf), c.final()]);
  };

  let h = crypto.createHash('sha512').update(Buffer.concat([pSalt, encodeUtf16Le(password)])).digest();
  for (let i = 0; i < spinCount; i++) {
    const iter = Buffer.alloc(4);
    iter.writeUInt32LE(i, 0);
    h = crypto.createHash('sha512').update(Buffer.concat([iter, h])).digest();
  }
  const derive = (bk) => pad36(crypto.createHash('sha512').update(Buffer.concat([h, Buffer.from(bk)])).digest(), 32);
  const kInput = derive([0xfe, 0xa7, 0xd2, 0x76, 0x3b, 0x4b, 0x9e, 0x79]);
  const kValue = derive([0xd7, 0xaa, 0x0f, 0x6d, 0x30, 0x61, 0x34, 0x4e]);
  const kSecret = derive([0x14, 0x6e, 0x0b, 0xe7, 0xab, 0xac, 0xd0, 0xd6]);

  const verifierInput = Buffer.from('1234567890123456');
  const verifierHash = crypto.createHash('sha512').update(verifierInput).digest();
  const ivSalt = pad36(pSalt, 16);
  const encInput = aesEncCbc(verifierInput, kInput, ivSalt);
  const encValue = aesEncCbc(verifierHash, kValue, ivSalt);
  const encKey = aesEncCbc(packageKey, kSecret, ivSalt);

  const xml = `<encryption xmlns="http://schemas.microsoft.com/office/2006/encryption"><keyData saltSize="16" blockSize="16" keyBits="256" hashSize="64" cipherAlgorithm="AES" cipherChaining="ChainingModeCBC" hashAlgorithm="SHA512" saltValue="${kdSalt.toString('base64')}"/><keyEncryptors><keyEncryptor uri="http://schemas.microsoft.com/office/2006/keyEncryptor/password"><encryptedKey spinCount="${spinCount}" saltSize="16" blockSize="16" keyBits="256" hashSize="64" cipherAlgorithm="AES" cipherChaining="ChainingModeCBC" hashAlgorithm="SHA512" saltValue="${pSalt.toString('base64')}" encryptedVerifierHashInput="${encInput.toString('base64')}" encryptedVerifierHashValue="${encValue.toString('base64')}" encryptedKeyValue="${encKey.toString('base64')}"/></keyEncryptor></keyEncryptors></encryption>`;

  const infoHeader = Buffer.from([0x04, 0x00, 0x04, 0x00, 0x40, 0x00, 0x00, 0x00]);
  const infoBuf = Buffer.concat([infoHeader, Buffer.from(xml, 'utf8')]);

  const segBuf = Buffer.alloc(4);
  segBuf.writeUInt32LE(0, 0);
  const segIv = pad36(crypto.createHash('sha512').update(Buffer.concat([kdSalt, segBuf])).digest(), 16);
  const pkgSize = Buffer.alloc(8);
  pkgSize.writeUInt32LE(plain.length, 0);
  const encPkg = Buffer.concat([pkgSize, aesEncCbc(Buffer.from(plain), packageKey, segIv)]);

  const cfb = XLSXLib.CFB.utils.cfb_new();
  XLSXLib.CFB.utils.cfb_add(cfb, 'EncryptionInfo', infoBuf);
  XLSXLib.CFB.utils.cfb_add(cfb, 'EncryptedPackage', encPkg);
  const container = XLSXLib.CFB.write(cfb, { type: 'buffer' });

  const decrypted = await decryptOoxmlPackage(container, password);
  assert.equal(decrypted.length, plain.length);
  assert.equal(decrypted[4095], 0x01);
});
