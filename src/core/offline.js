import { localDB } from '../db/dexie.js';
import { createModal, closeModal } from '../ui/modals.js';
import { toast } from '../ui/toast.js';
import { $, $$ } from '../utils/helpers.js';
import { expensesCol, billsCol, incomesCol, fundingSourcesCol, attendanceRecordsCol, stockTransactionsCol } from '../config/firebase.js';
import { doc, runTransaction, getDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js';
import { updateSyncIndicator } from './sync.js'; // To be created

async function _enforceLocalFileStorageLimit(maxBytes = 50 * 1024 * 1024, maxFiles = 300) {
    try {
        const files = await localDB.files.toArray();
        let totalBytes = 0;
        files.forEach(f => {
            totalBytes += (f.size || (f.file && f.file.size) || 0);
        });
        if (files.length <= maxFiles && totalBytes <= maxBytes) return;
        const sorted = files.slice().sort((a, b) => new Date(a.addedAt || 0) - new Date(b.addedAt || 0));
        while ((sorted.length > maxFiles) || (totalBytes > maxBytes)) {
            const oldest = sorted.shift();
            totalBytes -= (oldest.size || (oldest.file && oldest.file.size) || 0);
            await localDB.files.delete(oldest.id);
        }
    } catch (e) {
        console.warn('Gagal menegakkan batas storage lokal:', e);
    }
}

export async function handleOpenConflictsPanel() {
    const conflicts = await localDB.pending_conflicts.toArray();
    const itemsHTML = conflicts.length === 0?'<p class="empty-state-small">Tidak ada konflik yang tertunda.</p>' : conflicts.map(c => {
        const when = new Date(c.when || Date.now()).toLocaleString('id-ID');
        return `
            <div class="dense-list-item" data-id="${c.id}">
                <div class="item-main-content">
                    <strong class="item-title">${c.table} / ${c.docId}</strong>
                    <span class="item-subtitle">Rev Lokal: ${c.baseRev || 0} | Rev Server: ${c.serverRev || 0} | ${when}</span>
                </div>
                <div class="item-actions">
                    <button class="btn btn-sm btn-primary" data-action="apply-conflict" data-conflict-id="${c.id}">Pakai Data Lokal</button>
                    <button class="btn btn-sm btn-secondary" data-action="discard-conflict" data-conflict-id="${c.id}">Pakai Data Server</button>
                </div>
            </div>`;
    }).join('');
    const content = `<div class="dense-list-container">${itemsHTML}</div>`;
    createModal('dataDetail', {
        title: 'Konflik Sinkron',
        content
    });
}

export async function resolveConflict(conflictId, useLocal) {
    try {
        const c = await localDB.pending_conflicts.get(Number(conflictId));
        if (!c) return;
        const colMap = {
            expenses: expensesCol,
            bills: billsCol,
            incomes: incomesCol,
            funding_sources: fundingSourcesCol,
            attendance_records: attendanceRecordsCol,
            stock_transactions: stockTransactionsCol,
        };
        const dexieTable = localDB[c.table];
        const col = colMap[c.table];
        const ref = doc(col, c.docId);
        if (useLocal) {
            await runTransaction(db, async (transaction) => {
                const snap = await transaction.get(ref);
                const nextRev = (snap.exists()?(snap.data().rev || 0) : 0) + 1;
                const data = { ...(c.payload || {}),
                    id: c.docId,
                    rev: nextRev,
                    updatedAt: serverTimestamp()
                };
                if (snap.exists()) transaction.update(ref, data);
                else transaction.set(ref, data);
            });
            if (dexieTable && c.localId != null) await dexieTable.update(c.localId, {
                needsSync: 0
            });
        } else {
            const snap = await getDoc(ref);
            if (snap.exists()) {
                if (dexieTable && c.localId != null) {
                    await dexieTable.update(c.localId, { ...snap.data(),
                        serverRev: (snap.data().rev || 0),
                        needsSync: 0
                    });
                }
            }
        }
        await localDB.pending_conflicts.delete(c.id);
        toast('success', 'Konflik berhasil diproses.');
        closeModal($('#dataDetail-modal'));
    } catch (e) {
        console.error('Gagal memproses konflik:', e);
        toast('error', 'Gagal memproses konflik.');
    }
}

export async function handleOpenStorageStats() {
    try {
        const files = await localDB.files.toArray();
        const counts = await getPendingSyncCounts();
        const totalBytes = files.reduce((s, f) => s + (f.size || (f.file && f.file.size) || 0), 0);
        const toMB = (b) => (b / 1024 / 1024).toFixed(2) + ' MB';
        const statsHTML = `
                <div class="card card-pad">
                    <h5>Statistik Storage Offline</h5>
                    <div class="stats-grid">
                        <div><span class="label">Jumlah File</span><strong>${files.length}</strong></div>
                        <div><span class="label">Total Ukuran</span><strong>${toMB(totalBytes)}</strong></div>
                        <div><span class="label">Antrian Sync</span><strong>${counts.total} item</strong></div>
                        <div><span class="label">Konflik</span><strong>${counts.qConf}</strong></div>
                    </div>
                    <div class="storage-actions" style="margin-top:1rem;display:flex;gap:.5rem;">
                        <button class="btn btn-secondary" data-action="evict-storage">Bersihkan Sekarang</button>
                    </div>
                </div>`;
        const modal = createModal('dataDetail', {
            title: 'Statistik Storage',
            content: statsHTML
        });
        if (modal) {
            $('[data-action="evict-storage"]', modal)?.addEventListener('click', async () => {
                await _enforceLocalFileStorageLimit();
                toast('success', 'Pembersihan selesai.');
                closeModal(modal);
            });
        }
    } catch (e) {
        console.error('Gagal membuka statistik storage:', e);
        toast('error', 'Gagal memuat statistik storage.');
    }
}

async function _collectPendingItems() {
    const tables = ['expenses','bills','incomes','funding_sources','attendance_records','stock_transactions'];
    const results = [];
    for (const t of tables) {
        try {
            const items = await localDB[t].where('needsSync').equals(1).toArray();
            for (const it of items) {
                results.push({
                    group: 'table', table: t, localId: it.localId, id: it.id,
                    label: it.description || it.projectName || it.workerName || it.materialName || it.type || t,
                    extra: (it.amount != null?`Rp ${Number(it.amount).toLocaleString('id-ID')}`:'')
                });
            }
        } catch (_) {}
    }
    try {
        const pp = await localDB.pending_payments.toArray();
        pp.forEach(p => results.push({ group: 'pending_payments', id: p.id, label: p.workerName || p.billId || 'Pembayaran Tertunda', extra: p.amount != null?`Rp ${Number(p.amount).toLocaleString('id-ID')}`:'' }));
    } catch (_) {}
    try {
        const pl = await localDB.pending_logs.toArray();
        pl.forEach(l => results.push({ group: 'pending_logs', id: l.id, label: l.action || 'Log Offline', extra: '' }));
    } catch (_) {}
    try {
        const pc = await localDB.pending_conflicts.toArray();
        pc.forEach(c => results.push({ group: 'pending_conflicts', id: c.id, label: `Konflik ${c.table}:${c.docId}`, extra: '' }));
    } catch (_) {}
    return results;
}

export async function handleOpenSyncQueueModal() {
    try {
        const items = await _collectPendingItems();
        const count = items.length;
        const listHTML = count > 0 ? items.map(i => `
            <div class="dense-list-item" data-group="${i.group}" ${i.table?`data-table="${i.table}"`:''} ${i.localId!=null?`data-local-id="${i.localId}"`:''} data-id="${i.id}">
                <div class="dense-list-left">
                    <span class="material-symbols-outlined">pending</span>
                </div>
                <div class="dense-list-content">
                    <div class="title">${i.label}</div>
                    ${i.extra?`<div class="subtitle">${i.extra}</div>`:''}
                </div>
                <div class="dense-list-actions">
                    <button class="btn-icon" title="Sinkronkan" data-action="sync-item" data-group="${i.group}" ${i.table?`data-table="${i.table}"`:''} ${i.localId!=null?`data-local-id="${i.localId}"`:''} data-id="${i.id}"><span class="material-symbols-outlined">sync</span></button>
                    <button class="btn-icon btn-icon-danger" title="Hapus" data-action="delete-pending-item" data-group="${i.group}" ${i.table?`data-table="${i.table}"`:''} ${i.localId!=null?`data-local-id="${i.localId}"`:''} data-id="${i.id}"><span class="material-symbols-outlined">delete</span></button>
                </div>
            </div>
        `).join('') : '<p class="empty-state-small">Tidak ada data tertunda.</p>';

        const content = `
            <div class="card card-pad">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:.5rem;">
                    <div><strong>${count}</strong> item menunggu sinkronisasi</div>
                    ${count>0?`<button class="btn btn-primary" data-action="sync-all-pending"><span class="material-symbols-outlined">sync</span> Sinkron Semua</button>`:''}
                </div>
            </div>
            <div class="list dense-list" style="margin-top:.75rem;">
                ${listHTML}
            </div>
        `;
        createModal('dataDetail', { title: 'Antrean Sinkronisasi', content });
    } catch (e) {
        console.error('Gagal membuka antrean sinkron:', e);
        toast('error', 'Gagal memuat antrean sinkron.');
    }
}

export async function handleDeletePendingItem(ds) {
    try {
        const group = ds.group;
        if (!group) return;
        if (group === 'table') {
            const table = ds.table;
            const localId = Number(ds.localId);
            if (table && !Number.isNaN(localId)) {
                await localDB[table].delete(localId);
            }
        } else if (group === 'pending_payments') {
            await localDB.pending_payments.delete(Number(ds.id));
        } else if (group === 'pending_logs') {
            await localDB.pending_logs.delete(Number(ds.id));
        } else if (group === 'pending_conflicts') {
            await localDB.pending_conflicts.delete(Number(ds.id));
        }
        toast('success', 'Item dihapus dari antrean.');
        updateSyncIndicator();
        const modal = $('#dataDetail-modal');
        if (modal) {
            closeModal(modal);
            handleOpenSyncQueueModal();
        }
    } catch (e) {
        console.error('Gagal menghapus item antrean:', e);
        toast('error', 'Gagal menghapus item.');
    }
}