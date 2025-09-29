import { appState } from '../core/state.js';
import { $, $$, fmtIDR, _getJSDate, _animateTabSwitch, _formatNumberInput, generateUUID, parseLocaleNumber, _compressImage } from '../utils/helpers.js';
import { fetchAndCacheData, loadAllLocalDataToState } from '../core/data.js';
import { db, expensesCol, billsCol, suppliersCol, workersCol, staffCol, projectsCol, commentsCol, TEAM_ID, stockTransactionsCol } from '../config/firebase.js';
import { _setActiveListeners, syncToServer } from '../core/sync.js';
import { createModal, closeModal } from '../ui/modals.js';
import { toast } from '../ui/toast.js';
import { localDB } from '../db/dexie.js';
import { getDoc, doc, getDocs, collection, query, orderBy, where, writeBatch, runTransaction, increment, serverTimestamp, Timestamp, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { _initSelectionMode, _attachSwipeHandlers, _initCustomSelects } from '../ui/interactions.js';
import { _getEmptyStateHTML } from '../utils/helpers.js';
import { isViewer } from '../utils/helpers.js';
import { _logActivity, optimisticUpdateDoc } from '../core/firestore.js';
import { setBreadcrumb } from '../ui/navigation.js';
import { _uploadFileToCloudinary } from '../core/cloudinary.js';
import { upsertCommentInUI } from './comments.js';

export function renderTagihanPage() {
    renderTagihanPageLayout();
    return _renderTagihanContent();
}

function renderTagihanPageLayout() {
    const container = $('.page-container');
    appState.selectionMode = { active: false, selectedIds: new Set(), pageContext: 'tagihan' };
    _renderSelectionBar();

    container.innerHTML = `
        <div class="toolbar sticky-toolbar" id="tagihan-toolbar">
            <div class="search"><span class="material-symbols-outlined">search</span><input type="search" id="tagihan-search-input" placeholder="Cari tagihan..." value="${appState.billsFilter.searchTerm}"></div>
            <button class="btn-icon" id="tagihan-filter-btn" title="Filter"><span class="material-symbols-outlined">filter_list</span></button>
            <button class="btn-icon" id="tagihan-sort-btn" title="Urutkan"><span class="material-symbols-outlined">sort</span></button>
        </div>
        <div id="main-tabs-container" class="sub-nav two-tabs">
            <button class="sub-nav-item active" data-tab="unpaid">Belum Lunas</button>
            <button class="sub-nav-item" data-tab="paid">Lunas</button>
        </div>
        <div id="category-sub-nav-container" class="category-sub-nav"></div>
        <div id="sub-page-content"></div>
    `;
    _setActiveListeners(['bills', 'expenses', 'comments']);
    _initTagihanInteractiveListeners();
}

async function _renderTagihanContent() {
    const tabId = $('#main-tabs-container .sub-nav-item.active')?.dataset.tab || 'unpaid';
    const contentContainer = $("#sub-page-content");
    if (contentContainer) contentContainer.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';

    appState.expenses = await localDB.expenses.where('isDeleted').notEqual(1).toArray();
    const billsFromCache = await localDB.bills.where('status').equals(tabId).toArray();

    const billedExpenseIds = new Set(billsFromCache.map(b => b.expenseId).filter(Boolean));

    let deliveryOrders = [];
    if (tabId === 'unpaid') {
        const doFromCache = appState.expenses.filter(e =>
            e.status === 'delivery_order' && !billedExpenseIds.has(e.id)
        );
        deliveryOrders = doFromCache.map(d => ({
            id: `expense-${d.id}`, expenseId: d.id, description: d.description, amount: 0,
            dueDate: d.date, status: 'delivery_order', type: d.type,
            projectId: d.projectId, paidAmount: 0
        }));
    }

    appState.tagihan.fullList = [...deliveryOrders, ...billsFromCache];

    const counts = appState.tagihan.fullList.reduce((acc, b) => { acc[b.type] = (acc[b.type] || 0) + 1; return acc; }, {});
    counts.all = appState.tagihan.fullList.length;

    const categories = [{ id: 'all', label: 'Semua' }, { id: 'material', label: 'Material' }, { id: 'operasional', label: 'Operasional' }, { id: 'gaji', label: 'Gaji' }, { id: 'fee', label: 'Fee' }, { id: 'lainnya', label: 'Lainnya' }];
    const categoryNavContainer = $('#category-sub-nav-container');
    if (categoryNavContainer) {
        categoryNavContainer.innerHTML = categories
            .filter(cat => counts[cat.id] > 0)
            .map(cat => `<button class="sub-nav-item ${appState.billsFilter.category === cat.id ? 'active' : ''}" data-category="${cat.id}">${cat.label}</button>`)
            .join('');
    }

    _renderFilteredAndPaginatedBills();
}

async function _renderFilteredAndPaginatedBills(loadMore = false) {
    const PAGE_SIZE = 20;
    const contentContainer = $("#sub-page-content");
    const pagination = appState.pagination.bills;

    if (pagination.isLoading || (loadMore && !pagination.hasMore)) return;

    pagination.isLoading = true;

    if (!loadMore) {
        contentContainer.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';
        appState.tagihan.currentList = [];
    } else {
        const loader = document.createElement('div');
        loader.className = 'loader-container';
        loader.id = 'load-more-spinner';
        loader.innerHTML = '<div class="spinner"></div>';
        contentContainer.appendChild(loader);
    }

    try {
        const uniqueMap = new Map();
        (appState.tagihan.fullList || []).forEach(item => {
            const uniqueKey = item.id || `expense-${item.expenseId}`;
            if (!uniqueMap.has(uniqueKey)) {
                uniqueMap.set(uniqueKey, item);
            }
        });
        let filteredBills = Array.from(uniqueMap.values());

        const { searchTerm, projectId, supplierId, category, sortBy, sortDirection } = appState.billsFilter;

        if (category !== 'all') filteredBills = filteredBills.filter(item => item.type === category);
        if (projectId !== 'all') filteredBills = filteredBills.filter(item => item.projectId === projectId);

        const allExpenses = await localDB.expenses.where('isDeleted').notEqual(1).toArray();
        if (supplierId !== 'all') {
            filteredBills = filteredBills.filter(item => {
                const expense = allExpenses.find(e => e.id === item.expenseId);
                return expense && expense.supplierId === supplierId;
            });
        }
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filteredBills = filteredBills.filter(item => (item.description || '').toLowerCase().includes(term));
        }

        filteredBills.sort((a, b) => {
            const valA = (sortBy === 'amount') ? a.amount : _getJSDate(a.dueDate).getTime();
            const valB = (sortBy === 'amount') ? b.amount : _getJSDate(b.dueDate).getTime();
            return sortDirection === 'asc' ? valA - valB : valB - valA;
        });

        const offset = loadMore ? appState.tagihan.currentList.length : 0;
        const pageOfBills = filteredBills.slice(offset, offset + PAGE_SIZE);

        const allSuppliers = await localDB.suppliers.toArray();
        const allWorkers = await localDB.workers.toArray();
        const newHtml = _getBillsListHTML(pageOfBills, allExpenses, allSuppliers, allWorkers);

        if (loadMore) {
            const spinner = $('#load-more-spinner');
            if (spinner) spinner.remove();
            contentContainer.querySelector('.dense-list-container').insertAdjacentHTML('beforeend', newHtml);
        } else {
            contentContainer.innerHTML = `<div class="dense-list-container">${newHtml}</div>`;
        }

        if (loadMore) {
             appState.tagihan.currentList.push(...pageOfBills);
        } else {
             appState.tagihan.currentList = pageOfBills;
        }

        pagination.hasMore = pageOfBills.length === PAGE_SIZE;

        if (!loadMore && pageOfBills.length === 0) {
            contentContainer.innerHTML = _getEmptyStateHTML({ title: 'Tidak Ada Tagihan', desc: 'Tidak ada tagihan yang cocok dengan filter Anda.' });
        }

    } catch (error) {
        console.error("Gagal memuat tagihan secara bertahap:", error);
        contentContainer.innerHTML = _getEmptyStateHTML({ icon: 'error', title: 'Gagal Memuat Data' });
    } finally {
        pagination.isLoading = false;
        const spinner = $('#load-more-spinner');
        if (spinner) spinner.remove();
    }
}

function _initTagihanInteractiveListeners() {
    _initSelectionMode('#sub-page-content', 'tagihan');
    _attachSwipeHandlers('#sub-page-content');
}

export function _initTagihanPageListeners() {
    document.body.addEventListener('input', (e) => {
        if (e.target.id === 'tagihan-search-input') {
            appState.billsFilter.searchTerm = e.target.value;
            _renderFilteredAndPaginatedBills();
        }
    });

    document.body.addEventListener('click', (e) => {
        const filterSortBtn = e.target.closest('#tagihan-filter-btn, #tagihan-sort-btn');
        if (filterSortBtn) {
            if (filterSortBtn.id === 'tagihan-filter-btn') {
                _showBillsFilterModal(_renderFilteredAndPaginatedBills);
            } else if (filterSortBtn.id === 'tagihan-sort-btn') {
                _showBillsSortModal(_renderFilteredAndPaginatedBills);
            }
            return;
        }

        const tabBtn = e.target.closest('.sub-nav-item');
        if (tabBtn && e.target.closest('#main-tabs-container, #category-sub-nav-container')) {
            if (tabBtn.classList.contains('active')) return;

            const tabContainer = e.target.closest('#main-tabs-container, #category-sub-nav-container');
            const isMainTab = tabContainer.id === 'main-tabs-container';
            const allTabs = $$('.sub-nav-item', tabContainer);
            const currentActive = $('.sub-nav-item.active', tabContainer);
            const currentIndex = Array.from(allTabs).indexOf(currentActive);
            const newIndex = Array.from(allTabs).indexOf(tabBtn);
            const direction = newIndex > currentIndex ? 'forward' : 'backward';

            if (currentActive) currentActive.classList.remove('active');
            tabBtn.classList.add('active');

            if (isMainTab) {
                appState.billsFilter.category = 'all';
                _animateTabSwitch($("#sub-page-content"), _renderTagihanContent, direction);
            } else {
                appState.billsFilter.category = tabBtn.dataset.category;
                _animateTabSwitch($("#sub-page-content"), _renderFilteredAndPaginatedBills, direction);
            }
        }
    });
}

export async function handleOpenBillDetail(billId, expenseId) {
  let bill = null;
  if (billId) bill = appState.bills.find(b => b.id === billId);
  let payments = [];
  try {
      if (bill && navigator.onLine) {
          const paymentsColRef = collection(db, 'teams', TEAM_ID, 'bills', billId, 'payments');
          const paymentsSnap = await getDocs(query(paymentsColRef, orderBy("date", "desc")));
          payments = paymentsSnap.docs.map(d => ({
              id: d.id,
              ...d.data()
          }));
      }
  } catch (err) {
      console.warn('Gagal memuat riwayat pembayaran, menampilkan detail tanpa histori.', err);
      payments = [];
  }
  if (bill) {
      try {
          const queued = await localDB.pending_payments.where('billId').equals(bill.id).toArray();
          if (queued && queued.length > 0) {
              const mapped = queued.map(p => ({
                  amount: p.amount,
                  date: p.date || new Date(),
                  workerId: p.workerId,
                  workerName: p.workerName,
                  isOfflineQueued: true,
                  attachmentPending: !!p.localAttachmentId
              }));
              payments = [...mapped, ...payments];
          }
      } catch (e) {
          console.warn('Gagal memuat antrean pembayaran offline untuk preview:', e);
      }
  }
  let targetExpenseId = expenseId || bill?.expenseId;
  if (!targetExpenseId && bill?.type !== 'gaji') {
      toast('error', 'Data pengeluaran terkait tidak ditemukan.');
      return;
  }
  let content, title, fullContent;
  if (bill && bill.type === 'gaji') {
      toast('syncing', 'Memuat rincian absensi...');
      await fetchAndCacheData('attendanceRecords', attendanceRecordsCol, 'date');
      hideToast();

      content = _createSalaryBillDetailContentHTML(bill, payments);
      title = `Detail Tagihan: ${bill.description}`;
      fullContent = content;
  } else {
      let expenseData = null;
      if (navigator.onLine) {
          const expenseDoc = await getDoc(doc(expensesCol, targetExpenseId));
          if (!expenseDoc.exists()) {
              toast('error', 'Data pengeluaran terkait tidak ditemukan.');
              return;
          }
          expenseData = {
              id: expenseDoc.id,
              ...expenseDoc.data()
          };
      } else {
          expenseData = appState.expenses.find(e => e.id === targetExpenseId);
          if (!expenseData) {
              toast('error', 'Detail pengeluaran tidak tersedia offline.');
              return;
          }
      }
      content = await _createBillDetailContentHTML(bill, expenseData, payments);
      title = `Detail Pengeluaran: ${expenseData.description}`;

      let footerHTML = '';
      if (expenseData.status === 'delivery_order' && !isViewer()) {
          footerHTML = `
              <div class="modal-footer">
                  <button class="btn btn-primary" data-action="edit-surat-jalan" data-id="${expenseData.id}">
                      <span class="material-symbols-outlined">edit_note</span> Input Harga & Buat Tagihan
                  </button>
              </div>`;
      }
      fullContent = content + footerHTML;
  }
  const tabId = appState.activeSubPage.get('tagihan');
  const tabLabel = (tabId === 'unpaid'?'Belum Lunas' : (tabId === 'paid'?'Lunas' : ''));
  const baseParts = ['Tagihan', tabLabel];
  if (appState.billsFilter.projectId !== 'all') {
      const pj = appState.projects.find(p => p.id === appState.billsFilter.projectId);
      if (pj) baseParts.push(pj.projectName);
  } else if (appState.billsFilter.supplierId !== 'all') {
      const sp = appState.suppliers.find(s => s.id === appState.billsFilter.supplierId);
      if (sp) baseParts.push(sp.supplierName);
  }
  setBreadcrumb([...baseParts, 'Detail']);
  createModal('dataDetail', {
      title,
      content: fullContent,
      onClose: () => setBreadcrumb(baseParts)
  });
}

function _createAttachmentManagerHTML(expenseData) {
  if (!expenseData) return '';

  const createItemHTML = (url, field, title) => {
      const hasFile = url && url.startsWith('http');
      if (hasFile) {
          return `
          <div class="attachment-manager-item">
              <img src="${url}" alt="${title}" class="attachment-preview-thumb">
              <strong>${title}</strong>
              <div class="attachment-manager-actions">
                  <button class="btn btn-sm btn-secondary" data-action="view-attachment" data-src="${url}">Lihat</button>
                  ${isViewer()?'' : `<button class="btn btn-sm" data-action="upload-attachment" data-id="${expenseData.id}" data-field="${field}">Ganti</button>`}
                  <button class="btn-icon" data-action="download-attachment" data-url="${url}" data-filename="${title.replace(/\s+/g,'_')}.jpg" title="Unduh"><span class="material-symbols-outlined">download</span></button>
                  ${isViewer()?'' : `<button class="btn-icon btn-icon-danger" data-action="delete-attachment" data-id="${expenseData.id}" data-field="${field}" title="Hapus"><span class="material-symbols-outlined">delete</span></button>`}
              </div>
          </div>`;
      } else if (!isViewer()) {
          return `
          <div class="attachment-manager-item placeholder">
              <div class="placeholder-icon"><span class="material-symbols-outlined">add_photo_alternate</span></div>
              <strong>${title}</strong>
              <span>Belum ada file</span>
              <button class="btn btn-sm btn-primary" data-action="upload-attachment" data-id="${expenseData.id}" data-field="${field}">Upload</button>
          </div>`;
      }
      return '';
  };
  let managerHTML = '';
  if (expenseData.type === 'material') {
      managerHTML = createItemHTML(expenseData.invoiceUrl, 'invoiceUrl', 'Bukti Faktur') + createItemHTML(expenseData.deliveryOrderUrl, 'deliveryOrderUrl', 'Surat Jalan');
  } else {
      managerHTML = createItemHTML(expenseData.attachmentUrl, 'attachmentUrl', 'Lampiran');
  }
  if (managerHTML) {
      return `
          <h5 class="detail-section-title">Lampiran</h5>
          <div class="attachment-manager-container">${managerHTML}</div>`;
  }
  return '';
}

function _createSalaryBillDetailContentHTML(bill, payments) {
    const remainingAmount = (bill.amount || 0) - (bill.paidAmount || 0);
    const paymentHistoryHTML = _createPaymentHistoryHTML(payments);
    let detailsHTML = '';

    if (bill.workerDetails && bill.workerDetails.length > 0) {
        const workerListHTML = bill.workerDetails.map(worker => {
            const paidByWorker = (payments || [])
                .filter(p => p.workerId === worker.id)
                .reduce((sum, p) => sum + (p.amount || 0), 0);

            const totalForWorker = worker.amount || 0;
            const remainingForWorker = Math.max(0, totalForWorker - paidByWorker);
            const isFullyPaid = remainingForWorker <= 0;

            let actionButtons = '';
            if (!isViewer() && bill.status === 'unpaid') {
                actionButtons = `
                    <div class="individual-payment-actions">
                        <button class="btn-icon btn-icon-danger"
                                data-action="remove-worker-from-recap"
                                data-bill-id="${bill.id}"
                                data-worker-id="${worker.id || worker.workerId}"
                                title="Keluarkan ${worker.name} dari Rekap">
                            <span class="material-symbols-outlined">person_remove</span>
                        </button>
                        ${!isFullyPaid ? `
                        <button class="btn-icon btn-icon-success"
                                data-action="pay-individual-salary"
                                data-bill-id="${bill.id}"
                                data-worker-id="${worker.id || worker.workerId}"
                                title="Bayar/Cicil Gaji ${worker.name}">
                            <span class="material-symbols-outlined">payment</span>
                        </button>` : ''}
                    </div>
                `;
            }

            return `
                <div class="detail-list-item">
                    <div class="item-main">
                        <span class="item-date">${worker.name}</span>
                        <small class="text-muted" style="display:block;">Terbayar: ${fmtIDR(paidByWorker)}</small>
                        ${isFullyPaid ? `<span class="item-status paid">Lunas</span>` : `<span class="item-status unpaid">Sisa: ${fmtIDR(remainingForWorker)}</span>`}
                    </div>
                    <div class="item-secondary">
                        <strong class="item-amount">${fmtIDR(totalForWorker)}</strong>
                        ${actionButtons}
                    </div>
                </div>
            `;
        }).join('');
        detailsHTML = `<h5 class="detail-section-title">Rincian Gaji per Pekerja</h5><div class="detail-list-container">${workerListHTML}</div>`;
    } else {
    const recordIds = bill.recordIds || [];
      const relatedRecords = recordIds.map(id => appState.attendanceRecords.find(rec => rec.id === id)).filter(Boolean);
      if (relatedRecords.length > 0) {
          const recordDetailsHTML = relatedRecords.map(rec => {
              const project = appState.projects.find(p => p.id === rec.projectId);
              const date = _getJSDate(rec?.date).toLocaleDateString('id-ID', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric'
              });
              return `<div><dt>${date} - ${project?.projectName || 'N/A'}</dt><dd>${fmtIDR(rec.totalPay || 0)}</dd></div>`;
          }).join('');
          detailsHTML = `<h5 class="detail-section-title">Rincian Absensi Terkait</h5><dl class="detail-list">${recordDetailsHTML}</dl>`;
      }
  }
  return `
      <div class="payment-summary">
          <div><span>Total Tagihan Gaji:</span><strong>${fmtIDR(bill.amount)}</strong></div>
          <div><span>Sudah Dibayar:</span><strong>${fmtIDR(bill.paidAmount || 0)}</strong></div>
          <div class="remaining"><span>Sisa Tagihan:</span><strong>${fmtIDR(remainingAmount)}</strong></div>
      </div>
      ${paymentHistoryHTML}
      ${detailsHTML}
  `;
}

async function _createBillDetailContentHTML(bill, expenseData, payments) {
  const remainingAmount = bill?(bill.amount || 0) - (bill.paidAmount || 0) : 0;
  let itemsButtonHTML = '';
  if (expenseData.type === 'material' && expenseData.items && expenseData.items.length > 0) {
      itemsButtonHTML = `
          <div class="rekap-actions" style="grid-template-columns: 1fr; margin-top: 1rem;">
              <button class="btn btn-secondary" data-action="view-invoice-items" data-id="${expenseData.id}">
                  <span class="material-symbols-outlined">list_alt</span>
                  Lihat Rincian Faktur
              </button>
          </div>
      `;
  }
  const project = appState.projects.find(p => p.id === expenseData.projectId);
  const projectDetailsHTML = project?`
      <dl class="detail-list" style="margin-top: 1.5rem;">
          <div class="category-title"><dt>Detail Proyek</dt><dd></dd></div>
          <div><dt>Nama Proyek</dt><dd>${project.projectName}</dd></div>
          ${project.budget > 0?`<div><dt>Anggaran</dt><dd>${fmtIDR(project.budget)}</dd></div>` : ''}
      </dl>
  ` : '';
  const paymentHistoryHTML = _createPaymentHistoryHTML(payments);
  const attachmentsHTML = _createAttachmentManagerHTML(expenseData);
  const commentsHTML = _createCommentsSectionHTML(expenseData.id, 'expense');
  return `
      <div class="payment-summary">
          <div><span>Total Pengeluaran:</span><strong>${fmtIDR(expenseData.amount)}</strong></div>
          ${bill?`
          <div><span>Sudah Dibayar:</span><strong>${fmtIDR(bill.paidAmount || 0)}</strong></div>
          <div class="remaining"><span>Sisa Tagihan:</span><strong>${fmtIDR(remainingAmount)}</strong></div>
          ` : `<div class="status"><span>Status:</span><strong style="color:var(--success)">Lunas</strong></div>`}
      </div>
      ${paymentHistoryHTML}
       ${projectDetailsHTML}
      ${itemsButtonHTML}
      ${attachmentsHTML}
      ${commentsHTML}
  `;
}
function _createCommentsSectionHTML(parentId, parentType) {
  try {
      const items = (appState.comments || [])
          .filter(c => c.parentId === parentId && c.parentType === parentType && !c.isDeleted)
          .sort((a, b) => _getJSDate(a.createdAt) - _getJSDate(b.createdAt));
  const listHTML = items.length > 0 ? items.map(c => {
          const when = _getJSDate(c.createdAt).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
          const canDelete = !!appState.currentUser && (appState.currentUser.uid === c.userId || appState.userRole === 'Owner');
          const safeText = String(c.content || '').replace(/</g, '&lt;').replace(/\n/g, '<br>');
          const me = appState.currentUser && appState.currentUser.uid === c.userId;
          return `<div class="comment-item ${me?'is-current-user':''}" data-id="${c.id}">
              <div class="comment-meta">
                  <strong>${c.userName || 'Pengguna'}</strong>
                  <span class="comment-date">${when}</span>
                  ${canDelete?`<button class="btn-icon btn-icon-danger" data-action="delete-comment" data-id="${c.id}" title="Hapus"><span class="material-symbols-outlined">delete</span></button>`:''}
              </div>
              <div class="comment-text">${safeText}</div>
          </div>`;
      }).join('') : '<p class="empty-state-small">Belum ada komentar.</p>';
      const disabled = (appState.userRole === 'Viewer') || !appState.currentUser || appState.userStatus !== 'active';
      return `
          <div class="comments-section" data-parent-id="${parentId}" data-parent-type="${parentType}">
              <h5 class="detail-section-title">Komentar</h5>
              <div class="comments-list">${listHTML}</div>
              <div class="comment-input-row">
                  <textarea rows="1" placeholder="Tulis komentar..." ${disabled?'disabled':''}
                    oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'; this.nextElementSibling.disabled = (this.value.trim().length===0);"></textarea>
                  <button class="btn btn-primary" data-action="post-comment" data-parent-id="${parentId}" data-parent-type="${parentType}" ${disabled?'disabled':''} disabled>Kirim</button>
              </div>
          </div>`;
  } catch (e) {
      console.warn('Render komentar gagal', e);
      return '';
  }
}

export async function handleDeleteAttachment(dataset) {
  const {
      id,
      field
  } = dataset;

  createModal('confirmDeleteAttachment', {
      onConfirm: async () => {
          toast('syncing', 'Menghapus lampiran...');
          try {
              await optimisticUpdateDoc(expensesCol, id, {
                  [field]: ''
              });
              _logActivity(`Menghapus Lampiran`, {
                  expenseId: id,
                  field
              });

              toast('success', 'Lampiran berhasil dihapus.');
              closeModal($('#dataDetail-modal'));
              handleOpenBillDetail(null, id);
          } catch (error) {
              toast('error', 'Gagal menghapus lampiran.');
              console.error("Attachment deletion error:", error);
          }
      }
  });
}
export async function handleUploadAttachment(dataset) {
  const {
      id,
      field
  } = dataset;
  const content = `
      <p class="confirm-modal-text">Pilih sumber gambar untuk lampiran.</p>
      <input type="file" name="modalUploadCamera" accept="image/*" capture="environment" class="hidden-file-input">
      <input type="file" name="modalUploadGallery" accept="image/*" class="hidden-file-input">
              <div class="upload-buttons modal-upload-buttons">
          <button type="button" class="btn btn-secondary" data-action="trigger-file-input" data-target="modalUploadCamera">
              <span class="material-symbols-outlined">photo_camera</span> Kamera
          </button>
          <button type="button" class="btn btn-secondary" data-action="trigger-file-input" data-target="modalUploadGallery">
              <span class="material-symbols-outlined">image</span> Galeri
          </button>
      </div>
  `;
  const modal = createModal('dataDetail', {
      title: 'Pilih Sumber Gambar',
      content
  });
  if (modal) {
      modal.id = 'upload-source-modal';
      modal.querySelectorAll('.hidden-file-input').forEach(input => {
          input.addEventListener('change', (e) => {
              const file = e.target.files[0];
              if (file) {
                  closeModal(modal);
                  _processAndUploadFile(file, id, field);
              }
          }, {
              once: true
          });
      });
  }
}
async function _processAndUploadFile(file, expenseId, field) {
  if (!file || !expenseId || !field) return;
  const downloadURL = await _uploadFileToCloudinary(file);
  if (downloadURL) {
      try {
          await optimisticUpdateDoc(expensesCol, expenseId, {
              [field]: downloadURL
          });
          toast('success', 'Lampiran berhasil diperbarui!');
          handleOpenBillDetail(null, expenseId);
          closeModal($('#upload-source-modal'));
          toast('success', 'Lampiran berhasil diperbarui!');
      } catch (error) {
          toast('error', 'Gagal menyimpan lampiran.');
          console.error("Attachment update error:", error);
      }
  }
}
export async function _downloadAttachment(url, filename) {
  try {
      const res = await fetch(url, {
          mode: 'cors'
      });
      const blob = await res.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename || 'attachment';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  } catch (e) {
      console.error('Download attachment failed:', e);
      window.open(url, '_blank');
  }
}
export function handlePayBillModal(billId) {
  const bill = appState.bills.find(i => i.id === billId);
  if (!bill) {
      toast('error', 'Data tagihan tidak ditemukan.');
      return;
  }

  const remainingAmount = (bill.amount || 0) - (bill.paidAmount || 0);

  const content = `
              <form id="payment-form" data-id="${billId}" data-type="bill" data-async="true" method="POST" data-endpoint="/api/payments/bill" data-success-msg="Pembayaran tercatat">
                 <div class="payment-summary">
                     <div><span>Total Tagihan:</span><strong>${fmtIDR(bill.amount)}</strong></div>
                     <div><span>Sudah Dibayar:</span><strong>${fmtIDR(bill.paidAmount || 0)}</strong></div>
                     <div class="remaining"><span>Sisa Tagihan:</span><strong>${fmtIDR(remainingAmount)}</strong></div>
                 </div>
                 <div class="form-group">
                     <label>Jumlah Pembayaran</label>
                     <input type="text" name="amount" inputmode="numeric" required placeholder="Masukkan jumlah pembayaran" value="${new Intl.NumberFormat('id-ID').format(remainingAmount)}">
                 </div>
                 <div class="form-group">
                     <label>Tanggal Pembayaran</label>
                     <input type="date" name="date" value="${new Date().toISOString().slice(0,10)}" required>
                 </div>
                 <button type="submit" class="btn btn-primary">Bayar</button>
             </form>
         `;
  createModal('payment', {
      title: 'Form Pembayaran Tagihan',
      content,
      paymentType: 'bill'
  });
}

function _createPaymentHistoryHTML(payments) {
    if (!payments || payments.length === 0) {
        return '';
    }

    const historyItems = payments.map(p => {
        const paymentDate = p.date ? _getJSDate(p.date).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        }) : 'Tanggal tidak valid';

        const offlineBadge = p.isOfflineQueued ? `<span class="status-badge warn" style="margin-left:.5rem;">Offline</span>` : '';
        const recipientName = p.workerName || 'Pembayaran Umum';

        const attachInfo = p.attachmentUrl ?
            ` <a href="${p.attachmentUrl}" target="_blank" class="link-muted" style="margin-left:.5rem;">Lihat</a>` :
            (p.attachmentPending ? ` <span class="text-muted" style="margin-left:.5rem;">Lampiran menunggu sinkron</span>` : '');

        return `
            <div class="payment-history-item">
                <div class="payment-details">
                    <span class="payment-date">${paymentDate}${offlineBadge}</span>
                    <span class="payment-recipient">${recipientName}</span>
                </div>
                <strong class="payment-amount">${fmtIDR(p.amount)}${attachInfo}</strong>
            </div>`;
    }).join('');

    return `
        <h5 class="detail-section-title">Riwayat Pembayaran</h5>
        <div class="detail-list custom-payment-history">
            ${historyItems}
        </div>
    `;
}

async function _showBillsFilterModal(onApply) {
    const activeTab = $('#main-tabs-container .sub-nav-item.active')?.dataset.tab || 'unpaid';
    const currentBillList = await localDB.bills.where('status').equals(activeTab).toArray();
    const allExpenses = await localDB.expenses.where('isDeleted').notEqual(1).toArray();

    const allSuppliers = await localDB.suppliers.toArray();

    const relevantSupplierIds = new Set();
    currentBillList.forEach(bill => {
        const expense = allExpenses.find(e => e.id === bill.expenseId);
        if (expense && expense.supplierId) {
            relevantSupplierIds.add(expense.supplierId);
        }
    });

    const projectOptions = [{ value: 'all', text: 'Semua Proyek' }, ...appState.projects.map(p => ({ value: p.id, text: p.projectName }))];

    const supplierOptions = [{ value: 'all', text: 'Semua Supplier' },
        ...allSuppliers
            .filter(s => relevantSupplierIds.has(s.id))
            .map(s => ({ value: s.id, text: s.supplierName }))
    ];

    const content = `
        <form id="bills-filter-form">
            ${createMasterDataSelect('filter-project-id', 'Filter Berdasarkan Proyek', projectOptions, appState.billsFilter.projectId)}
            ${createMasterDataSelect('filter-supplier-id', 'Filter Berdasarkan Supplier', supplierOptions, appState.billsFilter.supplierId)}
            <div class="filter-modal-footer">
                <button type="button" id="reset-filter-btn" class="btn btn-secondary">Reset</button>
                <button type="submit" class="btn btn-primary">Terapkan</button>
            </div>
        </form>
    `;
    createModal('dataDetail', { title: 'Filter Tagihan', content });
    _initCustomSelects($('#dataDetail-modal'));

    $('#bills-filter-form').addEventListener('submit', (e) => {
        e.preventDefault();
        appState.billsFilter.projectId = $('#filter-project-id').value;
        appState.billsFilter.supplierId = $('#filter-supplier-id').value;
        onApply();
        closeModal($('#dataDetail-modal'));
    });

    $('#reset-filter-btn').addEventListener('click', () => {
        appState.billsFilter.projectId = 'all';
        appState.billsFilter.supplierId = 'all';
        onApply();
        closeModal($('#dataDetail-modal'));
    });
}

function _showBillsSortModal(onApply) {
  const {
      sortBy,
      sortDirection
  } = appState.billsFilter;
  const content = `
          <form id="bills-sort-form">
              <div class="sort-options">
                  <div class="sort-option">
                      <input type="radio" id="sort-due-date" name="sortBy" value="dueDate" ${sortBy === 'dueDate'?'checked' : ''}>
                      <label for="sort-due-date">Tanggal Jatuh Tempo</label>
                  </div>
                  <div class="sort-option">
                      <input type="radio" id="sort-amount" name="sortBy" value="amount" ${sortBy === 'amount'?'checked' : ''}>
                      <label for="sort-amount">Jumlah Tagihan</label>
                  </div>
              </div>
              <div class="form-group" style="margin-top: 1rem;">
                  <label>Arah Pengurutan</label>
                  <div class="sort-direction">
                      <button type="button" data-dir="desc" class="${sortDirection === 'desc'?'active' : ''}">Terbaru/Tertinggi</button>
                      <button type="button" data-dir="asc" class="${sortDirection === 'asc'?'active' : ''}">Terlama/Terendah</button>
                  </div>
              </div>
              <div class="filter-modal-footer" style="grid-template-columns: 1fr;">
                   <button type="submit" class="btn btn-primary">Terapkan</button>
              </div>
          </form>
      `;

  createModal('dataDetail', {
      title: 'Urutkan Tagihan',
      content
  });

  const form = $('#bills-sort-form');
  form.querySelectorAll('.sort-direction button').forEach(btn => {
      btn.addEventListener('click', () => {
          form.querySelectorAll('.sort-direction button').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
      });
  });

  form.addEventListener('submit', (e) => {
      e.preventDefault();
      appState.billsFilter.sortBy = form.querySelector('input[name="sortBy"]:checked').value;
      appState.billsFilter.sortDirection = form.querySelector('.sort-direction button.active').dataset.dir;
      onApply();
      closeModal($('#dataDetail-modal'));
  });
}

function _getBillsListHTML(items) {
    if (!items || items.length === 0) {
        return '';
    }

    return items.map(item => {
        if (!item) return '';

        let title = item.description;
        let subtitle;
        const isTouch = (('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0);

        if (item.type === 'gaji') {
            const date = item.dueDate ? _getJSDate(item.dueDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long' }) : 'N/A';
            if (item.workerDetails && item.workerDetails.length > 1) {
                subtitle = `Upah untuk ${item.workerDetails.length} pekerja`;
            } else if (item.workerDetails && item.workerDetails.length === 1) {
                 subtitle = `Upah a.n. ${item.workerDetails[0].name}`;
            } else {
                subtitle = "Tagihan Gaji Karyawan";
            }
            subtitle += ` - ${date}`;
        } else {
            let supplierName = '';
            const expense = appState.expenses.find(e => e.id === item.expenseId);
            if (expense && expense.supplierId) {
                supplierName = appState.suppliers.find(s => s.id === expense.supplierId)?.supplierName || '';
            }
            const date = item.dueDate ? _getJSDate(item.dueDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : 'N/A';
            subtitle = supplierName ? `${supplierName} - Jatuh Tempo: ${date}` : `Jatuh Tempo: ${date}`;
        }

        const remainingAmount = (item.amount || 0) - (item.paidAmount || 0);
        const isFullyPaid = remainingAmount <= 0 && item.status !== 'delivery_order';

        let statusHTML = '';
        if (item.status === 'delivery_order') {
            statusHTML = `<span class="status-badge info">Surat Jalan</span>`;
        } else if (isFullyPaid) {
            statusHTML = `<span class="status-badge positive">Lunas</span>`;
        } else if (item.paidAmount > 0) {
            statusHTML = `<span class="status-badge warn">Sisa ${fmtIDR(remainingAmount)}</span>`;
        } else {
            statusHTML = `<span class="status-badge negative">Belum Dibayar</span>`;
        }

        let swipeActionsHTML = '';
        if (!isViewer()) {
            if (!isFullyPaid && item.status !== 'delivery_order') {
                swipeActionsHTML += `<button class="btn-icon btn-icon-success" data-action="pay-bill" title="Bayar"><span class="material-symbols-outlined">payment</span></button>`;
            }
            if (item.status === 'delivery_order') {
                 swipeActionsHTML += `<button class="btn-icon" data-action="edit-surat-jalan" data-id="${item.expenseId}" title="Input Harga"><span class="material-symbols-outlined">edit_note</span></button>`;
            } else {
                 swipeActionsHTML += `<button class="btn-icon" data-action="edit-item" data-id="${item.id}" data-type="bill" title="Edit"><span class="material-symbols-outlined">edit</span></button>`;
            }
            swipeActionsHTML += `<button class="btn-icon btn-icon-danger" data-action="delete-item" data-id="${item.id}" data-type="bill" title="Hapus"><span class="material-symbols-outlined">delete</span></button>`;
        }

return `
        <div class="dense-list-item" data-id="${item.id || item.localId}" data-expense-id="${item.expenseId || ''}">
            <div class="selection-checkmark"><span class="material-symbols-outlined">check_circle</span></div>

            <div class="swipe-actions">${swipeActionsHTML}</div>
            <div class="item-main-content" data-action="open-bill-detail">                <strong class="item-title">${title}</strong>
                <span class="item-subtitle">${subtitle}</span>
                <div class="item-details">
                    <strong class="item-amount">${item.status === 'delivery_order'?'Tanpa Harga' : fmtIDR(item.amount)}</strong>
                    ${statusHTML}
                </div>
            </div>

            ${!isTouch && !isViewer() ? `<div class="item-actions"><button class="btn-icon" data-action="open-bill-actions-modal"><span class="material-symbols-outlined">more_vert</span></button></div>` : ''}
        </div>`;
    }).join('');
}

export async function handleEditSuratJalanModal(expenseId) {
  const expense = appState.expenses.find(e => e.id === expenseId);
  if (!expense) return toast('error', 'Data surat jalan tidak ditemukan.');

  const content = _getEditFormFakturMaterialHTML(expense, true);
  const modalEl = createModal('editItem', {
      title: `Input Harga: ${expense.description}`,
      content
  });

  if (modalEl) {
      _initAutocomplete(modalEl);
      $$('#invoice-items-container input[inputmode="numeric"]', modalEl).forEach(inp => inp.addEventListener('input', _formatNumberInput));
      $('#add-invoice-item-btn', modalEl).addEventListener('click', () => _addInvoiceItemRow(modalEl));
      $('#invoice-items-container', modalEl).addEventListener('input', (e) => _handleInvoiceItemChange(e, modalEl));
      $$('.remove-item-btn', modalEl).forEach(btn => btn.addEventListener('click', (e) => {
          e.target.closest('.invoice-item-row').remove();
          _updateInvoiceTotal(modalEl);
      }));

      $('#edit-item-form', modalEl).addEventListener('submit', (e) => {
          e.preventDefault();
          handleUpdateSuratJalan(e.target);
      });
  }
}

export async function handleUpdateSuratJalan(form) {
  const expenseId = form.dataset.id;
  const status = form.querySelector('input[name="status"]').value || 'unpaid';

  const items = [];
  $$('.invoice-item-row', form).forEach(row => {
      const materialId = row.querySelector('input[name="materialId"]').value;
      const price = parseFormattedNumber(row.querySelector('input[name="itemPrice"]').value);
      const qty = parseLocaleNumber(row.querySelector('input[name="itemQty"]').value);
      if (materialId && qty > 0 && price > 0) {
          items.push({
              materialId,
              price,
              qty,
              total: price * qty
          });
      }
  });

  if (items.length === 0) {
      return toast('error', 'Harap isi harga untuk minimal satu barang.');
  }

  const newAmount = items.reduce((sum, item) => sum + item.total, 0);

  toast('syncing', 'Menyimpan faktur...');
  try {
      await runTransaction(db, async (transaction) => {
          const expenseRef = doc(expensesCol, expenseId);
          const billRef = doc(billsCol, generateUUID());

          const expenseSnap = await transaction.get(expenseRef);
          const curRev = expenseSnap.exists()?(expenseSnap.data().rev || 0) : 0;
          transaction.update(expenseRef, {
            amount: newAmount,
            items: items,
            status: status,
            rev: curRev + 1,
            updatedAt: serverTimestamp()
        });

          transaction.set(billRef, {
              expenseId: expenseId,
              description: form.elements.description.value,
              amount: newAmount,
              dueDate: new Date(form.elements.date.value),
              status: status,
              type: 'material',
              projectId: form.elements['project-id'].value,
              createdAt: serverTimestamp(),
              rev: 1,
              paidAmount: status === 'paid'?newAmount : 0,
              ...(status === 'paid' && {
                  paidAt: serverTimestamp()
              })
          });

          for (const item of items) {
              const q = query(stockTransactionsCol, where("expenseId", "==", expenseId), where("materialId", "==", item.materialId));
              const transSnap = await getDocs(q);
              if (!transSnap.empty) {
                  const transRef = transSnap.docs[0].ref;
                  transaction.update(transRef, {
                      pricePerUnit: item.price
                  });
              }
          }
      });

      _logActivity('Menyelesaikan Surat Jalan', {
          docId: expenseId,
          newAmount
      });
      toast('success', 'Faktur berhasil disimpan dan tagihan telah dibuat!');
      closeModal($('#editItem-modal'));
      renderTagihanPage();
  } catch (error) {
      toast('error', 'Gagal memperbarui data.');
      console.error("Error updating delivery order:", error);
  }
}
export async function handleEditDeliveryOrderItemsModal(expenseId) {
  const expense = appState.expenses.find(e => e.id === expenseId);
  if (!expense) return toast('error', 'Data surat jalan tidak ditemukan.');
  const content = _getEditFormSuratJalanItemsHTML(expense);
  const modalEl = createModal('editItem', {
      title: `Edit Item: ${expense.description}`,
      content
  });
  if (modalEl) {
      _initAutocomplete(modalEl);
      $('#add-invoice-item-btn', modalEl).addEventListener('click', () => _addInvoiceItemRow(modalEl));
      $('#invoice-items-container', modalEl).addEventListener('input', (e) => _handleInvoiceItemChange(e, modalEl));
      $$('.remove-item-btn', modalEl).forEach(btn => btn.addEventListener('click', (e) => {
          e.target.closest('.invoice-item-row').remove();
      }));

      $('#edit-item-form', modalEl).addEventListener('submit', (e) => {
          e.preventDefault();
          handleUpdateDeliveryOrderItems(e.target);
      });
  }
}

function _getEditFormSuratJalanItemsHTML(item) {
  const itemsHTML = (item.items || []).map((subItem, index) => {
      const material = appState.materials.find(m => m.id === subItem.materialId);
      const materialName = material?`${material.materialName}` : '';
      return `
              <div class="invoice-item-row" data-index="${index}">
                  <div class="autocomplete-wrapper item-name-wrapper">
                      <input type="text" name="itemName" placeholder="Ketik nama material..." class="autocomplete-input item-name" value="${materialName}" required autocomplete="off" ${subItem.materialId?'readonly' : ''}>
                      <input type="hidden" name="materialId" class="autocomplete-id" value="${subItem.materialId || ''}">
                      <button type="button" class="autocomplete-clear-btn" style="display: ${subItem.materialId?'flex' : 'none'};" title="Hapus Pilihan">
                          <span class="material-symbols-outlined">close</span>
                      </button>
                      <div class="autocomplete-suggestions"></div>
                  </div>
                  <div class="item-details">
                      <input type="text" inputmode="decimal" pattern="[0-9]+([\\.,][0-9]+)?" name="itemQty" placeholder="Qty" class="item-qty" value="${subItem.qty}" required>
                      <span class="item-unit" style="margin-left: 0.25rem;">${material?.unit || ''}</span>
                      <button type="button" class="btn-icon add-master-btn" data-action="add-new-material" title="Tambah Master Material"><span class="material-symbols-outlined">add</span></button>
                  </div>
                  <button type="button" class="btn-icon btn-icon-danger remove-item-btn"><span class="material-symbols-outlined">delete</span></button>
              </div>
          `;
  }).join('');
  return `
          <form id="edit-item-form" data-id="${item.id}" data-type="delivery_order_items">
              <h5 class="invoice-section-title">Rincian Barang (Tanpa Harga)</h5>
              <div id="invoice-items-container">${itemsHTML}</div>
              <div class="add-item-action">
                  <button type="button" id="add-invoice-item-btn" class="btn-icon" title="Tambah Barang"><span class="material-symbols-outlined">add_circle</span></button>
              </div>
              <button type="submit" class="btn btn-primary" style="margin-top: 1.5rem;">Simpan Perubahan Item</button>
          </form>
      `;
}
export async function handleUpdateDeliveryOrderItems(form) {
  const expenseId = form.dataset.id;
  toast('syncing', 'Memperbarui item surat jalan...');
  try {
      const oldExpenseSnap = await getDoc(doc(expensesCol, expenseId));
      if (!oldExpenseSnap.exists()) throw new Error('Surat jalan asli tidak ditemukan');
      const oldItems = oldExpenseSnap.data().items || [];
      const newItems = [];
      $$('.invoice-item-row', form).forEach(row => {
          const materialId = row.querySelector('input[name="materialId"]').value;
          const qty = parseLocaleNumber(row.querySelector('input[name="itemQty"]').value);
          if (materialId && qty > 0) newItems.push({
              materialId,
              qty,
              price: 0,
              total: 0
          });
      });
      if (newItems.length === 0) {
          toast('error', 'Surat jalan harus memiliki minimal satu item.');
          return;
      }
      await runTransaction(db, async (transaction) => {
          const stockAdjustments = new Map();
          oldItems.forEach(item => {
              stockAdjustments.set(item.materialId, (stockAdjustments.get(item.materialId) || 0) - item.qty);
          });
          newItems.forEach(item => {
              stockAdjustments.set(item.materialId, (stockAdjustments.get(item.materialId) || 0) + item.qty);
          });

          for (const [materialId, qtyChange] of stockAdjustments.entries()) {
              if (qtyChange !== 0) {
                  const materialRef = doc(materialsCol, materialId);
                  transaction.update(materialRef, {
                      currentStock: increment(-qtyChange)
                  });
              }
          }

          const q = query(stockTransactionsCol, where("expenseId", "==", expenseId));
          const oldTransSnap = await getDocs(q);
          oldTransSnap.forEach(doc => transaction.delete(doc.ref));
          newItems.forEach(item => {
              const newTransRef = doc(collection(db, 'teams', TEAM_ID, 'stock_transactions'));
              transaction.set(newTransRef, {
                  materialId: item.materialId,
                  quantity: item.qty,
                  date: oldExpenseSnap.data().date,
                  type: 'out',
                  expenseId: expenseId,
                  projectId: oldExpenseSnap.data().projectId,
                  createdAt: serverTimestamp()
              });
          });

          transaction.update(doc(expensesCol, expenseId), {
              items: newItems
          });
      });
      _logActivity('Mengedit Item Surat Jalan', {
          docId: expenseId
      });
      toast('success', 'Item surat jalan berhasil diperbarui!');
      closeModal($('#editItem-modal'));
      renderTagihanPage();
  } catch (error) {
      toast('error', 'Gagal memperbarui item.');
      console.error(error);
  }
}

export async function handleProcessBillPayment(form) {
  const billId = form.dataset.id;
  const amountToPay = parseFormattedNumber(form.elements.amount.value);
  const date = new Date(form.elements.date.value);

  if (amountToPay <= 0) {
      toast('error', 'Jumlah pembayaran harus lebih dari nol.');
      return;
  }
  if (!navigator.onLine) {
      try {
          const local = await localDB.bills.where('id').equals(billId).first();
          const appBill = appState.bills.find(b => b.id === billId);
          const baseAmount = local?.amount ?? appBill?.amount ?? 0;
          const currentPaid = local?.paidAmount ?? appBill?.paidAmount ?? 0;
          const newPaidAmount = currentPaid + amountToPay;
          const isPaid = newPaidAmount >= baseAmount;
          if (local) {
              await localDB.bills.update(local.localId, {
                  paidAmount: newPaidAmount,
                  status: isPaid?'paid' : 'unpaid',
                  ...(isPaid?{
                      paidAt: date
                  } : {}),
                  needsSync: 1
              });
          } else if (appBill) {
              await localDB.bills.add({
                  id: billId,
                  expenseId: appBill.expenseId || null,
                  amount: baseAmount,
                  dueDate: appBill.dueDate || new Date(),
                  status: isPaid?'paid' : 'unpaid',
                  type: appBill.type,
                  projectId: appBill.projectId || null,
                  paidAmount: newPaidAmount,
                  ...(isPaid?{
                      paidAt: date
                  } : {}),
                  needsSync: 1
              });
          }
          let localAttachmentId = null;
          const file = form.elements.paymentAttachment?.files?.[0];
          if (file) {
              const compressed = await _compressImage(file, 0.85, 1280);
              const blob = compressed || file;
              localAttachmentId = `payment-${billId}-${Date.now()}`;
              await localDB.files.put({
                  id: localAttachmentId,
                  file: blob,
                  addedAt: new Date(),
                  size: blob.size || 0
              });
          }
          await localDB.pending_payments.add({
              billId,
              amount: amountToPay,
              date,
              localAttachmentId,
              createdAt: new Date()
          });
          _logActivity(`Membayar Tagihan Cicilan (Offline)`, {
              billId,
              amount: amountToPay
          });
      toast('info', 'Info: Offline. Data disimpan di perangkat & akan disinkronkan nanti.');
          await loadAllLocalDataToState();
          if (appState.activePage === 'tagihan') renderTagihanPage();
          return;
      } catch (e) {
          toast('error', 'Gagal menyimpan pembayaran offline.');
          console.error(e);
          return;
      }
  }
  toast('syncing', 'Memproses pembayaran...');
  try {
      const billRef = doc(billsCol, billId);
      let attachmentUrl = null;
      const file = form.elements.paymentAttachment?.files?.[0];
      if (file) {
          attachmentUrl = await _uploadFileToCloudinary(file);
      }
      await runTransaction(db, async (transaction) => {
          const billSnap = await transaction.get(billRef);
          if (!billSnap.exists()) throw new Error("Tagihan tidak ditemukan");
          const billData = billSnap.data();
          const newPaidAmount = (billData.paidAmount || 0) + amountToPay;
          const isPaid = newPaidAmount >= billData.amount;

          transaction.update(billRef, {
              paidAmount: increment(amountToPay),
              status: isPaid?'paid' : 'unpaid',
              rev: (billData.rev || 0) + 1,
              ...(isPaid && {
                  paidAt: serverTimestamp()
              })
          });
          if (isPaid && billData.expenseId) {
              const expenseRef = doc(expensesCol, billData.expenseId);
              const expSnap = await transaction.get(expenseRef);
              const expRev = expSnap.exists()?(expSnap.data().rev || 0) : 0;
              transaction.update(expenseRef, {
                  status: 'paid',
                  rev: expRev + 1,
                  updatedAt: serverTimestamp()
              });
          }
          if (isPaid && billData.type === 'gaji') {
            const recordIds = billData.recordIds || [];
            if (recordIds.length > 0) {
                recordIds.forEach(recId => {
                    const attendanceRef = doc(attendanceRecordsCol, recId);
                    transaction.update(attendanceRef, { isPaid: true });
                });
            }
        }
          const paymentRef = doc(collection(billRef, 'payments'));
          const paymentData = {
              amount: amountToPay,
              date,
              createdAt: serverTimestamp()
          };
          if (attachmentUrl) paymentData.attachmentUrl = attachmentUrl;
          transaction.set(paymentRef, paymentData);
      });
      _logActivity(`Membayar Tagihan Cicilan`, {
          billId,
          amount: amountToPay
      });

      toast('success', 'Pembayaran berhasil dicatat.');
      if (appState.activePage === 'tagihan') renderTagihanPage();
  } catch (error) {
      toast('error', `Gagal memproses pembayaran.`);
      console.error('Bill Payment error:', error);
  }
}

export async function handlePayIndividualSalaryModal(dataset) {
    const {
        billId,
        workerId
    } = dataset;
    const bill = appState.bills.find(b => b.id === billId);
    const workerDetail = bill?.workerDetails.find(w => w.id === workerId);
    if (!workerDetail) {
        toast('error', 'Data pekerja tidak ditemukan.');
        return;
    }
    let paidByWorker = 0;
    try {
        if (navigator.onLine) {
            const paymentsColRef = collection(db, 'teams', TEAM_ID, 'bills', billId, 'payments');
            const paymentsSnap = await getDocs(query(paymentsColRef, orderBy("date", "desc")));
            paidByWorker += paymentsSnap.docs
                .map(d => d.data())
                .filter(p => p.workerId === workerId)
                .reduce((sum, p) => sum + (p.amount || 0), 0);
        }
        const queued = await localDB.pending_payments.where('billId').equals(billId).toArray();
        paidByWorker += (queued || []).filter(p => p.workerId === workerId).reduce((s, p) => s + (p.amount || 0), 0);
    } catch (e) {
        console.warn('Gagal menghitung pembayaran sebelumnya untuk pekerja:', e);
    }
    const totalForWorker = workerDetail.amount || 0;
    const remaining = Math.max(0, totalForWorker - paidByWorker);
    const content = `
        <form id="payment-form" data-type="individual-salary" data-bill-id="${billId}" data-worker-id="${workerId}" data-async="true" method="POST" data-endpoint="/api/payments/salary" data-success-msg="Pembayaran gaji tercatat">
            <div class="payment-summary">
                <div><span>Total Gaji:</span><strong>${fmtIDR(totalForWorker)}</strong></div>
                <div><span>Sudah Dibayar:</span><strong>${fmtIDR(paidByWorker)}</strong></div>
                <div class="remaining"><span>Sisa:</span><strong>${fmtIDR(remaining)}</strong></div>
            </div>
            <div class="form-group">
                <label>Jumlah Pembayaran</label>
                <input type="text" name="amount" inputmode="numeric" required placeholder="Masukkan jumlah" value="${new Intl.NumberFormat('id-ID').format(remaining || totalForWorker)}">
            </div>
            <div class="form-group">
                <label>Tanggal Pembayaran</label>
                <input type="date" name="date" value="${new Date().toISOString().slice(0,10)}" required>
            </div>
            <div class="form-group">
                <label>Lampiran (Opsional)</label>
                <input type="file" name="paymentAttachment" accept="image/*" capture="environment">
                <small class="text-muted">Anda dapat menambahkan bukti transfer/foto struk.</small>
            </div>
            <button type="submit" class="btn btn-primary">Bayar</button>
        </form>
    `;
    createModal('payment', {
        title: `Bayar/Cicil: ${workerDetail.name}`,
        content,
        paymentType: 'individual-salary'
    });
}