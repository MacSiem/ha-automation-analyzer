// Runtime render smoke (jsdom) — instantiates this repo's card(s) with a mock hass
// and fails if a card throws or renders nothing. Catches runtime errors that
// `node --check` cannot (e.g. a render() calling an undefined method).
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const ROOT = process.cwd();

function listCardFiles() {
  const out = [];
  for (const f of fs.readdirSync(ROOT)) {
    if (f.endsWith('.js') && !/editor|\.min\./.test(f)) out.push(path.join(ROOT, f));
  }
  const cc = path.join(ROOT, 'custom_components');
  if (fs.existsSync(cc)) for (const d of fs.readdirSync(cc)) {
    const www = path.join(cc, d, 'www');
    if (fs.existsSync(www)) for (const f of fs.readdirSync(www)) {
      if (f.endsWith('.js') && !/editor|\.min\./.test(f)) out.push(path.join(www, f));
    }
  }
  return out;
}
function tagsIn(code) {
  return [...code.matchAll(/customElements\.define\(\s*['"]([a-z0-9-]+)['"]/g)]
    .map(m => m[1]).filter(t => !/editor$/.test(t));
}
function mockHass() {
  return {
    states: {}, themes: { darkMode: false, themes: {} }, language: 'en',
    locale: { language: 'en', number_format: 'language', time_format: '24' },
    user: { id: 'u', name: 'Demo', is_admin: true, is_owner: true },
    config: { unit_system: { temperature: 'C' }, version: '2025.6.0' },
    callApi: () => Promise.resolve({}), callService: () => Promise.resolve({}),
    callWS: () => Promise.resolve([]), sendWS: () => Promise.resolve([]),
    formatEntityState: (s) => (s && s.state != null) ? String(s.state) : '',
    formatEntityAttributeValue: () => '',
    connection: {
      subscribeEvents: () => Promise.resolve(() => {}),
      subscribeMessage: () => Promise.resolve(() => {}),
      sendMessagePromise: () => Promise.resolve([]), socket: { readyState: 1 }
    }
  };
}
function stub(window) {
  try { Object.defineProperty(window.navigator, 'language', { configurable: true, get: () => 'en-US' }); } catch (e) {}
  window.requestAnimationFrame = (cb) => setTimeout(() => { try { cb(Date.now()); } catch (e) {} }, 0);
  window.cancelAnimationFrame = () => {};
  window.matchMedia = window.matchMedia || (() => ({ matches: false, media: '', onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; } }));
  class RO { observe() {} unobserve() {} disconnect() {} }
  window.ResizeObserver = window.ResizeObserver || RO;
  window.IntersectionObserver = window.IntersectionObserver || RO;
  const store = () => { let m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; }, clear: () => { m = {}; }, key: i => Object.keys(m)[i] ?? null, get length() { return Object.keys(m).length; } }; };
  try { Object.defineProperty(window, 'localStorage', { configurable: true, value: store() }); } catch (e) {}
  try { Object.defineProperty(window, 'sessionStorage', { configurable: true, value: store() }); } catch (e) {}
}
const delay = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const files = listCardFiles();
  const forbiddenPersistence = 'window._haToolsPersistence';
  if (files.some(f => fs.readFileSync(f, 'utf8').includes(forbiddenPersistence))) {
    console.error('smoke: residual global persistence singleton');
    process.exit(1);
  }
  const targets = [];
  for (const f of files) {
    const code = fs.readFileSync(f, 'utf8');
    if (code.includes('window.HAToolsBentoCSS')) { console.error('smoke: residual global Bento CSS singleton'); process.exit(1); }
    const forbiddenGlobalEscape = 'window.' + '_haToolsEsc';
    const residual = ['__haToolsSplitDonateInjector', 'SPLIT_TAGS', 'deepFindAll(', 'data-source="ha-tools-split-injector"', forbiddenGlobalEscape, 'cdn.jsdelivr.net', "createElement('script", 'createElement("script'].find(token => code.includes(token));
    if (residual) { console.error('smoke: residual global injector token: ' + residual + ' (' + path.basename(f) + ')'); process.exit(1); }
    for (const t of tagsIn(code)) targets.push({ file: f, tag: t });
  }
  if (!targets.length) { console.log('smoke: no custom elements found — skipping'); process.exit(0); }
  let pass = 0; const fail = [];
  for (const t of targets) {
    let problem = null;
    try {
      const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', { runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/' });
      const { window } = dom;
      stub(window);
      window.HAToolsBentoCSS = '/* poisoned-ha-tools-bento-css */';
      const NativeMutationObserver = window.MutationObserver;
      let documentWideObservers = 0;
      window.MutationObserver = class extends NativeMutationObserver {
        observe(target, options) { if (target === window.document.body && options && options.subtree) documentWideObservers++; return super.observe(target, options); }
      };
      class ForeignCard extends window.HTMLElement {
        constructor() { super(); this.attachShadow({ mode: 'open' }); this.shadowRoot.innerHTML = '<div data-foreign-marker="true">foreign card</div>'; }
      }
      window.customElements.define('ha-yaml-checker', ForeignCard);
      const foreign = window.document.createElement('ha-yaml-checker');
      window.document.body.appendChild(foreign);
      const foreignHtml = foreign.shadowRoot.innerHTML;
      if (t.tag === 'ha-entity-renamer') {
        window.localStorage.setItem('ha-entity-renamer-entity-renamer-history', JSON.stringify([{
          time: ['now', '\"><img data-hostile-persisted src=x>'], oldId: { nested: true },
          newId: ['sensor.safe', '\"><img data-hostile-persisted src=x>'], status: 'ok',
          impact: { automations: [['safe', '\"><img data-hostile-persisted src=x>']], scripts: {}, dashboards: [], scenes: null }
        }]));
      }
      if (t.tag === 'ha-data-exporter') {
        window.localStorage.setItem('ha-data-exporter-snapshots-default', JSON.stringify([{
          ts: '2026-08-28T00:00:00Z', entities: { 'sensor.persisted': { state: ['safe', '\"><img data-hostile-persisted src=x>'], attrs: 1 } }
        }]));
      }
      if (t.tag === 'ha-energy-email') {
        window.localStorage.setItem('ha-energy-email-schedules', JSON.stringify({ daily: {
          time: ['12:00', '\"><img data-hostile-persisted src=x>'],
          recipients: ['safe@example.com', '\"><img data-hostile-persisted src=x>'], enabled: true
        } }));
      }
      if (t.tag === 'ha-purge-cache') window.localStorage.setItem('\"><img data-hostile-persisted src=x>', 'persisted');
      let asyncErr = null;
      window.addEventListener('error', e => { asyncErr = asyncErr || (e.error && e.error.message) || e.message; });
      window.onerror = (m) => { asyncErr = asyncErr || m; };
      window.eval(fs.readFileSync(t.file, 'utf8'));
      const el = window.document.createElement(t.tag);
      const hostile = ['safe', '\"><img data-hostile-config src=x onerror=alert(1)>'];
      const hostileObject = { toString: () => '\"><img data-hostile-object src=x onerror=alert(1)>' };
      if (typeof el.setConfig === 'function') el.setConfig({ type: 'custom:' + t.tag, title: hostile, currency: hostileObject });
      const hass = mockHass();
      if (t.tag === 'ha-data-exporter') hass.states['sensor.persisted'] = { state: 'on', attributes: { friendly_name: 'Persisted sensor' }, last_changed: '2026-08-28T00:00:00Z', last_updated: '2026-08-28T00:00:00Z' };
      el.hass = hass;
      window.document.body.appendChild(el);
      el.hass = hass;
      await delay(350);
      const len = el.shadowRoot ? el.shadowRoot.innerHTML.length : 0;
      if (!el.shadowRoot) problem = 'no shadowRoot';
      else if (len < 50) problem = 'empty render (len=' + len + ')';
      else if (el.shadowRoot.innerHTML.includes('poisoned-ha-tools-bento-css')) problem = 'pre-seeded global Bento CSS overrode component-local CSS';
      else if (asyncErr) problem = 'async error: ' + asyncErr;
      else if (foreign.shadowRoot.innerHTML !== foreignHtml) problem = 'foreign HA Tools card was mutated';
      else if (documentWideObservers !== 0) problem = 'document-wide MutationObserver was registered';
      else if (window.document.querySelector('[data-hostile-config], [data-hostile-object]') || el.shadowRoot.querySelector('[data-hostile-config], [data-hostile-object]')) problem = 'array/object config bypassed HTML escaping';
      if (!problem && t.tag === 'ha-entity-renamer') {
        el._activeTab = 'log';
        el.render();
        if (el.shadowRoot.querySelector('[data-hostile-persisted]')) problem = 'persisted rename history bypassed HTML escaping';
      }
      if (!problem && t.tag === 'ha-data-exporter') {
        if (el.shadowRoot.querySelector('[data-hostile-persisted]')) problem = 'persisted snapshot history bypassed HTML escaping';
      }
      if (!problem && t.tag === 'ha-energy-email') {
        el._activeTab = 'schedule';
        el._renderTab();
        if (el.shadowRoot.querySelector('[data-hostile-persisted]')) problem = 'persisted schedule bypassed HTML escaping';
      }
      if (!problem && t.tag === 'ha-purge-cache' && el.shadowRoot.querySelector('[data-hostile-persisted]')) problem = 'persisted localStorage key bypassed HTML escaping';
      const localIntroTags = new Set(['ha-automation-analyzer', 'ha-config-auditor', 'ha-data-exporter', 'ha-device-health', 'ha-entity-renamer']);
      const localDonateTags = new Set([...localIntroTags, 'ha-purge-cache']);
      if (!problem && localDonateTags.has(t.tag) && el.shadowRoot.querySelectorAll('.donate-section').length !== 1) problem = 'local support footer missing or duplicated';
      if (!problem && localIntroTags.has(t.tag)) {
        const intro = el.shadowRoot.querySelector('.intro-banner[data-intro="' + t.tag + '"]');
        const dismiss = intro && intro.querySelector('.intro-dismiss');
        if (!intro || !dismiss) problem = 'local first-run intro/dismiss missing';
        else {
          dismiss.click(); await delay(20);
          if (window.localStorage.getItem('ha-intro-dismissed-' + t.tag) !== '1') problem = 'intro dismissal was not persisted';
          else if (el.shadowRoot.querySelector('.intro-banner[data-intro="' + t.tag + '"]')) problem = 'dismissed intro remained visible';
          else {
            const second = window.document.createElement(t.tag);
            if (typeof second.setConfig === 'function') second.setConfig({ type: 'custom:' + t.tag });
            second.hass = mockHass(); window.document.body.appendChild(second); second.hass = mockHass(); await delay(100);
            if (second.shadowRoot.querySelector('.intro-banner[data-intro="' + t.tag + '"]')) problem = 'dismissed intro returned on a new render';
            else if (second.shadowRoot.querySelectorAll('.donate-section').length !== 1) problem = 'support footer missing after a new render';
            second.remove();
          }
        }
      }
      if (!problem) {
        const Editor = window.customElements.get(t.tag + '-editor');
        if (Editor) {
          const editor = window.document.createElement(t.tag + '-editor');
          if (typeof editor.setConfig === 'function') editor.setConfig({ title: { toString: () => '\"><img data-hostile-editor src=x>' } });
          window.document.body.appendChild(editor); await delay(20);
          if (editor.shadowRoot && editor.shadowRoot.querySelector('[data-hostile-editor]')) problem = 'editor non-string config bypassed HTML escaping';
          editor.remove();
        }
      }
      el.remove(); await delay(20);
      window.close();
    } catch (e) { problem = (e && e.message) ? e.message : String(e); }
    if (problem) fail.push(`${t.tag}  (${path.basename(t.file)})  -> ${problem}`); else pass++;
  }
  console.log(`smoke: ${targets.length} element(s) | PASS ${pass} | FAIL ${fail.length}`);
  fail.forEach(f => console.log('  FAIL ' + f));
  process.exit(fail.length ? 1 : 0);
})();
