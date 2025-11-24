// ==UserScript==
// @name         Torn War Stuff Enhanced + WebSocket
// @namespace    https://github.com/MWTBDLTR/torn-scripts
// @version      4.5.7
// @description  The ultimate war monitor. Uses WebSockets for INSTANT status updates and the API for detailed timers.
// @author       MrChurch [3654415] + xentac + Heasley (WebSocket logic) + Merge
// @license      MIT
// @match        https://www.torn.com/factions.php*
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      api.torn.com
// @connect      ws-centrifugo.torn.com
// ==/UserScript==

(async function () {
  'use strict';

  // --- CONFIGURATION ---
  const USE_WEBSOCKETS = true;
  const STARTUP_DELAY_MS = 3000;
  const RESYNC_THRESHOLD_MS = 3000;
  const UNKNOWN_UNTIL = 4294967295; // Max 32-bit int (Sorts to bottom of ascending list)
  const TIME_BETWEEN_FRAMES = 250; // Faster refresh (4fps) for smoother timers

  // --- STATE MANAGEMENT ---
  let DEBUG = GM_getValue("twseo_debug_mode", false);
  let LOG_STATUS = GM_getValue("twseo_log_status", false);

  // Default OFF = Stable/Static List. ON = High Levels jump to top.
  let SORT_OKAY_BY_SCORE = GM_getValue("twseo_sort_okay_score", false);

  console.log(
      `%c[TWSEO] Script Loaded (v4.5.7) | Debug: ${DEBUG} | Sort Okay Score: ${SORT_OKAY_BY_SCORE}`,
      "color: #00ff00; font-weight: bold; background: #333; padding: 2px 5px;"
  );

  function toggleDebug() {
      DEBUG = !DEBUG;
      GM_setValue("twseo_debug_mode", DEBUG);
      alert(`TWSEO Debug Mode is now: ${DEBUG ? "ON" : "OFF"}.\nReloading page...`);
      location.reload();
  }

  function toggleStatusLogs() {
      LOG_STATUS = !LOG_STATUS;
      GM_setValue("twseo_log_status", LOG_STATUS);
      alert(`TWSEO Status Logs are now: ${LOG_STATUS ? "ON" : "OFF"}.`);
  }

  function toggleOkayScoreSort() {
      SORT_OKAY_BY_SCORE = !SORT_OKAY_BY_SCORE;
      GM_setValue("twseo_sort_okay_score", SORT_OKAY_BY_SCORE);
      alert(`TWSEO "Sort Okay by Score" is now: ${SORT_OKAY_BY_SCORE ? "ON" : "OFF"}.\nReloading page...`);
      location.reload();
  }

  function log(...args) {
      if (DEBUG) console.log("%c[TWSEO-DEBUG]", "color: #ffaa00; font-weight: bold;", ...args);
  }

  function logStatus(msg) {
      if (LOG_STATUS) console.log(`%c[TWSEO] ${msg}`, "color: #00ccff; font-weight: bold;");
  }

  // --- HELPER: ABBREVIATIONS ---
  const COUNTRY_MAP = {
    "South Africa": "SA",
    "Cayman Islands": "CI",
    "United Kingdom": "UK",
    "Argentina": "Arg",
    "Switzerland": "Switz"
  };
  const COUNTRY_RX = new RegExp(Object.keys(COUNTRY_MAP).join("|"), "g");
  const abbreviatePlaces = (s) => s?.replace(COUNTRY_RX, (m) => COUNTRY_MAP[m]) ?? "";

  // --- HELPER: SCORE/LEVEL SCRAPER (With Cache) ---
  const scoreCache = new Map();

  function getScore(li, id) {
      if (scoreCache.has(id)) return scoreCache.get(id);

      let val = 0;
      const pointsEl = li.querySelector(".points");
      if (pointsEl) {
          const txt = pointsEl.textContent.replace(/\D/g, "");
          val = parseInt(txt, 10);
      } else {
          const lvlEl = li.querySelector(".level");
          if (lvlEl) {
              const txt = lvlEl.textContent.replace(/\D/g, "");
              val = parseInt(txt, 10);
          }
      }

      if (!isNaN(val) && val > 0) {
           scoreCache.set(id, val);
      }
      return val || 0;
  }

  // --- COMPATIBILITY ---
  if (!document.querySelector("#FFScouterV2DisableWarMonitor")) {
      const ffScouterV2DisableWarMonitor = document.createElement("div");
      ffScouterV2DisableWarMonitor.id = "FFScouterV2DisableWarMonitor";
      ffScouterV2DisableWarMonitor.style.display = "none";
      document.documentElement.appendChild(ffScouterV2DisableWarMonitor);
      window.dispatchEvent(new Event("FFScouterV2DisableWarMonitor"));
  }

  // --- API KEY MANAGEMENT ---
  const LS_KEY = "twseo_merged_apikey";
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
      running = true;
      backoffMs = 0;
      backoffUntil = 0;
    }
  }

  function clearKey() {
    localStorage.removeItem(LS_KEY);
    apiKey = "###PDA-APIKEY###";
    alert("API key cleared from local storage.");
  }

  try {
    GM_registerMenuCommand("Set API Key", () => promptSetKey());
    GM_registerMenuCommand("Clear API Key", () => clearKey());
    GM_registerMenuCommand(`Toggle Sort Okay by Score (${SORT_OKAY_BY_SCORE ? "ON" : "OFF"})`, () => toggleOkayScoreSort());
    GM_registerMenuCommand(`Toggle Status Logs (${LOG_STATUS ? "ON" : "OFF"})`, () => toggleStatusLogs());
    GM_registerMenuCommand(`Toggle Debug Mode (${DEBUG ? "ON" : "OFF"})`, () => toggleDebug());
  } catch {}

  // --- STYLES ---
  const CONTENT   = "data-twseo-content";
  const TRAVELING = "data-twseo-traveling";
  const HIGHLIGHT = "data-twseo-highlight";
  const COLOR     = "data-twseo-color";
  const HCLASS    = "twseo-highlight";
  const HAS_HAS   = CSS.supports?.("selector(:has(*))") ?? false;

  GM_addStyle(`
    .members-list li.${HCLASS} { background-color: #afa5 !important; }
    .members-list li:has(div.status[${HIGHLIGHT}="true"]) { background-color: #afa5 !important; }

    .members-list div.status { position: relative !important; }
    .members-list div.status[${CONTENT}] { color: transparent !important; }
    .members-list div.status[${CONTENT}]::after {
      content: attr(${CONTENT});
      position: absolute;
      top: 0;
      right: 10px;
      width: auto;
      max-width: 90px;
      height: 100%;
      background: inherit;
      display: flex;
      justify-content: flex-end;
      align-items: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .members-list div.status[${COLOR}="green"]::after { color: var(--user-status-green-color) !important; }
    .members-list div.status[${COLOR}="red"]::after   { color: var(--user-status-red-color) !important; }
    .members-list div.status[${COLOR}="blue"]::after  { color: var(--user-status-blue-color) !important; }

    /* Moved TRAVELING rule after color rules so it takes precedence */
    .members-list div.status[${TRAVELING}="true"]::after { color: #F287FF !important; }

    @keyframes twseo-flash {
        0% { box-shadow: inset 0 0 0px gold; }
        50% { box-shadow: inset 0 0 10px gold; }
        100% { box-shadow: inset 0 0 0px gold; }
    }
    .twseo-ws-updated { animation: twseo-flash 1s ease-out; }

    #twseo-debug-indicator {
        position: fixed; top: 0; right: 0; background: orange; color: black;
        font-weight: bold; padding: 2px 5px; z-index: 999999; font-size: 10px;
        pointer-events: none; opacity: 0.8;
    }
  `);

  if (DEBUG) {
      const debugInd = document.createElement("div");
      debugInd.id = "twseo-debug-indicator";
      debugInd.textContent = "TWSEO DEBUG";
      document.body.appendChild(debugInd);
  }

  // --- STATE ---
  const sort_enemies = true;
  let ever_sorted = false;
  let running = true;
  let found_war = false;
  let warRoot = null;

  const member_status = new Map();
  const member_lis = new Map();
  let memberListsCache = [];

  // --- WEBSOCKET LOGIC ---
  let socket;
  let subscribedFactions = new Set();
  let msgId = 1;
  let wsInitTimeout = null;

  const WS_URL = "wss://ws-centrifugo.torn.com/connection/websocket";

  function getWebSocketToken() {
      const el = document.getElementById('websocketConnectionData');
      if (!el) return null;
      try {
          const data = JSON.parse(el.innerText);
          return data.token;
      } catch (e) {
          console.error("[TWSEO] Error parsing WS data:", e);
          return null;
      }
  }

  function createWebSocketConnection() {
      if (!USE_WEBSOCKETS) return;
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;

      const token = getWebSocketToken();
      if (!token) return;

      log(`Initializing WebSocket connection...`);
      socket = new WebSocket(WS_URL);

      socket.onopen = function() {
          const authMsg = {
              "connect": {
                  "token": token,
                  "name": "js"
              },
              "id": msgId++
          };
          socket.send(JSON.stringify(authMsg));
      };

      socket.onmessage = function(event) {
          try {
              if (event.data === '{}') {
                  socket.send('{}');
                  return;
              }

              const data = JSON.parse(event.data);

              if (data.connect) {
                  log("WS Authenticated.");
                  subscribeToFactions(get_faction_ids());
                  return;
              }

              if (data.push && data.push.pub && data.push.pub.data) {
                  const msg = data.push.pub.data.message;
                  const actions = msg?.namespaces?.users?.actions;

                  if (actions?.updateIcons) {
                      const update = actions.updateIcons;
                      if (update.userId && update.icons) {
                          const singleMap = {};
                          singleMap[update.userId] = update.icons;
                          processWebSocketIcons(singleMap);
                      } else {
                          processWebSocketIcons(update);
                      }
                  }
              }
          } catch (e) {
              console.error("[TWSEO] WS Message Error:", e);
          }
      };

      socket.onclose = function(event) {
          log(`WS Closed. Reconnecting in 5s...`);
          subscribedFactions.clear();
          setTimeout(createWebSocketConnection, 5000);
      };
  }

  function subscribeToFactions(factionIds) {
      if (!socket || socket.readyState !== WebSocket.OPEN) return;

      factionIds.forEach(fid => {
          if (!subscribedFactions.has(fid)) {
              log(`Subscribing to channel: faction-users-${fid}`);
              const msg = {
                  "subscribe": { "channel": `faction-users-${fid}` },
                  "id": msgId++
              };
              socket.send(JSON.stringify(msg));
              subscribedFactions.add(fid);
          }
      });
  }

  function processWebSocketIcons(iconsObj) {
      if (!iconsObj) return;

      let needsRender = false;

      for (const [userId, iconHtml] of Object.entries(iconsObj)) {
          if (typeof iconHtml !== 'string') continue;

          const uidStr = String(userId);
          const currentData = member_status.get(uidStr) || { status: {} };

          let newState = "Okay";
          let newDesc = "Okay";

          if (iconHtml.includes('class="hospital"') || iconHtml.includes("icon15")) {
              newState = "Hospital";
              newDesc = "In Hospital (WS)";
          } else if (iconHtml.includes('class="jail"') || iconHtml.includes("icon16")) {
              newState = "Jail";
              newDesc = "In Jail (WS)";
              // V4.5.7: Enhanced Federal Detection for WS
              if (iconHtml.toLowerCase().includes("federal")) {
                  newState = "Federal";
                  newDesc = "Federal Jail (WS)";
              }
          } else if (iconHtml.includes('class="traveling"') || iconHtml.includes('class="abroad"') || iconHtml.includes("icon71")) {
              newState = "Traveling";
              newDesc = "Traveling (WS)";

              const destMatch = iconHtml.match(/Traveling to ([^"<]+)/);
              if (destMatch && destMatch[1]) {
                  const dest = abbreviatePlaces(destMatch[1].trim());
                  newDesc = "Traveling to " + dest;
              } else if (iconHtml.includes("Returning")) {
                  newDesc = "Returning to Torn";
              }
          }

          // Sticky Abroad Check
          if (newState === "Hospital") {
              const oldDesc = currentData.status.description || "";
              if (oldDesc.includes("Traveling") || oldDesc.includes("In ") || oldDesc.includes("Abroad")) {
                  if (!oldDesc.includes("Returning")) {
                      newDesc = "In a hospital (WS)";
                  }
              }
          }

          if (currentData.status.state !== newState || currentData.status.description !== newDesc) {
              logStatus(`Status Change: [${uidStr}]: ${currentData.status.state || 'Unknown'} -> ${newState} (${newDesc})`);

              const oldState = currentData.status.state;

              currentData.status.state = newState;
              currentData.status.description = newDesc;
              currentData.status.updated = Date.now();

              // V4.5: Fresh Okay Logic
              if (newState === "Okay") {
                  currentData.status.freshOkay = true; // Mark as fresh to sink to bottom
              } else {
                  currentData.status.freshOkay = false;
              }

              // V4.5: Fresh Hospital Logic
              if (newState === 'Hospital' || newState === 'Jail') {
                  if (oldState !== newState) {
                      currentData.status.until = UNKNOWN_UNTIL; // Force bottom of hospital list
                  }
              } else {
                  currentData.status.until = 0;
              }

              member_status.set(uidStr, currentData);
              triggerFlash(uidStr);
              needsRender = true;
          }
      }

      if (needsRender) {
          last_frame = 0;
          requestAnimationFrame(watch);
      }
  }

  function triggerFlash(userId) {
      const li = member_lis.get(String(userId));
      if (li) {
          li.classList.remove('twseo-ws-updated');
          void li.offsetWidth; // trigger reflow
          li.classList.add('twseo-ws-updated');
      }
  }

  // --- CACHING & HELPERS ---
  const liStatusDiv = new WeakMap();

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
  const safeRemoveAttr = (el, name) => { if (el?.hasAttribute?.(name)) el.removeAttribute(name); };
  const safeSetAttr = (el, name, value) => {
    if (!el) return;
    const v = String(value);
    if (el.getAttribute(name) !== v) el.setAttribute(name, v);
  };
  const pad2 = (n) => (n < 10 ? "0" : "") + n;

  // OPTIMIZATION: Use bitwise OR for faster floor, keep logic inline
  const nowSeconds = () => ((window.getCurrentTimestamp?.() ?? Date.now()) / 1000) | 0;

  function nativeIsOK(statusDiv) {
    return statusDiv.classList.contains('ok');
  }

  // --- CORE LOGIC ---

  function onWarGone() {
    found_war = false;
    warRoot = null;
    member_lis.clear();
    memberListsCache = [];
    window.dispatchEvent(new Event("twseo-war-gone"));
  }

  function onWarFound() {
    if (found_war) return;
    found_war = true;

    const warWrapper = document.querySelector(".faction-war");
    const anyList = document.querySelector("ul.members-list");

    warRoot = warWrapper || (anyList ? document : null);

    if (!warRoot) {
        found_war = false;
        return;
    }

    log("Target List Found. Initializing Monitor...");
    extract_all_member_lis();
    prime_status_placeholders();

    if (USE_WEBSOCKETS) {
        if (wsInitTimeout) clearTimeout(wsInitTimeout);
        wsInitTimeout = setTimeout(() => {
            if (!socket || socket.readyState !== WebSocket.OPEN) {
                createWebSocketConnection();
            } else {
                subscribeToFactions(get_faction_ids());
            }
        }, STARTUP_DELAY_MS);
    }

    window.dispatchEvent(new Event("twseo-war-found"));
  }

  function refresh_member_lists_cache() {
    const warEl = document.querySelector(".faction-war");
    if (warEl) {
        warRoot = warEl;
        memberListsCache = Array.from(warEl.querySelectorAll("ul.members-list"));
        return;
    }

    memberListsCache = Array.from(document.querySelectorAll("ul.members-list"));
    if(memberListsCache.length > 0) warRoot = document;
    else {
        warRoot = null;
    }
  }

  function get_member_lists() {
    if (warRoot && warRoot !== document && !warRoot.isConnected) onWarGone();
    if (memberListsCache.length === 0) refresh_member_lists_cache();
    return memberListsCache;
  }

  function get_faction_ids() {
    const ids = new Set();

    get_member_lists().forEach((elem) => {
      const a = elem.querySelector(`a[href^="/factions.php"]`);
      if (a) {
          try {
            const id = new URL(a.href, location.origin).searchParams.get("ID");
            if (id) ids.add(id);
          } catch {
            const id = (a.href.split("ID=")[1] || "").split("&")[0];
            if (id) ids.add(id);
          }
      }
    });

    if (ids.size === 0) {
        const urlParams = new URLSearchParams(window.location.search);
        const urlId = urlParams.get("ID");
        if (urlId) ids.add(urlId);
    }

    return [...ids];
  }

  function get_sorted_column(member_list) {
    const root = member_list.parentNode;
    const member_div = root?.querySelector("div.member div");
    const status_div = root?.querySelector("div.status div");

    let column = null, classname = "";
    if (member_div?.className.match(/activeIcon__/)) { column = "member"; classname = member_div.className; }
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
    const selector = document.querySelector(".faction-war") ? "li.enemy, li.your" : "li";

    ul.querySelectorAll(selector).forEach((li) => {
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
      if (id) {
          member_lis.set(id, li);
          // OPTIMIZATION: Cache ID on element to avoid Regex in watch loop
          li.dataset.twseoId = id;
      }
    });
  }

  function prime_status_placeholders() {
    const root = warRoot || document;
    root.querySelectorAll(".members-list div.status").forEach((el) => {
      if (!el.hasAttribute(CONTENT)) el.setAttribute(CONTENT, el.textContent);
    });
  }

  // --- OBSERVER ---
  let refreshPending = false;
  function scheduleRefreshLists() {
    if (refreshPending) return;
    refreshPending = true;
    setTimeout(() => {
      refreshPending = false;
      refresh_member_lists_cache();
      if (USE_WEBSOCKETS && socket && socket.readyState === WebSocket.OPEN) {
          subscribeToFactions(get_faction_ids());
      }
    }, 0);
  }

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node?.classList?.contains?.("faction-war") ||
           (node?.nodeType === 1 && (node.matches?.("ul.members-list") || node.querySelector?.("ul.members-list")))) {
          onWarFound();
          scheduleRefreshLists();
          return;
        }
      }
      for (const node of m.removedNodes) {
        if (node?.nodeType === 1) {
          if (node.matches?.(".faction-war")) {
            onWarGone();
          }
        }
      }
    }
  });

  setTimeout(() => {
      if (document.querySelector("ul.members-list")) {
          onWarFound();
      }
  }, 800);

  observer.observe(document.body, { subtree: true, childList: true });

  // --- API BACKOFF / LOOP ---
  let last_request_ts = 0;
  const MIN_TIME_SINCE_LAST_REQUEST = 9000;
  let backoffUntil = 0;
  let backoffMs = 0;
  const BACKOFF_BASE = 2000, BACKOFF_MAX = 120000;
  const jitter = (ms) => ms + Math.floor(Math.random() * 1000) - 500;

  function setBackoff(escalate = true) {
    backoffMs = escalate ? Math.min(BACKOFF_MAX, backoffMs ? backoffMs * 2 : BACKOFF_BASE) : BACKOFF_BASE;
    backoffUntil = Date.now() + jitter(backoffMs);
  }

  async function update_statuses_api() {
    if (!running || !hasValidKey()) return;
    if (warRoot && warRoot !== document && !warRoot.isConnected) onWarGone();
    if (!found_war) return;
    if (document.hidden) return;

    const now = Date.now();
    if (now < backoffUntil) return;

    const faction_ids = get_faction_ids();
    if (!faction_ids.length) return;

    if (now - last_request_ts < MIN_TIME_SINCE_LAST_REQUEST + Math.floor(Math.random()*2000) - 1000) return;

    for (const id of faction_ids) {
      const ok = await update_status_single(id);
      if (!ok) break;
      await new Promise((r) => setTimeout(r, 150 + Math.floor(Math.random()*120)));
    }
    last_request_ts = Date.now();
  }

  function normalizeErrorCode(status) {
    if (!status) return null;
    const e = status.error;
    if (e == null) return null;
    if (typeof e === 'number') return e;
    if (typeof e?.code === 'number') return e.code;
    return null;
  }

  async function update_status_single(faction_id) {
    try {
      const r = await fetch(
        `https://api.torn.com/faction/${faction_id}?selections=basic&key=${apiKey}&comment=TWSEO-Merged`,
        { method: 'GET', mode: 'cors', cache: 'no-store' }
      );
      const status = await r.json();

      const code = normalizeErrorCode(status);
      if (code != null) {
        if ([5, 8, 9].includes(code)) {
          setBackoff(true);
          return false;
        }
        setBackoff(false);
        return false;
      }

      if (!status?.members) return true;

      for (const [k, v] of Object.entries(status.members)) {
        if (v.status && v.status.description) {
            v.status.description = abbreviatePlaces(v.status.description);
        }

        // --- STALE DATA PROTECTION ---
        // If API says "Okay", but we have a recent WS "Traveling" or "Hospital" status,
        // ignore the API update. The API is likely caching the old state.
        const current = member_status.get(k);
        if (current) {
            const curState = current.status.state;
            const curDesc = current.status.description || "";
            const isWsDerived = curDesc.includes("(WS)");
            const timeSinceUpdate = Date.now() - (current.status.updated || 0);

            if (
                (curState === "Traveling" || curState === "Hospital" || curState === "Jail") &&
                isWsDerived &&
                timeSinceUpdate < 60000 &&
                v.status.state === "Okay"
            ) {
                if (DEBUG) console.log(`[TWSEO] Protecting [${k}] from stale API 'Okay'. keeping '${curState}'`);
                continue; // Skip update for this member
            }
        }
        // -----------------------------

        v.status.updated = Date.now();
        member_status.set(k, v);
      }
      return true;
    } catch (e) {
      setBackoff(false);
      return false;
    }
  }

  // --- RENDER LOOP ---
  let last_frame = 0;

  function watch() {
    if (found_war && warRoot && warRoot !== document && !warRoot.isConnected) onWarGone();
    if (!found_war) return requestAnimationFrame(watch);
    if (document.hidden) return requestAnimationFrame(watch);

    const now = performance.now();
    if (now - last_frame < TIME_BETWEEN_FRAMES) return requestAnimationFrame(watch);
    last_frame = now;

    // OPTIMIZATION: Calculate current seconds ONCE per frame, not for every member
    const currentSec = nowSeconds();

    // Temporary map to store sort weights to avoid DOM reading in the sort loop
    const currentSortWeights = new Map();

    member_lis.forEach((li, id) => {
      const state = member_status.get(id);
      const status_DIV = getStatusDiv(li);
      if (!status_DIV) return;

      if (!HAS_HAS && li.classList.contains(HCLASS)) li.classList.remove(HCLASS);

      if (!state || !running) {
        safeSetAttr(status_DIV, CONTENT, status_DIV.getAttribute(CONTENT) || status_DIV.textContent);
        currentSortWeights.set(id, 0); // Default sort weight
        return;
      }

      const st = state.status || {};

      // Self-Healing
      if ((st.state === "Hospital" || st.state === "Jail") && nativeIsOK(status_DIV)) {
          // V4.5.3 FIX: Check if status is backed by WS or a future timer before overwriting
          const isWs = (st.description || "").includes("(WS)");
          const hasFutureTime = (st.until || 0) > currentSec;

          // Only sync if NOT from WS AND NO time remaining
          if (!isWs && !hasFutureTime) {
              const timeSinceUpdate = Date.now() - (st.updated || 0);
              if (timeSinceUpdate > RESYNC_THRESHOLD_MS) {
                  logStatus(`Resync: [${id}] corrected to match Page (Okay)`);
                  st.state = "Okay";
                  st.description = "Okay";
                  st.updated = Date.now();
                  st.freshOkay = true; // V4.5: Resync treated as fresh release (sink to bottom)
              }
          }
      }

      setDataset(li, "until", st.until ?? "");
      setDataset(li, "location", "");

      // Attribute-Based Coloring
      // FIX: Calculate if the timer is expired (excluding Unknown/WS-only timers)
      const isExpired = (st.until || 0) <= nowSeconds() && st.until !== UNKNOWN_UNTIL;

      if ((st.state === "Hospital" || st.state === "Jail") && !isExpired) {
          safeSetAttr(status_DIV, COLOR, "red");
      } else if (st.state === "Traveling" || st.state === "Abroad") {
          safeSetAttr(status_DIV, COLOR, "blue");
      } else {
          // This covers "Okay" AND "Hospital/Jail" where the timer has expired
          safeSetAttr(status_DIV, COLOR, "green");
      }

      switch (st.state) {
        case "Fallen":
        case "Federal": {
            currentSortWeights.set(id, 6);
            safeSetAttr(status_DIV, CONTENT, st.state === "Federal" ? "Federal" : "Fallen");
            safeSetAttr(status_DIV, COLOR, "red");
            safeSetAttr(status_DIV, TRAVELING, "false");
            safeSetAttr(status_DIV, HIGHLIGHT, "false");
            break;
        }

        case "Abroad":
        case "Traveling": {
          safeSetAttr(status_DIV, TRAVELING, "false");
          safeRemoveAttr(li, "data-until");
          safeRemoveAttr(li, "data-location");
          const desc = st.description || "Traveling";

          if (desc.includes("Traveling to ")) {
              currentSortWeights.set(id, 4);
              const content = "► " + desc.split("Traveling to ")[1];
              safeSetAttr(status_DIV, CONTENT, content);
          } else if (desc.includes("In ")) {
              currentSortWeights.set(id, 3);
              const content = desc.split("In ")[1];
              safeSetAttr(status_DIV, CONTENT, content);
          } else if (desc.includes("Returning")) {
              currentSortWeights.set(id, 2);
              const content = "◄ " + desc.split("Returning to Torn from ")[1];
              safeSetAttr(status_DIV, CONTENT, content);
          } else {
              currentSortWeights.set(id, 5);
              safeSetAttr(status_DIV, CONTENT, "Traveling");
          }
          break;
        }

        case "Hospital":
        case "Jail": {
          // Check for Federal Jail (fallback for API updates)
          if ((st.description || "").toLowerCase().includes("federal")) {
              currentSortWeights.set(id, 6);
              safeSetAttr(status_DIV, CONTENT, "Federal");
              safeSetAttr(status_DIV, COLOR, "red");
              safeSetAttr(status_DIV, TRAVELING, "false");
              safeSetAttr(status_DIV, HIGHLIGHT, "false");
              break;
          }

          currentSortWeights.set(id, 1);

          safeSetAttr(status_DIV, TRAVELING, (st.description || "").includes("In a") ? "true" : "false");

          // OPTIMIZATION: Use pre-calculated currentSec
          const remain = Math.max(0, ((st.until >>> 0) - currentSec) | 0);

          // Display text state if time is unknown/zero
          if ((remain <= 0 && st.until === 0) || st.until === UNKNOWN_UNTIL) {
              safeSetAttr(status_DIV, CONTENT, st.state);
              safeSetAttr(status_DIV, HIGHLIGHT, "true");
              if (!HAS_HAS) li.classList.add(HCLASS);
              break;
          }

          if (remain <= 0) {
            safeSetAttr(status_DIV, HIGHLIGHT, "false");
            safeSetAttr(status_DIV, CONTENT, status_DIV.getAttribute(CONTENT) || status_DIV.textContent);
            break;
          }

          const s = remain % 60;
          const m = ((remain / 60) | 0) % 60;
          const h = (remain / 3600) | 0;
          const t = `${pad2(h)}:${pad2(m)}:${pad2(s)}`;

          if (status_DIV.getAttribute(CONTENT) !== t) safeSetAttr(status_DIV, CONTENT, t);

          const isSoon = remain < 300 ? "true" : "false";
          safeSetAttr(status_DIV, HIGHLIGHT, isSoon);

          if (!HAS_HAS && isSoon === "true" && !li.classList.contains(HCLASS)) li.classList.add(HCLASS);
          break;
        }

        default: {
          safeRemoveAttr(status_DIV, CONTENT);
          currentSortWeights.set(id, 0);
          safeSetAttr(status_DIV, TRAVELING, "false");
          safeSetAttr(status_DIV, HIGHLIGHT, "false");
        }
      }
    });

    if (sort_enemies) {
      const lists = get_member_lists();
      for (let i = 0; i < lists.length; i++) {
        let sorted_column = get_sorted_column(lists[i]);
        if (!ever_sorted) sorted_column = { column: "status", order: "asc" };
        if (sorted_column.column !== "status") continue;

        // Safe selector for sorting
        let lis;
        if (document.querySelector(".faction-war")) {
            lis = lists[i].querySelectorAll("li.enemy, li.your");
        } else {
            lis = Array.from(lists[i].children).filter(child => child.tagName === 'LI');
        }

        const arr = Array.from(lis).map(li => {
            // OPTIMIZATION: Read Cached ID from dataset instead of parsing href
            const id = li.dataset.twseoId;

            const st = member_status.get(id)?.status;
            let score = getScore(li, id); // Use Cache

            // V4.5 Sort Logic:
            if (st?.state === "Okay" && st?.freshOkay) {
                score = -1;
            }
            else if (!SORT_OKAY_BY_SCORE) {
                score = 0;
            }

            // Get pre-calculated weight from this frame
            const sortA = currentSortWeights.get(id) ?? 0;

            return {
                li,
                a: sortA,
                until: st?.until ?? 0,
                score: score
            };
        });

        const asc = sorted_column.order === "asc";
        const sorted = arr.slice().sort((L, R) => {
          let left = L, right = R;
          if (!asc) [left, right] = [R, L];

          // Primary Sort: Status Group (Okay=0, Hospital=1, etc.)
          if (left.a !== right.a) return left.a - right.a;

          // Secondary Sort:
          // If both are "Okay" (0), Sort by Score Descending
          if (left.a === 0) {
              return right.score - left.score;
          }

          // Otherwise (Hospital, Traveling), Sort by Time Ascending
          return left.until - right.until;
        }).map(o => o.li);

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

  let tickTimer = null;
  function scheduleTick() {
    clearTimeout(tickTimer);
    tickTimer = setTimeout(() => {
      if (!document.hidden) update_statuses_api();
      scheduleTick();
    }, 1000);
  }
  scheduleTick();

  setTimeout(() => {
    prime_status_placeholders();
    requestAnimationFrame(watch);
  }, 1000);

  window.addEventListener("hashchange", () => {
    onWarGone();
    setTimeout(() => {
      if (document.querySelector(".faction-war") || (DEBUG && document.querySelector("ul.members-list"))) {
          onWarFound();
      }
      scheduleRefreshLists();
    }, 300);
  }, { passive: true });

  window.addEventListener("pagehide", () => {
    observer.disconnect();
    clearTimeout(tickTimer);
    if(socket) socket.close();
  }, { passive: true });

})();