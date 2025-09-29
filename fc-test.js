// ==UserScript==
// @name         Torn Chain Tools: Live ETA + History
// @namespace    https://github.com/MWTBDLTR/torn-scripts/
// @version      1.1.9
// @description  Live chain ETAs, history browser with filters/sort/paging/CSV, chain report viewer, and per-hit timeline chart (req fac api acceess). Caches to IndexedDB.
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
    maxAttackPages: GM_getValue("torn_chain_eta_maxAttackPages", 400),
    chainsTTLms: GM_getValue("torn_chain_eta_chainsTTLms", 2 * 60 * 1000),
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
    const k = prompt(
      'Enter your Torn API key (type "public" to use public mode):',
      STATE.apiKey || ""
    );
    if (k === null) return;
    STATE.apiKey = (k || "").trim();
    GM_setValue("torn_chain_eta_apiKey", STATE.apiKey);
    STATE.usePublicKey = STATE.apiKey.toLowerCase() === "public";
    GM_setValue("torn_chain_eta_usePublicKey", STATE.usePublicKey);

    const fid = prompt(
      "Faction ID (REQUIRED in public mode; optional otherwise):",
      STATE.factionIdOverride || ""
    );
    if (fid !== null) {
      STATE.factionIdOverride = (fid || "").trim();
      GM_setValue("torn_chain_eta_factionIdOverride", STATE.factionIdOverride);
    }

    const t = prompt(
      `Comma-separated thresholds:`,
      STATE.thresholds.join(", ")
    );
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

    const w = prompt(
      `Rate window (1–${STATE.historyMaxMin} minutes):`,
      String(STATE.rateWindowMin)
    );
    if (w !== null) {
      STATE.rateWindowMin = clampInt(
        parseInt(w, 10),
        1,
        STATE.historyMaxMin,
        STATE.rateWindowMin
      );
      GM_setValue("torn_chain_eta_rateWindowMin", STATE.rateWindowMin);
    }

    const mp = prompt(
      `Max attacks pages per chain (safety cap, default ${STATE.maxAttackPages}, 10–100):`,
      String(STATE.maxAttackPages)
    );
    if (mp !== null) {
      STATE.maxAttackPages = clampInt(
        parseInt(mp, 10),
        10,
        100,
        STATE.maxAttackPages
      );
      GM_setValue("torn_chain_eta_maxAttackPages", STATE.maxAttackPages);
    }

    const ct = prompt(
      `Chains list cache TTL in minutes (default 2):`,
      String(STATE.chainsTTLms / 60000)
    );
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
        if (!STATE.factionIdOverride)
          throw new Error("Public mode: set Faction ID in Settings.");
        await httpGetJSON(buildFactionChainUrl());
        await httpGetJSON(buildFactionChainsUrl());
        alert(
          `Public mode OK.\nFaction ID: ${STATE.factionIdOverride}\nNote: per-hit attacks are not available in public mode (chart will be hidden).`
        );
        return;
      }
      const u = await fetchUserProfile();
      alert(
        `Key OK.\nPlayer: ${u.name} [${u.player_id}]\nFaction: ${
          u.faction_name || "(none)"
        } (${u.faction_id || 0})`
      );
    } catch (e) {
      alert(`Key test failed: ${e.message || e}`);
    }
  }

  function clampInt(n, lo, hi, dflt) {
    if (!Number.isFinite(n)) return dflt;
    return Math.max(lo, Math.min(hi, n));
  }

  // ---------- Styles / UI (trimmed to essentials for brevity) ----------
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
    (window.HIST_VIEW || HIST_VIEW || []).forEach((r) =>
      rows.push([r.id, r.start, r.end, r.dur, r.len, r.respect])
    );
    const csv = rows
      .map((r) =>
        r
          .map((v) => {
            const s = String(v);
            return s.includes(",") || s.includes('"')
              ? `"${s.replace(/"/g, '""')}"`
              : s;
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
      const w = Math.min(
        Math.max(760, Math.floor(window.innerWidth * 0.9)),
        1000
      );
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
  const HISTORY = []; // {t, chain}
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
    // +5 minutes
    const n = Number(sec);
    return Number.isFinite(n) ? n + buf : sec;
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
    refs.interHit.textContent = Number.isFinite(interHitSec)
      ? `${Math.round(interHitSec)}s`
      : "—";
    refs.risk.textContent = "";
    refs.risk.className = "tce-small";
    if (timeoutSec && Number.isFinite(interHitSec)) {
      refs.risk.textContent =
        interHitSec > timeoutSec
          ? " • ⚠ avg inter-hit > timeout (risk)"
          : " • ok";
    }
    const rows = estimateRows(chainCurrent, rateHPM, STATE.thresholds);
    refs.tableBody.innerHTML = rows
      .map((r) => {
        const dim = r.delta <= 0 ? " tce-row-dim" : "";
        return `<tr class="${dim}">
        <td class="tce-mono">${r.th}</td>
        <td class="tce-mono">${r.delta <= 0 ? "—" : r.delta}</td>
        <td class="tce-mono">${r.clock}${
          Number.isFinite(r.etaMin) && r.etaMin > 0
            ? ` (${fmtDeltaMin(r.etaMin)})`
            : ""
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
    HIST_VIEW.sort((a, b) =>
      a[sortKey] === b[sortKey] ? 0 : (a[sortKey] > b[sortKey] ? 1 : -1) * dir
    );
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
        return `<tr data-id="${r.id}" data-start="${r.start}" data-end="${
          r.end
        }">
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
    refs.histInfo.textContent = total
      ? `${total.toLocaleString()} chains`
      : "No results";
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

  function num(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  function toFloat(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  async function openChainDetail(chainId, startTs, endTs) {
    if (!ensureKey()) return;

    // Prime UI
    refs.histDetail.style.display = "";
    refs.hdId.textContent = String(chainId);
    refs.hdWindow.textContent = `${fmtTime(startTs)} → ${fmtTime(endTs)}`;
    refs.hdLen.textContent = "…";
    refs.hdResp.textContent = "…";
    refs.hdThresholdsBody.innerHTML = `<tr><td colspan="3" class="tce-small">Loading…</td></tr>`;
    toast(`loading chain #${chainId}…`);

    try {
      // 1) Chain report (v2-friendly) → stats
      const report = await cachedFetchChainReport(chainId).catch(() => null);

      let expectedLen = null;
      let ourFactionId = null;

      if (report) {
        const stats = getChainStats(report);

        // Respect (2dp if numeric)
        refs.hdResp.textContent = Number.isFinite(stats.respect)
          ? stats.respect.toFixed(2)
          : String(stats.respect ?? "—");

        expectedLen = Number(stats.chain) || null;

        // Prefer faction id from report; fall back to resolver
        ourFactionId =
          Number(stats.factionID || STATE.factionIdOverride || 0) || null;

        // Optional sanity check
        const sum =
          (stats.leave || 0) + (stats.mug || 0) + (stats.hospitalize || 0);
        if (expectedLen && sum !== expectedLen) {
          console.warn(
            `Chain ${chainId} mismatch: leave+mug+hosp=${sum} vs chain=${expectedLen}`
          );
        }
      } else {
        refs.hdResp.textContent = "—";
      }

      // 2) Public-key mode: summary only
      if (isPublicMode()) {
        refs.chartCanvas.parentElement.style.display = "none";
        refs.hdLen.textContent =
          expectedLen != null ? String(expectedLen) : "—";
        refs.hdThresholdsBody.innerHTML = `<tr><td colspan="3" class="tce-small">
        Per-hit timeline requires a private key with faction attacks access. Showing summary only.
      </td></tr>`;
        toast(`chain #${chainId} summary ready`);
        return;
      }

      // If faction id still unknown, resolve it now
      if (!ourFactionId) {
        try {
          ourFactionId = await resolveOurFactionId();
        } catch {}
        if (!Number.isFinite(ourFactionId)) ourFactionId = null;
      }

      // 3) Fetch all outgoing successful attacks for this window (v2 paginated helper)
      //    NOTE: requires fetchAttacksWindow(fromSec, toSec, targetHits, expectedLen)
      const attacks = await fetchAttacksWindow(
        startTs,
        withEndBuffer(endTs, 300),
        /*targetHits*/ null,
        expectedLen
      ).catch(() => []);

      // 4) Build timeline ONLY for hits where attacker_faction == ourFactionId
      const points = buildChainTimeline(
        attacks,
        startTs,
        expectedLen || null,
        ourFactionId
      );

      if (!points || points.length <= 1) {
        refs.chartCanvas.parentElement.style.display = "none";
        refs.hdLen.textContent =
          expectedLen != null ? String(expectedLen) : "0";
        refs.hdThresholdsBody.innerHTML = `<tr><td colspan="3" class="tce-small">
        No per-hit data parsed for this chain window (no qualifying attacks for our faction).
      </td></tr>`;
        toast(`chain #${chainId}: no per-hit data`);
        return;
      }

      // 5) Render chart (your existing function)
      refs.chartCanvas.parentElement.style.display = "";
      renderChart(points);

      // Final len shown: prefer expectedLen if known, else use last y
      const finalLen =
        expectedLen != null ? expectedLen : points[points.length - 1]?.y ?? 0;
      refs.hdLen.textContent = String(finalLen);

      // Thresholds table (keep your existing style/logic)
      const thresholdsForTable = Array.from(
        new Set([...STATE.thresholds, finalLen])
      ).sort((a, b) => a - b);
      const crossed = computeThresholdMoments(points, thresholdsForTable);
      refs.hdThresholdsBody.innerHTML = crossed
        .map(
          (c) => `
      <tr>
        <td class="tce-mono">${c.th}${c.th === finalLen ? " (final)" : ""}</td>
        <td class="tce-mono">${
          c.ts ? new Date(c.ts).toLocaleString() : "—"
        }</td>
        <td class="tce-mono">${
          c.ts ? fmtDeltaMin((c.ts / 1000 - startTs) / 60) : "—"
        }</td>
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
    // V2: top-level `chain` = chain counter at attack time
    const v = Number(row.chain);
    if (Number.isFinite(v) && v > 0) {
      const hardCap = 100000;
      if (v > hardCap) return NaN;
      if (!expectedLen || v <= expectedLen * 1.2) return v;
    }
    return NaN; // Do NOT use modifiers.chain (that's a respect modifier)
  }

  function getAttackTimestamp(row) {
    // V2 fields only
    const te = Number(row.ended);
    if (Number.isFinite(te) && te > 0) return te;
    const ts = Number(row.started);
    if (Number.isFinite(ts) && ts > 0) return ts;
    return NaN;
  }

  function getAttackerFactionId(row) {
    const v = row?.attacker?.faction?.id ?? null;
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  }

  // --- Timeline for OUR faction hits only (attacker_faction == OUR_FACTION_ID) ---
  function buildChainTimeline(
    attacks,
    startTsSec,
    expectedLen = null,
    ourFactionId = null
  ) {
    const startMs = startTsSec * 1000;
    const linkMinTs = new Map();
    let maxLink = 0;

    for (const a of attacks) {
      // Only count hits made BY our faction
      if (ourFactionId) {
        const atkFid = getAttackerFactionId(a);
        if (!Number.isFinite(atkFid) || atkFid !== Number(ourFactionId))
          continue;
      }

      const link = getLinkNumber(a, expectedLen); // >0 only
      if (!Number.isFinite(link) || link <= 0) continue;

      const ts = getAttackTimestamp(a); // prefer ended, then started
      if (!Number.isFinite(ts) || ts <= 0) continue;

      const ms = ts * 1000;
      const prev = linkMinTs.get(link);
      if (prev == null || ms < prev) linkMinTs.set(link, ms);
      if (link > maxLink) maxLink = link;
    }

    if (maxLink === 0) return [{ t: startMs, y: 0 }];

    const pts = [{ t: startMs, y: 0 }];
    for (let l = 1; l <= maxLink; l++) {
      let t = linkMinTs.get(l);
      if (!t) t = pts[pts.length - 1].t + 1; // strictly increasing X
      pts.push({ t, y: l });
    }
    return spreadWithinSecond(pts);
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
          if (pts[i + k].t <= pts[i + k - 1]?.t)
            pts[i + k].t = pts[i + k - 1].t + 1;
        }
      }
      i = j;
    }
    return pts;
  }

  function computeThresholdMoments(points, thresholds) {
    const tsByHit = new Map(points.map((p) => [p.y, p.t]));
    return thresholds.map((th) => ({ th, ts: tsByHit.get(th) ?? null }));
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
          {
            label: "Hit #",
            data,
            fill: false,
            tension: 0.15,
            pointRadius: 0,
            borderWidth: 2,
          },
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
                return `${String(d.getHours()).padStart(2, "0")}:${String(
                  d.getMinutes()
                ).padStart(2, "0")}`;
              },
            },
          },
          y: { beginAtZero: true, ticks: { precision: 0 } },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) =>
                items?.length
                  ? new Date(items[0].parsed.x).toLocaleString()
                  : "",
              label: (ctx) => `Hit #: ${ctx.parsed.y}`,
            },
          },
        },
        animation: false,
      },
    });
  }

  // ----------------- API helpers & cache -----------------
  function apiBase() {
    // V2 root
    return "https://api.torn.com/v2";
  }
  function isPublicMode() {
    return (
      STATE.usePublicKey ||
      (STATE.apiKey && STATE.apiKey.toLowerCase() === "public")
    );
  }
  function keyParam() {
    return isPublicMode() ? "public" : encodeURIComponent(STATE.apiKey);
  }

  // V2 URL builders (no legacy selections)
  function buildFactionChainUrl() {
    const u = new URL(`${apiBase()}/faction/chain`);
    u.searchParams.set("key", keyParam());
    // In public mode (and when override is set in private mode), include faction_id
    if (STATE.factionIdOverride)
      u.searchParams.set("faction_id", String(STATE.factionIdOverride));
    return u.href;
  }
  function buildFactionChainsUrl() {
    const u = new URL(`${apiBase()}/faction/chains`);
    u.searchParams.set("key", keyParam());
    if (STATE.factionIdOverride)
      u.searchParams.set("faction_id", String(STATE.factionIdOverride));
    return u.href;
  }
  function buildFactionAttacksUrl(fromSec, toSec) {
    const u = new URL(`${apiBase()}/faction/attacks`);
    u.searchParams.set("key", keyParam());
    u.searchParams.set("filters", "outgoing");
    u.searchParams.set("from", String(fromSec));
    u.searchParams.set("to", String(toSec));
    u.searchParams.set("comment", "chaintooldev");
    return u.href;
  }
  function buildUserProfileUrl() {
    const u = new URL(`${apiBase()}/user/profile`);
    u.searchParams.set("key", keyParam());
    return u.href;
  }
  function buildChainReportUrl(chainId) {
    const u = new URL(
      `${apiBase()}/faction/${encodeURIComponent(chainId)}/chainreport`
    );
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
              reject(
                new Error(
                  `HTTP ${res.status}: ${res.responseText?.slice(0, 200) || ""}`
                )
              );
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

  let OUR_FACTION_ID = null;

  async function fetchUserProfile() {
    const j = await httpGetJSON(buildUserProfileUrl());
    return {
      player_id: Number(j?.player_id ?? j?.player?.player_id ?? 0),
      name: String(j?.name ?? j?.player?.name ?? ""),
      faction_id: Number(j?.faction?.faction_id ?? j?.faction_id ?? 0),
      faction_name: String(j?.faction?.faction_name ?? j?.faction_name ?? ""),
    };
  }

  // Resolve the faction whose chain we care about
  async function resolveOurFactionId() {
    // If user forced a Faction ID, use it
    if (STATE.factionIdOverride) {
      OUR_FACTION_ID = Number(STATE.factionIdOverride) || null;
      return OUR_FACTION_ID;
    }
    // Public mode requires an explicit faction id
    if (isPublicMode()) {
      OUR_FACTION_ID = Number(STATE.factionIdOverride) || null;
      return OUR_FACTION_ID;
    }
    // Private key mode: infer from the key's user profile
    if (OUR_FACTION_ID) return OUR_FACTION_ID;
    const u = await fetchUserProfile().catch(() => null);
    OUR_FACTION_ID = Number(u?.faction_id) || null;
    return OUR_FACTION_ID;
  }

  function fetchChain() {
    const url = buildFactionChainUrl();
    return httpGetJSON(url)
      .catch((e) => {
        const msg = String(e.message || e);
        if (msg.startsWith("7:"))
          throw new Error(
            "7: Incorrect ID-entity relation. In public mode set a Faction ID. In private mode, ensure the key belongs to a member in the faction or set Faction ID override in Settings."
          );
        throw e;
      })
      .then((json) => {
        // V2 returns either { chain:{current,timeout} } or { current, timeout }
        let chainCurrent = undefined,
          timeoutSec = undefined;
        if (json && json.chain) {
          chainCurrent = Number(json.chain.current);
          timeoutSec = Number(json.chain.timeout ?? json.chain.time_left);
        }
        if (
          !Number.isFinite(chainCurrent) &&
          Number.isFinite(Number(json?.current))
        )
          chainCurrent = Number(json.current);
        if (
          !Number.isFinite(timeoutSec) &&
          Number.isFinite(Number(json?.timeout))
        )
          timeoutSec = Number(json.timeout);

        if (!Number.isFinite(chainCurrent))
          throw new Error("Missing chain.current");
        return {
          chainCurrent,
          timeoutSec: Number.isFinite(timeoutSec) ? timeoutSec : null,
          raw: json,
        };
      });
  }

  const DB_NAME = "torn_chain_cache";
  const DB_VER = 1;
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains("chainsList"))
          d.createObjectStore("chainsList");
        if (!d.objectStoreNames.contains("chainReports"))
          d.createObjectStore("chainReports");
        if (!d.objectStoreNames.contains("attacks"))
          d.createObjectStore("attacks");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
    // Drop the entire IndexedDB database (used by 'Clear cache')
    async function idbDeleteAll() {
      // Close existing connection so delete can proceed
      try {
        const d = await db();
        d.close();
      } catch {}
      dbp = null; // force a fresh open next time
      await new Promise((resolve) => {
        const req = indexedDB.deleteDatabase(DB_NAME);
        req.onsuccess = () => resolve(true);
        req.onerror = () => resolve(false);
        req.onblocked = () => resolve(false);
      });
    }
  }

  // Drop the entire IndexedDB database (called by cacheClearAll)
  async function idbDeleteAll() {
    try {
      const d = await db();
      d.close(); // close active connection so delete can succeed
    } catch {}
    dbp = null; // force fresh open next time

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

  async function cachedFetchChains(force = false) {
    const key = chainsCacheKey();
    const cached = await idbGet("chainsList", key);
    const now = Date.now();
    if (!force && cached && now - (cached.ts || 0) < STATE.chainsTTLms)
      return cached.data;
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
        return next.startsWith("/")
          ? `${b.origin}${next}`
          : new URL(next, b).href;
      } catch {
        return null;
      }
    }
    function normalize(rec) {
      const chain_id = Number(rec?.id ?? NaN);
      if (!Number.isFinite(chain_id)) return null;
      return {
        chain_id,
        start: Number(rec.start) || 0, // seconds
        end: Number(rec.end) || 0, // seconds
        chain: Number(rec.chain) || 0, // hits
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
          const msg = String(e?.message || e);
          if (msg.startsWith("7:")) {
            throw new Error(
              "7: Incorrect ID-entity relation. In public mode set Faction ID override in Settings, or use a key where you're a member in the faction."
            );
          }
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
    return httpGetJSON(url).then((j) =>
      j?.chainreport ? { chainreport: j.chainreport } : j
    );
  }

  async function cachedFetchAttacksForChain(
    chainId,
    fromSec,
    toSec,
    targetHits = null
  ) {
    if (isPublicMode())
      throw new Error("Public key mode: faction attacks are not available.");
    const key = String(chainId);
    const cached = await idbGet("attacks", key);

    if (cached && cached.complete && Array.isArray(cached.rows)) {
      if (!targetHits || (cached.seenLinks || 0) >= targetHits) {
        return cached.rows;
      }
    }

    const rows = await fetchAttacksWindow(fromSec, toSec, targetHits);
    const seenLinks = countUniqueLinks(rows);
    await idbPut("attacks", key, {
      rows,
      from: fromSec,
      to: toSec,
      ts: Date.now(),
      complete: true,
      seenLinks,
    });
    return rows;
  }

  function countUniqueLinks(rows) {
    const s = new Set();
    for (const r of rows) {
      if (OUR_FACTION_ID) {
        const atkFid = getAttackerFactionId(r);
        if (!Number.isFinite(atkFid) || atkFid !== Number(OUR_FACTION_ID))
          continue;
      }
      const l = getLinkNumber(r, null);
      if (Number.isFinite(l) && l > 0) s.add(l);
    }
    return s.size;
  }

  async function fetchAttacksWindow(
    fromSec,
    toSec,
    targetHits = null,
    expectedLen = null
  ) {
    const byCode = new Map();
    const keepResults = new Set(["Attacked", "Mugged", "Hospitalized"]);
    let cursor = fromSec;
    let safety = 0;

    while (cursor <= toSec && safety++ < STATE.maxAttackPages) {
      const url = buildFactionAttacksUrl(cursor, toSec);
      // back-off & retry on 429/rate-limit
      let payload;
      try {
        payload = await httpGetJSON(url);
      } catch (e) {
        const msg = String(e?.message || e);
        if (msg.includes("rate limit") || msg.includes("429")) {
          console.warn("Rate limited; backing off 5s…");
          await new Promise((r) => setTimeout(r, 5000));
          continue; // retry same cursor
        }
        throw e;
      }

      const batch = Array.isArray(payload?.attacks) ? payload.attacks : [];
      if (!batch.length) break;

      let maxEndedThisPage = 0;
      for (const r of batch) {
        const code = String(r.code ?? r.attack_id ?? r.id ?? "");
        if (!code || byCode.has(code)) continue;
        // only successful outgoing hits
        if (!keepResults.has(r.result)) continue;

        byCode.set(code, r);

        const ended = Number(r.ended ?? r.timestamp_ended ?? r.timestamp ?? 0);
        if (Number.isFinite(ended) && ended > maxEndedThisPage)
          maxEndedThisPage = ended;
      }
      // gentle pacing to stay well under Torn’s 100-req/min cap
      await new Promise((r) => setTimeout(r, 800));
      // advance cursor; bump +1s to avoid duplicates
      cursor = maxEndedThisPage > cursor ? maxEndedThisPage + 1 : cursor + 1;
      // optional early-stop checks
      if (targetHits && byCode.size >= targetHits) break;
      if (expectedLen) {
        const links = [...byCode.values()]
          .map((x) => Number(x.chain ?? 0))
          .filter((n) => n > 0);
        if (
          links.length &&
          Math.min(...links) === 1 &&
          Math.max(...links) >= expectedLen
        )
          break;
      }
    }
    // return sorted by ended time
    return Array.from(byCode.values()).sort(
      (a, b) => (a.ended ?? 0) - (b.ended ?? 0)
    );
  }
  startPolling();
})();
