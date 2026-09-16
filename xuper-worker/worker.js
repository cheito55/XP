/**
 * XuperTv Bridge - Cloudflare Worker v9.0
 * API cifrada con AES-CBC + custom Base64
 * Login + Home + Live + VOD + TMDB enrichment
 * REPOSITORIO: https://github.com/cheito55/XP
 */

const PKG = "com.android.msandroid";
const VER = "49902";
const UA = "Ranger/4.9.4-17294ac0";

const CRYPTO = {
  aesKey: "b972E8a5A4e0e8Ff",
  aesIv: "2c6b361ee550e80c"
};

const CUSTOM_B64 = "jWB7YtC3n9iXbEkUcJl1VxF4STpQoOIaRmh2M-efAgLwPqGr6uyD5vNsdH_Kz0Z8";

const API_DOMAINS = [
  "ftmrmy.jdfey0cd.com",
  "eskna.ucpjdhivl.com",
  "sydrgt.a878kkoyc.com"
];

const TMDB_KEY = "1c7e5ac8a89d07489b3b14d7b3b1b0a2";

const CAPTURED = {
  userId: "556784760",
  devId: "761cd6edc9681aa5d27dd1e1fa38ae08",
  userToken: "",
  portalCode: "",
  channels: [
    { id: "cyx_50fdcc0817d61_720p", name: "Canal en Vivo", type: "live", tag: "free" }
  ],
  vod: [
    { mediaCode: "4DC7E29C0EF941318307436A9CCDCDE0", title: "Pelicula 1", type: "vod", tag: "free" },
    { mediaCode: "7C81D68A2E9A4A3C8B3AEED8CE549912", title: "Pelicula 2", type: "vod", tag: "free" },
    { mediaCode: "496D2957D3EC45EFB2F34BDCF3B877C0", title: "Pelicula 3", type: "vod", tag: "free" }
  ]
};

let SESSION = {
  userId: CAPTURED.userId,
  devId: CAPTURED.devId,
  userToken: CAPTURED.userToken || "",
  portalCode: CAPTURED.portalCode || "",
  apiDomain: API_DOMAINS[0],
  loggedIn: false
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Config"
};

function json(d, s) {
  return new Response(JSON.stringify(d), {
    status: s || 200,
    headers: { "Content-Type": "application/json", ...CORS }
  });
}
function err(m, s) { return json({ ok: false, error: m }, s || 400); }

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

async function aesEncryptStr(plaintext, keyStr, ivStr) {
  const keyBytes = new TextEncoder().encode(keyStr);
  const ivBytes = new TextEncoder().encode(ivStr);
  const cryptoKey = await crypto.subtle.importKey(
    "raw", keyBytes.slice(0, 16), { name: "AES-CBC" }, false, ["encrypt"]
  );
  const padded = pkcs5Pad(new TextEncoder().encode(plaintext));
  const enc = await crypto.subtle.encrypt({ name: "AES-CBC", iv: ivBytes }, cryptoKey, padded);
  return new Uint8Array(enc);
}

async function aesDecryptStr(ciphertext, keyStr, ivStr) {
  const keyBytes = new TextEncoder().encode(keyStr);
  const ivBytes = new TextEncoder().encode(ivStr);
  const cryptoKey = await crypto.subtle.importKey(
    "raw", keyBytes.slice(0, 16), { name: "AES-CBC" }, false, ["decrypt"]
  );
  const dec = await crypto.subtle.decrypt({ name: "AES-CBC", iv: ivBytes }, cryptoKey, ciphertext);
  return new TextDecoder().decode(pkcs5Unpad(new Uint8Array(dec)));
}

function customB64Encode(bytes) {
  const stdAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const standard = btoa(binary);
  let result = "";
  for (let i = 0; i < standard.length; i++) {
    const ch = standard[i];
    const idx = stdAlphabet.indexOf(ch);
    result += (idx === -1) ? ch : CUSTOM_B64[idx];
  }
  return result;
}

function customB64Decode(str) {
  const stdAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let standard = "";
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    const idx = CUSTOM_B64.indexOf(ch);
    standard += (idx === -1) ? ch : stdAlphabet[idx];
  }
  const binary = atob(standard);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function encryptRequest(bodyObj) {
  const jsonStr = JSON.stringify(bodyObj);
  const encBytes = await aesEncryptStr(jsonStr, CRYPTO.aesKey, CRYPTO.aesIv);
  return customB64Encode(encBytes);
}

async function callApi(path, body, domain) {
  const host = domain || SESSION.apiDomain || API_DOMAINS[0];
  const url = "http://" + host + path;

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify(body),
      redirect: "follow"
    });
    const text = await resp.text();
    try {
      const data = JSON.parse(text);
      return { ok: true, data, status: resp.status };
    } catch (e) {
      return { ok: false, error: "Invalid JSON: " + text.substring(0, 200), status: resp.status };
    }
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function callApiEncrypted(path, bodyObj, domain) {
  const encrypted = await encryptRequest(bodyObj);
  return callApi(path, { data: encrypted }, domain);
}

async function callApiWithFallback(path, bodyObj) {
  for (const domain of API_DOMAINS) {
    const result = await callApiEncrypted(path, bodyObj, domain);
    if (result.ok && result.data) {
      SESSION.apiDomain = domain;
      if (result.data.returnCode !== "portal200001") return result;
    }
  }
  return { ok: false, error: "All API domains returned errors or version blocked" };
}

async function callApiRawWithFallback(path, body) {
  for (const domain of API_DOMAINS) {
    const result = await callApi(path, body, domain);
    if (result.ok && result.data) {
      SESSION.apiDomain = domain;
      return result;
    }
  }
  return { ok: false, error: "All API domains failed" };
}

async function handleLogin(email, password) {
  if (!email || !password) return err("Email y password requeridos");

  const body = {
    email: email,
    password: password,
    pkg: PKG,
    version: VER,
    sn: SESSION.devId,
    channel: "googleplay",
    language: "es"
  };

  const result = await callApiWithFallback("/api/portalCore/v6/login", body);

  if (result.ok && result.data) {
    const resp = result.data;
    if (resp.data && (resp.data.userId || resp.data.userToken)) {
      SESSION.userId = resp.data.userId || SESSION.userId;
      SESSION.userToken = resp.data.userToken || "";
      SESSION.portalCode = resp.data.portalCode || "";
      SESSION.loggedIn = true;
    }
    return json({ ok: true, session: SESSION, response: resp });
  }
  return err(result.error || "Login failed");
}

async function handleActive() {
  const body = {
    userId: SESSION.userId,
    devId: SESSION.devId,
    pkg: PKG,
    version: VER,
    userToken: SESSION.userToken,
    portalCode: SESSION.portalCode
  };
  return json(await callApiWithFallback("/api/portalCore/v6/active", body));
}

async function handleHome() {
  const body = {
    homePageCode: "home",
    version: VER,
    freeVodCode: "free_vod",
    freeVersion: VER,
    userId: SESSION.userId || CAPTURED.userId,
    userToken: SESSION.userToken || CAPTURED.devId,
    portalCode: SESSION.portalCode || "portal"
  };

  const result = await callApiWithFallback("/api/portalCore/getHome", body);

  if (result.ok && result.data && result.data.returnCode === "portal200") {
    const d = result.data.data || result.data;
    const channels = d.channels || d.liveList || d.columnList || [];
    const vod = d.vod || d.vodList || d.contentList || [];
    const items = [];

    const list = Array.isArray(channels) ? channels : [];
    for (let i = 0; i < list.length; i++) {
      const ch = list[i];
      items.push({
        contentId: ch.channelCode || ch.channel_code || ch.id || "",
        title: ch.channelName || ch.name || ch.id || "",
        type: "live",
        isLive: true,
        tag: ch.tag || "free",
        mediaCode: ch.channelCode || ch.channel_code || ch.id || "",
        logoUrl: ch.logoUrl || ch.picUrl || ch.channelLogo || "",
        catId: ch.catId || ch.categoryId || ""
      });
    }

    const vodList = Array.isArray(vod) ? vod : [];
    for (let i = 0; i < vodList.length; i++) {
      const v = vodList[i];
      items.push({
        contentId: v.mediaCode || v.media_code || v.contentId || v.id || "",
        title: v.title || v.name || v.vodName || "",
        type: "vod",
        isLive: false,
        tag: v.tag || "free",
        mediaCode: v.mediaCode || v.media_code || v.contentId || v.id || "",
        logoUrl: v.logoUrl || v.picUrl || v.poster || "",
        year: v.year || "",
        catId: v.catId || v.categoryId || ""
      });
    }

    if (items.length > 0) return json({ ok: true, data: items, source: "api" });
  }

  return json({
    ok: true,
    data: CAPTURED.channels.map(function(ch) {
      return {
        contentId: ch.id, title: ch.name, type: "live", isLive: true,
        tag: ch.tag, mediaCode: ch.id, logoUrl: ""
      };
    }).concat(CAPTURED.vod.map(function(v) {
      return {
        contentId: v.mediaCode, title: v.title, type: "vod", isLive: false,
        tag: v.tag, mediaCode: v.mediaCode, logoUrl: ""
      };
    })),
    source: "captured",
    note: "Datos capturados - login o cifrado puede fallar"
  });
}

async function handleLiveData(channelCode) {
  const code = channelCode || CAPTURED.channels[0].id;

  const body = {
    userToken: SESSION.userToken || CAPTURED.devId,
    userId: SESSION.userId || CAPTURED.userId,
    portalCode: SESSION.portalCode || "portal",
    type: "live",
    channelCode: code,
    num: 1
  };

  const result = await callApiWithFallback("/api/portalCore/v5/getLiveData", body);

  if (result.ok && result.data && result.data.data) {
    return json({ ok: true, data: result.data });
  }

  const liveUrl = "http://64.31.56.75:23455/live/" + code + ".m3u8";
  return json({
    ok: true,
    data: { streamUrl: liveUrl, headers: { "User-Agent": UA } }
  });
}

async function handleVodStream(mediaCode) {
  const body = {
    userToken: SESSION.userToken || CAPTURED.devId,
    userId: SESSION.userId || CAPTURED.userId,
    portalCode: SESSION.portalCode || "portal",
    type: "vod",
    mediaCode: mediaCode
  };

  const result = await callApiWithFallback("/api/portalCore/v9/startPlayVOD", body);

  if (result.ok && result.data && result.data.data) {
    return json({ ok: true, data: result.data });
  }

  return err("VOD stream no disponible - login necesario para URLs frescas");
}

async function handleSlb(mediaCode) {
  const body = {
    userToken: SESSION.userToken || CAPTURED.devId,
    userId: SESSION.userId || CAPTURED.userId,
    portalCode: SESSION.portalCode || "portal",
    mediaCode: mediaCode,
    pkg: PKG,
    version: VER
  };

  const result = await callApiWithFallback("/api/portalCore/v13_1/getSlbInfo", body);

  if (result.ok && result.data) {
    return json({ ok: true, data: result.data });
  }

  return err("SLB info no disponible");
}

async function handleTmdbSearch(query) {
  try {
    const url = "https://api.themoviedb.org/3/search/multi?api_key=" + TMDB_KEY +
      "&query=" + encodeURIComponent(query) + "&language=es-MX&page=1&include_adult=false";
    const resp = await fetch(url);
    const data = await resp.json();
    const results = [];
    if (data.results) {
      for (let i = 0; i < data.results.length; i++) {
        const item = data.results[i];
        if (item.media_type === "movie" || item.media_type === "tv") {
          results.push({
            tmdbId: item.id,
            mediaType: item.media_type,
            title: item.title || item.name || "",
            posterPath: item.poster_path || "",
            backdropPath: item.backdrop_path || "",
            year: (item.release_date || item.first_air_date || "").substring(0, 4),
            overview: (item.overview || "").substring(0, 200)
          });
        }
      }
    }
    return json({ ok: true, results: results });
  } catch (e) {
    return json({ ok: false, error: e.message });
  }
}

function handleHealth() {
  return json({
    ok: true, version: "9.0", session: SESSION,
    apiDomains: API_DOMAINS,
    endpoints: [
      "/health", "/api/login", "/api/config", "/api/home",
      "/api/live", "/api/stream", "/api/slb",
      "/api/active", "/api/tmdb", "/api/crypto-test"
    ]
  });
}

async function handleConfig(req) {
  let body = {};
  try { body = await req.json(); } catch (_) {}
  if (body.userId) SESSION.userId = body.userId;
  if (body.devId) SESSION.devId = body.devId;
  if (body.userToken) SESSION.userToken = body.userToken;
  if (body.portalCode) SESSION.portalCode = body.portalCode;
  if (body.apiDomain) SESSION.apiDomain = body.apiDomain;
  return json({ ok: true, session: SESSION });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    try {
      if (path === "/health" || path === "/") return handleHealth();

      if (path === "/api/login" && method === "POST") {
        const body = await request.json();
        return handleLogin(body.email, body.password);
      }

      if (path === "/api/active" && method === "POST") return handleActive();
      if (path === "/api/config" && method === "POST") return handleConfig(request);
      if (path === "/api/home") return handleHome();

      if (path === "/api/live") {
        const body = method === "POST" ? await request.json() : {};
        return handleLiveData(body.channelCode || body.id);
      }

      if (path === "/api/stream" && method === "POST") {
        const body = await request.json();
        return handleVodStream(body.mediaCode || body.id);
      }

      if (path === "/api/slb" && method === "POST") {
        const body = await request.json();
        return handleSlb(body.mediaCode || body.id);
      }

      if (path === "/api/tmdb") {
        const query = url.searchParams.get("q") || "";
        return handleTmdbSearch(query);
      }

      if (path === "/api/crypto-test") {
        try {
          const testObj = { test: "hello world" };
          const encrypted = await encryptRequest(testObj);
          const decResult = await aesDecryptStr(
            customB64Decode(encrypted), CRYPTO.aesKey, CRYPTO.aesIv
          );
          const decrypted = JSON.parse(decResult);
          return json({
            ok: true,
            original: testObj,
            encrypted: encrypted.substring(0, 40) + "...",
            match: decrypted.test === testObj.test
          });
        } catch (e) {
          return json({ ok: false, error: e.message });
        }
      }

      if (path.startsWith("/api/proxy/")) {
        const apiPath = "/" + path.replace("/api/proxy/", "");
        const body = method === "POST" ? await request.json() : {};
        const result = await callApiRawWithFallback(apiPath, body);
        return json(result);
      }

      return err("Endpoint no encontrado: " + path, 404);
    } catch (e) {
      return err("Error: " + e.message, 500);
    }
  }
};
