// ==UserScript==
// @name         Torn War Stuff Enhanced+
// @namespace    https://github.com/MWTBDLTR/torn-scripts
// @version      0.2
// @description  Show player status on war page such as hospital time, travel to/from torn, and abroad location as well as sorting that list by hospital time. Many performance improvements for fast status changes and re-sorting.
// @author       MrChurch [3654415] + xentac
// @license      MIT
// @match        https://www.torn.com/factions.php*
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @connect      api.torn.com
// ==/UserScript==

(async function () {
  'use strict';

  // de-dupe / play nice with FFScouter
  if (document.querySelector("#FFScouterV2DisableWarMonitor")) return;
  const ffScouterV2DisableWarMonitor = document.createElement("div");
  ffScouterV2DisableWarMonitor.id = "FFScouterV2DisableWarMonitor";
  ffScouterV2DisableWarMonitor.style.display = "none";
  document.documentElement.appendChild(ffScouterV2DisableWarMonitor);

  // config & key mgmt
  const LS_KEY = "twse_merged_apikey";
  let apiKey = localStorage.getItem(LS_KEY) ?? "###PDA-APIKEY###";
  const hasValidKey = () =>
    typeof apiKey === 'string' && apiKey.length === 16 && !apiKey.includes("PDA-APIKEY");

  function promptSetKey() {
    const userInput = prompt(
      "Enter your PUBLIC Torn API key (16 chars). Stored locally; used only for faction basic data:",
      hasValidKey() ? apiKey : ""
    );
    if (userInput && userInput.trim().length === 16) {
      apiKey = userInput.trim();
      localStorage.setItem(LS_KEY, apiKey);
      alert("API key saved locally.");
      running = true; // re-enable if it was halted
      backoffMs = 0;
      backoffUntil = 0;
    } else {
      alert("No valid key provided. The script will not call the API until a valid key is set.");
    }
  }
  function clearKey() {
    localStorage.removeItem(LS_KEY);
    apiKey = "###PDA-APIKEY###";
    alert("API key cleared from local storage.");
  }
  function showDataUse() {
    alert([
      "TWSE Merged — Data Use / ToS Summary",
      "",
      "• Purpose: Show travel/hospital status & sort lists using Torn's official API.",
      "• API Calls: faction/{id}?selections=basic (read-only).",
      "• Key Storage: Your PUBLIC key is stored locally in your browser (localStorage).",
      "• Sharing: Never shared with third parties; only sent to api.torn.com.",
      "• Access Level: Minimal (basic selection).",
      "• Rate Limits: Throttled and visibility-aware.",
    ].join("\n"));
  }
  try {
    GM_registerMenuCommand("Set API Key", () => promptSetKey());
    GM_registerMenuCommand("Clear API Key", () => clearKey());
    GM_registerMenuCommand("Data Use / ToS Summary", () => showDataUse());
  } catch {}

  // style (with :has and non-:has fallbacks)
  const CONTENT   = "data-twse-content";
  const TRAVELING = "data-twse-traveling";
  const HIGHLIGHT = "data-twse-highlight";
  const HCLASS    = "twse-highlight"; // fallback class for old browsers (no :has)
  const HAS_HAS   = CSS.supports?.("selector(:has(*))") ?? false;

  GM_addStyle(`
    .members-list li.${HCLASS} { background-color: #afa5 !important; }
    .members-list li:has(div.status[${HIGHLIGHT}="true"]) { background-color: #afa5 !important; }
    .members-list div.status[${TRAVELING}="true"]::after { color: #F287FF !important; }
    .members-list div.status { position: relative !important; }
    .members-list div.status[${CONTENT}] { color: transparent !important; }
    .members-list div.status[${CONTENT}]::after {
      content: attr(${CONTENT});
      position: absolute; top: 0; left: 0; width: calc(100% - 10px); height: 100%;
      background: inherit; display: flex; right: 10px; justify-content: flex-end; align-items: center;
    }
    .members-list .ok.status::after        { color: var(--user-status-green-color); }
    .members-list .not-ok.status::after    { color: var(--user-status-red-color); }
    .members-list .abroad.status::after,
    .members-list .traveling.status::after { color: var(--user-status-blue-color); }
  `);

  // state
  const sort_enemies = true;
  let ever_sorted = false;
  let running = true;
  let found_war = false;
  let warRoot = null;

  const member_status = new Map(); // userId -> API member
  const member_lis = new Map();    // userId -> <li>
  let memberListsCache = [];

  // cached nodes / helpers
  const liStatusDiv = new WeakMap(); // li -> div.status

  function getStatusDiv(li) {
    let d = liStatusDiv.get(li);
    if (!d || !d.isConnected) {
      d = li.querySelector("div.status");
      if (d) liStatusDiv.set(li, d);
    }
    return d;
  }

  const setDataset = (el, key, value) => {
    if (!el) return;
    const v = value == null ? "" : String(value);
    if (el.dataset[key] !== v) el.dataset[key] = v;
  };
  const getDataNum = (el, key) => {
    const v = el?.dataset?.[key];
    return v ? Number(v) : 0;
  };
  const safeRemoveAttr = (el, name) => { if (el?.hasAttribute?.(name)) el.removeAttribute(name); };
  const safeSetAttr = (el, name, value) => {
    if (!el) return;
    const v = String(value);
    if (el.getAttribute(name) !== v) el.setAttribute(name, v);
  };
  const pad2 = (n) => (n < 10 ? "0" : "") + n;
  const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: false });
  const nowSeconds = () => Math.trunc((window.getCurrentTimestamp?.() ?? Date.now()) / 1000);

  function nativeIsOK(statusDiv) {
    if (!statusDiv) return false;
    if (statusDiv.classList.contains('ok')) return true;
    const txt = statusDiv.textContent.trim().toLowerCase();
    return txt === 'ok' || txt.startsWith('okay');
  }

  // place abbreviations (single pass)
  const COUNTRY_MAP = {
    "South Africa": "SA",
    "Cayman Islands": "CI",
    "United Kingdom": "UK",
    "Argentina": "Arg",
    "Switzerland": "Switz"
  };
  const COUNTRY_RX = new RegExp(Object.keys(COUNTRY_MAP).join("|"), "g");
  const abbreviatePlaces = (s) => s?.replace(COUNTRY_RX, (m) => COUNTRY_MAP[m]) ?? "";

  // SPA lifecycle
  function onWarGone() {
    found_war = false;
    warRoot = null;
    member_lis.clear();
    memberListsCache = [];
    window.dispatchEvent(new Event("twse-war-gone"));
  }
  function onWarFound() {
    if (found_war) return;
    found_war = true;
    warRoot = document.querySelector(".faction-war") || document;
    extract_all_member_lis();
    prime_status_placeholders();
    window.dispatchEvent(new Event("twse-war-found"));
  }

  function refresh_member_lists_cache() {
    const root = document.querySelector(".faction-war");
    if (!root) {
      memberListsCache = Array.from(document.querySelectorAll("ul.members-list"));
      return;
    }
    warRoot = root;
    memberListsCache = Array.from(root.querySelectorAll("ul.members-list"));
  }
  function get_member_lists() {
    if (warRoot && !warRoot.isConnected) onWarGone();
    if (memberListsCache.length === 0) refresh_member_lists_cache();
    return memberListsCache;
  }

  function get_faction_ids() {
    const ids = new Set();
    get_member_lists().forEach((elem) => {
      const a = elem.querySelector(`a[href^="/factions.php"]`);
      if (!a) return;
      try {
        const id = new URL(a.href, location.origin).searchParams.get("ID");
        if (id) ids.add(id);
      } catch {
        const id = (a.href.split("ID=")[1] || "").split("&")[0];
        if (id) ids.add(id);
      }
    });
    return [...ids];
  }

  function get_sorted_column(member_list) {
    const root = member_list.parentNode;
    const member_div = root?.querySelector("div.member div");
    const level_div  = root?.querySelector("div.level div");
    const points_div = root?.querySelector("div.points div");
    const status_div = root?.querySelector("div.status div");

    let column = null, classname = "";
    if (member_div?.className.match(/activeIcon__/)) { column = "member"; classname = member_div.className; }
    else if (level_div?.className.match(/activeIcon__/)) { column = "level"; classname = level_div.className; }
    else if (points_div?.className.match(/activeIcon__/)) { column = "points"; classname = points_div.className; }
    else if (status_div?.className.match(/activeIcon__/)) { column = "status"; classname = status_div.className; }

    const order = classname.match(/asc__/) ? "asc" : "desc";
    if (column !== "score" && order !== "desc") ever_sorted = true;
    return { column, order };
  }

  function extract_all_member_lis() {
    member_lis.clear();
    refresh_member_lists_cache();
    get_member_lists().forEach(extract_member_lis);
  }
  function extract_member_lis(ul) {
    ul.querySelectorAll("li.enemy, li.your").forEach((li) => {
      const a = li.querySelector(`a[href^="/profiles.php"]`);
      if (!a) return;
      let id = null;
      try {
        const u = new URL(a.href, location.origin);
        id = u.searchParams.get("XID") || u.searchParams.get("ID");
      } catch {
        const m = a.href.match(/[?&](?:XID|ID)=(\d+)/);
        id = m ? m[1] : null;
      }
      if (id) member_lis.set(id, li);
    });
  }
  function prime_status_placeholders() {
    (warRoot || document).querySelectorAll(".members-list div.status").forEach((el) => {
      if (!el.hasAttribute(CONTENT)) el.setAttribute(CONTENT, el.textContent);
    });
  }

  // observer (SPA mount/unmount + lists keep-fresh) with micro-debounce
  let refreshPending = false;
  function scheduleRefreshLists() {
    if (refreshPending) return;
    refreshPending = true;
    setTimeout(() => {
      refreshPending = false;
      refresh_member_lists_cache();
    }, 0);
  }

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node?.classList?.contains?.("faction-war")) {
          onWarFound();
          scheduleRefreshLists();
          return;
        }
        if (node?.nodeType === 1 && (node.matches?.("ul.members-list") || node.querySelector?.("ul.members-list"))) {
          scheduleRefreshLists();
        }
      }
      for (const node of m.removedNodes) {
        if (node?.nodeType === 1) {
          if (node.matches?.(".faction-war") || node.querySelector?.(".faction-war")) {
            onWarGone();
          }
          if (node.matches?.("ul.members-list") || node.querySelector?.("ul.members-list")) {
            scheduleRefreshLists();
          }
        }
      }
    }
  });
  setTimeout(() => { if (document.querySelector(".faction-war")) onWarFound(); }, 800);
  observer.observe(document.body, { subtree: true, childList: true });

  // network & backoff
  let last_request_ts = 0;
  const MIN_TIME_SINCE_LAST_REQUEST = 9000; // ms between request batches
  let backoffUntil = 0; // ms epoch; set on rate-limit errors
  let inFlightController = null;

  // exponential backoff with jitter
  let backoffMs = 0;
  const BACKOFF_BASE = 2000, BACKOFF_MAX = 120000;
  const jitter = (ms) => ms + Math.floor(Math.random() * 1000) - 500;
  function setBackoff(escalate = true) {
    backoffMs = escalate ? Math.min(BACKOFF_MAX, backoffMs ? backoffMs * 2 : BACKOFF_BASE) : BACKOFF_BASE;
    backoffUntil = Date.now() + jitter(backoffMs);
  }

  function abortInFlight() {
    const c = inFlightController;
    if (c) { try { c.abort(); } catch {} }
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) abortInFlight();
  }, { passive: true });

  async function update_statuses() {
    if (!running || !hasValidKey()) return;
    if (warRoot && !warRoot.isConnected) onWarGone();
    if (!found_war || document.hidden) return;

    const now = Date.now();
    if (now < backoffUntil) return;

    const faction_ids = get_faction_ids();
    if (!faction_ids.length) return;
    if (now - last_request_ts < MIN_TIME_SINCE_LAST_REQUEST + Math.floor(Math.random()*2000) - 1000) return;

    inFlightController = new AbortController();
    const controller = inFlightController;
    let madeARequest = false;

    for (const id of faction_ids) {
      if (!controller || controller.signal.aborted) break;
      const ok = await update_status(id, controller.signal);
      madeARequest = true;
      if (!ok) break; // stop on error/backoff
      await new Promise((r) => setTimeout(r, 150 + Math.floor(Math.random()*120)));
      if (document.hidden || controller.signal.aborted) break;
    }
    if (madeARequest) last_request_ts = Date.now();
    if (inFlightController === controller) inFlightController = null;
  }

  function normalizeErrorCode(status) {
    // torn can return { error: { code, error } } or sometimes a bare numeric
    if (!status) return null;
    const e = status.error;
    if (e == null) return null;
    if (typeof e === 'number') return e;
    if (typeof e?.code === 'number') return e.code;
    return null;
  }

  let fatalAlertShown = false;

  async function update_status(faction_id, signal) {
    try {
      const r = await fetch(
        `https://api.torn.com/faction/${faction_id}?selections=basic&key=${apiKey}&comment=TWSE-Merged`,
        { method: 'GET', mode: 'cors', cache: 'no-store', signal }
      );
      const status = await r.json();

      const code = normalizeErrorCode(status);
      if (code != null) {
        // rate-limit / temporary issues
        if ([5, 8, 9].includes(code)) { // too many reqs, IP block, API disabled
          setBackoff(true);
          return false;
        }
        // non-recoverable / fatal -> halt + surface once
        if ([0,1,2,3,4,6,7,10,12,13,14,16,18,21].includes(code)) {
          running = false;
          if (!fatalAlertShown) {
            fatalAlertShown = true;
            setTimeout(() => alert(
              `TWSE halted due to API error code ${code}.` +
              `\n\nUse “Set API Key” to update your PUBLIC API key, then reload.`
            ), 0);
          }
          return false;
        }
        // default minor backoff
        setBackoff(false);
        return false;
      }

      if (!status?.members) return true;

      for (const [k, v] of Object.entries(status.members)) {
        const d = abbreviatePlaces(v.status?.description || "");
        v.status.description = d;
        member_status.set(k, v);
      }
      return true;
    } catch (e) {
      if (e?.name === 'AbortError') return false;
      console.error("[TWSE-Merged] Network/parse error:", e && e.message ? e.message : e);
      setBackoff(false);
      return false;
    }
  }

  // watch/render
  let last_frame = 0;
  const TIME_BETWEEN_FRAMES = 750; // ms

  function watch() {
    if (found_war && warRoot && !warRoot.isConnected) onWarGone();
    if (!found_war) return requestAnimationFrame(watch);
    if (document.hidden) return requestAnimationFrame(watch);

    const now = performance.now();
    if (now - last_frame < TIME_BETWEEN_FRAMES) return requestAnimationFrame(watch);
    last_frame = now;

    member_lis.forEach((li, id) => {
      const state = member_status.get(id);
      const status_DIV = getStatusDiv(li);
      if (!status_DIV) return;

      // clear fallback class; re-apply if needed later (only if no :has())
      if (!HAS_HAS && li.classList.contains(HCLASS)) li.classList.remove(HCLASS);

      if (!state || !running) {
        safeSetAttr(status_DIV, CONTENT, status_DIV.getAttribute(CONTENT) || status_DIV.textContent);
        return;
      }

      const st = state.status || {};
      setDataset(li, "until", st.until ?? "");
      setDataset(li, "location", "");

      switch (st.state) {
        case "Abroad":
        case "Traveling": {
          safeRemoveAttr(li, "data-until");
          safeRemoveAttr(li, "data-location");

          const desc = st.description || "";
          if (desc.includes("Traveling to ")) {
            setDataset(li, "sortA", 4);
            const content = "► " + desc.split("Traveling to ")[1];
            setDataset(li, "location", content);
            safeSetAttr(status_DIV, CONTENT, content);
          } else if (desc.includes("In ")) {
            setDataset(li, "sortA", 3);
            const content = desc.split("In ")[1];
            setDataset(li, "location", content);
            safeSetAttr(status_DIV, CONTENT, content);
          } else if (desc.includes("Returning")) {
            setDataset(li, "sortA", 2);
            const content = "◄ " + desc.split("Returning to Torn from ")[1];
            setDataset(li, "location", content);
            safeSetAttr(status_DIV, CONTENT, content);
          } else {
            setDataset(li, "sortA", 5);
            setDataset(li, "location", "Traveling");
            safeSetAttr(status_DIV, CONTENT, "Traveling");
          }
          break;
        }

        case "Hospital":
        case "Jail": {
          if (nativeIsOK(status_DIV)) {
            safeRemoveAttr(status_DIV, CONTENT);
            safeSetAttr(status_DIV, TRAVELING, "false");
            safeSetAttr(status_DIV, HIGHLIGHT, "false");
            setDataset(li, "sortA", 0);
            safeRemoveAttr(li, "data-until");
            safeRemoveAttr(li, "data-location");
            break;
          }

          setDataset(li, "sortA", 1);
          safeSetAttr(status_DIV, TRAVELING, (st.description || "").includes("In a") ? "true" : "false");

          const remain = Math.max(0, ((st.until >>> 0) - nowSeconds()) | 0);
          if (remain <= 0) {
            safeSetAttr(status_DIV, HIGHLIGHT, "false");
            safeSetAttr(status_DIV, CONTENT, status_DIV.getAttribute(CONTENT) || status_DIV.textContent);
            safeRemoveAttr(li, "data-until");
            safeRemoveAttr(li, "data-location");
            break;
          }

          const s = remain % 60;
          const m = ((remain / 60) | 0) % 60;
          const h = (remain / 3600) | 0;
          const t = `${pad2(h)}:${pad2(m)}:${pad2(s)}`;

          if (status_DIV.getAttribute(CONTENT) !== t) safeSetAttr(status_DIV, CONTENT, t);
          const isSoon = remain < 300 ? "true" : "false";
          safeSetAttr(status_DIV, HIGHLIGHT, isSoon);

          // fallback highlight class for browsers without :has()
          if (!HAS_HAS && isSoon === "true" && !li.classList.contains(HCLASS)) li.classList.add(HCLASS);

          safeRemoveAttr(li, "data-location");
          break;
        }

        default: {
          safeRemoveAttr(status_DIV, CONTENT);
          setDataset(li, "sortA", 0);
          safeSetAttr(status_DIV, TRAVELING, "false");
          safeSetAttr(status_DIV, HIGHLIGHT, "false");
          safeRemoveAttr(li, "data-until");
          safeRemoveAttr(li, "data-location");
        }
      }
    });

    if (sort_enemies) {
      const lists = get_member_lists();
      for (let i = 0; i < lists.length; i++) {
        let sorted_column = get_sorted_column(lists[i]);
        if (!ever_sorted) sorted_column = { column: "status", order: "asc" };
        if (sorted_column.column !== "status") continue;

        const lis = lists[i].querySelectorAll("li.enemy, li.your");
        const arr = Array.from(lis).map(li => ({
          li,
          a: +(li.dataset.sortA || 0),
          loc: li.dataset.location || "",
          until: +(li.dataset.until || 0)
        }));

        const asc = sorted_column.order === "asc";
        const sorted = arr.slice().sort((L, R) => {
          let left = L, right = R;
          if (!asc) [left, right] = [R, L];
          if (left.a !== right.a) return left.a - right.a;
          if (left.loc && right.loc) {
            const cmp = collator.compare(left.loc, right.loc);
            if (cmp !== 0) return cmp;
          }
          return left.until - right.until;
        }).map(o => o.li);

        // detect if the order differs
        let isSame = true;
        for (let j = 0; j < sorted.length; j++) {
          if (lis[j] !== sorted[j]) { isSame = false; break; }
        }
        if (!isSame) {
          const ul = lists[i];
          const prevDisplay = ul.style.display;
          ul.style.display = "none";
          const frag = document.createDocumentFragment();
          sorted.forEach((li) => frag.appendChild(li));
          ul.appendChild(frag);
          ul.style.display = prevDisplay;
        }
      }
    }

    requestAnimationFrame(watch);
  }

  // scheduler (visibility-aware)
  let tickTimer = null;
  function scheduleTick() {
    clearTimeout(tickTimer);
    tickTimer = setTimeout(() => {
      if (!document.hidden) update_statuses();
      scheduleTick();
    }, 1000);
  }
  scheduleTick();

  setTimeout(() => {
    prime_status_placeholders();
    requestAnimationFrame(watch);
  }, 1000);

  // SPA hash nav resilience
  window.addEventListener("hashchange", () => {
    onWarGone();
    setTimeout(() => {
      if (document.querySelector(".faction-war")) onWarFound();
      scheduleRefreshLists();
    }, 300);
  }, { passive: true });

  // cleanup on pagehide
  window.addEventListener("pagehide", () => {
    observer.disconnect();
    clearTimeout(tickTimer);
    abortInFlight();
  }, { passive: true });

  // init log
  (function initLog() {
    const logInit = () => {
      console.log(
        "[TWSE-Merged] Initialization complete. Found war section:",
        found_war,
        "Valid API key:",
        hasValidKey(),
        "HAS(:has):",
        HAS_HAS
      );
    };
    const timeoutId = setTimeout(logInit, 1500);
    window.addEventListener("twse-war-found", () => {
      clearTimeout(timeoutId);
      logInit();
    }, { once: true });
  })();

  window.dispatchEvent(new Event("FFScouterV2DisableWarMonitor"));
})();
