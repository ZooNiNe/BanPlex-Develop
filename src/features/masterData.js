import { appState } from '../core/state.js';
import { $$, parseFormattedNumber } from '../utils/helpers.js';
import { createModal, closeModal } from '../ui/modals.js';
import { toast } from '../ui/toast.js';
import { masterDataConfig } from '../config/masterData.js';
import { fetchAndCacheData } from '../core/data.js';
import { optimisticUpdateDoc, _logActivity } from '../core/firestore.js';
import { serverTimestamp, doc, setDoc, runTransaction, query, where, getDocs, deleteDoc, addDoc, collection } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { db, TEAM_ID } from '../config/firebase.js';
import { _initCustomSelects } from '../ui/interactions.js';
import { _formatNumberInput } from '../utils/helpers.js';
import { renderPemasukanPage } from './pemasukan.js';
import { renderPengeluaranPage } from './pengeluaran.js';
import { renderAbsensiPage } from './absensi.js';
import { syncFromServer } from '../core/sync.js';

export async function handleManageMasterData(type, options = {}) {
    const config = masterDataConfig[type];
    if (!config) return;

    const onSelect = options.onSelect;

    await Promise.all([
        fetchAndCacheData(config.stateKey, config.collection, config.nameField),
        fetchAndCacheData('professions', collection(db, 'teams', TEAM_ID, 'professions'), 'professionName'),
        fetchAndCacheData('projects', collection(db, 'teams', TEAM_ID, 'projects'), 'projectName')
    ]);

    const getListItemContent = (item, type) => {
        let content = `<span>${item[config.nameField]}</span>`;

        if (type === 'materials' && item.unit) {
            content += `<span class="category-badge category-internal">${item.unit}</span>`;
        }
        if (type === 'suppliers' && item.category) {
            content += `<span class="category-badge category-${item.category.toLowerCase()}">${item.category}</span>`;
        }
        if (type === 'projects') {
            if (item.projectType === 'main_income') content += `<span class="category-badge category-main">Utama</span>`;
            else if (item.projectType === 'internal_expense') content += `<span class="category-badge category-internal">Internal</span>`;
        }
        return `<div class="master-data-item-info">${content}</div>`;
    };

    const listHTML = appState[config.stateKey].map(item => `
            <div class="master-data-item" data-id="${item.id}" data-type="${type}" ${onSelect?'data-action="select-item" style="cursor: pointer;"' : ''}>
                ${getListItemContent(item, type)}
                <div class="master-data-item-actions">
                    ${!onSelect?`
                        <button class="btn-icon" data-action="edit-master-item"><span class="material-symbols-outlined">edit</span></button>
                        <button class="btn-icon btn-icon-danger" data-action="delete-master-item"><span class="material-symbols-outlined">delete</span></button>
                    ` : ''}
                </div>
            </div>
        `).join('');

    let formFieldsHTML = `
            <div class="form-group">
               <label>Nama ${config.title}</label>
               <input type="text" name="itemName" placeholder="Masukkan nama..." required>
            </div>
        `;

    if (type === 'materials') {
        formFieldsHTML += `
                <div class="form-group">
                   <label>Satuan (mis. Pcs, Kg, m³)</label>
                   <input type="text" name="itemUnit" placeholder="Masukkan satuan..." required>
                </div>
            `;
    }
    if (type === 'staff') {
        const paymentTypeOptions = [{
            value: 'fixed_monthly',
            text: 'Gaji Bulanan Tetap'
        }, {
            value: 'per_termin',
            text: 'Fee per Termin (%)'
        }, {
            value: 'fixed_per_termin',
            text: 'Fee Tetap per Termin'
        }];
        formFieldsHTML += `
            ${createMasterDataSelect('paymentType', 'Tipe Pembayaran', paymentTypeOptions, 'fixed_monthly')}
            <div class="form-group" id="staff-salary-group">
                <label>Gaji Bulanan</label>
                <input type="text" inputmode="numeric" name="salary" placeholder="mis. 5.000.000">
            </div>
            <div class="form-group hidden" id="staff-fee-percent-group">
                <label>Persentase Fee (%)</label>
                <input type="number" name="feePercentage" placeholder="mis. 5 untuk 5%">
            </div>
            <div class="form-group hidden" id="staff-fee-amount-group">
                <label>Jumlah Fee Tetap</label>
                <input type="text" inputmode="numeric" name="feeAmount" placeholder="mis. 10.000.000">
            </div>
        `;
    }
    if (type === 'suppliers') {
        const categoryOptions = [{
            value: 'Operasional',
            text: 'Operasional'
        }, {
            value: 'Material',
            text: 'Material'
        }, {
            value: 'Lainnya',
            text: 'Lainnya'
        }, ];
        formFieldsHTML += createMasterDataSelect('itemCategory', 'Kategori Supplier', categoryOptions);
    }
    if (type === 'projects') {
        const projectTypeOptions = [{
            value: 'main_income',
            text: 'Pemasukan Utama'
        }, {
            value: 'internal_expense',
            text: 'Biaya Internal (Laba Bersih)'
        }];
        formFieldsHTML += `
            <div class="form-group">
                <label>Anggaran Proyek</label>
                <input type="text" inputmode="numeric" name="budget" placeholder="mis. 100.000.000">
            </div>
            ${createMasterDataSelect('projectType', 'Jenis Proyek', projectTypeOptions, 'main_income')}
        `;
    }
    if (type === 'workers') {
        const professionOptions = appState.professions.map(p => ({
            value: p.id,
            text: p.professionName
        }));
        const projectFieldsHTML = appState.projects.map(p => `
            <div class="form-group">
                <label>Upah Harian - ${p.projectName}</label>
                <input type="text" inputmode="numeric" name="project_wage_${p.id}" placeholder="mis. 150.000">
            </div>
        `).join('');
        const statusOptions = [{
            value: 'active',
            text: 'Aktif'
        }, {
            value: 'inactive',
            text: 'Tidak Aktif'
        }];
        formFieldsHTML += `
            ${createMasterDataSelect('professionId', 'Profesi', professionOptions, '', 'professions')}
            ${createMasterDataSelect('workerStatus', 'Status', statusOptions, 'active')}
            <h5 class="invoice-section-title">Upah Harian per Proyek</h5>
            ${projectFieldsHTML || '<p class="empty-state-small">Belum ada proyek. Tambahkan proyek terlebih dahulu.</p>'}
        `;
    }
    const content = `
        <div class="master-data-manager" data-type="${type}">
            <form id="add-master-item-form" data-type="${type}" data-async="true" method="POST" data-endpoint="/api/master/${type}" data-success-msg="${config.title} ditambahkan">
                ${formFieldsHTML}
                <button type="submit" class="btn btn-primary">Tambah</button>
            </form>
            <div class="master-data-list">
                ${appState[config.stateKey].length > 0?listHTML : '<p class="empty-state-small">Belum ada data.</p>'}
            </div>
        </div>
    `;
    const modalEl = createModal('manageMaster', {
        title: onSelect?`Pilih ${config.title}` : `Kelola ${config.title}`,
        content,
        onClose: () => {
            if (document.querySelectorAll('#modal-container .modal-bg').length > 1) {
                return;
            }
            const page = appState.activePage;
            if (page === 'pemasukan') renderPemasukanPage();
            else if (page === 'pengeluaran') renderPengeluaranPage();
            else if (page === 'absensi') renderAbsensiPage();
        }
    });
    if (onSelect && modalEl) {
        modalEl.querySelectorAll('[data-action="select-item"]').forEach(itemEl => {
            itemEl.addEventListener('click', () => {
                const itemId = itemEl.dataset.id;
                const selectedItem = appState[config.stateKey].find(i => i.id === itemId);
                if (selectedItem) {
                    onSelect(selectedItem);
                    closeModal(modalEl);
                }
            });
        });
    }
    if (type === 'staff' && modalEl) {
        _attachStaffFormListeners(modalEl);
        $('input[name="feeAmount"]', modalEl)?.addEventListener('input', _formatNumberInput);
        $('input[name="salary"]', modalEl)?.addEventListener('input', _formatNumberInput);
    }
}
export async function handleAddMasterItem(form) {
    const type = form.dataset.type;
    const config = masterDataConfig[type];
    const itemName = form.elements.itemName.value.trim();
    if (!config || !itemName) return;
    const dataToAdd = {
        [config.nameField]: itemName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
        };
    if (type === 'staff') {
        dataToAdd.paymentType = form.elements.paymentType.value;
        dataToAdd.salary = parseFormattedNumber(form.elements.salary.value) || 0;
        dataToAdd.feePercentage = Number(form.elements.feePercentage.value) || 0;
        dataToAdd.feeAmount = parseFormattedNumber(form.elements.feeAmount.value) || 0;
    }
    if (type === 'suppliers') dataToAdd.category = form.elements.itemCategory.value;
    if (type === 'projects') {
        dataToAdd.projectType = form.elements.projectType.value;
        dataToAdd.budget = parseFormattedNumber(form.elements.budget.value);
    }
    if (type === 'workers') {
        dataToAdd.professionId = form.elements.professionId.value;
        dataToAdd.status = form.elements.workerStatus.value;
        dataToAdd.projectWages = {};
        appState.projects.forEach(p => {
            const wage = parseFormattedNumber(form.elements[`project_wage_${p.id}`].value);
            if (wage > 0) dataToAdd.projectWages[p.id] = wage;
        });
    }
    if (type === 'materials') {
        dataToAdd.unit = form.elements.unit.value.trim();
        dataToAdd.reorderPoint = Number(form.elements.reorderPoint.value) || 0;
        dataToAdd.currentStock = 0;
        dataToAdd.lastPrice = 0;
        dataToAdd.usageCount = 0;
    }
    toast('syncing', `Menambah ${config.title}...`);
    try {
        const newDocRef = doc(config.collection);
        if (type === 'projects' && dataToAdd.projectType === 'main_income') {
            await runTransaction(db, async (transaction) => {
                const q = query(projectsCol, where("projectType", "==", "main_income"));
                const mainProjectsSnap = await getDocs(q);
                mainProjectsSnap.forEach(docSnap => {
                    const docData = docSnap.data();
                    transaction.update(docSnap.ref, {
                        projectType: 'internal_expense',
                        rev: (docData.rev || 0) + 1,
                        updatedAt: serverTimestamp()
                    });
                });
                transaction.set(newDocRef, dataToAdd);
            });
        } else {
            await setDoc(newDocRef, dataToAdd);
        }
        _logActivity(`Menambah Master Data: ${config.title}`, {
            name: itemName
        });
        toast('success', `${config.title} baru berhasil ditambahkan.`);
        form.reset();
        $$('.custom-select-trigger span:first-child', form).forEach(s => s.textContent = 'Pilih...');
        await handleManageMasterData(type);
    } catch (error) {
        toast('error', `Gagal menambah ${config.title}.`);
        console.error(error);
    }
}
export function handleEditMasterItem(id, type) {
    const config = masterDataConfig[type];
    if (!config) return;
    const item = appState[config.stateKey].find(i => i.id === id);
    if (!item) {
        toast('error', 'Data tidak ditemukan untuk diedit.');
        return;
    }
    let formFieldsHTML = `<div class="form-group"><label>Nama ${config.title}</label><input type="text" name="itemName" value="${item[config.nameField]}" required></div>`;
    if (type === 'staff') {
        const paymentTypeOptions = [{
            value: 'fixed_monthly',
            text: 'Gaji Bulanan Tetap'
        }, {
            value: 'per_termin',
            text: 'Fee per Termin (%)'
        }, {
            value: 'fixed_per_termin',
            text: 'Fee Tetap per Termin'
        }];
        formFieldsHTML += `${createMasterDataSelect('paymentType', 'Tipe Pembayaran', paymentTypeOptions, item.paymentType || 'fixed_monthly')}
            <div class="form-group" id="staff-salary-group"><label>Gaji Bulanan</label><input type="text" inputmode="numeric" name="salary" value="${item.salary?new Intl.NumberFormat('id-ID').format(item.salary) : ''}"></div>
            <div class="form-group hidden" id="staff-fee-percent-group"><label>Persentase Fee (%)</label><input type="number" name="feePercentage" value="${item.feePercentage || ''}"></div>
            <div class="form-group hidden" id="staff-fee-amount-group"><label>Jumlah Fee Tetap</label><input type="text" inputmode="numeric" name="feeAmount" value="${item.feeAmount?new Intl.NumberFormat('id-ID').format(item.feeAmount) : ''}"></div>`;
    }
    if (type === 'suppliers') {
        const categoryOptions = [{
            value: 'Operasional',
            text: 'Operasional'
        }, {
            value: 'Material',
            text: 'Material'
        }, {
            value: 'Lainnya',
            text: 'Lainnya'
        }, ];
        formFieldsHTML += createMasterDataSelect('itemCategory', 'Kategori Supplier', categoryOptions, item.category || 'Operasional');
    }
    if (type === 'projects') {
        const projectTypeOptions = [{
            value: 'main_income',
            text: 'Pemasukan Utama'
        }, {
            value: 'internal_expense',
            text: 'Biaya Internal (Beban)'
        }];
        const budget = item.budget?new Intl.NumberFormat('id-ID').format(item.budget) : '';
        formFieldsHTML += `<div class="form-group"><label>Anggaran Proyek</label><input type="text" inputmode="numeric" name="budget" placeholder="mis. 100.000.000" value="${budget}"></div>${createMasterDataSelect('projectType', 'Jenis Proyek', projectTypeOptions, item.projectType || 'main_income')}`;
    }
    if (type === 'workers') {
        const professionOptions = appState.professions.map(p => ({
            value: p.id,
            text: p.professionName
        }));
        const projectFieldsHTML = appState.projects.map(p => {
            const currentWage = item.projectWages?.[p.id] || '';
            return `<div class="form-group"><label>Upah Harian - ${p.projectName}</label><input type="text" inputmode="numeric" name="project_wage_${p.id}" value="${currentWage?new Intl.NumberFormat('id-ID').format(currentWage) : ''}" placeholder="mis. 150.000"></div>`;
        }).join('');
        const statusOptions = [{
            value: 'active',
            text: 'Aktif'
        }, {
            value: 'inactive',
            text: 'Tidak Aktif'
        }];
        formFieldsHTML += `${createMasterDataSelect('professionId', 'Profesi', professionOptions, item.professionId || '', 'professions')}${createMasterDataSelect('workerStatus', 'Status', statusOptions, item.status || 'active')}<h5 class="invoice-section-title">Upah Harian per Proyek</h5>${projectFieldsHTML || '<p class="empty-state-small">Belum ada proyek. Tambahkan proyek terlebih dahulu.</p>'}`;
    }
    if (type === 'materials') {
        formFieldsHTML += `
            <div class="form-group"><label>Satuan</label><input type="text" name="unit" value="${item.unit || ''}" required></div>
            <div class="form-group"><label>Titik Pemesanan Ulang</label><input type="number" name="reorderPoint" value="${item.reorderPoint || 0}" required></div>
        `;
    }
    const content = `<form id="edit-master-form" data-id="${id}" data-type="${type}" data-async="true" method="PUT" data-endpoint="/api/master/${type}/${id}" data-success-msg="${config.title} diperbarui">${formFieldsHTML}<button type="submit" class="btn btn-primary">Simpan Perubahan</button></form>`;
    const modalEl = createModal('editMaster', {
        title: `Edit ${config.title}`,
        content
    });
    if (type === 'staff' && modalEl) {
        _attachStaffFormListeners(modalEl);
        $('input[name="feeAmount"]', modalEl)?.addEventListener('input', _formatNumberInput);
        $('input[name="salary"]', modalEl)?.addEventListener('input', _formatNumberInput);
    }
}
export async function handleUpdateMasterItem(form) {
    const {
        id,
        type
    } = form.dataset;
    const newName = form.elements.itemName.value.trim();
    const config = masterDataConfig[type];
    if (!config || !newName) return;
    const dataToUpdate = {
        [config.nameField]: newName
    };
    if (type === 'staff') {
        dataToUpdate.paymentType = form.elements.paymentType.value;
        dataToUpdate.salary = parseFormattedNumber(form.elements.salary.value) || 0;
        dataToUpdate.feePercentage = Number(form.elements.feePercentage.value) || 0;
        dataToUpdate.feeAmount = parseFormattedNumber(form.elements.feeAmount.value) || 0;
    }
    if (type === 'suppliers') dataToUpdate.category = form.elements.itemCategory.value;
    if (type === 'projects') {
        dataToUpdate.projectType = form.elements.projectType.value;
        dataToUpdate.budget = parseFormattedNumber(form.elements.budget.value);
    }
    if (type === 'workers') {
        dataToUpdate.professionId = form.elements.professionId.value;
        dataToUpdate.status = form.elements.workerStatus.value;
        dataToUpdate.projectWages = {};
        appState.projects.forEach(p => {
            const wage = parseFormattedNumber(form.elements[`project_wage_${p.id}`].value);
            if (wage > 0) dataToUpdate.projectWages[p.id] = wage;
        });
    }
    if (type === 'materials') {
        dataToUpdate.unit = form.elements.unit.value.trim();
        dataToUpdate.reorderPoint = Number(form.elements.reorderPoint.value) || 0;
    }
    toast('syncing', `Memperbarui ${config.title} (Lokal)...`);
    try {
        const table = localDB[config.stateKey];
        const itemsToUpdate = await table.where('id').equals(id).toArray();
        if (itemsToUpdate.length > 0) {
            const localId = itemsToUpdate[0].localId;
            await optimisticUpdateDoc(config.collection, id, dataToUpdate);
        } else {
            throw new Error("Item tidak ditemukan di database lokal untuk diperbarui.");
        }

        _logActivity(`Memperbarui Master Data: ${config.title}`, {
            docId: id,
            newName
        });
        toast('success', `${config.title} berhasil diperbarui.`);

        await syncFromServer();
        await handleManageMasterData(type);
    } catch (error) {
        toast('error', `Gagal memperbarui ${config.title}.`);
        console.error(error);
    }
}
export async function handleDeleteMasterItem(id, type) {
    const config = masterDataConfig[type];
    if (!config) return;
    const item = appState[config.stateKey].find(i => i.id === id);
    createModal('confirmDelete', {
        message: `Anda yakin ingin menghapus ${config.title} "${item[config.nameField]}" ini?`,
        onConfirm: async () => {
            toast('syncing', `Menghapus ${config.title}...`);
            try {
                await deleteDoc(doc(config.collection, id));
                const table = localDB[config.stateKey];
                await table.where('id').equals(id).delete();
                _logActivity(`Menghapus Master Data: ${config.title}`, {
                    docId: id,
                    name: item[config.nameField]
                });
                toast('success', `${config.title} berhasil dihapus.`);
                await loadAllLocalDataToState();
                await handleManageMasterData(type);
            } catch (error) {
                toast('error', `Gagal menghapus ${config.title}.`);
            }
        }
    });
}

async function _saveNewMasterMaterial(data) {
    try {
        const docRef = await addDoc(collection(db, 'teams', TEAM_ID, 'materials'), {
            materialName: data.name,
            unit: data.unit,
            currentStock: 0,
            createdAt: serverTimestamp()
        });
        return {
            id: docRef.id,
            materialName: data.name,
            unit: data.unit
        };
    } catch (error) {
        console.error("Gagal menyimpan master material baru:", error);
        toast('error', 'Gagal menyimpan data baru.');
        return null;
    }
}
export function handleAddNewMaterialModal(targetWrapper) {
    const content = `
        <form id="add-new-material-form">
            <div class="form-group">
                <label>Nama Material Baru</label>
                <input type="text" name="materialName" required placeholder="Contoh: Semen Tiga Roda">
            </div>
            <div class="form-group">
                <label>Satuan</label>
                <input type="text" name="unit" required placeholder="Contoh: Zak, Pcs, m³">
            </div>
            <div class="modal-footer" style="margin-top: 1.5rem;">
                <button type="button" class="btn btn-secondary" data-close-modal>Batal</button>
                <button type="submit" class="btn btn-primary">Simpan & Pilih</button>
            </div>
        </form>
    `;
    const modalEl = createModal('dataDetail', {
        title: 'Tambah Master Material',
        content
    });
    $('#add-new-material-form', modalEl)?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const newName = form.elements.materialName.value.trim();
        const newUnit = form.elements.unit.value.trim();
        if (!newName || !newUnit) {
            toast('error', 'Nama dan Satuan harus diisi.');
            return;
        }
        toast('syncing', 'Menyimpan material baru...');
        const newMaterial = await _saveNewMasterMaterial({
            name: newName,
            unit: newUnit
        });
        if (newMaterial) {
            const nameInput = $('.autocomplete-input', targetWrapper);
            const idInput = $('.autocomplete-id', targetWrapper);
            const clearBtn = $('.autocomplete-clear-btn', targetWrapper);
            nameInput.value = newMaterial.materialName;
            idInput.value = newMaterial.id;
            nameInput.readOnly = true;
            if (clearBtn) clearBtn.style.display = 'flex';
            const row = targetWrapper.closest('.invoice-item-row');
            const unitSpan = row?.querySelector('.item-unit');
            if (unitSpan) unitSpan.textContent = newMaterial.unit || '';
            localStorage.removeItem('master_data:materials');
            appState.materials = [];
            toast('success', 'Material baru berhasil dipilih!');
            closeModal(modalEl);
        }
    });
}