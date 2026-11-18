(() => {
  'use strict';
  const frame = document.getElementById('game-frame');
  const select = document.getElementById('game-language');
  if (!frame || !select) return;
  const supported = new Set([...select.options].map(option => option.value));
  const requested = new URL(location.href).searchParams.get('lang');
  let saved;
  try { saved = localStorage.getItem('playhub.locale'); } catch {}
  const initial = [requested, saved, navigator.language].find(value => supported.has(value));
  if (initial) select.value = initial;
  const apply = () => frame.contentWindow?.postMessage({
    type: 'playhub:locale', nonce: frame.dataset.nonce, locale: select.value
  }, frame.dataset.gameOrigin);
  frame.addEventListener('load', apply);
  select.addEventListener('change', () => {
    if (!supported.has(select.value)) return;
    try { localStorage.setItem('playhub.locale', select.value); } catch {}
    const url = new URL(location.href);
    url.searchParams.set('lang', select.value);
    history.replaceState(history.state, '', url);
    apply();
  });
  apply();
})();
