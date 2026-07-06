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

    // Para cada ID, generar ciclos candidatos (primario + adyacentes)
    const grupos: Record<string, { id: string; fecha: string }[]> = {};
    const idsSinResultado = new Set<string>();

    for (const rawId of ids) {
      const targetId = await normalizeId(rawId);
      if (!targetId) continue;
      idsSinResultado.add(targetId);

      const fecha = fechas[rawId] || fechas[targetId] || '';
      let primaryCycle: { year: number; id: string };

      if (fecha) {
        primaryCycle = getCycleFromDate(fecha);
      } else {
        const yearMatch = targetId.match(/\d{4}/);
        const monthMatch = targetId.match(/-(\d{2})-/);
        if (!yearMatch || !monthMatch) {
          resultados[targetId] = { id: targetId, firmado: false, comprobante: false, error: "ID sin fecha" };
          idsSinResultado.delete(targetId);
          continue;
        }
        primaryCycle = { year: parseInt(yearMatch[0]), id: `${yearMatch[0]}-${monthMatch[1]}` };
      }

      // Ciclos candidatos: primario + mes anterior + mes siguiente
      const [pYear, pMonth] = primaryCycle.id.split('-').map(Number);
      const candidatos = [primaryCycle.id];
      if (pMonth > 1) candidatos.push(`${pYear}-${String(pMonth - 1).padStart(2, '0')}`);
      else candidatos.push(`${pYear - 1}-12`);
      if (pMonth < 12) candidatos.push(`${pYear}-${String(pMonth + 1).padStart(2, '0')}`);
      else candidatos.push(`${pYear + 1}-01`);

      for (const cid of candidatos) {
        const key = `${cid.split('-')[0]}/${cid}`;
        if (!grupos[key]) grupos[key] = [];
        grupos[key].push({ id: targetId, fecha });
      }
    }

    // Leer cada archivo de ciclo una sola vez, procesando en orden
    for (const [key, items] of Object.entries(grupos)) {
      const [year, cycleId] = key.split('/');
      const filePath = path.join(STORAGE_PATH, year, cycleId, 'vouchers.json');

      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const vouchers: VoucherRecord[] = JSON.parse(content);

        for (const item of items) {
          // Si ya encontramos este ID en un ciclo anterior, saltar
          if (!idsSinResultado.has(item.id)) continue;

          const voucher = vouchers.find(
            v => v.id.toUpperCase().replace(/[\s_]/g, '-') === item.id
          );

          if (voucher) {
            const formatted = await formatVoucherForApi(voucher, origin);
            resultados[item.id] = formatted;
            idsSinResultado.delete(item.id);
          }
        }
      } catch {
        // Archivo no existe en este ciclo, continuar con el siguiente
        continue;
      }
    }

    // Los IDs que aún no tienen resultado después de buscar en todos los ciclos
    for (const id of idsSinResultado) {
      if (!resultados[id]) {
        resultados[id] = {
          id,
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

    return NextResponse.json({ resultados });

  } catch (error) {
    console.error("Error en batch API:", error);
    return NextResponse.json({ error: 'Error interno', resultados: {} }, { status: 500 });
  }
}
