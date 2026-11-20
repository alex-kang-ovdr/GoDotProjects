/* Offline localization (LOCTEXT key-value + localized media + legacy source fallback). */
(function (root) {
  'use strict';
  const locales = ['ko', 'en', 'ja', 'zh-CN', 'fr', 'es', 'pt-BR', 'hi'];
  function normalize(value) {
    if (typeof value !== 'string') return null;
    const v = value.replace(/_/g, '-').toLowerCase();
    return locales.find(x => x.toLowerCase() === v) || ({ zh: 'zh-CN', pt: 'pt-BR' })[v.split('-')[0]] || locales.find(x => x === v.split('-')[0]) || null;
  }
  const dictionary = new Map(), keyTable = new Map(), mediaTable = new Map(), patterns = [], cache = new Map(), records = new WeakMap();
  const clean = value => String(value).trim().replace(/\s+/g, ' ');
  const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let locale = normalize(new URLSearchParams(location.search).get('lang'));
  const framed = root.parent !== root;
  if (!locale && !framed) { try { locale = normalize(localStorage.getItem('playhub.locale')); } catch (_) {} }
  locale ||= normalize(navigator.language) || 'ko';
  const nonce = new URLSearchParams(location.hash.slice(1)).get('nonce') || '';

  function interpolate(template, vars) {
    if (!vars || typeof vars !== 'object') return template;
    return String(template).replace(/\{([A-Za-z0-9_]+)\}/g, (match, name) => (
      Object.prototype.hasOwnProperty.call(vars, name) && vars[name] !== undefined && vars[name] !== null
        ? String(vars[name])
        : match
    ));
  }

  function t(key, fallback, vars) {
    const row = keyTable.get(String(key || ''));
    let chosen;
    if (row) {
      chosen = row[locale];
      if (chosen === undefined || chosen === '') chosen = row.en;
      if (chosen === undefined || chosen === '') chosen = row.ko;
    }
    const base = (chosen !== undefined && chosen !== '') ? chosen : (fallback !== undefined ? String(fallback) : String(key || ''));
    return interpolate(base, vars);
  }

  function resolveMedia(slotKey, targetLocale = locale) {
    const slot = mediaTable.get(String(slotKey || ''));
    if (!slot || !slot.assets) return null;
    const order = [normalize(targetLocale) || locale, 'en', 'ko'];
    for (const loc of order) {
      if (slot.assets[loc]) return { url: slot.assets[loc], resolvedLocale: loc, altKey: slot.altTextKey || null };
    }
    const first = Object.keys(slot.assets)[0];
    return first ? { url: slot.assets[first], resolvedLocale: first, altKey: slot.altTextKey || null } : null;
  }

  function translate(value) {
    const text = String(value), key = clean(text);
    if (!key) return text;
    if (cache.has(text)) return cache.get(text);
    let row = dictionary.get(key), translated = row?.[locale];
    if (translated === undefined && row && locale === 'ko') translated = row.ko || key;
    if (translated === undefined) {
      for (const pattern of patterns) {
        if (pattern.prefix && !key.startsWith(pattern.prefix)) continue;
        const match = pattern.regex.exec(key);
        if (!match) continue;
        const template = pattern.row[locale] ?? (locale === 'ko' ? pattern.source : undefined);
        if (template === undefined) continue;
        translated = template.replace(/\{(\d+)\}/g, (_, n) => {
          const value = match[pattern.slots.indexOf(n) + 1] ?? '';
          return dictionary.get(clean(value))?.[locale] ?? value;
        });
        break;
      }
    }
    const result = translated === undefined ? text : text.slice(0, text.length - text.trimStart().length) + translated + text.slice(text.trimEnd().length);
    if (cache.size > 4096) cache.clear();
    cache.set(text, result);
    return result;
  }
  function ignored(element) {
    return !element || Boolean(element.closest('script,style,noscript,textarea,code,pre,[contenteditable="true"],[data-no-translate]'));
  }
  function recordFor(node) {
    let record = records.get(node);
    if (!record) { record = new Map(); records.set(node, record); }
    return record;
  }
  function update(node, attribute) {
    const current = attribute ? node.getAttribute(attribute) : node.nodeValue;
    if (current === null) return;
    const record = recordFor(node);
    const key = attribute || '#text';
    let entry = record.get(key);
    if (!entry || current !== entry.rendered) entry = { source: current, rendered: current };
    const next = translate(entry.source);
    entry.rendered = next;
    record.set(key, entry);
    if (current !== next) { if (attribute) node.setAttribute(attribute, next); else node.nodeValue = next; }
  }
  function updateKeyedElement(element) {
    const record = recordFor(element);
    const l10nKey = element.getAttribute('data-l10n');
    if (l10nKey) {
      if (!record.has('#l10n-fallback')) record.set('#l10n-fallback', element.textContent);
      const next = t(l10nKey, record.get('#l10n-fallback'));
      if (element.textContent !== next) element.textContent = next;
    }
    for (const [dataAttr, targetAttr] of [
      ['data-l10n-placeholder', 'placeholder'],
      ['data-l10n-title', 'title'],
      ['data-l10n-aria-label', 'aria-label'],
      ['data-l10n-alt', 'alt']
    ]) {
      const attrKey = element.getAttribute(dataAttr);
      if (!attrKey) continue;
      const fbKey = '#l10n-fb-' + targetAttr;
      if (!record.has(fbKey)) record.set(fbKey, element.getAttribute(targetAttr) || '');
      const next = t(attrKey, record.get(fbKey));
      if (element.getAttribute(targetAttr) !== next) element.setAttribute(targetAttr, next);
    }
    const imgKey = element.getAttribute('data-l10n-img');
    if (imgKey) {
      const resolved = resolveMedia(imgKey);
      if (resolved?.url && element.getAttribute('src') !== resolved.url) {
        element.setAttribute('src', resolved.url);
        element.dataset.l10nImgLocale = resolved.resolvedLocale;
      }
      if (resolved?.altKey && !element.hasAttribute('data-l10n-alt')) {
        const alt = t(resolved.altKey, element.getAttribute('alt') || '');
        if (element.getAttribute('alt') !== alt) element.setAttribute('alt', alt);
      }
    }
    return Boolean(l10nKey);
  }
  const attributes = ['title', 'placeholder', 'aria-label', 'alt', 'data-l10n', 'data-l10n-placeholder', 'data-l10n-title', 'data-l10n-aria-label', 'data-l10n-alt', 'data-l10n-img'];
  function scan(node) {
    if (node.nodeType === 3) {
      if (!ignored(node.parentElement) && !node.parentElement?.hasAttribute('data-l10n')) update(node);
      return;
    }
    if (node.nodeType !== 1 && node.nodeType !== 9 && node.nodeType !== 11) return;
    if (node.nodeType === 1) {
      if (ignored(node)) return;
      const keyed = updateKeyedElement(node);
      for (const name of ['title', 'placeholder', 'aria-label', 'alt']) {
        if (node.hasAttribute(name) && !node.hasAttribute('data-l10n-' + name)) update(node, name);
      }
      if (keyed) return;
    }
    for (const child of node.childNodes || []) scan(child);
  }
  function setLocale(value) {
    const next = normalize(value);
    if (!next) return false;
    locale = next; cache.clear();
    document.documentElement.lang = locale;
    scan(document.documentElement);
    root.dispatchEvent(new CustomEvent('playhub:language-applied', { detail: { locale } }));
    return true;
  }
  function patternFor(key, row, numeric = false) {
    const slots = [], parts = []; let start = 0;
    for (const match of key.matchAll(/\{(\d+)\}/g)) {
      parts.push(escape(key.slice(start, match.index)), numeric ? '([0-9]+(?:[.,][0-9]+)*)' : '(.+?)');
      slots.push(match[1]); start = match.index + match[0].length;
    }
    if (!slots.length) return;
    parts.push(escape(key.slice(start)));
    const prior = patterns.findIndex(p => p.source === key);
    if (numeric && prior >= 0 && !patterns[prior].numeric) return;
    if (prior >= 0) patterns.splice(prior, 1);
    patterns.push({ source: key, row, slots, numeric, prefix: key.slice(0, key.indexOf('{')), regex: new RegExp('^' + parts.join('') + '$') });
  }
  function register(entries) {
    for (const [source, row] of Object.entries(entries)) {
      const key = clean(source);
      if (!row || typeof row !== 'object') continue;
      dictionary.set(key, { ...dictionary.get(key), ...row });
      if (/\{\d+\}/.test(key)) {
        patternFor(key, dictionary.get(key));
      } else if (/[가-힣]/.test(key)) {
        const number = /(?<![A-Za-z0-9])\d+(?:[.,]\d+)*/g;
        const values = key.match(number);
        if (values) {
          let index = 0;
          const template = key.replace(number, () => '{' + index++ + '}'), translations = {};
          for (const [language, value] of Object.entries(row)) {
            if (typeof value !== 'string' || JSON.stringify(value.match(number)) !== JSON.stringify(values)) continue;
            index = 0; translations[language] = value.replace(number, () => '{' + index++ + '}');
          }
          if (Object.keys(translations).length) patternFor(template, translations, true);
        }
      }
    }
    patterns.sort((a, b) => b.source.replace(/\{\d+\}/g, '').length - a.source.replace(/\{\d+\}/g, '').length);
    cache.clear(); scan(document.documentElement);
  }
  function registerKeys(entries) {
    if (!entries || typeof entries !== 'object') return;
    for (const [key, row] of Object.entries(entries)) {
      if (!row || typeof row !== 'object') continue;
      keyTable.set(key, { ...keyTable.get(key), ...row });
    }
    cache.clear(); scan(document.documentElement);
  }
  function registerMedia(entries) {
    if (!entries || typeof entries !== 'object') return;
    for (const [slotKey, slot] of Object.entries(entries)) {
      if (!slot || typeof slot !== 'object') continue;
      mediaTable.set(slotKey, {
        altTextKey: slot.altTextKey || null,
        assets: { ...(mediaTable.get(slotKey)?.assets || {}), ...(slot.assets || {}) }
      });
    }
    scan(document.documentElement);
  }
  root.PlayHubLocale = Object.freeze({
    normalize, translate, t, register, registerKeys, registerMedia, resolveMedia, setLocale,
    get locale() { return locale; },
    locales: Object.freeze(locales)
  });
  root.addEventListener('playhub:locale-change', event => setLocale(event.detail?.locale));
  root.addEventListener('message', event => {
    if (!framed || event.source !== root.parent || !/^[a-f0-9]{32,64}$/i.test(nonce) || event.data?.nonce !== nonce || event.data?.type !== 'playhub:locale') return;
    setLocale(event.data.locale);
  });
  if (root.CanvasRenderingContext2D) {
    for (const name of ['fillText', 'strokeText', 'measureText']) {
      const original = root.CanvasRenderingContext2D.prototype[name];
      if (typeof original === 'function') root.CanvasRenderingContext2D.prototype[name] = function (text, ...args) { return original.call(this, translate(text), ...args); };
    }
  }
  const observer = new MutationObserver(changes => {
    for (const change of changes) {
      if (change.type === 'characterData') scan(change.target);
      else if (change.type === 'attributes') {
        if (!ignored(change.target)) {
          if (change.attributeName.startsWith('data-l10n')) updateKeyedElement(change.target);
          else update(change.target, change.attributeName);
        }
      }
      else for (const node of change.addedNodes) scan(node);
    }
  });
  observer.observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: attributes });
  setLocale(locale);
})(globalThis);
