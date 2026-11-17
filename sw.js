const CACHE_NAME = 'family-plan-v4';
const BASE = '/family-plan';
const urlsToCache = [BASE+'/', BASE+'/index.html', BASE+'/manifest.json'];

// ── 푸시 알림(FCM) ──
// 같은 서비스 워커에서 백그라운드 알림을 받는다. 오프라인이거나 로드에 실패해도 앱 캐시 기능은 그대로 동작해야 하므로 try/catch.
try{
  importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js','https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
  firebase.initializeApp({
    apiKey: "AIzaSyDU5MJI2w8AYazPxyzukE1lWAzLXOFfr7o",
    authDomain: "rosegarden-4937c.firebaseapp.com",
    projectId: "rosegarden-4937c",
    storageBucket: "rosegarden-4937c.firebasestorage.app",
    messagingSenderId: "109165303238",
    appId: "1:109165303238:web:db2401090c9e79a5be8ec7"
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
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(urlsToCache).catch(()=>{})));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
