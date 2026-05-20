import { configData } from '@/data/config';

export type UserRole = 'CAJERA' | 'SOLICITANTE' | 'JEFE' | 'ADMIN';

export interface UserPin {
  pin: string;
  role: UserRole;
  branch?: string; // Sucursal asignada (opcional para roles globales)
}

export interface AppConfig {
  API_URL: string;
  PDF_API_URL: string;
  PINES: Record<string, UserPin>;
  EMPRESA: string;
  LOGO_URL: string;
  SUCURSALES: string[];
  TIPOS_CAJA: string[];
}

/**
 * En el servidor, podemos importar esto directamente.
 * Para el cliente, es mejor pasarlo como props si queremos reactividad tras un router.refresh()
 */
export const CONFIG: AppConfig = configData as unknown as AppConfig;

export const ADMIN_PIN = "2026";

export default CONFIG;
