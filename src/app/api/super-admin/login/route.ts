import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { getServerConfig } from '@/lib/config-server';

const COOKIE_NAME = 'sa_token';
const SESSION_TTL = 8 * 60 * 60 * 1000; // 8 horas

function generateToken(password: string): string {
  const secret = 'flynet-super-admin-2026';
  const ts = Date.now();
  const raw = `${password}:${secret}:${ts}`;
  return createHash('sha256').update(raw).digest('hex') + '.' + ts;
}

function validateToken(token: string | undefined, password: string): boolean {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const ts = parseInt(parts[1], 10);
  if (isNaN(ts) || Date.now() - ts > SESSION_TTL) return false;
  const secret = 'flynet-super-admin-2026';
  const expected = createHash('sha256').update(`${password}:${secret}:${ts}`).digest('hex');
  return parts[0] === expected;
}

/**
 * POST /api/super-admin/login
 * Body: { password: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { password } = body;

    const config = getServerConfig();
    const expectedPassword = config.SUPER_ADMIN_PASSWORD;

    if (!expectedPassword) {
      return NextResponse.json({ success: false, error: 'SUPER_ADMIN no configurado' }, { status: 500 });
    }

    if (password !== expectedPassword) {
      return NextResponse.json({ success: false, error: 'Password incorrecto' }, { status: 401 });
    }

    const token = generateToken(password);

    const response = NextResponse.json({ success: true });
    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_TTL / 1000,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Error en login super-admin:', error);
    return NextResponse.json({ success: false, error: 'Error interno' }, { status: 500 });
  }
}

/**
 * GET /api/super-admin/login
 * Verifica si la sesión actual es válida.
 */
export async function GET(request: NextRequest) {
  const config = getServerConfig();
  const password = config.SUPER_ADMIN_PASSWORD;
  const token = request.cookies.get(COOKIE_NAME)?.value;
  const valid = validateToken(token, password);

  return NextResponse.json({ valid });
}
