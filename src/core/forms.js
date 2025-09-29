import { parseFormattedNumber, $$, parseLocaleNumber } from '../utils/helpers.js';
import { appState } from './state.js';

// These will be replaced with actual imports once the feature modules are refactored.
const handleAddPemasukan = () => {};
const handleAddPengeluaran = () => {};
const handleAddMasterItem = () => {};
const handleUpdateMasterItem = () => {};
const handleProcessBillPayment = () => {};
const handleProcessPayment = () => {};
const handleProcessIndividualSalaryPayment = () => {};
const handleUpdateItem = () => {};
const handleUpdateAttendance = () => {};
const handleSaveManualAttendance = () => {};
const processStokIn = () => {};
const processStokOut = () => {};
const _processStockTransactionUpdate = () => {};


function _serializeForm(form) {
    const fd = new FormData(form);
    const data = {};
    for (const [k, v] of fd.entries()) {
        if (data[k] !== undefined) {
            if (!Array.isArray(data[k])) data[k] = [data[k]];
            data[k].push(v);
        } else {
            data[k] = v;
        }
    }
    return data;
}

function _buildApiPayload(form) {
    const id = form.id;
    const type = form.dataset.type;
    const g = (sel) => form.querySelector(sel);
    const gv = (sel) => g(sel)?.value;
    if (id === 'pemasukan-form') {
        if (type === 'termin') {
            const amount = parseFormattedNumber(gv('#pemasukan-jumlah'));
            const date = new Date(gv('#pemasukan-tanggal'));
            const projectId = gv('#pemasukan-proyek');
            const feeChecks = $$('.fee-alloc-checkbox:checked');
            const feeAllocations = feeChecks.map(cb => ({ staffId: cb.dataset.staffId, amount: Number(cb.dataset.amount || 0) }));
            return { amount, date, projectId, feeAllocations };
        } else if (type === 'pinjaman') {
            return {
                amount: parseFormattedNumber(gv('#pemasukan-jumlah')),
                date: new Date(gv('#pemasukan-tanggal')),
                creditorId: gv('#pemasukan-kreditur'),
                interestType: gv('#loan-interest-type'),
                rate: Number(gv('#loan-rate') || 0),
                tenor: Number(gv('#loan-tenor') || 0)
            };
        }
    }
    if (id === 'pengeluaran-form') {
        return {
            type,
            projectId: gv('#expense-project'),
            categoryId: gv('#expense-category') || null,
            supplierId: gv('#supplier-id') || null,
            amount: parseFormattedNumber(gv('#pengeluaran-jumlah')),
            description: gv('#pengeluaran-deskripsi') || '',
            date: new Date(gv('#pengeluaran-tanggal')),
            status: form.querySelector('input[name="status"]')?.value || 'unpaid'
        };
    }
    if (id === 'material-invoice-form') {
        const items = $$('#invoice-items-container .invoice-item-row', form).map(row => {
            const mId = row.querySelector('[name="materialId"], [data-material-id]')?.value || row.dataset.materialId || null;
            const qtyRaw = row.querySelector('input[name="itemQty"], [name="quantity"], .item-qty, .qty')?.value || row.dataset.qty || 0;
            const qty = parseLocaleNumber(qtyRaw);
            const price = parseFormattedNumber(row.querySelector('input[name="itemPrice"], [name="price"], .item-price, .price')?.value || '0');
            return { materialId: mId, qty, price };
        });
        return {
            projectId: gv('#project-id'),
            supplierId: gv('#supplier-id'),
            date: new Date(gv('#pengeluaran-tanggal')),
            formType: gv('input[name="formType"]') || 'faktur',
            items
        };
    }
    if (id === 'payment-form') {
        const billId = form.dataset.id || form.dataset.billId;
        if (type === 'bill') {
            return { billId, amount: parseFormattedNumber(form.elements.amount.value), date: new Date(form.elements.date.value) };
        } else if (type === 'pinjaman' || type === 'loan') {
            return { loanId: billId, amount: parseFormattedNumber(form.elements.amount.value), date: new Date(form.elements.date.value) };
        } else if (type === 'individual-salary') {
            return {
                billId: form.dataset.billId,
                workerId: form.dataset.workerId,
                amount: parseFormattedNumber(form.elements.amount?.value || '0'),
                date: new Date(form.elements.date?.value || new Date())
            };
        }
    }
    if (id === 'stok-in-form') {
        return {
            materialId: form.dataset.id,
            quantity: Number(form.elements.quantity.value),
            price: parseFormattedNumber(form.elements.price.value),
            date: new Date(form.elements.date.value)
        };
    }
    if (id === 'stok-out-form') {
        return {
            materialId: form.dataset.id,
            quantity: Number(form.elements.quantity.value),
            projectId: form.elements.projectId.value,
            date: new Date(form.elements.date.value)
        };
    }
    if (id === 'manual-attendance-form') {
        const dateStr = gv('#manual-attendance-date');
        const projectId = gv('#manual-attendance-project');
        const records = $$('.attendance-status-selector', form).map(sel => {
            const workerId = sel.dataset.workerId;
            const status = sel.querySelector('input:checked')?.value || 'absent';
            const pay = Number(sel.closest('.manual-attendance-item')?.querySelector('.worker-wage')?.dataset?.pay || 0);
            return { workerId, status, pay };
        });
        return { projectId, date: new Date(dateStr), records };
    }
    if (id === 'edit-attendance-form') {
        const recordId = form.dataset.id;
        if (type === 'manual') {
            return { id: recordId, type, status: form.elements.status.value };
        }
        if (type === 'timestamp') {
            return { id: recordId, type, checkIn: form.elements.checkIn.value, checkOut: form.elements.checkOut.value };
        }
    }
    if (id === 'edit-stock-form') {
        const q = Number(form.elements.quantity.value);
        const payload = { id: form.dataset.id, type: form.dataset.type, quantity: q };
        if (form.dataset.type === 'out') payload.projectId = form.elements.projectId.value;
        return payload;
    }
    if (id === 'add-master-item-form') {
        const t = form.dataset.type;
        const name = form.elements.itemName.value.trim();
        const base = { type: t, name };
        if (t === 'materials') base.unit = form.elements.itemUnit.value.trim();
        if (t === 'suppliers') base.category = form.elements.itemCategory.value;
        if (t === 'projects') { base.projectType = form.elements.projectType.value; base.budget = parseFormattedNumber(form.elements.budget.value); }
        if (t === 'staff') {
            base.paymentType = form.elements.paymentType.value;
            base.salary = parseFormattedNumber(form.elements.salary.value) || 0;
            base.feePercentage = Number(form.elements.feePercentage.value) || 0;
            base.feeAmount = parseFormattedNumber(form.elements.feeAmount.value) || 0;
        }
        if (t === 'workers') {
            base.professionId = form.elements.professionId.value;
            base.status = form.elements.workerStatus.value;
            const wages = {}; appState.projects.forEach(p => { const v = parseFormattedNumber(form.elements[`project_wage_${p.id}`]?.value || '0'); if (v > 0) wages[p.id] = v; });
            base.projectWages = wages;
        }
        return base;
    }
    if (id === 'edit-master-form') {
        const t = form.dataset.type; const base = { id: form.dataset.id, type: t, name: form.elements.itemName.value.trim() };
        if (t === 'materials') { base.unit = form.elements.unit.value.trim(); base.reorderPoint = Number(form.elements.reorderPoint.value) || 0; }
        if (t === 'suppliers') base.category = form.elements.itemCategory.value;
        if (t === 'projects') { base.projectType = form.elements.projectType.value; base.budget = parseFormattedNumber(form.elements.budget.value); }
        if (t === 'staff') { base.paymentType = form.elements.paymentType.value; base.salary = parseFormattedNumber(form.elements.salary.value) || 0; base.feePercentage = Number(form.elements.feePercentage.value) || 0; base.feeAmount = parseFormattedNumber(form.elements.feeAmount.value) || 0; }
        if (t === 'workers') { base.professionId = form.elements.professionId.value; base.status = form.elements.workerStatus.value; const wages={}; appState.projects.forEach(p=>{const v=parseFormattedNumber(form.elements[`project_wage_${p.id}`]?.value || '0'); if (v>0) wages[p.id]=v;}); base.projectWages = wages; }
        return base;
    }
    if (id === 'edit-item-form') {
        const t = form.dataset.type;
        const payload = { id: form.dataset.id, type: t };
        if (t === 'expense') {
            payload.amount = parseFormattedNumber(form.elements.amount.value);
            payload.description = form.elements.description.value;
            if (form.elements.categoryId) payload.categoryId = form.elements.categoryId.value;
            payload.date = new Date(form.elements.date.value);
        } else if (t === 'loan') {
            payload.totalAmount = parseFormattedNumber(form.elements.totalAmount.value);
            payload.date = new Date(form.elements.date.value);
            payload.creditorId = form.elements.creditorId.value;
            payload.interestType = form.elements.interestType.value;
            payload.rate = Number(form.elements.rate.value || 0);
            payload.tenor = Number(form.elements.tenor.value || 0);
        } else if (t === 'fee_bill') {
            payload.description = form.elements.description.value;
            payload.amount = parseFormattedNumber(form.elements.amount.value);
        }
        return payload;
    }
    return _serializeForm(form);
}

export async function _submitFormAsync(form) {
    const endpoint = form.getAttribute('action') || form.dataset.endpoint;
    if (!endpoint) throw new Error('Endpoint form tidak ditemukan');
    const method = (form.getAttribute('method') || 'POST').toUpperCase();
    const isMultipart = (form.getAttribute('enctype') || '').includes('multipart/form-data') || form.querySelector('input[type="file"]');
    let body;
    const headers = { 'Accept': 'application/json' };
    try {
        const isDevStatic = (location.hostname === '127.0.0.1' || location.hostname === 'localhost') && (location.port === '5500' || location.port === '5501');
        const isAppApi = typeof endpoint === 'string' && endpoint.startsWith('/api/');
        if (isDevStatic && isAppApi) {
            throw new Error('DEV_NO_API');
        }
    } catch (_) { /* ignore */ }
    if (isMultipart) {
        body = new FormData(form);
    } else {
        headers['Content-Type'] = 'application/json';
        const built = _buildApiPayload(form);
        body = JSON.stringify(built ?? _serializeForm(form));
    }
    const res = await fetch(endpoint, { method, body, headers });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `HTTP ${res.status}`);
    }
    let data = null;
    try { data = await res.json(); } catch (_) { data = await res.text().catch(() => ({})); }
    return data;
}

export async function _fallbackLocalFormHandler(form) {
    const id = form.id;
    const type = form.dataset.type;
    const fakeEvent = { preventDefault() {}, target: form };
    try {
        if (id === 'pemasukan-form') {
            return await handleAddPemasukan(fakeEvent);
        }
        if (id === 'pengeluaran-form') {
            return await handleAddPengeluaran(fakeEvent, type);
        }
        if (id === 'material-invoice-form') {
            return await handleAddPengeluaran(fakeEvent, 'material');
        }
        if (id === 'add-master-item-form') {
            return await handleAddMasterItem(form);
        }
        if (id === 'edit-master-form') {
            return await handleUpdateMasterItem(form);
        }
        if (id === 'payment-form') {
            if (type === 'bill') return await handleProcessBillPayment(form);
            if (type === 'pinjaman' || type === 'loan') return await handleProcessPayment(form);
            if (type === 'individual-salary') return await handleProcessIndividualSalaryPayment(form);
        }
        if (id === 'edit-item-form') {
            return await handleUpdateItem(form);
        }
        if (id === 'edit-attendance-form') {
            return await handleUpdateAttendance(form);
        }
        if (id === 'manual-attendance-form') {
            return await handleSaveManualAttendance(fakeEvent);
        }
        if (id === 'stok-in-form') {
            return await processStokIn(form);
        }
        if (id === 'stok-out-form') {
            return await processStokOut(form);
        }
        if (id === 'edit-stock-form') {
            return await _processStockTransactionUpdate(form);
        }
        throw new Error(`No fallback handler for form id=${id}`);
    } catch (e) {
        console.warn('Fallback handler gagal:', e);
        throw e;
    }
}

function _getFormDraftKey(form) {
    const k = form.getAttribute('data-draft-key');
    return k ? `draft:${k}` : null;
}

function _saveFormDraft(form) {
    try {
        const key = _getFormDraftKey(form);
        if (!key) return;
        const data = {};
        form.querySelectorAll('input, select, textarea').forEach(el => {
            if (el.type === 'file') return;
            const name = el.name || el.id;
            if (!name) return;
            if (el.type === 'checkbox' || el.type === 'radio') {
                if (el.checked) data[name] = el.value || true;
            } else {
                data[name] = el.value;
            }
        });
        sessionStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
        console.warn('Gagal menyimpan draf', e);
    }
}

function _restoreFormDraft(form) {
    try {
        const key = _getFormDraftKey(form);
        if (!key) return;
        const raw = sessionStorage.getItem(key);
        if (!raw) return;
        const data = JSON.parse(raw);
        Object.entries(data).forEach(([name, val]) => {
            const el = form.querySelector(`[name="${name}"]`) || form.querySelector(`#${name}`);
            if (!el) return;
            if (el.type === 'checkbox' || el.type === 'radio') {
                const candidate = form.querySelector(`[name="${name}"][value="${val}"]`);
                if (candidate) candidate.checked = true;
            } else {
                el.value = val;
            }
        });
    } catch (e) {
        console.warn('Gagal memulihkan draf', e);
    }
}

function _clearFormDraft(form) {
    try {
        const key = _getFormDraftKey(form);
        if (key) sessionStorage.removeItem(key);
    } catch (e) {
        console.warn('Gagal menghapus draf', e);
    }
}

export function _attachFormDraftPersistence(form) {
    if (!form) return;
    _restoreFormDraft(form);
    const handler = () => _saveFormDraft(form);
    form.addEventListener('input', handler);
    form.addEventListener('change', handler, true);
    form._clearDraft = () => _clearFormDraft(form);
}