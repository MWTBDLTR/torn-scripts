// ==UserScript==
// @name        Torn Attack Page Timers (TAPT)
// @namespace   https://github.com/MWTBDLTR/torn-scripts/
// @version     1.4
// @description Displays hospital timers on the attack page (rules-compliant; CORS-safe; menu for API key + Local/TCT time mode; prefers dialogButtons mount)
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

/** --- Settings stored via userscript manager menu --- */
const KEY_API   = 'tapt_api_key';
const KEY_MODE  = 'tapt_time_mode';
const DEFAULT_MODE = 'local';

function setApiKeyInteractive() {
  const current = GM_getValue(KEY_API, '');
  const entered = prompt('Enter your Torn API key (User key with Basic read access):', current || '');
  if (entered !== null) {
    const trimmed = entered.trim();
    if (trimmed) {
      GM_setValue(KEY_API, trimmed);
      console.info('[TAPT] API key saved.');
      alert('Saved Torn API key.');
      location.reload();
    } else {
      GM_deleteValue(KEY_API);
      console.info('[TAPT] API key cleared.');
      alert('Cleared Torn API key.');
      location.reload();
    }
  }
}

function setTimeMode(mode) {
  const normalized = (mode === 'tct') ? 'tct' : 'local';
  GM_setValue(KEY_MODE, normalized);
  console.info(`[TAPT] Time mode set to: ${normalized.toUpperCase()}`);
  alert(`Time display set to: ${normalized.toUpperCase()}`);
  location.reload();
}

function chooseLocalTime() { setTimeMode('local'); }
function chooseTornTime()  { setTimeMode('tct');   }

try {
  GM_registerMenuCommand('Set Torn API key', setApiKeyInteractive);
  const currentMode = (GM_getValue(KEY_MODE, DEFAULT_MODE) || 'local').toLowerCase();
  const label = currentMode === 'tct' ? 'Torn Time (TCT)' : 'Local Time';
  GM_registerMenuCommand(`Time display (current: ${label}) → Set LOCAL`, chooseLocalTime);
  GM_registerMenuCommand(`Time display (current: ${label}) → Set TCT`,   chooseTornTime);
} catch { /* menu may not be supported in some managers */ }

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

function formatOutTime(untilEpochSec, timeMode) {
  const d = new Date(untilEpochSec * 1000);
  if (timeMode === 'tct') {
    return {
      label: 'TCT',
      time: d.toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', second: '2-digit',
        hour12: true, timeZone: 'UTC'
      })
    };
  }
  return {
    label: 'Local',
    time: d.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', second: '2-digit',
      hour12: true
    })
  };
}

function renderInfo(untilEpochSec, timeMode) {
  const secondsLeft = Math.floor(((untilEpochSec * 1000) - Date.now()) / 1000);
  const underMinute = secondsLeft <= 60;
  const { time, label } = formatOutTime(untilEpochSec, timeMode);

  return `
    <div style="height:6px"></div>
    <div>Coming out at ${time} <span style="opacity:.8">(${label})</span></div>
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
  return gmRequestJson(url);
}

const DIALOG_SELECTOR = '[class*="dialogButtons"]';
const HEADER_SELECTOR = '[class*="header"]';

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
function clearOverlayStyle(el) {
  Object.assign(el.style, {
    position: '', top: '', right: '', zIndex: '', background: '',
    color: '', padding: '', borderRadius: '', boxShadow: ''
  });
}

function waitForSelector(selector, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const existing = document.querySelector(selector);
    if (existing) return resolve(existing);
    const obs = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        obs.disconnect();
        resolve(el);
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { obs.disconnect(); resolve(null); }, timeoutMs);
  });
}

(function () {
  'use strict';

  const storedKey = GM_getValue(KEY_API, '');
  if (!storedKey) {
    console.warn('[TAPT] No API key set. Use script menu → "Set Torn API key".');
    return;
  }

  const initialTitle = document.title;
  const userId = safeGetUserIdFromUrl();
  console.info('[TAPT] Detected user2ID:', userId);

  const timeMode = (GM_getValue(KEY_MODE, DEFAULT_MODE) || 'local').toLowerCase();
  console.info('[TAPT] Using time mode:', timeMode.toUpperCase());

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
      untilTCT:   new Date(until * 1000).toLocaleString('en-US', { timeZone: 'UTC' }),
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

    // wait briefly; else header; else overlay on body
    let parent = await waitForSelector(DIALOG_SELECTOR, 2500);
    let overlay = false;

    if (parent) {
      console.info('[TAPT] Mount target found (preferred):', DIALOG_SELECTOR);
    } else {
      parent = document.querySelector(HEADER_SELECTOR);
      if (parent) {
        console.info('[TAPT] Preferred not found; mounting to header:', HEADER_SELECTOR);
      } else {
        parent = document.body;
        overlay = true;
        console.warn('[TAPT] Neither preferred nor header found; using fixed overlay on body.');
      }
    }

    parent.appendChild(wrapper);
    if (overlay) applyOverlayStyle(wrapper);

    //  move to dialogButtons when it appears
    //  reattach if wrapper gets detached during SPA re-renders
    const anchorObserver = new MutationObserver(() => {
      // move to dialogButtons if available and not already there
      const dlg = document.querySelector(DIALOG_SELECTOR);
      if (dlg && wrapper.parentElement !== dlg) {
        try {
          clearOverlayStyle(wrapper);
          dlg.appendChild(wrapper);
          console.info('[TAPT] Moved timer to preferred mount:', DIALOG_SELECTOR);
        } catch {}
      }
      // if wrapper somehow got removed, re-attach to best target
      if (!document.contains(wrapper)) {
        const best = document.querySelector(DIALOG_SELECTOR)
                  || document.querySelector(HEADER_SELECTOR)
                  || document.body;
        if (best === document.body) applyOverlayStyle(wrapper);
        else clearOverlayStyle(wrapper);
        try { best.appendChild(wrapper); } catch {}
        console.info('[TAPT] Reattached timer to:', best === document.body ? 'body (overlay)' : (best === document.querySelector(HEADER_SELECTOR) ? 'header' : 'dialogButtons'));
      }
    });
    anchorObserver.observe(document.body, { childList: true, subtree: true });

    const updateUI = () => {
      const remainingMs = (until * 1000) - Date.now();
      wrapper.innerHTML = renderInfo(until, timeMode);
      if (remainingMs > 0) {
        document.title = `${fmtTimeLeft(until)} | ${name}`;
      } else {
        clearInterval(tickInterval);
        anchorObserver.disconnect();
        document.title = initialTitle;
      }
    };

    updateUI();
    tickInterval = setInterval(updateUI, 1000);
  })();

  window.addEventListener('beforeunload', () => {
    if (tickInterval) clearInterval(tickInterval);
  });
})();
