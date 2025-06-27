// Centralized state for table, filters, sorting, pagination, etc.

export let tableData = [];
export let columnDescriptions = {};
export let currentSort = { column: 'min_pae', direction: 'asc' };
export let columnFilters = {}; // { col: {min, max} }
// sidebarFilters is removed. columnFilters is the single source of truth for numeric filters.
export let selectedProteins = [];
export let searchMode = "includes";
export let currentPage = 1;
export let rowsPerPage = 25;
export let proteinNameToAccessionMap = {};
export let proteinNameToCategoryMap = {}; // New state variable for mapping protein names to categories

// --- Color coding functions for stats ---
function iptmColor(val) {
    val = parseFloat(val);
    if (isNaN(val)) return '';
    if (val < 0.3) return 'stat-red';
    if (val < 0.55) return 'stat-orange';
    if (val < 0.7) return 'stat-lightgreen';
    return 'stat-darkgreen';
}
function minpaeColor(val) {
    val = parseFloat(val);
    if (isNaN(val)) return '';
    if (val >= 7 && val <= 30) return 'stat-red';
    if (val >= 5 && val < 7) return 'stat-orange';
    if (val >= 3 && val < 5) return 'stat-yellow';
    if (val >= 2 && val < 3) return 'stat-lightgreen';
    if (val >= 0 && val < 2) return 'stat-darkgreen';
    return '';
}
function avgpaeColor(val) {
    val = parseFloat(val);
    if (isNaN(val)) return '';
    if (val >= 20 && val <= 30) return 'stat-red';
    if (val >= 15 && val < 20) return 'stat-orange';
    if (val >= 10 && val < 15) return 'stat-yellow';
    if (val >= 5 && val < 10) return 'stat-lightgreen';
    if (val >= 0 && val < 5) return 'stat-darkgreen';
    return '';
}
function pdockqColor(val) {
    val = parseFloat(val);
    if (isNaN(val)) return '';
    if (val < 0.1) return 'stat-red';
    if (val < 0.23) return 'stat-orange';
    if (val < 0.5) return 'stat-yellow';
    if (val < 0.7) return 'stat-lightgreen';
    return 'stat-darkgreen';
}
function ropColor(val) {
    val = parseInt(val);
    if (isNaN(val)) return '';
    if (val === 0) return 'stat-red';
    if (val === 1) return 'stat-orange';
    if (val === 2) return 'stat-yellow';
    if (val === 3) return 'stat-lightgreen';
    if (val >= 4) return 'stat-darkgreen';
    return '';
}

const statColorFunctions = {
    'iptm': iptmColor,
    'min_pae': minpaeColor,
    'avg_pae': avgpaeColor,
    'pdockq': pdockqColor,
    'rop': ropColor,
};

// UI update hooks (to be set by the main page, e.g. index.html)
export let updatePaginationUI = null;
export let updateStatsUI = null;

// Internal state object for easier reference
const state = {
    get tableData() { return tableData; },
    set tableData(val) { tableData = val; },
    get columnDescriptions() { return columnDescriptions; },
    set columnDescriptions(val) { columnDescriptions = val; },
    get currentSort() { return currentSort; },
    set currentSort(val) { currentSort = val; },
    get columnFilters() { return columnFilters; },
    set columnFilters(val) { columnFilters = val; },
    // sidebarFilters removed from state
    get selectedProteins() { return selectedProteins; },
    set selectedProteins(val) { selectedProteins = val; },
    get searchMode() { return searchMode; },
    set searchMode(val) { searchMode = val; },
    get currentPage() { return currentPage; },
    set currentPage(val) { currentPage = val; },
    get rowsPerPage() { return rowsPerPage; },
    set rowsPerPage(val) { rowsPerPage = val; },
    get proteinNameToAccessionMap() { return proteinNameToAccessionMap; },
    set proteinNameToAccessionMap(val) { proteinNameToAccessionMap = val; },
    get updatePaginationUI() { return updatePaginationUI; },
    set updatePaginationUI(val) { updatePaginationUI = val; },
    get updateStatsUI() { return updateStatsUI; },
    set updateStatsUI(val) { updateStatsUI = val; },
    get proteinNameToCategoryMap() { return proteinNameToCategoryMap; },
    set proteinNameToCategoryMap(val) { proteinNameToCategoryMap = val; },
};

// Setters for state, to be called by UI logic
export function setTableData(data) { state.tableData = data; }
export function setColumnDescriptions(desc) { state.columnDescriptions = desc; }
export function setCurrentSort(sort) { state.currentSort = sort; }
export function setColumnFilters(filters, shouldRender = true) { // Allows setting all columnFilters at once
    state.columnFilters = filters || {}; 
    if (typeof onFiltersChanged === 'function') onFiltersChanged();
    if (shouldRender) {
        renderTable();
    }
}
// setSidebarFilters is removed.
export function setSelectedProteins(proteins) { state.selectedProteins = proteins; }
export function setSearchMode(mode) { state.searchMode = mode; }
export function setCurrentPage(page) { state.currentPage = page; }
export function setRowsPerPage(rpp) { state.rowsPerPage = rpp; }
export function setUpdatePaginationUI(fn) { state.updatePaginationUI = fn; }
export function setUpdateStatsUI(fn) { state.updateStatsUI = fn; }
export function setProteinNameToAccessionMap(map) { state.proteinNameToAccessionMap = map; }
export function setProteinNameToCategoryMap(map) { state.proteinNameToCategoryMap = map; }

// Add a callback for filter changes
export let onFiltersChanged = null;
export function setOnFiltersChanged(fn) { onFiltersChanged = fn; }

// Add a callback for when filtered data is updated
export let onFilteredDataUpdated = null;
export function setOnFilteredDataUpdated(fn) { onFilteredDataUpdated = fn; }

// --- START NEW FUNCTIONS ---

// --- Pagination UI ---
export function updatePaginationControls(totalRows) {
    const pagination = document.getElementById('pagination');
    if (!pagination) return;
    pagination.innerHTML = '';

    const rowsPerPage = state.rowsPerPage;
    const currentPage = state.currentPage;
    const totalPages = Math.ceil(totalRows / rowsPerPage);

    // Previous button
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

    // Page buttons (show up to 5 pages)
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

    // Next button
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

    // Page info
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

// --- Active Filter Tags ---
export function updateActiveFilterDisplay() {
    const activeFilters = document.getElementById('activeFilters');
    if (!activeFilters) return;
    activeFilters.innerHTML = '';

    // Determine the query protein(s) to hide from filter tags
    let proteinsToHide = [];
    if (state.searchMode === "pair-exact" && state.selectedProteins && state.selectedProteins.length === 2) {
        // On protein pair page, hide both query proteins from filter tags
        proteinsToHide = [state.selectedProteins[0], state.selectedProteins[1]];
    } else if (state.selectedProteins && state.selectedProteins.length === 1 && state.searchMode === "includes") {
        // On single protein page, hide the single query protein
        proteinsToHide = [state.selectedProteins[0]];
    }

    // Protein tags
    if (state.selectedProteins && Array.isArray(state.selectedProteins)) {
        state.selectedProteins.forEach(protein => {
            if (proteinsToHide.includes(protein)) return; // Hide the active filter for the query protein(s)
            const tag = document.createElement('div');
            tag.className = 'filter-tag protein-tag-active';
            tag.innerHTML = `Protein: ${protein} <span class="remove-tag" data-type="protein" data-value="${protein}">&times;</span>`;
            tag.querySelector('.remove-tag').addEventListener('click', () => {
                setSelectedProteins(state.selectedProteins.filter(p => p !== protein));
                setCurrentPage(1);
                renderTable(); // This will trigger onFiltersChanged if set
                if (typeof onFiltersChanged === 'function') onFiltersChanged(); // Explicitly call if renderTable doesn't always
            });
            activeFilters.appendChild(tag);
        });
    }

    // Numeric column filters
    getAllFilters().forEach(filter => {
        const tag = document.createElement('div');
        tag.className = 'filter-tag';
        let text = `${filter.column}: `;
        if (filter.min !== undefined && filter.max !== undefined) {
            if (filter.min === filter.max) { // handles cases where refine might make min=max
                 text += `= ${filter.min}`;
            } else {
                 text += `${filter.min} - ${filter.max}`;
            }
        } else if (filter.min !== undefined) {
            text += `≥ ${filter.min}`;
        } else if (filter.max !== undefined) {
            text += `≤ ${filter.max}`;
        } else {
            return; // Should not happen if filter has min or max
        }
        
        tag.innerHTML = `${text} <span class="remove-tag" data-type="numeric-column" data-column="${filter.column}">&times;</span>`;
        tag.querySelector('.remove-tag').addEventListener('click', () => {
            clearColumnFilter(filter.column); // This will call renderTable and onFiltersChanged
        });
        activeFilters.appendChild(tag);
    });
}

// --- END NEW FUNCTIONS ---

export async function loadData() {
    const mainDataPromise = new Promise((resolve, reject) => {
        Papa.parse('all_interface_analysis_2025.06.05_shifted.csv', {
            download: true,
            header: true,
            dynamicTyping: true,
            skipEmptyLines: true,
            complete: (results) => {
                if (results.errors.length) {
                    console.error("Parsing errors for main data CSV:", results.errors);
                    reject(results.errors);
                } else {
                    // Process data
                    const data = results.data.map(row => ({
                        ...row,
                        Proteins: `${row.Protein1_Domain || ''}+${row.Protein2_Domain || ''}`,
                        min_pae: parseFloat(row.min_pae) || 0,
                        avg_pae: parseFloat(row.avg_pae) || 0,
                        iptm: parseFloat(row.iptm) || 0,
                        pdockq: parseFloat(row.pdockq) || 0,
                        max_promiscuity: parseFloat(row.max_promiscuity) || 0,
                        rop: parseFloat(row.rop) || 0,
                        size: parseFloat(row.size) || 0,
                        evenness: parseFloat(row.evenness) || 0
                    }));
                    setTableData(data);
                    resolve(data);
                }
            },
            error: (error) => reject(error)
        });
    });

    const fragmentsMapPromise = new Promise((resolve, reject) => {
        Papa.parse('all_fragments_2025.06.04.csv', {
            download: true,
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                if (results.errors.length) {
                    console.error("Parsing errors for fragments CSV:", results.errors);
                    setProteinNameToAccessionMap({});
                    setProteinNameToCategoryMap({});
                    resolve({}); // Resolve with empty maps
                } else {
                    const accessionMap = {};
                    const categoryMap = {};
                    results.data.forEach(row => {
                        if (row.name) {
                            if (row.accession_id) {
                                accessionMap[row.name] = row.accession_id;
                            }
                            if (row.category) {
                                categoryMap[row.name] = row.category;
                            }
                        }
                    });
                    setProteinNameToAccessionMap(accessionMap);
                    setProteinNameToCategoryMap(categoryMap);
                    resolve({ accessionMap, categoryMap });
                }
            },
            error: (error) => {
                console.error("Error fetching fragments CSV:", error);
                setProteinNameToAccessionMap({});
                setProteinNameToCategoryMap({});
                resolve({}); // Resolve with empty maps
            }
        });
    });

    try {
        const [mainData, fragmentsMap] = await Promise.all([mainDataPromise, fragmentsMapPromise]);
        // Both CSVs are loaded (or attempted to load).
        // fragmentsMap is resolved even on error (with an empty map), so mainDataPromise is the critical one for table content.
        return mainData; // loadData's primary return is still the main table data
    } catch (error) {
        console.error("Error loading main CSV file:", error);
        setTableData([]); // Ensure tableData is empty on critical error
        // proteinNameToAccessionMap might be populated or empty depending on fragmentsMapPromise outcome
        return Promise.reject(error);
    }
}

// Filter/Sort/Sidebar filter logic helpers

// applyColumnFilter is used by the header filter popups to set an explicit range
export function applyColumnFilter(column, min, max) {
    if (!state.columnFilters) state.columnFilters = {};
    const newFilter = {};
    const minVal = parseFloat(min);
    const maxVal = parseFloat(max);

    if (!isNaN(minVal) && min !== '') newFilter.min = minVal;
    if (!isNaN(maxVal) && max !== '') newFilter.max = maxVal;

    if (Object.keys(newFilter).length > 0) {
        state.columnFilters[column] = newFilter;
    } else {
        delete state.columnFilters[column]; // Clear if both are invalid/empty
    }
    
    setCurrentPage(1);
    renderTable();
    if (typeof onFiltersChanged === 'function') onFiltersChanged();
}

// New function to refine existing filters, used by index.html sidebar
export function refineNumericFilter(column, condition, value) {
    if (!column || value === undefined || value === null || value === '') return;

    const parsedValue = parseFloat(value);
    if (isNaN(parsedValue)) return;

    if (!state.columnFilters) state.columnFilters = {};
    const currentFilter = state.columnFilters[column] || {};

    if (condition === 'below') { // Less than or equal to
        currentFilter.max = (currentFilter.max === undefined) ? parsedValue : Math.min(currentFilter.max, parsedValue);
    } else if (condition === 'above') { // Greater than or equal to
        currentFilter.min = (currentFilter.min === undefined) ? parsedValue : Math.max(currentFilter.min, parsedValue);
    }
    
    // Ensure min is not greater than max; if so, it's an impossible filter, could clear or leave.
    // For now, leave it; it will result in no data for that criterion.
    // if (currentFilter.min !== undefined && currentFilter.max !== undefined && currentFilter.min > currentFilter.max) {
    //     delete state.columnFilters[column]; // Or set to a state that indicates impossibility
    // } else {
    state.columnFilters[column] = currentFilter;
    // }

    setCurrentPage(1);
    renderTable();
    if (typeof onFiltersChanged === 'function') onFiltersChanged();
}


export function clearColumnFilter(column) {
    if (state.columnFilters && column in state.columnFilters) {
        delete state.columnFilters[column];
    }
    setCurrentPage(1);
    renderTable();
    if (typeof onFiltersChanged === 'function') onFiltersChanged();
}

// For header filter popups, treat all filters as a single array for table.js
export function getAllFilters() {
    // Now only processes columnFilters
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

// Export a function to get filtered (but not paginated) data, for use in chord plot, etc.
export function getFilteredData() {
    let filteredData = [...state.tableData];
    // Protein filter
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
            // Only show rows where Protein1 and Protein2 are exactly the selected pair (in either order)
            const [pA, pB] = state.selectedProteins;
            filteredData = filteredData.filter(row => {
                // Allow dimers (pA == pB)
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
    // All filters (sidebar + header) - now only columnFilters
    if (state.columnFilters) {
        Object.entries(state.columnFilters).forEach(([columnName, filter]) => {
            filteredData = filteredData.filter(row => {
                const value = parseFloat(row[columnName]);
                if (isNaN(value)) return false; // Rows without a valid number for a filtered column are excluded

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

// Initialize table: set up column headers and delegated link handler
export function initTable() {
    initColumnHeaders();
    initProteinLinkListener();
}

// Set up column headers: info buttons, filter icons, sorting
function initColumnHeaders() {
    document.querySelectorAll('th[data-column]').forEach(header => {
        const column = header.dataset.column;
        // Info button
        if (state.columnDescriptions && state.columnDescriptions[column]) {
            let infoBtn = header.querySelector('.info-btn');
            if (!infoBtn) {
                infoBtn = document.createElement('span');
                infoBtn.className = 'info-btn';
                infoBtn.textContent = 'ⓘ';
                infoBtn.setAttribute('tabindex', '0');
                header.appendChild(infoBtn);
                const tooltip = document.createElement('div');
                tooltip.className = 'info-tooltip';
                tooltip.innerHTML = `<h4>${column.replace(/_/g, ' ')}</h4><p>${state.columnDescriptions[column]}</p>`;
                header.appendChild(tooltip);
            }
        }
        // Filter icon
        let filterIcon = header.querySelector('.filter-icon');
        if (filterIcon && column !== 'Proteins' && column !== 'location') {
            filterIcon.addEventListener('click', (e) => {
                e.stopPropagation();
                showColumnFilterPopup(column, filterIcon);
            });
        } else if (filterIcon) {
            filterIcon.style.display = 'none';
        }
        // Sorting
        if (column !== 'location' && column !== 'relative_location') {
            header.classList.add('sortable');
            header.addEventListener('click', (event) => {
                if (event.target.closest('.filter-icon') || event.target.closest('.info-btn')) return;
                sortTable(column);
            });
        }
    });
}

// Sorting
export function sortTable(column) {
    if (state.currentSort.column === column) {
        state.currentSort.direction = state.currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        state.currentSort = {
            column,
            direction: ['min_pae', 'avg_pae', 'max_promiscuity', 'rop', 'size', 'evenness'].includes(column) ? 'asc' : 'desc'
        };
    }

    const alphabeticalColumns = ['query_fragment', 'partner', 'function'];
    renderTable((a, b) => {
        if (alphabeticalColumns.includes(column)) {
            const aValue = String(a[column] || '').toLowerCase();
            const bValue = String(b[column] || '').toLowerCase();
            if (aValue < bValue) return state.currentSort.direction === 'asc' ? -1 : 1;
            if (aValue > bValue) return state.currentSort.direction === 'asc' ? 1 : -1;
            return 0;
        }
        return 0; // Default sorting logic for other columns
    });
}

// Filter popup for column headers
function showColumnFilterPopup(column, targetIcon) {
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
        applyColumnFilter(column, min === '' ? undefined : min, max === '' ? undefined : max);
        popup.remove();
    });
    popup.querySelector('.clear-column-filter').addEventListener('click', () => {
        clearColumnFilter(column);
        popup.remove();
    });
    // Click outside to close
    const clickOutsideHandler = (event) => {
        if (!popup.contains(event.target) && event.target !== targetIcon && !targetIcon.contains(event.target)) {
            popup.remove();
            document.removeEventListener('click', clickOutsideHandler, true);
        }
    };
    setTimeout(() => document.addEventListener('click', clickOutsideHandler, true), 0);
}

// Helper for formatting numbers
function formatNumber(value) {
    const num = parseFloat(value);
    return !isNaN(num) ? num.toFixed(2) : value;
}

// Helper: Convert array of indices to compact range string (e.g., 1-4, 6)
function indicesToRanges(indices) {
    if (!Array.isArray(indices) || indices.length === 0) return '';
    const sorted = Array.from(new Set(indices)).map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b);
    let result = [];
    let start = sorted[0], end = sorted[0];
    for (let i = 1; i <= sorted.length; i++) {
        if (sorted[i] === end + 1) {
            end = sorted[i];
        } else {
            if (start === end) {
                result.push(`${start}`);
            } else {
                result.push(`${start}-${end}`);
            }
            start = sorted[i];
            end = sorted[i];
        }
    }
    return result.join(', ');
}

// Table rendering with filtering, sorting, and pagination
export function renderTable() {
    const tableBody = document.querySelector('#dataTable tbody');
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="10" class="loading"><i class="fas fa-spinner"></i><p>Loading data...</p></td></tr>';
    setTimeout(() => {
        let filteredData = [...state.tableData];
        // Protein filter
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
                // Only show rows where Protein1 and Protein2 are exactly the selected pair (in either order)
                const [pA, pB] = state.selectedProteins;
                filteredData = filteredData.filter(row => {
                    // Allow dimers (pA == pB)
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
        // All filters (sidebar + header) - now only columnFilters
        if (state.columnFilters) {
            Object.entries(state.columnFilters).forEach(([columnName, filter]) => {
                filteredData = filteredData.filter(row => {
                    const value = parseFloat(row[columnName]);
                    if (isNaN(value)) return false; // Rows without a valid number for a filtered column are excluded

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

        // --- New callback invocation ---
        if (typeof onFilteredDataUpdated === 'function') {
            onFilteredDataUpdated(filteredData);
        }
        // --- End new callback invocation ---

        // Sorting
        if (state.currentSort && state.currentSort.column) {
            filteredData.sort((a, b) => {
                let aValue = a[state.currentSort.column];
                let bValue = b[state.currentSort.column];
                const numericColumns = ['min_pae', 'avg_pae', 'iptm', 'pdockq', 'max_promiscuity', 'rop', 'size', 'evenness'];
                if (numericColumns.includes(state.currentSort.column)) {
                    aValue = parseFloat(aValue);
                    bValue = parseFloat(bValue);
                    if (isNaN(aValue) && isNaN(bValue)) return 0;
                    if (isNaN(aValue)) return 1;
                    if (isNaN(bValue)) return -1;
                } else {
                    aValue = String(aValue).toLowerCase();
                    bValue = String(bValue).toLowerCase();
                }
                if (aValue < bValue) return state.currentSort.direction === 'asc' ? -1 : 1;
                if (aValue > bValue) return state.currentSort.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        // Pagination
        if (state.updatePaginationUI) state.updatePaginationUI(filteredData.length);
        const start = (state.currentPage - 1) * state.rowsPerPage;
        const end = Math.min(start + state.rowsPerPage, filteredData.length);
        const pageData = filteredData.slice(start, end);
        tableBody.innerHTML = '';

        // Get column order from <th data-column="...">
        const table = document.getElementById('dataTable');
        const ths = table ? table.querySelectorAll('thead th[data-column]') : [];
        const columnOrder = Array.from(ths).map(th => th.getAttribute('data-column'));

        // Determine the query protein if on a specific protein page
        const queryProteinName = (state.selectedProteins && state.selectedProteins.length === 1 && state.searchMode === "includes") ? state.selectedProteins[0] : null;

        if (pageData.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="${columnOrder.length || 10}" class="loading"><p>No data matches your current filters.</p></td></tr>`;
        } else {
            pageData.forEach(row => {
                const tr = document.createElement('tr');

                // --- Assemble interaction link ONCE per row ---
                // Parse domain IDs and locations
                const protein1Domain = row.Protein1_Domain || "";
                const protein2Domain = row.Protein2_Domain || "";
                const p1Base = row.Protein1 || "";
                const p2Base = row.Protein2 || "";
                const p1DomainParts = protein1Domain.split('_F');
                const f1Id = p1DomainParts.length > 1 ? `F${p1DomainParts[1]}` : '';
                const p2DomainParts = protein2Domain.split('_F');
                const f2Id = p2DomainParts.length > 1 ? `F${p2DomainParts[1]}` : '';
                let f1Loc = '', f2Loc = '';
                let absLoc = {}, relLoc = {};
                // Parse absolute_location
                if (row.absolute_location && typeof row.absolute_location === 'string') {
                    try {
                        absLoc = JSON.parse(row.absolute_location.replace(/'/g, '"'));
                    } catch {}
                }
                // Parse location (fragment-relative)
                if (row.location && typeof row.location === 'string') {
                    try {
                        relLoc = JSON.parse(row.location.replace(/'/g, '"'));
                    } catch {}
                }
                // Normalize keys to lowercase for both
                const absKeys = Object.keys(absLoc).reduce((acc, k) => { acc[k.toLowerCase()] = absLoc[k]; return acc; }, {});
                const relKeys = Object.keys(relLoc).reduce((acc, k) => { acc[k.toLowerCase()] = relLoc[k]; return acc; }, {});

                // Helper to get first value from array or string range
                function getFirstVal(val) {
                    if (Array.isArray(val) && val.length > 0) return Number(val[0]);
                    if (typeof val === 'string') {
                        // Try to parse as "1-4,6" or "5"
                        const match = val.match(/^(\d+)/);
                        if (match) return Number(match[1]);
                    }
                    return undefined;
                }

                // Get absolute and relative first positions for each protein
                let absF1 = getFirstVal(absKeys['protein1'] || absKeys['chaina'] || absKeys['chain a']);
                let absF2 = getFirstVal(absKeys['protein2'] || absKeys['chainb'] || absKeys['chain b']);
                let relF1 = getFirstVal(relKeys['protein1'] || relKeys['chaina'] || relKeys['chain a']);
                let relF2 = getFirstVal(relKeys['protein2'] || relKeys['chainb'] || relKeys['chain b']);

                // Compute shifts if both values exist
                let f1_shift = '', f2_shift = '';
                if (typeof absF1 === 'number' && typeof relF1 === 'number') {
                    f1_shift = absF1 - relF1;
                }
                if (typeof absF2 === 'number' && typeof relF2 === 'number') {
                    f2_shift = absF2 - relF2;
                }

                // --- Use absolute_location for f1_loc and f2_loc in the link ---
                // Helper: Convert array of indices to compact range string (e.g., 1-4, 6)
                function indicesToRanges(indices) {
                    if (!Array.isArray(indices) || indices.length === 0) return '';
                    const sorted = Array.from(new Set(indices)).map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b);
                    let result = [];
                    let start = sorted[0], end = sorted[0];
                    for (let i = 1; i <= sorted.length; i++) {
                        if (sorted[i] === end + 1) {
                            end = sorted[i];
                        } else {
                            if (start === end) {
                                result.push(`${start}`);
                            } else {
                                result.push(`${start}-${end}`);
                            }
                            start = sorted[i];
                            end = sorted[i];
                        }
                    }
                    return result.join(', ');
                }

                // Set f1Loc and f2Loc to absolute_location ranges
                if (absKeys['protein1']) {
                    f1Loc = indicesToRanges(absKeys['protein1']);
                } else if (absKeys['chaina']) {
                    f1Loc = indicesToRanges(absKeys['chaina']);
                } else if (absKeys['chain a']) {
                    f1Loc = indicesToRanges(absKeys['chain a']);
                } else {
                    f1Loc = '';
                }
                if (absKeys['protein2']) {
                    f2Loc = indicesToRanges(absKeys['protein2']);
                } else if (absKeys['chainb']) {
                    f2Loc = indicesToRanges(absKeys['chainb']);
                } else if (absKeys['chain b']) {
                    f2Loc = indicesToRanges(absKeys['chain b']);
                } else {
                    f2Loc = '';
                }

                // --- Round pdockq, iptm, min_pae, avg_pae to 2dp for the link ---
                function round2(val) {
                    const num = Number(val);
                    return isNaN(num) ? '' : num.toFixed(2);
                }
                const pdockq2 = round2(row.pdockq);
                const iptm2 = round2(row.iptm);
                const min_pae2 = round2(row.min_pae);
                const avg_pae2 = round2(row.avg_pae);

                const interactionLink = `interaction.html?&p1=${encodeURIComponent(p1Base)}&p2=${encodeURIComponent(p2Base)}&f1_id=${encodeURIComponent(f1Id)}&f2_id=${encodeURIComponent(f2Id)}&f1_loc=${encodeURIComponent(f1Loc)}&f2_loc=${encodeURIComponent(f2Loc)}&iptm=${encodeURIComponent(iptm2)}&min_pae=${encodeURIComponent(min_pae2)}&avg_pae=${encodeURIComponent(avg_pae2)}&rop=${encodeURIComponent(row.rop)}&pdockq=${encodeURIComponent(pdockq2)}&f1_shift=${encodeURIComponent(f1_shift)}&f2_shift=${encodeURIComponent(f2_shift)}`;
                // --- END interaction link assembly ---

                columnOrder.forEach(col => {
                    let cellHtml = ''; // Default to empty, specific handlers will populate
                    // Custom rendering for certain columns
                    if (col === 'Proteins') {
                        // Only for index.html
                        cellHtml = `<a href="${interactionLink}">${row.Proteins}</a>`;
                    } else if (col === 'query_fragment') {
                        cellHtml = 'N/A'; // Default value

                        if (queryProteinName) { // If we are on a specific protein's page
                            let domainToParse = null;
                            let baseNameOfQueryInRow = null;

                            if (row.Protein1 === queryProteinName) {
                                domainToParse = row.Protein1_Domain;
                                baseNameOfQueryInRow = row.Protein1;
                            } else if (row.Protein2 === queryProteinName) {
                                domainToParse = row.Protein2_Domain;
                                baseNameOfQueryInRow = row.Protein2;
                            }

                            if (domainToParse) {
                                const expectedPrefix = queryProteinName + "_F"; // Use the page's query protein name for prefix
                                if (domainToParse.startsWith(expectedPrefix)) {
                                    const numberPart = domainToParse.substring(expectedPrefix.length);
                                    if (/^\d+$/.test(numberPart)) { // Check if it's purely digits
                                        cellHtml = "F" + numberPart;
                                    } else {
                                        // Starts with "Name_F" but not followed by number, e.g. "Name_Fabc"
                                        cellHtml = domainToParse; // Show full domain name
                                    }
                                } else {
                                    // Does not start with "Name_F", e.g. "Name_MotifX" or just "Name"
                                    cellHtml = domainToParse; // Show full domain name
                                }
                            } else if (baseNameOfQueryInRow) {
                                // Domain field was missing, but we identified the query protein in the row
                                cellHtml = baseNameOfQueryInRow; // Show its base name
                            }
                            // If queryProteinName was set, but neither row.Protein1 nor row.Protein2 matched it,
                            // or if the matched protein had no _Domain field and no baseNameOfQueryInRow was set,
                            // cellHtml remains 'N/A' (its initial default for this block).
                        } else {
                            // Fallback for non-protein specific pages (e.g., index.html)
                            // Show Protein1_Domain or Protein1 as a general default for this column.
                            if (row.Protein1_Domain) { cellHtml = row.Protein1_Domain; }
                            else if (row.Protein1) { cellHtml = row.Protein1; }
                            // else cellHtml remains 'N/A'
                        }
                        // Ensure final cellHtml is not undefined/null
                        cellHtml = cellHtml !== undefined && cellHtml !== null ? cellHtml : 'N/A';
                    } else if (col === 'partner') { // Partner column
                        let partnerDisplayValue = 'N/A';
                        let partnerBaseName = null, partnerDomain = null;
                        if (queryProteinName) {
                            if (row.Protein1 && row.Protein1 !== queryProteinName) {
                                partnerDisplayValue = row.Protein1_Domain || row.Protein1;
                                partnerBaseName = row.Protein1;
                                partnerDomain = row.Protein1_Domain;
                            } else {
                                partnerDisplayValue = row.Protein2_Domain || row.Protein2;
                                partnerBaseName = row.Protein2;
                                partnerDomain = row.Protein2_Domain;
                            }
                        } else {
                            partnerDisplayValue = row.Protein2_Domain || row.Protein2;
                            partnerBaseName = row.Protein2;
                            partnerDomain = row.Protein2_Domain;
                        }
                        // Use precomputed interactionLink
                        cellHtml = `<a href="${interactionLink}">${partnerDisplayValue !== undefined && partnerDisplayValue !== null ? partnerDisplayValue : 'N/A'}</a>`;
                    } else if (col === 'partner_id') {
                        cellHtml = 'N/A'; // Default
                        let partnerBaseName = null;

                        if (queryProteinName) {
                            // On a specific protein page, determine the *other* protein's base name
                            if (row.Protein1 === queryProteinName) {
                                partnerBaseName = row.Protein2;
                            } else if (row.Protein2 === queryProteinName) {
                                partnerBaseName = row.Protein1;
                            } else {
                                // Fallback if queryProteinName doesn't match Protein1 or Protein2 (should be rare)
                                // or if data implies Protein2 is the target for Uniprot ID.
                                partnerBaseName = row.Protein2;
                            }
                        } else {
                            // On a general page (e.g., index.html), Protein2 is the nominal partner
                            // for whom Uniprot_id and Category are typically shown.
                            partnerBaseName = row.Protein2;
                        }

                        if (partnerBaseName && state.proteinNameToAccessionMap && state.proteinNameToAccessionMap[partnerBaseName]) {
                            const accessionId = state.proteinNameToAccessionMap[partnerBaseName];
                            cellHtml = `<a href="https://www.uniprot.org/uniprotkb/${accessionId}/entry" target="_blank" rel="noopener noreferrer">${accessionId}</a>`;
                        } else if (row.Uniprot_id) { // Fallback to the Uniprot_id from the main CSV if map fails or no partner name
                            cellHtml = row.Uniprot_id; // Display as plain text
                        }
                        // else cellHtml remains 'N/A'
                        cellHtml = cellHtml !== undefined && cellHtml !== null ? cellHtml : 'N/A';
                    } else if (col === 'function') {
                        cellHtml = 'N/A'; // Default
                        let partnerBaseName = null;

                        if (queryProteinName) {
                            // On a specific protein page, determine the *other* protein's base name
                            if (row.Protein1 === queryProteinName) {
                                partnerBaseName = row.Protein2;
                            } else if (row.Protein2 === queryProteinName) {
                                partnerBaseName = row.Protein1;
                            } else {
                                partnerBaseName = row.Protein2; // Fallback
                            }
                        } else {
                            // On a general page (e.g., index.html), Protein2 is the nominal partner
                            partnerBaseName = row.Protein2;
                        }

                        if (partnerBaseName && state.proteinNameToCategoryMap && state.proteinNameToCategoryMap[partnerBaseName]) {
                            cellHtml = state.proteinNameToCategoryMap[partnerBaseName];
                        } else if (row.Category) { // Fallback to the Category from the main CSV if map fails
                            cellHtml = row.Category;
                        }
                        // else cellHtml remains 'N/A'
                        cellHtml = cellHtml !== undefined && cellHtml !== null ? cellHtml : 'N/A';
                    } else if (col === 'location') {
                        // Location cell rendering
                        let protein1Name = row.Protein1 || 'Protein 1';
                        let protein2Name = row.Protein2 || 'Protein 2';
                        let p1LocationVal = 'N/A', p2LocationVal = 'N/A';
                        let absF1Loc = '', absF2Loc = '';
                        // --- Use absolute_location and show only protein names as labels ---
                        if (row.absolute_location && typeof row.absolute_location === 'string') {
                            try {
                                const absLocData = JSON.parse(row.absolute_location.replace(/'/g, '"'));
                                const keys = Object.keys(absLocData).reduce((acc, k) => { acc[k.toLowerCase()] = absLocData[k]; return acc; }, {});
                                if (Array.isArray(keys['protein1'])) {
                                    p1LocationVal = indicesToRanges(keys['protein1']);
                                    absF1Loc = p1LocationVal;
                                } else if (Array.isArray(keys['chaina'])) {
                                    p1LocationVal = indicesToRanges(keys['chaina']);
                                    absF1Loc = p1LocationVal;
                                } else if (Array.isArray(keys['chain a'])) {
                                    p1LocationVal = indicesToRanges(keys['chain a']);
                                    absF1Loc = p1LocationVal;
                                } else {
                                    p1LocationVal = 'N/A';
                                    absF1Loc = '';
                                }
                                if (Array.isArray(keys['protein2'])) {
                                    p2LocationVal = indicesToRanges(keys['protein2']);
                                    absF2Loc = p2LocationVal;
                                } else if (Array.isArray(keys['chainb'])) {
                                    p2LocationVal = indicesToRanges(keys['chainb']);
                                    absF2Loc = p2LocationVal;
                                } else if (Array.isArray(keys['chain b'])) {
                                    p2LocationVal = indicesToRanges(keys['chain b']);
                                    absF2Loc = p2LocationVal;
                                } else {
                                    p2LocationVal = 'N/A';
                                    absF2Loc = '';
                                }
                            } catch {}
                        } else if (row.Protein1_Location && row.Protein2_Location) {
                            p1LocationVal = row.Protein1_Location;
                            p2LocationVal = row.Protein2_Location;
                            absF1Loc = p1LocationVal;
                            absF2Loc = p2LocationVal;
                        }
                        const locationCellContent = `<div class="location-cell-content"><div><strong>${protein1Name}</strong>: ${p1LocationVal}</div><div><strong>${protein2Name}</strong>: ${p2LocationVal}</div></div>`;
                        // Only make location a link in pair-exact mode with two selected proteins
                        if (state.searchMode === "pair-exact" && state.selectedProteins && state.selectedProteins.length === 2) {
                            // Use precomputed interactionLink
                            cellHtml = `<a href="${interactionLink}">${locationCellContent}</a>`;
                        } else {
                            cellHtml = locationCellContent;
                        }
                    } else if (col === 'relative_location') {
                        // Relative Location cell rendering
                        const protein1DomainName = row.Protein1_Domain || 'Protein 1 Domain';
                        const protein2DomainName = row.Protein2_Domain || 'Protein 2 Domain';
                        let p1RelLocationVal = 'N/A', p2RelLocationVal = 'N/A';

                        if (row.location && typeof row.location === 'string') {
                            try {
                                const relLocData = JSON.parse(row.location.replace(/'/g, '"'));
                                const keys = Object.keys(relLocData).reduce((acc, k) => { acc[k.toLowerCase()] = relLocData[k]; return acc; }, {});
                                
                                const val1 = keys['protein1'] || keys['chaina'] || keys['chain a'];
                                if (Array.isArray(val1)) {
                                    p1RelLocationVal = indicesToRanges(val1);
                                } else if (typeof val1 === 'string' && val1) {
                                    p1RelLocationVal = val1;
                                }

                                const val2 = keys['protein2'] || keys['chainb'] || keys['chain b'];
                                if (Array.isArray(val2)) {
                                    p2RelLocationVal = indicesToRanges(val2);
                                } else if (typeof val2 === 'string' && val2) {
                                    p2RelLocationVal = val2;
                                }
                            } catch {}
                        }
                        
                        cellHtml = `<div class="location-cell-content"><div><strong>${protein1DomainName}</strong>: ${p1RelLocationVal}</div><div><strong>${protein2DomainName}</strong>: ${p2RelLocationVal}</div></div>`;
                    } else if (col === 'min_pae' || col === 'avg_pae' || col === 'iptm' || col === 'pdockq' || col === 'evenness') {
                        cellHtml = formatNumber(row[col]);
                    } else if (col === 'max_promiscuity' || col === 'rop' || col === 'size') {
                        cellHtml = (typeof row[col] === 'number' && !isNaN(row[col])) ? Math.round(row[col]) : 'N/A';
                    } else if (col && row[col] !== undefined) {
                        cellHtml = row[col];
                    } else {
                        cellHtml = 'N/A'; // Default for any other unhandled columns or undefined data
                    }
                    const td = document.createElement('td');
                    td.innerHTML = cellHtml;

                    // Add color coding class
                    if (statColorFunctions[col]) {
                        const colorClass = statColorFunctions[col](row[col]);
                        if (colorClass) {
                            td.classList.add(colorClass);
                        }
                    }

                    tr.appendChild(td);
                });
                tableBody.appendChild(tr);
            });
        }
        if (state.updateStatsUI) state.updateStatsUI(filteredData, state.tableData);
    }, 30);
}

// Delegated event handler for protein links (only set up once)
export function initProteinLinkListener() {
    const tableBody = document.querySelector('#dataTable tbody');
    if (!tableBody || tableBody.dataset.proteinLinkListenerAttached === 'true') return;
    tableBody.addEventListener('click', function(e) {
        const link = e.target.closest('a');
        if (link && link.closest('td') && link.closest('tr') && link.closest('#dataTable')) {
            if (link.getAttribute('href') && link.getAttribute('href').startsWith('interaction.html?')) {
                e.preventDefault();
                window.location.href = link.getAttribute('href');
            }
        }
    });
    tableBody.dataset.proteinLinkListenerAttached = 'true';
}