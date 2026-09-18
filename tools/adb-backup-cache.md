# Obtener la caché de Xuper con `adb backup` (SIN root)

El mod **XuperHydraProxyV2** (`com.xuper.netxxus`) tiene `android:allowBackup=true`,
así que su caché se puede extraer con `adb backup` desde una PC con ADB.

> Nota: `xuper_app.apk` original (6.5.7) tiene `allowBackup=false` → no aplica.

## Pasos (en una PC con adb)
1. Conecta el celular por USB con depuración USB activada.
2. `adb devices` (acepta el prompt RSA en el celular).
3. Instala/abre la app y asegúrate de haber iniciado sesión y navegado (Home/Search).
4. Crea el backup (sin contraseña):
   ```bash
   adb backup -f xuper.ab -noapk com.xuper.netxxus
   ```
   (Confirmar en el celular: "Hacer copia de seguridad de mis datos" → "No hacer copia de mis datos" si pide PIN.)
5. Convierte `xuper.ab` (formato Android Backup; si es AES, requiere contraseña):
   ```bash
   # con android-backup-extractor (abe)
   java -jar abe.jar unpack xuper.ab xuper.tar
   tar xf xuper.tar
   ```
6. Sube la carpeta `apps/com.xuper.netxxus/` obtenida (o el `xuper.ab` si no pudiste
   desempacar) a este chat o al repo.

## Qué buscamos
- `shared_prefs/*.xml` → sesión (userId, devId, userToken, Ranger-Id), hosts, caché JSON.
- `databases/*.db*` → historial/favoritos con mediaCodes.
- `files/*.json|*.dat` → catálogo (home/search) ya descifrado.

Después corre `tools/parse-xuper-cache.py` para generar el catálogo con mediaCodes.
