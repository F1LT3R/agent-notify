import webpush from 'web-push';
import fs from 'fs';
import path from 'path';

let vapidKeys = null;
const subscriptions = new Map();
let vapidPath = '';
let subsPath = '';

export function initPush(storeDir) {
  vapidPath = path.join(storeDir, 'vapid.json');
  subsPath = path.join(storeDir, 'push-subscriptions.json');

  // Load or generate VAPID keys
  if (fs.existsSync(vapidPath)) {
    vapidKeys = JSON.parse(
      fs.readFileSync(vapidPath, 'utf8')
    );
  } else {
    vapidKeys = webpush.generateVAPIDKeys();
    fs.writeFileSync(
      vapidPath,
      JSON.stringify(vapidKeys, null, 2)
    );
  }

  webpush.setVapidDetails(
    'mailto:agent-notify@localhost',
    vapidKeys.publicKey,
    vapidKeys.privateKey
  );

  // Load existing subscriptions
  if (fs.existsSync(subsPath)) {
    try {
      const saved = JSON.parse(
        fs.readFileSync(subsPath, 'utf8')
      );
      for (const sub of saved) {
        subscriptions.set(sub.endpoint, sub);
      }
    } catch {}
  }
}

export function getVapidPublicKey() {
  return vapidKeys?.publicKey || '';
}

export function addSubscription(sub) {
  subscriptions.set(sub.endpoint, sub);
  saveSubs();
}

export function removeSubscription(endpoint) {
  subscriptions.delete(endpoint);
  saveSubs();
}

function saveSubs() {
  fs.writeFileSync(
    subsPath,
    JSON.stringify([...subscriptions.values()], null, 2)
  );
}

export function sendPushToAll(payload) {
  const body = JSON.stringify(payload);
  const count = subscriptions.size;
  console.log(`[push] Sending to ${count} subscriber(s)`);
  for (const [endpoint, sub] of subscriptions) {
    webpush.sendNotification(sub, body)
      .then(() => console.log('[push] Sent OK'))
      .catch(err => {
        console.error('[push] Send failed:', err.statusCode, err.body);
        if (err.statusCode === 410 || err.statusCode === 404) {
          subscriptions.delete(endpoint);
          saveSubs();
        }
      });
  }
}
