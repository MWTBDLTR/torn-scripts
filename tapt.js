// ==UserScript==
// @name        Torn Attack Page Timers (TAPT)
// @namespace   https://github.com/MWTBDLTR/torn-scripts/
// @version     1.2
// @description Displays timers on the attack page (scripting rules compliant; CORS-safe; menu to set API key; robust mount + console logs)
// @author      MrChurch [3654415]
// @license     MIT
// @run-at      document-end
// @grant       GM_log
// @grant       GM_xmlhttpRequest
// @grant       GM_registerMenuCommand
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       GM_deleteValue
// @connect     api.torn.com
// @match       https://www.torn.com/loader.php?sid=attack*
// ==/UserScript==

/** --- Settings: stored via userscript manager menu --- */
const KEY_NAME = 'tapt_api_key';

function setApiKeyInteractive() {
  const current = GM_getValue(KEY_NAME, '');
  const entered = prompt('Enter your Torn API key (User key with Basic read access):', current || '');
  if (entered !== null) {
    const trimmed = entered.trim();
    if (trimmed) {
      GM_setValue(KEY_NAME, trimmed);
      console.info('[TAPT] API key saved.');
      alert('Saved Torn API key.');
      location.reload();
    } else {
      GM_deleteValue(KEY_NAME);
      console.info('[TAPT] API key cleared.');
      alert('Cleared Torn API key.');
      location.reload();
    }
  }
}

try {
  GM_registerMenuCommand('Set Torn API key', setApiKeyInteractive);
} catch { /* menu not supported in some managers */ }

/** --- Helpers --- */
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
  const outDate = new Date(untilEpochSec * 1000);
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
          catch (e) { console.warn('[TAPT] Bad JSON from API:', e); resolve({ error: { code: -2, error: 'bad json' } }); }
        },
        onerror: () => resolve({ error: { code: -1, error: 'network error' } }),
        ontimeout: () => resolve({ error: { code: -1, error: 'timeout' } }),
      });
    } else {
      fetch(url, { credentials: 'omit', mode: 'cors' })
        .then(r => r.json()).then(resolve)
        .catch(() => resolve({ error: { code: -1, error: 'network error' } }));
    }
  });
}

async function getProfile(userId, apiKey) {
  const url = `https://api.torn.com/user/${userId}?selections=profile&key=${encodeURIComponent(apiKey)}&comment=tapt`;
  console.info('[TAPT] Fetching profile:', { userId, url });
  const data = await gmRequestJson(url);
  return data;
}

function mountContainer() {
  const candidates = [
    '[class*="dialogButtons"]',
    '[class*="dialog"] [class*="buttons"]',
    '[class*="header"]',
    '#react-root',
  ];
  for (const sel of candidates) {
    const el = document.querySelector(sel);
    if (el) {
      console.info('[TAPT] Mount target found:', sel);
      return { parent: el, overlay: false };
    }
  }
  console.warn('[TAPT] No stable mount target found; using fixed overlay.');
  return { parent: document.body, overlay: true };
}

function applyOverlayStyle(el) {
  el.style.position = 'fixed';
  el.style.top = '10px';
  el.style.right = '12px';
  el.style.zIndex = '9999';
  el.style.background = 'rgba(0,0,0,0.6)';
  el.style.color = '#fff';
  el.style.padding = '8px 10px';
  el.style.borderRadius = '10px';
  el.style.fontSize = '13px';
  el.style.lineHeight = '1.25';
  el.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
}

/** --- Main --- */
(function () {
  'use strict';

  const storedKey = GM_getValue(KEY_NAME, '');
  if (!storedKey) {
    console.warn('[TAPT] No API key set. Use script menu → "Set Torn API key".');
    return;
  }

  const initialTitle = document.title;
  const userId = safeGetUserIdFromUrl();
  console.info('[TAPT] Detected user2ID:', userId);

  if (!userId) {
    console.warn('[TAPT] Unable to detect user2ID in URL. Ensure the attack URL includes user2ID=...');
    return;
  }

  let tickInterval = null;

  (async () => {
    const user = await getProfile(userId, storedKey);
    if (user?.error) {
      console.warn('[TAPT] API error:', user.error);
      return;
    }

    const name = user?.name || 'Player';
    const status = user?.status;
    if (!status || typeof status.state !== 'string') {
      console.warn('[TAPT] Missing status in profile payload:', user);
      return;
    }

    const inHospital = status.state.toLowerCase() === 'hospital';
    const until = Number(status.until); // epoch seconds

    console.info('[TAPT] API OK:', {
      name,
      state: status.state,
      until,
      untilLocal: new Date(until * 1000).toLocaleString(),
      timeLeft: fmtTimeLeft(until)
    });

    if (!inHospital) {
      console.info('[TAPT] Target not in hospital; timer not shown.');
      return;
    }
    if (!Number.isFinite(until) || until <= 0) {
      console.warn('[TAPT] Invalid/zero hospital "until" timestamp.');
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.setAttribute('data-tapt', '1');
    wrapper.style.marginTop = '8px';
    wrapper.style.fontSize = '13px';
    wrapper.style.lineHeight = '1.25';

    const { parent, overlay } = mountContainer();
    parent.appendChild(wrapper);
    if (overlay) applyOverlayStyle(wrapper);

    // Keep attached across React re-renders unless overlay (fixed to body)
    const obs = new MutationObserver(() => {
      if (!overlay && !document.contains(wrapper)) {
        try { mountContainer().parent.appendChild(wrapper); } catch {}
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });

    const updateUI = () => {
      const remainingMs = (until * 1000) - Date.now();
      wrapper.innerHTML = renderInfo(until);
      if (remainingMs > 0) {
        document.title = `${fmtTimeLeft(until)} | ${name}`;
      } else {
        clearInterval(tickInterval);
        obs.disconnect();
        document.title = initialTitle;
      }
    };

    updateUI();
    tickInterval = setInterval(updateUI, 1000);
  })();

  // Clean up on nav-away
  window.addEventListener('beforeunload', () => {
    if (tickInterval) clearInterval(tickInterval);
  });
})();
