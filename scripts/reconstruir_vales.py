"""
Reconstruye registros de vales en vouchers.json a partir de los PDFs e imágenes
que existen en el servidor Python pero no tienen registro en la base de datos JSON.

USO:
    py scripts/reconstruir_vales.py            # Vista previa
    py scripts/reconstruir_vales.py --write    # Crear los registros
"""

import json
import os
import re
import sys
from pathlib import Path
from collections import defaultdict

BASE_DIR = Path(__file__).resolve().parent.parent
STORAGE_DIR = BASE_DIR / 'src' / 'data' / 'storage'
IMAGENES_DIR = BASE_DIR / 'servidor' / 'storage' / 'imagenes'
GENERATED_DIR = BASE_DIR / 'servidor' / 'generated'

WRITE_MODE = '--write' in sys.argv

# Mapeo de tipo en el ID a sheet
TIPO_TO_SHEET = {
    'CAJACHICA': 'CAJA CHICA',
    'OTROSGASTOS': 'OTROS GASTOS',
    'CLIENTES': 'CLIENTES',
    'INSTALACIONES': 'INSTALACIONES',
}

def parse_voucher_id(vid):
    """
    Parsea un ID de vale y extrae sus componentes.
    Ej: SAN-MIGUEL-2026-06-W3-CAJACHICA-F6
    """
    # Normalizar: reemplazar múltiples guiones, espacios
    vid_clean = vid.strip().upper().replace(' ', '-')
    
    # Patrón: SUCURSAL-YYYY-MM-WX-TIPO-FILA
    # La sucursal puede tener guiones (CARA-SUCIA, SAN-SEBASTIAN, etc.)
    # Por eso usamos un patrón que capture todo hasta YYYY-MM
    m = re.match(r'^(.+?)-\d{4}-\d{2}-W\d+-(CAJACHICA|OTROSGASTOS|CLIENTES|INSTALACIONES)-F(\d+)$', vid_clean)
    if not m:
        # Intentar sin el W#
        m = re.match(r'^(.+?)-\d{4}-\d{2}-(CAJACHICA|OTROSGASTOS|CLIENTES|INSTALACIONES)-F(\d+)$', vid_clean)
    if not m:
        return None
    
    sucursal_raw = m.group(1)
    tipo = m.group(2)
    fila = m.group(3)
    
    # Convertir sucursal: SAN-MIGUEL → SAN MIGUEL, CARA-SUCIA → CARA SUCIA
    sucursal = sucursal_raw.replace('-', ' ')
    
    # Extraer periodo (YYYY-MM)
    periodo_m = re.search(r'-(\d{4}-\d{2})-', vid_clean)
    periodo = periodo_m.group(1) if periodo_m else None
    
    return {
        'id': vid_clean,
        'sucursal': sucursal,
        'periodo': periodo,
        'tipo': tipo,
        'sheet': TIPO_TO_SHEET.get(tipo, tipo),
        'fila': fila,
    }

def get_existing_ids():
    """Obtiene todos los IDs que ya existen en los JSON"""
    ids = set()
    for jf in STORAGE_DIR.rglob('vouchers.json'):
        if '20226' in str(jf) or '8730' in str(jf):
            continue
        with open(jf, encoding='utf-8') as f:
            for v in json.load(f):
                ids.add(v.get('id', '').upper().strip())
    return ids

def get_images_for_id(vid_clean, imagenes_list):
    """
    Busca imágenes de firma y comprobante para un ID.
    Las imágenes pueden tener el ID con espacios o guiones.
    """
    firma = []
    comprobante = []
    
    # Variantes del ID para buscar en nombres de imágenes
    variants = [
        vid_clean,  # CON GUIONES: SAN-MIGUEL-2026-06-W3-CAJACHICA-F6
        vid_clean.replace('-', ' '),  # CON ESPACIOS: SAN MIGUEL-2026-06-W3-CAJACHICA-F6
    ]
    
    for img_name in imagenes_list:
        # Normalizar el nombre de la imagen para comparación
        img_norm = img_name.replace('-', ' ').upper()
        
        for variant in variants:
            var_norm = variant.replace('-', ' ').upper()
            if var_norm in img_norm:
                if 'FIRMA' in img_norm:
                    firma.append(f'/storage/imagenes/{img_name}')
                if 'COMPROBANTE' in img_norm:
                    comprobante.append(f'/storage/imagenes/{img_name}')
                break
    
    return firma, comprobante

def find_pdfs_for_id(vid_clean):
    """Busca PDFs generados para un ID"""
    pdfs = list(GENERATED_DIR.rglob(f'*{vid_clean}*.pdf'))
    # También buscar con espacios
    pdfs += list(GENERATED_DIR.rglob(f'*{vid_clean.replace("-", " ")}*.pdf'))
    return pdfs

def find_archived_pdfs(sucursal, periodo, num_vale):
    """Busca PDF archivado en storage"""
    pass  # Lo haremos si tenemos numVale

def main():
    print('=' * 70)
    print('RECONSTRUCCIÓN DE REGISTROS DE VALES PERDIDOS')
    print(f'Modo: {"ESCRITURA" if WRITE_MODE else "VISTA PREVIA (solo lectura)"}')
    print('=' * 70)
    
    # IDs existentes
    existing_ids = get_existing_ids()
    print(f'\n📊 Registros existentes en JSON: {len(existing_ids)}')
    
    # Escanear PDFs generados
    print('\n📄 Escaneando PDFs generados...')
    pdf_files = list(GENERATED_DIR.rglob('*.pdf'))
    print(f'   {len(pdf_files)} PDFs encontrados')
    
    # Escanear imágenes
    print('\n📸 Escaneando imágenes...')
    imagenes_list = [f.name for f in IMAGENES_DIR.iterdir() if f.is_file()]
    print(f'   {len(imagenes_list)} imágenes encontradas')
    
    # Construir lista de IDs pendientes
    pendientes = set()
    for pdf in pdf_files:
        vid = pdf.stem.strip().upper()
        if vid not in existing_ids:
            parsed = parse_voucher_id(vid)
            if parsed:
                pendientes.add(vid)
    
    print(f'\n🔍 IDs pendientes de crear: {len(pendientes)}')
    
    if not pendientes:
        print('✅ No hay vales pendientes de crear.')
        return
    
    # Agrupar por periodo para saber en qué JSON guardar
    por_periodo = defaultdict(list)
    
    for vid in sorted(pendientes):
        parsed = parse_voucher_id(vid)
        if not parsed:
            continue
        
        # Buscar imágenes
        firma_imgs, comp_imgs = get_images_for_id(vid, imagenes_list)
        
        # Buscar PDFs
        pdfs = find_pdfs_for_id(vid)
        
        por_periodo[parsed['periodo']].append({
            **parsed,
            'firma_imgs': firma_imgs,
            'comp_imgs': comp_imgs,
            'pdfs': pdfs,
        })
    
    print(f'\n📁 Distribución por periodo:')
    for periodo, items in sorted(por_periodo.items()):
        print(f'   {periodo}: {len(items)} vales')
    
    if not WRITE_MODE:
        # Mostrar algunos ejemplos
        print('\n📋 Ejemplos de registros a crear:')
        count = 0
        for periodo, items in sorted(por_periodo.items()):
            for item in items[:3]:  # Mostrar max 3 por periodo
                count += 1
                if count > 10:
                    break
                print(f'\n  {item["id"]}')
                print(f'     Sucursal: {item["sucursal"]}')
                print(f'     Sheet: {item["sheet"]}')
                print(f'     Fila: {item["fila"]}')
                if item['firma_imgs']:
                    print(f'     ✅ Firma: {item["firma_imgs"][0]}')
                if item['comp_imgs']:
                    print(f'     ✅ Comprobante: {item["comp_imgs"][0]}')
                print(f'     📄 PDF: {item["pdfs"][0].name if item["pdfs"] else "No"}'  )
            if count >= 10:
                break
        print(f'\n   ... y {len(pendientes) - count} más')
    
    # Crear registros
    if WRITE_MODE:
        print('\n📝 Creando registros...')
        total_creados = 0
        
        for periodo, items in sorted(por_periodo.items()):
            año = periodo.split('-')[0] if periodo else '2026'
            ciclo_path = STORAGE_DIR / año / periodo / 'vouchers.json'
            
            # Cargar JSON existente o crear nuevo
            if ciclo_path.exists():
                with open(ciclo_path, encoding='utf-8') as f:
                    vouchers = json.load(f)
            else:
                vouchers = []
                ciclo_path.parent.mkdir(parents=True, exist_ok=True)
            
            # Asignar numVale secuencial
            max_num = 0
            for v in vouchers:
                try:
                    n = int(v.get('numVale', '0'))
                    max_num = max(max_num, n)
                except ValueError:
                    pass
            
            creados = 0
            for item in items:
                # Verificar que no exista ya (pudo haber sido creado entre tanto)
                if any(v.get('id', '').upper().strip() == item['id'] for v in vouchers):
                    continue
                
                max_num += 1
                
                # Fecha por defecto: 20 del mes (inicio del ciclo Flynet)
                fecha_default = f"{periodo}-20" if periodo else "2026-06-20"
                
                nuevo = {
                    'fila': item['fila'],
                    'sheet': item['sheet'],
                    'id': item['id'],
                    'fecha': fecha_default,
                    'entregado': item['sucursal'],  # Placeholder
                    'rubro': 'POR DEFINIR',
                    'concepto': 'RECUPERADO DE RESPALDO',
                    'numVale': str(max_num),
                    'monto': '0',
                    'sucursal': item['sucursal'].upper(),
                }
                
                # Asignar firma si existe imagen
                if item['firma_imgs']:
                    nuevo['firmado'] = True
                    nuevo['firmaUrl'] = item['firma_imgs'][0]
                    nuevo['timestamp'] = '2026-06-20T00:00:00.000Z'
                    nuevo['autorizadoPor'] = 'SISTEMA'
                else:
                    nuevo['firmado'] = False
                    nuevo['timestamp'] = '2026-07-06T00:00:00.000Z'
                
                # Asignar comprobante si existe
                if item['comp_imgs']:
                    nuevo['comprobanteUrl'] = item['comp_imgs'][0]
                
                # Asignar hasPdf si existe
                if item['pdfs']:
                    nuevo['hasPdf'] = True
                
                vouchers.append(nuevo)
                creados += 1
                print(f'  ✅ {item["id"]} creado')
            
            if creados > 0:
                with open(ciclo_path, 'w', encoding='utf-8') as f:
                    json.dump(vouchers, f, ensure_ascii=False, indent=2)
                print(f'   → {creados} registros añadidos a {ciclo_path.relative_to(BASE_DIR)}')
                total_creados += creados
        
        print(f'\n{"="*70}')
        print(f'✅ TOTAL: {total_creados} registros creados')
    else:
        print(f'\n💡 Ejecuta con --write para crear los registros:')
        print('   py scripts/reconstruir_vales.py --write')
    
    print('=' * 70)

if __name__ == '__main__':
    main()
