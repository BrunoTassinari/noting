// Service worker do Noting. De propósito simples: NÃO guarda notas em cache
// (elas sempre vêm do servidor). Só mostra uma página "sem conexão" quando
// a navegação falha, e existe para o app ser instalável.

const CACHE = "noting-shell-v2";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      // Evita o atraso de iniciar o service worker em cada navegação.
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  // Arquivos da própria página offline (ex.: o ícone): cache se a rede falhar.
  const url = new URL(event.request.url);
  if (event.request.mode !== "navigate" && url.origin === self.location.origin && PRECACHE.includes(url.pathname)) {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
    return;
  }
  // Fora isso, só navegações (abrir páginas). Dados, scripts e API vão direto
  // para a rede, sem cache.
  if (event.request.mode !== "navigate") return;
  event.respondWith(
    (async () => {
      try {
        const preloaded = await event.preloadResponse;
        if (preloaded) return preloaded;
        return await fetch(event.request);
      } catch {
        return (await caches.match(OFFLINE_URL)) || Response.error();
      }
    })(),
  );
});
