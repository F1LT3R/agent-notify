class AnCompose extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._agents = [];
  }

  connectedCallback() {
    document.addEventListener('an:status', (e) => {
      if (e.detail.agents) {
        this._agents = e.detail.agents;
        this.updatePicker();
      }
    });

    this.shadowRoot.innerHTML = `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500&family=DM+Sans:wght@400;500;600&display=swap');

        :host {
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding: 10px 12px;
          padding-bottom: max(10px, env(safe-area-inset-bottom));
          background: linear-gradient(
            0deg,
            var(--an-bg, #080c14) 0%,
            var(--an-bg-bar, #0b1020) 100%
          );
          border-top: 1px solid var(--an-border, #141e30);
        }

        .target-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .target-label {
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          font-weight: 500;
          color: #4a5a72;
          letter-spacing: 0.5px;
          text-transform: uppercase;
          flex-shrink: 0;
        }

        select {
          font-family: 'DM Sans', sans-serif;
          font-size: 14px;
          font-weight: 500;
          padding: 6px 10px;
          border: 1px solid var(--an-border-bright, #1a2540);
          border-radius: 8px;
          background: var(--an-bg-input, #0a1020);
          color: var(--an-text, #a0b8dd);
          flex: 1;
          cursor: pointer;
          transition: border-color 0.15s;
          -webkit-appearance: none;
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%235a6a88' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 10px center;
          padding-right: 28px;
        }
        select:focus {
          outline: none;
          border-color: #253660;
        }

        .input-row {
          display: flex;
          gap: 8px;
          align-items: flex-end;
        }

        textarea {
          flex: 1;
          font-family: 'DM Sans', sans-serif;
          font-size: 16px;
          font-weight: 400;
          padding: 10px 12px;
          border: 1px solid var(--an-border, #141e30);
          border-radius: 8px;
          background: var(--an-bg-input, #0a1020);
          color: var(--an-text, #c0ccdd);
          resize: none;
          line-height: 1.45;
          min-height: 42px;
          max-height: 100px;
          transition: border-color 0.2s ease,
            box-shadow 0.2s ease;
        }
        textarea::placeholder {
          color: var(--an-text-muted, #3a4d66);
        }
        textarea:focus {
          outline: none;
          border-color: #1a3a6a;
          box-shadow: 0 0 0 2px rgba(88,166,255,0.08);
        }

        .send-btn {
          font-family: 'JetBrains Mono', monospace;
          font-size: 14px;
          font-weight: 500;
          padding: 10px 18px;
          border: none;
          border-radius: 8px;
          background: linear-gradient(
            135deg, #2a5cb0, #3a7bfd
          );
          color: #e0ecff;
          cursor: pointer;
          touch-action: manipulation;
          white-space: nowrap;
          min-height: 42px;
          transition: transform 0.12s ease,
            box-shadow 0.2s ease;
          letter-spacing: 0.3px;
        }
        .send-btn:hover {
          box-shadow: 0 0 16px rgba(58,123,253,0.25);
        }
        .send-btn:active {
          transform: scale(0.96);
        }
        .send-btn:disabled {
          opacity: 0.3;
          cursor: default;
          transform: none;
          box-shadow: none;
        }
        .send-btn.flash {
          animation: send-flash 0.4s ease-out;
        }

        @keyframes send-flash {
          0% {
            box-shadow: 0 0 0 0 rgba(58,123,253,0.5);
          }
          100% {
            box-shadow: 0 0 0 10px rgba(58,123,253,0);
          }
        }
      </style>

      <div class="target-row">
        <span class="target-label">To:</span>
        <select id="target">
          <option value="">All Agents</option>
        </select>
      </div>
      <div class="input-row">
        <textarea id="msg" rows="1"
          placeholder="Message agents\u2026"></textarea>
        <button class="send-btn" id="send">Send</button>
      </div>
    `;

    const msg = this.shadowRoot.getElementById('msg');
    const send = this.shadowRoot.getElementById('send');

    send.addEventListener('click', () => this.send());
    msg.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.send();
      }
    });

    msg.addEventListener('input', () => {
      msg.style.height = 'auto';
      msg.style.height = msg.scrollHeight + 'px';
    });
  }

  updatePicker() {
    const select =
      this.shadowRoot.getElementById('target');
    if (!select) return;

    const current = select.value;
    const opts = [
      '<option value="">All Agents</option>'
    ];

    for (const a of this._agents) {
      const role = a.agentRole || 'Agent';
      const num = a.agentNumber !== undefined
        ? ` #${a.agentNumber}` : '';
      const proj = a.project
        ? ` \u2014 ${a.project}` : '';
      const val = JSON.stringify({
        to: a.agentRole, project: a.project
      });
      opts.push(
        `<option value='${this.esc(val)}'>`
        + `${this.esc(role)}${num}${proj}</option>`
      );
    }

    select.innerHTML = opts.join('');
    if (current) {
      for (const opt of select.options) {
        if (opt.value === current) {
          select.value = current;
          break;
        }
      }
    }
  }

  async send() {
    const msg = this.shadowRoot.getElementById('msg');
    const select =
      this.shadowRoot.getElementById('target');
    const btn = this.shadowRoot.getElementById('send');

    const text = msg.value.trim();
    if (!text) return;

    const body = { message: text };

    if (select.value) {
      try {
        const target = JSON.parse(select.value);
        if (target.to) body.to = target.to;
        if (target.project) body.project = target.project;
      } catch {}
    }

    btn.disabled = true;
    btn.classList.add('flash');
    try {
      const res = await fetch('/notify/operator', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        msg.value = '';
        msg.style.height = 'auto';
      }
    } catch (e) {
      console.error('Send failed:', e);
    }
    btn.disabled = false;
    btn.classList.remove('flash');
    msg.focus();
  }

  esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
}

customElements.define('an-compose', AnCompose);
