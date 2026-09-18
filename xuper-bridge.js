
**`worker.js`** (Cloudflare Worker):
```js
/**
 * XuperTv Bridge Worker - v1.0
 * ==============================
 * Cloudflare Worker que actúa como puente entre GrayJay
 * y el backend real de Xuper/pornboxhub.
 *
 * FUNCIÓN:
 *   - Proxy inverso al backend de Xuper (xuper.pornboxhub.com)
 *   - Renovación dinámica de tokens de streaming (trans_id, content_auth2, content_license2)
 *   - Catálogo: getShelveData, getRecommends, getSlbInfo
 *   - Stream: Obtener URLs frescas para media_code
 *   - Health check
 *
 * RUTAS:
 *   GET  /health               → Health check
 *   POST /api/stream           → Obtener URL de streaming fresca
 *   POST /api/xuper/*          → Proxy al backend Xuper
 *
 * DEPLOY:
 *   wrangler publish
 *   o pegar este código en https://dash.cloudflare.com > Workers & Pages
 */

const BACKEND = 'https://xuper.pornboxhub.com';
const API_BASE = BACKEND + '/api/portalCore';

// ============================================================
//  CONFIG GENERADOR DE TOKENS (emula el cliente Android)
// ============================================================

const APP_ID = 'com.android.msandroid';
const APP_VERSION = '49902';

/**
 * Genera un trans_id similar al de la app: base64url(random(12 bytes))
 */
function generateTransId() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Genera un MD5-like token (32 hex chars)
 * En la app real usa MD5(input). Simulamos con HMAC-SHA256 truncado.
 */
async function generateToken(seed) {
  const encoder = new TextEncoder();
  const data = encoder.encode(seed + ':' + APP_ID + ':' + APP_VERSION);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const hex = Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return hex.substring(0, 32);
}

/**
 * Genera un device_id pseudoaleatorio de 32 hex chars
 */
function generateDeviceId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Construye los parámetros de autenticación para URLs de streaming.
 * Emula el formato que usa la app Android.
 */
async function buildAuthParams(mediaCode, host, user_id) {
  const dev_id = generateDeviceId();
  const trans_id = generateTransId();
  const now = Math.floor(Date.now() / 1000);
  const expired = now + 86400; // 24 horas

  // Simular client_ip (se puede pasar desde el request real o usar uno fijo)
  const client_ip = '181.13.73.42';

  // auth_id: es user_id + "_" + appId + "__0"
  const auth_id = (user_id || '0') + '_' + APP_ID + '__0';

  // "token" en content_auth2: MD5(input)
  const tokenSeed = mediaCode + ':' + host + ':' + trans_id + ':' + expired;
  const token = await generateToken(tokenSeed);

  // "token" en content_license2
  const licenseTokenSeed = mediaCode + ':' + APP_ID + ':' + expired;
  const licenseToken = await generateToken(licenseTokenSeed);

  const auth2Path = '/vod/?tag=slb&host=' + encodeURIComponent(host) +
    '&app_id=' + APP_ID +
    '&trans_id=' + trans_id +
    '&app_version=' + APP_VERSION +
    '&client_ip=' + client_ip +
    '&dev_id=' + dev_id +
    '&auth_id=' + encodeURIComponent(auth_id) +
    '&user_id=' + (user_id || '0') +
    '&expired=' + expired +
    '&token=' + token;

  const license2 = 'tag=slb&scheme=slb&app_id=' + APP_ID +
    '&media_code=' + mediaCode +
    '&expired=' + expired +
    '&token=' + licenseToken;

  return {
    content_auth2: auth2Path,
    content_license2: license2,
    trans_id: trans_id,
    dev_id: dev_id,
    expired: expired,
    user_id: user_id || '0'
  };
}

// ============================================================
//  MANEJADOR DE PETICIONES
// ============================================================

async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // ========== HEALTH CHECK ==========
  if (path === '/health' && method === 'GET') {
    return new Response(JSON.stringify({
      ok: true,
      platform: 'XuperBridge',
      version: 1,
      timestamp: Date.now()
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // ========== OBTENER STREAM URL ==========
  if (path === '/api/stream' && method === 'POST') {
    try {
      const body = await request.json();
      const mediaCode = body.mediaCode || '';
      if (!mediaCode) {
        return new Response(JSON.stringify({ ok: false, error: 'mediaCode required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // 1. Obtener SLB info para conseguir un host disponible
      //    (simulamos, en la app real llama a getSlbInfo)
      //    Por ahora usamos hosts de las capturas conocidas
      const hosts = [
        '69.162.99.51:31412',
        '216.245.209.219:11114',
        '216.245.210.139:17209',
        '23.227.144.242:44822'
      ];
      const host = hosts[Math.floor(Math.random() * hosts.length)];

      // 2. Generar auth params frescos
      const user_id = body.userId || '0';
      const auth = await buildAuthParams(mediaCode, host, user_id);

      // 3. Construir URL completa
      const ext = (body.ext || 'ts');
      const streamUrl = 'http://' + host + '/vod/' + mediaCode + '_media.' + ext +
        '?content_auth2=' + encodeURIComponent(auth.content_auth2) +
        '&content_license2=' + encodeURIComponent(auth.content_license2);

      return new Response(JSON.stringify({
        ok: true,
        data: {
          streamUrl: streamUrl,
          host: host,
          trans_id: auth.trans_id,
          expires: auth.expired
        }
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  // ========== PROXY A XUPER BACKEND ==========
  if (path.startsWith('/api/xuper') && method === 'POST') {
    try {
      // Traducir /api/xuper/getShelveData → /api/portalCore/v3/getShelveData
      const xuperPath = path.replace('/api/xuper', '');
      let backendEndpoint = '';

      // Mapeo de rutas
      const routes = {
        '/getShelveData': '/v3/getShelveData',
        '/getRecommends': '/v3/getRecommends',
        '/getSlbInfo': '/v13_1/getSlbInfo',
        '/getPriorityVip': '/v2/getPriorityVip',
        '/getLiveChannels': '/v3/getLiveChannels'
      };

      backendEndpoint = routes[xuperPath] || xuperPath;
      const backendUrl = API_BASE + backendEndpoint;

      // Headers que emula la app
      const headers = {
        'User-Agent': 'okhttp/3.14.9',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept-Encoding': 'gzip',
        'Connection': 'Keep-Alive'
      };

      const backendResp = await fetch(backendUrl, {
        method: 'POST',
        headers: headers,
        body: '{}' // la app envía un JSON vacío o con parámetros mínimos
      });

      if (!backendResp.ok) {
        return new Response(JSON.stringify({
          ok: false,
          error: 'Backend error: ' + backendResp.status,
          data: null
        }), {
          status: backendResp.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const text = await backendResp.text();
      let json;
      try { json = JSON.parse(text); } catch (e) { json = { raw: text }; }

      return new Response(JSON.stringify({
        ok: true,
        data: json
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  // ========== 404 ==========
  return new Response(JSON.stringify({ ok: false, error: 'Not found' }), {
    status: 404,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});
