import { verifySession, readCookie, SESSION_COOKIE } from './lib/auth.js';

export const config = {
  // 로그인 화면·인증 API·아이콘류만 열어 두고 나머지는 전부 막는다.
  matcher: ['/((?!login\\.html|setup\\.html|password\\.html|api/login|api/logout|api/bootstrap|api/password|manifest\\.json|icon-|apple-touch-icon|favicon|sw\\.js|_vercel).*)'],
};

export default async function middleware(request) {
  const url = new URL(request.url);
  const token = readCookie(request.headers.get('cookie'), SESSION_COOKIE);
  const session = await verifySession(token, process.env.SESSION_SECRET || '');

  if (session) {
    // 초기 비밀번호 상태면 비밀번호를 바꾸기 전까지 어디도 못 간다
    if (session.mc === 1) {
      // 비밀번호 변경 화면이 쓰는 경로는 열어 둔다
      const allowed = url.pathname === '/api/me' || url.pathname === '/api/logout';
      if (allowed) return;
      if (url.pathname.startsWith('/api/')) {
        return new Response(JSON.stringify({ error: 'password_change_required' }), {
          status: 403, headers: { 'content-type': 'application/json' },
        });
      }
      return Response.redirect(new URL('/password.html', url), 302);
    }
    // 관리자 전용 경로는 서버에서 한 번 더 막는다 (API는 403으로 이미 막혀 있지만
    // 화면 자체가 열리면 혼선이 생긴다)
    const adminOnly = url.pathname === '/admin.html' || url.pathname.startsWith('/api/users');
    if (adminOnly && session.a !== 1) {
      if (url.pathname.startsWith('/api/')) {
        return new Response(JSON.stringify({ error: 'forbidden' }), {
          status: 403, headers: { 'content-type': 'application/json' },
        });
      }
      return Response.redirect(new URL('/index.html', url), 302);
    }
    return;   // 통과
  }

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
