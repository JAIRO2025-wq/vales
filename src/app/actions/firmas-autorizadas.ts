'use server';

import fs from 'fs/promises';
import path from 'path';
import { getLunesActual } from '@/lib/week-utils';

const STORAGE_PATH = path.join(process.cwd(), 'src/data/storage');

export interface FirmaAutorizada {
  sucursal: string;
  tipo: 'CAJERA' | 'JEFE';
  nombre: string;
  firmaUrl: string;
  /** Lunes de la semana en formato YYYY-MM-DD */
  semanaLunes: string;
  fechaRegistro: string;
}

/**
 * Guarda o actualiza la firma autorizada de una sucursal/tipo para la semana.
 */
export async function saveFirmaAutorizadaAction(
  sucursal: string,
  tipo: 'CAJERA' | 'JEFE',
  nombre: string,
  firmaUrl: string,
  semanaLunes?: string
) {
  try {
    const sucursalClean = sucursal.trim().toUpperCase().replace(/\s+/g, '-');
    const lunes = semanaLunes || getLunesActual();
    const [year] = lunes.split('-');
    
    const dirPath = path.join(STORAGE_PATH, 'firmas-autorizadas', sucursalClean, year);
    await fs.mkdir(dirPath, { recursive: true });
    
    const jsonPath = path.join(dirPath, 'firmas.json');
    let firmas: FirmaAutorizada[] = [];
    
    try {
      const content = await fs.readFile(jsonPath, 'utf-8');
      firmas = JSON.parse(content);
    } catch {}
    
    // Buscar si ya existe una firma para esta sucursal/tipo/semana
    const idx = firmas.findIndex(
      f => f.sucursal.toUpperCase() === sucursal.toUpperCase() &&
           f.tipo === tipo &&
           f.semanaLunes === lunes
    );
    
    const entry: FirmaAutorizada = {
      sucursal: sucursal.trim().toUpperCase(),
      tipo,
      nombre,
      firmaUrl,
      semanaLunes: lunes,
      fechaRegistro: new Date().toISOString(),
    };
    
    if (idx >= 0) {
      firmas[idx] = entry;
    } else {
      firmas.push(entry);
    }
    
    await fs.writeFile(jsonPath, JSON.stringify(firmas, null, 2), 'utf-8');
    return { success: true };
  } catch (error) {
    console.error('Error al guardar firma autorizada:', error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Obtiene las firmas autorizadas de una sucursal.
 * Si se especifica semanaLunes, filtra por esa semana.
 * Si no, devuelve la de la semana actual.
 */
export async function getFirmasAutorizadasAction(
  sucursal: string,
  semanaLunes?: string
): Promise<FirmaAutorizada[]> {
  try {
    const sucursalClean = sucursal.trim().toUpperCase().replace(/\s+/g, '-');
    const lunes = semanaLunes || getLunesActual();
    const [year] = lunes.split('-');
    
    const jsonPath = path.join(STORAGE_PATH, 'firmas-autorizadas', sucursalClean, year, 'firmas.json');
    const content = await fs.readFile(jsonPath, 'utf-8');
    const firmas: FirmaAutorizada[] = JSON.parse(content);
    
    const sucursalUpper = sucursal.trim().toUpperCase();
    // Si no se especifica semana, devolver las de la semana actual
    if (!semanaLunes) {
      return firmas.filter(
        f => f.sucursal.toUpperCase() === sucursalUpper && f.semanaLunes === lunes
      );
    }
    return firmas.filter(
      f => f.sucursal.toUpperCase() === sucursalUpper && f.semanaLunes === lunes
    );
  } catch {
    return [];
  }
}

/**
 * Obtiene UNA firma autorizada por sucursal/tipo para la semana actual
 * (o la semana especificada). Retorna null si no existe.
 */
export async function getFirmaAutorizadaAction(
  sucursal: string,
  tipo: 'CAJERA' | 'JEFE',
  semanaLunes?: string
): Promise<FirmaAutorizada | null> {
  const firmas = await getFirmasAutorizadasAction(sucursal, semanaLunes);
  return firmas.find(f => f.tipo === tipo) || null;
}

/**
 * Elimina una firma autorizada.
 */
export async function deleteFirmaAutorizadaAction(
  sucursal: string,
  tipo: 'CAJERA' | 'JEFE',
  semanaLunes: string
) {
  try {
    const sucursalClean = sucursal.trim().toUpperCase().replace(/\s+/g, '-');
    const [year] = semanaLunes.split('-');
    
    const jsonPath = path.join(STORAGE_PATH, 'firmas-autorizadas', sucursalClean, year, 'firmas.json');
    const content = await fs.readFile(jsonPath, 'utf-8');
    const firmas: FirmaAutorizada[] = JSON.parse(content);
    
    const sucursalUpper = sucursal.trim().toUpperCase();
    const filtered = firmas.filter(
      f => !(f.sucursal.toUpperCase() === sucursalUpper &&
             f.tipo === tipo &&
             f.semanaLunes === semanaLunes)
    );
    
    await fs.writeFile(jsonPath, JSON.stringify(filtered, null, 2), 'utf-8');
    return { success: true };
  } catch (error) {
    console.error('Error al eliminar firma autorizada:', error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Obtiene todas las sucursales que tienen al menos una firma registrada.
 */
export async function getSucursalesConFirmasAction(): Promise<string[]> {
  try {
    const basePath = path.join(STORAGE_PATH, 'firmas-autorizadas');
    const dirs = await fs.readdir(basePath, { withFileTypes: true });
    return dirs.filter(d => d.isDirectory()).map(d => d.name.replace(/-/g, ' '));
  } catch {
    return [];
  }
}
