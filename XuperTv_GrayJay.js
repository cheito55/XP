/*
 * GrayJay - XuperTv Source v82
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
    { id: "cyx_50fdcc0817d61_720p", name: "Canal en Vivo 1", logo: "" }
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

// === Pager (ES5 prototype, no class) ===
function XuperPager(results, hasMore, context) {
    VideoPager.call(this, results, hasMore, context);
}
XuperPager.prototype = Object.create(VideoPager.prototype);
XuperPager.prototype.constructor = XuperPager;
XuperPager.prototype.nextPage = function() {
    return new XuperPager([], false, { type: "home" });
};

// === Build video from captured data ===
function buildVideo(item, isLive) {
    var id = item.id || item.mediaCode || item.channelCode || "";
    var title = item.title || item.name || item.vodName || id;
    var thumb = item.logo || item.pic || "";
    var url = "xuper://" + (isLive ? "live" : "vod") + "?id=" + encodeURIComponent(id);

    var thumbs = [];
    if (thumb) thumbs.push(new Thumbnail(thumb, 480));

    return new PlatformVideo({
        id: new PlatformID(PLATFORM, id, _conf.id),
        name: (isLive ? "LIVE: " : "") + title,
        thumbnails: new Thumbnails(thumbs),
        author: new PlatformAuthorLink(
            new PlatformID(PLATFORM, "XuperTv", _conf.id),
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

// === Source API Implementation ===
source.enable = function(conf, settings) {
    _conf = conf || {};
    _settings = settings || {};
    if (_settings && _settings.worker_url) {
        _workerUrl = String(_settings.worker_url).replace(/\/+$/, "");
    }
    // Auto-login
    try {
        workerPost("/api/login", {
            email: "syeromero.tv@gmail.com",
            password: "Sarilu2412"
        });
    } catch (e) {}
};

source.setSettings = function(settings) {
    _settings = settings || {};
    if (_settings && _settings.worker_url) {
        _workerUrl = String(_settings.worker_url).replace(/\/+$/, "");
    }
};

source.getSettings = function() {
    return [
        { key: "worker_url", label: "Worker URL", type: "text", defaultValue: DEFAULT_WORKER },
        { key: "debug", label: "Debug", type: "boolean", defaultValue: false }
    ];
};

source.getSearchCapabilities = function() {
    return {
        types: [Type.Feed.Mixed],
        sorts: [],
        filters: []
    };
};

source.isChannelUrl = function() {
    return false;
};

source.isContentDetailsUrl = function(url) {
    return /^xuper:\/\//i.test(String(url || ""));
};

source.isVideoDetailsUrl = function(url) {
    return /^xuper:\/\//i.test(String(url || ""));
};

source.search = function(query, type, order, filters, continuationToken) {
    return new XuperPager([], false, { type: "search", query: query });
};

source.searchSuggestions = function(query) {
    return query ? [query] : [];
};

source.getHome = function(continuationToken) {
    var videos = [];

    // Intentar Worker primero
    try {
        var r = workerGet("/api/home");
        if (r && r.ok && r.data && r.data.length > 0) {
            for (var i = 0; i < r.data.length; i++) {
                var item = r.data[i];
                var id = item.contentId || item.mediaCode || item.id || "";
                if (!id) continue;
                var isLive = item.isLive || item.type === "live";
                var title = item.title || item.name || id;
                var thumb = item.logoUrl || item.picUrl || "";
                var url = "xuper://" + (isLive ? "live" : "vod") + "?id=" + encodeURIComponent(id);

                var thumbs = [];
                if (thumb) thumbs.push(new Thumbnail(thumb, 480));

                videos.push(new PlatformVideo({
                    id: new PlatformID(PLATFORM, id, _conf.id),
                    name: (isLive ? "LIVE: " : "") + title,
                    thumbnails: new Thumbnails(thumbs),
                    author: new PlatformAuthorLink(
                        new PlatformID(PLATFORM, "XuperTv", _conf.id),
                        "XuperTv",
                        ""
                    ),
                    uploadDate: 0,
                    duration: 0,
                    viewCount: 0,
                    url: url,
                    isLive: isLive
                }));
            }
        }
    } catch (e) {}

    // Fallback a datos capturados
    if (videos.length === 0) {
        var i;
        for (i = 0; i < CAPTURED_CHANNELS.length; i++) {
            videos.push(buildVideo(CAPTURED_CHANNELS[i], true));
        }
        for (i = 0; i < CAPTURED_VOD.length; i++) {
            videos.push(buildVideo(CAPTURED_VOD[i], false));
        }
    }

    return new XuperPager(videos, false, { type: "home" });
};

source.getContentDetails = function(url) {
    var id = "";
    var isLive = false;

    var m = String(url || "").match(/xuper:\/\/(live|vod)\?id=([^&]+)/);
    if (m) {
        isLive = (m[1] === "live");
        id = decodeURIComponent(m[2]);
    }
    if (!id) {
        var m2 = String(url || "").match(/id=([^&]+)/);
        if (m2) id = decodeURIComponent(m2[1]);
    }
    if (!id) id = String(url || "");

    var videoSources = [];

    if (isLive) {
        // Live stream
        var lr = workerPost("/api/live", { channelCode: id });
        var liveUrl = "";
        if (lr && lr.ok && lr.data && lr.data.streamUrl) {
            liveUrl = lr.data.streamUrl;
        } else {
            liveUrl = "http://23.227.144.242:44822/live/" + id + ".m3u8";
        }
        videoSources.push(new VideoUrlSource({
            url: liveUrl,
            width: 1920,
            height: 1080,
            container: "application/x-mpegURL",
            codec: "H.264"
        }));
    } else {
        // VOD stream
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
        id: new PlatformID(PLATFORM, id, _conf.id),
        name: id,
        thumbnails: new Thumbnails([]),
        author: new PlatformAuthorLink(
            new PlatformID(PLATFORM, "XuperTv", _conf.id),
            "XuperTv",
            ""
        ),
        uploadDate: 0,
        duration: 0,
        viewCount: 0,
        url: url,
        isLive: isLive,
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
        id: new PlatformID(PLATFORM, "XuperTv", _conf.id),
        name: "XuperTv",
        thumbnails: new Thumbnails([]),
        url: "",
        subscriberCount: 0
    });
};

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
        version: 82,
        worker: { url: _workerUrl, online: wOk, data: wData }
    };
};
