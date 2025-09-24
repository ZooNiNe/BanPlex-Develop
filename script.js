/* global Chart, html2canvas, jspdf, Dexie */
// @ts-check

// =======================================================
//                       BANPLEX v10.1
// =======================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { 
    getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut,
    setPersistence, browserLocalPersistence 
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { 
    getFirestore, collection, doc, getDoc, setDoc, updateDoc, serverTimestamp, onSnapshot,
    query, getDocs, addDoc, orderBy, deleteDoc, where, runTransaction, writeBatch, increment, Timestamp, 
    initializeFirestore, persistentLocalCache 
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import { getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-storage.js";
import { logoData } from './logo-data.js';

async function main() {

    // =======================================================
    //          SEKSI 1: KONFIGURASI & STATE GLOBAL
    // =======================================================
    const firebaseConfig = {
      apiKey: "AIzaSyBDTURKKzmhG8hZXlBryoQRdjqd70GI18c",
      authDomain: "banflex-3e7c4.firebaseapp.com",
      projectId: "banflex-3e7c4",
      storageBucket: "banflex-3e7c4.appspot.com",
      messagingSenderId: "192219628345",
      appId: "1:192219628345:web:f1caa28230a5803e681ee8"
    };
    const TEAM_ID = 'main';
    const OWNER_EMAIL = 'dq060412@gmail.com';

    const ALL_NAV_LINKS = [
        { id: 'dashboard', icon: 'dashboard', label: 'Dashboard', roles: ['Owner', 'Editor', 'Viewer'] },
        { id: 'pemasukan', icon: 'account_balance_wallet', label: 'Pemasukan', roles: ['Owner'] },
        { id: 'pengeluaran', icon: 'post_add', label: 'Pengeluaran', roles: ['Owner', 'Editor'] },
        { id: 'absensi', icon: 'person_check', label: 'Absensi', roles: ['Owner', 'Editor'] },
        { id: 'jurnal', icon: 'summarize', label: 'Jurnal', roles: ['Owner', 'Editor', 'Viewer'] },
        { id: 'stok', icon: 'inventory_2', label: 'Stok', roles: ['Owner', 'Editor', 'Viewer'] },
        { id: 'tagihan', icon: 'receipt_long', label: 'Tagihan', roles: ['Owner', 'Editor', 'Viewer'] },
        { id: 'laporan', icon: 'monitoring', label: 'Laporan', roles: ['Owner', 'Viewer'] },
        { id: 'simulasi', icon: 'payments', label: 'Simulasi Bayar', roles: ['Owner'] },
        { id: 'pengaturan', icon: 'settings', label: 'Pengaturan', roles: ['Owner', 'Editor', 'Viewer'] },
    ];
    
    const appState = {
        currentUser: null,
        userRole: 'Guest',
        userStatus: null,
        justLoggedIn: false,
        pendingUsersCount: 0,
        activePage: localStorage.getItem('lastActivePage') || 'dashboard',
        activeSubPage: new Map(),
        isOnline: navigator.onLine,
        isSyncing: false,
        projects: [], clients: [], fundingCreditors: [], operationalCategories: [],
        materialCategories: [], otherCategories: [], suppliers: [], workers: [],
        professions: [], incomes: [], fundingSources: [], expenses: [], bills: [],
        attendance: new Map(), users: [], materials: [],
        selectionMode: { active: false, selectedIds: new Set(), pageContext: '' },
        billsFilter: { searchTerm: '', projectId: 'all', supplierId: 'all', sortBy: 'dueDate', sortDirection: 'desc', category: 'all' },
        pdfSettings: null,
        simulasiState: { selectedPayments: new Map() }
    };

    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const storage = getStorage(app);
    let db;
    
    try { await setPersistence(auth, browserLocalPersistence); } catch (e) { console.warn("Persistence failed", e.code); }
    try { db = initializeFirestore(app, { cache: persistentLocalCache() }); } catch (e) { db = getFirestore(app); }
    
    const membersCol = collection(db, 'teams', TEAM_ID, 'members');
    const projectsCol = collection(db, 'teams', TEAM_ID, 'projects');
    const fundingCreditorsCol = collection(db, 'teams', TEAM_ID, 'funding_creditors');
    const opCatsCol = collection(db, 'teams', TEAM_ID, 'operational_categories');
    const matCatsCol = collection(db, 'teams', TEAM_ID, 'material_categories');
    const otherCatsCol = collection(db, 'teams', TEAM_ID, 'other_categories');
    const suppliersCol = collection(db, 'teams', TEAM_ID, 'suppliers');
    const workersCol = collection(db, 'teams', TEAM_ID, 'workers');
    const professionsCol = collection(db, 'teams', TEAM_ID, 'professions');
    const attendanceRecordsCol = collection(db, 'teams', TEAM_ID, 'attendance_records');
    const incomesCol = collection(db, 'teams', TEAM_ID, 'incomes');
    const fundingSourcesCol = collection(db, 'teams', TEAM_ID, 'funding_sources');
    const expensesCol = collection(db, 'teams', TEAM_ID, 'expenses');
    const billsCol = collection(db, 'teams', TEAM_ID, 'bills');
    const logsCol = collection(db, 'teams', TEAM_ID, 'logs');
    const materialsCol = collection(db, 'teams', TEAM_ID, 'materials');

    // =======================================================
    //          SEKSI 2: UTILITAS, MODAL & AUTENTIKASI
    // =======================================================

    const $ = (s, context = document) => context.querySelector(s);
    const $$ = (s, context = document) => Array.from(context.querySelectorAll(s));
    const fmtIDR = (n) => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',minimumFractionDigits:0}).format(Number(n||0));
    const parseFormattedNumber = (str) => Number(String(str).replace(/[^0-9]/g, ''));
    const isViewer = () => appState.userRole === 'Viewer';
    let toastTimeout = null;

    function toast(type, message, duration = 4000) {        const container = $('#popup-container');
        if (!container) return;
        if (!container.querySelector('.popup-content')) {
            container.innerHTML = `<div class="popup-content"><span id="popup-icon"></span><p id="popup-message"></p></div>`;
        }
        const iconEl = $('#popup-icon', container);
        const msgEl = $('#popup-message', container);
        if (!msgEl || !iconEl) return;

        const icons = { success: 'check_circle', error: 'error', info: 'info' };
        container.className = `popup-container popup-${type}`;
        msgEl.textContent = message; 
        if (toastTimeout) clearTimeout(toastTimeout);

        if (type === 'syncing') {
            iconEl.className = 'spinner';
        } else {
            iconEl.className = 'material-symbols-outlined';
            iconEl.textContent = icons[type] || 'info';
            toastTimeout = setTimeout(() => container.classList.remove('show'), duration);
        }
        container.classList.add('show');
    }

    const hideToast = () => {        if (toastTimeout) clearTimeout(toastTimeout);
        $('#popup-container')?.classList.remove('show');
    };

    const fetchAndCacheData = async (key, col, order = 'createdAt') => {         
        try {
            const snap = await getDocs(query(col, orderBy(order, 'desc')));
            appState[key] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e) {
            console.error(`Gagal memuat data untuk ${key}:`, e);
            appState[key] = appState[key] || []; // Jangan hapus data lama jika fetch gagal
            toast('error', `Gagal memuat data ${key}.`);
        }
    };

    const masterDataConfig = {
        'projects': { collection: projectsCol, stateKey: 'projects', nameField: 'projectName', title: 'Proyek' },
        'creditors': { collection: fundingCreditorsCol, stateKey: 'fundingCreditors', nameField: 'creditorName', title: 'Kreditur' },
        'op-cats': { collection: opCatsCol, stateKey: 'operationalCategories', nameField: 'categoryName', title: 'Kategori Operasional' },
        'other-cats': { collection: otherCatsCol, stateKey: 'otherCategories', nameField: 'categoryName', title: 'Kategori Lainnya' },
        'suppliers': { collection: suppliersCol, stateKey: 'suppliers', nameField: 'supplierName', title: 'Supplier' },
        'professions': { collection: professionsCol, stateKey: 'professions', nameField: 'professionName', title: 'Profesi' },
        'workers': { collection: workersCol, stateKey: 'workers', nameField: 'workerName', title: 'Pekerja' },
        'staff': { collection: collection(db, 'teams', TEAM_ID, 'staff'), stateKey: 'staff', nameField: 'staffName', title: 'Staf Inti' },
    };


    async function _logActivity(action, details = {}) {         
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
        }
    }

    function createModal(type, data = {}) {
        const modalContainer = $('#modal-container');
        if (!modalContainer) return;
    
        modalContainer.innerHTML = `<div id="${type}-modal" class="modal-bg">${getModalContent(type, data)}</div>`;
        const modalEl = modalContainer.firstElementChild;
        
        setTimeout(() => modalEl.classList.add('show'), 10);
        
        const closeModalFunc = () => closeModal(modalEl);
    
        modalEl.addEventListener('click', e => { if (e.target === modalEl) closeModalFunc(); });
        modalEl.querySelectorAll('[data-close-modal]').forEach(btn => btn.addEventListener('click', closeModalFunc));
        
        attachModalEventListeners(type, data, closeModalFunc);
        return modalEl;
    }

    function closeModal(modalEl) { 
        if (!modalEl) return; 
        modalEl.classList.remove('show'); 
        setTimeout(() => modalEl.remove(), 300); 
    }

    function getModalContent(type, data) {
        if (type === 'imageView') {
            return `<div class="image-view-modal" data-close-modal>
                        <img src="${data.src}" alt="Lampiran">
                        <button class="btn-icon image-view-close" data-close-modal>
                            <span class="material-symbols-outlined">close</span>
                        </button>
                    </div>`;
        }        
        const modalWithHeader = (title, content) => `<div class="modal-content"><div class="modal-header"><h4>${title}</h4><button class="btn-icon" data-close-modal><span class="material-symbols-outlined">close</span></button></div><div class="modal-body">${content}</div></div>`;
        const simpleModal = (title, content, footer) => `<div class="modal-content" style="max-width:400px"><div class="modal-header"><h4>${title}</h4></div><div class="modal-body">${content}</div><div class="modal-footer">${footer}</div></div>`;
    
        if (type === 'login') return simpleModal('Login', '<p>Gunakan akun Google Anda.</p>', '<button id="google-login-btn" class="btn btn-primary">Masuk dengan Google</button>');
        if (type === 'confirmLogout') return simpleModal('Keluar', '<p>Anda yakin ingin keluar?</p>', '<button class="btn btn-secondary" data-close-modal>Batal</button><button id="confirm-logout-btn" class="btn btn-danger">Keluar</button>');
        if (type === 'confirmDelete' || type === 'confirmPayment' || type === 'confirmEdit' || type === 'confirmPayBill' || type === 'confirmGenerateBill' || type === 'confirmUserAction' || type === 'confirmDeleteAttachment' || type === 'confirmDeleteRecap') {
            const titles = { confirmDelete: 'Konfirmasi Hapus', confirmPayment: 'Konfirmasi Pembayaran', confirmEdit: 'Konfirmasi Perubahan', confirmPayBill: 'Konfirmasi Pembayaran', confirmGenerateBill: 'Konfirmasi Buat Tagihan', confirmUserAction: 'Konfirmasi Aksi', confirmDeleteAttachment: 'Hapus Lampiran', confirmDeleteRecap: 'Hapus Rekap Gaji' };
            const messages = { confirmDelete: 'Anda yakin ingin menghapus data ini?', confirmPayment: 'Anda yakin ingin melanjutkan pembayaran?', confirmEdit: 'Anda yakin ingin menyimpan perubahan?', confirmPayBill: 'Anda yakin ingin melanjutkan pembayaran ini?', confirmGenerateBill: 'Anda akan membuat tagihan gaji untuk pekerja ini. Lanjutkan?', confirmUserAction: 'Apakah Anda yakin?', confirmDeleteAttachment: 'Anda yakin ingin menghapus lampiran ini?', confirmDeleteRecap: 'Menghapus rekap ini akan menghapus data absensi terkait. Aksi ini tidak dapat dibatalkan. Lanjutkan?' };
            const confirmTexts = { confirmDelete: 'Hapus', confirmPayment: 'Ya, Bayar', confirmEdit: 'Ya, Simpan', confirmPayBill: 'Ya, Bayar', confirmGenerateBill: 'Ya, Buat Tagihan', confirmUserAction: 'Ya, Lanjutkan', confirmDeleteAttachment: 'Ya, Hapus', confirmDeleteRecap: 'Ya, Hapus' };
            const confirmClasses = { confirmDelete: 'btn-danger', confirmPayment: 'btn-success', confirmEdit: 'btn-primary', confirmPayBill: 'btn-success', confirmGenerateBill: 'btn-primary', confirmUserAction: 'btn-primary', confirmDeleteAttachment: 'btn-danger', confirmDeleteRecap: 'btn-danger' };
            
            return simpleModal(
                titles[type],
                `<p class="confirm-modal-text">${data.message || messages[type]}</p>`,
                `<button class="btn btn-secondary" data-close-modal>Batal</button><button id="confirm-btn" class="btn ${confirmClasses[type]}">${confirmTexts[type]}</button>`
            );
        }
        
        if (type === 'confirmExpense') {
            return simpleModal(
                'Konfirmasi Status Pengeluaran',
                '<p>Apakah pengeluaran ini sudah dibayar atau akan dijadikan tagihan?</p>',
                `<button class="btn btn-secondary" id="confirm-bill-btn">Jadikan Tagihan</button><button id="confirm-paid-btn" class="btn btn-success">Sudah, Lunas</button>`
            );
        }
        if (type === 'dataDetail' || type === 'payment' || type === 'manageMaster' || type === 'editMaster' || type === 'editItem' || type === 'editAttendance' || type === 'imageView' || type === 'manageUsers') {
            return modalWithHeader(data.title, data.content);
        }
        if (type === 'actionsMenu') {
            const { actions, targetRect } = data;
            const top = targetRect.bottom + 8;
            const right = window.innerWidth - targetRect.right - 8;
            return `
                <div class="actions-menu" style="top:${top}px; right:${right}px;">
                    ${actions.map(action => `<button class="actions-menu-item" data-action="${action.action}" data-id="${action.id}" data-type="${action.type}" data-expense-id="${action.expenseId || ''}"><span class="material-symbols-outlined">${action.icon}</span><span>${action.label}</span></button>`).join('')}
                </div>`;
        }
        if (type === 'invoiceItemsDetail') {
            const { items, totalAmount } = data;
            const itemsHTML = items.map(item => `
                <div class="invoice-detail-item">
                    <div class="item-main-info">
                        <span class="item-name">${item.name}</span>
                        <span class="item-total">${fmtIDR(item.total)}</span>
                    </div>
                    <div class="item-sub-info">
                        <span>${item.qty} x ${fmtIDR(item.price)}</span>
                    </div>
                </div>
            `).join('');
    
            return modalWithHeader('Rincian Faktur', `
                <div class="invoice-detail-list">${itemsHTML}</div>
                <div class="invoice-detail-summary">
                    <span>Total Faktur</span>
                    <strong>${fmtIDR(totalAmount)}</strong>
                </div>
            `);
        }
        if (type === 'billActionsModal') {
            const { bill, actions } = data;
            const supplierName = appState.suppliers.find(s => s.id === (appState.expenses.find(e => e.id === bill.expenseId)?.supplierId))?.supplierName || '';
            const modalBody = `
                <div class="actions-modal-header">
                    <h4>${bill.description}</h4>
                    ${supplierName ? `<span>${supplierName}</span>` : ''}
                    <strong>${fmtIDR(bill.amount)}</strong>
                </div>
                <div class="actions-modal-list">
                    ${actions.map(action => `<button class="actions-menu-item" data-action="${action.action}" data-id="${action.id}" data-type="${action.type}" data-expense-id="${action.expenseId || ''}"><span class="material-symbols-outlined">${action.icon}</span><span>${action.label}</span></button>`).join('')}
                </div>
            `;
            const modalFooter = `<button class="btn btn-secondary" data-close-modal>Tutup</button>`;

            return `<div class="modal-content"><div class="modal-body">${modalBody}</div><div class="modal-footer">${modalFooter}</div></div>`;
        }

        return `<div>Konten tidak ditemukan</div>`;
    }
    
    function attachModalEventListeners(type, data, closeModalFunc) {
        if (type === 'login') $('#google-login-btn')?.addEventListener('click', signInWithGoogle);
        if (type === 'confirmLogout') $('#confirm-logout-btn')?.addEventListener('click', handleLogout);
        if (type.startsWith('confirm') && type !== 'confirmExpense') {
            $('#confirm-btn')?.addEventListener('click', () => { data.onConfirm(); closeModalFunc(); });
        }
        if (type === 'confirmExpense') {
            $('#confirm-paid-btn')?.addEventListener('click', () => { data.onConfirm('paid'); closeModalFunc(); });
            $('#confirm-bill-btn')?.addEventListener('click', () => { data.onConfirm('unpaid'); closeModalFunc(); });
        }
        if (type === 'payment') {
            $('#payment-form')?.addEventListener('submit', (e) => {
                e.preventDefault();
                const amount = fmtIDR(parseFormattedNumber(e.target.elements.amount.value));
                const onConfirm = () => (data.paymentType === 'bill') ? handleProcessBillPayment(e.target) : handleProcessPayment(e.target);
                createModal('confirmPayBill', { message: `Anda akan membayar sebesar ${amount}. Lanjutkan?`, onConfirm });
            });
            $$('#payment-form input[inputmode="numeric"]')?.forEach(input => input.addEventListener('input', _formatNumberInput));
        }
        if (type === 'actionsMenu') $$('.actions-menu-item').forEach(btn => btn.addEventListener('click', () => closeModalFunc()));
        if (type === 'manageMaster') $('#add-master-item-form')?.addEventListener('submit', (e) => { e.preventDefault(); handleAddMasterItem(e.target); });
        if (type === 'editMaster') $('#edit-master-form')?.addEventListener('submit', (e) => { e.preventDefault(); createModal('confirmEdit', { onConfirm: () => { handleUpdateMasterItem(e.target); closeModalFunc(); } }); });
        if (type === 'editItem') $('#edit-item-form')?.addEventListener('submit', (e) => { e.preventDefault(); createModal('confirmEdit', { onConfirm: () => { handleUpdateItem(e.target); closeModalFunc(); } }); });
        if (type === 'editAttendance') $('#edit-attendance-form')?.addEventListener('submit', (e) => { e.preventDefault(); createModal('confirmEdit', { onConfirm: () => { handleUpdateAttendance(e.target); closeModalFunc(); } }); });
    }

    onAuthStateChanged(auth, (user) => {
        if (user) {
            initializeAppSession(user);
        } else {
            Object.assign(appState, { currentUser: null, userRole: 'Guest', userStatus: null, justLoggedIn: false });
            $('#global-loader').style.display = 'none';
            $('#app-shell').style.display = 'flex';
            renderUI();
        }
    });

    async function signInWithGoogle() { 
        const provider = new GoogleAuthProvider();
        try {
            await signInWithPopup(auth, provider);
            toast('success', 'Login berhasil. Menyiapkan akun...');
        } catch (error) {
            console.error('Popup sign-in failed:', error);
            toast('error', 'Login gagal. Coba lagi.');
        }
    }

    async function handleLogout() { 
        closeModal($('#confirmLogout-modal'));
        toast('syncing', 'Keluar...'); 
        try { 
            await signOut(auth); 
            toast('success', 'Anda telah keluar.'); 
        } catch (error) { 
            toast('error', `Gagal keluar.`); 
        } 
    }

    function attachRoleListener(userDocRef) {
        onSnapshot(userDocRef, (docSnap) => {
            if (docSnap.exists()) {
                const { role, status } = docSnap.data();
                if (appState.userRole !== role || appState.userStatus !== status) {
                    Object.assign(appState, { userRole: role, userStatus: status });
                    renderUI();
                }
            }
        });
    }

    async function listenForPendingUsers() {
        onSnapshot(query(membersCol, where("status", "==", "pending")), (snapshot) => {
            appState.pendingUsersCount = snapshot.size;
            renderBottomNav(); 
        });
    }

    async function initializeAppSession(user) {
        appState.currentUser = user;
        const userDocRef = doc(membersCol, user.uid);
        try {
            toast('syncing', 'Menyiapkan profil...');
            let userDoc = await getDoc(userDocRef);

            if (!userDoc.exists()) {
                const isOwner = user.email.toLowerCase() === OWNER_EMAIL.toLowerCase();
                const initialData = {
                    email: user.email, name: user.displayName, photoURL: user.photoURL,
                    role: isOwner ? 'Owner' : 'Viewer', status: isOwner ? 'active' : 'pending',
                    createdAt: serverTimestamp()
                };
                await setDoc(userDocRef, initialData);
                userDoc = await getDoc(userDocRef); 
            }
            
            const userData = userDoc.data();
            Object.assign(appState, { userRole: userData.role, userStatus: userData.status });
            
            if (appState.justLoggedIn) {
                toast('success', `Selamat datang kembali, ${userData.name}!`);
            }

            attachRoleListener(userDocRef);
            if (appState.userRole === 'Owner') listenForPendingUsers();

            $('#global-loader').style.display = 'none';
            $('#app-shell').style.display = 'flex';
            renderUI();
            appState.justLoggedIn = false;
            hideToast();
        } catch (error) {
            console.error("Gagal inisialisasi sesi:", error);
            toast('error', 'Gagal memuat profil. Menggunakan mode terbatas.');
        }
    }

    // =======================================================
    //          [URUTAN DIPINDAH] SEKSI 3: FUNGSI-FUNGSI HALAMAN
    // =======================================================

    // --- SUB-SEKSI 3.1: DASHBOARD & PENGATURAN ---
    async function renderDashboardPage() {
        const container = $('.page-container');
        container.innerHTML = `<div class="loader-container"><div class="spinner"></div></div>`;
    
        await Promise.all([
            fetchAndCacheData('projects', projectsCol, 'projectName'), 
            fetchAndCacheData('incomes', incomesCol), 
            fetchAndCacheData('expenses', expensesCol), 
            fetchAndCacheData('bills', billsCol)
        ]);
        
        const mainProject = appState.projects.find(p => p.projectType === 'main_income');
        const internalProjects = appState.projects.filter(p => p.id !== mainProject?.id);
        
        const pendapatan = appState.incomes.filter(i => i.projectId === mainProject?.id).reduce((sum, i) => sum + i.amount, 0);
        const hpp_material = appState.expenses.filter(e => e.projectId === mainProject?.id && e.type === 'material').reduce((sum, e) => sum + e.amount, 0);

        const paidSalaryBills = appState.bills.filter(b => b.type === 'gaji' && b.status === 'paid');
        
        const hpp_gaji = paidSalaryBills
            .filter(b => b.projectId === mainProject?.id)
            .reduce((sum, b) => sum + b.amount, 0);
            
        const bebanGajiInternal = paidSalaryBills
            .filter(b => internalProjects.some(p => p.id === b.projectId))
            .reduce((sum, b) => sum + b.amount, 0);

        const hpp_lainnya = appState.expenses.filter(e => e.projectId === mainProject?.id && e.type === 'lainnya').reduce((sum, e) => sum + e.amount, 0);
        const hpp = hpp_material + hpp_gaji + hpp_lainnya;
        const labaKotor = pendapatan - hpp;
        const bebanOperasional = appState.expenses.filter(e => e.projectId === mainProject?.id && e.type === 'operasional').reduce((sum, e) => sum + e.amount, 0);
        
        const bebanExpenseInternal = appState.expenses.filter(e => internalProjects.some(p => p.id === e.projectId)).reduce((sum, e) => sum + e.amount, 0);
        const bebanInternal = bebanExpenseInternal + bebanGajiInternal;

        const labaBersih = labaKotor - bebanOperasional - bebanInternal;
        const totalUnpaid = appState.bills.filter(b => b.status === 'unpaid').reduce((sum, b) => sum + (b.amount - (b.paidAmount || 0)), 0);
    
        const projectsWithBudget = appState.projects.filter(p => p.budget && p.budget > 0).map(p => {
            const actual = appState.expenses
                .filter(e => e.projectId === p.id)
                .reduce((sum, e) => sum + e.amount, 0);
            const remaining = p.budget - actual;            
            const percentage = p.budget > 0 ? (actual / p.budget) * 100 : 0;
            return { ...p, actual, remaining, percentage };
        });
    
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todaysExpenses = appState.expenses.filter(e => e.date.toDate() >= today);
        const dailyRecap = todaysExpenses.reduce((recap, expense) => {
            const projectName = appState.projects.find(p => p.id === expense.projectId)?.projectName || 'Lainnya';
            if (!recap[projectName]) recap[projectName] = 0;
            recap[projectName] += expense.amount;
            return recap;
        }, {});
    
        const balanceCardsHTML = `
            <div class="dashboard-balance-grid">
                <div class="dashboard-balance-card clickable" data-action="navigate" data-nav="laporan">
                    <span class="label">Estimasi Laba Bersih</span>
                    <strong class="value positive">${fmtIDR(labaBersih)}</strong>
                </div>
                <div class="dashboard-balance-card clickable" data-action="navigate" data-nav="tagihan">
                    <span class="label">Tagihan Belum Lunas</span>
                    <strong class="value negative">${fmtIDR(totalUnpaid)}</strong>
                </div>
            </div>`;
    
        const projectBudgetHTML = `
            <h5 class="section-title-owner">Sisa Anggaran Proyek</h5>
            <div class="card card-pad">
                ${projectsWithBudget.length > 0 ? projectsWithBudget.map(p => `
                    <div class="budget-item">
                        <div class="budget-info">
                            <span class="project-name">${p.projectName}</span>
                            <strong class="remaining-amount ${p.remaining < 0 ? 'negative' : ''}">${fmtIDR(p.remaining)}</strong>
                        </div>
                        <div class="progress-bar-container">
                            <div class="progress-bar" style="width: ${Math.min(p.percentage, 100)}%; background-image: ${p.percentage > 100 ? 'var(--grad-danger)' : 'var(--grad)'};"></div>
                        </div>
                        <div class="budget-details">
                            <span>Terpakai: ${fmtIDR(p.actual)}</span>
                            <span>Anggaran: ${fmtIDR(p.budget)}</span>
                        </div>
                    </div>
                `).join('') : '<p class="empty-state-small">Tidak ada proyek dengan anggaran.</p>'}
            </div>`;

        const dailyRecapHTML = `
             <h5 class="section-title-owner">Rekap Pengeluaran Hari Ini</h5>
             <div class="card card-pad">
                ${Object.keys(dailyRecap).length > 0 ? Object.entries(dailyRecap).map(([projectName, total]) => `
                    <div class="daily-recap-item">
                        <span>${projectName}</span>
                        <strong>${fmtIDR(total)}</strong>
                    </div>
                `).join('') : '<p class="empty-state-small">Tidak ada pengeluaran hari ini.</p>'}
             </div>`;
    
        const accessibleLinks = ALL_NAV_LINKS.filter(link => link.id !== 'dashboard' && link.roles.includes(appState.userRole));
        const mainActionIds = ['tagihan', 'laporan', 'stok', 'pengeluaran'];
        const mainActions = [];
        const extraActions = [];
    
        accessibleLinks.forEach(link => {
            if (mainActionIds.includes(link.id)) mainActions.push(link);
            else extraActions.push(link);
        });
    
        mainActions.sort((a, b) => mainActionIds.indexOf(a.id) - mainActionIds.indexOf(b.id));
    
        const createActionItemHTML = (link, isExtra = false) => `
            <button class="dashboard-action-item ${isExtra ? 'action-item-extra' : ''}" data-action="navigate" data-nav="${link.id}">
                <div class="icon-wrapper"><span class="material-symbols-outlined">${link.icon}</span></div>
                <span class="label">${link.label}</span>
            </button>`;
    
        const quickActionsHTML = `
            <h5 class="section-title-owner">Aksi Cepat</h5>
            <div id="quick-actions-grid" class="dashboard-actions-grid actions-collapsed">
                ${mainActions.map(link => createActionItemHTML(link)).join('')}
                ${extraActions.length > 0 ? `
                    <button class="dashboard-action-item" data-action="toggle-more-actions">
                        <div class="icon-wrapper"><span class="material-symbols-outlined">grid_view</span></div>
                        <span class="label">Lainnya</span>
                    </button>
                ` : ''}
                ${extraActions.map(link => createActionItemHTML(link, true)).join('')}
            </div>`;

        container.innerHTML = balanceCardsHTML + quickActionsHTML + projectBudgetHTML + dailyRecapHTML;
    }

    async function renderPengaturanPage() {
        const container = $('.page-container');
        const { currentUser, userRole } = appState;
        const photo = currentUser?.photoURL || `https://placehold.co/80x80/e2e8f0/64748b?text=${(currentUser?.displayName||'U')[0]}`;
        
        const ownerActions = [
            { action: 'manage-master', type: 'projects', icon: 'foundation', label: 'Kelola Proyek' },
            { action: 'manage-master', type: 'staff', icon: 'manage_accounts', label: 'Kelola Staf Inti' },
            { action: 'manage-master-global', type: null, icon: 'database', label: 'Master Data Lain' },
            { action: 'manage-users', type: null, icon: 'group', label: 'Manajemen User' },
            { action: 'edit-pdf-settings', type: null, icon: 'picture_as_pdf', label: 'Pengaturan Laporan PDF' },
            { action: 'navigate', nav: 'log_aktivitas', icon: 'history', label: 'Log Aktivitas' },
        ];        
    
        container.innerHTML = `
            <div class="profile-card-settings">
                <img src="${photo}" alt="Avatar" class="profile-avatar">
                <strong class="profile-name">${currentUser?.displayName || 'Pengguna'}</strong>
                <span class="profile-email">${currentUser?.email || ''}</span>
                <div class="profile-role-badge">${userRole}</div>
                <div class="profile-actions">
                    <button class="btn btn-secondary" data-action="auth-action">
                        <span class="material-symbols-outlined">${currentUser ? 'logout' : 'login'}</span>
                        <span>${currentUser ? 'Keluar' : 'Masuk'}</span>
                    </button>
                </div>
            </div>
            ${userRole === 'Owner' ? `
                <div id="owner-settings">
                    <h5 class="section-title-owner">Administrasi Owner</h5>
                    <div class="settings-list">
                        ${ownerActions.map(act => `
                            <div class="settings-list-item" data-action="${act.action}" ${act.type ? `data-type="${act.type}"` : ''} ${act.nav ? `data-nav="${act.nav}"` : ''}>
                                <div class="icon-wrapper"><span class="material-symbols-outlined">${act.icon}</span></div>
                                <span class="label">${act.label}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
        `;
    }
async function renderLogAktivitasPage(container) { // [MODIFIKASI] Tambahkan parameter
    const targetContainer = container || $('.page-container');
    targetContainer.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';

    const q = query(logsCol, orderBy("createdAt", "desc"));
    const logSnap = await getDocs(q);
    const logs = logSnap.docs.map(d => ({id: d.id, ...d.data()}));

    if (logs.length === 0) {
        targetContainer.innerHTML = '<p class="empty-state">Belum ada aktivitas yang tercatat.</p>';
        return;
    }

    const logHTML = logs.map(log => {
        const date = log.createdAt.toDate();
        const time = date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        const day = date.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });

        return `
            <div class="log-item">
                <div class="log-item-header">
                    <strong class="log-user">${log.userName}</strong>
                    <span class="log-time">${day}, ${time}</span>
                </div>
                <p class="log-action">${log.action}</p>
            </div>
        `;
    }).join('');

    targetContainer.innerHTML = `<div class="log-container">${logHTML}</div>`;
}


    // --- SUB-SEKSI 3.2: PEMASUKAN ---
    async function renderPemasukanPage() {
        const container = $('.page-container');
        const tabs = [{id:'termin', label:'Termin Proyek'}, {id:'pinjaman', label:'Pinjaman & Pendanaan'}];
        container.innerHTML = `
            <div class="sub-nav">
                ${tabs.map((tab, index) => `<button class="sub-nav-item ${index === 0 ? 'active' : ''}" data-tab="${tab.id}">${tab.label}</button>`).join('')}
            </div>
            <div id="sub-page-content"></div>
        `;

        const renderTabContent = async (tabId) => {
            appState.activeSubPage.set('pemasukan', tabId);
            const contentContainer = $('#sub-page-content');
            contentContainer.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';
            
            let formHTML = '';
            let listHTML = '<div id="pemasukan-list-container"></div>';

            if (tabId === 'termin') {
                await fetchAndCacheData('projects', projectsCol, 'projectName');
                formHTML = _getFormPemasukanHTML('termin');
            } else if (tabId === 'pinjaman') {
                await fetchAndCacheData('fundingCreditors', collection(db, 'teams', TEAM_ID, 'funding_creditors'), 'creditorName');
                formHTML = _getFormPemasukanHTML('pinjaman');
            }
            
            contentContainer.innerHTML = (isViewer() ? '' : formHTML) + listHTML;
            if (!isViewer()) {
                const formEl = $('#pemasukan-form');
                if (formEl) {
                    formEl.setAttribute('data-draft-key', `pemasukan-${tabId}`);
                    // _attachFormDraftPersistence(formEl); // This function seems to be missing from the provided file
                }
                _attachPemasukanFormListeners();
            }
            await _rerenderPemasukanList(tabId);
        }

        $$('.sub-nav-item').forEach(btn => btn.addEventListener('click', (e) => {
            $$('.sub-nav-item').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            renderTabContent(e.currentTarget.dataset.tab);
        }));

        const lastSubPage = appState.activeSubPage.get('pemasukan') || tabs[0].id;
        $(`.sub-nav-item[data-tab="${lastSubPage}"]`)?.classList.add('active');
        await renderTabContent(lastSubPage);
    }
    
    async function _rerenderPemasukanList(type) {
        const listContainer = $('#pemasukan-list-container');
        if (!listContainer) return;
        listContainer.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';

        const col = type === 'termin' ? incomesCol : fundingSourcesCol;
        const key = type === 'termin' ? 'incomes' : 'fundingSources';
        await fetchAndCacheData(key, col);
        
        listContainer.innerHTML = _getListPemasukanHTML(type);
    }

    const createMasterDataSelect = (id, label, options, selectedValue = '', masterType = null) => {
        const selectedOption = options.find(opt => opt.value === selectedValue);
        const selectedText = selectedOption ? selectedOption.text : 'Pilih...';
        const showMasterButton = masterType && masterType !== 'projects' && !isViewer();

        return `
            <div class="form-group">
                <label>${label}</label>
                <div class="master-data-select">
                    <div class="custom-select-wrapper">
                        <input type="hidden" id="${id}" name="${id}" value="${selectedValue}">
                        <button type="button" class="custom-select-trigger" ${isViewer() ? 'disabled' : ''}>
                            <span>${selectedText}</span>
                            <span class="material-symbols-outlined">arrow_drop_down</span>
                        </button>
                        <div class="custom-select-options">
                            ${options.map(opt => `<div class="custom-select-option" data-value="${opt.value}">${opt.text}</div>`).join('')}
                        </div>
                    </div>
                    ${showMasterButton ? `<button type="button" class="btn-icon master-data-trigger" data-action="manage-master" data-type="${masterType}"><span class="material-symbols-outlined">database</span></button>` : ''}
                </div>
            </div>
        `;
    };
    
    function _getFormPemasukanHTML(type) {
        let formHTML = '';
        if (type === 'termin') {
            const projectOptions = appState.projects
                .filter(p => p.projectType === 'main_income')
                .map(p => ({ value: p.id, text: p.projectName }));

            formHTML = `
                <div class="card card-pad">
                    <form id="pemasukan-form" data-type="termin">
                        ${createMasterDataSelect('pemasukan-proyek', 'Proyek Terkait', projectOptions, '', 'projects')}
                        <div class="form-group">
                            <label>Jumlah Termin Diterima</label>
                            <input type="text" inputmode="numeric" id="pemasukan-jumlah" required placeholder="mis. 50.000.000">
                        </div>
                        <div class="form-group">
                            <label>Tanggal</label>
                            <input type="date" id="pemasukan-tanggal" value="${new Date().toISOString().slice(0,10)}" required>
                        </div>
                        <div id="fee-allocation-container" style="margin-top: 1.5rem;"></div>
                        <button type="submit" class="btn btn-primary">Simpan Pemasukan</button>
                    </form>
                </div>
            `;
        } else if (type === 'pinjaman') {
            const creditorOptions = appState.fundingCreditors.map(c => ({ value: c.id, text: c.creditorName }));
            const loanTypeOptions = [ {value: 'none', text: 'Tanpa Bunga'}, {value: 'interest', text: 'Berbunga'} ];
            formHTML = `
                <div class="card card-pad">
                    <form id="pemasukan-form" data-type="pinjaman">
                        <div class="form-group">
                            <label>Jumlah</label>
                            <input type="text" inputmode="numeric" id="pemasukan-jumlah" required placeholder="mis. 5.000.000">
                        </div>
                        <div class="form-group">
                            <label>Tanggal</label>
                            <input type="date" id="pemasukan-tanggal" value="${new Date().toISOString().slice(0,10)}" required>
                        </div>
                        ${createMasterDataSelect('pemasukan-kreditur', 'Kreditur', creditorOptions, '', 'creditors')}
                        ${createMasterDataSelect('loan-interest-type', 'Jenis Pinjaman', loanTypeOptions, 'none')}
                        <div class="loan-details hidden">
                            <div class="form-group">
                                <label>Suku Bunga (% per bulan)</label>
                                <input type="number" id="loan-rate" placeholder="mis. 10" step="0.01" min="1">
                            </div>
                            <div class="form-group">
                                <label>Tenor (bulan)</label>
                                <input type="number" id="loan-tenor" placeholder="mis. 3" min="1">
                            </div>
                            <div id="loan-calculation-result" class="loan-calculation-result"></div>
                        </div>
                        <button type="submit" class="btn btn-primary">Simpan</button>
                    </form>
                </div>
            `;
        }
        return formHTML;
    }

    function _getListPemasukanHTML(type) {
        const list = type === 'termin' ? appState.incomes : appState.fundingSources;
        if (!list || list.length === 0) {
            return `<p class="empty-state">Belum ada data.</p>`;
        }
        return `
        <div style="margin-top: 1.5rem;">
            ${list.map(item => {
                const title = type === 'termin' 
                    ? appState.projects.find(p => p.id === item.projectId)?.projectName || 'Termin Proyek'
                    : appState.fundingCreditors.find(c => c.id === item.creditorId)?.creditorName || 'Pinjaman';
                const amount = item.totalAmount || item.amount || 0;
                const paidAmount = item.paidAmount || 0;
                const totalRepayment = item.totalRepaymentAmount || amount;
                const remainingAmount = totalRepayment - paidAmount;
                const date = item.date?.toDate ? item.date.toDate().toLocaleDateString('id-ID', {day:'numeric', month:'long', year:'numeric'}) : 'Tanggal tidak valid';
                
                const isPaid = item.status === 'paid' || remainingAmount <= 0;
                let secondaryInfoHTML = '';
                if (type === 'pinjaman') {
                    if (isPaid) {
                        secondaryInfoHTML = `<div class="paid-indicator"><span class="material-symbols-outlined">task_alt</span> Lunas</div>`;
                    } else {
                        secondaryInfoHTML = `<p class="card-list-item-repayment-info">Sisa: <strong>${fmtIDR(remainingAmount)}</strong></p>`;
                    }
                }

                return `
                <div class="card card-list-item" data-id="${item.id}" data-type="${type}">
                    <div class="card-list-item-content" data-action="open-detail">
                        <div class="card-list-item-details">
                            <h5 class="card-list-item-title">${title}</h5>
                            <p class="card-list-item-subtitle">${date}</p>
                        </div>
                        <div class="card-list-item-amount-wrapper">
                            <strong class="card-list-item-amount">${fmtIDR(amount)}</strong>
                            ${secondaryInfoHTML}
                        </div>
                    </div>
                    ${isViewer() ? '' : `<button class="btn-icon card-list-item-actions-trigger" data-action="open-actions">
                        <span class="material-symbols-outlined">more_vert</span>
                    </button>`}
                </div>`;
            }).join('')}
        </div>`;
    }

    function _createDetailContentHTML(item, type) {
        const details = [];
        const formatDate = (date) => date ? date.toDate().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : 'N/A';
    
        if (type === 'termin') {
            const projectName = appState.projects.find(p => p.id === item.projectId)?.projectName || 'Tidak ditemukan';
            details.push({ label: 'Proyek', value: projectName });
            details.push({ label: 'Jumlah', value: fmtIDR(item.amount) });
            details.push({ label: 'Tanggal Pemasukan', value: formatDate(item.date) });
    
        } else { // type === 'pinjaman'
            const creditorName = appState.fundingCreditors.find(c => c.id === item.creditorId)?.creditorName || 'Tidak ditemukan';
            const totalPayable = item.totalRepaymentAmount || item.totalAmount;
            details.push({ label: 'Kreditur', value: creditorName });
            details.push({ label: 'Jumlah Pinjaman', value: fmtIDR(item.totalAmount) });
            details.push({ label: 'Tanggal Pinjaman', value: formatDate(item.date) });
            details.push({ label: 'Jenis Pinjaman', value: item.interestType === 'interest' ? 'Berbunga' : 'Tanpa Bunga' });
            if (item.interestType === 'interest') {
                details.push({ label: 'Suku Bunga', value: `${item.rate || 0}% per bulan` });
                details.push({ label: 'Tenor', value: `${item.tenor || 0} bulan` });
                details.push({ label: 'Total Tagihan', value: fmtIDR(item.totalRepaymentAmount) });
            }
            details.push({ label: 'Sudah Dibayar', value: fmtIDR(item.paidAmount || 0) });
            details.push({ label: 'Sisa Tagihan', value: fmtIDR(totalPayable - (item.paidAmount || 0)) });
            details.push({ label: 'Status', value: item.status === 'paid' ? 'Lunas' : 'Belum Lunas' });
        }
        
        return `
            <dl class="detail-list">
                ${details.map(d => `
                    <div>
                        <dt>${d.label}</dt>
                        <dd>${d.value}</dd>
                    </div>
                `).join('')}
            </dl>
        `;
    }
    
    function _updateLoanCalculation() {
        const resultEl = $('#loan-calculation-result');
        if (!resultEl) return;
    
        const amount = parseFormattedNumber($('#pemasukan-jumlah')?.value || '0');
        const rate = Number($('#loan-rate')?.value || '0');
        const tenor = Number($('#loan-tenor')?.value || '0');
    
        if (amount > 0 && rate > 0 && tenor > 0) {
            const totalInterest = amount * (rate / 100) * tenor;
            const totalRepayment = amount + totalInterest;
            
            resultEl.innerHTML = `
                <span class="label">Total Tagihan Pinjaman</span>
                <span class="amount">${fmtIDR(totalRepayment)}</span>
            `;
            resultEl.style.display = 'block';
        } else {
            resultEl.style.display = 'none';
        }
    }
    
    function _formatNumberInput(e) {
        const input = e.target;
        let selectionStart = input.selectionStart;
        const originalLength = input.value.length;
        const rawValue = parseFormattedNumber(input.value);
    
        if (isNaN(rawValue)) {
            input.value = '';
            return;
        }
        
        const formattedValue = new Intl.NumberFormat('id-ID').format(rawValue);
        
        if (input.value !== formattedValue) {
            input.value = formattedValue;
            const newLength = formattedValue.length;
            const diff = newLength - originalLength;
            if (selectionStart !== null) {
                input.setSelectionRange(selectionStart + diff, selectionStart + diff);
            }
        }
    }

    function _initCustomSelects(context = document) {
        context.querySelectorAll('.custom-select-wrapper').forEach(wrapper => {
            const trigger = wrapper.querySelector('.custom-select-trigger');
            if (!trigger || trigger.disabled) return;
            const optionsContainer = wrapper.querySelector('.custom-select-options');
            const hiddenInput = wrapper.querySelector('input[type="hidden"]');
            const triggerSpan = trigger.querySelector('span:first-child');

            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                const isActive = wrapper.classList.contains('active');
                $$('.custom-select-wrapper').forEach(w => w.classList.remove('active'));
                if (!isActive) wrapper.classList.add('active');
            });

            optionsContainer.addEventListener('click', e => {
                const option = e.target.closest('.custom-select-option');
                if (option) {
                    hiddenInput.value = option.dataset.value;
                    triggerSpan.textContent = option.textContent;
                    wrapper.classList.remove('active');
                    hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
        });
    }

    function _attachPemasukanFormListeners() {
        $('#pemasukan-form')?.addEventListener('submit', handleAddPemasukan);
        _initCustomSelects();
        
        $('#loan-interest-type')?.addEventListener('change', () => {
            $('.loan-details')?.classList.toggle('hidden', $('#loan-interest-type').value === 'none');
        });
    
        const amountInput = $('#pemasukan-jumlah');
        const rateInput = $('#loan-rate');
        const tenorInput = $('#loan-tenor');
    
        if (amountInput) {
            amountInput.addEventListener('input', _formatNumberInput);
            amountInput.addEventListener('input', () => {
                const formType = $('#pemasukan-form').dataset.type;
                if (formType === 'termin') _calculateAndDisplayFees();
                else _updateLoanCalculation();
            });
        }
        rateInput?.addEventListener('input', _updateLoanCalculation);
        tenorInput?.addEventListener('input', _updateLoanCalculation);
    }

    async function _calculateAndDisplayFees() {
        const container = $('#fee-allocation-container');
        const amount = parseFormattedNumber($('#pemasukan-jumlah').value);
        if (!container || amount <= 0) {
            if(container) container.innerHTML = '';
            return;
        }
    
        await fetchAndCacheData('staff', collection(db, 'teams', TEAM_ID, 'staff'), 'staffName');
        const allStaff = appState.staff || [];
        const relevantStaff = allStaff.filter(s => s.paymentType === 'per_termin' || s.paymentType === 'fixed_per_termin');
        if (relevantStaff.length === 0) return;
    
        let totalFee = 0;
        const allocationHTML = relevantStaff.map(staff => {
            let feeAmount = 0;
            const isFixed = staff.paymentType === 'fixed_per_termin';
            
            if (isFixed) {
                feeAmount = staff.feeAmount || 0;
            } else { // per_termin
                feeAmount = amount * ((staff.feePercentage || 0) / 100);
            }
    
            return `
                <div class="detail-list-item">
                    ${isFixed ? `<label class="custom-checkbox-label"><input type="checkbox" class="fee-alloc-checkbox" data-amount="${feeAmount}" data-staff-id="${staff.id}" checked><span class="custom-checkbox-visual"></span></label>` : '<div style="width: 20px;"></div>'}
                    <div class="item-main">
                        <span class="item-date">${staff.staffName} ${isFixed ? '' : `(${staff.feePercentage}%)`}</span>
                        <span class="item-project">${isFixed ? 'Fee Tetap' : 'Fee Persentase'}</span>
                    </div>
                    <div class="item-secondary">
                        <strong class="item-amount positive">${fmtIDR(feeAmount)}</strong>
                    </div>
                </div>
            `;
        }).join('');
    
        container.innerHTML = `
            <h5 class="invoice-section-title">Alokasi Fee Tim</h5>
            <div class="detail-list-container">${allocationHTML}</div>
            <div class="invoice-total">
                <span>Total Alokasi Fee:</span>
                <strong id="total-fee-amount">${fmtIDR(totalFee)}</strong>
            </div>
        `;
    
        const updateTotalFee = () => {
            let currentTotal = allStaff.filter(s => s.paymentType === 'per_termin').reduce((sum, s) => sum + (amount * ((s.feePercentage || 0) / 100)), 0);
            $$('.fee-alloc-checkbox:checked').forEach(cb => { currentTotal += Number(cb.dataset.amount); });
            $('#total-fee-amount').textContent = fmtIDR(currentTotal);
        };
    
        $$('.fee-alloc-checkbox').forEach(cb => cb.addEventListener('change', updateTotalFee));
        updateTotalFee();
    }

    async function handleAddPemasukan(e) {
        e.preventDefault();
        const form = e.target;
        const type = form.dataset.type;
        const amount = parseFormattedNumber($('#pemasukan-jumlah', form).value);
        const date = new Date($('#pemasukan-tanggal', form).value);
        toast('syncing', 'Menyimpan...');
        try {
            const batch = writeBatch(db);
            if (type === 'termin') {
                const projectId = $('#pemasukan-proyek', form).value;
                if (!projectId) { toast('error', 'Silakan pilih proyek terkait.'); return; }
                const incomeRef = doc(incomesCol);
                batch.set(incomeRef, { amount, date, projectId, createdAt: serverTimestamp() });
    
                appState.staff.filter(s => s.paymentType === 'per_termin').forEach(staff => {
                    const feeAmount = amount * ((staff.feePercentage || 0) / 100);
                    if (feeAmount > 0) {
                        const billRef = doc(billsCol);
                        batch.set(billRef, {
                            description: `Fee ${staff.staffName} (${staff.feePercentage}%) untuk termin proyek`, amount: feeAmount, paidAmount: 0,
                            dueDate: Timestamp.fromDate(date), status: 'unpaid', type: 'fee', staffId: staff.id, projectId: projectId,
                            incomeId: incomeRef.id, createdAt: serverTimestamp()
                        });
                    }
                });
    
                $$('.fee-alloc-checkbox:checked').forEach(cb => {
                    const staffId = cb.dataset.staffId;
                    const feeAmount = Number(cb.dataset.amount);
                    const staff = appState.staff.find(s => s.id === staffId);
                    if (staff && feeAmount > 0) {
                        const billRef = doc(billsCol);
                        batch.set(billRef, {
                            description: `Fee Tetap ${staff.staffName} untuk termin proyek`, amount: feeAmount, paidAmount: 0,
                            dueDate: Timestamp.fromDate(date), status: 'unpaid', type: 'fee', staffId: staff.id, projectId: projectId,
                            incomeId: incomeRef.id, createdAt: serverTimestamp()
                        });
                    }
                });
                await batch.commit();
                await _logActivity(`Menambah Pemasukan Termin: ${fmtIDR(amount)}`, { docId: projectId, amount });

            } else {
                const creditorId = $('#pemasukan-kreditur', form).value;
                if (!creditorId) { toast('error', 'Silakan pilih kreditur.'); return; }
                const interestType = $('#loan-interest-type', form).value;
                
                let loanData = { creditorId, totalAmount: amount, date, interestType, status: 'unpaid', paidAmount: 0, createdAt: serverTimestamp() };
                if (interestType === 'interest') {
                    const rate = Number($('#loan-rate', form).value);
                    const tenor = Number($('#loan-tenor', form).value);
                    if (rate < 1 || tenor < 1) {
                        toast('error', 'Bunga dan Tenor minimal harus 1.'); return;
                    }
                    const totalRepayment = amount * (1 + (rate / 100 * tenor));

                    loanData.rate = rate;
                    loanData.tenor = tenor;
                    loanData.totalRepaymentAmount = totalRepayment;
                }
                await addDoc(fundingSourcesCol, loanData);
                await _logActivity(`Menambah Pinjaman: ${fmtIDR(amount)}`, { creditorId, amount });
            }
            toast('success', 'Data berhasil disimpan!');
            form.reset();
            $$('.custom-select-trigger span:first-child', form).forEach(s => s.textContent = 'Pilih...');
            const loanCalcResult = $('#loan-calculation-result', form);
            if(loanCalcResult) loanCalcResult.style.display = 'none';
            await _rerenderPemasukanList(type);
        } catch (error) {
            toast('error', 'Gagal menyimpan data.');
            console.error(error);
        }
    }

    // --- SUB-SEKSI 3.3: PENGELUARAN & STOK ---
    async function renderPengeluaranPage() {
        const container = $('.page-container');
        const tabs = [{id:'operasional', label:'Operasional'}, {id:'material', label:'Material'}, {id:'lainnya', label:'Lainnya'}];
        container.innerHTML = `
            <div class="sub-nav">
                ${tabs.map((tab, index) => `<button class="sub-nav-item ${index === 0 ? 'active' : ''}" data-tab="${tab.id}">${tab.label}</button>`).join('')}
            </div>
            <div id="sub-page-content"></div>
        `;
    
        const renderTabContent = async (tabId) => {
            appState.activeSubPage.set('pengeluaran', tabId);
            const contentContainer = $('#sub-page-content');
            contentContainer.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';
            
            let formHTML;
            await fetchAndCacheData('suppliers', suppliersCol, 'supplierName');
            await fetchAndCacheData('projects', projectsCol, 'projectName');
            
            if (tabId === 'material') {
                // Ambil data material di sini untuk memperbaiki error
                await fetchAndCacheData('materials', collection(db, 'teams', TEAM_ID, 'materials'), 'materialName');
                formHTML = _getFormFakturMaterialHTML();
            } else {
                // Logika untuk tab operasional & lainnya (tidak berubah)
                let categoryOptions = [], categoryMasterType = '', categoryLabel = '';
                let categoryType;
                if (tabId === 'operasional') {
                    await fetchAndCacheData('operationalCategories', opCatsCol);
                    categoryOptions = appState.operationalCategories.map(c => ({ value: c.id, text: c.categoryName }));
                    categoryMasterType = 'op-cats'; categoryLabel = 'Kategori Operasional'; categoryType = 'Operasional';
                } else if (tabId === 'lainnya') {
                    await fetchAndCacheData('otherCategories', otherCatsCol);
                    categoryOptions = appState.otherCategories.map(c => ({ value: c.id, text: c.categoryName }));
                    categoryMasterType = 'other-cats'; categoryLabel = 'Kategori Lainnya'; categoryType = 'Lainnya';
                }
                const supplierOptions = appState.suppliers.filter(s => s.category === categoryType).map(s => ({ value: s.id, text: s.supplierName }));
                const projectOptions = appState.projects.map(p => ({ value: p.id, text: p.projectName }));
                formHTML = _getFormPengeluaranHTML(tabId, categoryOptions, categoryMasterType, categoryLabel, supplierOptions, projectOptions);
            }
    
            contentContainer.innerHTML = isViewer() ? '<p class="empty-state">Halaman ini hanya untuk input data.</p>' : formHTML;
            
            if(!isViewer()) {
                const formEl = $('#pengeluaran-form') || $('#material-invoice-form');
                if (formEl) {
                    formEl.setAttribute('data-draft-key', `pengeluaran-${tabId}`);
                    _attachFormDraftPersistence(formEl);
                }
                _attachPengeluaranFormListeners(tabId);
            }        
        }
    
        $$('.sub-nav-item').forEach(btn => btn.addEventListener('click', (e) => {
            $$('.sub-nav-item').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            renderTabContent(e.currentTarget.dataset.tab);
        }));
    
        const lastSubPage = appState.activeSubPage.get('pengeluaran') || tabs[0].id;
        $(`.sub-nav-item[data-tab="${lastSubPage}"]`)?.classList.add('active');
        await renderTabContent(lastSubPage);
    }
    
// GANTI FUNGSI INI
function _getFormPengeluaranHTML(type, categoryOptions, categoryMasterType, categoryLabel, supplierOptions, projectOptions) {
    return `
    <div class="card card-pad">
        <form id="pengeluaran-form" data-type="${type}">
            ${createMasterDataSelect('expense-project', 'Proyek', projectOptions, '', 'projects')}
            ${categoryOptions.length > 0 ? createMasterDataSelect('expense-category', categoryLabel, categoryOptions, '', categoryMasterType) : ''}
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
            .map(s => ({ value: s.id, text: s.supplierName }));
        const projectOptions = appState.projects.map(p => ({ value: p.id, text: p.projectName }));

        return `
        <div class="card card-pad">
            <form id="material-invoice-form" data-type="material">
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

                <h5 class="invoice-section-title">Rincian Barang</h5>
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
        const form = (type === 'material') ? $('#material-invoice-form') : $('#pengeluaran-form');
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
            $('#add-invoice-item-btn')?.addEventListener('click', () => _addInvoiceItemRow());
            $('#invoice-items-container')?.addEventListener('input', (e) => _handleInvoiceItemChange(e));
            
            // Logika baru untuk tombol opsi Faktur/Surat Jalan
            $('#form-type-selector')?.addEventListener('click', (e) => {
                const btn = e.target.closest('.form-type-btn');
                if (!btn) return;
                
                $$('#form-type-selector .form-type-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                const formType = btn.dataset.type;
                const isSuratJalan = formType === 'surat_jalan';
                
                form.querySelector('input[name="formType"]').value = formType;
                $('#total-faktur-wrapper').style.display = isSuratJalan ? 'none' : 'flex';
                $('#payment-status-wrapper').style.display = isSuratJalan ? 'none' : 'block';
                $('#attachment-label').textContent = isSuratJalan ? 'Upload Bukti Surat Jalan' : 'Upload Bukti Faktur';
                
                $$('.invoice-item-row').forEach(row => {
                    const priceInput = row.querySelector('.item-price');
                    const totalSpan = row.querySelector('.item-total');
                    priceInput.required = !isSuratJalan;
                    priceInput.closest('.item-details').style.display = isSuratJalan ? 'none' : 'flex';
                    if(isSuratJalan) priceInput.value = '';
                });
                _updateInvoiceTotal();
            });
            
            if ($$('#invoice-items-container .invoice-item-row').length === 0) {
                _addInvoiceItemRow();
            }

            const invoiceNumberInput = $('#pengeluaran-deskripsi');
            if (invoiceNumberInput) {
                invoiceNumberInput.value = _generateInvoiceNumber();
            }
        } else {
            $('#pengeluaran-jumlah')?.addEventListener('input', _formatNumberInput);
        }
        
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            handleAddPengeluaran(e, type);
        });
    }

    async function handleAddPengeluaran(e, type) {
        e.preventDefault();
        const form = e.target;
        
        toast('syncing', 'Memvalidasi dan menyimpan...');
        try {
            const projectId = form.elements['expense-project']?.value || form.elements['project-id']?.value;
            if (!projectId) { toast('error', 'Proyek harus dipilih.'); return; }
    
            if (type === 'material') {
                const formType = form.elements.formType.value;
                const isSuratJalan = formType === 'surat_jalan';

                const items = [];
                $$('.invoice-item-row', form).forEach(row => {
                    const materialId = row.querySelector('input[name="materialId"]').value;
                    const price = isSuratJalan ? 0 : parseFormattedNumber(row.querySelector('input[name="itemPrice"]').value);
                    const qty = Number(row.querySelector('input[name="itemQty"]').value);
                    if (materialId && qty > 0) {
                        if (!isSuratJalan && price <= 0) return; // Harga wajib jika bukan surat jalan
                        items.push({ materialId, price, qty, total: price * qty });
                    }
                });
    
                if (items.length === 0) { toast('error', 'Harap tambahkan minimal satu barang.'); return; }
    
                const expenseStatus = isSuratJalan ? 'delivery_order' : (form.querySelector('input[name="status"]').value || 'unpaid');
                const expenseAmount = isSuratJalan ? 0 : items.reduce((sum, item) => sum + item.total, 0);
    
                const expenseData = {
                    amount: expenseAmount,
                    description: form.elements['pengeluaran-deskripsi'].value,
                    supplierId: form.elements['supplier-id'].value,
                    date: new Date(form.elements['pengeluaran-tanggal'].value),
                    type: 'material', projectId, items, status: expenseStatus,
                    attachmentUrl: '', createdAt: serverTimestamp()
                };
                
                const attachmentFile = form.elements.attachmentFileCamera?.files[0] || form.elements.attachmentFileGallery?.files[0];
                if (attachmentFile) {
                    expenseData.attachmentUrl = await _uploadFileToCloudinary(attachmentFile) || '';
                }

                await runTransaction(db, async (transaction) => {
                    const expenseDocRef = doc(expensesCol);
                    transaction.set(expenseDocRef, expenseData);
    
                    if (!isSuratJalan) {
                        const billRef = doc(billsCol);
                        transaction.set(billRef, {
                            expenseId: expenseDocRef.id, description: expenseData.description, amount: expenseData.amount, 
                            dueDate: expenseData.date, status: expenseStatus, type: 'material', projectId, 
                            paidAmount: expenseStatus === 'paid' ? expenseAmount : 0,
                            ...(expenseStatus === 'paid' && { paidAt: serverTimestamp() }),
                            createdAt: serverTimestamp()
                        });
                    }
    
                    for (const item of items) {
                        const materialRef = doc(collection(db, 'teams', TEAM_ID, 'materials'), item.materialId);
                        const stockTransRef = doc(stockTransactionsCol);
                        transaction.update(materialRef, { currentStock: increment(item.qty) });
                        if (!isSuratJalan && item.price > 0) {
                            transaction.update(materialRef, { lastPrice: item.price });
                        }
                        transaction.set(stockTransRef, {
                            materialId: item.materialId, quantity: item.qty, date: Timestamp.fromDate(expenseData.date),
                            type: 'in', expenseId: expenseDocRef.id, pricePerUnit: item.price,
                            createdAt: serverTimestamp()
                        });
                    }
                });
    
                await _logActivity(`Menambah Faktur Material`, { desc: expenseData.description, status: expenseStatus });
                toast('success', `Data berhasil disimpan! Stok telah diperbarui.`);
                       
            } else { // Logika untuk pengeluaran operasional/lainnya (tidak berubah)
               const expenseData = {
                   amount: parseFormattedNumber(form.elements['pengeluaran-jumlah'].value),
                   description: form.elements['pengeluaran-deskripsi'].value.trim(),
                   supplierId: form.elements['expense-supplier'].value,
                   categoryId: form.elements['expense-category']?.value || '',
                   date: new Date(form.elements['pengeluaran-tanggal'].value),
                   type: type, projectId,
                   attachmentUrl: ''
               };
                
                if (!expenseData.amount || !expenseData.description) {
                    toast('error', 'Harap isi deskripsi dan jumlah.'); return;
                }
    
                const status = form.querySelector('input[name="status"]').value || 'unpaid';
                expenseData.status = status;
                expenseData.createdAt = serverTimestamp();
    
                const expenseDocRef = await addDoc(expensesCol, expenseData);
                await addDoc(billsCol, {
                    expenseId: expenseDocRef.id, description: expenseData.description, amount: expenseData.amount,
                    dueDate: expenseData.date, status: expenseData.status, type: expenseData.type,
                    projectId: expenseData.projectId, createdAt: serverTimestamp(),
                    paidAmount: status === 'paid' ? expenseData.amount : 0,
                    ...(status === 'paid' && { paidAt: serverTimestamp() })
                });
                
                await _logActivity(`Menambah Pengeluaran: ${expenseData.description}`, { docId: expenseDocRef.id, status });
                toast('success', 'Pengeluaran berhasil disimpan!');
            }
    
            form.reset();
            handleNavigation('tagihan');
    
        } catch (error) {
            toast('error', 'Gagal menyimpan data.');
            console.error("Error saving expense:", error);
        }
    }
    
    
    function _addInvoiceItemRow(context = document) {
        const container = $('#invoice-items-container', context);
        if (!container) return;
    
        const materialOptions = (appState.materials || [])
            .map(m => `<div class="custom-select-option" data-value="${m.id}">${m.materialName} (${m.unit})</div>`)
            .join('');

        const index = container.children.length;
        const itemHTML = `
            <div class="invoice-item-row" data-index="${index}">
                <div class="custom-select-wrapper item-material-select">
                    <input type="hidden" name="materialId" required>
                    <button type="button" class="custom-select-trigger">
                        <span>Pilih Material...</span>
                        <span class="material-symbols-outlined">arrow_drop_down</span>
                    </button>
                    <div class="custom-select-options">${materialOptions}</div>
                </div>
                <div class="item-details">
                    <input type="text" inputmode="numeric" name="itemPrice" placeholder="Harga" class="item-price" required>
                    <span>x</span>
                    <input type="number" name="itemQty" placeholder="Qty" class="item-qty" value="1" required>
                </div>
                <span class="item-total">Rp 0</span>
                <button type="button" class="btn-icon btn-icon-danger remove-item-btn"><span class="material-symbols-outlined">delete</span></button>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', itemHTML);
        const newRow = container.lastElementChild;

        _initCustomSelects(newRow);
        newRow.querySelector('.remove-item-btn').addEventListener('click', () => {
            newRow.remove();
            _updateInvoiceTotal(context);
        });
        newRow.querySelectorAll('input[inputmode="numeric"]').forEach(input => {
            input.addEventListener('input', _formatNumberInput);
        });
    }

    function _handleInvoiceItemChange(e, context = document) {
        if (!e.target.matches('.item-price, .item-qty')) return;
        const row = e.target.closest('.invoice-item-row');
        const price = parseFormattedNumber(row.querySelector('.item-price').value);
        const qty = Number(row.querySelector('.item-qty').value);
        const totalEl = row.querySelector('.item-total');
        totalEl.textContent = fmtIDR(price * qty);
        _updateInvoiceTotal(context);
    }
    
    function _updateInvoiceTotal(context = document) {
        let totalAmount = 0;
        $$('.invoice-item-row', context).forEach(row => {
            const price = parseFormattedNumber(row.querySelector('.item-price').value);
            const qty = Number(row.querySelector('.item-qty').value);
            totalAmount += price * qty;
        });
        $('#invoice-total-amount', context).textContent = fmtIDR(totalAmount);
    }

    function _generateInvoiceNumber() {
        const date = new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const randomPart = Math.random().toString(36).substring(2, 7).toUpperCase();
        return `INV/${year}${month}${day}/${randomPart}`;
    }

    async function renderStokPage() {
        const container = $('.page-container');
        const tabs = [
            { id: 'daftar', label: 'Daftar Stok' },
            { id: 'estimasi', label: 'Estimasi Belanja' },
            { id: 'riwayat', label: 'Riwayat Stok' }
        ];
        container.innerHTML = `
            <div class="sub-nav">
                ${tabs.map((tab, index) => `<button class="sub-nav-item ${index === 0 ? 'active' : ''}" data-tab="${tab.id}">${tab.label}</button>`).join('')}
            </div>
            <div id="sub-page-content"></div>
        `;
    
        const renderTabContent = async (tabId) => {
            appState.activeSubPage.set('stok', tabId);
            const contentContainer = $('#sub-page-content');
            contentContainer.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';
            
            await fetchAndCacheData('materials', materialsCol, 'materialName');
    
            if (tabId === 'daftar') await _renderDaftarStokView(contentContainer);
            else if (tabId === 'estimasi') await _renderEstimasiBelanjaView(contentContainer);
            else if (tabId === 'riwayat') await _renderRiwayatStokView(contentContainer);
        };
    
        $$('.sub-nav-item').forEach(btn => btn.addEventListener('click', (e) => {
            $$('.sub-nav-item').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            renderTabContent(e.currentTarget.dataset.tab);
        }));
    
        const lastSubPage = appState.activeSubPage.get('stok') || tabs[0].id;
        $(`.sub-nav-item[data-tab="${lastSubPage}"]`)?.classList.add('active');
        await renderTabContent(lastSubPage);
    }
    
    async function _renderDaftarStokView(container) {
        const materials = appState.materials || [];
        const listHTML = materials.map(item => {
            const stockLevel = item.currentStock || 0;
            const reorderPoint = item.reorderPoint || 0;
            const isLowStock = stockLevel <= reorderPoint;
    
            return `
                <div class="card card-list-item">
                    <div class="card-list-item-content">
                        <div class="card-list-item-details">
                            <h5 class="card-list-item-title">${item.materialName}</h5>
                            <p class="card-list-item-subtitle ${isLowStock ? 'negative' : ''}">
                                Stok saat ini: <strong>${stockLevel} ${item.unit || ''}</strong>
                                ${isLowStock ? ' (Stok menipis!)' : ''}
                            </p>
                        </div>
                        <div class="stok-actions">
                            <button class="btn btn-sm btn-success" data-action="stok-in" data-id="${item.id}"><span class="material-symbols-outlined">add</span>Masuk</button>
                            <button class="btn btn-sm btn-danger" data-action="stok-out" data-id="${item.id}"><span class="material-symbols-outlined">remove</span>Keluar</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
        container.innerHTML = `
            <div class="stok-header">
                <button class="btn btn-primary" data-action="manage-master" data-type="materials"><span class="material-symbols-outlined">inventory_2</span> Kelola Master Material</button>
            </div>
            ${materials.length > 0 ? listHTML : '<p class="empty-state">Belum ada data material.</p>'}
        `;
    }

    async function _renderEstimasiBelanjaView(container) {
        const lowStockItems = (appState.materials || []).filter(item => (item.currentStock || 0) <= (item.reorderPoint || 0));
    
        if (lowStockItems.length === 0) {
            container.innerHTML = '<p class="empty-state">👍 Stok semua material aman.</p>';
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

    async function _renderRiwayatStokView(container) {
        const transCol = stockTransactionsCol;
        const q = query(transCol, orderBy("date", "desc"));
        const transSnap = await getDocs(q);
        const transactions = transSnap.docs.map(d => ({id: d.id, ...d.data()}));
    
        if (transactions.length === 0) {
            container.innerHTML = '<p class="empty-state">Belum ada riwayat transaksi stok.</p>';
            return;
        }
        
        await fetchAndCacheData('projects', projectsCol, 'projectName');
    
        const listHTML = transactions.map(trans => {
            const material = appState.materials.find(m => m.id === trans.materialId);
            const project = appState.projects.find(p => p.id === trans.projectId);
            const date = trans.date.toDate().toLocaleDateString('id-ID', {day: '2-digit', month: 'short'});
            const isStokIn = trans.type === 'in';
    
            return `
                <div class="jurnal-item card">
                    <div class="jurnal-item-header">
                        <strong>${material?.materialName || 'Material Dihapus'}</strong>
                        <strong class="${isStokIn ? 'positive' : 'negative'}">
                            ${isStokIn ? '+' : '-'}${trans.quantity} ${material?.unit || ''}
                        </strong>
                    </div>
                    <div class="jurnal-item-details">
                        <span>Tanggal: ${date}</span>
                        <span>${isStokIn ? 'Stok Masuk' : `Digunakan untuk: ${project?.projectName || 'N/A'}`}</span>
                    </div>
                </div>
            `;
        }).join('');
    
        container.innerHTML = `<div class="jurnal-list">${listHTML}</div>`;
    }    
    
    async function handleStokInModal(materialId) {
        const material = appState.materials.find(m => m.id === materialId);
        if (!material) return toast('error', 'Material tidak ditemukan.');

        const content = `
            <form id="stok-in-form" data-id="${materialId}">
                <p>Mencatat pembelian untuk <strong>${material.materialName}</strong>.</p>
                <div class="form-group"><label>Jumlah Masuk (dalam ${material.unit || 'satuan'})</label><input type="number" name="quantity" required min="1"></div>
                <div class="form-group"><label>Harga per Satuan</label><input type="text" name="price" inputmode="numeric" required></div>
                <div class="form-group"><label>Tanggal Pembelian</label><input type="date" name="date" value="${new Date().toISOString().slice(0,10)}" required></div>
                <button type="submit" class="btn btn-primary">Simpan</button>
            </form>
        `;
        createModal('dataDetail', { title: 'Form Stok Masuk', content });
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

        const projectOptions = appState.projects.map(p => ({ value: p.id, text: p.projectName }));

        const content = `
            <form id="stok-out-form" data-id="${materialId}">
                <p>Mencatat pemakaian untuk <strong>${material.materialName}</strong>.</p>
                <div class="form-group"><label>Jumlah Keluar (dalam ${material.unit || 'satuan'})</label><input type="number" name="quantity" required min="1" max="${material.currentStock || 0}"></div>
                ${createMasterDataSelect('projectId', 'Digunakan untuk Proyek', projectOptions, '', 'projects')}
                <div class="form-group"><label>Tanggal Pemakaian</label><input type="date" name="date" value="${new Date().toISOString().slice(0,10)}" required></div>
                <button type="submit" class="btn btn-primary">Simpan</button>
            </form>
        `;
        createModal('dataDetail', { title: 'Form Stok Keluar', content });
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
                transaction.update(materialRef, { currentStock: increment(quantity) });
                transaction.set(transRef, {
                    materialId, quantity, date: Timestamp.fromDate(date),
                    type: 'in', pricePerUnit: price, createdAt: serverTimestamp()
                });
            });
            await _logActivity('Mencatat Stok Masuk', { materialId, quantity });
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
                transaction.update(materialRef, { currentStock: increment(-quantity) });
                transaction.set(transRef, {
                    materialId, quantity, date: Timestamp.fromDate(date),
                    type: 'out', projectId, createdAt: serverTimestamp()
                });
            });
            await _logActivity('Mencatat Stok Keluar', { materialId, quantity, projectId });
            toast('success', 'Pemakaian stok berhasil dicatat.');
            renderStokPage();
        } catch (error) {
            toast('error', error.message || 'Gagal mencatat pemakaian.');
            console.error(error);
        }
    }

    // --- SUB-SEKSI 3.4: ABSENSI & JURNAL ---
    async function renderAbsensiPage() {
        const container = $('.page-container');
        const tabs = [
            {id:'manual', label:'Input Manual'},
            {id:'harian', label:'Absensi Harian'}
        ];

        container.innerHTML = `
            ${isViewer() ? '' : `<div class="attendance-header">
                 <button class="btn" data-action="manage-master" data-type="workers">
                    <span class="material-symbols-outlined">engineering</span>
                    Pekerja
                </button>
                 <button class="btn" data-action="manage-master" data-type="professions">
                    <span class="material-symbols-outlined">badge</span>
                    Profesi
                </button>
            </div>`}
            <div class="sub-nav">
                ${tabs.map((tab, index) => `<button class="sub-nav-item ${index === 0 ? 'active' : ''}" data-tab="${tab.id}">${tab.label}</button>`).join('')}
            </div>
            <div id="sub-page-content"></div>
        `;
    
        const renderTabContent = async (tabId) => {
            appState.activeSubPage.set('absensi', tabId);
            const contentContainer = $('#sub-page-content');
            contentContainer.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';
            
            await Promise.all([
                fetchAndCacheData('workers', workersCol, 'workerName'),
                fetchAndCacheData('professions', collection(db, 'teams', TEAM_ID, 'professions'), 'professionName'),
                fetchAndCacheData('projects', projectsCol, 'projectName')
            ]);
    
            if(tabId === 'harian') {
                await _fetchTodaysAttendance();
                contentContainer.innerHTML = _getDailyAttendanceHTML();
                _initCustomSelects(contentContainer);
                contentContainer.querySelector('#attendance-profession-filter')?.addEventListener('change', () => _rerenderAttendanceList());
                contentContainer.querySelector('#attendance-project-id')?.addEventListener('change', () => _rerenderAttendanceList());
    
            } else if (tabId === 'manual') {
                contentContainer.innerHTML = _getManualAttendanceHTML();
                _initCustomSelects(contentContainer); 
                const dateInput = $('#manual-attendance-date');
                const projectInput = $('#manual-attendance-project');
                
                dateInput.addEventListener('change', () => _renderManualAttendanceList(dateInput.value, projectInput.value));
                projectInput.addEventListener('change', () => _renderManualAttendanceList(dateInput.value, projectInput.value));
                if(!isViewer()) $('#manual-attendance-form').addEventListener('submit', handleSaveManualAttendance);
                
                _renderManualAttendanceList(dateInput.value, projectInput.value);
            }
        };
    
        $$('.sub-nav-item').forEach(btn => btn.addEventListener('click', (e) => {
            $$('.sub-nav-item').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            renderTabContent(e.currentTarget.dataset.tab);
        }));
    
        const lastSubPage = appState.activeSubPage.get('absensi') || tabs[0].id;
        $(`.sub-nav-item[data-tab="${lastSubPage}"]`)?.classList.add('active');
        await renderTabContent(lastSubPage);
    }

    function _getDailyAttendanceHTML() {
        const today = new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const projectOptions = appState.projects.map(p => ({value: p.id, text: p.projectName}));
        const professionOptions = [{value: 'all', text: 'Semua Profesi'}, ...appState.professions.map(p => ({value: p.id, text: p.professionName}))];

        let content = (appState.workers.length === 0)
            ? `<p class="empty-state">Belum ada data pekerja.</p>`
            : `<div class="attendance-grid" id="attendance-grid-container">${_renderAttendanceGrid()}</div>`;

        return `
            <h4 class="page-title-date">${today}</h4>
            <div class="attendance-controls card card-pad">
                ${createMasterDataSelect('attendance-project-id', 'Proyek Hari Ini', projectOptions, appState.projects[0]?.id || '')}
                ${createMasterDataSelect('attendance-profession-filter', 'Filter Profesi', professionOptions, 'all')}
            </div>
            ${content}
        `;
    }
    
    function _rerenderAttendanceList() {
        $('#attendance-grid-container').innerHTML = _renderAttendanceGrid();
    }

    function _renderAttendanceGrid() {
        const professionFilter = $('#attendance-profession-filter')?.value;
        const projectId = $('#attendance-project-id')?.value;
        const activeWorkers = appState.workers.filter(w => w.status === 'active');

        const filteredWorkers = (professionFilter === 'all') 
            ? activeWorkers
            : activeWorkers.filter(w => w.professionId === professionFilter);

        if (filteredWorkers.length === 0) {
            return `<p class="empty-state-small" style="grid-column: 1 / -1;">Tidak ada pekerja yang cocok.</p>`;
        }

        return filteredWorkers.map(worker => {
            const attendance = appState.attendance.get(worker.id);
            const profession = appState.professions.find(p => p.id === worker.professionId)?.professionName || 'Tanpa Profesi';
            const dailyWage = worker.projectWages?.[projectId] || 0;
            let statusHTML = '';
            const wageHTML = `<span class="worker-wage">${fmtIDR(dailyWage)} / hari</span>`;

            if (attendance) {
                const checkInTime = attendance.checkIn.toDate().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
                const earnedPayHTML = attendance.totalPay ? `<strong> (${fmtIDR(attendance.totalPay)})</strong>` : '';

                if (attendance.status === 'checked_in') {
                    statusHTML = `
                        <div class="attendance-status checked-in">Masuk: ${checkInTime}</div>
                        ${isViewer() ? '' : `<button class="btn btn-danger" data-action="check-out" data-id="${attendance.id}">Check Out</button>`}
                    `;
                } else { // completed
                    const checkOutTime = attendance.checkOut.toDate().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
                    statusHTML = `
                        <div class="attendance-status">Masuk: ${checkInTime} | Keluar: ${checkOutTime}</div>
                        <div class="attendance-status completed">Total: ${attendance.workHours.toFixed(1)} jam ${earnedPayHTML}</div>
                        ${isViewer() ? '' : `<button class="btn-icon" data-action="edit-attendance" data-id="${attendance.id}" title="Edit Waktu"><span class="material-symbols-outlined">edit_calendar</span></button>`}
                    `;
                }
            } else {
                statusHTML = isViewer() ? '<div class="attendance-status">Belum Hadir</div>' : `<button class="btn btn-success" data-action="check-in" data-id="${worker.id}">Check In</button>`;
            }
            
            return `
                <div class="card attendance-card">
                    <div class="attendance-worker-info">
                        <strong>${worker.workerName}</strong>
                        <span>${profession}</span>
                        ${wageHTML}
                    </div>
                    <div class="attendance-actions">${statusHTML}</div>
                </div>`;
        }).join('');
    }

    async function _fetchTodaysAttendance() {
        appState.attendance.clear();
        const today = new Date();
        const startOfDay = new Date(today.setHours(0, 0, 0, 0));
        const endOfDay = new Date(today.setHours(23, 59, 59, 999));
        
        const q = query(attendanceRecordsCol, 
            where('date', '>=', startOfDay),
            where('date', '<=', endOfDay)
        );
        const snap = await getDocs(q);
        snap.forEach(doc => {
            const data = doc.data();
            appState.attendance.set(data.workerId, { id: doc.id, ...data });
        });
    }

    async function handleCheckIn(workerId) {
        const projectId = $('#attendance-project-id')?.value;
        if(!projectId) {
            toast('error', 'Silakan pilih proyek terlebih dahulu.');
            return;
        }

        toast('syncing', 'Mencatat jam masuk...');
        try {
            const worker = appState.workers.find(w => w.id === workerId);
            if (!worker) throw new Error('Pekerja tidak ditemukan');
            
            const dailyWage = worker.projectWages?.[projectId] || 0;
            const hourlyWage = dailyWage / 8;

            await addDoc(attendanceRecordsCol, {
                workerId, projectId, workerName: worker.workerName, hourlyWage,
                date: Timestamp.now(), checkIn: Timestamp.now(), status: 'checked_in',
                type: 'timestamp', createdAt: serverTimestamp()
            });
            await _logActivity(`Check-in Pekerja: ${worker.workerName}`, { workerId, projectId });
            toast('success', `${worker.workerName} berhasil check in.`);
            _fetchTodaysAttendance().then(() => _rerenderAttendanceList());
        } catch (error) {
            toast('error', 'Gagal melakukan check in.');
            console.error(error);
        }
    }

    async function handleCheckOut(recordId) {
        toast('syncing', 'Mencatat jam keluar...');
        try {
            const recordRef = doc(attendanceRecordsCol, recordId);
            const recordSnap = await getDoc(recordRef);
            if (!recordSnap.exists()) throw new Error('Data absensi tidak ditemukan');

            const record = recordSnap.data();
            const checkOutTime = Timestamp.now();
            const checkInTime = record.checkIn;
            
            const hours = (checkOutTime.seconds - checkInTime.seconds) / 3600;
            const normalHours = Math.min(hours, 8);
            const overtimeHours = Math.max(0, hours - 8);
            
            const hourlyWage = record.hourlyWage || 0;
            const normalPay = normalHours * hourlyWage;
            const overtimePay = overtimeHours * hourlyWage * 1.5;
            const totalPay = normalPay + overtimePay;

            await updateDoc(recordRef, {
                checkOut: checkOutTime, status: 'completed',
                workHours: hours, normalHours, overtimeHours, totalPay, isPaid: false
            });
            await _logActivity(`Check-out Pekerja: ${record.workerName}`, { recordId, totalPay });
            toast('success', `${record.workerName} berhasil check out.`);
            _fetchTodaysAttendance().then(() => _rerenderAttendanceList());
        } catch (error) {
            toast('error', 'Gagal melakukan check out.');
            console.error(error);
        }
    }
    
    function _getManualAttendanceHTML() {
        const today = new Date().toISOString().slice(0,10);
        const projectOptions = appState.projects.map(p => ({value: p.id, text: p.projectName}));

        return `
            <form id="manual-attendance-form">
                <div class="card card-pad">
                    <div class="recap-filters">
                        <div class="form-group">
                            <label for="manual-attendance-date">Tanggal</label>
                            <input type="date" id="manual-attendance-date" value="${today}" required ${isViewer() ? 'disabled' : ''}>
                        </div>
                        ${createMasterDataSelect('manual-attendance-project', 'Proyek', projectOptions, appState.projects[0]?.id || '')}
                    </div>
                </div>
                <div id="manual-attendance-list-container" style="margin-top: 1.5rem;"></div>
                ${isViewer() ? '' : `<div class="form-footer-actions">
                    <button type="submit" class="btn btn-primary">Simpan Absensi</button>
                </div>`}
            </form>
        `;
    }

    async function _renderManualAttendanceList(dateStr, projectId) {
        const container = $('#manual-attendance-list-container');
        if (!dateStr || !projectId) {
            container.innerHTML = `<p class="empty-state-small">Pilih tanggal dan proyek untuk memulai.</p>`;
            return;
        }
        container.innerHTML = `<div class="loader-container"><div class="spinner"></div></div>`;

        const date = new Date(dateStr);
        const startOfDay = new Date(date.setHours(0,0,0,0));
        const endOfDay = new Date(date.setHours(23,59,59,999));

        const q = query(attendanceRecordsCol, 
            where('projectId', '==', projectId),
            where('date', '>=', startOfDay),
            where('date', '<=', endOfDay),
            where('type', '==', 'manual')
        );
        const snap = await getDocs(q);
        const existingRecords = new Map(snap.docs.map(d => [d.data().workerId, d.data()]));
        
        const activeWorkers = appState.workers.filter(w => w.status === 'active');

        if(activeWorkers.length === 0) {
            container.innerHTML = `<p class="empty-state">Tidak ada pekerja aktif.</p>`;
            return;
        }

        const listHTML = activeWorkers.map(worker => {
            const dailyWage = worker.projectWages?.[projectId] || 0;
            const existing = existingRecords.get(worker.id);
            const currentStatus = existing?.attendanceStatus || 'absent';
            let currentPay = 0;
            if(currentStatus === 'full_day') currentPay = dailyWage;
            else if(currentStatus === 'half_day') currentPay = dailyWage / 2;
            
            return `
                <div class="manual-attendance-item card" data-daily-wage="${dailyWage}">
                    <div class="worker-info">
                        <strong>${worker.workerName}</strong>
                        <span class="worker-wage" data-pay="${currentPay}">${fmtIDR(currentPay)}</span>
                    </div>
                    <div class="attendance-status-selector" data-worker-id="${worker.id}">
                        <label>
                            <input type="radio" name="status_${worker.id}" value="full_day" ${currentStatus === 'full_day' ? 'checked' : ''} ${isViewer() ? 'disabled' : ''}>
                            <span>Hadir</span>
                        </label>
                        <label>
                            <input type="radio" name="status_${worker.id}" value="half_day" ${currentStatus === 'half_day' ? 'checked' : ''} ${isViewer() ? 'disabled' : ''}>
                            <span>1/2 Hari</span>
                        </label>
                        <label>
                            <input type="radio" name="status_${worker.id}" value="absent" ${currentStatus === 'absent' ? 'checked' : ''} ${isViewer() ? 'disabled' : ''}>
                            <span>Absen</span>
                        </label>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = listHTML;

        if(!isViewer()) {
            container.querySelectorAll('.attendance-status-selector input[type="radio"]').forEach(radio => {
                radio.addEventListener('change', (e) => {
                    const card = e.target.closest('.manual-attendance-item');
                    const wageEl = card.querySelector('.worker-wage');
                    const dailyWage = Number(card.dataset.dailyWage);
                    let newPay = 0;
                    if(e.target.value === 'full_day') newPay = dailyWage;
                    else if (e.target.value === 'half_day') newPay = dailyWage / 2;
                    
                    wageEl.textContent = fmtIDR(newPay);
                    wageEl.dataset.pay = newPay;
                });
            });
        }
    }

    async function handleSaveManualAttendance(e) {
        e.preventDefault();
        const form = e.target;
        const date = new Date(form.querySelector('#manual-attendance-date').value);
        const projectId = form.querySelector('#manual-attendance-project').value;

        if (!projectId) {
            toast('error', 'Proyek harus dipilih.'); return;
        }

        toast('syncing', 'Menyimpan absensi...');
        try {
            const batch = writeBatch(db);
            const workers = $$('.attendance-status-selector', form);

            for(const workerEl of workers) {
                const workerId = workerEl.dataset.workerId;
                const statusInput = workerEl.querySelector('input:checked');
                if (!statusInput) continue;
                
                const status = statusInput.value;
                const worker = appState.workers.find(w => w.id === workerId);
                const dailyWage = worker?.projectWages?.[projectId] || 0;
                const pay = Number(workerEl.closest('.manual-attendance-item').querySelector('.worker-wage').dataset.pay);

                const recordData = {
                    workerId, workerName: worker.workerName, projectId,
                    date: Timestamp.fromDate(date), attendanceStatus: status, totalPay: pay,
                    dailyWage, isPaid: false, type: 'manual', createdAt: serverTimestamp(),
                    status: 'completed',
                };

                const startOfDay = new Date(date); startOfDay.setHours(0,0,0,0);
                const endOfDay = new Date(date); endOfDay.setHours(23,59,59,999);

                const q = query(attendanceRecordsCol, 
                    where('workerId', '==', workerId), where('projectId', '==', projectId),
                    where('date', '>=', startOfDay), where('date', '<=', endOfDay),
                    where('type', '==', 'manual')
                );
                
                const snap = await getDocs(q);
                if (snap.empty) {
                    if (status !== 'absent') batch.set(doc(attendanceRecordsCol), recordData);
                } else {
                    if (status === 'absent') batch.delete(snap.docs[0].ref);
                    else batch.update(snap.docs[0].ref, recordData);
                }
            }

            await batch.commit();
            await _logActivity(`Menyimpan Absensi Manual`, { date: date.toISOString().slice(0,10), projectId });
            toast('success', 'Absensi berhasil disimpan.');
        } catch (error) {
            toast('error', 'Gagal menyimpan absensi.');
            console.error(error);
        }
    }

    async function renderJurnalPage() {
        const container = $('.page-container');
        const mainTabs = [
            {id:'jurnal_absensi', label:'Jurnal Absensi'},
            {id:'rekap_gaji', label:'Rekap Gaji'}
        ];

        container.innerHTML = `
            <div class="sub-nav">
                ${mainTabs.map((tab, index) => `<button class="sub-nav-item ${index === 0 ? 'active' : ''}" data-tab="${tab.id}">${tab.label}</button>`).join('')}
            </div>
            <div id="sub-page-content"></div>
        `;

        const renderMainTabContent = async (mainTabId) => {
            appState.activeSubPage.set('jurnal', mainTabId);
            const contentContainer = $('#sub-page-content');
            contentContainer.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';

            if (mainTabId === 'jurnal_absensi') {
                _renderJurnalAbsensiTabs(contentContainer);
            } else if (mainTabId === 'rekap_gaji') {
                _renderRekapGajiTabs(contentContainer);
            }
        };

        $$('.sub-nav-item').forEach(btn => btn.addEventListener('click', (e) => {
            $$('.sub-nav-item').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            renderMainTabContent(e.currentTarget.dataset.tab);
        }));

        const lastMainTab = appState.activeSubPage.get('jurnal') || mainTabs[0].id;
        $(`.sub-nav-item[data-tab="${lastMainTab}"]`)?.classList.add('active');
        await renderMainTabContent(lastMainTab);
    }

    function _renderJurnalAbsensiTabs(container) {
        const tabs = [
            { id: 'harian', label: 'Harian' },
            { id: 'per_pekerja', label: 'Per Pekerja' }
        ];
        container.innerHTML = `
            <div id="jurnal-absensi-sub-nav" class="category-sub-nav" style="margin-top: 1rem;">
                 ${tabs.map((tab, index) => `<button class="sub-nav-item ${index === 0 ? 'active' : ''}" data-tab="${tab.id}">${tab.label}</button>`).join('')}
            </div>
            <div id="jurnal-absensi-content"></div>
        `;

        const renderSubTab = async (tabId) => {
            const content = $('#jurnal-absensi-content');
            content.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';
            if (tabId === 'harian') await _renderJurnalHarianView(content);
            else if (tabId === 'per_pekerja') await _renderJurnalPerPekerjaView(content);
        };

        $('#jurnal-absensi-sub-nav').addEventListener('click', e => {
            const btn = e.target.closest('.sub-nav-item');
            if (btn) {
                $('#jurnal-absensi-sub-nav .active').classList.remove('active');
                btn.classList.add('active');
                renderSubTab(btn.dataset.tab);
            }
        });

        renderSubTab(tabs[0].id);
    }

    async function _renderJurnalHarianView(container) {
        await fetchAndCacheData('attendanceRecords', attendanceRecordsCol, 'date');
        const groupedByDay = _groupAttendanceByDay(appState.attendanceRecords);
        const sortedDays = Object.entries(groupedByDay).sort((a, b) => new Date(b[0]) - new Date(a[0]));

        if (sortedDays.length === 0) {
            container.innerHTML = '<p class="empty-state">Belum ada data absensi.</p>';
            return;
        }
        const listHTML = sortedDays.map(([date, data]) => {
            const dayDate = new Date(date);
            const formattedDate = dayDate.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
            return `
                <div class="card card-list-item" data-action="view-jurnal-harian" data-date="${date}">
                    <div class="card-list-item-content">
                        <div class="card-list-item-details">
                            <h5 class="card-list-item-title">${formattedDate}</h5>
                            <p class="card-list-item-subtitle">${data.workerCount} Pekerja Hadir</p>
                        </div>
                        <div class="card-list-item-amount-wrapper">
                            <strong class="card-list-item-amount negative">${fmtIDR(data.totalUpah)}</strong>
                            <p class="card-list-item-repayment-info">Total Beban Upah</p>
                        </div>
                    </div>
                </div>`;
        }).join('');
        container.innerHTML = `<div style="padding-bottom: 2rem;">${listHTML}</div>`;
    }

    function _groupAttendanceByDay(records) {
        return (records || []).reduce((acc, rec) => {
            const dateStr = rec.date.toDate().toISOString().slice(0, 10);
            if (!acc[dateStr]) {
                acc[dateStr] = { records: [], totalUpah: 0, workerCount: 0 };
            }
            acc[dateStr].records.push(rec);
            acc[dateStr].totalUpah += (rec.totalPay || 0);
            if ((rec.totalPay || 0) > 0) acc[dateStr].workerCount++;
            return acc;
        }, {});
    }

    async function _renderJurnalPerPekerjaView(container) {
        await Promise.all([
            fetchAndCacheData('workers', workersCol, 'workerName'),
            fetchAndCacheData('professions', collection(db, 'teams', TEAM_ID, 'professions'), 'professionName')
        ]);
        const activeWorkers = appState.workers.filter(w => w.status === 'active');

        if (activeWorkers.length === 0) {
            container.innerHTML = '<p class="empty-state">Belum ada data pekerja aktif.</p>';
            return;
        }

        const listHTML = activeWorkers.map(worker => {
            const profession = appState.professions.find(p => p.id === worker.professionId)?.professionName || 'Tanpa Profesi';
            return `
                 <div class="card card-list-item" data-action="view-worker-recap" data-worker-id="${worker.id}">
                    <div class="card-list-item-content">
                        <div class="card-list-item-details">
                            <h5 class="card-list-item-title">${worker.workerName}</h5>
                            <p class="card-list-item-subtitle">${profession}</p>
                        </div>
                         <div class="card-list-item-amount-wrapper">
                             <span class="material-symbols-outlined" style="font-size: 2rem; color: var(--text-muted);">chevron_right</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        container.innerHTML = `<div style="padding-bottom: 2rem;">${listHTML}</div>`;
    }
    
    async function _renderRekapGajiTabs(container) {
        const tabs = [
            { id: 'buat_rekap', label: 'Buat Rekap Baru' },
            { id: 'riwayat_rekap', label: 'Riwayat Rekap' }
        ];
        container.innerHTML = `
            <div id="rekap-gaji-sub-nav" class="category-sub-nav" style="margin-top: 1rem;">
                 ${tabs.map((tab, index) => `<button class="sub-nav-item ${index === 0 ? 'active' : ''}" data-tab="${tab.id}">${tab.label}</button>`).join('')}
            </div>
            <div id="rekap-gaji-content"></div>
        `;
        
        const renderSubTab = async (tabId) => {
            const content = $('#rekap-gaji-content');
            content.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';
            if (tabId === 'buat_rekap') {
                content.innerHTML = _getSalaryRecapHTML();
                if(!isViewer()) {
                    $('#generate-recap-btn')?.addEventListener('click', () => {
                        const startDate = $('#recap-start-date').value;
                        const endDate = $('#recap-end-date').value;
                        if (startDate && endDate) generateSalaryRecap(new Date(startDate), new Date(endDate));
                        else toast('error', 'Silakan pilih rentang tanggal.');
                    });
                } else {
                     generateSalaryRecap(new Date(new Date().getFullYear(), new Date().getMonth(), 1), new Date());
                }
            } else if (tabId === 'riwayat_rekap') {
                await _renderRiwayatRekapView(content);
            }
        };

        $('#rekap-gaji-sub-nav').addEventListener('click', e => {
            const btn = e.target.closest('.sub-nav-item');
            if (btn) {
                $('#rekap-gaji-sub-nav .active').classList.remove('active');
                btn.classList.add('active');
                renderSubTab(btn.dataset.tab);
            }
        });
        await renderSubTab(tabs[0].id);
    }
    
    function _getSalaryRecapHTML() {
        const today = new Date();
        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
        const todayStr = today.toISOString().slice(0, 10);
    
        return `
            <div class="card card-pad">
                <h5 class="section-title-owner" style="margin-top:0;">Pilih Periode Rekap</h5>
                <div class="recap-filters">
                    <div class="form-group"><label>Tanggal Mulai</label><input type="date" id="recap-start-date" value="${firstDayOfMonth}" ${isViewer() ? 'disabled' : ''}></div>
                    <div class="form-group"><label>Tanggal Selesai</label><input type="date" id="recap-end-date" value="${todayStr}" ${isViewer() ? 'disabled' : ''}></div>
                    ${isViewer() ? '' : `
                        <button id="generate-recap-btn" class="btn btn-primary">Tampilkan Rekap</button>
                        <button id="fix-stuck-data-btn" class="btn btn-danger" data-action="fix-stuck-attendance">
                            <span class="material-symbols-outlined">build_circle</span> Perbaiki Data
                        </button>
                    `}
                </div>
            </div>
            <div id="recap-results-container" style="margin-top: 1.5rem;">
                 <p class="empty-state-small">Pilih rentang tanggal dan klik "Tampilkan Rekap" untuk melihat hasilnya.</p>
            </div>
        `;
    }

    async function generateSalaryRecap(startDate, endDate) {
        const resultsContainer = $('#recap-results-container');
        if (!resultsContainer) return;
        resultsContainer.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';
        
        endDate.setHours(23, 59, 59, 999);
    
        const q = query(attendanceRecordsCol, 
            where('status', '==', 'completed'),
            where('isPaid', '==', false),
            where('date', '>=', startDate),
            where('date', '<=', endDate)
        );
        const snap = await getDocs(q);
    
        if (snap.empty) {
            resultsContainer.innerHTML = `<p class="empty-state">Tidak ada data gaji yang belum dibayar pada periode ini.</p>`;
            return;
        }
    
        const salaryRecap = new Map();
        snap.forEach(doc => {
            const record = { id: doc.id, ...doc.data() };
            const workerId = record.workerId;
    
            if (!salaryRecap.has(workerId)) {
                salaryRecap.set(workerId, { workerName: record.workerName, totalPay: 0, recordIds: [] });
            }
    
            const workerData = salaryRecap.get(workerId);
            workerData.totalPay += record.totalPay || 0;
            workerData.recordIds.push(record.id);
        });
    
        let tableHTML = `
            <div class="card card-pad">
                <div class="recap-table-wrapper">
                    <table class="recap-table">
                        <thead><tr><th>Nama Pekerja</th><th>Total Upah</th>${isViewer() ? '' : '<th>Aksi</th>'}</tr></thead>
                        <tbody>
                            ${[...salaryRecap.entries()].map(([workerId, worker]) => `
                                <tr>
                                    <td>${worker.workerName}</td>
                                    <td><strong>${fmtIDR(worker.totalPay)}</strong></td>
                                    ${isViewer() ? '' : `<td class="recap-actions-cell">
                                        <button class="btn-icon" title="Buat Tagihan" data-action="generate-salary-bill" data-worker-id="${workerId}" data-worker-name="${worker.workerName}" data-total-pay="${worker.totalPay}" data-start-date="${startDate.toISOString().slice(0, 10)}" data-end-date="${endDate.toISOString().slice(0, 10)}" data-record-ids="${worker.recordIds.join(',')}"><span class="material-symbols-outlined">request_quote</span></button>
                                        <button class="btn-icon btn-icon-danger" title="Hapus Rekap" data-action="delete-recap-item" data-record-ids="${worker.recordIds.join(',')}"><span class="material-symbols-outlined">delete</span></button>
                                    </td>`}
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        resultsContainer.innerHTML = tableHTML;
    }

    async function _renderRiwayatRekapView(container) {
        await fetchAndCacheData('bills', billsCol);
        const salaryBills = appState.bills.filter(b => b.type === 'gaji').sort((a, b) => b.createdAt.seconds - a.createdAt.seconds);

        if (salaryBills.length === 0) {
            container.innerHTML = '<p class="empty-state">Belum ada riwayat rekap gaji yang dibuat.</p>';
            return;
        }

        const listHTML = salaryBills.map(bill => {
            const date = bill.createdAt.toDate().toLocaleDateString('id-ID', {day:'numeric', month:'long', year:'numeric'});
            const statusClass = bill.status === 'paid' ? 'positive' : 'negative';
            const statusText = bill.status === 'paid' ? 'Lunas' : 'Belum Lunas';

            return `
                 <div class="card card-list-item">
                    <div class="card-list-item-content">
                        <div class="card-list-item-details">
                            <h5 class="card-list-item-title">${bill.description}</h5>
                            <p class="card-list-item-subtitle">Dibuat pada: ${date}</p>
                        </div>
                        <div class="card-list-item-amount-wrapper">
                            <strong class="card-list-item-amount">${fmtIDR(bill.amount)}</strong>
                             <span class="status-badge ${statusClass}" style="margin-top: 0.25rem;">${statusText}</span>
                        </div>
                    </div>
                    ${isViewer() ? '' : `
                        <div class="card-list-item-actions">
                            <button class="btn-icon" data-action="cetak-kwitansi" data-id="${bill.id}" title="Cetak Kwitansi"><span class="material-symbols-outlined">receipt_long</span></button>
                            <button class="btn-icon" data-action="open-recap-actions" data-id="${bill.id}" title="Aksi Lainnya"><span class="material-symbols-outlined">more_vert</span></button>
                        </div>
                        `}
                </div>
            `;
        }).join('');
        container.innerHTML = `<div style="padding-bottom: 2rem;">${listHTML}</div>`;
    }

        async function handleDeleteSalaryBill(billId) {
            createModal('confirmDelete', {
                message: 'Membatalkan rekap akan menghapus tagihan ini dan mengembalikan status absensi terkait menjadi "belum dibayar". Anda bisa membuat rekap baru setelahnya. Lanjutkan?',
                onConfirm: async () => {
                    toast('syncing', 'Membatalkan rekap...');
                    try {
                        const billRef = doc(billsCol, billId);
                        const billSnap = await getDoc(billRef);
                        if (!billSnap.exists()) throw new Error('Tagihan tidak ditemukan');
                        
                        const recordIds = billSnap.data().recordIds || [];
    
                        const batch = writeBatch(db);
                        // Reset status absensi
                        recordIds.forEach(id => {
                            batch.update(doc(attendanceRecordsCol, id), { isPaid: false, billId: null });
                        });
                        // Hapus tagihan
                        batch.delete(billRef);
    
                        await batch.commit();
                        await _logActivity(`Membatalkan Rekap Gaji`, { billId });
                        toast('success', 'Rekap gaji berhasil dibatalkan.');
                        
                        // Muat ulang data dan render ulang halaman
                        await fetchAndCacheData('bills', billsCol);
                        renderJurnalPage();
    
                    } catch (error) {
                        toast('error', 'Gagal membatalkan rekap.');
                        console.error('Error deleting salary bill:', error);
                    }
                }
            });
        }
    
    
    async function handleFixStuckAttendanceModal() {
        await fetchAndCacheData('workers', workersCol, 'workerName');
        const workerOptions = [{ value: 'all', text: '— Semua Pekerja —' }, ...appState.workers.filter(w => w.status === 'active').map(w => ({ value: w.id, text: w.workerName }))];

        const content = `
            <form id="fix-attendance-form">
                <p class="confirm-modal-text">Fitur ini akan secara paksa mereset status absensi yang 'lunas' tanpa tagihan menjadi 'belum lunas'.</p>
                ${createMasterDataSelect('fix-worker-id', 'Pilih Pekerja (atau Semua)', workerOptions, 'all')}
                <div class="recap-filters" style="padding:0; margin-top: 1rem;">
                    <div class="form-group"><label>Dari Tanggal</label><input type="date" name="startDate" required></div>
                    <div class="form-group"><label>Sampai Tanggal</label><input type="date" name="endDate" required></div>
                </div>
                <div class="modal-footer" style="margin-top: 1.5rem;"><button type="button" class="btn btn-secondary" data-close-modal>Batal</button><button type="submit" class="btn btn-danger">Jalankan Perbaikan</button></div>
            </form>
        `;
        createModal('dataDetail', { title: 'Perbaiki Data Absensi', content });
        _initCustomSelects($('#dataDetail-modal'));

        $('#fix-attendance-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const workerId = e.target.elements['fix-worker-id'].value;
            let msg = 'Anda yakin ingin mereset status absensi untuk pekerja dan periode ini?';
            if (workerId === 'all') {
                msg = 'PERINGATAN: Anda akan mereset status LUNAS menjadi BELUM LUNAS untuk SEMUA pekerja pada periode ini. Lanjutkan hanya jika Anda yakin.';
            }
            createModal('confirmUserAction', { message: msg, onConfirm: () => _forceResetAttendanceStatus(e.target) });
        });
    }
    
    async function _forceResetAttendanceStatus(form) {
        const workerId = form.elements['fix-worker-id'].value;
        const startDateStr = form.elements.startDate.value;
        const endDateStr = form.elements.endDate.value;

        if (!workerId || !startDateStr || !endDateStr) {
            toast('error', 'Harap lengkapi semua field.'); return;
        }

        toast('syncing', `Memperbaiki data absensi...`);

        const startDate = new Date(startDateStr);
        const endDate = new Date(endDateStr);
        endDate.setHours(23, 59, 59, 999);

        let queryConstraints = [where('isPaid', '==', true), where('date', '>=', startDate), where('date', '<=', endDate)];
        if (workerId !== 'all') {
            queryConstraints.push(where('workerId', '==', workerId));
        }

        const q = query(attendanceRecordsCol, ...queryConstraints);

        try {
            const attendanceSnap = await getDocs(q);
            if (attendanceSnap.empty) {
                toast('info', 'Tidak ditemukan data berstatus lunas untuk diperbaiki.'); return;
            }

            const batch = writeBatch(db);
            attendanceSnap.docs.forEach(doc => {
                batch.update(doc.ref, { isPaid: false, billId: null });
            });

            await batch.commit();
            toast('success', `${attendanceSnap.size} data absensi berhasil direset!`);
            closeModal($('#dataDetail-modal'));
            closeModal($('#confirmUserAction-modal'));
        } catch (error) {
            toast('error', 'Gagal memperbaiki data.');
            console.error('Gagal force reset data:', error);
        }
    }

    // --- SUB-SEKSI 3.5: TAGIHAN & SIMULASI ---
    async function renderTagihanPage() {
        const container = $('.page-container');
        const tabs = [{ id: 'unpaid', label: 'Belum Lunas' }, { id: 'paid', label: 'Lunas' }];
        
        container.innerHTML = `
            <div class="toolbar" id="tagihan-toolbar">
                <div class="search">
                    <span class="material-symbols-outlined">search</span>
                    <input type="search" id="tagihan-search-input" placeholder="Cari tagihan, proyek, supplier..." value="${appState.billsFilter.searchTerm}">
                </div>
                <button class="icon-btn" id="tagihan-filter-btn" title="Filter"><span class="material-symbols-outlined">filter_list</span></button>
                <button class="icon-btn" id="tagihan-sort-btn" title="Urutkan"><span class="material-symbols-outlined">sort</span></button>
            </div>
            <div class="sub-nav">
                ${tabs.map((tab, index) => `<button class="sub-nav-item ${index === 0 ? 'active' : ''}" data-tab="${tab.id}">${tab.label}</button>`).join('')}
            </div>
            <div id="category-sub-nav-container" class="category-sub-nav"></div>
            <div id="tagihan-summary-card" class="card card-pad summary-card" style="display: none;"></div>
            <div id="sub-page-content"><div class="loader-container"><div class="spinner"></div></div></div>
        `;        
    
        await Promise.all([
            fetchAndCacheData('projects', projectsCol, 'projectName'),
            fetchAndCacheData('expenses', expensesCol),
            fetchAndCacheData('suppliers', suppliersCol, 'supplierName'),
            fetchAndCacheData('workers', workersCol, 'workerName')
        ]);
    
        let currentCombinedList = []; 
    
        const applyFilterAndSort = () => {
            let filtered = [...currentCombinedList];
            if (appState.billsFilter.category !== 'all') {
                filtered = filtered.filter(item => item.type === appState.billsFilter.category);
            }
            if (appState.billsFilter.searchTerm) {
                const term = appState.billsFilter.searchTerm.toLowerCase();
                filtered = filtered.filter(item => {
                    const descriptionMatch = item.description.toLowerCase().includes(term);
                    const project = appState.projects.find(p => p.id === item.projectId);
                    const projectMatch = project && project.projectName.toLowerCase().includes(term);
                    let relatedNameMatch = false;
                    if (item.type === 'gaji') {
                        const worker = appState.workers.find(w => w.id === item.workerId);
                        relatedNameMatch = worker && worker.workerName.toLowerCase().includes(term);
                    } else if (item.expenseId) {
                        const expense = appState.expenses.find(e => e.id === item.expenseId);
                        if (expense && expense.supplierId) {
                            const supplier = appState.suppliers.find(s => s.id === expense.supplierId);
                            relatedNameMatch = supplier && supplier.supplierName.toLowerCase().includes(term);
                        }
                    }
                    return descriptionMatch || projectMatch || relatedNameMatch;
                });
            }

            if (appState.billsFilter.projectId !== 'all') {
                filtered = filtered.filter(item => item.projectId === appState.billsFilter.projectId);
            }
            if (appState.billsFilter.supplierId !== 'all') {
                filtered = filtered.filter(item => {
                    const expense = appState.expenses.find(e => e.id === item.expenseId);
                    return expense && expense.supplierId === appState.billsFilter.supplierId;
                });
            }
    
            filtered.sort((a, b) => {
                let valA = (appState.billsFilter.sortBy === 'amount') ? a.amount : a.dueDate?.seconds || 0;
                let valB = (appState.billsFilter.sortBy === 'amount') ? b.amount : b.dueDate?.seconds || 0;
                return appState.billsFilter.sortDirection === 'asc' ? valA - valB : valB - valA;
            });
            
            const summaryCard = $('#tagihan-summary-card');
            if (summaryCard) {
                const isFiltered = appState.billsFilter.projectId !== 'all' || appState.billsFilter.supplierId !== 'all';
                if (isFiltered && filtered.length > 0) {
                    const totalAmount = filtered.reduce((sum, item) => sum + item.amount, 0);
                    const totalPaid = filtered.reduce((sum, item) => sum + (item.paidAmount || 0), 0);
                    const remainingAmount = totalAmount - totalPaid;
                    let filterName = '';
                    if (appState.billsFilter.projectId !== 'all') {
                        filterName = appState.projects.find(p => p.id === appState.billsFilter.projectId)?.projectName || '';
                    } else if (appState.billsFilter.supplierId !== 'all') {
                        filterName = appState.suppliers.find(s => s.id === appState.billsFilter.supplierId)?.supplierName || '';
                    }
                    summaryCard.innerHTML = `
                        <h5 class="summary-title">Ringkasan untuk: ${filterName}</h5>
                        <div class="summary-grid">
                            <div><span class="label">Total Tagihan</span><strong>${fmtIDR(totalAmount)}</strong></div>
                            <div><span class="label">Sudah Dibayar</span><strong class="positive">${fmtIDR(totalPaid)}</strong></div>
                            <div><span class="label">Sisa Tagihan</span><strong class="negative">${fmtIDR(remainingAmount)}</strong></div>
                        </div>
                    `;
                    summaryCard.style.display = 'block';
                } else {
                    summaryCard.style.display = 'none';
                }
            }

            $('#sub-page-content').innerHTML = _getBillsListHTML(filtered);
        };

        const _renderCategorySubNavAndList = () => {
            const container = $('#category-sub-nav-container');
            const counts = {
                all: currentCombinedList.length,
                material: currentCombinedList.filter(b => b.type === 'material').length,
                operasional: currentCombinedList.filter(b => b.type === 'operasional').length,
                gaji: currentCombinedList.filter(b => b.type === 'gaji').length,
                lainnya: currentCombinedList.filter(b => b.type === 'lainnya').length
            };
        
            const categories = [
                { id: 'all', label: 'Semua' },
                { id: 'material', label: 'Material' },
                { id: 'operasional', label: 'Operasional' },
                { id: 'gaji', label: 'Gaji' },
                { id: 'lainnya', label: 'Lainnya' }
            ];
        
            container.innerHTML = categories
                .filter(cat => counts[cat.id] > 0)
                .map(cat => `<button class="sub-nav-item ${appState.billsFilter.category === cat.id ? 'active' : ''}" data-category="${cat.id}">${cat.label} (${counts[cat.id]})</button>`)
                .join('');
        
            container.querySelectorAll('.sub-nav-item').forEach(btn => {
                btn.addEventListener('click', () => {
                    appState.billsFilter.category = btn.dataset.category;
                    container.querySelector('.active')?.classList.remove('active');
                    btn.classList.add('active');
                    applyFilterAndSort();
                });
            });
        
            applyFilterAndSort();
        };
    
        const renderTabContent = async (tabId) => {
            appState.activeSubPage.set('tagihan', tabId);
            appState.billsFilter.category = 'all';
            const contentContainer = $('#sub-page-content');
            contentContainer.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';
            
            currentCombinedList = [];

            if (tabId === 'unpaid') {
                const billsQuery = query(billsCol, where("status", "==", "unpaid"));
                const billsSnap = await getDocs(billsQuery);
                const unpaidBills = billsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                currentCombinedList.push(...unpaidBills);

                const expensesQuery = query(expensesCol, where("status", "==", "delivery_order"));
                const expensesSnap = await getDocs(expensesQuery);
                const deliveryOrders = expensesSnap.docs.map(d => {
                    const data = d.data();
                    return {
                        id: `expense-${d.id}`, expenseId: d.id, description: data.description,
                        amount: 0, dueDate: data.date, status: 'delivery_order',
                        type: data.type, projectId: data.projectId, paidAmount: 0
                    };
                });
                currentCombinedList.push(...deliveryOrders);
            } else {
                const billsQuery = query(billsCol, where("status", "==", "paid"), orderBy("dueDate", "desc"));
                const billsSnap = await getDocs(billsQuery);
                currentCombinedList = billsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            }
            
            _renderCategorySubNavAndList();
        };

        $('#tagihan-search-input').addEventListener('input', (e) => {
            appState.billsFilter.searchTerm = e.target.value.toLowerCase();
            applyFilterAndSort();
        });
        $('#tagihan-filter-btn').addEventListener('click', () => _showBillsFilterModal(applyFilterAndSort));
        $('#tagihan-sort-btn').addEventListener('click', () => _showBillsSortModal(applyFilterAndSort));
    
        $$('.sub-nav').forEach(nav => {
            nav.addEventListener('click', e => {
                const btn = e.target.closest('.sub-nav-item');
                if (btn && !btn.closest('#category-sub-nav-container')) {
                    $$('.sub-nav-item', nav).forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    renderTabContent(btn.dataset.tab);
                }
            });
        });
        
        await renderTabContent(tabs[0].id);
    }
    
    async function handleOpenBillDetail(billId, expenseId) {
       let bill = null;
       if(billId) bill = appState.bills.find(b => b.id === billId);
       
       // [MODIFIKASI] Ambil data pembayaran jika ada tagihan
       let payments = [];
       if (bill) {
           const paymentsColRef = collection(db, 'teams', TEAM_ID, 'bills', billId, 'payments');
           const paymentsSnap = await getDocs(query(paymentsColRef, orderBy("date", "desc")));
           payments = paymentsSnap.docs.map(d => d.data());
       }
   
       let targetExpenseId = expenseId || bill?.expenseId;
   
       if(!targetExpenseId && bill?.type !== 'gaji') {
           toast('error', 'Data pengeluaran terkait tidak ditemukan.');
           return;
       }
   
       let content, title;
   
       if (bill && bill.type === 'gaji') {
           // [MODIFIKASI] Kirim data pembayaran ke fungsi pembuat HTML
           content = _createSalaryBillDetailContentHTML(bill, payments);
           title = `Detail Tagihan: ${bill.description}`;
       } else {
           const expenseDoc = await getDoc(doc(expensesCol, targetExpenseId));
           if(!expenseDoc.exists()){ toast('error', 'Data pengeluaran terkait tidak ditemukan.'); return; }
           const expenseData = {id: expenseDoc.id, ...expenseDoc.data()};
           // [MODIFIKASI] Kirim data pembayaran ke fungsi pembuat HTML
           content = await _createBillDetailContentHTML(bill, expenseData, payments);
           title = `Detail Pengeluaran: ${expenseData.description}`;
       }
       
       createModal('dataDetail', { title, content });
   }

       async function _createBillDetailContentHTML(bill, expenseData, payments) {
           const remainingAmount = bill ? (bill.amount || 0) - (bill.paidAmount || 0) : 0;
       
           let itemsButtonHTML = '';
           if (expenseData.type === 'material' && expenseData.items && expenseData.items.length > 0) {
               itemsButtonHTML = `
                   <div class="rekap-actions" style="grid-template-columns: 1fr; margin-top: 1rem;">
                       <button class="btn btn-secondary" data-action="view-invoice-items" data-id="${expenseData.id}">
                           <span class="material-symbols-outlined">list_alt</span>
                           Lihat Rincian Faktur
                       </button>
                   </div>
               `;
           }
       
           // [BARU] Logika untuk menampilkan detail proyek
           const project = appState.projects.find(p => p.id === expenseData.projectId);
           const projectDetailsHTML = project ? `
               <dl class="detail-list" style="margin-top: 1.5rem;">
                   <div class="category-title"><dt>Detail Proyek</dt><dd></dd></div>
                   <div><dt>Nama Proyek</dt><dd>${project.projectName}</dd></div>
                   ${project.budget > 0 ? `<div><dt>Anggaran</dt><dd>${fmtIDR(project.budget)}</dd></div>` : ''}
               </dl>
           ` : '';
           const paymentHistoryHTML = _createPaymentHistoryHTML(payments);    
           const createAttachmentItem = (url, label, field) => {
               if (!url) return ''; // Jangan render jika tidak ada URL
               return `
               <div class="attachment-item">
                   <img src="${url}" alt="${label}" class="attachment-thumbnail" data-action="view-attachment" data-src="${url}">
                   <span>${label}</span>
                   <div class="attachment-actions">
                       <button class="btn-icon" data-action="download-attachment" data-url="${url}" data-filename="${label.replace(/\s+/g,'_')}.jpg" title="Unduh"><span class="material-symbols-outlined">download</span></button>
                       ${isViewer() ? '' : `<button class="btn-icon" data-action="upload-attachment" data-id="${expenseData.id}" data-field="${field}" title="Ganti"><span class="material-symbols-outlined">edit</span></button>`}
                       ${isViewer() ? '' : `<button class="btn-icon btn-icon-danger" data-action="delete-attachment" data-id="${expenseData.id}" data-field="${field}" title="Hapus"><span class="material-symbols-outlined">delete</span></button>`}
                   </div>
               </div>`;
           }
           
           // Variabel uploadButtonsHTML dideklarasikan di sini
           let uploadButtonsHTML = '';
           
           let attachmentsHTML = '';
       
           // 1. Logika untuk Tipe Material
           if (expenseData.type === 'material') {
               const buttons = [];
               if (!isViewer()) {
                   if (!expenseData.invoiceUrl) {
                       buttons.push(`<button class="btn btn-secondary" data-action="upload-attachment" data-id="${expenseData.id}" data-field="invoiceUrl">Upload Faktur</button>`);
                   }
                   if (!expenseData.deliveryOrderUrl) {
                       buttons.push(`<button class="btn btn-secondary" data-action="upload-attachment" data-id="${expenseData.id}" data-field="deliveryOrderUrl">Upload Surat Jalan</button>`);
                   }
               }
               
               // [PERBAIKAN] Hapus 'let' di sini. Kita hanya menugaskan nilai baru.
               uploadButtonsHTML = buttons.length > 0 
                   ? `<div class="rekap-actions" style="grid-template-columns: repeat(${buttons.length}, 1fr); margin-top: 1rem;">${buttons.join('')}</div>`
                   : '';
       
               attachmentsHTML = `
                   <h5 class="detail-section-title">Lampiran</h5>
                   <div class="attachment-gallery">
                       ${createAttachmentItem(expenseData.invoiceUrl, 'Bukti Faktur', 'invoiceUrl')}
                       ${createAttachmentItem(expenseData.deliveryOrderUrl, 'Surat Jalan', 'deliveryOrderUrl')}
                   </div>
                   ${uploadButtonsHTML}
               `;
           
           // 2. Logika untuk Tipe Lainnya
           } else if (expenseData.attachmentUrl) {
               attachmentsHTML = `
                   <h5 class="detail-section-title">Lampiran</h5>
                   <div class="attachment-gallery">
                       ${createAttachmentItem(expenseData.attachmentUrl, 'Lampiran', 'attachmentUrl')}
                   </div>
               `;
           
           // 3. Logika jika lampiran belum ada
           } else if (!isViewer()) {
                attachmentsHTML = `
                   <h5 class="detail-section-title">Lampiran</h5>
                   <div class="rekap-actions" style="grid-template-columns: 1fr; margin-top: 1rem;">
                       <button class="btn btn-secondary" data-action="upload-attachment" data-id="${expenseData.id}" data-field="attachmentUrl">
                           Upload Lampiran
                       </button>
                   </div>
               `;
           }
               
           return `
           <div class="payment-summary">
               <div><span>Total Pengeluaran:</span><strong>${fmtIDR(expenseData.amount)}</strong></div>
               ${bill ? `
               <div><span>Sudah Dibayar:</span><strong>${fmtIDR(bill.paidAmount || 0)}</strong></div>
               <div class="remaining"><span>Sisa Tagihan:</span><strong>${fmtIDR(remainingAmount)}</strong></div>
               ` : `<div class="status"><span>Status:</span><strong style="color:var(--success)">Lunas</strong></div>`}
           </div>
           ${paymentHistoryHTML} ${projectDetailsHTML}
           ${itemsButtonHTML}
           ${attachmentsHTML}
       `;
   }
           
       function _injectExpenseThumbnails(expenses) {
           try {
               const mapById = new Map(expenses.map(e => [e.id, e]));
               $$('.card.card-list-item[data-type="expense"]').forEach(card => {
                   const id = card.getAttribute('data-id');
                   const item = mapById.get(id);
                   if (!item || item.type !== 'material') return;
                   const url = item.invoiceUrl || item.deliveryOrderUrl;
                   const content = $('.card-list-item-content', card);
                   const details = $('.card-list-item-details', card);
                   const amount = $('.card-list-item-amount-wrapper', card);
                   if (!content || !details || !amount) return;
                   if ($('.card-left', content)) return;
                   const left = document.createElement('div');
                   left.className = 'card-left';
                   if (url) {
                       const img = document.createElement('img');
                       img.className = 'expense-thumb';
                       img.alt = 'Lampiran';
                       img.src = url;
                       left.appendChild(img);
                   }
                   left.appendChild(details);
                   content.insertBefore(left, amount);
               });
           } catch (err) {
               console.warn('Failed to inject thumbnails', err);
           }
       }
   
       async function _prefetchExpenseThumbnails(expenses) {
           try {
               const urls = Array.from(new Set(expenses.flatMap(e => [e.invoiceUrl, e.deliveryOrderUrl].filter(Boolean))));
               if (urls.length === 0) return;
               await Promise.all(urls.map(u => fetch(u, { mode: 'no-cors', cache: 'force-cache' }).catch(() => {})));
           } catch (_) {}
       }
       
       async function handleDeleteAttachment(dataset) {
           const { id, field } = dataset;
           
           createModal('confirmDeleteAttachment', {
               onConfirm: async () => {
                   toast('syncing', 'Menghapus lampiran...');
                   try {
                       // Tidak perlu menghapus file dari Cloudinary untuk menjaga kesederhanaan
                       // Cukup hapus URL dari Firestore
                       await updateDoc(doc(expensesCol, id), { [field]: '' });
                       await _logActivity(`Menghapus Lampiran`, { expenseId: id, field });
                       
                       toast('success', 'Lampiran berhasil dihapus.');
                       closeModal($('#dataDetail-modal'));
                       handleOpenBillDetail(null, id);
                   } catch(error) {
                       toast('error', 'Gagal menghapus lampiran.');
                       console.error("Attachment deletion error:", error);
                   }
               }
           });
       }
   
       async function handleUploadAttachment(dataset) {
           const { id, field } = dataset;
       
           const content = `
               <p class="confirm-modal-text">Pilih sumber gambar untuk lampiran.</p>
               <input type="file" name="modalUploadCamera" accept="image/*" capture="environment" class="hidden-file-input">
               <input type="file" name="modalUploadGallery" accept="image/*" class="hidden-file-input">
               
               <div class="upload-buttons modal-upload-buttons">
                   <button type="button" class="btn btn-secondary" data-action="trigger-file-input" data-target="modalUploadCamera">
                       <span class="material-symbols-outlined">photo_camera</span> Kamera
                   </button>
                   <button type="button" class="btn btn-secondary" data-action="trigger-file-input" data-target="modalUploadGallery">
                       <span class="material-symbols-outlined">image</span> Galeri
                   </button>
               </div>
           `;
       
           createModal('dataDetail', { title: 'Pilih Sumber Gambar', content });
       
           const modal = $('#dataDetail-modal');
           if (modal) {
               modal.querySelectorAll('.hidden-file-input').forEach(input => {
                   input.addEventListener('change', (e) => {
                       const file = e.target.files[0];
                       if (file) {
                           closeModal(modal);
                           _processAndUploadFile(file, id, field);
                       }
                   }, { once: true });
               });
           }
       }
   
       async function _processAndUploadFile(file, expenseId, field) {
           if (!file || !expenseId || !field) return;
       
           // Gunakan kembali logika upload yang sudah ada
           const downloadURL = await _uploadFileToCloudinary(file);
           
           if (downloadURL) {
               try {
                   await updateDoc(doc(expensesCol, expenseId), { [field]: downloadURL });
                   toast('success', 'Lampiran berhasil diperbarui!');
                   
                   // Tutup modal detail yang lama (jika masih ada) dan buka lagi dengan data baru
                   closeModal($('#dataDetail-modal')); // Menutup modal detail asli
                   handleOpenBillDetail(null, expenseId); // Buka kembali untuk refresh tampilan
       
               } catch (error) {
                   toast('error', 'Gagal menyimpan lampiran.');
                   console.error("Attachment update error:", error);
               }
           }
       }
   
       async function _downloadAttachment(url, filename) {
           try {
               const res = await fetch(url, { mode: 'cors' });
               const blob = await res.blob();
               const link = document.createElement('a');
               link.href = URL.createObjectURL(blob);
               link.download = filename || 'attachment';
               document.body.appendChild(link);
               link.click();
               link.remove();
               setTimeout(() => URL.revokeObjectURL(link.href), 1000);
           } catch (e) {
               console.error('Download attachment failed:', e);
               // Fallback langsung buka URL
               window.open(url, '_blank');
           }
       }
       
       function handlePayBillModal(billId) {
           const bill = appState.bills.find(i => i.id === billId);
           if (!bill) { toast('error', 'Data tagihan tidak ditemukan.'); return; }
           
           const remainingAmount = (bill.amount || 0) - (bill.paidAmount || 0);
           
           const content = `
               <form id="payment-form" data-id="${billId}" data-type="bill">
                   <div class="payment-summary">
                       <div><span>Total Tagihan:</span><strong>${fmtIDR(bill.amount)}</strong></div>
                       <div><span>Sudah Dibayar:</span><strong>${fmtIDR(bill.paidAmount || 0)}</strong></div>
                       <div class="remaining"><span>Sisa Tagihan:</span><strong>${fmtIDR(remainingAmount)}</strong></div>
                   </div>
                   <div class="form-group">
                       <label>Jumlah Pembayaran</label>
                       <input type="text" name="amount" inputmode="numeric" required placeholder="Masukkan jumlah pembayaran" value="${new Intl.NumberFormat('id-ID').format(remainingAmount)}">
                   </div>
                   <div class="form-group">
                       <label>Tanggal Pembayaran</label>
                       <input type="date" name="date" value="${new Date().toISOString().slice(0,10)}" required>
                   </div>
                   <button type="submit" class="btn btn-primary">Bayar</button>
               </form>
           `;
           createModal('payment', { title: 'Form Pembayaran Tagihan', content, paymentType: 'bill' });
       }

       function _createPaymentHistoryHTML(payments) {
        if (!payments || payments.length === 0) {
            return ''; // Jangan tampilkan apa pun jika tidak ada riwayat
        }
    
        const historyItems = payments.map(p => {
            const paymentDate = p.date?.toDate ? p.date.toDate().toLocaleDateString('id-ID', {day: 'numeric', month: 'long', year: 'numeric'}) : 'Tanggal tidak valid';
            return `
                <div class="payment-history-item">
                    <dt>${paymentDate}</dt>
                    <dd>${fmtIDR(p.amount)}</dd>
                </div>
            `;
        }).join('');
    
        return `
            <h5 class="detail-section-title">Riwayat Pembayaran</h5>
            <dl class="detail-list">
                ${historyItems}
            </dl>
        `;
    }

    
    function _showBillsFilterModal(onApply) {
        const projectOptions = [{ value: 'all', text: 'Semua Proyek' }, ...appState.projects.map(p => ({ value: p.id, text: p.projectName }))];
        const supplierOptions = [{ value: 'all', text: 'Semua Supplier' }, ...appState.suppliers.map(s => ({ value: s.id, text: s.supplierName }))];
    
        const content = `
            <form id="bills-filter-form">
                ${createMasterDataSelect('filter-project-id', 'Filter Berdasarkan Proyek', projectOptions, appState.billsFilter.projectId)}
                ${createMasterDataSelect('filter-supplier-id', 'Filter Berdasarkan Supplier', supplierOptions, appState.billsFilter.supplierId)}
                <div class="filter-modal-footer">
                    <button type="button" id="reset-filter-btn" class="btn btn-secondary">Reset</button>
                    <button type="submit" class="btn btn-primary">Terapkan</button>
                </div>
            </form>
        `;
        createModal('dataDetail', { title: 'Filter Tagihan', content });
    
        _initCustomSelects($('#dataDetail-modal'));
    
        $('#bills-filter-form').addEventListener('submit', (e) => {
            e.preventDefault();
            appState.billsFilter.projectId = $('#filter-project-id').value;
            appState.billsFilter.supplierId = $('#filter-supplier-id').value;
            onApply();
            closeModal($('#dataDetail-modal'));
        });
    
        $('#reset-filter-btn').addEventListener('click', () => {
            appState.billsFilter.projectId = 'all';
            appState.billsFilter.supplierId = 'all';
            onApply();
            closeModal($('#dataDetail-modal'));
        });
    }
    
    function _showBillsSortModal(onApply) {
        const { sortBy, sortDirection } = appState.billsFilter;
        const content = `
            <form id="bills-sort-form">
                <div class="sort-options">
                    <div class="sort-option">
                        <input type="radio" id="sort-due-date" name="sortBy" value="dueDate" ${sortBy === 'dueDate' ? 'checked' : ''}>
                        <label for="sort-due-date">Tanggal Jatuh Tempo</label>
                    </div>
                    <div class="sort-option">
                        <input type="radio" id="sort-amount" name="sortBy" value="amount" ${sortBy === 'amount' ? 'checked' : ''}>
                        <label for="sort-amount">Jumlah Tagihan</label>
                    </div>
                </div>
                <div class="form-group" style="margin-top: 1rem;">
                    <label>Arah Pengurutan</label>
                    <div class="sort-direction">
                        <button type="button" data-dir="desc" class="${sortDirection === 'desc' ? 'active' : ''}">Terbaru/Tertinggi</button>
                        <button type="button" data-dir="asc" class="${sortDirection === 'asc' ? 'active' : ''}">Terlama/Terendah</button>
                    </div>
                </div>
                <div class="filter-modal-footer" style="grid-template-columns: 1fr;">
                     <button type="submit" class="btn btn-primary">Terapkan</button>
                </div>
            </form>
        `;
    
        createModal('dataDetail', { title: 'Urutkan Tagihan', content });
    
        const form = $('#bills-sort-form');
        form.querySelectorAll('.sort-direction button').forEach(btn => {
            btn.addEventListener('click', () => {
                form.querySelectorAll('.sort-direction button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            appState.billsFilter.sortBy = form.querySelector('input[name="sortBy"]:checked').value;
            appState.billsFilter.sortDirection = form.querySelector('.sort-direction button.active').dataset.dir;
            onApply();
            closeModal($('#dataDetail-modal'));
        });
    }
    
    function _getBillsListHTML(items) {
        if (items.length === 0) {
            let message = 'Tidak ada data';
            if (appState.billsFilter.searchTerm || appState.billsFilter.projectId !== 'all' || appState.billsFilter.supplierId !== 'all' || appState.billsFilter.category !== 'all') {
                message += ' yang cocok dengan kriteria filter Anda.';
            } else {
                 message += ' dalam kategori ini.';
            }
            return `<p class="empty-state" style="margin-top: 2rem;">${message}</p>`;
        }
    
        return `
        <div class="dense-list-container">
            ${items.map(item => {
            let supplierName = '';
            const expense = appState.expenses.find(e => e.id === item.expenseId);
            if (expense && expense.supplierId) {
                supplierName = appState.suppliers.find(s => s.id === expense.supplierId)?.supplierName || '';
            } else if (item.type === 'gaji') {
                supplierName = appState.workers.find(w => w.id === item.workerId)?.workerName || 'Gaji Karyawan';
            }
    
            const date = item.dueDate?.toDate ? item.dueDate.toDate().toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : 'N/A';
            const subtitle = supplierName ? `${supplierName} · Tanggal: ${date}` : `Tanggal: ${date}`;
            const remainingAmount = (item.amount || 0) - (item.paidAmount || 0);
            const isFullyPaid = remainingAmount <= 0 && item.status !== 'delivery_order';
            
            let statusHTML = '';
            let mainActionHTML = '';
    
            if (item.status === 'delivery_order') {
                statusHTML = `<span class="status-badge info">Surat Jalan</span>`;
                mainActionHTML = `<button class="btn btn-sm btn-primary" data-action="edit-surat-jalan" data-id="${item.expenseId}" title="Input Harga"><span class="material-symbols-outlined">edit_note</span> Input Harga</button>`;
            } else if (isFullyPaid) {
                statusHTML = `<span class="status-badge positive">Lunas</span>`;
            } else if (item.paidAmount > 0) {
                statusHTML = `<span class="status-badge warn">Sisa ${fmtIDR(remainingAmount)}</span>`;
                mainActionHTML = `
                    <button class="btn btn-sm btn-success" data-action="pay-bill" data-id="${item.id}" title="Bayar">
                         <span class="material-symbols-outlined">payment</span> Bayar
                    </button>`;
            } else {
                statusHTML = `<span class="status-badge negative">Belum Dibayar</span>`;
                mainActionHTML = `
                    <button class="btn btn-sm btn-success" data-action="pay-bill" data-id="${item.id}" title="Bayar">
                         <span class="material-symbols-outlined">payment</span> Bayar
                    </button>`;
            }
    
            return `
            <div class="dense-list-item" data-id="${item.id}" data-type="bill" data-expense-id="${item.expenseId || ''}">
                <div class="item-main-content" data-action="open-bill-detail">
                    <strong class="item-title">${item.description}</strong>
                    <span class="item-subtitle">${subtitle}</span>
                    <div class="item-details">
                        <strong class="item-amount">${item.status === 'delivery_order' ? 'Tanpa Harga' : fmtIDR(item.amount)}</strong>
                        ${statusHTML}
                    </div>
                </div>
                
                <div class="item-actions">
                    ${mainActionHTML}
                    <button class="btn-icon" data-action="open-bill-actions-modal" data-id="${item.id}" data-expense-id="${item.expenseId || ''}" title="Opsi Lainnya">
                        <span class="material-symbols-outlined">more_vert</span>
                    </button>
                </div>
            </div>`;
            }).join('')}
        </div>`;
    }

    function _getEditFormFakturMaterialHTML(item, isFromSuratJalan = false) {
        // ... (fungsi ini akan mirip dengan _getFormFakturMaterialHTML tapi dengan nilai yang sudah terisi)
        // Tambahkan juga pilihan "Jadikan Tagihan" / "Sudah Lunas" jika dari surat jalan
        let paymentStatusHTML = '';
        if (isFromSuratJalan) {
            paymentStatusHTML = `
            <div class="form-group">
                <label>Status Pembayaran</label>
                <div class="sort-direction">
                    <button type="button" class="btn-status-payment active" data-status="unpaid">Jadikan Tagihan</button>
                    <button type="button" class="btn-status-payment" data-status="paid">Sudah Lunas</button>
                </div>
                <input type="hidden" name="status" value="unpaid">
            </div>`;
        }
        // ... (sisa kode untuk membuat form dengan data item yang sudah ada) ...
        return `
            <form id="edit-item-form" data-id="${item.id}" data-type="expense">
                ... (field-field form yang sudah terisi) ...
                <h5 class="invoice-section-title">Rincian Barang</h5>
                <div id="invoice-items-container">${itemsHTML}</div>
                ...
                ${paymentStatusHTML}
                <button type="submit" class="btn btn-primary">Simpan Perubahan</button>
            </form>
        `;
    }
    
    async function handleEditSuratJalanModal(expenseId) {
        const expense = appState.expenses.find(e => e.id === expenseId);
        if (!expense) return toast('error', 'Data surat jalan tidak ditemukan.');
    
        const content = _getEditFormFakturMaterialHTML(expense, true); // true = mode edit surat jalan
        const modalEl = createModal('editItem', { title: `Input Harga: ${expense.description}`, content });
    
        if (modalEl) {
            $('#add-invoice-item-btn', modalEl).addEventListener('click', () => _addInvoiceItemRow(modalEl));
            $('#invoice-items-container', modalEl).addEventListener('input', (e) => _handleInvoiceItemChange(e, modalEl));
            $$('.remove-item-btn', modalEl).forEach(btn => btn.addEventListener('click', (e) => {
                e.target.closest('.invoice-item-row').remove();
                _updateInvoiceTotal(modalEl);
            }));
            
            $('#edit-item-form', modalEl).addEventListener('submit', (e) => {
                e.preventDefault();
                handleUpdateSuratJalan(e.target);
            });
        }
    }    
    async function handleUpdateSuratJalan(form) {
        const expenseId = form.dataset.id;
        const status = form.querySelector('input[name="status"]').value || 'unpaid';
    
        const items = [];
        $$('.invoice-item-row', form).forEach(row => {
            const materialId = row.querySelector('input[name="materialId"]').value;
            const price = parseFormattedNumber(row.querySelector('input[name="itemPrice"]').value);
            const qty = Number(row.querySelector('input[name="itemQty"]').value);
            if (materialId && qty > 0 && price > 0) {
                items.push({ materialId, price, qty, total: price * qty });
            }
        });
    
        if (items.length === 0) {
            return toast('error', 'Harap isi harga untuk minimal satu barang.');
        }
    
        const newAmount = items.reduce((sum, item) => sum + item.total, 0);
    
        toast('syncing', 'Menyimpan faktur...');
        try {
            await runTransaction(db, async (transaction) => {
                const expenseRef = doc(expensesCol, expenseId);
                const billRef = doc(billsCol);
    
                // 1. Update dokumen expense
                transaction.update(expenseRef, {
                    amount: newAmount,
                    items: items,
                    status: status
                });
    
                // 2. Buat dokumen bill baru
                transaction.set(billRef, {
                    expenseId: expenseId,
                    description: form.elements.description.value,
                    amount: newAmount,
                    dueDate: new Date(form.elements.date.value),
                    status: status,
                    type: 'material',
                    projectId: form.elements['project-id'].value,
                    createdAt: serverTimestamp(),
                    paidAmount: status === 'paid' ? newAmount : 0,
                    ...(status === 'paid' && { paidAt: serverTimestamp() })
                });
    
                // 3. Perbarui harga di stock_transactions
                for (const item of items) {
                    const q = query(stockTransactionsCol, where("expenseId", "==", expenseId), where("materialId", "==", item.materialId));
                    const transSnap = await getDocs(q); // getDocs bisa di dalam transaction
                    if (!transSnap.empty) {
                        const transRef = transSnap.docs[0].ref;
                        transaction.update(transRef, { pricePerUnit: item.price });
                    }
                }
            });
    
            await _logActivity('Menyelesaikan Surat Jalan', { docId: expenseId, newAmount });
            toast('success', 'Faktur berhasil disimpan dan tagihan telah dibuat!');
            closeModal($('#editItem-modal'));
            renderTagihanPage();
    
        } catch (error) {
            toast('error', 'Gagal memperbarui data.');
            console.error("Error updating delivery order:", error);
        }
    }

    async function handlePayBillModal(billId) {
        const bill = appState.bills.find(i => i.id === billId);
        if (!bill) { toast('error', 'Data tagihan tidak ditemukan.'); return; }
        
        const remainingAmount = (bill.amount || 0) - (bill.paidAmount || 0);
        
        const content = `
            <form id="payment-form" data-id="${billId}" data-type="bill">
                <div class="payment-summary">
                    <div><span>Total Tagihan:</span><strong>${fmtIDR(bill.amount)}</strong></div>
                    <div><span>Sudah Dibayar:</span><strong>${fmtIDR(bill.paidAmount || 0)}</strong></div>
                    <div class="remaining"><span>Sisa Tagihan:</span><strong>${fmtIDR(remainingAmount)}</strong></div>
                </div>
                <div class="form-group">
                    <label>Jumlah Pembayaran</label>
                    <input type="text" name="amount" inputmode="numeric" required placeholder="Masukkan jumlah pembayaran" value="${new Intl.NumberFormat('id-ID').format(remainingAmount)}">
                </div>
                <div class="form-group">
                    <label>Tanggal Pembayaran</label>
                    <input type="date" name="date" value="${new Date().toISOString().slice(0,10)}" required>
                </div>
                <button type="submit" class="btn btn-primary">Bayar</button>
            </form>
        `;
        createModal('payment', { title: 'Form Pembayaran Tagihan', content, paymentType: 'bill' });
    }

    async function handleProcessBillPayment(form) {
        const billId = form.dataset.id;
        const amountToPay = parseFormattedNumber(form.elements.amount.value);
        const date = new Date(form.elements.date.value);

        if (amountToPay <= 0) {
            toast('error', 'Jumlah pembayaran harus lebih dari nol.'); return;
        }

        toast('syncing', 'Memproses pembayaran...');
        try {
            const billRef = doc(billsCol, billId);
            
            await runTransaction(db, async (transaction) => {
                const billSnap = await transaction.get(billRef);
                if (!billSnap.exists()) throw new Error("Tagihan tidak ditemukan");

                const billData = billSnap.data();
                const newPaidAmount = (billData.paidAmount || 0) + amountToPay;
                const isPaid = newPaidAmount >= billData.amount;
                
                transaction.update(billRef, {
                    paidAmount: increment(amountToPay),
                    status: isPaid ? 'paid' : 'unpaid',
                    ...(isPaid && { paidAt: serverTimestamp() })
                });

                if (isPaid && billData.expenseId) {
                    const expenseRef = doc(expensesCol, billData.expenseId);
                    transaction.update(expenseRef, { status: 'paid' });
                }

                const paymentRef = doc(collection(billRef, 'payments'));
                transaction.set(paymentRef, { amount: amountToPay, date, createdAt: serverTimestamp() });
            });
            await _logActivity(`Membayar Tagihan Cicilan`, { billId, amount: amountToPay });
            
            toast('success', 'Pembayaran berhasil dicatat.');
            if (appState.activePage === 'tagihan') renderTagihanPage();

        } catch (error) {
            toast('error', `Gagal memproses pembayaran.`);
            console.error('Bill Payment error:', error);
        }
    }

    async function renderSimulasiBayarPage() {
        const container = $('.page-container');
        container.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';
    
        appState.simulasiState.selectedPayments.clear();
    
        await Promise.all([
            fetchAndCacheData('bills', billsCol), fetchAndCacheData('fundingSources', fundingSourcesCol),
            fetchAndCacheData('workers', workersCol, 'workerName'), fetchAndCacheData('suppliers', suppliersCol, 'supplierName'),
            fetchAndCacheData('expenses', expensesCol), fetchAndCacheData('fundingCreditors', collection(db, 'teams', TEAM_ID, 'funding_creditors'), 'creditorName'),
            fetchAndCacheData('staff', staffCol, 'staffName'), fetchAndCacheData('projects', projectsCol)
        ]);
    
        const unpaidBills = appState.bills.filter(b => b.status === 'unpaid');
        const unpaidLoans = appState.fundingSources.filter(f => f.status === 'unpaid');
        const materialBills = unpaidBills.filter(b => ['material', 'operasional', 'lainnya'].includes(b.type));
        const salaryBills = unpaidBills.filter(b => b.type === 'gaji');
        const staffSalaries = appState.staff || [];
    
        const createPaymentCard = (item, type) => {
            let title, description, remainingAmount, id;
            
            if (type === 'gaji' || type === 'material') {
                id = `bill-${item.id}`;
                const expense = appState.expenses.find(e => e.id === item.expenseId);
                title = (type === 'gaji') ? appState.workers.find(w => w.id === item.workerId)?.workerName : appState.suppliers.find(s => s.id === expense?.supplierId)?.supplierName;
                description = item.description;
                remainingAmount = item.amount - (item.paidAmount || 0);
            } else if (type === 'gaji_operasional') {
                id = `staff-${item.id}`;
                title = item.staffName;
                description = "Gaji Bulanan Staf";
                remainingAmount = item.salary || 0;
            } else { // pinjaman
                id = `loan-${item.id}`;
                title = appState.fundingCreditors.find(c => c.id === item.creditorId)?.creditorName;
                description = "Cicilan Pinjaman";
                remainingAmount = (item.totalRepaymentAmount || item.totalAmount) - (item.paidAmount || 0);
            }
    
            return `
                <div class="card simulasi-item" data-id="${id}" data-full-amount="${remainingAmount}" data-partial-allowed="true" data-title="${title || 'N/A'}" data-description="${description}">
                    <div class="simulasi-info">
                        <div class="simulasi-title">${type === 'material' ? description : (title || 'N/A')}</div>
                    </div>
                    <div class="simulasi-amount">${fmtIDR(remainingAmount)}</div>
                </div>
            `;
        };
    
        const createAccordionSection = (title, items, type) => {
            if (!items || items.length === 0) return '';
            
            const totalAmount = items.reduce((sum, item) => {
                if (type === 'pinjaman') return sum + ((item.totalRepaymentAmount || item.totalAmount) - (item.paidAmount || 0));
                if (type === 'gaji_operasional') return sum + (item.salary || 0);
                return sum + (item.amount - (item.paidAmount || 0));
            }, 0);
        
            const groupedItems = new Map();
            if (type === 'material' || type === 'pinjaman') {
                items.forEach(item => {
                    let keyId, groupName;
                    if (type === 'material') {
                        const expense = appState.expenses.find(e => e.id === item.expenseId);
                        const supplier = appState.suppliers.find(s => s.id === expense?.supplierId);
                        keyId = supplier?.id || 'lainnya';
                        groupName = supplier?.supplierName || 'Lainnya';
                    } else { // pinjaman
                        const creditor = appState.fundingCreditors.find(c => c.id === item.creditorId);
                        keyId = creditor?.id || 'lainnya';
                        groupName = creditor?.creditorName || 'Lainnya';
                    }
                    if (!groupedItems.has(keyId)) groupedItems.set(keyId, { name: groupName, items: [] });
                    groupedItems.get(keyId).items.push(item);
                });
            }
        
            const contentHTML = (type === 'material' || type === 'pinjaman')
                ? [...groupedItems.values()].map(group => { // Render per grup
                    const subTotal = group.items.reduce((sum, item) => {
                        if (type === 'pinjaman') return sum + ((item.totalRepaymentAmount || item.totalAmount) - (item.paidAmount || 0));
                        return sum + (item.amount - (item.paidAmount || 0));
                    }, 0);
                    return `
                        <div class="simulasi-subsection">
                            <div class="simulasi-subsection-header">
                                <span>${group.name}</span>
                                <strong>${fmtIDR(subTotal)}</strong>
                            </div>
                            <div class="simulasi-subsection-content">
                                ${group.items.map(item => createPaymentCard(item, type)).join('')}
                            </div>
                        </div>
                    `;
                }).join('')
                : items.map(item => createPaymentCard(item, type)).join(''); // Render biasa tanpa grup
        
            return `
                <div class="card simulasi-section">
                    <button class="simulasi-section-header">
                         <div class="header-info">
                            <span class="header-title">${title}</span>
                            <span class="header-total">${items.length} Tagihan - Total ${fmtIDR(totalAmount)}</span>
                        </div>
                        <span class="material-symbols-outlined header-icon">expand_more</span>
                    </button>
                    <div class="simulasi-section-content">
                        ${contentHTML}
                    </div>
                </div>`;
        };
    
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
                <div class="rekap-actions">
                    <button id="simulasi-buat-pdf" class="btn btn-primary"><span class="material-symbols-outlined">picture_as_pdf</span> Buat Laporan PDF</button>
                </div>
            </div>
            <div id="simulasi-utang-list">
                 ${createAccordionSection('Gaji Tim Operasional', staffSalaries.filter(s => s.paymentType === 'fixed_monthly'), 'gaji_operasional')}
                 ${createAccordionSection('Tagihan Gaji Pekerja', salaryBills, 'gaji')}
                 ${createAccordionSection('Tagihan Material & Lainnya', materialBills, 'material')}
                 ${createAccordionSection('Cicilan Pinjaman', unpaidLoans, 'pinjaman')}
            </div>
        `;
    
        $$('.simulasi-section-header').forEach(header => header.addEventListener('click', () => header.parentElement.classList.toggle('open')));
        $('#simulasi-utang-list').addEventListener('click', (e) => {
            const card = e.target.closest('.simulasi-item');
            if (card) _openSimulasiItemActionsModal(card.dataset);
        });
        $('#simulasi-dana-masuk').addEventListener('input', _updateSimulasiTotals);
        $('#simulasi-dana-masuk').addEventListener('input', _formatNumberInput);
        $('#simulasi-buat-pdf').addEventListener('click', _createSimulasiPDF);
    }
    function _openSimulasiItemActionsModal(dataset) {
        const { id, title, description, fullAmount, partialAllowed } = dataset;
        const isSelected = appState.simulasiState.selectedPayments.has(id);
        const actions = [];

        if (isSelected) {
            actions.push({ label: 'Batalkan Pilihan', action: 'cancel', icon: 'cancel' });
        } else {
            actions.push({ label: 'Pilih & Bayar Penuh', action: 'pay_full', icon: 'check_circle' });
            if (partialAllowed === 'true') {
                actions.push({ label: 'Bayar Sebagian', action: 'pay_partial', icon: 'pie_chart' });
            }
        }

        const modal = createModal('billActionsModal', {
            bill: { description: title, amount: parseFormattedNumber(fullAmount) },
            actions
        });

        // Menambahkan event listener ke tombol aksi di dalam modal
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
                        // Panggil modal untuk input pembayaran parsial
                        _openSimulasiPartialPaymentModal(dataset);
                        break;
                    case 'cancel':
                        appState.simulasiState.selectedPayments.delete(id);
                        card.classList.remove('selected');
                        break;
                }
                _updateSimulasiTotals();
                closeModal(modal); // Tutup modal aksi setelah aksi dipilih
            });
        });
    }

    function _openSimulasiPartialPaymentModal(dataset) {
        const { id, title, fullAmount } = dataset;
        const fullAmountNum = parseFormattedNumber(fullAmount);

        const content = `
            <form id="partial-payment-form">
                <p>Masukkan jumlah pembayaran untuk <strong>${title}</strong>.</p>
                <div class="payment-summary" style="margin-bottom: 1rem;">
                    <div class="remaining"><span>Total Tagihan:</span><strong>${fmtIDR(fullAmountNum)}</strong></div>
                </div>
                <div class="form-group">
                    <label>Jumlah Pembayaran Parsial</label>
                    <input type="text" name="amount" inputmode="numeric" required placeholder="mis. 500.000">
                </div>
                <div class="modal-footer" style="margin-top: 1.5rem;">
                    <button type="button" class="btn btn-secondary" data-close-modal>Batal</button>
                    <button type="submit" class="btn btn-primary">Simpan</button>
                </div>
            </form>
        `;

        const modal = createModal('dataDetail', { title: 'Pembayaran Parsial', content });
        const form = $('#partial-payment-form', modal);
        const amountInput = form.querySelector('input[name="amount"]');
        
        amountInput.addEventListener('input', _formatNumberInput); // Gunakan fungsi utilitas yang sudah ada

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

        // Hitung total alokasi dari state
        for (const amount of appState.simulasiState.selectedPayments.values()) {
            totalAlokasi += amount;
        }

        const sisaDana = danaMasuk - totalAlokasi;

        // Update UI
        totalAlokasiEl.textContent = fmtIDR(totalAlokasi);
        sisaDanaEl.textContent = fmtIDR(sisaDana);
        
        // Atur warna sisa dana
        sisaDanaEl.classList.remove('positive', 'negative');
        if (sisaDana >= 0) {
            sisaDanaEl.classList.add('positive');
        } else {
            sisaDanaEl.classList.add('negative');
        }

        // Sinkronisasi tampilan visual setiap kartu dengan state
        $$('.simulasi-item').forEach(card => {
            const cardId = card.dataset.id;
            const amountEl = card.querySelector('.simulasi-amount');
            
            if (appState.simulasiState.selectedPayments.has(cardId)) {
                card.classList.add('selected');
                const selectedAmount = appState.simulasiState.selectedPayments.get(cardId);
                const fullAmount = parseFormattedNumber(card.dataset.fullAmount);
                // Tampilkan jumlah yang dipilih jika berbeda dari jumlah penuh
                if (selectedAmount < fullAmount) {
                    amountEl.innerHTML = `<span class="partial-amount">${fmtIDR(selectedAmount)}</span> / ${fmtIDR(fullAmount)}`;
                }
            } else {
                card.classList.remove('selected');
                // Kembalikan ke tampilan jumlah penuh
                amountEl.innerHTML = fmtIDR(card.dataset.fullAmount);
            }
        });
    }
    // --- SUB-SEKSI 3.6: LAPORAN & PDF ---
    async function renderLaporanPage() {
        const container = $('.page-container');
        if (typeof Chart === 'undefined') {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
            document.head.appendChild(script);
            await new Promise(resolve => script.onload = resolve);
        }

        const tabs = [
            {id:'laba_rugi', label:'Laba Rugi'}, 
            {id:'analisis_beban', label:'Analisis Beban'}, 
            {id:'arus_kas', label:'Arus Kas'}
        ];
        container.innerHTML = `
            <div class="card card-pad" style="margin-bottom: 1.5rem;">
                <h5 class="section-title-owner" style="margin-top:0;">Ringkasan Keuangan</h5>
                <div style="height: 220px; position: relative;"><canvas id="financial-summary-chart"></canvas></div>
            </div>

            <div class="report-actions card card-pad" style="margin-bottom: 1.5rem;">
                <button id="generate-detailed-report-btn" data-action="open-report-generator" class="btn btn-primary">
                    <span class="material-symbols-outlined">download_for_offline</span>
                    Buat Laporan Rinci / Unduh
                </button>
            </div>

            <div class="sub-nav">
                ${tabs.map((tab, index) => `<button class="sub-nav-item ${index === 0 ? 'active' : ''}" data-tab="${tab.id}">${tab.label}</button>`).join('')}
            </div>
            <div id="sub-page-content"></div>
        `;

        const renderTabContent = async (tabId) => {
            appState.activeSubPage.set('laporan', tabId);
            const contentContainer = $('#sub-page-content');
            contentContainer.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';
            
            if (tabId === 'laba_rugi') await _renderLaporanLabaRugi(contentContainer);
            else if (tabId === 'analisis_beban') await _renderAnalisisBeban(contentContainer);
            else if (tabId === 'arus_kas') await _renderLaporanArusKas(contentContainer);
        };

        $$('.sub-nav-item').forEach(btn => btn.addEventListener('click', (e) => {
            $$('.sub-nav-item').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            renderTabContent(e.currentTarget.dataset.tab);
        }));
        
        const lastSubPage = appState.activeSubPage.get('laporan') || tabs[0].id;
        $(`.sub-nav-item[data-tab="${lastSubPage}"]`)?.classList.add('active');
        await renderTabContent(lastSubPage);
        _renderFinancialSummaryChart(); 
    }

    async function _renderFinancialSummaryChart() {
        const canvas = $('#financial-summary-chart');
        if (!canvas) return;

        await Promise.all([ fetchAndCacheData('projects', projectsCol), fetchAndCacheData('incomes', incomesCol), fetchAndCacheData('expenses', expensesCol), fetchAndCacheData('fundingSources', fundingSourcesCol) ]);

        const mainProject = appState.projects.find(p => p.projectType === 'main_income');
        const pureIncome = appState.incomes.filter(inc => inc.projectId === mainProject?.id).reduce((sum, inc) => sum + inc.amount, 0);
        const totalExpenses = appState.expenses.reduce((sum, exp) => sum + exp.amount, 0);
        const totalFunding = appState.fundingSources.reduce((sum, fund) => sum + fund.totalAmount, 0);

        const ctx = canvas.getContext('2d');
        if (window.financialChart) window.financialChart.destroy();
        
        const textColor = getComputedStyle(document.body).getPropertyValue('--text').trim();

        window.financialChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Pemasukan Murni', 'Pengeluaran', 'Pendanaan'],
                datasets: [{ data: [pureIncome, totalExpenses, totalFunding], backgroundColor: ['#28a745', '#f87171', '#ffca2c'], borderWidth: 0 }]
            },
            options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'bottom', labels: { color: textColor, boxWidth: 12, padding: 20, font: { weight: '500' } } } } }
        });
    }

    async function _renderLaporanLabaRugi(container) {
        const mainProject = appState.projects.find(p => p.projectType === 'main_income');
        const internalProjects = appState.projects.filter(p => p.id !== mainProject?.id);
        
        const pendapatan = appState.incomes.filter(i => i.projectId === mainProject?.id).reduce((sum, i) => sum + i.amount, 0);
        const hpp_material = appState.expenses.filter(e => e.projectId === mainProject?.id && e.type === 'material').reduce((sum, e) => sum + e.amount, 0);
        
        const billsSnap = await getDocs(query(billsCol));
        const allBills = billsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const paidSalaryBills = allBills.filter(b => b.type === 'gaji' && b.status === 'paid');
        
        const hpp_gaji = paidSalaryBills.filter(b => b.projectId === mainProject?.id).reduce((sum, b) => sum + b.amount, 0);
        const bebanGajiInternal = paidSalaryBills.filter(b => internalProjects.some(p => p.id === b.projectId)).reduce((sum, b) => sum + b.amount, 0);
        const hpp_lainnya = appState.expenses.filter(e => e.projectId === mainProject?.id && e.type === 'lainnya').reduce((sum, e) => sum + e.amount, 0);
        const hpp = hpp_material + hpp_gaji + hpp_lainnya;
        const labaKotor = pendapatan - hpp;
        const bebanOperasional = appState.expenses.filter(e => e.projectId === mainProject?.id && e.type === 'operasional').reduce((sum, e) => sum + e.amount, 0);
        const bebanExpenseInternal = appState.expenses.filter(e => internalProjects.some(p => p.id === e.projectId)).reduce((sum, e) => sum + e.amount, 0);
        const bebanInternal = bebanExpenseInternal + bebanGajiInternal;
        const labaBersih = labaKotor - bebanOperasional - bebanInternal;

        container.innerHTML = `
        <div class="card card-pad">
            <h5 class="report-title">Laporan Laba Rugi</h5>
            <dl class="detail-list">
                <div><dt>Pendapatan</dt><dd class="positive">${fmtIDR(pendapatan)}</dd></div>
                <div><dt>Harga Pokok Penjualan (HPP)</dt><dd class="negative">- ${fmtIDR(hpp)}</dd></div>
                <div class="summary-row"><dt>Laba Kotor</dt><dd>${fmtIDR(labaKotor)}</dd></div>
                <div><dt>Beban Operasional</dt><dd class="negative">- ${fmtIDR(bebanOperasional)}</dd></div>
                <div><dt>Beban Proyek Internal</dt><dd class="negative">- ${fmtIDR(bebanInternal)}</dd></div>
                <div class="summary-row final"><dt>Laba Bersih</dt><dd>${fmtIDR(labaBersih)}</dd></div>
            </dl>
        </div>`;
    }

    async function _renderLaporanArusKas(container) {
        const kasMasukTermin = appState.incomes.reduce((sum, i) => sum + i.amount, 0);
        const kasMasukPinjaman = appState.fundingSources.reduce((sum, f) => sum + f.totalAmount, 0);
        const totalKasMasuk = kasMasukTermin + kasMasukPinjaman;
        const kasKeluarBayar = appState.expenses.filter(e=>e.status === 'paid').reduce((sum, e) => sum + e.amount, 0);
        const totalKasKeluar = kasKeluarBayar;
        const arusKasBersih = totalKasMasuk - totalKasKeluar;

         container.innerHTML = `
        <div class="card card-pad">
            <h5 class="report-title">Laporan Arus Kas</h5>
            <dl class="detail-list">
                <div class="category-title"><dt>Arus Kas Masuk</dt><dd></dd></div>
                <div><dt>Penerimaan Termin</dt><dd class="positive">${fmtIDR(kasMasukTermin)}</dd></div>
                <div><dt>Penerimaan Pinjaman</dt><dd class="positive">${fmtIDR(kasMasukPinjaman)}</dd></div>
                <div class="summary-row"><dt>Total Arus Kas Masuk</dt><dd>${fmtIDR(totalKasMasuk)}</dd></div>
                <div class="category-title"><dt>Arus Kas Keluar</dt><dd></dd></div>
                <div><dt>Pembayaran Beban Lunas</dt><dd class="negative">- ${fmtIDR(kasKeluarBayar)}</dd></div>
                <div class="summary-row"><dt>Total Arus Kas Keluar</dt><dd class="negative">- ${fmtIDR(totalKasKeluar)}</dd></div>
                <div class="summary-row final"><dt>Arus Kas Bersih</dt><dd>${fmtIDR(arusKasBersih)}</dd></div>
            </dl>
        </div>`;
    }

    async function _renderAnalisisBeban(container) {
        container.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';
        await Promise.all([ fetchAndCacheData('projects', projectsCol), fetchAndCacheData('bills', billsCol) ]);

        const totals = {
            main: { material: { paid: 0, unpaid: 0 }, operasional: { paid: 0, unpaid: 0 }, lainnya: { paid: 0, unpaid: 0 }, gaji: { paid: 0, unpaid: 0 } },
            internal: { material: { paid: 0, unpaid: 0 }, operasional: { paid: 0, unpaid: 0 }, lainnya: { paid: 0, unpaid: 0 }, gaji: { paid: 0, unpaid: 0 } }
        };
        const mainProject = appState.projects.find(p => p.projectType === 'main_income');
        const mainProjectId = mainProject ? mainProject.id : null;

        appState.bills.forEach(bill => {
            const projectGroup = (bill.projectId === mainProjectId) ? 'main' : 'internal';
            if (totals[projectGroup] && totals[projectGroup][bill.type]) {
                totals[projectGroup][bill.type][bill.status] += (bill.amount || 0);
            }
        });

        const generateBebanRowsHTML = (data) => {
            const categories = [{ key: 'material', label: 'Beban Material' }, { key: 'gaji', label: 'Beban Gaji' }, { key: 'operasional', label: 'Beban Operasional' }, { key: 'lainnya', label: 'Beban Lainnya' }];
            return categories.map(cat => {
                const item = data[cat.key];
                const total = item.paid + item.unpaid;
                if (total === 0) return '';
                return `<div><dt>${cat.label}</dt><dd class="negative">- ${fmtIDR(total)}</dd></div><div class="sub-item"><dt>Lunas</dt><dd>${fmtIDR(item.paid)}</dd></div><div class="sub-item"><dt>Belum Lunas</dt><dd>${fmtIDR(item.unpaid)}</dd></div>`;
            }).join('');
        };
        
        const totalBebanMain = Object.values(totals.main).reduce((sum, cat) => sum + cat.paid + cat.unpaid, 0);
        const totalBebanInternal = Object.values(totals.internal).reduce((sum, cat) => sum + cat.paid + cat.unpaid, 0);
        const grandTotalBeban = totalBebanMain + totalBebanInternal;

        container.innerHTML = `
            <div class="card card-pad">
                <h5 class="report-title">Analisis Beban Proyek</h5>
                <dl class="detail-list">
                    <div class="category-title"><dt>Beban Proyek Utama (${mainProject?.projectName || 'N/A'})</dt><dd></dd></div>
                    ${generateBebanRowsHTML(totals.main)}
                    <div class="summary-row"><dt>Total Beban Proyek Utama</dt><dd class="negative">- ${fmtIDR(totalBebanMain)}</dd></div>
                    <div class="category-title"><dt>Beban Proyek Internal</dt><dd></dd></div>
                    ${generateBebanRowsHTML(totals.internal)}
                    <div class="summary-row"><dt>Total Beban Proyek Internal</dt><dd class="negative">- ${fmtIDR(totalBebanInternal)}</dd></div>
                    <div class="summary-row final"><dt>Grand Total Semua Beban</dt><dd class="negative">- ${fmtIDR(grandTotalBeban)}</dd></div>
                </dl>
            </div>
        `;
    }

    async function handleGenerateReportModal() {
        const reportTypeOptions = [
            { value: '', text: '-- Pilih Jenis Laporan --' },
            { value: 'analisis_beban', text: 'Laporan Analisis Beban (PDF)' },
            { value: 'rekapan', text: 'Rekapan Transaksi (PDF)' },
            { value: 'upah_pekerja', text: 'Laporan Rinci Upah Pekerja (PDF)' },
            { value: 'material_supplier', text: 'Laporan Rinci Material (PDF)' }
        ];

        const content = `
            <form id="report-generator-form">
                ${createMasterDataSelect('report-type-selector', 'Jenis Laporan', reportTypeOptions, '')}
                <div id="report-dynamic-filters"></div>
                <div class="modal-footer" style="margin-top: 1.5rem;">
                    <button type="submit" class="btn btn-primary" disabled>
                        <span class="material-symbols-outlined">download</span> Unduh Laporan
                    </button>
                </div>
            </form>
        `;

        createModal('dataDetail', { title: 'Buat Laporan Rinci', content });
        _initCustomSelects($('#dataDetail-modal'));

        const form = $('#report-generator-form');
        const submitButton = form.querySelector('button[type="submit"]');

        $('#report-type-selector').addEventListener('change', (e) => {
            _renderDynamicReportFilters(e.target.value);
            submitButton.disabled = e.target.value === '';
        });

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const reportType = $('#report-type-selector').value;
            _handleDownloadReport('pdf', reportType); 
        });
    }

    async function _renderDynamicReportFilters(reportType) {
        const container = $('#report-dynamic-filters');
        container.innerHTML = '';

        const today = new Date();
        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
        const todayStr = today.toISOString().slice(0, 10);
        let filtersHTML = '';

        if (reportType && reportType !== 'analisis_beban') {
            filtersHTML += `
                <div class="rekap-filters" style="padding:0; margin-top: 1rem;">
                    <div class="form-group"><label>Dari Tanggal</label><input type="date" id="report-start-date" value="${firstDayOfMonth}"></div>
                    <div class="form-group"><label>Sampai Tanggal</label><input type="date" id="report-end-date" value="${todayStr}"></div>
                </div>`;
        }
        if (reportType === 'rekapan') {
            await fetchAndCacheData('projects', projectsCol, 'projectName');
            const projectOptions = [{value:'all', text: 'Semua Proyek'}, ...appState.projects.map(p => ({value: p.id, text: p.projectName}))];
            filtersHTML += createMasterDataSelect('report-project-id', 'Filter Proyek', projectOptions, 'all');
        } else if (reportType === 'material_supplier') {
            await fetchAndCacheData('suppliers', suppliersCol, 'supplierName');
            const supplierOptions = [{value:'all', text: 'Semua Supplier'}, ...appState.suppliers.filter(s=> s.category === 'Material').map(s => ({value: s.id, text: s.supplierName}))];
            filtersHTML += createMasterDataSelect('report-supplier-id', 'Filter Supplier', supplierOptions, 'all');
        }

        container.innerHTML = filtersHTML;
        _initCustomSelects(container);
    }
    
    async function _handleDownloadReport(format, reportType) { // async tetap dibutuhkan di sini
        if (format === 'csv') {
            toast('info', 'Fitur unduh CSV sedang dalam pengembangan.'); return;
        }

        let reportConfig = {};
        
        switch(reportType) {
            case 'analisis_beban': reportConfig = await _prepareAnalisisBebanDataForPdf(); break;
            case 'upah_pekerja': reportConfig = await _prepareUpahPekerjaDataForPdf(); break;
            case 'material_supplier': reportConfig = await _prepareMaterialSupplierDataForPdf(); break;
            case 'rekapan': reportConfig = await _prepareRekapanDataForPdf(); break;
            default: toast('error', 'Tipe laporan ini belum didukung.'); return;
        }
        
        if (reportConfig && reportConfig.sections && reportConfig.sections.length > 0) {
            await generatePdfReport(reportConfig); 
        } else {
            toast('info', 'Tidak ada data untuk ditampilkan pada kriteria yang dipilih.');
        }
    }
    
    async function _prepareUpahPekerjaDataForPdf() {
        const startDate = new Date($('#report-start-date').value);
        const endDate = new Date($('#report-end-date').value);
        endDate.setHours(23, 59, 59, 999);

        await Promise.all([ fetchAndCacheData('workers', workersCol, 'workerName'), fetchAndCacheData('projects', projectsCol, 'projectName') ]);
        
        const q = query(attendanceRecordsCol, where('date', '>=', startDate), where('date', '<=', endDate), where('status', '==', 'completed'), orderBy('date', 'asc'));
        const snap = await getDocs(q);
        if (snap.empty) return null;

        const bodyRows = snap.docs.map(doc => {
            const rec = doc.data();
            const worker = appState.workers.find(w => w.id === rec.workerId);
            const project = appState.projects.find(p => p.id === rec.projectId);
            let statusText = (rec.attendanceStatus === 'full_day') ? 'Hadir' : '1/2 Hari';
            
            return [ rec.date.toDate().toLocaleDateString('id-ID'), worker?.workerName || 'N/A', project?.projectName || 'N/A', statusText, fmtIDR(rec.totalPay || 0), rec.isPaid ? 'Lunas' : 'Belum Dibayar' ];
        });

        return {
            title: 'Laporan Rincian Upah Pekerja',
            subtitle: `Periode: ${startDate.toLocaleDateString('id-ID')} s/d ${endDate.toLocaleDateString('id-ID')}`,
            filename: `Laporan-Upah-${new Date().toISOString().slice(0, 10)}.pdf`,
            sections: [{ headers: ["Tanggal", "Pekerja", "Proyek", "Status", "Upah", "Status Bayar"], body: bodyRows }]
        };
    }

    async function _prepareMaterialSupplierDataForPdf() {
        const startDate = new Date($('#report-start-date').value);
        const endDate = new Date($('#report-end-date').value);
        const supplierId = $('#report-supplier-id').value;
        endDate.setHours(23, 59, 59, 999);
        
        await Promise.all([ fetchAndCacheData('suppliers', suppliersCol, 'supplierName'), fetchAndCacheData('projects', projectsCol, 'projectName') ]);

        let queryConstraints = [ where('type', '==', 'material'), where('date', '>=', startDate), where('date', '<=', endDate), orderBy('date', 'asc') ];
        if (supplierId !== 'all') queryConstraints.push(where('supplierId', '==', supplierId));
        
        const q = query(expensesCol, ...queryConstraints);
        const snap = await getDocs(q);
        if (snap.empty) return null;

        const bodyRows = snap.docs.flatMap(doc => {
            const exp = doc.data();
            if (!exp.items || exp.items.length === 0) return [];
            
            const supplier = appState.suppliers.find(s => s.id === exp.supplierId);
            const project = appState.projects.find(p => p.id === exp.projectId);

            return exp.items.map(item => {
                const material = appState.materials.find(m => m.id === item.materialId);
                return [ exp.date.toDate().toLocaleDateString('id-ID'), supplier?.supplierName || 'N/A', project?.projectName || 'N/A', material?.materialName || 'N/A', item.qty, fmtIDR(item.price), fmtIDR(item.total) ];
            });
        });

        if (bodyRows.length === 0) return null;

        const supplierName = supplierId !== 'all' ? appState.suppliers.find(s => s.id === supplierId)?.supplierName : 'Semua Supplier';
        return {
            title: 'Laporan Rincian Material per Supplier',
            subtitle: `Supplier: ${supplierName} | Periode: ${startDate.toLocaleDateString('id-ID')} s/d ${endDate.toLocaleDateString('id-ID')}`,
            filename: `Laporan-Material-${new Date().toISOString().slice(0, 10)}.pdf`,
            sections: [{ headers: ["Tanggal", "Supplier", "Proyek", "Barang", "Qty", "Harga", "Total"], body: bodyRows }]
        };
    }

    async function _prepareRekapanDataForPdf() {
        const startDate = new Date($('#report-start-date').value);
        const endDate = new Date($('#report-end-date').value);
        const projectId = $('#report-project-id').value;
        endDate.setHours(23, 59, 59, 999);
        
        await Promise.all([fetchAndCacheData('incomes', incomesCol), fetchAndCacheData('expenses', expensesCol)]);
        
        let transactions = [];
        appState.incomes.forEach(i => transactions.push({ date: i.date.toDate(), type: 'Pemasukan', description: 'Penerimaan Termin', amount: i.amount, projectId: i.projectId }));
        appState.expenses.forEach(e => transactions.push({ date: e.date.toDate(), type: 'Pengeluaran', description: e.description, amount: -e.amount, projectId: e.projectId }));
        
        const filtered = transactions.filter(t => (projectId === 'all' || t.projectId === projectId) && (t.date >= startDate && t.date <= endDate)).sort((a, b) => a.date - b.date);
        if (filtered.length === 0) return null;

        let balance = 0;
        const bodyRows = filtered.map(t => { 
            balance += t.amount; 
            return [ t.date.toLocaleDateString('id-ID'), t.description, t.amount > 0 ? fmtIDR(t.amount) : '-', t.amount < 0 ? fmtIDR(t.amount) : '-', fmtIDR(balance) ];
        });

        const totalPemasukan = filtered.filter(t=>t.amount > 0).reduce((sum, t)=>sum+t.amount, 0);
        const totalPengeluaran = filtered.filter(t=>t.amount < 0).reduce((sum, t)=>sum+t.amount, 0);
        const footRow = ["Total", "", fmtIDR(totalPemasukan), fmtIDR(totalPengeluaran), fmtIDR(balance)];

        const projectName = projectId !== 'all' ? appState.projects.find(p => p.id === projectId)?.projectName : 'Semua Proyek';
        return {
            title: 'Laporan Rekapan Transaksi',
            subtitle: `Proyek: ${projectName} | Periode: ${startDate.toLocaleDateString('id-ID')} s/d ${endDate.toLocaleDateString('id-ID')}`,
            filename: `Rekapan-${new Date().toISOString().slice(0, 10)}.pdf`,
            sections: [{ headers: ["Tanggal", "Deskripsi", "Pemasukan", "Pengeluaran", "Saldo"], body: bodyRows, foot: footRow }]
        };
    }

    async function _prepareAnalisisBebanDataForPdf() {
        await Promise.all([ fetchAndCacheData('projects', projectsCol), fetchAndCacheData('bills', billsCol) ]);

        const totals = {
            main: { material: { paid: 0, unpaid: 0 }, operasional: { paid: 0, unpaid: 0 }, lainnya: { paid: 0, unpaid: 0 }, gaji: { paid: 0, unpaid: 0 } },
            internal: { material: { paid: 0, unpaid: 0 }, operasional: { paid: 0, unpaid: 0 }, lainnya: { paid: 0, unpaid: 0 }, gaji: { paid: 0, unpaid: 0 } }
        };
        const mainProject = appState.projects.find(p => p.projectType === 'main_income');
        const mainProjectId = mainProject ? mainProject.id : null;

        appState.bills.forEach(bill => {
            const projectGroup = (bill.projectId === mainProjectId) ? 'main' : 'internal';
            if (totals[projectGroup] && totals[projectGroup][bill.type]) {
                totals[projectGroup][bill.type][bill.status] += (bill.amount || 0);
            }
        });

        const sections = [];
        const categories = [ { key: 'material', label: 'Beban Material' }, { key: 'gaji', label: 'Beban Gaji' }, { key: 'operasional', label: 'Beban Operasional' }, { key: 'lainnya', label: 'Beban Lainnya' } ];

        const mainProjectBody = categories.map(cat => {
            const data = totals.main[cat.key];
            const total = data.paid + data.unpaid;
            return [cat.label, fmtIDR(data.paid), fmtIDR(data.unpaid), fmtIDR(total)];
        }).filter(row => parseFormattedNumber(row[3]) > 0);

        const totalBebanMain = Object.values(totals.main).reduce((sum, cat) => sum + cat.paid + cat.unpaid, 0);
        if (mainProjectBody.length > 0) {
            sections.push({
                sectionTitle: `Proyek Utama (${mainProject?.projectName || 'N/A'})`,
                headers: ["Kategori Beban", "Lunas", "Belum Lunas", "Total"],
                body: mainProjectBody,
                foot: ["Total Beban Proyek Utama", "", "", fmtIDR(totalBebanMain)]
            });
        }

        const internalProjectBody = categories.map(cat => {
            const data = totals.internal[cat.key];
            const total = data.paid + data.unpaid;
            return [cat.label, fmtIDR(data.paid), fmtIDR(data.unpaid), fmtIDR(total)];
        }).filter(row => parseFormattedNumber(row[3]) > 0);

        const totalBebanInternal = Object.values(totals.internal).reduce((sum, cat) => sum + cat.paid + cat.unpaid, 0);
        if (internalProjectBody.length > 0) {
            sections.push({
                sectionTitle: `Total Semua Proyek Internal`,
                headers: ["Kategori Beban", "Lunas", "Belum Lunas", "Total"],
                body: internalProjectBody,
                foot: ["Total Beban Proyek Internal", "", "", fmtIDR(totalBebanInternal)]
            });
        }
        
        const grandTotalBeban = totalBebanMain + totalBebanInternal;
        sections.push({
            sectionTitle: `Ringkasan Total`,
            headers: ["Deskripsi", "Jumlah"],
            body: [ ['Total Beban Proyek Utama', fmtIDR(totalBebanMain)], ['Total Beban Proyek Internal', fmtIDR(totalBebanInternal)], ],
            foot: ["Grand Total Semua Beban", fmtIDR(grandTotalBeban)]
        });

        return {
            title: 'Laporan Analisis Beban',
            subtitle: `Ringkasan Total Keseluruhan`,
            filename: `Analisis-Beban-${new Date().toISOString().slice(0, 10)}.pdf`,
            sections: sections
        };
    }

    async function generatePdfReport(config) { 
        const { title, subtitle, filename, sections } = config;
    
        if (!sections || sections.length === 0) {
            toast('error', 'Data tidak lengkap untuk PDF.'); return;
        }
    
        toast('syncing', 'Membuat laporan PDF...');
        try {
            // 'await' di sini WAJIB ADA untuk menunggu data dari Firestore
            if (!appState.pdfSettings) {
                const docSnap = await getDoc(settingsDocRef);
                if (docSnap.exists()) {
                    appState.pdfSettings = docSnap.data();
                } else {
                    appState.pdfSettings = {};
                }
            }
    
            const defaults = {
                companyName: 'CV. ALAM BERKAH ABADI',
                headerColor: '#26a69a'
            };
            const settings = { ...defaults, ...appState.pdfSettings };
                
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            const totalPagesExp = '{total_pages_count_string}';
            let lastY = 0;
            const pageWidth = pdf.internal.pageSize.width;
    
            const hexToRgb = (hex) => {
                const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                return result ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)] : [38, 166, 154];
            };
            const headerRgbColor = hexToRgb(settings.headerColor);
    
            if (logoData && logoData.startsWith('data:image')) {
                pdf.addImage(logoData, 'PNG', 14, 12, 22, 22);
            }
            
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(14);
            pdf.setTextColor(44, 62, 80);
            pdf.text(settings.companyName, 40, 18);
            pdf.setFont('helvetica', 'normal');
            pdf.setFontSize(10);
            pdf.text(title, 40, 24);
            if (subtitle) {
                pdf.setFontSize(9);
                pdf.setTextColor(100, 100, 100);
                pdf.text(subtitle, 40, 29);
            }
            pdf.setDrawColor(220, 220, 220);
            pdf.line(14, 38, pageWidth - 14, 38);
            lastY = 45;
    
            const didDrawPage = (data) => {
                pdf.setFontSize(8);
                pdf.setTextColor(150, 150, 150);
                pdf.text(`Halaman ${data.pageNumber} dari ${totalPagesExp}`, 14, pdf.internal.pageSize.height - 10);
                const reportDate = new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' });
                pdf.text(`Dicetak: ${reportDate}`, pageWidth - 14, pdf.internal.pageSize.height - 10, { align: 'right' });
            };
            
            const tableConfig = {
                theme: 'grid',
                headStyles: { fillColor: headerRgbColor, textColor: 255, fontStyle: 'bold' },
                footStyles: { fillColor: [41, 128, 185], textColor: 255, fontStyle: 'bold' },
                alternateRowStyles: { fillColor: [245, 245, 245] },
                styles: { fontSize: 8, cellPadding: 2.5, valign: 'middle' },
            };
    
            sections.forEach((section, index) => {
                if (section.sectionTitle) {
                    if (index > 0) lastY += 10;
                    pdf.setFontSize(11).setFont(undefined, 'bold');
                    pdf.setTextColor(44, 62, 80);
                    pdf.text(section.sectionTitle, 14, lastY);
                    lastY += 5;
                }
                pdf.autoTable({
                    ...tableConfig,
                    head: [section.headers], body: section.body, foot: section.foot ? [section.foot] : [],
                    startY: lastY,
                    didDrawPage: didDrawPage,
                    margin: { top: 40 }
                });
                lastY = pdf.autoTable.previous.finalY;
            });
    
            if (typeof pdf.putTotalPages === 'function') {
                pdf.putTotalPages(totalPagesExp);
            }
    
            pdf.save(filename);
            toast('success', 'PDF berhasil dibuat!');
        } catch (error) {
            console.error("Gagal membuat PDF:", error);
            toast('error', 'Terjadi kesalahan saat membuat PDF.');
        }
    }

    function _createSimulasiPDF() {
        const danaMasuk = parseFormattedNumber($('#simulasi-dana-masuk').value);
        if (danaMasuk <= 0 || appState.simulasiState.selectedPayments.size === 0) {
            toast('error', 'Isi dana masuk dan pilih minimal satu tagihan.'); return;
        }

        const { gajiItems, materialItems, pinjamanItems, totalAlokasi } = _prepareSimulasiData();
        const sisaDana = danaMasuk - totalAlokasi;
        
        const sections = [];
        if (gajiItems.length > 0) sections.push({ sectionTitle: 'Rincian Pembayaran Gaji', headers: ['Penerima', 'Deskripsi', 'Jumlah'], body: gajiItems });
        if (materialItems.length > 0) sections.push({ sectionTitle: 'Rincian Tagihan Material & Lainnya', headers: ['Penerima', 'Deskripsi', 'Jumlah'], body: materialItems });
        if (pinjamanItems.length > 0) sections.push({ sectionTitle: 'Rincian Cicilan Pinjaman', headers: ['Penerima', 'Deskripsi', 'Jumlah'], body: pinjamanItems });
        
        const summarySection = {
            sectionTitle: 'Ringkasan Alokasi Dana',
            headers: ['Deskripsi', 'Jumlah'],
            body: [ ['Dana Masuk', fmtIDR(danaMasuk)], ['Total Alokasi', fmtIDR(totalAlokasi)] ],
            foot: ['Sisa Dana', fmtIDR(sisaDana)]
        };
        sections.unshift(summarySection);

        generatePdfReport({
            title: 'Laporan Simulasi Alokasi Dana',
            subtitle: `Dibuat pada: ${new Date().toLocaleDateString('id-ID')}`,
            filename: `Simulasi-Alokasi-Dana-${new Date().toISOString().slice(0, 10)}.pdf`,
            sections: sections
        });
    }

    function _prepareSimulasiData() {
        const gajiItems = [], materialItems = [], pinjamanItems = [];
        let totalAlokasi = 0;
        appState.simulasiState.selectedPayments.forEach((amount, id) => {
            const [itemType, itemId] = id.split('-');
            let recipient = 'N/A', description = 'N/A';
            const formattedAmount = fmtIDR(amount);
            totalAlokasi += amount;

            if (itemType === 'bill') {
                const bill = appState.bills.find(b => b.id === itemId);
                if (bill) {
                    description = bill.description;
                    if (bill.type === 'gaji') {
                        recipient = appState.workers.find(w => w.id === bill.workerId)?.workerName || 'Pekerja';
                        gajiItems.push([recipient, description, formattedAmount]);
                    } else {
                        const expense = appState.expenses.find(e => e.id === bill.expenseId);
                        recipient = appState.suppliers.find(s => s.id === expense?.supplierId)?.supplierName || 'Supplier';
                        materialItems.push([recipient, description, formattedAmount]);
                    }
                }
            } else if (itemType === 'loan') {
                const loan = appState.fundingSources.find(l => l.id === itemId);
                if (loan) {
                    recipient = appState.fundingCreditors.find(c => c.id === loan.creditorId)?.creditorName || 'Kreditur';
                    description = 'Cicilan Pinjaman';
                    pinjamanItems.push([recipient, description, formattedAmount]);
                }
            }
        });
        return { gajiItems, materialItems, pinjamanItems, totalAlokasi };
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

// 2. FUNGSI UNTUK MENAMPILKAN MODAL (DENGAN TOMBOL YANG BENAR)
async function handleCetakKwitansi(billId) {
    toast('syncing', 'Mempersiapkan kwitansi...');

    const bill = appState.bills.find(b => b.id === billId);
    if (!bill) { toast('error', 'Data tagihan gaji tidak ditemukan.'); return; }
    const worker = appState.workers.find(w => w.id === bill.workerId);
    if (!worker) { toast('error', 'Data pekerja tidak ditemukan.'); return; }

    const kwitansiData = {
        nomor: `KW-G-${bill.id.substring(0, 5).toUpperCase()}`,
        tanggal: bill.paidAt ? bill.paidAt.toDate().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
        namaPenerima: worker.workerName,
        jumlah: bill.amount,
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

    createModal('dataDetail', { title: 'Pratinjau Kwitansi', content: modalContent });
    hideToast();

    $('#download-kwitansi-img-btn').addEventListener('click', () => {
        _downloadKwitansiAsImage(kwitansiData);
    });
    $('#download-kwitansi-btn').addEventListener('click', () => {
        _downloadKwitansiAsPDF(kwitansiData);
    });
}

// 3. FUNGSI UNTUK UNDUH PDF (DENGAN FIX ANTI-STRETCH)
async function _downloadKwitansiAsPDF(data) {
    toast('syncing', 'Membuat PDF...');
    const kwitansiElement = $('#kwitansi-printable-area');
    if (!kwitansiElement) { toast('error', 'Gagal menemukan elemen kwitansi.'); return; }
    try {
        const canvas = await html2canvas(kwitansiElement, { scale: 3, useCORS: true });
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jspdf.jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a7' });

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

// 4. FUNGSI BARU YANG HILANG UNTUK UNDUH GAMBAR
async function _downloadKwitansiAsImage(data) {
    toast('syncing', 'Membuat gambar kwitansi...');
    const kwitansiElement = $('#kwitansi-printable-area');
    if (!kwitansiElement) { toast('error', 'Gagal menemukan elemen kwitansi.'); return; }
    try {
        const canvas = await html2canvas(kwitansiElement, { scale: 3, useCORS: true, backgroundColor: '#ffffff' });
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
    
    // --- SUB-SEKSI 3.7: FUNGSI CRUD (CREATE, READ, UPDATE, DELETE) ---
    async function handleManageMasterData(type) {
        const config = masterDataConfig[type];
        if (!config) return;

        await Promise.all([
            fetchAndCacheData(config.stateKey, config.collection, config.nameField),
            fetchAndCacheData('professions', professionsCol, 'professionName'),
            fetchAndCacheData('projects', projectsCol, 'projectName')
        ]);

        const getListItemContent = (item, type) => {
            let content = `<span>${item[config.nameField]}</span>`;
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
            <div class="master-data-item" data-id="${item.id}" data-type="${type}">
                ${getListItemContent(item, type)}
                <div class="master-data-item-actions">
                    <button class="btn-icon" data-action="edit-master-item"><span class="material-symbols-outlined">edit</span></button>
                    <button class="btn-icon btn-icon-danger" data-action="delete-master-item"><span class="material-symbols-outlined">delete</span></button>
                </div>
            </div>
        `).join('');

        let formFieldsHTML = `<div class="form-group"><label>Nama ${config.title}</label><input type="text" name="itemName" placeholder="Masukkan nama..." required></div>`;

        if (type === 'staff') {
            const paymentTypeOptions = [ { value: 'fixed_monthly', text: 'Gaji Bulanan Tetap' }, { value: 'per_termin', text: 'Fee per Termin (%)' }, { value: 'fixed_per_termin', text: 'Fee Tetap per Termin' } ];
            formFieldsHTML += `
                ${createMasterDataSelect('paymentType', 'Tipe Pembayaran', paymentTypeOptions, 'fixed_monthly')}
                <div class="form-group" id="staff-salary-group"><label>Gaji Bulanan</label><input type="text" inputmode="numeric" name="salary" placeholder="mis. 5.000.000"></div>
                <div class="form-group hidden" id="staff-fee-percent-group"><label>Persentase Fee (%)</label><input type="number" name="feePercentage" placeholder="mis. 5 untuk 5%"></div>
                <div class="form-group hidden" id="staff-fee-amount-group"><label>Jumlah Fee Tetap</label><input type="text" inputmode="numeric" name="feeAmount" placeholder="mis. 10.000.000"></div>
            `;
        }
        if (type === 'suppliers') {
            const categoryOptions = [ { value: 'Operasional', text: 'Operasional' }, { value: 'Material', text: 'Material' }, { value: 'Lainnya', text: 'Lainnya' }, ];
            formFieldsHTML += createMasterDataSelect('itemCategory', 'Kategori Supplier', categoryOptions);
        }
        if (type === 'projects') {
            const projectTypeOptions = [ { value: 'main_income', text: 'Pemasukan Utama' }, { value: 'internal_expense', text: 'Biaya Internal (Laba Bersih)' } ];
            formFieldsHTML += `<div class="form-group"><label>Anggaran Proyek</label><input type="text" inputmode="numeric" name="budget" placeholder="mis. 100.000.000"></div>${createMasterDataSelect('projectType', 'Jenis Proyek', projectTypeOptions, 'main_income')}`;
        }
        if (type === 'workers') {
            const professionOptions = appState.professions.map(p => ({ value: p.id, text: p.professionName }));
            const projectFieldsHTML = appState.projects.map(p => `<div class="form-group"><label>Upah Harian - ${p.projectName}</label><input type="text" inputmode="numeric" name="project_wage_${p.id}" placeholder="mis. 150.000"></div>`).join('');
            const statusOptions = [ { value: 'active', text: 'Aktif' }, { value: 'inactive', text: 'Tidak Aktif' } ];
            formFieldsHTML += `${createMasterDataSelect('professionId', 'Profesi', professionOptions, '', 'professions')}${createMasterDataSelect('workerStatus', 'Status', statusOptions, 'active')}<h5 class="invoice-section-title">Upah Harian per Proyek</h5>${projectFieldsHTML || '<p class="empty-state-small">Belum ada proyek.</p>'}`;
        }

        const content = `
            <div class="master-data-manager" data-type="${type}">
                <form id="add-master-item-form" data-type="${type}">${formFieldsHTML}<button type="submit" class="btn btn-primary">Tambah</button></form>
                <div class="master-data-list">${appState[config.stateKey].length > 0 ? listHTML : '<p class="empty-state-small">Belum ada data.</p>'}</div>
            </div>
        `;

        const modalEl = createModal('manageMaster', { 
            title: `Kelola ${config.title}`, content,
            onClose: () => {
                const page = appState.activePage;
                if (page === 'pemasukan') renderPemasukanPage();
                else if (page === 'pengeluaran') renderPengeluaranPage();
                else if (page === 'absensi') renderAbsensiPage();
            }
        });

        if (type === 'staff' && modalEl) {
            _attachStaffFormListeners(modalEl);
            $('input[name="feeAmount"]', modalEl)?.addEventListener('input', _formatNumberInput);
            $('input[name="salary"]', modalEl)?.addEventListener('input', _formatNumberInput);
        }
    }

    async function handleAddMasterItem(form) {
        const type = form.dataset.type;
        const config = masterDataConfig[type];
        const itemName = form.elements.itemName.value.trim();
        if (!config || !itemName) return;

        const dataToAdd = { [config.nameField]: itemName, createdAt: serverTimestamp() };
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
        
        toast('syncing', `Menambah ${config.title}...`);
        try {
            const newDocRef = doc(config.collection);
            if (type === 'projects' && dataToAdd.projectType === 'main_income') {
                await runTransaction(db, async (transaction) => {
                    const q = query(projectsCol, where("projectType", "==", "main_income"));
                    const mainProjectsSnap = await getDocs(q); 
                    mainProjectsSnap.forEach(docSnap => {
                        transaction.update(docSnap.ref, { projectType: 'internal_expense' });
                    });
                    transaction.set(newDocRef, dataToAdd);
                });
            } else {
                await setDoc(newDocRef, dataToAdd);
            }
            await _logActivity(`Menambah Master Data: ${config.title}`, { name: itemName });
            toast('success', `${config.title} baru berhasil ditambahkan.`);
            form.reset();
            $$('.custom-select-trigger span:first-child', form).forEach(s => s.textContent = 'Pilih...');
            await handleManageMasterData(type);
        } catch (error) {
            toast('error', `Gagal menambah ${config.title}.`);
            console.error(error);
        }
    }

    function handleEditMasterItem(id, type) {
        const config = masterDataConfig[type];
        if (!config) return;
        const item = appState[config.stateKey].find(i => i.id === id);
        if (!item) {
            toast('error', 'Data tidak ditemukan untuk diedit.');
            return;
        }

        let formFieldsHTML = `<div class="form-group"><label>Nama ${config.title}</label><input type="text" name="itemName" value="${item[config.nameField]}" required></div>`;

        if (type === 'staff') {
            const paymentTypeOptions = [ { value: 'fixed_monthly', text: 'Gaji Bulanan Tetap' }, { value: 'per_termin', text: 'Fee per Termin (%)' }, { value: 'fixed_per_termin', text: 'Fee Tetap per Termin' } ];
            formFieldsHTML += `${createMasterDataSelect('paymentType', 'Tipe Pembayaran', paymentTypeOptions, item.paymentType || 'fixed_monthly')}
                <div class="form-group" id="staff-salary-group"><label>Gaji Bulanan</label><input type="text" inputmode="numeric" name="salary" value="${item.salary ? new Intl.NumberFormat('id-ID').format(item.salary) : ''}"></div>
                <div class="form-group hidden" id="staff-fee-percent-group"><label>Persentase Fee (%)</label><input type="number" name="feePercentage" value="${item.feePercentage || ''}"></div>
                <div class="form-group hidden" id="staff-fee-amount-group"><label>Jumlah Fee Tetap</label><input type="text" inputmode="numeric" name="feeAmount" value="${item.feeAmount ? new Intl.NumberFormat('id-ID').format(item.feeAmount) : ''}"></div>`;
        }
        if (type === 'suppliers') {
            const categoryOptions = [ { value: 'Operasional', text: 'Operasional' }, { value: 'Material', text: 'Material' }, { value: 'Lainnya', text: 'Lainnya' }, ];
            formFieldsHTML += createMasterDataSelect('itemCategory', 'Kategori Supplier', categoryOptions, item.category || 'Operasional');
        }
        if (type === 'projects') {
            const projectTypeOptions = [ { value: 'main_income', text: 'Pemasukan Utama' }, { value: 'internal_expense', text: 'Biaya Internal (Laba Bersih)' } ];
            const budget = item.budget ? new Intl.NumberFormat('id-ID').format(item.budget) : '';
            formFieldsHTML += `<div class="form-group"><label>Anggaran Proyek</label><input type="text" inputmode="numeric" name="budget" placeholder="mis. 100.000.000" value="${budget}"></div>${createMasterDataSelect('projectType', 'Jenis Proyek', projectTypeOptions, item.projectType || 'main_income')}`;
        }
        if (type === 'workers') {
            const professionOptions = appState.professions.map(p => ({ value: p.id, text: p.professionName }));
            const projectFieldsHTML = appState.projects.map(p => {
                const currentWage = item.projectWages?.[p.id] || '';
                return `<div class="form-group"><label>Upah Harian - ${p.projectName}</label><input type="text" inputmode="numeric" name="project_wage_${p.id}" value="${currentWage ? new Intl.NumberFormat('id-ID').format(currentWage) : ''}" placeholder="mis. 150.000"></div>`;
            }).join('');
            const statusOptions = [ { value: 'active', text: 'Aktif' }, { value: 'inactive', text: 'Tidak Aktif' } ];
            formFieldsHTML += `${createMasterDataSelect('professionId', 'Profesi', professionOptions, item.professionId || '', 'professions')}${createMasterDataSelect('workerStatus', 'Status', statusOptions, item.status || 'active')}<h5 class="invoice-section-title">Upah Harian per Proyek</h5>${projectFieldsHTML || '<p class="empty-state-small">Belum ada proyek.</p>'}`;
        }

        const content = `<form id="edit-master-form" data-id="${id}" data-type="${type}">${formFieldsHTML}<button type="submit" class="btn btn-primary">Simpan Perubahan</button></form>`;
        const modalEl = createModal('editMaster', { title: `Edit ${config.title}`, content });
    
        if (type === 'staff' && modalEl) {
            _attachStaffFormListeners(modalEl);
            $('input[name="feeAmount"]', modalEl)?.addEventListener('input', _formatNumberInput);
            $('input[name="salary"]', modalEl)?.addEventListener('input', _formatNumberInput);
        }
    }
    
    async function handleUpdateMasterItem(form) {
        const { id, type } = form.dataset;
        const newName = form.elements.itemName.value.trim();
        const config = masterDataConfig[type];
        if (!config || !newName) return;

        const dataToUpdate = { [config.nameField]: newName };
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

        toast('syncing', `Memperbarui ${config.title}...`);
        try {
            if (type === 'projects' && dataToUpdate.projectType === 'main_income') {
                await runTransaction(db, async (transaction) => {
                    const q = query(projectsCol, where("projectType", "==", "main_income"));
                    const mainProjectsSnap = await getDocs(q);
                    mainProjectsSnap.forEach(docSnap => {
                        if (docSnap.id !== id) transaction.update(docSnap.ref, { projectType: 'internal_expense' });
                    });
                    transaction.update(doc(config.collection, id), dataToUpdate);
                });
            } else {
                await updateDoc(doc(config.collection, id), dataToUpdate);
            }
            await _logActivity(`Memperbarui Master Data: ${config.title}`, { docId: id, newName });
            toast('success', `${config.title} berhasil diperbarui.`);
            await handleManageMasterData(type);
        } catch (error) {
            toast('error', `Gagal memperbarui ${config.title}.`);
            console.error(error);
        }
    }

    async function handleDeleteMasterItem(id, type) {
        const config = masterDataConfig[type];
        if (!config) return;
        const item = appState[config.stateKey].find(i => i.id === id);

        createModal('confirmDelete', { 
            message: `Anda yakin ingin menghapus ${config.title} "${item[config.nameField]}" ini?`,
            onConfirm: async () => {
                toast('syncing', `Menghapus ${config.title}...`);
                try {
                    await deleteDoc(doc(config.collection, id));
                    await _logActivity(`Menghapus Master Data: ${config.title}`, { docId: id, name: item[config.nameField] });
                    toast('success', `${config.title} berhasil dihapus.`);
                    await handleManageMasterData(type);
                } catch (error) {
                    toast('error', `Gagal menghapus ${config.title}.`);
                }
            }
        });
    }

    // --- [BARU] FUNGSI UTILITAS UNTUK DRAF FORM ---
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
        } catch (e) { console.warn('Gagal menyimpan draf', e); }
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
        } catch (e) { console.warn('Gagal memulihkan draf', e); }
    }
    function _clearFormDraft(form) {
        try {
            const key = _getFormDraftKey(form);
            if (key) sessionStorage.removeItem(key);
        } catch (e) { console.warn('Gagal menghapus draf', e); }
    }
    function _attachFormDraftPersistence(form) {
        if (!form) return;
        _restoreFormDraft(form);
        const handler = () => _saveFormDraft(form);
        form.addEventListener('input', handler);
        form.addEventListener('change', handler, true);
        form._clearDraft = () => _clearFormDraft(form);
    }

    // --- FUNGSI CRUD ITEM UTAMA (Pemasukan, Pengeluaran, dll.) ---

    async function handleEditItem(id, type) {
        let item, formHTML = 'Form tidak tersedia.';
        if (type === 'expense') {
            await fetchAndCacheData('expenses', expensesCol); 
            item = appState.expenses.find(i => i.id === id);
        } else if (type === 'termin') item = appState.incomes.find(i => i.id === id);
        else if (type === 'pinjaman') item = appState.fundingSources.find(i => i.id === id);
        else if (type === 'bill') {
            item = appState.bills.find(b => b.id === id);
            if (item && item.expenseId) { type = 'expense'; item = appState.expenses.find(e => e.id === item.expenseId); }
            else if (item && item.type === 'fee') type = 'fee_bill';
        } else return toast('error', 'Tipe data tidak dikenal.');

        if (!item) return toast('error', 'Data tidak ditemukan untuk diedit.');
        
        const date = item.date?.toDate ? item.date.toDate().toISOString().slice(0, 10) : new Date().toISOString().slice(0,10);
        
        if (type === 'termin') {
            const projectOptions = appState.projects.map(p => ({ value: p.id, text: p.projectName }));
            formHTML = `
                <form id="edit-item-form" data-id="${id}" data-type="${type}">
                    <div class="form-group"><label>Jumlah</label><input type="text" inputmode="numeric" name="amount" value="${new Intl.NumberFormat('id-ID').format(item.amount)}" required></div>
                    <div class="form-group"><label>Tanggal</label><input type="date" name="date" value="${date}" required></div>
                    ${createMasterDataSelect('projectId', 'Proyek Terkait', projectOptions, item.projectId, 'projects')}
                    <button type="submit" class="btn btn-primary">Update</button>
                </form>
            `;
        } else if (type === 'pinjaman') {
            const creditorOptions = appState.fundingCreditors.map(c => ({ value: c.id, text: c.creditorName }));
            const loanTypeOptions = [ {value: 'none', text: 'Tanpa Bunga'}, {value: 'interest', text: 'Berbunga'} ];
            formHTML = `
                <form id="edit-item-form" data-id="${id}" data-type="${type}">
                    <div class="form-group"><label>Jumlah</label><input type="text" inputmode="numeric" name="totalAmount" value="${new Intl.NumberFormat('id-ID').format(item.totalAmount)}" required></div>
                    <div class="form-group"><label>Tanggal</label><input type="date" name="date" value="${date}" required></div>
                    ${createMasterDataSelect('creditorId', 'Kreditur', creditorOptions, item.creditorId, 'creditors')}
                    ${createMasterDataSelect('interestType', 'Jenis Pinjaman', loanTypeOptions, item.interestType)}
                    <div class="loan-details ${item.interestType === 'none' ? 'hidden' : ''}">
                        <div class="form-group"><label>Suku Bunga (% per bulan)</label><input type="number" name="rate" value="${item.rate || ''}" step="0.01" min="1"></div>
                        <div class="form-group"><label>Tenor (bulan)</label><input type="number" name="tenor" value="${item.tenor || ''}" min="1"></div>
                    </div>
                    <button type="submit" class="btn btn-primary">Update</button>
                </form>
            `;
        } else if (type === 'expense' && item.type === 'material') {
            formHTML = _getEditFormFakturMaterialHTML(item);
        } else if (type === 'expense') {
            // Logika baru untuk membuat form edit dinamis
            let categoryOptions = [], masterType = '', categoryLabel = '', supplierOptions = [], projectOptions = [];
            
            projectOptions = appState.projects.map(p => ({ value: p.id, text: p.projectName }));
            let categoryType = 'Lainnya'; // Default
            if (item.type === 'operasional') {
                categoryOptions = appState.operationalCategories.map(c => ({ value: c.id, text: c.categoryName }));
                masterType = 'op-cats'; categoryLabel = 'Kategori Operasional'; categoryType = 'Operasional';
            } else if (item.type === 'lainnya') {
                categoryOptions = appState.otherCategories.map(c => ({ value: c.id, text: c.categoryName }));
                masterType = 'other-cats'; categoryLabel = 'Kategori Lainnya'; categoryType = 'Lainnya';
            }
            supplierOptions = appState.suppliers.filter(s => s.category === categoryType).map(s => ({ value: s.id, text: s.supplierName }));
            
            formHTML = `
                <form id="edit-item-form" data-id="${id}" data-type="${type}">
                    <div class="form-group"><label>Jumlah</label><input type="text" name="amount" inputmode="numeric" value="${new Intl.NumberFormat('id-ID').format(item.amount)}" required></div>
                    <div class="form-group"><label>Deskripsi</label><input type="text" name="description" value="${item.description}" required></div>
                    ${masterType ? createMasterDataSelect('categoryId', categoryLabel, categoryOptions, item.categoryId, masterType) : ''}
                    ${createMasterDataSelect('supplier-id', 'Supplier/Penerima', supplierOptions, item.supplierId)}
                    ${createMasterDataSelect('project-id', 'Proyek', projectOptions, item.projectId)}
                    <div class="form-group"><label>Tanggal</label><input type="date" name="date" value="${date}" required></div>
                    <p>Status: <strong>${item.status === 'paid' ? 'Lunas' : 'Tagihan'}</strong>. Status tidak dapat diubah di sini.</p>
                    <button type="submit" class="btn btn-primary">Update</button>
                </form>
            `;
        }
        } else if (type === 'fee_bill') {
            formHTML = `
                <form id="edit-item-form" data-id="${item.id}" data-type="fee_bill">
                    <div class="form-group"><label>Deskripsi</label><input type="text" name="description" value="${item.description}" required></div>
                    <div class="form-group"><label>Jumlah Fee</label><input type="text" inputmode="numeric" name="amount" value="${new Intl.NumberFormat('id-ID').format(item.amount)}" required></div>
                    <p>Mengedit tagihan ini tidak akan mengubah catatan pemasukan asli.</p>
                    <button type="submit" class="btn btn-primary">Update Tagihan Fee</button>
                </form>
            `;
        }
    
        
        const modalEl = createModal('editItem', { title: `Edit Data`, content: formHTML });
        if (type === 'expense' && item.type === 'material') {
            if (modalEl) {
                $('#add-invoice-item-btn', modalEl).addEventListener('click', () => _addInvoiceItemRow(modalEl));
                $('#invoice-items-container', modalEl).addEventListener('input', (e) => _handleInvoiceItemChange(e, modalEl));
                $$('.remove-item-btn', modalEl).forEach(btn => btn.addEventListener('click', (e) => {
                    e.target.closest('.invoice-item-row').remove();
                    _updateInvoiceTotal(modalEl);
                }));
            }
        }
    }
    
    // GANTI SELURUH FUNGSI INI
    async function handleUpdateItem(form) {
        const { id, type } = form.dataset;
        toast('syncing', 'Memperbarui data...');

        try {
            let dataToUpdate = {};
            // Bagian 1: Siapkan data yang akan di-update
            if (type === 'termin') {
                dataToUpdate = { amount: parseFormattedNumber(form.elements.amount.value), date: new Date(form.elements.date.value), projectId: form.elements.projectId.value, };
                await updateDoc(doc(incomesCol, id), dataToUpdate);

            } else if (type === 'pinjaman') {
                dataToUpdate = { totalAmount: parseFormattedNumber(form.elements.totalAmount.value), date: new Date(form.elements.date.value), creditorId: form.elements.creditorId.value, interestType: form.elements.interestType.value };
                if (dataToUpdate.interestType === 'interest') {
                    dataToUpdate.rate = Number(form.elements.rate.value);
                    dataToUpdate.tenor = Number(form.elements.tenor.value);
                    dataToUpdate.totalRepaymentAmount = dataToUpdate.totalAmount * (1 + (dataToUpdate.rate / 100 * dataToUpdate.tenor));
                } else {
                    dataToUpdate.rate = null; dataToUpdate.tenor = null; dataToUpdate.totalRepaymentAmount = null;
                }
                await updateDoc(doc(fundingSourcesCol, id), dataToUpdate);

            } else if (type === 'fee_bill') {
                dataToUpdate = {
                    amount: parseFormattedNumber(form.elements.amount.value),
                    description: form.elements.description.value
                };
                await updateDoc(doc(billsCol, id), dataToUpdate);

            } else if (type === 'expense') {
                const batch = writeBatch(db);
                const expenseRef = doc(expensesCol, id);

                if (form.querySelector('#invoice-items-container')) { // Form Material
                    const items = [];
                    $$('.invoice-item-row', form).forEach(row => {
                        const materialId = row.querySelector('input[name="materialId"]').value;
                        const price = parseFormattedNumber(row.querySelector('input[name="itemPrice"]').value);
                        const qty = Number(row.querySelector('input[name="itemQty"]').value);
                        if (materialId && price > 0 && qty > 0) items.push({ materialId, price, qty, total: price * qty });
                    });
                    
                    if (items.length === 0) {
                        toast('error', 'Faktur harus memiliki minimal satu barang.');
                        return;
                    }

                    dataToUpdate = {
                        projectId: form.elements['project-id'].value,
                        supplierId: form.elements['supplier-id'].value,
                        description: form.elements.description.value,
                        date: new Date(form.elements.date.value),
                        items: items,
                        amount: items.reduce((sum, item) => sum + item.total, 0)
                    };
                } else { // Form Operasional/Lainnya
                    dataToUpdate = {
                        amount: parseFormattedNumber(form.elements.amount.value),
                        description: form.elements.description.value,
                        date: new Date(form.elements.date.value),
                        categoryId: form.elements.categoryId?.value || '',
                        supplierId: form.elements['supplier-id']?.value || '',
                        projectId: form.elements['project-id']?.value || ''
                    };
                }

                batch.update(expenseRef, dataToUpdate);
                
                const q = query(billsCol, where("expenseId", "==", id));
                const billSnap = await getDocs(q);
                if (!billSnap.empty) {
                    const billRef = billSnap.docs[0].ref;
                    batch.update(billRef, { 
                        amount: dataToUpdate.amount, 
                        description: dataToUpdate.description, 
                        dueDate: dataToUpdate.date 
                    });
                }
                await batch.commit();
            } else {
                // Jika tipe tidak dikenali, hentikan fungsi
                return;
            }
            
            await _logActivity(`Memperbarui Data: ${type}`, { docId: id });
            toast('success', 'Data berhasil diperbarui.');
            
            // Tutup semua modal yang mungkin terbuka
            closeModal($('#editItem-modal'));
            closeModal($('#confirmEdit-modal'));
            
            // Refresh halaman yang relevan
            if (appState.activePage === 'tagihan') renderTagihanPage();

        } catch (error) {
            toast('error', 'Gagal memperbarui data.');
            console.error('Update error:', error);
        }
    }
    async function handleDeleteItem(id, type) {
        createModal('confirmDelete', { 
            onConfirm: async () => {
                toast('syncing', 'Menghapus data...');
                try {
                    let col, item;
                    if(type === 'termin') { col = incomesCol; item = appState.incomes.find(i=>i.id===id); }
                    else if (type === 'pinjaman') { col = fundingSourcesCol; item = appState.fundingSources.find(i=>i.id===id); }
                    else if (type === 'expense') { col = expensesCol; item = appState.expenses.find(i=>i.id===id); }
                    else if (type === 'bill') { col = billsCol; item = appState.bills.find(i=>i.id===id); }
                    else return;
                    
                    if (type === 'bill' && item && item.type === 'gaji') {
                        const recordIds = item.recordIds || [];
                        if (recordIds.length > 0) {
                            const batch = writeBatch(db);
                            recordIds.forEach(recordId => {
                                batch.update(doc(attendanceRecordsCol, recordId), { isPaid: false, billId: null });
                            });
                            await batch.commit();
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
                    
                    await _logActivity(`Menghapus Data ${type}`, { docId: id, description: item?.description || item?.amount });
                    toast('success', 'Data berhasil dihapus.');
                    
                    if (appState.activePage === 'pemasukan') _rerenderPemasukanList(appState.activeSubPage.get('pemasukan'));
                    if (appState.activePage === 'pengeluaran') renderPengeluaranPage();
                    if (appState.activePage === 'tagihan') renderTagihanPage();
                    if (appState.activePage === 'jurnal') renderJurnalPage();
                } catch (error) {
                    toast('error', 'Gagal menghapus data.');
                    console.error('Delete error:', error);
                }
            }
        });
    }
        async function handleManageUsers() {
            toast('syncing', 'Memuat data pengguna...');
            try {
                const pendingQuery = query(membersCol, where("status", "==", "pending"));
                const pendingSnap = await getDocs(pendingQuery);
                const pendingUsers = pendingSnap.docs.map(d => ({ id: d.id, ...d.data() }));

                const otherUsersQuery = query(membersCol, where("status", "!=", "pending"));
                const otherUsersSnap = await getDocs(otherUsersQuery);
                const otherUsers = otherUsersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

                appState.users = [...pendingUsers, ...otherUsers];

                const createUserHTML = (user) => {
                    const userRole = user.role || 'viewer';
                    const userStatus = user.status || 'pending';
                    return `
                    <div class="master-data-item">
                        <div class="user-info-container">
                            <strong>${user.name}</strong>
                            <span class="user-email">${user.email}</span>
                            <div class="user-badges">
                                <span class="user-badge role-${userRole.toLowerCase()}">${userRole}</span>
                                <span class="user-badge status-${userStatus.toLowerCase()}">${userStatus}</span>
                            </div>
                        </div>
                        <div class="master-data-item-actions">
                            ${user.status === 'pending' ? `
                                <button class="btn-icon btn-icon-success" data-action="user-action" data-id="${user.id}" data-type="approve" title="Setujui"><span class="material-symbols-outlined">check_circle</span></button>
                                <button class="btn-icon btn-icon-danger" data-action="user-action" data-id="${user.id}" data-type="delete" title="Tolak/Hapus"><span class="material-symbols-outlined">cancel</span></button>
                            ` : ''}
                            ${user.status === 'active' && user.role !== 'Owner' ? `
                                ${user.role !== 'Editor' ? `<button class="btn-icon" data-action="user-action" data-id="${user.id}" data-type="make-editor" title="Jadikan Editor"><span class="material-symbols-outlined">edit_note</span></button>`:''}
                                ${user.role !== 'Viewer' ? `<button class="btn-icon" data-action="user-action" data-id="${user.id}" data-type="make-viewer" title="Jadikan Viewer"><span class="material-symbols-outlined">visibility</span></button>`:''}
                                <button class="btn-icon btn-icon-danger" data-action="user-action" data-id="${user.id}" data-type="delete" title="Hapus"><span class="material-symbols-outlined">delete</span></button>
                            `: ''}
                        </div>
                    </div>`;
                };
            
                const pendingUsersHTML = pendingUsers.length > 0
                    ? `<h5 class="detail-section-title" style="margin-top: 0;">Menunggu Persetujuan</h5>${pendingUsers.map(createUserHTML).join('')}`
                    : '';
    
        const otherUsersSorted = otherUsers.sort((a, b) => (a.role === 'Owner' ? -1 : 1));
        const otherUsersHTML = otherUsers.length > 0
            ? `<h5 class="detail-section-title" style="${pendingUsers.length > 0 ? '' : 'margin-top: 0;'}">Pengguna Terdaftar</h5>${otherUsersSorted.map(createUserHTML).join('')}`
            : '';
    
        const noUsersHTML = appState.users.length === 0 ? '<p class="empty-state-small">Tidak ada pengguna lain.</p>' : '';
    
        createModal('manageUsers', {
            title: 'Manajemen Pengguna',
            content: `
                <div class="master-data-list">
                    ${noUsersHTML}
                    ${pendingUsersHTML}
                    ${otherUsersHTML}
                </div>
            `
        });
        toast('success', 'Data pengguna dimuat.');

    } catch (e) {
        console.error("Gagal mengambil data pengguna:", e);
        toast('error', 'Gagal memuat data pengguna.');
        return;
    }
}

    async function handleUserAction(dataset) {
        const { id, type } = dataset;
        const user = appState.users.find(u => u.id === id);
        if (!user) return;
        
        const actionMap = {
            'approve': { message: `Setujui <strong>${user.name}</strong> sebagai Viewer?`, data: { status: 'active', role: 'Viewer' } },
            'make-editor': { message: `Ubah peran <strong>${user.name}</strong> menjadi Editor?`, data: { role: 'Editor' } },
            'make-viewer': { message: `Ubah peran <strong>${user.name}</strong> menjadi Viewer?`, data: { role: 'Viewer' } },
            'delete': { message: `Hapus atau tolak pengguna <strong>${user.name}</strong>? Aksi ini tidak dapat dibatalkan.`, data: null }
        };

        const action = actionMap[type];
        if (!action) return;

        createModal('confirmUserAction', {
            message: action.message,
            onConfirm: async () => {
                toast('syncing', 'Memproses...');
                try {
                    const userRef = doc(membersCol, id);
                    if (type === 'delete') {
                        await deleteDoc(userRef);
                    } else {
                        await updateDoc(userRef, action.data);
                    }
                    await _logActivity(`Aksi Pengguna: ${type}`, { targetUserId: id, targetUserName: user.name });
                    toast('success', 'Aksi berhasil dilakukan.');
                    handleManageUsers();
                } catch (error) {
                    toast('error', 'Gagal memproses aksi.');
                    console.error('User action error:', error);
                }
            }
        });
    }
    // Definisikan referensi dokumen untuk pengaturan di dekat referensi koleksi lainnya
    const settingsDocRef = doc(db, 'teams', TEAM_ID, 'settings', 'pdf');

    async function handleEditPdfSettings() {
        toast('syncing', 'Memuat pengaturan...');
        let currentSettings = {};
        try {
            const docSnap = await getDoc(settingsDocRef);
            if (docSnap.exists()) {
                currentSettings = docSnap.data();
            }
            hideToast();
        } catch (e) {
            toast('error', 'Gagal memuat pengaturan.');
            console.error("Gagal memuat pengaturan PDF:", e);
        }

        // Definisikan nilai default jika pengaturan belum ada
        const companyName = currentSettings.companyName || 'CV. ALAM BERKAH ABADI';
        const logoUrl = currentSettings.logoUrl || 'https://i.ibb.co/mRp1s1W/logo-cv-aba.png';
        const headerColor = currentSettings.headerColor || '#26a69a';

        // Buat konten HTML untuk modal form
        const content = `
            <form id="pdf-settings-form">
                <p>Ubah detail yang akan muncul di header semua laporan PDF.</p>
                <div class="form-group">
                    <label>Nama Perusahaan</label>
                    <input type="text" name="companyName" value="${companyName}" required>
                </div>
                <div class="form-group">
                    <label>URL Logo (PNG/JPG)</label>
                    <input type="url" name="logoUrl" value="${logoUrl}" placeholder="https://contoh.com/logo.png">
                </div>
                <div class="form-group">
                    <label>Warna Header Tabel</label>
                    <input type="color" name="headerColor" value="${headerColor}" style="width: 100%; height: 40px;">
                </div>
                <div class="modal-footer" style="margin-top: 1.5rem;">
                    <button type="submit" class="btn btn-primary">Simpan Pengaturan</button>
                </div>
            </form>
        `;

        const modal = createModal('dataDetail', { title: 'Pengaturan Laporan PDF', content });

        // Tambahkan listener untuk menyimpan form
        $('#pdf-settings-form', modal).addEventListener('submit', async (e) => {
            e.preventDefault();
            toast('syncing', 'Menyimpan pengaturan...');
            const form = e.target;
            const newSettings = {
                companyName: form.elements.companyName.value.trim(),
                logoUrl: form.elements.logoUrl.value.trim(),
                headerColor: form.elements.headerColor.value,
            };

            try {
                await setDoc(settingsDocRef, newSettings);
                appState.pdfSettings = newSettings; // Update cache di state
                toast('success', 'Pengaturan PDF berhasil disimpan.');
                closeModal(modal);
            } catch (error) {
                toast('error', 'Gagal menyimpan pengaturan.');
                console.error(error);
            }
        });
    }

    // =======================================================
    //          [URUTAN DIPINDAH] SEKSI 4: MANAJEMEN NAVIGASI & UI
    // =======================================================

    function renderUI() {
        const header = document.querySelector('.main-header');
        const bottomNav = $('#bottom-nav');

        if (!appState.currentUser) {
            if (header) header.style.display = 'none';
            if (bottomNav) bottomNav.style.display = 'none';
            renderGuestLanding();
            return;
        } 
        
        if (header) header.style.display = '';
        if (bottomNav) bottomNav.style.display = 'flex';

        updateHeaderTitle();
        renderBottomNav();
        updateNavActiveState();

        if (appState.userStatus !== 'active') {
            renderPendingLanding();
            return;
        }
        renderPageContent();
    }

    function updateHeaderTitle() {
        const pageTitleEl = $('#page-label-name');
        if (!pageTitleEl) return;
        const currentPageLink = ALL_NAV_LINKS.find(link => link.id === appState.activePage);
        pageTitleEl.textContent = currentPageLink ? currentPageLink.label : 'Halaman';
    }
    
    function handleNavigation(pageId) {
        if (!pageId || appState.activePage === pageId) return;
        appState.activePage = pageId;
        localStorage.setItem('lastActivePage', pageId);
        renderUI();
    }
    
    function renderBottomNav() {
        const nav = $('#bottom-nav');
        if (!nav || appState.userStatus !== 'active') { if(nav) nav.innerHTML = ''; return; }

        let navIdsToShow = [];
        if (appState.userRole === 'Owner') navIdsToShow = ['dashboard', 'pemasukan', 'pengeluaran', 'absensi', 'pengaturan'];
        else if (appState.userRole === 'Editor') navIdsToShow = ['dashboard', 'pengeluaran', 'absensi', 'tagihan', 'pengaturan'];
        else if (appState.userRole === 'Viewer') navIdsToShow = ['dashboard', 'stok', 'tagihan', 'laporan', 'pengaturan'];
        
        const accessibleLinks = ALL_NAV_LINKS.filter(link => navIdsToShow.includes(link.id));
        
        nav.innerHTML = accessibleLinks.map(item => `
            <button class="nav-item" data-action="navigate" data-nav="${item.id}" aria-label="${item.label}">
                ${item.id === 'pengaturan' && appState.userRole === 'Owner' && appState.pendingUsersCount > 0 ? `<span class="notification-badge">${appState.pendingUsersCount}</span>` : ''}
                <span class="material-symbols-outlined">${item.icon}</span>
                <span class="nav-text">${item.label}</span>
            </button>
        `).join('');
        updateNavActiveState();
    }

    function updateNavActiveState() {
        $$('.nav-item').forEach(item => item.classList.remove('active'));
        $(`.nav-item[data-nav="${appState.activePage}"]`)?.classList.add('active');
    }

    function renderGuestLanding() {
        const container = $('.page-container');
        container.innerHTML = `
            <div class="card card-pad" style="max-width:520px;margin:3rem auto;text-align:center;">
                <img src="logo-main.png" alt="BanPlex" style="width:120px;height:auto;margin-bottom:1rem;" />
                <p style="margin:.5rem 0 1rem 0">Masuk untuk melanjutkan.</p>
                <button id="google-login-btn" class="btn btn-primary" data-action="auth-action" style="display:inline-flex;align-items:center;gap:.5rem;">
                    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12 s5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C33.109,6.053,28.805,4,24,4C12.955,4,4,12.955,4,24 s8.955,20,20,20s20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"/><path fill="#FF3D00" d="M6.306,14.691l6.571,4.817C14.655,16.108,18.961,13,24,13c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657 C33.109,6.053,28.805,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"/><path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.191-5.238C29.211,35.091,26.715,36,24,36 c-5.202,0-9.619-3.317-11.283-7.957l-6.522,5.025C9.505,39.556,16.227,44,24,44z"/><path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.793,2.239-2.231,4.166-4.094,5.57 c0.001-0.001,0.002-0.001,0.003-0.002l6.191,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"/></svg>
                    <span>Masuk dengan Google</span>
                </button>
            </div>`;
    }
    
    function renderPendingLanding() {
        $('#bottom-nav').innerHTML = '';
        $('.page-container').innerHTML = `<div class="card card-pad" style="max-width:520px;margin:2rem auto;text-align:center;"><h4>Menunggu Persetujuan</h4><p>Akun Anda sedang ditinjau oleh Owner. Silakan hubungi Owner untuk persetujuan.</p></div>`;
    }
    
    async function renderPageContent() {
        const pageId = appState.activePage;
        const container = $('.page-container');
        const pageRenderers = {
            'dashboard': renderDashboardPage,
            'simulasi': renderSimulasiBayarPage,
            'pengaturan': renderPengaturanPage,
            'pemasukan': renderPemasukanPage,
            'pengeluaran': renderPengeluaranPage,
            'tagihan': renderTagihanPage,
            'stok': renderStokPage,
            'laporan': renderLaporanPage,
            'absensi': renderAbsensiPage,
            'jurnal': renderJurnalPage,
            'log_aktivitas': renderLogAktivitasPage,
        };
        
        container.innerHTML = `<div class="loader-container"><div class="spinner"></div></div>`;
        const renderer = pageRenderers[pageId];
        if (renderer) {
            await renderer();
        } else {
            container.innerHTML = `<div class="card card-pad">Halaman <strong>${pageId}</strong> dalam pengembangan.</div>`;
        }
    }
    async function syncOfflineData() {
        if (appState.isSyncing || !appState.isOnline) return;

        const offlineItems = await offlineDB.offlineQueue.toArray();
        if (offlineItems.length === 0) {
            hideToast();
            return;
        }

        appState.isSyncing = true;
        toast('syncing', `Menyinkronkan ${offlineItems.length} data...`);
        let successCount = 0;

        for (const item of offlineItems) {
            try {
                if (item.type === 'add-expense') {
                    // Catatan: File yang dipilih saat offline tidak akan ikut tersinkronisasi
                    // Ini adalah kompromi agar fitur online berjalan sempurna terlebih dahulu.
                    item.payload.invoiceUrl = '';
                    item.payload.deliveryOrderUrl = '';
                    
                    const expenseDocRef = await addDoc(expensesCol, item.payload);
                    const status = item.payload.status || 'unpaid';
                    
                    await addDoc(billsCol, {
                        expenseId: expenseDocRef.id, description: item.payload.description,
                        amount: item.payload.amount, paidAmount: status === 'paid' ? item.payload.amount : 0,
                        dueDate: item.payload.date, status: status, type: item.payload.type,
                        projectId: item.payload.projectId, createdAt: serverTimestamp(),
                        ...(status === 'paid' && { paidAt: serverTimestamp() })
                    });
                }

                await offlineDB.offlineQueue.delete(item.id);
                successCount++;
            } catch (error) {
                console.error('Gagal menyinkronkan item:', item, error);
            }
        }
        
        appState.isSyncing = false;
        if (successCount > 0) {
            toast('success', `${successCount} data berhasil disinkronkan.`);
            renderPageContent();
        } else if (offlineItems.length > 0) {
            toast('error', 'Gagal menyinkronkan beberapa data.');
        } else {
            hideToast();
        }
    }
    // =======================================================
    //          SEKSI 5: INISIALISASI UTAMA & EVENT LISTENER
    // =======================================================
    function init() {
        window.addEventListener('online', () => { appState.isOnline = true; toast('info', 'Kembali online'); });
        window.addEventListener('offline', () => { appState.isOnline = false; toast('info', 'Anda sedang offline', 999999); });

        document.body.addEventListener('click', (e) => {
            const actionTarget = e.target.closest('[data-action]');
            if (!actionTarget) return;

            if (!e.target.closest('.custom-select-wrapper') && !e.target.closest('.actions-menu')) {
                $$('.custom-select-wrapper').forEach(w => w.classList.remove('active'));
                closeModal($('#actionsMenu-modal'));
            }

            const card = actionTarget.closest('[data-id]');
            const { id, type, nav, expenseId } = { ...card?.dataset, ...actionTarget.dataset };

        switch (actionTarget.dataset.action) {
                    case 'cetak-kwitansi': {
            if (isViewer()) return;
            handleCetakKwitansi(actionTarget.dataset.id);
            break;
        }
            
            case 'view-jurnal-harian': {
                const dateStr = actionTarget.closest('[data-date]').dataset.date;
                if (dateStr) {
                    handleViewJurnalHarianModal(dateStr); // Panggil fungsi modal
                }
                break;
            }
            case 'edit-surat-jalan': if (!isViewer()) handleEditSuratJalanModal(id); break;
            case 'trigger-file-input': {
                const targetName = actionTarget.dataset.target;
                const input = $(`input[name="${targetName}"]`);
                if (input) input.click();
                break;
            }
            case 'open-report-generator':
                handleGenerateReportModal();
                break;
            case 'fix-stuck-attendance':
                if (isViewer()) return;
                handleFixStuckAttendanceModal();
                break;
                case 'edit-pdf-settings': if (!isViewer()) handleEditPdfSettings(); break;
            case 'toggle-more-actions':
                $('#quick-actions-grid')?.classList.toggle('actions-collapsed');
                break;
            case 'view-invoice-items': {
                const expense = appState.expenses.find(e => e.id === id);
                if (expense && expense.items) {
                    createModal('invoiceItemsDetail', { items: expense.items, totalAmount: expense.amount });
                } else {
                    toast('error', 'Rincian item tidak ditemukan.');
                }
                break;
            }
            case 'delete-single-attendance':
                if (isViewer()) return;
                handleDeleteSingleAttendance(actionTarget.dataset.id);
                break;
            
            case 'open-recap-actions': {
                if (isViewer()) return;
                const billId = actionTarget.dataset.id;
                const bill = appState.bills.find(b => b.id === billId);
                if (!bill) return;

                const actions = [];
                actions.push({ label: 'Lihat Detail', action: 'open-bill-detail', icon: 'visibility', id: billId, type: 'bill' });
                actions.push({ label: 'Batalkan Rekap', action: 'delete-salary-bill', icon: 'delete_forever', id: billId });

                createModal('actionsMenu', { actions, targetRect: actionTarget.getBoundingClientRect() });
                break;
            }

            case 'delete-salary-bill': {
                if (isViewer()) return;
                handleDeleteSalaryBill(actionTarget.dataset.id);
                closeModal($('#actionsMenu-modal'));
                break;
            }
            
            case 'trigger-file-input': {
                const targetName = actionTarget.dataset.target;
                const input = $(`input[name="${targetName}"]`);
                if (input) input.click();
                break;
            }
            case 'view-attachment': createModal('imageView', { src: actionTarget.dataset.src }); break;
            case 'navigate': handleNavigation(nav); break;
            case 'auth-action': createModal(appState.currentUser ? 'confirmLogout' : 'login'); break;
            case 'open-detail': {
                if (!card) return; e.preventDefault();
                const sourceList = (type === 'termin') ? appState.incomes : appState.fundingSources;
                const item = sourceList.find(i => i.id === id);
                if (item) {
                    const content = _createDetailContentHTML(item, type);
                    createModal('dataDetail', { title: `Detail ${type === 'termin' ? 'Termin' : 'Pinjaman'}`, content });
                }
                break;
            }
            case 'delete-item': 
                if (isViewer()) return; 
                closeModal($('#billActionsModal-modal'));
                handleDeleteItem(expenseId || id, type); 
                break;
            case 'edit-item': 
                if (isViewer()) return; 
                closeModal($('#billActionsModal-modal'));
                handleEditItem(expenseId || id, type === 'bill' ? 'expense' : type); 
                break;
            case 'pay-bill': 
                if (isViewer()) return; 
                closeModal($('#billActionsModal-modal'));
                if (id) handlePayBillModal(id); 
                break;
            case 'open-bill-detail': 
                if(card) { e.preventDefault(); }
                closeModal($('#billActionsModal-modal'));
                handleOpenBillDetail(id, expenseId); 
                break;
            // Di dalam fungsi init(), ganti case ini
            case 'open-bill-actions-modal': {
                if (isViewer()) { 
                    handleOpenBillDetail(id, expenseId);
                    return; 
                }
                const bill = appState.bills.find(b => b.id === id);
                if (!bill) {
                    // Cek jika ini adalah Surat Jalan (yang sebenarnya adalah expense, bukan bill)
                    const expense = appState.expenses.find(e => e.id === expenseId);
                    if (expense && expense.status === 'delivery_order') {
                        const suratJalanActions = [
                            { label: 'Input Harga & Buat Tagihan', action: 'edit-surat-jalan', icon: 'edit_note', id: expenseId },
                            { label: 'Lihat Detail', action: 'open-bill-detail', icon: 'visibility', id: null, expenseId },
                            { label: 'Hapus Surat Jalan', action: 'delete-item', icon: 'delete', id: expenseId, type: 'expense' }
                        ];
                        createModal('billActionsModal', { bill: { description: expense.description, amount: 0 }, actions: suratJalanActions });
                    } else {
                        toast('error', 'Data tagihan tidak ditemukan.');
                    }
                    return;
                }

                const actions = [
                    { label: 'Lihat Detail Lengkap', action: 'open-bill-detail', icon: 'visibility', id, type: 'bill', expenseId }
                ];

                if (bill.status === 'unpaid') {
                    actions.push({ label: 'Bayar Cicilan', action: 'pay-bill', icon: 'payment', id, type: 'bill' });
                }
                
                // Jika tagihan ini berasal dari pengeluaran, tambahkan opsi Edit & Hapus
                if (bill.expenseId) { 
                    actions.push({ label: 'Edit Pengeluaran', action: 'edit-item', icon: 'edit', id: bill.expenseId, type: 'expense' });
                    actions.push({ label: 'Hapus Pengeluaran', action: 'delete-item', icon: 'delete', id: bill.expenseId, type: 'expense' });
                } else if (['gaji', 'fee'].includes(bill.type)) {
                    actions.push({ label: 'Hapus Tagihan', action: 'delete-item', icon: 'delete', id: bill.id, type: 'bill' });
                }

                createModal('billActionsModal', { bill, actions });
                break;
            }
            case 'open-actions': {
                if (isViewer()) return; e.preventDefault();
                let actions = [];
                if (type === 'bill') {
                    const bill = appState.bills.find(b => b.id === id);
                    if (!bill) return;
                    if (bill.status === 'unpaid') actions.push({ label: 'Bayar Cicilan', action: 'pay-bill', icon: 'payment', id, type });
                    if (bill.expenseId) {
                        actions.push({ label: 'Edit', action: 'edit-item', icon: 'edit', id: bill.expenseId, type: 'expense' });
                        actions.push({ label: 'Hapus', action: 'delete-item', icon: 'delete', id: bill.expenseId, type: 'expense' });
                    } else if (bill.type === 'gaji') {
                        actions.push({ label: 'Hapus Tagihan', action: 'delete-item', icon: 'delete', id: bill.id, type: 'bill' });
                    }
                } else if (type === 'expense') {
                     actions = [{ label: 'Edit', action: 'edit-item', icon: 'edit', id, type }, { label: 'Hapus', action: 'delete-item', icon: 'delete', id, type }];
                } else {
                    const list = type === 'termin' ? appState.incomes : appState.fundingSources;
                    const item = list.find(i => i.id === id);
                    if (!item) return;
                    actions = [{ label: 'Edit', action: 'edit-item', icon: 'edit', id, type }, { label: 'Hapus', action: 'delete-item', icon: 'delete', id, type }];
                    const isPaid = item.status === 'paid' || ((item.totalRepaymentAmount || item.totalAmount) - (item.paidAmount || 0)) <= 0;
                    if (type === 'pinjaman' && !isPaid) actions.unshift({ label: 'Bayar', action: 'pay-item', icon: 'payment', id, type });
                }
                createModal('actionsMenu', { actions, targetRect: actionTarget.getBoundingClientRect() });
                break;
            }
            case 'pay-item': if (isViewer()) return; if (id && type) handlePaymentModal(id, type); break;
            case 'manage-master': if (isViewer()) return; handleManageMasterData(actionTarget.dataset.type); break;
            case 'manage-master-global':
                 if (isViewer()) return;
                 createModal('dataDetail', { title: 'Pilih Master Data', content: `<div class="settings-list">${Object.entries(masterDataConfig).filter(([key]) => key !== 'projects' && key !== 'clients').map(([key, config]) => `<div class="settings-list-item" data-action="manage-master" data-type="${key}"><div class="icon-wrapper"><span class="material-symbols-outlined">database</span></div><span class="label">${config.title}</span></div>`).join('')}</div>`});
                break;
            case 'manage-materials':
                toast('info', 'Fitur Kelola Master Material sedang dikembangkan.');
                break;
            case 'stok-in':
                handleStokInModal(actionTarget.dataset.id);
                break;
            case 'stok-out':
                handleStokOutModal(actionTarget.dataset.id);
                break;
            case 'edit-master-item': if (isViewer()) return; handleEditMasterItem(id, type); break;
            case 'delete-master-item': if (isViewer()) return; handleDeleteMasterItem(id, type); break;
            case 'check-in': if (isViewer()) return; handleCheckIn(actionTarget.dataset.id); break;
            case 'check-out': if (isViewer()) return; handleCheckOut(actionTarget.dataset.id); break;
            case 'edit-attendance':
                if (isViewer()) return;
                handleEditManualAttendanceModal(actionTarget.dataset.id); 
                break;
            case 'generate-salary-bill': 
                if (isViewer()) return; 
                handleGenerateSalaryBill(actionTarget.dataset); 
                break;
            case 'delete-recap-item': if (isViewer()) return; handleDeleteRecapItem(actionTarget.dataset.recordIds); break;
            case 'view-worker-recap': handleViewWorkerRecap(actionTarget.dataset); break;
            case 'manage-users': if (isViewer()) return; handleManageUsers(); break;
            case 'user-action': if (isViewer()) return; handleUserAction(actionTarget.dataset); break;
            case 'upload-attachment': if (isViewer()) return; handleUploadAttachment(actionTarget.dataset); break;
            case 'download-attachment': _downloadAttachment(actionTarget.dataset.url, actionTarget.dataset.filename); break;
            case 'delete-attachment': if(isViewer()) return; handleDeleteAttachment(actionTarget.dataset); break;
            case 'download-report': {
                const reportType = actionTarget.dataset.reportType || 'rekapan';
                _handleDownloadReport('pdf', reportType); 
                break;
            }
            case 'download-csv': {
                const reportType = actionTarget.dataset.reportType || 'rekapan';
                _handleDownloadReport('csv', reportType);
                break;
            }
            }
});
    window.addEventListener('online', () => { appState.isOnline = true; toast('online', 'Kembali online'); syncOfflineData(); });
    window.addEventListener('offline', () => { appState.isOnline = false; toast('offline', 'Anda sedang offline'); });
    if (!navigator.onLine) toast('offline', 'Anda sedang offline');
    
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./service-worker.js').then(registration => {
                console.log('ServiceWorker registration successful');
                registration.onupdatefound = () => {
                    const installingWorker = registration.installing;
                    if (installingWorker == null) return;
                    installingWorker.onstatechange = () => {
                        if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            const updateNotif = document.getElementById('update-notification');
                            const reloadBtn = document.getElementById('reload-app-btn');
                            const triggerUpdate = () => {
                                sessionStorage.setItem('appJustUpdated', 'true');
                                installingWorker.postMessage({ action: 'skipWaiting' });
                            };
                            if (updateNotif && reloadBtn) {
                                updateNotif.classList.add('show');
                                reloadBtn.addEventListener('click', triggerUpdate, { once: true });
                                document.addEventListener('visibilitychange', () => {
                                    if (document.visibilityState === 'hidden') triggerUpdate();
                                }, { once: true });
                            }
                        }
                    };
                };
            }).catch(error => console.log('ServiceWorker registration failed: ', error));

            let refreshing;
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (refreshing) return;
                if (sessionStorage.getItem('appJustUpdated') === 'true') {
                     toast('syncing', 'Memperbarui aplikasi...');
                }
                window.location.reload();
                refreshing = true;
            });
        });
    }
}

    // =======================================================
    //          SEKSI 12: MEMULAI APLIKASI
    // =======================================================
    init();
}

main();

