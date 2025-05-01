// ==UserScript==
// @name         ArsonWarehouse Foreign Stock Auto Refresh
// @namespace    https://greasyfork.org/en/users/1463000-mwtbdltr
// @version      1.3.1
// @description  Refreshes foreign stock every minute, with a draggable on/off toggle button and countdown.
// @author       MrChurchh [3654415]
// @license      MIT
// @match        https://arsonwarehouse.com/foreign-stock*
// @icon         https://arsonwarehouse.com/favicon.ico
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Config
    const REFRESH_INTERVAL = 60; // seconds

    // State
    let refreshEnabled = true;
    let secondsLeft = REFRESH_INTERVAL;
    let refreshTimer = null;
    let countdownTimer = null;

    // Refresh & Countdown
    function scheduleRefresh() {
        refreshTimer = setTimeout(() => {
            if (refreshEnabled) window.location.reload();
        }, secondsLeft * 1000);
    }

    function startCountdown() {
        updateToggleText();
        countdownTimer = setInterval(() => {
            if (!refreshEnabled) return;
            secondsLeft--;
            if (secondsLeft <= 0) secondsLeft = REFRESH_INTERVAL;
            updateToggleText();
        }, 1000);
    }

    function stopTimers() {
        clearTimeout(refreshTimer);
        clearInterval(countdownTimer);
    }

    function resetTimers() {
        stopTimers();
        secondsLeft = REFRESH_INTERVAL;
        scheduleRefresh();
        startCountdown();
    }

    // UI Setup
    const toggleBox = document.createElement('div');
    Object.assign(toggleBox.style, {
        position: 'fixed',
        padding: '6px 10px',
        backgroundColor: '#222',
        color: '#fff',
        fontSize: '12px',
        borderRadius: '4px',
        cursor: 'pointer',
        zIndex: 9999,
        userSelect: 'none'
    });

    // Load saved position
    const saved = JSON.parse(localStorage.getItem('arsonTogglePos') || 'null');
    if (saved && saved.left && saved.top) {
        toggleBox.style.left = saved.left;
        toggleBox.style.top  = saved.top;
    } else {
        toggleBox.style.left = '10px';
        toggleBox.style.top  = '10px';
    }
    document.body.appendChild(toggleBox);

    function updateToggleText() {
        if (refreshEnabled) {
            toggleBox.textContent = `Auto Refresh: ON (${secondsLeft}s)`;
        } else {
            toggleBox.textContent = 'Auto Refresh: OFF';
        }
    }

    // Drag vs. Click
    let isDragging = false, startX, startY, origX, origY;
    toggleBox.addEventListener('mousedown', e => {
        isDragging = false;
        startX = e.clientX; startY = e.clientY;
        const rect = toggleBox.getBoundingClientRect();
        origX = rect.left; origY = rect.top;

        const onMouseMove = moveEvt => {
            const dx = moveEvt.clientX - startX;
            const dy = moveEvt.clientY - startY;
            if (!isDragging && Math.hypot(dx, dy) > 5) {
                isDragging = true;
            }
            if (isDragging) {
                toggleBox.style.left = `${origX + dx}px`;
                toggleBox.style.top  = `${origY + dy}px`;
            }
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);

            if (isDragging) {
                // Save new position
                localStorage.setItem('arsonTogglePos', JSON.stringify({
                    left:  toggleBox.style.left,
                    top:   toggleBox.style.top
                }));
            } else {
                // Toggle refresh on click
                refreshEnabled = !refreshEnabled;
                if (refreshEnabled) {
                    resetTimers();
                } else {
                    stopTimers();
                    updateToggleText();
                }
            }
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        e.preventDefault();
    });

    // Init
    resetTimers();

})();
