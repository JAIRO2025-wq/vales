/**
 * Sincroniza los voucher-index.json con los vouchers.json de cada ciclo.
 * 
 * Lee todos los índices de vouchers subidos y actualiza los registros
 * en vouchers.json para que la app los muestre correctamente.
 * 
 * Uso: node scripts/sync-voucher-index.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_PATH = path.join(__dirname, '..', 'src', 'data', 'storage');
const VOUCHERS_DIR = path.join(STORAGE_PATH, 'vouchers');

function normalizeCaja(sheet) {
  const s = (sheet || '').toUpperCase().trim();
  if (s.includes('CHICA') || s === 'HOJA 1' || s.includes('GENERAL')) return 'CAJA-CHICA';
  if (s.includes('CLIENTES')) return 'CLIENTES';
  if (s.includes('INSTALACIONES')) return 'INSTALACIONES';
  if (s.includes('OTROS')) return 'OTROS-GASTOS';
  return s.replace(/\s+/g, '-');
}

function normalizeId(id) {
  return (id || '').trim().toUpperCase().replace(/[\s_]/g, '-');
}

/** Lee todos los vouchers.json de un ciclo (plano + jerárquico) */
function readAllVouchersInCycle(year, cicloId) {
  const cycleDir = path.join(STORAGE_PATH, String(year), cicloId);
  const allVouchers = [];

  // Escanear recursivamente
  function scan(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scan(full);
        } else if (entry.name === 'vouchers.json') {
          try {
            const content = fs.readFileSync(full, 'utf-8');
            const vouchers = JSON.parse(content);
            if (Array.isArray(vouchers)) allVouchers.push(...vouchers);
          } catch { /* ignorar */ }
        }
      }
    } catch { /* ignorar */ }
  }

  scan(cycleDir);

  // Deduplicar
  const seen = new Map();
  for (const v of allVouchers) {
    const key = normalizeId(v.id);
    if (!seen.has(key)) seen.set(key, v);
  }

  return Array.from(seen.values());
}

/** Escribe los vouchers en estructura jerárquica + plano */
function writeAllVouchersToCycle(year, cicloId, vouchers) {
  const yearStr = String(year);
  const cycleDir = path.join(STORAGE_PATH, yearStr, cicloId);

  // Agrupar por sucursal/caja
  const groups = new Map();
  for (const v of vouchers) {
    const sucursal = (v.sucursal || 'SIN-SUCURSAL').toUpperCase().replace(/\s+/g, '-');
    const caja = normalizeCaja(v.sheet || 'GENERAL');
    const key = `${sucursal}/${caja}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(v);
  }

  // Escribir grupos jerárquicos
  for (const [key, groupVouchers] of groups) {
    const dirPath = path.join(cycleDir, key);
    fs.mkdirSync(dirPath, { recursive: true });
    fs.writeFileSync(path.join(dirPath, 'vouchers.json'), JSON.stringify(groupVouchers, null, 2), 'utf-8');
  }

  // También escribir el plano como respaldo
  fs.writeFileSync(path.join(cycleDir, 'vouchers.json'), JSON.stringify(vouchers, null, 2), 'utf-8');

  return groups.size;
}

console.log('🔍 Escaneando vouchers en:', VOUCHERS_DIR);
console.log('');

let totalSynced = 0;
let totalOrphans = 0;
const orphans = [];

// Recorrer años
try {
  const years = fs.readdirSync(VOUCHERS_DIR);
  for (const year of years) {
    const yearPath = path.join(VOUCHERS_DIR, year);
    if (!fs.statSync(yearPath).isDirectory()) continue;

    // Recorrer ciclos
    const ciclos = fs.readdirSync(yearPath);
    for (const ciclo of ciclos) {
      const cicloPath = path.join(yearPath, ciclo);
      if (!fs.statSync(cicloPath).isDirectory()) continue;

      // Recorrer sucursales
      const sucursales = fs.readdirSync(cicloPath);
      for (const sucursal of sucursales) {
        const sucursalPath = path.join(cicloPath, sucursal);
        if (!fs.statSync(sucursalPath).isDirectory()) continue;

        // Recorrer cajas
        const cajas = fs.readdirSync(sucursalPath);
        for (const caja of cajas) {
          const cajaPath = path.join(sucursalPath, caja);
          if (!fs.statSync(cajaPath).isDirectory()) continue;

          // Leer voucher-index.json
          const indexPath = path.join(cajaPath, 'voucher-index.json');
          let index;
          try {
            index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
          } catch {
            continue;
          }

          if (Object.keys(index).length === 0) continue;

          // Leer vouchers del ciclo
          let vouchers = readAllVouchersInCycle(year, ciclo);

          let synced = 0;
          for (const [id, data] of Object.entries(index)) {
            const normalizedId = normalizeId(id);
            const idx = vouchers.findIndex(v => normalizeId(v.id) === normalizedId);

            if (idx >= 0) {
              // Actualizar voucher existente
              if (!vouchers[idx].voucherUrl || !vouchers[idx].voucherSubido) {
                vouchers[idx].voucherUrl = data.voucherUrl;
                vouchers[idx].voucherSubido = true;
                synced++;
                console.log(`  ✅ ${id} → sincronizado`);
              }
            } else {
              // Voucher huérfano: existe en índice pero no en vouchers.json
              totalOrphans++;
              orphans.push({ id, ciclo: `${year}/${ciclo}`, sucursal, caja, data });
              console.log(`  ⚠️  ${id} → HUÉRFANO (no existe en vouchers.json de ${year}/${ciclo})`);
            }
          }

          if (synced > 0) {
            const grupos = writeAllVouchersToCycle(year, ciclo, vouchers);
            totalSynced += synced;
            console.log(`  💾 ${year}/${ciclo}/${sucursal}/${caja}: ${synced} sincronizados (${grupos} grupos)`);
          }
        }
      }
    }
  }
} catch (e) {
  console.error('Error:', e.message);
}

console.log('');
console.log('═══════════════════════════════════');
console.log(`✅ Total sincronizados: ${totalSynced}`);
console.log(`⚠️  Total huérfanos:    ${totalOrphans}`);

if (orphans.length > 0) {
  console.log('');
  console.log('Vouchers huérfanos (no existen en vouchers.json):');
  for (const o of orphans) {
    console.log(`  - ${o.id} (${o.ciclo}/${o.sucursal}/${o.caja})`);
  }
  console.log('');
  console.log('Estos vouchers necesitan que el vale exista en el Google Sheet');
  console.log('y sea guardado por la app antes de poder sincronizarse.');
}

console.log('═══════════════════════════════════');
