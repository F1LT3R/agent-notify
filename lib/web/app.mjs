// app.mjs — SSE connection, status polling, event dispatch

import './components/an-status-bar.mjs';
import './components/an-message-list.mjs';
import './components/an-message.mjs';
import './components/an-compose.mjs';

const EMOJI_MAP = {
  // Agent types
  question: '\u2753', permission: '\uD83D\uDD10',
  done: '\u2705', error: '\u274C',
  status: '\uD83D\uDCE1', waiting: '\u23F3',
  review: '\uD83D\uDC41\uFE0F', message: '\uD83D\uDCAC',
  // App types
  trace: '\uD83D\uDD2C', debug: '\uD83D\uDC1B',
  info: '\u2139\uFE0F', warn: '\u26A0\uFE0F',
  success: '\u2705',
  // Operator
  operator: '\uD83E\uDDD1\u200D\uD83D\uDCBB',
  // System
  system: '\uD83D\uDD0C'
};

export { EMOJI_MAP };

// --- Initial history load ---

async function loadHistory() {
  try {
    const res = await fetch('/messages?since_id=0&limit=2000');
    const data = await res.json();
    // Filter to last 3 days — show all of them
    const cutoff = Date.now() - 3 * 24 * 60 * 60 * 1000;
    const recent = data.messages.filter(
      m => new Date(m.timestamp).getTime() >= cutoff
    );
    // Track latest ID for reconnect catchup
    if (recent.length > 0) {
      latestId = recent[recent.length - 1].id;
    }
    document.dispatchEvent(new CustomEvent('an:history', {
      detail: recent
    }));
  } catch (e) {
    console.error('Failed to load history:', e);
  }
}

// --- SSE connection ---

let eventSource = null;
let connected = false;
let latestId = 0;

function connectSSE() {
  eventSource = new EventSource('/events');

  eventSource.onopen = async () => {
    const wasDisconnected = !connected;
    connected = true;
    document.dispatchEvent(new CustomEvent('an:connection', {
      detail: { connected: true }
    }));

    // Catch up on missed messages after reconnect
    if (wasDisconnected && latestId > 0) {
      try {
        const res = await fetch(
          `/messages?since_id=${latestId}&limit=2000`
        );
        const data = await res.json();
        for (const msg of data.messages) {
          document.dispatchEvent(
            new CustomEvent('an:message', {
              detail: msg
            })
          );
          if (msg.id > latestId) latestId = msg.id;
        }
      } catch (e) {
        console.error('Catchup fetch failed:', e);
      }
    }
  };

  eventSource.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.id > latestId) latestId = msg.id;
      document.dispatchEvent(new CustomEvent('an:message', {
        detail: msg
      }));
    } catch (e) {
      console.error('SSE parse error:', e);
    }
  };

  eventSource.onerror = () => {
    connected = false;
    document.dispatchEvent(new CustomEvent('an:connection', {
      detail: { connected: false }
    }));
  };
}

// --- Status polling ---

let statusInterval = null;

async function pollStatus() {
  try {
    const res = await fetch('/messages/status');
    const data = await res.json();
    document.dispatchEvent(new CustomEvent('an:status', {
      detail: data
    }));
  } catch {
    // Connection issue handled by SSE
  }
}

function startStatusPolling() {
  pollStatus();
  statusInterval = setInterval(pollStatus, 3000);
}

// --- Theme toggle ---

function initTheme() {
  const saved = localStorage.getItem('an-theme');
  if (saved === 'light') {
    document.documentElement.classList.add('light');
  }
}

function toggleTheme() {
  const root = document.documentElement;
  const isLight = root.classList.toggle('light');
  localStorage.setItem('an-theme', isLight ? 'light' : 'dark');
  document.dispatchEvent(new CustomEvent('an:theme', {
    detail: { light: isLight }
  }));
}

export { toggleTheme };

// --- Web Push Notifications ---

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat(
    (4 - base64String.length % 4) % 4
  );
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    arr[i] = raw.charCodeAt(i);
  }
  return arr;
}

async function subscribePush(reg) {
  try {
    const existing =
      await reg.pushManager.getSubscription();
    if (existing) {
      console.log('[push] Already subscribed');
      return;
    }

    const permission = Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission();
    console.log('[push] Permission:', permission);
    if (permission !== 'granted') return;

    const res = await fetch('/push/vapid-key');
    const { publicKey } = await res.json();
    console.log('[push] Got VAPID key, subscribing...');
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey:
        urlBase64ToUint8Array(publicKey)
    });
    await fetch('/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub.toJSON())
    });
    console.log('[push] Subscribed OK');
  } catch (e) {
    console.error('[push] Subscribe failed:', e);
  }
}

async function initPush() {
  if (
    !('serviceWorker' in navigator) ||
    !('PushManager' in window)
  ) {
    console.log('[push] Not supported');
    return;
  }

  try {
    const reg = await navigator.serviceWorker.register(
      '/sw.js'
    );
    console.log('[push] SW registered');

    // If permission already granted, subscribe now
    if (Notification.permission === 'granted') {
      await subscribePush(reg);
      return;
    }

    // Otherwise wait for first user click
    document.addEventListener('click', function once() {
      document.removeEventListener('click', once);
      subscribePush(reg);
    });
    console.log('[push] Waiting for user click');
  } catch (e) {
    console.error('[push] Init failed:', e);
  }
}

// --- Resume on tab focus ---

document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible') return;
  if (latestId === 0) return;

  try {
    const res = await fetch(
      `/messages?since_id=${latestId}&limit=2000`
    );
    const data = await res.json();
    for (const msg of data.messages) {
      document.dispatchEvent(
        new CustomEvent('an:message', { detail: msg })
      );
      if (msg.id > latestId) latestId = msg.id;
    }
  } catch {}

  pollStatus();
});

// --- Boot ---

initTheme();
loadHistory();
connectSSE();
startStatusPolling();
initPush();
