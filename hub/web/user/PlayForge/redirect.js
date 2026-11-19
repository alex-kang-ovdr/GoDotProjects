(function () {
  'use strict';
  const target = new URL('/forge/OfficialGodot/', location.href);
  const configured = window.PLAYHUB_CONFIG?.playforgeUrl;
  try {
    const destination = configured ? new URL(configured, location.href) : target;
    if (!['http:', 'https:'].includes(destination.protocol) || destination.username || destination.password) {
      throw new Error('Invalid PlayForge URL');
    }
    const link = document.getElementById('playforge-open');
    link.href = destination.href;
    link.hidden = false;
    location.replace(destination.href);
  } catch {
    document.getElementById('playforge-status').textContent = 'PlayForge 접속 주소를 확인해 주세요.';
  }
})();
