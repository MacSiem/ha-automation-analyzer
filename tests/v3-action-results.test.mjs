import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createHassFixture, createShell, deferred, flushTurns, waitFor } from './helpers/ha-shell.mjs';

const labels = {
  en: { success: '✓ Success', error: '✕ Error', unconfirmed: '? Unconfirmed', no_data: '∅ No data' },
  pl: { success: '✓ Sukces', error: '✕ Błąd', unconfirmed: '? Niepotwierdzony', no_data: '∅ Brak danych' },
};
const loaded = card => waitFor(() => !card._loadingInProgress && card.automationStats.size === 1, 'base card');
const runningFixture = () => JSON.parse(readFileSync(new URL('./fixtures/trace-running-v1.json', import.meta.url), 'utf8'));

for (const language of ['en', 'pl']) {
  test(`W4 timeline renders producer outcomes and measured zero, ${language}`, { concurrency: false }, async t => {
    const shell = createShell();
    t.after(() => shell.dispose());
    shell.startCase();
    const cases = [
      { name: 'running', state: 'running', outcome: null, duration: null, expected: 'unconfirmed' },
      { name: 'running-finished', state: 'running', outcome: 'finished', duration: null, expected: 'unconfirmed' },
      { name: 'stopped-missing', state: 'stopped', outcome: null, duration: null, expected: 'unconfirmed' },
      { name: 'success', state: 'stopped', outcome: 'finished', duration: 100, expected: 'success' },
      { name: 'zero', state: 'stopped', outcome: 'finished', duration: 0, expected: 'success' },
      { name: 'null', state: 'stopped', outcome: null, duration: 100, expected: 'unconfirmed' },
      { name: 'future', state: 'stopped', outcome: 'future-outcome', duration: 100, expected: 'unconfirmed' },
      { name: 'outcome-error', state: 'stopped', outcome: 'error', duration: 100, expected: 'error' },
      { name: 'node-error', state: 'stopped', outcome: 'finished', duration: 100, nodeError: true, expected: 'error' },
      { name: 'not-executed', state: 'stopped', outcome: 'finished', duration: 100, nonExecution: true, expected: 'no_data' },
      { name: 'empty', state: 'stopped', outcome: 'finished', duration: 100, empty: true, expected: 'no_data' },
      { name: 'empty-error', state: 'stopped', outcome: 'error', duration: 100, empty: true, expected: 'error' },
    ];
    for (const scenario of cases) {
      const trace = runningFixture();
      trace.item_id = 'w4-timeline';
      trace.state = scenario.state;
      trace.script_execution = scenario.outcome;
      trace.timestamp.finish = scenario.duration === null ? null
        : new Date(Date.parse(trace.timestamp.start) + scenario.duration).toISOString();
      if (scenario.duration === 0) {
        for (const entries of Object.values(trace.trace)) for (const entry of entries) entry.timestamp = trace.timestamp.start;
      }
      if (scenario.nodeError) trace.trace['action/0'][0].error = 'PRIVATE_NODE_ERROR';
      if (scenario.nonExecution) trace.not_triggered = true;
      if (scenario.empty) trace.trace = {};
      const hass = createHassFixture({ label: 'w4-timeline', traces: [trace] });
      hass.language = language;
      const card = shell.mount(hass, { auto_refresh: false });
      await loaded(card);
      card.setActiveTab('timeline');
      await waitFor(() => !card._timelineLoading && card._timelineData?.capability?.status === 'available', scenario.name);
      await flushTurns();
      const badge = card.shadowRoot.querySelector('.tl-meta-row [data-result-state], .empty-state [data-result-state]');
      assert.ok(badge, scenario.name);
      assert.equal(badge.dataset.resultState, scenario.expected, scenario.name);
      assert.equal(badge.textContent.trim(), labels[language][scenario.expected]);
      assert.equal(badge.classList.contains('ht-result-state--success'), scenario.expected === 'success');
      assert.equal(card.shadowRoot.querySelector('.tl-meta-badge.ok'), null);
      if (scenario.nonExecution) {
        assert.equal(card._timelineData.empty, true);
        assert.equal(card._timelineData.trace, undefined);
        assert.equal(hass.__calls.filter(call => call.payload?.type === 'trace/list').length, 1);
        assert.equal(hass.__calls.filter(call => call.payload?.type === 'trace/get').length, 0, 'non-executions remain excluded from trace requests');
      } else assert.equal(card._timelineData.trace.run_duration_ms, scenario.duration);
      const meta = card.shadowRoot.querySelector('.tl-meta-row')?.textContent || '';
      if (scenario.duration === null) {
        assert.doesNotMatch(meta, /\b0ms/);
        assert.match(meta, scenario.state === 'running'
          ? language === 'pl' ? /w toku/ : /running/
          : language === 'pl' ? /Nie zmierzono/ : /Not measured/);
      } else if (scenario.duration === 0) assert.match(meta, /\b0ms/);
      assert.doesNotMatch(card.shadowRoot.innerHTML, /PRIVATE_NODE_ERROR|private_resident|private-running-context/);

      if (scenario.expected === 'success') {
        const original = card._timelineData.summary;
        for (const replacement of [null, { ...original, run_id: 'other-run' },
          { ...original, item_id: 'other-item' }, { ...original, run_state: 'running' },
          { ...original, finished_at: null }, { ...original, run_duration_ms: null }]) {
          card._timelineData.summary = replacement;
          card.render();
          assert.equal(card.shadowRoot.querySelector('.tl-meta-row [data-result-state], .empty-state [data-result-state]').dataset.resultState, 'unconfirmed');
        }
        card._timelineData.summary = original;
        card.render();
      }
      const before = hass.__calls.length;
      const nextLanguage = language === 'en' ? 'pl' : 'en';
      card.hass = { ...hass, language: nextLanguage };
      assert.equal(card.shadowRoot.querySelector('.tl-meta-row [data-result-state], .empty-state [data-result-state]').textContent.trim(), labels[nextLanguage][scenario.expected]);
      assert.equal(hass.__calls.length, before, 'locale change uses retained data');
      card.remove();
    }
    assert.deepEqual(shell.errors, []);
  });

  for (const enable of [true, false]) {
    test(`W4 toggle ACK and observed state are distinct, ${language}, enable=${enable}`, { concurrency: false }, async t => {
      const shell = createShell();
      t.after(() => shell.dispose());
      shell.startCase();
      for (const observation of ['none', 'fresh-target', 'same-target-before', 'unavailable']) {
        const gate = deferred();
        const target = enable ? 'on' : 'off';
        const originalState = observation === 'same-target-before' ? target : enable ? 'off' : 'on';
        const hass = createHassFixture({ label: 'w4-toggle', state: originalState, gates: { callService: gate } });
        hass.language = language;
        const card = shell.mount(hass, { show_disabled: true, auto_refresh: false });
        await loaded(card);
        const messages = [];
        card.addEventListener('hass-notification', event => messages.push(event.detail.message));
        const originalEntity = hass.states['automation.w4-toggle'];
        const pending = card._toggleAutomation('automation.w4-toggle', enable);
        assert.equal(hass.states['automation.w4-toggle'].state, originalState, 'no optimistic mutation');
        assert.deepEqual(messages, []);
        if (observation === 'fresh-target' || observation === 'unavailable') {
          card.hass = { ...hass, states: { ...hass.states, 'automation.w4-toggle': {
            ...originalEntity, state: observation === 'fresh-target' ? target : 'unavailable',
            last_updated: '2026-08-31T08:00:01.000Z',
          } } };
        }
        gate.resolve(undefined);
        await pending;
        const confirmed = observation === 'fresh-target';
        const description = language === 'pl'
          ? confirmed ? enable ? 'Zaobserwowano włączoną automatyzację.' : 'Zaobserwowano wyłączoną automatyzację.'
            : enable ? 'Przyjęto żądanie włączenia automatyzacji; jej stan nie został jeszcze potwierdzony.' : 'Przyjęto żądanie wyłączenia automatyzacji; jej stan nie został jeszcze potwierdzony.'
          : confirmed ? enable ? 'Observed automation state: enabled.' : 'Observed automation state: disabled.'
            : enable ? 'Enable request accepted; the automation state is not yet confirmed.' : 'Disable request accepted; the automation state is not yet confirmed.';
        assert.deepEqual(messages, [`${labels[language][confirmed ? 'success' : 'unconfirmed']} — ${description}`]);
        assert.equal(hass.states['automation.w4-toggle'], originalEntity);
        assert.equal(originalEntity.state, originalState);
        assert.equal(hass.__calls.filter(call => call.kind === 'callService').length, 1, 'no retry');
        assert.ok(card._refreshTimer, 'accepted request retains delayed refresh');
        const timer = card._refreshTimer;
        card.remove();
        assert.equal(shell.timers.get(timer)?.live, false, 'detach clears refresh');
      }
      assert.deepEqual(shell.errors, []);
    });
  }

  test(`W4 toggle distinguishes explicit rejection and unknown transport safely, ${language}`, { concurrency: false }, async t => {
    const shell = createShell();
    t.after(() => shell.dispose());
    shell.startCase();
    for (const code of ['unauthorized', 'service_not_found', 'invalid_format', 'timeout', 'home_assistant_error', null, 'getter']) {
      let privateReads = 0;
      const error = {};
      Object.defineProperty(error, 'message', { get() { privateReads++; throw new Error('PRIVATE_MESSAGE_GETTER'); } });
      if (code === 'getter') Object.defineProperty(error, 'code', { get() { privateReads++; throw new Error('PRIVATE_CODE_GETTER'); } });
      else if (code !== null) error.code = code;
      const hass = createHassFixture({ label: 'w4-denial', state: 'off' });
      hass.language = language;
      let requests = 0;
      hass.callService = async () => { requests++; throw error; };
      const card = shell.mount(hass, { show_disabled: true });
      await loaded(card);
      const messages = [];
      card.addEventListener('hass-notification', event => messages.push(event.detail.message));
      await card._toggleAutomation('automation.w4-denial', true);
      const rejected = ['unauthorized', 'service_not_found', 'invalid_format'].includes(code);
      const description = language === 'pl'
        ? rejected ? 'Żądanie zmiany stanu automatyzacji zostało odrzucone.' : 'Nie potwierdzono zmiany stanu automatyzacji. Sprawdź jej stan przed ponowieniem.'
        : rejected ? 'The automation state change request was rejected.' : 'The automation state change was not confirmed. Check its state before trying again.';
      assert.deepEqual(messages, [`${labels[language][rejected ? 'error' : 'unconfirmed']} — ${description}`]);
      assert.equal(privateReads, 0);
      assert.equal(requests, 1);
      assert.equal(hass.states['automation.w4-denial'].state, 'off');
      card.remove();
    }
    assert.deepEqual(shell.errors, []);
  });
}

test('W4 pending toggle uses live locale and loses authority on role change', { concurrency: false }, async t => {
  const shell = createShell();
  t.after(() => shell.dispose());
  shell.startCase();
  for (const roleChange of [false, true]) for (const rejected of [false, true]) {
    const gate = deferred();
    const hass = createHassFixture({ label: 'w4-session', state: 'off', gates: { callService: gate } });
    const card = shell.mount(hass, { show_disabled: true, auto_refresh: false });
    await loaded(card);
    const messages = [];
    card.addEventListener('hass-notification', event => messages.push(event.detail.message));
    const pending = card._toggleAutomation('automation.w4-session', true);
    card.hass = { ...hass, language: 'pl', user: roleChange ? { ...hass.user, is_admin: false } : hass.user };
    if (rejected) gate.reject({ code: 'unauthorized' }); else gate.resolve(undefined);
    await pending;
    if (roleChange) {
      assert.deepEqual(messages, []);
      assert.equal(card._refreshTimer, null);
    } else {
      assert.ok(messages[0].startsWith(labels.pl[rejected ? 'error' : 'unconfirmed']));
      assert.doesNotMatch(messages[0], /accepted|rejected|Enabled|Disabled/);
      if (!rejected) {
        const timer = card._refreshTimer;
        card.hass = { ...hass, user: { ...hass.user, is_admin: false } };
        let refreshes = 0;
        card._loadAndRender = () => { refreshes++; };
        shell.timers.invokeCaptured(timer);
        assert.equal(refreshes, 0, 'old toggle timer cannot refresh a different role generation');
      }
    }
    card.remove();
  }
  assert.deepEqual(shell.errors, []);
});
