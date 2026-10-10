/* Service worker: makes the app installable and quick to open, and receives videos shared
   to Screenreel from a phone's gallery (Android "Share → Screenreel"). Shared videos are
   parked in the "screenreel-inbox" cache; the app moves them into its storage on load. */

const CACHE = "screenreel-v3";
const INBOX = "screenreel-inbox";
const scope = self.registration.scope;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.add(scope)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== INBOX).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // Google sign-in, Drive and fonts go straight to the network
  if (e.request.method === "POST" && url.pathname.endsWith("/share-target")) {
    e.respondWith(receiveShare(e.request));
    return;
  }
  if (e.request.method !== "GET") return;
  // Network first so a new version on GitHub Pages shows up right away; the cache covers offline.
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })
        .then((hit) => hit || (e.request.mode === "navigate" ? caches.match(scope) : Response.error())))
  );
});

async function receiveShare(request) {
  try {
    const form = await request.formData();
    const files = form.getAll("media").filter((f) => f && typeof f !== "string" && f.size);
    const inbox = await caches.open(INBOX);
    for (const f of files) {
      const key = scope + "inbox/" + Date.now() + "-" + Math.random().toString(36).slice(2);
      await inbox.put(key, new Response(f, {
        headers: { "Content-Type": f.type || "video/mp4", "X-Name": encodeURIComponent(f.name || ""), "X-Created": String(Date.now()) }
      }));
    }
    return Response.redirect(scope + "?shared=" + files.length, 303);
  } catch (err) {
    return Response.redirect(scope + "?share-error=1", 303);
  }
}
