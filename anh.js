// ==UserScript==
// @name         Attack Helper (Configurable Keys)
// @namespace    https://github.com/MWTBDLTR/torn-scripts/
// @version      1.1.5
// @description  Numpad shortcuts for Torn attack page with configurable key mappings per weapon slot and dialog choices + configurable Continue behavior + hospital reload check
// @author       MrChurch [3654415]
// @license      MIT
// @match        https://www.torn.com/loader.php*
// @run-at       document-idle
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// ==/UserScript==

(async function () {
    'use strict';

    const { search } = window.location;
    const params = new URLSearchParams(search);
    if (params.get('sid') !== 'attack' || !params.has('user2ID')) return;

    const GMAPI = {
        getValue: async (k, defaultValue = null) => {
            try {
                if (typeof GM !== 'undefined' && GM.getValue) return await GM.getValue(k, defaultValue);
                if (typeof GM_getValue !== 'undefined') return GM_getValue(k, defaultValue);
            } catch { }
            const v = localStorage.getItem('tm_' + k);
            return v === null ? defaultValue : v;
        },

        setValue: async (k, v) => {
            try {
                if (typeof GM !== 'undefined' && GM.setValue) return await GM.setValue(k, v);
                if (typeof GM_setValue !== 'undefined') return GM_setValue(k, v);
            } catch { }
            localStorage.setItem('tm_' + k, v);
        }
    };

    // default config; numpad map for weapon slots and then dialog choices followed by the "Continue" button behavior
    const DEFAULT_SETTINGS = {
        weaponSlotKeys: {
            '1': ['Numpad1'],
            '2': ['Numpad2'],
            '3': ['Numpad3'],
            '4': ['Numpad0'],
            '5': ['NumpadDecimal', 'NumpadComma'],
            '6': [],
        },
        decimalTarget: 'punch',
        dialogKeys: {
            '1': ['Numpad4'],
            '2': ['Numpad5'],
            '3': ['Numpad6'],
        },
        continueAction: 'default',
        fixedTargetID: '3547823',
    };

    // load settings or fallback to default
    let settings = (() => DEFAULT_SETTINGS)();
    try {
        const raw = await GMAPI.getValue('settingsV2', null);
        if (raw) settings = Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw));
    } catch { }

    // nested objects exist check
    for (const k of ['weaponSlotKeys', 'dialogKeys']) {
        if (!settings[k]) settings[k] = JSON.parse(JSON.stringify(DEFAULT_SETTINGS[k]));
    }

    // legacy support
    try {
        const legacyDecimal = await GMAPI.getValue('decimalTarget', null);
        if (legacyDecimal && (legacyDecimal === 'punch' || legacyDecimal === 'kick')) {
            settings.decimalTarget = legacyDecimal;
        }
    } catch { }
    try {
        const legacyContinue = await GMAPI.getValue('continueAction', null);
        if (legacyContinue && ['default', 'close', 'openFixed'].includes(legacyContinue)) {
            settings.continueAction = legacyContinue;
        }
    } catch { }

    // settings helper
    function saveSettings() {
        GMAPI.setValue('settingsV2', JSON.stringify(settings));
        clearKeyCache(); // Clear cache when settings change
    }

    // utility functions for type checks, guards, etc
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
        try { window.close(); } catch { }
        try {
            const w = window.open('', '_self');
            w && w.close && w.close();
        } catch { }
    }

    /**
     * Reloads the page once, preventing duplicate reloads
     * @returns {void}
     */

    let _reloading = false;
    function reloadOnce() {
        if (_reloading) return;
        _reloading = true;
        // Use replace() so Back doesn’t return you to the blocked state
        try { location.replace(location.href); } catch { location.reload(); }
    }

    /**
     * Caching system for key mappings to improve performance
     * Prevents repeated calculations during rapid key presses
     */

    let _cachedKeyToSlot = null;
    let _cachedKeyToDialog = null;
    let _cachedReverseSlot = null;
    let _cachedReverseDialog = null;

    function clearKeyCache() {
        _cachedKeyToSlot = null;
        _cachedKeyToDialog = null;
        _cachedReverseSlot = null;
        _cachedReverseDialog = null;
    }

    function getCachedKeyToWeaponSlot() {
        if (!_cachedKeyToSlot) {
            _cachedKeyToSlot = buildKeyToWeaponSlot();
        }
        return _cachedKeyToSlot;
    }

    function getCachedKeyToDialogIndex() {
        if (!_cachedKeyToDialog) {
            _cachedKeyToDialog = buildKeyToDialogIndex();
        }
        return _cachedKeyToDialog;
    }

    function getCachedReverseSlot() {
        if (!_cachedReverseSlot) {
            _cachedReverseSlot = reverseIndex(getCachedKeyToWeaponSlot());
        }
        return _cachedReverseSlot;
    }

    function getCachedReverseDialog() {
        if (!_cachedReverseDialog) {
            _cachedReverseDialog = reverseIndex(getCachedKeyToDialogIndex());
        }
        return _cachedReverseDialog;
    }

    // handler for "Continue" behavior, 3 options to pick from
    function handleContinue() {
        if (settings.continueAction === 'close') {
            tryCloseTab();
            return true;
        }
        if (settings.continueAction === 'openFixed') {
            window.location.href = `https://www.torn.com/loader.php?sid=attack&user2ID=${settings.fixedTargetID}`;
            return true;
        }
        return false;
    }

    // check for the "Continue" button text
    function hasContinueText(btn) {
        const txt = (btn?.textContent || '').toLowerCase();
        return txt.includes('continue');
    }

    // robust, class-agnostic detection for "target is in hospital" banners
    function isHospitalBlocked() {
        // 1) Fast path: literal banner you said you see
        const literal = /this person is currently in hospital and cannot be attacked/i;
        const bodyText = (document.body?.innerText || document.body?.textContent || '');
        if (literal.test(bodyText)) return true;

        // 2) Fallback scan in a likely container, limited length
        const container = document.querySelector(
            '#mainContainer, #root, main, [role="main"], .content, [class*="content"]'
        ) || document.body;

        const text = (container.innerText || container.textContent || '').toLowerCase().slice(0, 5000);

        // Precompiled, newline-tolerant patterns
        const rxNearby = /\b(is|target|opponent)[\s\S]{0,40}\b(hospital|hospitalized|hospitalised)\b/; // handles breaks
        const rxInHospital = /\b(in|into)\s+the?\s*hospital\b/;

        return rxNearby.test(text) || rxInHospital.test(text);
    }

    // main logic for key handling, hints, menu, and mutation observer
    function findPrimaryButton() {
        const selectors = [
            'button.torn-btn:nth-child(1)',
            'button[class^="btn___"]:nth-child(1)',
            'button:contains("Continue")',
            'button:contains("Attack")'
        ];
        for (const selector of selectors) {
            const btn = document.querySelector(selector);
            if (btn && btn.offsetParent !== null) return btn; // Ensure button is visible
        }
        return null;
    }

    function getOverrideButtons() {
        try {
            const b3 =
                document.querySelector('button.torn-btn:nth-child(3)') ||
                document.querySelector('button[class^="btn___"]:nth-child(3)');
            if (!b3) return null;

            let b2 = b3.previousElementSibling;
            while (b2 && b2.tagName !== 'BUTTON') b2 = b2.previousElementSibling;

            let b1 = b2 ? b2.previousElementSibling : null;
            while (b1 && b1.tagName !== 'BUTTON') b1 = b1.previousElementSibling;

            return { b1, b2, b3 };
        } catch (error) {
            console.error('[Torn Numpad Helper] Error getting override buttons:', error);
            return null;
        }
    }

    // map keys to slots and dialog choices
    function buildKeyToWeaponSlot() {
        const map = new Map();
        for (const [slot, codes] of Object.entries(settings.weaponSlotKeys)) {
            for (const code of codes || []) map.set(code, Number(slot));
        }
        const decCodes = ['NumpadDecimal', 'NumpadComma'];
        const targetSlot = settings.decimalTarget === 'kick' ? 6 : 5;
        for (const dc of decCodes) {
            if (![5, 6].some(s => (settings.weaponSlotKeys[String(s)] || []).includes(dc))) {
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

    function selectorForWeaponSlot(slot) {
        switch (slot) {
            case 1: return '[data-id="weaponSlotPrimary"]';
            case 2: return '[data-id="weaponSlotSecondary"]';
            case 3: return '[data-id="weaponSlotMelee"]';
            case 4: return '[data-id="weaponSlotTemporary"]';

            // Punch and Kick are child elements of the "fists" container
            case 5: return '[data-id="weaponSlotFists"] > div:nth-child(1)'; // Punch
            case 6: return '[data-id="weaponSlotFists"] > div:nth-child(2)'; // Kick

            default: return null;
        }
    }

    // key hint ui
    const style = document.createElement('style');
    style.textContent = `
    .torn-keyhint { position: absolute; top: 4px; right: 4px; background: rgba(0,0,0,.55); color: #fff; border-radius: 4px; padding: 1px 4px; font-size: 10px; line-height: 1.2; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; letter-spacing: .2px; pointer-events: none; z-index: 2147483647; opacity: .9; }
    .torn-keyhint--multi { opacity: .85; }`;
    document.head.appendChild(style);

    // helpers for add/remove key hints
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

    // prettifiers and reverse index to group keys by target
    function prettyKeys(arr) {
        return (arr && arr.length ? arr : []).map(k => k.replace('Numpad', '')).join(', ');
    }

    function reverseIndex(map) {
        const out = new Map();
        for (const [code, n] of map.entries()) {
            if (!out.has(n)) out.set(n, []);
            out.get(n).push(code);
        }
        return out;
    }

    // main ui refresh, draw hints, buttons, or slots
    function updateHints() {
        try {
            clearAllHints();

            const ob = getOverrideButtons();
            if (ob && (ob.b1 || ob.b2 || ob.b3)) {
                const rev = getCachedReverseDialog();
                if (ob.b1) ensureHintOnElement(ob.b1, prettyKeys(rev.get(1) || ['4']) || '');
                if (ob.b2) ensureHintOnElement(ob.b2, prettyKeys(rev.get(2) || ['5']) || '');
                if (ob.b3) ensureHintOnElement(ob.b3, prettyKeys(rev.get(3) || ['6']) || '');
                return;
            }

            const primary = findPrimaryButton();
            if (primary) {
                const label = hasContinueText(primary)
                    ? (settings.continueAction === 'close' ? 'any → close' : settings.continueAction === 'openFixed' ? 'any → fixed' : 'any')
                    : 'any';
                ensureHintOnElement(primary, label);
                return;
            }

            const rev = getCachedReverseSlot();
            for (let slot = 1; slot <= 6; slot++) {
                const sel = selectorForWeaponSlot(slot);
                if (sel) ensureHintOnSelector(sel, prettyKeys(rev.get(slot) || []) || '');
            }
        } catch (error) {
            console.error('[Torn Numpad Helper] Error in updateHints:', error);
        }
    }

    function isAttackUiMissing() {
        // If there’s no primary action button and no weapon/punch/kick cards,
        // we’re effectively blocked. This is resilient to class hash changes.
        const hasPrimary =
            document.querySelector('button.torn-btn, button[class^="btn___"]') != null;

        const hasAnyCard =
            document.querySelector('.hoverEnabled___skjqK, [data-test*="weapon-card"], [data-test*="attack-card"]') != null;

        return !hasPrimary && !hasAnyCard;
    }

    // global key handler, ignore in text fields, hospital block, etc
    document.addEventListener(
        'keydown',
        (e) => {
            try {
                if (isTypingInField(e.target)) return;

                const keyToSlot = getCachedKeyToWeaponSlot();
                const keyToDlg = getCachedKeyToDialogIndex();
                if ((isHospitalBlocked() || isAttackUiMissing()) &&
                    (keyToSlot.has(e.code) || keyToDlg.has(e.code) || isNumpadKey(e.code))) {
                    e.preventDefault();
                    e.stopPropagation();
                    reloadOnce();
                    console.log('[HospCheck]', /this person is currently in hospital and cannot be attacked/i.test(document.body?.innerText || ''), /this person is currently in hospital and cannot be attacked/i.test(document.body?.textContent || ''));
                    return;
                }

                const ob = getOverrideButtons();
                if (ob && (ob.b1 || ob.b2 || ob.b3)) {
                    const idx = keyToDlg.get(e.code);
                    if (!idx) return;
                    const target = idx === 1 ? ob.b1 : idx === 2 ? ob.b2 : idx === 3;
                    if (clickEl(target)) { e.preventDefault(); e.stopPropagation(); }
                    return;
                }

                const primary = findPrimaryButton();
                if (primary) {
                    if (!isNumpadKey(e.code)) return;
                    if (hasContinueText(primary) && settings.continueAction !== 'default') {
                        e.preventDefault(); e.stopPropagation(); if (handleContinue()) return;
                    }
                    if (clickEl(primary)) { e.preventDefault(); e.stopPropagation(); }
                    return;
                }

                const slot = keyToSlot.get(e.code);
                if (!slot) return;
                const selector = selectorForWeaponSlot(slot);
                const el = selector ? document.querySelector(selector) : null;
                if (clickEl(el)) { e.preventDefault(); e.stopPropagation(); }
            } catch (error) {
                console.error('[Torn Numpad Helper] Error in keydown handler:', error);
            }
        },
        true
    );

    // track and clean up menu registrations
    let menuIds = [];
    function unregisterMenu() {
        if (menuIds.length && typeof GM_unregisterMenuCommand === 'function') {
            try { menuIds.forEach((id) => GM_unregisterMenuCommand(id)); } catch { }
        }
        menuIds = [];
    }

    // self-explanatory parser
    function parseKeyList(input) {
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

    // user input for maps, apply and save, refresh ui and menu
    function editKeysFor(label, current, apply) {
        const pretty = prettyKeys(current.map(k => k.replace('Numpad', '')));
        const input = prompt(
            `${label}\nEnter keys separated by commas/spaces. Examples: 1 2 3 0 ., 4 5 6, 7 8\nUse '.' for Decimal and ',' for Comma.\nCurrent: ${pretty || '(none)'}\n`,
            current.map(k => k.replace('Numpad', '')).join(' ')
        );
        if (input == null) return;
        const parsed = parseKeyList(input);
        if (parsed.length === 0 && input.trim() !== '') {
            alert('No valid keys found. Please use numbers 0-9, Enter, Add, Subtract, Multiply, Divide, Decimal (.), or Comma (,).');
            return;
        }
        apply(parsed);
        saveSettings();
        scheduleUpdate();
        registerMenu();
        console.info('[Torn Numpad Helper] Updated:', label, parsed);
    }

    // menu registration with dynamic labels
    function registerMenu() {
        if (typeof GM_registerMenuCommand !== 'function') return;
        unregisterMenu();

        const idShow = GM_registerMenuCommand('Show current mappings', () => {
            const keyToSlot = buildKeyToWeaponSlot();
            const keyToDlg = buildKeyToDialogIndex();
            alert(
                'Weapon slots (slot: keys)\n' +
                Array.from({ length: 6 }, (_, i) => i + 1)
                    .map(s => `${s}: ${prettyKeys((reverseIndex(keyToSlot).get(s) || []).map(x => x.replace('Numpad', ''))) || '(none)'}`)
                    .join('\n') +
                '\n\nDialog (index: keys)\n' +
                [1, 2, 3]
                    .map(i => `${i}: ${prettyKeys((reverseIndex(keyToDlg).get(i) || []).map(x => x.replace('Numpad', ''))) || '(none)'}`)
                    .join('\n') +
                `\n\nDecimal target: ${settings.decimalTarget}\nContinue: ${settings.continueAction}`
            );
        });
        menuIds.push(idShow);

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

        const labelDecimal = `Decimal target: ${settings.decimalTarget === 'kick' ? 'Kick (slot 6)' : 'Punch (slot 5)'} (toggle)`;
        const idDec = GM_registerMenuCommand(labelDecimal, async () => {
            settings.decimalTarget = settings.decimalTarget === 'kick' ? 'punch' : 'kick';
            saveSettings();
            scheduleUpdate();
            registerMenu();
            console.info('[Torn Numpad Helper] Decimal target set to:', settings.decimalTarget);
        });
        menuIds.push(idDec);

        const labelFixedTarget = `Fixed target ID: ${settings.fixedTargetID}`;
        const idFixedTarget = GM_registerMenuCommand(labelFixedTarget, () => {
            const newID = prompt(`Enter target ID for "attack fixed" action:\nCurrent: ${settings.fixedTargetID}`, settings.fixedTargetID);
            if (newID != null && /^\d+$/.test(newID.trim())) {
                settings.fixedTargetID = newID.trim();
                saveSettings();
                registerMenu();
                console.info('[Torn Numpad Helper] Fixed target ID set to:', settings.fixedTargetID);
            } else if (newID != null) {
                alert('Invalid ID. Please enter a numeric user ID.');
            }
        });
        menuIds.push(idFixedTarget);

        const labelContinue = `Continue action: ${settings.continueAction === 'close' ? 'Close tab' :
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

    // init
    registerMenu();

    // throttle schedule to avoid extra DOM work with requestAnimationFrame
    const scheduleUpdate = (() => {
        let t = null;
        return () => {
            if (t) return;
            t = requestAnimationFrame(() => {
                t = null;
                updateHints();
            });
        };
    })();

    // init
    updateHints();

    // real-time updates on DOM changes
    const observer = new MutationObserver(() => scheduleUpdate());
    observer.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['class', 'style'],
    });

    // cleanup on page unload to prevent memory leaks
    window.addEventListener('beforeunload', () => {
        if (observer) observer.disconnect();
        clearKeyCache();
    });

    // refresh on focus (tab switching, etc)
    window.addEventListener('focus', scheduleUpdate);
})();
