import { getDocs, query, where, writeBatch, runTransaction, doc, serverTimestamp, updateDoc, onSnapshot, collection, addDoc, deleteDoc, Timestamp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-storage.js";
import { appState } from './state.js';
import { localDB } from '../db/dexie.js';
import { db, storage, projectsCol, suppliersCol, workersCol, materialsCol, staffCol, professionsCol, opCatsCol, matCatsCol, otherCatsCol, fundingCreditorsCol, expensesCol, billsCol, incomesCol, fundingSourcesCol, attendanceRecordsCol, stockTransactionsCol, commentsCol, TEAM_ID } from '../config/firebase.js';
import { toast, hideToast } from '../ui/toast.js';
import { generateUUID, isViewer } from '../utils/helpers.js';
import { loadAllLocalDataToState, _calculateAndCacheDashboardTotals } from './data.js';
import { renderPageContent } from '../ui/navigation.js';
import { upsertCommentInUI } from '../features/comments.js';

// These imports will be resolved later as we fix each feature module
// For now, we define them as placeholders to avoid breaking this module
const renderLaporanPage = () => {};
const renderTagihanPage = () => {};
const renderJurnalPage = () => {};
const renderPemasukanPage = () => {};


function getLastSyncTimestamp() {
    const stored = localStorage.getItem('lastSyncTimestamp');
    return stored ? new Date(parseInt(stored)) : new Date(0);
}

function setLastSyncTimestamp() {
    localStorage.setItem('lastSyncTimestamp', Date.now().toString());
}

export async function syncFromServer() {
    if (!navigator.onLine) return;
    console.log("Memulai sinkronisasi cerdas dari server...");
    toast('syncing', 'Mengambil data terbaru...');

    const lastSync = getLastSyncTimestamp();
    console.log(`Hanya akan mengambil data yang berubah setelah: ${lastSync.toISOString()}`);

    try {
        const collectionsToSync = {
            projects: projectsCol,
            suppliers: suppliersCol,
            workers: workersCol,
            materials: materialsCol,
            staff: staffCol,
            professions: professionsCol,
            operational_categories: opCatsCol,
            material_categories: matCatsCol,
            other_categories: otherCatsCol,
            funding_creditors: fundingCreditorsCol,
            expenses: expensesCol,
            bills: billsCol,
            incomes: incomesCol,
            funding_sources: fundingSourcesCol,
            attendance_records: attendanceRecordsCol,
            stock_transactions: stockTransactionsCol,
            comments: commentsCol
        };

        let totalDocsSynced = 0;

        for (const [tableName, collectionRef] of Object.entries(collectionsToSync)) {
            const q = query(collectionRef, where("updatedAt", ">", lastSync));

            const snapshot = await getDocs(q);
            totalDocsSynced += snapshot.size;

            if (!snapshot.empty) {
                const firestoreData = snapshot.docs.map(d => ({
                    ...d.data(),
                    id: d.id,
                    serverRev: (d.data().rev || 0)
                }));

                await localDB[tableName].bulkPut(firestoreData);
                console.log(`Tabel '${tableName}': ${snapshot.size} dokumen baru/berubah telah disinkronkan.`);
            }
        }

        await loadAllLocalDataToState();
        renderPageContent();

        hideToast();
        if (totalDocsSynced > 0) {
            toast('success', `${totalDocsSynced} item berhasil diperbarui.`);
        }

        setLastSyncTimestamp();
        updateSyncIndicator();

    } catch (e) {
        console.error("Sinkronisasi dari server gagal:", e);
        toast('error', 'Gagal mengambil data terbaru. Mungkin perlu membuat index di Firestore?');
    }
}

export async function syncToServer() {
    if (!navigator.onLine || appState.isSyncing) return;
    appState.isSyncing = true;
    toast('syncing', 'Mengirim perubahan ke server...');
    try {
        let totalSynced = 0;

        const tablesForDeletionSync = [ localDB.expenses, localDB.bills, localDB.incomes, localDB.funding_sources, localDB.attendance_records, localDB.stock_transactions, localDB.comments ];
        for (const table of tablesForDeletionSync) {
            const itemsToDelete = await table.where('isDeleted').equals(1).toArray();
            if (itemsToDelete.length > 0) {
                const deleteBatch = writeBatch(db);
                const idsToDelete = itemsToDelete.map(item => item.id);
                idsToDelete.forEach(id => {
                    if (id) deleteBatch.delete(doc(db, 'teams', TEAM_ID, table.name, id));
                });
                await deleteBatch.commit();
                await table.bulkDelete(idsToDelete);
                totalSynced += itemsToDelete.length;
            }
        }

        const collectionsToSync = ['expenses', 'bills', 'incomes', 'funding_sources', 'attendance_records', 'stock_transactions', 'comments'];
        for (const tableName of collectionsToSync) {
            const itemsToSync = await localDB[tableName].where('needsSync').equals(1).toArray();
            if (itemsToSync.length === 0) continue;
            const collectionRef = collection(db, 'teams', TEAM_ID, tableName);
            for (const item of itemsToSync) {
                const { needsSync, isDeleted, localAttachmentId, attachmentNeedsSync, serverRev, ...firestoreData } = item;
                const id = firestoreData.id || generateUUID();
                const docRef = doc(collectionRef, id);
                await runTransaction(db, async (transaction) => {
                    const snap = await transaction.get(docRef);
                    const dataToWrite = { ...firestoreData, updatedAt: serverTimestamp(), id };
                    transaction.set(docRef, dataToWrite, { merge: true });
                });
                await localDB[tableName].update(id, { needsSync: 0 });
                totalSynced += 1;
            }
        }

        const expensesWithFiles = await localDB.expenses.where('attachmentNeedsSync').equals(1).toArray();
        for (const expense of expensesWithFiles) {
             if (!expense.id) continue;
             const fileRecord = await localDB.files.get(expense.localAttachmentId);
             if (fileRecord && fileRecord.file) {
                 const downloadURL = await _uploadFileToFirebaseStorage(fileRecord.file);
                 if (downloadURL) {
                     await updateDoc(doc(expensesCol, expense.id), { attachmentUrl: downloadURL });
                     await localDB.expenses.update(expense.id, { attachmentNeedsSync: 0, attachmentUrl: downloadURL });
                     await localDB.files.delete(expense.localAttachmentId);
                 }
             }
        }

        if (totalSynced > 0) {
            toast('success', `${totalSynced} item berhasil disinkronkan.`);
        } else {
            hideToast();
        }
    } catch (error) {
        toast('error', 'Beberapa data gagal disinkronkan.');
        console.error("Sync to server error:", error);
    } finally {
        appState.isSyncing = false;
        updateSyncIndicator();
    }
}

export async function updateSyncIndicator() {
    try {
        const el = document.getElementById('sync-indicator');
        if (!el) return;
        const c = await getPendingSyncCounts();
        const isOnline = navigator.onLine;
        const syncing = !!appState.isSyncing;
        const icon = syncing?'sync' : (isOnline?'cloud_done' : 'cloud_off');
        const color = syncing?'var(--warning)' : (isOnline?'var(--success)' : 'var(--danger)');
        el.innerHTML = `<span class="sync-indicator-btn" data-action="open-sync-queue" title="Lihat antrean sinkron" style="display:inline-flex;align-items:center;gap:.35rem;cursor:pointer"><span class="material-symbols-outlined" style="font-size:18px;color:${color}">${icon}</span><span>${syncing?'Sinkron...' : (isOnline?'Online' : 'Offline')}</span><span class="sync-count" style="background:#e5efff;color:#2b5cff;border-radius:10px;padding:2px 8px;">${c.total}</span></span>`;
    } catch (_) {}
}

export async function getPendingSyncCounts() {
    const tables = ['expenses', 'bills', 'incomes', 'funding_sources', 'attendance_records', 'stock_transactions'];
    let needs = 0,
        deletes = 0;
    for (const t of tables) {
        needs += await localDB[t].where('needsSync').equals(1).count();
        deletes += await localDB[t].where('isDeleted').equals(1).count();
    }
    const qPay = await localDB.pending_payments.count();
    const qLogs = await localDB.pending_logs.count();
    const qConf = await localDB.pending_conflicts.count();
    return {
        needs,
        deletes,
        qPay,
        qLogs,
        qConf,
        total: needs + deletes + qPay + qLogs + qConf
    };
}

export async function _processRealtimeChanges(changes, collectionName) {
    let hasChanged = false;
    let needsDashboardRecalc = false;

    for (const change of changes) {
        const docData = { ...change.doc.data(), id: change.doc.id };
        const localTable = localDB[collectionName];
        const stateArray = appState[collectionName];

        await localTable.put(docData);

        if (stateArray) {
            const index = stateArray.findIndex(item => item.id === docData.id);
            if (change.type === "added") {
                if (index === -1) stateArray.push(docData);
                else stateArray[index] = docData;
                hasChanged = true;
            }
            else if (change.type === "modified") {
                if (index > -1) stateArray[index] = docData;
                else stateArray.push(docData);
                hasChanged = true;
            }
            else if (change.type === "removed") {
                await localTable.where('id').equals(docData.id).delete();
                if (index > -1) stateArray.splice(index, 1);
                hasChanged = true;
            }
        }

        if (['incomes', 'expenses', 'bills', 'attendance_records'].includes(collectionName)) {
            needsDashboardRecalc = true;
        }
    }

    if (!hasChanged) return;

    if (needsDashboardRecalc) {
        _calculateAndCacheDashboardTotals();
    }

    switch (appState.activePage) {
        case 'laporan':
            if (needsDashboardRecalc) renderLaporanPage();
            break;
        case 'tagihan':
            if (['bills', 'expenses'].includes(collectionName)) renderTagihanPage();
            break;
        case 'jurnal':
            if (collectionName === 'attendance_records') renderJurnalPage();
            break;
        case 'pemasukan':
            if (collectionName === 'incomes') renderPemasukanPage();
            break;
    }

    if (collectionName === 'comments') {
        const activeModal = document.querySelector('#dataDetail-modal.show');
        if (activeModal) {
            changes.forEach(change => {
                const commentSection = activeModal.querySelector(`.comments-section[data-parent-id="${change.doc.data().parentId}"]`);
                if (commentSection) {
                    upsertCommentInUI(change.doc.data(), change.type);
                }
            });
        }
    }

    updateSyncIndicator();
    setLastSyncTimestamp();
}

export function subscribeToMasterData() {
    const master = [
        { key: 'projects', col: projectsCol },
        { key: 'suppliers', col: suppliersCol },
        { key: 'workers', col: workersCol },
        { key: 'professions', col: professionsCol },
        { key: 'operational_categories', col: opCatsCol },
        { key: 'material_categories', col: matCatsCol },
        { key: 'other_categories', col: otherCatsCol },
        { key: 'materials', col: materialsCol },
        { key: 'staff', col: staffCol },
    ];
    master.forEach(({ key, col }) => {
        onSnapshot(col, async (snap) => {
            const incoming = snap.docs.map(d => ({ ...d.data(), id: d.id, serverRev: (d.data().rev || 0) }));
            try {
                if (incoming.length > 0) await localDB[key].bulkPut(incoming);
                appState[key] = incoming;
            } catch (e) {
                console.warn('Gagal menerapkan snapshot untuk', key, e);
            }
        }, (err) => console.warn('Snapshot error', key, err));
    });
}

async function _uploadFileToFirebaseStorage(file, folder = 'attachments') {
    if (!file) return null;
    if (isViewer()) {
        toast('error', 'Viewer tidak dapat mengunggah file.');
        return null;
    }
    toast('syncing', `Mengunggah ${file.name}...`);
    try {
        const timestamp = Date.now();
        const uniqueFileName = `${timestamp}-${file.name}`;
        const storageRef = ref(storage, `${folder}/${uniqueFileName}`);
        const uploadTask = await uploadBytesResumable(storageRef, file);
        const downloadURL = await getDownloadURL(uploadTask.ref);
        hideToast();
        return downloadURL;
    } catch (error) {
        console.error("Upload error:", error);
        toast('error', 'Gagal mengunggah file.');
        return null;
    }
}

export function _setActiveListeners(requiredListeners = []) {
    const collectionRefs = {
        'bills': billsCol,
        'expenses': expensesCol,
        'incomes': incomesCol,
        'attendance_records': attendanceRecordsCol,
        'comments': commentsCol,
    };

    const currentActive = Array.from(appState.activeListeners.keys());

    currentActive.forEach(listenerName => {
        if (!requiredListeners.includes(listenerName)) {
            const unsubscribe = appState.activeListeners.get(listenerName);
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            }
            appState.activeListeners.delete(listenerName);
            console.log(`- Listener untuk '${listenerName}' dinonaktifkan.`);
        }
    });

    requiredListeners.forEach(listenerName => {
        if (!appState.activeListeners.has(listenerName)) {
            const collectionRef = collectionRefs[listenerName];
            if (collectionRef) {
                const q = query(collectionRef);
                const unsubscribe = onSnapshot(q, (snapshot) => {
                    if (snapshot.empty && snapshot.metadata.fromCache) return;
                    _processRealtimeChanges(snapshot.docChanges(), listenerName);
                }, (error) => {
                    console.error(`Gagal mendengarkan ${listenerName}:`, error);
                });

                appState.activeListeners.set(listenerName, unsubscribe);
                console.log(`+ Listener untuk '${listenerName}' diaktifkan.`);
            }
        }
    });
}