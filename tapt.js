// ==UserScript==
// @name        Torn Attack Page Timers (TAPT)
// @namespace   https://github.com/MWTBDLTR/torn-scripts/
// @version     1.5.0
// @description Displays hospital timers on the attack page (rules-compliant; CORS-safe; menu for API key; Local/TCT time)
// @author      MrChurch
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
const KEY_API = 'tapt_api_key';
const KEY_MODE = 'tapt_time_mode';
const DEFAULT_MODE = 'local';

function setApiKeyInteractive() {
  const current = GM_getValue(KEY_API, '');
  const entered = prompt('Enter your Torn API key (User key with Basic read access):', current || '');
  if (entered !== null) {
    const trimmed = entered.trim();
    if (trimmed) {
      GM_setValue(KEY_API, trimmed);
      alert('Saved Torn API key. Reloading...');
      location.reload();
    } else {
      GM_deleteValue(KEY_API);
      alert('Cleared Torn API key. Reloading...');
      location.reload();
    }
  }
}

function setTimeMode(mode) {
  const normalized = (mode === 'tct') ? 'tct' : 'local';
  GM_setValue(KEY_MODE, normalized);
  alert(`Time display set to: ${normalized.toUpperCase()}. Reloading...`);
  location.reload();
}

try {
  GM_registerMenuCommand('Set Torn API key', setApiKeyInteractive);
  const currentMode = (GM_getValue(KEY_MODE, DEFAULT_MODE) || 'local').toLowerCase();
  const label = currentMode === 'tct' ? 'Torn Time (TCT)' : 'Local Time';
  GM_registerMenuCommand(`Time display (current: ${label}) → Set LOCAL`, () => setTimeMode('local'));
  GM_registerMenuCommand(`Time display (current: ${label}) → Set TCT`, () => setTimeMode('tct'));
} catch (e) {
  console.warn('[TAPT] Menu commands not supported:', e);
}

// *** NEW: Encapsulated CSS for styling to avoid conflicts ***
function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
        .tapt-wrapper {
            margin-top: 8px;
            font-size: 13px;
            line-height: 1.25;
            color: #fff;
            padding: 8px 10px;
            border-radius: 10px;
            background: rgba(0,0,0,0.6);
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        }
        .tapt-wrapper.tapt-mounted-inline {
            /* Less obtrusive styling when mounted inside a page element */
            color: inherit;
            padding: 0;
            background: none;
            box-shadow: none;
        }
        .tapt-wrapper.tapt-mounted-overlay {
            /* Overlay styling for fallback */
            position: fixed;
            top: 10px;
            right: 12px;
            z-index: 9999;
        }
        .tapt-time-left.tapt-under-minute {
            color: #98FB98; /* PaleGreen */
            font-weight: bold;
        }
        .tapt-error {
            color: #FF7F7F; /* Light Coral */
            font-style: italic;
        }
    `;
    document.head.appendChild(style);
}

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
  const options = {
    hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true
  };
  if (timeMode === 'tct') {
    return {
      label: 'TCT',
      time: d.toLocaleTimeString('en-US', { ...options, timeZone: 'UTC' })
    };
  }
  return {
    label: 'Local',
    time: d.toLocaleTimeString('en-US', options)
  };
}

function renderTimerInfo(untilEpochSec, timeMode) {
  const secondsLeft = Math.floor(((untilEpochSec * 1000) - Date.now()) / 1000);
  const underMinute = secondsLeft <= 60;
  const { time, label } = formatOutTime(untilEpochSec, timeMode);

  return `
    <div>Coming out at ${time} <span style="opacity:.8">(${label})</span></div>
    <div>in <span class="tapt-time-left ${underMinute ? 'tapt-under-minute' : ''}">${fmtTimeLeft(untilEpochSec)}</span></div>
  `;
}

// *** NEW: Renders an error message in the UI ***
function renderErrorInfo(message) {
    return `<div class="tapt-error">TAPT: ${message}</div>`;
}

function safeGetUserIdFromUrl() {
  const m = location.href.match(/user2ID=(\d+)/i);
  return m ? m[1] : null;
}

function gmRequestJson(url) {
  return new Promise((resolve) => {
    if (typeof GM_xmlhttpRequest === 'function') {
      GM_xmlhttpRequest({
        method: 'GET', url, headers: { 'Accept': 'application/json' },
        onload: (res) => {
          try { resolve(JSON.parse(res.responseText || '{}')); }
          catch (e) { resolve({ error: { code: -2, error: 'Bad JSON response' } }); }
        },
        onerror: () => resolve({ error: { code: -1, error: 'Network error' } }),
        ontimeout: () => resolve({ error: { code: -1, error: 'Request timeout' } }),
      });
    } else {
      fetch(url, { credentials: 'omit', mode: 'cors' })
        .then(r => r.json()).then(resolve)
        .catch(() => resolve({ error: { code: -1, error: 'Network error (fetch)' } }));
    }
  });
}

async function getProfile(userId, apiKey) {
  const url = `https://api.torn.com/user/${userId}?selections=profile&key=${encodeURIComponent(apiKey)}&comment=tapt_v1.5.0`;
  return gmRequestJson(url);
}

function waitForSelector(selector, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const existing = document.querySelector(selector);
    if (existing) return resolve(existing);
    const obs = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) { obs.disconnect(); resolve(el); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { obs.disconnect(); resolve(null); }, timeoutMs);
  });
}


(async function main() {
  'use strict';

  const DIALOG_SELECTOR = '[class*="dialogButtons"]';
  const HEADER_SELECTOR = '[class*="header"]';
  let tickInterval = null;
  let anchorObserver = null;

  // *** NEW: Cleanup function to stop observers and intervals ***
  const cleanup = () => {
    if (tickInterval) clearInterval(tickInterval);
    if (anchorObserver) anchorObserver.disconnect();
    tickInterval = null;
    anchorObserver = null;
    document.title = initialTitle;
  };

  const storedKey = GM_getValue(KEY_API, '');
  if (!storedKey) {
    console.warn('[TAPT] No API key set. Use script menu → "Set Torn API key".');
    return;
  }

  const initialTitle = document.title;
  const userId = safeGetUserIdFromUrl();
  if (!userId) {
    console.warn('[TAPT] Unable to detect user2ID in URL.');
    return;
  }

  const timeMode = (GM_getValue(KEY_MODE, DEFAULT_MODE) || 'local').toLowerCase();

  injectStyles(); // Inject our isolated CSS
  const wrapper = document.createElement('div');
  wrapper.className = 'tapt-wrapper'; // Use class instead of inline styles

  // Function to attach the wrapper to the best available parent
  const attachWrapper = () => {
      const preferred = document.querySelector(DIALOG_SELECTOR);
      const fallback = document.querySelector(HEADER_SELECTOR);
      const parent = preferred || fallback || document.body;

      // Add/remove classes to switch between inline and overlay styles
      if (parent === document.body) {
          wrapper.classList.add('tapt-mounted-overlay');
          wrapper.classList.remove('tapt-mounted-inline');
      } else {
          wrapper.classList.add('tapt-mounted-inline');
          wrapper.classList.remove('tapt-mounted-overlay');
      }
      parent.appendChild(wrapper);
      return parent;
  };

  attachWrapper();

  // This observer ensures the timer stays attached and moves to the best spot
  anchorObserver = new MutationObserver(() => {
    const preferred = document.querySelector(DIALOG_SELECTOR);
    // Move to preferred mount if it appears and we're not already there
    if (preferred && wrapper.parentElement !== preferred) {
        attachWrapper();
    }
    // Re-attach if it gets removed from the DOM
    if (!document.contains(wrapper)) {
        attachWrapper();
    }
  });
  anchorObserver.observe(document.body, { childList: true, subtree: true });


  const user = await getProfile(userId, storedKey);

  if (user?.error) {
    console.warn('[TAPT] API error:', user.error);
    wrapper.innerHTML = renderErrorInfo(user.error.error); // Show error in UI
    return;
  }

  const name = user?.name || 'Player';
  const status = user?.status;
  if (!status || typeof status.state !== 'string') {
    console.warn('[TAPT] Missing status in profile payload:', user);
    wrapper.innerHTML = renderErrorInfo('Invalid profile data.'); // Show error in UI
    return;
  }

  const inHospital = status.state.toLowerCase() === 'hospital';
  const until = Number(status.until);

  if (!inHospital) {
    console.info('[TAPT] Target not in hospital.');
    wrapper.remove(); // Remove the element if not needed
    cleanup();
    return;
  }
  if (!Number.isFinite(until) || until <= 0) {
    console.warn('[TAPT] Invalid/zero hospital "until" timestamp.');
    wrapper.innerHTML = renderErrorInfo('Invalid hospital time.'); // Show error in UI
    cleanup();
    return;
  }

  const updateUI = () => {
    const remainingMs = (until * 1000) - Date.now();
    wrapper.innerHTML = renderTimerInfo(until, timeMode);

    if (remainingMs > 0) {
      document.title = `${fmtTimeLeft(until)} | ${name}`;
    } else {
      document.title = initialTitle; // Restore title
      cleanup(); // Stop interval and observer
    }
  };

  updateUI();
  tickInterval = setInterval(updateUI, 1000);

  window.addEventListener('beforeunload', cleanup);
})();
