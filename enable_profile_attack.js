// ==UserScript==
// @name         Torn Enable Attack Button (Optimized)
// @namespace    https://github.com/MWTBDLTR
// @author       MrChurch [3654415]
// @version      2.0
// @description  Enables the attack button on a Torn profile page robustly and removes all bloat on the attack page with minimal resource usage.
// @match        https://www.torn.com/profiles.php?XID=*
// @match        https://www.torn.com/loader.php?sid=attack*
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // --- Configuration for Bloat Removal ---
    const REMOVE_BLOAT = {
        chat: true, // Disables the chat
        sentry: true, // Disables error logging/tracking
        background: true,
        sidebar: false,
    };

    // --- Core Functionality ---

    /**
     * 1. Handles adding the attacker-style event listener and state.
     * @param {HTMLElement} btn - The attack button element.
     * @param {string} targetId - The ID of the target user.
     */
    function enableAttackButton(btn, targetId) {
        if (btn.dataset.scriptHijacked === "true") return;

        try {
            // Set state and appearance
            btn.dataset.scriptHijacked = "true";
            btn.classList.remove('disabled');
            const attrsToRemove = ['disabled', 'aria-disabled', 'title'];
            attrsToRemove.forEach(attr => btn.removeAttribute(attr));

            Object.assign(btn.style, {
                pointerEvents: 'auto',
                cursor: 'pointer',
                opacity: '1',
                border: '2px solid #ffcc00'
            });
        } catch (err) {
            console.error('Torn Attack Enabler: Error modifying button styles', err);
        }

        // Overrides the click handler for forced redirection
        btn.removeEventListener('click', getrerouteHandler); // Ensure old handler is removed
        btn.addEventListener('click', getrerouteHandler, { capture: true, once: false });
    }

    /**
     * Custom handler to force redirection, bypassing Torn's native click logic.
     * @param {Event} e - The click event.
     */
    function getrerouteHandler(e) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
    }

    /**
     * 2. Removes identified 'bloat' elements from the page.
     * @param {HTMLElement} node - The element to check and potentially remove.
     */
    function destroyBloat(node) {
        if (!node.nodeType) return; // Safety check

        const tagName = node.tagName;
        const id = node.id;
        const className = node.className;
        const src = node.src || '';

        if (REMOVE_BLOAT.chat) {
            if (id === 'chatRoot' || src.includes('/builds/chat/')) {
                node.remove();
                return 'Chat removed';
            }
        }

        if (REMOVE_BLOAT.sentry) {
            if (src.includes('sentry') || src.includes('mon.js') || src.includes('googletagmanager')) {
                node.remove();
                return 'Sentry tracker removed';
            }
        }

        if (REMOVE_BLOAT.background) {
            if (typeof className === 'string' && className.includes('backdrops-container')) {
                node.remove();
                return 'Background container removed';
            }
        }

        if (REMOVE_BLOAT.sidebar) {
            if (id === 'sidebarroot' || src.includes('/builds/sidebar/')) {
                node.remove();
                return 'Sidebar removed';
            }
        }
        return null;
    }

    /**
     * Gets the XID from URL parameters or hash.
     * @returns {string | null} The XID or null.
     */
    function getXid() {
        try {
            const params = new URLSearchParams(window.location.search);
            const xid = params.get('XID');
            if (xid) return xid;
        } catch(e) {
            // Safe to ignore parsing errors
        }

        const hash = window.location.hash;
        const match = hash.match(/ID=(\d+)/);
        return match ? match[1] : null;
    }


    /**
     * --- Event Handlers and Initialization ---
     */

    /* 
     * Highly efficient, delegated handler for Mutations. 
     * We only react to specific changes rather than observing the entire DOM tree.
     */
    const observer = new MutationObserver(mutations => {
        const href = window.location.href;
        const isAttackPage = href.includes('loader.php') && href.includes('sid=attack');
        const isProfilePage = href.includes('profiles.php');

        if (isAttackPage) {
            mutations.forEach(mutation => {
                if (mutation.addedNodes.length) {
                    mutation.addedNodes.forEach(node => {
                        // Check if the node itself needs removal or if it contains removable elements
                        const removalResult = destroyBloat(node);
                        if (removalResult) {
                            console.log(`[TornAttackButtonEnabler] Bloat removed: ${removalResult}`);
                        }
                    });
                }
            });
        } else if (isProfilePage && mutations.some(m => m.type === 'attributes' && m.attributeName === 'class')) {
            // Defer profile button check until a class attribute change is detected, as this is often when the game renders the button.
            const xid = getXid();
            if (xid) {
                // Attempt to find potential buttons using intersection/attribute searching
                const potentialButtons = document.querySelectorAll(
                    'button[role="button"][data-script-hijacked="false"], [title="Attack"]'
                );
                
                potentialButtons.forEach(btn => {
                    const buttonId = btn.id;
                    if (buttonId && buttonId.startsWith('button0-profile-')) {
                        // Found a candidate button, enable it
                        enableAttackButton(btn, xid);
                    }
                });
            }
        }
    });

    /*
     * Setup function: Runs on load to establish the observer and initial state.
     * This is simpler and more robust than observing documentElement from the start if the content is not ready.
     */
    function setupObserver() {
        // Use the body as the root, which is generally stable after document-start.
        const targetNode = document.body;
        if (targetNode) {
            observer.observe(targetNode, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['class', 'disabled'] // Only observe status changes on classes
            });
            console.log('[TornAttackButtonEnabler] Optimized script initialized and monitoring DOM for changes...');
        }
    }

    // Kick-off the setup when the DOM is ready
    if (document.readyState !== 'loading') {
        setupObserver();
    } else {
        document.addEventListener('DOMContentLoaded', setupObserver);
    }

})();