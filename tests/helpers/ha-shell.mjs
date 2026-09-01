import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setImmediate as waitImmediate } from 'node:timers/promises';

import { JSDOM } from 'jsdom';

const CARD_TAG = 'ha-automation-analyzer';
const FOREIGN_TAG = 'ha-runtime-foreign-card';

export function deferred() {
  let resolvePromise;
  let rejectPromise;
  const promise = new Promise((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

export async function flushTurns(count = 8) {
  for (let index = 0; index < count; index += 1) await waitImmediate();
}

export async function waitFor(predicate, label, attempts = 80) {
  for (let index = 0; index < attempts; index += 1) {
    if (predicate()) return;
    await flushTurns(1);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function installTimerLedger(window) {
  const nativeSetTimeout = window.setTimeout.bind(window);
  const nativeClearTimeout = window.clearTimeout.bind(window);
  const records = new Map();
  let recording = false;

  window.setTimeout = (callback, delay = 0, ...args) => {
    let handle;
    const wrapped = (...callbackArgs) => {
      const record = records.get(handle);
      if (record) {
        record.live = false;
        record.fired = true;
      }
      return callback(...callbackArgs);
    };
    handle = nativeSetTimeout(wrapped, delay, ...args);
    if (recording) {
      records.set(handle, {
        handle,
        callback: () => callback(...args),
        delay,
        live: true,
        cleared: false,
        fired: false,
      });
    }
    return handle;
  };

  window.clearTimeout = (handle) => {
    const record = records.get(handle);
    if (record) {
      record.live = false;
      record.cleared = true;
    }
    return nativeClearTimeout(handle);
  };

  return {
    start() { recording = true; },
    get(handle) { return records.get(handle); },
    live(handles) {
      return handles
        .map(handle => records.get(handle))
        .filter(record => record?.live);
    },
    liveAll() { return [...records.values()].filter(record => record.live); },
    invokeCaptured(handle) {
      const record = records.get(handle);
      if (!record) throw new Error(`Unknown tracked timer handle: ${String(handle)}`);
      return record.callback();
    },
    dispose() {
      for (const record of records.values()) {
        if (record.live) nativeClearTimeout(record.handle);
        record.live = false;
      }
    },
  };
}

function installListenerLedger(window) {
  const prototype = window.EventTarget.prototype;
  const nativeAdd = prototype.addEventListener;
  const nativeRemove = prototype.removeEventListener;
  const records = [];
  let recording = false;

  prototype.addEventListener = function addEventListener(type, listener, options) {
    if (recording && listener) {
      records.push({
        target: this,
        type,
        listener,
        capture: typeof options === 'boolean' ? options : Boolean(options?.capture),
        live: true,
      });
    }
    return nativeAdd.call(this, type, listener, options);
  };

  prototype.removeEventListener = function removeEventListener(type, listener, options) {
    const capture = typeof options === 'boolean' ? options : Boolean(options?.capture);
    for (let index = records.length - 1; index >= 0; index -= 1) {
      const record = records[index];
      if (record.live && record.target === this && record.type === type
        && record.listener === listener && record.capture === capture) {
        record.live = false;
        break;
      }
    }
    return nativeRemove.call(this, type, listener, options);
  };

  const belongsTo = (target, card) => {
    if (target === card || target === window || target === window.document) return true;
    const root = target?.getRootNode?.();
    return root?.host === card;
  };

  return {
    start() { recording = true; },
    liveAllLongLived() {
      return records.filter(record => record.live
        && !(record.target === window.document && record.capture
          && (record.type === 'mouseover' || record.type === 'mouseout'))
        && (record.target === window || record.target === window.document
          || record.target?.isConnected));
    },
    liveLongLivedFor(card) {
      return records.filter(record => record.live
        && !(record.target === window.document && record.capture
          && (record.type === 'mouseover' || record.type === 'mouseout'))
        && belongsTo(record.target, card)
        && (record.target === card || record.target === window || record.target === window.document
          || record.target?.isConnected));
    },
    restore() {
      prototype.addEventListener = nativeAdd;
      prototype.removeEventListener = nativeRemove;
    },
  };
}

function installObserverLedger(window) {
  const records = [];
  const originals = new Map();
  let recording = false;

  for (const name of ['MutationObserver', 'ResizeObserver', 'IntersectionObserver']) {
    const NativeObserver = window[name] || class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    originals.set(name, NativeObserver);
    window[name] = class TrackedObserver {
      constructor(callback) {
        this._native = new NativeObserver(callback);
        this._record = { name, targets: new Set(), live: true };
        if (recording) records.push(this._record);
      }
      observe(target, options) {
        this._record.targets.add(target);
        return this._native.observe?.(target, options);
      }
      unobserve(target) {
        this._record.targets.delete(target);
        return this._native.unobserve?.(target);
      }
      disconnect() {
        this._record.live = false;
        this._record.targets.clear();
        return this._native.disconnect?.();
      }
      takeRecords() { return this._native.takeRecords?.() || []; }
    };
  }

  return {
    start() { recording = true; },
    liveAllLongLived() {
      return records.filter(record => record.live && [...record.targets].some(target => (
        target === window || target === window.document || target?.isConnected
      )));
    },
    liveLongLivedFor(card) {
      return records.filter(record => record.live && [...record.targets].some(target => {
        if (target === card || target === window || target === window.document) return true;
        const root = target?.getRootNode?.();
        return root?.host === card && target.isConnected;
      }));
    },
    restore() {
      for (const [name, Original] of originals) window[name] = Original;
    },
  };
}

function installErrorCapture(window) {
  const errors = [];
  const onError = event => errors.push(event.error || event.message || event);
  const onUnhandled = event => errors.push(event.reason || event);
  const onProcessUnhandled = reason => errors.push(reason);
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onUnhandled);
  process.on('unhandledRejection', onProcessUnhandled);
  return {
    errors,
    dispose() {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandled);
      process.removeListener('unhandledRejection', onProcessUnhandled);
    },
  };
}

function stubBrowser(window) {
  Object.defineProperty(window.navigator, 'language', {
    configurable: true,
    get: () => 'en-US',
  });
  window.matchMedia = () => ({
    matches: false,
    media: '',
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() { return false; },
  });
  window.requestAnimationFrame = callback => {
    queueMicrotask(() => callback(window.Date.now()));
    return 1;
  };
  window.cancelAnimationFrame = () => {};
  window.HTMLCanvasElement.prototype.getContext = () => null;
}

function defineForeignCard(window) {
  class ForeignCard extends window.HTMLElement {
    constructor() {
      super();
      this.renderCount = 1;
      this.attachShadow({ mode: 'open' });
      this.shadowRoot.innerHTML = '<p data-foreign-marker="intact">Foreign HA Tools card</p>';
    }
  }
  window.customElements.define(FOREIGN_TAG, ForeignCard);
  const element = window.document.createElement(FOREIGN_TAG);
  window.document.body.append(element);
  return {
    element,
    html: element.shadowRoot.innerHTML,
    renderCount: element.renderCount,
  };
}

export function createHassFixture({
  label,
  entityId = `automation.${label}`,
  internalId = label,
  friendlyName = label,
  state = 'on',
  lastTriggered = null,
  configs,
  traces = [],
  history = [],
  gates = {},
} = {}) {
  const calls = [];
  const configList = configs || [{
    id: internalId,
    alias: friendlyName,
    trigger: [{ platform: 'state' }],
    condition: [],
    action: [{ service: 'light.turn_on' }],
  }];

  const record = (kind, payload) => {
    calls.push({ kind, payload, label });
  };
  const maybeGate = type => gates[type]?.promise;

  const hass = {
    __label: label,
    __calls: calls,
    states: {
      [entityId]: {
        entity_id: entityId,
        state,
        attributes: {
          id: internalId,
          friendly_name: friendlyName,
          last_triggered: lastTriggered,
        },
        last_changed: '2026-08-31T08:00:00.000Z',
        last_updated: '2026-08-31T08:00:00.000Z',
      },
    },
    themes: { darkMode: false, themes: {} },
    language: 'en',
    locale: { language: 'en', number_format: 'language', time_format: '24' },
    user: { id: 'runtime-user', name: 'Runtime User', is_admin: true, is_owner: true },
    config: { unit_system: { temperature: 'C' }, version: '2026.8.0' },
    async callWS(message) {
      record('callWS', message);
      const held = maybeGate(message.type);
      if (held) return held;
      if (message.type === 'config/automation/list') return configList;
      if (message.type === 'trace/list') {
        return traces
          .map(trace => ({ domain: 'automation', ...trace }))
          .filter(trace => !message.item_id || trace.item_id === message.item_id)
          .map(trace => ({
            last_step: trace.last_step ?? trace.path?.at(-1)?.path ?? null,
            run_id: trace.run_id,
            state: trace.state,
            script_execution: trace.script_execution ?? null,
            timestamp: trace.timestamp,
            domain: trace.domain,
            item_id: trace.item_id,
            ...(trace.not_triggered === true ? { not_triggered: true } : {}),
            ...(Object.hasOwn(trace, 'trigger') ? { trigger: trace.trigger } : {}),
          }));
      }
      if (message.type === 'trace/get') {
        const trace = traces.find(candidate => candidate.run_id === message.run_id
          && candidate.item_id === message.item_id);
        return trace ? { domain: 'automation', ...trace } : null;
      }
      return [];
    },
    async callApi(method, path) {
      record('callApi', { method, path });
      const held = maybeGate(`callApi:${path}`);
      if (held) return held;
      if (path.startsWith('config/automation/config/')) return configList[0] || null;
      if (path.startsWith('history/period/')) return [history];
      return {};
    },
    async callService(domain, service, data) {
      record('callService', { domain, service, data });
      const held = maybeGate('callService');
      if (held) return held;
      return undefined;
    },
    formatEntityState(entity) { return String(entity?.state ?? ''); },
    formatEntityAttributeValue() { return ''; },
    connection: {
      subscribeEvents: async () => () => {},
      subscribeMessage: async () => () => {},
      sendMessagePromise: async () => [],
      socket: { readyState: 1 },
    },
  };

  return hass;
}

export function createShell() {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'http://localhost/lovelace/runtime',
  });
  const { window } = dom;
  stubBrowser(window);
  let now = Date.parse('2026-08-31T10:00:00.000Z');
  window.Date.now = () => now;

  const errors = installErrorCapture(window);
  const timers = installTimerLedger(window);
  const listeners = installListenerLedger(window);
  const observers = installObserverLedger(window);
  const foreign = defineForeignCard(window);
  const source = readFileSync(resolve(process.cwd(), 'ha-automation-analyzer.js'), 'utf8');
  window.eval(`${source}\n//# sourceURL=ha-automation-analyzer.js`);
  if (!window.customElements.get(CARD_TAG)) {
    throw new Error(`${CARD_TAG} did not register`);
  }

  return {
    window,
    document: window.document,
    timers,
    listeners,
    observers,
    errors: errors.errors,
    foreign,
    startCase() {
      timers.start();
      listeners.start();
      observers.start();
    },
    advanceClock(milliseconds) { now += milliseconds; },
    mount(hass, config = {}) {
      const card = window.document.createElement(CARD_TAG);
      card.setConfig({ type: `custom:${CARD_TAG}`, ...config });
      window.document.body.append(card);
      card.hass = hass;
      return card;
    },
    assertForeignUnchanged() {
      if (foreign.element.shadowRoot.innerHTML !== foreign.html
        || foreign.element.renderCount !== foreign.renderCount) {
        throw new Error('Foreign HA Tools element was mutated');
      }
    },
    dispose() {
      timers.dispose();
      listeners.restore();
      observers.restore();
      errors.dispose();
      window.close();
    },
  };
}

export function findExecutableDom(root) {
  return root.querySelector([
    'script',
    '[data-hostile-runtime]',
    '[data-hostile-config]',
    '[data-hostile-persisted]',
    '[data-hostile-trace]',
    '[onclick]',
    '[onerror]',
    '[onload]',
    '[srcdoc]',
    '[href^="javascript:"]',
    '[src^="javascript:"]',
  ].join(','));
}
