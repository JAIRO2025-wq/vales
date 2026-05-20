import base64
import io
from io import BytesIO
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
    
    # Calcular el ancho exacto del texto de la etiqueta
    label_width = c.stringWidth(label, 'Helvetica', 9)
    
    rect_x = x + label_width + 5
    rect_y = y - 4
    
    # Si hay un sufijo (ej. "/100 dólares"), restamos su espacio
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
        # Checkmark centrado y limpio
        c.line(x + 2, y + 3, x + size / 2.5, y - 1)
        c.line(x + size / 2.5, y - 1, x + size - 1, y + size - 1)


def draw_signature_image(c, x, y, width, height, image_b64):
    if not image_b64:
        return
    if ',' in image_b64:
        image_b64 = image_b64.split(',', 1)[1]
    try:
        image_data = base64.b64decode(image_b64)
    except Exception:
        return

    try:
        image = Image.open(BytesIO(image_data))
    except Exception:
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


def draw_image_page(c, image_b64, title='Comprobante'):
    if not image_b64:
        return
    if ',' in image_b64:
        image_b64 = image_b64.split(',', 1)[1]
    try:
        image_data = base64.b64decode(image_b64)
    except Exception:
        return

    try:
        image = Image.open(BytesIO(image_data))
    except Exception:
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


def create_voucher_pdf(data=None, output_path=None):
    data = data or {}
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=letter)
    c.setTitle('Vale de Caja')

    # --- Watermark (Centrado en el área del vale) ---
    c.saveState()
    c.setFillColorRGB(0.95, 0.95, 0.95)
    c.setFont('Helvetica-Bold', 72)
    c.drawCentredString(PAGE_WIDTH / 2, PAGE_HEIGHT - 180, 'flynet')
    c.restoreState()

    # --- Encabezado ---
    TOP = PAGE_HEIGHT - 60
    
    # Logo
    c.setFillColor(black)
    c.setFont('Helvetica-Bold', 26)
    c.drawString(LEFT, TOP, 'flynet')
    c.setFont('Helvetica', 10)
    c.drawString(LEFT + 80, TOP, 'S.A. de C.V.')

    # Título "VALE DE CAJA" (Alineado a la derecha)
    title_width = 160
    title_x = RIGHT - title_width
    title_y = TOP - 4
    
    c.setFillColor(black)
    c.rect(title_x, title_y, title_width, 22, fill=1, stroke=0)
    c.setFillColorRGB(1, 1, 1)
    c.setFont('Helvetica-Bold', 12)
    c.drawCentredString(title_x + (title_width / 2), title_y + 6, 'VALE DE CAJA')
    c.setFillColor(black)

    # Número y Fecha (Debajo del título)
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

    # --- Línea divisoria superior ---
    y = info_y - 20
    draw_line(c, LEFT, y, RIGHT, y)

    # --- Checkboxes (Primera fila) ---
    y -= 20
    draw_checkbox(c, LEFT + 20, y, 'Caja chica', data.get('cajaChica', False))
    draw_checkbox(c, LEFT + 180, y, 'Clientes', data.get('clientes', False))
    draw_checkbox(c, LEFT + 340, y, 'Instalaciones', data.get('instalaciones', False))
    
    # --- Checkboxes (Segunda fila) ---
    y -= 18
    draw_checkbox(c, LEFT + 20, y, 'Otros Gastos', data.get('otrosGastos', False))

    # --- Línea divisoria ---
    y -= 15
    draw_line(c, LEFT, y, RIGHT, y)

    # --- Campos principales (Fila 1) ---
    y -= 28
    # Entregado a (Ocupa 300 puntos de ancho)
    draw_field(c, 'Entregado a:', LEFT, y, 300, data.get('entregadoA', ''))
    # La suma de (Ocupa el resto hasta el margen derecho, incluyendo el sufijo)
    draw_field(c, 'La suma de:', LEFT + 310, y, RIGHT - (LEFT + 310), data.get('laSumaDe', ''), suffix='/100 dólares')

    # --- Concepto (Fila 2) ---
    y -= 32
    draw_field(c, 'En concepto de:', LEFT, y, RIGHT - LEFT, data.get('concepto', ''))

    # --- Línea divisoria ---
    y -= 20
    draw_line(c, LEFT, y, RIGHT, y)

    # --- Monto total y Reintegro (Fila 3) ---
    y -= 28
    c.setFont('Helvetica', 9)
    c.drawString(LEFT, y, 'Monto total:')
    c.setFont('Helvetica-Bold', 11)
    monto_total = data.get('montoTotal', '')
    if monto_total:
        c.drawString(LEFT + 65, y, f"$ {float(monto_total):,.2f}")

    draw_field(c, 'Reintegro de caja:', LEFT + 260, y, RIGHT - (LEFT + 260), data.get('reintegro', ''))

    # --- Línea divisoria ---
    y -= 20
    draw_line(c, LEFT, y, RIGHT, y)

    # --- Solicitante y Autoriza (Firmas) ---
    y -= 130
    box_width = 220
    box_height = 80
    
    # Solicitante (Izquierda)
    c.setFont('Helvetica-Bold', 10)
    c.drawString(LEFT, y + box_height + 15, 'Solicitante')
    c.setFont('Helvetica', 8)
    c.drawString(LEFT, y + box_height + 5, 'Nombre y firma')
    c.rect(LEFT, y, box_width, box_height)
    draw_signature_image(c, LEFT + 5, y + 8, box_width - 10, box_height - 18, data.get('firmaSolicitante'))
    if data.get('solicitante'):
        c.setFont('Helvetica-Bold', 8)
        c.drawCentredString(LEFT + (box_width / 2), y + 5, data.get('solicitante'))

    # Autoriza (Derecha)
    autoriza_x = RIGHT - box_width
    c.setFont('Helvetica-Bold', 10)
    c.drawString(autoriza_x, y + box_height + 15, 'Autoriza')
    c.setFont('Helvetica', 8)
    c.drawString(autoriza_x, y + box_height + 5, 'Vicente Chicas')
    c.rect(autoriza_x, y, box_width, box_height)
    if data.get('autoriza'):
        c.setFont('Helvetica-Bold', 8)
        c.drawCentredString(autoriza_x + (box_width / 2), y + 5, data.get('autoriza'))

    # --- Línea punteada final para recortar ---
    y -= 40
    c.setDash(6, 4)  # Patrón: 6 puntos pintados, 4 puntos de espacio
    c.line(LEFT, y, RIGHT, y)
    c.setDash(1, 0)  # Restablecer línea continua para la siguiente página

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