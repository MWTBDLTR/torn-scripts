// ==UserScript==
// @name         Role Restrictions Using API Data
// @namespace    https://https://github.com/MWTBDLTR/oc_role_restrictions
// @version      0.1
// @description  Role restrictions using API data, forked from xentac[3354782] who forked underko[3362751]. It's a party.
// @author       MrChurch[3654415]
// @match        https://www.torn.com/factions.php*
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// @connect      tornprobability.com
// @license      MIT
// ==/UserScript==
// No, it's not commented. No, I don't care.
(function () {
  "use strict";

  const INFLUENCE_API_URL = "https://tornprobability.com:3000/api/GetRoleWeights";
  const INFLUENCE_CACHE_KEY = "ocInfluenceCache:v1";
  const INFLUENCE_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

  let ocRoleInfluence = {};

  let crimeData = {};
  let previousTab = "none";

  function readCache(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const { data, ts } = JSON.parse(raw);
      if (Date.now() - ts > INFLUENCE_CACHE_TTL_MS) return null;
      return data;
    } catch {
      return null;
    }
  }

  function writeCache(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
    } catch {}
  }

  function deepMergeInfluence(base, overlay) {
    return Object.assign({}, base, overlay);
  }

  const OC_TITLE_MAP = {
    MobMentality: "Mob Mentality",
    PetProject: "Pet Project",
    CashMeIfYouCan: "Cash Me if You Can",
    BestOfTheLot: "Best of the Lot",
    MarketForces: "Market Forces",
    SmokeAndWingMirrors: "Smoke and Wing Mirrors",
    GaslightTheWay: "Gaslight the Way",
    StageFright: "Stage Fright",
    SnowBlind: "Snow Blind",
    LeaveNoTrace: "Leave No Trace",
    NoReserve: "No Reserve",
    CounterOffer: "Counter Offer",
    HoneyTrap: "Honey Trap",
    BiddingWar: "Bidding War",
    BlastFromThePast: "Blast from the Past",
    BreakTheBank: "Break the Bank",
    StackingTheDeck: "Stacking the Deck",
    ClinicalPrecision: "Clinical Precision",
    AceInTheHole: "Ace in the Hole",
  };

  const ROLE_BASE_MAP = {
    CarThief: "Car Thief",
    CatBurglar: "Cat Burglar",
    Picklock: "Picklock",
    Techie: "Techie",
    Engineer: "Engineer",
    Driver: "Driver",
    Robber: "Robber",
    Bomber: "Bomber",
    Thief: "Thief",
    Hustler: "Hustler",
    Imitator: "Imitator",
    Looter: "Looter",
    Muscle: "Muscle",
    Enforcer: "Enforcer",
    Negotiator: "Negotiator",
    Arsonist: "Arsonist",
    Lookout: "Lookout",
    Kidnapper: "Kidnapper",
    Assassin: "Assassin",
    Cleaner: "Cleaner",
    Sniper: "Sniper",
    Hacker: "Hacker",
  };

  function prettyRole(roleKey) {
    const m = roleKey.match(/^([A-Za-z]+)(\d+)?$/);
    if (!m) return roleKey.replace(/([a-z])([A-Z])/g, "$1 $2");
    const base = m[1];
    const num = m[2];
    const basePretty = ROLE_BASE_MAP[base] || base.replace(/([a-z])([A-Z])/g, "$1 $2");
    return num ? `${basePretty} #${num}` : basePretty;
  }

  function clampInfluence(x) {
    if (!isFinite(x)) return 0;
    if (x < 0) x = 0;
    return Math.round(x * 100) / 100;
  }

  function chooseLowerForOC(valuesArr, val) {
    if (val < 5) return 40;
    const sorted = [...valuesArr].sort((a, b) => b - a);
    const n = sorted.length;
    const q = (p) => sorted[Math.max(0, Math.min(n - 1, Math.floor(p * (n - 1))))];
    const q1 = q(0.25), q2 = q(0.5), q3 = q(0.75);
    if (val >= q1) return 75;
    if (val >= q2) return 70;
    if (val >= q3) return 65;
    return 60;
  }

  function mapApiToInfluence(apiData) {
    if (!apiData || typeof apiData !== "object" || Array.isArray(apiData)) return {};
    const result = {};
    for (const ocKey of Object.keys(apiData)) {
      const uiOcTitle = OC_TITLE_MAP[ocKey];
      if (!uiOcTitle) continue;
      const rolesObj = apiData[ocKey] || {};
      const roleKeys = Object.keys(rolesObj);
      if (!roleKeys.length) continue;

      const rawVals = roleKeys.map((k) => Number(rolesObj[k]) || 0);
      result[uiOcTitle] = roleKeys.map((k) => {
        const val = clampInfluence(Number(rolesObj[k]) || 0);
        return {
          role: prettyRole(k),
          influence: val,
          lower: chooseLowerForOC(rawVals, val),
        };
      });
    }
    return result;
  }

  function loadInfluenceFromApi(cb) {
    const cached = readCache(INFLUENCE_CACHE_KEY);
    if (cached) {
      ocRoleInfluence = deepMergeInfluence(ocRoleInfluence, cached);
      return cb();
    }

    try {
      GM_xmlhttpRequest({
        method: "GET",
        url: INFLUENCE_API_URL,
        headers: { Accept: "application/json" },
        onload: function (res) {
          if (res.status !== 200) {
            console.error("[RoleRestrict] Influence API bad status:", res.status);
            return cb();
          }
          try {
            const raw = JSON.parse(res.responseText);
            const mapped = mapApiToInfluence(raw);
            if (mapped && Object.keys(mapped).length) {
              writeCache(INFLUENCE_CACHE_KEY, mapped);
              ocRoleInfluence = deepMergeInfluence(ocRoleInfluence, mapped);
            }
          } catch (e) {
            console.error("[RoleRestrict] Influence API parse failed:", e.message);
          }
          cb();
        },
        onerror: function (e) {
          console.error("[RoleRestrict] Influence API request error:", e);
          cb();
        },
      });
    } catch (e) {
      console.error("[RoleRestrict] Influence API fetch threw:", e.message);
      cb();
    }
  }

  function classifyOcRoleInfluence(ocName, roleName) {
    const ocInfo = ocRoleInfluence[ocName] || [];
    const roleData = ocInfo.find((r) => r.role === roleName);
    const influence = roleData ? roleData.influence : 0;
    const lower = roleData ? roleData.lower : 70;
    let upper = lower + 10;

    const roleLowers = ocInfo.map((role) => role.lower).sort((a, b) => a - b);
    if (roleLowers.length && roleLowers[0] === lower && roleLowers.length > 1) {
      upper = roleLowers[1];
    }

    return { influence, lower, upper };
  }

  function getFactionId() {
    let factionId = "";
    try {
      document
        .querySelector(".forum-thread")
        .href.split("#")[1]
        .split("&")
        .forEach((elem) => {
          if (elem[0] == "a") {
            factionId = elem.split("=")[1];
          }
        });
    } catch (e) {
      console.log("[RoleRestrict] Couldn't extract faction id:", e);
    }
    return factionId;
  }

  function updateFactionRoleRestrictions(factionId, cb) {
    try {
      GM_xmlhttpRequest({
        method: "GET",
        url: `https://raw.githubusercontent.com/xentac/oc_role_restrictions/refs/heads/main/${factionId}.json`,
        headers: { "Content-Type": "application/json" },
        onload: function (response) {
          if (response.status != 200) {
            console.error(
              "[RoleRestrict] Bad response fetching faction restrictions:",
              response.status
            );
            return cb();
          }
          try {
            const result = JSON.parse(response.responseText);
            ocRoleInfluence = deepMergeInfluence(ocRoleInfluence, result);
          } catch (error) {
            console.error(
              "[RoleRestrict] Failed to parse faction restrictions:",
              error.message
            );
          }
          return cb();
        },
      });
    } catch (error) {
      console.error(
        "[RoleRestrict] Failed fetching faction restrictions:",
        error.message
      );
      cb();
    }
  }

  function processCrime(wrapper) {
    const ocId = wrapper.getAttribute("data-oc-id");
    if (!ocId || crimeData[ocId]) return;

    const titleEl = wrapper.querySelector("p.panelTitle___aoGuV");
    if (!titleEl) return;

    const crimeTitle = titleEl.textContent.trim();
    const roles = [];

    const roleEls = wrapper.querySelectorAll(".title___UqFNy");
    roleEls.forEach((roleEl) => {
      const roleName = roleEl.textContent.trim();
      const successEl = roleEl.nextElementSibling;
      const chance = successEl ? parseInt(successEl.textContent.trim(), 10) : null;
      const evaluation =
        chance !== null
          ? classifyOcRoleInfluence(crimeTitle, roleName)
          : { influence: null, lower: 70, upper: 80 };
      roles.push({ role: roleName, chance, evaluation });

      if (successEl && evaluation.influence !== null) {
        successEl.textContent = `${chance}/${evaluation.lower}`;
      }

      const slotHeader = roleEl.closest("button.slotHeader___K2BS_");
      if (slotHeader) {
        if (chance >= evaluation.upper) {
          slotHeader.style.backgroundColor = "#ca6f1e";
        } else if (chance >= evaluation.lower) {
          slotHeader.style.backgroundColor = "#239b56";
        } else {
          slotHeader.style.backgroundColor = "#a93226";
        }
      }
    });

    crimeData[ocId] = { id: ocId, title: crimeTitle, roles };
  }

  function setupMutationObserver(root) {
    const observer = new MutationObserver(() => {
      const tabTitle = document
        .querySelector("button.active___ImR61 span.tabName___DdwH3")
        ?.textContent.trim();

      if (tabTitle !== "Recruiting" && tabTitle !== "Planning") return;

      if (previousTab !== tabTitle) {
        crimeData = {};
        previousTab = tabTitle;
      }

      const allCrimes = document.querySelectorAll(".wrapper___U2Ap7");
      allCrimes.forEach((crimeNode) => {
        processCrime(crimeNode);
      });
    });

    observer.observe(root, { childList: true, subtree: true });
  }

  const factionId = getFactionId();
  const startUI = () => {
    waitForKeyElements("#faction-crimes-root", (root) => {
      setupMutationObserver(root);
    });
  };

  loadInfluenceFromApi(() => {
    if (factionId) {
      updateFactionRoleRestrictions(factionId, startUI);
    } else {
      console.log("[RoleRestrict] No faction id; using API/base influence only.");
      startUI();
    }
  });

  // Inserting dependency because Torn PDA can't handle @require
  // ==UserScript==
  // @version 1.3.0
  // @name waitForKeyElements.js (CoeJoder fork)
  // @description A utility function for userscripts that detects and handles AJAXed content.
  // @namespace https://github.com/CoeJoder/waitForKeyElements.js
  // @author CoeJoder
  // @homepage https://github.com/CoeJoder/waitForKeyElements.js
  // @source https://raw.githubusercontent.com/CoeJoder/waitForKeyElements.js/master/waitForKeyElements.js
  //
  // ==/UserScript==

  /**
   * A utility function for userscripts that detects and handles AJAXed content.
   *
   * @example
   * waitForKeyElements("div.comments", (element) => {
   *   element.innerHTML = "This text inserted by waitForKeyElements().";
   * });
   *
   * waitForKeyElements(() => {
   *   const iframe = document.querySelector('iframe');
   *   if (iframe) {
   *     const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
   *     return iframeDoc.querySelectorAll("div.comments");
   *   }
   *   return null;
   * }, callbackFunc);
   *
   * @param {(string|function)} selectorOrFunction - The selector string or function.
   * @param {function}          callback           - The callback function; takes a single DOM element as parameter.
   *                                                 If returns true, element will be processed again on subsequent iterations.
   * @param {boolean}           [waitOnce=true]    - Whether to stop after the first elements are found.
   * @param {number}            [interval=300]     - The time (ms) to wait between iterations.
   * @param {number}            [maxIntervals=-1]  - The max number of intervals to run (negative number for unlimited).
   */
  function waitForKeyElements(
    selectorOrFunction,
    callback,
    waitOnce,
    interval,
    maxIntervals
  ) {
    if (typeof waitOnce === "undefined") {
      waitOnce = true;
    }
    if (typeof interval === "undefined") {
      interval = 300;
    }
    if (typeof maxIntervals === "undefined") {
      maxIntervals = -1;
    }
    if (typeof waitForKeyElements.namespace === "undefined") {
      waitForKeyElements.namespace = Date.now().toString();
    }
    var targetNodes =
      typeof selectorOrFunction === "function"
        ? selectorOrFunction()
        : document.querySelectorAll(selectorOrFunction);

    var targetsFound = targetNodes && targetNodes.length > 0;
    if (targetsFound) {
      targetNodes.forEach(function (targetNode) {
        var attrAlreadyFound = `data-userscript-${waitForKeyElements.namespace}-alreadyFound`;
        var alreadyFound = targetNode.getAttribute(attrAlreadyFound) || false;
        if (!alreadyFound) {
          var cancelFound = callback(targetNode);
          if (cancelFound) {
            targetsFound = false;
          } else {
            targetNode.setAttribute(attrAlreadyFound, true);
          }
        }
      });
    }

    if (maxIntervals !== 0 && !(targetsFound && waitOnce)) {
      maxIntervals -= 1;
      setTimeout(function () {
        waitForKeyElements(
          selectorOrFunction,
          callback,
          waitOnce,
          interval,
          maxIntervals
        );
      }, interval);
    }
  }
})();