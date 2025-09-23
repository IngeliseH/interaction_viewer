let _plotInstances = {};

const _globalPlotToggleStates = {
    showUniprotDomains: true,
    showAlphafoldDomains: true,
    showFragments: true
};

const _domainColors = ['#ED7AB0', '#8DC640', '#F68B1F', '#9F83BC', "#FFDD55", '#6DC8BF',
    '#A74399', '#A6ADD3', '#E64425', '#C2C1B1', '#00A45D', '#BA836E',
    '#3E4291'];
const _domainColorMap = {};
let _currentColorIndex = 0;

// =============================================================================
// Public API Functions
// =============================================================================
async function initializePlotInstance(instanceId, proteinName, selectorsConfig) {
    _plotInstances[instanceId] = {
        proteinName,
        proteinLength: null,
        fragmentIndicesRaw: null,
        alphafoldDomains: null,
        uniprotDomains: null,
        selectors: { ...selectorsConfig }
    };

    const instance = _plotInstances[instanceId];
    const container = document.querySelector(instance.selectors.container);
    const statusMessageElement = document.querySelector(instance.selectors.statusMessage);
    const subheadingElement = instance.selectors.subheading ? document.querySelector(instance.selectors.subheading) : null;

    if (subheadingElement) {
        subheadingElement.textContent = proteinName || 'Protein not specified';
    }

    if (statusMessageElement) statusMessageElement.textContent = `Loading data for ${proteinName}...`;
    if (container) container.innerHTML = `<p style="text-align:center; color:grey; padding-top: 20px;">Loading data for domain/fragment plot...</p>`;

    const proteinData = await _fetchProteinData(proteinName);
    instance.proteinLength = proteinData.length;
    instance.fragmentIndicesRaw = proteinData.fragmentIndicesRaw;
    instance.alphafoldDomains = proteinData.alphafoldDomains;
    instance.uniprotDomains = proteinData.uniprotDomains;

    if (statusMessageElement && statusMessageElement.textContent.startsWith('Loading data')) {
        statusMessageElement.textContent = '';
    }

    _drawPlot(instanceId);
}

async function initializeAllPlots() {
    const urlParams = new URLSearchParams(window.location.search);
    const p1 = decodeURIComponent(urlParams.get('p1') || '');
    const p2 = decodeURIComponent(urlParams.get('p2') || '');

    const isProteinPage = window.location.pathname.endsWith('protein.html');
    const isProteinPairPage = window.location.pathname.endsWith('protein_pair.html');
    const isInteractionPage = window.location.pathname.endsWith('interaction.html');

    _setupGlobalPlotControls();
    _updateGlobalPlotControlsVisualState();

    if (isProteinPage) {
        await initializePlotInstance('main', p1, {
            container: '.domain-fragment-plot-container',
            statusMessage: '.domain-fragment-plot-status',
        });
    } else if (isProteinPairPage || isInteractionPage) {
        const fallbackMessageDF = document.getElementById('fragments-fallback-message-df');

        if (!p1) {
            if (fallbackMessageDF) {
                fallbackMessageDF.textContent = 'Protein 1 parameter not provided.';
                fallbackMessageDF.style.display = 'block';
            }
            const p1Section = document.getElementById('domain-fragment-plot-p1-section');
            const p2Section = document.getElementById('domain-fragment-plot-p2-section');
            if (p1Section) p1Section.style.display = 'none';
            if (p2Section) p2Section.style.display = 'none';
            return;
        }

        if (fallbackMessageDF) fallbackMessageDF.style.display = 'none';

        await initializePlotInstance('p1', p1, {
            container: '.domain-fragment-plot-container-p1',
            statusMessage: '.domain-fragment-plot-status-p1',
            subheading: '#protein1-name-subheading-df',
        });

        const p2Section = document.getElementById('domain-fragment-plot-p2-section');
        if (p2 && p1 !== p2) {
            if (p2Section) p2Section.style.display = 'block';
            await initializePlotInstance('p2', p2, {
                container: '.domain-fragment-plot-container-p2',
                statusMessage: '.domain-fragment-plot-status-p2',
                subheading: '#protein2-name-subheading-df',
                plotSection: '#domain-fragment-plot-p2-section'
            });
        } else {
            if (p2Section) p2Section.style.display = 'none';
            if (p1 === p2 && p2Section) {
                const p2Container = document.querySelector('.domain-fragment-plot-container-p2');
                const p2StatusMessage = document.querySelector('.domain-fragment-plot-status-p2');
                if (p2Container) p2Container.innerHTML = '';
                if (p2StatusMessage) p2StatusMessage.textContent = '';
            }
        }
    }
}

// =============================================================================
// Core Logic
// =============================================================================
function _drawPlot(instanceId) {
    const instance = _plotInstances[instanceId];
    if (!instance) {
        console.error(`Domain/Fragment Plot: Instance ${instanceId} not found.`);
        return;
    }

    const { proteinName, proteinLength, fragmentIndicesRaw, alphafoldDomains, uniprotDomains } = instance;
    const container = document.querySelector(instance.selectors.container);

    if (!container) {
        console.error(`Domain/Fragment Plot (${instanceId}): Container ${instance.selectors.container} not found.`);
        return;
    }
    container.innerHTML = '';

    if (proteinLength === null || isNaN(proteinLength)) {
        const message = proteinName ? `Length data not available or invalid for ${proteinName}. Cannot draw domain/fragment plot.` : 'Protein not specified for domain/fragment plot.';
        container.innerHTML = `<p style="text-align:center; color:grey; padding-top: 20px;">${message}</p>`;
        return;
    }

    _renderPlot(container, instanceId, {
        proteinName,
        proteinLength,
        fragmentIndicesRaw,
        alphafoldDomains,
        uniprotDomains,
    });

    _renderCollapsibleTable(container, instanceId, {
        alphafoldDomains,
        uniprotDomains,
    });
}

function _renderPlot(container, instanceId, { proteinName, proteinLength, fragmentIndicesRaw, alphafoldDomains, uniprotDomains }) {
    const { showUniprotDomains, showAlphafoldDomains, showFragments } = _globalPlotToggleStates;
    const margin = { top: 0, right: 60, bottom: 0, left: 60 };
    const dimensions = _calculatePlotDimensions(container, margin);

    const svg = _createSvgElement("svg", {
        "width": "100%",
        "height": dimensions.containerHeight,
        "viewBox": `0 0 ${container.clientWidth} ${dimensions.containerHeight}`
    });

    const svgGroup = _createSvgElement("g", {
        "transform": `translate(${margin.left}, ${margin.top})`
    });

    if (!showFragments) {
        const rectY = dimensions.plotHeight / 2 - (dimensions.barHeight / 2);
        const rectHeight = dimensions.barHeight;

        const proteinBar = _createSvgElement("rect", {
            "x": 0,
            "y": rectY,
            "width": dimensions.plotWidth,
            "height": rectHeight,
            "fill": "#ccc"
        });
        svgGroup.appendChild(proteinBar);
    }

    if (showAlphafoldDomains && alphafoldDomains && alphafoldDomains.length > 0 && proteinLength) {
        _renderDomains(svgGroup, alphafoldDomains, {
            instanceId,
            proteinLength,
            plotWidth: dimensions.plotWidth,
            yPosition: (dimensions.plotHeight / 2) - (dimensions.alphafoldDomainHeight / 2),
            type: 'af',
            domainHeight: dimensions.alphafoldDomainHeight,
            labelFontSize: 10
        });
    }

    if (showUniprotDomains && uniprotDomains && uniprotDomains.length > 0 && proteinLength) {
        _renderDomains(svgGroup, uniprotDomains, {
            instanceId,
            proteinLength,
            plotWidth: dimensions.plotWidth,
            yPosition: (dimensions.plotHeight / 2) - (dimensions.uniprotDomainHeight / 2),
            type: 'uniprot',
            domainHeight: dimensions.uniprotDomainHeight,
            labelFontSize: 10
        });
    }

    if (showFragments && proteinName && proteinLength && fragmentIndicesRaw) {
        let fragmentIndices = [];
        try {
            let jsonStr = fragmentIndicesRaw
                .replace(/\(/g, '[')
                .replace(/\)/g, ']').replace(/'/g, '"');
            fragmentIndices = JSON.parse(jsonStr);
        } catch (e) {
            console.error(`Domain/Fragment Plot: Error parsing fragment_indices for ${proteinName}:`, e, "Raw string:", fragmentIndicesRaw);
            fragmentIndices = [];
        }

        let highlightLocations = [];
        if (window.location.pathname.endsWith('interaction.html')) {
            const urlParams = new URLSearchParams(window.location.search);
            const f1_loc = urlParams.get('f1_loc');
            const f2_loc = urlParams.get('f2_loc');
            if (instanceId === 'p1' && f1_loc) {
                highlightLocations = _parseRange(f1_loc);
            }
            if (instanceId === 'p2' && f2_loc) {
                highlightLocations = _parseRange(f2_loc);
            }
        }

        _renderFragments(svgGroup, fragmentIndices,
            {
                proteinLength: proteinLength,
                plotWidth: dimensions.plotWidth,
                yPosition: dimensions.plotHeight / 2,
                height: dimensions.fragmentBarHeight,
                labelFontSize: 10,
                highlightLocations
            }
        );
    }

    const startLabel = _createSvgElement("text", {
        "x": -15,
        "y": dimensions.plotHeight / 2,
        "dy": "0.35em",
        "text-anchor": "end",
        "font-size": "12px",
        "fill": "#333"
    });
    startLabel.textContent = "1";
    svgGroup.appendChild(startLabel);

    const endLabel = _createSvgElement("text", {
        "x": dimensions.plotWidth + 15,
        "y": dimensions.plotHeight / 2,
        "dy": "0.35em",
        "text-anchor": "start",
        "font-size": "12px",
        "fill": "#333"
    });
    endLabel.textContent = proteinLength;
    svgGroup.appendChild(endLabel);

    svg.appendChild(svgGroup);
    container.appendChild(svg);
}

function _renderCollapsibleTable(container, instanceId, { alphafoldDomains, uniprotDomains }) {
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

    const allDomainsForTable = [
        ...(alphafoldDomains || []).map((domain, index) => ({ ...domain, type: 'alphafold', originalIndex: index })),
        ...(uniprotDomains || []).map((domain, index) => ({ ...domain, type: 'uniprot', originalIndex: index })),
    ];

    allDomainsForTable.sort((a, b) => a.start - b.start || a.end - b.end);

    allDomainsForTable.forEach(domainEntry => {
        const row = tbody.insertRow();
        const domainRectId = `${domainEntry.type}-domain-${instanceId}-${domainEntry.originalIndex}`;
        const startLabelId = `${domainEntry.type}-start-label-${instanceId}-${domainEntry.originalIndex}`;
        const endLabelId = `${domainEntry.type}-end-label-${instanceId}-${domainEntry.originalIndex}`;

        const cellName = row.insertCell();
        cellName.textContent = domainEntry.type === 'alphafold' ? 'AlphaFold' : domainEntry.id.replace(/_/g, ' ');

        const cellPosition = row.insertCell();
        cellPosition.textContent = `${domainEntry.start}-${domainEntry.end}`;

        row.addEventListener("mouseover", () => {
            row.classList.add('domain-table-row-hover');
            document.getElementById(domainRectId)?.setAttribute("opacity", "1.0");
            document.getElementById(startLabelId)?.setAttribute("visibility", "visible");
            document.getElementById(endLabelId)?.setAttribute("visibility", "visible");
        });

        row.addEventListener("mouseout", () => {
            row.classList.remove('domain-table-row-hover');
            document.getElementById(domainRectId)?.setAttribute("opacity", "0.6");
            document.getElementById(startLabelId)?.setAttribute("visibility", "hidden");
            document.getElementById(endLabelId)?.setAttribute("visibility", "hidden");
        });
    });

    contentDiv.appendChild(table);
    domainInfoSection.appendChild(contentDiv);

    titleDiv.addEventListener('click', () => {
        domainInfoSection.classList.toggle('collapsed');
    });

    container.appendChild(domainInfoSection);
}

// =============================================================================
// Data Fetching & Processing
// =============================================================================
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

function _parseRange(rangeStr) {
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

// =============================================================================
// Plot Drawing
// =============================================================================
// These functions handle the creation of the SVG plot and its elements.
function _calculatePlotDimensions(container, margin) {
    const containerHeight = Math.max(container.clientHeight, 130);
    const plotHeight = containerHeight - margin.top - margin.bottom;
    const plotWidth = container.clientWidth - margin.left - margin.right;

    const barHeight = 10;
    const fragmentBarHeight = barHeight * 1.5;
    const uniprotDomainHeight = fragmentBarHeight * 6;
    const alphafoldDomainHeight = fragmentBarHeight * 7;

    return {
        containerHeight,
        plotHeight,
        plotWidth,
        barHeight,
        fragmentBarHeight,
        uniprotDomainHeight,
        alphafoldDomainHeight,
    };
}

function _renderDomains(svgGroup, domains, config) {
    const { instanceId, proteinLength, plotWidth, yPosition, type, domainHeight, labelFontSize } = config;
    domains.forEach((domain, index) => {
        if (domain.start === undefined || domain.end === undefined || domain.start > domain.end) return;

        const start = Math.max(1, domain.start);
    const end = Math.min(proteinLength, domain.end);
        if (end < start) return;

        const normalizedId = _normalizeDomainId(domain.id);
        const denominator = proteinLength > 1 ? proteinLength - 1 : 1;
        const x1_orig = ((start - 1) / denominator) * plotWidth;
        const x2_orig = ((end - 1) / denominator) * plotWidth;

        const rect_x = x1_orig - 0.5;
        const domainWidth = Math.max(1, x2_orig - x1_orig + 1);
        const fillColor = type === 'uniprot' ? _getDomainColor(normalizedId) : 'lightblue';

        const domainRect = _createSvgElement("rect", {
            "id": `${type}-domain-${instanceId}-${index}`,
            "x": rect_x,
            "y": yPosition,
            "width": domainWidth,
            "height": domainHeight,
            "fill": fillColor,
            "opacity": 0.6
        });

        const labelOffsetVertical = 5;
        const labelOffsetHorizontal = 2;

        const title = _createSvgElement("title");
        title.textContent = `${domain.id}: ${domain.start}-${domain.end}`;
        domainRect.appendChild(title);
        svgGroup.appendChild(domainRect);

        const labelYPos = yPosition + domainHeight + labelOffsetVertical;

        const startLabel = _createSvgElement("text", {
            "id": `${type}-start-label-${instanceId}-${index}`,
            "x": x1_orig - labelOffsetHorizontal,
            "y": labelYPos,
            "dy": "0.35em",
            "text-anchor": "end",
            "font-size": `${labelFontSize}px`,
            "fill": "#333333",
            "visibility": "hidden"
        });
        startLabel.textContent = domain.start;
        svgGroup.appendChild(startLabel);

        const endLabel = _createSvgElement("text", {
            "id": `${type}-end-label-${instanceId}-${index}`,
            "x": x2_orig + labelOffsetHorizontal,
            "y": labelYPos,
            "dy": "0.35em",
            "text-anchor": "start",
            "font-size": `${labelFontSize}px`,
            "fill": "#333",
            "visibility": "hidden"
        });
        endLabel.textContent = domain.end;
        svgGroup.appendChild(endLabel);

        if (type === 'uniprot') {
        const baseIdLabel = _createSvgElement("text", {
                "id": `${type}-baseid-label-${instanceId}-${index}`,
                "x": x1_orig + (x2_orig - x1_orig) / 2,
                "y": yPosition - labelOffsetVertical,
                "dy": "0em",
                "text-anchor": "middle",
                "font-size": `${labelFontSize}px`,
                "fill": "#333",
                "visibility": "hidden"
            });
            baseIdLabel.textContent = normalizedId;
            svgGroup.appendChild(baseIdLabel);
        }

        domainRect.addEventListener("mouseover", () => {
            domainRect.setAttribute("opacity", "1.0");
            startLabel.setAttribute("visibility", "visible");
            endLabel.setAttribute("visibility", "visible");
            if (type === 'uniprot') {
                const baseIdLabel = document.getElementById(`${type}-baseid-label-${instanceId}-${index}`);
            if (baseIdLabel) baseIdLabel.setAttribute("visibility", "visible");
            }
            document.getElementById(`${type}-row-${instanceId}-${index}`)?.classList.add('domain-table-row-hover');
            if (window.highlightPromiscuityResidues) window.highlightPromiscuityResidues(domain.start, domain.end);
        });

        domainRect.addEventListener("mouseout", () => {
            domainRect.setAttribute("opacity", "0.6");
            startLabel.setAttribute("visibility", "hidden");
            endLabel.setAttribute("visibility", "hidden");
            if (type === 'uniprot') {
                const baseIdLabel = document.getElementById(`${type}-baseid-label-${instanceId}-${index}`);
                if (baseIdLabel) baseIdLabel.setAttribute("visibility", "hidden");
            }
            document.getElementById(`${type}-row-${instanceId}-${index}`)?.classList.remove('domain-table-row-hover');
            if (window.clearPromiscuityHighlight) window.clearPromiscuityHighlight();
        });
    });
}

function _renderFragments(svgGroup, fragments, config) {
    const {proteinLength, plotWidth, yPosition, height, labelFontSize, highlightLocations} = config;

    fragments.forEach((frag, i) => {
        if (!Array.isArray(frag) || frag.length !== 2) return;
        let [start, end] = frag;
        start = Math.max(1, parseInt(start));
        end = Math.min(proteinLength, parseInt(end));
        if (isNaN(start) || isNaN(end) || end < start) return;

        const denominator = proteinLength > 1 ? proteinLength - 1 : 1;
        const x1_orig = ((start - 1) / denominator) * plotWidth;
        const x2_orig = ((end - 1) / denominator) * plotWidth;

        const rect_x = x1_orig - 0.5;
        const width = Math.max(1, x2_orig - x1_orig + 1);

        const isAbove = i % 2 === 0;
        const yRect = isAbove
            ? (yPosition - height)
            : (yPosition);

        const originalFill = "lightcoral";
        const originalStroke = "dimgrey";
        const hoverFill = "red";
        const hoverStroke = "black";

        const fragmentRect = _createSvgElement("rect", {
            "x": rect_x,
            "y": yRect,
            "width": width,
            "height": height,
            "fill": originalFill,
            "opacity": "1",
            "stroke": originalStroke,
            "stroke-width": "0.5"
        });
        svgGroup.appendChild(fragmentRect);

        if (highlightLocations.length > 0) {
            highlightLocations.forEach(loc => {
                const overlapStart = Math.max(start, loc.start);
                const overlapEnd = Math.min(end, loc.end);
                if (overlapEnd >= overlapStart) {
                    const x1_hl = ((overlapStart - 1) / denominator) * plotWidth;
                    const x2_hl = ((overlapEnd - 1) / denominator) * plotWidth;
                    const rect_x_hl = x1_hl - 0.5;
                    const highlightWidth = Math.max(1, x2_hl - x1_hl + 1);
                    const highlightRect = _createSvgElement("rect", {
                        "x": rect_x_hl,
                        "y": yRect,
                        "width": highlightWidth,
                        "height": height,
                        "fill": "#ff2a00",
                        "opacity": "1",
                        "stroke": "#b30000",
                        "stroke-width": "1.2"
                    });
                    svgGroup.appendChild(highlightRect);
                }
            });
        }

        const labelYPos = yRect + height / 2;
        const labelOffset = 1;

        const fragStartLabel = _createSvgElement("text", {
            "x": x1_orig - labelOffset,
            "y": labelYPos,
            "dy": "0.35em",
            "text-anchor": "end",
            "font-size": `${labelFontSize}px`,
            "fill": "#333",
            "visibility": "hidden"
        });
        fragStartLabel.textContent = start;
        svgGroup.appendChild(fragStartLabel);

        const fragEndLabel = _createSvgElement("text", {
            "x": x2_orig + labelOffset,
            "y": labelYPos,
            "dy": "0.35em",
            "text-anchor": "start",
            "font-size": `${labelFontSize}px`,
            "fill": "#333",
            "visibility": "hidden"
        });
        fragEndLabel.textContent = end;
        svgGroup.appendChild(fragEndLabel);

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

// =============================================================================
// Global Controls
// =============================================================================
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

// =============================================================================
// Internal Helpers
// =============================================================================
function _getDomainColor(baseId) {
    if (!_domainColorMap[baseId]) {
        _domainColorMap[baseId] = _domainColors[_currentColorIndex % _domainColors.length];
        _currentColorIndex++;
    }
    return _domainColorMap[baseId];
}

function _createSvgElement(tag, attributes = {}) {
    const svgNS = "http://www.w3.org/2000/svg";
    const element = document.createElementNS(svgNS, tag);
    for (const [key, value] of Object.entries(attributes)) {
        element.setAttribute(key, value);
    }
    return element;
}

function _normalizeDomainId(domainId) {
    let baseId = domainId;
    const underscoreIndex = baseId.lastIndexOf('_');
    if (underscoreIndex > -1 && /^\d+$/.test(baseId.substring(underscoreIndex + 1))) {
        baseId = baseId.substring(0, underscoreIndex);
    }
    return baseId.replace(/_/g, ' ');
}

// =============================================================================
// Event Listeners
// =============================================================================
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initializeAllPlots, 100);

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
                        initializePlotInstance(instanceId, instance.proteinName, instance.selectors);
                    }
                }
            });
        }, 250);
    });
});
