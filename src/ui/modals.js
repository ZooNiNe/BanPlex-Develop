import { appState } from '../core/state.js';
import { $, $$, fmtIDR, isViewer } from '../utils/helpers.js';
import { createMasterDataSelect } from './components.js';

export function createModal(type, data = {}) {
    let modalContainer = $('#modal-container');
    if (!modalContainer) {
        modalContainer = document.createElement('div');
        modalContainer.id = 'modal-container';
        document.body.appendChild(modalContainer);
    }

    const modalEl = document.createElement('div');
    modalEl.id = `${type}-modal`;
    modalEl.className = 'modal-bg';
    modalEl.innerHTML = getModalContent(type, data);
    modalContainer.appendChild(modalEl);

    setTimeout(() => modalEl.classList.add('show'), 10);

    try {
        if ('pushState' in history) {
            if (history.state && history.state.modal === true) {
                history.replaceState({ page: appState.activePage, modal: true, id: modalEl.id }, '', window.location.href);
            } else {
                history.pushState({ page: appState.activePage, modal: true, id: modalEl.id }, '', window.location.href);
            }
        }
    } catch (_) {}

    const closeModalFunc = () => {
        closeModal(modalEl);
        if (data.onClose) data.onClose();
    };

    modalEl.addEventListener('click', e => {
        if (e.target === modalEl) closeModalFunc();
    });
    modalEl.querySelectorAll('[data-close-modal]').forEach(btn => btn.addEventListener('click', closeModalFunc));

    return modalEl;
}

export function closeModal(modalEl) {
    if (!modalEl) return;
    try {
        if (history.state && history.state.modal === true) {
            history.back();
            return;
        }
    } catch (_) {}
    _closeModalImmediate(modalEl);
}

export function _closeModalImmediate(modalEl) {
    if (!modalEl) return;
    modalEl.classList.remove('show');
    setTimeout(() => modalEl.remove(), 300);
}

function getModalContent(type, data) {
    if (type === 'imageView') {
        return `<div class="image-view-modal" data-close-modal>
                        <img src="${data.src}" alt="Lampiran">
                        <button class="btn-icon image-view-close" data-close-modal>
                            <span class="material-symbols-outlined">close</span>
                        </button>
                    </div>`;
    }

    const modalWithHeader = (title, content) => `<div class="modal-content"><div class="modal-header"><h4>${title}</h4><button class="btn-icon" data-close-modal><span class="material-symbols-outlined">close</span></button></div><div class="modal-body">${content}</div></div>`;
    const simpleModal = (title, content, footer) => `<div class="modal-content simple-modal-content" style="max-width:400px"><div class="modal-header"><h4>${title}</h4></div><div class="modal-body">${content}</div><div class="modal-footer">${footer}</div></div>`;

    if (type === 'login') return simpleModal('Login', '<p>Gunakan akun Google Anda.</p>', '<button id="google-login-btn" class="btn btn-primary" data-action="google-login">Masuk dengan Google</button>');
    if (type === 'confirmLogout') return simpleModal('Keluar', '<p>Anda yakin ingin keluar?</p>', '<button class="btn btn-secondary" data-close-modal>Batal</button><button id="confirm-logout-btn" class="btn btn-danger" data-action="confirm-logout">Keluar</button>');

    if (type === 'confirmDelete' || type === 'confirmPayment' || type === 'confirmEdit' || type === 'confirmPayBill' || type === 'confirmGenerateBill' || type === 'confirmUserAction' || type === 'confirmDeleteAttachment' || type === 'confirmDeleteRecap') {
        const titles = { confirmDelete: 'Konfirmasi Hapus', confirmPayment: 'Konfirmasi Pembayaran', confirmEdit: 'Konfirmasi Perubahan', confirmPayBill: 'Konfirmasi Pembayaran', confirmGenerateBill: 'Konfirmasi Buat Tagihan', confirmUserAction: 'Konfirmasi Aksi', confirmDeleteAttachment: 'Hapus Lampiran', confirmDeleteRecap: 'Hapus Rekap Gaji' };
        const messages = { confirmDelete: 'Anda yakin ingin menghapus data ini?', confirmPayment: 'Anda yakin ingin melanjutkan pembayaran?', confirmEdit: 'Anda yakin ingin menyimpan perubahan?', confirmPayBill: 'Anda yakin ingin melanjutkan pembayaran ini?', confirmGenerateBill: 'Anda akan membuat tagihan gaji untuk pekerja ini. Lanjutkan?', confirmUserAction: 'Apakah Anda yakin?', confirmDeleteAttachment: 'Anda yakin ingin menghapus lampiran ini?', confirmDeleteRecap: 'Menghapus rekap ini akan menghapus data absensi terkait. Aksi ini tidak dapat dibatalkan. Lanjutkan?' };
        const confirmTexts = { confirmDelete: 'Hapus', confirmPayment: 'Ya, Bayar', confirmEdit: 'Ya, Simpan', confirmPayBill: 'Ya, Bayar', confirmGenerateBill: 'Ya, Buat Tagihan', confirmUserAction: 'Ya, Lanjutkan', confirmDeleteAttachment: 'Ya, Hapus', confirmDeleteRecap: 'Ya, Hapus' };
        const confirmClasses = { confirmDelete: 'btn-danger', confirmPayment: 'btn-success', confirmEdit: 'btn-primary', confirmPayBill: 'btn-success', confirmGenerateBill: 'btn-primary', confirmUserAction: 'btn-primary', confirmDeleteAttachment: 'btn-danger', confirmDeleteRecap: 'btn-danger' };
        return simpleModal(titles[type], `<p class="confirm-modal-text">${data.message || messages[type]}</p>`, `<button class="btn btn-secondary" data-close-modal>Batal</button><button id="confirm-btn" class="btn ${confirmClasses[type]}">${confirmTexts[type]}</button>`);
    }

    if (type === 'confirmExpense') {
        return simpleModal('Konfirmasi Status Pengeluaran', '<p>Apakah pengeluaran ini sudah dibayar atau akan dijadikan tagihan?</p>', `<button class="btn btn-secondary" id="confirm-bill-btn">Jadikan Tagihan</button><button id="confirm-paid-btn" class="btn btn-success">Sudah, Lunas</button>`);
    }
    if (type === 'dataDetail' || type === 'payment' || type === 'manageMaster' || type === 'editMaster' || type === 'editItem' || type === 'editAttendance' || type === 'imageView' || type === 'manageUsers') {
        return modalWithHeader(data.title, data.content);
    }
    if (type === 'actionsMenu') {
        const { actions, targetRect } = data;
        const top = targetRect.bottom + 8;
        const right = window.innerWidth - targetRect.right - 8;
        return `<div class="actions-menu" style="top:${top}px; right:${right}px;">${actions.map(action => `<button class="actions-menu-item" data-action="${action.action}" data-id="${action.id}" data-type="${action.type}" data-expense-id="${action.expenseId || ''}"><span class="material-symbols-outlined">${action.icon}</span><span>${action.label}</span></button>`).join('')}</div>`;
    }
    if (type === 'invoiceItemsDetail') {
        const { items, totalAmount } = data;
        const itemsHTML = items.map(item => {
            const material = appState.materials.find(m => m.id === item.materialId);
            const itemName = material ? material.materialName : 'Material Dihapus';
            const itemUnit = material ? `(${material.unit})` : '';
            return `<div class="invoice-detail-item"><div class="item-main-info"><span class="item-name">${itemName}</span><span class="item-total">${fmtIDR(item.total)}</span></div><div class="item-sub-info"><span>${item.qty} ${itemUnit} x ${fmtIDR(item.price)}</span></div></div>`;
        }).join('');
        return modalWithHeader('Rincian Faktur', `<div class="invoice-detail-list">${itemsHTML}</div><div class="invoice-detail-summary"><span>Total Faktur</span><strong>${fmtIDR(totalAmount)}</strong></div>`);
    }
    if (type === 'billActionsModal') {
        const { bill, actions } = data;
        const supplierName = appState.suppliers.find(s => s.id === (appState.expenses.find(e => e.id === bill.expenseId)?.supplierId))?.supplierName || '';
        const modalBody = `<div class="actions-modal-header"><h4>${bill.description}</h4>${supplierName ? `<span>${supplierName}</span>` : ''}<strong>${fmtIDR(bill.amount)}</strong></div><div class="actions-modal-list">${actions.map(action => `<button class="actions-menu-item" data-action="${action.action}" data-id="${action.id}" data-type="${action.type}" data-expense-id="${action.expenseId || ''}"><span class="material-symbols-outlined">${action.icon}</span><span>${action.label}</span></button>`).join('')}</div>`;
        const modalFooter = `<button class="btn btn-secondary" data-close-modal>Tutup</button>`;
        return `<div class="modal-content"><div class="modal-body">${modalBody}</div><div class="modal-footer">${modalFooter}</div></div>`;
    }
    return `<div>Konten tidak ditemukan</div>`;
}