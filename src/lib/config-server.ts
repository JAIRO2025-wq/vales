import { CONFIG, type AppConfig } from './config';
import fs from 'fs';
import path from 'path';

/**
 * Función exclusiva del servidor para obtener la configuración real del disco
 * sin depender del caché de módulos de Next.js/Webpack.
 */
export function getServerConfig(): AppConfig {
  try {
    const filePath = path.join(process.cwd(), 'src/data/config.json');
    if (fs.existsSync(filePath)) {
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(fileContent);
    }
  } catch (error) {
    console.error("Error leyendo config.json en el servidor, usando backup:", error);
  }
  return CONFIG;
}
