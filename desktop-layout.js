// desktop-layout.js

/**
 * Fungsi ini diekspor untuk dipanggil dari script.js.
 * Tugasnya adalah membangun layout dua panel untuk halaman Tagihan di desktop
 * dan mengembalikan fungsi handler klik khusus untuk desktop.
 * @param {HTMLElement} container - Elemen kontainer utama halaman.
 * @param {Function} detailRenderer - Fungsi dari script.js untuk merender konten detail.
 * @returns {Function} Sebuah fungsi yang akan menangani klik pada item tagihan di desktop.
 */
export function setupTagihanDesktopLayout(container, detailRenderer) {
    
    // 1. Membuat HTML untuk layout dua panel
    container.innerHTML = `
        <div id="tagihan-desktop-layout">
            <aside id="detail-pane">
                ${_getDesktopDetailPaneHTML()}
            </aside>
            <main id="list-pane">
                <div class="toolbar sticky-toolbar" id="tagihan-toolbar">
                    <div class="search"><span class="material-symbols-outlined">search</span><input type="search" id="tagihan-search-input" placeholder="Cari tagihan..."></div>
                    <button class="btn-icon" id="tagihan-filter-btn" title="Filter"><span class="material-symbols-outlined">filter_list</span></button>
                    <button class="btn-icon" id="tagihan-sort-btn" title="Urutkan"><span class="material-symbols-outlined">sort</span></button>
                </div>
                <div id="main-tabs-container" class="sub-nav two-tabs">
                    <button class="sub-nav-item active" data-tab="unpaid">Belum Lunas</button>
                    <button class="sub-nav-item" data-tab="paid">Lunas</button>
                </div>
                <div id="category-sub-nav-container" class="category-sub-nav"></div>
                <div id="list-pane-content"></div>
            </main>
        </div>
    `;

    // 2. Mengembalikan fungsi yang akan dijalankan saat item di list di-klik
    return function handleDesktopBillClick(targetElement) {
        const itemEl = targetElement.closest('.dense-list-item[data-id]');
        if (!itemEl) return;
    
        const billId = itemEl.dataset.id;
        const expenseId = itemEl.dataset.expenseId;
    
        // Hapus highlight dari item lain dan tambahkan ke yang baru diklik
        document.querySelectorAll('#list-pane .dense-list-item.active').forEach(el => el.classList.remove('active'));
        itemEl.classList.add('active');
        
        // Panggil fungsi detailRenderer yang dioper dari script.js
        detailRenderer(billId, expenseId);
    }
}

/**
 * [HELPER INTERNAL] Membuat HTML untuk panel detail (kosong atau terisi).
 */
function _getDesktopDetailPaneHTML(billId = null, contentData = null) {
    if (!billId || !contentData) {
        return `
            <div class="detail-pane-empty-state">
                <span class="material-symbols-outlined">wysiwyg</span>
                <p>Pilih item dari daftar untuk melihat detailnya di sini.</p>
            </div>
        `;
    }

    const { title, content, actions } = contentData;

    return `
        <div class="detail-pane-header">
            <h4>${title}</h4>
        </div>
        <div class="detail-pane-body">${content}</div>
        ${actions ? `<div class="detail-pane-footer">${actions}</div>` : ''}
    `;
}

/**
 * [HELPER EKSPOR] Merender konten ke panel detail.
 * Diekspor agar bisa dipanggil langsung oleh script.js.
 */
export function renderDesktopDetailPane(contentData) {
    const detailPane = document.getElementById('detail-pane');
    if (!detailPane) return;

    if (!contentData) {
        detailPane.innerHTML = _getDesktopDetailPaneHTML();
        return;
    }
    
    // Tampilkan loader dulu
    detailPane.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';
    
    // Gunakan timeout kecil agar loader sempat tampil sebelum konten berat dirender
    setTimeout(() => {
        detailPane.innerHTML = _getDesktopDetailPaneHTML(contentData.id, contentData);
    }, 50);
}