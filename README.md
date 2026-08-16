# torn-scripts

A collection of Tampermonkey userscripts for [Torn](https://www.torn.com), focused on attack shortcuts, war/chain tooling, and faction warfare helpers.

## Scripts

| Script | Description |
| --- | --- |
| [`torn_attack_helper.js`](torn_attack_helper.js) | Customizable numpad shortcuts for attacks to enhance accessibility. |
| [`torn_attack_helper_mac.js`](torn_attack_helper_mac.js) | Mac-optimized attack shortcuts (arrows + J/K/L). |
| [`torn_attack_helper_mac2.js`](torn_attack_helper_mac2.js) | Customizable attack shortcuts using J, K, L and arrow keys. |
| [`torn_attack_helper_mac3.js`](torn_attack_helper_mac3.js) | Attack shortcuts (J, K, L and arrow keys) tuned for MacBook keyboard layout. |
| [`torn_chain_tool.js`](torn_chain_tool.js) | Live chain ETAs, history browser (filters/sort/paging/CSV), chain report viewer, and per-hit timeline chart. Requires faction API access. |
| [`torn_push_detector.js`](torn_push_detector.js) | Detects enemy faction attack-tempo spikes during ranked wars using real-time chain data and a statistical baseline. |
| [`warhelper.js`](warhelper.js) | Various helpers for warring. |
| [`nst.js`](nst.js) | A handful of utility scripts packed into one. |

## Installation

1. Install a userscript manager such as [Tampermonkey](https://www.tampermonkey.net/).
2. Open the raw contents of the script you want and install it (Tampermonkey will detect the `==UserScript==` header automatically).
3. Configure any required settings (e.g. Torn API key) via the script's menu commands in Tampermonkey.

## License

See [LICENSE](LICENSE). Individual scripts may declare their own license in their userscript header.
