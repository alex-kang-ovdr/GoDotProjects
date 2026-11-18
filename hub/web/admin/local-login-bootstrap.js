(() => {
  const fragment = location.hash;
  if (!fragment.startsWith('#playhub-local-admin=')) return;
  history.replaceState(history.state, '', location.pathname + location.search);
  let token = /^#playhub-local-admin=([A-Za-z0-9_-]{43})$/.exec(fragment)?.[1];
  if (!token) return;
  Object.defineProperty(window, 'takePlayHubLocalAdminToken', {
    configurable: true,
    value() {
      const result = token;
      token = undefined;
      delete window.takePlayHubLocalAdminToken;
      return result;
    }
  });
})();
