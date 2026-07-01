'use server';

import fs from 'fs/promises';
import path from 'path';
import { revalidatePath } from 'next/cache';
import { getCurrentCycle, getCycleFromDate } from '@/lib/cycles';
import { getCycleFromDateMensual } from '@/lib/cycles-mensual';
import { getServerConfig } from '@/lib/config-server';

/**
 * Obtiene el ciclo contable correcto según la sucursal.
 * - CARA SUCIA → ciclo mensual (cycles-mensual.ts)
 * - Otras → ciclo Flynet (cycles.ts)
 */
function getCycleForBranch(fecha: string, branch?: string) {
  if (branch === 'CARA SUCIA') return getCycleFromDateMensual(fecha);
  return getCycleFromDate(fecha);
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
  raw: VoucherRecord;
}

const PYTHON_STORAGE_PREFIX = '/storage/';

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
  // Verificar si existe en la configuración de ciclos
  try {
    const config = getServerConfig();
    const ciclos = config.CICLOS || {};
    return ciclos[branch] ? branch : undefined;
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
 */
async function resolveImageUrl(relativePath: string | undefined, fecha: string): Promise<string | undefined> {
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
      const config = getServerConfig();
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
 * Formatea un vale para que la App y la API hablen el mismo idioma
 */
export async function formatVoucherForApi(voucher: VoucherRecord, origin: string): Promise<FormattedVoucher> {
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
    const firmaUrlResuelta = await resolveImageUrl(voucher.firmaUrl, voucher.fecha);
    const comprobanteUrlResuelto = await resolveImageUrl(voucher.comprobanteUrl, voucher.fecha);

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
      autorizadoPor: voucher.autorizadoPor || null,
      motivoOmitido: voucher.motivoOmitido || null,
      concepto: voucher.concepto || null,
      archivado: !!voucher.hasPdf,
      voucherUrl,
      voucherSubido: !!(voucher.voucherUrl || voucher.voucherSubido),
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
    const cycle = getCycleForBranch(voucher.fecha, voucher.sucursal);
    const yearDir = path.join(STORAGE_PATH, cycle.year.toString());
    const cycleDir = path.join(yearDir, cycle.id);
    
    await fs.mkdir(cycleDir, { recursive: true });
    
    const targetId = await normalizeId(voucher.id);

    // Normalizar sucursal a mayúsculas para evitar problemas de filtrado
    const sucursalNormalizada = (voucher.sucursal || "").toUpperCase();

    // Las imágenes (firma y comprobante) ahora se almacenan en el servidor Python.
    // Solo guardamos la ruta que devuelve el servidor Python (ej: /storage/imagenes/vale123_firma_123456.png)
    const seEnvioFirma = voucher.firmaUrl !== undefined;
    const seEnvioComprobante = voucher.comprobanteUrl !== undefined;

    const jsonPath = path.join(cycleDir, 'vouchers.json');
    let vouchers: VoucherRecord[] = [];
    
    try {
      const content = await fs.readFile(jsonPath, 'utf-8');
      vouchers = JSON.parse(content);
    } catch (e) {}
    
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
    
    await fs.writeFile(jsonPath, JSON.stringify(vouchers, null, 2), 'utf-8');
    
    revalidatePath('/admin');
    return { success: true };
  } catch (error) {
    console.error('Error al guardar en disco:', error);
    return { success: false, error: (error as Error).message };
  }
}

export async function savePdfAction(voucherId: string, fecha: string, numVale: string, pdfUrlOrBase64: string) {
  try {
    const branch = await extractBranchFromId(voucherId);
    const cycle = getCycleForBranch(fecha, branch);
    const yearDir = path.join(STORAGE_PATH, cycle.year.toString());
    const cycleDir = path.join(yearDir, cycle.id);
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

    const jsonPath = path.join(cycleDir, 'vouchers.json');
    const targetId = await normalizeId(voucherId);
    try {
      const content = await fs.readFile(jsonPath, 'utf-8');
      const vouchers: VoucherRecord[] = JSON.parse(content);
      const index = vouchers.findIndex(v => v.id.toUpperCase().replace(/[\s_]/g, '-') === targetId);
      if (index >= 0) {
        vouchers[index].hasPdf = true;
        await fs.writeFile(jsonPath, JSON.stringify(vouchers, null, 2), 'utf-8');
      }
    } catch (e) {}
    
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
    const filePath = path.join(STORAGE_PATH, year, cycleId, 'vouchers.json');
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as VoucherRecord[];
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

export async function checkVoucherStatusAction(id: string, fecha: string): Promise<VoucherStatusResult | null> {
  try {
    const branch = await extractBranchFromId(id);
    const cycle = getCycleForBranch(fecha, branch);
    const vouchers = await getVouchersByCycleAction(cycle.id);
    const targetId = await normalizeId(id);
    const voucher = vouchers.find(v => v.id.toUpperCase().replace(/[\s_]/g, '-') === targetId);
    
    if (!voucher) return null;
    
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
    const jsonPath = path.join(STORAGE_PATH, cycle.year.toString(), cycle.id, 'vouchers.json');
    const targetId = await normalizeId(id);
    
    const content = await fs.readFile(jsonPath, 'utf-8');
    const vouchers: VoucherRecord[] = JSON.parse(content);
    const index = vouchers.findIndex(v => v.id.toUpperCase().replace(/[\s_]/g, '-') === targetId);
    
    if (index < 0) return { success: false, error: 'Vale no encontrado' };
    
    const voucher = vouchers[index];
    
    // Borrar archivo de firma si existe
    if (voucher.firmaUrl && (voucher.firmaUrl.startsWith('imagenes/') || voucher.firmaUrl.startsWith('pdfs/'))) {
      const fullPath = path.join(STORAGE_PATH, cycle.year.toString(), cycle.id, voucher.firmaUrl);
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
    
    await fs.writeFile(jsonPath, JSON.stringify(vouchers, null, 2), 'utf-8');
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
    const jsonPath = path.join(STORAGE_PATH, cycle.year.toString(), cycle.id, 'vouchers.json');
    const targetId = await normalizeId(id);
    
    const content = await fs.readFile(jsonPath, 'utf-8');
    const vouchers: VoucherRecord[] = JSON.parse(content);
    const index = vouchers.findIndex(v => v.id.toUpperCase().replace(/[\s_]/g, '-') === targetId);
    
    if (index < 0) return { success: false, error: 'Vale no encontrado' };
    
    const voucher = vouchers[index];
    
    // Borrar archivo de comprobante si existe
    if (voucher.comprobanteUrl && (voucher.comprobanteUrl.startsWith('imagenes/') || voucher.comprobanteUrl.startsWith('pdfs/'))) {
      const fullPath = path.join(STORAGE_PATH, cycle.year.toString(), cycle.id, voucher.comprobanteUrl);
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
    
    await fs.writeFile(jsonPath, JSON.stringify(vouchers, null, 2), 'utf-8');
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
    const jsonPath = path.join(STORAGE_PATH, cycle.year.toString(), cycle.id, 'vouchers.json');
    const targetId = await normalizeId(id);
    
    const content = await fs.readFile(jsonPath, 'utf-8');
    const vouchers: VoucherRecord[] = JSON.parse(content);
    const index = vouchers.findIndex(v => v.id.toUpperCase().replace(/[\s_]/g, '-') === targetId);
    
    if (index < 0) return { success: false, error: 'Vale no encontrado' };
    
    const voucher = vouchers[index];
    
    // Borrar archivos asociados
    const filesToDelete = [voucher.firmaUrl, voucher.comprobanteUrl];
    if (voucher.hasPdf) {
      const paddedNum = voucher.numVale.toString().padStart(3, '0');
      filesToDelete.push(`pdfs/PDF_VALE_${paddedNum}.pdf`);
    }
    
    for (const filePath of filesToDelete) {
      if (filePath && (filePath.startsWith('imagenes/') || filePath.startsWith('pdfs/'))) {
        const fullPath = path.join(STORAGE_PATH, cycle.year.toString(), cycle.id, filePath);
        try {
          await fs.unlink(fullPath);
        } catch (e) {
          // El archivo podría no existir, ignorar
        }
      }
    }
    
    // Eliminar el registro del JSON
    vouchers.splice(index, 1);
    await fs.writeFile(jsonPath, JSON.stringify(vouchers, null, 2), 'utf-8');
    
    revalidatePath('/admin');
    return { success: true };
  } catch (error) {
    console.error('Error al eliminar vale:', error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Notifica a Google Apps Script que un vale ha sido archivado.
 * Se ejecuta del lado del servidor para evitar problemas de CORS.
 */
export async function notifyArchiveAction(voucherData: {
  fila: string;
  sheet: string;
  id: string;
  pdfUrl: string;
}) {
  try {
    const config = getServerConfig();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    try {
      await fetch(config.API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fila: voucherData.fila,
          sheet: voucherData.sheet,
          id: voucherData.id,
          pdfUrl: voucherData.pdfUrl,
          metodo: "updatePdf"
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    return { success: true };
  } catch (error) {
    console.warn('Error notificando a Google Apps Script:', error);
    return { success: false };
  }
}
