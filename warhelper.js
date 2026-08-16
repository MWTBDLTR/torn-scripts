// ==UserScript==
// @name        TORN War Helper
// @namespace   finally.torn.warhelper
// @version     20260705.172327+5c2c53a
// @description Various helpers for warring
// @author      finally [2060206], seintz [2460991], Shade [3129695], Kindly [1956699]
// @license     GNU GPLv3
// @run-at      document-start
// @match       https://www.torn.com/factions.php*
// @match       https://www.torn.com/page.php?sid=attack*
// @match       https://www.torn.com/loader2.php?sid=attack*
// @match       https://www.torn.com/loader.php?sid=attack*
// @match       https://www.torn.com/war.php?step=rankreport*
// @grant       GM_xmlhttpRequest
// @grant       GM_addStyle
// @grant       unsafeWindow
// @connect     api.torn.com
// @connect     tornstats.com
// @connect     yata.yt
// @connect     lol-manager.com
// @connect     ffscouter.com
// @connect     torn.seintz.com
// ==/UserScript==

!(function () {
  const t = "undefined" != typeof unsafeWindow ? unsafeWindow : window;
  t.__WARHELPER_RUNNING ||
    ((t.__WARHELPER_RUNNING = !0),
    (() => {
      var t = class {
        static request(t, e = 3e4) {
          const n =
            "string" == typeof t
              ? { method: "GET", url: t, timeout: e }
              : { method: "GET", timeout: 3e4, ...t };
          return new Promise((e, s) => {
            "undefined" != typeof GM_xmlhttpRequest
              ? GM_xmlhttpRequest({
                  method: n.method || "GET",
                  url: n.url,
                  headers: n.headers,
                  data: n.data,
                  timeout: n.timeout,
                  onload: (n) => e("string" == typeof t ? n.responseText : n),
                  onabort: () => s(new Error("HTTP request aborted")),
                  onerror: (t) => s(t || new Error("HTTP request failed")),
                  ontimeout: (t) => s(t || new Error("HTTP request timed out")),
                })
              : s(new Error("GM_xmlhttpRequest is not available"));
          });
        }
      };
      var e = "undefined" != typeof unsafeWindow ? unsafeWindow : window;
      function n(t) {
        try {
          return JSON.parse(t);
        } catch {
          return;
        }
      }
      var s = 0;
      function i(t) {
        const e = (function (t) {
          const e = Number(t);
          return !Number.isFinite(e) || e <= 0 ? null : e < 1e12 ? 1e3 * e : e;
        })(t);
        null !== e && (s = e - Date.now());
      }
      function r() {
        return Date.now() + s;
      }
      function a() {
        return Math.floor(r() / 1e3);
      }
      function o() {
        return (
          void 0 !== window.flutter || void 0 !== window.flutter_inappwebview
        );
      }
      function l(t) {
        if (!document.head)
          return void document.addEventListener("DOMContentLoaded", () => l(t));
        if ("undefined" != typeof GM_addStyle) return void GM_addStyle(t);
        const e = document.createElement("style");
        ((e.type = "text/css"),
          (e.innerText = t),
          document.head.appendChild(e));
      }
      function c() {
        const t = [128512, 128591],
          e = Math.floor(Math.random() * (t[1] - t[0] + 1)) + t[0];
        return String.fromCodePoint(e);
      }
      function h(t, e) {
        if (!Array.isArray(e)) return h(t, e.split("."));
        let n = t;
        for (const t of e) {
          if (null == n || !(t in n)) return !1;
          n = n[t];
        }
        return !0;
      }
      function d(t) {
        let e = Math.round(r() / 1e3) - t;
        return e < 0
          ? "now"
          : e > 31536e3
            ? `${Math.floor(e / 31536e3)} years ago`
            : e > 2592e3
              ? `${Math.floor(e / 2592e3)} months ago`
              : e > 86400
                ? `${Math.floor(e / 86400)} days ago`
                : e > 3600
                  ? `${Math.floor(e / 3600)} hours ago`
                  : e > 60
                    ? `${Math.floor(e / 60)} minutes ago`
                    : `${Math.floor(e)} seconds ago`;
      }
      function u(t) {
        const e = t - a();
        if (e <= 0) return "Okay";
        const n = Math.floor(e / 3600),
          s = Math.floor((e % 3600) / 60),
          i = Math.floor(e % 60);
        let r = "";
        return (
          n > 0 && (r += `${n.toString().padStart(2, "0")}:`),
          (r += `${s.toString().padStart(2, "0")}:${i.toString().padStart(2, "0")}`),
          r
        );
      }
      function p(t, e, n = ["K", "M", "B", "T", "Q"]) {
        for (let s = 0; s < n.length; s++) {
          if ((t /= 1e3) >= 1e3 && s < n.length - 1) continue;
          return `${t.toFixed(e || (t >= 100 ? 0 : t >= 10 ? 1 : 2))}${n[s]}`;
        }
        return "?";
      }
      function g(t) {
        return -1 !== window.location.href.indexOf(t);
      }
      function f() {
        return g("war.php");
      }
      function m() {
        return g("factions.php");
      }
      function _() {
        return (
          -1 !==
          document
            .querySelector("#factions .respect-icon+span.title")
            ?.innerHTML?.indexOf("YOUR")
        );
      }
      function w({ section: e, endpoint: s, id: i, parameters: r }) {
        return new Promise((a, o) => {
          const l = x.get("torn_key");
          if (!l) return o("No API key");
          let c = `https://api.torn.com/v2/${e}`;
          (i && (Array.isArray(i) || (i = [i]), (c += `/${i.join(",")}`)),
            s && (c += `/${s}`),
            ((r = r || {}).key = l),
            (c += `?${Object.keys(r)
              .map(
                (t) =>
                  `${t}=${(Array.isArray(r[t]) ? r[t] : [r[t]]).join(",")}`,
              )
              .join("&")}`),
            t
              .request(c)
              .then(async (t) => {
                const e = n(t);
                return e
                  ? e.error
                    ? o(new Error(`API Error: ${e.error.error}`))
                    : void a(e)
                  : o(new Error("Failed to parse response"));
              })
              .catch((t) => {
                o(t);
              }));
        });
      }
      function b(t) {
        return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(t)}`;
      }
      function A(t, e, n, s) {
        const i = t + n / 2,
          r = e + s / 2;
        return `\n    <rect x="${t}" y="${e}" width="${n}" height="${s}" fill="#012169"/>\n    <line x1="${t}" y1="${e}" x2="${t + n}" y2="${e + s}" stroke="#fff" stroke-width="${0.24 * s}"/>\n    <line x1="${t + n}" y1="${e}" x2="${t}" y2="${e + s}" stroke="#fff" stroke-width="${0.24 * s}"/>\n    <line x1="${t}" y1="${e}" x2="${t + n}" y2="${e + s}" stroke="#c8102e" stroke-width="${0.1 * s}"/>\n    <line x1="${t + n}" y1="${e}" x2="${t}" y2="${e + s}" stroke="#c8102e" stroke-width="${0.1 * s}"/>\n    <rect x="${t}" y="${r - 0.14 * s}" width="${n}" height="${0.28 * s}" fill="#fff"/>\n    <rect x="${i - 0.09 * n}" y="${e}" width="${0.18 * n}" height="${s}" fill="#fff"/>\n    <rect x="${t}" y="${r - 0.08 * s}" width="${n}" height="${0.16 * s}" fill="#c8102e"/>\n    <rect x="${i - 0.05 * n}" y="${e}" width="${0.1 * n}" height="${s}" fill="#c8102e"/>\n  `;
      }
      var y = {
          MX: b(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20"><rect width="10" height="20" fill="#006847"/><rect x="10" width="10" height="20" fill="#fff"/><rect x="20" width="10" height="20" fill="#ce1126"/><circle cx="15" cy="10" r="2" fill="#9c6b30"/></svg>',
          ),
          HI: b(
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 20"><rect width="32" height="20" fill="#fff"/><rect y="2.5" width="32" height="2.5" fill="#cf142b"/><rect y="5" width="32" height="2.5" fill="#00247d"/><rect y="10" width="32" height="2.5" fill="#cf142b"/><rect y="12.5" width="32" height="2.5" fill="#00247d"/><rect y="17.5" width="32" height="2.5" fill="#cf142b"/>${A(0, 0, 14, 10)}</svg>`,
          ),
          ZA: b(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20"><path fill="#de3831" d="M0 0h30v10H0z"/><path fill="#002395" d="M0 10h30v10H0z"/><path fill="#fff" d="M0 0l16 10L0 20h6l16-10L6 0z"/><path fill="#007a4d" d="M0 2l12 8L0 18h4l14-8L4 2z"/><path fill="#ffb612" d="M0 4l8 6-8 6z"/><path fill="#000" d="M0 5.5L6 10l-6 4.5z"/></svg>',
          ),
          JP: b(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20"><rect width="30" height="20" fill="#fff"/><circle cx="15" cy="10" r="5.5" fill="#bc002d"/></svg>',
          ),
          CN: b(
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20"><rect width="30" height="20" fill="#de2910"/><polygon points="${(function (
              t,
              e,
              n,
              s,
            ) {
              const i = [];
              for (let r = 0; r < 10; r++) {
                const a = r % 2 == 0 ? n : s,
                  o = ((36 * r - 90) * Math.PI) / 180;
                i.push(
                  `${(t + Math.cos(o) * a).toFixed(2)},${(e + Math.sin(o) * a).toFixed(2)}`,
                );
              }
              return i.join(" ");
            })(
              7,
              5.5,
              3,
              1.25,
            )}" fill="#ffde00"/><circle cx="13" cy="4" r="1" fill="#ffde00"/><circle cx="15" cy="7" r="1" fill="#ffde00"/><circle cx="15" cy="11" r="1" fill="#ffde00"/><circle cx="13" cy="14" r="1" fill="#ffde00"/></svg>`,
          ),
          AR: b(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20"><rect width="30" height="20" fill="#74acdf"/><rect y="6.67" width="30" height="6.66" fill="#fff"/><circle cx="15" cy="10" r="2" fill="#f6b40e"/></svg>',
          ),
          CH: b(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><rect width="20" height="20" fill="#d52b1e"/><rect x="8" y="4" width="4" height="12" fill="#fff"/><rect x="4" y="8" width="12" height="4" fill="#fff"/></svg>',
          ),
          CA: b(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20"><rect width="7" height="20" fill="#d52b1e"/><rect x="7" width="16" height="20" fill="#fff"/><rect x="23" width="7" height="20" fill="#d52b1e"/><polygon points="15,3 16.2,7.1 19.2,6 17.7,8.9 20.5,10 17.1,11 18.1,14.5 15,12.3 11.9,14.5 12.9,11 9.5,10 12.3,8.9 10.8,6 13.8,7.1" fill="#d52b1e"/></svg>',
          ),
          GB: b(
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20">${A(0, 0, 30, 20)}</svg>`,
          ),
          AE: b(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20"><rect width="30" height="20" fill="#fff"/><rect x="8" width="22" height="6.67" fill="#009739"/><rect x="8" y="13.33" width="22" height="6.67" fill="#000"/><rect width="8" height="20" fill="#ef3340"/></svg>',
          ),
          KY: b(
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20"><rect width="30" height="20" fill="#00247d"/>${A(0, 0, 14, 10)}<circle cx="23" cy="11" r="4" fill="#fff"/><circle cx="23" cy="11" r="2.6" fill="#d52b1e"/></svg>`,
          ),
        },
        v = {
          1: { name: "Torn", abbr: "Torn" },
          2: { name: "Mexico", abbr: "MX", flagUrl: y.MX },
          3: { name: "Hawaii", abbr: "HI", flagUrl: y.HI },
          4: { name: "South Africa", abbr: "ZA", flagUrl: y.ZA },
          5: { name: "Japan", abbr: "JP", flagUrl: y.JP },
          6: { name: "China", abbr: "CN", flagUrl: y.CN },
          7: { name: "Argentina", abbr: "AR", flagUrl: y.AR },
          8: { name: "Switzerland", abbr: "CH", flagUrl: y.CH },
          9: { name: "Canada", abbr: "CA", flagUrl: y.CA },
          10: { name: "United Kingdom", abbr: "UK", flagUrl: y.GB },
          11: { name: "United Arab Emirates", abbr: "UAE", flagUrl: y.AE },
          12: { name: "Cayman Islands", abbr: "KY", flagUrl: y.KY },
        },
        S = class {
          static {
            this.cacheKey = "__warhelper";
          }
          static {
            this.cache = {};
          }
          static {
            this.onBustHandlers = [];
          }
          static {
            const t = localStorage.getItem(this.cacheKey);
            t &&
              (Object.assign(this.cache, n(t)),
              Object.keys(this.cache).forEach((t) => {
                const e = this.cache[t];
                e.expiry > 0 && e.expiry < Date.now() && delete this.cache[t];
              }),
              this.write());
          }
          static onBust(t) {
            this.onBustHandlers.push(t);
          }
          static write() {
            localStorage.setItem(this.cacheKey, JSON.stringify(this.cache));
          }
          static get(t) {
            const e = this.cache[t];
            if (e)
              return e.expiry > 0 && e.expiry < Date.now()
                ? (delete this.cache[t], void this.write())
                : e.value;
          }
          static bust(t) {
            const e = Array.isArray(t) ? t : [t];
            (Object.keys(this.cache).forEach((t) => {
              e.some((e) => t.startsWith(e)) && delete this.cache[t];
            }),
              this.write(),
              this.onBustHandlers.forEach((t) => {
                t();
              }));
          }
          static set(t, e, n = 0) {
            const s = Array.isArray(t) ? t : [t],
              i = Array.isArray(e) ? e : [e];
            if (s.length !== i.length)
              throw new Error(
                "Keys and values arrays must be of the same length",
              );
            (s.forEach((t, e) => {
              this.cache[t] = {
                value: i[e],
                expiry: n > 0 ? Date.now() + 1e3 * n : 0,
              };
            }),
              this.write());
          }
          static seconds(t) {
            return t;
          }
          static minutes(t) {
            return this.seconds(60) * t;
          }
          static hours(t) {
            return this.minutes(60) * t;
          }
          static days(t) {
            return this.hours(24) * t;
          }
        },
        x = class t {
          static {
            this.configKeyEntries = [
              {
                type: "text",
                id: "torn_key",
                label: "Torn Key",
                placeholder: "",
              },
              {
                type: "text",
                id: "tornstats_key",
                label: "TornStats Key",
                placeholder: "TS_...",
              },
              {
                type: "text",
                id: "bsp_key",
                label: "BSP Key",
                placeholder: "",
              },
              {
                type: "text",
                id: "ffs_key",
                label: "FFScouter Key",
                placeholder: "",
              },
              {
                type: "text",
                id: "yata_key",
                label: "YATA Key",
                placeholder: "",
              },
            ];
          }
          static {
            this.spySourceEntries = [
              { id: "TS", label: "TornStats" },
              { id: "YATA", label: "YATA" },
              { id: "BSP", label: "BSP" },
              { id: "FFS", label: "FFScouter" },
              { id: "YE", label: "YATA Estimate" },
            ];
          }
          static {
            this.configOptionsEntries = [
              {
                type: "checkbox",
                id: "hide_faction_icon",
                label: "Hide Faction Icon",
                placeholder: "",
              },
              {
                type: "checkbox",
                id: "hide_whore",
                label: "Hide Whore Colors",
                placeholder: "",
              },
              {
                type: "checkbox",
                id: "hide_bsp",
                label: "Hide BSP",
                placeholder: "",
              },
              {
                type: "checkbox",
                id: "ffcolor_bg",
                label: "Enable FF Color Background",
                placeholder: "",
              },
              {
                type: "checkbox",
                id: "show_original_war_view",
                label: "Show Original War View",
                placeholder: "",
              },
              {
                type: "checkbox",
                id: "open_attack_in_frame",
                label: "Open Attacks In Frame",
                placeholder: "",
              },
              {
                type: "checkbox",
                id: "opponent_chain_tracker",
                label: "Enable Opponent Chain Tracker",
                placeholder: "",
              },
              {
                type: "checkbox",
                id: "disable_hiding_cosmetics",
                label: "Disable Hiding Cosmetics",
                placeholder: "",
              },
            ];
          }
          static {
            this.onChangeHandlers = {};
          }
          static {
            document.body
              ? this.init()
              : document.addEventListener("DOMContentLoaded", () =>
                  this.init(),
                );
          }
          static init() {
            e.__warhelper_config_initialized ||
              ((e.__warhelper_config_initialized = !0),
              this.createConfigOverlay(),
              this.injectButton());
          }
          static async injectButton() {
            const t = await ((e = "#top-page-links-list"),
            new Promise((t) => {
              const n = setInterval(() => {
                const s = document.querySelector(e);
                s && (clearInterval(n), t(s));
              }, 500);
            }));
            var e;
            ((this.configButton = document.createElement("a")),
              (this.configButton.className =
                "t-clear line-h24 right __warhelper_button"),
              (this.configButton.href = "#"));
            const n = document.createElement("span");
            ((n.className = "icon-wrap svg-icon-wrap"), (n.innerHTML = c()));
            const s = document.createElement("span");
            ((s.innerHTML = "War Helper"),
              this.configButton.appendChild(n),
              this.configButton.appendChild(s),
              t.appendChild(this.configButton),
              this.configButton.addEventListener("click", (t) => {
                (t.preventDefault(), this.toggleConfig(t.target));
              }),
              this.configButton.addEventListener("mouseenter", () => {
                n.innerHTML = c();
              }));
          }
          static createConfigEntry(e) {
            return `\n      <label class="__warhelper_config_${e.type}">\n        ${"checkbox" != e.type ? e.label : ""}\n        <input \n          data-id="${e.id}" \n          type="${e.type}" \n          placeholder="${e.placeholder || ""}"\n          ${"checkbox" == e.type ? "" + ("true" == t.get(e.id) ? "checked" : "") : `value="${t.get(e.id) || ""}"`}\n        />\n        <span></span>\n        ${"checkbox" == e.type ? e.label : ""}\n      </label>\n    `;
          }
          static createSpySourcePriorityConfig() {
            return `\n      <div class="__warhelper_config_spy_priority" data-spy-source-priority>\n        ${this.getConfiguredSpySourceOrder()
              .map((t) => {
                const e = this.spySourceEntries.find((e) => e.id === t);
                return e
                  ? `\n            <div class="__warhelper_config_spy_source" data-spy-source="${e.id}">\n              <span class="__warhelper_config_spy_source_label">${e.label}</span>\n              <button type="button" data-spy-source-move="-1" aria-label="Move ${e.label} up">Up</button>\n              <button type="button" data-spy-source-move="1" aria-label="Move ${e.label} down">Down</button>\n            </div>\n          `
                  : "";
              })
              .join("\n")}\n      </div>\n    `;
          }
          static createConfigOverlay() {
            ((this.configElement = document.createElement("div")),
              (this.configElement.className = "__warhelper_config"),
              (this.configElement.style.display = "none"),
              (this.configElement.innerHTML = `\n      <div class="__warhelper_config_tabs">\n        <select class="__warhelper_config_tab-select">\n          <option value="__warhelper_config_tab1" selected>Keys</option>\n          <option value="__warhelper_config_tab2">Options</option>\n          <option value="__warhelper_config_tab4">Spy Sources</option>\n          <option value="__warhelper_config_tab3" hidden disabled>Dibs</option>\n        </select>\n\n        <div id="__warhelper_config_tab1" class="__warhelper_config_tab-content active" data-tab-content>\n          ${this.configKeyEntries.map((e) => t.createConfigEntry(e)).join("\n")}\n        </div>\n        <div id="__warhelper_config_tab2" class="__warhelper_config_tab-content" data-tab-content>\n          ${this.configOptionsEntries.map((e) => t.createConfigEntry(e)).join("\n")}\n        </div>\n        <div id="__warhelper_config_tab4" class="__warhelper_config_tab-content" data-tab-content>\n          ${this.createSpySourcePriorityConfig()}\n        </div>\n        <div id="__warhelper_config_tab3" class="__warhelper_config_tab-content" data-tab-content>\n          <label class="__warhelper_config_checkbox">\n            <input data-dibs-setup="allowLongDibs" type="checkbox" />\n            <span></span>\n            Allow Long Dibs\n          </label>\n          <label class="__warhelper_config_text">\n            Short Dib Minutes\n            <input data-dibs-setup="defaultExpiryMinutes" type="number" min="1" step="1" placeholder="60" />\n          </label>\n          <label class="__warhelper_config_text">\n            Max Concurrent Dibs Per Player\n            <input data-dibs-setup="maxConcurrentDibsPerPlayer" type="number" min="0" step="1" placeholder="0" />\n          </label>\n          <label class="__warhelper_config_text">\n            Manager Positions\n            <input data-dibs-setup="allowedPositions" type="text" placeholder="Officer, Warlord" />\n          </label>\n          <button class="torn-btn __warhelper_dibs_setup_save" type="button">SAVE DIBS SETUP</button>\n          <div class="__warhelper_dibs_setup_status"></div>\n        </div>\n      </div>\n\n      <button class="torn-btn save">SAVE</button>\n      <button class="torn-btn bust">CLEAR CACHE</button>`));
            (document.body.insertAdjacentElement(
              "beforeend",
              this.configElement,
            ),
              l(
                "\n@media screen and (max-width: 784px) {\n  .__warhelper_button:nth-child(2) {\n    display: none;\n  }\n}\n\n.__warhelper_config {\n  --wh-config-bg: #ffffff;\n  --wh-config-panel-bg: #f5f6f8;\n  --wh-config-control-bg: #ffffff;\n  --wh-config-control-hover-bg: #eef1f5;\n  --wh-config-text: #222;\n  --wh-config-muted: #606873;\n  --wh-config-border: #c8cdd4;\n  --wh-config-border-strong: #9aa3ad;\n  --wh-config-focus: rgba(44, 124, 207, 0.2);\n  --wh-config-check-bg: #ffffff;\n  --wh-config-check-active-bg: #3d6ea8;\n  --wh-config-check-color: #ffffff;\n  --wh-config-success: #2f7d32;\n  --wh-config-error: #b3261e;\n  position: absolute;\n  background: var(--wh-config-bg);\n  color: var(--wh-config-text);\n  padding: 10px;\n  border: 1px solid var(--wh-config-border);\n  border-radius: 5px;\n  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);\n  z-index: 99;\n}\n\nbody.dark-mode .__warhelper_config {\n  --wh-config-bg: #2f2f2f;\n  --wh-config-panel-bg: #383838;\n  --wh-config-control-bg: #242424;\n  --wh-config-control-hover-bg: #333333;\n  --wh-config-text: #ddd;\n  --wh-config-muted: #b8b8b8;\n  --wh-config-border: #555;\n  --wh-config-border-strong: #777;\n  --wh-config-focus: rgba(255, 255, 255, 0.07);\n  --wh-config-check-bg: #2b2b2b;\n  --wh-config-check-active-bg: #444;\n  --wh-config-check-color: #eee;\n  --wh-config-success: #b9e6b9;\n  --wh-config-error: #ffb3b3;\n  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.42);\n}\n\n.__warhelper_config_tab-content {\n  display: none;\n}\n\n.__warhelper_config_tab-content.active {\n  display: block;\n}\n\n.__warhelper_config.__warhelper_config_dibs_active > button.save,\n.__warhelper_config.__warhelper_config_dibs_active > button.bust {\n  display: none;\n}\n\n.__warhelper_config select {\n  width: 100%;\n  padding: 8px 10px;\n  border-radius: 5px;\n  border: 1px solid var(--wh-config-border);\n  background: var(--wh-config-control-bg);\n  color: var(--wh-config-text);\n  font-size: 14px;\n  cursor: pointer;\n\n  appearance: none; /* remove default arrow */\n  -webkit-appearance: none;\n  -moz-appearance: none;\n\n  transition: border-color 0.2s ease, box-shadow 0.2s ease;\n}\n\n.__warhelper_config select {\n  background-image: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath fill='%235f6873' d='M0 0l5 6 5-6z'/%3E%3C/svg%3E\");\n  background-repeat: no-repeat;\n  background-position: right 10px center;\n  background-size: 10px;\n  padding-right: 30px;\n}\n\nbody.dark-mode .__warhelper_config select {\n  background-image: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath fill='%23cccccc' d='M0 0l5 6 5-6z'/%3E%3C/svg%3E\");\n}\n\n.__warhelper_config select:hover {\n  border-color: var(--wh-config-border-strong);\n}\n\n.__warhelper_config select:focus {\n  outline: none;\n  border-color: var(--wh-config-border-strong);\n  box-shadow: 0 0 0 2px var(--wh-config-focus);\n}\n\n.__warhelper_config label {\n  font-weight: bold;\n  color: var(--wh-config-text);\n}\n\n.__warhelper_config button {\n  width: 100%;\n}\n\n.__warhelper_config button:not(.torn-btn) {\n  border: 1px solid var(--wh-config-border);\n  border-radius: 4px;\n  background: var(--wh-config-control-bg);\n  color: var(--wh-config-text);\n  cursor: pointer;\n}\n\n.__warhelper_config button:not(.torn-btn):hover:not(:disabled) {\n  border-color: var(--wh-config-border-strong);\n  background: var(--wh-config-control-hover-bg);\n}\n\n.__warhelper_config_spy_priority {\n  display: grid;\n  gap: 6px;\n  min-width: 260px;\n  margin: 10px 0;\n}\n\n.__warhelper_config_spy_source {\n  display: grid;\n  grid-template-columns: 1fr auto auto;\n  align-items: center;\n  gap: 6px;\n  padding: 6px;\n  border: 1px solid var(--wh-config-border);\n  border-radius: 5px;\n  background: var(--wh-config-panel-bg);\n  color: var(--wh-config-text);\n}\n\n.__warhelper_config_spy_source_label {\n  font-weight: bold;\n}\n\n.__warhelper_config_spy_source button {\n  width: auto;\n  min-width: 52px;\n  padding: 4px 6px;\n}\n\n.__warhelper_config_spy_source button:disabled {\n  cursor: not-allowed;\n  opacity: 0.45;\n}\n\n.__warhelper_config #__warhelper_config_tab3 input:disabled,\n.__warhelper_config #__warhelper_config_tab3 button:disabled {\n  cursor: not-allowed;\n  opacity: 0.6;\n}\n\n.__warhelper_config .__warhelper_dibs_setup_save.__warhelper_dibs_setup_saved {\n  animation: __warhelper_dibs_setup_saved 850ms ease-out;\n}\n\n@keyframes __warhelper_dibs_setup_saved {\n  0%, 100% {\n    box-shadow: none;\n    filter: none;\n  }\n\n  35% {\n    background-color: #2f9f47;\n    border-color: #75df83;\n    box-shadow: 0 0 10px rgba(117, 223, 131, 0.85);\n    filter: brightness(1.12);\n  }\n}\n\n.__warhelper_config .__warhelper_dibs_setup_status {\n  margin-top: 6px;\n  color: var(--wh-config-muted);\n  font-size: 12px;\n  max-width: 260px;\n}\n\n.__warhelper_config .__warhelper_dibs_setup_status.error {\n  color: var(--wh-config-error);\n}\n\n.__warhelper_config .__warhelper_dibs_setup_status.success {\n  color: var(--wh-config-success);\n}\n\n.__warhelper_config_text {\n  display: block;\n  margin: 10px 0;\n}\n\n.__warhelper_config input:not([type='checkbox']) {\n  display: block;\n  vertical-align: middle;\n  text-align: left;\n  color: var(--input-money-color, var(--wh-config-text));\n  background: var(--input-money-background-color, var(--wh-config-control-bg));\n  border: 1px solid var(--input-money-border-color, var(--wh-config-border));\n  border-radius: 5px;\n  padding: 9px 5px;\n  line-height: 14px;\n  margin-left: 10px;\n}\n\n.__warhelper_config input:not([type='checkbox']):focus {\n  outline: none;\n  border-color: var(--wh-config-border-strong);\n  box-shadow: 0 0 0 2px var(--wh-config-focus);\n}\n\n.__warhelper_config_checkbox {\n  display: flex;\n  margin: 10px 0;\n  align-items: center;\n  gap: 8px;\n  cursor: pointer;\n  font-family: sans-serif;\n  color: var(--wh-config-text);\n}\n\n.__warhelper_config_checkbox input {\n  display: none;\n}\n\n.__warhelper_config_checkbox span {\n  width: 18px;\n  height: 18px;\n  border: 2px solid var(--wh-config-border);\n  border-radius: 4px;\n  background: var(--wh-config-check-bg);\n  display: inline-block;\n  position: relative;\n  transition: all 0.2s ease;\n}\n\n/* checkmark */\n.__warhelper_config_checkbox span::after {\n  content: \"\";\n  position: absolute;\n  left: 4px;\n  top: 0px;\n  width: 5px;\n  height: 10px;\n  border: solid var(--wh-config-check-color);\n  border-width: 0 2px 2px 0;\n  transform: rotate(45deg) scale(0);\n  transition: transform 0.15s ease;\n}\n\n/* checked state */\n.__warhelper_config_checkbox input:checked + span {\n  background: var(--wh-config-check-active-bg);\n  border-color: var(--wh-config-border-strong);\n}\n\n.__warhelper_config_checkbox input:checked + span::after {\n  transform: rotate(45deg) scale(1);\n}\n\n/* hover */\n.__warhelper_config_checkbox:hover span {\n  border-color: var(--wh-config-border-strong);\n}\n    ",
              ));
            const e = this.configElement.querySelector(
              "select.__warhelper_config_tab-select",
            );
            (e.addEventListener("change", () => this.selectTab(e.value)),
              this.bindSpySourcePriorityConfig());
            const n = this.configElement.querySelector("button.save");
            if (null === n) return;
            n.addEventListener("click", () => {
              if (null === this.configElement) return;
              const t = [];
              this.configElement
                .querySelectorAll("input[data-id]")
                .forEach((e) => {
                  if (!(e instanceof HTMLInputElement)) return;
                  const n = e.dataset.id;
                  if (!n) return;
                  const s = `config_${n}`,
                    i = "checkbox" == e.type ? String(e.checked) : e.value;
                  S.get(s) !== i && t.push({ id: n, value: i });
                });
              const e = this.getSpySourceOrderFromConfigElement();
              if (e.length) {
                const n = e.join(",");
                S.get("config_spy_source_order") !== n &&
                  t.push({ id: "spy_source_order", value: n });
              }
              (t.forEach(({ id: t, value: e }) => {
                this.updateConfigValue(t, e);
              }),
                this.toggleConfig(null));
            });
            const s = this.configElement.querySelector("button.bust");
            null !== s &&
              (s.addEventListener("click", () => {
                S.bust([
                  "bsp_",
                  "tornstats_",
                  "ffs_",
                  "yata_",
                  "spy_",
                  "fly_",
                  "armor_",
                ]);
              }),
              document.body.addEventListener("click", (t) => {
                this.configElement?.contains(t.target) ||
                  this.configButton?.contains(t.target) ||
                  this.toggleConfig(null);
              }));
          }
          static getConfiguredSpySourceOrder() {
            const t = S.get("config_spy_source_order"),
              e = "string" == typeof t ? t.split(/[\s>,;\n]+/) : [];
            return this.normalizeSpySourceOrder(e);
          }
          static normalizeSpySourceOrder(t) {
            const e = new Map(this.spySourceEntries.map((t) => [t.id, t.id]));
            (e.set("T", "TS"),
              e.set("TORNSTATS", "TS"),
              e.set("Y", "YATA"),
              e.set("YATASPY", "YATA"),
              e.set("B", "BSP"),
              e.set("F", "FFS"),
              e.set("FFSCOUTER", "FFS"),
              e.set("YATAESTIMATE", "YE"),
              e.set("YATAE", "YE"),
              e.set("ESTIMATE", "YE"));
            const n = new Set(),
              s = [];
            return (
              t.forEach((t) => {
                const i = e.get(
                  t
                    .trim()
                    .toUpperCase()
                    .replace(/[\s_-]/g, ""),
                );
                i && !n.has(i) && (n.add(i), s.push(i));
              }),
              this.spySourceEntries.forEach((t) => {
                n.has(t.id) || (n.add(t.id), s.push(t.id));
              }),
              s
            );
          }
          static bindSpySourcePriorityConfig() {
            const t = this.configElement.querySelector(
              "[data-spy-source-priority]",
            );
            t instanceof HTMLElement &&
              (t.addEventListener("click", (e) => {
                const n = e.target?.closest("[data-spy-source-move]");
                if (!(n instanceof HTMLButtonElement)) return;
                const s = n.closest("[data-spy-source]");
                if (!(s instanceof HTMLElement)) return;
                const i = Number(n.dataset.spySourceMove),
                  r = i < 0 ? s.previousElementSibling : s.nextElementSibling;
                r instanceof HTMLElement &&
                  (i < 0 ? t.insertBefore(s, r) : t.insertBefore(r, s),
                  this.syncSpySourceMoveButtons(),
                  this.updateConfigValue(
                    "spy_source_order",
                    this.getSpySourceOrderFromConfigElement().join(","),
                  ));
              }),
              this.syncSpySourceMoveButtons());
          }
          static syncSpySourceMoveButtons() {
            const t = Array.from(
              this.configElement.querySelectorAll("[data-spy-source]"),
            );
            t.forEach((e, n) => {
              e.querySelectorAll("[data-spy-source-move]").forEach((e) => {
                if (!(e instanceof HTMLButtonElement)) return;
                const s = Number(e.dataset.spySourceMove);
                e.disabled = s < 0 ? 0 === n : n === t.length - 1;
              });
            });
          }
          static getSpySourceOrderFromConfigElement() {
            return Array.from(
              this.configElement.querySelectorAll("[data-spy-source]"),
            )
              .map(
                (t) => (t instanceof HTMLElement && t.dataset.spySource) || "",
              )
              .filter((t) => t);
          }
          static updateConfigValue(t, e) {
            const n = `config_${t}`;
            S.get(n) !== e &&
              (S.set(n, e),
              this.onChangeHandlers[t]?.forEach((n) => {
                n(t, e);
              }));
          }
          static selectTab(t) {
            const e = this.configElement.querySelector(
              "select.__warhelper_config_tab-select",
            );
            if (!(e instanceof HTMLSelectElement)) return;
            const n = Array.from(e.options).find((e) => e.value === t);
            ((!n || n.hidden || n.disabled) && (t = "__warhelper_config_tab1"),
              (e.value = t),
              this.configElement
                .querySelectorAll("[data-tab-content]")
                .forEach((e) => {
                  e.classList.toggle("active", e.id === t);
                }),
              this.configElement.classList.toggle(
                "__warhelper_config_dibs_active",
                "__warhelper_config_tab3" === t,
              ));
          }
          static setDibsTabVisible(t) {
            if (!this.configElement) return;
            const e = this.configElement.querySelector(
              "select.__warhelper_config_tab-select",
            );
            if (!(e instanceof HTMLSelectElement)) return;
            const n = Array.from(e.options).find(
              (t) => "__warhelper_config_tab3" === t.value,
            );
            n &&
              ((n.hidden = !t),
              (n.disabled = !t),
              t ||
                "__warhelper_config_tab3" !== e.value ||
                this.selectTab("__warhelper_config_tab1"));
          }
          static toggleConfig(t) {
            if (null === this.configElement) return;
            if (null === t || !(t instanceof HTMLElement))
              return void (this.configElement.style.display = "none");
            "none" != this.configElement.style.display
              ? (this.configElement.style.display = "none")
              : (this.configElement.style.display = "");
            const e = t.getBoundingClientRect(),
              n = this.configElement.getBoundingClientRect(),
              s = document.body.getBoundingClientRect(),
              i = Math.min(
                e.left + e.width / 2 - n.width / 2,
                s.width - n.width,
              );
            ((this.configElement.style.left = `${i}px`),
              (this.configElement.style.top = `${e.top + e.height}px`));
          }
          static set(t, e) {
            return S.set(`config_${t}`, e);
          }
          static get(t) {
            const e = S.get(`config_${t}`);
            return void 0 === e ? this.getDefaultValue(t) : e;
          }
          static onChange(t, e) {
            (void 0 === this.onChangeHandlers[t] &&
              (this.onChangeHandlers[t] = []),
              this.onChangeHandlers[t].push(e));
          }
          static getDefaultValue(t) {
            switch (t) {
              case "open_attack_in_frame":
                return o() ? "true" : "false";
              case "opponent_chain_tracker":
                return "true";
              default:
                return;
            }
          }
        },
        C = "armor_access",
        k = 86400,
        E = class {
          static {
            this.started = !1;
          }
          static {
            this.status = "unchecked";
          }
          static {
            this.checkedKey = "";
          }
          static {
            this.accessExpiresAt = 0;
          }
          static {
            this.accessCheck = null;
          }
          static {
            this.pendingLoads = new Map();
          }
          static {
            this.pendingSaves = new Map();
          }
          static start() {
            this.started ||
              ((this.started = !0),
              x.onChange("torn_key", () => this.resetAccess()),
              S.onBust(() => this.resetAccess()));
          }
          static hasUsefulItems(t) {
            return Boolean(
              t &&
              "object" == typeof t &&
              !Array.isArray(t) &&
              Object.keys(t).length > 1,
            );
          }
          static getCached(t) {
            if (!Number.isFinite(t) || t <= 0) return null;
            const e = S.get(this.getItemsCacheKey(t));
            return this.hasUsefulItems(e) ? e : null;
          }
          static async save(t, e) {
            if (
              (this.start(),
              !Number.isFinite(t) || t <= 0 || !this.hasUsefulItems(e))
            )
              return;
            const n = this.getItemsSignature(e);
            if (
              (S.set(this.getItemsCacheKey(t), e, k), this.hasSavedItems(t, n))
            )
              return;
            const s = this.pendingSaves.get(t);
            if (s?.signature === n) return s.promise;
            if (s && (await s.promise, this.hasSavedItems(t, n))) return;
            if (!(await this.checkAccess())) return;
            const i = this.getKey();
            if (!i) return;
            const r = this.request(t, "POST", e)
              .then((e) => {
                this.isAccessDeniedResponse(e)
                  ? this.setAccessStatus(i, "disabled")
                  : e.status >= 200 &&
                    e.status < 300 &&
                    !this.isErrorResponse(e.json) &&
                    this.markSavedItems(t, n);
              })
              .finally(() => {
                this.pendingSaves.get(t)?.signature === n &&
                  this.pendingSaves.delete(t);
              });
            return (this.pendingSaves.set(t, { signature: n, promise: r }), r);
          }
          static async load(t, e = !1) {
            if ((this.start(), !Number.isFinite(t) || t <= 0)) return null;
            const n = this.getCached(t);
            if (n) return n;
            if (!e) return null;
            if (!(await this.checkAccess())) return null;
            const s = this.pendingLoads.get(t);
            if (s) return s;
            const i = this.getKey();
            if (!i) return null;
            const r = this.request(t)
              .then((e) => {
                if (this.isAccessDeniedResponse(e))
                  return (this.setAccessStatus(i, "disabled"), null);
                if (
                  404 === e.status ||
                  e.status < 200 ||
                  e.status >= 300 ||
                  this.isErrorResponse(e.json)
                )
                  return null;
                const n = this.parseItems(e.json);
                return n ? (S.set(this.getItemsCacheKey(t), n, k), n) : null;
              })
              .catch(() => null)
              .finally(() => {
                this.pendingLoads.delete(t);
              });
            return (this.pendingLoads.set(t, r), r);
          }
          static getKey() {
            return String(x.get("torn_key") || "").trim();
          }
          static resetAccess() {
            ((this.status = "unchecked"),
              (this.checkedKey = ""),
              (this.accessExpiresAt = 0),
              (this.accessCheck = null));
          }
          static getCachedAccess(t) {
            const e = S.get(C);
            return !e ||
              e.key !== t ||
              !this.isAccessCacheStatus(e.status) ||
              !Number.isFinite(e.expiresAt) ||
              e.expiresAt <= Date.now()
              ? null
              : ((this.checkedKey = t),
                (this.accessExpiresAt = e.expiresAt),
                (this.status = e.status),
                e.status);
          }
          static setAccessStatus(t, e) {
            const n = Date.now() + 864e5;
            ((this.checkedKey = t),
              (this.accessExpiresAt = n),
              (this.status = e),
              S.set(C, { key: t, status: e, expiresAt: n }, 86400));
          }
          static async checkAccess() {
            const t = this.getKey();
            if (!t)
              return ((this.status = "disabled"), (this.checkedKey = ""), !1);
            if (
              this.checkedKey === t &&
              "available" === this.status &&
              this.accessExpiresAt > Date.now()
            )
              return !0;
            if (
              this.checkedKey === t &&
              "disabled" === this.status &&
              this.accessExpiresAt > Date.now()
            )
              return !1;
            const e = this.getCachedAccess(t);
            return e
              ? "available" === e
              : (this.accessCheck ||
                  ((this.status = "checking"),
                  (this.checkedKey = t),
                  (this.accessCheck = this.request(0)
                    .then((e) =>
                      this.isAccessAllowedResponse(e)
                        ? (this.setAccessStatus(t, "available"), !0)
                        : (this.isAccessDeniedResponse(e)
                            ? this.setAccessStatus(t, "disabled")
                            : ((this.status = "unchecked"),
                              (this.checkedKey = "")),
                          !1),
                    )
                    .catch(
                      () => (
                        (this.status = "unchecked"),
                        (this.checkedKey = ""),
                        !1
                      ),
                    )
                    .finally(() => {
                      this.accessCheck = null;
                    }))),
                this.accessCheck);
          }
          static request(e, s = "GET", i) {
            const r = this.getKey(),
              a = {
                method: s,
                url: `https://torn.seintz.com/api/${encodeURIComponent(r)}/armor/${encodeURIComponent(String(e))}`,
                timeout: 1e4,
              };
            return (
              "POST" === s &&
                ((a.headers = { "Content-Type": "application/json" }),
                (a.data = JSON.stringify(i || {}))),
              t
                .request(a)
                .then((t) => ({ status: t.status, json: n(t.responseText) }))
            );
          }
          static getItemsCacheKey(t) {
            return `armor_items_${t}`;
          }
          static getSavedCacheKey(t) {
            return `armor_saved_${t}`;
          }
          static hasSavedItems(t, e) {
            const n = S.get(this.getSavedCacheKey(t));
            return !(!n || "object" != typeof n) && n.signature === e;
          }
          static markSavedItems(t, e) {
            S.set(this.getSavedCacheKey(t), { signature: e }, k);
          }
          static getItemsSignature(t) {
            return JSON.stringify(this.normalizeForSignature(t)) || "";
          }
          static normalizeForSignature(t) {
            if (Array.isArray(t))
              return t.map((t) => this.normalizeForSignature(t));
            if (!t || "object" != typeof t) return t;
            const e = t,
              n = {};
            return (
              Object.keys(e)
                .sort()
                .forEach((t) => {
                  n[t] = this.normalizeForSignature(e[t]);
                }),
              n
            );
          }
          static parseItems(t) {
            if (this.hasUsefulItems(t)) return t;
            if (!t || "object" != typeof t || Array.isArray(t)) return null;
            const e = t,
              n = e.items ?? e.armor ?? e.defenderItems ?? e.json;
            return this.hasUsefulItems(n) ? n : null;
          }
          static isAccessAllowedResponse(t) {
            return (
              (t.status >= 200 &&
                t.status < 300 &&
                !this.isErrorResponse(t.json)) ||
              (404 === t.status &&
                "armor not found" === this.getErrorMessage(t.json))
            );
          }
          static isAccessDeniedResponse(t) {
            return (
              401 === t.status ||
              403 === t.status ||
              (400 === t.status && "wrong key" === this.getErrorMessage(t.json))
            );
          }
          static isErrorResponse(t) {
            return Boolean(t && "object" == typeof t && "error" in t);
          }
          static getErrorMessage(t) {
            if (!t || "object" != typeof t) return "";
            const e = t.error;
            return "string" == typeof e ? e : "";
          }
          static isAccessCacheStatus(t) {
            return "available" === t || "disabled" === t;
          }
        },
        T = class t {
          static {
            this.handlers = [];
          }
          static {
            this.sharedWorkerDebug = !1;
          }
          static {
            this.sharedWorkerDebugLimit = 50;
          }
          static {
            this.sharedWorkerMessages = [];
          }
          static {
            this.chatMessageListRefreshDelayMs = 350;
          }
          static {
            this.chatMessageListFallbackMs = 2500;
          }
          static {
            this.chatDomMessageListRefreshDelayMs = 3e3;
          }
          static {
            this.sharedWorkerId = 0;
          }
          static {
            this.sharedWorkers = [];
          }
          static {
            this.chatSharedWorker = null;
          }
          static {
            this.pendingChatMessageLists = new Map();
          }
          static {
            (this.injectXHR(),
              this.injectFetch(),
              this.injectWebsocket(),
              this.injectSharedWorker());
          }
          static injectXHR() {
            const n = e.XMLHttpRequest.prototype.open;
            e.XMLHttpRequest.prototype.open = function (...e) {
              const s = e[1];
              if (!t.hasMatchingHandlers(0, s)) return n.apply(this, e);
              const i = this;
              return (
                this.addEventListener("readystatechange", () => {
                  if (i.readyState !== XMLHttpRequest.DONE) return;
                  const e = i.status;
                  (0 !== e && (e < 200 || e >= 400)) ||
                    t.handleMessage(0, i.responseText, s);
                }),
                n.apply(this, e)
              );
            };
          }
          static injectFetch() {
            const n = e.fetch;
            e.fetch = async function (...e) {
              const s = e[0]?.url || e[0],
                i = await n.apply(this, e);
              if (!t.hasMatchingHandlers(1, s)) return i;
              const r = await i
                .clone()
                .text()
                .then((e) => t.handleMessage(1, e, s));
              if (void 0 === r) return i;
              return new Response(r, {
                status: i.status,
                statusText: i.statusText,
                headers: i.headers,
              });
            };
          }
          static injectWebsocket() {
            const n = e.WebSocket;
            ((e.WebSocket = function (...e) {
              const s = new n(...e),
                i = s.addEventListener,
                r = s.removeEventListener,
                a = new Map();
              let o = null,
                l = null;
              const c = (e) =>
                function (n) {
                  const i = t.handleMessage(2, n.data),
                    r = new MessageEvent("message", {
                      data: void 0 === i ? n.data : i,
                      origin: n.origin,
                      lastEventId: n.lastEventId,
                      source: n.source,
                      ports: Array.from(n.ports || []),
                    });
                  return "function" == typeof e
                    ? e.call(s, r)
                    : e && "function" == typeof e.handleEvent
                      ? e.handleEvent(r)
                      : void 0;
                };
              return (
                (s.addEventListener = function (...t) {
                  const [e, n, r] = t;
                  if ("message" !== e || !n) return i.apply(s, t);
                  const o = c(n);
                  return (a.set(n, o), i.call(s, e, o, r));
                }),
                (s.removeEventListener = function (...t) {
                  const [e, n, i] = t;
                  if ("message" !== e || !n) return r.apply(s, t);
                  const o = a.get(n) || n;
                  return (a.delete(n), r.call(s, e, o, i));
                }),
                Object.defineProperty(s, "onmessage", {
                  get: () => o,
                  set(t) {
                    (l && (r.call(s, "message", l), (l = null)),
                      (o = t),
                      t && ((l = c(t)), i.call(s, "message", l)));
                  },
                  configurable: !0,
                }),
                s
              );
            }),
              (e.WebSocket.prototype = n.prototype));
            try {
              Object.setPrototypeOf(e.WebSocket, n);
            } catch {}
          }
          static injectSharedWorker() {
            const n = e.SharedWorker;
            "function" == typeof n &&
              ((e.__warhelperSharedWorkers = this.sharedWorkers),
              (e.__warhelperSharedWorkerDebug = !1),
              (e.__warhelperSharedWorkerMessages = this.sharedWorkerMessages),
              (e.__warhelperGetSharedWorkerMessages = () => [
                ...this.sharedWorkerMessages,
              ]),
              (e.__warhelperClearSharedWorkerMessages = () => {
                this.sharedWorkerMessages.length = 0;
              }),
              (e.__warhelperChatSharedWorker = null),
              (e.__warhelperChatSharedWorkerWorker = null),
              (e.__warhelperChatSharedWorkerPort = null),
              (e.__warhelperGetChatSharedWorker = () => this.chatSharedWorker),
              (e.__warhelperSendChatMessage = (t, e, n, s, i) =>
                this.sendChatMessage(t, e, n, s, i)),
              (e.__warhelperSharedWorkerPost = (t, e, n) => {
                const s = this.getSharedWorkerDebugHandle(t);
                s
                  ? s.postMessage(e, n)
                  : console.warn("[WarHelper SharedWorker] no worker found", t);
              }),
              (e.SharedWorker = function (...e) {
                const s = new n(...e);
                return t.observeSharedWorker(s, e);
              }),
              (e.SharedWorker.prototype = n.prototype));
          }
          static observeSharedWorker(t, e) {
            const n = t?.port,
              s = ++this.sharedWorkerId,
              i = e[0],
              r = e[1],
              a = this.isChatSharedWorkerUrl(i),
              o = {
                id: s,
                url: i,
                options: r,
                worker: t,
                port: n,
                isChat: a,
                postMessage: (t, e) => {
                  this.postToSharedWorkerPort(n, t, e);
                },
                send: (t, e) => {
                  this.postToSharedWorkerPort(n, t, e);
                },
              };
            return (
              this.sharedWorkers.push(o),
              this.logSharedWorker("[WarHelper SharedWorker] created", o),
              a && this.exposeChatSharedWorker(o),
              n
                ? (this.observeSharedWorkerPort(s, n), t)
                : (console.warn(
                    "[WarHelper SharedWorker] worker has no port",
                    o,
                  ),
                  t)
            );
          }
          static exposeChatSharedWorker(t) {
            ((this.chatSharedWorker = t),
              (e.__warhelperChatSharedWorker = t),
              (e.__warhelperChatSharedWorkerWorker = t.worker),
              (e.__warhelperChatSharedWorkerPort = t.port),
              this.logSharedWorker("[WarHelper SharedWorker] chat worker", t));
          }
          static observeSharedWorkerPort(t, e) {
            (this.injectSharedWorkerPostMessage(t, e),
              "function" == typeof e.addEventListener &&
                (e.addEventListener("message", (e) => {
                  (this.logSharedWorker("[WarHelper SharedWorker] recv", {
                    id: t,
                    data: e.data,
                    event: e,
                  }),
                    this.handleSharedWorkerMessage(t, e.data));
                }),
                e.addEventListener("messageerror", (e) => {
                  console.warn("[WarHelper SharedWorker] messageerror", {
                    id: t,
                    data: e.data,
                    event: e,
                  });
                })));
          }
          static injectSharedWorkerPostMessage(e, n) {
            if ("function" != typeof n.postMessage) return;
            const s = n.postMessage;
            n.postMessage = function (...i) {
              return (
                t.logSharedWorker("[WarHelper SharedWorker] send", {
                  id: e,
                  data: i[0],
                  transferOrOptions: i[1],
                  args: i,
                }),
                s.apply(n, i)
              );
            };
          }
          static postToSharedWorkerPort(t, e, n) {
            t && "function" == typeof t.postMessage
              ? void 0 !== n
                ? t.postMessage(e, n)
                : t.postMessage(e)
              : console.warn(
                  "[WarHelper SharedWorker] port is not available",
                  t,
                );
          }
          static getSharedWorkerDebugHandle(t) {
            return this.sharedWorkers.find((e) => e.id === t);
          }
          static isChatSharedWorkerUrl(t) {
            return String(t || "")
              .toLowerCase()
              .includes("chat");
          }
          static logSharedWorker(...t) {
            (this.recordSharedWorkerDebug(t),
              this.isSharedWorkerDebugEnabled() && console.log(...t));
          }
          static recordSharedWorkerDebug(t) {
            const e = Date.now();
            (this.sharedWorkerMessages.push({
              timestamp: e,
              isoTime: new Date(e).toISOString(),
              label:
                "string" == typeof t[0] ? t[0] : "[WarHelper SharedWorker]",
              detail: t[1],
              args: t.slice(1),
            }),
              this.sharedWorkerMessages.length <= this.sharedWorkerDebugLimit ||
                this.sharedWorkerMessages.splice(
                  0,
                  this.sharedWorkerMessages.length -
                    this.sharedWorkerDebugLimit,
                ));
          }
          static isSharedWorkerDebugEnabled() {
            return (
              this.sharedWorkerDebug || !0 === e.__warhelperSharedWorkerDebug
            );
          }
          static sendChatMessage(t, e, n, s, i) {
            const r =
              "object" == typeof t
                ? t
                : {
                    channelId: t,
                    message: e || "",
                    ...(void 0 !== n ? { channelType: n } : {}),
                    ...(void 0 !== s ? { id: s } : {}),
                    refreshMessages: !i || {
                      channelId: i,
                      ...(void 0 !== n ? { channelType: n } : {}),
                    },
                  };
            if ("string" != typeof r.channelId || !r.channelId)
              return void console.warn(
                "[WarHelper SharedWorker] chat channelId is required",
                r,
              );
            if ("string" != typeof r.message)
              return void console.warn(
                "[WarHelper SharedWorker] chat message is required",
                r,
              );
            const a = this.sendChatMessageViaDom(r);
            if (a) return a;
            const o = this.chatSharedWorker;
            if (!o)
              return void console.warn(
                "[WarHelper SharedWorker] chat worker not found yet",
              );
            const l = {
                type: "sendMessage",
                payload: {
                  channelId: r.channelId,
                  channelType: r.channelType || "group",
                  message: r.message,
                  id: r.id || this.createChatMessageId(),
                },
              },
              c = this.createChatMessageListData(r);
            return (
              c && this.queueChatMessageList(l.payload.id, o, c, r),
              o.postMessage(l),
              {
                sendMessage: l,
                getMessageList: c,
                getMessageListPending: Boolean(c),
              }
            );
          }
          static sendChatMessageViaDom(t) {
            const e = document.getElementById(t.channelId);
            if (!e) return null;
            const n = e.querySelector("textarea");
            if (!(n instanceof HTMLTextAreaElement)) return null;
            const s = Object.getOwnPropertyDescriptor(
              HTMLTextAreaElement.prototype,
              "value",
            )?.set;
            (s ? s.call(n, t.message) : (n.value = t.message),
              n.focus(),
              n.dispatchEvent(
                new InputEvent("input", {
                  bubbles: !0,
                  composed: !0,
                  inputType: "insertText",
                  data: t.message,
                }),
              ),
              n.dispatchEvent(new Event("change", { bubbles: !0 })));
            const i = n.nextElementSibling,
              r =
                i instanceof HTMLButtonElement
                  ? i
                  : e.querySelector("textarea + button");
            if (!(r instanceof HTMLButtonElement))
              return {
                sentVia: "dom",
                clicked: !1,
                channelId: t.channelId,
                message: t.message,
              };
            r.click();
            return {
              sentVia: "dom",
              clicked: !0,
              refreshScheduled: this.scheduleDomChatRefresh(t),
              channelId: t.channelId,
              message: t.message,
            };
          }
          static scheduleDomChatRefresh(t) {
            const n = this.chatSharedWorker,
              s = this.createChatMessageListData(t);
            return (
              !(!n || !s) &&
              (e.setTimeout(() => {
                this.sendChatRefreshMessages(n, s);
              }, this.getDomChatMessageListRefreshDelayMs(t)),
              !0)
            );
          }
          static queueChatMessageList(t, n, s, i) {
            const r = {
              handle: n,
              data: s,
              delayMs: this.getChatMessageListRefreshDelayMs(i),
              fallbackTimeoutId: null,
            };
            ((r.fallbackTimeoutId = e.setTimeout(() => {
              this.pendingChatMessageLists.get(t) === r &&
                (this.pendingChatMessageLists.delete(t),
                this.sendPendingChatMessageList(r));
            }, this.getChatMessageListFallbackMs(i))),
              this.pendingChatMessageLists.set(t, r));
          }
          static handleSharedWorkerMessage(t, e) {
            this.maybeSendPendingChatMessageList(t, e);
          }
          static maybeSendPendingChatMessageList(t, n) {
            const s = this.getSendMessageResultRequestId(n);
            if (!s) return;
            const i = this.pendingChatMessageLists.get(s);
            i &&
              i.handle.id === t &&
              (this.pendingChatMessageLists.delete(s),
              null !== i.fallbackTimeoutId &&
                e.clearTimeout(i.fallbackTimeoutId),
              this.sendPendingChatMessageList(i));
          }
          static sendPendingChatMessageList(t) {
            t.delayMs <= 0
              ? this.sendChatRefreshMessages(t.handle, t.data)
              : e.setTimeout(() => {
                  this.sendChatRefreshMessages(t.handle, t.data);
                }, t.delayMs);
          }
          static sendChatRefreshMessages(t, e) {
            const n = e?.payload?.channelId;
            n
              ? (t.postMessage({ type: "ensureConnected" }),
                t.postMessage({ type: "getGroupChannel", payload: n }),
                t.postMessage(e),
                t.postMessage({
                  type: "getTypingUsersInGroupChannel",
                  payload: n,
                }))
              : t.postMessage(e);
          }
          static getSendMessageResultRequestId(t) {
            const e = t?.type ? t : t?.data;
            if (
              "sendMessageResult" !== e?.type ||
              "sendMessage" !== e?.request?.type
            )
              return null;
            const n = e.request?.payload?.id;
            return "string" == typeof n && n ? n : null;
          }
          static createChatMessageListData(t) {
            const e = t.refreshMessages ?? !0;
            if (!1 === e) return null;
            const n = "object" == typeof e ? e : {};
            return {
              type: "getMessageList",
              payload: {
                channelId: n.channelId || t.channelId,
                channelType: n.channelType || t.channelType || "group",
                limit: n.limit || 50,
              },
            };
          }
          static getChatMessageListRefreshDelayMs(t) {
            const e = t.refreshMessages,
              n = "object" == typeof e ? e.delayMs : t.refreshDelayMs;
            return this.normalizeDelayMs(n, this.chatMessageListRefreshDelayMs);
          }
          static getChatMessageListFallbackMs(t) {
            const e = t.refreshMessages,
              n = "object" == typeof e ? e.fallbackMs : t.refreshFallbackMs;
            return this.normalizeDelayMs(n, this.chatMessageListFallbackMs);
          }
          static getDomChatMessageListRefreshDelayMs(t) {
            const e = t.refreshMessages,
              n = "object" == typeof e ? e.delayMs : t.refreshDelayMs;
            return this.normalizeDelayMs(
              n,
              this.chatDomMessageListRefreshDelayMs,
            );
          }
          static normalizeDelayMs(t, e) {
            return "number" == typeof t && Number.isFinite(t) && t >= 0 ? t : e;
          }
          static createChatMessageId() {
            const t = e.crypto || window.crypto;
            return t && "function" == typeof t.randomUUID
              ? t.randomUUID()
              : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (t) => {
                  const e = Math.floor(16 * Math.random());
                  return ("x" === t ? e : (3 & e) | 8).toString(16);
                });
          }
          static onMessage(t, e, n) {
            this.handlers.push({
              type: t,
              callback: e,
              filter: 1 == t ? (n ? new RegExp(n) : n) : n ? n.split(".") : n,
            });
          }
          static handleMessage(t, e, s = "") {
            const i = n(e);
            if (!i) return;
            const r = this.emitMessage(t, i, s);
            return void 0 === r ? void 0 : JSON.stringify(r);
          }
          static emitMessage(t, e, n) {
            let s;
            return (
              this.handlers
                .filter((e) => e.type == t || 3 == e.type)
                .forEach((i) => {
                  if (
                    !i.filter ||
                    (1 == t &&
                      i.filter instanceof RegExp &&
                      i.filter.exec(n)) ||
                    (2 == t &&
                      ((r = i.filter),
                      Array.isArray(r) &&
                        r.every((t) => "string" == typeof t)) &&
                      h(e, i.filter))
                  ) {
                    const t = i.callback(e);
                    void 0 !== t && ((e = t), (s = t));
                  }
                  var r;
                }),
              s
            );
          }
          static hasMatchingHandlers(t, e) {
            return this.handlers.some(
              (n) =>
                (n.type == t || 3 == n.type) &&
                (!n.filter ||
                  (1 == t && n.filter instanceof RegExp && n.filter.test(e))),
            );
          }
        },
        M = ((t) => (
          (t[(t.Primary = 1)] = "Primary"),
          (t[(t.Secondary = 2)] = "Secondary"),
          (t[(t.Melee = 3)] = "Melee"),
          (t[(t.Temporary = 5)] = "Temporary"),
          (t[(t.Body = 4)] = "Body"),
          (t[(t.Head = 6)] = "Head"),
          (t[(t.Legs = 7)] = "Legs"),
          (t[(t.Boots = 8)] = "Boots"),
          (t[(t.Gloves = 9)] = "Gloves"),
          t
        ))(M || {});
      function F(t, e) {
        return Object.prototype.hasOwnProperty.call(t, e);
      }
      function I(t) {
        const e = "string" == typeof t ? t.replace(/,/g, "").trim() : t;
        if ("" === e) return null;
        const n = Number(e);
        return Number.isFinite(n) ? n : null;
      }
      function D(t) {
        if ("string" != typeof t) return null;
        switch (t.trim().toLowerCase()) {
          case "okay":
            return "Okay";
          case "hospital":
            return "Hospital";
          case "jail":
            return "Jail";
          case "traveling":
          case "travelling":
            return "Traveling";
          case "abroad":
            return "Abroad";
          case "federal":
            return "Federal";
          case "fallen":
            return "Fallen";
          default:
            return null;
        }
      }
      function L(t) {
        return D(t.text) || D(t.state);
      }
      function U(t) {
        return F(t, "updateAt")
          ? I(t.updateAt)
          : F(t, "until")
            ? I(t.until)
            : null;
      }
      function R(t) {
        return I(
          t?.factionId ??
            t?.factionID ??
            t?.faction_id ??
            t?.faction?.id ??
            t?.faction?.ID,
        );
      }
      function N(t) {
        return I(
          t?.userID ?? t?.userId ?? t?.user_id ?? t?.user?.id ?? t?.user?.ID,
        );
      }
      function B(t) {
        const e =
          t?.playername ??
          t?.playerName ??
          t?.player_name ??
          t?.name ??
          t?.userName ??
          t?.username ??
          t?.user?.name;
        return "string" == typeof e && e.trim() ? e.trim() : null;
      }
      function P(t) {
        if ("string" == typeof t) {
          const e = t.trim().toLowerCase();
          if ("online" === e || "idle" === e || "offline" === e) return e;
        }
        if (t && "object" == typeof t) {
          const e = t;
          return P(e.status ?? e.state ?? e.text ?? e.type);
        }
        return "unknown";
      }
      function q(t) {
        return P(
          t?.onlineStatus ??
            t?.online_status ??
            t?.activityStatus ??
            t?.activity_status ??
            t?.lastAction ??
            t?.last_action ??
            t?.lastaction ??
            t?.user?.lastAction ??
            t?.user?.last_action ??
            t?.onlineStatus?.status,
        );
      }
      function H(t) {
        const e = t?.status ?? t?.userStatus ?? t?.user_status ?? t?.state;
        if (e && "object" == typeof e) return e;
        const n = "string" == typeof e ? e : "";
        if (!n) return null;
        const s = { state: n },
          i = I(t?.updateAt ?? t?.until ?? t?.statusUntil ?? t?.status_until);
        null !== i && (s.until = i);
        const r = I(t?.area ?? t?.travelArea ?? t?.travel_area);
        return (null !== r && (s.area = r), s);
      }
      var O = class t extends EventTarget {
          static {
            this.currentUser = 0;
          }
          static {
            this.userStatus = {};
          }
          static {
            this.observedStatusUserIds = new Set();
          }
          static {
            this.userStatusChangedFrame = null;
          }
          static {
            this.pendingChangedUserIds = new Set();
          }
          static {
            this.pendingStatusChangedUserIds = new Set();
          }
          static {
            this.defenderItems = {};
          }
          static {
            this.warStatus = null;
          }
          static {
            this.warGraph = { score: [], goal: [] };
          }
          static {
            T.onMessage(3, (t) => this.handleMessage(t));
          }
          static {
            this._instance = new t();
          }
          static dispatch(t) {
            this._instance.dispatchEvent(t);
          }
          static dispatchUserStatusChanged() {
            null === this.userStatusChangedFrame &&
              (this.userStatusChangedFrame = requestAnimationFrame(() => {
                const t = Array.from(this.pendingChangedUserIds),
                  e = Array.from(this.pendingStatusChangedUserIds);
                (this.pendingChangedUserIds.clear(),
                  this.pendingStatusChangedUserIds.clear(),
                  (this.userStatusChangedFrame = null),
                  this.dispatch(
                    new CustomEvent("UserStatusChanged", {
                      detail: { userIds: t, statusUserIds: e },
                    }),
                  ));
              }));
          }
          static on(t, e) {
            this._instance.addEventListener(t, e);
          }
          static parseWarGraphEntries(t) {
            return Array.isArray(t)
              ? t.reduce((t, e) => {
                  if (!Array.isArray(e) || e.length < 2) return t;
                  const n = I(e[0]),
                    s = I(e[1]);
                  return (
                    null === n ||
                      null === s ||
                      t.push({ timestamp: n, value: s }),
                    t
                  );
                }, [])
              : [];
          }
          static areWarGraphEntriesEqual(t, e) {
            return (
              t.length === e.length &&
              t.every((t, n) => {
                const s = e[n];
                return s?.timestamp === t.timestamp && s.value === t.value;
              })
            );
          }
          static updateUserStatus(
            t,
            e = null,
            n = null,
            s = null,
            i = null,
            r = "unknown",
          ) {
            const a = I(t);
            if (null === a || 0 == a) return;
            let o = !1,
              l = !1;
            void 0 === this.userStatus[a] &&
              ((o = !0),
              (this.userStatus[a] = {
                area: 1,
                status: "Okay",
                updateAt: 0,
                score: 0,
                factionId: 0,
                name: "",
                onlineStatus: "unknown",
              }));
            const c =
              !!e &&
              (function (t) {
                const e = U(t);
                return null !== L(t) || (null !== e && e > 0);
              })(e);
            if (e) {
              c && this.observedStatusUserIds.add(a);
              const t = F(e, "area") ? I(e.area) : null,
                n = L(e),
                s = U(e);
              (null !== t &&
                this.userStatus[a].area != t &&
                ((this.userStatus[a].area = t), (o = !0), (l = !0)),
                null !== n &&
                  this.userStatus[a].status != n &&
                  ((this.userStatus[a].status = n), (o = !0), (l = !0)),
                null !== s &&
                  this.userStatus[a].updateAt != s &&
                  ((this.userStatus[a].updateAt = s), (o = !0), (l = !0)));
            }
            const h = null !== n ? I(n) : null;
            (null !== h &&
              ((o = !0),
              h < 0
                ? (this.userStatus[a].score = Math.abs(h))
                : (this.userStatus[a].score += h)),
              null !== s &&
                this.userStatus[a].factionId != s &&
                ((this.userStatus[a].factionId = s), (o = !0)),
              null !== i &&
                this.userStatus[a].name != i &&
                ((this.userStatus[a].name = i), (o = !0)),
              "unknown" !== r &&
                this.userStatus[a].onlineStatus != r &&
                ((this.userStatus[a].onlineStatus = r), (o = !0)),
              o &&
                (this.pendingChangedUserIds.add(a),
                l && this.pendingStatusChangedUserIds.add(a),
                c && this.cacheUserStatus(a),
                this.dispatchUserStatusChanged()));
          }
          static getUserStatusCacheKey(t) {
            return `user_status_${t}`;
          }
          static cacheUserStatus(t) {
            const e = this.userStatus[t];
            e && S.set(this.getUserStatusCacheKey(t), { ...e }, 172800);
          }
          static readCachedUserStatus(t) {
            const e = S.get(this.getUserStatusCacheKey(t));
            if (
              (function (t) {
                if (!t || "object" != typeof t) return !1;
                const e = t,
                  n = e.onlineStatus;
                return (
                  null !== I(e.area) &&
                  "string" == typeof e.status &&
                  null !== I(e.updateAt) &&
                  null !== I(e.score) &&
                  null !== I(e.factionId) &&
                  "string" == typeof e.name &&
                  null !== D(e.status) &&
                  ("online" === n ||
                    "idle" === n ||
                    "offline" === n ||
                    "unknown" === n)
                );
              })(e)
            )
              return { ...e };
          }
          static setDefenderItems(t, e) {
            ((this.defenderItems[t] = e),
              this.dispatch(
                new CustomEvent("DefenderItemsChanged", {
                  detail: { userId: t, items: e },
                }),
              ));
          }
          static handleDefenderItems(t, e) {
            const n = I(t);
            if (null === n || n <= 0) return null;
            if (E.hasUsefulItems(e))
              return (
                this.setDefenderItems(n, e),
                E.save(n, e).catch(console.error),
                e
              );
            const s = E.getCached(n);
            return s
              ? (this.setDefenderItems(n, s), s)
              : (E.load(n)
                  .then((t) => {
                    t && this.setDefenderItems(n, t);
                  })
                  .catch(console.error),
                null);
          }
          static getCurrentUserId() {
            return (
              this.currentUser ||
                (this.currentUser = (function () {
                  const t = document.querySelector(
                    '.settings-menu a[href*="XID="]',
                  );
                  if (!(t instanceof HTMLAnchorElement)) return 0;
                  const e = t.href.match(/XID=(\d+)/i);
                  return e?.[1] ? parseInt(e[1]) : 0;
                })()),
              this.currentUser
            );
          }
          static handleMessage(t) {
            try {
              if (
                ("object" != typeof t && (t = JSON.parse(t)),
                "object" != typeof t)
              )
                return;
              let e = !1;
              const n = t?.DB?.attackerUser;
              n &&
                this.updateUserStatus(N(n) || 0, H(n), null, R(n), B(n), q(n));
              const s = t?.DB?.defenderUser,
                r =
                  N(s) ||
                  (function (t) {
                    return I(
                      t?.DB?.defenderUserId ??
                        t?.DB?.defenderUserID ??
                        t?.DB?.defenderId ??
                        t?.DB?.defenderID ??
                        t?.defenderUserId ??
                        t?.defenderUserID ??
                        t?.defenderId ??
                        t?.defenderID ??
                        t?.defender?.userID ??
                        t?.defender?.userId,
                    );
                  })(t) ||
                  0;
              s && this.updateUserStatus(r, H(s), null, R(s), B(s), q(s));
              const a = t?.DB?.defenderItems;
              if (a) {
                let n = this.handleDefenderItems(r, a);
                (n &&
                  "true" !== x.get("disable_hiding_cosmetics") &&
                  (n = Object.keys(n)
                    .filter((t) => {
                      const { equipSlot: e } = n?.[t]?.item?.[0];
                      return e && Object.values(M).includes(e);
                    })
                    .reduce((t, e) => ((t[e] = n?.[e]), t), {})),
                  n && n !== a && ((t.DB.defenderItems = n), (e = !0)));
              }
              const o =
                t?.push?.pub?.data?.message?.namespaces?.users?.actions
                  ?.updateStatus;
              o && this.updateUserStatus(o.userId, o.status);
              const l =
                t?.push?.pub?.data?.message?.namespaces?.warBoxes?.actions
                  ?.attackFinish;
              l && this.updateUserStatus(l.attacker.userId, null, l.respect);
              const c = t?.warDesc?.members;
              c &&
                c.forEach((t) => {
                  const e = I(t.score);
                  this.updateUserStatus(
                    N(t) || 0,
                    t.status,
                    null !== e ? -e : null,
                    R(t),
                    B(t),
                    q(t),
                  );
                });
              const h = t?.warDesc?.graph;
              let d = !1;
              if (h?.data) {
                const t = this.parseWarGraphEntries(h.data);
                this.areWarGraphEntriesEqual(this.warGraph.score, t) ||
                  ((this.warGraph.score = t), (d = !0));
              }
              if (h?.respectRequirement) {
                const t = this.parseWarGraphEntries(h.respectRequirement);
                this.areWarGraphEntriesEqual(this.warGraph.goal, t) ||
                  ((this.warGraph.goal = t), (d = !0));
              }
              d && this.dispatch(new Event("WarGraphChanged"));
              const u = t?.users;
              u &&
                Object.keys(u).forEach((t) => {
                  this.updateUserStatus(
                    t,
                    u[t].status,
                    null,
                    null,
                    null,
                    q(u[t]),
                  );
                });
              const p = t?.rankedWarMembers;
              p &&
                Object.keys(p).forEach((t) => {
                  this.updateUserStatus(t, null, null, null, null, q(p[t]));
                });
              const g = t?.wars?.find((t) => "rank" == t.key);
              if (g) {
                const t = {
                  started: I(g.timer),
                  initRespectRequirement: I(g.initRespectRequirement),
                  respectRequirement: I(g.respectRequirement),
                  ownScore: Math.floor(I(g.currentFaction?.score) || 0),
                  opponentScore: Math.floor(I(g.opponentFaction?.score) || 0),
                };
                if (
                  null !== t.started &&
                  null !== t.initRespectRequirement &&
                  null !== t.respectRequirement &&
                  null !== t.ownScore &&
                  null !== t.opponentScore
                ) {
                  const e = this.warStatus;
                  ((this.warStatus = t),
                    (e &&
                      e.started === this.warStatus.started &&
                      e.initRespectRequirement ===
                        this.warStatus.initRespectRequirement &&
                      e.respectRequirement ===
                        this.warStatus.respectRequirement &&
                      e.ownScore === this.warStatus.ownScore &&
                      e.opponentScore === this.warStatus.opponentScore) ||
                      this.dispatch(new Event("WarStatusChanged")));
                }
              }
              const f = t?.time;
              return (f && i(f), e ? t : void 0);
            } catch (t) {}
          }
          static getUserStatus(t) {
            const e = this.userStatus[t];
            return e && this.observedStatusUserIds.has(t)
              ? e
              : this.readCachedUserStatus(t);
          }
          static setUserStatus(t, e) {
            this.updateUserStatus(t, e);
          }
          static getWarStatus() {
            return this.warStatus ? { ...this.warStatus } : null;
          }
          static getWarGraph() {
            return {
              score: this.warGraph.score.map((t) => ({ ...t })),
              goal: this.warGraph.goal.map((t) => ({ ...t })),
            };
          }
          static getWarUserStatuses() {
            const t = {};
            return (
              Object.keys(this.userStatus).forEach((e) => {
                const n = this.userStatus[Number(e)];
                n?.factionId && (t[Number(e)] = { ...n });
              }),
              t
            );
          }
          static getDefenderItems(t) {
            return this.defenderItems[t] || E.getCached(t) || void 0;
          }
          static getCurrentFactionId() {
            return this.getCurrentUserStatus()?.factionId || 0;
          }
          static getCurrentUserStatus() {
            return this.userStatus[this.getCurrentUserId()];
          }
        },
        W = "__warhelper_custom_tooltip",
        j = class {
          static {
            this.documentStates = new WeakMap();
          }
          static {
            this.states = [];
          }
          static bind(t, e) {
            this.init(t.ownerDocument);
            let n = e;
            const s = (e) => {
                "touch" !== e.pointerType && this.show(t, n, e, !1);
              },
              i = (e) => {
                "touch" !== e.pointerType && this.move(t, e);
              },
              r = (e) => {
                if ("touch" !== e.pointerType) return;
                const s = this.getDocumentState(t.ownerDocument);
                s.state?.owner === t && s.state.pinned
                  ? this.hide(t)
                  : this.show(t, n, t, !0);
              },
              a = (e) => {
                "touch" !== e.pointerType && this.hide(t);
              },
              o = () => this.show(t, n, t, !0),
              l = () => this.hide(t),
              c = (e) => {
                "Escape" === e.key && this.hide(t);
              };
            return (
              t.addEventListener("pointerenter", s),
              t.addEventListener("pointermove", i),
              t.addEventListener("pointerdown", r),
              t.addEventListener("pointerleave", a),
              t.addEventListener("pointercancel", a),
              t.addEventListener("focus", o),
              t.addEventListener("blur", l),
              t.addEventListener("keydown", c),
              {
                update: (e) => {
                  n = e;
                  const s = this.getDocumentState(t.ownerDocument);
                  s.state?.owner === t &&
                    this.show(t, n, s.state.anchor, s.state.pinned);
                },
                destroy: () => {
                  (t.removeEventListener("pointerenter", s),
                    t.removeEventListener("pointermove", i),
                    t.removeEventListener("pointerdown", r),
                    t.removeEventListener("pointerleave", a),
                    t.removeEventListener("pointercancel", a),
                    t.removeEventListener("focus", o),
                    t.removeEventListener("blur", l),
                    t.removeEventListener("keydown", c),
                    this.hide(t));
                },
              }
            );
          }
          static show(t, e, n, s = !1) {
            const i = this.init(t.ownerDocument),
              r = this.getContent(e);
            if (!r) return void this.hide(t);
            const a = this.getNode(i);
            ((a.className =
              `__warhelper_custom_tooltip ${e.className || ""}`.trim()),
              (a.style.visibility = "hidden"),
              (a.style.display = "block"),
              a.setAttribute("role", "tooltip"),
              e.html ? (a.innerHTML = r) : (a.textContent = r),
              t.setAttribute("aria-describedby", W),
              (i.state = { owner: t, options: e, anchor: n, pinned: s }),
              this.position(
                i,
                n,
                e.placement || (this.isHTMLElement(n) ? "element" : "pointer"),
                e.side,
              ),
              (a.style.visibility = ""));
          }
          static hide(t) {
            if (t) {
              const e = this.documentStates.get(t.ownerDocument);
              if (!e || e.state?.owner !== t) return;
              return void this.hideState(e);
            }
            this.states.forEach((t) => this.hideState(t));
          }
          static refresh(t) {
            if (t) {
              const e = this.documentStates.get(t.ownerDocument);
              if (!e?.state || e.state.owner !== t) return;
              return void this.show(
                e.state.owner,
                e.state.options,
                e.state.anchor,
                e.state.pinned,
              );
            }
            this.states.forEach((t) => {
              t.state &&
                this.show(
                  t.state.owner,
                  t.state.options,
                  t.state.anchor,
                  t.state.pinned,
                );
            });
          }
          static move(t, e) {
            const n = this.documentStates.get(t.ownerDocument);
            n?.state &&
              n.state.owner === t &&
              !n.state.pinned &&
              ((n.state.anchor = e),
              this.position(
                n,
                e,
                n.state.options.placement || "pointer",
                n.state.options.side,
              ));
          }
          static init(t) {
            const e = this.getDocumentState(t);
            return (
              e.initialized ||
                ((e.initialized = !0),
                this.addStyle(
                  t,
                  "\n.__warhelper_custom_tooltip {\n  position: fixed;\n  z-index: 100000;\n  box-sizing: border-box;\n  max-width: calc(100vw - 16px);\n  padding: 7px 9px;\n  border: 1px solid rgba(20, 24, 28, 0.18);\n  border-radius: 4px;\n  background: #fff;\n  color: #222;\n  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.28);\n  pointer-events: none;\n  font-size: 11px;\n  line-height: 14px;\n}\n\nbody.dark-mode .__warhelper_custom_tooltip {\n  border-color: rgba(255, 255, 255, 0.18);\n  background: #20252b;\n  color: #e8edf2;\n}\n\n.__warhelper_custom_tooltip .__warhelper_tooltip {\n  border-collapse: collapse;\n  font-family: monospace;\n}\n\n.__warhelper_custom_tooltip .__warhelper_tooltip_title {\n  margin-bottom: 4px;\n  font-weight: bold;\n  text-align: center;\n}\n\n.__warhelper_custom_tooltip .__warhelper_tooltip_rows {\n  display: grid;\n  gap: 2px;\n}\n\n.__warhelper_custom_tooltip .__warhelper_tooltip_row {\n  display: grid;\n  grid-template-columns: auto auto;\n  column-gap: 8px;\n  color: inherit;\n}\n\n.__warhelper_custom_tooltip .__warhelper_tooltip_row span:last-child {\n  text-align: right;\n  white-space: nowrap;\n}\n\n.__warhelper_custom_tooltip .__warhelper_tooltip td {\n  padding: 2px 0;\n  color: inherit;\n  white-space: nowrap;\n}\n\n.__warhelper_custom_tooltip .__warhelper_tooltip td + td {\n  padding-left: 8px;\n  text-align: right;\n}\n",
                ),
                t.addEventListener(
                  "pointerdown",
                  (t) => this.hideOnOutsidePointer(e, t),
                  !0,
                ),
                t.defaultView?.addEventListener(
                  "scroll",
                  () => this.hideState(e),
                  !0,
                ),
                t.defaultView?.addEventListener("blur", () =>
                  this.hideState(e),
                )),
              e
            );
          }
          static getDocumentState(t) {
            let e = this.documentStates.get(t);
            return (
              e ||
              ((e = { document: t, initialized: !1, node: null, state: null }),
              this.documentStates.set(t, e),
              this.states.push(e),
              e)
            );
          }
          static getNode(t) {
            if (t.node?.isConnected) return t.node;
            const e = t.document.createElement("div");
            return (
              (e.id = W),
              (e.style.display = "none"),
              (t.document.body || t.document.documentElement).appendChild(e),
              (t.node = e),
              e
            );
          }
          static getContent(t) {
            return "function" == typeof t.content ? t.content() : t.content;
          }
          static hideState(t) {
            (t.state && t.state.owner.removeAttribute("aria-describedby"),
              (t.state = null),
              t.node &&
                ((t.node.style.display = "none"), (t.node.textContent = "")));
          }
          static hideOnOutsidePointer(t, e) {
            const n = t.state?.owner,
              s = this.isNode(e.target, t.document) ? e.target : null;
            n && !n.contains(s) && this.hideState(t);
          }
          static position(t, e, n, s = "top") {
            const i = this.getNode(t),
              r = t.document.defaultView || window,
              a = i.offsetWidth || 220,
              o = i.offsetHeight || 100,
              l = Math.max(8, r.innerWidth - a - 8),
              c = Math.max(8, r.innerHeight - o - 8);
            let h, d;
            if ("element" === n || this.isHTMLElement(e)) {
              const n = this.isHTMLElement(e) ? e : t.state?.owner,
                i = n?.getBoundingClientRect();
              if (((h = i ? i.left + i.width / 2 - a / 2 : 8), i)) {
                const t = i.top - o - 8,
                  e = i.bottom + 8;
                ((d = "bottom" === s ? e : t),
                  "bottom" === s && d > c
                    ? (d = t)
                    : "top" === s && d < 8 && (d = e));
              } else d = 8;
            } else
              ((h = e.clientX + 8),
                (d = e.clientY + 8),
                h > l && (h = e.clientX - a - 8),
                d > c && (d = e.clientY - o - 8));
            ((i.style.left = `${Math.max(8, Math.min(h, l))}px`),
              (i.style.top = `${Math.max(8, Math.min(d, c))}px`));
          }
          static isHTMLElement(t) {
            if (!t || "object" != typeof t) return !1;
            const e = t.ownerDocument,
              n = e?.defaultView;
            return n ? t instanceof n.HTMLElement : t instanceof HTMLElement;
          }
          static isNode(t, e) {
            if (!t || "object" != typeof t) return !1;
            const n = e.defaultView;
            return n ? t instanceof n.Node : t instanceof Node;
          }
          static addStyle(t, e) {
            const n = t.createElement("style");
            ((n.type = "text/css"),
              (n.textContent = e),
              (t.head || t.documentElement).appendChild(n));
          }
        },
        V = "fly_access",
        $ = {
          Mexico: 24,
          "Cayman Islands": 33,
          Canada: 39,
          Hawaii: 127,
          "United Kingdom": 151,
          Argentina: 158,
          Switzerland: 166,
          Japan: 213,
          China: 229,
          UAE: 257,
          "South Africa": 282,
        },
        K = {
          1: "Torn",
          2: "Mexico",
          3: "Hawaii",
          4: "South Africa",
          5: "Japan",
          6: "China",
          7: "Argentina",
          8: "Switzerland",
          9: "Canada",
          10: "United Kingdom",
          11: "UAE",
          12: "Cayman Islands",
        },
        z = { standard: 1, airstrip: 0.7, private: 0.5, business: 0.3 },
        Y = {
          airstrip: "Airstrip",
          private: "Private",
          business: "BCT",
          standard: "Standard",
        },
        G = class {
          static {
            this.started = !1;
          }
          static {
            this.status = "unchecked";
          }
          static {
            this.checkedKey = "";
          }
          static {
            this.accessExpiresAt = 0;
          }
          static {
            this.accessCheck = null;
          }
          static {
            this.cache = new Map();
          }
          static {
            this.pending = new Map();
          }
          static {
            this.watchedFactions = new Set();
          }
          static {
            this.userFactions = new Map();
          }
          static {
            this.factionStatuses = new Map();
          }
          static {
            this.factionPending = new Map();
          }
          static {
            this.factionRefreshTimers = new Map();
          }
          static {
            this.dataChangeHandlers = new Set();
          }
          static {
            this.tooltipBindings = new WeakMap();
          }
          static {
            this.hoverCounter = 0;
          }
          static start() {
            this.started ||
              ((this.started = !0),
              x.onChange("torn_key", () => this.reset()),
              S.onBust(() => this.resetAccess()),
              O.on("UserStatusChanged", (t) =>
                this.handleUserStatusChanged(t),
              ));
          }
          static trackUser(t, e) {
            !t ||
              !Number.isFinite(e) ||
              e <= 0 ||
              (this.userFactions.set(t, e),
              this.watchFaction(e),
              "available" === this.factionStatuses.get(e) &&
                !this.cache.has(t) &&
                this.isFlyingStatus(O.getUserStatus(t)) &&
                this.queueFactionRefresh(e));
          }
          static watchFaction(t) {
            if (!Number.isFinite(t) || t <= 0) return;
            const e = this.watchedFactions.has(t);
            (this.watchedFactions.add(t),
              (e && void 0 !== this.factionStatuses.get(t)) ||
                this.fetchFactionData(t, !0).catch(console.error));
          }
          static bindStatusNode(t, e, n = 0) {
            (t && Number.isFinite(n) && n > 0 && this.trackUser(t, n),
              t &&
                "true" !== e.dataset.warhelperFlyBound &&
                ((e.dataset.warhelperFlyBound = "true"),
                e.removeAttribute("title"),
                e.removeAttribute("data-original-title"),
                this.tooltipBindings.set(
                  e,
                  j.bind(e, this.getTooltipOptions(t)),
                ),
                e.addEventListener("pointerenter", (n) => {
                  "touch" !== n.pointerType && this.handleHover(t, e);
                }),
                e.addEventListener("pointerdown", (n) => {
                  "touch" === n.pointerType && this.handleHover(t, e);
                }),
                e.addEventListener("pointerleave", (t) => {
                  "touch" !== t.pointerType && this.clearHover(e);
                }),
                e.addEventListener("focus", () => this.handleHover(t, e)),
                e.addEventListener("blur", () => this.clearHover(e))));
          }
          static onDataChange(t) {
            return (
              this.dataChangeHandlers.add(t),
              () => {
                this.dataChangeHandlers.delete(t);
              }
            );
          }
          static getRemainingFlightSeconds(t) {
            return this.getFlightCountdown(t)?.seconds || null;
          }
          static getFlightArrivalTimestamp(t) {
            const e = this.getFlightArrival(t);
            return e ? Math.ceil(e.timestamp / 1e3) : null;
          }
          static getFlightArrivalPhase(t) {
            return this.getFlightArrival(t)?.phase || null;
          }
          static getFlightCountdown(t) {
            const e = this.getFlightArrival(t);
            return e
              ? {
                  seconds: Math.ceil((e.timestamp - r()) / 1e3),
                  phase: e.phase,
                }
              : null;
          }
          static hasExpiredFlightArrival(t) {
            const e = O.getUserStatus(t);
            if (!e || "Traveling" !== e.status || 1 === e.area) return !1;
            const n = this.cache.get(t)?.flight || null;
            if (!n || !this.flightMatchesUserStatus(e, n)) return !1;
            const s = this.getLandingWindows(n);
            return !!s.length && r() >= Math.max(...s.map((t) => t.latest));
          }
          static hasFlightLookup(t) {
            return this.cache.has(t);
          }
          static isFlightLookupStale(t, e = 3e4) {
            const n = this.cache.get(t);
            return !n || Date.now() - n.fetchedAt >= e;
          }
          static getFlightLandingDisplay(t) {
            return this.createFlightLandingDisplay(
              t,
              this.cache.get(t)?.flight || null,
            );
          }
          static async ensureFlightLandingDisplay(t) {
            return this.createFlightLandingDisplay(t, await this.getFlight(t));
          }
          static async refreshFlightLandingDisplay(t) {
            return this.createFlightLandingDisplay(
              t,
              await this.getFlight(t, !0),
            );
          }
          static getFlightArrival(t) {
            const e = O.getUserStatus(t);
            if (!e || "Traveling" !== e.status) return null;
            const n = this.cache.get(t)?.flight || null;
            if (!n || !this.flightMatchesUserStatus(e, n)) return null;
            const s = this.getLandingWindows(n);
            if (!s.length) return null;
            const i = r();
            for (const t of s) {
              if (i < t.earliest)
                return { timestamp: t.earliest, phase: "expected" };
              if (i < t.latest)
                return { timestamp: t.latest, phase: "possible" };
            }
            return null;
          }
          static createFlightLandingDisplay(t, e) {
            const n = O.getUserStatus(t);
            if (
              !n ||
              "Traveling" !== n.status ||
              !e ||
              !this.flightMatchesUserStatus(n, e)
            )
              return null;
            const s = String(e.country || "");
            if (!s || !$[s] || this.isStale(e)) return null;
            const i = this.getLandingWindows(e).map((t) => ({
              label: Y[t.type],
              range: this.formatLandingRange(e, t.type),
              earliest: t.earliest,
              latest: t.latest,
            }));
            if (!i.length) return null;
            const r = this.getFlightArrival(t),
              a = String(e.direction || "");
            return {
              route: this.formatRouteLabel(e),
              country: s,
              destinationCountry: "from" === a ? "Torn" : s,
              ranges: i,
              nextTimestampSeconds: r ? Math.ceil(r.timestamp / 1e3) : null,
              phase: r?.phase || null,
              tooltip: this.getTooltip(e),
            };
          }
          static reset() {
            ((this.status = "unchecked"),
              (this.checkedKey = ""),
              (this.accessExpiresAt = 0),
              (this.accessCheck = null),
              this.cache.clear(),
              this.pending.clear(),
              this.factionStatuses.clear(),
              this.factionPending.clear(),
              this.factionRefreshTimers.forEach((t) => window.clearTimeout(t)),
              this.factionRefreshTimers.clear(),
              this.watchedFactions.forEach((t) =>
                this.fetchFactionData(t, !0).catch(console.error),
              ));
          }
          static getKey() {
            return String(x.get("torn_key") || "").trim();
          }
          static resetAccess() {
            ((this.status = "unchecked"),
              (this.checkedKey = ""),
              (this.accessExpiresAt = 0),
              (this.accessCheck = null));
          }
          static getCachedAccess(t) {
            const e = S.get(V);
            return !e ||
              e.key !== t ||
              !this.isAccessCacheStatus(e.status) ||
              !Number.isFinite(e.expiresAt) ||
              e.expiresAt <= Date.now()
              ? null
              : ((this.checkedKey = t),
                (this.accessExpiresAt = e.expiresAt),
                (this.status = e.status),
                e.status);
          }
          static setAccessStatus(t, e) {
            const n = Date.now() + 864e5;
            ((this.checkedKey = t),
              (this.accessExpiresAt = n),
              (this.status = e),
              S.set(V, { key: t, status: e, expiresAt: n }, 86400));
          }
          static async checkAccess() {
            const t = this.getKey();
            if (!t)
              return ((this.status = "disabled"), (this.checkedKey = ""), !1);
            if (
              this.checkedKey === t &&
              "available" === this.status &&
              this.accessExpiresAt > Date.now()
            )
              return !0;
            if (
              this.checkedKey === t &&
              "disabled" === this.status &&
              this.accessExpiresAt > Date.now()
            )
              return !1;
            const e = this.getCachedAccess(t);
            return e
              ? "available" === e
              : (this.accessCheck ||
                  ((this.status = "checking"),
                  (this.checkedKey = t),
                  (this.accessCheck = this.request(0)
                    .then((e) => {
                      const n =
                        e.status >= 200 &&
                        e.status < 300 &&
                        !this.isErrorResponse(e.json);
                      return (
                        this.setAccessStatus(t, n ? "available" : "disabled"),
                        n
                      );
                    })
                    .catch(
                      () => (
                        (this.status = "unchecked"),
                        (this.checkedKey = ""),
                        !1
                      ),
                    )
                    .finally(() => {
                      this.accessCheck = null;
                    }))),
                this.accessCheck);
          }
          static async getFlight(t, e = !1) {
            if (!Number.isFinite(t) || t <= 0) return null;
            const n = this.userFactions.get(t);
            if (n)
              return (
                ((await (e
                  ? this.fetchFactionData(n, !0)
                  : this.ensureFactionData(n))) &&
                  this.cache.get(t)?.flight) ||
                null
              );
            if (!(await this.checkAccess())) return null;
            if (!e) {
              const e = this.getCachedFlight(t);
              if (void 0 !== e) return e.flight;
            }
            const s = this.pending.get(t);
            if (s) return s;
            this.status = "checking";
            const i = this.getKey();
            if (!i) return ((this.status = "disabled"), null);
            const r = this.request(t)
              .then((e) => {
                if (
                  e.status < 200 ||
                  e.status >= 300 ||
                  this.isErrorResponse(e.json)
                )
                  return (this.setAccessStatus(i, "disabled"), null);
                const n = this.parseFlight(e.json);
                return (
                  (this.checkedKey = i),
                  (this.status = "available"),
                  this.cache.set(t, { fetchedAt: Date.now(), flight: n }),
                  this.notifyDataChange(),
                  n
                );
              })
              .catch(() => ((this.status = "unchecked"), null))
              .finally(() => {
                this.pending.delete(t);
              });
            return (this.pending.set(t, r), r);
          }
          static async ensureFactionData(t) {
            const e = this.factionStatuses.get(t);
            return (
              "available" === e ||
              ("disabled" !== e && this.fetchFactionData(t, !1))
            );
          }
          static fetchFactionData(t, e) {
            if (!Number.isFinite(t) || t <= 0) return Promise.resolve(!1);
            if (!this.getKey())
              return (
                (this.status = "disabled"),
                this.factionStatuses.set(t, "disabled"),
                Promise.resolve(!1)
              );
            if (!e) {
              const e = this.factionStatuses.get(t);
              if ("available" === e) return Promise.resolve(!0);
              if ("disabled" === e) return Promise.resolve(!1);
            }
            const n = this.factionPending.get(t);
            if (n) return n;
            this.factionStatuses.set(t, "checking");
            const s = this.requestPath(`/fly/faction/${t}`)
              .then((e) => {
                if (403 === e.status)
                  return (this.factionStatuses.set(t, "disabled"), !1);
                if (
                  e.status < 200 ||
                  e.status >= 300 ||
                  this.isErrorResponse(e.json)
                )
                  return (
                    400 === e.status || 401 === e.status
                      ? this.factionStatuses.set(t, "disabled")
                      : this.factionStatuses.set(t, "unchecked"),
                    !1
                  );
                const n = this.parseFactionFlights(e.json);
                return n
                  ? (this.applyFactionFlights(t, n),
                    this.factionStatuses.set(t, "available"),
                    (this.status = "available"),
                    this.factionFlightsMatchStatuses(t) ||
                      this.queueFactionRefresh(t),
                    !0)
                  : (this.factionStatuses.set(t, "unchecked"), !1);
              })
              .catch(() => (this.factionStatuses.set(t, "unchecked"), !1))
              .finally(() => {
                this.factionPending.delete(t);
              });
            return (this.factionPending.set(t, s), s);
          }
          static applyFactionFlights(t, e) {
            const n = Date.now(),
              s = new Map();
            (e.forEach((e) => {
              const i = Number(e.player_tid);
              !Number.isFinite(i) ||
                i <= 0 ||
                (s.set(i, e),
                this.userFactions.set(i, t),
                this.cache.set(i, { fetchedAt: n, flight: e }));
            }),
              this.userFactions.forEach((e, i) => {
                e === t &&
                  this.cache.set(i, { fetchedAt: n, flight: s.get(i) || null });
              }),
              this.notifyDataChange());
          }
          static notifyDataChange() {
            (j.refresh(), this.dataChangeHandlers.forEach((t) => t()));
          }
          static queueFactionRefresh(t) {
            if (
              "disabled" === this.factionStatuses.get(t) ||
              this.factionRefreshTimers.has(t)
            )
              return;
            const e = window.setTimeout(() => {
              (this.factionRefreshTimers.delete(t),
                this.fetchFactionData(t, !0).catch(console.error));
            }, 12e4);
            this.factionRefreshTimers.set(t, e);
          }
          static handleUserStatusChanged(t) {
            const e = t.detail?.statusUserIds || [],
              n = new Set();
            (e.forEach((t) => {
              const e = this.userFactions.get(Number(t));
              if (!e) return;
              const s = O.getUserStatus(Number(t)),
                i = this.cache.get(Number(t))?.flight || null;
              (this.isFlyingStatus(s) || i) && n.add(e);
            }),
              n.forEach((t) => this.queueFactionRefresh(t)));
          }
          static getCachedFlight(t) {
            const e = this.cache.get(t);
            if (e && Date.now() - e.fetchedAt < 3e4) return e;
          }
          static request(t) {
            return this.requestPath(`/fly/${t}`);
          }
          static requestPath(e) {
            const s = this.getKey(),
              i = `https://torn.seintz.com/api/${encodeURIComponent(s)}${e}`;
            return t
              .request({ url: i, timeout: 1e4 })
              .then((t) => ({ status: t.status, json: n(t.responseText) }));
          }
          static async handleHover(t, e) {
            const n = O.getUserStatus(t);
            if (
              !n ||
              "Traveling" !== n.status ||
              this.hasExpiredFlightArrival(t)
            )
              return (this.clearHover(e), void this.refreshTooltip(t, e));
            const s = this.userFactions.get(t);
            if (s && "disabled" === this.factionStatuses.get(s))
              return (this.clearHover(e), void this.refreshTooltip(t, e));
            const i = String(++this.hoverCounter);
            ((e.dataset.warhelperFlyHover = i), this.refreshTooltip(t, e));
            const r = await this.getFlight(t);
            if (e.isConnected && e.dataset.warhelperFlyHover === i) {
              if (this.hasExpiredFlightArrival(t))
                return (
                  this.clearHover(e),
                  this.refreshTooltip(t, e),
                  void this.notifyDataChange()
                );
              (r || this.cache.set(t, { fetchedAt: Date.now(), flight: null }),
                this.refreshTooltip(t, e));
            }
          }
          static clearHover(t) {
            (delete t.dataset.warhelperFlyHover,
              t.removeAttribute("title"),
              t.removeAttribute("aria-label"),
              t.removeAttribute("data-original-title"));
          }
          static refreshTooltip(t, e) {
            const n = this.getTooltipOptions(t);
            let s = this.tooltipBindings.get(e);
            (s || ((s = j.bind(e, n)), this.tooltipBindings.set(e, s)),
              s.update(n),
              e.removeAttribute("title"),
              e.removeAttribute("data-original-title"));
            const i = this.getStatusTooltipContent(t);
            i
              ? e.setAttribute("aria-label", this.stripHtml(i))
              : e.removeAttribute("aria-label");
          }
          static getTooltipOptions(t) {
            return {
              content: () => this.getStatusTooltipContent(t),
              html: !0,
              placement: "element",
              className: "__warhelper_fly_custom_tooltip",
            };
          }
          static getStatusTooltipContent(t) {
            const e = O.getUserStatus(t);
            if (
              !e ||
              "Traveling" !== e.status ||
              this.hasExpiredFlightArrival(t)
            )
              return "";
            const n = this.userFactions.get(t);
            if (n && "disabled" === this.factionStatuses.get(n)) return "";
            const s = n ? this.cache.get(t) : this.getCachedFlight(t);
            return void 0 !== s
              ? this.getTooltip(s.flight)
              : "Loading flight estimate...";
          }
          static getTooltip(t) {
            if (!t) return "No flight estimate found";
            const e = String(t.country || "");
            if (!e || !$[e] || this.isStale(t))
              return "No flight estimate found";
            const n = this.getFlightTypes(t)
              .map(
                (e) =>
                  `\n        <div class="__warhelper_tooltip_row __warhelper_fly_time_row">\n          <span>${this.escapeHtml(Y[e])}</span>\n          <span>${this.escapeHtml(this.formatLandingRange(t, e))}</span>\n        </div>\n      `,
              )
              .join("");
            return n
              ? `\n      <div class="__warhelper_tooltip __warhelper_fly_tooltip">\n        <div class="__warhelper_tooltip_title __warhelper_fly_title">${this.escapeHtml(this.formatRouteLabel(t))}</div>\n        <div class="__warhelper_tooltip_rows __warhelper_fly_times">${n}</div>\n      </div>\n    `
              : "No flight estimate found";
          }
          static getFlightTypes(t) {
            switch (t.planetype) {
              case "airliner":
                return ["business", "standard"];
              case "light_aircraft":
                return ["airstrip"];
              case "private_jet":
                return ["private"];
              default:
                return ["airstrip", "private", "business", "standard"];
            }
          }
          static formatLandingRange(t, e) {
            return `${this.formatLandingTime(t, e, !1)} - ${this.formatLandingTime(t, e, !0)}`;
          }
          static getLandingWindows(t) {
            return this.getFlightTypes(t)
              .map((e) => ({
                type: e,
                earliest: this.getLandingTimeMs(t, e, !1),
                latest: this.getLandingTimeMs(t, e, !0),
              }))
              .filter((t) => t.earliest > 0 && t.latest > 0)
              .sort((t, e) => t.earliest - e.earliest);
          }
          static formatLandingTime(t, e, n) {
            const s = this.getLandingTimeMs(t, e, n);
            return s ? `${this.formatTct(new Date(s))} TCT` : "N/A";
          }
          static getLandingTimeMs(t, e, n) {
            const s = String(t.country || ""),
              i = $[s],
              r = this.getTimestampMs(t);
            if (!i || !r) return 0;
            const a = Number(t.variance || 0);
            return (
              r +
              (6e4 * Math.round(Math.round(i * z[e]) * (n ? 1.03 : 0.97)) +
                (n && Number.isFinite(a) ? 1e3 * a : 0))
            );
          }
          static formatTct(t) {
            return [t.getUTCHours(), t.getUTCMinutes(), t.getUTCSeconds()]
              .map((t) => String(t).padStart(2, "0"))
              .join(":");
          }
          static formatRouteLabel(t) {
            const e = String(t.country || ""),
              n = String(t.direction || "");
            return "from" === n
              ? "Flying to Torn"
              : "in" === n
                ? `Landed in ${e}`
                : `Flying to ${e}`;
          }
          static getTimestampMs(t) {
            const e =
              t.timestamp instanceof Date
                ? t.timestamp.getTime()
                : new Date(t.timestamp || 0).getTime();
            return Number.isFinite(e) ? e : 0;
          }
          static isStale(t) {
            const e = this.getTimestampMs(t);
            return !e || e < Date.now() - 864e5;
          }
          static parseFactionFlights(t) {
            const e = Array.isArray(t)
              ? t
              : t && "object" == typeof t && Array.isArray(t.flyers)
                ? t.flyers
                : null;
            return e
              ? e.map((t) => this.parseFlight(t)).filter((t) => null !== t)
              : null;
          }
          static factionFlightsMatchStatuses(t) {
            let e = !0;
            return (
              this.userFactions.forEach((n, s) => {
                if (n !== t) return;
                const i = O.getUserStatus(s),
                  r = this.cache.get(s)?.flight || null;
                this.flightMatchesUserStatus(i, r) || (e = !1);
              }),
              e
            );
          }
          static flightMatchesUserStatus(t, e) {
            if (!t) return !0;
            const n = String(e?.country || ""),
              s = String(e?.direction || "");
            if (!this.isFlyingStatus(t))
              return !n || ("Torn" === n && "in" === s);
            if (!n) return !1;
            if (e && this.isStale(e)) return !1;
            const i = K[t.area];
            return "Traveling" === t.status
              ? ("to" === s || "from" === s) && (1 === t.area || !i || n === i)
              : (!i || n === i) && ("in" === s || "to" === s);
          }
          static isFlyingStatus(t) {
            return Boolean(
              t &&
              ("Traveling" === t.status ||
                "Abroad" === t.status ||
                ("Hospital" === t.status && 1 !== t.area)),
            );
          }
          static parseFlight(t) {
            return !t || "object" != typeof t || Array.isArray(t) ? null : t;
          }
          static isErrorResponse(t) {
            return Boolean(t && "object" == typeof t && "error" in t);
          }
          static isAccessCacheStatus(t) {
            return "available" === t || "disabled" === t;
          }
          static escapeHtml(t) {
            return t.replace(/[&<>"']/g, (t) => {
              switch (t) {
                case "&":
                  return "&amp;";
                case "<":
                  return "&lt;";
                case ">":
                  return "&gt;";
                case '"':
                  return "&quot;";
                case "'":
                  return "&#39;";
                default:
                  return t;
              }
            });
          }
          static stripHtml(t) {
            return t
              .replace(/<[^>]+>/g, " ")
              .replace(/\s+/g, " ")
              .trim();
          }
        },
        Q = class {
          static {
            ((this.key = x.get("tornstats_key")),
              x.onChange("tornstats_key", (t, e) => {
                this.key = e;
              }));
          }
          static async getSpies(t, e) {
            return (
              await this.loadFactionSpies(e),
              t.map((t) => S.get(`tornstats_user_${t}`))
            );
          }
          static {
            this.pendingRequests = new Map();
          }
          static loadFactionSpies(e) {
            const s = `tornstats_faction_${e}`;
            if (S.get(s)) return Promise.resolve();
            const i = this.pendingRequests.get(s);
            if (i) return i;
            if (!this.key) return Promise.resolve();
            const r = new Promise((i, r) => {
              t.request(
                `https://www.tornstats.com/api/v2/${this.key}/spy/faction/${e}`,
              )
                .then(async (t) => {
                  const e = n(t),
                    a = e?.faction?.members;
                  if (!a) return void r(new Error("No members data found"));
                  const o = [s],
                    l = [1];
                  (Object.keys(a).forEach((t) => {
                    const e = a[t]?.spy;
                    e &&
                      (Date.now() / 1e3 - e.timestamp >= S.days(365) ||
                        (o.push(`tornstats_user_${t}`),
                        l.push({
                          type: 1,
                          userId: parseInt(t),
                          strength: e.strength ? parseInt(e.strength) : void 0,
                          speed: e.speed ? parseInt(e.speed) : void 0,
                          defense: e.defense ? parseInt(e.defense) : void 0,
                          dexterity: e.dexterity
                            ? parseInt(e.dexterity)
                            : void 0,
                          total: e.total ? parseInt(e.total) : void 0,
                          score:
                            Math.sqrt(parseInt(e.strength)) +
                            Math.sqrt(parseInt(e.defense)) +
                            Math.sqrt(parseInt(e.speed)) +
                            Math.sqrt(parseInt(e.dexterity)),
                          timestamp: e.timestamp,
                        })));
                  }),
                    S.set(o, l, S.days(7)),
                    i());
                })
                .catch((t) => {
                  r(t);
                })
                .finally(() => {
                  this.pendingRequests.delete(s);
                });
            });
            return (this.pendingRequests.set(s, r), r);
          }
        },
        Z = class {
          static {
            this.lastRequest = 0;
          }
          static {
            this.scriptName = "finally_Script";
          }
          static {
            this.expires = null;
          }
          static {
            this.expiredSubscriptionKey = null;
          }
          static {
            (document.addEventListener("DOMContentLoaded", () => {
              x.get("hide_bsp") &&
                localStorage.setItem(
                  "tdup.battleStatsPredictor.IsBSPEnabledOnPage_Faction",
                  "false",
                );
            }),
              x.onChange("hide_bsp", (t, e) => {
                localStorage.setItem(
                  "tdup.battleStatsPredictor.IsBSPEnabledOnPage_Faction",
                  "true" == e ? "false" : "true",
                );
              }),
              (this.key = x.get("bsp_key") || ""),
              x.onChange("bsp_key", (t, e) => {
                ((this.key = e),
                  (this.expires = null),
                  (this.expiredSubscriptionKey = null),
                  this.pendingRequests.clear());
              }));
          }
          static {
            this.pendingRequests = new Map();
          }
          static isSubscriptionExpired() {
            return (
              this.expiredSubscriptionKey === this.key ||
              (!!(this.expires && this.expires < new Date()) &&
                ((this.expiredSubscriptionKey = this.key), !0))
            );
          }
          static updateSubscriptionEnd(t) {
            if ("string" != typeof t || !t) return !1;
            const e = t.endsWith("Z") ? t : `${t}Z`,
              n = new Date(e);
            return (
              !Number.isNaN(n.getTime()) &&
              ((this.expires = n),
              n < new Date() && ((this.expiredSubscriptionKey = this.key), !0))
            );
          }
          static async getSpy(e) {
            const s = `bsp_user_${e}`,
              i = S.get(s);
            if (i) return i;
            if (!this.key) return Promise.resolve(void 0);
            if (this.isSubscriptionExpired()) return Promise.resolve(void 0);
            const r = Math.max(600 - (Date.now() - this.lastRequest), 0);
            if (
              (await (async function (t) {
                return new Promise((e) => setTimeout(e, t));
              })(r),
              this.isSubscriptionExpired())
            )
              return Promise.resolve(void 0);
            this.lastRequest = Date.now();
            const a = this.pendingRequests.get(s);
            if (a) return a;
            const o = new Promise((i, r) => {
              t.request(
                `http://www.lol-manager.com/api/battlestats/${this.key}/${e}/${this.scriptName}`,
              )
                .then(async (t) => {
                  const a = n(t);
                  if (this.updateSubscriptionEnd(a?.SubscriptionEnd))
                    return void i(void 0);
                  if (!a?.TBS) return void r(new Error("No TBS found"));
                  const o = {
                    type: 2,
                    userId: e,
                    score: a.Score,
                    total: a.TBS,
                    timestamp: new Date(`${a.PredictionDate}Z`).getTime() / 1e3,
                  };
                  (S.set(s, o, S.days(7)), i(o));
                })
                .catch((t) => {
                  r(t);
                })
                .finally(() => {
                  this.pendingRequests.delete(s);
                });
            });
            return (this.pendingRequests.set(s, o), o);
          }
        },
        J = class {
          static {
            ((this.key = x.get("yata_key")),
              x.onChange("yata_key", (t, e) => {
                this.key = e;
              }));
          }
          static {
            this.pendingRequests = new Map();
          }
          static async getSpy(e, s = !1) {
            const i = `yata_${s ? "estimate" : "spy"}_${e}`,
              r = S.get(i);
            if (r) return -1 == r ? void 0 : r;
            if (!this.key) return Promise.resolve(void 0);
            const a = this.pendingRequests.get(i);
            if (a) return a;
            const o = new Promise((r, a) => {
              t.request(
                `https://yata.yt/api/v1/${s ? "bs" : "spy"}/${e}/?key=${this.key}`,
              )
                .then(async (t) => {
                  const a = n(t),
                    o = a?.[e];
                  if (!o?.total)
                    return (S.set(i, -1, S.days(7)), void r(void 0));
                  if (!s && Date.now() / 1e3 - o.update >= S.days(365)) return;
                  const l = s
                    ? {
                        type: 4,
                        userId: e,
                        score: o?.score,
                        total: o?.total,
                        timestamp: o?.timestamp,
                        skewtype: o?.type,
                        skewness: o?.skewness,
                      }
                    : {
                        type: 3,
                        userId: e,
                        strength: o?.strength,
                        speed: o?.speed,
                        defense: o?.defense,
                        dexterity: o?.dexterity,
                        total: o?.total,
                        score:
                          Math.sqrt(parseInt(o?.strength)) +
                          Math.sqrt(parseInt(o?.defense)) +
                          Math.sqrt(parseInt(o?.speed)) +
                          Math.sqrt(parseInt(o?.dexterity)),
                        timestamp: o?.update,
                      };
                  (S.set(i, l, S.days(7)), r(l));
                })
                .catch((t) => {
                  a(t);
                })
                .finally(() => {
                  this.pendingRequests.delete(i);
                });
            });
            return (this.pendingRequests.set(i, o), o);
          }
        },
        X = class {
          static {
            ((this.key = x.get("ffs_key")),
              x.onChange("ffs_key", (t, e) => {
                this.key = e;
              }));
          }
          static async getSpies(t, e) {
            return (
              await this.loadFactionSpies(t, e),
              t.map((t) => S.get(`ffs_user_${t}`))
            );
          }
          static {
            this.pendingRequests = new Map();
          }
          static loadFactionSpies(e, s) {
            const i = `ffs_faction_${s}`,
              r = S.get(i);
            if (r) return r;
            const a = this.key || x.get("ffs_key");
            if (!a) return Promise.resolve(void 0);
            const o = this.pendingRequests.get(i);
            if (o) return o;
            const l = new Promise((s, r) => {
              t.request(
                `https://ffscouter.com/api/v1/get-stats?key=${encodeURIComponent(a)}&targets=${e.join(",")}`,
              )
                .then(async (t) => {
                  const e = n(t);
                  if (e.error) return void r(new Error(e.error));
                  if (!Array.isArray(e))
                    return void r(new Error("No spies found"));
                  const a = [i],
                    o = [1];
                  (e.forEach((t) => {
                    t?.bs_estimate &&
                      (a.push(`ffs_user_${t.player_id}`),
                      o.push({
                        type: 5,
                        userId: t.player_id,
                        total: t.bs_estimate,
                        fairfight: t.fair_fight,
                        timestamp: t.last_updated,
                      }));
                  }),
                    S.set(a, o, S.days(7)),
                    s());
                })
                .catch((t) => {
                  r(t);
                })
                .finally(() => {
                  this.pendingRequests.delete(i);
                });
            });
            return (this.pendingRequests.set(i, l), l);
          }
        },
        tt = [1, 3, 2, 5, 4],
        et = [1, 2, 3, 4, 5],
        nt = S.days(30);
      function st(t) {
        const e = rt(it(t), t);
        return 0 !== e.type ? e : lt(t);
      }
      function it(t) {
        return at(Array.from(dt(t).values()));
      }
      function rt(t, e) {
        return at(t)[0] || lt(e);
      }
      function at(t) {
        const e = new Map();
        return (
          t.forEach((t) => {
            ct(t) && e.set(t.type, t);
          }),
          ot()
            .map((t) => e.get(t))
            .filter((t) => void 0 !== t)
        );
      }
      function ot() {
        const t = x.get("spy_source_order");
        return "string" == typeof t && t.trim()
          ? (function (t) {
              const e = new Set(),
                n = [];
              return (
                t.forEach((t) => {
                  null === t || 0 === t || e.has(t) || (e.add(t), n.push(t));
                }),
                tt.forEach((t) => {
                  e.has(t) || (e.add(t), n.push(t));
                }),
                n
              );
            })(
              t.split(/[\s>,;\n]+/).map((t) =>
                (function (t) {
                  switch (
                    t
                      .trim()
                      .toLowerCase()
                      .replace(/[\s_-]/g, "")
                  ) {
                    case "1":
                    case "t":
                    case "ts":
                    case "tornstats":
                      return 1;
                    case "2":
                    case "b":
                    case "bsp":
                      return 2;
                    case "3":
                    case "y":
                    case "yata":
                    case "yataspy":
                      return 3;
                    case "4":
                    case "ye":
                    case "yatae":
                    case "yataestimate":
                    case "estimate":
                      return 4;
                    case "5":
                    case "f":
                    case "ffs":
                    case "ffscouter":
                      return 5;
                    default:
                      return null;
                  }
                })(t),
              ),
            )
          : [...tt];
      }
      function lt(t) {
        return { type: 0, userId: t, timestamp: 0 };
      }
      function ct(t) {
        return (
          (function (t) {
            if (!t || "object" != typeof t) return !1;
            const e = t;
            return (
              "number" == typeof e.type &&
              "number" == typeof e.userId &&
              "number" == typeof e.timestamp
            );
          })(t) &&
          0 !== t.type &&
          et.includes(t.type) &&
          Number.isFinite(t.userId) &&
          t.userId > 0
        );
      }
      function ht(t) {
        return `spy_user_${t}`;
      }
      function dt(t) {
        const e = new Map(),
          n = S.get(ht(t));
        if (
          n &&
          "object" == typeof n &&
          "number" == typeof (s = n).updatedAt &&
          Number.isFinite(s.updatedAt) &&
          s.updatedAt &&
          Math.max(0, Math.floor(Date.now() / 1e3) - s.updatedAt) <= nt
        ) {
          const s = n.sources;
          s &&
            "object" == typeof s &&
            Object.values(s).forEach((n) => {
              ct(n) && n.userId === t && e.set(n.type, n);
            });
        }
        var s;
        return (
          (function (t) {
            return [
              `tornstats_user_${t}`,
              `yata_spy_${t}`,
              `bsp_user_${t}`,
              `ffs_user_${t}`,
              `yata_estimate_${t}`,
            ];
          })(t).forEach((n) => {
            const s = S.get(n);
            ct(s) && s.userId === t && e.set(s.type, s);
          }),
          e
        );
      }
      function ut(t) {
        const e = [];
        return (
          t.forEach((t) => {
            t &&
              (!(function (t) {
                if (!ct(t)) return;
                const e = dt(t.userId);
                e.set(t.type, t);
                const n = {};
                (e.forEach((t, e) => {
                  n[
                    (function (t) {
                      switch (t) {
                        case 1:
                          return "ts";
                        case 2:
                          return "bsp";
                        case 3:
                          return "yata";
                        case 4:
                          return "yata_estimate";
                        case 5:
                          return "ffs";
                        default:
                          return "none";
                      }
                    })(e)
                  ] = t;
                }),
                  S.set(ht(t.userId), {
                    version: 1,
                    userId: t.userId,
                    sources: n,
                    updatedAt: Math.floor(Date.now() / 1e3),
                  }));
              })(t),
              e.push(t));
          }),
          e
        );
      }
      function pt(t, e, n = {}) {
        const s = t.reduce((t, e) => ((t[e] = st(e)), t), {});
        let i = !1,
          r = () => {};
        const a = new Promise((t) => {
          r = t;
        });
        function o(t) {
          const e = it(t),
            i = rt(e, t);
          ((s[t] = i), n.onUpdate?.({ userId: t, spies: e, selected: i }));
        }
        function l(t) {
          ut(t).forEach((t) => o(t.userId));
        }
        function c() {
          return Object.values(s).every((t) => 0 !== t.type);
        }
        const h = new Map([
          [
            1,
            async function (t) {
              const n = await Q.getSpies(t, e).catch(console.error);
              n && l(n);
            },
          ],
          [
            2,
            async function (t) {
              for (const e of t) {
                l([
                  await Z.getSpy(e).catch((t) => {
                    console.error(t);
                  }),
                ]);
              }
            },
          ],
          [
            3,
            async function (t) {
              for (const e of t) {
                l([
                  await J.getSpy(e).catch((t) => {
                    console.error(t);
                  }),
                ]);
              }
            },
          ],
          [
            4,
            async function (t) {
              for (const e of t) {
                l([
                  await J.getSpy(e, !0).catch((t) => {
                    console.error(t);
                  }),
                ]);
              }
            },
          ],
          [
            5,
            async function (t) {
              const n = await X.getSpies(t, e).catch(console.error);
              n && l(n);
            },
          ],
        ]);
        return (
          t.forEach((t) => {
            it(t).length && o(t);
          }),
          c() && ((i = !0), r({ ...s })),
          (async () => {
            for (const e of ot()) {
              const n = h.get(e);
              n && (await n(t), !i && c() && ((i = !0), r({ ...s })));
            }
            i || ((i = !0), r({ ...s }));
          })(),
          a
        );
      }
      var gt = {
          icon: "\u23f1",
          text: "Loading",
          tooltip: "",
          ariaLabel: "Loading",
        },
        ft = { icon: "\u2713", text: "Okay", tooltip: "", ariaLabel: "Okay" },
        mt = "__warhelperAttackPage",
        _t = "__warhelper_attack_page_style",
        wt = {
          1: "Torn",
          2: "MX",
          3: "HI",
          4: "ZA",
          5: "JP",
          6: "CN",
          7: "AR",
          8: "CH",
          9: "CA",
          10: "UK",
          11: "UAE",
          12: "KY",
        },
        bt = class t {
          constructor(t, e) {
            ((this.pageWindow = t),
              (this.pageDocument = e),
              (this.ownFactionId = 0),
              (this.enemyUserId = 0),
              (this.enemyUserName = ""),
              (this.timerLinkNode = null),
              (this.timerIconNode = null),
              (this.timerFlagNode = null),
              (this.timerTextNode = null),
              (this.hospitalRequestUserId = 0),
              (this.hospitalRequestStartedAt = 0),
              (this.hospitalRequest = null),
              (this.flightRequestUserId = 0),
              (this.flightRequestStartedAt = 0),
              (this.flightRequestAttempts = 0),
              (this.flightRequest = null),
              (this.cleanupHandlers = []),
              (this.stopped = !1));
          }
          static {
            this.currentPage = null;
          }
          static {
            this.attachCurrentWindow();
          }
          static attachIframe(e) {
            const n = e;
            (n[mt]?.destroy(), delete n[mt]);
            const s = e.contentWindow,
              i = e.contentDocument;
            if (!s || !i || !this.isAttackUrl(s.location.href)) return null;
            const r = new t(s, i);
            return ((n[mt] = r), r.start(), r);
          }
          destroy() {
            this.stopped ||
              ((this.stopped = !0),
              this.cleanupHandlers.splice(0).forEach((t) => {
                try {
                  t();
                } catch (t) {
                  console.error(t);
                }
              }),
              this.timerLinkNode && j.hide(this.timerLinkNode));
          }
          static attachCurrentWindow() {
            this.isAttackUrl(window.location.href) &&
              (this.currentPage?.destroy(),
              (this.currentPage = new t(e, document)),
              this.currentPage.start());
          }
          static isAttackUrl(t) {
            return (
              -1 !== t.indexOf("sid=attack") ||
              -1 !== t.indexOf("sid=getInAttack")
            );
          }
          start() {
            (this.addStyles(),
              (this.enemyUserId = +(
                new URL(
                  this.pageWindow.location.href,
                  this.pageWindow.location.origin,
                ).searchParams.get("user2ID") || 0
              )),
              E.load(this.enemyUserId, !0),
              G.start(),
              this.cleanupHandlers.push(
                G.onDataChange(() => this.updateTimers()),
              ),
              O.on("UserStatusChanged", (t) => {
                this.stopped || this.handleStatusChanged(t);
              }),
              this.observeAttackDataRequests(),
              this.onAdd(
                "[class*='topSection'] [class*='linksContainer__'] a",
                (t) => this.inject(t),
                !0,
              ),
              this.onAdd(
                "[class*='topSection'] [class*='labelsContainer__'] div",
                (t) => this.inject(t),
                !0,
              ));
            const t = window.setInterval(() => this.updateTimers(), 1e3);
            this.cleanupHandlers.push(() => window.clearInterval(t));
          }
          inject(t) {
            const e = t.parentNode;
            if (!e) return;
            if (this.timerTextNode) return;
            const n = t.cloneNode(!0);
            ((this.timerLinkNode = n),
              (this.timerIconNode = n.childNodes[0]),
              (this.timerTextNode = n.childNodes[1]),
              (this.timerIconNode.textContent = gt.icon),
              (this.timerTextNode.textContent = gt.text),
              (this.timerLinkNode.href = "#"),
              this.timerLinkNode.classList.add("__warhelper_attack_link"));
            const s = this.pageDocument.createElement("span");
            ((s.className = "__warhelper_attack_timer_flag"),
              (s.style.display = "none"),
              n.insertBefore(s, this.timerTextNode),
              (this.timerFlagNode = s),
              n.addEventListener("click", (t) => t.preventDefault()),
              j.bind(n, {
                content: () => this.getTimerDisplay().tooltip,
                html: !0,
                placement: "element",
                side: "bottom",
                className: "__warhelper_attack_timer_tooltip",
              }),
              e.insertBefore(n, e.firstChild),
              this.updateTimers());
            const i = t.cloneNode(!0);
            ((i.href = "#"),
              i.classList.add("__warhelper_attack_link"),
              (i.childNodes[0].textContent = "\ud83d\udea8"),
              (i.childNodes[1].textContent = "HELP"),
              e.insertBefore(i, e.firstChild),
              i.addEventListener("click", (t) => {
                t.preventDefault();
                const e = st(this.enemyUserId),
                  n = e.total ? `(${p(e.total)})` : "",
                  s = `<a href="/page.php?sid=attack&user2ID=${this.enemyUserId}">Need help on <b>${this.enemyUserName} ${n}</b></a>`;
                T.sendChatMessage(`faction-${this.ownFactionId}`, s);
              }));
          }
          handleMessage(t) {
            (t?.DB?.attackerUser?.factionID &&
              (this.ownFactionId = t?.DB?.attackerUser?.factionID),
              t?.DB?.defenderUser &&
                (this.enemyUserName = t?.DB?.defenderUser?.playername));
            const e =
              "string" == typeof t?.DB?.error ? t.DB.error.toLowerCase() : "";
            t?.DB && !e
              ? O.setUserStatus(this.enemyUserId, { state: "Okay", until: 0 })
              : -1 !== e.indexOf("hospital")
                ? (O.setUserStatus(this.enemyUserId, { state: "Hospital" }),
                  this.requestHospitalTime(this.enemyUserId))
                : -1 !== e.indexOf("jail") || -1 !== e.indexOf("jailed")
                  ? (O.setUserStatus(this.enemyUserId, { state: "Jail" }),
                    this.requestHospitalTime(this.enemyUserId))
                  : -1 !== e.indexOf("travel") &&
                    O.setUserStatus(this.enemyUserId, { state: "Traveling" });
          }
          async loadHospitalTime(t = this.enemyUserId) {
            const e = await w({
                section: "user",
                endpoint: "basic",
                parameters: { id: t },
              }),
              n = e?.profile?.status;
            this.updateStatusFromApi(t, n);
            const s = this.parseTimestamp(n?.until);
            return "Hospital" !== this.getApiStatusState(n) ||
              null === s ||
              s <= a()
              ? null
              : s;
          }
          handleStatusChanged(t) {
            this.enemyUserId &&
              t.detail?.statusUserIds.includes(this.enemyUserId) &&
              this.updateTimers();
          }
          getTimerDisplay() {
            if (!this.enemyUserId) return gt;
            const t = O.getUserStatus(this.enemyUserId);
            if (!t) return gt;
            const e = a();
            if ("Hospital" === t.status) {
              if ((this.resetFlightRequestSchedule(), t.updateAt <= e))
                return (
                  this.requestHospitalTime(this.enemyUserId),
                  {
                    icon: "\ud83d\ude91",
                    text: "Loading",
                    tooltip: "",
                    ariaLabel: "Loading hospital timer",
                  }
                );
              const n = this.formatTimerTime(t.updateAt);
              return {
                icon: "\ud83d\ude91",
                text: u(t.updateAt),
                tooltip: "",
                ariaLabel: `Hospital until ${n}`,
              };
            }
            if ("Jail" === t.status) {
              if ((this.resetFlightRequestSchedule(), t.updateAt <= e))
                return (
                  this.requestHospitalTime(this.enemyUserId),
                  {
                    icon: "\u2696",
                    text: "Jail",
                    tooltip: "",
                    ariaLabel: "Jail",
                  }
                );
              const n = this.formatTimerTime(t.updateAt);
              return {
                icon: "\u2696",
                text: u(t.updateAt),
                tooltip: "",
                ariaLabel: `Jail until ${n}`,
              };
            }
            if ("Traveling" === t.status) {
              this.resetHospitalRequest();
              const e = G.getFlightLandingDisplay(this.enemyUserId);
              if (
                (G.isFlightLookupStale(this.enemyUserId, 6e4) &&
                  this.requestFlightDisplay(
                    this.enemyUserId,
                    Boolean(e) || G.hasFlightLookup(this.enemyUserId),
                  ),
                e)
              )
                return this.getFlightTimerDisplay(e);
              const n = this.getAreaLabel(t),
                s = G.hasFlightLookup(this.enemyUserId)
                  ? "No flight estimate found"
                  : "Loading flight estimate...";
              return {
                icon: "\u2708",
                text: n,
                flagUrl: this.getAreaFlagUrl(t.area),
                tooltip: this.createTimerMessageTooltip("Traveling", s),
                ariaLabel: `${n}, ${s}`,
              };
            }
            return (
              this.resetHospitalRequest(),
              this.resetFlightRequestSchedule(),
              ft
            );
          }
          getFlightTimerDisplay(t) {
            const e = t.nextTimestampSeconds
                ? u(t.nextTimestampSeconds)
                : t.destinationCountry || "Flying",
              n = this.getFlightRangeSummary(t);
            return {
              icon: "\u2708",
              text: e,
              flagUrl: this.getFlightFlagUrl(t),
              tooltip: t.tooltip,
              ariaLabel: n ? `${t.route}, ${n}` : t.route,
            };
          }
          getAreaLabel(t) {
            return wt[t.area] || t.status;
          }
          getAreaFlagUrl(t) {
            return v[t]?.flagUrl;
          }
          getFlightFlagUrl(t) {
            const e = t.destinationCountry;
            if (e && "Torn" !== e)
              return Object.values(v).find(
                (t) =>
                  t.name === e ||
                  t.abbr === e ||
                  ("UAE" === e && "UAE" === t.abbr),
              )?.flagUrl;
          }
          formatTimerTime(t) {
            const e = new Date(1e3 * t);
            return `${[e.getUTCHours(), e.getUTCMinutes(), e.getUTCSeconds()].map((t) => String(t).padStart(2, "0")).join(":")} TCT / ${e.toLocaleString(void 0, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
          }
          getFlightRangeSummary(t) {
            return t.ranges.map((t) => `${t.label}: ${t.range}`).join(", ");
          }
          createTimerMessageTooltip(t, e) {
            return `\n      <div class="__warhelper_tooltip __warhelper_attack_timer_tooltip_content">\n        <div class="__warhelper_tooltip_title">${this.escapeHtml(t)}</div>\n        <div class="__warhelper_tooltip_rows">\n          <div>${this.escapeHtml(e)}</div>\n        </div>\n      </div>\n    `;
          }
          escapeHtml(t) {
            return t.replace(/[&<>"']/g, (t) => {
              switch (t) {
                case "&":
                  return "&amp;";
                case "<":
                  return "&lt;";
                case ">":
                  return "&gt;";
                case '"':
                  return "&quot;";
                case "'":
                  return "&#39;";
                default:
                  return t;
              }
            });
          }
          updateStatusFromApi(t, e) {
            if (!t || !e || "object" != typeof e) return;
            const n = this.getApiStatusState(e),
              s = this.parseTimestamp(e.until ?? e.updateAt),
              i = {};
            (n && (i.state = n),
              null !== s && (i.until = s),
              Object.keys(i).length && O.setUserStatus(t, i));
          }
          getApiStatusState(t) {
            return "string" == typeof t?.state ? t.state.trim() : "";
          }
          parseTimestamp(t) {
            if ("string" == typeof t && !t.trim()) return null;
            const e = Number(t);
            return Number.isFinite(e) ? e : null;
          }
          requestHospitalTime(t) {
            if (!Number.isFinite(t) || t <= 0) return;
            const e = Date.now();
            (this.hospitalRequestUserId !== t &&
              ((this.hospitalRequestUserId = t),
              (this.hospitalRequestStartedAt = 0),
              (this.hospitalRequest = null)),
              this.hospitalRequest ||
                (this.hospitalRequestStartedAt > 0 &&
                  e - this.hospitalRequestStartedAt < 6e4) ||
                ((this.hospitalRequestStartedAt = e),
                (this.hospitalRequest = this.loadHospitalTime(t)
                  .then(() => {
                    this.enemyUserId === t && this.updateTimers();
                  })
                  .catch(console.error)
                  .finally(() => {
                    this.hospitalRequestUserId === t &&
                      (this.hospitalRequest = null);
                  }))));
          }
          resetHospitalRequest() {
            ((this.hospitalRequestUserId = 0),
              (this.hospitalRequestStartedAt = 0),
              (this.hospitalRequest = null));
          }
          requestFlightDisplay(t, e = !1) {
            if (!Number.isFinite(t) || t <= 0) return;
            const n = Date.now();
            (this.flightRequestUserId !== t &&
              ((this.flightRequestUserId = t),
              (this.flightRequestStartedAt = 0),
              (this.flightRequestAttempts = 0),
              (this.flightRequest = null)),
              this.flightRequest ||
                this.flightRequestAttempts >= 5 ||
                (this.flightRequestAttempts > 0 &&
                  n - this.flightRequestStartedAt < 6e4) ||
                ((this.flightRequestAttempts += 1),
                (this.flightRequestStartedAt = n),
                (this.flightRequest = (
                  e
                    ? G.refreshFlightLandingDisplay(t)
                    : G.ensureFlightLandingDisplay(t)
                )
                  .then(() => {
                    this.enemyUserId === t && this.updateTimers();
                  })
                  .catch(console.error)
                  .finally(() => {
                    this.flightRequestUserId === t &&
                      (this.flightRequest = null);
                  }))));
          }
          resetFlightRequestSchedule() {
            ((this.flightRequestUserId = 0),
              (this.flightRequestStartedAt = 0),
              (this.flightRequestAttempts = 0),
              (this.flightRequest = null));
          }
          addStyles() {
            if (this.pageDocument.getElementById(_t)) return;
            const t = this.pageDocument.createElement("style");
            ((t.id = _t),
              (t.type = "text/css"),
              (t.textContent =
                "\n[class*='playerWindow__'] > [class*='defender__'] {\n  background: none !important;\n  pointer-events: none !important;\n}\n.__warhelper_attack_timer_flag {\n  display: inline-block;\n  width: 14px;\n  height: 10px;\n  margin: 0 3px 0 2px;\n  border: 1px solid rgba(0, 0, 0, 0.35);\n  box-sizing: border-box;\n  background-position: center;\n  background-repeat: no-repeat;\n  background-size: cover;\n  vertical-align: -1px;\n}\n.__warhelper_attack_link {\n  cursor: pointer;\n  width: auto !important;\n  margin: 5px;\n}\n.__warhelper_attack_link [class*='linkTitle__'] {\n  display: inline-block !important;\n}\n"),
              (
                this.pageDocument.head || this.pageDocument.documentElement
              ).appendChild(t));
          }
          updateTimers() {
            if (!this.timerTextNode || this.stopped) return;
            const t = this.getTimerDisplay();
            ((this.timerTextNode.textContent = t.text),
              this.timerIconNode && (this.timerIconNode.textContent = t.icon),
              this.timerFlagNode &&
                (t.flagUrl
                  ? ((this.timerFlagNode.style.display = ""),
                    (this.timerFlagNode.style.backgroundImage = `url("${t.flagUrl}")`))
                  : ((this.timerFlagNode.style.display = "none"),
                    (this.timerFlagNode.style.backgroundImage = ""))),
              this.timerLinkNode &&
                (this.timerLinkNode.removeAttribute("title"),
                this.timerLinkNode.setAttribute(
                  "aria-label",
                  t.ariaLabel || t.text,
                ),
                j.refresh(this.timerLinkNode)));
          }
          observeAttackDataRequests() {
            const t = this.pageWindow,
              e = t.fetch;
            if ("function" == typeof e) {
              const n = this,
                s = async function (...t) {
                  const s = n.getRequestUrl(t[0]),
                    i = await e.apply(this, t);
                  return (
                    n.isAttackDataUrl(s) &&
                      i
                        .clone()
                        .text()
                        .then((t) => n.handleRawAttackData(t))
                        .catch(console.error),
                    i
                  );
                };
              ((t.fetch = s),
                this.cleanupHandlers.push(() => {
                  t.fetch === s && (t.fetch = e);
                }));
            }
            const n = t.XMLHttpRequest?.prototype,
              s = n?.open;
            if ("function" == typeof s) {
              const t = this,
                e = function (...e) {
                  const n = t.getRequestUrl(e[1]);
                  return (
                    t.isAttackDataUrl(n) &&
                      this.addEventListener("readystatechange", () => {
                        if (4 !== this.readyState) return;
                        const e = this.status;
                        (0 !== e && (e < 200 || e >= 400)) ||
                          t.handleRawAttackData(this.responseText);
                      }),
                    s.apply(this, e)
                  );
                };
              ((n.open = e),
                this.cleanupHandlers.push(() => {
                  n.open === e && (n.open = s);
                }));
            }
          }
          handleRawAttackData(t) {
            const e = n(t);
            e && this.handleMessage(e);
          }
          getRequestUrl(t) {
            return "string" == typeof t
              ? t
              : t && "object" == typeof t && "string" == typeof t.url
                ? t.url
                : "";
          }
          isAttackDataUrl(t) {
            return -1 !== t.indexOf("sid=attackData");
          }
          onAdd(t, e, n = !1) {
            const s = new WeakSet();
            let i = !1;
            const r = (t) => {
              i || s.has(t) || (s.add(t), e(t), n && (i = !0));
            };
            if (!this.pageDocument.body) {
              const s = () => this.onAdd(t, e, n);
              return (
                this.pageDocument.addEventListener("DOMContentLoaded", s, {
                  once: !0,
                }),
                void this.cleanupHandlers.push(() =>
                  this.pageDocument.removeEventListener("DOMContentLoaded", s),
                )
              );
            }
            const a = new (
              this.pageWindow.MutationObserver || MutationObserver
            )((e) => {
              i ||
                e.forEach((e) => {
                  e.addedNodes.forEach((e) => {
                    this.isHTMLElement(e) &&
                      (e.matches(t) && r(e),
                      Array.from(e.querySelectorAll(t)).forEach((t) => {
                        this.isHTMLElement(t) && r(t);
                      }));
                  });
                });
            });
            (a.observe(this.pageDocument.body, { childList: !0, subtree: !0 }),
              this.cleanupHandlers.push(() => a.disconnect()),
              (() => {
                i ||
                  Array.from(this.pageDocument.querySelectorAll(t)).forEach(
                    (t) => {
                      this.isHTMLElement(t) && r(t);
                    },
                  );
              })());
          }
          isHTMLElement(t) {
            const e = this.pageWindow.HTMLElement || HTMLElement;
            return Boolean(t && "object" == typeof t && t instanceof e);
          }
        },
        At = class {
          static {
            this.addHandlers = {};
          }
          static {
            ((this.observer = new MutationObserver((t) => {
              t.forEach((t) => {
                t &&
                  t.addedNodes.forEach((t) => {
                    t instanceof HTMLElement &&
                      Object.keys(this.addHandlers).forEach((e) => {
                        const n = t.matches(e)
                          ? [t]
                          : Array.from(t.querySelectorAll(e));
                        n.length &&
                          n.forEach((t) => {
                            void 0 !== this.addHandlers[e] &&
                              this.emitAdd(e, t);
                          });
                      });
                  });
              });
            })),
              this.observe());
          }
          static emitAdd(t, e) {
            const n = this.addHandlers[t];
            void 0 !== n &&
              n.forEach((t) => {
                const s = n.findIndex((e) => e.callback == t.callback);
                -1 !== s && (t.callback(e), t.once && n.splice(s, 1));
              });
          }
          static observe() {
            document.body
              ? this.observer.observe(document.body, {
                  childList: !0,
                  subtree: !0,
                })
              : document.addEventListener("DOMContentLoaded", () =>
                  this.observe(),
                );
          }
          static onAdd(t, e, n = !1) {
            (void 0 === this.addHandlers[t] && (this.addHandlers[t] = []),
              this.addHandlers[t].push({ callback: e, once: n }));
            const s = Array.from(document.querySelectorAll(t));
            s.length &&
              s.forEach((e) => {
                this.emitAdd(t, e);
              });
          }
        };
      var yt = class {
          static {
            this.channelName = "__warhelper";
          }
          static {
            this.heartbeatMs = 1e3;
          }
          static {
            this.peerTtlMs = 3500;
          }
          static {
            this.tabId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
          }
          static {
            this.channel = null;
          }
          static {
            this.peers = new Map();
          }
          static {
            this.handlers = new Map();
          }
          static {
            this.masterChangeHandlers = new Set();
          }
          static {
            this.master = !1;
          }
          static {
            this.init();
          }
          static isMaster() {
            return this.master;
          }
          static on(t, e) {
            let n = this.handlers.get(t);
            return (
              n || ((n = new Set()), this.handlers.set(t, n)),
              n.add(e),
              () => {
                n?.delete(e);
              }
            );
          }
          static onMasterChange(t) {
            return (
              this.masterChangeHandlers.add(t),
              t(this.master),
              () => {
                this.masterChangeHandlers.delete(t);
              }
            );
          }
          static post(t, e) {
            this.channel?.postMessage({
              source: this.tabId,
              type: "message",
              topic: t,
              payload: e,
            });
          }
          static init() {
            if ("undefined" != typeof BroadcastChannel)
              try {
                ((this.channel = new BroadcastChannel(this.channelName)),
                  this.channel.addEventListener("message", (t) =>
                    this.handleMessage(t.data),
                  ));
              } catch {
                this.channel = null;
              }
            (document.addEventListener("visibilitychange", () => {
              (this.sendHeartbeat(), this.recomputeMaster());
            }),
              window.setInterval(() => {
                (this.prunePeers(),
                  this.sendHeartbeat(),
                  this.recomputeMaster());
              }, this.heartbeatMs),
              this.sendHeartbeat(),
              this.recomputeMaster());
          }
          static handleMessage(t) {
            if (
              !(function (t) {
                return "object" == typeof t && null !== t;
              })(t)
            )
              return;
            const e = t,
              n = "string" == typeof e.source ? e.source : "";
            return n && n !== this.tabId
              ? "heartbeat" === e.type
                ? (this.peers.set(n, {
                    visible: !0 === e.visible,
                    lastSeen: Date.now(),
                  }),
                  void this.recomputeMaster())
                : void (
                    "message" === e.type &&
                    "string" == typeof e.topic &&
                    this.handlers.get(e.topic)?.forEach((t) => {
                      t(e.payload);
                    })
                  )
              : void 0;
          }
          static sendHeartbeat() {
            this.channel &&
              this.channel.postMessage({
                source: this.tabId,
                type: "heartbeat",
                visible: !document.hidden,
              });
          }
          static prunePeers() {
            const t = Date.now() - this.peerTtlMs;
            this.peers.forEach((e, n) => {
              e.lastSeen < t && this.peers.delete(n);
            });
          }
          static recomputeMaster() {
            if (!this.channel) return void this.setMaster(!document.hidden);
            const t = [];
            document.hidden || t.push(this.tabId);
            const e = Date.now() - this.peerTtlMs;
            (this.peers.forEach((n, s) => {
              n.visible && n.lastSeen >= e && t.push(s);
            }),
              t.sort(),
              this.setMaster(t[0] === this.tabId));
          }
          static setMaster(t) {
            this.master !== t &&
              ((this.master = t),
              this.masterChangeHandlers.forEach((e) => {
                e(t);
              }));
          }
        },
        vt = "\u270b",
        St = class extends Error {
          constructor(t, e, n, s) {
            (super(n), (this.status = t), (this.code = e), (this.data = s));
          }
        };
      function xt(t) {
        return "object" == typeof t && null !== t;
      }
      function Ct(t) {
        const e = Number(t);
        return Number.isFinite(e) ? e : null;
      }
      function kt(t) {
        return "string" == typeof t ? t : "";
      }
      function Et(t) {
        return Array.isArray(t) ? t.filter((t) => "string" == typeof t) : [];
      }
      function Tt(t) {
        if (!xt(t)) return null;
        const e = Ct(t.id);
        return null === e ? null : { id: e, name: kt(t.name) || String(e) };
      }
      function Mt(t) {
        if (!xt(t)) return null;
        const e = Ct(t.factionId),
          n = Ct(t.playerId);
        return null === e || null === n
          ? null
          : {
              factionId: e,
              factionName: kt(t.factionName),
              playerId: n,
              playerName: kt(t.playerName) || String(n),
              position: kt(t.position),
              canSetup: !0 === t.canSetup,
              canManagePositions: !0 === t.canManagePositions,
              canManageOtherDibs: !0 === t.canManageOtherDibs,
            };
      }
      function Ft(t) {
        if (!xt(t)) return null;
        const e = Ct(t.factionId),
          n = Ct(t.defaultExpirySeconds),
          s = Ct(t.createdAt),
          i = Ct(t.updatedAt);
        if (null === e || null === n || null === s || null === i) return null;
        const r = Et(
            "managerPositions" in t ? t.managerPositions : t.allowedPositions,
          ),
          a = Math.max(0, Math.floor(Ct(t.maxConcurrentDibsPerPlayer) ?? 0));
        return {
          factionId: e,
          defaultExpirySeconds: n,
          allowLongDibs: !0 === t.allowLongDibs,
          allowedPositions: r,
          maxConcurrentDibsPerPlayer: a,
          updatedBy: Tt(t.updatedBy),
          createdAt: s,
          updatedAt: i,
        };
      }
      function It(t) {
        if (!xt(t)) return null;
        const e = Ct(t.id),
          n = Ct(t.factionId),
          s = Ct(t.targetId),
          i = Tt(t.player);
        if (null === e || null === n || null === s || null === i) return null;
        const r = Tt(t.createdBy) || i;
        return {
          id: e,
          factionId: n,
          targetId: s,
          player: i,
          createdBy: r,
          updatedBy: Tt(t.updatedBy) || r,
          expiresAt: null === t.expiresAt ? null : Ct(t.expiresAt),
          createdAt: Ct(t.createdAt) || 0,
          updatedAt: Ct(t.updatedAt) || 0,
        };
      }
      function Dt(t) {
        if (!xt(t)) return null;
        const e = Ct(t.id),
          n = Ct(t.factionId),
          s = Ct(t.createdAt),
          i = kt(t.type);
        if (null === e || null === n || null === s || !i) return null;
        const r = { id: e, factionId: n, type: i, createdAt: s },
          a = It(t.dib);
        a && (r.dib = a);
        const o = Ft(t.config);
        o && (r.config = o);
        const l = Tt(t.cancelledBy);
        return (l && (r.cancelledBy = l), r);
      }
      function Lt(t) {
        if (null === t) return "does not expire";
        const e = Math.max(0, t - a());
        if (0 === e) return "expired";
        const n = Math.floor(e / 3600),
          s = Math.floor((e % 3600) / 60);
        return n > 0 ? `${n}h ${s}m left` : `${Math.max(1, s)}m left`;
      }
      function Ut(t) {
        return Math.max(0, t - a());
      }
      function Rt(t) {
        const e = Math.max(1, Math.ceil(t / 60)),
          n = Math.floor(e / 60),
          s = e % 60;
        return n > 0 && s > 0 ? `${n}h ${s}m` : n > 0 ? `${n}h` : `${e}m`;
      }
      var Nt = class {
          static {
            this.status = "disabled";
          }
          static {
            this.identity = null;
          }
          static {
            this.config = null;
          }
          static {
            this.eventId = 0;
          }
          static {
            this.dibs = new Map();
          }
          static {
            this.nodes = new Map();
          }
          static {
            this.tooltipBindings = new WeakMap();
          }
          static {
            this.listeners = new Set();
          }
          static {
            this.pendingRequests = new Map();
          }
          static {
            this.targetActionErrors = new Map();
          }
          static {
            this.targetActionErrorTimers = new Map();
          }
          static {
            this.reconnectTimer = null;
          }
          static {
            this.configReconnectTimer = null;
          }
          static {
            this.pollTimer = null;
          }
          static {
            this.activePollSession = null;
          }
          static {
            this.activePollId = null;
          }
          static {
            this.pollIdCounter = 0;
          }
          static {
            this.reconnectAttempts = 0;
          }
          static {
            this.requestCounter = 0;
          }
          static {
            this.session = 0;
          }
          static {
            this.initialized = !1;
          }
          static {
            this.lastError = null;
          }
          static {
            this.contextMenu = null;
          }
          static {
            this.contextMenuCleanup = null;
          }
          static {
            this.configTabAttempts = 0;
          }
          static {
            this.configTabInitialized = !1;
          }
          static {
            this.setupFormDirty = !1;
          }
          static {
            this.setupFormSaving = !1;
          }
          static {
            this.startupInitTimer = null;
          }
          static {
            this.startupInitAttempts = 0;
          }
          static {
            this.shortDibTimerUpdateTimer = null;
          }
          static {
            this.memberCache = null;
          }
          static {
            this.memberCacheAt = 0;
          }
          static {
            this.crossTabInitialized = !1;
          }
          static {
            this.announcedDibChatIds = new Set();
          }
          static bind(t, e, n, s = {}) {
            if (!this.init()) return;
            ((e.dataset.dibsSuppressTooltip =
              !0 === s.suppressTooltip ? "true" : "false"),
              (e.dataset.dibsSuppressActiveTooltipRefresh =
                !0 === s.suppressActiveTooltipRefresh ? "true" : "false"),
              this.bindTooltip(e));
            let i = this.nodes.get(t);
            (i || ((i = new Set()), this.nodes.set(t, i)),
              i.has(e) ||
                (i.add(e),
                (e.dataset.dibsTargetId = String(t)),
                e.addEventListener("click", (e) => {
                  (e.preventDefault(), e.stopPropagation(), this.toggle(t));
                }),
                e.addEventListener("contextmenu", (e) => {
                  (e.preventDefault(),
                    e.stopPropagation(),
                    this.openContextMenu(t, e.clientX, e.clientY));
                })),
              n && this.bindContextMenu(t, n),
              this.renderNode(t, e),
              this.syncShortDibTimerUpdateTimer());
          }
          static start() {
            !this.init() &&
              null === this.startupInitTimer &&
              m() &&
              ((this.startupInitAttempts = 0),
              (this.startupInitTimer = window.setInterval(() => {
                (this.startupInitAttempts++,
                  (this.init() || !m() || this.startupInitAttempts >= 40) &&
                    this.clearStartupInitTimer());
              }, 250)));
          }
          static bindContextMenu(t, e) {
            ((e.dataset.dibsContextTargetId = String(t)),
              "true" !== e.dataset.dibsContextBound &&
                ((e.dataset.dibsContextBound = "true"),
                e.addEventListener("contextmenu", (t) => {
                  const e = t.currentTarget;
                  if (!(e instanceof HTMLElement)) return;
                  if ("disabled" === this.status) return;
                  const n = Number(e.dataset.dibsContextTargetId);
                  !Number.isFinite(n) ||
                    n <= 0 ||
                    (t.preventDefault(),
                    t.stopPropagation(),
                    this.openContextMenu(n, t.clientX, t.clientY));
                })));
          }
          static onChange(t) {
            return this.init()
              ? (this.listeners.add(t),
                t(this.getState()),
                () => {
                  this.listeners.delete(t);
                })
              : (t(this.getState()), () => {});
          }
          static getState() {
            return (
              this.init(),
              this.cleanupExpiredDibs(!1),
              {
                status: this.status,
                identity: this.identity,
                config: this.config,
                dibs: Array.from(this.dibs.values()),
                error: this.lastError,
              }
            );
          }
          static get(t) {
            const e = this.dibs.get(t);
            if (!e || !this.isExpired(e)) return e;
            (this.dibs.delete(t), this.emit());
          }
          static toggle(t, e = {}) {
            if (!this.init()) return null;
            const n = this.get(t);
            return n
              ? this.identity && n.player.id === this.identity.playerId
                ? this.cancel(t, e)
                : ((this.lastError = `${n.player.name} already dibbed this target`),
                  this.emit(),
                  null)
              : this.dib(t, e);
          }
          static dib(t, e = {}) {
            return this.init() ? this.sendDibAction("dib", t, "dib", e) : null;
          }
          static cancel(t, e = {}) {
            return this.init()
              ? this.sendDibAction("cancel", t, "cancel", e)
              : null;
          }
          static setup(t) {
            return this.init()
              ? (this.stopPolling(),
                this.request("POST", "/setup", this.serializeSetupOptions(t))
                  .then((t) => {
                    (this.handleSetupMessage(t),
                      (this.setupFormDirty = !1),
                      this.updateSetupForm(),
                      this.schedulePoll(this.session, 0));
                  })
                  .catch((t) => {
                    throw (
                      this.handleHttpError(t, !1),
                      "connected" === this.status &&
                        this.schedulePoll(this.session, 0),
                      t
                    );
                  }))
              : Promise.reject(new Error("Dibs only run on your faction page"));
          }
          static reconnect() {
            this.initialized
              ? (this.stopPolling(), this.session++, this.connect())
              : this.init();
          }
          static init() {
            return (
              !!this.initialized ||
              (!!_() &&
                ((this.initialized = !0),
                this.clearStartupInitTimer(),
                this.injectStyle(),
                this.initCrossTabCoordination(),
                x.onChange("torn_key", () => {
                  (x.setDibsTabVisible(!1), this.reconnectAfterConfigSave());
                }),
                window.setInterval(() => this.cleanupExpiredDibs(!0), 3e4),
                this.connect(),
                this.initConfigTab(),
                !0))
            );
          }
          static clearStartupInitTimer() {
            null !== this.startupInitTimer &&
              (window.clearInterval(this.startupInitTimer),
              (this.startupInitTimer = null));
          }
          static injectStyle() {
            l(
              "\ndiv.icons:has(.__warhelper_dibs) {\n  position: relative;\n  overflow: visible;\n}\n\n.__warhelper_dibs {\n  position: absolute;\n  right: 0px;\n  display: inline-block;\n  height: 19px;\n  font-size: 18px;\n  line-height: 1;\n  cursor: pointer;\n  opacity: 0.55;\n  color: transparent;\n  text-shadow: 0 0 0 #ffde34;\n}\n\n.__warhelper_dibs.timed {\n  overflow: visible;\n}\n\n.__warhelper_dibs_timer {\n  position: absolute;\n  left: 50%;\n  top: 25%;\n  transform: translateX(-50%);\n  min-width: 34px;\n  color: #000000;\n  text-shadow: 0 0 0 #fff;\n  font-size: 10px;\n  font-weight: bold;\n  line-height: 1;\n  letter-spacing: 0;\n  text-align: center;\n  white-space: nowrap;\n  pointer-events: none;\n}\n\n.__warhelper_dibs.mine .__warhelper_dibs_timer {\n  color: #006600;\n}\n\n.__warhelper_dibs.other .__warhelper_dibs_timer {\n  color: #800000;\n}\n\n.__warhelper_dibs.available:hover {\n  opacity: 1;\n}\n\n.__warhelper_dibs.mine {\n  opacity: 1;\n  text-shadow: 0 0 0 #66aa66;\n}\n\n.__warhelper_dibs.mine.long {\n  text-shadow: 0 0 0 #66aa66;\n}\n\n.__warhelper_dibs.other {\n  cursor: not-allowed;\n  opacity: 1;\n  text-shadow: 0 0 0 #cc6666;\n}\n\n.__warhelper_dibs.pending {\n  opacity: 1;\n  animation: __warhelper_dibs_pending 1.4s ease-in-out infinite;\n}\n\n.__warhelper_dibs.disabled,\n.__warhelper_dibs.error {\n  cursor: not-allowed;\n  text-shadow: 0 0 0 #999;\n}\n\n.__warhelper_dibs_menu {\n  position: fixed;\n  z-index: 99999;\n  min-width: 150px;\n  padding: 3px 0;\n  border: 1px solid #111;\n  border-radius: 3px;\n  background: #2b2b2b;\n  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.45);\n  color: #ddd;\n  font-family: Arial, sans-serif;\n  font-size: 12px;\n}\n\n.__warhelper_dibs_menu button {\n  display: block;\n  width: 100%;\n  padding: 5px 10px;\n  border: 0;\n  background: transparent;\n  color: inherit;\n  font: inherit;\n  text-align: left;\n  white-space: nowrap;\n  cursor: pointer;\n}\n\n.__warhelper_dibs_menu button:not(:disabled):hover {\n  background: #444;\n}\n\n.__warhelper_dibs_menu button:disabled {\n  color: #777;\n  cursor: default;\n}\n\n.__warhelper_dibs_menu_separator {\n  height: 1px;\n  margin: 3px 0;\n  background: #444;\n}\n\n.__warhelper_dibs_menu.picker {\n  width: 240px;\n  padding: 6px;\n}\n\n.__warhelper_dibs_member_header {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  margin-bottom: 6px;\n}\n\n.__warhelper_dibs_member_header button {\n  width: auto;\n  padding: 3px 6px;\n}\n\n.__warhelper_dibs_member_title {\n  min-width: 0;\n  color: #bbb;\n  font-size: 12px;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.__warhelper_dibs_member_filter {\n  box-sizing: border-box;\n  width: 100%;\n  margin-bottom: 5px;\n  padding: 5px 7px;\n  border: 1px solid #555;\n  border-radius: 3px;\n  outline: none;\n  background: #1f1f1f;\n  color: #eee;\n  font: inherit;\n}\n\n.__warhelper_dibs_member_filter:focus {\n  border-color: #888;\n}\n\n.__warhelper_dibs_member_list {\n  max-height: min(280px, calc(100vh - 130px));\n  overflow-y: auto;\n  overscroll-behavior: contain;\n}\n\n.__warhelper_dibs_menu button.__warhelper_dibs_member_option {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 8px;\n  padding: 5px 6px;\n}\n\n.__warhelper_dibs_member_name {\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n\n.__warhelper_dibs_member_status {\n  flex: 0 0 auto;\n  color: #aaa;\n  font-size: 11px;\n}\n\n.__warhelper_dibs_member_status.online {\n  color: #70c46f;\n}\n\n.__warhelper_dibs_member_status.idle {\n  color: #d3b25f;\n}\n\n.__warhelper_dibs_member_status.offline {\n  color: #888;\n}\n\n@keyframes __warhelper_dibs_pending {\n  0%, 100% {\n    transform: translateY(0);\n    opacity: 0.75;\n  }\n  50% {\n    transform: translateY(-1px);\n    opacity: 1;\n  }\n}\n\n@media (prefers-reduced-motion: reduce) {\n  .__warhelper_dibs.pending {\n    animation: none;\n  }\n}\n",
            );
          }
          static reconnectAfterConfigSave() {
            null === this.configReconnectTimer &&
              (this.configReconnectTimer = window.setTimeout(() => {
                ((this.configReconnectTimer = null), this.reconnect());
              }, 0));
          }
          static initCrossTabCoordination() {
            this.crossTabInitialized ||
              ((this.crossTabInitialized = !0),
              yt.on("dibs.state", (t) => this.handleBroadcastState(t)),
              yt.onMasterChange((t) => this.handleMasterChange(t)),
              document.addEventListener("visibilitychange", () =>
                this.handleVisibilityChange(),
              ));
          }
          static handleBroadcastState(t) {
            if (!xt(t)) return;
            const e = Ct(t.eventId);
            if (null === e || e < this.eventId) return;
            const n = Mt(t.identity),
              s = Ft(t.config);
            n &&
              s &&
              ((this.identity = n),
              (this.config = s),
              this.replaceDibs(this.parseDibList(t.dibs)),
              (this.eventId = e),
              (this.status = "connected"),
              (this.reconnectAttempts = 0),
              (this.lastError = null),
              this.emit());
          }
          static handleMasterChange(t) {
            this.initialized &&
              "disabled" !== this.status &&
              (t
                ? "connected" === this.status &&
                  this.schedulePollIfIdle(this.session, 0)
                : this.stopPolling());
          }
          static handleVisibilityChange() {
            if (document.hidden)
              return (
                this.stopPolling(),
                void this.clearShortDibTimerUpdateTimer()
              );
            (this.updateShortDibTimers(),
              this.initialized &&
                "connected" === this.status &&
                this.schedulePoll(this.session, 0));
          }
          static broadcastState() {
            "connected" === this.status &&
              this.identity &&
              this.config &&
              yt.post("dibs.state", {
                status: this.status,
                identity: this.identity,
                config: this.config,
                dibs: Array.from(this.dibs.values()),
                eventId: this.eventId,
              });
          }
          static initConfigTab() {
            if (this.configTabInitialized) return;
            const t = document.querySelector(
                "button.__warhelper_dibs_setup_save",
              ),
              e = this.getSetupInput("defaultExpiryMinutes"),
              n = this.getSetupInput("allowLongDibs"),
              s = this.getSetupInput("maxConcurrentDibsPerPlayer"),
              i = this.getSetupInput("allowedPositions");
            t instanceof HTMLButtonElement &&
            e instanceof HTMLInputElement &&
            n instanceof HTMLInputElement &&
            s instanceof HTMLInputElement &&
            i instanceof HTMLInputElement
              ? ((this.configTabInitialized = !0),
                [e, n, s, i].forEach((t) => {
                  (t.addEventListener("input", () => {
                    ((this.setupFormDirty = !0), this.setSetupStatus("", ""));
                  }),
                    t.addEventListener("change", () => {
                      ((this.setupFormDirty = !0), this.setSetupStatus("", ""));
                    }));
                }),
                t.addEventListener("click", () => this.saveSetupForm()),
                this.updateSetupForm())
              : this.configTabAttempts < 20 &&
                (this.configTabAttempts++,
                window.setTimeout(() => this.initConfigTab(), 250));
          }
          static getSetupInput(t) {
            const e = document.querySelector(`input[data-dibs-setup="${t}"]`);
            return e instanceof HTMLInputElement ? e : null;
          }
          static getSetupStatusNode() {
            const t = document.querySelector(".__warhelper_dibs_setup_status");
            return t instanceof HTMLElement ? t : null;
          }
          static setSetupStatus(t, e) {
            const n = this.getSetupStatusNode();
            n &&
              ((n.textContent = t),
              n.classList.toggle("error", "error" === e),
              n.classList.toggle("success", "success" === e));
          }
          static flashSetupSaveButton() {
            const t = document.querySelector(
              "button.__warhelper_dibs_setup_save",
            );
            t instanceof HTMLButtonElement &&
              (t.classList.remove("__warhelper_dibs_setup_saved"),
              t.offsetWidth,
              t.classList.add("__warhelper_dibs_setup_saved"),
              window.setTimeout(
                () => t.classList.remove("__warhelper_dibs_setup_saved"),
                900,
              ));
          }
          static updateSetupForm() {
            const t = "connected" === this.status && null !== this.config,
              e = t && !0 === this.identity?.canSetup,
              n = t && !0 === this.identity?.canManagePositions;
            if ((x.setDibsTabVisible(e), !this.configTabInitialized)) return;
            const s = this.getSetupInput("defaultExpiryMinutes"),
              i = this.getSetupInput("allowLongDibs"),
              r = this.getSetupInput("maxConcurrentDibsPerPlayer"),
              a = this.getSetupInput("allowedPositions"),
              o = document.querySelector("button.__warhelper_dibs_setup_save");
            if (
              !(
                s instanceof HTMLInputElement &&
                i instanceof HTMLInputElement &&
                r instanceof HTMLInputElement &&
                a instanceof HTMLInputElement &&
                o instanceof HTMLButtonElement
              )
            )
              return;
            const l = !e || this.setupFormSaving,
              c = a.closest("label");
            (c instanceof HTMLElement && (c.hidden = !n),
              (s.disabled = l),
              (i.disabled = l),
              (r.disabled = l),
              (a.disabled = l || !n),
              (o.disabled = l),
              !this.setupFormDirty &&
                this.config &&
                ((s.value = String(
                  Math.max(
                    1,
                    Math.round(this.config.defaultExpirySeconds / 60),
                  ),
                )),
                (i.checked = this.config.allowLongDibs),
                (r.value = String(this.config.maxConcurrentDibsPerPlayer)),
                n && (a.value = this.config.allowedPositions.join(", "))),
              this.setupFormSaving ||
                this.setupFormDirty ||
                ("error" === this.status
                  ? this.setSetupStatus(
                      this.lastError || "Failed to load Dibs setup.",
                      "error",
                    )
                  : t
                    ? e
                      ? this.setSetupStatus("", "")
                      : this.setSetupStatus(
                          "Your position cannot update Dibs setup.",
                          "",
                        )
                    : this.setSetupStatus("", "")));
          }
          static saveSetupForm() {
            const t = this.getSetupInput("defaultExpiryMinutes"),
              e = this.getSetupInput("allowLongDibs"),
              n = this.getSetupInput("maxConcurrentDibsPerPlayer"),
              s = this.getSetupInput("allowedPositions");
            if (
              !(
                t instanceof HTMLInputElement &&
                e instanceof HTMLInputElement &&
                n instanceof HTMLInputElement &&
                s instanceof HTMLInputElement
              )
            )
              return;
            if (this.setupFormSaving) return;
            const i = Number(t.value);
            if (!Number.isFinite(i) || i <= 0)
              return void this.setSetupStatus(
                "Short dib minutes must be a positive number.",
                "error",
              );
            const r = "" === n.value.trim() ? 0 : Number(n.value);
            if (!Number.isSafeInteger(r) || r < 0)
              return void this.setSetupStatus(
                "Max concurrent dibs must be a non-negative whole number.",
                "error",
              );
            ((this.setupFormSaving = !0),
              this.setSetupStatus("Saving Dibs setup...", ""),
              this.updateSetupForm());
            const a = !0 === this.identity?.canManagePositions,
              o = {
                defaultExpiryMinutes: i,
                allowLongDibs: e.checked,
                maxConcurrentDibsPerPlayer: r,
              };
            (a && (o.managerPositions = this.parseAllowedPositions(s.value)),
              this.setup(o)
                .then(() => {
                  ((this.setupFormSaving = !1),
                    this.setSetupStatus("", ""),
                    this.updateSetupForm(),
                    this.flashSetupSaveButton());
                })
                .catch((t) => {
                  ((this.setupFormSaving = !1),
                    this.updateSetupForm(),
                    this.setSetupStatus(
                      t instanceof Error
                        ? t.message
                        : "Failed to save Dibs setup.",
                      "error",
                    ));
                }));
          }
          static parseAllowedPositions(t) {
            return t
              .split(/[,;\n]/)
              .map((t) => t.trim())
              .filter((t) => t.length > 0);
          }
          static connect() {
            if (!this.getApiKey())
              return void this.setDisconnectedState(
                "disabled",
                "Set a Torn API key to use Dibs",
              );
            (this.clearReconnectTimer(), this.stopPolling());
            const t = ++this.session;
            ((this.status = "connecting"),
              (this.identity = null),
              (this.config = null),
              (this.eventId = 0),
              this.dibs.clear(),
              this.clearPendingRequests(),
              this.clearTargetActionErrors(),
              (this.lastError = null),
              this.emit(),
              this.request("GET", "", void 0, void 0, 3e4)
                .then((e) => {
                  t === this.session &&
                    (this.handleStateMessage(e, "dib.init"),
                    (this.status = "connected"),
                    (this.reconnectAttempts = 0),
                    (this.lastError = null),
                    this.emit(),
                    this.broadcastState(),
                    this.schedulePoll(t, 0));
                })
                .catch((e) => {
                  t === this.session && this.handleHttpError(e, !0, !0);
                }));
          }
          static setDisconnectedState(t, e) {
            (this.stopPolling(),
              this.session++,
              (this.status = t),
              (this.identity = null),
              (this.config = null),
              (this.eventId = 0),
              this.dibs.clear(),
              (this.lastError = e),
              this.clearPendingRequests(),
              this.clearTargetActionErrors(),
              "disabled" === t && this.closeContextMenu(),
              this.emit());
          }
          static scheduleReconnect() {
            if (!this.getApiKey() || null !== this.reconnectTimer) return;
            const t = Math.min(1e3 * Math.pow(2, this.reconnectAttempts), 3e4);
            (this.reconnectAttempts++,
              (this.reconnectTimer = window.setTimeout(() => {
                ((this.reconnectTimer = null), this.connect());
              }, t)));
          }
          static clearReconnectTimer() {
            null !== this.reconnectTimer &&
              (window.clearTimeout(this.reconnectTimer),
              (this.reconnectTimer = null));
          }
          static stopPolling() {
            (null !== this.pollTimer &&
              (window.clearTimeout(this.pollTimer), (this.pollTimer = null)),
              (this.activePollSession = null),
              (this.activePollId = null));
          }
          static schedulePoll(t, e) {
            document.hidden ||
              t !== this.session ||
              "disabled" === this.status ||
              (yt.isMaster() &&
                (this.stopPolling(),
                (this.pollTimer = window.setTimeout(
                  () => {
                    ((this.pollTimer = null), this.poll(t));
                  },
                  Math.max(0, e),
                ))));
          }
          static schedulePollIfIdle(t, e) {
            null !== this.pollTimer ||
              (this.activePollSession === t && null !== this.activePollId) ||
              this.schedulePoll(t, e);
          }
          static poll(t) {
            if (t !== this.session || "disabled" === this.status) return;
            if (document.hidden || !yt.isMaster()) return;
            const e = ++this.pollIdCounter;
            ((this.activePollId = e),
              (this.activePollSession = t),
              this.request(
                "GET",
                "/poll",
                void 0,
                { after: String(this.eventId), timeoutSeconds: String(20) },
                25e3,
              )
                .then((n) => {
                  t === this.session &&
                    this.activePollId === e &&
                    (this.clearActivePoll(t, e),
                    this.handleStateMessage(n, "dib.poll"),
                    (this.status = "connected"),
                    (this.reconnectAttempts = 0),
                    (this.lastError = null),
                    this.emit(),
                    this.broadcastState(),
                    this.schedulePoll(t, 0));
                })
                .catch((n) => {
                  t === this.session &&
                    this.activePollId === e &&
                    (this.clearActivePoll(t, e), this.handleHttpError(n, !0));
                }));
          }
          static request(e, n, s, i, r = 3e4) {
            let a;
            try {
              a = this.buildUrl(n, i);
            } catch (t) {
              return Promise.reject(t);
            }
            const o = { method: e, url: a, timeout: r };
            return (
              void 0 !== s &&
                ((o.headers = { "Content-Type": "application/json" }),
                (o.data = JSON.stringify(s))),
              t.request(o).then((t) => {
                const e = this.parseJsonResponse(t.responseText);
                if (t.status < 200 || t.status >= 300)
                  throw this.createHttpError(t.status, e);
                return e;
              })
            );
          }
          static clearActivePoll(t, e) {
            this.activePollSession === t &&
              this.activePollId === e &&
              ((this.activePollSession = null), (this.activePollId = null));
          }
          static parseJsonResponse(t) {
            try {
              return JSON.parse(t);
            } catch {
              return;
            }
          }
          static createHttpError(t, e) {
            return xt(e)
              ? new St(
                  t,
                  kt(e.code) || "http_error",
                  kt(e.error) || `Dibs request failed (${t})`,
                  e.data,
                )
              : new St(t, "http_error", `Dibs request failed (${t})`, void 0);
          }
          static getApiKey() {
            return String(x.get("torn_key") || "").trim();
          }
          static buildUrl(t, e) {
            const n = this.getApiKey();
            if (!n) throw new Error("Set a Torn API key to use Dibs");
            const s = new URL(
              `https://torn.seintz.com/api/dibs/${encodeURIComponent(n)}${t}`,
            );
            return (
              e &&
                Object.entries(e).forEach(([t, e]) => s.searchParams.set(t, e)),
              s.toString()
            );
          }
          static handleStateMessage(t, e) {
            if (!xt(t)) throw new Error("Dibs response was not an object");
            const n = t,
              s = kt(n.type);
            if (s !== e)
              throw new Error(`Expected ${e}, got ${s || "unknown response"}`);
            const i = Ct(n.eventId);
            if (null !== i && i < this.eventId) return;
            const r = Mt(n.identity),
              a = Ft(n.config);
            if (!r || !a) throw new Error("Dibs state response was incomplete");
            ((this.identity = r),
              (this.config = a),
              this.replaceDibs(this.parseDibList(n.dibs)),
              null !== i && (this.eventId = Math.max(this.eventId, i)),
              this.applyEvents(n.events));
          }
          static handleActionMessage(t, e) {
            if (!xt(t))
              throw new Error("Dibs action response was not an object");
            const n = t,
              s = kt(n.type);
            let i = null;
            switch (s) {
              case "dib.config":
                this.handleConfigMessage(n);
                break;
              case "dib.added":
              case "dib.updated":
                i = this.handleDibMessage(n);
                break;
              case "dib.cancelled":
                i = this.handleCancelMessage(n);
                break;
              default:
                throw new Error(
                  `Unknown Dibs action response: ${s || "missing type"}`,
                );
            }
            const r = Dt(n.event);
            return (
              r &&
                (this.applyEvent(r),
                (this.eventId = Math.max(this.eventId, r.id)),
                !i && r.dib && (i = r.dib)),
              this.updateEventId(n.eventId),
              this.clearPendingRequest(e),
              (this.lastError = null),
              this.emit(),
              this.broadcastState(),
              i
            );
          }
          static handleSetupMessage(t) {
            if (!xt(t))
              throw new Error("Dibs setup response was not an object");
            const e = t,
              n = kt(e.type);
            if ("dib.config" !== n)
              throw new Error(
                `Expected dib.config, got ${n || "unknown response"}`,
              );
            this.handleConfigMessage(e);
            const s = Dt(e.event);
            (s &&
              (this.applyEvent(s),
              (this.eventId = Math.max(this.eventId, s.id))),
              this.updateEventId(e.eventId),
              (this.lastError = null),
              this.emit(),
              this.broadcastState());
          }
          static handleConfigMessage(t) {
            const e = Ft(t.config);
            e && (this.config = e);
          }
          static handleDibMessage(t) {
            const e = It(t.dib);
            return (
              e &&
                (this.clearTargetActionError(e.targetId, !1),
                this.dibs.set(e.targetId, e),
                this.renderTarget(e.targetId)),
              e
            );
          }
          static handleCancelMessage(t) {
            const e = It(t.dib);
            return (
              e &&
                (this.clearTargetActionError(e.targetId, !1),
                this.dibs.delete(e.targetId),
                this.renderTarget(e.targetId)),
              e
            );
          }
          static applyEvents(t) {
            if (Array.isArray(t))
              for (const e of t) {
                const t = Dt(e);
                t &&
                  (this.applyEvent(t),
                  (this.eventId = Math.max(this.eventId, t.id)));
              }
          }
          static applyEvent(t) {
            switch (t.type) {
              case "dib.config":
                t.config && (this.config = t.config);
                break;
              case "dib.added":
              case "dib.updated":
                t.dib &&
                  (this.clearTargetActionError(t.dib.targetId, !1),
                  this.dibs.set(t.dib.targetId, t.dib),
                  this.clearPendingByTarget(t.dib.targetId));
                break;
              case "dib.cancelled":
                t.dib &&
                  (this.clearTargetActionError(t.dib.targetId, !1),
                  this.dibs.delete(t.dib.targetId),
                  this.clearPendingByTarget(t.dib.targetId));
            }
          }
          static updateEventId(t) {
            const e = Ct(t);
            null !== e && (this.eventId = Math.max(this.eventId, e));
          }
          static parseDibList(t) {
            if (!Array.isArray(t)) return [];
            const e = [];
            for (const n of t) {
              const t = It(n);
              t && e.push(t);
            }
            return e;
          }
          static replaceDibs(t) {
            this.dibs.clear();
            for (const e of t)
              this.isExpired(e) || this.dibs.set(e.targetId, e);
          }
          static sendDibAction(t, e, n, s) {
            if ("disabled" === this.status) return null;
            if (!Number.isFinite(e) || e <= 0) return null;
            if (!this.getApiKey())
              return (
                (this.lastError = "Set a Torn API key to use Dibs"),
                this.emit(),
                null
              );
            if ("dib" === n) {
              const t = this.getShortDibBlockReason(e, s);
              if (t) return ((this.lastError = t), this.emit(), null);
            }
            const i = ++this.requestCounter,
              r = String(i);
            return (
              this.clearTargetActionError(e, !1),
              this.pendingRequests.set(r, { targetId: e, action: n }),
              this.renderTarget(e),
              this.request("POST", `/${t}`, {
                targetId: e,
                ...this.serializeOptions(s),
              })
                .then((t) => {
                  const e = this.handleActionMessage(t, r);
                  ("dib" === n && e && this.sendDibChatMessage(e),
                    this.schedulePollIfIdle(this.session, 0));
                })
                .catch((t) => {
                  this.clearPendingRequest(r);
                  const n = this.handleHttpError(t, !1);
                  (this.setTargetActionError(e, n),
                    "connected" === this.status &&
                      this.schedulePollIfIdle(this.session, 0));
                }),
              i
            );
          }
          static sendDibChatMessage(t) {
            if (this.announcedDibChatIds.has(t.id)) return;
            const e = this.identity?.factionId || t.factionId;
            if (!e) return;
            this.announcedDibChatIds.add(t.id);
            const n = `Dibs on <b>${this.getTargetName(t.targetId)}</b>`;
            T.sendChatMessage(`faction-${e}`, n);
          }
          static getTargetName(t) {
            const e = O.getUserStatus(t)?.name?.trim();
            if (e) return e;
            const n = document.querySelector(`[data-warhelper-user-id="${t}"]`),
              s = n instanceof HTMLElement ? this.getNameFromNode(n) : "";
            if (s) return s;
            const i = Array.from(
              document.querySelectorAll('a[href*="XID="], a[href*="user2ID="]'),
            );
            for (const e of i) {
              if (!(e instanceof HTMLAnchorElement)) continue;
              const n = new URL(e.href, window.location.origin);
              if (
                Number(
                  n.searchParams.get("XID") ||
                    n.searchParams.get("user2ID") ||
                    0,
                ) !== t
              )
                continue;
              const s = this.getNameFromNode(e);
              if (s) return s;
            }
            return "";
          }
          static getNameFromNode(t) {
            const e = t.querySelector(".honor-text:last-child");
            return (
              (e instanceof HTMLElement ? e.innerText : "") ||
              t.textContent ||
              ""
            ).trim();
          }
          static serializeOptions(t) {
            const e = {};
            return (
              void 0 !== t.forPlayerId && (e.forPlayerId = t.forPlayerId),
              "long" in t && void 0 !== t.long && (e.long = t.long),
              e
            );
          }
          static serializeSetupOptions(t) {
            const e = {};
            return (
              void 0 !== t.defaultExpiryMinutes &&
                (e.defaultExpiryMinutes = t.defaultExpiryMinutes),
              void 0 !== t.allowLongDibs && (e.allowLongDibs = t.allowLongDibs),
              void 0 !== t.maxConcurrentDibsPerPlayer &&
                (e.maxConcurrentDibsPerPlayer = t.maxConcurrentDibsPerPlayer),
              void 0 !== t.managerPositions
                ? (e.managerPositions = t.managerPositions)
                : void 0 !== t.allowedPositions &&
                  (e.allowedPositions = t.allowedPositions),
              e
            );
          }
          static handleHttpError(t, e, n = !1) {
            if (t instanceof St) {
              if (
                ((this.lastError = (function (t) {
                  if ("max_concurrent_dibs_reached" === t.code) {
                    const e = xt(t.data) ? t.data : {},
                      n = Ct(e.maxConcurrentDibsPerPlayer),
                      s = Ct(e.currentDibs);
                    return `Max concurrent dibs reached${null !== n && null !== s ? ` (${s}/${n})` : ""}. Cancel an existing dib first.`;
                  }
                  return `${t.code}: ${t.message}`;
                })(t)),
                xt(t.data))
              ) {
                const e = It(t.data.dib);
                e && this.dibs.set(e.targetId, e);
              }
              if (e) {
                if (401 === t.status && n)
                  return (
                    this.setDisconnectedState("disabled", this.lastError),
                    this.lastError
                  );
                this.status = "error";
              }
            } else
              ((this.lastError =
                t instanceof Error ? t.message : "Dibs request failed"),
                e && (this.status = "error"));
            return (
              this.emit(),
              e && "disabled" !== this.status && this.scheduleReconnect(),
              this.lastError || "Dibs request failed"
            );
          }
          static setTargetActionError(t, e) {
            if (!e) return;
            (this.clearTargetActionError(t, !1),
              this.targetActionErrors.set(t, e),
              this.renderTarget(t));
            const n = window.setTimeout(() => {
              (this.targetActionErrorTimers.delete(t),
                this.targetActionErrors.delete(t),
                this.renderTarget(t));
            }, 5e3);
            this.targetActionErrorTimers.set(t, n);
          }
          static clearTargetActionError(t, e = !0) {
            const n = this.targetActionErrorTimers.get(t);
            void 0 !== n &&
              (window.clearTimeout(n), this.targetActionErrorTimers.delete(t));
            this.targetActionErrors.delete(t) && e && this.renderTarget(t);
          }
          static clearTargetActionErrors() {
            (this.targetActionErrorTimers.forEach((t) =>
              window.clearTimeout(t),
            ),
              this.targetActionErrorTimers.clear(),
              this.targetActionErrors.clear());
          }
          static clearPendingRequest(t) {
            const e = this.pendingRequests.get(t);
            e &&
              (this.pendingRequests.delete(t), this.renderTarget(e.targetId));
          }
          static clearPendingByTarget(t) {
            const e = [];
            (this.pendingRequests.forEach((n, s) => {
              n.targetId === t && e.push(s);
            }),
              e.forEach((t) => this.pendingRequests.delete(t)),
              this.renderTarget(t));
          }
          static clearPendingRequests() {
            const t = new Set();
            (this.pendingRequests.forEach((e) => t.add(e.targetId)),
              this.pendingRequests.clear(),
              t.forEach((t) => this.renderTarget(t)));
          }
          static cleanupExpiredDibs(t) {
            let e = !1;
            return (
              this.dibs.forEach((t, n) => {
                this.isExpired(t) && (this.dibs.delete(n), (e = !0));
              }),
              e && t && this.emit(),
              e
            );
          }
          static isExpired(t) {
            return null !== t.expiresAt && t.expiresAt <= a();
          }
          static isLongDib(t) {
            if (null === t.expiresAt) return !0;
            const e = this.config?.defaultExpirySeconds;
            return !(!e || !t.updatedAt) && t.expiresAt - t.updatedAt > e + 60;
          }
          static shouldShowShortDibTimer(t) {
            return (
              null !== t.expiresAt && !this.isExpired(t) && !this.isLongDib(t)
            );
          }
          static getShortDibTimerLabel(t) {
            return this.shouldShowShortDibTimer(t) && null !== t.expiresAt
              ? (function (t) {
                  const e = Ut(t);
                  return e > 99 ? "99+" : String(e);
                })(t.expiresAt)
              : null;
          }
          static hasVisibleShortDibTimer() {
            let t = !1;
            return (
              this.nodes.forEach((e, n) => {
                const s = this.dibs.get(n);
                s &&
                  this.shouldShowShortDibTimer(s) &&
                  (e.forEach((n) => {
                    n.isConnected ? n.hidden || (t = !0) : e.delete(n);
                  }),
                  0 === e.size && this.nodes.delete(n));
              }),
              t
            );
          }
          static syncShortDibTimerUpdateTimer() {
            !document.hidden && this.hasVisibleShortDibTimer()
              ? null === this.shortDibTimerUpdateTimer &&
                (this.shortDibTimerUpdateTimer = window.setTimeout(() => {
                  ((this.shortDibTimerUpdateTimer = null),
                    this.updateShortDibTimers());
                }, this.getShortDibTimerUpdateDelay()))
              : this.clearShortDibTimerUpdateTimer();
          }
          static clearShortDibTimerUpdateTimer() {
            null !== this.shortDibTimerUpdateTimer &&
              (window.clearTimeout(this.shortDibTimerUpdateTimer),
              (this.shortDibTimerUpdateTimer = null));
          }
          static getShortDibTimerUpdateDelay() {
            const t = 1e3 - (r() % 1e3);
            let e = Number.POSITIVE_INFINITY;
            return (
              this.nodes.forEach((n, s) => {
                const i = this.dibs.get(s);
                if (
                  !i ||
                  !this.shouldShowShortDibTimer(i) ||
                  null === i.expiresAt
                )
                  return;
                if (!Array.from(n).some((t) => t.isConnected && !t.hidden))
                  return;
                const r = Ut(i.expiresAt),
                  a = r <= 99 ? t + 20 : 1e3 * (r - 99) + 20;
                e = Math.min(e, a);
              }),
              Number.isFinite(e) ? Math.max(50, e) : Math.max(50, t + 20)
            );
          }
          static updateShortDibTimers() {
            if (document.hidden)
              return void this.clearShortDibTimerUpdateTimer();
            if (this.cleanupExpiredDibs(!1)) return void this.emit();
            let t = !1;
            (this.nodes.forEach((e, n) => {
              const s = this.dibs.get(n);
              s &&
                this.shouldShowShortDibTimer(s) &&
                (e.forEach((s) => {
                  s.isConnected
                    ? ((t = !0), this.renderNode(n, s))
                    : e.delete(s);
                }),
                0 === e.size && this.nodes.delete(n));
            }),
              t
                ? this.syncShortDibTimerUpdateTimer()
                : this.clearShortDibTimerUpdateTimer());
          }
          static getFiniteDibSeconds(t) {
            return "long" in t && !0 === t.long
              ? null
              : (this.config?.defaultExpirySeconds ?? null);
          }
          static getShortDibBlockReason(t, e) {
            const n = this.getFiniteDibSeconds(e);
            if (null === n || n <= 0) return null;
            const s = O.getUserStatus(t);
            if (!s || "Hospital" !== s.status) return null;
            const i = s.updateAt - a();
            return i <= n
              ? null
              : `Target is hospitalized for ${Rt(i)}, longer than the short dib (${Rt(n)}). Use a long dib instead.`;
          }
          static emit() {
            (this.renderAll(), this.updateSetupForm());
            const t = {
              status: this.status,
              identity: this.identity,
              config: this.config,
              dibs: Array.from(this.dibs.values()),
              error: this.lastError,
            };
            this.listeners.forEach((e) => e(t));
          }
          static renderAll() {
            (this.nodes.forEach((t, e) => {
              (t.forEach((n) => {
                n.isConnected ? this.renderNode(e, n) : t.delete(n);
              }),
                0 === t.size && this.nodes.delete(e));
            }),
              this.syncShortDibTimerUpdateTimer());
          }
          static renderTarget(t) {
            const e = this.nodes.get(t);
            e
              ? (e.forEach((e) => this.renderNode(t, e)),
                this.syncShortDibTimerUpdateTimer())
              : this.syncShortDibTimerUpdateTimer();
          }
          static getFactionMembers(t = !1) {
            const e = Date.now();
            if (!t && this.memberCache && e - this.memberCacheAt < 3e4)
              return this.memberCache;
            const n = new Set(),
              s = [],
              i = Array.from(
                document.querySelectorAll(".members-list > li.your"),
              );
            for (const t of i) {
              const e = t.querySelector("a[href*='profiles.php?XID=']");
              if (!(e instanceof HTMLAnchorElement)) continue;
              const i = e.href.match(/[?&]XID=(\d+)/i),
                r = i ? Number(i[1]) : 0;
              if (!Number.isSafeInteger(r) || r <= 0 || n.has(r)) continue;
              const a = e.querySelector(".honor-text:last-child"),
                o = (
                  (a instanceof HTMLElement ? a.innerText : "") ||
                  e.textContent ||
                  String(r)
                ).trim(),
                l = this.getFactionMemberOnlineStatus(r, t),
                c = this.getMemberStatusRank(l);
              (s.push({
                id: r,
                name: o || String(r),
                status: l,
                statusRank: c,
                searchText: `${r} ${o} ${l}`.toLowerCase(),
              }),
                n.add(r));
            }
            return (
              s.sort((t, e) => {
                if (t.statusRank !== e.statusRank)
                  return t.statusRank - e.statusRank;
                const n = t.name.localeCompare(e.name, void 0, {
                  sensitivity: "base",
                });
                return 0 !== n ? n : t.id - e.id;
              }),
              (this.memberCache = s),
              (this.memberCacheAt = e),
              s
            );
          }
          static getFactionMemberOnlineStatus(t, e) {
            const n = this.normalizeMemberOnlineStatus(
              O.getUserStatus(t)?.onlineStatus,
            );
            if (n) return this.formatMemberOnlineStatus(n);
            const s = e.querySelector("[class*='userStatusWrap__']"),
              i = s?.querySelector("img"),
              r = [
                s?.getAttribute("aria-label"),
                s?.getAttribute("title"),
                s?.className,
                i instanceof HTMLImageElement ? i.alt : "",
                i instanceof HTMLImageElement ? i.title : "",
                i instanceof HTMLImageElement ? i.src : "",
                i instanceof HTMLImageElement ? i.className : "",
              ];
            for (const t of r) {
              const e = this.normalizeMemberOnlineStatus(t);
              if (e) return this.formatMemberOnlineStatus(e);
            }
            return "Unknown";
          }
          static normalizeMemberOnlineStatus(t) {
            if ("string" != typeof t) return null;
            const e = t.trim().toLowerCase();
            return e.includes("offline")
              ? "offline"
              : e.includes("idle")
                ? "idle"
                : e.includes("online")
                  ? "online"
                  : null;
          }
          static formatMemberOnlineStatus(t) {
            return t.charAt(0).toUpperCase() + t.slice(1);
          }
          static getMemberStatusRank(t) {
            switch (t.trim().toLowerCase()) {
              case "online":
                return 0;
              case "idle":
                return 1;
              case "offline":
                return 2;
              default:
                return 3;
            }
          }
          static getMemberStatusClass(t) {
            const e = t.trim().toLowerCase();
            return "online" === e || "idle" === e || "offline" === e ? e : "";
          }
          static openContextMenu(t, e, n) {
            if (
              (this.closeContextMenu(),
              !document.body || "disabled" === this.status)
            )
              return;
            const s = document.createElement("div");
            ((s.className = "__warhelper_dibs_menu"),
              this.renderContextMenu(s, t),
              document.body.appendChild(s),
              this.positionContextMenu(s, e, n));
            const i = (t) => {
                s.contains(t.target) || this.closeContextMenu();
              },
              r = (t) => {
                "Escape" === t.key && this.closeContextMenu();
              };
            (window.setTimeout(() => {
              (document.addEventListener("click", i),
                document.addEventListener("contextmenu", i),
                document.addEventListener("keydown", r));
            }, 0),
              (this.contextMenu = s),
              (this.contextMenuCleanup = () => {
                (document.removeEventListener("click", i),
                  document.removeEventListener("contextmenu", i),
                  document.removeEventListener("keydown", r));
              }));
          }
          static renderContextMenu(t, e) {
            ((t.innerHTML = ""), t.classList.remove("picker"));
            const n = this.getContextMenuItems(e);
            for (const e of n) this.appendContextMenuItem(t, e);
          }
          static appendContextMenuItem(t, e) {
            if (e.separator) {
              const e = document.createElement("div");
              return (
                (e.className = "__warhelper_dibs_menu_separator"),
                void t.appendChild(e)
              );
            }
            const n = document.createElement("button");
            ((n.type = "button"),
              (n.textContent = e.label || ""),
              (n.disabled = !0 === e.disabled || !e.action),
              e.action &&
                n.addEventListener("click", (n) => {
                  (n.preventDefault(),
                    n.stopPropagation(),
                    e.keepOpen || this.closeContextMenu(),
                    e.action?.(t));
                }),
              t.appendChild(n));
          }
          static positionContextMenu(t, e, n) {
            const s = t.getBoundingClientRect(),
              i = Math.min(e, window.innerWidth - s.width - 4),
              r = Math.min(n, window.innerHeight - s.height - 4);
            ((t.style.left = `${Math.max(4, i)}px`),
              (t.style.top = `${Math.max(4, r)}px`));
          }
          static constrainContextMenu(t) {
            const e = t.getBoundingClientRect(),
              n = Math.min(e.left, window.innerWidth - e.width - 4),
              s = Math.min(e.top, window.innerHeight - e.height - 4);
            ((t.style.left = `${Math.max(4, n)}px`),
              (t.style.top = `${Math.max(4, s)}px`));
          }
          static closeContextMenu() {
            (this.contextMenuCleanup?.(),
              (this.contextMenuCleanup = null),
              this.contextMenu?.parentNode &&
                this.contextMenu.parentNode.removeChild(this.contextMenu),
              (this.contextMenu = null));
          }
          static getContextMenuItems(t) {
            const e = Array.from(this.pendingRequests.values()).find(
              (e) => e.targetId === t,
            );
            if (e)
              return [
                {
                  label:
                    "dib" === e.action
                      ? "Dib request pending"
                      : "Cancel request pending",
                  disabled: !0,
                },
              ];
            if ("connected" !== this.status)
              return [
                { label: this.lastError || "Dibs connecting", disabled: !0 },
              ];
            const n = this.get(t),
              s = !0 === this.identity?.canManageOtherDibs,
              i = !0 === this.identity?.canSetup,
              r = !0 === this.config?.allowLongDibs,
              a = s && (r || i),
              o = this.getShortDibBlockReason(t, {}),
              l = this.targetActionErrors.get(t);
            if (n) {
              const e = this.identity?.playerId === n.player.id,
                i = this.isLongDib(n) ? "long dib" : "dib",
                r = [
                  {
                    label: `${e ? `Your ${i}` : `Dibbed by ${n.player.name}`} (${Lt(n.expiresAt)})`,
                    disabled: !0,
                  },
                ];
              return (
                (e || s) &&
                  r.push({
                    label: e ? "Cancel my dib" : "Cancel dib",
                    action: () => this.cancel(t),
                  }),
                e ||
                  s ||
                  r.push({ label: "Cannot cancel other dibs", disabled: !0 }),
                r
              );
            }
            const c = [
              o
                ? { label: "Short dib too short", disabled: !0 }
                : { label: "Short dib", action: () => this.dib(t) },
            ];
            return (
              l && c.unshift({ label: l, disabled: !0 }, { separator: !0 }),
              r &&
                c.push({
                  label: "Long dib",
                  action: () => this.dib(t, { long: !0 }),
                }),
              s &&
                c.push(
                  { separator: !0 },
                  o
                    ? { label: "Short dib for member too short", disabled: !0 }
                    : {
                        label: "Short dib for member...",
                        keepOpen: !0,
                        action: (e) => this.renderMemberPicker(e, t, !1),
                      },
                  a
                    ? {
                        label: "Long dib for member...",
                        keepOpen: !0,
                        action: (e) => this.renderMemberPicker(e, t, !0),
                      }
                    : { label: "Long dib for member disabled", disabled: !0 },
                ),
              c
            );
          }
          static renderMemberPicker(t, e, n) {
            const s = this.getFactionMembers(!0);
            ((t.innerHTML = ""), t.classList.add("picker"));
            const i = document.createElement("div");
            i.className = "__warhelper_dibs_member_header";
            const r = document.createElement("button");
            ((r.type = "button"),
              (r.textContent = "< Back"),
              r.addEventListener("click", (n) => {
                (n.preventDefault(),
                  n.stopPropagation(),
                  this.renderContextMenu(t, e),
                  this.constrainContextMenu(t));
              }),
              i.appendChild(r));
            const a = document.createElement("div");
            ((a.className = "__warhelper_dibs_member_title"),
              (a.textContent = n
                ? "Long dib for member"
                : "Short dib for member"),
              i.appendChild(a),
              t.appendChild(i));
            const o = document.createElement("input");
            ((o.type = "text"),
              (o.className = "__warhelper_dibs_member_filter"),
              (o.placeholder = "Filter members..."),
              t.appendChild(o));
            const l = document.createElement("div");
            ((l.className = "__warhelper_dibs_member_list"), t.appendChild(l));
            let c = [];
            const h = (t) => {
                (this.closeContextMenu(),
                  this.dib(e, {
                    forPlayerId: t.id,
                    ...(n ? { long: !0 } : {}),
                  }));
              },
              d = () => {
                const e = o.value.trim().toLowerCase();
                if (
                  ((c = e
                    ? s.filter((t) => -1 !== t.searchText.indexOf(e))
                    : s),
                  (l.innerHTML = ""),
                  0 === c.length)
                ) {
                  const e = document.createElement("button");
                  return (
                    (e.type = "button"),
                    (e.disabled = !0),
                    (e.textContent =
                      0 === s.length
                        ? "No members found"
                        : "No matching members"),
                    l.appendChild(e),
                    void this.constrainContextMenu(t)
                  );
                }
                for (const t of c) {
                  const e = document.createElement("button");
                  ((e.type = "button"),
                    (e.className = "__warhelper_dibs_member_option"),
                    (e.title = `${t.name} [${t.id}] - ${t.status}`),
                    e.addEventListener("click", (e) => {
                      (e.preventDefault(), e.stopPropagation(), h(t));
                    }));
                  const n = document.createElement("span");
                  ((n.className = "__warhelper_dibs_member_name"),
                    (n.textContent = t.name),
                    e.appendChild(n));
                  const s = document.createElement("span");
                  s.className = "__warhelper_dibs_member_status";
                  const i = this.getMemberStatusClass(t.status);
                  (i && s.classList.add(i),
                    (s.textContent = t.status),
                    e.appendChild(s),
                    l.appendChild(e));
                }
                this.constrainContextMenu(t);
              };
            (o.addEventListener("input", d),
              o.addEventListener("keydown", (t) => {
                "Enter" === t.key && c[0] && (t.preventDefault(), h(c[0]));
              }),
              d(),
              window.setTimeout(() => {
                (o.focus(), this.constrainContextMenu(t));
              }, 0));
          }
          static bindTooltip(t) {
            if ("true" === t.dataset.dibsSuppressTooltip)
              return void this.clearTooltip(t);
            const e = this.tooltipBindings.get(t);
            if (e)
              return (
                e.update(this.getTooltipOptions(t)),
                t.removeAttribute("title"),
                void t.removeAttribute("data-original-title")
              );
            const n = j.bind(t, this.getTooltipOptions(t));
            (this.tooltipBindings.set(t, n),
              t.removeAttribute("title"),
              t.removeAttribute("data-original-title"));
          }
          static getTooltipOptions(t) {
            return {
              content: () => t.dataset.dibsTooltip || "",
              placement: "element",
              className: "__warhelper_dibs_custom_tooltip",
            };
          }
          static setTooltip(t, e) {
            if ("true" === t.dataset.dibsSuppressTooltip)
              return void this.clearTooltip(t);
            ((t.dataset.dibsTooltip = e),
              t.removeAttribute("title"),
              t.removeAttribute("data-original-title"),
              e
                ? t.setAttribute("aria-label", e)
                : t.removeAttribute("aria-label"));
            let n = this.tooltipBindings.get(t);
            (n ||
              ((n = j.bind(t, this.getTooltipOptions(t))),
              this.tooltipBindings.set(t, n)),
              n.update(this.getTooltipOptions(t)));
          }
          static clearTooltip(t) {
            (delete t.dataset.dibsTooltip,
              t.removeAttribute("title"),
              t.removeAttribute("aria-label"),
              t.removeAttribute("data-original-title"),
              j.hide(t));
          }
          static setNodeContent(t, e = null) {
            const n = e ? `${vt} ${e}` : vt;
            if (
              (t.classList.toggle("timed", null !== e),
              t.dataset.dibsDisplay === n)
            )
              return;
            if (((t.dataset.dibsDisplay = n), (t.textContent = vt), null === e))
              return;
            const s = document.createElement("span");
            ((s.className = "__warhelper_dibs_timer"),
              (s.textContent = e),
              t.appendChild(s));
          }
          static renderNode(t, e) {
            e.classList.remove(
              "available",
              "mine",
              "other",
              "pending",
              "disabled",
              "error",
              "long",
              "timed",
            );
            const n = () => {
              ((e.hidden = !0),
                (e.style.display = "none"),
                this.setNodeContent(e),
                this.clearTooltip(e));
            };
            if ("disabled" === this.status || "connecting" === this.status)
              return void n();
            ((e.hidden = !1), (e.style.display = ""));
            const s = Array.from(this.pendingRequests.values()).find(
              (e) => e.targetId === t,
            );
            if (s)
              return (
                e.classList.add("pending"),
                this.setNodeContent(e),
                void this.setTooltip(
                  e,
                  "dib" === s.action
                    ? "Dib request pending"
                    : "Cancel dib request pending",
                )
              );
            const i = this.get(t);
            if (i) {
              const t = this.identity?.playerId === i.player.id,
                n = this.isLongDib(i);
              return (
                e.classList.add(t ? "mine" : "other"),
                n && e.classList.add("long"),
                this.setNodeContent(e, this.getShortDibTimerLabel(i)),
                void this.setTooltip(
                  e,
                  `${t ? "Your " + (n ? "long dib" : "dib") : `Dibbed by ${i.player.name}`} (${Lt(i.expiresAt)})${t ? ". Click to cancel." : ""}`,
                )
              );
            }
            if ("connected" === this.status) {
              const n = this.getShortDibBlockReason(t, {}),
                s = this.targetActionErrors.get(t),
                i =
                  !0 === this.config?.allowLongDibs ||
                  (!0 === this.identity?.canManageOtherDibs &&
                    !0 === this.identity?.canSetup);
              return (
                e.classList.add("available"),
                this.setNodeContent(e),
                void this.setTooltip(
                  e,
                  s ||
                    (n
                      ? `${n}${i ? " Right click for long dib." : ""}`
                      : "Click to dib"),
                )
              );
            }
            if ("error" === this.status)
              return (
                e.classList.add("error"),
                this.setNodeContent(e),
                void this.setTooltip(e, this.lastError || "Dibs disconnected")
              );
            (e.classList.add("disabled"),
              this.setNodeContent(e),
              this.setTooltip(e, "Dibs connecting"));
          }
        },
        Bt = class {
          static {
            this.pendingRequest = null;
          }
          static {
            x.onChange("torn_key", () => {
              this.pendingRequest = null;
            });
          }
          static async getUserStats() {
            if (!x.get("torn_key")) return Promise.resolve(void 0);
            const t = document.querySelector('.settings-menu a[href*="XID="]');
            if (!t) return Promise.resolve(void 0);
            const e = `user_${parseInt(t.href.replace(/[^\d]/g, ""))}`,
              n = S.get(e);
            return (
              n ||
              (null !== this.pendingRequest ||
                (this.pendingRequest = new Promise((t, n) => {
                  w({
                    section: "user",
                    endpoint: "personalstats",
                    parameters: { cat: "battle_stats" },
                  })
                    .then((s) => {
                      const i = s?.personalstats?.battle_stats;
                      i
                        ? ((i.score =
                            Math.sqrt(i.strength) +
                            Math.sqrt(i.defense) +
                            Math.sqrt(i.speed) +
                            Math.sqrt(i.dexterity)),
                          S.set(e, i, 86400),
                          t(i))
                        : n(new Error("No battle_stats found"));
                    })
                    .catch((t) => {
                      n(t);
                    })
                    .finally(() => {
                      this.pendingRequest = null;
                    });
                })),
              this.pendingRequest)
            );
          }
        };
      (class {
        static {
          this.battleStatNodes = [];
        }
        static {
          this.battleStatTooltipBindings = new WeakMap();
        }
        static {
          this.timerNodes = [];
        }
        static {
          this.battleStatsUpdateRun = 0;
        }
        static {
          this.battleStatsReloadTimer = null;
        }
        static {
          this.sortFrame = null;
        }
        static {
          this.init();
        }
        static init() {
          (m() || f()) &&
            (Nt.start(),
            G.start(),
            At.onAdd(".members-list", (t) => this.handleNode(t)),
            O.on("UserStatusChanged", () => this.scheduleSort()),
            G.onDataChange(() => this.scheduleStatusSort()),
            window.setTimeout(() => this.updateTimers(), 0),
            S.onBust(() => this.reloadBattleStats()),
            [
              "torn_key",
              "tornstats_key",
              "bsp_key",
              "ffs_key",
              "yata_key",
              "spy_source_order",
            ].forEach((t) => {
              x.onChange(t, () => this.scheduleBattleStatsReload());
            }),
            document.addEventListener("DOMContentLoaded", () => {
              ("true" == x.get("hide_faction_icon") &&
                document.body.classList.add("__warhelper_hide_fac_icon"),
                "true" == x.get("hide_whore") &&
                  document.body.classList.add("__warhelper_hide_whore"),
                "true" == x.get("ffcolor_bg") &&
                  document.body.classList.add("__warhelper_ff_bgcolor"));
            }),
            x.onChange("hide_faction_icon", (t, e) => {
              "true" == e
                ? document.body.classList.add("__warhelper_hide_fac_icon")
                : document.body.classList.remove("__warhelper_hide_fac_icon");
            }),
            x.onChange("hide_whore", (t, e) => {
              "true" == e
                ? document.body.classList.add("__warhelper_hide_whore")
                : document.body.classList.remove("__warhelper_hide_whore");
            }),
            x.onChange("ffcolor_bg", (t, e) => {
              "true" == e
                ? document.body.classList.add("__warhelper_ff_bgcolor")
                : document.body.classList.remove("__warhelper_ff_bgcolor");
            }),
            l(
              '\nbody.__warhelper_hide_fac_icon .member div[class^="factionWrap_"] {\n  display: none !important;\n}\n/*.member div[class^="factionWrap_"],\n.member div[class^="honorWrap_"] img,\n.member div[class^="honorWrap_"] .honor-text-svg {\n  display: none !important;\n}\n.member div[class^="honorWrap_"] .honor-text {\n  position: relative;\n  font-family: inherit;\n  font-size: inherit;\n  font-weight: inherit;\n  color: inherit;\n  stroke: inherit;\n}\n.member div[class^="honorWrap_"] a {\n  text-decoration: none;\n}*/\n\n.members-list > li {\n  user-select: none;\n}\n\n.members-list > li .icons {\n  overflow: hidden;\n}\n\n.member div[class^="honorWrap_"] {\n  margin: 0 !important;\n}\n\n.member {\n  overflow: hidden;\n}\n@media screen and (max-width: 784px) {\n  .member {\n    width: 100px !important;\n  }\n}\n\n.members-cont .level:not(.__warhelper) {\n  display: none !important;\n}\n\n.tt-stats-estimate {\n  display: none !important;\n}\n\n.level.__warhelper,\n.lvl.__warhelper {\n  display: block !important;\n  position: relative;\n}\n\n.level.__warhelper,\n.lvl.__warhelper {\n  width: 40px !important;\n  justify-content: right !important;\n}\n\n.__warhelper_status_icon {\n  display: inline-block;\n  margin-right: 2px;\n}\n\n.__warhelper_status_flag {\n  display: inline-block;\n  width: 14px;\n  height: 10px;\n  margin-right: 3px;\n  border: 1px solid rgba(0, 0, 0, 0.35);\n  box-sizing: border-box;\n  background-position: center;\n  background-repeat: no-repeat;\n  background-size: cover;\n  vertical-align: -1px;\n}\n\n.status:not(.__warhelper_status_multiline) {\n  white-space: nowrap;\n}\n\n.status.__warhelper_status_multiline {\n  align-content: center !important;\n  justify-content: flex-end;\n  flex-wrap: wrap;\n  column-gap: 3px;\n  row-gap: 0;\n  white-space: normal !important;\n  overflow: visible !important;\n  line-height: 13px !important;\n  min-height: 20px;\n}\n\n.status.__warhelper_status_multiline .__warhelper_status_icon,\n.status.__warhelper_status_multiline .__warhelper_status_flag {\n  margin-right: 0;\n}\n\n.status.__warhelper_status_multiline .__warhelper_status_main {\n  display: inline-flex;\n  align-items: center;\n  gap: 3px;\n  white-space: nowrap;\n  line-height: 13px;\n}\n\n.status.__warhelper_status_multiline .__warhelper_status_text {\n  display: inline-block;\n  white-space: normal;\n  overflow-wrap: anywhere;\n  line-height: 13px;\n}\n\n.status.__warhelper_status_multiline .__warhelper_status_detail {\n  flex-basis: 100%;\n  text-align: right;\n  white-space: nowrap;\n  line-height: 13px;\n}\n\n.status.__warhelper_status_multiline .__warhelper_status_detail.__warhelper_status_detail_hospital {\n  color: #d9534f !important;\n}\n\n.status.jail {\n  color: #f0ad4e !important;\n}\n\n.status.__warhelper_status_multiline .__warhelper_status_detail.__warhelper_status_detail_flight_possible {\n  color: #d6b94c !important;\n}\n\n.members-list > li.__warhelper_status_multiline_row {\n  height: auto !important;\n  min-height: 32px;\n  align-items: center;\n}\n\n.faction-info-wrap .level.__warhelper,\n.faction-info-wrap .lvl.__warhelper {\n  width: 50px !important;\n  overflow: hidden;\n}\n\n.faction-info-wrap .__warhelper_total {\n  line-height: 36px;\n}\n\n.__warhelper_tooltip {\n  font-family: monospace;\n}\n\n.__warhelper_tooltip td {\n  color: var(--default-gray-6-color);\n}\n\n.__warhelper_tooltip td:nth-child(2) {\n  padding-left: 5px;\n  text-align: right;\n}\n\n.__warhelper_fly_title {\n  text-align: center;\n  margin-bottom: 4px;\n}\n\n.__warhelper_fly_times {\n  display: grid;\n  gap: 2px;\n}\n\n.__warhelper_fly_time_row {\n  display: grid;\n  grid-template-columns: auto auto;\n  column-gap: 8px;\n  color: var(--default-gray-6-color);\n}\n\n.__warhelper_fly_time_row span:last-child {\n  text-align: right;\n  white-space: nowrap;\n}\n\nbody:not(.__warhelper_hide_whore) .__warhelper_total.str {\n  color: #CC6666;\n}\n\nbody:not(.__warhelper_hide_whore) .__warhelper_total.def {\n  color: #6699CC;\n}\n\nbody:not(.__warhelper_hide_whore) .__warhelper_total.spd {\n  color: #99CC66;\n}\n\nbody:not(.__warhelper_hide_whore) .__warhelper_total.dex {\n  color: #9966CC;\n}\n\n.__warhelper_bstype {\n  position: absolute;\n  top: 0;\n  left: 0;\n  color: #ddd;\n  text-align: center;\n  font-family: monospace;\n  font-weight: bold;\n  line-height: 14px;\n  padding-top: 1px;\n  padding-left: 1px;\n  padding-right: 10px;\n  padding-bottom: 10px;\n  background-color: #999999;\n  clip-path: polygon(0 0, 100% 0, 100% 0%, 0% 100%);\n}\n\n.__warhelper_bstype.T {\n  background-color: #663399;\n}\n\n.__warhelper_bstype.B {\n  background-color: #336699;\n}\n\n.__warhelper_bstype.Y {\n  background-color: #669966;\n}\n\n.__warhelper_bstype.YE {\n  background-color: #9c9c00;\n}\n\n.__warhelper_bstype.F {\n  background-color: #a65e2e;\n}\n\n.__warhelper_compare {\n  position: absolute;\n  bottom: 0;\n  left: 0;\n  right: 0;\n  height: 3px;\n  background: linear-gradient(to right, var(--color) var(--fill), transparent var(--fill));\n}\n\nbody.__warhelper_ff_bgcolor .__warhelper.bs:has(.__warhelper_compare.r) {\n  color: #000;\n  background-color: #D44A4A;\n}\n.__warhelper_compare.r {\n  --color: #D44A4A;\n}\nbody.__warhelper_ff_bgcolor .__warhelper.bs:has(.__warhelper_compare.y) {\n  color: #000;\n  background-color: #F1C232;\n}\n.__warhelper_compare.y {\n  --color: #F1C232;\n}\nbody.__warhelper_ff_bgcolor .__warhelper.bs:has(.__warhelper_compare.g) {\n  color: #000;\n  background-color: #5CB85C;\n}\n.__warhelper_compare.g {\n  --color: #5CB85C;\n}\nbody.__warhelper_ff_bgcolor .__warhelper.bs:has(.__warhelper_compare.w) {\n  color: #000;\n  background-color: #F8F9FA;\n}\n.__warhelper_compare.w {\n  --color: #F8F9FA;\n}\n\ndiv[class^="sortIcon__"] {\n  display: none !important;\n}\n\n.__warhelper_sort {\n  overflow: visible !important;\n}\n\n.__warhelper_sort.asc div[class^="sortIcon__"],\n.__warhelper_sort.desc div[class^="sortIcon__"] {\n  display: block !important;\n  border: none !important;\n}\n\n.__warhelper_sort.asc div[class^="sortIcon__"]:after {\n  border-top: none !important;\n  border-bottom: 5px solid black !important;\n}\n.__warhelper_sort.desc div[class^="sortIcon__"]:after {\n  top: 0px !important;\n  border-top: 5px solid black !important;\n  border-bottom: none !important;\n}\n\n.__warhelper_favorite {\n  cursor: pointer;\n}\n\n.__warhelper_favorite_icon {\n  position: relative;\n  display: inline-block;\n  line-height: 0;\n  vertical-align: middle;\n  isolation: isolate;\n}\n\n.__warhelper_favorite_icon::before {\n  content: "";\n  position: absolute;\n  left: 50%;\n  top: 50%;\n  z-index: 0;\n  width: 25px;\n  height: 25px;\n  pointer-events: none;\n  opacity: 0;\n  transform: translate(-50%, -50%) scale(0.82) rotate(-18deg);\n  transition: opacity 120ms ease, transform 120ms ease;\n  background: linear-gradient(135deg, #ffe27a 0%, #daa520 55%, #9b6b0d 100%);\n  clip-path: polygon(50% 0%, 61% 34%, 98% 34%, 68% 55%, 79% 91%, 50% 70%, 21% 91%, 32% 55%, 2% 34%, 39% 34%);\n  filter: drop-shadow(0 0 3px rgba(218, 165, 32, 0.8));\n}\n\n.__warhelper_favorite_icon > img {\n  display: block;\n  position: relative;\n  z-index: 1;\n}\n\n.__warhelper_favorite.active .__warhelper_favorite_icon::before {\n  opacity: 1;\n  transform: translate(-50%, -50%) scale(1) rotate(-18deg);\n}\n\n.__warhelper_favorite.active .__warhelper_favorite_icon > img {\n  filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.55));\n}\n\n@media (hover: hover) and (pointer: fine) {\n  .__warhelper_favorite:hover .__warhelper_favorite_icon::before {\n    opacity: 1;\n    transform: translate(-50%, -50%) scale(1) rotate(-18deg);\n  }\n\n  .__warhelper_favorite:hover .__warhelper_favorite_icon > img {\n    filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.55));\n  }\n}\n\n.__warhelper_bs_loading {\n  width: 100%;\n  height: 100%;\n  background-image: url("data:image/png;base64,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");\n  background-size: contain;\n  background-repeat: no-repeat;\n  background-position: center;\n}\n\n.\n',
            ));
        }
        static {
          this.sortFields = [
            "id",
            "member",
            "members",
            "bs",
            "points",
            "status",
          ];
        }
        static overwriteSort(t) {
          if (!t.parentNode) return;
          const e = this.getFactionId(t.parentNode),
            n = S.get(`faction_sorting_${e}`),
            s = this.sortFields[~~n?.field || 1] || "bs";
          Array.from(
            t.parentNode.querySelectorAll(
              this.sortFields
                .map(
                  (t) =>
                    `.members-cont > div > .${t}, .f-war-list > ul > .${t}`,
                )
                .join(","),
            ),
          ).forEach((t) => {
            (t.classList.add("__warhelper_sort"),
              t.addEventListener("click", (e) => {
                (e.stopImmediatePropagation(), this.sort(t));
              }),
              t.classList.contains(s) &&
                (t.classList.add(n?.asc ? "asc" : "desc"), this.sort(t, !0)));
          });
        }
        static sort(t = null, e = !1) {
          if (null === t)
            return void Array.from(
              document.querySelectorAll(
                ".__warhelper_sort.asc, .__warhelper_sort.desc",
              ),
            ).forEach((t) => this.sort(t, !0));
          if (null == t.parentNode) return;
          if (null == t.parentNode.parentNode) return;
          if (!e) {
            const e = t.classList.contains("asc");
            (t.parentNode.querySelectorAll(".asc, .desc").forEach((t) => {
              (t.classList.remove("asc"), t.classList.remove("desc"));
            }),
              e ? t.classList.add("desc") : t.classList.add("asc"));
          }
          const n = this.getFactionId(t.parentNode.parentNode),
            s = this.sortFields.findIndex((e) => t.classList.contains(e)),
            i = 1 == t.classList.contains("asc");
          S.set(`faction_sorting_${n}`, { field: s, asc: i });
          const r = t.parentNode.parentNode.querySelector(
            "ul.members-list, ul.table-body",
          );
          if (null == r) return;
          const a = Array.from(r.childNodes);
          (a.sort((t, e) => {
            const n = null !== t.querySelector("[class*='total__']"),
              r = null !== e.querySelector("[class*='total__']");
            if (n) return 1;
            if (r) return -1;
            const a = null !== t.querySelector(".__warhelper_favorite.active"),
              o = null !== e.querySelector(".__warhelper_favorite.active");
            if (a && !o) return -1;
            if (!a && o) return 1;
            const l = this.getUserName(t),
              c = this.getUserName(e),
              h = (n = !0) => {
                const s = l.localeCompare(c, void 0, { sensitivity: "base" });
                return 0 != s
                  ? n
                    ? s
                    : -s
                  : this.getUserId(t) - this.getUserId(e);
              };
            switch (s) {
              case 0: {
                const n = parseFloat(
                    t.querySelector(".id")?.innerHTML.replaceAll("#", "") || "",
                  ),
                  s = parseFloat(
                    e.querySelector(".id")?.innerHTML.replaceAll("#", "") || "",
                  );
                return n == s ? h() : i ? n - s : s - n;
              }
              case 1:
              case 2:
                return h(i);
              case 3: {
                const n = parseFloat(t.querySelector(".bs")?.dataset.bs || ""),
                  s = parseFloat(e.querySelector(".bs")?.dataset.bs || "");
                return n == s ? h() : i ? n - s : s - n;
              }
              case 4: {
                const n = parseFloat(
                    t.querySelector(".points")?.innerHTML.replaceAll(",", "") ||
                      "",
                  ),
                  s = parseFloat(
                    e.querySelector(".points")?.innerHTML.replaceAll(",", "") ||
                      "",
                  );
                return n == s ? h() : i ? n - s : s - n;
              }
              case 5: {
                let n = function (t) {
                    return "Hospital" == t.status
                      ? i
                        ? 2
                        : 1
                      : "Jail" == t.status
                        ? 3
                        : "Traveling" == t.status
                          ? 4
                          : i
                            ? 1
                            : 2;
                  },
                  s = function (t, e) {
                    return "Traveling" != e.status
                      ? e.updateAt
                      : G.getFlightArrivalTimestamp(t) || e.updateAt;
                  },
                  r = function (t, e) {
                    if ("Traveling" != e.status) return 0;
                    const n = G.getFlightArrivalPhase(t);
                    return "possible" == n ? 0 : "expected" == n ? 1 : 2;
                  },
                  a = function (t, e) {
                    if (!e) return [0, 0, "", 0, 0, 0];
                    const i = 1 == (a = e.area) ? "Torn" : v[a]?.name || "";
                    var a;
                    if ("Traveling" == e.status || 1 != e.area) {
                      const a = p && void 0 !== o && e.area == o.area;
                      return [a ? g : m, a ? 0 : 1, i, n(e), r(t, e), s(t, e)];
                    }
                    return "Hospital" == e.status
                      ? [b, 0, "", 0, 0, e.updateAt]
                      : "Jail" == e.status
                        ? [w, 0, "", 0, 0, e.updateAt]
                        : [_, 0, "", 0, 0, 0];
                  };
                if (f()) {
                  const n = parseFloat(
                      t
                        .querySelector(".status")
                        ?.innerHTML.replaceAll(",", "") || "",
                    ),
                    s = parseFloat(
                      e
                        .querySelector(".status")
                        ?.innerHTML.replaceAll(",", "") || "",
                    );
                  return n == s ? h() : i ? n - s : s - n;
                }
                const o = O.getCurrentUserStatus(),
                  l = O.getUserStatus(this.getUserId(t)),
                  c = O.getUserStatus(this.getUserId(e)),
                  u =
                    ((d = o),
                    Boolean(
                      d &&
                      ("Traveling" == d.status ||
                        (1 !== d.area &&
                          ("Abroad" == d.status || "Hospital" == d.status))),
                    )),
                  p = u && !("Traveling" == o?.status && 1 == o.area),
                  g = u ? 1 : 4,
                  m = u ? 5 : 4,
                  _ = u ? (i ? 2 : 4) : i ? 1 : 3,
                  w = u ? 3 : 2,
                  b = u ? (i ? 4 : 2) : i ? 3 : 1,
                  [A, y, S, x, C, k] = a(this.getUserId(t), l),
                  [E, T, M, F, I, D] = a(this.getUserId(e), c);
                if (A != E) return A - E;
                if (y != T) return y - T;
                if (S != M) {
                  if ("Torn" == S) return -1;
                  if ("Torn" == M) return 1;
                  const t = S.localeCompare(M, void 0, { sensitivity: "base" });
                  return i ? t : -t;
                }
                return x != F
                  ? x - F
                  : C != I
                    ? i
                      ? C - I
                      : I - C
                    : k != D
                      ? i
                        ? k - D
                        : D - k
                      : h();
              }
            }
            var d;
            return 0;
          }),
            a.forEach((t) => r.appendChild(t)));
        }
        static scheduleSort() {
          null === this.sortFrame &&
            (this.sortFrame = requestAnimationFrame(() => {
              ((this.sortFrame = null), this.sort());
            }));
        }
        static scheduleStatusSort() {
          document.querySelector(
            ".__warhelper_sort.status.asc, .__warhelper_sort.status.desc",
          ) && this.scheduleSort();
        }
        static handleNode(t) {
          if (!t?.classList || t.classList.contains("__warhelper")) return;
          t.classList.add("__warhelper");
          const e = !t.matches(".f-war-list");
          if (e) return;
          (e ? this.injectRankedWarHtml(t) : this.injectMemberListHtml(t),
            this.overwriteSort(t));
          const n = new Set();
          let s = null;
          const i = (t) => {
            ([
              ...(t.matches(".level:not(.__warhelper), .lvl:not(.__warhelper)")
                ? [t]
                : []),
              ...Array.from(
                t.querySelectorAll(
                  ".level:not(.__warhelper), .lvl:not(.__warhelper)",
                ),
              ),
            ].forEach((t) => {
              t.nextElementSibling?.classList.contains("__warhelper") ||
                n.add(t);
            }),
              n.size &&
                null === s &&
                (s = requestAnimationFrame(() => {
                  s = null;
                  const t = Array.from(n).filter(
                    (t) =>
                      t.isConnected &&
                      !t.classList.contains("__warhelper") &&
                      !t.nextElementSibling?.classList.contains("__warhelper"),
                  );
                  (n.clear(), this.injectCells(t));
                })));
          };
          new MutationObserver((t) => {
            t.forEach((t) => {
              t.addedNodes.forEach((t) => {
                t instanceof HTMLElement && i(t);
              });
            });
          }).observe(t, { subtree: !0, childList: !0 });
        }
        static getId(t, e, n) {
          const s = t.querySelector(e) || t.parentNode?.querySelector(e);
          if (!(s && s instanceof HTMLAnchorElement)) return 0;
          const i = s.href.match(n);
          return i?.[1] ? parseInt(i[1]) : 0;
        }
        static getUserId(t) {
          return this.getId(t, 'a[href*="XID"]', /.*?XID=(\d+)/i);
        }
        static getUserName(t) {
          const e = t.querySelector(
            'a[href*="profiles.php?XID="], a[href*="XID="]',
          );
          if (e instanceof HTMLElement) {
            const t = e.querySelector(".honor-text:last-child"),
              n = t instanceof HTMLElement ? t.innerText : t?.textContent;
            if (n?.trim()) return n.trim();
            const s = e.innerText || e.textContent || "";
            if (s.trim()) return s.trim();
          }
          const n = t.querySelector(".honor-text:last-child"),
            s = n instanceof HTMLElement ? n.innerText : n?.textContent;
          return s?.trim() || "";
        }
        static getFactionId(t) {
          return this.getId(t, 'a[href*="factions.php"]', /.*?ID=(\d+)/i);
        }
        static injectHeader(t) {
          t.firstChild && (t.firstChild.textContent = "Lv");
          const e = t.cloneNode(!0);
          (e.classList.add("__warhelper"),
            e.classList.add("bs"),
            e.firstChild && (e.firstChild.textContent = "BS"),
            t.parentNode && t.parentNode.insertBefore(e, t.nextSibling));
        }
        static openAttackPage(t) {
          const e = window.open(
            `page.php?sid=attack&user2ID=${t}`,
            o() ? `_warhelper_${Date.now()}` : "_warhelper",
          );
          e?.focus();
        }
        static bindStatsCellAttack(t, e) {
          let n = null,
            s = 0,
            i = 0;
          (t.addEventListener(
            "touchstart",
            (t) => {
              if (1 !== t.touches.length) return void (n = null);
              const e = t.touches[0];
              n = e ? { x: e.clientX, y: e.clientY, at: Date.now() } : null;
            },
            { passive: !0 },
          ),
            t.addEventListener("touchcancel", () => {
              n = null;
            }),
            t.addEventListener("contextmenu", () => {
              ((i = Date.now()), (n = null));
            }),
            t.addEventListener(
              "touchend",
              (t) => {
                const r = t.changedTouches[0];
                if (!n || !r) return void (n = null);
                const a = Math.hypot(r.clientX - n.x, r.clientY - n.y),
                  o = Date.now() - n.at;
                ((n = null),
                  a > 12 ||
                    o > 500 ||
                    Date.now() - i < 1e3 ||
                    (t.preventDefault(),
                    t.stopPropagation(),
                    (s = Date.now()),
                    this.openAttackPage(e)));
              },
              { passive: !1 },
            ),
            t.addEventListener("click", () => {
              Date.now() - s < 700 ||
                Date.now() - i < 1e3 ||
                this.openAttackPage(e);
            }));
        }
        static injectCells(t) {
          if (!t?.length) return;
          const e = _();
          (t.forEach((t) => {
            const n = t.parentElement;
            if (!n) return;
            const s = t.cloneNode(!0);
            (s.classList.add("__warhelper"),
              s.classList.add("bs"),
              -1 !== s.innerHTML.indexOf("--")
                ? (s.innerHTML = "--")
                : ((s.innerHTML = '<div class="__warhelper_bs_loading"></div>'),
                  (s.dataset.bs = "0")),
              n.insertBefore(s, t.nextSibling));
            const i = this.getUserId(t);
            if (!i) return;
            const r = this.getFactionId(t);
            (this.battleStatNodes.push({ userId: i, factionId: r, node: s }),
              G.trackUser(i, r),
              this.bindStatsCellAttack(s, i));
            const a = n.querySelector('div[class^="userStatusWrap__"]');
            if (!a?.parentNode) return;
            const o = S.get(`faction_favorite_${i}`) || !1,
              l = a;
            l.classList.add("__warhelper_favorite");
            const c = Array.from(l.children).find(
              (t) => t instanceof HTMLImageElement,
            );
            if (
              c &&
              !c.parentElement?.classList.contains("__warhelper_favorite_icon")
            ) {
              const t = document.createElement("span");
              ((t.className = "__warhelper_favorite_icon"),
                c.parentElement?.insertBefore(t, c),
                t.appendChild(c));
            }
            if (
              (o && l.classList.add("active"),
              l.addEventListener("click", () => {
                const t = l.classList.toggle("active");
                (S.set(`faction_favorite_${i}`, t), this.scheduleSort());
              }),
              e && String(n.className).includes("enemy"))
            ) {
              const t = document.createElement("div");
              ((t.className = "__warhelper_dibs"),
                (t.hidden = !0),
                (t.style.display = "none"),
                (t.innerHTML = vt),
                a.parentNode.appendChild(t),
                Nt.bind(i, t, n));
            }
          }),
            this.updateBattleStats());
        }
        static injectMemberListHtml(t) {
          const e = t.querySelector(".table-header .lvl");
          if (!e) return;
          this.injectHeader(e);
          const n = Array.from(t.querySelectorAll(".table-body .lvl"));
          n && this.injectCells(n);
        }
        static injectRankedWarHtml(t) {
          if (!t.parentNode) return;
          const e = t.parentNode.querySelector(".level");
          if (!e) return;
          this.injectHeader(e);
          const n = Array.from(t.querySelectorAll(".level"));
          if (!n) return;
          this.injectCells(n);
          const s = Array.from(t.querySelectorAll(".status"));
          s &&
            s.forEach((t) => {
              if ("true" === t.dataset.warhelperTimerBound) return;
              let e = this.getUserId(t);
              const n = this.getFactionId(t);
              ((t.dataset.warhelperTimerBound = "true"),
                this.timerNodes.push({ userId: e, node: t }),
                G.bindStatusNode(e, t, n));
            });
        }
        static reloadBattleStats() {
          (this.battleStatNodes.forEach((t) => {
            ((t.node.innerHTML = '<div class="__warhelper_bs_loading"></div>'),
              this.setBattleStatTooltip(t.node, ""),
              (t.node.dataset.bs = "0"));
          }),
            this.updateBattleStats());
        }
        static scheduleBattleStatsReload() {
          (null !== this.battleStatsReloadTimer &&
            window.clearTimeout(this.battleStatsReloadTimer),
            (this.battleStatsReloadTimer = window.setTimeout(() => {
              ((this.battleStatsReloadTimer = null), this.reloadBattleStats());
            }, 0)));
        }
        static async updateBattleStats() {
          const t = ++this.battleStatsUpdateRun,
            e = await Bt.getUserStats().catch(console.error);
          if (t !== this.battleStatsUpdateRun) return;
          this.battleStatNodes = this.battleStatNodes.filter(
            (t) => t.node.isConnected,
          );
          const n = this.battleStatNodes.reduce((t, e) => {
            const n = e.factionId;
            return (null == t[n] && (t[n] = []), t[n].push(e), t);
          }, {});
          for (const s in n) {
            const i = n[s];
            if (!i) continue;
            const r = Number(s);
            if (!Number.isFinite(r) || r <= 0) {
              (this.applyBattleStatUpdates(
                this.createMissingBattleStatUpdates(i),
              ),
                this.scheduleSort());
              continue;
            }
            const a = await this.withTimeout(
              pt(
                i.map((t) => t.userId),
                r,
              ).catch(console.error),
              3e4,
              `Spy lookup timed out for faction ${r}`,
            );
            if (t !== this.battleStatsUpdateRun) return;
            if (!a) {
              (this.applyBattleStatUpdates(
                this.createMissingBattleStatUpdates(i),
              ),
                this.scheduleSort());
              continue;
            }
            const o = [];
            for (const t of i) {
              let n = function (t) {
                  return t >= 5 ? "r" : t >= 4 ? "y" : t >= 3 ? "g" : "w";
                },
                s = function (t) {
                  if (t <= 1) return 5;
                  if (t >= 5) return 100;
                  if (t <= 3) {
                    return 5 + 45 * ((t - 1) / 2);
                  }
                  return 50 + 50 * ((t - 3) / 2);
                };
              const { userId: i, node: r } = t,
                l = a[i];
              if (!l || 0 == l.type) {
                o.push({ node: r, html: "N/A", tooltip: "", bs: "0" });
                continue;
              }
              let c = 0,
                h = l.fairfight || 0;
              (l.score &&
                e?.score &&
                (h =
                  Math.round(100 * (1 + (8 / 3) * (l.score / e?.score))) / 100),
                (c = Math.min(3, h)));
              let u = n(h),
                g = s(h),
                f = "";
              const m = 0.35,
                _ = [
                  l.strength || 0,
                  l.defense || 0,
                  l.speed || 0,
                  l.dexterity || 0,
                ],
                w = _.indexOf(Math.max(..._.filter((t) => t)));
              void 0 !== _[w] &&
                _[w] >= (l.total || 0) * m &&
                (f = ["str", "def", "spd", "dex"][w]);
              let b = "?",
                A = "",
                y = "?";
              switch (l.type) {
                case 1:
                  ((b = "T"), (A = "T"), (y = "TornStats"));
                  break;
                case 2:
                  ((b = "B"), (A = "B"), (y = "BSP"));
                  break;
                case 3:
                  ((b = "Y"), (A = "Y"), (y = "YATA"));
                  break;
                case 4:
                  ((b = "Y"), (A = "YE"), (y = "YATA Estimate"));
                  break;
                case 5:
                  ((b = "F"), (A = "F"), (y = "FFScouter"));
              }
              const v = `\n          <div class="__warhelper_total ${f}">${l.total ? p(l.total) : "N/A"}</div>\n          <div class="__warhelper_bstype ${A}">${b}</div>\n          ${c > 0 ? `<div class="__warhelper_compare ${u}" style="--fill: ${g}%;"></div>` : ""}\n        `,
                S = [];
              (c > 0 && S.push(`<tr><td>FF</td><td>${c.toFixed(2)}</td></tr>`),
                1 === l.type &&
                  S.push(
                    `<tr><td>Strength</td><td>${l.strength ? p(l.strength, 2) : "N/A"}</td></tr>`,
                    `<tr><td>Defense</td><td>${l.defense ? p(l.defense, 2) : "N/A"}</td></tr>`,
                    `<tr><td>Speed</td><td>${l.speed ? p(l.speed, 2) : "N/A"}</td></tr>`,
                    `<tr><td>Dexterity</td><td>${l.dexterity ? p(l.dexterity, 2) : "N/A"}</td></tr>`,
                  ),
                S.push(
                  `<tr><td>Total</td><td>${l.total ? p(l.total, 2) : "N/A"}</td></tr>`,
                  `<tr><td>Source</td><td>${y}</td></tr>`,
                  `<tr><td colspan="2">${d(l.timestamp)}</td></tr>`,
                ));
              const x = `<table class="__warhelper_tooltip">${S.join("")}</table>`;
              o.push({
                node: r,
                html: v,
                tooltip: x,
                bs: l.total?.toString() ?? "0",
              });
            }
            (this.applyBattleStatUpdates(o), this.scheduleSort());
          }
          this.scheduleSort();
        }
        static applyBattleStatUpdates(t) {
          for (const e of t)
            ((e.node.innerHTML = e.html),
              this.setBattleStatTooltip(e.node, e.tooltip.trim()),
              (e.node.dataset.bs = e.bs));
        }
        static setBattleStatTooltip(t, e) {
          if (
            (t.removeAttribute("title"),
            t.removeAttribute("data-original-title"),
            !e)
          )
            return (
              delete t.dataset.warhelperBattleStatTooltip,
              t.removeAttribute("aria-label"),
              void j.hide(t)
            );
          ((t.dataset.warhelperBattleStatTooltip = e),
            t.setAttribute("aria-label", this.stripHtml(e)));
          let n = this.battleStatTooltipBindings.get(t);
          const s = {
            content: () => t.dataset.warhelperBattleStatTooltip || "",
            html: !0,
            placement: "element",
            className: "__warhelper_battle_stat_tooltip",
          };
          if (!n)
            return (
              (n = j.bind(t, s)),
              void this.battleStatTooltipBindings.set(t, n)
            );
          n.update(s);
        }
        static stripHtml(t) {
          return t
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        }
        static createMissingBattleStatUpdates(t) {
          return t.map(({ node: t }) => ({
            node: t,
            html: "N/A",
            tooltip: "",
            bs: "0",
          }));
        }
        static withTimeout(t, e, n) {
          let s = null;
          const i = new Promise((t) => {
            s = window.setTimeout(() => {
              (console.warn(n), t(void 0));
            }, e);
          });
          return Promise.race([t, i]).finally(() => {
            null !== s && window.clearTimeout(s);
          });
        }
        static {
          this.rankedTimer = null;
        }
        static {
          this.rankedTarget = null;
        }
        static updateRankedTimeLeft() {
          if (
            ((this.rankedTimer =
              this.rankedTimer ||
              document.querySelector(
                "[class*='rankBox__'] [class*='timer__']",
              )),
            !this.rankedTimer?.innerText)
          )
            return;
          if (
            ((this.rankedTarget =
              this.rankedTarget ||
              document.querySelector(
                "[class*='rankBox__'] [class*='target__']",
              )),
            !this.rankedTarget?.innerText)
          )
            return;
          const t = this.rankedTarget?.innerText?.split(/\s/g).reverse();
          if (!t[0] || !t[2]) return;
          const e = parseInt(t[0]?.replace(/[^\d]+/g, "")),
            n = parseInt(t[2]?.replace(/[^\d]+/g, ""));
          let s = 0;
          const i = this.rankedTimer.innerText.split(":").reverse(),
            r = [1, 60, 3600, 86400];
          for (let t = 0; t < r.length && i[t]; t++)
            s += parseInt(i[t] || "0") * (r[t] || 0);
          const a = s / 3600,
            o = e / (123 - Math.floor(a)),
            l = 3600 * (Math.ceil((e - n) / o) - 1) + (3600 - (s % 3600)),
            c = new Date(Date.now() + 1e3 * l);
          (c.setHours(c.getHours(), 0, 0, 0), (window.endDate = c));
        }
        static getStatusDisplay(t, e) {
          const n = v[e.area],
            s = n?.abbr || e.status;
          if (this.isLandedTravelStatus(t, e)) {
            const t = { key: `landed:${s}:${n?.flagUrl || ""}`, text: s };
            return (n?.flagUrl && (t.flagUrl = n.flagUrl), t);
          }
          if ("Traveling" == e.status) {
            const e = G.getFlightCountdown(t),
              i = e ? u(a() + e.seconds) : void 0,
              r =
                "possible" == e?.phase
                  ? "__warhelper_status_detail_flight_possible"
                  : void 0,
              o = {
                key: `traveling:${s}:${i || ""}:${r || ""}:${n?.flagUrl || ""}`,
                text: s,
                icon: "\u2708",
              };
            return (
              i && ((o.detailText = i), r && (o.detailClass = r)),
              n?.flagUrl && (o.flagUrl = n.flagUrl),
              o
            );
          }
          if ("Abroad" == e.status) {
            const t = { key: `abroad:${s}:${n?.flagUrl || ""}`, text: s };
            return (n?.flagUrl && (t.flagUrl = n.flagUrl), t);
          }
          const i = "Hospital" == e.status || "Jail" == e.status,
            r = u(i ? e.updateAt : 0);
          if ("Hospital" == e.status && 1 != e.area) {
            const t = {
              key: `hospital-abroad:${s}:${r}:${n?.flagUrl || ""}`,
              text: s,
              detailText: r,
              detailClass: "__warhelper_status_detail_hospital",
            };
            return (n?.flagUrl && (t.flagUrl = n.flagUrl), t);
          }
          return { key: `status:${e.status}:${r}`, text: i ? r : e.status };
        }
        static isLandedTravelStatus(t, e) {
          return (
            "Traveling" == e.status &&
            1 != e.area &&
            G.hasExpiredFlightArrival(t)
          );
        }
        static isStatusRendered(t, e) {
          if (t.dataset.warhelperStatus != e.key) return !1;
          const n = t.querySelector(".__warhelper_status_text"),
            s = t.querySelector(".__warhelper_status_detail"),
            i = t.querySelector(".__warhelper_status_icon"),
            r = t.querySelector(".__warhelper_status_flag");
          return (
            n instanceof HTMLElement &&
            n.textContent == e.text &&
            (s instanceof HTMLElement ? s.textContent : void 0) ==
              e.detailText &&
            (!e.detailClass ||
              (s instanceof HTMLElement &&
                s.classList.contains(e.detailClass))) &&
            Boolean(i) == Boolean(e.icon) &&
            Boolean(r) == Boolean(e.flagUrl)
          );
        }
        static syncStatusLayout(t, e) {
          const n = Boolean(e.icon || e.flagUrl);
          (t.classList.toggle("__warhelper_status_multiline", n),
            t
              .closest("li")
              ?.classList.toggle("__warhelper_status_multiline_row", n));
        }
        static renderStatus(t, e) {
          if ((this.syncStatusLayout(t, e), this.isStatusRendered(t, e)))
            return;
          ((t.dataset.warhelperStatus = e.key), t.replaceChildren());
          const n = document.createElement("span");
          if (
            ((n.className = "__warhelper_status_main"),
            t.appendChild(n),
            e.icon)
          ) {
            const t = document.createElement("span");
            ((t.className = "__warhelper_status_icon"),
              (t.textContent = e.icon),
              n.appendChild(t));
          }
          if (e.flagUrl) {
            const t = document.createElement("span");
            ((t.className = "__warhelper_status_flag"),
              (t.style.backgroundImage = `url("${e.flagUrl}")`),
              n.appendChild(t));
          }
          const s = document.createElement("span");
          if (
            ((s.className = "__warhelper_status_text"),
            (s.textContent = e.text),
            n.appendChild(s),
            e.detailText)
          ) {
            const n = document.createElement("span");
            ((n.className = "__warhelper_status_detail"),
              e.detailClass && n.classList.add(e.detailClass),
              (n.textContent = e.detailText),
              t.appendChild(n));
          }
        }
        static updateTimers() {
          (this.updateRankedTimeLeft(),
            (this.timerNodes = this.timerNodes.filter(
              (t) => t.node.isConnected,
            )),
            this.timerNodes.forEach((t) => {
              const e = t.userId,
                n = t.node,
                s = O.getUserStatus(e);
              if (!s) return;
              const i = this.getStatusDisplay(e, s);
              this.renderStatus(n, i);
              const r = this.isLandedTravelStatus(e, s),
                a = "Okay" == i.text && !i.icon && !i.flagUrl,
                o = "Hospital" == s.status && 1 == s.area && !a,
                l = "Jail" == s.status && !a,
                c = 1 != s.area,
                h = "Traveling" == s.status && !r;
              (n.classList.toggle("hospital", o),
                n.classList.toggle("not-ok", o),
                n.classList.toggle("jail", l),
                n.classList.toggle("okay", a),
                n.classList.toggle("ok", a),
                n.classList.toggle("abroad", c),
                n.classList.toggle("traveling", h));
            }));
          const t = 1e3 - (r() % 1e3) + 25;
          window.setTimeout(() => this.updateTimers(), t);
        }
      });
      function Pt() {}
      function qt(t) {
        return t();
      }
      function Ht() {
        return Object.create(null);
      }
      function Ot(t) {
        t.forEach(qt);
      }
      function Wt(t) {
        return "function" == typeof t;
      }
      function jt(t, e) {
        return t != t
          ? e == e
          : t !== e || (t && "object" == typeof t) || "function" == typeof t;
      }
      function Vt(t) {
        return t && Wt(t.destroy) ? t.destroy : Pt;
      }
      var $t;
      "undefined" != typeof window
        ? window
        : "undefined" != typeof globalThis
          ? globalThis
          : global;
      function Kt(t, e) {
        t.appendChild(e);
      }
      function zt(t, e, n) {
        t.insertBefore(e, n || null);
      }
      function Yt(t) {
        t.parentNode && t.parentNode.removeChild(t);
      }
      function Gt(t, e) {
        for (let n = 0; n < t.length; n += 1) t[n] && t[n].d(e);
      }
      function Qt(t) {
        return document.createElement(t);
      }
      function Zt(t) {
        return document.createElementNS("http://www.w3.org/2000/svg", t);
      }
      function Jt(t) {
        return document.createTextNode(t);
      }
      function Xt() {
        return Jt(" ");
      }
      function te() {
        return Jt("");
      }
      function ee(t, e, n, s) {
        return (
          t.addEventListener(e, n, s),
          () => t.removeEventListener(e, n, s)
        );
      }
      function ne(t) {
        return function (e) {
          return (e.preventDefault(), t.call(this, e));
        };
      }
      function se(t) {
        return function (e) {
          return (e.stopPropagation(), t.call(this, e));
        };
      }
      function ie(t, e, n) {
        null == n
          ? t.removeAttribute(e)
          : t.getAttribute(e) !== n && t.setAttribute(e, n);
      }
      function re(t, e) {
        ((e = "" + e), t.data !== e && (t.data = e));
      }
      function ae(t, e, n) {
        t.classList.toggle(e, !!n);
      }
      function oe(t) {
        $t = t;
      }
      function le(t) {
        (function () {
          if (!$t)
            throw new Error("Function called outside component initialization");
          return $t;
        })().$$.on_mount.push(t);
      }
      function ce(t, e) {
        const n = t.$$.callbacks[e.type];
        n && n.slice().forEach((t) => t.call(this, e));
      }
      var he = [],
        de = [],
        ue = [],
        pe = [],
        ge = Promise.resolve(),
        fe = !1;
      function me(t) {
        ue.push(t);
      }
      var _e = new Set(),
        we = 0;
      function be() {
        if (0 !== we) return;
        const t = $t;
        do {
          try {
            for (; we < he.length; ) {
              const t = he[we];
              (we++, oe(t), Ae(t.$$));
            }
          } catch (t) {
            throw ((he.length = 0), (we = 0), t);
          }
          for (oe(null), he.length = 0, we = 0; de.length; ) de.pop()();
          for (let t = 0; t < ue.length; t += 1) {
            const e = ue[t];
            _e.has(e) || (_e.add(e), e());
          }
          ue.length = 0;
        } while (he.length);
        for (; pe.length; ) pe.pop()();
        ((fe = !1), _e.clear(), oe(t));
      }
      function Ae(t) {
        if (null !== t.fragment) {
          (t.update(), Ot(t.before_update));
          const e = t.dirty;
          ((t.dirty = [-1]),
            t.fragment && t.fragment.p(t.ctx, e),
            t.after_update.forEach(me));
        }
      }
      var ye = new Set();
      function ve(t, e) {
        t && t.i && (ye.delete(t), t.i(e));
      }
      function Se(t) {
        return void 0 !== t?.length ? t : Array.from(t);
      }
      function xe(t, e) {
        (t.d(1), e.delete(t.key));
      }
      function Ce(t, e) {
        const n = t.$$;
        null !== n.fragment &&
          (!(function (t) {
            const e = [],
              n = [];
            (ue.forEach((s) => (-1 === t.indexOf(s) ? e.push(s) : n.push(s))),
              n.forEach((t) => t()),
              (ue = e));
          })(n.after_update),
          Ot(n.on_destroy),
          n.fragment && n.fragment.d(e),
          (n.on_destroy = n.fragment = null),
          (n.ctx = []));
      }
      function ke(t, e) {
        (-1 === t.$$.dirty[0] &&
          (he.push(t), fe || ((fe = !0), ge.then(be)), t.$$.dirty.fill(0)),
          (t.$$.dirty[(e / 31) | 0] |= 1 << (e % 31)));
      }
      function Ee(t, e, n, s, i, r, a = null, o = [-1]) {
        const l = $t;
        oe(t);
        const c = (t.$$ = {
          fragment: null,
          ctx: [],
          props: r,
          update: Pt,
          not_equal: i,
          bound: Ht(),
          on_mount: [],
          on_destroy: [],
          on_disconnect: [],
          before_update: [],
          after_update: [],
          context: new Map(e.context || (l ? l.$$.context : [])),
          callbacks: Ht(),
          dirty: o,
          skip_bound: !1,
          root: e.target || l.$$.root,
        });
        a && a(c.root);
        let h = !1;
        if (
          ((c.ctx = n
            ? n(t, e.props || {}, (e, n, ...s) => {
                const r = s.length ? s[0] : n;
                return (
                  c.ctx &&
                    i(c.ctx[e], (c.ctx[e] = r)) &&
                    (!c.skip_bound && c.bound[e] && c.bound[e](r),
                    h && ke(t, e)),
                  n
                );
              })
            : []),
          c.update(),
          (h = !0),
          Ot(c.before_update),
          (c.fragment = !!s && s(c.ctx)),
          e.target)
        ) {
          if (e.hydrate) {
            0;
            const t = ((d = e.target), Array.from(d.childNodes));
            (c.fragment && c.fragment.l(t), t.forEach(Yt));
          } else c.fragment && c.fragment.c();
          (e.intro && ve(t.$$.fragment),
            (function (t, e, n) {
              const { fragment: s, after_update: i } = t.$$;
              (s && s.m(e, n),
                me(() => {
                  const e = t.$$.on_mount.map(qt).filter(Wt);
                  (t.$$.on_destroy ? t.$$.on_destroy.push(...e) : Ot(e),
                    (t.$$.on_mount = []));
                }),
                i.forEach(me));
            })(t, e.target, e.anchor),
            be());
        }
        var d;
        oe(l);
      }
      function Te(t, e, n, s) {
        const i = n[t]?.type;
        if (!s || !n[t]) return e;
        if ("toAttribute" === s)
          switch (i) {
            case "Object":
            case "Array":
              return null == e ? null : JSON.stringify(e);
            case "Boolean":
              return e ? "" : null;
            case "Number":
              return null == e ? null : e;
            default:
              return e;
          }
        else
          switch (i) {
            case "Object":
            case "Array":
              return e && JSON.parse(e);
            case "Boolean":
            default:
              return e;
            case "Number":
              return null != e ? +e : e;
          }
      }
      "function" == typeof HTMLElement && HTMLElement;
      var Me = class {
        $$ = void 0;
        $$set = void 0;
        $destroy() {
          (Ce(this, 1), (this.$destroy = Pt));
        }
        $on(t, e) {
          if (!Wt(e)) return Pt;
          const n = this.$$.callbacks[t] || (this.$$.callbacks[t] = []);
          return (
            n.push(e),
            () => {
              const t = n.indexOf(e);
              -1 !== t && n.splice(t, 1);
            }
          );
        }
        $set(t) {
          var e;
          this.$$set &&
            ((e = t), 0 !== Object.keys(e).length) &&
            ((this.$$.skip_bound = !0),
            this.$$set(t),
            (this.$$.skip_bound = !1));
        }
      };
      function Fe(t, e, n) {
        const s = t.slice();
        s[53] = e[n];
        const i = s[0].tables[s[53]];
        return ((s[54] = i), s);
      }
      function Ie(t, e, n) {
        const s = t.slice();
        return ((s[57] = e[n]), s);
      }
      function De(t, e, n) {
        const s = t.slice();
        return ((s[60] = e[n]), s);
      }
      function Le(t, e, n) {
        const s = t.slice();
        return ((s[60] = e[n]), s);
      }
      function Ue(t, e, n) {
        const s = t.slice();
        return ((s[65] = e[n]), s);
      }
      function Re(t, e, n) {
        const s = t.slice();
        s[53] = e[n];
        const i = s[0].tables[s[53]];
        return ((s[54] = i), s);
      }
      function Ne(t, e, n) {
        const s = t.slice();
        return ((s[71] = e[n]), s);
      }
      function Be(t, e, n) {
        const s = t.slice();
        return ((s[74] = e[n]), s);
      }
      function Pe(t, e, n) {
        const s = t.slice();
        return ((s[74] = e[n]), s);
      }
      function qe(t) {
        const e = t.slice(),
          n = e[0].decayGraph;
        return ((e[70] = n), e);
      }
      function He(t) {
        let e;
        return {
          c() {
            ((e = Qt("span")),
              (e.textContent = "Waiting for war status"),
              ie(e, "class", "__warhelper_war_overview_decay-empty"));
          },
          m(t, n) {
            zt(t, e, n);
          },
          p: Pt,
          d(t) {
            t && Yt(e);
          },
        };
      }
      function Oe(t) {
        let e,
          n,
          s,
          i,
          r,
          a,
          o,
          l = t[0].decayEnd.label + "",
          c = t[0].decayEnd.timer + "",
          h = t[0].decayEnd.showDates && We(t);
        return {
          c() {
            ((e = Qt("span")),
              (n = Qt("span")),
              (s = Jt(l)),
              (i = Xt()),
              (r = Qt("span")),
              (a = Jt(c)),
              (o = Xt()),
              h && h.c(),
              ie(n, "class", "__warhelper_war_overview_decay-label"),
              ie(r, "class", "__warhelper_war_overview_decay-timer"),
              ie(e, "class", "__warhelper_war_overview_decay-summary"));
          },
          m(t, l) {
            (zt(t, e, l),
              Kt(e, n),
              Kt(n, s),
              Kt(e, i),
              Kt(e, r),
              Kt(r, a),
              Kt(e, o),
              h && h.m(e, null));
          },
          p(t, n) {
            (1 & n[0] && l !== (l = t[0].decayEnd.label + "") && re(s, l),
              1 & n[0] && c !== (c = t[0].decayEnd.timer + "") && re(a, c),
              t[0].decayEnd.showDates
                ? h
                  ? h.p(t, n)
                  : ((h = We(t)), h.c(), h.m(e, null))
                : h && (h.d(1), (h = null)));
          },
          d(t) {
            (t && Yt(e), h && h.d());
          },
        };
      }
      function We(t) {
        let e,
          n,
          s,
          i,
          r,
          a,
          o,
          l,
          c,
          h = t[0].decayEnd.utcTime + "",
          d = t[0].decayEnd.localTime + "";
        return {
          c() {
            ((e = Qt("span")),
              (e.textContent = "-"),
              (n = Xt()),
              (s = Qt("span")),
              (i = Jt(h)),
              (r = Xt()),
              (a = Qt("span")),
              (a.textContent = "/"),
              (o = Xt()),
              (l = Qt("span")),
              (c = Jt(d)));
          },
          m(t, h) {
            (zt(t, e, h),
              zt(t, n, h),
              zt(t, s, h),
              Kt(s, i),
              zt(t, r, h),
              zt(t, a, h),
              zt(t, o, h),
              zt(t, l, h),
              Kt(l, c));
          },
          p(t, e) {
            (1 & e[0] && h !== (h = t[0].decayEnd.utcTime + "") && re(i, h),
              1 & e[0] && d !== (d = t[0].decayEnd.localTime + "") && re(c, d));
          },
          d(t) {
            t && (Yt(e), Yt(n), Yt(s), Yt(r), Yt(a), Yt(o), Yt(l));
          },
        };
      }
      function je(t) {
        let e;
        function n(t, e) {
          return t[70].hasData ? $e : Ve;
        }
        let s = n(t),
          i = s(t);
        return {
          c() {
            ((e = Qt("div")),
              i.c(),
              ie(e, "class", "__warhelper_war_overview_graph"));
          },
          m(t, n) {
            (zt(t, e, n), i.m(e, null));
          },
          p(t, r) {
            s === (s = n(t)) && i
              ? i.p(t, r)
              : (i.d(1), (i = s(t)), i && (i.c(), i.m(e, null)));
          },
          d(t) {
            (t && Yt(e), i.d());
          },
        };
      }
      function Ve(t) {
        let e;
        return {
          c() {
            ((e = Qt("div")),
              (e.textContent = "Waiting for graph data"),
              ie(e, "class", "__warhelper_war_overview_graph-empty"));
          },
          m(t, n) {
            zt(t, e, n);
          },
          p: Pt,
          d(t) {
            t && Yt(e);
          },
        };
      }
      function $e(t) {
        let e,
          n,
          s,
          i,
          r,
          a,
          o,
          l,
          c,
          h,
          d,
          u,
          p,
          g,
          f,
          m,
          _,
          w,
          b,
          A,
          y,
          v,
          S,
          x,
          C,
          k,
          E,
          T,
          M,
          F,
          I,
          D,
          L,
          U,
          R,
          N,
          B,
          P,
          q,
          H,
          O,
          W,
          j,
          V = t[70].ownFactionName + "",
          $ = t[70].enemyFactionName + "",
          K = Se(t[70].yLabels),
          z = [];
        for (let e = 0; e < K.length; e += 1) z[e] = Ke(Pe(t, K, e));
        let Y = Se(t[70].xLabels),
          G = [];
        for (let e = 0; e < Y.length; e += 1) G[e] = ze(Be(t, Y, e));
        let Q = t[70].goalPositivePoints && Ye(t),
          Z = t[70].goalNegativePoints && Ge(t),
          J = Se(t[70].scoreSegments),
          X = [];
        for (let e = 0; e < J.length; e += 1) X[e] = Qe(Ne(t, J, e));
        let tt = t[2] && Ze(t);
        function et(...e) {
          return t[24](t[70], ...e);
        }
        return {
          c() {
            ((e = Zt("svg")),
              (n = Zt("rect")),
              (o = Zt("rect")),
              (u = Zt("rect")));
            for (let t = 0; t < z.length; t += 1) z[t].c();
            _ = te();
            for (let t = 0; t < G.length; t += 1) G[t].c();
            ((w = Zt("line")),
              (S = Zt("text")),
              (x = Jt("Score")),
              (E = Zt("text")),
              (T = Jt("Time")),
              Q && Q.c(),
              (I = te()),
              Z && Z.c(),
              (D = te()));
            for (let t = 0; t < X.length; t += 1) X[t].c();
            ((L = Zt("text")),
              (U = Jt(V)),
              (B = Zt("text")),
              (P = Jt($)),
              tt && tt.c(),
              ie(n, "class", "__warhelper_war_overview_graph-bg"),
              ie(n, "x", (s = t[70].plotX)),
              ie(n, "y", (i = t[70].plotY)),
              ie(n, "width", (r = t[70].plotWidth)),
              ie(n, "height", (a = t[70].plotHeight)),
              ie(o, "class", "__warhelper_war_overview_graph-positive-bg"),
              ie(o, "x", (l = t[70].plotX)),
              ie(o, "y", (c = t[70].plotY)),
              ie(o, "width", (h = t[70].plotWidth)),
              ie(o, "height", (d = t[70].zeroY - t[70].plotY)),
              ie(u, "class", "__warhelper_war_overview_graph-negative-bg"),
              ie(u, "x", (p = t[70].plotX)),
              ie(u, "y", (g = t[70].zeroY)),
              ie(u, "width", (f = t[70].plotWidth)),
              ie(
                u,
                "height",
                (m = t[70].plotY + t[70].plotHeight - t[70].zeroY),
              ),
              ie(w, "class", "__warhelper_war_overview_graph-zero"),
              ie(w, "x1", (b = t[70].plotX)),
              ie(w, "x2", (A = t[70].plotX + t[70].plotWidth)),
              ie(w, "y1", (y = t[70].zeroY)),
              ie(w, "y2", (v = t[70].zeroY)),
              ie(S, "class", "__warhelper_war_overview_graph-axis-title"),
              ie(S, "x", "11"),
              ie(S, "y", (C = t[70].plotY + t[70].plotHeight / 2)),
              ie(S, "text-anchor", "middle"),
              ie(
                S,
                "transform",
                (k = `rotate(-90 11 ${t[70].plotY + t[70].plotHeight / 2})`),
              ),
              ie(E, "class", "__warhelper_war_overview_graph-axis-title"),
              ie(E, "x", (M = t[70].plotX + t[70].plotWidth / 2)),
              ie(E, "y", (F = t[70].height - 7)),
              ie(E, "text-anchor", "middle"),
              ie(
                L,
                "class",
                "__warhelper_war_overview_graph-faction-label __warhelper_war_overview_graph-faction-label-positive",
              ),
              ie(L, "x", (R = t[70].plotX + t[70].plotWidth / 2)),
              ie(L, "y", (N = t[70].plotY + 0.22 * t[70].plotHeight)),
              ie(
                B,
                "class",
                "__warhelper_war_overview_graph-faction-label __warhelper_war_overview_graph-faction-label-negative",
              ),
              ie(B, "x", (q = t[70].plotX + t[70].plotWidth / 2)),
              ie(B, "y", (H = t[70].plotY + 0.78 * t[70].plotHeight)),
              ie(e, "class", "__warhelper_war_overview_graph-svg"),
              ie(e, "viewBox", (O = `0 0 ${t[70].width} ${t[70].height}`)),
              ie(e, "role", "img"),
              ie(e, "aria-label", "War score graph"));
          },
          m(s, i) {
            (zt(s, e, i), Kt(e, n), Kt(e, o), Kt(e, u));
            for (let t = 0; t < z.length; t += 1) z[t] && z[t].m(e, null);
            Kt(e, _);
            for (let t = 0; t < G.length; t += 1) G[t] && G[t].m(e, null);
            (Kt(e, w),
              Kt(e, S),
              Kt(S, x),
              Kt(e, E),
              Kt(E, T),
              Q && Q.m(e, null),
              Kt(e, I),
              Z && Z.m(e, null),
              Kt(e, D));
            for (let t = 0; t < X.length; t += 1) X[t] && X[t].m(e, null);
            (Kt(e, L),
              Kt(L, U),
              Kt(e, B),
              Kt(B, P),
              tt && tt.m(e, null),
              W ||
                ((j = [ee(e, "pointermove", et), ee(e, "pointerleave", t[13])]),
                (W = !0)));
          },
          p(x, T) {
            if (
              ((t = x),
              1 & T[0] && s !== (s = t[70].plotX) && ie(n, "x", s),
              1 & T[0] && i !== (i = t[70].plotY) && ie(n, "y", i),
              1 & T[0] && r !== (r = t[70].plotWidth) && ie(n, "width", r),
              1 & T[0] && a !== (a = t[70].plotHeight) && ie(n, "height", a),
              1 & T[0] && l !== (l = t[70].plotX) && ie(o, "x", l),
              1 & T[0] && c !== (c = t[70].plotY) && ie(o, "y", c),
              1 & T[0] && h !== (h = t[70].plotWidth) && ie(o, "width", h),
              1 & T[0] &&
                d !== (d = t[70].zeroY - t[70].plotY) &&
                ie(o, "height", d),
              1 & T[0] && p !== (p = t[70].plotX) && ie(u, "x", p),
              1 & T[0] && g !== (g = t[70].zeroY) && ie(u, "y", g),
              1 & T[0] && f !== (f = t[70].plotWidth) && ie(u, "width", f),
              1 & T[0] &&
                m !== (m = t[70].plotY + t[70].plotHeight - t[70].zeroY) &&
                ie(u, "height", m),
              1 & T[0])
            ) {
              let n;
              for (K = Se(t[70].yLabels), n = 0; n < K.length; n += 1) {
                const s = Pe(t, K, n);
                z[n] ? z[n].p(s, T) : ((z[n] = Ke(s)), z[n].c(), z[n].m(e, _));
              }
              for (; n < z.length; n += 1) z[n].d(1);
              z.length = K.length;
            }
            if (1 & T[0]) {
              let n;
              for (Y = Se(t[70].xLabels), n = 0; n < Y.length; n += 1) {
                const s = Be(t, Y, n);
                G[n] ? G[n].p(s, T) : ((G[n] = ze(s)), G[n].c(), G[n].m(e, w));
              }
              for (; n < G.length; n += 1) G[n].d(1);
              G.length = Y.length;
            }
            if (
              (1 & T[0] && b !== (b = t[70].plotX) && ie(w, "x1", b),
              1 & T[0] &&
                A !== (A = t[70].plotX + t[70].plotWidth) &&
                ie(w, "x2", A),
              1 & T[0] && y !== (y = t[70].zeroY) && ie(w, "y1", y),
              1 & T[0] && v !== (v = t[70].zeroY) && ie(w, "y2", v),
              1 & T[0] &&
                C !== (C = t[70].plotY + t[70].plotHeight / 2) &&
                ie(S, "y", C),
              1 & T[0] &&
                k !==
                  (k = `rotate(-90 11 ${t[70].plotY + t[70].plotHeight / 2})`) &&
                ie(S, "transform", k),
              1 & T[0] &&
                M !== (M = t[70].plotX + t[70].plotWidth / 2) &&
                ie(E, "x", M),
              1 & T[0] && F !== (F = t[70].height - 7) && ie(E, "y", F),
              t[70].goalPositivePoints
                ? Q
                  ? Q.p(t, T)
                  : ((Q = Ye(t)), Q.c(), Q.m(e, I))
                : Q && (Q.d(1), (Q = null)),
              t[70].goalNegativePoints
                ? Z
                  ? Z.p(t, T)
                  : ((Z = Ge(t)), Z.c(), Z.m(e, D))
                : Z && (Z.d(1), (Z = null)),
              1 & T[0])
            ) {
              let n;
              for (J = Se(t[70].scoreSegments), n = 0; n < J.length; n += 1) {
                const s = Ne(t, J, n);
                X[n] ? X[n].p(s, T) : ((X[n] = Qe(s)), X[n].c(), X[n].m(e, L));
              }
              for (; n < X.length; n += 1) X[n].d(1);
              X.length = J.length;
            }
            (1 & T[0] && V !== (V = t[70].ownFactionName + "") && re(U, V),
              1 & T[0] &&
                R !== (R = t[70].plotX + t[70].plotWidth / 2) &&
                ie(L, "x", R),
              1 & T[0] &&
                N !== (N = t[70].plotY + 0.22 * t[70].plotHeight) &&
                ie(L, "y", N),
              1 & T[0] && $ !== ($ = t[70].enemyFactionName + "") && re(P, $),
              1 & T[0] &&
                q !== (q = t[70].plotX + t[70].plotWidth / 2) &&
                ie(B, "x", q),
              1 & T[0] &&
                H !== (H = t[70].plotY + 0.78 * t[70].plotHeight) &&
                ie(B, "y", H),
              t[2]
                ? tt
                  ? tt.p(t, T)
                  : ((tt = Ze(t)), tt.c(), tt.m(e, null))
                : tt && (tt.d(1), (tt = null)),
              1 & T[0] &&
                O !== (O = `0 0 ${t[70].width} ${t[70].height}`) &&
                ie(e, "viewBox", O));
          },
          d(t) {
            (t && Yt(e),
              Gt(z, t),
              Gt(G, t),
              Q && Q.d(),
              Z && Z.d(),
              Gt(X, t),
              tt && tt.d(),
              (W = !1),
              Ot(j));
          },
        };
      }
      function Ke(t) {
        let e,
          n,
          s,
          i,
          r,
          a,
          o,
          l,
          c,
          h = t[74].text + "";
        return {
          c() {
            ((e = Zt("line")),
              (a = Zt("text")),
              (o = Jt(h)),
              ie(e, "class", "__warhelper_war_overview_graph-grid"),
              ie(e, "x1", (n = t[70].plotX)),
              ie(e, "x2", (s = t[70].plotX + t[70].plotWidth)),
              ie(e, "y1", (i = t[74].y)),
              ie(e, "y2", (r = t[74].y)),
              ie(a, "class", "__warhelper_war_overview_graph-axis-label"),
              ie(a, "x", (l = t[70].plotX - 10)),
              ie(a, "y", (c = t[74].y + 4)),
              ie(a, "text-anchor", "end"));
          },
          m(t, n) {
            (zt(t, e, n), zt(t, a, n), Kt(a, o));
          },
          p(t, d) {
            (1 & d[0] && n !== (n = t[70].plotX) && ie(e, "x1", n),
              1 & d[0] &&
                s !== (s = t[70].plotX + t[70].plotWidth) &&
                ie(e, "x2", s),
              1 & d[0] && i !== (i = t[74].y) && ie(e, "y1", i),
              1 & d[0] && r !== (r = t[74].y) && ie(e, "y2", r),
              1 & d[0] && h !== (h = t[74].text + "") && re(o, h),
              1 & d[0] && l !== (l = t[70].plotX - 10) && ie(a, "x", l),
              1 & d[0] && c !== (c = t[74].y + 4) && ie(a, "y", c));
          },
          d(t) {
            t && (Yt(e), Yt(a));
          },
        };
      }
      function ze(t) {
        let e,
          n,
          s,
          i,
          r,
          a,
          o,
          l,
          c,
          h = t[74].text + "";
        return {
          c() {
            ((e = Zt("line")),
              (a = Zt("text")),
              (o = Jt(h)),
              ie(e, "class", "__warhelper_war_overview_graph-grid"),
              ie(e, "x1", (n = t[74].x)),
              ie(e, "x2", (s = t[74].x)),
              ie(e, "y1", (i = t[70].plotY)),
              ie(e, "y2", (r = t[70].plotY + t[70].plotHeight)),
              ie(a, "class", "__warhelper_war_overview_graph-axis-label"),
              ie(a, "x", (l = t[74].x)),
              ie(a, "y", (c = t[70].plotY + t[70].plotHeight + 19)),
              ie(a, "text-anchor", "middle"));
          },
          m(t, n) {
            (zt(t, e, n), zt(t, a, n), Kt(a, o));
          },
          p(t, d) {
            (1 & d[0] && n !== (n = t[74].x) && ie(e, "x1", n),
              1 & d[0] && s !== (s = t[74].x) && ie(e, "x2", s),
              1 & d[0] && i !== (i = t[70].plotY) && ie(e, "y1", i),
              1 & d[0] &&
                r !== (r = t[70].plotY + t[70].plotHeight) &&
                ie(e, "y2", r),
              1 & d[0] && h !== (h = t[74].text + "") && re(o, h),
              1 & d[0] && l !== (l = t[74].x) && ie(a, "x", l),
              1 & d[0] &&
                c !== (c = t[70].plotY + t[70].plotHeight + 19) &&
                ie(a, "y", c));
          },
          d(t) {
            t && (Yt(e), Yt(a));
          },
        };
      }
      function Ye(t) {
        let e, n;
        return {
          c() {
            ((e = Zt("polyline")),
              ie(
                e,
                "class",
                "__warhelper_war_overview_graph-goal __warhelper_war_overview_graph-goal-positive",
              ),
              ie(e, "points", (n = t[70].goalPositivePoints)));
          },
          m(t, n) {
            zt(t, e, n);
          },
          p(t, s) {
            1 & s[0] &&
              n !== (n = t[70].goalPositivePoints) &&
              ie(e, "points", n);
          },
          d(t) {
            t && Yt(e);
          },
        };
      }
      function Ge(t) {
        let e, n;
        return {
          c() {
            ((e = Zt("polyline")),
              ie(
                e,
                "class",
                "__warhelper_war_overview_graph-goal __warhelper_war_overview_graph-goal-negative",
              ),
              ie(e, "points", (n = t[70].goalNegativePoints)));
          },
          m(t, n) {
            zt(t, e, n);
          },
          p(t, s) {
            1 & s[0] &&
              n !== (n = t[70].goalNegativePoints) &&
              ie(e, "points", n);
          },
          d(t) {
            t && Yt(e);
          },
        };
      }
      function Qe(t) {
        let e, n, s;
        return {
          c() {
            ((e = Zt("polyline")),
              ie(
                e,
                "class",
                (n =
                  "__warhelper_war_overview_graph-score " +
                  (t[71].positive
                    ? "__warhelper_war_overview_graph-score-positive"
                    : "__warhelper_war_overview_graph-score-negative")),
              ),
              ie(e, "points", (s = t[71].points)));
          },
          m(t, n) {
            zt(t, e, n);
          },
          p(t, i) {
            (1 & i[0] &&
              n !==
                (n =
                  "__warhelper_war_overview_graph-score " +
                  (t[71].positive
                    ? "__warhelper_war_overview_graph-score-positive"
                    : "__warhelper_war_overview_graph-score-negative")) &&
              ie(e, "class", n),
              1 & i[0] && s !== (s = t[71].points) && ie(e, "points", s));
          },
          d(t) {
            t && Yt(e);
          },
        };
      }
      function Ze(t) {
        let e,
          n,
          s,
          i,
          r,
          a,
          o,
          l,
          c,
          h,
          d,
          u,
          p,
          g,
          f,
          m,
          _,
          w,
          b,
          A,
          y,
          v,
          S,
          x,
          C = t[2].winningFactionName + "",
          k = t[2].scoreDisplay + "",
          E = t[2].goalDisplay + "",
          T = t[2].timeTct + "",
          M = t[2].localTime + "",
          F = null !== t[2].goalPositiveY && Je(t),
          I = null !== t[2].goalNegativeY && Xe(t);
        return {
          c() {
            ((e = Zt("line")),
              (a = Zt("circle")),
              F && F.c(),
              (c = te()),
              I && I.c(),
              (h = Zt("g")),
              (d = Zt("rect")),
              (u = Zt("text")),
              (p = Jt("Winning: ")),
              (g = Jt(C)),
              (f = Zt("text")),
              (m = Jt("Score: ")),
              (_ = Jt(k)),
              (w = Jt(" / ")),
              (b = Jt(E)),
              (A = Zt("text")),
              (y = Jt(T)),
              (v = Zt("text")),
              (S = Jt(M)),
              ie(e, "class", "__warhelper_war_overview_graph-hover-line"),
              ie(e, "x1", (n = t[2].x)),
              ie(e, "x2", (s = t[2].x)),
              ie(e, "y1", (i = t[70].plotY)),
              ie(e, "y2", (r = t[70].plotY + t[70].plotHeight)),
              ie(a, "class", "__warhelper_war_overview_graph-hover-dot"),
              ie(a, "cx", (o = t[2].x)),
              ie(a, "cy", (l = t[2].scoreY)),
              ie(a, "r", "4"),
              ie(d, "width", "188"),
              ie(d, "height", "78"),
              ie(d, "rx", "4"),
              ie(u, "x", "8"),
              ie(u, "y", "16"),
              ie(f, "x", "8"),
              ie(f, "y", "31"),
              ie(A, "x", "8"),
              ie(A, "y", "54"),
              ie(v, "x", "8"),
              ie(v, "y", "69"),
              ie(h, "class", "__warhelper_war_overview_graph-tooltip"),
              ie(
                h,
                "transform",
                (x = `translate(${Un(t[2], t[70])} ${Rn(t[2], t[70])})`),
              ));
          },
          m(t, n) {
            (zt(t, e, n),
              zt(t, a, n),
              F && F.m(t, n),
              zt(t, c, n),
              I && I.m(t, n),
              zt(t, h, n),
              Kt(h, d),
              Kt(h, u),
              Kt(u, p),
              Kt(u, g),
              Kt(h, f),
              Kt(f, m),
              Kt(f, _),
              Kt(f, w),
              Kt(f, b),
              Kt(h, A),
              Kt(A, y),
              Kt(h, v),
              Kt(v, S));
          },
          p(t, d) {
            (4 & d[0] && n !== (n = t[2].x) && ie(e, "x1", n),
              4 & d[0] && s !== (s = t[2].x) && ie(e, "x2", s),
              1 & d[0] && i !== (i = t[70].plotY) && ie(e, "y1", i),
              1 & d[0] &&
                r !== (r = t[70].plotY + t[70].plotHeight) &&
                ie(e, "y2", r),
              4 & d[0] && o !== (o = t[2].x) && ie(a, "cx", o),
              4 & d[0] && l !== (l = t[2].scoreY) && ie(a, "cy", l),
              null !== t[2].goalPositiveY
                ? F
                  ? F.p(t, d)
                  : ((F = Je(t)), F.c(), F.m(c.parentNode, c))
                : F && (F.d(1), (F = null)),
              null !== t[2].goalNegativeY
                ? I
                  ? I.p(t, d)
                  : ((I = Xe(t)), I.c(), I.m(h.parentNode, h))
                : I && (I.d(1), (I = null)),
              4 & d[0] && C !== (C = t[2].winningFactionName + "") && re(g, C),
              4 & d[0] && k !== (k = t[2].scoreDisplay + "") && re(_, k),
              4 & d[0] && E !== (E = t[2].goalDisplay + "") && re(b, E),
              4 & d[0] && T !== (T = t[2].timeTct + "") && re(y, T),
              4 & d[0] && M !== (M = t[2].localTime + "") && re(S, M),
              5 & d[0] &&
                x !==
                  (x = `translate(${Un(t[2], t[70])} ${Rn(t[2], t[70])})`) &&
                ie(h, "transform", x));
          },
          d(t) {
            (t && (Yt(e), Yt(a), Yt(c), Yt(h)), F && F.d(t), I && I.d(t));
          },
        };
      }
      function Je(t) {
        let e, n, s;
        return {
          c() {
            ((e = Zt("circle")),
              ie(e, "class", "__warhelper_war_overview_graph-hover-dot"),
              ie(e, "cx", (n = t[2].x)),
              ie(e, "cy", (s = t[2].goalPositiveY)),
              ie(e, "r", "3"));
          },
          m(t, n) {
            zt(t, e, n);
          },
          p(t, i) {
            (4 & i[0] && n !== (n = t[2].x) && ie(e, "cx", n),
              4 & i[0] && s !== (s = t[2].goalPositiveY) && ie(e, "cy", s));
          },
          d(t) {
            t && Yt(e);
          },
        };
      }
      function Xe(t) {
        let e, n, s;
        return {
          c() {
            ((e = Zt("circle")),
              ie(e, "class", "__warhelper_war_overview_graph-hover-dot"),
              ie(e, "cx", (n = t[2].x)),
              ie(e, "cy", (s = t[2].goalNegativeY)),
              ie(e, "r", "3"));
          },
          m(t, n) {
            zt(t, e, n);
          },
          p(t, i) {
            (4 & i[0] && n !== (n = t[2].x) && ie(e, "cx", n),
              4 & i[0] && s !== (s = t[2].goalNegativeY) && ie(e, "cy", s));
          },
          d(t) {
            t && Yt(e);
          },
        };
      }
      function tn(t) {
        let e,
          n,
          s,
          i,
          r,
          a,
          o,
          l,
          c,
          h,
          d = t[0].opponentChain.text + "";
        return {
          c() {
            ((e = Qt("div")),
              (n = Qt("span")),
              (s = Qt("span")),
              (s.textContent = "OPPONENT CHAIN"),
              (i = Xt()),
              (r = Qt("span")),
              (a = Jt(d)),
              (o = Xt()),
              (l = Qt("button")),
              (l.textContent = "\u21bb"),
              ie(s, "class", "__warhelper_war_overview_decay-label"),
              ie(r, "class", "__warhelper_war_overview_decay-timer"),
              ie(n, "class", "__warhelper_war_overview_decay-summary"),
              ie(l, "class", "__warhelper_war_overview_decay-refresh"),
              ie(l, "type", "button"),
              ie(l, "aria-label", "Refresh opponent chain"),
              ie(
                e,
                "class",
                "__warhelper_war_overview_decay __warhelper_war_overview_chain",
              ));
          },
          m(d, u) {
            (zt(d, e, u),
              Kt(e, n),
              Kt(n, s),
              Kt(n, i),
              Kt(n, r),
              Kt(r, a),
              Kt(e, o),
              Kt(e, l),
              c || ((h = ee(l, "click", t[25])), (c = !0)));
          },
          p(t, e) {
            1 & e[0] && d !== (d = t[0].opponentChain.text + "") && re(a, d);
          },
          d(t) {
            (t && Yt(e), (c = !1), h());
          },
        };
      }
      function en(t) {
        let e,
          n,
          s,
          i,
          r,
          a,
          o,
          l,
          c,
          h,
          d = t[54].title + "",
          u = t[54].rawCount + "";
        function p() {
          return t[26](t[53]);
        }
        function g(...e) {
          return t[27](t[53], ...e);
        }
        return {
          c() {
            ((e = Qt("button")),
              (n = Qt("span")),
              (s = Jt(d)),
              (i = Xt()),
              (r = Qt("span")),
              (a = Jt(u)),
              (o = Xt()),
              ie(n, "class", "__warhelper_war_overview_mobile-tab-title"),
              ie(r, "class", "__warhelper_war_overview_mobile-tab-count"),
              ie(e, "class", "__warhelper_war_overview_mobile-tab"),
              ie(e, "type", "button"),
              ie(e, "role", "tab"),
              ie(e, "aria-selected", (l = t[0].activeMobileTab === t[53])),
              ae(e, "active", t[0].activeMobileTab === t[53]));
          },
          m(t, l) {
            (zt(t, e, l),
              Kt(e, n),
              Kt(n, s),
              Kt(e, i),
              Kt(e, r),
              Kt(r, a),
              Kt(e, o),
              c || ((h = [ee(e, "click", p), ee(e, "keydown", g)]), (c = !0)));
          },
          p(n, i) {
            ((t = n),
              1 & i[0] && d !== (d = t[54].title + "") && re(s, d),
              1 & i[0] && u !== (u = t[54].rawCount + "") && re(a, u),
              1 & i[0] &&
                l !== (l = t[0].activeMobileTab === t[53]) &&
                ie(e, "aria-selected", l),
              17 & i[0] && ae(e, "active", t[0].activeMobileTab === t[53]));
          },
          d(t) {
            (t && Yt(e), (c = !1), Ot(h));
          },
        };
      }
      function nn(t) {
        let e,
          n = t[54] && en(t);
        return {
          c() {
            (n && n.c(), (e = te()));
          },
          m(t, s) {
            (n && n.m(t, s), zt(t, e, s));
          },
          p(t, s) {
            t[54]
              ? n
                ? n.p(t, s)
                : ((n = en(t)), n.c(), n.m(e.parentNode, e))
              : n && (n.d(1), (n = null));
          },
          d(t) {
            (t && Yt(e), n && n.d(t));
          },
        };
      }
      function sn(t) {
        let e,
          n,
          s,
          i,
          r,
          a,
          o,
          l,
          c,
          h,
          d,
          u,
          p,
          g,
          f,
          m,
          _,
          w,
          b,
          A,
          y,
          v = t[54].title + "";
        function S(...e) {
          return t[28](t[53], ...e);
        }
        let x = t[54].activeSettings && rn(t),
          C = !t[3] && on(t);
        function k(...e) {
          return t[31](t[53], ...e);
        }
        function E(...e) {
          return t[32](t[53], ...e);
        }
        let T = (t[54].members.length || t[54].rawCount) && ln(t),
          M = !t[54].members.length && t[54].emptyText && Tn(t);
        function F() {
          return t[51](t[54], t[53]);
        }
        function I(...e) {
          return t[52](t[53], ...e);
        }
        return {
          c() {
            ((e = Qt("div")),
              (n = Qt("div")),
              (s = Qt("div")),
              (i = Qt("button")),
              (r = Jt("\u2699")),
              (l = Xt()),
              x && x.c(),
              (c = Xt()),
              (h = Qt("span")),
              (d = Jt(v)),
              (u = Xt()),
              C && C.c(),
              (g = Xt()),
              (f = Qt("div")),
              T && T.c(),
              (m = Xt()),
              M && M.c(),
              (_ = Xt()),
              ie(
                i,
                "class",
                (a =
                  "__warhelper_war_overview_settings-button " +
                  (t[54].activeSettings ? "active" : "")),
              ),
              ie(i, "type", "button"),
              ie(i, "aria-label", (o = `Column settings for ${t[54].title}`)),
              ie(
                s,
                "class",
                "__warhelper_war_overview_settings-wrap __warhelper_war_overview_settings-ui",
              ),
              ie(s, "role", "presentation"),
              ie(h, "class", "__warhelper_war_overview_panel-title-text"),
              ie(n, "class", "__warhelper_war_overview_panel-title"),
              ie(n, "role", "button"),
              ie(n, "tabindex", (p = t[3] ? -1 : 0)),
              ie(f, "class", "__warhelper_war_overview_panel-body"),
              ie(
                e,
                "class",
                (w = `__warhelper_war_overview_panel __warhelper_war_overview_panel-${t[53]}`),
              ),
              ie(e, "role", "button"),
              ie(e, "tabindex", (b = !t[3] && t[54].collapsed ? 0 : -1)),
              ae(
                e,
                "__warhelper_war_overview_panel-collapsed",
                t[54].collapsed,
              ),
              ae(
                e,
                "__warhelper_war_overview_panel-mobile-active",
                t[0].activeMobileTab === t[53],
              ));
          },
          m(a, o) {
            (zt(a, e, o),
              Kt(e, n),
              Kt(n, s),
              Kt(s, i),
              Kt(i, r),
              Kt(s, l),
              x && x.m(s, null),
              Kt(n, c),
              Kt(n, h),
              Kt(h, d),
              Kt(n, u),
              C && C.m(n, null),
              Kt(e, g),
              Kt(e, f),
              T && T.m(f, null),
              Kt(f, m),
              M && M.m(f, null),
              Kt(e, _),
              A ||
                ((y = [
                  ee(i, "click", S),
                  ee(s, "click", se(t[20])),
                  ee(s, "keydown", se(t[21])),
                  ee(n, "click", k),
                  ee(n, "keydown", E),
                  ee(e, "click", F),
                  ee(e, "keydown", I),
                ]),
                (A = !0)));
          },
          p(r, l) {
            ((t = r),
              1 & l[0] &&
                a !==
                  (a =
                    "__warhelper_war_overview_settings-button " +
                    (t[54].activeSettings ? "active" : "")) &&
                ie(i, "class", a),
              1 & l[0] &&
                o !== (o = `Column settings for ${t[54].title}`) &&
                ie(i, "aria-label", o),
              t[54].activeSettings
                ? x
                  ? x.p(t, l)
                  : ((x = rn(t)), x.c(), x.m(s, null))
                : x && (x.d(1), (x = null)),
              1 & l[0] && v !== (v = t[54].title + "") && re(d, v),
              t[3]
                ? C && (C.d(1), (C = null))
                : C
                  ? C.p(t, l)
                  : ((C = on(t)), C.c(), C.m(n, null)),
              8 & l[0] && p !== (p = t[3] ? -1 : 0) && ie(n, "tabindex", p),
              t[54].members.length || t[54].rawCount
                ? T
                  ? T.p(t, l)
                  : ((T = ln(t)), T.c(), T.m(f, m))
                : T && (T.d(1), (T = null)),
              !t[54].members.length && t[54].emptyText
                ? M
                  ? M.p(t, l)
                  : ((M = Tn(t)), M.c(), M.m(f, null))
                : M && (M.d(1), (M = null)),
              9 & l[0] &&
                b !== (b = !t[3] && t[54].collapsed ? 0 : -1) &&
                ie(e, "tabindex", b),
              17 & l[0] &&
                ae(
                  e,
                  "__warhelper_war_overview_panel-collapsed",
                  t[54].collapsed,
                ),
              17 & l[0] &&
                ae(
                  e,
                  "__warhelper_war_overview_panel-mobile-active",
                  t[0].activeMobileTab === t[53],
                ));
          },
          d(t) {
            (t && Yt(e),
              x && x.d(),
              C && C.d(),
              T && T.d(),
              M && M.d(),
              (A = !1),
              Ot(y));
          },
        };
      }
      function rn(t) {
        let e,
          n,
          s,
          i = Se(t[54].optionalColumns),
          r = [];
        for (let e = 0; e < i.length; e += 1) r[e] = an(Ue(t, i, e));
        return {
          c() {
            e = Qt("form");
            for (let t = 0; t < r.length; t += 1) r[t].c();
            ie(
              e,
              "class",
              "__warhelper_war_overview_settings-popover __warhelper_war_overview_settings-ui",
            );
          },
          m(i, a) {
            zt(i, e, a);
            for (let t = 0; t < r.length; t += 1) r[t] && r[t].m(e, null);
            n || ((s = ee(e, "submit", ne(t[22]))), (n = !0));
          },
          p(t, n) {
            if (19 & n[0]) {
              let s;
              for (i = Se(t[54].optionalColumns), s = 0; s < i.length; s += 1) {
                const a = Ue(t, i, s);
                r[s]
                  ? r[s].p(a, n)
                  : ((r[s] = an(a)), r[s].c(), r[s].m(e, null));
              }
              for (; s < r.length; s += 1) r[s].d(1);
              r.length = i.length;
            }
          },
          d(t) {
            (t && Yt(e), Gt(r, t), (n = !1), s());
          },
        };
      }
      function an(t) {
        let e,
          n,
          s,
          i,
          r,
          a,
          o,
          l,
          c,
          h = t[65].label + "";
        function d(...e) {
          return t[29](t[53], t[65], ...e);
        }
        return {
          c() {
            ((e = Qt("label")),
              (n = Qt("input")),
              (i = Xt()),
              (r = Qt("span")),
              (a = Jt(h)),
              (o = Xt()),
              ie(n, "type", "checkbox"),
              (n.checked = s = t[65].visible),
              ie(e, "class", "__warhelper_war_overview_filter-choice"));
          },
          m(s, h) {
            (zt(s, e, h),
              Kt(e, n),
              Kt(e, i),
              Kt(e, r),
              Kt(r, a),
              Kt(e, o),
              l ||
                ((c = [ee(n, "change", d), ee(n, "keydown", t[30])]),
                (l = !0)));
          },
          p(e, i) {
            ((t = e),
              1 & i[0] && s !== (s = t[65].visible) && (n.checked = s),
              1 & i[0] && h !== (h = t[65].label + "") && re(a, h));
          },
          d(t) {
            (t && Yt(e), (l = !1), Ot(c));
          },
        };
      }
      function on(t) {
        let e,
          n,
          s,
          i = t[54].collapseButtonText + "";
        return {
          c() {
            ((e = Qt("button")),
              (n = Jt(i)),
              ie(e, "class", "__warhelper_war_overview_collapse-button"),
              ie(e, "type", "button"),
              ie(
                e,
                "aria-label",
                (s = `${t[54].collapsed ? "Expand" : "Collapse"} ${"enemy" === t[53] ? "enemy faction" : "own faction"}`),
              ));
          },
          m(t, s) {
            (zt(t, e, s), Kt(e, n));
          },
          p(t, r) {
            (1 & r[0] && i !== (i = t[54].collapseButtonText + "") && re(n, i),
              1 & r[0] &&
                s !==
                  (s = `${t[54].collapsed ? "Expand" : "Collapse"} ${"enemy" === t[53] ? "enemy faction" : "own faction"}`) &&
                ie(e, "aria-label", s));
          },
          d(t) {
            t && Yt(e);
          },
        };
      }
      function ln(t) {
        let e,
          n,
          s,
          i,
          r,
          a,
          o,
          l,
          c,
          h,
          d,
          u,
          p,
          g,
          f,
          m,
          _,
          w,
          b,
          A,
          y,
          v,
          S,
          x,
          C,
          k,
          E,
          T,
          M,
          F,
          I,
          D,
          L,
          U,
          R,
          N,
          B,
          P,
          q,
          H,
          O,
          W,
          j,
          V,
          $,
          K,
          z,
          Y,
          G,
          Q,
          Z,
          J,
          X,
          tt,
          et,
          nt,
          st,
          it,
          rt,
          at,
          ot,
          lt = [],
          ct = new Map(),
          ht = t[54].showDibsColumn && cn(t),
          dt = t[54].showScoreColumn && hn(t),
          ut = t[54].showAttackColumn && dn(t);
        function pt(...e) {
          return t[33](t[53], ...e);
        }
        let gt = "online" === t[54].activeFilter && un(t),
          ft = t[54].showDibsColumn && gn(t);
        function mt() {
          return t[36](t[53]);
        }
        function _t() {
          return t[37](t[53]);
        }
        function wt(...e) {
          return t[38](t[53], ...e);
        }
        let bt = "status" === t[54].activeFilter && fn(t),
          At = t[54].showScoreColumn && _n(t);
        function yt() {
          return t[42](t[53]);
        }
        function vt(...e) {
          return t[43](t[53], ...e);
        }
        let St = "stats" === t[54].activeFilter && wn(t),
          xt = t[54].showAttackColumn && bn(t),
          Ct = Se(t[54].members);
        const kt = (t) => t[57].userId;
        for (let e = 0; e < Ct.length; e += 1) {
          let n = Ie(t, Ct, e),
            s = kt(n);
          ct.set(s, (lt[e] = En(s, n)));
        }
        return {
          c() {
            ((e = Qt("table")),
              (n = Qt("colgroup")),
              (s = Qt("col")),
              (i = Xt()),
              ht && ht.c(),
              (r = Xt()),
              (a = Qt("col")),
              (o = Xt()),
              (l = Qt("col")),
              (c = Xt()),
              dt && dt.c(),
              (h = Xt()),
              (d = Qt("col")),
              (u = Xt()),
              ut && ut.c(),
              (p = Xt()),
              (g = Qt("thead")),
              (f = Qt("tr")),
              (m = Qt("th")),
              (_ = Qt("div")),
              (w = Qt("button")),
              (A = Xt()),
              gt && gt.c(),
              (v = Xt()),
              ft && ft.c(),
              (S = Xt()),
              (x = Qt("th")),
              (C = Qt("div")),
              (k = Qt("button")),
              (E = Qt("span")),
              (E.textContent = "Name"),
              (T = Xt()),
              (M = Qt("span")),
              (D = Xt()),
              (L = Qt("th")),
              (U = Qt("div")),
              (R = Qt("button")),
              (N = Qt("span")),
              (N.textContent = "Status"),
              (B = Xt()),
              (P = Qt("span")),
              (H = Xt()),
              (O = Qt("button")),
              (j = Xt()),
              bt && bt.c(),
              (V = Xt()),
              At && At.c(),
              ($ = Xt()),
              (K = Qt("th")),
              (z = Qt("div")),
              (Y = Qt("button")),
              (G = Qt("span")),
              (G.textContent = "Stats"),
              (Q = Xt()),
              (Z = Qt("span")),
              (X = Xt()),
              (tt = Qt("button")),
              (nt = Xt()),
              St && St.c(),
              (st = Xt()),
              xt && xt.c(),
              (it = Xt()),
              (rt = Qt("tbody")));
            for (let t = 0; t < lt.length; t += 1) lt[t].c();
            (ie(s, "class", "__warhelper_war_overview_col-controls"),
              ie(a, "class", "__warhelper_war_overview_col-name"),
              ie(l, "class", "__warhelper_war_overview_col-status"),
              ie(d, "class", "__warhelper_war_overview_col-stats"),
              ie(
                w,
                "class",
                (b = `__warhelper_war_overview_filter-button __warhelper_war_overview_filter-ui ${Dn(t[54].hasOnlineFilter)}`),
              ),
              ie(w, "type", "button"),
              ie(
                _,
                "class",
                "__warhelper_war_overview_controls-header-content",
              ),
              ie(
                m,
                "class",
                (y = `__warhelper_war_overview_controls-header __warhelper_war_overview_controls-header-${t[53]}`),
              ),
              ie(E, "class", "__warhelper_war_overview_sort-label"),
              ie(M, "class", "__warhelper_war_overview_sort-icon"),
              ie(
                k,
                "class",
                (F = `__warhelper_war_overview_sort ${In(t[54], "name")}`),
              ),
              ie(k, "type", "button"),
              ie(C, "class", "__warhelper_war_overview_name-header-content"),
              ie(
                x,
                "class",
                (I = `__warhelper_war_overview_name-header-${t[53]}`),
              ),
              ie(N, "class", "__warhelper_war_overview_sort-label"),
              ie(P, "class", "__warhelper_war_overview_sort-icon"),
              ie(
                R,
                "class",
                (q = `__warhelper_war_overview_sort ${In(t[54], "status")}`),
              ),
              ie(R, "type", "button"),
              ie(
                O,
                "class",
                (W = `__warhelper_war_overview_filter-button __warhelper_war_overview_filter-ui ${Dn(t[54].hasStatusFilter)}`),
              ),
              ie(O, "type", "button"),
              ie(U, "class", "__warhelper_war_overview_status-header-content"),
              ie(L, "class", "__warhelper_war_overview_status-header"),
              ie(G, "class", "__warhelper_war_overview_sort-label"),
              ie(Z, "class", "__warhelper_war_overview_sort-icon"),
              ie(
                Y,
                "class",
                (J = `__warhelper_war_overview_sort ${In(t[54], "stats")}`),
              ),
              ie(Y, "type", "button"),
              ie(
                tt,
                "class",
                (et = `__warhelper_war_overview_filter-button __warhelper_war_overview_filter-ui ${Dn(t[54].hasStatsFilter)}`),
              ),
              ie(tt, "type", "button"),
              ie(z, "class", "__warhelper_war_overview_stats-header-content"),
              ie(K, "class", "__warhelper_war_overview_stats-header"),
              ie(e, "class", "__warhelper_war_overview_table"));
          },
          m(t, b) {
            (zt(t, e, b),
              Kt(e, n),
              Kt(n, s),
              Kt(n, i),
              ht && ht.m(n, null),
              Kt(n, r),
              Kt(n, a),
              Kt(n, o),
              Kt(n, l),
              Kt(n, c),
              dt && dt.m(n, null),
              Kt(n, h),
              Kt(n, d),
              Kt(n, u),
              ut && ut.m(n, null),
              Kt(e, p),
              Kt(e, g),
              Kt(g, f),
              Kt(f, m),
              Kt(m, _),
              Kt(_, w),
              Kt(m, A),
              gt && gt.m(m, null),
              Kt(f, v),
              ft && ft.m(f, null),
              Kt(f, S),
              Kt(f, x),
              Kt(x, C),
              Kt(C, k),
              Kt(k, E),
              Kt(k, T),
              Kt(k, M),
              Kt(f, D),
              Kt(f, L),
              Kt(L, U),
              Kt(U, R),
              Kt(R, N),
              Kt(R, B),
              Kt(R, P),
              Kt(U, H),
              Kt(U, O),
              Kt(L, j),
              bt && bt.m(L, null),
              Kt(f, V),
              At && At.m(f, null),
              Kt(f, $),
              Kt(f, K),
              Kt(K, z),
              Kt(z, Y),
              Kt(Y, G),
              Kt(Y, Q),
              Kt(Y, Z),
              Kt(z, X),
              Kt(z, tt),
              Kt(K, nt),
              St && St.m(K, null),
              Kt(f, st),
              xt && xt.m(f, null),
              Kt(e, it),
              Kt(e, rt));
            for (let t = 0; t < lt.length; t += 1) lt[t] && lt[t].m(rt, null);
            at ||
              ((ot = [
                ee(w, "click", pt),
                ee(k, "click", mt),
                ee(R, "click", _t),
                ee(O, "click", wt),
                ee(Y, "click", yt),
                ee(tt, "click", vt),
              ]),
              (at = !0));
          },
          p(e, s) {
            ((t = e)[54].showDibsColumn
              ? ht || ((ht = cn(t)), ht.c(), ht.m(n, r))
              : ht && (ht.d(1), (ht = null)),
              t[54].showScoreColumn
                ? dt || ((dt = hn(t)), dt.c(), dt.m(n, h))
                : dt && (dt.d(1), (dt = null)),
              t[54].showAttackColumn
                ? ut || ((ut = dn(t)), ut.c(), ut.m(n, null))
                : ut && (ut.d(1), (ut = null)),
              1 & s[0] &&
                b !==
                  (b = `__warhelper_war_overview_filter-button __warhelper_war_overview_filter-ui ${Dn(t[54].hasOnlineFilter)}`) &&
                ie(w, "class", b),
              "online" === t[54].activeFilter
                ? gt
                  ? gt.p(t, s)
                  : ((gt = un(t)), gt.c(), gt.m(m, null))
                : gt && (gt.d(1), (gt = null)),
              t[54].showDibsColumn
                ? ft || ((ft = gn(t)), ft.c(), ft.m(f, S))
                : ft && (ft.d(1), (ft = null)),
              1 & s[0] &&
                F !==
                  (F = `__warhelper_war_overview_sort ${In(t[54], "name")}`) &&
                ie(k, "class", F),
              1 & s[0] &&
                q !==
                  (q = `__warhelper_war_overview_sort ${In(t[54], "status")}`) &&
                ie(R, "class", q),
              1 & s[0] &&
                W !==
                  (W = `__warhelper_war_overview_filter-button __warhelper_war_overview_filter-ui ${Dn(t[54].hasStatusFilter)}`) &&
                ie(O, "class", W),
              "status" === t[54].activeFilter
                ? bt
                  ? bt.p(t, s)
                  : ((bt = fn(t)), bt.c(), bt.m(L, null))
                : bt && (bt.d(1), (bt = null)),
              t[54].showScoreColumn
                ? At
                  ? At.p(t, s)
                  : ((At = _n(t)), At.c(), At.m(f, $))
                : At && (At.d(1), (At = null)),
              1 & s[0] &&
                J !==
                  (J = `__warhelper_war_overview_sort ${In(t[54], "stats")}`) &&
                ie(Y, "class", J),
              1 & s[0] &&
                et !==
                  (et = `__warhelper_war_overview_filter-button __warhelper_war_overview_filter-ui ${Dn(t[54].hasStatsFilter)}`) &&
                ie(tt, "class", et),
              "stats" === t[54].activeFilter
                ? St
                  ? St.p(t, s)
                  : ((St = wn(t)), St.c(), St.m(K, null))
                : St && (St.d(1), (St = null)),
              t[54].showAttackColumn
                ? xt || ((xt = bn(t)), xt.c(), xt.m(f, null))
                : xt && (xt.d(1), (xt = null)),
              19 & s[0] &&
                ((Ct = Se(t[54].members)),
                (lt = (function (t, e, n, s, i, r, a, o, l, c, h, d) {
                  let u = t.length,
                    p = r.length,
                    g = u;
                  const f = {};
                  for (; g--; ) f[t[g].key] = g;
                  const m = [],
                    _ = new Map(),
                    w = new Map(),
                    b = [];
                  for (g = p; g--; ) {
                    const t = d(i, r, g),
                      o = n(t);
                    let l = a.get(o);
                    (l ? s && b.push(() => l.p(t, e)) : ((l = c(o, t)), l.c()),
                      _.set(o, (m[g] = l)),
                      o in f && w.set(o, Math.abs(g - f[o])));
                  }
                  const A = new Set(),
                    y = new Set();
                  function v(t) {
                    (ve(t, 1), t.m(o, h), a.set(t.key, t), (h = t.first), p--);
                  }
                  for (; u && p; ) {
                    const e = m[p - 1],
                      n = t[u - 1],
                      s = e.key,
                      i = n.key;
                    e === n
                      ? ((h = e.first), u--, p--)
                      : _.has(i)
                        ? !a.has(s) || A.has(s)
                          ? v(e)
                          : y.has(i)
                            ? u--
                            : w.get(s) > w.get(i)
                              ? (y.add(s), v(e))
                              : (A.add(i), u--)
                        : (l(n, a), u--);
                  }
                  for (; u--; ) {
                    const e = t[u];
                    _.has(e.key) || l(e, a);
                  }
                  for (; p; ) v(m[p - 1]);
                  return (Ot(b), m);
                })(lt, s, kt, 1, t, Ct, ct, rt, xe, En, null, Ie))));
          },
          d(t) {
            (t && Yt(e),
              ht && ht.d(),
              dt && dt.d(),
              ut && ut.d(),
              gt && gt.d(),
              ft && ft.d(),
              bt && bt.d(),
              At && At.d(),
              St && St.d(),
              xt && xt.d());
            for (let t = 0; t < lt.length; t += 1) lt[t].d();
            ((at = !1), Ot(ot));
          },
        };
      }
      function cn(t) {
        let e;
        return {
          c() {
            ((e = Qt("col")),
              ie(e, "class", "__warhelper_war_overview_col-dibs"));
          },
          m(t, n) {
            zt(t, e, n);
          },
          d(t) {
            t && Yt(e);
          },
        };
      }
      function hn(t) {
        let e;
        return {
          c() {
            ((e = Qt("col")),
              ie(e, "class", "__warhelper_war_overview_col-score"));
          },
          m(t, n) {
            zt(t, e, n);
          },
          d(t) {
            t && Yt(e);
          },
        };
      }
      function dn(t) {
        let e;
        return {
          c() {
            ((e = Qt("col")),
              ie(e, "class", "__warhelper_war_overview_col-attack"));
          },
          m(t, n) {
            zt(t, e, n);
          },
          d(t) {
            t && Yt(e);
          },
        };
      }
      function un(t) {
        let e,
          n,
          s,
          i,
          r,
          a,
          o = Se(t[6]),
          l = [];
        for (let e = 0; e < o.length; e += 1) l[e] = pn(Le(t, o, e));
        function c() {
          return t[35](t[53]);
        }
        return {
          c() {
            e = Qt("form");
            for (let t = 0; t < l.length; t += 1) l[t].c();
            ((n = Xt()),
              (s = Qt("div")),
              (i = Qt("button")),
              (i.textContent = "Clear"),
              ie(i, "type", "button"),
              ie(s, "class", "__warhelper_war_overview_stats-filter-actions"),
              ie(
                e,
                "class",
                "__warhelper_war_overview_stats-filter-popover __warhelper_war_overview_controls-filter-popover __warhelper_war_overview_filter-ui",
              ));
          },
          m(o, h) {
            zt(o, e, h);
            for (let t = 0; t < l.length; t += 1) l[t] && l[t].m(e, null);
            (Kt(e, n),
              Kt(e, s),
              Kt(s, i),
              r ||
                ((a = [ee(i, "click", c), ee(e, "submit", ne(t[19]))]),
                (r = !0)));
          },
          p(s, i) {
            if (((t = s), 83 & i[0])) {
              let s;
              for (o = Se(t[6]), s = 0; s < o.length; s += 1) {
                const r = Le(t, o, s);
                l[s] ? l[s].p(r, i) : ((l[s] = pn(r)), l[s].c(), l[s].m(e, n));
              }
              for (; s < l.length; s += 1) l[s].d(1);
              l.length = o.length;
            }
          },
          d(t) {
            (t && Yt(e), Gt(l, t), (r = !1), Ot(a));
          },
        };
      }
      function pn(t) {
        let e, n, s, i, r, a, o;
        function l(...e) {
          return t[34](t[53], t[60], ...e);
        }
        return {
          c() {
            ((e = Qt("label")),
              (n = Qt("input")),
              (i = Xt()),
              (r = Qt("span")),
              (r.textContent = `${t[60].label}`),
              ie(n, "type", "checkbox"),
              (n.checked = s = t[54].onlineFilters.includes(t[60].value)),
              ie(e, "class", "__warhelper_war_overview_filter-choice"));
          },
          m(t, s) {
            (zt(t, e, s),
              Kt(e, n),
              Kt(e, i),
              Kt(e, r),
              a || ((o = ee(n, "change", l)), (a = !0)));
          },
          p(e, i) {
            ((t = e),
              1 & i[0] &&
                s !== (s = t[54].onlineFilters.includes(t[60].value)) &&
                (n.checked = s));
          },
          d(t) {
            (t && Yt(e), (a = !1), o());
          },
        };
      }
      function gn(t) {
        let e;
        return {
          c() {
            ((e = Qt("th")),
              ie(e, "class", "__warhelper_war_overview_dibs-header"));
          },
          m(t, n) {
            zt(t, e, n);
          },
          d(t) {
            t && Yt(e);
          },
        };
      }
      function fn(t) {
        let e,
          n,
          s,
          i,
          r,
          a,
          o = Se(t[5]),
          l = [];
        for (let e = 0; e < o.length; e += 1) l[e] = mn(De(t, o, e));
        function c() {
          return t[40](t[53]);
        }
        return {
          c() {
            e = Qt("form");
            for (let t = 0; t < l.length; t += 1) l[t].c();
            ((n = Xt()),
              (s = Qt("div")),
              (i = Qt("button")),
              (i.textContent = "Clear"),
              ie(i, "type", "button"),
              ie(s, "class", "__warhelper_war_overview_stats-filter-actions"),
              ie(
                e,
                "class",
                "__warhelper_war_overview_stats-filter-popover __warhelper_war_overview_filter-ui",
              ));
          },
          m(o, h) {
            zt(o, e, h);
            for (let t = 0; t < l.length; t += 1) l[t] && l[t].m(e, null);
            (Kt(e, n),
              Kt(e, s),
              Kt(s, i),
              r ||
                ((a = [ee(i, "click", c), ee(e, "submit", ne(t[18]))]),
                (r = !0)));
          },
          p(s, i) {
            if (((t = s), 51 & i[0])) {
              let s;
              for (o = Se(t[5]), s = 0; s < o.length; s += 1) {
                const r = De(t, o, s);
                l[s] ? l[s].p(r, i) : ((l[s] = mn(r)), l[s].c(), l[s].m(e, n));
              }
              for (; s < l.length; s += 1) l[s].d(1);
              l.length = o.length;
            }
          },
          d(t) {
            (t && Yt(e), Gt(l, t), (r = !1), Ot(a));
          },
        };
      }
      function mn(t) {
        let e, n, s, i, r, a, o;
        function l(...e) {
          return t[39](t[53], t[60], ...e);
        }
        return {
          c() {
            ((e = Qt("label")),
              (n = Qt("input")),
              (i = Xt()),
              (r = Qt("span")),
              (r.textContent = `${t[60].label}`),
              ie(n, "type", "checkbox"),
              (n.checked = s = t[54].statusFilters.includes(t[60].value)),
              ie(e, "class", "__warhelper_war_overview_filter-choice"));
          },
          m(t, s) {
            (zt(t, e, s),
              Kt(e, n),
              Kt(e, i),
              Kt(e, r),
              a || ((o = ee(n, "change", l)), (a = !0)));
          },
          p(e, i) {
            ((t = e),
              1 & i[0] &&
                s !== (s = t[54].statusFilters.includes(t[60].value)) &&
                (n.checked = s));
          },
          d(t) {
            (t && Yt(e), (a = !1), o());
          },
        };
      }
      function _n(t) {
        let e, n, s, i, r, a, o, l;
        function c() {
          return t[41](t[53]);
        }
        return {
          c() {
            ((e = Qt("th")),
              (n = Qt("button")),
              (s = Qt("span")),
              (s.textContent = "Score"),
              (i = Xt()),
              (r = Qt("span")),
              ie(s, "class", "__warhelper_war_overview_sort-label"),
              ie(r, "class", "__warhelper_war_overview_sort-icon"),
              ie(
                n,
                "class",
                (a = `__warhelper_war_overview_sort ${In(t[54], "score")}`),
              ),
              ie(n, "type", "button"),
              ie(e, "class", "__warhelper_war_overview_score-header"));
          },
          m(t, a) {
            (zt(t, e, a),
              Kt(e, n),
              Kt(n, s),
              Kt(n, i),
              Kt(n, r),
              o || ((l = ee(n, "click", c)), (o = !0)));
          },
          p(e, s) {
            ((t = e),
              1 & s[0] &&
                a !==
                  (a = `__warhelper_war_overview_sort ${In(t[54], "score")}`) &&
                ie(n, "class", a));
          },
          d(t) {
            (t && Yt(e), (o = !1), l());
          },
        };
      }
      function wn(t) {
        let e, n, s, i, r, a, o, l, c, h, d, u, p, g, f, m, _;
        function w(...e) {
          return t[44](t[53], ...e);
        }
        function b(...e) {
          return t[46](t[53], ...e);
        }
        function A() {
          return t[48](t[53]);
        }
        return {
          c() {
            ((e = Qt("form")),
              (n = Qt("label")),
              (s = Qt("span")),
              (s.textContent = "From"),
              (i = Xt()),
              (r = Qt("input")),
              (o = Xt()),
              (l = Qt("label")),
              (c = Qt("span")),
              (c.textContent = "To"),
              (h = Xt()),
              (d = Qt("input")),
              (p = Xt()),
              (g = Qt("div")),
              (f = Qt("button")),
              (f.textContent = "Clear"),
              ie(r, "name", "from"),
              ie(r, "inputmode", "text"),
              ie(r, "autocomplete", "off"),
              (r.value = a = t[54].statsFilter.from),
              ie(d, "name", "to"),
              ie(d, "inputmode", "text"),
              ie(d, "autocomplete", "off"),
              (d.value = u = t[54].statsFilter.to),
              ie(f, "type", "button"),
              ie(g, "class", "__warhelper_war_overview_stats-filter-actions"),
              ie(
                e,
                "class",
                "__warhelper_war_overview_stats-filter-popover __warhelper_war_overview_filter-ui",
              ));
          },
          m(a, u) {
            (zt(a, e, u),
              Kt(e, n),
              Kt(n, s),
              Kt(n, i),
              Kt(n, r),
              Kt(e, o),
              Kt(e, l),
              Kt(l, c),
              Kt(l, h),
              Kt(l, d),
              Kt(e, p),
              Kt(e, g),
              Kt(g, f),
              m ||
                ((_ = [
                  ee(r, "input", w),
                  ee(r, "keydown", t[45]),
                  ee(d, "input", b),
                  ee(d, "keydown", t[47]),
                  ee(f, "click", A),
                  ee(e, "submit", ne(t[17])),
                ]),
                (m = !0)));
          },
          p(e, n) {
            ((t = e),
              1 & n[0] &&
                a !== (a = t[54].statsFilter.from) &&
                r.value !== a &&
                (r.value = a),
              1 & n[0] &&
                u !== (u = t[54].statsFilter.to) &&
                d.value !== u &&
                (d.value = u));
          },
          d(t) {
            (t && Yt(e), (m = !1), Ot(_));
          },
        };
      }
      function bn(t) {
        let e;
        return {
          c() {
            e = Qt("th");
          },
          m(t, n) {
            zt(t, e, n);
          },
          d(t) {
            t && Yt(e);
          },
        };
      }
      function An(t) {
        let e,
          n,
          s = t[57].canDib && yn(t);
        return {
          c() {
            ((e = Qt("td")),
              (n = Qt("span")),
              s && s.c(),
              ie(n, "class", "__warhelper_war_overview_dibs-content"),
              ie(e, "class", "__warhelper_war_overview_dibs"));
          },
          m(t, i) {
            (zt(t, e, i), Kt(e, n), s && s.m(n, null));
          },
          p(t, e) {
            t[57].canDib
              ? s
                ? s.p(t, e)
                : ((s = yn(t)), s.c(), s.m(n, null))
              : s && (s.d(1), (s = null));
          },
          d(t) {
            (t && Yt(e), s && s.d());
          },
        };
      }
      function yn(t) {
        let e, n, s, i;
        return {
          c() {
            var t, n, s, i;
            ((e = Qt("span")),
              ie(e, "class", "__warhelper_dibs"),
              (e.hidden = !0),
              (t = e),
              (n = "display"),
              null == (s = "none")
                ? t.style.removeProperty(n)
                : t.style.setProperty(n, s, i ? "important" : ""));
          },
          m(r, a) {
            (zt(r, e, a),
              s ||
                ((i = Vt((n = t[14].call(null, e, t[57].userId)))), (s = !0)));
          },
          p(e, s) {
            ((t = e),
              n &&
                Wt(n.update) &&
                1 & s[0] &&
                n.update.call(null, t[57].userId));
          },
          d(t) {
            (t && Yt(e), (s = !1), i());
          },
        };
      }
      function vn(t) {
        let e,
          n,
          s = t[57].statusDisplay.icon + "";
        return {
          c() {
            ((e = Qt("span")),
              (n = Jt(s)),
              ie(e, "class", "__warhelper_status_icon"));
          },
          m(t, s) {
            (zt(t, e, s), Kt(e, n));
          },
          p(t, e) {
            1 & e[0] && s !== (s = t[57].statusDisplay.icon + "") && re(n, s);
          },
          d(t) {
            t && Yt(e);
          },
        };
      }
      function Sn(t) {
        let e, n;
        return {
          c() {
            ((e = Qt("span")),
              ie(e, "class", "__warhelper_status_flag"),
              ie(
                e,
                "style",
                (n = `background-image: url("${t[57].statusDisplay.flagUrl}");`),
              ));
          },
          m(t, n) {
            zt(t, e, n);
          },
          p(t, s) {
            1 & s[0] &&
              n !==
                (n = `background-image: url("${t[57].statusDisplay.flagUrl}");`) &&
              ie(e, "style", n);
          },
          d(t) {
            t && Yt(e);
          },
        };
      }
      function xn(t) {
        let e,
          n,
          s,
          i = t[57].statusDisplay.detailText + "";
        return {
          c() {
            ((e = Qt("span")),
              (n = Jt(i)),
              ie(
                e,
                "class",
                (s = `__warhelper_status_detail ${t[57].statusDisplay.detailClass || ""}`),
              ));
          },
          m(t, s) {
            (zt(t, e, s), Kt(e, n));
          },
          p(t, r) {
            (1 & r[0] &&
              i !== (i = t[57].statusDisplay.detailText + "") &&
              re(n, i),
              1 & r[0] &&
                s !==
                  (s = `__warhelper_status_detail ${t[57].statusDisplay.detailClass || ""}`) &&
                ie(e, "class", s));
          },
          d(t) {
            t && Yt(e);
          },
        };
      }
      function Cn(t) {
        let e,
          n,
          s = t[57].scoreDisplay + "";
        return {
          c() {
            ((e = Qt("td")),
              (n = Jt(s)),
              ie(e, "class", "__warhelper_war_overview_score"));
          },
          m(t, s) {
            (zt(t, e, s), Kt(e, n));
          },
          p(t, e) {
            1 & e[0] && s !== (s = t[57].scoreDisplay + "") && re(n, s);
          },
          d(t) {
            t && Yt(e);
          },
        };
      }
      function kn(t) {
        let e, n, s, i;
        function r() {
          return t[50](t[57]);
        }
        return {
          c() {
            ((e = Qt("td")),
              (n = Qt("button")),
              (n.textContent = "\u2694\ufe0f"),
              ie(n, "class", "__warhelper_war_overview_attack-button"),
              ie(n, "type", "button"),
              ie(n, "aria-label", "Attack"),
              ie(e, "class", "__warhelper_war_overview_attack"));
          },
          m(t, a) {
            (zt(t, e, a), Kt(e, n), s || ((i = ee(n, "click", r)), (s = !0)));
          },
          p(e, n) {
            t = e;
          },
          d(t) {
            (t && Yt(e), (s = !1), i());
          },
        };
      }
      function En(t, e) {
        let n,
          s,
          i,
          r,
          a,
          o,
          l,
          c,
          h,
          d,
          u,
          p,
          g,
          f,
          m,
          _,
          w,
          b,
          A,
          y,
          v,
          S,
          x,
          C,
          k,
          E,
          T,
          M,
          F,
          I,
          D,
          L,
          U,
          R,
          N,
          B,
          P,
          q = e[57].name + "",
          H = e[57].statusDisplay.text + "",
          O = e[57].stats.html + "";
        function W() {
          return e[49](e[57]);
        }
        let j = e[54].showDibsColumn && An(e),
          V = e[57].statusDisplay.icon && vn(e),
          $ = e[57].statusDisplay.flagUrl && Sn(e),
          K = e[57].statusDisplay.detailText && xn(e),
          z = e[54].showScoreColumn && Cn(e),
          Y = e[54].showAttackColumn && kn(e);
        return {
          key: t,
          first: null,
          c() {
            ((n = Qt("tr")),
              (s = Qt("td")),
              (i = Qt("span")),
              (r = Qt("button")),
              (a = Qt("span")),
              (o = Xt()),
              (l = Qt("span")),
              (h = Xt()),
              j && j.c(),
              (d = Xt()),
              (u = Qt("td")),
              (p = Qt("a")),
              (g = Jt(q)),
              (m = Xt()),
              (_ = Qt("td")),
              (w = Qt("span")),
              V && V.c(),
              (b = Xt()),
              $ && $.c(),
              (A = Xt()),
              (y = Qt("span")),
              (v = Jt(H)),
              (S = Xt()),
              K && K.c(),
              (E = Xt()),
              z && z.c(),
              (T = Xt()),
              (M = Qt("td")),
              (D = Xt()),
              Y && Y.c(),
              (L = Xt()),
              ie(a, "class", "__warhelper_war_overview_favorite-dot"),
              ie(l, "class", "__warhelper_war_overview_favorite-star"),
              ie(
                r,
                "class",
                (c = `__warhelper_war_overview_favorite ${e[57].onlineStatus}`),
              ),
              ie(r, "type", "button"),
              ae(r, "active", e[57].isFavorite),
              ie(i, "class", "__warhelper_war_overview_controls-content"),
              ie(s, "class", "__warhelper_war_overview_controls"),
              ie(p, "href", (f = e[57].profileHref)),
              ie(u, "class", "__warhelper_war_overview_name"),
              ie(y, "class", "__warhelper_status_text"),
              ie(w, "class", "__warhelper_status_main"),
              ie(
                _,
                "class",
                (x = `__warhelper_war_overview_status status ${e[57].statusClasses}`),
              ),
              ie(_, "data-warhelper-status-user-id", (C = e[57].userId)),
              ae(
                _,
                "__warhelper_status_multiline",
                e[57].statusDisplay.icon || e[57].statusDisplay.flagUrl,
              ),
              ie(M, "class", "__warhelper_war_overview_stats"),
              ie(M, "data-bs", (F = e[57].stats.sortValue)),
              ie(n, "data-warhelper-user-id", (U = e[57].userId)),
              ie(n, "class", (R = e[57].flashClass || "")),
              ie(
                n,
                "style",
                (N = e[57].flashDelayMs
                  ? `--wh-row-flash-delay: ${e[57].flashDelayMs}ms;`
                  : ""),
              ),
              ae(
                n,
                "__warhelper_war_overview_favorite-separator",
                e[57].favoriteSeparator,
              ),
              (this.first = n));
          },
          m(t, c) {
            (zt(t, n, c),
              Kt(n, s),
              Kt(s, i),
              Kt(i, r),
              Kt(r, a),
              Kt(r, o),
              Kt(r, l),
              Kt(n, h),
              j && j.m(n, null),
              Kt(n, d),
              Kt(n, u),
              Kt(u, p),
              Kt(p, g),
              Kt(n, m),
              Kt(n, _),
              Kt(_, w),
              V && V.m(w, null),
              Kt(w, b),
              $ && $.m(w, null),
              Kt(w, A),
              Kt(w, y),
              Kt(y, v),
              Kt(_, S),
              K && K.m(_, null),
              Kt(n, E),
              z && z.m(n, null),
              Kt(n, T),
              Kt(n, M),
              (M.innerHTML = O),
              Kt(n, D),
              Y && Y.m(n, null),
              Kt(n, L),
              B ||
                ((P = [
                  ee(r, "click", se(ne(W))),
                  Vt(
                    (k = e[15].call(null, _, {
                      userId: e[57].userId,
                      factionId: e[57].factionId,
                      active: e[57].statusDisplay.isTraveling,
                    })),
                  ),
                  Vt(
                    (I = e[16].call(null, M, {
                      content: e[57].stats.tooltip,
                      html: !0,
                      placement: "element",
                    })),
                  ),
                ]),
                (B = !0)));
          },
          p(t, s) {
            ((e = t),
              1 & s[0] &&
                c !==
                  (c = `__warhelper_war_overview_favorite ${e[57].onlineStatus}`) &&
                ie(r, "class", c),
              17 & s[0] && ae(r, "active", e[57].isFavorite),
              e[54].showDibsColumn
                ? j
                  ? j.p(e, s)
                  : ((j = An(e)), j.c(), j.m(n, d))
                : j && (j.d(1), (j = null)),
              1 & s[0] && q !== (q = e[57].name + "") && re(g, q),
              1 & s[0] && f !== (f = e[57].profileHref) && ie(p, "href", f),
              e[57].statusDisplay.icon
                ? V
                  ? V.p(e, s)
                  : ((V = vn(e)), V.c(), V.m(w, b))
                : V && (V.d(1), (V = null)),
              e[57].statusDisplay.flagUrl
                ? $
                  ? $.p(e, s)
                  : (($ = Sn(e)), $.c(), $.m(w, A))
                : $ && ($.d(1), ($ = null)),
              1 & s[0] && H !== (H = e[57].statusDisplay.text + "") && re(v, H),
              e[57].statusDisplay.detailText
                ? K
                  ? K.p(e, s)
                  : ((K = xn(e)), K.c(), K.m(_, null))
                : K && (K.d(1), (K = null)),
              1 & s[0] &&
                x !==
                  (x = `__warhelper_war_overview_status status ${e[57].statusClasses}`) &&
                ie(_, "class", x),
              1 & s[0] &&
                C !== (C = e[57].userId) &&
                ie(_, "data-warhelper-status-user-id", C),
              k &&
                Wt(k.update) &&
                1 & s[0] &&
                k.update.call(null, {
                  userId: e[57].userId,
                  factionId: e[57].factionId,
                  active: e[57].statusDisplay.isTraveling,
                }),
              17 & s[0] &&
                ae(
                  _,
                  "__warhelper_status_multiline",
                  e[57].statusDisplay.icon || e[57].statusDisplay.flagUrl,
                ),
              e[54].showScoreColumn
                ? z
                  ? z.p(e, s)
                  : ((z = Cn(e)), z.c(), z.m(n, T))
                : z && (z.d(1), (z = null)),
              1 & s[0] &&
                O !== (O = e[57].stats.html + "") &&
                (M.innerHTML = O),
              1 & s[0] &&
                F !== (F = e[57].stats.sortValue) &&
                ie(M, "data-bs", F),
              I &&
                Wt(I.update) &&
                1 & s[0] &&
                I.update.call(null, {
                  content: e[57].stats.tooltip,
                  html: !0,
                  placement: "element",
                }),
              e[54].showAttackColumn
                ? Y
                  ? Y.p(e, s)
                  : ((Y = kn(e)), Y.c(), Y.m(n, L))
                : Y && (Y.d(1), (Y = null)),
              1 & s[0] &&
                U !== (U = e[57].userId) &&
                ie(n, "data-warhelper-user-id", U),
              1 & s[0] &&
                R !== (R = e[57].flashClass || "") &&
                ie(n, "class", R),
              1 & s[0] &&
                N !==
                  (N = e[57].flashDelayMs
                    ? `--wh-row-flash-delay: ${e[57].flashDelayMs}ms;`
                    : "") &&
                ie(n, "style", N),
              17 & s[0] &&
                ae(
                  n,
                  "__warhelper_war_overview_favorite-separator",
                  e[57].favoriteSeparator,
                ));
          },
          d(t) {
            (t && Yt(n),
              j && j.d(),
              V && V.d(),
              $ && $.d(),
              K && K.d(),
              z && z.d(),
              Y && Y.d(),
              (B = !1),
              Ot(P));
          },
        };
      }
      function Tn(t) {
        let e,
          n,
          s = t[54].emptyText + "";
        return {
          c() {
            ((e = Qt("div")),
              (n = Jt(s)),
              ie(e, "class", "__warhelper_war_overview_empty"));
          },
          m(t, s) {
            (zt(t, e, s), Kt(e, n));
          },
          p(t, e) {
            1 & e[0] && s !== (s = t[54].emptyText + "") && re(n, s);
          },
          d(t) {
            t && Yt(e);
          },
        };
      }
      function Mn(t) {
        let e,
          n = t[54] && sn(t);
        return {
          c() {
            (n && n.c(), (e = te()));
          },
          m(t, s) {
            (n && n.m(t, s), zt(t, e, s));
          },
          p(t, s) {
            t[54]
              ? n
                ? n.p(t, s)
                : ((n = sn(t)), n.c(), n.m(e.parentNode, e))
              : n && (n.d(1), (n = null));
          },
          d(t) {
            (t && Yt(e), n && n.d(t));
          },
        };
      }
      function Fn(t) {
        let e,
          n,
          s,
          i,
          r,
          a,
          o,
          l,
          c,
          h,
          d,
          u,
          p,
          g,
          f,
          m,
          _,
          w,
          b,
          A,
          y,
          v = t[0].stateText + "",
          S = t[0].decayGraph?.expanded ? "^" : "v";
        function x(t, e) {
          return t[0].decayEnd ? Oe : He;
        }
        let C = x(t),
          k = C(t),
          E = t[0].decayGraph?.expanded && je(qe(t)),
          T = t[0].opponentChain && tn(t),
          M = Se(t[4]),
          F = [];
        for (let e = 0; e < M.length; e += 1) F[e] = nn(Re(t, M, e));
        let I = Se(t[4]),
          D = [];
        for (let e = 0; e < I.length; e += 1) D[e] = Mn(Fe(t, I, e));
        return {
          c() {
            ((e = Qt("div")),
              (n = Qt("span")),
              (n.textContent = "War Helper"),
              (s = Xt()),
              (i = Qt("span")),
              (r = Jt(v)),
              (a = Xt()),
              (o = Qt("div")),
              k.c(),
              (l = Xt()),
              (c = Qt("button")),
              (c.textContent = "\u21bb"),
              (h = Xt()),
              (d = Qt("span")),
              (u = Jt(S)),
              (g = Xt()),
              E && E.c(),
              (f = Xt()),
              T && T.c(),
              (m = Xt()),
              (_ = Qt("div")));
            for (let t = 0; t < F.length; t += 1) F[t].c();
            ((w = Xt()), (b = Qt("div")));
            for (let t = 0; t < D.length; t += 1) D[t].c();
            (ie(n, "class", "__warhelper_war_overview_title"),
              ie(i, "class", "__warhelper_war_overview_state"),
              ie(e, "class", "__warhelper_war_overview_header"),
              ie(c, "class", "__warhelper_war_overview_decay-refresh"),
              ie(c, "type", "button"),
              ie(c, "aria-label", "Refresh war data"),
              ie(d, "class", "__warhelper_war_overview_decay-toggle"),
              ie(o, "class", "__warhelper_war_overview_decay"),
              ie(o, "role", "button"),
              ie(o, "tabindex", "0"),
              ie(o, "aria-expanded", (p = t[0].decayGraph?.expanded)),
              ie(_, "class", "__warhelper_war_overview_mobile-tabs"),
              ie(_, "role", "tablist"),
              ie(_, "aria-label", "War factions"),
              ae(b, "__warhelper_war_overview_columns", !0),
              ae(
                b,
                "__warhelper_war_overview_columns_enemy-collapsed",
                t[0].tables.enemy?.collapsed,
              ),
              ae(
                b,
                "__warhelper_war_overview_columns_own-collapsed",
                t[0].tables.own?.collapsed,
              ));
          },
          m(p, v) {
            (zt(p, e, v),
              Kt(e, n),
              Kt(e, s),
              Kt(e, i),
              Kt(i, r),
              zt(p, a, v),
              zt(p, o, v),
              k.m(o, null),
              Kt(o, l),
              Kt(o, c),
              Kt(o, h),
              Kt(o, d),
              Kt(d, u),
              zt(p, g, v),
              E && E.m(p, v),
              zt(p, f, v),
              T && T.m(p, v),
              zt(p, m, v),
              zt(p, _, v));
            for (let t = 0; t < F.length; t += 1) F[t] && F[t].m(_, null);
            (zt(p, w, v), zt(p, b, v));
            for (let t = 0; t < D.length; t += 1) D[t] && D[t].m(b, null);
            A ||
              ((y = [
                ee(c, "click", t[23]),
                ee(o, "click", t[9]),
                ee(o, "keydown", t[8]),
              ]),
              (A = !0));
          },
          p(t, e) {
            if (
              (1 & e[0] && v !== (v = t[0].stateText + "") && re(r, v),
              C === (C = x(t)) && k
                ? k.p(t, e)
                : (k.d(1), (k = C(t)), k && (k.c(), k.m(o, l))),
              1 & e[0] &&
                S !== (S = t[0].decayGraph?.expanded ? "^" : "v") &&
                re(u, S),
              1 & e[0] &&
                p !== (p = t[0].decayGraph?.expanded) &&
                ie(o, "aria-expanded", p),
              t[0].decayGraph?.expanded
                ? E
                  ? E.p(qe(t), e)
                  : ((E = je(qe(t))), E.c(), E.m(f.parentNode, f))
                : E && (E.d(1), (E = null)),
              t[0].opponentChain
                ? T
                  ? T.p(t, e)
                  : ((T = tn(t)), T.c(), T.m(m.parentNode, m))
                : T && (T.d(1), (T = null)),
              1043 & e[0])
            ) {
              let n;
              for (M = Se(t[4]), n = 0; n < M.length; n += 1) {
                const s = Re(t, M, n);
                F[n]
                  ? F[n].p(s, e)
                  : ((F[n] = nn(s)), F[n].c(), F[n].m(_, null));
              }
              for (; n < F.length; n += 1) F[n].d(1);
              F.length = M.length;
            }
            if (2299 & e[0]) {
              let n;
              for (I = Se(t[4]), n = 0; n < I.length; n += 1) {
                const s = Fe(t, I, n);
                D[n]
                  ? D[n].p(s, e)
                  : ((D[n] = Mn(s)), D[n].c(), D[n].m(b, null));
              }
              for (; n < D.length; n += 1) D[n].d(1);
              D.length = I.length;
            }
            (1 & e[0] &&
              ae(
                b,
                "__warhelper_war_overview_columns_enemy-collapsed",
                t[0].tables.enemy?.collapsed,
              ),
              1 & e[0] &&
                ae(
                  b,
                  "__warhelper_war_overview_columns_own-collapsed",
                  t[0].tables.own?.collapsed,
                ));
          },
          i: Pt,
          o: Pt,
          d(t) {
            (t &&
              (Yt(e), Yt(a), Yt(o), Yt(g), Yt(f), Yt(m), Yt(_), Yt(w), Yt(b)),
              k.d(),
              E && E.d(t),
              T && T.d(t),
              Gt(F, t),
              Gt(D, t),
              (A = !1),
              Ot(y));
          },
        };
      }
      function In(t, e) {
        return t.sortState.field !== e
          ? ""
          : t.sortState.asc
            ? "active asc"
            : "active desc";
      }
      function Dn(t) {
        return t ? "active" : "";
      }
      function Ln(t) {
        (t.preventDefault(), t.stopPropagation());
      }
      function Un(t, e) {
        return t.x > e.width - 188 - 10 ? t.x - 188 - 10 : t.x + 10;
      }
      function Rn(t, e) {
        const n = t.scoreY - 39;
        return Math.max(8, Math.min(n, e.height - 78 - 8));
      }
      function Nn(t, e, n) {
        let {
            state: s = {
              stateText: "",
              bypassBodyHold: !1,
              decayEnd: null,
              opponentChain: null,
              decayGraph: { expanded: !1, hasData: !1 },
              tables: { enemy: void 0, own: void 0 },
            },
          } = e,
          { actions: i = {} } = e,
          r = null,
          a = !1;
        function o(t, e, n = !1) {
          a ||
            ("Enter" !== t.key && " " !== t.key) ||
            (t.preventDefault(),
            (n && !s.tables[e]?.collapsed) || i.toggleCollapse?.(e));
        }
        function l() {
          (n(2, (r = null)), i.toggleDecayGraph?.());
        }
        function c(t, e) {
          ("Enter" !== t.key && " " !== t.key) ||
            (t.preventDefault(), i.setActiveMobileTab?.(e));
        }
        function h(t, e) {
          (t.stopPropagation(), a || i.toggleCollapse?.(e));
        }
        function d(t, e) {
          if (!e?.hoverPoints?.length) return void n(2, (r = null));
          const s = t.currentTarget.getBoundingClientRect(),
            i = (t.clientX - s.left) * (e.width / s.width);
          let a = e.hoverPoints[0],
            o = Math.abs(a.x - i);
          for (let t = 1; t < e.hoverPoints.length; t++) {
            const n = e.hoverPoints[t],
              s = Math.abs(n.x - i);
            s < o && ((a = n), (o = s));
          }
          n(2, (r = a));
        }
        le(() => {
          const t = window.matchMedia("(max-width: 784px)"),
            e = () => {
              n(3, (a = t.matches));
            };
          return (
            e(),
            "function" == typeof t.addEventListener
              ? (t.addEventListener("change", e),
                () => t.removeEventListener("change", e))
              : (t.addListener(e), () => t.removeListener(e))
          );
        });
        return (
          (t.$$set = (t) => {
            ("state" in t && n(0, (s = t.state)),
              "actions" in t && n(1, (i = t.actions)));
          }),
          [
            s,
            i,
            r,
            a,
            ["enemy", "own"],
            [
              { value: "okay", label: "Okay" },
              { value: "hospital", label: "Hospital" },
              { value: "jail", label: "Jail" },
              { value: "traveling", label: "Travelling" },
              { value: "abroad", label: "Abroad" },
            ],
            [
              { value: "online", label: "Online" },
              { value: "idle", label: "Idle" },
              { value: "offline", label: "Offline" },
            ],
            o,
            function (t) {
              ("Enter" !== t.key && " " !== t.key) || (t.preventDefault(), l());
            },
            l,
            c,
            h,
            d,
            function () {
              n(2, (r = null));
            },
            function (t, e) {
              return (
                i.bindDibs?.(t, e),
                {
                  update(e) {
                    i.bindDibs?.(t, e);
                  },
                  destroy() {
                    ((t.hidden = !0),
                      (t.style.display = "none"),
                      (t.textContent = ""));
                  },
                }
              );
            },
            function (t, e) {
              return (
                i.bindFlyStatus?.(t, e),
                {
                  update(e) {
                    i.bindFlyStatus?.(t, e);
                  },
                }
              );
            },
            function (t, e) {
              return j.bind(t, e);
            },
            function (e) {
              ce.call(this, t, e);
            },
            function (e) {
              ce.call(this, t, e);
            },
            function (e) {
              ce.call(this, t, e);
            },
            function (e) {
              ce.call(this, t, e);
            },
            function (e) {
              ce.call(this, t, e);
            },
            function (e) {
              ce.call(this, t, e);
            },
            (t) => {
              (Ln(t), i.refreshWarData?.());
            },
            (t, e) => d(e, t),
            (t) => {
              (Ln(t), i.refreshOpponentChain?.());
            },
            (t) => i.setActiveMobileTab?.(t),
            (t, e) => c(e, t),
            (t, e) => {
              (Ln(e), i.toggleSettings?.(t));
            },
            (t, e, n) =>
              i.setOptionalColumnVisible?.(t, e.id, n.currentTarget.checked),
            (t) => "Escape" === t.key && i.closeFilters?.(),
            (t, e) => h(e, t),
            (t, e) => o(e, t),
            (t, e) => {
              (Ln(e), i.toggleFilter?.(t, "online"));
            },
            (t, e, n) =>
              i.setChoiceFilter?.(
                t,
                "online",
                e.value,
                n.currentTarget.checked,
              ),
            (t) => i.clearChoiceFilter?.(t, "online"),
            (t) => i.toggleSort?.(t, "name"),
            (t) => i.toggleSort?.(t, "status"),
            (t, e) => {
              (Ln(e), i.toggleFilter?.(t, "status"));
            },
            (t, e, n) =>
              i.setChoiceFilter?.(
                t,
                "status",
                e.value,
                n.currentTarget.checked,
              ),
            (t) => i.clearChoiceFilter?.(t, "status"),
            (t) => i.toggleSort?.(t, "score"),
            (t) => i.toggleSort?.(t, "stats"),
            (t, e) => {
              (Ln(e), i.toggleFilter?.(t, "stats"));
            },
            (t, e) => i.setStatsFilter?.(t, "from", e.currentTarget.value),
            (t) => "Escape" === t.key && i.closeFilters?.(),
            (t, e) => i.setStatsFilter?.(t, "to", e.currentTarget.value),
            (t) => "Escape" === t.key && i.closeFilters?.(),
            (t) => i.clearStatsFilter?.(t),
            (t) => i.toggleFavorite?.(t.userId),
            (t) => i.openAttack?.(t.userId),
            (t, e) => !a && t.collapsed && i.toggleCollapse?.(e),
            (t, e) => o(e, t, !0),
          ]
        );
      }
      "undefined" != typeof window &&
        (window.__svelte || (window.__svelte = { v: new Set() })).v.add("4");
      var Bn = class extends Me {
          constructor(t) {
            (super(),
              Ee(
                this,
                t,
                Nn,
                Fn,
                jt,
                { state: 0, actions: 1 },
                null,
                [-1, -1, -1],
              ));
          }
        },
        Pn = class t {
          constructor(e, n) {
            if (
              ((this.iframeHandle = null),
              (this.attackPageHandle = null),
              !t.openInFrame)
            )
              return void window.open(e, n);
            ((this.iframeHandle = document.createElement("div")),
              (this.iframeHandle.className = "__warhelper_iframe"));
            const s = document.createElement("iframe");
            ((s.className = "__warhelper_iframe"),
              s.addEventListener("load", () => {
                try {
                  (s.contentDocument &&
                    t.attachEscapeListener(s.contentDocument),
                    o() &&
                      (this.attackPageHandle?.destroy(),
                      (this.attackPageHandle = bt.attachIframe(s))));
                } catch (t) {
                  console.warn("[WarHelper Tab] Failed to wire iframe", t);
                }
              }),
              (s.src = e),
              this.iframeHandle.appendChild(s));
            const i = document.createElement("div");
            ((i.textContent = "x"),
              (i.title = "Close"),
              this.iframeHandle.appendChild(i),
              i.addEventListener("click", () => this.close()),
              document.body.insertBefore(
                this.iframeHandle,
                document.body.firstChild,
              ),
              t.instances.add(this));
          }
          static {
            this.openInFrame = !0;
          }
          static {
            this.instances = new Set();
          }
          static {
            this.escapeListeners = new WeakSet();
          }
          static {
            (l(
              "\nhtml:has(iframe.__warhelper_iframe)  {\n  overflow: hidden !important;\n}\n\ndiv.__warhelper_iframe > iframe {\n  position: fixed;\n  z-index: 2147483647;\n  width: calc(100vw);\n  height: calc(100vh);\n  overflow: auto !important;\n}\n\ndiv.__warhelper_iframe > div {\n  position: fixed;\n  z-index: 2147483647;\n  top: 0;\n  right: 0;\n  font-size: 60px;\n  cursor: pointer;\n  padding: 10px;\n}\n",
            ),
              (this.openInFrame = this.getOpenInFrame()),
              x.onChange("open_attack_in_frame", () => {
                this.openInFrame = this.getOpenInFrame();
              }),
              this.attachEscapeListener(document));
          }
          static closeAll() {
            Array.from(this.instances).forEach((t) => t.close());
          }
          static getOpenInFrame() {
            return "true" === x.get("open_attack_in_frame");
          }
          static attachEscapeListener(e) {
            this.escapeListeners.has(e) ||
              (this.escapeListeners.add(e),
              e.addEventListener(
                "keydown",
                (e) => {
                  ("Escape" !== e.key && "Esc" !== e.key) || t.closeAll();
                },
                !0,
              ));
          }
          close() {
            (this.attackPageHandle?.destroy(),
              (this.attackPageHandle = null),
              this.iframeHandle &&
                (this.iframeHandle.remove(), (this.iframeHandle = null)),
              t.instances.delete(this));
          }
        },
        qn = ".f-war-list .desc-wrap",
        Hn = "__warhelper_war_original_hidden",
        On = "__warhelper_war_original_visible",
        Wn = "__warhelper_war_overview",
        jn = "__warhelper_hide_whore",
        Vn = "__warhelper_ff_bgcolor",
        $n = "war_overview_sort_states",
        Kn = "war_overview_stats_filters",
        zn = "war_overview_status_filters",
        Yn = "war_overview_online_filters",
        Gn = "war_overview_column_visibility",
        Qn = 4600,
        Zn = 158,
        Jn = "chain.state",
        Xn = "chain.refresh",
        ts = ["okay", "hospital", "jail", "traveling", "abroad"],
        es = ["online", "idle", "offline"],
        ns = [{ id: "score", label: "Score" }];
      function ss(t, e) {
        const n = { enemy: [], own: [] },
          s = S.get(t);
        return s && "object" == typeof s
          ? (["enemy", "own"].forEach((t) => {
              const i = s[t];
              Array.isArray(i) &&
                (n[t] = i.filter((t) => "string" == typeof t && e.includes(t)));
            }),
            n)
          : n;
      }
      (class {
        static {
          this.mounts = new Map();
        }
        static {
          this.stats = new Map();
        }
        static {
          this.spySources = new Map();
        }
        static {
          this.pendingStatsByFaction = new Map();
        }
        static {
          this.requestedSpyUsers = new Set();
        }
        static {
          this.statsLoadGeneration = 0;
        }
        static {
          this.userScoreLoaded = !1;
        }
        static {
          this.pendingUserScore = null;
        }
        static {
          this.sortStates = (function () {
            const t = {
                enemy: { field: "status", asc: !0 },
                own: { field: "status", asc: !0 },
              },
              e = S.get($n);
            return e && "object" == typeof e
              ? (["enemy", "own"].forEach((n) => {
                  const s = e[n];
                  var i;
                  s &&
                    "object" == typeof s &&
                    (("name" === (i = s.field) ||
                      "status" === i ||
                      "stats" === i ||
                      "score" === i) &&
                      (t[n].field = s.field),
                    "boolean" == typeof s.asc && (t[n].asc = s.asc));
                }),
                t)
              : t;
          })();
        }
        static {
          this.statsFilters = (function () {
            const t = {
                enemy: { from: "", to: "" },
                own: { from: "", to: "" },
              },
              e = S.get(Kn);
            return e && "object" == typeof e
              ? (["enemy", "own"].forEach((n) => {
                  const s = e[n];
                  s &&
                    "object" == typeof s &&
                    ("string" == typeof s.from && (t[n].from = s.from),
                    "string" == typeof s.to && (t[n].to = s.to));
                }),
                t)
              : t;
          })();
        }
        static {
          this.statusFilters = ss(zn, ts);
        }
        static {
          this.onlineFilters = ss(Yn, es);
        }
        static {
          this.columnVisibility = (function () {
            const t = { enemy: { score: !1 }, own: { score: !1 } },
              e = S.get(Gn);
            return e && "object" == typeof e
              ? (["enemy", "own"].forEach((n) => {
                  const s = e[n];
                  s &&
                    "object" == typeof s &&
                    ns.forEach((e) => {
                      "boolean" == typeof s[e.id] && (t[n][e.id] = s[e.id]);
                    });
                }),
                ns.forEach((n) => {
                  "boolean" == typeof e[n.id] &&
                    ((t.enemy[n.id] = e[n.id]), (t.own[n.id] = e[n.id]));
                }),
                t)
              : t;
          })();
        }
        static {
          this.collapsedPanels = { enemy: !1, own: !1 };
        }
        static {
          this.activeSettings = null;
        }
        static {
          this.activeStatsFilter = null;
        }
        static {
          this.activeStatusFilter = null;
        }
        static {
          this.activeOnlineFilter = null;
        }
        static {
          this.decayGraphExpanded = !1;
        }
        static {
          this.renderedOnlineStatuses = new Map();
        }
        static {
          this.pendingOnlineFlashes = new Map();
        }
        static {
          this.bypassBodyInteractionHoldForNextUpdate = !1;
        }
        static {
          this.activeMobileTab = "enemy";
        }
        static {
          this.opponentChain = null;
        }
        static {
          this.opponentChainRequest = null;
        }
        static {
          this.opponentChainLastRequestAt = 0;
        }
        static {
          this.opponentChainExpiredRefreshKey = null;
        }
        static {
          this.timerStarted = !1;
        }
        static {
          this.revision = 0;
        }
        static {
          this.actions = {
            toggleDecayGraph: () => this.toggleDecayGraph(),
            refreshWarData: () => {
              this.refreshWarData();
            },
            refreshOpponentChain: () => this.refreshOpponentChain(),
            setActiveMobileTab: (t) => this.setActiveMobileTab(t),
            toggleSettings: (t) => this.toggleSettings(t),
            toggleCollapse: (t) => this.togglePanelCollapsed(t),
            toggleSort: (t, e) => this.toggleSort(t, e),
            toggleFilter: (t, e) => this.toggleFilter(t, e),
            closeFilters: () => this.closeFilters(),
            setStatsFilter: (t, e, n) => this.updateStatsFilter(t, e, n),
            clearStatsFilter: (t) => this.clearStatsFilter(t),
            setChoiceFilter: (t, e, n, s) =>
              this.updateChoiceFilter(t, e, n, s),
            clearChoiceFilter: (t, e) => this.clearChoiceFilter(t, e),
            setOptionalColumnVisible: (t, e, n) =>
              this.updateOptionalColumnVisibility(t, e, n),
            toggleFavorite: (t) => this.toggleFavorite(t),
            openAttack: (t) => this.openAttackPage(t),
            bindDibs: (t, e) => this.bindDibs(t, e),
            bindFlyStatus: (t, e) => this.bindFlyStatus(t, e),
          };
        }
        static {
          this.init();
        }
        static init() {
          m() &&
            (this.injectStyle(),
            this.syncConfigClasses(),
            this.updateOriginalVisibility(),
            At.onAdd(qn, (t) => this.mount(t)),
            O.on("UserStatusChanged", () => this.scheduleMountedUpdates()),
            O.on("WarStatusChanged", () => this.scheduleMountedUpdates()),
            O.on("WarGraphChanged", () => this.scheduleMountedUpdates()),
            G.onDataChange(() => this.scheduleMountedUpdates()),
            Nt.onChange(() => this.scheduleMountedUpdates()),
            S.onBust(() => this.reloadStats()),
            ["tornstats_key", "bsp_key", "ffs_key", "yata_key"].forEach((t) => {
              x.onChange(t, () => this.reloadStats());
            }),
            x.onChange("spy_source_order", () =>
              this.applySpySourcePreference(),
            ),
            x.onChange("show_original_war_view", () =>
              this.updateOriginalVisibility(),
            ),
            x.onChange("hide_whore", () => this.syncConfigClasses()),
            x.onChange("ffcolor_bg", () => this.syncConfigClasses()),
            x.onChange("opponent_chain_tracker", () =>
              this.resetOpponentChain(),
            ),
            x.onChange("torn_key", () => this.resetOpponentChain()),
            yt.on(Jn, (t) => this.handleOpponentChainStateMessage(t)),
            yt.on(Xn, (t) => this.handleOpponentChainRefreshMessage(t)),
            yt.onMasterChange(() => this.scheduleMountedUpdates()),
            document.addEventListener("click", (t) =>
              this.closeFiltersOnOutsideClick(t),
            ),
            this.startTimer());
        }
        static syncConfigClasses() {
          this.mounts.forEach((t) =>
            this.syncOverviewConfigClasses(t.overview),
          );
        }
        static syncOverviewConfigClasses(t) {
          (t.classList.toggle(jn, "true" === x.get("hide_whore")),
            t.classList.toggle(Vn, "true" === x.get("ffcolor_bg")));
        }
        static injectStyle() {
          l(
            `\nbody.${Hn} ${qn} {\n  display: none !important;\n}\n\nbody.${On} .${Wn} {\n  display: none !important;\n}\n\n.${Wn} {\n  --wh-bg: #ffffff;\n  --wh-popover-bg: #ffffff;\n  --wh-panel-bg: #f8f9fa;\n  --wh-border: rgba(20, 24, 28, 0.16);\n  --wh-border-soft: rgba(20, 24, 28, 0.1);\n  --wh-muted: #5d6670;\n  --wh-link: #225f9f;\n  --wh-filter-active: #2270a8;\n  --wh-row-odd: rgba(255, 255, 255, 0.86);\n  --wh-row-even: rgba(245, 247, 249, 0.92);\n  --wh-row-hover: rgba(226, 237, 247, 0.92);\n  --wh-row-online-pop: rgba(92, 184, 92, 0.32);\n  --wh-row-idle-pop: rgba(214, 185, 76, 0.34);\n  --wh-controls-col-width: 28px;\n  --wh-dibs-col-width: 34px;\n  --wh-status-col-width: 60px;\n  --wh-score-col-width: 54px;\n  --wh-stats-col-width: 70px;\n  --wh-attack-col-width: 25px;\n  --wh-attack-bg: rgba(178, 52, 52, 0.88);\n  --wh-attack-border: rgba(150, 40, 40, 0.9);\n  --wh-attack-hover: rgba(198, 58, 58, 0.95);\n  box-sizing: border-box;\n  width: 100%;\n  margin: 0 0 8px;\n  padding: 8px 10px;\n  border: 1px solid var(--wh-border);\n  border-radius: 4px;\n  background: var(--wh-bg);\n  color: #222;\n}\n\nbody.dark-mode .${Wn} {\n  --wh-bg: rgba(20, 24, 28, 0.72);\n  --wh-popover-bg: #20252b;\n  --wh-panel-bg: rgba(255, 255, 255, 0.035);\n  --wh-border: rgba(255, 255, 255, 0.18);\n  --wh-border-soft: rgba(255, 255, 255, 0.1);\n  --wh-muted: #aeb6bf;\n  --wh-link: #9cc9ff;\n  --wh-filter-active: #5bc0de;\n  --wh-row-odd: rgba(255, 255, 255, 0.045);\n  --wh-row-even: rgba(255, 255, 255, 0.075);\n  --wh-row-hover: rgba(91, 192, 222, 0.16);\n  --wh-row-online-pop: rgba(92, 184, 92, 0.26);\n  --wh-row-idle-pop: rgba(214, 185, 76, 0.28);\n  --wh-attack-bg: rgba(140, 35, 35, 0.78);\n  --wh-attack-border: rgba(180, 70, 70, 0.85);\n  --wh-attack-hover: rgba(170, 45, 45, 0.9);\n  color: inherit;\n}\n\n.${Wn}_header {\n  position: relative;\n  display: flex;\n  align-items: center;\n  justify-content: flex-start;\n  gap: 8px;\n  min-height: 20px;\n  font-weight: 700;\n}\n\n.${Wn}_title {\n  flex: 1 1 auto;\n  min-width: 0;\n}\n\n.${Wn}_state {\n  flex: 0 0 auto;\n  margin-left: auto;\n  font-size: 11px;\n  font-weight: 400;\n  color: var(--wh-muted);\n}\n\n.${Wn}_decay {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  flex-wrap: wrap;\n  margin-top: 8px;\n  padding: 7px 8px;\n  border: 1px solid var(--wh-border-soft);\n  border-radius: 4px;\n  background: var(--wh-panel-bg);\n  font-size: 11px;\n  line-height: 15px;\n  cursor: pointer;\n}\n\n.${Wn}_decay:hover {\n  border-color: var(--wh-border);\n}\n\n.${Wn}_chain {\n  cursor: default;\n}\n\n.${Wn}_chain:hover {\n  border-color: var(--wh-border-soft);\n}\n\n.${Wn}_decay-label {\n  flex: 0 0 auto;\n  font-weight: 700;\n  color: var(--wh-muted);\n  text-transform: uppercase;\n}\n\n.${Wn}_decay-timer {\n  flex: 0 0 auto;\n  color: inherit;\n}\n\n.${Wn}_decay-summary {\n  display: flex;\n  align-items: center;\n  gap: 5px;\n  flex-wrap: wrap;\n  flex: 1 1 auto;\n  min-width: 0;\n  color: var(--wh-muted);\n}\n\n.${Wn}_decay-empty {\n  color: var(--wh-muted);\n}\n\n.${Wn}_decay-toggle {\n  flex: 0 0 auto;\n  color: var(--wh-muted);\n  font-size: 12px;\n  font-weight: 700;\n}\n\n.${Wn}_decay-refresh {\n  flex: 0 0 auto;\n  width: 22px;\n  height: 22px;\n  margin-left: auto;\n  padding: 0;\n  border: 1px solid var(--wh-border-soft);\n  border-radius: 3px;\n  background: transparent;\n  color: var(--wh-muted);\n  cursor: pointer;\n  font: inherit;\n  font-size: 15px;\n  line-height: 20px;\n}\n\n.${Wn}_decay-refresh:hover {\n  color: var(--wh-filter-active);\n  background: rgba(91, 192, 222, 0.12);\n}\n\n.${Wn}_graph {\n  margin-top: 7px;\n  padding: 6px;\n  border: 1px solid var(--wh-border-soft);\n  border-radius: 4px;\n  background: #2f3030;\n  overflow: hidden;\n}\n\n.${Wn}_graph-empty {\n  padding: 10px;\n  color: #c1c6c9;\n  font-size: 11px;\n}\n\n.${Wn}_graph-svg {\n  display: block;\n  width: 100%;\n  height: auto;\n  cursor: crosshair;\n  touch-action: none;\n}\n\n.${Wn}_graph-bg {\n  fill: #333434;\n}\n\n.${Wn}_graph-positive-bg {\n  fill: rgba(131, 168, 21, 0.32);\n}\n\n.${Wn}_graph-negative-bg {\n  fill: rgba(191, 86, 48, 0.28);\n}\n\n.${Wn}_graph-grid {\n  stroke: rgba(0, 0, 0, 0.68);\n  stroke-width: 1;\n  shape-rendering: crispEdges;\n}\n\n.${Wn}_graph-zero {\n  stroke: rgba(225, 230, 232, 0.5);\n  stroke-width: 1;\n  shape-rendering: crispEdges;\n}\n\n.${Wn}_graph-axis-label,\n.${Wn}_graph-axis-title {\n  fill: #9ca2a5;\n  font-size: 11px;\n  line-height: 1;\n}\n\n.${Wn}_graph-axis-title {\n  font-weight: 600;\n}\n\n.${Wn}_graph-faction-label {\n  font-size: 25px;\n  font-weight: 700;\n  opacity: 0.82;\n  text-anchor: middle;\n  dominant-baseline: middle;\n  paint-order: stroke;\n  stroke: rgba(25, 26, 26, 0.72);\n  stroke-width: 3px;\n  stroke-linejoin: round;\n  pointer-events: none;\n}\n\n.${Wn}_graph-faction-label-positive {\n  fill: #93bc1d;\n}\n\n.${Wn}_graph-faction-label-negative {\n  fill: #f07745;\n}\n\n.${Wn}_graph-goal {\n  fill: none;\n  stroke-width: 2;\n  stroke-linecap: round;\n  stroke-linejoin: round;\n}\n\n.${Wn}_graph-goal-positive {\n  stroke: #86b11a;\n}\n\n.${Wn}_graph-goal-negative {\n  stroke: #df6d3f;\n}\n\n.${Wn}_graph-score {\n  fill: none;\n  stroke-width: 2;\n  stroke-linecap: round;\n  stroke-linejoin: round;\n}\n\n.${Wn}_graph-score-positive {\n  stroke: #9ad51d;\n}\n\n.${Wn}_graph-score-negative {\n  stroke: #ff7348;\n}\n\n.${Wn}_graph-hover-line {\n  stroke: rgba(255, 255, 255, 0.58);\n  stroke-width: 1;\n  stroke-dasharray: 3 3;\n  shape-rendering: crispEdges;\n}\n\n.${Wn}_graph-hover-dot {\n  fill: #f5f7f8;\n  stroke: #111;\n  stroke-width: 1;\n}\n\n.${Wn}_graph-tooltip {\n  pointer-events: none;\n}\n\n.${Wn}_graph-tooltip rect {\n  fill: rgba(16, 18, 20, 0.94);\n  stroke: rgba(255, 255, 255, 0.22);\n  stroke-width: 1;\n}\n\n.${Wn}_graph-tooltip text {\n  fill: #edf1f3;\n  font-size: 11px;\n}\n\n.${Wn}_settings-wrap {\n  position: relative;\n  flex: 0 0 auto;\n}\n\n.${Wn}_settings-button {\n  width: 20px;\n  height: 20px;\n  padding: 0;\n  border: 0;\n  border-radius: 3px;\n  background: transparent;\n  color: var(--wh-muted);\n  cursor: pointer;\n  font: inherit;\n  font-size: 15px;\n  line-height: 20px;\n}\n\n.${Wn}_settings-button:hover,\n.${Wn}_settings-button.active {\n  color: var(--wh-filter-active);\n  background: rgba(91, 192, 222, 0.12);\n}\n\n.${Wn}_mobile-tabs {\n  display: none;\n}\n\n.${Wn}_columns {\n  display: grid;\n  grid-template-columns: repeat(2, minmax(0, 1fr));\n  gap: 8px;\n  margin-top: 8px;\n}\n\n.${Wn}_columns.${Wn}_columns_enemy-collapsed {\n  grid-template-columns: 36px minmax(0, 1fr);\n}\n\n.${Wn}_columns.${Wn}_columns_own-collapsed {\n  grid-template-columns: minmax(0, 1fr) 36px;\n}\n\n.${Wn}_columns.${Wn}_columns_enemy-collapsed.${Wn}_columns_own-collapsed {\n  grid-template-columns: 36px 36px;\n}\n\n.${Wn}_panel {\n  min-width: 0;\n  border: 1px solid var(--wh-border);\n  border-radius: 4px;\n  background: var(--wh-panel-bg);\n  overflow: hidden;\n}\n\n.${Wn}_panel-title {\n  position: relative;\n  z-index: 40;\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 8px;\n  padding: 6px 8px;\n  border-bottom: 1px solid var(--wh-border-soft);\n  cursor: pointer;\n  font-weight: 700;\n}\n\n.${Wn}_panel-body {\n  position: relative;\n  z-index: 1;\n}\n\n.${Wn}_panel-title-text {\n  flex: 1 1 auto;\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n\n.${Wn}_collapse-button {\n  flex: 0 0 auto;\n  width: 20px;\n  height: 20px;\n  padding: 0;\n  border: 0;\n  border-radius: 3px;\n  background: transparent;\n  color: var(--wh-muted);\n  cursor: pointer;\n  font: inherit;\n  line-height: 18px;\n}\n\n.${Wn}_collapse-button:hover {\n  background: var(--wh-border-soft);\n  color: inherit;\n}\n\n.${Wn}_panel-collapsed .${Wn}_panel-title {\n  min-height: 150px;\n  padding: 8px 4px;\n  border-bottom: 0;\n  writing-mode: vertical-rl;\n  text-orientation: mixed;\n  justify-content: center;\n}\n\n.${Wn}_panel-collapsed {\n  cursor: pointer;\n}\n\n.${Wn}_panel-collapsed .${Wn}_collapse-button {\n  writing-mode: horizontal-tb;\n}\n\n.${Wn}_panel-collapsed .${Wn}_panel-body {\n  display: none;\n}\n\n.${Wn}_table {\n  width: 100%;\n  border-collapse: separate;\n  border-spacing: 0;\n  table-layout: fixed;\n  -webkit-touch-callout: none;\n  -webkit-user-select: none;\n  -moz-user-select: none;\n  -ms-user-select: none;\n  user-select: none;\n}\n\n.${Wn}_col-controls {\n  width: var(--wh-controls-col-width);\n}\n\n.${Wn}_col-dibs {\n  width: var(--wh-dibs-col-width);\n}\n\n.${Wn}_col-status {\n  width: var(--wh-status-col-width);\n}\n\n.${Wn}_col-score {\n  width: var(--wh-score-col-width);\n}\n\n.${Wn}_col-stats {\n  width: var(--wh-stats-col-width);\n}\n\n.${Wn}_col-attack {\n  width: var(--wh-attack-col-width);\n}\n\n.${Wn}_table th,\n.${Wn}_table td {\n  padding: 5px 5px !important;\n  border-bottom: 1px solid var(--wh-border-soft);\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  text-align: left;\n}\n\n.${Wn}_table th {\n  font-size: 10px;\n  line-height: 12px;\n  text-transform: uppercase;\n  color: var(--wh-muted);\n}\n\n.${Wn}_table thead {\n  position: relative;\n  z-index: 30;\n}\n\n.${Wn}_table tbody {\n  position: relative;\n  z-index: 1;\n}\n\n.${Wn}_sort {\n  width: 100%;\n  padding: 0;\n  border: 0;\n  background: transparent;\n  color: inherit;\n  cursor: pointer;\n  display: inline-flex;\n  align-items: center;\n  gap: 4px;\n  font: inherit;\n  text-align: inherit;\n  text-transform: inherit;\n}\n\n.${Wn}_sort-label {\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n\n.${Wn}_sort-icon {\n  position: relative;\n  flex: 0 0 auto;\n  width: 8px;\n  height: 12px;\n}\n\n.${Wn}_sort-icon::before,\n.${Wn}_sort-icon::after {\n  content: "";\n  position: absolute;\n  left: 1px;\n  width: 5px;\n  height: 5px;\n  border-right: 1.5px solid currentColor;\n  border-bottom: 1.5px solid currentColor;\n  opacity: 0.35;\n}\n\n.${Wn}_sort-icon::before {\n  top: 1px;\n  transform: rotate(-135deg);\n}\n\n.${Wn}_sort-icon::after {\n  bottom: 1px;\n  transform: rotate(45deg);\n}\n\n.${Wn}_sort.active.asc .${Wn}_sort-icon::before,\n.${Wn}_sort.active.desc .${Wn}_sort-icon::after {\n  opacity: 1;\n}\n\n.${Wn}_table tr:last-child td {\n  border-bottom: 0;\n}\n\n.${Wn}_table tbody tr:nth-child(odd) td {\n  background: var(--wh-row-odd);\n}\n\n.${Wn}_table tbody tr:nth-child(even) td {\n  background: var(--wh-row-even);\n}\n\n.${Wn}_table tbody tr:hover td {\n  background: var(--wh-row-hover);\n}\n\n.${Wn}_table tbody tr.${Wn}_row-online td {\n  animation: ${Wn}_row_online_pop 4600ms ease-out both;\n  animation-delay: var(--wh-row-flash-delay, 0ms);\n}\n\n.${Wn}_table tbody tr.${Wn}_row-idle td {\n  animation: ${Wn}_row_idle_pop 4600ms ease-out both;\n  animation-delay: var(--wh-row-flash-delay, 0ms);\n}\n\n@keyframes ${Wn}_row_online_pop {\n  0%,\n  65% {\n    box-shadow: inset 0 0 0 9999px var(--wh-row-online-pop);\n  }\n  100% {\n    box-shadow: inset 0 0 0 9999px transparent;\n  }\n}\n\n@keyframes ${Wn}_row_idle_pop {\n  0%,\n  65% {\n    box-shadow: inset 0 0 0 9999px var(--wh-row-idle-pop);\n  }\n  100% {\n    box-shadow: inset 0 0 0 9999px transparent;\n  }\n}\n\n.${Wn}_table tbody tr.${Wn}_favorite-separator td {\n  box-shadow: inset 0 -2px 0 var(--wh-border);\n}\n\n.${Wn}_table tbody td:first-child {\n  border-top-left-radius: 4px;\n  border-bottom-left-radius: 4px;\n}\n\n.${Wn}_table tbody td:last-child {\n  border-top-right-radius: 4px;\n  border-bottom-right-radius: 4px;\n}\n\n.${Wn}_controls-header,\n.${Wn}_dibs-header,\n.${Wn}_table th.${Wn}_name-header-enemy,\n.${Wn}_table th.${Wn}_name-header-own,\n.${Wn}_status-header {\n  position: relative;\n  overflow: visible !important;\n}\n\n.${Wn}_controls-header-content,\n.${Wn}_name-header-content,\n.${Wn}_status-header-content {\n  display: flex;\n  align-items: center;\n  gap: 4px;\n  min-width: 0;\n}\n\n.${Wn}_controls-header-content {\n  justify-content: flex-start;\n}\n\n.${Wn}_name-header-content .${Wn}_sort,\n.${Wn}_status-header-content .${Wn}_sort {\n  flex: 1 1 auto;\n  min-width: 0;\n}\n\n.${Wn}_status-header-content {\n  justify-content: flex-end;\n}\n\n.${Wn}_controls {\n  overflow: visible !important;\n}\n\n.${Wn}_controls-content {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  min-width: 0;\n}\n\n.${Wn}_dibs {\n  overflow: visible !important;\n  text-align: center !important;\n}\n\n.${Wn}_dibs-content {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  min-width: 0;\n}\n\n.${Wn}_name a {\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  color: var(--wh-link);\n  text-decoration: none;\n}\n\n.${Wn}_name a:hover {\n  text-decoration: underline;\n}\n\n.${Wn}_status-header {\n  text-align: right !important;\n}\n\n.${Wn}_status-header .${Wn}_sort {\n  justify-content: flex-end;\n}\n\n.${Wn}_status {\n  text-align: right !important;\n}\n\n.${Wn}_score-header,\n.${Wn}_score {\n  color: inherit;\n  text-align: right !important;\n}\n\n.${Wn}_score-header .${Wn}_sort {\n  justify-content: flex-end;\n}\n\n.${Wn}_status.okay,\n.${Wn}_status.ok {\n  color: #5cb85c;\n}\n\n.${Wn}_status.hospital,\n.${Wn}_status.not-ok {\n  color: #d9534f;\n}\n\n.${Wn}_status.jail {\n  color: #f0ad4e !important;\n}\n\n.${Wn}_status.traveling,\n.${Wn}_status.abroad {\n  color: #5bc0de;\n}\n\n.${Wn} .__warhelper_status_icon {\n  display: inline-block;\n  margin-right: 2px;\n}\n\n.${Wn} .__warhelper_status_flag {\n  display: inline-block;\n  width: 14px;\n  height: 10px;\n  margin-right: 3px;\n  border: 1px solid rgba(0, 0, 0, 0.35);\n  box-sizing: border-box;\n  background-position: center;\n  background-repeat: no-repeat;\n  background-size: cover;\n  vertical-align: -1px;\n}\n\n.${Wn}_status:not(.__warhelper_status_multiline) {\n  white-space: nowrap;\n}\n\n.${Wn}_status.__warhelper_status_multiline {\n  white-space: normal !important;\n  overflow: visible !important;\n  line-height: 13px !important;\n}\n\n.${Wn}_status.__warhelper_status_multiline .__warhelper_status_icon,\n.${Wn}_status.__warhelper_status_multiline .__warhelper_status_flag {\n  margin-right: 0;\n}\n\n.${Wn}_status.__warhelper_status_multiline .__warhelper_status_main {\n  display: inline-flex;\n  align-items: center;\n  justify-content: flex-end;\n  gap: 3px;\n  max-width: 100%;\n  white-space: nowrap;\n  line-height: 13px;\n}\n\n.${Wn}_status.__warhelper_status_multiline .__warhelper_status_text {\n  display: inline-block;\n  min-width: 0;\n  white-space: normal;\n  overflow-wrap: anywhere;\n  line-height: 13px;\n}\n\n.${Wn}_status.__warhelper_status_multiline .__warhelper_status_detail {\n  display: block;\n  text-align: right;\n  white-space: nowrap;\n  line-height: 13px;\n}\n\n.${Wn}_status.__warhelper_status_multiline .__warhelper_status_detail.__warhelper_status_detail_hospital {\n  color: #d9534f !important;\n}\n\n.${Wn}_status.__warhelper_status_multiline .__warhelper_status_detail.__warhelper_status_detail_flight_possible {\n  color: #d6b94c !important;\n}\n\n.${Wn}_dibs .__warhelper_dibs {\n  position: relative !important;\n  right: auto !important;\n  display: inline-block !important;\n  flex: 0 0 auto;\n  width: auto;\n  min-width: 23px;\n  padding-right: 3px;\n  box-sizing: border-box;\n  overflow: visible !important;\n  vertical-align: middle;\n  opacity: 1 !important;\n}\n\n.${Wn}_dibs .__warhelper_dibs.timed {\n  margin-right: 0 !important;\n}\n\n.${Wn}_favorite {\n  --wh-favorite-color: #8a8f96;\n  position: relative;\n  flex: 0 0 21px;\n  width: 21px;\n  height: 19px;\n  padding: 0;\n  border: 0;\n  background: transparent;\n  cursor: pointer;\n}\n\n.${Wn}_favorite.online {\n  --wh-favorite-color: #5cb85c;\n}\n\n.${Wn}_favorite.idle {\n  --wh-favorite-color: #d6b94c;\n}\n\n.${Wn}_favorite.offline,\n.${Wn}_favorite.unknown {\n  --wh-favorite-color: #8a8f96;\n}\n\n.${Wn}_favorite-dot {\n  position: absolute;\n  left: 50%;\n  top: 50%;\n  width: 8px;\n  height: 8px;\n  border-radius: 50%;\n  background: var(--wh-favorite-color);\n  transform: translate(-50%, -50%);\n  transition: opacity 120ms ease;\n}\n\n.${Wn}_favorite-star {\n  position: absolute;\n  left: 50%;\n  top: 50%;\n  width: 15px;\n  height: 15px;\n  opacity: 0;\n  transform: translate(-50%, -50%) scale(0.82) rotate(-18deg);\n  transition: opacity 120ms ease, transform 120ms ease;\n  background: var(--wh-favorite-color);\n  clip-path: polygon(50% 0%, 61% 34%, 98% 34%, 68% 55%, 79% 91%, 50% 70%, 21% 91%, 32% 55%, 2% 34%, 39% 34%);\n  filter: drop-shadow(0 0 3px rgba(0, 0, 0, 0.35));\n}\n\n.${Wn}_favorite.active .${Wn}_favorite-dot,\n.${Wn}_favorite:hover .${Wn}_favorite-dot {\n  opacity: 0;\n}\n\n.${Wn}_favorite.active .${Wn}_favorite-star,\n.${Wn}_favorite:hover .${Wn}_favorite-star {\n  opacity: 1;\n  transform: translate(-50%, -50%) scale(1) rotate(-18deg);\n}\n\n.${Wn}_table td.${Wn}_stats {\n  padding: 5px 0 5px 15px !important;\n}\n\n.${Wn}_stats {\n  position: relative;\n  color: inherit;\n}\n\n.${Wn}:not(.${jn}) .${Wn}_stats .__warhelper_total.str {\n  color: #CC6666;\n}\n\n.${Wn}:not(.${jn}) .${Wn}_stats .__warhelper_total.def {\n  color: #6699CC;\n}\n\n.${Wn}:not(.${jn}) .${Wn}_stats .__warhelper_total.spd {\n  color: #99CC66;\n}\n\n.${Wn}:not(.${jn}) .${Wn}_stats .__warhelper_total.dex {\n  color: #9966CC;\n}\n\n.${Wn}_stats .__warhelper_bstype {\n  position: absolute;\n  top: 0;\n  left: 0;\n  color: #ddd;\n  text-align: center;\n  font-family: monospace;\n  font-weight: bold;\n  line-height: 14px;\n  padding-top: 1px;\n  padding-left: 1px;\n  padding-right: 10px;\n  padding-bottom: 10px;\n  background-color: #999999;\n  clip-path: polygon(0 0, 100% 0, 100% 0%, 0% 100%);\n}\n\n.${Wn}_stats .__warhelper_bstype.T {\n  background-color: #663399;\n}\n\n.${Wn}_stats .__warhelper_bstype.B {\n  background-color: #336699;\n}\n\n.${Wn}_stats .__warhelper_bstype.Y {\n  background-color: #669966;\n}\n\n.${Wn}_stats .__warhelper_bstype.YE {\n  background-color: #9c9c00;\n}\n\n.${Wn}_stats .__warhelper_bstype.F {\n  background-color: #a65e2e;\n}\n\n.${Wn}_stats .__warhelper_compare {\n  position: absolute;\n  bottom: 0;\n  left: 0;\n  right: 0;\n  height: 3px;\n  background: linear-gradient(to right, var(--color) var(--fill), transparent var(--fill));\n}\n\n.${Wn}.${Vn} .${Wn}_stats:has(.__warhelper_compare.r) {\n  color: #000 !important;\n  background-color: #D44A4A !important;\n}\n\n.${Wn}_stats .__warhelper_compare.r {\n  --color: #D44A4A;\n}\n\n.${Wn}.${Vn} .${Wn}_stats:has(.__warhelper_compare.y) {\n  color: #000 !important;\n  background-color: #F1C232 !important;\n}\n\n.${Wn}_stats .__warhelper_compare.y {\n  --color: #F1C232;\n}\n\n.${Wn}.${Vn} .${Wn}_stats:has(.__warhelper_compare.g) {\n  color: #000 !important;\n  background-color: #5CB85C !important;\n}\n\n.${Wn}_stats .__warhelper_compare.g {\n  --color: #5CB85C;\n}\n\n.${Wn}.${Vn} .${Wn}_stats:has(.__warhelper_compare.w) {\n  color: #000 !important;\n  background-color: #F8F9FA !important;\n}\n\n.${Wn}_stats .__warhelper_compare.w {\n  --color: #F8F9FA;\n}\n\n.__warhelper_spy_tooltip td:nth-child(3) {\n  padding-left: 5px;\n  text-align: right;\n}\n\n.__warhelper_spy_source {\n  display: inline-block;\n  min-width: 36px;\n  padding: 1px 4px;\n  border-radius: 2px;\n  color: #f5f5f5;\n  text-align: center;\n  font-weight: bold;\n}\n\n.__warhelper_spy_source.T {\n  background-color: #663399;\n}\n\n.__warhelper_spy_source.B {\n  background-color: #336699;\n}\n\n.__warhelper_spy_source.Y {\n  background-color: #669966;\n}\n\n.__warhelper_spy_source.YE {\n  background-color: #9c9c00;\n}\n\n.__warhelper_spy_source.F {\n  background-color: #a65e2e;\n}\n\n.__warhelper_spy_detail td:first-child {\n  padding-left: 18px;\n}\n\n.${Wn}_stats-header {\n  position: relative;\n  overflow: visible !important;\n}\n\n.${Wn}_stats-header-content {\n  display: flex;\n  align-items: center;\n  gap: 4px;\n  min-width: 0;\n}\n\n.${Wn}_stats-header-content .${Wn}_sort {\n  flex: 1 1 auto;\n  min-width: 0;\n}\n\n.${Wn}_filter-button {\n  position: relative;\n  flex: 0 0 auto;\n  width: 18px;\n  height: 18px;\n  padding: 0;\n  border: 0;\n  border-radius: 3px;\n  background: transparent;\n  color: inherit;\n  cursor: pointer;\n}\n\n.${Wn}_filter-button::before {\n  content: "";\n  position: absolute;\n  inset: 4px 4px 3px;\n  background: currentColor;\n  clip-path: polygon(6% 12%, 94% 12%, 60% 52%, 60% 90%, 40% 90%, 40% 52%);\n  opacity: 0.68;\n}\n\n.${Wn}_filter-button:hover,\n.${Wn}_filter-button.active {\n  color: var(--wh-filter-active);\n  background: rgba(91, 192, 222, 0.12);\n}\n\n.${Wn}_stats-filter-popover {\n  position: absolute;\n  top: calc(100% + 5px);\n  right: 0;\n  z-index: 100;\n  width: 156px;\n  box-sizing: border-box;\n  padding: 8px;\n  border: 1px solid var(--wh-border);\n  border-radius: 4px;\n  background: var(--wh-popover-bg);\n  color: inherit;\n  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.22);\n  display: grid;\n  gap: 6px;\n  font-size: 11px;\n  line-height: 14px;\n  text-transform: none;\n  -webkit-user-select: text;\n  -moz-user-select: text;\n  -ms-user-select: text;\n  user-select: text;\n}\n\n.${Wn}_controls-filter-popover {\n  left: 0;\n  right: auto;\n}\n\n.${Wn}_settings-popover {\n  position: absolute;\n  top: calc(100% + 5px);\n  left: 0;\n  z-index: 100;\n  width: 144px;\n  box-sizing: border-box;\n  padding: 8px;\n  border: 1px solid var(--wh-border);\n  border-radius: 4px;\n  background: var(--wh-popover-bg);\n  color: inherit;\n  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.22);\n  display: grid;\n  gap: 6px;\n  font-size: 11px;\n  line-height: 14px;\n  text-transform: none;\n  -webkit-user-select: text;\n  -moz-user-select: text;\n  -ms-user-select: text;\n  user-select: text;\n}\n\n.${Wn}_stats-filter-popover label {\n  display: grid;\n  gap: 2px;\n  font-weight: 600;\n  color: var(--wh-muted);\n}\n\n.${Wn}_stats-filter-popover input {\n  width: 100%;\n  box-sizing: border-box;\n  padding: 3px 5px;\n  border: 1px solid var(--wh-border);\n  border-radius: 3px;\n  background: var(--wh-popover-bg);\n  color: inherit;\n  font: inherit;\n  -webkit-user-select: text;\n  -moz-user-select: text;\n  -ms-user-select: text;\n  user-select: text;\n}\n\n.${Wn}_stats-filter-popover .${Wn}_filter-choice {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  font-weight: 400;\n  color: inherit;\n}\n\n.${Wn}_settings-popover .${Wn}_filter-choice {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  font-weight: 400;\n  color: inherit;\n}\n\n.${Wn}_stats-filter-popover .${Wn}_filter-choice input,\n.${Wn}_settings-popover .${Wn}_filter-choice input {\n  flex: 0 0 auto;\n  width: auto;\n  margin: 0;\n}\n\n.${Wn}_stats-filter-actions {\n  display: flex;\n  justify-content: flex-end;\n  gap: 5px;\n}\n\n.${Wn}_stats-filter-actions button {\n  padding: 2px 6px;\n  border: 1px solid var(--wh-border);\n  border-radius: 3px;\n  background: var(--wh-panel-bg);\n  color: inherit;\n  cursor: pointer;\n  font: inherit;\n}\n\nbody.dark-mode .${Wn}_stats,\nbody.dark-mode .${Wn}_score {\n  color: #e8edf2 !important;\n}\n\n.${Wn}_stats .__warhelper_total {\n  line-height: 18px;\n}\n\n.${Wn}_attack {\n  text-align: right !important;\n}\n\n.${Wn}_attack-button {\n  display: inline;\n  width: auto;\n  height: auto;\n  padding: 0;\n  border: 0;\n  background: transparent;\n  color: inherit;\n  cursor: pointer;\n  font: inherit;\n  font-size: 15px;\n  line-height: 1;\n  text-align: center;\n}\n\n.${Wn}_attack-button:hover {\n  background: transparent;\n}\n\n.${Wn}_empty {\n  padding: 8px;\n  opacity: 0.72;\n}\n\n@media screen and (max-width: 784px) {\n  .${Wn}_mobile-tabs {\n    display: grid;\n    grid-template-columns: repeat(2, minmax(0, 1fr));\n    gap: 4px;\n    margin-top: 8px;\n  }\n\n  .${Wn}_mobile-tab {\n    display: flex;\n    align-items: center;\n    justify-content: center;\n    gap: 6px;\n    min-width: 0;\n    min-height: 32px;\n    padding: 5px 7px;\n    border: 1px solid var(--wh-border);\n    border-radius: 4px 4px 0 0;\n    background: var(--wh-panel-bg);\n    color: inherit;\n    cursor: pointer;\n    font: inherit;\n    font-weight: 700;\n  }\n\n  .${Wn}_mobile-tab.active {\n    border-bottom-color: var(--wh-bg);\n    background: var(--wh-bg);\n    color: var(--wh-filter-active);\n  }\n\n  .${Wn}_mobile-tab-title {\n    min-width: 0;\n    overflow: hidden;\n    text-overflow: ellipsis;\n    white-space: nowrap;\n  }\n\n  .${Wn}_mobile-tab-count {\n    flex: 0 0 auto;\n    color: var(--wh-muted);\n    font-weight: 600;\n  }\n\n  .${Wn}_columns {\n    display: block;\n    margin-top: 0;\n  }\n\n  .${Wn}_panel {\n    display: none;\n    border-radius: 0 0 4px 4px;\n  }\n\n  .${Wn}_panel.${Wn}_panel-mobile-active {\n    display: block;\n  }\n\n  .${Wn}_panel-collapsed .${Wn}_panel-title {\n    min-height: auto;\n    padding: 6px 8px;\n    border-bottom: 1px solid var(--wh-border-soft);\n    writing-mode: horizontal-tb;\n    text-orientation: mixed;\n  }\n\n  .${Wn}_panel-collapsed .${Wn}_panel-body {\n    display: block;\n  }\n\n  .${Wn}_collapse-button {\n    display: none;\n  }\n}\n`,
          );
        }
        static shouldShowOriginalWarView() {
          return "true" === x.get("show_original_war_view");
        }
        static updateOriginalVisibility() {
          if (!document.body) return;
          const t = this.shouldShowOriginalWarView();
          (document.body.classList.toggle(Hn, !t && this.mounts.size > 0),
            document.body.classList.toggle(On, t));
        }
        static mount(t) {
          const e = t.parentElement;
          if (!e || !this.isActiveOriginal(t)) return;
          (this.updateOriginalVisibility(), t.classList.remove(Hn));
          const n = t.nextElementSibling,
            s =
              n instanceof HTMLElement && n.classList.contains(Wn)
                ? n
                : this.createOverview();
          (this.syncOverviewConfigClasses(s),
            s !== n && t.insertAdjacentElement("afterend", s),
            this.removeDuplicateOverviews(e, s));
          const i = new Bn({
            target: s,
            props: { state: this.createViewState(!1), actions: this.actions },
          });
          (this.observeLifecycle(e, t, s, i),
            this.updateOriginalVisibility(),
            this.scheduleMountedUpdates());
        }
        static createOverview() {
          const t = document.createElement("div");
          return ((t.className = Wn), this.syncOverviewConfigClasses(t), t);
        }
        static startTimer() {
          if (this.timerStarted) return;
          this.timerStarted = !0;
          const t = () => {
            (this.scheduleMountedUpdates(),
              window.setTimeout(t, 1e3 - (r() % 1e3) + 25));
          };
          window.setTimeout(t, 0);
        }
        static scheduleMountedUpdates() {
          this.mounts.forEach((t, e) => {
            this.isActiveMount(e, t)
              ? null === t.updateFrame &&
                (t.updateFrame = window.requestAnimationFrame(() => {
                  ((t.updateFrame = null),
                    this.isActiveMount(e, t)
                      ? this.updateMount(t)
                      : this.cleanupMount(e, t));
                }))
              : this.cleanupMount(e, t);
          });
        }
        static updateMount(t) {
          const e = this.bypassBodyInteractionHoldForNextUpdate;
          (t.component.$set({ state: this.createViewState(e) }),
            e && (this.bypassBodyInteractionHoldForNextUpdate = !1));
        }
        static createViewState(t) {
          this.normalizeHiddenColumnSort();
          const e = this.getMemberGroups(),
            n = e.enemy.concat(e.own);
          (this.ensureStats(n),
            this.ensureOpponentChain(e),
            this.trackOnlineStatusChanges(n));
          const s = this.createDecayEndView();
          return {
            stateText: n.length ? "" : "Waiting for DataMonitor",
            dibsSign: vt,
            bypassBodyHold: t,
            activeMobileTab: this.activeMobileTab,
            decayEnd: s,
            opponentChain: this.createOpponentChainView(e),
            decayGraph: this.createDecayGraphView(e),
            revision: ++this.revision,
            tables: {
              enemy: this.createTableState(
                "enemy",
                e.enemyFactionName,
                e.enemy,
                e.canAttackEnemy,
                !0,
              ),
              own: this.createTableState(
                "own",
                e.ownFactionName,
                e.own,
                !1,
                !1,
              ),
            },
          };
        }
        static createTableState(t, e, n, s, i) {
          const r = this.filterMembers(n, t),
            a = this.sortMembers(r, t),
            o = this.getLastFavoriteIndex(a),
            l = a.map((t, e) =>
              this.createViewMember(t, i, e === o && e < a.length - 1),
            );
          return {
            side: t,
            title: e,
            rawCount: n.length,
            members: l,
            bodySignature: this.hashSignature([
              t,
              s ? "attack" : "no-attack",
              ...l.map((t) => t.signature),
            ]),
            collapsed: this.collapsedPanels[t],
            collapseButtonText: this.getCollapseButtonText(
              t,
              this.collapsedPanels[t],
            ),
            canAttack: s,
            activeSettings: this.activeSettings === t,
            optionalColumns: this.getOptionalColumnViews(t),
            showDibsColumn: i,
            showScoreColumn: this.columnVisibility[t].score,
            showAttackColumn: s,
            sortState: { ...this.sortStates[t] },
            statsFilter: { ...this.statsFilters[t] },
            statusFilters: [...this.statusFilters[t]],
            onlineFilters: [...this.onlineFilters[t]],
            hasStatsFilter: this.hasStatsFilter(t),
            hasStatusFilter: this.hasStatusFilter(t),
            hasOnlineFilter: this.hasOnlineFilter(t),
            activeFilter: this.getActiveFilter(t),
            emptyText: l.length
              ? null
              : n.length
                ? "No members match filter"
                : "No members loaded",
          };
        }
        static createViewMember(t, e, n) {
          const s = this.stats.get(t.userId) || this.createLoadingStatDisplay(),
            i = this.getStatusViewDisplay(t.userId, t.status),
            r = this.getPendingOnlineFlash(t),
            a = this.isFavorite(t.userId),
            o = this.hashSignature([
              String(t.userId),
              t.name,
              String(t.factionId),
              String(t.status.area),
              t.status.status,
              String(t.status.updateAt),
              t.status.onlineStatus,
              String(t.status.score),
              i.key,
              a ? "favorite" : "normal",
              s.html,
              s.tooltip,
              String(s.sortValue),
              String(s.sourceCount),
              r?.key || "",
              n ? "separator" : "",
            ]);
          return {
            userId: t.userId,
            name: t.name,
            factionId: t.factionId,
            profileHref: `profiles.php?XID=${t.userId}`,
            onlineStatus: t.status.onlineStatus,
            isFavorite: a,
            favoriteSeparator: n,
            canDib: e,
            statusDisplay: i,
            statusClasses: this.getStatusClasses(t.userId, t.status, i),
            score: t.status.score,
            scoreDisplay: this.formatScore(t.status.score),
            stats: s,
            flashClass: r?.className || "",
            flashDelayMs: r?.delayMs || 0,
            signature: o,
          };
        }
        static getOptionalColumnViews(t) {
          return ns.map((e) => ({
            ...e,
            visible: this.columnVisibility[t][e.id],
          }));
        }
        static normalizeHiddenColumnSort() {
          let t = !1;
          (["enemy", "own"].forEach((e) => {
            "score" !== this.sortStates[e].field ||
              this.columnVisibility[e].score ||
              ((this.sortStates[e] = { field: "status", asc: !0 }), (t = !0));
          }),
            t && this.persistSortStates());
        }
        static formatScore(t) {
          return Number.isFinite(t)
            ? Math.round(t).toLocaleString("en-US")
            : "0";
        }
        static createDecayEndView() {
          const t = O.getWarStatus();
          if (!t) return null;
          const e = a(),
            n = this.normalizeTimestampSeconds(t.started);
          if (Number.isFinite(n) && n > e)
            return this.createWarCountdownView("WAR START", n, e);
          const s = this.getDecayEndTimestamp(t, e);
          return null === s ? null : this.createWarCountdownView("DECAY", s, e);
        }
        static createWarCountdownView(t, e, n) {
          return {
            label: t,
            timestamp: e,
            timer: this.formatCountdown(e, n),
            showDates: e > n,
            utcTime: this.formatUtcDateTime(e),
            localTime: this.formatLocalDateTime(e),
          };
        }
        static resetOpponentChain() {
          ((this.opponentChain = null),
            (this.opponentChainLastRequestAt = 0),
            (this.opponentChainExpiredRefreshKey = null),
            this.scheduleMountedUpdates());
        }
        static isOpponentChainTrackerEnabled() {
          return "true" === x.get("opponent_chain_tracker");
        }
        static ensureOpponentChain(t) {
          if (!this.isOpponentChainTrackerEnabled() || !x.get("torn_key"))
            return;
          const e = t.enemyFactionId;
          if (!e) return;
          if (
            (this.opponentChain &&
              this.opponentChain.factionId !== e &&
              ((this.opponentChain = null),
              (this.opponentChainLastRequestAt = 0)),
            !yt.isMaster())
          )
            return;
          if (this.opponentChainRequest) return;
          const n = Date.now();
          (this.opponentChainLastRequestAt &&
            n - this.opponentChainLastRequestAt < 6e4) ||
            this.loadOpponentChain(e);
        }
        static refreshOpponentChain() {
          if (!this.isOpponentChainTrackerEnabled() || !x.get("torn_key"))
            return;
          const t = this.getMemberGroups().enemyFactionId;
          t && this.requestOpponentChainRefresh(t);
        }
        static loadOpponentChain(t, e = !1) {
          if (!yt.isMaster()) return;
          if (this.opponentChainRequest) return;
          const n = Date.now();
          (!e &&
            this.opponentChainLastRequestAt &&
            n - this.opponentChainLastRequestAt < 6e4) ||
            ((this.opponentChainLastRequestAt = Date.now()),
            (this.opponentChainRequest = w({
              section: "faction",
              endpoint: "chain",
              parameters: { id: t, timestamp: a() },
            })
              .then((e) => {
                this.isOpponentChainTrackerEnabled() &&
                  x.get("torn_key") &&
                  this.setOpponentChainState(
                    {
                      factionId: t,
                      chain: this.parseOpponentChain(e?.chain),
                      loadedAt: a(),
                      error: null,
                    },
                    !0,
                  );
              })
              .catch((e) => {
                this.setOpponentChainState(
                  {
                    factionId: t,
                    chain: null,
                    loadedAt: a(),
                    error:
                      e instanceof Error
                        ? e.message
                        : String(e || "Unable to load chain"),
                  },
                  !0,
                );
              })
              .finally(() => {
                ((this.opponentChainRequest = null),
                  this.scheduleMountedUpdates());
              })));
        }
        static parseOpponentChain(t) {
          return t && "object" == typeof t
            ? {
                id: this.toChainNumber(t.id),
                current: this.toChainNumber(t.current),
                max: this.toChainNumber(t.max),
                modifier: this.toChainNumber(t.modifier),
                cooldown: this.normalizeTimestampSeconds(
                  this.toChainNumber(t.cooldown),
                ),
                start: this.normalizeTimestampSeconds(
                  this.toChainNumber(t.start),
                ),
                end: this.normalizeTimestampSeconds(this.toChainNumber(t.end)),
              }
            : null;
        }
        static toChainNumber(t) {
          const e = Number(t);
          return Number.isFinite(e) ? e : 0;
        }
        static setOpponentChainState(t, e) {
          (this.opponentChain &&
            this.opponentChain.factionId === t.factionId &&
            this.opponentChain.loadedAt > t.loadedAt) ||
            ((this.opponentChain = t),
            (this.opponentChainLastRequestAt = Date.now()),
            this.scheduleMountedUpdates(),
            e && yt.post(Jn, t));
        }
        static handleOpponentChainStateMessage(t) {
          const e = this.parseOpponentChainState(t);
          e && this.setOpponentChainState(e, !1);
        }
        static handleOpponentChainRefreshMessage(t) {
          if (!yt.isMaster()) return;
          const e = this.getPayloadFactionId(t);
          e && this.loadOpponentChain(e, !0);
        }
        static requestOpponentChainRefresh(t) {
          yt.isMaster()
            ? this.loadOpponentChain(t, !0)
            : yt.post(Xn, { factionId: t });
        }
        static parseOpponentChainState(t) {
          if (!t || "object" != typeof t) return null;
          const e = t,
            n = this.toChainNumber(e.factionId),
            s = this.toChainNumber(e.loadedAt);
          return n <= 0 || s <= 0
            ? null
            : {
                factionId: n,
                chain:
                  null === e.chain ? null : this.parseOpponentChain(e.chain),
                loadedAt: s,
                error: "string" == typeof e.error ? e.error : null,
              };
        }
        static getPayloadFactionId(t) {
          return t && "object" == typeof t
            ? this.toChainNumber(t.factionId)
            : 0;
        }
        static createOpponentChainView(t) {
          if (
            !this.isOpponentChainTrackerEnabled() ||
            !x.get("torn_key") ||
            !t.enemyFactionId
          )
            return null;
          if (
            !this.opponentChain ||
            this.opponentChain.factionId !== t.enemyFactionId
          )
            return { text: "Loading..." };
          if (this.opponentChain.error) return { text: "Unable to load" };
          const e = this.opponentChain.chain;
          if (!e) return { text: "No active chain" };
          const n = a();
          if (e.cooldown > 0) {
            const s = Math.max(0, e.cooldown - n);
            return (
              s <= 0 &&
                this.refreshExpiredOpponentChain(
                  t.enemyFactionId,
                  e,
                  "cooldown",
                ),
              { text: `In cooldown - ${this.formatChainDuration(s, !0)}` }
            );
          }
          if (e.start > 0) {
            const s = Math.max(0, e.end - n);
            return (
              s <= 0 &&
                this.refreshExpiredOpponentChain(t.enemyFactionId, e, "active"),
              {
                text: `Active ${Math.floor(e.current)} / ${Math.floor(e.max)} - ${this.formatChainDuration(s)}`,
              }
            );
          }
          return { text: "No active chain" };
        }
        static refreshExpiredOpponentChain(t, e, n) {
          const s = [
            t,
            n,
            e.id,
            e.current,
            e.max,
            e.start,
            e.end,
            e.cooldown,
          ].join(":");
          this.opponentChainExpiredRefreshKey !== s &&
            ((this.opponentChainExpiredRefreshKey = s),
            this.requestOpponentChainRefresh(t));
        }
        static formatChainDuration(t, e = !1) {
          const n = Math.max(0, Math.floor(t)),
            s = Math.floor(n / 86400),
            i = Math.floor((n % 86400) / 3600),
            r = Math.floor((n % 3600) / 60),
            a = n % 60;
          return s
            ? `${s}d ${this.pad2(i)}:${this.pad2(r)}:${this.pad2(a)}`
            : e || i
              ? `${this.pad2(i)}:${this.pad2(r)}:${this.pad2(a)}`
              : `${this.pad2(r)}:${this.pad2(a)}`;
        }
        static getDecayEndTimestamp(t, e) {
          const n = this.normalizeTimestampSeconds(t.started),
            s = t.initRespectRequirement,
            i = Math.abs(t.ownScore - t.opponentScore),
            r = 0.01 * s;
          if (
            !Number.isFinite(n) ||
            !Number.isFinite(s) ||
            !Number.isFinite(i) ||
            !Number.isFinite(r) ||
            n <= 0 ||
            s <= 0 ||
            r <= 0
          )
            return null;
          const a = s - i;
          if (a <= 0) return e;
          const o = n + 86400,
            l = Math.ceil(a / r);
          return !Number.isFinite(l) || l <= 0
            ? e
            : Math.max(e, o + 60 * (l - 1) * 60);
        }
        static normalizeTimestampSeconds(t) {
          return Math.floor(t > 9999999999 ? t / 1e3 : t);
        }
        static formatCountdown(t, e) {
          const n = Math.max(0, t - e),
            s = Math.floor(n / 86400),
            i = Math.floor((n % 86400) / 3600),
            r = Math.floor((n % 3600) / 60),
            a = n % 60,
            o = `${this.pad2(i)}:${this.pad2(r)}:${this.pad2(a)}`;
          return s ? `${s}d ${o}` : o;
        }
        static formatUtcDateTime(t) {
          const e = new Date(1e3 * t);
          return [
            `${e.getUTCFullYear()}-${this.pad2(e.getUTCMonth() + 1)}-${this.pad2(e.getUTCDate())}`,
            `${this.pad2(e.getUTCHours())}:${this.pad2(e.getUTCMinutes())}:${this.pad2(e.getUTCSeconds())}`,
            "TCT",
          ].join(" ");
        }
        static formatLocalDateTime(t) {
          const e = new Date(1e3 * t),
            n = this.getLocalTimeZoneLabel(e),
            s = [
              `${e.getFullYear()}-${this.pad2(e.getMonth() + 1)}-${this.pad2(e.getDate())}`,
              `${this.pad2(e.getHours())}:${this.pad2(e.getMinutes())}:${this.pad2(e.getSeconds())}`,
            ].join(" ");
          return n ? `${s} ${n}` : s;
        }
        static getLocalTimeZoneLabel(t) {
          const e = new Intl.DateTimeFormat(void 0, {
            hour: "2-digit",
            minute: "2-digit",
            timeZoneName: "short",
          })
            .formatToParts(t)
            .find((t) => "timeZoneName" === t.type);
          return e?.value || "";
        }
        static pad2(t) {
          return String(Math.floor(t)).padStart(2, "0");
        }
        static createDecayGraphView(t) {
          const e = this.createEmptyGraphView(t),
            n = O.getWarGraph(),
            s = this.normalizeGraphEntries(n.score);
          let i = this.normalizeGraphEntries(n.goal).map((t) => ({
            ...t,
            value: Math.abs(t.value),
          }));
          const r = s.concat(i).map((t) => t.timestamp);
          if (!r.length) return e;
          const a = O.getWarStatus(),
            o = a ? this.normalizeTimestampSeconds(a.started) : Math.min(...r);
          a &&
            i.length &&
            Number.isFinite(a.initRespectRequirement) &&
            a.initRespectRequirement > 0 &&
            i[0].timestamp > o &&
            (i = [{ timestamp: o, value: a.initRespectRequirement }, ...i]);
          const l = this.extendScoreThroughGoalEntries(s, i),
            c = l.concat(i).map((t) => t.timestamp),
            h = Math.min(o || Math.min(...c), ...c),
            d = Math.max(...c, h + 3600),
            u = Math.max(
              1,
              ...l.map((t) => Math.abs(t.value)),
              ...i.map((t) => Math.abs(t.value)),
            ),
            p = this.getNiceGraphMax(u),
            g = (t) => 48 + ((t - h) / (d - h)) * 696,
            f = (t) => 12 + ((p - t) / (2 * p)) * Zn;
          return {
            ...e,
            hasData: !0,
            zeroY: 91,
            yLabels: this.createGraphYLabels(p, f),
            xLabels: this.createGraphXLabels(o || h, h, d, g),
            scoreSegments: this.createScoreSegments(l, g, f),
            goalPositivePoints: this.createGoalStepPoints(i, h, d, g, f, 1),
            goalNegativePoints: this.createGoalStepPoints(i, h, d, g, f, -1),
            hoverPoints: this.createGraphHoverPoints(l, i, g, f, t),
          };
        }
        static createEmptyGraphView(t) {
          return {
            expanded: this.decayGraphExpanded,
            hasData: !1,
            width: 760,
            height: 218,
            plotX: 48,
            plotY: 12,
            plotWidth: 696,
            plotHeight: Zn,
            zeroY: 91,
            ownFactionName: t.ownFactionName,
            enemyFactionName: t.enemyFactionName,
            yLabels: [],
            xLabels: [],
            scoreSegments: [],
            goalPositivePoints: "",
            goalNegativePoints: "",
            hoverPoints: [],
          };
        }
        static normalizeGraphEntries(t) {
          return t
            .map((t) => ({
              timestamp: this.normalizeTimestampSeconds(t.timestamp),
              value: t.value,
            }))
            .filter(
              (t) => Number.isFinite(t.timestamp) && Number.isFinite(t.value),
            )
            .sort((t, e) => t.timestamp - e.timestamp);
        }
        static extendScoreThroughGoalEntries(t, e) {
          if (!t.length || !e.length) return t;
          const n = t[0],
            s = new Set(t.map((t) => t.timestamp)),
            i = t.map((t) => ({ ...t }));
          let r = 0;
          for (const a of e)
            if (!(a.timestamp < n.timestamp || s.has(a.timestamp))) {
              for (; r + 1 < t.length && t[r + 1].timestamp <= a.timestamp; )
                r++;
              (i.push({ timestamp: a.timestamp, value: t[r].value }),
                s.add(a.timestamp));
            }
          return i.sort((t, e) => t.timestamp - e.timestamp);
        }
        static getNiceGraphMax(t) {
          if (t <= 0 || !Number.isFinite(t)) return 1;
          const e = Math.pow(10, Math.floor(Math.log10(t))),
            n = t / e;
          return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * e;
        }
        static createGraphYLabels(t, e) {
          return [t, t / 2, 0, -t / 2, -t].map((t) => ({
            y: e(t),
            text: this.formatGraphNumber(Math.abs(t)),
          }));
        }
        static createGraphXLabels(t, e, n, s) {
          const i = Math.max(3600, n - e),
            r =
              i <= 129600
                ? 10800
                : i <= 345600
                  ? 21600
                  : i <= 691200
                    ? 43200
                    : 86400,
            a = [];
          for (let i = t + r; i < n; i += r)
            i <= e ||
              a.push({ x: s(i), text: this.formatGraphDuration(i - t) });
          return a;
        }
        static createGoalStepPoints(t, e, n, s, i, r) {
          if (!t.length || n <= e) return "";
          let a = t[0].value;
          const o = [this.formatGraphPoint(s(e), i(a * r))];
          for (const l of t)
            if (l.timestamp <= e)
              ((a = l.value), (o[0] = this.formatGraphPoint(s(e), i(a * r))));
            else {
              if (l.timestamp > n) break;
              (o.push(this.formatGraphPoint(s(l.timestamp), i(a * r))),
                o.push(this.formatGraphPoint(s(l.timestamp), i(l.value * r))),
                (a = l.value));
            }
          return (o.push(this.formatGraphPoint(s(n), i(a * r))), o.join(" "));
        }
        static createScoreSegments(t, e, n) {
          if (!t.length) return [];
          const s = [],
            i = t[0];
          let r = i.value >= 0,
            a = [this.formatGraphPoint(e(i.timestamp), n(i.value))];
          for (let i = 1; i < t.length; i++) {
            const o = t[i - 1],
              l = t[i],
              c = l.value >= 0;
            if (
              0 !== o.value &&
              0 !== l.value &&
              r !== c &&
              l.value !== o.value
            ) {
              const t = Math.abs(o.value) / Math.abs(l.value - o.value),
                i = o.timestamp + (l.timestamp - o.timestamp) * t,
                h = this.formatGraphPoint(e(i), n(0));
              (a.push(h),
                s.push({ points: a.join(" "), positive: r }),
                (r = c),
                (a = [h]));
            }
            a.push(this.formatGraphPoint(e(l.timestamp), n(l.value)));
          }
          return (s.push({ points: a.join(" "), positive: r }), s);
        }
        static createGraphHoverPoints(t, e, n, s, i) {
          return t.map((t) => {
            const r = this.getSteppedGraphValue(e, t.timestamp),
              a = Math.abs(t.value),
              o =
                t.value > 0
                  ? i.ownFactionName
                  : t.value < 0
                    ? i.enemyFactionName
                    : "Even";
            return {
              timestamp: t.timestamp,
              x: n(t.timestamp),
              scoreY: s(t.value),
              goalPositiveY: null === r ? null : s(r),
              goalNegativeY: null === r ? null : s(-r),
              timeTct: this.formatUtcDateTime(t.timestamp),
              localTime: this.formatLocalDateTime(t.timestamp),
              scoreDisplay: this.formatGraphNumber(a),
              goalDisplay: null === r ? "n/a" : this.formatGraphNumber(r),
              winningFactionName: o,
            };
          });
        }
        static getSteppedGraphValue(t, e) {
          if (!t.length) return null;
          const n = t[0];
          if (e <= n.timestamp) return n.value;
          let s = n.value;
          for (let n = 1; n < t.length; n++) {
            const i = t[n];
            if (e < i.timestamp) return s;
            s = i.value;
          }
          return s;
        }
        static formatGraphPoint(t, e) {
          return `${Math.round(100 * t) / 100},${Math.round(100 * e) / 100}`;
        }
        static formatGraphNumber(t) {
          return Math.round(t).toLocaleString("en-US");
        }
        static formatGraphDuration(t) {
          const e = Math.max(0, Math.floor(t));
          return `${Math.floor(e / 86400)}d ${Math.floor((e % 86400) / 3600)}h`;
        }
        static getActiveFilter(t) {
          return this.activeStatsFilter === t
            ? "stats"
            : this.activeStatusFilter === t
              ? "status"
              : this.activeOnlineFilter === t
                ? "online"
                : null;
        }
        static toggleDecayGraph() {
          ((this.decayGraphExpanded = !this.decayGraphExpanded),
            this.scheduleMountedUpdates());
        }
        static async refreshWarData() {
          try {
            await e.fetch(
              "https://www.torn.com/faction_wars.php?redirect=false&step=getwarusers&factionID=0&userID=0&warID=rank",
              {
                method: "POST",
                headers: {
                  Accept: "application/json",
                  "Content-Type": "application/json",
                  "x-requested-with": "XMLHttpRequest",
                },
                body: "{}",
              },
            );
          } catch {}
        }
        static togglePanelCollapsed(t) {
          ((this.collapsedPanels[t] = !this.collapsedPanels[t]),
            this.scheduleMountedUpdates());
        }
        static setActiveMobileTab(t) {
          this.activeMobileTab !== t &&
            ((this.activeMobileTab = t),
            this.closeFilters(),
            this.scheduleMountedUpdates());
        }
        static getCollapseButtonText(t, e) {
          return "enemy" === t ? (e ? ">" : "<") : e ? "<" : ">";
        }
        static getMemberGroups() {
          const t = O.getWarUserStatuses(),
            e = Object.keys(t)
              .map((e) => this.createMember(Number(e), t[Number(e)]))
              .filter((t) => null !== t),
            n = this.getPageFactionInfos(),
            s = O.getCurrentFactionId(),
            i = s || n.current?.id || this.getViewedFactionId(),
            r = e.filter((t) => !i || t.factionId !== i);
          return {
            enemy: r,
            own: e.filter((t) => i && t.factionId === i),
            ownFactionId: i,
            enemyFactionId: r[0]?.factionId || this.getEnemyFactionId(i, n),
            enemyFactionName: this.getEnemyFactionName(i, n),
            ownFactionName: this.getFactionNameForId(i, n) || "Own Faction",
            canAttackEnemy: s > 0,
          };
        }
        static createMember(t, e) {
          return e?.factionId
            ? {
                userId: t,
                name: e.name || `User ${t}`,
                factionId: e.factionId,
                status: e,
              }
            : null;
        }
        static getViewedFactionId() {
          const t = this.getPageFactionInfos();
          if (t.current?.id) return t.current.id;
          const e = Array.from(
            document.querySelectorAll(
              'a[aria-labelledby="view-wars"][href*="/ranked/"], a[href*="factionWarfare#/ranked/"]',
            ),
          );
          for (const t of e) {
            const e = t.href.match(/\/ranked\/(\d+)/);
            if (!e?.[1]) continue;
            const n = Number(e[1]);
            if (Number.isFinite(n) && n > 0) return n;
          }
          return 0;
        }
        static getPageFactionInfos() {
          const t = {},
            e = this.getPageFactionInfo(
              '[class*="rankBox__"] a[class*="currentFactionName"][href*="factions.php"]',
            ),
            n = this.getPageFactionInfo(
              '[class*="rankBox__"] a[class*="opponentFactionName"][href*="factions.php"]',
            );
          return (e && (t.current = e), n && (t.opponent = n), t);
        }
        static getPageFactionInfo(t) {
          const e = document.querySelector(t);
          if (!e) return;
          const n = e.href.match(/[?&]ID=(\d+)/),
            s = n?.[1] ? Number(n[1]) : 0,
            i = e.textContent?.trim() || "";
          return s && i ? { id: s, name: i } : void 0;
        }
        static getFactionNameForId(t, e) {
          return t && e.current?.id === t
            ? e.current.name
            : t && e.opponent?.id === t
              ? e.opponent.name
              : "";
        }
        static getEnemyFactionName(t, e) {
          return e.opponent && e.opponent.id !== t
            ? e.opponent.name
            : e.current && e.current.id !== t
              ? e.current.name
              : "Enemy Faction";
        }
        static getEnemyFactionId(t, e) {
          return e.opponent && e.opponent.id !== t
            ? e.opponent.id
            : e.current && e.current.id !== t
              ? e.current.id
              : 0;
        }
        static sortMembers(t, e) {
          const n = this.sortStates[e];
          return [...t].sort((t, e) => {
            const s =
              Number(this.isFavorite(e.userId)) -
              Number(this.isFavorite(t.userId));
            if (s) return s;
            if ("status" === n.field)
              return this.compareStatusMembers(t, e, n.asc);
            const i = this.compareMembers(t, e, n.field);
            return n.asc ? i : -i;
          });
        }
        static compareMembers(t, e, n) {
          if ("stats" === n) {
            const n =
              this.getStatsSortValue(t.userId) -
              this.getStatsSortValue(e.userId);
            if (n) return n;
          }
          if ("score" === n) {
            const n = t.status.score - e.status.score;
            if (n) return n;
          }
          return (
            t.name.localeCompare(e.name, void 0, { sensitivity: "base" }) ||
            t.userId - e.userId
          );
        }
        static compareStatusMembers(t, e, n) {
          const s = O.getCurrentUserStatus(),
            i = this.isAwayFromTorn(s),
            r = i && !("Traveling" === s?.status && 1 === s.area),
            a = i ? 1 : 4,
            o = i ? 5 : 4,
            l = i ? (n ? 2 : 4) : n ? 1 : 3,
            c = i ? 3 : 2,
            h = i ? (n ? 4 : 2) : n ? 3 : 1,
            d = this.getStatusSortTuple(t.userId, t.status, {
              currentStatus: s,
              canPrioritizeCurrentArea: r,
              currentAway: a,
              otherAway: o,
              okay: l,
              jailed: c,
              hospital: h,
              isAscending: n,
            }),
            u = this.getStatusSortTuple(e.userId, e.status, {
              currentStatus: s,
              canPrioritizeCurrentArea: r,
              currentAway: a,
              otherAway: o,
              okay: l,
              jailed: c,
              hospital: h,
              isAscending: n,
            });
          for (let t = 0; t < d.length; t++) {
            const e = d[t],
              s = u[t];
            if (e !== s)
              return 0 === t && "number" == typeof e && "number" == typeof s
                ? e - s
                : (4 !== t && 5 !== t) ||
                    "number" != typeof e ||
                    "number" != typeof s
                  ? e < s
                    ? -1
                    : 1
                  : n
                    ? e - s
                    : s - e;
          }
          return this.compareMembers(t, e, "name");
        }
        static getStatusSortTuple(t, e, n) {
          if (!e) return [0, 0, "", 0, 0, 0];
          const s = this.getAreaSortName(e.area);
          if ("Traveling" === e.status || 1 !== e.area) {
            const i =
              n.canPrioritizeCurrentArea &&
              void 0 !== n.currentStatus &&
              e.area === n.currentStatus.area;
            return [
              i ? n.currentAway : n.otherAway,
              i ? 0 : 1,
              s,
              this.getAwayStatusValue(t, e, n.isAscending),
              this.getFlightPhaseSortValue(t, e),
              this.getTravelSortTimestamp(t, e),
            ];
          }
          return "Hospital" === e.status
            ? [n.hospital, 0, "", 0, 0, e.updateAt]
            : "Jail" === e.status
              ? [n.jailed, 0, "", 0, 0, e.updateAt]
              : [n.okay, 0, "", 0, 0, 0];
        }
        static getAreaSortName(t) {
          return 1 === t ? "Torn" : v[t]?.name || "";
        }
        static isAwayFromTorn(t) {
          return Boolean(
            t &&
            ("Traveling" === t.status ||
              (1 !== t.area &&
                ("Abroad" === t.status || "Hospital" === t.status))),
          );
        }
        static getAwayStatusValue(t, e, n) {
          return "Hospital" === e.status
            ? n
              ? 2
              : 1
            : "Jail" === e.status
              ? 3
              : "Traveling" !== e.status || this.isLandedTravelStatus(t, e)
                ? n
                  ? 1
                  : 2
                : 4;
        }
        static getTravelSortTimestamp(t, e) {
          return "Traveling" !== e.status || this.isLandedTravelStatus(t, e)
            ? e.updateAt
            : G.getFlightArrivalTimestamp(t) || e.updateAt;
        }
        static getFlightPhaseSortValue(t, e) {
          if ("Traveling" !== e.status || this.isLandedTravelStatus(t, e))
            return 0;
          const n = G.getFlightArrivalPhase(t);
          return "possible" === n ? 0 : "expected" === n ? 1 : 2;
        }
        static getStatsSortValue(t) {
          return this.stats.get(t)?.sortValue || 0;
        }
        static isFavorite(t) {
          return Boolean(S.get(`faction_favorite_${t}`));
        }
        static persistSortStates() {
          S.set($n, {
            enemy: { ...this.sortStates.enemy },
            own: { ...this.sortStates.own },
          });
        }
        static persistStatsFilters() {
          S.set(Kn, {
            enemy: { ...this.statsFilters.enemy },
            own: { ...this.statsFilters.own },
          });
        }
        static persistStatusFilters() {
          S.set(zn, {
            enemy: [...this.statusFilters.enemy],
            own: [...this.statusFilters.own],
          });
        }
        static persistOnlineFilters() {
          S.set(Yn, {
            enemy: [...this.onlineFilters.enemy],
            own: [...this.onlineFilters.own],
          });
        }
        static persistColumnVisibility() {
          S.set(Gn, { ...this.columnVisibility });
        }
        static toggleSort(t, e) {
          const n = this.sortStates[t];
          (n.field === e
            ? (n.asc = !n.asc)
            : ((n.field = e), (n.asc = "stats" !== e && "score" !== e)),
            this.persistSortStates(),
            this.scheduleMountedUpdates());
        }
        static toggleSettings(t) {
          ((this.activeSettings = this.activeSettings === t ? null : t),
            null !== this.activeSettings &&
              ((this.activeStatsFilter = null),
              (this.activeStatusFilter = null),
              (this.activeOnlineFilter = null)),
            this.scheduleMountedUpdates());
        }
        static toggleFilter(t, e) {
          ((this.activeSettings = null),
            "stats" === e
              ? ((this.activeStatsFilter =
                  this.activeStatsFilter === t ? null : t),
                (this.activeStatusFilter = null),
                (this.activeOnlineFilter = null))
              : "status" === e
                ? ((this.activeStatusFilter =
                    this.activeStatusFilter === t ? null : t),
                  (this.activeStatsFilter = null),
                  (this.activeOnlineFilter = null))
                : ((this.activeOnlineFilter =
                    this.activeOnlineFilter === t ? null : t),
                  (this.activeStatsFilter = null),
                  (this.activeStatusFilter = null)),
            this.scheduleMountedUpdates());
        }
        static closeFilters() {
          (null !== this.activeSettings ||
            this.activeStatsFilter ||
            this.activeStatusFilter ||
            this.activeOnlineFilter) &&
            ((this.activeSettings = null),
            (this.activeStatsFilter = null),
            (this.activeStatusFilter = null),
            (this.activeOnlineFilter = null),
            this.scheduleMountedUpdates());
        }
        static updateOptionalColumnVisibility(t, e, n) {
          ns.some((t) => t.id === e) &&
            this.columnVisibility[t][e] !== n &&
            ((this.columnVisibility[t][e] = n),
            n ||
              this.sortStates[t].field !== e ||
              ((this.sortStates[t] = { field: "status", asc: !0 }),
              this.persistSortStates()),
            this.persistColumnVisibility(),
            this.scheduleMountedUpdates());
        }
        static updateStatsFilter(t, e, n) {
          const s = this.expandStatsFilterSuffix(n);
          ((this.statsFilters[t] = { ...this.statsFilters[t], [e]: s.trim() }),
            this.persistStatsFilters(),
            this.scheduleMountedUpdates());
        }
        static clearStatsFilter(t) {
          ((this.statsFilters[t] = { from: "", to: "" }),
            this.persistStatsFilters(),
            (this.activeStatsFilter = null),
            this.scheduleMountedUpdates());
        }
        static updateChoiceFilter(t, e, n, s) {
          ("status" === e &&
            this.isStatusFilterValue(n) &&
            ((this.statusFilters[t] = this.updateChoiceFilterValues(
              this.statusFilters[t],
              ts,
              n,
              s,
            )),
            this.persistStatusFilters()),
            "online" === e &&
              this.isOnlineFilterValue(n) &&
              ((this.onlineFilters[t] = this.updateChoiceFilterValues(
                this.onlineFilters[t],
                es,
                n,
                s,
              )),
              this.persistOnlineFilters()),
            this.scheduleMountedUpdates());
        }
        static clearChoiceFilter(t, e) {
          ("status" === e
            ? ((this.statusFilters[t] = []),
              (this.activeStatusFilter = null),
              this.persistStatusFilters())
            : ((this.onlineFilters[t] = []),
              (this.activeOnlineFilter = null),
              this.persistOnlineFilters()),
            this.scheduleMountedUpdates());
        }
        static updateChoiceFilterValues(t, e, n, s) {
          const i = new Set(t);
          return (s ? i.add(n) : i.delete(n), e.filter((t) => i.has(t)));
        }
        static isStatusFilterValue(t) {
          return ts.includes(t);
        }
        static isOnlineFilterValue(t) {
          return es.includes(t);
        }
        static closeFiltersOnOutsideClick(t) {
          const e = t.target;
          (e instanceof Element &&
            e.closest(`.${Wn}_filter-ui, .${Wn}_settings-ui`)) ||
            this.closeFilters();
        }
        static hasStatsFilter(t) {
          const e = this.getStatsFilterBounds(t);
          return null !== e.from || null !== e.to;
        }
        static hasStatusFilter(t) {
          return this.statusFilters[t].length > 0;
        }
        static hasOnlineFilter(t) {
          return this.onlineFilters[t].length > 0;
        }
        static filterMembers(t, e) {
          return this.filterMembersByStats(t, e).filter(
            (t) =>
              this.matchesStatusFilter(t, e) && this.matchesOnlineFilter(t, e),
          );
        }
        static matchesStatusFilter(t, e) {
          const n = this.statusFilters[e];
          if (!n.length) return !0;
          const s = this.getStatusFilterValue(t.status);
          return null !== s && n.includes(s);
        }
        static matchesOnlineFilter(t, e) {
          const n = this.onlineFilters[e];
          if (!n.length) return !0;
          const s = this.getOnlineFilterValue(t.status.onlineStatus);
          return null !== s && n.includes(s);
        }
        static getStatusFilterValue(t) {
          return "Hospital" === t.status
            ? "hospital"
            : "Jail" === t.status
              ? "jail"
              : "Traveling" === t.status
                ? "traveling"
                : "Abroad" === t.status || 1 !== t.area
                  ? "abroad"
                  : "Okay" === t.status
                    ? "okay"
                    : null;
        }
        static getOnlineFilterValue(t) {
          return "online" === t || "idle" === t || "offline" === t ? t : null;
        }
        static filterMembersByStats(t, e) {
          const n = this.getStatsFilterBounds(e);
          return null === n.from && null === n.to
            ? t
            : t.filter((t) => {
                const e = this.getStatsSortValue(t.userId);
                return (
                  (null === n.from || e >= n.from) &&
                  (null === n.to || e <= n.to)
                );
              });
        }
        static getStatsFilterBounds(t) {
          const e = this.statsFilters[t];
          return {
            from: this.parseStatFilterValue(e.from),
            to: this.parseStatFilterValue(e.to),
          };
        }
        static parseStatFilterValue(t) {
          const e = this.expandStatsFilterSuffix(t)
            .trim()
            .replace(/,/g, "")
            .toLowerCase();
          if (!e) return null;
          const n = e.match(/^(\d+(?:\.\d+)?|\.\d+)\s*([kmbt]?)$/);
          if (!n) return null;
          const s = Number(n[1]);
          if (!Number.isFinite(s)) return null;
          const i = n[2];
          return s * this.getStatSuffixMultiplier(i);
        }
        static expandStatsFilterSuffix(t) {
          const e = t
            .trim()
            .replace(/,/g, "")
            .toLowerCase()
            .match(/^(\d+(?:\.\d+)?|\.\d+)\s*([kmbt])$/);
          if (!e) return t;
          const n = Number(e[1]);
          return Number.isFinite(n)
            ? this.formatStatFilterNumber(
                n * this.getStatSuffixMultiplier(e[2]),
              )
            : t;
        }
        static getStatSuffixMultiplier(t) {
          switch (t) {
            case "t":
              return 1e12;
            case "b":
              return 1e9;
            case "m":
              return 1e6;
            case "k":
              return 1e3;
            default:
              return 1;
          }
        }
        static formatStatFilterNumber(t) {
          return t.toLocaleString("en-US", {
            useGrouping: !1,
            maximumFractionDigits: 6,
          });
        }
        static getStatusViewDisplay(t, e) {
          return {
            ...this.getStatusDisplay(t, e),
            isTraveling:
              "Traveling" === e.status && !this.isLandedTravelStatus(t, e),
          };
        }
        static getStatusDisplay(t, e) {
          const n = v[e.area],
            s = n?.abbr || e.status;
          if (this.isLandedTravelStatus(t, e)) {
            const t = { key: `landed:${s}:${n?.flagUrl || ""}`, text: s };
            return (n?.flagUrl && (t.flagUrl = n.flagUrl), t);
          }
          if ("Traveling" === e.status) {
            const e = G.getFlightCountdown(t),
              i = e ? u(a() + e.seconds) : void 0,
              r =
                "possible" === e?.phase
                  ? "__warhelper_status_detail_flight_possible"
                  : void 0,
              o = {
                key: `traveling:${s}:${i || ""}:${r || ""}:${n?.flagUrl || ""}`,
                text: s,
                icon: "\u2708",
              };
            return (
              i && ((o.detailText = i), r && (o.detailClass = r)),
              n?.flagUrl && (o.flagUrl = n.flagUrl),
              o
            );
          }
          if ("Abroad" === e.status) {
            const t = { key: `abroad:${s}:${n?.flagUrl || ""}`, text: s };
            return (n?.flagUrl && (t.flagUrl = n.flagUrl), t);
          }
          const i = "Hospital" === e.status || "Jail" === e.status,
            r = u(i ? e.updateAt : 0);
          if ("Hospital" === e.status && 1 !== e.area) {
            const t = {
              key: `hospital-abroad:${s}:${r}:${n?.flagUrl || ""}`,
              text: s,
              detailText: r,
              detailClass: "__warhelper_status_detail_hospital",
            };
            return (n?.flagUrl && (t.flagUrl = n.flagUrl), t);
          }
          return { key: `status:${e.status}:${r}`, text: i ? r : e.status };
        }
        static getStatusClasses(t, e, n) {
          const s = "Okay" === n.text && !n.icon && !n.flagUrl,
            i = "Hospital" === e.status && !s,
            r = "Jail" === e.status && !s,
            a = "Traveling" === e.status && !this.isLandedTravelStatus(t, e),
            o = [];
          return (
            i && o.push("hospital", "not-ok"),
            r && o.push("jail"),
            s && o.push("okay", "ok"),
            1 !== e.area && o.push("abroad"),
            a && o.push("traveling"),
            o.join(" ")
          );
        }
        static isLandedTravelStatus(t, e) {
          return (
            "Traveling" === e.status &&
            1 !== e.area &&
            G.hasExpiredFlightArrival(t)
          );
        }
        static trackOnlineStatusChanges(t) {
          const e = Date.now();
          (this.cleanupExpiredOnlineFlashes(e),
            t.forEach((t) => {
              const n = t.status.onlineStatus,
                s = this.renderedOnlineStatuses.get(t.userId);
              (void 0 !== s &&
                s !== n &&
                this.isFlashOnlineStatus(n) &&
                this.pendingOnlineFlashes.set(t.userId, {
                  status: n,
                  startedAt: e,
                  expiresAt: e + Qn,
                }),
                this.renderedOnlineStatuses.set(t.userId, n));
            }));
        }
        static getPendingOnlineFlash(t) {
          const e = this.pendingOnlineFlashes.get(t.userId);
          if (!e || e.status !== t.status.onlineStatus) return null;
          const n = Date.now();
          return e.expiresAt <= n
            ? (this.pendingOnlineFlashes.delete(t.userId), null)
            : {
                key: `${e.status}:${e.startedAt}`,
                className: `${Wn}_row-${e.status}`,
                delayMs: Math.min(0, e.startedAt - n),
              };
        }
        static cleanupExpiredOnlineFlashes(t) {
          this.pendingOnlineFlashes.forEach((e, n) => {
            e.expiresAt <= t && this.pendingOnlineFlashes.delete(n);
          });
        }
        static isFlashOnlineStatus(t) {
          return "online" === t || "idle" === t;
        }
        static ensureStats(t) {
          this.ensureUserScore();
          const e = new Map();
          (t.forEach((t) => {
            if (!this.stats.has(t.userId)) {
              const e = it(t.userId);
              e.length
                ? this.setSpySources(t.userId, e)
                : this.stats.set(t.userId, this.createLoadingStatDisplay());
            }
            if (this.requestedSpyUsers.has(t.userId)) return;
            const n = e.get(t.factionId) || [];
            (n.push(t.userId), e.set(t.factionId, n));
          }),
            e.forEach((t, e) => {
              if (this.pendingStatsByFaction.has(e)) return;
              t.forEach((t) => this.requestedSpyUsers.add(t));
              const n = this.statsLoadGeneration,
                s = pt(t, e, { onUpdate: (t) => this.applySpyUpdate(t, n) })
                  .then((e) => {
                    n === this.statsLoadGeneration &&
                      t.forEach((t) => {
                        if (this.spySources.get(t)?.length) return;
                        const n = it(t);
                        n.length
                          ? this.setSpySources(t, n)
                          : this.stats.set(t, this.formatSpy(e[t]));
                      });
                  })
                  .catch(() => {
                    n === this.statsLoadGeneration &&
                      t.forEach((t) => {
                        this.spySources.get(t)?.length ||
                          this.stats.set(t, this.createMissingStatDisplay());
                      });
                  })
                  .finally(() => {
                    n === this.statsLoadGeneration &&
                      (this.pendingStatsByFaction.delete(e),
                      this.scheduleMountedUpdates());
                  });
              this.pendingStatsByFaction.set(e, s);
            }));
        }
        static ensureUserScore() {
          if (this.userScoreLoaded || this.pendingUserScore) return;
          const t = this.statsLoadGeneration;
          this.pendingUserScore = Bt.getUserStats()
            .then((t) => t?.score)
            .catch(() => {})
            .then(
              (e) => (
                t !== this.statsLoadGeneration ||
                  ((this.userScore = e),
                  (this.userScoreLoaded = !0),
                  this.refreshStatDisplays()),
                e
              ),
            )
            .finally(() => {
              t === this.statsLoadGeneration && (this.pendingUserScore = null);
            });
        }
        static applySpyUpdate(t, e) {
          e === this.statsLoadGeneration &&
            (this.setSpySources(t.userId, t.spies),
            this.scheduleMountedUpdates());
        }
        static setSpySources(t, e) {
          const n = at(e);
          (this.spySources.set(t, n), this.refreshStatDisplay(t));
        }
        static refreshStatDisplays() {
          (this.spySources.forEach((t, e) => this.refreshStatDisplay(e)),
            this.scheduleMountedUpdates());
        }
        static refreshStatDisplay(t) {
          const e = at(this.spySources.get(t) || []);
          this.stats.set(t, this.formatSpy(e[0], e));
        }
        static applySpySourcePreference() {
          this.refreshStatDisplays();
        }
        static reloadStats() {
          (this.statsLoadGeneration++,
            this.stats.clear(),
            this.spySources.clear(),
            this.pendingStatsByFaction.clear(),
            this.requestedSpyUsers.clear(),
            (this.userScore = void 0),
            (this.userScoreLoaded = !1),
            (this.pendingUserScore = null),
            this.scheduleMountedUpdates());
        }
        static createLoadingStatDisplay() {
          return { html: "Loading", tooltip: "", sortValue: 0, sourceCount: 0 };
        }
        static formatSpy(t, e = []) {
          if (!t || 0 === t.type) return this.createMissingStatDisplay();
          const n = e.length ? at(e) : [t],
            s = this.getSpyTypeDisplay(t.type),
            { ff: i, ffUncapped: r } = this.getSpyFairFight(t),
            a = this.getStatsBarColor(r),
            o = this.getStatsBarPercent(r);
          return {
            html: `\n      <div class="__warhelper_total ${this.getWhoreClass(t)}">${t.total ? p(t.total) : "N/A"}</div>\n      <div class="__warhelper_bstype ${s.className}">${s.shortName}</div>\n      ${i > 0 ? `<div class="__warhelper_compare ${a}" style="--fill: ${o}%;"></div>` : ""}\n    `,
            tooltip: this.createSpyTooltip(n),
            sortValue: t.total || t.score || 0,
            sourceCount: n.length,
          };
        }
        static getSpyFairFight(t) {
          let e = t.fairfight || 0;
          return (
            t.score &&
              this.userScore &&
              (e =
                Math.round(100 * (1 + (8 / 3) * (t.score / this.userScore))) /
                100),
            { ff: Math.min(3, e), ffUncapped: e }
          );
        }
        static createSpyTooltip(t) {
          const e = [];
          return (
            t.forEach((t) => {
              (e.push(this.createSpyTooltipSourceRow(t)),
                1 === t.type &&
                  e.push(
                    this.createSpyTooltipDetailRow("Strength", t.strength),
                    this.createSpyTooltipDetailRow("Defense", t.defense),
                    this.createSpyTooltipDetailRow("Speed", t.speed),
                    this.createSpyTooltipDetailRow("Dexterity", t.dexterity),
                  ));
            }),
            `<table class="__warhelper_tooltip __warhelper_spy_tooltip">${e.join("")}</table>`
          );
        }
        static createSpyTooltipSourceRow(t) {
          const e = this.getSpyTypeDisplay(t.type),
            { ff: n } = this.getSpyFairFight(t);
          return [
            "<tr>",
            `<td><span class="__warhelper_spy_source ${e.className}">${e.tooltipName}</span></td>`,
            `<td>${t.total ? p(t.total, 2) : "N/A"}</td>`,
            `<td>${n > 0 ? n.toFixed(2) : "N/A"}</td>`,
            "</tr>",
          ].join("");
        }
        static createSpyTooltipDetailRow(t, e) {
          return [
            '<tr class="__warhelper_spy_detail">',
            `<td>${t}</td>`,
            `<td colspan="2">${e ? p(e, 2) : "N/A"}</td>`,
            "</tr>",
          ].join("");
        }
        static createMissingStatDisplay() {
          return { html: "N/A", tooltip: "", sortValue: 0, sourceCount: 0 };
        }
        static getStatsBarColor(t) {
          return t >= 5 ? "r" : t >= 4 ? "y" : t >= 3 ? "g" : "w";
        }
        static getStatsBarPercent(t) {
          return t <= 1
            ? 5
            : t >= 5
              ? 100
              : t <= 3
                ? 5 + ((t - 1) / 2) * 45
                : 50 + ((t - 3) / 2) * 50;
        }
        static getWhoreClass(t) {
          if (1 !== t.type) return "";
          const e = [t.strength, t.defense, t.speed, t.dexterity].map(
              (t) => t || 0,
            ),
            n = e.reduce((t, e) => t + e, 0);
          if (!n) return "";
          const s = e.findIndex((t) => t / n >= 0.45);
          return -1 === s ? "" : ["str", "def", "spd", "dex"][s] || "";
        }
        static getSpyTypeDisplay(t) {
          switch (t) {
            case 1:
              return { shortName: "T", className: "T", tooltipName: "TS" };
            case 2:
              return { shortName: "B", className: "B", tooltipName: "BSP" };
            case 3:
              return { shortName: "Y", className: "Y", tooltipName: "YATA" };
            case 4:
              return { shortName: "Y", className: "YE", tooltipName: "YE" };
            case 5:
              return { shortName: "F", className: "F", tooltipName: "FFS" };
            default:
              return { shortName: "?", className: "", tooltipName: "?" };
          }
        }
        static toggleFavorite(t) {
          (S.set(`faction_favorite_${t}`, !this.isFavorite(t)),
            (this.bypassBodyInteractionHoldForNextUpdate = !0),
            this.scheduleMountedUpdates());
        }
        static openAttackPage(t) {
          new Pn(`page.php?sid=attack&user2ID=${t}`, "_attack_warhelper");
        }
        static bindDibs(t, e) {
          const n = t.closest("[data-warhelper-user-id]");
          Nt.bind(e, t, n instanceof HTMLElement ? n : void 0, {
            suppressActiveTooltipRefresh: !0,
          });
        }
        static bindFlyStatus(t, e) {
          e.active
            ? G.bindStatusNode(e.userId, t, e.factionId)
            : (delete t.dataset.warhelperFlyHover,
              t.removeAttribute("title"),
              t.removeAttribute("aria-label"));
        }
        static getLastFavoriteIndex(t) {
          for (let e = t.length - 1; e >= 0; e--) {
            const n = t[e];
            if (n && this.isFavorite(n.userId)) return e;
          }
          return -1;
        }
        static hashSignature(t) {
          let e = 2166136261,
            n = 0;
          return (
            t.forEach((t) => {
              n += t.length;
              for (let n = 0; n < t.length; n++)
                ((e ^= t.charCodeAt(n)), (e = Math.imul(e, 16777619)));
              ((e ^= 124), (e = Math.imul(e, 16777619)));
            }),
            `${t.length}:${n}:${(e >>> 0).toString(36)}`
          );
        }
        static removeDuplicateOverviews(t, e) {
          Array.from(t.children).forEach((t) => {
            t instanceof HTMLElement &&
              t !== e &&
              t.classList.contains(Wn) &&
              t.remove();
          });
        }
        static isActiveOriginal(t) {
          return t.isConnected && t.matches(qn);
        }
        static isActiveMount(t, e) {
          return (
            this.isActiveOriginal(t) &&
            e.parent.contains(t) &&
            e.parent.contains(e.overview)
          );
        }
        static observeLifecycle(t, e, n, s) {
          const i = this.mounts.get(e);
          i && this.cleanupMount(e, i, !1);
          const r = {
            observer: new MutationObserver(() => {
              this.isActiveMount(e, r) || this.cleanupMount(e, r);
            }),
            parent: t,
            overview: n,
            component: s,
            updateFrame: null,
          };
          (r.observer.observe(document.body, { childList: !0, subtree: !0 }),
            this.mounts.set(e, r));
        }
        static cleanupMount(t, e, n = !0) {
          (e.observer.disconnect(),
            null !== e.updateFrame &&
              window.cancelAnimationFrame(e.updateFrame),
            e.component.$destroy(),
            n && e.overview.remove(),
            this.mounts.delete(t),
            this.updateOriginalVisibility());
        }
      });
    })());
})();
