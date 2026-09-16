/*
 * GrayJay - XuperTv Source v81
 * Worker proxy + contenido capturado como fallback
 * ES5 puro - REPOSITORIO: https://github.com/cheito55/XP
 */

var PLATFORM = "XuperTv";
var PLUGIN_ID = "8d1f6f41-7d4a-4e8c-a42f-5c9b7a31e602";
var DEFAULT_WORKER = "https://xuper-bridge.cheito55.workers.dev";

var _conf = {};
var _settings = {};
var _workerUrl = DEFAULT_WORKER;

// === Datos capturados del HAR (fallback) ===
var CAPTURED_CHANNELS = [
    { id: "cyx_50fdcc0817d61_720p", name: "Canal en Vivo 1", logo: "" },
    { id: "cyx_50fdcc0817d61_720p", name: "Canal MX Vivo", logo: "" },
    { id: "cyx_50fdcc0817d61_720p", name: "Canal LATAM", logo: "" }
];

var CAPTURED_VOD = [
    { id: "4DC7E29C0EF941318307436A9CCDCDE0", title: "Pelicula Capturada 1", logo: "" },
    { id: "7C81D68A2E9A4A3C8B3AEED8CE549912", title: "Pelicula Capturada 2", logo: "" },
    { id: "496D2957D3EC45EFB2F34BDCF3B877C0", title: "Pelicula Capturada 3", logo: "" }
];

// === HTTP Helpers ===
function safeGet(url) {
    try {
        var resp = http.GET(url, {});
        if (resp && resp.isOk && resp.body) {
            try { return JSON.parse(resp.body); } catch (e) { return null; }
        }
    } catch (e) {}
    return null;
}

function safePost(url, body) {
    try {
        var resp = http.POST(url, JSON.stringify(body), { "Content-Type": "application/json" });
        if (resp && resp.isOk && resp.body) {
            try { return JSON.parse(resp.body); } catch (e) { return null; }
        }
    } catch (e) {}
    return null;
}

function workerGet(path) {
    return safeGet(_workerUrl + path);
}

function workerPost(path, body) {
    return safePost(_workerUrl + path, body);
}

// === Pager ===
function XuperPager(videos, hasMore, token) {
    this.videos = videos || [];
    this.hasMore = hasMore || false;
    this.token = token || {};
}

XuperPager.prototype.nextPage = function() {
    return new XuperPager([], false, {});
};

XuperPager.prototype.firstPage = function() {
    return this.videos;
};

// === Build video from captured data ===
function buildCapturedVideo(item, type) {
    var isLive = (type === "live");
    var prefix = isLive ? "LIVE: " : "";
    var url = "xuper://" + type + "?id=" + encodeURIComponent(item.id);

    var thumbs = [];
    if (item.logo) thumbs.push(new Thumbnail(item.logo, 480));

    return new PlatformVideo({
        id: new PlatformID(PLATFORM, item.id, PLUGIN_ID),
        name: prefix + (item.title || item.name || item.id),
        thumbnails: new Thumbnails(thumbs),
        author: new PlatformAuthorLink(
            new PlatformID(PLATFORM, "XuperTv", PLUGIN_ID),
            "XuperTv",
            ""
        ),
        uploadDate: 0,
        duration: 0,
        viewCount: 0,
        url: url,
        isLive: isLive
    });
}

// === Build video from worker response ===
function buildWorkerVideo(item) {
    var id = item.contentId || item.content_id || item.id || item.mediaCode || item.media_code || item.channelCode || "";
    var title = item.title || item.name || item.contentName || item.channelName || item.vodName || id;
    var thumb = item.logoUrl || item.picUrl || item.pic_url || item.posterUrl || item.cover || item.image || "";
    var isLive = item.isLive || item.is_live || item.type === "live";
    var type = isLive ? "live" : "vod";
    var url = "xuper://" + type + "?id=" + encodeURIComponent(id);

    var thumbs = [];
    if (thumb) thumbs.push(new Thumbnail(thumb, 480));

    return new PlatformVideo({
        id: new PlatformID(PLATFORM, id, PLUGIN_ID),
        name: (isLive ? "LIVE: " : "") + title,
        thumbnails: new Thumbnails(thumbs),
        author: new PlatformAuthorLink(
            new PlatformID(PLATFORM, "XuperTv", PLUGIN_ID),
            "XuperTv",
            ""
        ),
        uploadDate: 0,
        duration: 0,
        viewCount: 0,
        url: url,
        isLive: isLive
    });
}

// === Source API ===
source.isContentDetailsUrl = function(url) {
    return /^xuper:\/\//i.test(String(url || ""));
};

source.isVideoDetailsUrl = function(url) {
    return /^xuper:\/\//i.test(String(url || ""));
};

source.isChannelUrl = function() {
    return false;
};

source.getSearchCapabilities = function() {
    return {
        types: [Type.Feed.Mixed],
        sorts: [],
        filters: []
    };
};

source.search = function(query, type, order, filters, continuationToken) {
    return new XuperPager([], false, { query: query });
};

source.searchSuggestions = function(query) {
    return ok(query) ? [query] : [];
};

source.getHome = function(continuationToken) {
    // Try worker first
    var r = workerGet("/api/home");
    if (r && r.ok && r.data && Array.isArray(r.data) && r.data.length > 0) {
        var videos = [];
        for (var i = 0; i < r.data.length; i++) {
            videos.push(buildWorkerVideo(r.data[i]));
        }
        return new XuperPager(videos, false, { type: "home" });
    }

    // Fallback to captured data
    var videos = [];
    var i;
    for (i = 0; i < CAPTURED_CHANNELS.length; i++) {
        videos.push(buildCapturedVideo(CAPTURED_CHANNELS[i], "live"));
    }
    for (i = 0; i < CAPTURED_VOD.length; i++) {
        videos.push(buildCapturedVideo(CAPTURED_VOD[i], "vod"));
    }
    return new XuperPager(videos, false, { type: "home" });
};

source.getContentDetails = function(url) {
    var id = "";
    var typ = "vod";
    var m = String(url || "").match(/xuper:\/\/(\w+)\?id=([^&]+)/);
    if (m) {
        typ = m[1];
        id = decodeURIComponent(m[2]);
    }
    if (!id) {
        var m2 = String(url || "").match(/id=([^&]+)/);
        if (m2) id = decodeURIComponent(m2[1]);
    }
    if (!id) id = String(url || "").replace(/^xuper:\/\//i, "").replace(/^(live|vod)\?id=/i, "");
    if (!id) id = String(url || "");

    var thumbs = [];
    var video = new PlatformVideo({
        id: new PlatformID(PLATFORM, id, PLUGIN_ID),
        name: id,
        thumbnails: new Thumbnails(thumbs),
        author: new PlatformAuthorLink(
            new PlatformID(PLATFORM, "XuperTv", PLUGIN_ID),
            "XuperTv",
            ""
        ),
        uploadDate: 0,
        duration: 0,
        viewCount: 0,
        url: url,
        isLive: (typ === "live")
    });

    var videoSources = [];

    if (typ === "live") {
        var lr = workerPost("/api/live", { channelCode: id });
        if (lr && lr.ok && lr.data && lr.data.streamUrl) {
            videoSources.push(new VideoUrlSource({
                url: lr.data.streamUrl,
                width: 1920,
                height: 1080,
                container: "application/x-mpegURL",
                codec: "H.264"
            }));
        } else {
            videoSources.push(new VideoUrlSource({
                url: "http://23.227.144.242:44822/live/" + id + ".m3u8",
                width: 1920,
                height: 1080,
                container: "application/x-mpegURL",
                codec: "H.264"
            }));
        }
    } else {
        var sr = workerPost("/api/stream", { mediaCode: id });
        if (sr && sr.ok && sr.data) {
            var sUrl = sr.data.streamUrl || sr.data.url || "";
            if (sUrl) {
                videoSources.push(new VideoUrlSource({
                    url: sUrl,
                    width: 1920,
                    height: 1080,
                    container: "video/mp4",
                    codec: "H.264"
                }));
            }
        }
    }

    return new PlatformVideoDetails({
        id: new PlatformID(PLATFORM, id, PLUGIN_ID),
        name: id,
        thumbnails: new Thumbnails(thumbs),
        author: new PlatformAuthorLink(
            new PlatformID(PLATFORM, "XuperTv", PLUGIN_ID),
            "XuperTv",
            ""
        ),
        uploadDate: 0,
        duration: 0,
        viewCount: 0,
        url: url,
        isLive: (typ === "live"),
        description: id + "\n\nXuperTv - Fuente GrayJay",
        video: new VideoSourceDescriptor(videoSources),
        live: null,
        rating: new RatingLikes(0),
        subtitles: []
    });
};

source.getChannelContents = function(url, type, order, filters, continuationToken) {
    return new XuperPager([], false, {});
};

source.searchChannels = function(query, continuationToken) {
    return new XuperPager([], false, {});
};

source.getChannel = function(url) {
    return new PlatformChannel({
        id: new PlatformID(PLATFORM, "XuperTv", PLUGIN_ID),
        name: "XuperTv",
        thumbnails: new Thumbnails([]),
        url: "",
        subscriberCount: 0
    });
};

source.getSubComments = function() { return []; };

source.getDiagnostics = function() {
    var wOk = false;
    var wData = null;
    try {
        var h = workerGet("/health");
        wOk = h && h.ok;
        wData = h;
    } catch (e) {}
    return {
        platform: PLATFORM,
        version: 81,
        worker: { url: _workerUrl, online: wOk, data: wData }
    };
};

source.enable = function(conf, settings, savedState) {
    _conf = conf || {};
    _settings = settings || {};
    if (_settings && _settings.worker_url) {
        _workerUrl = _settings.worker_url;
    }
    // Auto-login on enable
    try {
        workerPost("/api/login", {
            email: "syeromero.tv@gmail.com",
            password: "Sarilu2412"
        });
    } catch (e) {}
};

source.setSettings = function(s) {
    _settings = s || {};
    if (_settings.worker_url) _workerUrl = _settings.worker_url;
};

source.getSettings = function() {
    return [
        { key: "worker_url", label: "Worker URL", type: "text", defaultValue: DEFAULT_WORKER },
        { key: "debug", label: "Debug", type: "boolean", defaultValue: false }
    ];
};
