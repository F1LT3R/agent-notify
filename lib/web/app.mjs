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

function connectSSE() {
  eventSource = new EventSource('/events');

  eventSource.onopen = () => {
    connected = true;
    document.dispatchEvent(new CustomEvent('an:connection', {
      detail: { connected: true }
    }));
  };

  eventSource.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
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

// --- Boot ---

initTheme();
loadHistory();
connectSSE();
startStatusPolling();
