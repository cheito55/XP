#!/system/bin/sh
# Extrae la caché de Xuper (mod Hydra com.xuper.netxxus o versiones 6.5.7)
# REQUISITOS: root (Magisk) o run-as (apk debuggable)
# Uso: sh extract-xuper-cache.sh
PKG="${1:-com.xuper.netxxus}"
OUT=/sdcard/Download/xuper-dump
rm -rf "$OUT"; mkdir -p "$OUT/shared_prefs" "$OUT/databases" "$OUT/files"

echo "[*] paquete: $PKG"
if su -c true 2>/dev/null; then
  SU="su -c"
elif [ "$(id -u)" = "0" ]; then
  SU=""
else
  echo "[!] Sin root. Probando run-as..."
  if run-as "$PKG" true 2>/dev/null; then
    SU="run-as $PKG"
  else
    echo "[-] No hay root ni run-as. Usa adb backup (ver adb-backup-cache.md)."
    exit 1
  fi
fi

BASE=$(su -c "dumpsys package $PKG 2>/dev/null | grep -m1 dataDir" 2>/dev/null | sed 's/.*dataDir=//')
[ -z "$BASE" ] && BASE="/data/data/$PKG"
echo "[*] dataDir: $BASE"
$SU cp -r "$BASE/shared_prefs" "$OUT/" 2>/dev/null
$SU cp -r "$BASE/databases"   "$OUT/" 2>/dev/null
$SU cp -r "$BASE/files"       "$OUT/" 2>/dev/null
$SU cp -r "$BASE/cache"       "$OUT/" 2>/dev/null
$SU ls -la "$BASE" > "$OUT/datadir.listing" 2>/dev/null
chmod -R a+r "$OUT" 2>/dev/null
echo "[*] listo en $OUT"
find "$OUT" -type f | head -50
