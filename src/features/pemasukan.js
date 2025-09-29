import { appState } from '../core/state.js';
import { $, $$, fmtIDR, parseFormattedNumber, _getJSDate, _animateTabSwitch, _formatNumberInput, generateUUID } from '../utils/helpers.js';
import { fetchAndCacheData } from '../core/data.js'; // To be created
import { incomesCol, fundingSourcesCol, projectsCol, fundingCreditorsCol, staffCol, commentsCol } from '../config/firebase.js';
import { _setActiveListeners, syncToServer } from '../core/sync.js';
import { createModal } from '../ui/modals.js';
import { toast } from '../ui/toast.js';
import { localDB } from '../db/dexie.js';
import { serverTimestamp, onSnapshot } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

// Placeholders for functions to be imported
const _initSelectionMode = () => {};
const _attachSwipeHandlers = () => {};
const _getEmptyStateHTML = () => {};
const isViewer = () => appState.userRole === 'Viewer';
const _logActivity = () => {};
const _clearFormDraft = () => {};
const _attachFormDraftPersistence = () => {};
const createMasterDataSelect = () => {};
const _initCustomSelects = () => {};


export async function renderPemasukanPage() {
    const container = $('.page-container');
    const tabs = [{ id: 'termin', label: 'Termin Proyek' }, { id: 'pinjaman', label: 'Pinjaman & Pendanaan' }];
    container.innerHTML = `
        <div class="sub-nav two-tabs">
            ${tabs.map((tab, index) => `<button class="sub-nav-item ${index === 0 ? 'active' : ''}" data-tab="${tab.id}">${tab.label}</button>`).join('')}
        </div>
        <div id="sub-page-content"></div>
    `;

    const renderTabContent = async (tabId) => {
        appState.activeSubPage.set('pemasukan', tabId);
        const contentContainer = $("#sub-page-content");
        contentContainer.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';

        let formHTML = '';
        let listHTML = '<div id="pemasukan-list-container"></div>';
        if (tabId === 'termin') {
            await fetchAndCacheData('projects', projectsCol, 'projectName');
            formHTML = _getFormPemasukanHTML('termin');
        } else if (tabId === 'pinjaman') {
            await fetchAndCacheData('fundingCreditors', fundingCreditorsCol, 'creditorName');
            formHTML = _getFormPemasukanHTML('pinjaman');
        }

        contentContainer.innerHTML = (isViewer() ? '' : formHTML) + listHTML;
        if (!isViewer()) {
            const formEl = $('#pemasukan-form');
            if (formEl) {
                formEl.setAttribute('data-draft-key', `pemasukan-${tabId}`);
                _attachFormDraftPersistence(formEl);
            }
            _attachPemasukanFormListeners();
        }
        await _rerenderPemasukanList(tabId);

        _initSelectionMode('#pemasukan-list-container', 'pemasukan');
        _attachSwipeHandlers('#pemasukan-list-container');

        _setActiveListeners(['incomes', 'funding_sources']);
    };

    try {
        onSnapshot(commentsCol, async (snapshot) => {
            if (snapshot.empty) return;
            const changes = snapshot.docChanges();
            if (!changes || changes.length === 0) return;
            for (const change of changes) {
                const data = { ...change.doc.data(), id: change.doc.id };
                try {
                    if (change.type === 'removed') {
                        await localDB.comments.where('id').equals(data.id).modify({ isDeleted: 1 });
                    } else {
                        await localDB.comments.put(data);
                    }
                } catch (_) {}
                const idx = (appState.comments || []).findIndex(c => c.id === data.id);
                if (change.type === 'removed') {
                    if (idx >= 0) appState.comments.splice(idx, 1);
                } else {
                    if (idx >= 0) appState.comments[idx] = data; else appState.comments.push(data);
                }
                const modal = document.querySelector('.modal-bg.show #dataDetail-modal, .modal-bg#dataDetail-modal.show, #dataDetail-modal');
                const section = document.querySelector(`.comments-section[data-parent-id="${data.parentId}"][data-parent-type="${data.parentType}"]`);
                if (section) upsertCommentInUI(section, data, change.type);
            }
        }, (err) => console.warn('Snapshot error for comments:', err));
    } catch(_) {}

    const subNavItems = $$('.sub-nav-item');
    subNavItems.forEach((btn, index) => {
        btn.addEventListener('click', (e) => {
            const currentActive = $('.sub-nav-item.active');
            if (currentActive === btn) return;

            const currentIndex = Array.from(subNavItems).indexOf(currentActive);
            const direction = index > currentIndex ? 'forward' : 'backward';

            if(currentActive) currentActive.classList.remove('active');
            btn.classList.add('active');

            _animateTabSwitch(
                $("#sub-page-content"),
                () => renderTabContent(btn.dataset.tab),
                direction
            );
        });
    });

    const lastSubPage = appState.activeSubPage.get('pemasukan') || tabs[0].id;
    $(`.sub-nav-item[data-tab="${lastSubPage}"]`)?.classList.add('active');
    await renderTabContent(lastSubPage);
}

async function _rerenderPemasukanList(type) {
  const listContainer = $('#pemasukan-list-container');
  if (!listContainer) return;
  listContainer.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';
  const col = type === 'termin'?incomesCol : fundingSourcesCol;
  const key = type === 'termin'?'incomes' : 'fundingSources';
  await fetchAndCacheData(key, col);

  listContainer.innerHTML = _getListPemasukanHTML(type);
  _attachSwipeHandlers('#pemasukan-list-container');
}

function _getFormPemasukanHTML(type) {
  let formHTML = '';
  if (type === 'termin') {
      const projectOptions = appState.projects
          .filter(p => p.projectType === 'main_income')
          .map(p => ({
              value: p.id,
              text: p.projectName
          }));
      formHTML = `
              <div class="card card-pad">
                  <form id="pemasukan-form" data-type="termin" data-async="true" method="POST" data-endpoint="/api/incomes" data-success-msg="Pemasukan tersimpan">
                      ${createMasterDataSelect('pemasukan-proyek', 'Proyek Terkait', projectOptions, '', 'projects')}
                      <div class="form-group">
                          <label>Jumlah Termin Diterima</label>
                          <input type="text" inputmode="numeric" id="pemasukan-jumlah" required placeholder="mis. 50.000.000">
                      </div>
                      <div class="form-group">
                          <label>Tanggal</label>
                          <input type="date" id="pemasukan-tanggal" value="${new Date().toISOString().slice(0,10)}" required>
                      </div>
                      <div id="fee-allocation-container" style="margin-top: 1.5rem;"></div>
                      <button type="submit" class="btn btn-primary">Simpan Pemasukan</button>
                  </form>
              </div>
          `;
  } else if (type === 'pinjaman') {
      const creditorOptions = appState.fundingCreditors.map(c => ({
          value: c.id,
          text: c.creditorName
      }));
      const loanTypeOptions = [{
          value: 'none',
          text: 'Tanpa Bunga'
      }, {
          value: 'interest',
          text: 'Berbunga'
      }];
      formHTML = `
              <div class="card card-pad">
                  <form id="pemasukan-form" data-type="pinjaman" data-async="true" method="POST" data-endpoint="/api/loans" data-success-msg="Pinjaman tersimpan">
                      <div class="form-group">
                          <label>Jumlah</label>
                          <input type="text" inputmode="numeric" id="pemasukan-jumlah" required placeholder="mis. 5.000.000">
                      </div>
                      <div class="form-group">
                          <label>Tanggal</label>
                          <input type="date" id="pemasukan-tanggal" value="${new Date().toISOString().slice(0,10)}" required>
                      </div>
                      ${createMasterDataSelect('pemasukan-kreditur', 'Kreditur', creditorOptions, '', 'creditors')}
                      ${createMasterDataSelect('loan-interest-type', 'Jenis Pinjaman', loanTypeOptions, 'none')}
                      <div class="loan-details hidden">
                          <div class="form-group">
                              <label>Suku Bunga (% per bulan)</label>
                              <input type="number" id="loan-rate" placeholder="mis. 10" step="0.01" min="1">
                          </div>
                          <div class="form-group">
                              <label>Tenor (bulan)</label>
                              <input type="number" id="loan-tenor" placeholder="mis. 3" min="1">
                          </div>
                          <div id="loan-calculation-result" class="loan-calculation-result"></div>
                      </div>
                      <button type="submit" class="btn btn-primary">Simpan</button>
                  </form>
              </div>
          `;
  }
  return formHTML;
}

function _getListPemasukanHTML(type) {
    const list = type === 'termin' ? appState.incomes : appState.fundingSources;
    if (!list || list.length === 0) {
        return _getEmptyStateHTML({
            icon: 'account_balance_wallet',
            title: 'Belum Ada Pemasukan',
            desc: 'Catat pemasukan atau pinjaman untuk mulai melacak arus kas.',
        });
    }

    return `<div id="pemasukan-list-container" class="dense-list-container" style="margin-top: 1rem;">
        ${list.map(item => {
            const isTermin = type === 'termin';
            const title = isTermin
                ? (appState.projects.find(p => p.id === item.projectId)?.projectName || 'Termin Proyek')
                : (appState.fundingCreditors.find(c => c.id === item.creditorId)?.creditorName || 'Pinjaman');

            const amount = item.totalAmount || item.amount || 0;
            const date = item.date ? _getJSDate(item.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long' }) : 'Tanggal tidak valid';
            const isPaid = item.status === 'paid';

            let swipeActions = '';
            if (!isPaid && !isTermin) {
                swipeActions += `<button class="btn-icon btn-icon-success" data-action="pay-loan" data-id="${item.id}" data-type="pinjaman" title="Bayar"><span class="material-symbols-outlined">payment</span></button>`;
            }
            swipeActions += `<button class="btn-icon" data-action="edit-item" data-id="${item.id}" data-type="${type}" title="Edit"><span class="material-symbols-outlined">edit</span></button>`;
            swipeActions += `<button class="btn-icon btn-icon-danger" data-action="delete-item" data-id="${item.id}" data-type="${type}" title="Hapus"><span class="material-symbols-outlined">delete</span></button>`;

            let statusInfo = '';
            if (!isTermin) {
                const paidAmount = item.paidAmount || 0;
                const remainingAmount = (item.totalRepaymentAmount || amount) - paidAmount;
                statusInfo = isPaid
                    ? `<span class="status-badge positive">Lunas</span>`
                    : `<span class="status-badge warn">Sisa: ${fmtIDR(remainingAmount)}</span>`;
            }

            return `
            <div class="dense-list-item card" data-id="${item.id}">
                <div class="selection-checkmark"><span class="material-symbols-outlined">check_circle</span></div>
                <div class="swipe-actions">${swipeActions}</div>
                <div class="item-main-content" data-action="open-detail" data-id="${item.id}" data-type="${type}">
                    <strong class="item-title">${title}</strong>
                    <span class="item-subtitle">${date}</span>
                    <div class="item-details">
                        <strong class="item-amount">${fmtIDR(amount)}</strong>
                        ${statusInfo}
                    </div>
                </div>
            </div>`;
        }).join('')}
    </div>`;
}

function _attachPemasukanFormListeners() {
  $('#pemasukan-form')?.addEventListener('submit', handleAddPemasukan);
  _initCustomSelects();

  $('#loan-interest-type')?.addEventListener('change', () => {
      $('.loan-details')?.classList.toggle('hidden', $('#loan-interest-type').value === 'none');
  });

  const amountInput = $('#pemasukan-jumlah');
  const rateInput = $('#loan-rate');
  const tenorInput = $('#loan-tenor');

  if (amountInput) {
      amountInput.addEventListener('input', _formatNumberInput);
      amountInput.addEventListener('input', () => {
          const formType = $('#pemasukan-form').dataset.type;
          if (formType === 'termin') _calculateAndDisplayFees();
          else _updateLoanCalculation();
      });
  }
  rateInput?.addEventListener('input', _updateLoanCalculation);
  tenorInput?.addEventListener('input', _updateLoanCalculation);
}


async function _calculateAndDisplayFees() {
  const container = $('#fee-allocation-container');
  const amount = parseFormattedNumber($('#pemasukan-jumlah').value);
  if (!container || amount <= 0) {
      if (container) container.innerHTML = '';
      return;
  }

  await fetchAndCacheData('staff', staffCol, 'staffName');
  const allStaff = appState.staff || [];
  const relevantStaff = allStaff.filter(s => s.paymentType === 'per_termin' || s.paymentType === 'fixed_per_termin');
  if (relevantStaff.length === 0) return;

  let totalFee = 0;
  const allocationHTML = relevantStaff.map(staff => {
      let feeAmount = 0;
      const isFixed = staff.paymentType === 'fixed_per_termin';

      if (isFixed) {
          feeAmount = staff.feeAmount || 0;
      } else { // per_termin
          feeAmount = amount * ((staff.feePercentage || 0) / 100);
      }

      return `
              <div class="detail-list-item">
                  ${isFixed?`<label class="custom-checkbox-label"><input type="checkbox" class="fee-alloc-checkbox" data-amount="${feeAmount}" data-staff-id="${staff.id}" checked><span class="custom-checkbox-visual"></span></label>` : '<div style="width: 20px;"></div>'}
                  <div class="item-main">
                      <span class="item-date">${staff.staffName} ${isFixed?'' : `(${staff.feePercentage}%)`}</span>
                      <span class="item-project">${isFixed?'Fee Tetap' : 'Fee Persentase'}</span>
                  </div>
                  <div class="item-secondary">
                      <strong class="item-amount positive">${fmtIDR(feeAmount)}</strong>
                  </div>
              </div>
          `;
  }).join('');

  container.innerHTML = `
          <h5 class="invoice-section-title">Alokasi Fee Tim</h5>
          <div class="detail-list-container">${allocationHTML}</div>
          <div class="invoice-total">
              <span>Total Alokasi Fee:</span>
              <strong id="total-fee-amount">${fmtIDR(totalFee)}</strong>
          </div>
      `;

  const updateTotalFee = () => {
      let currentTotal = allStaff.filter(s => s.paymentType === 'per_termin').reduce((sum, s) => sum + (amount * ((s.feePercentage || 0) / 100)), 0);
      $$('.fee-alloc-checkbox:checked').forEach(cb => {
          currentTotal += Number(cb.dataset.amount);
      });
      $('#total-fee-amount').textContent = fmtIDR(currentTotal);
  };

  $$('.fee-alloc-checkbox').forEach(cb => cb.addEventListener('change', updateTotalFee));
  updateTotalFee();
}

async function handleAddPemasukan(e) {
  e.preventDefault();
  const form = e.target;
  const type = form.dataset.type;
  const amount = parseFormattedNumber($('#pemasukan-jumlah', form).value);
  const dateInput = $('#pemasukan-tanggal', form).value;
  const date = new Date(dateInput);

  toast('syncing', 'Menyimpan data lokal...');
  try {
      if (type === 'termin') {
          const projectId = $('#pemasukan-proyek', form).value;
          if (!projectId) {
              toast('error', 'Silakan pilih proyek terkait.');
              return;
          }

          const incomeData = {
              amount,
              date,
              projectId,
              createdAt: serverTimestamp(), // Firestore akan mengganti ini saat sinkron
              needsSync: 1
          };

          await localDB.transaction('rw', localDB.incomes, localDB.bills, async () => {
              if (!incomeData.id) incomeData.id = generateUUID();
              const newLocalIncomeId = await localDB.incomes.add(incomeData);
              const billsToAdd = [];
              appState.staff.filter(s => s.paymentType === 'per_termin').forEach(staff => {
                  const feeAmount = amount * ((staff.feePercentage || 0) / 100);
                  if (feeAmount > 0) {
                      billsToAdd.push({
                          description: `Fee ${staff.staffName} (${staff.feePercentage}%)`,
                          amount: feeAmount,
                          dueDate: date,
                          status: 'unpaid',
                          type: 'fee',
                          staffId: staff.id,
                          projectId: projectId,
                          incomeLocalId: newLocalIncomeId,
                          incomeId: incomeData.id,
                          createdAt: serverTimestamp(),
                          needsSync: 1,
                          paidAmount: 0
                      });
                  }
              });
              $$('.fee-alloc-checkbox:checked', form).forEach(cb => {
                  const staffId = cb.dataset.staffId;
                  const feeAmount = Number(cb.dataset.amount);
                  const staff = appState.staff.find(s => s.id === staffId);
                  if (staff && feeAmount > 0) {
                      billsToAdd.push({
                          description: `Fee Tetap ${staff.staffName}`,
                          amount: feeAmount,
                          dueDate: date,
                          status: 'unpaid',
                          type: 'fee',
                          staffId: staff.id,
                          projectId: projectId,
                          incomeLocalId: newLocalIncomeId,
                          incomeId: incomeData.id,
                          createdAt: serverTimestamp(),
                          needsSync: 1,
                          paidAmount: 0
                      });
                  }
              });
              if (billsToAdd.length > 0) {
                  await localDB.bills.bulkAdd(billsToAdd);
              }
          });
          _logActivity(`Menambah Pemasukan Termin (Lokal): ${fmtIDR(amount)}`, {
              amount
          });
      } else if (type === 'pinjaman') {
          const creditorId = $('#pemasukan-kreditur', form).value;
          if (!creditorId) {
              toast('error', 'Silakan pilih kreditur.');
              return;
          }
          const interestType = $('#loan-interest-type', form).value;

          let loanData = {
              creditorId,
              totalAmount: amount,
              date,
              interestType,
              status: 'unpaid',
              paidAmount: 0,
              createdAt: serverTimestamp(),
              needsSync: 1
          };
          if (interestType === 'interest') {
              const rate = Number($('#loan-rate', form).value);
              const tenor = Number($('#loan-tenor', form).value);
              if (rate < 1 || tenor < 1) {
                  toast('error', 'Bunga dan Tenor minimal harus 1.');
                  return;
              }
              loanData.rate = rate;
              loanData.tenor = tenor;
              loanData.totalRepaymentAmount = amount * (1 + (rate / 100 * tenor));
          }

          if (!loanData.id) loanData.id = generateUUID();
          await localDB.funding_sources.add(loanData);
          _logActivity(`Menambah Pinjaman (Lokal): ${fmtIDR(amount)}`, {
              creditorId,
              amount
          });
      }
      toast('success', 'Data berhasil disimpan di perangkat!');
      form.reset();
      _clearFormDraft(form);
      $$('.custom-select-trigger span:first-child', form).forEach(s => s.textContent = 'Pilih...');

      await loadAllLocalDataToState();
      _rerenderPemasukanList(type);
      syncToServer();
  } catch (error) {
      toast('error', 'Gagal menyimpan data.');
      console.error(error);
  }
}

function _createDetailContentHTML(item, type) {
    const details = [];
    const formatDate = (date) => date?_getJSDate(date).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    }) : 'N/A';

    if (type === 'termin') {
        const projectName = appState.projects.find(p => p.id === item.projectId)?.projectName || 'Tidak ditemukan';
        details.push({
            label: 'Proyek',
            value: projectName
        });
        details.push({
            label: 'Jumlah',
            value: fmtIDR(item.amount)
        });
        details.push({
            label: 'Tanggal Pemasukan',
            value: formatDate(item.date)
        });
    } else { // type === 'pinjaman'
        const creditorName = appState.fundingCreditors.find(c => c.id === item.creditorId)?.creditorName || 'Tidak ditemukan';
        const totalPayable = item.totalRepaymentAmount || item.totalAmount;
        details.push({
            label: 'Kreditur',
            value: creditorName
        });
        details.push({
            label: 'Jumlah Pinjaman',
            value: fmtIDR(item.totalAmount)
        });
        details.push({
            label: 'Tanggal Pinjaman',
            value: formatDate(item.date)
        });
        details.push({
            label: 'Jenis Pinjaman',
            value: item.interestType === 'interest'?'Berbunga' : 'Tanpa Bunga'
        });
        if (item.interestType === 'interest') {
            details.push({
                label: 'Suku Bunga',
                value: `${item.rate || 0}% per bulan`
            });
            details.push({
                label: 'Tenor',
                value: `${item.tenor || 0} bulan`
            });
            details.push({
                label: 'Total Tagihan',
                value: fmtIDR(item.totalRepaymentAmount)
            });
        }
        details.push({
            label: 'Sudah Dibayar',
            value: fmtIDR(item.paidAmount || 0)
        });
        details.push({
            label: 'Sisa Tagihan',
            value: fmtIDR(totalPayable - (item.paidAmount || 0))
        });
        details.push({
            label: 'Status',
            value: item.status === 'paid'?'Lunas' : 'Belum Lunas'
        });
    }

    return `
            <dl class="detail-list">
                ${details.map(d => `
                    <div>
                        <dt>${d.label}</dt>
                        <dd>${d.value}</dd>
                    </div>
                `).join('')}
            </dl>
        `;
}

function _updateLoanCalculation() {
    const resultEl = $('#loan-calculation-result');
    if (!resultEl) return;

    const amount = parseFormattedNumber($('#pemasukan-jumlah')?.value || '0');
    const rate = Number($('#loan-rate')?.value || '0');
    const tenor = Number($('#loan-tenor')?.value || '0');

    if (amount > 0 && rate > 0 && tenor > 0) {
        const totalInterest = amount * (rate / 100) * tenor;
        const totalRepayment = amount + totalInterest;

        resultEl.innerHTML = `
                <span class="label">Total Tagihan Pinjaman</span>
                <span class="amount">${fmtIDR(totalRepayment)}</span>
            `;
        resultEl.style.display = 'block';
    } else {
        resultEl.style.display = 'none';
    }
}

function upsertCommentInUI(a, b, c) {
    try {
        let sectionEl, commentData, changeType;
        if (a && a.nodeType === 1) { sectionEl = a; commentData = b; changeType = c; }
        else { commentData = a; changeType = b; sectionEl = document.querySelector(`.comments-section[data-parent-id="${commentData.parentId}"][data-parent-type="${commentData.parentType}"]`); }

        if (!sectionEl) return;
        const list = sectionEl.querySelector('.comments-list');
        if (!list) return;

        const existing = list.querySelector(`.comment-item[data-id="${commentData.id}"]`);

        if (changeType === 'removed' || commentData.isDeleted) {
            if (existing) { existing.style.opacity = '0'; setTimeout(() => existing.remove(), 250); }
            return;
        }

        const isCurrentUser = appState.currentUser && appState.currentUser.uid === commentData.userId;
        const when = _getJSDate(commentData.createdAt).toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit' });
        const canDelete = !!appState.currentUser && (isCurrentUser || appState.userRole === 'Owner');
        const safeText = String(commentData.content || '').replace(/</g, '&lt;').replace(/\n/g, '<br>');
        const initials = (commentData.userName || 'U').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

        const htmlInner = `
            <div class="comment-avatar">${initials}</div>
            <div class="comment-bubble">
                <div class="comment-meta">
                    <strong class="comment-user">${commentData.userName || 'Pengguna'}</strong>
                    ${canDelete ? `<button class="btn-icon btn-icon-danger" data-action="delete-comment" data-id="${commentData.id}" title="Hapus"><span class="material-symbols-outlined">delete</span></button>` : ''}
                </div>
                <div class="comment-text">${safeText}</div>
                <div class="comment-date">${when}</div>
            </div>
        `;

        if (existing) {
            existing.innerHTML = htmlInner;
            existing.className = `comment-item ${isCurrentUser ? 'is-current-user' : ''}`;
        } else {
            const wrapper = document.createElement('div');
            wrapper.className = `comment-item ${isCurrentUser ? 'is-current-user' : ''}`;
            wrapper.dataset.id = commentData.id;
            wrapper.style.opacity = '0';
            wrapper.innerHTML = htmlInner;
            list.appendChild(wrapper);
            requestAnimationFrame(() => { wrapper.style.opacity = '1'; });
        }
    } catch (e) { console.warn('upsertCommentInUI error', e); }
}