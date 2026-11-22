import * as XLSX from 'xlsx';

const XLSXLib = XLSX?.CFB ? XLSX : (XLSX?.default || XLSX);

// S-box & inverse S-box para decifragem AES-ECB (ECMA-376 Standard Encryption)
const INV_SBOX = new Uint8Array([
  0x52,0x09,0x6a,0xd5,0x30,0x36,0xa5,0x38,0xbf,0x40,0xa3,0x9e,0x81,0xf3,0xd7,0xfb,
  0x7c,0xe3,0x39,0x82,0x9b,0x2f,0xff,0x87,0x34,0x8e,0x43,0x44,0xc4,0xde,0xe9,0xcb,
  0x54,0x7b,0x94,0x32,0xa6,0xc2,0x23,0x3d,0xee,0x4c,0x95,0x0b,0x42,0xfa,0xc3,0x4e,
  0x08,0x2e,0xa1,0x66,0x28,0xd9,0x24,0xb2,0x76,0x5b,0xa2,0x49,0x6d,0x8b,0xd1,0x25,
  0x72,0xf8,0xf6,0x64,0x86,0x68,0x98,0x16,0xd4,0xa4,0x5c,0xcc,0x5d,0x65,0xb6,0x92,
  0x6c,0x70,0x48,0x50,0xfd,0xed,0xb9,0xda,0x5e,0x15,0x46,0x57,0xa7,0x8d,0x9d,0x84,
  0x90,0xd8,0xab,0x00,0x8c,0xbc,0xd3,0x0a,0xf7,0xe4,0x58,0x05,0xb8,0xb3,0x45,0x06,
  0xd0,0x2c,0x1e,0x8f,0xca,0x3f,0x0f,0x02,0xc1,0xaf,0xbd,0x03,0x01,0x13,0x8a,0x6b,
  0x3a,0x91,0x11,0x41,0x4f,0x67,0xdc,0xea,0x97,0xf2,0xcf,0xce,0xf0,0xb4,0xe6,0x73,
  0x96,0xac,0x74,0x22,0xe7,0xad,0x35,0x85,0xe2,0xf9,0x37,0xe8,0x1c,0x75,0xdf,0x6e,
  0x47,0xf1,0x1a,0x71,0x1d,0x29,0xc5,0x89,0x6f,0xb7,0x62,0x0e,0xaa,0x18,0xbe,0x1b,
  0xfc,0x56,0x3e,0x4b,0xc6,0xd2,0x79,0x20,0x9a,0xdb,0xc0,0xfe,0x78,0xcd,0x5a,0xf4,
  0x1f,0xdd,0xa8,0x33,0x88,0x07,0xc7,0x31,0xb1,0x12,0x10,0x59,0x27,0x80,0xec,0x5f,
  0x60,0x51,0x7f,0xa9,0x19,0xb5,0x4a,0x0d,0x2d,0xe5,0x7a,0x9f,0x93,0xc9,0x9c,0xef,
  0xa0,0xe0,0x3b,0x4d,0xae,0x2a,0xf5,0xb0,0xc8,0xeb,0xbb,0x3c,0x83,0x53,0x99,0x61,
  0x17,0x2b,0x04,0x7e,0xba,0x77,0xd6,0x26,0xe1,0x69,0x14,0x63,0x55,0x21,0x0c,0x7d
]);

const SBOX = new Uint8Array([
  0x63,0x7c,0x77,0x7b,0xf2,0x6b,0x6f,0xc5,0x30,0x01,0x67,0x2b,0xfe,0xd7,0xab,0x76,
  0xca,0x82,0xc9,0x7d,0xfa,0x59,0x47,0xf0,0xad,0xd4,0xa2,0xaf,0x9c,0xa4,0x72,0xc0,
  0xb7,0xfd,0x93,0x26,0x36,0x3f,0xf7,0xcc,0x34,0xa5,0xe5,0xf1,0x71,0xd8,0x31,0x15,
  0x04,0xc7,0x23,0xc3,0x18,0x96,0x05,0x9a,0x07,0x12,0x80,0xe2,0xeb,0x27,0xb2,0x75,
  0x09,0x83,0x2c,0x1a,0x1b,0x6e,0x5a,0xa0,0x52,0x3b,0xd6,0xb3,0x29,0xe3,0x2f,0x84,
  0x53,0xd1,0x00,0xed,0x20,0xfc,0xb1,0x5b,0x6a,0xcb,0xbe,0x39,0x4a,0x4c,0x58,0xcf,
  0xd0,0xef,0xaa,0xfb,0x43,0x4d,0x33,0x85,0x45,0xf9,0x02,0x7f,0x50,0x3c,0x9f,0xa8,
  0x51,0xa3,0x40,0x8f,0x92,0x9d,0x38,0xf5,0xbc,0xb6,0xda,0x21,0x10,0xff,0xf3,0xd2,
  0xcd,0x0c,0x13,0xec,0x5f,0x97,0x44,0x17,0xc4,0xa7,0x7e,0x3d,0x64,0x5d,0x19,0x73,
  0x60,0x81,0x4f,0xdc,0x22,0x2a,0x90,0x88,0x46,0xee,0xb8,0x14,0xde,0x5e,0x0b,0xdb,
  0xe0,0x32,0x3a,0x0a,0x49,0x06,0x24,0x5c,0xc2,0xd3,0xac,0x62,0x91,0x95,0xe4,0x79,
  0xe7,0xc8,0x37,0x6d,0x8d,0xd5,0x4e,0xa9,0x6c,0x56,0xf4,0xea,0x65,0x7a,0xae,0x08,
  0xba,0x78,0x25,0x2e,0x1c,0xa6,0xb4,0xc6,0xe8,0xdd,0x74,0x1f,0x4b,0xbd,0x8b,0x8a,
  0x70,0x3e,0xb5,0x66,0x48,0x03,0xf6,0x0e,0x61,0x35,0x57,0xb9,0x86,0xc1,0x1d,0x9e,
  0xe1,0xf8,0x98,0x11,0x69,0xd9,0x8e,0x94,0x9b,0x1e,0x87,0xe9,0xce,0x55,0x28,0xdf,
  0x8c,0xa1,0x89,0x0d,0xbf,0xe6,0x42,0x68,0x41,0x99,0x2d,0x0f,0xb0,0x54,0xbb,0x16
]);

const RCON = [0x00,0x01,0x02,0x04,0x08,0x10,0x20,0x40,0x80,0x1b,0x36];

function gmul(a, b) {
  let p = 0;
  for (let i = 0; i < 8; i++) {
    if (b & 1) p ^= a;
    const hi = a & 0x80;
    a = (a << 1) & 0xff;
    if (hi) a ^= 0x1b;
    b >>= 1;
  }
  return p;
}

function expandAesKey(keyBytes) {
  const Nk = keyBytes.length / 4;
  const Nr = Nk + 6;
  const words = new Uint32Array(4 * (Nr + 1));
  for (let i = 0; i < Nk; i++) {
    words[i] = (keyBytes[4 * i] << 24) | (keyBytes[4 * i + 1] << 16) | (keyBytes[4 * i + 2] << 8) | keyBytes[4 * i + 3];
  }
  for (let i = Nk; i < words.length; i++) {
    let temp = words[i - 1];
    if (i % Nk === 0) {
      temp = ((temp << 8) | (temp >>> 24)) >>> 0;
      temp = (
        (SBOX[(temp >>> 24) & 0xff] << 24) |
        (SBOX[(temp >>> 16) & 0xff] << 16) |
        (SBOX[(temp >>> 8) & 0xff] << 8) |
        SBOX[temp & 0xff]
      ) ^ (RCON[i / Nk] << 24);
    } else if (Nk > 6 && i % Nk === 4) {
      temp = (
        (SBOX[(temp >>> 24) & 0xff] << 24) |
        (SBOX[(temp >>> 16) & 0xff] << 16) |
        (SBOX[(temp >>> 8) & 0xff] << 8) |
        SBOX[temp & 0xff]
      );
    }
    words[i] = (words[i - Nk] ^ temp) >>> 0;
  }
  return { words, Nr };
}

function aesDecryptEcb(cipherBytes, keyBytes) {
  const { words, Nr } = expandAesKey(keyBytes);
  const out = new Uint8Array(cipherBytes.length);
  const s = new Uint8Array(16);

  const addRoundKey = (round) => {
    for (let c = 0; c < 4; c++) {
      const w = words[round * 4 + c];
      s[c * 4] ^= (w >>> 24) & 0xff;
      s[c * 4 + 1] ^= (w >>> 16) & 0xff;
      s[c * 4 + 2] ^= (w >>> 8) & 0xff;
      s[c * 4 + 3] ^= w & 0xff;
    }
  };

  const invShiftRows = () => {
    let t = s[13]; s[13] = s[9]; s[9] = s[5]; s[5] = s[1]; s[1] = t;
    t = s[2]; s[2] = s[10]; s[10] = t;
    t = s[6]; s[6] = s[14]; s[14] = t;
    t = s[3]; s[3] = s[7]; s[7] = s[11]; s[11] = s[15]; s[15] = t;
  };

  const invSubBytes = () => {
    for (let i = 0; i < 16; i++) s[i] = INV_SBOX[s[i]];
  };

  const invMixColumns = () => {
    for (let c = 0; c < 4; c++) {
      const i = c * 4;
      const a0 = s[i], a1 = s[i + 1], a2 = s[i + 2], a3 = s[i + 3];
      s[i] = gmul(0x0e, a0) ^ gmul(0x0b, a1) ^ gmul(0x0d, a2) ^ gmul(0x09, a3);
      s[i + 1] = gmul(0x09, a0) ^ gmul(0x0e, a1) ^ gmul(0x0b, a2) ^ gmul(0x0d, a3);
      s[i + 2] = gmul(0x0d, a0) ^ gmul(0x09, a1) ^ gmul(0x0e, a2) ^ gmul(0x0b, a3);
      s[i + 3] = gmul(0x0b, a0) ^ gmul(0x0d, a1) ^ gmul(0x09, a2) ^ gmul(0x0e, a3);
    }
  };

  for (let offset = 0; offset + 16 <= cipherBytes.length; offset += 16) {
    s.set(cipherBytes.subarray(offset, offset + 16));
    addRoundKey(Nr);
    for (let r = Nr - 1; r >= 1; r--) {
      invShiftRows();
      invSubBytes();
      addRoundKey(r);
      invMixColumns();
    }
    invShiftRows();
    invSubBytes();
    addRoundKey(0);
    out.set(s, offset);
  }
  return out;
}

async function digestHash(alg, data) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('WebCrypto API (crypto.subtle) não disponível neste ambiente.');
  }
  const map = { SHA1: 'SHA-1', 'SHA-1': 'SHA-1', SHA256: 'SHA-256', 'SHA-256': 'SHA-256', SHA512: 'SHA-512', 'SHA-512': 'SHA-512' };
  const buf = await subtle.digest(map[alg] || alg, data);
  return new Uint8Array(buf);
}

function aesDecryptCbc(cipherBytes, keyBytes, ivBytes) {
  // Segmentos OOXML usam AES-CBC sem padding PKCS7; deciframos bloco a bloco para jamais truncar 0x01..0x10 finais
  const paddedBlockCount = Math.ceil(cipherBytes.length / 16) * 16;
  const aligned = new Uint8Array(paddedBlockCount);
  aligned.set(cipherBytes.subarray(0, paddedBlockCount));
  const ecb = aesDecryptEcb(aligned, keyBytes);
  const res = new Uint8Array(aligned.length);
  let prev = ivBytes;
  for (let i = 0; i < aligned.length; i += 16) {
    for (let b = 0; b < 16; b++) res[i + b] = ecb[i + b] ^ prev[b];
    prev = aligned.subarray(i, i + 16);
  }
  return res;
}

function encodeUtf16Le(str) {
  const out = new Uint8Array(str.length * 2);
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    out[i * 2] = code & 0xff;
    out[i * 2 + 1] = (code >>> 8) & 0xff;
  }
  return out;
}

function toUint8(buffer) {
  if (buffer instanceof Uint8Array) return buffer;
  if (buffer instanceof ArrayBuffer) return new Uint8Array(buffer);
  return new Uint8Array(buffer.buffer || buffer);
}

function readU16(bytes, off) {
  return bytes[off] | (bytes[off + 1] << 8);
}

function readU32(bytes, off) {
  return (bytes[off] | (bytes[off + 1] << 8) | (bytes[off + 2] << 16) | (bytes[off + 3] << 24)) >>> 0;
}

function concatBytes(...arrays) {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const a of arrays) {
    out.set(a, pos);
    pos += a.length;
  }
  return out;
}

function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function base64ToBytes(b64) {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(b64, 'base64'));
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Verifica se o buffer é um container OLE2 OOXML contendo EncryptionInfo e EncryptedPackage.
 */
export function isEncryptedOoxmlBuffer(buffer) {
  const bytes = toUint8(buffer);
  if (bytes.length < 512) return false;
  // Assinatura OLE2 D0 CF 11 E0
  if (bytes[0] !== 0xd0 || bytes[1] !== 0xcf || bytes[2] !== 0x11 || bytes[3] !== 0xe0) {
    return false;
  }
  try {
    const cfb = XLSXLib.CFB.read(bytes, { type: 'array' });
    const hasInfo = Boolean(XLSXLib.CFB.find(cfb, 'EncryptionInfo'));
    const hasPkg = Boolean(XLSXLib.CFB.find(cfb, 'EncryptedPackage'));
    return hasInfo && hasPkg;
  } catch {
    return false;
  }
}

async function decryptStandardEncryption(infoBytes, pkgBytes, password) {
  const headerSize = readU32(infoBytes, 8);
  const keyBits = readU32(infoBytes, 12 + 16) || 128;
  const keyBytesLen = Math.max(16, Math.floor(keyBits / 8));
  const verifierOff = 12 + headerSize;
  const saltSize = readU32(infoBytes, verifierOff);
  const salt = infoBytes.subarray(verifierOff + 4, verifierOff + 4 + saltSize);
  const encryptedVerifier = infoBytes.subarray(verifierOff + 20, verifierOff + 36);
  const verifierHashSize = readU32(infoBytes, verifierOff + 36);
  const encryptedVerifierHash = infoBytes.subarray(verifierOff + 40, verifierOff + 72);

  let h = await digestHash('SHA-1', concatBytes(salt, encodeUtf16Le(password)));
  const iterBuf = new Uint8Array(4);
  const iterView = new DataView(iterBuf.buffer);
  for (let i = 0; i < 50000; i++) {
    iterView.setUint32(0, i, true);
    h = await digestHash('SHA-1', concatBytes(iterBuf, h));
  }
  const hFinal = await digestHash('SHA-1', concatBytes(h, new Uint8Array([0, 0, 0, 0])));
  const buf1 = new Uint8Array(64).fill(0x36);
  const buf2 = new Uint8Array(64).fill(0x5c);
  for (let i = 0; i < hFinal.length; i++) {
    buf1[i] ^= hFinal[i];
    buf2[i] ^= hFinal[i];
  }
  const x1 = await digestHash('SHA-1', buf1);
  const x2 = await digestHash('SHA-1', buf2);
  const derivedKey = concatBytes(x1, x2).subarray(0, keyBytesLen);

  const decVerifier = aesDecryptEcb(encryptedVerifier, derivedKey);
  const decVerifierHash = aesDecryptEcb(encryptedVerifierHash, derivedKey);
  const expectedHash = await digestHash('SHA-1', decVerifier);

  if (!bytesEqual(expectedHash.subarray(0, verifierHashSize || 20), decVerifierHash.subarray(0, verifierHashSize || 20))) {
    const err = new Error('Senha incorreta para a planilha protegida.');
    err.code = 'INVALID_PASSWORD';
    throw err;
  }

  const unencryptedSize = readU32(pkgBytes, 0) + readU32(pkgBytes, 4) * 0x100000000;
  const decrypted = aesDecryptEcb(pkgBytes.subarray(8), derivedKey);
  return decrypted.subarray(0, unencryptedSize);
}

function getXmlAttr(xml, tagRegex, attr) {
  const tagMatch = xml.match(tagRegex);
  if (!tagMatch) return null;
  const attrMatch = tagMatch[0].match(new RegExp(`${attr}="([^"]+)"`, 'i'));
  return attrMatch ? attrMatch[1] : null;
}

function padOrTruncate(bytes, targetLen, padByte = 0x36) {
  if (bytes.length === targetLen) return bytes;
  const out = new Uint8Array(targetLen).fill(padByte);
  out.set(bytes.subarray(0, Math.min(bytes.length, targetLen)));
  return out;
}

async function decryptAgileEncryption(infoBytes, pkgBytes, password) {
  const xml = new TextDecoder('utf-8').decode(infoBytes.subarray(8));
  const kdSalt = base64ToBytes(getXmlAttr(xml, /<keyData\b[^>]*>/i, 'saltValue') || '');
  const kdHashAlg = getXmlAttr(xml, /<keyData\b[^>]*>/i, 'hashAlgorithm') || 'SHA512';
  const kdBlockSize = Number(getXmlAttr(xml, /<keyData\b[^>]*>/i, 'blockSize') || 16);

  const encKeyTagRegex = /<(?:\w+:)?encryptedKey\b[^>]*>/i;
  const pSalt = base64ToBytes(getXmlAttr(xml, encKeyTagRegex, 'saltValue') || '');
  const pBlockSize = Number(getXmlAttr(xml, encKeyTagRegex, 'blockSize') || kdBlockSize || 16);
  const spinCount = Number(getXmlAttr(xml, encKeyTagRegex, 'spinCount') || 100000);
  const pKeyBits = Number(getXmlAttr(xml, encKeyTagRegex, 'keyBits') || 256);
  const pHashAlg = getXmlAttr(xml, encKeyTagRegex, 'hashAlgorithm') || 'SHA512';
  const encVerifierInput = base64ToBytes(getXmlAttr(xml, encKeyTagRegex, 'encryptedVerifierHashInput') || '');
  const encVerifierValue = base64ToBytes(getXmlAttr(xml, encKeyTagRegex, 'encryptedVerifierHashValue') || '');
  const encKeyValue = base64ToBytes(getXmlAttr(xml, encKeyTagRegex, 'encryptedKeyValue') || '');

  let h = await digestHash(pHashAlg, concatBytes(pSalt, encodeUtf16Le(password)));
  const iterBuf = new Uint8Array(4);
  const iterView = new DataView(iterBuf.buffer);
  for (let i = 0; i < spinCount; i++) {
    iterView.setUint32(0, i, true);
    h = await digestHash(pHashAlg, concatBytes(iterBuf, h));
  }

  const keyLen = Math.floor(pKeyBits / 8);
  const deriveKeyForBlock = async (blockKey) => {
    const raw = await digestHash(pHashAlg, concatBytes(h, new Uint8Array(blockKey)));
    return padOrTruncate(raw, keyLen, 0x36);
  };

  const kInput = await deriveKeyForBlock([0xfe, 0xa7, 0xd2, 0x76, 0x3b, 0x4b, 0x9e, 0x79]);
  const kValue = await deriveKeyForBlock([0xd7, 0xaa, 0x0f, 0x6d, 0x30, 0x61, 0x34, 0x4e]);
  const kSecret = await deriveKeyForBlock([0x14, 0x6e, 0x0b, 0xe7, 0xab, 0xac, 0xd0, 0xd6]);

  const ivSalt = padOrTruncate(pSalt, pBlockSize, 0x36);
  const decInput = aesDecryptCbc(encVerifierInput, kInput, ivSalt);
  const decValue = aesDecryptCbc(encVerifierValue, kValue, ivSalt);
  const expectedHash = await digestHash(pHashAlg, decInput.subarray(0, encVerifierInput.length));

  if (!bytesEqual(expectedHash, decValue.subarray(0, expectedHash.length))) {
    const err = new Error('Senha incorreta para a planilha protegida.');
    err.code = 'INVALID_PASSWORD';
    throw err;
  }

  const packageKey = aesDecryptCbc(encKeyValue, kSecret, ivSalt).subarray(0, keyLen);
  const unencryptedSize = readU32(pkgBytes, 0) + readU32(pkgBytes, 4) * 0x100000000;
  const cipherData = pkgBytes.subarray(8);
  const result = new Uint8Array(unencryptedSize);
  const segSize = 4096;
  const segBuf = new Uint8Array(4);
  const segView = new DataView(segBuf.buffer);

  for (let segIdx = 0, offset = 0; offset < cipherData.length; segIdx++, offset += segSize) {
    segView.setUint32(0, segIdx, true);
    const ivRaw = await digestHash(kdHashAlg, concatBytes(kdSalt, segBuf));
    const iv = padOrTruncate(ivRaw, kdBlockSize, 0x36);
    const chunk = cipherData.subarray(offset, Math.min(cipherData.length, offset + segSize));
    const decChunk = aesDecryptCbc(chunk, packageKey, iv);
    const copyLen = Math.min(decChunk.length, unencryptedSize - offset);
    if (copyLen > 0) result.set(decChunk.subarray(0, copyLen), offset);
  }
  return result;
}

/**
 * Descriptografa arquivos Excel OOXML (Standard 4.2 ou Agile 4.4) retornando o ZIP xlsx pronto para SheetJS.
 */
export async function decryptOoxmlPackage(buffer, password) {
  const bytes = toUint8(buffer);
  if (!isEncryptedOoxmlBuffer(bytes)) {
    const err = new Error('Buffer não é um pacote OOXML criptografado.');
    err.code = 'NOT_ENCRYPTED';
    throw err;
  }

  const cfb = XLSXLib.CFB.read(bytes, { type: 'array' });
  const infoEntry = XLSXLib.CFB.find(cfb, 'EncryptionInfo');
  const pkgEntry = XLSXLib.CFB.find(cfb, 'EncryptedPackage');
  const infoBytes = toUint8(infoEntry.content);
  const pkgBytes = toUint8(pkgEntry.content);

  const major = readU16(infoBytes, 0);
  const minor = readU16(infoBytes, 2);

  if (major === 4 && minor === 4) {
    return decryptAgileEncryption(infoBytes, pkgBytes, String(password ?? ''));
  }
  return decryptStandardEncryption(infoBytes, pkgBytes, String(password ?? ''));
}
