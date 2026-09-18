# XuperTv Bridge Worker v4.0

Cloudflare Worker que funciona como puente HTTP-WebSocket entre el plugin GrayJay y los servidores de XuperTv.

## Despliegue

```bash
cd xuper-worker
wrangler deploy
```

El worker estara disponible en: `https://xuper-bridge.{TU_SUBDOMAIN}.workers.dev`

## Endpoints

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| GET | `/health` | Estado del worker |
| POST | `/auth` | Login email+pass o tokens manuales |
| POST | `/api/getHome` | Home / canales |
| POST | `/api/search` | Busqueda por nombre |
| POST | `/api/getItemData` | Detalle de item |
| POST | `/api/getSlbInfo` | Info SLB para streaming |
| POST | `/api/startPlayVOD` | Iniciar playback |
| GET | `/api/epg` | EPG |
| GET | `/api/notice` | Avisos |
| POST | `/api/streamHeaders` | Headers para streaming |
| POST | `/ws/proxy` | Proxy raw WebSocket |
| POST | `/ws/handshake` | Handshake al portal WS |
| GET | `/api/discover` | Buscar portales via DCS |

## Credenciales

Las credenciales se pasan via headers HTTP:
- `X-Portal-Base`: URL base del portal
- `X-User-Id`: ID de usuario
- `X-User-Token`: Token de usuario
- `X-Portal-Code`: Codigo de portal

## Notas importantes

- Los portales viejos (v7/v8) pueden estar deprecados
- Los seeds DCS actuales pueden no funcionar
- La forma mas confiable es usar tokens manuales desde la app
