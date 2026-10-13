import assert from 'node:assert/strict';
import test from 'node:test';
import { createShell, createHassFixture, waitFor } from './helpers/ha-shell.mjs';
async function fixture(t) {
  const observers = [];
  const shell = createShell({ beforeLoad(window) {
    window.ResizeObserver = class {
      constructor(callback) { this.callback = callback; this.targets = new Set(); observers.push(this); }
      observe(target) { this.targets.add(target); }
      disconnect() { this.targets.clear(); }
    };
  } });
  t.after(() => shell.dispose()); shell.startCase();
  const hass = createHassFixture({ label: 'navigation' });
  const card = shell.mount(hass, { auto_refresh: false, show_support: false });
  await waitFor(() => !card._loadingInProgress && card.automationStats.size === 1, 'base card');
  const picker = () => card.shadowRoot.querySelector('#aa-tab-picker');
  const resize = width => {
    const observer = observers.find(item => item.targets.has(card));
    assert.ok(observer, 'observe card width, not viewport');
    observer.callback([{ target: card, contentRect: { width } }]);
  };
  return { shell, hass, card, observers, picker, resize };
}
test('narrow picker keeps every tab, original navigation and localized labels', async t => {
  const f = await fixture(t); const before = f.hass.__calls.length;
  assert.ok(f.picker(), 'native tab picker');
  assert.equal(f.picker().labels.length, 1);
  assert.deepEqual(Array.from(f.picker().options, option => option.value), ['overview', 'performance', 'optimization', 'timeline']);
  f.resize(260); f.picker().focus();
  for (const value of ['performance', 'optimization', 'overview']) {
    const picker = f.picker(); picker.value = value;
    picker.dispatchEvent(new f.shell.window.Event('change', { bubbles: true }));
    assert.equal(f.card.currentTab, value);
    assert.equal(f.picker().value, value);
    assert.equal(f.card.shadowRoot.activeElement, f.picker());
    assert.ok(f.shell.window.location.hash.endsWith('/' + value));
  }
  f.card.hass = { ...f.hass, language: 'pl' };
  assert.equal(f.picker().labels[0].textContent.trim(), 'Zakładka');
  assert.equal(f.picker().options[0].textContent, 'Przegląd');
  assert.equal(f.card.shadowRoot.activeElement, f.picker());
  assert.equal(f.hass.__calls.length, before);
});
test('resize transfers only navigation focus and does not rebuild content or read data', async t => {
  const f = await fixture(t); const root = f.card.shadowRoot;
  const tab = root.querySelector('.tab-btn.active'); tab.focus();
  f.resize(260);
  assert.equal(root.querySelector('.tabs').hidden, true);
  assert.equal(root.activeElement, f.picker());
  f.resize(280);
  assert.equal(root.querySelector('.tabs').hidden, false);
  assert.equal(root.activeElement, tab);
  const input = root.querySelector('#aa-filter-input'); input.focus();
  input.value = 'unsubmitted'; input.setSelectionRange(2, 5);
  const calls = f.hass.__calls.length;
  f.resize(260); f.resize(900);
  assert.equal(root.querySelector('#aa-filter-input'), input);
  assert.equal(root.activeElement, input);
  assert.equal(input.value, 'unsubmitted'); assert.equal(input.selectionStart, 2);
  assert.equal(f.hass.__calls.length, calls);
  f.card.remove();
  assert.equal(f.observers.some(item => item.targets.has(f.card)), false);
});
