/**
 * Script de migración: mueve los vouchers bancarios de estructura
 * {year}/{sucursal}/{month}/ a {year}/{ciclo}/{sucursal}/{caja}/
 *
 * Ejecutar con: node scripts/migrate-vouchers.mjs
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_PATH = path.join(__dirname, '..', 'src', 'data', 'storage', 'vouchers');

function normalizeCaja(sheet) {
  const s = (sheet || '').toUpperCase().trim();
  if (s.includes('CHICA') || s === 'HOJA 1' || s.includes('GENERAL')) return 'CAJA-CHICA';
  if (s.includes('CLIENTES')) return 'CLIENTES';
  if (s.includes('INSTALACIONES')) return 'INSTALACIONES';
  if (s.includes('OTROS')) return 'OTROS-GASTOS';
  return s.replace(/\s+/g, '-');
}

function extractCajaFromId(id) {
  // ID: SUCURSAL-YYYY-MM-WX-CATEGORIA-FXX
  const match = id.match(/^.+-\d{4}-\d{2}-W\d-(.+)-F\d+$/);
  return match ? normalizeCaja(match[1]) : 'GENERAL';
}

async function migrate() {
  console.log('🔍 Escaneando vouchers existentes...\n');

  try {
    await fs.access(STORAGE_PATH);
  } catch {
    console.log('📭 No existe la carpeta de vouchers. Nada que migrar.');
    return;
  }

  const years = await fs.readdir(STORAGE_PATH, { withFileTypes: true });
  let migratedGroups = 0;
  let migratedFiles = 0;

  for (const yearDir of years) {
    if (!yearDir.isDirectory()) continue;
    const yearPath = path.join(STORAGE_PATH, yearDir.name);

    // Recorrer sucursales (estructura antigua: {year}/{sucursal}/)
    const sucursales = await fs.readdir(yearPath, { withFileTypes: true });

    for (const sucDir of sucursales) {
      if (!sucDir.isDirectory()) continue;
      const sucursal = sucDir.name;
      const sucPath = path.join(yearPath, sucursal);

      // Recorrer meses
      const meses = await fs.readdir(sucPath, { withFileTypes: true });

      for (const mesDir of meses) {
        if (!mesDir.isDirectory()) continue;
        const month = mesDir.name; // "06", "01", etc.
        const mesPath = path.join(sucPath, month);

        // Leer voucher-index.json
        const indexPath = path.join(mesPath, 'voucher-index.json');
        let index;
        try {
          const content = await fs.readFile(indexPath, 'utf-8');
          index = JSON.parse(content);
        } catch {
          console.log(`⏭️  ${yearDir.name}/${sucursal}/${month} - sin índice, saltando`);
          continue;
        }

        const ids = Object.keys(index);
        if (ids.length === 0) {
          console.log(`⏭️  ${yearDir.name}/${sucursal}/${month} - índice vacío`);
          continue;
        }

        // Para cada voucher, determinar su destino
        for (const id of ids) {
          const caja = extractCajaFromId(id);
          const cicloId = `${yearDir.name}-${month}`; // año-mes → ciclo
          const destDir = path.join(STORAGE_PATH, yearDir.name, cicloId, sucursal, caja);

          await fs.mkdir(destDir, { recursive: true });

          // Mover la imagen
          const files = await fs.readdir(mesPath);
          for (const file of files) {
            if (file.startsWith(id + '_voucher') || file.startsWith(id.replace(/\s/g, '-') + '_voucher')) {
              // También intentar con espacios convertidos
              const srcPath = path.join(mesPath, file);
              const destPath = path.join(destDir, file);
              try {
                await fs.rename(srcPath, destPath);
                migratedFiles++;
              } catch (e) {
                console.log(`  ⚠️  No se pudo mover ${file}: ${e.message}`);
              }
            }
          }

          // Escribir índice en destino
          const destIndexPath = path.join(destDir, 'voucher-index.json');
          let destIndex = {};
          try {
            const existing = await fs.readFile(destIndexPath, 'utf-8');
            destIndex = JSON.parse(existing);
          } catch { /* no existe aún */ }

          destIndex[id] = index[id];
          await fs.writeFile(destIndexPath, JSON.stringify(destIndex, null, 2), 'utf-8');
        }

        // Eliminar índice antiguo
        try {
          await fs.unlink(indexPath);
        } catch {}

        console.log(`✅ ${yearDir.name}/${sucursal}/${month} → ${yearDir.name}/${yearDir.name}-${month}/${sucursal}/ (${ids.length} vouchers)`);
        migratedGroups++;
      }

      // Eliminar carpeta de sucursal/mes si quedó vacía
      try {
        const remaining = await fs.readdir(sucPath);
        if (remaining.length === 0) await fs.rm(sucPath, { recursive: true });
      } catch {}
    }
  }

  console.log(`\n🎉 Migración completada: ${migratedGroups} grupos, ${migratedFiles} archivos movidos.`);
}

migrate().catch(console.error);
