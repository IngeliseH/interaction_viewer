import { loadInteractionData, loadProteinMetadata, parseLocation, indicesToRanges } from './data.js';
import { statColorConfig, getStatColor } from './stats.js';
import { showColumnFilterPopup } from './filter.js';

export const state = {
    tableData: [],
    columnDescriptions: {},
    currentSort: { column: 'min_pae', direction: 'asc' },
    columnFilters: {},
    selectedProteins: [],
    searchMode: "includes",
    currentPage: 1,
    rowsPerPage: 25,
    proteinNameToAccessionMap: {},
    proteinNameToCategoryMap: {},
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
        
        // Process metadata for accession and category maps
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
        return [];
    }
}

export function initTable() {
    initColumnHeaders();
    initProteinLinkListener();
    // Initialize pagination if not already initialized
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
        return 0;
    });
}

function formatNumber(value) {
    const num = parseFloat(value);
    return !isNaN(num) ? num.toFixed(2) : value;
}

export function renderTable() {
    const tableBody = document.querySelector('#dataTable tbody');
    if (!tableBody) return;
    tableBody.innerHTML = '<tr><td colspan="10" class="loading"><i class="fas fa-spinner"></i><p>Loading data...</p></td></tr>';
    setTimeout(() => {
        let filteredData = [...state.tableData];
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

        if (typeof state.onFilteredDataUpdated === 'function') {
            state.onFilteredDataUpdated(filteredData);
        }

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
        if (state.updatePaginationUI) state.updatePaginationUI(filteredData.length);
        const start = (state.currentPage - 1) * state.rowsPerPage;
        const end = Math.min(start + state.rowsPerPage, filteredData.length);
        const pageData = filteredData.slice(start, end);
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
                
                const protein1Domain = row.Protein1_Domain || "";
                const protein2Domain = row.Protein2_Domain || "";
                const p1Base = row.Protein1 || "";
                const p2Base = row.Protein2 || "";
                const p1DomainParts = protein1Domain.split('_F');
                const f1Id = p1DomainParts.length > 1 ? `F${p1DomainParts[1]}` : '';
                const p2DomainParts = protein2Domain.split('_F');
                const f2Id = p2DomainParts.length > 1 ? `F${p2DomainParts[1]}` : '';
                
                let absLoc = {}, relLoc = {};
                let f1Loc = '', f2Loc = '';
                let f1_shift = '', f2_shift = '';

                if (row.absolute_location) {
                    absLoc = parseLocation(row.absolute_location);
                }
                if (row.location) {
                    relLoc = parseLocation(row.location);
                }

                if (absLoc.protein1) {
                    f1Loc = indicesToRanges(absLoc.protein1);
                } else if (absLoc.chainA) {
                    f1Loc = indicesToRanges(absLoc.chainA);
                }
                if (absLoc.protein2) {
                    f2Loc = indicesToRanges(absLoc.protein2);
                } else if (absLoc.chainB) {
                    f2Loc = indicesToRanges(absLoc.chainB);
                }

                const absF1 = absLoc.protein1?.[0] || absLoc.chainA?.[0];
                const absF2 = absLoc.protein2?.[0] || absLoc.chainB?.[0];
                const relF1 = relLoc.protein1?.[0] || relLoc.chainA?.[0];
                const relF2 = relLoc.protein2?.[0] || relLoc.chainB?.[0];

                if (absF1 !== undefined && relF1 !== undefined) {
                    f1_shift = absF1 - relF1;
                }
                if (absF2 !== undefined && relF2 !== undefined) {
                    f2_shift = absF2 - relF2;
                }

                const interactionLink = `interaction.html?&p1=${encodeURIComponent(p1Base)}` +
                    `&p2=${encodeURIComponent(p2Base)}` +
                    `&f1_id=${encodeURIComponent(f1Id)}` +
                    `&f2_id=${encodeURIComponent(f2Id)}` +
                    `&f1_loc=${encodeURIComponent(f1Loc)}` +
                    `&f2_loc=${encodeURIComponent(f2Loc)}` +
                    `&iptm=${encodeURIComponent(formatNumber(row.iptm))}` +
                    `&min_pae=${encodeURIComponent(formatNumber(row.min_pae))}` +
                    `&avg_pae=${encodeURIComponent(formatNumber(row.avg_pae))}` +
                    `&rop=${encodeURIComponent(row.rop)}` +
                    `&pdockq=${encodeURIComponent(formatNumber(row.pdockq))}` +
                    `&f1_shift=${encodeURIComponent(f1_shift)}` +
                    `&f2_shift=${encodeURIComponent(f2_shift)}`;

                columnOrder.forEach(col => {
                    let cellHtml = '';
                    if (col === 'Proteins') {
                        cellHtml = `<a href="${interactionLink}">${row.Proteins}</a>`;
                    } else if (col === 'query_fragment') {
                        cellHtml = 'N/A';
                        if (queryProteinName) {
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
                                const expectedPrefix = queryProteinName + "_F";
                                if (domainToParse.startsWith(expectedPrefix)) {
                                    const numberPart = domainToParse.substring(expectedPrefix.length);
                                    if (/^\d+$/.test(numberPart)) {
                                        cellHtml = "F" + numberPart;
                                    } else {
                                        cellHtml = domainToParse;
                                    }
                                } else {
                                    cellHtml = domainToParse;
                                }
                            } else if (baseNameOfQueryInRow) {
                                cellHtml = baseNameOfQueryInRow;
                            }
                        } else {
                            if (row.Protein1_Domain) { cellHtml = row.Protein1_Domain; }
                            else if (row.Protein1) { cellHtml = row.Protein1; }
                        }
                        cellHtml = cellHtml !== undefined && cellHtml !== null ? cellHtml : 'N/A';
                    } else if (col === 'partner') {
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
                        cellHtml = `<a href="${interactionLink}">${partnerDisplayValue !== undefined && partnerDisplayValue !== null ? partnerDisplayValue : 'N/A'}</a>`;
                    } else if (col === 'partner_id') {
                        cellHtml = 'N/A';
                        let partnerBaseName = null;

                        if (queryProteinName) {
                            if (row.Protein1 === queryProteinName) {
                                partnerBaseName = row.Protein2;
                            } else if (row.Protein2 === queryProteinName) {
                                partnerBaseName = row.Protein1;
                            } else {
                                partnerBaseName = row.Protein2;
                            }
                        } else {
                            partnerBaseName = row.Protein2;
                        }

                        if (partnerBaseName && state.proteinNameToAccessionMap && state.proteinNameToAccessionMap[partnerBaseName]) {
                            const accessionId = state.proteinNameToAccessionMap[partnerBaseName];
                            cellHtml = `<a href="https://www.uniprot.org/uniprotkb/${accessionId}/entry" target="_blank" rel="noopener noreferrer">${accessionId}</a>`;
                        } else if (row.Uniprot_id) {
                            cellHtml = row.Uniprot_id;
                        }
                        cellHtml = cellHtml !== undefined && cellHtml !== null ? cellHtml : 'N/A';
                    } else if (col === 'function') {
                        cellHtml = 'N/A';
                        let partnerBaseName = null;

                        if (queryProteinName) {
                            if (row.Protein1 === queryProteinName) {
                                partnerBaseName = row.Protein2;
                            } else if (row.Protein2 === queryProteinName) {
                                partnerBaseName = row.Protein1;
                            } else {
                                partnerBaseName = row.Protein2;
                            }
                        } else {
                            partnerBaseName = row.Protein2;
                        }

                        if (partnerBaseName && state.proteinNameToCategoryMap && state.proteinNameToCategoryMap[partnerBaseName]) {
                            cellHtml = state.proteinNameToCategoryMap[partnerBaseName];
                        } else if (row.Category) {
                            cellHtml = row.Category;
                        }
                        cellHtml = cellHtml !== undefined && cellHtml !== null ? cellHtml : 'N/A';
                    } else if (col === 'location') {
                                                let protein1Name = row.Protein1 || 'Protein 1';
                        let protein2Name = row.Protein2 || 'Protein 2';
                        let p1LocationVal = 'N/A', p2LocationVal = 'N/A';
                        let absF1Loc = '', absF2Loc = '';
                        if (row.absolute_location) {
                            try {
                                const absLocData = parseLocation(row.absolute_location);
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
                        if (state.searchMode === "pair-exact" && state.selectedProteins && state.selectedProteins.length === 2) {
                            cellHtml = `<a href="${interactionLink}">${locationCellContent}</a>`;
                        } else {
                            cellHtml = locationCellContent;
                        }
                    } else if (col === 'relative_location') {
                        const protein1DomainName = row.Protein1_Domain || 'Protein 1 Domain';
                        const protein2DomainName = row.Protein2_Domain || 'Protein 2 Domain';
                        let p1RelLocationVal = 'N/A', p2RelLocationVal = 'N/A';

                        if (row.location) {
                            try {
                                const relLocData = parseLocation(row.location);
                                const keys = Object.keys(relLocData).reduce((acc, k) => { acc[k.toLowerCase()] = relLocData[k]; return acc; }, {});
                                const val1 = keys['protein1'] || keys['chaina'] || keys['chain a'];
                                const val2 = keys['protein2'] || keys['chainb'] || keys['chain b'];
                                if (Array.isArray(val1)) {
                                    p1RelLocationVal = indicesToRanges(val1);
                                } else if (typeof val1 === 'string' && val1) {
                                    p1RelLocationVal = val1;
                                } else {
                                    p1RelLocationVal = 'N/A';
                                }
                                if (Array.isArray(val2)) {
                                    p2RelLocationVal = indicesToRanges(val2);
                                } else if (typeof val2 === 'string' && val2) {
                                    p2RelLocationVal = val2;
                                } else {
                                    p2RelLocationVal = 'N/A';
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
                        cellHtml = 'N/A';
                    }
                    const td = document.createElement('td');
                    td.innerHTML = cellHtml;
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
    }, 30);
}

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