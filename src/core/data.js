import { getDocs, query, orderBy } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { appState } from './state.js';
import { toast } from '../ui/toast.js';
import { localDB } from '../db/dexie.js';
import { animateNumber } from '../utils/helpers.js';

export const fetchAndCacheData = async (key, col, order = 'createdAt') => {
    try {
        const snap = await getDocs(query(col, orderBy(order, 'desc')));
        appState[key] = snap.docs.map(d => ({
            id: d.id,
            ...d.data()
        }));
    } catch (e) {
        console.error(`Gagal memuat data untuk ${key}:`, e);
        appState[key] = appState[key] || []; // Jangan hapus data lama jika fetch gagal
        toast('error', `Gagal memuat data ${key}.`);
    }
};

export async function loadAllLocalDataToState() {
    console.log("Memuat data dari database lokal ke state...");
    try {
        const data = await localDB.transaction('r', localDB.tables, async () => {
            const results = {};
            const tablesToLoad = {
                projects: localDB.projects,
                suppliers: localDB.suppliers,
                workers: localDB.workers,
                materials: localDB.materials,
                staff: localDB.staff,
                professions: localDB.professions,
                operational_categories: localDB.operational_categories,
                material_categories: localDB.material_categories,
                other_categories: localDB.other_categories,
                funding_creditors: localDB.funding_creditors
            };
            for (const key in tablesToLoad) {
                results[key] = await tablesToLoad[key].toArray();
            }
            results.incomes = await localDB.incomes.where('isDeleted').notEqual(1).filter(item => !!item.date).toArray();
            results.fundingSources = await localDB.funding_sources.where('isDeleted').notEqual(1).filter(item => !!item.date).toArray();
            results.expenses = await localDB.expenses.where('isDeleted').notEqual(1).filter(item => !!item.date).toArray();
            results.bills = await localDB.bills.where('isDeleted').notEqual(1).filter(item => !!item.dueDate).toArray();
            results.attendanceRecords = await localDB.attendance_records.where('isDeleted').notEqual(1).filter(item => !!item.date).toArray();
            results.stockTransactions = await localDB.stock_transactions.where('isDeleted').notEqual(1).filter(item => !!item.date).toArray();
            return results;
        });
        Object.assign(appState, data);
        console.log("Data lokal berhasil dimuat.");
    } catch (error) {
        console.error("Gagal memuat data lokal:", error);
    }
}

export function _calculateAndCacheDashboardTotals() {
    console.log("Calculating dashboard totals from appState...");
    const mainProject = appState.projects.find(p => p.projectType === 'main_income');
    const internalProjects = appState.projects.filter(p => p.id !== mainProject?.id);

    const pendapatan = (appState.incomes || []).filter(i => i.projectId === mainProject?.id).reduce((sum, i) => sum + i.amount, 0);
    const hpp_material = (appState.expenses || []).filter(e => e.projectId === mainProject?.id && e.type === 'material').reduce((sum, e) => sum + e.amount, 0);

    let hpp_gaji = 0;
    let bebanGajiInternal = 0;
    const paidSalaryBills = (appState.bills || []).filter(b => b.type === 'gaji' && b.status === 'paid');
    const attendanceMap = new Map((appState.attendanceRecords || []).map(rec => [rec.id, rec]));

    paidSalaryBills.forEach(bill => {
        (bill.recordIds || []).forEach(recordId => {
            const record = attendanceMap.get(recordId);
            if (record) {
                if (record.projectId === mainProject?.id) {
                    hpp_gaji += record.totalPay || 0;
                } else {
                    bebanGajiInternal += record.totalPay || 0;
                }
            }
        });
    });

    const hpp_lainnya = (appState.expenses || []).filter(e => e.projectId === mainProject?.id && e.type === 'lainnya').reduce((sum, e) => sum + e.amount, 0);
    const hpp = hpp_material + hpp_gaji + hpp_lainnya;
    const labaKotor = pendapatan - hpp;
    const bebanOperasional = (appState.expenses || []).filter(e => e.projectId === mainProject?.id && e.type === 'operasional').reduce((sum, e) => sum + e.amount, 0);

    const bebanExpenseInternal = (appState.expenses || []).filter(e => internalProjects.some(p => p.id === e.projectId)).reduce((sum, e) => sum + e.amount, 0);
    const bebanInternal = bebanExpenseInternal + bebanGajiInternal;

    const labaBersih = labaKotor - bebanOperasional - bebanInternal;
    const totalUnpaid = (appState.bills || []).filter(b => b.status === 'unpaid').reduce((sum, b) => sum + (b.amount - (b.paidAmount || 0)), 0);

    appState.dashboardTotals.labaBersih = labaBersih;
    appState.dashboardTotals.totalUnpaid = totalUnpaid;

    console.log("Dashboard totals recalculated and cached:", appState.dashboardTotals);

    if (appState.activePage === 'dashboard') {
        const labaEl = document.querySelector('.dashboard-balance-card .value.positive');
        const unpaidEl = document.querySelector('.dashboard-balance-card .value.negative');
        if (labaEl) animateNumber(labaEl, labaBersih);
        if (unpaidEl) animateNumber(unpaidEl, totalUnpaid);
    }
}