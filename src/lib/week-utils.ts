/**
 * Calcula el lunes de la semana actual (UTC-6 El Salvador).
 * Formato: YYYY-MM-DD
 */
export function getLunesActual(): string {
  const now = new Date();
  const offsetMinutes = now.getTimezoneOffset();
  let svDate: Date;
  if (offsetMinutes === 360) {
    svDate = now;
  } else {
    svDate = new Date(now.getTime() + (-6 * 3600000 - -offsetMinutes * 60000));
  }
  const dayOfWeek = svDate.getDay(); // 0 = domingo, 1 = lunes
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  svDate.setDate(svDate.getDate() - daysToMonday);
  const y = svDate.getFullYear();
  const m = String(svDate.getMonth() + 1).padStart(2, '0');
  const d = String(svDate.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
