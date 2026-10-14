import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createShell, createHassFixture, deferred, waitFor, flushTurns } from './helpers/ha-shell.mjs';

async function fixture(t, count = 2) {
  const shell = createShell();
  t.after(() => shell.dispose()); shell.startCase();
  const newer = JSON.parse(readFileSync(new URL('./fixtures/trace-v1.json', import.meta.url)));
  newer.item_id = 'focus'; newer.run_id = 'newer';
  const older = structuredClone(newer); older.run_id = 'older';
  older.timestamp = { start: '2026-08-31T07:00:00.000Z', finish: '2026-08-31T07:00:00.120Z' };
  for (const values of Object.values(older.trace)) for (const item of values)
    item.timestamp = item.timestamp.replace('08:00:00', '07:00:00');
  const extra = Array.from({ length: count - 2 }, (_, i) => {
    const trace = structuredClone(older); trace.run_id = 'old-'+i;
    trace.timestamp = { start: '2026-08-31T06:00:00.000Z', finish: '2026-08-31T06:00:00.120Z' };
    for (const values of Object.values(trace.trace)) for (const item of values)
      item.timestamp = item.timestamp.replace('07:00:00', '06:00:00');
    return trace;
  });
  const hass = createHassFixture({ label: 'focus', traces: [older, newer, ...extra] });
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
  return { shell, card, gate, older, hass };
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

test('changing the selected run cancels pending comparison and allows a new comparison', async t => {
  const f = await fixture(t), root = f.card.shadowRoot;
  root.querySelector('#tl-compare-btn').click(); await flushTurns();
  assert.equal(f.card._timelineCompareLoading, true, 'a real comparison is pending');
  const select = root.querySelector('#tl-run-select'); select.value = 'older';
  select.dispatchEvent(new f.shell.window.Event('change', { bubbles: true }));
  f.gate.resolve({ domain: 'automation', ...f.older });
  await waitFor(() => !f.card._timelineLoading && f.card._timelineData?.trace?.run_id === 'older', 'replacement run');
  await flushTurns();
  assert.equal(f.card._timelineCompareLoading, false);
  assert.equal(root.querySelector('#tl-comparison-result'), null);
  const baseline = root.querySelector('#tl-baseline-select'); baseline.value = 'newer';
  baseline.dispatchEvent(new f.shell.window.Event('change', { bubbles: true }));
  assert.equal(root.querySelector('#tl-compare-btn').disabled, false);
  root.querySelector('#tl-compare-btn').click();
  await waitFor(() => f.card._timelineComparison?.status === 'available', 'new comparison');
});

for (const selection of ['baseline', 'page']) {
  test(`changing ${selection} discards the late result of a pending comparison`, async t => {
    const f = await fixture(t, selection === 'page' ? 25 : 2), root = f.card.shadowRoot;
    root.querySelector('#tl-compare-btn').click(); await flushTurns();
    assert.equal(f.card._timelineCompareLoading, true, 'a real comparison is pending');
    if (selection === 'baseline') {
      const select = root.querySelector('#tl-baseline-select'); select.value = '';
      select.dispatchEvent(new f.shell.window.Event('change', { bubbles: true }));
    } else {
      const next = root.querySelector('#tl-runs-next'); assert.equal(next.disabled, false); next.click();
    }
    f.gate.resolve({ domain: 'automation', ...f.older }); await flushTurns(20);
    assert.equal(f.card._timelineCompareLoading, false);
    assert.equal(f.card._timelineComparison, null);
    assert.equal(f.card._timelineBaselineData, null);
    assert.equal(root.querySelector('#tl-comparison-result'), null);
  });
}

test('comparison failure retains its focused status and releases loading', async t => {
  const f = await fixture(t), root = f.card.shadowRoot;
  const button = root.querySelector('#tl-compare-btn'); button.focus(); button.click();
  f.gate.reject(new Error('Synthetic unavailable response'));
  await waitFor(() => !f.card._timelineCompareLoading, 'failure'); await flushTurns();
  assert.equal(root.activeElement?.id, 'tl-comparison-result');
  assert.equal(f.card._timelineComparison.status, 'unavailable');
});


for (const id of ['tl-auto-select', 'tl-run-select', 'tl-baseline-select']) {
  test(`Timeline ${id} keeps focus and value across repaint and locale update`, async t => {
    const f = await fixture(t), root = f.card.shadowRoot;
    const select = root.getElementById(id), value = select.value; select.focus();
    f.card.render();
    assert.equal(root.activeElement, root.getElementById(id));
    assert.equal(root.activeElement.value, value);
    f.card.hass = { ...f.hass, language: 'pl' };
    assert.equal(root.activeElement, root.getElementById(id));
    assert.equal(root.activeElement.value, value);
  });
}

test('Timeline baseline and empty automation changes retain their active selector', async t => {
  const f = await fixture(t), root = f.card.shadowRoot;
  for (const id of ['tl-baseline-select', 'tl-auto-select']) {
    const select = root.getElementById(id); select.focus(); select.value = '';
    select.dispatchEvent(new f.shell.window.Event('change', { bubbles: true }));
    assert.equal(root.activeElement, root.getElementById(id));
    assert.equal(root.activeElement.value, id === 'tl-auto-select' ? 'automation.focus' : '', 'keep existing default automation behavior');
  }
  assert.equal(root.activeElement, root.getElementById('tl-auto-select'), 'loading render');
  await waitFor(() => !f.card._timelineLoading && f.card._timelineData, 'reselected automation');
  assert.equal(root.activeElement, root.getElementById('tl-auto-select'), 'completed render');
});

for (const destination of ['same', 'other', 'outside']) {
  test(`run loading preserves current focus (${destination}) without reclaiming its opener`, async t => {
    const f = await fixture(t), root = f.card.shadowRoot;
    const select = root.getElementById('tl-run-select'); select.focus(); select.value = 'older';
    select.dispatchEvent(new f.shell.window.Event('change', { bubbles: true }));
    assert.equal(root.activeElement, root.getElementById('tl-run-select'), 'loading render');
    let outside;
    if (destination === 'other') root.getElementById('tl-baseline-select').focus();
    if (destination === 'outside') {
      outside = f.shell.window.document.createElement('button');
      f.shell.window.document.body.append(outside); outside.focus();
    }
    f.gate.resolve({ domain: 'automation', ...f.older });
    await waitFor(() => !f.card._timelineLoading && f.card._timelineData?.trace?.run_id === 'older', 'selected run');
    await flushTurns();
    if (outside) {
      assert.equal(f.shell.window.document.activeElement, outside);
      assert.equal(root.activeElement, null);
    } else assert.equal(root.activeElement?.id, destination === 'other' ? 'tl-baseline-select' : 'tl-run-select');
  });
}

for (const count of [25, 45]) {
  test(`Timeline pagination keeps keyboard focus through ${count} runs and both boundaries`, async t => {
    const f = await fixture(t, count), root = f.card.shadowRoot;
    let next = root.getElementById('tl-runs-next'); next.focus(); next.click();
    if (count === 45) {
      assert.equal(root.activeElement, root.getElementById('tl-runs-next'), 'intermediate page');
      root.activeElement.click();
    }
    assert.equal(root.getElementById('tl-runs-next').disabled, true, 'last page');
    assert.equal(root.activeElement, root.getElementById('tl-runs-prev'), 'active boundary fallback');
    root.activeElement.click();
    if (count === 45) {
      assert.equal(root.activeElement, root.getElementById('tl-runs-prev'), 'intermediate return');
      root.activeElement.click();
    }
    assert.equal(root.getElementById('tl-runs-prev').disabled, true, 'first page');
    assert.equal(root.activeElement, root.getElementById('tl-runs-next'), 'active first-page fallback');
  });
}
