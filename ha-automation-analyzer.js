/* HA Tools split — ha-automation-analyzer v4.1.3 (2026-05-12) — single-tool standalone repo */
(function() {
'use strict';

// XSS protection helper (reuse global from panel, fallback for standalone)
const _esc = window._haToolsEsc || ((s) => typeof s === 'string' ? s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]) : (s ?? ''));

// -- HA Tools Persistence (stub -- full impl in ha-tools-panel.js) --
window._haToolsPersistence = window._haToolsPersistence || { _cache: {}, _hass: null, setHass(h) { this._hass = h; }, async save(k, d) { try { localStorage.setItem('ha-automation-analyzer-' + k, JSON.stringify(d)); } catch(e) { console.debug('[ha-automation-analyzer] caught:', e); } }, async load(k) { try { const r = localStorage.getItem('ha-automation-analyzer-' + k); return r ? JSON.parse(r) : null; } catch(e) { return null; } }, loadSync(k) { try { const r = localStorage.getItem('ha-automation-analyzer-' + k); return r ? JSON.parse(r) : null; } catch(e) { return null; } } };

/* ===== HA Tools split — inline shared infrastructure ===== */
// Bento Design System CSS (inline copy — keeps tool standalone)
if (typeof window !== 'undefined' && !window.HAToolsBentoCSS) {
  window.HAToolsBentoCSS = `
/* ═══════════════════════════════════════════════
   HA Tools — Bento Design System v2.0 (Premium)
   ═══════════════════════════════════════════════ */


:host {
  /* Brand palette — diamond top, gradient-friendly */
  --bento-primary: #6366f1;
  --bento-primary-2: #8b5cf6;
  --bento-primary-3: #ec4899;
  --bento-primary-hover: #4f46e5;
  --bento-primary-light: rgba(99, 102, 241, 0.08);
  --bento-primary-glow: rgba(99, 102, 241, 0.35);
  --bento-success: #10B981;
  --bento-success-light: rgba(16, 185, 129, 0.10);
  --bento-success-border: rgba(16, 185, 129, 0.25);
  --bento-error: #EF4444;
  --bento-error-light: rgba(239, 68, 68, 0.10);
  --bento-error-border: rgba(239, 68, 68, 0.25);
  --bento-warning: #F59E0B;
  --bento-warning-light: rgba(245, 158, 11, 0.10);
  --bento-warning-border: rgba(245, 158, 11, 0.25);
  --bento-info: #06b6d4;
  --bento-info-light: rgba(6, 182, 212, 0.10);
  --bento-info-border: rgba(6, 182, 212, 0.25);

  /* Theme */
  --bento-bg:     var(--primary-background-color, #fafaf9);
  --bento-bg-2:   var(--card-background-color, #f5f5f4);
  --bento-card:   var(--card-background-color, #ffffff);
  --bento-glass:  rgba(255, 255, 255, 0.7);
  --bento-border: var(--divider-color, #e7e5e4);
  --bento-border-strong: rgba(0, 0, 0, 0.08);
  --bento-text:           var(--primary-text-color,   #0c0a09);
  --bento-text-secondary: var(--secondary-text-color, #57534e);
  --bento-text-muted:     var(--disabled-text-color,  #a8a29e);

  /* Radii */
  --bento-radius-xs: 8px;
  --bento-radius-sm: 12px;
  --bento-radius-md: 18px;
  --bento-radius-lg: 24px;
  --bento-radius-pill: 999px;

  /* Shadows — modern, layered */
  --bento-shadow-sm: 0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.02);
  --bento-shadow-md: 0 4px 12px rgba(0,0,0,0.05), 0 2px 6px rgba(0,0,0,0.03);
  --bento-shadow-lg: 0 24px 48px -12px rgba(0,0,0,0.10), 0 12px 24px -8px rgba(0,0,0,0.05);
  --bento-shadow-glow: 0 0 0 1px rgba(99,102,241,0.15), 0 8px 32px -8px rgba(99,102,241,0.25);

  /* Gradients */
  --bento-grad-primary: linear-gradient(135deg, #6366f1, #8b5cf6);
  --bento-grad-rainbow: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%);
  --bento-grad-success: linear-gradient(135deg, #10b981, #34d399);
  --bento-grad-error:   linear-gradient(135deg, #ef4444, #f87171);
  --bento-grad-warning: linear-gradient(135deg, #f59e0b, #fbbf24);

  /* Motion */
  --bento-trans-fast: 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  --bento-trans:      0.25s cubic-bezier(0.4, 0, 0.2, 1);
  --bento-trans-slow: 0.4s cubic-bezier(0.4, 0, 0.2, 1);

  /* Typography */
  font-family: "Inter", -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", system-ui, sans-serif;
  font-feature-settings: "cv11" 1, "ss01" 1;
  letter-spacing: -0.01em;
  display: block;
  color: var(--bento-text);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* ── Dark mode ───────────────────────────────── */
@media (prefers-color-scheme: dark) {
  :host {
    --bento-bg:     var(--primary-background-color, #0a0a0f);
    --bento-bg-2:   var(--card-background-color,    #111119);
    --bento-card:   var(--card-background-color,    #16161f);
    --bento-glass:  rgba(22, 22, 31, 0.7);
    --bento-border: var(--divider-color,            #27272f);
    --bento-border-strong: rgba(255, 255, 255, 0.08);
    --bento-text:           var(--primary-text-color,   #fafaf9);
    --bento-text-secondary: var(--secondary-text-color, #d6d3d1);
    --bento-text-muted:     var(--disabled-text-color,  #78716c);
    --bento-primary:        #818cf8;
    --bento-primary-2:      #a78bfa;
    --bento-primary-3:      #f472b6;
    --bento-primary-light:  rgba(129, 140, 248, 0.12);
    --bento-primary-glow:   rgba(129, 140, 248, 0.45);
    --bento-success: #34d399;
    --bento-success-light:  rgba(52, 211, 153, 0.12);
    --bento-success-border: rgba(52, 211, 153, 0.30);
    --bento-error:   #f87171;
    --bento-error-light:    rgba(248, 113, 113, 0.12);
    --bento-error-border:   rgba(248, 113, 113, 0.30);
    --bento-warning: #fbbf24;
    --bento-warning-light:  rgba(251, 191, 36, 0.12);
    --bento-warning-border: rgba(251, 191, 36, 0.30);
    --bento-info:    #22d3ee;
    --bento-info-light:     rgba(34, 211, 238, 0.12);
    --bento-info-border:    rgba(34, 211, 238, 0.30);
    --bento-shadow-sm: 0 1px 2px rgba(0,0,0,0.4);
    --bento-shadow-md: 0 4px 12px rgba(0,0,0,0.4), 0 2px 6px rgba(0,0,0,0.2);
    --bento-shadow-lg: 0 24px 48px -12px rgba(0,0,0,0.6), 0 12px 24px -8px rgba(0,0,0,0.3);
    --bento-shadow-glow: 0 0 0 1px rgba(129,140,248,0.2), 0 8px 32px -8px rgba(129,140,248,0.5);
    --bento-grad-primary: linear-gradient(135deg, #818cf8, #a78bfa);
    --bento-grad-rainbow: linear-gradient(135deg, #818cf8, #a78bfa 50%, #f472b6);
    color-scheme: dark !important;
  }
  .card, .card-container, .main-card, .panel-card {
    background: var(--bento-card) !important; color: var(--bento-text) !important; border-color: var(--bento-border) !important;
  }
  input, select, textarea { background: var(--bento-bg-2); color: var(--bento-text); border-color: var(--bento-border); }
  table th { background: var(--bento-bg-2); color: var(--bento-text-secondary); border-color: var(--bento-border); }
  table td { color: var(--bento-text); border-color: var(--bento-border); }
  pre, code { background: #1e1e2e !important; color: #e2e8f0 !important; }
}

/* ── Reset & motion preferences ──────────────── */
* { box-sizing: border-box; }
@media (prefers-reduced-motion: reduce) { * { animation-duration: 0s !important; transition-duration: 0s !important; } }

/* ── Main Card Wrapper ───────────────────────── */
.card {
  background: var(--bento-card);
  border: 1px solid var(--bento-border);
  border-radius: var(--bento-radius-md);
  box-shadow: var(--bento-shadow-md);
  color: var(--bento-text);
  font-family: "Inter", -apple-system, BlinkMacSystemFont, sans-serif;
  position: relative;
  transition: box-shadow var(--bento-trans), border-color var(--bento-trans);
}

/* ── Header ──────────────────────────────────── */
.header {
  padding: 20px 24px 0;
  display: flex; align-items: center; gap: 12px;
}
.header-icon { font-size: 24px; }
.header-title {
  font-size: 18px; font-weight: 700; letter-spacing: -0.02em;
  color: var(--bento-text);
}
.header-badge {
  margin-left: auto;
  background: var(--bento-grad-primary); color: #fff;
  font-size: 11px; padding: 4px 10px; border-radius: var(--bento-radius-pill);
  font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;
  box-shadow: 0 4px 14px -2px var(--bento-primary-glow);
}
.content { padding: 20px 24px 24px; }

/* ── Tabs (modern pill style) ────────────────── */
.tabs, .tab-bar, .tab-nav, .tab-header {
  display: flex !important; gap: 4px !important;
  padding: 4px !important;
  background: var(--bento-bg-2) !important;
  border-radius: var(--bento-radius-pill) !important;
  margin-bottom: 20px !important;
  overflow-x: auto !important; overflow-y: hidden !important;
  -webkit-overflow-scrolling: touch !important;
  flex-wrap: nowrap !important; border-bottom: 0 !important;
  width: fit-content; max-width: 100%;
}
.tab, .tab-btn, .tab-button, .dtab {
  padding: 8px 16px !important;
  border: none !important; background: transparent !important; cursor: pointer !important;
  font-size: 13px !important; font-weight: 600 !important;
  font-family: "Inter", -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, system-ui, sans-serif !important;
  color: var(--bento-text-secondary) !important;
  border-radius: var(--bento-radius-pill) !important;
  margin-bottom: 0 !important;
  transition: all var(--bento-trans) !important;
  white-space: nowrap !important; flex: none !important;
  letter-spacing: -0.005em !important;
}
.tab:hover, .tab-btn:hover, .tab-button:hover, .dtab:hover {
  color: var(--bento-text) !important;
  background: var(--bento-card) !important;
}
.tab.active, .tab-btn.active, .tab-button.active, .dtab.active {
  background: var(--bento-card) !important;
  color: var(--bento-primary) !important;
  box-shadow: var(--bento-shadow-sm) !important;
  font-weight: 700 !important;
}
.tab-content { display: block; }
.tab-content.active { animation: bentoFadeIn 0.35s cubic-bezier(0.4, 0, 0.2, 1); }
@keyframes bentoFadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ── Stat / KPI cards (premium) ──────────────── */
.stat-card, .stat-item, .metric-card, .kpi-card {
  background: var(--bento-bg-2) !important;
  border: 1px solid var(--bento-border) !important;
  border-radius: var(--bento-radius-sm) !important;
  padding: 18px !important;
  text-align: left !important;
  transition: transform var(--bento-trans), box-shadow var(--bento-trans), border-color var(--bento-trans);
  position: relative; overflow: hidden;
}
.stat-card::before, .metric-card::before, .kpi-card::before {
  content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
  background: var(--bento-grad-primary);
  opacity: 0; transition: opacity var(--bento-trans);
}
.stat-card:hover, .stat-item:hover, .metric-card:hover, .kpi-card:hover {
  transform: translateY(-2px); box-shadow: var(--bento-shadow-lg); border-color: var(--bento-primary-light);
}
.stat-card:hover::before, .metric-card:hover::before, .kpi-card:hover::before { opacity: 1; }
.stat-icon { font-size: 22px; margin-bottom: 6px; opacity: 0.85; }
.stat-value, .stat-val, .metric-value, .kpi-val {
  font-size: 26px; font-weight: 800; line-height: 1.1;
  letter-spacing: -0.02em; color: var(--bento-text);
  font-feature-settings: "tnum" 1;
}
.stat-label, .stat-lbl, .metric-label, .kpi-lbl {
  font-size: 11px; color: var(--bento-text-secondary);
  margin-top: 4px; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600;
}
.stat-num {
  font-size: 24px; font-weight: 800; color: var(--bento-primary);
  font-feature-settings: "tnum" 1; letter-spacing: -0.02em;
}
.stat-sub { font-size: 12px; color: var(--bento-text-muted); font-weight: 500; }

/* ── Overview grid ───────────────────────────── */
.overview-grid, .stats-grid, .summary-grid, .stat-cards, .kpi-grid, .metrics-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px; margin-bottom: 20px;
}

/* ── Section headers ─────────────────────────── */
.section-header, .section-title {
  display: flex; align-items: center; justify-content: space-between;
  font-size: 12px; font-weight: 700; color: var(--bento-text-secondary);
  text-transform: uppercase; letter-spacing: 0.08em;
  margin: 16px 0 10px;
}
.section-header::before, .section-title::before {
  content: ""; width: 4px; height: 4px; border-radius: 50%; background: var(--bento-primary);
  margin-right: 8px; flex-shrink: 0;
}

/* ── Loading / Empty / Info ──────────────────── */
.loading-bar {
  height: 3px; border-radius: var(--bento-radius-pill);
  background: linear-gradient(90deg, var(--bento-primary), var(--bento-primary-2), transparent);
  background-size: 200% 100%;
  animation: bentoLoad 1.5s linear infinite; margin-bottom: 12px;
}
@keyframes bentoLoad { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

.empty-state, .no-data, .no-results {
  text-align: center; color: var(--bento-text-secondary);
  padding: 40px 20px; font-size: 14px;
  background: var(--bento-bg-2); border-radius: var(--bento-radius-md);
  border: 1px dashed var(--bento-border);
}
.info-note, .tip-box {
  font-size: 13px; color: var(--bento-text-secondary);
  background: var(--bento-primary-light);
  border-radius: var(--bento-radius-sm); padding: 12px 14px;
  border-left: 3px solid var(--bento-primary); margin-top: 12px;
  line-height: 1.55;
}
.last-updated {
  font-size: 11px; color: var(--bento-text-muted);
  text-align: right; margin-top: 12px; font-feature-settings: "tnum" 1;
}

/* ── Buttons (premium) ───────────────────────── */
.refresh-btn {
  background: var(--bento-bg-2); border: 1px solid var(--bento-border);
  border-radius: var(--bento-radius-pill); padding: 6px 14px;
  font-size: 12px; color: var(--bento-text-secondary);
  cursor: pointer; font-weight: 600; transition: all var(--bento-trans);
  font-family: "Inter", -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, system-ui, sans-serif;
}
.refresh-btn:hover {
  background: var(--bento-card); color: var(--bento-primary);
  border-color: var(--bento-primary); transform: translateY(-1px);
  box-shadow: var(--bento-shadow-sm);
}
.toggle-btn, .action-btn {
  background: var(--bento-grad-primary); border: none;
  border-radius: var(--bento-radius-xs); padding: 8px 16px;
  font-size: 13px; color: #fff; cursor: pointer; font-weight: 600;
  transition: all var(--bento-trans); font-family: "Inter", -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, system-ui, sans-serif;
  letter-spacing: -0.005em;
  box-shadow: 0 4px 12px -2px var(--bento-primary-glow);
}
.toggle-btn:hover, .action-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 20px -4px var(--bento-primary-glow);
}
.send-btn, .btn-primary {
  width: 100%;
  background: var(--bento-grad-primary); color: #fff;
  border: none; border-radius: var(--bento-radius-sm);
  padding: 12px 20px; font-size: 14px; font-weight: 700;
  cursor: pointer; font-family: "Inter", -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, system-ui, sans-serif;
  letter-spacing: -0.01em;
  transition: all var(--bento-trans);
  box-shadow: 0 4px 14px -2px var(--bento-primary-glow);
}
.send-btn:hover, .btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 28px -6px var(--bento-primary-glow);
}
.send-btn:active, .btn-primary:active { transform: translateY(0); }
.send-btn:disabled, .btn-primary:disabled {
  opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none;
}

/* ── Badges / Status (modern pill) ───────────── */
.badge, .status-badge, .tag, .chip {
  padding: 4px 12px; border-radius: var(--bento-radius-pill);
  font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; gap: 5px;
  letter-spacing: 0.04em; text-transform: uppercase;
  border: 1px solid;
}
.badge-ok, .badge-success { background: var(--bento-success-light); color: var(--bento-success); border-color: var(--bento-success-border); }
.badge-er, .badge-error   { background: var(--bento-error-light);   color: var(--bento-error);   border-color: var(--bento-error-border); }
.badge-warn, .badge-warning { background: var(--bento-warning-light); color: var(--bento-warning); border-color: var(--bento-warning-border); }
.badge-info { background: var(--bento-info-light); color: var(--bento-info); border-color: var(--bento-info-border); }

.count-badge {
  font-size: 11px; font-weight: 700; padding: 3px 10px;
  border-radius: var(--bento-radius-pill); display: inline-flex; align-items: center;
  font-feature-settings: "tnum" 1;
}
.error-badge { background: var(--bento-error-light); color: var(--bento-error); border: 1px solid var(--bento-error-border); }
.warn-badge  { background: var(--bento-warning-light); color: var(--bento-warning); border: 1px solid var(--bento-warning-border); }
.info-badge  { background: var(--bento-primary-light); color: var(--bento-primary); border: 1px solid var(--bento-border); }
.ok-badge    { background: var(--bento-success-light); color: var(--bento-success); border: 1px solid var(--bento-success-border); }

/* ── Tables (modern) ─────────────────────────── */
table { width: 100%; border-collapse: separate; border-spacing: 0; }
th {
  background: var(--bento-bg-2); color: var(--bento-text-secondary);
  font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
  padding: 12px 16px; text-align: left;
  border-bottom: 1px solid var(--bento-border);
}
th:first-child { border-top-left-radius: var(--bento-radius-sm); }
th:last-child  { border-top-right-radius: var(--bento-radius-sm); }
td {
  padding: 14px 16px; border-bottom: 1px solid var(--bento-border);
  color: var(--bento-text); font-size: 13px;
}
tr { transition: background var(--bento-trans-fast); }
tr:hover td { background: var(--bento-primary-light); }
tr:last-child td { border-bottom: 0; }

/* ── Forms / Inputs ──────────────────────────── */
input, select, textarea {
  padding: 10px 14px; border: 1.5px solid var(--bento-border);
  border-radius: var(--bento-radius-xs);
  background: var(--bento-card); color: var(--bento-text);
  font-size: 14px; font-family: "Inter", -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, system-ui, sans-serif;
  transition: all var(--bento-trans); outline: none;
  letter-spacing: -0.005em;
}
input:focus, select:focus, textarea:focus {
  border-color: var(--bento-primary);
  box-shadow: 0 0 0 4px var(--bento-primary-light);
}
input::placeholder, textarea::placeholder { color: var(--bento-text-muted); }

/* ── Code blocks ─────────────────────────────── */
code {
  background: var(--bento-bg-2); padding: 2px 6px;
  border-radius: 4px; font-size: 12px;
  font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;
  border: 1px solid var(--bento-border);
}
pre {
  background: #1e1e2e; color: #e2e8f0;
  padding: 16px; border-radius: var(--bento-radius-sm);
  font-size: 12.5px; overflow-x: auto; line-height: 1.65;
  white-space: pre-wrap; word-break: break-word;
  font-family: "JetBrains Mono", ui-monospace, monospace;
  box-shadow: var(--bento-shadow-md);
}

/* ── Grid layouts ────────────────────────────── */
.schedule-grid, .send-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
}
.schedule-card, .send-card, .info-card {
  background: var(--bento-bg-2); border: 1px solid var(--bento-border);
  border-radius: var(--bento-radius-sm); padding: 16px;
  transition: all var(--bento-trans);
}
.schedule-card:hover, .send-card:hover, .info-card:hover {
  border-color: var(--bento-primary-light); transform: translateY(-1px);
  box-shadow: var(--bento-shadow-md);
}

/* ── Log entries ─────────────────────────────── */
.log-entry {
  display: flex; flex-wrap: wrap; align-items: flex-start;
  gap: 4px 8px; padding: 10px 12px;
  border-radius: var(--bento-radius-sm); margin-bottom: 6px;
  font-size: 12.5px; min-width: 0; overflow: hidden;
  border: 1px solid transparent; transition: all var(--bento-trans-fast);
}
.error-entry { background: var(--bento-error-light); border-color: var(--bento-error-border); }
.warn-entry  { background: var(--bento-warning-light); border-color: var(--bento-warning-border); }
.log-time { color: var(--bento-text-muted); font-feature-settings: "tnum" 1; flex-shrink: 0; font-family: "JetBrains Mono", monospace; }
.log-domain {
  font-weight: 700; flex-shrink: 1; min-width: 0; max-width: 100%;
  overflow: hidden; text-overflow: ellipsis; word-break: break-all;
}
.error-domain { color: var(--bento-error); }
.warn-domain  { color: var(--bento-warning); }
.log-msg {
  color: var(--bento-text-secondary); flex-basis: 100%;
  word-break: break-word; overflow-wrap: anywhere;
  white-space: pre-wrap; min-width: 0; line-height: 1.55;
}

/* ── Send status ─────────────────────────────── */
.send-status {
  padding: 12px 16px; border-radius: var(--bento-radius-sm);
  margin-top: 14px; font-size: 13px; font-weight: 600;
  text-align: center; letter-spacing: -0.005em;
  border: 1px solid;
}
.send-status.sending { background: var(--bento-primary-light); color: var(--bento-primary); border-color: var(--bento-border); }
.send-status.success { background: var(--bento-success-light); color: var(--bento-success); border-color: var(--bento-success-border); }
.send-status.error   { background: var(--bento-error-light);   color: var(--bento-error);   border-color: var(--bento-error-border); }

/* ── Scrollbar ───────────────────────────────── */
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--bento-border); border-radius: var(--bento-radius-pill); border: 2px solid transparent; background-clip: content-box; }
::-webkit-scrollbar-thumb:hover { background: var(--bento-text-muted); background-clip: content-box; }

/* ── Animations ──────────────────────────────── */
@keyframes bentoSpin  { to { transform: rotate(360deg); } }
@keyframes bentoPulse { 0%,100% { opacity: 1; } 50% { opacity: .5; } }
@keyframes bentoSlideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes bentoStaggerIn { from { opacity: 0; transform: translateY(12px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }

/* Apply stagger to grids of stat-cards */
.stats-grid > *, .overview-grid > *, .summary-grid > * {
  animation: bentoStaggerIn 0.35s cubic-bezier(0.4, 0, 0.2, 1) both;
}
.stats-grid > *:nth-child(1)  { animation-delay: 0.02s; }
.stats-grid > *:nth-child(2)  { animation-delay: 0.06s; }
.stats-grid > *:nth-child(3)  { animation-delay: 0.10s; }
.stats-grid > *:nth-child(4)  { animation-delay: 0.14s; }
.stats-grid > *:nth-child(5)  { animation-delay: 0.18s; }
.stats-grid > *:nth-child(6)  { animation-delay: 0.22s; }

/* ── Mobile — 768 px ─────────────────────────── */
@media (max-width: 768px) {
  .content { padding: 16px; }
  .header { padding: 16px 16px 0; }
  .tabs { gap: 2px !important; padding: 3px !important; }
  .tab, .tab-button, .tab-btn { padding: 6px 12px !important; font-size: 12px !important; }
  .overview-grid, .stats-grid, .summary-grid, .stat-cards, .kpi-grid, .metrics-grid {
    grid-template-columns: repeat(2, 1fr); gap: 10px;
  }
  .stat-value, .stat-val, .kpi-val, .metric-val { font-size: 22px; }
  .stat-label, .stat-lbl, .kpi-lbl, .metric-lbl { font-size: 10px; }
  .send-grid, .schedule-grid { grid-template-columns: 1fr; }
  .log-entry { flex-wrap: wrap; gap: 2px 6px; padding: 8px 10px; }
  .log-domain { max-width: 60%; font-size: 11.5px; }
  .log-msg { flex-basis: 100%; max-width: 100%; font-size: 11.5px; }
  pre { padding: 12px; font-size: 11.5px; }
  h2 { font-size: 18px; }
  h3 { font-size: 15px; }
  table { font-size: 12.5px; }
  th, td { padding: 10px 12px; }
}
@media (max-width: 480px) {
  .tabs { gap: 1px !important; padding: 2px !important; }
  .tab, .tab-button, .tab-btn { padding: 5px 10px !important; font-size: 11px !important; }
  .overview-grid, .stats-grid, .summary-grid { grid-template-columns: 1fr 1fr; }
  .stat-value, .stat-val, .kpi-val { font-size: 18px; }
}
`;
}
// XSS escape singleton (idempotent)
if (typeof window !== 'undefined') {
  window._haToolsEsc = window._haToolsEsc || (function(){
    var MAP = {};
    MAP[String.fromCharCode(38)] = '&amp;';
    MAP[String.fromCharCode(60)] = '&lt;';
    MAP[String.fromCharCode(62)] = '&gt;';
    MAP[String.fromCharCode(34)] = '&quot;';
    MAP[String.fromCharCode(39)] = '&#39;';
    return function(s){ return typeof s === 'string' ? s.replace(/[&<>"']/g, function(c){ return MAP[c]; }) : (s == null ? '' : s); };
  })();
}
// Universal donate footer injector — guarantees the support box appears
// on every split-tool card regardless of internal render state.
if (typeof window !== 'undefined' && !window.__haToolsSplitDonateInjector) {
  window.__haToolsSplitDonateInjector = true;
  var SPLIT_TAGS = ['ha-purge-cache','ha-yaml-checker','ha-data-exporter','ha-baby-tracker','ha-chore-tracker','ha-energy-optimizer','ha-energy-insights','ha-energy-email','ha-log-email','ha-smart-reports','ha-network-map','ha-trace-viewer','ha-automation-analyzer','ha-storage-monitor','ha-backup-manager','ha-security-check','ha-device-health','ha-sentence-manager','ha-encoding-fixer','ha-entity-renamer','ha-frigate-privacy','ha-vacuum-water-monitor'];
  var DONATE_HTML = ''
    + '<div class="donate-section" data-source="ha-tools-split-injector">'
    + '  <div class="donate-text">'
    + '    <h3>❤️ Support HA Tools Development</h3>'
    + '    <p>If this tool makes your Home Assistant life easier, consider supporting the project. Every coffee motivates further development!</p>'
    + '  </div>'
    + '  <div class="donate-buttons">'
    + '    <a class="donate-btn coffee" href="https://buymeacoffee.com/macsiem" target="_blank" rel="noopener noreferrer">☕ Buy Me a Coffee</a>'
    + '    <a class="donate-btn paypal" href="https://www.paypal.com/donate/?hosted_button_id=Y967H4PLRBN8W" target="_blank" rel="noopener noreferrer">💳 PayPal</a>'
    + '  </div>'
    + '</div>';
  function deepFindAll(tag, root) {
    var out = [];
    (function walk(node){
      if (!node || !node.querySelectorAll) return;
      var children = node.querySelectorAll('*');
      for (var i = 0; i < children.length; i++) {
        var c = children[i];
        if (c.tagName && c.tagName.toLowerCase() === tag) out.push(c);
        if (c.shadowRoot) walk(c.shadowRoot);
      }
    })(root || document);
    return out;
  }
  // Per-tool prerequisite check + inline install banner
  var PREREQS = {
    'ha-energy-email': { service: 'ha_tools_email', repo: 'ha-tools-email-integration', label: 'HA Tools Email integration', kind: 'integration' },
    'ha-log-email':    { service: 'ha_tools_email', repo: 'ha-tools-email-integration', label: 'HA Tools Email integration', kind: 'integration' },
    'ha-encoding-fixer': { shellCommand: 'fix_encoding', label: 'shell_command.fix_encoding (optional advanced feature)', kind: 'shell_command_optional' }
  };
  // Per-tool first-run intro banner (one-line scope + 3 use cases)
  var INTROS = {
    'ha-yaml-checker': { headline: 'Validate Home Assistant YAML configuration on demand.', steps: ['Click \'Check HA Configuration\' to run homeassistant.check_config.', 'Switch to \'Encje\' tab to search entities by domain.', 'Use \'Template\' tab to preview Jinja2 templates.'] },
    'ha-data-exporter': { headline: 'Browse, filter, and export Home Assistant entity data.', steps: ['Filter by domain or search entities live.', 'Take a snapshot or export selection to CSV / JSON.', 'Privacy warning before downloading attributes with sensitive data.'] },
    'ha-chore-tracker': { headline: 'Household chore tracker with kanban + recurring schedules.', steps: ['Add a chore: name + assignee + frequency.', 'Drag from \'Todo\' to \'Done\' to mark complete.', 'Stats tab shows counts per assignee.'] },
    'ha-energy-optimizer': { headline: 'Tariff-aware energy usage with hourly heatmaps + tips.', steps: ['Today / Yesterday / 7-day / 30-day usage and cost.', 'Patterns tab — hourly heatmap of consumption.', 'Recommendations tab — auto-generated tips.'] },
    'ha-energy-insights': { headline: 'Daily / weekly / monthly energy charts + top consumers.', steps: ['Switch view tabs to see consumption over time.', 'Top devices ranked by kWh.', 'Tips tab with energy-saving suggestions.'] },
    'ha-energy-email': { headline: 'Energy reports delivered by email via ha_tools_email.', steps: ['Click \'Send Now\' to email the current snapshot.', 'Schedule daily / weekly / monthly delivery.', 'Configure SMTP in the Schedule tab (one-time).'] },
    'ha-log-email': { headline: 'Daily error / warning digests delivered by email.', steps: ['Click \'Send Now\' to email the current digest.', 'Schedule daily delivery + threshold (e.g. \u22653 errors).', 'Requires ha-tools-email-integration.'] },
    'ha-smart-reports': { headline: 'Aggregate weekly / monthly reports — energy + automations + state changes.', steps: ['Weekly summary card on Overview.', 'Drill down by Energy / Automations / System sub-tabs.', 'Privacy-safe view strips entity names before sharing.'] },
    'ha-network-map': { headline: 'Visualise the network around HA — devices, topology, MAC bindings.', steps: ['Devices tab — table of all known devices.', 'Topology tab — graph view of the network.', 'Click \'Rescan\' to ping the local subnet (user-initiated).'] },
    'ha-trace-viewer': { headline: 'Step through HA automation traces with a flow graph.', steps: ['Pick automation in sidebar to see latest 5 traces.', 'Click trace for full path through triggers / conditions / actions.', 'Export trace as JSON for offline debug.'] },
    'ha-automation-analyzer': { headline: 'Surface slow / failing / suspicious automations.', steps: ['Overview shows total + health score + top failing.', 'Performance tab ranks by avg runtime.', 'Optimization tab suggests improvements (loops, redundant triggers).'] },
    'ha-storage-monitor': { headline: 'Disk + recorder DB + add-on storage breakdown.', steps: ['Overview shows used / free + per-category breakdown.', 'Backups tab — count + size warning.', 'Cleanup tab — actionable suggestions.'] },
    'ha-backup-manager': { headline: 'Create + list + inspect HA backups.', steps: ['List existing backups (date / size / encryption).', 'Click \'Create backup now\' to invoke backup.create.', 'Restore selected backup.'] },
    'ha-security-check': { headline: 'Security audit + remediation tips.', steps: ['Overview shows score (X/100) + letter grade.', 'Click warning row for step-by-step remediation.', 'Tips tab — checklist of best practices.'] },
    'ha-device-health': { headline: 'Device battery / signal / last-seen health.', steps: ['List devices grouped by health (OK / Warning / Critical).', 'Filter by low battery (<20%) or weak signal.', 'Click device for model / manufacturer / last seen.'] },
    'ha-encoding-fixer': { headline: 'Detect + fix UTF-8 / mojibake issues across HA.', steps: ['Click \'Scan\' to walk entity registry + states.', 'Per-entity \'Fix\' button calls homeassistant.reload.', 'Optional: deep file scan via shell_command (see README).'] },
    'ha-entity-renamer': { headline: 'Bulk-rename HA entities + friendly names.', steps: ['Pick an entity, set new ID — entity_registry/update.', 'Bulk pattern: sensor.old_* \u2192 sensor.new_*.', 'Optional: rewrite Lovelace dashboard refs.'] },
    'ha-frigate-privacy': { headline: 'One-click Frigate privacy mode (pause detection / recording / snapshots).', steps: ['Click \'Pause 15 min\' for instant privacy.', 'Schedules tab — daily privacy window (e.g. 22:00\u201306:00).', 'Resume at any time to re-enable cameras.'] }
  };
  var PREREQ_HTML_CACHE = {};
  function buildPrereqBanner(tag, prereq, hass) {
    if (PREREQ_HTML_CACHE[tag]) return PREREQ_HTML_CACHE[tag];
    var html = '';
    if (prereq.kind === 'integration') {
      html = '<div class="prereq-banner prereq-error" data-prereq="' + tag + '">' +
        '<div class="prereq-icon">⚠️</div>' +
        '<div class="prereq-text">' +
          '<strong>This tool requires the ' + prereq.label + '</strong><br>' +
          'Install it from HACS: <code>https://github.com/MacSiem/' + prereq.repo + '</code> ' +
          '(Category: <strong>Integration</strong>) — then add <code>' + prereq.service + ':</code> to your <code>configuration.yaml</code> and restart HA.' +
        '</div>' +
        '<a class="prereq-cta" href="https://github.com/MacSiem/' + prereq.repo + '" target="_blank" rel="noopener noreferrer">Open install guide ↗</a>' +
      '</div>';
    } else if (prereq.kind === 'shell_command_optional') {
      html = '<div class="prereq-banner prereq-info" data-prereq="' + tag + '">' +
        '<div class="prereq-icon">💡</div>' +
        '<div class="prereq-text">' +
          '<strong>Optional advanced feature: deep file scan</strong><br>' +
          'To enable scanning of <code>configuration.yaml</code> files, install the bundled <code>encoding_scanner.py</code> + add <code>shell_command:</code> entries. See README.' +
        '</div>' +
      '</div>';
    }
    PREREQ_HTML_CACHE[tag] = html;
    return html;
  }
  function buildIntroBanner(tag, intro) {
    var stepsHtml = intro.steps.map(function(s){ return '<li>' + s + '</li>'; }).join('');
    return '<div class="intro-banner" data-intro="' + tag + '">' +
      '<button class="intro-dismiss" type="button" title="Dismiss" aria-label="Dismiss">✕</button>' +
      '<div class="intro-headline">💡 ' + intro.headline + '</div>' +
      '<ol class="intro-steps">' + stepsHtml + '</ol>' +
    '</div>';
  }
  function introDismissed(tag) {
    try { return localStorage.getItem('ha-intro-dismissed-' + tag) === '1'; } catch(e) { return false; }
  }
  function dismissIntro(tag, el) {
    try { localStorage.setItem('ha-intro-dismissed-' + tag, '1'); } catch(e) {}
    var node = el.shadowRoot && el.shadowRoot.querySelector('.intro-banner[data-intro="' + tag + '"]');
    if (node) node.remove();
  }
  function injectAll() {
    SPLIT_TAGS.forEach(function(tag){
      deepFindAll(tag).forEach(function(el){
        // panel_custom auto-init: HA assigns hass/panel/narrow but does not always call setConfig.
        if (typeof el.setConfig === 'function' && !el.config && !el._config) {
          try { el.setConfig({ type: 'custom:' + tag, title: tag }); } catch(e) {}
        }
        if (!el.shadowRoot) return;
        // 0) First-run intro banner (skip if tool has its own native tip)
        var intro = INTROS[tag];
        if (intro && !introDismissed(tag)) {
          var hasOwnTip = el.shadowRoot.querySelector('#tip-banner, .tip-banner');
          var injectedIntro = el.shadowRoot.querySelector('.intro-banner[data-intro="' + tag + '"]');
          if (!hasOwnTip && !injectedIntro) {
            try {
              var _introTmp = document.createElement('div');
              _introTmp.innerHTML = buildIntroBanner(tag, intro);
              var _introNode = _introTmp.firstElementChild;
              if (_introNode) el.shadowRoot.insertBefore(_introNode, el.shadowRoot.firstChild);
              var btn = el.shadowRoot.querySelector('.intro-banner[data-intro="' + tag + '"] .intro-dismiss');
              if (btn) btn.addEventListener('click', function(ev){ ev.stopPropagation(); dismissIntro(tag, el); });
            } catch(e) {}
          }
        }
        // 1) Prereq banner — checked every poll so it disappears when prereq becomes available
        var prereq = PREREQS[tag];
        if (prereq && el._hass) {
          var hassReady = !!el._hass;
          var present = true;
          if (prereq.service) present = !!(el._hass.services && el._hass.services[prereq.service]);
          if (prereq.shellCommand) present = !!(el._hass.services && el._hass.services.shell_command && el._hass.services.shell_command[prereq.shellCommand]);
          var existing = el.shadowRoot.querySelector('.prereq-banner[data-prereq="' + tag + '"]');
          if (!present && hassReady) {
            if (!existing) {
              try {
                var _prereqTmp = document.createElement('div');
                _prereqTmp.innerHTML = buildPrereqBanner(tag, prereq, el._hass);
                var _prereqNode = _prereqTmp.firstElementChild;
                if (_prereqNode) el.shadowRoot.insertBefore(_prereqNode, el.shadowRoot.firstChild);
              } catch(e) {}
            }
          } else if (present && existing) {
            existing.remove();
          }
        }
        // 2) Donate footer
        if (el.shadowRoot.querySelector('.donate-section')) return;
        try {
          var _donateTmp = document.createElement('div');
          _donateTmp.innerHTML = DONATE_HTML;
          while (_donateTmp.firstChild) el.shadowRoot.appendChild(_donateTmp.firstChild);
        } catch(e) {}
      });
    });
  }
  // Run immediately, then aggressive MutationObserver for late mounts + view switches.
  injectAll();
  setTimeout(injectAll, 250);
  setTimeout(injectAll, 1000);
  setTimeout(injectAll, 3000);
  // MutationObserver catches every new node anywhere in the DOM, including shadow root attachments
  // that are deferred until the user navigates to a view.
  try {
    var obs = new MutationObserver(function(muts){
      // Debounce: schedule a microtask injection
      if (window.__haToolsDonateScheduled) return;
      window.__haToolsDonateScheduled = true;
      setTimeout(function(){ window.__haToolsDonateScheduled = false; injectAll(); }, 100);
    });
    obs.observe(document.body, { childList: true, subtree: true });
  } catch(e) {}
  // Also re-inject on hash/path change (Lovelace view switches)
  window.addEventListener('hashchange', function(){ setTimeout(injectAll, 200); });
  window.addEventListener('popstate', function(){ setTimeout(injectAll, 200); });
  // Backup interval (every 3s for first 5min — handles cases where MutationObserver missed events)
  var pollCount = 0;
  var pollInterval = setInterval(function(){
    injectAll();
    if (++pollCount >= 100) clearInterval(pollInterval);
  }, 3000);
}
/* ============================================================ */

class HAAutomationAnalyzer extends HTMLElement {
  constructor() {
    super();
    this._lang = (navigator.language || '').startsWith('pl') ? 'pl' : 'en';
    this.attachShadow({ mode: "open" });
    this.config = {};
    this._hass = null;
    this._toolId = this.tagName.toLowerCase().replace('ha-', '');
    this.currentTab = "overview";
    this.automationStats = new Map();
    this.automationHistory = new Map();
    this.automationTraces = new Map();
    this.executionTimes = [];
    this.triggerTypes = new Map();
    this.failedAutomations = new Map();
    this.disabledAutomations = [];
    this._charts = {};
    this._chartJsLoaded = false;
    this._isLoading = true;
    this._lastUpdated = null;
    this._apiCache = new Map();
    this._cacheTimestamps = new Map();
    this._cacheTTL = 60000;
    this._lastRenderTime = 0;
    this._renderScheduled = false;
    this._firstHassRender = false;
    this._loadingInProgress = false;
    this._traceNoticeDismissed = false;
    this._loadingPhase = "";
    this._filterText = "";
    this._sortBy = "lastTriggered";
    this._sortDir = "desc";
    this._timeRange = "all";
    // Pagination for optimization tab
    this._currentPage = {};
    this._pageSize = 15;
  }

  setConfig(config) {
    this.config = {
      title: "Automation Analyzer",
      show_disabled: true,
      ...config
    };
  }

  set hass(hass) {

    if (hass?.language) this._lang = hass.language.startsWith('pl') ? 'pl' : 'en';    this._hass = hass;
    if (!hass) return;
    const now = Date.now();
    if (!this._firstHassRender) {
      this._firstHassRender = true;
      this._loadAndRender();
      return;
    }
    // Respect auto-refresh toggle from HA Tools panel
    if (!this._isAutoRefreshEnabled()) return;
    if (now - (this._lastRenderTime || 0) < 30000) {
      if (!this._renderScheduled) {
        this._renderScheduled = true;
        setTimeout(() => {
          this._renderScheduled = false;
          if (this._isAutoRefreshEnabled()) this._loadAndRender();
        }, 30000 - (now - (this._lastRenderTime || 0)));
      }
      return;
    }
    this._loadAndRender();
  }

  get hass() { return this._hass; }

  get _t() {
    const T = {
      pl: {
        title: 'Analizator Automatyzacji',
        loading: 'Wczytywanie...',
        noData: 'Brak danych',
        error: 'B\u0142\u0105d',
        refresh: 'Od\u015Bwie\u017C',
        automations: 'Automatyzacje',
        enabled: 'Aktywne',
        disabled: 'Nieaktywne',
        total: 'Razem',
        triggers: 'Wyzwalacze',
        actions: 'Akcje',
        conditions: 'Warunki',
        lastTriggered: 'Ostatnie uruchomienie',
        never: 'Nigdy',
        errorCountRecent: 'b\u0142\u0105d(y) w ostatnich uruchomieniach',
        justNow: 'przed chwil\u0105',
        excellent: 'Doskona\u0142y',
        good: 'Dobry',
        needsImprovement: 'Wymaga poprawy',
        noAutomationsMatching: 'Brak automatyzacji pasuj\u0105cych do filtr\u00f3w',
        totalLabel: '\u0141\u0105cznie',
        active: 'Aktywnych',
        disabledLabel: 'Wy\u0142\u0105czonych',
        errorsLabel: 'B\u0142\u0119d\u00f3w',
        searchPlaceholder: 'Szukaj automatyzacji\u2026',
        runsTodayOption: 'Uruchomienia dzi\u015B',
        executionTime: 'Czas wykonania',
        descendingAscending: 'Malej\u0105co/Rosn\u0105co',
        allTime: 'Ca\u0142y czas',
        today: 'Dzi\u015B',
        mostActiveTodayTitle: 'Najaktywniejsze dzi\u015B',
        executionTimeDistribution: 'Rozk\u0142ad czas\u00f3w wykonania',
        noExecutionTimeData: 'Brak danych o czasach wykonania \u2014 zbyt ma\u0142o uruchomie\u0144 z pe\u0142nymi danymi',
        noTriggerData: 'Brak danych o wyzwalaczach \u2014 konfiguracja automatyzacji niedost\u0119pna',
        errorBadge: 'b\u0142\u0105d',
        disabledBadge: 'wy\u0142\u0105czona',
        enableButton: 'W\u0142\u0105cz',
        noFailedAutomations: 'Brak nieudanych automatyzacji',
        noDisabledAutomations: 'Brak wy\u0142\u0105czonych automatyzacji',
        allRecent: 'Wszystkie automatyzacje by\u0142y ostatnio aktywne',
        withErrors: 'Z b\u0142\u0119dami',
        automationsWithErrors: 'Automatyzacje z b\u0142\u0119dami',
        disabledAutomations: 'Wy\u0142\u0105czone automatyzacje',
        tracesNotice: 'Domy\u015blnie HA przechowuje tylko <strong>5 ostatnich tras</strong> na automatyzacj\u0119. Trasy s\u0105 <strong>czyszczone po restarcie</strong> HA \u2014 po ponownym uruchomieniu wszystkie zapisane trace zostan\u0105 usuni\u0119te. Mo\u017cesz zwi\u0119kszy\u0107 limit w <a id="trace-viewer-link">Trace Viewer</a> (HA Tools \u2192 Ustawienia).',
        tracesNoticeDetail: '\u2139\uFE0F Aby zachowa\u0107 wi\u0119cej danych o wykonaniach, ustaw stored_traces w konfiguracji HA lub u\u017cyj sekcji ustawie\u0144 w Trace Viewer.',
        closeButton: 'Zamknij',
        loadingData: '\u0141adowanie danych...',
        fetchingTraces: 'Pobieranie tras wykonania...',
        fetchingHistory: 'Pobieranie historii wykonania...',
        never: 'nigdy',
        minutesAgo: 'm temu',
        minutesAgoEn: 'm ago',
        hoursAgoSuffix: 'h temu',
        hoursAgoSuffixEn: 'h ago',
        daysAgoSuffix: 'd temu',
        daysAgoSuffixEn: 'd ago',
        secondsAgo: 's temu',
        secondsAgoEn: 's ago',
        todayCount: 'Dzisiejsze uruchomienia',
        averageTime: '\u015Aredni czas',
        todayRunsOption: 'Uruchomienia dzi\u015B',
        todayRunsOptionEn: 'Runs today',
        noFailedLabel: '\u2705 Brak nieudanych automatyzacji',
        noDisabledLabel: '\u2705 Brak wy\u0142\u0105czonych automatyzacji',
        noStaleLabel: '\u2705 Wszystkie automatyzacje by\u0142y ostatnio aktywne',
        sevenDays: '7 dni',
        fourteenDays: '14 dni',
        thirtyDays: '30 dni',
        name: 'Nazwa',
        state: 'Stan',
        descending: 'Malejąco',
        ascending: 'Rosnąco',
        dailyExecutions: 'Dzienne wykonania (14 dni)',
        statistics: 'Statystyki',
        avgTimeLabel: '\u015Ar. czas',
        withTimeData: 'Z danymi o czasie',
        triggerTypes: 'Typ\u00f3w wyzwalaczy',
        noSlowAutomations: '\u2705 Brak wolnych automatyzacji',
        noFailedAutomations2: '\u2705 Brak nieudanych automatyzacji',
        slowAutomationsTitle: '\u26A0\uFE0F Wolne automatyzacje (&gt;800ms)',
        failedAutomationsTitle: '\u274C Automatyzacje z b\u0142\u0119dami',
        disabledAutomationsTitle: '\u23F8\uFE0F Wy\u0142\u0105czone automatyzacje',
        inactiveAutomationsTitle: '\uD83D\uDCA4 Nieaktywne automatyzacje (&gt;30 dni)',
        slowStat: 'Wolnych (&gt;800ms)',
        withErrorsStat: 'Z b\u0142\u0119dami',
        disabledStat: 'Wy\u0142\u0105czonych',
        inactiveStat: 'Nieaktywnych (&gt;30d)',
        lastUpdated: 'Ostatnia aktualizacja: ',
        automations: 'automatyzacji',
        tabOverview: 'Przegl\u0105d',
        tabPerformance: 'Wydajno\u015B\u0107',
        tabOptimization: 'Optymalizacja',
        phaseLoadingAutomations: 'Wczytywanie automatyzacji...',
        phaseLoadingMetadata: 'Pobieranie metadanych...',
        phaseLoadingTraces: 'Pobieranie tras wykonania...',
        phaseLoadingHistory: 'Pobieranie historii wykonania...',
        systemHealth: 'Stan systemu automatyzacji',
        triggerTypesTitle: 'Typy wyzwalaczy',
      },
      en: {
        title: 'Automation Analyzer',
        loading: 'Loading...',
        noData: 'No data',
        error: 'Error',
        refresh: 'Refresh',
        automations: 'Automations',
        enabled: 'Enabled',
        disabled: 'Disabled',
        total: 'Total',
        triggers: 'Triggers',
        actions: 'Actions',
        conditions: 'Conditions',
        lastTriggered: 'Last triggered',
        never: 'Never',
        errorCountRecent: 'error(s) in recent runs',
        justNow: 'just now',
        excellent: 'Excellent',
        good: 'Good',
        needsImprovement: 'Needs improvement',
        noAutomationsMatching: 'No automations matching filters',
        totalLabel: 'Total',
        active: 'Active',
        disabledLabel: 'Disabled',
        errorsLabel: 'Errors',
        searchPlaceholder: 'Search automations\u2026',
        runsTodayOption: 'Runs today',
        executionTime: 'Execution time',
        descendingAscending: 'Descending/Ascending',
        allTime: 'All time',
        today: 'Today',
        mostActiveTodayTitle: 'Most active today',
        executionTimeDistribution: 'Execution time distribution',
        noExecutionTimeData: 'No execution time data \u2014 too few runs with complete data',
        noTriggerData: 'No trigger data \u2014 automation configuration unavailable',
        errorBadge: 'error',
        disabledBadge: 'disabled',
        enableButton: 'Enable',
        noFailedAutomations: 'No failed automations',
        noDisabledAutomations: 'No disabled automations',
        allRecent: 'All automations were recently active',
        withErrors: 'With errors',
        automationsWithErrors: 'Automations with errors',
        disabledAutomations: 'Disabled automations',
        tracesNotice: 'By default HA stores only the <strong>last 5 traces</strong> per automation. Traces are <strong>cleared on restart</strong> \u2014 after reboot all stored traces will be removed. You can increase the limit in <a id="trace-viewer-link">Trace Viewer</a> (HA Tools \u2192 Settings).',
        tracesNoticeDetail: '\u2139\uFE0F To keep more execution data, set stored_traces in HA config or use the Settings section in Trace Viewer.',
        closeButton: 'Close',
        loadingData: 'Loading data...',
        fetchingTraces: 'Fetching execution traces...',
        fetchingHistory: 'Fetching execution history...',
        never: 'never',
        minutesAgo: 'm ago',
        minutesAgoEn: 'm ago',
        hoursAgoSuffix: 'h ago',
        hoursAgoSuffixEn: 'h ago',
        daysAgoSuffix: 'd ago',
        daysAgoSuffixEn: 'd ago',
        secondsAgo: 's ago',
        secondsAgoEn: 's ago',
        todayCount: 'Today\'s runs',
        averageTime: 'Average time',
        todayRunsOption: 'Runs today',
        todayRunsOptionEn: 'Runs today',
        noFailedLabel: '\u2705 No failed automations',
        noDisabledLabel: '\u2705 No disabled automations',
        noStaleLabel: '\u2705 All automations were recently active',
        sevenDays: '7 days',
        fourteenDays: '14 days',
        thirtyDays: '30 days',
        name: 'Name',
        state: 'State',
        descending: 'Descending',
        ascending: 'Ascending',
        dailyExecutions: 'Daily executions (14 days)',
        statistics: 'Statistics',
        avgTimeLabel: 'Avg. time',
        withTimeData: 'With time data',
        triggerTypes: 'Trigger types',
        noSlowAutomations: '\u2705 No slow automations',
        noFailedAutomations2: '\u2705 No failed automations',
        slowAutomationsTitle: '\u26A0\uFE0F Slow automations (&gt;800ms)',
        failedAutomationsTitle: '\u274C Automations with errors',
        disabledAutomationsTitle: '\u23F8\uFE0F Disabled automations',
        inactiveAutomationsTitle: '\uD83D\uDCA4 Inactive automations (&gt;30 days)',
        slowStat: 'Slow (&gt;800ms)',
        withErrorsStat: 'With errors',
        disabledStat: 'Disabled',
        inactiveStat: 'Inactive (&gt;30d)',
        lastUpdated: 'Last updated: ',
        automations: 'automations',
        tabOverview: 'Overview',
        tabPerformance: 'Performance',
        tabOptimization: 'Optimization',
        phaseLoadingAutomations: 'Loading automations...',
        phaseLoadingMetadata: 'Fetching metadata...',
        phaseLoadingTraces: 'Fetching execution traces...',
        phaseLoadingHistory: 'Fetching execution history...',
        systemHealth: 'Automation system health',
        triggerTypesTitle: 'Trigger Types',
      },
    };
    return T[this._lang] || T.en;
  }

  _sanitize(s) { try { return decodeURIComponent(escape(s)); } catch(e) { return s; } }

  _isAutoRefreshEnabled() {
    try {
      let el = this;
      while (el) {
        if (el.tagName && el.tagName.toLowerCase() === "ha-tools-panel") {
          const cb = el.shadowRoot && el.shadowRoot.getElementById("autoRefreshCb");
          if (cb) return cb.checked;
        }
        const root = el.getRootNode ? el.getRootNode() : null;
        el = (root && root.host) ? root.host : el.parentNode;
        if (el === document || el === window || !el) break;
      }
      // Standalone Lovelace card - no ha-tools-panel, always refresh
      return true;
    } catch (e) { return true; }
  }

  async _loadAndRender() {
    if (this._loadingInProgress) return;
    this._loadingInProgress = true;
    this._isLoading = true;
    this.render(); // Show loading spinner immediately (fixes blank page)
    try {
      await this.updateAutomationData();
      this.render();
      this._lastRenderTime = Date.now();
    } finally {
      this._loadingInProgress = false;
    }
  }

  async _loadChartJS() {
    if (this._chartJsLoaded && window.Chart) return window.Chart;
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/local/community/ha-tools/vendor/chart.umd.min.js";
      script.onload = () => { this._chartJsLoaded = true; resolve(window.Chart); };
      script.onerror = () => reject(new Error("Failed to load Chart.js"));
      document.head.appendChild(script);
    });
  }

  _getCachedData(key) {
    const timestamp = this._cacheTimestamps.get(key);
    if (timestamp && Date.now() - timestamp < this._cacheTTL) return this._apiCache.get(key);
    return null;
  }

  _setCachedData(key, data) {
    this._apiCache.set(key, data);
    this._cacheTimestamps.set(key, Date.now());
  }

  async _callAPI(method, path) {
    try {
      const cached = this._getCachedData(path);
      if (cached) return cached;
      const response = await this._hass.callApi(method, path);
      this._setCachedData(path, response);
      return response;
    } catch (error) {
      console.warn(`API call failed for ${path}:`, error);
      return null;
    }
  }

  async _getAllAutomationConfigs(automations) {
    // Method 1: WebSocket bulk (works in main frontend/dashboard)
    try {
      if (this._hass && this._hass.callWS) {
        const configs = await this._hass.callWS({ type: "config/automation/list" });
        if (configs && Array.isArray(configs) && configs.length > 0) return configs;
      }
    } catch (e) { /* WS not available in this context */ }

    // Method 2: Per-automation REST API (works in HA Tools panel)
    // Only fetch enabled automations to keep it fast
    if (automations && automations.length > 0) {
      const configs = [];
      const enabled = automations.filter(([, e]) => e.state === "on");
      const toFetch = enabled.slice(0, 60); // Limit to 60 to avoid overload
      const batchSize = 10;
      for (let i = 0; i < toFetch.length; i += batchSize) {
        const batch = toFetch.slice(i, i + batchSize);
        const results = await Promise.allSettled(
          batch.map(([, entity]) => {
            const attrId = entity.attributes?.id;
            if (!attrId) return Promise.reject("no id");
            return this._callAPI("GET", `config/automation/config/${attrId}`);
          })
        );
        for (const r of results) {
          if (r.status === "fulfilled" && r.value && r.value.id) configs.push(r.value);
        }
      }
      if (configs.length > 0) return configs;
    }

    console.warn("Could not fetch automation configs");
    return [];
  }

  async _getAutomationTraces(automationId) {
    // Traces contain actual execution data - timing, errors, etc.
    // Use bulk traces if already fetched
    if (this._bulkTraces) {
      return this._bulkTraces.filter(t => t.item_id === automationId);
    }
    try {
      if (this._hass && this._hass.callWS) {
        const traces = await this._hass.callWS({
          type: "automation/trace/list",
          automation_id: automationId
        });
        if (traces && Array.isArray(traces)) return traces;
      }
    } catch (e) {
      // Trace API may not be available in all HA versions
    }
    return [];
  }

  async _getAllTracesBulk() {
    // Fetch ALL automation traces in one call using trace/list
    try {
      if (this._hass && this._hass.callWS) {
        const traces = await this._hass.callWS({ type: "trace/list", domain: "automation" });
        if (traces && Array.isArray(traces)) return traces;
      }
    } catch (e) { /* Not available */ }
    return null;
  }

  async _getAutomationHistory(entityId, days = 14) {
    try {
      const now = new Date();
      const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      const startStr = startDate.toISOString();
      const history = await this._callAPI(
        "GET",
        `history/period/${startStr}?filter_entity_id=${entityId}&minimal_response&no_attributes`
      );
      if (Array.isArray(history) && history.length > 0) return history[0] || [];
      return [];
    } catch (error) {
      console.warn(`Could not get history for ${entityId}:`, error);
      return [];
    }
  }

  _parseAutomationConfig(configObj) {
    if (!configObj) return { triggers: [], actions: [], conditions: [] };
    const triggerRaw = configObj.trigger || configObj.triggers;
    const actionRaw = configObj.action || configObj.actions;
    const conditionRaw = configObj.condition || configObj.conditions;
    const triggers = triggerRaw ? (Array.isArray(triggerRaw) ? triggerRaw : [triggerRaw]) : [];
    const actions = actionRaw ? (Array.isArray(actionRaw) ? actionRaw : [actionRaw]) : [];
    const conditions = conditionRaw ? (Array.isArray(conditionRaw) ? conditionRaw : [conditionRaw]) : [];
    return { triggers, actions, conditions };
  }

  _getTriggerTypes(triggers) {
    const types = new Set();
    triggers.forEach(trigger => {
      if (typeof trigger === "object") {
        const type = trigger.platform || trigger.trigger;
        if (type) types.add(type);
      }
    });
    return Array.from(types);
  }

  _calculateHealthScore() {
    if (this.automationStats.size === 0) return 0;
    const total = this.automationStats.size;
    const disabled = this.disabledAutomations.length;
    const failed = this.failedAutomations.size;
    const slow = Array.from(this.automationStats.values()).filter(a => typeof a.avgExecutionTime === "number" && a.avgExecutionTime > 800).length;
    const stale = Array.from(this.automationStats.values()).filter(a => {
      if (!a.lastTriggered || a.state === "off") return false;
      const daysSince = (Date.now() - a.lastTriggered.getTime()) / (1000 * 60 * 60 * 24);
      return daysSince > 30;
    }).length;
    let score = 100;
    score -= (disabled / total) * 15;
    score -= (failed / total) * 25;
    score -= (slow / total) * 10;
    score -= (stale / total) * 5;
    return Math.max(0, Math.round(score));
  }

  _extractTodayCount(history) {
    if (!history || history.length === 0) return 0;
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return history.filter(event => {
      const eventTime = new Date(event.last_changed);
      return eventTime >= startOfDay && event.state === "on";
    }).length;
  }

  _countTracesToday(traces) {
    if (!traces || traces.length === 0) return 0;
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return traces.filter(t => {
      const raw = (t.timestamp && typeof t.timestamp === "object") ? t.timestamp.start : t.timestamp;
      if (!raw) return false;
      const ts = new Date(raw);
      return ts >= startOfDay;
    }).length;
  }

  _analyzeTraces(traces) {
    // Extract execution times and error status from traces
    const result = { avgTime: "N/A", hasErrors: false, errorCount: 0, executionCount: traces.length, recentTimes: [] };
    if (!traces || traces.length === 0) return result;
    const durations = [];
    for (const trace of traces) {
      if (trace.state === "stopped" && trace.script_execution === "error") {
        result.hasErrors = true;
        result.errorCount++;
      }
      // Support both formats: trace/list (timestamp.start/finish) and automation/trace/list (timestamp + finished_at)
      let start = null, end = null;
      if (trace.timestamp && typeof trace.timestamp === "object" && trace.timestamp.start) {
        start = new Date(trace.timestamp.start).getTime();
        end = trace.timestamp.finish ? new Date(trace.timestamp.finish).getTime() : null;
      } else if (trace.timestamp) {
        start = new Date(trace.timestamp).getTime();
        end = trace.finished_at ? new Date(trace.finished_at).getTime() : null;
      }
      if (start && end) {
        const duration = end - start;
        if (duration >= 0 && duration < 300000) {
          durations.push(duration);
        }
      }
    }
    if (durations.length > 0) {
      result.avgTime = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
      result.recentTimes = durations.slice(-10);
    }
    return result;
  }

  async updateAutomationData() {
    if (!this._hass || !this._hass.states) { this._isLoading = false; return; }
    this._isLoading = true;
    this._loadingPhase = "Odczytywanie stan\u00f3w automatyzacji...";
    try {
      const automations = Object.entries(this._hass.states).filter(([id]) => id.startsWith("automation."));
      this.automationStats.clear();
      this.triggerTypes.clear();
      this.failedAutomations.clear();
      this.disabledAutomations = [];
      this.executionTimes = [];
      this.automationHistory.clear();
      this.automationTraces.clear();

      // --- Phase 1: Instant pass using hass states only (ZERO API calls) ---
      const automationMeta = [];
      for (const [id, entity] of automations) {
        const name = this._sanitize(entity.attributes?.friendly_name || id.replace("automation.", ""));
        const isDisabled = entity.state === "off";
        if (isDisabled && !this.config.show_disabled) continue;

        const internalId = entity.attributes?.id || id.replace("automation.", "");

        if (isDisabled) {
          this.disabledAutomations.push({ id, name, automationId: internalId });
        }

        const lastTriggered = entity.attributes?.last_triggered
          ? new Date(entity.attributes.last_triggered)
          : null;

        this.automationStats.set(id, {
          id, automationId: internalId, name,
          state: entity.state, lastTriggered,
          todayCount: 0, avgExecutionTime: "N/A",
          totalActions: 0, conditions: 0,
          triggerTypes: [], primaryTrigger: "unknown",
          isFailed: false, traceCount: 0, history: []
        });

        automationMeta.push({ id, entity, name, internalId, isDisabled, lastTriggered });
      }

      // Show basic stats immediately (no API calls made yet)
      this._isLoading = false;
      this._lastUpdated = new Date();
      this.render();

      // --- Phase 2: Fetch automation configs (enriches trigger types) ---
      this._loadingPhase = this._lang === 'pl' ? "Pobieranie konfiguracji automatyzacji..." : "Fetching automation configuration...";
      this.render();
      const allConfigs = await this._getAllAutomationConfigs(automations);
      const configByEntityId = new Map();
      for (const [entityId, entity] of automations) {
        const attrId = entity.attributes?.id;
        if (attrId) {
          const found = allConfigs.find(c => c.id === attrId);
          if (found) { configByEntityId.set(entityId, found); continue; }
        }
        const friendlyName = entity.attributes?.friendly_name;
        if (friendlyName) {
          const found = allConfigs.find(c => c.alias === this._sanitize(friendlyName));
          if (found) { configByEntityId.set(entityId, found); continue; }
        }
        const slug = entityId.replace("automation.", "");
        const found = allConfigs.find(c => c.id === slug);
        if (found) { configByEntityId.set(entityId, found); }
      }

      // Enrich automationStats with config data
      this.triggerTypes.clear();
      for (const a of automationMeta) {
        const configObj = configByEntityId.get(a.id);
        const existing = this.automationStats.get(a.id);
        if (existing && configObj) {
          const parsed = this._parseAutomationConfig(configObj);
          const triggerTypesList = this._getTriggerTypes(parsed.triggers);
          existing.automationId = configObj.id || existing.automationId;
          existing.totalActions = parsed.actions.length;
          existing.conditions = parsed.conditions.length;
          existing.triggerTypes = triggerTypesList;
          existing.primaryTrigger = triggerTypesList[0] || "unknown";
          a.internalId = existing.automationId;
          triggerTypesList.forEach(type => {
            this.triggerTypes.set(type, (this.triggerTypes.get(type) || 0) + 1);
          });
        }
        a.configObj = configObj;
      }
      // Re-render with enriched config data
      this.render();

      // --- Phase 2b: Fetch traces ---
      this._loadingPhase = this._t.phaseLoadingTraces;
      this.render();
      const enabled = automationMeta.filter(a => !a.isDisabled);
      const batchSize = 15;
      // Try bulk trace fetch first (trace/list with domain=automation) - single WS call
      this._bulkTraces = await this._getAllTracesBulk();
      if (this._bulkTraces) {
        // Bulk succeeded - distribute traces to each automation
        for (const a of enabled) {
          const traces = this._bulkTraces.filter(t => t.item_id === a.internalId);
          this.automationTraces.set(a.id, traces);
          const traceAnalysis = this._analyzeTraces(traces);
          const todayTraceCount = this._countTracesToday(traces);
          const existing = this.automationStats.get(a.id);
          if (existing) {
            existing.todayCount = todayTraceCount;
            existing.traceCount = traces.length;
            if (traceAnalysis.avgTime !== "N/A") {
              existing.avgExecutionTime = traceAnalysis.avgTime;
              this.executionTimes.push(traceAnalysis.avgTime);
            }
            if (traceAnalysis.hasErrors) {
              existing.isFailed = true;
              this.failedAutomations.set(a.id, {
                name: a.name, automationId: a.internalId,
                reason: `${traceAnalysis.errorCount} ${this._t.errorCountRecent}`
              });
            }
          }
        }
      } else {
      // Fallback: per-automation trace fetch in batches
      for (let i = 0; i < enabled.length; i += batchSize) {
        const batch = enabled.slice(i, i + batchSize);
        const traceResults = await Promise.allSettled(
          batch.map(a => this._getAutomationTraces(a.internalId).then(traces => ({ ...a, traces })))
        );
        for (const r of traceResults) {
          if (r.status !== "fulfilled") continue;
          const { id, internalId, name, traces } = r.value;
          this.automationTraces.set(id, traces);
          const traceAnalysis = this._analyzeTraces(traces);
          const todayTraceCount = this._countTracesToday(traces);
          const existing = this.automationStats.get(id);
          if (existing) {
            existing.todayCount = todayTraceCount;
            existing.traceCount = traces.length;
            if (traceAnalysis.avgTime !== "N/A") {
              existing.avgExecutionTime = traceAnalysis.avgTime;
              this.executionTimes.push(traceAnalysis.avgTime);
            }
            if (traceAnalysis.hasErrors) {
              existing.isFailed = true;
              this.failedAutomations.set(id, {
                name, automationId: internalId,
                reason: `${traceAnalysis.errorCount} ${this._t.errorCountRecent}`
              });
            }
          }
        }
      }
      } // end else (fallback per-automation trace fetch)

      // --- Phase 3: Fetch history ---
      this._loadingPhase = this._t.phaseLoadingHistory;
      this.render();
      const recentActive = enabled
        .filter(a => a.lastTriggered)
        .sort((a, b) => b.lastTriggered.getTime() - a.lastTriggered.getTime())
        .slice(0, 30);
      for (let i = 0; i < recentActive.length; i += batchSize) {
        const batch = recentActive.slice(i, i + batchSize);
        const histResults = await Promise.allSettled(
          batch.map(a => this._getAutomationHistory(a.id).then(history => ({ ...a, history })))
        );
        for (const r of histResults) {
          if (r.status !== "fulfilled") continue;
          const { id, history } = r.value;
          this.automationHistory.set(id, history);
          const existing = this.automationStats.get(id);
          if (existing) {
            existing.history = history;
            if (existing.todayCount === 0) {
              existing.todayCount = this._extractTodayCount(history);
            }
            if (existing.avgExecutionTime === "N/A" && history.length > 0) {
              const durations = [];
              for (let j = 1; j < history.length; j++) {
                const prev = new Date(history[j - 1].last_changed);
                const curr = new Date(history[j].last_changed);
                const duration = curr - prev;
                if (duration < 5000 && duration > 0) durations.push(duration);
              }
              if (durations.length > 0) {
                existing.avgExecutionTime = Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
                this.executionTimes.push(existing.avgExecutionTime);
              }
            }
          }
        }
      }
      this._loadingPhase = "";
      this._lastUpdated = new Date();
    } catch (err) {
      console.error("Error in updateAutomationData:", err);
    } finally {
      this._isLoading = false;
    }
  }

  getTopAutomations(count = 5) {
    const all = Array.from(this.automationStats.values()).filter(a => a.state === "on");
    // Primary sort: todayCount, secondary: traceCount, tertiary: most recently triggered
    return all.sort((a, b) => {
      if (b.todayCount !== a.todayCount) return b.todayCount - a.todayCount;
      if (b.traceCount !== a.traceCount) return b.traceCount - a.traceCount;
      const aTime = a.lastTriggered ? a.lastTriggered.getTime() : 0;
      const bTime = b.lastTriggered ? b.lastTriggered.getTime() : 0;
      return bTime - aTime;
    }).slice(0, count);
  }

  getRecentlyTriggered(count = 10) {
    return Array.from(this.automationStats.values())
      .filter(a => a.lastTriggered && a.state === "on")
      .sort((a, b) => b.lastTriggered.getTime() - a.lastTriggered.getTime())
      .slice(0, count);
  }

  getStaleAutomations(daysThreshold = 30) {
    const now = Date.now();
    return Array.from(this.automationStats.values())
      .filter(a => {
        if (a.state === "off") return false;
        if (!a.lastTriggered) return true;
        return (now - a.lastTriggered.getTime()) / (1000 * 60 * 60 * 24) > daysThreshold;
      })
      .sort((a, b) => {
        const aTime = a.lastTriggered ? a.lastTriggered.getTime() : 0;
        const bTime = b.lastTriggered ? b.lastTriggered.getTime() : 0;
        return aTime - bTime;
      }).slice(0, 10);
  }

  getExecutionDistribution() {
    const distribution = { "0-100ms": 0, "100-500ms": 0, "500-1s": 0, "1-5s": 0, "5s+": 0 };
    this.executionTimes.forEach(time => {
      if (time < 100) distribution["0-100ms"]++;
      else if (time < 500) distribution["100-500ms"]++;
      else if (time < 1000) distribution["500-1s"]++;
      else if (time < 5000) distribution["1-5s"]++;
      else distribution["5s+"]++;
    });
    return distribution;
  }

  getTriggerTypeData() {
    return Array.from(this.triggerTypes.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
  }

  getOptimizationData() {
    const slow = Array.from(this.automationStats.values())
      .filter(a => typeof a.avgExecutionTime === "number" && a.avgExecutionTime > 800)
      .sort((a, b) => b.avgExecutionTime - a.avgExecutionTime)
      .slice(0, 10);
    const failed = Array.from(this.failedAutomations.entries())
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const disabled = this.disabledAutomations.slice(0, 15);
    const stale = this.getStaleAutomations();
    return { slow, failed, disabled, stale };
  }

  _getComputedColors() {
    const style = getComputedStyle(document.documentElement);
    return {
      primary: style.getPropertyValue("--primary-color").trim() || "#3B82F6",
      secondary: style.getPropertyValue("--secondary-text-color").trim() || "#64748b",
      error: style.getPropertyValue("--error-color").trim() || "#EF4444",
      success: style.getPropertyValue("--success-color").trim() || "#10B981",
      warning: style.getPropertyValue("--warning-color").trim() || "#F59E0B",
      textPrimary: style.getPropertyValue("--primary-text-color").trim() || "#1e293b",
      border: style.getPropertyValue("--divider-color").trim() || "#e0e0e0",
      cardBg: style.getPropertyValue("--card-background-color").trim() || "#ffffff",
      accent: style.getPropertyValue("--accent-color").trim() || "#3B82F6"
    };
  }

  _formatLastUpdated() {
    if (!this._lastUpdated) return this._t.never;
    const diff = Date.now() - this._lastUpdated;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const suffix = this._lang === 'pl' ? this._t.secondsAgo : this._t.secondsAgoEn;
    const minuteSuffix = this._lang === 'pl' ? this._t.minutesAgo : this._t.minutesAgoEn;
    if (seconds < 60) return `${seconds}${suffix}`;
    if (minutes < 60) return `${minutes}${minuteSuffix}`;
    return this._lastUpdated.toLocaleTimeString(this._lang === 'pl' ? "pl-PL" : "en-US", { hour: "2-digit", minute: "2-digit" });
  }

  _formatTimeSince(date) {
    if (!date) return this._t.never;
    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    const minuteSuffix = this._lang === 'pl' ? this._t.minutesAgo : this._t.minutesAgoEn;
    const hourSuffix = this._lang === 'pl' ? this._t.hoursAgoSuffix : this._t.hoursAgoSuffixEn;
    const daySuffix = this._lang === 'pl' ? this._t.daysAgoSuffix : this._t.daysAgoSuffixEn;
    if (mins < 1) return this._t.justNow;
    if (mins < 60) return `${mins}${minuteSuffix}`;
    if (hours < 24) return `${hours}${hourSuffix}`;
    if (days < 7) return `${days}${daySuffix}`;
    const dateLocale = this._lang === 'pl' ? "pl-PL" : "en-US";
    return date.toLocaleDateString(dateLocale, { day: "numeric", month: "short" });
  }

  _navigateToAutomation(automationId) {
    const path = `/config/automation/edit/${automationId}`;
    // Method 1: HA frontend navigate (works in dashboard cards)
    if (this._hass && typeof this._hass.navigate === "function") {
      this._hass.navigate(path);
      return;
    }
    // Method 2: Fire location-changed event (works in HA Tools panel)
    try {
      const event = new CustomEvent("location-changed", { detail: { replace: false } });
      window.history.pushState(null, "", path);
      window.dispatchEvent(event);
      return;
    } catch (e) {
      console.warn("pushState navigation failed:", e);
    }
    // Method 3: Direct URL change (last resort)
    window.location.href = path;
  }

  async _toggleAutomation(entityId, enable) {
    if (!this._hass) return;
    try {
      await this._hass.callService("automation", enable ? "turn_on" : "turn_off", {
        entity_id: entityId
      });
      // Refresh data after toggle
      setTimeout(() => this._loadAndRender(), 1000);
    } catch (e) {
      console.error("Failed to toggle automation:", e);
    }
  }

  render() {
    if (!this._hass) return;
    const styles = `
      
/* ===== BENTO DESIGN SYSTEM (local fallback) ===== */

:host {
  --bento-primary: #3B82F6;
  --bento-primary-hover: #2563EB;
  --bento-primary-light: rgba(59, 130, 246, 0.08);
  --bento-success: #10B981;
  --bento-success-light: rgba(16, 185, 129, 0.08);
  --bento-error: #EF4444;
  --bento-error-light: rgba(239, 68, 68, 0.08);
  --bento-warning: #F59E0B;
  --bento-warning-light: rgba(245, 158, 11, 0.08);
  --bento-bg: var(--primary-background-color, #F8FAFC);
  --bento-card: var(--card-background-color, #FFFFFF);
  --bento-border: var(--divider-color, #E2E8F0);
  --bento-text: var(--primary-text-color, #1E293B);
  --bento-text-secondary: var(--secondary-text-color, #64748B);
  --bento-text-muted: var(--disabled-text-color, #94A3B8);
  --bento-radius-xs: 6px;
  --bento-radius-sm: 10px;
  --bento-radius-md: 16px;
  --bento-shadow-sm: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06);
  --bento-shadow-md: 0 4px 12px rgba(0,0,0,0.05), 0 2px 4px rgba(0,0,0,0.04);
  --bento-shadow-lg: 0 8px 25px rgba(0,0,0,0.06), 0 4px 10px rgba(0,0,0,0.04);
  --bento-transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

:host {
        display: block;
        --aa-font: var(--ha-font-family-body, var(--mdc-typography-body1-font-family, Roboto, Noto, sans-serif));
        --aa-radius: var(--bento-radius-sm);
        --aa-space-1: var(--ha-space-1, 4px);
        --aa-space-2: var(--ha-space-2, 8px);
        --aa-space-3: var(--ha-space-3, 12px);
        --aa-space-4: var(--ha-space-4, 16px);
        --aa-space-6: var(--ha-space-6, 24px);
        --aa-border: var(--bento-border);
        --aa-text: var(--bento-text);
        --aa-text2: var(--bento-text-secondary);
        --aa-bg: var(--bento-bg);
        --aa-card: var(--bento-card);
        --aa-primary: var(--bento-primary);
        --aa-success: var(--bento-success);
        --aa-warning: var(--bento-warning);
        --aa-danger: var(--bento-error);
        --aa-info: var(--info-color, var(--accent-color, #3B82F6));
        --aa-anim: var(--ha-animation-duration-normal, 250ms);
      }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      .card {
        padding: var(--aa-space-6);
        font-family: var(--aa-font);
        background: var(--bento-bg);
        color: var(--bento-text);
        min-height: 200px;
      }
      .header {
        margin-bottom: var(--aa-space-6);
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: var(--aa-space-3);
      }
      .header-left { flex: 1; min-width: 200px; }
      h1 {
        font-size: 20px;
        font-weight: 600;
        margin-bottom: var(--aa-space-1);
        color: var(--bento-text);
      }
      .subtitle {
        font-size: 12px;
        color: var(--bento-text-secondary);
        display: flex;
        gap: var(--aa-space-2);
        align-items: center;
      }
      .loading-spinner {
        display: inline-block; width: 12px; height: 12px;
        border: 2px solid rgba(255,255,255,0.3); border-radius: 50%;
        border-top-color: white; animation: spin 0.8s linear infinite;
        margin-right: var(--aa-space-1);
      }
      @keyframes spin { to { transform: rotate(360deg); } }
      .tabs {
        display: flex;
        gap: var(--aa-space-2);
        border-bottom: 2px solid var(--bento-border);
        margin-bottom: var(--aa-space-6);
        overflow-x: auto;
        flex-wrap: wrap;
      }
      .tab-btn {
        padding: var(--aa-space-3) var(--aa-space-4);
        border: none; background: none; cursor: pointer;
        font-size: 14px; font-weight: 500;
        font-family: var(--aa-font);
        color: var(--bento-text-secondary);
        border-bottom: 2px solid transparent;
        transition: all var(--aa-anim);
        border-radius: 4px 4px 0 0;
        white-space: nowrap;
      }
      .tab-btn.active {
        color: var(--bento-primary);
        border-bottom-color: var(--bento-primary);
        background: color-mix(in srgb, var(--bento-primary) 8%, transparent);
      }
      .tab-btn:hover {
        color: var(--bento-text);
        background: color-mix(in srgb, var(--bento-text) 4%, transparent);
      }
      .tab-content { display: none; }
      .tab-content.active { display: block; animation: fadeIn var(--aa-anim); }
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      .card {
        background: var(--bento-card);
        border-radius: var(--bento-radius-sm);
        padding: var(--aa-space-4);
        border: 1px solid var(--bento-border);
        margin-bottom: var(--aa-space-4);
        box-shadow: 0 1px 3px rgba(0,0,0,0.06);
      }
      .card-title {
        font-size: 14px; font-weight: 600;
        margin-bottom: var(--aa-space-3);
        color: var(--bento-text);
      }
      .canvas-wrap { position: relative; height: 250px; margin-bottom: var(--aa-space-4); }
      canvas { width: 100% !important; }
      .stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
        gap: var(--aa-space-3);
        margin-top: var(--aa-space-4);
      }
      .stat {
        background: var(--bento-card);
        padding: var(--aa-space-3);
        border-radius: var(--bento-radius-sm);
        text-align: center;
        border: 1px solid var(--bento-border);
      }
      .stat-value { font-size: 22px; font-weight: 700; color: var(--bento-primary); }
      .stat-label { font-size: 11px; color: var(--bento-text-secondary); margin-top: 2px; }
      .health-row {
        display: flex; align-items: center; gap: var(--aa-space-3);
        margin-bottom: var(--aa-space-4);
      }
      .health-circle {
        width: 56px; height: 56px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        font-weight: 700; font-size: 20px; color: white; flex-shrink: 0;
      }
      .health-circle.excellent { background: var(--bento-success); }
      .health-circle.good { background: var(--bento-warning); }
      .health-circle.poor { background: var(--aa-danger); }
      .health-label { font-size: 12px; color: var(--bento-text-secondary); }
      .auto-list { display: flex; flex-direction: column; gap: 6px; }
      .auto-item {
        display: flex; align-items: center; gap: var(--aa-space-2);
        padding: 10px var(--aa-space-4);
        background: var(--bento-card);
        border: 1px solid var(--bento-border);
        border-radius: var(--bento-radius-sm);
        cursor: pointer;
        transition: all var(--aa-anim);
      }
      .auto-item:hover {
        border-color: var(--bento-primary);
        background: color-mix(in srgb, var(--bento-primary) 4%, var(--bento-card));
      }
      .auto-name {
        font-size: 13px; font-weight: 500; color: var(--bento-text);
        flex: 1; min-width: 0; overflow: hidden;
        text-overflow: ellipsis; white-space: nowrap;
      }
      .auto-meta { font-size: 11px; color: var(--bento-text-secondary); white-space: nowrap; }
      .badge {
        font-size: 11px; font-weight: 600;
        padding: 3px 8px; border-radius: 999px;
        flex-shrink: 0; white-space: nowrap;
      }
      .badge-warn { background: #fef3c7; color: #92400e; }
      .badge-error { background: #fee2e2; color: #991b1b; }
      .badge-info { background: #dbeafe; color: #1e40af; }
      .badge-ok { background: #d1fae5; color: #065f46; }
      .badge-stale { background: #f3e8ff; color: #6b21a8; }
      .auto-arrow { color: var(--bento-text-secondary); font-size: 14px; }
      .toggle-btn {
        padding: 3px 10px; border-radius: 4px; border: 1px solid var(--bento-border);
        background: var(--bento-card); color: var(--bento-primary);
        font-size: 11px; font-weight: 500; cursor: pointer;
        transition: all var(--aa-anim); flex-shrink: 0;
      }
      .toggle-btn:hover { background: var(--bento-primary); color: white; }
      .opt-summary {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
        gap: var(--aa-space-3);
        margin-bottom: var(--aa-space-6);
      }
      .opt-stat {
        padding: var(--aa-space-3);
        border-radius: var(--bento-radius-sm);
        text-align: center; border: 1px solid;
      }
      .opt-stat.warn { background: var(--aa-warn-bg, #fef3c7); border-color: var(--aa-warn-border, #fcd34d); }
      .opt-stat.error { background: var(--aa-error-bg, #fee2e2); border-color: var(--aa-error-border, #fca5a5); }
      .opt-stat.info { background: var(--aa-info-bg, #dbeafe); border-color: var(--aa-info-border, #93c5fd); }
      .opt-stat.stale { background: var(--aa-stale-bg, #f3e8ff); border-color: var(--aa-stale-border, #c4b5fd); }
      .opt-stat-value { font-size: 22px; font-weight: 700; }
      .opt-stat.warn .opt-stat-value { color: var(--aa-warn-text, #92400e); }
      .opt-stat.error .opt-stat-value { color: var(--aa-error-text, #991b1b); }
      .opt-stat.info .opt-stat-value { color: var(--aa-info-text, #1e40af); }
      .opt-stat.stale .opt-stat-value { color: var(--aa-stale-text, #6b21a8); }
      .opt-stat-label { font-size: 11px; color: var(--bento-text-secondary); margin-top: 2px; }
      .opt-section { margin-bottom: var(--aa-space-6); }
      .opt-section .card-title { margin-bottom: var(--aa-space-3); }
      .empty-state {
        text-align: center; padding: var(--aa-space-6) var(--aa-space-4);
        color: var(--bento-text-secondary); font-size: 13px;
        background: var(--bento-card); border: 1px solid var(--bento-border);
        border-radius: var(--bento-radius-sm);
      }
      .loading-state {
        text-align: center; padding: var(--aa-space-6);
        color: var(--bento-text-secondary);
      }
      .loading-state .loading-spinner {
        width: 24px; height: 24px;
        border-width: 3px; margin: 0 auto 12px;
        border-color: rgba(0,0,0,0.1); border-top-color: var(--bento-primary);
      }
      .chart-empty {
        display: flex; align-items: center; justify-content: center;
        height: 200px; color: var(--bento-text-secondary); font-size: 13px;
        border: 1px dashed var(--bento-border); border-radius: var(--bento-radius-sm);
      }
      .loading-toast {
        display: flex; align-items: center; gap: var(--aa-space-2);
        padding: var(--aa-space-2) var(--aa-space-4);
        background: color-mix(in srgb, var(--bento-primary) 10%, var(--bento-card));
        border: 1px solid color-mix(in srgb, var(--bento-primary) 30%, var(--bento-border));
        border-radius: var(--bento-radius-sm); margin-bottom: var(--aa-space-3);
        font-size: 12px; color: var(--bento-text-secondary); line-height: 1.4;
        animation: fadeIn var(--aa-anim);
      }
      .loading-toast .loading-spinner {
        border-color: color-mix(in srgb, var(--bento-primary) 20%, transparent);
        border-top-color: var(--bento-primary);
      }
      .trace-notice {
        display: flex; align-items: flex-start; gap: var(--aa-space-3);
        padding: var(--aa-space-3) var(--aa-space-4);
        background: color-mix(in srgb, var(--bento-primary) 8%, var(--bento-card));
        border: 1px solid color-mix(in srgb, var(--bento-primary) 25%, var(--bento-border));
        border-radius: var(--bento-radius-sm); margin-bottom: var(--aa-space-4);
        font-size: 13px; color: var(--bento-text); line-height: 1.5;
      }
      .trace-notice-icon { font-size: 18px; flex-shrink: 0; margin-top: 1px; }
      .trace-notice a {
        color: var(--bento-primary); text-decoration: underline;
        cursor: pointer; font-weight: 500;
      }
      .trace-notice a:hover { opacity: 0.8; }
      .trace-notice-dismiss {
        margin-left: auto; background: none; border: none;
        color: var(--bento-text-secondary); cursor: pointer; font-size: 16px;
        padding: 0 4px; line-height: 1; flex-shrink: 0;
      }
      .trace-notice-dismiss:hover { color: var(--bento-text); }
      .trace-notice-global {
        display: flex; align-items: flex-start; gap: var(--aa-space-3);
        padding: var(--aa-space-3) var(--aa-space-4);
        background: color-mix(in srgb, var(--bento-primary) 8%, var(--bento-card));
        border: 1px solid color-mix(in srgb, var(--bento-primary) 25%, var(--bento-border));
        border-radius: var(--bento-radius-sm); margin-bottom: var(--aa-space-4);
        font-size: 12px; color: var(--bento-text); line-height: 1.5;
      }
      .trace-notice-global .trace-notice-icon { font-size: 16px; flex-shrink: 0; margin-top: 1px; }
      .trace-notice-global a { color: var(--bento-primary); text-decoration: underline; cursor: pointer; font-weight: 500; }
      .trace-notice-global a:hover { opacity: 0.8; }
      .trace-notice-global .detail { color: var(--bento-text-secondary); font-size: 11px; margin-top: 2px; }
      .filter-bar {
        display: flex; flex-wrap: wrap; gap: var(--aa-space-2);
        margin-bottom: var(--aa-space-4); align-items: center;
      }
      .filter-bar input[type="text"] {
        flex: 1; min-width: 160px; padding: 7px 12px;
        border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm);
        background: var(--bento-card); color: var(--bento-text);
        font-size: 13px; font-family: var(--aa-font);
        outline: none; transition: border-color var(--aa-anim);
      }
      .filter-bar input[type="text"]:focus { border-color: var(--bento-primary); }
      .filter-bar input[type="text"]::placeholder { color: var(--bento-text-secondary); }
      .filter-bar select {
        padding: 7px 28px 7px 10px; border: 1px solid var(--bento-border);
        border-radius: var(--bento-radius-sm); background: var(--bento-card); color: var(--bento-text);
        font-size: 12px; font-family: var(--aa-font); cursor: pointer;
        appearance: none; -webkit-appearance: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%2364748b'/%3E%3C/svg%3E");
        background-repeat: no-repeat; background-position: right 8px center;
      }
      .filter-bar select:focus { border-color: var(--bento-primary); outline: none; }
      .filter-bar .sort-dir-btn {
        padding: 6px 8px; border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm);
        background: var(--bento-card); color: var(--bento-text-secondary); cursor: pointer;
        font-size: 14px; line-height: 1; transition: all var(--aa-anim);
      }
      .filter-bar .sort-dir-btn:hover { border-color: var(--bento-primary); color: var(--bento-primary); }
      .auto-list-full { display: flex; flex-direction: column; gap: 4px; max-height: 460px; overflow-y: auto; }
      .auto-list-full::-webkit-scrollbar { width: 4px; }
      .auto-list-full::-webkit-scrollbar-thumb { background: var(--bento-border); border-radius: 4px; }
      .auto-item-full {
        display: flex; align-items: center; gap: var(--aa-space-2);
        padding: 8px var(--aa-space-3);
        background: var(--bento-card); border: 1px solid var(--bento-border);
        border-radius: var(--bento-radius-sm); cursor: pointer;
        transition: all var(--aa-anim); font-size: 13px;
      }
      .auto-item-full:hover {
        border-color: var(--bento-primary);
        background: color-mix(in srgb, var(--bento-primary) 4%, var(--bento-card));
      }
      .auto-item-full .auto-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; color: var(--bento-text); }
      .auto-item-full .auto-detail { font-size: 11px; color: var(--bento-text-secondary); white-space: nowrap; min-width: 50px; text-align: right; }
      .auto-item-full .auto-state-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
      .auto-item-full .auto-state-dot.on { background: var(--bento-success); }
      .auto-item-full .auto-state-dot.off { background: var(--bento-text-secondary); opacity: 0.4; }
      .auto-item-full .auto-state-dot.error { background: var(--aa-danger); }
      .filter-results-count { font-size: 11px; color: var(--bento-text-secondary); padding: 2px 0; }
      /* === PAGINATION STYLES === */
      .pagination {
        display: flex; align-items: center; gap: 8px; margin-top: 12px;
        padding: 12px; background: var(--bento-card); border: 1px solid var(--bento-border);
        border-radius: var(--bento-radius-sm); flex-wrap: wrap;
      }
      .pagination-btn {
        padding: 6px 12px; background: var(--bento-card); border: 1px solid var(--bento-border);
        border-radius: var(--bento-radius-sm); color: var(--bento-primary); font-size: 12px;
        cursor: pointer; transition: all var(--aa-anim); font-weight: 500;
      }
      .pagination-btn:hover:not([disabled]) { background: var(--bento-primary); color: white; }
      .pagination-btn[disabled] { opacity: 0.5; cursor: not-allowed; color: var(--bento-text-secondary); }
      .pagination-info {
        font-size: 12px; color: var(--bento-text-secondary); font-weight: 500;
        min-width: 120px; text-align: center;
      }
      .page-size-select {
        padding: 6px 28px 6px 8px; border: 1px solid var(--bento-border);
        border-radius: var(--bento-radius-sm); background: var(--bento-card); color: var(--bento-text);
        font-size: 12px; cursor: pointer; appearance: none; -webkit-appearance: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%2364748b'/%3E%3C/svg%3E");
        background-repeat: no-repeat; background-position: right 8px center;
      }
      .page-size-select:focus { border-color: var(--bento-primary); outline: none; }
      /* === CHART RESPONSIVE FIX === */
      .canvas-wrap {
        position: relative; height: 250px; margin-bottom: var(--aa-space-4);
        width: 100%; overflow: hidden;
      }
    `;

    const totalActive = Array.from(this.automationStats.values()).filter(a => a.state === "on").length;
    const stats = {
      total: this.automationStats.size,
      active: totalActive,
      disabled: this.disabledAutomations.length,
      failed: this.failedAutomations.size,
      avgTime: this.executionTimes.length > 0
        ? (this.executionTimes.reduce((a, b) => a + b, 0) / this.executionTimes.length).toFixed(0)
        : "N/A"
    };
    const healthScore = this._calculateHealthScore();
    const healthClass = healthScore >= 75 ? "excellent" : healthScore >= 50 ? "good" : "poor";
    const healthText = healthScore >= 75 ? this._t.excellent : healthScore >= 50 ? this._t.good : this._t.needsImprovement;

    // --- OVERVIEW TAB ---
    // --- Filter and sort the full automation list ---
    const allAutos = Array.from(this.automationStats.values());
    let filteredAutos = allAutos;

    // Text filter
    if (this._filterText) {
      const q = this._filterText.toLowerCase();
      filteredAutos = filteredAutos.filter(a => a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q) || (a.primaryTrigger && a.primaryTrigger.toLowerCase().includes(q)));
    }

    // Time range filter
    if (this._timeRange !== "all") {
      const days = parseInt(this._timeRange, 10);
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      filteredAutos = filteredAutos.filter(a => a.lastTriggered && a.lastTriggered.getTime() >= cutoff);
    }

    // Sort
    const sortDir = this._sortDir === "asc" ? 1 : -1;
    filteredAutos.sort((a, b) => {
      switch (this._sortBy) {
        case "name": return sortDir * a.name.localeCompare(b.name, "pl");
        case "lastTriggered": {
          const at = a.lastTriggered ? a.lastTriggered.getTime() : 0;
          const bt = b.lastTriggered ? b.lastTriggered.getTime() : 0;
          return sortDir * (at - bt);
        }
        case "todayCount": return sortDir * ((a.todayCount || 0) - (b.todayCount || 0));
        case "avgTime": {
          const at = typeof a.avgExecutionTime === "number" ? a.avgExecutionTime : 99999;
          const bt = typeof b.avgExecutionTime === "number" ? b.avgExecutionTime : 99999;
          return sortDir * (at - bt);
        }
        case "state": return sortDir * a.state.localeCompare(b.state);
        default: return 0;
      }
    });

    let activeTabContent = '';

    // Only build content for the active tab
    if (this.currentTab === 'overview') {
      const filteredListHtml = filteredAutos.length > 0
        ? filteredAutos.map(a => {
            const stateClass = a.isFailed ? "error" : a.state === "on" ? "on" : "off";
            const timeStr = this._formatTimeSince(a.lastTriggered);
            const execStr = typeof a.avgExecutionTime === "number" ? `${a.avgExecutionTime}ms` : "";
            const countStr = a.todayCount > 0 ? `${a.todayCount}\u00d7` : "";
            return `<div class="auto-item-full" data-automation-id="${a.automationId}">
              <span class="auto-state-dot ${stateClass}"></span>
              <span class="auto-name" title="${_esc(a.name)}">${_esc(a.name)}</span>
              ${countStr ? `<span class="auto-detail" title="${this._t.todayCount}">${countStr}</span>` : ""}
              ${execStr ? `<span class="auto-detail" title="${this._t.averageTime}">${execStr}</span>` : ""}
              <span class="auto-detail">${timeStr}</span>
            </div>`;
          }).join("")
        : `<div class="empty-state">${this._t.noAutomationsMatching}</div>`;

      activeTabContent = `
        <div class="health-row">
          <div class="health-circle ${healthClass}">${healthScore}</div>
          <div>
            <div class="card-title">${this._t.systemHealth}</div>
            <div class="health-label">${healthText}</div>
          </div>
        </div>
        <div class="stats">
          <div class="stat">
            <div class="stat-value">${stats.total}</div>
            <div class="stat-label">${this._t.totalLabel}</div>
          </div>
          <div class="stat">
            <div class="stat-value">${stats.active}</div>
            <div class="stat-label">${this._t.active}</div>
          </div>
          <div class="stat">
            <div class="stat-value">${stats.disabled}</div>
            <div class="stat-label">${this._t.disabledLabel}</div>
          </div>
          <div class="stat">
            <div class="stat-value">${stats.failed}</div>
            <div class="stat-label">${this._t.errorsLabel}</div>
          </div>
        </div>
        <div class="card" style="margin-top:var(--aa-space-4)">
          <h2 class="card-title">${this._t.automations}</h2>
          <div class="filter-bar">
            <input type="text" id="aa-filter-input" placeholder="${this._t.searchPlaceholder}" value="${this._filterText.replace(/"/g, "&quot;")}">
            <select id="aa-sort-select">
              <option value="lastTriggered" ${this._sortBy === "lastTriggered" ? "selected" : ""}>${this._t.lastTriggered}</option>
              <option value="name" ${this._sortBy === "name" ? "selected" : ""}>${this._t.name}</option>
              <option value="todayCount" ${this._sortBy === "todayCount" ? "selected" : ""}>${this._t.runsTodayOption}</option>
              <option value="avgTime" ${this._sortBy === "avgTime" ? "selected" : ""}>${this._t.executionTime}</option>
              <option value="state" ${this._sortBy === "state" ? "selected" : ""}>${this._t.state}</option>
            </select>
            <button class="sort-dir-btn" id="aa-sort-dir" title="${this._sortDir === "desc" ? this._t.descending : this._t.ascending}">${this._sortDir === "desc" ? "\u2193" : "\u2191"}</button>
            <select id="aa-time-range">
              <option value="all" ${this._timeRange === "all" ? "selected" : ""}>${this._t.allTime}</option>
              <option value="1" ${this._timeRange === "1" ? "selected" : ""}>${this._t.today}</option>
              <option value="7" ${this._timeRange === "7" ? "selected" : ""}>${this._t.sevenDays}</option>
              <option value="14" ${this._timeRange === "14" ? "selected" : ""}>${this._t.fourteenDays}</option>
              <option value="30" ${this._timeRange === "30" ? "selected" : ""}>${this._t.thirtyDays}</option>
            </select>
          </div>
          <div class="filter-results-count">${filteredAutos.length} ${this._lang === 'pl' ? 'z' : 'of'} ${allAutos.length} ${this._t.automations}</div>
          <div class="auto-list-full">${filteredListHtml}</div>
        </div>
        <div class="card">
          <h2 class="card-title">${this._t.mostActiveTodayTitle}</h2>
          <div class="canvas-wrap">
            <canvas id="top-automations-chart"></canvas>
          </div>
        </div>
      `;
    } else if (this.currentTab === 'performance') {
      const hasExecData = this.executionTimes.length > 0;
      const hasTriggerData = this.triggerTypes.size > 0;

      activeTabContent = `
        <div class="card">
          <h2 class="card-title">${this._t.executionTimeDistribution}</h2>
          ${hasExecData
            ? '<div class="canvas-wrap"><canvas id="exec-dist-chart"></canvas></div>'
            : `<div class="chart-empty">${this._t.noExecutionTimeData}</div>`}
        </div>
        <div class="card">
          <h2 class="card-title">${this._t.triggerTypesTitle}</h2>
          ${hasTriggerData
            ? '<div class="canvas-wrap"><canvas id="trigger-type-chart"></canvas></div>'
            : `<div class="chart-empty">${this._t.noTriggerData}</div>`}
        </div>
        <div class="card">
          <h2 class="card-title">${this._t.dailyExecutions}</h2>
          <div class="canvas-wrap"><canvas id="sparkline-chart"></canvas></div>
        </div>
        <div class="card">
          <h2 class="card-title">${this._t.statistics}</h2>
          <div class="stats">
            <div class="stat">
              <div class="stat-value">${stats.avgTime}${typeof stats.avgTime === "string" ? "" : "ms"}</div>
              <div class="stat-label">${this._t.avgTimeLabel}</div>
            </div>
            <div class="stat">
              <div class="stat-value">${this.executionTimes.length}</div>
              <div class="stat-label">${this._t.withTimeData}</div>
            </div>
            <div class="stat">
              <div class="stat-value">${this.triggerTypes.size}</div>
              <div class="stat-label">${this._t.triggerTypes}</div>
            </div>
          </div>
        </div>
      `;
    } else if (this.currentTab === 'optimization') {
      const optData = this.getOptimizationData();

      // Paginate each list
      const slowPaginated = this._paginateItems(optData.slow, 'opt-slow');
      const failedPaginated = this._paginateItems(optData.failed, 'opt-failed');
      const disabledPaginated = this._paginateItems(optData.disabled, 'opt-disabled');
      const stalePaginated = this._paginateItems(optData.stale, 'opt-stale');

      const slowItems = slowPaginated.length > 0
        ? slowPaginated.map(a => `
            <div class="auto-item" data-automation-id="${a.automationId}">
              <span class="auto-name" title="${_esc(a.name)}">${_esc(a.name)}</span>
              <span class="badge badge-warn">${Math.round(a.avgExecutionTime)}ms</span>
              <span class="auto-arrow">\u203A</span>
            </div>`).join("")
        : `<div class="empty-state">${this._t.noSlowAutomations}</div>`;

      const failedItems = failedPaginated.length > 0
        ? failedPaginated.map(a => `
            <div class="auto-item" data-automation-id="${a.automationId}">
              <span class="auto-name" title="${_esc(a.name)}">${_esc(a.name)}</span>
              <span class="badge badge-error">${a.reason || this._t.errorBadge}</span>
              <span class="auto-arrow">\u203A</span>
            </div>`).join("")
        : `<div class="empty-state">${this._t.noFailedLabel}</div>`;

      const disabledItems = disabledPaginated.length > 0
        ? disabledPaginated.map(a => `
            <div class="auto-item" data-automation-id="${a.automationId}">
              <span class="auto-name" title="${_esc(a.name)}">${_esc(a.name)}</span>
              <span class="badge badge-info">${this._t.disabledBadge}</span>
              <button class="toggle-btn" data-entity-id="${_esc(a.id)}" data-action="enable">${this._t.enableButton}</button>
              <span class="auto-arrow">\u203A</span>
            </div>`).join("")
        : `<div class="empty-state">${this._t.noDisabledLabel}</div>`;

      const staleItems = stalePaginated.length > 0
        ? stalePaginated.map(a => `
            <div class="auto-item" data-automation-id="${a.automationId}">
              <span class="auto-name" title="${_esc(a.name)}">${_esc(a.name)}</span>
              <span class="badge badge-stale">${this._formatTimeSince(a.lastTriggered)}</span>
              <span class="auto-arrow">\u203A</span>
            </div>`).join("")
        : `<div class="empty-state">${this._t.noStaleLabel}</div>`;

      activeTabContent = `
        <div class="opt-summary">
          <div class="opt-stat warn">
            <div class="opt-stat-value">${optData.slow.length}</div>
            <div class="opt-stat-label">${this._t.slowStat}</div>
          </div>
          <div class="opt-stat error">
            <div class="opt-stat-value">${optData.failed.length}</div>
            <div class="opt-stat-label">${this._t.withErrorsStat}</div>
          </div>
          <div class="opt-stat info">
            <div class="opt-stat-value">${optData.disabled.length}</div>
            <div class="opt-stat-label">${this._t.disabledStat}</div>
          </div>
          <div class="opt-stat stale">
            <div class="opt-stat-value">${optData.stale.length}</div>
            <div class="opt-stat-label">${this._t.inactiveStat}</div>
          </div>
        </div>
        <div class="opt-section">
          <h2 class="card-title">${this._t.slowAutomationsTitle}</h2>
          <div class="auto-list">${slowItems}</div>
          ${optData.slow.length > 0 ? this._renderPagination('opt-slow', optData.slow.length) : ''}
        </div>
        <div class="opt-section">
          <h2 class="card-title">${this._t.failedAutomationsTitle}</h2>
          <div class="auto-list">${failedItems}</div>
          ${optData.failed.length > 0 ? this._renderPagination('opt-failed', optData.failed.length) : ''}
        </div>
        <div class="opt-section">
          <h2 class="card-title">${this._t.disabledAutomationsTitle}</h2>
          <div class="auto-list">${disabledItems}</div>
          ${optData.disabled.length > 0 ? this._renderPagination('opt-disabled', optData.disabled.length) : ''}
        </div>
        <div class="opt-section">
          <h2 class="card-title">${this._t.inactiveAutomationsTitle}</h2>
          <div class="auto-list">${staleItems}</div>
          ${optData.stale.length > 0 ? this._renderPagination('opt-stale', optData.stale.length) : ''}
        </div>
      `;
    }

    const loadingContent = `
      <div class="loading-state">
        <div class="loading-spinner"></div>
        <div>${this._t.loadingData}</div>
      </div>
    `;

    const loadingToast = this._loadingPhase ? `
        <div class="loading-toast">
          <span class="loading-spinner"></span>
          <span>${this._loadingPhase}</span>
        </div>
      ` : "";

    // Show content even during loading (progressive rendering), with toast on top
    const hasData = this.automationStats.size > 0;
    const mainContent = (!hasData && this._isLoading)
      ? loadingContent
      : `
        ${loadingToast}
        <div class="tab-content active">${activeTabContent}</div>
      `;

    this.shadowRoot.innerHTML = `
      <style>${window.HAToolsBentoCSS || ""}
/* === HA Tools split — premium banners (donate / intro / prereq) === */

/* Donation footer — diamond top */
.donate-section {  margin: 24px 0 4px; padding: 20px 24px; position: relative; overflow: hidden;  background: linear-gradient(135deg, rgba(99,102,241,0.06), rgba(236,72,153,0.06));  border: 1px solid rgba(99,102,241,0.18); border-radius: var(--bento-radius-md, 18px);  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 18px;  font-family: 'Inter', -apple-system, sans-serif;}
.donate-section::before {  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;  background: linear-gradient(90deg, #6366f1, #8b5cf6, #ec4899);}
.donate-section .donate-text { flex: 1; min-width: 240px; }
.donate-section h3 {  margin: 0 0 6px; font-size: 16px; font-weight: 700; letter-spacing: -0.02em;  background: linear-gradient(135deg, #6366f1, #ec4899);  -webkit-background-clip: text; background-clip: text; color: transparent;}
.donate-section p { margin: 0; font-size: 13px; line-height: 1.55; color: var(--bento-text-secondary, #57534e); letter-spacing: -0.005em; }
.donate-buttons { display: flex; gap: 10px; flex-wrap: wrap; }
.donate-btn {  display: inline-flex; align-items: center; gap: 6px; padding: 10px 18px;  border-radius: 12px; font-weight: 700; font-size: 13px; letter-spacing: -0.005em;  text-decoration: none; transition: transform 0.2s cubic-bezier(0.4,0,0.2,1), box-shadow 0.2s, filter 0.2s;  border: 1px solid transparent;}
.donate-btn:hover { transform: translateY(-2px); filter: brightness(1.05); }
.donate-btn.coffee {  background: linear-gradient(135deg, #FFDD00, #FFC700); color: #000;  box-shadow: 0 4px 14px -2px rgba(255, 221, 0, 0.4);}
.donate-btn.coffee:hover { box-shadow: 0 8px 24px -4px rgba(255, 221, 0, 0.55); }
.donate-btn.paypal {  background: linear-gradient(135deg, #0070ba, #005ea6); color: #fff;  box-shadow: 0 4px 14px -2px rgba(0, 112, 186, 0.45);}
.donate-btn.paypal:hover { box-shadow: 0 8px 24px -4px rgba(0, 112, 186, 0.6); }
@media (prefers-color-scheme: dark) {  .donate-section { background: linear-gradient(135deg, rgba(129,140,248,0.10), rgba(244,114,182,0.10)); border-color: rgba(129,140,248,0.25); }  .donate-section h3 { background: linear-gradient(135deg, #a5b4fc, #f9a8d4); -webkit-background-clip: text; background-clip: text; color: transparent; }  .donate-section p { color: #d6d3d1; } }
@media (max-width: 600px) {  .donate-section { flex-direction: column; text-align: center; padding: 18px; }  .donate-buttons { justify-content: center; width: 100%; } }

/* Prereq banner — premium */
.prereq-banner {  display: flex; align-items: flex-start; gap: 14px; padding: 16px 20px;  border-radius: var(--bento-radius-sm, 12px); margin: 0 0 16px;  font-size: 13px; line-height: 1.55; border: 1px solid;  font-family: 'Inter', sans-serif; letter-spacing: -0.005em;  position: relative; overflow: hidden;}
.prereq-banner::before {  content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px;}
.prereq-banner.prereq-error { background: rgba(239,68,68,0.06); border-color: rgba(239,68,68,0.25); color: #991b1b; }
.prereq-banner.prereq-error::before { background: linear-gradient(180deg, #ef4444, #f87171); }
.prereq-banner.prereq-info  { background: rgba(99,102,241,0.06); border-color: rgba(99,102,241,0.25); color: #4338ca; }
.prereq-banner.prereq-info::before  { background: linear-gradient(180deg, #6366f1, #8b5cf6); }
.prereq-banner .prereq-icon { font-size: 22px; line-height: 1; padding-top: 2px; flex-shrink: 0; }
.prereq-banner .prereq-text { flex: 1; min-width: 0; }
.prereq-banner .prereq-text strong { font-weight: 700; letter-spacing: -0.01em; }
.prereq-banner code {  background: rgba(0,0,0,0.06); padding: 1px 7px; border-radius: 5px;  font-size: 12px; font-family: 'JetBrains Mono', ui-monospace, monospace;  border: 1px solid rgba(0,0,0,0.08);}
.prereq-banner .prereq-cta {  display: inline-flex; align-items: center; padding: 8px 16px; border-radius: 10px;  background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #fff !important;  text-decoration: none; font-weight: 700; font-size: 12.5px; flex-shrink: 0;  letter-spacing: -0.005em;  box-shadow: 0 4px 14px -2px rgba(99,102,241,0.45);  transition: all 0.2s cubic-bezier(0.4,0,0.2,1);}
.prereq-banner .prereq-cta:hover { transform: translateY(-1px); box-shadow: 0 8px 24px -4px rgba(99,102,241,0.6); }
@media (prefers-color-scheme: dark) {  .prereq-banner.prereq-error { background: rgba(248,113,113,0.10); border-color: rgba(248,113,113,0.30); color: #fca5a5; }  .prereq-banner.prereq-info  { background: rgba(129,140,248,0.10); border-color: rgba(129,140,248,0.30); color: #c7d2fe; }  .prereq-banner code { background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.10); } }
@media (max-width: 600px) {  .prereq-banner { flex-direction: column; align-items: stretch; padding-left: 20px; }  .prereq-banner .prereq-cta { align-self: flex-start; } }

/* First-run intro banner — premium */
.intro-banner {  position: relative; padding: 18px 52px 18px 22px; margin: 0 0 18px;  background: linear-gradient(135deg, rgba(99,102,241,0.08), rgba(236,72,153,0.06));  border: 1px solid rgba(99,102,241,0.20);  border-radius: var(--bento-radius-sm, 12px);  font-size: 13px; line-height: 1.55; overflow: hidden;  font-family: 'Inter', sans-serif; letter-spacing: -0.005em;  animation: bentoSlideIn 0.4s cubic-bezier(0.4, 0, 0.2, 1);}
.intro-banner::before {  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;  background: linear-gradient(90deg, #6366f1, #8b5cf6, #ec4899);}
.intro-banner .intro-headline {  font-weight: 700; font-size: 14.5px; margin-bottom: 10px; letter-spacing: -0.02em;  background: linear-gradient(135deg, #6366f1, #ec4899);  -webkit-background-clip: text; background-clip: text; color: transparent;  display: flex; align-items: center; gap: 8px;}
.intro-banner .intro-steps {  margin: 8px 0 0; padding: 0; list-style: none; counter-reset: introstep;}
.intro-banner .intro-steps li {  margin-bottom: 8px; line-height: 1.55; color: var(--bento-text, #0c0a09);  padding-left: 32px; position: relative; counter-increment: introstep;  font-size: 12.5px;}
.intro-banner .intro-steps li::before {  content: counter(introstep); position: absolute; left: 0; top: -1px;  width: 22px; height: 22px; border-radius: 50%;  background: var(--bento-card, #fff); border: 1px solid rgba(99,102,241,0.25);  display: flex; align-items: center; justify-content: center;  font-size: 11px; font-weight: 800; color: #6366f1;  font-family: 'JetBrains Mono', ui-monospace, monospace;  font-feature-settings: 'tnum' 1;}
.intro-banner .intro-dismiss {  position: absolute; top: 12px; right: 14px;  background: var(--bento-card, transparent); border: 1px solid var(--bento-border, transparent);  cursor: pointer; font-size: 14px; line-height: 1;  color: var(--bento-text-secondary, #64748B);  padding: 4px 8px; border-radius: 999px;  transition: all 0.15s ease;}
.intro-banner .intro-dismiss:hover {  background: var(--bento-bg-2, #e7e5e4); color: var(--bento-text, #0c0a09);  transform: rotate(90deg);}
@media (prefers-color-scheme: dark) {  .intro-banner { background: linear-gradient(135deg, rgba(129,140,248,0.14), rgba(244,114,182,0.10)); border-color: rgba(129,140,248,0.30); }  .intro-banner .intro-headline { background: linear-gradient(135deg, #a5b4fc, #f9a8d4); -webkit-background-clip: text; background-clip: text; color: transparent; }  .intro-banner .intro-steps li { color: #fafaf9; }  .intro-banner .intro-steps li::before { background: #16161f; border-color: rgba(129,140,248,0.35); color: #a5b4fc; }  .intro-banner .intro-dismiss { background: #16161f; border-color: #27272f; color: #d6d3d1; }  .intro-banner .intro-dismiss:hover { background: #27272f; color: #fafaf9; } }

${styles}
/* === DARK MODE === */
@media (prefers-color-scheme: dark) {
  :host {
    --bento-bg: var(--primary-background-color, #1a1a2e);
    --bento-card: var(--card-background-color, #16213e);
    --bento-text: var(--primary-text-color, #e2e8f0);
    --bento-text-secondary: var(--secondary-text-color, #94a3b8);
    --bento-border: var(--divider-color, #334155);
    --bento-shadow-sm: 0 1px 3px rgba(0,0,0,0.3);
    --bento-shadow-md: 0 4px 12px rgba(0,0,0,0.4);
  }
}
@media (prefers-color-scheme: dark) {
  :host {
    --aa-warn-bg: rgba(245,158,11,0.15); --aa-warn-border: rgba(245,158,11,0.3); --aa-warn-text: #fbbf24;
    --aa-error-bg: rgba(239,68,68,0.15); --aa-error-border: rgba(239,68,68,0.3); --aa-error-text: #f87171;
    --aa-info-bg: rgba(59,130,246,0.15); --aa-info-border: rgba(59,130,246,0.3); --aa-info-text: #60a5fa;
    --aa-stale-bg: rgba(139,92,246,0.15); --aa-stale-border: rgba(139,92,246,0.3); --aa-stale-text: #a78bfa;
  }
  .badge-stale { background: rgba(139,92,246,0.15); color: #a78bfa; }
}

        /* === MOBILE FIX === */
        @media (max-width: 768px) {
          .tabs { flex-wrap: nowrap; overflow-x: auto; -webkit-overflow-scrolling: touch; gap: 2px; }
          .tab, .tab-btn, .tab-btn { padding: 6px 10px; font-size: 12px; white-space: nowrap; }
          .card, .card-container { padding: 14px; }
          .stats, .stats-grid, .summary-grid, .stat-cards, .kpi-grid, .metrics-grid { grid-template-columns: repeat(2, 1fr); gap: 8px; }
          .stat-val, .kpi-val, .metric-val { font-size: 18px; }
          .stat-lbl, .kpi-lbl, .metric-lbl { font-size: 10px; }
          .panels, .board { flex-direction: column; }
          .column { min-width: unset; }
          h2 { font-size: 18px; }
          h3 { font-size: 15px; }
          .canvas-wrap { height: 280px; }
          .auto-name { max-width: 180px; }
          .pagination { gap: 6px; }
          .pagination-info { min-width: 100px; font-size: 11px; }
        }
        @media (max-width: 480px) {
          .tabs { gap: 1px; }
          .tab, .tab-btn, .tab-btn { padding: 5px 8px; font-size: 11px; }
          .stats, .stats-grid, .summary-grid, .stat-cards, .kpi-grid, .metrics-grid { grid-template-columns: 1fr 1fr; }
          .stat-val, .kpi-val, .metric-val { font-size: 16px; }
          .canvas-wrap { height: 240px; }
          .auto-name { max-width: 140px; font-size: 12px; }
          .pagination { gap: 4px; padding: 8px; flex-direction: column; align-items: stretch; }
          .pagination-btn { padding: 5px 8px; font-size: 11px; }
          .pagination-info { min-width: 100%; text-align: center; font-size: 11px; }
          .page-size-select { font-size: 11px; padding: 4px 24px 4px 6px; }
        }

</style>
      <div class="card">
        <div class="header">
          <div class="header-left">
            <h1>${_esc(this.config.title || '')}</h1>
            <p class="subtitle">
              <span>${this._t.lastUpdated}${this._formatLastUpdated()}</span>
              <span>\u2022</span>
              <span>${stats.total} ${this._t.automations}</span>
            </p>
          </div>
        
        </div>
        ${!this._traceNoticeDismissed ? `
        <div class="trace-notice-global" id="trace-storage-notice">
          <span class="trace-notice-icon">\u{1f4a1}</span>
          <div>
            ${this._t.tracesNotice}
            <div class="detail">${this._t.tracesNoticeDetail}</div>
          </div>
          <button class="trace-notice-dismiss" id="dismiss-trace-notice" title="${this._t.closeButton}" aria-label="${this._t.closeButton}">\u00d7</button>
        </div>
        ` : ""}
        <div class="tabs">
          <button class="tab-btn ${this.currentTab === "overview" ? "active" : ""}" data-tab="overview">${this._t.tabOverview}</button>
          <button class="tab-btn ${this.currentTab === "performance" ? "active" : ""}" data-tab="performance">${this._t.tabPerformance}</button>
          <button class="tab-btn ${this.currentTab === "optimization" ? "active" : ""}" data-tab="optimization">${this._t.tabOptimization}</button>
        </div>
        ${mainContent}
      </div>
    `;

    this._setupEventListeners();
    this._setupPaginationListeners();
    if (!this._isLoading) {
      this._drawCharts();
    }
  }

  _paginateItems(items, tabName) {
    if (!this._currentPage[tabName]) this._currentPage[tabName] = 1;
    const start = (this._currentPage[tabName] - 1) * this._pageSize;
    return items.slice(start, start + this._pageSize);
  }

  _renderPagination(tabName, totalItems) {
    if (!this._currentPage[tabName]) this._currentPage[tabName] = 1;
    const pageSize = this._pageSize;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const page = Math.min(this._currentPage[tabName], totalPages);
    this._currentPage[tabName] = page;
    return `
      <div class="pagination">
        <button class="pagination-btn" data-page-tab="${tabName}" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>&#8249; Prev</button>
        <span class="pagination-info">${page} / ${totalPages} (${totalItems})</span>
        <button class="pagination-btn" data-page-tab="${tabName}" data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>Next &#8250;</button>
        <select class="page-size-select" data-page-tab="${tabName}" data-action="page-size">
          ${[10,15,25,50].map(s => `<option value="${s}" ${s === pageSize ? 'selected' : ''}>${s}/page</option>`).join('')}
        </select>
      </div>`;
  }

  _setupPaginationListeners() {
    if (!this.shadowRoot) return;
    this.shadowRoot.querySelectorAll('.pagination-btn:not([disabled])').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = e.target.dataset.pageTab;
        const page = parseInt(e.target.dataset.page);
        if (tab && page > 0) {
          this._currentPage[tab] = page;
          this.render();
        }
      });
    });
    this.shadowRoot.querySelectorAll('.page-size-select').forEach(sel => {
      sel.addEventListener('change', (e) => {
        this._pageSize = parseInt(e.target.value);
        // Reset all pages to 1
        Object.keys(this._currentPage).forEach(k => this._currentPage[k] = 1);
        this.render();
      });
    });
  }

  _setupEventListeners() {
    // Tab switching
    this.shadowRoot.querySelectorAll(".tab-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        this.currentTab = e.target.dataset.tab;
        history.replaceState(null, '', location.pathname + '#' + this._toolId + '/' + this.currentTab);
        this.render();
      });
    });

    // Click handlers for automation items (navigate to edit)
    this.shadowRoot.querySelectorAll(".auto-item").forEach(item => {
      item.addEventListener("click", (e) => {
        // Don't navigate if clicking the toggle button
        if (e.target.classList.contains("toggle-btn")) return;
        const automationId = item.dataset.automationId;
        if (automationId) this._navigateToAutomation(automationId);
      });
    });

    // Trace notice: dismiss + link
    const dismissBtn = this.shadowRoot.getElementById("dismiss-trace-notice");
    if (dismissBtn) {
      dismissBtn.addEventListener("click", () => {
        this._traceNoticeDismissed = true;
        const notice = this.shadowRoot.getElementById("trace-storage-notice");
        if (notice) notice.remove();
      });
    }
    const traceLink = this.shadowRoot.getElementById("trace-viewer-link");
    if (traceLink) {
      traceLink.addEventListener("click", () => {
        // Navigate to Trace Viewer inside HA Tools panel
        try {
          let el = this;
          while (el) {
            const root = el.getRootNode ? el.getRootNode() : null;
            el = (root && root.host) ? root.host : el.parentNode;
            if (el && el.tagName && el.tagName.toLowerCase() === "ha-tools-panel") {
              if (typeof el._loadTool === "function") {
                el._loadTool("trace-viewer", "ha-trace-viewer");
                // Also update sidebar highlight
                const navItems = el.shadowRoot ? el.shadowRoot.querySelectorAll(".nav-item") : [];
                navItems.forEach(item => {
                  if (item.dataset && item.dataset.tool === "trace-viewer") {
                    if (typeof el._setActiveNav === "function") el._setActiveNav(item);
                  }
                });
                return;
              }
            }
            if (el === document || el === window || !el) break;
          }
          // Fallback: navigate to /ha-tools
          const evt = new CustomEvent("location-changed", { detail: { replace: false } });
          window.history.pushState(null, "", "/ha-tools");
          window.dispatchEvent(evt);
        } catch (e) { window.location.href = "/ha-tools"; }
      });
    }

    // Filter, sort, time range controls
    const filterInput = this.shadowRoot.getElementById("aa-filter-input");
    if (filterInput) {
      filterInput.addEventListener("input", (e) => {
        this._filterText = e.target.value;
        this._rerenderContent();
      });
    }
    const sortSelect = this.shadowRoot.getElementById("aa-sort-select");
    if (sortSelect) {
      sortSelect.addEventListener("change", (e) => {
        this._sortBy = e.target.value;
        this._rerenderContent();
      });
    }
    const sortDirBtn = this.shadowRoot.getElementById("aa-sort-dir");
    if (sortDirBtn) {
      sortDirBtn.addEventListener("click", () => {
        this._sortDir = this._sortDir === "desc" ? "asc" : "desc";
        this._rerenderContent();
      });
    }
    const timeRange = this.shadowRoot.getElementById("aa-time-range");
    if (timeRange) {
      timeRange.addEventListener("change", (e) => {
        this._timeRange = e.target.value;
        this._rerenderContent();
      });
    }

    // Click handlers for full automation list items
    this.shadowRoot.querySelectorAll(".auto-item-full").forEach(item => {
      item.addEventListener("click", () => {
        const automationId = item.dataset.automationId;
        if (automationId) this._navigateToAutomation(automationId);
      });
    });

    // Toggle buttons for disabled automations
    this.shadowRoot.querySelectorAll(".toggle-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const entityId = btn.dataset.entityId;
        const action = btn.dataset.action;
        if (entityId) this._toggleAutomation(entityId, action === "enable");
      });
    });
  }

  _rerenderContent() {
    // Re-render without losing focus on filter input
    const hadFocus = this.shadowRoot.activeElement?.id === "aa-filter-input";
    const cursorPos = hadFocus ? this.shadowRoot.getElementById("aa-filter-input")?.selectionStart : null;
    this.render();
    if (hadFocus) {
      const input = this.shadowRoot.getElementById("aa-filter-input");
      if (input) {
        input.focus();
        if (cursorPos !== null) input.setSelectionRange(cursorPos, cursorPos);
      }
    }
  }

  async _drawCharts() {
    if (this._isLoading) return;
    if (this.currentTab === "optimization") return;
    try {
      await this._loadChartJS();
      if (this.currentTab === "overview") {
        this._drawTopAutomationsChart();
      } else if (this.currentTab === "performance") {
        if (this.executionTimes.length > 0) this._drawExecDistChart();
        if (this.triggerTypes.size > 0) this._drawTriggerTypeChart();
        this._drawSparklineChart();
      }
    } catch (e) {
      console.error("Failed to draw charts:", e);
    }
  }

  _destroyChart(key) {
    if (this._charts[key]) {
      this._charts[key].destroy();
      delete this._charts[key];
    }
  }

  _drawTopAutomationsChart() {
    const canvas = this.shadowRoot.getElementById("top-automations-chart");
    if (!canvas || !window.Chart) return;
    this._destroyChart("top-auto");

    const data = this.getTopAutomations(5);
    if (data.length === 0) return;

    // Show trace count if no today data
    const hasToday = data.some(a => a.todayCount > 0);
    const labels = data.map(a => a.name.length > 35 ? a.name.substring(0, 33) + "\u2026" : a.name);
    const values = hasToday ? data.map(a => a.todayCount) : data.map(a => a.traceCount);
    const chartLabel = hasToday ? (this._lang === 'pl' ? 'Dzi\u015B' : 'Today') : (this._lang === 'pl' ? 'Ostatnie uruchomienia' : 'Latest runs');

    const colors = this._getComputedColors();
    this._charts["top-auto"] = new window.Chart(canvas.getContext("2d"), {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: chartLabel,
          data: values,
          backgroundColor: colors.primary,
          borderWidth: 0,
          borderRadius: 4
        }]
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(30,41,59,0.9)",
            titleColor: "#fff", bodyColor: "#fff",
            padding: 8, displayColors: false,
            callbacks: {
              title: (ctx) => data[ctx[0].dataIndex]?.name || "",
              label: (ctx) => `${chartLabel}: ${ctx.parsed.x}`
            }
          }
        },
        scales: {
          x: { display: true, beginAtZero: true, ticks: { color: colors.secondary, font: { size: 11 } }, grid: { display: false }, border: { display: false } },
          y: { display: true, ticks: { color: colors.secondary, font: { size: 12 } }, grid: { display: false }, border: { display: false } }
        }
      }
    });
  }

  _drawExecDistChart() {
    const canvas = this.shadowRoot.getElementById("exec-dist-chart");
    if (!canvas || !window.Chart) return;
    this._destroyChart("exec-dist");

    const distribution = this.getExecutionDistribution();
    const colors = this._getComputedColors();
    const barColors = ["#10B981", "#3B82F6", "#F59E0B", "#EF4444", "#991b1b"];

    this._charts["exec-dist"] = new window.Chart(canvas.getContext("2d"), {
      type: "bar",
      data: {
        labels: Object.keys(distribution),
        datasets: [{
          label: this._t.automations,
          data: Object.values(distribution),
          backgroundColor: barColors,
          borderWidth: 0,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: "rgba(30,41,59,0.9)", titleColor: "#fff", bodyColor: "#fff", padding: 8, displayColors: false }
        },
        scales: {
          y: { display: true, beginAtZero: true, ticks: { color: colors.secondary, font: { size: 11 }, stepSize: 1 }, grid: { color: "rgba(0,0,0,0.05)" }, border: { display: false } },
          x: { display: true, ticks: { color: colors.secondary, font: { size: 11 } }, grid: { display: false }, border: { display: false } }
        }
      }
    });
  }

  _drawTriggerTypeChart() {
    const canvas = this.shadowRoot.getElementById("trigger-type-chart");
    if (!canvas || !window.Chart) return;
    this._destroyChart("trigger-type");

    const data = this.getTriggerTypeData();
    if (data.length === 0) return;

    const palette = ["#3B82F6","#10B981","#F59E0B","#EF4444","#8B5CF6","#EC4899","#0EA5E9","#14B8A6","#F97316"];
    const colors = this._getComputedColors();

    this._charts["trigger-type"] = new window.Chart(canvas.getContext("2d"), {
      type: "doughnut",
      data: {
        labels: data.map(d => d.type),
        datasets: [{
          data: data.map(d => d.count),
          backgroundColor: palette.slice(0, data.length),
          borderColor: colors.cardBg,
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { color: colors.secondary, font: { size: 11 }, padding: 12, usePointStyle: true } },
          tooltip: { backgroundColor: "rgba(30,41,59,0.9)", titleColor: "#fff", bodyColor: "#fff", padding: 8, callbacks: { label: (ctx) => `${ctx.label}: ${ctx.parsed}` } }
        }
      }
    });
  }

  _drawSparklineChart() {
    const canvas = this.shadowRoot.getElementById("sparkline-chart");
    if (!canvas || !window.Chart) return;
    this._destroyChart("sparkline");

    const now = new Date();
    const dailyData = [];

    // Build 14-day data from traces + history
    for (let i = 13; i >= 0; i--) {
      const day = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      let dayCount = 0;

      // Count from traces
      this.automationTraces.forEach(traces => {
        dayCount += traces.filter(t => {
          const raw = (t.timestamp && typeof t.timestamp === "object") ? t.timestamp.start : t.timestamp;
          if (!raw) return false;
          const ts = new Date(raw);
          return ts >= dayStart && ts < dayEnd;
        }).length;
      });

      // If no trace data, try history
      if (dayCount === 0) {
        this.automationHistory.forEach(history => {
          dayCount += history.filter(event => {
            const eventTime = new Date(event.last_changed);
            return eventTime >= dayStart && eventTime < dayEnd && event.state === "on";
          }).length;
        });
      }
      dailyData.push(dayCount);
    }

    const labels = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(now.getTime() - (13 - i) * 24 * 60 * 60 * 1000);
      return `${d.getDate()}.${d.getMonth() + 1}`;
    });

    const colors = this._getComputedColors();
    this._charts["sparkline"] = new window.Chart(canvas.getContext("2d"), {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: this._lang === 'pl' ? 'Dzienne wykonania' : 'Daily executions',
          data: dailyData,
          borderColor: colors.primary,
          backgroundColor: colors.primary + "18",
          borderWidth: 2,
          fill: true,
          tension: 0.35,
          pointRadius: 3,
          pointBackgroundColor: colors.primary,
          pointBorderColor: colors.cardBg,
          pointBorderWidth: 2,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: "rgba(30,41,59,0.9)", titleColor: "#fff", bodyColor: "#fff", padding: 8, displayColors: false }
        },
        scales: {
          y: { display: true, beginAtZero: true, ticks: { color: colors.secondary, font: { size: 11 }, stepSize: 1 }, grid: { color: "rgba(0,0,0,0.04)" }, border: { display: false } },
          x: { display: true, ticks: { color: colors.secondary, font: { size: 10 } }, grid: { display: false }, border: { display: false } }
        }
      }
    });
  }

  static getConfigElement() {
    return document.createElement("ha-automation-analyzer-editor");
  }

  getCardSize() {
    return 8;
  }

  static getStubConfig() {
    return {
      type: "custom:ha-automation-analyzer",
      title: "Automation Analyzer",
      show_disabled: true
    };
  }

  disconnectedCallback() {
    // Clear all Map objects to prevent memory leaks
    this.automationStats.clear();
    this.automationHistory.clear();
    this.automationTraces.clear();
    this.triggerTypes.clear();
    this.failedAutomations.clear();
    this._apiCache.clear();
    this._cacheTimestamps.clear();
    // Destroy Chart.js instances
    Object.values(this._charts).forEach(chart => {
      if (chart && typeof chart.destroy === 'function') chart.destroy();
    });
    this._charts = {};
  }

  setActiveTab(tabId) {
    this.currentTab = tabId;
    this.render();
  }
}

if (!customElements.get('ha-automation-analyzer')) customElements.define("ha-automation-analyzer", HAAutomationAnalyzer);

class HaAutomationAnalyzerEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
  }
  setConfig(config) {
    this._config = { ...config };
    // Load persisted UI state
    try {
      const _saved = localStorage.getItem('ha-tools-automation-analyzer-settings');
      if (_saved) {
        const _s = JSON.parse(_saved);
        if (_s._activeTab) this._activeTab = _s._activeTab;
      }
    } catch(e) { console.debug('[ha-automation-analyzer] caught:', e); }
    this._render();
  }
  _dispatch() {
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: this._config }, bubbles: true, composed: true }));
  }
  _render() {
    this.shadowRoot.innerHTML = `
      <style>
            :host { display:block; padding:16px; }
            h3 { margin:0 0 16px; font-size:15px; font-weight:600; color:var(--bento-text, var(--primary-text-color,#1e293b)); }
            input { outline:none; transition:border-color .2s; }
            input:focus { border-color:var(--bento-primary, var(--primary-color,#3b82f6)); }
        </style>
      <h3>Automation Analyzer</h3>
            <div style="margin-bottom:12px;">
              <label style="display:block;font-weight:500;margin-bottom:4px;font-size:13px;">Title</label>
              <input type="text" id="cf_title" value="${_esc(this._config?.title || 'Automation Analyzer')}"
                style="width:100%;padding:8px 12px;border:1px solid var(--divider-color,#e2e8f0);border-radius:8px;background:var(--card-background-color,#fff);color:var(--primary-text-color,#1e293b);font-size:14px;box-sizing:border-box;">
            </div>
    `;
        const f_title = this.shadowRoot.querySelector('#cf_title');
        if (f_title) f_title.addEventListener('input', (e) => {
          this._config = { ...this._config, title: e.target.value };
          this._dispatch();
        });
  }
  connectedCallback() { this._render(); }
}
if (!customElements.get('ha-automation-analyzer-editor')) { customElements.define('ha-automation-analyzer-editor', HaAutomationAnalyzerEditor); }

})();

window.customCards = window.customCards || [];
window.customCards.push({ type: 'ha-automation-analyzer', name: 'Automation Analyzer', description: 'Analyze automation performance, find issues and optimize', preview: false });
