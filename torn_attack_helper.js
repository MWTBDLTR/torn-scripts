// ==UserScript==
// @name         Torn Attack Page Helper
// @namespace    https://github.com/MWTBDLTR/torn-scripts/
// @version      1.8
// @description  Customizable numpad shortcuts for attacks to enhance accessibility
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
  "use strict";

  const CONSTANTS = {
    KEY_COOLDOWN: 150,
    DEBOUNCE_TIME: 75,
    DEFAULT_TARGET: "3547823", // fallback user id if we haven't saved one yet
  };

  const SELECTORS = {
    // NOTE: these are ORDERED fallback lists, not CSS union selectors.
    // A comma-separated CSS selector returns the first match in DOM order
    // across all branches, not "try branch 1, then branch 2" - so we
    // resolve these with querySelectorFallback() instead of querySelector().
    primaryButton: [
      '[data-test="attack-button"]',
      "button.torn-btn:first-child",
      'button[class^="btn___"]:first-child',
    ],

    slots: {
      1: "#weapon_main",
      2: "#weapon_second",
      3: "#weapon_melee",
      4: "#weapon_temp",
      5: "#weapon_fists",
      6: "#weapon_kick",
    },

    // Narrowed down to the specific react roots where the fight happens
    mainContainer: [
      "#mainContainer",
      "#root",
      "main",
      '[role="main"]',
      ".content",
    ],
  };

  // tries each selector in priority order and returns the first element found,
  // unlike a comma-joined CSS selector which returns the first DOM-order match
  // across ALL branches regardless of priority
  function querySelectorFallback(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  // summarizes an element for console logging - used to identify, without
  // guessing, exactly what a selector resolved to when a shortcut appears to
  // do nothing (e.g. another script's injected element winning a selector
  // match over Torn's real button)
  function describeElement(el) {
    if (!el) return null;
    return {
      tag: el.tagName,
      id: el.id || null,
      class: el.className || null,
      dataTest: el.getAttribute ? el.getAttribute("data-test") : null,
      text: (el.innerText || el.textContent || "").trim().slice(0, 40),
      visible: el.offsetParent !== null,
    };
  }

  // reads an element's text excluding any .tah-hint span WE injected into it.
  // getOverrideButtons() needs an exact match against "leave"/"mug"/
  // "hospitalize", but UI.addHint() appends the hint as a child of that same
  // button - so btn.textContent picks up our own hint text (e.g. "Leave" ->
  // "Leave1") right after the first render that labels it, permanently
  // breaking the exact match until the next clearHints() pass. That pass
  // happens right as the hint becomes visible, i.e. exactly when the user is
  // about to press the key it's advertising.
  function getOwnText(el) {
    let text = "";
    for (const node of el.childNodes) {
      if (
        node.nodeType === Node.ELEMENT_NODE &&
        node.classList.contains("tah-hint")
      )
        continue;
      text += node.textContent;
    }
    return text.toLowerCase().trim();
  }

  // resolves the primary action button and, when debug logging is on, warns if
  // more than one element matches [data-test="attack-button"] - a collision
  // means some other script's element is competing for our selector, and we
  // may be clicking the wrong thing with no visible error
  function resolvePrimaryButton(logLabel) {
    if (Config.data.debugLogging) {
      const collisions = document.querySelectorAll(
        '[data-test="attack-button"]',
      );
      if (collisions.length > 1) {
        console.warn(
          `[Torn Attack Page Helper] ${logLabel}: ${collisions.length} elements match [data-test="attack-button"] - likely a selector collision with another script. Candidates:`,
          Array.from(collisions).map(describeElement),
        );
      }
    }

    const el = querySelectorFallback(SELECTORS.primaryButton);
    if (Config.data.debugLogging) {
      console.log(
        `[Torn Attack Page Helper] ${logLabel}: primary button resolved to`,
        describeElement(el),
      );
    }
    return el;
  }

  // handles saving and loading settings, checking both tamper/grease monkey and local storage
  const Storage = {
    async get(key, defaultVal) {
      const fullKey = `tah_${key}`;
      try {
        if (typeof GM !== "undefined" && GM.getValue)
          return await GM.getValue(fullKey, defaultVal);
        if (typeof GM_getValue !== "undefined")
          return GM_getValue(fullKey, defaultVal);
      } catch (e) {
        console.warn("GM Error", e);
      }
      const val = localStorage.getItem(fullKey);
      return val !== null ? JSON.parse(val) : defaultVal;
    },
    async set(key, val) {
      const fullKey = `tah_${key}`;
      try {
        if (typeof GM !== "undefined" && GM.setValue)
          return await GM.setValue(fullKey, val);
        if (typeof GM_setValue !== "undefined")
          return GM_setValue(fullKey, val);
      } catch (e) {
        console.warn("GM Error", e);
      }
      localStorage.setItem(fullKey, JSON.stringify(val));
    },
  };

  // manages user settings and key mappings
  const Config = {
    data: {
      weaponSlotKeys: {
        1: ["Numpad1"],
        2: ["Numpad2"],
        3: ["Numpad3"],
        4: ["Numpad0"],
        5: ["NumpadDecimal", "NumpadComma"],
        6: [],
      },
      decimalTarget: "punch", // 'punch' (5) or 'kick' (6)
      dialogKeys: {
        1: ["Numpad1"], // leave
        2: ["Numpad2"], // mug
        3: ["Numpad3"], // hospitalize
      },
      continueAction: "default", // 'default', 'close', 'openFixed'
      fixedTargetId: CONSTANTS.DEFAULT_TARGET,
      // logs which DOM element every keypress resolves/clicks to, and warns on
      // selector collisions - added to diagnose shortcuts going silently inert
      // when other page scripts (e.g. loadout/scouter overlays) inject elements
      // into the same container we query. Default on until confirmed stable.
      debugLogging: true,
    },

    async load() {
      const saved = await Storage.get("settings", null);
      if (saved) {
        // Merges saved settings with defaults so nothing breaks. This must be a
        // deep merge for weaponSlotKeys/dialogKeys: a plain top-level spread would
        // let a saved (older) key map fully replace the default one, silently
        // dropping any slot added by a later script version that the user's saved
        // config predates (e.g. slot 6 didn't exist in their saved settings yet).
        const defaults = this.data;
        this.data = { ...defaults, ...saved };
        this.data.weaponSlotKeys = {
          ...defaults.weaponSlotKeys,
          ...(saved.weaponSlotKeys || {}),
        };
        this.data.dialogKeys = {
          ...defaults.dialogKeys,
          ...(saved.dialogKeys || {}),
        };
      }
    },

    async save() {
      await Storage.set("settings", this.data);
    },

    getKeyMapping(code, dialogs) {
      // checks if the fight is finished to switch key logic using the new robust check
      // NOTE: previously this required b3 (Hospitalize) specifically, but Torn omits
      // that button when the target can't be hospitalized (already hospitalized / too
      // weak) - leaving only Leave/Mug. Any of the three being present means it's over.
      // dialogs is passed in by the caller so we don't re-scan the DOM for buttons
      // twice per keypress (once here, once in handleInput).
      if (dialogs === undefined)
        dialogs = AttackController.getOverrideButtons();
      const isFightOver = !!(
        dialogs &&
        (dialogs.b1 || dialogs.b2 || dialogs.b3)
      );

      if (isFightOver) {
        for (const [idx, keys] of Object.entries(this.data.dialogKeys)) {
          if (keys.includes(code))
            return { type: "dialog", index: Number(idx) };
        }
      }

      // looks through weapon slots to find a matching key
      for (const [slot, keys] of Object.entries(this.data.weaponSlotKeys)) {
        if (keys.includes(code)) return { type: "weapon", slot: Number(slot) };
      }

      // special handling for the decimal key since it acts as a toggle
      if (["NumpadDecimal", "NumpadComma"].includes(code)) {
        const isAlreadyMapped = Object.values(this.data.weaponSlotKeys).some(
          (k) => k.includes(code),
        );
        if (!isAlreadyMapped) {
          return {
            type: "weapon",
            slot: this.data.decimalTarget === "kick" ? 6 : 5,
          };
        }
      }

      // just in case we aren't at the end screen but need dialog keys
      if (!isFightOver) {
        for (const [idx, keys] of Object.entries(this.data.dialogKeys)) {
          if (keys.includes(code))
            return { type: "dialog", index: Number(idx) };
        }
      }

      // default behavior for any other numpad key
      if (code.startsWith("Numpad")) {
        return { type: "primary_fallback" };
      }

      return null;
    },
  };

  // handles visual hints style on the page
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

                /* aligns weapon hints to the right side of the slot */
                .tah-pos-slot {
                    top: 50%;
                    bottom: auto;
                    right: 2px;
                    transform: translateY(-50%);
                }

                /* places hints outside the button for end-game options */
                .tah-pos-dialog {
                    top: 50%;
                    bottom: auto;
                    left: 100%;
                    right: auto;
                    transform: translateY(-50%);
                    margin-left: 6px;
                    white-space: nowrap;
                }

                /* fallback styling for standard buttons like start */
                .tah-pos-default {
                    bottom: 2px;
                    right: 2px;
                }

                .tah-hint-multi { border-color: #ffd700; color: #ffd700; }
            `;
      if (typeof GM_addStyle !== "undefined") {
        GM_addStyle(css);
      } else {
        const style = document.createElement("style");
        style.textContent = css;
        document.head.appendChild(style);
      }
    },

    clearHints() {
      document.querySelectorAll(".tah-hint").forEach((el) => el.remove());
    },

    addHint(element, text, isAlert = false, type = "default") {
      if (!element) return;
      if (window.getComputedStyle(element).position === "static") {
        element.style.position = "relative";
      }
      if (element.querySelector(".tah-hint")) return;

      const hint = document.createElement("span");

      let posClass = "tah-pos-default";
      if (type === "slot") posClass = "tah-pos-slot";
      if (type === "dialog") posClass = "tah-pos-dialog";

      hint.className = `tah-hint ${posClass} ${isAlert ? "tah-hint-multi" : ""}`;
      hint.textContent = text;
      element.appendChild(hint);
    },

    formatKeys(keys) {
      if (!keys || keys.length === 0) return "";
      return keys
        .map((k) =>
          k.replace("Numpad", "").replace("Decimal", ".").replace("Comma", ","),
        )
        .join("/");
    },
  };

  // core logic for handling attacks and button clicks
  const AttackController = {
    lastActionTime: 0,

    getOverrideButtons() {
      const container = querySelectorFallback(SELECTORS.mainContainer);
      if (!container) return null;

      // Grab all buttons in the main attack container
      const allButtons = Array.from(container.querySelectorAll("button"));
      let b1 = null,
        b2 = null,
        b3 = null;

      // Filter purely by text content to immune the script against sibling/wrapper injection
      for (const btn of allButtons) {
        const text = getOwnText(btn);
        if (text === "leave") b1 = btn;
        else if (text === "mug") b2 = btn;
        else if (text === "hospitalize") b3 = btn;
      }

      // Return the group if we found at least one of the primary end-game actions
      if (b1 || b2 || b3) {
        return { b1, b2, b3 };
      }

      return null;
    },

    isTyping(target) {
      if (!target) return false;
      const nodeName = target.nodeName;
      // checks if the user is typing in a chat box so we don't trigger hotkeys
      return (
        nodeName === "INPUT" ||
        nodeName === "TEXTAREA" ||
        target.isContentEditable
      );
    },

    isInHospital() {
      // textContent avoids forcing a CSS layout calculation/reflow
      const bodyText = document.body.textContent || "";
      // Torn's exact copy for this state - the reliable primary signal
      if (
        /this person is currently in hospital and cannot be attacked/i.test(
          bodyText,
        )
      )
        return true;

      // Narrower fallback for wording variants: requires an explicit "cannot attack"
      // phrase near "hospital", not just any co-occurrence. The previous version
      // (/\b(target|opponent|person).{0,30}\bhospital/) matched any unrelated mention
      // of hospital near those common words anywhere in the container (chat, ads,
      // flavor text), which could misfire and trigger an unwanted page reload.
      const container = querySelectorFallback(SELECTORS.mainContainer);
      if (container) {
        const text = container.textContent.toLowerCase();
        return /cannot\s+(?:be\s+)?attack(?:ed)?.{0,40}hospital|hospital.{0,40}cannot\s+(?:be\s+)?attack(?:ed)?/.test(
          text,
        );
      }
      return false;
    },

    handleContinue() {
      const { continueAction, fixedTargetId } = Config.data;

      // decides what to do when clicking continue (close window, load next target, regular 'continue' behavior)
      if (continueAction === "close") {
        window.close();
        return true;
      }
      if (continueAction === "openFixed") {
        const target = fixedTargetId || CONSTANTS.DEFAULT_TARGET;
        window.location.href = `https://www.torn.com/loader.php?sid=attack&user2ID=${target}`;
        return true;
      }
      return false;
    },

    updateVisuals() {
      UI.clearHints();

      const dialogs = this.getOverrideButtons();
      if (dialogs && (dialogs.b1 || dialogs.b2 || dialogs.b3)) {
        // passes the dialog type so the hint appears outside the dialog buttons
        // (UI.addHint no-ops on a null element, so a missing button here is fine)
        UI.addHint(
          dialogs.b1,
          UI.formatKeys(Config.data.dialogKeys["1"]),
          false,
          "dialog",
        );
        UI.addHint(
          dialogs.b2,
          UI.formatKeys(Config.data.dialogKeys["2"]),
          false,
          "dialog",
        );
        UI.addHint(
          dialogs.b3,
          UI.formatKeys(Config.data.dialogKeys["3"]),
          false,
          "dialog",
        );
        return;
      }

      const primary = resolvePrimaryButton("updateVisuals");
      if (primary) {
        const text = (primary.innerText || "").toLowerCase();
        let hintText = "Any";

        if (text.includes("continue")) {
          if (Config.data.continueAction === "close")
            hintText += " \u2192 Close";
          else if (Config.data.continueAction === "openFixed")
            hintText += " \u2192 Follow-up";
        }
        // primary buttons usually look best with standard slot styling
        UI.addHint(primary, hintText, false, "slot");
      }

      for (let i = 1; i <= 6; i++) {
        const el = document.querySelector(SELECTORS.slots[i]);
        if (!el) continue;

        let keys = Config.data.weaponSlotKeys[String(i)] || [];

        if (
          (Config.data.decimalTarget === "kick" && i === 6) ||
          (Config.data.decimalTarget === "punch" && i === 5)
        ) {
          const decimalMappedElsewhere = Object.values(
            Config.data.weaponSlotKeys,
          ).some((k) => k.includes("NumpadDecimal"));
          if (!decimalMappedElsewhere) keys = [...keys, "Numpad."];
        }

        if (keys.length) UI.addHint(el, UI.formatKeys(keys), false, "slot");
      }
    },

    handleInput(e) {
      if (this.isTyping(e.target)) return;

      // checks for cooldowns to prevent double clicks
      const now = Date.now();
      if (now - this.lastActionTime < CONSTANTS.KEY_COOLDOWN) return;

      // computed once and reused below, instead of scanning for these buttons twice
      const dialogs = this.getOverrideButtons();

      let mapping = Config.getKeyMapping(e.code, dialogs);
      if (Config.data.debugLogging) {
        console.log(
          `[Torn Attack Page Helper] handleInput: key=${e.code} mapping=`,
          mapping,
          "dialogsPresent=",
          !!(dialogs && (dialogs.b1 || dialogs.b2 || dialogs.b3)),
        );
      }
      if (!mapping) return;

      // checks if the target is in hospital before trying to attack
      if (this.isInHospital()) {
        // safety net: even if detection ever misfires, don't reload more than
        // once per few seconds - a reload loop would hammer Torn with page
        // requests well beyond what the single keypress that triggered it intends.
        const lastReload = Number(
          sessionStorage.getItem("tah_last_hosp_reload") || 0,
        );
        if (Date.now() - lastReload < 5000) {
          console.warn(
            "[Torn Attack Page Helper] Hospital reload suppressed (too soon since last reload).",
          );
          return;
        }
        sessionStorage.setItem("tah_last_hosp_reload", String(Date.now()));
        console.log(
          "[Torn Attack Page Helper] Target is in the hospital. Reloading...",
        );
        window.location.reload();
        return;
      }

      // detects if we are in the start or continue phase of the fight
      const primary = resolvePrimaryButton("handleInput");
      const primaryText = primary
        ? (primary.innerText || "").toLowerCase()
        : "";

      // if text is "start" or "continue", we override everything to click this button
      // we do not override if the text is "attack", so we can still switch weapons during the fight
      const isPriorityPhase =
        primary &&
        (primaryText.includes("start") || primaryText.includes("continue"));

      let actionSuccess = false;

      // handles the end of fight buttons (leave, mug, hosp)
      if (
        dialogs &&
        (dialogs.b1 || dialogs.b2 || dialogs.b3) &&
        mapping.type === "dialog"
      ) {
        const btn =
          mapping.index === 1
            ? dialogs.b1
            : mapping.index === 2
              ? dialogs.b2
              : dialogs.b3;
        if (Config.data.debugLogging) {
          console.log(
            "[Torn Attack Page Helper] handleInput: dialog button resolved to",
            describeElement(btn),
          );
        }
        if (btn) {
          btn.click();
          actionSuccess = true;
        }
      }

      // overrides buttons so any mapped key clicks the primary button during start/end
      else if (
        isPriorityPhase &&
        (mapping.type === "weapon" || mapping.type === "primary_fallback")
      ) {
        if (primary) {
          // handles special continue actions like closing the tab or loading a follow-up target
          if (
            primaryText.includes("continue") &&
            Config.data.continueAction !== "default"
          ) {
            if (this.handleContinue()) {
              e.preventDefault();
              return;
            }
          }
          primary.click();
          actionSuccess = true;
        }
      }

      // handles weapon swapping during the fight
      else if (mapping.type === "weapon") {
        const el = document.querySelector(SELECTORS.slots[mapping.slot]);
        if (Config.data.debugLogging) {
          console.log(
            `[Torn Attack Page Helper] handleInput: weapon slot ${mapping.slot} resolved to`,
            describeElement(el),
          );
        }
        if (el && el.offsetParent !== null) {
          el.click();
          actionSuccess = true;
        } else if (Config.data.debugLogging && el) {
          console.warn(
            `[Torn Attack Page Helper] handleInput: weapon slot ${mapping.slot} found but not visible (offsetParent null) - click skipped. Another script may be hiding/overlaying it.`,
          );
        }
      }

      // default fallback action
      else if (mapping.type === "primary_fallback") {
        if (primary) {
          if (
            primaryText.includes("continue") &&
            Config.data.continueAction !== "default"
          ) {
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
    },
  };

  // sets up the script command menu for changing settings
  const Menu = {
    menuIds: [],

    promptKey(label, currentKeys) {
      const str = prompt(
        `Enter keys for "${label}" separated by space/comma.\nUse '.' for Decimal.\n\nCurrent: ${currentKeys.join(" ")}`,
      );
      if (str === null) return null;

      return str
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => {
          if (s === ".") return "NumpadDecimal";
          if (s === ",") return "NumpadComma";
          if (s.startsWith("Numpad")) return s;
          if (/^\d$/.test(s)) return `Numpad${s}`;
          return null;
        })
        .filter(Boolean);
    },

    register() {
      this.menuIds.forEach((id) => GM_unregisterMenuCommand(id));
      this.menuIds = [];

      // creates menu items for changing keys and settings
      for (let i = 1; i <= 6; i++) {
        const id = GM_registerMenuCommand(`Edit Slot ${i} Keys`, async () => {
          const newKeys = this.promptKey(
            `Weapon Slot ${i}`,
            Config.data.weaponSlotKeys[i] || [],
          );
          if (newKeys) {
            Config.data.weaponSlotKeys[i] = newKeys;
            await Config.save();
            AttackController.updateVisuals();
          }
        });
        this.menuIds.push(id);
      }

      ["Leave (Left)", "Mug (Middle)", "Hosp (Right)"].forEach((label, idx) => {
        const mapIdx = idx + 1;
        const id = GM_registerMenuCommand(`Edit ${label} Keys`, async () => {
          const newKeys = this.promptKey(
            label,
            Config.data.dialogKeys[mapIdx] || [],
          );
          if (newKeys) {
            Config.data.dialogKeys[mapIdx] = newKeys;
            await Config.save();
            AttackController.updateVisuals();
          }
        });
        this.menuIds.push(id);
      });

      const decLabel = `Decimal Key: ${Config.data.decimalTarget.toUpperCase()} (Click to Swap)`;
      this.menuIds.push(
        GM_registerMenuCommand(decLabel, async () => {
          Config.data.decimalTarget =
            Config.data.decimalTarget === "punch" ? "kick" : "punch";
          await Config.save();
          this.register();
          AttackController.updateVisuals();
        }),
      );

      const contLabels = {
        default: "Default Click",
        close: "Close Tab",
        openFixed: "Follow-up Target",
      };
      const contLabel = `Continue Action: ${contLabels[Config.data.continueAction]} (Cycle)`;
      this.menuIds.push(
        GM_registerMenuCommand(contLabel, async () => {
          const modes = ["default", "close", "openFixed"];
          const next =
            modes[
              (modes.indexOf(Config.data.continueAction) + 1) % modes.length
            ];
          Config.data.continueAction = next;
          await Config.save();
          this.register();
          AttackController.updateVisuals();
        }),
      );

      const debugLabel = `Debug Logging: ${Config.data.debugLogging ? "ON" : "OFF"} (Click to Toggle)`;
      this.menuIds.push(
        GM_registerMenuCommand(debugLabel, async () => {
          Config.data.debugLogging = !Config.data.debugLogging;
          await Config.save();
          this.register();
        }),
      );

      const followupLabel = `Set Follow-up ID (Current: ${Config.data.fixedTargetId || "Default"})`;
      this.menuIds.push(
        GM_registerMenuCommand(followupLabel, async () => {
          const input = prompt(
            'Enter User ID for chaining (used when Continue Action is "Follow-up Target"):',
            Config.data.fixedTargetId,
          );
          if (input && /^\d+$/.test(input.trim())) {
            Config.data.fixedTargetId = input.trim();
            await Config.save();
            this.register();
          }
        }),
      );
    },
  };

  // main startup function
  async function init() {
    const params = new URLSearchParams(location.search);
    // makes sure we are actually on an attack page before running
    if (!(params.get("sid") === "attack" && params.has("user2ID"))) return;

    await Config.load();
    UI.injectStyles();

    // listens for key presses - attached BEFORE Menu.register() and wrapped so that
    // core hotkey functionality still works even if the menu command API is
    // unavailable in this userscript manager/context. Previously Menu.register() ran
    // first with no try/catch: an unhandled error there (e.g. missing
    // GM_registerMenuCommand) would abort the rest of init() and silently disable
    // every hotkey with no indication why.
    document.addEventListener(
      "keydown",
      (e) => AttackController.handleInput(e),
      true,
    );

    try {
      Menu.register();
    } catch (e) {
      console.warn(
        "[Torn Attack Page Helper] Menu registration failed (settings menu unavailable), hotkeys still active:",
        e,
      );
    }

    let timeout;
    // watches for changes in the page to update hints dynamically
    const observer = new MutationObserver(() => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        AttackController.updateVisuals();
        if (AttackController.isInHospital()) {
          const btn = resolvePrimaryButton("hospitalCheck");
          if (btn) UI.addHint(btn, "TARGET HOSPITALIZED", true);
        }
      }, CONSTANTS.DEBOUNCE_TIME);
    });

    // OPTIMIZATION: Target the attack container specifically, fallback to body if missing
    const targetNode =
      querySelectorFallback(SELECTORS.mainContainer) || document.body;

    observer.observe(targetNode, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "disabled"],
    });

    AttackController.updateVisuals();
    // Updated to use optional chaining for GM object safety
    console.log(
      `[Torn Attack Page Helper] v${typeof GM !== "undefined" ? GM.info?.script?.version : "1.4"} Loaded`,
    );
  }

  init();
})();
