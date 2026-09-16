# XuperTv - GrayJay Source Plugin v70

Plugin para GrayJay que reproduce contenido de XuperTv usando un Cloudflare Worker como proxy.

## Archivos

- `XuperTv_GrayJay.json` - Manifest del plugin (cargar en GrayJay)
- `XuperTv_GrayJay.js` - Plugin GrayJay (ES5 puro)
- `xuper-worker/worker.js` - Cloudflare Worker v70 (proxy + crypto)
- `xuper-worker/crypto.js` - DES/3DES implementación pura JS
- `xuper-worker/wrangler.toml` - Config de Wrangler

## Instalación GrayJay

1. Abre GrayJay → Settings → Sources → Add Source
2. Pega la URL raw del JSON:
   `https://raw.githubusercontent.com/cheito55/XP/main/XuperTv_GrayJay.json`
3. El plugin se carga automáticamente

## Criptografía descifrada (ingeniería inversa APK)

Claves extraídas del smali del APK:

| Algoritmo | Clave | Uso |
|-----------|-------|-----|
| 3DES/ECB/PKCS5 | `1b494e53756c664c2f44465245733572` (hex) | SharedPreferences encrypt/decrypt |
| DES/ECB | `okwVTyAW` (ASCII) | HTTP interceptor host |
| AES/CBC | `b972E8a5A4e0e8Ff` + IV `2c6b361ee550e80c` | brasiltv utils |

Clases fuente en el APK:
- `a8/b.smali` - 3DES (encrypt/decrypt)
- `b3/d.smali` - DES con `DES/ECB`
- `b3/a.smali` - AES con clave `b972E8a5A4e0e8Ff`
- `za/g.smali` - SharedPreferences con clave `1b49...`
- `d7/a.smali` - OkHttp interceptor (ReqSource: own)

## Test de criptografía

```bash
curl -X POST https://xuper-bridge.cheito55.workers.dev/api/crypto-test \
  -H "Content-Type: application/json" \
  -d '{"text":"hola_mundo"}'
```

Respuesta: `"match": true` cuando encrypt/decrypt es consistente.

## Tokens

Los tokens de streaming expiran después de ~4 horas. Para actualizar:

1. Captura tráfico con HydraProxy + PCAPdroid mientras la app reproduce contenido
2. Exporta como HAR
3. Envía los tokens al Worker:
   ```bash
   curl -X POST https://xuper-bridge.cheito55.workers.dev/api/tokens \
     -H "Content-Type: application/json" \
     -d '{"slbAuth": "TOKEN_SLB", "rangerId": "TU_RANGER_ID"}'
   ```

## Estado actual

- ✅ Criptografía del APK descifrada (3DES, DES, AES)
- ✅ Worker v70 con crypto funcional
- ✅ Home (contenido pre-capturado)
- ✅ Streaming (con tokens válidos)
- ✅ CDN proxy (bypass CORS)
- ⏳ WS binario encriptado - requiere más análisis del protocolo de frames
- ❌ Búsqueda (requiere WS)

## Limitaciones

El protocolo WebSocket binario del portal XuperTv usa un framing propio con encriptación.
Las claves 3DES/DES/AES están extraídas, pero el formato del frame WS (header 4 bytes + body encriptado)
requiere más ingeniería inversa del código nativo (`libranger-jni.so`, `libcast-jni.so`).
