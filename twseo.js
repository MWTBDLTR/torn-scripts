// ==UserScript==
// @name         Torn War Stuff Enhanced Optimized (TWSE-O)
// @namespace    https://github.com/MWTBDLTR/torn-scripts/
// @version      1.1.4
// @description  Travel status and hospital time sorted on war page.
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

  // Compliance notes:
  // - Uses ONLY Torn's official API (https://api.torn.com). No scraping of unseen pages; no non-API network calls.
  // - No captcha bypass; no click emulation. UI read/modify on the page you’re viewing is allowed.
  // - Respects Torn API rate guidance (100 requests/min per user across keys). Adds visibility-aware throttling.
  // - Key is stored locally (localStorage) and never transmitted anywhere except api.torn.com.

  if (document.querySelector("#FFScouterV2DisableWarMonitor")) return;

  // play nice with FFScouter
  const ffScouterV2DisableWarMonitor = document.createElement("div");
  ffScouterV2DisableWarMonitor.id = "FFScouterV2DisableWarMonitor";
  ffScouterV2DisableWarMonitor.style.display = "none";
  document.documentElement.appendChild(ffScouterV2DisableWarMonitor);

  const LS_KEY = "torn_war_stuff_enhanced_optimized-apikey";
  let apiKey = localStorage.getItem(LS_KEY) ?? "###PDA-APIKEY###";

  function hasValidKey() {
    return typeof apiKey === 'string' && apiKey.length === 16 && !apiKey.includes("PDA-APIKEY");
  }

  function promptSetKey() {
    const userInput = prompt(
      "Enter your PUBLIC Torn API key (16 chars). Stored locally; used only for faction basic data:",
      hasValidKey() ? apiKey : ""
    );
    if (userInput && userInput.length === 16) {
      apiKey = userInput.trim();
      localStorage.setItem(LS_KEY, apiKey);
      alert("API key saved locally.");
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
    alert(
      [
        "TWSE Optimized — Data Use / ToS Summary",
        "",
        "• Purpose: Show travel/hospital status & sort lists using Torn's official API.",
        "• API Calls: faction/{id}?selections=basic (read-only).",
        "• Key Storage: Your PUBLIC key is stored locally in your browser (localStorage).",
        "• Sharing: Never shared with third parties; only sent to api.torn.com.",
        "• Access Level: Minimal (basic selection).",
        "• Rate Limits: Respects Torn’s 100 req/min per-user guidance; throttled and visibility-aware.",
      ].join("\n")
    );
  }

  try {
    GM_registerMenuCommand("Set API Key", () => promptSetKey());
    GM_registerMenuCommand("Clear API Key", () => clearKey());
    GM_registerMenuCommand("Data Use / ToS Summary", () => showDataUse());
  } catch {}

  // ui
  const sort_enemies = true;
  let ever_sorted = false;

  const CONTENT   = "data-twse-content";
  const TRAVELING = "data-twse-traveling";
  const HIGHLIGHT = "data-twse-highlight";

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
  const member_lis = new Map();    // userId -> <li>

  function nativeIsOK(statusDiv) {
    if (statusDiv.classList.contains('ok')) return true;
    const txt = statusDiv.textContent.trim().toLowerCase();
    return txt === 'ok' || txt.startsWith('okay');
  }

  function safeRemoveAttr(el, name) { if (el.hasAttribute(name)) el.removeAttribute(name); }
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

  // network / API
  let last_request_ts = 0;
  const MIN_TIME_SINCE_LAST_REQUEST = 9000; // ms between request batches
  let backoffUntil = 0; // ms epoch; set on rate-limit errors

  async function update_statuses() {
    if (!running) return;
    if (!found_war) return;
    if (document.hidden) return;
    if (!hasValidKey()) return;

    const now = Date.now();
    if (now < backoffUntil) return;

    const faction_ids = get_faction_ids();
    if (!faction_ids.length) return;

    if (now - last_request_ts < MIN_TIME_SINCE_LAST_REQUEST) return;

    let madeARequest = false;
    for (const id of faction_ids) {
      const ok = await update_status(id);
      madeARequest = true;
      if (!ok) break;
      await new Promise((r) => setTimeout(r, 150)); // tiny gap between factions
    }
    if (madeARequest) last_request_ts = Date.now();
  }

  async function update_status(faction_id) {
    try {
      const r = await fetch(
        `https://api.torn.com/faction/${faction_id}?selections=basic&key=${apiKey}&comment=TWSEO`,
        { method: 'GET', mode: 'cors', cache: 'no-store' }
      );
      const status = await r.json();

      if (status?.error) {
        const code = status.error.code ?? status.error;
        // Retry/backoff: 5 = too many requests (temporary ban). 8/9 sometimes used for cooldown/unavailable.
        if ([5, 8, 9].includes(code)) {
          backoffUntil = Date.now() + 60_000; // 60s cool-off
          return false;
        }
        // Non-retryable until user action (bad key/params/etc.)
        if ([0,1,2,3,4,6,7,10,12,13,14,16,18,21].includes(code)) {
          running = false;
          console.warn("[TWSE-Optimized] API halted due to error code:", code);
          return false;
        }
        // Unknown error: brief backoff
        backoffUntil = Date.now() + 20_000;
        return false;
      }

      if (!status?.members) return true;

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
    } catch (e) {
      console.error("[TWSE-Optimized] Network/parse error:", e && e.message ? e.message : e);
      // network hiccup: short backoff
      backoffUntil = Date.now() + 20_000;
      return false;
    }
  }

  // render and watch
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
          if (nativeIsOK(status_DIV)) {
            safeRemoveAttr(status_DIV, CONTENT);
            safeSetAttr(status_DIV, TRAVELING, "false");
            safeSetAttr(status_DIV, HIGHLIGHT, "false");
            safeSetAttr(li, "data-sortA", "0");
            safeRemoveAttr(li, "data-until");
            safeRemoveAttr(li, "data-location");
            break;
          }
          safeSetAttr(li, "data-sortA", "1");
          safeSetAttr(status_DIV, TRAVELING, st.description.includes("In a") ? "true" : "false");

          let nowSec = Math.floor(Date.now() / 1000);
          if (window.getCurrentTimestamp) nowSec = Math.floor(window.getCurrentTimestamp() / 1000);

          const until = Number.isFinite(st.until) ? st.until : 0;
          const remain = Math.max(0, Math.round(until - nowSec));
          if (remain <= 0) {
            safeSetAttr(status_DIV, HIGHLIGHT, "false");
            safeSetAttr(status_DIV, CONTENT, status_DIV.innerText);
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

  // Defer the init log until war section appears (or fallback after 1.5s)
  (function initLog() {
    const logInit = () => {
      console.log(
        "[TWSE-Optimized] Initialization complete. Found war section:",
        found_war,
        "Valid API key:",
        hasValidKey()
      );
    };
    window.addEventListener("twse-war-found", logInit, { once: true });
    setTimeout(logInit, 1500); // fallback if war section never appears
  })();

  window.dispatchEvent(new Event("FFScouterV2DisableWarMonitor"));
})();
