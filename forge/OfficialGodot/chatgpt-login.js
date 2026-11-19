(() => {
  'use strict';
  const status = document.getElementById('status');
  const followup = '이 창을 닫고 PlayForge 채팅 설정에서 다시 시도해 주세요.';
  const nonce = location.hash.slice(1);
  if (!/^[a-f0-9]{32}$/.test(nonce) || !window.BroadcastChannel) {
    status.textContent = '로그인 요청을 확인하지 못했습니다. ' + followup;
    return;
  }
  let channel;
  try {
    channel = new BroadcastChannel('playforge-chatgpt-login:' + nonce);
  } catch {
    status.textContent = '로그인 요청을 확인하지 못했습니다. ' + followup;
    return;
  }
  const ready = () => channel.postMessage({ type: 'ready' });
  const poll = setInterval(ready, 250);
  const expiry = setTimeout(() => {
    close();
    status.textContent = '로그인 요청 시간이 지났습니다. ' + followup;
  }, 30000);
  let finished = false;
  function close() {
    if (finished) return;
    finished = true;
    clearInterval(poll);
    clearTimeout(expiry);
    channel.close();
  }
  addEventListener('pagehide', close, { once: true });
  channel.onmessage = ({ data }) => {
    if (finished) return;
    if (data?.type === 'connected') {
      channel.postMessage({ type: 'received' });
      close();
      status.textContent = '계정이 이미 연결되어 있습니다. 이 창을 닫고 PlayForge로 돌아가 주세요.';
      return;
    }
    if (data?.type === 'failed') {
      channel.postMessage({ type: 'received' });
      close();
      const detail = typeof data.message === 'string' ? data.message.slice(0, 500).trim() : '';
      status.textContent = (detail || '로그인 요청을 시작할 수 없습니다.') + ' ' + followup;
    } else if (data?.type === 'navigate') {
      if (typeof data.url !== 'string' || data.url.length > 8192) return;
      let url;
      try {
        url = new URL(data.url);
      } catch {
        return;
      }
      if (url.protocol !== 'https:' || url.username || url.password || url.port ||
          !['auth.openai.com', 'chatgpt.com'].includes(url.hostname)) return;
      channel.postMessage({ type: 'received' });
      close();
      status.textContent = 'ChatGPT 로그인 페이지로 이동합니다. 이동하지 않으면 아래 링크를 눌러 주세요.';
      document.getElementById('login-link').href = url.href;
      document.getElementById('continue').hidden = false;
      try {
        location.replace(url.href);
      } catch {
        status.textContent = '자동 이동을 완료하지 못했습니다. 아래 링크를 눌러 주세요.';
      }
    }
  };
  ready();
})();
