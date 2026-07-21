/**
 * Script de limpieza: lee todos los ciclos y los reescribe.
 * Esto fuerza a writeAllVouchersToCycle a eliminar los vouchers.json huérfanos
 * (grupos que quedaron vacíos por movimientos/eliminaciones mal limpiados).
 *
 * Ejecutar con: node scripts/cleanup-ghost-vouchers.mjs
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_PATH = path.join(__dirname, '..', 'src', 'data', 'storage');

function normalizeCaja(sheet) {
  const s = (sheet || '').toUpperCase().trim();
  if (s.includes('CHICA') || s === 'HOJA 1' || s.includes('GENERAL')) return 'CAJA-CHICA';
  if (s.includes('CLIENTES')) return 'CLIENTES';
  if (s.includes('INSTALACIONES')) return 'INSTALACIONES';
  if (s.includes('OTROS')) return 'OTROS-GASTOS';
  return s.replace(/\s+/g, '-');
}

async function collectExistingJsonPaths(dir) {
  const paths = [];
  async function walk(dir) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(full);
        } else if (entry.name === 'vouchers.json') {
          paths.push(full);
        }
      }
    } catch {}
  }
  await walk(dir);
  return paths;
}

async function cleanup() {
  console.log('🧹 Iniciando limpieza de datos fantasma...\n');

  const years = await fs.readdir(STORAGE_PATH, { withFileTypes: true });
  let cleaned = 0;
  let totalGroupsExamined = 0;

  for (const yearDir of years) {
    if (!yearDir.isDirectory()) continue;
    if (yearDir.name === 'firmas-autorizadas' || yearDir.name === 'vouchers') continue;

    const yearPath = path.join(STORAGE_PATH, yearDir.name);
    const cycles = await fs.readdir(yearPath, { withFileTypes: true });

    for (const cycleDir of cycles) {
      if (!cycleDir.isDirectory()) continue;
      const cyclePath = path.join(yearPath, cycleDir.name);
      
      // Recolectar vouchers.json existentes antes de leer
      const beforePaths = await collectExistingJsonPaths(cyclePath);
      
      // Leer todos los vouchers de este ciclo (igual que readAllVouchersInCycle)
      const allVouchers = [];
      for (const p of beforePaths) {
        try {
          const content = await fs.readFile(p, 'utf-8');
          const vouchers = JSON.parse(content);
          if (Array.isArray(vouchers)) allVouchers.push(...vouchers);
        } catch {}
      }

      // También leer archivo plano legacy si existe
      try {
        const flatPath = path.join(cyclePath, 'vouchers.json');
        const flatContent = await fs.readFile(flatPath, 'utf-8');
        const flatVouchers = JSON.parse(flatContent);
        if (Array.isArray(flatVouchers)) {
          for (const v of flatVouchers) {
            if (!allVouchers.some(existing => existing.id === v.id)) {
              allVouchers.push(v);
            }
          }
        }
      } catch {}

      if (allVouchers.length === 0) {
        // Ciclo vacío — eliminar todos los vouchers.json huérfanos
        const deleted = [];
        for (const p of beforePaths) {
          try { await fs.unlink(p); deleted.push(p.replace(cyclePath, '')); } catch {}
        }
        if (deleted.length > 0) {
          console.log(`🗑️  ${yearDir.name}/${cycleDir.name} - VACÍO, eliminados ${deleted.length} archivos huérfanos: ${deleted.join(', ')}`);
          cleaned += deleted.length;
        }
        continue;
      }

      totalGroupsExamined++;

      // Agrupar por sucursal/caja
      const groups = new Map();
      for (const v of allVouchers) {
        const sucursal = (v.sucursal || 'SIN-SUCURSAL').toUpperCase().replace(/\s+/g, '-');
        const caja = normalizeCaja(v.sheet || 'GENERAL');
        const key = `${sucursal}/${caja}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(v);
      }

      // Escribir grupos
      const writtenPaths = new Set();
      for (const [key, groupVouchers] of groups) {
        const dirPath = path.join(cyclePath, key);
        await fs.mkdir(dirPath, { recursive: true });
        const filePath = path.join(dirPath, 'vouchers.json');
        await fs.writeFile(filePath, JSON.stringify(groupVouchers, null, 2), 'utf-8');
        writtenPaths.add(filePath);
      }

      // Eliminar archivos huérfanos (grupos vacíos)
      for (const p of beforePaths) {
        if (!writtenPaths.has(p)) {
          try {
            await fs.unlink(p);
            console.log(`  🧹 Eliminado fantasma: ${yearDir.name}/${cycleDir.name}${p.replace(cyclePath, '')}`);
            cleaned++;
          } catch {}
        }
      }

      // Eliminar archivo plano legacy
      try { await fs.unlink(path.join(cyclePath, 'vouchers.json')); } catch {}

      const groupNames = [...groups.keys()];
      console.log(`✅ ${yearDir.name}/${cycleDir.name} - ${allVouchers.length} vales en ${groupNames.length} grupos [${groupNames.join(', ')}]`);
    }
  }

  console.log(`\n🎉 Limpieza completada: ${cleaned} archivos fantasma eliminados, ${totalGroupsExamined} ciclos verificados.`);
}

cleanup().catch(console.error);
