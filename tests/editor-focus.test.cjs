const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

// Exercise both distributed copies through their registered, connected editor.
for (const source of [
  'ha-automation-analyzer.js',
  'custom_components/ha_automation_analyzer/www/ha-automation-analyzer.js',
]) {
  function fixture(config = {
    type: 'custom:ha-automation-analyzer', title: 'Before', show_support: false,
    future_setting: { enabled: true, names: ['retained'] },
  }) {
    const dom = new JSDOM('<!doctype html><body><button id="outside">Outside</button></body>', {
      runScripts: 'dangerously', url: 'http://qa.invalid/',
      pretendToBeVisual: true, virtualConsole: new VirtualConsole(),
    });
    dom.window.eval(readFileSync(path.join(__dirname, '..', source), 'utf8'));
    const editor = dom.window.document.createElement('ha-automation-analyzer-editor');
    editor.setConfig(config);
    dom.window.document.body.append(editor);
    const root = editor.shadowRoot;
    return { dom, editor, root, title: root.querySelector('#cf_title'), config };
  }

  test(`${source}: language updates labels without replacing the active input or changing config`, () => {
    const f = fixture();
    try {
      let events = 0;
      f.editor.addEventListener('config-changed', () => events++);
      f.title.focus(); f.title.setSelectionRange(1, 4, 'backward');
      f.editor.hass = { language: 'pl-PL' };
      assert.equal(f.title.labels[0].textContent.trim(), 'Tytuł');
      assert.match(f.root.querySelector('#cf_auto_refresh').labels[0].textContent, /Automatycznie odświeżaj/);
      assert.match(f.root.querySelector('#cf_show_disabled').labels[0].textContent, /Uwzględniaj wyłączone/);
      assert.equal(f.root.activeElement, f.title);
      assert.equal(f.title.selectionStart, 1); assert.equal(f.title.selectionEnd, 4);
      assert.equal(f.title.selectionDirection, 'backward');
      f.editor.hass = { language: 'en' };
      assert.equal(f.title.labels[0].textContent.trim(), 'Title');
      assert.equal(f.root.activeElement, f.title);
      assert.equal(events, 0);
      assert.deepEqual(JSON.parse(JSON.stringify(f.editor._config.future_setting)), { enabled: true, names: ['retained'] });
    } finally { f.dom.window.close(); }
  });

  // Replacing innerHTML during the real input callback detaches the active node;
  // writing an equal value again can also reset selection in the native input.
  for (const selection of [
    { start: 3, end: 3, direction: 'none' },
    { start: 1, end: 6, direction: 'forward' },
    { start: 1, end: 6, direction: 'backward' },
  ]) {
    test(`${source}: synchronous config echo preserves node, focus and ${selection.direction} selection`, () => {
      const f = fixture();
      try {
        const events = [];
        const echoed = [];
        f.dom.window.document.body.addEventListener('config-changed', event => {
          events.push(event);
          f.editor.setConfig({ ...event.detail.config });
          // Capture inside the synchronous host callback; assert outside it so
          // DOM event dispatch cannot swallow assertion failures.
          echoed.push({
            node: f.root.querySelector('#cf_title'), active: f.root.activeElement,
            start: f.title.selectionStart, end: f.title.selectionEnd,
            direction: f.title.selectionDirection,
          });
        });
        for (const value of ['Edited title', '<title> & "quoted"', 'Zażółć title']) {
          f.title.value = value;
          f.title.focus();
          f.title.setSelectionRange(selection.start, selection.end, selection.direction);
          f.title.dispatchEvent(new f.dom.window.Event('input', { bubbles: true, composed: true }));
          const snapshot = echoed[echoed.length - 1];
          assert.ok(snapshot, 'input must emit config-changed to the connected host');
          assert.equal(snapshot.node, f.title);
          assert.equal(snapshot.active, f.title);
          assert.equal(snapshot.start, selection.start);
          assert.equal(snapshot.end, selection.end);
          assert.equal(snapshot.direction, selection.direction);
          assert.equal(f.root.querySelector('#cf_title'), f.title);
          assert.equal(f.root.activeElement, f.title);
          assert.equal(f.dom.window.document.activeElement, f.editor);
          assert.equal(f.title.value, value);
          assert.equal(events[events.length - 1].detail.config.title, value);
        }
        assert.equal(events.length, 3, 'one event per input despite repeated host echoes');
        assert.equal(events[0].bubbles, true);
        assert.equal(events[0].composed, true);
        assert.equal(events[0].detail.config.title, 'Edited title', 'later edits must not mutate prior payloads');
        assert.equal(f.root.querySelectorAll('img,script').length, 0);
      } finally { f.dom.window.close(); }
    });
  }

  test(`${source}: clearing and retyping survives synchronous echoes and retains unknown config`, () => {
    const original = Object.freeze({
      type: 'custom:ha-automation-analyzer', title: 'Before', show_support: false,
      future_setting: Object.freeze({ enabled: true, names: Object.freeze(['retained']) }),
    });
    const f = fixture(original);
    try {
      const payloads = [];
      f.editor.addEventListener('config-changed', event => {
        payloads.push(event.detail.config);
        f.editor.setConfig({ ...event.detail.config });
      });
      f.title.focus();
      for (const value of ['', 'New title']) {
        f.title.value = value;
        f.title.setSelectionRange(value.length, value.length);
        f.title.dispatchEvent(new f.dom.window.Event('input', { bubbles: true }));
        assert.equal(f.root.querySelector('#cf_title'), f.title);
        assert.equal(f.root.activeElement, f.title);
        assert.equal(f.title.value, value, 'empty authored title must not turn into the default');
        assert.equal(f.title.selectionStart, value.length);
        assert.equal(f.title.selectionEnd, value.length);
      }
      assert.equal(payloads.length, 2);
      assert.equal(payloads[0].title, '');
      assert.equal(payloads[1].title, 'New title');
      for (const payload of payloads) {
        assert.notEqual(payload, original);
        assert.equal(payload.type, 'custom:ha-automation-analyzer');
        assert.equal(payload.show_support, false);
        assert.deepEqual(JSON.parse(JSON.stringify(payload.future_setting)), { enabled: true, names: ['retained'] });
      }
      assert.equal(original.title, 'Before');
    } finally { f.dom.window.close(); }
  });

  test(`${source}: external config updates the existing field even while focused without emitting changes`, () => {
    const f = fixture();
    try {
      let events = 0;
      f.editor.addEventListener('config-changed', () => events++);
      f.title.focus();
      f.title.setSelectionRange(1, 4, 'backward');
      f.editor.setConfig({ ...f.config, title: 'External <title> & "literal"' });
      assert.equal(f.root.querySelector('#cf_title'), f.title);
      assert.equal(f.root.activeElement, f.title);
      assert.equal(f.title.value, 'External <title> & "literal"');
      f.editor.setConfig({ ...f.config, title: '' });
      assert.equal(f.title.value, '');
      f.editor.setConfig({ type: f.config.type });
      assert.equal(f.title.value, 'Automation Analyzer');
      assert.equal(events, 0, 'programmatic updates must not create echo loops');
      assert.equal(f.root.querySelectorAll('img,script').length, 0);
    } finally { f.dom.window.close(); }
  });

  test(`${source}: external updates never steal focus and next edit uses the latest complete config`, () => {
    const f = fixture();
    try {
      const outside = f.dom.window.document.getElementById('outside');
      outside.focus();
      const replacement = {
        type: 'custom:ha-automation-analyzer', title: 'From HA', show_support: true,
        another_unknown: { version: 2 }, auto_refresh:true, show_disabled:true,
      };
      f.editor.setConfig(replacement);
      f.editor.setConfig({ ...replacement });
      assert.equal(f.dom.window.document.activeElement, outside);
      assert.equal(f.root.activeElement, null);
      assert.equal(f.root.querySelector('#cf_title'), f.title);
      assert.equal(f.title.value, 'From HA');
      const payloads = [];
      f.editor.addEventListener('config-changed', event => payloads.push(event.detail.config));
      f.title.value = 'After external update';
      f.title.dispatchEvent(new f.dom.window.Event('input', { bubbles: true }));
      assert.equal(payloads.length, 1);
      assert.deepEqual(JSON.parse(JSON.stringify(payloads[0])), {
        type: 'custom:ha-automation-analyzer', title: 'After external update', show_support: true,
        another_unknown: { version: 2 }, auto_refresh:true, show_disabled:true,
      });
      assert.equal(replacement.title, 'From HA');
      assert.equal(f.dom.window.document.activeElement, outside);
    } finally { f.dom.window.close(); }
  });

  test(`${source}: repeated config and reconnects leave one listener per input`, () => {
    const f = fixture();
    try {
      const payloads = [];
      f.editor.addEventListener('config-changed', event => {
        payloads.push(event.detail.config);
        f.editor.setConfig({ ...event.detail.config });
      });
      for (let i = 0; i < 3; i++) {
        f.editor.setConfig({ ...f.config, title: `Host ${i}` });
        f.editor.remove();
        f.dom.window.document.body.append(f.editor);
      }
      assert.equal(payloads.length, 0);
      const title = f.root.querySelector('#cf_title');
      title.focus();
      for (const value of ['First input', 'Second input']) {
        title.value = value;
        title.dispatchEvent(new f.dom.window.Event('input', { bubbles: true }));
        assert.equal(f.root.querySelector('#cf_title'), title);
        assert.equal(f.root.activeElement, title);
      }
      assert.deepEqual(payloads.map(config => config.title), ['First input', 'Second input']);
    } finally { f.dom.window.close(); }
  });
}

for (const file of ['ha-automation-analyzer.js','custom_components/ha_automation_analyzer/www/ha-automation-analyzer.js']) {
  test(`${file}: checkbox echoes keep focus, preserve unknown options and accept external values`, () => {
    const dom = new JSDOM('<body><button id="outside">Outside</button></body>', {runScripts:'dangerously',url:'http://qa.invalid/',pretendToBeVisual:true,virtualConsole:new VirtualConsole()});
    try {
      dom.window.eval(readFileSync(path.join(__dirname,'..',file),'utf8'));
      const editor=dom.window.document.createElement('ha-automation-analyzer-editor');
      editor.setConfig({title:'Title',auto_refresh:true,show_disabled:true,show_support:false,future:{keep:1}});dom.window.document.body.append(editor);
      let count=0;editor.addEventListener('config-changed',event=>{count++;editor.setConfig(event.detail.config);});
      for(const key of ['auto_refresh','show_disabled']){
        const input=editor.shadowRoot.querySelector('#cf_'+key);input.focus();input.checked=false;input.dispatchEvent(new dom.window.Event('change'));
        assert.equal(editor.shadowRoot.querySelector('#cf_'+key),input);assert.equal(editor.shadowRoot.activeElement,input);assert.equal(editor._config[key],false);assert.equal(editor._config.show_support,false);assert.equal(editor._config.future.keep,1);
        editor.setConfig({...editor._config,[key]:true});assert.equal(input.checked,true);assert.equal(editor.shadowRoot.activeElement,input);
      }
      assert.equal(count,2);editor.setConfig({auto_refresh:'false',show_disabled:null,title:{bad:true},future:3});assert.equal(editor.shadowRoot.querySelector('#cf_title').value,'Automation Analyzer');assert.equal(editor.shadowRoot.querySelector('#cf_auto_refresh').checked,true);assert.equal(editor.shadowRoot.querySelector('#cf_show_disabled').checked,true);assert.equal(editor._config.future,3);
    }finally{dom.window.close();}
  });
}
