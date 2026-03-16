/**
 * HA Tools Panel - unified panel for all custom HA tools
 * Supports i18n (en/pl) based on hass.language
 */
class HAToolsPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._hass = null;
    this._rendered = false;
    this._cardInstance = null;
    this._activeToolId = null;
  }

  static get _translations() {
    return {
      en: {
        tools: 'Tools',
        unavailable: 'Unavailable',
        refresh: 'Refresh',
        selectTool: 'Select a tool from the panel on the left',
        available: 'available',
        notLoaded: 'not loaded',
        loading: 'Loading...',
        error: 'Error: ',
      },
      pl: {
        tools: 'Narz\u0119dzia',
        unavailable: 'Niedost\u0119pne',
        refresh: 'Od\u015bwie\u017c',
        selectTool: 'Wybierz narz\u0119dzie z panelu po lewej',
        available: 'dost\u0119pnych',
        notLoaded: 'nie za\u0142adowanych',
        loading: '\u0141adowanie...',
        error: 'B\u0142\u0105d: ',
      }
    };
  }

  _t(key) {
    const lang = this._hass?.language || 'en';
    const translations = HAToolsPanel._translations;
    return (translations[lang] || translations['en'])[key] || (translations['en'])[key] || key;
  }

  set hass(hass) {
    this._hass = hass;
    if (this._cardInstance) {
      try {
        if (this._activeToolId === 'cry-analyzer') {
          this._cardInstance.hassObj = hass;
        } else {
          this._cardInstance.hass = hass;
        }
      } catch(e) {}
    }
    if (!this._rendered) {
      this._rendered = true;
      this._render();
    }
  }

  set panel(panel) { this._config = panel?.config || {}; }
  set narrow(narrow) { this._narrow = narrow; }
  set route(route) { this._route = route; }

  _render() {
    const tools = [
      { id: 'trace-viewer', name: 'Trace Viewer', icon: 'mdi:magnify', tag: 'ha-trace-viewer' },
      { id: 'device-health', name: 'Device Health', icon: 'mdi:heart-pulse', tag: 'ha-device-health' },
      { id: 'automation-analyzer', name: 'Automation Analyzer', icon: 'mdi:chart-bar', tag: 'ha-automation-analyzer' },
      { id: 'backup-manager', name: 'Backup Manager', icon: 'mdi:content-save', tag: 'ha-backup-manager' },
      { id: 'network-map', name: 'Network Map', icon: 'mdi:lan', tag: 'ha-network-map' },
      { id: 'smart-reports', name: 'Smart Reports', icon: 'mdi:file-chart', tag: 'ha-smart-reports' },
      { id: 'energy-optimizer', name: 'Energy Optimizer', icon: 'mdi:flash', tag: 'ha-energy-optimizer' },
      { id: 'sentence-manager', name: 'Sentence Manager', icon: 'mdi:comment-text', tag: 'ha-sentence-manager' },
      { id: 'chore-tracker', name: 'Chore Tracker', icon: 'mdi:broom', tag: 'ha-chore-tracker' },
      { id: 'baby-tracker', name: 'Baby Tracker', icon: 'mdi:baby-bottle', tag: 'ha-baby-tracker' },
      { id: 'cry-analyzer', name: 'Cry Analyzer', icon: 'mdi:baby-face', tag: 'ha-cry-analyzer' },
      { id: 'data-exporter', name: 'Data Exporter', icon: 'mdi:database-export', tag: 'ha-data-exporter' },
    ];
    this._tools = tools;

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; height: 100vh; overflow: hidden; }
        * { box-sizing: border-box; }
        .panel { display: flex; height: 100vh; background: var(--primary-background-color, #1c1c1c); color: var(--primary-text-color, #e1e1e1); font-family: var(--paper-font-body1_-_font-family, Roboto, sans-serif); }
        .sidebar { width: 250px; background: var(--card-background-color, #1e1e1e); border-right: 1px solid var(--divider-color, #333); display: flex; flex-direction: column; flex-shrink: 0; overflow-y: auto; }
        .sidebar-header { padding: 16px; font-size: 18px; font-weight: 600; border-bottom: 1px solid var(--divider-color, #333); display: flex; align-items: center; gap: 8px; }
        .sidebar-header ha-icon { --mdc-icon-size: 24px; color: var(--primary-color); }
        .nav-section { font-size: 11px; color: var(--secondary-text-color); text-transform: uppercase; letter-spacing: 0.5px; padding: 16px 16px 6px; }
        .nav-item { display: flex; align-items: center; gap: 12px; padding: 10px 16px; cursor: pointer; font-size: 14px; color: var(--secondary-text-color, #9e9e9e); border-radius: 8px; margin: 1px 8px; transition: all 0.15s; }
        .nav-item:hover { background: var(--table-row-alternative-background-color, #2a2a2a); color: var(--primary-text-color); }
        .nav-item.active { background: color-mix(in srgb, var(--primary-color, #03a9f4) 15%, transparent); color: var(--primary-color); font-weight: 500; }
        .nav-item ha-icon { --mdc-icon-size: 20px; }
        .nav-item.pending { opacity: 0.5; }
        .nav-item.pending:hover { background: var(--table-row-alternative-background-color, #2a2a2a); color: var(--primary-text-color); opacity: 0.7; }
        .main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
        .toolbar { padding: 12px 20px; background: var(--card-background-color, #1e1e1e); border-bottom: 1px solid var(--divider-color, #333); display: flex; align-items: center; gap: 12px; min-height: 56px; }
        .toolbar-title { font-size: 18px; font-weight: 500; flex: 1; }
        .content { flex: 1; overflow: auto; }
        .empty { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--secondary-text-color); gap: 12px; }
        .empty ha-icon { --mdc-icon-size: 64px; opacity: 0.4; }
        .empty .msg { font-size: 16px; }
        .empty .hint { font-size: 13px; opacity: 0.7; }
        .tool-btn { background: none; border: 1px solid var(--divider-color, #333); color: var(--primary-text-color); padding: 6px 14px; border-radius: 8px; cursor: pointer; font-size: 13px; display: flex; align-items: center; gap: 6px; }
        .tool-btn:hover { border-color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 8%, transparent); }
        @media (max-width: 768px) { .sidebar { width: 56px; } .sidebar .label, .sidebar-header span, .nav-section { display: none; } .nav-item { justify-content: center; padding: 10px; margin: 1px 4px; } }
      </style>
      <div class="panel">
        <div class="sidebar">
          <div class="sidebar-header"><ha-icon icon="mdi:toolbox"></ha-icon><span>HA Tools</span></div>
          <div class="nav-section" id="navSectionLabel">${this._t('tools')}</div>
          ${tools.map(t => `
            <div class="nav-item${customElements.get(t.tag) ? '' : ' pending'}" data-tool="${t.id}" data-tag="${t.tag}">
              <ha-icon icon="${t.icon}"></ha-icon>
              <span class="label">${t.name}</span>
            </div>
          `).join('')}
        </div>
        <div class="main">
          <div class="toolbar">
            <div class="toolbar-title" id="title">HA Tools</div>
            <button class="tool-btn" id="refreshBtn" style="display:none"><ha-icon icon="mdi:refresh" style="--mdc-icon-size:16px"></ha-icon> ${this._t('refresh')}</button>
          </div>
          <div class="content" id="content">
            <div class="empty">
              <ha-icon icon="mdi:toolbox-outline"></ha-icon>
              <div class="msg">${this._t('selectTool')}</div>
              <div class="hint" id="statusHint"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    // All nav items are clickable — if element not yet loaded, _loadTool will wait for it
    this.shadowRoot.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => {
        this._loadTool(item.dataset.tool, item.dataset.tag, item);
      });
    });

    this.shadowRoot.getElementById('refreshBtn').addEventListener('click', () => {
      if (this._activeToolId) {
        const el = this.shadowRoot.querySelector(`.nav-item[data-tool="${this._activeToolId}"]`);
        if (el) this._loadTool(this._activeToolId, el.dataset.tag, el);
      }
    });

    // Update status counts and watch for late-loading custom elements
    this._updateNavStatus();
    this._watchForElements();
  }

  _updateNavStatus() {
    const items = this.shadowRoot?.querySelectorAll('.nav-item');
    if (!items) return;
    let available = 0;
    items.forEach(item => {
      const tag = item.dataset.tag;
      if (customElements.get(tag)) {
        item.classList.remove('pending');
        available++;
      }
    });
    const total = items.length;
    const notLoaded = total - available;
    const label = this.shadowRoot.getElementById('navSectionLabel');
    if (label) label.textContent = `${this._t('tools')} (${available})`;
    const hint = this.shadowRoot.getElementById('statusHint');
    if (hint) hint.textContent = `${available} ${this._t('available')}, ${notLoaded} ${this._t('notLoaded')}`;
  }

  _watchForElements() {
    // Use customElements.whenDefined() for each tool tag — re-update nav as they load
    const tags = this._tools.map(t => t.tag);
    let pending = tags.filter(t => !customElements.get(t));
    if (pending.length === 0) return; // All already loaded

    console.log(`[HA Tools Panel] Waiting for ${pending.length} elements to load...`);
    pending.forEach(tag => {
      customElements.whenDefined(tag).then(() => {
        this._updateNavStatus();
      });
    });

    // Fallback: also poll every 2s for 30s in case whenDefined doesn't fire
    let attempts = 0;
    const poll = setInterval(() => {
      attempts++;
      this._updateNavStatus();
      const stillPending = tags.filter(t => !customElements.get(t));
      if (stillPending.length === 0 || attempts >= 15) {
        clearInterval(poll);
        if (stillPending.length === 0) console.log('[HA Tools Panel] All elements loaded');
      }
    }, 2000);
  }

  _loadTool(toolId, tag, navItem) {
    this._activeToolId = toolId;
    this.shadowRoot.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    navItem.classList.add('active');

    const title = this.shadowRoot.getElementById('title');
    title.textContent = navItem.querySelector('.label')?.textContent || toolId;
    this.shadowRoot.getElementById('refreshBtn').style.display = '';

    const content = this.shadowRoot.getElementById('content');
    content.innerHTML = '<div class="empty"><ha-icon icon="mdi:loading" class="spin"></ha-icon><div class="msg">' + this._t('loading') + '</div></div>';

    const createCard = () => {
      setTimeout(() => {
        try {
          content.innerHTML = '';
          const card = document.createElement(tag);
          if (typeof card.setConfig === 'function') {
            card.setConfig({ title: title.textContent, panel_mode: true });
          }
          if (tag === 'ha-cry-analyzer') {
            card.hassObj = this._hass;
          } else {
            card.hass = this._hass;
          }
          card.style.cssText = 'display:block; min-height:calc(100vh - 56px);';
          content.appendChild(card);
          this._cardInstance = card;
        } catch (e) {
          content.innerHTML = '<div class="empty"><ha-icon icon="mdi:alert"></ha-icon><div class="msg">' + this._t('error') + e.message + '</div></div>';
          console.error('[HA Tools Panel] Error loading', tag, e);
        }
      }, 100);
    };

    // If element not yet defined, wait for it (up to 30s)
    if (!customElements.get(tag)) {
      console.log(`[HA Tools Panel] Waiting for ${tag} to be defined...`);
      const timeout = setTimeout(() => {
        content.innerHTML = '<div class="empty"><ha-icon icon="mdi:alert"></ha-icon><div class="msg">' + this._t('error') + tag + ' not loaded</div></div>';
      }, 30000);
      customElements.whenDefined(tag).then(() => {
        clearTimeout(timeout);
        if (this._activeToolId === toolId) createCard();
      });
    } else {
      createCard();
    }
  }
}

if (!customElements.get('ha-tools-panel')) {
  customElements.define('ha-tools-panel', HAToolsPanel);
  console.log('[HA Tools Panel] Registered successfully v5');
}
