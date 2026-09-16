/*
 * GrayJay Plugin - XuperTv v87
 * Catálogo TMDB (recomendaciones Home + Búsqueda)
 * Subtítulos + Multi-servidor automático
 * ES5 compatible
 * REPOSITORIO: https://github.com/cheito55/XP
 *
 * CONFIG:
 *   tmdb_api_key: tu API key de TMDB (opcional pero recomendado)
 *   worker_url: URL del Worker (por defecto xuper-bridge)
 */

var PLATFORM = "XuperTv";
var DEFAULT_WORKER = "https://xuper-bridge.cheito55.workers.dev";
var TMDB_IMG = "https://image.tmdb.org/t/p";
var TMDB_KEY = "a5908e29bac47d6ef32f27c44ecda02a"; // key del usuario

var _conf = {};
var _workerUrl = DEFAULT_WORKER;

var CAPTURED_ITEMS = [
  { id: "cyx_50fdcc0817d61_720p", title: "Canal En Vivo 720p", isLive: true },
  { id: "BCF940BE93754676AB0877E91258675D", title: "Pelicula VOD 1 (BCF9)", isLive: false },
  { id: "45063077C8374DCF8755FF214D8DD0B4", title: "Pelicula VOD 2 (4506)", isLive: false },
  { id: "B617D2ED6E724D1196390AE68C7E6CCD", title: "Pelicula con Subtitulos", isLive: false }
];

var VOD_URLS = {
  "BCF940BE93754676AB0877E91258675D": {
    urls: [
      "http://69.162.99.51:31412/vod/BCF940BE93754676AB0877E91258675D_media.ts?content_auth2=/vod/%3Ftag%3Dslb%26host%3D69.162.99.51:31412%26app_id%3Dcom.android.msandroid%26trans_id%3DlWAlK1oHN0c_i6cRrfYFhEAY%26app_version%3D49902%26client_ip%3D181.13.73.42%26dev_id%3D761cd6edc9681aa5d27dd1e1fa38ae08%26auth_id%3D556784760_com.android.msandroid__0%26user_id%3D556784760%26expired%3D1789593919%26token%3D8f60f9f0054946ba09309ffd3136a4ba&content_license2=tag%3Dslb%26scheme%3Dslb%26app_id%3Dcom.android.msandroid%26media_code%3DBCF940BE93754676AB0877E91258675D%26expired%3D1789593919%26token%3D180867fe7fe9c3865279913b2bad828a"
    ],
    subtitles: []
  },
  "45063077C8374DCF8755FF214D8DD0B4": {
    urls: [
      "http://216.245.209.219:11114/vod/45063077C8374DCF8755FF214D8DD0B4_media.mp4?content_auth2=/vod/%3Ftag%3Dslb%26host%3D216.245.209.219:11114%26app_id%3Dcom.android.msandroid%26trans_id%3DlWAlK1oHN0c_2jEa2TPfpbzN%26app_version%3D49902%26client_ip%3D181.13.73.42%26dev_id%3D761cd6edc9681aa5d27dd1e1fa38ae08%26auth_id%3D556784760_com.android.msandroid__0%26user_id%3D556784760%26expired%3D1789593919%26token%3D22f69b748bbf933a258f7225b34e1591&content_license2=tag%3Dslb%26scheme%3Dslb%26app_id%3Dcom.android.msandroid%26media_code%3D45063077C8374DCF8755FF214D8DD0B4%26expired%3D1789593919%26token%3D0a5130f0d397aa334f11a1ee51415c7c"
    ],
    subtitles: []
  },
  "B617D2ED6E724D1196390AE68C7E6CCD": {
    urls: [
      "http://216.245.210.139:17209/vod/B617D2ED6E724D1196390AE68C7E6CCD_media.ts?content_auth2=/vod/%3Ftag%3Dslb%26host%3D216.245.210.139:17209%26app_id%3Dcom.android.msandroid%26trans_id%3DJJnpIuz8DaBR_2dIv68uxEl4%26app_version%3D49902%26client_ip%3D190.138.158.244%26dev_id%3D4bcbba56be83f23758c36b1afc33f8b5%26auth_id%3D958502306_com.android.msandroid__0%26user_id%3D958502306%26expired%3D1789083981%26token%3D69a9859b96326022d60d4b82484b0a76&content_license2=tag%3Dslb%26scheme%3Dslb%26app_id%3Dcom.android.msandroid%26media_code%3DB617D2ED6E724D1196390AE68C7E6CCD%26expired%3D1789083981%26token%3Db1e2c16a5dc6f19b9e3f3d1c30123222"
    ],
    subtitles: [
      { name: "Español (Esp)", language: "es", url: "http://cxdgdx.zobpngkth.com/public/subs/e7541da1-35d4-411f-b3fa-329833f5d68f.srt", format: "srt" },
      { name: "English", language: "en", url: "http://cxdgdx.zobpngkth.com/public/subs/8b88a816-d64d-4f9c-ab85-0289bbdff11c.srt", format: "srt" }
    ]
  },
  "cyx_50fdcc0817d61_720p": {
    urls: ["http://23.227.144.242:44822/live/cyx_50fdcc0817d61_720p.m3u8"],
    subtitles: [],
    isLive: true
  }
};

function safeGet(url) {
  try { return http.GET(url, {}); } catch (e) { return null; }
}
function safeParseJson(body) {
  try { return JSON.parse(body); } catch (e) { return null; }
}
function getWorkerUrl() {
  if (_conf && _conf.settings && _conf.settings.worker_url) {
    return String(_conf.settings.worker_url).replace(/\/+$/, "");
  }
  return _workerUrl;
}
function tmdbImg(path, size) {
  if (!path) return "";
  return TMDB_IMG + "/" + (size || "w500") + path;
}
function tmdbApiKey() {
  if (_conf && _conf.settings && _conf.settings.tmdb_api_key) {
    return String(_conf.settings.tmdb_api_key).trim();
  }
  return TMDB_KEY;
}

function tmdbRequest(path) {
  try {
    var url = "https://api.themoviedb.org/3" + path + "&api_key=" + tmdbApiKey();
    var resp = safeGet(url);
    if (!resp || !resp.isOk || !resp.body) return null;
    var data = safeParseJson(resp.body);
    if (!data || data.status_code) return null;
    return data;
  } catch (e) { return null; }
}

function tmdbItemToVideo(r, extraTitle) {
  var title = r.title || r.name || extraTitle || "";
  var year = (r.release_date || r.first_air_date || "").substring(0, 4);
  var posterPath = r.poster_path || "";
  var backdropPath = r.backdrop_path || "";
  var thumbs = [];
  if (posterPath) thumbs.push(new Thumbnail(tmdbImg(posterPath, "w500"), 500));
  if (backdropPath) thumbs.push(new Thumbnail(tmdbImg(backdropPath, "w780"), 780));
  var mediaType = r.media_type || r.mediaType || "movie";
  var tmdbId = r.id || r.tmdbId || 0;
  return new PlatformVideo({
    id: new PlatformID(PLATFORM, mediaType + "_" + tmdbId, _conf.id),
    name: title + (year ? " (" + year + ")" : ""),
    thumbnails: new Thumbnails(thumbs),
    author: new PlatformAuthorLink(
      new PlatformID(PLATFORM, "XuperTv", _conf.id),
      "XuperTv", ""
    ),
    uploadDate: 0,
    duration: 0,
    viewCount: 0,
    url: "tmdb://" + mediaType + "/" + tmdbId,
    isLive: false
  });
}

function tmdbYear(year) {
  if (!year) return "";
  return " (" + year + ")";
}

// === HOME: TMDB trending + popular movies + popular series ===
function tmdbHome() {
  var videos = [];
  var i;

  var trending = tmdbRequest("/trending/all/week?language=es-MX");
  if (trending && trending.results) {
    for (i = 0; i < trending.results.length; i++) {
      videos.push(tmdbItemToVideo(trending.results[i], "Tendencia"));
    }
  }

  var movies = tmdbRequest("/movie/popular?language=es-MX&page=1");
  if (movies && movies.results) {
    for (i = 0; i < movies.results.length; i++) {
      var m = movies.results[i];
      m.media_type = "movie";
      videos.push(tmdbItemToVideo(m));
    }
  }

  var series = tmdbRequest("/tv/popular?language=es-MX&page=1");
  if (series && series.results) {
    for (i = 0; i < series.results.length; i++) {
      var s = series.results[i];
      s.media_type = "tv";
      videos.push(tmdbItemToVideo(s));
    }
  }

  // Add captured XuperTv items
  for (i = 0; i < CAPTURED_ITEMS.length; i++) {
    var item = CAPTURED_ITEMS[i];
    if (item.isLive) continue;
    var st = VOD_URLS[item.id];
    if (!st || !st.urls || st.urls.length === 0) continue;
    videos.push(buildCapturedVideo(item));
  }

  return videos;
}

function tmdbSearch(query) {
  if (!query) return [];
  var videos = [];
  var data = tmdbRequest("/search/multi?query=" + encodeURIComponent(query) + "&language=es-MX&page=1&include_adult=false");
  if (data && data.results) {
    for (var i = 0; i < data.results.length; i++) {
      var r = data.results[i];
      if (r.media_type === "movie" || r.media_type === "tv") {
        videos.push(tmdbItemToVideo(r));
      }
    }
  }
  return videos;
}

function buildCapturedVideo(item) {
  var id = item.id;
  var title = item.title || id;
  var isLive = !!item.isLive;
  var thumbs = [];
  var url = "xuper://" + (isLive ? "live" : "vod") + "?id=" + encodeURIComponent(id);
  return new PlatformVideo({
    id: new PlatformID(PLATFORM, id, _conf.id),
    name: (isLive ? "LIVE: " : "XUPER: ") + title,
    thumbnails: new Thumbnails(thumbs),
    author: new PlatformAuthorLink(
      new PlatformID(PLATFORM, "XuperTv", _conf.id),
      "XuperTv", ""
    ),
    uploadDate: 0,
    duration: 0,
    viewCount: 0,
    url: url,
    isLive: isLive
  });
}

function makePager(videos) {
  return new VideoPager(videos || [], false, null);
}

// === Source API ===
source.enable = function(conf) { _conf = conf; };

source.getSettings = function() {
  return [
    { key: "worker_url", label: "Worker URL", type: "text", defaultValue: DEFAULT_WORKER },
    { key: "tmdb_api_key", label: "TMDB API Key (themoviedb.org/settings/api)", type: "text", defaultValue: "" }
  ];
};
source.setSettings = function(settings) {
  if (settings && settings.worker_url) {
    _workerUrl = String(settings.worker_url).replace(/\/+$/, "");
  }
};

source.getSearchCapabilities = function() {
  return { types: [Type.Feed.Mixed], sorts: [], filters: [] };
};
source.isChannelUrl = function() { return false; };
source.isContentDetailsUrl = function(url) {
  return /^xuper:\/\//i.test(String(url || "")) || /^tmdb:\/\//i.test(String(url || ""));
};
source.isVideoDetailsUrl = function(url) {
  return /^xuper:\/\//i.test(String(url || "")) || /^tmdb:\/\//i.test(String(url || ""));
};

source.search = function(query, type, order, filters, continuationToken) {
  var videos = tmdbSearch(query);
  return makePager(videos);
};
source.searchSuggestions = function(query) {
  if (!query) return [];
  var videos = tmdbSearch(query);
  var suggestions = [];
  for (var i = 0; i < Math.min(videos.length, 5); i++) {
    suggestions.push(videos[i].name);
  }
  return suggestions;
};

source.getHome = function(continuationToken) {
  var videos = tmdbHome();
  if (videos.length === 0) {
    // Fallback: captured items
    for (var i = 0; i < CAPTURED_ITEMS.length; i++) {
      videos.push(buildCapturedVideo(CAPTURED_ITEMS[i]));
    }
  }
  return makePager(videos);
};

source.getContentDetails = function(url) {
  var s = String(url || "");

  // TMDB details (catálogo)
  var tmdbMatch = s.match(/^tmdb:\/\/(movie|tv)\/(\d+)/);
  if (tmdbMatch) {
    var mediaType = tmdbMatch[1];
    var tmdbId = tmdbMatch[2];
    var data = tmdbRequest("/" + mediaType + "/" + tmdbId + "?language=es-MX&append_to_response=videos,credits,similar");
    if (data) {
      var title = data.title || data.name || "Sin titulo";
      var year = (data.release_date || data.first_air_date || "").substring(0, 4);
      var overview = data.overview || "";
      var posterPath = data.poster_path || "";
      var backdropPath = data.backdrop_path || "";
      var thumbs = [];
      if (posterPath) thumbs.push(new Thumbnail(tmdbImg(posterPath, "w500"), 500));
      if (backdropPath) thumbs.push(new Thumbnail(tmdbImg(backdropPath, "w780"), 780));

      var authorName = "XuperTv";
      if (data.credits && data.credits.crew) {
        for (var ci = 0; ci < Math.min(data.credits.crew.length, 3); ci++) {
          var c = data.credits.crew[ci];
          if (c.job === "Director" || c.job === "Creator") { authorName = c.name; break; }
        }
      }

      // Genre names
      var genres = "";
      if (data.genres) {
        for (var gi = 0; gi < Math.min(data.genres.length, 3); gi++) {
          genres += (gi > 0 ? ", " : "") + data.genres[gi].name;
        }
      }

      var desc = overview + "\n\nGénero: " + (genres || "N/A") +
        "\n\nNota: El catálogo TMDB es un buscador. El contenido real de XuperTv usa códigos propios (WS binario) que expiran. Para ver una película del catálogo XuperTv necesitás capturar sus tokens.";

      return new PlatformVideoDetails({
        id: new PlatformID(PLATFORM, mediaType + "_" + tmdbId, _conf.id),
        name: title + tmdbYear(year),
        thumbnails: new Thumbnails(thumbs),
        author: new PlatformAuthorLink(
          new PlatformID(PLATFORM, authorName, _conf.id),
          authorName, ""
        ),
        uploadDate: 0,
        duration: data.runtime ? data.runtime * 60 : 0,
        viewCount: 0,
        url: url,
        isLive: false,
        description: desc,
        video: new VideoSourceDescriptor([]),
        live: null,
        rating: new RatingLikes(data.vote_count || 0),
        subtitles: []
      });
    }
  }

  // XuperTv captured content
  var id = "";
  var isLive = false;
  var m = s.match(/xuper:\/\/(live|vod)\?id=([^&]+)/);
  if (m) { isLive = (m[1] === "live"); id = decodeURIComponent(m[2]); }
  if (!id) id = s;

  var st = VOD_URLS[id] || {};
  var urls = st.urls || [];
  var title = id;
  for (var i = 0; i < CAPTURED_ITEMS.length; i++) {
    if (CAPTURED_ITEMS[i].id === id) { title = CAPTURED_ITEMS[i].title; break; }
  }

  // Try worker for fresh URL
  var workerStream = null;
  if (!isLive && (!urls || urls.length === 0)) {
    try {
      var wresp = http.POST(getWorkerUrl() + "/api/stream", JSON.stringify({ mediaCode: id }), { "Content-Type": "application/json" });
      if (wresp && wresp.isOk && wresp.body) {
        var wdata = safeParseJson(wresp.body);
        if (wdata && wdata.ok && wdata.data && wdata.data.streamUrl) {
          workerStream = wdata.data.streamUrl;
        }
      }
    } catch (e) {}
  }

  var videoSources = [];
  if (urls.length > 0) {
    for (var ui = 0; ui < urls.length; ui++) {
      videoSources.push(new VideoUrlSource({
        url: urls[ui],
        width: 1920,
        height: 1080,
        container: isLive ? "application/x-mpegURL" : "video/mp2t",
        codec: "H.264"
      }));
    }
  }
  if (workerStream) {
    videoSources.push(new VideoUrlSource({
      url: workerStream,
      width: 1920,
      height: 1080,
      container: "video/mp2t",
      codec: "H.264"
    }));
  }

  // Subtitles from captures
  var subtitles = [];
  if (st.subtitles) {
    for (var si = 0; si < st.subtitles.length; si++) {
      var sub = st.subtitles[si];
      subtitles.push({
        name: sub.name || "Subtitulo",
        language: sub.language || "es",
        url: sub.url,
        format: sub.format || "srt"
      });
    }
  }

  return new PlatformVideoDetails({
    id: new PlatformID(PLATFORM, id, _conf.id),
    name: title,
    thumbnails: new Thumbnails([]),
    author: new PlatformAuthorLink(
      new PlatformID(PLATFORM, "XuperTv", _conf.id),
      "XuperTv", ""
    ),
    uploadDate: 0,
    duration: 0,
    viewCount: 0,
    url: url,
    isLive: isLive,
    description: title + "\n\nXuperTv - Contenido capturado",
    video: new VideoSourceDescriptor(videoSources),
    live: null,
    rating: new RatingLikes(0),
    subtitles: subtitles
  });
};

source.getChannelContents = function() { return makePager([]); };
source.searchChannels = function() { return makePager([]); };
source.getChannel = function() {
  return new PlatformChannel({
    id: new PlatformID(PLATFORM, "XuperTv", _conf.id),
    name: "XuperTv",
    thumbnails: new Thumbnails([]),
    url: "",
    subscriberCount: 0
  });
};
source.getDiagnostics = function() {
  var wOk = false;
  var tOk = false;
  try {
    var h = safeGet(getWorkerUrl() + "/health");
    if (h && h.isOk) { var d = safeParseJson(h.body); wOk = !!(d && d.ok); }
  } catch (e) {}
  try {
    var t = tmdbRequest("/configuration");
    tOk = !!(t && t.images);
  } catch (e) {}
  return { platform: PLATFORM, version: 87, workerOnline: wOk, tmdbOk: tOk, catalogo: "TMDB + capturas Xuper" };
};
