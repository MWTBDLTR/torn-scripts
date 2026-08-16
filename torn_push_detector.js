// ==UserScript==
// @name         Torn War Push Detector
// @namespace    church-tools
// @version      1.0.1
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
 * 1.0.1 — Fix: saving setup (or overrides, or calibrating) left the panel stuck
 *         on "not configured". The active-input guard added in 1.0.0 to prevent
 *         poll-driven renders from wiping a field was also blocking the render
 *         triggered BY the save click (the input still held focus). Deliberate
 *         user actions now force the render past the guard and blur the field
 *         first; background polls stay guarded as before.
 * 1.0.0 — First release for live-war testing. Hardening pass over 0.9.0:
 *         - fetchFactionChain now returns a discriminated result ({ok,chain}),
 *           so an API error / rate-limit / network drop can no longer be
 *           mistaken for "chain concluded" — a false conclusion would corrupt
 *           the baseline with a truncated chain. Errored cycles are skipped;
 *           only an explicit "no active chain" concludes.
 *         - Followers re-render only when the leader publishes new data (via a
 *           shared broadcast timestamp + value-change listener), never on every
 *           heartbeat — so typing a manual override is never interrupted. The
 *           active-input guard also defers renders on the leader tab.
 *         - Stale-data banner on a card when its latest fetch failed and hasn't
 *           since succeeded, so an outage mid-war doesn't silently show frozen
 *           or wrongly-active values.
 *         - Empty override fields resolve to null predictably (explicit trim).
 *         Known characteristic: factions with very consistent tempo get tight
 *         thresholds; small increases may read as pushes — use manual overrides.
 *         Assumptions validated by simulation, not yet by a real war — this
 *         release exists to gather that first live-war data.
 * 0.9.0 — Major analyzer rework. Replaced the EWMA baseline (which froze across
 *         idle gaps and self-trained on pushes) with a stable two-population
 *         model:
 *         - BASELINE = average of concluded NORMAL war chains (resting tempo).
 *           A concluded chain updates the baseline only if it was below the
 *           elevated line, so pushes never train the baseline to ignore pushes.
 *         - Live signal = current chain's running average (hits/min since
 *           chain start), same unit as the baseline, with a warmup floor.
 *         - Concluded chains above baseline are recorded as OBSERVED elevated/
 *           push tempo and shown in the card as empirical references.
 *         - Thresholds: manual override (absolute or ×baseline, per field)
 *           always wins; else inferred baseline+Nσ. Provenance shown per value.
 *         - Per-faction manual override editor added to each card.
 *         - Chain conclusion detected even when the endpoint returns no active
 *           chain, so the just-finished chain is classified correctly.
 *         Note: for factions with very consistent tempo (tight variance), even
 *         small increases can read as a push; use manual overrides to adjust.
 * 0.8.0 — Fixed multi-tab API amplification: with several Torn tabs open, each
 *         ran its own poll loop, making Nx the API calls (and each tab's
 *         in-memory rate limiter was none the wiser). Added cross-tab leader
 *         election via a shared GM-storage heartbeat — exactly one tab polls;
 *         the rest render from the shared state it keeps fresh, and take over
 *         within ~8s if the leader closes. Footer shows "◉ polling" / "○
 *         following" per tab.
 * 0.7.0 — Moved settings inline: API key, own faction, and watched factions are
 *         now edited in a collapsible in-panel form with a "save changes" button
 *         (replaces the old prompt() dialogs); saving applies immediately. Added
 *         a footer showing rolling calls/min against the budget with a
 *         green/orange/red status dot and a "last call" timestamp, ticking every
 *         2s independent of the poll loop.
 * 0.6.0 — Redesigned main panel into per-faction collapsible cards. Each card
 *         shows a live status pill (NORMAL/ELEVATED/PUSHING/READY/NO DATA),
 *         current tempo, the calibrated baseline, and the hits/min thresholds
 *         at which the faction would cross into Elevated/Pushing — translating
 *         the internal z-score model into plain numbers. Adds persistent
 *         faction-name lookup (basic selection) so cards show names, not just
 *         ids. Card open/closed state survives poll refreshes.
 * 0.5.0 — Versioning baseline. Consolidates work since 0.1.0:
 *         - Real-time chain polling with EWMA + rolling z-score push detection
 *         - Two-source calibration: own attack log (preferred) or war-filtered
 *           chain history (fallback)
 *         - War-chain qualification gate (war hits vs. bonuses reached, with a
 *           length-based relaxation for long chains)
 *         - Persistent chain-verdict cache (count-based LRU, own faction pinned,
 *           timestamp-ordered chain eviction, ongoing chains never cached)
 *         - Draggable panel with position + debug-state persistence, synced
 *           across tabs
 *         - Human-readable API error hints; in-panel debug log + raw data view
 *         - Fixes: multi-faction status rows no longer render as one blob;
 *           open debug sections survive poll refreshes
 */

(function () {
  "use strict";

  // =========================================================================
  // 1. CONFIG — the only section you should need to touch
  // =========================================================================
  const CONFIG = {
    apiBase: "https://api.torn.com/v2",
    pollIntervalMs: 30 * 1000, // chain endpoint is real-time/non-cached; 30s gives fine resolution
    zScoreElevated: 2.0, // std-devs above baseline => "Elevated" (inferred threshold)
    zScorePushing: 3.5, // std-devs above baseline => "Pushing" (inferred threshold)
    tightTimeoutThreshold: 30, // seconds; refreshing this close to expiry flags as "managed"
    maxSamplesStored: 1440, // ~12 hrs of history at 30s polling
    liveModel: {
      warmupMinChainMinutes: 3, // don't trust a chain's running-average until it's this old
      warmupMinHits: 15, // ...and has at least this many hits (whichever is later)
      minBaselineChains: 3, // qualifying concluded chains needed before inferred alerts fire
    },
    calibration: {
      chainsToSample: 15, // how many past chains to pull for a baseline
      minChainsForCalibration: 3, // below this, don't trust the seeded baseline
      attackLookbackDays: 60, // how far back to search your own attack log for this enemy
      maxPaginatedPages: 5, // hard cap on pages followed via _metadata.links.next
      maxReportsPerCalibration: 20, // hard cap on chainreport calls in one calibration run
      minWarChainLength: 50, // at/above this length, a chain needs only war hits present
      // (not full bonus coverage) to count — see checkChainQualifies
    },
    cache: {
      maxFactions: 10, // LRU cap on cached factions (INCLUDING own); own is pinned
      maxChainsPerFaction: 30, // per-faction cap; oldest chain evicted when a newer one lands
      ownFactionId: null, // set via setup; this faction is never evicted as a whole
    },
  };

  // Chain bonus hits land at these lengths. A "war push" ideally lands each
  // bonus on the warring faction, so a war chain must have at least as many
  // war hits as bonuses it reached — UNLESS the chain is long enough
  // (minWarChainLength) that its rate is good data on its own, in which case
  // any war hits present are enough (some factions fumble landing bonuses on
  // the war target but are still genuinely war-chaining).
  const BONUS_THRESHOLDS = [
    10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000,
  ];
  function bonusesReached(chainLength) {
    return BONUS_THRESHOLDS.filter((t) => chainLength >= t).length;
  }

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
    getOwnFactionId() {
      return GM_getValue("pushdet_ownfaction", null);
    },
    setOwnFactionId(id) {
      GM_setValue("pushdet_ownfaction", id || null);
    },
    getUiState() {
      const raw = GM_getValue("pushdet_uistate", null);
      return raw ? JSON.parse(raw) : {};
    },
    setUiState(state) {
      GM_setValue("pushdet_uistate", JSON.stringify(state));
    },
    getFactionNames() {
      const raw = GM_getValue("pushdet_facnames", null);
      return raw ? JSON.parse(raw) : {};
    },
    getFactionName(id) {
      return this.getFactionNames()[id] || null;
    },
    setFactionName(id, name) {
      const names = this.getFactionNames();
      names[id] = name;
      GM_setValue("pushdet_facnames", JSON.stringify(names));
    },
    // Per-faction user overrides for baseline/thresholds. Shape:
    //   { baseline: number|null,           // manual baseline hits/min
    //     elevated: {mode:'abs'|'mult', value:number} | null,
    //     pushing:  {mode:'abs'|'mult', value:number} | null }
    // Any null field falls back to the inferred value.
    getOverrides(id) {
      const raw = GM_getValue("pushdet_overrides", null);
      const all = raw ? JSON.parse(raw) : {};
      return all[id] || {};
    },
    setOverrides(id, overrides) {
      const raw = GM_getValue("pushdet_overrides", null);
      const all = raw ? JSON.parse(raw) : {};
      all[id] = overrides;
      GM_setValue("pushdet_overrides", JSON.stringify(all));
    },
    // Broadcast key: the leader bumps this after each successful poll write.
    // Followers compare against their own last-rendered value and only
    // re-render when it changes — so a follower never wipes a user's in-progress
    // input on the 3s heartbeat, only when there's genuinely new data.
    getDataUpdatedTs() {
      return GM_getValue("pushdet_data_ts", 0);
    },
    markDataUpdated() {
      GM_setValue("pushdet_data_ts", Date.now());
    },
  };

  // =========================================================================
  // 2b. CHAIN CACHE — persistent store of per-chain qualification verdicts.
  //     A completed chain's verdict is immutable, so once computed it never
  //     needs re-fetching. Structure in GM storage:
  //
  //       chaincache_index          -> { <factionId>: lastAccessMs, ... }  (LRU clock)
  //       chaincache_<factionId>    -> { <chainId>: {rate,durationMin,
  //                                       warHits,bonuses,qualifies,length}, ... }
  //
  //     Culling is count-based:
  //       * At most cache.maxFactions factions kept (LRU). The own faction is
  //         pinned and never evicted as a whole — only its oldest chains are
  //         trimmed like any other faction.
  //       * At most cache.maxChainsPerFaction chains per faction; when a newer
  //         chain lands, the oldest (lowest chain id) is dropped.
  //     Ongoing chains are never cached — only concluded ones get a verdict.
  // =========================================================================
  const ChainCache = {
    indexKey: "chaincache_index",
    factionKey(id) {
      return `chaincache_${id}`;
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

    // Return the cached verdict for one chain, or null if not present.
    getChain(factionId, chainId) {
      const chains = this.loadFaction(factionId);
      return chains[chainId] || null;
    },

    // Store a batch of verdicts for a faction, then trim to the per-faction
    // chain cap (drop lowest chain ids first — chain ids increase over time).
    putChains(factionId, verdictsById) {
      const chains = this.loadFaction(factionId);
      Object.assign(chains, verdictsById);

      // Evict oldest by chain START TIME, not by id. Chain ids are assigned
      // game-wide and are non-consecutive for any one faction, so while they
      // happen to be time-monotonic, `start` is the explicit, correct key.
      // Chains missing a start (shouldn't happen) sort oldest and go first.
      const ids = Object.keys(chains).sort(
        (a, b) => (chains[a].start || 0) - (chains[b].start || 0),
      );
      const overflow = ids.length - CONFIG.cache.maxChainsPerFaction;
      if (overflow > 0) {
        for (let i = 0; i < overflow; i++) delete chains[ids[i]];
      }
      this.saveFaction(factionId, chains);
      this.touch(factionId); // bump LRU + enforce faction cap
    },

    // Mark a faction as just-used and enforce the faction-count cap via LRU,
    // never evicting the pinned own faction.
    touch(factionId) {
      const idx = this.loadIndex();
      idx[factionId] = Date.now();
      this.saveIndex(idx);

      const own = String(Storage.getOwnFactionId() || "");
      const evictable = Object.keys(idx).filter((id) => id !== own);
      const overflow =
        evictable.length + (own && idx[own] ? 1 : 0) - CONFIG.cache.maxFactions;
      if (overflow > 0) {
        // Oldest-first among evictable (non-own) factions
        evictable.sort((a, b) => idx[a] - idx[b]);
        for (let i = 0; i < overflow && i < evictable.length; i++) {
          this.dropFaction(evictable[i]);
        }
      }
    },

    // Debug/inspection helper: summary counts without loading every blob body.
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

    // How many calls in the last rolling 60s.
    ratePerMinute() {
      const now = Date.now();
      return this.calls.filter((t) => now - t < 60000).length;
    }
    // Timestamp of the most recent call, or null if none yet.
    lastCallTime() {
      return this.calls.length ? this.calls[this.calls.length - 1] : null;
    }
    // Fraction of the configured budget currently used (0..1+).
    utilization() {
      return this.ratePerMinute() / this.max;
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
  // Returns one of three distinct outcomes so callers can tell "no chain" from
  // "couldn't fetch" — critical because a false "concluded" would corrupt the
  // baseline with a truncated chain:
  //   { ok: true,  chain: {...} }  -> active chain
  //   { ok: true,  chain: null }   -> API succeeded, no chain running (real end)
  //   { ok: false }                -> error/rate-limit/network; caller must skip
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
        // Torn API error codes: back off on rate-limit (5), don't retry on bad key (2)
        if (data.error.code === 5 && attempt < 2) {
          await sleep(2000 * (attempt + 1));
          return fetchFactionChain(factionId, apiKey, attempt + 1);
        }
        Logger.error(
          `chain fetch error (faction ${factionId}): ${explainApiError(data.error)}`,
        );
        return { ok: false };
      }
      // Success. data.chain present => active; absent/empty => no chain running.
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

  // Fetch and cache a faction's name (basic selection). Names change rarely,
  // so this is stored persistently and only fetched on a miss — one call per
  // faction, ever, in practice. Non-fatal: on failure we just keep showing the
  // id until a later attempt succeeds.
  async function ensureFactionName(factionId, apiKey) {
    if (Storage.getFactionName(factionId)) return; // already known
    if (!limiter.canCall()) return;
    const url = `${CONFIG.apiBase}/faction/${factionId}/basic?key=${apiKey}`;
    try {
      limiter.record();
      const res = await fetch(url);
      const data = await res.json();
      if (data.error) return; // silent — name is a nicety, not core
      const name = data.basic?.name;
      if (name) Storage.setFactionName(factionId, name);
    } catch {
      /* ignore — cosmetic */
    }
  }

  // Display label: "Name [id]" when we have a name, else just the id.
  function factionLabel(factionId) {
    const name = Storage.getFactionName(factionId);
    return name ? `${name} [${factionId}]` : `Faction ${factionId}`;
  }

  // Human-readable hints for the Torn API error codes most likely to bite
  // this tool — surfaced in logs so a failure is actionable, not just a code.
  const API_ERROR_HINTS = {
    2: "API key is invalid or malformed.",
    5: "Rate limited — the key is temporarily blocked for too many requests.",
    7:
      "Selection is private for this key — usually means the faction leader " +
      "hasn't granted \"AA\" (API Access) permission, or the key's access " +
      "level doesn't include this selection.",
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
      if (!limiter.canCall()) break;
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
    return fetchPaginated(
      url,
      "chains",
      CONFIG.calibration.maxPaginatedPages,
      `chain history for faction ${factionId}`,
    );
  }

  // --- War-chain qualification via chainreport ---
  // Two-part gate on whether a past chain counts as war tempo:
  //   * Long chains (length >= minWarChainLength): keep if ANY war hits are
  //     present. The length alone gives reliable rate data, and some factions
  //     genuinely war-chain without landing every bonus on the war target.
  //   * Short chains (below that): keep only if war hits >= bonuses reached,
  //     i.e. the bonuses were landed on the warring faction. With little data,
  //     a short chain that didn't bonus the target is treated as farming.
  // Either way, zero war hits => not a war chain (pure farming, even during a
  // war).
  //
  // Fetches the report and returns { qualifies, warHits, bonuses, length,
  // ended } or null if unreadable. `ended` gates caching upstream: an ongoing
  // chain (no end timestamp) must not be cached, since its verdict isn't final.
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
      const d = report?.details;
      if (!d || !d.chain) return null;
      const warHits = d.war ?? 0;
      const length = d.chain;
      const bonuses = bonusesReached(length);
      const qualifies =
        length >= CONFIG.calibration.minWarChainLength
          ? warHits > 0 // long: any war hits present is enough
          : warHits >= bonuses; // short: bonuses must have been landed on the target
      const ended = !!report.end && report.end > 0;
      return { qualifies, warHits, bonuses, length, ended };
    } catch (err) {
      Logger.error(`chainreport ${chainId} failed: ${err}`);
      return null;
    }
  }

  // Keep only chains that qualify as war tempo (see fetchChainVerdict).
  // Cache-first: a chain's verdict is immutable once its chain has concluded,
  // so cached verdicts are reused and only cache-miss chains hit the API.
  // Bounded by maxReportsPerCalibration on the API-call side only — cached
  // hits are free and don't count against that budget.
  async function filterToWarChains(parsedChains, factionId, apiKey) {
    const warChains = [];
    let dropped = 0,
      cacheHits = 0,
      apiCalls = 0;
    const newVerdicts = {}; // {chainId: verdict} to persist after the loop

    for (const chain of parsedChains) {
      // 1. Cache hit — reuse the stored verdict, no API call.
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

      // 2. Cache miss — but respect the per-run API budget.
      if (apiCalls >= CONFIG.calibration.maxReportsPerCalibration) {
        dropped++; // couldn't verify within budget -> excluded (fails safe)
        continue;
      }
      apiCalls++;
      const verdict = await fetchChainVerdict(chain.id, apiKey);
      if (!verdict) {
        dropped++;
        continue;
      }

      // 3. Only cache CONCLUDED chains — an ongoing chain's verdict isn't final.
      if (verdict.ended) {
        newVerdicts[chain.id] = {
          rate: chain.rate,
          durationMin: chain.durationMin,
          warHits: verdict.warHits,
          bonuses: verdict.bonuses,
          qualifies: verdict.qualifies,
          length: verdict.length,
          start: chain.start,
          end: chain.end, // start is the cache eviction key
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

    // Persist newly-fetched concluded verdicts in one write; culling handled inside.
    if (Object.keys(newVerdicts).length)
      ChainCache.putChains(factionId, newVerdicts);
    else ChainCache.touch(factionId); // still bump LRU even on all-cache-hit runs

    Logger.info(
      `war-chain filter (faction ${factionId}): kept ${warChains.length}, dropped ${dropped} — ${cacheHits} cache hits, ${apiCalls} API calls`,
    );
    return warChains;
  }

  function parseChainList(rawChains) {
    const parsed = [];
    for (const c of rawChains.slice(0, CONFIG.calibration.chainsToSample)) {
      const hits = c.chain; // confirmed field name
      const { start, end } = c;
      if (!hits || !start || !end || end <= start) continue;
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
    let qualifyingChains = attackChains; // {id, rate} entries in scope below

    if (!result.ok) {
      // Fall back to their general chain history. Keep only chains that
      // qualify as war pushes: war-hit count must cover the bonuses reached
      // (see checkChainQualifies). This excludes farming/outside-hit chains
      // even when they occurred during a war.
      const rawChains = await fetchPastChains(factionId, apiKey);
      const parsedChains = parseChainList(rawChains);
      qualifyingChains = await filterToWarChains(
        parsedChains,
        factionId,
        apiKey,
      );
      result = computeStatsFromRates(qualifyingChains);
      source = "war-chains";
    }
    const sample = qualifyingChains.slice(0, 3);

    const state = Storage.load(factionId) || freshState();
    if (result.ok) {
      // Seed the baseline from historical qualifying chains. Store per-chain
      // rates so live conclusions can keep extending the same baseline.
      state.baselineChains = qualifyingChains.map((c) => ({
        chainId: c.id,
        rate: c.rate,
      }));
      if (state.baselineChains.length > CONFIG.cache.maxChainsPerFaction) {
        state.baselineChains = state.baselineChains.slice(
          -CONFIG.cache.maxChainsPerFaction,
        );
      }
      recomputeBaseline(state);
      state.calibrationSource = source;
      Logger.info(
        `calibrated faction ${factionId} from ${result.sampleCount} ${source} (${result.meanRate.toFixed(1)} ± ${result.stdDev.toFixed(1)} hits/min avg)`,
      );
    } else {
      Logger.warn(
        `calibration for faction ${factionId} inconclusive (only ${result.sampleCount} usable ${source} chains) — will build baseline live as chains conclude`,
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
  // 5. ANALYZER — stable baseline + running-average live signal
  //
  //   Model (chain-average, the only unit the API supports for enemies):
  //     * BASELINE = mean/variance of COMPLETED qualifying war-chain average
  //       rates (hits / durationMin). Updated only when a chain concludes and
  //       passes the war-chain gate. The in-progress chain is NEVER in its own
  //       baseline — so a push can't train the baseline to ignore itself.
  //     * LIVE SIGNAL = the current chain's running average
  //       (current hits / minutes since chain start), same unit as baseline.
  //       Trusted for alerts only after a warmup floor (time AND hits), since a
  //       fresh chain's running average is dominated by the opening bonus flurry.
  //     * THRESHOLDS = user override if set, else inferred (baseline + Nσ).
  //       Manual always wins; inference is still computed for display.
  //
  //   This replaces the old EWMA, which conflated "what's normal" with "what's
  //   happening now" — freezing across idle gaps and self-training on pushes.
  // =========================================================================
  function freshState() {
    return {
      // Baseline population: concluded chains that were NORMAL (below elevated).
      // Pushes are deliberately excluded so they can't train the baseline to
      // consider pushing normal.
      baselineChains: [], // [{rate, chainId}]
      baselineMean: null,
      baselineVar: null,
      // Observed above-baseline populations — what elevated/push ACTUALLY looked
      // like for this faction, as opposed to the σ-inferred thresholds.
      elevatedChains: [], // [{rate, chainId}] concluded chains in the elevated band
      pushChains: [], // [{rate, chainId}] concluded chains at/above push
      calibrationSource: null, // 'attacks', 'war-chains', 'live', or null

      // Live (current chain):
      liveChainId: null,
      liveChainStart: null,
      liveCurrent: 0,
      liveRate: null,
      tightRefreshes: 0,
      totalHits: 0,

      lastStatus: "Normal",
      lastPollTs: null,
    };
  }

  // Recompute baseline mean/variance from the stored NORMAL concluded chains.
  function recomputeBaseline(state) {
    const rates = state.baselineChains.map((c) => c.rate);
    if (rates.length === 0) {
      state.baselineMean = null;
      state.baselineVar = null;
      return;
    }
    const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
    const variance =
      rates.reduce((a, b) => a + (b - mean) ** 2, 0) / rates.length;
    state.baselineMean = mean;
    state.baselineVar = variance;
  }

  const avgOf = (chains) =>
    chains.length
      ? chains.reduce((a, c) => a + c.rate, 0) / chains.length
      : null;

  // Route a concluded chain into the right population based on the thresholds
  // AS THEY STAND BEFORE this chain is added (so a chain never classifies
  // itself). Only NORMAL chains update the baseline; elevated/push chains are
  // recorded separately as observed above-baseline tempo, and never lower the
  // baseline they're meant to be measured against.
  function ingestConcludedChain(state, chainId, rate, overrides) {
    const dedup = (arr) => arr.some((c) => c.chainId === chainId);
    if (
      dedup(state.baselineChains) ||
      dedup(state.elevatedChains) ||
      dedup(state.pushChains)
    )
      return false;

    const bounded = (arr) => {
      if (arr.length > CONFIG.cache.maxChainsPerFaction) arr.shift();
    };
    const pre = resolveThresholds(state, overrides || {}); // thresholds BEFORE this chain

    let bucket;
    if (pre && pre.pushingAt !== null && rate >= pre.pushingAt) {
      state.pushChains.push({ chainId, rate });
      bounded(state.pushChains);
      bucket = "push";
    } else if (pre && pre.elevatedAt !== null && rate >= pre.elevatedAt) {
      state.elevatedChains.push({ chainId, rate });
      bounded(state.elevatedChains);
      bucket = "elevated";
    } else {
      // Normal (or no thresholds yet) -> this is resting tempo; update baseline.
      state.baselineChains.push({ chainId, rate });
      bounded(state.baselineChains);
      recomputeBaseline(state);
      if (!state.calibrationSource) state.calibrationSource = "live";
      bucket = "baseline";
    }
    return bucket;
  }

  // Resolve effective baseline + thresholds, honoring user overrides. Also
  // surfaces OBSERVED elevated/push rates (from past above-baseline chains) as
  // a second, empirical reference alongside the σ-inferred thresholds.
  function resolveThresholds(state, overrides) {
    const hasInferredBaseline =
      state.baselineMean !== null &&
      state.baselineChains.length >= CONFIG.liveModel.minBaselineChains;

    let baseline = null,
      baselineProv = null;
    if (typeof overrides.baseline === "number") {
      baseline = overrides.baseline;
      baselineProv = "manual";
    } else if (hasInferredBaseline) {
      baseline = state.baselineMean;
      baselineProv = "inferred";
    }

    const std =
      hasInferredBaseline && state.baselineVar !== null
        ? Math.sqrt(Math.max(state.baselineVar, 0.0001))
        : null;

    const resolve = (ov, sigma) => {
      if (ov && ov.mode === "abs")
        return { value: ov.value, prov: "manual-abs" };
      if (ov && ov.mode === "mult" && baseline !== null)
        return { value: baseline * ov.value, prov: "manual-×" };
      if (baseline !== null && std !== null)
        return { value: baseline + sigma * std, prov: "inferred" };
      return { value: null, prov: null };
    };

    const elevated = resolve(overrides.elevated, CONFIG.zScoreElevated);
    const pushing = resolve(overrides.pushing, CONFIG.zScorePushing);

    if (baseline === null && elevated.value === null && pushing.value === null)
      return null;

    return {
      baseline,
      std,
      elevatedAt: elevated.value,
      pushingAt: pushing.value,
      provenance: {
        baseline: baselineProv,
        elevated: elevated.prov,
        pushing: pushing.prov,
      },
      // Empirical references (null until such chains have been observed):
      observedElevated: avgOf(state.elevatedChains),
      observedPush: avgOf(state.pushChains),
      observedElevatedN: state.elevatedChains.length,
      observedPushN: state.pushChains.length,
    };
  }

  // Process one live /chain reading. Handles chain transitions (conclusion +
  // new chain), updates the running-average live signal, and sets status by
  // comparing it against the resolved thresholds.
  function updateAnalysis(state, chain, nowMs, overrides) {
    const nowSec = Math.floor(nowMs / 1000);

    // --- Chain transition: the chain we were tracking is no longer current ---
    if (state.liveChainId !== null && state.liveChainId !== chain.id) {
      // The previous chain concluded. Route its average into the right
      // population (baseline only if it was normal — see ingestConcludedChain).
      finalizePreviousChain(state, overrides);
    }

    // --- Start tracking a new chain ---
    if (state.liveChainId !== chain.id) {
      state.liveChainId = chain.id;
      state.liveChainStart = chain.start || nowSec;
      state.liveCurrent = chain.current;
      state.tightRefreshes = 0;
      state.totalHits = 0;
      state.liveRate = null;
    } else {
      // Same chain — accrue hit delta for tight-refresh tracking.
      const delta = chain.current - state.liveCurrent;
      if (delta > 0) {
        state.totalHits += delta;
        if (chain.timeout <= CONFIG.tightTimeoutThreshold)
          state.tightRefreshes++;
      }
      state.liveCurrent = chain.current;
    }

    // --- Live running-average signal (same unit as baseline) ---
    const elapsedMin = Math.max((nowSec - state.liveChainStart) / 60, 0);
    const warmedUp =
      elapsedMin >= CONFIG.liveModel.warmupMinChainMinutes &&
      chain.current >= CONFIG.liveModel.warmupMinHits;
    state.liveRate = elapsedMin > 0 ? chain.current / elapsedMin : null;

    // --- Status: compare live running-average to resolved thresholds ---
    let status = "Normal";
    const thresholds = resolveThresholds(state, overrides || {});
    if (thresholds && warmedUp && state.liveRate !== null) {
      if (
        thresholds.pushingAt !== null &&
        state.liveRate >= thresholds.pushingAt
      )
        status = "PUSHING";
      else if (
        thresholds.elevatedAt !== null &&
        state.liveRate >= thresholds.elevatedAt
      )
        status = "Elevated";
    } else if (!warmedUp && state.liveRate !== null) {
      status = "Warming";
    }

    state.lastStatus = status;
    state.lastPollTs = nowMs;
    // Snapshot resolved values for the card (avoids recomputing in the UI).
    state.resolved = thresholds;
    state.warmedUp = warmedUp;
    state.elapsedMin = elapsedMin;
    return state;
  }

  // Fold the just-concluded live chain into the right population if it looks
  // like war tempo. Classification (baseline vs. elevated vs. push) happens
  // inside ingestConcludedChain against the pre-existing thresholds, so a push
  // chain won't pollute the baseline. Heuristic length gate mirrors the
  // report-based war-chain gate (we don't have the report here).
  function finalizePreviousChain(state, overrides) {
    if (state.liveChainStart === null || state.liveCurrent <= 0) return;
    const durMin = Math.max((Date.now() / 1000 - state.liveChainStart) / 60, 0);
    if (durMin <= 0) return;
    if (state.liveCurrent < CONFIG.calibration.minWarChainLength) return; // too short to trust
    const rate = state.liveCurrent / durMin;
    const bucket = ingestConcludedChain(
      state,
      state.liveChainId,
      rate,
      overrides,
    );
    if (bucket) {
      Logger.info(
        `concluded chain ${state.liveChainId} (${rate.toFixed(1)} hits/min avg) recorded as ${bucket}`,
      );
    }
  }

  // =========================================================================
  // 6. CORE LOOP — ties collection + analysis together per watched faction
  // =========================================================================
  async function pollAll() {
    const apiKey = Storage.getApiKey();
    const watchlist = Storage.getWatchedFactions();
    if (!apiKey || watchlist.length === 0) return;

    let didUpdate = false;
    for (const factionId of watchlist) {
      await ensureFactionName(factionId, apiKey); // cheap, cached, cosmetic
      const result = await fetchFactionChain(factionId, apiKey);
      const cache = RawCache.get(factionId);
      cache.lastPollTime = Date.now();

      let state = Storage.load(factionId) || freshState();
      const overrides = Storage.getOverrides(factionId);

      // CRITICAL: on an error/rate-limit/network failure, skip this faction
      // entirely. Do NOT treat it as "no chain" — that would falsely conclude
      // an ongoing chain and corrupt the baseline with a truncated average.
      // Record the error time in SHARED state so any tab can show a stale hint.
      if (!result.ok) {
        cache.lastError = Date.now();
        state.lastErrorTs = Date.now();
        Storage.save(factionId, state);
        continue;
      }

      const chain = result.chain; // may be null: API confirms no active chain
      cache.lastChain = chain;

      if (chain && chain.current > 0) {
        // Active chain — update the live signal + status.
        state = updateAnalysis(state, chain, Date.now(), overrides);
      } else if (state.liveChainId !== null) {
        // API explicitly confirmed no active chain, and we were tracking one —
        // it has genuinely concluded. Classify it, then go idle.
        finalizePreviousChain(state, overrides);
        state.liveChainId = null;
        state.liveRate = null;
        state.lastStatus = "Idle";
        state.resolved = resolveThresholds(state, overrides);
      }
      state.lastSuccessTs = Date.now(); // a good fetch clears the "stale" condition
      Storage.save(factionId, state);
      didUpdate = true;
    }
    if (didUpdate) {
      Storage.markDataUpdated(); // broadcast: followers re-render on this change
      Logger.info(
        `poll cycle complete (${watchlist.length} faction(s) watched)`,
      );
      UI.refresh();
    } else {
      Logger.warn(
        "poll cycle produced no updates (all fetches failed this cycle)",
      );
    }
  }

  // =========================================================================
  // 7. UI — minimal floating panel, no dependencies
  // =========================================================================
  const UI = {
    panel: null,
    init() {
      const saved = Storage.getUiState();

      const panel = document.createElement("div");
      panel.id = "push-detector-panel";
      // Positioned via left/top so drag math is straightforward. Restore the
      // saved spot if present, else default to the top-right area.
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
          <div style="display:flex; justify-content:flex-end; gap:6px; margin-top:8px;">
            <span id="pd-setup-msg" style="flex:1; font-size:10px; color:#5fc46a; align-self:center;"></span>
            <button id="pd-setup-cancel" style="${UI.btnStyle}">cancel</button>
            <button id="pd-setup-save" style="${UI.btnStyle} background:#2f5130; border-color:#3f7040;">save changes</button>
          </div>
        </div>
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
      panel.querySelector("#pd-debug-btn").onclick = () => UI.toggleDebug();
      panel.querySelector("#pd-setup-save").onclick = () => UI.saveSetup();
      panel.querySelector("#pd-setup-cancel").onclick = () =>
        UI.toggleSetup(false);
      this.panel = panel;

      // Restore debug-open state
      this.debugOpen = !!saved.debugOpen;
      panel.querySelector("#pd-debug").style.display = this.debugOpen
        ? "block"
        : "none";

      this.enableDrag(panel.querySelector("#pd-header"), panel);
      this.watchViewportResize(panel);
      this.syncAcrossTabs(panel);

      // Footer rate indicator ticks independently of polls so it stays live
      // even between 30s cycles.
      this.refreshFooter();
      setInterval(() => this.refreshFooter(), 2000);
    },
    btnStyle:
      "font:11px monospace; cursor:pointer; background:#2a2a2a; color:#eee; border:1px solid #444; border-radius:3px; padding:1px 5px;",
    inputStyle:
      "width:100%; box-sizing:border-box; font:11px monospace; background:#0e0e0e; color:#eee; border:1px solid #444; border-radius:3px; padding:3px 5px;",
    debugOpen: false,

    // Keep a proposed left/top within the visible viewport, leaving a small
    // margin so the panel can't be dragged fully off-screen and lost.
    clampToViewport(left, top, el) {
      const margin = 8;
      const w = el ? el.offsetWidth : 300;
      const h = el ? el.offsetHeight : 40; // header height is enough to grab
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
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const pos = UI.clampToViewport(startLeft + dx, startTop + dy, panel);
        panel.style.left = pos.left + "px";
        panel.style.top = pos.top + "px";
      };
      const onUp = () => {
        if (!dragging) return;
        dragging = false;
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        UI.persistPosition(panel); // save only once, on release
      };
      handle.addEventListener("mousedown", (e) => {
        // Ignore drags that start on the buttons in the header
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

    // If the window shrinks below the panel's saved spot, pull it back in.
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

    // Mirror position/debug-state changes made in OTHER tabs. GM storage is
    // shared, and GM_addValueChangeListener fires with remote=true when a
    // different tab writes — so dragging the panel in one tab moves it in all.
    syncAcrossTabs(panel) {
      if (typeof GM_addValueChangeListener !== "function") return; // not available in all managers
      GM_addValueChangeListener(
        "pushdet_uistate",
        (_name, _old, newVal, remote) => {
          if (!remote || !newVal) return; // ignore our own writes
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
              : "#5fc46a"; // Normal
    },

    // Short human tag for a threshold's provenance.
    provTag(prov) {
      return prov === "manual" || prov === "manual-abs"
        ? '<span style="color:#c090ff;">manual</span>'
        : prov === "manual-×"
          ? '<span style="color:#c090ff;">manual ×</span>'
          : prov === "inferred"
            ? '<span style="color:#777;">inferred</span>'
            : "";
    },

    // Build one collapsible faction card. Open/closed state is restored by the
    // caller via the data-faction/open attributes (survives poll refreshes).
    factionCard(id, openSet) {
      const s = Storage.load(id);
      const ov = Storage.getOverrides(id);
      const label = escapeHtml(factionLabel(id));
      const open = openSet.has(String(id)) ? " open" : "";
      const r = s?.resolved || (s ? resolveThresholds(s, ov) : null);

      // Header pill + one-line summary reflect current state.
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

      // Basis line: where the baseline comes from.
      const chainCount = s?.baselineChains?.length || 0;
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

      // Insight table — only when we have something to compare against.
      let insightHtml = "";
      if (r) {
        const row = (lbl, val, color, tag) =>
          `<div style="display:flex; justify-content:space-between; padding:1px 0; gap:8px;">
             <span style="color:#999;">${lbl}${tag ? ` ${tag}` : ""}</span>
             <span style="color:${color || "#ddd"}; font-variant-numeric:tabular-nums; white-space:nowrap;">${val}</span>
           </div>`;
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

        // Observed rows appear only when we've actually seen above-baseline chains.
        const obsElev =
          r.observedElevated !== null
            ? row(
                `Seen elevated (${r.observedElevatedN})`,
                `~${r.observedElevated.toFixed(1)} hits/min`,
                "#ffb040",
                '<span style="color:#777;">observed</span>',
              )
            : "";
        const obsPush =
          r.observedPush !== null
            ? row(
                `Seen pushing (${r.observedPushN})`,
                `~${r.observedPush.toFixed(1)} hits/min`,
                "#ff5555",
                '<span style="color:#777;">observed</span>',
              )
            : "";

        insightHtml = `<div style="margin-top:5px; padding:5px 6px; background:#141414; border-radius:4px; font-size:11px;">
             ${row("Current (this chain)", curVal, curColor)}
             ${row("Baseline", fmt(r.baseline), "#ddd", this.provTag(r.provenance.baseline))}
             ${row("→ Elevated ≥", fmt(r.elevatedAt), "#ffb040", this.provTag(r.provenance.elevated))}
             ${row("→ Push ≥", fmt(r.pushingAt), "#ff5555", this.provTag(r.provenance.pushing))}
             ${obsElev}${obsPush}
           </div>`;
      }

      // Chain-management signal (tight refreshes) — only meaningful with hits.
      let tightHtml = "";
      if (s && s.totalHits > 0) {
        const tightPct = Math.round((100 * s.tightRefreshes) / s.totalHits);
        tightHtml = `<div style="margin-top:4px; font-size:10px; color:#888;">
             ${tightPct}% of hits landed with &lt;${CONFIG.tightTimeoutThreshold}s left
             ${tightPct >= 50 ? '<span style="color:#ffb040;">— actively managed</span>' : ""}
           </div>`;
      }

      // Per-faction override editor (collapsed within the card).
      const ovEl = this.overrideEditorHtml(id, ov);

      // Stale-data banner: the most recent fetch for this faction errored (and
      // hasn't since succeeded). During an API/network outage mid-war, the
      // numbers above may be behind — a concluded chain might still show as
      // active, or a live rate may be frozen. Warn rather than mislead.
      let staleHtml = "";
      if (
        s &&
        s.lastErrorTs &&
        (!s.lastSuccessTs || s.lastErrorTs > s.lastSuccessTs)
      ) {
        const ago = this.agoStr(s.lastErrorTs);
        staleHtml = `<div style="margin-top:4px; font-size:10px; color:#ffb040; background:#2a1e0e; border:1px solid #5a3d1a; border-radius:4px; padding:3px 6px;">
             ⚠ data may be stale — last fetch failed (${ago}); showing last known values
           </div>`;
      }

      return `
        <details data-faction="${id}"${open} style="margin-bottom:6px; background:#1e1e1e; border:1px solid #333; border-radius:5px;">
          <summary style="cursor:pointer; list-style:none; padding:6px 8px; display:flex; align-items:center; gap:8px;">
            <span style="flex:1; font-weight:bold; color:#eee;">${label}</span>
            <span style="font-size:9px; letter-spacing:.5px; color:#111; background:${pillColor}; padding:1px 6px; border-radius:8px; font-weight:bold;">${pill}</span>
          </summary>
          <div style="padding:0 8px 8px;">
            <div style="font-size:11px; color:#bbb; margin-bottom:2px;">${summary}</div>
            <div style="font-size:10px; color:#777;">${basis}</div>
            ${staleHtml}
            ${insightHtml}
            ${tightHtml}
            ${ovEl}
          </div>
        </details>`;
    },

    // Collapsible manual-override editor inside a faction card. Values persist
    // per faction; blank fields fall back to inference.
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
            <label style="color:#999;">Baseline</label>
            <input class="pd-ov-base" data-fid="${id}" type="number" step="0.1" placeholder="inferred" value="${ov.baseline ?? ""}" style="${inS}" />

            <label style="color:#999;">Elevated</label>
            <span>
              <input class="pd-ov-el-val" data-fid="${id}" type="number" step="0.1" placeholder="auto" value="${ov.elevated?.value ?? ""}" style="${inS}" />
              <select class="pd-ov-el-mode" data-fid="${id}" style="${selS}">
                <option value="abs"${elMode === "abs" ? " selected" : ""}>hits/min</option>
                <option value="mult"${elMode === "mult" ? " selected" : ""}>× base</option>
              </select>
            </span>

            <label style="color:#999;">Push</label>
            <span>
              <input class="pd-ov-pu-val" data-fid="${id}" type="number" step="0.1" placeholder="auto" value="${ov.pushing?.value ?? ""}" style="${inS}" />
              <select class="pd-ov-pu-mode" data-fid="${id}" style="${selS}">
                <option value="abs"${puMode === "abs" ? " selected" : ""}>hits/min</option>
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

    // Wire override editor buttons after each render (delegated by data-fid).
    bindOverrideEditors() {
      const body = this.panel.querySelector("#pd-body");
      body.querySelectorAll(".pd-ov-save").forEach((btn) => {
        btn.onclick = () => {
          const fid = btn.getAttribute("data-fid");
          const num = (sel) => {
            const raw = body.querySelector(`.${sel}[data-fid="${fid}"]`).value;
            if (raw.trim() === "") return null; // explicit: empty field -> no override
            const v = parseFloat(raw);
            return Number.isFinite(v) ? v : null;
          };
          const mode = (sel) =>
            body.querySelector(`.${sel}[data-fid="${fid}"]`).value;
          const baseline = num("pd-ov-base");
          const elVal = num("pd-ov-el-val");
          const puVal = num("pd-ov-pu-val");
          Storage.setOverrides(fid, {
            baseline,
            elevated:
              elVal !== null
                ? { mode: mode("pd-ov-el-mode"), value: elVal }
                : null,
            pushing:
              puVal !== null
                ? { mode: mode("pd-ov-pu-mode"), value: puVal }
                : null,
          });
          Logger.info(`overrides saved for faction ${fid}`);
          if (document.activeElement && document.activeElement.blur)
            document.activeElement.blur();
          this.refresh(true);
        };
      });
      body.querySelectorAll(".pd-ov-clear").forEach((btn) => {
        btn.onclick = () => {
          const fid = btn.getAttribute("data-fid");
          Storage.setOverrides(fid, {});
          Logger.info(`overrides cleared for faction ${fid}`);
          if (document.activeElement && document.activeElement.blur)
            document.activeElement.blur();
          this.refresh(true);
        };
      });
      // When the user finishes editing (blur), flush any refresh we deferred
      // while they were typing, so the card catches up to the latest data.
      body.querySelectorAll("input, select").forEach((el) => {
        el.addEventListener("blur", () => {
          if (this._deferredRefresh) {
            // Defer to the next frame so a click on save/clear runs first.
            setTimeout(() => {
              if (this._deferredRefresh) this.refresh();
            }, 150);
          }
        });
      });
    },

    refresh(force) {
      if (!this.panel) return;
      const body = this.panel.querySelector("#pd-body");

      // Don't rewrite the DOM out from under a user actively typing an override
      // (on ANY tab, including the leader whose 30s poll would otherwise wipe
      // the field). Defer this render; the next tick or the input's blur will
      // pick it up. `force` bypasses this for deliberate user actions (save,
      // clear, calibrate) that SHOULD update the view immediately.
      if (!force) {
        const active = document.activeElement;
        if (
          active &&
          this.panel.contains(active) &&
          (active.tagName === "INPUT" || active.tagName === "SELECT")
        ) {
          this._deferredRefresh = true;
          return;
        }
      }
      this._deferredRefresh = false;

      const watchlist = Storage.getWatchedFactions();
      if (watchlist.length === 0) {
        body.innerHTML =
          '<div style="color:#999; font-size:11px;">No factions watched. Click <b>⚙ setup</b> to add your API key and faction IDs.</div>';
        return;
      }
      // Preserve which cards are open across the refresh (poll-driven re-render
      // must not collapse a card the user opened). Track both faction cards and
      // their nested override editors.
      const openSet = new Set(
        Array.from(body.querySelectorAll("details[data-faction][open]")).map(
          (d) => d.getAttribute("data-faction"),
        ),
      );
      const openOv = new Set(
        Array.from(body.querySelectorAll("details[data-ovfor][open]")).map(
          (d) => d.getAttribute("data-ovfor"),
        ),
      );
      body.innerHTML = watchlist
        .map((id) => this.factionCard(id, openSet))
        .join("");
      // Restore nested override-editor open state.
      openOv.forEach((fid) => {
        const el = body.querySelector(`details[data-ovfor="${fid}"]`);
        if (el) el.open = true;
      });
      this.bindOverrideEditors();
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

      // Log feed — newest first, color-coded. Preserve scroll position so a
      // poll-driven refresh doesn't yank the user back to the top mid-read.
      const logEl = this.panel.querySelector("#pd-log");
      const logPrevScroll = logEl.scrollTop;
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
      logEl.innerHTML = logHtml;
      logEl.scrollTop = logPrevScroll; // hold the reader's place across refresh

      // Raw per-faction data — native <details> keeps this simple and accessible.
      // Capture which sections are open (keyed by faction id, stable across
      // renders) so a refresh from new poll data doesn't collapse them.
      const rawEl = this.panel.querySelector("#pd-raw");
      const openFactions = new Set(
        Array.from(rawEl.querySelectorAll("details[open][data-faction]")).map(
          (d) => d.getAttribute("data-faction"),
        ),
      );
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
            const openAttr = openFactions.has(String(id)) ? " open" : "";
            return `
          <details data-faction="${id}"${openAttr} style="margin-bottom:4px;">
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
      rawEl.innerHTML = rawHtml;

      // Cache summary — one line per cached faction, pinned marker for own
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
      this.panel.querySelector("#pd-body").textContent =
        "Calibrating from chain history...";
      for (const factionId of watchlist) {
        await calibrateFaction(factionId, apiKey); // logs its own result via Logger
      }
      this.refresh(true);
    },
    // Toggle the inline setup form. When opening, populate inputs from stored
    // values; `force` can explicitly open (true) or close (false).
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

      Storage.setApiKey(key);
      Storage.setOwnFactionId(own || null);
      Storage.setWatchedFactions(watch);
      CONFIG.cache.ownFactionId = own || null;

      const msg = this.panel.querySelector("#pd-setup-msg");
      msg.textContent = "Saved ✓";
      setTimeout(() => {
        if (msg) msg.textContent = "";
      }, 2000);

      // Blur any focused field, then force the render past the typing-guard —
      // this is a deliberate save, so the view must update now.
      if (document.activeElement && document.activeElement.blur)
        document.activeElement.blur();
      this.refresh(true);
      // Apply immediately only if this tab is the poller; otherwise the leader
      // will pick up the new settings from shared storage on its next tick.
      if (TabLeader.isLeader()) pollAll();
    },

    // Footer: rolling call rate, color-coded against the budget, plus how long
    // ago the last API call fired. Independent of the poll loop so it stays
    // live between cycles.
    refreshFooter() {
      if (!this.panel) return;
      const rate = limiter.ratePerMinute();
      const util = limiter.utilization();
      const dot = this.panel.querySelector("#pd-rate-dot");
      const text = this.panel.querySelector("#pd-rate-text");
      const last = this.panel.querySelector("#pd-lastcall");

      // Thresholds are against our self-imposed budget (limiter.max = 60),
      // which already sits under Torn's 100/min hard cap.
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
      const min = Math.round(sec / 60);
      return `${min}m ago`;
    },

    // Small footer badge showing whether THIS tab is the polling leader.
    // A follower tab shows "following" — it's not making API calls, it's
    // rendering from the shared state the leader keeps fresh.
    refreshLeaderBadge(isLeader) {
      if (!this.panel) return;
      const el = this.panel.querySelector("#pd-leader");
      if (!el) return;
      el.textContent = isLeader ? "◉ polling" : "○ following";
      el.style.color = isLeader ? "#5fc46a" : "#777";
    },
  };

  // =========================================================================
  // 7b. TAB LEADER ELECTION — ensures only ONE tab polls the API, so N open
  //     tabs make 1x the calls, not Nx. The rate limiter is per-tab (in-memory),
  //     so without this, 3 tabs = 3x the real API load with each tab's limiter
  //     none the wiser — a fast way to blow Torn's 100/min IP/key cap.
  //
  //     Mechanism: a shared heartbeat in GM storage. The leader writes
  //     {id, ts} every few seconds. Any tab whose heartbeat is stale takes
  //     over. Followers don't poll — they just re-render from shared storage,
  //     which the leader keeps fresh.
  // =========================================================================
  const TabLeader = {
    key: "pushdet_leader",
    tabId: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    heartbeatMs: 3000,
    staleMs: 8000, // > 2 heartbeats: tolerate a missed beat before failover

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
    // Claim leadership if vacant or stale. Returns true if we (now) lead.
    tryClaim() {
      const cur = this.read();
      const now = Date.now();
      if (!cur || now - cur.ts > this.staleMs || cur.id === this.tabId) {
        GM_setValue(this.key, JSON.stringify({ id: this.tabId, ts: now }));
        return this.isLeader(); // re-read guards against a race with another tab
      }
      return false;
    },
    // Leader-only: refresh the heartbeat timestamp.
    beat() {
      if (this.isLeader()) {
        GM_setValue(
          this.key,
          JSON.stringify({ id: this.tabId, ts: Date.now() }),
        );
      }
    },
    // Release leadership on unload so a new leader is elected promptly.
    release() {
      if (this.isLeader()) GM_deleteValue(this.key);
    },
  };

  // =========================================================================
  // 8. BOOT
  // =========================================================================
  UI.init();

  // Only the leader tab polls the API; followers render from shared storage.
  // A single loop at the heartbeat cadence handles leadership upkeep and
  // (leader-only) polling. Followers re-render ONLY when the shared data
  // timestamp changes — never on every heartbeat — so a user typing a manual
  // override in a follower tab isn't interrupted by a 3s DOM rewrite.
  let lastPollAt = 0;
  let lastRenderedDataTs = Storage.getDataUpdatedTs();
  async function tick() {
    const leading = TabLeader.tryClaim(); // claim if vacant/stale, else false
    if (leading) {
      TabLeader.beat();
      if (Date.now() - lastPollAt >= CONFIG.pollIntervalMs) {
        lastPollAt = Date.now();
        await pollAll(); // marks data updated + refreshes this (leader) tab
        lastRenderedDataTs = Storage.getDataUpdatedTs();
      }
    } else {
      // Follower: re-render only if the leader has published newer data since
      // our last render. Otherwise leave the DOM (and any active input) alone.
      const dataTs = Storage.getDataUpdatedTs();
      if (dataTs !== lastRenderedDataTs) {
        lastRenderedDataTs = dataTs;
        UI.refresh();
      }
    }
    UI.refreshLeaderBadge(TabLeader.isLeader());
  }

  // Instant follower sync: when the leader bumps the broadcast key, re-render
  // immediately (still guarded by the timestamp check inside). This makes
  // followers update the moment new data lands, without polling for it.
  if (typeof GM_addValueChangeListener === "function") {
    GM_addValueChangeListener("pushdet_data_ts", (_n, _o, newVal, remote) => {
      if (!remote) return; // our own write; already handled
      const dataTs = typeof newVal === "number" ? newVal : Number(newVal) || 0;
      if (dataTs !== lastRenderedDataTs && !TabLeader.isLeader()) {
        lastRenderedDataTs = dataTs;
        UI.refresh();
      }
    });
  }

  // Kick once immediately, then on the heartbeat interval.
  tick();
  setInterval(tick, TabLeader.heartbeatMs);

  // Hand off cleanly so another tab takes over without waiting for staleness.
  window.addEventListener("beforeunload", () => TabLeader.release());
})();
