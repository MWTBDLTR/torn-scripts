// ==UserScript==
// @name         Torn Chain Tools: Live ETA + History (V2-only)
// @namespace    https://github.com/MWTBDLTR/torn-scripts/
// @version      1.2.6
// @description  Live chain ETAs, history browser with filters/sort/paging/CSV, chain report viewer, and per-hit timeline chart (req fac api access). Caches to IndexedDB. V2 endpoints only.
// @author       MrChurch
// @match        https://www.torn.com/war.php*
// @match        https://www.torn.com/factions.php*
// @connect      api.torn.com
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @require      https://cdn.jsdelivr.net/npm/chart.js
// ==/UserScript==

(function () {
  ("use strict");

  const DEF_THRESHOLDS = [10, 50, 100, 250, 1000, 2500, 5000];
  const STATE = {
    apiKey: GM_getValue("torn_chain_eta_apiKey", ""),
    usePublicKey: GM_getValue("torn_chain_eta_usePublicKey", false),
    factionIdOverride: GM_getValue("torn_chain_eta_factionIdOverride", ""),
    thresholds: GM_getValue("torn_chain_eta_thresholds", DEF_THRESHOLDS),
    pollSec: GM_getValue("torn_chain_eta_pollSec", 15),
    rateWindowMin: GM_getValue("torn_chain_eta_rateWindowMin", 5),
    historyMaxMin: 15,
    maxAttackPages: GM_getValue("torn_chain_eta_maxAttackPages", 1000),
    chainsTTLms: GM_getValue("torn_chain_eta_chainsTTLms", 2 * 60 * 1000),
    attacksTTLms: GM_getValue("torn_chain_eta_attacksTTLms", 10 * 60 * 1000), // 10 min
  };

  GM_registerMenuCommand("Torn Chain → Configure…", configure);
  GM_registerMenuCommand("Torn Chain → Test API / Key", testKey);
  GM_registerMenuCommand("Torn Chain → Reset live rate history", () => {
    HISTORY.length = 0;
    toast("Live rate history reset.");
  });
  GM_registerMenuCommand("Torn Chain → Clear Chain Cache", async () => {
    await cacheClearAll();
    toast("Cache cleared.");
  });

  function configure() {
    const k = prompt('Enter your Torn API key (type "public" to use public mode):', STATE.apiKey || "");
    if (k === null) return;
    STATE.apiKey = (k || "").trim();
    GM_setValue("torn_chain_eta_apiKey", STATE.apiKey);
    STATE.usePublicKey = STATE.apiKey.toLowerCase() === "public";
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
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => Number.isFinite(n) && n > 0)
        .sort((a, b) => a - b);
      if (arr.length) {
        STATE.thresholds = arr;
        GM_setValue("torn_chain_eta_thresholds", STATE.thresholds);
      }
    }

    const p = prompt(`API poll interval (5–60s):`, String(STATE.pollSec));
    if (p !== null) {
      STATE.pollSec = clampInt(parseInt(p, 10), 5, 60, STATE.pollSec);
      GM_setValue("torn_chain_eta_pollSec", STATE.pollSec);
    }

    const w = prompt(`Rate window (1–${STATE.historyMaxMin} minutes):`, String(STATE.rateWindowMin));
    if (w !== null) {
      STATE.rateWindowMin = clampInt(parseInt(w, 10), 1, STATE.historyMaxMin, STATE.rateWindowMin);
      GM_setValue("torn_chain_eta_rateWindowMin", STATE.rateWindowMin);
    }

    const mp = prompt(
      `Max attacks pages per chain (safety cap, default ${STATE.maxAttackPages}, 50–5000):`,
      String(STATE.maxAttackPages)
    );
    if (mp !== null) {
      STATE.maxAttackPages = clampInt(parseInt(mp, 10), 50, 5000, STATE.maxAttackPages);
      GM_setValue("torn_chain_eta_maxAttackPages", STATE.maxAttackPages);
    }

    const ct = prompt(`Chains list cache TTL in minutes (default 2):`, String(STATE.chainsTTLms / 60000));
    if (ct !== null) {
      const min = clampInt(parseInt(ct, 10), 1, 15, STATE.chainsTTLms / 60000);
      STATE.chainsTTLms = min * 60000;
      GM_setValue("torn_chain_eta_chainsTTLms", STATE.chainsTTLms);
    }

    toast("Settings saved.");
  }

  function clampInt(n, lo, hi, dflt) {
    if (!Number.isFinite(n)) return dflt;
    return Math.max(lo, Math.min(hi, n));
  }

  // ---------- Styles / UI ----------
  GM_addStyle(`
    .tce-wrap { position: fixed; top: 88px; right: 18px; z-index: 99999; width: 420px; background:#0f1419; color:#eaf2ff; font:13px/1.35 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif; border:1px solid #2a3641; border-radius:12px; box-shadow:0 8px 24px rgba(0,0,0,.35); user-select:none; }
    .tce-header { cursor:move; padding:10px 12px; font-weight:600; background:#0b1015; border-bottom:1px solid #1e2a34; display:flex; gap:8px; align-items:center; justify-content:space-between; }
    .tce-tab { background:#15202b; border:1px solid #27313a; color:#d9e7ff; padding:4px 8px; border-radius:8px; cursor:pointer; font-weight:600; }
    .tce-tab.active { background:#1b2733; }
    .tce-badge { font-size:11px; padding:2px 6px; border-radius:999px; background:#1f2a33; color:#bfe0ff; }
    .tce-body { padding:10px 12px; max-height:66vh; overflow:auto; }
    .tce-grid { width:100%; border-collapse:collapse; }
    .tce-grid th, .tce-grid td { padding:8px; border-bottom:1px solid #1c252e; white-space:nowrap; color:#eaf2ff; }
    .tce-grid th { font-size:11px; color:#e1ecff; text-transform:uppercase; letter-spacing:.04em; background:#0e1620; text-align:left; }
    .tce-mono { font-family: ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; }
    .tce-small { font-size:11px; color:#c7d6e8; }
    .tce-btn { background:#16202a; border:1px solid #27313a; color:#eaf2ff; padding:6px 8px; border-radius:8px; cursor:pointer; }
    .tce-btn:hover { background:#1a2631; }
    .tce-chart { width:100%; height:260px; }
    .tce-hbox { display:flex; gap:8px; flex-wrap:wrap; }
    .tce-hbox > div { flex:1 1 48%; }
    .tce-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0 8px;}
    .tce-table-container{max-height:48vh;overflow:auto;border:1px solid #1c252e;border-radius:10px;}
    .tce-grid thead th{position:sticky;top:0;background:#0e1620;z-index:1;}
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
        <div style="display:flex;justify-content:space-between;margin-top:8px;">
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
          <select id="histOrder"><option value="desc">Desc</option><option value="asc">Asc</option></select>
          <label class="tce-small">Page
            <select id="histPageSize"><option>10</option><option selected>20</option><option>50</option><option>100</option></select>
          </label>
          <button class="tce-btn" id="btnReloadHist">Refresh</button>
          <button class="tce-btn" id="btnExportCSV">Export CSV</button>
          <button class="tce-btn" id="btnClearCache">Clear cache</button>
        </div>

        <div class="tce-table-container">
          <table class="tce-grid" id="histTable">
            <thead><tr><th>ID</th><th>Start</th><th>End</th><th>Duration</th><th>Len</th><th>Respect</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">
          <div class="tce-small" id="histInfo">—</div>
          <div>
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
          <div style="margin-top:8px"><canvas id="chainChart" class="tce-chart"></canvas></div>
          <table class="tce-grid" id="hdThresholds">
            <thead><tr><th>Threshold</th><th>Reached at</th><th>Δ from start</th></tr></thead>
            <tbody></tbody>
          </table>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  (function makeDraggable(handleId, wrap) {
    const handle = root.querySelector("#" + handleId);
    let dragging = false,
      sx = 0,
      sy = 0,
      ox = 0,
      oy = 0;
    handle.addEventListener("mousedown", (e) => {
      dragging = true;
      sx = e.clientX;
      sy = e.clientY;
      const r = wrap.getBoundingClientRect();
      ox = r.left;
      oy = r.top;
      e.preventDefault();
    });
    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - sx,
        dy = e.clientY - sy;
      wrap.style.left = Math.max(0, ox + dx) + "px";
      wrap.style.top = Math.max(0, oy + dy) + "px";
      wrap.style.right = "auto";
      wrap.style.position = "fixed";
    });
    window.addEventListener("mouseup", () => (dragging = false));
  })("tceDrag", root);

  // Refs
  const refs = {
    status: root.querySelector("#tceStatus"),
    tabLive: root.querySelector("#tabLive"),
    tabHist: root.querySelector("#tabHist"),
    panelLive: root.querySelector("#panelLive"),
    panelHist: root.querySelector("#panelHist"),
    current: root.querySelector("#tceCurrent"),
    rate: root.querySelector("#tceRate"),
    timeout: root.querySelector("#tceTimeout"),
    interHit: root.querySelector("#tceInterHit"),
    risk: root.querySelector("#tceRisk"),
    tableBody: root.querySelector("#tceTable tbody"),
    refresh: root.querySelector("#tceRefresh"),
    cfg: root.querySelector("#tceCfg"),
    tceWin: root.querySelector("#tceWin"),
    histSearch: root.querySelector("#histSearch"),
    histMinLen: root.querySelector("#histMinLen"),
    histSort: root.querySelector("#histSort"),
    histOrder: root.querySelector("#histOrder"),
    histPageSize: root.querySelector("#histPageSize"),
    btnReloadHist: root.querySelector("#btnReloadHist"),
    btnExportCSV: root.querySelector("#btnExportCSV"),
    btnClearCache: root.querySelector("#btnClearCache"),
    histTableBody: root.querySelector("#histTable tbody"),
    histInfo: root.querySelector("#histInfo"),
    histPrev: root.querySelector("#histPrev"),
    histNext: root.querySelector("#histNext"),
    histPageLabel: root.querySelector("#histPageLabel"),
    histDetail: root.querySelector("#histDetail"),
    hdId: root.querySelector("#hdId"),
    hdWindow: root.querySelector("#hdWindow"),
    hdLen: root.querySelector("#hdLen"),
    hdResp: root.querySelector("#hdResp"),
    hdThresholdsBody: root.querySelector("#hdThresholds tbody"),
    chartCanvas: root.querySelector("#chainChart"),
  };

  function tctExportHistoryCSV() {
    const rows = [["id", "start", "end", "duration_sec", "length", "respect"]];
    (window.HIST_VIEW || HIST_VIEW || []).forEach((r) => rows.push([r.id, r.start, r.end, r.dur, r.len, r.respect]));
    const csv = rows
      .map((r) =>
        r
          .map((v) => {
            const s = String(v);
            return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(",")
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `torn_chains_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function adjustPanelWidth(which) {
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

  refs.histSearch.addEventListener("input", applyHistoryFilters);
  refs.histMinLen.addEventListener("change", applyHistoryFilters);
  refs.histSort.addEventListener("change", applyHistoryFilters);
  refs.histOrder.addEventListener("change", applyHistoryFilters);
  refs.histPageSize.addEventListener("change", () => {
    histPage = 1;
    renderHistoryTable();
  });
  refs.histPrev.addEventListener("click", () => {
    if (histPage > 1) {
      histPage--;
      renderHistoryTable();
    }
  });
  refs.histNext.addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(HIST_VIEW.length / getPageSize()));
    if (histPage < totalPages) {
      histPage++;
      renderHistoryTable();
    }
  });
  refs.btnExportCSV.addEventListener("click", tctExportHistoryCSV);
  refs.btnClearCache.addEventListener("click", async () => {
    await cacheClearAll();
    toast("Cache cleared.");
  });

  // ----------------- Live stats -----------------
  const HISTORY = [];
  let pollTimer = null;

  function toast(msg) {
    refs.status.textContent = msg;
  }
  function fmtClock(ts) {
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }
  function fmtTime(sec) {
    return new Date(sec * 1000).toLocaleString();
  }
  function fmtDeltaMin(mins) {
    if (!Number.isFinite(mins)) return "—";
    if (mins < 1) return `${Math.round(mins * 60)}s`;
    const h = Math.floor(mins / 60),
      m = Math.round(mins % 60);
    return h ? `${h}h ${m}m` : `${m}m`;
  }
  function fmtInt(n) {
    return Number.isFinite(+n) ? Number(n).toLocaleString() : "—";
  }
  function fmtRespect(r) {
    return Number.isFinite(+r)
      ? Number(r).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : "—";
  }
  function fmtDur(sec) {
    if (!Number.isFinite(sec) || sec < 0) return "—";
    const h = Math.floor(sec / 3600),
      m = Math.floor((sec % 3600) / 60),
      s = Math.floor(sec % 60);
    if (h) return `${h}h ${m}m`;
    if (m) return `${m}m ${s}s`;
    return `${s}s`;
  }
  function withEndBuffer(sec, buf = 300) {
    const n = Number(sec);
    return Number.isFinite(n) ? n + buf : sec;
  }
  function withStartBuffer(sec, buf = 120) {
    const n = Number(sec);
    return Number.isFinite(n) ? Math.max(0, n - buf) : sec;
  }
  function pruneHistory() {
    const cutoff = Date.now() - STATE.historyMaxMin * 60 * 1000;
    while (HISTORY.length && HISTORY[0].t < cutoff) HISTORY.shift();
  }
  function computeRate() {
    pruneHistory();
    const windowMs = STATE.rateWindowMin * 60 * 1000;
    const now = Date.now();
    const startIdx = HISTORY.findIndex((pt) => pt.t >= now - windowMs);
    const slice = startIdx === -1 ? HISTORY.slice() : HISTORY.slice(startIdx);
    if (slice.length < 2) return 0;
    const dtMin = (slice[slice.length - 1].t - slice[0].t) / 60000;
    const dHits = slice[slice.length - 1].chain - slice[0].chain;
    if (dtMin <= 0 || dHits <= 0) return 0;
    return dHits / dtMin;
  }
  function estimateRows(current, rate, thresholds) {
    const now = Date.now();
    return thresholds.map((th) => {
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
    const interHitSec = rateHPM > 0 ? 60 / rateHPM : Infinity;
    refs.interHit.textContent = Number.isFinite(interHitSec) ? `${Math.round(interHitSec)}s` : "—";
    refs.risk.textContent = "";
    refs.risk.className = "tce-small";
    if (timeoutSec && Number.isFinite(interHitSec)) {
      refs.risk.textContent = interHitSec > timeoutSec ? " • ⚠ avg inter-hit > timeout (risk)" : " • ok";
    }
    const rows = estimateRows(chainCurrent, rateHPM, STATE.thresholds);
    refs.tableBody.innerHTML = rows
      .map((r) => {
        const dim = r.delta <= 0 ? " tce-row-dim" : "";
        return `<tr class="${dim}">
          <td class="tce-mono">${r.th}</td>
          <td class="tce-mono">${r.delta <= 0 ? "—" : r.delta}</td>
          <td class="tce-mono">${r.clock}${
          Number.isFinite(r.etaMin) && r.etaMin > 0 ? ` (${fmtDeltaMin(r.etaMin)})` : ""
        }</td>
        </tr>`;
      })
      .join("");
  }
  function tickNow() {
    if (!ensureKey()) return;
    toast("updating…");
    fetchChain()
      .then((data) => {
        toast("live");
        const { chainCurrent, timeoutSec } = data;
        HISTORY.push({ t: Date.now(), chain: chainCurrent });
        const rate = computeRate();
        setLiveUI({ chainCurrent, timeoutSec, rateHPM: rate });
      })
      .catch((err) => {
        console.error(err);
        toast(err.message || "error");
      });
  }
  function startPolling() {
    clearInterval(pollTimer);
    pollTimer = setInterval(tickNow, STATE.pollSec * 1000);
    tickNow();
  }

  // ----------------- History -----------------
  let tctChart = null;
  let HIST_ALL = [];
  let HIST_VIEW = [];
  let histPage = 1;

  function getPageSize() {
    return parseInt(refs.histPageSize.value, 10) || 20;
  }

  async function loadHistory(forceRefetch = false) {
    if (!ensureKey()) return;
    toast("loading history…");
    try {
      const list = await cachedFetchChains(forceRefetch);
      HIST_ALL = list.map((row) => {
        const id = Number(row.chain_id || row.id);
        const start = Number(row.start || 0);
        const end = Number(row.end || 0);
        const len = Number(row.chain || row.length || row.hits || 0);
        const respect = Number(row.respect || 0);
        return {
          id,
          start,
          end,
          len,
          respect,
          dur: end && start ? end - start : 0,
        };
      });
      applyHistoryFilters();
      toast("history ready");
    } catch (e) {
      console.error(e);
      toast(e.message || "error");
    }
  }

  function applyHistoryFilters() {
    const q = (refs.histSearch.value || "").trim().toLowerCase();
    const minLen = Number(refs.histMinLen.value || 0);
    const sortKey = refs.histSort.value;
    const order = refs.histOrder.value;
    HIST_VIEW = HIST_ALL.filter((r) => {
      if (minLen && r.len < minLen) return false;
      if (q && !String(r.id).toLowerCase().includes(q)) return false;
      return true;
    });
    const dir = order === "asc" ? 1 : -1;
    HIST_VIEW.sort((a, b) => (a[sortKey] === b[sortKey] ? 0 : (a[sortKey] > b[sortKey] ? 1 : -1) * dir));
    histPage = 1;
    renderHistoryTable();
  }

  function renderHistoryTable() {
    const pageSize = getPageSize();
    const total = HIST_VIEW.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    histPage = Math.min(histPage, totalPages);
    const startIdx = (histPage - 1) * pageSize;
    const slice = HIST_VIEW.slice(startIdx, startIdx + pageSize);
    refs.histTableBody.innerHTML = slice
      .map((r) => {
        return `<tr data-id="${r.id}" data-start="${r.start}" data-end="${r.end}">
          <td class="tce-mono"><span class="tce-link">${r.id}</span></td>
          <td class="tce-mono">${r.start ? fmtTime(r.start) : "—"}</td>
          <td class="tce-mono">${r.end ? fmtTime(r.end) : "—"}</td>
          <td class="tce-mono">${fmtDur(r.dur)}</td>
          <td class="tce-mono">${fmtInt(r.len)}</td>
          <td class="tce-mono">${fmtRespect(r.respect)}</td>
        </tr>`;
      })
      .join("");
    refs.histTableBody.querySelectorAll("tr").forEach((tr) => {
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

  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  function toFloat(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  // ---------- Chain detail ----------
  function getChainStats(report) {
    const cr = report?.chainreport ?? report ?? {};
    const d = cr?.details || {};

    const factionID = num(cr.faction_id);
    const start = num(cr.start);
    const end = num(cr.end);
    const chain = num(d.chain);
    const respect = toFloat(d.respect);
    const members = num(d.members);
    const targets = num(d.targets);
    const warhits = num(d.war);
    const besthit = toFloat(d.best);
    const leave = num(d.leave);
    const mug = num(d.mug);
    const hospitalize = num(d.hospitalize);
    const assists = num(d.assists);
    const retaliations = num(d.retaliations);
    const overseas = num(d.overseas);
    const draws = num(d.draws);
    const escapes = num(d.escapes);
    const losses = num(d.losses);

    const attackersArr = Array.isArray(cr.attackers) ? cr.attackers : [];
    const nonAttArr = Array.isArray(cr.non_attackers) ? cr.non_attackers : [];
    const membersArray = normalizeV2Members(attackersArr, nonAttArr, factionID);

    return {
      factionID,
      chain,
      start,
      end,
      leave,
      mug,
      hospitalize,
      assists,
      overseas,
      draws,
      escapes,
      losses,
      respect,
      targets,
      warhits,
      besthit,
      retaliations,
      members,
      bonuses: Array.isArray(cr.bonuses) ? cr.bonuses : [],
      membersArray,
    };
  }

  function normalizeV2Members(attackersArr, nonAttackersArr, factionID) {
    const rows = [];

    for (const a of attackersArr) {
      const att = a?.attacks || {};
      const rsp = a?.respect || {};
      rows.push({
        userID: num(a.id),
        level: null,
        factionID: factionID || null,

        attacks: num(att.total),
        respect: toFloat(rsp.total),
        avg: toFloat(rsp.average),
        besthit: toFloat(rsp.best),

        leave: num(att.leave),
        mug: num(att.mug),
        hospitalize: num(att.hospitalize),
        assists: num(att.assists),
        retaliations: num(att.retaliations),
        overseas: num(att.overseas),
        draws: num(att.draws),
        escapes: num(att.escapes),
        losses: num(att.losses),
        warhits: num(att.war),
        bonuses: num(att.bonuses),
      });
    }

    for (const uid of nonAttackersArr || []) {
      rows.push({
        userID: num(uid),
        level: null,
        factionID: factionID || null,

        attacks: 0,
        respect: 0,
        avg: 0,
        besthit: 0,

        leave: 0,
        mug: 0,
        hospitalize: 0,
        assists: 0,
        retaliations: 0,
        overseas: 0,
        draws: 0,
        escapes: 0,
        losses: 0,
        warhits: 0,
        bonuses: 0,
      });
    }
    return rows;
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
      const report = await cachedFetchChainReport(chainId).catch(() => null);

      let expectedLen = null;

      if (report) {
        const stats = getChainStats(report);

        refs.hdResp.textContent = Number.isFinite(stats.respect)
          ? stats.respect.toFixed(2)
          : String(stats.respect ?? "—");

        expectedLen = Number(stats.chain) || null;

        const sum = (stats.leave || 0) + (stats.mug || 0) + (stats.hospitalize || 0);
        if (expectedLen && sum !== expectedLen) {
          console.warn(`Chain ${chainId} mismatch: leave+mug+hosp=${sum} vs chain=${expectedLen}`);
        }
      } else {
        refs.hdResp.textContent = "—";
      }

      if (isPublicMode()) {
        refs.chartCanvas.parentElement.style.display = "none";
        refs.hdLen.textContent = expectedLen != null ? String(expectedLen) : "—";
        refs.hdThresholdsBody.innerHTML = `<tr><td colspan="3" class="tce-small">
          Per-hit timeline requires a private key with faction attacks access. Showing summary only.
        </td></tr>`;
        toast(`chain #${chainId} summary ready`);
        return;
      }

      // buffered window to avoid edge truncation
      const winFrom = withStartBuffer(startTs, 120);
      const winTo = withEndBuffer(endTs, 300);

      // 3a) try cache first
      let attacks = await cachedGetAttacks(chainId, winFrom, winTo);

      // 3b) fetch if cache miss
      if (!attacks) {
        try {
          const fetchedAttacks = await fetchAttacksWindowChunked(winFrom, winTo, expectedLen);
          attacks = fetchedAttacks;
          // On success, write to cache. This is a "fire-and-forget" operation.
          cachePutAttacks(chainId, winFrom, winTo, attacks);
        } catch (fetchErr) {
          console.error(`[TCE] Failed to fetch attacks for chain ${chainId}`, fetchErr);
          toast("Error fetching attack data.");
          // Use an empty array for the UI, but DO NOT cache the failed result.
          attacks = [];
        }
      }
      
      const minLink = attacks.reduce((m, a) => Math.min(m, Number(a.chain || Infinity)), Infinity);
      const maxLink = attacks.reduce((m, a) => Math.max(m, Number(a.chain || 0)), 0);
      console.log(
        "[ChainDetail] chainId:",
        chainId,
        "attacks:",
        attacks.length,
        "chain min/max:",
        minLink,
        maxLink,
        "window:",
        new Date(withStartBuffer(startTs, 120) * 1000).toLocaleString(),
        "→",
        new Date(withEndBuffer(endTs, 300) * 1000).toLocaleString()
      );

      // debug
      console.log(
        "[ChainDetail] chainId:",
        chainId,
        "Fetched attacks:",
        attacks.length,
        "window:",
        new Date(winFrom * 1000).toLocaleString(),
        "→",
        new Date(winTo * 1000).toLocaleString(),
        "(from cache:",
        !!(await cachedGetAttacks(chainId, winFrom, winTo)),
        ")"
      );

      // Optional deeper info per hit
      attacks.forEach((a) => {
        console.log(
          `[ChainDetail] ${chainId} attack`,
          "id:",
          a.id || a.attack_id || a.code,
          "result:",
          a.result,
          "ended:",
          a.ended,
          "chain link:",
          a.chain
        );
      });

      const points = buildChainTimeline(attacks, startTs, expectedLen ?? null);
      const seenMax = points.length ? points[points.length - 1].y : 0;
      const finalLen = expectedLen ?? seenMax;

      if (!points || points.length <= 1) {
        refs.chartCanvas.parentElement.style.display = "none";
        refs.hdLen.textContent = String(finalLen);
        refs.hdThresholdsBody.innerHTML = `<tr><td colspan="3" class="tce-small">
    No per-hit data parsed for this chain window.
  </td></tr>`;
        toast(`chain #${chainId}: no per-hit data`);
        return;
      }

      refs.chartCanvas.parentElement.style.display = "";
      refs.hdLen.textContent = String(finalLen);
      renderChart(points);

      const thresholdsForTable = Array.from(new Set([...STATE.thresholds, finalLen])).sort((a, b) => a - b);
      const crossed = computeThresholdMoments(points, thresholdsForTable);
      refs.hdThresholdsBody.innerHTML = crossed
        .map(
          (c) => `
  <tr>
    <td class="tce-mono">${c.th}${c.th === finalLen ? " (final)" : ""}</td>
    <td class="tce-mono">${c.ts ? new Date(c.ts).toLocaleString() : "—"}</td>
    <td class="tce-mono">${c.ts ? fmtDeltaMin((c.ts / 1000 - startTs) / 60) : "—"}</td>
  </tr>
`
        )
        .join("");

      toast(`chain #${chainId} ready`);
    } catch (e) {
      console.error(e);
      toast(e.message || "error");
    }
  }

  function getLinkNumber(row, expectedLen = null) {
    // Accept only integer, plausible link indices. Ignore modifier-like values.
    const candidates = [
      row?.chain,
      row?.chain_link,
      row?.chainLink,
      row?.chain_position,
      row?.chainPosition,
      row?.chain?.position,
    ];

    for (const raw of candidates) {
      const v = Number(raw);
      if (Number.isInteger(v) && v > 0) {
        if (!expectedLen || v <= expectedLen * 1.2) return v;
      }
    }

    // Explicitly ignore modifier-like fractional values often seen at modifiers.chain
    const modifierLike = Number(row?.modifiers?.chain);
    if (Number.isFinite(modifierLike) && !Number.isInteger(modifierLike)) {
      return NaN;
    }

    return NaN;
  }

  function getAttackTimestamp(row) {
    const te = Number(row.ended);
    if (Number.isFinite(te) && te > 0) return te;
    const ts = Number(row.started);
    if (Number.isFinite(ts) && ts > 0) return ts;
    return NaN;
  }

  function getAttackerFactionId(row) {
    const n = Number(row?.attacker?.faction?.id ?? NaN);
    return Number.isFinite(n) ? n : NaN;
  }

  function buildChainTimeline(attacks, startTsSec, expectedLen = null /* faction filter removed */) {
    const startMs = startTsSec * 1000;
    const byLink = new Map(); // link -> earliest ms

    for (const a of attacks) {
      const link = getLinkNumber(a, expectedLen);
      if (!Number.isFinite(link) || link <= 0) continue;

      const tsSec = getAttackTimestamp(a);
      if (!Number.isFinite(tsSec) || tsSec <= 0) continue;

      const tMs = tsSec * 1000;
      const prev = byLink.get(link);
      if (prev == null || tMs < prev) byLink.set(link, tMs);
    }

    if (byLink.size === 0) return [{ t: startMs, y: 0 }];

    const points = [{ t: startMs, y: 0 }];
    const sorted = [...byLink.entries()].sort((a, b) => a[0] - b[0]); // by link#
    for (const [link, t] of sorted) {
      const prevT = points[points.length - 1].t;
      points.push({ t: Math.max(prevT + 1, t), y: link });
    }
    return spreadWithinSecond(points);
  }

  function spreadWithinSecond(pts) {
    if (!pts || pts.length < 3) return pts || [];
    let i = 1;
    while (i < pts.length) {
      const sec = Math.floor(pts[i].t / 1000);
      let j = i + 1;
      while (j < pts.length && Math.floor(pts[j].t / 1000) === sec) j++;
      const count = j - i;
      if (count > 1) {
        const base = Math.max(pts[i - 1].t + 1, sec * 1000);
        const end = sec * 1000 + 999;
        const step = Math.max(1, Math.floor((end - base) / count));
        for (let k = 0; k < count; k++) {
          pts[i + k].t = base + k * step;
          if (pts[i + k].t <= pts[i + k - 1]?.t) pts[i + k].t = pts[i + k - 1].t + 1;
        }
      }
      i = j;
    }
    return pts;
  }

  function computeThresholdMoments(points, thresholds) {
    const ths = [...thresholds].sort((a, b) => a - b);
    const out = ths.map((th) => ({ th, ts: null }));
    if (!points || points.length === 0) return out;

    let idx = 0;
    for (let i = 0; i < points.length && idx < out.length; i++) {
      const { t, y } = points[i];
      while (idx < out.length && y >= out[idx].th) {
        if (out[idx].ts == null) out[idx].ts = t;
        idx++;
      }
    }
    return out;
  }

  function renderChart(points) {
    if (!refs.chartCanvas) return;
    if (tctChart) {
      tctChart.destroy();
      tctChart = null;
    }
    const data = points.map((p) => ({ x: p.t, y: p.y }));
    tctChart = new Chart(refs.chartCanvas.getContext("2d"), {
      type: "line",
      data: {
        datasets: [
          { label: "Hit #", data, fill: false, tension: 0.15, borderWidth: 2, pointRadius: 3, pointHoverRadius: 5 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        parsing: false,
        scales: {
          x: {
            type: "linear",
            ticks: {
              callback: (v) => {
                const d = new Date(v);
                const pad = (n) => String(n).padStart(2, "0");
                return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
              },
            },
          },
          y: { beginAtZero: true, ticks: { precision: 0 } },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => (items?.length ? new Date(items[0].parsed.x).toLocaleString() : ""),
              label: (ctx) => `Hit #: ${ctx.parsed.y}`,
            },
          },
        },
        animation: false,
      },
    });
  }

  // ----------------- API helpers & cache  -----------------
  function apiBase() {
    return "https://api.torn.com/v2";
  }
  function isPublicMode() {
    return STATE.usePublicKey || (STATE.apiKey && STATE.apiKey.toLowerCase() === "public");
  }
  function keyParam() {
    return isPublicMode() ? "public" : encodeURIComponent(STATE.apiKey);
  }

  function buildFactionChainUrl() {
    const u = new URL(`${apiBase()}/faction/chain`);
    u.searchParams.set("key", keyParam());
    if (STATE.factionIdOverride) u.searchParams.set("faction_id", String(STATE.factionIdOverride));
    return u.href;
  }
  function buildFactionChainsUrl() {
    const u = new URL(`${apiBase()}/faction/chains`);
    u.searchParams.set("key", keyParam());
    if (STATE.factionIdOverride) u.searchParams.set("faction_id", String(STATE.factionIdOverride));
    return u.href;
  }
  function buildFactionAttacksUrl(fromSec, toSec) {
    const u = new URL(`${apiBase()}/faction/attacks`);
    u.searchParams.set("key", keyParam());
    u.searchParams.set("filters", "outgoing");
    u.searchParams.set("from", String(fromSec));
    u.searchParams.set("to", String(toSec));
    // If v2 supports it, ask for a larger page; harmless if ignored.
    u.searchParams.set("limit", "250");
    // Order doesn’t really matter since we’ll follow 'next', but ASC helps cursor sanity if used.
    u.searchParams.set("sort", "ASC");
    u.searchParams.set("comment", "chaintooldev");
    return u.href;
  }

  function buildChainReportUrl(chainId) {
    const u = new URL(`${apiBase()}/faction/${encodeURIComponent(chainId)}/chainreport`);
    u.searchParams.set("key", keyParam());
    return u.href;
  }

  function ensureKey() {
    if (!STATE.apiKey) {
      configure();
    }
    if (!STATE.apiKey) {
      toast("API key required.");
      return false;
    }
    if (isPublicMode() && !STATE.factionIdOverride) {
      toast("Public key mode: set Faction ID in Settings.");
      return false;
    }
    return true;
  }

  function httpGetJSON(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        url,
        method: "GET",
        headers: { Accept: "application/json" },
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
          } catch (e) {
            reject(e);
          }
        },
        onerror: () => reject(new Error("Network error")),
        ontimeout: () => reject(new Error("Request timed out")),
        timeout: 20000,
      });
    });
  }

  async function testKey() {
    try {
      if (isPublicMode()) {
        if (!STATE.factionIdOverride) throw new Error("Public mode: set Faction ID in Settings.");
        await httpGetJSON(buildFactionChainUrl());
        await httpGetJSON(buildFactionChainsUrl());
        alert(
          `Public mode OK.\nFaction ID: ${STATE.factionIdOverride}\nNote: per-hit attacks are not available in public mode (chart will be hidden).`
        );
        return;
      }
      await httpGetJSON(buildFactionChainUrl());
      await httpGetJSON(buildFactionChainsUrl());
      alert("Key OK. v2 faction endpoints reachable.");
    } catch (e) {
      alert(`Key test failed: ${e.message || e}`);
    }
  }

  function fetchChain() {
    const url = buildFactionChainUrl();
    return httpGetJSON(url).then((json) => {
      let chainCurrent, timeoutSec;
      if (json && json.chain) {
        chainCurrent = Number(json.chain.current);
        timeoutSec = Number(json.chain.timeout ?? json.chain.time_left);
      } else {
        chainCurrent = Number(json?.current);
        timeoutSec = Number(json?.timeout);
      }
      if (!Number.isFinite(chainCurrent)) throw new Error("Missing chain.current");
      return {
        chainCurrent,
        timeoutSec: Number.isFinite(timeoutSec) ? timeoutSec : null,
        raw: json,
      };
    });
  }

  // -------------- IndexedDB Cache --------------
  const DB_NAME = "torn_chain_cache";
  const DB_VER = 1;
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains("chainsList")) d.createObjectStore("chainsList");
        if (!d.objectStoreNames.contains("chainReports")) d.createObjectStore("chainReports");
        if (!d.objectStoreNames.contains("attacks")) d.createObjectStore("attacks");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }
  async function idbDeleteAll() {
    try {
      const d = await db();
      d.close();
    } catch {}
    dbp = null;
    return new Promise((resolve) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
      req.onblocked = () => resolve(false);
    });
  }
  async function idbGet(store, key) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(store, "readonly");
      const st = tx.objectStore(store);
      const r = st.get(key);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => reject(r.error);
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
      const req = st.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }
  async function cacheClearAll() {
    try {
      await idbClear("chainsList");
    } catch {}
    try {
      await idbClear("chainReports");
    } catch {}
    try {
      await idbClear("attacks");
    } catch {}
    await idbDeleteAll();
  }

  function chainsCacheKey() {
    const mode = isPublicMode() ? "pub" : "priv";
    const fid = STATE.factionIdOverride || "implicit";
    return `${mode}:${fid}`;
  }
  function attacksCacheKey(chainId, fromSec, toSec) {
    // key includes mode (pub/priv) to avoid cross-mode contamination
    const mode = isPublicMode() ? "pub" : "priv";
    return `${mode}:${chainId}:${fromSec}-${toSec}`;
  }

  async function cachedGetAttacks(chainId, fromSec, toSec) {
    const key = attacksCacheKey(chainId, fromSec, toSec);
    const cached = await idbGet("attacks", key).catch(() => null);
    if (cached && cached.data && Date.now() - (cached.ts || 0) < STATE.attacksTTLms) {
      return cached.data;
    }
    return null;
  }

  async function cachePutAttacks(chainId, fromSec, toSec, data) {
    const key = attacksCacheKey(chainId, fromSec, toSec);
    try {
      await idbPut("attacks", key, { data, ts: Date.now() });
    } catch (e) {
      console.warn("[tce] attacks cache put failed:", e);
    }
  }

  async function cachedFetchChains(force = false) {
    const key = chainsCacheKey();
    const cached = await idbGet("chainsList", key);
    const now = Date.now();
    if (!force && cached && now - (cached.ts || 0) < STATE.chainsTTLms) return cached.data;
    const fresh = await fetchChains();
    await idbPut("chainsList", key, { data: fresh, ts: now });
    return fresh;
  }

  function fetchChains() {
    function resolveNextLink(next, base) {
      if (!next) return null;
      try {
        if (/^https?:\/\//i.test(next)) return next;
        const b = new URL(base);
        return next.startsWith("/") ? `${b.origin}${next}` : new URL(next, b).href;
      } catch {
        return null;
      }
    }
    function normalize(rec) {
      const chain_id = Number(rec?.id ?? NaN);
      if (!Number.isFinite(chain_id)) return null;
      return {
        chain_id,
        start: Number(rec.start) || 0,
        end: Number(rec.end) || 0,
        chain: Number(rec.chain) || 0,
        respect: Number(rec.respect) || 0,
      };
    }
    return (async () => {
      const out = [];
      const seen = new Set();
      let url = buildFactionChainsUrl();
      let safety = 0;

      while (url && safety < 100) {
        safety += 1;
        let json;
        try {
          json = await httpGetJSON(url);
        } catch (e) {
          throw e;
        }

        const rows = Array.isArray(json?.chains) ? json.chains : [];
        for (const rec of rows) {
          const n = normalize(rec);
          if (!n) continue;
          const k = `${n.chain_id}|${n.start}|${n.end}|${n.chain}`;
          if (!seen.has(k)) {
            seen.add(k);
            out.push(n);
          }
        }

        const next = resolveNextLink(json?._metadata?.links?.next, url);
        if (!next || next === url) break;
        url = next;
      }

      out.sort((a, b) => (b.end || 0) - (a.end || 0));
      return out.slice(0, 100);
    })();
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
    const url = buildChainReportUrl(chainId);
    return httpGetJSON(url).then((j) => (j?.chainreport ? { chainreport: j.chainreport } : j));
  }

  function countUniqueLinks(rows) {
    const s = new Set();
    for (const r of rows) {
      if (OUR_FACTION_ID) {
        const atkFid = getAttackerFactionId(r);
        if (!Number.isFinite(atkFid) || atkFid !== Number(OUR_FACTION_ID)) continue;
      }
      const l = getLinkNumber(r, null);
      if (Number.isFinite(l) && l > 0) s.add(l);
    }
    return s.size;
  }

  async function fetchAttacksWindow(fromSec, toSec, targetHits = null) {
    function resolveNextLink(next, base) {
      if (!next) return null;
      try {
        if (/^https?:\/\//i.test(next)) return next;
        const b = new URL(base);
        return next.startsWith("/") ? `${b.origin}${next}` : new URL(next, b).href;
      } catch {
        return null;
      }
    }

    const byCode = new Map();
    const keepResults = new Set(["leave", "mugged", "hospitalized"]);
    let url = buildFactionAttacksUrl(fromSec, toSec);
    let pages = 0;

    while (url && pages < STATE.maxAttackPages) {
      pages += 1;

      let payload;
      try {
        payload = await httpGetJSON(url);
      } catch (e) {
        const msg = String(e?.message || e);
        if (msg.includes("rate limit") || msg.includes("429")) {
          // back off and retry same URL
          await new Promise((r) => setTimeout(r, 5000));
          continue;
        }
        throw e;
      }

      const batch = Array.isArray(payload?.attacks) ? payload.attacks : [];
      for (const r of batch) {
        const code = String(r.code ?? r.attack_id ?? r.id ?? "");
        if (!code || byCode.has(code)) continue;

        const res = String(r.result || "").toLowerCase();
        if (!keepResults.has(res)) continue; // only chain-crediting outcomes

        byCode.set(code, r);
      }

      // optional early-stops
      if (targetHits && byCode.size >= targetHits) break;

      const next = resolveNextLink(payload?._metadata?.links?.next, url);
      if (!next || next === url) break;
      url = next;

      // gentle pacing to remain under caps
      await new Promise((r) => setTimeout(r, 800));
    }

    // Return sorted by 'ended' ascending (helps plotting & threshold calc)
    return Array.from(byCode.values()).sort((a, b) => (a.ended ?? 0) - (b.ended ?? 0));
  }

  async function fetchAttacksWindowChunked(fromSec, toSec, expectedLen = null) {
    const CHUNK = 2 * 60 * 60; // 2 hours
    const byCode = new Map();
    let start = fromSec;

    while (start <= toSec) {
      const end = Math.min(start + CHUNK - 1, toSec);
      const batch = await fetchAttacksWindow(start, end, /*targetHits*/ null);
      for (const r of batch) {
        const code = String(r.code ?? r.attack_id ?? r.id ?? "");
        if (code && !byCode.has(code)) byCode.set(code, r);
      }

      // After processing a chunk, check if we've found the whole chain
      if (expectedLen) {
        const links = [...byCode.values()].map((r) => Number(r.chain ?? 0)).filter((n) => n > 0);
        // If we have found link #1 and a link >= the expected final length, we can stop fetching more time chunks.
        if (links.length > 0 && Math.min(...links) === 1 && Math.max(...links) >= expectedLen) {
          break;
        }
      }

      start = end + 1;
    }

    return [...byCode.values()].sort((a, b) => (a.ended ?? 0) - (b.ended ?? 0));
  }

  let OUR_FACTION_ID = null;

  startPolling();
})();
