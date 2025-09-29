import { loadInteractionData, loadProteinMetadata, parseLocation, indicesToRanges } from './data.js';
import { statColorConfig, getStatColor } from './stats.js';
import { showColumnFilterPopup, applyFiltersToData } from './filter.js';
import { paginateData } from './pagination.js';

export const state = {
    tableData: [],
    columnDescriptions: {},
    currentSort: { column: null, direction: null },
    columnFilters: {},
    selectedProteins: [],
    searchMode: "includes",
    currentPage: 1,
    rowsPerPage: 25,
    proteinNameToAccessionMap: {},
    proteinNameToCategoryMap: {},
    uniqueProteins: new Set(),
    updatePaginationUI: null,
    updateStatsUI: null,
    onFiltersChanged: null,
    onFilteredDataUpdated: null,

    setState(updates, options = { render: true }) {
        Object.assign(this, updates);
        
        if (updates.columnFilters && this.onFiltersChanged) {
            this.onFiltersChanged();
        }
        
        if (options.render && (updates.tableData || updates.columnFilters || 
            updates.currentPage || updates.selectedProteins)) {
            renderTable();
        }
    }
};

export const { setState } = state;

export function setTableData(data) { state.setState({ tableData: data }); }
export function setColumnDescriptions(desc) { state.setState({ columnDescriptions: desc }); }
export function setCurrentSort(sort) { state.setState({ currentSort: sort }); }
export function setSearchMode(mode) { state.setState({ searchMode: mode }); }
export function setCurrentPage(page) { state.setState({ currentPage: page }); }
export function setProteinNameToAccessionMap(map) { state.setState({ proteinNameToAccessionMap: map }); }
export function setProteinNameToCategoryMap(map) { state.setState({ proteinNameToCategoryMap: map }); }

export async function loadTableData() {
    try {
        const [interactions, metadata] = await Promise.all([
            loadInteractionData(),
            loadProteinMetadata()
        ]);
        
        setTableData(interactions);

        state.uniqueProteins.clear();
        interactions.forEach(row => {
            if (row.Protein1) state.uniqueProteins.add(row.Protein1);
            if (row.Protein2) state.uniqueProteins.add(row.Protein2);
            if (row.Protein1_Domain) state.uniqueProteins.add(row.Protein1_Domain);
            if (row.Protein2_Domain) state.uniqueProteins.add(row.Protein2_Domain);
        });

        const accessionMap = {};
        const categoryMap = {};
        metadata.forEach((data, proteinName) => {
            if (data.accessionId) accessionMap[proteinName] = data.accessionId;
            if (data.category) categoryMap[proteinName] = data.category;
        });
        
        setProteinNameToAccessionMap(accessionMap);
        setProteinNameToCategoryMap(categoryMap);
        
        return interactions;
    } catch (error) {
        console.error('Failed to load table data:', error);
        setTableData([]);
        setProteinNameToAccessionMap({});
        setProteinNameToCategoryMap({});
        state.uniqueProteins.clear();
        return [];
    }
}

export function initTable() {
    initColumnHeaders();
    sortTable('min_pae');
    if (typeof state.updatePaginationUI !== 'function') {
        import('./pagination.js').then(module => {
            module.initPagination();
        });
    }
}

function initColumnHeaders() {
    document.querySelectorAll('th[data-column]').forEach(header => {
        const column = header.dataset.column;
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
        let filterIcon = header.querySelector('.filter-icon');
        if (filterIcon && column !== 'Proteins' && column !== 'location') {
            filterIcon.addEventListener('click', (e) => {
                e.stopPropagation();
                showColumnFilterPopup(column, filterIcon);
            });
        } else if (filterIcon) {
            filterIcon.style.display = 'none';
        }
        if (column !== 'location' && column !== 'relative_location') {
            header.classList.add('sortable');
            header.addEventListener('click', (event) => {
                if (event.target.closest('.filter-icon') || event.target.closest('.info-btn')) return;
                sortTable(column);
            });
        }
    });
}

export function sortTable(column) {
    const numericColumns = ['min_pae', 'avg_pae', 'iptm', 'pdockq', 'max_promiscuity', 'rop', 'size', 'evenness'];
    if (state.currentSort.column === column) {
        state.currentSort.direction = state.currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else if (numericColumns.includes(column)) {
        state.currentSort = {
            column,
            direction: ['min_pae', 'avg_pae', 'max_promiscuity'].includes(column) ? 'asc' : 'desc'
        };
    } else {
        state.currentSort = {
            column,
            direction: 'asc'
        };
    }

    const sortedData = [...state.tableData].sort((a, b) => {
        let aValue = a[column];
        let bValue = b[column];

        if (numericColumns.includes(column)) {
            aValue = parseFloat(aValue);
            bValue = parseFloat(bValue);
            if (isNaN(aValue) && isNaN(bValue)) return 0;
            if (isNaN(aValue)) return 1;
            if (isNaN(bValue)) return -1;
        } else {
            aValue = String(aValue || '').toLowerCase();
            bValue = String(bValue || '').toLowerCase();
        }

        if (aValue < bValue) return state.currentSort.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return state.currentSort.direction === 'asc' ? 1 : -1;
        return 0;
    });

    state.setState({ tableData: sortedData });
}

function formatNumber(value) {
    const num = parseFloat(value);
    return !isNaN(num) ? num.toFixed(2) : value;
}

function createLocationCellContent(proteinName, locationData, domainName) {
    let locationVal = 'N/A';
    if (locationData) {
        try {
            const parsedData = parseLocation(locationData);
            const keys = Object.keys(parsedData).reduce((acc, k) => {
                acc[k.toLowerCase()] = parsedData[k];
                return acc;
            }, {});
            const val = keys[proteinName.toLowerCase()] || keys[`chain${proteinName.toLowerCase()}`];
            if (Array.isArray(val)) {
                locationVal = indicesToRanges(val);
            } else if (typeof val === 'string' && val) {
                locationVal = val;
            }
        } catch {}
    }
    return `<div class="location-cell-content"><div><strong>${domainName}</strong>: ${locationVal}</div></div>`;
}

function createInteractionLink(row) {
    const protein1Domain = row.Protein1_Domain || "";
    const protein2Domain = row.Protein2_Domain || "";
    const [p1Name, f1Id] = protein1Domain.split('_');
    const [p2Name, f2Id] = protein2Domain.split('_');

    let absLoc = {}, relLoc = {};
    if (row.absolute_location) {
        absLoc = parseLocation(row.absolute_location);
    }
    if (row.location) {
        relLoc = parseLocation(row.location);
    }

    const p1Loc = indicesToRanges(absLoc.protein1 || absLoc.chainA);
    const p2Loc = indicesToRanges(absLoc.protein2 || absLoc.chainB);

    const intStartP1 = p1Loc[0];
    const intStartP2 = p2Loc[0];
    const intStartF1 = relLoc.protein1?.[0] || relLoc.chainA?.[0];
    const intStartF2 = relLoc.protein2?.[0] || relLoc.chainB?.[0];

    const f1_shift = intStartP1 - intStartF1;
    const f2_shift = intStartP2 - intStartF2;

    return `interaction.html?&p1=${encodeURIComponent(p1Name)}` +
        `&p2=${encodeURIComponent(p2Name)}` +
        `&f1_id=${encodeURIComponent(f1Id)}` +
        `&f2_id=${encodeURIComponent(f2Id)}` +
        `&f1_loc=${encodeURIComponent(p1Loc)}` +
        `&f2_loc=${encodeURIComponent(p2Loc)}` +
        `&iptm=${encodeURIComponent(formatNumber(row.iptm))}` +
        `&min_pae=${encodeURIComponent(formatNumber(row.min_pae))}` +
        `&avg_pae=${encodeURIComponent(formatNumber(row.avg_pae))}` +
        `&rop=${encodeURIComponent(row.rop)}` +
        `&pdockq=${encodeURIComponent(formatNumber(row.pdockq))}` +
        `&f1_shift=${encodeURIComponent(f1_shift)}` +
        `&f2_shift=${encodeURIComponent(f2_shift)}`;
}

export function addInteractionLinksToFirstColumn() {
    const tableBody = document.querySelector('#dataTable tbody');
    if (!tableBody) return;

    const rows = tableBody.querySelectorAll('tr');
    rows.forEach(row => {
        const firstCell = row.querySelector('td:first-child');
        if (firstCell && !firstCell.querySelector('a')) {
            const interactionLink = row.dataset.interactionLink;
            if (interactionLink) {
                firstCell.innerHTML = `<a href="${interactionLink}">${firstCell.innerHTML}</a>`;
            }
        }
    });
}

function renderCellContent(col, row, queryProteinName) {
    let cellHtml = 'N/A';
    if (col === 'query_fragment') {
        if (queryProteinName) {
            cellHtml = row.Protein1 === queryProteinName
                ? row.Protein1_Domain || row.Protein1
                : row.Protein2_Domain || row.Protein2;
        } else {
            cellHtml = row.Protein1_Domain || row.Protein1 || 'N/A';
        }
    } else if (col === 'partner') {
        const partnerName = row.Protein1 === queryProteinName ? row.Protein2 : row.Protein1;
        cellHtml = partnerName || 'N/A';
    } else if (col === 'partner_id') {
        const partnerProtein = row.Protein1 === queryProteinName ? row.Protein2 : row.Protein1;
        cellHtml = state.proteinNameToAccessionMap[partnerProtein] || 'N/A';
    } else if (col === 'function') {
        const partnerProtein = row.Protein1 === queryProteinName ? row.Protein2 : row.Protein1;
        cellHtml = state.proteinNameToCategoryMap[partnerProtein] || 'N/A';
    } else if (col === 'location') {
        cellHtml = createLocationCellContent('protein1', row.absolute_location, row.Protein1 || 'Protein 1') +
                   createLocationCellContent('protein2', row.absolute_location, row.Protein2 || 'Protein 2');
    } else if (col === 'relative_location') {
        cellHtml = createLocationCellContent('protein1', row.location, row.Protein1_Domain || 'Protein 1 Domain') +
                   createLocationCellContent('protein2', row.location, row.Protein2_Domain || 'Protein 2 Domain');
    } else if (['min_pae', 'avg_pae', 'iptm', 'pdockq', 'evenness'].includes(col)) {
        cellHtml = formatNumber(row[col]);
    } else if (['max_promiscuity', 'rop', 'size'].includes(col)) {
        cellHtml = (typeof row[col] === 'number' && !isNaN(row[col])) ? Math.round(row[col]) : 'N/A';
    } else if (col && row[col] !== undefined) {
        cellHtml = row[col];
    }
    return cellHtml;
}

export function renderTable() {
    const tableBody = document.querySelector('#dataTable tbody');
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="10" class="loading"><i class="fas fa-spinner"></i><p>Loading data...</p></td></tr>';

    setTimeout(() => {
                let filteredData = applyFiltersToData(state.tableData);

        if (typeof state.onFilteredDataUpdated === 'function') {
            state.onFilteredDataUpdated(filteredData);
        }

        if (state.updatePaginationUI) state.updatePaginationUI(filteredData.length);
        const pageData = paginateData(filteredData, state.currentPage, state.rowsPerPage);
        tableBody.innerHTML = '';

        const table = document.getElementById('dataTable');
        const ths = table ? table.querySelectorAll('thead th[data-column]') : [];
        const columnOrder = Array.from(ths).map(th => th.getAttribute('data-column'));

        const queryProteinName = (state.selectedProteins && state.selectedProteins.length === 1 && state.searchMode === "includes") ? state.selectedProteins[0] : null;

        if (pageData.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="${columnOrder.length || 10}" class="loading"><p>No data matches your current filters.</p></td></tr>`;
        } else {
            pageData.forEach(row => {
                const tr = document.createElement('tr');
                const interactionLink = createInteractionLink(row, row.Protein1, row.Protein2);
                tr.setAttribute('data-interaction-link', interactionLink);

                columnOrder.forEach(col => {
                    const td = document.createElement('td');
                    td.innerHTML = renderCellContent(col, row, queryProteinName);
                    if (statColorConfig[col]) {
                        const colorClass = getStatColor(row[col], statColorConfig[col]);
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
        addInteractionLinksToFirstColumn();
    }, 30);
}
