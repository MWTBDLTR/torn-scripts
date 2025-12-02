// ==UserScript==
// @name         Torn OC Role Restrictions
// @namespace    https://xentac.github.io
// @version      0.8
// @description  Highlight role restrictions and best roles in OC 2.0 (modified copy of "Torn OC Role Evaluator"). Well paired with https://greasyfork.org/en/scripts/526834-oc-success-chance-2-0.
// @author       underko[3362751], xentac[3354782], MrChurch[3654415]
// @match        https://www.torn.com/factions.php*
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// @connect      tornprobability.com
// @license      MIT
// ==/UserScript==

(function () {
    "use strict";

    // Set to true to enable logs for role/scenario validation and source tracking
    const DEBUG = true;

    let ocRoleInfluence = {
        "Pet Project": [
            { role: "Kidnapper", lower: 70 },
            { role: "Muscle", lower: 70 },
            { role: "Picklock", lower: 70 },
        ],
        "Mob Mentality": [
            { role: "Looter #1", lower: 70 },
            { role: "Looter #2", lower: 70 },
            { role: "Looter #3", lower: 60 },
            { role: "Looter #4", lower: 67 },
        ],
        "Cash Me if You Can": [
            { role: "Thief #1", lower: 70 },
            { role: "Thief #2", lower: 65 },
            { role: "Lookout", lower: 70 },
        ],
        "Best of the Lot": [
            { role: "Picklock", lower: 70 },
            { role: "Car Thief", lower: 70 },
            { role: "Muscle", lower: 75 },
            { role: "Imitator", lower: 60 },
        ],
        "Market Forces": [
            { role: "Enforcer", lower: 70 },
            { role: "Negotiator", lower: 70 },
            { role: "Lookout", lower: 68 },
            { role: "Arsonist", lower: 40 },
            { role: "Muscle", lower: 70 },
        ],
        "Smoke and Wing Mirrors": [
            { role: "Car Thief", lower: 74 },
            { role: "Imitator", lower: 70 },
            { role: "Hustler #1", lower: 60 },
            { role: "Hustler #2", lower: 65 },
        ],
        "Gaslight the Way": [
            { role: "Imitator #1", lower: 70 },
            { role: "Imitator #2", lower: 72 },
            { role: "Imitator #3", lower: 72 },
            { role: "Looter #1", lower: 60 },
            { role: "Looter #2", lower: 40 },
            { role: "Looter #3", lower: 65 },
        ],
        "Stage Fright": [
            { role: "Enforcer", lower: 70 },
            { role: "Muscle #1", lower: 72 },
            { role: "Muscle #2", lower: 50 },
            { role: "Muscle #3", lower: 70 },
            { role: "Lookout", lower: 60 },
            { role: "Sniper", lower: 75 },
        ],
        "Snow Blind": [
            { role: "Hustler", lower: 74 },
            { role: "Imitator", lower: 70 },
            { role: "Muscle #1", lower: 70 },
            { role: "Muscle #2", lower: 50 },
        ],
        "Leave No Trace": [
            { role: "Techie", lower: 60 },
            { role: "Negotiator", lower: 70 },
            { role: "Imitator", lower: 73 },
        ],
        "No Reserve": [
            { role: "Car Thief", lower: 67 },
            { role: "Techie", lower: 75 },
            { role: "Engineer", lower: 67 },
        ],
        "Counter Offer": [
            { role: "Robber", lower: 62 },
            { role: "Looter", lower: 42 },
            { role: "Hacker", lower: 60 },
            { role: "Picklock", lower: 60 },
            { role: "Engineer", lower: 62 },
        ],
        "Guardian Ángels": [
            { role: "Enforcer", lower: 60 },
            { role: "Hustler", lower: 73 },
            { role: "Engineer", lower: 70 },
        ],
        "Honey Trap": [
            { role: "Enforcer", lower: 60 },
            { role: "Muscle #1", lower: 70 },
            { role: "Muscle #2", lower: 75 },
        ],
        "Bidding War": [
            { role: "Robber #1", lower: 60 },
            { role: "Driver", lower: 70 },
            { role: "Robber #2", lower: 75 },
            { role: "Robber #3", lower: 70 },
            { role: "Bomber #1", lower: 70 },
            { role: "Bomber #2", lower: 63 },
        ],
        "Blast from the Past": [
            { role: "Picklock #1", lower: 70 },
            { role: "Hacker", lower: 65 },
            { role: "Engineer", lower: 75 },
            { role: "Bomber", lower: 70 },
            { role: "Muscle", lower: 75 },
            { role: "Picklock #2", lower: 40 },
        ],
        "Break the Bank": [
            { role: "Robber", lower: 63 },
            { role: "Muscle #1", lower: 63 },
            { role: "Muscle #2", lower: 60 },
            { role: "Thief #1", lower: 60 },
            { role: "Muscle #3", lower: 72 },
            { role: "Thief #2", lower: 72 },
        ],
        "Stacking the Deck": [
            { role: "Cat Burglar", lower: 75 },
            { role: "Driver", lower: 68 },
            { role: "Hacker", lower: 63 },
            { role: "Imitator", lower: 70 },
        ],
        "Clinical Precision": [
            { role: "Imitator", lower: 75 },
            { role: "Cat Burglar", lower: 70 },
            { role: "Assassin", lower: 60 },
            { role: "Cleaner", lower: 70 },
        ],
        "Ace in the Hole": [
            { role: "Imitator", lower: 65 },
            { role: "Muscle #1", lower: 65 },
            { role: "Muscle #2", lower: 72 },
            { role: "Hacker", lower: 75 },
            { role: "Driver", lower: 60 },
        ],
        "Sneaky Git Grab": [
            { role: "Imitator", lower: 60 },
            { role: "Pickpocket", lower: 75 },
            { role: "Hacker", lower: 66 },
            { role: "Techie", lower: 70 },
        ],
    };

    let crimeData = {};
    let previousTab = "none";
    let ocWeights = {};
    let supportedScenarios = [];
    let apiRoleNames = {};

    function normalizeKey(str) {
        return str.replace(/[\s#]/g, '');
    }

    // Called when API data arrives after page load
    function refreshCrimes() {
        crimeData = {}; // Clear the cache to allow re-processing
        const allCrimes = document.querySelectorAll(".wrapper___U2Ap7");
        allCrimes.forEach((crimeNode) => {
            processCrime(crimeNode);
        });
    }

    function fetchRoleWeights() {
        try {
            GM_xmlhttpRequest({
                method: "GET",
                url: "https://tornprobability.com:3000/api/GetRoleWeights",
                headers: { "Content-Type": "application/json" },
                onload: function (response) {
                    if (response.status === 200) {
                        try {
                            ocWeights = JSON.parse(response.responseText);
                            console.log("[OCRoleRestrictions] Loaded Role Weights from API:", ocWeights);
                            // Force UI update to override any defaults
                            refreshCrimes();
                        } catch (e) {
                            console.error("[OCRoleRestrictions] Error parsing weights from API:", e);
                        }
                    } else {
                        console.error("[OCRoleRestrictions] Failed to load weights from API, status:", response.status);
                    }
                },
                onerror: function (err) {
                    console.error("[OCRoleRestrictions] Network error fetching weights:", err);
                }
            });
        } catch (e) {
            console.error("[OCRoleRestrictions] GM_xmlhttpRequest failed:", e);
        }
    }

    function fetchSupportedScenarios() {
        try {
            GM_xmlhttpRequest({
                method: "GET",
                url: "https://tornprobability.com:3000/api/GetSupportedScenarios",
                headers: { "Content-Type": "application/json" },
                onload: function (response) {
                    if (response.status === 200) {
                        try {
                            supportedScenarios = JSON.parse(response.responseText);
                            console.log("[OCRoleRestrictions] Loaded Supported Scenarios from API:", supportedScenarios);
                            // Trigger refresh to apply scenario filtering if data arrives late
                            refreshCrimes();
                        } catch (e) {
                            console.error("[OCRoleRestrictions] Error parsing supported scenarios from API:", e);
                        }
                    } else {
                        console.error("[OCRoleRestrictions] Failed to load supported scenarios from API, status:", response.status);
                    }
                },
                onerror: function (err) {
                    console.error("[OCRoleRestrictions] Network error fetching supported scenarios:", err);
                }
            });
        } catch (e) {
            console.error("[OCRoleRestrictions] GM_xmlhttpRequest failed for scenarios:", e);
        }
    }

    function fetchRoleNames() {
        try {
            GM_xmlhttpRequest({
                method: "GET",
                url: "https://tornprobability.com:3000/api/GetRoleNames",
                headers: { "Content-Type": "application/json" },
                onload: function (response) {
                    if (response.status === 200) {
                        try {
                            apiRoleNames = JSON.parse(response.responseText);
                            console.log("[OCRoleRestrictions] Loaded Role Names from API:", apiRoleNames);
                            // Trigger refresh to apply role filtering if data arrives late
                            refreshCrimes();
                        } catch (e) {
                            console.error("[OCRoleRestrictions] Error parsing role names from API:", e);
                        }
                    } else {
                        console.error("[OCRoleRestrictions] Failed to load role names from API, status:", response.status);
                    }
                },
                onerror: function (err) {
                    console.error("[OCRoleRestrictions] Network error fetching role names:", err);
                }
            });
        } catch (e) {
            console.error("[OCRoleRestrictions] GM_xmlhttpRequest failed for role names:", e);
        }
    }

    // Calc suggested lower bound based on weight using Piecewise Linear Interpolation - There could be a better algorithm for this?
    // Agrees with community values (Looter @ Wt7 -> 42%, Looter4 @ Wt21 -> 67%, Max @ Wt50 -> 75%)
    // These "feelgoods" align with values we get from this algo, so maybe it's fine.
    function getLowerFromWeight(weight) {
        let val;
        if (weight < 8) {
            // Low impact (0 to 8 weight -> 40% - 42%)
            val = 40 + (weight * 0.25);
        } else if (weight < 20) {
            // Medium-high impact (8 to 20 weight -> 60% - 67%)
            val = 60 + ((weight - 8) * 0.6);
        } else if (weight < 40) {
            // High impact (20 to 40 weight -> 67% to 75%)
            val = 67 + ((weight - 20) * 0.4);
        } else {
            // Diminishing returns (40+ weight -> 75%+)
            // Soft cap that creeps up slowly
            val = 75 + ((weight - 40) * 0.1);
        }
        return Math.round(val);
    }

    function classifyOcRoleInfluence(ocName, roleName) {
        // Try API weights first
        const cleanOcName = normalizeKey(ocName);
        const cleanRoleName = normalizeKey(roleName);

        if (ocWeights[cleanOcName] && ocWeights[cleanOcName][cleanRoleName] !== undefined) {
            const weight = ocWeights[cleanOcName][cleanRoleName];
            const lower = getLowerFromWeight(weight);
            return { lower: lower, upper: lower + 10, source: "API (Calculated)" };
        }

        // Fallback to defaults if no weight found
        const ocInfo = ocRoleInfluence[ocName];
        const roleData = ocInfo?.find((r) => r.role === roleName);
        const lower = roleData ? roleData.lower : 70;
        let upper = lower + 10;
        let source = roleData ? "Hardcoded Default" : "Generic Fallback";

        if (ocInfo) {
            const roleLowers = ocInfo
                .map((role) => {
                    return role.lower;
                })
                .sort();

            // If our role is a low influence role, set the upper bound to the next highest lower bound if upper doesn't already pass it
            if (roleLowers[0] == lower && upper < roleLowers[1]) {
                upper = roleLowers[1];
            }
        }

        return { lower, upper, source };
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
            console.error("[OCRoleRestrictions] Couldn't extract faction id:", e);
        }

        return factionId;
    }

    function updateFactionRoleRestrictions(factionId, cb) {
        try {
            GM_xmlhttpRequest({
                method: "GET",
                url: `https://raw.githubusercontent.com/xentac/oc_role_restrictions/refs/heads/main/${factionId}.json`,
                headers: {
                    "Content-Type": "application/json",
                },
                onload: async function (response) {
                    console.log(response);
                    if (response.status != 200) {
                        console.error(
                            "[OCRoleRestrictions] Bad response fetching faction restrictions:",
                            response.status,
                        );
                        return cb();
                    }

                    try {
                        const result = JSON.parse(response.responseText);
                        ocRoleInfluence = result;
                    } catch (error) {
                        console.error(
                            "[OCRoleRestrictions] Failed to parse faction restrictions:",
                            error.message,
                        );
                    }
                    return cb();
                },
            });
        } catch (error) {
            console.error(
                "[OCRoleRestrictions] Failed fetching faction restrictions:",
                error.message,
            );
        }
    }

    function processCrime(wrapper) {
        const ocId = wrapper.getAttribute("data-oc-id");
        // Ensure we process if the cache is empty or if we are forcing an update
        if (!ocId || crimeData[ocId]) return;

        const titleEl = wrapper.querySelector("p.panelTitle___aoGuV");
        if (!titleEl) return;

        const crimeTitle = titleEl.textContent.trim();

        // Verify if the scenario is supported by our API to prevent script breakage on new Torn updates.
        // If API data is loaded and this scenario isn't in it, skip processing.
        if (supportedScenarios.length > 0) {
            const isSupported = supportedScenarios.some(s => s.name === crimeTitle);
            if (!isSupported) {
                if (DEBUG) {
                    console.log(`[OCRoleRestrictions] Ignoring unsupported scenario: ${crimeTitle}`);
                }
                return;
            }
        }

        const roles = [];

        const roleEls = wrapper.querySelectorAll(".title___UqFNy");
        roleEls.forEach((roleEl) => {
            const roleName = roleEl.textContent.trim();

            // Verify if the role is supported for this scenario by our API.
            // If API data is loaded, check if this role exists in the known configuration for this crime.
            if (Object.keys(apiRoleNames).length > 0) {
                const knownRoles = apiRoleNames[crimeTitle];
                // Check if we have role definitions for this crime.
                // We normalize both the API roles and the website roles (removing spaces and #) to ensure "Looter #1" matches "Looter 1"
                if (knownRoles) {
                    const normalizedKnownRoles = Object.values(knownRoles).map(r => normalizeKey(r));
                    const normalizedRoleName = normalizeKey(roleName);

                    if (!normalizedKnownRoles.includes(normalizedRoleName)) {
                        if (DEBUG) {
                            console.log(`[OCRoleRestrictions] Ignoring unsupported role: ${roleName} in scenario: ${crimeTitle}`);
                        }
                        return;
                    }
                }
            }

            const successEl = roleEl.nextElementSibling;
            const chance = successEl
                ? parseInt(successEl.textContent.trim(), 10)
                : null;

            // Note: classifyOcRoleInfluence now prefers the API weights if available
            const evaluation =
                chance !== null
                    ? classifyOcRoleInfluence(crimeTitle, roleName)
                    : { lower: 70, upper: 80, source: "None (No Chance Data)" };

            // Log the source of the passrate used in debug mode
            if (DEBUG) {
                console.log(`[OCRoleRestrictions] ${crimeTitle} - ${roleName}: Using ${evaluation.source}`);
            }

            roles.push({ role: roleName, chance, evaluation });

            if (successEl && evaluation.lower) {
                successEl.textContent = `${chance}/${evaluation.lower}`;
            }

            const slotHeader = roleEl.closest("button.slotHeader___K2BS_");
            if (slotHeader) {
                if (chance >= evaluation.upper) {
                    //slotHeader.style.backgroundColor = "#ca6f1e";
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

    fetchRoleWeights(); // Start fetching weights immediately
    fetchSupportedScenarios(); // Fetch supported scenarios
    fetchRoleNames(); // Fetch role names

    const factionId = getFactionId();
    const cb = () => {
        waitForKeyElements("#faction-crimes-root", (root) => {
            setupMutationObserver(root);
        });
    };
    if (factionId) {
        updateFactionRoleRestrictions(factionId, cb);
    } else {
        console.log(
            "[OCRoleRestrictions] Couldn't find faction id, going with defaults.",
        );
        cb();
    }

    // Inserting dependency because Torn PDA can't handle @require
    // -- @version 1.3.0
    // -- @name waitForKeyElements.js (CoeJoder fork)
    // -- @description A utility function for userscripts that detects and handles AJAXed content.
    // -- @namespace https://github.com/CoeJoder/waitForKeyElements.js
    // -- @author CoeJoder
    // -- @homepage https://github.com/CoeJoder/waitForKeyElements.js
    // -- @source https://raw.githubusercontent.com/CoeJoder/waitForKeyElements.js/master/waitForKeyElements.js

    function waitForKeyElements(
        selectorOrFunction,
        callback,
        waitOnce,
        interval,
        maxIntervals,
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
                    maxIntervals,
                );
            }, interval);
        }
    }
})();
