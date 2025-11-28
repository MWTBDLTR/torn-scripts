// ==UserScript==
// @name        Torn Target List Tool
// @description Adds various information about your targets on your target list and updates with API data regularly.
// @version     1.0.0
// @author      MrChurch [3654415] + Szanti (original target list helper script)
// @namespace   https://github.com/MWTBDLTR/torn-scripts/
// @license     GPL-3.0-or-later
// @grant       GM.xmlHttpRequest
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       GM_deleteValue
// @grant       GM_registerMenuCommand
// @grant       GM_addStyle
// @match       https://www.torn.com/page.php?sid=list&type=targets*
// ==/UserScript==

const API_KEY = "###PDA-APIKEY###";
const POLLING_INTERVAL = undefined;
const STALE_TIME = undefined;
const SHOW = undefined; // LEVEL, RESPECT
const USE_FFSCOUTER = undefined; // YES, NO, WAIT_FOR_TT

const UseFfScouter = Object.freeze({
  YES: "Trying FFScouter then TornTools",
  NO: "Disabled FFScouter, trying only TornTools",
  WAIT_FOR_TT: "Trying TornTools then FFScouter"
});

const Show = Object.freeze({
  LEVEL: "Showing Level",
  RESPECT: "Showing Respect",
  RESP_UNAVAILABLE: "Can't show respect without fair fight estimation"
});

(async function() {
  'use strict';

  if (isPda()) {
    // On TornPDA resorting the list leads to the entire script being reloaded
    if (window.target_list_helper_loaded) return;
    window.target_list_helper_loaded = true;

    GM.xmlHttpRequest = GM.xmlhttpRequest;
    GM_getValue = (key, default_value) => {
      const value = GM.getValue(key);
      return value ? JSON.parse(value) : default_value;
    };

    GM_setValue = (key, value) => GM.setValue(key, JSON.stringify(value));
  }

  let api_key = GM_getValue("api-key", API_KEY);
  // Amount of time between each API call
  let polling_interval = GM_getValue("polling-interval", POLLING_INTERVAL ?? 1000);
  // Least amount of time after which to update data
  let stale_time = GM_getValue("stale-time", STALE_TIME ?? 300_000);
  // Show level or respect
  let show_respect = loadEnum(Show, GM_getValue("show-respect", SHOW ?? Show.RESPECT));
  // TornTools is definitely inaccessible on PDA dont bother waiting for it
  let use_ffscouter = loadEnum(
    UseFfScouter,
    GM_getValue("use-ffscouter", USE_FFSCOUTER ?? (isPda() ? UseFfScouter.YES : UseFfScouter.WAIT_FOR_TT))
  );

  // How long until we stop looking for the hospitalization after a possible attack
  const CONSIDER_ATTACK_FAILED = 15_000;
  // Time after which a target coming out of hospital is updated
  const OUT_OF_HOSP = 60_000;
  // It's ok to display stale data until it can get updated but not invalid data
  const INVALIDATION_TIME = Math.max(900_000, stale_time);

  // Our data cache
  let targets = GM_getValue("targets", {});
  // In queue for profile data update, may need to be replaced with a filtered array on unpause
  let profile_updates = [];
  // In queue for FFScouter update
  const ff_updates = [];
  // Update attacked targets when regaining focus
  let attacked_targets = [];
  // If the api key can be used for FFScouter, assume it works, fail if not
  let can_ffscouter = true;
  // To TornTool or not to TornTool
  const torntools = !(document.documentElement.style.getPropertyValue("--tt-theme-color").length === 0);

  if (!torntools && use_ffscouter === UseFfScouter.NO) {
    console.warn("[Torn Target List Tool] Couldn't find TornTools and FFScouter is deactivated, FF estimation unavailable");
    show_respect = Show.RESP_UNAVAILABLE;
  }

  const ff_format = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const bs_format = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  const timer_format = new Intl.DurationFormat("en-US", { style: "digital", fractionalDigits: 0, hoursDisplay: "auto" });

  // This is how to fill in react input values so they register
  const native_input_value_setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;

  const icons = {
    "rock": "🪨",
    "paper": "📜",
    "scissors": "✂️"
  };

  /**
   * ATTACH CSS FOR FLASH EFFECT
   **/
  GM_addStyle(`
    @keyframes green_flash {
      0% {background-color: var(--default-bg-panel-color);}
      50% {background-color: oklab(from var(--default-bg-panel-color) L -0.087 0.106); }
      100% {background-color: var(--default-bg-panel-color);}
    }
    .flash_green {
      animation: green_flash 500ms ease-in-out;
      animation-iteration-count: 1;
    }
  `);

  /**
   * ASSETS
   **/
  const refresh_button = (function makeRefreshButton() {
    const button = document.createElement("button");
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("width", 16);
    icon.setAttribute("height", 15);
    icon.setAttribute("viewBox", "0 0 16 15");
    const icon_path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    icon_path.setAttribute("d", "M9,0A7,7,0,0,0,2.09,6.83H0l3.13,3.5,3.13-3.5H3.83A5.22,5.22,0,1,1,9,12.25a5.15,5.15,0,0,1-3.08-1l-1.2,1.29A6.9,6.9,0,0,0,9,14,7,7,0,0,0,9,0Z");
    icon.appendChild(icon_path);
    button.appendChild(icon);
    return button;
  })();

  const copy_bss_button = (function makeCopyBssButton() {
    const button = document.createElement("button");
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("width", 16);
    icon.setAttribute("height", 13);
    icon.setAttribute("viewBox", "0 0 16 13");
    const icon_path_1 = document.createElementNS("http://www.w3.org/2000/svg", "path");
    icon_path_1.setAttribute("d", "M16,13S14.22,4.41,6.42,4.41V1L0,6.7l6.42,5.9V8.75c4.24,0,7.37.38,9.58,4.25");
    icon.append(icon_path_1);
    const icon_path_2 = document.createElementNS("http://www.w3.org/2000/svg", "path");
    icon_path_2.setAttribute("d", "M16,12S14.22,3.41,6.42,3.41V0L0,5.7l6.42,5.9V7.75c4.24,0,7.37.38,9.58,4.25");
    icon.append(icon_path_2);
    button.appendChild(icon);
    return button;
  })();

  /**
   * REGISTER MENU COMMANDS
   **/
  {
    try {
      GM_registerMenuCommand('Set Api Key', function setApiKey() {
        const new_key = prompt("Please enter a public api key", api_key);
        if (new_key?.length === 16) {
          GM_setValue("api-key", new_key);
          api_key = new_key;
          can_ffscouter = true;
          for (const row of document.querySelector(".tableWrapper > ul").childNodes) updateFf(row);
        } else {
          throw new Error("No valid key detected.");
        }
      });
    } catch (e) {
      if (api_key.charAt(0) === "#") {
        throw new Error("Please set the public or FFScouter api key in the script manually on line 18.");
      }
    }

    try {
      let menu_id = GM_registerMenuCommand(
        use_ffscouter,
        function toggleFfScouter() {
          use_ffscouter = next_state();
          GM_setValue("use-ffscouter", use_ffscouter);
          menu_id = GM_registerMenuCommand(
            use_ffscouter,
            toggleFfScouter, {
              id: menu_id,
              autoClose: false
            }
          );
        }, {
          autoClose: false
        });

      function next_state() {
        if (use_ffscouter === UseFfScouter.WAIT_FOR_TT) return UseFfScouter.YES;
        if (use_ffscouter === UseFfScouter.YES) return UseFfScouter.NO;
        return UseFfScouter.WAIT_FOR_TT;
      }
    } catch (e) {
      if (USE_FFSCOUTER === undefined) {
        console.warn("[Torn Target List Tool] Please choose UseFFScouter.YES, UseFFScouter.NO or UseFFScouter.WAIT_FOR_TT on line 22. (Default: UseFFScouter.WAIT_FOR_TT)");
      }
    }

    try {
      GM_registerMenuCommand('Api polling interval', function setPollingInterval() {
        const new_polling_interval = Number(prompt("How often in ms should the api be called (default 1000)?", polling_interval));
        if (Number.isFinite(new_polling_interval)) {
          polling_interval = new_polling_interval;
          GM_setValue("polling-interval", new_polling_interval);
        } else {
          throw new Error("Please enter a numeric polling interval.");
        }
      });
    } catch (e) {
      if (POLLING_INTERVAL === undefined)
        console.warn("[Torn Target List Tool] Please set the api polling interval (in ms) on line 19. (default 1000ms)");
    }

    try {
      GM_registerMenuCommand('Set Stale Time', function setStaleTime() {
        const new_stale_time = Number(prompt("After how many seconds should data about a target be considered stale (default 300)?", stale_time / 1000));
        if (Number.isFinite(new_stale_time)) {
          stale_time = new_stale_time * 1000;
          GM_setValue("stale-time", stale_time);
        } else {
          throw new Error("Please enter a numeric stale time.");
        }
      });
    } catch (e) {
      if (STALE_TIME === undefined)
        console.warn("[Torn Target List Tool] Please set the stale time (in ms) on line 20. (default 5 minutes)");
    }

    try {
      let menu_id = GM_registerMenuCommand(
        show_respect,
        function toggleRespect() {
          const old_show_respect = show_respect;
          show_respect = next_state();
          try {
            for (const row of document.querySelector(".tableWrapper > ul").childNodes) redrawFf(row);
          } catch (e) { // handle user click before fair fight is loaded
            show_respect = old_show_respect;
            throw e;
          }
          setFfColHeader();
          if (show_respect !== Show.RESP_UNAVAILABLE)
            GM_setValue("show-respect", show_respect);
          menu_id = GM_registerMenuCommand(
            show_respect,
            toggleRespect, {
              id: menu_id,
              autoClose: false
            }
          );
        }, {
          autoClose: false
        }
      );

      function next_state() {
        if ((use_ffscouter === UseFfScouter.NO || !can_ffscouter) && !torntools)
          return Show.RESP_UNAVAILABLE;
        if (show_respect === Show.RESPECT)
          return Show.LEVEL;
        return Show.RESPECT;
      }
    } catch (e) {
      if (SHOW === undefined)
        console.warn("[Torn Target List Tool] Please select if you want to see estimated respect Show.RESPECT or Show.LEVEL on line 21. (Default Show.RESPECT)");
    }
  }

  /**
   * THE SCRIPT PROPER
   **/
  const row_list = await waitForElement(".tableWrapper > ul", document.getElementById("users-list-root"));

  const table = row_list.parentNode;
  const table_head = table.querySelector("[class*=tableHead]");
  const description_header = table_head.querySelector("[class*=description___]");
  waitForElement("[aria-label='Remove player from the list']", row_list)
    .then(button => {
      if (button.getAttribute("data-is-tooltip-opened") != null)
        description_header.style.maxWidth = (description_header.scrollWidth - button.scrollWidth) + "px";
    });

  setFfColHeader();
  table_head.insertBefore(description_header, table_head.querySelector("[class*=level___]"));

  parseTable(row_list);

  // observe changes after resorting (new table body creation)
  new MutationObserver(records => {
    records.forEach(r =>
      r.addedNodes.forEach(n => {
        if (n.tagName === "UL") parseTable(n);
      }));
  }).observe(table, {
    childList: true
  });

  const loop_id = crypto.randomUUID();
  let idle_start = undefined;
  let process_responses = [];
  GM_setValue("main-loop", loop_id);
  GM_setValue("has-lock", loop_id);

  addEventListener("focus", function refocus() {
    GM_setValue("main-loop", loop_id);
    while (attacked_targets.length > 0)
      updateUntilHospitalized(attacked_targets.pop(), CONSIDER_ATTACK_FAILED);
  });

  setInterval(mainLoop, polling_interval);

  function mainLoop() {
    const jobs_waiting = profile_updates.length > 0 || ff_updates.length > 0 || process_responses.length > 0;
    let has_lock = GM_getValue("has-lock");

    if (jobs_waiting && has_lock !== loop_id && (has_lock === undefined || GM_getValue("main-loop") === loop_id)) {
      GM_setValue("has-lock", loop_id);
      has_lock = loop_id;

      Object.assign(targets, GM_getValue("targets", {}));
      profile_updates =
        profile_updates
        .filter(row => {
          const t = targets[getId(row)];
          if (!t?.timestamp || t.timestamp < idle_start)
            return true;
          finishUpdate(row);
          return false;
        });
    } else if (!jobs_waiting && has_lock === loop_id) {
      GM_deleteValue("has-lock", undefined);
      has_lock = undefined;
    }

    if (has_lock !== loop_id) {
      idle_start = Date.now();
      return;
    }

    while (process_responses.length > 0)
      process_responses.pop()();

    GM_setValue("targets", targets);

    if (api_key.charAt(0) === "#")
      return;

    /**
     * FFScouter updates
     **/
    if (ff_updates.length > 0) {
      const scouts = ff_updates.splice(0, 250);
      GM.xmlHttpRequest({
        url: `https://ffscouter.com/api/v1/get-stats?key=${api_key}&targets=${scouts.map(getId).join(",")}`,
        onload: function updateFf({
          responseText
        }) {
          const r = JSON.parse(responseText);
          if (r.error) {
            can_ffscouter = false;
            if (!torntools)
              show_respect = Show.RESP_UNAVAILABLE;
            throw new Error("FFScouter error: " + r.error);
          }
          process_responses.push(() => {
            r.forEach((result) => {
              if (result.fair_fight !== null)
                targets[result.player_id].fair_fight = {
                  last_updated: result.last_updated * 1000,
                  fair_fight: result.fair_fight,
                  bs_estimate: result.bs_estimate
                };
            });
            setTimeout(() => {
              scouts.forEach(row => {
                if (targets[getId(row)].fair_fight)
                  redrawFf(row);
              });
            });
          });
        }
      });
    }

    /**
     * Torn profile updates
     **/
    let row;
    while (profile_updates.length > 0 && !row?.isConnected)
      row = profile_updates.shift();

    if (!row)
      return;

    const id = getId(row);

    GM.xmlHttpRequest({
      url: `https://api.torn.com/user/${id}?key=${api_key}&selections=profile`,
      onload: function updateProfile({
        responseText
      }) {
        let r = undefined;
        try {
          r = JSON.parse(responseText); // can also throw on malformed response
          if (r.error)
            throw new Error("Torn error: " + r.error.error);
        } catch (e) {
          profile_updates.unshift(row);
          throw e;
        }

        const response_date = Date.now();

        process_responses.push(() => {
          if (targets[id].timestamp === undefined || targets[id].timestamp <= response_date) {
            Object.assign(targets[id], {
              timestamp: response_date,
              icon: icons[r.competition.status] ?? r.competition.status ?? "",
              hospital: r.status.until === 0 ? Math.min(targets[id]?.hospital ?? 0, Date.now()) : r.status.until * 1000,
              life: r.life,
              status: r.status.state,
              last_action: r.last_action.timestamp * 1000,
              level: r.level
            });
          }
          finishUpdate(row);
        });
      }
    });

    function finishUpdate(row) {
      row.updating = false;
      row.fast_tracked = false;

      setTimeout(() => {
        row.classList.add('flash_green');
        setTimeout(() => row.classList.remove('flash_green'), 500);

        redrawStatus(row);
        updateStatus(row, targets[getId(row)].timestamp + stale_time);
      });
    }
  }

  function parseTable(table) {
    parseRows(table.childNodes);

    // watch the whole list
    const tableObserver = new MutationObserver(records => {
      records.forEach(r => {
        // handle new rows added
        if (r.type === 'childList' && r.target === table) {
          parseRows(r.addedNodes);
        }
        // handle modifications within existing rows (like buttons loading)
        else if (r.target.nodeType === 1 && table.contains(r.target)) {
          // find the row element
          let currentRow = r.target;
          while (currentRow && currentRow.tagName !== 'LI') {
            currentRow = currentRow.parentNode;
          }

          if (currentRow && currentRow.parentNode === table) {
            // check if buttons group was added or modified
            if (r.target.classList && r.target.classList.toString().includes("buttonsGroup")) {
              reworkRow(currentRow);
            } else {
              // also check added nodes for button groups
              r.addedNodes.forEach(n => {
                if (n.nodeType === 1 && n.classList.toString().includes("buttonsGroup")) {
                  reworkRow(currentRow);
                }
              });
            }
          }
        }
      });
    });

    tableObserver.observe(table, {
      childList: true,
      subtree: true
    });

    function parseRows(rows) {
      for (const row of rows) {
        if (row.classList.contains("tornPreloader") || row.tagName !== 'LI')
          continue;

        const id = getId(row);
        const target = targets[id];
        const level_from_page = Number(row.querySelector("[class*='level___']").textContent);
        const status_from_page = row.querySelector("[class*='status___'] > span").textContent;

        reworkRow(row);

        if (target?.timestamp + INVALIDATION_TIME > Date.now() && status_from_page === target?.status) {
          redrawStatus(row);
          updateStatus(row, target.timestamp + stale_time);
        } else {
          targets[id] = {
            level: level_from_page,
            status: status_from_page,
            fair_fight: target?.fair_fight
          };
          if (status_from_page === "Hospital")
            updateUntilHospitalized(row);
          else
            updateStatus(row);
        }

        if (target?.fair_fight?.last_updated > target?.last_action)
          redrawFf(row);
        else
          updateFf(row);
      }
    }

    function reworkRow(row) {
      // switch description and FF column
      const description = row.querySelector("[class*=description___]");
      const ff = row.querySelector("[class*='level___']");

      // safety check if elements exist
      if (!description || !ff) return;

      // only move if not already moved
      if (ff.nextElementSibling !== description) {
        const contentGroup = row.querySelector("[class*='contentGroup___']");
        if (contentGroup) contentGroup.insertBefore(description, ff);
      }

      const buttons_group = row.querySelector("[class*='buttonsGroup']");
      if (!buttons_group)
        return;

      // avoid double processing
      if (buttons_group.querySelector(".refresh-btn-hook")) return;

      const sample_button = buttons_group.querySelector("button:not([class*='disabled___'])");
      const disabled_button = buttons_group.querySelector("[class*='disabled___']");
      const edit_button = row.querySelector("[aria-label='Edit user descripton'], [aria-label='Edit player']");

      // if sample button not ready, return
      if (!sample_button) return;

      const wide_mode = sample_button.getAttribute("data-is-tooltip-opened") !== null;

      const new_refresh_button = refresh_button.cloneNode(true);
      new_refresh_button.classList.add("refresh-btn-hook"); // Add hook to prevent dupes
      sample_button.classList.forEach(c => new_refresh_button.classList.add(c));
      if (!wide_mode)
        new_refresh_button.append(document.createTextNode("Refresh"));
      buttons_group.prepend(new_refresh_button);
      new_refresh_button.addEventListener("click", () => updateStatus(row, Date.now(), true));

      // fix description width
      if (wide_mode)
        description.style.maxWidth = (description.scrollWidth - new_refresh_button.scrollWidth) + "px";

      // Add BSS button
      // Remove old listeners to prevent duplicates if reworkRow is called multiple times?
      // Since we clone the node, just re-adding is fine if we guard against dupes.
      edit_button?.addEventListener(
        "click",
        async function addBssButton() {
          const faction_el = row.querySelector("[class*='factionImage___']");
          let faction_id = "0";

          if (faction_el) {
             const faction_alt = faction_el.getAttribute("alt");
             if (faction_alt !== "") {
                faction_id = faction_alt;
             } else {
                 const hrefMatch = faction_el.parentNode.getAttribute("href").match(/[0-9]+/g);
                 if (hrefMatch) faction_id = hrefMatch[0];
             }
          }

          const bss_str = "BS: " + bs_format.format(targets[getId(row)].fair_fight.bs_estimate) + (faction_id !== "0" ? " - " + faction_id : "");

          const new_copy_bss_button = copy_bss_button.cloneNode(true);

          const wrapper = await waitForElement("[class*='wrapper___']", row);
          
          // check if already added
          if(wrapper.querySelector(".bss-btn-hook")) return;
          new_copy_bss_button.classList.add("bss-btn-hook");

          if(wrapper.childNodes.length > 1) {
              wrapper.childNodes[1].classList.forEach(c => new_copy_bss_button.classList.add(c));
          }
          wrapper.append(new_copy_bss_button);

          new_copy_bss_button.addEventListener("click", (e) => {
            e.stopPropagation();
            native_input_value_setter.call(wrapper.childNodes[0], bss_str);
            wrapper.childNodes[0].dispatchEvent(new Event('input', {
              bubbles: true
            }));
          });
          if (wide_mode)
            waitForElement("[aria-label='Edit user descripton']", row)
            .then(button => {
              button.addEventListener("click", addBssButton);
            });
        });

      // enable attack buttons and make them report if they're clicked
      if (disabled_button) {
        const a = document.createElement("a");
        a.href = `/loader2.php?sid=getInAttack&user2ID=${getId(row)}`;
        disabled_button.childNodes.forEach(n => a.appendChild(n));
        disabled_button.classList.forEach(c => {
          if (c.charAt(0) !== 'd')
            a.classList.add(c);
        });
        disabled_button.parentNode.insertBefore(a, disabled_button);
        disabled_button.parentNode.removeChild(disabled_button);
      }
      (disabled_button ?? buttons_group.querySelector("a"))?.addEventListener("click", () => attacked_targets.push(row));
    }
  }

  function redrawStatus(row) {
    const target = targets[getId(row)];
    const status_element = row.querySelector("[class*='status___'] > span");

    if (!status_element) return;

    setStatus();

    if (target.status === "Okay" && Date.now() > target.hospital + OUT_OF_HOSP) {
      status_element.classList.replace("user-red-status", "user-green-status");
    } else if (target.status === "Hospital") {
      status_element.classList.replace("user-green-status", "user-red-status");
      if (target.hospital < Date.now()) // defeated but not left, hosp'd, or mugged
        updateUntilHospitalized(row);
      else
        updateStatus(row, target.hospital + OUT_OF_HOSP);

      let last_timer = row.timer =
        setTimeout(function updateTimer() {
          const time_left = target.hospital - Date.now();

          if (time_left > 0 && last_timer === row.timer) {
            status_element.textContent =
              timer_format.format({
                minutes: Math.trunc(time_left / 60_000),
                seconds: Math.trunc(time_left / 1000 % 60)
              }) +
              " " + target.icon;
            last_timer = row.timer = setTimeout(updateTimer, 1000 - Date.now() % 1000, row);
          } else if (time_left <= 0) {
            target.status = "Okay";
            setStatus(row);
          }
        });
    }

    // check if we need a healing tick
    if (row.health_update || target.life.current === target.life.maximum)
      return;

    let next_health_tick = target.timestamp + target.life.ticktime * 1000;
    if (next_health_tick < Date.now()) {
      const health_ticks = Math.ceil((Date.now() - next_health_tick) / (target.life.interval * 1000));
      target.life.current = Math.min(target.life.maximum, target.life.current + health_ticks * target.life.increment);
      next_health_tick = next_health_tick + health_ticks * target.life.interval * 1000;
      target.life.ticktime = next_health_tick - target.timestamp;
      setStatus(row);
    }

    row.health_update =
      setTimeout(function updateHealth() {
        target.life.current = Math.min(target.life.maximum, target.life.current + target.life.increment);
        target.ticktime = Date.now() + target.life.interval * 1000 - target.timestamp;

        if (target.life.current < target.life.maximum)
          row.health_update = setTimeout(updateHealth, target.life.interval * 1000);
        else
          row.health_update = undefined;

        setStatus(row);
      }, next_health_tick - Date.now());

    function setStatus() {
      let status = status_element.textContent;

      if (target.status === "Okay")
        status = target.life.current + "/" + target.life.maximum;

      status_element.textContent = status + " " + target.icon;
    }
  }

  function redrawFf(row) {
    const target = targets[getId(row)];
    if (!target || !target.fair_fight) return;

    const ff = target.fair_fight.fair_fight;

    const text_element = row.querySelector("[class*='level___']");
    const respect = (1 + 0.005 * target.level) * Math.min(3, ff);

    if (show_respect === Show.RESPECT)
      text_element.textContent = ff_format.format(respect) + " " + ff_format.format(ff);
    else
      text_element.textContent = target.level + " " + ff_format.format(ff);
  }

  function updateStatus(row, when, fast_track) {
    const requested_at = Date.now();
    const id = getId(row);
    if (fast_track && !row.fast_tracked) {
      row.updating = true;
      row.fast_tracked = true;
      profile_updates.unshift(row);
      return;
    }
    setTimeout(() => {
      if (row.updating || targets[id]?.timestamp > requested_at)
        return;

      row.updating = true;
      profile_updates.push(row);
    }, when - Date.now());
  }

  function updateFf(row) {
    /**
     * UseFfScouter   |  can_ffscouter  |  torntools  | case | action
     * --------------+-----------------+-------------+------+--------
     * YES            |           YES   |        N/A  |    a | ff_updates.push
     * YES            |            NO   |        YES  |    e | try_tt (error when can_ffscouter got set), fail silently
     * YES            |            NO   |         NO  |    b | fail silently (error whet can_ffscouter got set)
     * NO             |           N/A   |        YES  |    d | try_tt, fail with error
     * NO             |           N/A   |         NO  |    b | fail silently (warn when torntools got set)
     * WAIT_FOR_TT    |           YES   |        YES  |    c | try_tt catch ff_updates.push
     * WAIT_FOR_TT    |           YES   |         NO  |    a | ff_updates.push
     * WAIT_FOR_TT    |            NO   |        YES  |    d | try_tt, fail with error
     * WAIT_FOR_TT    |            NO   |         NO  |    b | fail silently (error when can_ffscouter got set)
     **/
    if ((use_ffscouter === UseFfScouter.YES && can_ffscouter) ||
      (use_ffscouter === UseFfScouter.WAIT_FOR_TT && can_ffscouter && !torntools)
    ) {
      ff_updates.push(row);
      return;
    }

    if (!torntools)
      return;

    waitForElement(".tt-ff-scouter-indicator", row, 5000)
      .then(function ffFromTt(el) {
        const ff_perc = el.style.getPropertyValue("--band-percent");
        const ff =
          (ff_perc < 33) ? ff_perc / 33 + 1 :
          (ff_perc < 66) ? 2 * ff_perc / 33 :
          (ff_perc - 66) * 4 / 34 + 4;
        Object.assign(targets[getId(row)], {
          fair_fight: {
            fair_fight: ff
          }
        });
        redrawFf(row);
      })
      .catch(function noTtFound(e) {
        if (use_ffscouter === UseFfScouter.WAIT_FOR_TT && can_ffscouter)
          ff_updates.push(row);
        else if (use_ffscouter === UseFfScouter.NO || use_ffscouter === UseFfScouter.WAIT_FOR_TT)
          console.error("[Torn Target List Tool] No FF estimation from FFScouter or TornTools for target " + getName(row) + " found.");
      });
  }

  function updateUntilHospitalized(row, time_out_after = INVALIDATION_TIME) {
    const id = getId(row);
    const start = Date.now();
    updateStatus(row);
    const attack_updater = setInterval(
      function attackUpdater() {
        updateStatus(row);
        if ((targets[id]?.hospital > Date.now()) || Date.now() > start + time_out_after) {
          clearInterval(attack_updater);
          return;
        }
      }, polling_interval);
  }

  function getId(row) {
    if (!row.player_id) {
      const link = row.querySelector("[class*='honorWrap___'] > a");
      if (link) {
        const match = link.href.match(/\d+/);
        if (match) row.player_id = match[0];
      }
    }
    return row.player_id;
  }

  function getName(row) {
    const img = row.querySelector(".honor-text-wrap > img");
    return img ? img.alt : "Unknown";
  }

  function setFfColHeader() {
    const headerBtn = document.querySelector("[class*='level___'] > button");
    if (headerBtn && headerBtn.childNodes[0]) {
      headerBtn.childNodes[0].data = show_respect === Show.RESPECT ? "R" : "Lvl";
    }
  }

  function waitForElement(query_string, element = document, fail_after) {
    const el = element.querySelector(query_string);
    if (el)
      return Promise.resolve(el);

    return new Promise((resolve, reject) => {
      let resolved = false;

      const observer = new MutationObserver(
        function checkElement() {
          observer.takeRecords();
          const el = element.querySelector(query_string);
          if (el) {
            resolved = true;
            observer.disconnect();
            resolve(el);
          }
        });

      observer.observe(element, {
        childList: true,
        subtree: true
      });

      if (Number.isFinite(fail_after))
        setTimeout(() => {
          if (!resolved) {
            observer.disconnect();
            reject(query_string + " not found.");
          }
        }, fail_after);
    });
  }

  function isPda() {
    return window.navigator.userAgent.includes("com.manuito.tornpda");
  }

  function loadEnum(the_enum, loaded_value) {
    for (const [key, value] of Object.entries(the_enum)) {
      if (value === loaded_value)
        return the_enum[key];
    }
    return undefined;
  }
})();