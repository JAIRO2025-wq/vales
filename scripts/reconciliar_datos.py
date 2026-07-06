"""
Script de reconciliación: busca vales en los JSON que tienen imágenes/firmas
en el servidor Python pero no están referenciadas en los registros.

USO:
    py scripts/reconciliar_datos.py           # Vista previa (no modifica)
    py scripts/reconciliar_datos.py --write   # Aplica los cambios
"""

import json
import os
import glob
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
STORAGE_DIR = BASE_DIR / 'src' / 'data' / 'storage'
IMAGENES_DIR = BASE_DIR / 'servidor' / 'storage' / 'imagenes'
GENERATED_DIR = BASE_DIR / 'servidor' / 'generated'

# Modo seguro: por defecto solo muestra, no escribe
WRITE_MODE = '--write' in sys.argv

def get_imagenes_index():
    """Construye un índice {id_normalizado: [lista_de_archivos]}"""
    idx = {}
    if not IMAGENES_DIR.exists():
        print(f"⚠️  No existe el directorio de imágenes: {IMAGENES_DIR}")
        return idx
    
    for img in IMAGENES_DIR.iterdir():
        if not img.is_file():
            continue
        name = img.name
        
        # Extraer el ID del vale del nombre del archivo
        # Formato típico: "SAN MIGUEL-2026-06-W3-CAJACHICA-F6_firma_12345678.png"
        # o "SAN-MIGUEL-2026-06-W3-CAJACHICA-F6_comprobante_12345678.png"
        
        # Quitar extensión
        base = name.rsplit('.', 1)[0]
        
        # Quitar el sufijo _firma_XXXXX o _comprobante_XXXXX
        # Buscamos el patrón _firma_ o _comprobante_
        import re
        match = re.match(r'^(.+?)_(firma|comprobante)_\d+', base)
        if match:
            vid_raw = match.group(1)  # Ej: "SAN MIGUEL-2026-06-W3-CAJACHICA-F6"
            tipo = match.group(2)     # "firma" o "comprobante"
            
            # Normalizar: crear variantes con guiones y espacios
            vid_normalized = vid_raw.replace(' ', '-').upper().strip()
            
            if vid_normalized not in idx:
                idx[vid_normalized] = {'firma': [], 'comprobante': []}
            
            img_rel = f'/storage/imagenes/{name}'
            if tipo == 'firma':
                idx[vid_normalized]['firma'].append(img_rel)
            else:
                idx[vid_normalized]['comprobante'].append(img_rel)
    
    return idx

def get_pdfs_index():
    """Construye un índice {id_normalizado: ruta_del_pdf}"""
    idx = {}
    for pdf_file in GENERATED_DIR.rglob('*.pdf'):
        name = pdf_file.stem  # sin extensión
        # Normalizar eliminando sufijos como .hash
        vid = name.upper().strip()
        if vid not in idx:
            idx[vid] = str(pdf_file)
    return idx

def reparar_vouchers(vouchers_path, imagenes_idx, pdfs_idx):
    """Revisa y repara un archivo vouchers.json"""
    if not vouchers_path.exists():
        return 0, 0
    
    with open(vouchers_path, 'r', encoding='utf-8') as f:
        vouchers = json.load(f)
    
    reparados = 0
    ya_ok = 0
    
    for v in vouchers:
        vid = v.get('id', '')
        if not vid:
            continue
        
        vid_norm = vid.upper().strip()
        
        # Buscar imágenes para este ID
        img_data = imagenes_idx.get(vid_norm)
        if not img_data:
            # Intentar con el ID con espacios
            img_data = imagenes_idx.get(vid_norm.replace('-', ' '))
        
        necesita_reparacion = False
        
        if img_data:
            # Verificar firma
            firma_imgs = img_data.get('firma', [])
            comp_imgs = img_data.get('comprobante', [])
            
            tiene_firma = bool(v.get('firmaUrl'))
            tiene_comp = bool(v.get('comprobanteUrl'))
            
            if firma_imgs and not tiene_firma:
                v['firmaUrl'] = firma_imgs[0]  # usar la más reciente
                v['firmado'] = True
                if not v.get('autorizadoPor'):
                    v['autorizadoPor'] = 'ADMIN'
                necesita_reparacion = True
            
            if comp_imgs and not tiene_comp:
                v['comprobanteUrl'] = comp_imgs[0]
                necesita_reparacion = True
        
        # Verificar PDF
        if vid_norm in pdfs_idx and not v.get('hasPdf'):
            v['hasPdf'] = True
            necesita_reparacion = True
        
        if necesita_reparacion:
            reparados += 1
            print(f'  🔧 {vid}')
            if img_data:
                if img_data.get('firma') and not v.get('firmaUrl'): pass  # ya se asignó
                if img_data.get('comprobante') and not v.get('comprobanteUrl'): pass  # ya se asignó
        else:
            ya_ok += 1
    
    if reparados > 0 and WRITE_MODE:
        with open(vouchers_path, 'w', encoding='utf-8') as f:
            json.dump(vouchers, f, ensure_ascii=False, indent=2)
        print(f'  ✅ {reparados} reparados en {vouchers_path.name}')
    elif reparados > 0:
        print(f'  📋 {reparados} pendientes de reparar en {vouchers_path.name} (usa --write para aplicar)')
    else:
        print(f'  ✅ {ya_ok} registros OK, ningún pendiente')
    
    return reparados, ya_ok


def main():
    print('=' * 70)
    print('RECONCILIACIÓN DE DATOS DE VALES')
    print(f'Modo: {"📝 ESCRITURA" if WRITE_MODE else "👁️  VISTA PREVIA (solo lectura)"}')
    print('=' * 70)
    
    # Construir índices
    print('\n📸 Escaneando imágenes del servidor...')
    imagenes_idx = get_imagenes_index()
    print(f'   {len(imagenes_idx)} vales con imágenes encontrados')
    
    print('\n📄 Escaneando PDFs generados...')
    pdfs_idx = get_pdfs_index()
    print(f'   {len(pdfs_idx)} PDFs encontrados')
    
    # Buscar todos los vouchers.json
    json_files = sorted(STORAGE_DIR.rglob('vouchers.json'))
    # Excluir directorios corruptos (20226, 8730)
    json_files = [f for f in json_files if '20226' not in str(f) and '8730' not in str(f)]
    
    print(f'\n📁 Ciclos encontrados: {len(json_files)}')
    for jf in json_files:
        rel = jf.relative_to(BASE_DIR)
        print(f'   {rel}')
    
    total_reparados = 0
    total_ok = 0
    
    print()
    for jf in json_files:
        rel = jf.relative_to(BASE_DIR)
        print(f'\n--- {rel} ---')
        r, o = reparar_vouchers(jf, imagenes_idx, pdfs_idx)
        total_reparados += r
        total_ok += o
    
    print('\n' + '=' * 70)
    print(f'RESUMEN: {total_reparados} vales reparados, {total_ok} ya estaban OK')
    
    if total_reparados > 0 and not WRITE_MODE:
        print('\n💡 Ejecuta con --write para aplicar los cambios:')
        print('   py scripts/reconciliar_datos.py --write')
    print('=' * 70)

if __name__ == '__main__':
    main()
