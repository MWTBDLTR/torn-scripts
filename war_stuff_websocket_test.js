// ==UserScript==
// @name         Torn War Stuff Enhanced & Optimized
// @namespace    https://github.com/MWTBDLTR/torn-scripts
// @version      5.4.0
// @description  The ultimate rw monitor. Immediate status updates, hospital timers, and player sorting.
// @author       MrChurch [3654415] + xentac
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
  const API_STALE_PROTECTION_MS = 15000;
  const UNKNOWN_UNTIL = 4294967295;
  const TIME_BETWEEN_FRAMES = 250;

  // --- STATE MANAGEMENT ---
  let DEBUG = GM_getValue("twseo_debug_mode", false);
  let LOG_STATUS = GM_getValue("twseo_log_status", false);
  let SORT_OKAY_BY_SCORE = GM_getValue("twseo_sort_okay_score", false);

  console.log(
    `%c[TWSEO] Script Loaded (v5.4.0) | Debug: ${DEBUG}`,
    "color: #00ff00; font-weight: bold; background: #333; padding: 2px 5px;"
  );

  function toggleDebug() {
    DEBUG = !DEBUG;
    GM_setValue("twseo_debug_mode", DEBUG);
    alert(`Debug Mode: ${DEBUG ? "ON" : "OFF"}. Reloading...`);
    location.reload();
  }

  function toggleStatusLogs() {
    LOG_STATUS = !LOG_STATUS;
    GM_setValue("twseo_log_status", LOG_STATUS);
    alert(`Status Logs: ${LOG_STATUS ? "ON" : "OFF"}.`);
  }

  function toggleOkayScoreSort() {
    SORT_OKAY_BY_SCORE = !SORT_OKAY_BY_SCORE;
    GM_setValue("twseo_sort_okay_score", SORT_OKAY_BY_SCORE);
    alert(`Sort Okay by Score: ${SORT_OKAY_BY_SCORE ? "ON" : "OFF"}. Reloading...`);
    location.reload();
  }

  function log(...args) {
    if (DEBUG) console.log("%c[TWSEO-DEBUG]", "color: #ffaa00; font-weight: bold;", ...args);
  }

  function logStatus(msg) {
    if (LOG_STATUS) console.log(`%c[TWSEO] ${msg}`, "color: #00ccff; font-weight: bold;");
  }

  // --- HELPER: ABBREVIATIONS & COLOR ---
  const COUNTRY_MAP = {
    "South Africa": "SA", "Cayman Islands": "CI", "United Kingdom": "UK",
    "Argentina": "Arg", "Switzerland": "Switz"
  };
  const COUNTRY_RX = new RegExp(Object.keys(COUNTRY_MAP).join("|"), "g");
  const abbreviatePlaces = (s) => s?.replace(COUNTRY_RX, (m) => COUNTRY_MAP[m]) ?? "";

  function getStateColor(state) {
    if (["Hospital", "Jail", "Federal", "Fallen"].includes(state)) return "red";
    if (["Traveling", "Abroad"].includes(state)) return "blue";
    return "green";
  }

  // --- HELPER: SCORE/LEVEL SCRAPER (With Cache) ---
  const scoreCache = new Map();
  function getScore(li, id) {
    if (scoreCache.has(id)) return scoreCache.get(id);
    let val = 0;
    const pointsEl = li.querySelector(".points");
    const lvlEl = li.querySelector(".level");
    const txt = pointsEl ? pointsEl.textContent : (lvlEl ? lvlEl.textContent : "");
    val = parseInt(txt.replace(/\D/g, ""), 10);
    if (!isNaN(val) && val > 0) scoreCache.set(id, val);
    return val || 0;
  }

  // --- COMPATIBILITY ---
  if (!document.querySelector("#FFScouterV2DisableWarMonitor")) {
    const el = document.createElement("div");
    el.id = "FFScouterV2DisableWarMonitor";
    el.style.display = "none";
    document.documentElement.appendChild(el);
    window.dispatchEvent(new Event("FFScouterV2DisableWarMonitor"));
  }

  // --- API KEY MANAGEMENT ---
  const LS_KEY = "twseo_merged_apikey";
  let apiKey = localStorage.getItem(LS_KEY) ?? "###PDA-APIKEY###";
  const hasValidKey = () => typeof apiKey === 'string' && apiKey.length === 16 && !apiKey.includes("PDA-APIKEY");

  function promptSetKey() {
    const userInput = prompt("Enter PUBLIC Torn API key (16 chars):", hasValidKey() ? apiKey : "");
    if (userInput && userInput.trim().length === 16) {
      apiKey = userInput.trim();
      localStorage.setItem(LS_KEY, apiKey);
      alert("API key saved.");
      running = true;
      backoffMs = 0;
    }
  }

  try {
    GM_registerMenuCommand("Set API Key", promptSetKey);
    GM_registerMenuCommand("Clear API Key", () => { localStorage.removeItem(LS_KEY); apiKey = "###PDA-APIKEY###"; });
    GM_registerMenuCommand(`Toggle Sort Okay by Score`, toggleOkayScoreSort);
    GM_registerMenuCommand(`Toggle Status Logs`, toggleStatusLogs);
    GM_registerMenuCommand(`Toggle Debug Mode`, toggleDebug);
  } catch { }

  // --- STYLES ---
  const CONTENT = "data-twseo-content", TRAVELING = "data-twseo-traveling", HIGHLIGHT = "data-twseo-highlight", COLOR = "data-twseo-color", HCLASS = "twseo-highlight";
  const HAS_HAS = CSS.supports?.("selector(:has(*))") ?? false;

  GM_addStyle(`
    .members-list li.${HCLASS} { background-color: #afa5 !important; }
    .members-list li:has(div.status[${HIGHLIGHT}="true"]) { background-color: #afa5 !important; }
    .members-list div.status { position: relative !important; }
    .members-list div.status[${CONTENT}] { color: transparent !important; }
    .members-list div.status[${CONTENT}]::after {
      content: attr(${CONTENT}); position: absolute; top: 0; right: 10px; width: auto; max-width: 90px; height: 100%;
      background: inherit; display: flex; justify-content: flex-end; align-items: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .members-list div.status[${COLOR}="green"]::after { color: var(--user-status-green-color) !important; }
    .members-list div.status[${COLOR}="red"]::after   { color: var(--user-status-red-color) !important; }
    .members-list div.status[${COLOR}="blue"]::after  { color: var(--user-status-blue-color) !important; }
    .members-list div.status[${TRAVELING}="true"]::after { color: #F287FF !important; }
    @keyframes twseo-flash { 0% { box-shadow: inset 0 0 0px gold; } 50% { box-shadow: inset 0 0 10px gold; } 100% { box-shadow: inset 0 0 0px gold; } }
    .twseo-ws-updated { animation: twseo-flash 1s ease-out; }
    #twseo-debug-indicator { position: fixed; top: 0; right: 0; background: orange; color: black; font-weight: bold; padding: 2px 5px; z-index: 999999; font-size: 10px; pointer-events: none; opacity: 0.8; }
  `);

  if (DEBUG) {
    const d = document.createElement("div"); d.id = "twseo-debug-indicator"; d.textContent = "TWSEO DEBUG"; document.body.appendChild(d);
  }

  // --- STATE ---
  const sort_enemies = true;
  let ever_sorted = false, running = true, found_war = false, warRoot = null;
  const member_status = new Map(), member_lis = new Map();
  let memberListsCache = [];

  // --- WEBSOCKET LOGIC ---
  let socket, subscribedFactions = new Set(), msgId = 1, wsInitTimeout = null;
  const WS_URL = "wss://ws-centrifugo.torn.com/connection/websocket";

  function getWebSocketToken() {
    try {
      return JSON.parse(document.getElementById('websocketConnectionData').innerText).token;
    } catch { return null; }
  }

  function createWebSocketConnection() {
    if (!USE_WEBSOCKETS) return;
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;

    const token = getWebSocketToken();
    if (!token) return;

    log("Initializing WebSocket...");
    socket = new WebSocket(WS_URL);

    socket.onopen = () => {
      socket.send(JSON.stringify({ "connect": { "token": token, "name": "js" }, "id": msgId++ }));
    };

    socket.onmessage = (event) => {
      // FIX: Handle batched messages (NDJSON) by splitting on newlines
      const messages = event.data.split('\n');

      messages.forEach(rawLine => {
        const line = rawLine.trim();
        if (!line) return;

        try {
          if (line === '{}') { socket.send('{}'); return; }
          const data = JSON.parse(line);

          if (data.connect) {
            log("WS Authenticated.");
            subscribeToFactions(get_faction_ids());
            return;
          }

          if (data.push?.pub?.data?.message?.namespaces?.users?.actions) {
            const actions = data.push.pub.data.message.namespaces.users.actions;
            if (actions.updateStatus) {
              processWebSocketStatus(actions.updateStatus);
            }
          }
        } catch (e) {
          if (DEBUG) console.error("[TWSEO] WS Parse Error:", e);
        }
      });
    };

    socket.onclose = () => {
      log("WS Closed. Reconnecting in 5s...");
      subscribedFactions.clear();
      setTimeout(createWebSocketConnection, 5000);
    };
  }

  function subscribeToFactions(factionIds) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    factionIds.forEach(fid => {
      if (!subscribedFactions.has(fid)) {
        log(`Subscribing: faction-users-${fid}`);
        socket.send(JSON.stringify({ "subscribe": { "channel": `faction-users-${fid}` }, "id": msgId++ }));
        subscribedFactions.add(fid);
      }
    });
  }

  function processWebSocketStatus(updateData) {
    const updates = Array.isArray(updateData) ? updateData : [updateData];
    let needsRender = false;

    updates.forEach(u => {
      if (!u.userId || !u.status) return;

      const uidStr = String(u.userId);
      const s = u.status;
      const currentData = member_status.get(uidStr) || { status: {} };

      const newState = s.text || "Okay";
      let newUntil = 0;
      if (!s.okay && s.updateAt) newUntil = s.updateAt;

      const newDesc = newState + " (WS)";
      const oldUntil = currentData.status.until || 0;
      const timerDiff = Math.abs(newUntil - oldUntil);

      if (currentData.status.state !== newState || timerDiff > 5) {
        logStatus(`Status Change: [${uidStr}] ${newState} -> Ends: ${newUntil}`);

        currentData.status.state = newState;
        currentData.status.description = newDesc;
        currentData.status.until = newUntil;

        // --- FIX: Fallback to inferred color if WS color is missing/null ---
        currentData.status.color = s.color || getStateColor(newState);
        // ------------------------------------------------------------------

        currentData.status.updated = Date.now();
        currentData.status.freshOkay = !!s.okay;

        member_status.set(uidStr, currentData);
        triggerFlash(uidStr);
        needsRender = true;
      }
    });

    if (needsRender) {
      last_frame = 0;
      requestAnimationFrame(watch);
    }
  }

  function triggerFlash(userId) {
    const li = member_lis.get(String(userId));
    if (li) {
      li.classList.remove('twseo-ws-updated');
      void li.offsetWidth;
      li.classList.add('twseo-ws-updated');
    }
  }

  // --- CACHING & HELPERS ---
  const liStatusDiv = new WeakMap();
  function getStatusDiv(li) {
    let d = liStatusDiv.get(li);
    if (!d || !d.isConnected) { d = li.querySelector("div.status"); if (d) liStatusDiv.set(li, d); }
    return d;
  }
  const setDataset = (el, key, value) => { if (el && el.dataset[key] !== String(value || "")) el.dataset[key] = String(value || ""); };
  const safeSetAttr = (el, name, value) => { if (el && el.getAttribute(name) !== String(value)) el.setAttribute(name, String(value)); };
  const safeRemoveAttr = (el, name) => { if (el?.hasAttribute(name)) el.removeAttribute(name); };
  const pad2 = (n) => (n < 10 ? "0" : "") + n;
  const nowSeconds = () => (Date.now() / 1000) | 0;

  function nativeIsOK(statusDiv) { return statusDiv.classList.contains('ok'); }

  // --- CORE LOGIC ---
  function onWarGone() {
    found_war = false; warRoot = null; member_lis.clear(); memberListsCache = [];
    window.dispatchEvent(new Event("twseo-war-gone"));
  }

  function onWarFound() {
    if (found_war) return;
    found_war = true;
    const warWrapper = document.querySelector(".faction-war");
    warRoot = warWrapper || (document.querySelector("ul.members-list") ? document : null);
    if (!warRoot) { found_war = false; return; }

    log("Target List Found.");
    extract_all_member_lis();
    prime_status_placeholders();

    if (USE_WEBSOCKETS) {
      if (wsInitTimeout) clearTimeout(wsInitTimeout);
      wsInitTimeout = setTimeout(() => {
        if (!socket || socket.readyState !== WebSocket.OPEN) createWebSocketConnection();
        else subscribeToFactions(get_faction_ids());
      }, STARTUP_DELAY_MS);
    }
    window.dispatchEvent(new Event("twseo-war-found"));
  }

  function refresh_member_lists_cache() {
    const warEl = document.querySelector(".faction-war");
    if (warEl) { warRoot = warEl; memberListsCache = Array.from(warEl.querySelectorAll("ul.members-list")); return; }
    memberListsCache = Array.from(document.querySelectorAll("ul.members-list"));
    warRoot = memberListsCache.length ? document : null;
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
        const u = new URL(a.href, location.origin);
        const id = u.searchParams.get("ID") || (a.href.split("ID=")[1] || "").split("&")[0];
        if (id) ids.add(id);
      }
    });
    if (ids.size === 0) { const id = new URLSearchParams(window.location.search).get("ID"); if (id) ids.add(id); }
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
    member_lis.clear(); refresh_member_lists_cache();
    const selector = document.querySelector(".faction-war") ? "li.enemy, li.your" : "li";
    get_member_lists().forEach(ul => {
      ul.querySelectorAll(selector).forEach(li => {
        const a = li.querySelector(`a[href^="/profiles.php"]`);
        if (!a) return;
        const u = new URL(a.href, location.origin);
        const id = u.searchParams.get("XID") || u.searchParams.get("ID");
        if (id) { member_lis.set(id, li); li.dataset.twseoId = id; }
      });
    });
  }

  function prime_status_placeholders() {
    (warRoot || document).querySelectorAll(".members-list div.status").forEach(el => {
      if (!el.hasAttribute(CONTENT)) el.setAttribute(CONTENT, el.textContent);
    });
  }

  // --- OBSERVER ---
  let refreshPending = false;
  function scheduleRefreshLists() {
    if (refreshPending) return;
    refreshPending = true;
    setTimeout(() => {
      refreshPending = false; refresh_member_lists_cache();
      if (USE_WEBSOCKETS && socket?.readyState === WebSocket.OPEN) subscribeToFactions(get_faction_ids());
    }, 0);
  }

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node?.classList?.contains?.("faction-war") || (node?.nodeType === 1 && node.matches?.("ul.members-list"))) {
          onWarFound(); scheduleRefreshLists(); return;
        }
      }
      for (const node of m.removedNodes) { if (node?.matches?.(".faction-war")) onWarGone(); }
    }
  });
  setTimeout(() => { if (document.querySelector("ul.members-list")) onWarFound(); }, 800);
  observer.observe(document.body, { subtree: true, childList: true });

  // --- API LOOP ---
  let last_request_ts = 0, backoffUntil = 0, backoffMs = 0;
  const MIN_TIME_SINCE_LAST_REQUEST = 9000, BACKOFF_BASE = 2000, BACKOFF_MAX = 120000;

  async function update_statuses_api() {
    if (!running || !hasValidKey() || document.hidden || !found_war) return;
    if (Date.now() < backoffUntil) return;
    const faction_ids = get_faction_ids();
    if (!faction_ids.length) return;
    if (Date.now() - last_request_ts < MIN_TIME_SINCE_LAST_REQUEST + (Math.random() * 2000 - 1000)) return;

    for (const id of faction_ids) {
      if (!(await update_status_single(id))) break;
      await new Promise(r => setTimeout(r, 150 + Math.random() * 120));
    }
    last_request_ts = Date.now();
  }

  async function update_status_single(faction_id) {
    try {
      const r = await fetch(`https://api.torn.com/faction/${faction_id}?selections=basic&key=${apiKey}&comment=TWSEO-Merged`, { cache: 'no-store' });
      const status = await r.json();
      if (status.error) {
        if ([5, 8, 9].includes(status.error.code)) { backoffMs = Math.min(BACKOFF_MAX, (backoffMs || BACKOFF_BASE) * 2); backoffUntil = Date.now() + backoffMs; return false; }
        return false;
      }
      if (!status.members) return true;

      for (const [k, v] of Object.entries(status.members)) {
        if (v.status.description) v.status.description = abbreviatePlaces(v.status.description);

        // --- STALE DATA PROTECTION (15s) ---
        const current = member_status.get(k);
        if (current) {
          const curState = current.status.state;
          const apiState = v.status.state;
          const isWs = (current.status.description || "").includes("(WS)");
          const isFresh = (Date.now() - (current.status.updated || 0) < API_STALE_PROTECTION_MS);

          if (isWs && isFresh) {
            // Protect Active from Stale API "Okay"
            if (["Traveling", "Hospital", "Jail"].includes(curState) && apiState === "Okay") {
              if (DEBUG) console.log(`[TWSEO] Protecting [${k}] from stale API 'Okay'.`);
              continue;
            }
            // Protect Hospital from Stale API "Traveling"
            if (["Hospital", "Jail"].includes(curState) && ["Traveling", "Abroad"].includes(apiState)) {
              if (DEBUG) console.log(`[TWSEO] Protecting [${k}] from stale API '${apiState}'.`);
              continue;
            }
          }
        }
        // --- INFER COLOR ON INPUT ---
        v.status.color = getStateColor(v.status.state);
        // ----------------------------
        v.status.updated = Date.now();
        member_status.set(k, v);
      }
      return true;
    } catch { return false; }
  }

  // --- RENDER LOOP ---
  let last_frame = 0;
  function watch() {
    if (!found_war) return requestAnimationFrame(watch);
    if (document.hidden) return requestAnimationFrame(watch);
    const now = performance.now();
    if (now - last_frame < TIME_BETWEEN_FRAMES) return requestAnimationFrame(watch);
    last_frame = now;

    const currentSec = nowSeconds();
    const currentSortWeights = new Map();

    member_lis.forEach((li, id) => {
      const state = member_status.get(id);
      const status_DIV = getStatusDiv(li);
      if (!status_DIV) return;
      if (!HAS_HAS && li.classList.contains(HCLASS)) li.classList.remove(HCLASS);

      if (!state || !running) {
        safeSetAttr(status_DIV, CONTENT, status_DIV.getAttribute(CONTENT) || status_DIV.textContent);
        currentSortWeights.set(id, 0);
        return;
      }

      const st = state.status || {};

      // Self-Healing
      if ((st.state === "Hospital" || st.state === "Jail") && nativeIsOK(status_DIV)) {
        const isWs = (st.description || "").includes("(WS)");
        const hasFutureTime = (st.until || 0) > currentSec;
        if (!isWs && !hasFutureTime && (Date.now() - (st.updated || 0) > RESYNC_THRESHOLD_MS)) {
          st.state = "Okay"; st.description = "Okay"; st.updated = Date.now(); st.freshOkay = true;
        }
      }

      setDataset(li, "until", st.until ?? "");
      const isExpired = (st.until || 0) <= currentSec && st.until !== UNKNOWN_UNTIL;

      // --- COLOR LOGIC ---
      let useColor = st.color || "green";
      if (["Hospital", "Jail"].includes(st.state) && isExpired) useColor = "green";
      safeSetAttr(status_DIV, COLOR, useColor);
      // ------------------

      switch (st.state) {
        case "Fallen": case "Federal":
          currentSortWeights.set(id, 6);
          safeSetAttr(status_DIV, CONTENT, st.state === "Federal" ? "Federal" : "Fallen");
          safeSetAttr(status_DIV, COLOR, "red");
          safeSetAttr(status_DIV, TRAVELING, "false");
          safeSetAttr(status_DIV, HIGHLIGHT, "false");
          break;

        case "Abroad": case "Traveling":
          safeSetAttr(status_DIV, TRAVELING, "false");
          const desc = st.description || "Traveling";
          if (desc.includes("Traveling to ")) {
            currentSortWeights.set(id, 4);
            safeSetAttr(status_DIV, CONTENT, "► " + desc.split("Traveling to ")[1]);
          } else if (desc.includes("In ")) {
            currentSortWeights.set(id, 3);
            safeSetAttr(status_DIV, CONTENT, desc.split("In ")[1]);
          } else if (desc.includes("Returning")) {
            currentSortWeights.set(id, 2);
            safeSetAttr(status_DIV, CONTENT, "◄ " + desc.split("Returning to Torn from ")[1]);
          } else {
            currentSortWeights.set(id, 5);
            safeSetAttr(status_DIV, CONTENT, "Traveling");
          }
          break;

        case "Hospital": case "Jail":
          if ((st.description || "").toLowerCase().includes("federal")) {
            currentSortWeights.set(id, 6); safeSetAttr(status_DIV, CONTENT, "Federal"); safeSetAttr(status_DIV, COLOR, "red"); break;
          }
          currentSortWeights.set(id, 1);
          safeSetAttr(status_DIV, TRAVELING, (st.description || "").includes("In a") ? "true" : "false");

          const remain = Math.max(0, ((st.until >>> 0) - currentSec) | 0);
          if (remain <= 0 && st.until === 0) {
            safeSetAttr(status_DIV, CONTENT, st.state); safeSetAttr(status_DIV, HIGHLIGHT, "true"); if (!HAS_HAS) li.classList.add(HCLASS);
            break;
          }
          if (remain <= 0) {
            safeSetAttr(status_DIV, HIGHLIGHT, "false"); safeSetAttr(status_DIV, CONTENT, status_DIV.getAttribute(CONTENT) || status_DIV.textContent);
            break;
          }
          const t = `${pad2((remain / 3600) | 0)}:${pad2(((remain / 60) | 0) % 60)}:${pad2(remain % 60)}`;
          if (status_DIV.getAttribute(CONTENT) !== t) safeSetAttr(status_DIV, CONTENT, t);
          const isSoon = remain < 300 ? "true" : "false";
          safeSetAttr(status_DIV, HIGHLIGHT, isSoon);
          if (!HAS_HAS && isSoon === "true" && !li.classList.contains(HCLASS)) li.classList.add(HCLASS);
          break;

        default:
          safeRemoveAttr(status_DIV, CONTENT); currentSortWeights.set(id, 0);
          safeSetAttr(status_DIV, TRAVELING, "false"); safeSetAttr(status_DIV, HIGHLIGHT, "false");
      }
    });

    if (sort_enemies) {
      const lists = get_member_lists();
      for (let i = 0; i < lists.length; i++) {
        let sorted_column = get_sorted_column(lists[i]);
        if (!ever_sorted) sorted_column = { column: "status", order: "asc" };
        if (sorted_column.column !== "status") continue;

        let lis;
        if (document.querySelector(".faction-war")) lis = lists[i].querySelectorAll("li.enemy, li.your");
        else lis = Array.from(lists[i].children).filter(child => child.tagName === 'LI');

        const arr = Array.from(lis).map(li => {
          const id = li.dataset.twseoId;
          const st = member_status.get(id)?.status;
          let score = getScore(li, id);
          if (st?.state === "Okay" && st?.freshOkay) score = -1;
          else if (!SORT_OKAY_BY_SCORE) score = 0;
          return { li, a: currentSortWeights.get(id) ?? 0, until: st?.until ?? 0, score };
        });

        const asc = sorted_column.order === "asc";
        const sorted = arr.sort((L, R) => {
          let left = L, right = R;
          if (!asc) [left, right] = [R, L];
          if (left.a !== right.a) return left.a - right.a;
          if (left.a === 0) return right.score - left.score;
          return left.until - right.until;
        }).map(o => o.li);

        let isSame = true;
        for (let j = 0; j < sorted.length; j++) if (lis[j] !== sorted[j]) { isSame = false; break; }
        if (!isSame) {
          const ul = lists[i]; const prev = ul.style.display; ul.style.display = "none";
          const frag = document.createDocumentFragment(); sorted.forEach(l => frag.appendChild(l));
          ul.appendChild(frag); ul.style.display = prev;
        }
      }
    }
    requestAnimationFrame(watch);
  }

  let tickTimer = null;
  function scheduleTick() {
    clearTimeout(tickTimer);
    tickTimer = setTimeout(() => { if (!document.hidden) update_statuses_api(); scheduleTick(); }, 1000);
  }
  scheduleTick();

  setTimeout(() => { prime_status_placeholders(); requestAnimationFrame(watch); }, 1000);
  window.addEventListener("hashchange", () => { onWarGone(); setTimeout(() => { if (document.querySelector(".faction-war")) onWarFound(); scheduleRefreshLists(); }, 300); }, { passive: true });
  window.addEventListener("pagehide", () => { observer.disconnect(); clearTimeout(tickTimer); socket?.close(); }, { passive: true });

})();