"""
Procesa links de Google Sheets para actualizar y crear registros en vouchers.json.
Uso: py scripts/actualizar_desde_links.py [--write]
"""
import json, re, sys, urllib.parse
from pathlib import Path
from collections import defaultdict

BASE = Path(__file__).resolve().parent.parent
STORAGE = BASE / 'src' / 'data' / 'storage'
IMAGENES = BASE / 'servidor' / 'storage' / 'imagenes'
WRITE = '--write' in sys.argv

def parse_links(filepath):
    items = []
    with open(filepath, 'r', encoding='utf-8') as f:
        text = f.read()
    for url in re.findall(r'https?://[^\s)\]]+', text):
        p = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
        p = {k: v[0] for k, v in p.items()}
        if 'id' in p:
            items.append(p)
    return items

def norm(vid):
    return vid.strip().upper().replace(' ', '-').replace('\u00a0', '-')

def get_images(vid):
    """Busca imagenes de firma y comprobante para un ID."""
    firma, comp = [], []
    variants = [vid, vid.replace('-', ' ')]
    if not IMAGENES.exists():
        return firma, comp
    for img in IMAGENES.iterdir():
        if not img.is_file():
            continue
        name = img.name
        for v in variants:
            vn = v.upper().replace('-', ' ').replace('\u00a0', ' ')
            inm = name.upper().replace('-', ' ')
            if vn in inm:
                if 'FIRMA' in inm:
                    firma.append(f'/storage/imagenes/{name}')
                elif 'COMPROBANTE' in inm:
                    comp.append(f'/storage/imagenes/{name}')
                break
    return firma, comp

def get_pdf(vid):
    pdfs = list((BASE / 'servidor' / 'generated').rglob(f'*{vid}*.pdf'))
    pdfs += list((BASE / 'servidor' / 'generated').rglob(f'*{vid.replace("-", " ")}*.pdf'))
    return len(pdfs) > 0

print('='*60)
print(f'ACTUALIZACION/CREACION DESDE LINKS [{"ESCRITURA" if WRITE else "VISTA PREVIA"}]')
print('='*60)

items = parse_links(BASE / 'scripts' / 'links.txt')
print(f'\nLinks procesados: {len(items)}')
if not items:
    sys.exit(0)

# Indice de IDs existentes en JSON
json_ids = {}
json_files = {}
for jf in sorted(STORAGE.rglob('vouchers.json')):
    if '20226' in str(jf) or '8730' in str(jf):
        continue
    with open(jf, 'r', encoding='utf-8') as f:
        data = json.load(f)
    json_files[str(jf)] = data
    for v in data:
        vid = norm(v.get('id', ''))
        if vid:
            json_ids[vid] = jf

actualizados = 0
creados = 0
existentes = 0

for params in items:
    vid = norm(params.get('id', ''))
    if not vid:
        continue
    
    # Extraer periodo del ID (YYYY-MM)
    period_m = re.search(r'-(\d{4}-\d{2})-', vid)
    periodo = period_m.group(1) if period_m else '2026-06'
    anio = periodo.split('-')[0]
    
    if vid in json_ids:
        # ACTUALIZAR registro existente
        jf = json_ids[vid]
        data = json_files[str(jf)]
        for v in data:
            if norm(v.get('id', '')) == vid:
                changes = []
                for param, field in [
                    ('fila','fila'),('sheet','sheet'),('numVale','numVale'),
                    ('entregado','entregado'),('monto','monto'),('sucursal','sucursal'),
                    ('fecha','fecha'),('rubro','rubro'),('concepto','concepto')
                ]:
                    val = params.get(param)
                    if val and str(v.get(field,'')).strip() != str(val).strip():
                        v[field] = val
                        changes.append(field)
                if changes:
                    actualizados += 1
                    if WRITE:
                        with open(jf, 'w', encoding='utf-8') as f:
                            json.dump(data, f, ensure_ascii=False, indent=2)
                    print(f'  [ACT] {vid} -> {", ".join(changes[:4])}')
                else:
                    existentes += 1
                break
    else:
        # CREAR nuevo registro
        firma_imgs, comp_imgs = get_images(vid)
        has_pdf = get_pdf(vid)
        
        nuevo = {
            'fila': params.get('fila', '0'),
            'sheet': params.get('sheet', '').strip(),
            'id': vid,
            'fecha': params.get('fecha', f'{periodo}-20'),
            'entregado': params.get('entregado', 'PENDIENTE'),
            'rubro': params.get('rubro', 'POR DEFINIR'),
            'concepto': params.get('concepto', params.get('rubro', 'POR DEFINIR')),
            'numVale': params.get('numVale', '0'),
            'monto': params.get('monto', '0'),
            'sucursal': params.get('sucursal', '').upper(),
            'firmado': len(firma_imgs) > 0,
            'timestamp': '2026-07-06T00:00:00.000Z',
        }
        
        if firma_imgs:
            nuevo['firmaUrl'] = firma_imgs[0]
            nuevo['autorizadoPor'] = 'ADMIN'
        if comp_imgs:
            nuevo['comprobanteUrl'] = comp_imgs[0]
        if has_pdf:
            nuevo['hasPdf'] = True
        
        # Determinar el ciclo correcto (Flynet: day < 20 -> mes anterior)
        fecha = nuevo['fecha']
        try:
            parts = fecha.split('-')
            y, m, d = int(parts[0]), int(parts[1]), int(parts[2])
            if d < 20:
                if m == 1:
                    cycle_id = f'{y-1}-12'
                else:
                    cycle_id = f'{y}-{str(m-1).zfill(2)}'
            else:
                cycle_id = f'{y}-{str(m).zfill(2)}'
        except:
            cycle_id = periodo
        
        # Buscar o crear archivo de ciclo
        ciclo_path = STORAGE / anio / cycle_id / 'vouchers.json'
        
        if str(ciclo_path) in json_files:
            data = json_files[str(ciclo_path)]
        else:
            if ciclo_path.exists():
                with open(ciclo_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
            else:
                data = []
            json_files[str(ciclo_path)] = data
        
        data.append(nuevo)
        creados += 1
        print(f'  [NEW] {vid} -> ciclo {cycle_id}')
        
        if WRITE:
            ciclo_path.parent.mkdir(parents=True, exist_ok=True)
            with open(ciclo_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

print(f'\n{"="*60}')
print(f'Actualizados: {actualizados}')
print(f'Creados: {creados}')
print(f'Ya estaban OK: {existentes}')
if not WRITE and (actualizados > 0 or creados > 0):
    print('\nEjecuta: py scripts/actualizar_desde_links.py --write')
print('='*60)
