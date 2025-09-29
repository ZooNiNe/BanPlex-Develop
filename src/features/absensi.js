import { appState } from '../core/state.js';
import { $, $$, fmtIDR, _getJSDate, _animateTabSwitch, generateUUID } from '../utils/helpers.js';
import { fetchAndCacheData, loadAllLocalDataToState } from '../core/data.js'; // To be created
import { workersCol, professionsCol, projectsCol, attendanceRecordsCol } from '../config/firebase.js';
import { _setActiveListeners, syncToServer } from '../core/sync.js';
import { createModal } from '../ui/modals.js';
import { toast } from '../ui/toast.js';
import { localDB } from '../db/dexie.js';
import { getDocs, query, where, Timestamp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

// Placeholders
const _getEmptyStateHTML = () => {};
const isViewer = () => appState.userRole === 'Viewer';
const _logActivity = () => {};
const createMasterDataSelect = () => {};
const _initCustomSelects = () => {};
const optimisticUpdateDoc = () => {};


export async function renderAbsensiPage() {
    const container = $('.page-container');
    const tabs = [{
        id: 'manual',
        label: 'Input Manual'
    }, {
        id: 'harian',
        label: 'Absensi Harian'
    }];
    container.innerHTML = `
            ${isViewer()?'' : `<div class="attendance-header">
                 <button class="btn" data-action="manage-master" data-type="workers"><span class="material-symbols-outlined">engineering</span>Pekerja</button>
                 <button class="btn" data-action="manage-master" data-type="professions"><span class="material-symbols-outlined">badge</span>Profesi</button>
            </div>`}
            <div class="sub-nav two-tabs">
                ${tabs.map((tab, index) => `<button class="sub-nav-item ${index === 0?'active' : ''}" data-tab="${tab.id}">${tab.label}</button>`).join('')}
            </div>
            <div id="sub-page-content"></div>
        `;

    const renderTabContent = async (tabId) => {
        appState.activeSubPage.set('absensi', tabId);
        const contentContainer = $("#sub-page-content");
        contentContainer.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';

        await Promise.all([
            fetchAndCacheData('workers', workersCol, 'workerName'),
            fetchAndCacheData('professions', professionsCol, 'professionName'),
            fetchAndCacheData('projects', projectsCol, 'projectName')
        ]);

        if (tabId === 'harian') {
            await _fetchTodaysAttendance();
            contentContainer.innerHTML = _getDailyAttendanceHTML();
            _initCustomSelects(contentContainer);
            contentContainer.querySelector('#attendance-profession-filter')?.addEventListener('change', () => _rerenderAttendanceList());
            contentContainer.querySelector('#attendance-project-id')?.addEventListener('change', () => _rerenderAttendanceList());
        } else if (tabId === 'manual') {
            contentContainer.innerHTML = _getManualAttendanceHTML();
            _initCustomSelects(contentContainer);
            const dateInput = $('#manual-attendance-date', contentContainer);
            const projectInput = $('#manual-attendance-project', contentContainer);
            dateInput.addEventListener('change', () => _renderManualAttendanceList(dateInput.value, projectInput.value));
            projectInput.addEventListener('change', () => _renderManualAttendanceList(dateInput.value, projectInput.value));
            if (!isViewer()) $('#manual-attendance-form').addEventListener('submit', handleSaveManualAttendance);

            _renderManualAttendanceList(dateInput.value, projectInput.value);
        }
    };

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

    const lastSubPage = appState.activeSubPage.get('absensi') || tabs[0].id;
    $(`.sub-nav-item[data-tab="${lastSubPage}"]`)?.classList.add('active');
    await renderTabContent(lastSubPage);
    _setActiveListeners(['attendance_records']);
}

function _getDailyAttendanceHTML() {
  const today = new Date().toLocaleDateString('id-ID', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
  });
  const projectOptions = appState.projects.map(p => ({
      value: p.id,
      text: p.projectName
  }));
  const professionOptions = [{
      value: 'all',
      text: 'Semua Profesi'
  }, ...appState.professions.map(p => ({
      value: p.id,
      text: p.professionName
  }))];
  let content = (appState.workers.length === 0) ?
      _getEmptyStateHTML({ icon:'group', title:'Belum Ada Pekerja', desc:'Tambahkan pekerja untuk mulai mencatat absensi.' }) :
      `<div class="attendance-grid" id="attendance-grid-container">${_renderAttendanceGrid()}</div>`;
  return `
          <h4 class="page-title-date">${today}</h4>
          <div class="attendance-controls card card-pad">
              ${createMasterDataSelect('attendance-project-id', 'Proyek Hari Ini', projectOptions, appState.projects[0]?.id || '')}
              ${createMasterDataSelect('attendance-profession-filter', 'Filter Profesi', professionOptions, 'all')}
          </div>
          ${content}
      `;
}

function _rerenderAttendanceList() {
  $('#attendance-grid-container').innerHTML = _renderAttendanceGrid();
}

function _renderAttendanceGrid() {
  const professionFilter = $('#attendance-profession-filter')?.value;
  const projectId = $('#attendance-project-id')?.value;
  const activeWorkers = appState.workers.filter(w => w.status === 'active');
  const filteredWorkers = (professionFilter === 'all') ?
      activeWorkers :
      activeWorkers.filter(w => w.professionId === professionFilter);
  if (filteredWorkers.length === 0) {
      return `<p class="empty-state-small" style="grid-column: 1 / -1;">Tidak ada pekerja yang cocok.</p>`;
  }
  return filteredWorkers.map(worker => {
      const attendance = appState.attendance.get(worker.id);
      const profession = appState.professions.find(p => p.id === worker.professionId)?.professionName || 'Tanpa Profesi';
      const dailyWage = worker.projectWages?.[projectId] || 0;
      let statusHTML = '';
      const wageHTML = `<span class="worker-wage">${fmtIDR(dailyWage)} / hari</span>`;
      if (attendance) {
          const checkInTime = _getJSDate(attendance.checkIn).toLocaleTimeString('id-ID', {
              hour: '2-digit',
              minute: '2-digit'
          });
          const earnedPayHTML = attendance.totalPay?`<strong> (${fmtIDR(attendance.totalPay)})</strong>` : '';
          if (attendance.status === 'checked_in') {
              statusHTML = `
                      <div class="attendance-status checked-in">Masuk: ${checkInTime}</div>
                      ${isViewer()?'' : `<button class="btn btn-danger" data-action="check-out" data-id="${attendance.id}">Check Out</button>`}
                  `;
          } else { // completed
              const checkOutTime = _getJSDate(attendance.checkOut).toLocaleTimeString('id-ID', {
                  hour: '2-digit',
                  minute: '2-digit'
              });
              statusHTML = `
                      <div class="attendance-status">Masuk: ${checkInTime} | Keluar: ${checkOutTime}</div>
                      <div class="attendance-status completed">Total: ${attendance.workHours.toFixed(1)} jam ${earnedPayHTML}</div>
                      ${isViewer()?'' : `<button class="btn-icon" data-action="edit-attendance" data-id="${attendance.id}" title="Edit Waktu"><span class="material-symbols-outlined">edit_calendar</span></button>`}
                  `;
          }
      } else {
          statusHTML = isViewer()?'<div class="attendance-status">Belum Hadir</div>' : `<button class="btn btn-success" data-action="check-in" data-id="${worker.id}">Check In</button>`;
      }

      return `
              <div class="card attendance-card">
                  <div class="attendance-worker-info">
                      <strong>${worker.workerName}</strong>
                      <span>${profession}</span>
                      ${wageHTML}
                  </div>
                  <div class="attendance-actions">${statusHTML}</div>
              </div>`;
  }).join('');
}

async function _fetchTodaysAttendance() {
  appState.attendance.clear();
  const today = new Date();
  const startOfDay = new Date(today.setHours(0, 0, 0, 0));
  const endOfDay = new Date(today.setHours(23, 59, 59, 999));

  const q = query(attendanceRecordsCol,
      where('date', '>=', startOfDay),
      where('date', '<=', endOfDay)
  );
  const snap = await getDocs(q);
  snap.forEach(doc => {
      const data = doc.data();
      appState.attendance.set(data.workerId, {
          id: doc.id,
          ...data
      });
  });
}

async function handleCheckIn(workerId) {
  const projectId = $('#attendance-project-id')?.value;
  if (!projectId) {
      toast('error', 'Silakan pilih proyek terlebih dahulu.');
      return;
  }

  toast('syncing', 'Mencatat jam masuk lokal...');
  try {
      const worker = appState.workers.find(w => w.id === workerId);
      if (!worker) throw new Error('Pekerja tidak ditemukan');

      const dailyWage = worker.projectWages?.[projectId] || 0;
      const hourlyWage = dailyWage / 8;
      const now = new Date();
      const attendanceData = {
          workerId,
          projectId,
          workerName: worker.workerName,
          hourlyWage,
          date: now,
          checkIn: now,
          status: 'checked_in',
          type: 'timestamp',
          needsSync: 1,
          isPaid: false
      };

      if (!attendanceData.id) attendanceData.id = generateUUID();
      await localDB.attendance_records.add(attendanceData);

      _logActivity(`Check-in Pekerja (Lokal): ${worker.workerName}`, {
          workerId,
          projectId
      });
      toast('success', `${worker.workerName} berhasil check in.`);

      await loadAllLocalDataToState();
      _rerenderAttendanceList();

      syncToServer();
  } catch (error) {
      toast('error', 'Gagal melakukan check in.');
      console.error(error);
  }
}

async function handleCheckOut(recordLocalId) {
  toast('syncing', 'Mencatat jam keluar lokal...');
  try {
      const record = await localDB.attendance_records.get(Number(recordLocalId));
      if (!record) throw new Error('Data absensi tidak ditemukan di lokal');

      const now = new Date();
      const checkOutTime = now;
      const checkInTime = record.checkIn;

      const hours = (checkOutTime.getTime() - checkInTime.getTime()) / 3600000;
      const normalHours = Math.min(hours, 8);
      const overtimeHours = Math.max(0, hours - 8);

      const hourlyWage = record.hourlyWage || 0;
      const normalPay = normalHours * hourlyWage;
      const overtimePay = overtimeHours * hourlyWage * 1.5;
      const totalPay = normalPay + overtimePay;

      const dataToUpdate = {
          checkOut: checkOutTime,
          status: 'completed',
          workHours: hours,
          normalHours,
          overtimeHours,
          totalPay,
          needsSync: 1
      };

      await localDB.attendance_records.update(Number(recordLocalId), dataToUpdate);

      _logActivity(`Check-out Pekerja (Lokal): ${record.workerName}`, {
          recordId: record.id,
          totalPay
      });
      toast('success', `${record.workerName} berhasil check out.`);

      await loadAllLocalDataToState();
      _rerenderAttendanceList();

      syncToServer();
  } catch (error) {
      toast('error', 'Gagal melakukan check out.');
      console.error(error);
  }
}

function _getManualAttendanceHTML() {
    const today = new Date().toISOString().slice(0, 10);
    const projectOptions = appState.projects.map(p => ({
        value: p.id,
        text: p.projectName
    }));
    return `
            <form id="manual-attendance-form" data-async="true" method="POST" data-endpoint="/api/attendance/manual" data-success-msg="Absensi disimpan">
                <div class="card card-pad">
                    <div class="recap-filters">
                        <div class="form-group">
                            <label for="manual-attendance-date">Tanggal</label>
                            <input type="date" id="manual-attendance-date" value="${today}" required ${isViewer()?'disabled' : ''}>
                        </div>
                        ${createMasterDataSelect('manual-attendance-project', 'Proyek', projectOptions, appState.projects[0]?.id || '')}
                    </div>
                </div>
                <div id="manual-attendance-list-container" style="margin-top: 1.5rem;"></div>
                ${isViewer()?'' : `
                <div class="form-footer-actions" style="margin-top: 1rem;">
                    <button type="submit" class="btn btn-primary">Simpan Absensi</button>
                </div>`}
            </form>
        `;
  }

async function _renderManualAttendanceList(dateStr, projectId) {
  const container = $('#manual-attendance-list-container');
  if (!dateStr || !projectId) {
      container.innerHTML = _getEmptyStateHTML({ icon:'event', title:'Mulai dengan Memilih Tanggal', desc:'Pilih tanggal dan proyek untuk melihat rekapan.' });
      return;
  }
  container.innerHTML = `<div class="loader-container"><div class="spinner"></div></div>`;
  const date = new Date(dateStr);
  const startOfDay = new Date(date.setHours(0, 0, 0, 0));
  const endOfDay = new Date(date.setHours(23, 59, 59, 999));
  const q = query(attendanceRecordsCol,
      where('projectId', '==', projectId),
      where('date', '>=', startOfDay),
      where('date', '<=', endOfDay),
      where('type', '==', 'manual')
  );
  const snap = await getDocs(q);
  const existingRecords = new Map(snap.docs.map(d => [d.data().workerId, d.data()]));

  const activeWorkers = appState.workers.filter(w => w.status === 'active');
  if (activeWorkers.length === 0) {
      container.innerHTML = `<p class="empty-state">Tidak ada pekerja aktif.</p>`;
      return;
  }
  const listHTML = activeWorkers.map(worker => {
      const dailyWage = worker.projectWages?.[projectId] || 0;
      const existing = existingRecords.get(worker.id);
      const currentStatus = existing?.attendanceStatus || 'absent';
      let currentPay = 0;
      if (currentStatus === 'full_day') currentPay = dailyWage;
      else if (currentStatus === 'half_day') currentPay = dailyWage / 2;

      return `
              <div class="manual-attendance-item card" data-daily-wage="${dailyWage}">
                  <div class="worker-info">
                      <strong>${worker.workerName}</strong>
                      <span class="worker-wage" data-pay="${currentPay}">${fmtIDR(currentPay)}</span>
                  </div>
                  <div class="attendance-status-selector" data-worker-id="${worker.id}">
                      <label>
                          <input type="radio" name="status_${worker.id}" value="full_day" ${currentStatus === 'full_day'?'checked' : ''} ${isViewer()?'disabled' : ''}>
                          <span>Hadir</span>
                      </label>
                      <label>
                          <input type="radio" name="status_${worker.id}" value="half_day" ${currentStatus === 'half_day'?'checked' : ''} ${isViewer()?'disabled' : ''}>
                          <span>1/2 Hari</span>
                      </label>
                      <label>
                          <input type="radio" name="status_${worker.id}" value="absent" ${currentStatus === 'absent'?'checked' : ''} ${isViewer()?'disabled' : ''}>
                          <span>Absen</span>
                      </label>
                  </div>
              </div>
          `;
  }).join('');
  container.innerHTML = listHTML;
  if (!isViewer()) {
      container.querySelectorAll('.attendance-status-selector input[type="radio"]').forEach(radio => {
          radio.addEventListener('change', (e) => {
              const card = e.target.closest('.manual-attendance-item');
              const wageEl = card.querySelector('.worker-wage');
              const dailyWage = Number(card.dataset.dailyWage);
              let newPay = 0;
              if (e.target.value === 'full_day') newPay = dailyWage;
              else if (e.target.value === 'half_day') newPay = dailyWage / 2;

              wageEl.textContent = fmtIDR(newPay);
              wageEl.dataset.pay = newPay;
          });
      });
  }
}

async function handleDeleteSingleAttendance(recordId) {
  const record = appState.attendanceRecords.find(r => r.id === recordId);
  const worker = record?appState.workers.find(w => w.id === record.workerId) : null;
  const message = worker ?
      `Hapus absensi untuk <strong>${worker.workerName}</strong> pada tanggal ${_getJSDate(record.date).toLocaleDateString('id-ID')}?` :
      'Hapus data absensi ini?';
  createModal('confirmDelete', {
      message,
      onConfirm: async () => {
          toast('syncing', 'Menghapus absensi...');
          try {
              await deleteDoc(doc(attendanceRecordsCol, recordId));
              _logActivity('Menghapus Absensi', {
                  recordId,
                  workerName: worker?.workerName
              });
              toast('success', 'Absensi berhasil dihapus.');
              renderPageContent();
          } catch (error) {
              toast('error', 'Gagal menghapus absensi.');
              console.error(error);
          }
      }
  });
}

async function handleEditManualAttendanceModal(recordId) {
  const record = appState.attendanceRecords.find(r => r.id === recordId);
  if (!record) {
      toast('error', 'Data absensi tidak ditemukan.');
      return;
  }
  const worker = appState.workers.find(w => w.id === record.workerId);
  let content = '';
  const dateString = _getJSDate(record.date).toLocaleDateString('id-ID');

  if (record.type === 'manual') {
      content = `
              <form id="edit-attendance-form" data-id="${recordId}" data-type="manual" data-async="true" method="PUT" data-endpoint="/api/attendance/${recordId}" data-success-msg="Absensi diperbarui">
                  <p>Mengedit absensi untuk <strong>${worker?.workerName || 'N/A'}</strong> pada tanggal <strong>${dateString}</strong>.</p>
                  <div class="form-group">
                      <label>Status Kehadiran</label>
                      <div class="attendance-status-selector">
                          <label><input type="radio" name="status" value="full_day" ${record.attendanceStatus === 'full_day'?'checked' : ''}><span>Hadir</span></label>
                          <label><input type="radio" name="status" value="half_day" ${record.attendanceStatus === 'half_day'?'checked' : ''}><span>1/2 Hari</span></label>
                      </div>
                  </div>
                  <button type="submit" class="btn btn-primary">Simpan Perubahan</button>
              </form>`;
  } else {
      const checkInTime = _getJSDate(record.checkIn).toTimeString().slice(0, 5);
      const checkOutTime = record.checkOut?_getJSDate(record.checkOut).toTimeString().slice(0, 5) : '';
      content = `
              <form id="edit-attendance-form" data-id="${recordId}" data-type="timestamp" data-async="true" method="PUT" data-endpoint="/api/attendance/${recordId}" data-success-msg="Absensi diperbarui">
                  <p>Mengedit absensi untuk <strong>${worker?.workerName || 'N/A'}</strong> pada tanggal <strong>${dateString}</strong>.</p>
                  <div class="form-group"><label>Jam Masuk</label><input type="time" name="checkIn" value="${checkInTime}" required></div>
                  <div class="form-group"><label>Jam Keluar</label><input type="time" name="checkOut" value="${checkOutTime}"></div>
                  <button type="submit" class="btn btn-primary">Simpan Perubahan</button>
              </form>`;
  }

  createModal('editAttendance', {
      title: 'Edit Absensi',
      content
  });
}

async function handleUpdateAttendance(form) {
  const recordId = form.dataset.id;
  const recordType = form.dataset.type;

  const record = appState.attendanceRecords.find(r => r.id === recordId);
  if (!record) {
      toast('error', 'Data absensi asli tidak ditemukan.');
      return;
  }
  toast('syncing', 'Memperbarui absensi...');
  try {
      const dataToUpdate = {};
      if (recordType === 'manual') {
          const newStatus = form.elements.status.value;
          let newTotalPay = 0;
          if (newStatus === 'full_day') newTotalPay = record.dailyWage || 0;
          else if (newStatus === 'half_day') newTotalPay = (record.dailyWage || 0) / 2;

          dataToUpdate.attendanceStatus = newStatus;
          dataToUpdate.totalPay = newTotalPay;
      } else {
          const date = _getJSDate(record.date);
          const [inH, inM] = form.elements.checkIn.value.split(':');
          const newCheckIn = new Date(date);
          newCheckIn.setHours(inH, inM);

          dataToUpdate.checkIn = Timestamp.fromDate(newCheckIn);
          if (form.elements.checkOut.value) {
              const [outH, outM] = form.elements.checkOut.value.split(':');
              const newCheckOut = new Date(date);
              newCheckOut.setHours(outH, outM);
              const hours = (newCheckOut - newCheckIn) / 3600000;
              const normalHours = Math.min(hours, 8);
              const overtimeHours = Math.max(0, hours - 8);
              const normalPay = normalHours * (record.hourlyWage || 0);
              const overtimePay = overtimeHours * (record.hourlyWage || 0) * 1.5;
              dataToUpdate.checkOut = Timestamp.fromDate(newCheckOut);
              dataToUpdate.workHours = hours;
              dataToUpdate.totalPay = normalPay + overtimePay;
              dataToUpdate.status = 'completed';
          }
      }

      await optimisticUpdateDoc(attendanceRecordsCol, recordId, dataToUpdate);
      _logActivity('Mengedit Absensi', {
          recordId,
          ...dataToUpdate
      });
      toast('success', 'Absensi berhasil diperbarui.');
      renderPageContent();
  } catch (error) {
      toast('error', 'Gagal memperbarui absensi.');
      console.error(error);
  }
}

async function handleSaveManualAttendance(e) {
  e.preventDefault();
  const form = e.target;
  const dateStr = form.querySelector('#manual-attendance-date').value;
  const projectId = form.querySelector('#manual-attendance-project').value;

  const date = new Date(dateStr);
  if (!projectId) {
      toast('error', 'Proyek harus dipilih.');
      return;
  }
  toast('syncing', 'Menyimpan absensi lokal...');
  try {
      const workers = $$('.attendance-status-selector', form);

      await localDB.transaction('rw', localDB.attendance_records, async () => {
          for (const workerEl of workers) {
              const workerId = workerEl.dataset.workerId;
              const statusInput = workerEl.querySelector('input:checked');
              if (!statusInput) continue;

              const status = statusInput.value;
              const worker = appState.workers.find(w => w.id === workerId);
              const dailyWage = worker?.projectWages?.[projectId] || 0;
              let pay = 0;
              if (status === 'full_day') pay = dailyWage;
              if (status === 'half_day') pay = dailyWage / 2;
              const existingRecord = await localDB.attendance_records
                  .where({
                      workerId: workerId,
                      projectId: projectId,
                      type: 'manual'
                  })
                  .filter(rec => _getJSDate(rec?.date).toISOString().slice(0, 10) === dateStr)
                  .first();
              if (existingRecord) {
                  if (status === 'absent') {
                      await localDB.attendance_records.update(existingRecord.localId, {
                          isDeleted: 1,
                          needsSync: 1
                      });
                  } else {
                      await localDB.attendance_records.update(existingRecord.localId, {
                          attendanceStatus: status,
                          totalPay: pay,
                          needsSync: 1,
                          isDeleted: 0
                      });
                  }
              } else {
                  if (status !== 'absent') {
                      await localDB.attendance_records.add({
                          id: generateUUID(),
                          workerId,
                          workerName: worker.workerName,
                          projectId,
                          date,
                          attendanceStatus: status,
                          totalPay: pay,
                          dailyWage,
                          isPaid: false,
                          type: 'manual',
                          status: 'completed',
                          needsSync: 1,
                          isDeleted: 0,
                          createdAt: new Date()
                      });
                  }
              }
          }
      });
      _logActivity(`Menyimpan Absensi Manual (Lokal)`, {
          date: dateStr,
          projectId
      });

      toast('success', 'Absensi berhasil disimpan.');

      await loadAllLocalDataToState();
      _renderManualAttendanceList(dateStr, projectId);
      syncToServer();
  } catch (error) {
      toast('error', 'Gagal menyimpan absensi.');
      console.error(error);
  }
}