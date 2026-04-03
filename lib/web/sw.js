// Service worker — push notifications only (no caching)

self.addEventListener('push', function(event) {
  var title = 'Agent-Notify';
  var options = { body: '', icon: '/logo.png' };

  if (event.data) {
    try {
      var payload = event.data.json();
      title = payload.title || title;
      options.body = payload.body || '';
      options.icon = payload.icon || '/logo.png';
      options.badge = payload.badge || '/logo.png';
      options.tag = payload.tag;
      options.data = payload.data || {};
    } catch (e) {
      options.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  var url = '/';
  if (event.notification.data && event.notification.data.url) {
    url = event.notification.data.url;
  }

  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then(function(windowClients) {
      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i];
        if (
          client.url.indexOf(self.location.origin) !== -1 &&
          'focus' in client
        ) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
