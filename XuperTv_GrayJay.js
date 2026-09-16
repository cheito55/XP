/*
 * GrayJay - XuperTv Source v59
 * Tokens extraídos de capturas HAR - 16 sept 2026
 * Worker proxy para CORS + contenido pre-capturado
 * ES5 puro - REPOSITORIO: https://github.com/cheito55/XP
 */

var PLATFORM_NAME = "XuperTv";
var PLUGIN_ID = "8d1f6f41-7d4a-4e8c-a42f-5c9b7a31e602";
var DEFAULT_WORKER = "https://xuper-bridge.cheito55.workers.dev";

var _conf = {};
var _set = {};
var _ready = false;

function txt(v) { return v == null ? "" : String(v); }
function ok(v) { return v != null && String(v).trim() !== ""; }
function first() {
  var i;
  for (i = 0; i < arguments.length; i++) {
    if (ok(arguments[i])) return String(arguments[i]).trim();
  }
  return "";
}
function sj(s) { try { return JSON.parse(String(s)); } catch (e) { return null; } }
function gs(k, d) {
  try { if (_set && ok(_set[k])) return _set[k]; } catch (e) {}
  try { if (_conf && _conf.settings && ok(_conf.settings[k])) return _conf.settings[k]; } catch (e) {}
  return d || "";
}
function dbg(m) { try { if (_set && _set.debug) console.log("[XuperTv] " + m); } catch (e) {} }

function workerUrl() { return first(gs("worker_url"), DEFAULT_WORKER).replace(/\/+$/, ""); }

function httpGet(url, headers) {
  if (typeof http !== "undefined" && http.get) return http.get(url, headers || {});
  if (typeof http !== "undefined" && http.GET) return http.GET(url, headers || {});
  if (typeof Http !== "undefined" && Http.get) return Http.get(url, headers || {});
  if (typeof Http !== "undefined" && Http.GET) return Http.GET(url, headers || {});
  throw new Error("No HTTP GET");
}
function httpPost(url, body, headers) {
  var h = { "Content-Type": "application/json" };
  if (headers) { var hk; for (hk in headers) { if (headers.hasOwnProperty(hk)) h[hk] = headers[hk]; } }
  var p = typeof body === "string" ? body : JSON.stringify(body);
  if (typeof http !== "undefined" && http.post) return http.post(url, p, h);
  if (typeof http !== "undefined" && http.POST) return http.POST(url, p, h);
  if (typeof Http !== "undefined" && Http.post) return Http.post(url, p, h);
  if (typeof Http !== "undefined" && Http.POST) return Http.POST(url, p, h);
  throw new Error("No HTTP POST");
}

function wGet(path) {
  try {
    var resp = httpGet(workerUrl() + path, {});
    var b = resp && resp.body ? resp.body : resp;
    return sj(b);
  } catch (e) { dbg("wGet err: " + e); return null; }
}
function wPost(path, data) {
  try {
    var resp = httpPost(workerUrl() + path, data || {}, {});
    var b = resp && resp.body ? resp.body : resp;
    return sj(b);
  } catch (e) { dbg("wPost err: " + e); return null; }
}

function parseList(data) {
  if (!data) return [];
  var arr = data;
  if (data.data && Array.isArray(data.data)) arr = data.data;
  if (data.inner && Array.isArray(data.inner)) arr = data.inner;
  if (data.list && Array.isArray(data.list)) arr = data.list;
  if (!Array.isArray(arr)) arr = [];

  var videos = [], i;
  for (i = 0; i < arr.length && videos.length < 30; i++) {
    var item = arr[i];
    if (!item) continue;
    var id = txt(item.contentId || item.content_id || item.id || item.mediaCode || item.channelId || "");
    if (!id) continue;
    var title = txt(item.title || item.name || item.contentName || item.channelName || item.vodName || id);
    var thumb = txt(item.logoUrl || item.picUrl || item.pic_url || item.posterUrl || item.cover || item.image || "");
    var dur = parseInt(item.duration || item.timeLength || 0, 10) || 0;
    var live = item.isLive || item.is_live || item.type === "live";

    var thumbs = [];
    if (thumb) thumbs.push(new Thumbnail(thumb, 480));

    var video = new PlatformVideo({
      id: new PlatformID(PLATFORM_NAME, id),
      name: title,
      thumbnails: new Thumbnails(thumbs),
      author: new PlatformAuthorLink(new PlatformID(PLATFORM_NAME, "XuperTv"), "XuperTv", ""),
      datetime: new DateTime(0),
      url: "xuper://content?id=" + encodeURIComponent(id),
      duration: dur,
      viewCount: 0,
      isLive: live
    });
    videos.push(video);
  }
  return videos;
}

// === Source API ===
source.isContentDetailsUrl = function(u) { return /^xuper:\/\//i.test(txt(u)); };
source.isVideoDetailsUrl = function(u) { return /^xuper:\/\//i.test(txt(u)); };
source.isChannelUrl = function() { return false; };
source.getSearchSuggestions = function(q) { return ok(q) ? [q] : []; };
source.getSearchCapabilities = function() { return { types: ["video"], sorts: [], filters: [] }; };

source.search = function(query, type, order, filters) {
  dbg("Búsqueda no disponible - usa Home para contenido capturado");
  return new VideoPager([], false, { query: txt(query) });
};

source.getHome = function() {
  dbg("Cargando home...");
  var r = wPost("/api/home", {});
  if (!r || !r.ok) {
    dbg("Worker offline o sin respuesta");
    return new VideoPager([], false, { type: "home", page: 1 });
  }
  var vids = parseList(r);
  dbg("Home: " + vids.length + " items");
  return new VideoPager(vids, false, { type: "home", page: 1 });
};

source.getVideoDetails = function(url) {
  var id = "";
  var m = txt(url).match(/id=([^&]+)/);
  if (m) id = decodeURIComponent(m[1]);
  if (!id) id = txt(url).replace(/^xuper:\/\//i, "").replace(/^content\?id=/i, "");
  if (!id) throw new Error("No se pudo identificar el contentId");

  dbg("Detalles: " + id);
  var r = wPost("/api/details", { contentId: id });
  if (!r || !r.ok) throw new Error("No se pudieron obtener detalles");

  var item = r.data || {};
  var title = txt(item.title || item.name || id);
  var thumb = txt(item.logoUrl || item.picUrl || item.posterUrl || item.cover || "");
  var thumbs = [];
  if (thumb) thumbs.push(new Thumbnail(thumb, 480));
  var live = item.isLive || item.type === "live";

  var video = new PlatformVideo({
    id: new PlatformID(PLATFORM_NAME, id),
    name: title,
    thumbnails: new Thumbnails(thumbs),
    author: new PlatformAuthorLink(new PlatformID(PLATFORM_NAME, "XuperTv"), "XuperTv", ""),
    datetime: new DateTime(0),
    url: txt(url),
    duration: parseInt(item.duration || 0, 10) || 0,
    viewCount: 0,
    isLive: live
  });

  var sources = [];
  // Pedir stream info al worker
  var sr = wPost("/api/stream", { mediaCode: item.mediaCode || id });
  if (sr && sr.ok && sr.streamUrl) {
    sources.push(new VideoUrlSource({
      url: sr.streamUrl,
      width: 1920,
      height: 1080,
      container: live ? "application/x-mpegURL" : "video/mp4",
      codec: "H.264",
      requestModifier: new RequestModifier({
        headerOverride: sr.headers || {}
      })
    }));
  } else if (sr && sr.ok && sr.slbResponse) {
    dbg("SLB response received, parseando...");
    // La respuesta SLB es binaria/JSON con info de CDN
    sources.push(new VideoUrlSource({
      url: "xuper://pending?id=" + encodeURIComponent(id),
      width: 1920,
      height: 1080,
      container: "video/mp4",
      codec: "H.264"
    }));
  }

  return new PlatformVideoDetails({
    video: video,
    description: txt(item.description || title) + "\n\n[Nota: Tokens temporales de captura HAR]",
    videoSources: new VideoSourceDescriptor(sources),
    subtitles: []
  });
};

source.getVideoUrl = function(video) {
  var id = "";
  if (video && video.id) id = txt(video.id.content || video.id.value || video.id);
  if (!id && video && video.url) {
    var m = txt(video.url).match(/id=([^&]+)/);
    if (m) id = decodeURIComponent(m[1]);
  }
  if (!id) return [];
  dbg("URL: " + id);
  var sr = wPost("/api/stream", { mediaCode: id });
  if (!sr || !sr.ok) return [];
  if (sr.streamUrl) {
    return [new VideoUrlSource({
      url: sr.streamUrl,
      width: 1920,
      height: 1080,
      container: "video/mp4",
      codec: "H.264",
      requestModifier: new RequestModifier({
        headerOverride: sr.headers || {}
      })
    })];
  }
  return [];
};

source.getComments = function() { return []; };
source.getSubComments = function() { return []; };
source.getChannel = function() { return null; };
source.getChannelVideos = function() { return new VideoPager([], false); };
source.getChannelCapabilities = function() { return { types: [], sorts: [], filters: [] }; };

source.getDiagnostics = function() {
  var wOk = false;
  var wData = null;
  try {
    var h = wGet("/health");
    wOk = h && h.ok;
    wData = h;
  } catch (e) {}
  return {
    platform: PLATFORM_NAME,
    version: 59,
    worker: { url: workerUrl(), online: wOk, data: wData },
    note: "Tokens HAR temporales. Actualizar con /api/tokens del Worker."
  };
};

source.enable = function(conf, settings, savedState) {
  _conf = conf || {};
  _set = settings || {};
  _ready = true;
  dbg("Plugin v59 habilitado");
};
source.setSettings = function(s) { _set = s || {}; };
source.getSettings = function() {
  return [
    { key: "worker_url", label: "Worker URL", type: "text", defaultValue: DEFAULT_WORKER },
    { key: "debug", label: "Debug", type: "boolean", defaultValue: false }
  ];
};
