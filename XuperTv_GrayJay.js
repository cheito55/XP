/* GrayJay XuperTv v94 - Conectado al Worker unificado de xuper-webapp */
var PLATFORM = "XuperTv";
var DEFAULT_WORKER = "https://xuper-webapp.cheito55.workers.dev";
var DEFAULT_PORTAL = "masnew";

var _conf = {};
var _settings = {};
var _workerUrl = DEFAULT_WORKER;
var _session = {
  userId: "",
  userToken: "",
  portalCode: "",
  devId: ""
};
var _loginTried = false;

/* ===================== Helpers ===================== */
function bodyJson(r) {
  try {
    return r && r.isOk && r.body ? JSON.parse(r.body) : null;
  } catch (e) {
    return null;
  }
}

function setting(k) {
  if (_settings && _settings[k] !== undefined && _settings[k] !== null && String(_settings[k]).trim() !== "") {
    return String(_settings[k]).trim();
  }
  if (_conf && _conf.settings && _conf.settings[k] !== undefined && _conf.settings[k] !== null && String(_conf.settings[k]).trim() !== "") {
    return String(_conf.settings[k]).trim();
  }
  if (typeof plugin !== "undefined" && plugin && plugin.settings && plugin.settings[k] !== undefined && plugin.settings[k] !== null && String(plugin.settings[k]).trim() !== "") {
    return String(plugin.settings[k]).trim();
  }
  return "";
}

function boolSetting(k, defVal) {
  var v = setting(k).toLowerCase();
  if (!v) return !!defVal;
  return v === "true" || v === "1" || v === "yes" || v === "si";
}

function worker() {
  var u = setting("worker_url") || _workerUrl || DEFAULT_WORKER;
  return u.replace(/\/+$/g, "").trim();
}

function useStreamProxy() {
  return boolSetting("use_stream_proxy", false);
}

function sessionHeaders() {
  var h = { "Content-Type": "application/json" };
  var uid = setting("user_id") || _session.userId;
  var tok = setting("user_token") || _session.userToken;
  var portal = setting("portal_code") || _session.portalCode || DEFAULT_PORTAL;
  var dev = setting("dev_id") || _session.devId;
  if (uid) h["X-Xuper-User-Id"] = uid;
  if (tok) h["X-Xuper-Token"] = tok;
  if (portal) h["X-Xuper-Portal"] = portal;
  if (dev) h["X-Xuper-Dev-Id"] = dev;
  return h;
}

function cacheSession(d) {
  if (!d) return false;
  var x = d.session || d.data || d;
  var uid = String(x.userId || x.user_id || "");
  var tok = String(x.userToken || x.user_token || x.token || "");
  var portal = String(x.portalCode || x.portal_code || DEFAULT_PORTAL);
  var dev = String(x.devId || x.dev_id || setting("dev_id") || "");
  if (uid) _session.userId = uid;
  if (tok) _session.userToken = tok;
  if (portal) _session.portalCode = portal;
  if (dev) _session.devId = dev;
  return !!(_session.userId && _session.userToken);
}

function doLogin() {
  var email = setting("email");
  var password = setting("password");
  if (!email || !password || _loginTried) return false;
  _loginTried = true;
  try {
    var r = http.POST(
      worker() + "/api/login",
      JSON.stringify({
        email: email,
        password: password,
        devId: setting("dev_id") || undefined
      }),
      { "Content-Type": "application/json" },
      false
    );
    var d = bodyJson(r);
    return !!(d && d.ok && cacheSession(d));
  } catch (e) {
    return false;
  }
}

function ensureSession() {
  if (setting("user_id") && setting("user_token")) {
    return true;
  }
  if (_session.userId && _session.userToken) {
    return true;
  }
  return doLogin();
}

function post(path, obj) {
  try {
    return http.POST(worker() + path, JSON.stringify(obj || {}), sessionHeaders(), false);
  } catch (e) {
    return null;
  }
}

function get(path) {
  try {
    return http.GET(worker() + path, {}, false);
  } catch (e) {
    return null;
  }
}

function queryParam(url, name) {
  var re = new RegExp("[?&]" + name + "=([^&]+)");
  var m = String(url || "").match(re);
  if (!m) return "";
  try {
    return decodeURIComponent(m[1]);
  } catch (e) {
    return m[1];
  }
}

/* ===================== Mapping ===================== */
function thumb(url) {
  if (!url) return new Thumbnails([]);
  return new Thumbnails([new Thumbnail(String(url), 500)]);
}

function author() {
  return new PlatformAuthorLink(
    new PlatformID(PLATFORM, "XuperTv", _conf.id),
    "XuperTv",
    ""
  );
}

function videoFrom(x) {
  if (!x) return null;
  var id = String(
    x.mediaCode ||
    x.contentId ||
    x.content_id ||
    x.assetId ||
    x.id ||
    x.channelCode ||
    ""
  );
  if (!id) return null;

  var live = !!(
    x.isLive === true ||
    x.type === "live" ||
    x.channelCode ||
    x.channel_code
  );
  var title = String(
    x.title ||
    x.name ||
    x.vodName ||
    x.assetName ||
    x.channelName ||
    id
  );
  var poster = String(
    x.posterUrl ||
    x.picUrl ||
    x.logoUrl ||
    x.poster ||
    x.imageUrl ||
    x.assetPic ||
    ""
  );

  var u = "xuper://" + (live ? "live" : "vod") +
    "?id=" + encodeURIComponent(id) +
    "&t=" + encodeURIComponent(title) +
    (poster ? "&p=" + encodeURIComponent(poster) : "") +
    (x.type ? "&vt=" + encodeURIComponent(String(x.type)) : "");

  return new PlatformVideo({
    id: new PlatformID(PLATFORM, id, _conf.id),
    name: title,
    thumbnails: thumb(poster),
    author: author(),
    uploadDate: 0,
    duration: Number(x.duration || 0),
    viewCount: 0,
    url: u,
    isLive: live
  });
}

function pager(arr) {
  return new VideoPager(arr || [], false);
}

function workerItems(path, obj) {
  var r = post(path, obj || {});
  var d = bodyJson(r);

  if ((!d || !d.ok) && ensureSession()) {
    r = post(path, obj || {});
    d = bodyJson(r);
  }

  if (d && d.error && String(d.error).indexOf("NO_SESSION") >= 0) {
    _session = { userId: "", userToken: "", portalCode: "", devId: "" };
    _loginTried = false;
    if (doLogin()) {
      r = post(path, obj || {});
      d = bodyJson(r);
    }
  }

  if (d && d.ok && Array.isArray(d.data)) return d.data;
  return [];
}

function buildSourceEntry(url, extraHeaders, qualityLabel) {
  var isHls = /\.m3u8(\?|$)|\/stream\?|hls/i.test(String(url));
  var headers = {};
  if (extraHeaders && typeof extraHeaders === "object") {
    for (var k in extraHeaders) {
      if (Object.prototype.hasOwnProperty.call(extraHeaders, k) && extraHeaders[k]) {
        headers[k] = String(extraHeaders[k]);
      }
    }
  }

  var hasHeaders = Object.keys(headers).length > 0;
  var cfg = {
    name: qualityLabel || (isHls ? "HLS Auto" : "Directo"),
    url: String(url),
    duration: 0
  };
  if (hasHeaders) {
    cfg.requestModifier = { headers: headers };
  }

  if (isHls && typeof HLSSource === "function") {
    return new HLSSource(cfg);
  }

  return new VideoUrlSource({
    name: cfg.name,
    url: cfg.url,
    width: 1920,
    height: 1080,
    container: isHls ? "application/x-mpegURL" : "video/mp4",
    codec: "H.264",
    duration: 0,
    requestModifier: cfg.requestModifier
  });
}

/* ===================== Source implementation ===================== */
source.enable = function (conf, settings, savedState) {
  _conf = conf || {};
  _settings = settings || (_conf.settings || {});
  if (setting("worker_url")) {
    _workerUrl = setting("worker_url");
  }
  _loginTried = false;
};

source.setSettings = function (s) {
  _settings = s || {};
  if (s && s.worker_url) {
    _workerUrl = String(s.worker_url).replace(/\/+$/g, "").trim();
  }
};

source.getSearchCapabilities = function () {
  return {
    types: [Type.Feed.Mixed],
    sorts: [],
    filters: []
  };
};

source.isChannelUrl = function () { return false; };

source.isContentDetailsUrl = function (u) {
  return /^xuper:\/\//i.test(String(u || ""));
};

source.isVideoDetailsUrl = source.isContentDetailsUrl;

/* ---------- Search ---------- */
source.search = function (q, type, order, filters, continuationToken) {
  var a = workerItems("/api/search", {
    q: String(q || ""),
    pageNum: 1,
    pageSize: 40
  });
  var out = [];
  for (var i = 0; i < a.length; i++) {
    var v = videoFrom(a[i]);
    if (v) out.push(v);
  }
  return pager(out);
};

source.searchSuggestions = function (q) {
  var a = workerItems("/api/search", {
    q: String(q || ""),
    pageNum: 1,
    pageSize: 10
  });
  var o = [];
  for (var i = 0; i < a.length && i < 6; i++) {
    o.push(String(a[i].title || a[i].name || ""));
  }
  return o;
};

/* ---------- Home ---------- */
source.getHome = function () {
  var a = workerItems("/api/home", { pageNum: 1, pageSize: 40 });
  var o = [];
  for (var i = 0; i < a.length; i++) {
    var v = videoFrom(a[i]);
    if (v) o.push(v);
  }
  return pager(o);
};

/* ---------- Content Details (Play) ---------- */
source.getContentDetails = function (url) {
  var s = String(url || "");
  var m = s.match(/^xuper:\/\/(live|vod)\?id=([^&]+)/i);
  if (!m) return null;

  var live = m[1].toLowerCase() === "live";
  var id = decodeURIComponent(m[2]);
  var fallbackTitle = queryParam(s, "t") || id;
  var fallbackPoster = queryParam(s, "p") || "";
  var itemType = queryParam(s, "vt") || "";
  var wantProxy = useStreamProxy();

  var payload = {
    mediaCode: id,
    id: id,
    contentId: id,
    type: itemType || undefined,
    useProxy: wantProxy
  };

  var r = post(live ? "/api/live" : "/api/stream", payload);
  var d = bodyJson(r);

  if ((!d || !d.ok) && ensureSession()) {
    r = post(live ? "/api/live" : "/api/stream", payload);
    d = bodyJson(r);
  }

  var src = [];
  var seen = {};
  var metaTitle = fallbackTitle;
  var metaPoster = fallbackPoster;
  var metaDesc = "XuperTv";
  var metaDuration = 0;
  var subs = [];
  var wBase = worker();

  if (d && d.ok && d.data) {
    var info = d.data;
    if (info.title) metaTitle = String(info.title);
    if (info.posterUrl) metaPoster = String(info.posterUrl);
    if (info.description) metaDesc = String(info.description);
    if (info.duration) metaDuration = Number(info.duration || 0);

    var defaultHeaders = (!wantProxy && info.headers && typeof info.headers === "object")
      ? info.headers
      : (!wantProxy ? {
          "User-Agent": "Ranger/4.9.4-17294ac0",
          "App": "com.xuper.app",
          "App-Version": "6.5.7"
        } : null);

    var addUrl = function (u, hdrs, label) {
      if (!u || seen[u]) return;
      seen[u] = true;
      var finalUrl = wantProxy && String(u).indexOf("/stream?url=") < 0
        ? (wBase + "/stream?url=" + encodeURIComponent(String(u)))
        : String(u);
      var isProxied = wantProxy || finalUrl.indexOf(wBase + "/stream") === 0;
      src.push(buildSourceEntry(finalUrl, isProxied ? null : (hdrs || defaultHeaders), label));
    };

    if (Array.isArray(info.sources)) {
      for (var k = 0; k < info.sources.length; k++) {
        var item = info.sources[k];
        if (item && item.url) {
          addUrl(item.url, item.headers || defaultHeaders, item.quality || item.name);
        }
      }
    }
    if (info.streamUrl) addUrl(info.streamUrl, defaultHeaders, "Principal");
    if (Array.isArray(info.urls)) {
      for (var i = 0; i < info.urls.length; i++) {
        addUrl(info.urls[i], defaultHeaders, "Mirror " + (i + 1));
      }
    }
    if (info.playUrl) addUrl(info.playUrl, defaultHeaders, "Play");
    if (info.liveUrl) addUrl(info.liveUrl, defaultHeaders, "En vivo");
    if (info.url) addUrl(info.url, defaultHeaders, "Stream");

    if (Array.isArray(info.subtitles) && typeof TextTrack === "function") {
      for (var sb = 0; sb < info.subtitles.length; sb++) {
        var sub = info.subtitles[sb];
        if (sub && sub.url) {
          subs.push(new TextTrack({
            url: String(sub.url),
            name: String(sub.lang || sub.name || "Subtitulo"),
            format: "text/vtt"
          }));
        }
      }
    }
  }

  return new PlatformVideoDetails({
    id: new PlatformID(PLATFORM, id, _conf.id),
    name: metaTitle,
    thumbnails: thumb(metaPoster),
    author: author(),
    uploadDate: 0,
    duration: metaDuration,
    viewCount: 0,
    url: s,
    isLive: live,
    description: metaDesc,
    video: new VideoSourceDescriptor(src),
    live: (live && src.length > 0) ? src[0] : null,
    rating: new RatingLikes(0),
    subtitles: subs
  });
};

/* ---------- Dummy channel methods ---------- */
source.getChannelContents = function () { return pager([]); };
source.searchChannels = function () { return pager([]); };
source.getChannel = function () {
  return new PlatformChannel({
    id: new PlatformID(PLATFORM, "XuperTv", _conf.id),
    name: "XuperTv",
    thumbnails: new Thumbnails([]),
    url: "",
    subscriberCount: 0
  });
};

/* ---------- Diagnostics ---------- */
source.getDiagnostics = function () {
  var r = get("/health");
  var d = bodyJson(r);
  return {
    platform: PLATFORM,
    version: 94,
    workerUrl: worker(),
    useStreamProxy: useStreamProxy(),
    workerOnline: !!(d && d.ok),
    hasKvSession: !!(d && d.hasSession),
    sessionConfigured: !!(
      (setting("user_id") && setting("user_token")) ||
      (setting("email") && setting("password")) ||
      (_session.userId && _session.userToken) ||
      (d && d.hasSession)
    ),
    currentSession: {
      userId: _session.userId || setting("user_id") || "",
      portalCode: _session.portalCode || setting("portal_code") || DEFAULT_PORTAL,
      hasToken: !!(_session.userToken || setting("user_token"))
    },
    worker: d || null
  };
};
