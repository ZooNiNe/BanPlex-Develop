import { toast } from '../ui/toast.js';
import { appState } from '../core/state.js';
import { localDB } from '../db/dexie.js';
import { syncToServer } from '../core/sync.js';
import { renderPageContent } from '../ui/navigation.js';
import { createModal } from '../ui/modals.js';
import { expensesCol, incomesCol, fundingSourcesCol, billsCol } from '../config/firebase.js';
import { deleteDoc, doc } from 'https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js';


const _logActivity = () => {}; // Placeholder

export async function handleUpdateItem(form) {
    const { id, type } = form.dataset;
    toast('syncing', 'Memperbarui data di perangkat...');
    try {
        let table, dataToUpdate = {}, config = { title: 'Data' }, stateKey;

        switch (type) {
            case 'termin':
                table = localDB.incomes; stateKey = 'incomes'; config.title = 'Pemasukan Termin';
                dataToUpdate = { amount: parseFormattedNumber(form.elements.amount.value), date: new Date(form.elements.date.value), projectId: form.elements.projectId.value };
                break;
            case 'pinjaman':
                table = localDB.funding_sources; stateKey = 'fundingSources'; config.title = 'Pinjaman';
                dataToUpdate = { totalAmount: parseFormattedNumber(form.elements.totalAmount.value), date: new Date(form.elements.date.value), creditorId: form.elements.creditorId.value, interestType: form.elements.interestType.value };
                if (dataToUpdate.interestType === 'interest') {
                    dataToUpdate.rate = Number(form.elements.rate.value);
                    dataToUpdate.tenor = Number(form.elements.tenor.value);
                    dataToUpdate.totalRepaymentAmount = dataToUpdate.totalAmount * (1 + (dataToUpdate.rate / 100 * dataToUpdate.tenor));
                }
                break;
            case 'fee_bill':
                table = localDB.bills; stateKey = 'bills'; config.title = 'Tagihan Fee';
                dataToUpdate = { description: form.elements.description.value.trim(), amount: parseFormattedNumber(form.elements.amount.value) };
                break;
            case 'expense':
                table = localDB.expenses; stateKey = 'expenses'; config.title = 'Pengeluaran';
                if (form.querySelector('#invoice-items-container')) {
                    const items = [];
                    $$('.invoice-item-row', form).forEach(row => {
                        const materialId = row.querySelector('input[name="materialId"]')?.value || null;
                        if (materialId) {
                            items.push({
                                name: row.querySelector('input[name="itemName"]').value,
                                price: parseFormattedNumber(row.querySelector('input[name="itemPrice"]').value),
                                qty: parseLocaleNumber(row.querySelector('input[name="itemQty"]').value),
                                total: parseFormattedNumber(row.querySelector('input[name="itemPrice"]').value) * parseLocaleNumber(row.querySelector('input[name="itemQty"]').value),
                                materialId
                            });
                        }
                    });
                    if (items.length === 0) throw new Error('Faktur harus memiliki minimal satu barang.');
                    dataToUpdate = { projectId: form.elements['project-id'].value, supplierId: form.elements['supplier-id'].value, description: form.elements.description.value, date: new Date(form.elements.date.value), items: items, amount: items.reduce((sum, item) => sum + item.total, 0) };
                } else {
                    dataToUpdate = { amount: parseFormattedNumber(form.elements.amount.value), description: form.elements.description.value, date: new Date(form.elements.date.value), categoryId: form.elements.categoryId?.value || '' };
                }
                break;
            default: throw new Error('Tipe data untuk update tidak dikenal.');
        }

        await table.update(id, { ...dataToUpdate, needsSync: 1 });

        if (stateKey && appState[stateKey]) {
            const itemIndex = appState[stateKey].findIndex(item => item.id === id);
            if (itemIndex > -1) {
                appState[stateKey][itemIndex] = { ...appState[stateKey][itemIndex], ...dataToUpdate };
            }
        }

        if (type === 'expense') {
            const relatedBill = await localDB.bills.where('expenseId').equals(id).first();
            if (relatedBill) {
                const billUpdateData = { description: dataToUpdate.description, amount: dataToUpdate.amount, dueDate: dataToUpdate.date, needsSync: 1 };
                await localDB.bills.update(relatedBill.id, billUpdateData);
                const billIndex = appState.bills.findIndex(b => b.id === relatedBill.id);
                if (billIndex > -1) {
                    appState.bills[billIndex] = { ...appState.bills[billIndex], ...billUpdateData };
                }
            }
        }

        _logActivity(`Memperbarui Data (Lokal): ${config.title}`, { docId: id });
        toast('success', 'Perubahan berhasil disimpan!');

        renderPageContent();
        syncToServer();

    } catch (error) {
        toast('error', `Gagal memperbarui data: ${error.message}`);
        console.error('Update error:', error);
    }
  }

export async function handleDeleteItem(id, type) {
    createModal('confirmDelete', {
        onConfirm: async () => {
            if (!navigator.onLine) {
                try {
                    let table = null;
                    if (type === 'termin') table = localDB.incomes;
                    else if (type === 'pinjaman') table = localDB.funding_sources;
                    else if (type === 'expense') table = localDB.expenses;
                    else if (type === 'bill') table = localDB.bills;
                    else return;
                    const local = await table.where('id').equals(id).first();
                    if (local) await table.update(local.localId, {
                        isDeleted: 1,
                        needsSync: 1
                    });

                    if (type === 'expense') {
                        const related = await localDB.bills.where('expenseId').equals(id).toArray();
                        for (const b of related) {
                            await localDB.bills.update(b.localId, {
                                isDeleted: 1,
                                needsSync: 1
                            });
                        }
                    }
                    if (type === 'bill') {
                        const bill = appState.bills.find(b => b.id === id);
                        const recordIds = bill?.recordIds || [];
                        for (const recId of recordIds) {
                            const rec = await localDB.attendance_records.where('id').equals(recId).first();
                            if (rec) await localDB.attendance_records.update(rec.localId, {
                                isPaid: false,
                                billId: null,
                                needsSync: 1
                            });
                        }
                    }
                    _logActivity(`Menghapus Data (Offline) ${type}`, {
                        docId: id
                    });
                    toast('success', 'Data dihapus di perangkat.');
                    await loadAllLocalDataToState();
                    renderPageContent();
                    return;
                } catch (err) {
                    toast('error', 'Gagal menghapus data secara offline.');
                    console.error(err);
                    return;
                }
            }
            toast('syncing', 'Menghapus data...');
            try {
                let col, item;
                if (type === 'termin') {
                    col = incomesCol;
                    item = appState.incomes.find(i => i.id === id);
                } else if (type === 'pinjaman') {
                    col = fundingSourcesCol;
                    item = appState.fundingSources.find(i => i.id === id);
                } else if (type === 'expense') {
                    col = expensesCol;
                    item = appState.expenses.find(i => i.id === id);
                } else if (type === 'bill') {
                    col = billsCol;
                    item = appState.bills.find(i => i.id === id);
                } else return;

                if (type === 'bill' && item && item.type === 'gaji') {
                    const recordIds = item.recordIds || [];
                    if (recordIds.length > 0) {
                        const batch = writeBatch(db);
                        recordIds.forEach(recordId => {
                            batch.update(doc(attendanceRecordsCol, recordId), {
                                isPaid: false,
                                billId: null
                            });
                        });
                        await batch.commit();
                    }
                }
                if (type === 'bill') {
                    const paymentsSnap = await getDocs(collection(db, 'teams', TEAM_ID, 'bills', id, 'payments'));
                    if (!paymentsSnap.empty) {
                        const pBatch = writeBatch(db);
                        paymentsSnap.docs.forEach(d => pBatch.delete(d.ref));
                        await pBatch.commit();
                    }
                }
                await deleteDoc(doc(col, id));

                if (type === 'expense') {
                    const q = query(billsCol, where("expenseId", "==", id));
                    const billSnap = await getDocs(q);
                    const batch = writeBatch(db);
                    billSnap.docs.forEach(d => batch.delete(d.ref));
                    await batch.commit();
                }

                _logActivity(`Menghapus Data ${type}`, {
                    docId: id,
                    description: item?.description || item?.amount
                });
                toast('success', 'Data berhasil dihapus.');

                renderPageContent();
            } catch (error) {
                toast('error', 'Gagal menghapus data.');
                console.error('Delete error:', error);
            }
        }
    });
}