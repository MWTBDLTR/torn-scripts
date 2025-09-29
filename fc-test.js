// ==UserScript==
// @name         Torn Chain Tools: Live ETA + History
// @namespace    https://github.com/MWTBDLTR/torn-scripts/
// @version      1.0.6
// @description  Live chain ETAs, history browser with filters/sort/paging/CSV, chain report viewer, and per-hit timeline chart (req fac api acceess). Caches to IndexedDB.
// @author       MrChurch
// @match        https://www.torn.com/*
// @connect      api.torn.com
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @require      https://cdn.jsdelivr.net/npm/chart.js
// ==/UserScript==

(function () {
  "use strict";

  /**********************
   * Persistent settings
   **********************/
  const DEF_THRESHOLDS = [10, 50, 100, 250, 1000, 2500, 5000];
  const STATE = {
    apiKey: GM_getValue("torn_chain_eta_apiKey", ""),
    usePublicKey: GM_getValue("torn_chain_eta_usePublicKey", false),
    factionIdOverride: GM_getValue("torn_chain_eta_factionIdOverride", ""),
    thresholds: GM_getValue("torn_chain_eta_thresholds", DEF_THRESHOLDS),
    pollSec: GM_getValue("torn_chain_eta_pollSec", 15),
    rateWindowMin: GM_getValue("torn_chain_eta_rateWindowMin", 5),
    historyMaxMin: 15,
    maxAttackPages: GM_getValue("torn_chain_eta_maxAttackPages", 30), // 30k attacks safety cap
    chainsTTLms: GM_getValue("torn_chain_eta_chainsTTLms", 2 * 60 * 1000), // 2 minutes
  };

  GM_registerMenuCommand("Torn Chain → Configure…", configure);
  GM_registerMenuCommand("Torn Chain → Test API / Key", testKey);
  GM_registerMenuCommand("Torn Chain → Reset live rate history", () => { HISTORY.length = 0; toast("Live rate history reset."); });
  GM_registerMenuCommand("Torn Chain → Clear Chain Cache", async () => { await cacheClearAll(); toast("Cache cleared."); });
  GM_registerMenuCommand("Torn Chain → Cache stats", async () => {
    const s = await cacheStats();
    alert(`Cache objects: chainsList=${s.chainsList}, chainReports=${s.chainReports}, attacks=${s.attacks}\nApprox bytes: ~${s.approxBytes.toLocaleString()}`);
  });

  function configure() {
    const k = prompt('Enter your Torn API key (type "public" to use public mode):', STATE.apiKey || "");
    if (k === null) return;
    STATE.apiKey = (k || "").trim();
    GM_setValue("torn_chain_eta_apiKey", STATE.apiKey);
    STATE.usePublicKey = (STATE.apiKey.toLowerCase() === "public");
    GM_setValue("torn_chain_eta_usePublicKey", STATE.usePublicKey);

    const fid = prompt("Faction ID (REQUIRED in public mode; optional otherwise):", STATE.factionIdOverride || "");
    if (fid !== null) {
      STATE.factionIdOverride = (fid || "").trim();
      GM_setValue("torn_chain_eta_factionIdOverride", STATE.factionIdOverride);
    }

    const t = prompt(`Comma-separated thresholds:`, STATE.thresholds.join(", "));
    if (t !== null) {
      const arr = (t || "")
        .split(",")
        .map(s => parseInt(s.trim(), 10))
        .filter(n => Number.isFinite(n) && n > 0)
        .sort((a, b) => a - b);
      if (arr.length) { STATE.thresholds = arr; GM_setValue("torn_chain_eta_thresholds", STATE.thresholds); }
    }

    const p = prompt(`API poll interval (5–60s):`, String(STATE.pollSec));
    if (p !== null) {
      const val = clampInt(parseInt(p, 10), 5, 60, STATE.pollSec);
      STATE.pollSec = val; GM_setValue("torn_chain_eta_pollSec", STATE.pollSec);
    }

    const w = prompt(`Rate window (1–${STATE.historyMaxMin} minutes):`, String(STATE.rateWindowMin));
    if (w !== null) {
      const val = clampInt(parseInt(w, 10), 1, STATE.historyMaxMin, STATE.rateWindowMin);
      STATE.rateWindowMin = val; GM_setValue("torn_chain_eta_rateWindowMin", STATE.rateWindowMin);
    }

    const mp = prompt(`Max attacks pages per chain (safety cap, default ${STATE.maxAttackPages}, 10–100):`, String(STATE.maxAttackPages));
    if (mp !== null) {
      const val = clampInt(parseInt(mp, 10), 10, 100, STATE.maxAttackPages);
      STATE.maxAttackPages = val; GM_setValue("torn_chain_eta_maxAttackPages", STATE.maxAttackPages);
    }

    const ct = prompt(`Chains list cache TTL in minutes (default 2):`, String(STATE.chainsTTLms / 60000));
    if (ct !== null) {
      const min = clampInt(parseInt(ct, 10), 1, 15, STATE.chainsTTLms / 60000);
      STATE.chainsTTLms = min * 60000;
      GM_setValue("torn_chain_eta_chainsTTLms", STATE.chainsTTLms);
    }

    toast("Settings saved.");
  }

  async function testKey() {
    try {
      if (isPublicMode()) {
        if (!STATE.factionIdOverride) throw new Error("Public mode: set Faction ID in Settings.");
        await httpGetJSON(factionUrl("chain"));
        await httpGetJSON(factionUrl("chains"));
        alert(`Public mode OK.\nFaction ID: ${STATE.factionIdOverride}\nNote: per-hit attacks are not available in public mode (chart will be hidden).`);
        return;
      }
      const u = await fetchUserProfile();
      alert(`Key OK.\nPlayer: ${u.name} [${u.player_id}]\nFaction: ${u.faction_name || "(none)"} (${u.faction_id || 0})`);
    } catch (e) {
      alert(`Key test failed: ${e.message || e}`);
    }
  }

  function clampInt(n, lo, hi, dflt) {
    if (!Number.isFinite(n)) return dflt;
    return Math.max(lo, Math.min(hi, n));
  }

  /**********************
   * Styles + DOM
   **********************/
  GM_addStyle(`
    .tce-wrap { position: fixed; top: 88px; right: 18px; z-index: 99999; width: 420px; background:#0f1419; color:#eaf2ff; font:13px/1.35 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; border:1px solid #2a3641; border-radius:12px; box-shadow:0 8px 24px rgba(0,0,0,.35); user-select:none; }
    .tce-header { cursor:move; padding:10px 12px; font-weight:600; background:#0b1015; border-bottom:1px solid #1e2a34; display:flex; gap:8px; align-items:center; justify-content:space-between; }
    .tce-tabs { display:flex; gap:6px; }
    .tce-tab { background:#15202b; border:1px solid #27313a; color:#d9e7ff; padding:4px 8px; border-radius:8px; cursor:pointer; font-weight:600; }
    .tce-tab.active { background:#1b2733; }
    .tce-badge { font-size:11px; padding:2px 6px; border-radius:999px; background:#1f2a33; color:#bfe0ff; }
    .tce-body { padding:10px 12px; max-height: 66vh; overflow:auto; }
    .tce-grid { width:100%; border-collapse:collapse; }
    .tce-grid th, .tce-grid td { padding:8px 8px; text-align:left; border-bottom:1px solid #1c252e; white-space:nowrap; color:#eaf2ff; }
    .tce-grid th { font-size:11px; color:#e1ecff; text-transform:uppercase; letter-spacing:.04em; background:#0e1620; }
    .tce-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .tce-row-dim td { color:#b3c5d6; }
    .tce-small { font-size:11px; color:#c7d6e8; }
    .tce-footer { padding:8px 12px 10px; display:flex; gap:8px; justify-content:space-between; align-items:center; }
    .tce-btn { background:#16202a; border:1px solid #27313a; color:#eaf2ff; padding:6px 8px; border-radius:8px; cursor:pointer; }
    .tce-btn:hover { background:#1a2631; }
    .tce-warn { color:#ffd27d; }
    .tce-good { color:#baffc8; }
    .tce-bad  { color:#ffb3b3; }
    .tce-link { color:#bfe0ff; cursor:pointer; text-decoration:underline; }
    .tce-chart { width:100%; height: 260px; }
    .tce-hbox { display:flex; gap:8px; flex-wrap: wrap; }
    .tce-hbox > div { flex:1 1 48%; }
    .tce-muted { color:#c0d2e0; }

    /* History tab polish + higher contrast */
    .tce-toolbar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; margin:6px 0 8px; }
    .tce-toolbar input, .tce-toolbar select, .tce-toolbar button { background:#16202a; border:1px solid #27313a; color:#eaf2ff; padding:6px 8px; border-radius:8px; }
    .tce-toolbar input::placeholder { color:#b3c5d6; }
    .tce-table-container { max-height:48vh; overflow:auto; border:1px solid #1c252e; border-radius:10px; }
    .tce-grid thead th { position:sticky; top:0; background:#0e1620; z-index:1; }
    .tce-grid tr:hover td { background:#162334; }
    .tce-grid tr:nth-child(even) td { background:#101a24; }
    .tce-grid th.num, .tce-grid td.num { text-align:right; }
    .tce-grid td.dim { color:#a6b6c6; }
    .tce-actions { display:flex; gap:6px; align-items:center; justify-content:flex-end; }
    .tce-pager { display:flex; justify-content:space-between; align-items:center; margin-top:8px; }
    .tce-pager .info { font-size:11px; color:#c7d6e8; }
  `);

  const root = document.createElement("div");
  root.className = "tce-wrap";
  root.innerHTML = `
    <div class="tce-header" id="tceDrag">
      <div>Chain Tools <span class="tce-badge" id="tceStatus">init…</span></div>
      <div class="tce-tabs">
        <button class="tce-tab active" id="tabLive">Live</button>
        <button class="tce-tab" id="tabHist">History</button>
      </div>
    </div>
    <div class="tce-body">
      <div id="panelLive">
        <div class="tce-hbox">
          <div><b>Current chain:</b> <span class="tce-mono" id="tceCurrent">—</span></div>
          <div><b>Hits/min (avg <span id="tceWin">${STATE.rateWindowMin}</span>m):</b> <span class="tce-mono" id="tceRate">—</span></div>
        </div>
        <div class="tce-hbox">
          <div><b>Timeout per hit:</b> <span class="tce-mono" id="tceTimeout">—</span></div>
          <div><b>Avg inter-hit:</b> <span class="tce-mono" id="tceInterHit">—</span> <span id="tceRisk" class="tce-small"></span></div>
        </div>
        <table class="tce-grid" id="tceTable">
          <thead><tr><th>Threshold</th><th>ΔHits</th><th>ETA (clock)</th></tr></thead>
          <tbody></tbody>
        </table>
        <div class="tce-footer">
          <span class="tce-small">Polling every ${STATE.pollSec}s</span>
          <div>
            <button class="tce-btn" id="tceRefresh">Refresh</button>
            <button class="tce-btn" id="tceCfg">Settings</button>
          </div>
        </div>
      </div>

      <div id="panelHist" style="display:none">
        <div class="tce-toolbar">
          <input id="histSearch" type="text" placeholder="Search by chain ID…" style="flex:1 1 160px">
          <label class="tce-small">Min len <input id="histMinLen" type="number" min="0" value="0" style="width:80px"></label>
          <label class="tce-small">Sort
            <select id="histSort">
              <option value="end">End time</option>
              <option value="start">Start time</option>
              <option value="len">Length</option>
              <option value="respect">Respect</option>
              <option value="id">ID</option>
            </select>
          </label>
          <select id="histOrder">
            <option value="desc">Desc</option>
            <option value="asc">Asc</option>
          </select>
          <label class="tce-small">Page
            <select id="histPageSize">
              <option>10</option><option selected>20</option><option>50</option><option>100</option>
            </select>
          </label>
          <button class="tce-btn" id="btnReloadHist">Refresh</button>
          <button class="tce-btn" id="btnExportCSV">Export CSV</button>
          <button class="tce-btn" id="btnClearCache">Clear cache</button>
        </div>

        <div class="tce-table-container">
          <table class="tce-grid" id="histTable">
            <thead>
              <tr>
                <th>ID</th>
                <th>Start</th>
                <th>End</th>
                <th class="num">Duration</th>
                <th class="num">Len</th>
                <th class="num">Respect</th>
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </div>

        <div class="tce-pager">
          <div class="info" id="histInfo">—</div>
          <div class="tce-actions">
            <button class="tce-btn" id="histPrev">‹ Prev</button>
            <span class="tce-small" id="histPageLabel">Page 1/1</span>
            <button class="tce-btn" id="histNext">Next ›</button>
          </div>
        </div>

        <div id="histDetail" style="margin-top:10px; display:none">
          <hr style="border-color:#1c252e; margin:8px 0;">
          <div class="tce-hbox">
            <div><b>Chain:</b> <span class="tce-mono" id="hdId">—</span></div>
            <div><b>Window:</b> <span class="tce-mono" id="hdWindow">—</span></div>
          </div>
          <div class="tce-hbox">
            <div><b>Length:</b> <span class="tce-mono" id="hdLen">—</span></div>
            <div><b>Respect:</b> <span class="tce-mono" id="hdResp">—</span></div>
          </div>
          <div style="margin-top:8px">
            <canvas id="chainChart" class="tce-chart"></canvas>
          </div>
          <table class="tce-grid" id="hdThresholds">
            <thead><tr><th>Threshold</th><th>Reached at</th><th>Δ from start</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  // Draggable
  (function makeDraggable(handleId, wrap) {
    const handle = root.querySelector("#" + handleId);
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
  })("tceDrag", root);

  // UI refs
  const refs = {
    status: root.querySelector("#tceStatus"),
    tabLive: root.querySelector("#tabLive"),
    tabHist: root.querySelector("#tabHist"),
    panelLive: root.querySelector("#panelLive"),
    panelHist: root.querySelector("#panelHist"),
    // live
    current: root.querySelector("#tceCurrent"),
    rate: root.querySelector("#tceRate"),
    timeout: root.querySelector("#tceTimeout"),
    interHit: root.querySelector("#tceInterHit"),
    risk: root.querySelector("#tceRisk"),
    tableBody: root.querySelector("#tceTable tbody"),
    refresh: root.querySelector("#tceRefresh"),
    cfg: root.querySelector("#tceCfg"),
    tceWin: root.querySelector("#tceWin"),
    // history toolbar
    histSearch: root.querySelector("#histSearch"),
    histMinLen: root.querySelector("#histMinLen"),
    histSort: root.querySelector("#histSort"),
    histOrder: root.querySelector("#histOrder"),
    histPageSize: root.querySelector("#histPageSize"),
    btnReloadHist: root.querySelector("#btnReloadHist"),
    btnExportCSV: root.querySelector("#btnExportCSV"),
    btnClearCache: root.querySelector("#btnClearCache"),
    // history table/pager
    histTableBody: root.querySelector("#histTable tbody"),
    histInfo: root.querySelector("#histInfo"),
    histPrev: root.querySelector("#histPrev"),
    histNext: root.querySelector("#histNext"),
    histPageLabel: root.querySelector("#histPageLabel"),
    // detail
    histDetail: root.querySelector("#histDetail"),
    hdId: root.querySelector("#hdId"),
    hdWindow: root.querySelector("#hdWindow"),
    hdLen: root.querySelector("#hdLen"),
    hdResp: root.querySelector("#hdResp"),
    hdThresholdsBody: root.querySelector("#hdThresholds tbody"),
    chartCanvas: root.querySelector("#chainChart"),
  };

  // Auto-width per tab
  function adjustPanelWidth(which){
    if (which === "hist") {
      const w = Math.min(Math.max(760, Math.floor(window.innerWidth * 0.9)), 1000);
      root.style.width = `${w}px`;
    } else {
      root.style.width = "420px";
    }
  }
  window.addEventListener("resize", () => {
    if (refs.panelHist.style.display !== "none") adjustPanelWidth("hist");
  });

  // Tabs
  refs.tabLive.addEventListener("click", () => switchTab("live"));
  refs.tabHist.addEventListener("click", () => switchTab("hist"));
  function switchTab(which) {
    const live = which === "live";
    refs.tabLive.classList.toggle("active", live);
    refs.tabHist.classList.toggle("active", !live);
    refs.panelLive.style.display = live ? "" : "none";
    refs.panelHist.style.display = live ? "none" : "";
    adjustPanelWidth(live ? "live" : "hist");
    if (!live) loadHistory();
  }

  refs.refresh.addEventListener("click", tickNow);
  refs.cfg.addEventListener("click", configure);
  refs.btnReloadHist.addEventListener("click", () => loadHistory(true));

  // History controls
  refs.histSearch.addEventListener("input", applyHistoryFilters);
  refs.histMinLen.addEventListener("change", applyHistoryFilters);
  refs.histSort.addEventListener("change", applyHistoryFilters);
  refs.histOrder.addEventListener("change", applyHistoryFilters);
  refs.histPageSize.addEventListener("change", () => { histPage = 1; renderHistoryTable(); });
  refs.histPrev.addEventListener("click", () => { if (histPage > 1){ histPage--; renderHistoryTable(); }});
  refs.histNext.addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(HIST_VIEW.length / getPageSize()));
    if (histPage < totalPages){ histPage++; renderHistoryTable(); }
  });
  refs.btnExportCSV.addEventListener("click", exportHistoryCSV);
  refs.btnClearCache.addEventListener("click", async () => { await cacheClearAll(); toast("Cache cleared."); });

  /**********************
   * Live stats logic
   **********************/
  const HISTORY = []; // {t, chain}
  let pollTimer = null;

  function toast(msg) { refs.status.textContent = msg; }
  function fmtClock(ts) {
    const d = new Date(ts);
    const hh = d.getHours().toString().padStart(2, "0");
    const mm = d.getMinutes().toString().padStart(2, "0");
    return `${hh}:${mm}`;
  }
  function fmtTime(ts) { const d = new Date(ts * 1000); return d.toLocaleString(); }
  function fmtDeltaMin(mins) {
    if (!Number.isFinite(mins)) return "—";
    if (mins < 1) return `${Math.round(mins * 60)}s`;
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return h ? `${h}h ${m}m` : `${m}m`;
  }
  function fmtInt(n){ return Number.isFinite(+n) ? Number(n).toLocaleString() : "—"; }
  function fmtRespect(r){ return Number.isFinite(+r) ? Number(r).toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2}) : "—"; }
  function fmtDur(sec){
    if (!Number.isFinite(sec) || sec < 0) return "—";
    const h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60);
    const s = Math.floor(sec%60);
    if (h) return `${h}h ${m}m`;
    if (m) return `${m}m ${s}s`;
    return `${s}s`;
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
    return dHits / dtMin;
  }
  function estimateRows(current, rate, thresholds) {
    const now = Date.now();
    return thresholds.map(th => {
      const delta = th - current;
      if (delta <= 0) return { th, delta: 0, etaMin: 0, clock: "reached" };
      if (rate > 0) {
        const etaMin = delta / rate;
        return { th, delta, etaMin, clock: fmtClock(now + etaMin * 60000) };
      }
      return { th, delta, etaMin: Infinity, clock: "—" };
    });
  }
  function setLiveUI({ chainCurrent, timeoutSec, rateHPM }) {
    refs.current.textContent = String(chainCurrent);
    refs.rate.textContent = rateHPM ? rateHPM.toFixed(2) : "0.00";
    refs.timeout.textContent = timeoutSec ? `${timeoutSec}s` : "—";
    refs.tceWin.textContent = String(STATE.rateWindowMin);
    const interHitSec = rateHPM > 0 ? (60 / rateHPM) : Infinity;
    refs.interHit.textContent = Number.isFinite(interHitSec) ? `${Math.round(interHitSec)}s` : "—";
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
    const rows = estimateRows(chainCurrent, rateHPM, STATE.thresholds);
    refs.tableBody.innerHTML = rows.map(r => {
      const dim = r.delta <= 0 ? " tce-row-dim" : "";
      return `<tr class="${dim}">
        <td class="tce-mono">${r.th}</td>
        <td class="tce-mono">${r.delta <= 0 ? "—" : r.delta}</td>
        <td class="tce-mono">${r.clock}${Number.isFinite(r.etaMin) && r.etaMin>0 ? ` (${fmtDeltaMin(r.etaMin)})` : ""}</td>
      </tr>`;
    }).join("");
  }
  function tickNow() {
    if (!ensureKey()) return;
    toast("updating…");
    fetchChain().then(data => {
      toast("live");
      const { chainCurrent, timeoutSec } = data;
      HISTORY.push({ t: Date.now(), chain: chainCurrent });
      const rate = computeRate();
      setLiveUI({ chainCurrent, timeoutSec, rateHPM: rate });
    }).catch(err => { console.error(err); toast(err.message || "error"); });
  }
  function startPolling() { clearInterval(pollTimer); pollTimer = setInterval(tickNow, STATE.pollSec * 1000); tickNow(); }

  /**********************
   * History browser (with caching + polished UI)
   **********************/
  let chart = null;
  let HIST_ALL = [];   // normalized source
  let HIST_VIEW = [];  // filtered + sorted
  let histPage = 1;

  function getPageSize(){ return parseInt(refs.histPageSize.value, 10) || 20; }

  async function loadHistory(forceRefetch = false) {
    if (!ensureKey()) return;
    toast("loading history…");
    try {
      const list = await cachedFetchChains(forceRefetch);
      HIST_ALL = list.map(row => {
        const id = Number(row.chain_id || row.id); // normalized in fetchChains()
        const start = Number(row.start || 0);
        const end = Number(row.end || 0);
        const len = Number(row.chain || row.length || row.hits || 0);
        const respect = Number(row.respect || 0);
        return { id, start, end, len, respect, dur: end && start ? (end - start) : 0 };
      });
      applyHistoryFilters();
      toast("history ready");
    } catch (e) {
      console.error(e);
      toast(e.message || "error");
    }
  }

  function applyHistoryFilters(){
    const q = (refs.histSearch.value || "").trim().toLowerCase();
    const minLen = Number(refs.histMinLen.value || 0);
    const sortKey = refs.histSort.value;   // 'end' | 'start' | 'len' | 'respect' | 'id'
    const order = refs.histOrder.value;    // 'asc' | 'desc'

    // filter
    HIST_VIEW = HIST_ALL.filter(r => {
      if (minLen && r.len < minLen) return false;
      if (q && !String(r.id).toLowerCase().includes(q)) return false;
      return true;
    });

    // sort
    const dir = order === "asc" ? 1 : -1;
    HIST_VIEW.sort((a,b) => {
      const va = a[sortKey], vb = b[sortKey];
      if (va === vb) return 0;
      return (va > vb ? 1 : -1) * dir;
    });

    histPage = 1;
    renderHistoryTable();
  }

  function renderHistoryTable(){
    const pageSize = getPageSize();
    const total = HIST_VIEW.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    histPage = Math.min(histPage, totalPages);

    const startIdx = (histPage-1)*pageSize;
    const slice = HIST_VIEW.slice(startIdx, startIdx + pageSize);

    refs.histTableBody.innerHTML = slice.map(r => {
      return `<tr data-id="${r.id}" data-start="${r.start}" data-end="${r.end}">
        <td class="tce-mono"><span class="tce-link">${r.id}</span></td>
        <td class="tce-mono">${r.start ? fmtTime(r.start) : "—"}</td>
        <td class="tce-mono">${r.end ? fmtTime(r.end) : "—"}</td>
        <td class="tce-mono num">${fmtDur(r.dur)}</td>
        <td class="tce-mono num">${fmtInt(r.len)}</td>
        <td class="tce-mono num">${fmtRespect(r.respect)}</td>
      </tr>`;
    }).join("");

    // row click → open detail
    refs.histTableBody.querySelectorAll("tr").forEach(tr => {
      tr.addEventListener("click", () => {
        const id = parseInt(tr.getAttribute("data-id"), 10);
        const start = parseInt(tr.getAttribute("data-start"), 10);
        const end = parseInt(tr.getAttribute("data-end"), 10);
        openChainDetail(id, start, end);
      });
    });

    refs.histInfo.textContent = total ? `${total.toLocaleString()} chains` : "No results";
    refs.histPageLabel.textContent = `Page ${histPage}/${totalPages}`;
  }

  function exportHistoryCSV(){
    const rows = [["id","start","end","duration_sec","length","respect"]];
    HIST_VIEW.forEach(r => rows.push([r.id, r.start, r.end, r.dur, r.len, r.respect]));
    const csv = rows.map(r => r.map(v => {
      const s = String(v);
      return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g,'""')}"` : s;
    }).join(",")).join("\n");
    const blob = new Blob([csv], {type:"text/csv"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `torn_chains_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function openChainDetail(chainId, startTs, endTs) {
    if (!ensureKey()) return;
    refs.histDetail.style.display = "";
    refs.hdId.textContent = String(chainId);
    refs.hdWindow.textContent = `${fmtTime(startTs)} → ${fmtTime(endTs)}`;
    refs.hdLen.textContent = "…";
    refs.hdResp.textContent = "…";
    refs.hdThresholdsBody.innerHTML = `<tr><td colspan="3" class="tce-small">Loading…</td></tr>`;
    toast(`loading chain #${chainId}…`);

    try {
      const report = await cachedFetchChainReport(chainId).catch(()=>null);

      // report stats
      if (report) {
        const len = report?.chainreport?.stats?.chain || report?.stats?.chain || 0;
        const resp = report?.chainreport?.stats?.respect || report?.stats?.respect || 0;
        refs.hdLen.textContent = String(len);
        refs.hdResp.textContent = (Number.isFinite(resp) ? resp.toFixed(2) : String(resp));
      } else {
        refs.hdLen.textContent = "—";
        refs.hdResp.textContent = "—";
      }

      if (isPublicMode()) {
        // No per-hit data in public mode
        refs.chartCanvas.parentElement.style.display = "none";
        refs.hdThresholdsBody.innerHTML = `<tr><td colspan="3" class="tce-small">Per-hit timeline requires a private key with faction attacks access. Showing summary only.</td></tr>`;
      } else {
        const attacks = await cachedFetchAttacksForChain(chainId, startTs, endTs).catch(()=>[]);
        const points = buildChainTimeline(attacks, startTs);
        refs.chartCanvas.parentElement.style.display = "";
        renderChart(points);
        const crossed = computeThresholdMoments(points, STATE.thresholds);
        refs.hdThresholdsBody.innerHTML = crossed.map(c => {
          return `<tr>
            <td class="tce-mono">${c.th}</td>
            <td class="tce-mono">${c.ts ? new Date(c.ts).toLocaleString() : "—"}</td>
            <td class="tce-mono">${c.ts ? fmtDeltaMin((c.ts - startTs*1000)/60000) : "—"}</td>
          </tr>`;
        }).join("");
      }

      toast(`chain #${chainId} ready`);
    } catch (e) {
      console.error(e);
      toast(e.message || "error");
    }
  }

  function buildChainTimeline(attacks, startTsSec) {
    const rows = attacks
      .map(a => ({
        ts: (a.timestamp_started || a.timestamp || a.modifiers?.timestamp || 0) * 1000,
        chain: a.chain || a.chain_link || a.modifiers?.chain || 0
      }))
      .filter(r => r.ts && r.chain >= 0)
      .sort((a,b)=>a.ts-b.ts);

    let maxSeen = -1;
    const pts = [];
    for (const r of rows) {
      if (r.chain >= maxSeen) {
        maxSeen = r.chain;
        pts.push({ t: r.ts, y: r.chain });
      }
    }
    if (pts.length === 0 || pts[0].y > 0) {
      pts.unshift({ t: startTsSec * 1000, y: 0 });
    }
    return pts;
  }

  function computeThresholdMoments(points, thresholds) {
    const out = [];
    let i = 0;
    for (const th of thresholds) {
      let ts = null;
      while (i < points.length && points[i].y < th) i++;
      if (i < points.length && points[i].y >= th) ts = points[i].t;
      out.push({ th, ts });
    }
    return out;
  }

  function renderChart(points) {
    if (!refs.chartCanvas) return;
    if (chart) { chart.destroy(); chart = null; }
    const data = points.map(p => ({ x: p.t, y: p.y }));
    chart = new Chart(refs.chartCanvas.getContext("2d"), {
      type: "line",
      data: { datasets: [{ label: "Cumulative chain", data, fill: false, tension: 0.15, pointRadius: 0, borderWidth: 2 }]},
      options: {
        responsive: true, maintainAspectRatio: false, parsing: false,
        scales: {
          x: {
            type: "linear",
            ticks: {
              callback: (v) => {
                const d = new Date(v);
                const h = String(d.getHours()).padStart(2,"0");
                const m = String(d.getMinutes()).padStart(2,"0");
                return `${h}:${m}`;
              }
            }
          },
          y: { beginAtZero: true, ticks: { precision: 0 } }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => {
                if (!items?.length) return "";
                const ts = items[0].parsed.x;
                return new Date(ts).toLocaleString();
              },
              label: (ctx) => `Chain: ${ctx.parsed.y}`
            }
          }
        },
        animation: false,
      }
    });
  }

  /**********************
   * API helpers
   **********************/
  function apiBase() { return "https://api.torn.com"; }
  function isPublicMode() { return STATE.usePublicKey || (STATE.apiKey && STATE.apiKey.toLowerCase() === "public"); }
  function keyParam() { return isPublicMode() ? "public" : encodeURIComponent(STATE.apiKey); }

  function factionUrl(selection, extra="") {
    const base = apiBase();
    if (isPublicMode()) {
      if (!STATE.factionIdOverride) throw new Error("Public key mode: Faction ID is required. Open Settings and set Faction ID.");
      return `${base}/faction/${encodeURIComponent(STATE.factionIdOverride)}?selections=${selection}&key=${keyParam()}${extra}`;
    }
    if (STATE.factionIdOverride) {
      return `${base}/faction/${encodeURIComponent(STATE.factionIdOverride)}?selections=${selection}&key=${keyParam()}${extra}`;
    }
    return `${base}/faction/?selections=${selection}&key=${keyParam()}${extra}`;
  }

  function ensureKey() {
    if (!STATE.apiKey) { configure(); }
    if (!STATE.apiKey) { toast("API key required."); return false; }
    if (isPublicMode() && !STATE.factionIdOverride) {
      toast("Public key mode: set Faction ID in Settings.");
      return false;
    }
    return true;
  }

  function httpGetJSON(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        url, method: "GET", headers: { "Accept": "application/json" },
        onload: (res) => {
          try {
            if (res.status < 200 || res.status >= 300) {
              reject(new Error(`HTTP ${res.status}: ${res.responseText?.slice(0, 200) || ""}`));
              return;
            }
            const j = JSON.parse(res.responseText || "{}");
            if (j && j.error) {
              reject(new Error(`${j.error.code}: ${j.error.error}`));
              return;
            }
            resolve(j);
          } catch (e) { reject(e); }
        },
        onerror: () => reject(new Error("Network error")),
        ontimeout: () => reject(new Error("Request timed out")),
        timeout: 20000,
      });
    });
  }

  // Live chain
  function fetchChain() {
    const url = factionUrl("chain");
    return httpGetJSON(url).catch((e) => {
      const msg = String(e.message || e);
      if (msg.startsWith("7:")) {
        throw new Error("7: Incorrect ID-entity relation. In public mode set a Faction ID. In private mode, ensure the key belongs to a member in the faction or set Faction ID override in Settings.");
      }
      throw e;
    }).then(json => {
      let chainCurrent = undefined, timeoutSec = undefined;
      if (json && json.chain) {
        chainCurrent = toNum(json.chain.current);
        timeoutSec   = toNum(json.chain.timeout);
        if (!Number.isFinite(timeoutSec) && Number.isFinite(toNum(json.chain.time_left))) timeoutSec = toNum(json.chain.time_left);
      }
      if (!Number.isFinite(chainCurrent) && Number.isFinite(toNum(json.current))) chainCurrent = toNum(json.current);
      if (!Number.isFinite(timeoutSec) && Number.isFinite(toNum(json.timeout))) timeoutSec = toNum(json.timeout);
      if (!Number.isFinite(chainCurrent)) throw new Error("Missing chain.current");
      return { chainCurrent, timeoutSec: Number.isFinite(timeoutSec) ? timeoutSec : null, raw: json };
    });
  }
  function toNum(v) { const n = Number(v); return Number.isFinite(n) ? n : NaN; }

  // Profile (private mode diagnostics)
  function fetchUserProfile() {
    const url = `${apiBase()}/user/?selections=profile&key=${keyParam()}`;
    return httpGetJSON(url).then(j => ({
      player_id: j.player_id,
      name: j.name,
      faction_id: j.faction?.faction_id || j.faction_id || 0,
      faction_name: j.faction?.faction_name || j.factionname || null
    }));
  }

  /**********************
   * Caching layer (IndexedDB)
   **********************/
  const DB_NAME = "torn_chain_cache";
  const DB_VER = 1;
  let dbp = null;

  function db() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains("chainsList")) d.createObjectStore("chainsList"); // key: context key
        if (!d.objectStoreNames.contains("chainReports")) d.createObjectStore("chainReports"); // key: chainId
        if (!d.objectStoreNames.contains("attacks")) d.createObjectStore("attacks"); // key: chainId
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }
  async function idbGet(store, key) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(store, "readonly");
      const st = tx.objectStore(store);
      const req = st.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbPut(store, key, value) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(store, "readwrite");
      const st = tx.objectStore(store);
      st.put(value, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }
  async function idbClear(store) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(store, "readwrite");
      const st = tx.objectStore(store);
      st.clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function cacheClearAll() {
    await idbClear("chainsList");
    await idbClear("chainReports");
    await idbClear("attacks");
  }
  async function cacheStats() {
    const d = await db();
    async function count(store) {
      return new Promise((resolve) => {
        const tx = d.transaction(store, "readonly");
        const st = tx.objectStore(store);
        const req = st.count();
        req.onsuccess = () => resolve(req.result || 0);
        req.onerror = () => resolve(0);
      });
    }
    const [a,b,c] = await Promise.all([count("chainsList"), count("chainReports"), count("attacks")]);
    const approxBytes = (a*4 + b*512 + c*4096);
    return { chainsList: a, chainReports: b, attacks: c, approxBytes };
  }

  /**********************
   * Cached fetchers
   **********************/
  function chainsCacheKey() {
    const mode = isPublicMode() ? "pub" : "priv";
    const fid = STATE.factionIdOverride || "implicit";
    return `${mode}:${fid}`;
  }

  async function cachedFetchChains(force = false) {
    const key = chainsCacheKey();
    const cached = await idbGet("chainsList", key);
    const now = Date.now();
    if (!force && cached && (now - (cached.ts || 0) < STATE.chainsTTLms)) {
      return cached.data;
    }
    const fresh = await fetchChains();
    await idbPut("chainsList", key, { data: fresh, ts: now });
    return fresh;
  }

  function fetchChains() {
    const url = factionUrl("chains");
    return httpGetJSON(url).catch((e) => {
      const msg = String(e.message || e);
      if (msg.startsWith("7:")) {
        throw new Error("7: Incorrect ID-entity relation. In public mode set a Faction ID. In private mode, ensure the key belongs to a member in the faction or set Faction ID override in Settings.");
      }
      throw e;
    }).then(json => {
      const out = [];
      const src = json?.chains || json;
      if (src && typeof src === "object") {
        // Prefer the object key as the authoritative chain ID
        for (const [keyId, rec] of Object.entries(src)) {
          let chain_id = Number(keyId);
          if (!Number.isFinite(chain_id)) {
            chain_id = Number(rec?.chain_id || rec?.id || NaN);
          }
          if (!Number.isFinite(chain_id)) continue;

          out.push({
            chain_id,
            start: rec.start || rec.started || rec.timestamp || 0,
            end: rec.end || rec.ended || rec.timestamp_end || 0,
            chain: rec.chain_count || rec.length || rec.hits || rec.chain || 0,
            respect: rec.respect || 0
          });
        }
      }
      out.sort((a,b)=> (b.end||0) - (a.end||0));
      return out.slice(0, 100);
    });
  }

  async function cachedFetchChainReport(chainId) {
    const key = String(chainId);
    const cached = await idbGet("chainReports", key);
    if (cached && cached.data) return cached.data;
    const data = await fetchChainReport(chainId);
    await idbPut("chainReports", key, { data, ts: Date.now() });
    return data;
  }
  function fetchChainReport(chainId) {
    const url = `${apiBase()}/torn/${encodeURIComponent(chainId)}?selections=chainreport&key=${keyParam()}`;
    return httpGetJSON(url);
  }

  async function cachedFetchAttacksForChain(chainId, fromSec, toSec) {
    if (isPublicMode()) throw new Error("Public key mode: faction attacks are not available.");
    const key = String(chainId);
    const cached = await idbGet("attacks", key);
    if (cached && cached.complete && Array.isArray(cached.rows)) {
      return cached.rows;
    }
    const rows = await fetchAttacksWindow(fromSec, toSec);
    await idbPut("attacks", key, { rows, from: fromSec, to: toSec, ts: Date.now(), complete: true });
    return rows;
  }

  async function fetchAttacksWindow(fromSec, toSec) {
    const all = [];
    let page = 0;
    let cursor = fromSec;
    while (cursor <= toSec && page < STATE.maxAttackPages) {
      page++;
      const url = factionUrl("attacks", `&from=${cursor}&to=${toSec}&limit=1000`);
      const json = await httpGetJSON(url).catch((e) => {
        const msg = String(e.message || e);
        if (msg.startsWith("7:")) throw new Error("7: Incorrect ID-entity relation while loading attacks. Check key/faction.");
        throw e;
      });
      const obj = json?.attacks || json;
      const rows = obj && typeof obj === "object" ? Object.values(obj) : [];
      if (!rows.length) break;
      rows.sort((a,b)=> (a.timestamp_started||a.timestamp||0) - (b.timestamp_started||b.timestamp||0));
      all.push(...rows);
      const last = rows[rows.length - 1];
      const lastTs = (last.timestamp_started || last.timestamp || 0);
      if (!lastTs || lastTs >= toSec) break;
      cursor = lastTs + 1;
    }
    return all;
  }

  // Kick off
  startPolling();
})();
