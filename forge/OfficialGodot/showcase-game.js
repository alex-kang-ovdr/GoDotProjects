(() => {
  'use strict';
  const run = new URLSearchParams(location.search).get('run');
  const canvas = document.getElementById('showcase-game-canvas');
  const status = document.getElementById('game-status');
  const forgeBase = (location.pathname.match(/^(.*?)\/(?:OfficialGodot|Studio|StudioGodot|Frontends)(?:\/|$)/)?.[1]) || '';
  const forgePath = route => typeof route === 'string' && route.startsWith('/') && forgeBase && !route.startsWith(forgeBase + '/') ? forgeBase + route : route;

  async function start() {
    const snapshot = window.parent.__playforgeReadShowcaseGame?.(run, window);
    if (!snapshot) throw new Error('시연 장면을 받지 못했습니다.');
    const directory = '/tmp/playforge-showcase-game';
    const concurrency = Math.min(12, Math.max(4, navigator.hardwareConcurrency || 1));
    const game = new Engine({
      canvas,
      canvasResizePolicy: 2,
      emscriptenPoolSize: concurrency,
      godotPoolSize: Math.max(2, Math.floor(concurrency / 3)),
      onExit: code => {
        document.documentElement.dataset.gameState = 'exited';
        if (code) {
          status.hidden = false;
          status.textContent = `시연 게임이 종료되었습니다 (${code}).`;
          window.parent.__playforgeShowcaseGameResult?.(run, window, status.textContent);
        }
      },
    });
    await game.init(forgePath('/OfficialGodot/vendor/godot.editor'));
    for (const { path, bytes } of snapshot.files) game.copyToFS(`${directory}/${path}`, bytes);
    await game.start({ canvas, args: ['--path', directory, snapshot.scene] });
    if (document.documentElement.dataset.gameState === 'exited') return;
    document.documentElement.dataset.gameState = 'running';
    status.hidden = true;
    canvas.focus();
    window.parent.__playforgeShowcaseGameResult?.(run, window, '');
  }

  start().catch(error => {
    document.documentElement.dataset.gameState = 'failed';
    status.textContent = error.message;
    window.parent.__playforgeShowcaseGameResult?.(run, window, error.message);
    console.error(error);
  });
})();
