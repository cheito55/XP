/*
 * GrayJay Plugin - XuperTv
 * v84 - Fix: VideoPager es clase ES6 nativa, no subclasear.
 *        Sin XuperPager. Retornar new VideoPager() directamente.
 * REPOSITORIO: https://github.com/cheito55/XP
 */
var PLATFORM = "XuperTv";
var DEFAULT_WORKER = "https://xuper-bridge.cheito55.workers.dev";

var _conf = {};
var _workerUrl = DEFAULT_WORKER;

var CAPTURED_ITEMS = [
    { id: "cyx_50fdcc0817d61_720p", title: "Canal En Vivo 720p", isLive: true },
    { id: "4DC7E29C0EF941318307436A9CCDCDE0", title: "Pelicula Capturada 1", isLive: false },
    { id: "7C81D68A2E9A4A3C8B3AEED8CE549912", title: "Pelicula Capturada 2", isLive: false },
    { id: "496D2957D3EC45EFB2F34BDCF3B877C0", title: "Pelicula Capturada 3", isLive: false }
];

var STREAMS = {
    "cyx_50fdcc0817d61_720p": { live: "http://23.227.144.242:44822/live/cyx_50fdcc0817d61_720p.m3u8", isLive: true },
    "4DC7E29C0EF941318307436A9CCDCDE0": { vod: "http://98.98.3.6:19172/vod/4DC7E29C0EF941318307436A9CCDCDE0_media.ts", isLive: false },
    "7C81D68A2E9A4A3C8B3AEED8CE549912": { vod: "http://98.98.3.6:19172/vod/7C81D68A2E9A4A3C8B3AEED8CE549912_media.ts", isLive: false },
    "496D2957D3EC45EFB2F34BDCF3B877C0": { vod: "http://98.98.3.6:19172/vod/496D2957D3EC45EFB2F34BDCF3B877C0_media.ts", isLive: false }
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

function buildVideo(item) {
    var id = item.id;
    var title = item.title || id;
    var isLive = item.isLive;
    var url = "xuper://" + (isLive ? "live" : "vod") + "?id=" + encodeURIComponent(id);
    return new PlatformVideo({
        id: new PlatformID(PLATFORM, id, _conf.id),
        name: (isLive ? "LIVE: " : "") + title,
        thumbnails: new Thumbnails([]),
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

function buildVideoFromWorker(item) {
    var id = item.contentId || item.mediaCode || item.id || "";
    if (!id) return null;
    var isLive = !!item.isLive || item.type === "live";
    var title = item.title || item.name || id;
    var thumb = item.logoUrl || item.picUrl || "";
    var thumbs = [];
    if (thumb) thumbs.push(new Thumbnail(thumb, 480));
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

function doSearch(query) {
    var q = String(query || "").toLowerCase();
    var videos = [];
    var i;
    for (i = 0; i < CAPTURED_ITEMS.length; i++) {
        var title = CAPTURED_ITEMS[i].title || "";
        if (!q || title.toLowerCase().indexOf(q) !== -1) {
            videos.push(buildVideo(CAPTURED_ITEMS[i]));
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
            var v = buildVideoFromWorker(items[i]);
            if (v) videos.push(v);
        }
        return videos.length > 0 ? videos : null;
    } catch (e) { return null; }
}

// === Source API ===
source.enable = function(conf) { _conf = conf; };

source.getSettings = function() {
    return [
        { key: "worker_url", label: "Worker URL (opcional)", type: "text", defaultValue: DEFAULT_WORKER }
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
source.isContentDetailsUrl = function(url) { return /^xuper:\/\//i.test(String(url || "")); };
source.isVideoDetailsUrl = function(url) { return /^xuper:\/\//i.test(String(url || "")); };

source.search = function(query, type, order, filters, continuationToken) {
    return doSearch(query);
};
source.searchSuggestions = function(query) { return query ? [query] : []; };

source.getHome = function(continuationToken) {
    var dynamic = homeFromWorker();
    var items = dynamic || [];
    if (items.length === 0) {
        for (var i = 0; i < CAPTURED_ITEMS.length; i++) {
            items.push(buildVideo(CAPTURED_ITEMS[i]));
        }
    }
    return makePager(items);
};

source.getContentDetails = function(url) {
    var id = "";
    var isLive = false;
    var m = String(url || "").match(/xuper:\/\/(live|vod)\?id=([^&]+)/);
    if (m) { isLive = (m[1] === "live"); id = decodeURIComponent(m[2]); }
    if (!id) id = String(url || "");

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
            container: isLive ? "application/x-mpegURL" : "video/mp4",
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
    try {
        var h = safeGet(getWorkerUrl() + "/health");
        if (h && h.isOk) { var d = safeParseJson(h.body); wOk = !!(d && d.ok); }
    } catch (e) {}
    return { platform: PLATFORM, version: 84, workerOnline: wOk, captured: CAPTURED_ITEMS.length };
};
