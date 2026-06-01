const CACHE = 'family-planner-v12';

// 설치 즉시 활성화
self.addEventListener('install', e => {
  self.skipWaiting();
});

// 이전 캐시 전부 삭제 후 즉시 제어권 획득
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// 항상 네트워크 우선 — 캐시는 오프라인 폴백만
self.addEventListener('fetch', e => {
  if(e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
