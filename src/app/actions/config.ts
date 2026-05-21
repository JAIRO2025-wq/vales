'use server';

import fs from 'fs/promises';
import path from 'path';
import { revalidatePath } from 'next/cache';
import { type AppConfig, type UserPin } from '@/lib/config';

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

/**
 * Valida un PIN contra la configuración real en el disco.
 * Retorna el usuario si es válido y tiene permiso para la sucursal.
 */
export async function verifyPinAction(pin: string, branch: string) {
  try {
    const filePath = path.join(process.cwd(), 'src/data/config.json');
    const fileContent = await fs.readFile(filePath, 'utf-8');
    const config: AppConfig = JSON.parse(fileContent);

    // 1. Verificar PIN de Administrador Maestro
    if (pin === "2026") {
      return { success: true, user: { name: "ADMINISTRADOR", role: "ADMIN" } };
    }

    // 2. Buscar en la lista de PINES registrados
    const entry = Object.entries(config.PINES).find(([_, data]) => data.pin === pin);

    if (!entry) {
      return { success: false, error: "El PIN ingresado no está registrado en el sistema." };
    }

    const [name, data] = entry;

    // 3. Validar Sucursal (Solo si no es ADMIN o JEFE global)
    // Usamos uppercase para evitar fallos por tipeo
    const isGlobal = data.role === "ADMIN" || data.role === "JEFE";
    const targetBranch = (data.branch || "").toUpperCase();
    const voucherBranch = (branch || "").toUpperCase();

    const isMatchingBranch = targetBranch === voucherBranch || targetBranch === "GLOBAL";

    if (!isGlobal && !isMatchingBranch) {
      return { 
        success: false, 
        error: `Acceso denegado. ${name} pertenece a la sede ${targetBranch}, no puede firmar vales de ${voucherBranch}.` 
      };
    }

    return { success: true, user: { name, role: data.role } };

  } catch (error) {
    console.error("Error validando PIN:", error);
    return { success: false, error: "Error de conexión con el servidor de seguridad." };
  }
}
