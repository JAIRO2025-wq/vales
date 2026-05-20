import base64
import hashlib
import json
import os
import re
import time
import zipfile
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from pdf_generator import create_voucher_pdf

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), 'generated')
os.makedirs(OUTPUT_DIR, exist_ok=True)

app = FastAPI(title='Vale PDF Generator')
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


def safe_filename(value: str) -> str:
    clean = re.sub(r'[^a-zA-Z0-9_.-]', '_', value or 'vale')
    return clean


def payload_hash(payload: dict) -> str:
    normalized = json.dumps(payload, sort_keys=True, ensure_ascii=False)
    return hashlib.sha256(normalized.encode('utf-8')).hexdigest()


def get_output_pdf_filename(params: dict, index: Optional[int] = None) -> str:
    if params.get('id'):
        file_base = safe_filename(params['id'])
    else:
        file_base = safe_filename(params.get('numero', 'vale'))
        if index is None:
            file_base = f"{file_base}-{int(time.time())}"
        else:
            file_base = f"{file_base}-{index}"
    return f"{file_base}.pdf"


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


def create_zip_file(file_paths: List[str], output_path: str) -> str:
    with zipfile.ZipFile(output_path, 'w', compression=zipfile.ZIP_DEFLATED) as zf:
        for file_path in file_paths:
            zf.write(file_path, arcname=os.path.basename(file_path))
    return output_path


@app.post('/generate-vale')
async def generate_vale(request: Request, payload: ValeRequest):
    params = payload.dict()
    file_name = get_output_pdf_filename(params)
    output_path = os.path.join(OUTPUT_DIR, file_name)
    params_hash = payload_hash(params)

    try:
        if not should_skip_generation(output_path, params_hash):
            create_voucher_pdf(params, output_path)
            write_payload_hash(output_path, params_hash)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f'Error generando PDF: {exc}')

    pdf_url = str(request.url_for('get_pdf', pdf_file_name=file_name))
    return JSONResponse({'pdf_url': pdf_url})


@app.post('/generate-vale-bulk')
async def generate_vale_bulk(request: Request, payload: List[ValeRequest]):
    if not payload:
        raise HTTPException(status_code=400, detail='No se recibieron datos para generar PDFs.')

    generated_files: List[str] = []

    for index, item in enumerate(payload, start=1):
        params = item.dict()
        file_name = get_output_pdf_filename(params, index)
        output_path = os.path.join(OUTPUT_DIR, file_name)
        params_hash = payload_hash(params)

        try:
            if not should_skip_generation(output_path, params_hash):
                create_voucher_pdf(params, output_path)
                write_payload_hash(output_path, params_hash)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f'Error generando PDF {file_name}: {exc}')

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


@app.get('/pdf/{pdf_file_name}')
async def get_pdf(pdf_file_name: str):
    file_path = os.path.join(OUTPUT_DIR, pdf_file_name)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail='PDF no encontrado')
    return FileResponse(file_path, media_type='application/pdf', filename=pdf_file_name)


@app.get('/zip/{zip_file_name}')
async def get_zip(zip_file_name: str):
    file_path = os.path.join(OUTPUT_DIR, zip_file_name)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail='ZIP no encontrado')
    return FileResponse(file_path, media_type='application/zip', filename=zip_file_name)


@app.get('/')
async def root():
    return {'message': 'Vale PDF Generator con FastAPI. Usa POST /generate-vale o POST /generate-vale-bulk'}
