const promiscuityPlotConfig = {
    OPACITY_HIGHLIGHT: "1.0",
    OPACITY_DEFAULT: "0.6",
    OPACITY_LOW: "0.3",
    COLOR_INTERACTION_REGION: "#e74c3c",
    COLOR_DEFAULT_BAR: "#e67e22",
    COLOR_PROTEIN_BAR: "#ccc",
    COLOR_AXIS_LABEL: "#333",
    COLOR_THRESHOLD_LINE: "#888",
    COLOR_HOVER_LABEL: "#222",
};

function resolveElement(selectorOrElement, defaultSelector) {
    if (selectorOrElement) {
        return typeof selectorOrElement === 'string' ?
            document.querySelector(selectorOrElement) :
            selectorOrElement;
    }
    return defaultSelector ? document.querySelector(defaultSelector) : null;
}

function updatePromiscuityBarHighlight(containerOrSelector) {
    const container = resolveElement(containerOrSelector, '.promiscuityPlotContainer');
    if (!container) return;

    const svg = container.querySelector('svg');
    if (!svg) return;

    const barsGroup = svg.querySelector('g.coverage-bars');
    if (!barsGroup) return;

    const highlightRange = container._promiscuityHighlightRange;
    const bars = barsGroup.querySelectorAll('rect');

    bars.forEach((rect) => {
        const residueIdx = Number(rect.dataset.residueIdx);
        const isInHighlight = highlightRange &&
            residueIdx >= highlightRange.start &&
            residueIdx <= highlightRange.end;
        rect.setAttribute("opacity", isInHighlight ? promiscuityPlotConfig.OPACITY_HIGHLIGHT : promiscuityPlotConfig.OPACITY_DEFAULT);
    });
}

function fetchProteinLength(proteinName, proteinLengthData) {
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

function drawPromiscuityBasePlot(proteinName, proteinLength, options = {}) {
    const container = resolveElement(options.containerSelector, '.promiscuityPlotContainer');

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

    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");

    const containerWidth = container.clientWidth;
    const margin = { top: 8, right: 60, bottom: 8, left: 60 };
    const minHeight = 180;
    const containerHeight = Math.max(container.clientHeight, minHeight);

    svg.setAttribute("width", "100%");
    svg.setAttribute("height", containerHeight);
    svg.setAttribute("viewBox", `0 0 ${containerWidth} ${containerHeight}`);

    const plotWidth = containerWidth - margin.left - margin.right;
    if (plotWidth <= 0) {
        container.innerHTML = `<p style="text-align:center; color:grey; padding-top: 20px;">Not enough space to draw plot.</p>`;
        return null;
    }

    const barHeight = 10;
    const yPosition = margin.top + (containerHeight - margin.top - margin.bottom) / 2;

    const g = document.createElementNS(svgNS, "g");
    g.setAttribute("transform", `translate(${margin.left}, 0)`);

    const proteinBar = document.createElementNS(svgNS, "rect");
    proteinBar.setAttribute("x", 0);
    proteinBar.setAttribute("y", yPosition - (barHeight / 2));
    proteinBar.setAttribute("width", plotWidth);
    proteinBar.setAttribute("height", barHeight);
    proteinBar.setAttribute("fill", promiscuityPlotConfig.COLOR_PROTEIN_BAR);
    g.appendChild(proteinBar);

    if (Array.isArray(options.interactionRegion)) {
        options.interactionRegion.forEach(region => {
            if (region && typeof region.start === "number" && typeof region.end === "number" && region.start >= 1 && region.end <= proteinLength) {
                const x = ((region.start - 1) / proteinLength) * plotWidth;
                const width = ((region.end - region.start + 1) / proteinLength) * plotWidth;
                const highlightRect = document.createElementNS(svgNS, "rect");
                highlightRect.setAttribute("x", x);
                highlightRect.setAttribute("y", yPosition - (barHeight / 2));
                highlightRect.setAttribute("width", width);
                highlightRect.setAttribute("height", barHeight);
                highlightRect.setAttribute("fill", promiscuityPlotConfig.COLOR_INTERACTION_REGION);
                highlightRect.setAttribute("opacity", "0.55");
                highlightRect.setAttribute("pointer-events", "none");
                g.appendChild(highlightRect);
            }
        });
    }

    const startLabel = document.createElementNS(svgNS, "text");
    startLabel.setAttribute("x", -15);
    startLabel.setAttribute("y", yPosition);
    startLabel.setAttribute("dy", "0.35em");
    startLabel.setAttribute("text-anchor", "end");
    startLabel.setAttribute("font-size", "12px");
    startLabel.setAttribute("fill", promiscuityPlotConfig.COLOR_AXIS_LABEL);
    startLabel.textContent = "1";
    g.appendChild(startLabel);

    const endLabel = document.createElementNS(svgNS, "text");
    endLabel.setAttribute("x", plotWidth + 15);
    endLabel.setAttribute("y", yPosition);
    endLabel.setAttribute("dy", "0.35em");
    endLabel.setAttribute("text-anchor", "start");
    endLabel.setAttribute("font-size", "12px");
    endLabel.setAttribute("fill", promiscuityPlotConfig.COLOR_AXIS_LABEL);
    endLabel.textContent = proteinLength;
    g.appendChild(endLabel);

    svg.appendChild(g);
    container.appendChild(svg);

    return { svg, g, plotWidth, margin, yPosition, barHeight, containerHeight, container, interactionRegion: options.interactionRegion };
}

function drawPromiscuityCoverageBars(plotElements, coverageArray) {
    const { svg, g, plotWidth, margin, yPosition, containerHeight, interactionRegion } = plotElements;
    if (!coverageArray || coverageArray.length === 0) return;

    const interactionRegions = Array.isArray(interactionRegion) ? interactionRegion : [];
    const isInInteractionRegion = (residueIdx) =>
        interactionRegions.some(region => residueIdx + 1 >= region.start && residueIdx + 1 <= region.end);

    const maxCount = Math.max(...coverageArray, 1);
    const barMaxHeight = (containerHeight - margin.top - margin.bottom) * 0.7;
    const residueWidth = plotWidth / coverageArray.length;
    const barYCenter = yPosition;
    const svgNS = "http://www.w3.org/2000/svg";

    [0.25, 0.5, 0.75, 1.0].forEach(t => {
        const thresholdCount = t * maxCount;
        const barHeightScaled = (thresholdCount / maxCount) * barMaxHeight;
        const y = barYCenter - (barHeightScaled / 2);

        const line = document.createElementNS(svgNS, "line");
        line.setAttribute("x1", 0);
        line.setAttribute("x2", plotWidth);
        line.setAttribute("y1", y);
        line.setAttribute("y2", y);
        line.setAttribute("stroke", promiscuityPlotConfig.COLOR_THRESHOLD_LINE);
        line.setAttribute("stroke-dasharray", "4,3");
        line.setAttribute("stroke-width", t === 1.0 ? "2" : "1");
        line.setAttribute("opacity", t === 1.0 ? promiscuityPlotConfig.OPACITY_DEFAULT : promiscuityPlotConfig.OPACITY_LOW);
        g.appendChild(line);

        const label = document.createElementNS(svgNS, "text");
        label.setAttribute("x", plotWidth + 8);
        label.setAttribute("y", y + 3);
        label.setAttribute("font-size", "10px");
        label.setAttribute("fill", promiscuityPlotConfig.COLOR_THRESHOLD_LINE);
        label.textContent = Math.round(thresholdCount);
        g.appendChild(label);
    });

    const barsGroup = document.createElementNS(svgNS, "g");
    barsGroup.setAttribute("class", "coverage-bars");

    const hoverLabel = document.createElementNS(svgNS, "text");
    hoverLabel.setAttribute("class", "hover-label");
    hoverLabel.setAttribute("font-size", "13px");
    hoverLabel.setAttribute("fill", promiscuityPlotConfig.COLOR_HOVER_LABEL);
    hoverLabel.setAttribute("text-anchor", "middle");
    hoverLabel.setAttribute("style", "pointer-events: none; font-weight: bold;");
    hoverLabel.setAttribute("visibility", "hidden");

    coverageArray.forEach((count, i) => {
        if (count > 0) {
            const barHeightScaled = (count / maxCount) * barMaxHeight;
            const rectY = barYCenter - (barHeightScaled / 2);
            const rect = document.createElementNS(svgNS, "rect");
            rect.setAttribute("x", i * residueWidth);
            rect.setAttribute("y", rectY);
            rect.setAttribute("width", Math.max(residueWidth, 1));
            rect.setAttribute("height", barHeightScaled);
            rect.setAttribute("fill", isInInteractionRegion(i) ? promiscuityPlotConfig.COLOR_INTERACTION_REGION : promiscuityPlotConfig.COLOR_DEFAULT_BAR);
            rect.setAttribute("opacity", promiscuityPlotConfig.OPACITY_DEFAULT);
            rect.style.cursor = "pointer";
            rect.dataset.residueIdx = i + 1;

            rect.addEventListener("mouseenter", () => {
                rect.setAttribute("opacity", promiscuityPlotConfig.OPACITY_HIGHLIGHT);
                hoverLabel.textContent = `Residue ${i + 1}: ${count}`;
                hoverLabel.setAttribute("x", (i + 0.5) * residueWidth);
                hoverLabel.setAttribute("y", rectY - 8);
                hoverLabel.setAttribute("visibility", "visible");
            });
            rect.addEventListener("mouseleave", () => {
                rect.setAttribute("opacity", promiscuityPlotConfig.OPACITY_DEFAULT);
                hoverLabel.setAttribute("visibility", "hidden");
                updatePromiscuityBarHighlight(svg.closest('.promiscuityPlotContainer, [class*="promiscuityPlotContainer"]'));
            });
            barsGroup.appendChild(rect);
        }
    });

    g.appendChild(barsGroup);
    g.appendChild(hoverLabel);
    setTimeout(() => updatePromiscuityBarHighlight(svg.closest('.promiscuityPlotContainer, [class*="promiscuityPlotContainer"]')), 0);
}

function fetchRelevantInterfaces(proteinName, proteinLength, interfaceData, filterCriteria = {}) {
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
                const fixedJson = row.absolute_location.replace(/'/g, '"').replace(/None/g, 'null');
                const absLoc = JSON.parse(fixedJson);
                if (Array.isArray(absLoc?.[key])) {
                    absLoc[key].forEach(idx => {
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

function fetchPlotData(proteinName, filterCriteria, proteinLengthData, interfaceData) {
    const proteinLength = fetchProteinLength(proteinName, proteinLengthData);
    if (proteinLength === null) {
        return { proteinLength: null, coverageArray: [] };
    }
    const { coverageArray } = fetchRelevantInterfaces(proteinName, proteinLength, interfaceData, filterCriteria);
    return { proteinLength, coverageArray };
}

function drawPlotWithData(options, proteinLengthData, interfaceData, useFilteredData) {
    const proteinName = options.proteinName;
    const container = resolveElement(options.containerSelector);

    if (!container) return;

    // Clear the container before drawing a new plot
    container.innerHTML = '';

    // Determine which filter criteria to use
    const filterCriteria = useFilteredData ? options.filterCriteria : {};

    const { proteinLength, coverageArray } = fetchPlotData(proteinName, filterCriteria, proteinLengthData, interfaceData);

    const plotElements = drawPromiscuityBasePlot(proteinName, proteinLength, options);

    if (plotElements) {
        drawPromiscuityCoverageBars(plotElements, coverageArray);
    }
}

function createControls(container, options, proteinLengthData, interfaceData) {
    const plotContainer = container.querySelector(options.containerSelector);
    if (!plotContainer) return;

    let controlBar = container.querySelector('.promiscuity-plot-controls');
    if (controlBar) controlBar.remove();

    controlBar = document.createElement('div');
    controlBar.className = 'control-bar promiscuity-plot-controls';

    const buttonGroup = document.createElement('div');
    buttonGroup.className = 'control-button-group';

    const toggleButton = document.createElement('button');
    toggleButton.type = 'button';
    toggleButton.className = 'control-button promiscuity-toggle-filter';
    toggleButton.dataset.state = 'filtered'; // Initial state is filtered
    toggleButton.innerHTML = '<i class="fas fa-filter"></i> Show All Data';
    toggleButton.title = 'Toggle between filtered and all interaction data';

    toggleButton.addEventListener('click', () => {
        const currentState = toggleButton.dataset.state;
        const newState = currentState === 'filtered' ? 'all' : 'filtered';
        toggleButton.dataset.state = newState;

        if (newState === 'all') {
            toggleButton.innerHTML = '<i class="fas fa-list"></i> Show Filtered Data';
            drawPlotWithData(options, proteinLengthData, interfaceData, false); // useFilteredData = false
        } else {
            toggleButton.innerHTML = '<i class="fas fa-filter"></i> Show All Data';
            drawPlotWithData(options, proteinLengthData, interfaceData, true); // useFilteredData = true
        }
    });

    buttonGroup.appendChild(toggleButton);
    controlBar.appendChild(buttonGroup);
    container.prepend(controlBar);
}

async function initPromiscuityPlot(options = {}, proteinLengthData, interfaceData) {
    const proteinName = options.proteinName || new URLSearchParams(window.location.search).get('p1');
    const container = resolveElement(options.containerSelector, '.promiscuityPlotContainer');

    if (container) {
        container.innerHTML = `<p style="text-align:center; color:grey; padding-top: 20px;">Loading data...</p>`;
    }

    if (!proteinName) {
        const msg = 'Protein not specified for promiscuity plot.';
        if (container) container.innerHTML = `<p style="text-align:center; color:grey; padding-top: 20px;">${msg}</p>`;
        return;
    }

    if (options.showFilterToggle) {
        // Create controls in the parent of the plot container
        createControls(container.parentElement, options, proteinLengthData, interfaceData);
        // Initial draw is with filtered data
        drawPlotWithData(options, proteinLengthData, interfaceData, true);
    } else {
        // Original behavior: draw without controls, using provided filters (or none if not provided)
        const useFilteredData = options.filterCriteria && Object.keys(options.filterCriteria).length > 0;
        drawPlotWithData(options, proteinLengthData, interfaceData, useFilteredData);
    }
}

function highlightPromiscuityResidues(start, end, containerOrSelector = null) {
    const container = resolveElement(containerOrSelector, '.promiscuityPlotContainer');
    if (!container) return;
    if (typeof start === "number" && typeof end === "number" && start <= end) {
        container._promiscuityHighlightRange = { start, end };
        updatePromiscuityBarHighlight(container);
    }
}

function clearPromiscuityHighlight(containerOrSelector = null) {
    const container = resolveElement(containerOrSelector, '.promiscuityPlotContainer');
    if (!container) return;
    container._promiscuityHighlightRange = null;
    updatePromiscuityBarHighlight(container);
}

window.highlightPromiscuityResidues = highlightPromiscuityResidues;
window.clearPromiscuityHighlight = clearPromiscuityHighlight;
window.initPromiscuityPlot = initPromiscuityPlot;
