import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { getServerConfig } from '@/lib/config-server';

const COOKIE_NAME = 'sa_token';

const ROOTS: Record<string, { basePath: string }> = {
  sistema: { basePath: path.join(process.cwd(), 'src/data') },
  servidor: { basePath: path.join(process.cwd(), 'servidor') },
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

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.csv': 'text/csv',
    '.md': 'text/markdown',
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.ts': 'text/typescript',
    '.tsx': 'text/typescript',
    '.py': 'text/x-python',
    '.xml': 'application/xml',
    '.zip': 'application/zip',
    '.hash': 'text/plain',
    '.mjs': 'text/javascript',
  };
  return map[ext] || 'application/octet-stream';
}

function isPreviewable(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  const previewExts = ['.json', '.txt', '.csv', '.md', '.html', '.css', '.js', '.ts', '.tsx', '.py', '.xml', '.mjs', '.hash', '.env', '.gitignore'];
  return previewExts.includes(ext);
}

function isImage(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext);
}

/**
 * GET /api/super-admin/file?root=sistema&path=/2026/vouchers.json&action=info|download|preview
 * DELETE /api/super-admin/file?root=sistema&path=/2026/vouchers.json
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
  const action = searchParams.get('action') || 'info';

  const rootConfig = ROOTS[rootKey];
  if (!rootConfig) {
    return NextResponse.json({ error: 'Root no válido' }, { status: 400 });
  }

  const basePath = rootConfig.basePath;
  const safeSubPath = subPath.replace(/\.\./g, '').replace(/\\/g, '/').replace(/^\/+/, '');
  const fullPath = path.join(basePath, safeSubPath);

  if (!fullPath.startsWith(basePath)) {
    return NextResponse.json({ error: 'Ruta no permitida' }, { status: 403 });
  }

  try {
    const stat = await fs.stat(fullPath);

    if (stat.isDirectory()) {
      return NextResponse.json({ error: 'Es un directorio, no un archivo' }, { status: 400 });
    }

    if (action === 'download') {
      // Leer y devolver como descarga
      const content = await fs.readFile(fullPath);
      const fileName = path.basename(fullPath);
      const mimeType = getMimeType(fullPath);

      return new NextResponse(content, {
        status: 200,
        headers: {
          'Content-Type': mimeType,
          'Content-Disposition': `attachment; filename="${fileName}"`,
          'Content-Length': String(stat.size),
        },
      });
    }

    if (action === 'preview') {
      if (isImage(fullPath)) {
        const content = await fs.readFile(fullPath);
        return new NextResponse(content, {
          status: 200,
          headers: {
            'Content-Type': getMimeType(fullPath),
            'Cache-Control': 'public, max-age=3600',
          },
        });
      }

      if (isPreviewable(fullPath)) {
        const content = await fs.readFile(fullPath, 'utf-8');
        const maxSize = 500 * 1024; // 500KB máximo para preview
        const truncated = content.length > maxSize;
        const preview = truncated ? content.slice(0, maxSize) : content;

        return NextResponse.json({
          type: 'text',
          content: preview,
          truncated,
          totalSize: content.length,
          lines: content.split('\n').length,
        });
      }

      return NextResponse.json({ type: 'unsupported', message: 'No se puede previsualizar este tipo de archivo' });
    }

    // action === 'info' (default)
    return NextResponse.json({
      name: path.basename(fullPath),
      path: safeSubPath,
      size: stat.size,
      modified: stat.mtime.toISOString(),
      created: stat.birthtime?.toISOString() || null,
      mimeType: getMimeType(fullPath),
      previewable: isPreviewable(fullPath) || isImage(fullPath),
    });
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return NextResponse.json({ error: 'Archivo no encontrado' }, { status: 404 });
    }
    console.error('Error accediendo a archivo:', error);
    return NextResponse.json({ error: 'Error al acceder al archivo' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
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
    return NextResponse.json({ error: 'Root no válido' }, { status: 400 });
  }

  const basePath = rootConfig.basePath;
  const safeSubPath = subPath.replace(/\.\./g, '').replace(/\\/g, '/').replace(/^\/+/, '');
  const fullPath = path.join(basePath, safeSubPath);

  if (!fullPath.startsWith(basePath)) {
    return NextResponse.json({ error: 'Ruta no permitida' }, { status: 403 });
  }

  try {
    const stat = await fs.stat(fullPath);

    if (stat.isDirectory()) {
      // Borrar directorio recursivamente
      await fs.rm(fullPath, { recursive: true });
      return NextResponse.json({ success: true, type: 'directory' });
    }

    await fs.unlink(fullPath);
    return NextResponse.json({ success: true, type: 'file' });
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return NextResponse.json({ error: 'Archivo no encontrado' }, { status: 404 });
    }
    console.error('Error eliminando archivo:', error);
    return NextResponse.json({ error: 'Error al eliminar el archivo' }, { status: 500 });
  }
}
