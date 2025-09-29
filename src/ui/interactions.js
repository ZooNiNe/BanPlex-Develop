import { appState } from '../core/state.js';
import { $, $$ } from '../utils/helpers.js';

export function _attachSwipeHandlers(containerSelector) {
    const container = document.querySelector(containerSelector);
    if (!container) return;

    if (container._swipeHandlers) {
        container.removeEventListener('touchstart', container._swipeHandlers.start, { passive: true });
        container.removeEventListener('touchmove', container._swipeHandlers.move, { passive: true });
        container.removeEventListener('touchend', container._swipeHandlers.end);
    }

    let openCard = null;
    let startX = 0;
    let currentX = 0;
    let isSwiping = false;

    const closeOpenCard = () => {
        if (openCard) {
            openCard.classList.remove('swipe-open');
            const content = openCard.querySelector('.item-main-content');
            if (content) content.style.transform = '';
            openCard = null;
        }
    };

    const onTouchStart = e => {
        if (appState.selectionMode.active) return;
        const item = e.target.closest('.dense-list-item');
        if (!item || !item.querySelector('.swipe-actions')) return;
        if (openCard && openCard !== item) closeOpenCard();

        isSwiping = true;
        startX = e.touches[0].clientX;
        currentX = startX;
        const mainContent = item.querySelector('.item-main-content');
        if (mainContent) mainContent.style.transition = 'none';
    };

    const onTouchMove = e => {
        if (!isSwiping) return;
        currentX = e.touches[0].clientX;
        const dx = currentX - startX;
        const item = e.target.closest('.dense-list-item');
        if (dx < 0 && item) {
            const mainContent = item.querySelector('.item-main-content');
            if (mainContent) mainContent.style.transform = `translateX(${dx}px)`;
        }
    };

    const onTouchEnd = e => {
        if (e.target.closest('.swipe-actions button, .swipe-actions a')) {
            isSwiping = false;
            return;
        }

        if (!isSwiping) return;
        isSwiping = false;

        const item = e.target.closest('.dense-list-item');
        if (!item) return;

        const content = item.querySelector('.item-main-content');
        if (!content) return;

        content.style.transition = '';
        const actionsWidth = item.querySelector('.swipe-actions')?.offsetWidth || 0;
        const dx = e.changedTouches[0].clientX - startX;

        if (dx < -(actionsWidth * 0.4)) {
            openCard = item;
            item.classList.add('swipe-open');
            content.style.transform = `translateX(-${actionsWidth}px)`;
        } else {
            if (openCard === item) openCard = null;
            item.classList.remove('swipe-open');
            content.style.transform = '';
        }
    };

    container._swipeHandlers = { start: onTouchStart, move: onTouchMove, end: onTouchEnd };
    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchmove', onTouchMove, { passive: true });
    container.addEventListener('touchend', onTouchEnd);

    if (!window.globalSwipeCloseListener) {
        document.body.addEventListener('click', (e) => {
            if (openCard && !e.target.closest('.dense-list-item.swipe-open')) {
                closeOpenCard();
            }
        }, true);
        window.globalSwipeCloseListener = true;
    }
}

export function _initCustomSelects(context = document) {
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
          if (!isActive) {
              wrapper.classList.add('active');
              wrapper.querySelector('.custom-select-search')?.focus();
          }
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

      const searchInput = wrapper.querySelector('.custom-select-search');
      if (searchInput) {
          searchInput.addEventListener('click', e => e.stopPropagation());
          searchInput.addEventListener('input', e => {
              const searchTerm = e.target.value.toLowerCase();
              const options = wrapper.querySelectorAll('.custom-select-option');
              options.forEach(option => {
                  const optionText = option.textContent.toLowerCase();
                  option.style.display = optionText.includes(searchTerm)?'' : 'none';
              });
          });
      }
  });
}

export function _initSelectionMode(containerSelector, pageContext) {
    const container = $(containerSelector);
    if (!container) return;

    if (container._selectionHandlers) {
        container.removeEventListener('pointerdown', container._selectionHandlers.start);
    }

    let pressTimer = null;
    let hasMoved = false;

    const startPress = (e) => {
        if (appState.selectionMode.active || e.target.closest('.swipe-actions')) return;

        const card = e.target.closest('.dense-list-item');
        if (!card) return;

        hasMoved = false;
        const startX = e.pageX;
        const startY = e.pageY;

        const cancelOnMove = (moveEvent) => {
            if (Math.abs(moveEvent.pageX - startX) > 10 || Math.abs(moveEvent.pageY - startY) > 10) {
                hasMoved = true;
                clearTimeout(pressTimer);
                container.removeEventListener('pointermove', cancelOnMove);
                container.removeEventListener('pointerup', endPressOrLeave);
            }
        };

        const endPressOrLeave = () => {
            clearTimeout(pressTimer);
            container.removeEventListener('pointermove', cancelOnMove);
            container.removeEventListener('pointerup', endPressOrLeave);
        };

        container.addEventListener('pointermove', cancelOnMove);
        container.addEventListener('pointerup', endPressOrLeave);
        container.addEventListener('pointerleave', endPressOrLeave, { once: true });

        pressTimer = setTimeout(() => {
            container.removeEventListener('pointermove', cancelOnMove);
            if (!hasMoved) {
                appState.selectionMode.active = true;
                appState.selectionMode.pageContext = pageContext;
                _toggleCardSelection(card);
            }
        }, 500);
    };

    container._selectionHandlers = { start: startPress };
    container.addEventListener('pointerdown', startPress);
}

function _toggleCardSelection(card) {
    if (!card || !card.dataset.id) return;
    const id = card.dataset.id;
    const { selectedIds } = appState.selectionMode;

    if (selectedIds.has(id)) {
        selectedIds.delete(id);
        card.classList.remove('selected');
    } else {
        selectedIds.add(id);
        card.classList.add('selected');
    }

    if (appState.selectionMode.active && selectedIds.size === 0) {
        appState.selectionMode.active = false;
        document.body.classList.remove('selection-active');
    }

    _renderSelectionBar();
}

function _renderSelectionBar() {
    let bar = $('#selection-bar');
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'selection-bar';
        bar.className = 'selection-bar';
        document.body.appendChild(bar);
    }

    if (appState.selectionMode.active) {
        let total = 0;
        const { selectedIds, pageContext } = appState.selectionMode;

        if (pageContext === 'tagihan') {
            selectedIds.forEach(id => {
                const bill = appState.tagihan.currentList.find(b => b.id === id);
                if(bill) total += (bill.amount - (bill.paidAmount || 0));
            });
        } else if (pageContext === 'pemasukan') {
            const allIncomes = [...appState.incomes, ...appState.fundingSources];
            selectedIds.forEach(id => {
                const income = allIncomes.find(i => i.id === id);
                if(income) total += (income.amount || income.totalAmount || 0);
            });
        }

        bar.innerHTML = `
            <button id="close-selection-btn" class="btn-icon"><span class="material-symbols-outlined">close</span></button>
            <div class="selection-info">
                <span id="selection-count">${selectedIds.size} item dipilih</span>
                <strong id="selection-total">${fmtIDR(total)}</strong>
            </div>
        `;
        document.body.classList.add('selection-active');
        bar.classList.add('show');

        $('#close-selection-btn').addEventListener('click', () => {
            appState.selectionMode.active = false;
            appState.selectionMode.selectedIds.clear();
            _renderSelectionBar();
            $$('.dense-list-item.selected').forEach(card => card.classList.remove('selected'));
        });
    } else {
        document.body.classList.remove('selection-active');
        bar.classList.remove('show');
    }
}

export function _markInvalid(input, message) {
    input.classList.add('is-invalid');
    let msg = input.parentElement?.querySelector?.('.input-error-text');
    if (!msg) {
        msg = document.createElement('small');
        msg.className = 'input-error-text';
        input.parentElement?.appendChild(msg);
    }
    msg.textContent = message || 'Input tidak valid';
}

export function _clearInvalid(input) {
    input.classList.remove('is-invalid');
    const msg = input.parentElement?.querySelector?.('.input-error-text');
    if (msg) msg.remove();
}

export function _attachClientValidation(form) {
    if (!form) return;
    const validators = {
        'pengeluaran-jumlah': (el) => {
            const val = parseFormattedNumber(el.value);
            return val > 0 ? null : 'Jumlah harus lebih dari 0';
        },
        'pengeluaran-deskripsi': (el) => el.value.trim() ? null : 'Deskripsi wajib diisi',
        'pengeluaran-tanggal': (el) => el.value ? null : 'Tanggal wajib diisi'
    };
    Object.keys(validators).forEach(id => {
        const el = form.querySelector(`#${id}`);
        if (!el) return;
        el.addEventListener('blur', () => {
            const error = validators[id](el);
            if (error) _markInvalid(el, error); else _clearInvalid(el);
        });
        el.addEventListener('input', () => _clearInvalid(el));
    });
    form.addEventListener('submit', (e) => {
        let firstInvalid = null;
        Object.keys(validators).forEach(id => {
            const el = form.querySelector(`#${id}`);
            if (!el) return;
            const error = validators[id](el);
            if (error) {
                _markInvalid(el, error);
                if (!firstInvalid) firstInvalid = el;
            }
        });
        if (firstInvalid) {
            e.preventDefault();
            firstInvalid.focus();
        }
    }, true);
}