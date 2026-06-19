/**
 * Utilidades para manejar los ciclos de cierre de Flynet (del 20 de un mes al 19 del siguiente)
 */

export interface CycleInfo {
  id: string; // Formato: YYYY-MM (Mes de inicio)
  label: string; // Ejemplo: Oct 20 - Nov 19 2026
  year: number;
  month: number;
}

/**
 * Calcula el ciclo actual basado en la fecha de hoy
 */
export function getCurrentCycle(): CycleInfo {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth(); // 0-11
  const day = now.getDate();

  // Si hoy es antes del 20, el ciclo empezó el 20 del mes anterior
  if (day < 20) {
    if (month === 0) {
      month = 11;
      year--;
    } else {
      month--;
    }
  }

  return formatCycle(year, month);
}

/**
 * Genera una lista de los últimos 6 ciclos para el selector
 */
export function getRecentCycles(): CycleInfo[] {
  const cycles: CycleInfo[] = [];
  let { year, month } = getCurrentCycle();

  for (let i = 0; i < 6; i++) {
    cycles.push(formatCycle(year, month));
    if (month === 0) {
      month = 11;
      year--;
    } else {
      month--;
    }
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

function formatCycle(year: number, month: number): CycleInfo {
  const startDate = new Date(year, month, 20);
  const endDate = new Date(year, month + 1, 19);
  
  const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  
  return {
    id: `${year}-${(month + 1).toString().padStart(2, '0')}`,
    label: `${monthNames[startDate.getMonth()]} 20 - ${monthNames[endDate.getMonth()]} 19 ${endDate.getFullYear()}`,
    year,
    month: month + 1
  };
}
