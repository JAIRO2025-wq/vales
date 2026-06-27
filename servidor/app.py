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
    allow_credentials=True,
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

# ============================================================
# FUNCIONES AUXILIARES
# ============================================================
def safe_filename(value: str) -> str:
    clean = re.sub(r'[^a-zA-Z0-9_.-]', '_', value or 'vale')
    return clean

def payload_hash(payload: dict) -> str:
    normalized = json.dumps(payload, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(normalized.encode('utf-8')).hexdigest()

def get_output_pdf_path(params: dict, index: Optional[int] = None) -> str:
    """
    Genera la ruta relativa del PDF con estructura de subcarpetas:
    generated/{sucursal}/{año-mes}/{tipo_gasto}/{filename}.pdf

    Extrae los componentes del ID (ej. SAN-MIGUEL-2026-06-W2-OTROSGASTOS-F6)
    o de los campos fecha y booleanos del payload.
    """
    # ── Base filename ──
    if params.get('id'):
        file_base = safe_filename(params['id'])
    else:
        file_base = safe_filename(params.get('numero', 'vale'))
        if index is None:
            file_base = f"{file_base}-{int(time.time())}"
        else:
            file_base = f"{file_base}-{index}"
    filename = f"{file_base}.pdf"

    # ── Componentes de carpeta (valores por defecto) ──
    sucursal = "DESCONOCIDO"
    año_mes = "SIN_FECHA"
    tipo_gasto = "GENERAL"

    id_value = params.get('id', '')

    # 1. Extraer del ID: SUCURSAL-YYYY-MM-W#-TIPO-F#
    if id_value:
        m = re.match(r'^(.+)-(\d{4})-(\d{2})-W\d-(.+)-F\d+$', id_value)
        if m:
            sucursal = safe_filename(m.group(1))
            año_mes = f"{m.group(2)}-{m.group(3)}"
            tipo_gasto = safe_filename(m.group(4))

    # 2. Sobrescribir año-mes desde el campo fecha si está disponible
    if params.get('fecha'):
        fm = re.match(r'(\d{4}-\d{2})', params['fecha'])
        if fm:
            año_mes = fm.group(1)

    # 3. Determinar tipo de gasto desde los booleanos (más fiable)
    if params.get('cajaChica'):
        tipo_gasto = "CAJACHICA"
    elif params.get('clientes'):
        tipo_gasto = "CLIENTES"
    elif params.get('instalaciones'):
        tipo_gasto = "INSTALACIONES"
    elif params.get('otrosGastos'):
        tipo_gasto = "OTROSGASTOS"

    return os.path.join(sucursal, año_mes, tipo_gasto, filename)


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
# NUEVOS ENDPOINTS PARA SUBIR IMÁGENES
# ============================================================
@app.post('/upload-firma/{vale_id}')
async def upload_firma(vale_id: str, file: UploadFile = File(...)):
    """Sube una imagen de firma directamente al servidor."""
    try:
        print(f"📸 Recibiendo firma para vale: {vale_id}")
        print(f"   Archivo: {file.filename}, Tipo: {file.content_type}")
        
        # Validar tipo de archivo
        if not file.content_type.startswith('image/'):
            raise HTTPException(400, "Solo se permiten imágenes")
        
        # Generar nombre único
        timestamp = int(time.time())
        filename = f"{vale_id}_firma_{timestamp}.png"
        filepath = os.path.join(IMAGES_DIR, filename)
        
        # Guardar archivo
        with open(filepath, 'wb') as f:
            shutil.copyfileobj(file.file, f)
        
        print(f"✅ Firma guardada en: {filepath}")
        
        return JSONResponse({
            'success': True,
            'image_path': filepath,
            'image_url': f"/storage/imagenes/{filename}"
        })
    except Exception as e:
        print(f"❌ Error subiendo firma: {e}")
        raise HTTPException(500, f"Error subiendo firma: {e}")

@app.post('/upload-comprobante/{vale_id}')
async def upload_comprobante(vale_id: str, file: UploadFile = File(...)):
    """Sube una imagen de comprobante directamente al servidor."""
    try:
        print(f"📸 Recibiendo comprobante para vale: {vale_id}")
        print(f"   Archivo: {file.filename}, Tipo: {file.content_type}")
        
        if not file.content_type.startswith('image/'):
            raise HTTPException(400, "Solo se permiten imágenes")
        
        timestamp = int(time.time())
        filename = f"{vale_id}_comprobante_{timestamp}.png"
        filepath = os.path.join(IMAGES_DIR, filename)
        
        with open(filepath, 'wb') as f:
            shutil.copyfileobj(file.file, f)
        
        print(f"✅ Comprobante guardado en: {filepath}")
        
        return JSONResponse({
            'success': True,
            'image_path': filepath,
            'image_url': f"/storage/imagenes/{filename}"
        })
    except Exception as e:
        print(f"❌ Error subiendo comprobante: {e}")
        raise HTTPException(500, f"Error subiendo comprobante: {e}")

@app.get('/storage/imagenes/{filename}')
async def get_imagen(filename: str):
    """Sirve imágenes almacenadas en el servidor."""
    filepath = os.path.join(IMAGES_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(404, "Imagen no encontrada")
    return FileResponse(filepath, media_type='image/png')

# ============================================================
# ENDPOINTS PRINCIPALES (ya existentes)
# ============================================================
def _resolve_image_path(image_value: Optional[str]) -> Optional[str]:
    """
    Resuelve rutas de imágenes almacenadas en el servidor Python.

    El frontend guarda rutas como "/storage/imagenes/xxx.png" (URL del servidor).
    Esta función convierte esas URLs a rutas reales del sistema de archivos
    para que el generador PDF pueda leer los archivos directamente.
    """
    if not image_value:
        return None

    # Si ya es una ruta local absoluta que existe, devolverla tal cual
    if os.path.exists(image_value):
        return image_value

    # Si es una ruta de nuestro propio servidor (/storage/imagenes/...)
    # convertirla a la ruta real en disco
    if image_value.startswith('/storage/imagenes/'):
        filename = os.path.basename(image_value)
        local_path = os.path.join(IMAGES_DIR, filename)
        if os.path.exists(local_path):
            print(f'[APP] Ruta resuelta: {image_value} -> {local_path}')
            return local_path
        else:
            print(f'[APP] ADVERTENCIA: No se encontró {local_path} para {image_value}')
            # Intentar buscar el archivo en IMAGES_DIR por nombre
            for f in os.listdir(IMAGES_DIR):
                if filename in f:
                    fallback = os.path.join(IMAGES_DIR, f)
                    print(f'[APP] Fallback encontrado: {fallback}')
                    return fallback
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

    # ===== RESOLVER RUTAS DE IMÁGENES =====
    # El frontend envía rutas como "/storage/imagenes/xxx.png" (URL del servidor).
    # Las convertimos a rutas reales del sistema de archivos ANTES de generar el PDF
    # para que el generador pueda leer los archivos directamente.
    #
    # Esto resuelve el bug: el PDF se generaba sin firma ni comprobante porque
    # las rutas enviadas por el frontend no correspondían a rutas válidas del sistema.
    #
    # IMPORTANTE: No guardamos base64 en el JSON, solo rutas.
    # El servidor es lo suficientemente inteligente para resolverlas.
    firma_original = params.get('firmaSolicitante')
    comprobante_original = params.get('comprobante')
    params['firmaSolicitante'] = _resolve_image_path(firma_original)
    params['comprobante'] = _resolve_image_path(comprobante_original)

    print(f'[APP] Generando PDF para vale {params.get("id", "desconocido")}')
    print(f'[APP]   Firma:   orig="{firma_original}" -> resuelto="{params["firmaSolicitante"]}"')
    print(f'[APP]   Comprobante: orig="{comprobante_original}" -> resuelto="{params["comprobante"]}"')

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

    # Construir URL manualmente para preservar slashes en la ruta
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

        # Resolver rutas de imágenes igual que en generate-vale individual
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
            # Preservar la estructura relativa dentro del ZIP
            arcname = os.path.relpath(file_path, OUTPUT_DIR)
            zf.write(file_path, arcname=arcname)
    return output_path

@app.get('/pdf/{pdf_file_name:path}')
async def get_pdf(pdf_file_name: str):
    file_path = os.path.join(OUTPUT_DIR, pdf_file_name)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail='PDF no encontrado')
    # Usar solo el nombre base para el filename de descarga
    download_name = os.path.basename(pdf_file_name)
    return FileResponse(file_path, media_type='application/pdf', filename=download_name)

@app.get('/zip/{zip_file_name}')
async def get_zip(zip_file_name: str):
    file_path = os.path.join(OUTPUT_DIR, zip_file_name)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail='ZIP no encontrado')
    return FileResponse(file_path, media_type='application/zip', filename=zip_file_name)

@app.get('/')
async def root():
    return {'message': 'Vale PDF Generator con FastAPI. Usa POST /generate-vale o POST /generate-vale-bulk'}