import { NextResponse } from 'next/server';
import { ADMIN_COOKIE_NAME, ADMIN_SESSION_SECONDS, adminConfigurationReady, createAdminSession, passwordMatches } from '@/lib/server/admin-auth';

export async function POST(request: Request) {
  if (!adminConfigurationReady()) {
    return NextResponse.json({ error: '请配置至少 12 位的 ADMIN_PASSWORD 和至少 32 位的 ADMIN_SESSION_SECRET' }, { status: 503 });
  }
  let password = '';
  try {
    const body = await request.json() as { password?: unknown };
    if (typeof body.password === 'string') password = body.password;
  } catch {
    return NextResponse.json({ error: '登录请求格式无效' }, { status: 400 });
  }
  if (!passwordMatches(password)) return NextResponse.json({ error: '管理密码不正确' }, { status: 401 });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE_NAME, createAdminSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: ADMIN_SESSION_SECONDS,
  });
  return response;
}
