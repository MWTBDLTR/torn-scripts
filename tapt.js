// ==UserScript==
// @name        Torn Attack Page Timers (TAPT)
// @namespace   https://github.com/MWTBDLTR/torn-scripts/
// @version     1.0
// @description Displays timers on the attack page (scripting rules compliant; CORS-safe)
// @author      MrChurch [3654415]
// @license     MIT
// @run-at      document-end
// @grant       GM_log
// @grant       GM_xmlhttpRequest
// @connect     api.torn.com
// @match       https://www.torn.com/loader.php?sid=attack*
// ==/UserScript==

const apiKey = "";

function fmtTimeLeft(untilEpochSec) {
  const now = Date.now();
  const outMs = Math.max(0, (untilEpochSec * 1000) - now);
  const seconds = Math.floor(outMs / 1000);

  if (seconds >= 3600) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
    return `${h}h${m}`;
  }
  if (seconds >= 60) {
    const m = Math.floor(seconds / 60);
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }
  return `${seconds}s`;
}

function renderInfo(untilEpochSec) {
  const outDate = new Date(0);
  outDate.setUTCSeconds(untilEpochSec);

  const secondsLeft = Math.floor(((untilEpochSec * 1000) - Date.now()) / 1000);
  const underMinute = secondsLeft <= 60;

  return `
    <div style="height:6px"></div>
    <div>Coming out at ${outDate.toLocaleTimeString('en-US')}</div>
    <div>In <span class="bold" style="${underMinute ? 'color:#98FB98' : ''}">${fmtTimeLeft(untilEpochSec)}</span></div>
  `;
}

function safeGetUserIdFromUrl() {
  const m = location.href.match(/user2ID=(\d+)/i);
  return m ? m[1] : null;
}

function gmRequestJson(url) {
  return new Promise((resolve) => {
    if (typeof GM_xmlhttpRequest === 'function') {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        headers: { 'Accept': 'application/json' },
        onload: (res) => {
          try { resolve(JSON.parse(res.responseText || '{}')); }
          catch { resolve({ error: { code: -2, error: 'bad json' } }); }
        },
        onerror: () => resolve({ error: { code: -1, error: 'network error' } }),
        ontimeout: () => resolve({ error: { code: -1, error: 'timeout' } }),
      });
    } else {
      // fallback if GM_xmlhttpRequest isn’t available
      fetch(url, { credentials: 'omit', mode: 'cors' })
        .then(r => r.json()).then(resolve)
        .catch(() => resolve({ error: { code: -1, error: 'network error' } }));
    }
  });
}

async function getProfile(userId) {
  const url = `https://api.torn.com/user/${userId}?selections=profile&key=${encodeURIComponent(apiKey)}&comment=attack_stats`;
  return gmRequestJson(url);
}

function mountContainer() {
  const candidates = [
    '[class*="dialogButtons"]',
    '[class*="dialog"] [class*="buttons"]',
    '[class*="header"]',
    '#react-root',
    'body'
  ];
  for (const sel of candidates) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return document.body;
}

(function () {
  'use strict';

  const initialTitle = document.title;
  const userId = safeGetUserIdFromUrl();
  if (!userId) {
    console.warn('[torn-attack-hospital-timer] Unable to detect user2ID in URL.');
    return;
  }
  if (!apiKey) {
    console.warn('[torn-attack-hospital-timer] No API key set.');
    return;
  }

  let tickInterval = null;

  (async () => {
    const user = await getProfile(userId);
    if (user?.error) {
      console.warn('[torn-attack-hospital-timer] API error:', user.error);
      return;
    }

    const status = user?.status;
    if (!status || typeof status.state !== 'string') {
      console.warn('[torn-attack-hospital-timer] Missing status in profile payload.');
      return;
    }

    const inHospital = status.state.toLowerCase() === 'hospital';
    const until = Number(status.until); // epoch seconds

    if (!inHospital || !Number.isFinite(until) || until <= 0) {
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-taht', '1');
    wrapper.style.marginTop = '8px';
    wrapper.style.fontSize = '13px';
    wrapper.style.lineHeight = '1.25';

    let parent = mountContainer();
    parent.appendChild(wrapper);

    // keep attached across react re-renders
    const obs = new MutationObserver(() => {
      if (!document.contains(wrapper)) {
        try { mountContainer().appendChild(wrapper); } catch {}
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });

    const updateUI = () => {
      const now = Date.now();
      const remainingMs = (until * 1000) - now;
      if (remainingMs <= 0) {
        // stop once timer finishes; restore title
        clearInterval(tickInterval);
        obs.disconnect();
        wrapper.innerHTML = renderInfo(until);
        document.title = initialTitle;
        return;
      }
      wrapper.innerHTML = renderInfo(until);
      document.title = `${fmtTimeLeft(until)} | ${user.name || 'Player'}`;
    };

    updateUI();
    tickInterval = setInterval(updateUI, 1000);
  })();

  // Clean up on nav-away
  window.addEventListener('beforeunload', () => {
    if (tickInterval) clearInterval(tickInterval);
  });
})();
