// ==UserScript==
// @name         War Attack Links (TWSE Safe)
// @namespace    https://github.com/MWTBDLTR/torn-scripts/
// @version      1.1
// @description  Swap Attack URLs on war page and play nice with Torn War Stuff Enhanced
// @author       MrChurch [3654415]
// @match        https://www.torn.com/factions.php*
// @grant        none
// @license      MIT Inherited
// ==/UserScript==

(function () {
  'use strict';

  const OPEN_IN_NEW_TAB = true;
  const MARK = 'attackLinkHandled';
  const ROW_MARK = 'attackRowHandled';
  let scriptEnabled = true;

  const rIC = window.requestIdleCallback || function (cb){ return setTimeout(() => cb({timeRemaining:()=>50}), 60); };
  const cIC = window.cancelIdleCallback || clearTimeout;

  const getAttackUrl = (userId) =>
    `https://www.torn.com/loader.php?sid=attack&user2ID=${userId}`;

  const isAttackControl = (el) => {
    if (!el) return false;
    const txt = (el.textContent || '').trim();
    if (txt && txt.length <= 10 && txt.toLowerCase() === 'attack') return true;
    const title = (el.getAttribute?.('title') || '').toLowerCase();
    if (title === 'attack') return true;
    const aria  = (el.getAttribute?.('aria-label') || '').toLowerCase();
    return aria === 'attack';
  };
  const getUserIdForRow = (row) => {
    const profileLink = row.querySelector('a[href*="profiles.php?XID="]');
    if (!profileLink) return null;
    const m = profileLink.href.match(/XID=(\d+)/);
    return m ? m[1] : null;
  };

  (function addStyles(){
    const style = document.createElement('style');
    style.textContent = `
      .custom-attack-button {
        display: inline-block;
        color: white !important;
        background-color: #1e65ff !important;
        padding: 2px 6px;
        border-radius: 4px;
        text-decoration: none !important;
        cursor: pointer;
        user-select: none;
        margin-left: 8px;
        line-height: 1.6;
      }
      .custom-attack-button.disabled,
      .custom-attack-button[aria-disabled="true"] {
        opacity: 0.6;
        pointer-events: none;
      }
      /* Optional: keep layout stable if the page flips content in/out */
      .enemy .custom-attack-button { white-space: nowrap; }
      /* Toggle button */
      .attack-toggle-btn {
        position: fixed; bottom: 5%; right: 10px; z-index: 9999;
        padding: 6px 10px; background-color: #008CBA; color: #fff;
        border: none; border-radius: 5px; cursor: pointer;
        font-size: 14px; box-shadow: 0 0 5px rgba(0,0,0,.3)
      }
      .attack-toggle-btn.off { background-color: #777; }
    `;
    document.head.appendChild(style);
  })();

  (function createToggle(){
    const button = document.createElement('button');
    button.textContent = 'Attack Script: ON';
    button.className = 'attack-toggle-btn';
    button.addEventListener('click', () => {
      scriptEnabled = !scriptEnabled;
      button.textContent = `Attack Script: ${scriptEnabled ? 'ON' : 'OFF'}`;
      button.classList.toggle('off', !scriptEnabled);
    });
    const add = () => document.body && document.body.appendChild(button);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', add);
    } else {
      add();
    }
  })();

  function openAttackUrl(url){
    if (!scriptEnabled || !url) return;
    if (OPEN_IN_NEW_TAB) {
      window.open(url, '_blank', 'noopener');
    } else {
      location.assign(url);
    }
  }
  document.addEventListener('click', (e) => {
    const t = e.target.closest?.('[data-attack-url]');
    if (!t) return;
    e.preventDefault();
    openAttackUrl(t.getAttribute('data-attack-url'));
  }, { capture:false, passive:false });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const t = e.target.closest?.('[data-attack-url]');
    if (!t) return;
    e.preventDefault();
    openAttackUrl(t.getAttribute('data-attack-url'));
  }, { capture:false, passive:false });

  const processedRows = new WeakSet();

  function makeClickable(el, url) {
    if (!el) return;
    if (el.offsetParent === null) return;
    if (el.dataset[MARK] === '1') {
      if (el.tagName === 'A') {
        if (el.href !== url) el.href = url;
      } else {
        el.setAttribute('data-attack-url', url);
      }
      return;
    }

    el.dataset[MARK] = '1';

    if (el.tagName === 'A') {
      el.href = url;
      if (OPEN_IN_NEW_TAB) el.target = '_blank';
      el.rel = 'noopener noreferrer';
      el.classList.add('custom-attack-button');
      el.classList.remove('disabled', 'greyed', 't-gray-9');
      el.style.pointerEvents = 'auto';
      if (!el.textContent.trim()) el.textContent = 'Attack';
      return;
    }

    el.setAttribute('role', 'link');
    el.setAttribute('tabindex', '0');
    el.setAttribute('data-attack-url', url);
    el.classList.add('custom-attack-button');
    if (!el.textContent.trim()) el.textContent = 'Attack';
  }

  function processRow(row){
    if (!row || !(row instanceof Element)) return;

    const userId = getUserIdForRow(row);
    if (!userId) return;

    const url = getAttackUrl(userId);

    const candidates = row.querySelectorAll('a,button,span');

    for (const el of candidates) {
      if (!isAttackControl(el)) continue;
      makeClickable(el, url);
    }
    processedRows.add(row);
    row.dataset[ROW_MARK] = '1';
  }

  function normalizeAttackControlsForRows(rows){
    if (!scriptEnabled || rows.size === 0) return;
    for (const row of rows) processRow(row);
  }
  function initialScan(){
    const rows = new Set(document.querySelectorAll('.enemy'));
    normalizeAttackControlsForRows(rows);
  }

  let idleHandle = null;
  const pendingRows = new Set();

  function scheduleWork(){
    if (idleHandle) return;
    idleHandle = rIC(() => {
      idleHandle = null;
      const batch = new Set(pendingRows);
      pendingRows.clear();
      normalizeAttackControlsForRows(batch);
    });
  }

  function collectRowsFromMutation(m){
    for (const n of m.addedNodes || []) {
      if (!(n instanceof Element)) continue;
      if (n.classList?.contains('enemy')) {
        pendingRows.add(n);
      } else {
        const row = n.closest?.('.enemy');
        if (row) pendingRows.add(row);
      }
    }
    if (m.type === 'attributes') {
      const row = m.target.closest?.('.enemy');
      if (row) pendingRows.add(row);
    }
  }

  const mo = new MutationObserver((muts) => {
    for (const m of muts) collectRowsFromMutation(m);
    scheduleWork();
  });

  function startObserver(){
    if (!document.body) return;
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['title', 'aria-label', 'class', 'style', 'aria-hidden']
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initialScan();
      startObserver();
    });
  } else {
    initialScan();
    startObserver();
  }
  setTimeout(() => initialScan(), 800);
})();
