import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

const STORAGE_PATH = path.join(process.cwd(), 'src/data/storage');

/**
 * GET /api/voucher-status
 * 
 * Verifica si un vale ya tiene un voucher subido.
 * Parámetros: ?id=MORAZAN-2026-06-W5-CLIENTES-F63&fecha=2026-06-24
 * 
 * La verificación se hace contra el archivo voucher-index.json
 * en la carpeta vouchers/{año}/{sucursal}/{mes}/
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawId = searchParams.get('id');

    if (!rawId) {
      return NextResponse.json({ error: 'Falta parámetro: id' }, { status: 400 });
    }

    // Extraer sucursal, año y mes del ID
    // Formato: SUCURSAL-YYYY-MM-WX-SHEET-FXX
    // La sucursal puede contener guiones (ej: SAN-MIGUEL)
    // Buscamos el patrón YYYY-MM para ubicar año y mes
    const normalized = rawId.trim().toUpperCase().replace(/[\s_]/g, '-').replace(/[^a-zA-Z0-9\-]/g, '');
    const dateMatch = normalized.match(/^(.+)-(\d{4})-(\d{2})-/);
    
    if (!dateMatch) {
      return NextResponse.json({ error: 'ID con formato inválido. Debe contener AAAA-MM' }, { status: 400 });
    }

    const sucursal = dateMatch[1]; // todo antes del año
    const year = dateMatch[2];
    const month = dateMatch[3]; // MM

    // IMPORTANTE: Siempre usamos año y mes del ID, NO del parámetro fecha.
    // El ID tiene el formato SUCURSAL-YYYY-MM-... donde YYYY-MM es la fecha
    // real del vale. El parámetro ?fecha= puede ser la fecha de hoy y no
    // corresponde al mes donde se guardó el voucher.
    const targetYear = year;
    const targetMonth = month;

    const targetId = normalized;
    const indexPath = path.join(STORAGE_PATH, 'vouchers', targetYear, sucursal, targetMonth, 'voucher-index.json');

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
      // No existe el índice o el archivo → no hay voucher
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
