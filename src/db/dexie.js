import Dexie from 'https://unpkg.com/dexie@4.0.7/dist/dexie.mjs';

export const localDB = new Dexie('BanPlexLocalDB');

localDB.version(65).stores({
    // Data Transaksi
    expenses: '&id, projectId, date, type, status, isDeleted, needsSync, attachmentNeedsSync',
    bills: '&id, expenseId, status, dueDate, type, isDeleted, needsSync',
    incomes: '&id, projectId, date, isDeleted, needsSync',
    funding_sources: '&id, creditorId, status, isDeleted, needsSync',
    attendance_records: '&id, workerId, date, isPaid, isDeleted, needsSync',
    stock_transactions: '&id, materialId, date, type, isDeleted, needsSync',
    comments: '&id, parentId, parentType, createdAt, isDeleted, needsSync, [parentId+parentType]',
    files: 'id',

    // Master Data
    projects: '&id, projectName',
    suppliers: '&id, supplierName',
    workers: '&id, workerName',
    materials: '&id, materialName',
    staff: '&id, staffName',
    professions: '&id, professionName',
    operational_categories: '&id, categoryName',
    material_categories: '&id, categoryName',
    other_categories: '&id, categoryName',
    funding_creditors: '&id, creditorId',

    // Antrean offline
    pending_payments: '++id, billId, workerId, date, [billId+workerId]',
    pending_logs: '++id, action, createdAt',
    pending_conflicts: '++id, table, docId'
});