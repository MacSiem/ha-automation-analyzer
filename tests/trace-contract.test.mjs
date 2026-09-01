import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  createHassFixture,
  createShell,
  deferred,
  flushTurns,
  waitFor,
} from './helpers/ha-shell.mjs';

const FIXTURE_ROOT = new URL('./fixtures/', import.meta.url);
const OBSERVED_AT = '2026-08-31T12:00:00.000Z';
const PRIVATE_CANARIES = [
  'PRIVATE_DOOR_OPENED',
  'PRIVATE_PERSON',
  'PRIVATE_MESSAGE',
  'PRIVATE_TEMPLATE_ERROR',
  'person.private_resident',
  'private-user-id',
  'private-context',
  'private-child-script',
];

function fixture(name) {
  return JSON.parse(readFileSync(new URL(name, FIXTURE_ROOT), 'utf8'));
}

function toPlain(value) {
  return JSON.parse(JSON.stringify(value));
}

function contractFor(shell) {
  const Card = shell.window.customElements.get('ha-automation-analyzer');
  assert.ok(Card?.traceContract, 'card must expose the versioned trace contract');
  return Card.traceContract;
}

function assertPrivateCanariesAbsent(value, label) {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  for (const canary of PRIVATE_CANARIES) {
    assert.doesNotMatch(serialized, new RegExp(canary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${label} leaked ${canary}`);
  }
}

function listEntry(index = 0, itemId = 'private-bedroom-routine') {
  return {
    last_step: 'action/0',
    run_id: `run-${index}`,
    state: 'stopped',
    script_execution: 'finished',
    timestamp: { start: '2026-08-31T00:00:00Z', finish: '2026-08-31T00:00:01Z' },
    domain: 'automation',
    item_id: itemId,
  };
}

function inspectionBytes(value) {
  let bytes = 0;
  const visit = (current) => {
    if (current === null) { bytes += 4; return; }
    if (typeof current === 'string') { bytes += Buffer.byteLength(current, 'utf8') + 2; return; }
    if (typeof current === 'number') { bytes += 16; return; }
    if (typeof current === 'boolean') { bytes += 5; return; }
    if (Array.isArray(current)) {
      bytes += 2;
      current.forEach(visit);
      return;
    }
    bytes += 2;
    for (const [key, item] of Object.entries(current)) {
      bytes += Buffer.byteLength(key, 'utf8') + 2;
      visit(item);
    }
  };
  visit(value);
  return bytes;
}

test('canonical v1 and running traces normalize deterministically without private payloads', { concurrency: false }, t => {
  const shell = createShell();
  t.after(() => shell.dispose());
  const contract = contractFor(shell);

  const stopped = contract.normalizeFull(fixture('trace-v1.json'), {
    expectedItemId: 'private-bedroom-routine',
    observedAt: OBSERVED_AT,
  });
  assert.equal(stopped.status, 'available');
  assert.equal(stopped.source, 'home_assistant.trace_ws_v1');
  assert.equal(stopped.observed_at, OBSERVED_AT);
  assert.deepEqual(toPlain(stopped.evidence), {
    endpoint: 'trace/get',
    schema: 'ha-trace-v1',
    node_count: 3,
    run_state: 'stopped',
  });
  assert.equal(stopped.data.run_duration_ms, 120);
  assert.deepEqual(toPlain(stopped.data.nodes), [
    { path: 'trigger/0', ordinal: 0, status: 'pass', offset_ms: 10 },
    { path: 'action/0', ordinal: 0, status: 'error', offset_ms: 50 },
    { path: 'action/1', ordinal: 0, status: 'changed', offset_ms: 90 },
  ]);
  assertPrivateCanariesAbsent(stopped, 'normalized stopped trace');

  const nonIsoObservedAt = contract.normalizeFull(fixture('trace-v1.json'), {
    expectedItemId: 'private-bedroom-routine',
    observedAt: 'Mon, 31 Aug 2026 12:00:00 GMT',
  });
  assert.notEqual(nonIsoObservedAt.observed_at, 'Mon, 31 Aug 2026 12:00:00 GMT');
  assert.match(nonIsoObservedAt.observed_at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

  const running = contract.normalizeFull(fixture('trace-running-v1.json'), {
    expectedItemId: 'private-bedroom-routine',
    observedAt: OBSERVED_AT,
  });
  assert.equal(running.status, 'available');
  assert.equal(running.data.run_state, 'running');
  assert.equal(running.data.run_duration_ms, null);
  assert.equal(Object.hasOwn(running.data.nodes[0], 'duration_ms'), false);
  assertPrivateCanariesAbsent(running, 'normalized running trace');

  const shuffled = fixture('trace-v1.json');
  shuffled.trace = {
    'trigger/0': shuffled.trace['trigger/0'],
    'action/0': shuffled.trace['action/0'],
    'action/1': shuffled.trace['action/1'],
  };
  assert.deepEqual(
    toPlain(contract.normalizeFull(shuffled, {
      expectedItemId: 'private-bedroom-routine',
      observedAt: OBSERVED_AT,
    })),
    toPlain(stopped),
  );
});

test('parallel, nested, repeated, and identical-timestamp nodes keep deterministic offsets without invented durations', { concurrency: false }, t => {
  const shell = createShell();
  t.after(() => shell.dispose());
  const contract = contractFor(shell);
  const parallel = contract.normalizeFull(fixture('trace-parallel-v1.json'), {
    expectedItemId: 'private-bedroom-routine', observedAt: OBSERVED_AT,
  });
  assert.equal(parallel.status, 'available');
  assert.deepEqual(toPlain(parallel.data.nodes), [
    { path: 'action/0', ordinal: 0, status: 'pass', offset_ms: 20 },
    { path: 'action/0', ordinal: 1, status: 'pass', offset_ms: 90 },
    { path: 'action/0/parallel/0', ordinal: 0, status: 'pass', offset_ms: 90 },
    { path: 'action/0/parallel/1', ordinal: 0, status: 'pass', offset_ms: 90 },
  ]);
  assert.equal(parallel.data.nodes.every(node => !Object.hasOwn(node, 'duration_ms')), true);
  assertPrivateCanariesAbsent(parallel, 'parallel normalized trace');

  const running = contract.normalizeFull(fixture('trace-running-v1.json'), {
    expectedItemId: 'private-bedroom-routine', observedAt: OBSERVED_AT,
  });
  const comparison = contract.compare(parallel.data, running.data, {
    minimumDeltaMs: 20, minimumRatio: 1.25, observedAt: OBSERVED_AT,
  });
  assert.equal(comparison.status, 'available');
  assert.equal(comparison.data.run.classification, 'unchanged');
  assert.equal(comparison.data.run.delta_ms, null);
  const invalidComparable = toPlain(parallel.data);
  invalidComparable.nodes[0].offset_ms = -1;
  assert.equal(contract.compare(invalidComparable, running.data, {
    observedAt: OBSERVED_AT,
  }).status, 'malformed');
  const nonExecution = toPlain(parallel.data);
  nonExecution.kind = 'non_execution';
  assert.equal(contract.compare(nonExecution, running.data, {
    observedAt: OBSERVED_AT,
  }).status, 'no_data');
  const emptyBaseline = toPlain(parallel.data);
  emptyBaseline.nodes = [];
  const ordinalCurrent = toPlain(parallel.data);
  ordinalCurrent.nodes = [
    { path: 'action/9', ordinal: 10, status: 'pass', offset_ms: 20 },
    { path: 'action/9', ordinal: 2, status: 'pass', offset_ms: 10 },
  ];
  const ordinalDiff = contract.compare(emptyBaseline, ordinalCurrent, { observedAt: OBSERVED_AT });
  assert.deepEqual(toPlain(ordinalDiff.data.nodes.added.map(node => node.ordinal)), [2, 10]);
});

test('list-v1 accepts but strips trigger, marks not-triggered, and paginates with opaque stable cursors', { concurrency: false }, t => {
  const shell = createShell();
  t.after(() => shell.dispose());
  const contract = contractFor(shell);
  const stopped = fixture('trace-v1.json');
  const running = fixture('trace-running-v1.json');
  const list = [
    {
      last_step: stopped.last_step,
      run_id: stopped.run_id,
      state: stopped.state,
      script_execution: stopped.script_execution,
      timestamp: stopped.timestamp,
      domain: stopped.domain,
      item_id: stopped.item_id,
      trigger: stopped.trigger,
    },
    {
      last_step: running.last_step,
      run_id: running.run_id,
      state: running.state,
      script_execution: running.script_execution,
      timestamp: running.timestamp,
      domain: running.domain,
      item_id: running.item_id,
      trigger: running.trigger,
      not_triggered: true,
    },
  ];
  const normalized = contract.normalizeList(list, {
    expectedItemId: 'private-bedroom-routine',
    observedAt: OBSERVED_AT,
  });
  assert.equal(normalized.status, 'available');
  assert.equal(normalized.evidence.schema, 'ha-trace-list-v1');
  assert.equal(normalized.evidence.run_count, 2);
  assert.deepEqual(toPlain(normalized.data.runs.map(run => run.kind)), ['non_execution', 'execution']);
  assertPrivateCanariesAbsent(normalized, 'normalized list');

  const firstPage = contract.paginate(normalized.data.runs, { cursor: null, limit: 1, observedAt: OBSERVED_AT });
  assert.equal(firstPage.status, 'available');
  assert.match(firstPage.data.next_cursor, /^aatc1\.1$/);
  assert.doesNotMatch(firstPage.data.next_cursor, /private-run|running-private/);
  const secondPage = contract.paginate(normalized.data.runs, {
    cursor: firstPage.data.next_cursor,
    limit: 1,
    observedAt: OBSERVED_AT,
  });
  assert.equal(secondPage.data.items.length, 1);
  assert.equal(secondPage.data.next_cursor, null);
  assert.equal(contract.paginate(normalized.data.runs, {
    cursor: 'aatc1.private-run',
    limit: 1,
    observedAt: OBSERVED_AT,
  }).status, 'malformed');

  let getterReads = 0;
  const accessorSummary = {};
  Object.defineProperty(accessorSummary, 'run_id', {
    enumerable: true,
    get() {
      getterReads += 1;
      return 'private-accessor-run';
    },
  });
  assert.equal(contract.paginate([accessorSummary], {
    cursor: null,
    limit: 1,
    observedAt: OBSERVED_AT,
  }).status, 'malformed');
  assert.equal(getterReads, 0, 'local pagination must reject accessors without invoking them');
});

test('legacy is explicit while malformed, polluted, accessor, and over-limit inputs fail closed', { concurrency: false }, t => {
  const shell = createShell();
  t.after(() => shell.dispose());
  const contract = contractFor(shell);

  const legacy = contract.normalizeFull(fixture('trace-legacy-path-v0.json'), {
    expectedItemId: 'private-bedroom-routine',
    observedAt: OBSERVED_AT,
  });
  assert.equal(legacy.status, 'available');
  assert.equal(legacy.evidence.schema, 'ha-trace-legacy-path-v0');
  assertPrivateCanariesAbsent(legacy, 'normalized legacy trace');

  assert.equal(contract.normalizeFull(fixture('trace-malformed.json'), {
    expectedItemId: 'private-bedroom-routine',
    observedAt: OBSERVED_AT,
  }).status, 'malformed');

  const polluted = JSON.parse('{"run_id":"x","state":"stopped","script_execution":"finished","timestamp":{"start":"2026-08-31T00:00:00Z","finish":"2026-08-31T00:00:01Z"},"domain":"automation","item_id":"private-bedroom-routine","trace":{},"config":null,"blueprint_inputs":null,"context":null,"__proto__":{"polluted":true}}');
  assert.equal(contract.normalizeFull(polluted, {
    expectedItemId: 'private-bedroom-routine',
    observedAt: OBSERVED_AT,
  }).status, 'malformed');

  const accessor = fixture('trace-v1.json');
  Object.defineProperty(accessor, 'trigger', {
    enumerable: true,
    get() { throw new Error('PRIVATE_GETTER_MUST_NOT_RUN'); },
  });
  assert.doesNotThrow(() => {
    assert.equal(contract.normalizeFull(accessor, {
      expectedItemId: 'private-bedroom-routine',
      observedAt: OBSERVED_AT,
    }).status, 'malformed');
  });

  const customPrototype = fixture('trace-v1.json');
  Object.setPrototypeOf(customPrototype, { inherited: 'PRIVATE_MESSAGE' });
  assert.equal(contract.normalizeFull(customPrototype, {
    expectedItemId: 'private-bedroom-routine', observedAt: OBSERVED_AT,
  }).status, 'malformed');

  const hostileProxy = new Proxy({}, {
    getPrototypeOf() { throw new Error('PRIVATE_PROXY_TRAP'); },
  });
  assert.doesNotThrow(() => {
    assert.equal(contract.normalizeFull(hostileProxy, {
      expectedItemId: 'private-bedroom-routine', observedAt: OBSERVED_AT,
    }).status, 'malformed');
  });

  for (const timestamp of [
    '2026-08-31T07:59:59.999Z',
    '2026-08-31T08:00:00.121Z',
    'not-a-timestamp',
    '08/31/2026 08:00:00',
  ]) {
    const invalidNodeTime = fixture('trace-v1.json');
    invalidNodeTime.trace['action/0'][0].timestamp = timestamp;
    assert.equal(contract.normalizeFull(invalidNodeTime, {
      expectedItemId: 'private-bedroom-routine', observedAt: OBSERVED_AT,
    }).status, 'malformed');
  }

  const tooManyRuns = Array.from({ length: 101 }, (_, index) => ({
    last_step: 'action/0',
    run_id: `run-${index}`,
    state: 'stopped',
    script_execution: 'finished',
    timestamp: { start: '2026-08-31T00:00:00Z', finish: '2026-08-31T00:00:01Z' },
    domain: 'automation',
    item_id: 'private-bedroom-routine',
  }));
  assert.equal(contract.normalizeList(tooManyRuns, {
    expectedItemId: 'private-bedroom-routine',
    observedAt: OBSERVED_AT,
  }).status, 'malformed');
});

test('every trace resource limit accepts the exact boundary and rejects boundary plus one', { concurrency: false }, t => {
  const shell = createShell();
  t.after(() => shell.dispose());
  const contract = contractFor(shell);
  const selected100 = Array.from({ length: 100 }, (_, index) => listEntry(index));
  assert.equal(contract.normalizeList(selected100, {
    expectedItemId: 'private-bedroom-routine', observedAt: OBSERVED_AT,
  }).status, 'available');
  assert.equal(contract.normalizeList([...selected100, listEntry(100)], {
    expectedItemId: 'private-bedroom-routine', observedAt: OBSERVED_AT,
  }).status, 'malformed');

  const global5000 = Array.from({ length: 5000 }, (_, index) => listEntry(index, `automation-${index % 3}`));
  assert.equal(contract.normalizeList(global5000, { global: true, observedAt: OBSERVED_AT }).status, 'available');
  assert.equal(contract.normalizeList([...global5000, listEntry(5000, 'automation-extra')], {
    global: true, observedAt: OBSERVED_AT,
  }).status, 'malformed');

  const pathBoundary = fixture('trace-v1.json');
  pathBoundary.trace = Object.fromEntries(Array.from({ length: 512 }, (_, index) => [
    `action/${index}`,
    [{ path: `action/${index}`, timestamp: '2026-08-31T08:00:00.010Z' }],
  ]));
  assert.equal(contract.normalizeFull(pathBoundary, {
    expectedItemId: 'private-bedroom-routine', observedAt: OBSERVED_AT,
  }).status, 'available');
  pathBoundary.trace['action/512'] = [{ path: 'action/512', timestamp: '2026-08-31T08:00:00.010Z' }];
  assert.equal(contract.normalizeFull(pathBoundary, {
    expectedItemId: 'private-bedroom-routine', observedAt: OBSERVED_AT,
  }).status, 'malformed');

  const elementBoundary = fixture('trace-v1.json');
  elementBoundary.trace = {
    'action/0': Array.from({ length: 4096 }, () => ({
      path: 'action/0', timestamp: '2026-08-31T08:00:00.010Z',
    })),
  };
  assert.equal(contract.normalizeFull(elementBoundary, {
    expectedItemId: 'private-bedroom-routine', observedAt: OBSERVED_AT,
  }).status, 'available');
  elementBoundary.trace['action/0'].push({ path: 'action/0', timestamp: '2026-08-31T08:00:00.010Z' });
  assert.equal(contract.normalizeFull(elementBoundary, {
    expectedItemId: 'private-bedroom-routine', observedAt: OBSERVED_AT,
  }).status, 'malformed');

  const object128 = Object.fromEntries(Array.from({ length: 128 }, (_, index) => [`field_${index}`, true]));
  const objectEntry = { ...listEntry(0), trigger: object128 };
  assert.equal(contract.normalizeList([objectEntry], {
    expectedItemId: 'private-bedroom-routine', observedAt: OBSERVED_AT,
  }).status, 'available');
  object128.field_128 = true;
  assert.equal(contract.normalizeList([objectEntry], {
    expectedItemId: 'private-bedroom-routine', observedAt: OBSERVED_AT,
  }).status, 'malformed');

  const wrap = count => {
    let value = 'ok';
    for (let index = 0; index < count; index += 1) value = { value };
    return value;
  };
  assert.equal(contract.normalizeList([{ ...listEntry(0), trigger: wrap(14) }], {
    expectedItemId: 'private-bedroom-routine', observedAt: OBSERVED_AT,
  }).status, 'available');
  assert.equal(contract.normalizeList([{ ...listEntry(0), trigger: wrap(15) }], {
    expectedItemId: 'private-bedroom-routine', observedAt: OBSERVED_AT,
  }).status, 'malformed');

  assert.equal(contract.normalizeList([{ ...listEntry(0), trigger: 'x'.repeat(4096) }], {
    expectedItemId: 'private-bedroom-routine', observedAt: OBSERVED_AT,
  }).status, 'available');
  assert.equal(contract.normalizeList([{ ...listEntry(0), trigger: 'x'.repeat(4097) }], {
    expectedItemId: 'private-bedroom-routine', observedAt: OBSERVED_AT,
  }).status, 'malformed');

  const byteBoundary = [{ ...listEntry(0), trigger: Array.from({ length: 512 }, (_, index) => (
    index < 511 ? 'x'.repeat(4096) : ''
  )) }];
  const remaining = (2 * 1024 * 1024) - inspectionBytes(byteBoundary);
  assert.ok(remaining >= 0 && remaining <= 4096, `unexpected boundary remainder ${remaining}`);
  byteBoundary[0].trigger[511] = 'x'.repeat(remaining);
  assert.equal(inspectionBytes(byteBoundary), 2 * 1024 * 1024);
  assert.equal(contract.normalizeList(byteBoundary, {
    expectedItemId: 'private-bedroom-routine', observedAt: OBSERVED_AT,
  }).status, 'available');
  byteBoundary[0].trigger[511] += 'x';
  assert.equal(contract.normalizeList(byteBoundary, {
    expectedItemId: 'private-bedroom-routine', observedAt: OBSERVED_AT,
  }).status, 'malformed');
});

test('UTF-8 limits do not allocate encoded string copies before rejecting oversized data', { concurrency: false }, t => {
  const shell = createShell();
  t.after(() => shell.dispose());
  const contract = contractFor(shell);
  const nativeEncodeURIComponent = shell.window.encodeURIComponent;
  let encodedCopies = 0;
  shell.window.encodeURIComponent = () => {
    encodedCopies += 1;
    throw new Error('encoded copies are forbidden in the trace size guard');
  };
  t.after(() => { shell.window.encodeURIComponent = nativeEncodeURIComponent; });

  const normalized = contract.normalizeList([{
    ...listEntry(0),
    trigger: 'zażółć 💧',
  }], {
    expectedItemId: 'private-bedroom-routine', observedAt: OBSERVED_AT,
  });
  assert.equal(normalized.status, 'available');
  assert.equal(encodedCopies, 0);
});

test('trace node collection stops before reading past the accepted element boundary', { concurrency: false }, t => {
  const shell = createShell();
  t.after(() => shell.dispose());
  const contract = contractFor(shell);
  let numericReads = 0;
  const pathNodes = path => new Proxy(Array.from({ length: 4096 }, () => ({
    path,
    timestamp: '2026-08-31T08:00:00.010Z',
  })), {
    get(target, key, receiver) {
      if (typeof key === 'string' && /^\d+$/.test(key)) numericReads += 1;
      return Reflect.get(target, key, receiver);
    },
  });
  const payload = fixture('trace-v1.json');
  payload.trace = {
    'action/0': pathNodes('action/0'),
    'action/1': pathNodes('action/1'),
  };

  assert.equal(contract.normalizeFull(payload, {
    expectedItemId: 'private-bedroom-routine', observedAt: OBSERVED_AT,
  }).status, 'malformed');
  assert.equal(numericReads, 4096, 'normalization must stop before reading element 4097');
});

test('role and structured-error matrix never reads or leaks raw backend messages', { concurrency: false }, async t => {
  const shell = createShell();
  t.after(() => shell.dispose());
  const contract = contractFor(shell);

  const nonAdmin = createHassFixture({ label: 'private-bedroom-routine' });
  nonAdmin.user.is_admin = false;
  const denied = await contract.requestList({
    hass: nonAdmin,
    itemId: 'private-bedroom-routine',
    observedAt: OBSERVED_AT,
  });
  assert.equal(denied.status, 'permission_denied');
  assert.equal(nonAdmin.__calls.filter(call => call.kind === 'callWS').length, 0);

  const unknownRole = createHassFixture({ label: 'private-bedroom-routine' });
  delete unknownRole.user;
  const unknown = await contract.requestList({
    hass: unknownRole,
    itemId: 'private-bedroom-routine',
    observedAt: OBSERVED_AT,
  });
  assert.equal(unknown.status, 'unknown_role');
  assert.equal(unknownRole.__calls.filter(call => call.kind === 'callWS').length, 0);

  const admin = createHassFixture({
    label: 'private-bedroom-routine',
    traces: [{
      last_step: 'action/0',
      run_id: 'admin-run',
      state: 'stopped',
      script_execution: 'finished',
      timestamp: { start: '2026-08-31T00:00:00Z', finish: '2026-08-31T00:00:01Z' },
      domain: 'automation',
      item_id: 'private-bedroom-routine',
      trigger: 'PRIVATE_DOOR_OPENED',
    }],
  });
  const available = await contract.requestList({
    hass: admin,
    itemId: 'private-bedroom-routine',
    observedAt: OBSERVED_AT,
  });
  assert.equal(available.status, 'available');
  assert.deepEqual(
    toPlain(admin.__calls.filter(call => call.kind === 'callWS').map(call => call.payload)),
    [{ type: 'trace/list', domain: 'automation', item_id: 'private-bedroom-routine' }],
  );
  assertPrivateCanariesAbsent(available, 'admin list capability');

  for (const [code, expected] of [['unauthorized', 'permission_denied'], ['not_found', 'no_data'], ['other', 'unavailable']]) {
    const raw = {};
    Object.defineProperties(raw, {
      code: { enumerable: true, value: code },
      message: {
        enumerable: true,
        get() { throw new Error('PRIVATE_MESSAGE_GETTER_MUST_NOT_RUN'); },
      },
    });
    assert.doesNotThrow(() => {
      const classified = contract.classifyError(raw, { endpoint: 'trace/list', observedAt: OBSERVED_AT });
      assert.equal(classified.status, expected);
      assertPrivateCanariesAbsent(classified, `classified ${code}`);
    });
  }

  const abortAccessorError = {};
  Object.defineProperties(abortAccessorError, {
    code: { enumerable: true, value: 'unauthorized' },
    __aaTraceAborted: {
      enumerable: true,
      get() { throw new Error('PRIVATE_ABORT_GETTER_MUST_NOT_RUN'); },
    },
  });
  const accessorHass = createHassFixture({ label: 'private-bedroom-routine' });
  accessorHass.callWS = async () => { throw abortAccessorError; };
  await assert.doesNotReject(async () => {
    const result = await contract.requestList({
      hass: accessorHass, itemId: 'private-bedroom-routine', observedAt: OBSERVED_AT,
    });
    assert.equal(result.status, 'permission_denied');
  });
});

test('abort prevents follow-up trace/get and stale completion consumption', { concurrency: false }, async t => {
  const shell = createShell();
  t.after(() => shell.dispose());
  const contract = contractFor(shell);
  const gate = deferred();
  const hass = createHassFixture({ label: 'private-bedroom-routine' });
  hass.callWS = async message => {
    hass.__calls.push({ kind: 'callWS', payload: message, label: 'private-bedroom-routine' });
    if (message.type === 'trace/list') return gate.promise;
    throw new Error('trace/get must not run after abort');
  };
  const controller = new shell.window.AbortController();
  const pending = contract.requestLatest({
    hass,
    itemId: 'private-bedroom-routine',
    signal: controller.signal,
    observedAt: OBSERVED_AT,
  });
  await waitFor(() => hass.__calls.length === 1, 'held canonical trace/list');
  controller.abort();
  gate.resolve([{
    last_step: 'action/0',
    run_id: 'stale-run',
    state: 'stopped',
    script_execution: 'finished',
    timestamp: { start: '2026-08-31T00:00:00Z', finish: '2026-08-31T00:00:01Z' },
    domain: 'automation',
    item_id: 'private-bedroom-routine',
  }]);
  const result = await pending;
  assert.equal(result.status, 'aborted');
  assert.deepEqual(hass.__calls.map(call => call.payload.type), ['trace/list']);
});

test('abort during trace/get returns aborted and ignores the stale full trace', { concurrency: false }, async t => {
  const shell = createShell();
  t.after(() => shell.dispose());
  const contract = contractFor(shell);
  const gate = deferred();
  const hass = createHassFixture({ label: 'private-bedroom-routine' });
  hass.callWS = async message => {
    hass.__calls.push({ kind: 'callWS', payload: message, label: 'private-bedroom-routine' });
    if (message.type === 'trace/list') return [listEntry(0)];
    if (message.type === 'trace/get') return gate.promise;
    return [];
  };
  const controller = new shell.window.AbortController();
  const pending = contract.requestLatest({
    hass, itemId: 'private-bedroom-routine', signal: controller.signal, observedAt: OBSERVED_AT,
  });
  await waitFor(() => hass.__calls.some(call => call.payload.type === 'trace/get'), 'held canonical trace/get');
  controller.abort();
  gate.resolve(fixture('trace-v1.json'));
  const result = await pending;
  assert.equal(result.status, 'aborted');
  assert.deepEqual(hass.__calls.map(call => call.payload.type), ['trace/list', 'trace/get']);
});

test('diff and diagnostic export are deterministic, allowlist-only, and local-only', { concurrency: false }, t => {
  const shell = createShell();
  t.after(() => shell.dispose());
  const contract = contractFor(shell);
  const baseline = contract.normalizeFull(fixture('trace-v1.json'), {
    expectedItemId: 'private-bedroom-routine', observedAt: OBSERVED_AT,
  });
  const currentFixture = fixture('trace-v1.json');
  currentFixture.run_id = 'private-current-run';
  currentFixture.timestamp.finish = '2026-08-31T08:00:00.240Z';
  currentFixture.trace['action/1'][0].timestamp = '2026-08-31T08:00:00.180Z';
  delete currentFixture.trace['action/0'];
  currentFixture.trace['action/2'] = [{ path: 'action/2', timestamp: '2026-08-31T08:00:00.200Z' }];
  const current = contract.normalizeFull(currentFixture, {
    expectedItemId: 'private-bedroom-routine', observedAt: OBSERVED_AT,
  });
  const diff = contract.compare(baseline.data, current.data, {
    minimumDeltaMs: 20,
    minimumRatio: 1.25,
    observedAt: OBSERVED_AT,
  });
  assert.equal(diff.status, 'available');
  assert.equal(diff.data.run.classification, 'slower');
  assert.deepEqual(toPlain(diff.data.nodes.added.map(node => node.path)), ['action/2']);
  assert.deepEqual(toPlain(diff.data.nodes.removed.map(node => node.path)), ['action/0']);
  assert.deepEqual(toPlain(diff.data.nodes.reached_later.map(node => node.path)), ['action/1']);

  const diagnostic = contract.buildDiagnostic({
    capability: current,
    comparison: diff,
    generatedAt: OBSERVED_AT,
  });
  assert.equal(diagnostic.schema, 'ha-automation-analyzer-diagnostic-v1');
  assertPrivateCanariesAbsent(diagnostic, 'diagnostic object');
  assert.doesNotMatch(JSON.stringify(diagnostic), /private-(?:current-)?run|private-bedroom-routine/);
  const taintedCapability = toPlain(current);
  taintedCapability.data.unexpected_private_field = 'PRIVATE_MESSAGE';
  const rejectedDiagnostic = contract.buildDiagnostic({
    capability: taintedCapability,
    comparison: diff,
    generatedAt: OBSERVED_AT,
  });
  assert.equal(rejectedDiagnostic.status, 'unavailable');
  assertPrivateCanariesAbsent(rejectedDiagnostic, 'rejected diagnostic');

  const blobs = [];
  const revoked = [];
  const clicked = [];
  class CapturedBlob {
    constructor(parts, options) {
      this.parts = parts;
      this.type = options?.type;
      blobs.push(this);
    }
  }
  const downloadWindow = {
    Blob: CapturedBlob,
    URL: {
      createObjectURL: () => 'blob:local-redacted-diagnostic',
      revokeObjectURL: url => revoked.push(url),
    },
  };
  const nativeCreate = shell.document.createElement.bind(shell.document);
  shell.document.createElement = tag => {
    const element = nativeCreate(tag);
    if (tag === 'a') element.click = () => clicked.push({ download: element.download, href: element.href });
    return element;
  };
  try {
    contract.downloadDiagnostic(diagnostic, { window: downloadWindow, document: shell.document });
  } finally {
    shell.document.createElement = nativeCreate;
  }
  assert.equal(blobs.length, 1);
  assert.equal(blobs[0].type, 'application/json');
  assert.equal(blobs[0].parts.length, 1);
  assert.deepEqual(JSON.parse(blobs[0].parts[0]), toPlain(diagnostic));
  assertPrivateCanariesAbsent(blobs[0].parts[0], 'diagnostic Blob');
  assert.deepEqual(clicked, [{
    download: 'ha-automation-analyzer-diagnostic.json',
    href: 'blob:local-redacted-diagnostic',
  }]);
  assert.deepEqual(revoked, ['blob:local-redacted-diagnostic']);
});

test('real card overview performs no trace prefetch for any role and runtime contains no retired coupling', { concurrency: false }, async t => {
  const source = readFileSync(new URL('../ha-automation-analyzer.js', import.meta.url), 'utf8');
  for (const retired of [
    'ha-tools-panel', 'autoRefreshCb', 'automation/trace/list', 'automation/trace/get',
    'haToolsPersistence', 'ha-tools-automation-analyzer-settings',
  ]) {
    assert.equal(source.includes(retired), false, `runtime still contains retired token ${retired}`);
  }

  for (const role of ['admin', 'non-admin', 'unknown']) {
    const shell = createShell();
    t.after(() => shell.dispose());
    shell.startCase();
    const hass = createHassFixture({ label: `role-${role}` });
    if (role === 'non-admin') hass.user.is_admin = false;
    if (role === 'unknown') delete hass.user;
    const card = shell.mount(hass);
    await waitFor(
      () => card._loadingInProgress === false && card.automationStats.size === 1,
      `${role} overview load`,
    );
    await flushTurns();
    assert.deepEqual(
      hass.__calls.filter(call => call.kind === 'callWS' && /trace/.test(call.payload.type)),
      [],
      `${role} overview must not prefetch traces`,
    );
    card.remove();
  }
});

test('state history never masquerades as run counts or execution duration', { concurrency: false }, async t => {
  const shell = createShell();
  t.after(() => shell.dispose());
  shell.startCase();
  const hass = createHassFixture({
    label: 'history-semantics',
    lastTriggered: '2026-08-31T08:00:00.000Z',
    history: [
      { state: 'on', last_changed: '2026-08-31T08:00:00.000Z' },
      { state: 'on', last_changed: '2026-08-31T08:00:00.025Z' },
    ],
  });
  const card = shell.mount(hass);
  await waitFor(() => !card._loadingInProgress && card.automationStats.size === 1, 'history semantics load');
  const stats = card.automationStats.get('automation.history-semantics');
  assert.equal(stats.todayCount, 0, 'state history does not prove retained executions');
  assert.equal(stats.avgExecutionTime, 'N/A', 'state-history deltas are not execution durations');
  assert.deepEqual(toPlain(card.executionTimes), []);
  assert.equal(
    hass.__calls.some(call => call.kind === 'callApi' && call.payload.path.startsWith('history/period/')),
    false,
    'the card must not fetch semantically ambiguous state history',
  );
  card.remove();
});

test('trace-derived health fields remain explicitly unknown until an administrator loads retained traces', { concurrency: false }, async t => {
  const shell = createShell();
  t.after(() => shell.dispose());
  shell.startCase();
  const hass = createHassFixture({ label: 'unknown-trace-health' });
  const card = shell.mount(hass);
  await waitFor(() => !card._loadingInProgress && card.automationStats.size === 1, 'unknown trace health load');
  const traceErrors = card.shadowRoot.getElementById('aa-trace-errors-value');
  assert.ok(traceErrors, 'Overview must expose a distinct retained-trace error field');
  assert.equal(traceErrors.textContent.trim(), '—');

  card.setActiveTab('optimization');
  await flushTurns();
  assert.match(card.shadowRoot.textContent, /load trace statistics/i);
  assert.doesNotMatch(card.shadowRoot.textContent, /no failed automations/i);
  assert.doesNotMatch(card.shadowRoot.textContent, /no slow automations/i);
  card.remove();
});

test('explicit normalized trace statistics drive retained counts, timings, and failures then restore cleanly', { concurrency: false }, async t => {
  const shell = createShell();
  t.after(() => shell.dispose());
  shell.startCase();
  const finished = fixture('trace-v1.json');
  finished.item_id = 'trace-derived';
  finished.run_id = 'trace-derived-finished';
  const failed = fixture('trace-v1.json');
  failed.item_id = 'trace-derived';
  failed.run_id = 'trace-derived-failed';
  failed.script_execution = 'error';
  const hass = createHassFixture({ label: 'trace-derived', traces: [finished, failed] });
  const card = shell.mount(hass);
  await waitFor(() => !card._loadingInProgress && card.automationStats.size === 1, 'trace-derived base load');
  await card._loadTraceStatistics();
  const stats = card.automationStats.get('automation.trace-derived');
  assert.equal(stats.traceCount, 2);
  assert.equal(stats.todayCount, 2);
  assert.equal(stats.avgExecutionTime, 120);
  assert.equal(stats.isFailed, true);
  assert.equal(card.failedAutomations.size, 1);
  assertPrivateCanariesAbsent(card.failedAutomations.get('automation.trace-derived'), 'retained trace failure summary');
  card.setActiveTab('overview');
  await flushTurns();
  assert.equal(card.shadowRoot.getElementById('aa-trace-errors-value')?.textContent.trim(), '1');

  hass.user.is_admin = false;
  card.hass = hass;
  await flushTurns();
  assert.equal(stats.traceCount, 0);
  assert.equal(stats.todayCount, 0);
  assert.equal(stats.avgExecutionTime, 'N/A');
  assert.equal(stats.isFailed, false);
  assert.equal(card.failedAutomations.size, 0);
  card.remove();
});

test('disconnect releases completed global trace summaries and their HA references', { concurrency: false }, async t => {
  const shell = createShell();
  t.after(() => shell.dispose());
  shell.startCase();
  const trace = fixture('trace-v1.json');
  trace.item_id = 'private-detached-summary';
  trace.run_id = 'private-detached-run';
  const hass = createHassFixture({ label: 'private-detached-summary', traces: [trace] });
  const card = shell.mount(hass);
  await waitFor(() => !card._loadingInProgress && card.automationStats.size === 1, 'detached summary base load');
  await card._loadTraceStatistics();

  assert.equal(card._traceStatsCapability?.status, 'available');
  assert.equal(card._traceStatsCache?.hass, hass);
  assert.notEqual(card._traceStatsBaseMetrics, null);
  card.remove();

  assert.equal(card._activeTraceStatsToken, null);
  assert.equal(card._traceStatsCapability, null);
  assert.equal(card._traceStatsCache, null);
  assert.equal(card._traceStatsBaseMetrics, null);
  assert.equal(card._traceStatsLoading, false);
  assert.doesNotMatch(JSON.stringify({
    capability: card._traceStatsCapability,
    cache: card._traceStatsCache,
    base: card._traceStatsBaseMetrics,
  }), /private-detached/);
});

test('disconnect aborts an in-flight global trace request and releases its HA reference', { concurrency: false }, async t => {
  const shell = createShell();
  t.after(() => shell.dispose());
  shell.startCase();
  const traceGate = deferred();
  const hass = createHassFixture({
    label: 'private-inflight-summary',
    gates: { 'trace/list': traceGate },
  });
  const card = shell.mount(hass);
  await waitFor(() => !card._loadingInProgress && card.automationStats.size === 1, 'in-flight summary base load');

  const loadPromise = card._loadTraceStatistics();
  await waitFor(
    () => hass.__calls.some(call => call.kind === 'callWS'
      && call.payload.type === 'trace/list' && !Object.hasOwn(call.payload, 'item_id')),
    'held global trace/list request',
  );
  const token = card._activeTraceStatsToken;
  assert.equal(token?.hass, hass);
  assert.equal(token?.controller.signal.aborted, false);
  card.remove();

  assert.equal(token.controller.signal.aborted, true);
  assert.equal(card._activeTraceStatsToken, null);
  assert.equal(card._traceStatsCapability, null);
  assert.equal(card._traceStatsCache, null);
  assert.equal(card._traceStatsBaseMetrics, null);
  assert.equal(card._traceStatsLoading, false);
  await loadPromise;
  traceGate.resolve([]);
  await flushTurns();
  assert.equal(card._traceStatsCapability, null);
});

test('timeline UI uses canonical list/get, exposes run compare/export controls, and never renders private fields', { concurrency: false }, async t => {
  const shell = createShell();
  t.after(() => shell.dispose());
  shell.startCase();
  const older = fixture('trace-v1.json');
  older.item_id = 'timeline-ui';
  older.run_id = 'run-older';
  older.timestamp = { start: '2026-08-31T07:00:00.000Z', finish: '2026-08-31T07:00:00.120Z' };
  for (const values of Object.values(older.trace)) {
    for (const item of values) item.timestamp = item.timestamp.replace('08:00:00', '07:00:00');
  }
  const newer = fixture('trace-v1.json');
  newer.item_id = 'timeline-ui';
  newer.run_id = 'run-newer';
  newer.timestamp = { start: '2026-08-31T08:00:00.000Z', finish: '2026-08-31T08:00:00.240Z' };
  newer.trace['action/1'][0].timestamp = '2026-08-31T08:00:00.180Z';
  const hass = createHassFixture({
    label: 'timeline-ui',
    friendlyName: 'Timeline UI automation',
    traces: [older, newer],
  });
  const card = shell.mount(hass);
  await waitFor(() => card._loadingInProgress === false && card.automationStats.size === 1, 'timeline UI base load');
  card.setActiveTab('timeline');
  await waitFor(() => card._timelineData?.trace?.run_id === 'run-newer', 'latest normalized timeline run');
  await flushTurns();

  assert.deepEqual(
    toPlain(hass.__calls.filter(call => call.kind === 'callWS' && /^trace\//.test(call.payload.type)).map(call => call.payload)),
    [
      { type: 'trace/list', domain: 'automation', item_id: 'timeline-ui' },
      { type: 'trace/get', domain: 'automation', item_id: 'timeline-ui', run_id: 'run-newer' },
    ],
  );
  const runSelect = card.shadowRoot.getElementById('tl-run-select');
  const baselineSelect = card.shadowRoot.getElementById('tl-baseline-select');
  const compareButton = card.shadowRoot.getElementById('tl-compare-btn');
  const exportButton = card.shadowRoot.getElementById('tl-export-btn');
  assert.ok(runSelect && baselineSelect && compareButton && exportButton);
  assert.equal(runSelect.value, 'run-newer');
  assert.equal(exportButton.disabled, false);
  assert.equal(compareButton.disabled, true);
  assertPrivateCanariesAbsent(card.shadowRoot.innerHTML, 'timeline DOM');

  baselineSelect.value = 'run-older';
  baselineSelect.dispatchEvent(new shell.window.Event('change', { bubbles: true }));
  await flushTurns();
  const activeCompareButton = card.shadowRoot.getElementById('tl-compare-btn');
  assert.equal(activeCompareButton.disabled, false);
  activeCompareButton.click();
  await waitFor(() => card._timelineComparison?.status === 'available', 'timeline comparison');
  await flushTurns();
  assert.equal(card.shadowRoot.getElementById('tl-compare-btn').disabled, false);
  assert.match(card.shadowRoot.textContent, /slower|reached later/i);
  assertPrivateCanariesAbsent(card.shadowRoot.innerHTML, 'timeline comparison DOM');
});

test('timeline run selector renders one local page and page changes make no network request', { concurrency: false }, async t => {
  const shell = createShell();
  t.after(() => shell.dispose());
  shell.startCase();
  const traces = Array.from({ length: 25 }, (_, index) => {
    const minute = String(index).padStart(2, '0');
    return {
      last_step: 'action/0',
      run_id: `page-run-${index}`,
      state: 'stopped',
      script_execution: 'finished',
      timestamp: {
        start: `2026-08-31T08:${minute}:00.000Z`,
        finish: `2026-08-31T08:${minute}:00.100Z`,
      },
      domain: 'automation',
      item_id: 'timeline-page',
      trace: {
        'action/0': [{ path: 'action/0', timestamp: `2026-08-31T08:${minute}:00.010Z` }],
      },
      config: null,
      blueprint_inputs: null,
      context: null,
    };
  });
  const hass = createHassFixture({ label: 'timeline-page', traces });
  const card = shell.mount(hass);
  await waitFor(() => !card._loadingInProgress && card.automationStats.size === 1, 'timeline page base load');
  card.setActiveTab('timeline');
  await waitFor(() => card._timelineData?.capability?.status === 'available', 'timeline first local page');
  assert.equal(card.shadowRoot.getElementById('tl-run-select').options.length, 20);
  const callsBeforePage = hass.__calls.filter(call => call.kind === 'callWS' && /^trace\//.test(call.payload.type)).length;
  card.shadowRoot.getElementById('tl-runs-next').click();
  await flushTurns();
  assert.equal(card.shadowRoot.getElementById('tl-run-select').options.length, 5);
  assert.equal(
    hass.__calls.filter(call => call.kind === 'callWS' && /^trace\//.test(call.payload.type)).length,
    callsBeforePage,
  );
  card.remove();
});

test('changing timeline selection aborts an in-flight full trace and only the new result can render', { concurrency: false }, async t => {
  const shell = createShell();
  t.after(() => shell.dispose());
  shell.startCase();
  const hass = createHassFixture({ label: 'timeline-first' });
  const nativeCallWS = hass.callWS.bind(hass);
  const firstGet = deferred();
  const full = itemId => ({
    ...listEntry(0, itemId),
    run_id: `${itemId}-run`,
    trace: { 'action/0': [{ path: 'action/0', timestamp: '2026-08-31T00:00:00.010Z' }] },
    config: null,
    blueprint_inputs: null,
    context: null,
  });
  hass.callWS = async message => {
    if (message.type === 'trace/list') {
      hass.__calls.push({ kind: 'callWS', payload: message, label: 'selection-change' });
      return [{ ...listEntry(0, message.item_id), run_id: `${message.item_id}-run` }];
    }
    if (message.type === 'trace/get') {
      hass.__calls.push({ kind: 'callWS', payload: message, label: 'selection-change' });
      if (message.item_id === 'timeline-first') return firstGet.promise;
      return full(message.item_id);
    }
    return nativeCallWS(message);
  };
  const card = shell.mount(hass);
  await waitFor(() => !card._loadingInProgress && card.automationStats.size === 1, 'selection-change base load');
  card.automationStats.set('automation.timeline-second', {
    ...card.automationStats.get('automation.timeline-first'),
    id: 'automation.timeline-second',
    automationId: 'timeline-second',
    name: 'Second timeline automation',
  });
  card._selectedTimelineId = 'automation.timeline-first';
  card._fetchTimeline('automation.timeline-first');
  await waitFor(
    () => hass.__calls.some(call => call.payload.type === 'trace/get' && call.payload.item_id === 'timeline-first'),
    'held first full trace',
  );
  card._selectedTimelineId = 'automation.timeline-second';
  card._fetchTimeline('automation.timeline-second');
  await waitFor(() => card._timelineData?.trace?.item_id === 'timeline-second', 'new full trace rendered');
  firstGet.resolve(full('timeline-first'));
  await flushTurns(12);
  assert.equal(card._timelineData.trace.item_id, 'timeline-second');
  assert.doesNotMatch(card.shadowRoot.textContent, /timeline-first-run/);
  card.remove();
});

test('timeline permission and backend errors are safe on the mounted card', { concurrency: false }, async t => {
  for (const role of ['non-admin', 'unknown']) {
    const shell = createShell();
    t.after(() => shell.dispose());
    shell.startCase();
    const hass = createHassFixture({ label: `timeline-${role}` });
    if (role === 'non-admin') hass.user.is_admin = false;
    else delete hass.user;
    const card = shell.mount(hass);
    await waitFor(() => !card._loadingInProgress && card.automationStats.size === 1, `${role} load`);
    card.setActiveTab('timeline');
    await waitFor(() => card._timelineError !== null, `${role} capability state`);
    assert.equal(hass.__calls.some(call => call.kind === 'callWS' && /^trace\//.test(call.payload.type)), false);
    assert.match(card.shadowRoot.textContent, /administrator/i);
    card.remove();
  }

  const shell = createShell();
  t.after(() => shell.dispose());
  shell.startCase();
  const hass = createHassFixture({ label: 'timeline-error' });
  const rawError = {};
  Object.defineProperties(rawError, {
    code: { enumerable: true, value: 'unauthorized' },
    message: { enumerable: true, value: 'PRIVATE_MESSAGE <img data-hostile-trace onerror=alert(1)>' },
  });
  const nativeCallWS = hass.callWS.bind(hass);
  hass.callWS = async message => {
    if (message.type === 'trace/list') throw rawError;
    return nativeCallWS(message);
  };
  const card = shell.mount(hass);
  await waitFor(() => !card._loadingInProgress && card.automationStats.size === 1, 'error role base load');
  card.setActiveTab('timeline');
  await waitFor(() => card._timelineError !== null, 'structured backend error');
  assert.match(card.shadowRoot.textContent, /administrator/i);
  assertPrivateCanariesAbsent(card.shadowRoot.innerHTML, 'backend error DOM');
  assert.equal(shell.errors.length, 0);
});

test('trace statistics load only after an explicit admin action and cache is snapshot-bound', { concurrency: false }, async t => {
  const shell = createShell();
  t.after(() => shell.dispose());
  shell.startCase();
  const trace = fixture('trace-v1.json');
  trace.item_id = 'stats-admin';
  trace.run_id = 'stats-run';
  const hass = createHassFixture({ label: 'stats-admin', traces: [trace] });
  const card = shell.mount(hass);
  await waitFor(() => !card._loadingInProgress && card.automationStats.size === 1, 'stats base load');
  card.setActiveTab('performance');
  await flushTurns();
  assert.equal(hass.__calls.some(call => call.kind === 'callWS' && call.payload.type === 'trace/list'), false);
  const loadButton = card.shadowRoot.getElementById('trace-stats-load');
  assert.ok(loadButton);
  loadButton.click();
  await waitFor(() => card._traceStatsCapability?.status === 'available', 'explicit trace statistics');
  assert.deepEqual(
    toPlain(hass.__calls.filter(call => call.kind === 'callWS' && call.payload.type === 'trace/list').map(call => call.payload)),
    [{ type: 'trace/list', domain: 'automation' }],
  );
  await card._loadTraceStatistics();
  assert.equal(
    hass.__calls.filter(call => call.kind === 'callWS' && call.payload.type === 'trace/list').length,
    1,
    'same-snapshot non-forced load must use the 60-second cache',
  );
  card.shadowRoot.getElementById('trace-stats-load').click();
  await waitFor(
    () => hass.__calls.filter(call => call.kind === 'callWS' && call.payload.type === 'trace/list').length === 2,
    'explicit trace statistics refresh',
  );
  hass.user.is_admin = false;
  card.hass = hass;
  await flushTurns();
  assert.equal(card._traceStatsCapability, null);
  assert.equal(card.shadowRoot.getElementById('trace-stats-load').disabled, true);
  assert.match(card.shadowRoot.textContent, /administrator/i);
  assert.equal(
    hass.__calls.filter(call => call.kind === 'callWS' && call.payload.type === 'trace/list').length,
    2,
    'role downgrade on the same hass object must invalidate without a trace request',
  );

  const replacement = createHassFixture({ label: 'stats-replacement', traces: [] });
  shell.advanceClock(30_001);
  card.hass = replacement;
  await waitFor(() => !card._loadingInProgress && card.automationStats.has('automation.stats-replacement'), 'replacement stats snapshot');
  assert.equal(card._traceStatsCapability, null);
  assert.equal(replacement.__calls.some(call => call.kind === 'callWS' && call.payload.type === 'trace/list'), false);
  card.remove();
});

test('trace statistics invalidate on same-object connection and automation-set changes', { concurrency: false }, async t => {
  const shell = createShell();
  t.after(() => shell.dispose());
  shell.startCase();
  const trace = fixture('trace-v1.json');
  trace.item_id = 'stats-snapshot';
  trace.run_id = 'stats-snapshot-run';
  const hass = createHassFixture({ label: 'stats-snapshot', traces: [trace] });
  const card = shell.mount(hass);
  await waitFor(() => !card._loadingInProgress && card.automationStats.size === 1, 'snapshot base load');
  await card._loadTraceStatistics();
  assert.equal(card._traceStatsCapability?.status, 'available');
  assert.notEqual(card._traceStatsBaseMetrics, null);
  const traceCallsAfterFirstLoad = hass.__calls.filter(
    call => call.kind === 'callWS' && call.payload.type === 'trace/list',
  ).length;

  hass.connection = { ...hass.connection, socket: { readyState: 1 } };
  card.hass = hass;
  await flushTurns();
  assert.equal(card._traceStatsCapability, null);
  assert.equal(card._traceStatsCache, null);
  assert.equal(card._traceStatsBaseMetrics, null);
  assert.equal(hass.__calls.filter(
    call => call.kind === 'callWS' && call.payload.type === 'trace/list',
  ).length, traceCallsAfterFirstLoad, 'connection replacement must not fetch traces implicitly');

  await card._loadTraceStatistics();
  assert.equal(card._traceStatsCapability?.status, 'available');
  const traceCallsAfterSecondLoad = hass.__calls.filter(
    call => call.kind === 'callWS' && call.payload.type === 'trace/list',
  ).length;
  hass.states['automation.new-set-member'] = {
    entity_id: 'automation.new-set-member',
    state: 'on',
    attributes: { id: 'new-set-member', friendly_name: 'New set member' },
    last_changed: '2026-08-31T08:00:00.000Z',
    last_updated: '2026-08-31T08:00:00.000Z',
  };
  card.hass = hass;
  await flushTurns();
  assert.equal(card._traceStatsCapability, null);
  assert.equal(card._traceStatsCache, null);
  assert.equal(card._traceStatsBaseMetrics, null);
  assert.equal(hass.__calls.filter(
    call => call.kind === 'callWS' && call.payload.type === 'trace/list',
  ).length, traceCallsAfterSecondLoad, 'automation-set changes must not fetch traces implicitly');
  card.remove();
});

test('trace statistics controls are disabled and request-free for non-admin and unknown roles', { concurrency: false }, async t => {
  for (const role of ['non-admin', 'unknown']) {
    const shell = createShell();
    t.after(() => shell.dispose());
    shell.startCase();
    const hass = createHassFixture({ label: `stats-${role}` });
    if (role === 'non-admin') hass.user.is_admin = false;
    else delete hass.user;
    const card = shell.mount(hass);
    await waitFor(() => !card._loadingInProgress && card.automationStats.size === 1, `${role} stats base load`);
    card.setActiveTab('performance');
    await flushTurns();
    const button = card.shadowRoot.getElementById('trace-stats-load');
    assert.ok(button);
    assert.equal(button.disabled, true);
    button.click();
    await flushTurns();
    assert.equal(hass.__calls.some(call => call.kind === 'callWS' && call.payload.type === 'trace/list'), false);
    assert.match(card.shadowRoot.textContent, /administrator/i);
    card.remove();
  }
});

test('auto_refresh config is boolean-only, local, and resumes without panel helpers', { concurrency: false }, async t => {
  const shell = createShell();
  t.after(() => shell.dispose());
  shell.startCase();
  const hass = createHassFixture({ label: 'config-refresh' });
  const card = shell.mount(hass, { auto_refresh: 'false', unknown_private_option: 'PRIVATE_MESSAGE' });
  await waitFor(() => !card._loadingInProgress && card.automationStats.size === 1, 'config base load');
  assert.equal(card.config.auto_refresh, true);
  assert.equal(Object.hasOwn(card.config, 'unknown_private_option'), false);
  card.setConfig({ auto_refresh: false });
  assert.equal(card._isAutoRefreshEnabled(), false);
  const callsBefore = hass.__calls.length;
  shell.advanceClock(30_001);
  card.hass = hass;
  await flushTurns();
  assert.equal(hass.__calls.length, callsBefore);
  card.setConfig({ auto_refresh: true });
  await waitFor(() => hass.__calls.length > callsBefore, 'config refresh resume');
  card.remove();
  assert.equal(readFileSync(new URL('./helpers/ha-shell.mjs', import.meta.url), 'utf8').includes('autoRefreshCb'), false);
});

test('card editor and README expose the local boolean auto_refresh and accurate trace privacy model', { concurrency: false }, t => {
  const shell = createShell();
  t.after(() => shell.dispose());
  const editor = shell.document.createElement('ha-automation-analyzer-editor');
  shell.document.body.append(editor);
  editor.setConfig({
    title: 'Analyzer',
    auto_refresh: false,
    show_disabled: false,
    unknown_private_option: 'PRIVATE_MESSAGE',
  });
  const autoRefreshCheckbox = editor.shadowRoot.getElementById('cf_auto_refresh');
  const showDisabledCheckbox = editor.shadowRoot.getElementById('cf_show_disabled');
  assert.ok(autoRefreshCheckbox);
  assert.ok(showDisabledCheckbox);
  assert.equal(autoRefreshCheckbox.checked, false);
  assert.equal(showDisabledCheckbox.checked, false);
  assert.equal(Object.hasOwn(editor._config, 'unknown_private_option'), false);
  let changed = null;
  editor.addEventListener('config-changed', event => { changed = event.detail.config; });
  autoRefreshCheckbox.checked = true;
  autoRefreshCheckbox.dispatchEvent(new shell.window.Event('change', { bubbles: true }));
  assert.equal(changed.auto_refresh, true);
  assert.equal(typeof changed.auto_refresh, 'boolean');
  showDisabledCheckbox.checked = true;
  showDisabledCheckbox.dispatchEvent(new shell.window.Event('change', { bubbles: true }));
  assert.equal(changed.show_disabled, true);
  assert.equal(typeof changed.show_disabled, 'boolean');
  assert.equal(Object.hasOwn(changed, 'unknown_private_option'), false);

  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  assert.match(readme, /administrator only|admin-only/i);
  assert.match(readme, /redacted diagnostic/i);
  assert.match(readme, /auto_refresh: true/);
  assert.doesNotMatch(readme, /jsDelivr|Trace Viewer|in the background it fetches[^\n]*traces/i);
});
