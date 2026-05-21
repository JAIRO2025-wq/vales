'use server';

import fs from 'fs/promises';
import path from 'path';
import { revalidatePath } from 'next/cache';
import { getCurrentCycle } from '@/lib/cycles';

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

/**
 * Normaliza el ID para asegurar comparaciones consistentes.
 */
export async function normalizeId(id: string): Promise<string> {
  if (!id) return "";
  return id.trim().toUpperCase().replace(/[\s_]/g, '-');
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

  return {
    id: voucher.id,
    firmado: !!(voucher.firmado || (voucher.motivoOmitido && voucher.motivoOmitido.trim().length > 2)),
    comprobante: !!(voucher.comprobanteUrl && voucher.comprobanteUrl.length > 50),
    pdfUrl: auditUrl,
    fechaFirma: voucher.timestamp || null,
    firmante: voucher.entregado || null,
    autorizadoPor: voucher.autorizadoPor || null,
    motivoOmitido: voucher.motivoOmitido || null,
    concepto: voucher.concepto || null,
    archivado: !!voucher.hasPdf,
    raw: voucher
  };
}

/**
 * Calcula el ciclo contable de Flynet (20 al 19) sin errores de zona horaria.
 */
export async function getCycleFromDate(dateStr: string) {
  try {
    const parts = dateStr.split('-');
    if (parts.length !== 3) throw new Error("Formato de fecha inválido");
    
    let year = parseInt(parts[0], 10);
    let month = parseInt(parts[1], 10) - 1; 
    const day = parseInt(parts[2], 10);

    if (day < 20) {
      if (month === 0) {
        month = 11;
        year--;
      } else {
        month--;
      }
    }
    
    return {
      year,
      id: `${year}-${(month + 1).toString().padStart(2, '0')}`
    };
  } catch (e) {
    const current = getCurrentCycle();
    return { year: current.year, id: current.id };
  }
}

/**
 * Guarda o actualiza un vale con protección de datos existentes.
 */
export async function saveVoucherAction(voucher: VoucherRecord) {
  try {
    const cycle = await getCycleFromDate(voucher.fecha);
    const yearDir = path.join(STORAGE_PATH, cycle.year.toString());
    const cycleDir = path.join(yearDir, cycle.id);
    const imagesDir = path.join(cycleDir, 'imagenes');
    
    await fs.mkdir(imagesDir, { recursive: true });
    
    const paddedNum = voucher.numVale.toString().padStart(3, '0');
    const targetId = await normalizeId(voucher.id);

    // Guardar firma si viene en base64
    if (voucher.firmaUrl && voucher.firmaUrl.startsWith('data:image/')) {
      const base64Data = voucher.firmaUrl.split(',')[1];
      const buffer = Buffer.from(base64Data, 'base64');
      const fileName = `FIRMA_VALE_${paddedNum}.png`;
      await fs.writeFile(path.join(imagesDir, fileName), buffer);
    }

    // Guardar comprobante si viene en base64
    if (voucher.comprobanteUrl && voucher.comprobanteUrl.startsWith('data:image/')) {
      const base64Data = voucher.comprobanteUrl.split(',')[1];
      const buffer = Buffer.from(base64Data, 'base64');
      const fileName = `CBT_VALE_${paddedNum}.jpg`;
      await fs.writeFile(path.join(imagesDir, fileName), buffer);
    }

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
        firmado: voucher.firmado || existing.firmado || !!existing.motivoOmitido,
        firmaUrl: voucher.firmaUrl || existing.firmaUrl,
        comprobanteUrl: voucher.comprobanteUrl || existing.comprobanteUrl,
        motivoOmitido: voucher.motivoOmitido || existing.motivoOmitido,
        hasPdf: voucher.hasPdf || existing.hasPdf,
        autorizadoPor: voucher.autorizadoPor || existing.autorizadoPor,
        timestamp: existing.timestamp || voucher.timestamp
      };
    } else {
      vouchers.push({
        ...voucher,
        id: targetId
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

export async function savePdfAction(voucherId: string, fecha: string, numVale: string, pdfBase64: string) {
  try {
    const cycle = await getCycleFromDate(fecha);
    const yearDir = path.join(STORAGE_PATH, cycle.year.toString());
    const cycleDir = path.join(yearDir, cycle.id);
    const pdfDir = path.join(cycleDir, 'pdfs');
    
    await fs.mkdir(pdfDir, { recursive: true });
    
    const paddedNum = numVale.toString().padStart(3, '0');
    const fileName = `PDF_VALE_${paddedNum}.pdf`;
    
    const base64Data = pdfBase64.split(',')[1] || pdfBase64;
    const buffer = Buffer.from(base64Data, 'base64');
    
    await fs.writeFile(path.join(pdfDir, fileName), buffer);

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

export async function checkVoucherStatusAction(id: string, fecha: string) {
  try {
    const cycle = await getCycleFromDate(fecha);
    const vouchers = await getVouchersByCycleAction(cycle.id);
    const targetId = await normalizeId(id);
    return vouchers.find(v => v.id.toUpperCase().replace(/[\s_]/g, '-') === targetId) || null;
  } catch (e) {
    return null;
  }
}
