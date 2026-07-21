"""
Script de migración: mueve las imágenes del servidor Python de estructura
plana (storage/imagenes/*.png) a estructura jerárquica
(storage/imagenes/{year}/{ciclo}/{sucursal}/{caja}/*.png)

Los nombres de archivo tienen formato:
  SUCURSAL-YYYY-MM-WX-CATEGORIA-FXX_firma_TIMESTAMP.png
  SUCURSAL-YYYY-MM-WX-CATEGORIA-FXX_comprobante_TIMESTAMP.png

Ejecutar con: python scripts/migrate-imagenes.py
"""

import os
import re
import shutil
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
IMAGES_DIR = os.path.join(SCRIPT_DIR, '..', 'servidor', 'storage', 'imagenes')


def safe_filename(value: str) -> str:
    return re.sub(r'[^a-zA-Z0-9_.-]', '_', value or 'desconocido')


def normalize_caja(caja_raw: str) -> str:
    c = caja_raw.upper()
    if 'CHICA' in c or c == 'GENERAL':
        return 'CAJA-CHICA'
    elif 'CLIENTES' in c:
        return 'CLIENTES'
    elif 'INSTALACIONES' in c:
        return 'INSTALACIONES'
    elif 'OTROS' in c:
        return 'OTROS-GASTOS'
    return c.replace(' ', '-')


def migrate():
    if not os.path.isdir(IMAGES_DIR):
        print(f"❌ No se encontró la carpeta: {IMAGES_DIR}")
        sys.exit(1)

    print(f"🔍 Escaneando imágenes en: {IMAGES_DIR}\n")

    files = [
        f for f in os.listdir(IMAGES_DIR)
        if os.path.isfile(os.path.join(IMAGES_DIR, f))
        and f.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp'))
    ]

    if not files:
        print("📭 No hay imágenes para migrar.")
        return

    pattern = re.compile(
        r'^(.+)-(\d{4})-(\d{2})-W\d-(.+)-F\d+_(firma|comprobante|firmaAutorizador)_(\d+)\.(png|jpg|jpeg|gif|webp)$',
        re.IGNORECASE
    )

    migrated = 0
    skipped = 0
    errors = 0

    for filename in files:
        match = pattern.match(filename)
        
        if not match:
            # Intentar patrón con espacios en sucursal
            # Ej: "SAN MIGUEL-2026-05-W3-OTROSGASTOS-F6_firma_1781901531.png"
            # Normalizar: reemplazar espacios por guiones para que el regex coincida
            normalized = filename.replace(' ', '-')
            match = pattern.match(normalized)

        if match:
            sucursal = safe_filename(match.group(1).replace(' ', '-'))
            year = match.group(2)
            month = match.group(3)
            caja_raw = safe_filename(match.group(4))
            suffix = match.group(5)  # firma, comprobante, firmaAutorizador
            ext = match.group(7)

            caja = normalize_caja(caja_raw)
            ciclo_id = f"{year}-{month}"

            dest_dir = os.path.join(IMAGES_DIR, year, ciclo_id, sucursal, caja)
            os.makedirs(dest_dir, exist_ok=True)

            src = os.path.join(IMAGES_DIR, filename)
            dst = os.path.join(dest_dir, filename)

            try:
                shutil.move(src, dst)
                migrated += 1
                if migrated <= 20 or migrated % 50 == 0:
                    print(f"  ✅ {year}/{ciclo_id}/{sucursal}/{caja}/{filename}")
            except Exception as e:
                print(f"  ❌ Error moviendo {filename}: {e}")
                errors += 1
        else:
            # Archivo que no coincide con el patrón conocido, se queda donde está
            skipped += 1
            if skipped <= 5:
                print(f"  ⏭️  Sin patrón reconocido: {filename}")

    print(f"\n🎉 Migración completada:")
    print(f"   ✅ {migrated} imágenes movidas a estructura jerárquica")
    print(f"   ⏭️  {skipped} archivos sin patrón conocido (se quedan en raíz)")
    print(f"   ❌ {errors} errores")


if __name__ == '__main__':
    migrate()
