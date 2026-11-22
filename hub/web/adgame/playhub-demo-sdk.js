/**
 * PlayHub AdGame Demo SDK (v1)
 * Standard postMessage bridge between an embedded HTML5 demo game and the Hub-AdGame launcher.
 */
(() => {
  const CHANNEL = 'playhub:adgame:v1';

  function send(type, payload = {}) {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ channel: CHANNEL, type, payload, ts: Date.now() }, '*');
      }
    } catch {}
  }

  window.PlayHubDemo = {
    version: '1.0.0',
    ready(info = {}) {
      send('ready', info);
    },
    reportProgress({ score = 0, stage = 1, elapsedMs = 0, meta = {} } = {}) {
      send('progress', { score, stage, elapsedMs, meta });
    },
    milestone(name, data = {}) {
      send('milestone', { name, ...data });
    },
    completeDemo({ score = 0, stage = 1, reason = 'stage_clear', carryOver = {} } = {}) {
      send('complete', { score, stage, reason, carryOver });
    },
    requestInstall(context = {}) {
      send('request_install', context);
    }
  };
})();
