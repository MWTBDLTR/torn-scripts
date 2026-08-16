// ==UserScript==
// @name         Torn War Push Detector
// @namespace    church-tools
// @version      0.1.0
// @description  Detects enemy faction attack-tempo spikes during ranked wars using real-time chain data and a self-calibrating statistical baseline. No ML, no training data required.
// @author       MrChurch [3654415]
// @match        https://www.torn.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      api.torn.com
// ==/UserScript==

(function () {
  "use strict";

  // =========================================================================
  // 1. CONFIG — the only section you should need to touch
  // =========================================================================
  const CONFIG = {
    apiBase: "https://api.torn.com/v2",
    pollIntervalMs: 30 * 1000, // chain endpoint is real-time/non-cached; 30s gives fine resolution
    ewmaAlpha: 0.3, // weight on new samples; higher = reacts faster, noisier
    zScoreElevated: 2.0, // std-devs above baseline => "Elevated"
    zScorePushing: 3.5, // std-devs above baseline => "Pushing"
    minSamplesBeforeAlerts: 5, // don't alert until the baseline has warmed up
    maxSamplesStored: 1440, // ~12 hrs of history at 30s polling
    tightTimeoutThreshold: 30, // seconds; refreshing this close to expiry flags as "managed"
    calibration: {
      chainsToSample: 15, // how many past chains to pull for a baseline
      minChainsForCalibration: 3, // below this, don't trust the seeded baseline
      attackLookbackDays: 60, // how far back to search your own attack log for this enemy
      maxPaginatedPages: 5, // hard cap on pages followed via _metadata.links.next
    },
  };

  // =========================================================================
  // 2. STORAGE — thin wrapper, one JSON blob per faction
  // =========================================================================
  const Storage = {
    key(factionId) {
      return `pushdet_${factionId}`;
    },
    load(factionId) {
      const raw = GM_getValue(this.key(factionId), null);
      return raw ? JSON.parse(raw) : null;
    },
    save(factionId, state) {
      GM_setValue(this.key(factionId), JSON.stringify(state));
    },
    getApiKey() {
      return GM_getValue("pushdet_apikey", "");
    },
    setApiKey(k) {
      GM_setValue("pushdet_apikey", k);
    },
    getWatchedFactions() {
      const raw = GM_getValue("pushdet_watchlist", "[]");
      return JSON.parse(raw);
    },
    setWatchedFactions(list) {
      GM_setValue("pushdet_watchlist", JSON.stringify(list));
    },
  };

  // =========================================================================
  // 3. RATE LIMITER — simple token bucket, keeps us well under 100/min
  // =========================================================================
  class RateLimiter {
    constructor(maxPerMinute) {
      this.max = maxPerMinute;
      this.calls = [];
    }
    canCall() {
      const now = Date.now();
      this.calls = this.calls.filter((t) => now - t < 60000);
      return this.calls.length < this.max;
    }
    record() {
      this.calls.push(Date.now());
    }
  }
  const limiter = new RateLimiter(60); // leave headroom under the 100/min cap

  // =========================================================================
  // 3b. LOGGER — feeds both the browser console and the in-panel debug view
  // =========================================================================
  const Logger = {
    entries: [], // [{t, level, msg}]
    maxEntries: 50,
    log(level, msg) {
      this.entries.push({ t: Date.now(), level, msg });
      if (this.entries.length > this.maxEntries) this.entries.shift();
      const fn = level === "info" ? "log" : level;
      console[fn](`[PushDetector] ${msg}`);
      UI.refreshDebug();
    },
    info(msg) {
      this.log("info", msg);
    },
    warn(msg) {
      this.log("warn", msg);
    },
    error(msg) {
      this.log("error", msg);
    },
  };

  // =========================================================================
  // 3c. RAW CACHE — last raw API response per faction, for the debug panel
  //     only. Not persisted — purely in-memory, resets on page reload.
  // =========================================================================
  const RawCache = {
    data: new Map(),
    get(factionId) {
      if (!this.data.has(factionId)) this.data.set(factionId, {});
      return this.data.get(factionId);
    },
  };

  // =========================================================================
  // 4. API LAYER — fetch + retry/backoff, never throws uncaught
  //    v2 /faction/{id}/chain returns real-time (non-cached) chain state for
  //    ANY faction: { chain: { id, current, max, timeout, modifier,
  //    cooldown, start, end } }
  // =========================================================================
  async function fetchFactionChain(factionId, apiKey, attempt = 0) {
    if (!limiter.canCall()) {
      Logger.warn(
        `rate limit guard tripped, skipping faction ${factionId} this cycle`,
      );
      return null;
    }
    const url = `${CONFIG.apiBase}/faction/${factionId}/chain?key=${apiKey}`;
    try {
      limiter.record();
      const res = await fetch(url);
      const data = await res.json();

      if (data.error) {
        // Torn API error codes: back off on rate-limit (5), don't retry on bad key (2)
        if (data.error.code === 5 && attempt < 2) {
          await sleep(2000 * (attempt + 1));
          return fetchFactionChain(factionId, apiKey, attempt + 1);
        }
        Logger.error(
          `chain fetch error (faction ${factionId}): ${JSON.stringify(data.error)}`,
        );
        return null;
      }
      return data.chain || null;
    } catch (err) {
      if (attempt < 2) {
        await sleep(1500 * (attempt + 1));
        return fetchFactionChain(factionId, apiKey, attempt + 1);
      }
      Logger.error(`chain fetch failed (faction ${factionId}): ${err}`);
      return null;
    }
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function escapeHtml(str) {
    return str.replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  }

  // =========================================================================
  // 4b. CALIBRATION — seeds a faction's EWMA baseline from history, so a
  //     newly-watched faction doesn't have to cold-start with no basis for
  //     comparison. Two sources, tried in order of quality:
  //
  //     (a) YOUR OWN faction/attacks log, filtered to incoming hits from
  //         this specific enemy during ranked wars. Real per-attack
  //         timestamps grouped by chain — the best available signal, but
  //         only exists if you've fought this faction before.
  //     (b) faction/{id}/chains — that faction's own list of past chains
  //         (against anyone). Coarser (one avg rate per chain, no per-hit
  //         detail) but works for any faction, including one you've never
  //         warred.
  // =========================================================================

  // Generic pager: follows _metadata.links.next up to maxPages, sharing the
  // same rate-limit budget as everything else. Fails soft — returns
  // whatever was collected if a later page errors out.
  async function fetchPaginated(initialUrl, dataKey, maxPages) {
    let url = initialUrl;
    let all = [];
    let pages = 0;
    while (url && pages < maxPages) {
      if (!limiter.canCall()) break;
      try {
        limiter.record();
        const res = await fetch(url);
        const data = await res.json();
        if (data.error) {
          Logger.error(`paginated fetch error: ${JSON.stringify(data.error)}`);
          break;
        }
        all = all.concat(data[dataKey] || []);
        url = data._metadata?.links?.next || null;
        pages++;
      } catch (err) {
        Logger.error(`paginated fetch failed: ${err}`);
        break;
      }
    }
    return all;
  }

  // --- Source (a): this specific enemy's incoming attacks against you ---
  async function fetchIncomingAttacksFrom(targetFactionId, apiKey) {
    const now = Math.floor(Date.now() / 1000);
    const fromTs = now - CONFIG.calibration.attackLookbackDays * 86400;
    const params = new URLSearchParams({
      filters: "incoming", // schema says array[string]; single value works for URLSearchParams —
      // switch to params.append('filters', ...) per-value if the API needs repeats
      limit: "100", // API max per page
      sort: "DESC",
      to: String(now),
      from: String(fromTs),
      timestamp: String(now), // bypasses cache so calibration reflects the latest data
      comment: "PushDetector-calibration",
      key: apiKey,
    });
    const url = `${CONFIG.apiBase}/faction/attacks?${params.toString()}`;
    const attacks = await fetchPaginated(
      url,
      "attacks",
      CONFIG.calibration.maxPaginatedPages,
    );
    return attacks.filter(
      (a) =>
        a.is_ranked_war &&
        a.chain > 0 &&
        String(a.attacker?.faction?.id) === String(targetFactionId),
    );
  }

  function groupAttacksByChain(attacks) {
    const byChain = new Map();
    for (const a of attacks) {
      if (!byChain.has(a.chain)) byChain.set(a.chain, []);
      byChain.get(a.chain).push(a);
    }
    const parsed = [];
    for (const [chainId, group] of byChain) {
      if (group.length < 2) continue; // need at least 2 hits to get a duration
      const starts = group.map((a) => a.started);
      const ends = group.map((a) => a.ended);
      const start = Math.min(...starts);
      const end = Math.max(...ends);
      const durationMin = (end - start) / 60;
      if (durationMin <= 0) continue;
      parsed.push({
        id: chainId,
        hits: group.length,
        durationMin,
        rate: group.length / durationMin,
      });
    }
    return parsed;
  }

  // --- Source (b): the faction's own list of past chains (any opponent) ---
  async function fetchPastChains(factionId, apiKey) {
    const url = `${CONFIG.apiBase}/faction/${factionId}/chains?key=${apiKey}`;
    return fetchPaginated(url, "chains", CONFIG.calibration.maxPaginatedPages);
  }

  function parseChainList(rawChains) {
    const parsed = [];
    for (const c of rawChains.slice(0, CONFIG.calibration.chainsToSample)) {
      const hits = c.chain; // confirmed field name
      const { start, end } = c;
      if (!hits || !start || !end || end <= start) continue;
      const durationMin = (end - start) / 60;
      if (durationMin <= 0) continue;
      parsed.push({ id: c.id, hits, durationMin, rate: hits / durationMin });
    }
    return parsed;
  }

  // --- Shared: turn a list of {rate} into mean/variance ---
  function computeStatsFromRates(parsed) {
    if (parsed.length < CONFIG.calibration.minChainsForCalibration) {
      return { ok: false, sampleCount: parsed.length };
    }
    const rates = parsed.map((p) => p.rate);
    const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
    const variance =
      rates.reduce((a, b) => a + (b - mean) ** 2, 0) / rates.length;
    return {
      ok: true,
      sampleCount: parsed.length,
      meanRate: mean,
      variance,
      stdDev: Math.sqrt(variance),
    };
  }

  async function calibrateFaction(factionId, apiKey) {
    // Try the higher-quality source first: this faction's actual attacks on you.
    const priorAttacks = await fetchIncomingAttacksFrom(factionId, apiKey);
    const attackChains = groupAttacksByChain(priorAttacks);
    let result = computeStatsFromRates(attackChains);
    let source = "attacks";
    let sample = attackChains.slice(0, 3);

    if (!result.ok) {
      // Fall back to their general chain history against anyone.
      const rawChains = await fetchPastChains(factionId, apiKey);
      const parsedChains = parseChainList(rawChains);
      result = computeStatsFromRates(parsedChains);
      source = "chains";
      sample = parsedChains.slice(0, 3);
    }

    const state = freshState();
    if (result.ok) {
      state.ewmaRate = result.meanRate;
      state.ewmaVar = result.variance;
      state.calibratedFrom = result.sampleCount;
      state.calibrationSource = source;
      Logger.info(
        `calibrated faction ${factionId} from ${result.sampleCount} ${source} (${result.meanRate.toFixed(1)} ± ${result.stdDev.toFixed(1)} hits/min)`,
      );
    } else {
      Logger.warn(
        `calibration for faction ${factionId} inconclusive (only ${result.sampleCount} usable ${source} groups)`,
      );
    }
    Storage.save(factionId, state);

    const cache = RawCache.get(factionId);
    cache.lastCalibration = {
      ...result,
      source,
      timestamp: Date.now(),
      sample,
    };

    return { ...result, source };
  }

  // =========================================================================
  // 5. ANALYZER — EWMA baseline + rolling z-score, per faction
  //    No training data needed: the baseline calibrates itself from that
  //    faction's own recent behavior.
  // =========================================================================
  function freshState() {
    return {
      samples: [], // [{t, current, timeout, chainId}]
      ewmaRate: null, // running mean of hits-per-minute
      ewmaVar: null, // running variance of that rate
      lastStatus: "Normal",
      tightRefreshes: 0, // count of hits landed under tightTimeoutThreshold
      totalHits: 0,
      calibratedFrom: null, // number of past chains/attack-groups used to seed the baseline, if any
      calibrationSource: null, // 'attacks' (best) or 'chains' (fallback), or null if uncalibrated
    };
  }

  function updateAnalysis(state, chain, now) {
    const sample = {
      t: now,
      current: chain.current,
      timeout: chain.timeout,
      chainId: chain.id,
    };
    const prev = state.samples[state.samples.length - 1];
    state.samples.push(sample);
    if (state.samples.length > CONFIG.maxSamplesStored) state.samples.shift();

    if (!prev) return state;

    // A new chain (different id, or current reset lower) invalidates the delta —
    // don't let a chain break/restart look like a negative attack rate.
    const sameChain = prev.chainId === chain.id;
    const hitsDelta = sameChain ? chain.current - prev.current : 0;
    const dtMin = (now - prev.t) / 60000;
    if (dtMin <= 0 || hitsDelta < 0) return state;

    if (hitsDelta > 0) {
      state.totalHits += hitsDelta;
      // A hit landing with little time left on the timeout suggests active,
      // deliberate chain management rather than casual/incidental hits.
      if (chain.timeout <= CONFIG.tightTimeoutThreshold) state.tightRefreshes++;
    }

    const rate = hitsDelta / dtMin; // hits per minute

    if (state.ewmaRate === null) {
      state.ewmaRate = rate;
      state.ewmaVar = 0;
    } else {
      const delta = rate - state.ewmaRate;
      state.ewmaRate = state.ewmaRate + CONFIG.ewmaAlpha * delta;
      state.ewmaVar =
        (1 - CONFIG.ewmaAlpha) *
        (state.ewmaVar + CONFIG.ewmaAlpha * delta * delta);
    }

    const std = Math.sqrt(Math.max(state.ewmaVar, 0.0001));
    const z = (rate - state.ewmaRate) / std;

    let status = "Normal";
    const hasBasis =
      state.calibratedFrom ||
      state.samples.length >= CONFIG.minSamplesBeforeAlerts;
    if (hasBasis) {
      if (z >= CONFIG.zScorePushing) status = "PUSHING";
      else if (z >= CONFIG.zScoreElevated) status = "Elevated";
    }

    state.lastStatus = status;
    state.lastRate = rate;
    state.lastZ = z;
    return state;
  }

  // =========================================================================
  // 6. CORE LOOP — ties collection + analysis together per watched faction
  // =========================================================================
  async function pollAll() {
    const apiKey = Storage.getApiKey();
    const watchlist = Storage.getWatchedFactions();
    if (!apiKey || watchlist.length === 0) return;

    for (const factionId of watchlist) {
      const chain = await fetchFactionChain(factionId, apiKey);
      const cache = RawCache.get(factionId);
      cache.lastPollTime = Date.now();
      cache.lastChain = chain;
      if (!chain) continue; // no chain running, or call failed — skip this cycle

      let state = Storage.load(factionId) || freshState();
      state = updateAnalysis(state, chain, Date.now());
      Storage.save(factionId, state);
    }
    Logger.info(`poll cycle complete (${watchlist.length} faction(s) watched)`);
    UI.refresh();
  }

  // =========================================================================
  // 7. UI — minimal floating panel, no dependencies
  // =========================================================================
  const UI = {
    panel: null,
    init() {
      const panel = document.createElement("div");
      panel.id = "push-detector-panel";
      panel.style.cssText = `
        position: fixed; top: 60px; right: 10px; z-index: 9999;
        background: #1b1b1b; color: #eee; font: 12px monospace;
        border: 1px solid #444; border-radius: 6px; padding: 8px 10px;
        min-width: 260px; max-width: 340px; box-shadow: 0 2px 8px rgba(0,0,0,0.5);
      `;
      panel.innerHTML = `
        <div style="font-weight:bold; margin-bottom:4px; display:flex; justify-content:space-between; align-items:center;">
          <span>War Push Detector</span>
          <span>
            <button id="pd-setup-btn" style="${UI.btnStyle}" title="Configure API key & watched factions">⚙ setup</button>
            <button id="pd-calibrate-btn" style="${UI.btnStyle}" title="Seed baselines from chain history">↻ calibrate</button>
            <button id="pd-debug-btn" style="${UI.btnStyle}" title="Toggle debug panel">🐞</button>
          </span>
        </div>
        <div id="pd-body">Not configured. Click "setup" to begin.</div>
        <div id="pd-debug" style="display:none; margin-top:8px; padding-top:6px; border-top:1px solid #333;">
          <div id="pd-debug-status" style="color:#999; font-size:10px; margin-bottom:4px;"></div>
          <div id="pd-log" style="max-height:120px; overflow-y:auto; font-size:10px; line-height:1.5; margin-bottom:6px; background:#111; border-radius:4px; padding:4px 6px;"></div>
          <div id="pd-raw"></div>
        </div>
      `;
      document.body.appendChild(panel);
      panel.querySelector("#pd-setup-btn").onclick = () => UI.promptSetup();
      panel.querySelector("#pd-calibrate-btn").onclick = () =>
        UI.calibrateAll();
      panel.querySelector("#pd-debug-btn").onclick = () => UI.toggleDebug();
      this.panel = panel;
    },
    btnStyle:
      "font:11px monospace; cursor:pointer; background:#2a2a2a; color:#eee; border:1px solid #444; border-radius:3px; padding:1px 5px;",
    debugOpen: false,
    toggleDebug() {
      this.debugOpen = !this.debugOpen;
      this.panel.querySelector("#pd-debug").style.display = this.debugOpen
        ? "block"
        : "none";
      if (this.debugOpen) this.refreshDebug();
    },
    refresh() {
      if (!this.panel) return;
      const watchlist = Storage.getWatchedFactions();
      if (watchlist.length === 0) {
        this.panel.querySelector("#pd-body").textContent =
          'Not configured. Click "setup" to begin.';
        return;
      }
      const rows = watchlist.map((id) => {
        const s = Storage.load(id);
        if (!s) return `${id}: no data yet`;
        const basis = s.calibratedFrom
          ? `calibrated from ${s.calibratedFrom} ${s.calibrationSource === "attacks" ? "past encounters with this faction" : "of their past chains"}`
          : s.samples.length < CONFIG.minSamplesBeforeAlerts
            ? `warming up (${s.samples.length}/${CONFIG.minSamplesBeforeAlerts} live samples)`
            : "live baseline only";
        if (s.samples.length < 1) return `${id}: ${basis}`;
        const color =
          s.lastStatus === "PUSHING"
            ? "#ff4444"
            : s.lastStatus === "Elevated"
              ? "#ffaa33"
              : "#66cc66";
        const tightPct =
          s.totalHits > 0
            ? Math.round((100 * s.tightRefreshes) / s.totalHits)
            : 0;
        return `<div style="margin-bottom:3px;">
          <div style="color:${color}">${id}: ${s.lastStatus} (${s.lastRate?.toFixed(1) ?? "—"} hits/min, z ${s.lastZ?.toFixed(1) ?? "—"}, ${tightPct}% tight refresh)</div>
          <div style="color:#888; font-size:10px;">${basis}</div>
        </div>`;
      });
      this.panel.querySelector("#pd-body").innerHTML = rows.join("");
      if (this.debugOpen) this.refreshDebug();
    },
    refreshDebug() {
      if (!this.panel || !this.debugOpen) return;

      // Status line
      const watchlist = Storage.getWatchedFactions();
      const lastPolls = watchlist
        .map((id) => RawCache.get(id).lastPollTime)
        .filter(Boolean);
      const lastPollStr = lastPolls.length
        ? new Date(Math.max(...lastPolls)).toLocaleTimeString()
        : "never";
      this.panel.querySelector("#pd-debug-status").textContent =
        `last poll: ${lastPollStr} · watching ${watchlist.length} faction(s)`;

      // Log feed — newest first, color-coded
      const logColor = { error: "#ff6666", warn: "#ffaa33", info: "#7ab8ff" };
      const logHtml =
        Logger.entries
          .slice()
          .reverse()
          .slice(0, 25)
          .map((e) => {
            const time = new Date(e.t).toLocaleTimeString();
            return `<div style="color:${logColor[e.level]}">${time} · ${escapeHtml(e.msg)}</div>`;
          })
          .join("") || '<div style="color:#666;">no log entries yet</div>';
      this.panel.querySelector("#pd-log").innerHTML = logHtml;

      // Raw per-faction data — native <details> keeps this simple and accessible
      const rawHtml =
        watchlist
          .map((id) => {
            const cache = RawCache.get(id);
            const chainJson = cache.lastChain
              ? JSON.stringify(cache.lastChain, null, 2)
              : "no data yet";
            const calibJson = cache.lastCalibration
              ? JSON.stringify(cache.lastCalibration, null, 2)
              : "not calibrated yet";
            return `
          <details style="margin-bottom:4px;">
            <summary style="cursor:pointer; color:#aaa; font-size:10px;">faction ${id} — raw data</summary>
            <div style="font-size:10px; color:#888; margin:3px 0 1px;">last /chain response</div>
            <pre style="background:#111; border-radius:4px; padding:4px 6px; margin:0 0 4px; max-height:140px; overflow:auto; font-size:10px;">${escapeHtml(chainJson)}</pre>
            <div style="font-size:10px; color:#888; margin:3px 0 1px;">last calibration result</div>
            <pre style="background:#111; border-radius:4px; padding:4px 6px; margin:0; max-height:140px; overflow:auto; font-size:10px;">${escapeHtml(calibJson)}</pre>
          </details>
        `;
          })
          .join("") ||
        '<div style="color:#666; font-size:10px;">no factions watched yet</div>';
      this.panel.querySelector("#pd-raw").innerHTML = rawHtml;
    },
    async calibrateAll() {
      const apiKey = Storage.getApiKey();
      const watchlist = Storage.getWatchedFactions();
      if (!apiKey || watchlist.length === 0) {
        alert("Set up an API key and at least one faction ID first.");
        return;
      }
      this.panel.querySelector("#pd-body").textContent =
        "Calibrating from chain history...";
      for (const factionId of watchlist) {
        await calibrateFaction(factionId, apiKey); // logs its own result via Logger
      }
      this.refresh();
    },
    promptSetup() {
      const currentKey = Storage.getApiKey();
      const key = prompt("Torn API key (Limited access is fine):", currentKey);
      if (key !== null) Storage.setApiKey(key.trim());

      const currentList = Storage.getWatchedFactions().join(",");
      const list = prompt(
        "Faction ID(s) to watch, comma-separated:",
        currentList,
      );
      if (list !== null) {
        const ids = list
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        Storage.setWatchedFactions(ids);
      }
      this.refresh();
    },
  };

  // =========================================================================
  // 8. BOOT
  // =========================================================================
  UI.init();
  pollAll();
  setInterval(pollAll, CONFIG.pollIntervalMs);
})();
