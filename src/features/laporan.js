import { appState } from '../core/state.js';
import { $, $$ } from '../utils/helpers.js';
import { fetchAndCacheData } from '../core/data.js';
import { projectsCol, incomesCol, expensesCol, billsCol, attendanceRecordsCol, fundingSourcesCol, workersCol, suppliersCol, materialsCol, stockTransactionsCol, settingsDocRef } from '../config/firebase.js';
import { _setActiveListeners } from '../core/sync.js';
import { createModal } from '../ui/modals.js';
import { toast } from '../ui/toast.js';
import { getDoc, getDocs, query, where, orderBy } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { fmtIDR, _getJSDate, animateNumber } from '../utils/helpers.js';

// Placeholders
const updateBreadcrumbFromState = () => {};
const setBreadcrumb = () => {};
const _getEmptyStateHTML = () => {};
const handleNavigation = () => {};
const createMasterDataSelect = () => {};
const _initCustomSelects = () => {};
let interactiveReportChart = null;
const countUpObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const element = entry.target;
            const endValue = parseFloat(element.dataset.countupTo);

            animateNumber(element, endValue);

            observer.unobserve(element);
        }
    });
}, {
    threshold: 0.5
});


export async function renderLaporanPage() {
    const container = $('.page-container');
    updateBreadcrumbFromState();

    const filterStart = appState.reportFilter?.start || '';
    const filterEnd = appState.reportFilter?.end || '';

    const { incomeData, expenseData } = _getDailyFinancialDataForChart();
    const totalIncome = incomeData.reduce((a, b) => a + b, 0);
    const totalExpense = expenseData.reduce((a, b) => a + b, 0);

    container.innerHTML = `
        <div class="card card-pad" style="margin-bottom: 1rem;">
            <div class="report-filter">
                <div class="date-range-group">
                    <input type="date" id="report-start-date" value="${filterStart}">
                    <span>s.d.</span>
                    <input type="date" id="report-end-date" value="${filterEnd}">
                </div>
                <button class="btn btn-secondary" id="apply-report-filter">Terapkan</button>
                <button id="generate-detailed-report-btn" data-action="open-report-generator" class="btn btn-primary">
                    <span class="material-symbols-outlined">download_for_offline</span>
                    Unduh PDF
                </button>
            </div>
        </div>

        <section class="card card-pad" style="margin-bottom:1rem;">
            <h5 class="section-title-owner" style="margin-top:0;">Tren Pemasukan vs Pengeluaran</h5>
            <div class="chart-summary-grid">
                <div class="summary-stat-card">
                    <span class="label">Total Pemasukan (7 Hari)</span>
                    <strong class="value positive">${fmtIDR(totalIncome)}</strong>
                </div>
                <div class="summary-stat-card">
                    <span class="label">Total Pengeluaran (7 Hari)</span>
                    <strong class="value negative">${fmtIDR(totalExpense)}</strong>
                </div>
            </div>
            <div style="height: 250px; position: relative;"><canvas id="interactive-bar-chart"></canvas></div>
        </section>

        <div class="report-cards-grid">
            <div id="laba-rugi-card" class="report-card card card-pad"></div>
            <div id="analisis-beban-card" class="report-card card card-pad"></div>
            <div id="arus-kas-card" class="report-card card card-pad"></div>
        </div>
    `;

    setBreadcrumb(['Laporan']);

    await _renderLabaRugiCard($('#laba-rugi-card'));
    await _renderAnalisisBeban($('#analisis-beban-card'));
    await _renderLaporanArusKas($('#arus-kas-card'));

    _renderInteractiveBarChart();

    $('#apply-report-filter')?.addEventListener('click', () => {
        const s = $('#report-start-date')?.value || '';
        const e = $('#report-end-date')?.value || '';
        appState.reportFilter = { start: s, end: e };
        renderLaporanPage();
    });
    _setActiveListeners([]);
}

function _getDailyFinancialDataForChart() {
    const labels = [];
    const incomeData = Array(7).fill(0);
    const expenseData = Array(7).fill(0);
    const inRange = (d) => {
        const { start, end } = appState.reportFilter || {};
        const dt = _getJSDate(d);
        if (start && dt < new Date(start + 'T00:00:00')) return false;
        if (end && dt > new Date(end + 'T23:59:59')) return false;
        return true;
    };
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        labels.push(date.toLocaleDateString('id-ID', { weekday: 'short' }));
        const dateString = date.toISOString().slice(0, 10);
        (appState.incomes || []).forEach(income => {
            const d = _getJSDate(income.date);
            if (inRange(d) && d.toISOString().slice(0, 10) === dateString) {
                incomeData[6 - i] += income.amount || 0;
            }
        });
        (appState.expenses || []).forEach(expense => {
            const d = _getJSDate(expense.date);
            if (inRange(d) && d.toISOString().slice(0, 10) === dateString) {
                expenseData[6 - i] += expense.amount || 0;
            }
        });
    }
    return { labels, incomeData, expenseData };
}

async function _renderInteractiveBarChart() {
    const canvas = document.getElementById('interactive-bar-chart');
    if (!canvas) return;
    const { labels, incomeData, expenseData } = _getDailyFinancialDataForChart();
    if (interactiveReportChart) {
        interactiveReportChart.destroy();
    }
    const ctx = canvas.getContext('2d');
    interactiveReportChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'Pemasukan', data: incomeData, backgroundColor: 'rgba(34, 197, 94, 0.8)' },
                { label: 'Pengeluaran', data: expenseData, backgroundColor: 'rgba(239, 68, 68, 0.8)' }
            ]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { beginAtZero: true, ticks: { callback: v => fmtIDR(v) } },
                y: { grid: { display: false } }
            },
            plugins: { tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmtIDR(ctx.raw)}` } } },
            onClick: (event, elements) => {
                if (elements && elements.length > 0) {
                    const idx = elements[0].index;
                    const clickedDate = new Date();
                    clickedDate.setDate(clickedDate.getDate() - (6 - idx));
                    _showDailyTransactionDetailsModal(clickedDate);
                }
            }
        }
    });
}

function _showDailyTransactionDetailsModal(date) {
    const dateString = date.toISOString().slice(0, 10);
    const formattedDate = date.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    const dailyIncomes = (appState.incomes || []).filter(i => _getJSDate(i.date).toISOString().slice(0, 10) === dateString);
    const dailyExpenses = (appState.expenses || []).filter(e => _getJSDate(e.date).toISOString().slice(0, 10) === dateString);

    const createListHTML = (items, type) => {
        if (items.length === 0) return '';
        const listItemsHTML = items.map(item => {
            const title = item.description || (type === 'Pemasukan' ? 'Penerimaan Termin' : 'Pengeluaran Umum');
            const amountClass = type === 'Pemasukan' ? 'positive' : 'negative';
            return `
                <div class="dense-list-item">
                    <div class="item-main-content">
                        <strong class="item-title">${title}</strong>
                    </div>
                    <div class="item-actions">
                        <strong class="item-amount ${amountClass}">${fmtIDR(item.amount)}</strong>
                    </div>
                </div>
            `;
        }).join('');
        return `<h5 class="detail-section-title">${type}</h5><div class="dense-list-container">${listItemsHTML}</div>`;
    };

    const hasTransactions = dailyIncomes.length > 0 || dailyExpenses.length > 0;
    const emptyStateHTML = !hasTransactions ? _getEmptyStateHTML({ icon: 'receipt_long', title: 'Tidak Ada Transaksi', desc: 'Tidak ada pemasukan atau pengeluaran pada tanggal ini.' }) : '';

    const modalContent = `
        <div style="margin-top: -1rem;">
            ${createListHTML(dailyIncomes, 'Pemasukan')}
            ${createListHTML(dailyExpenses, 'Pengeluaran')}
            ${emptyStateHTML}
        </div>
    `;

    createModal('dataDetail', { title: `Rincian Transaksi - ${formattedDate}`, content: modalContent });
}

async function _renderLabaRugiCard(container) {
    if (!container) return;

    await Promise.all([
      fetchAndCacheData('projects', projectsCol),
      fetchAndCacheData('incomes', incomesCol),
      fetchAndCacheData('expenses', expensesCol),
      fetchAndCacheData('bills', billsCol),
      fetchAndCacheData('attendanceRecords', attendanceRecordsCol, 'date'),
      fetchAndCacheData('fundingSources', fundingSourcesCol)
    ]);

    const mainProject = appState.projects.find(p => p.projectType === 'main_income');
    const internalProjects = appState.projects.filter(p => p.id !== mainProject?.id);
    const inRange = (d) => { const { start, end } = appState.reportFilter || {}; const dt = _getJSDate(d); if (start && dt < new Date(start+'T00:00:00')) return false; if (end && dt > new Date(end+'T23:59:59')) return false; return true; };

    const pendapatan = (appState.incomes||[]).filter(i => i.projectId === mainProject?.id && inRange(i.date)).reduce((s,i)=>s+i.amount,0);
    const hpp_material = (appState.expenses||[]).filter(e => e.projectId === mainProject?.id && e.type==='material' && inRange(e.date)).reduce((s,e)=>s+e.amount,0);
    let hpp_gaji = 0, bebanGajiInternal = 0;
    const paidSalaryBills = (appState.bills||[]).filter(b => b.type==='gaji' && b.status==='paid');
    const attendanceMap = new Map((appState.attendanceRecords||[]).map(rec => [rec.id, rec]));
    paidSalaryBills.forEach(bill => { (bill.recordIds||[]).forEach(recordId => { const r = attendanceMap.get(recordId); if (r) { if (r.projectId === mainProject?.id) hpp_gaji += r.totalPay||0; else bebanGajiInternal += r.totalPay||0; } }); });
    const hpp_lainnya = (appState.expenses||[]).filter(e => e.projectId === mainProject?.id && e.type==='lainnya' && inRange(e.date)).reduce((s,e)=>s+e.amount,0);
    const hpp = hpp_material + hpp_gaji + hpp_lainnya;
    const bebanOperasional = (appState.expenses||[]).filter(e => e.projectId === mainProject?.id && e.type==='operasional' && inRange(e.date)).reduce((s,e)=>s+e.amount,0);
    const bebanExpenseInternal = (appState.expenses||[]).filter(e => internalProjects.some(p=>p.id===e.projectId) && inRange(e.date)).reduce((s,e)=>s+e.amount,0);
    const bebanInternal = bebanExpenseInternal + bebanGajiInternal;
    const labaKotor = pendapatan - hpp;

    let bebanBunga = 0;
    (appState.fundingSources || []).filter(s => s.interestType === 'interest' && inRange(s.date)).forEach(s => {
        const monthlyInterest = (s.totalAmount || 0) * ((s.rate || 0) / 100);
        const totalLoanInterest = monthlyInterest * (s.tenor || 0);
        bebanBunga += totalLoanInterest;
    });

    const labaBersih = labaKotor - bebanOperasional - bebanInternal - bebanBunga;

    container.innerHTML = `
    <h5 class="report-title">Laba Rugi</h5>
    <div class="report-card-content">
      <dl class="detail-list report-card-details">
        <div class="detail-list-item interactive" data-action="show-report-detail" data-type="income">
            <dt>Pendapatan</dt>
            <dd class="positive" data-countup-to="${pendapatan}">Rp 0</dd>
        </div>
        <div class="detail-list-item"><dt>HPP (Total)</dt><dd class="negative">- ${fmtIDR(hpp)}</dd></div>
        <div class="detail-list-item interactive sub-item" data-action="show-report-detail" data-type="expense" data-category="material"><dt>• Material</dt><dd class="negative">- ${fmtIDR(hpp_material)}</dd></div>
        <div class="detail-list-item interactive sub-item" data-action="show-report-detail" data-type="expense" data-category="gaji"><dt>• Gaji</dt><dd class="negative">- ${fmtIDR(hpp_gaji)}</dd></div>
        <div class="detail-list-item interactive sub-item" data-action="show-report-detail" data-type="expense" data-category="lainnya"><dt>• Lainnya</dt><dd class="negative">- ${fmtIDR(hpp_lainnya)}</dd></div>

        <div class="summary-row">
            <dt>Laba Kotor</dt>
            <dd data-countup-to="${labaKotor}">Rp 0</dd>
        </div>

        <div class="detail-list-item interactive" data-action="show-report-detail" data-type="expense" data-category="operasional"><dt>Beban Operasional</dt><dd class="negative">- ${fmtIDR(bebanOperasional)}</dd></div>
        <div class="detail-list-item"><dt>Beban Bunga (Periode Ini)</dt><dd class="negative">- ${fmtIDR(bebanBunga)}</dd></div>

        <div class="summary-row final">
            <dt>Laba Bersih</dt>
            <dd class="${labaBersih>=0?'positive':''}" data-countup-to="${labaBersih}">Rp 0</dd>
        </div>
      </dl>
      <div class="report-card-chart">
        <canvas id="laba-rugi-donut-chart"></canvas>
      </div>
    </div>
  `;
  _renderMiniDonut('laba-rugi-donut-chart', ['Material','Gaji','Lainnya', 'Bunga'], [hpp_material, hpp_gaji, hpp_lainnya, bebanBunga], ['#60a5fa','#f59e0b','#a78bfa', '#ef4444']);

  container.querySelectorAll('[data-countup-to]').forEach(el => countUpObserver.observe(el));
}

async function _renderAnalisisBeban(container) {
    if (!container) return;

    await Promise.all([
        fetchAndCacheData('projects', projectsCol),
        fetchAndCacheData('bills', billsCol),
        fetchAndCacheData('attendanceRecords', attendanceRecordsCol, 'date')
    ]);

    const totals = {
        main: { material: { paid: 0, unpaid: 0 }, operasional: { paid: 0, unpaid: 0 }, lainnya: { paid: 0, unpaid: 0 }, gaji: { paid: 0, unpaid: 0 } },
        internal: { material: { paid: 0, unpaid: 0 }, operasional: { paid: 0, unpaid: 0 }, lainnya: { paid: 0, unpaid: 0 }, gaji: { paid: 0, unpaid: 0 } }
    };
    const mainProject = appState.projects.find(p => p.projectType === 'main_income');
    const mainProjectId = mainProject?.id;
    const attendanceMap = new Map(appState.attendanceRecords.map(rec => [rec.id, rec]));

    appState.bills.forEach(bill => {
        if (bill.type === 'gaji') {
            (bill.recordIds || []).forEach(recordId => {
                const record = attendanceMap.get(recordId);
                if (record) {
                    const projectGroup = (record.projectId === mainProjectId) ? 'main' : 'internal';
                    const statusGroup = bill.status === 'paid' ? 'paid' : 'unpaid';
                    totals[projectGroup].gaji[statusGroup] += record.totalPay || 0;
                }
            });
        } else {
            const projectGroup = (bill.projectId === mainProjectId) ? 'main' : 'internal';
            if (totals[projectGroup] && totals[projectGroup][bill.type]) {
                if (bill.status === 'paid') totals[projectGroup][bill.type]['paid'] += (bill.amount || 0);
                else totals[projectGroup][bill.type]['unpaid'] += (bill.amount || 0);
            }
        }
    });

    const generateBebanRowsHTML = (data) => {
        const categories = [{ key: 'material', label: 'Beban Material' }, { key: 'gaji', label: 'Beban Gaji' }, { key: 'operasional', label: 'Beban Operasional' }, { key: 'lainnya', label: 'Beban Lainnya' }];
        return categories.map(cat => {
            const item = data[cat.key];
            const total = item.paid + item.unpaid;
            if (total === 0) return '';
            return `<div class="category-title"><dt>${cat.label}</dt><dd class="negative">- ${fmtIDR(total)}</dd></div><div class="sub-item"><dt>• Lunas</dt><dd>${fmtIDR(item.paid)}</dd></div><div class="sub-item"><dt>• Belum Lunas</dt><dd>${fmtIDR(item.unpaid)}</dd></div>`;
        }).join('');
    };

    const totalBebanMain = Object.values(totals.main).reduce((sum, cat) => sum + cat.paid + cat.unpaid, 0);
    const totalBebanInternal = Object.values(totals.internal).reduce((sum, cat) => sum + cat.paid + cat.unpaid, 0);

    container.innerHTML = `
    <h5 class="report-title">Analisis Beban Proyek</h5>
    <div class="report-card-content">
      <dl class="detail-list report-card-details">
          <div class="category-title"><dt>Beban Proyek Utama (${mainProject?.projectName || 'N/A'})</dt><dd></dd></div>
          ${generateBebanRowsHTML(totals.main)}
          <div class="summary-row">
              <dt>Total Beban Proyek Utama</dt>
              <dd class="negative" data-countup-to="${totalBebanMain}">- Rp 0</dd>
          </div>
          <div class="category-title"><dt>Beban Proyek Internal</dt><dd></dd></div>
          ${generateBebanRowsHTML(totals.internal)}
          <div class="summary-row">
              <dt>Total Beban Proyek Internal</dt>
              <dd class="negative" data-countup-to="${totalBebanInternal}">- Rp 0</dd>
          </div>
      </dl>
      <div class="report-card-chart">
        <canvas id="beban-utama-donut-chart"></canvas>
      </div>
    </div>
  `;
  _renderMiniDonut('beban-utama-donut-chart', ['Material', 'Gaji', 'Operasional', 'Lainnya'], [totals.main.material.paid + totals.main.material.unpaid, totals.main.gaji.paid + totals.main.gaji.unpaid, totals.main.operasional.paid + totals.main.operasional.unpaid, totals.main.lainnya.paid + totals.main.lainnya.unpaid], ['#60a5fa', '#f59e0b', '#34d399', '#a78bfa']);

  container.querySelectorAll('[data-countup-to]').forEach(el => countUpObserver.observe(el));
}

async function _renderLaporanArusKas(container) {
    if (!container) return;

    await Promise.all([
        fetchAndCacheData('incomes', incomesCol),
        fetchAndCacheData('bills', billsCol),
        fetchAndCacheData('fundingSources', fundingSourcesCol)
    ]);

    const inRange = (d) => {
        const { start, end } = appState.reportFilter || {};
        const dt = _getJSDate(d);
        if (start && dt < new Date(start + 'T00:00:00')) return false;
        if (end && dt > new Date(end + 'T23:59:59')) return false;
        return true;
    };

    const kasMasukTermin = (appState.incomes || []).filter(i => inRange(i.date)).reduce((sum, i) => sum + (i.amount || 0), 0);
    const kasMasukPinjaman = (appState.fundingSources || []).filter(f => inRange(f.date)).reduce((sum, f) => sum + (f.totalAmount || 0), 0);
    const totalKasMasuk = kasMasukTermin + kasMasukPinjaman;

    const paidBills = (appState.bills || []).filter(b => b.status === 'paid' && inRange(b.paidAt || b.dueDate));
    const kasKeluarMaterial = paidBills.filter(b => b.type === 'material').reduce((sum, b) => sum + (b.amount || 0), 0);
    const kasKeluarGaji = paidBills.filter(b => b.type === 'gaji').reduce((sum, b) => sum + (b.amount || 0), 0);
    const kasKeluarOperasional = paidBills.filter(b => b.type === 'operasional').reduce((sum, b) => sum + (b.amount || 0), 0);
    const kasKeluarLainnya = paidBills.filter(b => b.type === 'lainnya').reduce((sum, b) => sum + (b.amount || 0), 0);
    const totalKasKeluar = kasKeluarMaterial + kasKeluarGaji + kasKeluarOperasional + kasKeluarLainnya;
    const arusKasBersih = totalKasMasuk - totalKasKeluar;

    container.innerHTML = `
      <h5 class="report-title">Arus Kas</h5>
      <div class="report-card-content">
        <dl class="detail-list report-card-details">
          <div class="category-title"><dt>Arus Kas Masuk</dt><dd></dd></div>
          <div class="sub-item"><dt>• Penerimaan Termin</dt><dd class="positive">${fmtIDR(kasMasukTermin)}</dd></div>
          <div class="sub-item"><dt>• Penerimaan Pinjaman</dt><dd class="positive">${fmtIDR(kasMasukPinjaman)}</dd></div>
          <div class="summary-row">
              <dt>Total Arus Kas Masuk</dt>
              <dd class="positive" data-countup-to="${totalKasMasuk}">Rp 0</dd>
          </div>

          <div class="category-title"><dt>Arus Kas Keluar</dt><dd></dd></div>
          <div class="sub-item"><dt>• Pembayaran Material</dt><dd class="negative">- ${fmtIDR(kasKeluarMaterial)}</dd></div>
          <div class="sub-item"><dt>• Pembayaran Gaji</dt><dd class="negative">- ${fmtIDR(kasKeluarGaji)}</dd></div>
          <div class="sub-item"><dt>• Pembayaran Operasional</dt><dd class="negative">- ${fmtIDR(kasKeluarOperasional)}</dd></div>
          <div class="sub-item"><dt>• Pembayaran Lainnya</dt><dd class="negative">- ${fmtIDR(kasKeluarLainnya)}</dd></div>
          <div class="summary-row">
              <dt>Total Arus Kas Keluar</dt>
              <dd class="negative" data-countup-to="${totalKasKeluar}">- Rp 0</dd>
          </div>

          <div class="summary-row final">
              <dt>Arus Kas Bersih</dt>
              <dd class="${arusKasBersih >= 0 ? 'positive' : 'negative'}" data-countup-to="${arusKasBersih}">Rp 0</dd>
          </div>
        </dl>
        <div class="report-card-chart">
          <canvas id="arus-kas-donut-chart"></canvas>
        </div>
      </div>
    `;

    _renderMiniDonut('arus-kas-donut-chart', ['Pemasukan', 'Pengeluaran'], [totalKasMasuk, totalKasKeluar], ['#22c55e', '#ef4444']);

    container.querySelectorAll('[data-countup-to]').forEach(el => countUpObserver.observe(el));
  }

function _renderMiniDonut(canvasId, labels, data, colors) {
    const c = document.getElementById(canvasId);
    if (!c) return;

    if (c._chart) c._chart.destroy();

    c._chart = new Chart(c.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderWidth: 0,
                hoverOffset: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            onClick: (evt, elements) => {
                const chart = c._chart;
                if (!elements.length) return;

                const index = elements[0].index;
                const label = chart.data.labels[index];

                let type = 'expense';
                let category = label.toLowerCase();

                if (label.toLowerCase() === 'pemasukan') {
                    type = 'income';
                    category = null;
                } else if (label.toLowerCase() === 'pengeluaran') {
                    type = 'expense';
                    category = null;
                }

                _showChartDrillDownModal(label, type, category);
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    enabled: true,
                    callbacks: {
                        label: function(context) {
                            const total = context.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                            const label = context.label || '';
                            const value = context.raw || 0;
                            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                            return `${label}: ${percentage}%`;
                        }
                    }
                }
            }
        }
    });
}

function _showChartDrillDownModal(title, type, category) {
    const { start, end } = appState.reportFilter || {};
    const inRange = (d) => {
        const dt = _getJSDate(d);
        if (start && dt < new Date(start + 'T00:00:00')) return false;
        if (end && dt > new Date(end + 'T23:59:59')) return false;
        return true;
    };

    let items = [];
    if (type === 'income') {
        items = (appState.incomes || []).filter(i => inRange(i.date));
    } else if (type === 'expense') {
        if (category === 'gaji') {
            items = (appState.bills || []).filter(b => b.type === 'gaji' && inRange(b.dueDate || b.createdAt)).map(b => ({
                description: b.description || 'Gaji',
                date: b.dueDate || b.createdAt || new Date(),
                amount: b.amount || 0
            }));
        } else {
            items = (appState.expenses || []).filter(e => (!category || e.type === category) && inRange(e.date));
        }
    }

    const content = items.length ?
        `<div class="dense-list-container">${items.map(it => `
            <div class="dense-list-item">
                <div class="item-main-content">
                    <strong class="item-title">${it.description || (type==='income'?'Pemasukan':'Pengeluaran')}</strong>
                    <span class="item-subtitle">${_getJSDate(it.date).toLocaleDateString('id-ID')}</span>
                </div>
                <div class="item-actions"><strong class="${type==='income'?'positive':'negative'}">${fmtIDR(it.amount || it.totalAmount || 0)}</strong></div>
            </div>`).join('')}</div>`
        : _getEmptyStateHTML({ icon:'insights', title:'Tidak Ada Data', desc:'Tidak ada transaksi pada periode ini.' });

    createModal('dataDetail', { title: `Rincian: ${title}`, content });
}

async function handleGenerateReportModal() {
  const reportTypeOptions = [{
      value: '',
      text: '-- Pilih Jenis Laporan --'
  }, {
      value: 'analisis_beban',
      text: 'Laporan Analisis Beban (PDF)'
  }, {
      value: 'rekapan',
      text: 'Rekapan Transaksi (PDF)'
  }, {
      value: 'upah_pekerja',
      text: 'Laporan Rinci Upah Pekerja (PDF)'
  }, {
      value: 'material_supplier',
      text: 'Laporan Rinci Material (PDF)'
  }, {
      value: 'material_usage_per_project',
      text: 'Laporan Pemakaian Material per Proyek (PDF)'
  }];
  const content = `
          <form id="report-generator-form">
              ${createMasterDataSelect('report-type-selector', 'Jenis Laporan', reportTypeOptions, '')}
              <div id="report-dynamic-filters"></div>
              <div class="modal-footer" style="margin-top: 1.5rem;">
                  <button type="submit" class="btn btn-primary" disabled>
                      <span class="material-symbols-outlined">download</span> Unduh Laporan
                  </button>
              </div>
          </form>
      `;
  createModal('dataDetail', {
      title: 'Buat Laporan Rinci',
      content
  });
  _initCustomSelects($('#dataDetail-modal'));
  const form = $('#report-generator-form');
  const submitButton = form.querySelector('button[type="submit"]');
  $('#report-type-selector').addEventListener('change', (e) => {
      _renderDynamicReportFilters(e.target.value);
      submitButton.disabled = e.target.value === '';
  });
  form.addEventListener('submit', (e) => {
      e.preventDefault();
      const reportType = $('#report-type-selector').value;
      _handleDownloadReport('pdf', reportType);
  });
}
async function _renderDynamicReportFilters(reportType) {
  const container = $('#report-dynamic-filters');
  container.innerHTML = '';
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const todayStr = today.toISOString().slice(0, 10);
  let filtersHTML = '';
  if (reportType && reportType !== 'analisis_beban') {
      filtersHTML += `
              <div class="rekap-filters" style="padding:0; margin-top: 1rem;">
                  <div class="form-group"><label>Dari Tanggal</label><input type="date" id="report-start-date" value="${firstDayOfMonth}"></div>
                  <div class="form-group"><label>Sampai Tanggal</label><input type="date" id="report-end-date" value="${todayStr}"></div>
              </div>`;
  }
  if (reportType === 'rekapan') {
      await fetchAndCacheData('projects', projectsCol, 'projectName');
      const projectOptions = [{
          value: 'all',
          text: 'Semua Proyek'
      }, ...appState.projects.map(p => ({
          value: p.id,
          text: p.projectName
      }))];
      filtersHTML += createMasterDataSelect('report-project-id', 'Filter Proyek', projectOptions, 'all');
  } else if (reportType === 'material_supplier') {
      await fetchAndCacheData('suppliers', suppliersCol, 'supplierName');
      const supplierOptions = [{
          value: 'all',
          text: 'Semua Supplier'
      }, ...appState.suppliers.filter(s => s.category === 'Material').map(s => ({
          value: s.id,
          text: s.supplierName
      }))];
      filtersHTML += createMasterDataSelect('report-supplier-id', 'Filter Supplier', supplierOptions, 'all');
  } else if (reportType === 'material_usage_per_project') {
      await fetchAndCacheData('projects', projectsCol, 'projectName');
      const projectOptions = appState.projects.map(p => ({
          value: p.id,
          text: p.projectName
      }));
      projectOptions.unshift({
          value: '',
          text: '-- Pilih Proyek --'
      });
      filtersHTML += createMasterDataSelect('report-project-id', 'Pilih Proyek', projectOptions, '');
  }
  container.innerHTML = filtersHTML;
  _initCustomSelects(container);
}

async function _handleDownloadReport(format, reportType) {
  if (format === 'csv') {
      toast('info', 'Fitur unduh CSV sedang dalam pengembangan.');
      return;
  }
  let reportConfig = {};

  switch (reportType) {
      case 'analisis_beban':
          reportConfig = await _prepareAnalisisBebanDataForPdf();
          break;
      case 'upah_pekerja':
          reportConfig = await _prepareUpahPekerjaDataForPdf();
          break;
      case 'material_supplier':
          reportConfig = await _prepareMaterialSupplierDataForPdf();
          break;
      case 'rekapan':
          reportConfig = await _prepareRekapanDataForPdf();
          break;
      case 'material_usage_per_project':
          reportConfig = await _prepareMaterialUsageDataForPdf();
          break;
      default:
          toast('error', 'Tipe laporan ini belum didukung.');
          return;
  }

  if (reportConfig && reportConfig.sections && reportConfig.sections.length > 0) {
      await generatePdfReport(reportConfig);
  } else {
      toast('info', 'Tidak ada data untuk ditampilkan pada kriteria yang dipilih.');
  }
}

async function _prepareUpahPekerjaDataForPdf() {
  const startDate = new Date($('#report-start-date').value);
  const endDate = new Date($('#report-end-date').value);
  endDate.setHours(23, 59, 59, 999);
  await Promise.all([fetchAndCacheData('workers', workersCol, 'workerName'), fetchAndCacheData('projects', projectsCol, 'projectName')]);

  const q = query(attendanceRecordsCol, where('date', '>=', startDate), where('date', '<=', endDate), where('status', '==', 'completed'), orderBy('date', 'asc'));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const bodyRows = snap.docs.map(doc => {
      const rec = doc.data();
      const worker = appState.workers.find(w => w.id === rec.workerId);
      const project = appState.projects.find(p => p.id === rec.projectId);
      let statusText = (rec.attendanceStatus === 'full_day')?'Hadir' : '1/2 Hari';

      return [_getJSDate(rec?.date).toLocaleDateString('id-ID'), worker?.workerName || 'N/A', project?.projectName || 'N/A', statusText, fmtIDR(rec.totalPay || 0), rec.isPaid?'Lunas' : 'Belum Dibayar'];
  });
  return {
      title: 'Laporan Rincian Upah Pekerja',
      subtitle: `Periode: ${startDate.toLocaleDateString('id-ID')} s/d ${endDate.toLocaleDateString('id-ID')}`,
      filename: `Laporan-Upah-${new Date().toISOString().slice(0, 10)}.pdf`,
      sections: [{
          headers: ["Tanggal", "Pekerja", "Proyek", "Status", "Upah", "Status Bayar"],
          body: bodyRows
      }]
  };
}
async function _prepareMaterialSupplierDataForPdf() {
  const startDate = new Date($('#report-start-date').value);
  const endDate = new Date($('#report-end-date').value);
  const supplierId = $('#report-supplier-id').value;
  endDate.setHours(23, 59, 59, 999);

  await Promise.all([fetchAndCacheData('suppliers', suppliersCol, 'supplierName'), fetchAndCacheData('projects', projectsCol, 'projectName')]);
  let queryConstraints = [where('type', '==', 'material'), where('date', '>=', startDate), where('date', '<=', endDate), orderBy('date', 'asc')];
  if (supplierId !== 'all') queryConstraints.push(where('supplierId', '==', supplierId));

  const q = query(expensesCol, ...queryConstraints);
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const bodyRows = snap.docs.flatMap(doc => {
      const exp = doc.data();
      if (!exp.items || exp.items.length === 0) return [];

      const supplier = appState.suppliers.find(s => s.id === exp.supplierId);
      const project = appState.projects.find(p => p.id === exp.projectId);
      return exp.items.map(item => {
          const material = appState.materials.find(m => m.id === item.materialId);
          return [_getJSDate(exp.date).toLocaleDateString('id-ID'), supplier?.supplierName || 'N/A', project?.projectName || 'N/A', material?.materialName || 'N/A', item.qty, fmtIDR(item.price), fmtIDR(item.total)];
      });
  });
  if (bodyRows.length === 0) return null;
  const supplierName = supplierId !== 'all'?appState.suppliers.find(s => s.id === supplierId)?.supplierName : 'Semua Supplier';
  return {
      title: 'Laporan Rincian Material per Supplier',
      subtitle: `Supplier: ${supplierName} | Periode: ${startDate.toLocaleDateString('id-ID')} s/d ${endDate.toLocaleDateString('id-ID')}`,
      filename: `Laporan-Material-${new Date().toISOString().slice(0, 10)}.pdf`,
      sections: [{
          headers: ["Tanggal", "Supplier", "Proyek", "Barang", "Qty", "Harga", "Total"],
          body: bodyRows
      }]
  };
}
async function _prepareRekapanDataForPdf() {
  const startDate = new Date($('#report-start-date').value);
  const endDate = new Date($('#report-end-date').value);
  const projectId = $('#report-project-id').value;
  endDate.setHours(23, 59, 59, 999);

  await Promise.all([fetchAndCacheData('incomes', incomesCol), fetchAndCacheData('expenses', expensesCol)]);

  let transactions = [];
  appState.incomes.forEach(i => transactions.push({
      date: _getJSDate(i.date),
      type: 'Pemasukan',
      description: 'Penerimaan Termin',
      amount: i.amount,
      projectId: i.projectId
  }));
  appState.expenses.forEach(e => transactions.push({
      date: _getJSDate(e.date),
      type: 'Pengeluaran',
      description: e.description,
      amount: -e.amount,
      projectId: e.projectId
  }));

  const filtered = transactions.filter(t => (projectId === 'all' || t.projectId === projectId) && (t.date >= startDate && t.date <= endDate)).sort((a, b) => a.date - b.date);
  if (filtered.length === 0) return null;
  let balance = 0;
  const bodyRows = filtered.map(t => {
      balance += t.amount;
      return [t.date.toLocaleDateString('id-ID'), t.description, t.amount > 0?fmtIDR(t.amount) : '-', t.amount < 0?fmtIDR(t.amount) : '-', fmtIDR(balance)];
  });
  const totalPemasukan = filtered.filter(t => t.amount > 0).reduce((sum, t) => sum + t.amount, 0);
  const totalPengeluaran = filtered.filter(t => t.amount < 0).reduce((sum, t) => sum + t.amount, 0);
  const footRow = ["Total", "", fmtIDR(totalPemasukan), fmtIDR(totalPengeluaran), fmtIDR(balance)];
  const projectName = projectId !== 'all'?appState.projects.find(p => p.id === projectId)?.projectName : 'Semua Proyek';
  return {
      title: 'Laporan Rekapan Transaksi',
      subtitle: `Proyek: ${projectName} | Periode: ${startDate.toLocaleDateString('id-ID')} s/d ${endDate.toLocaleDateString('id-ID')}`,
      filename: `Rekapan-${new Date().toISOString().slice(0, 10)}.pdf`,
      sections: [{
          headers: ["Tanggal", "Deskripsi", "Pemasukan", "Pengeluaran", "Saldo"],
          body: bodyRows,
          foot: footRow
      }]
  };
}
async function _prepareMaterialUsageDataForPdf() {
  const projectId = $('#report-project-id').value;
  if (!projectId) {
      toast('error', 'Silakan pilih proyek terlebih dahulu.');
      return null;
  }
  const q = query(stockTransactionsCol, where("type", "==", "out"), where("projectId", "==", projectId));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const usageByMaterial = snap.docs.reduce((acc, doc) => {
      const trans = doc.data();
      if (!acc[trans.materialId]) {
          acc[trans.materialId] = {
              quantity: 0,
              ...appState.materials.find(m => m.id === trans.materialId)
          };
      }
      acc[trans.materialId].quantity += trans.quantity;
      return acc;
  }, {});
  const bodyRows = Object.values(usageByMaterial).map(item => {
      return [item.materialName, item.unit, item.quantity];
  });
  const projectName = appState.projects.find(p => p.id === projectId)?.projectName || 'N/A';
  return {
      title: 'Laporan Pemakaian Material per Proyek',
      subtitle: `Proyek: ${projectName}`,
      filename: `Pemakaian-Material-${projectName.replace(/\s+/g, '-')}.pdf`,
      sections: [{
          headers: ["Nama Material", "Satuan", "Total Pemakaian"],
          body: bodyRows
      }]
  };
}
async function _prepareAnalisisBebanDataForPdf() {
  await Promise.all([fetchAndCacheData('projects', projectsCol), fetchAndCacheData('bills', billsCol)]);
  const totals = {
      main: {
          material: {
              paid: 0,
              unpaid: 0
          },
          operasional: {
              paid: 0,
              unpaid: 0
          },
          lainnya: {
              paid: 0,
              unpaid: 0
          },
          gaji: {
              paid: 0,
              unpaid: 0
          }
      },
      internal: {
          material: {
              paid: 0,
              unpaid: 0
          },
          operasional: {
              paid: 0,
              unpaid: 0
          },
          lainnya: {
              paid: 0,
              unpaid: 0
          },
          gaji: {
              paid: 0,
              unpaid: 0
          }
      }
  };
  const mainProject = appState.projects.find(p => p.projectType === 'main_income');
  const mainProjectId = mainProject?mainProject.id : null;
  appState.bills.forEach(bill => {
      const projectGroup = (bill.projectId === mainProjectId)?'main' : 'internal';
      if (totals[projectGroup] && totals[projectGroup][bill.type]) {
          totals[projectGroup][bill.type][bill.status] += (bill.amount || 0);
      }
  });
  const sections = [];
  const categories = [{
      key: 'material',
      label: 'Beban Material'
  }, {
      key: 'gaji',
      label: 'Beban Gaji'
  }, {
      key: 'operasional',
      label: 'Beban Operasional'
  }, {
      key: 'lainnya',
      label: 'Beban Lainnya'
  }];
  const mainProjectBody = categories.map(cat => {
      const data = totals.main[cat.key];
      const total = data.paid + data.unpaid;
      return [cat.label, fmtIDR(data.paid), fmtIDR(data.unpaid), fmtIDR(total)];
  }).filter(row => parseFormattedNumber(row[3]) > 0);
  const totalBebanMain = Object.values(totals.main).reduce((sum, cat) => sum + cat.paid + cat.unpaid, 0);
  if (mainProjectBody.length > 0) {
      sections.push({
          sectionTitle: `Proyek Utama (${mainProject?.projectName || 'N/A'})`,
          headers: ["Kategori Beban", "Lunas", "Belum Lunas", "Total"],
          body: mainProjectBody,
          foot: ["Total Beban Proyek Utama", "", "", fmtIDR(totalBebanMain)]
      });
  }
  const internalProjectBody = categories.map(cat => {
      const data = totals.internal[cat.key];
      const total = data.paid + data.unpaid;
      return [cat.label, fmtIDR(data.paid), fmtIDR(data.unpaid), fmtIDR(total)];
  }).filter(row => parseFormattedNumber(row[3]) > 0);
  const totalBebanInternal = Object.values(totals.internal).reduce((sum, cat) => sum + cat.paid + cat.unpaid, 0);
  if (internalProjectBody.length > 0) {
      sections.push({
          sectionTitle: `Total Semua Proyek Internal`,
          headers: ["Kategori Beban", "Lunas", "Belum Lunas", "Total"],
          body: internalProjectBody,
          foot: ["Total Beban Proyek Internal", "", "", fmtIDR(totalBebanInternal)]
      });
  }

  const grandTotalBeban = totalBebanMain + totalBebanInternal;
  sections.push({
      sectionTitle: `Ringkasan Total`,
      headers: ["Deskripsi", "Jumlah"],
      body: [
          ['Total Beban Proyek Utama', fmtIDR(totalBebanMain)],
          ['Total Beban Proyek Internal', fmtIDR(totalBebanInternal)],
      ],
      foot: ["Grand Total Semua Beban", fmtIDR(grandTotalBeban)]
  });
  return {
      title: 'Laporan Analisis Beban',
      subtitle: `Ringkasan Total Keseluruhan`,
      filename: `Analisis-Beban-${new Date().toISOString().slice(0, 10)}.pdf`,
      sections: sections
  };
}
async function generatePdfReport(config) {
  const {
      title,
      subtitle,
      filename,
      sections
  } = config;

  if (!sections || sections.length === 0) {
      toast('error', 'Data tidak lengkap untuk PDF.');
      return;
  }

  toast('syncing', 'Membuat laporan PDF...');
  try {
      if (!appState.pdfSettings) {
          const docSnap = await getDoc(settingsDocRef);
          if (docSnap.exists()) {
              appState.pdfSettings = docSnap.data();
          } else {
              appState.pdfSettings = {};
          }
      }

      const defaults = {
          companyName: 'CV. ALAM BERKAH ABADI',
          headerColor: '#26a69a'
      };
      const settings = { ...defaults,
          ...appState.pdfSettings
      };

      const {
          jsPDF
      } = window.jspdf;
      const pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4'
      });
      const totalPagesExp = '{total_pages_count_string}';
      let lastY = 0;
      const pageWidth = pdf.internal.pageSize.width;

      const hexToRgb = (hex) => {
          const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
          return result?[parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)] : [38, 166, 154];
      };
      const headerRgbColor = hexToRgb(settings.headerColor);

      if (logoData && logoData.startsWith('data:image')) {
          pdf.addImage(logoData, 'PNG', 14, 12, 22, 22);
      }

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(14);
      pdf.setTextColor(44, 62, 80);
      pdf.text(settings.companyName, 40, 18);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.text(title, 40, 24);
      if (subtitle) {
          pdf.setFontSize(9);
          pdf.setTextColor(100, 100, 100);
          pdf.text(subtitle, 40, 29);
      }
      pdf.setDrawColor(220, 220, 220);
      pdf.line(14, 38, pageWidth - 14, 38);
      lastY = 45;

      const didDrawPage = (data) => {
          pdf.setFontSize(8);
          pdf.setTextColor(150, 150, 150);
          pdf.text(`Halaman ${data.pageNumber} dari ${totalPagesExp}`, 14, pdf.internal.pageSize.height - 10);
          const reportDate = new Date().toLocaleString('id-ID', {
              dateStyle: 'long',
              timeStyle: 'short'
          });
          pdf.text(`Dicetak: ${reportDate}`, pageWidth - 14, pdf.internal.pageSize.height - 10, {
              align: 'right'
          });
      };

      const tableConfig = {
          theme: 'grid',
          headStyles: {
              fillColor: headerRgbColor,
              textColor: 255,
              fontStyle: 'bold'
          },
          footStyles: {
              fillColor: [41, 128, 185],
              textColor: 255,
              fontStyle: 'bold'
          },
          alternateRowStyles: {
              fillColor: [245, 245, 245]
          },
          styles: {
              fontSize: 8,
              cellPadding: 2.5,
              valign: 'middle'
          },
      };

      sections.forEach((section, index) => {
          if (section.sectionTitle) {
              if (index > 0) lastY += 10;
              pdf.setFontSize(11).setFont(undefined, 'bold');
              pdf.setTextColor(44, 62, 80);
              pdf.text(section.sectionTitle, 14, lastY);
              lastY += 5;
          }
          pdf.autoTable({
              ...tableConfig,
              head: [section.headers],
              body: section.body,
              foot: section.foot?[section.foot] : [],
              startY: lastY,
              didDrawPage: didDrawPage,
              margin: {
                  top: 40
              }
          });
          lastY = pdf.autoTable.previous.finalY;
      });

      if (typeof pdf.putTotalPages === 'function') {
          pdf.putTotalPages(totalPagesExp);
      }

      pdf.save(filename);
      toast('success', 'PDF berhasil dibuat!');
  } catch (error) {
      console.error("Gagal membuat PDF:", error);
      toast('error', 'Terjadi kesalahan saat membuat PDF.');
  }
}