import { verifySession, readCookie, SESSION_COOKIE } from './lib/auth.js';

export const config = {
  // 아이콘·폰트 같은 정적 파일만 빼고 전부 거친다. 예전에는 로그인 화면이
  // 아예 미들웨어를 안 타서 크롤러 차단을 걸 자리가 없었다.
  matcher: ['/((?!_vercel|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff2?)$).*)'],
};

/* 학습·수집용 봇은 받지 않는다.

   대시보드는 로그인 뒤에 있어 어차피 자료에 닿지 못하지만, 로그인 화면과
   robots.txt 는 열려 있으므로 문 앞에서 돌려보낸다. 사람이 쓰는 브라우저는
   이 목록에 없으므로 영향이 없다. */
const BOT_UA = /(GPTBot|OAI-SearchBot|ChatGPT-User|ClaudeBot|Claude-Web|anthropic-ai|PerplexityBot|Perplexity-User|CCBot|Google-Extended|Applebot-Extended|Bytespider|Amazonbot|meta-externalagent|FacebookBot|Diffbot|cohere-ai|Omgilibot|ImagesiftBot|YouBot|Timpibot|Scrapy|python-requests|node-fetch|axios\/|Go-http-client|libwww-perl|Wget|HeadlessChrome)/i;

/* 로그인 없이 열어 두는 곳 */
const PUBLIC_PATHS = new Set([
  '/login.html', '/setup.html', '/password.html', '/robots.txt',
  '/manifest.json', '/sw.js', '/favicon.ico',
  '/api/login', '/api/logout', '/api/bootstrap', '/api/password', '/api/ingest',
]);
const isPublic = (p) =>
  PUBLIC_PATHS.has(p) || p.startsWith('/icon-') || p.startsWith('/apple-touch-icon') || p.startsWith('/favicon');

export default async function middleware(request) {
  const url = new URL(request.url);

  // ① 학습용 수집기는 무엇이든 주지 않는다.
  //    robots.txt 는 읽을 수 있게 두고, api/ingest 는 시트가 부르는 자리라
  //    브라우저가 아니므로 빼 둔다(그쪽은 자체 비밀키로 막혀 있다).
  const ua = request.headers.get('user-agent') || '';
  const exempt = url.pathname === '/robots.txt' || url.pathname === '/api/ingest';
  if (!exempt && (BOT_UA.test(ua) || !ua)) {
    return new Response('Not available.', {
      status: 403,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'x-robots-tag': 'noindex, nofollow, noai' },
    });
  }

  // ② 로그인 없이 여는 곳은 그대로 통과
  if (isPublic(url.pathname)) return;

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
