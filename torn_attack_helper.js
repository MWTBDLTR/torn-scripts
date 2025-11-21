// ==UserScript==
// @name         Torn Attack Helper
// @namespace    https://github.com/MWTBDLTR/torn-scripts/
// @version      1.1.4
// @description  Customizable numpad shortcuts for attacks to enhance accessibility
// @author       MrChurch [3654415]
// @license      MIT
// @match        https://www.torn.com/loader.php*
// @run-at       document-idle
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_addStyle
// ==/UserScript==

(async function () {
    'use strict';

    const CONSTANTS = {
        KEY_COOLDOWN: 150,
        DEBOUNCE_TIME: 75,
        DEFAULT_CHAIN_TARGET: '3547823', // default if none set
    };

    const SELECTORS = {
        primaryButton: '[data-test="attack-button"], button.torn-btn:first-child, button[class^="btn___"]:first-child',

        slots: {
            1: '#weapon_main',
            2: '#weapon_second',
            3: '#weapon_melee',
            4: '#weapon_temp',
            5: '#weapon_fists',
            6: '#weapon_kick',
        },

        mainContainer: '#mainContainer, #root, main, [role="main"], .content',

        // End-of-fight buttons (Leave, Mug, Hosp)
        actionButtons: {
            group3: 'button.torn-btn:nth-child(3), button[class^="btn___"]:nth-child(3)'
        }
    };

    // STORAGE & GM WRAPPER
    const Storage = {
        async get(key, defaultVal) {
            const fullKey = `tah_${key}`;
            try {
                if (typeof GM !== 'undefined' && GM.getValue) return await GM.getValue(fullKey, defaultVal);
                if (typeof GM_getValue !== 'undefined') return GM_getValue(fullKey, defaultVal);
            } catch (e) { console.warn('GM Error', e); }
            const val = localStorage.getItem(fullKey);
            return val !== null ? JSON.parse(val) : defaultVal;
        },
        async set(key, val) {
            const fullKey = `tah_${key}`;
            try {
                if (typeof GM !== 'undefined' && GM.setValue) return await GM.setValue(fullKey, val);
                if (typeof GM_setValue !== 'undefined') return GM_setValue(fullKey, val);
            } catch (e) { console.warn('GM Error', e); }
            localStorage.setItem(fullKey, JSON.stringify(val));
        }
    };

    // CONFIG
    const Config = {
        data: {
            weaponSlotKeys: {
                '1': ['Numpad1'],
                '2': ['Numpad2'],
                '3': ['Numpad3'],
                '4': ['Numpad0'],
                '5': ['NumpadDecimal', 'NumpadComma'],
                '6': [],
            },
            decimalTarget: 'punch', // 'punch' (5) or 'kick' (6)
            dialogKeys: {
                '1': ['Numpad4'], // Leave
                '2': ['Numpad5'], // Mug
                '3': ['Numpad6'], // Hosp
            },
            continueAction: 'default', // 'default', 'close', 'openFixed'
            fixedTargetId: CONSTANTS.DEFAULT_CHAIN_TARGET
        },

        async load() {
            const saved = await Storage.get('settings', null);
            if (saved) {
                this.data = { ...this.data, ...saved };
                if (!saved.weaponSlotKeys) this.data.weaponSlotKeys = { ...Config.data.weaponSlotKeys };
                if (!saved.dialogKeys) this.data.dialogKeys = { ...Config.data.dialogKeys };
            }
        },

        async save() {
            await Storage.set('settings', this.data);
        },

        getKeyMapping(code) {
            // Context check: End of fight
            const isFightOver = !!document.querySelector(SELECTORS.actionButtons.group3);

            if (isFightOver) {
                for (const [idx, keys] of Object.entries(this.data.dialogKeys)) {
                    if (keys.includes(code)) return { type: 'dialog', index: Number(idx) };
                }
            }

            // Check weapons
            for (const [slot, keys] of Object.entries(this.data.weaponSlotKeys)) {
                if (keys.includes(code)) return { type: 'weapon', slot: Number(slot) };
            }

            // Check decimal logic
            if (['NumpadDecimal', 'NumpadComma'].includes(code)) {
                const isAlreadyMapped = Object.values(this.data.weaponSlotKeys).some(k => k.includes(code));
                if (!isAlreadyMapped) {
                    return {
                        type: 'weapon',
                        slot: this.data.decimalTarget === 'kick' ? 6 : 5
                    };
                }
            }

            // Fallback check for dialogs
            if (!isFightOver) {
                for (const [idx, keys] of Object.entries(this.data.dialogKeys)) {
                    if (keys.includes(code)) return { type: 'dialog', index: Number(idx) };
                }
            }

            // Numpad fallback
            if (code.startsWith('Numpad')) {
                return { type: 'primary_fallback' };
            }

            return null;
        }
    };

    // UI MANAGER
    const UI = {
        injectStyles() {
            const css = `
                .tah-hint {
                    position: absolute;
                    background: rgba(0, 0, 0, 0.5);
                    color: #fff;
                    border: 1px solid rgba(0,0,0,0.5);
                    border-radius: 1px;
                    padding: 0px 2px;
                    font-size: 10px;
                    font-weight: 400;
                    font-family: sans-serif;
                    pointer-events: none;
                    z-index: 9999;
                    line-height: 12px;
                }

                /* Weapon Slots: Vertically Centered, inside right edge */
                .tah-pos-slot {
                    top: 50%;
                    bottom: auto;
                    right: 2px;
                    transform: translateY(-50%);
                }

                /* Dialogs: Vertically Centered, Outside to the right */
                .tah-pos-dialog {
                    top: 50%;
                    bottom: auto;
                    left: 100%;
                    right: auto;
                    transform: translateY(-50%);
                    margin-left: 6px;
                    white-space: nowrap;
                }

                /* Fallback for standard buttons (like Start) */
                .tah-pos-default {
                    bottom: 2px;
                    right: 2px;
                }

                .tah-hint-multi { border-color: #ffd700; color: #ffd700; }
            `;
            if (typeof GM_addStyle !== 'undefined') {
                GM_addStyle(css);
            } else {
                const style = document.createElement('style');
                style.textContent = css;
                document.head.appendChild(style);
            }
        },

        clearHints() {
            document.querySelectorAll('.tah-hint').forEach(el => el.remove());
        },

        addHint(element, text, isAlert = false, type = 'default') {
            if (!element) return;
            if (window.getComputedStyle(element).position === 'static') {
                element.style.position = 'relative';
            }
            if (element.querySelector('.tah-hint')) return;

            const hint = document.createElement('span');

            let posClass = 'tah-pos-default';
            if (type === 'slot') posClass = 'tah-pos-slot';
            if (type === 'dialog') posClass = 'tah-pos-dialog';

            hint.className = `tah-hint ${posClass} ${isAlert ? 'tah-hint-multi' : ''}`;
            hint.textContent = text;
            element.appendChild(hint);
        },

        formatKeys(keys) {
            if (!keys || keys.length === 0) return '';
            return keys.map(k => k.replace('Numpad', '').replace('Decimal', '.').replace('Comma', ',')).join('/');
        }
    };

    // ATTACK LOGIC
    const AttackController = {
        lastActionTime: 0,

        getOverrideButtons() {
            const b3 = document.querySelector(SELECTORS.actionButtons.group3);
            if (!b3) return null;

            let b2 = b3.previousElementSibling;
            while (b2 && b2.tagName !== 'BUTTON') b2 = b2.previousElementSibling;

            let b1 = b2 ? b2.previousElementSibling : null;
            while (b1 && b1.tagName !== 'BUTTON') b1 = b1.previousElementSibling;

            return { b1, b2, b3 };
        },

        isTyping(target) {
            if (!target) return false;
            const nodeName = target.nodeName;
            return nodeName === 'INPUT' || nodeName === 'TEXTAREA' || target.isContentEditable;
        },

        isInHospital() {
            const bodyText = document.body.innerText || '';
            if (/this person is currently in hospital and cannot be attacked/i.test(bodyText)) return true;

            const container = document.querySelector(SELECTORS.mainContainer);
            if (container) {
                const text = container.innerText.toLowerCase();
                return /\b(target|opponent|person).{0,30}\b(hospital)/.test(text);
            }
            return false;
        },

        handleContinue() {
            const { continueAction, fixedTargetId } = Config.data;

            if (continueAction === 'close') {
                window.close();
                return true;
            }
            if (continueAction === 'openFixed') {
                const target = fixedTargetId || CONSTANTS.DEFAULT_CHAIN_TARGET;
                window.location.href = `https://www.torn.com/loader.php?sid=attack&user2ID=${target}`;
                return true;
            }
            return false;
        },

        updateVisuals() {
            UI.clearHints();

            const dialogs = this.getOverrideButtons();
            if (dialogs && dialogs.b3) {
                // Pass 'dialog' type here
                UI.addHint(dialogs.b1, UI.formatKeys(Config.data.dialogKeys['1']), false, 'dialog');
                UI.addHint(dialogs.b2, UI.formatKeys(Config.data.dialogKeys['2']), false, 'dialog');
                UI.addHint(dialogs.b3, UI.formatKeys(Config.data.dialogKeys['3']), false, 'dialog');
                return;
            }

            const primary = document.querySelector(SELECTORS.primaryButton);
            if (primary) {
                const text = (primary.innerText || '').toLowerCase();
                let hintText = 'Any';

                if (text.includes('continue')) {
                    if (Config.data.continueAction === 'close') hintText += ' \u2192 Close';
                    else if (Config.data.continueAction === 'openFixed') hintText += ' \u2192 Chain';
                }
                // Primary usually uses slot styling or default
                UI.addHint(primary, hintText, false, 'slot');
            }

            for (let i = 1; i <= 6; i++) {
                const el = document.querySelector(SELECTORS.slots[i]);
                if (!el) continue;

                let keys = Config.data.weaponSlotKeys[String(i)] || [];

                if ((Config.data.decimalTarget === 'kick' && i === 6) || (Config.data.decimalTarget === 'punch' && i === 5)) {
                    const decimalMappedElsewhere = Object.values(Config.data.weaponSlotKeys).some(k => k.includes('NumpadDecimal'));
                    if (!decimalMappedElsewhere) keys = [...keys, 'Numpad.'];
                }

                // Pass 'slot' type here
                if (keys.length) UI.addHint(el, UI.formatKeys(keys), false, 'slot');
            }
        },

        handleInput(e) {
            if (this.isTyping(e.target)) return;

            const now = Date.now();
            if (now - this.lastActionTime < CONSTANTS.KEY_COOLDOWN) return;

            let mapping = Config.getKeyMapping(e.code);
            if (!mapping) return;

            if (this.isInHospital()) {
                console.log('[AttackHelper] Target in hospital. Reloading...');
                window.location.reload();
                return;
            }

            // DETECT GAME STATE
            const primary = document.querySelector(SELECTORS.primaryButton);
            const primaryText = primary ? (primary.innerText || '').toLowerCase() : '';

            // If text is "start" OR "continue", we override everything to click this button
            // We do not override if the text is "attack", so we can still switch weapons during the fight
            const isPriorityPhase = primary && (primaryText.includes('start') || primaryText.includes('continue'));

            let actionSuccess = false;

            // post fight
            const dialogs = this.getOverrideButtons();
            if (dialogs && dialogs.b3 && mapping.type === 'dialog') {
                const btn = mapping.index === 1 ? dialogs.b1 : mapping.index === 2 ? dialogs.b2 : dialogs.b3;
                if (btn) {
                    btn.click();
                    actionSuccess = true;
                }
            }

            // start or end override so any mapped key clicks the primary button
            else if (isPriorityPhase && (mapping.type === 'weapon' || mapping.type === 'primary_fallback')) {
                if (primary) {
                    // handle continue-specific actions (like chain loader)
                    if (primaryText.includes('continue') && Config.data.continueAction !== 'default') {
                        if (this.handleContinue()) {
                            e.preventDefault();
                            return;
                        }
                    }
                    primary.click();
                    actionSuccess = true;
                }
            }

            // mid-fight
            else if (mapping.type === 'weapon') {
                const el = document.querySelector(SELECTORS.slots[mapping.slot]);
                if (el && el.offsetParent !== null) {
                    el.click();
                    actionSuccess = true;
                }
            }

            // fallback
            else if (mapping.type === 'primary_fallback') {
                if (primary) {
                    if (primaryText.includes('continue') && Config.data.continueAction !== 'default') {
                        if (this.handleContinue()) {
                            e.preventDefault();
                            return;
                        }
                    }
                    primary.click();
                    actionSuccess = true;
                }
            }

            if (actionSuccess) {
                this.lastActionTime = now;
                e.preventDefault();
                e.stopPropagation();
            }
        }
    };

    // TamperMonkey or other menu
    const Menu = {
        menuIds: [],

        promptKey(label, currentKeys) {
            const str = prompt(
                `Enter keys for "${label}" separated by space/comma.\nUse '.' for Decimal.\n\nCurrent: ${currentKeys.join(' ')}`
            );
            if (str === null) return null;

            return str.split(/[\s,]+/)
                .map(s => s.trim())
                .filter(Boolean)
                .map(s => {
                    if (s === '.') return 'NumpadDecimal';
                    if (s === ',') return 'NumpadComma';
                    if (s.startsWith('Numpad')) return s;
                    if (/^\d$/.test(s)) return `Numpad${s}`;
                    return null;
                })
                .filter(Boolean);
        },

        register() {
            this.menuIds.forEach(id => GM_unregisterMenuCommand(id));
            this.menuIds = [];

            for (let i = 1; i <= 6; i++) {
                const id = GM_registerMenuCommand(`Edit Slot ${i} Keys`, async () => {
                    const newKeys = this.promptKey(`Weapon Slot ${i}`, Config.data.weaponSlotKeys[i] || []);
                    if (newKeys) {
                        Config.data.weaponSlotKeys[i] = newKeys;
                        await Config.save();
                        AttackController.updateVisuals();
                    }
                });
                this.menuIds.push(id);
            }

            ['Leave (Left)', 'Mug (Middle)', 'Hosp (Right)'].forEach((label, idx) => {
                const mapIdx = idx + 1;
                const id = GM_registerMenuCommand(`Edit ${label} Keys`, async () => {
                    const newKeys = this.promptKey(label, Config.data.dialogKeys[mapIdx] || []);
                    if (newKeys) {
                        Config.data.dialogKeys[mapIdx] = newKeys;
                        await Config.save();
                        AttackController.updateVisuals();
                    }
                });
                this.menuIds.push(id);
            });

            const decLabel = `Decimal Key: ${Config.data.decimalTarget.toUpperCase()} (Click to Swap)`;
            this.menuIds.push(GM_registerMenuCommand(decLabel, async () => {
                Config.data.decimalTarget = Config.data.decimalTarget === 'punch' ? 'kick' : 'punch';
                await Config.save();
                this.register();
                AttackController.updateVisuals();
            }));

            const contLabels = { default: 'Default Click', close: 'Close Tab', openFixed: 'Chain Target' };
            const contLabel = `Continue Action: ${contLabels[Config.data.continueAction]} (Cycle)`;
            this.menuIds.push(GM_registerMenuCommand(contLabel, async () => {
                const modes = ['default', 'close', 'openFixed'];
                const next = modes[(modes.indexOf(Config.data.continueAction) + 1) % modes.length];
                Config.data.continueAction = next;
                await Config.save();
                this.register();
                AttackController.updateVisuals();
            }));

            const chainLabel = `Set Chain ID (Current: ${Config.data.fixedTargetId || 'Default'})`;
            this.menuIds.push(GM_registerMenuCommand(chainLabel, async () => {
                const input = prompt('Enter User ID for chaining (used when Continue Action is "Chain Target"):', Config.data.fixedTargetId);
                if (input && /^\d+$/.test(input.trim())) {
                    Config.data.fixedTargetId = input.trim();
                    await Config.save();
                    this.register();
                }
            }));
        }
    };

    // INIT
    async function init() {
        const params = new URLSearchParams(location.search);
        if (!(params.get('sid') === 'attack' && params.has('user2ID'))) return;

        await Config.load();
        UI.injectStyles();
        Menu.register();

        document.addEventListener('keydown', (e) => AttackController.handleInput(e), true);

        let timeout;
        const observer = new MutationObserver(() => {
            if (timeout) clearTimeout(timeout);
            timeout = setTimeout(() => {
                AttackController.updateVisuals();
                if (AttackController.isInHospital()) {
                    location.reload();
                }
            }, CONSTANTS.DEBOUNCE_TIME);
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'disabled']
        });

        AttackController.updateVisuals();
        console.log(`[Torn Attack Helper] v${GM.log.script.version} Loaded`);
    }

    init();

})();