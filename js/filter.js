import { state, renderTable } from './table.js';
import { setCurrentPage } from './pagination.js';

const filterState = {
    selectedProteins: [],
    searchMode: "includes"
};

// =============================================================================
// Public API Functions
// =============================================================================
export function setColumnFilters(filters, shouldRender = true) {
    state.setState({ columnFilters: filters || {} });
    if (shouldRender) {
        renderTable();
    }
}

export function setSelectedProteins(proteins) { 
    filterState.selectedProteins = proteins || [];
    state.setState({ selectedProteins: filterState.selectedProteins }); 
}

export function getSelectedProteins() {
    return filterState.selectedProteins;
}

export function setSearchMode(mode) {
    filterState.searchMode = mode;
    state.setState({ searchMode: mode });
}

export function setOnFiltersChanged(fn) { state.setState({ onFiltersChanged: fn }); }

export function updateActiveFilterDisplay() {
    const activeFilters = document.getElementById('active-filters');
    if (!activeFilters) return;
    activeFilters.innerHTML = '';

    const urlParams = new URLSearchParams(window.location.search);
    const queryP1 = decodeURIComponent(urlParams.get('p1') || '');
    const queryP2 = decodeURIComponent(urlParams.get('p2') || '');
    const proteinsFromUrl = [queryP1, queryP2].filter(Boolean);

    if (filterState.selectedProteins && Array.isArray(filterState.selectedProteins)) {
        filterState.selectedProteins.forEach(protein => {
            if (proteinsFromUrl.includes(protein)) return;
            const tag = document.createElement('div');
            tag.className = 'filter-tag protein-tag-active';
            tag.innerHTML = `Protein: ${protein} <span class="remove-tag" data-type="protein" data-value="${protein}">&times;</span>`;
            tag.querySelector('.remove-tag').addEventListener('click', () => {
                setSelectedProteins(filterState.selectedProteins.filter(p => p !== protein));
                setCurrentPage(1);
                renderTable();
                if (typeof state.onFiltersChanged === 'function') state.onFiltersChanged();
            });
            activeFilters.appendChild(tag);
        });
    }

    getAllFilters().forEach(filter => {
        const tag = document.createElement('div');
        tag.className = 'filter-tag';
        let text = `${filter.column}: `;
        if (filter.min !== undefined && filter.max !== undefined) {
            if (filter.min === filter.max) {
                 text += `= ${filter.min}`;
            } else {
                 text += `${filter.min} - ${filter.max}`;
            }
        } else if (filter.min !== undefined) {
            text += `≥ ${filter.min}`;
        } else if (filter.max !== undefined) {
            text += `≤ ${filter.max}`;
        } else {
            return;
        }
        
        tag.innerHTML = `${text} <span class="remove-tag" data-type="numeric-column" data-column="${filter.column}">&times;</span>`;
        tag.querySelector('.remove-tag').addEventListener('click', () => {
            _clearColumnFilter(filter.column);
        });
        activeFilters.appendChild(tag);
    });
}

export function refineNumericFilter(column, condition, value) {
    if (!column || value === undefined || value === null || value === '') return;

    const parsedValue = parseFloat(value);
    if (isNaN(parsedValue)) return;

    if (!state.columnFilters) state.columnFilters = {};
    const currentFilter = state.columnFilters[column] || {};

    if (condition === 'below') {
        currentFilter.max = (currentFilter.max === undefined) ? parsedValue : Math.min(currentFilter.max, parsedValue);
    } else if (condition === 'above') {
        currentFilter.min = (currentFilter.min === undefined) ? parsedValue : Math.max(currentFilter.min, parsedValue);
    }
    
    state.columnFilters[column] = currentFilter;

    setCurrentPage(1);
    renderTable();
    if (typeof state.onFiltersChanged === 'function') state.onFiltersChanged();
}

export function showColumnFilterPopup(column, targetIcon) {
    document.querySelectorAll('.filter-popup').forEach(p => p.remove());
    const current = (state.columnFilters && state.columnFilters[column]) || {};
    const popup = document.createElement('div');
    popup.className = 'filter-popup';
    popup.innerHTML = `
        <div class="filter-popup-header">
            <h4>${column} Filter</h4>
            <button class="close-popup">&times;</button>
        </div>
        <div class="filter-popup-body">
            <div class="filter-group">
                <label>Min value:</label>
                <input type="number" class="filter-min" step="0.01" value="${current.min ?? ''}">
            </div>
            <div class="filter-group">
                <label>Max value:</label>
                <input type="number" class="filter-max" step="0.01" value="${current.max ?? ''}">
            </div>
            <button class="btn btn-primary apply-column-filter">Apply</button>
            <button class="btn btn-outline clear-column-filter">Clear</button>
        </div>
    `;
    document.body.appendChild(popup);
    const rect = targetIcon.getBoundingClientRect();
    popup.style.position = 'absolute';
    popup.style.top = `${rect.bottom + window.scrollY}px`;
    popup.style.left = `${rect.left + window.scrollX}px`;
    popup.style.zIndex = '1010';

    popup.querySelector('.close-popup').addEventListener('click', () => popup.remove());
    popup.querySelector('.apply-column-filter').addEventListener('click', () => {
        const min = popup.querySelector('.filter-min').value;
        const max = popup.querySelector('.filter-max').value;
        _applyColumnFilter(column, min === '' ? undefined : min, max === '' ? undefined : max);
        popup.remove();
    });
    popup.querySelector('.clear-column-filter').addEventListener('click', () => {
        _clearColumnFilter(column);
        popup.remove();
    });
    const clickOutsideHandler = (event) => {
        if (!popup.contains(event.target) && event.target !== targetIcon && !targetIcon.contains(event.target)) {
            popup.remove();
            document.removeEventListener('click', clickOutsideHandler, true);
        }
    };
    setTimeout(() => document.addEventListener('click', clickOutsideHandler, true), 0);
}

export function applyFiltersToData(data) {
    let filteredData = [...data];

    if (state.selectedProteins && state.selectedProteins.length > 0) {
        if (state.searchMode === "includes") {
            filteredData = filteredData.filter(row =>
                state.selectedProteins.some(sP =>
                    (row.Protein1 && sP === row.Protein1) ||
                    (row.Protein2 && sP === row.Protein2) ||
                    (row.Protein1_Domain && sP === row.Protein1_Domain) ||
                    (row.Protein2_Domain && sP === row.Protein2_Domain)
                )
            );
        } else if (state.searchMode === "only") {
            filteredData = filteredData.filter(row => {
                const p1 = state.selectedProteins.some(sP =>
                    (row.Protein1 && sP === row.Protein1) ||
                    (row.Protein1_Domain && sP === row.Protein1_Domain)
                );
                const p2 = state.selectedProteins.some(sP =>
                    (row.Protein2 && sP === row.Protein2) ||
                    (row.Protein2_Domain && sP === row.Protein2_Domain)
                );
                return p1 && p2;
            });
        } else if (state.searchMode === "pair-exact" && state.selectedProteins.length === 2) {
            const [pA, pB] = state.selectedProteins;
            filteredData = filteredData.filter(row => {
                if (pA === pB) {
                    return (
                        (row.Protein1 === pA && row.Protein2 === pB) ||
                        (row.Protein1 === pB && row.Protein2 === pA)
                    );
                } else {
                    return (
                        (row.Protein1 === pA && row.Protein2 === pB) ||
                        (row.Protein1 === pB && row.Protein2 === pA)
                    );
                }
            });
        }
    }

    if (state.columnFilters) {
        Object.entries(state.columnFilters).forEach(([columnName, filter]) => {
            filteredData = filteredData.filter(row => {
                const value = parseFloat(row[columnName]);
                if (isNaN(value)) return false;

                let passes = true;
                if (filter.min !== undefined && value < filter.min) {
                    passes = false;
                }
                if (filter.max !== undefined && value > filter.max) {
                    passes = false;
                }
                return passes;
            });
        });
    }

    return filteredData;
}

export function getFilteredData() {
    return applyFiltersToData(state.tableData);
}

export function getAllFilters() {
    const filters = [];
    if (state.columnFilters && typeof state.columnFilters === 'object') {
        Object.entries(state.columnFilters).forEach(([col, val]) => {
            if (val && (val.min !== undefined || val.max !== undefined)) {
                filters.push({ column: col, min: val.min, max: val.max });
            }
        });
    }
    return filters;
}

// =============================================================================
// Core Logic
// =============================================================================
function _applyColumnFilter(column, min, max) {
    if (!state.columnFilters) state.columnFilters = {};
    const newFilter = {};
    const minVal = parseFloat(min);
    const maxVal = parseFloat(max);

    if (!isNaN(minVal) && min !== '') newFilter.min = minVal;
    if (!isNaN(maxVal) && max !== '') newFilter.max = maxVal;

    if (Object.keys(newFilter).length > 0) {
        state.columnFilters[column] = newFilter;
    } else {
        delete state.columnFilters[column];
    }
    
    setCurrentPage(1);
    renderTable();
    if (typeof state.onFiltersChanged === 'function') state.onFiltersChanged();
}

export function _clearColumnFilter(column) {
    if (state.columnFilters && column in state.columnFilters) {
        delete state.columnFilters[column];
    }
    setCurrentPage(1);
    renderTable();
    if (typeof state.onFiltersChanged === 'function') state.onFiltersChanged();
}
