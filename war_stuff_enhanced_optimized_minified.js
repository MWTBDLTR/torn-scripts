// ==UserScript==
// @name         Torn War Stuff Enhanced & Optimized
// @namespace    https://github.com/MWTBDLTR/torn-scripts
// @version      5.5.0
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

    const CFG = { WS: true, START_DELAY: 3000, RESYNC: 3000, STALE: 15000, UNTIL_MAX: 4294967295, FRAME_MS: 250 };
    let DEBUG = GM_getValue("twseo_debug_mode", false);
    let LOG_STATUS = GM_getValue("twseo_log_status", false);
    let SORT_SCORE = GM_getValue("twseo_sort_okay_score", false);

    console.log(`[TWSEO] v5.5.0 | Debug: ${DEBUG}`);

    const toggle = (k, v, n) => { GM_setValue(k, !v); alert(`${n}: ${!v ? "ON" : "OFF"}`); location.reload(); };
    GM_registerMenuCommand("Set API Key", promptSetKey);
    GM_registerMenuCommand("Clear API Key", () => { localStorage.removeItem("twseo_merged_apikey"); apiKey = "###PDA-APIKEY###"; });
    GM_registerMenuCommand("Toggle Sort Okay by Score", () => toggle("twseo_sort_okay_score", SORT_SCORE, "Sort Score"));
    GM_registerMenuCommand("Toggle Status Logs", () => { LOG_STATUS = !LOG_STATUS; GM_setValue("twseo_log_status", LOG_STATUS); alert(`Logs: ${LOG_STATUS}`); });
    GM_registerMenuCommand("Toggle Debug Mode", () => toggle("twseo_debug_mode", DEBUG, "Debug"));

    const log = (...a) => DEBUG && console.log("[TWSEO-DBG]", ...a);
    const logStatus = (m) => LOG_STATUS && console.log(`[TWSEO] ${m}`);

    const CMAP = { "South Africa": "SA", "Cayman Islands": "CI", "United Kingdom": "UK", "Argentina": "Arg", "Switzerland": "Switz" };
    const CRX = new RegExp(Object.keys(CMAP).join("|"), "g");
    const abbr = (s) => s?.replace(CRX, m => CMAP[m]) ?? "";
    const getColor = (s) => ["Hospital", "Jail", "Federal", "Fallen"].includes(s) ? "red" : ["Traveling", "Abroad"].includes(s) ? "blue" : "green";

    const scoreCache = new Map();
    const getScore = (li, id) => {
        if (scoreCache.has(id)) return scoreCache.get(id);
        const txt = li.querySelector(".points")?.textContent || li.querySelector(".level")?.textContent || "";
        const val = parseInt(txt.replace(/\D/g, ""), 10) || 0;
        if (val > 0) scoreCache.set(id, val);
        return val;
    };

    if (!document.querySelector("#FFScouterV2DisableWarMonitor")) {
        const el = document.createElement("div"); el.id = "FFScouterV2DisableWarMonitor"; el.style.display = "none";
        document.documentElement.appendChild(el); window.dispatchEvent(new Event("FFScouterV2DisableWarMonitor"));
    }

    const LS_KEY = "twseo_merged_apikey";
    let apiKey = localStorage.getItem(LS_KEY) ?? "###PDA-APIKEY###";
    const hasKey = () => apiKey.length === 16 && !apiKey.includes("PDA");

    function promptSetKey() {
        const k = prompt("Enter Public API key:", hasKey() ? apiKey : "");
        if (k?.trim().length === 16) { apiKey = k.trim(); localStorage.setItem(LS_KEY, apiKey); running = true; backoffMs = 0; }
    }

    const ATTRS = { CONT: "data-twseo-content", TRAV: "data-twseo-traveling", HL: "data-twseo-highlight", COL: "data-twseo-color" };
    const HAS_HAS = CSS.supports?.("selector(:has(*))") ?? false;

    GM_addStyle(`.members-list li.twseo-highlight{background-color:#afa5 !important}.members-list li:has(div.status[${ATTRS.HL}="true"]){background-color:#afa5 !important}.members-list div.status{position:relative !important}.members-list div.status[${ATTRS.CONT}]{color:transparent !important}.members-list div.status[${ATTRS.CONT}]::after{content:attr(${ATTRS.CONT});position:absolute;top:0;right:10px;width:auto;max-width:90px;height:100%;background:inherit;display:flex;justify-content:flex-end;align-items:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.members-list div.status[${ATTRS.COL}="green"]::after{color:var(--user-status-green-color)!important}.members-list div.status[${ATTRS.COL}="red"]::after{color:var(--user-status-red-color)!important}.members-list div.status[${ATTRS.COL}="blue"]::after{color:var(--user-status-blue-color)!important}.members-list div.status[${ATTRS.TRAV}="true"]::after{color:#F287FF !important}@keyframes twseo-flash{0%{box-shadow:inset 0 0 0px gold}50%{box-shadow:inset 0 0 10px gold}100%{box-shadow:inset 0 0 0px gold}}.twseo-ws-updated{animation:twseo-flash 1s ease-out}#twseo-debug-indicator{position:fixed;top:0;right:0;background:orange;color:black;font-weight:bold;padding:2px 5px;z-index:999999;font-size:10px;pointer-events:none;opacity:0.8}`);

    if (DEBUG) document.body.insertAdjacentHTML('beforeend', '<div id="twseo-debug-indicator">TWSEO DEBUG</div>');

    const sort_enemies = true;
    let ever_sorted = false, running = true, found_war = false, warRoot = null;
    const member_status = new Map(), member_lis = new Map();
    let memberListsCache = [];

    let socket, subFactions = new Set(), msgId = 1, wsTimer = null;
    const WS_URL = "wss://ws-centrifugo.torn.com/connection/websocket";

    const wsConn = () => {
        if (!CFG.WS || (socket && [0, 1].includes(socket.readyState))) return;
        const t = (() => { try { return JSON.parse(document.getElementById('websocketConnectionData').innerText).token; } catch { return null; } })();
        if (!t) return;
        socket = new WebSocket(WS_URL);
        socket.onopen = () => socket.send(JSON.stringify({ connect: { token: t, name: "js" }, id: msgId++ }));
        socket.onmessage = (e) => e.data.split('\n').forEach(l => {
            const line = l.trim();
            if (!line) return;
            if (line === '{}') return socket.send('{}');
            try {
                const d = JSON.parse(line);
                if (d.connect) return subTo(getFIDs());
                const acts = d.push?.pub?.data?.message?.namespaces?.users?.actions;
                if (acts?.updateStatus) procWS(acts.updateStatus);
            } catch (err) { if (DEBUG) console.error(err); }
        });
        socket.onclose = () => { subFactions.clear(); setTimeout(wsConn, 5000); };
    };

    const subTo = (ids) => {
        if (!socket || socket.readyState !== 1) return;
        ids.forEach(id => {
            if (!subFactions.has(id)) {
                socket.send(JSON.stringify({ subscribe: { channel: `faction-users-${id}` }, id: msgId++ }));
                subFactions.add(id);
            }
        });
    };

    const procWS = (data) => {
        const updates = Array.isArray(data) ? data : [data];
        let render = false;
        updates.forEach(u => {
            if (!u.userId || !u.status) return;
            const uid = String(u.userId), s = u.status, cur = member_status.get(uid) || { status: {} };
            const nState = s.text || "Okay", nDesc = nState + " (WS)";
            const nUntil = s.okay ? 0 : CFG.UNTIL_MAX;
            if (cur.status.state !== nState || Math.abs(nUntil - (cur.status.until || 0)) > 5) {
                logStatus(`Stat: [${uid}] ${nState}`);
                cur.status = { state: nState, description: nDesc, until: nUntil, color: s.color || getColor(nState), updated: Date.now(), freshOkay: !!s.okay };
                member_status.set(uid, cur);
                const li = member_lis.get(uid);
                if (li) { li.classList.remove('twseo-ws-updated'); void li.offsetWidth; li.classList.add('twseo-ws-updated'); }
                render = true;
            }
        });
        if (render) { last_frame = 0; requestAnimationFrame(watch); }
    };

    const liSDiv = new WeakMap();
    const getSDiv = (li) => {
        let d = liSDiv.get(li);
        if (!d || !d.isConnected) { d = li.querySelector("div.status"); if (d) liSDiv.set(li, d); }
        return d;
    };
    const safeSet = (el, k, v) => { if (el && el.getAttribute(k) !== String(v)) el.setAttribute(k, String(v)); };
    const safeRem = (el, k) => { if (el?.hasAttribute(k)) el.removeAttribute(k); };
    const pad = (n) => n < 10 ? "0" + n : n;

    function onWarGone() { found_war = false; warRoot = null; member_lis.clear(); memberListsCache = []; window.dispatchEvent(new Event("twseo-war-gone")); }
    function onWarFound() {
        if (found_war) return;
        found_war = true;
        warRoot = document.querySelector(".faction-war") || (document.querySelector("ul.members-list") ? document : null);
        if (!warRoot) return found_war = false;
        log("Target List Found.");
        extractLIs(); prime();
        if (CFG.WS) { clearTimeout(wsTimer); wsTimer = setTimeout(() => !socket || socket.readyState !== 1 ? wsConn() : subTo(getFIDs()), CFG.START_DELAY); }
        window.dispatchEvent(new Event("twseo-war-found"));
    }

    const getLists = () => {
        if (memberListsCache.length === 0 || (warRoot && warRoot !== document && !warRoot.isConnected)) {
            if (warRoot && !warRoot.isConnected) onWarGone();
            warRoot = document.querySelector(".faction-war") || document;
            memberListsCache = Array.from((warRoot.nodeType === 9 ? document : warRoot).querySelectorAll("ul.members-list"));
        }
        return memberListsCache;
    };

    const getFIDs = () => {
        const ids = new Set();
        getLists().forEach(e => {
            const h = e.querySelector(`a[href^="/factions.php"]`)?.href;
            const id = h ? (new URL(h, location.origin).searchParams.get("ID") || h.split("ID=")[1]?.split("&")[0]) : null;
            if (id) ids.add(id);
        });
        if (!ids.size) { const id = new URLSearchParams(window.location.search).get("ID"); if (id) ids.add(id); }
        return [...ids];
    };

    function extractLIs() {
        member_lis.clear(); memberListsCache = [];
        const sel = document.querySelector(".faction-war") ? "li.enemy, li.your" : "li";
        getLists().forEach(ul => ul.querySelectorAll(sel).forEach(li => {
            const id = new URL(li.querySelector(`a[href^="/profiles.php"]`)?.href || "", location.origin).searchParams.get("XID");
            if (id) { member_lis.set(id, li); li.dataset.twseoId = id; }
        }));
    }

    const prime = () => (warRoot || document).querySelectorAll(".members-list div.status:not([" + ATTRS.CONT + "])").forEach(e => e.setAttribute(ATTRS.CONT, e.textContent));

    let refPend = false;
    const obs = new MutationObserver((muts) => {
        for (const m of muts) {
            for (const n of m.addedNodes) if (n?.classList?.contains?.("faction-war") || n?.matches?.("ul.members-list")) { onWarFound(); schedRef(); return; }
            for (const n of m.removedNodes) if (n?.matches?.(".faction-war")) onWarGone();
        }
    });
    const schedRef = () => { if (!refPend) { refPend = true; setTimeout(() => { refPend = false; memberListsCache = []; if (CFG.WS && socket?.readyState === 1) subTo(getFIDs()); }, 0); } };
    setTimeout(() => { if (document.querySelector("ul.members-list")) onWarFound(); }, 800);
    obs.observe(document.body, { subtree: true, childList: true });

    let lastReq = 0, backoffUntil = 0, backoffMs = 0;
    async function apiUpdate() {
        if (!running || !hasKey() || document.hidden || !found_war || Date.now() < backoffUntil) return;
        const fids = getFIDs();
        if (!fids.length || Date.now() - lastReq < 9000 + (Math.random() * 2000 - 1000)) return;

        for (const id of fids) {
            if (!(await apiSingle(id))) break;
            await new Promise(r => setTimeout(r, 150 + Math.random() * 120));
        }
        lastReq = Date.now();
    }

    async function apiSingle(fid) {
        try {
            const r = await fetch(`https://api.torn.com/faction/${fid}?selections=basic&key=${apiKey}&comment=TWSEO-Merged`, { cache: 'no-store' });
            const d = await r.json();
            if (d.error) { if ([5, 8, 9].includes(d.error.code)) { backoffMs = Math.min(120000, (backoffMs || 2000) * 2); backoffUntil = Date.now() + backoffMs; return false; } return false; }
            if (!d.members) return true;
            for (const [k, v] of Object.entries(d.members)) {
                if (v.status.description) v.status.description = abbr(v.status.description);
                const cur = member_status.get(k);
                if (cur && (cur.status.description || "").includes("(WS)") && (Date.now() - (cur.status.updated || 0) < CFG.STALE)) {
                    if ((["Traveling", "Hospital", "Jail"].includes(cur.status.state) && v.status.state === "Okay") ||
                        (["Hospital", "Jail"].includes(cur.status.state) && ["Traveling", "Abroad"].includes(v.status.state))) continue;
                }
                v.status.color = getColor(v.status.state); v.status.updated = Date.now();
                member_status.set(k, v);
            }
            return true;
        } catch { return false; }
    }

    let last_frame = 0;
    function watch() {
        if (!found_war || document.hidden) return requestAnimationFrame(watch);
        const now = performance.now();
        if (now - last_frame < CFG.FRAME_MS) return requestAnimationFrame(watch);
        last_frame = now;

        const curSec = (Date.now() / 1000) | 0;
        const weights = new Map();

        member_lis.forEach((li, id) => {
            const stData = member_status.get(id);
            const sDiv = getSDiv(li);
            if (!sDiv) return;
            if (!HAS_HAS) li.classList.remove("twseo-highlight");

            if (!stData || !running) {
                safeSet(sDiv, ATTRS.CONT, sDiv.getAttribute(ATTRS.CONT) || sDiv.textContent);
                return weights.set(id, 0);
            }

            const st = stData.status || {};
            if (["Hospital", "Jail"].includes(st.state) && sDiv.classList.contains('ok')) {
                if (!st.description?.includes("(WS)") && !(st.until > curSec) && (Date.now() - (st.updated || 0) > CFG.RESYNC)) {
                    st.state = "Okay"; st.description = "Okay"; st.updated = Date.now(); st.freshOkay = true;
                }
            }

            if (li.dataset.until !== String(st.until ?? "")) li.dataset.until = String(st.until ?? "");
            const expired = (st.until || 0) <= curSec && st.until !== CFG.UNTIL_MAX;
            let col = st.color || "green";
            if (["Hospital", "Jail"].includes(st.state) && expired) col = "green";
            safeSet(sDiv, ATTRS.COL, col);

            if (["Fallen", "Federal"].includes(st.state)) {
                weights.set(id, 6); safeSet(sDiv, ATTRS.CONT, st.state); safeSet(sDiv, ATTRS.COL, "red");
                safeSet(sDiv, ATTRS.TRAV, "false"); safeSet(sDiv, ATTRS.HL, "false");
            } else if (["Abroad", "Traveling"].includes(st.state)) {
                safeSet(sDiv, ATTRS.TRAV, "false");
                const d = st.description || "Traveling";
                if (d.includes("Traveling to ")) { weights.set(id, 4); safeSet(sDiv, ATTRS.CONT, "► " + d.split("Traveling to ")[1]); }
                else if (d.includes("In ")) { weights.set(id, 3); safeSet(sDiv, ATTRS.CONT, d.split("In ")[1]); }
                else if (d.includes("Returning")) { weights.set(id, 2); safeSet(sDiv, ATTRS.CONT, "◄ " + d.split("Returning to Torn from ")[1]); }
                else { weights.set(id, 5); safeSet(sDiv, ATTRS.CONT, "Traveling"); }
            } else if (["Hospital", "Jail"].includes(st.state)) {
                if (st.description?.toLowerCase().includes("federal")) {
                    weights.set(id, 6); safeSet(sDiv, ATTRS.CONT, "Federal"); safeSet(sDiv, ATTRS.COL, "red");
                } else {
                    weights.set(id, 1); safeSet(sDiv, ATTRS.TRAV, st.description?.includes("In a") ? "true" : "false");
                    const rem = Math.max(0, ((st.until >>> 0) - curSec) | 0);
                    if (rem <= 0 && st.until === 0) {
                        safeSet(sDiv, ATTRS.CONT, st.state); safeSet(sDiv, ATTRS.HL, "true"); if (!HAS_HAS) li.classList.add("twseo-highlight");
                    } else if (rem <= 0) {
                        safeSet(sDiv, ATTRS.HL, "false"); safeSet(sDiv, ATTRS.CONT, sDiv.getAttribute(ATTRS.CONT) || sDiv.textContent);
                    } else {
                        const t = `${pad((rem / 3600) | 0)}:${pad(((rem / 60) | 0) % 60)}:${pad(rem % 60)}`;
                        if (sDiv.getAttribute(ATTRS.CONT) !== t) safeSet(sDiv, ATTRS.CONT, t);
                        const soon = rem < 300;
                        safeSet(sDiv, ATTRS.HL, soon ? "true" : "false");
                        if (!HAS_HAS && soon) li.classList.add("twseo-highlight");
                    }
                }
            } else {
                safeRem(sDiv, ATTRS.CONT); weights.set(id, 0); safeSet(sDiv, ATTRS.TRAV, "false"); safeSet(sDiv, ATTRS.HL, "false");
            }
        });

        if (sort_enemies) {
            getLists().forEach(ul => {
                const root = ul.parentNode;
                let col = null, ord = "desc";
                const mD = root?.querySelector("div.member div"), sD = root?.querySelector("div.status div");
                if (mD?.className.match(/activeIcon__/)) { col = "member"; if (mD.className.match(/asc__/)) ord = "asc"; }
                else if (sD?.className.match(/activeIcon__/)) { col = "status"; if (sD.className.match(/asc__/)) ord = "asc"; }
                if (col !== "score" && ord !== "desc") ever_sorted = true;
                if ((col || (ever_sorted ? "status" : null)) !== "status") return;
                if (!ever_sorted) ord = "asc";

                const lis = document.querySelector(".faction-war") ? ul.querySelectorAll("li.enemy, li.your") : Array.from(ul.children).filter(c => c.tagName === 'LI');
                const sorted = Array.from(lis).map(li => {
                    const id = li.dataset.twseoId, s = member_status.get(id)?.status;
                    let sc = getScore(li, id);
                    if (s?.state === "Okay" && s?.freshOkay) sc = -1; else if (!SORT_SCORE) sc = 0;
                    return { li, a: weights.get(id) ?? 0, u: s?.until ?? 0, sc };
                }).sort((a, b) => {
                    let L = a, R = b; if (ord !== "asc") [L, R] = [b, a];
                    return (L.a !== R.a) ? L.a - R.a : (L.a === 0) ? R.sc - L.sc : L.u - R.u;
                }).map(o => o.li);

                let same = true;
                for (let j = 0; j < sorted.length; j++) if (lis[j] !== sorted[j]) { same = false; break; }
                if (!same) { const d = ul.style.display; ul.style.display = "none"; const f = document.createDocumentFragment(); sorted.forEach(l => f.appendChild(l)); ul.appendChild(f); ul.style.display = d; }
            });
        }
        requestAnimationFrame(watch);
    }

    let tick;
    const schedTick = () => { clearTimeout(tick); tick = setTimeout(() => { if (!document.hidden) apiUpdate(); schedTick(); }, 1000); };
    schedTick();

    setTimeout(() => { prime(); requestAnimationFrame(watch); }, 1000);
    window.addEventListener("hashchange", () => { onWarGone(); setTimeout(() => { if (document.querySelector(".faction-war")) onWarFound(); schedRef(); }, 300); }, { passive: true });
    window.addEventListener("pagehide", () => { obs.disconnect(); clearTimeout(tick); socket?.close(); }, { passive: true });
})();