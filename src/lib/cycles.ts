/**
 * Utilidades para manejar los ciclos de cierre de Flynet (del 20 de un mes al 19 del siguiente)
 * 
 * Esta versión es SOLO para Flynet. CARA SUCIA usa cycles-mensual.ts.
 */

export interface CycleInfo {
  id: string; // Formato: YYYY-MM (Mes de inicio)
  label: string; // Ejemplo: Oct 20 - Nov 19 2026
  year: number;
  month: number;
}

const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

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
 * El ciclo de Flynet va del 20 de un mes al 19 del siguiente.
 * 
 * Ejemplos:
 * - 22 de junio → ciclo Jun 20 - Jul 19 (id: 2026-06)
 * - 15 de junio → ciclo May 20 - Jun 19 (id: 2026-05)
 * - 20 de junio → ciclo Jun 20 - Jul 19 (id: 2026-06)
 */
export function getCurrentCycle(): CycleInfo {
  const { year, month, day } = getLocalDate();
  let cycleYear = year;
  let cycleMonth = month; // 0-11

  // Si hoy es antes del 20, el ciclo empezó el 20 del mes anterior
  if (day < 20) {
    if (cycleMonth === 0) { cycleMonth = 11; cycleYear--; }
    else { cycleMonth--; }
  }

  return formatFlynetCycle(cycleYear, cycleMonth);
}

/**
 * Genera una lista de los últimos 6 ciclos para el selector
 */
export function getRecentCycles(): CycleInfo[] {
  const cycles: CycleInfo[] = [];
  const current = getCurrentCycle();
  let cycleMonth = current.month - 1;
  let cycleYear = current.year;

  for (let i = 0; i < 6; i++) {
    cycles.push(formatFlynetCycle(cycleYear, cycleMonth));
    if (cycleMonth === 0) { cycleMonth = 11; cycleYear--; }
    else { cycleMonth--; }
  }
  return cycles;
}

/**
 * Calcula el ciclo contable de Flynet (20 al 19) a partir de una fecha.
 * Útil para determinar dónde guardar/buscar un voucher según su fecha.
 */
export function getCycleFromDate(dateStr: string): { year: number; id: string } {
  try {
    const parts = dateStr.split('-');
    if (parts.length !== 3) throw new Error("Formato de fecha inválido");
    let year = parseInt(parts[0], 10);
    let month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);

    if (day < 20) {
      if (month === 0) { month = 11; year--; }
      else { month--; }
    }
    return {
      year,
      id: `${year}-${(month + 1).toString().padStart(2, '0')}`
    };
  } catch {
    const current = getCurrentCycle();
    return { year: current.year, id: current.id };
  }
}

/** Formatea un ciclo Flynet */
function formatFlynetCycle(year: number, month: number): CycleInfo {
  const startDate = new Date(year, month, 20);
  const endDate = new Date(year, month + 1, 19);
  return {
    id: `${year}-${(month + 1).toString().padStart(2, '0')}`,
    label: `${monthNames[startDate.getMonth()]} 20 - ${monthNames[endDate.getMonth()]} 19 ${endDate.getFullYear()}`,
    year,
    month: month + 1,
  };
}
