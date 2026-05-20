import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { type VoucherRecord, getCycleFromDate, normalizeId, formatVoucherForApi } from '@/app/actions/vouchers';

const STORAGE_PATH = path.join(process.cwd(), 'src/data/storage');

/**
 * API Maestra de Consulta de Estado
 * Soporta formatos de Google Apps Script (?vale?id=... o ?vale&id=...)
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Detección de dominio dinámico (Origin)
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || "";
    const protocol = request.headers.get('x-forwarded-proto') || "https";
    let origin = `${protocol}://${host}`;
    
    // Si estamos en localhost o no hay host, forzamos el dominio público para Google
    if (host.includes('localhost') || host.includes('0.0.0.0') || !host) {
      origin = "https://vales01.modulos.uk";
    }

    // 2. Normalización de URL para Google Apps Script
    let urlString = request.url;
    const firstQM = urlString.indexOf('?');
    if (firstQM !== -1) {
      const base = urlString.substring(0, firstQM + 1);
      const query = urlString.substring(firstQM + 1).replace(/\?/g, '&');
      urlString = base + query;
    }

    const { searchParams } = new URL(urlString);
    const rawId = searchParams.get('id');
    const rawFecha = searchParams.get('fecha');
    const cicloParams = searchParams.get('ciclo');

    // CASO A: Consulta masiva por ciclo (YYYY-MM)
    if (cicloParams) {
      const [year, month] = cicloParams.split('-');
      const filePath = path.join(STORAGE_PATH, year, `${year}-${month}`, 'vouchers.json');
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const vouchers: VoucherRecord[] = JSON.parse(content);
        // Usar Promise.all para esperar a formatVoucherForApi que ahora es async
        const formatted = await Promise.all(vouchers.map(v => formatVoucherForApi(v, origin)));
        return NextResponse.json(formatted);
      } catch (e) {
        return NextResponse.json([]);
      }
    }

    // CASO B: Consulta individual por ID
    if (rawId) {
      const targetId = await normalizeId(rawId);
      let cycleId = "";
      let year = "";

      // Si el script envía fecha, la usamos para ir directo a la carpeta correcta
      if (rawFecha) {
        const cycle = await getCycleFromDate(rawFecha);
        cycleId = cycle.id;
        year = cycle.year.toString();
      } else {
        // Búsqueda inteligente por ID si no hay fecha
        const yearMatch = targetId.match(/\d{4}/);
        const monthMatch = targetId.match(/-(\d{2})-/);
        if (!yearMatch || !monthMatch) {
          return NextResponse.json({ error: "ID sin formato de fecha" }, { status: 400 });
        }
        year = yearMatch[0];
        cycleId = `${year}-${monthMatch[1]}`;
      }

      const filePath = path.join(STORAGE_PATH, year, cycleId, 'vouchers.json');

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const vouchers: VoucherRecord[] = JSON.parse(content);
        // Normalizar comparación
        const voucher = vouchers.find(v => v.id.toUpperCase().replace(/[\s_]/g, '-') === targetId);

        if (!voucher) {
          return NextResponse.json({ 
            id: targetId,
            firmado: false,
            comprobante: false,
            error: "Vale no registrado" 
          });
        }

        return NextResponse.json(await formatVoucherForApi(voucher, origin));
      } catch (e) {
        return NextResponse.json({ error: `Ciclo ${cycleId} no encontrado` }, { status: 404 });
      }
    }

    return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 });

  } catch (error) {
    console.error("Error en API Estado:", error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}