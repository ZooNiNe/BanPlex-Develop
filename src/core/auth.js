import { onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import { doc, getDoc, setDoc, serverTimestamp, onSnapshot, query, where } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { auth, membersCol } from '../config/firebase.js';
import { OWNER_EMAIL } from '../config/constants.js';
import { appState } from './state.js';
import { $ } from '../utils/helpers.js';
import { toast } from '../ui/toast.js';
import { renderUI, renderBottomNav, renderSidebar } from '../ui/navigation.js';
import { loadAllLocalDataToState, _calculateAndCacheDashboardTotals } from './data.js';
import { syncFromServer, syncToServer, subscribeToMasterData, _setActiveListeners, updateSyncIndicator } from './sync.js';
import { closeModal } from '../ui/modals.js';

export function initializeAuthListener() {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            initializeAppSession(user);
        } else {
            Object.assign(appState, {
                currentUser: null,
                userRole: 'Guest',
                userStatus: null,
                justLoggedIn: false
            });
            $('#global-loader').style.display = 'none';
            $('#app-shell').style.display = 'flex';
            renderUI();
            _setActiveListeners([]);
          }
      });
}

async function initializeAppSession(user) {
    appState.currentUser = user;
    const userDocRef = doc(membersCol, user.uid);
    try {
        let userDoc = await getDoc(userDocRef);
        if (!userDoc.exists()) {
            const isOwner = user.email.toLowerCase() === OWNER_EMAIL.toLowerCase();
            const initialData = {
                email: user.email,
                name: user.displayName,
                photoURL: user.photoURL,
                role: isOwner ? 'Owner' : 'Viewer',
                status: isOwner ? 'active' : 'pending',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            };
            await setDoc(userDocRef, initialData);
            userDoc = await getDoc(userDocRef);
        }
        const userData = userDoc.data();
        Object.assign(appState, {
            userRole: userData.role,
            userStatus: userData.status
        });
        attachRoleListener(userDocRef);
        if (appState.userRole === 'Owner') listenForPendingUsers();
        $('#global-loader').style.display = 'none';
        $('#app-shell').style.display = 'flex';
        await loadAllLocalDataToState();
        _calculateAndCacheDashboardTotals();
        renderUI();
        updateSyncIndicator();
        if (appState.justLoggedIn) {
            toast('success', `Selamat datang kembali, ${userData.name}!`);
            appState.justLoggedIn = false;
        }
        if (navigator.onLine) {
            await syncFromServer();
            await syncToServer();
            subscribeToMasterData();
        } else {
            toast('info', 'Anda sedang offline. Menampilkan data yang tersimpan di perangkat.');
        }
    } catch (error) {
        console.error("Gagal inisialisasi sesi:", error);
        toast('error', 'Gagal memuat profil. Menggunakan mode terbatas.');
        $('#global-loader').style.display = 'none';
        $('#app-shell').style.display = 'flex';
        renderUI();
    }
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  try {
      await signInWithPopup(auth, provider);
      toast('success', 'Login berhasil. Menyiapkan akun...');
  } catch (error) {
      console.error('Popup sign-in failed:', error);
      toast('error', 'Login gagal. Coba lagi.');
  }
}

export async function handleLogout() {
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
          const {
              role,
              status
          } = docSnap.data();
          if (appState.userRole !== role || appState.userStatus !== status) {
              Object.assign(appState, {
                  userRole: role,
                  userStatus: status
              });
              renderUI();
          }
      }
  });
}

function listenForPendingUsers() {
  onSnapshot(query(membersCol, where("status", "==", "pending")), (snapshot) => {
      appState.pendingUsersCount = snapshot.size;
      renderBottomNav();
      renderSidebar();
  });
}