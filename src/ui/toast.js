import { $ } from '../utils/helpers.js';

let toastTimeout = null;

export function toast(type, message, duration = 4000) {
    const container = $('#popup-container');
    if (!container) return;
    if (!container.querySelector('.popup-content')) {
        container.innerHTML = `<div class="popup-content"><span id="popup-icon"></span><p id="popup-message"></p></div>`;
    }
    const iconEl = $('#popup-icon', container);
    const msgEl = $('#popup-message', container);
    if (!msgEl || !iconEl) return;
    const icons = {
        success: 'check_circle',
        error: 'error',
        info: 'info'
    };
    container.className = `popup-container popup-${type}`;
    msgEl.textContent = message;
    if (toastTimeout) clearTimeout(toastTimeout);
    if (type === 'syncing') {
        iconEl.className = 'spinner';
    } else {
        iconEl.className = 'material-symbols-outlined';
        iconEl.textContent = icons[type] || 'info';
        toastTimeout = setTimeout(() => container.classList.remove('show'), duration);
    }
    container.classList.add('show');
}

export const hideToast = () => {
    if (toastTimeout) clearTimeout(toastTimeout);
    $('#popup-container')?.classList.remove('show');
};

export function _initToastSwipeHandler() {
    const container = $('#popup-container');
    if (!container) return;

    let startX = 0;
    let currentX = 0;
    let isDragging = false;
    let animationFrameId = null;

    const updatePosition = () => {
        if (!isDragging) return;
        const diffX = currentX - startX;
        container.style.transform = `translateX(calc(-50% + ${diffX}px))`;
        animationFrameId = requestAnimationFrame(updatePosition);
    };

    container.addEventListener('touchstart', (e) => {
        if (!container.classList.contains('show')) return;
        if (toastTimeout) clearTimeout(toastTimeout);
        startX = e.touches[0].clientX;
        isDragging = true;
        container.style.transition = 'none';
        animationFrameId = requestAnimationFrame(updatePosition);
    }, { passive: true });

    container.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        currentX = e.touches[0].clientX;
    }, { passive: true });

    container.addEventListener('touchend', (e) => {
        if (!isDragging) return;
        isDragging = false;
        cancelAnimationFrame(animationFrameId);

        const diffX = e.changedTouches[0].clientX - startX;
        const threshold = container.offsetWidth * 0.4;

        container.style.transition = 'transform 0.3s ease, opacity 0.3s ease, bottom 0.35s ease';

        if (Math.abs(diffX) > threshold) {
            const direction = diffX > 0 ? 1 : -1;
            container.style.transform = `translateX(calc(-50% + ${direction * container.offsetWidth}px))`;
            container.style.opacity = '0';

            setTimeout(() => {
                hideToast();
                container.style.transform = 'translateX(-50%)';
                container.style.opacity = '1';
            }, 300);

        } else {
            container.style.transform = 'translateX(-50%)';
        }
    });
}