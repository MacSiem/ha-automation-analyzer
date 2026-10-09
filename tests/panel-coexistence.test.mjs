import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createShell, createHassFixture, waitFor } from './helpers/ha-shell.mjs';

for (const legacyFirst of [true, false]) {
  test(`integration panel uses its bundled summary when legacy card loads ${legacyFirst ? 'first' : 'last'}`, {concurrency:false}, async t => {
    let legacy;
    const installLegacy = window => {
      legacy = class LegacyCard extends window.HTMLElement {};
      if (!window.customElements.get('ha-automation-analyzer')) window.customElements.define('ha-automation-analyzer', legacy);
    };
    const shell = createShell({beforeLoad: legacyFirst ? installLegacy : undefined});
    t.after(() => shell.dispose());
    if (!legacyFirst) installLegacy(shell.window);
    const existingCard = shell.window.customElements.get('ha-automation-analyzer');
    const panel = shell.document.createElement('ha-automation-analyzer-panel');
    shell.document.body.append(panel);
    const hass = createHassFixture({label:'panel-collision'});
    hass.config.components = ['ha_automation_analyzer'];
    const nativeCall = hass.callWS.bind(hass);
    hass.callWS = async message => {
      if (message.type !== 'ha_automation_analyzer/summary') return nativeCall(message);
      hass.__calls.push({kind:'callWS',payload:message});
      return {schema:'aa-trace-summary-v1',run_count:2,execution_count:2,
        by_automation:{'panel-collision':{trace_count:2,today_count:2,error_count:1,avg_execution_ms:120}},
        daily_counts:Array.from({length:14},(_,index)=>({date:`2026-08-${String(18+index).padStart(2,'0')}`,count:index===13?2:0})),durations_ms:[100,140]};
    };
    panel.hass = hass;
    assert.equal(typeof panel._loadTraceStatistics, 'function', 'panel must instantiate the bundled implementation');
    await waitFor(() => !panel._loadingInProgress && panel.automationStats.size === 1, 'bundled panel base data');
    await panel._loadTraceStatistics();
    const stats = panel.automationStats.get('automation.panel-collision');
    assert.equal(stats.traceCount,2);
    assert.equal(stats.avgExecutionTime,120);
    assert.equal(stats.isFailed,true);
    assert.equal(hass.__calls.filter(call=>call.payload.type==='ha_automation_analyzer/summary').length,1);
    assert.equal(hass.__calls.some(call=>call.payload.type==='trace/list'),false);
    assert.equal(shell.window.customElements.get('ha-automation-analyzer'),existingCard);
    if (legacyFirst) assert.equal(existingCard,legacy);
    panel.remove();
    shell.assertForeignUnchanged();
    assert.deepEqual(shell.errors,[]);
  });
}


test('loading the bundled module again keeps one card picker entry', t => {
  const shell = createShell();
  t.after(() => shell.dispose());
  shell.window.eval(readFileSync('ha-automation-analyzer.js','utf8'));
  assert.equal(shell.window.customCards.filter(card=>card.type==='ha-automation-analyzer').length,1);
  shell.assertForeignUnchanged();
});
