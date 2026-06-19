'use server';

import fs from 'fs/promises';
import path from 'path';
import { revalidatePath } from 'next/cache';
import { getCurrentCycle, getCycleFromDate } from '@/lib/cycles';
import { getServerConfig } from '@/lib/config-server';

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
 * Lee un archivo de imagen del filesystem y lo convierte a base64 data URI.
 * Si la ruta ya es un data URI o URL absoluta, la devuelve tal cual.
 */
async function resolveImageBase64(relativePath: string | undefined, fecha: string): Promise<string | undefined> {
  if (!relativePath) return undefined;
  
  // Si ya es un data URI, devolverlo tal cual
  if (relativePath.startsWith('data:')) return relativePath;
  
  // Si ya es una URL absoluta, devolverla tal cual (para VoucherCard)
  if (relativePath.startsWith('http://') || relativePath.startsWith('https://')) return relativePath;
  
  // Si es una ruta del servidor Python (/storage/...), construir URL completa
  if (relativePath.startsWith(PYTHON_STORAGE_PREFIX)) {
    try {
      const config = getServerConfig();
      const baseUrl = config.PDF_API_URL.endsWith('/') ? config.PDF_API_URL.slice(0, -1) : config.PDF_API_URL;
      return `${baseUrl}${relativePath}`;
    } catch (e) {
      // Fallback: si no se puede leer config, devolver la ruta tal cual
      return relativePath;
    }
  }
  
  // Si es una ruta relativa del storage local (legacy), leer el archivo y convertirlo a base64
  if (relativePath.startsWith('imagenes/') || relativePath.startsWith('pdfs/')) {
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
      return `data:${mime};base64,${base64}`;
        } catch (e) {
      console.warn('No se pudo leer archivo de imagen:', fullPath);
      return undefined;
    }
  }
  
  // Si no coincide con ningún formato conocido, devolver tal cual
  return relativePath;
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

    // Resolver imágenes: convertir rutas relativas a base64
    const firmaUrlResuelta = await resolveImageBase64(voucher.firmaUrl, voucher.fecha);
    const comprobanteUrlResuelto = await resolveImageBase64(voucher.comprobanteUrl, voucher.fecha);

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
    const cycle = getCycleFromDate(voucher.fecha);
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
    const cycle = getCycleFromDate(fecha);
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
    const cycle = getCycleFromDate(fecha);
    const vouchers = await getVouchersByCycleAction(cycle.id);
    const targetId = await normalizeId(id);
    const voucher = vouchers.find(v => v.id.toUpperCase().replace(/[\s_]/g, '-') === targetId);
    
    if (!voucher) return null;
    
    // Preservamos las rutas originales (sin resolver) para poder construir URLs
    // al enviar al servidor PDF, y devolvemos las versiones resueltas (base64) 
    // para mostrar en el VoucherCard
    const firmaUrlRaw = voucher.firmaUrl;
    const comprobanteUrlRaw = voucher.comprobanteUrl;
    
    return {
      ...voucher,
      firmaUrl: await resolveImageBase64(voucher.firmaUrl, voucher.fecha),
      comprobanteUrl: await resolveImageBase64(voucher.comprobanteUrl, voucher.fecha),
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
    const cycle = getCycleFromDate(fecha);
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
    const cycle = getCycleFromDate(fecha);
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
    const cycle = getCycleFromDate(fecha);
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
