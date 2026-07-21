/**
 * Script de migración: mueve los vouchers.json de estructura plana
 * ({year}/{cycleId}/vouchers.json) a la nueva estructura jerárquica
 * ({year}/{cycleId}/{sucursal}/{caja}/vouchers.json).
 *
 * Ejecutar con: node scripts/migrate-storage.mjs
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_PATH = path.join(__dirname, '..', 'src', 'data', 'storage');

function normalizeCajaFolder(sheet) {
  const s = (sheet || '').toUpperCase().trim();
  if (s.includes('CHICA') || s === 'HOJA 1' || s.includes('GENERAL')) return 'CAJA-CHICA';
  if (s.includes('CLIENTES')) return 'CLIENTES';
  if (s.includes('INSTALACIONES')) return 'INSTALACIONES';
  if (s.includes('OTROS')) return 'OTROS-GASTOS';
  return s.replace(/\s+/g, '-');
}

async function migrate() {
  console.log('🔍 Escaneando estructura de storage...\n');

  const years = await fs.readdir(STORAGE_PATH, { withFileTypes: true });
  let migrated = 0;
  let skipped = 0;

  for (const yearDir of years) {
    if (!yearDir.isDirectory()) continue;
    // Saltar carpetas especiales
    if (yearDir.name === 'firmas-autorizadas' || yearDir.name === 'vouchers') continue;

    const yearPath = path.join(STORAGE_PATH, yearDir.name);
    const cycles = await fs.readdir(yearPath, { withFileTypes: true });

    for (const cycleDir of cycles) {
      if (!cycleDir.isDirectory()) continue;

      const flatPath = path.join(yearPath, cycleDir.name, 'vouchers.json');

      try {
        const content = await fs.readFile(flatPath, 'utf-8');
        const vouchers = JSON.parse(content);

        if (!Array.isArray(vouchers) || vouchers.length === 0) {
          console.log(`⏭️  ${yearDir.name}/${cycleDir.name} - vacío, saltando`);
          skipped++;
          continue;
        }

        // Agrupar por sucursal/caja
        const groups = new Map();
        for (const v of vouchers) {
          const sucursal = (v.sucursal || 'SIN-SUCURSAL').toUpperCase().replace(/\s+/g, '-');
          const caja = normalizeCajaFolder(v.sheet || 'GENERAL');
          const key = `${sucursal}/${caja}`;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(v);
        }

        // Escribir en nueva estructura
        for (const [key, groupVouchers] of groups) {
          const dirPath = path.join(yearPath, cycleDir.name, key);
          await fs.mkdir(dirPath, { recursive: true });
          await fs.writeFile(
            path.join(dirPath, 'vouchers.json'),
            JSON.stringify(groupVouchers, null, 2),
            'utf-8'
          );
        }

        // Eliminar archivo plano antiguo
        await fs.unlink(flatPath);

        const sucursales = [...groups.keys()].map(k => k.split('/')[0]);
        const uniqueSucursales = [...new Set(sucursales)];
        console.log(`✅ ${yearDir.name}/${cycleDir.name} → ${vouchers.length} vales en ${uniqueSucursales.length} sucursal(es) [${uniqueSucursales.join(', ')}]`);
        migrated++;

      } catch (err) {
        if (err.code === 'ENOENT') {
          // No hay archivo plano, ya migrado o nunca existió
          console.log(`⏭️  ${yearDir.name}/${cycleDir.name} - ya migrado (sin archivo plano)`);
          skipped++;
        } else {
          console.error(`❌ ${yearDir.name}/${cycleDir.name} - error:`, err.message);
        }
      }
    }
  }

  console.log(`\n🎉 Migración completada: ${migrated} ciclos migrados, ${skipped} saltados.`);
}

migrate().catch(console.error);
