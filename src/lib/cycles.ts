/**
 * Utilidades para manejar los ciclos de cierre.
 *
 * Tipos de ciclo:
 * - flynet: del día {cutoffDay} de un mes al {cutoffDay - 1} del siguiente (default: 20→19)
 * - mensual: del día 1 al último día del mes (para CARA SUCIA)
 */

import { type CicloConfig } from './config';

export interface CycleInfo {
  id: string; // Formato: YYYY-MM
  label: string; // Ejemplo: "Oct 20 - Nov 19 2026" o "Jul 1 - Jul 31 2026"
  year: number;
  month: number;
}

const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/**
 * Obtiene la configuración de ciclo para una sucursal.
 * 
 * CARA SUCIA usa ciclo mensual (1ro al último día del mes).
 * El resto usa ciclo Flynet (del día 20 al 19 del siguiente mes).
 * 
 * NOTA: Usamos hardcode en vez de depender del import estático de CONFIG
 * porque en producción Next.js compila el bundle y congela los valores.
 */
function getCicloConfig(branch?: string): CicloConfig {
  if (branch === 'CARA SUCIA') return { tipo: 'mensual' };
  return { tipo: 'flynet', cutoffDay: 20 };
}

/**
 * Obtiene la fecha actual en la zona horaria de El Salvador (UTC-6).
 */
function getLocalDate(): { year: number; month: number; day: number } {
  const now = new Date();
  const offsetMinutes = now.getTimezoneOffset();
  let svDate: Date;
  if (offsetMinutes === 360) {
    svDate = now;
  } else {
    const targetOffsetMs = -6 * 60 * 60 * 1000;
    const currentOffsetMs = -offsetMinutes * 60 * 1000;
    svDate = new Date(now.getTime() + (targetOffsetMs - currentOffsetMs));
  }
  return {
    year: svDate.getFullYear(),
    month: svDate.getMonth(),
    day: svDate.getDate(),
  };
}

/**
 * Calcula el ciclo actual basado en la fecha de hoy.
 * @param branch Sucursal (opcional) — si es 'CARA SUCIA' usa ciclo mensual
 */
export function getCurrentCycle(branch?: string): CycleInfo {
  const { year, month, day } = getLocalDate();
  const config = getCicloConfig(branch);

  if (config.tipo === 'mensual') {
    // Ciclo mensual: 1ro al último día del mes
    return formatMensualCycle(year, month);
  }

  // Ciclo Flynet: cutoffDay al cutoffDay-1 del siguiente mes
  const cutoff = config.cutoffDay ?? 20;
  let cycleYear = year;
  let cycleMonth = month;

  if (day < cutoff) {
    if (cycleMonth === 0) { cycleMonth = 11; cycleYear--; }
    else { cycleMonth--; }
  }
  return formatFlynetCycle(cycleYear, cycleMonth, cutoff);
}

/**
 * Genera una lista de los últimos N ciclos para el selector.
 * @param branch Sucursal (opcional)
 * @param count Cantidad de ciclos (default 6)
 */
export function getRecentCycles(branch?: string, count = 6): CycleInfo[] {
  const cycles: CycleInfo[] = [];
  const current = getCurrentCycle(branch);
  let cm = current.month - 1;
  let cy = current.year;

  for (let i = 0; i < count; i++) {
    const config = getCicloConfig(branch);
    if (config.tipo === 'mensual') {
      cycles.push(formatMensualCycle(cy, cm));
    } else {
      cycles.push(formatFlynetCycle(cy, cm, config.cutoffDay ?? 20));
    }
    if (cm === 0) { cm = 11; cy--; }
    else { cm--; }
  }
  return cycles;
}

/**
 * Calcula el ciclo contable a partir de una fecha.
 * @param dateStr Fecha en formato YYYY-MM-DD
 * @param branch Sucursal (opcional)
 */
export function getCycleFromDate(dateStr: string, branch?: string): { year: number; id: string } {
  try {
    const parts = dateStr.split('-');
    if (parts.length !== 3) throw new Error("Formato inválido");
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const config = getCicloConfig(branch);

    if (config.tipo === 'mensual') {
      // Ciclo mensual: el ID es el año-mes de la fecha misma
      return {
        year,
        id: `${year}-${(month + 1).toString().padStart(2, '0')}`,
      };
    }

    // Ciclo Flynet
    const cutoff = config.cutoffDay ?? 20;
    let cy = year;
    let cm = month;
    if (day < cutoff) {
      if (cm === 0) { cm = 11; cy--; }
      else { cm--; }
    }
    return {
      year: cy,
      id: `${cy}-${(cm + 1).toString().padStart(2, '0')}`,
    };
  } catch {
    const current = getCurrentCycle(branch);
    return { year: current.year, id: current.id };
  }
}

/** Formatea un ciclo Flynet (cutoffDay al cutoffDay-1 del siguiente mes) */
function formatFlynetCycle(year: number, month: number, cutoff: number): CycleInfo {
  const startDate = new Date(year, month, cutoff);
  const endDate = new Date(year, month + 1, cutoff - 1);
  return {
    id: `${year}-${(month + 1).toString().padStart(2, '0')}`,
    label: `${monthNames[startDate.getMonth()]} ${cutoff} - ${monthNames[endDate.getMonth()]} ${cutoff - 1} ${endDate.getFullYear()}`,
    year,
    month: month + 1,
  };
}

/** Formatea un ciclo mensual (1ro al último día del mes) */
function formatMensualCycle(year: number, month: number): CycleInfo {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return {
    id: `${year}-${(month + 1).toString().padStart(2, '0')}`,
    label: `${monthNames[month]} 1 - ${monthNames[month]} ${lastDay} ${year}`,
    year,
    month: month + 1,
  };
}
