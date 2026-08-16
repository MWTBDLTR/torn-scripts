// ==UserScript==
// @name         Torn Attack Page Helper (MacBook)
// @namespace    https://github.com/MWTBDLTR/torn-scripts/
// @version      1.5
// @description  Customizable keyboard shortcuts (J,K,L and Arrow Keys) for attacks to enhance accessibility on MacBook layout
// @author       MrChurch [3654415]
// @license      CC-BY-NC-SA-4.0
// @match        https://www.torn.com/page.php?sid=attack*
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
        DEFAULT_TARGET: '3547823', // fallback user id if we haven't saved one yet
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

        mainContainer: '#mainContainer, #root, main, [role="main"], .content'
    };

    // Handles saving and loading settings
    const Storage = {
        async get(key, defaultVal) {
            const fullKey = `tah_mac_${key}`;
            try {
                if (typeof GM !== 'undefined' && GM.getValue) return await GM.getValue(fullKey, defaultVal);
                if (typeof GM_getValue !== 'undefined') return GM_getValue(fullKey, defaultVal);
            } catch (e) { console.warn('GM Error', e); }
            const val = localStorage.getItem(fullKey);
            return val !== null ? JSON.parse(val) : defaultVal;
        },
        async set(key, val) {
            const fullKey = `tah_mac_${key}`;
            try {
                if (typeof GM !== 'undefined' && GM.setValue) return await GM.setValue(fullKey, val);
                if (typeof GM_setValue !== 'undefined') return GM_setValue(fullKey, val);
            } catch (e) { console.warn('GM Error', e); }
            localStorage.setItem(fullKey, JSON.stringify(val));
        }
    };

    // MacBook customized configuration layout
    const Config = {
        data: {
            weaponSlotKeys: {
                '1': ['ArrowLeft'],
                '2': ['ArrowUp'],
                '3': ['ArrowRight'],
                '4': ['ArrowDown'],
                '5': ['Comma'],
                '6': ['Period'],
            },
            dialogKeys: {
                '1': ['KeyJ'], // leave
                '2': ['KeyK'], // mug
                '3': ['KeyL'], // hospitalize
            },
            continueAction: 'default', // 'default', 'close', 'openFixed'
            fixedTargetId: CONSTANTS.DEFAULT_TARGET
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
            const dialogs = AttackController.getOverrideButtons();
            const isFightOver = !!(dialogs && dialogs.b3);

            if (isFightOver) {
                for (const [idx, keys] of Object.entries(this.data.dialogKeys)) {
                    if (keys.includes(code)) return { type: 'dialog', index: Number(idx) };
                }
            }

            for (const [slot, keys] of Object.entries(this.data.weaponSlotKeys)) {
                if (keys.includes(code)) return { type: 'weapon', slot: Number(slot) };
            }

            if (!isFightOver) {
                for (const [idx, keys] of Object.entries(this.data.dialogKeys)) {
                    if (keys.includes(code)) return { type: 'dialog', index: Number(idx) };
                }
            }

            // Spacebar can act as an emergency click on the Primary button
            if (code === 'Space') {
                return { type: 'primary_fallback' };
            }

            return null;
        }
    };

    const UI = {
        injectStyles() {
            const css = `
                .tah-hint {
                    position: absolute;
                    background: rgba(0, 0, 0, 0.65);
                    color: #fff;
                    border: 1px solid rgba(255,255,255,0.2);
                    border-radius: 3px;
                    padding: 1px 4px;
                    font-size: 10px;
                    font-weight: bold;
                    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                    pointer-events: none;
                    z-index: 9999;
                    line-height: 12px;
                    text-transform: uppercase;
                }
                .tah-pos-slot {
                    top: 50%;
                    bottom: auto;
                    right: 4px;
                    transform: translateY(-50%);
                }
                .tah-pos-dialog {
                    top: 50%;
                    bottom: auto;
                    left: 100%;
                    right: auto;
                    transform: translateY(-50%);
                    margin-left: 6px;
                    white-space: nowrap;
                }
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
            return keys.map(k => {
                return k.replace('ArrowLeft', '←')
                        .replace('ArrowUp', '↑')
                        .replace('ArrowRight', '→')
                        .replace('ArrowDown', '↓')
                        .replace('Key', '')
                        .replace('Comma', ',')
                        .replace('Period', '.');
            }).join('/');
        }
    };

    const AttackController = {
        lastActionTime: 0,

        getOverrideButtons() {
            const container = document.querySelector(SELECTORS.mainContainer);
            if (!container) return null;

            const allButtons = Array.from(container.querySelectorAll('button'));
            let b1 = null, b2 = null, b3 = null;

            for (const btn of allButtons) {
                const text = (btn.textContent || '').toLowerCase().trim();
                if (text === 'leave') b1 = btn;
                else if (text === 'mug') b2 = btn;
                else if (text === 'hospitalize') b3 = btn;
            }

            if (b1 || b2 || b3) return { b1, b2, b3 };
            return null;
        },

        isTyping(target) {
            if (!target) return false;
            const nodeName = target.nodeName;
            return nodeName === 'INPUT' || nodeName === 'TEXTAREA' || target.isContentEditable;
        },

        isInHospital() {
            const bodyText = document.body.textContent || '';
            if (/this person is currently in hospital and cannot be attacked/i.test(bodyText)) return true;

            const container = document.querySelector(SELECTORS.mainContainer);
            if (container) {
                const text = container.textContent.toLowerCase();
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
                const target = fixedTargetId || CONSTANTS.DEFAULT_TARGET;
                window.location.href = `https://www.torn.com/loader.php?sid=attack&user2ID=${target}`;
                return true;
            }
            return false;
        },

        updateVisuals() {
            UI.clearHints();

            const dialogs = this.getOverrideButtons();
            if (dialogs && dialogs.b3) {
                UI.addHint(dialogs.b1, UI.formatKeys(Config.data.dialogKeys['1']), false, 'dialog');
                UI.addHint(dialogs.b2, UI.formatKeys(Config.data.dialogKeys['2']), false, 'dialog');
                UI.addHint(dialogs.b3, UI.formatKeys(Config.data.dialogKeys['3']), false, 'dialog');
                return;
            }

            const primary = document.querySelector(SELECTORS.primaryButton);
            if (primary) {
                const text = (primary.innerText || '').toLowerCase();
                let hintText = 'Space';

                if (text.includes('continue')) {
                    if (Config.data.continueAction === 'close') hintText += ' → Close';
                    else if (Config.data.continueAction === 'openFixed') hintText += ' → Next';
                }
                UI.addHint(primary, hintText, false, 'slot');
            }

            for (let i = 1; i <= 6; i++) {
                const el = document.querySelector(SELECTORS.slots[i]);
                if (!el) continue;
                let keys = Config.data.weaponSlotKeys[String(i)] || [];
                if (keys.length) UI.addHint(el, UI.formatKeys(keys), false, 'slot');
            }
        },

        handleInput(e) {
            if (this.isTyping(e.target)) return;

            const now = Date.now();
            if (now - this.lastActionTime < CONSTANTS.KEY_COOLDOWN) return;

            // e.code yields precise mappings unaffected by modifiers (e.g. "KeyJ", "ArrowLeft")
            let mapping = Config.getKeyMapping(e.code);
            if (!mapping) return;

            if (this.isInHospital()) {
                console.log('[Torn Attack Page Helper] Target is in the hospital. Reloading...');
                window.location.reload();
                return;
            }

            const primary = document.querySelector(SELECTORS.primaryButton);
            const primaryText = primary ? (primary.innerText || '').toLowerCase() : '';
            const isPriorityPhase = primary && (primaryText.includes('start') || primaryText.includes('continue'));

            let actionSuccess = false;

            const dialogs = this.getOverrideButtons();
            if (dialogs && dialogs.b3 && mapping.type === 'dialog') {
                const btn = mapping.index === 1 ? dialogs.b1 : mapping.index === 2 ? dialogs.b2 : dialogs.b3;
                if (btn) {
                    btn.click();
                    actionSuccess = true;
                }
            }

            else if (isPriorityPhase && (mapping.type === 'weapon' || mapping.type === 'primary_fallback')) {
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

            else if (mapping.type === 'weapon') {
                const el = document.querySelector(SELECTORS.slots[mapping.slot]);
                if (el && el.offsetParent !== null) {
                    el.click();
                    actionSuccess = true;
                }
            }

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

    const Menu = {
        menuIds: [],

        promptKey(label, currentKeys) {
            const str = prompt(
                `Enter standard keyboard key for "${label}" (e.g. 'J', 'ArrowUp', ',', '.')\n\nCurrent: ${currentKeys.join(' ')}`
            );
            if (str === null) return null;

            return str.split(/[\s,]+/)
                .map(s => s.trim())
                .filter(Boolean)
                .map(s => {
                    if (s.toLowerCase() === 'arrowup') return 'ArrowUp';
                    if (s.toLowerCase() === 'arrowdown') return 'ArrowDown';
                    if (s.toLowerCase() === 'arrowleft') return 'ArrowLeft';
                    if (s.toLowerCase() === 'arrowright') return 'ArrowRight';
                    if (s === ',') return 'Comma';
                    if (s === '.') return 'Period';
                    if (s.length === 1 && /[a-zA-Z]/.test(s)) return `Key${s.toUpperCase()}`;
                    return s;
                });
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

            ['Leave (J)', 'Mug (K)', 'Hosp (L)'].forEach((label, idx) => {
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

            const contLabels = { default: 'Default Click', close: 'Close Tab', openFixed: 'Follow-up Target' };
            const contLabel = `Continue Action: ${contLabels[Config.data.continueAction]} (Cycle)`;
            this.menuIds.push(GM_registerMenuCommand(contLabel, async () => {
                const modes = ['default', 'close', 'openFixed'];
                const next = modes[(modes.indexOf(Config.data.continueAction) + 1) % modes.length];
                Config.data.continueAction = next;
                await Config.save();
                this.register();
                AttackController.updateVisuals();
            }));

            const followupLabel = `Set Follow-up ID (Current: ${Config.data.fixedTargetId || 'Default'})`;
            this.menuIds.push(GM_registerMenuCommand(followupLabel, async () => {
                const input = prompt('Enter User ID for chaining:', Config.data.fixedTargetId);
                if (input && /^\d+$/.test(input.trim())) {
                    Config.data.fixedTargetId = input.trim();
                    await Config.save();
                    this.register();
                }
            }));
        }
    };

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
                    const btn = document.querySelector(SELECTORS.primaryButton);
                    if (btn) UI.addHint(btn, "TARGET HOSPITALIZED", true);
                }
            }, CONSTANTS.DEBOUNCE_TIME);
        });

        const targetNode = document.querySelector(SELECTORS.mainContainer) || document.body;
        observer.observe(targetNode, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'disabled']
        });

        AttackController.updateVisuals();
        console.log(`[Torn Attack Page Helper - Mac Edition] Loaded successfully.`);
    }

    init();

})();