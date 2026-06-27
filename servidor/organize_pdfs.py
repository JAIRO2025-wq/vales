#!/usr/bin/env python3
"""
Script para reordenar los PDFs existentes en generated/ de plano a subcarpetas.

Estructura destino:
    generated/{sucursal}/{año-mes}/{tipo_gasto}/{archivo}.pdf
    generated/{sucursal}/{año-mes}/{tipo_gasto}/{archivo}.pdf.hash

Uso:
    python organize_pdfs.py                        # Vista previa (no mueve nada)
    python organize_pdfs.py --apply                # Ejecuta la migración
    python organize_pdfs.py --apply --cleanup      # Ejecuta y borra archivos originales
"""

import os
import re
import shutil
import sys

# ── Configuración ──
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(BASE_DIR, 'generated')


def safe_filename(value: str) -> str:
    """Limpia un string para usarlo como nombre de archivo/carpeta."""
    return re.sub(r'[^a-zA-Z0-9_.-]', '_', value or 'vale')


def get_target_folder(filename: str) -> str | None:
    """
    Extrae la ruta destino a partir del nombre del archivo.
    Ej: 'SAN-MIGUEL-2026-06-W2-OTROSGASTOS-F6.pdf'
      → 'SAN-MIGUEL/2026-06/OTROSGASTOS/'
    Retorna None si el nombre no coincide con el patrón esperado.
    """
    name_no_ext = os.path.splitext(filename)[0]

    # Patrón: SUCURSAL-YYYY-MM-W#-TIPO-F#
    m = re.match(r'^(.+)-(\d{4})-(\d{2})-W\d-(.+)-F\d+$', name_no_ext)
    if not m:
        return None

    sucursal = safe_filename(m.group(1))
    año_mes = f"{m.group(2)}-{m.group(3)}"
    tipo_gasto = safe_filename(m.group(4))

    return os.path.join(sucursal, año_mes, tipo_gasto)


def organize(apply: bool = False, cleanup: bool = False) -> None:
    """
    Escanea OUTPUT_DIR y mueve los archivos planos a su subcarpeta correspondiente.

    Args:
        apply: Si True, ejecuta los movimientos. Si False, solo muestra vista previa.
        cleanup: Si True, elimina los archivos originales después de moverlos.
                 Solo tiene efecto si apply=True.
    """
    if not os.path.isdir(OUTPUT_DIR):
        print(f"❌ No se encuentra el directorio: {OUTPUT_DIR}")
        sys.exit(1)

    all_items = os.listdir(OUTPUT_DIR)

    # Separar PDFs y sus .hash (solo en la raíz, no en subcarpetas)
    pdfs = {}
    hashes = {}

    for item in all_items:
        item_path = os.path.join(OUTPUT_DIR, item)
        if not os.path.isfile(item_path):
            continue  # Saltar carpetas

        if item.endswith('.pdf'):
            pdfs[item] = item_path
        elif item.endswith('.pdf.hash'):
            base = item.replace('.hash', '')
            hashes[base] = item_path

    if not pdfs:
        print("✅ No hay PDFs planos que reorganizar. Todo está en orden.")
        return

    print(f"📄 Se encontraron {len(pdfs)} PDF(s) por reorganizar.\n")

    moved_count = 0
    skip_count = 0

    for pdf_name, pdf_path in pdfs.items():
        target_folder = get_target_folder(pdf_name)

        if target_folder is None:
            print(f"  ⏭️  {pdf_name}")
            print(f"     └─ No coincide con el patrón esperado, se omite.\n")
            skip_count += 1
            continue

        target_dir = os.path.join(OUTPUT_DIR, target_folder)
        target_pdf = os.path.join(target_dir, pdf_name)
        hash_name = pdf_name + '.hash'
        source_hash = os.path.join(OUTPUT_DIR, hash_name)
        target_hash = os.path.join(target_dir, hash_name)

        print(f"  📄 {pdf_name}")
        print(f"     └─ → {target_folder}/")

        if apply:
            os.makedirs(target_dir, exist_ok=True)

            # Mover PDF
            shutil.move(pdf_path, target_pdf)
            print(f"        ✔ PDF movido")

            # Mover .hash si existe
            if os.path.exists(source_hash):
                shutil.move(source_hash, target_hash)
                print(f"        ✔ Hash movido")
            else:
                print(f"        ⚠ No se encontró archivo .hash")

            # Cleanup opcional
            if cleanup:
                # Los archivos ya se movieron, no hay nada que limpiar individualmente
                pass

            moved_count += 1
        else:
            # Vista previa
            if os.path.exists(source_hash):
                print(f"        🗂  + {pdf_name}.hash también se moverá")
            moved_count += 1

        print()

    # ── Resumen ──
    print("=" * 50)
    if apply:
        print(f"✅ Migración completada: {moved_count} archivo(s) procesado(s).")
        if skip_count:
            print(f"⏭️  {skip_count} archivo(s) omitido(s) por no coincidir con el patrón.")
        if cleanup:
            print("🧹 Cleanup: los archivos fuente ya no existen (se movieron).")
    else:
        print(f"📋 Vista previa: {moved_count} archivo(s) se migrarán.")
        if skip_count:
            print(f"⏭️  {skip_count} archivo(s) se omitirán.")
        print()
        print("💡 Ejecuta con --apply para realizar la migración:")
        print(f"   python {os.path.basename(__file__)} --apply")
        print()
        print("💡 Agrega --cleanup si quieres eliminar los originales después:")
        print(f"   python {os.path.basename(__file__)} --apply --cleanup")
    print("=" * 50)


if __name__ == '__main__':
    apply = '--apply' in sys.argv
    cleanup = '--cleanup' in sys.argv

    if cleanup and not apply:
        print("⚠️  --cleanup solo tiene efecto si también usas --apply")
        print()
        organize(apply=False, cleanup=False)
    else:
        organize(apply=apply, cleanup=cleanup)
