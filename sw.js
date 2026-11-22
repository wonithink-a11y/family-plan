const CACHE_NAME = 'family-plan-v33';
const BASE = '/family-plan';
const SCOPE = self.registration.scope; // 예: https://user.github.io/family-plan/
const urlsToCache = ['./', 'index.html', 'manifest.json', 'icon-192.png', 'icon-512.png']
  .map(p => new URL(p, SCOPE).href);

// ── 푸시 알림(FCM) ──
// 같은 서비스 워커에서 백그라운드 알림을 받는다. 오프라인이거나 로드에 실패해도 앱 캐시 기능은 그대로 동작해야 하므로 try/catch.
try{
  importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js','https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
  firebase.initializeApp({
    apiKey: "AIzaSyBkveZ9AOIWAMNvfgKlTljc6pf3xEfERd8",
    authDomain: "family-plan-11d44.firebaseapp.com",
    projectId: "family-plan-11d44",
    storageBucket: "family-plan-11d44.firebasestorage.app",
    messagingSenderId: "355808963418",
    appId: "1:355808963418:web:60fe2cc636f174c16ae163"
  });
  // 서버가 notification 필드를 포함해 보내면 SDK가 알림을 자동으로 띄운다.
  // data 전용 메시지가 오면 여기서 직접 띄운다.
  firebase.messaging().onBackgroundMessage(p => {
    if (p && p.notification) return;
    const d = (p && p.data) || {};
    return self.registration.showNotification(d.title || '패밀리플랜', { body: d.body || '', icon: BASE + '/icon-192.png', data: { link: d.link || BASE + '/' } });
  });
}catch(e){}

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const link = (e.notification.data && (e.notification.data.link || (e.notification.data.FCM_MSG && e.notification.data.FCM_MSG.data && e.notification.data.FCM_MSG.data.link))) || BASE + '/';
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) { if ('focus' in c) return c.focus(); }
    return clients.openWindow(link);
  }));
});

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
