// ==UserScript==
// @name         War Attack Links (TWSE Safe)
// @namespace    https://github.com/MWTBDLTR/torn-scripts/
// @version      1.0
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
  let scriptEnabled = true;

  const debounce = (fn, ms=200) => {
    let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), ms); };
  };

  const getAttackUrl = (userId) =>
    `https://www.torn.com/loader.php?sid=attack&user2ID=${userId}`;

  const isAttackControl = (el) => {
    if (!el) return false;
    const txt = (el.textContent || '').trim().toLowerCase();
    if (txt === 'attack') return true;
    const title = (el.getAttribute?.('title') || '').toLowerCase();
    const aria  = (el.getAttribute?.('aria-label') || '').toLowerCase();
    return title === 'attack' || aria === 'attack';
  };

  const getUserIdForRow = (node) => {
    const row = node.closest?.('.enemy');
    if (!row) return null;
    const profileLink = row.querySelector('a[href*="profiles.php?XID="]');
    if (!profileLink) return null;
    const m = profileLink.href.match(/XID=(\d+)/);
    return m ? m[1] : null;
  };

  function makeClickable(el, url) {
    if (!el || el.dataset[MARK]) return;
    el.dataset[MARK] = '1';

    if (el.tagName === 'A') {
      el.href = url;
      if (OPEN_IN_NEW_TAB) el.target = '_blank';
      el.rel = 'noopener noreferrer';
      el.classList.add('custom-attack-button');
      el.classList.remove('disabled', 'greyed', 't-gray-9');
      el.style.pointerEvents = 'auto';
      el.textContent = 'Attack';
      return;
    }

    el.setAttribute('role', 'link');
    el.setAttribute('tabindex', '0');
    el.classList.add('custom-attack-button');
    const open = () => {
      if (!scriptEnabled) return;
      if (OPEN_IN_NEW_TAB) {
        window.open(url, '_blank', 'noopener');
      } else {
        location.assign(url);
      }
    };
    el.addEventListener('click', open);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });

    if (!el.textContent.trim()) el.textContent = 'Attack';
  }

  function normalizeAttackControls(root=document) {
    if (!scriptEnabled) return;

    const rows = root.querySelectorAll('.enemy');
    rows.forEach((row) => {
      const userId = getUserIdForRow(row);
      if (!userId) return;
      const url = getAttackUrl(userId);

      const candidates = row.querySelectorAll('a, button, span');
      candidates.forEach((el) => {
        const hidden = el.closest?.('[aria-hidden="true"], [style*="display: none"]');
        if (hidden) return;

        if (isAttackControl(el)) {
          makeClickable(el, url);
        }
      });
    });
  }

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
    `;
    document.head.appendChild(style);
  })();

  (function createToggle(){
    const button = document.createElement('button');
    button.textContent = 'Attack Script: ON';
    Object.assign(button.style, {
      position: 'fixed', bottom: '5%', right: '10px', zIndex: 9999,
      padding: '6px 10px', backgroundColor: '#008CBA', color: '#fff',
      border: 'none', borderRadius: '5px', cursor: 'pointer',
      fontSize: '14px', boxShadow: '0 0 5px rgba(0,0,0,.3)'
    });
    button.addEventListener('click', () => {
      scriptEnabled = !scriptEnabled;
      button.textContent = `Attack Script: ${scriptEnabled ? 'ON' : 'OFF'}`;
      button.style.backgroundColor = scriptEnabled ? '#008CBA' : '#777';
    });
    document.addEventListener('DOMContentLoaded', () => document.body.appendChild(button));
    if (document.readyState !== 'loading') document.body.appendChild(button);
  })();

  const mo = new MutationObserver(debounce((muts) => {
    mo.disconnect();
    try { normalizeAttackControls(document); }
    finally { mo.observe(document.body, { childList: true, subtree: true }); }
  }, 250));

  if (document.body) {
    mo.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      mo.observe(document.body, { childList: true, subtree: true });
      normalizeAttackControls(document);
    });
  }

  setTimeout(() => normalizeAttackControls(document), 800);
})();
