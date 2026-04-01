class AnControls extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._muted = false;
  }

  connectedCallback() {
    document.addEventListener('an:status', (e) => {
      this._muted = e.detail.muted;
      this.updateMuteBtn();
    });

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: flex;
          gap: 10px;
          padding: 12px 16px;
          background: var(--bg-card, #161b22);
          border-top: 1px solid var(--border, #30363d);
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          z-index: 100;
          justify-content: center;
          padding-bottom: max(12px, env(safe-area-inset-bottom));
        }
        button {
          font-size: 14px;
          font-weight: 600;
          padding: 10px 20px;
          border: 1px solid var(--border, #30363d);
          border-radius: var(--radius, 8px);
          background: var(--bg, #0d1117);
          color: var(--text, #e6edf3);
          cursor: pointer;
          touch-action: manipulation;
          min-height: 48px;
          min-width: 48px;
          transition: background 0.15s;
        }
        button:active {
          background: var(--bg-hover, #1c2129);
        }
        button.stop {
          border-color: var(--red, #f85149);
          color: var(--red, #f85149);
        }
        button.muted {
          background: var(--yellow, #d29922);
          color: #000;
          border-color: var(--yellow);
        }
      </style>
      <button class="stop" id="stop">\u23F9 Clear</button>
      <button id="skip">\u23ED Skip</button>
      <button id="mute">\uD83D\uDD0A Mute</button>
    `;

    this.shadowRoot.getElementById('stop')
      .addEventListener('click', () => this.action('stop'));
    this.shadowRoot.getElementById('skip')
      .addEventListener('click', () => this.action('skip'));
    this.shadowRoot.getElementById('mute')
      .addEventListener('click', () => this.action('mute'));
  }

  async action(name) {
    try {
      const res = await fetch(`/controls/${name}`, {
        method: 'POST'
      });
      const data = await res.json();
      if (name === 'mute') {
        this._muted = data.muted;
        this.updateMuteBtn();
      }
    } catch (e) {
      console.error(`Control ${name} failed:`, e);
    }
  }

  updateMuteBtn() {
    const btn = this.shadowRoot.getElementById('mute');
    if (!btn) return;
    if (this._muted) {
      btn.textContent = '\uD83D\uDD07 Unmute';
      btn.classList.add('muted');
    } else {
      btn.textContent = '\uD83D\uDD0A Mute';
      btn.classList.remove('muted');
    }
  }
}

customElements.define('an-controls', AnControls);
