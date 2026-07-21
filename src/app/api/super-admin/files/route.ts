import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { getServerConfig } from '@/lib/config-server';

const COOKIE_NAME = 'sa_token';
const STORAGE_PATH = path.join(process.cwd(), 'src/data/storage');
const SERVER_PATH = path.join(process.cwd(), 'servidor');

// Raíces disponibles en el explorador
const ROOTS: Record<string, { label: string; basePath: string }> = {
  sistema: { label: 'Sistema (src/data)', basePath: path.join(process.cwd(), 'src/data') },
  servidor: { label: 'Servidor Python', basePath: path.join(process.cwd(), 'servidor') },
};

function validateToken(token: string | undefined, password: string): boolean {
  if (!token || !password) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const ts = parseInt(parts[1], 10);
  if (isNaN(ts) || Date.now() - ts > 8 * 60 * 60 * 1000) return false;
  const secret = 'flynet-super-admin-2026';
  const expected = createHash('sha256').update(`${password}:${secret}:${ts}`).digest('hex');
  return parts[0] === expected;
}

interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: string;
  path: string;
}

/**
 * GET /api/super-admin/files
 * Query: ?root=sistema|servidor&path=/2026/2026-05
 */
export async function GET(request: NextRequest) {
  const config = getServerConfig();
  const password = config.SUPER_ADMIN_PASSWORD;
  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (!validateToken(token, password)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const rootKey = searchParams.get('root') || 'sistema';
  const subPath = searchParams.get('path') || '';

  const rootConfig = ROOTS[rootKey];
  if (!rootConfig) {
    return NextResponse.json({ error: 'Root no válido. Usa: sistema, servidor' }, { status: 400 });
  }

  const basePath = rootConfig.basePath;
  const safeSubPath = subPath.replace(/\.\./g, '').replace(/\\/g, '/').replace(/^\/+/, '');
  const fullPath = path.join(basePath, safeSubPath);

  // Verificar que no salga del root permitido
  if (!fullPath.startsWith(basePath)) {
    return NextResponse.json({ error: 'Ruta no permitida' }, { status: 403 });
  }

  try {
    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    const result: FileEntry[] = [];

    for (const entry of entries) {
      const entryPath = path.join(fullPath, entry.name);
      const relativePath = path.join(safeSubPath, entry.name).replace(/\\/g, '/');

      try {
        const stat = await fs.stat(entryPath);
        const item: FileEntry = {
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : 'file',
          path: relativePath,
        };

        if (!entry.isDirectory()) {
          item.size = stat.size;
          item.modified = stat.mtime.toISOString();
        }

        result.push(item);
      } catch {
        // Archivo inaccesible, omitir
      }
    }

    // Ordenar: directorios primero, luego archivos, alfabético
    result.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({
      root: rootKey,
      path: safeSubPath || '/',
      entries: result,
    });
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return NextResponse.json({ error: 'Directorio no encontrado' }, { status: 404 });
    }
    if (error.code === 'ENOTDIR') {
      return NextResponse.json({ error: 'No es un directorio' }, { status: 400 });
    }
    console.error('Error listando archivos:', error);
    return NextResponse.json({ error: 'Error al listar archivos' }, { status: 500 });
  }
}
