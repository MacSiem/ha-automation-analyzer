import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createShell, createHassFixture, waitFor, flushTurns } from './helpers/ha-shell.mjs';

async function fixture(t) {
  const handoffs = [], blobs = new Map();
  const shell = createShell({ beforeLoad(window) {
    window.Blob = Blob;
    window.URL.createObjectURL = blob => { const url = 'blob:synthetic-' + blobs.size; blobs.set(url, blob); return url; };
    window.URL.revokeObjectURL = () => {};
    window.HTMLAnchorElement.prototype.click = function () { handoffs.push({ filename: this.download, blob: blobs.get(this.href) }); };
  } });
  t.after(() => shell.dispose()); shell.startCase();
  const trace = JSON.parse(readFileSync(new URL('./fixtures/trace-v1.json', import.meta.url)));
  trace.item_id = 'preview-source'; trace.run_id = 'private-run-id';
  const hass = createHassFixture({ label: 'preview-source', traces: [trace] });
  const card = shell.mount(hass, { auto_refresh: false, show_support: false });
  await waitFor(() => !card._loadingInProgress && card.automationStats.size === 1, 'source loaded');
  card.setActiveTab('timeline');
  await waitFor(() => card._timelineData?.capability?.status === 'available', 'actual normalized trace');
  await flushTurns();
  const f = { shell, card, hass, handoffs };
  return f;
}
const root = f => f.card.shadowRoot.querySelector('[data-ha-tools-export]')?.shadowRoot;
const field = (f, name) => root(f)?.querySelector(`[data-export="${name}"]`);
async function open(f) {
  f.card.shadowRoot.querySelector('#tl-export-btn').click();
  await flushTurns();
  assert.ok(root(f), 'diagnostic opens a review before any download');
  await waitFor(() => !!field(f, 'preview')?.textContent, 'confirmed preview');
}
function change(f, name, value) {
  const node = field(f, name); node.value = value;
  node.dispatchEvent(new f.shell.window.Event('input', { bubbles: true }));
}

test('diagnostic opens safe exact JSON preview with filename, scope and private consent off', async t => {
  const f = await fixture(t), before = f.hass.__calls.length;
  await open(f);
  assert.equal(f.handoffs.length, 0); assert.equal(f.hass.__calls.length, before);
  assert.equal(field(f, 'filename').value, 'ha-automation-analyzer-diagnostic.json');
  assert.equal(field(f, 'format').value, 'json'); assert.equal(field(f, 'private').checked, false);
  const text = field(f, 'preview').textContent, payload = JSON.parse(text);
  assert.equal(payload.run.alias, 'run_001'); assert.equal(payload.run.duration_ms, 120);
  assert.doesNotMatch(text, /PRIVATE_|private-run-id|preview-source|person\.|secret|service_data/);
  assert.equal(payload.comparison, undefined);
  assert.doesNotMatch(field(f, 'included').textContent, /comparison/i);
  assert.ok(field(f, 'included').textContent.length); assert.ok(field(f, 'excluded').textContent.length);
  assert.match(field(f, 'source-limit').textContent, /retained|retention/i);
});
test('explicit Save hands off only frozen preview bytes under the reviewed filename once', async t => {
  const f = await fixture(t); await open(f);
  change(f, 'filename', 'reviewed-diagnostic.json'); assert.equal(field(f, 'save').disabled, true);
  field(f, 'refresh').click(); await flushTurns();
  const bytes = field(f, 'preview').textContent;
  field(f, 'save').click(); await flushTurns(); field(f, 'save').click();
  assert.equal(f.handoffs.length, 1);
  assert.equal(f.handoffs[0].filename, 'reviewed-diagnostic.json');
  assert.equal(await f.handoffs[0].blob.text(), bytes);
  assert.match(field(f, 'message').textContent, /filesystem is not confirmed/);
});
test('DOM preview tampering cannot change the saved artifact', async t => {
  const f = await fixture(t); await open(f);
  field(f, 'preview').textContent = '{"changed":true}'; field(f, 'save').click(); await flushTurns();
  assert.equal(f.handoffs.length, 0); assert.equal(field(f, 'preview').textContent, '');
  assert.equal(field(f, 'save').disabled, true);
});
test('role loss discards bytes and private consent before another Save', async t => {
  const f = await fixture(t); await open(f);
  field(f, 'private').checked = true;
  const before = f.hass.__calls.length;
  f.card.hass = { ...f.hass, user: { ...f.hass.user, is_admin: false } }; await flushTurns();
  assert.equal(field(f, 'preview')?.textContent || '', '');
  assert.notEqual(field(f, 'private')?.checked, true);
  field(f, 'save')?.click(); assert.equal(f.handoffs.length, 0); assert.equal(f.hass.__calls.length, before);
});
test('ordinary render preserves filename selection and exact preview without another source read', async t => {
  const f = await fixture(t); await open(f); const before = f.hass.__calls.length;
  const name = field(f, 'filename'); name.focus(); name.setSelectionRange(2, 7); const value = name.value;
  f.card.render(); await flushTurns();
  assert.equal(field(f, 'filename'), name); assert.equal(name.value, value);
  assert.equal(root(f).activeElement, name); assert.equal(name.selectionStart, 2); assert.equal(name.selectionEnd, 7);
  assert.ok(field(f, 'preview').textContent); assert.equal(f.hass.__calls.length, before);
});
test('offline invalidates the preview and online alone cannot authorize the stale trace', async t => {
  const f = await fixture(t); await open(f);
  f.shell.window.dispatchEvent(new f.shell.window.Event('offline')); await flushTurns();
  assert.equal(field(f, 'preview').textContent, ''); assert.equal(field(f, 'save').disabled, true);
  f.shell.window.dispatchEvent(new f.shell.window.Event('online')); field(f, 'refresh').click(); await flushTurns();
  assert.equal(field(f, 'preview').textContent, ''); assert.equal(f.handoffs.length, 0);
  await f.card._fetchTimeline('automation.preview-source'); await flushTurns();
  field(f, 'refresh').click(); await flushTurns(); assert.ok(field(f, 'preview').textContent);
});
test('detach closes the export and releases its document listeners', async t => {
  const f = await fixture(t); await open(f); f.card.remove(); await flushTurns();
  assert.equal(root(f), undefined);
  assert.deepEqual(f.shell.listeners.liveLongLivedFor(f.card), []);
  assert.equal(f.handoffs.length, 0);
});

test('connection notifications do not depend on DOM Event payloads', async t => {
  const f = await fixture(t); await open(f);
  const callbacks = new Map();
  const connection = { ...f.hass.connection, connected: true,
    addEventListener: (type, callback) => callbacks.set(type, callback),
    removeEventListener: (type, callback) => { if (callbacks.get(type) === callback) callbacks.delete(type); } };
  f.card.hass = { ...f.hass, connection }; await flushTurns();
  await f.card._fetchTimeline('automation.preview-source'); await flushTurns();
  field(f, 'refresh').click(); await flushTurns(); assert.ok(field(f, 'preview').textContent);
  callbacks.get('disconnected')(); await flushTurns();
  assert.equal(field(f, 'preview').textContent, ''); assert.equal(field(f, 'save').disabled, true);
  callbacks.get('ready')(); field(f, 'refresh').click(); await flushTurns();
  assert.equal(field(f, 'preview').textContent, '');
  f.card.remove(); assert.equal(callbacks.size, 0); assert.equal(f.handoffs.length, 0);
});
