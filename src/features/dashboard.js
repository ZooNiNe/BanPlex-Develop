import { appState } from '../core/state.js';
import { $, fmtIDR, animateNumber, _getJSDate } from '../utils/helpers.js';
import { fetchAndCacheData, _calculateAndCacheDashboardTotals } from '../core/data.js';
import { projectsCol, incomesCol, expensesCol, billsCol, attendanceRecordsCol } from '../config/firebase.js';
import { ALL_NAV_LINKS, BOTTOM_NAV_BY_ROLE } from '../config/constants.js';
import { _setActiveListeners } from '../core/sync.js';

// This function is specific to the dashboard, so it can live here.
const _renderSparklineChart = (canvasId, data, isPositiveGood) => {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;
    const ctx = canvas.getContext('2d');
    const positiveColor = 'rgba(34, 197, 94, 0.8)';
    const negativeColor = 'rgba(239, 68, 68, 0.8)';
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    const mainColor = isPositiveGood ? positiveColor : negativeColor;
    gradient.addColorStop(0, mainColor.replace('0.8', '0.2'));
    gradient.addColorStop(1, mainColor.replace('0.8', '0'));
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: Array(data.length).fill(''),
            datasets: [{
                data: data,
                borderColor: mainColor,
                borderWidth: 2,
                fill: true,
                backgroundColor: gradient,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            elements: { point: { radius: 0 } },
            scales: { x: { display: false }, y: { display: false } }
        }
    });
};

const _getDashboardTrendData = () => {
    const trends = {
        profit: Array(7).fill(0),
        bills: Array(7).fill(0)
    };
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        const dateString = date.toISOString().slice(0, 10);
        const dailyIncome = appState.incomes
            .filter(inc => _getJSDate(inc.date).toISOString().slice(0, 10) === dateString)
            .reduce((sum, inc) => sum + inc.amount, 0);
        const dailyExpense = appState.expenses
            .filter(exp => _getJSDate(exp.date).toISOString().slice(0, 10) === dateString)
            .reduce((sum, exp) => sum + exp.amount, 0);
        trends.profit[6 - i] = dailyIncome - dailyExpense;
        const dailyUnpaidBills = appState.bills
            .filter(b => b.status === 'unpaid' && _getJSDate(b.dueDate) <= date)
            .reduce((sum, b) => sum + (b.amount - (b.paidAmount || 0)), 0);
        trends.bills[6 - i] = dailyUnpaidBills;
    }
    return trends;
};

export async function renderDashboardPage() {
    const container = $('.page-container');

    await Promise.all([
        fetchAndCacheData('projects', projectsCol, 'projectName'),
        fetchAndCacheData('incomes', incomesCol),
        fetchAndCacheData('expenses', expensesCol),
        fetchAndCacheData('bills', billsCol),
        fetchAndCacheData('attendanceRecords', attendanceRecordsCol, 'date')
    ]);

    _calculateAndCacheDashboardTotals();
    const { labaBersih, totalUnpaid } = appState.dashboardTotals;

    const projectsWithBudget = appState.projects.filter(p => p.budget && p.budget > 0).map(p => {
        const actual = appState.expenses
            .filter(e => e.projectId === p.id)
            .reduce((sum, e) => sum + e.amount, 0);
        const remaining = p.budget - actual;
        const percentage = p.budget > 0 ? (actual / p.budget) * 100 : 0;
        return { ...p, actual, remaining, percentage };
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todaysExpenses = appState.expenses.filter(e => _getJSDate(e.date) >= today);
    const dailyRecap = todaysExpenses.reduce((recap, expense) => {
        const projectName = appState.projects.find(p => p.id === expense.projectId)?.projectName || 'Lainnya';
        if (!recap[projectName]) recap[projectName] = 0;
        recap[projectName] += expense.amount;
        return recap;
    }, {});

    const trendData = _getDashboardTrendData();

    const balanceCardsHTML = `
        <div class="dashboard-balance-grid">
            <div class="dashboard-balance-card clickable" data-action="navigate" data-nav="laporan">
                <span class="label">Estimasi Laba Bersih</span>
                <strong class="value positive">${fmtIDR(labaBersih)}</strong>
                <div class="sparkline-container">
                    <canvas id="profit-sparkline-chart"></canvas>
                </div>
            </div>
            <div class="dashboard-balance-card clickable" data-action="navigate" data-nav="tagihan">
                <span class="label">Tagihan Belum Lunas</span>
                <strong class="value negative">${fmtIDR(totalUnpaid)}</strong>
                <div class="sparkline-container">
                    <canvas id="bills-sparkline-chart"></canvas>
                </div>
            </div>
        </div>`;

    const projectBudgetHTML = `
        <h5 class="section-title-owner">Sisa Anggaran Proyek</h5>
        <div class="card card-pad">
            ${projectsWithBudget.length > 0 ? projectsWithBudget.map(p => `
                <div class="budget-item">
                    <div class="budget-info">
                        <span class="project-name">${p.projectName}</span>
                        <strong class="remaining-amount ${p.remaining < 0 ? 'negative' : ''}">${fmtIDR(p.remaining)}</strong>
                    </div>
                    <div class="progress-bar-container">
                        <div class="progress-bar" style="width: ${Math.min(p.percentage, 100)}%; background-image: ${p.percentage > 100 ? 'var(--grad-danger)' : 'var(--grad)'};"></div>
                    </div>
                    <div class="budget-details">
                        <span>Terpakai: ${fmtIDR(p.actual)}</span>
                        <span>Anggaran: ${fmtIDR(p.budget)}</span>
                    </div>
                </div>
            `).join('') : '<p class="empty-state-small">Tidak ada proyek dengan anggaran.</p>'}
        </div>`;

    const dailyRecapHTML = `
         <h5 class="section-title-owner">Rekap Pengeluaran Hari Ini</h5>
         <div class="card card-pad">
            ${Object.keys(dailyRecap).length > 0 ? Object.entries(dailyRecap).map(([projectName, total]) => `
                <div class="daily-recap-item">
                    <span>${projectName}</span>
                    <strong>${fmtIDR(total)}</strong>
                </div>
            `).join('') : '<p class="empty-state-small">Tidak ada pengeluaran hari ini.</p>'}
         </div>`;

    const bottomNavIds = (BOTTOM_NAV_BY_ROLE[appState.userRole] || []);
    const accessibleLinks = ALL_NAV_LINKS.filter(link =>
        link.id !== 'dashboard' &&
        link.roles.includes(appState.userRole) &&
        !bottomNavIds.includes(link.id)
    );
    const mainActionIds = ['tagihan', 'laporan', 'stok', 'pengeluaran'];
    const mainActions = [];
    const extraActions = [];
    accessibleLinks.forEach(link => { if (mainActionIds.includes(link.id)) mainActions.push(link); else extraActions.push(link); });
    mainActions.sort((a, b) => mainActionIds.indexOf(a.id) - mainActionIds.indexOf(b.id));

    const createActionItemHTML = (link, isExtra = false) => `
        <button class="dashboard-action-item ${isExtra ? 'action-item-extra' : ''}" data-action="navigate" data-nav="${link.id}">
            <div class="icon-wrapper"><span class="material-symbols-outlined">${link.icon}</span></div>
            <span class="label">${link.label}</span>
        </button>`;

    let quickActionsHTML = '';
    const totalActions = mainActions.length + extraActions.length;
    if (totalActions > 0) {
        const all = [...mainActions, ...extraActions];
        const centerClass = totalActions === 4 ? 'center-4' : totalActions === 3 ? 'center-3' : totalActions === 2 ? 'center-2' : '';
        quickActionsHTML = `
            <section class="quick-actions-section">
                <h5 class="section-title-owner">Aksi Cepat</h5>
                <div id="quick-actions-grid" class="dashboard-actions-grid ${centerClass}">
                    ${all.map(link => createActionItemHTML(link)).join('')}
                </div>
            </section>`;
    }

    container.innerHTML = balanceCardsHTML + quickActionsHTML + projectBudgetHTML + dailyRecapHTML;

    try {
        const values = container.querySelectorAll('.dashboard-balance-card .value');
        if (values[0]) animateNumber(values[0], labaBersih);
        if (values[1]) animateNumber(values[1], totalUnpaid);
    } catch(_) {}

    _renderSparklineChart('profit-sparkline-chart', trendData.profit, true);
    _renderSparklineChart('bills-sparkline-chart', trendData.bills, false);

    _setActiveListeners(['incomes', 'expenses', 'bills', 'attendance_records']);
}