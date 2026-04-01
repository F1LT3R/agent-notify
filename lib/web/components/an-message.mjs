import { EMOJI_MAP } from '../app.mjs';

const TYPE_COLORS = {
  question: '#e3a832', permission: '#c49bff',
  done: '#38cb4e', error: '#f85149',
  status: '#36d6c2', waiting: '#58a6ff',
  review: '#f778ba', message: '#64b4ff',
  info: '#36d6c2', warn: '#e3a832',
  success: '#38cb4e', debug: '#4a5568',
  trace: '#3a4558', operator: '#e879a8',
  system: '#3a4a60'
};

class AnMessage extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._data = null;
  }

  set data(msg) {
    this._data = msg;
    this.render();
  }

  render() {
    const m = this._data;
    if (!m) return;
    if (m.type === 'played') return;

    const emoji = EMOJI_MAP[m.type]
      || EMOJI_MAP[m.source] || '';
    const type = (m.type || '').toUpperCase();
    const color = TYPE_COLORS[m.type]
      || TYPE_COLORS[m.source] || '#3a4a60';

    // Subtle glow intensity — dimmer for system/debug
    const isSubtle = ['system', 'control', 'debug', 'trace']
      .includes(m.type) || ['system', 'control']
      .includes(m.source);
    const glowAlpha = isSubtle ? '0.04' : '0.08';

    const chips = [];

    if (m.source === 'agent') {
      if (m.project)
        chips.push(this.chip('\uD83D\uDCC2', m.project));
      if (m.agentRole) {
        const num = m.agentNumber !== undefined
          ? ` #${m.agentNumber}` : '';
        chips.push(
          this.chip('\uD83E\uDD16',
            `${m.agentRole}${num}`)
        );
      }
      if (m.to) chips.push(this.chip('\u2192', m.to));
      if (m.model)
        chips.push(this.chip('\uD83E\uDDE0', m.model));
    } else if (m.source === 'app') {
      if (m.app)
        chips.push(this.chip('\uD83D\uDCE6', m.app));
      if (m.project)
        chips.push(this.chip('\uD83D\uDCC2', m.project));
      if (m.detail)
        chips.push(this.chip('\u2699\uFE0F', m.detail));
    } else if (m.source === 'operator') {
      if (m.to) chips.push(this.chip('\u2192', m.to));
      if (m.project)
        chips.push(this.chip('\uD83D\uDCC2', m.project));
    }

    let time = '';
    if (m.timestamp) {
      const d = new Date(m.timestamp);
      const now = new Date();
      const isToday = d.toDateString() === now.toDateString();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const isYesterday =
        d.toDateString() === yesterday.toDateString();
      const t = d.toLocaleTimeString([], {
        hour: '2-digit', minute: '2-digit'
      });
      if (isToday) {
        time = t;
      } else if (isYesterday) {
        time = `Yesterday ${t}`;
      } else {
        const day = d.toLocaleDateString([], {
          weekday: 'short', month: 'short', day: 'numeric'
        });
        time = `${day} ${t}`;
      }
    }

    this.shadowRoot.innerHTML = `
      <style>

        :host {
          display: block;
          animation: msg-in 0.3s ease-out both;
        }
        :host([no-anim]) {
          animation: none;
        }
        @keyframes msg-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .card {
          position: relative;
          padding: 11px 14px;
          background: var(--an-bg-card, #0d1420);
          border: 1px solid var(--an-border, #141e30);
          border-left: 3px solid ${color};
          border-radius: 2px 8px 8px 2px;
          box-shadow:
            inset 0 0 24px rgba(0,0,0,0.15),
            0 0 12px ${color}${glowAlpha === '0.08' ? '14' : '0a'};
          transition: border-color 0.2s ease;
        }
        .card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 1px;
          background: linear-gradient(
            90deg,
            ${color}33,
            transparent 60%
          );
        }

        .header {
          display: flex;
          align-items: center;
          gap: 7px;
          flex-wrap: wrap;
          margin-bottom: 5px;
        }
        .emoji {
          font-size: 20px;
          line-height: 1;
        }
        .type-badge {
          font-family: 'JetBrains Mono', monospace;
          font-size: 13px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          color: ${color};
          background: ${color}12;
          padding: 3px 9px;
          border-radius: 4px;
          line-height: 1.4;
        }
        .chip {
          font-family: 'DM Sans', sans-serif;
          font-size: 13px;
          font-weight: 500;
          color: var(--an-text-dim, #7b8da5);
          background: var(--an-chip-bg, #0a1020);
          border: 1px solid var(--an-border, #141e30);
          padding: 2px 10px;
          border-radius: 12px;
          white-space: nowrap;
          line-height: 1.5;
        }
        .time {
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
          font-weight: 500;
          color: var(--an-text-muted, #4a5a72);
          margin-left: auto;
          white-space: nowrap;
        }

        .body {
          font-family: 'DM Sans', sans-serif;
          font-size: 16px;
          font-weight: 400;
          color: var(--an-text, #c0ccdd);
          line-height: 1.5;
          word-break: break-word;
        }

        .url {
          display: inline-block;
          font-family: 'JetBrains Mono', monospace;
          font-size: 13px;
          color: #58a6ff;
          margin-top: 6px;
          text-decoration: none;
          word-break: break-all;
          opacity: 0.7;
          transition: opacity 0.15s;
        }
        .url:hover { opacity: 1; }
      </style>

      <div class="card">
        <div class="header">
          <span class="emoji">${emoji}</span>
          <span class="type-badge">${type}</span>
          ${chips.join('')}
          <span class="time">${time}</span>
        </div>
        <div class="body">${this.esc(m.message || '')}</div>
        ${m.url
          ? `<a class="url" href="${this.esc(m.url)}"
              target="_blank"
              rel="noopener">\uD83D\uDD17 ${this.esc(m.url)}</a>`
          : ''}
      </div>
    `;
  }

  chip(icon, text) {
    return `<span class="chip">${icon} ${this.esc(text)}</span>`;
  }

  esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
}

customElements.define('an-message', AnMessage);
