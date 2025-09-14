// ==UserScript==
// @name         Torn War Stuff Enhanced Optimized
// @namespace    https://github.com/MWTBDLTR/torn-scripts/
// @version      1.0
// @description  Travel status and hospital time, sorted by hospital time on war page.
// @author       MrChurch [3654415]
// @license      MIT
// @match        https://www.torn.com/factions.php*
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      api.torn.com
// ==/UserScript==

(async function () {
  'use strict';

  if (document.querySelector("#FFScouterV2DisableWarMonitor")) return;

  const ffScouterV2DisableWarMonitor = document.createElement("div");
  ffScouterV2DisableWarMonitor.id = "FFScouterV2DisableWarMonitor";
  ffScouterV2DisableWarMonitor.style.display = "none";
  document.documentElement.appendChild(ffScouterV2DisableWarMonitor);

  let apiKey =
    localStorage.getItem("xentac-torn_war_stuff_enhanced-apikey") ??
    "###PDA-APIKEY###";

  const sort_enemies = true;
  let ever_sorted = false;

  const CONTENT = "data-twse-content";
  const TRAVELING = "data-twse-traveling";
  const HIGHLIGHT = "data-twse-highlight";

  try { GM_registerMenuCommand("Set Api Key", () => checkApiKey(false)); } catch {}

  function checkApiKey(checkExisting = true) {
    if (
      !checkExisting || !apiKey ||
      apiKey.includes("PDA-APIKEY") || apiKey.length !== 16
    ) {
      const userInput = prompt(
        "Please enter a PUBLIC Api Key, it will be used to get basic faction information:",
        apiKey ?? ""
      );
      if (userInput && userInput.length === 16) {
        apiKey = userInput;
        localStorage.setItem("xentac-torn_war_stuff_enhanced-apikey", userInput);
      } else {
        console.error("[TornWarStuffEnhancedOptimized] User cancelled the Api Key input.");
      }
    }
  }

  // Only hide native text once we've set our replacement content
  GM_addStyle(`
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

  let running = true;
  let found_war = false;

  const member_status = new Map(); // userId -> API member
  const member_lis = new Map(); // userId -> <li>

  function nativeIsOK(statusDiv) {
    if (statusDiv.classList.contains('ok')) return true;
    const txt = statusDiv.textContent.trim().toLowerCase();
    // catches "Okay", "Ok", "ok", "okay.", etc.
    return txt === 'ok' || txt.startsWith('okay');
  }

  function safeRemoveAttr(el, name) {
   if (el.hasAttribute(name)) el.removeAttribute(name);
  }

  function get_member_lists() { return document.querySelectorAll("ul.members-list"); }

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
    const member_div = root.querySelector("div.member div");
    const level_div = root.querySelector("div.level div");
    const points_div = root.querySelector("div.points div");
    const status_div = root.querySelector("div.status div");

    let column = null, classname = "";
    if (member_div?.className.match(/activeIcon__/)) { column = "member"; classname = member_div.className; }
    else if (level_div?.className.match(/activeIcon__/)) { column = "level"; classname = level_div.className; }
    else if (points_div?.className.match(/activeIcon__/)) { column = "points"; classname = points_div.className; }
    else if (status_div?.className.match(/activeIcon__/)) { column = "status"; classname = status_div.className; }

    const order = classname.match(/asc__/) ? "asc" : "desc";
    if (column !== "score" && order !== "desc") ever_sorted = true;
    return { column, order };
  }

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node?.classList?.contains("faction-war")) {
          found_war = true;
          extract_all_member_lis();
          prime_status_placeholders();
          return;
        }
      }
    }
  });

  setTimeout(() => {
    if (document.querySelector(".faction-war")) {
      found_war = true;
      extract_all_member_lis();
      prime_status_placeholders();
    }
  }, 500);

  observer.observe(document.body, { subtree: true, childList: true });

  function extract_all_member_lis() {
    member_lis.clear();
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
    document.querySelectorAll(".members-list div.status").forEach((el) => {
      if (!el.hasAttribute(CONTENT)) el.setAttribute(CONTENT, el.innerText);
    });
  }

  // --- Networking / polling ---
  let last_request_ts = 0;
  const MIN_TIME_SINCE_LAST_REQUEST = 9000; // ms

  async function update_statuses() {
    if (!running) return;
    const now = Date.now();
    if (now - last_request_ts < MIN_TIME_SINCE_LAST_REQUEST) return;
    last_request_ts = now;

    const faction_ids = get_faction_ids();
    for (const id of faction_ids) {
      const ok = await update_status(id);
      if (!ok) break;
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  async function update_status(faction_id) {
    let status;
    try {
      const r = await fetch(
        `https://api.torn.com/faction/${faction_id}?selections=basic&key=${apiKey}&comment=TWSEO`
      );
      status = await r.json();
    } catch (e) {
      console.error("[TornWarStuffEnhancedOptimized] ", e);
      return true;
    }

    if (status?.error) {
      const code = status.error.code ?? status.error;
      // Non-recoverable
      if ([0,1,2,3,4,6,7,10,12,13,14,16,18,21].includes(code)) {
        running = false;
        return false;
      }
      // Retryable
      if ([5,8,9].includes(code)) last_request_ts = Date.now() + 40000;
      return false;
    }

    if (!status?.members) return false;

    for (const [k, v] of Object.entries(status.members)) {
      v.status.description = v.status.description
        .replace("South Africa", "SA")
        .replace("Cayman Islands", "CI")
        .replace("United Kingdom", "UK")
        .replace("Argentina", "Arg")
        .replace("Switzerland", "Switz");
      member_status.set(k, v);
    }
    return true;
  }

  // --- Rendering / watch loop ---
  let last_frame = 0;
  const TIME_BETWEEN_FRAMES = 500; // ms

  function pad(n){ return n < 10 ? "0"+n : ""+n; }
  function safeSetAttr(el, name, value) {
    const v = String(value);
    if (el.getAttribute(name) !== v) el.setAttribute(name, v);
  }

  function watch() {
    if (!found_war) return requestAnimationFrame(watch);

    const now = performance.now();
    if (now - last_frame < TIME_BETWEEN_FRAMES) return requestAnimationFrame(watch);
    last_frame = now;

    member_lis.forEach((li, id) => {
      const state = member_status.get(id);
      const status_DIV = li.querySelector("div.status");
      if (!status_DIV) return;

      if (!state || !running) {
        safeSetAttr(status_DIV, CONTENT, status_DIV.innerText);
        return;
      }

      const st = state.status;
      safeSetAttr(li, "data-until", st.until ?? "");
      safeSetAttr(li, "data-location", "");

      switch (st.state) {
        case "Abroad":
        case "Traveling": {
          safeRemoveAttr(li, "data-until");
          safeRemoveAttr(li, "data-location");
          // Always show travel info (don't depend on CSS classes existing)
          if (st.description.includes("Traveling to ")) {
            safeSetAttr(li, "data-sortA", "4");
            const content = "► " + st.description.split("Traveling to ")[1];
            safeSetAttr(li, "data-location", content);
            safeSetAttr(status_DIV, CONTENT, content);
          } else if (st.description.includes("In ")) {
            safeSetAttr(li, "data-sortA", "3");
            const content = st.description.split("In ")[1];
            safeSetAttr(li, "data-location", content);
            safeSetAttr(status_DIV, CONTENT, content);
          } else if (st.description.includes("Returning")) {
            safeSetAttr(li, "data-sortA", "2");
            const content = "◄ " + st.description.split("Returning to Torn from ")[1];
            safeSetAttr(li, "data-location", content);
            safeSetAttr(status_DIV, CONTENT, content);
          } else {
            safeSetAttr(li, "data-sortA", "5");
            safeSetAttr(li, "data-location", "Traveling");
            safeSetAttr(status_DIV, CONTENT, "Traveling");
          }
          break;
        }

        case "Hospital":
        case "Jail": {
          // If Torn's DOM says they're OK (revived/left early), trust it immediately.
          if (nativeIsOK(status_DIV)) {
            safeRemoveAttr(status_DIV, CONTENT);
            safeSetAttr(status_DIV, TRAVELING, "false");
            safeSetAttr(status_DIV, HIGHLIGHT, "false");
            safeSetAttr(li, "data-sortA", "0");
            safeRemoveAttr(li, "data-until");
            safeRemoveAttr(li, "data-location");
            break;
          }
          // Always render timer; don't gate on DOM classes
          safeSetAttr(li, "data-sortA", "1");
          safeSetAttr(status_DIV, TRAVELING, st.description.includes("In a") ? "true" : "false");

          let nowSec = Math.floor(Date.now() / 1000);
          if (window.getCurrentTimestamp) nowSec = Math.floor(window.getCurrentTimestamp() / 1000);

          const until = Number.isFinite(st.until) ? st.until : 0;
          const remain = Math.max(0, Math.round(until - nowSec));
          if (remain <= 0) {
            safeSetAttr(status_DIV, HIGHLIGHT, "false");
            safeSetAttr(status_DIV, CONTENT, status_DIV.innerText); // fallback to native text
            safeRemoveAttr(li, "data-until");
            safeRemoveAttr(li, "data-location");
            break;
          }

          const s = Math.floor(remain % 60);
          const m = Math.floor((remain / 60) % 60);
          const h = Math.floor(remain / 3600);
          const t = `${pad(h)}:${pad(m)}:${pad(s)}`;

          if (status_DIV.getAttribute(CONTENT) !== t) safeSetAttr(status_DIV, CONTENT, t);
          safeSetAttr(status_DIV, HIGHLIGHT, remain < 300 ? "true" : "false");
          safeRemoveAttr(li, "data-location");
          break;
          }

          default: {
            // show native text and clear our overlays/state
            safeRemoveAttr(status_DIV, CONTENT);
            safeSetAttr(li, "data-sortA", "0");
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
        const arr = Array.from(lis);

        const sorted = arr.slice().sort((a, b) => {
          let left = a, right = b;
          if (sorted_column.order === "desc") [left, right] = [b, a];

          const aA = Number(left.getAttribute("data-sortA") || 0);
          const bA = Number(right.getAttribute("data-sortA") || 0);
          if (aA !== bA) return aA - bA;

          const lLoc = left.getAttribute("data-location") || "";
          const rLoc = right.getAttribute("data-location") || "";
          if (lLoc && rLoc) {
            if (lLoc < rLoc) return -1;
            if (lLoc > rLoc) return 1;
          }

          const lUntil = Number(left.getAttribute("data-until") || 0);
          const rUntil = Number(right.getAttribute("data-until") || 0);
          return lUntil - rUntil;
        });

        let isSame = true;
        for (let j = 0; j < sorted.length; j++) {
          if (lists[i].children[j] !== sorted[j]) { isSame = false; break; }
        }
        if (!isSame) {
          const frag = document.createDocumentFragment();
          sorted.forEach((li) => frag.appendChild(li));
          lists[i].appendChild(frag);
        }
      }
    }

    requestAnimationFrame(watch);
  }

  (function tick() {
    update_statuses();
    setTimeout(tick, 1000);
  })();

  setTimeout(() => {
    prime_status_placeholders();
    requestAnimationFrame(watch);
  }, 1000);

  console.log("[TornWarStuffEnhancedOptimized] Initialized");
  window.dispatchEvent(new Event("FFScouterV2DisableWarMonitor"));
})();
