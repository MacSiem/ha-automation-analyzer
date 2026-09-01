import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createHassFixture,
  createShell,
  deferred,
  findExecutableDom,
  flushTurns,
  waitFor,
} from './helpers/ha-shell.mjs';

async function waitForLoaded(card) {
  await waitFor(
    () => card._loadingInProgress === false && card.automationStats.size > 0,
    'the real card to finish loading',
  );
  await flushTurns();
}

function componentLeaks(shell, card) {
  return {
    listeners: shell.listeners.liveLongLivedFor(card),
    observers: shell.observers.liveLongLivedFor(card),
  };
}

test('Sections grid metadata preserves the card natural dynamic height', { concurrency: false }, async t => {
  const shell = createShell();
  t.after(() => shell.dispose());
  shell.startCase();

  const card = shell.mount(createHassFixture({ label: 'grid-options' }));
  await waitForLoaded(card);

  const gridOptions = card.getGridOptions();
  assert.equal(gridOptions.columns, 12);
  assert.equal(gridOptions.min_columns, 6);
  assert.deepEqual(Object.keys(gridOptions).sort(), ['columns', 'min_columns']);
  assert.equal(Object.hasOwn(gridOptions, 'rows'), false);
  assert.equal(Object.hasOwn(gridOptions, 'min_rows'), false);

  card.remove();
  assert.deepEqual(shell.errors, []);
});

test('two real card instances keep runtime state and DOM isolated', { concurrency: false }, async t => {
  const shell = createShell();
  t.after(() => shell.dispose());
  shell.startCase();
  const baseline = {
    timers: shell.timers.liveAll().length,
    listeners: shell.listeners.liveAllLongLived().length,
    observers: shell.observers.liveAllLongLived().length,
  };

  const alphaHass = createHassFixture({ label: 'alpha', friendlyName: 'Alpha automation' });
  const betaHass = createHassFixture({ label: 'beta', friendlyName: 'Beta automation' });
  const alpha = shell.mount(alphaHass, { title: 'Alpha analyzer' });
  const beta = shell.mount(betaHass, { title: 'Beta analyzer' });

  await Promise.all([waitForLoaded(alpha), waitForLoaded(beta)]);
  assert.equal(alpha.automationStats.has('automation.alpha'), true);
  assert.equal(alpha.automationStats.has('automation.beta'), false);
  assert.equal(beta.automationStats.has('automation.beta'), true);
  assert.equal(beta.automationStats.has('automation.alpha'), false);
  assert.match(alpha.shadowRoot.textContent, /Alpha automation/);
  assert.doesNotMatch(alpha.shadowRoot.textContent, /Beta automation/);
  assert.match(beta.shadowRoot.textContent, /Beta automation/);

  const betaHtml = beta.shadowRoot.innerHTML;
  const betaTab = beta.currentTab;
  alpha.setActiveTab('optimization');
  const filter = alpha.shadowRoot.querySelector('#aa-filter-input');
  if (filter) {
    filter.value = 'does-not-match';
    filter.dispatchEvent(new shell.window.Event('input', { bubbles: true }));
  }
  await flushTurns();

  assert.equal(beta.currentTab, betaTab);
  assert.equal(beta.shadowRoot.innerHTML, betaHtml);
  shell.assertForeignUnchanged();

  alpha.remove();
  beta.remove();
  assert.deepEqual(componentLeaks(shell, alpha), { listeners: [], observers: [] });
  assert.deepEqual(componentLeaks(shell, beta), { listeners: [], observers: [] });
  assert.deepEqual({
    timers: shell.timers.liveAll().length,
    listeners: shell.listeners.liveAllLongLived().length,
    observers: shell.observers.liveAllLongLived().length,
  }, baseline, 'removing both cards must restore the complete instrumentation baseline');
  assert.deepEqual(shell.errors, []);
});

test('hostile runtime, config, trace, and persisted values create no executable DOM', { concurrency: false }, async t => {
  const shell = createShell();
  t.after(() => shell.dispose());
  shell.window.localStorage.setItem('ha-tools-automation-analyzer-settings', JSON.stringify({
    _activeTab: '\"><img data-hostile-persisted src=x onerror=window.__pwned=1>',
  }));
  shell.window.localStorage.setItem(
    'ha-intro-dismissed-ha-automation-analyzer',
    '\"><script data-hostile-persisted>window.__pwned=1</script>',
  );
  shell.startCase();

  const hostileId = 'safe" data-hostile-runtime="yes" onclick="window.__pwned=1';
  const hostileName = {
    toString: () => '\"><img data-hostile-runtime src=x onerror=window.__pwned=1>',
  };
  const hostileTitleObject = {
    toString: () => '\"><img data-hostile-config src=x onerror=window.__pwned=1>',
  };
  const hostileTitle = ['Automation Analyzer', hostileTitleObject];
  const hass = createHassFixture({
    label: 'hostile',
    internalId: hostileId,
    friendlyName: hostileName,
    configs: [{
      id: hostileId,
      alias: String(hostileName),
      trigger: [{ platform: 'state' }],
      condition: [],
      action: [],
    }],
  });
  const card = shell.mount(hass, { title: hostileTitle });
  await waitForLoaded(card);

  assert.equal(
    findExecutableDom(card.shadowRoot),
    null,
    'automation identifiers and hostile runtime/config values must remain inert',
  );

  card.currentTab = 'timeline';
  card._selectedTimelineId = 'automation.hostile';
  card._timelineData = {
    entityId: 'automation.hostile',
    meta: {},
    trace: {
      state: 'stopped',
      script_execution: 'error',
      timestamp: {
        start: '2026-08-31T08:00:00.000Z',
        finish: '2026-08-31T08:00:00.025Z',
      },
      path: [{
        path: 'action/0/\"><img data-hostile-trace src=x onerror=window.__pwned=1>',
        timestamp: '2026-08-31T08:00:00.010Z',
        error: '\"><img data-hostile-trace src=x onerror=window.__pwned=1>',
      }],
    },
  };
  card.render();
  await flushTurns();

  assert.equal(
    findExecutableDom(card.shadowRoot),
    null,
    'automation identifiers and hostile values must remain inert text/attribute data',
  );
  assert.equal(shell.window.__pwned, undefined);
  shell.assertForeignUnchanged();
  card.remove();
  assert.deepEqual(componentLeaks(shell, card), { listeners: [], observers: [] });
  assert.deepEqual(shell.errors, []);
});

test('automation navigation encodes the complete identifier before handing it to Home Assistant', { concurrency: false }, async t => {
  const shell = createShell();
  t.after(() => shell.dispose());
  shell.startCase();
  const hass = createHassFixture({ label: 'navigation' });
  const navigations = [];
  hass.navigate = path => navigations.push(path);
  const card = shell.mount(hass);
  await waitForLoaded(card);

  const hostileIdentifier = 'automation.private/../../config?token=PRIVATE_MESSAGE#fragment';
  card._navigateToAutomation(hostileIdentifier);
  assert.deepEqual(navigations, [
    `/config/automation/edit/${encodeURIComponent(hostileIdentifier)}`,
  ]);
  assert.doesNotMatch(navigations[0], /token=|#fragment|\/\.\.\//);
  card._navigateToAutomation(null);
  assert.equal(navigations.length, 1);
  card.remove();
  assert.deepEqual(shell.errors, []);
});

test('per-automation config fallback encodes identifiers before building an API path', { concurrency: false }, async t => {
  const shell = createShell();
  t.after(() => shell.dispose());
  shell.startCase();
  const hostileIdentifier = '../../auth/token?token=PRIVATE_MESSAGE#fragment';
  const hass = createHassFixture({ label: 'config-path', internalId: hostileIdentifier });
  const nativeCallWS = hass.callWS.bind(hass);
  hass.callWS = async message => {
    if (message.type === 'config/automation/list') {
      hass.__calls.push({ kind: 'callWS', payload: message, label: 'config-path' });
      throw new Error('bulk config unavailable');
    }
    return nativeCallWS(message);
  };
  const card = shell.mount(hass);
  await waitForLoaded(card);

  const fallbackCalls = hass.__calls.filter(call => call.kind === 'callApi');
  assert.deepEqual(fallbackCalls.map(call => call.payload.path), [
    `config/automation/config/${encodeURIComponent(hostileIdentifier)}`,
  ]);
  assert.doesNotMatch(fallbackCalls[0].payload.path, /\.\.\/|\?|#/);
  card.remove();
  assert.deepEqual(shell.errors, []);
});

test('disconnect clears real throttled-render and post-toggle timers', { concurrency: false }, async t => {
  const shell = createShell();
  t.after(() => shell.dispose());
  shell.startCase();

  const hass = createHassFixture({
    label: 'disabled',
    friendlyName: 'Disabled automation',
    state: 'off',
  });
  const card = shell.mount(hass, { show_disabled: true });
  await waitForLoaded(card);

  let renderCalls = 0;
  const nativeRender = card.render.bind(card);
  card.render = (...args) => {
    renderCalls += 1;
    return nativeRender(...args);
  };

  card.hass = hass;
  const renderHandle = card._renderTimer;
  assert.notEqual(renderHandle, null, 'the real hass setter must schedule its throttle timer');

  card.setActiveTab('optimization');
  const toggle = card.shadowRoot.querySelector('.toggle-btn[data-action="enable"]');
  assert.ok(toggle, 'the disabled automation must expose its real enable control');
  toggle.click();
  await waitFor(() => hass.__calls.some(call => call.kind === 'callService'), 'toggle service call');
  await waitFor(() => card._refreshTimer !== null, 'post-toggle refresh timer');
  const refreshHandle = card._refreshTimer;
  const callsBeforeRemove = hass.__calls.length;
  const rendersBeforeRemove = renderCalls;

  card.remove();
  assert.equal(card._renderTimer, null);
  assert.equal(card._refreshTimer, null);
  assert.equal(shell.timers.get(renderHandle)?.cleared, true);
  assert.equal(shell.timers.get(refreshHandle)?.cleared, true);
  assert.deepEqual(shell.timers.live([renderHandle, refreshHandle]), []);
  assert.deepEqual(componentLeaks(shell, card), { listeners: [], observers: [] });

  shell.timers.invokeCaptured(renderHandle);
  shell.timers.invokeCaptured(refreshHandle);
  await flushTurns();
  assert.equal(hass.__calls.length, callsBeforeRemove);
  assert.equal(renderCalls, rendersBeforeRemove);
  assert.deepEqual(shell.errors, []);
});

test('a delayed HA completion cannot mutate or continue work for a detached card', { concurrency: false }, async t => {
  const shell = createShell();
  t.after(() => shell.dispose());
  shell.startCase();

  const configGate = deferred();
  const hass = createHassFixture({
    label: 'delayed',
    friendlyName: 'Delayed automation',
    gates: { 'config/automation/list': configGate },
  });
  const card = shell.mount(hass);
  await waitFor(
    () => hass.__calls.some(call => call.kind === 'callWS'
      && call.payload.type === 'config/automation/list'),
    'held config/automation/list request',
  );

  card.remove();
  const detachedHtml = card.shadowRoot.innerHTML;
  const detachedCalls = hass.__calls.length;
  const detachedLiveTimers = shell.timers.liveAll().length;
  let detachedRenders = 0;
  let detachedChartDraws = 0;
  const nativeRender = card.render.bind(card);
  const nativeDrawCharts = card._drawCharts.bind(card);
  card.render = (...args) => {
    detachedRenders += 1;
    return nativeRender(...args);
  };
  card._drawCharts = (...args) => {
    detachedChartDraws += 1;
    return nativeDrawCharts(...args);
  };

  configGate.resolve([{
    id: 'delayed',
    alias: 'Delayed automation',
    trigger: [{ platform: 'state' }],
    action: [],
    condition: [],
  }]);
  await flushTurns(16);

  assert.equal(detachedRenders, 0, 'detached async completion must not render');
  assert.equal(detachedChartDraws, 0, 'detached async completion must not draw charts');
  assert.equal(card.shadowRoot.innerHTML, detachedHtml);
  assert.equal(card.automationStats.size, 0);
  assert.equal(Object.hasOwn(card, 'automationTraces'), false);
  assert.equal(Object.hasOwn(card, 'automationHistory'), false);
  assert.equal(hass.__calls.length, detachedCalls, 'detached completion must not issue follow-up HA calls');
  assert.equal(shell.timers.liveAll().length, detachedLiveTimers);
  assert.deepEqual(componentLeaks(shell, card), { listeners: [], observers: [] });
  assert.deepEqual(shell.errors, []);
});

test('a delayed timeline response is invalidated when its card detaches', { concurrency: false }, async t => {
  const shell = createShell();
  t.after(() => shell.dispose());
  shell.startCase();

  const timelineHass = createHassFixture({ label: 'timeline', friendlyName: 'Timeline automation' });
  const card = shell.mount(timelineHass);
  await waitForLoaded(card);

  const timelineGate = deferred();
  const nativeCallWS = timelineHass.callWS.bind(timelineHass);
  timelineHass.callWS = async message => {
    if (message.type === 'trace/list' && message.item_id === 'timeline') {
      timelineHass.__calls.push({ kind: 'callWS', payload: message, label: 'timeline' });
      return timelineGate.promise;
    }
    return nativeCallWS(message);
  };
  card._fetchTimeline('automation.timeline');
  await waitFor(
    () => timelineHass.__calls.some(call => call.kind === 'callWS'
      && call.payload.type === 'trace/list' && call.payload.item_id === 'timeline'),
    'held timeline request',
  );

  card.remove();
  const detachedHtml = card.shadowRoot.innerHTML;
  const detachedCalls = timelineHass.__calls.length;
  let detachedRenders = 0;
  const nativeRender = card.render.bind(card);
  card.render = (...args) => {
    detachedRenders += 1;
    return nativeRender(...args);
  };
  timelineGate.resolve([{
    item_id: 'timeline',
    run_id: 'delayed-run',
    timestamp: { start: '2026-08-31T08:00:00.000Z' },
  }]);
  await flushTurns(12);

  assert.equal(detachedRenders, 0);
  assert.equal(card.shadowRoot.innerHTML, detachedHtml);
  assert.equal(card._timelineData, null);
  assert.equal(card._timelineLoading, false);
  assert.equal(timelineHass.__calls.length, detachedCalls);
  assert.deepEqual(componentLeaks(shell, card), { listeners: [], observers: [] });
  assert.deepEqual(shell.errors, []);
});

test('a timeline response from an older hass snapshot cannot overwrite the current card', { concurrency: false }, async t => {
  const shell = createShell();
  t.after(() => shell.dispose());
  shell.startCase();

  const oldHass = createHassFixture({ label: 'old-timeline', friendlyName: 'Old timeline automation' });
  const card = shell.mount(oldHass);
  await waitForLoaded(card);

  const oldTimelineGate = deferred();
  const nativeOldCallWS = oldHass.callWS.bind(oldHass);
  oldHass.callWS = async message => {
    if (message.type === 'trace/list' && message.item_id === 'old-timeline') {
      oldHass.__calls.push({ kind: 'callWS', payload: message, label: 'old-timeline' });
      return oldTimelineGate.promise;
    }
    return nativeOldCallWS(message);
  };
  card.currentTab = 'timeline';
  card._selectedTimelineId = 'automation.old-timeline';
  card._fetchTimeline('automation.old-timeline');
  await waitFor(
    () => oldHass.__calls.some(call => call.kind === 'callWS'
      && call.payload.type === 'trace/list' && call.payload.item_id === 'old-timeline'),
    'old hass timeline request',
  );

  const freshHass = createHassFixture({ label: 'fresh-timeline', friendlyName: 'Fresh timeline automation' });
  shell.advanceClock(30_001);
  card.hass = freshHass;
  oldTimelineGate.resolve([{
    item_id: 'old-timeline',
    run_id: 'stale-timeline-run',
    timestamp: { start: '2026-08-31T08:00:00.000Z' },
  }]);
  await waitFor(
    () => card._loadingInProgress === false
      && card.automationStats.has('automation.fresh-timeline'),
    'fresh hass state after timeline supersession',
  );
  await flushTurns(12);

  assert.notEqual(card._timelineData?.meta?.run_id, 'stale-timeline-run');
  assert.notEqual(card._selectedTimelineId, 'automation.old-timeline');
  assert.notEqual(card._timelineData?.entityId, 'automation.old-timeline');
  assert.equal(
    freshHass.__calls.some(call => call.kind === 'callWS'
      && call.payload.type === 'trace/list' && call.payload.item_id === 'old-timeline'),
    false,
    'fresh hass must never receive a timeline request for an ID from stale automation maps',
  );
  assert.equal(
    oldHass.__calls.some(call => call.kind === 'callWS'
      && call.payload.type === 'trace/get'),
    false,
    'superseded timeline must not issue a full-trace follow-up call',
  );
  card.remove();
  assert.deepEqual(componentLeaks(shell, card), { listeners: [], observers: [] });
  assert.deepEqual(shell.errors, []);
});

test('completed timeline data is cleared when its automation is absent from a newer hass snapshot', { concurrency: false }, async t => {
  const shell = createShell();
  t.after(() => shell.dispose());
  shell.startCase();

  const oldHass = createHassFixture({
    label: 'old-complete',
    friendlyName: 'Old completed timeline',
    traces: [{
      item_id: 'old-complete',
      run_id: 'old-complete-run',
      state: 'stopped',
      script_execution: 'finished',
      timestamp: {
        start: '2026-08-31T08:00:00.000Z',
        finish: '2026-08-31T08:00:00.050Z',
      },
      path: [{ path: 'action/0', timestamp: '2026-08-31T08:00:00.010Z' }],
    }],
  });
  const card = shell.mount(oldHass);
  await waitForLoaded(card);
  card.currentTab = 'timeline';
  card._selectedTimelineId = 'automation.old-complete';
  await card._fetchTimeline('automation.old-complete');
  await flushTurns();

  assert.equal(card._activeTimelineToken, null);
  assert.equal(card._timelineData?.entityId, 'automation.old-complete');
  assert.match(card.shadowRoot.textContent, /Old completed timeline/);

  const freshHass = createHassFixture({
    label: 'fresh-complete',
    friendlyName: 'Fresh completed timeline',
  });
  shell.advanceClock(30_001);
  card.hass = freshHass;
  await waitFor(
    () => card._loadingInProgress === false
      && card.automationStats.has('automation.fresh-complete'),
    'fresh hass state after completed timeline replacement',
  );
  await flushTurns(12);

  assert.notEqual(card._selectedTimelineId, 'automation.old-complete');
  assert.notEqual(card._timelineData?.entityId, 'automation.old-complete');
  assert.doesNotMatch(card.shadowRoot.textContent, /Old completed timeline/);
  assert.equal(
    freshHass.__calls.some(call => call.kind === 'callWS'
      && call.payload.type === 'trace/list' && call.payload.item_id === 'old-complete'),
    false,
    'the replacement hass must never receive timeline calls for a removed automation',
  );

  card.remove();
  assert.deepEqual(componentLeaks(shell, card), { listeners: [], observers: [] });
  assert.deepEqual(shell.errors, []);
});

test('re-enabling card auto_refresh resumes a suppressed timeline with the newest hass snapshot', { concurrency: false }, async t => {
  const shell = createShell();
  t.after(() => shell.dispose());
  shell.startCase();

  const oldHass = createHassFixture({ label: 'old-panel', friendlyName: 'Old panel timeline' });
  const card = shell.mount(oldHass, { auto_refresh: true });
  await waitForLoaded(card);

  const oldTimelineGate = deferred();
  const nativeOldCallWS = oldHass.callWS.bind(oldHass);
  oldHass.callWS = async message => {
    if (message.type === 'trace/list' && message.item_id === 'old-panel') {
      oldHass.__calls.push({ kind: 'callWS', payload: message, label: 'old-panel' });
      return oldTimelineGate.promise;
    }
    return nativeOldCallWS(message);
  };
  card.currentTab = 'timeline';
  card._selectedTimelineId = 'automation.old-panel';
  card._fetchTimeline('automation.old-panel');
  await waitFor(
    () => oldHass.__calls.some(call => call.kind === 'callWS'
      && call.payload.type === 'trace/list' && call.payload.item_id === 'old-panel'),
    'held panel timeline request',
  );

  card.setConfig({ auto_refresh: false });
  const intermediateHass = createHassFixture({
    label: 'intermediate-panel',
    friendlyName: 'Intermediate panel timeline',
  });
  const newestHass = createHassFixture({
    label: 'newest-panel',
    friendlyName: 'Newest panel timeline',
  });
  card.hass = intermediateHass;
  card.hass = newestHass;
  oldTimelineGate.resolve([{
    item_id: 'old-panel',
    run_id: 'stale-panel-run',
    timestamp: { start: '2026-08-31T08:00:00.000Z' },
  }]);
  await flushTurns(12);

  assert.equal(card._suppressTimelineAutoFetch, true);
  assert.equal(card._selectedTimelineId, null);
  assert.equal(card.shadowRoot.querySelectorAll('#tl-auto-select option').length, 1);
  assert.equal(intermediateHass.__calls.length, 0);
  assert.equal(newestHass.__calls.length, 0);

  card.setConfig({ auto_refresh: true });
  await waitFor(
    () => card._loadingInProgress === false
      && card.automationStats.has('automation.newest-panel')
      && card._suppressTimelineAutoFetch === false,
    'auto-refresh resume with the newest hass snapshot',
  );
  await flushTurns(12);

  assert.equal(card.automationStats.has('automation.intermediate-panel'), false);
  assert.equal(card.automationStats.has('automation.newest-panel'), true);
  assert.notEqual(card._selectedTimelineId, 'automation.old-panel');
  assert.notEqual(card._timelineData?.entityId, 'automation.old-panel');
  assert.match(card.shadowRoot.textContent, /Newest panel timeline/);
  assert.equal(
    newestHass.__calls.some(call => call.kind === 'callWS'
      && call.payload.type === 'trace/list' && call.payload.item_id === 'old-panel'),
    false,
  );

  card.remove();
  assert.deepEqual(componentLeaks(shell, card), { listeners: [], observers: [] });
  assert.deepEqual(shell.errors, []);
});

test('late toggle success and failure are inert after both cards detach', { concurrency: false }, async t => {
  const shell = createShell();
  t.after(() => shell.dispose());
  shell.startCase();

  const successGate = deferred();
  const failureGate = deferred();
  const successHass = createHassFixture({
    label: 'toggle-success',
    friendlyName: 'Toggle success',
    state: 'off',
    gates: { callService: successGate },
  });
  const failureHass = createHassFixture({
    label: 'toggle-failure',
    friendlyName: 'Toggle failure',
    state: 'off',
    gates: { callService: failureGate },
  });
  const successCard = shell.mount(successHass, { show_disabled: true });
  const failureCard = shell.mount(failureHass, { show_disabled: true });
  await Promise.all([waitForLoaded(successCard), waitForLoaded(failureCard)]);
  successCard.setActiveTab('optimization');
  failureCard.setActiveTab('optimization');

  let successNotifications = 0;
  let failureNotifications = 0;
  const onSuccessNotification = () => { successNotifications += 1; };
  const onFailureNotification = () => { failureNotifications += 1; };
  successCard.addEventListener('hass-notification', onSuccessNotification);
  failureCard.addEventListener('hass-notification', onFailureNotification);
  successCard.shadowRoot.querySelector('.toggle-btn[data-action="enable"]').click();
  failureCard.shadowRoot.querySelector('.toggle-btn[data-action="enable"]').click();
  await waitFor(() => successHass.__calls.some(call => call.kind === 'callService'), 'held success toggle');
  await waitFor(() => failureHass.__calls.some(call => call.kind === 'callService'), 'held failed toggle');

  successCard.remove();
  failureCard.remove();
  successGate.resolve();
  failureGate.reject(new Error('expected rejected toggle'));
  await flushTurns(12);

  assert.equal(successNotifications, 0);
  assert.equal(failureNotifications, 0);
  assert.equal(successCard._refreshTimer, null);
  assert.equal(failureCard._refreshTimer, null);
  successCard.removeEventListener('hass-notification', onSuccessNotification);
  failureCard.removeEventListener('hass-notification', onFailureNotification);
  assert.deepEqual(componentLeaks(shell, successCard), { listeners: [], observers: [] });
  assert.deepEqual(componentLeaks(shell, failureCard), { listeners: [], observers: [] });
  assert.deepEqual(shell.errors, []);
});

test('attached toggle failure emits only a fixed safe message and never reads the backend message', { concurrency: false }, async t => {
  const shell = createShell();
  t.after(() => shell.dispose());
  shell.startCase();
  const hass = createHassFixture({
    label: 'toggle-private-error',
    friendlyName: 'Toggle privacy',
    state: 'off',
  });
  const rawError = {};
  Object.defineProperty(rawError, 'message', {
    enumerable: true,
    get() { throw new Error('PRIVATE_TOGGLE_MESSAGE_GETTER_MUST_NOT_RUN'); },
  });
  hass.callService = async (domain, service, data) => {
    hass.__calls.push({ kind: 'callService', payload: { domain, service, data }, label: 'toggle-private-error' });
    throw rawError;
  };
  const consoleErrors = [];
  const nativeConsoleError = shell.window.console.error;
  shell.window.console.error = (...args) => consoleErrors.push(args);
  const card = shell.mount(hass, { show_disabled: true });
  await waitForLoaded(card);
  card.setActiveTab('optimization');
  let notification = null;
  card.addEventListener('hass-notification', event => { notification = event.detail.message; }, { once: true });
  try {
    card.shadowRoot.querySelector('.toggle-btn[data-action="enable"]').click();
    await waitFor(() => notification !== null, 'safe toggle failure notification');
  } finally {
    shell.window.console.error = nativeConsoleError;
  }
  assert.equal(notification, '⚠️ Could not change automation state.');
  assert.deepEqual(consoleErrors, [['[ha-automation-analyzer] automation_toggle_failed']]);
  assert.doesNotMatch(JSON.stringify({ notification, consoleErrors }), /PRIVATE_TOGGLE_MESSAGE/);
  card.remove();
  assert.deepEqual(shell.errors, []);
});

test('a newer hass snapshot supersedes one in-flight load without mixing state', { concurrency: false }, async t => {
  const shell = createShell();
  t.after(() => shell.dispose());
  shell.startCase();

  const oldGate = deferred();
  const oldHass = createHassFixture({
    label: 'superseded',
    friendlyName: 'Superseded automation',
    gates: { 'config/automation/list': oldGate },
  });
  const card = shell.mount(oldHass);
  await waitFor(
    () => oldHass.__calls.some(call => call.kind === 'callWS'
      && call.payload.type === 'config/automation/list'),
    'superseded in-flight config request',
  );

  const freshHass = createHassFixture({ label: 'replacement', friendlyName: 'Replacement automation' });
  card.hass = freshHass;
  oldGate.resolve([{
    id: 'superseded',
    alias: 'Superseded automation',
    trigger: [{ platform: 'state' }],
    action: [],
    condition: [],
  }]);
  await waitFor(
    () => card._loadingInProgress === false
      && card.automationStats.has('automation.replacement'),
    'replacement hass refresh',
  );
  await flushTurns();

  assert.equal(card.automationStats.has('automation.superseded'), false);
  assert.equal(card.automationStats.has('automation.replacement'), true);
  assert.match(card.shadowRoot.textContent, /Replacement automation/);
  assert.doesNotMatch(card.shadowRoot.textContent, /Superseded automation/);
  assert.equal(
    oldHass.__calls.filter(call => call.kind === 'callWS').length,
    1,
    'superseded hass must not issue follow-up work',
  );
  assert.equal(
    freshHass.__calls.filter(call => call.kind === 'callWS'
      && call.payload.type === 'config/automation/list').length,
    1,
  );
  card.remove();
  assert.deepEqual(componentLeaks(shell, card), { listeners: [], observers: [] });
  assert.deepEqual(shell.errors, []);
});

test('reconnecting the same element performs one coherent refresh with fresh hass state', { concurrency: false }, async t => {
  const shell = createShell();
  t.after(() => shell.dispose());
  shell.startCase();

  const oldHass = createHassFixture({ label: 'old', friendlyName: 'Old automation' });
  const card = shell.mount(oldHass);
  await waitForLoaded(card);
  card.remove();
  assert.equal(card.automationStats.size, 0);

  const freshHass = createHassFixture({ label: 'fresh', friendlyName: 'Fresh automation' });
  shell.document.body.append(card);
  card.hass = freshHass;
  await waitFor(
    () => card._loadingInProgress === false
      && card.automationStats.has('automation.fresh'),
    'fresh reconnect load',
  );
  await flushTurns();

  assert.equal(card.automationStats.has('automation.old'), false);
  assert.equal(card.automationStats.has('automation.fresh'), true);
  assert.match(card.shadowRoot.textContent, /Fresh automation/);
  assert.doesNotMatch(card.shadowRoot.textContent, /Old automation/);
  assert.equal(card._renderTimer, null);
  assert.equal(
    freshHass.__calls.filter(call => call.kind === 'callWS'
      && call.payload.type === 'config/automation/list').length,
    1,
    'fresh hass should produce exactly one config refresh',
  );
  shell.assertForeignUnchanged();

  card.remove();
  assert.deepEqual(componentLeaks(shell, card), { listeners: [], observers: [] });
  assert.deepEqual(shell.errors, []);
});

test('chart fallback compacts its canvas wrapper instead of leaving a blank panel', { concurrency: false }, async t => {
  const shell = createShell();
  t.after(() => shell.dispose());
  shell.startCase();

  const hass = createHassFixture({
    label: 'chart-fallback',
    friendlyName: 'Chart fallback automation',
  });
  const card = shell.mount(hass);
  await waitForLoaded(card);
  card.setActiveTab('performance');
  await card._drawCharts();
  await flushTurns();

  const fallback = card.shadowRoot.querySelector('.chart-unavailable');
  assert.ok(fallback, 'missing honest Chart.js-unavailable explanation');
  assert.equal(fallback.parentElement?.classList.contains('chart-unavailable-wrap'), true);
  assert.equal(fallback.closest('.card')?.classList.contains('chart-unavailable-card'), true);
  assert.equal(fallback.parentElement?.querySelector('canvas'), null);
  assert.match(fallback.textContent, /Chart unavailable/i);

  card.remove();
  assert.deepEqual(componentLeaks(shell, card), { listeners: [], observers: [] });
  assert.deepEqual(shell.errors, []);
});
