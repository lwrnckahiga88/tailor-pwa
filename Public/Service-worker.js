self.addEventListener("install", (e) => {
  console.log("✅ Service Worker installed");
  e.waitUntil(caches.open("v1").then((cache) => cache.addAll(["/", "/index.html"])));
});
self.addEventListener("fetch", (e) => {
  e.respondWith(caches.match(e.request).then((res) => res || fetch(e.request)));
});
