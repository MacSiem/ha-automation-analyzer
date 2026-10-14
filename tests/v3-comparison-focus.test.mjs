import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createShell, createHassFixture, deferred, waitFor, flushTurns } from './helpers/ha-shell.mjs';

async function fixture(t) {
  const shell = createShell();
  t.after(() => shell.dispose()); shell.startCase();
  const newer = JSON.parse(readFileSync(new URL('./fixtures/trace-v1.json', import.meta.url)));
  newer.item_id = 'focus'; newer.run_id = 'newer';
  const older = structuredClone(newer); older.run_id = 'older';
  older.timestamp = { start: '2026-08-31T07:00:00.000Z', finish: '2026-08-31T07:00:00.120Z' };
  for (const values of Object.values(older.trace)) for (const item of values)
    item.timestamp = item.timestamp.replace('08:00:00', '07:00:00');
  const hass = createHassFixture({ label: 'focus', traces: [older, newer] });
  const card = shell.mount(hass, { auto_refresh: false, show_support: false });
  await waitFor(() => !card._loadingInProgress && card.automationStats.size === 1, 'base');
  card.setActiveTab('timeline');
  await waitFor(() => card._timelineData?.capability?.status === 'available', 'timeline');
  await flushTurns();
  const select = card.shadowRoot.querySelector('#tl-baseline-select');
  select.value = 'older'; select.dispatchEvent(new shell.window.Event('change', { bubbles: true }));
  const gate = deferred(); const original = hass.callWS.bind(hass);
  hass.callWS = message => message.type === 'trace/get' && message.run_id === 'older'
    ? gate.promise : original(message);
  return { shell, card, gate, older };
}

test('keyboard comparison retains focus on its pending status and completed result', async t => {
  const f = await fixture(t);
  const button = f.card.shadowRoot.querySelector('#tl-compare-btn'); button.focus(); button.click();
  await flushTurns();
  assert.equal(f.card.shadowRoot.activeElement?.id, 'tl-comparison-result');
  assert.match(f.card.shadowRoot.activeElement.textContent, /Comparing/);
  f.gate.resolve({ domain: 'automation', ...f.older });
  await waitFor(() => f.card._timelineComparison?.status === 'available', 'comparison');
  await flushTurns();
  assert.equal(f.card.shadowRoot.activeElement?.id, 'tl-comparison-result');
  assert.match(f.card.shadowRoot.activeElement.textContent, /run-time change|run/i);
});

test('a completed comparison does not reclaim focus after the user moves elsewhere', async t => {
  const f = await fixture(t);
  const button = f.card.shadowRoot.querySelector('#tl-compare-btn'); button.focus(); button.click();
  await flushTurns();
  const outside = f.shell.window.document.createElement('button');
  f.shell.window.document.body.append(outside); outside.focus();
  f.gate.resolve({ domain: 'automation', ...f.older });
  await waitFor(() => f.card._timelineComparison?.status === 'available', 'comparison');
  await flushTurns();
  assert.equal(f.shell.window.document.activeElement, outside);
  assert.equal(f.card.shadowRoot.activeElement, null);
});
