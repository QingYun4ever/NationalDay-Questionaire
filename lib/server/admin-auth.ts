import 'server-only';
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';

export const ADMIN_COOKIE_NAME = 'gqj_admin_session';
export const ADMIN_SESSION_SECONDS = 8 * 60 * 60;

export function adminConfigurationReady() {
  return (process.env.ADMIN_PASSWORD?.length ?? 0) >= 12 && (process.env.ADMIN_SESSION_SECRET?.length ?? 0) >= 32
}

export function passwordMatches(candidate: string) {
  const configuredPassword = process.env.ADMIN_PASSWORD ?? '';
  const submittedHash = createHash('sha256').update(candidate).digest();
  const configuredHash = createHash('sha256').update(configuredPassword).digest();
  return timingSafeEqual(submittedHash, configuredHash) && Boolean(configuredPassword);
}

function sign(payload: string) {
  return createHmac('sha256', process.env.ADMIN_SESSION_SECRET ?? '').update(payload).digest('base64url');
}

export function createAdminSession() {
  const payload = Buffer.from(JSON.stringify({ expiresAt: Date.now() + ADMIN_SESSION_SECONDS * 1000 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function hasAdminSession(request: Request) {
  if (!adminConfigurationReady()) return false;
  const cookiePair = request.headers.get('cookie')?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${ADMIN_COOKIE_NAME}=`));
  const token = cookiePair?.slice(ADMIN_COOKIE_NAME.length + 1);
  if (!token) return false;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return false;
  const actual = Buffer.from(signature, 'base64url');
  const expected = Buffer.from(sign(payload), 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { expiresAt?: unknown };
    return typeof decoded.expiresAt === 'number' && decoded.expiresAt > Date.now();
  } catch {
    return false;
  }
}
