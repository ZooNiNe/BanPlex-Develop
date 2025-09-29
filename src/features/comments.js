import { appState } from '../core/state.js';
import { localDB } from '../db/dexie.js';
import { syncToServer } from '../core/sync.js';
import { toast } from '../ui/toast.js';
import { generateUUID, _getJSDate } from '../utils/helpers.js';

export function upsertCommentInUI(commentData, changeType) {
    try {
        const sectionEl = document.querySelector(`.comments-section[data-parent-id="${commentData.parentId}"][data-parent-type="${commentData.parentType}"]`);
        if (!sectionEl) return;
        const list = sectionEl.querySelector('.comments-list');
        if (!list) return;

        const existing = list.querySelector(`.comment-item[data-id="${commentData.id}"]`);

        if (changeType === 'removed' || commentData.isDeleted) {
            if (existing) {
                existing.style.opacity = '0';
                setTimeout(() => existing.remove(), 250);
            }
            return;
        }

        const isCurrentUser = appState.currentUser && appState.currentUser.uid === commentData.userId;
        const when = _getJSDate(commentData.createdAt).toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit' });
        const canDelete = !!appState.currentUser && (isCurrentUser || appState.userRole === 'Owner');
        const safeText = String(commentData.content || '').replace(/</g, '&lt;').replace(/\n/g, '<br>');
        const initials = (commentData.userName || 'U').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

        const htmlInner = `
            <div class="comment-avatar">${initials}</div>
            <div class="comment-bubble">
                <div class="comment-meta">
                    <strong class="comment-user">${commentData.userName || 'Pengguna'}</strong>
                    ${canDelete ? `<button class="btn-icon btn-icon-danger" data-action="delete-comment" data-id="${commentData.id}" title="Hapus"><span class="material-symbols-outlined">delete</span></button>` : ''}
                </div>
                <div class="comment-text">${safeText}</div>
                <div class="comment-date">${when}</div>
            </div>
        `;

        if (existing) {
            existing.innerHTML = htmlInner;
            existing.className = `comment-item ${isCurrentUser ? 'is-current-user' : ''}`;
        } else {
            const wrapper = document.createElement('div');
            wrapper.className = `comment-item ${isCurrentUser ? 'is-current-user' : ''}`;
            wrapper.dataset.id = commentData.id;
            wrapper.style.opacity = '0';
            wrapper.innerHTML = htmlInner;
            list.appendChild(wrapper);
            requestAnimationFrame(() => { wrapper.style.opacity = '1'; });
        }
    } catch (e) { console.warn('upsertCommentInUI error', e); }
}

export async function handlePostComment(dataset) {
  try {
      const { parentId, parentType } = dataset;
      const section = event?.target?.closest('.comments-section') || document.querySelector(`.comments-section[data-parent-id="${parentId}"][data-parent-type="${parentType}"]`);
      const ta = section ? section.querySelector('textarea') : null;
      const content = (ta?.value || '').trim();
      if (!parentId || !parentType) return;
      if (!content) { toast('error', 'Komentar kosong.'); return; }
      if (!appState.currentUser) { toast('error', 'Masuk untuk berkomentar.'); return; }
      const item = {
          id: generateUUID(),
          parentId,
          parentType,
          content,
          userId: appState.currentUser.uid,
          userName: appState.currentUser.displayName || 'Pengguna',
          createdAt: new Date(),
          needsSync: 1,
          isDeleted: 0
      };
      await localDB.comments.add(item);
      appState.comments.push(item);
      if (ta) ta.value = '';

      upsertCommentInUI(item, 'added');
      syncToServer();
  } catch (e) {
      console.error('Gagal menambah komentar', e);
      toast('error', 'Gagal menambah komentar.');
  }
}

export async function handleDeleteComment(dataset) {
  try {
      const { id } = dataset;
      if (!id) return;
      const c = (appState.comments || []).find(x => x.id === id);
      if (!c) return;

      await localDB.comments.where('id').equals(id).modify({ isDeleted: 1, needsSync: 1 });
      const index = appState.comments.findIndex(x => x.id === id);
      if (index > -1) {
        appState.comments.splice(index, 1);
      }

      upsertCommentInUI(c, 'removed');
      syncToServer();
  } catch (e) {
      console.error('Gagal menghapus komentar', e);
      toast('error', 'Gagal menghapus komentar.');
  }
}