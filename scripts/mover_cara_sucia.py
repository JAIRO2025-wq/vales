"""
Mueve los vales de CARA SUCIA al ciclo mensual correcto.
CARA SUCIA usa ciclo del 1ero al ultimo dia del mes, NO Flynet.
"""
import json, shutil
from pathlib import Path
from collections import defaultdict

BASE = Path(__file__).resolve().parent.parent
STORAGE = BASE / 'src' / 'data' / 'storage'

def get_mensual_cycle(fecha):
    """Para CARA SUCIA: el ciclo es el ano-mes de la fecha misma."""
    try:
        parts = fecha.split('-')
        y, m = int(parts[0]), int(parts[1])
        return f'{y}-{str(m).zfill(2)}'
    except:
        return None

print('=== MOVIENDO VALES DE CARA SUCIA A CICLO MENSUAL ===')

# Cargar todos los JSON
data_por_ciclo = {}
for jf in sorted(STORAGE.rglob('vouchers.json')):
    if '20226' in str(jf) or '8730' in str(jf):
        continue
    with open(jf, 'r', encoding='utf-8') as f:
        data_por_ciclo[str(jf)] = json.load(f)

movidos = 0
total_cs = 0

# Para cada archivo, revisar vales de CARA SUCIA
for jf_path, vouchers in data_por_ciclo.items():
    ciclo_actual = Path(jf_path).parent.name
    nuevos = []
    
    for v in vouchers:
        s = v.get('sucursal', '').upper().strip()
        if 'CARA SUCIA' not in s and 'CARA-SUCIA' not in s:
            nuevos.append(v)
            continue
        
        total_cs += 1
        fecha = v.get('fecha', '')
        ciclo_correcto = get_mensual_cycle(fecha)
        
        if not ciclo_correcto:
            nuevos.append(v)
            continue
        
        if ciclo_actual == ciclo_correcto:
            nuevos.append(v)  # ya esta en el ciclo correcto
        else:
            # Mover al ciclo correcto
            anio = ciclo_correcto.split('-')[0]
            destino_path = STORAGE / anio / ciclo_correcto / 'vouchers.json'
            destino_path.parent.mkdir(parents=True, exist_ok=True)
            
            if str(destino_path) not in data_por_ciclo:
                data_por_ciclo[str(destino_path)] = []
            
            data_por_ciclo[str(destino_path)].append(v)
            movidos += 1
            print(f'  [MOV] {v["id"]} (fecha: {fecha}) --> {ciclo_actual} -> {ciclo_correcto}')
    
    data_por_ciclo[jf_path] = nuevos  # actualizar el original sin los movidos

# Guardar todos los archivos modificados
for jf_path, vouchers in data_por_ciclo.items():
    with open(jf_path, 'w', encoding='utf-8') as f:
        json.dump(vouchers, f, ensure_ascii=False, indent=2)

print(f'\nTotal vales CARA SUCIA: {total_cs}')
print(f'Movidos a ciclo correcto: {movidos}')
print('(Los que ya estaban en el ciclo correcto se quedaron)')
