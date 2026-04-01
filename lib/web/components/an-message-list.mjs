class AnMessageList extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._messages = new Map();
    this._autoScroll = true;
    this._lastDateKey = null;
  }

  connectedCallback() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          padding: 10px 8px;
          padding-bottom: 80px;
          overflow-y: auto;
          flex: 1;
        }
        .list {
          display: flex;
          flex-direction: column;
          gap: 6px;
          width: 100%;
        }
        .empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px 20px;
          color: var(--an-text-muted, #2a3648);
          font-family: 'DM Sans', sans-serif;
        }
        .empty-icon {
          font-size: 40px;
          margin-bottom: 12px;
          opacity: 0.4;
        }
        .empty-text {
          font-size: 14px;
          font-weight: 500;
        }
        .date-sep {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 8px 0;
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
          font-weight: 500;
          color: var(--an-text-muted, #3a4a60);
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }
        .date-sep::before,
        .date-sep::after {
          content: '';
          flex: 1;
          height: 1px;
          background: var(--an-border, #141e30);
        }
      </style>
      <div class="list">
        <div class="empty">
          <span class="empty-icon">\uD83D\uDCE1</span>
          <span class="empty-text">
            Waiting for notifications\u2026
          </span>
        </div>
      </div>
    `;

    this._list = this.shadowRoot.querySelector('.list');

    this.addEventListener('scroll', () => {
      const threshold = 150;
      this._autoScroll =
        this.scrollHeight - this.scrollTop
          - this.clientHeight < threshold;
    });

    document.addEventListener('an:history', (e) => {
      const msgs = e.detail;
      for (const msg of msgs) {
        if (msg.type === 'played') continue;
        this.addMessage(msg, true);
      }
      // Gentle ease to bottom after history loads
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.scrollTo({
            top: this.scrollHeight,
            behavior: 'smooth'
          });
        });
      });
    });

    document.addEventListener('an:message', (e) => {
      const msg = e.detail;
      if (msg.type === 'played') return;
      this.addMessage(msg, false);
      if (this._autoScroll) {
        requestAnimationFrame(() => {
          this.scrollTo({
            top: this.scrollHeight,
            behavior: 'smooth'
          });
        });
      }
    });
  }

  addMessage(msg, suppressAnim) {
    if (this._messages.has(msg.id)) return;
    this._messages.set(msg.id, msg);

    const empty = this._list.querySelector('.empty');
    if (empty) empty.remove();

    // Insert date separator if day changed
    if (msg.timestamp) {
      const d = new Date(msg.timestamp);
      const dateKey = d.toDateString();
      if (dateKey !== this._lastDateKey) {
        this._lastDateKey = dateKey;
        const now = new Date();
        const isToday =
          dateKey === now.toDateString();
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const isYesterday =
          dateKey === yesterday.toDateString();
        let label;
        if (isToday) {
          label = 'Today';
        } else if (isYesterday) {
          label = 'Yesterday';
        } else {
          label = d.toLocaleDateString([], {
            weekday: 'long',
            month: 'short',
            day: 'numeric'
          });
        }
        const sep = document.createElement('div');
        sep.className = 'date-sep';
        sep.textContent = label;
        this._list.appendChild(sep);
      }
    }

    const el = document.createElement('an-message');
    if (suppressAnim) el.setAttribute('no-anim', '');
    el.data = msg;
    this._list.appendChild(el);
  }

  scrollToBottom() {
    this.scrollTop = this.scrollHeight;
  }
}

customElements.define('an-message-list', AnMessageList);
