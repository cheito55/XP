# Análisis de la app original Xuper (xuper_app.apk)

**Archivo:** `xuper_app.apk` — MD5 `b660dc7ed65970981346bff3d4955f97`
**Identidad:** Xuper 6.5.7 (`versionCode 60507`) — paquete `com.msandroid.mobile`
**App ID en API:** `com.android.msandroid` (XuperTv / "Ranger" SDK 4.9.4 — UA `Ranger/4.9.4-17294ac0`, app_version `49902`)
**APK también firmado como:** `com.xuper.netxxus` "Xuper Hydra" en las capturas PCAPdroid (mod con VPN).

## Arquitectura de red (2 capas)

### 1) Capa HTTP (Java) — portalCore
- Endpoints: `http://{host}/api/portalCore/...` (lista completa en el smali del mod, p.ej. `v8/login`, `v10/startPlayVOD`, `v15/getSlbInfo`, `getHome`, `v3/searchByName`...).
- Cifrado de cuerpo: AES-128-CBC/PKCS7, clave **`b972E8a5A4e0e8Ff`**, IV aleatorio de 16 bytes **antepuesto al ciphertext**, y codificación:
  - HTTP: Base64 estándar (clase `b3.a`).
  - Params tipo `auth`: alfabeto custom **`jWB7YtC3n9iXbEkUcJl1VxF4STpQoOIaRmh2M-efAgLwPqGr6uyD5vNsdH_Kz0Z8`** (clase `r8.b`).
- **Estado:** el servidor actual responde `"returnCode":"portal200001"` ("版本已停止使用") a las versiones viejas del API HTTP. El tráfico real del catálogo ya NO va por portalCore HTTP.

### 2) Capa WebSocket (nativa) — todo el catálogo y la reproducción
- Implementada en **`libranger-jni.so`** (C++): símbolos RTTI `net::websocket::{Transport,Peer,IStreamHandler,ITransportHandler}`, más `crypto_scalarmult_curve25519` exportada.
- Endpoints observados en capturas: `ws://s23sdf56.45lc9mx79ab.com/v1/ws/{hash32}` y `ws://sgyc.bfj1k2g4v.com/v1/imagine` (uno por función: home, búsqueda, detalle, play).
- Cifrado de sesión nativo (el `.so` está stripped; clave NO es la del HTTP).

## Protocolo binario de frames WS (descifrado del formato)

Formato de cada mensaje binario (confirmado sobre frames reales del PCAP 16/sept 14:25):

```
[0]    tipo:  0x50 = handshake/control | 0x65 = query (client→server)
              0x30 = push              | 0x31 = respuesta (server→client)
[1]    sub/flags
[2:4]  uint16 BIG-endian = longitud del ciphertext
[4:]   ciphertext (siempre múltiplo de 16 → AES-CBC u otro block cipher)
```

Ejemplos verificados:
- `50 01 04 20` + 1056 B = hello cliente (pkt 650)
- `50 02 02 50` + 592 B = respuesta handshake (pkt 667)
- `65 10 01 d0` + 464 B = query (pkt 758)
- `65 00 04 c0` + 1216 B = query (pkt 14512)
- Server responses `31 11 01 c0` (452 B) y pushes `30 22 04 c0` (1220 B)

Claves de sesión: derivadas del intercambio X25519/ed25519 (`libed25519.so` expone `ed25519_key_exchange`, `publicKeyGen`, `sign`, `verify`; `ED25519Encrypt` en `com.hpplay.component.protocol.encrypt`).

## Flujo de tokens de reproducción (VOD)

1. WS → `getVodPlayUrl` / `startPlayVOD` → mediaCodes + play info (cifrado de sesión).
2. `GET http://yuwc.swzablvpm.com/slb/v11/vod?auth=<cifrado custom>` con headers:
   ```
   App: com.android.msandroid
   App-Version: 49902
   Content-License: app_id=com.android.msandroid&tag=free&scheme=md5-01&media_code={CODE}&expired={ts}&token={md5 32hex}
   Ranger-Id: {id}
   User-Agent: Ranger/4.9.4-17294ac0
   ```
   → respuesta binaria (también cifrada, `application/octet-stream`) con lista de servidores + URLs firmadas.
3. Reproducción directa: `http://{ip}:{port}/vod/{MEDIACODE}_media.ts?content_auth2=/vod/%3Ftag%3Dslb%26host%3D...%26token%3D{md5}...` (expira en ~4 h).
   - Live NO requiere auth (ej. `http://23.227.144.242:44822/live/cyx_50fdcc0817d61_720p.m3u8`).
   - Subtítulos: `http://rjqcfy.3xfmjizq.xyz/public/subs/{uuid}.srt`.

## mediaCodes conocidos (capturas)

| mediaCode | host de media | estado |
|---|---|---|
| BCF940BE93754676AB0877E91258675D | 69.162.99.51:31412 | reprodujo en GrayJay (token vencido) |
| 45063077C8374DCF8755FF214D8DD0B4 | 216.245.209.219:11114 | reprodujo en GrayJay (token vencido) |
| 0A8A43165F9042B19FB25B2645975C8F | 69.162.99.51:31412 | token vencido |
| 202B515FE3FA4F46B40327EB47EFA792 | 107.151.149.150:18675 | token vencido |
| 496D2957D3EC45EFB2F34BDCF3B877C0 | 208.115.207.227:2701 | token vencido |
| 4DC7E29C0EF941318307436A9CCDCDE0 | 98.98.3.6:19172 | token vencido |
| 7C81D68A2E9A4A3C8B3AEED8CE549912 | 98.98.163.127:17547 | token vencido |
| 83D4D2A7C00B43739786382DE72BB243 | 208.115.229.211:19744 | token vencido |
| 9BFEB3F52060431A83CE1A794D59329E | ptccloud.lsdwedsfsc.site | token vencido |
| B617D2ED6E724D1196390AE68C7E6CCD | 216.245.210.139:17209 | token vencido |

> Todos los tokens capturados expiran (~4 h). El `auth` del SLB es de un solo uso (replay → HTTP 400).

## Qué falta para el catálogo completo

- **Opción A (rápida):** extraer la caché/datos de la app desde el dispositivo (SharedPreferences/DB de `com.msandroid.mobile`) → contiene home/búsquedas con títulos + mediaCodes. Requiere Shizuku/root (en el TCL actual Shizuku está bloqueado por optimización de batería).
- **Opción B (completa, lenta):** ingeniería inversa de `libranger-jni.so` (Ghidra) para replicar el handshake X25519/ed25519 + cifrado de sesión; luego reimplementar el WS en el Cloudflare Worker.
- **Opción C:** captura fresca cuando se necesiten tokens; el worker ya permite inyectarlos (`/api/stream`), pero expiran en 4 h → no es sostenible.
