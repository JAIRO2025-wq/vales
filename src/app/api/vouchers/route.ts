import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { getCycleFromDate } from '@/lib/cycles';

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

// ──────────────── Helpers ────────────────

/** Normaliza el sheet a nombre de carpeta de caja */
function normalizeCaja(sheet: string): string {
  const s = (sheet || '').toUpperCase().trim();
  if (s.includes('CHICA') || s === 'HOJA 1' || s.includes('GENERAL')) return 'CAJA-CHICA';
  if (s.includes('CLIENTES')) return 'CLIENTES';
  if (s.includes('INSTALACIONES')) return 'INSTALACIONES';
  if (s.includes('OTROS')) return 'OTROS-GASTOS';
  return s.replace(/\s+/g, '-');
}

/** Extrae ID y caja de un nombre de archivo voucher: SUCURSAL-YYYY-MM-WX-CATEGORIA-FXX_voucher.ext */
function parseVoucherFilename(filename: string): { id: string; caja: string } | null {
  const match = filename.match(/^(.+)_voucher\.\w+$/i);
  if (!match) return null;
  const id = match[1].toUpperCase().replace(/[\s_]/g, '-').replace(/[^A-Z0-9\-]/g, '');
  const idMatch = id.match(/^.+-\d{4}-\d{2}-W\d-(.+)-F\d+$/);
  const caja = idMatch ? normalizeCaja(idMatch[1]) : 'SIN-CAJA';
  return { id, caja };
}

/**
 * Un ciclo Flynet "YYYY-MM" cubre desde el día 20 de MM hasta el día 19 de MM+1.
 * En estructura OLD solo tenemos granularidad de mes, así que verificamos si un archivo
 * en una carpeta de mes podría pertenecer al ciclo probando día 15 y día 25.
 */
function voucherMonthInCycle(year: string, month: string, targetCiclo: string): boolean {
  const ref15 = getCycleFromDate(`${year}-${month}-15`);
  const ref25 = getCycleFromDate(`${year}-${month}-25`);
  return ref15.id === targetCiclo || ref25.id === targetCiclo;
}

// ──────────────── Escaneo de estructuras ────────────────

/** Escanea estructura NUEVA: vouchers/{year}/{ciclo}/{sucursal}/{caja}/voucher-index.json */
async function scanNewStructure(
  cicloPath: string,
  year: string,
  ciclo: string,
  filterSucursal: string | null,
  results: VoucherListResponse[]
) {
  const sucursalesRaw = await fs.readdir(cicloPath).catch(() => []);
  const sucursales = filterSucursal ? [filterSucursal] : sucursalesRaw;

  for (const sucursal of sucursales) {
    const sucursalPath = path.join(cicloPath, sucursal);
    if (!(await fs.stat(sucursalPath).catch(() => null))?.isDirectory()) continue;

    const cajas = await fs.readdir(sucursalPath).catch(() => []);
    for (const caja of cajas) {
      const cajaPath = path.join(sucursalPath, caja);
      if (!(await fs.stat(cajaPath).catch(() => null))?.isDirectory()) continue;

      try {
        const content = await fs.readFile(path.join(cajaPath, 'voucher-index.json'), 'utf-8');
        const index: Record<string, { voucherUrl: string; subidoEl: string }> = JSON.parse(content);
        const entries = Object.entries(index).map(([id, data]) => ({
          id,
          voucherUrl: data.voucherUrl,
          subidoEl: data.subidoEl,
        }));
        if (entries.length > 0) {
          results.push({ sucursal, year, ciclo, caja, vouchers: entries });
        }
      } catch {
        // Sin índice en esta caja
      }
    }
  }
}

/** Escanea estructura ANTIGUA: vouchers/{year}/{sucursal}/{month}/*_voucher.* */
async function scanOldStructure(
  sucursalPath: string,
  year: string,
  sucursal: string,
  filterSucursal: string | null,
  filterCiclo: string | null,
  results: VoucherListResponse[]
) {
  if (filterSucursal && sucursal !== filterSucursal) return;

  const monthEntries = await fs.readdir(sucursalPath).catch(() => []);

  for (const month of monthEntries) {
    // Solo directorios de mes numérico (06, 07, 08...)
    if (!/^\d{2}$/.test(month)) continue;

    const monthPath = path.join(sucursalPath, month);
    if (!(await fs.stat(monthPath).catch(() => null))?.isDirectory()) continue;

    // Si hay filtro de ciclo, verificar que este mes pueda contener vouchers del ciclo
    if (filterCiclo && !voucherMonthInCycle(year, month, filterCiclo)) continue;

    const files = await fs.readdir(monthPath).catch(() => []);
    const byCaja = new Map<string, VoucherEntry[]>();

    for (const file of files) {
      const parsed = parseVoucherFilename(file);
      if (!parsed) continue;

      // Verificación fina con filtro de ciclo: el mes en el ID del archivo
      // debe poder pertenecer al ciclo (prueba con día 15 y 25)
      if (filterCiclo) {
        const idMonthMatch = parsed.id.match(/-(\d{4})-(\d{2})-/);
        if (idMonthMatch) {
          const idYear = idMonthMatch[1];
          const idMonth = idMonthMatch[2];
          if (!voucherMonthInCycle(idYear, idMonth, filterCiclo)) continue;
        }
      }

      const fileStat = await fs.stat(path.join(monthPath, file)).catch(() => null);
      const subidoEl = fileStat?.mtime.toISOString() || '';

      // Construir URL pública
      const relativePath = `vouchers/${year}/${sucursal}/${month}/${file}`;
      const url = `/api/imagenes?fecha=${year}-${month}-25&file=${encodeURIComponent(relativePath)}`;

      const entry: VoucherEntry = { id: parsed.id, voucherUrl: url, subidoEl };
      if (!byCaja.has(parsed.caja)) byCaja.set(parsed.caja, []);
      byCaja.get(parsed.caja)!.push(entry);
    }

    // Ciclo para agrupar (aproximación con día 25 — suficiente para agrupación visual)
    const ciclo = getCycleFromDate(`${year}-${month}-25`).id;

    for (const [caja, vouchers] of byCaja) {
      if (vouchers.length > 0) {
        results.push({ sucursal, year, ciclo, caja, vouchers });
      }
    }
  }
}

// ──────────────── Handlers ────────────────

/**
 * GET /api/vouchers
 *
 * Lista todos los vouchers subidos, soportando ambas estructuras:
 * - NUEVA:  vouchers/{year}/{ciclo}/{sucursal}/{caja}/voucher-index.json
 * - ANTIGUA: vouchers/{year}/{sucursal}/{month}/*_voucher.*
 *
 * Parámetros: ?ciclo=2026-07  |  ?sucursal=SAN-MIGUEL
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filterSucursal = searchParams.get('sucursal')?.toUpperCase().replace(/\s+/g, '-') || null;
    const filterCiclo = searchParams.get('ciclo') || null;
    const filterYear = filterCiclo ? filterCiclo.split('-')[0] : null;

    const vouchersDir = path.join(STORAGE_PATH, 'vouchers');
    const results: VoucherListResponse[] = [];

    try { await fs.access(vouchersDir); } catch { return NextResponse.json([]); }

    const years = filterYear ? [filterYear] : await fs.readdir(vouchersDir);

    for (const year of years) {
      const yearPath = path.join(vouchersDir, year);
      if (!(await fs.stat(yearPath).catch(() => null))?.isDirectory()) continue;

      const entries = await fs.readdir(yearPath).catch(() => []);

      for (const entry of entries) {
        const entryPath = path.join(yearPath, entry);
        if (!(await fs.stat(entryPath).catch(() => null))?.isDirectory()) continue;

        // Detectar estructura por el formato del nombre del directorio
        if (/^\d{4}-\d{2}$/.test(entry)) {
          // ── NUEVA ESTRUCTURA: entry es un ciclo (YYYY-MM) ──
          if (!filterCiclo || entry === filterCiclo) {
            await scanNewStructure(entryPath, year, entry, filterSucursal, results);
          }
        } else {
          // ── ESTRUCTURA ANTIGUA: entry es una sucursal ──
          await scanOldStructure(entryPath, year, entry, filterSucursal, filterCiclo, results);
        }
      }
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error('Error en GET /api/vouchers:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

/**
 * Recorre recursivamente los vouchers.json dentro de storage/{year}/{ciclo}/
 * y limpia voucherUrl / voucherSubido del registro con el ID dado.
 * Así, al borrar un voucher, los endpoints de estado (Google) dejan de
 * reportar "ya existe" aunque el vale siga en el sistema.
 */
async function clearVoucherFromRecords(year: string, ciclo: string, targetId: string) {
  const cycleRoot = path.join(STORAGE_PATH, year, ciclo);
  async function walk(dir: string) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else if (entry.name === 'vouchers.json') {
          try {
            const content = await fs.readFile(full, 'utf-8');
            const list = JSON.parse(content);
            if (!Array.isArray(list)) continue;
            let changed = false;
            for (const v of list) {
              if (v.id && v.id.trim().toUpperCase().replace(/[\s_]/g, '-') === targetId) {
                if (v.voucherUrl || v.voucherSubido) changed = true;
                v.voucherUrl = undefined;
                v.voucherSubido = false;
              }
            }
            if (changed) {
              await fs.writeFile(full, JSON.stringify(list, null, 2), 'utf-8');
            }
          } catch { /* JSON corrupto, ignorar */ }
        }
      }
    } catch { /* directorio no existe */ }
  }
  await walk(cycleRoot);
}

/**
 * DELETE /api/vouchers
 *
 * Borra un voucher (imagen + entrada del índice + registro del vale).
 * Soporta ambas estructuras: NUEVA (voucher-index.json) y ANTIGUA (*_voucher.*)
 *
 * Body: { id: "USULUTAN-2026-06-W3-CLIENTES-F7" }
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const rawId = body.id as string;
    if (!rawId) {
      return NextResponse.json({ success: false, error: 'Falta parámetro: id' }, { status: 400 });
    }

    const normalized = rawId.trim().toUpperCase().replace(/[\s_]/g, '-').replace(/[^A-Z0-9\-]/g, '');
    const idMatch = normalized.match(/^(.+)-(\d{4})-(\d{2})-W\d-(.+)-F\d+$/);
    if (!idMatch) {
      return NextResponse.json({ success: false, error: 'ID con formato inválido' }, { status: 400 });
    }

    const sucursal = idMatch[1];
    const year = idMatch[2];
    const month = idMatch[3];
    const caja = normalizeCaja(idMatch[4]);
    const ciclo = getCycleFromDate(`${year}-${month}-25`).id;

    let deleted = false;

    // ── 1. NUEVA ESTRUCTURA: voucher-index.json + imagen ──
    const newDir = path.join(STORAGE_PATH, 'vouchers', year, ciclo, sucursal, caja);
    const newIndex = path.join(newDir, 'voucher-index.json');
    try {
      const content = await fs.readFile(newIndex, 'utf-8');
      const index: Record<string, { voucherUrl: string; subidoEl: string }> = JSON.parse(content);

      if (index[normalized]) {
        const files = await fs.readdir(newDir).catch(() => []);
        for (const file of files) {
          if (file.startsWith(normalized + '_voucher')) {
            await fs.unlink(path.join(newDir, file));
          }
        }
        delete index[normalized];
        if (Object.keys(index).length === 0) {
          await fs.unlink(newIndex);
        } else {
          await fs.writeFile(newIndex, JSON.stringify(index, null, 2), 'utf-8');
        }
        deleted = true;
      }
    } catch {
      // No existe en nueva estructura
    }

    // ── 2. ESTRUCTURA ANTIGUA: imagen suelta (se borra también si existe) ──
    const oldDir = path.join(STORAGE_PATH, 'vouchers', year, sucursal, month);
    try {
      const files = await fs.readdir(oldDir);
      const match = files.find(f => f.startsWith(normalized + '_voucher'));
      if (match) {
        await fs.unlink(path.join(oldDir, match));
        deleted = true;
      }
    } catch {
      // No existe en estructura antigua
    }

    if (!deleted) {
      return NextResponse.json({ success: false, error: 'Voucher no encontrado en ninguna estructura' }, { status: 404 });
    }

    // ── 3. Limpiar el registro del vale (voucherUrl/voucherSubido) ──
    // Necesario para que /api/estado y checkVoucherStatusAction dejen de reportar "ya existe"
    await clearVoucherFromRecords(year, ciclo, normalized);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error en DELETE /api/vouchers:', error);
    return NextResponse.json({ success: false, error: 'Error interno' }, { status: 500 });
  }
}
