import { toggleTheme } from '../app.mjs';

class AnStatusBar extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._connected = false;
    this._muted = false;
    this._queueLength = 0;
    this._light = document.documentElement
      .classList.contains('light');
  }

  connectedCallback() {
    this.render();

    document.addEventListener('an:connection', (e) => {
      this._connected = e.detail.connected;
      this.render();
    });

    document.addEventListener('an:status', (e) => {
      this._muted = e.detail.muted;
      this._queueLength = e.detail.queue_length;
      this.render();
    });

    document.addEventListener('an:theme', (e) => {
      this._light = e.detail.light;
      this.render();
    });
  }

  render() {
    const dot = this._connected
      ? '<span class="dot live"></span>'
      : '<span class="dot off"></span>';
    const queue = this._queueLength > 0
      ? `<span class="queue">${this._queueLength}</span>`
      : '';
    const muteLabel = this._muted
      ? '\uD83D\uDD07' : '\uD83D\uDD0A';
    const muteClass = this._muted
      ? 'ctrl muted-on' : 'ctrl';

    this.shadowRoot.innerHTML = `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;700&display=swap');

        :host {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 16px 20px;
          padding-top: max(16px, env(safe-area-inset-top));
          background: var(--an-bg-bar, #0c1222);
          border-bottom: 1px solid var(--an-border, #141d2e);
          font-family: 'DM Sans', sans-serif;
          font-size: 14px;
          color: var(--an-text-dim, #5a6578);
          position: sticky;
          top: 0;
          z-index: 100;
          transition: background 0.3s, border-color 0.3s;
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-right: auto;
        }
        .brand-icon {
          font-size: 26px;
          filter: drop-shadow(
            0 0 6px rgba(100,180,255,0.3)
          );
        }
        .brand-text {
          font-family: 'JetBrains Mono', monospace;
          font-weight: 700;
          font-size: 18px;
          color: var(--an-brand, #d0d8e8);
          letter-spacing: -0.3px;
        }

        .controls {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .ctrl {
          font-size: 15px;
          font-weight: 600;
          padding: 8px 16px;
          border: 1px solid var(--an-btn-border, #3a5070);
          border-radius: 6px;
          background: var(--an-btn-bg, #162240);
          color: var(--an-btn-text, #c8d8f0);
          cursor: pointer;
          touch-action: manipulation;
          transition: all 0.15s ease;
          font-family: 'DM Sans', sans-serif;
          line-height: 1.4;
          min-height: 40px;
        }
        .ctrl:hover {
          border-color: #4a6890;
          color: #e0ecff;
          background: #1a2a50;
        }
        .ctrl:active {
          transform: scale(0.96);
        }
        .clear-btn {
          color: #ff8080;
          border-color: #6b2525;
          background: #2a1010;
        }
        .clear-btn:hover {
          border-color: #ff6060;
          color: #ffaaaa;
          background: #351515;
        }
        .muted-on {
          background: rgba(210, 153, 34, 0.25);
          border-color: rgba(210, 153, 34, 0.6);
          color: #ffd060;
        }

        .queue {
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
          font-weight: 700;
          background: linear-gradient(
            135deg, #3a7bfd, #58a6ff
          );
          color: #000;
          padding: 2px 7px;
          border-radius: 8px;
          line-height: 1.5;
        }

        .dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .dot.live {
          background: #38cb4e;
          animation: pulse-live 2s ease-in-out infinite;
        }
        .dot.off {
          background: #f85149;
        }

        @keyframes pulse-live {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(56,203,78,0.4);
          }
          50% {
            box-shadow: 0 0 0 5px rgba(56,203,78,0);
          }
        }
      </style>

      <div class="brand">
        <span class="brand-icon">\uD83E\uDD16</span>
        <span class="brand-text">Agent-Notify</span>
      </div>

      <button class="ctrl theme-btn" id="theme">
        ${this._light ? '\u2600\uFE0F' : '\uD83C\uDF19'}
      </button>

      <div class="controls">
        <button class="ctrl clear-btn" id="clear">
          Clear
        </button>
        <button class="ctrl" id="skip">Skip</button>
        <button class="${muteClass}" id="mute">
          ${muteLabel}
        </button>
      </div>

      ${queue}
      ${dot}
    `;

    this.shadowRoot.getElementById('clear')
      .addEventListener('click', () => this.action('stop'));
    this.shadowRoot.getElementById('skip')
      .addEventListener('click', () => this.action('skip'));
    this.shadowRoot.getElementById('mute')
      .addEventListener('click', () => this.action('mute'));
    this.shadowRoot.getElementById('theme')
      .addEventListener('click', () => {
        toggleTheme();
      });
  }

  async action(name) {
    try {
      const res = await fetch(`/controls/${name}`, {
        method: 'POST'
      });
      const data = await res.json();
      if (name === 'mute') {
        this._muted = data.muted;
        this.render();
      }
    } catch (e) {
      console.error(`Control ${name} failed:`, e);
    }
  }
}

customElements.define('an-status-bar', AnStatusBar);
