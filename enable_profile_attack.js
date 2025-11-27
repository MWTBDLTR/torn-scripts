// ==UserScript==
// @name         Torn Enable Attack Button
// @namespace    https://github.com/MWTBDLTR
// @author       MrChurch [3654415]
// @version      1.6
// @description  Enables the attack button on a Torn profile page regardless of target status and disables bloat on attack page
// @match        https://www.torn.com/profiles.php?XID=*
// @match        https://www.torn.com/loader.php?sid=attack*
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    const REMOVE_BLOAT = {
        chat: true, // disables the chat
        sentry: true, // disables error logging/tracking
        background: true,
        sidebar: false,
    };

    function enableAttackButton(btn, targetId) {
        if (btn.dataset.scriptHijacked === "true") return;

        try {
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

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            window.location.href = `https://www.torn.com/loader.php?sid=attack&user2ID=${targetId}`;
        }, { capture: true, once: false });

        btn.dataset.scriptHijacked = "true";
    }

    function destroyBloat(node) {
        if (node.nodeType !== 1) return;

        const tagName = node.tagName;
        const id = node.id;
        const className = node.className;
        const src = node.src || '';

        if (REMOVE_BLOAT.chat) {
            if (id === 'chatRoot' || src.includes('/builds/chat/')) {
                node.remove();
                return;
            }
        }

        if (REMOVE_BLOAT.sentry) {
            if (src.includes('sentry') || src.includes('mon.js') || src.includes('googletagmanager')) {
                node.remove();
                return;
            }
        }

        if (REMOVE_BLOAT.background) {
            if (typeof className === 'string' && className.includes('backdrops-container')) {
                node.remove();
                return;
            }
        }

        if (REMOVE_BLOAT.sidebar) {
             if (id === 'sidebarroot' || src.includes('/builds/sidebar/')) {
                node.remove();
                return;
             }
        }
    }

    function getXid() {
        const params = new URLSearchParams(window.location.search);
        const xid = params.get('XID');
        if (xid) return xid;

        const hash = window.location.hash;
        const match = hash.match(/ID=(\d+)/);
        return match ? match[1] : null;
    }

    const observer = new MutationObserver((mutations) => {
        const href = window.location.href;
        const isAttackPage = href.includes('loader.php') && href.includes('sid=attack');
        const isProfilePage = href.includes('profiles.php');

        if (isAttackPage) {
            for (const mutation of mutations) {
                if (mutation.addedNodes.length) {
                    mutation.addedNodes.forEach(destroyBloat);
                }
            }
        } else if (isProfilePage) {
            const xid = getXid();
            if (xid) {
                const btn = document.getElementById('button0-profile-attack') || document.querySelector('[id^="button0-profile-"]');
                if (btn) enableAttackButton(btn, xid);
            }
        }
    });

    const targetNode = document.documentElement || document.body;
    if (targetNode) {
        observer.observe(targetNode, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'disabled']
        });
    }
    console.log('[TornAttackButtonEnabler] started successfully...')
})();