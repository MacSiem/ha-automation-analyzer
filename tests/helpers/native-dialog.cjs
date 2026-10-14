// JSDOM adapter for native dialog lifecycle only. Inert/top-layer/layout require live Chrome.
module.exports = function installDialogHarness(window) {
  const modal = new WeakSet(), calls = [];
  const proto = window.HTMLDialogElement.prototype;
  const matches = proto.matches;
  proto.matches = function(selector) { return selector === ':modal' ? modal.has(this) && this.isConnected : matches.call(this, selector); };
  proto.showModal = function() {
    if (!this.isConnected || (this.open && !modal.has(this))) throw new window.DOMException('Invalid modal state', 'InvalidStateError');
    if (modal.has(this)) return;
    calls.push({ kind: 'showModal', dialog: this, connected: this.isConnected });
    modal.add(this); this.open = true;
  };
  proto.close = function() {
    if (!this.open) return;
    calls.push({ kind: 'close', dialog: this });
    this.open = false; modal.delete(this);
    window.queueMicrotask(() => this.dispatchEvent(new window.Event('close')));
  };
  return { calls };
};
