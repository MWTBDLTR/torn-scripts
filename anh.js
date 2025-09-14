// ==UserScript==
// @name         Torn.com Attack Numpad Helper (Configurable Keys)
// @namespace    https://github.com/MWTBDLTR/torn-scripts/
// @version      1.0
// @description  Numpad shortcuts for Torn attack page with configurable key mappings per weapon slot and dialog choices + configurable Continue behavior + hospital reload check
// @author       MrChurch [3654415]
// @match        https://www.torn.com/loader.php*
// @run-at       document-idle
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @downloadURL  https://update.greasyfork.org/scripts/549158/Torncom%20Attack%20Numpad%20Helper.user.js
// @updateURL    https://update.greasyfork.org/scripts/549158/Torncom%20Attack%20Numpad%20Helper.meta.js
// ==/UserScript==

(async function () {
  'use strict';

  // Only run on the attack loader with a user2ID param
  const params = new URLSearchParams(location.search);
  if (!(params.get('sid') === 'attack' && params.has('user2ID'))) return;

  // === GM compatibility ===
  const GMAPI = {
    getValue: async (k, d) => {
      try {
        if (typeof GM !== 'undefined' && GM.getValue) return await GM.getValue(k, d);
        if (typeof GM_getValue !== 'undefined') return GM_getValue(k, d);
      } catch {}
      const v = localStorage.getItem('tm_' + k);
      return v == null ? d : v;
    },
    setValue: async (k, v) => {
      try {
        if (typeof GM !== 'undefined' && GM.setValue) return await GM.setValue(k, v);
        if (typeof GM_setValue !== 'undefined') return GM_setValue(k, v);
      } catch {}
      localStorage.setItem('tm_' + k, v);
    },
  };

  // === Settings (persisted) ===
  const DEFAULT_SETTINGS = {
    // weaponSlots: nth-child selectors for the hoverEnabled cards
    // slots 1..4 are visible weapon/action cards; 5/6 are Punch/Kick
    weaponSlotKeys: {
      // arrays of KeyboardEvent.code values
      '1': ['Numpad1'],
      '2': ['Numpad2'],
      '3': ['Numpad3'],
      '4': ['Numpad0'],
      '5': ['NumpadDecimal', 'NumpadComma'], // Punch by default
      '6': [], // Kick (no default key; can be set by user)
    },
    // Which action gets the decimal by default: 'punch' (slot 5) or 'kick' (slot 6)
    decimalTarget: 'punch',
    // Dialog (Leave / Mug / Hospitalize) key mappings (left/middle/right)
    dialogKeys: {
      '1': ['Numpad4'], // left button (usually Leave)
      '2': ['Numpad5'], // middle (Mug)
      '3': ['Numpad6'], // right (Hospitalize)
    },
    // Continue button behavior
    continueAction: 'default', // 'default' | 'close' | 'openFixed'
  };

  // Load settings
  let settings = (() => DEFAULT_SETTINGS)();
  try {
    const raw = await GMAPI.getValue('settingsV2', null);
    if (raw) settings = Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw));
  } catch {}

  // Ensure arrays exist
  for (const k of ['weaponSlotKeys', 'dialogKeys']) {
    if (!settings[k]) settings[k] = JSON.parse(JSON.stringify(DEFAULT_SETTINGS[k]));
  }

  // Backward-compat for previous decimalTarget / continueAction
  try {
    const legacyDecimal = await GMAPI.getValue('decimalTarget', null);
    if (legacyDecimal && (legacyDecimal === 'punch' || legacyDecimal === 'kick')) {
      settings.decimalTarget = legacyDecimal;
    }
  } catch {}
  try {
    const legacyContinue = await GMAPI.getValue('continueAction', null);
    if (legacyContinue && ['default', 'close', 'openFixed'].includes(legacyContinue)) {
      settings.continueAction = legacyContinue;
    }
  } catch {}

  function saveSettings() {
    GMAPI.setValue('settingsV2', JSON.stringify(settings));
  }

  // === Utilities ===
  const isNumpadKey = (code) => typeof code === 'string' && code.startsWith('Numpad');
  function isTypingInField(target) {
    return !!(
      target &&
      (target.isContentEditable ||
        target.closest('input, textarea, [contenteditable=""], [contenteditable="true"]'))
    );
  }
  function clickEl(el) {
    if (el) {
      el.click();
      return true;
    }
    return false;
  }
  function tryCloseTab() {
    try { window.close(); } catch {}
    try {
      const w = window.open('', '_self');
      w && w.close && w.close();
    } catch {}
  }
  function handleContinue() {
    if (settings.continueAction === 'close') {
      tryCloseTab();
      return true;
    }
    if (settings.continueAction === 'openFixed') {
      window.location.href = 'https://www.torn.com/loader.php?sid=attack&user2ID=1598729';
      return true;
    }
    return false; // default
  }
  function hasContinueText(btn) {
    const txt = (btn?.textContent || '').toLowerCase();
    return txt.includes('continue');
  }
  function isHospitalBlocked() {
    return !!document.querySelector('.colored___sN72G.red___SANWO .title___fOh2J');
  }

  // === Element Finders ===
  function findPrimaryButton() {
    return (
      document.querySelector('button.torn-btn:nth-child(1)') ||
      document.querySelector('button[class^="btn___"]:nth-child(1)')
    );
  }
  function getOverrideButtons() { // dialog buttons (left/middle/right)
    const b3 =
      document.querySelector('button.torn-btn:nth-child(3)') ||
      document.querySelector('button[class^="btn___"]:nth-child(3)');
    if (!b3) return null;

    let b2 = b3.previousElementSibling;
    while (b2 && b2.tagName !== 'BUTTON') b2 = b2.previousElementSibling;

    let b1 = b2 ? b2.previousElementSibling : null;
    while (b1 && b1.tagName !== 'BUTTON') b1 = b1.previousElementSibling;

    return { b1, b2, b3 };
  }

  // === Key Maps (derived) ===
  function buildKeyToWeaponSlot() {
    const map = new Map();
    for (const [slot, codes] of Object.entries(settings.weaponSlotKeys)) {
      for (const code of codes || []) map.set(code, Number(slot));
    }
    // decimalTarget convenience: if decimal/comma assigned to neither 5 nor 6, route to target slot
    const decCodes = ['NumpadDecimal', 'NumpadComma'];
    const targetSlot = settings.decimalTarget === 'kick' ? 6 : 5;
    for (const dc of decCodes) {
      if (![5,6].some(s => (settings.weaponSlotKeys[String(s)] || []).includes(dc))) {
        map.set(dc, targetSlot);
      }
    }
    return map;
  }
  function buildKeyToDialogIndex() {
    const map = new Map(); // code -> 1|2|3
    for (const [idx, codes] of Object.entries(settings.dialogKeys)) {
      for (const code of codes || []) map.set(code, Number(idx));
    }
    return map;
  }

  // === Selectors for weapon slots ===
  function selectorForWeaponSlot(slot) {
    if (slot >= 1 && slot <= 4) return `div.hoverEnabled___skjqK:nth-child(${slot})`;
    if (slot === 5 || slot === 6) return `div.hoverEnabled___skjqK:nth-child(${slot})`; // Punch/Kick cards
    return null;
  }

  // === Minimal key badges ===
  const style = document.createElement('style');
  style.textContent = `
    .torn-keyhint { position: absolute; top: 4px; right: 4px; background: rgba(0,0,0,.55); color: #fff; border-radius: 4px; padding: 1px 4px; font-size: 10px; line-height: 1.2; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; letter-spacing: .2px; pointer-events: none; z-index: 2147483647; opacity: .9; }
    .torn-keyhint--multi { opacity: .85; }
  `;
  document.head.appendChild(style);

  function clearAllHints() {
    document.querySelectorAll('.torn-keyhint').forEach((el) => el.remove());
  }
  function ensureHintOnElement(el, text, isMulti = false) {
    if (!el) return;
    const cs = getComputedStyle(el);
    if (cs.position === 'static') el.style.position = 'relative';
    let hint = el.querySelector(':scope > .torn-keyhint');
    if (!hint) {
      hint = document.createElement('span');
      hint.className = 'torn-keyhint';
      el.appendChild(hint);
    }
    hint.classList.toggle('torn-keyhint--multi', !!isMulti);
    hint.textContent = text;
  }
  function ensureHintOnSelector(selector, text, isMulti = false) {
    const el = document.querySelector(selector);
    if (el) ensureHintOnElement(el, text, isMulti);
  }

  function prettyKeys(arr) {
    return (arr && arr.length ? arr : []).map(k => k.replace('Numpad', '')).join(', ');
  }

  function reverseIndex(map) {
    // Map<number, string[]> where number is slot or dialog index
    const out = new Map();
    for (const [code, n] of map.entries()) {
      if (!out.has(n)) out.set(n, []);
      out.get(n).push(code);
    }
    return out;
  }

  function updateHints() {
    clearAllHints();

    // Dialog buttons present?
    const ob = getOverrideButtons();
    if (ob && (ob.b1 || ob.b2 || ob.b3)) {
      const keyToDlg = buildKeyToDialogIndex();
      const rev = reverseIndex(keyToDlg);
      if (ob.b1) ensureHintOnElement(ob.b1, prettyKeys(rev.get(1) || ['4']) || '');
      if (ob.b2) ensureHintOnElement(ob.b2, prettyKeys(rev.get(2) || ['5']) || '');
      if (ob.b3) ensureHintOnElement(ob.b3, prettyKeys(rev.get(3) || ['6']) || '');
      return;
    }

    // Primary button mode
    const primary = findPrimaryButton();
    if (primary) {
      const label = hasContinueText(primary)
        ? (settings.continueAction === 'close' ? 'any → close' : settings.continueAction === 'openFixed' ? 'any → fixed' : 'any')
        : 'any';
      ensureHintOnElement(primary, label);
      return;
    }

    // Weapon cards (slots 1..6)
    const keyToSlot = buildKeyToWeaponSlot();
    const rev = reverseIndex(keyToSlot);
    for (let slot = 1; slot <= 6; slot++) {
      const sel = selectorForWeaponSlot(slot);
      if (sel) ensureHintOnSelector(sel, prettyKeys(rev.get(slot) || []) || '');
    }
  }

  // === Key handling ===
  document.addEventListener(
    'keydown',
    (e) => {
      if (isTypingInField(e.target)) return;

      // Hospital check: any configured key reloads
      const keyToSlot = buildKeyToWeaponSlot();
      const keyToDlg = buildKeyToDialogIndex();
      if (isHospitalBlocked() && (keyToSlot.has(e.code) || keyToDlg.has(e.code) || isNumpadKey(e.code))) {
        e.preventDefault(); e.stopPropagation(); location.reload(); return;
      }

      // Dialog present?
      const ob = getOverrideButtons();
      if (ob && (ob.b1 || ob.b2 || ob.b3)) {
        const idx = buildKeyToDialogIndex().get(e.code);
        if (!idx) return;
        const target = idx === 1 ? ob.b1 : idx === 2 ? ob.b2 : ob.b3;
        if (clickEl(target)) { e.preventDefault(); e.stopPropagation(); }
        return;
      }

      // Primary button present? (e.g., Continue)
      const primary = findPrimaryButton();
      if (primary) {
        if (!isNumpadKey(e.code)) return;
        if (hasContinueText(primary) && settings.continueAction !== 'default') {
          e.preventDefault(); e.stopPropagation(); if (handleContinue()) return;
        }
        if (clickEl(primary)) { e.preventDefault(); e.stopPropagation(); }
        return;
      }

      // Weapon card clicks by configured keys
      const slot = keyToSlot.get(e.code);
      if (!slot) return;
      const selector = selectorForWeaponSlot(slot);
      const el = selector ? document.querySelector(selector) : null;
      if (clickEl(el)) { e.preventDefault(); e.stopPropagation(); }
    },
    true
  );

  // === Menu ===
  let menuIds = [];
  function unregisterMenu() {
    if (menuIds.length && typeof GM_unregisterMenuCommand === 'function') {
      try { menuIds.forEach((id) => GM_unregisterMenuCommand(id)); } catch {}
    }
    menuIds = [];
  }

  function parseKeyList(input) {
    // Accept comma/space separated tokens like "1,2,3,Decimal" -> map to Numpad*
    if (!input) return [];
    return input
      .split(/[\s,]+/)
      .map(s => s.trim())
      .filter(Boolean)
      .map(tok => tok.startsWith('Numpad') ? tok : ('Numpad' + tok.replace(/^\./, 'Decimal')))
      .map(tok => tok.replace('Numpad.', 'NumpadDecimal').replace('Numpad,', 'NumpadComma'))
      .map(tok => tok === 'Numpad.' ? 'NumpadDecimal' : tok)
      .map(tok => tok === 'Numpad,' ? 'NumpadComma' : tok)
      .filter(tok => /^Numpad(\d|Enter|Add|Subtract|Multiply|Divide|Decimal|Comma)$/.test(tok));
  }

  function editKeysFor(label, current, apply) {
    const pretty = prettyKeys(current.map(k => k.replace('Numpad', '')));
    const input = prompt(
      `${label}\nEnter keys separated by commas/spaces. Examples: 1 2 3 0 ., 4 5 6, 7 8\nUse '.' for Decimal and ',' for Comma.\nCurrent: ${pretty || '(none)'}\n`,
      current.map(k => k.replace('Numpad', '')).join(' ')
    );
    if (input == null) return; // canceled
    const parsed = parseKeyList(input);
    apply(parsed);
    saveSettings();
    scheduleUpdate();
    registerMenu();
    console.info('[Torn Numpad Helper] Updated:', label, parsed);
  }

  function registerMenu() {
    if (typeof GM_registerMenuCommand !== 'function') return;
    unregisterMenu();

    // Show mappings
    const idShow = GM_registerMenuCommand('Show current mappings', () => {
      const keyToSlot = buildKeyToWeaponSlot();
      const keyToDlg = buildKeyToDialogIndex();
      alert(
        'Weapon slots (slot: keys)\n' +
        Array.from({ length: 6 }, (_, i) => i + 1)
          .map(s => `${s}: ${prettyKeys((reverseIndex(keyToSlot).get(s) || []).map(x => x.replace('Numpad', '')))||'(none)'}`)
          .join('\n') +
        '\n\nDialog (index: keys)\n' +
        [1,2,3]
          .map(i => `${i}: ${prettyKeys((reverseIndex(keyToDlg).get(i) || []).map(x => x.replace('Numpad', '')))||'(none)'}`)
          .join('\n') +
        `\n\nDecimal target: ${settings.decimalTarget}\nContinue: ${settings.continueAction}`
      );
    });
    menuIds.push(idShow);

    // Weapon slot editors
    for (let s = 1; s <= 6; s++) {
      const id = GM_registerMenuCommand(`Edit keys: Weapon slot ${s}`, () => {
        editKeysFor(
          `Weapon slot ${s}`,
          settings.weaponSlotKeys[String(s)] || [],
          (parsed) => { settings.weaponSlotKeys[String(s)] = parsed; }
        );
      });
      menuIds.push(id);
    }

    // Dialog editors (left/middle/right)
    const dialogLabels = { 1: 'Dialog 1 (Left: Leave)', 2: 'Dialog 2 (Middle: Mug)', 3: 'Dialog 3 (Right: Hospitalize)' };
    for (let d = 1; d <= 3; d++) {
      const id = GM_registerMenuCommand(`Edit keys: ${dialogLabels[d]}`, () => {
        editKeysFor(
          dialogLabels[d],
          settings.dialogKeys[String(d)] || [],
          (parsed) => { settings.dialogKeys[String(d)] = parsed; }
        );
      });
      menuIds.push(id);
    }

    // Decimal mapping toggle (punch/kick)
    const labelDecimal = `Decimal target: ${settings.decimalTarget === 'kick' ? 'Kick (slot 6)' : 'Punch (slot 5)'} (toggle)`;
    const idDec = GM_registerMenuCommand(labelDecimal, async () => {
      settings.decimalTarget = settings.decimalTarget === 'kick' ? 'punch' : 'kick';
      saveSettings();
      scheduleUpdate();
      registerMenu();
      console.info('[Torn Numpad Helper] Decimal target set to:', settings.decimalTarget);
    });
    menuIds.push(idDec);

    // Continue action toggle
    const labelContinue = `Continue action: ${
      settings.continueAction === 'close' ? 'Close tab' :
      settings.continueAction === 'openFixed' ? 'attack bodybagger' :
      'Default click'
    } (cycle)`;
    const idCont = GM_registerMenuCommand(labelContinue, async () => {
      settings.continueAction =
        settings.continueAction === 'default' ? 'close' :
        settings.continueAction === 'close' ? 'openFixed' :
        'default';
      saveSettings();
      scheduleUpdate();
      registerMenu();
      console.info('[Torn Numpad Helper] Continue action set to:', settings.continueAction);
    });
    menuIds.push(idCont);

    // Reset to defaults
    const idReset = GM_registerMenuCommand('Reset all mappings to defaults', () => {
      if (!confirm('Reset all key mappings and settings to defaults?')) return;
      settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      saveSettings();
      scheduleUpdate();
      registerMenu();
      console.info('[Torn Numpad Helper] Settings reset to defaults');
    });
    menuIds.push(idReset);
  }

  registerMenu();

  // === Reactive hints ===
  const scheduleUpdate = (() => {
    let t = null;
    return () => {
      if (t) return;
      t = setTimeout(() => { t = null; updateHints(); }, 50);
    };
  })();

  updateHints();

  const observer = new MutationObserver(() => scheduleUpdate());
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'style'],
  });

  window.addEventListener('focus', scheduleUpdate);
})();
