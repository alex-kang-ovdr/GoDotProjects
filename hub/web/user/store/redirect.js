(function () {
  'use strict';
  const configured = window.PLAYHUB_CONFIG?.storeUrl;
  const statusEl = document.getElementById('store-status');
  const linkEl = document.getElementById('store-open');
  if (!configured) {
    if (statusEl) {
      statusEl.textContent = '이 정적 환경에는 Store 업스트림 프록시가 연결되어 있지 않습니다. Hub 실행 시 storeUpstream(또는 PLAYHUB_STORE_UPSTREAM)을 지정해 주세요.';
    }
    return;
  }
  try {
    const destination = new URL(configured, location.href);
    if (!['http:', 'https:'].includes(destination.protocol) || destination.username || destination.password) {
      throw new Error('Invalid Store URL');
    }
    if (linkEl) {
      linkEl.href = destination.href;
      linkEl.hidden = false;
    }
    location.replace(destination.href);
  } catch {
    if (statusEl) statusEl.textContent = 'Store 접속 주소를 확인해 주세요.';
  }
})();
