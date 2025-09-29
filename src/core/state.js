export const appState = {
    currentUser: null,
    userRole: 'Guest',
    userStatus: null,
    justLoggedIn: false,
    pendingUsersCount: 0,
    activePage: localStorage.getItem('lastActivePage') || 'dashboard',
    activeSubPage: new Map(),
    isOnline: navigator.onLine,
    isSyncing: false,
    comments: [],
    projects: [],
    clients: [],
    fundingCreditors: [],
    operationalCategories: [],
    materialCategories: [],
    otherCategories: [],
    suppliers: [],
    workers: [],
    professions: [],
    incomes: [],
    fundingSources: [],
    expenses: [],
    bills: [],
    attendance: new Map(),
    users: [],
    materials: [],
    stockTransactions: [],
    attendanceRecords: [],
    staff: [],
    tagihan: {
        currentList: [], // Untuk menyimpan daftar tagihan yang ditampilkan
    },
    selectionMode: {
        active: false,
        selectedIds: new Set(),
        pageContext: ''
    },
    billsFilter: {
        searchTerm: '',
        projectId: 'all',
        supplierId: 'all',
        sortBy: 'dueDate',
        sortDirection: 'desc',
        category: 'all'
    },
    pagination: {
        bills: {
            lastVisible: null,
            isLoading: false,
            hasMore: true
        }
    },
    dashboardTotals: {
        labaBersih: 0,
        totalUnpaid: 0,
    },
    pdfSettings: null,
    simulasiState: {
        selectedPayments: new Map()
    },
    activeListeners: new Map(),
};