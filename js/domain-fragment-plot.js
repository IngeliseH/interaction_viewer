import { fetchProteinData } from './data.js';
import { createSvgElement, createProteinLengthLabel, createHoverLabel } from './plot-utility.js';

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
    if (!proteinName) {
        console.error(`Domain/Fragment Plot: No protein name provided for instance ${instanceId}`);
        return;
    }

    _plotInstances[instanceId] = {
        proteinName,
        proteinLength: null,
        fragmentIndices: null,
        alphafoldDomains: null,
        uniprotDomains: null,
        selectors: { ...selectorsConfig }
    };

    const instance = _plotInstances[instanceId];
    const container = document.querySelector(instance.selectors.container);
    const statusMessageElement = document.querySelector(instance.selectors.statusMessage);
    const subheadingElement = instance.selectors.subheading ? document.querySelector(instance.selectors.subheading) : null;

    if (subheadingElement) {
        subheadingElement.textContent = proteinName;
    }

    if (statusMessageElement) statusMessageElement.textContent = `Loading data for ${proteinName}...`;
    if (container) container.innerHTML = `<p style="text-align:center; color:grey; padding-top: 20px;">Loading data for domain/fragment plot...</p>`;

    const proteinData = await fetchProteinData(proteinName);
    
    instance.proteinLength = proteinData.length;
    instance.fragmentIndices = proteinData.fragmentIndices;
    instance.alphafoldDomains = proteinData.alphafoldDomains;
    instance.uniprotDomains = proteinData.uniprotDomains;

    if (statusMessageElement) {
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
            return;
        }

        if (fallbackMessageDF) fallbackMessageDF.style.display = 'none';

        await initializePlotInstance('p1', p1, {
            container: '#domain-fragment-plot-container-p1',
            statusMessage: '.domain-fragment-plot-status-p1',
            subheading: '#p1-name-subheading-df'
        });

        if (p2 && p1 !== p2) {
            const p2Section = document.getElementById('domain-fragment-plot-p2-section');
            if (p2Section) {
                p2Section.style.display = 'block';

                await initializePlotInstance('p2', p2, {
                    container: '#domain-fragment-plot-container-p2',
                    statusMessage: '.domain-fragment-plot-status-p2',
                    subheading: '#p2-name-subheading-df'
                });
            }
        } else if (p2Section) {
            p2Section.style.display = 'none';
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

    const { proteinName, proteinLength, fragmentIndices, alphafoldDomains, uniprotDomains, selectors } = instance;
    if (!selectors || !selectors.container) {
        console.error(`Domain/Fragment Plot: No container selector defined for instance ${instanceId}`);
        return;
    }

    const container = document.querySelector(selectors.container);
    if (!container) {
        console.error(`Domain/Fragment Plot: Container not found using selector "${selectors.container}" for instance ${instanceId}`);
        return;
    }

    const collapsibleSection = container.querySelector(`#domain-info-collapsible-section-${instanceId}`);
    const wasCollapsed = collapsibleSection?.classList.contains('collapsed');

    container.innerHTML = '';

    if (proteinLength === null || isNaN(proteinLength)) {
        const message = proteinName ? `Length data not available or invalid for ${proteinName}. Cannot draw domain/fragment plot.` : 'Protein not specified for domain/fragment plot.';
        container.innerHTML = `<p style="text-align:center; color:grey; padding-top: 20px;">${message}</p>`;
        return;
    }

    _renderPlot(container, instanceId, {
        proteinName,
        proteinLength,
        fragmentIndices,
        alphafoldDomains,
        uniprotDomains,
    });

    _renderCollapsibleTable(container, instanceId, {
        alphafoldDomains,
        uniprotDomains,
    }, wasCollapsed);
}

function _renderPlot(container, instanceId, { proteinName, proteinLength, fragmentIndices, alphafoldDomains, uniprotDomains }) {
    const { showUniprotDomains, showAlphafoldDomains, showFragments } = _globalPlotToggleStates;
    const margin = { top: 0, right: 60, bottom: 0, left: 60 };
    const dimensions = _calculatePlotDimensions(container, margin);

    const svg = createSvgElement("svg", {
        "width": "100%",
        "height": dimensions.containerHeight,
        "viewBox": `0 0 ${container.clientWidth} ${dimensions.containerHeight}`
    });

    const svgGroup = createSvgElement("g", {
        "transform": `translate(${margin.left}, ${margin.top})`
    });

    if (!showFragments) {
        const rectY = dimensions.plotHeight / 2 - (dimensions.barHeight / 2);
        const rectHeight = dimensions.barHeight;

        const proteinBar = createSvgElement("rect", {
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

    if (showFragments && proteinName && proteinLength && fragmentIndices) {
        let parsedFragments = [];
        try {
            if (typeof fragmentIndices === 'string') {
                const jsonStr = fragmentIndices
                    .replace(/'/g, '"')
                    .replace(/\(/g, '[')
                    .replace(/\)/g, ']')
                    .replace(/,\s*\]/g, ']');
                parsedFragments = JSON.parse(jsonStr);
            } else if (Array.isArray(fragmentIndices)) {
                parsedFragments = fragmentIndices;
            }

            if (parsedFragments.length > 0) {
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

                _renderFragments(svgGroup, parsedFragments, {
                    proteinLength,
                    plotWidth: dimensions.plotWidth,
                    yPosition: dimensions.plotHeight / 2,
                    height: dimensions.fragmentBarHeight,
                    labelFontSize: 10,
                    highlightLocations
                });
            }
        } catch (e) {
            console.error('Fragment parsing error:', e);
        }
    }

    const startLabel = createProteinLengthLabel("1", -15, dimensions.plotHeight / 2, "end");
    svgGroup.appendChild(startLabel);

    const endLabel = createProteinLengthLabel(proteinLength, dimensions.plotWidth + 15, dimensions.plotHeight / 2, "start");
    svgGroup.appendChild(endLabel);

    svg.appendChild(svgGroup);
    container.appendChild(svg);
}

function _renderCollapsibleTable(container, instanceId, { alphafoldDomains, uniprotDomains }, collapsed = true) {
    const { showUniprotDomains, showAlphafoldDomains } = _globalPlotToggleStates;

    const domainInfoSection = document.createElement('div');
    domainInfoSection.className = 'collapsible-subsection';
    if (collapsed) {
        domainInfoSection.classList.add('collapsed');
    }
    domainInfoSection.id = `domain-info-collapsible-section-${instanceId}`;

    const titleDiv = document.createElement('div');
    titleDiv.className = 'collapsible-subsection-title';

    const titleText = document.createElement('h4');
    titleText.textContent = 'Domain Details';
    titleDiv.appendChild(titleText);

    const icon = document.createElement('i');
    icon.className = 'fas fa-chevron-up';
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
        ...(showAlphafoldDomains ? (alphafoldDomains || []).map((domain, index) => ({ ...domain, type: 'af', originalIndex: index })) : []),
        ...(showUniprotDomains ? (uniprotDomains || []).map((domain, index) => ({ ...domain, type: 'uniprot', originalIndex: index })) : []),
    ];

    allDomainsForTable.sort((a, b) => a.start - b.start || a.end - b.end);

    allDomainsForTable.forEach(domainEntry => {
        const row = tbody.insertRow();
        const domainRectId = `${domainEntry.type}-domain-${instanceId}-${domainEntry.originalIndex}`;
        const startLabelId = `${domainEntry.type}-start-label-${instanceId}-${domainEntry.originalIndex}`;
        const endLabelId = `${domainEntry.type}-end-label-${instanceId}-${domainEntry.originalIndex}`;
        const baseIdLabelId = domainEntry.type === 'uniprot' ? `${domainEntry.type}-baseid-label-${instanceId}-${domainEntry.originalIndex}` : null;

        row.id = `${domainEntry.type}-row-${instanceId}-${domainEntry.originalIndex}`;
        row.dataset.domainType = domainEntry.type;
        row.dataset.domainIndex = domainEntry.originalIndex;

        const cellName = row.insertCell();
        cellName.textContent = domainEntry.type === 'af' ? 
            'AlphaFold' : 
            _normalizeDomainId(domainEntry.id);

        const cellPosition = row.insertCell();
        cellPosition.textContent = `${domainEntry.start}-${domainEntry.end}`;

        row.addEventListener("mouseover", () => {
            _handleDomainHover(
                true,
                domainRectId,
                startLabelId,
                endLabelId,
                baseIdLabelId,
                row,
                domainEntry.start,
                domainEntry.end
            );
        });

        row.addEventListener("mouseout", () => {
            _handleDomainHover(
                false,
                domainRectId,
                startLabelId,
                endLabelId,
                baseIdLabelId,
                row,
                domainEntry.start,
                domainEntry.end
            );
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
// Data Processing
// =============================================================================
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
    
    // Expose domain color map globally for chord plot
    window.domainPlot_domainBaseIdToColor = _domainColorMap;
    window.domainPlotInstancesData = _plotInstances;

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

        const domainRect = createSvgElement("rect", {
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

        const title = createSvgElement("title");
        title.textContent = `${domain.id}: ${domain.start}-${domain.end}`;
        domainRect.appendChild(title);
        svgGroup.appendChild(domainRect);

        const labelYPos = yPosition + domainHeight + labelOffsetVertical;

        const startLabel = createHoverLabel(domain.start, x1_orig - labelOffsetHorizontal, labelYPos, "end");
        startLabel.id = `${type}-start-label-${instanceId}-${index}`;
        svgGroup.appendChild(startLabel);

        const endLabel = createHoverLabel(domain.end, x2_orig + labelOffsetHorizontal, labelYPos, "start");
        endLabel.id = `${type}-end-label-${instanceId}-${index}`;
        svgGroup.appendChild(endLabel);

        if (type === 'uniprot') {
            const baseIdLabel = createHoverLabel(normalizedId, x1_orig + (x2_orig - x1_orig) / 2, yPosition - labelOffsetVertical,);
            baseIdLabel.id = `${type}-baseid-label-${instanceId}-${index}`;
            svgGroup.appendChild(baseIdLabel);
        }

        domainRect.addEventListener("mouseover", () => {
            _handleDomainHover(
                true,
                `${type}-domain-${instanceId}-${index}`,
                `${type}-start-label-${instanceId}-${index}`,
                `${type}-end-label-${instanceId}-${index}`,
                type === 'uniprot' ? `${type}-baseid-label-${instanceId}-${index}` : null,
                document.getElementById(`${type}-row-${instanceId}-${index}`),
                domain.start,
                domain.end
            );
        });

        domainRect.addEventListener("mouseout", () => {
            _handleDomainHover(
                false,
                `${type}-domain-${instanceId}-${index}`,
                `${type}-start-label-${instanceId}-${index}`,
                `${type}-end-label-${instanceId}-${index}`,
                type === 'uniprot' ? `${type}-baseid-label-${instanceId}-${index}` : null,
                document.getElementById(`${type}-row-${instanceId}-${index}`),
                domain.start,
                domain.end
            );
        });
    });
}

function _renderFragments(svgGroup, fragments, config) {
    const { proteinLength, plotWidth, yPosition, height, labelFontSize, highlightLocations } = config;

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

        const fragmentRect = createSvgElement("rect", {
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
                    const highlightRect = createSvgElement("rect", {
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

        const fragStartLabel = createHoverLabel(start, x1_orig - labelOffset, labelYPos, "end");
        svgGroup.appendChild(fragStartLabel);

        const fragEndLabel = createHoverLabel(end, x2_orig + labelOffset, labelYPos, "start");
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

function _normalizeDomainId(domainId) {
    let baseId = domainId;
    const underscoreIndex = baseId.lastIndexOf('_');
    if (underscoreIndex > -1 && /^\d+$/.test(baseId.substring(underscoreIndex + 1))) {
        baseId = baseId.substring(0, underscoreIndex);
    }
    return baseId.replace(/_/g, ' ');
}

function _handleDomainHover(isHovering, domainRectId, startLabelId, endLabelId, baseIdLabelId, domainRow, start, end) {
    const domainRect = document.getElementById(domainRectId);
    if (domainRect) domainRect.setAttribute("opacity", isHovering ? "1.0" : "0.6");

    const startLabel = document.getElementById(startLabelId);
    const endLabel = document.getElementById(endLabelId);
    if (startLabel) startLabel.setAttribute("visibility", isHovering ? "visible" : "hidden");
    if (endLabel) endLabel.setAttribute("visibility", isHovering ? "visible" : "hidden");

    const baseIdLabel = baseIdLabelId ? document.getElementById(baseIdLabelId) : null;
    if (baseIdLabel) baseIdLabel.setAttribute("visibility", isHovering ? "visible" : "hidden");

    if (domainRow) {
        if (isHovering) {
            domainRow.classList.add('domain-table-row-hover');
            domainRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
            domainRow.classList.remove('domain-table-row-hover');
        }
    }

    if (isHovering && window.highlightPromiscuityResidues) {
        window.highlightPromiscuityResidues(start, end);
    } else if (!isHovering && window.clearPromiscuityHighlight) {
        window.clearPromiscuityHighlight();
    }
}

// =============================================================================
// Event Listeners
// =============================================================================
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize p2 section containers early, ensuring they exist before plot initialization
    const p2Section = document.getElementById('domain-fragment-plot-p2-section');
    if (p2Section) {
        if (!p2Section.querySelector('#domain-fragment-plot-container-p2')) {
            p2Section.innerHTML = `
                <h3 id="p2-name-subheading-df" class="page-subtitle">Loading Protein 2...</h3>
                <div class="domain-fragment-plot-status-p2"></div>
                <div class="domain-fragment-plot-container-p2"></div>
            `;
        }
    }

    // Initialize plots after ensuring containers exist
    await initializeAllPlots();

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
