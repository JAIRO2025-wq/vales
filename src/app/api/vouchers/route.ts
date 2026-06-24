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
  month: string;
  vouchers: VoucherEntry[];
}

/**
 * GET /api/vouchers
 * 
 * Lista todos los vouchers subidos.
 * Parámetros opcionales:
 *   ?ciclo=2026-06        → filtra por ciclo (YYYY-MM)
 *   ?sucursal=SAN-MIGUEL  → filtra por sucursal
 *   ?year=2026&month=06   → filtra por año/mes específico
 * 
 * Sin parámetros, devuelve todos los vouchers de todas las sucursales.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filterSucursal = searchParams.get('sucursal')?.toUpperCase() || null;
    const filterCiclo = searchParams.get('ciclo') || null; // YYYY-MM
    const filterYear = searchParams.get('year') || null;
    const filterMonth = searchParams.get('month') || null;

    // Si se pasa ?ciclo=, extraer año y mes
    const effectiveYear = filterYear || (filterCiclo ? filterCiclo.split('-')[0] : null);
    const effectiveMonth = filterMonth || (filterCiclo ? filterCiclo.split('-')[1] : null);

    console.log('[DEBUG /api/vouchers] Parámetros:', {
      filterSucursal, filterCiclo, filterYear, filterMonth,
      effectiveYear, effectiveMonth
    });

    const vouchersDir = path.join(STORAGE_PATH, 'vouchers');
    const results: VoucherListResponse[] = [];

    // Verificar que existe la carpeta vouchers
    try {
      await fs.access(vouchersDir);
    } catch {
      console.log('[DEBUG /api/vouchers] Carpeta vouchers no existe');
      return NextResponse.json([]);
    }

    // Recorrer años
    const years = effectiveYear ? [effectiveYear] : await fs.readdir(vouchersDir);
    console.log('[DEBUG /api/vouchers] Años a recorrer:', years);
    
    for (const year of years) {
      const yearPath = path.join(vouchersDir, year);
      const yearStat = await fs.stat(yearPath).catch(() => null);
      if (!yearStat?.isDirectory()) {
        console.log(`[DEBUG /api/vouchers] ${yearPath} no es directorio, saltando`);
        continue;
      }

      // Recorrer sucursales
      const sucursalesRaw = await fs.readdir(yearPath).catch(() => []);
      console.log(`[DEBUG /api/vouchers] Sucursales en ${year}:`, sucursalesRaw);
      const sucursales = filterSucursal ? [filterSucursal] : sucursalesRaw;
      
      for (const sucursal of sucursales) {
        const sucursalPath = path.join(yearPath, sucursal);
        const sucStat = await fs.stat(sucursalPath).catch(() => null);
        if (!sucStat?.isDirectory()) {
          console.log(`[DEBUG /api/vouchers] ${sucursalPath} no es directorio, saltando`);
          continue;
        }

        // Recorrer meses
        const monthsRaw = await fs.readdir(sucursalPath).catch(() => []);
        console.log(`[DEBUG /api/vouchers] Meses en ${year}/${sucursal}:`, monthsRaw);
        const months = effectiveMonth ? [effectiveMonth] : monthsRaw;
        
        for (const month of months) {
          const monthPath = path.join(sucursalPath, month);
          const monthStat = await fs.stat(monthPath).catch(() => null);
          if (!monthStat?.isDirectory()) {
            console.log(`[DEBUG /api/vouchers] ${monthPath} no es directorio, saltando`);
            continue;
          }

          // Leer voucher-index.json
          const indexPath = path.join(monthPath, 'voucher-index.json');
          try {
            const content = await fs.readFile(indexPath, 'utf-8');
            const index: Record<string, { voucherUrl: string; subidoEl: string }> = JSON.parse(content);
            const entries = Object.entries(index).map(([id, data]) => ({
              id,
              voucherUrl: data.voucherUrl,
              subidoEl: data.subidoEl,
            }));

            console.log(`[DEBUG /api/vouchers] ${year}/${sucursal}/${month}: ${entries.length} vouchers`);

            if (entries.length > 0) {
              results.push({
                sucursal,
                year,
                month,
                vouchers: entries,
              });
            }
          } catch (e) {
            console.log(`[DEBUG /api/vouchers] No se pudo leer índice en ${year}/${sucursal}/${month}:`, (e as Error).message);
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
 * DELETE /api/vouchers
 * 
 * Borra un voucher (imagen + entrada del índice).
 * Body (JSON):
 *   { id: "SAN-MIGUEL-2026-01-W3-CLIENTES-F6" }
 * 
 * El endpoint extrae sucursal/año/mes del ID automáticamente.
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const rawId = body.id as string;

    if (!rawId) {
      return NextResponse.json({ success: false, error: 'Falta parámetro: id' }, { status: 400 });
    }

    // Extraer componentes del ID
    const normalized = rawId.trim().toUpperCase().replace(/[\s_]/g, '-');
    const dateMatch = normalized.match(/^(.+)-(\d{4})-(\d{2})-/);
    
    if (!dateMatch) {
      return NextResponse.json({ success: false, error: 'ID con formato inválido' }, { status: 400 });
    }

    const sucursal = dateMatch[1];
    const year = dateMatch[2];
    const month = dateMatch[3];

    const monthDir = path.join(STORAGE_PATH, 'vouchers', year, sucursal, month);
    const indexPath = path.join(monthDir, 'voucher-index.json');

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

    // Borrar la imagen (buscar por nombre que empiece con el ID)
    const files = await fs.readdir(monthDir);
    for (const file of files) {
      if (file.startsWith(normalized + '_voucher')) {
        await fs.unlink(path.join(monthDir, file));
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
