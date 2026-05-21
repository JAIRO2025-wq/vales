import { configData } from '@/data/config';

export type UserRole = 'CAJERA' | 'SOLICITANTE' | 'JEFE' | 'ADMIN';

export interface UserPin {
  pin: string;
  role: UserRole;
  branch?: string; 
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
 * CONFIG base (estática para el cliente inicial)
 */
export const CONFIG: AppConfig = configData as unknown as AppConfig;

export const ADMIN_PIN = "2026";

export default CONFIG;
