'use strict';
// A minimal deterministic DOM for testing this app's bindings and event flows.
// It does not implement CSS layout, browser validation, accessibility trees,
// pointer/touch input, paint, network loading, or a browser rendering engine.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class HarnessEvent {
  constructor(type, options = {}) {
    this.type = type; this.defaultPrevented = false; this.bubbles = !!options.bubbles;
    Object.assign(this, options);
  }
  preventDefault() { this.defaultPrevented = true; }
  stopPropagation() { this.propagationStopped = true; }
}

class HarnessNode {
  constructor(document, tag = null, text = '') {
    this.ownerDocument = document; this.tagName = tag ? tag.toUpperCase() : undefined;
    this.nodeType = tag ? 1 : 3; this.parentNode = null; this.childNodes = [];
    this.attributes = Object.create(null); this.listeners = new Map(); this.style = {};
    this._text = text; this._value = undefined; this._selected = false;
    this.dataset = new Proxy({}, {
      get: (_, key) => this.getAttribute('data-' + key.replace(/[A-Z]/g, x => '-' + x.toLowerCase())),
      set: (_, key, value) => { this.setAttribute('data-' + key.replace(/[A-Z]/g, x => '-' + x.toLowerCase()), value); return true; }
    });
    this.classList = {
      contains: value => this.className.split(/\s+/).includes(value),
      toggle: (value, force) => {
        const list = new Set(this.className.split(/\s+/).filter(Boolean));
        const yes = force === undefined ? !list.has(value) : !!force;
        if (yes) list.add(value); else list.delete(value);
        this.className = [...list].join(' '); return yes;
      },
      add: (...values) => values.forEach(value => this.classList.toggle(value, true)),
      remove: (...values) => values.forEach(value => this.classList.toggle(value, false))
    };
  }
  get children() { return this.childNodes.filter(n => n.nodeType === 1); }
  get textContent() { return this.nodeType === 3 ? this._text : this.childNodes.map(n => n.textContent).join(''); }
  set textContent(value) {
    if (this.nodeType === 3) { this._text = String(value); return; }
    this.replaceChildren();
    if (value !== '') this.appendChild(this.ownerDocument.createTextNode(String(value)));
  }
  get id() { return this.getAttribute('id') || ''; }
  set id(value) { this.setAttribute('id', value); }
  get className() { return this.getAttribute('class') || ''; }
  set className(value) { this.setAttribute('class', value); }
  get value() {
    if (this.tagName === 'SELECT') {
      const options = this.querySelectorAll('option');
      const selected = options.find(o => o.selected);
      if (selected) return selected.value;
      return this._selectionCleared ? '' : (options[0]?.value || '');
    }
    if (this._value !== undefined) return this._value;
    if (this.tagName === 'OPTION') return this.getAttribute('value') ?? this.textContent;
    return this.getAttribute('value') || '';
  }
  set value(value) {
    value = String(value);
    if (this.tagName === 'SELECT') {
      const options = this.querySelectorAll('option');
      let found = false;
      for (const option of options) { option._selected = !found && option.value === value; if (option._selected) found = true; }
      this._selectionCleared = !found;
    } else this._value = value;
  }
  get selected() { return this._selected || this.hasAttribute('selected'); }
  set selected(value) {
    this._selected = !!value;
    if (!value) this.removeAttribute('selected');
    if (value && this.parentNode?.tagName === 'SELECT') {
      for (const sibling of this.parentNode.querySelectorAll('option')) if (sibling !== this) { sibling._selected = false; sibling.removeAttribute('selected'); }
      this.parentNode._selectionCleared = false;
    }
  }
  get hidden() { return this.hasAttribute('hidden'); }
  set hidden(value) { if (value) this.setAttribute('hidden', ''); else this.removeAttribute('hidden'); }
  get checked() { return this.hasAttribute('checked'); }
  set checked(value) { if (value) this.setAttribute('checked', ''); else this.removeAttribute('checked'); }
  get disabled() { return this.hasAttribute('disabled'); }
  set disabled(value) { if (value) this.setAttribute('disabled', ''); else this.removeAttribute('disabled'); }
  get open() { return this.hasAttribute('open'); }
  set open(value) { if (value) this.setAttribute('open', ''); else this.removeAttribute('open'); }
  get options() { return this.querySelectorAll('option'); }
  get type() { return this.getAttribute('type') || (this.tagName === 'BUTTON' ? 'submit' : ''); }
  set type(value) { this.setAttribute('type', value); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null; }
  hasAttribute(name) { return Object.hasOwn(this.attributes, name); }
  removeAttribute(name) { delete this.attributes[name]; }
  appendChild(child) {
    if (!child || !child.nodeType) throw new TypeError('appendChild requires a node');
    if (child.parentNode) child.remove();
    this.childNodes.push(child); child.parentNode = this;
    if (this.tagName === 'SELECT' && child.tagName === 'OPTION' && child.selected) child.selected = true;
    return child;
  }
  replaceChildren(...children) {
    for (const child of this.childNodes) child.parentNode = null;
    this.childNodes = [];
    children.forEach(child => this.appendChild(typeof child === 'string' ? this.ownerDocument.createTextNode(child) : child));
  }
  remove() {
    if (!this.parentNode) return;
    const parent = this.parentNode; parent.childNodes.splice(parent.childNodes.indexOf(this), 1); this.parentNode = null;
  }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }
  dispatchEvent(event) {
    if (!event.target) event.target = this;
    event.currentTarget = this;
    for (const handler of this.listeners.get(event.type) || []) handler.call(this, event);
    if (event.bubbles && !event.propagationStopped && this.parentNode) this.parentNode.dispatchEvent(event);
    return !event.defaultPrevented;
  }
  click() {
    if (this.disabled) return;
    const event = new HarnessEvent('click', {bubbles: true});
    this.dispatchEvent(event);
    if (event.defaultPrevented) return;
    if (this.tagName === 'A' && this.download) this.ownerDocument.captureDownload(this);
    if (this.tagName === 'BUTTON' && this.type === 'submit') {
      let parent = this.parentNode;
      while (parent && parent.tagName !== 'FORM') parent = parent.parentNode;
      if (parent) parent.dispatchEvent(new HarnessEvent('submit', {bubbles: true}));
    }
  }
  showModal() { if (this.tagName !== 'DIALOG') throw new Error('showModal on non-dialog'); this.open = true; }
  close() { this.open = false; }
  getBoundingClientRect() { return {left: 0, right: 100, top: 0, bottom: 100}; }
  matches(selector) {
    // Only simple selectors used by this app/tests. Refuse unsupported syntax.
    if (/\s|>|\+|~|,|:/.test(selector)) throw new Error('Unsupported harness selector: ' + selector);
    const tag = selector.match(/^[A-Za-z][\w-]*/)?.[0];
    if (tag && this.tagName !== tag.toUpperCase()) return false;
    for (const match of selector.matchAll(/\.([\w-]+)/g)) if (!this.classList.contains(match[1])) return false;
    for (const match of selector.matchAll(/#([\w-]+)/g)) if (this.id !== match[1]) return false;
    for (const match of selector.matchAll(/\[([\w-]+)(?:=['"]?([^'"\]]+)['"]?)?\]/g)) {
      if (!this.hasAttribute(match[1])) return false;
      if (match[2] !== undefined && this.getAttribute(match[1]) !== match[2]) return false;
    }
    return this.nodeType === 1;
  }
  querySelectorAll(selector) {
    const found = [];
    const visit = parent => { for (const child of parent.children) { if (child.matches(selector)) found.push(child); visit(child); } };
    visit(this); return found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

class HarnessDocument extends HarnessNode {
  constructor(tree, capture) {
    super(null, '#document'); this.ownerDocument = this; this.nodeType = 9;
    this.captureDownload = capture;
    const from = item => {
      if (Object.hasOwn(item, 'text')) return this.createTextNode(item.text);
      const node = this.createElement(item.tag);
      for (const [key, value] of Object.entries(item.attrs || {})) node.setAttribute(key, value);
      (item.children || []).forEach(child => node.appendChild(from(child))); return node;
    };
    tree.children.forEach(child => this.appendChild(from(child)));
    this.body = this.querySelector('body');
  }
  createElement(tag) { return new HarnessNode(this, tag); }
  createTextNode(text) { return new HarnessNode(this, null, String(text)); }
  getElementById(id) { return this.querySelectorAll('[id]').find(node => node.id === id) || null; }
}

function boot(root, fixture) {
  const downloads = [], blobs = new Map(), timers = new Map();
  let blobId = 0, timerId = 0;
  class HarnessURL extends URL {
    static createObjectURL(blob) { const key = 'blob:ui-harness-' + (++blobId); blobs.set(key, blob); return key; }
    static revokeObjectURL(url) { blobs.delete(url); }
  }
  const document = new HarnessDocument(fixture.tree, anchor => {
    const blob = blobs.get(anchor.href);
    if (!blob) throw new Error('Download without a known Blob');
    downloads.push({filename: anchor.download, href: anchor.href, blob});
  });
  document.getElementById('research-data').textContent = JSON.stringify(fixture.data);
  const context = vm.createContext({document, URL: HarnessURL, Blob, Event: HarnessEvent,
    console, setTimeout: (fn, ms) => { const id = ++timerId; timers.set(id, {fn, ms}); return id; },
    clearTimeout: id => timers.delete(id),
    fetch: () => { throw new Error('Network call attempted in offline UI harness'); }});
  context.window = context;
  for (const filename of ['core.js', 'economy.js', 'contracts.js', 'app.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'lab', filename), 'utf8'), context,
      {filename: 'lab/' + filename, timeout: 10000});
  }
  const get = id => {
    const element = document.getElementById(id);
    if (!element) throw new Error('Missing UI binding: ' + id);
    return element;
  };
  return {document, context, downloads, get,
    input(id, value) { get(id).value = String(value); get(id).dispatchEvent(new HarnessEvent('input')); },
    change(id, value) { get(id).value = String(value); get(id).dispatchEvent(new HarnessEvent('change')); },
    submit(id) { const event = new HarnessEvent('submit'); get(id).dispatchEvent(event); return event; },
    click(id) { get(id).click(); },
    scope(value) { const item = document.querySelectorAll('[data-scope]').find(e => e.dataset.scope === value); if (!item) throw new Error('Missing scope'); item.click(); },
    view(value) { const item = document.querySelectorAll('[data-view]').find(e => e.dataset.view === value); if (!item) throw new Error('Missing view'); item.click(); },
    card(key) { const item = get('card-list').querySelectorAll('button').find(e => e.querySelector('small')?.textContent === key); if (!item) throw new Error('Missing card button: ' + key); item.click(); },
    async lastDownload() { const item = downloads.at(-1); if (!item) throw new Error('No download requested'); return {...item, text: await item.blob.text()}; }
  };
}

module.exports = {boot, HarnessNode, HarnessDocument, HarnessEvent};
