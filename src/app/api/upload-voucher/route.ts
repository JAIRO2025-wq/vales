import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const STORAGE_PATH = path.join(process.cwd(), 'src/data/storage');

/**
 * POST /api/upload-voucher
 * 
 * Recibe una imagen de comprobante (voucher) y la guarda en:
 *   storage/vouchers/{año}/{sucursal}/{mes}/
 * 
 * Body (multipart/form-data):
 *   - id: string (ID del vale, ej: MORAZAN-2026-06-W5-CLIENTES-F63)
 *   - fila: string
 *   - sheet: string
 *   - imagen: File (archivo de imagen)
 * 
 * El ID contiene: SUCURSAL-YYYY-MM-WX-SHEET-FXX
 * La validación de duplicidad es por ID (fecha + sucursal + celda).
 */
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

    // Extraer componentes del ID: SUCURSAL-YYYY-MM-WX-SHEET-FXX
    // La sucursal puede contener guiones (ej: SAN-MIGUEL)
    // Buscamos el patrón YYYY-MM para ubicar año y mes
    const dateMatch = targetId.match(/^(.+)-(\d{4})-(\d{2})-/);
    if (!dateMatch) {
      return NextResponse.json(
        { success: false, error: 'ID con formato inválido. Debe ser: SUCURSAL-YYYY-MM-WX-SHEET-FXX' },
        { status: 400 }
      );
    }

    const sucursal = dateMatch[1]; // todo antes del año
    const year = dateMatch[2];
    const month = dateMatch[3]; // MM

    // ===== ESTRUCTURA DE CARPETAS: vouchers/{año}/{sucursal}/{mes}/ =====
    const voucherDir = path.join(STORAGE_PATH, 'vouchers', year, sucursal, month);
    await fs.mkdir(voucherDir, { recursive: true });

    const indexPath = path.join(voucherDir, 'voucher-index.json');

    // ===== VALIDACIÓN DE DUPLICIDAD =====
    // Se revisa el índice de vouchers de esa sucursal/mes/año
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

    // URL para servir la imagen: endpoint genérico con ruta relativa desde storage/
    const relativePath = `vouchers/${year}/${sucursal}/${month}/${fileName}`;
    const url = `${origin}/api/imagenes?fecha=${year}-${month}-15&file=${encodeURIComponent(relativePath)}`;

    // ===== REGISTRAR EN EL ÍNDICE =====
    const subidoEl = new Date().toISOString();
    index[targetId] = {
      voucherUrl: url,
      subidoEl,
    };
    await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8');

    // También sincronizar con el vouchers.json del ciclo Flynet
    // para que la API de estado (/api/estado) también lo detecte
    await syncToCycleVouchers(targetId, year, month, url, fila, sheet);

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
 * Sincroniza el voucher subido con el vouchers.json del ciclo Flynet
 * para que la API de estado (/api/estado) también lo vea.
 * 
 * IMPORTANTE: Usamos el día 25 del mes para calcular el ciclo Flynet.
 * El ciclo va del 20 de un mes al 19 del siguiente. El día 25 siempre
 * cae DENTRO del ciclo que corresponde al mes (ej: 2026-06-25 → ciclo 2026-06).
 * Con día 15, un voucher de junio caía en ciclo 2026-05 (erróneo).
 */
async function syncToCycleVouchers(
  targetId: string,
  year: string,
  month: string,
  voucherUrl: string,
  fila: string | null,
  sheet: string | null
) {
  try {
    const { getCycleFromDate } = await import('@/lib/cycles');
    // Usar día 25 para asegurar que cae dentro del ciclo del mes correcto
    // (el ciclo va del 20 al 19 del siguiente mes)
    const fecha = `${year}-${month}-25`;
    const cycle = getCycleFromDate(fecha);
    const cycleDir = path.join(STORAGE_PATH, cycle.year.toString(), cycle.id);
    const jsonPath = path.join(cycleDir, 'vouchers.json');

    let vouchers: any[] = [];
    try {
      const content = await fs.readFile(jsonPath, 'utf-8');
      vouchers = JSON.parse(content);
    } catch {
      await fs.mkdir(cycleDir, { recursive: true });
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
        fecha: fecha,
        voucherUrl,
        voucherSubido: true,
        firmado: false,
        timestamp: new Date().toISOString(),
      });
    }

    await fs.writeFile(jsonPath, JSON.stringify(vouchers, null, 2), 'utf-8');
  } catch (e) {
    console.warn('No se pudo sincronizar con vouchers.json del ciclo:', e);
  }
}
