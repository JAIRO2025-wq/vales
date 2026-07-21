'use server';

import fs from 'fs/promises';
import path from 'path';
import { revalidatePath } from 'next/cache';
import { getCurrentCycle, getCycleFromDate } from '@/lib/cycles';
import { getCycleFromDateMensual } from '@/lib/cycles-mensual';
import { getServerConfig } from '@/lib/config-server';
import type { AppConfig } from '@/lib/config';

/**
 * Obtiene el ciclo contable correcto según la sucursal.
 * 
 * Lee la configuración CICLOS para determinar si una sucursal
 * usa ciclo mensual o Flynet. Si no está en CICLOS, usa Flynet.
 * 
 * La comparación es case-insensitive.
 */
function getCycleForBranch(fecha: string, branch?: string) {
  const branchUpper = (branch || '').trim().toUpperCase();
  
  try {
    const config = getServerConfig();
    const ciclos = config.CICLOS || {};
    // Buscar en CICLOS de forma case-insensitive
    for (const [key, cfg] of Object.entries(ciclos)) {
      if (key.trim().toUpperCase() === branchUpper && cfg.tipo === 'mensual') {
        return getCycleFromDateMensual(fecha);
      }
    }
  } catch {
    // Si falla la lectura de config, usar Flynet
  }
  
  return getCycleFromDate(fecha);
}

// ── Helpers para la nueva estructura jerárquica: {year}/{ciclo}/{sucursal}/{caja}/vouchers.json ──

/** Normaliza el nombre de sheet a un nombre de carpeta limpio */
function normalizeCajaFolder(sheet: string): string {
  const s = (sheet || '').toUpperCase().trim();
  if (s.includes('CHICA') || s === 'HOJA 1' || s.includes('GENERAL')) return 'CAJA-CHICA';
  if (s.includes('CLIENTES')) return 'CLIENTES';
  if (s.includes('INSTALACIONES')) return 'INSTALACIONES';
  if (s.includes('OTROS')) return 'OTROS-GASTOS';
  return s.replace(/\s+/g, '-');
}

/** Devuelve la ruta del directorio donde se guarda un voucher según su sucursal, caja y ciclo */
function getVoucherDir(voucher: { fecha: string; sucursal?: string; sheet?: string }): { dir: string; year: string; cycleId: string } {
  const cycle = getCycleForBranch(voucher.fecha, voucher.sucursal);
  const year = String(cycle.year);
  const sucursal = (voucher.sucursal || 'SIN-SUCURSAL').toUpperCase().replace(/\s+/g, '-');
  const caja = normalizeCajaFolder(voucher.sheet || 'GENERAL');
  const dir = path.join(STORAGE_PATH, year, cycle.id, sucursal, caja);
  return { dir, year, cycleId: cycle.id };
}

/** Escanea recursivamente un directorio de ciclo y recolecta todos los vouchers.json */
async function scanForVouchers(dir: string, result: VoucherRecord[]) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await scanForVouchers(fullPath, result);
      } else if (entry.name === 'vouchers.json') {
        try {
          const content = await fs.readFile(fullPath, 'utf-8');
          const vouchers = JSON.parse(content);
          if (Array.isArray(vouchers)) result.push(...vouchers);
        } catch { /* archivo corrupto o vacío, ignorar */ }
      }
    }
  } catch { /* directorio no existe, ignorar */ }
}

/** Lee TODOS los vouchers de un ciclo, con retrocompatibilidad para la estructura plana antigua */
export async function readAllVouchersInCycle(year: string | number, cycleId: string): Promise<VoucherRecord[]> {
  const cycleDir = path.join(STORAGE_PATH, String(year), cycleId);
  const allVouchers: VoucherRecord[] = [];

  // Leer de la nueva estructura jerárquica
  await scanForVouchers(cycleDir, allVouchers);

  // Retrocompatibilidad: si existe el archivo plano antiguo en la raíz del ciclo, también leerlo
  try {
    const oldFlatPath = path.join(cycleDir, 'vouchers.json');
    const oldContent = await fs.readFile(oldFlatPath, 'utf-8');
    const oldVouchers = JSON.parse(oldContent);
    if (Array.isArray(oldVouchers)) {
      for (const v of oldVouchers) {
        // Evitar duplicados por ID
        if (!allVouchers.some(existing => existing.id === v.id)) {
          allVouchers.push(v);
        }
      }
    }
  } catch { /* no existe archivo plano antiguo */ }

  return allVouchers;
}

/** Escanea recursivamente para recolectar todas las rutas de vouchers.json existentes */
async function collectExistingJsonPaths(cycleDir: string): Promise<string[]> {
  const paths: string[] = [];
  async function walk(dir: string) {
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
    } catch { /* no existe */ }
  }
  await walk(cycleDir);
  return paths;
}

/** Escribe los vouchers en la estructura jerárquica, agrupando por sucursal/caja.
 *  También limpia los vouchers.json de grupos que quedaron vacíos (por movimientos/eliminaciones). */
export async function writeAllVouchersToCycle(year: string | number, cycleId: string, vouchers: VoucherRecord[]) {
  const groups: Map<string, VoucherRecord[]> = new Map();
  for (const v of vouchers) {
    const sucursal = (v.sucursal || 'SIN-SUCURSAL').toUpperCase().replace(/\s+/g, '-');
    const caja = normalizeCajaFolder(v.sheet || 'GENERAL');
    const key = `${sucursal}/${caja}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(v);
  }

  const yearStr = String(year);
  const cycleDir = path.join(STORAGE_PATH, yearStr, cycleId);

  // Recolectar todos los vouchers.json existentes ANTES de escribir
  const existingPaths = await collectExistingJsonPaths(cycleDir);

  // Escribir cada grupo en su archivo (crea nuevos y sobrescribe existentes)
  const writtenPaths = new Set<string>();
  for (const [key, groupVouchers] of groups) {
    const dirPath = path.join(cycleDir, key);
    await fs.mkdir(dirPath, { recursive: true });
    const filePath = path.join(dirPath, 'vouchers.json');
    await fs.writeFile(filePath, JSON.stringify(groupVouchers, null, 2), 'utf-8');
    writtenPaths.add(filePath);
  }

  // Eliminar vouchers.json de grupos que quedaron VACÍOS (movidos/eliminados)
  for (const oldPath of existingPaths) {
    if (!writtenPaths.has(oldPath)) {
      try {
        await fs.unlink(oldPath);
      } catch { /* ignorar */ }
    }
  }

  // Limpiar carpetas vacías (opcional, para mantener el árbol limpio)
  try {
    const entries = await fs.readdir(cycleDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subPath = path.join(cycleDir, entry.name);
        try {
          const subEntries = await fs.readdir(subPath);
          if (subEntries.length === 0) {
            await fs.rmdir(subPath);
          }
        } catch { /* ignorar */ }
      }
    }
  } catch { /* ciclo no existe */ }

  // Eliminar el archivo plano antiguo si existe (ya migramos a la nueva estructura)
  try {
    const oldFlatPath = path.join(cycleDir, 'vouchers.json');
    await fs.unlink(oldFlatPath);
  } catch { /* no existe */ }
}

const STORAGE_PATH = path.join(process.cwd(), 'src/data/storage');

export interface VoucherRecord {
  id: string;
  fila: string;
  sheet: string;
  fecha: string;
  entregado: string;
  rubro: string;
  concepto?: string; // Descripción detallada
  numVale: string;
  monto: string;
  sucursal: string;
  firmado: boolean;
  firmaUrl?: string;
  motivoOmitido?: string;
  comprobanteUrl?: string;
  timestamp: string;
  autorizadoPor?: string;
  hasPdf?: boolean;
  /** Metadatos del dispositivo que firmó */
  firmaMeta?: FirmaMetadata;
  /** URL del voucher/comprobante bancario subido */
  voucherUrl?: string;
  /** Indica si el voucher ya fue subido */
  voucherSubido?: boolean;
  /** Ruta original de la firma sin resolver (para construir URLs al servidor PDF) */
  firmaUrlRaw?: string;
  /** Ruta original del comprobante sin resolver (para construir URLs al servidor PDF) */
  comprobanteUrlRaw?: string;
  /** Fecha y hora en que se subió el comprobante */
  comprobanteTimestamp?: string;
  /** Quién autoriza este vale: CAJERA o JEFE */
  tipoAutorizador?: 'CAJERA' | 'JEFE';
  /** URL de la firma del autorizador (cajera o jefe) */
  firmaAutorizadorUrl?: string;
  /** Indica si el jefe ya autorizó (para flujo JEFE) */
  autorizadoPorJefe?: boolean;
  /** Token para que el jefe pueda autorizar este vale */
  tokenJefe?: string;
}

/** Información del dispositivo desde donde se firmó el vale */
export interface FirmaMetadata {
  /** Fecha y hora exacta de la firma en ISO 8601 */
  fechaHora: string;
  /** Plataforma del dispositivo (Win32, Android, iPhone, etc.) */
  plataforma: string;
  /** User agent completo del navegador */
  userAgent: string;
  /** Zona horaria del dispositivo (ej: America/El_Salvador) */
  zonaHoraria: string;
  /** Idioma del navegador (ej: es-SV) */
  idioma: string;
  /** Tipo de conexión (wifi, 4g, etc.) - solo si está disponible */
  tipoConexion?: string;
  /** Indica si es un dispositivo móvil */
  esMovil: boolean;
}

// Interfaz para la respuesta unificada (App + API)
export interface FormattedVoucher {
  id: string;
  firmado: boolean;
  comprobante: boolean;
  pdfUrl: string;
  fechaFirma: string | null;
  firmante: string | null;
  autorizadoPor: string | null;
  motivoOmitido: string | null;
  concepto: string | null;
  archivado: boolean;
  /** URL del voucher/comprobante bancario subido */
  voucherUrl: string | null;
  /** Indica si el voucher ya fue subido */
  voucherSubido: boolean;
  /** Quién autoriza: CAJERA o JEFE */
  tipoAutorizador: 'CAJERA' | 'JEFE' | null;
  /** URL de la firma del autorizador */
  firmaAutorizadorUrl: string | null;
  /** Si el jefe ya autorizó (flujo JEFE) */
  autorizadoPorJefe: boolean;
  /** Token para autorización del jefe */
  tokenJefe: string | null;
  raw: VoucherRecord;
}

const PYTHON_STORAGE_PREFIX = '/storage/';

/**
 * Busca en config.json PINES el nombre de la persona con el rol dado para una sucursal.
 * Se usa como fallback cuando un voucher no tiene autorizadoPor guardado.
 */
async function getAutorizadoPorFromPines(sucursal: string, tipo: string): Promise<string | null> {
  try {
    const configPath = path.join(process.cwd(), 'src/data/config.json');
    const content = await fs.readFile(configPath, 'utf-8');
    const config: AppConfig = JSON.parse(content);
    const sucursalUpper = sucursal.toUpperCase();
    for (const [name, data] of Object.entries(config.PINES)) {
      const branchUpper = (data.branch || '').toUpperCase();
      if (data.role === tipo && branchUpper === sucursalUpper) {
        return name;
      }
    }
  } catch {}
  return null;
}

/**
 * Normaliza el ID para asegurar comparaciones consistentes.
 */
export async function normalizeId(id: string): Promise<string> {
  if (!id) return "";
  return id.trim().toUpperCase().replace(/[\s_]/g, '-');
}

/**
 * Extrae el nombre de la sucursal desde un ID de voucher.
 * Ej: "CARA-SUCIA-2026-07-W1-CAJACHICA-F1" → "CARA SUCIA"
 */
export async function extractBranchFromId(id: string): Promise<string | undefined> {
  const match = id.replace(/[\s_]/g, '-').match(/^(.+?)-\d{4}-\d{2}-/);
  if (!match) return undefined;
  // Revertir guiones a espacios (para sucursales compuestas como CARA SUCIA)
  const branch = match[1].replace(/-/g, ' ');
  // Verificar si existe en la configuración de ciclos (case-insensitive)
  try {
    const config = getServerConfig();
    const ciclos = config.CICLOS || {};
    const branchUpper = branch.toUpperCase();
    for (const key of Object.keys(ciclos)) {
      if (key.trim().toUpperCase() === branchUpper) return key.trim();
    }
    return undefined;
  } catch {
    return undefined;
  }
}

// ============================================================
// CACHÉ DE IMÁGENES EN MEMORIA (TTL: 5 minutos)
// Evita leer el disco repetidamente para la misma imagen.
// ============================================================
const imageCache = new Map<string, { data: string; expiry: number }>();
const IMAGE_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

function getCached(key: string): string | undefined {
  const entry = imageCache.get(key);
  if (entry && entry.expiry > Date.now()) return entry.data;
  if (entry) imageCache.delete(key); // expiró
  return undefined;
}

function setCache(key: string, data: string): void {
  // Limpiar entradas expiradas periódicamente (cada ~50 inserciones)
  if (imageCache.size > 50) {
    const now = Date.now();
    for (const [k, v] of imageCache) {
      if (v.expiry <= now) imageCache.delete(k);
    }
  }
  imageCache.set(key, { data, expiry: Date.now() + IMAGE_CACHE_TTL_MS });
}

/**
 * Resuelve una ruta de imagen a una URL servible (HTTP).
 * 
 * ESTRATEGIA (en orden de preferencia):
 * 1. Si ya es URL absoluta (http/https) → se devuelve tal cual
 * 2. Si es ruta del servidor Python (/storage/...) → URL completa al servidor Python
 * 3. Si es ruta local legacy (imagenes/ o pdfs/) → URL a /api/imagenes (el endpoint ya tiene Cache-Control immutable)
 * 4. Si es data URI → se devuelve tal cual (compatibilidad legacy)
 * 5. Fallback → se devuelve la ruta tal cual
 * 
 * IMPORTANTE: Ya NO convertimos archivos a base64. Usamos URLs directas.
 * Esto reduce drásticamente el tiempo de carga y el tamaño de la respuesta.
 * 
 * @param preloadedConfig - Configuración ya cargada (evita leer el disco N veces en lote)
 */
async function resolveImageUrl(
  relativePath: string | undefined,
  fecha: string,
  preloadedConfig?: AppConfig
): Promise<string | undefined> {
  if (!relativePath) return undefined;

  // 1. Ya es URL absoluta → devolver tal cual
  if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) return relativePath;

  // 2. Ya es data URI (legacy) → devolver tal cual
  if (relativePath.startsWith('data:')) return relativePath;

  // 3. Ruta del servidor Python (/storage/...) → construir URL completa
  if (relativePath.startsWith(PYTHON_STORAGE_PREFIX)) {
    const cacheKey = `py:${relativePath}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    try {
      const config = preloadedConfig || getServerConfig();
      const baseUrl = config.PDF_API_URL.endsWith('/') ? config.PDF_API_URL.slice(0, -1) : config.PDF_API_URL;
      const url = `${baseUrl}${relativePath}`;
      setCache(cacheKey, url);
      return url;
    } catch (e) {
      return relativePath;
    }
  }

  // 4. Ruta relativa local legacy (imagenes/ o pdfs/) → URL a /api/imagenes
  //    El endpoint /api/imagenes ya tiene Cache-Control: public, max-age=31536000, immutable
  if (relativePath.startsWith('imagenes/') || relativePath.startsWith('pdfs/')) {
    const cacheKey = `local:${fecha}:${relativePath}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    const url = `/api/imagenes?fecha=${encodeURIComponent(fecha)}&file=${encodeURIComponent(relativePath)}`;
    setCache(cacheKey, url);
    return url;
  }

  // 5. Fallback: devolver tal cual
  return relativePath;
}

/**
 * @deprecated Usar resolveImageUrl() en su lugar.
 * Mantenida para compatibilidad con código legacy que aún dependa de data URIs.
 * Redirige a resolveImageUrl() para no romper nada.
 */
async function resolveImageBase64(relativePath: string | undefined, fecha: string): Promise<string | undefined> {
  // Si el caller explícitamente necesita base64 (data:), se lo damos.
  // Pero solo para rutas locales legacy — para todo lo demás usamos URL.
  if (!relativePath) return undefined;
  if (relativePath.startsWith('data:')) return relativePath;
  if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) return relativePath;

  // Para rutas locales legacy que NO están en servidor Python,
  // convertir a base64 como último recurso (compatibilidad)
  if (relativePath.startsWith('imagenes/') || relativePath.startsWith('pdfs/')) {
    const cacheKey = `b64:${fecha}:${relativePath}`;
    const cached = getCached(cacheKey);
    if (cached) return cached;

    const cycle = getCycleFromDate(fecha);
    const fullPath = path.join(STORAGE_PATH, cycle.year.toString(), cycle.id, relativePath);
    try {
      const fileBuffer = await fs.readFile(fullPath);
      const ext = path.extname(relativePath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
      };
      const mime = mimeTypes[ext] || 'application/octet-stream';
      const base64 = fileBuffer.toString('base64');
      const dataUri = `data:${mime};base64,${base64}`;
      setCache(cacheKey, dataUri);
      return dataUri;
    } catch (e) {
      console.warn('No se pudo leer archivo de imagen:', fullPath);
      return undefined;
    }
  }

  // Para rutas del servidor Python, devolver URL (no base64)
  return resolveImageUrl(relativePath, fecha);
}

/**
 * Formatea un vale para que la App y la API hablen el mismo idioma.
 * 
 * @param voucher - Registro del vale
 * @param origin - Origen HTTP (para construir URLs absolutas)
 * @param preloadedConfig - Config ya cargada (opcional, evita leer disco N veces en lote)
 */
export async function formatVoucherForApi(
  voucher: VoucherRecord,
  origin: string,
  preloadedConfig?: AppConfig
): Promise<FormattedVoucher> {
  const params = new URLSearchParams();
  params.set("fila", voucher.fila || "");
  params.set("sheet", voucher.sheet || "");
  params.set("id", voucher.id);
  params.set("numVale", voucher.numVale || "");
  params.set("entregado", voucher.entregado || "");
  params.set("monto", voucher.monto || "");
  params.set("sucursal", voucher.sucursal || "");
  params.set("fecha", voucher.fecha || "");
  params.set("rubro", voucher.rubro || "");
  if (voucher.concepto) params.set("concepto", voucher.concepto);
  
  const auditUrl = `${origin}/vale?${params.toString()}`;

    // Resolver imágenes a URLs (YA NO usamos base64 para no saturar)
    const firmaUrlResuelta = await resolveImageUrl(voucher.firmaUrl, voucher.fecha, preloadedConfig);
    const comprobanteUrlResuelto = await resolveImageUrl(voucher.comprobanteUrl, voucher.fecha, preloadedConfig);

    // Resolver URL del voucher si existe
    let voucherUrl: string | null = null;
    if (voucher.voucherUrl) {
      if (voucher.voucherUrl.startsWith('http://') || voucher.voucherUrl.startsWith('https://')) {
        voucherUrl = voucher.voucherUrl;
      } else if (voucher.voucherUrl.startsWith('/api/')) {
        voucherUrl = `${origin}${voucher.voucherUrl}`;
      } else {
        // Ruta relativa, construir URL completa
        voucherUrl = `${origin}/api/imagenes?fecha=${encodeURIComponent(voucher.fecha)}&file=${encodeURIComponent(voucher.voucherUrl)}`;
      }
    }

    // Resolver firma del autorizador (cajera/jefe) a URL completa
    let firmaAutorizadorResuelta: string | null = null;
    if (voucher.firmaAutorizadorUrl) {
      if (voucher.firmaAutorizadorUrl.startsWith('http://') || voucher.firmaAutorizadorUrl.startsWith('https://') || voucher.firmaAutorizadorUrl.startsWith('data:')) {
        firmaAutorizadorResuelta = voucher.firmaAutorizadorUrl;
      } else if (voucher.firmaAutorizadorUrl.startsWith(PYTHON_STORAGE_PREFIX)) {
        // Ruta del servidor Python → construir URL completa
        try {
          const config = preloadedConfig || getServerConfig();
          const baseUrl = config.PDF_API_URL.endsWith('/') ? config.PDF_API_URL.slice(0, -1) : config.PDF_API_URL;
          firmaAutorizadorResuelta = `${baseUrl}${voucher.firmaAutorizadorUrl}`;
        } catch {
          firmaAutorizadorResuelta = voucher.firmaAutorizadorUrl;
        }
      } else {
        firmaAutorizadorResuelta = voucher.firmaAutorizadorUrl;
      }
    }

    return {
      id: voucher.id,
      firmado: !!(voucher.firmado || (voucher.motivoOmitido && voucher.motivoOmitido.trim().length > 2)),
            comprobante: !!(comprobanteUrlResuelto && (
        comprobanteUrlResuelto.startsWith('data:') || 
        comprobanteUrlResuelto.startsWith('http') ||
        comprobanteUrlResuelto.startsWith('/api/') ||
        comprobanteUrlResuelto.startsWith('imagenes/') ||
        comprobanteUrlResuelto.startsWith('/storage/')
      )),
      pdfUrl: auditUrl,
      fechaFirma: voucher.timestamp || null,
      firmante: voucher.entregado || null,
      autorizadoPor: voucher.autorizadoPor
        || (voucher.tipoAutorizador ? await getAutorizadoPorFromPines(voucher.sucursal, voucher.tipoAutorizador) : null),
      motivoOmitido: voucher.motivoOmitido || null,
      concepto: voucher.concepto || null,
      archivado: !!voucher.hasPdf,
      voucherUrl,
      voucherSubido: !!(voucher.voucherUrl || voucher.voucherSubido),
      tipoAutorizador: voucher.tipoAutorizador || null,
      firmaAutorizadorUrl: firmaAutorizadorResuelta,
      autorizadoPorJefe: !!voucher.autorizadoPorJefe,
      tokenJefe: voucher.tokenJefe || null,
      raw: {
        ...voucher,
        firmaUrl: firmaUrlResuelta,
        comprobanteUrl: comprobanteUrlResuelto,
        // Preservamos las rutas originales para construir URLs al servidor PDF
        firmaUrlRaw: voucher.firmaUrl,
        comprobanteUrlRaw: voucher.comprobanteUrl,
      }
    };
}



/**
 * Guarda o actualiza un vale con protección de datos existentes.
 */
export async function saveVoucherAction(voucher: VoucherRecord) {
  try {
    // Validar año para prevenir corrupción de fechas (ej: 20226 en vez de 2026)
    const fechaMatch = (voucher.fecha || '').match(/^(\d{4})-/);
    if (!fechaMatch) {
      console.warn(`[saveVoucherAction] Fecha inválida "${voucher.fecha}" para vale ${voucher.id}, se descarta.`);
      return { success: false, error: "Fecha inválida" };
    }
    const yearFromDate = parseInt(fechaMatch[1], 10);
    if (yearFromDate < 2000 || yearFromDate > 2100) {
      console.warn(`[saveVoucherAction] Año fuera de rango (${yearFromDate}) en fecha "${voucher.fecha}" para vale ${voucher.id}, se descarta.`);
      return { success: false, error: "Año fuera de rango" };
    }

    const cycle = getCycleForBranch(voucher.fecha, voucher.sucursal);
    const yearStr = cycle.year.toString();
    const cycleId = cycle.id;

    const targetId = await normalizeId(voucher.id);

    // Normalizar sucursal a mayúsculas para evitar problemas de filtrado
    const sucursalNormalizada = (voucher.sucursal || "").toUpperCase();

    // Las imágenes (firma y comprobante) ahora se almacenan en el servidor Python.
    // Solo guardamos la ruta que devuelve el servidor Python (ej: /storage/imagenes/vale123_firma_123456.png)
    const seEnvioFirma = voucher.firmaUrl !== undefined;
    const seEnvioComprobante = voucher.comprobanteUrl !== undefined;

    // Leer todos los vouchers del ciclo (nueva estructura jerárquica)
    let vouchers: VoucherRecord[] = await readAllVouchersInCycle(yearStr, cycleId);
    
    const index = vouchers.findIndex(v => v.id.toUpperCase().replace(/[\s_]/g, '-') === targetId);
    
    if (index >= 0) {
      const existing = vouchers[index];
      // Si el vale ya existe, actualizamos los datos básicos (monto, concepto, etc)
      // pero preservamos los datos que el usuario ya cargó (firma, ticket, etc)
      vouchers[index] = { 
        ...existing, 
        ...voucher,
        id: targetId,
        sucursal: sucursalNormalizada,
        firmado: voucher.firmado || existing.firmado || !!existing.motivoOmitido,
        // Preservar firma/comprobante existentes si no se enviaron nuevos
        firmaUrl: seEnvioFirma ? voucher.firmaUrl : existing.firmaUrl,
        comprobanteUrl: seEnvioComprobante ? voucher.comprobanteUrl : existing.comprobanteUrl,
        motivoOmitido: voucher.motivoOmitido || existing.motivoOmitido,
        hasPdf: voucher.hasPdf || existing.hasPdf,
        autorizadoPor: voucher.autorizadoPor || existing.autorizadoPor,
        timestamp: existing.timestamp || voucher.timestamp
      };
    } else {
      vouchers.push({
        ...voucher,
        id: targetId,
        sucursal: sucursalNormalizada
      });
    }
    
    // Escribir en la nueva estructura jerárquica: {year}/{ciclo}/{sucursal}/{caja}/vouchers.json
    await writeAllVouchersToCycle(yearStr, cycleId, vouchers);
    
    revalidatePath('/admin');
    return { success: true };
  } catch (error) {
    console.error('Error al guardar en disco:', error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Mueve un vale de un ciclo a otro.
 * Útil cuando un vale se registró en el periodo incorrecto.
 */
export async function moveVoucherToCycleAction(
  voucherId: string,
  sourceCycle: string,
  targetCycle: string
): Promise<{ success: boolean; error?: string }> {
  if (!voucherId || !sourceCycle || !targetCycle) {
    return { success: false, error: 'Faltan parámetros' };
  }
  if (sourceCycle === targetCycle) {
    return { success: false, error: 'El ciclo origen y destino son iguales' };
  }

  try {
    const year = new Date().getFullYear().toString();

    // Leer vouchers del ciclo origen
    let sourceVouchers: VoucherRecord[];
    try {
      sourceVouchers = await readAllVouchersInCycle(year, sourceCycle);
      if (sourceVouchers.length === 0) {
        return { success: false, error: `No se encontró el ciclo origen "${sourceCycle}"` };
      }
    } catch {
      return { success: false, error: `No se encontró el ciclo origen "${sourceCycle}"` };
    }

    // Buscar el vale en origen
    const idx = sourceVouchers.findIndex(v => v.id === voucherId);
    if (idx === -1) {
      return { success: false, error: `Vale "${voucherId}" no encontrado en el ciclo ${sourceCycle}` };
    }

    const voucher = sourceVouchers[idx];

    // Leer vouchers del ciclo destino
    let targetVouchers: VoucherRecord[] = await readAllVouchersInCycle(year, targetCycle);

    // Verificar que no exista ya un vale con el mismo ID en destino
    if (targetVouchers.some(v => v.id === voucherId)) {
      return { success: false, error: `Ya existe un vale con ID "${voucherId}" en el ciclo destino` };
    }

    // Remover del origen y escribir
    sourceVouchers.splice(idx, 1);
    await writeAllVouchersToCycle(year, sourceCycle, sourceVouchers);

    // Insertar en destino y escribir
    targetVouchers.push(voucher);
    targetVouchers.sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));
    await writeAllVouchersToCycle(year, targetCycle, targetVouchers);

    return { success: true };
  } catch (error) {
    console.error('Error moviendo vale:', error);
    return { success: false, error: (error as Error).message };
  }
}

export async function savePdfAction(voucherId: string, fecha: string, numVale: string, pdfUrlOrBase64: string) {
  try {
    const branch = await extractBranchFromId(voucherId);
    const cycle = getCycleForBranch(fecha, branch);
    const yearStr = cycle.year.toString();
    const cycleId = cycle.id;
    const cycleDir = path.join(STORAGE_PATH, yearStr, cycleId);
    const pdfDir = path.join(cycleDir, 'pdfs');
    
    await fs.mkdir(pdfDir, { recursive: true });
    
    const paddedNum = numVale.toString().padStart(3, '0');
    const fileName = `PDF_VALE_${paddedNum}.pdf`;
    const filePath = path.join(pdfDir, fileName);

    let buffer: Buffer;

    // Si es una URL (http/https), descargar el PDF del lado del servidor
    if (pdfUrlOrBase64.startsWith('http://') || pdfUrlOrBase64.startsWith('https://')) {
      const response = await fetch(pdfUrlOrBase64);
      if (!response.ok) throw new Error(`Error al descargar PDF: ${response.status}`);
      const arrayBuffer = await response.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    } else {
      // Si es base64, decodificarlo
      const base64Data = pdfUrlOrBase64.split(',')[1] || pdfUrlOrBase64;
      buffer = Buffer.from(base64Data, 'base64');
    }
    
    await fs.writeFile(filePath, buffer);

    const targetId = await normalizeId(voucherId);
    const vouchers: VoucherRecord[] = await readAllVouchersInCycle(yearStr, cycleId);
    const index = vouchers.findIndex(v => v.id.toUpperCase().replace(/[\s_]/g, '-') === targetId);
    if (index >= 0) {
      vouchers[index].hasPdf = true;
      await writeAllVouchersToCycle(yearStr, cycleId, vouchers);
    }
    
    revalidatePath('/admin');
    return { success: true };
  } catch (error) {
    console.error('Error al guardar PDF:', error);
    return { success: false, error: (error as Error).message };
  }
}

export async function getVouchersByCycleAction(cycleId: string) {
  try {
    const year = cycleId.split('-')[0];
    return await readAllVouchersInCycle(year, cycleId);
  } catch (e) {
    return [];
  }
}

/**
 * Obtiene y formatea TODOS los vales de un ciclo en UNA SOLA llamada al servidor.
 * 
 * Antes: getVouchersByCycleAction() + N llamadas a formatVoucherForApi() (una por vale)
 * Ahora: getVouchersByCycleActionFormatted() → 1 sola llamada
 * 
 * Esto elimina el overhead de N peticiones HTTP independientes (Server Actions),
 * que era la causa principal de la lentitud en la carga de datos.
 * 
 * @param cycleId - ID del ciclo (YYYY-MM)
 * @param origin - Origen HTTP (window.location.origin)
 * @param filterSucursal - (Opcional) Filtrar por sucursal (ej: "CARA SUCIA")
 */
export async function getVouchersByCycleActionFormatted(
  cycleId: string,
  origin: string,
  filterSucursal?: string
): Promise<FormattedVoucher[]> {
  try {
    const year = cycleId.split('-')[0];
    const vouchers = await readAllVouchersInCycle(year, cycleId);

    // Cargar la config UNA SOLA VEZ para todo el lote
    const config = getServerConfig();

    const formatted: FormattedVoucher[] = [];
    for (const voucher of vouchers) {
      // Filtrar por sucursal si se especificó
      if (filterSucursal && (voucher.sucursal || '').toUpperCase() !== filterSucursal.toUpperCase()) {
        continue;
      }
      // Formatear en el servidor (sin HTTP extra)
      formatted.push(await formatVoucherForApi(voucher, origin, config));
    }

    return formatted;
  } catch (e) {
    return [];
  }
}

export interface VoucherStatusResult extends VoucherRecord {
  /** Ruta original sin resolver (para construir URLs al servidor PDF) */
  firmaUrlRaw?: string;
  /** Ruta original sin resolver (para construir URLs al servidor PDF) */
  comprobanteUrlRaw?: string;
}

/**
 * Busca un voucher por ID en múltiples ciclos.
 * Primero busca en el ciclo principal, luego en ciclos adyacentes por si el
 * vale se guardó en un ciclo diferente (ej: por lógica Flynet o cambios en la configuración).
 */
async function findVoucherAcrossCycles(
  targetId: string,
  primaryCycleId: string,
  idCycleHint?: string
): Promise<{ voucher: VoucherRecord; cycleId: string } | null> {
  // Ciclos a probar: empezamos por el primario, luego alternamos
  const cyclesToTry = new Set<string>();
  cyclesToTry.add(primaryCycleId);
  if (idCycleHint && idCycleHint !== primaryCycleId) cyclesToTry.add(idCycleHint);

  // Extraer año y mes del ciclo primario para calcular adyacentes
  const [pYear, pMonth] = primaryCycleId.split('-').map(Number);
  // Mes anterior
  if (pMonth > 1) cyclesToTry.add(`${pYear}-${String(pMonth - 1).padStart(2, '0')}`);
  else cyclesToTry.add(`${pYear - 1}-12`);
  // Mes siguiente
  if (pMonth < 12) cyclesToTry.add(`${pYear}-${String(pMonth + 1).padStart(2, '0')}`);
  else cyclesToTry.add(`${pYear + 1}-01`);

  for (const cycleId of cyclesToTry) {
    try {
      const vouchers = await getVouchersByCycleAction(cycleId);
      const voucher = vouchers.find(v => v.id.toUpperCase().replace(/[\s_]/g, '-') === targetId);
      if (voucher) return { voucher, cycleId };
    } catch {
      continue;
    }
  }
  return null;
}

export async function checkVoucherStatusAction(id: string, fecha: string): Promise<VoucherStatusResult | null> {
  try {
    const branch = await extractBranchFromId(id);
    const primaryCycle = getCycleForBranch(fecha, branch);
    const targetId = await normalizeId(id);
    
    // Extraer un hint del mes desde el ID (ej: "2026-06" de "SAN-MIGUEL-2026-06-W3...")
    const idMonthMatch = targetId.match(/-(\d{4})-(\d{2})-/);
    const idCycleHint = idMonthMatch ? `${idMonthMatch[1]}-${idMonthMatch[2]}` : undefined;
    
    // Buscar en múltiples ciclos
    const found = await findVoucherAcrossCycles(targetId, primaryCycle.id, idCycleHint);
    
    if (!found) return null;
    
    const { voucher } = found;
    
    // Preservamos las rutas originales (sin resolver) para poder construir URLs
    // al enviar al servidor PDF, y devolvemos las versiones resueltas como URLs
    // (YA NO como base64) para mostrar en el VoucherCard
    const firmaUrlRaw = voucher.firmaUrl;
    const comprobanteUrlRaw = voucher.comprobanteUrl;
    
    return {
      ...voucher,
      firmaUrl: await resolveImageUrl(voucher.firmaUrl, voucher.fecha),
      comprobanteUrl: await resolveImageUrl(voucher.comprobanteUrl, voucher.fecha),
      // Guardamos las rutas originales para que el frontend pueda construir URLs
      // hacia /api/imagenes y enviarlas al servidor PDF
      firmaUrlRaw,
      comprobanteUrlRaw,
    };
  } catch (e) {
    return null;
  }
}

/**
 * Elimina la firma de un vale (borra el archivo de imagen y limpia los campos).
 */
export async function deleteSignatureAction(id: string, fecha: string) {
  try {
    const branch = await extractBranchFromId(id);
    const cycle = getCycleForBranch(fecha, branch);
    const yearStr = cycle.year.toString();
    const cycleId = cycle.id;
    const targetId = await normalizeId(id);
    
    const vouchers = await readAllVouchersInCycle(yearStr, cycleId);
    const index = vouchers.findIndex(v => v.id.toUpperCase().replace(/[\s_]/g, '-') === targetId);
    
    if (index < 0) return { success: false, error: 'Vale no encontrado' };
    
    const voucher = vouchers[index];
    
    // Borrar archivo de firma si existe (solo rutas legacy locales)
    if (voucher.firmaUrl && (voucher.firmaUrl.startsWith('imagenes/') || voucher.firmaUrl.startsWith('pdfs/'))) {
      const fullPath = path.join(STORAGE_PATH, yearStr, cycleId, voucher.firmaUrl);
      try {
        await fs.unlink(fullPath);
      } catch (e) {
        // El archivo podría no existir, ignorar
      }
    }
    
    // Limpiar campos de firma
    vouchers[index] = {
      ...voucher,
      firmado: false,
      firmaUrl: undefined,
      motivoOmitido: undefined,
      autorizadoPor: undefined,
      timestamp: new Date().toISOString(),
    };
    
    await writeAllVouchersToCycle(yearStr, cycleId, vouchers);
    revalidatePath('/admin');
    return { success: true };
  } catch (error) {
    console.error('Error al eliminar firma:', error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Elimina el comprobante/ticket de un vale (borra el archivo y limpia el campo).
 */
export async function deleteComprobanteAction(id: string, fecha: string) {
  try {
    const branch = await extractBranchFromId(id);
    const cycle = getCycleForBranch(fecha, branch);
    const yearStr = cycle.year.toString();
    const cycleId = cycle.id;
    const targetId = await normalizeId(id);
    
    const vouchers = await readAllVouchersInCycle(yearStr, cycleId);
    const index = vouchers.findIndex(v => v.id.toUpperCase().replace(/[\s_]/g, '-') === targetId);
    
    if (index < 0) return { success: false, error: 'Vale no encontrado' };
    
    const voucher = vouchers[index];
    
    // Borrar archivo de comprobante si existe (solo rutas legacy locales)
    if (voucher.comprobanteUrl && (voucher.comprobanteUrl.startsWith('imagenes/') || voucher.comprobanteUrl.startsWith('pdfs/'))) {
      const fullPath = path.join(STORAGE_PATH, yearStr, cycleId, voucher.comprobanteUrl);
      try {
        await fs.unlink(fullPath);
      } catch (e) {
        // El archivo podría no existir, ignorar
      }
    }
    
    // Limpiar campo de comprobante
    vouchers[index] = {
      ...voucher,
      comprobanteUrl: undefined,
      timestamp: new Date().toISOString(),
    };
    
    await writeAllVouchersToCycle(yearStr, cycleId, vouchers);
    revalidatePath('/admin');
    return { success: true };
  } catch (error) {
    console.error('Error al eliminar comprobante:', error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Elimina un vale completo: borra su registro del JSON y todos los archivos asociados
 * (firma, comprobante, PDF).
 */
export async function deleteVoucherAction(id: string, fecha: string) {
  try {
    const branch = await extractBranchFromId(id);
    const cycle = getCycleForBranch(fecha, branch);
    const yearStr = cycle.year.toString();
    const cycleId = cycle.id;
    const targetId = await normalizeId(id);
    
    const vouchers = await readAllVouchersInCycle(yearStr, cycleId);
    const index = vouchers.findIndex(v => v.id.toUpperCase().replace(/[\s_]/g, '-') === targetId);
    
    if (index < 0) return { success: false, error: 'Vale no encontrado' };
    
    const voucher = vouchers[index];
    
    // Borrar archivos asociados (solo rutas legacy locales)
    const filesToDelete = [voucher.firmaUrl, voucher.comprobanteUrl];
    if (voucher.hasPdf) {
      const paddedNum = voucher.numVale.toString().padStart(3, '0');
      filesToDelete.push(`pdfs/PDF_VALE_${paddedNum}.pdf`);
    }
    
    for (const filePath of filesToDelete) {
      if (filePath && (filePath.startsWith('imagenes/') || filePath.startsWith('pdfs/'))) {
        const fullPath = path.join(STORAGE_PATH, yearStr, cycleId, filePath);
        try {
          await fs.unlink(fullPath);
        } catch (e) {
          // El archivo podría no existir, ignorar
        }
      }
    }
    
    // Eliminar el registro
    vouchers.splice(index, 1);
    await writeAllVouchersToCycle(yearStr, cycleId, vouchers);
    
    revalidatePath('/admin');
    return { success: true };
  } catch (error) {
    console.error('Error al eliminar vale:', error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Función base para notificar a Google Apps Script.
 * Todas las notificaciones pasan por aquí para centralizar la lógica.
 */
async function notifyGoogle(payload: Record<string, any>): Promise<{ success: boolean }> {
  try {
    const config = getServerConfig();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    try {
      await fetch(config.API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      return { success: true };
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    console.warn('Error notificando a Google Apps Script:', error);
    return { success: false };
  }
}

/**
 * Notifica a Google Apps Script que un vale ha sido archivado (PDF generado).
 */
export async function notifyArchiveAction(voucherData: {
  fila: string;
  sheet: string;
  id: string;
  pdfUrl: string;
}) {
  return notifyGoogle({
    fila: voucherData.fila,
    sheet: voucherData.sheet,
    id: voucherData.id,
    pdfUrl: voucherData.pdfUrl,
    metodo: "updatePdf"
  });
}

/**
 * Notifica a Google Apps Script que un vale ha sido firmado.
 */
export async function notifySignAction(voucherData: {
  fila: string;
  sheet: string;
  id: string;
  firmado: boolean;
  firmaUrl?: string;
  motivoOmitido?: string;
  autorizadoPor?: string;
}) {
  return notifyGoogle({
    fila: voucherData.fila,
    sheet: voucherData.sheet,
    id: voucherData.id,
    firmado: voucherData.firmado,
    firmaUrl: voucherData.firmaUrl || '',
    motivo: voucherData.motivoOmitido || '',
    autorizadoPor: voucherData.autorizadoPor || '',
    metodo: "updateFirma"
  });
}

/**
 * Notifica a Google Apps Script que se adjuntó un comprobante.
 */
export async function notifyComprobanteAction(voucherData: {
  fila: string;
  sheet: string;
  id: string;
  numVale: string;
  comprobanteUrl: string;
}) {
  return notifyGoogle({
    fila: voucherData.fila,
    sheet: voucherData.sheet,
    id: voucherData.id,
    numVale: voucherData.numVale,
    comprobanteUrl: voucherData.comprobanteUrl,
    metodo: "updateComprobante"
  });
}

/**
 * Notifica a Google Apps Script que se subió un voucher (comprobante bancario).
 */
export async function notifyVoucherAction(voucherData: {
  fila: string;
  sheet: string;
  id: string;
  voucherUrl: string;
}) {
  return notifyGoogle({
    fila: voucherData.fila,
    sheet: voucherData.sheet,
    id: voucherData.id,
    voucherUrl: voucherData.voucherUrl,
    metodo: "updateVoucher"
  });
}

/**
 * Busca un vale por su tokenJefe y autoriza al jefe (flujo de doble autorización).
 * Escanea todos los ciclos y sucursales hasta encontrar el vale con el token.
 */
export async function authorizeVoucherByTokenAction(token: string) {
  if (!token) return { success: false, error: 'Token inválido' };

  try {
    const storagePath = path.join(STORAGE_PATH);
    
    // Buscar en todos los años y ciclos
    const years = await fs.readdir(storagePath, { withFileTypes: true });
    
    for (const yearDir of years) {
      if (!yearDir.isDirectory()) continue;
      const yearPath = path.join(storagePath, yearDir.name);
      const cycles = await fs.readdir(yearPath, { withFileTypes: true });
      
      for (const cycleDir of cycles) {
        if (!cycleDir.isDirectory()) continue;
        
        try {
          const vouchers = await readAllVouchersInCycle(yearDir.name, cycleDir.name);
          
          const idx = vouchers.findIndex(v => v.tokenJefe === token);
          if (idx >= 0) {
            const voucher = vouchers[idx];
            voucher.autorizadoPorJefe = true;
            vouchers[idx] = voucher;
            
            await writeAllVouchersToCycle(yearDir.name, cycleDir.name, vouchers);
            
            return {
              success: true,
              voucher: {
                id: voucher.id,
                sucursal: voucher.sucursal,
                numVale: voucher.numVale,
                entregado: voucher.entregado,
              }
            };
          }
        } catch {
          continue;
        }
      }
    }
    
    return { success: false, error: 'Vale no encontrado para este token' };
  } catch (error) {
    console.error('Error al autorizar vale por token:', error);
    return { success: false, error: (error as Error).message };
  }
}
