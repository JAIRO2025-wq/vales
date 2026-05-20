'use server';

import fs from 'fs/promises';
import path from 'path';
import { revalidatePath } from 'next/cache';
import { type AppConfig } from '@/lib/config';

/**
 * Guarda la configuración en src/data/config.ts como un módulo exportable.
 * Esto evita errores de Turbopack HMR con archivos JSON y permite persistencia en el repo.
 */
export async function updateConfigAction(newConfig: AppConfig) {
  try {
    const filePath = path.join(process.cwd(), 'src/data/config.ts');
    
    // Generar el contenido del archivo TS
    const content = `export const configData = ${JSON.stringify(newConfig, null, 2)};\n`;
    
    await fs.writeFile(filePath, content, 'utf-8');
    
    // Invalidar todas las rutas para refrescar los datos
    revalidatePath('/', 'layout');
    
    return { success: true };
  } catch (error) {
    console.error('Error al guardar la configuración:', error);
    return { success: false, error: 'No se pudo guardar la configuración en el servidor.' };
  }
}
