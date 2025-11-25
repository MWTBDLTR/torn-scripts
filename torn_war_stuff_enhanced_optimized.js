// ==UserScript==
// @name         Torn War Stuff Enhanced & Optimized
// @namespace    namespace
// @version      0.0.3
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
    const API_INTERVAL = 10000;
    const RENDER_INTERVAL = 1000;

    let apiKey = localStorage.getItem(STORAGE_KEY) ?? "###PDA-APIKEY###";
    const sort_enemies = true;

    // State
    let isRunning = true;
    let loopsStarted = false; // New flag to ensure we only start intervals once
    let lastApiRequest = 0;
    const memberStatusMap = new Map();
    const memberLiMap = new Map();

    let currentSortColumn = "";
    let currentSortOrder = "";
    let needsSort = false;

    // --- Menu Commands ---
    try {
        GM_registerMenuCommand("Set Api Key", () => checkApiKey(false));
    } catch (error) { }

    function checkApiKey(checkExisting = true) {
        if (!checkExisting || !apiKey || apiKey.includes("PDA-APIKEY") || apiKey.length !== 16) {
            const userInput = prompt("Please enter a PUBLIC Api Key:", apiKey ?? "");
            if (userInput && userInput.length === 16) {
                apiKey = userInput;
                localStorage.setItem(STORAGE_KEY, userInput);
            }
        }
    }

    // --- Styles ---
    // MODIFIED: Only hide text if the parent UL has the 'twse-loaded' class
    GM_addStyle(`
    .members-list li:has(div.status[data-twse-highlight="true"]) { background-color: #afa5 !important; }
    .members-list div.status[data-twse-traveling="true"]::after { color: #F287FF !important; }
    
    .members-list.twse-loaded div.status { position: relative !important; color: transparent !important; }
    
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
        const lists = getMemberLists();
        lists.forEach((ul) => {
            // Mark this list as loaded so our CSS kicks in
            ul.classList.add("twse-loaded");

            const lis = ul.querySelectorAll("LI.enemy, li.your");
            lis.forEach((li) => {
                const atag = li.querySelector(`A[href^='/profiles.php']`);
                if (atag) {
                    const id = atag.href.split("ID=")[1];
                    memberLiMap.set(id, li);
                }
            });
        });
        needsSort = true;
    }

    function detectSortState(memberList) {
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

    // --- Initialization ---

    function startEverything() {
        if (loopsStarted) return;

        console.log("[TWSE] Starting Loops");
        loopsStarted = true;
        extractAllMemberLis();

        // Render Loop
        setInterval(renderLoop, RENDER_INTERVAL);
        // Data Loop
        dataLoop();
    }

    // Initial Check (Fast load)
    setTimeout(() => {
        if (document.querySelector(".faction-war")) {
            console.log("[TWSE] War Detected on Load");
            startEverything();
        }
    }, 500);

    // Observer (Dynamic load)
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            // Check added nodes for the war banner
            for (const node of mutation.addedNodes) {
                if (node.classList && node.classList.contains("faction-war")) {
                    console.log("[TWSE] War Detected via Mutation");
                    startEverything();
                    return;
                }
            }
        }
    });

    observer.observe(document.body, { subtree: true, childList: true });

    // --- Data Logic ---
    async function dataLoop() {
        if (!isRunning) return;

        const now = Date.now();
        // Logic: If we are running, we fetch. 
        if (now - lastApiRequest >= API_INTERVAL) {
            lastApiRequest = now;
            const factionIds = getFactionIds();
            for (const fid of factionIds) {
                await updateFactionStatus(fid);
            }
            needsSort = true;
        }
        setTimeout(dataLoop, 1000);
    }

    async function updateFactionStatus(factionId) {
        try {
            const response = await fetch(
                `https://api.torn.com/faction/${factionId}?selections=basic&key=${apiKey}&comment=TornWarStuffEnhanced`
            );
            const data = await response.json();
            if (data.error) { handleApiError(data.error); return; }
            if (data.members) {
                for (const [k, v] of Object.entries(data.members)) {
                    v.status.description = v.status.description
                        .replace("South Africa", "SA")
                        .replace("Cayman Islands", "CI")
                        .replace("United Kingdom", "UK")
                        .replace("Argentina", "Arg")
                        .replace("Switzerland", "Switz");
                    memberStatusMap.set(k, v);
                }
            }
        } catch (err) { console.error("[TWSE] Fetch Error:", err); }
    }

    function handleApiError(error) {
        const fatalCodes = [0, 1, 2, 3, 4, 6, 7, 10, 12, 13, 14, 16, 18, 21];
        const retryCodes = [5, 8, 9];
        if (fatalCodes.includes(error.code)) {
            console.log("[TWSE] Fatal Error. Stopping.");
            isRunning = false;
        } else if (retryCodes.includes(error.code)) {
            lastApiRequest = Date.now() + 30000;
        }
    }

    // --- Render Logic ---
    function renderLoop() {
        // Safety check: ensure we have elements
        if (memberLiMap.size === 0) extractAllMemberLis();

        const nowSec = Date.now() / 1000;

        memberLiMap.forEach((li, id) => {
            const state = memberStatusMap.get(id);
            const statusDiv = li.querySelector("DIV.status");
            if (!statusDiv) return;

            // Fallback: If no API data yet, show current text
            if (!state) {
                if (!statusDiv.getAttribute(CONTENT)) {
                    statusDiv.setAttribute(CONTENT, statusDiv.innerText.trim() || "...");
                }
                return;
            }

            const status = state.status;
            li.setAttribute("data-until", status.until);
            li.setAttribute("data-location", "");

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
        if (el.getAttribute(attr) !== value) el.setAttribute(attr, value);
    }
    function pad(n) { return n < 10 ? "0" + n : n; }

    function handleTravelState(li, statusDiv, status) {
        if (!(statusDiv.classList.contains("traveling") || statusDiv.classList.contains("abroad"))) {
            updateStatusAttr(statusDiv, CONTENT, statusDiv.innerText);
            return;
        }
        let content = "";
        let sortWeight = "0";
        if (status.description.includes("Traveling to ")) {
            sortWeight = "4"; content = "► " + status.description.split("Traveling to ")[1];
        } else if (status.description.includes("In ")) {
            sortWeight = "3"; content = status.description.split("In ")[1];
        } else if (status.description.includes("Returning")) {
            sortWeight = "2"; content = "◄ " + status.description.split("Returning to Torn from ")[1];
        } else {
            sortWeight = "5"; content = "Traveling";
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
        const isTraveling = status.description.includes("In a") ? "true" : "false";
        updateStatusAttr(statusDiv, TRAVELING, isTraveling);

        const timeRemaining = Math.round(status.until - nowSec);
        if (timeRemaining <= 0) {
            updateStatusAttr(statusDiv, HIGHLIGHT, "false");
            updateStatusAttr(statusDiv, CONTENT, "00:00:00");
            return;
        }
        const s = Math.floor(timeRemaining % 60);
        const m = Math.floor((timeRemaining / 60) % 60);
        const h = Math.floor(timeRemaining / 3600);
        updateStatusAttr(statusDiv, CONTENT, `${pad(h)}:${pad(m)}:${pad(s)}`);
        updateStatusAttr(statusDiv, HIGHLIGHT, timeRemaining < 300 ? "true" : "false");
    }

    function processSorting() {
        const nodes = getMemberLists();
        if (nodes.length > 0) {
            const sortState = detectSortState(nodes[0]);
            if (sortState.column !== currentSortColumn || sortState.order !== currentSortOrder) {
                currentSortColumn = sortState.column;
                currentSortOrder = sortState.order;
                needsSort = true;
            }
        }
        if (!needsSort && currentSortColumn !== "status") return;
        if (!needsSort) return;

        nodes.forEach(ul => {
            let activeCol = currentSortColumn || "status";
            let activeOrder = currentSortOrder || "asc";
            if (activeCol !== "status") return;

            const lis = Array.from(ul.querySelectorAll("LI.enemy, li.your"));
            const sortedLis = lis.sort((a, b) => {
                let left = a; let right = b;
                if (activeOrder === "desc") { left = b; right = a; }
                const sortA = (parseInt(left.getAttribute("data-sortA")) || 0) - (parseInt(right.getAttribute("data-sortA")) || 0);
                if (sortA !== 0) return sortA;
                const leftLoc = left.getAttribute("data-location") || "";
                const rightLoc = right.getAttribute("data-location") || "";
                if (leftLoc && rightLoc) return leftLoc.localeCompare(rightLoc);
                return (parseInt(left.getAttribute("data-until")) || 0) - (parseInt(right.getAttribute("data-until")) || 0);
            });

            let isSorted = true;
            for (let i = 0; i < sortedLis.length; i++) {
                if (ul.children[i] !== sortedLis[i]) { isSorted = false; break; }
            }
            if (!isSorted) sortedLis.forEach(li => ul.appendChild(li));
        });
        needsSort = false;
    }

    console.log("[TWSE] Enhanced Optimized v3 Loaded");
    window.dispatchEvent(new Event("FFScouterV2DisableWarMonitor"));
})();