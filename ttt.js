// ==UserScript==
// @name         Torn Time Table (optimized, live local time)
// @namespace    https://greasyfork.org
// @version      0.5.2
// @description  Shows your local time and a table to convert Torn time to your local time
// @license      MIT
// @author       MrChurch [3654415]
// @match        https://www.torn.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=torn.com
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const SHOW_ON_LOAD = true; // true = expanded by default

  function waitFor(selector, root = document) {
    return new Promise((resolve) => {
      const found = root.querySelector(selector);
      if (found) return resolve(found);
      const obs = new MutationObserver(() => {
        const el = root.querySelector(selector);
        if (el) {
          resolve(el);
          obs.disconnect();
        }
      });
      obs.observe(document.documentElement, { subtree: true, childList: true });
    });
  }

  const z2 = (n) => String(n).padStart(2, '0');

  function ensureStyles() {
    if (document.getElementById('myTornTimeTableStyles')) return;
    const style = document.createElement('style');
    style.id = 'myTornTimeTableStyles';
    style.textContent = `
      #myTornTimeTableWrap { margin-top: 6px; }
      #myTornTimeTable { text-align:center; width:100%; border-collapse: collapse; }
      #myTornTimeTable th, #myTornTimeTable td { padding: 4px 0; color: #e3e3e3; }
      #myTornTimeTable thead td { border-top:1px solid #000; border-bottom:1px solid #000; }
      .tt-toggle { cursor:pointer; user-select:none; display:inline-block; margin-bottom:6px; color:#e3e3e3; }
      .tt-muted { opacity:0.9; color:#e3e3e3; }
      .tt-hidden { display:none; }
    `;
    document.head.appendChild(style);
  }

  function parseHHMMSS(text) {
    const m = text && text.trim().match(/(\d{1,2}):(\d{2}):(\d{2})/);
    if (!m) return null;
    const h = +m[1], mi = +m[2], s = +m[3];
    if ([h, mi, s].some(Number.isNaN)) return null;
    return { h, mi, s };
  }

  function minutesToHMS(totalMinutes, seconds = 0) {
    // Accepts possibly-negative minutes, wraps to 0..23 for hours
    const tMin = Math.floor(totalMinutes);
    const h = ((Math.floor(tMin / 60) % 24) + 24) % 24;
    const m = ((tMin % 60) + 60) % 60;
    const s = ((seconds % 60) + 60) % 60;
    return { h, m, s };
  }

  function buildWrap(tctH, tctM) {
    const now = new Date();
    const offsetMin = now.getTimezoneOffset(); // minutes to add to LOCAL to get UTC
    const tctTotalMin = tctH * 60 + tctM;
    const localTotalMin = tctTotalMin - offsetMin;

    const { h: localH, m: localM } = minutesToHMS(localTotalMin);

    const wrap = document.createElement('div');
    wrap.id = 'myTornTimeTableWrap';
    wrap.innerHTML = `
      <a class="tt-toggle">Toggle Time Table</a>
      <table id="myTornTimeTable" ${SHOW_ON_LOAD ? '' : 'class="tt-hidden"'}>
        <thead>
          <tr>
            <td colspan="3" class="tt-muted">
              Local: <span id="tt-local-time">${z2(localH)}:${z2(localM)}:00</span>
            </td>
          </tr>
          <tr><th width="33%">Add</th><th width="34%">TCT</th><th width="33%">Local</th></tr>
        </thead>
        <tbody></tbody>
      </table>
    `;

    const tbody = wrap.querySelector('tbody');
    for (let add = 1; add <= 23; add++) {
      const tctHour = (tctH + add) % 24;
      const locMin = localTotalMin + add * 60;
      const { h: locHour } = minutesToHMS(locMin);
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${add}</td><td>${z2(tctHour)}</td><td>${z2(locHour)}</td>`;
      tbody.appendChild(tr);
    }

    // Return a function to live-update the header given a TCT string "HH:MM:SS"
    const localHeader = () => wrap.querySelector('#tt-local-time');
    const updater = (tctText) => {
      const p = parseHHMMSS(tctText);
      if (!p) return;
      // Recompute from current timezone offset each tick (DST-safe)
      const offMin = new Date().getTimezoneOffset();
      const tctMinNow = p.h * 60 + p.mi;
      const localMinNow = tctMinNow - offMin;
      const { h, m } = minutesToHMS(localMinNow, p.s);
      const el = localHeader();
      if (el) el.textContent = `${z2(h)}:${z2(m)}:${z2(p.s)}`;
    };

    return { wrap, updater };
  }

  async function main() {
    ensureStyles();
    const timeSpan = await waitFor('.server-date-time');
    if (!timeSpan || document.getElementById('myTornTimeTableWrap')) return;

    const parsed = parseHHMMSS(timeSpan.textContent || '');
    if (!parsed) return;

    const { wrap, updater } = buildWrap(parsed.h, parsed.mi);
    timeSpan.insertAdjacentElement('afterend', wrap);

    // Toggle
    const toggle = wrap.querySelector('.tt-toggle');
    const table = wrap.querySelector('#myTornTimeTable');
    toggle.addEventListener('click', () => table.classList.toggle('tt-hidden'));

    // Live-sync local time with Torn's clock by observing text changes
    const mo = new MutationObserver(() => updater(timeSpan.textContent || ''));
    mo.observe(timeSpan, { characterData: true, subtree: true, childList: true });

    // Initial paint with seconds
    updater(timeSpan.textContent || '');
  }

  main();
})();
