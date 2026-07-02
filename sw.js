const CACHE_NAME = 'wardrobe-v1';
const URLS_TO_CACHE = ['./index.html', './manifest.json', './share-handler.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(URLS_TO_CACHE)).catch(()=>{})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Intercept the share-target POST. This is the only place a service worker
  // can actually read the multipart form data Android hands over.
  if(event.request.method === 'POST' && url.pathname.endsWith('/share-handler.html')){
    event.respondWith(handleSharePost(event.request));
    return;
  }

  // network-first, fall back to cache, so updates to the app are picked up when online
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

async function handleSharePost(request){
  try{
    const formData = await request.formData();
    const url = formData.get('url') || '';
    const text = formData.get('text') || '';
    const title = formData.get('title') || '';
    const files = formData.getAll('images').filter(f => f && f.size > 0);

    const imageDataUrls = [];
    for(const file of files){
      const buf = await file.arrayBuffer();
      const base64 = arrayBufferToBase64(buf);
      const mime = file.type || 'image/jpeg';
      imageDataUrls.push(`data:${mime};base64,${base64}`);
    }

    const payload = { url, text, title, images: imageDataUrls, receivedAt: new Date().toISOString() };

    const cache = await caches.open('wardrobe-share-data');
    await cache.put('/__share-payload', new Response(JSON.stringify(payload), {
      headers: {'Content-Type':'application/json'}
    }));
  }catch(err){
    console.error('share post handling failed', err);
  }
  // Always redirect to the share-handler page itself (GET), which then
  // polls the cache for the payload we just stored above.
  return Response.redirect('./share-handler.html', 303);
}

function arrayBufferToBase64(buffer){
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for(let i=0; i<bytes.length; i+=chunkSize){
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i+chunkSize));
  }
  return btoa(binary);
}
