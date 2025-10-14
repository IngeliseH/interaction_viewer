import { fetchProteinData } from './data.js';
import { displayInfo, createSvgElement, createProteinLabel, createHoverLabel } from './plot-utility.js';

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
export async function initializeDomainFragmentPlots({ proteins, interactionRegions = [] }) {
    _setupGlobalPlotControls();

    const fallbackMessage = document.getElementById('domain-fragments-fallback-message');
    if (fallbackMessage) fallbackMessage.style.display = 'none';

    for (let i = 1; i <= proteins.length; i++) {
        const protein = proteins[i-1];
        const interactionRegion = (interactionRegions.length >= i) ? interactionRegions[i-1] : [];
        const plotSectionsContainer = document.getElementById('domain-fragment-plots-container');

        await _initializePlotInstance({
            instanceId:`p${i}`,
            proteinName: protein,
            interactionRegion,
            plotSectionsContainer
        });
    }
}

// =============================================================================
// Core Logic
// =============================================================================
async function _initializePlotInstance({instanceId, proteinName, interactionRegion = [], plotSectionsContainer}) {
    const section = document.createElement('div');
    section.id = `domain-fragment-plot-${instanceId}-section`;

    const subheading = document.createElement('h3');
    subheading.id = `${instanceId}-name-subheading-domain-fragment`;
    subheading.className = 'page-subtitle';
    subheading.textContent = proteinName;

    const container = document.createElement('div');
    container.id = `domain-fragment-plot-container-${instanceId}`;
    container.className = 'domain-fragment-plot-container';
    displayInfo(container, "Loading data for domain/fragment plot...");

    section.appendChild(subheading);
    section.appendChild(container);
    plotSectionsContainer.appendChild(section);

    const instance = {
        proteinName,
        proteinLength: null,
        fragmentIndices: null,
        alphafoldDomains: null,
        uniprotDomains: null,
        interactionRegion: interactionRegion || [],
        isCollapsibleTableCollapsed: true,
        containerSelector: container.id,
        subheadingSelector: subheading.id
    };
    _plotInstances[instanceId] = instance;

    const proteinData = await fetchProteinData(proteinName);
    if (proteinData.length === null || isNaN(proteinData.length)) {
        const message = proteinName ? `Length data not available or invalid for ${proteinName}.` : 'Protein not specified.';
        displayInfo(container, message, true);
        return;
    }
    
    instance.proteinLength = proteinData.length;
    instance.fragmentIndices = proteinData.fragmentIndices;
    instance.alphafoldDomains = proteinData.alphafoldDomains;
    instance.uniprotDomains = proteinData.uniprotDomains;

    container.innerHTML = '';

    _renderPlot(container, instanceId);
    _renderCollapsibleTable(container, instanceId);
}

function _updatePlot(instanceId) {
    const instance = _plotInstances[instanceId];
    if (!instance) {
        console.error(`Domain/Fragment Plot: Instance ${instanceId} not found.`);
        return;
    }

    const container = document.getElementById(instance.containerSelector);
    if (!container) {
        console.error(`Domain/Fragment Plot: Container not found using selector "${instance.containerSelector}" for instance ${instanceId}`);
        return;
    }
    container.innerHTML = '';
    if (!instance.proteinName || !instance.proteinLength) {
        const message = instance.proteinName ? `Length data not available for ${instance.proteinName}.` : 'Protein not specified.';
        displayInfo(container, message, true);
        return null;
    }

    _renderPlot(container, instanceId);
    _renderCollapsibleTable(container, instanceId);
}

function _renderPlot(container, instanceId) {
    const instance = _plotInstances[instanceId];
    const { proteinName, proteinLength, fragmentIndices, alphafoldDomains, uniprotDomains } = instance;
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
        _renderDomains(svgGroup, instanceId, {
            plotWidth: dimensions.plotWidth,
            yPosition: (dimensions.plotHeight / 2) - (dimensions.alphafoldDomainHeight / 2),
            type: 'af',
            domainHeight: dimensions.alphafoldDomainHeight,
            labelFontSize: 10
        });
    }

    if (showUniprotDomains && uniprotDomains && uniprotDomains.length > 0 && proteinLength) {
        _renderDomains(svgGroup, instanceId, {
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
                _renderFragments(svgGroup, parsedFragments, instanceId, {
                    plotWidth: dimensions.plotWidth,
                    yPosition: dimensions.plotHeight / 2,
                    height: dimensions.fragmentBarHeight
                });
            }
        } catch (e) {
            console.error('Fragment parsing error:', e);
        }
    }

    const startLabel = createProteinLabel("1", -15, dimensions.plotHeight / 2, { textAnchor: "end" });
    svgGroup.appendChild(startLabel);

    const endLabel = createProteinLabel(proteinLength, dimensions.plotWidth + 15, dimensions.plotHeight / 2, { textAnchor: "start" });
    svgGroup.appendChild(endLabel);

    svg.appendChild(svgGroup);
    container.appendChild(svg);
}

function _renderCollapsibleTable(container, instanceId) {
    const instance = _plotInstances[instanceId];
    const { alphafoldDomains, uniprotDomains } = instance;
    const { showUniprotDomains, showAlphafoldDomains } = _globalPlotToggleStates;

    const domainInfoSection = document.createElement('div');
    domainInfoSection.className = 'collapsible-subsection';
    if (instance.isCollapsibleTableCollapsed) {
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
                instanceId,
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
                instanceId,
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
        instance.isCollapsibleTableCollapsed = !instance.isCollapsibleTableCollapsed;
    });

    container.appendChild(domainInfoSection);
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

function _renderDomains(svgGroup, instanceId, config) {
    const { plotWidth, yPosition, type, domainHeight } = config;
    const instance = _plotInstances[instanceId];
    const { proteinLength } = instance;
    const domains = type === 'uniprot' ? instance.uniprotDomains : instance.alphafoldDomains;

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
        const fillColor = type === 'uniprot' ? _assignDomainColor(normalizedId) : 'lightblue';

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

        const startLabel = createHoverLabel(domain.start, x1_orig - labelOffsetHorizontal, yPosition + domainHeight + labelOffsetVertical, {textAnchor: "end"});
        startLabel.id = `${type}-start-label-${instanceId}-${index}`;

        const endLabel = createHoverLabel(domain.end, x2_orig + labelOffsetHorizontal, yPosition + domainHeight + labelOffsetVertical, {textAnchor: "start"});
        endLabel.id = `${type}-end-label-${instanceId}-${index}`;

        const labels = [startLabel, endLabel];
        if (type === 'uniprot') {
            const baseIdLabel = createHoverLabel(normalizedId, x1_orig + (x2_orig - x1_orig) / 2, yPosition - labelOffsetVertical);
            baseIdLabel.id = `${type}-baseid-label-${instanceId}-${index}`;
            labels.push(baseIdLabel);
        }

        domainRect.addEventListener("mouseover", () => {
            _handleDomainHover(
                true,
                instanceId,
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
                instanceId,
                `${type}-domain-${instanceId}-${index}`,
                `${type}-start-label-${instanceId}-${index}`,
                `${type}-end-label-${instanceId}-${index}`,
                type === 'uniprot' ? `${type}-baseid-label-${instanceId}-${index}` : null,
                document.getElementById(`${type}-row-${instanceId}-${index}`),
                domain.start,
                domain.end
            );
        });

        svgGroup.appendChild(domainRect);
        labels.forEach(label => svgGroup.appendChild(label));
    });
}

function _renderFragments(svgGroup, fragments, instanceId, config) {
    const { plotWidth, yPosition, height } = config;
    const instance = _plotInstances[instanceId];
    const { proteinLength } = instance;

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

        if (instance.interactionRegion.length > 0) {
            instance.interactionRegion.forEach(loc => {
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

        const fragStartLabel = createHoverLabel(start, x1_orig - labelOffset, labelYPos, {textAnchor: "end"});
        svgGroup.appendChild(fragStartLabel);

        const fragEndLabel = createHoverLabel(end, x2_orig + labelOffset, labelYPos, {textAnchor: "start"});
        svgGroup.appendChild(fragEndLabel);

        fragmentRect.addEventListener("mouseover", () => {
            fragmentRect.setAttribute("fill", hoverFill);
            fragmentRect.setAttribute("stroke", hoverStroke);
            fragStartLabel.setAttribute("visibility", "visible");
            fragEndLabel.setAttribute("visibility", "visible");
            if (window.highlightPromiscuityResidues) window.highlightPromiscuityResidues(instanceId, start, end);
        });
        fragmentRect.addEventListener("mouseout", () => {
            fragmentRect.setAttribute("fill", originalFill);
            fragmentRect.setAttribute("stroke", originalStroke);
            fragStartLabel.setAttribute("visibility", "hidden");
            fragEndLabel.setAttribute("visibility", "hidden");
            if (window.highlightPromiscuityResidues) window.highlightPromiscuityResidues(instanceId);
        });
    });
}

// =============================================================================
// Global Controls
// =============================================================================
function _createToggleButton({ key, className, innerHTML, title }) {
    const redrawAllActivePlots = () => {
        Object.keys(_plotInstances).forEach(id => {
            if (_plotInstances[id] && _plotInstances[id].proteinName) {
                _updatePlot(id);
            }
        });
    };

    const button = document.createElement('button');
    button.type = 'button';
    button.className = `control-button ${className}`;
    button.innerHTML = innerHTML;
    button.title = title;
    button.classList.toggle('active', _globalPlotToggleStates[key]);

    button.addEventListener('click', () => {
        _globalPlotToggleStates[key] = !_globalPlotToggleStates[key];
        button.classList.toggle('active', _globalPlotToggleStates[key]);
        redrawAllActivePlots();
    });

    return button;
}

function _setupGlobalPlotControls() {
    const placeholder = document.getElementById('domain-fragment-controls-placeholder');
    if (!placeholder) return;
    placeholder.innerHTML = ''; 

    const controlBar = document.createElement('div');
    controlBar.className = 'control-bar global-domain-fragment-plot-controls';

    const buttonGroup = document.createElement('div');
    buttonGroup.className = 'control-button-group';

    const buttonConfigs = [
        {
            key: 'showUniprotDomains',
            className: 'global-uniprot-domains-button',
            innerHTML: '<i class="fas fa-layer-group"></i> Domains',
            title: 'Toggle UniProt Domains'
        },
        {
            key: 'showAlphafoldDomains',
            className: 'global-alphafold-domains-button',
            innerHTML: '<i class="fas fa-brain"></i> AlphaFold Domains',
            title: 'Toggle AlphaFold Domains'
        },
        {
            key: 'showFragments',
            className: 'global-fragments-button',
            innerHTML: '<i class="fas fa-puzzle-piece"></i> Fragments',
            title: 'Toggle Fragments'
        }
    ];

    buttonConfigs.forEach(config => {
        const button = _createToggleButton({
            ...config
        });
        buttonGroup.appendChild(button);
    });

    controlBar.appendChild(buttonGroup);
    placeholder.appendChild(controlBar);
}

// =============================================================================
// Internal Helpers
// =============================================================================
function _assignDomainColor(baseId) {
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

function _handleDomainHover(isHovering, instanceId, domainRectId, startLabelId, endLabelId, baseIdLabelId, domainRow, start, end) {
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
        window.highlightPromiscuityResidues(instanceId, start, end);
    } else if (!isHovering && window.highlightPromiscuityResidues) {
        window.highlightPromiscuityResidues(instanceId);
    }
}
