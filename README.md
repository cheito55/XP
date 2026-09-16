# XuperTv - Fuente GrayJay v85

Fuente para GrayJay que conecta con XuperTv/Brasiltv via Cloudflare Worker.

## Archivos

| Archivo | Descripcion |
|---------|-------------|
| `XuperTv_GrayJay.js` | Plugin GrayJay v85 - TMDB thumbnails + Busqueda |
| `XuperTv_GrayJay.json` | Manifest del plugin |
| `xuper-worker/worker.js` | Cloudflare Worker v9.0 - API cifrada AES-CBC |

## Instalacion en GrayJay

1. Abre GrayJay -> Plugins -> Agregar repositorio
2. Pega: `https://github.com/cheito55/XP`
3. Instala XuperTv
4. En ajustes del plugin, pon la URL del Worker: `https://xuper-bridge.cheito55.workers.dev`

## Worker (Cloudflare)

```bash
cd xuper-worker
wrangler login
wrangler deploy
```

## API Endpoints

| Endpoint | Metodo | Descripcion |
|----------|--------|-------------|
| `/health` | GET | Estado del Worker v9.0 |
| `/api/login` | POST | Login con email/password (cifrado AES-CBC) |
| `/api/home` | GET | Lista canales + VOD (con logos) |
| `/api/live` | POST | Stream en vivo |
| `/api/stream` | POST | Stream VOD |
| `/api/tmdb?q=` | GET | Busqueda TMDB |
| `/api/proxy/*` | POST | Proxy a API portalCore |

## Credenciales

- Email: `syeromero.tv@gmail.com`
- Password: `Sarilu2412`

## Notas

- Thumbnails via TMDB (poster y backdrop)
- Busqueda via TMDB (peliculas y series en espanol)
- Worker cifra requests AES-CBC con Base64 custom
- API dominios rotativos automaticos

## Análisis de la app original
Ver [`ANÁLISIS-APP-ORIGINAL.md`](ANÁLISIS-APP-ORIGINAL.md) — RE completa de `xuper_app.apk` (Xuper 6.5.7): protocolo de frames WS binarios (`0x50/0x65/0x30/0x31`), claves AES HTTP, flujo SLB de tokens y mediaCodes conocidos (`xuper-worker/media-codes.json`).
