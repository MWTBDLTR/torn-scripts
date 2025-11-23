// ==UserScript==
// @name         Torn War Stuff Enhanced & Optimized
// @namespace    https://github.com/MWTBDLTR/torn-scripts
// @version      1.0.0
// @description  The ultimate war monitor. INSTANT status updates and the API for detailed timers.
// @author       MrChurch [3654415] + xentac (original TWS) + Heasley (websocket idea from walla walla)
// @license      MIT
// @match        https://www.torn.com/factions.php*
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @connect      api.torn.com
// @connect      ws-centrifugo.torn.com
// ==/UserScript==

(async function () {
  'use strict';

  // --- CONFIGURATION ---
  const USE_WEBSOCKETS = true;

  // de-dupe / play nice with FFScouter
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
    /* Visual indicator for WebSocket updates (optional debugging style) */
    .twse-ws-updated { box-shadow: inset 0 0 5px gold; }
  `);

  // --- STATE ---
  const sort_enemies = true;
  let ever_sorted = false;
  let running = true;
  let found_war = false;
  let warRoot = null;

  // member_status map stores the latest known state for a user
  // merge API data and WebSocket data into this single source of "truth"
  const member_status = new Map(); // userId -> Object { status: { description, state, until, color } }
  const member_lis = new Map(); // userId -> <li>
  let memberListsCache = [];

  // --- WEBSOCKET LOGIC ---
  let socket;
  let subscribedFactions = new Set();

  function getWebSocketToken() {
      const el = document.getElementById('websocketConnectionData');
      if (!el) return null;
      try {
          return JSON.parse(el.innerText).token;
      } catch (e) {
          console.error("[TWSEO] Error parsing WS token:", e);
          return null;
      }
  }

  function createWebSocketConnection() {
      if (!USE_WEBSOCKETS) return;
      if (socket && socket.readyState === WebSocket.OPEN) return;

      console.log("[TWSEO] Connecting to WebSocket...");
      socket = new WebSocket("wss://ws-centrifugo.torn.com/connection/websocket");

      socket.onopen = function() {
          console.log("[TWSEO] WS Connected.");
          const token = getWebSocketToken();
          if (!token) return;
          
          // authenticate
          const authMsg = {
              "params": { "token": token },
              "id": 1
          };
          socket.send(JSON.stringify(authMsg));
      };

      socket.onmessage = function(event) {
          try {
              const data = JSON.parse(event.data);

              // handle authentication response (ID: 1)
              if (data.id === 1 && data.result) {
                  // after auth, subscribe to all currently visible factions
                  subscribeToFactions(get_faction_ids());
              }

              // subscription success (ID: 2)
              // handle actual updates
              // The channel format is usually 'faction-users-{ID}'
              if (data?.result?.channel && data.result.channel.startsWith('faction-users-')) {
                  const payload = data?.data?.data?.message?.namespaces?.users?.actions;
                  
                  // handle icon updates (Hospital/Jail/Okay)
                  if (payload?.updateIcons) {
                      processWebSocketIcons(payload.updateIcons.icons);
                  }
              }
          } catch (e) {
              console.error("[TWSEO] WS Message Error:", e);
          }
      };

      socket.onclose = function(event) {
          console.log("[TWSEO] WS Closed. Reconnecting in 5s...");
          subscribedFactions.clear();
          setTimeout(createWebSocketConnection, 5000);
      };
  }

  function subscribeToFactions(factionIds) {
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      
      factionIds.forEach(fid => {
          if (!subscribedFactions.has(fid)) {
              console.log(`[TWSEO] Subscribing to WS channel: faction-users-${fid}`);
              const msg = {
                  "method": 1,
                  "params": { "channel": `faction-users-${fid}` },
                  "id": 2
              };
              socket.send(JSON.stringify(msg));
              subscribedFactions.add(fid);
          }
      });
  }

  // parse HTML icons returned by WebSocket to determine status
  function processWebSocketIcons(iconsObj) {
      if (!iconsObj) return;

      for (const [userId, iconHtml] of Object.entries(iconsObj)) {
          // update the internal status map immediately
          const currentData = member_status.get(userId) || { status: {} };
          
          // determine state from icon HTML classes
          // icons for hospital usually have class="hospital", jail="jail", etc.
          let newState = "Okay";
          let newDesc = "Okay";
          
          // simple string checks on the HTML payload
          if (iconHtml.includes('class="hospital"')) {
              newState = "Hospital";
              newDesc = "In Hospital (WS)";
          } else if (iconHtml.includes('class="jail"')) {
              newState = "Jail";
              newDesc = "In Jail (WS)";
          } else if (iconHtml.includes('class="traveling"') || iconHtml.includes('class="abroad"')) {
              newState = "Traveling";
              newDesc = "Traveling (WS)";
          }

          // if the state changed, update our local data source
          // WS doesn't give us 'until' timestamps usually, so we keep the old one or set to 0
          // until the next API poll refreshes the exact time
          if (currentData.status.state !== newState) {
              console.log(`[TWSEO] WS Update for ${userId}: ${newState}`);
              
              currentData.status.state = newState;
              currentData.status.description = newDesc;
              
              // entering hospital/jail via WS, we don't know the time yet
              // set to a dummy high number or 0 to force a refresh style, 
              // or keep previous if it seems valid
              // set 'until' to 0 so it shows as "Hospital" without a fake timer
              if (newState === 'Hospital' || newState === 'Jail') {
                  currentData.status.until = (Date.now() / 1000) + 300; // fake 5 mins buffer so it highlights
              } else {
                  currentData.status.until = 0;
              }

              member_status.set(userId, currentData);
          }
      }
      // force a re-render frame immediately
      // watch() loop runs on requestAnimationFrame, so it will pick this up automatically on next frame
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
    window.dispatchEvent(new Event("twse-war-gone"));
  }

  function onWarFound() {
    if (found_war) return;
    found_war = true;
    warRoot = document.querySelector(".faction-war") || document;
    extract_all_member_lis();
    prime_status_placeholders();
    
    // connect WS when war is found
    if (USE_WEBSOCKETS) {
        if (!socket || socket.readyState !== WebSocket.OPEN) {
            createWebSocketConnection();
        } else {
            // already open, just subscribe
            subscribeToFactions(get_faction_ids());
        }
    }
    
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

  // --- OBSERVER ---
  let refreshPending = false;
  function scheduleRefreshLists() {
    if (refreshPending) return;
    refreshPending = true;
    setTimeout(() => {
      refreshPending = false;
      refresh_member_lists_cache();
      // if new lists appeared, ensure we are subscribed to those factions
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
        if (node?.nodeType === 1 && (node.matches?.("ul.members-list") || node.querySelector?.("ul.members-list"))) {
          scheduleRefreshLists();
        }
      }
      for (const node of m.removedNodes) {
        if (node?.nodeType === 1) {
          if (node.matches?.(".faction-war") || node.querySelector?.(".faction-war")) {
            onWarGone();
          }
        }
      }
    }
  });
  setTimeout(() => { if (document.querySelector(".faction-war")) onWarFound(); }, 800);
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
    if (warRoot && !warRoot.isConnected) onWarGone();
    if (!found_war || document.hidden) return;

    const now = Date.now();
    if (now < backoffUntil) return;

    const faction_ids = get_faction_ids();
    if (!faction_ids.length) return;
    
    // check if enough time passed since last API poll
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
        `https://api.torn.com/faction/${faction_id}?selections=basic&key=${apiKey}&comment=TWSE-Merged`,
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

      // update the master Map with API data
      // API data is "authoritative" for timers and descriptions, but WS is faster for state changes
      for (const [k, v] of Object.entries(status.members)) {
        // v contains { status: { description, state, until, ... } }
        // overwrite our local cache with this detailed info
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
  const TIME_BETWEEN_FRAMES = 500; // faster render to catch WS updates

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
          // if description is generic "Traveling (WS)", we don't have details yet
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
          if (nativeIsOK(status_DIV)) {
             // native DOM says OK, but our script says Hosp/Jail. 
             // trust our script (WS/API) over the stale DOM
          }

          setDataset(li, "sortA", 1);
          safeSetAttr(status_DIV, TRAVELING, (st.description || "").includes("In a") ? "true" : "false");

          const remain = Math.max(0, ((st.until >>> 0) - nowSeconds()) | 0);
          
          // if remain is 0 but state is Hospital, it implies we got a WS update but haven't fetched time yet
          // show "Hospital" or "Jail" text instead of 00:00:00
          if (remain <= 0 && st.until === 0) {
              safeSetAttr(status_DIV, CONTENT, st.state); 
              safeSetAttr(status_DIV, HIGHLIGHT, "true"); // highlight immediately
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
          
          // highlight if < 300s OR if it's a fresh WS update (indicated by logic elsewhere if needed)
          const isSoon = remain < 300 ? "true" : "false";
          safeSetAttr(status_DIV, HIGHLIGHT, isSoon);

          if (!HAS_HAS && isSoon === "true" && !li.classList.contains(HCLASS)) li.classList.add(HCLASS);
          break;
        }

        default: {
          // Okay
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

        const lis = lists[i].querySelectorAll("li.enemy, li.your");
        const arr = Array.from(lis).map(li => ({
          li,
          a: +(li.dataset.sortA || 0),
          loc: li.dataset.location || "",
          until: +(li.dataset.until || 0)
        }));

        const asc = sorted_column.order === "asc";
        const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: false });
        
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

  // --- SCHEDULER ---
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

  // --- EVENT LISTENERS ---
  window.addEventListener("hashchange", () => {
    onWarGone();
    setTimeout(() => {
      if (document.querySelector(".faction-war")) onWarFound();
      scheduleRefreshLists();
    }, 300);
  }, { passive: true });

  window.addEventListener("pagehide", () => {
    observer.disconnect();
    clearTimeout(tickTimer);
    if(socket) socket.close();
  }, { passive: true });

})();