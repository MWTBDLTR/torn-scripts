// ==UserScript==
// @name         Torn Attack Helper & Keybinds (Context Aware)
// @namespace    https://github.com/MWTBDLTR/torn-scripts/
// @version      1.0.2
// @description  Numpad shortcuts for Torn attacks, customizable weapon slots, hospital reload, and configurable chain targets.
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

    // CONST & SELECTORS
    const CONSTANTS = {
        KEY_COOLDOWN: 150, // ms
        DEBOUNCE_TIME: 75, // ms
        DEFAULT_CHAIN_TARGET: '3547823', // Default NPC if none set
    };

    const SELECTORS = {
        // use data-attributes over class names because what is maintainability?
        primaryButton: '[data-test="attack-button"], button.torn-btn:first-child, button[class^="btn___"]:first-child',
        
        // Weapon Slots
        slots: {
            1: '#weapon_main',
            2: '#weapon_second',
            3: '#weapon_melee',
            4: '#weapon_temp',
            5: '#weapon_fists', // Punch
            6: '#weapon_kick',  // Kick
        },

        // container used to detect hospital text
        mainContainer: '#mainContainer, #root, main, [role="main"], .content',
        
        // id the end-of-fight buttons (Leave, Mug, Hosp)
        // look for the 3rd button in the group to confirm presence
        actionButtons: {
            group3: 'button.torn-btn:nth-child(3), button[class^="btn___"]:nth-child(3)'
        }
    };

    // UTILS: STORAGE & GM WRAPPER
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

        // maps a KeyboardEvent.code to a logical action
        getKeyMapping(code) {
            // at the end of a fight prioritize dialog keys (Leave/Mug/Hosp)
            // over weapons to prevent conflicts
            const isFightOver = !!document.querySelector(SELECTORS.actionButtons.group3);

            if (isFightOver) {
                 for (const [idx, keys] of Object.entries(this.data.dialogKeys)) {
                    if (keys.includes(code)) return { type: 'dialog', index: Number(idx) };
                }
            }

            // check weapons
            for (const [slot, keys] of Object.entries(this.data.weaponSlotKeys)) {
                if (keys.includes(code)) return { type: 'weapon', slot: Number(slot) };
            }

            // check special decimal logic (if not explicitly mapped above)
            if (['NumpadDecimal', 'NumpadComma'].includes(code)) {
                const isAlreadyMapped = Object.values(this.data.weaponSlotKeys).some(k => k.includes(code));
                if (!isAlreadyMapped) {
                    return { 
                        type: 'weapon', 
                        slot: this.data.decimalTarget === 'kick' ? 6 : 5 
                    };
                }
            }

            // double check dialogs if we weren't at the end of the fight (fallback)
            if (!isFightOver) {
                for (const [idx, keys] of Object.entries(this.data.dialogKeys)) {
                    if (keys.includes(code)) return { type: 'dialog', index: Number(idx) };
                }
            }

            // numpad fallback for primary action
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
                    position: absolute; top: 2px; right: 2px;
                    background: rgba(0, 0, 0, 0.75); color: #fff;
                    border: 1px solid rgba(255,255,255,0.2);
                    border-radius: 4px; padding: 2px 5px;
                    font-size: 11px; font-weight: 600;
                    font-family: 'Segoe UI', Roboto, sans-serif;
                    pointer-events: none; z-index: 9999;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.3);
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

        addHint(element, text, isAlert = false) {
            if (!element) return;
            // ensure relative positioning for absolute child
            if (window.getComputedStyle(element).position === 'static') {
                element.style.position = 'relative';
            }
            
            // prevent duplicate hints
            if (element.querySelector('.tah-hint')) return;

            const hint = document.createElement('span');
            hint.className = `tah-hint ${isAlert ? 'tah-hint-multi' : ''}`;
            hint.textContent = text;
            element.appendChild(hint);
        },

        formatKeys(keys) {
            if (!keys || keys.length === 0) return '';
            return keys.map(k => k.replace('Numpad', '').replace('Decimal', '.').replace('Comma', ',')).join('/');
        }
    };

    // ATTACK LOGIC & DOM HANDLING
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
                UI.addHint(dialogs.b1, UI.formatKeys(Config.data.dialogKeys['1']));
                UI.addHint(dialogs.b2, UI.formatKeys(Config.data.dialogKeys['2']));
                UI.addHint(dialogs.b3, UI.formatKeys(Config.data.dialogKeys['3']));
                return;
            }

            const primary = document.querySelector(SELECTORS.primaryButton);
            if (primary) {
                const text = (primary.innerText || '').toLowerCase();
                let hintText = 'Any Num';
                
                if (text.includes('continue')) {
                    if (Config.data.continueAction === 'close') hintText += ' \u2192 Close';
                    else if (Config.data.continueAction === 'openFixed') hintText += ' \u2192 Chain';
                }
                UI.addHint(primary, hintText);
            }

            for (let i = 1; i <= 6; i++) {
                const el = document.querySelector(SELECTORS.slots[i]);
                if (!el) continue;

                let keys = Config.data.weaponSlotKeys[String(i)] || [];
                
                if ((Config.data.decimalTarget === 'kick' && i === 6) || (Config.data.decimalTarget === 'punch' && i === 5)) {
                    const decimalMappedElsewhere = Object.values(Config.data.weaponSlotKeys).some(k => k.includes('NumpadDecimal'));
                    if (!decimalMappedElsewhere) keys = [...keys, 'Numpad.'];
                }

                if (keys.length) UI.addHint(el, UI.formatKeys(keys));
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

            let actionSuccess = false;

            // Handle Dialogs
            const dialogs = this.getOverrideButtons();
            if (dialogs && dialogs.b3 && mapping.type === 'dialog') {
                const btn = mapping.index === 1 ? dialogs.b1 : mapping.index === 2 ? dialogs.b2 : dialogs.b3;
                if (btn) {
                    btn.click();
                    actionSuccess = true;
                }
            }
            
            // Handle Weapons
            else if (mapping.type === 'weapon') {
                const el = document.querySelector(SELECTORS.slots[mapping.slot]);
                
                // if the weapon slot does not exist or is hidden (Start of fight),
                // treat this keypress as a "Primary Fallback" to hit the start/continue button
                if (el && el.offsetParent !== null) {
                    el.click();
                    actionSuccess = true;
                } else {
                    mapping.type = 'primary_fallback'; // change type to fall through to next block
                }
            }

            // Handle Primary / Continue Button (or fallback from missing weapon)
            if (!actionSuccess && mapping.type === 'primary_fallback') {
                const primary = document.querySelector(SELECTORS.primaryButton);
                if (primary) {
                    const text = (primary.innerText || '').toLowerCase();
                    
                    if (text.includes('continue') && Config.data.continueAction !== 'default') {
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

    // MENU & SETTINGS UI
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
        console.info(`[Torn Attack Helper] v${GM.info.script.version} Loaded.`);
    }

    init();

})();