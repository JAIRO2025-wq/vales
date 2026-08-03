import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const STORAGE_PATH = path.join(process.cwd(), 'src/data/storage');

/**
 * POST /api/upload-voucher
 * 
 * Recibe una imagen de comprobante (voucher) y la guarda en:
 *   storage/vouchers/{año}/{ciclo}/{sucursal}/{caja}/
 * 
 * Body (multipart/form-data):
 *   - id: string (ID del vale, ej: MORAZAN-2026-06-W5-CLIENTES-F63)
 *   - fila: string
 *   - sheet: string
 *   - imagen: File (archivo de imagen)
 * 
 * El ID contiene: SUCURSAL-YYYY-MM-WX-SHEET-FXX
 */

/** Normaliza el nombre de sheet a un nombre de carpeta limpio */
function normalizeCaja(sheet: string): string {
  const s = (sheet || '').toUpperCase().trim();
  if (s.includes('CHICA') || s === 'HOJA 1' || s.includes('GENERAL')) return 'CAJA-CHICA';
  if (s.includes('CLIENTES')) return 'CLIENTES';
  if (s.includes('INSTALACIONES')) return 'INSTALACIONES';
  if (s.includes('OTROS')) return 'OTROS-GASTOS';
  return s.replace(/\s+/g, '-');
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const id = formData.get('id') as string | null;
    const fila = formData.get('fila') as string | null;
    const sheet = formData.get('sheet') as string | null;
    const imagen = formData.get('imagen') as File | null;

    if (!id || !imagen) {
      return NextResponse.json(
        { success: false, error: 'Faltan campos requeridos: id e imagen' },
        { status: 400 }
      );
    }

    // Validar tipo de archivo
    if (!imagen.type.startsWith('image/')) {
      return NextResponse.json(
        { success: false, error: 'Solo se permiten imágenes' },
        { status: 400 }
      );
    }

    // Validar tamaño máximo (10 MB)
    const MAX_SIZE = 10 * 1024 * 1024;
    if (imagen.size > MAX_SIZE) {
      return NextResponse.json(
        { success: false, error: 'La imagen no debe superar los 10 MB' },
        { status: 400 }
      );
    }

    // Normalizar ID
    const targetId = id.trim().toUpperCase().replace(/[\s_]/g, '-').replace(/[^a-zA-Z0-9\-]/g, '');

    // Extraer componentes del ID: SUCURSAL-YYYY-MM-WX-CATEGORIA-FXX
    const idMatch = targetId.match(/^(.+)-(\d{4})-(\d{2})-W\d-(.+)-F\d+$/);
    if (!idMatch) {
      return NextResponse.json(
        { success: false, error: 'ID con formato inválido. Debe ser: SUCURSAL-YYYY-MM-WX-SHEET-FXX' },
        { status: 400 }
      );
    }

    const sucursal = idMatch[1];    // ej: SAN-MIGUEL
    const year = idMatch[2];        // ej: 2026
    const month = idMatch[3];       // ej: 06
    const cajaFromId = idMatch[4];  // ej: CAJACHICA

    // Normalizar caja usando el sheet si viene, o el extraído del ID
    const caja = normalizeCaja(sheet || cajaFromId);

    // Calcular ciclo Flynet: usar día 25 para asegurar que cae en el ciclo correcto
    const { getCycleFromDate } = await import('@/lib/cycles');
    const fecha25 = `${year}-${month}-25`;
    const cycle = getCycleFromDate(fecha25);
    const cicloId = cycle.id;       // ej: 2026-06

    // ===== NUEVA ESTRUCTURA: vouchers/{año}/{ciclo}/{sucursal}/{caja}/ =====
    const voucherDir = path.join(STORAGE_PATH, 'vouchers', year, cicloId, sucursal, caja);
    await fs.mkdir(voucherDir, { recursive: true });

    const indexPath = path.join(voucherDir, 'voucher-index.json');

    // Validación de duplicidad
    let index: Record<string, { voucherUrl: string; subidoEl: string }> = {};
    try {
      const content = await fs.readFile(indexPath, 'utf-8');
      index = JSON.parse(content);
    } catch {
      // No existe el índice todavía, se creará
    }

    if (index[targetId]) {
      return NextResponse.json(
        {
          success: false,
          error: 'Este vale ya tiene un voucher subido.',
          voucherUrl: index[targetId].voucherUrl,
          yaSubido: true,
        },
        { status: 409 }
      );
    }

    // Determinar extensión del archivo
    const ext = imagen.type === 'image/png' ? '.png'
      : imagen.type === 'image/webp' ? '.webp'
      : imagen.type === 'image/gif' ? '.gif'
      : '.jpg';

    const fileName = `${targetId}_voucher${ext}`;
    const filePath = path.join(voucherDir, fileName);

    // Guardar archivo
    const buffer = Buffer.from(await imagen.arrayBuffer());
    await fs.writeFile(filePath, buffer);

    // Construir URL pública
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || '';
    const protocol = request.headers.get('x-forwarded-proto') || 'https';
    let origin = `${protocol}://${host}`;

    if (host.includes('localhost') || host.includes('0.0.0.0') || !host) {
      origin = 'https://vale.modulos.uk';
    }

    // URL para servir la imagen
    const relativePath = `vouchers/${year}/${cicloId}/${sucursal}/${caja}/${fileName}`;
    const url = `${origin}/api/imagenes?fecha=${year}-${month}-25&file=${encodeURIComponent(relativePath)}`;

    // Registrar en el índice
    const subidoEl = new Date().toISOString();
    index[targetId] = {
      voucherUrl: url,
      subidoEl,
    };
    await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8');

    // Sincronizar con los vales del ciclo para que checkVoucherStatusAction lo detecte
    await syncToCycleVouchers(targetId, year, cicloId, url, fila, sheet);

    return NextResponse.json({
      success: true,
      url,
    });
  } catch (error) {
    console.error('Error en upload-voucher:', error);
    return NextResponse.json(
      { success: false, error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

/**
 * Sincroniza el voucher subido con el vouchers.json de su grupo específico.
 * Es un cache opcional — la app ahora lee voucher-index.json como fuente de verdad,
 * así que si esto falla no afecta la visualización de vouchers.
 */
async function syncToCycleVouchers(
  targetId: string,
  year: string,
  cicloId: string,
  voucherUrl: string,
  fila: string | null,
  sheet: string | null
) {
  try {
    const sucursal = targetId.split('-')[0].replace(/\s+/g, '-');
    const caja = normalizeCaja(sheet || '');

    // Ruta al vouchers.json específico de este grupo
    const groupDir = path.join(STORAGE_PATH, year, cicloId, sucursal, caja);
    const filePath = path.join(groupDir, 'vouchers.json');

    let vouchers: any[] = [];
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      vouchers = JSON.parse(content);
    } catch {
      // No existe el archivo, se creará
      await fs.mkdir(groupDir, { recursive: true });
    }

    const idx = vouchers.findIndex(
      (v: any) => v.id.toUpperCase().replace(/[\s_]/g, '-') === targetId
    );

    if (idx >= 0) {
      vouchers[idx].voucherUrl = voucherUrl;
      vouchers[idx].voucherSubido = true;
    } else {
      vouchers.push({
        id: targetId,
        fila: fila || '',
        sheet: sheet || '',
        fecha: `${year}-01-01`,
        voucherUrl,
        voucherSubido: true,
        firmado: false,
        timestamp: new Date().toISOString(),
        sucursal: sucursal.replace(/-/g, ' '),
        entregado: '',
        rubro: '',
        numVale: '',
        monto: '0',
      });
    }

    await fs.writeFile(filePath, JSON.stringify(vouchers, null, 2), 'utf-8');
  } catch (e) {
    // No es crítico — la app lee de voucher-index.json directamente
    console.warn('Sync opcional con vouchers.json falló (no crítico):', (e as Error).message);
  }
}
