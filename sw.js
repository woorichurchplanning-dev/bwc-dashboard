// BWC 대시보드 서비스워커
// - 동일 출처(index.html, data.json): 네트워크 우선 + 오프라인 시 캐시 폴백
// - 교차 출처(chart.js CDN, 웹폰트): 캐시 우선 (버전 고정 자원)
const CACHE = 'bwc-dash-v2';
const SHELL = ['./', './index.html', './data.json', './manifest.json',
               './icon-192.png', './icon-512.png', './apple-touch-icon.png', './favicon-32.png'];

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

  // 교차 출처(CDN/폰트): 캐시 우선
  if (url.origin !== location.origin) {
    e.respondWith(
      caches.match(req).then((hit) =>
        hit ||
        fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
      )
    );
    return;
  }

  // 동일 출처: 네트워크 우선(최신 유지), 실패 시 캐시(오프라인)
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
  );
});
