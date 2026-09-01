/* HA Tools split — ha-automation-analyzer v4.2.0 (2026-09-01) — single-tool standalone repo */
(function() {
'use strict';

// Component-local XSS protection: never reads from or publishes a global helper.
const _esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);

/* ===== Versioned, privacy-safe Home Assistant trace contract ===== */
const AA_TRACE_SOURCE = 'home_assistant.trace_ws_v1';
const AA_TRACE_MAX_BYTES = 2 * 1024 * 1024;
const AA_TRACE_MAX_DEPTH = 16;
const AA_TRACE_MAX_STRING_BYTES = 4096;
const AA_TRACE_MAX_OBJECT_FIELDS = 128;
const AA_TRACE_MAX_ARRAY = 4096;
const AA_TRACE_MAX_PATHS = 512;
const AA_TRACE_MAX_ELEMENTS = 4096;
const AA_TRACE_MAX_SELECTED_RUNS = 100;
const AA_TRACE_MAX_GLOBAL_RUNS = 5000;
const AA_TRACE_BANNED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const AA_TRACE_LIST_FIELDS = new Set([
  'last_step', 'run_id', 'state', 'script_execution', 'timestamp', 'domain',
  'item_id', 'not_triggered', 'error', 'trigger'
]);
const AA_TRACE_FULL_FIELDS = new Set([
  ...AA_TRACE_LIST_FIELDS, 'trace', 'config', 'blueprint_inputs', 'context'
]);
const AA_TRACE_LEGACY_FIELDS = new Set([
  'last_step', 'run_id', 'state', 'script_execution', 'timestamp', 'domain',
  'item_id', 'not_triggered', 'error', 'trigger', 'path'
]);
const AA_TRACE_ELEMENT_FIELDS = new Set([
  'path', 'timestamp', 'child_id', 'changed_variables', 'error',
  'template_errors', 'result'
]);
const AA_TRACE_PATH_PATTERN = /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/;
const AA_TRACE_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

function _aaTraceObservedAt(value) {
  if (_aaParseTimestamp(value) !== null) return value;
  return new Date().toISOString();
}

function _aaTraceCapability(status, observedAt, evidence, data) {
  const result = {
    status,
    source: AA_TRACE_SOURCE,
    observed_at: _aaTraceObservedAt(observedAt),
    evidence: evidence || {}
  };
  if (data !== undefined) result.data = data;
  return result;
}

function _aaUtf8Bytes(value, maxBytes = Infinity) {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit <= 0x7f) bytes += 1;
    else if (codeUnit <= 0x7ff) bytes += 2;
    else if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const low = value.charCodeAt(index + 1);
      if (!(low >= 0xdc00 && low <= 0xdfff)) return Infinity;
      bytes += 4;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return Infinity;
    } else bytes += 3;
    if (bytes > maxBytes) return Infinity;
  }
  return bytes;
}

function _aaIsPlainObject(value) {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const proto = Reflect.getPrototypeOf(value);
    if (proto === null) return true;
    if (Reflect.getPrototypeOf(proto) !== null) return false;
    const constructorDescriptor = Reflect.getOwnPropertyDescriptor(proto, 'constructor');
    return Boolean(
      constructorDescriptor && 'value' in constructorDescriptor
      && typeof constructorDescriptor.value === 'function'
      && constructorDescriptor.value.name === 'Object'
    );
  } catch (_error) {
    return false;
  }
}

function _aaInspectTracePayload(value, options = {}) {
  const maxBytes = options.maxBytes || AA_TRACE_MAX_BYTES;
  const maxRootArray = options.maxRootArray || AA_TRACE_MAX_ARRAY;
  const wideObject = options.wideObject || null;
  const wideObjectMaxFields = options.wideObjectMaxFields || AA_TRACE_MAX_OBJECT_FIELDS;
  let bytes = 0;
  const seen = new WeakSet();

  const addBytes = amount => {
    bytes += amount;
    if (!Number.isFinite(bytes) || bytes > maxBytes) throw new Error('trace_payload_limit');
  };

  const visit = (current, depth) => {
    if (depth > AA_TRACE_MAX_DEPTH) throw new Error('trace_depth_limit');
    if (current === null) { addBytes(4); return; }
    if (typeof current === 'string') {
      const length = _aaUtf8Bytes(current, AA_TRACE_MAX_STRING_BYTES);
      if (length > AA_TRACE_MAX_STRING_BYTES) throw new Error('trace_string_limit');
      addBytes(length + 2);
      return;
    }
    if (typeof current === 'number') {
      if (!Number.isFinite(current)) throw new Error('trace_non_finite_number');
      addBytes(16);
      return;
    }
    if (typeof current === 'boolean') { addBytes(5); return; }
    if (typeof current !== 'object') throw new Error('trace_invalid_type');
    if (seen.has(current)) throw new Error('trace_cycle');
    seen.add(current);

    if (Array.isArray(current)) {
      const arrayLimit = depth === 0 ? maxRootArray : AA_TRACE_MAX_ARRAY;
      if (current.length > arrayLimit) throw new Error('trace_array_limit');
      const ownKeys = Reflect.ownKeys(current);
      for (const key of ownKeys) {
        if (key === 'length') continue;
        if (typeof key !== 'string' || !/^\d+$/.test(key)) throw new Error('trace_array_property');
        const descriptor = Reflect.getOwnPropertyDescriptor(current, key);
        if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) throw new Error('trace_accessor');
      }
      addBytes(2);
      for (let index = 0; index < current.length; index += 1) {
        const descriptor = Reflect.getOwnPropertyDescriptor(current, String(index));
        if (!descriptor || !('value' in descriptor)) throw new Error('trace_sparse_array');
        visit(descriptor.value, depth + 1);
      }
      seen.delete(current);
      return;
    }

    if (!_aaIsPlainObject(current)) throw new Error('trace_non_plain_object');
    const ownKeys = Reflect.ownKeys(current);
    const objectLimit = current === wideObject ? wideObjectMaxFields : AA_TRACE_MAX_OBJECT_FIELDS;
    if (ownKeys.length > objectLimit) throw new Error('trace_object_fields_limit');
    addBytes(2);
    for (const key of ownKeys) {
      if (typeof key !== 'string' || AA_TRACE_BANNED_KEYS.has(key)) throw new Error('trace_banned_key');
      const keyBytes = _aaUtf8Bytes(key, AA_TRACE_MAX_STRING_BYTES);
      if (keyBytes > AA_TRACE_MAX_STRING_BYTES) throw new Error('trace_key_limit');
      addBytes(keyBytes + 2);
      const descriptor = Reflect.getOwnPropertyDescriptor(current, key);
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) throw new Error('trace_accessor');
      visit(descriptor.value, depth + 1);
    }
    seen.delete(current);
  };

  try {
    visit(value, 0);
    return { ok: true, bytes };
  } catch (_error) {
    return { ok: false, bytes };
  }
}

function _aaHasOnlyFields(value, allowed) {
  return Reflect.ownKeys(value).every(key => typeof key === 'string' && allowed.has(key));
}

function _aaParseTimestamp(value) {
  if (typeof value !== 'string' || !AA_TRACE_TIMESTAMP_PATTERN.test(value)) return null;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

function _aaCompareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function _aaValidateRunTimestamp(timestamp, state) {
  if (!_aaIsPlainObject(timestamp) || !_aaHasOnlyFields(timestamp, new Set(['start', 'finish']))) return null;
  const start = _aaParseTimestamp(timestamp.start);
  const finish = timestamp.finish === null ? null : _aaParseTimestamp(timestamp.finish);
  if (start === null || (timestamp.finish !== null && finish === null)) return null;
  if (state === 'stopped' && finish === null) return null;
  if (finish !== null && finish < start) return null;
  return { start, finish };
}

function _aaValidateRunIdentity(value, expectedItemId, global = false) {
  if (typeof value.run_id !== 'string' || !value.run_id) return null;
  if (value.domain !== 'automation') return null;
  if (typeof value.item_id !== 'string' || !value.item_id) return null;
  if (!global && value.item_id !== expectedItemId) return null;
  if (value.state !== 'running' && value.state !== 'stopped') return null;
  if (value.script_execution !== null && typeof value.script_execution !== 'string') return null;
  const timestamp = _aaValidateRunTimestamp(value.timestamp, value.state);
  return timestamp ? { timestamp } : null;
}

function _aaNormalizeListChecked(payload, options = {}) {
  const observedAt = options.observedAt;
  const expectedItemId = options.expectedItemId;
  const global = options.global === true;
  const maxRuns = global ? AA_TRACE_MAX_GLOBAL_RUNS : AA_TRACE_MAX_SELECTED_RUNS;
  const inspection = _aaInspectTracePayload(payload, { maxRootArray: maxRuns });
  if (!inspection.ok || !Array.isArray(payload) || payload.length > maxRuns
    || (!global && typeof expectedItemId !== 'string')) {
    return _aaTraceCapability('malformed', observedAt, { endpoint: 'trace/list', error_code: 'malformed' });
  }
  const runs = [];
  for (const value of payload) {
    if (!_aaIsPlainObject(value) || !_aaHasOnlyFields(value, AA_TRACE_LIST_FIELDS)) {
      return _aaTraceCapability('malformed', observedAt, { endpoint: 'trace/list', error_code: 'malformed' });
    }
    const identity = _aaValidateRunIdentity(value, expectedItemId, global);
    if (!identity) return _aaTraceCapability('malformed', observedAt, { endpoint: 'trace/list', error_code: 'malformed' });
    if (value.not_triggered !== undefined && typeof value.not_triggered !== 'boolean') {
      return _aaTraceCapability('malformed', observedAt, { endpoint: 'trace/list', error_code: 'malformed' });
    }
    runs.push({
      run_id: value.run_id,
      item_id: value.item_id,
      run_state: value.state,
      script_execution: value.script_execution,
      kind: value.not_triggered === true ? 'non_execution' : 'execution',
      started_at: value.timestamp.start,
      finished_at: value.timestamp.finish,
      run_duration_ms: identity.timestamp.finish === null
        ? null : identity.timestamp.finish - identity.timestamp.start
    });
  }
  runs.sort((left, right) => {
    const timeDelta = _aaParseTimestamp(right.started_at) - _aaParseTimestamp(left.started_at);
    return timeDelta || _aaCompareText(left.run_id, right.run_id);
  });
  const status = runs.length ? 'available' : 'no_data';
  return _aaTraceCapability(status, observedAt, {
    endpoint: 'trace/list',
    schema: 'ha-trace-list-v1',
    run_count: runs.length
  }, { runs });
}

function _aaNormalizeList(payload, options = {}) {
  try {
    return _aaNormalizeListChecked(payload, options);
  } catch (_error) {
    return _aaTraceCapability('malformed', options.observedAt, {
      endpoint: 'trace/list', error_code: 'malformed'
    });
  }
}

function _aaTraceElementStatus(value) {
  if (Object.hasOwn(value, 'error') || (Array.isArray(value.template_errors) && value.template_errors.length)) return 'error';
  if (_aaIsPlainObject(value.changed_variables) && Reflect.ownKeys(value.changed_variables).length) return 'changed';
  if (value.result === false) return 'skipped';
  return 'pass';
}

function _aaNormalizeFullChecked(payload, options = {}) {
  const observedAt = options.observedAt;
  const expectedItemId = options.expectedItemId;
  if (!_aaIsPlainObject(payload) || typeof expectedItemId !== 'string') {
    return _aaTraceCapability('malformed', observedAt, { endpoint: 'trace/get', error_code: 'malformed' });
  }
  const isV1 = Object.hasOwn(payload, 'trace');
  const isLegacy = Object.hasOwn(payload, 'path');
  if (isV1 === isLegacy) return _aaTraceCapability('malformed', observedAt, { endpoint: 'trace/get', error_code: 'malformed' });
  const traceDescriptor = isV1 ? Reflect.getOwnPropertyDescriptor(payload, 'trace') : null;
  const wideObject = traceDescriptor && 'value' in traceDescriptor ? traceDescriptor.value : null;
  const inspection = _aaInspectTracePayload(payload, {
    wideObject,
    wideObjectMaxFields: AA_TRACE_MAX_PATHS
  });
  if (!inspection.ok) {
    return _aaTraceCapability('malformed', observedAt, { endpoint: 'trace/get', error_code: 'malformed' });
  }
  const allowed = isV1 ? AA_TRACE_FULL_FIELDS : AA_TRACE_LEGACY_FIELDS;
  if (!_aaHasOnlyFields(payload, allowed)) {
    return _aaTraceCapability('malformed', observedAt, { endpoint: 'trace/get', error_code: 'malformed' });
  }
  const identity = _aaValidateRunIdentity(payload, expectedItemId);
  if (!identity) return _aaTraceCapability('malformed', observedAt, { endpoint: 'trace/get', error_code: 'malformed' });
  if (payload.not_triggered !== undefined && typeof payload.not_triggered !== 'boolean') {
    return _aaTraceCapability('malformed', observedAt, { endpoint: 'trace/get', error_code: 'malformed' });
  }

  const rawNodes = [];
  if (isV1) {
    if (!_aaIsPlainObject(payload.trace)) return _aaTraceCapability('malformed', observedAt, { endpoint: 'trace/get', error_code: 'malformed' });
    const paths = Reflect.ownKeys(payload.trace);
    if (paths.length > AA_TRACE_MAX_PATHS) return _aaTraceCapability('malformed', observedAt, { endpoint: 'trace/get', error_code: 'malformed' });
    for (const path of paths) {
      if (typeof path !== 'string' || !AA_TRACE_PATH_PATTERN.test(path)) {
        return _aaTraceCapability('malformed', observedAt, { endpoint: 'trace/get', error_code: 'malformed' });
      }
      const values = payload.trace[path];
      if (!Array.isArray(values)) return _aaTraceCapability('malformed', observedAt, { endpoint: 'trace/get', error_code: 'malformed' });
      for (let ordinal = 0; ordinal < values.length; ordinal += 1) {
        if (rawNodes.length >= AA_TRACE_MAX_ELEMENTS) {
          return _aaTraceCapability('malformed', observedAt, { endpoint: 'trace/get', error_code: 'malformed' });
        }
        rawNodes.push({ value: values[ordinal], path, ordinal });
      }
    }
  } else {
    if (!Array.isArray(payload.path)) return _aaTraceCapability('malformed', observedAt, { endpoint: 'trace/get', error_code: 'malformed' });
    const ordinalByPath = new Map();
    for (const value of payload.path) {
      if (rawNodes.length >= AA_TRACE_MAX_ELEMENTS) {
        return _aaTraceCapability('malformed', observedAt, { endpoint: 'trace/get', error_code: 'malformed' });
      }
      const path = value?.path;
      const ordinal = ordinalByPath.get(path) || 0;
      ordinalByPath.set(path, ordinal + 1);
      rawNodes.push({ value, path, ordinal });
    }
  }
  if (rawNodes.length > AA_TRACE_MAX_ELEMENTS) return _aaTraceCapability('malformed', observedAt, { endpoint: 'trace/get', error_code: 'malformed' });

  const nodes = [];
  for (const raw of rawNodes) {
    const value = raw.value;
    if (!_aaIsPlainObject(value) || !_aaHasOnlyFields(value, AA_TRACE_ELEMENT_FIELDS)) {
      return _aaTraceCapability('malformed', observedAt, { endpoint: 'trace/get', error_code: 'malformed' });
    }
    if (value.path !== raw.path || !AA_TRACE_PATH_PATTERN.test(raw.path)) {
      return _aaTraceCapability('malformed', observedAt, { endpoint: 'trace/get', error_code: 'malformed' });
    }
    const timestamp = _aaParseTimestamp(value.timestamp);
    if (timestamp === null || timestamp < identity.timestamp.start
      || (identity.timestamp.finish !== null && timestamp > identity.timestamp.finish)) {
      return _aaTraceCapability('malformed', observedAt, { endpoint: 'trace/get', error_code: 'malformed' });
    }
    nodes.push({
      path: raw.path,
      ordinal: raw.ordinal,
      status: _aaTraceElementStatus(value),
      offset_ms: timestamp - identity.timestamp.start,
      _timestamp: timestamp
    });
  }
  nodes.sort((left, right) => left._timestamp - right._timestamp
    || _aaCompareText(left.path, right.path) || left.ordinal - right.ordinal);
  for (const node of nodes) delete node._timestamp;
  const schema = isV1 ? 'ha-trace-v1' : 'ha-trace-legacy-path-v0';
  return _aaTraceCapability('available', observedAt, {
    endpoint: 'trace/get',
    schema,
    node_count: nodes.length,
    run_state: payload.state
  }, {
    run_id: payload.run_id,
    item_id: payload.item_id,
    run_state: payload.state,
    kind: payload.not_triggered === true ? 'non_execution' : 'execution',
    run_duration_ms: identity.timestamp.finish === null
      ? null : identity.timestamp.finish - identity.timestamp.start,
    nodes
  });
}

function _aaNormalizeFull(payload, options = {}) {
  try {
    return _aaNormalizeFullChecked(payload, options);
  } catch (_error) {
    return _aaTraceCapability('malformed', options.observedAt, {
      endpoint: 'trace/get', error_code: 'malformed'
    });
  }
}

function _aaClassifyTraceError(error, options = {}) {
  let code = null;
  if (_aaIsPlainObject(error)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(error, 'code');
    if (descriptor && 'value' in descriptor && typeof descriptor.value === 'string') code = descriptor.value;
  }
  const status = code === 'unauthorized' ? 'permission_denied'
    : code === 'not_found' ? 'no_data' : 'unavailable';
  return _aaTraceCapability(status, options.observedAt, {
    endpoint: options.endpoint || 'trace',
    error_code: code === 'unauthorized' || code === 'not_found' ? code : 'unavailable'
  });
}

function _aaAbortedCapability(endpoint, observedAt) {
  return _aaTraceCapability('aborted', observedAt, { endpoint, error_code: 'aborted' });
}

function _aaIsAbortMarker(error) {
  if (!_aaIsPlainObject(error)) return false;
  try {
    const descriptor = Reflect.getOwnPropertyDescriptor(error, '__aaTraceAborted');
    return Boolean(descriptor && 'value' in descriptor && descriptor.value === true);
  } catch (_ignored) {
    return false;
  }
}

function _aaAbortRace(promise, signal) {
  if (!signal) return Promise.resolve(promise);
  if (signal.aborted) return Promise.reject({ __aaTraceAborted: true });
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = callback => value => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      callback(value);
    };
    const onAbort = finish(reject);
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve(promise).then(finish(resolve), finish(reject));
  }).catch(error => {
    if (signal.aborted) throw { __aaTraceAborted: true };
    throw error;
  });
}

function _aaRoleCapability(hass, endpoint, observedAt) {
  if (!hass || !hass.user || typeof hass.user.is_admin !== 'boolean') {
    return _aaTraceCapability('unknown_role', observedAt, { endpoint, error_code: 'unknown_role' });
  }
  if (hass.user.is_admin !== true) {
    return _aaTraceCapability('permission_denied', observedAt, { endpoint, error_code: 'admin_required' });
  }
  return null;
}

async function _aaRequestTraceList(options = {}) {
  const endpoint = 'trace/list';
  const denied = _aaRoleCapability(options.hass, endpoint, options.observedAt);
  if (denied) return denied;
  if (options.signal?.aborted) return _aaAbortedCapability(endpoint, options.observedAt);
  try {
    const request = { type: 'trace/list', domain: 'automation' };
    if (options.global !== true) request.item_id = options.itemId;
    const payload = await _aaAbortRace(options.hass.callWS(request), options.signal);
    if (options.signal?.aborted) return _aaAbortedCapability(endpoint, options.observedAt);
    return _aaNormalizeList(payload, {
      expectedItemId: options.itemId,
      observedAt: options.observedAt,
      global: options.global === true
    });
  } catch (error) {
    if (options.signal?.aborted || _aaIsAbortMarker(error)) {
      return _aaAbortedCapability(endpoint, options.observedAt);
    }
    return _aaClassifyTraceError(error, { endpoint, observedAt: options.observedAt });
  }
}

async function _aaRequestFullTrace(options = {}) {
  const endpoint = 'trace/get';
  const denied = _aaRoleCapability(options.hass, endpoint, options.observedAt);
  if (denied) return denied;
  if (options.signal?.aborted) return _aaAbortedCapability(endpoint, options.observedAt);
  try {
    const payload = await _aaAbortRace(options.hass.callWS({
      type: 'trace/get', domain: 'automation', item_id: options.itemId, run_id: options.runId
    }), options.signal);
    if (options.signal?.aborted) return _aaAbortedCapability(endpoint, options.observedAt);
    return _aaNormalizeFull(payload, {
      expectedItemId: options.itemId,
      observedAt: options.observedAt
    });
  } catch (error) {
    if (options.signal?.aborted || _aaIsAbortMarker(error)) {
      return _aaAbortedCapability(endpoint, options.observedAt);
    }
    return _aaClassifyTraceError(error, { endpoint, observedAt: options.observedAt });
  }
}

async function _aaRequestLatestTrace(options = {}) {
  const listed = await _aaRequestTraceList(options);
  if (listed.status !== 'available') return listed;
  const latest = listed.data.runs.find(run => run.kind === 'execution');
  if (!latest) return _aaTraceCapability('no_data', options.observedAt, {
    endpoint: 'trace/get', error_code: 'no_execution_trace'
  });
  if (options.signal?.aborted) return _aaAbortedCapability('trace/get', options.observedAt);
  return _aaRequestFullTrace({ ...options, runId: latest.run_id });
}

function _aaIsNormalizedRunSummary(run) {
  return _aaIsPlainObject(run)
    && _aaHasOnlyFields(run, new Set([
      'run_id', 'item_id', 'run_state', 'script_execution', 'kind',
      'started_at', 'finished_at', 'run_duration_ms'
    ]))
    && typeof run.run_id === 'string' && Boolean(run.run_id)
    && typeof run.item_id === 'string' && Boolean(run.item_id)
    && (run.run_state === 'running' || run.run_state === 'stopped')
    && (run.script_execution === null || typeof run.script_execution === 'string')
    && (run.kind === 'execution' || run.kind === 'non_execution')
    && _aaParseTimestamp(run.started_at) !== null
    && (run.finished_at === null || _aaParseTimestamp(run.finished_at) !== null)
    && (run.run_duration_ms === null
      || (Number.isFinite(run.run_duration_ms) && run.run_duration_ms >= 0));
}

function _aaPaginateTraceRuns(runs, options = {}) {
  const observedAt = options.observedAt;
  let validRuns = false;
  try {
    validRuns = _aaInspectTracePayload(runs, { maxRootArray: AA_TRACE_MAX_GLOBAL_RUNS }).ok
      && Array.isArray(runs) && runs.length <= AA_TRACE_MAX_GLOBAL_RUNS
      && runs.every(_aaIsNormalizedRunSummary);
  } catch (_error) {}
  if (!validRuns || !Number.isInteger(options.limit)
    || options.limit < 1 || options.limit > 50) {
    return _aaTraceCapability('malformed', observedAt, { endpoint: 'local/page', error_code: 'malformed' });
  }
  let offset = 0;
  if (options.cursor !== null && options.cursor !== undefined) {
    const match = /^aatc1\.(0|[1-9]\d*)$/.exec(options.cursor);
    if (!match) return _aaTraceCapability('malformed', observedAt, { endpoint: 'local/page', error_code: 'invalid_cursor' });
    offset = Number(match[1]);
    if (!Number.isSafeInteger(offset) || offset >= runs.length) {
      return _aaTraceCapability('malformed', observedAt, { endpoint: 'local/page', error_code: 'invalid_cursor' });
    }
  }
  const items = runs.slice(offset, offset + options.limit);
  const nextOffset = offset + items.length;
  const nextCursor = nextOffset < runs.length ? `aatc1.${nextOffset}` : null;
  return _aaTraceCapability('available', observedAt, {
    endpoint: 'local/page', schema: 'aatc1', item_count: items.length
  }, { items, next_cursor: nextCursor });
}

function _aaIsComparableTraceData(data) {
  if (!_aaIsPlainObject(data) || !_aaInspectTracePayload(data).ok
    || !_aaHasOnlyFields(data, new Set([
      'run_id', 'item_id', 'run_state', 'kind', 'run_duration_ms', 'nodes'
    ]))
    || typeof data.run_id !== 'string' || !data.run_id
    || typeof data.item_id !== 'string' || !data.item_id
    || (data.run_state !== 'running' && data.run_state !== 'stopped')
    || (data.kind !== 'execution' && data.kind !== 'non_execution')
    || !(data.run_duration_ms === null
      || (Number.isFinite(data.run_duration_ms) && data.run_duration_ms >= 0))
    || !Array.isArray(data.nodes)) return false;
  return data.nodes.every(node => _aaIsPlainObject(node)
    && _aaHasOnlyFields(node, new Set(['path', 'ordinal', 'status', 'offset_ms']))
    && typeof node.path === 'string' && AA_TRACE_PATH_PATTERN.test(node.path)
    && Number.isInteger(node.ordinal) && node.ordinal >= 0
    && ['pass', 'error', 'changed', 'skipped'].includes(node.status)
    && Number.isFinite(node.offset_ms) && node.offset_ms >= 0);
}

function _aaCompareTraceRuns(baseline, current, options = {}) {
  const observedAt = options.observedAt;
  if (!_aaIsComparableTraceData(baseline) || !_aaIsComparableTraceData(current)) {
    return _aaTraceCapability('malformed', observedAt, { endpoint: 'local/compare', error_code: 'malformed' });
  }
  if (baseline.kind !== 'execution' || current.kind !== 'execution') {
    return _aaTraceCapability('no_data', observedAt, {
      endpoint: 'local/compare', error_code: 'non_execution_trace'
    });
  }
  const minimumDelta = Number.isFinite(options.minimumDeltaMs) ? Math.max(0, options.minimumDeltaMs) : 20;
  const minimumRatio = Number.isFinite(options.minimumRatio) ? Math.max(1, options.minimumRatio) : 1.25;
  const baselineByKey = new Map(baseline.nodes.map(node => [`${node.path}#${node.ordinal}`, node]));
  const currentByKey = new Map(current.nodes.map(node => [`${node.path}#${node.ordinal}`, node]));
  const categories = { added: [], removed: [], reached_later: [], reached_earlier: [], unchanged: [] };
  const allKeys = [...new Set([...baselineByKey.keys(), ...currentByKey.keys()])].sort((leftKey, rightKey) => {
    const left = baselineByKey.get(leftKey) || currentByKey.get(leftKey);
    const right = baselineByKey.get(rightKey) || currentByKey.get(rightKey);
    return _aaCompareText(left.path, right.path) || left.ordinal - right.ordinal;
  });
  for (const key of allKeys) {
    const before = baselineByKey.get(key);
    const after = currentByKey.get(key);
    if (!before) { categories.added.push({ path: after.path, ordinal: after.ordinal }); continue; }
    if (!after) { categories.removed.push({ path: before.path, ordinal: before.ordinal }); continue; }
    const delta = after.offset_ms - before.offset_ms;
    const ratio = before.offset_ms === 0 ? (after.offset_ms === 0 ? 1 : Infinity) : after.offset_ms / before.offset_ms;
    const item = { path: after.path, ordinal: after.ordinal, delta_ms: delta };
    if (delta >= minimumDelta && ratio >= minimumRatio) categories.reached_later.push(item);
    else if (delta <= -minimumDelta && (ratio <= 1 / minimumRatio || after.offset_ms === 0)) categories.reached_earlier.push(item);
    else categories.unchanged.push(item);
  }
  let runClassification = 'unchanged';
  let runDelta = null;
  if (baseline.run_duration_ms !== null && current.run_duration_ms !== null) {
    runDelta = current.run_duration_ms - baseline.run_duration_ms;
    const ratio = baseline.run_duration_ms === 0
      ? (current.run_duration_ms === 0 ? 1 : Infinity)
      : current.run_duration_ms / baseline.run_duration_ms;
    if (runDelta >= minimumDelta && ratio >= minimumRatio) runClassification = 'slower';
    else if (runDelta <= -minimumDelta && (ratio <= 1 / minimumRatio || current.run_duration_ms === 0)) runClassification = 'faster';
  }
  return _aaTraceCapability('available', observedAt, {
    endpoint: 'local/compare', schema: 'ha-trace-comparison-v1', node_count: allKeys.length
  }, {
    run: { classification: runClassification, delta_ms: runDelta },
    nodes: categories
  });
}

function _aaIsDiagnosticTraceCapability(capability) {
  if (!_aaIsPlainObject(capability) || !_aaInspectTracePayload(capability).ok
    || !_aaHasOnlyFields(capability, new Set(['status', 'source', 'observed_at', 'evidence', 'data']))
    || capability.status !== 'available' || capability.source !== AA_TRACE_SOURCE
    || !_aaIsPlainObject(capability.evidence)
    || !_aaHasOnlyFields(capability.evidence, new Set(['endpoint', 'schema', 'node_count', 'run_state']))
    || capability.evidence.endpoint !== 'trace/get'
    || (capability.evidence.schema !== 'ha-trace-v1'
      && capability.evidence.schema !== 'ha-trace-legacy-path-v0')
    || !_aaIsPlainObject(capability.data)
    || !_aaHasOnlyFields(capability.data, new Set([
      'run_id', 'item_id', 'run_state', 'kind', 'run_duration_ms', 'nodes'
    ]))
    || typeof capability.data.run_id !== 'string' || !capability.data.run_id
    || typeof capability.data.item_id !== 'string' || !capability.data.item_id
    || (capability.data.run_state !== 'running' && capability.data.run_state !== 'stopped')
    || (capability.data.kind !== 'execution' && capability.data.kind !== 'non_execution')
    || !(capability.data.run_duration_ms === null
      || (Number.isFinite(capability.data.run_duration_ms) && capability.data.run_duration_ms >= 0))
    || !Array.isArray(capability.data.nodes)) return false;
  return capability.data.nodes.every(node => _aaIsPlainObject(node)
    && _aaHasOnlyFields(node, new Set(['path', 'ordinal', 'status', 'offset_ms']))
    && typeof node.path === 'string' && AA_TRACE_PATH_PATTERN.test(node.path)
    && Number.isInteger(node.ordinal) && node.ordinal >= 0
    && ['pass', 'error', 'changed', 'skipped'].includes(node.status)
    && Number.isFinite(node.offset_ms) && node.offset_ms >= 0);
}

function _aaIsDiagnosticComparison(comparison) {
  if (comparison === null || comparison === undefined) return true;
  if (!_aaIsPlainObject(comparison) || !_aaInspectTracePayload(comparison).ok
    || !_aaHasOnlyFields(comparison, new Set(['status', 'source', 'observed_at', 'evidence', 'data']))
    || comparison.status !== 'available' || comparison.source !== AA_TRACE_SOURCE
    || !_aaIsPlainObject(comparison.evidence)
    || !_aaHasOnlyFields(comparison.evidence, new Set(['endpoint', 'schema', 'node_count']))
    || comparison.evidence.endpoint !== 'local/compare'
    || comparison.evidence.schema !== 'ha-trace-comparison-v1'
    || !_aaIsPlainObject(comparison.data)
    || !_aaHasOnlyFields(comparison.data, new Set(['run', 'nodes']))
    || !_aaIsPlainObject(comparison.data.run)
    || !_aaHasOnlyFields(comparison.data.run, new Set(['classification', 'delta_ms']))
    || !['slower', 'faster', 'unchanged'].includes(comparison.data.run.classification)
    || !(comparison.data.run.delta_ms === null || Number.isFinite(comparison.data.run.delta_ms))
    || !_aaIsPlainObject(comparison.data.nodes)
    || !_aaHasOnlyFields(comparison.data.nodes, new Set([
      'added', 'removed', 'reached_later', 'reached_earlier', 'unchanged'
    ]))) return false;
  return ['added', 'removed', 'reached_later', 'reached_earlier', 'unchanged'].every(category => {
    const values = comparison.data.nodes[category];
    return Array.isArray(values) && values.every(node => _aaIsPlainObject(node)
      && _aaHasOnlyFields(node, new Set(['path', 'ordinal', 'delta_ms']))
      && typeof node.path === 'string' && AA_TRACE_PATH_PATTERN.test(node.path)
      && Number.isInteger(node.ordinal) && node.ordinal >= 0
      && (!Object.hasOwn(node, 'delta_ms') || Number.isFinite(node.delta_ms)));
  });
}

function _aaBuildDiagnostic(options = {}) {
  const capability = options.capability;
  const comparison = options.comparison;
  let valid = false;
  try {
    valid = _aaIsDiagnosticTraceCapability(capability) && _aaIsDiagnosticComparison(comparison);
  } catch (_error) {
    valid = false;
  }
  const data = valid ? capability.data : null;
  if (!data) {
    return { schema: 'ha-automation-analyzer-diagnostic-v1', generated_at: _aaTraceObservedAt(options.generatedAt), status: 'unavailable' };
  }
  const diagnostic = {
    schema: 'ha-automation-analyzer-diagnostic-v1',
    generated_at: _aaTraceObservedAt(options.generatedAt),
    capability: {
      status: capability.status,
      source: capability.source,
      schema: capability.evidence?.schema || null
    },
    run: {
      alias: 'run_001',
      state: data.run_state,
      kind: data.kind,
      duration_ms: data.run_duration_ms,
      nodes: data.nodes.map(node => ({
        path: node.path,
        ordinal: node.ordinal,
        status: node.status,
        offset_ms: node.offset_ms
      }))
    }
  };
  if (comparison?.status === 'available') {
    diagnostic.comparison = {
      run: {
        classification: comparison.data.run.classification,
        delta_ms: comparison.data.run.delta_ms
      },
      nodes: Object.fromEntries(
        ['added', 'removed', 'reached_later', 'reached_earlier', 'unchanged'].map(category => [
          category,
          comparison.data.nodes[category].map(node => ({
            path: node.path,
            ordinal: node.ordinal,
            ...(Object.hasOwn(node, 'delta_ms') ? { delta_ms: node.delta_ms } : {})
          }))
        ])
      )
    };
  }
  return diagnostic;
}

function _aaDownloadDiagnostic(diagnostic, adapters = {}) {
  const windowAdapter = adapters.window || window;
  const documentAdapter = adapters.document || document;
  const payload = JSON.stringify(diagnostic, null, 2) + '\n';
  const blob = new windowAdapter.Blob([payload], { type: 'application/json' });
  const url = windowAdapter.URL.createObjectURL(blob);
  try {
    const anchor = documentAdapter.createElement('a');
    anchor.href = url;
    anchor.download = 'ha-automation-analyzer-diagnostic.json';
    anchor.rel = 'noopener';
    anchor.click();
  } finally {
    windowAdapter.URL.revokeObjectURL(url);
  }
}

const AA_TRACE_CONTRACT = Object.freeze({
  normalizeList: _aaNormalizeList,
  normalizeFull: _aaNormalizeFull,
  paginate: _aaPaginateTraceRuns,
  compare: _aaCompareTraceRuns,
  classifyError: _aaClassifyTraceError,
  requestList: _aaRequestTraceList,
  requestFull: _aaRequestFullTrace,
  requestLatest: _aaRequestLatestTrace,
  buildDiagnostic: _aaBuildDiagnostic,
  downloadDiagnostic: _aaDownloadDiagnostic
});

/* ===== HA Tools split — inline shared infrastructure ===== */
// Bento Design System CSS (inline copy — keeps tool standalone)
const HA_AUTOMATION_ANALYZER_BENTO_CSS = `
/* ═══════════════════════════════════════════════
   HA Tools — Bento Design System v2.0 (Premium)
   ═══════════════════════════════════════════════ */

/* keyboard a11y */
:focus-visible { outline: 2px solid var(--bento-primary, #6366f1); outline-offset: 2px; border-radius: 3px; }

:host {
  /* Brand palette — diamond top, gradient-friendly */
  --bento-primary: #6366f1;
  --bento-primary-2: #8b5cf6;
  --bento-primary-3: #ec4899;
  --bento-primary-hover: #4f46e5;
  --bento-primary-light: rgba(99, 102, 241, 0.08);
  --bento-primary-glow: rgba(99, 102, 241, 0.35);
  --bento-success: #10B981;
  --bento-success-light: rgba(16, 185, 129, 0.10);
  --bento-success-border: rgba(16, 185, 129, 0.25);
  --bento-error: #EF4444;
  --bento-error-light: rgba(239, 68, 68, 0.10);
  --bento-error-border: rgba(239, 68, 68, 0.25);
  --bento-warning: #F59E0B;
  --bento-warning-light: rgba(245, 158, 11, 0.10);
  --bento-warning-border: rgba(245, 158, 11, 0.25);
  --bento-info: #06b6d4;
  --bento-info-light: rgba(6, 182, 212, 0.10);
  --bento-info-border: rgba(6, 182, 212, 0.25);

  /* Theme */
  --bento-bg:     var(--primary-background-color, #fafaf9);
  --bento-bg-2:   var(--card-background-color, #f5f5f4);
  --bento-card:   var(--card-background-color, #ffffff);
  --bento-glass:  rgba(255, 255, 255, 0.7);
  --bento-border: var(--divider-color, #e7e5e4);
  --bento-border-strong: rgba(0, 0, 0, 0.08);
  --bento-text:           var(--primary-text-color,   #0c0a09);
  --bento-text-secondary: var(--secondary-text-color, #57534e);
  --bento-text-muted:     var(--disabled-text-color,  #a8a29e);

  /* Radii */
  --bento-radius-xs: 8px;
  --bento-radius-sm: 12px;
  --bento-radius-md: 18px;
  --bento-radius-lg: 24px;
  --bento-radius-pill: 999px;

  /* Shadows — modern, layered */
  --bento-shadow-sm: 0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.02);
  --bento-shadow-md: 0 4px 12px rgba(0,0,0,0.05), 0 2px 6px rgba(0,0,0,0.03);
  --bento-shadow-lg: 0 24px 48px -12px rgba(0,0,0,0.10), 0 12px 24px -8px rgba(0,0,0,0.05);
  --bento-shadow-glow: 0 0 0 1px rgba(99,102,241,0.15), 0 8px 32px -8px rgba(99,102,241,0.25);

  /* Gradients */
  --bento-grad-primary: linear-gradient(135deg, #6366f1, #8b5cf6);
  --bento-grad-rainbow: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%);
  --bento-grad-success: linear-gradient(135deg, #10b981, #34d399);
  --bento-grad-error:   linear-gradient(135deg, #ef4444, #f87171);
  --bento-grad-warning: linear-gradient(135deg, #f59e0b, #fbbf24);

  /* Motion */
  --bento-trans-fast: 0.15s cubic-bezier(0.4, 0, 0.2, 1);
  --bento-trans:      0.25s cubic-bezier(0.4, 0, 0.2, 1);
  --bento-trans-slow: 0.4s cubic-bezier(0.4, 0, 0.2, 1);

  /* Typography */
  font-family: "Inter", -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", system-ui, sans-serif;
  font-feature-settings: "cv11" 1, "ss01" 1;
  letter-spacing: -0.01em;
  display: block;
  color: var(--bento-text);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* ── Dark mode ───────────────────────────────── */
:host(.bento-dark) {
    --bento-bg:     var(--primary-background-color, #0a0a0f);
    --bento-bg-2:   var(--card-background-color,    #111119);
    --bento-card:   var(--card-background-color,    #16161f);
    --bento-glass:  rgba(22, 22, 31, 0.7);
    --bento-border: var(--divider-color,            #27272f);
    --bento-border-strong: rgba(255, 255, 255, 0.08);
    --bento-text:           var(--primary-text-color,   #fafaf9);
    --bento-text-secondary: var(--secondary-text-color, #d6d3d1);
    --bento-text-muted:     var(--disabled-text-color,  #78716c);
    --bento-primary:        #818cf8;
    --bento-primary-2:      #a78bfa;
    --bento-primary-3:      #f472b6;
    --bento-primary-light:  rgba(129, 140, 248, 0.12);
    --bento-primary-glow:   rgba(129, 140, 248, 0.45);
    --bento-success: #34d399;
    --bento-success-light:  rgba(52, 211, 153, 0.12);
    --bento-success-border: rgba(52, 211, 153, 0.30);
    --bento-error:   #f87171;
    --bento-error-light:    rgba(248, 113, 113, 0.12);
    --bento-error-border:   rgba(248, 113, 113, 0.30);
    --bento-warning: #fbbf24;
    --bento-warning-light:  rgba(251, 191, 36, 0.12);
    --bento-warning-border: rgba(251, 191, 36, 0.30);
    --bento-info:    #22d3ee;
    --bento-info-light:     rgba(34, 211, 238, 0.12);
    --bento-info-border:    rgba(34, 211, 238, 0.30);
    --bento-shadow-sm: 0 1px 2px rgba(0,0,0,0.4);
    --bento-shadow-md: 0 4px 12px rgba(0,0,0,0.4), 0 2px 6px rgba(0,0,0,0.2);
    --bento-shadow-lg: 0 24px 48px -12px rgba(0,0,0,0.6), 0 12px 24px -8px rgba(0,0,0,0.3);
    --bento-shadow-glow: 0 0 0 1px rgba(129,140,248,0.2), 0 8px 32px -8px rgba(129,140,248,0.5);
    --bento-grad-primary: linear-gradient(135deg, #818cf8, #a78bfa);
    --bento-grad-rainbow: linear-gradient(135deg, #818cf8, #a78bfa 50%, #f472b6);
    color-scheme: dark !important;
  }
:host(.bento-dark) .card, :host(.bento-dark) .card-container, :host(.bento-dark) .main-card, :host(.bento-dark) .panel-card {
    background: var(--bento-card) !important; color: var(--bento-text) !important; border-color: var(--bento-border) !important;
  }
:host(.bento-dark) input, :host(.bento-dark) select, :host(.bento-dark) textarea { background: var(--bento-bg-2); color: var(--bento-text); border-color: var(--bento-border); }
:host(.bento-dark) table th { background: var(--bento-bg-2); color: var(--bento-text-secondary); border-color: var(--bento-border); }
:host(.bento-dark) table td { color: var(--bento-text); border-color: var(--bento-border); }
:host(.bento-dark) pre, :host(.bento-dark) code { background: #1e1e2e !important; color: #e2e8f0 !important; }

/* ── Reset & motion preferences ──────────────── */
* { box-sizing: border-box; }
@media (prefers-reduced-motion: reduce) { * { animation-duration: 0s !important; transition-duration: 0s !important; } }

/* ── Main Card Wrapper ───────────────────────── */
.card {
  background: var(--bento-card);
  border: 1px solid var(--bento-border);
  border-radius: var(--bento-radius-md);
  box-shadow: var(--bento-shadow-md);
  color: var(--bento-text);
  font-family: "Inter", -apple-system, BlinkMacSystemFont, sans-serif;
  position: relative;
  transition: box-shadow var(--bento-trans), border-color var(--bento-trans);
}

/* ── Header ──────────────────────────────────── */
.header {
  padding: 20px 24px 0;
  display: flex; align-items: center; gap: 12px;
}
.header-icon { font-size: 24px; }
.header-title {
  font-size: 18px; font-weight: 700; letter-spacing: -0.02em;
  color: var(--bento-text);
}
.header-badge {
  margin-left: auto;
  background: var(--bento-grad-primary); color: #fff;
  font-size: 11px; padding: 4px 10px; border-radius: var(--bento-radius-pill);
  font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;
  box-shadow: 0 4px 14px -2px var(--bento-primary-glow);
}
.content { padding: 20px 24px 24px; }

/* ── Tabs (modern pill style) ────────────────── */
.tabs, .tab-bar, .tab-nav, .tab-header {
  display: flex !important; gap: 4px !important;
  padding: 4px !important;
  background: var(--bento-bg-2) !important;
  border-radius: var(--bento-radius-pill) !important;
  margin-bottom: 20px !important;
  overflow: visible !important;
  -webkit-overflow-scrolling: touch !important;
  flex-wrap: wrap !important; border-bottom: 0 !important;
  width: 100%; max-width: 100%; box-sizing: border-box;
}
.tab, .tab-btn, .tab-button, .dtab {
  padding: 8px 16px !important;
  border: none !important; background: transparent !important; cursor: pointer !important;
  font-size: 13px !important; font-weight: 600 !important;
  font-family: "Inter", -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, system-ui, sans-serif !important;
  color: var(--bento-text-secondary) !important;
  border-radius: var(--bento-radius-pill) !important;
  margin-bottom: 0 !important;
  transition: all var(--bento-trans) !important;
  white-space: nowrap !important; flex: 1 1 auto !important; text-align: center !important; min-height: 40px !important;
  letter-spacing: -0.005em !important;
}
.tab:hover, .tab-btn:hover, .tab-button:hover, .dtab:hover {
  color: var(--bento-text) !important;
  background: var(--bento-card) !important;
}
.tab.active, .tab-btn.active, .tab-button.active, .dtab.active {
  background: var(--bento-card) !important;
  color: var(--bento-primary) !important;
  box-shadow: var(--bento-shadow-sm) !important;
  font-weight: 700 !important;
}
.tab-content { display: block; }
.tab-content.active { animation: bentoFadeIn 0.35s cubic-bezier(0.4, 0, 0.2, 1); }
@keyframes bentoFadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ── Stat / KPI cards (premium) ──────────────── */
.stat-card, .stat-item, .metric-card, .kpi-card {
  background: var(--bento-bg-2) !important;
  border: 1px solid var(--bento-border) !important;
  border-radius: var(--bento-radius-sm) !important;
  padding: 18px !important;
  text-align: left !important;
  transition: transform var(--bento-trans), box-shadow var(--bento-trans), border-color var(--bento-trans);
  position: relative; overflow: hidden;
}
.stat-card::before, .metric-card::before, .kpi-card::before {
  content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
  background: var(--bento-grad-primary);
  opacity: 0; transition: opacity var(--bento-trans);
}
.stat-card:hover, .stat-item:hover, .metric-card:hover, .kpi-card:hover {
  transform: translateY(-2px); box-shadow: var(--bento-shadow-lg); border-color: var(--bento-primary-light);
}
.stat-card:hover::before, .metric-card:hover::before, .kpi-card:hover::before { opacity: 1; }
.stat-icon { font-size: 22px; margin-bottom: 6px; opacity: 0.85; }
.stat-value, .stat-val, .metric-value, .kpi-val {
  font-size: 26px; font-weight: 800; line-height: 1.1;
  letter-spacing: -0.02em; color: var(--bento-text);
  font-feature-settings: "tnum" 1;
}
.stat-label, .stat-lbl, .metric-label, .kpi-lbl {
  font-size: 11px; color: var(--bento-text-secondary);
  margin-top: 4px; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600;
}
.stat-num {
  font-size: 24px; font-weight: 800; color: var(--bento-primary);
  font-feature-settings: "tnum" 1; letter-spacing: -0.02em;
}
.stat-sub { font-size: 12px; color: var(--bento-text-muted); font-weight: 500; }

/* ── Overview grid ───────────────────────────── */
.overview-grid, .stats-grid, .summary-grid, .stat-cards, .kpi-grid, .metrics-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px; margin-bottom: 20px;
}

/* ── Section headers ─────────────────────────── */
.section-header, .section-title {
  display: flex; align-items: center; justify-content: space-between;
  position: relative; padding-left: 12px;
  font-size: 12px; font-weight: 700; color: var(--bento-text-secondary);
  text-transform: uppercase; letter-spacing: 0.08em;
  margin: 16px 0 10px;
}
.section-header::before, .section-title::before {
  content: ""; width: 4px; height: 4px; border-radius: 50%; background: var(--bento-primary);
  position: absolute; left: 0; top: 50%; transform: translateY(-50%); flex-shrink: 0;
}

/* ── Loading / Empty / Info ──────────────────── */
.loading-bar {
  height: 3px; border-radius: var(--bento-radius-pill);
  background: linear-gradient(90deg, var(--bento-primary), var(--bento-primary-2), transparent);
  background-size: 200% 100%;
  animation: bentoLoad 1.5s linear infinite; margin-bottom: 12px;
}
@keyframes bentoLoad { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

.empty-state, .no-data, .no-results {
  text-align: center; color: var(--bento-text-secondary);
  padding: 40px 20px; font-size: 14px;
  background: var(--bento-bg-2); border-radius: var(--bento-radius-md);
  border: 1px dashed var(--bento-border);
}
.info-note, .tip-box {
  font-size: 13px; color: var(--bento-text-secondary);
  background: var(--bento-primary-light);
  border-radius: var(--bento-radius-sm); padding: 12px 14px;
  border-left: 3px solid var(--bento-primary); margin-top: 12px;
  line-height: 1.55;
}
.last-updated {
  font-size: 11px; color: var(--bento-text-muted);
  text-align: right; margin-top: 12px; font-feature-settings: "tnum" 1;
}

/* ── Buttons (premium) ───────────────────────── */
.refresh-btn {
  background: var(--bento-bg-2); border: 1px solid var(--bento-border);
  border-radius: var(--bento-radius-pill); padding: 6px 14px;
  font-size: 12px; color: var(--bento-text-secondary);
  cursor: pointer; font-weight: 600; transition: all var(--bento-trans);
  font-family: "Inter", -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, system-ui, sans-serif;
}
.refresh-btn:hover {
  background: var(--bento-card); color: var(--bento-primary);
  border-color: var(--bento-primary); transform: translateY(-1px);
  box-shadow: var(--bento-shadow-sm);
}
.toggle-btn, .action-btn {
  background: var(--bento-grad-primary); border: none;
  border-radius: var(--bento-radius-xs); padding: 8px 16px;
  font-size: 13px; color: #fff; cursor: pointer; font-weight: 600;
  transition: all var(--bento-trans); font-family: "Inter", -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, system-ui, sans-serif;
  letter-spacing: -0.005em;
  box-shadow: 0 4px 12px -2px var(--bento-primary-glow);
}
.toggle-btn:hover, .action-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 20px -4px var(--bento-primary-glow);
}
.send-btn, .btn-primary {
  width: 100%;
  background: var(--bento-grad-primary); color: #fff;
  border: none; border-radius: var(--bento-radius-sm);
  padding: 12px 20px; font-size: 14px; font-weight: 700;
  cursor: pointer; font-family: "Inter", -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, system-ui, sans-serif;
  letter-spacing: -0.01em;
  transition: all var(--bento-trans);
  box-shadow: 0 4px 14px -2px var(--bento-primary-glow);
}
.send-btn:hover, .btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 28px -6px var(--bento-primary-glow);
}
.send-btn:active, .btn-primary:active { transform: translateY(0); }
.send-btn:disabled, .btn-primary:disabled {
  opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none;
}

/* ── Badges / Status (modern pill) ───────────── */
.badge, .status-badge, .tag, .chip {
  padding: 4px 12px; border-radius: var(--bento-radius-pill);
  font-size: 11px; font-weight: 700; display: inline-flex; align-items: center; gap: 5px;
  letter-spacing: 0.04em; text-transform: uppercase;
  border: 1px solid;
}
.badge-ok, .badge-success { background: var(--bento-success-light); color: var(--bento-success); border-color: var(--bento-success-border); }
.badge-er, .badge-error   { background: var(--bento-error-light);   color: var(--bento-error);   border-color: var(--bento-error-border); }
.badge-warn, .badge-warning { background: var(--bento-warning-light); color: var(--bento-warning); border-color: var(--bento-warning-border); }
.badge-info { background: var(--bento-info-light); color: var(--bento-info); border-color: var(--bento-info-border); }

.count-badge {
  font-size: 11px; font-weight: 700; padding: 3px 10px;
  border-radius: var(--bento-radius-pill); display: inline-flex; align-items: center;
  font-feature-settings: "tnum" 1;
}
.error-badge { background: var(--bento-error-light); color: var(--bento-error); border: 1px solid var(--bento-error-border); }
.warn-badge  { background: var(--bento-warning-light); color: var(--bento-warning); border: 1px solid var(--bento-warning-border); }
.info-badge  { background: var(--bento-primary-light); color: var(--bento-primary); border: 1px solid var(--bento-border); }
.ok-badge    { background: var(--bento-success-light); color: var(--bento-success); border: 1px solid var(--bento-success-border); }

/* ── Tables (modern) ─────────────────────────── */
table { width: 100%; border-collapse: separate; border-spacing: 0; }
th {
  background: var(--bento-bg-2); color: var(--bento-text-secondary);
  font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em;
  padding: 12px 16px; text-align: left;
  border-bottom: 1px solid var(--bento-border);
}
th:first-child { border-top-left-radius: var(--bento-radius-sm); }
th:last-child  { border-top-right-radius: var(--bento-radius-sm); }
td {
  padding: 14px 16px; border-bottom: 1px solid var(--bento-border);
  color: var(--bento-text); font-size: 13px;
}
tr { transition: background var(--bento-trans-fast); }
tr:hover td { background: var(--bento-primary-light); }
tr:last-child td { border-bottom: 0; }

/* ── Forms / Inputs ──────────────────────────── */
input, select, textarea {
  padding: 10px 14px; border: 1.5px solid var(--bento-border);
  border-radius: var(--bento-radius-xs);
  background: var(--bento-card); color: var(--bento-text);
  font-size: 14px; font-family: "Inter", -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, system-ui, sans-serif;
  transition: all var(--bento-trans); outline: none;
  letter-spacing: -0.005em;
}
input:focus, select:focus, textarea:focus {
  border-color: var(--bento-primary);
  box-shadow: 0 0 0 4px var(--bento-primary-light);
}
input::placeholder, textarea::placeholder { color: var(--bento-text-muted); }

/* ── Code blocks ─────────────────────────────── */
code {
  background: var(--bento-bg-2); padding: 2px 6px;
  border-radius: 4px; font-size: 12px;
  font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;
  border: 1px solid var(--bento-border);
}
pre {
  background: #1e1e2e; color: #e2e8f0;
  padding: 16px; border-radius: var(--bento-radius-sm);
  font-size: 12.5px; overflow-x: auto; line-height: 1.65;
  white-space: pre-wrap; word-break: break-word;
  font-family: "JetBrains Mono", ui-monospace, monospace;
  box-shadow: var(--bento-shadow-md);
}

/* ── Grid layouts ────────────────────────────── */
.schedule-grid, .send-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
}
.schedule-card, .send-card, .info-card {
  background: var(--bento-bg-2); border: 1px solid var(--bento-border);
  border-radius: var(--bento-radius-sm); padding: 16px;
  transition: all var(--bento-trans);
}
.schedule-card:hover, .send-card:hover, .info-card:hover {
  border-color: var(--bento-primary-light); transform: translateY(-1px);
  box-shadow: var(--bento-shadow-md);
}

/* ── Log entries ─────────────────────────────── */
.log-entry {
  display: flex; flex-wrap: wrap; align-items: flex-start;
  gap: 4px 8px; padding: 10px 12px;
  border-radius: var(--bento-radius-sm); margin-bottom: 6px;
  font-size: 12.5px; min-width: 0; overflow: hidden;
  border: 1px solid transparent; transition: all var(--bento-trans-fast);
}
.error-entry { background: var(--bento-error-light); border-color: var(--bento-error-border); }
.warn-entry  { background: var(--bento-warning-light); border-color: var(--bento-warning-border); }
.log-time { color: var(--bento-text-muted); font-feature-settings: "tnum" 1; flex-shrink: 0; font-family: "JetBrains Mono", monospace; }
.log-domain {
  font-weight: 700; flex-shrink: 1; min-width: 0; max-width: 100%;
  overflow: hidden; text-overflow: ellipsis; word-break: break-all;
}
.error-domain { color: var(--bento-error); }
.warn-domain  { color: var(--bento-warning); }
.log-msg {
  color: var(--bento-text-secondary); flex-basis: 100%;
  word-break: break-word; overflow-wrap: anywhere;
  white-space: pre-wrap; min-width: 0; line-height: 1.55;
}

/* ── Send status ─────────────────────────────── */
.send-status {
  padding: 12px 16px; border-radius: var(--bento-radius-sm);
  margin-top: 14px; font-size: 13px; font-weight: 600;
  text-align: center; letter-spacing: -0.005em;
  border: 1px solid;
}
.send-status.sending { background: var(--bento-primary-light); color: var(--bento-primary); border-color: var(--bento-border); }
.send-status.success { background: var(--bento-success-light); color: var(--bento-success); border-color: var(--bento-success-border); }
.send-status.error   { background: var(--bento-error-light);   color: var(--bento-error);   border-color: var(--bento-error-border); }

/* ── Scrollbar ───────────────────────────────── */
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--bento-border); border-radius: var(--bento-radius-pill); border: 2px solid transparent; background-clip: content-box; }
::-webkit-scrollbar-thumb:hover { background: var(--bento-text-muted); background-clip: content-box; }

/* ── Animations ──────────────────────────────── */
@keyframes bentoSpin  { to { transform: rotate(360deg); } }
@keyframes bentoPulse { 0%,100% { opacity: 1; } 50% { opacity: .5; } }
@keyframes bentoSlideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
@keyframes bentoStaggerIn { from { opacity: 0; transform: translateY(12px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }

/* Apply stagger to grids of stat-cards */
.stats-grid > *, .overview-grid > *, .summary-grid > * {
  animation: bentoStaggerIn 0.35s cubic-bezier(0.4, 0, 0.2, 1) both;
}
.stats-grid > *:nth-child(1)  { animation-delay: 0.02s; }
.stats-grid > *:nth-child(2)  { animation-delay: 0.06s; }
.stats-grid > *:nth-child(3)  { animation-delay: 0.10s; }
.stats-grid > *:nth-child(4)  { animation-delay: 0.14s; }
.stats-grid > *:nth-child(5)  { animation-delay: 0.18s; }
.stats-grid > *:nth-child(6)  { animation-delay: 0.22s; }

/* ── Mobile — 768 px ─────────────────────────── */
@media (max-width: 768px) {
  .content { padding: 16px; }
  .header { padding: 16px 16px 0; }
  .tabs { gap: 2px !important; padding: 3px !important; }
  .tab, .tab-button, .tab-btn { padding: 6px 12px !important; font-size: 12px !important; }
  .overview-grid, .stats-grid, .summary-grid, .stat-cards, .kpi-grid, .metrics-grid {
    grid-template-columns: repeat(2, 1fr); gap: 10px;
  }
  .stat-value, .stat-val, .kpi-val, .metric-val { font-size: 22px; }
  .stat-label, .stat-lbl, .kpi-lbl, .metric-lbl { font-size: 10px; }
  .send-grid, .schedule-grid { grid-template-columns: 1fr; }
  .log-entry { flex-wrap: wrap; gap: 2px 6px; padding: 8px 10px; }
  .log-domain { max-width: 60%; font-size: 11.5px; }
  .log-msg { flex-basis: 100%; max-width: 100%; font-size: 11.5px; }
  pre { padding: 12px; font-size: 11.5px; }
  h2 { font-size: 18px; }
  h3 { font-size: 15px; }
  table { font-size: 12.5px; }
  th, td { padding: 10px 12px; }
}
@media (max-width: 480px) {
  .tabs { gap: 1px !important; padding: 2px !important; }
  .tab, .tab-button, .tab-btn { padding: 5px 10px !important; font-size: 11px !important; }
  .overview-grid, .stats-grid, .summary-grid { grid-template-columns: 1fr 1fr; }
  .stat-value, .stat-val, .kpi-val { font-size: 18px; }
}
`;
// Card-owned first-run guidance and support footer. Never mutates document or foreign cards.
const _LOCAL_INTRO_KEY = 'ha-intro-dismissed-ha-automation-analyzer';
const _LOCAL_INTRO = {
  headline: 'Surface slow / failing / suspicious automations.',
  steps: ['Overview shows total + health score + top failing.', 'Performance tab ranks by avg runtime.', 'Optimization tab suggests improvements (loops, redundant triggers).']
};
const _LOCAL_DONATE_HTML = ''
  + '<div class="donate-section" data-source="ha-automation-analyzer">'
  + '  <div class="donate-text">'
  + '    <h3>❤️ Support HA Tools Development</h3>'
  + '    <p>If this tool makes your Home Assistant life easier, consider supporting the project. Every coffee motivates further development!</p>'
  + '  </div>'
  + '  <div class="donate-buttons">'
  + '    <a class="donate-btn coffee" href="https://buymeacoffee.com/macsiem" target="_blank" rel="noopener noreferrer">☕ Buy Me a Coffee</a>'
  + '    <a class="donate-btn paypal" href="https://www.paypal.com/donate/?hosted_button_id=Y967H4PLRBN8W" target="_blank" rel="noopener noreferrer">💳 PayPal</a>'
  + '  </div>'
  + '</div>';
function _localIntroDismissed() {
  try { return localStorage.getItem(_LOCAL_INTRO_KEY) === '1'; } catch(e) { return false; }
}
function _renderLocalIntro() {
  if (_localIntroDismissed()) return '';
  const steps = _LOCAL_INTRO.steps.map(step => '<li>' + _esc(step) + '</li>').join('');
  return '<div class="intro-banner" data-intro="ha-automation-analyzer">'
    + '<button class="intro-dismiss" type="button" title="Dismiss" aria-label="Dismiss">✕</button>'
    + '<div class="intro-headline">💡 ' + _esc(_LOCAL_INTRO.headline) + '</div>'
    + '<ol class="intro-steps">' + steps + '</ol>'
    + '</div>';
}
function _bindLocalIntroDismiss(root) {
  const button = root && root.querySelector('.intro-banner[data-intro="ha-automation-analyzer"] .intro-dismiss');
  if (!button) return;
  button.addEventListener('click', event => {
    event.stopPropagation();
    try { localStorage.setItem(_LOCAL_INTRO_KEY, '1'); } catch(e) {}
    button.closest('.intro-banner')?.remove();
  });
}
/* ============================================================ */

class HAAutomationAnalyzer extends HTMLElement {
  constructor() {
    super();
    this._lang = (navigator.language || '').startsWith('pl') ? 'pl' : 'en';
    this.attachShadow({ mode: "open" });
    this.config = {};
    this._hass = null;
    this._toolId = this.tagName.toLowerCase().replace('ha-', '');
    this.currentTab = "overview";
    this.automationStats = new Map();
    this.executionTimes = [];
    this.triggerTypes = new Map();
    this.failedAutomations = new Map();
    this.disabledAutomations = [];
    this._charts = {};
    this._chartJsLoaded = false;
    this._isLoading = true;
    this._lastUpdated = null;
    this._lastRenderTime = 0;
    this._renderScheduled = false;
    this._renderTimer = null;
    this._refreshTimer = null;
    this._firstHassRender = false;
    this._loadingInProgress = false;
    this._lifecycleEpoch = 0;
    this._activeLoadToken = null;
    this._activeTimelineToken = null;
    this._activeTraceStatsToken = null;
    this._pendingLoad = false;
    this._suppressTimelineAutoFetch = false;
    this._traceNoticeDismissed = false;
    this._loadingPhase = "";
    this._filterText = "";
    this._sortBy = "lastTriggered";
    this._sortDir = "desc";
    this._timeRange = "all";
    // Pagination for optimization tab
    this._currentPage = {};
    this._pageSize = 15;
    // Timeline tab state
    this._selectedTimelineId = null;   // entity id (automation.xxx)
    this._timelineData = null;         // fetched trace object
    this._timelineError = null;        // error string or null
    this._timelineLoading = false;     // true while fetching
    this._timelineRuns = [];
    this._timelineSelectedRunId = null;
    this._timelineBaselineRunId = null;
    this._timelineBaselineData = null;
    this._timelineComparison = null;
    this._timelineCompareLoading = false;
    this._timelinePageCursor = null;
    this._timelinePageSize = 20;
    // Global trace summaries are admin-only and loaded only after an explicit click.
    this._traceStatsCapability = null;
    this._traceStatsCache = null;
    this._traceStatsLoading = false;
    this._traceStatsBaseMetrics = null;
    this._lastHassConnection = null;
    this._lastTraceRole = 'unknown';
    this._lastAutomationSetSignature = '';
  }

  setConfig(config) {
    const wasAutoRefreshEnabled = this.config?.auto_refresh !== false;
    const safeConfig = config && typeof config === 'object' ? config : {};
    this.config = {
      title: typeof safeConfig.title === 'string' ? safeConfig.title : "Automation Analyzer",
      show_disabled: typeof safeConfig.show_disabled === 'boolean' ? safeConfig.show_disabled : true,
      auto_refresh: typeof safeConfig.auto_refresh === 'boolean' ? safeConfig.auto_refresh : true
    };
    if (!wasAutoRefreshEnabled && this.config.auto_refresh && this.isConnected && this._hass) {
      if (this._renderTimer) clearTimeout(this._renderTimer);
      this._renderTimer = null;
      this._renderScheduled = false;
      if (this._loadingInProgress) {
        this._activeLoadToken = null;
        this._pendingLoad = true;
      } else {
        this._loadAndRender();
      }
    }
  }

  set hass(hass) {
    try {
      var _bg = (getComputedStyle(this).getPropertyValue('--card-background-color') || getComputedStyle(this).getPropertyValue('--primary-background-color') || '').trim();
      var _d = false;
      if (_bg) {
        var _h, _r, _g, _b, _m;
        if (_bg.charAt(0) === '#') { _h = _bg.slice(1); if (_h.length === 3) _h = _h.replace(/(.)/g, '$1$1'); _r = parseInt(_h.slice(0,2),16); _g = parseInt(_h.slice(2,4),16); _b = parseInt(_h.slice(4,6),16); }
        else { _m = _bg.match(/[\d.]+/g); if (_m) { _r = +_m[0]; _g = +_m[1]; _b = +_m[2]; } }
        if (_r != null) _d = (0.2126*_r + 0.7152*_g + 0.0722*_b) / 255 < 0.5;
      } else if (hass && hass.themes) { _d = !!hass.themes.darkMode; }
      this.classList.toggle('bento-dark', _d);
    } catch (e) {}

    if (hass?.language) this._lang = hass.language.startsWith('pl') ? 'pl' : 'en';
    const previousHass = this._hass;
    const hassChanged = previousHass !== hass;
    const nextConnection = hass?.connection || null;
    const nextRole = hass?.user && typeof hass.user.is_admin === 'boolean'
      ? (hass.user.is_admin ? 'admin' : 'non_admin') : 'unknown';
    let nextAutomationSetSignature = '';
    try {
      nextAutomationSetSignature = Object.entries(hass?.states || {})
        .filter(([entityId]) => entityId.startsWith('automation.'))
        .map(([entityId, entity]) => `${entityId}\u0000${entity.attributes?.id || ''}`)
        .sort()
        .join('\u0001');
    } catch (_error) {}
    const traceSnapshotChanged = hassChanged
      || this._lastHassConnection !== nextConnection
      || this._lastTraceRole !== nextRole
      || this._lastAutomationSetSignature !== nextAutomationSetSignature;
    const hasTimelineState = Boolean(
      this._activeTimelineToken || this._timelineLoading || this._timelineData
      || this._timelineError || this._selectedTimelineId
    );
    this._hass = hass;
    if (traceSnapshotChanged) this._invalidateTraceStatistics();
    this._lastHassConnection = nextConnection;
    this._lastTraceRole = nextRole;
    this._lastAutomationSetSignature = nextAutomationSetSignature;
    let timelineInvalidated = false;
    if (traceSnapshotChanged && hasTimelineState) {
      this._abortTimelinePipeline();
      this._timelineLoading = false;
      this._timelineData = null;
      this._timelineError = null;
      this._selectedTimelineId = null;
      this._resetTimelineRunState();
      this._suppressTimelineAutoFetch = true;
      timelineInvalidated = true;
    }
    if (!hass || !this.isConnected) return;
    if (timelineInvalidated || traceSnapshotChanged) this.render();
    if (hassChanged && this._loadingInProgress) {
      this._activeLoadToken = null;
      this._pendingLoad = true;
      return;
    }
    const now = Date.now();
    if (!this._firstHassRender) {
      this._firstHassRender = true;
      this._loadAndRender();
      return;
    }
    // Respect this card's own explicit auto_refresh configuration.
    if (!this._isAutoRefreshEnabled()) {
      return;
    }
    if (timelineInvalidated || this._suppressTimelineAutoFetch) {
      if (this._renderTimer) clearTimeout(this._renderTimer);
      this._renderTimer = null;
      this._renderScheduled = false;
      this._loadAndRender();
      return;
    }
    if (now - (this._lastRenderTime || 0) < 30000) {
      if (!this._renderScheduled) {
        this._renderScheduled = true;
        this._renderTimer = setTimeout(() => {
          this._renderTimer = null;
          if (!this.isConnected) return;
          this._renderScheduled = false;
          if (this._isAutoRefreshEnabled()) this._loadAndRender();
        }, 30000 - (now - (this._lastRenderTime || 0)));
      }
      return;
    }
    this._loadAndRender();
  }

  get hass() { return this._hass; }

  connectedCallback() {
    this._lifecycleEpoch += 1;
    const epoch = this._lifecycleEpoch;
    this._activeLoadToken = null;
    this._abortTimelinePipeline();
    this._invalidateTraceStatistics();
    this._pendingLoad = false;
    this._suppressTimelineAutoFetch = false;
    this._loadingInProgress = false;
    this._firstHassRender = false;
    this._lastRenderTime = 0;
    queueMicrotask(() => {
      if (!this.isConnected || this._lifecycleEpoch !== epoch || !this._hass || this._firstHassRender) return;
      this._firstHassRender = true;
      this._loadAndRender();
    });
  }

  get _t() {
    const T = {
      pl: {
        title: 'Analizator Automatyzacji',
        loading: 'Wczytywanie...',
        noData: 'Brak danych',
        error: 'B\u0142\u0105d',
        refresh: 'Od\u015Bwie\u017C',
        automations: 'Automatyzacje',
        enabled: 'Aktywne',
        disabled: 'Nieaktywne',
        total: 'Razem',
        triggers: 'Wyzwalacze',
        actions: 'Akcje',
        conditions: 'Warunki',
        lastTriggered: 'Ostatnie uruchomienie',
        never: 'Nigdy',
        errorCountRecent: 'b\u0142\u0105d(y) w ostatnich uruchomieniach',
        justNow: 'przed chwil\u0105',
        excellent: 'Doskona\u0142y',
        good: 'Dobry',
        needsImprovement: 'Wymaga poprawy',
        noAutomationsMatching: 'Brak automatyzacji pasuj\u0105cych do filtr\u00f3w',
        totalLabel: '\u0141\u0105cznie',
        active: 'Aktywnych',
        disabledLabel: 'Wy\u0142\u0105czonych',
        errorsLabel: 'B\u0142\u0119dy w trasach',
        searchPlaceholder: 'Szukaj automatyzacji\u2026',
        runsTodayOption: 'Zachowane dzi\u015B',
        executionTime: 'Czas wykonania',
        descendingAscending: 'Malej\u0105co/Rosn\u0105co',
        allTime: 'Ca\u0142y czas',
        today: 'Dzi\u015B',
        mostActiveTodayTitle: 'Aktywno\u015B\u0107 zachowanych tras',
        executionTimeDistribution: 'Rozk\u0142ad czas\u00f3w wykonania',
        noExecutionTimeData: 'Brak danych o czasach wykonania \u2014 zbyt ma\u0142o uruchomie\u0144 z pe\u0142nymi danymi',
        noTriggerData: 'Brak danych o wyzwalaczach \u2014 konfiguracja automatyzacji niedost\u0119pna',
        errorBadge: 'b\u0142\u0105d',
        disabledBadge: 'wy\u0142\u0105czona',
        enableButton: 'W\u0142\u0105cz',
        noFailedAutomations: 'Brak nieudanych automatyzacji',
        noDisabledAutomations: 'Brak wy\u0142\u0105czonych automatyzacji',
        allRecent: 'Wszystkie automatyzacje by\u0142y ostatnio aktywne',
        withErrors: 'Z b\u0142\u0119dami',
        automationsWithErrors: 'Automatyzacje z b\u0142\u0119dami',
        disabledAutomations: 'Wy\u0142\u0105czone automatyzacje',
        tracesNotice: 'Domy\u015blnie HA przechowuje tylko <strong>5 ostatnich tras</strong> na automatyzacj\u0119. Trasy s\u0105 <strong>czyszczone po restarcie</strong> HA. Limit mo\u017cesz zwi\u0119kszy\u0107 przez <code>stored_traces</code> w konfiguracji automatyzacji.',
        tracesNoticeDetail: '\u2139\uFE0F Trace s\u0105 dost\u0119pne tylko dla administratora Home Assistanta i pozostaj\u0105 lokalnie w przegl\u0105darce.',
        closeButton: 'Zamknij',
        loadingData: '\u0141adowanie danych...',
        fetchingTraces: 'Pobieranie tras wykonania...',
        never: 'nigdy',
        minutesAgo: 'm temu',
        minutesAgoEn: 'm ago',
        hoursAgoSuffix: 'h temu',
        hoursAgoSuffixEn: 'h ago',
        daysAgoSuffix: 'd temu',
        daysAgoSuffixEn: 'd ago',
        secondsAgo: 's temu',
        secondsAgoEn: 's ago',
        todayCount: 'Zachowane uruchomienia dzi\u015B',
        averageTime: '\u015Aredni czas',
        todayRunsOption: 'Zachowane dzi\u015B',
        todayRunsOptionEn: 'Retained today',
        noFailedLabel: '\u2705 Brak b\u0142\u0119d\u00f3w w zachowanych trasach',
        noDisabledLabel: '\u2705 Brak wy\u0142\u0105czonych automatyzacji',
        noStaleLabel: '\u2705 Wszystkie automatyzacje by\u0142y ostatnio aktywne',
        sevenDays: '7 dni',
        fourteenDays: '14 dni',
        thirtyDays: '30 dni',
        name: 'Nazwa',
        state: 'Stan',
        descending: 'Malejąco',
        ascending: 'Rosnąco',
        dailyExecutions: 'Zachowane wykonania (14 dni)',
        noDailyTraceData: 'Wczytaj statystyki tras, aby zobaczy\u0107 zachowane wykonania z ostatnich 14 dni.',
        noTraceOptimizationData: 'Wczytaj statystyki tras, aby oceni\u0107 czasy i b\u0142\u0119dy w zachowanych wykonaniach.',
        noRetainedActivityData: 'Wczytaj statystyki tras w zak\u0142adce Wydajno\u015B\u0107 lub Optymalizacja, aby por\u00f3wna\u0107 zachowane wykonania.',
        systemHealthScope: 'Na podstawie stan\u00f3w i dost\u0119pnych danych',
        statistics: 'Statystyki',
        avgTimeLabel: '\u015Ar. zachowanego wykonania',
        withTimeData: 'Zachowanych zako\u0144czonych',
        retainedRuns: 'Zachowane wykonania',
        triggerTypes: 'Typ\u00f3w wyzwalaczy',
        noSlowAutomations: '\u2705 Brak wolnych automatyzacji w zachowanych trasach',
        noFailedAutomations2: '\u2705 Brak nieudanych automatyzacji',
        slowAutomationsTitle: '\u26A0\uFE0F Wolne zachowane wykonania (&gt;800ms)',
        failedAutomationsTitle: '\u274C B\u0142\u0119dy w zachowanych trasach',
        disabledAutomationsTitle: '\u23F8\uFE0F Wy\u0142\u0105czone automatyzacje',
        inactiveAutomationsTitle: '\uD83D\uDCA4 Nieaktywne automatyzacje (&gt;30 dni)',
        slowStat: 'Wolnych (&gt;800ms)',
        withErrorsStat: 'Z b\u0142\u0119dami',
        disabledStat: 'Wy\u0142\u0105czonych',
        inactiveStat: 'Nieaktywnych (&gt;30d)',
        lastUpdated: 'Ostatnia aktualizacja: ',
        automations: 'automatyzacji',
        tabOverview: 'Przegl\u0105d',
        tabPerformance: 'Wydajno\u015B\u0107',
        tabOptimization: 'Optymalizacja',
        phaseLoadingAutomations: 'Wczytywanie automatyzacji...',
        phaseLoadingMetadata: 'Pobieranie metadanych...',
        phaseLoadingTraces: 'Pobieranie tras wykonania...',
        systemHealth: 'Stan systemu automatyzacji',
        triggerTypesTitle: 'Typy wyzwalaczy',
        tabTimeline: 'Oś czasu',
        timelineTitle: 'Linia czasu automatyzacji',
        timelineSelectPrompt: 'Wybierz automatyzację, aby zobaczyć jej ostatnią trasę wykonania.',
        timelineLoadError: 'Nie można pobrać danych trasy.',
        timelineNoTrace: 'Brak zachowanej trasy dla tej automatyzacji.',
        timelineLoading: 'Pobieranie trasy…',
        timelinePass: 'OK',
        timelineFail: 'Błąd',
        timelineSkipped: 'Pominięto',
        timelineChanged: 'Zmieniono',
        timelineLastTriggered: 'Ostatnie uruchomienie',
        timelineTracingTip: 'Uruchom automatyzację lub zwiększ stored_traces w jej konfiguracji, aby zachować więcej przebiegów.',
        timelineRun: 'Wykonanie',
        timelineBaseline: 'Wykonanie bazowe',
        timelineCompare: 'Porównaj',
        timelineComparing: 'Porównywanie…',
        timelineExport: 'Eksport diagnostyczny',
        traceStatsLoad: 'Wczytaj statystyki tras',
        traceStatsReload: 'Odśwież statystyki tras',
        traceStatsLoading: 'Wczytywanie statystyk tras…',
        traceStatsHint: 'Statystyki tras nie są pobierane automatycznie. Wczytaj je świadomie, gdy są potrzebne.',
        traceStatsLoaded: 'Wczytano podsumowania tras',
        traceStatsNoData: 'Home Assistant nie przechowuje obecnie żadnych podsumowań tras.',
        traceStatsAdmin: 'Statystyki tras wymagają konta administratora Home Assistanta.',
      },
      en: {
        title: 'Automation Analyzer',
        loading: 'Loading...',
        noData: 'No data',
        error: 'Error',
        refresh: 'Refresh',
        automations: 'Automations',
        enabled: 'Enabled',
        disabled: 'Disabled',
        total: 'Total',
        triggers: 'Triggers',
        actions: 'Actions',
        conditions: 'Conditions',
        lastTriggered: 'Last triggered',
        never: 'Never',
        errorCountRecent: 'error(s) in recent runs',
        justNow: 'just now',
        excellent: 'Excellent',
        good: 'Good',
        needsImprovement: 'Needs improvement',
        noAutomationsMatching: 'No automations matching filters',
        totalLabel: 'Total',
        active: 'Active',
        disabledLabel: 'Disabled',
        errorsLabel: 'Trace errors',
        searchPlaceholder: 'Search automations\u2026',
        runsTodayOption: 'Retained today',
        executionTime: 'Execution time',
        descendingAscending: 'Descending/Ascending',
        allTime: 'All time',
        today: 'Today',
        mostActiveTodayTitle: 'Retained trace activity',
        executionTimeDistribution: 'Execution time distribution',
        noExecutionTimeData: 'No execution time data \u2014 too few runs with complete data',
        noTriggerData: 'No trigger data \u2014 automation configuration unavailable',
        errorBadge: 'error',
        disabledBadge: 'disabled',
        enableButton: 'Enable',
        noFailedAutomations: 'No failed automations',
        noDisabledAutomations: 'No disabled automations',
        allRecent: 'All automations were recently active',
        withErrors: 'With errors',
        automationsWithErrors: 'Automations with errors',
        disabledAutomations: 'Disabled automations',
        tracesNotice: 'By default HA stores only the <strong>last 5 traces</strong> per automation. Traces are <strong>cleared on restart</strong>. You can increase the limit with <code>stored_traces</code> in the automation configuration.',
        tracesNoticeDetail: '\u2139\uFE0F Traces require a Home Assistant administrator and remain local to your browser.',
        closeButton: 'Close',
        loadingData: 'Loading data...',
        fetchingTraces: 'Fetching execution traces...',
        never: 'never',
        minutesAgo: 'm ago',
        minutesAgoEn: 'm ago',
        hoursAgoSuffix: 'h ago',
        hoursAgoSuffixEn: 'h ago',
        daysAgoSuffix: 'd ago',
        daysAgoSuffixEn: 'd ago',
        secondsAgo: 's ago',
        secondsAgoEn: 's ago',
        todayCount: 'Retained runs today',
        averageTime: 'Average time',
        todayRunsOption: 'Retained today',
        todayRunsOptionEn: 'Retained today',
        noFailedLabel: '\u2705 No errors in retained traces',
        noDisabledLabel: '\u2705 No disabled automations',
        noStaleLabel: '\u2705 All automations were recently active',
        sevenDays: '7 days',
        fourteenDays: '14 days',
        thirtyDays: '30 days',
        name: 'Name',
        state: 'State',
        descending: 'Descending',
        ascending: 'Ascending',
        dailyExecutions: 'Retained executions (14 days)',
        noDailyTraceData: 'Load trace statistics to see retained executions from the last 14 days.',
        noTraceOptimizationData: 'Load trace statistics to evaluate timings and errors in retained executions.',
        noRetainedActivityData: 'Load trace statistics in Performance or Optimization to compare retained executions.',
        systemHealthScope: 'Based on states and available data',
        statistics: 'Statistics',
        avgTimeLabel: 'Avg. retained run',
        withTimeData: 'Retained completed',
        retainedRuns: 'Retained runs',
        triggerTypes: 'Trigger types',
        noSlowAutomations: '\u2705 No slow automations in retained traces',
        noFailedAutomations2: '\u2705 No failed automations',
        slowAutomationsTitle: '\u26A0\uFE0F Slow retained executions (&gt;800ms)',
        failedAutomationsTitle: '\u274C Errors in retained traces',
        disabledAutomationsTitle: '\u23F8\uFE0F Disabled automations',
        inactiveAutomationsTitle: '\uD83D\uDCA4 Inactive automations (&gt;30 days)',
        slowStat: 'Slow (&gt;800ms)',
        withErrorsStat: 'With errors',
        disabledStat: 'Disabled',
        inactiveStat: 'Inactive (&gt;30d)',
        lastUpdated: 'Last updated: ',
        automations: 'automations',
        tabOverview: 'Overview',
        tabPerformance: 'Performance',
        tabOptimization: 'Optimization',
        phaseLoadingAutomations: 'Loading automations...',
        phaseLoadingMetadata: 'Fetching metadata...',
        phaseLoadingTraces: 'Fetching execution traces...',
        systemHealth: 'Automation system health',
        triggerTypesTitle: 'Trigger Types',
        tabTimeline: 'Timeline',
        timelineTitle: 'Automation trace timeline',
        timelineSelectPrompt: 'Select an automation to view its latest trace.',
        timelineLoadError: 'Could not fetch trace data.',
        timelineNoTrace: 'No retained trace is available for this automation.',
        timelineLoading: 'Fetching trace…',
        timelinePass: 'Pass',
        timelineFail: 'Error',
        timelineSkipped: 'Skipped',
        timelineChanged: 'Changed',
        timelineLastTriggered: 'Last triggered',
        timelineTracingTip: 'Run the automation or increase stored_traces in its configuration to retain more runs.',
        timelineRun: 'Run',
        timelineBaseline: 'Baseline run',
        timelineCompare: 'Compare',
        timelineComparing: 'Comparing…',
        timelineExport: 'Diagnostic export',
        traceStatsLoad: 'Load trace statistics',
        traceStatsReload: 'Refresh trace statistics',
        traceStatsLoading: 'Loading trace statistics…',
        traceStatsHint: 'Trace statistics are not fetched automatically. Load them explicitly when needed.',
        traceStatsLoaded: 'Trace summaries loaded',
        traceStatsNoData: 'Home Assistant does not currently retain any trace summaries.',
        traceStatsAdmin: 'Trace statistics require a Home Assistant administrator account.',
      },
    };
    return T[this._lang] || T.en;
  }

  _sanitize(s) { try { return decodeURIComponent(escape(s)); } catch(e) { return s; } }

  _isAutoRefreshEnabled() {
    return this.config?.auto_refresh !== false;
  }

  _isLifecycleActive(epoch, hass) {
    return this.isConnected && this._lifecycleEpoch === epoch && this._hass === hass;
  }

  _isLoadActive(token) {
    return Boolean(token) && this._activeLoadToken === token
      && this._isLifecycleActive(token.epoch, token.hass);
  }

  async _loadAndRender() {
    if (this._loadingInProgress || !this.isConnected || !this._hass) return;
    const token = { epoch: this._lifecycleEpoch, hass: this._hass };
    this._activeLoadToken = token;
    this._pendingLoad = false;
    this._loadingInProgress = true;
    this._isLoading = true;
    this.render(); // Show loading spinner immediately (fixes blank page)
    try {
      await this.updateAutomationData(token);
      if (!this._isLoadActive(token)) return;
      this.render();
      this._lastRenderTime = Date.now();
    } finally {
      if (token.epoch === this._lifecycleEpoch) {
        if (this._activeLoadToken === token) this._activeLoadToken = null;
        this._loadingInProgress = false;
        if (this._pendingLoad && this.isConnected) {
          this._pendingLoad = false;
          queueMicrotask(() => this._loadAndRender());
        }
      }
    }
  }

  async _loadChartJS() {
    if (this._chartJsLoaded && window.Chart) return window.Chart;
    if (window.Chart) {
      this._chartJsLoaded = true;
      return window.Chart;
    }
    this.shadowRoot.querySelectorAll('canvas').forEach(canvas => {
      canvas.closest('.canvas-wrap')?.classList.add('chart-unavailable-wrap');
      canvas.closest('.card')?.classList.add('chart-unavailable-card');
      const fallback = document.createElement('div');
      fallback.className = 'chart-unavailable';
      fallback.setAttribute('role', 'status');
      fallback.textContent = 'Chart unavailable — numeric analysis remains available.';
      canvas.replaceWith(fallback);
    });
    return null;
  }

  async _callAPI(method, path, loadToken = null) {
    try {
      const hass = loadToken?.hass || this._hass;
      const response = await hass.callApi(method, path);
      if (loadToken && !this._isLoadActive(loadToken)) return null;
      return response;
    } catch (_error) {
      if (loadToken && !this._isLoadActive(loadToken)) return null;
      console.warn('[ha-automation-analyzer] api_unavailable');
      return null;
    }
  }

  async _getAllAutomationConfigs(automations, loadToken = null) {
    const hass = loadToken?.hass || this._hass;
    // Prefer the bulk WebSocket endpoint to minimize requests.
    try {
      if (hass && hass.callWS) {
        const configs = await hass.callWS({ type: "config/automation/list" });
        if (loadToken && !this._isLoadActive(loadToken)) return [];
        if (configs && Array.isArray(configs) && configs.length > 0) return configs;
      }
    } catch (_error) {
      if (loadToken && !this._isLoadActive(loadToken)) return [];
      /* WS not available in this context */
    }

    // Fall back to bounded per-automation reads when bulk listing is unavailable.
    // Only fetch enabled automations to limit backend load and retained data.
    if (automations && automations.length > 0) {
      const configs = [];
      const enabled = automations.filter(([, e]) => e.state === "on");
      const toFetch = enabled.slice(0, 60); // Limit to 60 to avoid overload
      const batchSize = 10;
      for (let i = 0; i < toFetch.length; i += batchSize) {
        const batch = toFetch.slice(i, i + batchSize);
        const results = await Promise.allSettled(
          batch.map(([, entity]) => {
            const attrId = entity.attributes?.id;
            if (!attrId) return Promise.reject("no id");
            return this._callAPI(
              "GET",
              `config/automation/config/${encodeURIComponent(attrId)}`,
              loadToken
            );
          })
        );
        if (loadToken && !this._isLoadActive(loadToken)) return [];
        for (const r of results) {
          if (r.status === "fulfilled" && r.value && r.value.id) configs.push(r.value);
        }
      }
      if (configs.length > 0) return configs;
    }

    console.warn('[ha-automation-analyzer] automation_config_unavailable');
    return [];
  }

  _parseAutomationConfig(configObj) {
    if (!configObj) return { triggers: [], actions: [], conditions: [] };
    const triggerRaw = configObj.trigger || configObj.triggers;
    const actionRaw = configObj.action || configObj.actions;
    const conditionRaw = configObj.condition || configObj.conditions;
    const triggers = triggerRaw ? (Array.isArray(triggerRaw) ? triggerRaw : [triggerRaw]) : [];
    const actions = actionRaw ? (Array.isArray(actionRaw) ? actionRaw : [actionRaw]) : [];
    const conditions = conditionRaw ? (Array.isArray(conditionRaw) ? conditionRaw : [conditionRaw]) : [];
    return { triggers, actions, conditions };
  }

  _getTriggerTypes(triggers) {
    const types = new Set();
    triggers.forEach(trigger => {
      if (typeof trigger === "object") {
        const type = trigger.platform || trigger.trigger;
        if (type) types.add(type);
      }
    });
    return Array.from(types);
  }

  _calculateHealthScore() {
    if (this.automationStats.size === 0) return 0;
    const total = this.automationStats.size;
    const disabled = this.disabledAutomations.length;
    const failed = this.failedAutomations.size;
    const slow = Array.from(this.automationStats.values()).filter(a => typeof a.avgExecutionTime === "number" && a.avgExecutionTime > 800).length;
    const stale = Array.from(this.automationStats.values()).filter(a => {
      if (!a.lastTriggered || a.state === "off") return false;
      const daysSince = (Date.now() - a.lastTriggered.getTime()) / (1000 * 60 * 60 * 24);
      return daysSince > 30;
    }).length;
    let score = 100;
    score -= (disabled / total) * 15;
    score -= (failed / total) * 25;
    score -= (slow / total) * 10;
    score -= (stale / total) * 5;
    return Math.max(0, Math.round(score));
  }

  async updateAutomationData(loadToken = null) {
    const hass = loadToken?.hass || this._hass;
    const inactive = () => loadToken && !this._isLoadActive(loadToken);
    if (inactive()) return;
    if (!hass || !hass.states) {
      if (!inactive()) this._isLoading = false;
      return;
    }
    this._isLoading = true;
    this._loadingPhase = "Odczytywanie stan\u00f3w automatyzacji...";
    try {
      this._fetchError = null;
      const automations = Object.entries(hass.states).filter(([id]) => id.startsWith("automation."));
      this._invalidateTraceStatistics();
      this.automationStats.clear();
      this.triggerTypes.clear();
      this.failedAutomations.clear();
      this.disabledAutomations = [];
      this.executionTimes = [];

      // --- Phase 1: Instant pass using hass states only (ZERO API calls) ---
      const automationMeta = [];
      for (const [id, entity] of automations) {
        const name = this._sanitize(entity.attributes?.friendly_name || id.replace("automation.", ""));
        const isDisabled = entity.state === "off";
        if (isDisabled && !this.config.show_disabled) continue;

        const internalId = entity.attributes?.id || id.replace("automation.", "");

        if (isDisabled) {
          this.disabledAutomations.push({ id, name, automationId: internalId });
        }

        const lastTriggered = entity.attributes?.last_triggered
          ? new Date(entity.attributes.last_triggered)
          : null;

        this.automationStats.set(id, {
          id, automationId: internalId, name,
          state: entity.state, lastTriggered,
          todayCount: 0, avgExecutionTime: "N/A",
          totalActions: 0, conditions: 0,
          triggerTypes: [], primaryTrigger: "unknown",
          isFailed: false, traceCount: 0
        });

        automationMeta.push({ id, entity, name, internalId, isDisabled, lastTriggered });
      }

      // Show basic stats immediately (no API calls made yet)
      this._isLoading = false;
      this._lastUpdated = new Date();
      this._suppressTimelineAutoFetch = false;
      this.render();

      // --- Phase 2: Fetch automation configs (enriches trigger types) ---
      this._loadingPhase = this._lang === 'pl' ? "Pobieranie konfiguracji automatyzacji..." : "Fetching automation configuration...";
      this.render();
      const allConfigs = await this._getAllAutomationConfigs(automations, loadToken);
      if (inactive()) return;
      const configByEntityId = new Map();
      for (const [entityId, entity] of automations) {
        const attrId = entity.attributes?.id;
        if (attrId) {
          const found = allConfigs.find(c => c.id === attrId);
          if (found) { configByEntityId.set(entityId, found); continue; }
        }
        const friendlyName = entity.attributes?.friendly_name;
        if (friendlyName) {
          const found = allConfigs.find(c => c.alias === this._sanitize(friendlyName));
          if (found) { configByEntityId.set(entityId, found); continue; }
        }
        const slug = entityId.replace("automation.", "");
        const found = allConfigs.find(c => c.id === slug);
        if (found) { configByEntityId.set(entityId, found); }
      }

      // Enrich automationStats with config data
      this.triggerTypes.clear();
      for (const a of automationMeta) {
        const configObj = configByEntityId.get(a.id);
        const existing = this.automationStats.get(a.id);
        if (existing && configObj) {
          const parsed = this._parseAutomationConfig(configObj);
          const triggerTypesList = this._getTriggerTypes(parsed.triggers);
          existing.automationId = configObj.id || existing.automationId;
          existing.totalActions = parsed.actions.length;
          existing.conditions = parsed.conditions.length;
          existing.triggerTypes = triggerTypesList;
          existing.primaryTrigger = triggerTypesList[0] || "unknown";
          a.internalId = existing.automationId;
          triggerTypesList.forEach(type => {
            this.triggerTypes.set(type, (this.triggerTypes.get(type) || 0) + 1);
          });
        }
        a.configObj = configObj;
      }
      // Re-render with enriched config data
      this.render();

      this._loadingPhase = "";
      this._lastUpdated = new Date();
    } catch (_error) {
      if (inactive()) return;
      this._fetchError = this._lang === 'pl'
        ? 'Nie można wczytać danych automatyzacji.' : 'Could not load automation data.';
      console.error('[ha-automation-analyzer] automation_data_unavailable');
    } finally {
      if (!inactive()) this._isLoading = false;
    }
  }

  getTopAutomations(count = 5) {
    const all = Array.from(this.automationStats.values()).filter(a => a.state === "on");
    // Primary sort: todayCount, secondary: traceCount, tertiary: most recently triggered
    return all.sort((a, b) => {
      if (b.todayCount !== a.todayCount) return b.todayCount - a.todayCount;
      if (b.traceCount !== a.traceCount) return b.traceCount - a.traceCount;
      const aTime = a.lastTriggered ? a.lastTriggered.getTime() : 0;
      const bTime = b.lastTriggered ? b.lastTriggered.getTime() : 0;
      return bTime - aTime;
    }).slice(0, count);
  }

  getRecentlyTriggered(count = 10) {
    return Array.from(this.automationStats.values())
      .filter(a => a.lastTriggered && a.state === "on")
      .sort((a, b) => b.lastTriggered.getTime() - a.lastTriggered.getTime())
      .slice(0, count);
  }

  getStaleAutomations(daysThreshold = 30) {
    const now = Date.now();
    return Array.from(this.automationStats.values())
      .filter(a => {
        if (a.state === "off") return false;
        if (!a.lastTriggered) return true;
        return (now - a.lastTriggered.getTime()) / (1000 * 60 * 60 * 24) > daysThreshold;
      })
      .sort((a, b) => {
        const aTime = a.lastTriggered ? a.lastTriggered.getTime() : 0;
        const bTime = b.lastTriggered ? b.lastTriggered.getTime() : 0;
        return aTime - bTime;
      }).slice(0, 10);
  }

  getExecutionDistribution() {
    const distribution = { "0-100ms": 0, "100-500ms": 0, "500-1s": 0, "1-5s": 0, "5s+": 0 };
    this.executionTimes.forEach(time => {
      if (time < 100) distribution["0-100ms"]++;
      else if (time < 500) distribution["100-500ms"]++;
      else if (time < 1000) distribution["500-1s"]++;
      else if (time < 5000) distribution["1-5s"]++;
      else distribution["5s+"]++;
    });
    return distribution;
  }

  getTriggerTypeData() {
    return Array.from(this.triggerTypes.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
  }

  getOptimizationData() {
    const slow = Array.from(this.automationStats.values())
      .filter(a => typeof a.avgExecutionTime === "number" && a.avgExecutionTime > 800)
      .sort((a, b) => b.avgExecutionTime - a.avgExecutionTime)
      .slice(0, 10);
    const failed = Array.from(this.failedAutomations.entries())
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const disabled = this.disabledAutomations.slice(0, 15);
    const stale = this.getStaleAutomations();
    return { slow, failed, disabled, stale };
  }

  _getComputedColors() {
    const style = getComputedStyle(document.documentElement);
    return {
      primary: style.getPropertyValue("--primary-color").trim() || "#3B82F6",
      secondary: style.getPropertyValue("--secondary-text-color").trim() || "#64748b",
      error: style.getPropertyValue("--error-color").trim() || "#EF4444",
      success: style.getPropertyValue("--success-color").trim() || "#10B981",
      warning: style.getPropertyValue("--warning-color").trim() || "#F59E0B",
      textPrimary: style.getPropertyValue("--primary-text-color").trim() || "#1e293b",
      border: style.getPropertyValue("--divider-color").trim() || "#e0e0e0",
      cardBg: style.getPropertyValue("--card-background-color").trim() || "#ffffff",
      accent: style.getPropertyValue("--accent-color").trim() || "#3B82F6"
    };
  }

  _formatLastUpdated() {
    if (!this._lastUpdated) return this._t.never;
    const diff = Date.now() - this._lastUpdated;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const suffix = this._lang === 'pl' ? this._t.secondsAgo : this._t.secondsAgoEn;
    const minuteSuffix = this._lang === 'pl' ? this._t.minutesAgo : this._t.minutesAgoEn;
    if (seconds < 60) return `${seconds}${suffix}`;
    if (minutes < 60) return `${minutes}${minuteSuffix}`;
    return this._lastUpdated.toLocaleTimeString(this._lang === 'pl' ? "pl-PL" : "en-US", { hour: "2-digit", minute: "2-digit" });
  }

  _formatTimeSince(date) {
    if (!date) return this._t.never;
    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    const days = Math.floor(hours / 24);
    const minuteSuffix = this._lang === 'pl' ? this._t.minutesAgo : this._t.minutesAgoEn;
    const hourSuffix = this._lang === 'pl' ? this._t.hoursAgoSuffix : this._t.hoursAgoSuffixEn;
    const daySuffix = this._lang === 'pl' ? this._t.daysAgoSuffix : this._t.daysAgoSuffixEn;
    if (mins < 1) return this._t.justNow;
    if (mins < 60) return `${mins}${minuteSuffix}`;
    if (hours < 24) return `${hours}${hourSuffix}`;
    if (days < 7) return `${days}${daySuffix}`;
    const dateLocale = this._lang === 'pl' ? "pl-PL" : "en-US";
    return date.toLocaleDateString(dateLocale, { day: "numeric", month: "short" });
  }

  _navigateToAutomation(automationId) {
    if (typeof automationId !== 'string' || !automationId) return;
    const path = `/config/automation/edit/${encodeURIComponent(automationId)}`;
    // Method 1: HA frontend navigate (works in dashboard cards)
    if (this._hass && typeof this._hass.navigate === "function") {
      this._hass.navigate(path);
      return;
    }
    // Method 2: fire Home Assistant's location-changed event.
    try {
      const event = new CustomEvent("location-changed", { detail: { replace: false } });
      window.history.pushState(null, "", path);
      window.dispatchEvent(event);
      return;
    } catch (_error) {
      console.warn('[ha-automation-analyzer] navigation_unavailable');
    }
    // Method 3: Direct URL change (last resort)
    window.location.href = path;
  }

  async _toggleAutomation(entityId, enable) {
    if (!this._hass) return;
    const epoch = this._lifecycleEpoch;
    const hass = this._hass;
    try {
      await hass.callService("automation", enable ? "turn_on" : "turn_off", {
        entity_id: entityId
      });
      if (!this._isLifecycleActive(epoch, hass)) return;
      this._toast((enable ? "Enabled " : "Disabled ") + entityId.replace(/^automation\./, ""));
      // Refresh data after toggle
      this._refreshTimer = setTimeout(() => {
        this._refreshTimer = null;
        if (this.isConnected) this._loadAndRender();
      }, 1000);
    } catch (_error) {
      if (!this._isLifecycleActive(epoch, hass)) return;
      console.error('[ha-automation-analyzer] automation_toggle_failed');
      this._toast(this._lang === 'pl'
        ? 'Nie można zmienić stanu automatyzacji.' : 'Could not change automation state.', true);
    }
  }

  _toast(message, isError) {
    try {
      this.dispatchEvent(new CustomEvent("hass-notification", {
        detail: { message: (isError ? "⚠️ " : "") + message },
        bubbles: true,
        composed: true,
      }));
    } catch (e) {}
  }

  _isTimelineActive(token) {
    return Boolean(token) && this._activeTimelineToken === token
      && this._isLifecycleActive(token.epoch, token.hass);
  }

  _resetTimelineRunState() {
    this._timelineRuns = [];
    this._timelineSelectedRunId = null;
    this._timelineBaselineRunId = null;
    this._timelineBaselineData = null;
    this._timelineComparison = null;
    this._timelineCompareLoading = false;
    this._timelinePageCursor = null;
  }

  _abortTimelinePipeline() {
    const token = this._activeTimelineToken;
    if (token?.controller && !token.controller.signal.aborted) token.controller.abort();
    this._activeTimelineToken = null;
  }

  _timelineMessage(status) {
    if (status === 'permission_denied' || status === 'unknown_role') {
      return this._lang === 'pl'
        ? 'Dostęp do tras wymaga konta administratora Home Assistanta.'
        : 'Automation traces require a Home Assistant administrator account.';
    }
    if (status === 'malformed') {
      return this._lang === 'pl'
        ? 'Home Assistant zwrócił nieobsługiwany format trasy. Dane zostały bezpiecznie odrzucone.'
        : 'Home Assistant returned an unsupported trace format. The data was safely rejected.';
    }
    if (status === 'no_data') return this._t.timelineNoTrace;
    return this._t.timelineLoadError;
  }

  _newTimelineToken() {
    this._abortTimelinePipeline();
    const token = {
      epoch: this._lifecycleEpoch,
      hass: this._hass,
      controller: new AbortController()
    };
    if (!this._isLifecycleActive(token.epoch, token.hass)) return null;
    this._activeTimelineToken = token;
    return token;
  }

  async _fetchTimeline(entityId, requestedRunId = null) {
    const token = this._newTimelineToken();
    if (!token) return;
    const stats = this.automationStats.get(entityId);
    const automationId = (stats && stats.automationId) ? stats.automationId : entityId.replace('automation.', '');
    this._timelineLoading = true;
    this._timelineData = null;
    this._timelineError = null;
    this._resetTimelineRunState();
    this.render();

    try {
      const listed = await _aaRequestTraceList({
        hass: token.hass,
        itemId: automationId,
        signal: token.controller.signal
      });
      if (!this._isTimelineActive(token)) return;
      if (listed.status !== 'available') {
        if (listed.status === 'no_data') this._timelineData = { empty: true, capability: listed, entityId, stats };
        else if (listed.status !== 'aborted') this._timelineError = listed.status;
        return;
      }
      this._timelineRuns = listed.data.runs.filter(run => run.kind === 'execution');
      const selected = this._timelineRuns.find(run => run.run_id === requestedRunId)
        || this._timelineRuns[0];
      if (!selected) {
        this._timelineData = { empty: true, capability: listed, entityId, stats };
        return;
      }
      this._timelineSelectedRunId = selected.run_id;
      const capability = await _aaRequestFullTrace({
        hass: token.hass,
        itemId: automationId,
        runId: selected.run_id,
        signal: token.controller.signal
      });
      if (!this._isTimelineActive(token)) return;
      if (capability.status === 'available') {
        this._timelineData = { capability, trace: capability.data, summary: selected, entityId, stats };
      } else if (capability.status === 'no_data') {
        this._timelineData = { empty: true, capability, entityId, stats };
      } else if (capability.status !== 'aborted') this._timelineError = capability.status;
    } finally {
      if (this._isTimelineActive(token)) {
        this._activeTimelineToken = null;
        this._timelineLoading = false;
        this.render();
      }
    }
  }

  async _fetchTimelineRun(entityId, runId) {
    const token = this._newTimelineToken();
    if (!token) return;
    const stats = this.automationStats.get(entityId);
    const automationId = stats?.automationId || entityId.replace('automation.', '');
    const summary = this._timelineRuns.find(run => run.run_id === runId);
    if (!summary) {
      this._activeTimelineToken = null;
      this._timelineError = 'no_data';
      this.render();
      return;
    }
    this._timelineLoading = true;
    this._timelineError = null;
    this._timelineData = null;
    this._timelineSelectedRunId = runId;
    this._timelineBaselineRunId = null;
    this._timelineBaselineData = null;
    this._timelineComparison = null;
    this.render();
    try {
      const capability = await _aaRequestFullTrace({
        hass: token.hass,
        itemId: automationId,
        runId,
        signal: token.controller.signal
      });
      if (!this._isTimelineActive(token)) return;
      if (capability.status === 'available') {
        this._timelineData = { capability, trace: capability.data, summary, entityId, stats };
      } else if (capability.status === 'no_data') {
        this._timelineData = { empty: true, capability, entityId, stats };
      } else if (capability.status !== 'aborted') this._timelineError = capability.status;
    } finally {
      if (this._isTimelineActive(token)) {
        this._activeTimelineToken = null;
        this._timelineLoading = false;
        this.render();
      }
    }
  }

  async _compareTimelineRuns() {
    const entityId = this._selectedTimelineId;
    const baselineRunId = this._timelineBaselineRunId;
    const currentCapability = this._timelineData?.capability;
    if (!entityId || !baselineRunId || currentCapability?.status !== 'available'
      || baselineRunId === this._timelineSelectedRunId) return;
    const token = this._newTimelineToken();
    if (!token) return;
    const stats = this.automationStats.get(entityId);
    const automationId = stats?.automationId || entityId.replace('automation.', '');
    this._timelineCompareLoading = true;
    this._timelineComparison = null;
    this.render();
    try {
      const baseline = await _aaRequestFullTrace({
        hass: token.hass,
        itemId: automationId,
        runId: baselineRunId,
        signal: token.controller.signal
      });
      if (!this._isTimelineActive(token)) return;
      this._timelineBaselineData = baseline.status === 'available' ? baseline : null;
      this._timelineComparison = baseline.status === 'available'
        ? _aaCompareTraceRuns(baseline.data, currentCapability.data)
        : baseline;
    } finally {
      if (this._isTimelineActive(token)) {
        this._activeTimelineToken = null;
        this._timelineCompareLoading = false;
        this.render();
      }
    }
  }

  _exportTimelineDiagnostic() {
    const capability = this._timelineData?.capability;
    if (capability?.status !== 'available') return;
    const diagnostic = _aaBuildDiagnostic({
      capability,
      comparison: this._timelineComparison?.status === 'available' ? this._timelineComparison : null
    });
    _aaDownloadDiagnostic(diagnostic);
  }

  _isTraceStatsActive(token) {
    return Boolean(token) && this._activeTraceStatsToken === token
      && this._isLifecycleActive(token.epoch, token.hass);
  }

  _invalidateTraceStatistics() {
    const token = this._activeTraceStatsToken;
    if (token?.controller && !token.controller.signal.aborted) token.controller.abort();
    this._restoreTraceStatisticsBase();
    this._activeTraceStatsToken = null;
    this._traceStatsCapability = null;
    this._traceStatsCache = null;
    this._traceStatsLoading = false;
  }

  _restoreTraceStatisticsBase() {
    const base = this._traceStatsBaseMetrics;
    if (!base) return;
    for (const stats of this.automationStats.values()) {
      const stored = base.byEntityId.get(stats.id);
      if (!stored) continue;
      stats.avgExecutionTime = stored.avgExecutionTime;
      stats.traceCount = stored.traceCount;
      stats.todayCount = stored.todayCount;
      stats.isFailed = stored.isFailed;
    }
    this.executionTimes = base.executionTimes.slice();
    this.failedAutomations = new Map(base.failedAutomations);
    this._traceStatsBaseMetrics = null;
  }

  _traceStatsSignature() {
    return Array.from(this.automationStats.values())
      .map(item => item.automationId)
      .filter(value => typeof value === 'string' && value)
      .sort()
      .join('\u0000');
  }

  _applyTraceStatistics(capability) {
    if (capability?.status !== 'available' || !Array.isArray(capability.data?.runs)) return;
    if (!this._traceStatsBaseMetrics) {
      this._traceStatsBaseMetrics = {
        byEntityId: new Map(Array.from(this.automationStats.values()).map(stats => [
          stats.id,
          {
            avgExecutionTime: stats.avgExecutionTime,
            traceCount: stats.traceCount,
            todayCount: stats.todayCount,
            isFailed: stats.isFailed
          }
        ])),
        executionTimes: this.executionTimes.slice(),
        failedAutomations: new Map(this.failedAutomations)
      };
    }
    const groups = new Map();
    for (const run of capability.data.runs) {
      if (run.kind !== 'execution') continue;
      if (!groups.has(run.item_id)) groups.set(run.item_id, []);
      groups.get(run.item_id).push(run);
    }
    const durations = [];
    const now = new Date(Date.now());
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfDay = startOfDay + 24 * 60 * 60 * 1000;
    this.failedAutomations.clear();
    for (const stats of this.automationStats.values()) {
      const runs = groups.get(stats.automationId) || [];
      const completed = runs.map(run => run.run_duration_ms)
        .filter(value => Number.isFinite(value) && value >= 0 && value < 300000);
      stats.traceCount = runs.length;
      stats.todayCount = runs.filter(run => {
        const startedAt = _aaParseTimestamp(run.started_at);
        return startedAt !== null && startedAt >= startOfDay && startedAt < endOfDay;
      }).length;
      const errors = runs.filter(run => run.script_execution === 'error').length;
      stats.isFailed = errors > 0;
      if (stats.isFailed) {
        this.failedAutomations.set(stats.id, {
          automationId: stats.automationId,
          name: stats.name,
          reason: this._lang === 'pl'
            ? `${errors} ${errors === 1 ? 'błąd' : 'błędów'} w zachowanych trasach`
            : `${errors} ${errors === 1 ? 'error' : 'errors'} in retained traces`
        });
      }
      if (completed.length) {
        stats.avgExecutionTime = Math.round(completed.reduce((sum, value) => sum + value, 0) / completed.length);
        durations.push(...completed);
      } else stats.avgExecutionTime = "N/A";
    }
    this.executionTimes = durations;
  }

  async _loadTraceStatistics(options = {}) {
    if (!this.isConnected || !this._hass || this._traceStatsLoading) return;
    const signature = this._traceStatsSignature();
    const now = Date.now();
    const cached = this._traceStatsCache;
    if (options.force !== true && cached && cached.hass === this._hass && cached.connection === this._hass.connection
      && cached.epoch === this._lifecycleEpoch && cached.signature === signature
      && now < cached.expiresAt) {
      this._traceStatsCapability = cached.capability;
      this._applyTraceStatistics(cached.capability);
      this.render();
      return;
    }
    if (options.force === true) {
      this._restoreTraceStatisticsBase();
      this._traceStatsCache = null;
    }
    const token = {
      epoch: this._lifecycleEpoch,
      hass: this._hass,
      connection: this._hass.connection,
      signature,
      controller: new AbortController()
    };
    this._activeTraceStatsToken = token;
    this._traceStatsLoading = true;
    this._traceStatsCapability = null;
    this.render();
    try {
      const capability = await _aaRequestTraceList({
        hass: token.hass,
        global: true,
        signal: token.controller.signal
      });
      if (!this._isTraceStatsActive(token)) return;
      this._traceStatsCapability = capability;
      if (capability.status === 'available' || capability.status === 'no_data') {
        this._traceStatsCache = {
          hass: token.hass,
          connection: token.connection,
          epoch: token.epoch,
          signature: token.signature,
          expiresAt: Date.now() + 60000,
          capability
        };
      }
      this._applyTraceStatistics(capability);
    } finally {
      if (this._isTraceStatsActive(token)) {
        this._activeTraceStatsToken = null;
        this._traceStatsLoading = false;
        this.render();
      }
    }
  }

  _renderTimelineSteps(traceObj) {
    const nodes = traceObj?.nodes;
    if (!Array.isArray(nodes) || nodes.length === 0) return null;

    const steps = nodes.map((step, idx) => {
      const stepPath = step.path;
      const statusClass = step.status === 'error' ? 'tl-fail'
        : step.status === 'changed' ? 'tl-changed'
        : step.status === 'skipped' ? 'tl-skip' : 'tl-pass';
      const statusLabel = step.status === 'error' ? this._t.timelineFail
        : step.status === 'changed' ? this._t.timelineChanged
        : step.status === 'skipped' ? this._t.timelineSkipped : this._t.timelinePass;
      const relStr = `+${step.offset_ms}ms`;

      // Pretty path label: trigger/0 → Trigger 1, condition/0 → Condition 1, action/0/... → Action 1 > ...
      const parts = stepPath.split('/');
      let label = stepPath;
      if (parts.length >= 2) {
        const type = parts[0];
        const num = parseInt(parts[1], 10);
        const prefix = type.charAt(0).toUpperCase() + type.slice(1);
        label = isNaN(num) ? prefix : `${prefix} ${num + 1}`;
        if (parts.length > 2) label += ' › ' + parts.slice(2).join('/');
      }

      return `<div class="tl-step ${idx === nodes.length - 1 ? 'tl-last' : ''}">
        <div class="tl-connector"><div class="tl-dot ${statusClass}"></div></div>
        <div class="tl-body">
          <div class="tl-row">
            <span class="tl-path">${_esc(label)}</span>
            <span class="tl-badge ${statusClass}">${statusLabel}</span>
            ${relStr ? `<span class="tl-time">${relStr}</span>` : ''}
          </div>
        </div>
      </div>`;
    });

    return steps.join('');
  }

  _renderTimelineComparison() {
    const comparison = this._timelineComparison;
    if (!comparison) return '';
    if (comparison.status !== 'available') {
      return `<div class="tl-inline-err">${_esc(this._timelineMessage(comparison.status))}</div>`;
    }
    const run = comparison.data.run;
    const later = comparison.data.nodes.reached_later.length;
    const earlier = comparison.data.nodes.reached_earlier.length;
    const added = comparison.data.nodes.added.length;
    const removed = comparison.data.nodes.removed.length;
    const runLabel = run.classification === 'slower'
      ? (this._lang === 'pl' ? 'Wolniejsze wykonanie' : 'Slower run')
      : run.classification === 'faster'
        ? (this._lang === 'pl' ? 'Szybsze wykonanie' : 'Faster run')
        : (this._lang === 'pl' ? 'Czas wykonania bez istotnej zmiany' : 'No material run-time change');
    const details = [
      later ? `${later} ${this._lang === 'pl' ? 'kroków osiągnięto później' : 'steps reached later'}` : '',
      earlier ? `${earlier} ${this._lang === 'pl' ? 'kroków osiągnięto wcześniej' : 'steps reached earlier'}` : '',
      added ? `${added} ${this._lang === 'pl' ? 'dodanych kroków' : 'steps added'}` : '',
      removed ? `${removed} ${this._lang === 'pl' ? 'usuniętych kroków' : 'steps removed'}` : ''
    ].filter(Boolean);
    return `<div class="tl-comparison" role="status">
      <strong>${_esc(runLabel)}</strong>${run.delta_ms === null ? '' : ` (${run.delta_ms > 0 ? '+' : ''}${run.delta_ms}ms)`}
      ${details.length ? `<div>${details.map(_esc).join(' · ')}</div>` : ''}
    </div>`;
  }

  _renderTraceStatsControl() {
    const isAdmin = this._hass?.user?.is_admin === true;
    const roleKnown = typeof this._hass?.user?.is_admin === 'boolean';
    const capability = this._traceStatsCapability;
    let message = this._t.traceStatsHint;
    if (!isAdmin) message = this._t.traceStatsAdmin;
    else if (this._traceStatsLoading) message = this._t.traceStatsLoading;
    else if (capability?.status === 'available') {
      message = `${this._t.traceStatsLoaded}: ${capability.evidence.run_count}`;
    } else if (capability?.status === 'no_data') message = this._t.traceStatsNoData;
    else if (capability) message = this._timelineMessage(capability.status);
    const label = capability?.status === 'available' ? this._t.traceStatsReload : this._t.traceStatsLoad;
    return `<div class="trace-stats-control" role="region" aria-label="${_esc(this._t.traceStatsLoad)}">
      <div class="trace-stats-copy">${_esc(message)}</div>
      <button id="trace-stats-load" class="trace-action-btn" type="button"
        ${!isAdmin || this._traceStatsLoading ? 'disabled' : ''}
        aria-disabled="${!isAdmin || this._traceStatsLoading}">${_esc(this._traceStatsLoading ? this._t.traceStatsLoading : label)}</button>
      ${!roleKnown ? `<span class="sr-only">${_esc(this._t.traceStatsAdmin)}</span>` : ''}
    </div>`;
  }

  render() {
    if (!this._hass || !this.isConnected) return;
    const styles = `
      
/* ===== BENTO DESIGN SYSTEM (local fallback) ===== */

:host {
  --bento-primary: #3B82F6;
  --bento-primary-hover: #2563EB;
  --bento-primary-light: rgba(59, 130, 246, 0.08);
  --bento-success: #10B981;
  --bento-success-light: rgba(16, 185, 129, 0.08);
  --bento-error: #EF4444;
  --bento-error-light: rgba(239, 68, 68, 0.08);
  --bento-warning: #F59E0B;
  --bento-warning-light: rgba(245, 158, 11, 0.08);
  --bento-bg: var(--primary-background-color, #F8FAFC);
  --bento-card: var(--card-background-color, #FFFFFF);
  --bento-border: var(--divider-color, #E2E8F0);
  --bento-text: var(--primary-text-color, #1E293B);
  --bento-text-secondary: var(--secondary-text-color, #64748B);
  --bento-text-muted: var(--disabled-text-color, #94A3B8);
  --bento-radius-xs: 6px;
  --bento-radius-sm: 10px;
  --bento-radius-md: 16px;
  --bento-shadow-sm: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06);
  --bento-shadow-md: 0 4px 12px rgba(0,0,0,0.05), 0 2px 4px rgba(0,0,0,0.04);
  --bento-shadow-lg: 0 8px 25px rgba(0,0,0,0.06), 0 4px 10px rgba(0,0,0,0.04);
  --bento-transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

:host {
        display: block;
        --aa-font: var(--ha-font-family-body, var(--mdc-typography-body1-font-family, Roboto, Noto, sans-serif));
        --aa-radius: var(--bento-radius-sm);
        --aa-space-1: var(--ha-space-1, 4px);
        --aa-space-2: var(--ha-space-2, 8px);
        --aa-space-3: var(--ha-space-3, 12px);
        --aa-space-4: var(--ha-space-4, 16px);
        --aa-space-6: var(--ha-space-6, 24px);
        --aa-border: var(--bento-border);
        --aa-text: var(--bento-text);
        --aa-text2: var(--bento-text-secondary);
        --aa-bg: var(--bento-bg);
        --aa-card: var(--bento-card);
        --aa-primary: var(--bento-primary);
        --aa-success: var(--bento-success);
        --aa-warning: var(--bento-warning);
        --aa-danger: var(--bento-error);
        --aa-info: var(--info-color, var(--accent-color, #3B82F6));
        --aa-anim: var(--ha-animation-duration-normal, 250ms);
      }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      .card {
        padding: var(--aa-space-6);
        font-family: var(--aa-font);
        background: var(--bento-bg);
        color: var(--bento-text);
        min-height: 200px;
      }
      .header {
        margin-bottom: var(--aa-space-6);
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: var(--aa-space-3);
      }
      .header-left { flex: 1; min-width: 200px; }
      h1 {
        font-size: 20px;
        font-weight: 600;
        margin-bottom: var(--aa-space-1);
        color: var(--bento-text);
      }
      .subtitle {
        font-size: 12px;
        color: var(--bento-text-secondary);
        display: flex;
        gap: var(--aa-space-2);
        align-items: center;
      }
      .loading-spinner {
        display: inline-block; width: 12px; height: 12px;
        border: 2px solid rgba(255,255,255,0.3); border-radius: 50%;
        border-top-color: white; animation: spin 0.8s linear infinite;
        margin-right: var(--aa-space-1);
      }
      @keyframes spin { to { transform: rotate(360deg); } }
      .tabs {
        display: flex;
        gap: var(--aa-space-2);
        border-bottom: 2px solid var(--bento-border);
        margin-bottom: var(--aa-space-6);
        overflow-x: auto;
        flex-wrap: wrap;
      }
      .tab-btn {
        padding: var(--aa-space-3) var(--aa-space-4);
        border: none; background: none; cursor: pointer;
        font-size: 14px; font-weight: 500;
        font-family: var(--aa-font);
        color: var(--bento-text-secondary);
        border-bottom: 2px solid transparent;
        transition: all var(--aa-anim);
        border-radius: 4px 4px 0 0;
        white-space: nowrap;
      }
      .tab-btn.active {
        color: var(--bento-primary);
        border-bottom-color: var(--bento-primary);
        background: color-mix(in srgb, var(--bento-primary) 8%, transparent);
      }
      .tab-btn:hover {
        color: var(--bento-text);
        background: color-mix(in srgb, var(--bento-text) 4%, transparent);
      }
      .tab-content { display: none; }
      .tab-content.active { display: block; animation: fadeIn var(--aa-anim); }
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      .card {
        background: var(--bento-card);
        border-radius: var(--bento-radius-sm);
        padding: var(--aa-space-4);
        border: 1px solid var(--bento-border);
        margin-bottom: var(--aa-space-4);
        box-shadow: 0 1px 3px rgba(0,0,0,0.06);
      }
      .card-title {
        font-size: 14px; font-weight: 600;
        margin-bottom: var(--aa-space-3);
        color: var(--bento-text);
      }
      .canvas-wrap { position: relative; height: 250px; margin-bottom: var(--aa-space-4); }
      .canvas-wrap.chart-unavailable-wrap {
        height: auto; min-height: 0; margin-bottom: 0; overflow: visible;
      }
      .card.chart-unavailable-card { min-height: 0; }
      .card.chart-empty-card { min-height: 0; }
      .chart-unavailable {
        display: flex; align-items: center; min-height: 44px;
        padding: var(--aa-space-3); box-sizing: border-box;
        border: 1px dashed var(--bento-border); border-radius: var(--bento-radius-sm);
        color: var(--bento-text-secondary); font-size: 13px; line-height: 1.45;
      }
      canvas { width: 100% !important; }
      .stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
        gap: var(--aa-space-3);
        margin-top: var(--aa-space-4);
      }
      .stat {
        background: var(--bento-card);
        padding: var(--aa-space-3);
        border-radius: var(--bento-radius-sm);
        text-align: center;
        border: 1px solid var(--bento-border);
      }
      .stat-value { font-size: 22px; font-weight: 700; color: var(--bento-primary); }
      .stat-label { font-size: 11px; color: var(--bento-text-secondary); margin-top: 2px; }
      .health-row {
        display: flex; align-items: center; gap: var(--aa-space-3);
        margin-bottom: var(--aa-space-4);
      }
      .health-circle {
        width: 56px; height: 56px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        font-weight: 700; font-size: 20px; color: white; flex-shrink: 0;
      }
      .health-circle.excellent { background: var(--bento-success); }
      .health-circle.good { background: var(--bento-warning); }
      .health-circle.poor { background: var(--aa-danger); }
      .health-label { font-size: 12px; color: var(--bento-text-secondary); }
      .auto-list { display: flex; flex-direction: column; gap: 6px; }
      .auto-item {
        display: flex; align-items: center; gap: var(--aa-space-2);
        padding: 10px var(--aa-space-4);
        background: var(--bento-card);
        border: 1px solid var(--bento-border);
        border-radius: var(--bento-radius-sm);
        cursor: pointer;
        transition: all var(--aa-anim);
      }
      .auto-item:hover {
        border-color: var(--bento-primary);
        background: color-mix(in srgb, var(--bento-primary) 4%, var(--bento-card));
      }
      .auto-name {
        font-size: 13px; font-weight: 500; color: var(--bento-text);
        flex: 1; min-width: 0; overflow: hidden;
        text-overflow: ellipsis; white-space: nowrap;
      }
      .auto-meta { font-size: 11px; color: var(--bento-text-secondary); white-space: nowrap; }
      .badge {
        font-size: 11px; font-weight: 600;
        padding: 3px 8px; border-radius: 999px;
        flex-shrink: 0; white-space: nowrap;
      }
      .badge-warn { background: #fef3c7; color: #92400e; }
      .badge-error { background: #fee2e2; color: #991b1b; }
      .badge-info { background: #dbeafe; color: #1e40af; }
      .badge-ok { background: #d1fae5; color: #065f46; }
      .badge-stale { background: #f3e8ff; color: #6b21a8; }
      .auto-arrow { color: var(--bento-text-secondary); font-size: 14px; }
      .toggle-btn {
        padding: 3px 10px; border-radius: 4px; border: 1px solid var(--bento-border);
        background: var(--bento-card); color: var(--bento-primary);
        font-size: 11px; font-weight: 500; cursor: pointer;
        transition: all var(--aa-anim); flex-shrink: 0;
      }
      .toggle-btn:hover { background: var(--bento-primary); color: white; }
      .opt-summary {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
        gap: var(--aa-space-3);
        margin-bottom: var(--aa-space-6);
      }
      .opt-stat {
        padding: var(--aa-space-3);
        border-radius: var(--bento-radius-sm);
        text-align: center; border: 1px solid;
      }
      .opt-stat.warn { background: var(--aa-warn-bg, #fef3c7); border-color: var(--aa-warn-border, #fcd34d); }
      .opt-stat.error { background: var(--aa-error-bg, #fee2e2); border-color: var(--aa-error-border, #fca5a5); }
      .opt-stat.info { background: var(--aa-info-bg, #dbeafe); border-color: var(--aa-info-border, #93c5fd); }
      .opt-stat.stale { background: var(--aa-stale-bg, #f3e8ff); border-color: var(--aa-stale-border, #c4b5fd); }
      .opt-stat-value { font-size: 22px; font-weight: 700; }
      .opt-stat.warn .opt-stat-value { color: var(--aa-warn-text, #92400e); }
      .opt-stat.error .opt-stat-value { color: var(--aa-error-text, #991b1b); }
      .opt-stat.info .opt-stat-value { color: var(--aa-info-text, #1e40af); }
      .opt-stat.stale .opt-stat-value { color: var(--aa-stale-text, #6b21a8); }
      .opt-stat-label { font-size: 11px; color: var(--bento-text-secondary); margin-top: 2px; }
      .opt-section { margin-bottom: var(--aa-space-6); }
      .opt-section .card-title { margin-bottom: var(--aa-space-3); }
      .empty-state {
        text-align: center; padding: var(--aa-space-6) var(--aa-space-4);
        color: var(--bento-text-secondary); font-size: 13px;
        background: var(--bento-card); border: 1px solid var(--bento-border);
        border-radius: var(--bento-radius-sm);
      }
      .loading-state {
        text-align: center; padding: var(--aa-space-6);
        color: var(--bento-text-secondary);
      }
      .loading-state .loading-spinner {
        width: 24px; height: 24px;
        border-width: 3px; margin: 0 auto 12px;
        border-color: rgba(0,0,0,0.1); border-top-color: var(--bento-primary);
      }
      .chart-empty {
        display: flex; align-items: center; justify-content: center;
        min-height: 44px; padding: var(--aa-space-3); box-sizing: border-box;
        color: var(--bento-text-secondary); font-size: 13px; line-height: 1.45;
        text-align: center;
        border: 1px dashed var(--bento-border); border-radius: var(--bento-radius-sm);
      }
      .loading-toast {
        display: flex; align-items: center; gap: var(--aa-space-2);
        padding: var(--aa-space-2) var(--aa-space-4);
        background: color-mix(in srgb, var(--bento-primary) 10%, var(--bento-card));
        border: 1px solid color-mix(in srgb, var(--bento-primary) 30%, var(--bento-border));
        border-radius: var(--bento-radius-sm); margin-bottom: var(--aa-space-3);
        font-size: 12px; color: var(--bento-text-secondary); line-height: 1.4;
        animation: fadeIn var(--aa-anim);
      }
      .loading-toast .loading-spinner {
        border-color: color-mix(in srgb, var(--bento-primary) 20%, transparent);
        border-top-color: var(--bento-primary);
      }
      .trace-notice {
        display: flex; align-items: flex-start; gap: var(--aa-space-3);
        padding: var(--aa-space-3) var(--aa-space-4);
        background: color-mix(in srgb, var(--bento-primary) 8%, var(--bento-card));
        border: 1px solid color-mix(in srgb, var(--bento-primary) 25%, var(--bento-border));
        border-radius: var(--bento-radius-sm); margin-bottom: var(--aa-space-4);
        font-size: 13px; color: var(--bento-text); line-height: 1.5;
      }
      .trace-notice-icon { font-size: 18px; flex-shrink: 0; margin-top: 1px; }
      .trace-notice a {
        color: var(--bento-primary); text-decoration: underline;
        cursor: pointer; font-weight: 500;
      }
      .trace-notice a:hover { opacity: 0.8; }
      .trace-notice-dismiss {
        margin-left: auto; background: none; border: none;
        color: var(--bento-text-secondary); cursor: pointer; font-size: 16px;
        padding: 0 4px; line-height: 1; flex-shrink: 0;
      }
      .trace-notice-dismiss:hover { color: var(--bento-text); }
      .trace-notice-global {
        display: flex; align-items: flex-start; gap: var(--aa-space-3);
        padding: var(--aa-space-3) var(--aa-space-4);
        background: color-mix(in srgb, var(--bento-primary) 8%, var(--bento-card));
        border: 1px solid color-mix(in srgb, var(--bento-primary) 25%, var(--bento-border));
        border-radius: var(--bento-radius-sm); margin-bottom: var(--aa-space-4);
        font-size: 12px; color: var(--bento-text); line-height: 1.5;
      }
      .trace-notice-global .trace-notice-icon { font-size: 16px; flex-shrink: 0; margin-top: 1px; }
      .trace-notice-global a { color: var(--bento-primary); text-decoration: underline; cursor: pointer; font-weight: 500; }
      .trace-notice-global a:hover { opacity: 0.8; }
      .trace-notice-global .detail { color: var(--bento-text-secondary); font-size: 11px; margin-top: 2px; }
      .filter-bar {
        display: flex; flex-wrap: wrap; gap: var(--aa-space-2);
        margin-bottom: var(--aa-space-4); align-items: center;
      }
      .filter-bar input[type="text"] {
        flex: 1; min-width: 160px; padding: 7px 12px;
        border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm);
        background: var(--bento-card); color: var(--bento-text);
        font-size: 13px; font-family: var(--aa-font);
        outline: none; transition: border-color var(--aa-anim);
      }
      .filter-bar input[type="text"]:focus { border-color: var(--bento-primary); }
      .filter-bar input[type="text"]::placeholder { color: var(--bento-text-secondary); }
      .filter-bar select {
        padding: 7px 28px 7px 10px; border: 1px solid var(--bento-border);
        border-radius: var(--bento-radius-sm); background: var(--bento-card); color: var(--bento-text);
        font-size: 12px; font-family: var(--aa-font); cursor: pointer;
        appearance: none; -webkit-appearance: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%2364748b'/%3E%3C/svg%3E");
        background-repeat: no-repeat; background-position: right 8px center;
      }
      .filter-bar select:focus { border-color: var(--bento-primary); outline: none; }
      .filter-bar .sort-dir-btn {
        padding: 6px 8px; border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm);
        background: var(--bento-card); color: var(--bento-text-secondary); cursor: pointer;
        font-size: 14px; line-height: 1; transition: all var(--aa-anim);
      }
      .filter-bar .sort-dir-btn:hover { border-color: var(--bento-primary); color: var(--bento-primary); }
      .auto-list-full { display: flex; flex-direction: column; gap: 4px; max-height: 460px; overflow-y: auto; }
      .auto-list-full::-webkit-scrollbar { width: 4px; }
      .auto-list-full::-webkit-scrollbar-thumb { background: var(--bento-border); border-radius: 4px; }
      .auto-item-full {
        display: flex; align-items: center; gap: var(--aa-space-2);
        padding: 8px var(--aa-space-3);
        background: var(--bento-card); border: 1px solid var(--bento-border);
        border-radius: var(--bento-radius-sm); cursor: pointer;
        transition: all var(--aa-anim); font-size: 13px;
      }
      .auto-item-full:hover {
        border-color: var(--bento-primary);
        background: color-mix(in srgb, var(--bento-primary) 4%, var(--bento-card));
      }
      .auto-item-full .auto-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; color: var(--bento-text); }
      .auto-item-full .auto-detail { font-size: 11px; color: var(--bento-text-secondary); white-space: nowrap; min-width: 50px; text-align: right; }
      .auto-item-full .auto-state-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
      .auto-item-full .auto-state-dot.on { background: var(--bento-success); }
      .auto-item-full .auto-state-dot.off { background: var(--bento-text-secondary); opacity: 0.4; }
      .auto-item-full .auto-state-dot.error { background: var(--aa-danger); }
      .filter-results-count { font-size: 11px; color: var(--bento-text-secondary); padding: 2px 0; }
      /* === PAGINATION STYLES === */
      .pagination {
        display: flex; align-items: center; gap: 8px; margin-top: 12px;
        padding: 12px; background: var(--bento-card); border: 1px solid var(--bento-border);
        border-radius: var(--bento-radius-sm); flex-wrap: wrap;
      }
      .pagination-btn {
        padding: 6px 12px; background: var(--bento-card); border: 1px solid var(--bento-border);
        border-radius: var(--bento-radius-sm); color: var(--bento-primary); font-size: 12px;
        cursor: pointer; transition: all var(--aa-anim); font-weight: 500;
      }
      .pagination-btn:hover:not([disabled]) { background: var(--bento-primary); color: white; }
      .pagination-btn[disabled] { opacity: 0.5; cursor: not-allowed; color: var(--bento-text-secondary); }
      .pagination-info {
        font-size: 12px; color: var(--bento-text-secondary); font-weight: 500;
        min-width: 120px; text-align: center;
      }
      .page-size-select {
        padding: 6px 28px 6px 8px; border: 1px solid var(--bento-border);
        border-radius: var(--bento-radius-sm); background: var(--bento-card); color: var(--bento-text);
        font-size: 12px; cursor: pointer; appearance: none; -webkit-appearance: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%2364748b'/%3E%3C/svg%3E");
        background-repeat: no-repeat; background-position: right 8px center;
      }
      .page-size-select:focus { border-color: var(--bento-primary); outline: none; }
      /* === CHART RESPONSIVE FIX === */
      .canvas-wrap {
        position: relative; height: 250px; margin-bottom: var(--aa-space-4);
        width: 100%; overflow: hidden;
      }
      /* === TIMELINE TAB === */
      .tl-select-bar {
        display: flex; flex-wrap: wrap; gap: var(--aa-space-2);
        margin-bottom: var(--aa-space-4); align-items: center;
      }
      .tl-select-bar select {
        flex: 1; min-width: 180px; padding: 7px 28px 7px 10px;
        border: 1px solid var(--bento-border); border-radius: var(--bento-radius-sm);
        background: var(--bento-card); color: var(--bento-text);
        font-size: 13px; font-family: var(--aa-font); cursor: pointer;
        appearance: none; -webkit-appearance: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%2364748b'/%3E%3C/svg%3E");
        background-repeat: no-repeat; background-position: right 8px center;
        outline: none; transition: border-color var(--aa-anim);
      }
      .tl-select-bar select:focus { border-color: var(--bento-primary); }
      .tl-control-group { display:flex; flex:1 1 220px; flex-direction:column; gap:4px; }
      .tl-control-group label { font-size:11px; font-weight:600; color:var(--bento-text-secondary); }
      .trace-action-btn {
        padding:7px 12px; border:1px solid var(--bento-primary); border-radius:var(--bento-radius-sm);
        background:var(--bento-primary); color:#fff; font:600 12px var(--aa-font); cursor:pointer;
      }
      .trace-action-btn.secondary { background:var(--bento-card); color:var(--bento-primary); }
      .trace-action-btn:disabled { opacity:.5; cursor:not-allowed; }
      .trace-stats-control {
        display:flex; align-items:center; justify-content:space-between; gap:var(--aa-space-3);
        margin-bottom:var(--aa-space-4); padding:12px 14px; border:1px solid var(--bento-border);
        border-radius:var(--bento-radius-sm); background:var(--bento-primary-light);
      }
      .trace-stats-copy { flex:1; min-width:0; color:var(--bento-text-secondary); font-size:12px; line-height:1.5; }
      .tl-comparison {
        margin:0 0 var(--aa-space-4); padding:10px 12px; border:1px solid var(--bento-border);
        border-radius:var(--bento-radius-sm); background:var(--bento-primary-light);
        color:var(--bento-text); font-size:12px; line-height:1.55;
      }
      .sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
      .tl-meta-row {
        display: flex; gap: var(--aa-space-3); flex-wrap: wrap;
        font-size: 12px; color: var(--bento-text-secondary);
        margin-bottom: var(--aa-space-4); align-items: center;
      }
      .tl-meta-badge {
        display: inline-flex; align-items: center; gap: 4px;
        padding: 3px 9px; border-radius: 999px; font-size: 11px;
        font-weight: 600; border: 1px solid;
      }
      .tl-meta-badge.ok { background: var(--bento-success-light, rgba(16,185,129,.1)); color: var(--bento-success, #10b981); border-color: var(--bento-success-border, rgba(16,185,129,.25)); }
      .tl-meta-badge.err { background: var(--bento-error-light, rgba(239,68,68,.1)); color: var(--bento-error, #ef4444); border-color: var(--bento-error-border, rgba(239,68,68,.25)); }
      /* Vertical timeline */
      .tl-list { display: flex; flex-direction: column; position: relative; }
      .tl-step {
        display: flex; gap: var(--aa-space-3);
        position: relative; padding-bottom: var(--aa-space-3);
      }
      .tl-step.tl-last { padding-bottom: 0; }
      .tl-connector {
        display: flex; flex-direction: column; align-items: center;
        flex-shrink: 0; width: 20px;
      }
      .tl-dot {
        width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0;
        border: 2px solid; z-index: 1; position: relative;
      }
      .tl-dot.tl-pass    { background: var(--bento-success, #10b981); border-color: var(--bento-success, #10b981); }
      .tl-dot.tl-fail    { background: var(--bento-error, #ef4444);   border-color: var(--bento-error, #ef4444); }
      .tl-dot.tl-skip    { background: var(--bento-text-muted, #94a3b8); border-color: var(--bento-border, #e2e8f0); }
      .tl-dot.tl-changed { background: var(--bento-warning, #f59e0b); border-color: var(--bento-warning, #f59e0b); }
      .tl-connector::after {
        content: ''; flex: 1; width: 2px;
        background: var(--bento-border, #e2e8f0);
        margin-top: 4px;
      }
      .tl-step.tl-last .tl-connector::after { display: none; }
      .tl-body { flex: 1; min-width: 0; }
      .tl-row {
        display: flex; align-items: center; gap: var(--aa-space-2);
        flex-wrap: wrap; margin-top: 0;
      }
      .tl-path {
        font-size: 13px; font-weight: 500; color: var(--bento-text); flex: 1;
        min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      }
      .tl-badge {
        font-size: 10px; font-weight: 700; padding: 2px 8px;
        border-radius: 999px; flex-shrink: 0; border: 1px solid;
        text-transform: uppercase; letter-spacing: .04em;
      }
      .tl-badge.tl-pass    { background: var(--bento-success-light, rgba(16,185,129,.1)); color: var(--bento-success, #10b981); border-color: var(--bento-success-border, rgba(16,185,129,.25)); }
      .tl-badge.tl-fail    { background: var(--bento-error-light, rgba(239,68,68,.1));   color: var(--bento-error, #ef4444);   border-color: var(--bento-error-border, rgba(239,68,68,.25)); }
      .tl-badge.tl-skip    { background: var(--bento-bg-2, #f5f5f4); color: var(--bento-text-muted, #94a3b8); border-color: var(--bento-border, #e2e8f0); }
      .tl-badge.tl-changed { background: var(--bento-warning-light, rgba(245,158,11,.1)); color: var(--bento-warning, #f59e0b); border-color: var(--bento-warning-border, rgba(245,158,11,.25)); }
      .tl-time {
        font-size: 11px; color: var(--bento-text-muted); font-family: "JetBrains Mono", ui-monospace, monospace;
        white-space: nowrap; flex-shrink: 0;
      }
      .tl-error-msg {
        margin-top: 4px; font-size: 11.5px; color: var(--bento-error, #ef4444);
        background: var(--bento-error-light, rgba(239,68,68,.08));
        border-radius: var(--bento-radius-xs); padding: 5px 9px;
        border: 1px solid var(--bento-error-border, rgba(239,68,68,.2));
        word-break: break-word;
      }
      .tl-tip {
        margin-top: var(--aa-space-4); font-size: 12px; color: var(--bento-text-secondary);
        background: var(--bento-primary-light, rgba(59,130,246,.08));
        border-left: 3px solid var(--bento-primary); border-radius: var(--bento-radius-xs);
        padding: 10px 12px; line-height: 1.55;
      }
      .tl-inline-err {
        padding: 10px 14px; border-radius: var(--bento-radius-sm);
        background: var(--bento-error-light, rgba(239,68,68,.08));
        color: var(--bento-error, #ef4444);
        border: 1px solid var(--bento-error-border, rgba(239,68,68,.2));
        font-size: 13px; font-weight: 500; margin-bottom: var(--aa-space-3);
      }
    `;

    const totalActive = Array.from(this.automationStats.values()).filter(a => a.state === "on").length;
    const hasTraceStatistics = this._traceStatsCapability?.status === 'available';
    const hasRetainedRunData = hasTraceStatistics
      && Array.from(this.automationStats.values()).some(item => item.traceCount > 0);
    const stats = {
      total: this.automationStats.size,
      active: totalActive,
      disabled: this.disabledAutomations.length,
      failed: hasTraceStatistics ? this.failedAutomations.size : null,
      avgTime: this.executionTimes.length > 0
        ? Math.round(this.executionTimes.reduce((a, b) => a + b, 0) / this.executionTimes.length)
        : null
    };
    const healthScore = this._calculateHealthScore();
    const healthClass = healthScore >= 75 ? "excellent" : healthScore >= 50 ? "good" : "poor";
    const healthText = healthScore >= 75 ? this._t.excellent : healthScore >= 50 ? this._t.good : this._t.needsImprovement;

    // --- OVERVIEW TAB ---
    // --- Filter and sort the full automation list ---
    const allAutos = Array.from(this.automationStats.values());
    let filteredAutos = allAutos;

    // Text filter
    if (this._filterText) {
      const q = this._filterText.toLowerCase();
      filteredAutos = filteredAutos.filter(a => a.name.toLowerCase().includes(q) || a.id.toLowerCase().includes(q) || (a.primaryTrigger && a.primaryTrigger.toLowerCase().includes(q)));
    }

    // Time range filter
    if (this._timeRange !== "all") {
      const days = parseInt(this._timeRange, 10);
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      filteredAutos = filteredAutos.filter(a => a.lastTriggered && a.lastTriggered.getTime() >= cutoff);
    }

    // Sort
    const sortDir = this._sortDir === "asc" ? 1 : -1;
    filteredAutos.sort((a, b) => {
      switch (this._sortBy) {
        case "name": return sortDir * a.name.localeCompare(b.name, "pl");
        case "lastTriggered": {
          const at = a.lastTriggered ? a.lastTriggered.getTime() : 0;
          const bt = b.lastTriggered ? b.lastTriggered.getTime() : 0;
          return sortDir * (at - bt);
        }
        case "todayCount": return sortDir * ((a.todayCount || 0) - (b.todayCount || 0));
        case "avgTime": {
          const at = typeof a.avgExecutionTime === "number" ? a.avgExecutionTime : 99999;
          const bt = typeof b.avgExecutionTime === "number" ? b.avgExecutionTime : 99999;
          return sortDir * (at - bt);
        }
        case "state": return sortDir * a.state.localeCompare(b.state);
        default: return 0;
      }
    });

    let activeTabContent = '';

    // Only build content for the active tab
    if (this.currentTab === 'overview') {
      const filteredListHtml = filteredAutos.length > 0
        ? filteredAutos.map(a => {
            const stateClass = a.isFailed ? "error" : a.state === "on" ? "on" : "off";
            const timeStr = this._formatTimeSince(a.lastTriggered);
            const execStr = typeof a.avgExecutionTime === "number" ? `${a.avgExecutionTime}ms` : "";
            const countStr = a.todayCount > 0 ? `${a.todayCount}\u00d7` : "";
            return `<div class="auto-item-full" data-automation-id="${_esc(a.automationId)}">
              <span class="auto-state-dot ${stateClass}"></span>
              <span class="auto-name" title="${_esc(a.name)}">${_esc(a.name)}</span>
              ${countStr ? `<span class="auto-detail" title="${this._t.todayCount}">${countStr}</span>` : ""}
              ${execStr ? `<span class="auto-detail" title="${this._t.averageTime}">${execStr}</span>` : ""}
              <span class="auto-detail">${timeStr}</span>
            </div>`;
          }).join("")
        : `<div class="empty-state">${this._t.noAutomationsMatching}</div>`;

      activeTabContent = `
        <div class="health-row">
            <div class="health-circle ${healthClass}">${healthScore}</div>
          <div>
            <div class="card-title">${this._t.systemHealth}</div>
            <div class="health-label">${healthText}</div>
            <div class="health-label">${this._t.systemHealthScope}</div>
          </div>
        </div>
        <div class="stats">
          <div class="stat">
            <div class="stat-value">${stats.total}</div>
            <div class="stat-label">${this._t.totalLabel}</div>
          </div>
          <div class="stat">
            <div class="stat-value">${stats.active}</div>
            <div class="stat-label">${this._t.active}</div>
          </div>
          <div class="stat">
            <div class="stat-value">${stats.disabled}</div>
            <div class="stat-label">${this._t.disabledLabel}</div>
          </div>
          <div class="stat">
            <div class="stat-value" id="aa-trace-errors-value">${stats.failed === null ? '\u2014' : stats.failed}</div>
            <div class="stat-label">${this._t.errorsLabel}</div>
          </div>
        </div>
        <div class="card" style="margin-top:var(--aa-space-4)">
          <h2 class="card-title">${this._t.automations}</h2>
          <div class="filter-bar">
            <input type="text" id="aa-filter-input" placeholder="${this._t.searchPlaceholder}" value="${_esc(this._filterText)}">
            <select id="aa-sort-select">
              <option value="lastTriggered" ${this._sortBy === "lastTriggered" ? "selected" : ""}>${this._t.lastTriggered}</option>
              <option value="name" ${this._sortBy === "name" ? "selected" : ""}>${this._t.name}</option>
              <option value="todayCount" ${this._sortBy === "todayCount" ? "selected" : ""}>${this._t.runsTodayOption}</option>
              <option value="avgTime" ${this._sortBy === "avgTime" ? "selected" : ""}>${this._t.executionTime}</option>
              <option value="state" ${this._sortBy === "state" ? "selected" : ""}>${this._t.state}</option>
            </select>
            <button class="sort-dir-btn" id="aa-sort-dir" title="${this._sortDir === "desc" ? this._t.descending : this._t.ascending}">${this._sortDir === "desc" ? "\u2193" : "\u2191"}</button>
            <select id="aa-time-range">
              <option value="all" ${this._timeRange === "all" ? "selected" : ""}>${this._t.allTime}</option>
              <option value="1" ${this._timeRange === "1" ? "selected" : ""}>${this._t.today}</option>
              <option value="7" ${this._timeRange === "7" ? "selected" : ""}>${this._t.sevenDays}</option>
              <option value="14" ${this._timeRange === "14" ? "selected" : ""}>${this._t.fourteenDays}</option>
              <option value="30" ${this._timeRange === "30" ? "selected" : ""}>${this._t.thirtyDays}</option>
            </select>
          </div>
          <div class="filter-results-count">${filteredAutos.length} ${this._lang === 'pl' ? 'z' : 'of'} ${allAutos.length} ${this._t.automations}</div>
          <div class="auto-list-full">${filteredListHtml}</div>
        </div>
        <div class="card ${hasRetainedRunData ? '' : 'chart-empty-card'}">
          <h2 class="card-title">${this._t.mostActiveTodayTitle}</h2>
          ${hasRetainedRunData
            ? '<div class="canvas-wrap"><canvas id="top-automations-chart"></canvas></div>'
            : `<div class="chart-empty">${this._t.noRetainedActivityData}</div>`}
        </div>
      `;
    } else if (this.currentTab === 'performance') {
      const hasExecData = this.executionTimes.length > 0;
      const hasTriggerData = this.triggerTypes.size > 0;

      activeTabContent = `
        ${this._renderTraceStatsControl()}
        <div class="card ${hasExecData ? '' : 'chart-empty-card'}">
          <h2 class="card-title">${this._t.executionTimeDistribution}</h2>
          ${hasExecData
            ? '<div class="canvas-wrap"><canvas id="exec-dist-chart"></canvas></div>'
            : `<div class="chart-empty">${this._t.noExecutionTimeData}</div>`}
        </div>
        <div class="card ${hasTriggerData ? '' : 'chart-empty-card'}">
          <h2 class="card-title">${this._t.triggerTypesTitle}</h2>
          ${hasTriggerData
            ? '<div class="canvas-wrap"><canvas id="trigger-type-chart"></canvas></div>'
            : `<div class="chart-empty">${this._t.noTriggerData}</div>`}
        </div>
        <div class="card ${hasRetainedRunData ? '' : 'chart-empty-card'}">
          <h2 class="card-title">${this._t.dailyExecutions}</h2>
          ${hasRetainedRunData
            ? '<div class="canvas-wrap"><canvas id="sparkline-chart"></canvas></div>'
            : `<div class="chart-empty">${this._t.noDailyTraceData}</div>`}
        </div>
        <div class="card">
          <h2 class="card-title">${this._t.statistics}</h2>
          <div class="stats">
            <div class="stat">
              <div class="stat-value">${stats.avgTime === null ? '\u2014' : `${stats.avgTime}ms`}</div>
              <div class="stat-label">${this._t.avgTimeLabel}</div>
            </div>
            <div class="stat">
              <div class="stat-value">${this.executionTimes.length}</div>
              <div class="stat-label">${this._t.withTimeData}</div>
            </div>
            <div class="stat">
              <div class="stat-value">${this.triggerTypes.size}</div>
              <div class="stat-label">${this._t.triggerTypes}</div>
            </div>
          </div>
        </div>
      `;
    } else if (this.currentTab === 'optimization') {
      const optData = this.getOptimizationData();

      // Paginate each list
      const slowPaginated = this._paginateItems(optData.slow, 'opt-slow');
      const failedPaginated = this._paginateItems(optData.failed, 'opt-failed');
      const disabledPaginated = this._paginateItems(optData.disabled, 'opt-disabled');
      const stalePaginated = this._paginateItems(optData.stale, 'opt-stale');

      const slowItems = slowPaginated.length > 0
        ? slowPaginated.map(a => `
            <div class="auto-item" data-automation-id="${_esc(a.automationId)}">
              <span class="auto-name" title="${_esc(a.name)}">${_esc(a.name)}</span>
              <span class="badge badge-warn">${Math.round(a.avgExecutionTime)}ms</span>
              <span class="auto-arrow">\u203A</span>
            </div>`).join("")
        : `<div class="empty-state">${hasTraceStatistics ? this._t.noSlowAutomations : this._t.noTraceOptimizationData}</div>`;

      const failedItems = failedPaginated.length > 0
        ? failedPaginated.map(a => `
            <div class="auto-item" data-automation-id="${_esc(a.automationId)}">
              <span class="auto-name" title="${_esc(a.name)}">${_esc(a.name)}</span>
              <span class="badge badge-error">${_esc(a.reason || this._t.errorBadge)}</span>
              <span class="auto-arrow">\u203A</span>
            </div>`).join("")
        : `<div class="empty-state">${hasTraceStatistics ? this._t.noFailedLabel : this._t.noTraceOptimizationData}</div>`;

      const disabledItems = disabledPaginated.length > 0
        ? disabledPaginated.map(a => `
            <div class="auto-item" data-automation-id="${_esc(a.automationId)}">
              <span class="auto-name" title="${_esc(a.name)}">${_esc(a.name)}</span>
              <span class="badge badge-info">${this._t.disabledBadge}</span>
              <button class="toggle-btn" data-entity-id="${_esc(a.id)}" data-action="enable">${this._t.enableButton}</button>
              <span class="auto-arrow">\u203A</span>
            </div>`).join("")
        : `<div class="empty-state">${this._t.noDisabledLabel}</div>`;

      const staleItems = stalePaginated.length > 0
        ? stalePaginated.map(a => `
            <div class="auto-item" data-automation-id="${_esc(a.automationId)}">
              <span class="auto-name" title="${_esc(a.name)}">${_esc(a.name)}</span>
              <span class="badge badge-stale">${this._formatTimeSince(a.lastTriggered)}</span>
              <span class="auto-arrow">\u203A</span>
            </div>`).join("")
        : `<div class="empty-state">${this._t.noStaleLabel}</div>`;

      activeTabContent = `
        ${this._renderTraceStatsControl()}
        <div class="opt-summary">
          <div class="opt-stat warn">
            <div class="opt-stat-value">${hasTraceStatistics ? optData.slow.length : '\u2014'}</div>
            <div class="opt-stat-label">${this._t.slowStat}</div>
          </div>
          <div class="opt-stat error">
            <div class="opt-stat-value">${hasTraceStatistics ? optData.failed.length : '\u2014'}</div>
            <div class="opt-stat-label">${this._t.withErrorsStat}</div>
          </div>
          <div class="opt-stat info">
            <div class="opt-stat-value">${optData.disabled.length}</div>
            <div class="opt-stat-label">${this._t.disabledStat}</div>
          </div>
          <div class="opt-stat stale">
            <div class="opt-stat-value">${optData.stale.length}</div>
            <div class="opt-stat-label">${this._t.inactiveStat}</div>
          </div>
        </div>
        <div class="opt-section">
          <h2 class="card-title">${this._t.slowAutomationsTitle}</h2>
          <div class="auto-list">${slowItems}</div>
          ${optData.slow.length > 0 ? this._renderPagination('opt-slow', optData.slow.length) : ''}
        </div>
        <div class="opt-section">
          <h2 class="card-title">${this._t.failedAutomationsTitle}</h2>
          <div class="auto-list">${failedItems}</div>
          ${optData.failed.length > 0 ? this._renderPagination('opt-failed', optData.failed.length) : ''}
        </div>
        <div class="opt-section">
          <h2 class="card-title">${this._t.disabledAutomationsTitle}</h2>
          <div class="auto-list">${disabledItems}</div>
          ${optData.disabled.length > 0 ? this._renderPagination('opt-disabled', optData.disabled.length) : ''}
        </div>
        <div class="opt-section">
          <h2 class="card-title">${this._t.inactiveAutomationsTitle}</h2>
          <div class="auto-list">${staleItems}</div>
          ${optData.stale.length > 0 ? this._renderPagination('opt-stale', optData.stale.length) : ''}
        </div>
      `;
    } else if (this.currentTab === 'timeline') {
      // Build sorted automation list for the selector
      const allAutos = (this._suppressTimelineAutoFetch ? [] : Array.from(this.automationStats.values()))
        .sort((a, b) => {
          const at = a.lastTriggered ? a.lastTriggered.getTime() : 0;
          const bt = b.lastTriggered ? b.lastTriggered.getTime() : 0;
          return bt - at;
        });

      const selectorOptions = allAutos.map(a => {
        const timeStr = a.lastTriggered ? this._formatTimeSince(a.lastTriggered) : this._t.never;
        const label = `${a.name} (${timeStr})`;
        const sel = this._selectedTimelineId === a.id ? 'selected' : '';
        return `<option value="${_esc(a.id)}" ${sel}>${_esc(label)}</option>`;
      }).join('');

      // Default auto-select: use last triggered if no selection yet
      if (!this._selectedTimelineId && allAutos.length > 0) {
        const recent = allAutos.find(a => a.lastTriggered && a.state === 'on') || allAutos[0];
        if (recent) this._selectedTimelineId = recent.id;
      }

      const formatRunLabel = (run, index) => {
        const date = new Date(run.started_at);
        const dateLabel = Number.isFinite(date.getTime())
          ? date.toLocaleString(this._lang === 'pl' ? 'pl-PL' : 'en-US')
          : `${this._t.timelineRun} ${index + 1}`;
        const duration = run.run_duration_ms === null ? (this._lang === 'pl' ? 'w toku' : 'running') : `${run.run_duration_ms}ms`;
        return `${dateLabel} · ${duration}`;
      };
      const timelinePage = _aaPaginateTraceRuns(this._timelineRuns, {
        cursor: this._timelinePageCursor,
        limit: this._timelinePageSize
      });
      const timelinePageRuns = timelinePage.status === 'available' ? timelinePage.data.items : [];
      const currentPageOffset = this._timelinePageCursor
        ? Number(this._timelinePageCursor.slice('aatc1.'.length)) : 0;
      const previousPageCursor = currentPageOffset > 0
        ? (Math.max(0, currentPageOffset - this._timelinePageSize) === 0
          ? null : `aatc1.${Math.max(0, currentPageOffset - this._timelinePageSize)}`)
        : null;
      const runOptions = timelinePageRuns.map((run, index) => `
        <option value="${_esc(run.run_id)}" ${run.run_id === this._timelineSelectedRunId ? 'selected' : ''}>
          ${_esc(formatRunLabel(run, currentPageOffset + index))}
        </option>`).join('');
      const baselineOptions = timelinePageRuns
        .filter(run => run.run_id !== this._timelineSelectedRunId)
        .map((run, index) => `
          <option value="${_esc(run.run_id)}" ${run.run_id === this._timelineBaselineRunId ? 'selected' : ''}>
            ${_esc(formatRunLabel(run, index))}
          </option>`).join('');
      const hasCurrentTrace = this._timelineData?.capability?.status === 'available';
      const compareDisabled = !hasCurrentTrace || !this._timelineBaselineRunId
        || this._timelineBaselineRunId === this._timelineSelectedRunId || this._timelineCompareLoading;
      const runControls = this._timelineRuns.length ? `
        <div class="tl-select-bar" aria-label="${_esc(this._t.timelineRun)}">
          <div class="tl-control-group">
            <label for="tl-run-select">${_esc(this._t.timelineRun)}</label>
            <select id="tl-run-select">${runOptions}</select>
          </div>
          <div class="tl-control-group">
            <label for="tl-baseline-select">${_esc(this._t.timelineBaseline)}</label>
            <select id="tl-baseline-select">
              <option value="">— ${_esc(this._t.timelineBaseline)} —</option>
              ${baselineOptions}
            </select>
          </div>
          <button id="tl-compare-btn" class="trace-action-btn secondary" type="button" ${compareDisabled ? 'disabled' : ''}>
            ${_esc(this._timelineCompareLoading ? this._t.timelineComparing : this._t.timelineCompare)}
          </button>
          <button id="tl-export-btn" class="trace-action-btn" type="button" ${hasCurrentTrace ? '' : 'disabled'}>
            ${_esc(this._t.timelineExport)}
          </button>
          <button id="tl-runs-prev" class="trace-action-btn secondary" type="button"
            data-cursor="${_esc(previousPageCursor || '')}" ${currentPageOffset === 0 ? 'disabled' : ''}>
            ${this._lang === 'pl' ? 'Nowsze' : 'Newer'}
          </button>
          <button id="tl-runs-next" class="trace-action-btn secondary" type="button"
            data-cursor="${_esc(timelinePage.data?.next_cursor || '')}" ${timelinePage.data?.next_cursor ? '' : 'disabled'}>
            ${this._lang === 'pl' ? 'Starsze' : 'Older'}
          </button>
        </div>` : '';

      let timelineBody = '';
      if (this._timelineLoading) {
        timelineBody = `<div class="loading-state"><div class="loading-spinner" style="margin:0 auto 10px;width:22px;height:22px;border-width:3px;border-color:rgba(0,0,0,.1);border-top-color:var(--bento-primary)"></div><div>${this._t.timelineLoading}</div></div>`;
      } else if (this._timelineError) {
        timelineBody = `<div class="tl-inline-err">${_esc(this._timelineMessage(this._timelineError))}</div>`;
      } else if (!this._selectedTimelineId) {
        timelineBody = `<div class="empty-state">${this._t.timelineSelectPrompt}</div>`;
      } else if (this._timelineData?.empty) {
        const lastTriggered = this._timelineData.stats?.lastTriggered;
        timelineBody = `<div class="empty-state" style="text-align:left;padding:20px">
          ${lastTriggered ? `<div style="margin-bottom:8px;font-size:13px;color:var(--bento-text)">${_esc(this._t.timelineLastTriggered)}: ${_esc(this._formatTimeSince(lastTriggered))}</div>` : ''}
          <div>${_esc(this._t.timelineNoTrace)}</div>
        </div><div class="tl-tip">${_esc(this._t.timelineTracingTip)}</div>`;
      } else if (hasCurrentTrace) {
        const trace = this._timelineData.trace;
        const summary = this._timelineData.summary;
        const startDate = summary?.started_at ? new Date(summary.started_at) : null;
        const totalDuration = trace.run_duration_ms;
        const isError = trace.nodes.some(node => node.status === 'error');
        const statusBadge = isError
          ? `<span class="tl-meta-badge err">${this._t.timelineFail}</span>`
          : `<span class="tl-meta-badge ok">${this._t.timelinePass}</span>`;
        const stepsHtml = this._renderTimelineSteps(trace);
        timelineBody = `${this._renderTimelineComparison()}
          <div class="tl-meta-row">
            ${statusBadge}
            ${startDate && Number.isFinite(startDate.getTime()) ? `<span>${_esc(startDate.toLocaleString(this._lang === 'pl' ? 'pl-PL' : 'en-US'))}</span>` : ''}
            ${totalDuration !== null ? `<span>${totalDuration}ms total</span>` : `<span>${this._lang === 'pl' ? 'w toku' : 'running'}</span>`}
          </div>
          ${stepsHtml ? `<div class="tl-list">${stepsHtml}</div>` : `<div class="empty-state">${this._t.timelineNoTrace}</div>`}`;
      } else {
        timelineBody = `<div class="empty-state">${this._t.timelineSelectPrompt}</div>`;
      }

      activeTabContent = `
        <h2 class="card-title" style="margin-bottom:var(--aa-space-4)">${this._t.timelineTitle}</h2>
        <div class="tl-select-bar">
          <select id="tl-auto-select">
            <option value="">— ${this._t.timelineSelectPrompt} —</option>
            ${selectorOptions}
          </select>
        </div>
        ${runControls}
        <div class="card" style="padding:var(--aa-space-4)">${timelineBody}</div>
      `;
    }

    const loadingContent = `
      <div class="loading-state">
        <div class="loading-spinner"></div>
        <div>${this._t.loadingData}</div>
      </div>
    `;

    const loadingToast = this._loadingPhase ? `
        <div class="loading-toast">
          <span class="loading-spinner"></span>
          <span>${this._loadingPhase}</span>
        </div>
      ` : "";

    // Show content even during loading (progressive rendering), with toast on top
    const hasData = this.automationStats.size > 0;
    const mainContent = (!hasData && this._isLoading)
      ? loadingContent
      : `
        ${loadingToast}
        <div class="tab-content active">${activeTabContent}</div>
      `;

    this.shadowRoot.innerHTML = `
      <style>${HA_AUTOMATION_ANALYZER_BENTO_CSS}
/* === HA Tools split — premium banners (donate / intro / prereq) === */

/* Donation footer — diamond top */
.donate-section {  margin: 24px 0 4px; padding: 20px 24px; position: relative; overflow: hidden;  background: linear-gradient(135deg, rgba(99,102,241,0.06), rgba(236,72,153,0.06));  border: 1px solid rgba(99,102,241,0.18); border-radius: var(--bento-radius-md, 18px);  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 18px;  font-family: 'Inter', -apple-system, sans-serif;}
.donate-section::before {  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;  background: linear-gradient(90deg, #6366f1, #8b5cf6, #ec4899);}
.donate-section .donate-text { flex: 1; min-width: 240px; }
.donate-section h3 {  margin: 0 0 6px; font-size: 16px; font-weight: 700; letter-spacing: -0.02em;  background: linear-gradient(135deg, #6366f1, #ec4899);  -webkit-background-clip: text; background-clip: text; color: transparent;}
.donate-section p { margin: 0; font-size: 13px; line-height: 1.55; color: var(--bento-text-secondary, #57534e); letter-spacing: -0.005em; }
.donate-buttons { display: flex; gap: 10px; flex-wrap: wrap; }
.donate-btn {  display: inline-flex; align-items: center; gap: 6px; padding: 10px 18px;  border-radius: 12px; font-weight: 700; font-size: 13px; letter-spacing: -0.005em;  text-decoration: none; transition: transform 0.2s cubic-bezier(0.4,0,0.2,1), box-shadow 0.2s, filter 0.2s;  border: 1px solid transparent;}
.donate-btn:hover { transform: translateY(-2px); filter: brightness(1.05); }
.donate-btn.coffee {  background: linear-gradient(135deg, #FFDD00, #FFC700); color: #000;  box-shadow: 0 4px 14px -2px rgba(255, 221, 0, 0.4);}
.donate-btn.coffee:hover { box-shadow: 0 8px 24px -4px rgba(255, 221, 0, 0.55); }
.donate-btn.paypal {  background: linear-gradient(135deg, #0070ba, #005ea6); color: #fff;  box-shadow: 0 4px 14px -2px rgba(0, 112, 186, 0.45);}
.donate-btn.paypal:hover { box-shadow: 0 8px 24px -4px rgba(0, 112, 186, 0.6); }
:host(.bento-dark) .donate-section { background: linear-gradient(135deg, rgba(129,140,248,0.10), rgba(244,114,182,0.10)); border-color: rgba(129,140,248,0.25); }
:host(.bento-dark) .donate-section h3 { background: linear-gradient(135deg, #a5b4fc, #f9a8d4); -webkit-background-clip: text; background-clip: text; color: transparent; }
:host(.bento-dark) .donate-section p { color: #d6d3d1; }
@media (max-width: 600px) {  .donate-section { flex-direction: column; text-align: center; padding: 18px; }  .donate-buttons { justify-content: center; width: 100%; } }

/* Prereq banner — premium */
.prereq-banner {  display: flex; align-items: flex-start; gap: 14px; padding: 16px 20px;  border-radius: var(--bento-radius-sm, 12px); margin: 0 0 16px;  font-size: 13px; line-height: 1.55; border: 1px solid;  font-family: 'Inter', sans-serif; letter-spacing: -0.005em;  position: relative; overflow: hidden;}
.prereq-banner::before {  content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px;}
.prereq-banner.prereq-error { background: rgba(239,68,68,0.06); border-color: rgba(239,68,68,0.25); color: #991b1b; }
.prereq-banner.prereq-error::before { background: linear-gradient(180deg, #ef4444, #f87171); }
.prereq-banner.prereq-info  { background: rgba(99,102,241,0.06); border-color: rgba(99,102,241,0.25); color: #4338ca; }
.prereq-banner.prereq-info::before  { background: linear-gradient(180deg, #6366f1, #8b5cf6); }
.prereq-banner .prereq-icon { font-size: 22px; line-height: 1; padding-top: 2px; flex-shrink: 0; }
.prereq-banner .prereq-text { flex: 1; min-width: 0; }
.prereq-banner .prereq-text strong { font-weight: 700; letter-spacing: -0.01em; }
.prereq-banner code {  background: rgba(0,0,0,0.06); padding: 1px 7px; border-radius: 5px;  font-size: 12px; font-family: 'JetBrains Mono', ui-monospace, monospace;  border: 1px solid rgba(0,0,0,0.08);}
.prereq-banner .prereq-cta {  display: inline-flex; align-items: center; padding: 8px 16px; border-radius: 10px;  background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #fff !important;  text-decoration: none; font-weight: 700; font-size: 12.5px; flex-shrink: 0;  letter-spacing: -0.005em;  box-shadow: 0 4px 14px -2px rgba(99,102,241,0.45);  transition: all 0.2s cubic-bezier(0.4,0,0.2,1);}
.prereq-banner .prereq-cta:hover { transform: translateY(-1px); box-shadow: 0 8px 24px -4px rgba(99,102,241,0.6); }
:host(.bento-dark) .prereq-banner.prereq-error { background: rgba(248,113,113,0.10); border-color: rgba(248,113,113,0.30); color: #fca5a5; }
:host(.bento-dark) .prereq-banner.prereq-info { background: rgba(129,140,248,0.10); border-color: rgba(129,140,248,0.30); color: #c7d2fe; }
:host(.bento-dark) .prereq-banner code { background: rgba(255,255,255,0.06); border-color: rgba(255,255,255,0.10); }
@media (max-width: 600px) {  .prereq-banner { flex-direction: column; align-items: stretch; padding-left: 20px; }  .prereq-banner .prereq-cta { align-self: flex-start; } }

/* First-run intro banner — premium */
.intro-banner {  position: relative; padding: 18px 52px 18px 22px; margin: 0 0 18px;  background: linear-gradient(135deg, rgba(99,102,241,0.08), rgba(236,72,153,0.06));  border: 1px solid rgba(99,102,241,0.20);  border-radius: var(--bento-radius-sm, 12px);  font-size: 13px; line-height: 1.55; overflow: hidden;  font-family: 'Inter', sans-serif; letter-spacing: -0.005em;  animation: bentoSlideIn 0.4s cubic-bezier(0.4, 0, 0.2, 1);}
.intro-banner::before {  content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;  background: linear-gradient(90deg, #6366f1, #8b5cf6, #ec4899);}
.intro-banner .intro-headline {  font-weight: 700; font-size: 14.5px; margin-bottom: 10px; letter-spacing: -0.02em;  background: linear-gradient(135deg, #6366f1, #ec4899);  -webkit-background-clip: text; background-clip: text; color: transparent;  display: flex; align-items: center; gap: 8px;}
.intro-banner .intro-steps {  margin: 8px 0 0; padding: 0; list-style: none; counter-reset: introstep;}
.intro-banner .intro-steps li {  margin-bottom: 8px; line-height: 1.55; color: var(--bento-text, #0c0a09);  padding-left: 32px; position: relative; counter-increment: introstep;  font-size: 12.5px;}
.intro-banner .intro-steps li::before {  content: counter(introstep); position: absolute; left: 0; top: -1px;  width: 22px; height: 22px; border-radius: 50%;  background: var(--bento-card, #fff); border: 1px solid rgba(99,102,241,0.25);  display: flex; align-items: center; justify-content: center;  font-size: 11px; font-weight: 800; color: #6366f1;  font-family: 'JetBrains Mono', ui-monospace, monospace;  font-feature-settings: 'tnum' 1;}
.intro-banner .intro-dismiss {  position: absolute; top: 12px; right: 14px;  background: var(--bento-card, transparent); border: 1px solid var(--bento-border, transparent);  cursor: pointer; font-size: 14px; line-height: 1;  color: var(--bento-text-secondary, #64748B);  padding: 4px 8px; border-radius: 999px;  transition: all 0.15s ease;}
.intro-banner .intro-dismiss:hover {  background: var(--bento-bg-2, #e7e5e4); color: var(--bento-text, #0c0a09);  transform: rotate(90deg);}
:host(.bento-dark) .intro-banner { background: linear-gradient(135deg, rgba(129,140,248,0.14), rgba(244,114,182,0.10)); border-color: rgba(129,140,248,0.30); }
:host(.bento-dark) .intro-banner .intro-headline { background: linear-gradient(135deg, #a5b4fc, #f9a8d4); -webkit-background-clip: text; background-clip: text; color: transparent; }
:host(.bento-dark) .intro-banner .intro-steps li { color: #fafaf9; }
:host(.bento-dark) .intro-banner .intro-steps li::before { background: #16161f; border-color: rgba(129,140,248,0.35); color: #a5b4fc; }
:host(.bento-dark) .intro-banner .intro-dismiss { background: #16161f; border-color: #27272f; color: #d6d3d1; }
:host(.bento-dark) .intro-banner .intro-dismiss:hover { background: #27272f; color: #fafaf9; }

${styles}
/* === DARK MODE === */
:host(.bento-dark) {
    --bento-bg: var(--primary-background-color, #1a1a2e);
    --bento-card: var(--card-background-color, #16213e);
    --bento-text: var(--primary-text-color, #e2e8f0);
    --bento-text-secondary: var(--secondary-text-color, #94a3b8);
    --bento-border: var(--divider-color, #334155);
    --bento-shadow-sm: 0 1px 3px rgba(0,0,0,0.3);
    --bento-shadow-md: 0 4px 12px rgba(0,0,0,0.4);
  }
:host(.bento-dark) {
    --aa-warn-bg: rgba(245,158,11,0.15); --aa-warn-border: rgba(245,158,11,0.3); --aa-warn-text: #fbbf24;
    --aa-error-bg: rgba(239,68,68,0.15); --aa-error-border: rgba(239,68,68,0.3); --aa-error-text: #f87171;
    --aa-info-bg: rgba(59,130,246,0.15); --aa-info-border: rgba(59,130,246,0.3); --aa-info-text: #60a5fa;
    --aa-stale-bg: rgba(139,92,246,0.15); --aa-stale-border: rgba(139,92,246,0.3); --aa-stale-text: #a78bfa;
  }
:host(.bento-dark) .badge-stale { background: rgba(139,92,246,0.15); color: #a78bfa; }

        /* === MOBILE FIX === */
        @media (max-width: 768px) {
          .tabs { flex-wrap: nowrap; overflow-x: auto; -webkit-overflow-scrolling: touch; gap: 2px; }
          .tab, .tab-btn, .tab-btn { padding: 6px 10px; font-size: 12px; white-space: nowrap; }
          .card, .card-container { padding: 14px; }
          .stats, .stats-grid, .summary-grid, .stat-cards, .kpi-grid, .metrics-grid { grid-template-columns: repeat(2, 1fr); gap: 8px; }
          .stat-val, .kpi-val, .metric-val { font-size: 18px; }
          .stat-lbl, .kpi-lbl, .metric-lbl { font-size: 10px; }
          .panels, .board { flex-direction: column; }
          .column { min-width: unset; }
          h2 { font-size: 18px; }
          h3 { font-size: 15px; }
          .canvas-wrap { height: 280px; }
          .auto-name { max-width: 180px; }
          .pagination { gap: 6px; }
          .pagination-info { min-width: 100px; font-size: 11px; }
        }
        @media (max-width: 480px) {
          .tabs { gap: 1px; }
          .tab, .tab-btn, .tab-btn { padding: 5px 8px; font-size: 11px; }
          .stats, .stats-grid, .summary-grid, .stat-cards, .kpi-grid, .metrics-grid { grid-template-columns: 1fr 1fr; }
          .stat-val, .kpi-val, .metric-val { font-size: 16px; }
          .canvas-wrap { height: 240px; }
          .auto-name { max-width: 140px; font-size: 12px; }
          .pagination { gap: 4px; padding: 8px; flex-direction: column; align-items: stretch; }
          .pagination-btn { padding: 5px 8px; font-size: 11px; }
          .pagination-info { min-width: 100%; text-align: center; font-size: 11px; }
          .page-size-select { font-size: 11px; padding: 4px 24px 4px 6px; }
        }

</style>
      ${_renderLocalIntro()}
      <div class="card">
        ${this._fetchError ? `<div style="margin-bottom:12px;padding:10px 14px;background:var(--bento-error-light,rgba(239,68,68,0.08));color:var(--bento-error,#EF4444);border:1px solid var(--bento-error-border,rgba(239,68,68,0.25));border-radius:var(--bento-radius-sm,10px);font-size:13px;font-weight:500">⚠ ${_esc(this._fetchError)}</div>` : ''}
        <div class="header">
          <div class="header-left">
            <h1>${_esc(this.config.title || '')}</h1>
            <p class="subtitle">
              <span>${this._t.lastUpdated}${this._formatLastUpdated()}</span>
              <span>\u2022</span>
              <span>${stats.total} ${this._t.automations}</span>
            </p>
          </div>
        
        </div>
        ${!this._traceNoticeDismissed ? `
        <div class="trace-notice-global" id="trace-storage-notice">
          <span class="trace-notice-icon">\u{1f4a1}</span>
          <div>
            ${this._t.tracesNotice}
            <div class="detail">${this._t.tracesNoticeDetail}</div>
          </div>
          <button class="trace-notice-dismiss" id="dismiss-trace-notice" title="${this._t.closeButton}" aria-label="${this._t.closeButton}">\u00d7</button>
        </div>
        ` : ""}
        <div class="tabs">
          <button class="tab-btn ${this.currentTab === "overview" ? "active" : ""}" data-tab="overview">${this._t.tabOverview}</button>
          <button class="tab-btn ${this.currentTab === "performance" ? "active" : ""}" data-tab="performance">${this._t.tabPerformance}</button>
          <button class="tab-btn ${this.currentTab === "optimization" ? "active" : ""}" data-tab="optimization">${this._t.tabOptimization}</button>
          <button class="tab-btn ${this.currentTab === "timeline" ? "active" : ""}" data-tab="timeline">${this._t.tabTimeline}</button>
        </div>
        ${mainContent}
      </div>
      ${_LOCAL_DONATE_HTML}
    `;

    _bindLocalIntroDismiss(this.shadowRoot);
    this._setupEventListeners();
    this._setupPaginationListeners();
    if (!this._isLoading) {
      this._drawCharts();
    }
  }

  _paginateItems(items, tabName) {
    if (!this._currentPage[tabName]) this._currentPage[tabName] = 1;
    const start = (this._currentPage[tabName] - 1) * this._pageSize;
    return items.slice(start, start + this._pageSize);
  }

  _renderPagination(tabName, totalItems) {
    if (!this._currentPage[tabName]) this._currentPage[tabName] = 1;
    const pageSize = this._pageSize;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const page = Math.min(this._currentPage[tabName], totalPages);
    this._currentPage[tabName] = page;
    return `
      <div class="pagination">
        <button class="pagination-btn" data-page-tab="${tabName}" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>&#8249; Prev</button>
        <span class="pagination-info">${page} / ${totalPages} (${totalItems})</span>
        <button class="pagination-btn" data-page-tab="${tabName}" data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>Next &#8250;</button>
        <select class="page-size-select" data-page-tab="${tabName}" data-action="page-size">
          ${[10,15,25,50].map(s => `<option value="${s}" ${s === pageSize ? 'selected' : ''}>${s}/page</option>`).join('')}
        </select>
      </div>`;
  }

  _setupPaginationListeners() {
    if (!this.shadowRoot) return;
    this.shadowRoot.querySelectorAll('.pagination-btn:not([disabled])').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = e.target.dataset.pageTab;
        const page = parseInt(e.target.dataset.page);
        if (tab && page > 0) {
          this._currentPage[tab] = page;
          this.render();
        }
      });
    });
    this.shadowRoot.querySelectorAll('.page-size-select').forEach(sel => {
      sel.addEventListener('change', (e) => {
        this._pageSize = parseInt(e.target.value);
        // Reset all pages to 1
        Object.keys(this._currentPage).forEach(k => this._currentPage[k] = 1);
        this.render();
      });
    });
  }

  _setupEventListeners() {
    // Tab switching
    this.shadowRoot.querySelectorAll(".tab-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        this.currentTab = e.target.dataset.tab;
        history.replaceState(null, '', location.pathname + '#' + this._toolId + '/' + this.currentTab);
        this.render();
      });
    });

    // Click handlers for automation items (navigate to edit)
    this.shadowRoot.querySelectorAll(".auto-item").forEach(item => {
      item.addEventListener("click", (e) => {
        // Don't navigate if clicking the toggle button
        if (e.target.classList.contains("toggle-btn")) return;
        const automationId = item.dataset.automationId;
        if (automationId) this._navigateToAutomation(automationId);
      });
    });

    // Trace notice: local dismiss only.
    const dismissBtn = this.shadowRoot.getElementById("dismiss-trace-notice");
    if (dismissBtn) {
      dismissBtn.addEventListener("click", () => {
        this._traceNoticeDismissed = true;
        const notice = this.shadowRoot.getElementById("trace-storage-notice");
        if (notice) notice.remove();
      });
    }
    // Filter, sort, time range controls
    const filterInput = this.shadowRoot.getElementById("aa-filter-input");
    if (filterInput) {
      filterInput.addEventListener("input", (e) => {
        this._filterText = e.target.value;
        this._rerenderContent();
      });
    }
    const sortSelect = this.shadowRoot.getElementById("aa-sort-select");
    if (sortSelect) {
      sortSelect.addEventListener("change", (e) => {
        this._sortBy = e.target.value;
        this._rerenderContent();
      });
    }
    const sortDirBtn = this.shadowRoot.getElementById("aa-sort-dir");
    if (sortDirBtn) {
      sortDirBtn.addEventListener("click", () => {
        this._sortDir = this._sortDir === "desc" ? "asc" : "desc";
        this._rerenderContent();
      });
    }
    const timeRange = this.shadowRoot.getElementById("aa-time-range");
    if (timeRange) {
      timeRange.addEventListener("change", (e) => {
        this._timeRange = e.target.value;
        this._rerenderContent();
      });
    }

    const traceStatsLoad = this.shadowRoot.getElementById('trace-stats-load');
    if (traceStatsLoad) {
      traceStatsLoad.addEventListener('click', () => this._loadTraceStatistics({
        force: this._traceStatsCapability?.status === 'available'
      }));
    }

    // Click handlers for full automation list items
    this.shadowRoot.querySelectorAll(".auto-item-full").forEach(item => {
      item.addEventListener("click", () => {
        const automationId = item.dataset.automationId;
        if (automationId) this._navigateToAutomation(automationId);
      });
    });

    // Toggle buttons for disabled automations
    this.shadowRoot.querySelectorAll(".toggle-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const entityId = btn.dataset.entityId;
        const action = btn.dataset.action;
        if (entityId) this._toggleAutomation(entityId, action === "enable");
      });
    });

    // Timeline automation selector
    const tlSelect = this.shadowRoot.getElementById("tl-auto-select");
    if (tlSelect) {
      // If we just rendered the timeline tab with a pre-selected automation but no data yet, trigger a fetch
      if (this.currentTab === 'timeline' && !this._suppressTimelineAutoFetch
        && this._selectedTimelineId && !this._timelineData && !this._timelineLoading && !this._timelineError) {
        this._fetchTimeline(this._selectedTimelineId);
      }
      tlSelect.addEventListener("change", (e) => {
        const entityId = e.target.value;
        if (!entityId) {
          this._selectedTimelineId = null;
          this._timelineData = null;
          this._timelineError = null;
          this._resetTimelineRunState();
          this.render();
          return;
        }
        if (entityId === this._selectedTimelineId && this._timelineData) return; // already loaded
        this._selectedTimelineId = entityId;
        this._timelineData = null;
        this._timelineError = null;
        this._resetTimelineRunState();
        this._fetchTimeline(entityId);
      });
    }

    const runSelect = this.shadowRoot.getElementById('tl-run-select');
    if (runSelect) {
      runSelect.addEventListener('change', event => {
        const runId = event.target.value;
        if (runId && runId !== this._timelineSelectedRunId && this._selectedTimelineId) {
          this._fetchTimelineRun(this._selectedTimelineId, runId);
        }
      });
    }
    const baselineSelect = this.shadowRoot.getElementById('tl-baseline-select');
    const compareButton = this.shadowRoot.getElementById('tl-compare-btn');
    if (baselineSelect) {
      baselineSelect.addEventListener('change', event => {
        this._timelineBaselineRunId = event.target.value || null;
        this._timelineBaselineData = null;
        this._timelineComparison = null;
        this.render();
      });
    }
    if (compareButton) compareButton.addEventListener('click', () => this._compareTimelineRuns());
    const exportButton = this.shadowRoot.getElementById('tl-export-btn');
    if (exportButton) exportButton.addEventListener('click', () => this._exportTimelineDiagnostic());
    for (const id of ['tl-runs-prev', 'tl-runs-next']) {
      const button = this.shadowRoot.getElementById(id);
      if (button && !button.disabled) {
        button.addEventListener('click', () => {
          this._timelinePageCursor = button.dataset.cursor || null;
          this._timelineBaselineRunId = null;
          this._timelineBaselineData = null;
          this._timelineComparison = null;
          this.render();
        });
      }
    }
  }

  _rerenderContent() {
    // Re-render without losing focus on filter input
    const hadFocus = this.shadowRoot.activeElement?.id === "aa-filter-input";
    const cursorPos = hadFocus ? this.shadowRoot.getElementById("aa-filter-input")?.selectionStart : null;
    this.render();
    if (hadFocus) {
      const input = this.shadowRoot.getElementById("aa-filter-input");
      if (input) {
        input.focus();
        if (cursorPos !== null) input.setSelectionRange(cursorPos, cursorPos);
      }
    }
  }

  async _drawCharts() {
    if (!this.isConnected || this._isLoading) return;
    if (this.currentTab === "optimization") return;
    try {
      await this._loadChartJS();
      if (!this.isConnected) return;
      if (this.currentTab === "overview") {
        this._drawTopAutomationsChart();
      } else if (this.currentTab === "performance") {
        if (this.executionTimes.length > 0) this._drawExecDistChart();
        if (this.triggerTypes.size > 0) this._drawTriggerTypeChart();
        this._drawSparklineChart();
      }
    } catch (_error) {
      console.error('[ha-automation-analyzer] chart_render_failed');
    }
  }

  _destroyChart(key) {
    if (this._charts[key]) {
      this._charts[key].destroy();
      delete this._charts[key];
    }
  }

  _drawTopAutomationsChart() {
    const canvas = this.shadowRoot.getElementById("top-automations-chart");
    if (!canvas || !window.Chart || this._traceStatsCapability?.status !== 'available') return;
    this._destroyChart("top-auto");

    const data = this.getTopAutomations(5);
    if (data.length === 0) return;

    const hasToday = data.some(a => a.todayCount > 0);
    const labels = data.map(a => a.name.length > 35 ? a.name.substring(0, 33) + "\u2026" : a.name);
    const values = hasToday ? data.map(a => a.todayCount) : data.map(a => a.traceCount);
    const chartLabel = hasToday
      ? (this._lang === 'pl' ? 'Zachowane dzi\u015B' : 'Retained today')
      : (this._lang === 'pl' ? 'Zachowane uruchomienia' : 'Retained runs');

    const colors = this._getComputedColors();
    this._charts["top-auto"] = new window.Chart(canvas.getContext("2d"), {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: chartLabel,
          data: values,
          backgroundColor: colors.primary,
          borderWidth: 0,
          borderRadius: 4
        }]
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(30,41,59,0.9)",
            titleColor: "#fff", bodyColor: "#fff",
            padding: 8, displayColors: false,
            callbacks: {
              title: (ctx) => data[ctx[0].dataIndex]?.name || "",
              label: (ctx) => `${chartLabel}: ${ctx.parsed.x}`
            }
          }
        },
        scales: {
          x: { display: true, beginAtZero: true, ticks: { color: colors.secondary, font: { size: 11 } }, grid: { display: false }, border: { display: false } },
          y: { display: true, ticks: { color: colors.secondary, font: { size: 12 } }, grid: { display: false }, border: { display: false } }
        }
      }
    });
  }

  _drawExecDistChart() {
    const canvas = this.shadowRoot.getElementById("exec-dist-chart");
    if (!canvas || !window.Chart) return;
    this._destroyChart("exec-dist");

    const distribution = this.getExecutionDistribution();
    const colors = this._getComputedColors();
    const barColors = ["#10B981", "#3B82F6", "#F59E0B", "#EF4444", "#991b1b"];

    this._charts["exec-dist"] = new window.Chart(canvas.getContext("2d"), {
      type: "bar",
      data: {
        labels: Object.keys(distribution),
        datasets: [{
          label: this._t.retainedRuns,
          data: Object.values(distribution),
          backgroundColor: barColors,
          borderWidth: 0,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: "rgba(30,41,59,0.9)", titleColor: "#fff", bodyColor: "#fff", padding: 8, displayColors: false }
        },
        scales: {
          y: { display: true, beginAtZero: true, ticks: { color: colors.secondary, font: { size: 11 }, stepSize: 1 }, grid: { color: "rgba(0,0,0,0.05)" }, border: { display: false } },
          x: { display: true, ticks: { color: colors.secondary, font: { size: 11 } }, grid: { display: false }, border: { display: false } }
        }
      }
    });
  }

  _drawTriggerTypeChart() {
    const canvas = this.shadowRoot.getElementById("trigger-type-chart");
    if (!canvas || !window.Chart) return;
    this._destroyChart("trigger-type");

    const data = this.getTriggerTypeData();
    if (data.length === 0) return;

    const palette = ["#3B82F6","#10B981","#F59E0B","#EF4444","#8B5CF6","#EC4899","#0EA5E9","#14B8A6","#F97316"];
    const colors = this._getComputedColors();

    this._charts["trigger-type"] = new window.Chart(canvas.getContext("2d"), {
      type: "doughnut",
      data: {
        labels: data.map(d => d.type),
        datasets: [{
          data: data.map(d => d.count),
          backgroundColor: palette.slice(0, data.length),
          borderColor: colors.cardBg,
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { color: colors.secondary, font: { size: 11 }, padding: 12, usePointStyle: true } },
          tooltip: { backgroundColor: "rgba(30,41,59,0.9)", titleColor: "#fff", bodyColor: "#fff", padding: 8, callbacks: { label: (ctx) => `${ctx.label}: ${ctx.parsed}` } }
        }
      }
    });
  }

  _drawSparklineChart() {
    const canvas = this.shadowRoot.getElementById("sparkline-chart");
    const runs = this._traceStatsCapability?.status === 'available'
      ? this._traceStatsCapability.data?.runs : null;
    if (!canvas || !window.Chart || !Array.isArray(runs)) return;
    this._destroyChart("sparkline");

    const now = new Date(Date.now());
    const dailyData = [];

    // Count only normalized execution summaries retained by Home Assistant.
    for (let i = 13; i >= 0; i--) {
      const day = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      const dayCount = runs.filter(run => {
        if (run.kind !== 'execution') return false;
        const timestamp = _aaParseTimestamp(run.started_at);
        return timestamp !== null && timestamp >= dayStart.getTime() && timestamp < dayEnd.getTime();
      }).length;
      dailyData.push(dayCount);
    }

    const labels = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(now.getTime() - (13 - i) * 24 * 60 * 60 * 1000);
      return `${d.getDate()}.${d.getMonth() + 1}`;
    });

    const colors = this._getComputedColors();
    this._charts["sparkline"] = new window.Chart(canvas.getContext("2d"), {
      type: "line",
      data: {
        labels,
        datasets: [{
          label: this._lang === 'pl' ? 'Dzienne wykonania' : 'Daily executions',
          data: dailyData,
          borderColor: colors.primary,
          backgroundColor: colors.primary + "18",
          borderWidth: 2,
          fill: true,
          tension: 0.35,
          pointRadius: 3,
          pointBackgroundColor: colors.primary,
          pointBorderColor: colors.cardBg,
          pointBorderWidth: 2,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: "rgba(30,41,59,0.9)", titleColor: "#fff", bodyColor: "#fff", padding: 8, displayColors: false }
        },
        scales: {
          y: { display: true, beginAtZero: true, ticks: { color: colors.secondary, font: { size: 11 }, stepSize: 1 }, grid: { color: "rgba(0,0,0,0.04)" }, border: { display: false } },
          x: { display: true, ticks: { color: colors.secondary, font: { size: 10 } }, grid: { display: false }, border: { display: false } }
        }
      }
    });
  }

  static getConfigElement() {
    return document.createElement("ha-automation-analyzer-editor");
  }

  getCardSize() {
    return 8;
  }

  getGridOptions() {
    return { columns: 12, min_columns: 6 };
  }

  static getStubConfig() {
    return {
      type: "custom:ha-automation-analyzer",
      title: "Automation Analyzer",
      show_disabled: true,
      auto_refresh: true
    };
  }

  disconnectedCallback() {
    this._lifecycleEpoch += 1;
    this._invalidateTraceStatistics();
    this._activeLoadToken = null;
    this._abortTimelinePipeline();
    this._pendingLoad = false;
    this._suppressTimelineAutoFetch = false;
    this._loadingInProgress = false;
    this._firstHassRender = false;
    this._lastRenderTime = 0;
    this._timelineLoading = false;
    this._timelineData = null;
    this._timelineError = null;
    this._selectedTimelineId = null;
    this._resetTimelineRunState();
    this._lastHassConnection = null;
    this._lastTraceRole = 'unknown';
    this._lastAutomationSetSignature = '';
    if (this._renderTimer) clearTimeout(this._renderTimer);
    if (this._refreshTimer) clearTimeout(this._refreshTimer);
    this._renderTimer = null;
    this._refreshTimer = null;
    this._renderScheduled = false;
    // Clear all Map objects to prevent memory leaks
    this.automationStats.clear();
    this.triggerTypes.clear();
    this.failedAutomations.clear();
    this._bulkTraces = null;
    // Destroy Chart.js instances
    Object.values(this._charts).forEach(chart => {
      if (chart && typeof chart.destroy === 'function') chart.destroy();
    });
    this._charts = {};
  }

  setActiveTab(tabId) {
    this.currentTab = tabId;
    this.render();
  }
}

Object.defineProperty(HAAutomationAnalyzer, 'traceContract', {
  value: AA_TRACE_CONTRACT,
  enumerable: true,
  configurable: false,
  writable: false
});

if (!customElements.get('ha-automation-analyzer')) customElements.define("ha-automation-analyzer", HAAutomationAnalyzer);

class HaAutomationAnalyzerEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
  }
  setConfig(config) {
    const safeConfig = config && typeof config === 'object' ? config : {};
    this._config = {
      title: typeof safeConfig.title === 'string' ? safeConfig.title : 'Automation Analyzer',
      show_disabled: typeof safeConfig.show_disabled === 'boolean' ? safeConfig.show_disabled : true,
      auto_refresh: typeof safeConfig.auto_refresh === 'boolean' ? safeConfig.auto_refresh : true
    };
    this._render();
  }
  _dispatch() {
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: this._config }, bubbles: true, composed: true }));
  }
  _render() {
    this.shadowRoot.innerHTML = `
      <style>
            :host { display:block; padding:16px; }
            h3 { margin:0 0 16px; font-size:15px; font-weight:600; color:var(--bento-text, var(--primary-text-color,#1e293b)); }
            input { outline:none; transition:border-color .2s; }
            input:focus { border-color:var(--bento-primary, var(--primary-color,#3b82f6)); }
        </style>
      <h3>Automation Analyzer</h3>
            <div style="margin-bottom:12px;">
              <label style="display:block;font-weight:500;margin-bottom:4px;font-size:13px;">Title</label>
              <input type="text" id="cf_title" value="${_esc(this._config?.title || 'Automation Analyzer')}"
                style="width:100%;padding:8px 12px;border:1px solid var(--divider-color,#e2e8f0);border-radius:8px;background:var(--card-background-color,#fff);color:var(--primary-text-color,#1e293b);font-size:14px;box-sizing:border-box;">
            </div>
            <label style="display:flex;align-items:flex-start;gap:8px;font-size:13px;line-height:1.4;">
              <input type="checkbox" id="cf_auto_refresh" ${this._config?.auto_refresh === false ? '' : 'checked'}>
              <span>Automatically refresh this card when Home Assistant state changes</span>
            </label>
            <label style="display:flex;align-items:flex-start;gap:8px;font-size:13px;line-height:1.4;margin-top:10px;">
              <input type="checkbox" id="cf_show_disabled" ${this._config?.show_disabled === false ? '' : 'checked'}>
              <span>Include disabled automations in the analysis</span>
            </label>
    `;
        const f_title = this.shadowRoot.querySelector('#cf_title');
        if (f_title) f_title.addEventListener('input', (e) => {
          this._config = { ...this._config, title: e.target.value };
          this._dispatch();
        });
        const f_autoRefresh = this.shadowRoot.querySelector('#cf_auto_refresh');
        if (f_autoRefresh) f_autoRefresh.addEventListener('change', (e) => {
          this._config = { ...this._config, auto_refresh: e.target.checked === true };
          this._dispatch();
        });
        const f_showDisabled = this.shadowRoot.querySelector('#cf_show_disabled');
        if (f_showDisabled) f_showDisabled.addEventListener('change', (e) => {
          this._config = { ...this._config, show_disabled: e.target.checked === true };
          this._dispatch();
        });
  }
  connectedCallback() { this._render(); }
}
if (!customElements.get('ha-automation-analyzer-editor')) { customElements.define('ha-automation-analyzer-editor', HaAutomationAnalyzerEditor); }

})();

window.customCards = window.customCards || [];
window.customCards.push({ type: 'ha-automation-analyzer', name: 'Automation Analyzer', description: 'Analyze automation performance, find issues and optimize', preview: false });
