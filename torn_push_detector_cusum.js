// ==UserScript==
// @name         Torn War Push Detector TEST
// @namespace    church-tools
// @version      1.1.7
// @author       MrChurch [3654415]
// @description  Detects enemy faction attack-tempo spikes during ranked wars using real-time chain data and a statistical baseline.
// @match        https://www.torn.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_addValueChangeListener
// @connect      api.torn.com
// ==/UserScript==

/* CHANGELOG
 * 1.1.8 - Added Faction API perm toggle for more accurate calibration via incoming attacks
 *       - Updated fetchChainVerdict to ignore ongoing chains
 * 1.1.7 - Implemented concurrent polling via Promise.all for faster cycle times
 *       - Replaced DOM innerHTML wiping with targeted ID element updates (fixes focus loss)
 *       - Added in-memory JSON state caching to prevent excessive synchronous GM_getValue reads
 *       - Optimized rate limiter sliding window with index tracking
 * 1.1.6 - Added "⚠ recalc" button to clear the chain cache and immediately recalculate stats from scratch
 * 1.1.5 - optimized canCall() to avoid repeated array filtering and redundant GM_getValue reads
 *       - and string-parsing within getOverrides() and setOverrides() bypassed by caching the parsed object in memory
 * 1.1.4 — add maxBaselineChainLength to exclude massive chaining events from resting tempo baselines
 *       - add chainID to debug panel for easier cross-reference with chainreport
 * 1.1.3 — refactor to CUSUM statistical method for testing
 */

(function () {
  ("use strict");

  // =========================================================================
  // 1. CONFIG
  // =========================================================================
  const CONFIG = {
    apiBase: "https://api.torn.com/v2",
    pollIntervalMs: 30 * 1000,
    cusum: {
      slackMultiplier: 0.5,
      elevatedThresholdMulti: 1.5,
      pushThresholdMulti: 3.0,
    },
    tightTimeoutThreshold: 30,
    maxSamplesStored: 1440,
    liveModel: {
      warmupMinChainMinutes: 1,
      warmupMinHits: 5,
      minBaselineChains: 5,
    },
    calibration: {
      chainsListLimit: 100,
      targetWarChains: 20,
      minChainsForCalibration: 5,
      defaultBaselineChains: 20,
      attackLookbackDays: 60,
      maxPaginatedPages: 5,
      maxReportsPerCalibration: 60,
      minWarChainLength: 50,
      maxBaselineChainLength: 10000,
      backgroundReportsPerCycle: 3,
    },
    cache: {
      maxFactions: 10,
      maxChainsPerFaction: 100,
      ownFactionId: null,
    },
  };

  const BONUS_THRESHOLDS = [
    10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000,
  ];
  function bonusesReached(chainLength) {
    return BONUS_THRESHOLDS.filter((t) => chainLength >= t).length;
  }

  // =========================================================================
  // 2. STORAGE — Cached memory wrappers
  // =========================================================================
  const Storage = {
    _stateCache: new Map(),
    key(factionId) {
      return `wpd_state_${factionId}`;
    },
    load(factionId) {
      if (this._stateCache.has(factionId))
        return this._stateCache.get(factionId);
      const raw = GM_getValue(this.key(factionId), null);
      if (!raw) return null;
      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch {
        return null;
      }
      const migrated = migrateState(parsed);
      this._stateCache.set(factionId, migrated);
      return migrated;
    },
    save(factionId, state) {
      this._stateCache.set(factionId, state);
      GM_setValue(this.key(factionId), JSON.stringify(state));
    },
    clearCache() {
      this._stateCache.clear();
    },
    getApiKey() {
      return GM_getValue("wpd_apikey", "");
    },
    setApiKey(k) {
      GM_setValue("wpd_apikey", k);
    },
    getWatchedFactions() {
      const raw = GM_getValue("wpd_watchlist", "[]");
      return JSON.parse(raw);
    },
    setWatchedFactions(list) {
      GM_setValue("wpd_watchlist", JSON.stringify(list));
    },
    getOwnFactionId() {
      return GM_getValue("wpd_ownfaction", null);
    },
    setOwnFactionId(id) {
      GM_setValue("wpd_ownfaction", id || null);
    },
    getUiState() {
      const raw = GM_getValue("wpd_uistate", null);
      return raw ? JSON.parse(raw) : {};
    },
    setUiState(state) {
      GM_setValue("wpd_uistate", JSON.stringify(state));
    },
    getFactionNames() {
      const raw = GM_getValue("wpd_facnames", null);
      return raw ? JSON.parse(raw) : {};
    },
    getFactionName(id) {
      return this.getFactionNames()[id] || null;
    },
    setFactionName(id, name) {
      const names = this.getFactionNames();
      names[id] = name;
      GM_setValue("wpd_facnames", JSON.stringify(names));
    },

    _overridesCache: null,
    _getOverridesData() {
      if (this._overridesCache === null) {
        const raw = GM_getValue("wpd_overrides", null);
        this._overridesCache = raw ? JSON.parse(raw) : {};
      }
      return this._overridesCache;
    },
    getOverrides(id) {
      return this._getOverridesData()[id] || {};
    },
    setOverrides(id, overrides) {
      const all = this._getOverridesData();
      all[id] = overrides;
      GM_setValue("wpd_overrides", JSON.stringify(all));
    },
    getDataUpdatedTs() {
      return GM_getValue("wpd_data_ts", 0);
    },
    markDataUpdated() {
      GM_setValue("wpd_data_ts", Date.now());
    },
    getAttacksPerm() {
      // Default to false so we don't assume they have faction access
      return GM_getValue("wpd_attacks_perm", false);
    },
    setAttacksPerm(bool) {
      GM_setValue("wpd_attacks_perm", !!bool);
    },
  };

  const ChainCache = {
    indexKey: "wpd_chaincache_index",
    factionKey(id) {
      return `wpd_chaincache_${id}`;
    },
    loadIndex() {
      const raw = GM_getValue(this.indexKey, null);
      return raw ? JSON.parse(raw) : {};
    },
    saveIndex(idx) {
      GM_setValue(this.indexKey, JSON.stringify(idx));
    },
    loadFaction(factionId) {
      const raw = GM_getValue(this.factionKey(factionId), null);
      return raw ? JSON.parse(raw) : {};
    },
    saveFaction(factionId, chains) {
      GM_setValue(this.factionKey(factionId), JSON.stringify(chains));
    },
    dropFaction(factionId) {
      GM_deleteValue(this.factionKey(factionId));
      const idx = this.loadIndex();
      delete idx[factionId];
      this.saveIndex(idx);
    },
    getChain(factionId, chainId) {
      const chains = this.loadFaction(factionId);
      return chains[chainId] || null;
    },
    putChains(factionId, verdictsById) {
      const chains = this.loadFaction(factionId);
      Object.assign(chains, verdictsById);
      const ids = Object.keys(chains).sort(
        (a, b) => (chains[a].start || 0) - (chains[b].start || 0),
      );
      const overflow = ids.length - CONFIG.cache.maxChainsPerFaction;
      if (overflow > 0) {
        for (let i = 0; i < overflow; i++) delete chains[ids[i]];
      }
      this.saveFaction(factionId, chains);
      this.touch(factionId);
    },
    touch(factionId) {
      const idx = this.loadIndex();
      idx[factionId] = Date.now();
      this.saveIndex(idx);
      const own = String(Storage.getOwnFactionId() || "");
      const evictable = Object.keys(idx).filter((id) => id !== own);
      const overflow =
        evictable.length + (own && idx[own] ? 1 : 0) - CONFIG.cache.maxFactions;
      if (overflow > 0) {
        evictable.sort((a, b) => idx[a] - idx[b]);
        for (let i = 0; i < overflow && i < evictable.length; i++)
          this.dropFaction(evictable[i]);
      }
    },
    summary() {
      const idx = this.loadIndex();
      const own = String(Storage.getOwnFactionId() || "");
      return Object.keys(idx)
        .sort((a, b) => idx[b] - idx[a])
        .map((id) => {
          const count = Object.keys(this.loadFaction(id)).length;
          return {
            factionId: id,
            chains: count,
            pinned: id === own,
            lastAccess: idx[id],
          };
        });
    },
  };

  // =========================================================================
  // 3. RATE LIMITER — Optimized Pointer Array
  // =========================================================================
  class RateLimiter {
    constructor(maxPerMinute) {
      this.max = maxPerMinute;
      this.calls = [];
      this.head = 0;
    }
    canCall() {
      const cutoff = Date.now() - 60000;
      while (this.head < this.calls.length && this.calls[this.head] < cutoff) {
        this.head++;
      }
      if (this.head > 50) {
        this.calls = this.calls.slice(this.head);
        this.head = 0;
      }
      return this.calls.length - this.head < this.max;
    }
    record() {
      this.calls.push(Date.now());
    }
    ratePerMinute() {
      const cutoff = Date.now() - 60000;
      let count = 0;
      for (let i = this.head; i < this.calls.length; i++) {
        if (this.calls[i] >= cutoff) count++;
      }
      return count;
    }
    lastCallTime() {
      return this.calls.length > this.head
        ? this.calls[this.calls.length - 1]
        : null;
    }
    utilization() {
      return this.ratePerMinute() / this.max;
    }
  }
  const limiter = new RateLimiter(60);

  const Logger = {
    entries: [],
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

  const RawCache = {
    data: new Map(),
    get(factionId) {
      if (!this.data.has(factionId)) this.data.set(factionId, {});
      return this.data.get(factionId);
    },
  };

  // =========================================================================
  // 4. API LAYER
  // =========================================================================
  async function fetchFactionChain(factionId, apiKey, attempt = 0) {
    if (!limiter.canCall()) {
      Logger.warn(
        `rate limit guard tripped, skipping faction ${factionId} this cycle`,
      );
      return { ok: false };
    }
    const url = `${CONFIG.apiBase}/faction/${factionId}/chain?key=${apiKey}`;
    try {
      limiter.record();
      const res = await fetch(url);
      const data = await res.json();
      if (data.error) {
        if (data.error.code === 5 && attempt < 2) {
          await sleep(2000 * (attempt + 1));
          return fetchFactionChain(factionId, apiKey, attempt + 1);
        }
        Logger.error(
          `chain fetch error (faction ${factionId}): ${explainApiError(data.error)}`,
        );
        return { ok: false };
      }
      return { ok: true, chain: data.chain || null };
    } catch (err) {
      if (attempt < 2) {
        await sleep(1500 * (attempt + 1));
        return fetchFactionChain(factionId, apiKey, attempt + 1);
      }
      Logger.error(`chain fetch failed (faction ${factionId}): ${err}`);
      return { ok: false };
    }
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function ensureFactionName(factionId, apiKey) {
    if (Storage.getFactionName(factionId)) return;
    if (!limiter.canCall()) return;
    const url = `${CONFIG.apiBase}/faction/${factionId}/basic?key=${apiKey}`;
    try {
      limiter.record();
      const res = await fetch(url);
      const data = await res.json();
      if (data.error) return;
      const name = data.basic?.name;
      if (name) Storage.setFactionName(factionId, name);
    } catch {}
  }

  function factionLabel(factionId) {
    const name = Storage.getFactionName(factionId);
    return name ? `${name} [${factionId}]` : `Faction ${factionId}`;
  }

  const API_ERROR_HINTS = {
    2: "API key is invalid or malformed.",
    5: "Rate limited — the key is temporarily blocked for too many requests.",
    7: "Selection is private for this key.",
    16: "Key access level is too low for this selection.",
  };
  function explainApiError(err) {
    const hint = API_ERROR_HINTS[err.code];
    return hint
      ? `${err.error} (code ${err.code}) — ${hint}`
      : `${err.error} (code ${err.code})`;
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
  // 4b. CALIBRATION
  // =========================================================================
  async function fetchPaginated(
    initialUrl,
    dataKey,
    maxPages,
    label = dataKey,
  ) {
    let url = initialUrl;
    let all = [];
    let pages = 0;
    while (url && pages < maxPages) {
      if (!limiter.canCall()) {
        Logger.warn(
          `${label} pagination stopped — rate budget exhausted (${all.length}/${dataKey} items collected)`,
        );
        break;
      }
      try {
        limiter.record();
        const res = await fetch(url);
        const data = await res.json();
        if (data.error) {
          Logger.error(`${label} fetch error: ${explainApiError(data.error)}`);
          break;
        }
        all = all.concat(data[dataKey] || []);
        url = data._metadata?.links?.next || null;
        pages++;
      } catch (err) {
        Logger.error(`${label} fetch failed: ${err}`);
        break;
      }
    }
    return all;
  }

  async function fetchIncomingAttacksFrom(targetFactionId, apiKey) {
    const now = Math.floor(Date.now() / 1000);
    const fromTs = now - CONFIG.calibration.attackLookbackDays * 86400;
    const params = new URLSearchParams({
      filters: "incoming",
      limit: "100",
      sort: "DESC",
      to: String(now),
      from: String(fromTs),
      timestamp: String(now),
      comment: "PushDetector-calibration",
      key: apiKey,
    });
    const url = `${CONFIG.apiBase}/faction/attacks?${params.toString()}`;
    const attacks = await fetchPaginated(
      url,
      "attacks",
      CONFIG.calibration.maxPaginatedPages,
      `attacks history vs faction ${targetFactionId}`,
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
      if (group.length < 2) continue;
      const starts = group.map((a) => a.started);
      const ends = group.map((a) => a.ended);
      const start = Math.min(...starts);
      const end = Math.max(...ends);
      const durationMin = (end - start) / 60;
      if (durationMin <= 0) continue;
      parsed.push({
        id: chainId,
        hits: group.length,
        totalHits: null,
        durationMin,
        rate: group.length / durationMin,
      });
    }
    return parsed;
  }

  async function fetchPastChains(factionId, apiKey) {
    const url = `${CONFIG.apiBase}/faction/${factionId}/chains?key=${apiKey}`;
    return fetchPaginated(
      url,
      "chains",
      CONFIG.calibration.maxPaginatedPages,
      `chain history for faction ${factionId}`,
    );
  }

  async function verifyWarChains(attackChains, factionId, apiKey) {
    const map = new Map();
    let verifiedByCrossRef = 0;
    let verifiedByReport = 0;

    const rawChains = await fetchPastChains(factionId, apiKey);
    for (const c of rawChains) {
      if (c.id <= 0 || !c.chain) continue;
      map.set(String(c.id), { length: c.chain, source: "cross-ref" });
    }

    for (const ac of attackChains) {
      const entry = map.get(String(ac.id));
      if (entry && entry.length >= CONFIG.calibration.minWarChainLength)
        verifiedByCrossRef++;
    }

    const apiCallCap = Math.max(
      50,
      CONFIG.calibration.maxReportsPerCalibration - verifiedByCrossRef,
    );
    for (const ac of attackChains) {
      if (map.has(String(ac.id))) continue;
      if (apiCallCap <= 0) break;
      apiCallCap--;
      const verdict = await fetchChainVerdict(ac.id, apiKey);
      if (
        verdict &&
        verdict.qualifies &&
        verdict.length >= CONFIG.calibration.minWarChainLength
      ) {
        verifiedByReport++;
        map.set(String(ac.id), {
          length: verdict.length,
          source: "chainreport",
        });
      }
    }

    return {
      warHits: (id) => map.get(String(id))?.length >> 0,
      allVerified: map.size,
      verifiedByCrossRef,
      verifiedByReport,
    };
  }

  async function fetchChainVerdict(chainId, apiKey) {
    if (!limiter.canCall()) return null;
    const url = `${CONFIG.apiBase}/faction/${chainId}/chainreport?key=${apiKey}`;
    try {
      limiter.record();
      const res = await fetch(url);
      const data = await res.json();
      if (data.error) {
        Logger.error(
          `chainreport ${chainId} error: ${explainApiError(data.error)}`,
        );
        return null;
      }

      const report = data.chainreport;

      // If the report is ongoing (no end timestamp), reject it immediately.
      // Torn returns 0 or omits the key for ongoing chains.
      const ended = !!report.end && report.end > 0;
      if (!ended) {
        Logger.info(`chainreport ${chainId} ignored: chain is still ongoing`);
        return null;
      }

      const d = report?.details;
      if (!d || !d.chain) return null;

      const warHits = d.war ?? 0;
      const length = d.chain;
      const bonuses = bonusesReached(length);
      const qualifies =
        length >= CONFIG.calibration.minWarChainLength
          ? warHits > 0
          : warHits >= bonuses;

      return { qualifies, warHits, bonuses, length, ended };
    } catch (err) {
      Logger.error(`chainreport ${chainId} failed: ${err}`);
      return null;
    }
  }

  async function filterToWarChains(parsedChains, factionId, apiKey, opts = {}) {
    const target = opts.target ?? CONFIG.calibration.targetWarChains;
    const apiCallCap =
      opts.apiCallCap ?? CONFIG.calibration.maxReportsPerCalibration;
    const warChains = [];
    let dropped = 0,
      cacheHits = 0,
      apiCalls = 0;
    const newVerdicts = {};

    for (const chain of parsedChains) {
      if (warChains.length >= target) break;
      const cached = ChainCache.getChain(factionId, chain.id);
      if (cached) {
        cacheHits++;
        if (cached.qualifies)
          warChains.push({
            ...chain,
            warHits: cached.warHits,
            bonuses: cached.bonuses,
            cached: true,
          });
        else dropped++;
        continue;
      }
      if (apiCalls >= apiCallCap) break;
      apiCalls++;
      const verdict = await fetchChainVerdict(chain.id, apiKey);
      if (!verdict) {
        dropped++;
        continue;
      }

      if (verdict.ended) {
        newVerdicts[chain.id] = {
          rate: chain.rate,
          durationMin: chain.durationMin,
          warHits: verdict.warHits,
          bonuses: verdict.bonuses,
          qualifies: verdict.qualifies,
          length: verdict.length,
          start: chain.start,
          end: chain.end,
        };
      }

      if (verdict.qualifies)
        warChains.push({
          ...chain,
          warHits: verdict.warHits,
          bonuses: verdict.bonuses,
        });
      else dropped++;
    }

    if (Object.keys(newVerdicts).length)
      ChainCache.putChains(factionId, newVerdicts);
    else ChainCache.touch(factionId);

    Logger.info(
      `war-chain filter (faction ${factionId}): found ${warChains.length}/${target} war chains — ${cacheHits} cache hits, ${apiCalls} API calls, ${dropped} non-war`,
    );
    return warChains;
  }

  function parseChainList(rawChains) {
    const parsed = [];
    for (const c of rawChains.slice(0, CONFIG.calibration.chainsListLimit)) {
      const hits = c.chain;
      const { start, end } = c;
      if (
        !hits ||
        hits > CONFIG.calibration.maxBaselineChainLength ||
        !start ||
        !end ||
        end <= start
      )
        continue;
      const durationMin = (end - start) / 60;
      if (durationMin <= 0) continue;
      parsed.push({
        id: c.id,
        hits,
        durationMin,
        rate: hits / durationMin,
        start,
        end,
      });
    }
    return parsed;
  }

  async function calibrateFaction(factionId, apiKey) {
    const hasAttacksPerm = Storage.getAttacksPerm();
    let priorAttacks = [];
    // Only fetch if they toggled the permission on
    if (hasAttacksPerm) {
      priorAttacks = await fetchIncomingAttacksFrom(factionId, apiKey);
    } else {
      Logger.info(
        `calibration for faction ${factionId}: skipping /attacks check (Faction API permission disabled)`,
      );
    }
    const attackChains = groupAttacksByChain(priorAttacks);

    let qualifyingChains;
    let result;
    let source = "attacks";
    let farmFiltered = 0;

    if (attackChains.length >= CONFIG.calibration.minChainsForCalibration) {
      const verify = await verifyWarChains(attackChains, factionId, apiKey);
      qualifyingChains = attackChains.filter((c) => {
        const hits = verify.warHits(c.id);
        return (
          hits &&
          hits >= CONFIG.calibration.minWarChainLength &&
          hits <= CONFIG.calibration.maxBaselineChainLength
        );
      });
      for (const c of qualifyingChains) c.totalHits = verify.warHits(c.id);
      farmFiltered = attackChains.length - qualifyingChains.length;

      if (
        qualifyingChains.length >= CONFIG.calibration.minChainsForCalibration
      ) {
        result = computeStatsFromRates(qualifyingChains);
        Logger.info(
          `calibration verification for ${factionId}: ${qualifyingChains.length} of ${attackChains.length} ranked chains verified as war tempo (${farmFiltered} filtered)`,
        );
      } else {
        const rawChains = await fetchPastChains(factionId, apiKey);
        const parsedChains = parseChainList(rawChains);
        qualifyingChains = await filterToWarChains(
          parsedChains,
          factionId,
          apiKey,
          {
            target: CONFIG.calibration.targetWarChains,
            apiCallCap: CONFIG.calibration.maxReportsPerCalibration,
          },
        );
        source = "war-chains";
      }
    } else if (attackChains.length > 0) {
      Logger.warn(
        `calibration for faction ${factionId}: only ${attackChains.length} ranked attacks found (need >= ${CONFIG.calibration.minChainsForCalibration}) — falling back to chain history`,
      );
      const rawChains = await fetchPastChains(factionId, apiKey);
      const parsedChains = parseChainList(rawChains);
      qualifyingChains = await filterToWarChains(
        parsedChains,
        factionId,
        apiKey,
        {
          target: CONFIG.calibration.targetWarChains,
          apiCallCap: CONFIG.calibration.maxReportsPerCalibration,
        },
      );
      source = "war-chains";
    } else {
      const rawChains = await fetchPastChains(factionId, apiKey);
      const parsedChains = parseChainList(rawChains);
      qualifyingChains = await filterToWarChains(
        parsedChains,
        factionId,
        apiKey,
        {
          target: CONFIG.calibration.targetWarChains,
          apiCallCap: CONFIG.calibration.maxReportsPerCalibration,
        },
      );
      source = "war-chains";
    }

    if (!result && qualifyingChains.length)
      result = computeStatsFromRates(qualifyingChains);

    const sample = qualifyingChains.slice(0, 3);
    const state = Storage.load(factionId) || freshState();
    const overrides = Storage.getOverrides(factionId);
    let added = 0;
    const addedIds = [];

    for (const wc of qualifyingChains) {
      if (ingestConcludedChain(state, wc.id, wc.rate, overrides)) {
        added++;
        addedIds.push(wc.id);
      }
    }
    const existingBaseline = (state.historyChains || []).length;
    if (added || existingBaseline) {
      state.calibrationSource = state.calibrationSource || source;
      Logger.info(
        `calibrated faction ${factionId}: +${added} war chain(s) ${addedIds.length ? `[IDs: ${addedIds.join(", ")}] ` : ""}via ${source} (baseline now ${existingBaseline})`,
      );
    } else if (qualifyingChains.length === 0) {
      Logger.warn(
        `calibration for faction ${factionId}: no qualifying war chains — ${source} returned ${qualifyingChains.length} candidates; background trickle will keep trying, or set manual thresholds`,
      );
    } else {
      Logger.info(
        `calibration for faction ${factionId}: found ${qualifyingChains.length} war chains but all already seen (dedup) — baseline unchanged at ${existingBaseline}`,
      );
    }
    Storage.save(factionId, state);

    const cache = RawCache.get(factionId);
    cache.lastCalibration = {
      ...result,
      source,
      added,
      timestamp: Date.now(),
      sample,
    };

    return { ...result, source, added };
  }

  // =========================================================================
  // 5. ANALYZER
  // =========================================================================
  function freshState() {
    return {
      historyChains: [],
      baselineMedian: null,
      baselineMad: null,
      calibrationSource: null,
      liveChainId: null,
      liveChainStart: null,
      liveCurrent: 0,
      liveRate: null,
      tightRefreshes: 0,
      totalHits: 0,
      cusumScore: 0,
      lastTickHits: 0,
      lastTickTs: 0,
      lastStatus: "Normal",
      lastPollTs: null,
    };
  }

  function migrateState(loaded) {
    const base = freshState();
    if (!loaded || typeof loaded !== "object") return base;
    const merged = { ...base, ...loaded };
    if (!Array.isArray(merged.historyChains)) merged.historyChains = [];
    if (loaded.baselineChains && Array.isArray(loaded.baselineChains))
      merged.historyChains = loaded.baselineChains.slice();
    return merged;
  }

  function median(values) {
    if (!values || values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function computeStatsFromRates(parsed) {
    if (parsed.length < CONFIG.calibration.minChainsForCalibration)
      return { ok: false, sampleCount: parsed.length };
    const rates = parsed.map((p) => p.rate);
    const med = median(rates);
    const deviations = rates.map((r) => Math.abs(r - med));
    const mad = median(deviations);
    return {
      ok: true,
      sampleCount: parsed.length,
      meanRate: med,
      variance: mad,
      stdDev: mad,
    };
  }

  function recomputeBaseline(state) {
    const rates = (state.historyChains || []).map((c) => c.rate);
    if (rates.length === 0) {
      state.baselineMedian = null;
      state.baselineMad = null;
      return;
    }
    state.baselineMedian = median(rates);
    const deviations = rates.map((r) => Math.abs(r - state.baselineMedian));
    state.baselineMad = median(deviations);
  }

  function ingestConcludedChain(state, chainId, rate, overrides) {
    if (!Array.isArray(state.historyChains)) state.historyChains = [];
    if (state.historyChains.some((c) => c.chainId === chainId)) return false;
    state.historyChains.push({ chainId, rate });
    if (state.historyChains.length > CONFIG.cache.maxChainsPerFaction)
      state.historyChains.shift();
    recomputeBaseline(state);
    if (!state.calibrationSource) state.calibrationSource = "live";
    return "history";
  }

  function resolveThresholds(state, overrides) {
    const wantN =
      typeof overrides.baselineCount === "number" && overrides.baselineCount > 0
        ? overrides.baselineCount
        : CONFIG.calibration.defaultBaselineChains;
    const pool = (state.historyChains || []).slice(-wantN);
    const poolRates = pool.map((c) => c.rate);
    const poolMed = poolRates.length ? median(poolRates) : null;
    const poolMad = poolRates.length
      ? median(poolRates.map((r) => Math.abs(r - poolMed)))
      : null;

    const hasInferredBaseline =
      poolMed !== null && pool.length >= CONFIG.liveModel.minBaselineChains;
    const lowConfidence =
      poolMed !== null &&
      pool.length < CONFIG.calibration.minChainsForCalibration;

    let baseline = null,
      baselineProv = null;
    if (typeof overrides.baseline === "number") {
      baseline = overrides.baseline;
      baselineProv = "manual";
    } else if (poolMed !== null && hasInferredBaseline) {
      baseline = poolMed;
      baselineProv = "inferred";
    }

    const mad =
      hasInferredBaseline && poolMad !== null ? Math.max(poolMad, 0.1) : null;

    const resolve = (ov, multi) => {
      if (ov && ov.mode === "abs")
        return { value: ov.value, prov: "manual-abs" };
      if (ov && ov.mode === "mult" && baseline !== null)
        return { value: baseline * ov.value, prov: "manual-×" };
      if (baseline !== null)
        return { value: baseline * multi, prov: "inferred" };
      return { value: null, prov: null };
    };

    const elevated = resolve(
      overrides.elevated,
      CONFIG.cusum.elevatedThresholdMulti,
    );
    const pushing = resolve(overrides.pushing, CONFIG.cusum.pushThresholdMulti);

    if (baseline === null && elevated.value === null && pushing.value === null)
      return null;

    return {
      baseline,
      mad,
      elevatedAt: elevated.value,
      pushingAt: pushing.value,
      provenance: {
        baseline: baselineProv,
        elevated: elevated.prov,
        pushing: pushing.prov,
      },
      baselineN: pool.length,
      baselineWantN: wantN,
      lowConfidence,
    };
  }

  function updateAnalysis(state, chain, nowMs, overrides) {
    const nowSec = Math.floor(nowMs / 1000);

    if (state.liveChainId !== null && state.liveChainId !== chain.id)
      finalizePreviousChain(state, overrides);

    if (state.liveChainId !== chain.id) {
      state.liveChainId = chain.id;
      state.liveChainStart = chain.start || nowSec;
      state.liveCurrent = chain.current;
      state.tightRefreshes = 0;
      state.totalHits = 0;
      state.liveRate = null;
      state.cusumScore = 0;
      state.lastTickHits = chain.current;
      state.lastTickTs = nowMs;
    } else {
      const hitDelta = chain.current - state.lastTickHits;
      const timeDeltaMin = (nowMs - state.lastTickTs) / 60000;

      if (hitDelta > 0) {
        state.totalHits += hitDelta;
        if (chain.timeout <= CONFIG.tightTimeoutThreshold)
          state.tightRefreshes++;
      }

      const thresholds = resolveThresholds(state, overrides || {});
      if (thresholds && thresholds.baseline !== null && timeDeltaMin > 0) {
        const expectedHits = thresholds.baseline * timeDeltaMin;
        const slack =
          (thresholds.mad !== null
            ? thresholds.mad
            : thresholds.baseline * 0.2) *
          CONFIG.cusum.slackMultiplier *
          timeDeltaMin;
        state.cusumScore = Math.max(
          0,
          state.cusumScore + hitDelta - (expectedHits + slack),
        );
      }

      state.lastTickHits = chain.current;
      state.lastTickTs = nowMs;
      state.liveCurrent = chain.current;
    }

    const elapsedMin = Math.max((nowSec - state.liveChainStart) / 60, 0);
    const warmedUp =
      elapsedMin >= CONFIG.liveModel.warmupMinChainMinutes &&
      chain.current >= CONFIG.liveModel.warmupMinHits;
    state.liveRate = elapsedMin > 0 ? chain.current / elapsedMin : null;

    let status = "Normal";
    const thresholds = resolveThresholds(state, overrides || {});
    if (thresholds && warmedUp && state.liveRate !== null) {
      if (
        thresholds.pushingAt !== null &&
        state.cusumScore >= thresholds.pushingAt
      )
        status = "PUSHING";
      else if (
        thresholds.elevatedAt !== null &&
        state.cusumScore >= thresholds.elevatedAt
      )
        status = "Elevated";
    } else if (!warmedUp && state.liveRate !== null) {
      status = "Warming";
    }

    state.lastStatus = status;
    state.lastPollTs = nowMs;
    state.resolved = thresholds;
    state.warmedUp = warmedUp;
    state.elapsedMin = elapsedMin;
    return state;
  }

  function finalizePreviousChain(state, overrides) {
    if (state.liveChainStart === null || state.liveCurrent <= 0) return;
    const durMin = Math.max((Date.now() / 1000 - state.liveChainStart) / 60, 0);
    if (durMin <= 0) return;
    if (state.liveCurrent < CONFIG.calibration.minWarChainLength) return;
    if (state.liveCurrent > CONFIG.calibration.maxBaselineChainLength) return;
    const rate = state.liveCurrent / durMin;
    const bucket = ingestConcludedChain(
      state,
      state.liveChainId,
      rate,
      overrides,
    );
    if (bucket)
      Logger.info(
        `concluded chain ${state.liveChainId} (${rate.toFixed(1)} hits/min avg) recorded as ${bucket}`,
      );
  }

  // =========================================================================
  // 6. CORE LOOP — Promise.all for concurrent processing
  // =========================================================================
  async function pollAll() {
    const apiKey = Storage.getApiKey();
    const watchlist = Storage.getWatchedFactions();
    if (!apiKey || watchlist.length === 0) return;

    let didUpdate = false;

    // Execute multiple fetching promises concurrently without I/O blocking
    await Promise.all(
      watchlist.map(async (factionId) => {
        await ensureFactionName(factionId, apiKey);
        const result = await fetchFactionChain(factionId, apiKey);
        const cache = RawCache.get(factionId);
        cache.lastPollTime = Date.now();

        let state = Storage.load(factionId) || freshState();
        const overrides = Storage.getOverrides(factionId);

        if (!result.ok) {
          cache.lastError = Date.now();
          state.lastErrorTs = Date.now();
          Storage.save(factionId, state);
          return;
        }

        const chain = result.chain;
        cache.lastChain = chain;

        if (chain && chain.current > 0) {
          state = updateAnalysis(state, chain, Date.now(), overrides);
        } else if (state.liveChainId !== null) {
          finalizePreviousChain(state, overrides);
          state.liveChainId = null;
          state.liveRate = null;
          state.lastStatus = "Idle";
          state.resolved = resolveThresholds(state, overrides);
        }
        state.lastSuccessTs = Date.now();
        Storage.save(factionId, state);
        didUpdate = true;
      }),
    );

    if (didUpdate) {
      Storage.markDataUpdated();
      Logger.info(
        `poll cycle complete (${watchlist.length} faction(s) watched)`,
      );
      UI.refresh();
    } else {
      Logger.warn(
        "poll cycle produced no updates (all fetches failed this cycle)",
      );
    }

    await backgroundCalibrateTick(apiKey, watchlist);
  }

  async function backgroundCalibrateTick(apiKey, watchlist) {
    const budget = CONFIG.calibration.backgroundReportsPerCycle;
    if (budget <= 0 || !limiter.canCall()) return;

    let pick = null,
      fewest = Infinity;
    for (const factionId of watchlist) {
      const state = Storage.load(factionId);
      const have = state ? (state.historyChains || []).length : 0;
      if (have < CONFIG.calibration.targetWarChains && have < fewest) {
        fewest = have;
        pick = factionId;
      }
    }
    if (!pick) return;

    const pickState = Storage.load(pick);
    const pickCount = pickState ? (pickState.historyChains || []).length : 0;

    UI.showTask(
      `Background: ${factionLabel(pick)} — ${pickCount}/${CONFIG.calibration.targetWarChains} war chains`,
    );
    UI.refresh();

    const rawChains = await fetchPastChains(pick, apiKey);
    if (!rawChains.length) return;
    const parsed = parseChainList(rawChains);
    const unchecked = parsed.filter((c) => !ChainCache.getChain(pick, c.id));
    if (!unchecked.length) return;

    const slice = unchecked.slice(0, budget);
    const warChains = await filterToWarChains(slice, pick, apiKey, {
      target: Infinity,
      apiCallCap: budget,
    });

    if (warChains.length) {
      const state = Storage.load(pick) || freshState();
      const overrides = Storage.getOverrides(pick);
      let added = 0;
      const addedIds = [];
      for (const wc of warChains) {
        if (ingestConcludedChain(state, wc.id, wc.rate, overrides)) {
          added++;
          addedIds.push(wc.id);
        }
      }
      if (added) {
        state.calibrationSource = state.calibrationSource || "war-chains";
        Storage.save(pick, state);
        Storage.markDataUpdated();
        Logger.info(
          `background calibration: +${added} war chain(s) [IDs: ${addedIds.join(", ")}] for faction ${pick} (now ${(state.historyChains || []).length})`,
        );
        UI.refresh();
      }
    } else {
      UI.clearTask();
      UI.refresh();
    }
  }

  // =========================================================================
  // 7. UI — Virtual-DOM pattern via Targeted ID updates
  // =========================================================================
  const UI = {
    panel: null,
    _task: { msg: "", progress: null, total: null },

    showTask(msg, progress = null, total = null) {
      this._task = { msg, progress, total };
    },
    clearTask() {
      this._task = { msg: "", progress: null, total: null };
    },
    _renderTaskBar() {
      const el = document.getElementById("pd-task");
      if (!el) return;
      if (!this._task.msg) {
        el.style.display = "none";
        return;
      }
      el.style.display = "flex";
      const msgEl = document.getElementById("pd-task-msg");
      if (msgEl) msgEl.textContent = this._task.msg;
    },
    init() {
      const saved = Storage.getUiState();
      const panel = document.createElement("div");
      panel.id = "push-detector-panel";
      const pos = UI.clampToViewport(
        saved.left ?? window.innerWidth - 360,
        saved.top ?? 60,
      );
      panel.style.cssText = `
        position: fixed; left: ${pos.left}px; top: ${pos.top}px; z-index: 9999;
        background: #1b1b1b; color: #eee; font: 12px monospace;
        border: 1px solid #444; border-radius: 6px; padding: 8px 10px;
        min-width: 260px; max-width: 340px; box-shadow: 0 2px 8px rgba(0,0,0,0.5);
      `;
      panel.innerHTML = `
        <div id="pd-header" style="font-weight:bold; margin-bottom:4px; display:flex; justify-content:space-between; align-items:center; cursor:move; user-select:none;">
          <span title="Drag to move">⠿ War Push Detector</span>
          <span>
            <button id="pd-setup-btn" style="${UI.btnStyle}" title="Show/hide settings">⚙ setup</button>
            <button id="pd-calibrate-btn" style="${UI.btnStyle}" title="Seed baselines from chain history">↻ calibrate</button>
            <button id="pd-recalc-btn" style="${UI.btnStyle}" title="Clear cache and recalculate stats">⚠ recalc</button>
            <button id="pd-debug-btn" style="${UI.btnStyle}" title="Toggle debug panel">🐞</button>
          </span>
        </div>
        <div id="pd-setup" style="display:none; margin-bottom:8px; padding:8px; background:#161616; border:1px solid #333; border-radius:5px;">
          <label style="display:block; font-size:10px; color:#999; margin-bottom:1px;">API key (Limited access is fine)</label>
          <input id="pd-in-key" type="password" style="${UI.inputStyle}" placeholder="16-character key" />
          <label style="display:block; font-size:10px; color:#999; margin:6px 0 1px;">Your own faction ID (pinned in cache)</label>
          <input id="pd-in-own" type="text" style="${UI.inputStyle}" placeholder="e.g. 9055" />
          <label style="display:block; font-size:10px; color:#999; margin:6px 0 1px;">Watched faction IDs (comma-separated)</label>
          <input id="pd-in-watch" type="text" style="${UI.inputStyle}" placeholder="e.g. 16335, 30009" />
          <label style="display:flex; align-items:center; gap:6px; font-size:10px; color:#999; margin:6px 0 1px; cursor:pointer;">
          <input type="checkbox" id="pd-in-attacks-perm" />I have Faction API access (enables calibration via incoming attacks)</label>
          <div style="display:flex; justify-content:flex-end; gap:6px; margin-top:8px;">
            <span id="pd-setup-msg" style="flex:1; font-size:10px; color:#5fc46a; align-self:center;"></span>
            <button id="pd-setup-cancel" style="${UI.btnStyle}">cancel</button>
            <button id="pd-setup-save" style="${UI.btnStyle} background:#2f5130; border-color:#3f7040;">save changes</button>
          </div>
        </div>
        <div id="pd-task" style="display:none; margin-bottom:6px; padding:4px 8px; background:#1a2030; border:1px solid #254060; border-radius:4px; font-size:10px; color:#7ab8ff; display:flex; align-items:center; gap:6px;">
          <span id="pd-task-spinner" style="display:inline-block; width:8px; height:8px; border:1.5px solid #7ab8ff; border-top-color:transparent; border-radius:50%; animation: pd-spin 0.7s linear infinite; flex:none;"></span>
          <span id="pd-task-msg" style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"></span>
        </div>
        <style> @keyframes pd-spin { to { transform: rotate(360deg); } } </style>
        <div id="pd-body">Not configured. Click "setup" to begin.</div>
        <div id="pd-debug" style="display:none; margin-top:8px; padding-top:6px; border-top:1px solid #333;">
          <div id="pd-debug-status" style="color:#999; font-size:10px; margin-bottom:4px;"></div>
          <div id="pd-log" style="max-height:120px; overflow-y:auto; font-size:10px; line-height:1.5; margin-bottom:6px; background:#111; border-radius:4px; padding:4px 6px;"></div>
          <div id="pd-raw"></div>
          <div id="pd-cache" style="font-size:10px; line-height:1.5;"></div>
        </div>
        <div id="pd-footer" style="margin-top:8px; padding-top:6px; border-top:1px solid #333; display:flex; align-items:center; gap:6px; font-size:10px; color:#888;">
          <span id="pd-rate-dot" style="width:8px; height:8px; border-radius:50%; background:#5fc46a; flex:none;"></span>
          <span id="pd-rate-text" style="flex:1;">0 calls/min</span>
          <span id="pd-leader" style="flex:none;" title="Polling tab: only one tab polls the API"></span>
          <span id="pd-lastcall">last: never</span>
        </div>
      `;
      document.body.appendChild(panel);
      panel.querySelector("#pd-setup-btn").onclick = () => UI.toggleSetup();
      panel.querySelector("#pd-calibrate-btn").onclick = () =>
        UI.calibrateAll();
      panel.querySelector("#pd-recalc-btn").onclick = () =>
        UI.clearCacheAndRecalculate();
      panel.querySelector("#pd-debug-btn").onclick = () => UI.toggleDebug();
      panel.querySelector("#pd-setup-save").onclick = () => UI.saveSetup();
      panel.querySelector("#pd-setup-cancel").onclick = () =>
        UI.toggleSetup(false);
      this.panel = panel;

      this.debugOpen = !!saved.debugOpen;
      panel.querySelector("#pd-debug").style.display = this.debugOpen
        ? "block"
        : "none";

      this.enableDrag(panel.querySelector("#pd-header"), panel);
      this.watchViewportResize(panel);
      this.syncAcrossTabs(panel);

      this.refreshFooter();
      setInterval(() => this.refreshFooter(), 2000);
    },
    btnStyle:
      "font:11px monospace; cursor:pointer; background:#2a2a2a; color:#eee; border:1px solid #444; border-radius:3px; padding:1px 5px;",
    inputStyle:
      "width:100%; box-sizing:border-box; font:11px monospace; background:#0e0e0e; color:#eee; border:1px solid #444; border-radius:3px; padding:3px 5px;",
    debugOpen: false,

    clampToViewport(left, top, el) {
      const margin = 8;
      const w = el ? el.offsetWidth : 300;
      const h = el ? el.offsetHeight : 40;
      const maxLeft =
        window.innerWidth - Math.min(w, window.innerWidth) - margin;
      const maxTop =
        window.innerHeight - Math.min(h, window.innerHeight) - margin;
      return {
        left: Math.max(margin, Math.min(left, Math.max(margin, maxLeft))),
        top: Math.max(margin, Math.min(top, Math.max(margin, maxTop))),
      };
    },
    persistPosition(panel) {
      const state = Storage.getUiState();
      state.left = parseInt(panel.style.left, 10);
      state.top = parseInt(panel.style.top, 10);
      Storage.setUiState(state);
    },
    enableDrag(handle, panel) {
      let startX,
        startY,
        startLeft,
        startTop,
        dragging = false;
      const onMove = (e) => {
        if (!dragging) return;
        const pos = UI.clampToViewport(
          startLeft + (e.clientX - startX),
          startTop + (e.clientY - startY),
          panel,
        );
        panel.style.left = pos.left + "px";
        panel.style.top = pos.top + "px";
      };
      const onUp = () => {
        if (!dragging) return;
        dragging = false;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        UI.persistPosition(panel);
      };
      handle.addEventListener("mousedown", (e) => {
        if (e.target.closest("button")) return;
        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
        startLeft = parseInt(panel.style.left, 10);
        startTop = parseInt(panel.style.top, 10);
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
        e.preventDefault();
      });
    },
    watchViewportResize(panel) {
      window.addEventListener("resize", () => {
        const pos = UI.clampToViewport(
          parseInt(panel.style.left, 10),
          parseInt(panel.style.top, 10),
          panel,
        );
        panel.style.left = pos.left + "px";
        panel.style.top = pos.top + "px";
        UI.persistPosition(panel);
      });
    },
    syncAcrossTabs(panel) {
      if (typeof GM_addValueChangeListener !== "function") return;
      GM_addValueChangeListener(
        "wpd_uistate",
        (_name, _old, newVal, remote) => {
          if (!remote || !newVal) return;
          let state;
          try {
            state = JSON.parse(newVal);
          } catch {
            return;
          }
          if (typeof state.left === "number" && typeof state.top === "number") {
            const pos = UI.clampToViewport(state.left, state.top, panel);
            panel.style.left = pos.left + "px";
            panel.style.top = pos.top + "px";
          }
          if (
            typeof state.debugOpen === "boolean" &&
            state.debugOpen !== UI.debugOpen
          ) {
            UI.debugOpen = state.debugOpen;
            panel.querySelector("#pd-debug").style.display = UI.debugOpen
              ? "block"
              : "none";
            if (UI.debugOpen) UI.refreshDebug();
          }
        },
      );
    },
    toggleDebug() {
      this.debugOpen = !this.debugOpen;
      this.panel.querySelector("#pd-debug").style.display = this.debugOpen
        ? "block"
        : "none";
      const state = Storage.getUiState();
      state.debugOpen = this.debugOpen;
      Storage.setUiState(state);
      if (this.debugOpen) this.refreshDebug();
    },
    statusColor(status) {
      return status === "PUSHING"
        ? "#ff5555"
        : status === "Elevated"
          ? "#ffb040"
          : status === "Warming"
            ? "#7ab8ff"
            : status === "Idle"
              ? "#888"
              : "#5fc46a";
    },
    provTag(prov) {
      return prov === "manual" || prov === "manual-abs"
        ? '<span style="color:#c090ff;">manual</span>'
        : prov === "manual-×"
          ? '<span style="color:#c090ff;">manual ×</span>'
          : prov === "inferred"
            ? '<span style="color:#777;">inferred</span>'
            : "";
    },

    // Generates the immutable skeleton wrapper
    factionCardOuter(id) {
      const label = escapeHtml(factionLabel(id));
      return `
        <details data-faction="${id}" style="margin-bottom:6px; background:#1e1e1e; border:1px solid #333; border-radius:5px;">
          <summary style="cursor:pointer; list-style:none; padding:6px 8px; display:flex; align-items:center; gap:8px;">
            <span id="pd-fac-${id}-label" style="flex:1; font-weight:bold; color:#eee;">${label}</span>
            <span id="pd-fac-${id}-pill" style="font-size:9px; letter-spacing:.5px; color:#111; padding:1px 6px; border-radius:8px; font-weight:bold;"></span>
          </summary>
          <div style="padding:0 8px 8px;">
            <div id="pd-fac-${id}-summary" style="font-size:11px; color:#bbb; margin-bottom:2px;"></div>
            <div id="pd-fac-${id}-basis" style="font-size:10px; color:#777;"></div>
            <div id="pd-fac-${id}-stale"></div>
            <div id="pd-fac-${id}-insight"></div>
            <div id="pd-fac-${id}-tight"></div>
            ${this.overrideEditorHtml(id, Storage.getOverrides(id))}
          </div>
        </details>`;
    },

    // Updates text content of specific elements without triggering DOM redraws on <input>s
    updateFactionCard(id) {
      const s = Storage.load(id);
      const ov = Storage.getOverrides(id);
      const r = s?.resolved || (s ? resolveThresholds(s, ov) : null);

      const lblEl = document.getElementById(`pd-fac-${id}-label`);
      if (lblEl) lblEl.textContent = factionLabel(id);

      let pill, pillColor, summary;
      if (!s) {
        pill = "NO DATA";
        pillColor = "#888";
        summary = "Awaiting first chain data";
      } else if (s.lastStatus === "Idle" || s.liveChainId === null) {
        pill = "IDLE";
        pillColor = "#888";
        summary =
          r && r.baseline !== null
            ? `No active chain · baseline ${r.baseline.toFixed(1)} hits/min`
            : "No active chain · no baseline yet";
      } else {
        pill = (
          s.lastStatus === "Warming" ? "WARMING" : s.lastStatus
        ).toUpperCase();
        pillColor = this.statusColor(s.lastStatus);
        summary =
          s.liveRate !== null
            ? `${s.liveRate.toFixed(1)} hits/min this chain (${s.liveCurrent} hits, ${s.elapsedMin?.toFixed(0) ?? "?"}m)`
            : "Chain starting…";
      }

      const pillEl = document.getElementById(`pd-fac-${id}-pill`);
      if (pillEl) {
        pillEl.textContent = pill;
        pillEl.style.background = pillColor;
      }

      const sumEl = document.getElementById(`pd-fac-${id}-summary`);
      if (sumEl) sumEl.textContent = summary;

      const chainCount = s?.historyChains?.length || 0;
      let basis;
      if (!s || chainCount === 0) {
        basis =
          ov.baseline != null || ov.elevated || ov.pushing
            ? "Using manual thresholds (no historical data)"
            : "No baseline — will build as chains conclude, or set manual values below";
      } else {
        const srcTxt =
          s.calibrationSource === "attacks"
            ? "past war(s) vs. you"
            : s.calibrationSource === "live"
              ? "observed concluded chains"
              : "past war chains";
        basis = `Baseline from ${chainCount} ${srcTxt}`;
      }
      const basisEl = document.getElementById(`pd-fac-${id}-basis`);
      if (basisEl) basisEl.textContent = basis;

      let insightHtml = "";
      if (r) {
        const row = (lbl, val, color, tag) =>
          `<div style="display:flex; justify-content:space-between; padding:1px 0; gap:8px;"><span style="color:#999;">${lbl}${tag ? ` ${tag}` : ""}</span><span style="color:${color || "#ddd"}; font-variant-numeric:tabular-nums; white-space:nowrap;">${val}</span></div>`;
        const curColor =
          s.lastStatus === "Normal" ||
          s.lastStatus === "Idle" ||
          s.lastStatus === "Warming"
            ? "#ddd"
            : this.statusColor(s.lastStatus);
        const curVal =
          s.liveRate !== null
            ? `${s.liveRate.toFixed(1)} hits/min${s.lastStatus === "Warming" ? " (warming)" : ""}`
            : "—";
        const fmt = (v) =>
          v !== null && v !== undefined ? `${v.toFixed(1)} hits/min` : "—";
        const cusumColor =
          s.cusumScore > 0
            ? s.cusumScore >= r.pushingAt
              ? "#ff5555"
              : s.cusumScore >= r.elevatedAt
                ? "#ffb040"
                : "#7ab8ff"
            : "#ddd";
        const cusumScoreText =
          typeof s.cusumScore === "number" ? s.cusumScore.toFixed(1) : "0.0";
        insightHtml = `<div style="margin-top:5px; padding:5px 6px; background:#141414; border-radius:4px; font-size:11px;">
             ${row("Current (this chain)", curVal, curColor)}
             ${row("Baseline Median", fmt(r.baseline), "#ddd", this.provTag(r.provenance.baseline))}
             <div style="height:1px; background:#333; margin:4px 0;"></div>
             ${row("CUSUM Score (Push Anomaly)", cusumScoreText, cusumColor)}
             ${row("→ Elevated Alarm at Score ≥", r.elevatedAt ? r.elevatedAt.toFixed(1) : "—", "#ffb040", this.provTag(r.provenance.elevated))}
             ${row("→ Push Alarm at Score ≥", r.pushingAt ? r.pushingAt.toFixed(1) : "—", "#ff5555", this.provTag(r.provenance.pushing))}
             ${r.provenance.baseline === "inferred" ? `<div style="margin-top:2px; font-size:9px; color:${r.lowConfidence ? "#ffb040" : "#666"};">${r.lowConfidence ? "⚠ low confidence — " : ""}baseline from ${r.baselineN} war chain${r.baselineN === 1 ? "" : "s"}${r.baselineN < r.baselineWantN ? ` (building toward ${r.baselineWantN})` : ""}</div>` : ""}
           </div>`;
      }
      const insEl = document.getElementById(`pd-fac-${id}-insight`);
      if (insEl) insEl.innerHTML = insightHtml;

      let tightHtml = "";
      if (s && s.totalHits > 0) {
        const tightPct = Math.round((100 * s.tightRefreshes) / s.totalHits);
        tightHtml = `<div style="margin-top:4px; font-size:10px; color:#888;">${tightPct}% of hits landed with &lt;${CONFIG.tightTimeoutThreshold}s left ${tightPct >= 50 ? '<span style="color:#ffb040;">— actively managed</span>' : ""}</div>`;
      }
      const tightEl = document.getElementById(`pd-fac-${id}-tight`);
      if (tightEl) tightEl.innerHTML = tightHtml;

      let staleHtml = "";
      if (
        s &&
        s.lastErrorTs &&
        (!s.lastSuccessTs || s.lastErrorTs > s.lastSuccessTs)
      ) {
        staleHtml = `<div style="margin-top:4px; font-size:10px; color:#ffb040; background:#2a1e0e; border:1px solid #5a3d1a; border-radius:4px; padding:3px 6px;">⚠ data may be stale — last fetch failed (${this.agoStr(s.lastErrorTs)}); showing last known values</div>`;
      }
      const staleEl = document.getElementById(`pd-fac-${id}-stale`);
      if (staleEl) staleEl.innerHTML = staleHtml;
    },

    overrideEditorHtml(id, ov) {
      const inS =
        "width:64px; box-sizing:border-box; font:11px monospace; background:#0e0e0e; color:#eee; border:1px solid #444; border-radius:3px; padding:2px 4px;";
      const selS =
        "font:11px monospace; background:#0e0e0e; color:#eee; border:1px solid #444; border-radius:3px; padding:2px;";
      const elMode = ov.elevated?.mode || "abs";
      const puMode = ov.pushing?.mode || "abs";
      return `
        <details style="margin-top:6px;" data-ovfor="${id}">
          <summary style="cursor:pointer; font-size:10px; color:#888; list-style:none;">⚙ manual overrides</summary>
          <div style="margin-top:5px; font-size:10px; display:grid; grid-template-columns:auto 1fr; gap:4px 6px; align-items:center;">
            <label style="color:#999;"># chains for baseline</label>
            <input class="pd-ov-count" data-fid="${id}" type="number" step="1" min="1" placeholder="${CONFIG.calibration.defaultBaselineChains}" value="${ov.baselineCount ?? ""}" style="${inS}" />
            <label style="color:#999;">Baseline</label>
            <input class="pd-ov-base" data-fid="${id}" type="number" step="0.1" placeholder="inferred" value="${ov.baseline ?? ""}" style="${inS}" />
            <label style="color:#999;">Elevated</label>
            <span>
              <input class="pd-ov-el-val" data-fid="${id}" type="number" step="0.1" placeholder="auto" value="${ov.elevated?.value ?? ""}" style="${inS}" />
              <select class="pd-ov-el-mode" data-fid="${id}" style="${selS}">
                <option value="abs"${elMode === "abs" ? " selected" : ""}>score</option>
                <option value="mult"${elMode === "mult" ? " selected" : ""}>× base</option>
              </select>
            </span>
            <label style="color:#999;">Push</label>
            <span>
              <input class="pd-ov-pu-val" data-fid="${id}" type="number" step="0.1" placeholder="auto" value="${ov.pushing?.value ?? ""}" style="${inS}" />
              <select class="pd-ov-pu-mode" data-fid="${id}" style="${selS}">
                <option value="abs"${puMode === "abs" ? " selected" : ""}>score</option>
                <option value="mult"${puMode === "mult" ? " selected" : ""}>× base</option>
              </select>
            </span>
          </div>
          <div style="display:flex; justify-content:flex-end; gap:6px; margin-top:6px;">
            <button class="pd-ov-clear" data-fid="${id}" style="${UI.btnStyle}">clear</button>
            <button class="pd-ov-save" data-fid="${id}" style="${UI.btnStyle} background:#2f5130; border-color:#3f7040;">save</button>
          </div>
        </details>`;
    },

    bindOverrideEditors(id) {
      const body = this.panel.querySelector("#pd-body");
      const saveBtn = body.querySelector(`.pd-ov-save[data-fid="${id}"]`);
      const clearBtn = body.querySelector(`.pd-ov-clear[data-fid="${id}"]`);

      if (saveBtn)
        saveBtn.onclick = () => {
          const num = (sel) => {
            const raw = body.querySelector(`.${sel}[data-fid="${id}"]`).value;
            if (raw.trim() === "") return null;
            const v = parseFloat(raw);
            return Number.isFinite(v) ? v : null;
          };
          const mode = (sel) =>
            body.querySelector(`.${sel}[data-fid="${id}"]`).value;
          const baselineCount = num("pd-ov-count");
          Storage.setOverrides(id, {
            baseline: num("pd-ov-base"),
            baselineCount:
              baselineCount !== null && baselineCount >= 1
                ? Math.round(baselineCount)
                : null,
            elevated:
              num("pd-ov-el-val") !== null
                ? { mode: mode("pd-ov-el-mode"), value: num("pd-ov-el-val") }
                : null,
            pushing:
              num("pd-ov-pu-val") !== null
                ? { mode: mode("pd-ov-pu-mode"), value: num("pd-ov-pu-val") }
                : null,
          });
          Logger.info(`overrides saved for faction ${id}`);
          this.refresh(true);
        };

      if (clearBtn)
        clearBtn.onclick = () => {
          Storage.setOverrides(id, {});
          Logger.info(`overrides cleared for faction ${id}`);
          const inputs = body.querySelectorAll(`input[data-fid="${id}"]`);
          inputs.forEach((el) => (el.value = "")); // Reset visuals
          this.refresh(true);
        };
    },

    refresh(force) {
      if (!this.panel) return;
      this._renderTaskBar();
      const body = this.panel.querySelector("#pd-body");
      const watchlist = Storage.getWatchedFactions();

      if (watchlist.length === 0) {
        body.innerHTML =
          '<div style="color:#999; font-size:11px;">No factions watched. Click <b>⚙ setup</b> to add your API key and faction IDs.</div>';
        return;
      }

      const existingIds = new Set();
      body.querySelectorAll("details[data-faction]").forEach((el) => {
        const id = el.getAttribute("data-faction");
        if (!watchlist.includes(id)) el.remove();
        else existingIds.add(id);
      });

      if (!body.querySelector("details[data-faction]")) body.innerHTML = "";

      watchlist.forEach((id) => {
        if (!existingIds.has(id)) {
          body.insertAdjacentHTML("beforeend", this.factionCardOuter(id));
          this.bindOverrideEditors(id);
        }
        this.updateFactionCard(id);
      });

      if (this.debugOpen) this.refreshDebug();
    },

    refreshDebug() {
      if (!this.panel || !this.debugOpen) return;
      const watchlist = Storage.getWatchedFactions();
      const lastPolls = watchlist
        .map((id) => RawCache.get(id).lastPollTime)
        .filter(Boolean);
      const lastPollStr = lastPolls.length
        ? new Date(Math.max(...lastPolls)).toLocaleTimeString()
        : "never";
      this.panel.querySelector("#pd-debug-status").textContent =
        `last poll: ${lastPollStr} · watching ${watchlist.length} faction(s)`;

      const logEl = this.panel.querySelector("#pd-log");
      const logPrevScroll = logEl.scrollTop;
      const logColor = { error: "#ff6666", warn: "#ffaa33", info: "#7ab8ff" };
      logEl.innerHTML =
        Logger.entries
          .slice()
          .reverse()
          .slice(0, 25)
          .map(
            (e) =>
              `<div style="color:${logColor[e.level]}">${new Date(e.t).toLocaleTimeString()} · ${escapeHtml(e.msg)}</div>`,
          )
          .join("") || '<div style="color:#666;">no log entries yet</div>';
      logEl.scrollTop = logPrevScroll;

      const rawEl = this.panel.querySelector("#pd-raw");
      const openFactions = new Set(
        Array.from(rawEl.querySelectorAll("details[open][data-faction]")).map(
          (d) => d.getAttribute("data-faction"),
        ),
      );
      rawEl.innerHTML =
        watchlist
          .map((id) => {
            const cache = RawCache.get(id);
            const chainJson = cache.lastChain
              ? JSON.stringify(cache.lastChain, null, 2)
              : "no data yet";
            const calibJson = cache.lastCalibration
              ? JSON.stringify(cache.lastCalibration, null, 2)
              : "not calibrated yet";
            return `<details data-faction="${id}"${openFactions.has(String(id)) ? " open" : ""} style="margin-bottom:4px;"><summary style="cursor:pointer; color:#aaa; font-size:10px;">faction ${id} — raw data</summary><div style="font-size:10px; color:#888; margin:3px 0 1px;">last /chain response</div><pre style="background:#111; border-radius:4px; padding:4px 6px; margin:0 0 4px; max-height:140px; overflow:auto; font-size:10px;">${escapeHtml(chainJson)}</pre><div style="font-size:10px; color:#888; margin:3px 0 1px;">last calibration result</div><pre style="background:#111; border-radius:4px; padding:4px 6px; margin:0; max-height:140px; overflow:auto; font-size:10px;">${escapeHtml(calibJson)}</pre></details>`;
          })
          .join("") ||
        '<div style="color:#666; font-size:10px;">no factions watched yet</div>';

      const cacheRows =
        ChainCache.summary()
          .map(
            (c) =>
              `<div style="color:#999;">${c.pinned ? "📌 " : ""}faction ${c.factionId}: ${c.chains} chain(s) cached</div>`,
          )
          .join("") || '<div style="color:#666;">cache empty</div>';
      this.panel.querySelector("#pd-cache").innerHTML =
        `<div style="color:#888; font-size:10px; margin:6px 0 2px;">chain cache (${ChainCache.summary().length}/${CONFIG.cache.maxFactions} factions)</div>${cacheRows}`;
    },

    async calibrateAll() {
      const apiKey = Storage.getApiKey();
      const watchlist = Storage.getWatchedFactions();
      if (!apiKey || watchlist.length === 0) {
        alert("Set up an API key and at least one faction ID first.");
        return;
      }
      let progress = 0;
      const total = watchlist.length;
      this.showTask("Calibrating", 0, total);
      for (const factionId of watchlist) {
        await calibrateFaction(factionId, apiKey);
        progress++;
        this.showTask(
          `Calibrating ${factionLabel(factionId)}…`,
          Math.round((progress / total) * 100),
        );
        await new Promise((r) => setTimeout(r, 50));
      }
      this.clearTask();
      this.refresh(true);
    },

    async clearCacheAndRecalculate() {
      if (
        !confirm(
          "This will clear all cached chain verdicts and wipe historical baselines. Proceed with recalculation?",
        )
      )
        return;
      const apiKey = Storage.getApiKey();
      const watchlist = Storage.getWatchedFactions();
      if (!apiKey || watchlist.length === 0) {
        alert("Set up an API key and at least one faction ID first.");
        return;
      }

      const cacheIndex = ChainCache.loadIndex();
      for (const id of Object.keys(cacheIndex)) ChainCache.dropFaction(id);
      Storage.clearCache();

      for (const id of watchlist) {
        const state = Storage.load(id);
        if (state) {
          state.historyChains = [];
          state.baselineMedian = null;
          state.baselineMad = null;
          state.calibrationSource = null;
          Storage.save(id, state);
        }
      }
      Logger.info("Cache and history wiped. Beginning fresh recalculation...");
      this.refresh(true);
      await this.calibrateAll();
    },

    toggleSetup(force) {
      const form = this.panel.querySelector("#pd-setup");
      const willOpen =
        force !== undefined ? force : form.style.display === "none";
      if (willOpen) {
        this.panel.querySelector("#pd-in-key").value =
          Storage.getApiKey() || "";
        this.panel.querySelector("#pd-in-own").value =
          Storage.getOwnFactionId() || "";
        this.panel.querySelector("#pd-in-watch").value =
          Storage.getWatchedFactions().join(", ");
        this.panel.querySelector("#pd-in-attacks-perm").checked =
          Storage.getAttacksPerm();
        this.panel.querySelector("#pd-setup-msg").textContent = "";
      }
      form.style.display = willOpen ? "block" : "none";
    },

    saveSetup() {
      const key = this.panel.querySelector("#pd-in-key").value.trim();
      const own = this.panel.querySelector("#pd-in-own").value.trim();
      const watchRaw = this.panel.querySelector("#pd-in-watch").value;
      const watch = watchRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const attacksPerm = this.panel.querySelector("#pd-in-attacks-perm",).checked;
      const msg = this.panel.querySelector("#pd-setup-msg");

      if (key && !/^[A-Za-z0-9]{16}$/.test(key)) {
        msg.style.color = "#ff6666";
        msg.textContent = "Key must be 16 letters/numbers.";
        return;
      }
      const badId = [own, ...watch].find((id) => id && !/^\d+$/.test(id));
      if (badId) {
        msg.style.color = "#ff6666";
        msg.textContent = `"${badId}" isn't a valid faction ID.`;
        return;
      }

      Storage.setApiKey(key);
      Storage.setOwnFactionId(own || null);
      Storage.setWatchedFactions(watch);
      Storage.setAttacksPerm(attacksPerm);
      CONFIG.cache.ownFactionId = own || null;
      msg.style.color = "#5fc46a";
      msg.textContent = "Saved ✓";
      setTimeout(() => {
        if (msg) msg.textContent = "";
        this.toggleSetup(false);
      }, 1200);

      this.refresh(true);
      if (TabLeader.isLeader()) pollAll();
    },

    refreshFooter() {
      if (!this.panel) return;
      const rate = limiter.ratePerMinute();
      const util = limiter.utilization();
      const dot = this.panel.querySelector("#pd-rate-dot");
      const text = this.panel.querySelector("#pd-rate-text");
      const last = this.panel.querySelector("#pd-lastcall");
      const color =
        util >= 0.9 ? "#ff5555" : util >= 0.6 ? "#ffb040" : "#5fc46a";
      dot.style.background = color;
      text.textContent = `${rate} calls/min (of ${limiter.max})`;
      text.style.color = color;
      const lastTs = limiter.lastCallTime();
      last.textContent = lastTs
        ? `last: ${this.agoStr(lastTs)}`
        : "last: never";
    },

    agoStr(ts) {
      const sec = Math.round((Date.now() - ts) / 1000);
      if (sec < 1) return "just now";
      if (sec < 60) return `${sec}s ago`;
      return `${Math.round(sec / 60)}m ago`;
    },

    refreshLeaderBadge(isLeader) {
      if (!this.panel) return;
      const el = this.panel.querySelector("#pd-leader");
      if (!el) return;
      el.textContent = isLeader ? "◉ polling" : "○ following";
      el.style.color = isLeader ? "#5fc46a" : "#777";
    },
  };

  // =========================================================================
  // 7b. TAB LEADER ELECTION
  // =========================================================================
  const TabLeader = {
    key: "wpd_leader",
    tabId: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    heartbeatMs: 3000 + Math.random() * 1000,
    staleMs: 8000,
    read() {
      const raw = GM_getValue(this.key, null);
      try {
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    },
    isLeader() {
      const cur = this.read();
      return cur && cur.id === this.tabId;
    },
    tryClaim() {
      const cur = this.read();
      const now = Date.now();
      if (!cur || now - cur.ts > this.staleMs || cur.id === this.tabId) {
        GM_setValue(this.key, JSON.stringify({ id: this.tabId, ts: now }));
        return this.isLeader();
      }
      return false;
    },
    beat() {
      if (this.isLeader())
        GM_setValue(
          this.key,
          JSON.stringify({ id: this.tabId, ts: Date.now() }),
        );
    },
    release() {
      if (this.isLeader()) GM_deleteValue(this.key);
    },
  };

  // =========================================================================
  // 8. BOOT
  // =========================================================================
  UI.init();

  let lastPollAt = 0;
  let lastRenderedDataTs = Storage.getDataUpdatedTs();
  async function tick() {
    const leading = TabLeader.tryClaim();
    if (leading) {
      TabLeader.beat();
      if (Date.now() - lastPollAt >= CONFIG.pollIntervalMs) {
        lastPollAt = Date.now();
        await pollAll();
        lastRenderedDataTs = Storage.getDataUpdatedTs();
      }
    } else {
      const dataTs = Storage.getDataUpdatedTs();
      if (dataTs !== lastRenderedDataTs) {
        lastRenderedDataTs = dataTs;
        UI.refresh();
      }
    }
    UI.refreshLeaderBadge(TabLeader.isLeader());
  }

  if (typeof GM_addValueChangeListener === "function") {
    GM_addValueChangeListener("wpd_data_ts", (_n, _o, newVal, remote) => {
      if (!remote) return;
      Storage.clearCache(); // Force Followers to re-sync map from GM memory
      const dataTs = typeof newVal === "number" ? newVal : Number(newVal) || 0;
      if (dataTs !== lastRenderedDataTs && !TabLeader.isLeader()) {
        lastRenderedDataTs = dataTs;
        UI.refresh();
      }
    });
  }

  tick();
  setInterval(tick, TabLeader.heartbeatMs);
  window.addEventListener("beforeunload", () => TabLeader.release());
})();
