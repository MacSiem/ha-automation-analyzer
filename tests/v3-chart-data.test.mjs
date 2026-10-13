import test from 'node:test';
import assert from 'node:assert/strict';
import { createShell, createHassFixture, waitFor, flushTurns, deferred } from './helpers/ha-shell.mjs';
const plain = v => JSON.parse(JSON.stringify(v));
const summary = () => ({ schema: 'aa-trace-summary-v1', run_count: 6, execution_count: 6,
  by_automation: { measured: { trace_count: 6, today_count: 3, error_count: 1, avg_execution_ms: 1140 } },
  daily_counts: Array.from({ length: 14 }, (_, i) => ({ date: '2026-08-' + String(18 + i).padStart(2, '0'), count: i === 13 ? 6 : 0 })),
  durations_ms: [0, 99, 100, 500, 5000], private_extra: 'UNRENDERED_PRIVATE_CANARY' });
async function fixture(t, { load = true, server = true, traces = [], now, zone = 'UTC', provider = summary } = {}) {
  const shell = createShell({ beforeLoad(window) {
    const NativeDate = window.Date, observed = Date.parse(now || '2026-08-31T10:00Z');
    window.Date = class extends NativeDate { constructor(...args) { super(...(args.length ? args : [observed])); } static now() { return observed; } };
  } }); t.after(() => shell.dispose()); shell.startCase();
  const hass = createHassFixture({ label: 'measured', friendlyName: 'Measured automation <safe>', traces,
    configs: [{ id: 'measured', alias: 'Measured automation <safe>', triggers: [{ trigger: 'state' }, { trigger: 'time' }], conditions: [], actions: [{ action: 'light.turn_on' }] }] });
  hass.config.time_zone = zone;
  if (server) hass.config.components = ['ha_automation_analyzer'];
  const base = hass.callWS.bind(hass);
  hass.callWS = async request => {
    if (request.type !== 'ha_automation_analyzer/summary') return base(request);
    hass.__calls.push({ kind: 'callWS', payload: request, label: 'measured' }); return provider();
  };
  const card = shell.mount(hass, { auto_refresh: false, show_support: false });
  await waitFor(() => !card._loadingInProgress && card.automationStats.size === 1, 'configuration source');
  card.shadowRoot.querySelector('[data-tab="performance"]').click();
  if (load) {
    card.shadowRoot.querySelector('#trace-stats-load').click();
    await waitFor(() => card._traceStatsCapability?.status === 'available' && !card._traceStatsLoading, 'manual source summary');
    await flushTurns();
  }
  return { shell, card, hass };
}
function control(f, key, name) { const el = f.card.shadowRoot.querySelector(`[data-aa-chart="${key}"] [data-aa-chart-control="${name}"]`); assert.ok(el, `${key}/${name}`); return el; }
function dataRows(f, key) { return [...f.card.shadowRoot.querySelectorAll(`[data-aa-chart="${key}"] [data-aa-chart-row]`)].map(e => [e.dataset.aaChartRow, e.querySelector('[data-aa-value]').textContent]); }
test('manual measured distribution shares exact Chart/Data bins and exposes missing timings', async t => {
  const f = await fixture(t); const before = f.hass.__calls.length;
  control(f, 'exec-dist', 'data').click();
  const model = f.card._aaChartModelsV3['exec-dist'];
  assert.deepEqual(plain(model.rows.map(r => r.value)), [2, 1, 1, 0, 1]);
  assert.deepEqual(dataRows(f, 'exec-dist'), plain(model.rows.map(r => [r.id, String(r.value)])));
  assert.ok(Object.isFrozen(model)); assert.ok(Object.isFrozen(model.rows));
  assert.equal(model.measuredCount, 5); assert.equal(model.executionCount, 6);
  assert.match(f.card.shadowRoot.querySelector('[data-aa-chart="exec-dist"]').textContent, /5\/6/);
  assert.equal(model.source, 'home_assistant.aa_trace_summary_v1');
  assert.doesNotMatch(f.card.shadowRoot.textContent, /UNRENDERED_PRIVATE_CANARY/);
  assert.equal(f.hass.__calls.length, before);
});
test('configured trigger counts are labelled independently from execution statistics', async t => {
  const f = await fixture(t, { load: false }); const before = f.hass.__calls.length;
  control(f, 'trigger-type', 'data').click();
  const model = f.card._aaChartModelsV3['trigger-type'];
  assert.equal(model.source, 'home_assistant.automation_configuration');
  assert.deepEqual(plain(model.rows.map(r => [r.label, r.value])), [['state', 1], ['time', 1]]);
  assert.match(f.card.shadowRoot.querySelector('[data-aa-chart="trigger-type"]').textContent, /Configured triggers/);
  assert.equal(f.hass.__calls.some(c => c.payload.type === 'ha_automation_analyzer/summary'), false);
  assert.equal(f.hass.__calls.length, before);
});
test('daily chart retains exact server calendar keys, counts and timezone without resampling', async t => {
  const f = await fixture(t, { zone: 'Asia/Kolkata' }); control(f, 'sparkline', 'data').click();
  const model = f.card._aaChartModelsV3.sparkline;
  assert.equal(model.timezone, 'Asia/Kolkata');
  assert.deepEqual(plain(model.rows.map(r => [r.id, r.value])), summary().daily_counts.map(r => [r.date, r.count]));
  assert.deepEqual(dataRows(f, 'sparkline'), plain(model.rows.map(r => [r.id, String(r.value)])));
});
test('mode and keyboard point selection retain focus across locale and never read source', async t => {
  const f = await fixture(t); const before = f.hass.__calls.length;
  control(f, 'exec-dist', 'data').click();
  const point = control(f, 'exec-dist', 'point'); point.focus();
  point.dispatchEvent(new f.shell.window.KeyboardEvent('keydown', { key: 'End', bubbles: true }));
  const selected = control(f, 'exec-dist', 'point').value;
  f.card.hass = { ...f.hass, language: 'pl', locale: { language: 'pl' } }; await flushTurns();
  assert.equal(control(f, 'exec-dist', 'point').value, selected);
  assert.equal(f.card.shadowRoot.activeElement?.dataset.aaChartControl, 'point');
  assert.equal(control(f, 'exec-dist', 'data').getAttribute('aria-pressed'), 'true');
  assert.equal(f.hass.__calls.length, before);
});
test('retained ranking labels today or total according to the actual chosen counts', async t => {
  const f = await fixture(t); const before = f.hass.__calls.length;
  f.card.shadowRoot.querySelector('[data-tab="overview"]').click(); control(f, 'top-auto', 'data').click();
  assert.equal(f.card._aaChartModelsV3['top-auto'].rows[0].value, 3);
  assert.match(f.card.shadowRoot.querySelector('[data-aa-chart="top-auto"]').textContent, /Retained today/);
  assert.equal(f.hass.__calls.length, before);
});
test('timezone change invalidates pending summary and never repaints late old calendar data', async t => {
  const gate = deferred(); const f = await fixture(t, { load: false, provider: () => gate.promise });
  const pending = f.card._loadTraceStatistics();
  await waitFor(() => f.hass.__calls.some(c => c.payload.type === 'ha_automation_analyzer/summary'), 'pending summary');
  const before = f.hass.__calls.length;
  f.card.hass = { ...f.hass, config: { ...f.hass.config, time_zone: 'Europe/Warsaw' } };
  gate.resolve(summary()); await pending; await flushTurns();
  assert.equal(f.card._traceStatsCapability, null); assert.equal(f.card._traceStatsCache, null);
  assert.equal(f.card._traceStatsLoading, false); assert.equal(f.hass.__calls.length, before);
  assert.equal(f.card.shadowRoot.querySelector('[data-aa-chart="sparkline"] [data-aa-chart-row]'), null);
});
test('legacy retained runs use HA calendar dates through the 25-hour day', async t => {
  const stamps = ['2026-10-24T21:59Z', '2026-10-24T22:00Z', '2026-10-25T00:30Z', '2026-10-25T01:30Z', '2026-10-25T22:58Z'];
  const traces = stamps.map((stamp, i) => ({ domain: 'automation', item_id: 'measured', run_id: 'run-' + i,
    state: 'stopped', script_execution: 'finished', last_step: 'action/0',
    timestamp: { start: stamp, finish: new Date(Date.parse(stamp) + 1000).toISOString() } }));
  const f = await fixture(t, { server: false, traces, zone: 'Europe/Warsaw', now: '2026-10-25T22:59Z' });
  assert.equal(f.card.automationStats.get('automation.measured').todayCount, 4);
  control(f, 'sparkline', 'data').click();
  const model = f.card._aaChartModelsV3.sparkline;
  assert.equal(model.rows.find(r => r.id === '2026-10-25').value, 4);
  assert.equal(model.rows.find(r => r.id === '2026-10-24').value, 1);
});
