// ==UserScript==
// @name         Torn War Stuff Enhanced & Optimized
// @namespace    namespace
// @version      0.0.2
// @description  Show travel status and hospital time and sort by hospital time on war page. Fork of xentac's fork of https://greasyfork.org/en/scripts/448681-torn-war-stuff
// @author       MrChurch [3654415] + xentac (original TWSE)
// @license      MIT
// @match        https://www.torn.com/factions.php*
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      api.torn.com
// ==/UserScript==

(async function () {
    ("use strict");

    // Prevent duplicate execution
    if (document.getElementById("FFScouterV2DisableWarMonitor")) return;

    const ffScouterV2DisableWarMonitor = document.createElement("div");
    ffScouterV2DisableWarMonitor.id = "FFScouterV2DisableWarMonitor";
    ffScouterV2DisableWarMonitor.style.display = "none";
    document.documentElement.appendChild(ffScouterV2DisableWarMonitor);

    // --- Constants & Config ---
    const STORAGE_KEY = "xentac-torn_war_stuff_enhanced-apikey";
    const CONTENT = "data-twse-content";
    const TRAVELING = "data-twse-traveling";
    const HIGHLIGHT = "data-twse-highlight";
    const API_INTERVAL = 10000; // 10 seconds (Safe for API limits)
    const RENDER_INTERVAL = 1000; // 1 second (Updates timers)

    let apiKey = localStorage.getItem(STORAGE_KEY) ?? "###PDA-APIKEY###";
    const sort_enemies = true;

    // State tracking
    let isRunning = true;
    let foundWar = false;
    let lastApiRequest = 0;
    const memberStatusMap = new Map();
    const memberLiMap = new Map();

    // Sort tracking to avoid DOM thrashing
    let currentSortColumn = "";
    let currentSortOrder = "";
    let needsSort = false;

    // --- Menu Commands ---
    try {
        GM_registerMenuCommand("Set Api Key", () => checkApiKey(false));
    } catch (error) { /* Handled */ }

    function checkApiKey(checkExisting = true) {
        if (!checkExisting || !apiKey || apiKey.includes("PDA-APIKEY") || apiKey.length !== 16) {
            const userInput = prompt("Please enter a PUBLIC Api Key:", apiKey ?? "");
            if (userInput && userInput.length === 16) {
                apiKey = userInput;
                localStorage.setItem(STORAGE_KEY, userInput);
            } else {
                console.error("[TWSE] User cancelled Api Key input.");
            }
        }
    }

    // --- Styles ---
    GM_addStyle(`
    .members-list li:has(div.status[data-twse-highlight="true"]) { background-color: #afa5 !important; }
    .members-list div.status[data-twse-traveling="true"]::after { color: #F287FF !important; }
    .members-list div.status { position: relative !important; color: transparent !important; }
    .members-list div.status::after {
      content: attr(data-twse-content);
      position: absolute; top: 0; left: 0;
      width: calc(100% - 10px); height: 100%;
      background: inherit; display: flex; right: 10px;
      justify-content: flex-end; align-items: center;
    }
    .members-list .ok.status::after { color: var(--user-status-green-color); }
    .members-list .not-ok.status::after { color: var(--user-status-red-color); }
    .members-list .abroad.status::after, .members-list .traveling.status::after { color: var(--user-status-blue-color); }
  `);

    // --- DOM Helpers ---
    function getMemberLists() {
        return document.querySelectorAll("ul.members-list");
    }

    function getFactionIds() {
        const nodes = getMemberLists();
        const ids = [];
        nodes.forEach((elem) => {
            const link = elem.querySelector(`A[href^='/factions.php']`);
            if (link) {
                const id = link.href.split("ID=")[1];
                if (id) ids.push(id);
            }
        });
        return ids;
    }

    function extractAllMemberLis() {
        memberLiMap.clear();
        getMemberLists().forEach((ul) => {
            const lis = ul.querySelectorAll("LI.enemy, li.your");
            lis.forEach((li) => {
                const atag = li.querySelector(`A[href^='/profiles.php']`);
                if (atag) {
                    const id = atag.href.split("ID=")[1];
                    memberLiMap.set(id, li);
                }
            });
        });
        // When we rescan the DOM, we should trigger a re-sort attempt
        needsSort = true;
    }

    function detectSortState(memberList) {
        // Check the header icons to see what Torn thinks is sorted
        const parent = memberList.parentNode;
        if (!parent) return { column: null, order: null };

        const cols = ["member", "level", "points", "status"];

        for (const col of cols) {
            const div = parent.querySelector(`div.${col} div`);
            if (div && div.className.match(/activeIcon__/)) {
                const order = div.className.match(/asc__/) ? "asc" : "desc";
                return { column: col, order: order };
            }
        }
        return { column: null, order: null };
    }

    // --- Initialization & Observers ---

    // Initial Check
    setTimeout(() => {
        if (document.querySelector(".faction-war")) {
            console.log("[TWSE] War Detected on Load");
            foundWar = true;
            extractAllMemberLis();
            startLoops();
        }
    }, 500);

    // Observer for dynamic navigation
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.classList && node.classList.contains("faction-war")) {
                    console.log("[TWSE] War Detected via Mutation");
                    foundWar = true;
                    extractAllMemberLis();
                    // If loops aren't running, start them could go here, 
                    // but current logic relies on flags
                }
            }
        }
    });

    const wrapper = document.body;
    observer.observe(wrapper, { subtree: true, childList: true });

    function startLoops() {
        // Render Loop (Visuals) - Runs every 1s
        setInterval(renderLoop, RENDER_INTERVAL);

        // Data Loop (API) - Runs based on timeout logic
        dataLoop();
    }

    // --- Data Logic (API) ---
    async function dataLoop() {
        if (!isRunning) return;

        const now = Date.now();
        if (foundWar && (now - lastApiRequest >= API_INTERVAL)) {
            lastApiRequest = now;
            const factionIds = getFactionIds();

            // Fetch data for all visible factions
            for (const fid of factionIds) {
                await updateFactionStatus(fid);
            }
            // After data update, we likely need to re-sort
            needsSort = true;
        }

        // Schedule next run
        setTimeout(dataLoop, 1000); // Check every second if we are allowed to run
    }

    async function updateFactionStatus(factionId) {
        try {
            const response = await fetch(
                `https://api.torn.com/faction/${factionId}?selections=basic&key=${apiKey}&comment=TornWarStuffEnhanced`
            );
            const data = await response.json();

            if (data.error) {
                handleApiError(data.error);
                return;
            }

            if (data.members) {
                for (const [k, v] of Object.entries(data.members)) {
                    // Shorten country names for UI space
                    v.status.description = v.status.description
                        .replace("South Africa", "SA")
                        .replace("Cayman Islands", "CI")
                        .replace("United Kingdom", "UK")
                        .replace("Argentina", "Arg")
                        .replace("Switzerland", "Switz");
                    memberStatusMap.set(k, v);
                }
            }
        } catch (err) {
            console.error("[TWSE] Fetch Error:", err);
        }
    }

    function handleApiError(error) {
        console.log("[TWSE] API Error:", error);
        const fatalCodes = [0, 1, 2, 3, 4, 6, 7, 10, 12, 13, 14, 16, 18, 21];
        const retryCodes = [5, 8, 9]; // Limits or temp blocks

        if (fatalCodes.includes(error.code)) {
            console.log("[TWSE] Fatal Error. Stopping.");
            isRunning = false;
        } else if (retryCodes.includes(error.code)) {
            console.log("[TWSE] Rate limit/Temp block. Backing off.");
            lastApiRequest = Date.now() + 30000; // Add 30s penalty
        }
    }

    // --- Render Logic (Visuals) ---
    function renderLoop() {
        if (!foundWar) return;

        const nowSec = Date.now() / 1000; // Timestamp in seconds for comparisons

        memberLiMap.forEach((li, id) => {
            const state = memberStatusMap.get(id);
            const statusDiv = li.querySelector("DIV.status");

            if (!statusDiv) return;

            // Fallback if no API data yet
            if (!state) {
                if (!statusDiv.hasAttribute(CONTENT)) {
                    statusDiv.setAttribute(CONTENT, statusDiv.innerText);
                }
                return;
            }

            const status = state.status;
            li.setAttribute("data-until", status.until);
            li.setAttribute("data-location", "");

            // Process State
            switch (status.state) {
                case "Abroad":
                case "Traveling":
                    handleTravelState(li, statusDiv, status);
                    break;

                case "Hospital":
                case "Jail":
                    handleHospitalState(li, statusDiv, status, nowSec);
                    break;

                default:
                    // OK / Normal
                    updateStatusAttr(statusDiv, CONTENT, statusDiv.innerText);
                    li.setAttribute("data-sortA", "0");
                    updateStatusAttr(statusDiv, TRAVELING, "false");
                    updateStatusAttr(statusDiv, HIGHLIGHT, "false");
                    break;
            }
        });

        if (sort_enemies) processSorting();
    }

    function updateStatusAttr(el, attr, value) {
        if (el.getAttribute(attr) !== value) {
            el.setAttribute(attr, value);
        }
    }

    function pad(n) { return n < 10 ? "0" + n : n; }

    function handleTravelState(li, statusDiv, status) {
        // Preserve native class colors if needed, or override
        if (!(statusDiv.classList.contains("traveling") || statusDiv.classList.contains("abroad"))) {
            updateStatusAttr(statusDiv, CONTENT, statusDiv.innerText);
            return;
        }

        let content = "";
        let sortWeight = "0";

        if (status.description.includes("Traveling to ")) {
            sortWeight = "4";
            content = "► " + status.description.split("Traveling to ")[1];
        } else if (status.description.includes("In ")) {
            sortWeight = "3";
            content = status.description.split("In ")[1];
        } else if (status.description.includes("Returning")) {
            sortWeight = "2";
            content = "◄ " + status.description.split("Returning to Torn from ")[1];
        } else {
            sortWeight = "5";
            content = "Traveling";
        }

        li.setAttribute("data-sortA", sortWeight);
        li.setAttribute("data-location", content);
        updateStatusAttr(statusDiv, CONTENT, content);
    }

    function handleHospitalState(li, statusDiv, status, nowSec) {
        if (!(statusDiv.classList.contains("hospital") || statusDiv.classList.contains("jail"))) {
            updateStatusAttr(statusDiv, CONTENT, statusDiv.innerText);
            updateStatusAttr(statusDiv, TRAVELING, "false");
            updateStatusAttr(statusDiv, HIGHLIGHT, "false");
            return;
        }

        li.setAttribute("data-sortA", "1");

        // Check "In a Federal Jail" vs standard
        const isTraveling = status.description.includes("In a") ? "true" : "false";
        updateStatusAttr(statusDiv, TRAVELING, isTraveling);

        const timeRemaining = Math.round(status.until - nowSec);

        if (timeRemaining <= 0) {
            updateStatusAttr(statusDiv, HIGHLIGHT, "false");
            updateStatusAttr(statusDiv, CONTENT, "00:00:00"); // Show zeroed out
            return;
        }

        const s = Math.floor(timeRemaining % 60);
        const m = Math.floor((timeRemaining / 60) % 60);
        const h = Math.floor(timeRemaining / 3600);
        const timeString = `${pad(h)}:${pad(m)}:${pad(s)}`;

        updateStatusAttr(statusDiv, CONTENT, timeString);

        // Highlight if under 5 minutes (300s)
        const highlight = timeRemaining < 300 ? "true" : "false";
        updateStatusAttr(statusDiv, HIGHLIGHT, highlight);
    }

    // --- Sorting Logic ---
    function processSorting() {
        const nodes = getMemberLists();

        // Check if user changed sort column since last frame
        // We assume the first faction list represents the sort state of the page
        if (nodes.length > 0) {
            const sortState = detectSortState(nodes[0]);
            if (sortState.column !== currentSortColumn || sortState.order !== currentSortOrder) {
                currentSortColumn = sortState.column;
                currentSortOrder = sortState.order;
                needsSort = true;
            }
        }

        // If nothing changed (data or user intent), skip sorting
        // This saves massive CPU by not detaching/appending nodes every frame
        if (!needsSort && currentSortColumn !== "status") return;
        // If currentSortColumn IS status, we might need to re-sort as timers change, 
        // but generally, sorting by 'sortA' (category) is stable. 
        // To be perfectly efficient, we only strict sort if 'needsSort' is true.

        if (!needsSort) return;

        nodes.forEach(ul => {
            // Force override to Status sort if the user hasn't explicitly picked another column
            // (This replicates original script behavior, though it can be aggressive)
            let activeCol = currentSortColumn;
            let activeOrder = currentSortOrder;

            // If the user hasn't clicked a column yet, default to Status Ascending
            if (!activeCol) {
                activeCol = "status";
                activeOrder = "asc";
            }

            // We only intervene if sorting by status
            if (activeCol !== "status") return;

            const lis = Array.from(ul.querySelectorAll("LI.enemy, li.your"));
            const sortedLis = lis.sort((a, b) => {
                let left = a;
                let right = b;

                if (activeOrder === "desc") {
                    left = b; right = a;
                }

                // 1. Sort by Category (Hospital, Returning, In Country, Outbound, Traveling)
                const sortA = (parseInt(left.getAttribute("data-sortA")) || 0) - (parseInt(right.getAttribute("data-sortA")) || 0);
                if (sortA !== 0) return sortA;

                // 2. Sort by Location Name
                const leftLoc = left.getAttribute("data-location") || "";
                const rightLoc = right.getAttribute("data-location") || "";
                if (leftLoc && rightLoc) {
                    return leftLoc.localeCompare(rightLoc);
                }

                // 3. Sort by Time Remaining
                const leftUntil = parseInt(left.getAttribute("data-until")) || 0;
                const rightUntil = parseInt(right.getAttribute("data-until")) || 0;
                return leftUntil - rightUntil;
            });

            // DOM check: Only append if order is actually different
            let isSorted = true;
            for (let i = 0; i < sortedLis.length; i++) {
                if (ul.children[i] !== sortedLis[i]) {
                    isSorted = false;
                    break;
                }
            }

            if (!isSorted) {
                sortedLis.forEach(li => ul.appendChild(li));
            }
        });

        needsSort = false; // Reset flag
    }

    console.log("[TWSE] Enhanced Optimized Loaded");

    window.dispatchEvent(new Event("FFScouterV2DisableWarMonitor"));
})();