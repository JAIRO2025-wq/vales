import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { type VoucherRecord, normalizeId, formatVoucherForApi } from '@/app/actions/vouchers';
import { getCycleFromDate } from '@/lib/cycles';

const STORAGE_PATH = path.join(process.cwd(), 'src/data/storage');

/**
 * POST /api/estado/batch
 *
 * Consulta masiva de estados. Acepta hasta 500 IDs en una sola llamada.
 *
 * Body (JSON):
 *   { ids: string[], fechas?: Record<string, string> }
 *
 *   - ids: array de IDs de vales (ej: ["MORAZAN-2026-06-W2-OTROSGASTOS-F6", ...])
 *   - fechas: opcional, mapa de id→fecha para resolver el ciclo exacto.
 *             Si no se provee, se extrae la fecha del propio ID.
 *
 * Response:
 *   { resultados: { [id]: { firmado, comprobante, pdfUrl, ... } } }
 *   Los IDs que no existen se devuelven con firmado: false.
 *
 * USO DESDE GOOGLE APPS SCRIPT:
 *
 *   var payload = {
 *     ids: ["MORAZAN-2026-06-W2-OTROSGASTOS-F6", "MORAZAN-2026-06-W2-CAJACHICA-F12"]
 *   };
 *   var options = {
 *     method: "POST",
 *     contentType: "application/json",
 *     payload: JSON.stringify(payload),
 *     muteHttpExceptions: true
 *   };
 *   var response = UrlFetchApp.fetch("https://.../api/estado/batch", options);
 *   var data = JSON.parse(response.getContentText());
 *   // data.resultados["MORAZAN-2026-06-W2-OTROSGASTOS-F6"].firmado → true/false
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const ids: string[] = body.ids || [];
    const fechas: Record<string, string> = body.fechas || {};

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'Se requiere un array de IDs' }, { status: 400 });
    }

    // Limitar a 500 IDs por lote para evitar timeouts
    if (ids.length > 500) {
      return NextResponse.json({ error: 'Máximo 500 IDs por consulta' }, { status: 400 });
    }

    const resultados: Record<string, any> = {};
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || "";
    const protocol = request.headers.get('x-forwarded-proto') || "https";
    let origin = `${protocol}://${host}`;
    if (host.includes('localhost') || host.includes('0.0.0.0') || !host) {
      origin = "https://vales01.modulos.uk";
    }

    // Agrupar por ciclo para leer cada archivo solo una vez
    const grupos: Record<string, { id: string; fecha: string }[]> = {};

    for (const rawId of ids) {
      const targetId = await normalizeId(rawId);
      if (!targetId) continue;

      const fecha = fechas[rawId] || fechas[targetId] || '';
      let cycleId: string;
      let year: string;

      if (fecha) {
        const cycle = getCycleFromDate(fecha);
        cycleId = cycle.id;
        year = cycle.year.toString();
      } else {
        const yearMatch = targetId.match(/\d{4}/);
        const monthMatch = targetId.match(/-(\d{2})-/);
        if (!yearMatch || !monthMatch) {
          resultados[targetId] = { id: targetId, firmado: false, comprobante: false, error: "ID sin fecha" };
          continue;
        }
        year = yearMatch[0];
        cycleId = `${year}-${monthMatch[1]}`;
      }

      const key = `${year}/${cycleId}`;
      if (!grupos[key]) grupos[key] = [];
      grupos[key].push({ id: targetId, fecha });
    }

    // Leer cada archivo de ciclo una sola vez
    for (const [key, items] of Object.entries(grupos)) {
      const [year, cycleId] = key.split('/');
      const filePath = path.join(STORAGE_PATH, year, cycleId, 'vouchers.json');

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const vouchers: VoucherRecord[] = JSON.parse(content);

        for (const item of items) {
          const voucher = vouchers.find(
            v => v.id.toUpperCase().replace(/[\s_]/g, '-') === item.id
          );

          if (voucher) {
            const formatted = await formatVoucherForApi(voucher, origin);
            resultados[item.id] = formatted;
          } else {
            resultados[item.id] = {
              id: item.id,
              firmado: false,
              comprobante: false,
              pdfUrl: null,
              fechaFirma: null,
              firmante: null,
              motivoOmitido: null,
              concepto: null,
              archivado: false,
              voucherUrl: null,
              voucherSubido: false,
            };
          }
        }
      } catch {
        // Archivo no existe → todos los IDs de este ciclo no existen
        for (const item of items) {
          resultados[item.id] = {
            id: item.id,
            firmado: false,
            comprobante: false,
            pdfUrl: null,
            fechaFirma: null,
            firmante: null,
            motivoOmitido: null,
            concepto: null,
            archivado: false,
            voucherUrl: null,
            voucherSubido: false,
          };
        }
      }
    }

    return NextResponse.json({ resultados });

  } catch (error) {
    console.error("Error en batch API:", error);
    return NextResponse.json({ error: 'Error interno', resultados: {} }, { status: 500 });
  }
}
