import assert from 'node:assert/strict';
import test from 'node:test';
import { createShell, createHassFixture, waitFor, flushTurns } from './helpers/ha-shell.mjs';

for (const state of ['off', 'on']) {
  test(`optimization keeps every ${state === 'off' ? 'disabled' : 'slow and inactive'} automation across pages`, async t => {
    const shell = createShell(); t.after(() => shell.dispose()); shell.startCase();
    const hass = createHassFixture({ label: 'sample0', state });
    hass.config.components = ['ha_automation_analyzer'];
    const ids = Array.from({ length: 21 }, (_, i) => `sample${i}`);
    hass.states = Object.fromEntries(ids.map(id => [`automation.${id}`, {
      entity_id: `automation.${id}`, state,
      attributes: { id, friendly_name: `Sample ${id}`, last_triggered: null },
    }]));
    hass.callWS = async request => {
      hass.__calls.push({ kind: 'callWS', payload: request });
      if (request.type === 'automation/config') return { config: {
        id: request.entity_id.replace('automation.', ''), triggers: [], conditions: [], actions: [],
      } };
      assert.equal(request.type, 'ha_automation_analyzer/summary');
      return { schema: 'aa-trace-summary-v1', run_count: 21, execution_count: 21,
        by_automation: Object.fromEntries(ids.map(id => [id, { trace_count: 1, today_count: 1, error_count: 0, avg_execution_ms: 1000 }])),
        daily_counts: Array.from({ length: 14 }, (_, i) => ({ date: `2026-08-${18 + i}`, count: i === 13 ? 21 : 0 })), durations_ms: Array(21).fill(1000) };
    };
    const card = shell.mount(hass, { auto_refresh: false, show_support: false });
    await waitFor(() => !card._loadingInProgress && card.automationStats.size === 21, 'all configurations');
    card.shadowRoot.querySelector('[data-tab="optimization"]').click();
    card.shadowRoot.querySelector('#trace-stats-load').click();
    await waitFor(() => card._traceStatsCapability?.status === 'available' && !card._traceStatsLoading, 'producer summary');
    await flushTurns();
    const calls = hass.__calls.length;
    for (const kind of state === 'off' ? ['disabled'] : ['slow', 'stale']) {
      const tab = `opt-${kind}`;
      const model = card.getOptimizationData()[kind];
      assert.equal(model.length, 21, 'pagination must receive the complete dataset');
      const size = card.shadowRoot.querySelector(`select[data-page-tab="${tab}"]`);
      size.value = '10'; size.dispatchEvent(new shell.window.Event('change', { bubbles: true }));
      const seen = [];
      for (let page = 1; page <= 3; page++) {
        const next = card.shadowRoot.querySelector(`button[data-page-tab="${tab}"][data-page="${page + 1}"]`);
        const pagination = next.closest('.pagination');
        assert.equal(pagination.querySelector('.pagination-info').textContent, `${page} / 3 (21)`);
        const rows = pagination.previousElementSibling.querySelectorAll('.auto-item');
        seen.push(...Array.from(rows, row => row.dataset.automationId));
        if (page < 3) {
          next.focus(); next.click();
          const active = card.shadowRoot.activeElement;
          assert.ok(active, 'focus stays in the replaced pagination');
          assert.equal(active.dataset.pageTab, tab);
        }
        else assert.equal(next.disabled, true);
      }
      assert.equal(seen.length, 21);
      assert.equal(new Set(seen).size, 21);
      assert.deepEqual(new Set(seen), new Set(ids));
    }
    assert.equal(hass.__calls.length, calls, 'paging makes no additional HA requests');
    shell.assertForeignUnchanged();
  });
}
