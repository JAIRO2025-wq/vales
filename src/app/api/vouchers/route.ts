import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const STORAGE_PATH = path.join(process.cwd(), 'src/data/storage');

interface VoucherEntry {
  id: string;
  voucherUrl: string;
  subidoEl: string;
}

interface VoucherListResponse {
  sucursal: string;
  year: string;
  ciclo: string;
  caja: string;
  vouchers: VoucherEntry[];
}

/**
 * GET /api/vouchers
 * 
 * Lista todos los vouchers subidos.
 * Parámetros opcionales:
 *   ?ciclo=2026-06        → filtra por ciclo (YYYY-MM)
 *   ?sucursal=SAN-MIGUEL  → filtra por sucursal
 * 
 * La estructura es: vouchers/{year}/{ciclo}/{sucursal}/{caja}/
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filterSucursal = searchParams.get('sucursal')?.toUpperCase().replace(/\s+/g, '-') || null;
    const filterCiclo = searchParams.get('ciclo') || null; // YYYY-MM

    // Si se pasa ?ciclo=, extraer año
    const filterYear = filterCiclo ? filterCiclo.split('-')[0] : null;

    console.log('[DEBUG /api/vouchers] Parámetros:', {
      filterSucursal, filterCiclo, filterYear
    });

    const vouchersDir = path.join(STORAGE_PATH, 'vouchers');
    const results: VoucherListResponse[] = [];

    try {
      await fs.access(vouchersDir);
    } catch {
      console.log('[DEBUG /api/vouchers] Carpeta vouchers no existe');
      return NextResponse.json([]);
    }

    // Recorrer años
    const years = filterYear ? [filterYear] : await fs.readdir(vouchersDir);
    console.log('[DEBUG /api/vouchers] Años a recorrer:', years);
    
    for (const year of years) {
      const yearPath = path.join(vouchersDir, year);
      const yearStat = await fs.stat(yearPath).catch(() => null);
      if (!yearStat?.isDirectory()) continue;

      // Recorrer ciclos dentro del año
      const ciclosRaw = await fs.readdir(yearPath).catch(() => []);
      const ciclos = filterCiclo ? [filterCiclo] : ciclosRaw;
      console.log(`[DEBUG /api/vouchers] Ciclos en ${year}:`, ciclosRaw);

      for (const ciclo of ciclos) {
        const cicloPath = path.join(yearPath, ciclo);
        const cicloStat = await fs.stat(cicloPath).catch(() => null);
        if (!cicloStat?.isDirectory()) continue;

        // Recorrer sucursales
        const sucursalesRaw = await fs.readdir(cicloPath).catch(() => []);
        const sucursales = filterSucursal ? [filterSucursal] : sucursalesRaw;

        for (const sucursal of sucursales) {
          const sucursalPath = path.join(cicloPath, sucursal);
          const sucStat = await fs.stat(sucursalPath).catch(() => null);
          if (!sucStat?.isDirectory()) continue;

          // Recorrer cajas
          const cajas = await fs.readdir(sucursalPath).catch(() => []);

          for (const caja of cajas) {
            const cajaPath = path.join(sucursalPath, caja);
            const cajaStat = await fs.stat(cajaPath).catch(() => null);
            if (!cajaStat?.isDirectory()) continue;

            // Leer voucher-index.json
            const indexPath = path.join(cajaPath, 'voucher-index.json');
            try {
              const content = await fs.readFile(indexPath, 'utf-8');
              const index: Record<string, { voucherUrl: string; subidoEl: string }> = JSON.parse(content);
              const entries = Object.entries(index).map(([id, data]) => ({
                id,
                voucherUrl: data.voucherUrl,
                subidoEl: data.subidoEl,
              }));

              if (entries.length > 0) {
                results.push({
                  sucursal,
                  year,
                  ciclo,
                  caja,
                  vouchers: entries,
                });
              }
            } catch (e) {
              console.log(`[DEBUG /api/vouchers] No se pudo leer índice en ${year}/${ciclo}/${sucursal}/${caja}`);
            }
          }
        }
      }
    }

    console.log(`[DEBUG /api/vouchers] Total resultados: ${results.length} grupos`);
    return NextResponse.json(results);
  } catch (error) {
    console.error('Error en GET /api/vouchers:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

/**
 * Normaliza el sheet a nombre de carpeta de caja
 */
function normalizeCaja(sheet: string): string {
  const s = (sheet || '').toUpperCase().trim();
  if (s.includes('CHICA') || s === 'HOJA 1' || s.includes('GENERAL')) return 'CAJA-CHICA';
  if (s.includes('CLIENTES')) return 'CLIENTES';
  if (s.includes('INSTALACIONES')) return 'INSTALACIONES';
  if (s.includes('OTROS')) return 'OTROS-GASTOS';
  return s.replace(/\s+/g, '-');
}

/**
 * DELETE /api/vouchers
 * 
 * Borra un voucher (imagen + entrada del índice).
 * Body (JSON):
 *   { id: "SAN-MIGUEL-2026-01-W3-CLIENTES-F6" }
 * 
 * Extrae sucursal/año/mes del ID y calcula el ciclo Flynet.
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const rawId = body.id as string;

    if (!rawId) {
      return NextResponse.json({ success: false, error: 'Falta parámetro: id' }, { status: 400 });
    }

    // Extraer componentes del ID: SUCURSAL-YYYY-MM-WX-CATEGORIA-FXX
    const normalized = rawId.trim().toUpperCase().replace(/[\s_]/g, '-');
    const idMatch = normalized.match(/^(.+)-(\d{4})-(\d{2})-W\d-(.+)-F\d+$/);
    
    if (!idMatch) {
      return NextResponse.json({ success: false, error: 'ID con formato inválido' }, { status: 400 });
    }

    const sucursal = idMatch[1];
    const year = idMatch[2];
    const month = idMatch[3];
    const cajaFromId = idMatch[4];
    const caja = normalizeCaja(cajaFromId);

    // Calcular ciclo Flynet
    const { getCycleFromDate } = await import('@/lib/cycles');
    const ciclo = getCycleFromDate(`${year}-${month}-25`);
    const cicloId = ciclo.id;

    const cajaDir = path.join(STORAGE_PATH, 'vouchers', year, cicloId, sucursal, caja);
    const indexPath = path.join(cajaDir, 'voucher-index.json');

    // Leer índice actual
    let index: Record<string, { voucherUrl: string; subidoEl: string }> = {};
    try {
      const content = await fs.readFile(indexPath, 'utf-8');
      index = JSON.parse(content);
    } catch {
      return NextResponse.json({ success: false, error: 'No se encontró el índice de vouchers' }, { status: 404 });
    }

    if (!index[normalized]) {
      return NextResponse.json({ success: false, error: 'Voucher no encontrado' }, { status: 404 });
    }

    // Borrar la imagen
    const files = await fs.readdir(cajaDir);
    for (const file of files) {
      if (file.startsWith(normalized + '_voucher')) {
        await fs.unlink(path.join(cajaDir, file));
      }
    }

    // Eliminar del índice
    delete index[normalized];
    await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8');

    // Si el índice quedó vacío, borrar el archivo
    if (Object.keys(index).length === 0) {
      await fs.unlink(indexPath);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error en DELETE /api/vouchers:', error);
    return NextResponse.json({ success: false, error: 'Error interno' }, { status: 500 });
  }
}
