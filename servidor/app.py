import base64
import hashlib
import json
import os
import re
import time
import zipfile
import shutil
from typing import List, Optional
from fastapi import FastAPI, HTTPException, Request, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel
from pdf_generator import create_voucher_pdf

# ============================================================
# CONFIGURACIÓN
# ============================================================
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), 'generated')
IMAGES_DIR = os.path.join(os.path.dirname(__file__), 'storage', 'imagenes')
os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(IMAGES_DIR, exist_ok=True)

app = FastAPI(title='Vale PDF Generator')

# CORS más permisivo
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=False,
    allow_methods=['*'],
    allow_headers=['*'],
    expose_headers=['*'],
)

# ============================================================
# MODELOS
# ============================================================
class ValeRequest(BaseModel):
    numero: Optional[str] = '0001'
    fecha: Optional[str] = ''
    cajaChica: Optional[bool] = False
    clientes: Optional[bool] = False
    instalaciones: Optional[bool] = False
    otrosGastos: Optional[bool] = False
    entregadoA: Optional[str] = 'Nombre del trabajador'
    id: Optional[str] = None
    laSumaDe: Optional[str] = 'Mil pesos 00/100'
    concepto: Optional[str] = 'Descripción del concepto'
    montoTotal: Optional[str] = '1000.00'
    reintegro: Optional[str] = '0.00'
    solicitante: Optional[str] = '______________________'
    autoriza: Optional[str] = '______________________'
    firmaSolicitante: Optional[str] = None
    comprobante: Optional[str] = None
    firmaAutorizador: Optional[str] = None
    # Auditoría
    fechaGeneracion: Optional[str] = None
    fechaFirma: Optional[str] = None
    dispositivoFirma: Optional[str] = None
    tieneComprobante: Optional[bool] = False
    comprobanteTimestamp: Optional[str] = None
    tipoAutorizador: Optional[str] = None
    sucursal: Optional[str] = None

# ============================================================
# FUNCIONES AUXILIARES
# ============================================================
def safe_filename(value: str) -> str:
    clean = re.sub(r'[^a-zA-Z0-9_.-]', '_', value or 'vale')
    return clean

def payload_hash(payload: dict) -> str:
    normalized = json.dumps(payload, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(normalized.encode('utf-8')).hexdigest()

def get_image_subpath(vale_id: str, suffix: str) -> str:
    """
    Construye la ruta relativa jerárquica para una imagen:
      {year}/{ciclo}/{sucursal}/{caja}/{filename}.png
    
    Extrae los componentes del vale_id: SUCURSAL-YYYY-MM-WX-CATEGORIA-FXX
    El ciclo Flynet va del 20 de un mes al 19 del siguiente.
    Usamos el día 25 del mes del ID para garantizar que siempre cae
    en el ciclo que corresponde al mes (nunca en el anterior).
    """
    match = re.match(r'^(.+)-(\d{4})-(\d{2})-W\d-(.+)-F\d+$', vale_id or '')
    timestamp = int(time.time())
    
    if match:
        sucursal = safe_filename(match.group(1))
        year = match.group(2)
        month_num = int(match.group(3))
        caja_raw = safe_filename(match.group(4))
        
        # Ciclo Flynet: con día 25, el ciclo siempre es {year}-{month:02d}
        ciclo_id = f"{year}-{month_num:02d}"
        
        # Normalizar nombre de caja
        caja_upper = caja_raw.upper()
        if 'CHICA' in caja_upper or caja_upper == 'GENERAL':
            caja = 'CAJA-CHICA'
        elif 'CLIENTES' in caja_upper:
            caja = 'CLIENTES'
        elif 'INSTALACIONES' in caja_upper:
            caja = 'INSTALACIONES'
        elif 'OTROS' in caja_upper:
            caja = 'OTROS-GASTOS'
        else:
            caja = caja_upper.replace(' ', '-')
        
        filename = f"{safe_filename(vale_id)}_{suffix}_{timestamp}.png"
        return os.path.join(year, ciclo_id, sucursal, caja, filename)
    
    # Fallback: sin ID válido, guardar plano
    filename = f"{safe_filename(vale_id or 'desconocido')}_{suffix}_{timestamp}.png"
    return filename

def get_output_pdf_path(params: dict, index: Optional[int] = None) -> str:
    """
    Genera la ruta relativa del PDF con estructura de subcarpetas:
    generated/{año}/{ciclo}/{sucursal}/{caja}/{filename}.pdf
    """
    # ── Base filename ──
    numero = (params.get('numero') or '').strip()
    if numero and numero != '---':
        file_base = safe_filename(numero)
    elif params.get('id'):
        file_base = safe_filename(params['id'])
    else:
        file_base = safe_filename(numero or 'vale')
        if index is None:
            file_base = f"{file_base}-{int(time.time())}"
        else:
            file_base = f"{file_base}-{index}"
    filename = f"{file_base}.pdf"

    # ── Componentes de carpeta ──
    año = "SIN-ANO"
    ciclo_id = "SIN-CICLO"
    sucursal = "DESCONOCIDO"
    caja = "GENERAL"

    id_value = params.get('id', '')

    # 1. Extraer año, mes, sucursal desde el ID: SUCURSAL-YYYY-MM-W#-TIPO-F#
    if id_value:
        m = re.match(r'^(.+)-(\d{4})-(\d{2})-W\d-(.+)-F\d+$', id_value)
        if m:
            sucursal = safe_filename(m.group(1))
            año = m.group(2)
            caja = safe_filename(m.group(4))

    # 2. Extraer año desde fecha si está disponible (más fiable)
    if params.get('fecha'):
        fm = re.match(r'(\d{4})', str(params['fecha']))
        if fm:
            año = fm.group(1)

    # 3. Usar ciclo explícito si se envió (más fiable que el año-mes derivado)
    if params.get('ciclo'):
        ciclo_id = safe_filename(params['ciclo'])
    elif params.get('fecha'):
        fm2 = re.match(r'(\d{4})-(\d{2})-(\d{2})', str(params['fecha']))
        if fm2:
            y, m, d = int(fm2.group(1)), int(fm2.group(2)), int(fm2.group(3))
            if d < 20:
                if m == 1:
                    ciclo_id = f"{y-1}-12"
                else:
                    ciclo_id = f"{y}-{m-1:02d}"
            else:
                ciclo_id = f"{y}-{m:02d}"

    # 4. Normalizar caja desde los booleanos (nombres limpios para carpetas)
    if params.get('cajaChica'):
        caja = "CAJA-CHICA"
    elif params.get('clientes'):
        caja = "CLIENTES"
    elif params.get('instalaciones'):
        caja = "INSTALACIONES"
    elif params.get('otrosGastos'):
        caja = "OTROS-GASTOS"
    caja = caja.upper().replace(' ', '-')

    return os.path.join(año, ciclo_id, sucursal, caja, filename)


def get_hash_path(output_path: str) -> str:
    return f"{output_path}.hash"

def should_skip_generation(output_path: str, params_hash: str) -> bool:
    hash_path = get_hash_path(output_path)
    if not os.path.exists(output_path) or not os.path.exists(hash_path):
        return False
    try:
        with open(hash_path, 'r', encoding='utf-8') as hash_file:
            return hash_file.read().strip() == params_hash
    except Exception:
        return False

def write_payload_hash(output_path: str, params_hash: str) -> None:
    hash_path = get_hash_path(output_path)
    with open(hash_path, 'w', encoding='utf-8') as hash_file:
        hash_file.write(params_hash)

# ============================================================
# ENDPOINTS PARA SUBIR IMÁGENES (estructura jerárquica)
# ============================================================
@app.post('/upload-firma/{vale_id}')
async def upload_firma(vale_id: str, file: UploadFile = File(...)):
    """Sube una imagen de firma al servidor con estructura jerárquica."""
    try:
        print(f"[APP] Recibiendo firma para vale: {vale_id}")
        print(f"[APP]   Archivo: {file.filename}, Tipo: {file.content_type}")
        
        if not file.content_type.startswith('image/'):
            raise HTTPException(400, "Solo se permiten imágenes")
        
        # Ruta jerárquica: {year}/{ciclo}/{sucursal}/{caja}/{filename}.png
        relative_path = get_image_subpath(vale_id, 'firma')
        filepath = os.path.join(IMAGES_DIR, relative_path)
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        
        with open(filepath, 'wb') as f:
            shutil.copyfileobj(file.file, f)
        
        print(f"[APP] Firma guardada en: {filepath}")
        
        # Devolver ruta jerárquica (relativa a IMAGES_DIR)
        image_url = f"/storage/imagenes/{relative_path.replace(os.sep, '/')}"
        return JSONResponse({
            'success': True,
            'image_path': filepath,
            'image_url': image_url
        })
    except Exception as e:
        print(f"[APP] Error subiendo firma: {e}")
        raise HTTPException(500, f"Error subiendo firma: {e}")

@app.post('/upload-comprobante/{vale_id}')
async def upload_comprobante(vale_id: str, file: UploadFile = File(...)):
    """Sube una imagen de comprobante al servidor con estructura jerárquica."""
    try:
        print(f"[APP] Recibiendo comprobante para vale: {vale_id}")
        print(f"[APP]   Archivo: {file.filename}, Tipo: {file.content_type}")
        
        if not file.content_type.startswith('image/'):
            raise HTTPException(400, "Solo se permiten imágenes")
        
        # Ruta jerárquica: {year}/{ciclo}/{sucursal}/{caja}/{filename}.png
        relative_path = get_image_subpath(vale_id, 'comprobante')
        filepath = os.path.join(IMAGES_DIR, relative_path)
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        
        with open(filepath, 'wb') as f:
            shutil.copyfileobj(file.file, f)
        
        print(f"[APP] Comprobante guardado en: {filepath}")
        
        image_url = f"/storage/imagenes/{relative_path.replace(os.sep, '/')}"
        return JSONResponse({
            'success': True,
            'image_path': filepath,
            'image_url': image_url
        })
    except Exception as e:
        print(f"[APP] Error subiendo comprobante: {e}")
        raise HTTPException(500, f"Error subiendo comprobante: {e}")

# ============================================================
# SERVIR IMÁGENES (con retrocompatibilidad)
# ============================================================
@app.get('/storage/imagenes/{file_path:path}')
async def get_imagen(file_path: str):
    """
    Sirve imágenes almacenadas en el servidor.
    
    Soporta tanto la nueva estructura jerárquica:
      /storage/imagenes/2026/2026-06/SAN-MIGUEL/CAJACHICA/xxx.png
    Como la estructura plana antigua (retrocompatibilidad):
      /storage/imagenes/xxx.png
    """
    # 1. Intentar ruta jerárquica (nueva estructura)
    full_path = os.path.join(IMAGES_DIR, file_path)
    if os.path.exists(full_path):
        return FileResponse(full_path, media_type='image/png')
    
    # 2. Retrocompatibilidad: buscar por nombre de archivo en estructura plana
    filename = os.path.basename(file_path)
    flat_path = os.path.join(IMAGES_DIR, filename)
    if os.path.exists(flat_path):
        print(f'[APP] Retrocompatibilidad: sirviendo {flat_path}')
        return FileResponse(flat_path, media_type='image/png')
    
    # 3. Búsqueda recursiva como último recurso
    for root, dirs, files in os.walk(IMAGES_DIR):
        if filename in files:
            found = os.path.join(root, filename)
            print(f'[APP] Encontrado por búsqueda: {found}')
            return FileResponse(found, media_type='image/png')
    
    raise HTTPException(404, "Imagen no encontrada")

# ============================================================
# ENDPOINTS PRINCIPALES (ya existentes)
# ============================================================
def _resolve_image_path(image_value: Optional[str]) -> Optional[str]:
    """
    Resuelve rutas de imágenes almacenadas en el servidor Python.
    
    Soporta estructura jerárquica (nueva) y plana (legacy).
    """
    if not image_value:
        return None

    # Si ya es una ruta local absoluta que existe, devolverla tal cual
    if os.path.exists(image_value):
        return image_value

    # Si es una ruta de nuestro propio servidor (/storage/imagenes/...)
    if image_value.startswith('/storage/imagenes/'):
        # Extraer la ruta relativa después de /storage/imagenes/
        rel_path = image_value[len('/storage/imagenes/'):]
        
        # 1. Intentar ruta jerárquica
        local_path = os.path.join(IMAGES_DIR, rel_path)
        if os.path.exists(local_path):
            print(f'[APP] Ruta resuelta (jerárquica): {image_value} -> {local_path}')
            return local_path
        
        # 2. Retrocompatibilidad: buscar por nombre en carpeta plana
        filename = os.path.basename(rel_path)
        flat_path = os.path.join(IMAGES_DIR, filename)
        if os.path.exists(flat_path):
            print(f'[APP] Ruta resuelta (plana legacy): {image_value} -> {flat_path}')
            return flat_path
        
        # 3. Búsqueda recursiva
        for root, dirs, files in os.walk(IMAGES_DIR):
            if filename in files:
                found = os.path.join(root, filename)
                print(f'[APP] Ruta resuelta (búsqueda): {image_value} -> {found}')
                return found
        
        print(f'[APP] ADVERTENCIA: No se encontró imagen para {image_value}')
        return None

    # Si es una URL HTTP/HTTPS, devolverla para que pdf_generator la descargue
    if image_value.startswith(('http://', 'https://')):
        return image_value

    # Si es base64 data URI, devolverla para que pdf_generator la decodifique
    if image_value.startswith('data:') or ',' in image_value:
        return image_value

    # Fallback: devolver el valor original (pdf_generator intentará manejarlo)
    return image_value


@app.post('/generate-vale')
async def generate_vale(request: Request, payload: ValeRequest):
    params = payload.dict()

    firma_original = params.get('firmaSolicitante')
    comprobante_original = params.get('comprobante')
    firma_autorizador_original = params.get('firmaAutorizador')
    params['firmaSolicitante'] = _resolve_image_path(firma_original)
    params['comprobante'] = _resolve_image_path(comprobante_original)
    params['firmaAutorizador'] = _resolve_image_path(firma_autorizador_original)

    print(f'[APP] Generando PDF para vale {params.get("id", "desconocido")}')
    print(f'[APP]   Firma:   orig="{firma_original}" -> resuelto="{params["firmaSolicitante"]}"')
    print(f'[APP]   Comprobante: orig="{comprobante_original}" -> resuelto="{params["comprobante"]}"')
    print(f'[APP]   Firma Autorizador: orig="{firma_autorizador_original}" -> resuelto="{params["firmaAutorizador"]}"')

    relative_path = get_output_pdf_path(params)
    output_path = os.path.join(OUTPUT_DIR, relative_path)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    params_hash = payload_hash(params)

    try:
        if not should_skip_generation(output_path, params_hash):
            create_voucher_pdf(params, output_path)
            write_payload_hash(output_path, params_hash)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f'Error generando PDF: {exc}')

    base = str(request.base_url).rstrip('/')
    pdf_url = f"{base}/pdf/{relative_path.replace(os.sep, '/')}"
    return JSONResponse({'pdf_url': pdf_url})

@app.post('/generate-vale-bulk')
async def generate_vale_bulk(request: Request, payload: List[ValeRequest]):
    if not payload:
        raise HTTPException(status_code=400, detail='No se recibieron datos para generar PDFs.')

    generated_files: List[str] = []

    for index, item in enumerate(payload, start=1):
        params = item.dict()

        params['firmaSolicitante'] = _resolve_image_path(params.get('firmaSolicitante'))
        params['comprobante'] = _resolve_image_path(params.get('comprobante'))

        relative_path = get_output_pdf_path(params, index)
        output_path = os.path.join(OUTPUT_DIR, relative_path)
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        params_hash = payload_hash(params)

        try:
            if not should_skip_generation(output_path, params_hash):
                create_voucher_pdf(params, output_path)
                write_payload_hash(output_path, params_hash)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f'Error generando PDF {relative_path}: {exc}')

        if output_path not in generated_files:
            generated_files.append(output_path)

    zip_name = f"vales-{int(time.time())}.zip"
    zip_path = os.path.join(OUTPUT_DIR, zip_name)
    try:
        create_zip_file(generated_files, zip_path)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f'Error generando ZIP: {exc}')

    zip_url = str(request.url_for('get_zip', zip_file_name=zip_name))
    return JSONResponse({'zip_url': zip_url})

def create_zip_file(file_paths: List[str], output_path: str) -> str:
    with zipfile.ZipFile(output_path, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
        for file_path in file_paths:
            arcname = os.path.relpath(file_path, OUTPUT_DIR)
            zf.write(file_path, arcname=arcname)
    return output_path

@app.get('/pdf/{pdf_file_name:path}')
async def get_pdf(pdf_file_name: str):
    file_path = os.path.join(OUTPUT_DIR, pdf_file_name)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail='PDF no encontrado')
    return FileResponse(file_path, media_type='application/pdf')

@app.get('/zip/{zip_file_name}')
async def get_zip(zip_file_name: str):
    file_path = os.path.join(OUTPUT_DIR, zip_file_name)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail='ZIP no encontrado')
    return FileResponse(file_path, media_type='application/zip', filename=zip_file_name)

@app.get('/')
async def root():
    return {'message': 'Vale PDF Generator con FastAPI. Usa POST /generate-vale o POST /generate-vale-bulk'}
