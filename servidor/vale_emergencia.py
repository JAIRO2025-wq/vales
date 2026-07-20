"""
============================================================================
  VALE DE CAJA - GENERADOR DE EMERGENCIA (STANDALONE)
============================================================================
  Genera el MISMO PDF que el servidor de vales, pero sin necesidad del
  servidor. Usalo si el servidor se cae o necesitas generar un vale rapido.

  Requisitos: pip install reportlab Pillow

  Uso: python vale_emergencia.py
============================================================================
"""

import io
import os
import sys
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
from pathlib import Path

# ============================================================
# MOTOR PDF (COPIA EXACTA DE pdf_generator.py)
# ============================================================
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib.colors import black
from reportlab.lib.utils import ImageReader
from PIL import Image

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
    """Dibuja un campo ajustando el rectangulo al espacio disponible de forma exacta."""
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


def resolve_image_data(image_value, label='imagen'):
    """
    Resuelve una imagen desde:
    - Ruta local (archivo en disco)
    - Base64
    """
    if not image_value:
        return None

    resolved = image_value

    # Ruta local
    if isinstance(resolved, str) and Path(resolved).exists():
        try:
            with open(resolved, 'rb') as f:
                return f.read()
        except Exception as e:
            print(f'[PDF] {label}: Error leyendo archivo local: {e}')
            return None

    # Base64
    image_str = str(resolved) if not isinstance(resolved, str) else resolved
    import base64
    if ',' in image_str:
        image_str = image_str.split(',', 1)[1]

    try:
        return base64.b64decode(image_str)
    except Exception:
        return None


def draw_signature_image(c, x, y, width, height, image_value, label='firma'):
    """Dibuja una imagen de firma dentro de un recuadro."""
    image_data = resolve_image_data(image_value, label=label)
    if image_data is None:
        return

    try:
        image = Image.open(io.BytesIO(image_data))
    except Exception as e:
        print(f'[PDF] {label}: Error abriendo imagen: {e}')
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


def draw_image_page(c, image_value, title='Comprobante'):
    """Dibuja una imagen (ej. comprobante/ticket) en una pagina completa."""
    image_data = resolve_image_data(image_value, label=title)
    if image_data is None:
        return

    try:
        image = Image.open(io.BytesIO(image_data))
    except Exception as e:
        print(f'[PDF] {title}: Error abriendo imagen: {e}')
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
    """IDENTICO a pdf_generator.py - create_voucher_pdf()"""
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
    draw_field(c, 'La suma de:', LEFT + 310, y, RIGHT - (LEFT + 310), data.get('laSumaDe', ''), suffix='/100 dolares')

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


# ============================================================
# GUI CON TKINTER
# ============================================================
class ValeEmergenciaApp:
    def __init__(self, root):
        self.root = root
        self.root.title('Vale de Caja - Generador de Emergencia')
        self.root.geometry('750x700')
        self.root.resizable(True, True)

        # Centrar ventana
        self.root.update_idletasks()
        w = self.root.winfo_width()
        h = self.root.winfo_height()
        sw = self.root.winfo_screenwidth()
        sh = self.root.winfo_screenheight()
        x = (sw - 750) // 2
        y = (sh - 700) // 2
        self.root.geometry(f'750x700+{x}+{y}')

        # Variables de imagen
        self.firma_path = tk.StringVar()
        self.comprobante_path = tk.StringVar()

        self._build_ui()

    def _build_ui(self):
        # Frame principal con scroll
        canvas_widget = tk.Canvas(self.root, highlightthickness=0)
        scrollbar = ttk.Scrollbar(self.root, orient='vertical', command=canvas_widget.yview)
        self.scroll_frame = ttk.Frame(canvas_widget)

        self.scroll_frame.bind('<Configure>',
            lambda e: canvas_widget.configure(scrollregion=canvas_widget.bbox('all')))

        canvas_widget.create_window((0, 0), window=self.scroll_frame, anchor='nw')
        canvas_widget.configure(yscrollcommand=scrollbar.set)

        canvas_widget.pack(side='left', fill='both', expand=True)
        scrollbar.pack(side='right', fill='y')

        # Mousewheel
        def _on_mousewheel(event):
            canvas_widget.yview_scroll(int(-1 * (event.delta / 120)), 'units')
        canvas_widget.bind_all('<MouseWheel>', _on_mousewheel)

        frame = self.scroll_frame

        # Titulo
        ttk.Label(frame, text='VALE DE CAJA - GENERADOR DE EMERGENCIA',
                  font=('Helvetica', 16, 'bold')).pack(pady=(15, 5))
        ttk.Label(frame, text='Genera el mismo PDF que el servidor, sin necesidad del servidor.',
                  font=('Helvetica', 9)).pack(pady=(0, 15))

        # Separador
        ttk.Separator(frame, orient='horizontal').pack(fill='x', padx=20, pady=5)

        # === SECCION: DATOS DEL VALE ===
        ttk.Label(frame, text='DATOS DEL VALE', font=('Helvetica', 11, 'bold')).pack(anchor='w', padx=30, pady=(10, 5))

        form = ttk.Frame(frame)
        form.pack(fill='x', padx=30, pady=5)

        # N° y Fecha
        row1 = ttk.Frame(form)
        row1.pack(fill='x', pady=3)
        ttk.Label(row1, text='N°:', width=10).pack(side='left')
        self.entry_numero = ttk.Entry(row1, width=15)
        self.entry_numero.pack(side='left', padx=(0, 20))
        self.entry_numero.insert(0, '0001')
        ttk.Label(row1, text='Fecha:', width=10).pack(side='left')
        self.entry_fecha = ttk.Entry(row1, width=20)
        self.entry_fecha.pack(side='left')
        self.entry_fecha.insert(0, '20/07/2026')

        # Checkboxes - Tipo de gasto
        ttk.Label(form, text='Tipo de gasto:', font=('Helvetica', 9, 'bold')).pack(anchor='w', pady=(10, 3))
        cb_frame = ttk.Frame(form)
        cb_frame.pack(fill='x')
        self.cb_caja_chica = tk.BooleanVar()
        self.cb_clientes = tk.BooleanVar()
        self.cb_instalaciones = tk.BooleanVar()
        self.cb_otros_gastos = tk.BooleanVar()
        ttk.Checkbutton(cb_frame, text='Caja chica', variable=self.cb_caja_chica).pack(side='left', padx=(0, 15))
        ttk.Checkbutton(cb_frame, text='Clientes', variable=self.cb_clientes).pack(side='left', padx=(0, 15))
        ttk.Checkbutton(cb_frame, text='Instalaciones', variable=self.cb_instalaciones).pack(side='left', padx=(0, 15))
        ttk.Checkbutton(cb_frame, text='Otros Gastos', variable=self.cb_otros_gastos).pack(side='left')

        # Campos de texto
        fields = [
            ('Entregado a:', 'entregadoA', ''),
            ('La suma de:', 'laSumaDe', ''),
            ('En concepto de:', 'concepto', ''),
            ('Monto total ($):', 'montoTotal', '0.00'),
            ('Reintegro de caja:', 'reintegro', '0.00'),
            ('Solicitante:', 'solicitante', ''),
            ('Autoriza:', 'autoriza', 'Vicente Chicas'),
        ]
        self.entries = {}
        for label, key, default in fields:
            row = ttk.Frame(form)
            row.pack(fill='x', pady=3)
            ttk.Label(row, text=label, width=18).pack(side='left')
            entry = ttk.Entry(row)
            entry.pack(side='left', fill='x', expand=True)
            entry.insert(0, default)
            self.entries[key] = entry

        # Separador
        ttk.Separator(frame, orient='horizontal').pack(fill='x', padx=20, pady=10)

        # === SECCION: IMAGENES ===
        ttk.Label(frame, text='IMAGENES', font=('Helvetica', 11, 'bold')).pack(anchor='w', padx=30, pady=(5, 5))

        # Firma
        firma_frame = ttk.Frame(frame)
        firma_frame.pack(fill='x', padx=30, pady=5)
        ttk.Label(firma_frame, text='Firma del solicitante:', width=20).pack(side='left')
        ttk.Entry(firma_frame, textvariable=self.firma_path, width=45).pack(side='left', padx=(5, 5))
        ttk.Button(firma_frame, text='Seleccionar...', command=self._select_firma).pack(side='left')
        ttk.Button(firma_frame, text='X', width=3, command=lambda: self.firma_path.set('')).pack(side='left', padx=(2, 0))

        # Comprobante
        comp_frame = ttk.Frame(frame)
        comp_frame.pack(fill='x', padx=30, pady=5)
        ttk.Label(comp_frame, text='Comprobante:', width=20).pack(side='left')
        ttk.Entry(comp_frame, textvariable=self.comprobante_path, width=45).pack(side='left', padx=(5, 5))
        ttk.Button(comp_frame, text='Seleccionar...', command=self._select_comprobante).pack(side='left')
        ttk.Button(comp_frame, text='X', width=3, command=lambda: self.comprobante_path.set('')).pack(side='left', padx=(2, 0))

        # Separador
        ttk.Separator(frame, orient='horizontal').pack(fill='x', padx=20, pady=10)

        # === BOTON GENERAR ===
        btn_frame = ttk.Frame(frame)
        btn_frame.pack(pady=15)
        ttk.Button(btn_frame, text='GENERAR VALE PDF', command=self._generar_pdf,
                   width=30).pack(side='left', padx=5)

        # Status
        self.status_label = ttk.Label(frame, text='', font=('Helvetica', 9))
        self.status_label.pack(pady=(0, 15))

    def _select_firma(self):
        path = filedialog.askopenfilename(
            title='Seleccionar firma',
            filetypes=[('Imagenes', '*.png *.jpg *.jpeg *.gif *.bmp'), ('Todos', '*.*')]
        )
        if path:
            self.firma_path.set(path)

    def _select_comprobante(self):
        path = filedialog.askopenfilename(
            title='Seleccionar comprobante',
            filetypes=[('Imagenes', '*.png *.jpg *.jpeg *.gif *.bmp'), ('Todos', '*.*')]
        )
        if path:
            self.comprobante_path.set(path)

    def _generar_pdf(self):
        # Validar campos minimos
        numero = self.entry_numero.get().strip()
        if not numero:
            messagebox.showwarning('Falta dato', 'El numero de vale es obligatorio.')
            return

        # Construir datos
        data = {
            'numero': numero,
            'fecha': self.entry_fecha.get().strip(),
            'cajaChica': self.cb_caja_chica.get(),
            'clientes': self.cb_clientes.get(),
            'instalaciones': self.cb_instalaciones.get(),
            'otrosGastos': self.cb_otros_gastos.get(),
            'entregadoA': self.entries['entregadoA'].get().strip(),
            'laSumaDe': self.entries['laSumaDe'].get().strip(),
            'concepto': self.entries['concepto'].get().strip(),
            'montoTotal': self.entries['montoTotal'].get().strip(),
            'reintegro': self.entries['reintegro'].get().strip(),
            'solicitante': self.entries['solicitante'].get().strip(),
            'autoriza': self.entries['autoriza'].get().strip(),
            'firmaSolicitante': self.firma_path.get().strip() or None,
            'comprobante': self.comprobante_path.get().strip() or None,
        }

        # Elegir donde guardar
        default_name = f"vale_{numero}.pdf"
        output_path = filedialog.asksaveasfilename(
            title='Guardar vale PDF',
            defaultextension='.pdf',
            filetypes=[('PDF', '*.pdf')],
            initialfile=default_name,
        )
        if not output_path:
            return

        try:
            self.status_label.config(text='Generando PDF...', foreground='blue')
            self.root.update()

            create_voucher_pdf(data, output_path)

            self.status_label.config(
                text=f'PDF generado exitosamente: {output_path}',
                foreground='green'
            )
            messagebox.showinfo('Exito', f'Vale PDF generado:\n{output_path}')

            # Abrir el PDF
            os.startfile(output_path)

        except Exception as e:
            self.status_label.config(text=f'Error: {e}', foreground='red')
            messagebox.showerror('Error', f'No se pudo generar el PDF:\n{e}')


def main():
    root = tk.Tk()
    app = ValeEmergenciaApp(root)
    root.mainloop()


if __name__ == '__main__':
    main()
