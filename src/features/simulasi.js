import { appState } from '../core/state.js';
import { $, $$, fmtIDR, parseFormattedNumber, _getJSDate, _formatNumberInput, animateNumber } from '../utils/helpers.js';
import { fetchAndCacheData } from '../core/data.js'; // To be created
import { billsCol, fundingSourcesCol, workersCol, suppliersCol, expensesCol, fundingCreditorsCol, staffCol, projectsCol } from '../config/firebase.js';
import { _setActiveListeners } from '../core/sync.js';
import { createModal, closeModal } from '../ui/modals.js';
import { toast } from '../ui/toast.js';

// Placeholders
const generatePdfReport = () => {};

function _createNestedAccordionHTML(title, items) {
  if (!items || items.length === 0) return '';
  const totalSectionAmount = items.reduce((sum, item) => sum + item.remainingAmount, 0);
  const groupedItems = items.reduce((acc, item) => {
      const key = item.groupId || 'lainnya';
      if (!acc[key]) {
          acc[key] = {
              name: item.groupName || 'Lainnya',
              items: [],
              total: 0
          };
      }
      acc[key].items.push(item);
      acc[key].total += item.remainingAmount;
      return acc;
  }, {});
  const createPaymentCard = (item) => `
      <div class="card simulasi-item" data-id="${item.id}" data-full-amount="${item.remainingAmount}" data-partial-allowed="true" data-title="${item.title || 'N/A'}" data-description="${item.description}">
          <div class="simulasi-info">
              <div class="simulasi-title">${item.description}</div>
          </div>
          <div class="simulasi-amount">${fmtIDR(item.remainingAmount)}</div>
      </div>`;
  const subAccordionsHTML = Object.values(groupedItems).map(group => `
      <div class="simulasi-subsection">
          <button class="simulasi-subsection-header">
              <div class="header-info">
                  <span class="header-title">${group.name}</span>
                  <span class="header-total">${fmtIDR(group.total)}</span>
              </div>
              <span class="material-symbols-outlined header-icon">expand_more</span>
          </button>
          <div class="simulasi-subsection-content">
              ${group.items.map(createPaymentCard).join('')}
          </div>
      </div>
  `).join('');
  return `
      <div class="card simulasi-section">
          <button class="simulasi-section-header">
               <div class="header-info">
                  <span class="header-title">${title}</span>
                  <span class="header-total">${items.length} Tagihan - Total ${fmtIDR(totalSectionAmount)}</span>
              </div>
              <span class="material-symbols-outlined header-icon">expand_more</span>
          </button>
          <div class="simulasi-section-content">
              ${subAccordionsHTML}
          </div>
      </div>`;
}
export async function renderSimulasiBayarPage() {
  const container = $('.page-container');
  container.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';
  appState.simulasiState.selectedPayments.clear();
  await Promise.all([
      fetchAndCacheData('bills', billsCol), fetchAndCacheData('fundingSources', fundingSourcesCol),
      fetchAndCacheData('workers', workersCol, 'workerName'), fetchAndCacheData('suppliers', suppliersCol, 'supplierName'),
      fetchAndCacheData('expenses', expensesCol), fetchAndCacheData('fundingCreditors', fundingCreditorsCol, 'creditorName'),
      fetchAndCacheData('staff', staffCol, 'staffName'), fetchAndCacheData('projects', projectsCol)
  ]);
  const unpaidBills = appState.bills.filter(b => b.status === 'unpaid');
  const unpaidLoans = appState.fundingSources.filter(f => f.status === 'unpaid');
  const staffFees = unpaidBills.filter(b => b.type === 'fee').map(b => {
      const staff = appState.staff.find(s => s.id === b.staffId);
      return {
          id: `bill-${b.id}`,
          title: staff?.staffName,
          description: b.description,
          remainingAmount: b.amount - (b.paidAmount || 0),
          groupId: b.staffId || 'lainnya',
          groupName: staff?.staffName || 'Fee Lainnya'
      };
  });
  const workerSalaries = unpaidBills.filter(b => b.type === 'gaji').map(b => {
      const worker = appState.workers.find(w => w.id === b.workerId);
      return {
          id: `bill-${b.id}`,
          title: worker?.workerName,
          description: b.description,
          remainingAmount: b.amount - (b.paidAmount || 0),
          groupId: b.workerId || 'lainnya',
          groupName: worker?.workerName || 'Gaji Lainnya'
      };
  });

  const createBillItem = (b, type) => {
      const expense = appState.expenses.find(e => e.id === b.expenseId);
      const supplier = appState.suppliers.find(s => s.id === expense?.supplierId);
      return {
          id: `bill-${b.id}`,
          title: supplier?.supplierName,
          description: b.description,
          remainingAmount: b.amount - (b.paidAmount || 0),
          groupId: expense?.supplierId || 'lainnya',
          groupName: supplier?.supplierName || 'Lainnya'
      };
  };
  const materialBills = unpaidBills.filter(b => b.type === 'material').map(b => createBillItem(b));
  const operasionalBills = unpaidBills.filter(b => b.type === 'operasional').map(b => createBillItem(b));
  const lainnyaBills = unpaidBills.filter(b => b.type === 'lainnya').map(b => createBillItem(b));
  const loans = unpaidLoans.map(l => {
      const creditor = appState.fundingCreditors.find(c => c.id === l.creditorId);
      return {
          id: `loan-${l.id}`,
          title: creditor?.creditorName,
          description: 'Cicilan Pinjaman',
          remainingAmount: (l.totalRepaymentAmount || l.totalAmount) - (l.paidAmount || 0),
          groupId: l.creditorId || 'lainnya',
          groupName: creditor?.creditorName || 'Pinjaman Lainnya'
      };
  });
  container.innerHTML = `
      <div class="card card-pad simulasi-summary">
          <div class="form-group">
              <label>Dana Masuk (Uang di Tangan)</label>
              <input type="text" id="simulasi-dana-masuk" inputmode="numeric" placeholder="mis. 10.000.000">
          </div>
          <div class="simulasi-totals">
              <div><span class="label">Total Alokasi</span><strong id="simulasi-total-alokasi">Rp 0</strong></div>
              <div><span class="label">Sisa Dana</span><strong id="simulasi-sisa-dana">Rp 0</strong></div>
          </div>
          <div class="rekap-actions"><button id="simulasi-buat-pdf" class="btn btn-primary"><span class="material-symbols-outlined">picture_as_pdf</span> Buat Laporan PDF</button></div>
      </div>
      <div id="simulasi-utang-list">
           ${_createNestedAccordionHTML('Gaji Staf & Fee', staffFees)}
           ${_createNestedAccordionHTML('Tagihan Gaji Pekerja', workerSalaries)}
           ${_createNestedAccordionHTML('Tagihan Material', materialBills)}
           ${_createNestedAccordionHTML('Tagihan Operasional', operasionalBills)}
           ${_createNestedAccordionHTML('Tagihan Lainnya', lainnyaBills)}
           ${_createNestedAccordionHTML('Cicilan Pinjaman', loans)}
      </div>
  `;
  $$('.simulasi-section-header, .simulasi-subsection-header').forEach(header => {
      header.addEventListener('click', () => header.parentElement.classList.toggle('open'));
  });
  $('#simulasi-utang-list').addEventListener('click', (e) => {
      const card = e.target.closest('.simulasi-item');
      if (card) _openSimulasiItemActionsModal(card.dataset);
  });
  $('#simulasi-dana-masuk').addEventListener('input', _updateSimulasiTotals);
  $('#simulasi-dana-masuk').addEventListener('input', _formatNumberInput);
  $('#simulasi-buat-pdf').addEventListener('click', _createSimulasiPDF);
    _setActiveListeners([]);
}

function _openSimulasiItemActionsModal(dataset) {
    const {
        id,
        title,
        description,
        fullAmount,
        partialAllowed
    } = dataset;
    const isSelected = appState.simulasiState.selectedPayments.has(id);
    const actions = [];
    if (isSelected) {
        actions.push({
            label: 'Batalkan Pilihan',
            action: 'cancel',
            icon: 'cancel'
        });
    } else {
        actions.push({
            label: 'Pilih & Bayar Penuh',
            action: 'pay_full',
            icon: 'check_circle'
        });
        if (partialAllowed === 'true') {
            actions.push({
                label: 'Bayar Sebagian',
                action: 'pay_partial',
                icon: 'pie_chart'
            });
        }
    }
    const modal = createModal('billActionsModal', {
        bill: {
            description: title,
            amount: parseFormattedNumber(fullAmount)
        },
        actions
    });

    modal.querySelectorAll('.actions-menu-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const card = $(`.simulasi-item[data-id="${id}"]`);
            if (!card) return;

            switch (btn.dataset.action) {
                case 'pay_full':
                    appState.simulasiState.selectedPayments.set(id, parseFormattedNumber(fullAmount));
                    card.classList.add('selected');
                    break;

                case 'pay_partial':
                    _openSimulasiPartialPaymentModal(dataset);
                    return;

                case 'cancel':
                    appState.simulasiState.selectedPayments.delete(id);
                    card.classList.remove('selected');
                    break;
            }

            _updateSimulasiTotals();
            closeModal(modal);
        });
    });
  }


function _openSimulasiPartialPaymentModal(dataset) {
  const {
      id,
      title,
      fullAmount
  } = dataset;
  const fullAmountNum = parseFormattedNumber(fullAmount);
  const content = `
          <form id="partial-payment-form">
              <p>Masukkan jumlah pembayaran untuk <strong>${title}</strong>.</p>
              <div class="payment-summary" style="margin-bottom: 1rem;">
                  <div class="remaining"><span>Total Tagihan:</span><strong>${fmtIDR(fullAmountNum)}</strong></div>
              </div>
              <div class="form-group"><label>Jumlah Pembayaran Parsial</label><input type="text" name="amount" inputmode="numeric" required placeholder="mis. 500.000"></div>
              <div class="modal-footer" style="margin-top: 1.5rem;">
                  <button type="button" class="btn btn-secondary" data-close-modal>Batal</button>
                  <button type="submit" class="btn btn-primary">Simpan</button>
              </div>
          </form>
      `;
  const modal = createModal('dataDetail', {
      title: 'Pembayaran Parsial',
      content
  });
  const form = $('#partial-payment-form', modal);
  const amountInput = form.querySelector('input[name="amount"]');

  amountInput.addEventListener('input', _formatNumberInput);
  form.addEventListener('submit', (e) => {
      e.preventDefault();
      const amountToPay = parseFormattedNumber(amountInput.value);
      if (amountToPay <= 0) {
          toast('error', 'Jumlah harus lebih besar dari nol.');
          return;
      }
      if (amountToPay > fullAmountNum) {
          toast('error', `Jumlah tidak boleh melebihi total tagihan ${fmtIDR(fullAmountNum)}.`);
          return;
      }
      const card = $(`.simulasi-item[data-id="${id}"]`);
      if (card) {
          appState.simulasiState.selectedPayments.set(id, amountToPay);
          card.classList.add('selected');
          _updateSimulasiTotals();
      }
      closeModal(modal);
  });
}

function _updateSimulasiTotals() {
  const danaMasukEl = $('#simulasi-dana-masuk');
  const totalAlokasiEl = $('#simulasi-total-alokasi');
  const sisaDanaEl = $('#simulasi-sisa-dana');

  if (!danaMasukEl || !totalAlokasiEl || !sisaDanaEl) return;
  const danaMasuk = parseFormattedNumber(danaMasukEl.value);
  let totalAlokasi = 0;
  for (const amount of appState.simulasiState.selectedPayments.values()) {
      totalAlokasi += amount;
  }
  const sisaDana = danaMasuk - totalAlokasi;
  animateNumber(totalAlokasiEl, totalAlokasi);
  animateNumber(sisaDanaEl, sisaDana);

  sisaDanaEl.classList.remove('positive', 'negative');
  if (sisaDana >= 0) {
      sisaDanaEl.classList.add('positive');
  } else {
      sisaDanaEl.classList.add('negative');
  }
  $$('.simulasi-item').forEach(card => {
      const cardId = card.dataset.id;
      const amountEl = card.querySelector('.simulasi-amount');

      if (appState.simulasiState.selectedPayments.has(cardId)) {
          card.classList.add('selected');
          const selectedAmount = appState.simulasiState.selectedPayments.get(cardId);
          const fullAmount = parseFormattedNumber(card.dataset.fullAmount);
          if (selectedAmount < fullAmount) {
              amountEl.innerHTML = `<span class="partial-amount">${fmtIDR(selectedAmount)}</span> / ${fmtIDR(fullAmount)}`;
          }
      } else {
          card.classList.remove('selected');
          amountEl.innerHTML = fmtIDR(card.dataset.fullAmount);
      }
  });
}

function _prepareSimulasiData() {
  const groupedByProject = {};
  let totalAlokasi = 0;
  appState.simulasiState.selectedPayments.forEach((amount, id) => {
      const [itemType, itemId] = id.split('-');
      let billOrLoan = null;
      let itemDetails = {
          recipient: 'N/A',
          description: 'N/A',
          amount,
          category: 'lainnya'
      };
      let projectId = 'tanpa_proyek';
      let projectName = 'Tanpa Proyek';
      if (itemType === 'bill') {
          billOrLoan = appState.bills.find(b => b.id === itemId);
          if (billOrLoan) {
              projectId = billOrLoan.projectId || 'tanpa_proyek';
              itemDetails.description = billOrLoan.description;
              itemDetails.category = billOrLoan.type;
              if (billOrLoan.type === 'gaji') itemDetails.recipient = appState.workers.find(w => w.id === billOrLoan.workerId)?.workerName || 'Pekerja';
              else if (billOrLoan.type === 'fee') itemDetails.recipient = appState.staff.find(s => s.id === billOrLoan.staffId)?.staffName || 'Staf';
              else {
                  const expense = appState.expenses.find(e => e.id === billOrLoan.expenseId);
                  itemDetails.recipient = appState.suppliers.find(s => s.id === expense?.supplierId)?.supplierName || 'Supplier';
              }
          }
      } else if (itemType === 'loan') {
          billOrLoan = appState.fundingSources.find(l => l.id === itemId);
          if (billOrLoan) {
              itemDetails.recipient = appState.fundingCreditors.find(c => c.id === billOrLoan.creditorId)?.creditorName || 'Kreditur';
              itemDetails.description = 'Cicilan Pinjaman';
              itemDetails.category = 'pinjaman';
          }
      }
      if (!groupedByProject[projectId]) {
          const project = appState.projects.find(p => p.id === projectId);
          projectName = project?project.projectName : 'Tanpa Proyek';
          groupedByProject[projectId] = {
              projectName,
              itemsByCategory: {}
          };
      }

      if (!groupedByProject[projectId].itemsByCategory[itemDetails.category]) {
          groupedByProject[projectId].itemsByCategory[itemDetails.category] = [];
      }
      groupedByProject[projectId].itemsByCategory[itemDetails.category].push(itemDetails);
      totalAlokasi += amount;
  });
  return {
      groupedByProject,
      totalAlokasi
  };
}
async function _createSimulasiPDF() {
    const danaMasuk = parseFormattedNumber($('#simulasi-dana-masuk').value);
    if (danaMasuk <= 0 || appState.simulasiState.selectedPayments.size === 0) {
        toast('error', 'Isi dana masuk dan pilih minimal satu tagihan.');
        return;
    }

    toast('syncing', 'Mempersiapkan PDF...');

    try {
        const { jsPDF } = await import('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');

        const { groupedByProject, totalAlokasi } = _prepareSimulasiData();
        const sisaDana = danaMasuk - totalAlokasi;

        const sections = [];
        const categoryLabels = {
            gaji: 'Rincian Gaji Pekerja',
            fee: 'Rincian Fee Staf',
            material: 'Rincian Tagihan Material',
            operasional: 'Rincian Tagihan Operasional',
            lainnya: 'Rincian Tagihan Lainnya',
            pinjaman: 'Rincian Cicilan Pinjaman'
        };
        const headers = ['Penerima', 'Deskripsi', 'Jumlah'];
        sections.push({
            sectionTitle: 'Ringkasan Alokasi Dana',
            headers: ['Deskripsi', 'Jumlah'],
            body: [
                ['Dana Masuk', fmtIDR(danaMasuk)],
                ['Total Alokasi', fmtIDR(totalAlokasi)]
            ],
            foot: [
                ['Sisa Dana', fmtIDR(sisaDana)]
            ]
        });
        for (const projectId in groupedByProject) {
            const projectData = groupedByProject[projectId];
            let projectTotal = 0;

            for (const category in projectData.itemsByCategory) {
                const items = projectData.itemsByCategory[category];
                const categoryTotal = items.reduce((sum, item) => sum + item.amount, 0);
                projectTotal += categoryTotal;
                sections.push({
                    sectionTitle: `${categoryLabels[category]} - Proyek: ${projectData.projectName}`,
                    headers: headers,
                    body: items.map(item => [item.recipient, item.description, fmtIDR(item.amount)]),
                    foot: [
                        ['Subtotal Kategori', '', fmtIDR(categoryTotal)]
                    ]
                });
            }
        }

        generatePdfReport({
            title: 'Laporan Simulasi Alokasi Dana',
            subtitle: `Dibuat pada: ${new Date().toLocaleDateString('id-ID')}`,
            filename: `Simulasi-Alokasi-Dana-${new Date().toISOString().slice(0, 10)}.pdf`,
            sections: sections
        });
    } catch (error) {
        toast('error', 'Gagal memuat library PDF. Periksa koneksi Anda.');
        console.error("Gagal memuat atau membuat PDF:", error);
    }
}

function _getKwitansiHTML(data) {
    const terbilang = (n) => {
        const bilangan = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"];
        if (n < 12) return bilangan[n];
        if (n < 20) return terbilang(n - 10) + " belas";
        if (n < 100) return terbilang(Math.floor(n / 10)) + " puluh " + terbilang(n % 10);
        if (n < 200) return "seratus " + terbilang(n - 100);
        if (n < 1000) return terbilang(Math.floor(n / 100)) + " ratus " + terbilang(n % 100);
        if (n < 2000) return "seribu " + terbilang(n - 1000);
        if (n < 1000000) return terbilang(Math.floor(n / 1000)) + " ribu " + terbilang(n % 1000);
        if (n < 1000000000) return terbilang(Math.floor(n / 1000000)) + " juta " + terbilang(n % 1000000);
        return "";
    };
    const jumlahTerbilang = (terbilang(data.jumlah).trim() + " rupiah").replace(/\s+/g, ' ').replace(/^\w/, c => c.toUpperCase());
    return `
        <div class="kwitansi-container">
            <div class="kwitansi-header">
                <h3>KWITANSI</h3>
                <div class="kwitansi-nomor">No: ${data.nomor}</div>
            </div>
            <div class="kwitansi-body">
                <dl>
                    <div><dt>Telah diterima dari</dt><dd>: CV. ALAM BERKAH ABADI</dd></div>
                    <div><dt>Uang Sejumlah</dt><dd class="terbilang">: ${jumlahTerbilang}</dd></div>
                    <div><dt>Untuk Pembayaran</dt><dd>: ${data.deskripsi}</dd></div>
                </dl>
            </div>
            <div class="kwitansi-footer">
                <div class="kwitansi-jumlah-box">${fmtIDR(data.jumlah)}</div>
                <div class="kwitansi-ttd">
                    <p>Cijiwa, ${data.tanggal}</p>
                    <p class="penerima">Penerima,</p>
                    <p class="nama-penerima">${data.namaPenerima}</p>
                </div>
            </div>
        </div>
    `;
}
async function handleCetakKwitansi(billId) {
    toast('syncing', 'Mempersiapkan kwitansi...');
    const bill = appState.bills.find(b => b.id === billId);
    if (!bill) {
        toast('error', 'Data tagihan tidak ditemukan.');
        return;
    }
    let recipientName = 'N/A';
    if (bill.type === 'gaji' && bill.workerId) {
        const worker = appState.workers.find(w => w.id === bill.workerId);
        recipientName = worker?.workerName || 'Pekerja Dihapus';
    } else if (bill.expenseId) {
        const expense = appState.expenses.find(e => e.id === bill.expenseId);
        const supplier = expense?appState.suppliers.find(s => s.id === expense.supplierId) : null;
        recipientName = supplier?.supplierName || 'Supplier';
    }
    const kwitansiData = {
        nomor: `KW-${bill.id.substring(0, 5).toUpperCase()}`,
        tanggal: bill.paidAt?_getJSDate(bill.paidAt).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        }) : new Date().toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        }),
        namaPenerima: recipientName,
        jumlah: bill.amount,
        deskripsi: bill.description
    };
    const modalContent = `
        <div id="kwitansi-printable-area">${_getKwitansiHTML(kwitansiData)}</div>
        <div class="modal-footer kwitansi-footer-actions">
            <button id="download-kwitansi-img-btn" class="btn btn-secondary"><span class="material-symbols-outlined">image</span> Unduh Gambar</button>
            <button id="download-kwitansi-btn" class="btn btn-primary"><span class="material-symbols-outlined">picture_as_pdf</span> Unduh PDF</button>
        </div>
    `;
    createModal('dataDetail', {
        title: 'Pratinjau Kwitansi',
        content: modalContent
    });
    hideToast();
    $('#download-kwitansi-img-btn').addEventListener('click', () => _downloadKwitansiAsImage(kwitansiData));
    $('#download-kwitansi-btn').addEventListener('click', () => _downloadKwitansiAsPDF(kwitansiData));
}
async function handleCetakKwitansiIndividu(dataset) {
    const {
        billId,
        workerId
    } = dataset;
    toast('syncing', 'Mempersiapkan kwitansi...');
    const bill = appState.bills.find(b => b.id === billId);
    if (!bill || !bill.workerDetails) {
        toast('error', 'Data tagihan gabungan tidak ditemukan.');
        return;
    }
    const workerDetail = bill.workerDetails.find(w => w.id === workerId);
    if (!workerDetail) {
        toast('error', 'Data pekerja di tagihan ini tidak ditemukan.');
        return;
    }
    const kwitansiData = {
        nomor: `KW-G-${bill.id.substring(0, 4)}-${workerId.substring(0, 4)}`.toUpperCase(),
        tanggal: bill.paidAt?_getJSDate(bill.paidAt).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        }) : new Date().toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        }),
        namaPenerima: workerDetail.name,
        jumlah: workerDetail.amount,
        deskripsi: bill.description
    };
    const modalContent = `
        <div id="kwitansi-printable-area">${_getKwitansiHTML(kwitansiData)}</div>
        <div class="modal-footer kwitansi-footer-actions">
            <button id="download-kwitansi-img-btn" class="btn btn-secondary">
                <span class="material-symbols-outlined">image</span> Unduh Gambar
            </button>
            <button id="download-kwitansi-btn" class="btn btn-primary">
                <span class="material-symbols-outlined">picture_as_pdf</span> Unduh PDF
            </button>
        </div>
    `;
    createModal('dataDetail', {
        title: 'Pratinjau Kwitansi',
        content: modalContent
    });
    hideToast();
    $('#download-kwitansi-img-btn').addEventListener('click', () => _downloadKwitansiAsImage(kwitansiData));
    $('#download-kwitansi-btn').addEventListener('click', () => _downloadKwitansiAsPDF(kwitansiData));
}

async function _downloadKwitansiAsPDF(data) {
    toast('syncing', 'Mempersiapkan PDF...');
    const kwitansiElement = $('#kwitansi-printable-area');
    if (!kwitansiElement) {
        toast('error', 'Gagal menemukan elemen kwitansi.');
        return;
    }
    try {
        const { jsPDF } = await import('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
        const html2canvas = (await import('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js')).default;

        const canvas = await html2canvas(kwitansiElement, { scale: 3, useCORS: true });
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a7'
        });
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const canvasAspectRatio = canvas.width / canvas.height;
        let finalImgWidth = pdfWidth - 10;
        let finalImgHeight = finalImgWidth / canvasAspectRatio;
        if (finalImgHeight > pdfHeight - 10) {
            finalImgHeight = pdfHeight - 10;
            finalImgWidth = finalImgHeight * canvasAspectRatio;
        }
        const x = (pdfWidth - finalImgWidth) / 2;
        const y = (pdfHeight - finalImgHeight) / 2;
        pdf.addImage(imgData, 'PNG', x, y, finalImgWidth, finalImgHeight);
        pdf.save(`Kwitansi-${data.namaPenerima.replace(/\s+/g, '-')}-${data.tanggal}.pdf`);
        toast('success', 'PDF berhasil dibuat!');
    } catch (error) {
        console.error("Gagal membuat PDF:", error);
        toast('error', 'Terjadi kesalahan saat membuat PDF.');
    }
}
async function _downloadKwitansiAsImage(data) {
    toast('syncing', 'Membuat gambar kwitansi...');
    const kwitansiElement = $('#kwitansi-printable-area');
    if (!kwitansiElement) {
        toast('error', 'Gagal menemukan elemen kwitansi.');
        return;
    }
    try {
        const html2canvas = (await import('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js')).default;

        const canvas = await html2canvas(kwitansiElement, {
            scale: 3,
            useCORS: true,
            backgroundColor: '#ffffff'
        });
        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/jpeg', 0.95);
        link.download = `Kwitansi-${data.namaPenerima.replace(/\s+/g, '-')}-${data.tanggal}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast('success', 'Gambar kwitansi berhasil diunduh!');
    } catch (error) {
        console.error("Gagal membuat gambar dari HTML:", error);
        toast('error', 'Terjadi kesalahan saat membuat gambar.');
    }
}