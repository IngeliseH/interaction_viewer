import { state, setState, renderTable } from './table.js';

export function setCurrentPage(page) {
    state.setState({ currentPage: page });
}

export function setUpdatePaginationUI(fn) {
    state.setState({ updatePaginationUI: fn });
}

export function initPagination() {
    setUpdatePaginationUI(updatePaginationControls);
}

export function updatePaginationUI(totalItems) {
    updatePaginationControls(totalItems);
}

function updatePaginationControls(totalRows) {
    const pagination = document.getElementById('pagination');
    if (!pagination) return;
    pagination.innerHTML = '';

    const rowsPerPage = state.rowsPerPage;
    const currentPage = state.currentPage;
    const totalPages = Math.ceil(totalRows / rowsPerPage);

    const prevBtn = document.createElement('button');
    prevBtn.className = 'page-btn';
    prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
    prevBtn.disabled = currentPage === 1;
    prevBtn.addEventListener('click', () => {
        if (state.currentPage > 1) {
            setCurrentPage(state.currentPage - 1);
            renderTable();
        }
    });
    pagination.appendChild(prevBtn);

    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, currentPage + 2);
    if (endPage - startPage < 4) {
        if (startPage === 1) endPage = Math.min(5, totalPages);
        if (endPage === totalPages) startPage = Math.max(1, totalPages - 4);
    }
    for (let i = startPage; i <= endPage; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.className = `page-btn${i === currentPage ? ' active' : ''}`;
        pageBtn.textContent = i;
        pageBtn.addEventListener('click', () => {
            setCurrentPage(i);
            renderTable();
        });
        pagination.appendChild(pageBtn);
    }

    const nextBtn = document.createElement('button');
    nextBtn.className = 'page-btn';
    nextBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
    nextBtn.disabled = currentPage === totalPages || totalPages === 0;
    nextBtn.addEventListener('click', () => {
        if (state.currentPage < totalPages) {
            setCurrentPage(state.currentPage + 1);
            renderTable();
        }
    });
    pagination.appendChild(nextBtn);

    const pageInfo = document.createElement('div');
    pageInfo.className = 'page-info';
    if (totalRows > 0) {
        const startIdx = Math.min((currentPage - 1) * rowsPerPage + 1, totalRows);
        const endIdx = Math.min(currentPage * rowsPerPage, totalRows);
        pageInfo.textContent = `Showing ${startIdx}-${endIdx} of ${totalRows}`;
    } else {
        pageInfo.textContent = `Showing 0-0 of 0`;
    }
    pagination.appendChild(pageInfo);
}
