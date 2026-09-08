import { verifySession, readCookie, SESSION_COOKIE } from './lib/auth.js';

export const config = {
  // 로그인 화면·인증 API·아이콘류만 열어 두고 나머지는 전부 막는다.
  matcher: ['/((?!login\\.html|api/login|api/logout|manifest\\.json|icon-|apple-touch-icon|favicon|sw\\.js|_vercel).*)'],
};

export default async function middleware(request) {
  const url = new URL(request.url);
  const token = readCookie(request.headers.get('cookie'), SESSION_COOKIE);
  const session = await verifySession(token, process.env.SESSION_SECRET || '');

  if (session) return;   // 통과

  // API 요청이면 리다이렉트 대신 401 — 프런트가 로그인 화면으로 보낸다
  if (url.pathname.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { 'content-type': 'application/json' },
    });
  }
  const to = new URL('/login.html', url);
  if (url.pathname !== '/' ) to.searchParams.set('next', url.pathname + url.search);
  return Response.redirect(to, 302);
}
