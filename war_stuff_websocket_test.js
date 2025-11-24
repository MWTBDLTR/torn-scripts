// ==UserScript==
// @name         Torn War Stuff Enhanced & Optimized
// @namespace    https://github.com/MWTBDLTR/torn-scripts
// @version      2.1.ws-test
// @description  The ultimate war monitor. INSTANT status updates and sorting on war pages. Pair with my attack links script for lightning strike speed in your next war!
// @author       MrChurch [3654415] + xentac (original twse) + Heasley (websocket idea)
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

  // --- DEBUG STATE ---
  let DEBUG = GM_getValue("twseo_debug_mode", false);

  if (DEBUG) console.log("%c[TWSEO-DEBUG] Script Loaded (v2.1)", "color: #00ff00; font-weight: bold; background: #333;");

  function toggleDebug() {
      DEBUG = !DEBUG;
      GM_setValue("twse_debug_mode", DEBUG);
      alert(`TWSE Debug Mode is now: ${DEBUG ? "ON" : "OFF"}.\nReloading page...`);
      location.reload();
  }

  function log(...args) {
      if (DEBUG) console.log("%c[TWSEO-DEBUG]", "color: #ffaa00; font-weight: bold;", ...args);
  }

  // --- COMPATIBILITY ---
  if (document.querySelector("#FFScouterV2DisableWarMonitor")) return;
  const ffScouterV2DisableWarMonitor = document.createElement("div");
  ffScouterV2DisableWarMonitor.id = "FFScouterV2DisableWarMonitor";
  ffScouterV2DisableWarMonitor.style.display = "none";
  document.documentElement.appendChild(ffScouterV2DisableWarMonitor);

  // --- API KEY MANAGEMENT ---
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
      running = true;
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

  try {
    GM_registerMenuCommand("Set API Key", () => promptSetKey());
    GM_registerMenuCommand("Clear API Key", () => clearKey());
    GM_registerMenuCommand(`Toggle Debug Mode (${DEBUG ? "ON" : "OFF"})`, () => toggleDebug());
  } catch {}

  // --- STYLES ---
  const CONTENT   = "data-twse-content";
  const TRAVELING = "data-twse-traveling";
  const HIGHLIGHT = "data-twse-highlight";
  const HCLASS    = "twse-highlight";
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

    @keyframes twse-flash {
        0% { box-shadow: inset 0 0 0px gold; }
        50% { box-shadow: inset 0 0 10px gold; }
        100% { box-shadow: inset 0 0 0px gold; }
    }
    .twse-ws-updated { animation: twse-flash 1s ease-out; }

    #twse-debug-indicator {
        position: fixed; top: 0; right: 0; background: orange; color: black;
        font-weight: bold; padding: 2px 5px; z-index: 999999; font-size: 10px;
        pointer-events: none; opacity: 0.8;
    }
  `);

  if (DEBUG) {
      const debugInd = document.createElement("div");
      debugInd.id = "twse-debug-indicator";
      debugInd.textContent = "TWSE DEBUG";
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

  // Use clean URL (Verified working)
  const WS_URL = "wss://ws-centrifugo.torn.com/connection/websocket";

  function getWebSocketToken() {
      const el = document.getElementById('websocketConnectionData');
      if (!el) {
          log("CRITICAL: Could not find #websocketConnectionData element in DOM.");
          return null;
      }
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
      if (!token) {
          log("Cannot Connect: Token not found in DOM.");
          return;
      }

      log(`Initializing WebSocket connection to ${WS_URL}...`);
      socket = new WebSocket(WS_URL);

      socket.onopen = function() {
          // v2.0 Auth Format (Verified working)
          const authMsg = {
              "connect": {
                  "token": token,
                  "name": "js"
              },
              "id": msgId++
          };
          log("WS Socket Open. Sending Auth...");
          socket.send(JSON.stringify(authMsg));
      };

      socket.onmessage = function(event) {
          try {
              if (event.data === '{}') {
                  socket.send('{}');
                  return;
              }

              const data = JSON.parse(event.data);

              // 1. Handle Connect Response
              if (data.connect) {
                  log("WS Authenticated Successfully! (Client ID: " + data.connect.client + ")");
                  subscribeToFactions(get_faction_ids());
                  return;
              }

              // 2. Handle Push Updates
              if (data.push && data.push.pub && data.push.pub.data) {
                  const msg = data.push.pub.data.message;
                  const actions = msg?.namespaces?.users?.actions;

                  if (actions?.updateIcons) {
                      // v2.1 FIX: Handle single-user structure correctly
                      const update = actions.updateIcons;

                      // Case A: Single User Update (Format: { userId: 123, icons: "..." })
                      if (update.userId && update.icons) {
                          // Wrap in a map-like structure for processing
                          const singleMap = {};
                          singleMap[update.userId] = update.icons;
                          processWebSocketIcons(singleMap);
                      }
                      // Case B: Bulk/Map Update (Format: { "123": "...", "456": "..." })
                      else {
                          processWebSocketIcons(update);
                      }
                  }
              }
          } catch (e) {
              console.error("[TWSEO] WS Message Error:", e);
          }
      };

      socket.onclose = function(event) {
          log(`WS Closed. Code: ${event.code}, Reason: ${event.reason || "None"}. Reconnecting in 5s...`);
          subscribedFactions.clear();
          setTimeout(createWebSocketConnection, 5000);
      };

      socket.onerror = function(err) {
          log("WS Error Detected");
      }
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

      // v2.1: iconsObj should now be guaranteed to be a Map { userId: htmlString }
      for (const [userId, iconHtml] of Object.entries(iconsObj)) {
          // Sanity check: ensure iconHtml is actually a string (prevent parsing issues)
          if (typeof iconHtml !== 'string') continue;

          const uidStr = String(userId);
          const currentData = member_status.get(uidStr) || { status: {} };

          let newState = "Okay";
          let newDesc = "Okay";

          // Basic parsing of the HTML blob
          if (iconHtml.includes('class="hospital"') || iconHtml.includes("icon15")) {
              newState = "Hospital";
              newDesc = "In Hospital (WS)";
          } else if (iconHtml.includes('class="jail"') || iconHtml.includes("icon16")) {
              newState = "Jail";
              newDesc = "In Jail (WS)";
          } else if (iconHtml.includes('class="traveling"') || iconHtml.includes('class="abroad"') || iconHtml.includes("icon71")) {
              newState = "Traveling";
              newDesc = "Traveling (WS)";
          }

          // Check if state changed (or if description changed from generic WS to specific)
          if (currentData.status.state !== newState) {
              log(`Status Change: [${uidStr}]: ${currentData.status.state} -> ${newState}`);

              currentData.status.state = newState;
              currentData.status.description = newDesc;

              // Reset timer if entering hosp/jail (wait for API to fill real time)
              if (newState === 'Hospital' || newState === 'Jail') {
                  currentData.status.until = (Date.now() / 1000) + 300;
              } else {
                  currentData.status.until = 0;
              }

              member_status.set(uidStr, currentData);
              triggerFlash(uidStr);
          } else {
              // Even if state is same, maybe icons changed? Flash to confirm receipt.
              if(DEBUG) triggerFlash(uidStr);
          }
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
  const nowSeconds = () => Math.trunc((window.getCurrentTimestamp?.() ?? Date.now()) / 1000);

  function nativeIsOK(statusDiv) {
    if (!statusDiv) return false;
    if (statusDiv.classList.contains('ok')) return true;
    const txt = statusDiv.textContent.trim().toLowerCase();
    return txt === 'ok' || txt.startsWith('okay');
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

    if (DEBUG) {
        warRoot = document.querySelector(".faction-war") || document;
        log("War/Faction Page Found. Starting Listeners...");
    } else {
        warRoot = document.querySelector(".faction-war") || document;
    }

    extract_all_member_lis();
    prime_status_placeholders();

    if (USE_WEBSOCKETS) {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            createWebSocketConnection();
        } else {
            subscribeToFactions(get_faction_ids());
        }
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

    if (DEBUG) {
        memberListsCache = Array.from(document.querySelectorAll("ul.members-list"));
        if(memberListsCache.length > 0) warRoot = document;
        return;
    }

    warRoot = null;
    memberListsCache = [];
  }

  function get_member_lists() {
    if (warRoot && warRoot !== document && !warRoot.isConnected) onWarGone();
    if (memberListsCache.length === 0) refresh_member_lists_cache();
    return memberListsCache;
  }

  let lastKnownFactionIds = "";
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

    if (ids.size === 0 && DEBUG) {
        const urlParams = new URLSearchParams(window.location.search);
        const urlId = urlParams.get("ID");
        if (urlId) ids.add(urlId);
    }

    const idStr = [...ids].sort().join(",");
    if(DEBUG && idStr !== lastKnownFactionIds && idStr.length > 0) {
        log("Identified Faction IDs:", [...ids]);
        lastKnownFactionIds = idStr;
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
    const selector = DEBUG ? "li" : "li.enemy, li.your";
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
      if (id) member_lis.set(id, li);
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
        if (node?.classList?.contains?.("faction-war")) {
          onWarFound();
          scheduleRefreshLists();
          return;
        }
        if (DEBUG && node?.nodeType === 1) {
            onWarFound();
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
      if (DEBUG || document.querySelector(".faction-war")) {
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
    if (!found_war && !DEBUG) return;
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
        `https://api.torn.com/faction/${faction_id}?selections=basic&key=${apiKey}&comment=TWSEO`,
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
  const TIME_BETWEEN_FRAMES = 500;

  function watch() {
    if (found_war && warRoot && warRoot !== document && !warRoot.isConnected) onWarGone();
    if (!found_war && !DEBUG) return requestAnimationFrame(watch);
    if (document.hidden) return requestAnimationFrame(watch);

    const now = performance.now();
    if (now - last_frame < TIME_BETWEEN_FRAMES) return requestAnimationFrame(watch);
    last_frame = now;

    member_lis.forEach((li, id) => {
      const state = member_status.get(id);
      const status_DIV = getStatusDiv(li);
      if (!status_DIV) return;

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
          const desc = st.description || "Traveling";

          if (desc.includes("Traveling to ")) {
              const content = "► " + desc.split("Traveling to ")[1];
              safeSetAttr(status_DIV, CONTENT, content);
          } else if (desc.includes("Returning")) {
              const content = "◄ " + desc.split("Returning to Torn from ")[1];
              safeSetAttr(status_DIV, CONTENT, content);
          } else {
              safeSetAttr(status_DIV, CONTENT, "Traveling");
          }
          break;
        }

        case "Hospital":
        case "Jail": {
          setDataset(li, "sortA", 1);
          safeSetAttr(status_DIV, TRAVELING, (st.description || "").includes("In a") ? "true" : "false");

          const remain = Math.max(0, ((st.until >>> 0) - nowSeconds()) | 0);

          if (remain <= 0 && st.until === 0) {
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
          setDataset(li, "sortA", 0);
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

        const selector = DEBUG ? "li" : "li.enemy, li.your";
        const lis = lists[i].querySelectorAll(selector);

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