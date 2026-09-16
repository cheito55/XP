/**
 * Pure JS DES/3DES/AES implementations for Cloudflare Workers
 * Web Crypto API no soporta DES en CF Workers
 */

// === DES Implementation ===
const DES_SBOX = [
  [14,4,13,1,2,15,11,8,3,10,6,12,5,9,0,7,0,15,7,4,14,2,13,1,10,6,12,11,9,5,3,8,4,1,14,8,13,6,2,11,15,12,9,7,3,10,5,0,15,12,8,2,4,9,1,7,5,11,3,14,10,0,6,13],
  [15,1,8,14,6,11,3,4,9,7,2,13,12,0,5,10,3,13,4,7,15,2,8,14,12,0,1,10,6,9,11,5,0,14,7,11,10,4,13,1,5,8,12,6,9,3,2,15,13,8,10,1,3,15,4,2,11,6,7,12,0,5,14,9],
  [10,0,9,14,6,3,15,5,1,13,12,7,11,4,2,8,13,7,0,9,3,4,6,10,2,8,5,14,12,11,15,1,13,6,4,9,8,15,3,0,11,1,2,12,5,10,14,7,1,7,4,13,1,6,12,11,9,5,3,8,4,14,9,15,2,8],
  [7,13,14,3,0,6,9,10,1,2,8,5,11,12,4,15,13,8,11,5,6,15,0,3,4,7,2,12,1,10,14,9,10,6,9,0,12,11,7,13,15,1,3,14,5,2,8,4,3,15,0,6,10,1,13,8,9,4,5,11,12,7,2,14],
  [2,12,4,1,7,10,11,6,8,5,3,15,13,0,14,9,14,11,2,12,4,7,13,1,5,0,15,10,3,9,8,6,4,2,1,11,10,13,7,8,15,9,12,5,6,3,0,14,11,8,12,7,1,14,2,13,6,15,0,9,10,4,5,3],
  [12,1,10,15,9,2,6,8,0,13,3,4,14,7,5,11,10,15,4,2,7,12,9,5,6,1,13,14,0,11,3,8,9,14,15,5,2,8,12,3,7,0,4,10,1,13,11,6,4,3,2,12,9,5,15,10,11,14,1,7,6,0,8,13],
  [4,11,2,14,15,0,8,13,3,12,9,7,5,10,6,1,13,0,11,7,4,9,1,10,14,3,5,12,2,15,8,6,1,4,11,13,12,3,7,14,10,15,6,8,0,5,9,2,6,11,13,8,1,4,10,7,9,5,0,15,14,2,3,12],
  [13,2,8,4,6,15,11,1,10,9,3,14,5,0,12,7,1,15,13,8,10,3,7,4,12,5,6,2,0,14,9,11,7,4,0,5,10,2,15,14,2,1,13,12,8,9,0,6,7,14,2,4,11,13,6,1,9,8,12,5,15,3,10]
];

const DES_IP = [58,50,42,34,26,18,10,2,60,52,44,36,28,20,12,4,62,54,46,38,30,22,14,6,64,56,48,40,32,24,16,8,57,49,41,33,25,17,9,1,59,51,43,35,27,19,11,3,61,53,45,37,29,21,13,5,63,55,47,39,31,23,15,7];
const DES_FP = [40,8,48,16,56,24,64,32,39,7,47,15,55,23,63,31,38,6,46,14,54,22,62,30,37,5,45,13,53,21,61,29,36,4,44,12,52,20,60,28,35,3,43,11,51,19,59,27,34,2,42,10,50,18,58,26,33,1,41,9,49,17,57,25];
const DES_E = [32,1,2,3,4,5,4,5,6,7,8,9,8,9,10,11,12,13,12,13,14,15,16,17,16,17,18,19,20,21,20,21,22,23,24,25,24,25,26,27,28,29,28,29,30,31,32,1];
const DES_P = [16,7,20,21,29,12,28,17,1,15,23,26,5,18,31,10,2,8,24,14,32,27,3,9,19,13,30,6,22,11,4,25];
const DES_PC1 = [57,49,41,33,25,17,9,1,58,50,42,34,26,18,10,2,59,51,43,35,27,19,11,3,60,52,44,36,63,55,47,39,31,23,15,7,62,54,46,38,30,22,14,6,61,53,45,37,29,21,13,5,28,20,12,4];
const DES_PC2 = [14,17,11,24,1,5,3,28,15,6,21,10,23,19,12,4,26,8,16,7,27,20,13,2,41,52,31,37,47,55,30,40,51,45,33,48,44,49,39,56,34,53,46,42,50,36,29,32];
const DES_SHIFTS = [1,1,2,2,2,2,2,2,1,2,2,2,2,2,2,1];

function desCreateKeys(keyBytes) {
  let key = [];
  for (let i = 0; i < 8; i++) {
    let b = keyBytes[i];
    key.push((b >> 7) & 1, (b >> 6) & 1, (b >> 5) & 1, (b >> 4) & 1, (b >> 3) & 1, (b >> 2) & 1, (b >> 1) & 1, b & 1);
  }
  let C = [], D = [];
  for (let i = 0; i < 28; i++) {
    C.push(key[DES_PC1[i] - 1]);
    D.push(key[DES_PC1[i + 28] - 1]);
  }
  let subkeys = [];
  for (let round = 0; round < 16; round++) {
    for (let i = 0; i < DES_SHIFTS[round]; i++) {
      C.push(C.shift());
      D.push(D.shift());
    }
    let CD = C.concat(D);
    let k = [];
    for (let i = 0; i < 48; i++) k.push(CD[DES_PC2[i] - 1]);
    subkeys.push(k);
  }
  return subkeys;
}

function desProcessBlock(block, subkeys, encrypt) {
  let bits = [];
  for (let i = 0; i < 8; i++) {
    let b = block[i];
    for (let j = 7; j >= 0; j--) bits.push((b >> j) & 1);
  }
  let perm = [];
  for (let i = 0; i < 64; i++) perm.push(bits[DES_IP[i] - 1]);
  let L = perm.slice(0, 32);
  let R = perm.slice(32, 64);
  let keys = encrypt ? subkeys : subkeys.slice().reverse();
  for (let round = 0; round < 16; round++) {
    let eR = [];
    for (let i = 0; i < 48; i++) eR.push(R[DES_E[i] - 1]);
    let xored = eR.map((v, i) => v ^ keys[round][i]);
    let sOut = [];
    for (let i = 0; i < 8; i++) {
      let row = (xored[i * 6] << 1) | xored[i * 6 + 5];
      let col = (xored[i * 6 + 1] << 3) | (xored[i * 6 + 2] << 2) | (xored[i * 6 + 3] << 1) | xored[i * 6 + 4];
      let val = DES_SBOX[i][row * 16 + col];
      sOut.push((val >> 3) & 1, (val >> 2) & 1, (val >> 1) & 1, val & 1);
    }
    let f = [];
    for (let i = 0; i < 32; i++) f.push(sOut[DES_P[i] - 1]);
    let newR = L.map((v, i) => v ^ f[i]);
    L = R.slice();
    R = newR;
  }
  let combined = R.concat(L);
  let result = [];
  for (let i = 0; i < 64; i++) result.push(combined[DES_FP[i] - 1]);
  let out = [];
  for (let i = 0; i < 8; i++) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | result[i * 8 + j];
    out.push(b);
  }
  return out;
}

function desEncryptBlock(block, subkeys) { return desProcessBlock(block, subkeys, true); }
function desDecryptBlock(block, subkeys) { return desProcessBlock(block, subkeys, false); }

function desPkcs5Pad(data) {
  let padLen = 8 - (data.length % 8);
  let padded = new Uint8Array(data.length + padLen);
  padded.set(data);
  for (let i = data.length; i < padded.length; i++) padded[i] = padLen;
  return padded;
}

function desPkcs5Unpad(data) {
  let padLen = data[data.length - 1];
  if (padLen < 1 || padLen > 8) return data;
  return data.slice(0, data.length - padLen);
}

function desEcbEncrypt(plaintext, keyBytes) {
  let subkeys = desCreateKeys(keyBytes);
  let padded = desPkcs5Pad(new TextEncoder().encode(plaintext));
  let result = [];
  for (let i = 0; i < padded.length; i += 8) {
    let block = Array.from(padded.slice(i, i + 8));
    result.push(...desEncryptBlock(block, subkeys));
  }
  return new Uint8Array(result);
}

function desEcbDecrypt(ciphertext, keyBytes) {
  let subkeys = desCreateKeys(keyBytes);
  let result = [];
  for (let i = 0; i < ciphertext.length; i += 8) {
    let block = Array.from(ciphertext.slice(i, i + 8));
    result.push(...desDecryptBlock(block, subkeys));
  }
  return desPkcs5Unpad(new Uint8Array(result));
}

function des3EcbEncrypt(plaintext, key24) {
  let k1 = key24.slice(0, 8);
  let k2 = key24.slice(8, 16);
  let k3 = key24.slice(16, 24);
  let sk1 = desCreateKeys(k1);
  let sk2 = desCreateKeys(k2);
  let sk3 = desCreateKeys(k3);
  let padded = desPkcs5Pad(new TextEncoder().encode(plaintext));
  let result = [];
  for (let i = 0; i < padded.length; i += 8) {
    let block = Array.from(padded.slice(i, i + 8));
    block = desEncryptBlock(block, sk1);
    block = desDecryptBlock(block, sk2);
    block = desEncryptBlock(block, sk3);
    result.push(...block);
  }
  return new Uint8Array(result);
}

function des3EcbDecrypt(ciphertext, key24) {
  let k1 = key24.slice(0, 8);
  let k2 = key24.slice(8, 16);
  let k3 = key24.slice(16, 24);
  let sk1 = desCreateKeys(k1);
  let sk2 = desCreateKeys(k2);
  let sk3 = desCreateKeys(k3);
  let result = [];
  for (let i = 0; i < ciphertext.length; i += 8) {
    let block = Array.from(ciphertext.slice(i, i + 8));
    block = desDecryptBlock(block, sk3);
    block = desEncryptBlock(block, sk2);
    block = desDecryptBlock(block, sk1);
    result.push(...block);
  }
  return desPkcs5Unpad(new Uint8Array(result));
}

// === Hex/Base64 helpers ===
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  return bytes;
}

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function base64Encode(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64Decode(str) {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// === Public API ===
export function tripleDesEncrypt(plaintext, keyHex) {
  const keyBytes = hexToBytes(keyHex);
  // 3DES needs 24 bytes - extend 16 byte key by repeating first 8
  let key24 = new Uint8Array(24);
  key24.set(keyBytes.slice(0, 16));
  key24.set(keyBytes.slice(0, 8), 16);
  const encrypted = des3EcbEncrypt(plaintext, key24);
  return base64Encode(encrypted);
}

export function tripleDesDecrypt(ciphertext, keyHex) {
  const keyBytes = hexToBytes(keyHex);
  let key24 = new Uint8Array(24);
  key24.set(keyBytes.slice(0, 16));
  key24.set(keyBytes.slice(0, 8), 16);
  const decoded = base64Decode(ciphertext);
  const decrypted = des3EcbDecrypt(decoded, key24);
  return new TextDecoder().decode(decrypted);
}

export function desEncryptStr(plaintext, keyStr) {
  const keyBytes = new TextEncoder().encode(keyStr);
  const encrypted = desEcbEncrypt(plaintext, keyBytes);
  return base64Encode(encrypted);
}

export { hexToBytes, bytesToHex, base64Encode, base64Decode };

// === AES-CBC/PKCS5Padding (Web Crypto API) ===
export async function aesEncrypt(plaintext, keyStr, ivStr) {
  const keyBytes = new TextEncoder().encode(keyStr);
  const ivBytes = new TextEncoder().encode(ivStr);
  
  const cryptoKey = await crypto.subtle.importKey(
    "raw", keyBytes.slice(0, 16), { name: "AES-CBC" }, false, ["encrypt"]
  );
  
  const padded = pkcs5Pad(new TextEncoder().encode(plaintext));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-CBC", iv: ivBytes }, cryptoKey, padded);
  return new Uint8Array(encrypted);
}

export async function aesDecrypt(ciphertext, keyStr, ivStr) {
  const keyBytes = new TextEncoder().encode(keyStr);
  const ivBytes = new TextEncoder().encode(ivStr);
  
  const cryptoKey = await crypto.subtle.importKey(
    "raw", keyBytes.slice(0, 16), { name: "AES-CBC" }, false, ["decrypt"]
  );
  
  const decrypted = await crypto.subtle.decrypt({ name: "AES-CBC", iv: ivBytes }, cryptoKey, ciphertext);
  return pkcs5Unpad(new Uint8Array(decrypted));
}

function pkcs5Pad(data) {
  const padLen = 16 - (data.length % 16);
  const padded = new Uint8Array(data.length + padLen);
  padded.set(data);
  for (let i = data.length; i < padded.length; i++) padded[i] = padLen;
  return padded;
}

function pkcs5Unpad(data) {
  const padLen = data[data.length - 1];
  if (padLen < 1 || padLen > 16) return data;
  return data.slice(0, data.length - padLen);
}

// === Custom Base64 (from r8/b.smali) ===
const CUSTOM_ALPHABET = "jWB7YtC3n9iXbEkUcJl1VxF4STpQoOIaRmh2M-efAgLwPqGr6uyD5vNsdH_Kz0Z8";

export function customBase64Encode(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  // Custom base64 encoding
  const standard = btoa(binary);
  // Map standard base64 to custom alphabet
  const stdAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let result = "";
  for (let i = 0; i < standard.length; i++) {
    const ch = standard[i];
    const idx = stdAlphabet.indexOf(ch);
    if (idx === -1) {
      result += ch;
    } else {
      result += CUSTOM_ALPHABET[idx];
    }
  }
  return result;
}

export function customBase64Decode(str) {
  const stdAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let standard = "";
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    const idx = CUSTOM_ALPHABET.indexOf(ch);
    if (idx === -1) {
      standard += ch;
    } else {
      standard += stdAlphabet[idx];
    }
  }
  const binary = atob(standard);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
