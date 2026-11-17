const CACHE_NAME = 'family-plan-v2';
const SCOPE = self.registration.scope; // 예: https://user.github.io/family-plan/
const urlsToCache = ['./', 'index.html', 'manifest.json', 'icon-192.png', 'icon-512.png']
  .map(p => new URL(p, SCOPE).href);

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => Promise.all(urlsToCache.map(u => c.add(u).catch(() => {}))))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  // GET + 동일 출처만 처리 (Firebase/CDN 등 외부 요청은 건드리지 않음)
  if (req.method !== 'GET' || url.origin !== location.origin) return;

  // 페이지(HTML)는 network-first → 배포 즉시 반영, 오프라인이면 캐시
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then(r => r || caches.match(new URL('index.html', SCOPE).href)))
    );
    return;
  }

  // 정적 자원은 cache-first
  e.respondWith(caches.match(req).then(r => r || fetch(req)));
});
