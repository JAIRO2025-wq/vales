'use server';

import fs from 'fs/promises';
import path from 'path';
import { revalidatePath } from 'next/cache';
import { type AppConfig } from '@/lib/config';

/**
 * Guarda la configuración en src/data/config.json.
 * Se utiliza una ruta absoluta para asegurar la persistencia en el directorio de datos.
 */
export async function updateConfigAction(newConfig: AppConfig) {
  try {
    const filePath = path.join(process.cwd(), 'src/data/config.json');
    
    // Guardar como JSON puro para lectura fácil por FS
    await fs.writeFile(filePath, JSON.stringify(newConfig, null, 2), 'utf-8');
    
    // También actualizamos el archivo .ts para que los imports estáticos tengan una base,
    // aunque el sistema ahora priorizará la lectura dinámica.
    const tsFilePath = path.join(process.cwd(), 'src/data/config.ts');
    const tsContent = `export const configData = ${JSON.stringify(newConfig, null, 2)};\n`;
    await fs.writeFile(tsFilePath, tsContent, 'utf-8');
    
    // Forzar revalidación de todas las rutas
    revalidatePath('/', 'layout');
    
    return { success: true };
  } catch (error) {
    console.error('Error al guardar la configuración:', error);
    return { success: false, error: 'No se pudo guardar la configuración en el servidor.' };
  }
}
