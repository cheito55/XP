# XuperTv - GrayJay Source (v57)

Plugin GrayJay + Cloudflare Worker para XuperTv (peliculas y series).

## Arquitectura

```
GrayJay (HTTP) → Cloudflare Worker (cloudflare:sockets) → Portal XuperTv (WebSocket)
```

El Worker actúa como puente: GrayJay solo puede hacer HTTP, pero el portal usa WebSocket.
El Worker abre una conexión real WS al portal, envía los comandos, y devuelve la respuesta como JSON.

## Archivos

```
XP/
├── README.md
├── XuperTv_GrayJay.js          # Plugin GrayJay v57 (ES5)
├── XuperTv_GrayJay.json         # Manifest
└── xuper-worker/
    ├── worker.js                 # Cloudflare Worker v5.0
    ├── wrangler.toml
    └── README.md
```

## Instalación GrayJay

1. Abre GrayJay > Configuración > Fuentes > Agregar fuente
2. Pega: `https://raw.githubusercontent.com/cheito55/XP/main/XuperTv_GrayJay.json`

## Despliegue Worker

```bash
cd xuper-worker
npm install -g wrangler
wrangler login
wrangler deploy
```

## Configuración del Plugin

En ajustes del plugin:

**Requerido:**
- **User ID**: tu ID de usuario de XuperTv
- **User Token**: tu token de autenticación

**Opcional:**
- **Worker URL**: URL del Worker (por defecto `xuper-bridge.cheito55.workers.dev`)
- **Portal Code**: código de portal
- **Device ID**: ID del dispositivo (se auto-genera si no se pone)

**Para obtener los tokens:**
Los tokens se obtienen de la app original o mod. Puedes capturarlos con PCAPdroid o un proxy de red.

## Identificadores del App

| Campo | Valor |
|-------|-------|
| Paquete (mod) | `com.android.msandroid` |
| Paquete (original) | `com.android.mgstxNF` |
| App Version | `49902` |
| User-Agent | `Ranger/4.9.4-17294ac0` |
| Portal WS | `s23sdf56.45lc9mx79ab.com` |
| Search WS | `sgyc.bfj1k2g4v.com` |
| SLB | `yuwc.swzablvpm.com` |

## Limitaciones

- Los portales HTTP viejos (v7/v8) están deprecados del lado del servidor
- El plugin necesita userId + userToken (no hay login automático aún)
- El WS al portal puede ser bloqueado por Cloudflare desde el Worker — en ese caso se intenta fallback HTTP
