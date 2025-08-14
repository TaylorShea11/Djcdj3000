
const CACHE_NAME = 'cdj-pwa-v1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];
self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(ASSETS)));
});
self.addEventListener('activate', e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.map(k=>k===CACHE_NAME?null:caches.delete(k)))));
});
self.addEventListener('fetch', e=>{
  const url = new URL(e.request.url);
  if (ASSETS.includes(url.pathname.replace(self.registration.scope, './'))) {
    e.respondWith(caches.match(e.request));
  } else {
    e.respondWith(fetch(e.request).catch(()=>caches.match('./index.html')));
  }
});
