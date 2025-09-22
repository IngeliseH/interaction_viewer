let _plotInstances = {};

const _globalPlotToggleStates = {
    showUniprotDomains: true,
    showAlphafoldDomains: true,
    showFragments: true
};

const _domainColors = ['#ED7AB0', '#8DC640', '#F68B1F', '#9F83BC', "#FFDD55", '#6DC8BF',
    '#A74399', '#A6ADD3', '#E64425', '#C2C1B1', '#00A45D', '#BA836E',
    '#3E4291'];
let _domainColorIndex = 0;
let _domainBaseIdToColor = {};

function _getDomainColor(baseId) {
    if (!_domainBaseIdToColor[baseId]) {
        _domainBaseIdToColor[baseId] = _domainColors[_domainColorIndex % _domainColors.length];
        _domainColorIndex++;
    }
    return _domainBaseIdToColor[baseId];
}

function _getDefaultPlotInstanceState() {
    return {
        proteinName: null,
        proteinLength: null,
        fragmentIndicesRaw: null,
        alphafoldDomains: null,
        uniprotDomains: null,
        selectors: {
            container: null,
            caption: null,
            subheading: null,
            plotSection: null
        }
    };
}

async function _fetchProteinData(proteinName) {
    try {
        const response = await fetch('all_fragments_2025.06.04.csv');
        if (!response.ok) {
            console.error('Domain/Fragment Plot: Failed to load CSV for protein data:', response.statusText);
            return { length: null, fragmentIndicesRaw: null, alphafoldDomains: null, uniprotDomains: null };
        }
        const csvText = await response.text();
        return new Promise((resolve) => {
            Papa.parse(csvText, {
                header: true,
                skipEmptyLines: true,
                complete: function (results) {
                    const data = results.data;
                    const proteinInfoRow = data.find(row => row.name === proteinName);
                    if (proteinInfoRow) {
                        const length = proteinInfoRow.length && !isNaN(parseInt(proteinInfoRow.length, 10)) ? parseInt(proteinInfoRow.length, 10) : null;
                        const fragmentIndicesRaw = proteinInfoRow.fragment_indices || null;
                        const domainsRaw = proteinInfoRow.domains || null;
                        let parsedDomains = null;
                        let alphafoldDomains = [];
                        let uniprotDomains = [];

                        if (domainsRaw) {
                            try {
                                let jsonFriendlyDomainStr = domainsRaw
                                    .replace(/\(/g, '[')
                                    .replace(/\)/g, ']')
                                    .replace(/'/g, '"');
                                parsedDomains = JSON.parse(jsonFriendlyDomainStr);
                                parsedDomains = parsedDomains.map(domainEntry => {
                                    if (Array.isArray(domainEntry) && domainEntry.length === 2 &&
                                        typeof domainEntry[0] === 'string' && Array.isArray(domainEntry[1]) && domainEntry[1].length === 2) {
                                        return {
                                            id: domainEntry[0],
                                            start: parseInt(domainEntry[1][0], 10),
                                            end: parseInt(domainEntry[1][1], 10)
                                        };
                                    }
                                    console.warn('Domain/Fragment Plot: Malformed domain entry:', domainEntry);
                                    return null;
                                }).filter(d => d !== null && !isNaN(d.start) && !isNaN(d.end) && d.start <= d.end);

                                parsedDomains.forEach(domain => {
                                    if (domain.id.startsWith('AF')) {
                                        alphafoldDomains.push(domain);
                                    } else {
                                        uniprotDomains.push(domain);
                                    }
                                });

                            } catch (e) {
                                console.error(`Domain/Fragment Plot: Error parsing domains for ${proteinName}:`, e, "Raw string:", domainsRaw);
                            }
                        }
                        alphafoldDomains = alphafoldDomains || [];
                        uniprotDomains = uniprotDomains || [];

                        if (length === null) {
                            console.warn(`Domain/Fragment Plot: Length for ${proteinName} not found or invalid in CSV.`);
                        }
                        resolve({ length, fragmentIndicesRaw, alphafoldDomains, uniprotDomains });
                    } else {
                        console.warn(`Domain/Fragment Plot: Data for ${proteinName} not found in CSV.`);
                        resolve({ length: null, fragmentIndicesRaw: null, alphafoldDomains: null, uniprotDomains: null });
                    }
                },
                error: function (error) {
                    console.error('Domain/Fragment Plot: Error parsing CSV for protein data:', error);
                    resolve({ length: null, fragmentIndicesRaw: null, alphafoldDomains: null, uniprotDomains: null });
                }
            });
        });
    } catch (error) {
        console.error('Domain/Fragment Plot: Error fetching CSV for protein data:', error);
        return { length: null, fragmentIndicesRaw: null, alphafoldDomains: null, uniprotDomains: null };
    }
}

function _mergeIntervals(intervals) {
    if (!intervals || intervals.length === 0) {
        return [];
    }
    intervals.sort((a, b) => a.start - b.start);

    const merged = [];
    let currentInterval = intervals[0];

    for (let i = 1; i < intervals.length; i++) {
        const nextInterval = intervals[i];
        if (nextInterval.start <= currentInterval.end) {
            currentInterval.end = Math.max(currentInterval.end, nextInterval.end);
        } else {
            merged.push(currentInterval);
            currentInterval = nextInterval;
        }
    }
    merged.push(currentInterval);
    return merged;
}

function _parseRangeStringToIntervals(rangeStr) {
    if (!rangeStr || typeof rangeStr !== 'string') return [];
    return rangeStr.split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .flatMap(part => {
            if (part.includes('-')) {
                const [start, end] = part.split('-').map(Number);
                if (!isNaN(start) && !isNaN(end)) return [{ start, end }];
            } else {
                const val = Number(part);
                if (!isNaN(val)) return [{ start: val, end: val }];
            }
            return [];
        });
}

function _drawPlot(instanceId) {
    const instance = _plotInstances[instanceId];
    if (!instance) {
        console.error(`Domain/Fragment Plot: Instance ${instanceId} not found.`);
        return;
    }

    const { showUniprotDomains, showAlphafoldDomains, showFragments } = _globalPlotToggleStates;
    const { proteinName, proteinLength, fragmentIndicesRaw, alphafoldDomains, uniprotDomains } = instance;
    const container = document.querySelector(instance.selectors.container);
    const captionElement = document.querySelector(instance.selectors.caption);

    if (!container) {
        console.error(`Domain/Fragment Plot (${instanceId}): Container ${instance.selectors.container} not found.`);
        if (captionElement) captionElement.textContent = 'Plot container element not found.';
        return;
    }
    container.innerHTML = '';

    const oldDomainInfoSection = document.getElementById(`domain-info-collapsible-section-${instanceId}`);
    if (oldDomainInfoSection) {
        oldDomainInfoSection.remove();
    }

    if (proteinLength === null || isNaN(proteinLength)) {
        const message = proteinName ? `Length data not available or invalid for ${proteinName}. Cannot draw domain/fragment plot.` : 'Protein not specified for domain/fragment plot.';
        if (captionElement) captionElement.textContent = message;
        container.innerHTML = `<p style="text-align:center; color:grey; padding-top: 20px;">${message}</p>`;
        return;
    }

    if (captionElement && captionElement.textContent.startsWith('Loading data')) {
        captionElement.textContent = '';
    }

    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");

    const containerWidth = container.clientWidth;
    const currentContainerHeight = container.clientHeight || 100;

    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");

    const margin = { top: 20, right: 60, bottom: 20, left: 60 };
    const plotWidth = containerWidth - margin.left - margin.right;

    if (plotWidth <= 0) {
        container.innerHTML = `<p style="text-align:center; color:grey; padding-top: 20px;">Not enough space to draw plot.</p>`;
        if (captionElement) captionElement.textContent = 'Plotting area too small for domain/fragment plot.';
        return;
    }

    const barHeight = 10;
    const fragmentBarHeight = barHeight * 1.5;
    const afDomainHeightConstant = fragmentBarHeight * 7;
    const otherDomainRectHeightConstant = fragmentBarHeight * 6;

    const labelOffsetVertical = 5;
    const labelFontSize = 10;
    const baseIdLabelOffsetVertical = -5;

    let dynamicMinPlotAreaHeight = barHeight + 20;

    if (showAlphafoldDomains && alphafoldDomains && alphafoldDomains.length > 0) {
        const afDomainsTotalHeightRequired = afDomainHeightConstant + 2 * labelOffsetVertical + 2 * labelFontSize;
        dynamicMinPlotAreaHeight = Math.max(dynamicMinPlotAreaHeight, afDomainsTotalHeightRequired);
    }

    if (showUniprotDomains && uniprotDomains && uniprotDomains.length > 0) {
        const otherDomainsTotalHeightRequired = otherDomainRectHeightConstant + labelOffsetVertical + labelFontSize + Math.abs(baseIdLabelOffsetVertical) + labelFontSize;
        dynamicMinPlotAreaHeight = Math.max(dynamicMinPlotAreaHeight, otherDomainsTotalHeightRequired);
    }

    let hasVisibleFragments = false;
    if (showFragments && fragmentIndicesRaw) {
        try {
            let jsonStr = fragmentIndicesRaw.replace(/\(/g, '[').replace(/\)/g, ']').replace(/'/g, '"');
            const parsedFragmentIndices = JSON.parse(jsonStr);
            if (Array.isArray(parsedFragmentIndices) && parsedFragmentIndices.length > 0) {
                hasVisibleFragments = true;
            }
        } catch (e) {
            console.warn("Domain/Fragment Plot: Could not parse fragment_indices for height calculation.", e);
        }
    }
    if (hasVisibleFragments) {
        const fragmentsTotalHeightRequired = fragmentBarHeight * 2 + 2 * labelFontSize;
        dynamicMinPlotAreaHeight = Math.max(dynamicMinPlotAreaHeight, fragmentsTotalHeightRequired);
    }

    const minViewBoxHeight = dynamicMinPlotAreaHeight + margin.top + margin.bottom;
    const viewboxEffectiveHeight = Math.max(currentContainerHeight, minViewBoxHeight);

    svg.setAttribute("viewBox", `0 0 ${containerWidth} ${viewboxEffectiveHeight}`);

    const plotAreaHeight = viewboxEffectiveHeight - margin.top - margin.bottom;

    if (plotAreaHeight <= 0) {
        container.innerHTML = `<p style="text-align:center; color:grey; padding-top: 20px;">Not enough vertical space to draw plot.</p>`;
        if (captionElement) captionElement.textContent = 'Plotting area too small (height) for domain/fragment plot.';
        return;
    }

    const yPosition = plotAreaHeight / 2;

    const g = document.createElementNS(svgNS, "g");
    g.setAttribute("transform", `translate(${margin.left}, ${margin.top})`);

    if (!showFragments) {
        if (showUniprotDomains && uniprotDomains && uniprotDomains.length > 0 && proteinLength > 1) {
            const domainIntervals = uniprotDomains.map(d => ({
                start: Math.max(1, d.start),
                end: Math.min(proteinLength, d.end)
            })).filter(d => d.end >= d.start);

            const mergedDomainIntervals = _mergeIntervals(domainIntervals);

            let lastVisibleX = 0;
            const proteinBarY = yPosition - (barHeight / 2);

            mergedDomainIntervals.forEach(domain => {
                const domainStartX = ((domain.start - 1) / (proteinLength - 1)) * plotWidth;
                const domainEndX = ((domain.end - 1) / (proteinLength - 1)) * plotWidth;

                if (domainStartX > lastVisibleX) {
                    const segment = document.createElementNS(svgNS, "rect");
                    segment.setAttribute("x", lastVisibleX);
                    segment.setAttribute("y", proteinBarY);
                    segment.setAttribute("width", domainStartX - lastVisibleX);
                    segment.setAttribute("height", barHeight);
                    segment.setAttribute("fill", "#cccccc");
                    g.appendChild(segment);
                }
                lastVisibleX = Math.max(lastVisibleX, domainEndX);
            });

            if (lastVisibleX < plotWidth) {
                const segment = document.createElementNS(svgNS, "rect");
                segment.setAttribute("x", lastVisibleX);
                segment.setAttribute("y", proteinBarY);
                segment.setAttribute("width", plotWidth - lastVisibleX);
                segment.setAttribute("height", barHeight);
                segment.setAttribute("fill", "#cccccc");
                g.appendChild(segment);
            }
        } else {
            const proteinBar = document.createElementNS(svgNS, "rect");
            proteinBar.setAttribute("x", 0);
            proteinBar.setAttribute("y", yPosition - (barHeight / 2));
            proteinBar.setAttribute("width", plotWidth);
            proteinBar.setAttribute("height", barHeight);
            proteinBar.setAttribute("fill", "#cccccc");
            g.appendChild(proteinBar);
        }
    }

    if (showAlphafoldDomains && alphafoldDomains && alphafoldDomains.length > 0 && proteinLength) {
        alphafoldDomains.forEach((domain, index) => {
            _createDomainElements(g, domain, index, {
                instanceId,
                proteinLength,
                plotWidth,
                yPosition,
                type: 'af',
                domainHeight: afDomainHeightConstant,
                labelFontSize,
                labelOffsetVertical,
                baseIdLabelOffsetVertical,
                fillColor: "lightblue",
                opacity: "0.6"
            });
        });
    }

    if (showUniprotDomains && uniprotDomains && uniprotDomains.length > 0 && proteinLength) {
        uniprotDomains.forEach((domain, index) => {
            let baseId = domain.id;
            const underscoreIndex = baseId.lastIndexOf('_');
            if (underscoreIndex > -1 && /^\d+$/.test(baseId.substring(underscoreIndex + 1))) {
                baseId = baseId.substring(0, underscoreIndex);
            }
            const domainColor = _getDomainColor(baseId);

            _createDomainElements(g, domain, index, {
                instanceId,
                proteinLength,
                plotWidth,
                yPosition,
                type: 'other',
                domainHeight: otherDomainRectHeightConstant,
                labelFontSize,
                labelOffsetVertical,
                baseIdLabelOffsetVertical,
                fillColor: domainColor,
                opacity: "0.6"
            });
        });
    }

    if (showFragments && proteinName && proteinLength && fragmentIndicesRaw) {
        let indicesArr = [];
        try {
            let jsonStr = fragmentIndicesRaw
                .replace(/\(/g, '[')
                .replace(/\)/g, ']').replace(/'/g, '"');
            indicesArr = JSON.parse(jsonStr);
        } catch (e) {
            console.error(`Domain/Fragment Plot: Error parsing fragment_indices for ${proteinName}:`, e, "Raw string:", fragmentIndicesRaw);
            indicesArr = [];
        }

        let highlightLocs = [];
        if (window.location.pathname.endsWith('interaction.html')) {
            const urlParams = new URLSearchParams(window.location.search);
            const f1_loc = urlParams.get('f1_loc');
            const f2_loc = urlParams.get('f2_loc');
            if (instanceId === 'p1' && f1_loc) {
                highlightLocs = _parseRangeStringToIntervals(f1_loc);
            }
            if (instanceId === 'p2' && f2_loc) {
                highlightLocs = _parseRangeStringToIntervals(f2_loc);
            }
        }

        indicesArr.forEach((frag, i) => {
            if (!Array.isArray(frag) || frag.length !== 2) return;
            let [start, end] = frag;
            start = Math.max(1, parseInt(start));
            end = Math.min(proteinLength, parseInt(end));
            if (isNaN(start) || isNaN(end) || end < start) return;

            const denominator = proteinLength > 1 ? proteinLength - 1 : 1;
            const x1_orig = ((start - 1) / denominator) * plotWidth;
            const x2_orig = ((end - 1) / denominator) * plotWidth;

            const rect_x = x1_orig - 0.5;
            const fragmentWidth = Math.max(1, x2_orig - x1_orig + 1);

            const isAbove = i % 2 === 0;
            const yRect = isAbove
                ? (yPosition - fragmentBarHeight)
                : (yPosition);

            const originalFill = "lightcoral";
            const originalStroke = "dimgrey";
            const hoverFill = "red";
            const hoverStroke = "black";

            const fragmentRect = document.createElementNS(svgNS, "rect");
            fragmentRect.setAttribute("x", rect_x);
            fragmentRect.setAttribute("y", yRect);
            fragmentRect.setAttribute("width", fragmentWidth);
            fragmentRect.setAttribute("height", fragmentBarHeight);
            fragmentRect.setAttribute("fill", originalFill);
            fragmentRect.setAttribute("opacity", "1");
            fragmentRect.setAttribute("stroke", originalStroke);
            fragmentRect.setAttribute("stroke-width", "0.5");
            g.appendChild(fragmentRect);

            if (highlightLocs.length > 0) {
                highlightLocs.forEach(loc => {
                    const overlapStart = Math.max(start, loc.start);
                    const overlapEnd = Math.min(end, loc.end);
                    if (overlapEnd >= overlapStart) {
                        const x1_hl = ((overlapStart - 1) / denominator) * plotWidth;
                        const x2_hl = ((overlapEnd - 1) / denominator) * plotWidth;
                        const rect_x_hl = x1_hl - 0.5;
                        const width_hl = Math.max(1, x2_hl - x1_hl + 1);
                        const highlightRect = document.createElementNS(svgNS, "rect");
                        highlightRect.setAttribute("x", rect_x_hl);
                        highlightRect.setAttribute("y", yRect);
                        highlightRect.setAttribute("width", width_hl);
                        highlightRect.setAttribute("height", fragmentBarHeight);
                        highlightRect.setAttribute("fill", "#ff2a00");
                        highlightRect.setAttribute("opacity", "1");
                        highlightRect.setAttribute("stroke", "#b30000");
                        highlightRect.setAttribute("stroke-width", "1.2");
                        g.appendChild(highlightRect);
                    }
                });
            }

            const labelYPos = yRect + fragmentBarHeight / 2;
            const labelOffset = 1;

            const fragStartLabel = document.createElementNS(svgNS, "text");
            fragStartLabel.setAttribute("x", x1_orig - labelOffset);
            fragStartLabel.setAttribute("y", labelYPos);
            fragStartLabel.setAttribute("dy", "0.35em");
            fragStartLabel.setAttribute("text-anchor", "end");
            fragStartLabel.setAttribute("font-size", `${labelFontSize}px`);
            fragStartLabel.setAttribute("fill", "#333333");
            fragStartLabel.textContent = start;
            fragStartLabel.setAttribute("visibility", "hidden");
            g.appendChild(fragStartLabel);

            const fragEndLabel = document.createElementNS(svgNS, "text");
            fragEndLabel.setAttribute("x", x2_orig + labelOffset);
            fragEndLabel.setAttribute("y", labelYPos);
            fragEndLabel.setAttribute("dy", "0.35em");
            fragEndLabel.setAttribute("text-anchor", "start");
            fragEndLabel.setAttribute("font-size", `${labelFontSize}px`);
            fragEndLabel.setAttribute("fill", "#333333");
            fragEndLabel.textContent = end;
            fragEndLabel.setAttribute("visibility", "hidden");
            g.appendChild(fragEndLabel);

            fragmentRect.addEventListener("mouseover", () => {
                fragmentRect.setAttribute("fill", hoverFill);
                fragmentRect.setAttribute("stroke", hoverStroke);
                fragStartLabel.setAttribute("visibility", "visible");
                fragEndLabel.setAttribute("visibility", "visible");
                if (window.highlightPromiscuityResidues) window.highlightPromiscuityResidues(start, end);
            });
            fragmentRect.addEventListener("mouseout", () => {
                fragmentRect.setAttribute("fill", originalFill);
                fragmentRect.setAttribute("stroke", originalStroke);
                fragStartLabel.setAttribute("visibility", "hidden");
                fragEndLabel.setAttribute("visibility", "hidden");
                if (window.clearPromiscuityHighlight) window.clearPromiscuityHighlight();
            });
        });
    }

    const startLabel = document.createElementNS(svgNS, "text");
    startLabel.setAttribute("x", -15);
    startLabel.setAttribute("y", yPosition);
    startLabel.setAttribute("dy", "0.35em");
    startLabel.setAttribute("text-anchor", "end");
    startLabel.setAttribute("font-size", "12px");
    startLabel.setAttribute("fill", "#333333");
    startLabel.textContent = "1";
    g.appendChild(startLabel);

    const endLabel = document.createElementNS(svgNS, "text");
    endLabel.setAttribute("x", plotWidth + 15);
    endLabel.setAttribute("y", yPosition);
    endLabel.setAttribute("dy", "0.35em");
    endLabel.setAttribute("text-anchor", "start");
    endLabel.setAttribute("font-size", "12px");
    endLabel.setAttribute("fill", "#333333");
    endLabel.textContent = proteinLength;
    g.appendChild(endLabel);

    svg.appendChild(g);
    container.appendChild(svg);

    const domainInfoSection = document.createElement('div');
    domainInfoSection.className = 'collapsible-subsection collapsed';
    domainInfoSection.id = `domain-info-collapsible-section-${instanceId}`;

    const titleDiv = document.createElement('div');
    titleDiv.className = 'collapsible-subsection-title';

    const titleText = document.createElement('h4');
    titleText.textContent = 'Domain Details';
    titleDiv.appendChild(titleText);

    const icon = document.createElement('i');
    icon.className = 'fas fa-chevron-down';
    titleDiv.appendChild(icon);

    domainInfoSection.appendChild(titleDiv);

    const contentDiv = document.createElement('div');
    contentDiv.className = 'collapsible-subsection-content';

    const table = document.createElement('table');
    table.id = `domain-info-table-${instanceId}`;

    const thead = table.createTHead();
    const headerRow = thead.insertRow();

    const thName = document.createElement('th');
    thName.textContent = 'Name';
    headerRow.appendChild(thName);

    const thPosition = document.createElement('th');
    thPosition.textContent = 'Position';
    headerRow.appendChild(thPosition);

    const tbody = table.createTBody();
    let hasTableData = false;

    const allDomainsForTable = [];

    if (showAlphafoldDomains && alphafoldDomains && alphafoldDomains.length > 0) {
        alphafoldDomains.forEach((domain, index) => {
            if (domain.start === undefined || domain.end === undefined) return;
            allDomainsForTable.push({ ...domain, type: 'alphafold', originalIndex: index });
        });
    }

    if (showUniprotDomains && uniprotDomains && uniprotDomains.length > 0) {
        uniprotDomains.forEach((domain, index) => {
            if (domain.start === undefined || domain.end === undefined) return;
            allDomainsForTable.push({ ...domain, type: 'other', originalIndex: index });
        });
    }

    allDomainsForTable.sort((a, b) => {
        if (a.start !== b.start) {
            return a.start - b.start;
        }
        return a.end - b.end;
    });

    if (allDomainsForTable.length > 0) {
        hasTableData = true;

        allDomainsForTable.forEach(domainEntry => {
            const row = tbody.insertRow();
            let domainRectId, startLabelId, endLabelId, baseIdLabelId, rowIdSuffix;

            if (domainEntry.type === 'alphafold') {
                rowIdSuffix = `af-row-${instanceId}-${domainEntry.originalIndex}`;
                domainRectId = `af-domain-${instanceId}-${domainEntry.originalIndex}`;
                startLabelId = `af-start-label-${instanceId}-${domainEntry.originalIndex}`;
                endLabelId = `af-end-label-${instanceId}-${domainEntry.originalIndex}`;

                const cellName = row.insertCell();
                cellName.textContent = 'AlphaFold';
                const cellPosition = row.insertCell();
                cellPosition.textContent = `${domainEntry.start}-${domainEntry.end}`;

                row.id = rowIdSuffix;

                row.addEventListener("mouseover", () => {
                    row.classList.add('domain-table-row-hover');
                    const rect = document.getElementById(domainRectId);
                    const startLabel = document.getElementById(startLabelId);
                    const endLabel = document.getElementById(endLabelId);
                    if (rect) rect.setAttribute("opacity", "1.0");
                    if (startLabel) startLabel.setAttribute("visibility", "visible");
                    if (endLabel) endLabel.setAttribute("visibility", "visible");
                });
                row.addEventListener("mouseout", () => {
                    row.classList.remove('domain-table-row-hover');
                    const rect = document.getElementById(domainRectId);
                    const startLabel = document.getElementById(startLabelId);
                    const endLabel = document.getElementById(endLabelId);
                    if (rect) rect.setAttribute("opacity", "0.6");
                    if (startLabel) startLabel.setAttribute("visibility", "hidden");
                    if (endLabel) endLabel.setAttribute("visibility", "hidden");
                });

            } else if (domainEntry.type === 'other') {
                rowIdSuffix = `other-row-${instanceId}-${domainEntry.originalIndex}`;
                domainRectId = `other-domain-${instanceId}-${domainEntry.originalIndex}`;
                startLabelId = `other-start-label-${instanceId}-${domainEntry.originalIndex}`;
                endLabelId = `other-end-label-${instanceId}-${domainEntry.originalIndex}`;
                baseIdLabelId = `other-baseid-label-${instanceId}-${domainEntry.originalIndex}`;

                let baseId = domainEntry.id;
                const underscoreIndex = baseId.lastIndexOf('_');
                if (underscoreIndex > -1 && /^\d+$/.test(baseId.substring(underscoreIndex + 1))) {
                    baseId = baseId.substring(0, underscoreIndex);
                }
                baseId = baseId.replace(/_/g, ' ');

                const cellName = row.insertCell();
                cellName.textContent = baseId;
                const cellPosition = row.insertCell();
                cellPosition.textContent = `${domainEntry.start}-${domainEntry.end}`;

                row.id = rowIdSuffix;

                row.addEventListener("mouseover", () => {
                    row.classList.add('domain-table-row-hover');
                    const rect = document.getElementById(domainRectId);
                    const startLabel = document.getElementById(startLabelId);
                    const endLabel = document.getElementById(endLabelId);
                    const baseLabel = document.getElementById(baseIdLabelId);
                    if (rect) rect.setAttribute("opacity", "1.0");
                    if (startLabel) startLabel.setAttribute("visibility", "visible");
                    if (endLabel) endLabel.setAttribute("visibility", "visible");
                    if (baseLabel) baseLabel.setAttribute("visibility", "visible");
                });
                row.addEventListener("mouseout", () => {
                    row.classList.remove('domain-table-row-hover');
                    const rect = document.getElementById(domainRectId);
                    const startLabel = document.getElementById(startLabelId);
                    const endLabel = document.getElementById(endLabelId);
                    const baseLabel = document.getElementById(baseIdLabelId);
                    if (rect) rect.setAttribute("opacity", "0.6");
                    if (startLabel) startLabel.setAttribute("visibility", "hidden");
                    if (endLabel) endLabel.setAttribute("visibility", "hidden");
                    if (baseLabel) baseLabel.setAttribute("visibility", "hidden");
                });
            }
        });
    }

    contentDiv.appendChild(table);
    domainInfoSection.appendChild(contentDiv);

    titleDiv.addEventListener('click', () => {
        domainInfoSection.classList.toggle('collapsed');
        icon.classList.toggle('fa-chevron-down');
        icon.classList.toggle('fa-chevron-up');
    });

    if (hasTableData) {
        container.appendChild(domainInfoSection);
    }
}

function _createDomainElements(g, domain, index, config) {
    const {
        instanceId, proteinLength, plotWidth, yPosition, type, domainHeight,
        labelFontSize, labelOffsetVertical, baseIdLabelOffsetVertical,
        fillColor, opacity
    } = config;

    if (domain.start === undefined || domain.end === undefined || domain.start > domain.end) return;

    const svgNS = "http://www.w3.org/2000/svg";
    const domainRectId = `${type}-domain-${instanceId}-${index}`;
    const startLabelId = `${type}-start-label-${instanceId}-${index}`;
    const endLabelId = `${type}-end-label-${instanceId}-${index}`;
    const baseIdLabelId = `${type}-baseid-label-${instanceId}-${index}`;
    const rowId = `${type}-row-${instanceId}-${index}`;

    const start = Math.max(1, domain.start);
    const end = Math.min(proteinLength, domain.end);
    if (end < start) return;

    const denominator = proteinLength > 1 ? proteinLength - 1 : 1;
    const x1_orig = ((start - 1) / denominator) * plotWidth;
    const x2_orig = ((end - 1) / denominator) * plotWidth;

    const rect_x = x1_orig - 0.5;
    const domainWidth = Math.max(1, x2_orig - x1_orig + 1);
    const domainY = yPosition - (domainHeight / 2);

    const domainRect = document.createElementNS(svgNS, "rect");
    domainRect.id = domainRectId;
    domainRect.setAttribute("x", rect_x);
    domainRect.setAttribute("y", domainY);
    domainRect.setAttribute("width", domainWidth);
    domainRect.setAttribute("height", domainHeight);
    domainRect.setAttribute("fill", fillColor);
    if (opacity) domainRect.setAttribute("opacity", opacity);

    const title = document.createElementNS(svgNS, "title");
    title.textContent = `${domain.id}: ${domain.start}-${domain.end}`;
    domainRect.appendChild(title);
    g.appendChild(domainRect);

    const labelYPos = domainY + domainHeight + labelOffsetVertical;
    const labelOffsetHorizontal = 2;

    const startLabel = document.createElementNS(svgNS, "text");
    startLabel.id = startLabelId;
    startLabel.setAttribute("x", x1_orig - labelOffsetHorizontal);
    startLabel.setAttribute("y", labelYPos);
    startLabel.setAttribute("dy", "0.35em");
    startLabel.setAttribute("text-anchor", "end");
    startLabel.setAttribute("font-size", `${labelFontSize}px`);
    startLabel.setAttribute("fill", "#333333");
    startLabel.textContent = domain.start;
    startLabel.setAttribute("visibility", "hidden");
    g.appendChild(startLabel);

    const endLabel = document.createElementNS(svgNS, "text");
    endLabel.id = endLabelId;
    endLabel.setAttribute("x", x2_orig + labelOffsetHorizontal);
    endLabel.setAttribute("y", labelYPos);
    endLabel.setAttribute("dy", "0.35em");
    endLabel.setAttribute("text-anchor", "start");
    endLabel.setAttribute("font-size", `${labelFontSize}px`);
    endLabel.setAttribute("fill", "#333333");
    endLabel.textContent = domain.end;
    endLabel.setAttribute("visibility", "hidden");
    g.appendChild(endLabel);

    let baseIdLabel;
    if (type === 'other') {
        let baseId = domain.id;
        const underscoreIndex = baseId.lastIndexOf('_');
        if (underscoreIndex > -1 && /^\d+$/.test(baseId.substring(underscoreIndex + 1))) {
            baseId = baseId.substring(0, underscoreIndex);
        }
        baseId = baseId.replace(/_/g, ' ');

        baseIdLabel = document.createElementNS(svgNS, "text");
        baseIdLabel.id = baseIdLabelId;
        baseIdLabel.setAttribute("x", x1_orig + (x2_orig - x1_orig) / 2);
        baseIdLabel.setAttribute("y", domainY + baseIdLabelOffsetVertical);
        baseIdLabel.setAttribute("dy", "0em");
        baseIdLabel.setAttribute("text-anchor", "middle");
        baseIdLabel.setAttribute("font-size", `${labelFontSize}px`);
        baseIdLabel.setAttribute("fill", "#333333");
        baseIdLabel.textContent = baseId;
        baseIdLabel.setAttribute("visibility", "hidden");
        g.appendChild(baseIdLabel);
    }

    domainRect.addEventListener("mouseover", () => {
        domainRect.setAttribute("opacity", "1.0");
        startLabel.setAttribute("visibility", "visible");
        endLabel.setAttribute("visibility", "visible");
        if (baseIdLabel) baseIdLabel.setAttribute("visibility", "visible");
        document.getElementById(rowId)?.classList.add('domain-table-row-hover');
        if (window.highlightPromiscuityResidues) window.highlightPromiscuityResidues(domain.start, domain.end);
    });

    domainRect.addEventListener("mouseout", () => {
        domainRect.setAttribute("opacity", opacity);
        startLabel.setAttribute("visibility", "hidden");
        endLabel.setAttribute("visibility", "hidden");
        if (baseIdLabel) baseIdLabel.setAttribute("visibility", "hidden");
        document.getElementById(rowId)?.classList.remove('domain-table-row-hover');
        if (window.clearPromiscuityHighlight) window.clearPromiscuityHighlight();
    });
}

function _updateGlobalPlotControlsVisualState() {
    const uniprotDomainsBtn = document.querySelector('.global-uniprotDomainsBtn');
    const alphafoldDomainsBtn = document.querySelector('.global-alphafoldDomainsBtn');
    const fragmentsBtn = document.querySelector('.global-fragmentsBtn');

    if (uniprotDomainsBtn) {
        uniprotDomainsBtn.classList.toggle('active', _globalPlotToggleStates.showUniprotDomains);
    }
    if (alphafoldDomainsBtn) {
        alphafoldDomainsBtn.classList.toggle('active', _globalPlotToggleStates.showAlphafoldDomains);
    }
    if (fragmentsBtn) {
        fragmentsBtn.classList.toggle('active', _globalPlotToggleStates.showFragments);
    }
}

function _setupGlobalPlotControls() {
    const uniprotDomainsBtn = document.querySelector('.global-uniprotDomainsBtn');
    const alphafoldDomainsBtn = document.querySelector('.global-alphafoldDomainsBtn');
    const fragmentsBtn = document.querySelector('.global-fragmentsBtn');

    const redrawAllActivePlots = () => {
        Object.keys(_plotInstances).forEach(id => {
            if (_plotInstances[id] && _plotInstances[id].proteinName) {
                _drawPlot(id);
            }
        });
    };

    if (uniprotDomainsBtn && !uniprotDomainsBtn.dataset.handlerAttached) {
        uniprotDomainsBtn.addEventListener('click', () => {
            _globalPlotToggleStates.showUniprotDomains = !_globalPlotToggleStates.showUniprotDomains;
            _updateGlobalPlotControlsVisualState();
            redrawAllActivePlots();
        });
        uniprotDomainsBtn.dataset.handlerAttached = 'true';
    }

    if (alphafoldDomainsBtn && !alphafoldDomainsBtn.dataset.handlerAttached) {
        alphafoldDomainsBtn.addEventListener('click', () => {
            _globalPlotToggleStates.showAlphafoldDomains = !_globalPlotToggleStates.showAlphafoldDomains;
            _updateGlobalPlotControlsVisualState();
            redrawAllActivePlots();
        });
        alphafoldDomainsBtn.dataset.handlerAttached = 'true';
    }

    if (fragmentsBtn && !fragmentsBtn.dataset.handlerAttached) {
        fragmentsBtn.addEventListener('click', () => {
            _globalPlotToggleStates.showFragments = !_globalPlotToggleStates.showFragments;
            _updateGlobalPlotControlsVisualState();
            redrawAllActivePlots();
        });
        fragmentsBtn.dataset.handlerAttached = 'true';
    }
}

async function _initializeInstance(instanceId, proteinName, selectorsConfig) {
    if (!_plotInstances[instanceId]) {
        _plotInstances[instanceId] = _getDefaultPlotInstanceState();
    }
    const instance = _plotInstances[instanceId];
    instance.proteinName = proteinName;
    instance.selectors = { ...instance.selectors, ...selectorsConfig };

    const container = document.querySelector(instance.selectors.container);
    const captionElement = document.querySelector(instance.selectors.caption);
    const subheadingElement = instance.selectors.subheading ? document.querySelector(instance.selectors.subheading) : null;

    if (subheadingElement) {
        subheadingElement.textContent = proteinName ? proteinName : 'Protein not specified';
    }

    if (!proteinName) {
        console.warn(`Domain/Fragment Plot (${instanceId}): Protein name not provided.`);
        if (container) container.innerHTML = `<p style="text-align:center; color:grey; padding-top: 20px;">Protein not specified.</p>`;
        if (captionElement) captionElement.textContent = 'Protein not specified for domain/fragment plot.';
        _drawPlot(instanceId);
        return;
    }

    if (instance.proteinName !== proteinName || instance.proteinLength === null) {
        if (captionElement) captionElement.textContent = `Loading data for ${proteinName}...`;
        if (container) container.innerHTML = `<p style="text-align:center; color:grey; padding-top: 20px;">Loading data for domain/fragment plot...</p>`;

        const proteinData = await _fetchProteinData(proteinName);
        instance.proteinLength = proteinData.length;
        instance.fragmentIndicesRaw = proteinData.fragmentIndicesRaw;
        instance.alphafoldDomains = proteinData.alphafoldDomains;
        instance.uniprotDomains = proteinData.uniprotDomains;

        if (captionElement && captionElement.textContent.startsWith('Loading data')) {
            captionElement.textContent = '';
        }
    }

    _drawPlot(instanceId);
}

async function _initializeAllPlots() {
    const urlParams = new URLSearchParams(window.location.search);
    const p1 = decodeURIComponent(urlParams.get('p1') || '');
    const p2 = decodeURIComponent(urlParams.get('p2') || '');

    const isProteinPage = window.location.pathname.endsWith('protein.html');
    const isProteinPairPage = window.location.pathname.endsWith('protein_pair.html');
    const isInteractionPage = window.location.pathname.endsWith('interaction.html');

    _setupGlobalPlotControls();
    _updateGlobalPlotControlsVisualState();

    if (isProteinPage) {
        await _initializeInstance('main', p1, {
            container: '.domainFragmentPlotContainer',
            caption: '.domain-fragment-plot-caption',
        });
    } else if (isProteinPairPage || isInteractionPage) {
        const fallbackMessageDF = document.getElementById('fragments-fallback-message-df');

        if (!p1) {
            if (fallbackMessageDF) {
                fallbackMessageDF.textContent = 'Protein 1 parameter (p1) not provided.';
                fallbackMessageDF.style.display = 'block';
            }
            const p1Section = document.getElementById('domain-fragment-plot-p1-section');
            const p2Section = document.getElementById('domain-fragment-plot-p2-section');
            if (p1Section) p1Section.style.display = 'none';
            if (p2Section) p2Section.style.display = 'none';
            return;
        }

        if (fallbackMessageDF) fallbackMessageDF.style.display = 'none';

        await _initializeInstance('p1', p1, {
            container: '.domainFragmentPlotContainerP1',
            caption: '.domain-fragment-plot-caption-p1',
            subheading: '#protein1-name-subheading-df',
        });

        const p2Section = document.getElementById('domain-fragment-plot-p2-section');
        if (p2 && p1 !== p2) {
            if (p2Section) p2Section.style.display = 'block';
            await _initializeInstance('p2', p2, {
                container: '.domainFragmentPlotContainerP2',
                caption: '.domain-fragment-plot-caption-p2',
                subheading: '#protein2-name-subheading-df',
                plotSection: '#domain-fragment-plot-p2-section'
            });
        } else {
            if (p2Section) p2Section.style.display = 'none';
            if (p1 === p2 && p2Section) {
                const p2Container = document.querySelector('.domainFragmentPlotContainerP2');
                const p2Caption = document.querySelector('.domain-fragment-plot-caption-p2');
                if (p2Container) p2Container.innerHTML = '';
                if (p2Caption) p2Caption.textContent = '';
            }
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(_initializeAllPlots, 100);

    let resizeDebounceTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeDebounceTimer);
        resizeDebounceTimer = setTimeout(() => {
            Object.keys(_plotInstances).forEach(instanceId => {
                const instance = _plotInstances[instanceId];
                if (instance && instance.proteinName && instance.selectors.container) {
                    if (instance.proteinLength !== null) {
                        _drawPlot(instanceId);
                    } else {
                        _initializeInstance(instanceId, instance.proteinName, instance.selectors);
                    }
                }
            });
        }, 250);
    });
});
