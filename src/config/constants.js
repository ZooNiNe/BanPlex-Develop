export const firebaseConfig = {
    apiKey: "AIzaSyASl6YAgFYQ23lz-BtAIGCyiu0G3YiFmMk",
    authDomain: "banplex-co.firebaseapp.com",
    projectId: "banplex-co",
    storageBucket: "banplex-co.firebasestorage.app",
    messagingSenderId: "45113950453",
    appId: "1:45113950453:web:3ef688c75a7054c51605bc"
};

export const TEAM_ID = 'main';
export const OWNER_EMAIL = 'dq060412@gmail.com';

export const ALL_NAV_LINKS = [{
    id: 'dashboard',
    icon: 'dashboard',
    label: 'Dashboard',
    roles: ['Owner', 'Editor', 'Viewer']
}, {
    id: 'pemasukan',
    icon: 'account_balance_wallet',
    label: 'Pemasukan',
    roles: ['Owner']
}, {
    id: 'pengeluaran',
    icon: 'post_add',
    label: 'Pengeluaran',
    roles: ['Owner', 'Editor']
}, {
    id: 'absensi',
    icon: 'person_check',
    label: 'Absensi',
    roles: ['Owner', 'Editor']
}, {
    id: 'jurnal',
    icon: 'summarize',
    label: 'Jurnal',
    roles: ['Owner', 'Editor', 'Viewer']
}, {
    id: 'stok',
    icon: 'inventory_2',
    label: 'Stok',
    roles: ['Owner', 'Editor', 'Viewer']
}, {
    id: 'tagihan',
    icon: 'receipt_long',
    label: 'Tagihan',
    roles: ['Owner', 'Editor', 'Viewer']
}, {
    id: 'laporan',
    icon: 'monitoring',
    label: 'Laporan',
    roles: ['Owner', 'Viewer']
}, {
    id: 'simulasi',
    icon: 'payments',
    label: 'Simulasi Bayar',
    roles: ['Owner']
}, {
    id: 'pengaturan',
    icon: 'settings',
    label: 'Pengaturan',
    roles: ['Owner', 'Editor', 'Viewer']
}, ];

export const BOTTOM_NAV_BY_ROLE = {
    Owner: ['dashboard', 'pengeluaran', 'tagihan', 'absensi', 'pengaturan'],
    Editor: ['dashboard', 'pengeluaran', 'absensi', 'tagihan', 'pengaturan'],
    Viewer: ['dashboard', 'laporan', 'tagihan', 'stok', 'pengaturan']
};