/* substitui o service worker antigo: não guarda nada e se desliga */
self.addEventListener("install", function(){ self.skipWaiting(); });
self.addEventListener("activate", function(e){ e.waitUntil(self.registration.unregister()); });
