/**
 * XuperTv Bridge - Cloudflare Worker v4.0
 *
 * Combina lo mejor de v2 (3DES/AES, HTTP portal proxy) y v3 (WS bridge).
 * Puente entre GrayJay (solo HTTP) y el portal XuperTv (WebSocket).
 *
 * Endpoints:
 *   GET  /health                   -> Estado del worker
 *   POST /auth                     -> Login email+pass o tokens manuales
 *   POST /api/getHome              -> Home / canales
 *   POST /api/search               -> Busqueda por nombre
 *   POST /api/getItemData          -> Detalle de un item
 *   POST /api/getSlbInfo           -> Info SLB para streaming
 *   POST /api/startPlayVOD         -> Iniciar playback VOD
 *   GET  /api/epg                  -> EPG
 *   GET  /api/notice               -> Avisos
 *   POST /api/streamHeaders        -> Headers para streaming
 *   POST /ws/proxy                 -> Proxy raw WS
 *   POST /ws/handshake             -> Handshake al portal WS
 *
 * REPOSITORIO: https://github.com/cheito55/XP
 */

// ============================================================
//  Constants
// ============================================================

const APK_PACKAGE = "com.android.msandroid";
const APK_PACKAGE_ORIG = "com.android.mgstxNF";
const APK_VER = "49902";
const APK_VER_ORIG = "43407";
const SPKG_VER = "49";
const UA = "Ranger/4.9.4-17294ac0";

const DCS_SEEDS = [
  "dtgrd.txhnojlbu.com",
  "c2tgd.izvhrdcjb.com"
];

const FALLBACK_PORTALS = [
  "eaeylu.bvsvfb8c.com",
  "ncneqo.trlgjh4znk.com"
];

const API_3DES_KEY = "2b494e53756c664c2f44465245733572";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Portal-Base, X-User-Id, X-User-Token, X-Portal-Code, X-Device-Id",
  "Access-Control-Max-Age": "86400"
};

function jsonResponse(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS }
  });
}

function errResponse(msg, status) {
  return jsonResponse({ ok: false, error: msg }, status || 400);
}

function safeJson(s) {
  try { return JSON.parse(s); } catch (e) { return null; }
}

// ============================================================
//  DES / 3DES-ECB
// ============================================================

const DES_IP = [58,50,42,34,26,18,10,2,60,52,44,36,28,20,12,4,62,54,46,38,30,22,14,6,64,56,48,40,32,24,16,8,57,49,41,33,25,17,9,1,59,51,43,35,27,19,11,3,61,53,45,37,29,21,13,5,63,55,47,39,31,23,15,7];
const DES_FP = [40,8,48,16,56,24,64,32,39,7,47,15,55,23,63,31,38,6,46,14,54,22,62,30,37,5,45,13,53,21,61,29,36,4,44,12,52,20,60,28,35,3,43,11,51,19,59,27,34,2,42,10,50,18,58,26,33,1,41,9,49,17,57,25];
const DES_E = [32,1,2,3,4,5,4,5,6,7,8,9,8,9,10,11,12,13,12,13,14,15,16,17,16,17,18,19,20,21,20,21,22,23,24,25,24,25,26,27,28,29,28,29,30,31,32,1];
const DES_P = [16,7,20,21,29,12,28,17,1,15,23,26,5,18,31,10,2,8,24,14,32,27,3,9,19,13,30,6,22,11,4,25];
const DES_SBOX = [
  [14,4,13,1,2,15,11,8,3,10,6,12,5,9,0,7,0,15,7,4,14,2,13,1,10,6,12,11,9,5,3,8,4,1,14,8,13,6,2,11,15,12,9,7,3,10,5,0,15,12,8,2,4,9,1,7,5,11,3,14,10,0,6,13],
  [15,1,8,14,6,11,3,4,9,7,2,13,12,0,5,10,3,13,4,7,15,2,8,14,12,0,1,10,6,9,11,5,0,14,7,11,10,4,13,1,5,8,12,6,9,3,2,15,13,8,10,1,3,15,4,2,11,6,7,12,0,5,14,9],
  [10,0,9,14,6,3,15,5,1,13,12,7,11,4,2,8,13,7,0,9,3,4,6,10,2,8,5,14,12,11,15,1,13,6,4,9,8,15,3,0,11,1,2,12,5,10,14,7,1,7,4,13,1,6,12,11,9,5,3,8,4,14,9,15,2,8],
  [7,13,14,3,0,6,9,10,1,2,8,5,11,12,4,15,13,8,11,5,6,15,0,3,4,7,2,12,1,10,14,9,10,6,9,0,12,11,7,13,15,1,3,14,5,2,8,4,3,15,0,6,10,1,13,8,9,4,5,11,12,7,2,14],
  [2,12,4,1,7,10,11,6,8,5,3,15,13,0,14,9,14,11,2,12,4,7,13,1,5,0,15,10,3,9,8,6,4,2,1,11,10,13,7,8,15,9,12,5,6,3,0,14,11,8,12,7,1,14,2,13,6,15,0,9,10,4,5,3],
  [12,1,10,15,9,2,6,8,0,13,3,4,14,7,5,11,10,15,4,2,7,12,9,5,6,1,13,14,0,11,3,8,9,14,15,5,2,8,12,3,7,0,4,10,1,13,11,6,4,3,2,12,9,5,15,10,11,14,1,7,6,0,8,13],
  [4,11,2,14,15,0,8,13,3,12,9,7,5,10,6,1,13,0,11,7,4,9,1,10,14,3,5,12,2,15,8,6,1,4,11,13,12,3,7,14,10,15,6,8,0,5,9,2,6,11,13,8,1,4,10,7,9,5,0,15,14,2,3,12],
  [13,2,8,4,6,15,11,1,10,9,3,14,5,0,12,7,1,15,13,8,10,3,7,4,12,5,6,2,0,14,9,11,7,4,0,5,10,2,15,14,2,1,13,12,8,9,3,6,15,14,3,10,7,12,0,15,6,9,11,4,1,13,5,8]
];
const DES_PC1 = [57,49,41,33,25,17,9,1,58,50,42,34,26,18,10,2,59,51,43,35,27,19,11,3,60,52,44,36,63,55,47,39,31,23,15,7,62,54,46,38,30,22,14,6,61,53,45,37,29,21,13,5,28,20,12,4];
const DES_PC2 = [14,17,11,24,1,5,3,28,15,6,21,10,23,19,12,4,26,8,16,7,27,20,13,2,41,52,31,37,47,55,30,40,51,45,33,48,44,49,39,56,34,53,46,42,50,36,29,32];
const DES_SHIFTS = [1,1,2,2,2,2,2,2,1,2,2,2,2,2,2,1];

function desPerm(bits, p) {
  const out = new Array(p.length);
  for (let i = 0; i < p.length; i++) out[i] = bits[p[i] - 1];
  return out;
}

function desRotate(bits, count) {
  const n = bits.length;
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = bits[(i + count) % n];
  return out;
}

function desKeySchedule(keyBytes) {
  const keyBits = [];
  for (let i = 0; i < 8; i++) {
    for (let j = 7; j >= 0; j--) keyBits.push((keyBytes[i] >> j) & 1);
  }
  let C = desPerm(keyBits, DES_PC1).slice(0, 28);
  let D = desPerm(keyBits, DES_PC1).slice(28, 56);
  const subs = [];
  for (let i = 0; i < 16; i++) {
    C = desRotate(C, DES_SHIFTS[i]);
    D = desRotate(D, DES_SHIFTS[i]);
    subs.push(desPerm(C.concat(D), DES_PC2));
  }
  return subs;
}

function desF(r, sub) {
  const e = desPerm(r, DES_E);
  const x = [];
  for (let i = 0; i < 48; i++) x.push(e[i] ^ sub[i]);
  const sboxOut = [];
  for (let i = 0; i < 8; i++) {
    const row = (x[i * 6] << 1) | x[i * 6 + 5];
    const col = (x[i * 6 + 1] << 3) | (x[i * 6 + 2] << 2) | (x[i * 6 + 3] << 1) | x[i * 6 + 4];
    const val = DES_SBOX[i][row * 16 + col];
    for (let j = 3; j >= 0; j--) sboxOut.push((val >> j) & 1);
  }
  return desPerm(sboxOut, DES_P);
}

function desEncryptBlock(block, subs) {
  let bits = [];
  for (let i = 0; i < 8; i++) {
    for (let j = 7; j >= 0; j--) bits.push((block[i] >> j) & 1);
  }
  bits = desPerm(bits, DES_IP);
  let L = bits.slice(0, 32);
  let R = bits.slice(32, 64);
  for (let i = 0; i < 16; i++) {
    const f = desF(R, subs[i]);
    const newR = [];
    for (let j = 0; j < 32; j++) newR.push(L[j] ^ f[j]);
    L = R;
    R = newR;
  }
  const combined = R.concat(L);
  const permuted = desPerm(combined, DES_FP);
  const out = new Uint8Array(8);
  for (let i = 0; i < 8; i++) {
    out[i] = 0;
    for (let j = 0; j < 8; j++) out[i] |= permuted[i * 8 + j] << (7 - j);
  }
  return out;
}

function des3Encrypt(plaintext, keyHex) {
  const keyBytes = [];
  for (let i = 0; i < keyHex.length; i += 2) {
    keyBytes.push(parseInt(keyHex.substr(i, 2), 16));
  }
  const plainBytes = [];
  for (let i = 0; i < plaintext.length; i++) {
    plainBytes.push(plaintext.charCodeAt(i) & 0xff);
  }
  const pad = 8 - (plainBytes.length % 8);
  for (let i = 0; i < pad; i++) plainBytes.push(pad);

  const k1 = keyBytes.slice(0, 8);
  const k2 = keyBytes.slice(8, 16);
  const k3 = keyBytes.slice(16, 24);
  const s1 = desKeySchedule(k1);
  const s2 = desKeySchedule(k2);
  const s3 = desKeySchedule(k3);

  const result = new Uint8Array(plainBytes.length);
  for (let i = 0; i < plainBytes.length; i += 8) {
    const block = plainBytes.slice(i, i + 8);
    const e1 = desEncryptBlock(block, s1);
    const d2 = desEncryptBlock(e1, s2);
    const e3 = desEncryptBlock(d2, s3);
    result.set(e3, i);
  }

  return Array.from(result).map(b => ("0" + b.toString(16)).slice(-2)).join("");
}

function generateId() {
  const chars = "0123456789abcdef";
  let r = "";
  for (let i = 0; i < 16; i++) r += chars[Math.floor(Math.random() * 16)];
  return r;
}

// ============================================================
//  DCS Portal Discovery (best-effort, seeds may be dead)
// ============================================================

function dcsV1Data() {
  return {
    entry_type: "all", sn: "", code: "", auth_version: "",
    approve_code: "", open_num: "", apk: APK_PACKAGE,
    apk_ver: APK_VER, spkg_ver: SPKG_VER,
    reserve1: "", type: 1, user_id: "", user_identity: ""
  };
}

function extractUrls(value, out, depth) {
  if (depth > 8 || value == null || out.length > 25) return;
  if (typeof value === "string") {
    const re = /https?:\/\/([^\s"'<>]+)/gi;
    let m;
    while ((m = re.exec(value)) !== null) {
      const u = m[0].replace(/[\),;]+$/g, "");
      if (!/workers\.dev|dns\.|googleapis\.|cloudflare/i.test(u)) out.push(u);
    }
    return;
  }
  if (Array.isArray(value)) { value.forEach(x => extractUrls(x, out, depth + 1)); return; }
  if (typeof value !== "object") return;
  Object.keys(value).forEach(k => extractUrls(value[k], out, depth + 1));
}

async function discoverPortals() {
  const urls = [];
  const trySeeds = DCS_SEEDS;

  for (const seed of trySeeds) {
    for (const path of ["/googleadsmobgoogle", "/googleadservicesgoogleapisgoogleanalysisgoogleadmobgoogleMessagingumengacsaws"]) {
      try {
        const encData = des3Encrypt(JSON.stringify(dcsV1Data()), API_3DES_KEY);
        const iv = generateId();
        const url = `https://${seed}${path}?iv=${iv}&data=${encData}&pkg=${APK_PACKAGE}&apiver=${APK_VER}&type=1`;
        const resp = await fetch(url, {
          method: "POST",
          headers: { "User-Agent": UA, "Content-Type": "text/plain" },
          body: encData
        });
        const text = await resp.text();
        const data = safeJson(text);
        if (data) extractUrls(data, urls, 0);
      } catch (_) {}
    }
  }

  for (const fallback of FALLBACK_PORTALS) {
    urls.push("https://" + fallback);
  }

  return [...new Set(urls)];
}

// ============================================================
//  HTTP Portal API
// ============================================================

async function apiPost(portalBase, path, bodyStr, encrypt) {
  const url = portalBase.replace(/\/+$/, "") + path;
  let payload = bodyStr;

  if (encrypt) {
    payload = "0x" + des3Encrypt(bodyStr, API_3DES_KEY);
  }

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "text/plain", "User-Agent": UA },
    body: payload
  });

  const text = await resp.text();
  const data = safeJson(text);
  if (data && data.body) {
    try {
      const inner = JSON.parse(data.body);
      return inner;
    } catch (_) {}
  }
  return data || { raw: text.substring(0, 2000) };
}

function getData(resp) {
  if (!resp) return null;
  if (resp.data) return resp.data;
  if (resp.body) {
    if (typeof resp.body === "object") return resp.body;
    const parsed = safeJson(resp.body);
    if (parsed) return parsed;
  }
  return resp;
}

// ============================================================
//  WebSocket Bridge
// ============================================================

async function wsBridge(portalBase, message, timeoutMs) {
  timeoutMs = timeoutMs || 15000;
  const sessionId = generateId();

  let wsUrl = portalBase
    .replace("https://", "wss://")
    .replace("http://", "ws://");

  if (!wsUrl.includes("/v1/ws/") && !wsUrl.includes("/v1/portal")) {
    wsUrl = wsUrl.replace(/\/+$/, "") + "/v1/ws/" + sessionId;
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      try { ws.close(); } catch (_) {}
      reject(new Error("WS timeout after " + timeoutMs + "ms"));
    }, timeoutMs);

    try {
      const ws = new WebSocket(wsUrl);

      ws.addEventListener("open", () => {
        ws.send(typeof message === "string" ? message : JSON.stringify(message));
      });

      ws.addEventListener("message", (event) => {
        clearTimeout(timeout);
        const data = event.data;
        let parsed = null;
        if (typeof data === "string") {
          parsed = safeJson(data);
        } else if (data instanceof ArrayBuffer) {
          try {
            const decoder = new TextDecoder();
            const text = decoder.decode(data);
            parsed = safeJson(text);
          } catch (_) {}
        }
        try { ws.close(); } catch (_) {}
        resolve(parsed || { raw: String(data).substring(0, 5000) });
      });

      ws.addEventListener("error", (e) => {
        clearTimeout(timeout);
        reject(new Error("WS error: " + (e.message || "unknown")));
      });

      ws.addEventListener("close", () => { clearTimeout(timeout); });
    } catch (e) {
      clearTimeout(timeout);
      reject(e);
    }
  });
}

async function portalHandshake(portalBase, deviceId, deviceName, version) {
  const handshake = {
    t: 23,
    b: {
      iP: "1.1.1.1",
      iPv6: "",
      di: btoa(deviceId || "GJDUMGQFGHJ="),
      dL: btoa(deviceName || "nHF1dmV2ZW5hbnQ="),
      uL: "",
      ua: "Mozilla/5.0 (Linux; Android 8.1.0; NL5; sdk_gphone64_arm64 Build/NL5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.4896.79 Mobile Safari/537.36",
      aV: version || "4.34.7",
      r: null,
      dN: "NF",
      vN: "XupTV v" + (version || "4.34"),
      l: "es",
      T: Date.now()
    }
  };

  return wsBridge(portalBase, handshake, 20000);
}

// ============================================================
//  Auth
// ============================================================

async function emailLogin(portalBase, emailAddr, password) {
  const url = portalBase.replace(/\/+$/, "") + "/api/portalCore/v8/login";
  const body = JSON.stringify({
    email: emailAddr,
    password: password,
    apk: APK_PACKAGE,
    appVer: APK_VER,
    spkgVer: SPKG_VER,
    lang: "es"
  });

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: body
    });
    const text = await resp.text();
    const data = safeJson(text);

    if (!data) return { error: "Respuesta invalida", raw: text.substring(0, 500) };
    if (data.returnCode) return { error: data.errorMessage || data.returnCode, code: data.returnCode };
    if (data.userId) {
      return {
        ok: true,
        portalBase: portalBase,
        portalCode: (data.portalCodeList && data.portalCodeList[0] && data.portalCodeList[0].portalCode) || data.portalCode || "",
        userId: String(data.userId),
        userToken: data.userToken || data.token || "",
        source: "email"
      };
    }
    return { error: "Login fallido: " + JSON.stringify(data).substring(0, 300) };
  } catch (e) {
    return { error: "Login exception: " + e.message };
  }
}

// ============================================================
//  Request Handlers
// ============================================================

async function handleHealth() {
  return jsonResponse({
    ok: true,
    version: "4.0",
    worker: "xuper-bridge",
    apk: APK_PACKAGE,
    apkMod: APK_PACKAGE_ORIG,
    apkVer: APK_VER,
    ua: UA,
    endpoints: [
      "/health", "/auth",
      "/api/getHome", "/api/search", "/api/getItemData",
      "/api/getSlbInfo", "/api/startPlayVOD",
      "/api/epg", "/api/notice", "/api/streamHeaders",
      "/ws/proxy", "/ws/handshake"
    ]
  });
}

async function handleAuth(request) {
  let body = {};
  try { body = await request.json(); } catch (_) {}

  // Email login
  if (body.email && body.password) {
    const portals = body.portalBase
      ? [body.portalBase]
      : ["https://" + FALLBACK_PORTALS[0], "https://" + FALLBACK_PORTALS[1]];

    for (const p of portals) {
      try {
        const result = await emailLogin(p, body.email, body.password);
        if (result.ok) return jsonResponse(result);
        if (result.code === "portal200001") continue;
      } catch (_) { continue; }
    }

    // Also try DCS-discovered portals
    try {
      const discovered = await discoverPortals();
      for (const p of discovered) {
        try {
          const result = await emailLogin(p, body.email, body.password);
          if (result.ok) return jsonResponse(result);
        } catch (_) { continue; }
      }
    } catch (_) {}

    return errResponse("Login fallo en todos los portales. Los portales viejos pueden estar deprecados. Intenta tokens manuales.", 401);
  }

  // Manual tokens
  if (body.userId && body.userToken) {
    return jsonResponse({
      ok: true,
      portalBase: body.portalBase || "",
      portalCode: body.portalCode || "",
      userId: body.userId,
      userToken: body.userToken,
      deviceId: body.deviceId || "",
      source: "manual"
    });
  }

  return errResponse("Proporciona email+password o userId+userToken", 400);
}

// ── Portal API helpers ──

function extractAuthInfo(request) {
  return {
    portalBase: request.headers.get("X-Portal-Base") || "",
    userId: request.headers.get("X-User-Id") || "",
    userToken: request.headers.get("X-User-Token") || "",
    portalCode: request.headers.get("X-Portal-Code") || ""
  };
}

async function handlePortalApi(request, apiEndpoint) {
  const auth = extractAuthInfo(request);
  if (!auth.portalBase || !auth.userId || !auth.userToken) {
    return errResponse("Faltan credenciales. Llama a /auth primero.", 401);
  }

  let body = {};
  try { body = await request.json(); } catch (_) {}
  body.userId = body.userId || auth.userId;
  body.userToken = body.userToken || auth.userToken;
  body.portalCode = body.portalCode || auth.portalCode;

  try {
    const result = await apiPost(auth.portalBase, "/api/portalCore/" + apiEndpoint, JSON.stringify(body), true);
    const data = getData(result);
    return jsonResponse({ ok: true, data: data || result });
  } catch (e) {
    return errResponse("Portal API error: " + e.message, 502);
  }
}

async function handleGetHome(request) {
  return handlePortalApi(request, "getHome");
}

async function handleSearch(request) {
  let body = {};
  try { body = await request.json(); } catch (_) {}
  const query = body.query || body.keyword || body.key || "";
  const page = body.page || 1;

  const auth = extractAuthInfo(request);
  if (!auth.portalBase) return errResponse("Portal base no configurado", 400);

  // Try searchByName first
  let bodyObj = {
    key: query,
    pageIndex: page,
    pageSize: 30,
    userId: auth.userId || "",
    userToken: auth.userToken || "",
    portalCode: auth.portalCode || ""
  };

  try {
    const result = await apiPost(auth.portalBase, "/api/portalCore/v3/searchByName", JSON.stringify(bodyObj), true);
    const data = getData(result);
    if (data && Array.isArray(data) && data.length) return jsonResponse({ ok: true, data: data });
  } catch (e) {}

  // Fallback: searchByContent
  try {
    const result = await apiPost(auth.portalBase, "/api/portalCore/v3/searchByContent", JSON.stringify(bodyObj), true);
    const data = getData(result);
    return jsonResponse({ ok: true, data: data || [] });
  } catch (e) {
    return errResponse("Busqueda fallo: " + e.message, 502);
  }
}

async function handleGetItemData(request) {
  return handlePortalApi(request, "v4/getItemData");
}

async function handleGetSlbInfo(request) {
  return handlePortalApi(request, "v15/getSlbInfo");
}

async function handleStartPlayVOD(request) {
  return handlePortalApi(request, "v10/startPlayVOD");
}

async function handleWsProxy(request) {
  let body = {};
  try { body = await request.json(); } catch (_) {}

  const portalBase = request.headers.get("X-Portal-Base") || body.portalBase || "";
  const message = body.message || body;
  const timeout = body.timeout || 15000;

  if (!portalBase) return errResponse("X-Portal-Base header o portalBase en body requerido");

  try {
    const result = await wsBridge(portalBase, message, timeout);
    return jsonResponse({ ok: true, data: result });
  } catch (e) {
    return errResponse("WS bridge fallo: " + e.message, 502);
  }
}

async function handleHandshake(request) {
  let body = {};
  try { body = await request.json(); } catch (_) {}

  const portalBase = request.headers.get("X-Portal-Base") || body.portalBase || "";
  if (!portalBase) return errResponse("X-Portal-Base header requerido");

  try {
    const result = await portalHandshake(portalBase, body.deviceId, body.deviceName, body.version);
    return jsonResponse({ ok: true, data: result });
  } catch (e) {
    return errResponse("Handshake fallo: " + e.message, 502);
  }
}

async function handleEpg(request) {
  const url = new URL(request.url);
  const ch = url.searchParams.get("ch") || "";

  const epgUrls = [
    "https://rokbd.ysrkwctjg.com/epg/v2/live/app/utc-3/26",
    "https://vgwbm.uwfyobivh.com/epg/v2/live/app/utc-3/26"
  ];

  for (const epgUrl of epgUrls) {
    try {
      const resp = await fetch(epgUrl, { headers: { "User-Agent": UA } });
      const text = await resp.text();
      const data = safeJson(text);
      if (data && data.status !== 502) return jsonResponse(data);
    } catch (_) { continue; }
  }

  return errResponse("EPG no disponible", 502);
}

async function handleNotice() {
  const noticeUrls = [
    `https://nxiqj.jgrqyxupl.com/notice/api/get_notice?pkg=${APK_PACKAGE_ORIG}&v=${APK_VER_ORIG}&sn=&userId=&language=es`,
    `https://zxiws.tcgwhnvym.com/notice/api/get_notice?pkg=${APK_PACKAGE_ORIG}&v=${APK_VER_ORIG}&sn=&userId=&language=es`
  ];

  for (const url of noticeUrls) {
    try {
      const resp = await fetch(url);
      const text = await resp.text();
      const data = safeJson(text);
      if (data && data.status === 0) return jsonResponse(data);
    } catch (_) { continue; }
  }

  return jsonResponse({ status: 0, inner: [] });
}

async function handleStreamHeaders(request) {
  let body = {};
  try { body = await request.json(); } catch (_) {}

  return jsonResponse({
    ok: true,
    headers: {
      "App": APK_PACKAGE,
      "App-Version": APK_VER,
      "User-Agent": UA,
      "Content-License": body.contentLicense || "",
      "Ranger-Id": body.rangerId || "",
      "Range": body.range || "bytes=0-8388607",
      "Pragma": "akamai-x-cache-on",
      "X-Buffer": "0",
      "Connection": "Keep-Alive"
    }
  });
}

async function handleDiscover() {
  try {
    const portals = await discoverPortals();
    return jsonResponse({ ok: true, portals: portals });
  } catch (e) {
    return errResponse("DCS discovery fallo: " + e.message, 500);
  }
}

// ============================================================
//  Router
// ============================================================

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === "/" || path === "/health") return await handleHealth();
      if (path === "/auth" && request.method === "POST") return await handleAuth(request);

      // Portal API endpoints
      if (path === "/api/getHome" && request.method === "POST") return await handleGetHome(request);
      if (path === "/api/search" && request.method === "POST") return await handleSearch(request);
      if (path === "/api/getItemData" && request.method === "POST") return await handleGetItemData(request);
      if (path === "/api/getSlbInfo" && request.method === "POST") return await handleGetSlbInfo(request);
      if (path === "/api/startPlayVOD" && request.method === "POST") return await handleStartPlayVOD(request);

      // WS bridge
      if (path === "/ws/proxy" && request.method === "POST") return await handleWsProxy(request);
      if (path === "/ws/handshake" && request.method === "POST") return await handleHandshake(request);

      // Utility endpoints
      if (path === "/api/epg") return await handleEpg(request);
      if (path === "/api/notice") return await handleNotice();
      if (path === "/api/streamHeaders" && request.method === "POST") return await handleStreamHeaders(request);
      if (path === "/api/discover") return await handleDiscover();

      return errResponse("Endpoint no encontrado: " + path + ". Consulta /health", 404);
    } catch (e) {
      return errResponse("Error interno: " + e.message, 500);
    }
  }
};
