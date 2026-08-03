import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { getCycleFromDate } from '@/lib/cycles';

const STORAGE_PATH = path.join(process.cwd(), 'src/data/storage');

/** Normaliza el nombre de sheet a un nombre de carpeta limpio */
function normalizeCaja(sheet: string): string {
  const s = (sheet || '').toUpperCase().trim();
  if (s.includes('CHICA') || s === 'HOJA 1' || s.includes('GENERAL')) return 'CAJA-CHICA';
  if (s.includes('CLIENTES')) return 'CLIENTES';
  if (s.includes('INSTALACIONES')) return 'INSTALACIONES';
  if (s.includes('OTROS')) return 'OTROS-GASTOS';
  return s.replace(/\s+/g, '-');
}

/**
 * GET /api/voucher-status
 * 
 * Verifica si un vale ya tiene un voucher subido.
 * Parámetros: ?id=MORAZAN-2026-06-W5-CLIENTES-F63&fecha=2026-06-24
 * 
 * La verificación se hace contra el archivo voucher-index.json
 * en la estructura jerárquica: vouchers/{año}/{ciclo}/{sucursal}/{caja}/
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawId = searchParams.get('id');

    if (!rawId) {
      return NextResponse.json({ error: 'Falta parámetro: id' }, { status: 400 });
    }

    // Extraer componentes del ID: SUCURSAL-YYYY-MM-WX-CATEGORIA-FXX
    // La sucursal puede contener guiones (ej: SAN-MIGUEL, CARA-SUCIA)
    const normalized = rawId.trim().toUpperCase().replace(/[\s_]/g, '-').replace(/[^a-zA-Z0-9\-]/g, '');
    const idMatch = normalized.match(/^(.+)-(\d{4})-(\d{2})-W\d-(.+)-F\d+$/);

    if (!idMatch) {
      // Intentar patrón flexible: SUCURSAL-YYYY-MM-... (para IDs sin WX)
      const dateMatch = normalized.match(/^(.+)-(\d{4})-(\d{2})-/);
      if (!dateMatch) {
        return NextResponse.json({ error: 'ID con formato inválido. Debe contener AAAA-MM' }, { status: 400 });
      }
      // Sin info de caja en el ID, no podemos buscar en la estructura jerárquica
      return NextResponse.json({ voucherSubido: false, voucherUrl: null });
    }

    const sucursal = idMatch[1];
    const year = idMatch[2];
    const month = idMatch[3];
    const cajaFromId = idMatch[4];

    const targetId = normalized;
    const caja = normalizeCaja(cajaFromId);

    // Calcular el ciclo al que pertenece este vale según su fecha
    const fechaRef = `${year}-${month}-25`;
    const cycle = getCycleFromDate(fechaRef);
    const cicloId = cycle.id;

    // ===== NUEVA ESTRUCTURA: vouchers/{year}/{ciclo}/{sucursal}/{caja}/voucher-index.json =====
    const indexPath = path.join(STORAGE_PATH, 'vouchers', year, cicloId, sucursal, caja, 'voucher-index.json');

    try {
      const content = await fs.readFile(indexPath, 'utf-8');
      const index: Record<string, { voucherUrl: string; subidoEl: string }> = JSON.parse(content);

      if (index[targetId]) {
        return NextResponse.json({
          voucherSubido: true,
          voucherUrl: index[targetId].voucherUrl,
          subidoEl: index[targetId].subidoEl,
        });
      }
    } catch {
      // No existe el índice — probar estructura antigua
    }

    // ===== ESTRUCTURA ANTIGUA: vouchers/{year}/{sucursal}/{month}/*_voucher.* =====
    const oldDir = path.join(STORAGE_PATH, 'vouchers', year, sucursal, month);
    try {
      const files = await fs.readdir(oldDir);
      const match = files.find(f => f.startsWith(targetId + '_voucher'));
      if (match) {
        const fileStat = await fs.stat(path.join(oldDir, match));
        const relativePath = `vouchers/${year}/${sucursal}/${month}/${match}`;
        const voucherUrl = `/api/imagenes?fecha=${year}-${month}-25&file=${encodeURIComponent(relativePath)}`;
        return NextResponse.json({
          voucherSubido: true,
          voucherUrl,
          subidoEl: fileStat.mtime.toISOString(),
        });
      }
    } catch {
      // No existe en estructura antigua
    }

    return NextResponse.json({
      voucherSubido: false,
      voucherUrl: null,
    });
  } catch (error) {
    console.error('Error en voucher-status:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
