import { appState } from '../core/state.js';
import { $, $$, fmtIDR, _getJSDate, _animateTabSwitch } from '../utils/helpers.js';
import { fetchAndCacheData } from '../core/data.js'; // To be created
import { attendanceRecordsCol, billsCol, workersCol, professionsCol, projectsCol } from '../config/firebase.js';
import { _setActiveListeners } from '../core/sync.js';
import { createModal, closeModal } from '../ui/modals.js';
import { toast, hideToast } from '../ui/toast.js';
import { getDocs, query, where, orderBy, doc, writeBatch, runTransaction, increment, serverTimestamp, collection, getDoc } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

// Placeholders
const _getEmptyStateHTML = () => {};
const isViewer = () => appState.userRole === 'Viewer';
const _logActivity = () => {};
const setBreadcrumb = () => {};
const generateUUID = () => {};

export async function renderJurnalPage() {
    const container = $('.page-container');
    const mainTabs = [{
        id: 'jurnal_absensi',
        label: 'Jurnal Absensi'
    }, {
        id: 'rekap_gaji',
        label: 'Rekap Gaji'
    }];
    container.innerHTML = `
            <div id="jurnal-main-nav" class="sub-nav two-tabs">
                ${mainTabs.map((tab, index) => `<button class="sub-nav-item ${index === 0?'active' : ''}" data-tab="${tab.id}">${tab.label}</button>`).join('')}
            </div>
            <div id="sub-page-content"></div>
        `;

    const renderMainTabContent = async (mainTabId) => {
        const mainLabel = mainTabs.find(t => t.id === mainTabId)?.label || '';
        setBreadcrumb(['Jurnal', mainLabel]);
        appState.activeSubPage.set('jurnal', mainTabId);
        const contentContainer = $("#sub-page-content");
        contentContainer.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';
        if (mainTabId === 'jurnal_absensi') {
            _renderJurnalAbsensiTabs(contentContainer);
        } else if (mainTabId === 'rekap_gaji') {
            _renderRekapGajiTabs(contentContainer);
        }
    };

    const mainNavItems = $$('#jurnal-main-nav .sub-nav-item');
    mainNavItems.forEach((btn, index) => {
        btn.addEventListener('click', (e) => {
            const currentActive = $('#jurnal-main-nav .sub-nav-item.active');
            if (currentActive === btn) return;

            const currentIndex = Array.from(mainNavItems).indexOf(currentActive);
            const direction = index > currentIndex ? 'forward' : 'backward';

            if(currentActive) currentActive.classList.remove('active');
            btn.classList.add('active');

            _animateTabSwitch(
                $("#sub-page-content"),
                () => renderMainTabContent(btn.dataset.tab),
                direction
            );
        });
    });

    const lastMainTab = appState.activeSubPage.get('jurnal') || mainTabs[0].id;
    $(`.sub-nav-item[data-tab="${lastMainTab}"]`)?.classList.add('active');
    await renderMainTabContent(lastMainTab);
    _setActiveListeners(['attendance_records', 'bills']);
}

function _renderJurnalAbsensiTabs(container) {
    const tabs = [{
        id: 'harian',
        label: 'Harian'
    }, {
        id: 'per_pekerja',
        label: 'Per Pekerja'
    }];
    container.innerHTML = `
            <div id="jurnal-absensi-sub-nav" class="sub-nav two-tabs" style="margin-top: 1rem;">
                 ${tabs.map((tab, index) => `<button class="sub-nav-item ${index === 0?'active' : ''}" data-tab="${tab.id}">${tab.label}</button>`).join('')}
            </div>
            <div id="jurnal-absensi-content"></div>
        `;

    const renderSubTab = async (tabId) => {
        const content = $('#jurnal-absensi-content');
        content.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';
        if (tabId === 'harian') await _renderJurnalHarianView(content);
        else if (tabId === 'per_pekerja') await _renderJurnalPerPekerjaView(content);
    };

    const subNavItems = $$('#jurnal-absensi-sub-nav .sub-nav-item');
    subNavItems.forEach((btn, index) => {
        btn.addEventListener('click', (e) => {
            const currentActive = $('#jurnal-absensi-sub-nav .sub-nav-item.active');
            if (currentActive === btn) return;

            const currentIndex = Array.from(subNavItems).indexOf(currentActive);
            const direction = index > currentIndex ? 'forward' : 'backward';

            if(currentActive) currentActive.classList.remove('active');
            btn.classList.add('active');

            _animateTabSwitch(
                $("#jurnal-absensi-content"),
                () => renderSubTab(btn.dataset.tab),
                direction
            );
        });
    });

    renderSubTab(tabs[0].id);
}

async function _renderJurnalHarianView(container) {
  await fetchAndCacheData('attendanceRecords', attendanceRecordsCol, 'date');
  const groupedByDay = _groupAttendanceByDay(appState.attendanceRecords);
  const sortedDays = Object.entries(groupedByDay).sort((a, b) => new Date(b[0]) - new Date(a[0]));
  if (sortedDays.length === 0) {
      container.innerHTML = '<p class="empty-state">Belum ada data absensi.</p>';
      return;
  }
  const listHTML = sortedDays.map(([date, data]) => {
      const dayDate = new Date(date);
      const formattedDate = dayDate.toLocaleDateString('id-ID', {
          weekday: 'long',
          day: 'numeric',
          month: 'long'
      });
      return `
              <div class="card card-list-item" data-action="view-jurnal-harian" data-date="${date}">
                  <div class="card-list-item-content">
                      <div class="card-list-item-details">
                          <h5 class="card-list-item-title">${formattedDate}</h5>
                          <p class="card-list-item-subtitle">${data.workerCount} Pekerja Hadir</p>
                      </div>
                      <div class="card-list-item-amount-wrapper">
                          <strong class="card-list-item-amount negative">${fmtIDR(data.totalUpah)}</strong>
                          <p class="card-list-item-repayment-info">Total Beban Upah</p>
                      </div>
                  </div>
              </div>`;
  }).join('');
  container.innerHTML = `<div style="padding-bottom: 2rem;">${listHTML}</div>`;
}

function _groupAttendanceByDay(records) {
  return (records || []).reduce((acc, rec) => {
      const dateStr = _getJSDate(rec?.date).toISOString().slice(0, 10);
      if (!acc[dateStr]) {
          acc[dateStr] = {
              records: [],
              totalUpah: 0,
              workerCount: 0
          };
      }
      acc[dateStr].records.push(rec);
      acc[dateStr].totalUpah += (rec.totalPay || 0);
      if ((rec.totalPay || 0) > 0) acc[dateStr].workerCount++;
      return acc;
  }, {});
}

async function handleViewWorkerRecapModal(workerId) {
    const worker = appState.workers.find(w => w.id === workerId);
    if (!worker) {
        toast('error', 'Data pekerja tidak ditemukan.');
        return;
    }

    toast('syncing', `Memuat riwayat lengkap ${worker.workerName}...`);

    try {
        const salaryBillsQuery = query(billsCol, where('type', '==', 'gaji'));
        const [salaryBillsSnap, attendanceRecordsSnap] = await Promise.all([
            getDocs(salaryBillsQuery),
            getDocs(attendanceRecordsCol)
        ]);

        const allSalaryBillsFromServer = salaryBillsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        appState.attendanceRecords = attendanceRecordsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const nonSalaryBillsInState = appState.bills.filter(b => b.type !== 'gaji');
        appState.bills = [...nonSalaryBillsInState, ...allSalaryBillsFromServer];

        const salaryBillsForWorker = appState.bills.filter(bill => {
            if (bill.type !== 'gaji') return false;
            const isInNewFormat = bill.workerDetails && bill.workerDetails.some(detail => (detail.id === workerId || detail.workerId === workerId));
            const isInOldFormat = bill.workerId === workerId;
            return isInNewFormat || isInOldFormat;
        });

        if (salaryBillsForWorker.length === 0) {
            hideToast();
            createModal('dataDetail', {
                title: `Buku Besar Gaji: ${worker.workerName}`,
                content: '<p class="empty-state">Belum ada data tagihan gaji yang tercatat untuk pekerja ini.</p>'
            });
            return;
        }

        const allRecordIds = salaryBillsForWorker
            .flatMap(b => {
                if (b.workerDetails) {
                    return b.workerDetails.filter(d => (d.id === workerId || d.workerId === workerId)).flatMap(d => d.recordIds || []);
                }
                if (b.recordIds) {
                    return b.recordIds;
                }
                return [];
            });

        const relatedRecords = allRecordIds
            .map(id => appState.attendanceRecords.find(rec => rec.id === id))
            .filter(Boolean)
            .sort((a, b) => _getJSDate(b.date) - _getJSDate(a.date));

        let allPaymentsForWorker = [];
        for (const bill of salaryBillsForWorker) {
            const paymentsColRef = collection(db, 'teams', TEAM_ID, 'bills', bill.id, 'payments');
            const paymentsSnap = await getDocs(paymentsColRef);
            const allPaymentsInBill = paymentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            if (bill.workerDetails) {
                const workerDetail = bill.workerDetails.find(d => d.id === workerId || d.workerId === workerId);
                const individualPayments = allPaymentsInBill.filter(p => p.workerId === workerId);
                allPaymentsForWorker.push(...individualPayments);
                if (bill.status === 'paid' && individualPayments.length === 0 && workerDetail) {
                    allPaymentsForWorker.push({
                        date: bill.paidAt || bill.updatedAt || bill.createdAt,
                        amount: workerDetail.amount,
                        note: "Pembayaran Lunas (Gabungan)"
                    });
                }

            } else {
                allPaymentsForWorker.push(...allPaymentsInBill);
            }
        }
        allPaymentsForWorker.sort((a, b) => _getJSDate(b.date) - _getJSDate(a.date));

        const totalEarned = relatedRecords.reduce((sum, rec) => sum + (rec.totalPay || 0), 0);
        const totalPaid = allPaymentsForWorker.reduce((sum, p) => sum + (p.amount || 0), 0);
        const totalUnpaid = totalEarned - totalPaid;

        const attendanceHistoryHTML = relatedRecords.length > 0 ? relatedRecords.map(rec => {
            const project = appState.projects.find(p => p.id === rec.projectId);
            const date = _getJSDate(rec.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
            return `<div class="jurnal-detail-item"><div class="item-main"><span class="item-date">${date}</span><span class="item-project">${project?.projectName || 'N/A'}</span></div><div class="item-secondary"><strong class="item-amount">${fmtIDR(rec.totalPay || 0)}</strong></div></div>`;
        }).join('') : '<p class="empty-state-small">Belum ada riwayat absensi yang direkap.</p>';

        const paymentHistoryHTML = allPaymentsForWorker.length > 0 ? _createPaymentHistoryHTML(allPaymentsForWorker) : '<p class="empty-state-small">Belum ada riwayat pembayaran.</p>';

        const content = `<div class="payment-summary" style="margin-bottom: 1.5rem;"><div><span>Total Upah Dihasilkan:</span><strong>${fmtIDR(totalEarned)}</strong></div><div><span>Total Telah Dibayar:</span><strong class="positive">${fmtIDR(totalPaid)}</strong></div><div class="remaining"><span>Sisa Gaji (Tagihan):</span><strong class="negative">${fmtIDR(totalUnpaid)}</strong></div></div><h5 class="detail-section-title">Riwayat Absensi (Upah Dihasilkan)</h5><div class="jurnal-detail-list">${attendanceHistoryHTML}</div><h5 class="detail-section-title" style="margin-top:1.5rem;">Riwayat Pembayaran Gaji</h5>${paymentHistoryHTML}`;

        hideToast();
        createModal('dataDetail', {
            title: `Buku Besar Gaji: ${worker.workerName}`,
            content
        });

    } catch (error) {
        hideToast();
        toast('error', 'Gagal memuat riwayat lengkap.');
        console.error("Gagal membuat rekap detail pekerja:", error);
    }
}

async function _renderJurnalPerPekerjaView(container) {
    await Promise.all([
        fetchAndCacheData('workers', workersCol, 'workerName'),
        fetchAndCacheData('professions', professionsCol, 'professionName')
    ]);
    const activeWorkers = appState.workers.filter(w => w.status === 'active');
    if (activeWorkers.length === 0) {
        container.innerHTML = '<p class="empty-state">Belum ada data pekerja aktif.</p>';
        return;
    }
    const listHTML = activeWorkers.map(worker => {
        const profession = appState.professions.find(p => p.id === worker.professionId)?.professionName || 'Tanpa Profesi';
        return `
                 <div class="card card-list-item" data-action="view-worker-recap" data-worker-id="${worker.id}">
                    <div class="card-list-item-content">
                        <div class="card-list-item-details">
                            <h5 class="card-list-item-title">${worker.workerName}</h5>
                            <p class="card-list-item-subtitle">${profession}</p>
                        </div>
                         <div class="card-list-item-amount-wrapper">
                             <span class="material-symbols-outlined" style="font-size: 2rem; color: var(--text-muted);">chevron_right</span>
                        </div>
                    </div>
                </div>
            `;
    }).join('');
    container.innerHTML = `<div style="padding-bottom: 2rem;">${listHTML}</div>`;
  }

async function handleViewJurnalHarianModal(dateStr) {
    toast('syncing', 'Memuat detail jurnal...');
    await Promise.all([
        fetchAndCacheData('projects', projectsCol, 'projectName'),
        fetchAndCacheData('workers', workersCol, 'workerName')
    ]);
    hideToast();
    const date = new Date(dateStr);
    const groupedByDay = _groupAttendanceByDay(appState.attendanceRecords);
    const dayData = groupedByDay[dateStr];
    if (!dayData) {
        toast('error', 'Tidak ada data untuk tanggal ini.');
        return;
    }
    const formattedDate = date.toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
    });

    const workersByProject = dayData.records.reduce((acc, rec) => {
        const projectId = rec.projectId || 'tanpa_proyek';
        if (!acc[projectId]) {
            acc[projectId] = [];
        }
        acc[projectId].push(rec);
        return acc;
    }, {});
    const projectSectionsHTML = Object.entries(workersByProject).map(([projectId, records]) => {
        const project = appState.projects.find(p => p.id === projectId);
        const projectName = project?project.projectName : 'Proyek Tidak Diketahui';
        const workersHTML = records.sort((a, b) => (a.workerName || '').localeCompare(b.workerName || '')).map(rec => {
            let statusBadge = '';
            if (rec.attendanceStatus === 'full_day') statusBadge = `<span class="status-badge status-hadir">Hadir</span>`;
            else if (rec.attendanceStatus === 'half_day') statusBadge = `<span class="status-badge status-setengah">1/2 Hari</span>`;
            else statusBadge = `<span class="status-badge status-absen">Absen</span>`;

            const worker = appState.workers.find(w => w.id === rec.workerId);
            const workerName = worker?worker.workerName : (rec.workerName || 'Pekerja Dihapus');

            return `
            <div class="jurnal-pekerja-item card">
                <div class="jurnal-pekerja-info">
                    <strong>${workerName}</strong>
                </div>
                <div class="jurnal-pekerja-status">
                    <strong>${fmtIDR(rec.totalPay || 0)}</strong>
                    ${statusBadge}
                </div>
            </div>
            `;
        }).join('');
        return `
            <h5 class="detail-section-title">${projectName}</h5>
            <div class="jurnal-pekerja-list">${workersHTML}</div>
        `;
    }).join('');

    const content = `
        <div class="payment-summary" style="margin-bottom: 1.5rem;">
            <div><span>Total Pekerja:</span><strong>${dayData.workerCount} Orang</strong></div>
            <div class="remaining"><span>Total Upah:</span><strong>${fmtIDR(dayData.totalUpah)}</strong></div>
        </div>
        ${projectSectionsHTML}
    `;
    createModal('dataDetail', {
        title: `Jurnal Harian: ${formattedDate}`,
        content
    });
}


async function _renderRekapGajiTabs(container) {
    const tabs = [{
        id: 'buat_rekap',
        label: 'Buat Rekap Baru'
    }, {
        id: 'riwayat_rekap',
        label: 'Riwayat Rekap'
    }];
    container.innerHTML = `
            <div id="rekap-gaji-sub-nav" class="sub-nav two-tabs" style="margin-top: 1rem;">
                 ${tabs.map((tab, index) => `<button class="sub-nav-item ${index === 0?'active' : ''}" data-tab="${tab.id}">${tab.label}</button>`).join('')}
            </div>
            <div id="rekap-gaji-content"></div>
        `;

    const renderSubTab = async (tabId) => {
        const content = $('#rekap-gaji-content');
        content.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';
        if (tabId === 'buat_rekap') {
            content.innerHTML = _getSalaryRecapHTML();
            if (!isViewer()) {
                $('#generate-recap-btn')?.addEventListener('click', () => {
                    const startDate = $('#recap-start-date').value;
                    const endDate = $('#recap-end-date').value;
                    if (startDate && endDate) generateSalaryRecap(new Date(startDate), new Date(endDate));
                    else toast('error', 'Silakan pilih rentang tanggal.');
                });
            } else {
                generateSalaryRecap(new Date(new Date().getFullYear(), new Date().getMonth(), 1), new Date());
            }
        } else if (tabId === 'riwayat_rekap') {
            await _renderRiwayatRekapView(content);
        }
    };

    const subNavItems = $$('#rekap-gaji-sub-nav .sub-nav-item');
    subNavItems.forEach((btn, index) => {
        btn.addEventListener('click', (e) => {
            const currentActive = $('#rekap-gaji-sub-nav .sub-nav-item.active');
            if (currentActive === btn) return;

            const currentIndex = Array.from(subNavItems).indexOf(currentActive);
            const direction = index > currentIndex ? 'forward' : 'backward';

            if(currentActive) currentActive.classList.remove('active');
            btn.classList.add('active');

            _animateTabSwitch(
                $("#rekap-gaji-content"),
                () => renderSubTab(btn.dataset.tab),
                direction
            );
        });
    });

    await renderSubTab(tabs[0].id);
}

function _getSalaryRecapHTML() {
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const todayStr = today.toISOString().slice(0, 10);
  return `
      <div class="card card-pad">
          <h5 class="section-title-owner" style="margin-top:0;">Pilih Periode Rekap</h5>
          <div class="recap-filters">
              <div class="form-group"><label>Tanggal Mulai</label><input type="date" id="recap-start-date" value="${firstDayOfMonth}" ${isViewer()?'disabled' : ''}></div>
              <div class="form-group"><label>Tanggal Selesai</label><input type="date" id="recap-end-date" value="${todayStr}" ${isViewer()?'disabled' : ''}></div>
              ${isViewer()?'' : `
                  <button id="generate-recap-btn" class="btn btn-primary">Tampilkan Rekap</button>
                  <button id="fix-stuck-data-btn" class="btn btn-danger" data-action="fix-stuck-attendance">
                      <span class="material-symbols-outlined">build_circle</span> Perbaiki Data
                  </button>
              `}
          </div>
      </div>
              <div id="recap-actions-container" class="card card-pad" style="margin-top: 1.5rem; display: none;">
           <div class="rekap-actions" style="grid-template-columns: 1fr 1fr;">
               <button id="generate-selected-btn" class="btn" data-action="generate-selected-salary-bill" disabled>Buat Tagihan (Terpilih)</button>
               <button id="generate-all-btn" class="btn btn-primary" data-action="generate-all-salary-bill">Buat Tagihan (Semua)</button>
           </div>
      </div>
      <div id="recap-results-container" style="margin-top: 1.5rem;">
           <p class="empty-state-small">Pilih rentang tanggal dan klik "Tampilkan Rekap" untuk melihat hasilnya.</p>
      </div>
  `;
}

async function generateSalaryRecap(startDate, endDate) {
    const resultsContainer = $('#recap-results-container');
    const actionsContainer = $('#recap-actions-container');
    if (!resultsContainer || !actionsContainer) return;

    resultsContainer.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';
    actionsContainer.style.display = 'none';

    toast('syncing', 'Memuat data master & absensi...');

    await fetchAndCacheData('workers', workersCol, 'workerName');

    endDate.setHours(23, 59, 59, 999);

    const q = query(attendanceRecordsCol,
        where('status', '==', 'completed'),
        where('isPaid', '==', false),
        where('date', '>=', startDate),
        where('date', '<=', endDate)
    );

    const snap = await getDocs(q);

    if (snap.empty) {
        hideToast();
        resultsContainer.innerHTML = `<p class="empty-state">Tidak ada data gaji yang belum dibayar pada periode ini.</p>`;
        return;
    }

    toast('syncing', 'Menghitung ulang upah berdasarkan data terbaru...');
    const salaryRecap = new Map();
    const batch = writeBatch(db);
    let needsUpdate = false;

    snap.forEach(doc => {
        const record = { id: doc.id, ...doc.data() };
        const worker = appState.workers.find(w => w.id === record.workerId);
        if (!worker) return;

        const currentDailyWage = worker.projectWages?.[record.projectId] || 0;
        let recalculatedPay = 0;

        if (record.type === 'manual') {
            if (record.attendanceStatus === 'full_day') {
                recalculatedPay = currentDailyWage;
            } else if (record.attendanceStatus === 'half_day') {
                recalculatedPay = currentDailyWage / 2;
            }
        } else if (record.type === 'timestamp') {
            const hourlyWage = currentDailyWage / 8;
            const normalPay = (record.normalHours || 0) * hourlyWage;
            const overtimePay = (record.overtimeHours || 0) * hourlyWage * 1.5;
            recalculatedPay = normalPay + overtimePay;
        }

        if (Math.round(recalculatedPay) !== Math.round(record.totalPay || 0)) {
            const recordRef = doc(attendanceRecordsCol, record.id);
            batch.update(recordRef, { totalPay: recalculatedPay });
            needsUpdate = true;
            console.log(`Koreksi upah untuk ${worker.workerName}: ${fmtIDR(record.totalPay)} -> ${fmtIDR(recalculatedPay)}`);
        }

        const workerId = record.workerId;
        if (!salaryRecap.has(workerId)) {
            salaryRecap.set(workerId, {
                workerName: worker.workerName,
                totalPay: 0,
                recordIds: [],
                workerId: workerId
            });
        }
        const workerData = salaryRecap.get(workerId);
        workerData.totalPay += recalculatedPay;
        workerData.recordIds.push(record.id);
    });

    if (needsUpdate) {
        await batch.commit();
        toast('success', 'Beberapa data upah telah dikoreksi!');
    } else {
        hideToast();
    }

    const recapData = [...salaryRecap.values()];
    const tableHTML = `
        <div class="card card-pad">
            <div class="recap-table-wrapper">
                <table class="recap-table" id="salary-recap-table">
                    <thead>
                        <tr>
                            ${isViewer() ? '' : `<th><input type="checkbox" id="select-all-recap"></th>`}
                            <th>Nama Pekerja</th>
                            <th>Total Upah</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${recapData.map(worker => `
                            <tr data-worker-id="${worker.workerId}" data-worker-name="${worker.workerName}" data-total-pay="${worker.totalPay}" data-record-ids="${worker.recordIds.join(',')}" class="recap-row">
                                ${isViewer() ? '' : `<td><input type="checkbox" class="recap-checkbox"></td>`}
                                <td>${worker.workerName}</td>
                                <td><strong>${fmtIDR(worker.totalPay)}</strong></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
    resultsContainer.innerHTML = tableHTML;
    actionsContainer.style.display = 'block';
    if (!isViewer()) _attachRecapTableListeners(recapData);
}

function _attachRecapTableListeners(recapData) {
  const table = $('#salary-recap-table');
  if (!table) return;
  const selectAll = $('#select-all-recap');
  const checkBoxes = $$('.recap-checkbox');
  const generateSelectedBtn = $('#generate-selected-btn');
  const updateButtonState = () => {
      const selectedCount = $$('.recap-checkbox:checked').length;
      generateSelectedBtn.disabled = selectedCount === 0;
      generateSelectedBtn.textContent = `Buat Tagihan (${selectedCount} Terpilih)`;
  };
  selectAll.addEventListener('change', () => {
      checkBoxes.forEach(cb => cb.checked = selectAll.checked);
      updateButtonState();
  });
  checkBoxes.forEach(cb => {
      cb.addEventListener('change', () => {
          const allChecked = checkBoxes.every(c => c.checked);
          selectAll.checked = allChecked;
          updateButtonState();
      });
  });
  updateButtonState();
}

async function handleGenerateBulkSalaryBill(selectedWorkers, startDate, endDate) {
    if (selectedWorkers.length === 0) {
        toast('error', 'Tidak ada pekerja yang dipilih.');
        return;
    }

    const grandTotal = selectedWorkers.reduce((sum, worker) => sum + worker.totalPay, 0);
    const allRecordIds = selectedWorkers.flatMap(worker => worker.recordIds);
    const description = selectedWorkers.length === 1 ?
        `Gaji ${selectedWorkers[0].workerName} periode ${startDate.toLocaleDateString('id-ID')} s/d ${endDate.toLocaleDateString('id-ID')}` :
        `Gaji Gabungan ${selectedWorkers.length} pekerja periode ${startDate.toLocaleDateString('id-ID')} s/d ${endDate.toLocaleDateString('id-ID')}`;

    createModal('confirmGenerateBill', {
        message: `Anda akan membuat 1 tagihan gabungan sebesar <strong>${fmtIDR(grandTotal)}</strong> untuk <strong>${selectedWorkers.length} pekerja</strong>. Lanjutkan?`,
        onConfirm: async () => {
            toast('syncing', 'Membuat tagihan gaji massal...');
            try {
                const billId = generateUUID();
                const billRef = doc(billsCol, billId);
                const batch = writeBatch(db);

                const newBillDataForFirestore = {
                    description,
                    amount: grandTotal,
                    paidAmount: 0,
                    dueDate: Timestamp.fromDate(new Date()),
                    status: 'unpaid',
                    type: 'gaji',
                    workerDetails: selectedWorkers.map(w => ({
                        id: w.workerId,
                        name: w.workerName,
                        amount: w.totalPay,
                        recordIds: w.recordIds
                    })),
                    recordIds: allRecordIds,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    rev: 1
                };

                batch.set(billRef, newBillDataForFirestore);

                allRecordIds.forEach(recordId => {
                    batch.update(doc(attendanceRecordsCol, recordId), {
                        billId: billRef.id
                    });
                });

                await batch.commit();

                _logActivity(`Membuat Tagihan Gaji Massal`, { billId, amount: grandTotal });
                toast('success', 'Tagihan gaji gabungan berhasil dibuat.');

                const newBillObjectForState = {
                    ...newBillDataForFirestore,
                    id: billId,
                    dueDate: new Date(),
                    createdAt: new Date()
                };

                delete newBillObjectForState.updatedAt;

                appState.bills.unshift(newBillObjectForState);

                await fetchAndCacheData('attendanceRecords', attendanceRecordsCol, 'date');
                renderJurnalPage();

            } catch (error) {
                toast('error', 'Gagal membuat tagihan gaji.');
                console.error('Error generating bulk salary bill:', error);
            }
        }
    });
}

async function _renderRiwayatRekapView(container) {
    const salaryBills = appState.bills.filter(b => b.type === 'gaji').sort((a, b) => _getJSDate(b.createdAt) - _getJSDate(a.createdAt));

    if (salaryBills.length === 0) {
        container.innerHTML = '<p class="empty-state">Belum ada riwayat rekap gaji yang dibuat.</p>';
        return;
    }

    const listHTML = salaryBills.map(bill => {
        const date = _getJSDate(bill.createdAt).toLocaleDateString('id-ID', {day:'numeric', month:'long', year:'numeric'});
        const statusClass = bill.status === 'paid' ? 'positive' : 'negative';
        const statusText = bill.status === 'paid' ? 'Lunas' : 'Belum Lunas';
        const isTouch = (('ontouchstart' in window) || (navigator.maxTouchPoints||0)>0);

        const swipeBtns = `
            <button class="btn-icon" data-action="open-bill-detail" data-id="${bill.id}" data-type="bill" title="Lihat Detail"><span class="material-symbols-outlined">visibility</span></button>
            <button class="btn-icon btn-icon-danger" data-action="delete-salary-bill" data-id="${bill.id}" title="Batalkan Rekap"><span class="material-symbols-outlined">delete</span></button>
        `;

        return `
            <div class="dense-list-item" data-id="${bill.id}" style="position:relative; overflow:hidden;">
                <div class="swipe-actions">
                    ${swipeBtns}
                </div>

                <div class="item-main-content" data-action="open-bill-detail" data-id="${bill.id}" data-type="bill">
                    <strong class="item-title">${bill.description}</strong>
                    <span class="item-subtitle">Dibuat pada: ${date}</span>
                    <div class="item-details">
                        <strong class="item-amount">${fmtIDR(bill.amount)}</strong>
                        <span class="status-badge ${statusClass}">${statusText}</span>
                    </div>
                </div>

                ${isTouch ? '' : `
                    <div class="item-actions">
                        <button class="btn-icon" data-action="open-recap-actions" data-id="${bill.id}" title="Aksi Lainnya">
                            <span class="material-symbols-outlined">more_vert</span>
                        </button>
                    </div>
                `}
            </div>
        `;
    }).join('');

    container.innerHTML = `<div class="dense-list-container">${listHTML}</div>`;

    setTimeout(() => _attachSwipeHandlers('#rekap-gaji-content'), 50);
}

async function handleRemoveWorkerFromRecap(billId, workerId) {
    const bill = appState.bills.find(b => b.id === billId);
    const worker = bill?.workerDetails?.find(w => (w.id === workerId || w.workerId === workerId));

    if (!bill || !worker) {
        toast('error', 'Data tagihan atau pekerja tidak ditemukan.');
        return;
    }

    createModal('confirmUserAction', {
        message: `Anda yakin ingin mengeluarkan <strong>${worker.name}</strong> dari rekap ini? Tagihan akan disesuaikan dan absensi pekerja ini akan bisa direkap ulang.`,
        onConfirm: async () => {
            toast('syncing', `Memproses pengeluaran ${worker.name}...`);
            try {
                const billRef = doc(billsCol, billId);

                const paymentsColRef = collection(billRef, 'payments');
                const paymentsSnap = await getDocs(paymentsColRef);
                const hasPaymentForWorker = !paymentsSnap.empty && paymentsSnap.docs.some(doc => doc.data().workerId === workerId);

                if (bill.status === 'paid' || hasPaymentForWorker) {
                    toast('error', `Pekerja tidak bisa dikeluarkan karena pembayaran sudah tercatat untuknya atau tagihan sudah lunas.`);
                    return;
                }

                const workerToRemove = bill.workerDetails.find(w => (w.id === workerId || w.workerId === workerId));
                const amountToRemove = workerToRemove.amount || 0;
                const recordIdsToReset = workerToRemove.recordIds || [];

                const newWorkerDetails = bill.workerDetails.filter(w => (w.id !== workerId && w.workerId !== workerId));
                const newRecordIds = newWorkerDetails.flatMap(w => w.recordIds || []);

                const batch = writeBatch(db);

                batch.update(billRef, {
                    amount: increment(-amountToRemove),
                    workerDetails: newWorkerDetails,
                    recordIds: newRecordIds
                });

                recordIdsToReset.forEach(id => {
                    const recordRef = doc(attendanceRecordsCol, id);
                    batch.update(recordRef, { billId: null });
                });

                await batch.commit();

                await _logActivity(`Mengeluarkan Pekerja dari Rekap: ${worker.name}`, { billId, workerId });
                toast('success', `${worker.name} berhasil dikeluarkan dari rekap.`);

                await fetchAndCacheData('bills', billsCol);
                closeModal($('#dataDetail-modal'));
                renderPageContent();

            } catch (error) {
                toast('error', 'Gagal memproses. Coba lagi.');
                console.error('Error removing worker from recap:', error);
            }
        }
    });
}

async function handleDeleteSalaryBill(billId) {
    createModal('confirmDelete', {
        message: 'Membatalkan rekap akan menghapus tagihan ini dan mengembalikan status absensi terkait menjadi "belum dibayar". Anda bisa membuat rekap baru setelahnya. Lanjutkan?',
        onConfirm: async () => {
            toast('syncing', 'Memeriksa pembayaran & membatalkan rekap...');
            try {
                const billRef = doc(billsCol, billId);

                const paymentsColRef = collection(billRef, 'payments');
                const paymentsSnap = await getDocs(paymentsColRef);
                if (!paymentsSnap.empty) {
                    toast('error', `Tagihan ini tidak bisa dibatalkan karena sudah memiliki ${paymentsSnap.size} riwayat pembayaran.`);
                    return;
                }

                const billSnap = await getDoc(billRef);
                if (!billSnap.exists()) throw new Error('Tagihan tidak ditemukan');

                const recordIds = billSnap.data().recordIds || [];

                const batch = writeBatch(db);
                recordIds.forEach(id => {
                    const recordRef = doc(attendanceRecordsCol, id);
                    batch.update(recordRef, { isPaid: false, billId: null });
                });
                batch.delete(billRef);

                await batch.commit();
                await _logActivity(`Membatalkan Rekap Gaji`, { billId });
                toast('success', 'Rekap gaji berhasil dibatalkan.');

                await fetchAndCacheData('bills', billsCol);
                renderJurnalPage();

            } catch (error) {
                toast('error', 'Gagal membatalkan rekap.');
                console.error('Error deleting salary bill:', error);
            }
        }
    });
}

async function handleFixStuckAttendanceModal() {
  await fetchAndCacheData('workers', workersCol, 'workerName');
  const workerOptions = [{
      value: 'all',
      text: '� Semua Pekerja �'
  }, ...appState.workers.filter(w => w.status === 'active').map(w => ({
      value: w.id,
      text: w.workerName
  }))];
  const content = `
          <form id="fix-attendance-form">
              <p class="confirm-modal-text">Fitur ini akan secara paksa mereset status absensi yang 'lunas' tanpa tagihan menjadi 'belum lunas'.</p>
              ${createMasterDataSelect('fix-worker-id', 'Pilih Pekerja (atau Semua)', workerOptions, 'all')}
              <div class="recap-filters" style="padding:0; margin-top: 1rem;">
                  <div class="form-group"><label>Dari Tanggal</label><input type="date" name="startDate" required></div>
                  <div class="form-group"><label>Sampai Tanggal</label><input type="date" name="endDate" required></div>
              </div>
              <div class="modal-footer" style="margin-top: 1.5rem;"><button type="button" class="btn btn-secondary" data-close-modal>Batal</button><button type="submit" class="btn btn-danger">Jalankan Perbaikan</button></div>
          </form>
      `;
  createModal('dataDetail', {
      title: 'Perbaiki Data Absensi',
      content
  });
  _initCustomSelects($('#dataDetail-modal'));
  $('#fix-attendance-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const workerId = e.target.elements['fix-worker-id'].value;
      let msg = 'Anda yakin ingin mereset status absensi untuk pekerja dan periode ini?';
      if (workerId === 'all') {
          msg = 'PERINGATAN: Anda akan mereset status LUNAS menjadi BELUM LUNAS untuk SEMUA pekerja pada periode ini. Lanjutkan hanya jika Anda yakin.';
      }
      createModal('confirmUserAction', {
          message: msg,
          onConfirm: () => _forceResetAttendanceStatus(e.target)
      });
  });
}

async function _forceResetAttendanceStatus(form) {
  const workerId = form.elements['fix-worker-id'].value;
  const startDateStr = form.elements.startDate.value;
  const endDateStr = form.elements.endDate.value;
  if (!workerId || !startDateStr || !endDateStr) {
      toast('error', 'Harap lengkapi semua field.');
      return;
  }
  toast('syncing', `Memperbaiki data absensi...`);
  const startDate = new Date(startDateStr);
  const endDate = new Date(endDateStr);
  endDate.setHours(23, 59, 59, 999);
  let queryConstraints = [where('isPaid', '==', true), where('date', '>=', startDate), where('date', '<=', endDate)];
  if (workerId !== 'all') {
      queryConstraints.push(where('workerId', '==', workerId));
  }
  const q = query(attendanceRecordsCol, ...queryConstraints);
  try {
      const attendanceSnap = await getDocs(q);
      if (attendanceSnap.empty) {
          toast('info', 'Tidak ditemukan data berstatus lunas untuk diperbaiki.');
          return;
      }
      const batch = writeBatch(db);
      attendanceSnap.docs.forEach(doc => {
          batch.update(doc.ref, {
              isPaid: false,
              billId: null
          });
      });
      await batch.commit();
      toast('success', `${attendanceSnap.size} data absensi berhasil direset!`);
      closeModal($('#dataDetail-modal'));
      closeModal($('#confirmUserAction-modal'));
  } catch (error) {
      toast('error', 'Gagal memperbaiki data.');
      console.error('Gagal force reset data:', error);
  }
}