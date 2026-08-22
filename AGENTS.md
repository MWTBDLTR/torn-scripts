# Torn Scripts Repository

Collection of Tampermonkey/Greasemonkey userscripts for Torn.com. No build system, no tests, no linting - plain JavaScript userscripts.

## Files

| File | Purpose |
|------|---------|
| `torn_attack_helper.js` | Main attack helper - numpad shortcuts for weapon slots (1-6), dialog keys (1-3), configurable continue action, follow-up target chaining |
| `torn_attack_helper_mac.js` | Mac variant - arrow keys for weapon slots, J/K/L for dialog, Space for fallback |
| `torn_attack_helper_mac2.js` | MacBook variant - similar to mac.js, different key mappings |
| `torn_attack_helper_mac3.js` | Mac variant with separate storage key (`tah_mac_`), Space fallback, different arrow layout |
| `torn_chain_tool.js` | Chain tools - live ETA, history browser with filters/sort/paging/CSV export, chain report viewer, per-hit timeline chart (Chart.js via @require), IndexedDB caching, Torn API v2 only |

## Key Details

- All scripts use `@match` for `https://www.torn.com/page.php?sid=attack*` (attack helpers) or `war.php*`, `factions.php*` (chain tool)
- Storage: Uses GM_getValue/GM_setValue with localStorage fallback (prefix `tah_` or `tah_mac_`)
- Settings configured via GM_registerMenuCommand (right-click Tampermonkey menu)
- Chain tool requires Torn API key (or "public" mode with faction ID)
- Chain tool uses Chart.js from CDN (`@require https://cdn.jsdelivr.net/npm/chart.js`)

## Development Notes

- No package.json, no node_modules, no build step
- Edit files directly; install via Tampermonkey/Greasemonkey
- Version bumps in `@version` header
- `.gitignore` excludes old war script variants