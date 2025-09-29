import { isViewer } from '../utils/helpers.js';

export function createMasterDataSelect(id, label, options, selectedValue = '', masterType = null) {
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
                        <div class="custom-select-search-wrapper">
                            <span class="material-symbols-outlined">search</span>
                            <input type="search" class="custom-select-search" placeholder="Cari..." autocomplete="off">
                        </div>
                        ${options.map(opt => `<div class="custom-select-option" data-value="${opt.value}">${opt.text}</div>`).join('')}
                    </div>
                </div>
                ${showMasterButton ? `<button type="button" class="btn-icon master-data-trigger" data-action="manage-master" data-type="${masterType}"><span class="material-symbols-outlined">database</span></button>` : ''}
            </div>
        </div>
    `;
};

export function _createFormGroupHTML(id, labelText, inputHTML) {
    const inputWithId = inputHTML.includes(' id=') ? inputHTML : inputHTML.replace(/<(\w+)/, `<$1 id="${id}"`);

    return `
        <div class="form-group">
            <label for="${id}">${labelText}</label>
            ${inputWithId}
        </div>
    `;
}