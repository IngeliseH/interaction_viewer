// =============================================================================
// Public API Functions
// =============================================================================

async function initPromiscuityPlot(containerSelector, options = {}, proteinLengthData, interfaceData) {
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

function highlightPromiscuityResidues(start, end, containerSelector = null) {
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

function clearPromiscuityHighlight(containerSelector = null) {
    highlightPromiscuityResidues(null, null, containerSelector);
}

// =============================================================================
// Core Logic
// =============================================================================

function _drawPlotWithData(container, options, proteinLengthData, interfaceData, useFilteredData) {
    const proteinName = options.proteinName;

    if (!container) return;

    container.innerHTML = '';

    const filterCriteria = useFilteredData ? options.filterCriteria : {};

    const { proteinLength, coverageArray } = _fetchPlotData(proteinName, filterCriteria, proteinLengthData, interfaceData);

    const plotElements = _drawPromiscuityBasePlot(proteinName, proteinLength, container, options);

    if (plotElements) {
        _drawPromiscuityCoverageBars(plotElements, coverageArray);
    }
}

// =============================================================================
// Data Fetching & Processing
// =============================================================================

function _fetchPlotData(proteinName, filterCriteria, proteinLengthData, interfaceData) {
    const proteinLength = _fetchProteinLength(proteinName, proteinLengthData);
    if (proteinLength === null) {
        return { proteinLength: null, coverageArray: [] };
    }
    const { coverageArray } = _fetchRelevantInterfaces(proteinName, proteinLength, interfaceData, filterCriteria);
    return { proteinLength, coverageArray };
}

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

function _fetchProteinLength(proteinName, proteinLengthData) {
    if (!proteinLengthData) {
        console.error('Promiscuity Plot: Protein length data not provided.');
        return null;
    }
    const proteinInfoRow = proteinLengthData.find(row => row.name === proteinName);
    const length = parseInt(proteinInfoRow?.length, 10);
    if (!isNaN(length)) {
        return length;
    } else {
        console.warn(`Promiscuity Plot: Length for ${proteinName} not found or invalid in CSV.`);
        return null;
    }
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

    const svg = _createSvgElement("svg", {
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

    const svgGroup = _createSvgElement("g", { "transform": `translate(${margin.left}, 0)` });

    const proteinBar = _createSvgElement("rect", {
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
                const highlightRect = _createSvgElement("rect", {
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

    const startLabel = _createSvgElement("text", {
        "x": -15,
        "y": yPosition,
        "dy": "0.35em",
        "text-anchor": "end",
        "font-size": "12px",
        "fill": "#333"
    });
    startLabel.textContent = "1";
    svgGroup.appendChild(startLabel);

    const endLabel = _createSvgElement("text", {
        "x": plotWidth + 15,
        "y": yPosition,
        "dy": "0.35em",
        "text-anchor": "start",
        "font-size": "12px",
        "fill": "#333"
    });
    endLabel.textContent = proteinLength;
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

        const line = _createSvgElement("line", {
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

        const label = _createSvgElement("text", {
            "x": plotWidth + 8,
            "y": y + 3,
            "font-size": "10px",
            "fill": "#888"
        });
        label.textContent = Math.round(thresholdCount);
        svgGroup.appendChild(label);
    });

    const barsGroup = _createSvgElement("g", { "class": "coverage-bars" });

    const hoverLabel = _createSvgElement("text", {
        "class": "hover-label",
        "font-size": "13px",
        "fill": "#222",
        "text-anchor": "middle",
        "style": "pointer-events: none; font-weight: bold;",
        "visibility": "hidden"
    });

    coverageArray.forEach((count, i) => {
        if (count > 0) {
            const barHeightScaled = (count / maxCount) * barMaxHeight;
            const rectY = barYCenter - (barHeightScaled / 2);
            const rect = _createSvgElement("rect", {
                "x": i * residueWidth,
                "y": rectY,
                "width": Math.max(residueWidth, 1),
                "height": barHeightScaled,
                "fill": isInInteractionRegion(i) ? "#e74c3c" : "#e67e22",
                "opacity": "0.6",
                "style": "cursor: pointer;",
                "data-residue-idx": i + 1
            });

            rect.addEventListener("mouseenter", () => {
                rect.setAttribute("opacity", "1.0");
                hoverLabel.textContent = `Residue ${i + 1}: ${count}`;
                hoverLabel.setAttribute("x", (i + 0.5) * residueWidth);
                hoverLabel.setAttribute("y", rectY - 8);
                hoverLabel.setAttribute("visibility", "visible");
            });
            rect.addEventListener("mouseleave", () => {
                _renderBarHighlights(container);
                hoverLabel.setAttribute("visibility", "hidden");
            });
            barsGroup.appendChild(rect);
        }
    });

    svgGroup.appendChild(barsGroup);
    svgGroup.appendChild(hoverLabel);
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

function _createSvgElement(tag, attributes = {}) {
    const svgNS = "http://www.w3.org/2000/svg";
    const element = document.createElementNS(svgNS, tag);
    for (const [key, value] of Object.entries(attributes)) {
        element.setAttribute(key, value);
    }
    return element;
}
