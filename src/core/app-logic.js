import { appState } from './state.js';
import { $, $$ } from '../utils/helpers.js';
import { handleNavigation, renderPageContent } from '../ui/navigation.js';
import { createModal, closeModal } from '../ui/modals.js';
import { toast } from '../ui/toast.js';
import { toggleTheme } from '../ui/theme.js';
import { signInWithGoogle } from './auth.js';
import { syncToServer, updateSyncIndicator } from './sync.js';
import { _submitFormAsync, _fallbackLocalFormHandler } from './forms.js';
import { masterDataConfig } from '../config/masterData.js';

// Feature-specific imports
import { handleManageMasterData, handleEditMasterItem, handleDeleteMasterItem, handleAddNewMaterialModal } from '../features/masterData.js';
import { handleOpenBillDetail, handlePayBillModal, handleCetakKwitansi, handleCetakKwitansiIndividu, handlePayIndividualSalaryModal, handleEditSuratJalanModal, handleEditDeliveryOrderItemsModal, handleUploadAttachment, handleDeleteAttachment, _downloadAttachment } from '../features/tagihan.js';
import { handleViewJurnalHarianModal, handleViewWorkerRecapModal, handleGenerateBulkSalaryBill, handleFixStuckAttendanceModal, handleRemoveWorkerFromRecap, handleDeleteSalaryBill } from '../features/jurnal.js';
import { handleCheckIn, handleCheckOut, handleEditManualAttendanceModal, handleDeleteSingleAttendance } from '../features/absensi.js';
import { handleStokInModal, handleStokOutModal, handleEditStockTransaction, handleDeleteStockTransaction } from '../features/stok.js';
import { handleEditItem, handleDeleteItem } from '../features/common.js';
import { handlePaymentModal, _createDetailContentHTML as createPemasukanDetailHTML } from '../features/pemasukan.js';
import { handleManageUsers, handleUserAction, handleEditPdfSettings } from '../features/pengaturan.js';
import { handleOpenSyncQueueModal, handleDeletePendingItem, resolveConflict, handleOpenStorageStats, handleOpenConflictsPanel } from './offline.js';
import { _createSimulasiPDF } from '../features/simulasi.js';
import { handlePostComment, handleDeleteComment } from '../features/comments.js';


export function attachEventListeners() {
    document.body.addEventListener('click', (e) => {
        const target = e.target.closest('[data-action]');

        if (appState.selectionMode.active) {
            const card = e.target.closest('.dense-list-item');
            const closeBtn = e.target.closest('#close-selection-btn');

            if (card && !e.target.closest('.swipe-actions')) {
                _toggleCardSelection(card);
            } else if (closeBtn) {
                appState.selectionMode.active = false;
                appState.selectionMode.selectedIds.clear();
                _renderSelectionBar();
                $$('.dense-list-item.selected').forEach(c => c.classList.remove('selected'));
            }
            return;
        }

        if (!target) return;
        const { action, id, type, nav, expenseId, date, workerId } = target.dataset;
        const actions = {
            'navigate': () => {
                const isQuick = !!target.closest('.dashboard-action-item, .dashboard-balance-card');
                handleNavigation(nav, { source: isQuick ? 'quick' : undefined });
            },
            'open-bill-detail': () => handleOpenBillDetail(target.closest('[data-id]')?.dataset.id, target.closest('[data-expense-id]')?.dataset.expenseId),
            'auth-action': () => appState.currentUser ? createModal('confirmLogout') : signInWithGoogle(),
            'toggle-theme': () => toggleTheme(),
            'manage-master': () => handleManageMasterData(type),
            'manage-master-global': () => {
                const globalTypes = ['suppliers', 'workers', 'professions', 'materials', 'op-cats', 'other-cats', 'creditors'];
                const content = globalTypes.map(t => {
                    const config = masterDataConfig[t];
                    return `<div class="settings-list-item" data-action="manage-master" data-type="${t}"><div class="icon-wrapper"><span class="material-symbols-outlined">${config.icon || 'database'}</span></div><span class="label">${config.title}</span></div>`;
                }).join('');
                createModal('dataDetail', {
                    title: 'Kelola Master Data',
                    content: `<div class="settings-list">${content}</div>`
                });
            },
            'open-sync-queue': handleOpenSyncQueueModal,
            'sync-all-pending': () => syncToServer(),
            'sync-item': () => syncToServer(),
            'delete-pending-item': () => handleDeletePendingItem(target.dataset),
            'manage-users': handleManageUsers,
            'user-action': () => handleUserAction(target.dataset),
            'edit-pdf-settings': handleEditPdfSettings,
            'recalculate-usage': () => { /* Will be implemented */ },
            'open-conflicts': handleOpenConflictsPanel,
            'open-storage-stats': handleOpenStorageStats,
            'apply-conflict': () => resolveConflict(target.dataset.conflictId, true),
            'discard-conflict': () => resolveConflict(target.dataset.conflictId, false),
            'edit-master-item': () => {
                const itemEl = target.closest('.master-data-item');
                handleEditMasterItem(itemEl?.dataset.id || id, itemEl?.dataset.type || type);
            },
            'delete-master-item': () => {
                const itemEl = target.closest('.master-data-item');
                handleDeleteMasterItem(itemEl?.dataset.id || id, itemEl?.dataset.type || type);
            },
            'open-detail': () => {
                if (appState.activePage === 'pemasukan') {
                    const card = target.closest('.card-list-item');
                    const tid = card?.dataset.id || id;
                    const ttype = card?.dataset.type || type;
                    if (!tid) return;
                    const item = ttype === 'termin'
                        ? appState.incomes.find(i => i.id === tid)
                        : appState.fundingSources.find(i => i.id === tid);
                    if (item) createModal('dataDetail', {
                        title: (ttype === 'pinjaman') ? 'Kartu Data Pinjaman' : 'Detail Pemasukan',
                        content: createPemasukanDetailHTML(item, ttype || 'termin')
                    });
                }
            },
            'open-actions': () => {
                let actionsList = [];
                if (appState.activePage === 'pemasukan') {
                    actionsList.push({ label: 'Edit', action: 'edit-item', icon: 'edit', id, type });
                    if (type === 'pinjaman' && appState.fundingSources.find(i => i.id === id)?.status !== 'paid') {
                        actionsList.push({ label: 'Bayar Cicilan', action: 'pay-loan', icon: 'payment', id, type });
                    }
                    actionsList.push({ label: 'Hapus', action: 'delete-item', icon: 'delete', id, type });
                }
                createModal('actionsMenu', { actions: actionsList, targetRect: target.getBoundingClientRect() });
            },
            'edit-item': () => handleEditItem(id, type),
            'delete-item': () => handleDeleteItem(id, type),
            'pay-loan': () => handlePaymentModal(id, 'pinjaman'),
            'pay-bill': () => handlePayBillModal(target.closest('.dense-list-item').dataset.id),
            'view-invoice-items': () => {
                const expense = appState.expenses.find(e => e.id === id);
                if (expense) createModal('invoiceItemsDetail', { items: expense.items, totalAmount: expense.amount });
            },
            'edit-surat-jalan': () => handleEditSuratJalanModal(id),
            'edit-do-items': () => handleEditDeliveryOrderItemsModal(expenseId),
            'view-attachment': () => createModal('imageView', { src: target.dataset.src }),
            'upload-attachment': () => handleUploadAttachment(target.dataset),
            'delete-attachment': () => handleDeleteAttachment(target.dataset),
            'download-attachment': () => _downloadAttachment(target.dataset.url, target.dataset.filename),
            'post-comment': () => handlePostComment(target.dataset),
            'delete-comment': () => handleDeleteComment(target.dataset),
            'check-in': () => handleCheckIn(id),
            'check-out': () => handleCheckOut(id),
            'edit-attendance': () => handleEditManualAttendanceModal(id),
            'delete-attendance': () => handleDeleteSingleAttendance(id),
            'view-jurnal-harian': () => handleViewJurnalHarianModal(date),
            'view-worker-recap': () => handleViewWorkerRecapModal(workerId),
            'generate-all-salary-bill': () => {
                const startDate = new Date($('#recap-start-date').value);
                const endDate = new Date($('#recap-end-date').value);
                const rows = $$('#salary-recap-table tbody tr');
                const allWorkersData = Array.from(rows).map(row => ({
                    workerId: row.dataset.workerId,
                    workerName: row.dataset.workerName,
                    totalPay: parseFloat(row.dataset.totalPay),
                    recordIds: row.dataset.recordIds.split(',')
                }));
                handleGenerateBulkSalaryBill(allWorkersData, startDate, endDate);
            },
            'generate-selected-salary-bill': () => {
                const startDate = new Date($('#recap-start-date').value);
                const endDate = new Date($('#recap-end-date').value);
                const rows = $$('#salary-recap-table tbody tr');
                const selectedWorkers = Array.from(rows)
                    .filter(row => row.querySelector('.recap-checkbox:checked'))
                    .map(row => ({
                        workerId: row.dataset.workerId,
                        workerName: row.dataset.workerName,
                        totalPay: parseFloat(row.dataset.totalPay),
                        recordIds: row.dataset.recordIds.split(',')
                    }));
                handleGenerateBulkSalaryBill(selectedWorkers, startDate, endDate);
            },
            'fix-stuck-attendance': handleFixStuckAttendanceModal,
            'cetak-kwitansi': () => handleCetakKwitansi(id),
            'cetak-kwitansi-individu': () => handleCetakKwitansiIndividu(target.dataset),
            'pay-individual-salary': () => handlePayIndividualSalaryModal(target.dataset),
            'stok-in': () => handleStokInModal(id),
            'stok-out': () => handleStokOutModal(id),
            'edit-stock': () => handleEditStockTransaction(target.dataset),
            'delete-stock': () => handleDeleteStockTransaction(target.dataset),
            'add-new-material': () => {
                const wrapper = target.closest('.invoice-item-row')?.querySelector('.autocomplete-wrapper');
                if (wrapper) handleAddNewMaterialModal(wrapper);
            },
            'toggle-more-actions': () => $('#quick-actions-grid').classList.toggle('actions-collapsed'),
            'force-full-sync': () => {
                createModal('confirmUserAction', {
                    message: 'Aksi ini akan mengunduh ulang semua data dari server. Lanjutkan?',
                    onConfirm: async () => {
                        localStorage.removeItem('lastSyncTimestamp');
                        await syncToServer();
                    }
                })
            },
            'open-recap-actions': () => {
                const billId = target.dataset.id;
                const actions = [
                    { label: 'Lihat Detail', action: 'open-bill-detail', icon: 'visibility', id: billId, type: 'bill' },
                    { label: 'Batalkan Rekap', action: 'delete-salary-bill', icon: 'delete_forever', id: billId }
                ];
                createModal('actionsMenu', { actions, targetRect: target.getBoundingClientRect() });
            },
            'remove-worker-from-recap': () => handleRemoveWorkerFromRecap(target.dataset.billId, target.dataset.workerId),
            'delete-salary-bill': () => {
                handleDeleteSalaryBill(target.dataset.id);
                closeModal($('#actionsMenu-modal'));
            },
            'open-bill-actions-modal': () => {
                const bill = appState.bills.find(b => b.id === id);
                if (!bill) return;
                let billActions = [];
                if (bill.status !== 'paid') {
                    billActions.push({ label: 'Bayar/Cicil Tagihan', action: 'pay-bill', icon: 'payment', id, expenseId });
                }
                billActions.push({ label: 'Lihat Detail', action: 'open-bill-detail', icon: 'visibility', id, expenseId });
                billActions.push({ label: 'Edit Data', action: 'edit-item', icon: 'edit', id, type: 'bill' });
                if (bill.status === 'paid') {
                    billActions.push({ label: 'Cetak Kwitansi', action: 'cetak-kwitansi', icon: 'receipt_long', id });
                }
                billActions.push({ label: 'Hapus', action: 'delete-item', icon: 'delete', id, type: 'bill' });
                createModal('billActionsModal', { bill, actions: billActions });
            },
            'trigger-file-input': () => {
                const targetInputName = target.dataset.target;
                const context = target.closest('.modal-bg') || document;
                const inputEl = context.querySelector(`input[name="${targetInputName}"]`);
                if (inputEl) {
                    inputEl.click();
                    inputEl.addEventListener('change', () => {
                        const displayEl = context.querySelector(`#${inputEl.dataset.targetDisplay}`);
                        if (displayEl) displayEl.textContent = inputEl.files[0]?.name || 'Belum ada file dipilih';
                    }, { once: true });
                }
            },
        };
        if (actions[action]) {
            actions[action]();
        }
    });

    document.addEventListener('submit', async (e) => {
        const form = e.target;
        if (!(form instanceof HTMLFormElement) || !form.matches('form[data-async]')) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        try {
            const loadingBtn = form.querySelector('[type="submit"], .btn, .btn-primary');
            if (loadingBtn) loadingBtn.disabled = true;
            try {
                await _submitFormAsync(form);
            } catch (networkErr) {
                await _fallbackLocalFormHandler(form);
            }
            toast('success', form.dataset.successMsg || 'Berhasil disimpan.');
            const modal = form.closest('.modal-bg');
            if (modal) closeModal(modal);
            renderPageContent();
            updateSyncIndicator();
        } catch (err) {
            toast('error', 'Gagal menyimpan, coba lagi.');
        } finally {
            const loadingBtn = form.querySelector('[type="submit"], .btn, .btn-primary');
            if (loadingBtn) loadingBtn.disabled = false;
        }
    }, true);
}