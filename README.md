# XuperTv - GrayJay Source

Plugin GrayJay + Cloudflare Worker para XuperTv (peliculas y series).

## Estructura

```
XP/
├── README.md                    # Este archivo
├── XuperTv_GrayJay.js           # Plugin GrayJay (ES5)
├── XuperTv_GrayJay.json         # Manifest del plugin
└── xuper-worker/
    ├── worker.js                 # Cloudflare Worker v4.0
    ├── wrangler.toml             # Config de despliegue
    └── README.md                 # Docs del worker
```

## Instalacion en GrayJay

### Opcion 1: URL del manifest
1. Abre GrayJay
2. Ve a Configuracion > Fuentes > Agregar fuente
3. Pega la URL del JSON:
   ```
   https://raw.githubusercontent.com/cheito55/XP/main/XuperTv_GrayJay.json
   ```

### Opcion 2: Archivos locales
1. Descarga `XuperTv_GrayJay.js` y `XuperTv_GrayJay.json` del repo
2. Colocalos en la misma carpeta
3. Importa el JSON desde GrayJay

## Configuracion del Worker

1. Instala [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/)
2. Clona esta carpeta o navega a `xuper-worker/`
3. Ejecuta `wrangler login`
4. Ejecuta `wrangler deploy`
5. Copia la URL del worker (ej: `https://xuper-bridge.TU_SUBDOMAIN.workers.dev`)
6. En GrayAy, pega esa URL en los ajustes del plugin en "Worker URL"

## Configuracion del Plugin

En los ajustes del plugin en GrayJay:

**Opcion A - Email + Password (intenta login automatico)**
- Email: tu email registrado
- Password: tu contrasena

**Opcion B - Tokens manuales (mas confiable)**
- User ID: tu ID de usuario
- User Token: tu token de usuario
- Portal Code: tu codigo de portal (opcional)
- Portal URL: URL base del portal (opcional)

Para obtener los tokens manuales, necesitas capturar el trafico de la app usando PCAP o una VPN que muestre las peticiones HTTP/WS.

## Diagnostico

En GrayJay, los detalles del source muestran el estado de:
- Worker URL y si esta online
- Estado de autenticacion
- IDs de usuario

## Identificadores del App

| Campo | Valor |
|-------|-------|
| Paquete (mod) | `com.android.msandroid` |
| Paquete (original) | `com.android.mgstxNF` |
| App Version | `49902` |
| User-Agent | `Ranger/4.9.4-17294ac0` |

## Limitaciones

- Los portales HTTP viejos (v7/v8) estan deprecados por el servidor
- Los seeds DCS para discovery automatico pueden estar muertos
- La forma mas confiable es usar tokens capturados del celular
- El plugin funciona en modo limitado sin autenticacion (busqueda, home del worker)

## Licencia

Uso personal. No distribuir.
