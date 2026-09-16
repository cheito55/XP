/*
 * GrayJay Plugin - XuperTv v86
 * TMDB thumbnails + Busqueda + API cifrada
 * ES5 compatible (sin const/let/arrow/class/from)
 * REPOSITORIO: https://github.com/cheito55/XP
 *
 * CONFIGURACION:
 *   En ajustes del plugin pone tu API key de TMDB (gratis):
 *   https://www.themoviedb.org/settings/api
 *   Sin la key, no se muestran portadas pero el contenido sigue funcionando.
 */

var PLATFORM = "XuperTv";
var DEFAULT_WORKER = "https://xuper-bridge.cheito55.workers.dev";
var TMDB_IMG = "https://image.tmdb.org/t/p";

var _conf = {};
var _workerUrl = DEFAULT_WORKER;
var _tmdbKey = "";

var CAPTURED_ITEMS = [
  { id: "cyx_50fdcc0817d61_720p", title: "Canal En Vivo 720p", isLive: true },
  { id: "BCF940BE93754676AB0877E91258675D", title: "Pelicula VOD 1 (BCF9)", isLive: false },
  { id: "45063077C8374DCF8755FF214D8DD0B4", title: "Pelicula VOD 2 (4506)", isLive: false },
  { id: "4DC7E29C0EF941318307436A9CCDCDE0", title: "Pelicula Capturada 1", isLive: false }
];

var STREAMS = {
  "cyx_50fdcc0817d61_720p": { live: "http://23.227.144.242:44822/live/cyx_50fdcc0817d61_720p.m3u8", isLive: true },
  "BCF940BE93754676AB0877E91258675D": { vod: "http://69.162.99.51:31412/vod/BCF940BE93754676AB0877E91258675D_media.ts?content_auth2=/vod/%3Ftag%3Dslb%26host%3D69.162.99.51:31412%26app_id%3Dcom.android.msandroid%26trans_id%3DlWAlK1oHN0c_i6cRrfYFhEAY%26app_version%3D49902%26client_ip%3D181.13.73.42%26dev_id%3D761cd6edc9681aa5d27dd1e1fa38ae08%26auth_id%3D556784760_com.android.msandroid__0%26user_id%3D556784760%26expired%3D1789593919%26token%3D8f60f9f0054946ba09309ffd3136a4ba&content_license2=tag%3Dslb%26scheme%3Dslb%26app_id%3Dcom.android.msandroid%26media_code%3DBCF940BE93754676AB0877E91258675D%26expired%3D1789593919%26token%3D180867fe7fe9c3865279913b2bad828a", isLive: false },
  "45063077C8374DCF8755FF214D8DD0B4": { vod: "http://216.245.209.219:11114/vod/45063077C8374DCF8755FF214D8DD0B4_media.mp4?content_auth2=/vod/%3Ftag%3Dslb%26host%3D216.245.209.219:11114%26app_id%3Dcom.android.msandroid%26trans_id%3DlWAlK1oHN0c_2jEa2TPfpbzN%26app_version%3D49902%26client_ip%3D181.13.73.42%26dev_id%3D761cd6edc9681aa5d27dd1e1fa38ae08%26auth_id%3D556784760_com.android.msandroid__0%26user_id%3D556784760%26expired%3D1789593919%26token%3D22f69b748bbf933a258f7225b34e1591&content_license2=tag%3Dslb%26scheme%3Dslb%26app_id%3Dcom.android.msandroid%26media_code%3D45063077C8374DCF8755FF214D8DD0B4%26expired%3D1789593919%26token%3D0a5130f0d397aa334f11a1ee51415c7c", isLive: false },
  "4DC7E29C0EF941318307436A9CCDCDE0": { vod: "http://208.115.207.227:2701/vod/4DC7E29C0EF941318307436A9CCDCDE0_media.ts", isLive: false },
  "7C81D68A2E9A4A3C8B3AEED8CE549912": { vod: "http://208.115.207.227:2701/vod/7C81D68A2E9A4A3C8B3AEED8CE549912_media.ts", isLive: false },
  "496D2957D3EC45EFB2F34BDCF3B877C0": { vod: "http://208.115.207.227:2701/vod/496D2957D3EC45EFB2F34BDCF3B877C0_media.ts", isLive: false }
};

var CAPTURED = { userId: "556784760", devId: "761cd6edc9681aa5d27dd1e1fa38ae08" };

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
function getTmdbKey() {
  if (_tmdbKey) return _tmdbKey;
  if (_conf && _conf.settings && _conf.settings.tmdb_api_key) {
    return String(_conf.settings.tmdb_api_key).trim();
  }
  return "";
}
function tmdbImg(path, size) {
  if (!path) return "";
  return TMDB_IMG + "/" + (size || "w500") + path;
}

function tmdbSearch(query) {
  var key = getTmdbKey();
  if (!query || !key) return { items: [] };
  try {
    var url = "https://api.themoviedb.org/3/search/multi?api_key=" + key +
      "&query=" + encodeURIComponent(query) + "&language=es-MX&page=1&include_adult=false";
    var resp = safeGet(url);
    if (!resp || !resp.isOk || !resp.body) return { items: [] };
    var data = safeParseJson(resp.body);
    if (!data || !data.results) return { items: [] };
    var items = [];
    for (var i = 0; i < data.results.length; i++) {
      var r = data.results[i];
      if (r.media_type === "movie" || r.media_type === "tv") {
        var title = r.title || r.name || "";
        var year = (r.release_date || r.first_air_date || "").substring(0, 4);
        items.push({
          tmdbId: r.id,
          mediaType: r.media_type,
          title: title,
          year: year,
          posterPath: r.poster_path || "",
          backdropPath: r.backdrop_path || "",
          overview: (r.overview || "").substring(0, 200)
        });
      }
    }
    return { items: items };
  } catch (e) { return { items: [] }; }
}

function buildVideo(item) {
  var id = item.id || item.contentId || item.mediaCode || "";
  var title = item.title || item.name || id;
  var isLive = !!item.isLive;
  var thumbs = [];
  var logoUrl = item.logoUrl || "";
  if (logoUrl && logoUrl.indexOf("http") === 0) {
    thumbs.push(new Thumbnail(logoUrl, 480));
  }
  var posterPath = item.posterPath || "";
  var backdropPath = item.backdropPath || "";
  if (posterPath) thumbs.push(new Thumbnail(tmdbImg(posterPath, "w500"), 500));
  if (backdropPath) thumbs.push(new Thumbnail(tmdbImg(backdropPath, "w780"), 780));
  var url = "xuper://" + (isLive ? "live" : "vod") + "?id=" + encodeURIComponent(id);
  return new PlatformVideo({
    id: new PlatformID(PLATFORM, id, _conf.id),
    name: (isLive ? "LIVE: " : "") + title,
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

function enrichVideosWithTmdb(videos) {
  var key = getTmdbKey();
  if (!key) return videos;
  for (var i = 0; i < videos.length; i++) {
    var v = videos[i];
    var hasThumbs = v.thumbnails && v.thumbnails.sources && v.thumbnails.sources.length > 0;
    if (hasThumbs) continue;
    var title = v.name || "";
    if (!title || title.indexOf("Capturada") !== -1) continue;
    var cleanTitle = title.replace(/^LIVE: /, "").replace(/ \(\d{4}\)$/, "");
    var result = tmdbSearch(cleanTitle);
    if (result.items.length > 0) {
      var best = result.items[0];
      var thumbs = [];
      if (best.posterPath) thumbs.push(new Thumbnail(tmdbImg(best.posterPath, "w500"), 500));
      if (best.backdropPath) thumbs.push(new Thumbnail(tmdbImg(best.backdropPath, "w780"), 780));
      v.thumbnails = new Thumbnails(thumbs);
    }
  }
  return videos;
}

function doSearch(query) {
  var videos = [];
  var q = String(query || "").toLowerCase();

  var tmdbResult = tmdbSearch(query);
  if (tmdbResult.items.length > 0) {
    for (var i = 0; i < tmdbResult.items.length; i++) {
      var item = tmdbResult.items[i];
      var videoUrl = "tmdb://" + item.mediaType + "/" + item.tmdbId;
      var thumbs = [];
      if (item.posterPath) thumbs.push(new Thumbnail(tmdbImg(item.posterPath, "w500"), 500));
      if (item.backdropPath) thumbs.push(new Thumbnail(tmdbImg(item.backdropPath, "w780"), 780));
      videos.push(new PlatformVideo({
        id: new PlatformID(PLATFORM, item.mediaType + "_" + item.tmdbId, _conf.id),
        name: item.title + (item.year ? " (" + item.year + ")" : ""),
        thumbnails: new Thumbnails(thumbs),
        author: new PlatformAuthorLink(
          new PlatformID(PLATFORM, "XuperTv", _conf.id),
          "XuperTv", ""
        ),
        uploadDate: 0,
        duration: 0,
        viewCount: 0,
        url: videoUrl,
        isLive: false
      }));
    }
  }

  for (var j = 0; j < CAPTURED_ITEMS.length; j++) {
    var title = CAPTURED_ITEMS[j].title || "";
    if (!q || title.toLowerCase().indexOf(q) !== -1) {
      videos.push(buildVideo(CAPTURED_ITEMS[j]));
    }
  }

  return makePager(videos);
}

function homeFromWorker() {
  try {
    var resp = safeGet(getWorkerUrl() + "/api/home");
    if (!resp || !resp.isOk || !resp.body) return null;
    var data = safeParseJson(resp.body);
    if (!data || !data.ok || !data.data) return null;
    var videos = [];
    var items = data.data;
    for (var i = 0; i < items.length; i++) {
      var v = buildVideo(items[i]);
      if (v) videos.push(v);
    }
    return videos.length > 0 ? videos : null;
  } catch (e) { return null; }
}

// === Source API ===
source.enable = function(conf) { _conf = conf; };

source.getSettings = function() {
  return [
    { key: "worker_url", label: "Worker URL", type: "text", defaultValue: DEFAULT_WORKER },
    { key: "tmdb_api_key", label: "TMDB API Key (obten gratis: themoviedb.org/settings/api)", type: "text", defaultValue: "" }
  ];
};
source.setSettings = function(settings) {
  if (settings && settings.worker_url) {
    _workerUrl = String(settings.worker_url).replace(/\/+$/, "");
  }
  if (settings && settings.tmdb_api_key) {
    _tmdbKey = String(settings.tmdb_api_key).trim();
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
  return doSearch(query);
};
source.searchSuggestions = function(query) {
  if (!query) return [];
  var tmdbResult = tmdbSearch(query);
  var suggestions = [];
  for (var i = 0; i < Math.min(tmdbResult.items.length, 5); i++) {
    suggestions.push(tmdbResult.items[i].title);
  }
  return suggestions;
};

source.getHome = function(continuationToken) {
  var dynamic = homeFromWorker();
  var videos = dynamic || [];
  if (videos.length === 0) {
    for (var i = 0; i < CAPTURED_ITEMS.length; i++) {
      videos.push(buildVideo(CAPTURED_ITEMS[i]));
    }
  }
  videos = enrichVideosWithTmdb(videos);
  return makePager(videos);
};

source.getContentDetails = function(url) {
  var id = "";
  var isLive = false;
  var m = String(url || "").match(/xuper:\/\/(live|vod)\?id=([^&]+)/);
  if (m) { isLive = (m[1] === "live"); id = decodeURIComponent(m[2]); }
  if (!id) id = String(url || "");

  var tmdbMatch = String(url || "").match(/^tmdb:\/\/(movie|tv)\/(\d+)/);
  if (tmdbMatch) {
    var mediaType = tmdbMatch[1];
    var tmdbId = tmdbMatch[2];
    var key = getTmdbKey();
    if (key) {
      try {
        var apiUrl = "https://api.themoviedb.org/3/" + mediaType + "/" + tmdbId +
          "?api_key=" + key + "&language=es-MX&append_to_response=videos,credits";
        var resp = safeGet(apiUrl);
        if (resp && resp.isOk && resp.body) {
          var data = safeParseJson(resp.body);
          if (data) {
            var title = data.title || data.name || "Sin titulo";
            var overview = data.overview || "";
            var year = (data.release_date || data.first_air_date || "").substring(0, 4);
            var posterPath = data.poster_path || "";
            var backdropPath = data.backdrop_path || "";
            var thumbs = [];
            if (posterPath) thumbs.push(new Thumbnail(tmdbImg(posterPath, "w500"), 500));
            if (backdropPath) thumbs.push(new Thumbnail(tmdbImg(backdropPath, "w780"), 780));
            var authorName = "XuperTv";
            if (data.credits && data.credits.crew) {
              for (var ci = 0; ci < Math.min(data.credits.crew.length, 3); ci++) {
                var c = data.credits.crew[ci];
                if (c.job === "Director" || c.job === "Creator") {
                  authorName = c.name;
                  break;
                }
              }
            }
            return new PlatformVideoDetails({
              id: new PlatformID(PLATFORM, mediaType + "_" + tmdbId, _conf.id),
              name: title + (year ? " (" + year + ")" : ""),
              thumbnails: new Thumbnails(thumbs),
              author: new PlatformAuthorLink(
                new PlatformID(PLATFORM, authorName, _conf.id),
                authorName, ""
              ),
              uploadDate: 0,
              duration: 0,
              viewCount: 0,
              url: url,
              isLive: false,
              description: overview,
              video: new VideoSourceDescriptor([]),
              live: null,
              rating: new RatingLikes(0),
              subtitles: []
            });
          }
        }
      } catch (e) {}
    }
    return new PlatformVideoDetails({
      id: new PlatformID(PLATFORM, "tmdb_" + tmdbId, _conf.id),
      name: "Detalles TMDB",
      thumbnails: new Thumbnails([]),
      author: new PlatformAuthorLink(new PlatformID(PLATFORM, "XuperTv", _conf.id), "XuperTv", ""),
      uploadDate: 0, duration: 0, viewCount: 0, url: url, isLive: false,
      description: "Pon tu API key de TMDB en ajustes del plugin para ver detalles.",
      video: new VideoSourceDescriptor([]),
      live: null, rating: new RatingLikes(0), subtitles: []
    });
  }

  var st = STREAMS[id] || {};
  var streamUrl = isLive ? st.live : st.vod;
  var title = id;
  for (var i = 0; i < CAPTURED_ITEMS.length; i++) {
    if (CAPTURED_ITEMS[i].id === id) { title = CAPTURED_ITEMS[i].title; break; }
  }
  var videoSources = [];
  if (streamUrl) {
    videoSources.push(new VideoUrlSource({
      url: streamUrl,
      width: 1920,
      height: 1080,
      container: isLive ? "application/x-mpegURL" : "video/mp2t",
      codec: "H.264"
    }));
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
    description: title + "\n\nXuperTv - Fuente GrayJay",
    video: new VideoSourceDescriptor(videoSources),
    live: null,
    rating: new RatingLikes(0),
    subtitles: []
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
  var tmdbOk = false;
  try {
    var h = safeGet(getWorkerUrl() + "/health");
    if (h && h.isOk) { var d = safeParseJson(h.body); wOk = !!(d && d.ok); }
  } catch (e) {}
  try {
    var key = getTmdbKey();
    if (key) {
      var t = safeGet("https://api.themoviedb.org/3/configuration?api_key=" + key);
      if (t && t.isOk && t.body) { var td = safeParseJson(t.body); tmdbOk = !!(td && !td.status_code); }
    }
  } catch (e) {}
  return { platform: PLATFORM, version: 86, workerOnline: wOk, tmdbConfigured: tmdbOk, captured: CAPTURED_ITEMS.length };
};
