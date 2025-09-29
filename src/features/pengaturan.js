import { appState } from '../core/state.js';
import { $ } from '../utils/helpers.js';
import { createModal } from '../ui/modals.js';
import { toast } from '../ui/toast.js';
import { membersCol, settingsDocRef } from '../config/firebase.js';
import { getDocs, query, where, doc, updateDoc, deleteDoc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";

// Placeholders
const _logActivity = () => {};

export async function renderPengaturanPage() {
  const container = $('.page-container');
  const {
      currentUser,
      userRole
  } = appState;
  const photo = currentUser?.photoURL || `https://placehold.co/80x80/e2e8f0/64748b?text=${(currentUser?.displayName||'U')[0]}`;

  const isDark = document.documentElement.classList.contains('dark-theme');

  const ownerActions = [{
      action: 'manage-master',
      type: 'projects',
      icon: 'foundation',
      label: 'Kelola Proyek'
  }, {
      action: 'manage-master',
      type: 'staff',
      icon: 'manage_accounts',
      label: 'Kelola Staf Inti'
  }, {
      action: 'manage-master-global',
      type: null,
      icon: 'database',
      label: 'Master Data Lain'
  }, {
      action: 'manage-users',
      type: null,
      icon: 'group',
      label: 'Manajemen User'
  }, {
      action: 'edit-pdf-settings',
      type: null,
      icon: 'picture_as_pdf',
      label: 'Pengaturan Laporan PDF'
  }, {
      action: 'recalculate-usage',
      type: null,
      icon: 'calculate',
      label: 'Hitung Ulang Penggunaan Material'
  }, {
      action: 'navigate',
      nav: 'log_aktivitas',
      icon: 'history',
      label: 'Log Aktivitas'
  }, {
      action: 'open-conflicts',
      type: null,
      icon: 'report',
      label: 'Konflik Sinkron'
  },
  {
    action: 'force-full-sync',
    type: null,
    icon: 'sync_saved_locally',
    label: 'Paksa Sinkronisasi Penuh'
},

  {
      action: 'open-storage-stats',
      type: null,
      icon: 'storage',
      label: 'Statistik Storage'
  }, ];

  container.innerHTML = `
          <div class="profile-card-settings">
              <button id="theme-toggle-btn" class="btn-icon theme-toggle-btn" data-action="toggle-theme" title="Ubah Tema">
                  <span class="material-symbols-outlined">${isDark?'dark_mode':'light_mode'}</span>
              </button>
              <img src="${photo}" alt="Avatar" class="profile-avatar">
              <strong class="profile-name">${currentUser?.displayName || 'Pengguna'}</strong>
              <span class="profile-email">${currentUser?.email || ''}</span>
              <div class="profile-role-badge">${userRole}</div>
              <div class="profile-actions">
                  <button class="btn btn-secondary" data-action="auth-action">
                      <span class="material-symbols-outlined">${currentUser?'logout' : 'login'}</span>
                      <span>${currentUser?'Keluar' : 'Masuk'}</span>
                  </button>
              </div>
          </div>
          ${userRole === 'Owner'?`
              <div id="owner-settings">
                  <h5 class="section-title-owner">Administrasi Owner</h5>
                  <div class="settings-list">
                      ${ownerActions.map(act => `
                          <div class="settings-list-item" data-action="${act.action}" ${act.type?`data-type="${act.type}"` : ''} ${act.nav?`data-nav="${act.nav}"` : ''}>
                              <div class="icon-wrapper"><span class="material-symbols-outlined">${act.icon}</span></div>
                              <span class="label">${act.label}</span>
                          </div>
                      `).join('')}
                  </div>
              </div>
          ` : ''}
      `;
      // No active listeners needed for this page
      // _setActiveListeners([]);
}

export async function renderLogAktivitasPage() {
    const container = $('.page-container');
    container.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';

    const q = query(logsCol, orderBy("createdAt", "desc"));
    const logSnap = await getDocs(q);
    const logs = logSnap.docs.map(d => ({
        id: d.id,
        ...d.data()
    }));

    if (logs.length === 0) {
    container.innerHTML = _getEmptyStateHTML({ icon:'schedule', title:'Belum Ada Aktivitas', desc:'Aktivitas terbaru akan tampil di sini saat tersedia.' });
        return;
    }

    const logHTML = logs.map(log => {
        if (!log.createdAt) return '';
        const date = _getJSDate(log.createdAt);
        const time = date.toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit'
        });
        const day = date.toLocaleDateString('id-ID', {
            weekday: 'long',
            day: 'numeric',
            month: 'long'
        });
        return `
                <div class="log-item">
                    <div class="log-item-header">
                        <strong class="log-user">${log.userName}</strong>
                        <span class="log-time">${day}, ${time}</span>
                    </div>
                    <p class="log-action">${log.action}</p>
                </div>`;
    }).join('');

    container.innerHTML = `<div class="log-container">${logHTML}</div>`;
    // No active listeners needed for this page
    // _setActiveListeners([]);
}

export async function handleManageUsers() {
    toast('syncing', 'Memuat data pengguna...');
    try {
        const pendingQuery = query(membersCol, where("status", "==", "pending"));
        const pendingSnap = await getDocs(pendingQuery);
        const pendingUsers = pendingSnap.docs.map(d => ({
            id: d.id,
            ...d.data()
        }));
        const otherUsersQuery = query(membersCol, where("status", "!=", "pending"));
        const otherUsersSnap = await getDocs(otherUsersQuery);
        const otherUsers = otherUsersSnap.docs.map(d => ({
            id: d.id,
            ...d.data()
        }));
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
                            ${user.status === 'pending'?`
                                <button class="btn-icon btn-icon-success" data-action="user-action" data-id="${user.id}" data-type="approve" title="Setujui"><span class="material-symbols-outlined">check_circle</span></button>
                                <button class="btn-icon btn-icon-danger" data-action="user-action" data-id="${user.id}" data-type="delete" title="Tolak/Hapus"><span class="material-symbols-outlined">cancel</span></button>
                            ` : ''}
                            ${user.status === 'active' && user.role !== 'Owner'?`
                                ${user.role !== 'Editor'?`<button class="btn-icon" data-action="user-action" data-id="${user.id}" data-type="make-editor" title="Jadikan Editor"><span class="material-symbols-outlined">edit_note</span></button>`:''}
                                ${user.role !== 'Viewer'?`<button class="btn-icon" data-action="user-action" data-id="${user.id}" data-type="make-viewer" title="Jadikan Viewer"><span class="material-symbols-outlined">visibility</span></button>`:''}
                                <button class="btn-icon btn-icon-danger" data-action="user-action" data-id="${user.id}" data-type="delete" title="Hapus"><span class="material-symbols-outlined">delete</span></button>
                            `: ''}
                        </div>
                    </div>`;
        };

        const pendingUsersHTML = pendingUsers.length > 0 ?
            `<h5 class="detail-section-title" style="margin-top: 0;">Menunggu Persetujuan</h5>${pendingUsers.map(createUserHTML).join('')}` :
            '';
        const otherUsersSorted = otherUsers.sort((a, b) => (a.role === 'Owner'?-1 : 1));
        const otherUsersHTML = otherUsers.length > 0 ?
            `<h5 class="detail-section-title" style="${pendingUsers.length > 0?'' : 'margin-top: 0;'}">Pengguna Terdaftar</h5>${otherUsersSorted.map(createUserHTML).join('')}` :
            '';
        const noUsersHTML = appState.users.length === 0?'<p class="empty-state-small">Tidak ada pengguna lain.</p>' : '';
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
export async function handleUserAction(dataset) {
    const {
        id,
        type
    } = dataset;
    const user = appState.users.find(u => u.id === id);
    if (!user) return;

    const actionMap = {
        'approve': {
            message: `Setujui <strong>${user.name}</strong> sebagai Viewer?`,
            data: {
                status: 'active',
                role: 'Viewer'
            }
        },
        'make-editor': {
            message: `Ubah peran <strong>${user.name}</strong> menjadi Editor?`,
            data: {
                role: 'Editor'
            }
        },
        'make-viewer': {
            message: `Ubah peran <strong>${user.name}</strong> menjadi Viewer?`,
            data: {
                role: 'Viewer'
            }
        },
        'delete': {
            message: `Hapus atau tolak pengguna <strong>${user.name}</strong>? Aksi ini tidak dapat dibatalkan.`,
            data: null
        }
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
                _logActivity(`Aksi Pengguna: ${type}`, {
                    targetUserId: id,
                    targetUserName: user.name
                });
                toast('success', 'Aksi berhasil dilakukan.');
                handleManageUsers();
            } catch (error) {
                toast('error', 'Gagal memproses aksi.');
                console.error('User action error:', error);
            }
        }
    });
}

export async function handleEditPdfSettings() {
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
    const companyName = currentSettings.companyName || 'CV. ALAM BERKAH ABADI';
    const logoUrl = currentSettings.logoUrl || 'https://i.ibb.co/mRp1s1W/logo-cv-aba.png';
    const headerColor = currentSettings.headerColor || '#26a69a';
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
    const modal = createModal('dataDetail', {
        title: 'Pengaturan Laporan PDF',
        content
    });
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
            appState.pdfSettings = newSettings;
            toast('success', 'Pengaturan PDF berhasil disimpan.');
            closeModal(modal);
        } catch (error) {
            toast('error', 'Gagal menyimpan pengaturan.');
            console.error(error);
        }
    });
}