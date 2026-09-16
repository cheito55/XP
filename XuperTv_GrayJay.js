/*
 * GrayJay - XuperTv Source v57
 *
 * v57: Adaptado para Worker v5 con WebSocket real (cloudflare:sockets).
 *   - Worker abre WebSocket al portal, sirve de puente HTTP ↔ WS
 *   - Sesiones via /auth que devuelve sessionId
 *   - Todos los endpoints usan X-Session-Id header
 *   - ES5 puro: sin const/let, sin arrow functions, sin class, sin spread
 *
 * REPOSITORIO: https://github.com/cheito55/XP
 */

var PLATFORM_NAME = "XuperTv";
var PLUGIN_ID = "8d1f6f41-7d4a-4e8c-a42f-5c9b7a31e602";
var DEFAULT_WORKER_URL = "https://xuper-bridge.cheito55.workers.dev";

var MAX_SOURCES = 20;
var SEARCH_PAGE_SIZE = 30;

var _config = {};
var _settings = {};
var _sessionId = "";
var _userId = "";
var _userToken = "";
var _portalCode = "";
var _deviceId = "";
var _authAttempted = false;
var _authError = "";

// ============================================================
//  Utilidades
// ============================================================

function txt(v) { return v == null ? "" : String(v); }
function nonEmpty(v) { return v != null && String(v).trim() !== ""; }
function firstValid() {
  var i;
  for (i = 0; i < arguments.length; i++) {
    if (nonEmpty(arguments[i])) return String(arguments[i]).trim();
  }
  return "";
}
function safeJson(value) {
  if (value == null) return null;
  if (typeof value === "object") return value;
  try { return JSON.parse(String(value)); } catch (e) {}
  return null;
}
function getSetting(name, fallback) {
  try { if (_settings && nonEmpty(_settings[name])) return _settings[name]; } catch (e) {}
  try { if (_config && _config.settings && nonEmpty(_config.settings[name])) return _config.settings[name]; } catch (e) {}
  return fallback || "";
}
function dbg(msg) {
  try { if (_settings && _settings.debug) console.log("[XuperTv] " + String(msg)); } catch (e) {}
}

function workerUrl() {
  return firstValid(getSetting("worker_url", ""), getSetting("workerUrl", ""), DEFAULT_WORKER_URL).replace(/\/+$/, "");
}
function sUserId() { return firstValid(getSetting("user_id", ""), getSetting("userId", "")); }
function sUserToken() { return firstValid(getSetting("user_token", ""), getSetting("userToken", "")); }
function sPortalCode() { return firstValid(getSetting("portal_code", ""), getSetting("portalCode", "")); }
function sEmail() { return firstValid(getSetting("email", ""), getSetting("user_email", "")); }
function sPassword() { return firstValid(getSetting("password", ""), getSetting("user_password", "")); }
function sPortalBase() { return firstValid(getSetting("portal_base", ""), getSetting("portalBase", "")); }

// ============================================================
//  HTTP helpers
// ============================================================

function httpGet(url, headers) {
  if (typeof http !== "undefined" && http.get) return http.get(url, headers || {});
  if (typeof http !== "undefined" && http.GET) return http.GET(url, headers || {});
  if (typeof Http !== "undefined" && Http.get) return Http.get(url, headers || {});
  if (typeof Http !== "undefined" && Http.GET) return Http.GET(url, headers || {});
  throw new Error("No hay implementacion HTTP GET disponible");
}

function httpPost(url, body, headers) {
  var h = { "Content-Type": "application/json" };
  if (headers) { var hk; for (hk in headers) { if (headers.hasOwnProperty(hk)) h[hk] = headers[hk]; } }
  var payload = typeof body === "string" ? body : JSON.stringify(body);
  if (typeof http !== "undefined" && http.post) return http.post(url, payload, h);
  if (typeof http !== "undefined" && http.POST) return http.POST(url, payload, h);
  if (typeof Http !== "undefined" && Http.post) return Http.post(url, payload, h);
  if (typeof Http !== "undefined" && Http.POST) return Http.POST(url, payload, h);
  throw new Error("No hay implementacion HTTP POST disponible");
}

function httpPostJson(url, body, headers) {
  var resp = httpPost(url, body, headers);
  var b = resp && resp.body ? resp.body : resp;
  if (typeof b === "string") return safeJson(b);
  return b || null;
}

function httpGetJson(url, headers) {
  var resp = httpGet(url, headers);
  var b = resp && resp.body ? resp.body : resp;
  if (typeof b === "string") return safeJson(b);
  return b || null;
}

// ============================================================
//  Worker API
// ============================================================

function workerCall(path, data, extraHeaders) {
  var url = workerUrl() + path;
  var headers = {};
  if (_sessionId) headers["X-Session-Id"] = _sessionId;
  if (extraHeaders) { var hk; for (hk in extraHeaders) { if (extraHeaders.hasOwnProperty(hk)) headers[hk] = extraHeaders[hk]; } }
  dbg("Worker POST " + path);
  var resp = httpPost(url, data || {}, headers);
  var b = resp && resp.body ? resp.body : resp;
  return safeJson(b) || { ok: false, error: "sin respuesta" };
}

function workerGet(path) {
  var url = workerUrl() + path;
  dbg("Worker GET " + path);
  var resp = httpGet(url, {});
  var b = resp && resp.body ? resp.body : resp;
  return safeJson(b) || { ok: false, error: "sin respuesta" };
}

// ============================================================
//  Auth management
// ============================================================

function ensureAuth() {
  if (_sessionId && _userId) return true;
  if (_authAttempted) return false;
  _authAttempted = true;

  var userId = sUserId();
  var userToken = sUserToken();
  var portalCode = sPortalCode();
  var deviceId = firstValid(getSetting("device_id", ""), getSetting("deviceId", ""));

  if (!userId || !userToken) {
    _authError = "Configura user_id y user_token en ajustes del plugin";
    dbg(_authError);
    return false;
  }

  dbg("Autenticando via Worker...");

  try {
    var result = workerCall("/auth", {
      userId: userId,
      userToken: userToken,
      portalCode: portalCode,
      deviceId: deviceId
    });

    if (result && result.ok && result.sessionId) {
      _sessionId = result.sessionId;
      _userId = result.userId || userId;
      _userToken = result.userToken || userToken;
      _portalCode = result.portalCode || portalCode;
      _deviceId = result.deviceId || deviceId;
      dbg("Auth OK: sessionId=" + _sessionId.substring(0, 12) + "...");
      return true;
    }

    _authError = (result && result.error) || "Auth fallida";
    dbg("Auth fallo: " + _authError);
  } catch (e) {
    _authError = txt(e);
    dbg("Auth exception: " + _authError);
  }

  return false;
}

// ============================================================
//  Data parsing
// ============================================================

function extractVideoArray(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (data.data && Array.isArray(data.data)) return data.data;
  if (data.inner && Array.isArray(data.inner)) return data.inner;
  if (data.list && Array.isArray(data.list)) return data.list;
  if (data.items && Array.isArray(data.items)) return data.items;
  if (data.contents && Array.isArray(data.contents)) return data.contents;
  if (data.channels && Array.isArray(data.channels)) return data.channels;
  if (data.shelveData && Array.isArray(data.shelveData)) {
    var all = [], i;
    for (i = 0; i < data.shelveData.length; i++) {
      var sh = data.shelveData[i];
      if (sh.contents && Array.isArray(sh.contents)) {
        var j;
        for (j = 0; j < sh.contents.length; j++) all.push(sh.contents[j]);
      }
    }
    if (all.length) return all;
  }
  return [];
}

function extractId(item) {
  return txt(item.contentId || item.content_id || item.id || item.mediaCode || item.channelId || item.vodId || "");
}
function extractTitle(item) {
  return txt(item.title || item.name || item.contentName || item.channelName || item.vodName || "");
}
function extractThumb(item) {
  return txt(item.logoUrl || item.picUrl || item.pic_url || item.posterUrl || item.cover || item.image || item.icon || "");
}
function extractDuration(item) {
  return parseInt(item.duration || item.timeLength || 0, 10) || 0;
}
function extractViews(item) {
  return parseInt(item.viewCount || item.playCount || 0, 10) || 0;
}
function extractDesc(item) {
  return txt(item.description || item.desc || item.detail || item.intro || item.summary || "");
}
function extractAuthor(item) {
  return txt(item.author || item.director || item.studio || item.company || item.source_name || "");
}
function extractIsLive(item) {
  if (item.isLive || item.is_live || item.live) return true;
  if (item.type === "live" || item.contentType === "live") return true;
  return false;
}

function buildXuperUrl(contentId, item) {
  if (!contentId) return "";
  return "xuper://content?id=" + encodeURIComponent(contentId);
}

function itemToVideo(item) {
  var cid = extractId(item);
  var title = extractTitle(item);
  var thumb = extractThumb(item);
  var thumbs = [];
  if (thumb) thumbs.push(new Thumbnail(thumb, 480));
  var authorName = extractAuthor(item);
  var authorLink = new PlatformAuthorLink(
    new PlatformID(PLATFORM_NAME, authorName || "XuperTv"),
    authorName || "XuperTv", ""
  );

  return new PlatformVideo({
    id: new PlatformID(PLATFORM_NAME, cid),
    name: title || "Sin titulo",
    thumbnails: new Thumbnails(thumbs),
    author: authorLink,
    datetime: new DateTime(0),
    url: buildXuperUrl(cid, item),
    duration: extractDuration(item),
    viewCount: extractViews(item),
    isLive: extractIsLive(item)
  });
}

function parseVideoList(data) {
  var items = extractVideoArray(data);
  var videos = [], i;
  for (i = 0; i < items.length && videos.length < MAX_SOURCES; i++) {
    if (items[i] && extractId(items[i])) {
      videos.push(itemToVideo(items[i]));
    }
  }
  return videos;
}

function parseDeep(data) {
  var videos = parseVideoList(data);
  if (!videos.length && data && typeof data === "object") {
    var key;
    for (key in data) {
      if (!data.hasOwnProperty(key)) continue;
      var val = data[key];
      if (Array.isArray(val) && val.length) {
        videos = parseVideoList(val);
        if (videos.length) break;
      }
      if (val && typeof val === "object" && !Array.isArray(val)) {
        var sub = extractVideoArray(val);
        if (sub.length) { videos = parseVideoList(sub); if (videos.length) break; }
      }
    }
  }
  return videos;
}

// ============================================================
//  Video sources extraction
// ============================================================

function extractSources(item) {
  var sources = [];
  if (!item) return sources;

  var playUrl = txt(item.playUrl || item.play_url || item.url || item.m3u8 || item.hls);
  if (playUrl) {
    var h = parseInt(item.height || item.resolution || 720, 10) || 720;
    sources.push(new VideoUrlSource({
      url: playUrl,
      width: Math.round(h * 16 / 9),
      height: h,
      container: playUrl.indexOf(".m3u8") > -1 ? "application/x-mpegURL" : "video/mp4",
      codec: "H.264",
      requestModifier: new RequestModifier({ allowByteSkip: true })
    }));
  }

  var cdnList = item.cdnList || item.nodes || item.streamNodes || item.stream_nodes;
  if (cdnList && Array.isArray(cdnList)) {
    var i;
    for (i = 0; i < cdnList.length && sources.length < MAX_SOURCES; i++) {
      var node = cdnList[i];
      var nodeUrl = txt(node.url || node.path || node.streamUrl || "");
      if (!nodeUrl && node.ip && node.port) {
        nodeUrl = "http://" + txt(node.ip) + ":" + txt(node.port) + txt(node.path || "");
      }
      if (nodeUrl) {
        var nh = parseInt(node.height || 720, 10);
        sources.push(new VideoUrlSource({
          url: nodeUrl,
          width: Math.round(nh * 16 / 9),
          height: nh || 720,
          container: nodeUrl.indexOf(".m3u8") > -1 ? "application/x-mpegURL" : "video/mp4",
          codec: "H.264",
          requestModifier: new RequestModifier({ allowByteSkip: true })
        }));
      }
    }
  }
  return sources;
}

function extractSubtitles(item) {
  var subs = item.subtitles || item.subtitle || [];
  if (!Array.isArray(subs)) subs = [subs];
  var result = [], i;
  for (i = 0; i < subs.length; i++) {
    var sub = subs[i];
    if (!sub) continue;
    var subUrl = txt(sub.url || sub.path || sub.file || "");
    var subLang = txt(sub.lang || sub.language || "es");
    if (subUrl) {
      result.push(new Subtitle(new PlatformID(PLATFORM_NAME, subLang), subLang, subUrl, "application/x-subrip"));
    }
  }
  return result;
}

// ============================================================
//  GrayJay Source Methods
// ============================================================

source.isContentDetailsUrl = function(url) { return /^xuper:\/\//i.test(txt(url)); };
source.isVideoDetailsUrl = function(url) { return /^xuper:\/\//i.test(txt(url)); };
source.isChannelUrl = function() { return false; };
source.isSearchUrl = function(url) { return /^xuper:\/\//i.test(txt(url)); };

source.getSearchSuggestions = function(query) {
  try { return nonEmpty(query) ? [String(query)] : []; } catch (e) { return []; }
};

source.getSearchCapabilities = function() {
  return { types: ["video"], sorts: [], filters: [] };
};

source.search = function(query, type, order, filters) {
  var q = txt(query).trim();
  dbg("Buscando: " + q);

  if (!q) return new VideoPager([], false, { query: q, page: 1 });

  if (!ensureAuth()) {
    dbg("Sin auth para busqueda: " + _authError);
    return new VideoPager([], false, { query: q, page: 1 });
  }

  try {
    var result = workerCall("/api/search", { query: q, page: 1 });
    var videos = parseDeep(result);
    dbg("Busqueda: " + videos.length + " resultados");
    return new VideoPager(videos, videos.length >= SEARCH_PAGE_SIZE, { query: q, page: 1 });
  } catch (e) {
    dbg("Error busqueda: " + e);
    return new VideoPager([], false, { query: q, page: 1 });
  }
};

source.getVideoDetails = function(url) {
  var contentId = "";
  var match = txt(url).match(/xuper:\/\/content\?id=([^&]+)/);
  if (match) contentId = decodeURIComponent(match[1]);
  if (!contentId) contentId = txt(url).replace(/^xuber:\/\//i, "").replace(/^content\?id=/i, "");
  if (!contentId) throw new Error("No se pudo identificar el contentId de: " + url);

  dbg("Detalles: " + contentId);

  var item = null;
  try {
    if (ensureAuth()) {
      var resp = workerCall("/api/details", { contentId: contentId });
      item = (resp && resp.data) ? resp.data : resp;
    }
  } catch (e) { dbg("getItemData fallo: " + e); }

  if (!item) item = { contentId: contentId, title: contentId };
  var title = extractTitle(item) || contentId;
  var authorName = extractAuthor(item);
  var thumbs = [];
  var thumb = extractThumb(item);
  if (thumb) thumbs.push(new Thumbnail(thumb, 480));

  var video = new PlatformVideo({
    id: new PlatformID(PLATFORM_NAME, contentId),
    name: title,
    thumbnails: new Thumbnails(thumbs),
    author: new PlatformAuthorLink(new PlatformID(PLATFORM_NAME, authorName || "XuperTv"), authorName || "XuperTv", ""),
    datetime: new DateTime(0),
    url: txt(url),
    duration: extractDuration(item),
    viewCount: extractViews(item),
    isLive: extractIsLive(item)
  });

  var sources = extractSources(item);

  return new PlatformVideoDetails({
    video: video,
    description: extractDesc(item) || title,
    videoSources: new VideoSourceDescriptor(sources),
    subtitles: extractSubtitles(item)
  });
};

source.getHome = function() {
  dbg("Obteniendo home...");

  if (!ensureAuth()) {
    dbg("Sin auth para home: " + _authError);
    return new VideoPager([], false, { type: "home", page: 1 });
  }

  try {
    var result = workerCall("/api/home", {});
    var videos = parseDeep(result);
    dbg("Home: " + videos.length + " videos");
    return new VideoPager(videos, videos.length >= SEARCH_PAGE_SIZE, { type: "home", page: 1 });
  } catch (e) {
    dbg("Home fallo: " + e);
    return new VideoPager([], false, { type: "home", page: 1 });
  }
};

source.getVideoUrl = function(video) {
  dbg("Obteniendo URL de video...");
  var contentId = "";
  if (video && video.id) contentId = txt(video.id.content || video.id.value || video.id);
  if (!contentId && video && video.url) {
    var m = txt(video.url).match(/id=([^&]+)/);
    if (m) contentId = decodeURIComponent(m[1]);
  }
  if (!contentId) return [];

  try {
    if (ensureAuth()) {
      var resp = workerCall("/api/details", { contentId: contentId });
      var item = (resp && resp.data) ? resp.data : resp;
      if (item) {
        var sources = extractSources(item);
        if (sources.length) return sources;
      }
    }
  } catch (e) { dbg("videoUrl: " + e); }

  return [];
};

source.getComments = function() { return []; };
source.getSubComments = function() { return []; };
source.getChannel = function() { return null; };
source.getChannelVideos = function() { return new VideoPager([], false); };
source.getChannelCapabilities = function() { return { types: [], sorts: [], filters: [] }; };

source.getDiagnostics = function() {
  var wUrl = workerUrl();
  var workerOk = false;
  var authState = "no configurado";

  try {
    var health = workerGet("/health");
    workerOk = health && health.ok;
  } catch (e) { dbg("Diag health: " + e); }

  if (_sessionId) {
    authState = "OK session=" + _sessionId.substring(0, 8) + " uid=" + _userId;
  } else if (_authError) {
    authState = "Fallo: " + _authError;
  }

  return {
    platform: PLATFORM_NAME,
    version: 57,
    worker: { url: wUrl || "(no configurado)", online: workerOk },
    auth: { state: authState }
  };
};

// ============================================================
//  Config / setup
// ============================================================

source.enable = function(conf, settings, savedState) {
  _config = conf || {};
  _settings = settings || {};
  _sessionId = "";
  _authAttempted = false;
  _authError = "";
  dbg("Plugin habilitado v57");
};

source.setSettings = function(settings) {
  _settings = settings || {};
  _sessionId = "";
  _authAttempted = false;
  _authError = "";
};

source.getSettings = function() {
  return [
    { key: "email", label: "Email (opcional, para login)", type: "text", placeholder: "tu@email.com" },
    { key: "password", label: "Contrasena (opcional)", type: "password" },
    { key: "user_id", label: "User ID (requerido)", type: "text" },
    { key: "user_token", label: "User Token (requerido)", type: "text" },
    { key: "portal_code", label: "Portal Code (opcional)", type: "text" },
    { key: "portal_base", label: "Portal URL (opcional)", type: "text" },
    { key: "device_id", label: "Device ID (opcional, auto-generado)", type: "text" },
    { key: "worker_url", label: "Worker URL", type: "text", defaultValue: DEFAULT_WORKER_URL },
    { key: "debug", label: "Debug", type: "boolean", defaultValue: false }
  ];
};
