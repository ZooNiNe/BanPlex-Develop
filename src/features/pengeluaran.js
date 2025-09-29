import { appState } from '../core/state.js';
import { $, $$, fmtIDR, parseFormattedNumber, _getJSDate, _animateTabSwitch, _formatNumberInput, generateUUID, parseLocaleNumber, _compressImage } from '../utils/helpers.js';
import { fetchAndCacheData, loadAllLocalDataToState } from '../core/data.js'; // To be created
import { expensesCol, billsCol, materialsCol } from '../config/firebase.js';
import { _setActiveListeners, syncToServer } from '../core/sync.js';
import { toast } from '../ui/toast.js';
import { localDB } from '../db/dexie.js';

// Placeholders for functions to be imported
const _getEmptyStateHTML = () => {};
const isViewer = () => appState.userRole === 'Viewer';
const _logActivity = () => {};
const _clearFormDraft = () => {};
const _attachFormDraftPersistence = () => {};
const createMasterDataSelect = () => {};
const _initCustomSelects = () => {};
const _initAutocomplete = () => {};
const _attachClientValidation = () => {};
const renderTagihanPage = () => {};
const _uploadFileToCloudinary = () => {};

export async function renderPengeluaranPage() {
    const container = $('.page-container');
    const tabs = [{
        id: 'operasional',
        label: 'Operasional'
    }, {
        id: 'material',
        label: 'Material'
    }, {
        id: 'lainnya',
        label: 'Lainnya'
    }];
    container.innerHTML = `
            <div class="sub-nav three-tabs">
                ${tabs.map((tab, index) => `<button class="sub-nav-item ${index === 0?'active' : ''}" data-tab="${tab.id}">${tab.label}</button>`).join('')}
            </div>
            <div id="sub-page-content"></div>
        `;

    const renderTabContent = async (tabId) => {
        appState.activeSubPage.set('pengeluaran', tabId);
        const contentContainer = $("#sub-page-content");
        contentContainer.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';

        await loadAllLocalDataToState();

        let formHTML;
        if (tabId === 'material') {
            formHTML = _getFormFakturMaterialHTML();
        } else {
            let categoryOptions = [],
                categoryMasterType = '',
                categoryLabel = '',
                categoryType = '';
            if (tabId === 'operasional') {
                categoryOptions = appState.operationalCategories.map(c => ({ value: c.id, text: c.categoryName }));
                categoryMasterType = 'op-cats';
                categoryLabel = 'Kategori Operasional';
                categoryType = 'Operasional';
            } else if (tabId === 'lainnya') {
                categoryOptions = appState.otherCategories.map(c => ({ value: c.id, text: c.categoryName }));
                categoryMasterType = 'other-cats';
                categoryLabel = 'Kategori Lainnya';
                categoryType = 'Lainnya';
            }
            const supplierOptions = appState.suppliers.filter(s => s.category === categoryType).map(s => ({ value: s.id, text: s.supplierName }));
            const projectOptions = appState.projects.map(p => ({ value: p.id, text: p.projectName }));
            formHTML = _getFormPengeluaranHTML(tabId, categoryOptions, categoryMasterType, categoryLabel, supplierOptions, projectOptions);
        }

        contentContainer.innerHTML = isViewer()? _getEmptyStateHTML({ icon:'lock', title:'Akses Terbatas', desc:'Halaman ini khusus untuk input data.' }) : formHTML;

        if (!isViewer()) {
            const formEl = $('#pengeluaran-form') || $('#material-invoice-form');
            if (formEl) {
                formEl.setAttribute('data-draft-key', `pengeluaran-${tabId}`);
                _attachFormDraftPersistence(formEl);
            }
            _attachPengeluaranFormListeners(tabId);
        }
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

    const lastSubPage = appState.activeSubPage.get('pengeluaran') || tabs[0].id;
    const initialTab = $(`.sub-nav-item[data-tab="${lastSubPage}"]`);
    if (initialTab) {
        $$('.sub-nav-item').forEach(b => b.classList.remove('active'));
        initialTab.classList.add('active');
    }
    await renderTabContent(lastSubPage);
    _setActiveListeners(['expenses', 'bills', 'comments']);
}

function _getFormPengeluaranHTML(type, categoryOptions, categoryMasterType, categoryLabel, supplierOptions, projectOptions) {
    return `
    <div class="card card-pad">
        <form id="pengeluaran-form" data-type="${type}" data-async="true" method="POST" data-endpoint="/api/expenses" data-success-msg="Pengeluaran tersimpan">
            ${createMasterDataSelect('expense-project', 'Proyek', projectOptions, '', 'projects')}
            ${categoryOptions.length > 0?createMasterDataSelect('expense-category', categoryLabel, categoryOptions, '', categoryMasterType) : ''}
            <div class="form-group">
                <label>Jumlah</label>
                <input type="text" id="pengeluaran-jumlah" name="pengeluaran-jumlah" inputmode="numeric" required placeholder="mis. 50.000">
            </div>
            <div class="form-group">
                <label>Deskripsi</label>
                <input type="text" id="pengeluaran-deskripsi" name="pengeluaran-deskripsi" required placeholder="mis. Beli ATK">
            </div>
            ${createMasterDataSelect('expense-supplier', 'Supplier/Penerima', supplierOptions, '', 'suppliers')}
            <div class="form-group">
                <label>Tanggal</label>
                <input type="date" id="pengeluaran-tanggal" name="pengeluaran-tanggal" value="${new Date().toISOString().slice(0,10)}" required>
            </div>
                        <h5 class="invoice-section-title" style="margin-top:1.5rem;">Lampiran (Opsional)</h5>
            <div class="form-group">
                <input type="file" name="attachmentFileCamera" accept="image/*" capture="environment" class="hidden-file-input" data-target-display="attachmentFile-display">
                <input type="file" name="attachmentFileGallery" accept="image/*" class="hidden-file-input" data-target-display="attachmentFile-display">
                <div class="upload-buttons">
                    <button type="button" class="btn btn-secondary" data-action="trigger-file-input" data-target="attachmentFileCamera"><span class="material-symbols-outlined">photo_camera</span> Kamera</button>
                    <button type="button" class="btn btn-secondary" data-action="trigger-file-input" data-target="attachmentFileGallery"><span class="material-symbols-outlined">image</span> Galeri</button>
                </div>
                <div class="file-name-display" id="attachmentFile-display">Belum ada file dipilih</div>
            </div>
            <div class="form-group">
                <label>Status Pembayaran</label>
                <div class="sort-direction">
                    <button type="button" class="btn-status-payment active" data-status="unpaid">Jadikan Tagihan</button>
                    <button type="button" class="btn-status-payment" data-status="paid">Sudah Lunas</button>
                </div>
                <input type="hidden" name="status" value="unpaid">
            </div>
            <button type="submit" class="btn btn-primary">Simpan Pengeluaran</button>
        </form>
    </div>
    `;
}

function _getFormFakturMaterialHTML() {
    const supplierOptions = appState.suppliers
        .filter(s => s.category === 'Material')
        .map(s => ({
            value: s.id,
            text: s.supplierName
        }));
    const projectOptions = appState.projects.map(p => ({
        value: p.id,
        text: p.projectName
    }));
    return `
        <div class="card card-pad">
            <form id="material-invoice-form" data-type="material" data-async="true" method="POST" data-endpoint="/api/invoices/material" data-success-msg="Faktur material tersimpan">
                <div class="form-group">
                    <label>Jenis Input</label>
                    <div class="sort-direction" id="form-type-selector">
                        <button type="button" class="form-type-btn active" data-type="faktur">Faktur Lengkap</button>
                        <button type="button" class="form-type-btn" data-type="surat_jalan">Surat Jalan</button>
                    </div>
                    <input type="hidden" name="formType" value="faktur">
                </div>
                ${createMasterDataSelect('project-id', 'Proyek', projectOptions, '', 'projects')}
                <div class="form-group">
                    <label>No. Faktur/Surat Jalan</label>
                    <input type="text" id="pengeluaran-deskripsi" name="pengeluaran-deskripsi" readonly class="readonly-input">
                </div>
                ${createMasterDataSelect('supplier-id', 'Supplier', supplierOptions, '', 'suppliers')}
                <div class="form-group">
                    <label>Tanggal</label>
                    <input type="date" id="pengeluaran-tanggal" name="pengeluaran-tanggal" value="${new Date().toISOString().slice(0,10)}" required>
                </div>
                <div class="section-header-flex" style="display:flex;justify-content:space-between;align-items:center;gap:.5rem;">
                    <h5 class="invoice-section-title" style="margin:0;">Rincian Barang</h5>
                </div>
                <div id="invoice-items-container"></div>
                <div class="add-item-action">
                    <button type="button" id="add-invoice-item-btn" class="btn-icon" title="Tambah Barang"><span class="material-symbols-outlined">add_circle</span></button>
                </div>
                                <div class="invoice-total" id="total-faktur-wrapper">
                    <span>Total Faktur:</span>
                    <strong id="invoice-total-amount">Rp 0</strong>
                </div>
                <div id="payment-status-wrapper" class="form-group">
                    <label>Status Pembayaran</label>
                    <div class="sort-direction">
                        <button type="button" class="btn-status-payment active" data-status="unpaid">Jadikan Tagihan</button>
                        <button type="button" class="btn-status-payment" data-status="paid">Sudah Lunas</button>
                    </div>
                    <input type="hidden" name="status" value="unpaid">
                </div>
                <h5 class="invoice-section-title">Lampiran (Opsional)</h5>
                <div class="form-group">
                    <label id="attachment-label">Upload Bukti Faktur</label>
                    <input type="file" name="attachmentFileCamera" accept="image/*" capture="environment" class="hidden-file-input" data-target-display="attachmentFile-display">
                    <input type="file" name="attachmentFileGallery" accept="image/*" class="hidden-file-input" data-target-display="attachmentFile-display">
                    <div class="upload-buttons">
                        <button type="button" class="btn btn-secondary" data-action="trigger-file-input" data-target="attachmentFileCamera"><span class="material-symbols-outlined">photo_camera</span> Kamera</button>
                        <button type="button" class="btn btn-secondary" data-action="trigger-file-input" data-target="attachmentFileGallery"><span class="material-symbols-outlined">image</span> Galeri</button>
                    </div>
                    <div class="file-name-display" id="attachmentFile-display">Belum ada file dipilih</div>
                </div>
                <button type="submit" class="btn btn-primary">Simpan</button>
            </form>
        </div>
        `;
}

function _attachPengeluaranFormListeners(type) {
    _initCustomSelects();
    const form = (type === 'material')?$('#material-invoice-form') : $('#pengeluaran-form');
    if (!form) return;

    form.querySelectorAll('.btn-status-payment').forEach(btn => {
        btn.addEventListener('click', () => {
            form.querySelectorAll('.btn-status-payment').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (form.querySelector('input[name="status"]')) {
                form.querySelector('input[name="status"]').value = btn.dataset.status;
            }
        });
    });

    if (type === 'material') {
        _initAutocomplete(form);

        $('#add-invoice-item-btn', form)?.addEventListener('click', () => {
            _addInvoiceItemRow(form);
            _initAutocomplete(form);
        });

        $('#invoice-items-container', form)?.addEventListener('input', (e) => _handleInvoiceItemChange(e, form));

        const invoiceNumberInput = $('#pengeluaran-deskripsi', form);
        if (invoiceNumberInput) {
            invoiceNumberInput.value = _generateInvoiceNumber();
        }

        if ($$('#invoice-items-container .invoice-item-row', form).length === 0) {
            _addInvoiceItemRow(form);
            _initAutocomplete(form);
        }

        const typeSelector = $('#form-type-selector', form);
        if (typeSelector) {
            typeSelector.querySelectorAll('.form-type-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    typeSelector.querySelectorAll('.form-type-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    const mode = btn.dataset.type;
                    const hidden = form.querySelector('input[name="formType"]');
                    if (hidden) hidden.value = mode;
                    _switchMaterialFormMode(form, mode);
                });
            });
        }
    } else {
        $('#pengeluaran-jumlah', form)?.addEventListener('input', _formatNumberInput);
        _attachClientValidation(form);
    }

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        handleAddPengeluaran(e, type);
    });
}

function _switchMaterialFormMode(form, mode) {
    const totalWrapper = $('#total-faktur-wrapper', form);
    const paymentWrapper = $('#payment-status-wrapper', form);
    const itemsContainer = $('#invoice-items-container', form);
    const attachmentLabel = $('#attachment-label', form);

    const isSuratJalan = mode === 'surat_jalan';
    if (totalWrapper) totalWrapper.classList.toggle('hidden', isSuratJalan);
    if (paymentWrapper) paymentWrapper.classList.toggle('hidden', isSuratJalan);

    if (attachmentLabel) {
        attachmentLabel.textContent = isSuratJalan ? 'Upload Bukti Surat Jalan' : 'Upload Bukti Faktur';
    }

    const existingItems = [];
    $$('.invoice-item-row', form).forEach(row => {
        existingItems.push({
            name: row.querySelector('input[name="itemName"]')?.value || '',
            id: row.querySelector('input[name="materialId"]')?.value || '',
            qty: row.querySelector('input[name="itemQty"]')?.value || '1',
            price: row.querySelector('input[name="itemPrice"]')?.value || ''
        });
    });

    itemsContainer.innerHTML = '';
    existingItems.forEach(itemData => {
        _addInvoiceItemRow(form);
        const newRow = itemsContainer.lastElementChild;
        if (newRow) {
            const nameInput = newRow.querySelector('input[name="itemName"]');
            const idInput = newRow.querySelector('input[name="materialId"]');
            const qtyInput = newRow.querySelector('input[name="itemQty"]');
            const priceInput = newRow.querySelector('input[name="itemPrice"]');

            if (nameInput) nameInput.value = itemData.name;
            if (idInput) idInput.value = itemData.id;
            if (qtyInput) qtyInput.value = itemData.qty;
            if (priceInput) priceInput.value = itemData.price;

            if(itemData.id) {
                if (nameInput) nameInput.readOnly = true;
                const clearBtn = newRow.querySelector('.autocomplete-clear-btn');
                if(clearBtn) clearBtn.style.display = 'flex';
            }
        }
    });

    _initAutocomplete(form);
    _updateInvoiceTotal(form);
}

async function handleAddPengeluaran(e, type) {
    e.preventDefault();
    const form = e.target;

    toast('syncing', 'Memvalidasi dan menyimpan data di perangkat...');

    try {
        const projectId = form.elements['expense-project']?.value || form.elements['project-id']?.value;
        if (!projectId) {
            toast('error', 'Proyek harus dipilih.');
            return;
        }

        const status = form.querySelector('input[name="status"]').value || 'unpaid';
        const date = new Date(form.elements['pengeluaran-tanggal'].value);
        const attachmentFile = form.elements.attachmentFileCamera?.files[0] || form.elements.attachmentFileGallery?.files[0];

        let expenseDetails = {};
        let itemsToUpdateStock = [];

        if (type === 'material') {
            const formMode = form.elements['formType']?.value || 'faktur';
            const items = [];
            if (formMode === 'surat_jalan') {
                $$('.invoice-item-row', form).forEach(row => {
                    const materialId = row.querySelector('input[name="materialId"]').value || null;
                    const qty = parseLocaleNumber(row.querySelector('input[name="itemQty"]').value);
                    if (materialId && qty > 0) {
                        const mat = appState.materials.find(m => m.id === materialId);
                        items.push({ name: mat?.materialName || '', price: 0, qty, total: 0, materialId });
                        itemsToUpdateStock.push({ materialId, qty, price: 0 });
                    }
                });
                if (items.length === 0) { toast('error', 'Harap tambahkan minimal satu barang.'); return; }
                expenseDetails = {
                    amount: 0,
                    description: form.elements['pengeluaran-deskripsi'].value.trim() || 'Surat Jalan',
                    supplierId: form.elements['supplier-id'].value,
                    items
                };
            } else {
                $$('.invoice-item-row', form).forEach(row => {
                    const name = row.querySelector('input[name="itemName"]').value;
                    const price = parseFormattedNumber(row.querySelector('input[name="itemPrice"]').value);
                    const qty = parseLocaleNumber(row.querySelector('input[name="itemQty"]').value);
                    const materialId = row.querySelector('input[name="materialId"]').value || null;
                    if (name && price > 0 && qty > 0) {
                        items.push({ name, price, qty, total: price * qty, materialId });
                        if (materialId) itemsToUpdateStock.push({ materialId, qty, price });
                    }
                });
                if (items.length === 0) { toast('error', 'Harap tambahkan minimal satu barang.'); return; }
                expenseDetails = {
                    amount: items.reduce((sum, item) => sum + item.total, 0),
                    description: form.elements['pengeluaran-deskripsi'].value.trim() || `Faktur ${items[0].name}`,
                    supplierId: form.elements['supplier-id'].value,
                    items
                };
            }
        } else {
            expenseDetails = {
                amount: parseFormattedNumber(form.elements['pengeluaran-jumlah'].value),
                description: form.elements['pengeluaran-deskripsi'].value.trim(),
                supplierId: form.elements['expense-supplier'].value,
                categoryId: form.elements['expense-category']?.value || '',
            };
        }

        const requiresAmount = !(type === 'material' && (form.elements['formType']?.value || 'faktur') === 'surat_jalan');
        if ((requiresAmount && !expenseDetails.amount) || !expenseDetails.description) {
            toast('error', requiresAmount ? 'Harap isi deskripsi dan jumlah.' : 'Harap isi deskripsi.');
            return;
        }

        const expenseToStore = {
            ...expenseDetails,
            type,
            projectId,
            status,
            formType: (type === 'material') ? (form.elements['formType']?.value || 'faktur') : undefined,
            date,
            createdAt: new Date(),
            needsSync: 1,
            isDeleted: 0,
            attachmentUrl: '',
            attachmentNeedsSync: !!attachmentFile,
            localAttachmentId: null
        };

        if (attachmentFile) {
            const compressed = await _compressImage(attachmentFile, 0.85, 1280);
            const blob = compressed || attachmentFile;
            const fileId = `file_${Date.now()}_${attachmentFile.name}`;
            await localDB.files.put({
                id: fileId,
                file: blob,
                addedAt: new Date(),
                size: blob.size || 0
            });
            expenseToStore.localAttachmentId = fileId;
        }

        await localDB.transaction('rw', localDB.expenses, localDB.bills, localDB.stock_transactions, localDB.materials, async () => {
            if (!expenseToStore.id) expenseToStore.id = generateUUID();
            if (type === 'material' && expenseToStore.formType === 'surat_jalan') {
                expenseToStore.status = 'delivery_order';
            }
            await localDB.expenses.add(expenseToStore);

            if (!(type === 'material' && expenseToStore.status === 'delivery_order')) {
                const billData = {
                    id: generateUUID(),
                    expenseId: expenseToStore.id,
                    description: expenseDetails.description,
                    amount: expenseDetails.amount,
                    dueDate: date,
                    status: status,
                    type: type,
                    projectId: projectId,
                    createdAt: new Date(),
                    paidAmount: status === 'paid'?expenseDetails.amount : 0,
                    ...(status === 'paid' && { paidAt: new Date() }),
                    needsSync: 1,
                    isDeleted: 0
                };
                await localDB.bills.add(billData);
            }

            if (type === 'material' && expenseToStore.status !== 'delivery_order' && status === 'paid' && itemsToUpdateStock.length > 0) {
                for (const item of itemsToUpdateStock) {
                    await localDB.materials.where('id').equals(item.materialId).modify(m => {
                        m.currentStock = (m.currentStock || 0) + item.qty;
                        m.lastPrice = item.price;
                    });
                    await localDB.stock_transactions.add({
                        id: generateUUID(),
                        materialId: item.materialId,
                        quantity: item.qty,
                        date: date,
                        type: 'in',
                        pricePerUnit: item.price,
                        createdAt: new Date(),
                        needsSync: 1,
                        isDeleted: 0
                    });
                }
            } else if (type === 'material' && expenseToStore.status === 'delivery_order' && itemsToUpdateStock.length > 0) {
                for (const item of itemsToUpdateStock) {
                    await localDB.materials.where('id').equals(item.materialId).modify(m => {
                        m.currentStock = (m.currentStock || 0) - item.qty;
                    });
                    await localDB.stock_transactions.add({
                        id: generateUUID(),
                        materialId: item.materialId,
                        quantity: item.qty,
                        date: date,
                        type: 'out',
                        projectId: projectId,
                        expenseId: expenseToStore.id,
                        createdAt: new Date(),
                        needsSync: 1,
                        isDeleted: 0
                    });
                }
            }
        });

        _logActivity(`Menambah Pengeluaran (Lokal): ${expenseDetails.description}`, {
            amount: expenseDetails.amount
        });
        if (!navigator.onLine) {
            toast('info', 'Info: Offline. Data disimpan di perangkat & akan disinkronkan nanti.');
        } else {
            toast('success', 'Pengeluaran berhasil disimpan!');
        }

        form.reset();
        _clearFormDraft(form);
        _initCustomSelects(form);
        if (type === 'material') {
            $('#invoice-items-container').innerHTML = '';
            _addInvoiceItemRow(form);
            _updateInvoiceTotal(form);
        }

        await loadAllLocalDataToState();
        renderTagihanPage();
        syncToServer();
    } catch (error) {
        toast('error', `Gagal menyimpan data: ${error.message}`);
        console.error("Error saving expense locally:", error);
    }
}

function _addInvoiceItemRow(context = document) {
    const container = $('#invoice-items-container', context);
    if (!container) return;
    const index = container.children.length;
    const mode = context?.querySelector?.('input[name="formType"]')?.value || 'faktur';
    let itemHTML = '';
    if (mode === 'surat_jalan') {
        itemHTML = `
        <div class="invoice-item-row" data-index="${index}">
            <div class="autocomplete-wrapper item-name-wrapper">
                <input type="text" name="itemName" placeholder="Ketik nama material..." class="autocomplete-input item-name" required autocomplete="off">
                <input type="hidden" name="materialId" class="autocomplete-id">
                <button type="button" class="autocomplete-clear-btn" style="display: none;" title="Hapus Pilihan">
                    <span class="material-symbols-outlined">close</span>
                </button>
                <div class="autocomplete-suggestions"></div>
            </div>
            <div class="item-details">
                <input type="text" inputmode="decimal" pattern="[0-9]+([\\.,][0-9]+)?" name="itemQty" placeholder="Qty" class="item-qty" value="1" required>
                <span class="item-unit" style="margin-left: 0.25rem;"></span>
                <button type="button" class="btn-icon add-master-btn" data-action="add-new-material" title="Tambah Master Material"><span class="material-symbols-outlined">add</span></button>
            </div>
            <button type="button" class="btn-icon btn-icon-danger remove-item-btn"><span class="material-symbols-outlined">delete</span></button>
        </div>`;
    } else {
        itemHTML = `
        <div class="invoice-item-row" data-index="${index}">
            <div class="autocomplete-wrapper item-name-wrapper">
                <input type="text" name="itemName" placeholder="Ketik nama material..." class="autocomplete-input item-name" required autocomplete="off">
                <input type="hidden" name="materialId" class="autocomplete-id">
                <button type="button" class="autocomplete-clear-btn" style="display: none;" title="Hapus Pilihan">
                    <span class="material-symbols-outlined">close</span>
                </button>
                <div class="autocomplete-suggestions"></div>
            </div>
            <div class="item-details">
                <input type="text" inputmode="numeric" name="itemPrice" placeholder="Harga" class="item-price" required>
                <span>x</span>
                <input type="text" inputmode="decimal" pattern="[0-9]+([\\.,][0-9]+)?" name="itemQty" placeholder="Qty" class="item-qty" value="1" required>
                <span class="item-unit" style="margin-left: 0.25rem;"></span>
                <button type="button" class="btn-icon add-master-btn" data-action="add-new-material" title="Tambah Master Material"><span class="material-symbols-outlined">add</span></button>
            </div>
            <span class="item-total">Rp 0</span>
            <button type="button" class="btn-icon btn-icon-danger remove-item-btn"><span class="material-symbols-outlined">delete</span></button>
        </div>`;
    }
    container.insertAdjacentHTML('beforeend', itemHTML);
    const newRow = container.lastElementChild;
    newRow.classList.add('new-item');
    const removeBtn = newRow.querySelector('.remove-item-btn');
    if (removeBtn) {
        removeBtn.addEventListener('click', () => {
            newRow.style.transition = 'opacity 0.3s ease, transform 0.3s ease, max-height 0.3s ease, padding 0.3s ease, margin 0.3s ease';
            newRow.style.opacity = '0';
            newRow.style.transform = 'scale(0.95)';
            newRow.style.maxHeight = '0';
            newRow.style.padding = '0';
            newRow.style.margin = '0';
            setTimeout(() => {
                newRow.remove();
                _updateInvoiceTotal(context);
            }, 300);
        });
    }
    if (mode === 'faktur') {
        newRow.querySelectorAll('input[inputmode="numeric"]').forEach(input => {
            input.addEventListener('input', _formatNumberInput);
        });
    }
}

function _handleInvoiceItemChange(e, context = document) {
    if (!e.target.matches('.item-price, .item-qty')) return;
    const row = e.target.closest('.invoice-item-row');
    const priceEl = row.querySelector('.item-price');
    const qty = parseLocaleNumber(row.querySelector('.item-qty').value);
    const totalEl = row.querySelector('.item-total');
    if (priceEl && totalEl) {
        const price = parseFormattedNumber(priceEl.value);
        totalEl.textContent = fmtIDR(price * qty);
        _updateInvoiceTotal(context);
    }
}

function _updateInvoiceTotal(context = document) {
    let totalAmount = 0;
    const rows = $$('.invoice-item-row', context);
    const hasPrice = !!context.querySelector('.item-price');
    if (hasPrice) {
        rows.forEach(row => {
            const priceEl = row.querySelector('.item-price');
            const qtyEl = row.querySelector('.item-qty');
            if (!priceEl || !qtyEl) return;
            const price = parseFormattedNumber(priceEl.value);
            const qty = parseLocaleNumber(qtyEl.value);
            totalAmount += price * qty;
        });
    } else {
        totalAmount = 0;
    }
    const totalEl = $('#invoice-total-amount', context);
    if (totalEl) totalEl.textContent = fmtIDR(totalAmount);
}

function _generateInvoiceNumber() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const randomPart = Math.random().toString(36).substring(2, 7).toUpperCase();
    return `INV/${year}${month}${day}/${randomPart}`;
}

async function _updateStockAfterInvoice(items) {
    if (!items || items.length === 0) return;

    try {
        const batch = writeBatch(db);
        const stockTransCol = collection(db, 'teams', TEAM_ID, 'stock_transactions');

        for (const item of items) {
            if (item.materialId) {
                const materialRef = doc(db, 'teams', TEAM_ID, 'materials', item.materialId);
                batch.update(materialRef, {
                    currentStock: increment(item.qty)
                });
                const transRef = doc(stockTransCol);
                batch.set(transRef, {
                    materialId: item.materialId,
                    quantity: item.qty,
                    type: 'in',
                    date: serverTimestamp()
                });
            }
        }
        await batch.commit();
        console.log('Stok berhasil diperbarui secara otomatis.');
    } catch (error) {
        console.error('Gagal update stok otomatis:', error);
        toast('error', 'Gagal memperbarui stok secara otomatis.');
    }
}