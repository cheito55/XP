/**
 * XuperTv Bridge - Cloudflare Worker v7.0
 * Criptografía descifrada por ingeniería inversa
 * 3DES/ECB + DES/ECB + AES/CBC
 * REPOSITORIO: https://github.com/cheito55/XP
 */

import { tripleDesEncrypt, tripleDesDecrypt, desEncryptStr, hexToBytes, bytesToHex, base64Encode, base64Decode } from './crypto.js';

const PKG = "com.android.msandroid";
const VER = "49902";
const UA = "Ranger/4.9.4-17294ac0";
const SLB_HOST = "yuwc.swzablvpm.com";
const NOTICE_HOST = "nxiqj.jgrqyxupl.com";
const AD_HOST = "yvhcn.hxjebagrv.com";

// Claves descifradas del APK (ingeniería inversa smali)
const CRYPTO = {
  // 3DES/ECB key (hex decoded → 16 bytes) - SharedPreferences encrypt/decrypt
  tripleDesKey: "1b494e53756c664c2f44465245733572",
  // DES/ECB key (ASCII) - HTTP interceptor host encryption
  desKey: "okwVTyAW",
  // AES key (ASCII) + IV - brasiltv utils
  aesKey: "b972E8a5A4e0e8Ff",
  aesIv: "2c6b361ee550e80c"
};

// Tokens capturados
const CAPTURED = {
  userId: "556784760",
  devId: "761cd6edc9681aa5d27dd1e1fa38ae08",
  authId: "556784760_com.android.msandroid__0",
  rangerIds: ["70O6ExufdV3-baklZhWeds3CllXZe2LyQ_", "579HZKNkmYW1-AB8LOHnmlWj88-Lg9s_gp", "75kSojL-zgSay81VOeqCzKS4VVDPFVVnRF"],
  clientIp: "181.13.74.206",
  contentLicenseToken: "DC17EFD1C90A24516D88A187D5A12CB6",
  channels: [{ id: "cyx_50fdcc0817d61_720p", name: "Canal en Vivo 1", type: "live", tag: "free", scheme: "md5-01" }],
  vod: [
    { mediaCode: "4DC7E29C0EF941318307436A9CCDCDE0", title: "Contenido VOD 1", type: "vod", tag: "free", scheme: "slb" },
    { mediaCode: "7C81D68A2E9A4A3C8B3AEED8CE549912", title: "Contenido VOD 2", type: "vod", tag: "free", scheme: "slb" },
    { mediaCode: "496D2957D3EC45EFB2F34BDCF3B877C0", title: "Contenido VOD 3", type: "vod", tag: "free", scheme: "slb" }
  ]
};

let USER_CONFIG = {
  userId: CAPTURED.userId, devId: CAPTURED.devId,
  rangerId: CAPTURED.rangerIds[0], authId: CAPTURED.authId,
  clientIp: CAPTURED.clientIp
};
let SLB_AUTH = "";
let LIVE_TOKENS = {};
let WS_SESSIONS = {};

// === CORS ===
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Auth-Token, X-Config"
};

function json(d, s) { return new Response(JSON.stringify(d), { status: s || 200, headers: { "Content-Type": "application/json", ...CORS } }); }
function err(m, s) { return json({ ok: false, error: m }, s || 400); }

// === Crypto (pure JS DES/3DES - ver crypto.js) ===
// tripleDesEncrypt, tripleDesDecrypt, desEncryptStr importados de crypto.js

// === Portal WS Connection (via HTTP CONNECT) ===
async function connectToPortal() {
  const hash = genHash(16);
  const portalUrl = `http://s23sdf56.45lc9mx79ab.com/v1/ws/${hash}`;

  try {
    const resp = await fetch(portalUrl, {
      headers: {
        "Upgrade": "websocket",
        "Connection": "Upgrade",
        "Sec-WebSocket-Key": btoa(genHash(16)),
        "Sec-WebSocket-Version": "13"
      }
    });
    if (resp.status === 101) {
      return { ok: true, hash: hash, message: "WS upgrade succeeded" };
    }
    return { ok: false, status: resp.status, hash: hash };
  } catch (e) {
    return { ok: false, error: e.message, hash: hash };
  }
}

function genHash(len) {
  const c = "0123456789abcdef";
  let r = "";
  for (let i = 0; i < (len || 16); i++) r += c[Math.floor(Math.random() * 16)];
  return r;
}

function genTransId() {
  const c = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let r = "";
  for (let i = 0; i < 16; i++) r += c[Math.floor(Math.random() * c.length)];
  return r;
}

// === Health ===
async function handleHealth() {
  return json({
    ok: true, version: "7.0",
    crypto: {
      tripleDesKey: CRYPTO.tripleDesKey,
      desKey: CRYPTO.desKey,
      aesKey: CRYPTO.aesKey,
      aesIv: CRYPTO.aesIv,
      note: "Keys extracted via reverse engineering APK smali"
    },
    captured: CAPTURED, config: USER_CONFIG,
    hasSlbAuth: !!SLB_AUTH,
    wsSessions: Object.keys(WS_SESSIONS).length
  });
}

// === Config ===
async function handleConfig(req) {
  let body = {};
  try { body = await req.json(); } catch (_) {}
  if (body.userId) USER_CONFIG.userId = body.userId;
  if (body.devId) USER_CONFIG.devId = body.devId;
  if (body.rangerId) USER_CONFIG.rangerId = body.rangerId;
  if (body.authId) USER_CONFIG.authId = body.authId;
  if (body.slbAuth) SLB_AUTH = body.slbAuth;
  if (body.liveTokens) LIVE_TOKENS = body.liveTokens;
  return json({ ok: true, config: USER_CONFIG });
}

// === Home ===
function handleHome() {
  const items = [];
  for (const ch of CAPTURED.channels) {
    items.push({ contentId: ch.id, title: ch.name, type: "live", isLive: true, tag: ch.tag, mediaCode: ch.id, logoUrl: "" });
  }
  for (const v of CAPTURED.vod) {
    items.push({ contentId: v.mediaCode, title: v.title, type: "vod", isLive: false, tag: v.tag, mediaCode: v.mediaCode, logoUrl: "" });
  }
  return json({ ok: true, data: items });
}

// === Details ===
async function handleDetails(req) {
  let body = {};
  try { body = await req.json(); } catch (_) {}
  const id = body.contentId || body.id || "";
  if (!id) return err("contentId requerido");
  const all = [...CAPTURED.channels, ...CAPTURED.vod];
  const found = all.find(c => c.id === id || c.mediaCode === id);
  return json({ ok: true, data: { contentId: id, title: found ? found.title : id, type: found ? found.type : "vod", isLive: found ? found.type === "live" : false, tag: found ? found.tag : "free", mediaCode: found ? (found.mediaCode || found.id) : id, scheme: found ? found.scheme : "slb", logoUrl: "", duration: 0, description: "Contenido capturado de XuperTv" } });
}

// === Stream ===
async function handleStream(req) {
  let body = {};
  try { body = await req.json(); } catch (_) {}
  const mediaCode = body.mediaCode || body.contentId || "";
  if (!mediaCode) return err("mediaCode requerido");

  const isLive = CAPTURED.channels.some(c => c.id === mediaCode);
  const now = Math.floor(Date.now() / 1000);

  if (isLive) {
    const lt = LIVE_TOKENS[mediaCode];
    if (!lt) return err("No hay token live para " + mediaCode + ". Actualiza con HydraProxy.");
    const url = "http://" + lt.host + "/live/" + mediaCode + ".m3u8";
    const contentAuth = "/live/?user_id=" + USER_CONFIG.userId + "&trans_id=" + lt.transId + "&app_id=" + PKG + "&host=" + lt.host + "&app_ver=" + VER + "&client_ip=" + USER_CONFIG.clientIp + "&expired=" + lt.expired + "&auth_id=" + USER_CONFIG.authId + "&dev_id=" + USER_CONFIG.devId + "&tag=free&sign_ver=1&token=" + lt.token + "&sign2_method=sign_o3&instance=0&start_moment=" + now + "&sign2=" + lt.sign2;
    return json({ ok: true, streamUrl: url, headers: { "App": PKG, "App-Version": VER, "User-Agent": UA, "Content-Auth": contentAuth, "Content-License": "app_id=" + PKG + "&tag=free&scheme=md5-01&media_code=" + mediaCode + "&expired=1790152178&token=" + CAPTURED.contentLicenseToken, "Ranger-Id": USER_CONFIG.rangerId, "X-Buffer": "0", "Pragma": "akamai-x-cache-on", "Connection": "Keep-Alive" } });
  }

  if (SLB_AUTH) {
    try {
      const slbUrl = "https://" + SLB_HOST + "/slb/v11/vod?auth=" + encodeURIComponent(SLB_AUTH);
      const resp = await fetch(slbUrl, {
        headers: { "App": PKG, "App-Version": VER, "User-Agent": UA, "Content-Type": "application/octet-stream", "Ranger-Id": USER_CONFIG.rangerId, "Content-License": "app_id=" + PKG + "&tag=free&scheme=md5-01&media_code=" + mediaCode + "&expired=1790152178&token=" + CAPTURED.contentLicenseToken }
      });
      const text = await resp.text();
      return json({ ok: true, slbResponse: text, mediaCode: mediaCode });
    } catch (e) {
      return json({ ok: true, error: "SLB failed: " + e.message, mediaCode: mediaCode });
    }
  }

  return json({ ok: true, mediaCode: mediaCode, hint: "Necesita SLB auth token. Envía POST /config con {slbAuth: '...'}" });
}

// === Crypto Test ===
async function handleCryptoTest(req) {
  let body = {};
  try { body = await req.json(); } catch (_) {}

  const results = {};
  try {
    // Test 3DES encrypt/decrypt
    const plaintext = body.text || "test_message";
    const encrypted = tripleDesEncrypt(plaintext, CRYPTO.tripleDesKey);
    const decrypted = tripleDesDecrypt(encrypted, CRYPTO.tripleDesKey);
    results.tripleDes = { plaintext: plaintext, encrypted: encrypted, decrypted: decrypted, match: plaintext === decrypted, hexLen: hexToBytes(encrypted).length };

    // Test DES encrypt
    const desEncrypted = desEncryptStr(plaintext, CRYPTO.desKey);
    results.des = { plaintext: plaintext, encrypted: desEncrypted };
  } catch (e) {
    results.error = e.message;
  }

  return json({ ok: true, results: results, crypto: CRYPTO });
}

// === CDN Proxy ===
async function handleCdnProxy(req) {
  let body = {};
  try { body = await req.json(); } catch (_) {}
  const url = body.url || "";
  if (!url) return err("url requerida");
  const headers = { "App": PKG, "App-Version": VER, "User-Agent": UA, "Pragma": "akamai-x-cache-on", "X-Buffer": body.buffer || "0", "Connection": "Keep-Alive", "Ranger-Id": body.rangerId || USER_CONFIG.rangerId };
  if (body.contentAuth) headers["Content-Auth"] = body.contentAuth;
  if (body.contentLicense) headers["Content-License"] = body.contentLicense;
  if (body.range) headers["Range"] = body.range;
  try {
    const resp = await fetch(url, { headers });
    return new Response(resp.body, { status: resp.status, headers: { "Content-Type": resp.headers.get("Content-Type") || "video/MP2T", "Content-Length": resp.headers.get("Content-Length") || "", "Content-Range": resp.headers.get("Content-Range") || "", ...CORS } });
  } catch (e) { return err("CDN proxy failed: " + e.message, 502); }
}

// === Notice ===
async function handleNotice() {
  try {
    const resp = await fetch("https://" + NOTICE_HOST + "/notice/api/get_notice?pkg=" + PKG + "&v=" + VER + "&sn=&userId=&language=es", { signal: AbortSignal.timeout(8000) });
    const text = await resp.text();
    return json({ ok: true, data: text });
  } catch (e) { return json({ ok: true, data: '{"status":0,"inner":[]}' }); }
}

// === Ads ===
async function handleAds(req) {
  let body = {};
  try { body = await req.json(); } catch (_) {}
  try {
    const resp = await fetch("https://" + AD_HOST + "/api/adserver/v2/get_content", { method: "POST", headers: { "Content-Type": "application/json;charset=utf-8" }, body: JSON.stringify(body) });
    const text = await resp.text();
    return json({ ok: true, data: text });
  } catch (e) { return json({ ok: true, data: '{"ad_positions":null}' }); }
}

// === Token Update ===
async function handleTokenUpdate(req) {
  let body = {};
  try { body = await req.json(); } catch (_) {}
  if (body.slbAuth) SLB_AUTH = body.slbAuth;
  if (body.rangerId) USER_CONFIG.rangerId = body.rangerId;
  if (body.userId) USER_CONFIG.userId = body.userId;
  if (body.devId) USER_CONFIG.devId = body.devId;
  if (body.clientIp) USER_CONFIG.clientIp = body.clientIp;
  if (body.authId) USER_CONFIG.authId = body.authId;
  if (body.contentLicenseToken) CAPTURED.contentLicenseToken = body.contentLicenseToken;
  if (body.channels) CAPTURED.channels = body.channels;
  if (body.vod) CAPTURED.vod = body.vod;
  if (body.liveToken) { LIVE_TOKENS[body.liveToken.mediaCode] = body.liveToken; }
  return json({ ok: true, config: USER_CONFIG });
}

// === Router ===
export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const url = new URL(request.url);
    const p = url.pathname;
    try {
      if (p === "/" || p === "/health") return await handleHealth();
      if (p === "/config" && request.method === "POST") return await handleConfig(request);
      if (p === "/api/home" && request.method === "POST") return handleHome();
      if (p === "/api/details" && request.method === "POST") return await handleDetails(request);
      if (p === "/api/stream" && request.method === "POST") return await handleStream(request);
      if (p === "/api/cdn" && request.method === "POST") return await handleCdnProxy(request);
      if (p === "/api/notice") return await handleNotice();
      if (p === "/api/ads" && request.method === "POST") return await handleAds(request);
      if (p === "/api/tokens" && request.method === "POST") return await handleTokenUpdate(request);
      if (p === "/api/crypto-test" && request.method === "POST") return handleCryptoTest(request);
      return err("Not found: " + p, 404);
    } catch (e) { return err("Error: " + e.message, 500); }
  }
};
