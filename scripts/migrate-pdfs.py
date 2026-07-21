"""
Script de migración: mueve PDFs generados de estructura antigua
  {sucursal}/{año-mes}/{caja}/  →  {año}/{ciclo}/{sucursal}/{caja}/

Los PDFs antiguos usaban estructura: sucursal/año-mes/caja/archivo.pdf
La nueva estructura es: año/ciclo/sucursal/caja/archivo.pdf

También maneja archivos huérfanos en la raíz de generated/.

Ejecutar con: python scripts/migrate-pdfs.py
"""

import os
import re
import shutil
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
GENERATED_DIR = os.path.join(SCRIPT_DIR, '..', 'servidor', 'generated')


def safe_filename(value: str) -> str:
    return re.sub(r'[^a-zA-Z0-9_.-]', '_', value or 'archivo')


def normalize_caja(caja_raw: str) -> str:
    c = caja_raw.upper().replace(' ', '-')
    if 'CAJACHICA' in c or 'GENERAL' in c or 'HOJA' in c:
        return 'CAJA-CHICA'
    elif 'CLIENTES' in c:
        return 'CLIENTES'
    elif 'INSTALACIONES' in c:
        return 'INSTALACIONES'
    elif 'OTROS' in c:
        return 'OTROS-GASTOS'
    return c


def extract_from_filename(filename: str):
    """
    Intenta extraer sucursal, año, mes, caja del nombre del archivo.
    Patrón: SUCURSAL-YYYY-MM-WX-CATEGORIA-FXX.pdf
    """
    name = filename.replace('.pdf', '').replace('.hash', '').replace(' ', '-')
    match = re.match(r'^(.+)-(\d{4})-(\d{2})-W\d-(.+)-F\d+$', name, re.IGNORECASE)
    if match:
        return {
            'sucursal': safe_filename(match.group(1)),
            'year': match.group(2),
            'month': match.group(3),
            'caja': normalize_caja(safe_filename(match.group(4))),
        }
    return None


def find_new_structure_dirs():
    """Encuentra directorios que ya están en la nueva estructura {year}/{ciclo}/..."""
    new_dirs = set()
    if not os.path.isdir(GENERATED_DIR):
        return new_dirs
    for entry in os.listdir(GENERATED_DIR):
        entry_path = os.path.join(GENERATED_DIR, entry)
        if not os.path.isdir(entry_path):
            continue
        # Si el nombre se ve como un año (4 dígitos), es nueva estructura
        if re.match(r'^\d{4}$', entry):
            for ciclo in os.listdir(entry_path):
                ciclo_path = os.path.join(entry_path, ciclo)
                if os.path.isdir(ciclo_path) and re.match(r'^\d{4}-\d{2}$', ciclo):
                    for suc in os.listdir(ciclo_path):
                        suc_path = os.path.join(ciclo_path, suc)
                        if os.path.isdir(suc_path):
                            for caja in os.listdir(suc_path):
                                if os.path.isdir(os.path.join(suc_path, caja)):
                                    new_dirs.add((entry, ciclo, suc, caja))
    return new_dirs


def migrate():
    if not os.path.isdir(GENERATED_DIR):
        print(f"❌ No se encontró: {GENERATED_DIR}")
        sys.exit(1)

    print(f"🔍 Escaneando PDFs en: {GENERATED_DIR}\n")

    # Encontrar directorios de estructura vieja: {sucursal}/{año-mes}/{caja}/
    old_dirs = []
    orphans = []  # archivos sueltos en raíz

    for entry in os.listdir(GENERATED_DIR):
        entry_path = os.path.join(GENERATED_DIR, entry)

        # Saltar la nueva estructura (carpetas que son años: 2026, 2027, etc.)
        if os.path.isdir(entry_path) and re.match(r'^\d{4}$', entry):
            continue

        # ZIP files en raíz
        if os.path.isfile(entry_path) and entry.endswith('.zip'):
            # Dejarlos en raíz, son temporales
            continue

        if os.path.isfile(entry_path):
            orphans.append(entry)
            continue

        # Es un directorio de estructura vieja: {sucursal}/
        # Dentro debería tener {año-mes}/{caja}/
        if not os.path.isdir(entry_path):
            continue

        sucursal = safe_filename(entry)
        
        for sub in os.listdir(entry_path):
            sub_path = os.path.join(entry_path, sub)

            if not os.path.isdir(sub_path):
                # Archivo suelto dentro de sucursal
                old_dirs.append(('SUELTOS', sucursal, 'SUELTOS', sub_path, [sub]))
                continue

            # Verificar si es año-mes
            if re.match(r'^\d{4}-\d{2}$', sub):
                year_month = sub
                year, month = year_month.split('-')

                for caja_entry in os.listdir(sub_path):
                    caja_path = os.path.join(sub_path, caja_entry)
                    if os.path.isdir(caja_path):
                        caja = caja_entry
                        files = os.listdir(caja_path)
                        old_dirs.append((year, month, sucursal, caja, caja_path, files))
            else:
                # No es año-mes, podría ser caja directamente (estructura más plana)
                # o alguna estructura rara. Recorrer recursivamente.
                for root, dirs, files in os.walk(sub_path):
                    for f in files:
                        old_dirs.append(('SUELTOS', sucursal, safe_filename(sub), root, [f]))

    print(f"📂 {len(old_dirs)} grupos en estructura vieja encontrados")
    print(f"📄 {len(orphans)} archivos huérfanos en raíz\n")

    # Procesar archivos huérfanos
    moved_orphans = 0
    if orphans:
        sueltos_dir = os.path.join(GENERATED_DIR, '_archivos_sueltos')
        os.makedirs(sueltos_dir, exist_ok=True)
        for orphan in orphans:
            src = os.path.join(GENERATED_DIR, orphan)
            dst = os.path.join(sueltos_dir, orphan)
            try:
                shutil.move(src, dst)
                moved_orphans += 1
                print(f"  📦 Huérfano → _archivos_sueltos/{orphan}")
            except Exception as e:
                print(f"  ❌ Error moviendo huérfano {orphan}: {e}")
        if moved_orphans:
            print()

    # Procesar estructura vieja
    moved = 0
    skipped = 0
    errors = 0

    for item in old_dirs:
        # Desempaquetar según número de elementos
        if len(item) == 4:
            # old_dirs.append(('SUELTOS', sucursal, 'SUELTOS', sub_path, [sub]))
            year, sucursal, caja, dir_path, files = item
            month = '00'
        elif len(item) == 6:
            year, month, sucursal, caja, dir_path, files = item
        else:
            continue

        year_str = str(year)
        ciclo_id = f"{year_str}-{month}"
        sucursal_clean = safe_filename(sucursal)
        caja_clean = normalize_caja(caja)

        dest_dir = os.path.join(GENERATED_DIR, year_str, ciclo_id, sucursal_clean, caja_clean)

        for f in files:
            if f.startswith('.'):  # evitar .DS_Store etc.
                continue

            src = os.path.join(dir_path, f)
            if not os.path.isfile(src):
                continue

            os.makedirs(dest_dir, exist_ok=True)
            dst = os.path.join(dest_dir, f)

            try:
                if os.path.exists(dst):
                    # Ya existe, saltar
                    skipped += 1
                    continue
                shutil.move(src, dst)
                moved += 1
                if moved <= 30 or moved % 30 == 0:
                    print(f"  ✅ {year_str}/{ciclo_id}/{sucursal_clean}/{caja_clean}/{f}")
            except Exception as e:
                print(f"  ❌ Error moviendo {f}: {e}")
                errors += 1

    print(f"\n🎉 Migración completada:")
    print(f"   ✅ {moved} PDFs movidos a nueva estructura")
    print(f"   📦 {moved_orphans} huérfanos movidos a _archivos_sueltos/")
    print(f"   ⏭️  {skipped} duplicados saltados")
    print(f"   ❌ {errors} errores")
    print(f"\n💡 Las carpetas viejas vacías quedaron en su lugar. Podés borrarlas desde el explorador Super Admin con cuidado.")

    # Limpiar carpetas viejas vacías
    print("\n🧹 Limpiando carpetas viejas vacías...")
    cleaned = 0
    for root, dirs, files in os.walk(GENERATED_DIR, topdown=False):
        # No borrar la raíz ni carpetas de la nueva estructura
        if root == GENERATED_DIR:
            continue
        # No borrar carpetas que no están vacías
        try:
            remaining = os.listdir(root)
            if not remaining:
                os.rmdir(root)
                cleaned += 1
        except:
            pass

    print(f"   🗑️  {cleaned} carpetas vacías eliminadas")


if __name__ == '__main__':
    migrate()
