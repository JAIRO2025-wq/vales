import base64
import io
import urllib.request
from io import BytesIO
from pathlib import Path
from PIL import Image
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib.colors import black
from reportlab.lib.utils import ImageReader

PAGE_WIDTH, PAGE_HEIGHT = letter
MARGIN = 40
LEFT = MARGIN
RIGHT = PAGE_WIDTH - MARGIN
WIDTH = PAGE_WIDTH - (MARGIN * 2)

def draw_line(c, x1, y1, x2, y2, width=0.8):
    c.setLineWidth(width)
    c.setStrokeColor(black)
    c.line(x1, y1, x2, y2)

def draw_field(c, label, x, y, total_width, value='', bold_value=True, suffix=''):
    """Dibuja un campo ajustando el rectángulo al espacio disponible de forma exacta."""
    c.setFont('Helvetica', 9)
    c.drawString(x, y, label)
    
    label_width = c.stringWidth(label, 'Helvetica', 9)
    rect_x = x + label_width + 5
    rect_y = y - 4
    
    if suffix:
        suffix_width = c.stringWidth(suffix, 'Helvetica', 8)
        rect_width = total_width - label_width - 5 - suffix_width - 5
    else:
        rect_width = total_width - label_width - 5

    c.setLineWidth(0.8)
    c.rect(rect_x, rect_y, rect_width, 16)

    if value:
        c.setFont('Helvetica-Bold' if bold_value else 'Helvetica', 9)
        c.drawString(rect_x + 4, rect_y + 4, str(value))
        
    if suffix:
        c.setFont('Helvetica', 8)
        c.drawString(rect_x + rect_width + 5, y, suffix)

def draw_checkbox(c, x, y, label, checked=False):
    """Dibuja un checkbox alineado verticalmente con el texto"""
    size = 10
    c.setLineWidth(0.8)
    c.rect(x, y - 1, size, size)

    c.setFont('Helvetica', 9)
    c.drawString(x + size + 5, y, label)

    if checked:
        c.setLineWidth(1.5)
        c.line(x + 2, y + 3, x + size / 2.5, y - 1)
        c.line(x + size / 2.5, y - 1, x + size - 1, y + size - 1)

# ============================================================
# DIRECTORIO DE IMÁGENES (relativo a este archivo)
# ============================================================
# El servidor Python guarda las imágenes en servidor/storage/imagenes/
# pdf_generator.py está en servidor/, así que derivamos la ruta:
PDF_DIR = Path(__file__).parent  # servidor/
IMAGES_DIR = PDF_DIR / 'storage' / 'imagenes'


def _resolve_storage_path(image_value):
    """
    Intenta resolver una ruta /storage/imagenes/... a una ruta local real.
    Útil como fallback por si la resolución no se hizo en app.py.
    """
    if not isinstance(image_value, str):
        return image_value

    # Si la ruta empieza con /storage/imagenes/ (formato URL del servidor Python)
    if image_value.startswith('/storage/imagenes/'):
        filename = Path(image_value).name
        local_path = IMAGES_DIR / filename
        if local_path.exists():
            print(f'[PDF] Ruta /storage/ resuelta a archivo local: {local_path}')
            return str(local_path)
        # Fallback: buscar cualquier archivo que contenga ese nombre
        if IMAGES_DIR.exists():
            for f in IMAGES_DIR.iterdir():
                if f.is_file() and filename in f.name:
                    print(f'[PDF] Fallback: encontrado {f}')
                    return str(f)
        print(f'[PDF] No se pudo resolver /storage/ para: {image_value}')
    return image_value


def resolve_image_data(image_value, label='imagen'):
    """
    Resuelve una imagen desde:
    - Ruta local (archivo en disco)
    - Ruta /storage/imagenes/... (formato interno del servidor)
    - URL http/https
    - Base64
    """
    if not image_value:
        print(f'[PDF] {label}: Sin valor de imagen, se omite')
        return None

    # === PASO 1: Resolver rutas internas del servidor ===
    # Si la ruta es /storage/imagenes/... (no resuelta por app.py),
    # la convertimos a ruta local real
    resolved = _resolve_storage_path(image_value)

    # === PASO 2: Si es una ruta local (archivo existente) ===
    if isinstance(resolved, str) and Path(resolved).exists():
        try:
            print(f'[PDF] {label}: Leyendo archivo local: {resolved}')
            with open(resolved, 'rb') as f:
                data = f.read()
                print(f'[PDF] {label}: Leídos {len(data)} bytes')
                return data
        except Exception as e:
            print(f'[PDF] {label}: Error leyendo archivo local: {e}')
            return None

    # === PASO 3: Si es una URL http/https ===
    if isinstance(resolved, str) and (resolved.startswith('http://') or resolved.startswith('https://')):
        try:
            print(f'[PDF] {label}: Descargando desde URL (timeout=30s)...')
            with urllib.request.urlopen(resolved, timeout=30) as response:
                data = response.read()
                print(f'[PDF] {label}: Descargados {len(data)} bytes desde URL')
                return data
        except Exception as e:
            print(f'[PDF] {label}: Error descargando imagen desde URL: {e}')
            return None

    # === PASO 4: Si es base64 data URI ===
    image_str = str(resolved) if not isinstance(resolved, str) else resolved
    if ',' in image_str:
        print(f'[PDF] {label}: Detectado data URI base64, extrayendo payload...')
        image_str = image_str.split(',', 1)[1]
    else:
        print(f'[PDF] {label}: Interpretando como base64 plano...')

    # === PASO 5: Decodificar base64 ===
    try:
        decoded = base64.b64decode(image_str)
        print(f'[PDF] {label}: Decodificados {len(decoded)} bytes')
        return decoded
    except Exception as e:
        print(f'[PDF] {label}: Error decodificando base64: {e}')
        try:
            import re
            cleaned = re.sub(r'[^A-Za-z0-9+/=]', '', image_str)
            decoded = base64.b64decode(cleaned)
            print(f'[PDF] {label}: Decodificados {len(decoded)} bytes tras limpiar caracteres')
            return decoded
        except Exception as e2:
            print(f'[PDF] {label}: Error incluso tras limpiar: {e2}')
            return None

def draw_signature_image(c, x, y, width, height, image_value, label='firma'):
    """Dibuja una imagen de firma dentro de un recuadro."""
    image_data = resolve_image_data(image_value, label=label)
    if image_data is None:
        print(f'[PDF] {label}: No se pudo resolver la imagen, se omite')
        return

    try:
        image = Image.open(BytesIO(image_data))
        print(f'[PDF] {label}: Imagen abierta: {image.size[0]}x{image.size[1]}px, modo={image.mode}')
    except Exception as e:
        print(f'[PDF] {label}: Error abriendo imagen con Pillow: {e}')
        return

    if image.mode not in ('RGB', 'RGBA'):
        image = image.convert('RGB')

    image_reader = ImageReader(image)
    image_ratio = image.width / image.height
    box_ratio = width / height

    if image_ratio > box_ratio:
        draw_width = width
        draw_height = width / image_ratio
    else:
        draw_height = height
        draw_width = height * image_ratio

    draw_x = x + (width - draw_width) / 2
    draw_y = y + (height - draw_height) / 2
    c.drawImage(image_reader, draw_x, draw_y, draw_width, draw_height, mask='auto')
    print(f'[PDF] {label}: Imagen dibujada en ({draw_x:.0f}, {draw_y:.0f}) tamaño {draw_width:.0f}x{draw_height:.0f}')

def draw_image_page(c, image_value, title='Comprobante'):
    """Dibuja una imagen (ej. comprobante/ticket) en una página completa."""
    image_data = resolve_image_data(image_value, label=title)
    if image_data is None:
        print(f'[PDF] {title}: No se pudo resolver la imagen, se omite la página')
        return

    try:
        image = Image.open(BytesIO(image_data))
        print(f'[PDF] {title}: Imagen abierta: {image.size[0]}x{image.size[1]}px, modo={image.mode}')
    except Exception as e:
        print(f'[PDF] {title}: Error abriendo imagen con Pillow: {e}')
        return

    if image.mode not in ('RGB', 'RGBA'):
        image = image.convert('RGB')

    image_reader = ImageReader(image)
    c.setFont('Helvetica-Bold', 14)
    c.drawString(LEFT, PAGE_HEIGHT - MARGIN, title)

    max_width = WIDTH
    max_height = PAGE_HEIGHT - MARGIN * 2 - 30
    image_ratio = image.width / image.height
    box_ratio = max_width / max_height

    if image_ratio > box_ratio:
        draw_width = max_width
        draw_height = max_width / image_ratio
    else:
        draw_height = max_height
        draw_width = max_height * image_ratio

    draw_x = LEFT + (max_width - draw_width) / 2
    draw_y = MARGIN + (max_height - draw_height) / 2
    c.drawImage(image_reader, draw_x, draw_y, draw_width, draw_height, mask='auto')
    print(f'[PDF] {title}: Imagen dibujada en página completa ({draw_width:.0f}x{draw_height:.0f})')

def create_voucher_pdf(data=None, output_path=None):
    data = data or {}
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=letter)
    c.setTitle('Vale de Caja')

    # Watermark
    c.saveState()
    c.setFillColorRGB(0.95, 0.95, 0.95)
    c.setFont('Helvetica-Bold', 72)
    c.drawCentredString(PAGE_WIDTH / 2, PAGE_HEIGHT - 180, 'flynet')
    c.restoreState()

    # Encabezado
    TOP = PAGE_HEIGHT - 60
    
    c.setFillColor(black)
    c.setFont('Helvetica-Bold', 26)
    c.drawString(LEFT, TOP, 'flynet')
    c.setFont('Helvetica', 10)
    c.drawString(LEFT + 80, TOP, 'S.A. de C.V.')

    title_width = 160
    title_x = RIGHT - title_width
    title_y = TOP - 4
    
    c.setFillColor(black)
    c.rect(title_x, title_y, title_width, 22, fill=1, stroke=0)
    c.setFillColorRGB(1, 1, 1)
    c.setFont('Helvetica-Bold', 12)
    c.drawCentredString(title_x + (title_width / 2), title_y + 6, 'VALE DE CAJA')
    c.setFillColor(black)

    info_y = title_y - 22
    c.setFont('Helvetica', 9)
    c.drawString(title_x, info_y, 'N°:')
    c.rect(title_x + 15, info_y - 4, 45, 16)
    c.setFont('Helvetica-Bold', 10)
    c.drawString(title_x + 18, info_y, data.get('numero', ''))

    c.setFont('Helvetica', 9)
    c.drawString(title_x + 70, info_y, 'Fecha:')
    c.rect(title_x + 105, info_y - 4, 55, 16)
    c.setFont('Helvetica-Bold', 9)
    c.drawString(title_x + 108, info_y, data.get('fecha', ''))

    y = info_y - 20
    draw_line(c, LEFT, y, RIGHT, y)

    y -= 20
    draw_checkbox(c, LEFT + 20, y, 'Caja chica', data.get('cajaChica', False))
    draw_checkbox(c, LEFT + 180, y, 'Clientes', data.get('clientes', False))
    draw_checkbox(c, LEFT + 340, y, 'Instalaciones', data.get('instalaciones', False))
    
    y -= 18
    draw_checkbox(c, LEFT + 20, y, 'Otros Gastos', data.get('otrosGastos', False))

    y -= 15
    draw_line(c, LEFT, y, RIGHT, y)

    y -= 28
    draw_field(c, 'Entregado a:', LEFT, y, 300, data.get('entregadoA', ''))
    draw_field(c, 'La suma de:', LEFT + 310, y, RIGHT - (LEFT + 310), data.get('laSumaDe', ''), suffix='/100 dólares')

    y -= 32
    draw_field(c, 'En concepto de:', LEFT, y, RIGHT - LEFT, data.get('concepto', ''))

    y -= 20
    draw_line(c, LEFT, y, RIGHT, y)

    y -= 28
    c.setFont('Helvetica', 9)
    c.drawString(LEFT, y, 'Monto total:')
    c.setFont('Helvetica-Bold', 11)
    monto_total = data.get('montoTotal', '')
    if monto_total:
        try:
            c.drawString(LEFT + 65, y, f"$ {float(monto_total):,.2f}")
        except:
            c.drawString(LEFT + 65, y, f"$ {monto_total}")

    draw_field(c, 'Reintegro de caja:', LEFT + 260, y, RIGHT - (LEFT + 260), data.get('reintegro', ''))

    y -= 20
    draw_line(c, LEFT, y, RIGHT, y)

    y -= 130
    box_width = 220
    box_height = 80
    
    c.setFont('Helvetica-Bold', 10)
    c.drawString(LEFT, y + box_height + 15, 'Solicitante')
    c.setFont('Helvetica', 8)
    c.drawString(LEFT, y + box_height + 5, 'Nombre y firma')
    c.rect(LEFT, y, box_width, box_height)
    draw_signature_image(c, LEFT + 5, y + 8, box_width - 10, box_height - 18, data.get('firmaSolicitante'))
    if data.get('solicitante'):
        c.setFont('Helvetica-Bold', 8)
        c.drawCentredString(LEFT + (box_width / 2), y + 5, data.get('solicitante'))

    autoriza_x = RIGHT - box_width
    c.setFont('Helvetica-Bold', 10)
    c.drawString(autoriza_x, y + box_height + 15, 'Autoriza')
    c.setFont('Helvetica', 8)
    c.drawString(autoriza_x, y + box_height + 5, 'Vicente Chicas')
    c.rect(autoriza_x, y, box_width, box_height)
    if data.get('autoriza'):
        c.setFont('Helvetica-Bold', 8)
        c.drawCentredString(autoriza_x + (box_width / 2), y + 5, data.get('autoriza'))

    y -= 40
    c.setDash(6, 4)
    c.line(LEFT, y, RIGHT, y)
    c.setDash(1, 0)

    comprobante = data.get('comprobante')
    if comprobante:
        c.showPage()
        draw_image_page(c, comprobante, title='COMPROBANTE')

    c.save()

    buffer.seek(0)
    if output_path:
        with open(output_path, 'wb') as f:
            f.write(buffer.getvalue())
        return output_path

    return buffer.getvalue()

if __name__ == '__main__':
    create_voucher_pdf(
        {
            'numero': '0001',
            'fecha': '20/05/2026',
            'cajaChica': True,
            'clientes': False,
            'instalaciones': False,
            'entregadoA': 'Juan Pérez',
            'laSumaDe': 'Mil pesos 00/100',
            'concepto': 'Pago de gastos menores por viáticos',
            'montoTotal': '1000.00',
            'reintegro': '0.00',
            'solicitante': 'Juan Pérez',
            'autoriza': 'Vicente Chicas',
        },
        'vale-mejorado.pdf'
    )