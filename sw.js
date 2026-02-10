const CACHE_NAME = 'obrapro-enterprise-v2';
const STATIC_CACHE = 'obrapro-static-v2';
const DYNAMIC_CACHE = 'obrapro-dynamic-v2';
const IMAGE_CACHE = 'obrapro-images-v2';

// Assets estáticos críticos
const STATIC_ASSETS = [
  '/CALCULADORA-DE-MEDICIONES/',
  '/CALCULADORA-DE-MEDICIONES/index.html',
  '/CALCULADORA-DE-MEDICIONES/manifest.json',
  '/CALCULADORA-DE-MEDICIONES/offline.html'
];

// CDNs necesarios
const CDN_ASSETS = [
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/react@18/umd/react.production.min.js',
  'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
  'https://unpkg.com/@babel/standalone/babel.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.25/jspdf.plugin.autotable.min.js',
  'https://cdn.sheetjs.com/xlsx-0.20.0/package/dist/xlsx.full.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-storage-compat.js',
  'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth-compat.js'
];

// Instalación: Cachear críticos
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando...');
  
  event.waitUntil(
    Promise.all([
      caches.open(STATIC_CACHE).then(cache => cache.addAll(STATIC_ASSETS)),
      caches.open(DYNAMIC_CACHE),
      caches.open(IMAGE_CACHE)
    ]).then(() => {
      console.log('[SW] Caches creados');
      return self.skipWaiting();
    })
  );
});

// Activación: Limpiar caches antiguos
self.addEventListener('activate', (event) => {
  console.log('[SW] Activando...');
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => {
            return name.startsWith('obrapro-') && 
                   name !== STATIC_CACHE && 
                   name !== DYNAMIC_CACHE && 
                   name !== IMAGE_CACHE;
          })
          .map(name => {
            console.log('[SW] Eliminando cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => {
      console.log('[SW] Activado y limpio');
      return self.clients.claim();
    })
  );
});

// Estrategia de fetch
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // No interceptar Firebase o APIs externas de datos
  if (url.hostname.includes('googleapis.com') || 
      url.hostname.includes('firebaseio.com') ||
      request.method !== 'GET') {
    return;
  }

  // Estrategia: Cache First para assets estáticos
  if (STATIC_ASSETS.includes(url.pathname) || 
      CDN_ASSETS.includes(request.url)) {
    event.respondWith(
      caches.match(request).then(response => {
        return response || fetch(request).then(fetchResponse => {
          return caches.open(STATIC_CACHE).then(cache => {
            cache.put(request, fetchResponse.clone());
            return fetchResponse;
          });
        });
      })
    );
    return;
  }

  // Estrategia: Network First para datos de la app
  if (url.pathname.includes('/api/') || request.headers.get('accept')?.includes('json')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(DYNAMIC_CACHE).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Estrategia: Stale While Revalidate para imágenes
  if (request.destination === 'image') {
    event.respondWith(
      caches.open(IMAGE_CACHE).then(cache => {
        return cache.match(request).then(cached => {
          const fetchPromise = fetch(request).then(networkResponse => {
            cache.put(request, networkResponse.clone());
            return networkResponse;
          }).catch(() => cached);

          return cached || fetchPromise;
        });
      })
    );
    return;
  }

  // Default: Network con fallback a cache
  event.respondWith(
    fetch(request)
      .catch(() => caches.match(request))
      .then(response => {
        if (!response) {
          // Fallback para navegación
          if (request.mode === 'navigate') {
            return caches.match('/CALCULADORA-DE-MEDICIONES/index.html');
          }
          return new Response('Sin conexión', { 
            status: 503, 
            headers: { 'Content-Type': 'text/plain' } 
          });
        }
        return response;
      })
  );
});

// Background Sync
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-data') {
    console.log('[SW] Background sync iniciado');
    event.waitUntil(syncDataWithServer());
  }
});

// Push Notifications (preparado para futuro)
self.addEventListener('push', (event) => {
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: 'icon-192.png',
      badge: 'icon-72.png',
      data: data.url,
      actions: data.actions || []
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data)
  );
});

// Mensajes desde la app
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data === 'GET_VERSION') {
    event.ports[0].postMessage(CACHE_NAME);
  }
});

async function syncDataWithServer() {
  const clients = await self.clients.matchAll();
  clients.forEach(client => {
    client.postMessage({ 
      type: 'SYNC_REQUIRED',
      timestamp: Date.now()
    });
  });
}