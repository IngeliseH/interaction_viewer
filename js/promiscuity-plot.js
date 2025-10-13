import { displayInfo, createSvgElement, createProteinLabel, createHoverLabel, setupHoverEffect } from './plot-utility.js';

let _plotInstances = {};

let _applyPromiscuityFilters = true;

// =============================================================================
// Public API Functions
// =============================================================================
export function getPromiscuityFilterState() {
    return _applyPromiscuityFilters;
}

//TODO: use better system for getting protein length data
export async function initializePromiscuityPlots({
    proteins,
    interactionRegions = [],
    proteinLengthData,
    interfaceData,
    filter,
    applyFilters
}) {
    _applyPromiscuityFilters = applyFilters;;

    const controlsPlaceholder = document.querySelector('#promiscuity-controls-placeholder');
    const plotSectionsContainer = document.querySelector('#promiscuity-plots-container');
    const fallbackMessage = document.querySelector('#promiscuity-fallback-message');
    if (fallbackMessage) fallbackMessage.style.display = 'none';

    if (!plotSectionsContainer || !controlsPlaceholder) {
        console.error('Promiscuity Plot: Essential container or placeholder selectors not found.');
        return;
    }
    plotSectionsContainer.innerHTML = '';
    _plotInstances = {};

    _setupPromiscuityControls(controlsPlaceholder, updateAllPromiscuityPlots);

    proteins.forEach((proteinName, index) => {
        const instanceId = `p${index + 1}`;
        _initializePlotInstance(instanceId, proteinName, {
            interactionRegion: interactionRegions[index] || null,
            proteinLengthData,
            interfaceData,
            filter,
            plotSectionsContainer
        });
    });

    updateAllPromiscuityPlots();
}

export function updateAllPromiscuityPlots() {
    Object.keys(_plotInstances).forEach(instanceId => {
        _updatePromiscuityPlot(instanceId);
    });
}

export function highlightPromiscuityResidues(instanceId, start = null, end = null) {
    const container = document.getElementById(`promiscuity-plot-${instanceId}`);

    if (!container) {
        console.warn(`Promiscuity Plot: Container for instance ${instanceId} not found.`);
        return;
    };

    let highlightRange = null;
    if (typeof start === "number" && typeof end === "number" && start <= end) {
        highlightRange = { start, end };
    }
    const barsGroup = container.querySelector('svg g.coverage-bars');
    if (!barsGroup) {
        console.warn(`Promiscuity Plot: Coverage bars group for instance ${instanceId} not found.`);
        return;
    };
    const bars = barsGroup.querySelectorAll('rect');

    bars.forEach((rect) => {
        const residueIdx = Number(rect.dataset.residueIdx);
        const isInHighlight = highlightRange &&
            residueIdx >= start &&
            residueIdx <= end;
        rect.setAttribute("opacity", isInHighlight ? "1.0" : "0.6");
    });
}

// =============================================================================
// Data Fetching & Processing
// =============================================================================
function _fetchRelevantInterfaces(proteinName, proteinLength, interfaceData, filterCriteria = {}) {
    const coverageArray = Array(proteinLength).fill(0);
    const emptyResult = { filteredData: [], coverageArray };

    if (!interfaceData) {
        console.error('Promiscuity Plot: Interface data not provided.');
        return emptyResult;
    }

    let filteredData = interfaceData.filter(row =>
        (row.Protein1 === proteinName || row.Protein2 === proteinName) &&
        Object.entries(filterCriteria).every(([key, filterFn]) => {
            return row[key] !== undefined && typeof filterFn === 'function' ? filterFn(row[key], row) : true;
        })
    );

    filteredData.forEach(row => {
        const key = row.Protein1 === proteinName ? 'Protein1' : 'Protein2';
        if (row.absolute_location) {
            try {
                const sanitizedJson = row.absolute_location.replace(/'/g, '"').replace(/None/g, 'null');
                const absoluteLocation = JSON.parse(sanitizedJson);
                if (Array.isArray(absoluteLocation?.[key])) {
                    absoluteLocation[key].forEach(idx => {
                        if (idx > 0 && idx <= proteinLength) {
                            coverageArray[idx - 1]++;
                        }
                    });
                }
            } catch (e) {
                console.warn('Promiscuity Plot: Failed to parse absolute_location:', row.absolute_location, e);
            }
        }
    });
    return coverageArray;
}

function _convertTableFiltersToPromiscuityCriteria(activeNumericFilters) {
    const criteria = {};
    if (!Array.isArray(activeNumericFilters)) return criteria;

    activeNumericFilters.forEach(filter => {
        if (filter.column) {
            criteria[filter.column] = (val) => {
                const numVal = Number(val);
                if (isNaN(numVal)) return false;

                let passes = true;
                if (filter.min !== undefined && numVal < filter.min) {
                    passes = false;
                }
                if (filter.max !== undefined && numVal > filter.max) {
                    passes = false;
                }
                return passes;
            };
        }
    });
    return criteria;
}

// =============================================================================
// Plot Drawing
// =============================================================================
function _initializePlotInstance(instanceId, proteinName, config) {
    const {
        interactionRegion,
        proteinLengthData,
        interfaceData,
        filter,
        plotSectionsContainer
    } = config;

    const sectionId = `promiscuity-plot-${instanceId}-section`;
    const plotId = `promiscuity-plot-${instanceId}`;

    const section = document.createElement('div');
    section.id = sectionId;

    const subheading = document.createElement('h3');
    subheading.id = `${instanceId}-name-subheading-promiscuity`;
    subheading.className = 'page-subtitle';
    subheading.textContent = proteinName;

    const container = document.createElement('div');
    container.id = plotId;
    container.className = 'promiscuity-plot-container';

    section.appendChild(subheading);
    section.appendChild(container);
    plotSectionsContainer.appendChild(section);

    const proteinInfoRow = proteinLengthData.find(row => row.name === proteinName);
    const proteinLength = parseInt(proteinInfoRow?.length);

    const plotElements = _drawPromiscuityBasePlot({proteinName, proteinLength, container: container, interactionRegion: interactionRegion || null});

    _plotInstances[instanceId] = {
        proteinName,
        containerSelector: `#${plotId}`,
        interactionRegion: interactionRegion || null,
        proteinLengthData,
        interfaceData,
        filter,
        plotElements
    };
}

function _updatePromiscuityPlot(instanceId) {
    const instance = _plotInstances[instanceId];
    if (!instance) {
        console.error(`Promiscuity plot instance ${instanceId} not found.`);
        return;
    }

    const {
        proteinName,
        proteinLengthData,
        interfaceData,
        filter,
        plotElements
    } = instance;

    const filterCriteria = _applyPromiscuityFilters ? _convertTableFiltersToPromiscuityCriteria(filter.getAllFilters()) : {};

    const proteinInfoRow = proteinLengthData.find(row => row.name === proteinName);
    const proteinLength = parseInt(proteinInfoRow?.length, 10);
    const coverageArray = _fetchRelevantInterfaces(proteinName, proteinLength, interfaceData, filterCriteria);

    if (plotElements) {
        _drawPromiscuityCoverageBars(plotElements, coverageArray);
    }
}

function _setupPromiscuityControls(placeholder, updateCallback) {
    if (!placeholder) return;

    placeholder.innerHTML = ''; 

    const controlBar = document.createElement('div');
    controlBar.className = 'control-bar';

    const buttonGroup = document.createElement('div');
    buttonGroup.className = 'control-button-group';

    const toggleButton = document.createElement('button');
    toggleButton.type = 'button';
    toggleButton.className = 'control-button';
    toggleButton.innerHTML = _applyPromiscuityFilters
        ? '<i class="fas fa-list"></i> Show All Data'
        : '<i class="fas fa-filter"></i> Show Filtered Data';
    toggleButton.title = 'Toggle between all and filtered interaction data';

    toggleButton.addEventListener('click', () => {
        _applyPromiscuityFilters = !_applyPromiscuityFilters;
        toggleButton.innerHTML = _applyPromiscuityFilters
            ? '<i class="fas fa-list"></i> Show All Data'
            : '<i class="fas fa-filter"></i> Show Filtered Data';
        
        if (typeof updateCallback === 'function') {
            updateCallback();
        }
    });

    buttonGroup.appendChild(toggleButton);
    controlBar.appendChild(buttonGroup);
    placeholder.appendChild(controlBar);
}

function _drawPromiscuityBasePlot(options) {
    const {proteinName, proteinLength, container, interactionRegion = null} = options

    if (!container) {
        console.error('Promiscuity Plot: Container not found.');
        return null;
    }
    container.innerHTML = '';

    if (!proteinName || !proteinLength) {
        const message = proteinName ? `Length data not available for ${proteinName}.` : 'Protein not specified.';
        displayInfo(container, message, true);
        return null;
    }

    const containerWidth = container.clientWidth;
    const margin = { top: 0, right: 60, bottom: 0, left: 60 };
    const containerHeight = 150;
    const plotWidth = container.clientWidth - margin.left - margin.right;
    const barHeight = 10;
    const yPosition = containerHeight / 1.1;

    const svg = createSvgElement("svg", {
        "width": "100%",
        "height": containerHeight,
        "viewBox": `0 0 ${containerWidth} ${containerHeight}`
    });

    const svgGroup = createSvgElement("g", { "transform": `translate(${margin.left}, 0)` });

    const proteinBar = createSvgElement("rect", {
        "x": 0,
        "y": yPosition - (barHeight / 2),
        "width": plotWidth,
        "height": barHeight,
        "fill": "#ccc"
    });
    svgGroup.appendChild(proteinBar);

    if (Array.isArray(interactionRegion)) {
        interactionRegion.forEach(region => {
            if (region && typeof region.start === "number" && typeof region.end === "number" && region.start >= 1 && region.end <= proteinLength) {
                const x = ((region.start - 1) / proteinLength) * plotWidth;
                const width = ((region.end - region.start + 1) / proteinLength) * plotWidth;
                const highlightRect = createSvgElement("rect", {
                    "x": x,
                    "y": yPosition - (barHeight / 2),
                    "width": width,
                    "height": barHeight,
                    "fill": "#ff2a00",
                    "opacity": "1",
                    "stroke": "#b30000",
                    "stroke-width": "1.2",
                    "pointer-events": "none"
                });
                svgGroup.appendChild(highlightRect);
            }
        });
    }

    const startLabel = createProteinLabel("1", -15, yPosition, { textAnchor: "end" });
    svgGroup.appendChild(startLabel);

    const endLabel = createProteinLabel(proteinLength.toString(), plotWidth + 15, yPosition, { textAnchor: "start" });
    svgGroup.appendChild(endLabel);

    const barsGroup = createSvgElement("g", { "class": "coverage-bars" });
    svgGroup.appendChild(barsGroup);

    svg.appendChild(svgGroup);
    container.appendChild(svg);

    return { svgGroup, plotWidth, margin, yPosition, barHeight, interactionRegion, barsGroup };
}

function _drawPromiscuityCoverageBars(plotElements, coverageArray) {
    const { svgGroup, plotWidth, margin, yPosition, barHeight, interactionRegion, barsGroup } = plotElements;

    barsGroup.innerHTML = '';
    svgGroup.querySelectorAll('.threshold-line, .threshold-label').forEach(el => el.remove());

    if (!coverageArray || coverageArray.length === 0) {
        return;
    };

    const interactionRegions = Array.isArray(interactionRegion) ? interactionRegion : [];
    const isInInteractionRegion = (residueIdx) =>
        interactionRegions.some(region => residueIdx + 1 >= region.start && residueIdx + 1 <= region.end);

    const maxCount = Math.max(...coverageArray, 1);
    const proteinBarTopY = yPosition - (barHeight / 2);
    const barMaxHeight = (proteinBarTopY - margin.top) * 0.9;
    const residueWidth = plotWidth / coverageArray.length;

    const thresholds = [0.25, 0.5, 0.75, 1.0];
    thresholds.forEach(t => {
        const thresholdCount = t * maxCount;
        const y = proteinBarTopY - (barMaxHeight * t);
        const line = createSvgElement("line", {
            "class": "threshold-line",
            "x1": 0,
            "x2": plotWidth,
            "y1": y,
            "y2": y,
            "stroke": "#7f8c8d",
            "stroke-dasharray": "4,3",
            "stroke-width": t === 1.0 ? "2" : "1",
            "opacity": t === 1.0 ? "0.6" : "0.3"
        });
        svgGroup.appendChild(line);

        const label = createSvgElement("text", {
            "class": "threshold-label",
            "x": plotWidth + 8,
            "y": y,
            "dy": "0.35em",
            "font-size": "10px",
            "fill": "#2c3e50"
        });
        label.textContent = Math.round(thresholdCount);
        svgGroup.appendChild(label);
    });

    coverageArray.forEach((count, i) => {
        if (count > 0) {
            const barHeightScaled = (count / maxCount) * barMaxHeight;
            const rectY = proteinBarTopY - barHeightScaled;
            const rect = createSvgElement("rect", {
                "x": i * residueWidth,
                "y": rectY,
                "width": residueWidth,
                "height": barHeightScaled,
                "fill": isInInteractionRegion(i) ? "#e74c3c" : "#1f77b4",
                "opacity": "0.6",
                "data-residue-idx": i + 1
            });

            const hoverLabel = createHoverLabel(`Residue ${i + 1}: ${count}`, (i + 0.5) * residueWidth, rectY - 8, { bold: true });
            setupHoverEffect(rect, [hoverLabel], svgGroup);

            barsGroup.appendChild(rect);
        }
    });
}

//TODO: stop attaching to window?
window.highlightPromiscuityResidues = highlightPromiscuityResidues;
