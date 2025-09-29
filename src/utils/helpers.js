import { appState } from '../core/state.js';

export const $ = (s, context = document) => context.querySelector(s);
export const $$ = (s, context = document) => Array.from(context.querySelectorAll(s));

export const fmtIDR = (n) => new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
}).format(Number(n || 0));

export const generateUUID = () => {
    try {
        if (crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    } catch (_) {}
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0,
            v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

export const parseFormattedNumber = (str) => Number(String(str).replace(/[^0-9]/g, ''));

export function parseLocaleNumber(val) {
    if (val == null) return 0;
    let s = String(val).trim();
    if (!s) return 0;
    s = s.replace(/,/g, '.');
    s = s.replace(/\s+/g, '');
    const parts = s.split('.');
    if (parts.length > 2) {
        const dec = parts.pop();
        s = parts.join('') + '.' + dec;
    }
    const n = Number(s);
    return isNaN(n) ? 0 : n;
}

export const _getJSDate = (dateObject) => {
    if (!dateObject) return new Date();
    if (typeof dateObject.toDate === 'function') return dateObject.toDate();
    if (dateObject && typeof dateObject.seconds === 'number') {
        const d = new Date(dateObject.seconds * 1000);
        if (isNaN(d.getTime())) return new Date();
        return d;
    }
    if (dateObject instanceof Date) {
        if (isNaN(dateObject.getTime())) return new Date();
        return dateObject;
    }
    const parsedDate = new Date(dateObject);
    if (isNaN(parsedDate.getTime())) return new Date();
    return parsedDate;
};

export function _formatNumberInput(e) {
    const input = e.target;
    let selectionStart = input.selectionStart;
    const originalLength = input.value.length;
    const rawValue = parseFormattedNumber(input.value);

    if (isNaN(rawValue)) {
        input.value = '';
        return;
    }

    const formattedValue = new Intl.NumberFormat('id-ID').format(rawValue);

    if (input.value !== formattedValue) {
        input.value = formattedValue;
        const newLength = formattedValue.length;
        const diff = newLength - originalLength;
        if (selectionStart !== null) {
            input.setSelectionRange(selectionStart + diff, selectionStart + diff);
        }
    }
}

export function animateNumber(element, to) {
    if (!element || to == null || isNaN(Number(to))) return;
    const currentText = element.textContent || '0';
    let from = parseFormattedNumber(currentText);
    if (from === to && !element.dataset.animated) {
        from = 0;
    }
    if (from === to) return;
    const duration = 600;
    const startTime = performance.now();
    element.dataset.animated = '1';

    function step(now) {
        const elapsed = now - startTime;
        if (elapsed >= duration) {
            element.textContent = fmtIDR(to);
            return;
        }
        const progress = elapsed / duration;
        const current = Math.round(from + (to - from) * progress);
        element.textContent = fmtIDR(current);
        requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

export function _getEmptyStateHTML({ icon = 'inbox', title = 'Tidak Ada Data', desc = 'Belum ada data untuk ditampilkan.', action, actionLabel } = {}) {
    const btn = action && actionLabel ? `<button class="btn btn-primary" data-action="${action}">${actionLabel}</button>` : '';
    return `<div class="empty-state-card"><span class="material-symbols-outlined">${icon}</span><div class="title">${title}</div><div class="desc">${desc}</div>${btn}</div>`;
}

export function animatePageEnter(container, effect = 'to-left') {
    if (!container) return;
    try {
        if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    } catch (_) {}
    container.classList.remove('page-exit','page-exit-left','page-exit-right','page-exit-fade');
    let enterClass = 'page-enter-from-right';
    if (effect === 'to-right') enterClass = 'page-enter-from-left';
    else if (effect === 'fade') enterClass = 'page-enter-fade';
    else if (effect === 'up') enterClass = 'page-enter-up';
    container.classList.add(enterClass);
    requestAnimationFrame(() => requestAnimationFrame(() => container.classList.remove(enterClass)));
}

export async function _animateTabSwitch(contentContainer, renderNewContentFunc, direction = 'forward') {
    if (!contentContainer) return;
    const exitClass = direction === 'forward' ? 'sub-page-exit-to-left' : 'sub-page-exit-to-right';
    const enterClass = direction === 'forward' ? 'sub-page-enter-from-right' : 'sub-page-enter-from-left';
    contentContainer.classList.add(exitClass);
    await new Promise(resolve => setTimeout(resolve, 200));
    await renderNewContentFunc();
    contentContainer.classList.remove(exitClass);
    contentContainer.classList.add(enterClass);
    requestAnimationFrame(() => {
        contentContainer.classList.remove(enterClass);
    });
}

export async function _compressImage(file, quality = 0.85, maxWidth = 1024) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let { width, height } = img;
                if (width > maxWidth) {
                    height = (maxWidth / width) * height;
                    width = maxWidth;
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => {
                    if (blob) {
                        resolve(new File([blob], file.name, { type: file.type }));
                    } else {
                        reject(new Error('Gagal membuat blob gambar.'));
                    }
                }, file.type, quality);
            };
            img.onerror = reject;
        };
        reader.onerror = reject;
    });
}

export const isViewer = () => appState.userRole === 'Viewer';

export function setBreadcrumb(parts = []) {
    const bc = $('#breadcrumb-container');
    if (!bc) return;
    if (!(appState.activePage === 'jurnal' || appState.activePage === 'tagihan')) {
        bc.innerHTML = '';
        return;
    }
    const html = parts.filter(Boolean).map((p, i) => i === 0?`<span>${p}</span>` : `<span style="opacity:.7">/</span><span>${p}</span>`).join(' ');
    bc.innerHTML = html;
}

export async function updateBreadcrumbFromState(extra = []) {
    const { ALL_NAV_LINKS } = await import('../config/constants.js');
    const current = ALL_NAV_LINKS.find(l => l.id === appState.activePage)?.label || '';
    setBreadcrumb([current, ...extra]);
}

export const centerTextPlugin = {
    id: 'centerText',
    afterDraw: function(chart) {
        if (chart.config.type !== 'doughnut') return;

        const ctx = chart.ctx;
        const chartArea = chart.chartArea;
        const centerX = (chartArea.left + chartArea.right) / 2;
        const centerY = (chartArea.top + chartArea.bottom) / 2;

        ctx.save();

        let labelToDraw = "Total";
        let textToDraw = "";

        const total = chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
        textToDraw = fmtIDR(total);

        const activeElements = chart.getActiveElements();
        if (activeElements.length > 0) {
            const activeIndex = activeElements[0].index;
            const activeData = chart.data.datasets[0].data[activeIndex];
            const activeLabel = chart.data.labels[activeIndex];

            labelToDraw = activeLabel;
            textToDraw = fmtIDR(activeData);
        }

        ctx.font = '600 0.8rem Inter';
        ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-dim').trim();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(labelToDraw, centerX, centerY - 10);

        ctx.font = '700 1.1rem Inter';
        ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text').trim();
        ctx.fillText(textToDraw, centerX, centerY + 12);

        ctx.restore();
    }
};