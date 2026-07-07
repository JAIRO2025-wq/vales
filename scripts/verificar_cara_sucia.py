import json
from pathlib import Path

STORAGE = Path(__file__).resolve().parent.parent / 'src' / 'data' / 'storage'

print('=== VALES DE CARA SUCIA ===')
for jf in sorted(STORAGE.rglob('vouchers.json')):
    if '20226' in str(jf) or '8730' in str(jf):
        continue
    ciclo = jf.parent.name
    with open(jf) as f:
        data = json.load(f)
    for v in data:
        s = v.get('sucursal', '').upper().strip()
        if 'CARA SUCIA' in s or 'CARA-SUCIA' in s:
            print(f'  {ciclo} -> {v["id"]} | fecha: {v.get("fecha","?")}')
