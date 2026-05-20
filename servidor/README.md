# Vale PDF Template (Python + FastAPI)

Genera un PDF tipo carta con una plantilla de vale de caja y expone una API REST con FastAPI.

## Requisitos

- Python 3.10+
- `pip`

## Instalación

```sh
cd "c:\Users\jairo\OneDrive\Desktop\PROYECTOS\plantillas"
pip install -r requirements.txt
```

## Ejecutar el servidor

```sh
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

El servidor quedará disponible en:

```sh
http://localhost:8000
```

## Endpoints

### POST `/generate-vale`

Recibe un JSON con los datos del vale y devuelve la URL donde se puede descargar el PDF generado.

Ejemplo de cuerpo JSON:

```json
{
  "id": "SAN_MIGUEL-2026-01-W3-OTROSGASTOS-F7",
  "numero": "0001",
  "fecha": "20/05/2026",
  "cajaChica": true,
  "clientes": false,
  "instalaciones": false,
  "entregadoA": "Nombre del trabajador",
  "laSumaDe": "Mil pesos 00/100",
  "concepto": "Descripción del concepto",
  "montoTotal": "1000.00",
  "reintegro": "0.00",
  "solicitante": "Juan Pérez",
  "autoriza": "Vicente Chicas",
  "firmaSolicitante": "data:image/png;base64,iVBORw0KGgoAAAANS...",
  "comprobante": "data:image/png;base64,iVBORw0KGgoAAAANS..."
}
```

- `id` es opcional, pero si se envía el servidor lo usa para nombrar el PDF final.
- `firmaSolicitante` es opcional.
- `comprobante` es opcional.
- Todos los campos de imagen pueden enviarse como `data:image/png;base64,...` o solo la parte base64.
- Si se recibe el mismo `id` con la misma información, el backend reutiliza el PDF existente en lugar de regenerarlo.
- El comprobante se agrega como segunda página del PDF.

### GET `/pdf/{pdf_file_name}`

Descarga el PDF generado.

### POST `/generate-vale-bulk`

Genera varios PDFs a partir de una lista de objetos JSON y devuelve la URL del archivo ZIP con todos los PDFs.

Ejemplo de cuerpo JSON:

```json
[
  {
    "numero": "0001",
    "fecha": "20/05/2026",
    "cajaChica": true,
    "clientes": false,
    "instalaciones": false,
    "entregadoA": "Nombre del trabajador",
    "laSumaDe": "Mil pesos 00/100",
    "concepto": "Descripción del concepto",
    "montoTotal": "1000.00",
    "reintegro": "0.00",
    "solicitante": "Juan Pérez",
    "autoriza": "Vicente Chicas",
    "firmaSolicitante": "data:image/png;base64,iVBORw0KGgoAAAANS..."
  },
  {
    "numero": "0002",
    "fecha": "20/05/2026",
    "entregadoA": "Otro trabajador",
    "laSumaDe": "Dos mil pesos 00/100",
    "concepto": "Otro concepto",
    "montoTotal": "2000.00",
    "reintegro": "0.00"
  }
]
```

La API devuelve:

```json
{ "zip_url": "http://localhost:8000/zip/vales-1700000000.zip" }
```

### GET `/zip/{zip_file_name}`

Descarga el ZIP generado, que se guarda en la carpeta `generated/`.

## CORS

La API tiene CORS abierto (`allow_origins=['*']`), así que el frontend puede llamar desde cualquier dominio.

## Ejemplo de uso con frontend

1. El frontend envía el JSON completo a `/generate-vale`.
2. La API genera el PDF y devuelve:

```json
{ "pdf_url": "http://localhost:8000/pdf/vale-0001-1700000000.pdf" }
```

3. El frontend abre o descarga esa URL.
