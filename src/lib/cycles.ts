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
 * Calcula el ciclo actual basado en la fecha de hoy.
 * El ciclo de Flynet va del 20 de un mes al 19 del siguiente.
 * 
 * Ejemplos:
 * - 22 de junio → ciclo Jun 20 - Jul 19 (id: 2026-06)
 * - 15 de junio → ciclo May 20 - Jun 19 (id: 2026-05)
 * - 20 de junio → ciclo Jun 20 - Jul 19 (id: 2026-06)
 */
/**
 * Obtiene la fecha actual en la zona horaria de El Salvador (UTC-6).
 * Esto evita discrepancias cuando el servidor (Vercel) está en UTC y el cliente en UTC-6.
 * 
 * Usamos un cálculo manual con offset UTC-6 porque Intl.DateTimeFormat con
 * timeZone puede fallar en algunos navegadores si el timezone no está disponible.
 */
function getLocalDate(): { year: number; month: number; day: number } {
  const now = new Date();
  
  // Si la app corre en El Salvador (UTC-6), usamos la fecha local directamente.
  // getTimezoneOffset() en UTC-6 devuelve 360 (positivo), lo que confirma la zona.
  // Para Vercel (UTC+0), getTimezoneOffset() devuelve 0, y ahí sí ajustamos.
  const offsetMinutes = now.getTimezoneOffset();
  
  let svDate: Date;
  
  if (offsetMinutes === 360) {
    // Ya estamos en UTC-6 (El Salvador), usar fecha local tal cual
    svDate = now;
  } else {
    // Estamos en otra zona (ej: Vercel UTC+0), ajustar a UTC-6
    // offsetMinutes: 0 en UTC → necesitamos restar 6h
    // offsetMinutes: -60 en UTC+1 → necesitamos restar 7h
    const targetOffsetMs = -6 * 60 * 60 * 1000; // UTC-6
    const currentOffsetMs = -offsetMinutes * 60 * 1000; // invertir signo
    const diffMs = targetOffsetMs - currentOffsetMs;
    svDate = new Date(now.getTime() + diffMs);
  }
  
  const year = svDate.getFullYear();
  const month = svDate.getMonth(); // 0-11
  const day = svDate.getDate();
  
  console.log('[DEBUG cycles] getLocalDate():', {
    nowISO: now.toISOString(),
    nowLocal: now.toString(),
    offsetMinutes,
    isSV: offsetMinutes === 360,
    result: `${year}-${(month + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
    resultMonth: month,
    resultDay: day,
  });
  
  return { year, month, day };
}

export function getCurrentCycle(): CycleInfo {
  const { year, month, day } = getLocalDate();
  let cycleYear = year;
  let cycleMonth = month; // 0-11

  // Si hoy es antes del 20, el ciclo empezó el 20 del mes anterior
  if (day < 20) {
    if (cycleMonth === 0) {
      cycleMonth = 11;
      cycleYear--;
    } else {
      cycleMonth--;
    }
  }
  // Si es día 20 o más, el ciclo empieza en ESTE mes

  return formatCycle(cycleYear, cycleMonth);
}

/**
 * Genera una lista de los últimos 6 ciclos para el selector
 */
export function getRecentCycles(): CycleInfo[] {
  const cycles: CycleInfo[] = [];
  const current = getCurrentCycle();
  // ⚠️ CycleInfo.month es 1-indexado (formatCycle suma 1)
  // Pero formatCycle espera 0-indexado. Convertimos a 0-indexado aquí.
  let cycleMonth = current.month - 1;
  let cycleYear = current.year;

  for (let i = 0; i < 6; i++) {
    cycles.push(formatCycle(cycleYear, cycleMonth));
    if (cycleMonth === 0) {
      cycleMonth = 11;
      cycleYear--;
    } else {
      cycleMonth--;
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
