import { addDoc, runTransaction, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { appState } from './state.js';
import { logsCol, db } from '../config/firebase.js';
import { localDB } from '../db/dexie.js';
import { isViewer } from '../utils/helpers.js';

export async function _logActivity(action, details = {}) {
    if (!appState.currentUser || isViewer()) return;
    try {
        await addDoc(logsCol, {
            action,
            details,
            userId: appState.currentUser.uid,
            userName: appState.currentUser.displayName,
            createdAt: serverTimestamp()
        });
    } catch (error) {
        console.error("Gagal mencatat aktivitas:", error);
        try {
            await localDB.pending_logs.add({
                action,
                details,
                userId: appState.currentUser.uid,
                userName: appState.currentUser.displayName,
                createdAt: new Date()
            });
        } catch (e2) {
            console.warn('Gagal antre log offline:', e2);
        }
    }
}

export async function optimisticUpdateDoc(colRef, id, partialChanges) {
    const ref = doc(colRef, id);
    await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(ref);
        if (!snap.exists()) throw new Error('Dokumen tidak ditemukan');
        const currentRev = snap.data().rev || 0;
        const nextRev = currentRev + 1;
        transaction.update(ref, { ...partialChanges,
            rev: nextRev,
            updatedAt: serverTimestamp()
        });
    });
}