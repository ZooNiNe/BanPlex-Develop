import { appState } from '../core/state.js';
import { $, $$, fmtIDR, _getJSDate, _animateTabSwitch, parseFormattedNumber } from '../utils/helpers.js';
import { fetchAndCacheData } from '../core/data.js'; // To be created
import { materialsCol, stockTransactionsCol, projectsCol } from '../config/firebase.js';
import { _setActiveListeners } from '../core/sync.js';
import { createModal, closeModal } from '../ui/modals.js';
import { toast } from '../ui/toast.js';
import { doc, runTransaction, increment, serverTimestamp, Timestamp, query, where, getDocs, collection, addDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

// Placeholders
const _getEmptyStateHTML = () => {};
const _logActivity = () => {};
const createMasterDataSelect = () => {};
const _initCustomSelects = () => {};

export async function renderStokPage() {
    const container = $('.page-container');
    const tabs = [{
        id: 'daftar',
        label: 'Daftar Stok'
    }, {
        id: 'estimasi',
        label: 'Estimasi Belanja'
    }, {
        id: 'riwayat',
        label: 'Riwayat Stok'
    }];
    container.innerHTML = `
            <div class="sub-nav">
                ${tabs.map((tab, index) => `<button class="sub-nav-item ${index === 0?'active' : ''}" data-tab="${tab.id}">${tab.label}</button>`).join('')}
            </div>
            <div id="sub-page-content"></div>
        `;

    const renderTabContent = async (tabId) => {
        appState.activeSubPage.set('stok', tabId);
        const contentContainer = $("#sub-page-content");
        contentContainer.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';

        await fetchAndCacheData('materials', materialsCol, 'materialName');

        if (tabId === 'daftar') await _renderDaftarStokView(contentContainer);
        else if (tabId === 'estimasi') await _renderEstimasiBelanjaView(contentContainer);
        else if (tabId === 'riwayat') await _renderRiwayatStokView(contentContainer);
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

    const lastSubPage = appState.activeSubPage.get('stok') || tabs[0].id;
    $(`.sub-nav-item[data-tab="${lastSubPage}"]`)?.classList.add('active');
    await renderTabContent(lastSubPage);
    _setActiveListeners(['stock_transactions']);
}

async function _renderDaftarStokView(container) {
    const materials = appState.materials || [];
    const listHTML = materials.map(item => {
        const stockLevel = item.currentStock || 0;
        const reorderPoint = item.reorderPoint || 0;
        const isLowStock = stockLevel <= reorderPoint;

        return `
                <div class="card dense-list-item">
                    <div class="item-main-content">
                        <strong class="item-title">${item.materialName}</strong>
                        <span class="item-subtitle ${isLowStock?'negative' : ''}">
                            Stok: <strong>${stockLevel} ${item.unit || ''}</strong>
                            ${isLowStock?' (Stok menipis!)' : ''}
                        </span>
                    </div>
                    <div class="item-actions">
                        <button class="btn btn-sm btn-success" data-action="stok-in" data-id="${item.id}"><span class="material-symbols-outlined">add</span>Masuk</button>
                        <button class="btn btn-sm btn-danger" data-action="stok-out" data-id="${item.id}"><span class="material-symbols-outlined">remove</span>Keluar</button>
                    </div>
                </div>
            `;
    }).join('');

    container.innerHTML = `
            <div class="stok-header sticky-toolbar">
                <button class="btn btn-primary" data-action="manage-master" data-type="materials"><span class="material-symbols-outlined">inventory_2</span> Kelola Master Material</button>
            </div>
            <div class="dense-list-container">
                ${materials.length > 0?listHTML : _getEmptyStateHTML({ icon:'inventory_2', title:'Belum Ada Material', desc:'Tambah material agar stok dapat dikelola.' })}
            </div>
        `;
}
async function _renderEstimasiBelanjaView(container) {
    const lowStockItems = (appState.materials || []).filter(item => (item.currentStock || 0) <= (item.reorderPoint || 0));

    if (lowStockItems.length === 0) {
        container.innerHTML = _getEmptyStateHTML({ icon:'inventory', title:'Stok Aman', desc:'Semua persediaan berada pada level yang sehat.' });
        return;
    }

    const listHTML = lowStockItems.map(item => `
            <div class="card estimasi-item" data-price="${item.lastPrice || 0}">
                <div class="estimasi-info">
                    <strong>${item.materialName}</strong>
                    <span>Stok: ${item.currentStock || 0} / Min: ${item.reorderPoint || 0} ${item.unit || ''}</span>
                </div>
                <div class="estimasi-input">
                    <input type="number" class="qty-beli" placeholder="Qty Beli">
                    <span class="estimasi-subtotal">Rp 0</span>
                </div>
            </div>
        `).join('');

    container.innerHTML = `
            <div id="estimasi-list">${listHTML}</div>
            <div class="invoice-total" style="margin-top:1.5rem;">
                <span>Grand Total Estimasi</span>
                <strong id="estimasi-grand-total">Rp 0</strong>
            </div>
        `;

    const updateTotal = () => {
        let grandTotal = 0;
        $$('.estimasi-item').forEach(item => {
            const price = Number(item.dataset.price);
            const qty = Number(item.querySelector('.qty-beli').value);
            const subtotal = price * qty;
            item.querySelector('.estimasi-subtotal').textContent = fmtIDR(subtotal);
            grandTotal += subtotal;
        });
        $('#estimasi-grand-total').textContent = fmtIDR(grandTotal);
    };

    $$('.qty-beli').forEach(input => input.addEventListener('input', updateTotal));
}

function _createStockTransactionDetailHTML(trans) {
    const material = appState.materials.find(m => m.id === trans.materialId);
    const project = trans.projectId?appState.projects.find(p => p.id === trans.projectId) : null;
    const date = _getJSDate(trans.date).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    const isStokIn = trans.type === 'in';
    const details = [{
        label: 'Nama Material',
        value: material?.materialName || 'Material Dihapus'
    }, {
        label: 'Jumlah',
        value: `${trans.quantity} ${material?.unit || ''}`
    }, {
        label: 'Jenis Transaksi',
        value: isStokIn?'Stok Masuk' : 'Stok Keluar (Pemakaian)'
    }, {
        label: 'Tanggal',
        value: date
    }];
    if (isStokIn && trans.pricePerUnit > 0) {
        details.push({
            label: 'Harga per Satuan',
            value: fmtIDR(trans.pricePerUnit)
        });
        details.push({
            label: 'Total Nilai',
            value: fmtIDR(trans.pricePerUnit * trans.quantity)
        });
    }
    if (!isStokIn && project) {
        details.push({
            label: 'Digunakan untuk Proyek',
            value: project.projectName
        });
    }
    return `
            <dl class="detail-list">
                ${details.map(d => `<div><dt>${d.label}</dt><dd>${d.value}</dd></div>`).join('')}
            </dl>
        `;
}
async function _renderRiwayatStokView(container) {
    const transactions = appState.stockTransactions.sort((a, b) => _getJSDate(b.date) - _getJSDate(a.date));

    if (transactions.length === 0) {
        container.innerHTML = _getEmptyStateHTML({ icon:'receipt_long', title:'Belum Ada Riwayat', desc:'Transaksi stok yang terjadi akan tampil di sini.' });
        return;
    }

    const listHTML = transactions.map(trans => {
        const material = appState.materials.find(m => m.id === trans.materialId);
        const project = appState.projects.find(p => p.id === trans.projectId);
        const date = _getJSDate(trans.date).toLocaleDateString('id-ID', {
            day: '2-digit',
            month: 'short'
        });
        const isStokIn = trans.type === 'in';
        return `
                <div class="jurnal-item card" data-action="open-stock-detail-and-actions-modal" data-local-id="${trans.localId}">
                    <div class="jurnal-item-content">
                        <div class="jurnal-item-header">
                            <strong>${material?.materialName || 'Material Dihapus'}</strong>
                            <strong class="${isStokIn?'positive' : 'negative'}">${isStokIn?'+' : '-'}${trans.quantity} ${material?.unit || ''}</strong>
                        </div>
                        <div class="jurnal-item-details">
                            <span>Tanggal: ${date}</span>
                            <span>${isStokIn?'Stok Masuk' : `Digunakan untuk: ${project?.projectName || 'N/A'}`}</span>
                        </div>
                    </div>
                </div>`;
    }).join('');
    container.innerHTML = `<div class="jurnal-list">${listHTML}</div>`;
}
async function handleEditStockTransaction(dataset) {
    const {
        id,
        type,
        qty,
        materialId,
        projectId
    } = dataset;
    const material = appState.materials.find(m => m.id === materialId);
    if (!material) return toast('error', 'Master material tidak ditemukan.');
    let content = '';
    if (type === 'out') {
        const projectOptions = appState.projects.map(p => ({
            value: p.id,
            text: p.projectName
        }));
        content = `
                <form id="edit-stock-form" data-id="${id}" data-type="${type}" data-old-qty="${qty}" data-material-id="${materialId}" data-async="true" method="PUT" data-endpoint="/api/stock/transactions/${id}" data-success-msg="Riwayat stok diperbarui">
                    <p>Mengubah data pemakaian untuk <strong>${material.materialName}</strong>.</p>
                    <div class="form-group"><label>Jumlah Keluar (dalam ${material.unit})</label><input type="number" name="quantity" value="${qty}" required min="1"></div>
                    ${createMasterDataSelect('projectId', 'Digunakan untuk Proyek', projectOptions, projectId)}
                    <button type="submit" class="btn btn-primary">Simpan Perubahan</button>
                </form>
            `;
    } else { // type 'in'
        content = `
                <form id="edit-stock-form" data-id="${id}" data-type="${type}" data-old-qty="${qty}" data-material-id="${materialId}" data-async="true" method="PUT" data-endpoint="/api/stock/transactions/${id}" data-success-msg="Riwayat stok diperbarui">
                    <p>Mengubah data stok masuk untuk <strong>${material.materialName}</strong>.</p>
                    <div class="form-group"><label>Jumlah Masuk (dalam ${material.unit})</label><input type="number" name="quantity" value="${qty}" required min="1"></div>
                    <button type="submit" class="btn btn-primary">Simpan Perubahan</button>
                </form>
            `;
    }

    createModal('dataDetail', {
        title: 'Edit Riwayat Stok',
        content
    });
    _initCustomSelects($('#dataDetail-modal'));
    $('#edit-stock-form').addEventListener('submit', (e) => {
        e.preventDefault();
        _processStockTransactionUpdate(e.target);
        closeModal($('#dataDetail-modal'));
    });
}

function handleDeleteStockTransaction(dataset) {
    createModal('confirmDelete', {
        message: 'Menghapus riwayat ini juga akan mengembalikan jumlah stok. Aksi ini tidak dapat dibatalkan. Lanjutkan?',
        onConfirm: () => _processStockTransactionDelete(dataset)
    });
}

async function _processStockTransactionUpdate(form) {
    const {
        id,
        type,
        oldQty,
        materialId
    } = form.dataset;
    const newQty = Number(form.elements.quantity.value);
    const qtyDifference = newQty - Number(oldQty);
    if (qtyDifference === 0 && type === 'in') {
        toast('info', 'Tidak ada perubahan data.');
        return;
    }
    toast('syncing', 'Memperbarui transaksi...');
    try {
        const transRef = doc(stockTransactionsCol, id);
        const materialRef = doc(materialsCol, materialId);
        const dataToUpdate = {
            quantity: newQty
        };
        if (type === 'out') {
            dataToUpdate.projectId = form.elements.projectId.value;
        }
        await runTransaction(db, async (transaction) => {
            transaction.update(transRef, dataToUpdate);
            const stockAdjustment = type === 'out'?-qtyDifference : qtyDifference;
            const mSnap = await transaction.get(materialRef);
            const mRev = mSnap.exists()?(mSnap.data().rev || 0) : 0;
            transaction.update(materialRef, {
                currentStock: increment(stockAdjustment),
                rev: mRev + 1,
                updatedAt: serverTimestamp()
            });
        });
        _logActivity('Mengedit Riwayat Stok', {
            transactionId: id,
            newQty
        });
        toast('success', 'Riwayat stok berhasil diperbarui.');
        renderStokPage();
    } catch (error) {
        toast('error', 'Gagal memperbarui riwayat.');
        console.error(error);
    }
}
async function _processStockTransactionDelete(dataset) {
    const {
        id,
        type,
        qty,
        materialId
    } = dataset;
    toast('syncing', 'Menghapus transaksi...');
    try {
        const transRef = doc(stockTransactionsCol, id);
        await runTransaction(db, async (transaction) => {
            let materialRef;
            let matDoc = null;
            if (materialId && materialId !== 'undefined') {
                materialRef = doc(materialsCol, materialId);
                matDoc = await transaction.get(materialRef);
            }
            transaction.delete(transRef);
            if (matDoc && matDoc.exists()) {
                const stockAdjustment = type === 'in'?-Number(qty) : Number(qty);
                transaction.update(materialRef, {
                    currentStock: increment(stockAdjustment)
                });
            } else if (materialId && materialId !== 'undefined') {
                console.warn(`Master material dengan ID ${materialId} tidak ditemukan. Melewatkan pembaruan stok.`);
            }
        });

        _logActivity('Menghapus Riwayat Stok', {
            transactionId: id
        });
        toast('success', 'Riwayat stok berhasil dihapus.');
        renderStokPage();
    } catch (error) {
        toast('error', 'Gagal menghapus riwayat.');
        console.error(error);
    }
}

async function handleStokInModal(materialId) {
    const material = appState.materials.find(m => m.id === materialId);
    if (!material) return toast('error', 'Material tidak ditemukan.');
    const content = `
            <form id="stok-in-form" data-id="${materialId}" data-async="true" method="POST" data-endpoint="/api/stock/in" data-success-msg="Stok masuk tersimpan">
                <p>Mencatat pembelian untuk <strong>${material.materialName}</strong>.</p>
                <div class="form-group"><label>Jumlah Masuk (dalam ${material.unit || 'satuan'})</label><input type="number" name="quantity" required min="1"></div>
                <div class="form-group"><label>Harga per Satuan</label><input type="text" name="price" inputmode="numeric" required></div>
                <div class="form-group"><label>Tanggal Pembelian</label><input type="date" name="date" value="${new Date().toISOString().slice(0,10)}" required></div>
                <button type="submit" class="btn btn-primary">Simpan</button>
            </form>
        `;
    createModal('dataDetail', {
        title: 'Form Stok Masuk',
        content
    });
    $('#stok-in-form input[name="price"]').addEventListener('input', _formatNumberInput);
    $('#stok-in-form').addEventListener('submit', (e) => {
        e.preventDefault();
        processStokIn(e.target);
        closeModal($('#dataDetail-modal'));
    });
}
async function handleStokOutModal(materialId) {
    const material = appState.materials.find(m => m.id === materialId);
    if (!material) return toast('error', 'Material tidak ditemukan.');
    const projectOptions = appState.projects.map(p => ({
        value: p.id,
        text: p.projectName
    }));
    const content = `
            <form id="stok-out-form" data-id="${materialId}" data-async="true" method="POST" data-endpoint="/api/stock/out" data-success-msg="Stok keluar tersimpan">
                <p>Mencatat pemakaian untuk <strong>${material.materialName}</strong>.</p>
                <div class="form-group"><label>Jumlah Keluar (dalam ${material.unit || 'satuan'})</label><input type="number" name="quantity" required min="1" max="${material.currentStock || 0}"></div>
                ${createMasterDataSelect('projectId', 'Digunakan untuk Proyek', projectOptions, '', 'projects')}
                <div class="form-group"><label>Tanggal Pemakaian</label><input type="date" name="date" value="${new Date().toISOString().slice(0,10)}" required></div>
                <button type="submit" class="btn btn-primary">Simpan</button>
            </form>
        `;
    createModal('dataDetail', {
        title: 'Form Stok Keluar',
        content
    });
    _initCustomSelects($('#dataDetail-modal'));
    $('#stok-out-form').addEventListener('submit', (e) => {
        e.preventDefault();
        processStokOut(e.target);
        closeModal($('#dataDetail-modal'));
    });
}
async function processStokIn(form) {
    const materialId = form.dataset.id;
    const quantity = Number(form.elements.quantity.value);
    const price = parseFormattedNumber(form.elements.price.value);
    const date = new Date(form.elements.date.value);

    toast('syncing', 'Menyimpan data stok...');
    try {
        const materialRef = doc(materialsCol, materialId);
        const transRef = doc(stockTransactionsCol);
        await runTransaction(db, async (transaction) => {
            const mSnap2 = await transaction.get(materialRef);
            const mRev2 = mSnap2.exists()?(mSnap2.data().rev || 0) : 0;
            transaction.update(materialRef, {
                currentStock: increment(quantity),
                rev: mRev2 + 1,
                updatedAt: serverTimestamp()
            });
            transaction.set(transRef, {
                materialId,
                quantity,
                date: Timestamp.fromDate(date),
                type: 'in',
                pricePerUnit: price,
                createdAt: serverTimestamp()
            });
        });
        _logActivity('Mencatat Stok Masuk', {
            materialId,
            quantity
        });
        toast('success', 'Stok berhasil diperbarui.');
        renderStokPage();
    } catch (error) {
        toast('error', 'Gagal memperbarui stok.');
        console.error(error);
    }
}
async function processStokOut(form) {
    const materialId = form.dataset.id;
    const quantity = Number(form.elements.quantity.value);
    const projectId = form.elements.projectId.value;
    const date = new Date(form.elements.date.value);
    if (!projectId) return toast('error', 'Proyek harus dipilih.');
    toast('syncing', 'Menyimpan data pemakaian...');
    try {
        const materialRef = doc(materialsCol, materialId);
        const transRef = doc(stockTransactionsCol);
        await runTransaction(db, async (transaction) => {
            const matDoc = await transaction.get(materialRef);
            if (!matDoc.exists() || (matDoc.data().currentStock || 0) < quantity) {
                throw new Error("Stok tidak mencukupi!");
            }
            const mSnap3 = await transaction.get(materialRef);
            const mRev3 = mSnap3.exists()?(mSnap3.data().rev || 0) : 0;
            transaction.update(materialRef, {
                currentStock: increment(-quantity),
                rev: mRev3 + 1,
                updatedAt: serverTimestamp()
            });
            transaction.set(transRef, {
                materialId,
                quantity,
                date: Timestamp.fromDate(date),
                type: 'out',
                projectId,
                createdAt: serverTimestamp()
            });
        });
        _logActivity('Mencatat Stok Keluar', {
            materialId,
            quantity,
            projectId
        });
        toast('success', 'Pemakaian stok berhasil dicatat.');
        renderStokPage();
    } catch (error) {
        toast('error', error.message || 'Gagal mencatat pemakaian.');
        console.error(error);
    }
}