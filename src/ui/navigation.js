import { appState } from '../core/state.js';
import { $, $$ } from '../utils/helpers.js';
import { ALL_NAV_LINKS, BOTTOM_NAV_BY_ROLE } from '../config/constants.js';
import { animatePageEnter } from '../utils/helpers.js';
import { _closeModalImmediate } from './modals.js';

// Import all page renderers
import { renderDashboardPage } from '../features/dashboard.js';
import { renderPemasukanPage } from '../features/pemasukan.js';
import { renderPengeluaranPage } from '../features/pengeluaran.js';
import { renderAbsensiPage } from '../features/absensi.js';
import { renderJurnalPage } from '../features/jurnal.js';
import { renderStokPage } from '../features/stok.js';
import { renderTagihanPage } from '../features/tagihan.js';
import { renderLaporanPage } from '../features/laporan.js';
import { renderSimulasiBayarPage } from '../features/simulasi.js';
import { renderPengaturanPage, renderLogAktivitasPage } from '../features/pengaturan.js';

let isPageTransitioning = false;

function getAuthScreenHTML() {
    return `
        <div class="auth-card">
            <div class="card-header">
                <h3>Selamat Datang di BanPlex</h3>
            </div>
            <div class="card-body">
                <p>Silakan masuk menggunakan akun Google Anda untuk melanjutkan.</p>
                <button class="btn btn-primary" data-action="auth-action">
                    <span class="material-symbols-outlined">login</span> Masuk dengan Google
                </button>
            </div>
        </div>`;
}

function _getSkeletonLoaderHTML(pageType) {
    if (pageType === 'dashboard') {
        return `
            <div class="skeleton-wrapper">
                <div class="skeleton-grid">
                    <div class="skeleton skeleton-card"></div>
                    <div class="skeleton skeleton-card"></div>
                </div>
                <div class="skeleton-actions">
                    ${Array(5).fill('').map(() => `
                        <div>
                            <div class="skeleton skeleton-icon"></div>
                            <div class="skeleton skeleton-text skeleton-text-sm"></div>
                        </div>
                    `).join('')}
                </div>
                <div class="skeleton skeleton-title"></div>
                <div class="skeleton skeleton-card" style="height: 150px;"></div>
                <div class="skeleton skeleton-card" style="height: 100px;"></div>
            </div>
        `;
    }
    return '<div class="loader-container"><div class="spinner"></div></div>';
}

export function renderUI() {
    const { currentUser, userStatus } = appState;
    if (!currentUser || userStatus !== 'active') {
        document.body.classList.add('guest-mode');
        if (userStatus === 'pending') document.body.classList.add('pending-mode');
        else document.body.classList.remove('pending-mode');
        $('main').innerHTML = `<div class="page-container">${getAuthScreenHTML()}</div>`;
        const titleEl = $('#page-label-name');
        if (titleEl) titleEl.textContent = '';
        const bn = $('#bottom-nav');
        if (bn) bn.innerHTML = '';
        if (userStatus === 'pending') {
            $('.auth-card .card-body')?.insertAdjacentHTML('beforeend', '<p class="pending-status-msg">Akun Anda sedang menunggu persetujuan dari Owner.</p>');
        }
    } else {
        document.body.classList.remove('guest-mode');
        document.body.classList.remove('pending-mode');
        $('main').innerHTML = `<div class="page-container"></div>`;
        renderBottomNav();
        renderSidebar();
        renderPageContent();
        animatePageEnter(document.querySelector('.page-container'), 'up');
        initHistoryNavigation();
    }
}

export function renderBottomNav() {
    const navContainer = $('#bottom-nav');
    if (!navContainer) return;
    const role = appState.userRole;
    const limited = BOTTOM_NAV_BY_ROLE[role] || [];
    let accessibleLinks = ALL_NAV_LINKS.filter(link => link.roles.includes(role));
    if (limited.length > 0) {
        accessibleLinks = accessibleLinks
            .filter(link => limited.includes(link.id))
            .sort((a, b) => limited.indexOf(a.id) - limited.indexOf(b.id));
    }
    const navItemsHTML = accessibleLinks.map(link => {
        const isActive = appState.activePage === link.id;
        let badgeHTML = '';
        if (link.id === 'pengaturan' && appState.pendingUsersCount > 0) {
            badgeHTML = `<span class="notification-badge">${appState.pendingUsersCount}</span>`;
        }
        return `
            <button class="nav-item ${isActive?'active' : ''}" data-nav="${link.id}">
                ${badgeHTML}
                <span class="material-symbols-outlined">${link.icon}</span>
                <span class="nav-label">${link.label}</span>
            </button>
        `;
    }).join('');
    navContainer.innerHTML = navItemsHTML;
}

export function renderSidebar() {
    const sidebar = $('#sidebar-nav');
    if (!sidebar) return;
    const { currentUser, userStatus } = appState;
    if (!currentUser || userStatus !== 'active') {
        sidebar.innerHTML = '';
        return;
    }
    const links = ALL_NAV_LINKS.filter(l => l.roles.includes(appState.userRole));
    const itemsHTML = links.map(link => {
        const isActive = appState.activePage === link.id;
        const badge = link.id === 'pengaturan' && appState.pendingUsersCount > 0
            ? `<span class="notification-badge">${appState.pendingUsersCount}</span>`
            : '';
        return `
            <button class="sidebar-nav-item ${isActive ? 'active' : ''}" data-nav="${link.id}">
                <span class="material-symbols-outlined">${link.icon}</span>
                <span class="nav-text">${link.label}</span>
                ${badge}
            </button>
        `;
    }).join('');
    const user = appState.currentUser;
    const profileHTML = user ? `
        <div class="sidebar-profile">
            <div class="sidebar-profile-info">
                <img class="profile-avatar-sm" src="${user.photoURL || 'icons-logo.png'}" alt="${user.displayName || 'User'}" />
                <div class="profile-text">
                    <span class="profile-name-sm">${user.displayName || 'Pengguna'}</span>
                    <span class="profile-email-sm">${user.email || ''}</span>
                </div>
            </div>
        </div>
    ` : '';
    sidebar.innerHTML = `
        <div class="sidebar-header">
            <img class="sidebar-logo" src="icons-logo.png" alt="BanPlex" />
            <span class="sidebar-app-name">BanPlex</span>
        </div>
        <div class="sidebar-nav-list">${itemsHTML}</div>
        ${profileHTML}
    `;
}

export function renderPageContent() {
    const { activePage, userStatus } = appState;
    if (userStatus !== 'active') return;
    const pageLink = ALL_NAV_LINKS.find(link => link.id === activePage);
    $('#page-label-name').textContent = pageLink ? pageLink.label : '';
    const container = $('.page-container');
    container.innerHTML = _getSkeletonLoaderHTML(activePage);

    const pageRenderers = {
        'dashboard': renderDashboardPage,
        'pemasukan': renderPemasukanPage,
        'pengeluaran': renderPengeluaranPage,
        'absensi': renderAbsensiPage,
        'jurnal': renderJurnalPage,
        'stok': renderStokPage,
        'tagihan': renderTagihanPage,
        'laporan': renderLaporanPage,
        'simulasi': renderSimulasiBayarPage,
        'pengaturan': renderPengaturanPage,
        'log_aktivitas': renderLogAktivitasPage
    };
    const renderFunc = pageRenderers[activePage];
    if (typeof renderFunc === 'function') {
        return renderFunc();
    } else {
        container.innerHTML = `<p class="empty-state">Halaman tidak ditemukan.</p>`;
        return Promise.resolve();
    }
}

export async function handleNavigation(navId, opts = {}) {
    if (!navId || appState.activePage === navId || isPageTransitioning) {
        return;
    }
    isPageTransitioning = true;
    const container = document.querySelector('.page-container');
    setTimeout(() => { isPageTransitioning = false; }, 450);

    let exitClass = 'page-exit-to-left';
    let enterClass = 'page-enter-from-right';
    if (opts.source === 'bottom' || opts.source === 'history') {
        const items = Array.from(document.querySelectorAll('#bottom-nav .nav-item, .sidebar-nav-item'));
        const fromIndex = items.findIndex(i => i.dataset.nav === appState.activePage);
        const toIndex = items.findIndex(i => i.dataset.nav === navId);
        if (fromIndex > -1 && toIndex > -1 && toIndex < fromIndex) {
            exitClass = 'page-exit-to-right';
            enterClass = 'page-enter-from-left';
        }
    } else if (opts.source === 'quick') {
        exitClass = 'page-exit-fade';
        enterClass = 'page-enter-fade';
    }

    container.classList.add(exitClass);

    setTimeout(async () => {
        appState.activePage = navId;
        localStorage.setItem('lastActivePage', navId);
        if (opts.push !== false) {
            try {
                history.pushState({ page: navId }, '', window.location.href);
            } catch (_) {}
        }
        renderBottomNav();
        renderSidebar();
        await renderPageContent();
        container.classList.remove('page-exit-to-left', 'page-exit-to-right', 'page-exit-fade');
        container.classList.add(enterClass);
        requestAnimationFrame(() => {
            container.classList.remove(enterClass);
        });
    }, 200);
}

export function initHistoryNavigation() {
    if (window.__banplex_history_init) return;
    window.__banplex_history_init = true;
    try {
        if ('replaceState' in history) {
            history.replaceState({ page: appState.activePage }, '', window.location.href);
        }
    } catch (_) {}
    window.addEventListener('popstate', (e) => {
        const container = $('#modal-container');
        if (container) {
            const modals = Array.from(container.querySelectorAll('.modal-bg'));
            const top = modals[modals.length - 1];
            if (top) {
                _closeModalImmediate(top);
                return;
            }
        }
        const target = e.state && e.state.page ? e.state.page : appState.activePage;
        handleNavigation(target, { source: 'history', push: false });
    });
}