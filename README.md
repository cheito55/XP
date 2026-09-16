# XuperTv - Fuente GrayJay

Fuente para GrayJay que conecta con la app XuperTv/Brasiltv.

## Archivos

| Archivo | Descripcion |
|---------|-------------|
| `XuperTv_GrayJay.js` | Plugin GrayJay v80 - ES5 puro |
| `XuperTv_GrayJay.json` | Manifest del plugin |
| `xuper-worker/worker.js` | Cloudflare Worker v8.0 - API REST |
| `xuper-worker/crypto.js` | DES/3DES/AES + Base64 custom |

## Configuracion

1. Despliega el Worker en Cloudflare
2. En GrayJay, agrega el repositorio: `https://github.com/cheito55/XP`
3. Configura la URL del Worker en los settings del plugin

## API Endpoints

| Endpoint | Metodo | Descripcion |
|----------|--------|-------------|
| `/health` | GET | Estado del Worker |
| `/api/login` | POST | Login con email/password |
| `/api/config` | POST | Actualizar sesion |
| `/api/home` | GET | Lista de canales y VOD |
| `/api/live` | POST | Datos de stream en vivo |
| `/api/stream` | POST | URL de stream VOD |
| `/api/proxy/*` | POST | Proxy a API portalCore |

## Credenciales

- Email: `syeromero.tv@gmail.com`
- Password: `Sarilu2412`

## Notas

- La API de XuperTv usa dominios rotativos
- Los tokens expiran cada ~4 horas
- El Worker intenta multiples dominios automaticamente
