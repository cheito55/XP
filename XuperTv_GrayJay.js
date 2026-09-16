/*
 * GrayJay Plugin - XuperTv
 * v83 - Reescrito siguiendo el patron EXACTO de Seeke (plugin que si funciona)
 *        ES5 puro, sin dependencia del Worker para el Home.
 *        Home muestra datos capturados reales + intento Worker opcional.
 * REPOSITORIO: https://github.com/cheito55/XP
 */
var PLATFORM = "XuperTv";
var DEFAULT_WORKER = "https://xuper-bridge.cheito55.workers.dev";

var _conf = {};
var _workerUrl = DEFAULT_WORKER;

// === Datos capturados del PCAP/HAR (fallback FIJO - siempre visibles) ===
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

var CAPTURED = {
    userId: "556784760",
    devId: "761cd6edc9681aa5d27dd1e1fa38ae08"
};

// === HTTP Helper (mismo que Seeke: http.GET con {isOk, body}) ===
function safeGet(url) {
    try {
        return http.GET(url, {});
    } catch (e) {
        return null;
    }
}

function safeParseJson(body) {
    try {
        return JSON.parse(body);
    } catch (e) {
        return null;
    }
}

function getWorkerUrl() {
    if (_conf && _conf.settings && _conf.settings.worker_url) {
        return String(_conf.settings.worker_url).replace(/\/+$/, "");
    }
    return _workerUrl;
}

// === Build video ===
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

function buildDetails(url) {
    var id = "";
    var isLive = false;

    var m = String(url || "").match(/xuper:\/\/(live|vod)\?id=([^&]+)/);
    if (m) {
        isLive = (m[1] === "live");
        id = decodeURIComponent(m[2]);
    }
    if (!id) id = String(url || "");

    var st = STREAMS[id] || {};
    var streamUrl = isLive ? st.live : st.vod;
    var title = id;

    // Buscar titulo real
    var i;
    for (i = 0; i < CAPTURED_ITEMS.length; i++) {
        if (CAPTURED_ITEMS[i].id === id) {
            title = CAPTURED_ITEMS[i].title;
            break;
        }
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
            "XuperTv",
            ""
        ),
        uploadDate: 0,
        duration: 0,
        viewCount: 0,
        url: url,
        isLive: isLive,
        description: title + "\n\nXuperTv - Fuente GrayJay\nuserId: " + CAPTURED.userId,
        video: new VideoSourceDescriptor(videoSources),
        live: null,
        rating: new RatingLikes(0),
        subtitles: []
    });
}

// === Pager (ES5 prototype, patron Seeke) ===
function XuperPager(results, hasMore, context) {
    VideoPager.call(this, results, hasMore, context);
}
XuperPager.prototype = Object.create(VideoPager.prototype);
XuperPager.prototype.constructor = XuperPager;
XuperPager.prototype.nextPage = function() {
    try {
        if (this.context && this.context.type === "search" && this.context.query) {
            return doSearch(this.context.query);
        }
        return source.getHome(this.context);
    } catch (e) {
        return new XuperPager([], false, {});
    }
};

function doSearch(query) {
    var q = String(query || "").toLowerCase();
    var videos = [];
    var i;
    if (q) {
        for (i = 0; i < CAPTURED_ITEMS.length; i++) {
            var title = CAPTURED_ITEMS[i].title || "";
            if (title.toLowerCase().indexOf(q) !== -1) {
                videos.push(buildVideo(CAPTURED_ITEMS[i]));
            }
        }
    }
    return new XuperPager(videos, false, { type: "search", query: query });
}

// === Intento de Home dinamico via Worker (si falla -> datos capturados) ===
function homeFromWorker() {
    try {
        var resp = safeGet(getWorkerUrl() + "/api/home");
        if (!resp || !resp.isOk || !resp.body) return null;
        var data = safeParseJson(resp.body);
        if (!data || !data.ok || !data.data) return null;

        var videos = [];
        var items = data.data;
        var i;
        for (i = 0; i < items.length; i++) {
            var item = items[i];
            var id = item.contentId || item.mediaCode || item.id || "";
            if (!id) continue;
            var isLive = !!item.isLive || item.type === "live";
            var title = item.title || item.name || id;
            var thumb = item.logoUrl || item.picUrl || "";

            var thumbs = [];
            if (thumb) thumbs.push(new Thumbnail(thumb, 480));

            var url = "xuper://" + (isLive ? "live" : "vod") + "?id=" + encodeURIComponent(id);
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
        if (videos.length > 0) return videos;
    } catch (e) {}
    return null;
}

// === Source API Implementation ===
source.enable = function(conf) {
    _conf = conf;
};

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
    return {
        types: [Type.Feed.Mixed],
        sorts: [],
        filters: []
    };
};

source.isChannelUrl = function(url) {
    return false;
};

source.isContentDetailsUrl = function(url) {
    return /^xuper:\/\//i.test(String(url || ""));
};

source.isVideoDetailsUrl = function(url) {
    return /^xuper:\/\//i.test(String(url || ""));
};

source.search = function(query, type, order, filters, continuationToken) {
    return doSearch(query);
};

source.searchSuggestions = function(query) {
    return query ? [query] : [];
};

source.getHome = function(continuationToken) {
    // Primero intentar contenido dinamico (Worker)
    var dynamic = homeFromWorker();

    // SIEMPRE mostrar datos capturados si Worker no devuelve nada
    var items = dynamic ? dynamic : [];
    if (items.length === 0) {
        var i;
        for (i = 0; i < CAPTURED_ITEMS.length; i++) {
            items.push(buildVideo(CAPTURED_ITEMS[i]));
        }
    }

    return new XuperPager(items, false, { type: "home" });
};

source.getContentDetails = function(url) {
    return buildDetails(url);
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
        var h = safeGet(getWorkerUrl() + "/health");
        if (h && h.isOk) {
            wData = safeParseJson(h.body);
            wOk = !!(wData && wData.ok);
        }
    } catch (e) {}
    return {
        platform: PLATFORM,
        version: 83,
        worker: { url: getWorkerUrl(), online: wOk, data: wData },
        captured: CAPTURED_ITEMS.length
    };
};
