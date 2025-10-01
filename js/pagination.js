import { state, renderTable } from './table.js';

// =============================================================================
// Public API Functions
// =============================================================================
export function setCurrentPage(page) {
    state.setState({ currentPage: page });
}

export function setUpdatePaginationUI(fn) {
    state.setState({ updatePaginationUI: fn });
}

export function initPagination() {
    setUpdatePaginationUI(updatePaginationControls);

    const totalRows = state.tableData.length;
    updatePaginationControls(totalRows);
}

export function updatePaginationUI(totalItems) {
    updatePaginationControls(totalItems);
}

export function paginateData(data, currentPage, rowsPerPage) {
    const start = (currentPage - 1) * rowsPerPage;
    const end = Math.min(start + rowsPerPage, data.length);
    return data.slice(start, end);
}

function updatePaginationControls(totalRows) {
    const pagination = document.getElementById('pagination');
    if (!pagination) return;
    pagination.innerHTML = '';

    const { currentPage, rowsPerPage } = state;
    const totalPages = Math.ceil(totalRows / rowsPerPage);

    pagination.appendChild(_createNavigationButton('left', currentPage === 1, () => {
        if (currentPage > 1) {
            setCurrentPage(currentPage - 1);
            renderTable();
        }
    }));

    const { start, end } = _getPageRange(currentPage, totalPages);
    for (let i = start; i <= end; i++) {
        pagination.appendChild(_createPageButton(i, currentPage, () => {
            setCurrentPage(i);
            renderTable();
        }));
    }

    pagination.appendChild(_createNavigationButton('right', currentPage === totalPages || totalPages === 0, () => {
        if (currentPage < totalPages) {
            setCurrentPage(currentPage + 1);
            renderTable();
        }
    }));

    const pageInfo = document.createElement('div');
    pageInfo.className = 'page-info';
    const startIdx = totalRows > 0 ? Math.min((currentPage - 1) * rowsPerPage + 1, totalRows) : 0;
    const endIdx = Math.min(currentPage * rowsPerPage, totalRows);
    pageInfo.textContent = `Showing ${startIdx}-${endIdx} of ${totalRows}`;
    pagination.appendChild(pageInfo);
}

// =============================================================================
// Core Logic
// =============================================================================
function _createPageButton(page, currentPage, onClick) {
    const btn = document.createElement('button');
    btn.className = `page-btn${page === currentPage ? ' active' : ''}`;
    btn.textContent = page;
    btn.addEventListener('click', onClick);
    return btn;
}

function _createNavigationButton(icon, isDisabled, onClick) {
    const btn = document.createElement('button');
    btn.className = 'page-btn';
    btn.innerHTML = `<i class="fas fa-chevron-${icon}"></i>`;
    btn.disabled = isDisabled;
    btn.addEventListener('click', onClick);
    return btn;
}

function _getPageRange(currentPage, totalPages) {
    let start = Math.max(1, currentPage - 2);
    let end = Math.min(totalPages, start + 4);
    start = Math.max(1, end - 4);
    return { start, end };
}
