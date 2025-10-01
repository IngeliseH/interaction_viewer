import { createSvgElement, createProteinLabel, createHoverLabel, setupHoverEffect } from './plot-utility.js';

// =============================================================================
// Public API Functions
// =============================================================================

export async function initPromiscuityPlot(containerSelector, options = {}, proteinLengthData, interfaceData) {
    const proteinName = options.proteinName || new URLSearchParams(window.location.search).get('p1');
    const container = document.querySelector(containerSelector);

    if (container) {
        container.innerHTML = `<p style="text-align:center; color:grey; padding-top: 20px;">Loading data...</p>`;
    }

    if (!proteinName) {
        const msg = 'Protein not specified for promiscuity plot.';
        if (container) container.innerHTML = `<p style="text-align:center; color:grey; padding-top: 20px;">${msg}</p>`;
        return;
    }

    const useFilteredData = options.filterCriteria && Object.keys(options.filterCriteria).length > 0;
    _drawPlotWithData(container, { ...options, proteinName }, proteinLengthData, interfaceData, useFilteredData);
}

export function highlightPromiscuityResidues(start, end, containerSelector = null) {
    const containers = containerSelector
        ? [document.querySelector(containerSelector)]
        : Array.from(document.querySelectorAll('.promiscuity-plot-container'));

    containers.forEach(container => {
        if (!container) return;

        if (start === null || end === null) {
            container._promiscuityHighlightRange = null;
        } else if (typeof start === "number" && typeof end === "number" && start <= end) {
            container._promiscuityHighlightRange = { start, end };
        }
        _renderBarHighlights(container);
    });
}

export function clearPromiscuityHighlight(containerSelector = null) {
    highlightPromiscuityResidues(null, null, containerSelector);
}

export function updatePromiscuityPlot(proteinName, promiscuityUseFilteredData, filter, proteinLengthData, interfaceData, containerSelector = '.promiscuity-plot-container', options = {}) {
    if (!proteinName || !window.initPromiscuityPlot) return;

    const container = document.querySelector(containerSelector);
    if (!container) {
        console.error(`Container not found: ${containerSelector}`);
        return;
    }

    let filterCriteria = {};
    if (promiscuityUseFilteredData) {
        const currentGlobalFilters = filter.getAllFilters();
        filterCriteria = convertTableFiltersToPromiscuityCriteria(currentGlobalFilters);
    }

    window.initPromiscuityPlot(
        containerSelector,
        {
            proteinName: proteinName,
            filterCriteria: filterCriteria,
            interactionRegion: options.interactionRegion
        }, 
        proteinLengthData, 
        interfaceData
    );
}

export function convertTableFiltersToPromiscuityCriteria(activeNumericFilters) {
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

export function setupPromiscuityControls(placeholder, promiscuityUseFilteredData, updatePromiscuityPlot, toggleCallback) {
    if (!placeholder) return;

    placeholder.innerHTML = '';

    const controlBar = document.createElement('div');
    controlBar.className = 'control-bar';
    controlBar.style.marginBottom = '20px';

    const buttonGroup = document.createElement('div');
    buttonGroup.className = 'control-button-group';

    const toggleButton = document.createElement('button');
    toggleButton.type = 'button';
    toggleButton.className = 'control-button';
    toggleButton.innerHTML = promiscuityUseFilteredData
        ? '<i class="fas fa-list"></i> Show All Data'
        : '<i class="fas fa-filter"></i> Show Filtered Data';
    toggleButton.title = 'Toggle between all and filtered interaction data';

    toggleButton.addEventListener('click', () => {
        promiscuityUseFilteredData = !promiscuityUseFilteredData;
        toggleButton.innerHTML = promiscuityUseFilteredData
            ? '<i class="fas fa-list"></i> Show All Data'
            : '<i class="fas fa-filter"></i> Show Filtered Data';

        if (typeof toggleCallback === 'function') {
            toggleCallback(promiscuityUseFilteredData);
        }

        updatePromiscuityPlot();
    });

    buttonGroup.appendChild(toggleButton);
    controlBar.appendChild(buttonGroup);
    placeholder.appendChild(controlBar);
}

// =============================================================================
// Core Logic
// =============================================================================

function _drawPlotWithData(container, options, proteinLengthData, interfaceData, useFilteredData) {
    const proteinName = options.proteinName;

    if (!container) return;

    container.innerHTML = '';

    const filterCriteria = useFilteredData ? options.filterCriteria : {};

    const proteinInfoRow = proteinLengthData.find(row => row.name === proteinName);
    const proteinLength = parseInt(proteinInfoRow?.length, 10);
    const { coverageArray } = _fetchRelevantInterfaces(proteinName, proteinLength, interfaceData, filterCriteria);
    const plotElements = _drawPromiscuityBasePlot(proteinName, proteinLength, container, options);

    if (plotElements) {
        _drawPromiscuityCoverageBars(plotElements, coverageArray);
    }
}

// =============================================================================
// Data Fetching & Processing
// =============================================================================
function _fetchRelevantInterfaces(proteinName, proteinLength, interfaceData, filterCriteria = {}) {
    const coverageArray = Array(proteinLength).fill(0);
    const emptyResult = { filtered: [], coverageArray };

    if (!interfaceData) {
        console.error('Promiscuity Plot: Interface data not provided.');
        return emptyResult;
    }

    let filtered = interfaceData.filter(row =>
        (row.Protein1 === proteinName || row.Protein2 === proteinName) &&
        Object.entries(filterCriteria).every(([key, filterFn]) => {
            return row[key] !== undefined && typeof filterFn === 'function' ? filterFn(row[key], row) : true;
        })
    );

    filtered.forEach(row => {
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
    return { filtered, coverageArray };
}

// =============================================================================
// Plot Drawing
// =============================================================================

function _drawPromiscuityBasePlot(proteinName, proteinLength, container, options = {}) {
    if (!container) {
        console.error('Promiscuity Plot: Container not found.');
        return null;
    }
    container.innerHTML = '';

    if (proteinLength === null || isNaN(proteinLength)) {
        const message = `Length data not available or invalid for ${proteinName}.`;
        container.innerHTML = `<p style="text-align:center; color:grey; padding-top: 20px;">${message}</p>`;
        return null;
    }

    const containerWidth = container.clientWidth;
    const margin = { top: 8, right: 60, bottom: 8, left: 60 };
    const minHeight = 180;
    const containerHeight = Math.max(container.clientHeight, minHeight);

    const svg = createSvgElement("svg", {
        "width": "100%",
        "height": containerHeight,
        "viewBox": `0 0 ${containerWidth} ${containerHeight}`
    });

    const plotWidth = containerWidth - margin.left - margin.right;
    if (plotWidth <= 0) {
        container.innerHTML = `<p style="text-align:center; color:grey; padding-top: 20px;">Not enough space to draw plot.</p>`;
        return null;
    }

    const barHeight = 10;
    const yPosition = margin.top + (containerHeight - margin.top - margin.bottom) / 2;

    const svgGroup = createSvgElement("g", { "transform": `translate(${margin.left}, 0)` });

    const proteinBar = createSvgElement("rect", {
        "x": 0,
        "y": yPosition - (barHeight / 2),
        "width": plotWidth,
        "height": barHeight,
        "fill": "#ccc"
    });
    svgGroup.appendChild(proteinBar);

    if (Array.isArray(options.interactionRegion)) {
        options.interactionRegion.forEach(region => {
            if (region && typeof region.start === "number" && typeof region.end === "number" && region.start >= 1 && region.end <= proteinLength) {
                                const x = ((region.start - 1) / proteinLength) * plotWidth;
                const width = ((region.end - region.start + 1) / proteinLength) * plotWidth;
                const highlightRect = createSvgElement("rect", {
                    "x": x,
                    "y": yPosition - (barHeight / 2),
                    "width": width,
                    "height": barHeight,
                    "fill": "#e74c3c",
                    "opacity": "0.55",
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

    svg.appendChild(svgGroup);
    container.appendChild(svg);

    return { svg, svgGroup, plotWidth, margin, yPosition, barHeight, containerHeight, container, interactionRegion: options.interactionRegion };
}

function _drawPromiscuityCoverageBars(plotElements, coverageArray) {
    const { svg, svgGroup, plotWidth, margin, yPosition, containerHeight, interactionRegion, container } = plotElements;
    if (!coverageArray || coverageArray.length === 0) return;

    const interactionRegions = Array.isArray(interactionRegion) ? interactionRegion : [];
    const isInInteractionRegion = (residueIdx) =>
        interactionRegions.some(region => residueIdx + 1 >= region.start && residueIdx + 1 <= region.end);

    const maxCount = Math.max(...coverageArray, 1);
    const barMaxHeight = (containerHeight - margin.top - margin.bottom) * 0.7;
    const residueWidth = plotWidth / coverageArray.length;
    const barYCenter = yPosition;

    [0.25, 0.5, 0.75, 1.0].forEach(t => {
        const thresholdCount = t * maxCount;
        const barHeightScaled = (thresholdCount / maxCount) * barMaxHeight;
        const y = barYCenter - (barHeightScaled / 2);

        const line = createSvgElement("line", {
            "x1": 0,
            "x2": plotWidth,
            "y1": y,
            "y2": y,
            "stroke": "#888",
            "stroke-dasharray": "4,3",
            "stroke-width": t === 1.0 ? "2" : "1",
            "opacity": t === 1.0 ? "0.6" : "0.3"
        });
        svgGroup.appendChild(line);

        const label = createSvgElement("text", {
            "x": plotWidth + 8,
            "y": y + 3,
            "font-size": "10px",
            "fill": "#888"
        });
        label.textContent = Math.round(thresholdCount);
        svgGroup.appendChild(label);
    });

    const barsGroup = createSvgElement("g", { "class": "coverage-bars" });
    svgGroup.appendChild(barsGroup);

    coverageArray.forEach((count, i) => {
        if (count > 0) {
            const barHeightScaled = (count / maxCount) * barMaxHeight;
            const rectY = barYCenter - (barHeightScaled / 2);
            const rect = createSvgElement("rect", {
                "x": i * residueWidth,
                "y": rectY,
                "width": Math.max(residueWidth, 1),
                "height": barHeightScaled,
                "fill": isInInteractionRegion(i) ? "#e74c3c" : "#e67e22",
                "opacity": "0.6",
                "style": "cursor: pointer;",
                "data-residue-idx": i + 1
            });

            const hoverLabel = createHoverLabel(`Residue ${i + 1}: ${count}`, (i + 0.5) * residueWidth, rectY - 8, { bold: true });
            setupHoverEffect(rect, [hoverLabel], svgGroup);

            barsGroup.appendChild(rect);
        }
    });

    setTimeout(() => _renderBarHighlights(container), 0);
}

// =============================================================================
// Internal Helpers
// =============================================================================

function _renderBarHighlights(container) {
    if (!container) return;

    const barsGroup = container.querySelector('svg g.coverage-bars');
    if (!barsGroup) return;

    const highlightRange = container._promiscuityHighlightRange;
    const bars = barsGroup.querySelectorAll('rect');

    bars.forEach((rect) => {
        const residueIdx = Number(rect.dataset.residueIdx);
        const isInHighlight = highlightRange &&
            residueIdx >= highlightRange.start &&
            residueIdx <= highlightRange.end;
        rect.setAttribute("opacity", isInHighlight ? "1.0" : "0.6");
    });
}

window.initPromiscuityPlot = initPromiscuityPlot;
window.highlightPromiscuityResidues = highlightPromiscuityResidues;
window.clearPromiscuityHighlight = clearPromiscuityHighlight;
