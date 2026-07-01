/**
 * Utilidades de ciclo MENSUAL exclusivas para CARA SUCIA.
 * 
 * Ciclo mensual: del día 1 al último día del mes.
 * Totalmente independiente del sistema Flynet del resto de sucursales.
 */

export interface CycleInfo {
  id: string; // Formato: YYYY-MM
  label: string; // Ejemplo: "Jul 1 - Jul 31 2026"
  year: number;
  month: number;
}

const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/**
 * Obtiene la fecha actual en UTC-6 (El Salvador).
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
 * Calcula el ciclo mensual actual basado en la fecha de hoy.
 * Ciclo: 1ro al último día del mes calendario.
 * 
 * Ejemplos:
 * - 1 de julio 2026 → "Jul 1 - Jul 31 2026" (id: 2026-07)
 * - 15 de julio 2026 → "Jul 1 - Jul 31 2026" (id: 2026-07)
 * - 31 de julio 2026 → "Jul 1 - Jul 31 2026" (id: 2026-07)
 */
export function getCurrentCycleMensual(): CycleInfo {
  const { year, month } = getLocalDate();
  return formatMensualCycle(year, month);
}

/**
 * Genera una lista de los últimos N ciclos mensuales para el selector.
 */
export function getRecentCyclesMensual(count = 6): CycleInfo[] {
  const cycles: CycleInfo[] = [];
  const current = getCurrentCycleMensual();
  let cm = current.month - 1; // 0-indexed
  let cy = current.year;

  for (let i = 0; i < count; i++) {
    cycles.push(formatMensualCycle(cy, cm));
    if (cm === 0) { cm = 11; cy--; }
    else { cm--; }
  }
  return cycles;
}

/**
 * Calcula el ciclo mensual a partir de una fecha específica.
 * Útil para determinar dónde guardar/buscar un voucher según su fecha.
 * Siempre devuelve el año-mes de la fecha misma.
 */
export function getCycleFromDateMensual(dateStr: string): { year: number; id: string } {
  try {
    const parts = dateStr.split('-');
    if (parts.length !== 3) throw new Error("Formato inválido");
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    return {
      year,
      id: `${year}-${month.toString().padStart(2, '0')}`,
    };
  } catch {
    const current = getCurrentCycleMensual();
    return { year: current.year, id: current.id };
  }
}

/**
 * Formatea un ciclo mensual: "Jul 1 - Jul 31 2026"
 */
function formatMensualCycle(year: number, month: number): CycleInfo {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return {
    id: `${year}-${(month + 1).toString().padStart(2, '0')}`,
    label: `${monthNames[month]} 1 - ${monthNames[month]} ${lastDay} ${year}`,
    year,
    month: month + 1,
  };
}
