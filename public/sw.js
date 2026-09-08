// BWC 대시보드 서비스워커
// 로그인 게이트가 생긴 뒤로는 '데이터'를 캐시하지 않는다.
// index.html / data.json 을 캐시해 두면 로그아웃 후에도 남거나,
// 권한이 다른 사용자가 이전 사용자의 화면을 보게 될 수 있다.
const CACHE = 'bwc-dash-v3';
const SHELL = ['./manifest.json', './icon-192.png', './icon-512.png',
               './apple-touch-icon.png', './favicon-32.png'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // 인증이 필요한 경로는 절대 캐시하지 않고 네트워크로만 처리한다
  const isPrivate = url.origin === location.origin &&
    (url.pathname === '/' || url.pathname.endsWith('.html') ||
     url.pathname.endsWith('.json') && !url.pathname.endsWith('manifest.json') ||
     url.pathname.startsWith('/api/'));
  if (isPrivate) return;   // 브라우저 기본 처리

  // 교차 출처(CDN/폰트)와 아이콘: 캐시 우선 (버전 고정 자원)
  e.respondWith(
    caches.match(req).then((hit) =>
      hit || fetch(req).then((res) => {
        if (res.ok && res.type !== 'opaqueredirect') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => hit)
    )
  );
});
