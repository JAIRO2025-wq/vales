import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { getCycleFromDate } from '@/lib/cycles';

const STORAGE_PATH = path.join(process.cwd(), 'src/data/storage');

/**
 * Sirve imágenes (firmas y comprobantes) almacenadas en el filesystem.
 * 
 * Uso: GET /api/imagenes?fecha=2026-09-22&file=imagenes/FIRMA_VALE_001.png
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fecha = searchParams.get('fecha');
    const filePath = searchParams.get('file');

    if (!fecha || !filePath) {
      return NextResponse.json(
        { error: 'Faltan parámetros: fecha y file son requeridos' },
        { status: 400 }
      );
    }

    // Calcular el ciclo contable desde la fecha
    const cycle = await getCycleFromDate(fecha);
    const fullPath = path.join(STORAGE_PATH, cycle.year.toString(), cycle.id, filePath);

    // Security: evitar directory traversal
    const resolvedPath = path.resolve(fullPath);
    const storageDir = path.resolve(STORAGE_PATH);
    if (!resolvedPath.startsWith(storageDir)) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
    }

    // Intentar leer el archivo
    let fileBuffer: Buffer;
    try {
      fileBuffer = await fs.readFile(resolvedPath);
    } catch {
      return NextResponse.json({ error: 'Archivo no encontrado' }, { status: 404 });
    }

    // Determinar el Content-Type según la extensión
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
    };
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('Error sirviendo imagen:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
