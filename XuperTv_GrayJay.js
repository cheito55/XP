/*
 * GrayJay - XuperTv Source v56
 *
 * v56: Reescrito para el nuevo repo XP con Cloudflare Worker v3.
 *   - WebSocket bridge via Worker para comunicarse con el portal
 *   - Sin dependencia de DCS (los seeds estan muertos)
 *   - Auth manual (userId/userToken/portalCode) o via Worker /auth
 *   - ES5 puro: sin const/let, sin arrow functions, sin class, sin spread, sin for...of
 *
 * REPOSITORIO: https://github.com/cheito55/XP
 */

var PLATFORM_NAME = "XuperTv";
var PLUGIN_ID = "8d1f6f41-7d4a-4e8c-a42f-5c9b7a31e602";
var DEFAULT_WORKER_URL = "https://xuper-bridge.cheito55.workers.dev";

var SEARCH_PAGE_SIZE = 30;
var MAX_SOURCES = 20;
var REQUEST_TIMEOUT = 30000;

var _config = {};
var _settings = {};
var _authCache = null;
var _authAttempted = false;

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
  try { return JSON.parse(String(value)); } catch (e1) {}
  return null;
}

function getSetting(name, fallback) {
  try { if (_settings && nonEmpty(_settings[name])) return _settings[name]; } catch (e1) {}
  try { if (_config && _config.settings && nonEmpty(_config.settings[name])) return _config.settings[name]; } catch (e2) {}
  return fallback || "";
}

function dbg(msg) {
  try { if (_settings && _settings.debug) console.log("[XuperTv] " + String(msg)); } catch (e) {}
}

function workerUrl() {
  return firstValid(getSetting("worker_url", ""), getSetting("workerUrl", ""), DEFAULT_WORKER_URL).replace(/\/+$/, "");
}

function settingUserId() { return firstValid(getSetting("user_id", ""), getSetting("userId", "")); }
function settingUserToken() { return firstValid(getSetting("user_token", ""), getSetting("userToken", "")); }
function settingPortalCode() { return firstValid(getSetting("portal_code", ""), getSetting("portalCode", "")); }
function settingEmail() { return firstValid(getSetting("email", ""), getSetting("user_email", "")); }
function settingPassword() { return firstValid(getSetting("password", ""), getSetting("user_password", "")); }
function settingPortalBase() { return firstValid(getSetting("portal_base", ""), getSetting("portalBase", "")); }

// ============================================================
//  HTTP helpers
// ============================================================

function httpGet(url, headers) {
  dbg("GET " + url);
  if (typeof http !== "undefined" && http.get) return http.get(url, headers || {});
  if (typeof http !== "undefined" && http.GET) return http.GET(url, headers || {});
  if (typeof Http !== "undefined" && Http.get) return Http.get(url, headers || {});
  if (typeof Http !== "undefined" && Http.GET) return Http.GET(url, headers || {});
  throw new Error("No hay implementacion HTTP GET disponible");
}

function httpPost(url, body, headers) {
  dbg("POST " + url);
  var h = { "Content-Type": "application/json" };
  if (headers) { var hk; for (hk in headers) { if (headers.hasOwnProperty(hk)) h[hk] = headers[hk]; } }
  var payload = typeof body === "string" ? body : JSON.stringify(body);
  if (typeof http !== "undefined" && http.post) return http.post(url, payload, h);
  if (typeof http !== "undefined" && http.POST) return http.POST(url, payload, h);
  if (typeof Http !== "undefined" && Http.post) return Http.post(url, payload, h);
  if (typeof Http !== "undefined" && Http.POST) return Http.POST(url, payload, h);
  throw new Error("No hay implementacion HTTP POST disponible");
}

function httpPostText(url, body, headers) {
  var resp = httpPost(url, body, headers);
  if (resp && typeof resp.body === "string") return resp.body;
  return resp ? txt(resp.body || resp.text || JSON.stringify(resp)) : "";
}

function httpGetText(url, headers) {
  var resp = httpGet(url, headers);
  if (resp && typeof resp.body === "string") return resp.body;
  return resp ? txt(resp.body || resp.text || JSON.stringify(resp)) : "";
}

function httpPostJson(url, body, headers) {
  var text = httpPostText(url, body, headers);
  return safeJson(text);
}

function httpGetJson(url, headers) {
  var text = httpGetText(url, headers);
  return safeJson(text);
}

// ============================================================
//  Worker API calls
// ============================================================

function workerGet(path) {
  var url = workerUrl() + path;
  dbg("Worker GET: " + url);
  var resp = httpGet(url, {});
  var body = resp && resp.body ? resp.body : resp;
  return safeJson(body) || { status: "error", body: txt(body) };
}

function workerPost(path, data) {
  var url = workerUrl() + path;
  dbg("Worker POST: " + url);
  var resp = httpPost(url, data || {}, { "Content-Type": "application/json" });
  var body = resp && resp.body ? resp.body : resp;
  return safeJson(body) || { status: "error", body: txt(body) };
}

// ============================================================
//  Worker endpoints (nuevos con v3)
// ============================================================

function workerHealth() {
  return workerGet("/health");
}

function workerAuth() {
  var emailAddr = settingEmail();
  var pass = settingPassword();
  var uid = settingUserId();
  var utoken = settingUserToken();
  var pcode = settingPortalCode();
  var pbase = settingPortalBase();

  var payload = {};

  if (emailAddr && pass) {
    payload.email = emailAddr;
    payload.password = pass;
    if (pbase) payload.portalBase = pbase;
  } else if (uid && utoken) {
    payload.userId = uid;
    payload.userToken = utoken;
    if (pcode) payload.portalCode = pcode;
    if (pbase) payload.portalBase = pbase;
  } else {
    return { ok: false, error: "Configura email+password o userId+userToken en ajustes del plugin" };
  }

  return workerPost("/auth", payload);
}

function workerHome() {
  var auth = ensureAuth();
  if (!auth || !auth.ok) return { data: [] };

  var headers = buildAuthHeaders(auth);
  var url = workerUrl() + "/api/getHome";
  var resp = httpPost(url, {}, headers);
  var body = resp && resp.body ? resp.body : resp;
  var parsed = safeJson(body);
  return parsed || { data: [] };
}

function workerSearch(query, page) {
  var auth = ensureAuth();
  var headers = auth && auth.ok ? buildAuthHeaders(auth) : { "Content-Type": "application/json" };

  var payload = { query: query, page: page || 1 };

  var url = workerUrl() + "/api/search";
  var resp = httpPost(url, payload, headers);
  var body = resp && resp.body ? resp.body : resp;
  return safeJson(body) || { data: [] };
}

function workerGetItemData(contentId) {
  var auth = ensureAuth();
  var headers = auth && auth.ok ? buildAuthHeaders(auth) : { "Content-Type": "application/json" };

  var payload = { contentId: contentId };
  var url = workerUrl() + "/api/getItemData";
  var resp = httpPost(url, payload, headers);
  var body = resp && resp.body ? resp.body : resp;
  return safeJson(body) || { data: null };
}

function workerGetSlbInfo(mediaCode, extra) {
  var auth = ensureAuth();
  var headers = auth && auth.ok ? buildAuthHeaders(auth) : { "Content-Type": "application/json" };

  var payload = { mediaCode: mediaCode };
  if (extra) { var k; for (k in extra) { if (extra.hasOwnProperty(k)) payload[k] = extra[k]; } }

  var url = workerUrl() + "/api/getSlbInfo";
  var resp = httpPost(url, payload, headers);
  var body = resp && resp.body ? resp.body : resp;
  return safeJson(body) || { data: null };
}

function workerWsHandshake(portalBase, deviceId, version) {
  var payload = {
    portalBase: portalBase,
    deviceId: deviceId || "GJDUMGQFGHJ=",
    version: version || "4.34.7"
  };
  return workerPost("/ws/handshake", payload);
}

function workerWsProxy(portalBase, message, timeout) {
  var payload = {
    portalBase: portalBase,
    message: message,
    timeout: timeout || 15000
  };
  return workerPost("/ws/proxy", payload);
}

function workerStreamHeaders(body) {
  return workerPost("/api/streamHeaders", body || {});
}

function workerEpg(channelId) {
  var url = workerUrl() + "/api/epg?ch=" + encodeURIComponent(channelId || "");
  return workerGet("/api/epg?ch=" + encodeURIComponent(channelId || ""));
}

function workerNotice() {
  return workerGet("/api/notice");
}

// ============================================================
//  Auth management
// ============================================================

function buildAuthHeaders(auth) {
  return {
    "Content-Type": "application/json",
    "X-Portal-Base": auth.portalBase || "",
    "X-User-Id": auth.userId || "",
    "X-User-Token": auth.userToken || "",
    "X-Portal-Code": auth.portalCode || ""
  };
}

function ensureAuth() {
  if (_authCache && _authCache.ok && _authCache.userId && _authCache.userToken) {
    return _authCache;
  }

  if (_authAttempted) return _authCache;
  _authAttempted = true;

  dbg("Iniciando autenticacion via Worker...");

  try {
    var result = workerAuth();
    if (result && result.ok && result.userId && result.userToken) {
      _authCache = result;
      dbg("Auth OK: userId=" + result.userId);
      return _authCache;
    }
    _authCache = { ok: false, error: (result && result.error) || "Auth fallida" };
    dbg("Auth fallida: " + _authCache.error);
  } catch (e) {
    _authCache = { ok: false, error: txt(e) };
    dbg("Auth exception: " + txt(e));
  }

  return _authCache;
}

function activeAuthed() {
  return _authCache && _authCache.ok && nonEmpty(_authCache.userId);
}

// ============================================================
//  Parseo de resultados
// ============================================================

function extractVideoArray(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (data.data && Array.isArray(data.data)) return data.data;
  if (data.inner && Array.isArray(data.inner)) return data.inner;
  if (data.list && Array.isArray(data.list)) return data.list;
  if (data.items && Array.isArray(data.items)) return data.items;
  if (data.channels && Array.isArray(data.channels)) return data.channels;
  if (data.contents && Array.isArray(data.contents)) return data.contents;
  if (data.shelveData && Array.isArray(data.shelveData)) {
    var all = [];
    var i;
    for (i = 0; i < data.shelveData.length; i++) {
      var shelf = data.shelveData[i];
      if (shelf.contents && Array.isArray(shelf.contents)) {
        var j;
        for (j = 0; j < shelf.contents.length; j++) all.push(shelf.contents[j]);
      }
    }
    if (all.length) return all;
  }
  return [];
}

function extractContentId(item) {
  return txt(
    item.contentId || item.content_id || item.id || item.mediaCode || item.media_code ||
    item.channelId || item.channel_id || item.vodId || item.vod_id || ""
  );
}

function extractTitle(item) {
  return txt(
    item.title || item.name || item.contentName || item.content_name ||
    item.channelName || item.channel_name || item.vodName || item.vod_name ||
    item.tvName || item.tv_name || ""
  );
}

function extractThumbnail(item) {
  var url = txt(
    item.logoUrl || item.logo_url || item.picUrl || item.pic_url || item.posterUrl || item.poster_url ||
    item.thumbUrl || item.thumb_url || item.image || item.icon || item.cover || item.coverUrl ||
    item.channelLogo || item.channel_logo || item.vodPicUrl || item.vod_pic || ""
  );
  if (!url) {
    var pics = item.pics || item.images || item.thumbs || item.thumbnails;
    if (pics && Array.isArray(pics) && pics.length) url = txt(pics[0]);
  }
  return url;
}

function extractDuration(item) {
  var d = item.duration || item.timeLength || item.time_length || item.totalTime || 0;
  return parseInt(d, 10) || 0;
}

function extractViewCount(item) {
  return parseInt(item.viewCount || item.view_count || item.playCount || item.play_count || 0, 10);
}

function extractYear(item) {
  return parseInt(item.year || item.publishYear || item.releaseYear || 0, 10);
}

function extractDescription(item) {
  return txt(
    item.description || item.desc || item.detail || item.intro || item.content || item.summary || ""
  );
}

function extractAuthor(item) {
  return txt(
    item.author || item.director || item.actor || item.artist || item.singer ||
    item.company || item.studio || item.source_name || item.sourceName || ""
  );
}

function extractIsLive(item) {
  if (item.isLive === true || item.is_live === true || item.live === true) return true;
  if (item.type === "live" || item.contentType === "live" || item.channelType === "live") return true;
  if (item.status === 1 && item.isVod !== true && item.is_vod !== true) return true;
  return false;
}

function extractEpisode(item) {
  var parts = [];
  if (item.episodeName || item.episode_name) parts.push(txt(item.episodeName || item.episode_name));
  if (item.episodeNum || item.episode_num) parts.push("E" + txt(item.episodeNum || item.episode_num));
  if (item.seasonNum || item.season_num) parts.push("S" + txt(item.seasonNum || item.season_num));
  if (item.groupName || item.group_name) parts.push(txt(item.groupName || item.group_name));
  return parts.join(" ");
}

function buildXuperUrl(contentId, item) {
  var id = txt(contentId);
  if (!id) return "";
  var extra = "";
  if (item) {
    if (item.seriesId || item.series_id) extra = "&seriesId=" + txt(item.seriesId || item.series_id);
    if (item.episodeId || item.episode_id) extra += "&episodeId=" + txt(item.episodeId || item.episode_id);
  }
  return "xuper://content?id=" + encodeURIComponent(id) + extra;
}

function itemToVideo(item) {
  var contentId = extractContentId(item);
  var title = extractTitle(item);
  var thumbnailUrl = extractThumbnail(item);
  var duration = extractDuration(item);
  var viewCount = extractViewCount(item);
  var isLive = extractIsLive(item);
  var url = buildXuperUrl(contentId, item);

  var thumbnails = [];
  if (thumbnailUrl) {
    thumbnails.push(new Thumbnail(thumbnailUrl, 480));
  }

  var authorName = extractAuthor(item);
  var authorLink = new PlatformAuthorLink(
    new PlatformID(PLATFORM_NAME, authorName || "XuperTv"),
    authorName || "XuperTv",
    ""
  );

  return new PlatformVideo({
    id: new PlatformID(PLATFORM_NAME, contentId),
    name: title || "Sin titulo",
    thumbnails: new Thumbnails(thumbnails),
    author: authorLink,
    datetime: new DateTime(item.date || item.pubDate || item.publishTime || 0),
    url: url,
    duration: duration,
    viewCount: viewCount,
    isLive: isLive
  });
}

function parseVideoList(data) {
  var items = extractVideoArray(data);
  var videos = [];
  var i;
  for (i = 0; i < items.length && videos.length < MAX_SOURCES; i++) {
    var item = items[i];
    if (item && extractContentId(item)) {
      videos.push(itemToVideo(item));
    }
  }
  return videos;
}

function parseVideoListDeep(data) {
  var videos = parseVideoList(data);

  if (!videos.length) {
    if (data && typeof data === "object") {
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
          if (sub.length) {
            videos = parseVideoList(sub);
            if (videos.length) break;
          }
        }
      }
    }
  }

  return videos;
}

// ============================================================
//  Streaming - extraccion de fuentes de video
// ============================================================

function extractSources(item) {
  var sources = [];

  // Direct URL
  var directUrl = txt(item.playUrl || item.play_url || item.url || item.streamUrl || item.stream_url || item.m3u8 || item.hls);
  if (directUrl) {
    var height = parseInt(item.height || item.resolution || item.quality || 0, 10) || 720;
    sources.push(new VideoUrlSource({
      url: directUrl,
      width: Math.round(height * 16 / 9),
      height: height,
      container: directUrl.indexOf(".m3u8") > -1 ? "application/x-mpegURL" : "video/mp4",
      codec: "H.264",
      requestModifier: new RequestModifier({ allowByteSkip: true })
    }));
  }

  // CDN node list
  var cdnList = item.cdnList || item.cdn_list || item.nodes || item.streamNodes || item.stream_nodes;
  if (cdnList && Array.isArray(cdnList)) {
    var i;
    for (i = 0; i < cdnList.length && sources.length < MAX_SOURCES; i++) {
      var node = cdnList[i];
      var nodeUrl = txt(node.url || node.path || node.streamUrl || node.stream_url || "");
      if (!nodeUrl && node.ip && node.port) {
        nodeUrl = "http://" + txt(node.ip) + ":" + txt(node.port) + txt(node.path || "");
      }
      if (nodeUrl) {
        var h = parseInt(node.height || node.resolution || node.quality || 720, 10);
        sources.push(new VideoUrlSource({
          url: nodeUrl,
          width: Math.round(h * 16 / 9),
          height: h || 720,
          container: nodeUrl.indexOf(".m3u8") > -1 ? "application/x-mpegURL" : "video/mp4",
          codec: "H.264",
          requestModifier: new RequestModifier({ allowByteSkip: true })
        }));
      }
    }
  }

  // Sub-items / episodes
  var episodes = item.episodes || item.episodeList || item.episode_list || item.contents;
  if (episodes && Array.isArray(episodes)) {
    var j;
    for (j = 0; j < episodes.length && sources.length < MAX_SOURCES; j++) {
      var ep = episodes[j];
      var epUrl = txt(ep.playUrl || ep.play_url || ep.url || ep.m3u8 || "");
      if (epUrl) {
        sources.push(new VideoUrlSource({
          url: epUrl,
          width: 1920,
          height: 1080,
          container: epUrl.indexOf(".m3u8") > -1 ? "application/x-mpegURL" : "video/mp4",
          codec: "H.264",
          requestModifier: new RequestModifier({ allowByteSkip: true })
        }));
      }
    }
  }

  return sources;
}

function extractSubtitles(item) {
  var subs = item.subtitles || item.subtitle || item.subList || item.sub_list || [];
  if (!Array.isArray(subs)) subs = [subs];
  var result = [];
  var i;
  for (i = 0; i < subs.length; i++) {
    var sub = subs[i];
    if (!sub) continue;
    var subUrl = txt(sub.url || sub.path || sub.file || sub.src || "");
    var subLang = txt(sub.lang || sub.language || sub.code || "es");
    var subLabel = txt(sub.label || sub.name || subLang);
    if (subUrl) {
      result.push(new Subtitle(new PlatformID(PLATFORM_NAME, subLang), subLabel, subUrl, "application/x-subrip"));
    }
  }
  return result;
}

// ============================================================
//  GrayJay API - Source methods
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

  try {
    var result = workerSearch(q, 1);
    var videos = parseVideoListDeep(result);
    var hasMore = videos.length >= SEARCH_PAGE_SIZE;
    dbg("Busqueda: " + videos.length + " resultados");
    return new VideoPager(videos, hasMore, { query: q, page: 1 });
  } catch (e) {
    dbg("Error busqueda: " + e);
    return new VideoPager([], false, { query: q, page: 1 });
  }
};

source.getVideoDetails = function(url) {
  var contentId = "";
  var match = txt(url).match(/xuper:\/\/content\?id=([^&]+)/);
  if (match) contentId = decodeURIComponent(match[1]);

  if (!contentId) {
    var rawId = txt(url).replace(/^xuber:\/\//i, "").replace(/^content\?id=/i, "");
    contentId = rawId;
  }

  if (!contentId) throw new Error("No se pudo identificar el contentId de: " + url);

  dbg("Detalles: " + contentId);

  var item = null;
  var sources = [];

  try {
    var resp = workerGetItemData(contentId);
    item = (resp && resp.data) ? resp.data : resp;
  } catch (e) {
    dbg("getItemData fallo: " + e);
  }

  if (!item) {
    item = { contentId: contentId, title: contentId };
  }

  var title = extractTitle(item) || contentId;
  var desc = extractDescription(item);
  var thumbUrl = extractThumbnail(item);
  var authorName = extractAuthor(item);
  var isLive = extractIsLive(item);
  var duration = extractDuration(item);

  var thumbnails = [];
  if (thumbUrl) thumbnails.push(new Thumbnail(thumbUrl, 480));

  var authorLink = new PlatformAuthorLink(
    new PlatformID(PLATFORM_NAME, authorName || "XuperTv"),
    authorName || "XuperTv",
    ""
  );

  var video = new PlatformVideo({
    id: new PlatformID(PLATFORM_NAME, contentId),
    name: title,
    thumbnails: new Thumbnails(thumbnails),
    author: authorLink,
    datetime: new DateTime(item.date || item.pubDate || item.publishTime || 0),
    url: txt(url),
    duration: duration,
    viewCount: extractViewCount(item),
    isLive: isLive
  });

  // Intentar obtener fuentes de stream via Worker
  try {
    sources = extractSources(item);
    if (!sources.length) {
      var slbResp = workerGetSlbInfo(contentId, { title: title });
      if (slbResp && slbResp.data) {
        sources = extractSources(slbResp.data);
      }
    }
  } catch (e) {
    dbg("Fuentes stream fallo: " + e);
  }

  var subs = [];
  try { subs = extractSubtitles(item); } catch (e) { dbg("Subs fallo: " + e); }

  var details = new PlatformVideoDetails({
    video: video,
    description: desc || title,
    videoSources: new VideoSourceDescriptor(sources),
    subtitles: subs
  });

  return details;
};

source.getHome = function() {
  dbg("Obteniendo home...");

  try {
    var result = workerHome();
    var videos = parseVideoListDeep(result);
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
  if (video && video.id) {
    contentId = txt(video.id.content || video.id.value || video.id);
  }

  if (!contentId && video && video.url) {
    var match = txt(video.url).match(/id=([^&]+)/);
    if (match) contentId = decodeURIComponent(match[1]);
  }

  if (!contentId) return [];

  try {
    var resp = workerGetItemData(contentId);
    var item = (resp && resp.data) ? resp.data : resp;
    if (item) {
      var sources = extractSources(item);
      if (sources.length) return sources;
    }
  } catch (e) {
    dbg("videoUrl getItemData: " + e);
  }

  try {
    var slbResp = workerGetSlbInfo(contentId);
    if (slbResp && slbResp.data) {
      return extractSources(slbResp.data);
    }
  } catch (e) {
    dbg("videoUrl getSlbInfo: " + e);
  }

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
    var health = workerHealth();
    workerOk = health && (health.status === "ok" || health.status === 200);
  } catch (e) {
    dbg("Diag health fallo: " + e);
  }

  try {
    var auth = ensureAuth();
    if (auth && auth.ok) {
      authState = "OK userId=" + auth.userId;
    } else {
      authState = "Fallo: " + (auth ? auth.error : "sin respuesta");
    }
  } catch (e) {
    authState = "Error: " + txt(e);
  }

  return {
    platform: PLATFORM_NAME,
    version: 56,
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
  _authCache = null;
  _authAttempted = false;
  dbg("Plugin habilitado v56");
};

source.setSettings = function(settings) {
  _settings = settings || {};
  _authCache = null;
  _authAttempted = false;
};

source.getSettings = function() {
  return [
    { key: "email", label: "Email", type: "text", placeholder: "tu@email.com" },
    { key: "password", label: "Contrasena", type: "password" },
    { key: "user_id", label: "User ID (opcional, manual)", type: "text" },
    { key: "user_token", label: "User Token (opcional, manual)", type: "text" },
    { key: "portal_code", label: "Portal Code (opcional, manual)", type: "text" },
    { key: "portal_base", label: "Portal URL (opcional, manual)", type: "text" },
    { key: "worker_url", label: "Worker URL", type: "text", defaultValue: DEFAULT_WORKER_URL },
    { key: "debug", label: "Debug", type: "boolean", defaultValue: false }
  ];
};
