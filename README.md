# XuperTv - GrayJay Source Plugin v59

Plugin para GrayJay que reproduce contenido de XuperTv usando un Cloudflare Worker como proxy.

## Archivos

- `XuperTv_GrayJay.json` - Manifest del plugin (cargar en GrayJay)
- `XuperTv_GrayJay.js` - Plugin GrayJay (ES5 puro)
- `xuper-worker/worker.js` - Cloudflare Worker v6 (proxy + tokens capturados)
- `xuper-worker/wrangler.toml` - Config de Wrangler

## Instalación GrayJay

1. Abre GrayJay → Settings → Sources → Add Source
2. Pega la URL raw del JSON:
   `https://raw.githubusercontent.com/cheito55/XP/main/XuperTv_GrayJay.json`
3. El plugin se carga automáticamente

## Instalación Worker

```bash
cd xuper-worker
npm install -g wrangler
wrangler login
wrangler deploy
```

## Tokens

Los tokens de streaming expiran después de ~4 horas. Para actualizar:

1. Captura tráfico con HydraProxy + PCAPdroid mientras la app reproduce contenido
2. Exporta como HAR
3. Envía los tokens al Worker:
   ```bash
   curl -X POST https://TU-WORKER.workers.dev/api/tokens \
     -H "Content-Type: application/json" \
     -d '{"slbAuth": "TOKEN_SLB", "rangerId": "TU_RANGER_ID"}'
   ```

## Estado actual

- ✅ Home (contenido pre-capturado)
- ✅ Details (info de contenido)
- ✅ Streaming (con tokens válidos)
- ✅ CDN proxy (bypass CORS)
- ✅ Subtítulos proxy
- ❌ Búsqueda (requiere WS encriptado)
- ❌ Descubrimiento automático (requiere WS encriptado)

## Limitaciones

El protocolo WebSocket del portal XuperTv está encriptado con un algoritmo propietario. Sin descifrarlo, no se puede obtener contenido nuevo automáticamente. Los tokens de streaming son temporales (~4h) y deben actualizarse con nuevas capturas.
