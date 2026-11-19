// 教師資格考試練習平台：離線用 Service Worker
// 改了網站檔案後，把 VERSION 數字加 1，手機才會抓新版。
const VERSION = "v4";
const CORE = "core-" + VERSION;
const IMAGES = "images-v4"; // 原卷圖片：看過一次就存起來

const CORE_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./css/sf-bar.css",
  "./data/meta.js",
  "./data/questions.js",
  "./data/concepts.js",
  "./data/guide.js",
  "./js/bundle.js",
  "./img/favicon-32.png",
  "./img/icon-192.png",
  "./img/icon-512.png",
  "./img/apple-touch-icon.png",
  "./img/sf-mark-light-192.png",
  "./img/sf-mark-dark-192.png",
  "./img/sf-mark-light-96.png",
  "./img/sf-lockup-light.png",
  "./img/sf-lockup-dark.png",
  "./img/hero-mobile.webp",
  "./img/hero-wide.webp"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CORE).then((c) => c.addAll(CORE_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CORE && k !== IMAGES).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // 開網頁：先用存好的首頁
  if (req.mode === "navigate") {
    e.respondWith(caches.match("./index.html").then((r) => r || fetch(req)));
    return;
  }

  // 原卷圖片（pages/、figures/）：有存就用，沒有就下載並存起來
  if (url.pathname.includes("/pages/") || url.pathname.includes("/figures/") || url.pathname.includes("/data/book/")) {
    e.respondWith(
      caches.open(IMAGES).then((c) =>
        c.match(req).then((hit) => hit || fetch(req).then((res) => {
          if (res.ok) c.put(req, res.clone());
          return res;
        }))
      )
    );
    return;
  }

  // 其他檔案：先用快取，沒有再上網
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
