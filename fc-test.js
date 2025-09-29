// ==UserScript==
// @name         Torn Chain ETA (Threshold Forecaster)
// @namespace    https://github.com/MWTBDLTR/torn-scripts/
// @version      1.0.0
// @description  Estimates when chain thresholds (10,50,100,250,1000,...) will be reached using recent hits/min from Torn API.
// @author       MrChurch
// @match        https://www.torn.com/*
// @connect      api.torn.com
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  "use strict";

  /**********************
   * User-config (saved)
   **********************/
  const DEF_THRESHOLDS = [10, 50, 100, 250, 1000, 2500, 5000];
  const STATE = {
    apiKey: GM_getValue("torn_chain_eta_apiKey", ""),
    thresholds: GM_getValue("torn_chain_eta_thresholds", DEF_THRESHOLDS),
    pollSec: GM_getValue("torn_chain_eta_pollSec", 15), // API poll interval
    rateWindowMin: GM_getValue("torn_chain_eta_rateWindowMin", 5), // Minutes of history to compute hits/min
    historyMaxMin: 15, // cap stored history (minutes)
  };

  GM_registerMenuCommand("Torn Chain ETA → Configure…", configure);
  GM_registerMenuCommand("Torn Chain ETA → Reset history", () => {
    HISTORY.splice(0, HISTORY.length);
    notify("History reset.");
  });

  function configure() {
    const k = prompt("Enter your Torn API key (saved locally):", STATE.apiKey || "");
    if (k === null) return;
    STATE.apiKey = (k || "").trim();
    GM_setValue("torn_chain_eta_apiKey", STATE.apiKey);

    const t = prompt(
      `Enter comma-separated thresholds (current: ${STATE.thresholds.join(", ")}):`,
      STATE.thresholds.join(", ")
    );
    if (t !== null) {
      const arr = (t || "")
        .split(",")
        .map(s => parseInt(s.trim(), 10))
        .filter(n => Number.isFinite(n) && n > 0)
        .sort((a, b) => a - b);
      if (arr.length) {
        STATE.thresholds = arr;
        GM_setValue("torn_chain_eta_thresholds", STATE.thresholds);
      }
    }

    const p = prompt(`API poll interval (seconds):`, String(STATE.pollSec));
    if (p !== null) {
      const val = Math.max(5, Math.min(60, parseInt(p, 10) || STATE.pollSec));
      STATE.pollSec = val;
      GM_setValue("torn_chain_eta_pollSec", STATE.pollSec);
    }

    const w = prompt(`Rate window (minutes, for hits/min):`, String(STATE.rateWindowMin));
    if (w !== null) {
      const val = Math.max(1, Math.min(STATE.historyMaxMin, parseInt(w, 10) || STATE.rateWindowMin));
      STATE.rateWindowMin = val;
      GM_setValue("torn_chain_eta_rateWindowMin", STATE.rateWindowMin);
    }

    notify("Settings saved. They’ll take effect on the next update.");
  }

  /**********************
   * DOM + Styles
   **********************/
  GM_addStyle(`
    .tce-wrap {
      position: fixed;
      top: 88px;
      right: 18px;
      z-index: 99999;
      width: 320px;
      background: #101418;
      color: #e7edf3;
      font: 13px/1.35 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      border: 1px solid #27313a;
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.35);
      user-select: none;
    }
    .tce-header {
      cursor: move;
      padding: 10px 12px;
      font-weight: 600;
      background: #0c1116;
      border-bottom: 1px solid #22303a;
      display: flex; align-items: center; gap: 8px; justify-content: space-between;
    }
    .tce-badge {
      font-size: 11px; padding: 2px 6px; border-radius: 999px; background: #1f2a33; color: #9bd2ff;
    }
    .tce-body { padding: 10px 12px; }
    .tce-grid { width:100%; border-collapse: collapse; margin-top: 8px; }
    .tce-grid th, .tce-grid td {
      padding: 6px 6px; text-align: left; border-bottom: 1px solid #1c252e; white-space: nowrap;
    }
    .tce-grid th { font-size: 11px; color: #a9b7c6; text-transform: uppercase; letter-spacing: .04em; }
    .tce-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .tce-row-dim td { color: #7f8b96; }
    .tce-footer { padding: 8px 12px 10px; display:flex; gap:8px; justify-content: space-between; align-items:center; }
    .tce-btn {
      background:#16202a; border:1px solid #27313a; color:#cfe7ff; padding:6px 8px; border-radius:8px; cursor:pointer;
    }
    .tce-btn:hover { background:#1a2631; }
    .tce-warn { color: #ffd27d; }
    .tce-good { color: #9cffb3; }
    .tce-bad  { color: #ff9a9a; }
    .tce-small { font-size: 11px; color: #9aa8b6; }
  `);

  const el = document.createElement("div");
  el.className = "tce-wrap";
  el.innerHTML = `
    <div class="tce-header" id="tceDrag">
      <div>Chain ETA <span class="tce-badge" id="tceStatus">init…</span></div>
      <div>
        <button class="tce-btn" id="tceRefresh">Refresh</button>
      </div>
    </div>
    <div class="tce-body">
      <div><b>Current chain:</b> <span class="tce-mono" id="tceCurrent">—</span></div>
      <div><b>Hits/min (avg ${STATE.rateWindowMin}m):</b> <span class="tce-mono" id="tceRate">—</span></div>
      <div><b>Timeout per hit:</b> <span class="tce-mono" id="tceTimeout">—</span></div>
      <div><b>Avg inter-hit:</b> <span class="tce-mono" id="tceInterHit">—</span> <span id="tceRisk" class="tce-small"></span></div>
      <table class="tce-grid" id="tceTable">
        <thead><tr><th>Threshold</th><th>ΔHits</th><th>ETA (clock)</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
    <div class="tce-footer">
      <span class="tce-small">Polling every ${STATE.pollSec}s</span>
      <div>
        <button class="tce-btn" id="tceCfg">Settings</button>
      </div>
    </div>
  `;
  document.body.appendChild(el);

  // Draggable header
  (function makeDraggable(handleId, wrap) {
    const handle = el.querySelector("#" + handleId);
    let dragging = false, sx=0, sy=0, ox=0, oy=0;
    handle.addEventListener("mousedown", (e)=>{ dragging=true; sx=e.clientX; sy=e.clientY; const r=wrap.getBoundingClientRect(); ox=r.left; oy=r.top; e.preventDefault(); });
    window.addEventListener("mousemove",(e)=>{
      if(!dragging) return;
      const dx=e.clientX-sx, dy=e.clientY-sy;
      wrap.style.left = Math.max(0, ox+dx) + "px";
      wrap.style.top  = Math.max(0, oy+dy) + "px";
      wrap.style.right = "auto";
      wrap.style.position="fixed";
    });
    window.addEventListener("mouseup", ()=> dragging=false);
  })("tceDrag", el);

  // UI refs
  const refs = {
    status:    el.querySelector("#tceStatus"),
    current:   el.querySelector("#tceCurrent"),
    rate:      el.querySelector("#tceRate"),
    timeout:   el.querySelector("#tceTimeout"),
    interHit:  el.querySelector("#tceInterHit"),
    risk:      el.querySelector("#tceRisk"),
    tableBody: el.querySelector("#tceTable tbody"),
    refresh:   el.querySelector("#tceRefresh"),
    cfg:       el.querySelector("#tceCfg"),
  };

  refs.refresh.addEventListener("click", tickNow);
  refs.cfg.addEventListener("click", configure);

  /**********************
   * Data + Logic
   **********************/
  const HISTORY = []; // {t, chain}
  let pollTimer = null;

  function notify(msg) {
    refs.status.textContent = msg;
  }

  function fmtClock(ts) {
    const d = new Date(ts);
    const hh = d.getHours().toString().padStart(2, "0");
    const mm = d.getMinutes().toString().padStart(2, "0");
    return `${hh}:${mm}`;
  }
  function fmtDelta(mins) {
    if (!Number.isFinite(mins)) return "—";
    if (mins < 1) return `${Math.round(mins * 60)}s`;
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return h ? `${h}h ${m}m` : `${m}m`;
  }

  function pruneHistory() {
    const cutoff = Date.now() - STATE.historyMaxMin * 60 * 1000;
    while (HISTORY.length && HISTORY[0].t < cutoff) HISTORY.shift();
  }

  function computeRate() {
    pruneHistory();
    const windowMs = STATE.rateWindowMin * 60 * 1000;
    const now = Date.now();
    const startIdx = HISTORY.findIndex(pt => pt.t >= (now - windowMs));
    const slice = startIdx === -1 ? HISTORY.slice() : HISTORY.slice(startIdx);
    if (slice.length < 2) return 0;

    const dtMin = (slice[slice.length - 1].t - slice[0].t) / 60000;
    const dHits = (slice[slice.length - 1].chain - slice[0].chain);
    if (dtMin <= 0 || dHits <= 0) return 0;
    return dHits / dtMin; // hits/min
  }

  function estimate(ctr, rate, thresholds) {
    const rows = [];
    const now = Date.now();
    thresholds.forEach(th => {
      const delta = th - ctr;
      if (delta <= 0) {
        rows.push({ th, delta: 0, etaMin: 0, clock: "reached" });
      } else if (rate > 0) {
        const etaMin = delta / rate;
        rows.push({ th, delta, etaMin, clock: fmtClock(now + etaMin * 60000) });
      } else {
        rows.push({ th, delta, etaMin: Infinity, clock: "—" });
      }
    });
    return rows;
  }

  function setUI({ chainCurrent, timeoutSec, rateHPM }) {
    refs.current.textContent = String(chainCurrent);
    refs.rate.textContent = rateHPM ? rateHPM.toFixed(2) : "0.00";
    refs.timeout.textContent = timeoutSec ? `${timeoutSec}s` : "—";

    // Average inter-hit time from current rate
    const interHitSec = rateHPM > 0 ? (60 / rateHPM) : Infinity;
    refs.interHit.textContent = Number.isFinite(interHitSec) ? `${Math.round(interHitSec)}s` : "—";

    // Risk advisory: if average inter-hit exceeds timeout
    refs.risk.textContent = "";
    refs.risk.className = "tce-small";
    if (timeoutSec && Number.isFinite(interHitSec)) {
      if (interHitSec > timeoutSec) {
        refs.risk.textContent = " • ⚠ avg inter-hit > timeout (risk)";
        refs.risk.classList.add("tce-warn");
      } else {
        refs.risk.textContent = " • ok";
        refs.risk.classList.add("tce-good");
      }
    }

    // Table
    const rows = estimate(chainCurrent, rateHPM, STATE.thresholds);
    refs.tableBody.innerHTML = rows.map(r => {
      const dim = r.delta <= 0 ? " tce-row-dim" : "";
      return `<tr class="${dim}">
        <td class="tce-mono">${r.th}</td>
        <td class="tce-mono">${r.delta <= 0 ? "—" : r.delta}</td>
        <td class="tce-mono">${r.clock}${Number.isFinite(r.etaMin) && r.etaMin>0 ? ` (${fmtDelta(r.etaMin)})` : ""}</td>
      </tr>`;
    }).join("");
  }

  function tickNow() {
    if (!STATE.apiKey) {
      configure();
      if (!STATE.apiKey) {
        notify("API key required.");
        return;
      }
    }
    notify("updating…");
    fetchChain()
      .then(data => {
        notify("live");
        const { chainCurrent, timeoutSec } = data;
        HISTORY.push({ t: Date.now(), chain: chainCurrent });
        const rate = computeRate();
        setUI({ chainCurrent, timeoutSec, rateHPM: rate });
      })
      .catch(err => {
        console.error(err);
        notify("error");
      });
  }

  function startPolling() {
    clearInterval(pollTimer);
    pollTimer = setInterval(tickNow, STATE.pollSec * 1000);
    tickNow();
  }

  /**********************
   * API (Faction → chain)
   * Endpoint: https://api.torn.com/faction/?selections=chain&key=YOUR_KEY
   * We only rely on: chain.current and chain.timeout (seconds).
   **********************/
  function fetchChain() {
    const url = `https://api.torn.com/faction/?selections=chain&key=${encodeURIComponent(STATE.apiKey)}`;
    return httpGetJSON(url).then(json => {
      if (json && json.error) throw new Error(`${json.error.code}: ${json.error.error}`);
      // Defensive parsing: accept a few plausible shapes
      let chainCurrent = undefined, timeoutSec = undefined;

      // Common/expected layout
      if (json && json.chain) {
        chainCurrent = num(json.chain.current);
        timeoutSec   = num(json.chain.timeout);
        // Some responses may use time_left or cooldown—fall back if timeout is missing
        if (!Number.isFinite(timeoutSec) && Number.isFinite(num(json.chain.time_left))) {
          timeoutSec = num(json.chain.time_left);
        }
      }
      // Fallbacks if API surface differs
      if (!Number.isFinite(chainCurrent) && Number.isFinite(num(json.current))) {
        chainCurrent = num(json.current);
      }
      if (!Number.isFinite(timeoutSec) && Number.isFinite(num(json.timeout))) {
        timeoutSec = num(json.timeout);
      }

      if (!Number.isFinite(chainCurrent)) throw new Error("Missing chain.current in API response.");
      return { chainCurrent, timeoutSec: Number.isFinite(timeoutSec) ? timeoutSec : null, raw: json };
    });
  }

  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  }

  function httpGetJSON(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        url,
        method: "GET",
        headers: { "Accept": "application/json" },
        onload: (res) => {
          try {
            if (res.status < 200 || res.status >= 300) {
              reject(new Error(`HTTP ${res.status}: ${res.responseText?.slice(0, 200) || ""}`));
              return;
            }
            const json = JSON.parse(res.responseText || "{}");
            resolve(json);
          } catch (e) {
            reject(e);
          }
        },
        onerror: (e) => reject(new Error("Network error")),
        ontimeout: () => reject(new Error("Request timed out")),
        timeout: 15000,
      });
    });
  }

  // kick off
  startPolling();
})();
