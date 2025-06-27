// Global or appropriately scoped variables to store fetched data

// Update bar opacities for highlight (no redraw)
// Accepts a container element or selector to scope the highlight
function updatePromiscuityBarHighlight(containerOrSelector) {
    let container = containerOrSelector;
    if (typeof containerOrSelector === "string") {
        container = document.querySelector(containerOrSelector);
    }
    if (!container) {
        // fallback to first plot container
        container = document.querySelector('.promiscuityPlotContainer');
    }
    if (!container) return;
    const svg = container.querySelector('svg');
    if (!svg) return;
    const barsGroup = svg.querySelector('g.coverage-bars');
    if (!barsGroup) return;
    const bars = barsGroup.querySelectorAll('rect');
    // Get highlight range for this container
    const highlightRange = container._promiscuityHighlightRange;
    bars.forEach((rect) => {
        const residueIdx = Number(rect.dataset.residueIdx);
        if (
            highlightRange &&
            residueIdx >= highlightRange.start &&
            residueIdx <= highlightRange.end
        ) {
            rect.setAttribute("opacity", "1.0");
        } else {
            rect.setAttribute("opacity", "0.6");
        }
    });
}

async function fetchProteinLengthForPlot(proteinName) {
    try {
        // Fetch is relative to the HTML document (protein.html)
        const response = await fetch('all_fragments_2025.06.04.csv');
        if (!response.ok) {
            console.error('Promiscuity Plot: Failed to load CSV for protein length:', response.statusText);
            return null;
        }
        const csvText = await response.text();
        return new Promise((resolve, reject) => {
            Papa.parse(csvText, {
                header: true,
                skipEmptyLines: true,
                complete: function(results) {
                    const data = results.data;
                    const proteinInfoRow = data.find(row => row.name === proteinName);
                    if (proteinInfoRow && proteinInfoRow.length && !isNaN(parseInt(proteinInfoRow.length, 10))) {
                        resolve(parseInt(proteinInfoRow.length, 10));
                    } else {
                        console.warn(`Promiscuity Plot: Length for ${proteinName} not found or invalid in CSV.`);
                        resolve(null);
                    }
                },
                error: function(error) {
                    console.error('Promiscuity Plot: Error parsing CSV for protein length:', error);
                    resolve(null); // Resolve with null on parsing error to handle gracefully
                }
            });
        });
    } catch (error) {
        console.error('Promiscuity Plot: Error fetching CSV for protein length:', error);
        return null;
    }
}

function drawPromiscuityBasePlot(proteinName, proteinLength, opts = {}) {
    // Support custom container selector for multi-plot pages
    let container = null;
    let captionElement = null;
    // Try to get the selector from the call stack (initPromiscuityPlot)
    if (typeof arguments[2] === 'object' && arguments[2] !== null) {
        // Not used in current code, but left for future-proofing
        const options = arguments[2];
        if (options.containerSelector) container = document.querySelector(options.containerSelector);
        if (options.captionSelector) captionElement = document.querySelector(options.captionSelector);
    }
    // Fallback to global variable if not provided
    if (!container) container = window._promiscuityPlotContainer || document.querySelector('.promiscuityPlotContainer');
    if (!captionElement) captionElement = window._promiscuityPlotCaption || document.querySelector('.promiscuity-plot-caption');

    // If still not found, fallback to default selector
    if (!container) container = document.querySelector('.promiscuityPlotContainer');
    if (!captionElement) captionElement = document.querySelector('.promiscuity-plot-caption');

    if (!container) {
        // Try to find any container with class containing "promiscuityPlotContainer"
        container = document.querySelector('[class*="promiscuityPlotContainer"]');
    }
    if (!captionElement) {
        captionElement = document.querySelector('[class*="promiscuity-plot-caption"]');
    }

    if (!container) {
        console.error('Promiscuity Plot: Container .promiscuityPlotContainer not found.');
        if (captionElement) captionElement.textContent = 'Plot container element not found.';
        return;
    }
    container.innerHTML = ''; // Clear previous content (e.g., loading message or old plot)

    if (proteinLength === null || isNaN(proteinLength)) {
        const message = `Length data not available or invalid for ${proteinName}.`;
        if (captionElement) captionElement.textContent = message;
        container.innerHTML = `<p style="text-align:center; color:grey; padding-top: 20px;">${message}</p>`;
        return;
    }
    
    if (captionElement) captionElement.textContent = `Protein: ${proteinName} (Length: ${proteinLength} amino acids)`;

    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");

    // Reduce whitespace at top and bottom of the plot
    const containerWidth = container.clientWidth;
    const margin = { top: 8, right: 60, bottom: 8, left: 60 }; // Reduced top/bottom margins
    const minHeight = 180; // Slightly smaller min height
    const containerHeight = container.clientHeight > minHeight ? container.clientHeight : minHeight;

    svg.setAttribute("width", "100%");
    svg.setAttribute("height", containerHeight);
    svg.setAttribute("viewBox", `0 0 ${containerWidth} ${containerHeight}`);

    const plotWidth = containerWidth - margin.left - margin.right;
    if (plotWidth <= 0) {
        container.innerHTML = `<p style="text-align:center; color:grey; padding-top: 20px;">Not enough space to draw plot.</p>`;
        if (captionElement) captionElement.textContent = 'Plotting area too small.';
        return;
    }

    const barHeight = 10;
    // Center the protein bar and coverage bars in the available vertical space (with reduced margin)
    const yPosition = margin.top + (containerHeight - margin.top - margin.bottom) / 2;

    const g = document.createElementNS(svgNS, "g");
    g.setAttribute("transform", `translate(${margin.left}, ${0})`);

    // Draw the protein bar (background)
    const proteinBar = document.createElementNS(svgNS, "rect");
    proteinBar.setAttribute("x", 0);
    proteinBar.setAttribute("y", yPosition - (barHeight / 2));
    proteinBar.setAttribute("width", plotWidth);
    proteinBar.setAttribute("height", barHeight);
    proteinBar.setAttribute("fill", "#cccccc");
    g.appendChild(proteinBar);

    // --- HIGHLIGHT INTERACTION REGION IN RED IF PROVIDED ---
    if (opts.interactionRegion && Array.isArray(opts.interactionRegion)) {
        opts.interactionRegion.forEach(region => {
            // region: {start: int, end: int}
            if (
                typeof region.start === "number" &&
                typeof region.end === "number" &&
                region.start >= 1 &&
                region.end >= region.start &&
                region.end <= proteinLength
            ) {
                const x = ((region.start - 1) / proteinLength) * plotWidth;
                const width = ((region.end - region.start + 1) / proteinLength) * plotWidth;
                const highlightRect = document.createElementNS(svgNS, "rect");
                highlightRect.setAttribute("x", x);
                highlightRect.setAttribute("y", yPosition - (barHeight / 2));
                highlightRect.setAttribute("width", width);
                highlightRect.setAttribute("height", barHeight);
                highlightRect.setAttribute("fill", "#e74c3c");
                highlightRect.setAttribute("opacity", "0.55");
                highlightRect.setAttribute("pointer-events", "none");
                g.appendChild(highlightRect);
            }
        });
    }

    const startLabel = document.createElementNS(svgNS, "text");
    startLabel.setAttribute("x", -15); // Position left of the bar
    startLabel.setAttribute("y", yPosition);
    startLabel.setAttribute("dy", "0.35em"); // Vertically center text
    startLabel.setAttribute("text-anchor", "end"); // Align text to its end
    startLabel.setAttribute("font-size", "12px");
    startLabel.setAttribute("fill", "#333333");
    startLabel.textContent = "1";
    g.appendChild(startLabel);

    const endLabel = document.createElementNS(svgNS, "text");
    endLabel.setAttribute("x", plotWidth + 15); // Position right of the bar
    endLabel.setAttribute("y", yPosition);
    endLabel.setAttribute("dy", "0.35em");
    endLabel.setAttribute("text-anchor", "start"); // Align text to its start
    endLabel.setAttribute("font-size", "12px");
    endLabel.setAttribute("fill", "#333333");
    endLabel.textContent = proteinLength;
    g.appendChild(endLabel);
    
    svg.appendChild(g);
    container.appendChild(svg);
    // Return svg and g for further drawing
    return { svg, g, plotWidth, margin, yPosition, barHeight, containerHeight, container, interactionRegion: opts.interactionRegion };
}

// Overlay bar chart showing coverage at each residue
function drawPromiscuityCoverageBars(svg, g, coverageArray, plotWidth, margin, yPosition, barHeight, containerHeight, interactionRegion = null) {
    if (!coverageArray || coverageArray.length === 0) {
        console.log("Coverage array empty or missing");
        return;
    }

    // --- NEW: Prepare interaction region check ---
    let interactionRegions = [];
    if (Array.isArray(interactionRegion)) {
        interactionRegions = interactionRegion;
    }

    function isInInteractionRegion(residueIdx) {
        return interactionRegions.some(region =>
            typeof region.start === "number" &&
            typeof region.end === "number" &&
            residueIdx + 1 >= region.start &&
            residueIdx + 1 <= region.end
        );
    }

    // Find the max count for scaling
    const maxCount = Math.max(...coverageArray, 1);
    console.log("Max count for scaling:", maxCount);

    // Bar chart parameters
    const barMaxHeight = (containerHeight - margin.top - margin.bottom) * 0.7; // 70% of available vertical space
    const residueWidth = plotWidth / coverageArray.length;

    // Center bars vertically on the protein bar (and in the available space)
    const barYCenter = yPosition; // Center of the protein bar

    // Draw horizontal threshold lines (e.g., at 25%, 50%, 75% of maxCount)
    const svgNS = "http://www.w3.org/2000/svg";
    const thresholds = [0.25, 0.5, 0.75, 1.0];
    thresholds.forEach(t => {
        const thresholdCount = t * maxCount;
        const barHeightScaled = (thresholdCount / maxCount) * barMaxHeight;
        const y = barYCenter - (barHeightScaled / 2);
        const line = document.createElementNS(svgNS, "line");
        line.setAttribute("x1", 0);
        line.setAttribute("x2", plotWidth);
        line.setAttribute("y1", y);
        line.setAttribute("y2", y);
        line.setAttribute("stroke", "#888");
        line.setAttribute("stroke-dasharray", "4,3");
        line.setAttribute("stroke-width", t === 1.0 ? "2" : "1");
        line.setAttribute("opacity", t === 1.0 ? "0.6" : "0.3");
        g.appendChild(line);

        // Add label for the threshold
        const label = document.createElementNS(svgNS, "text");
        label.setAttribute("x", plotWidth + 8);
        label.setAttribute("y", y + 3);
        label.setAttribute("font-size", "10px");
        label.setAttribute("fill", "#888");
        label.textContent = Math.round(thresholdCount);
        g.appendChild(label);
    });

    // Create a group for bars
    const barsGroup = document.createElementNS(svgNS, "g");
    barsGroup.setAttribute("class", "coverage-bars");

    // Tooltip label element (one for all bars)
    let hoverLabel = document.createElementNS(svgNS, "text");
    hoverLabel.setAttribute("class", "hover-label");
    hoverLabel.setAttribute("font-size", "13px");
    hoverLabel.setAttribute("fill", "#222");
    hoverLabel.setAttribute("text-anchor", "middle");
    hoverLabel.setAttribute("style", "pointer-events: none; font-weight: bold;");
    hoverLabel.setAttribute("visibility", "hidden");
    g.appendChild(hoverLabel);

    let anyBars = false;
    coverageArray.forEach((count, i) => {
        if (count > 0) {
            anyBars = true;
            const barHeightScaled = (count / maxCount) * barMaxHeight;
            const rectY = barYCenter - (barHeightScaled / 2);
            const rect = document.createElementNS(svgNS, "rect");
            rect.setAttribute("x", i * residueWidth);
            rect.setAttribute("y", rectY);
            rect.setAttribute("width", Math.max(residueWidth, 1));
            rect.setAttribute("height", barHeightScaled);
            // --- CHANGE: Use different color if in interaction region ---
            rect.setAttribute("fill", isInInteractionRegion(i) ? "#e74c3c" : "#e67e22");
            rect.setAttribute("opacity", "0.6");
            rect.style.cursor = "pointer";
            // Store the actual residue index (1-based) for highlight mapping
            rect.dataset.residueIdx = i + 1;

            // Mouse events for hover effect and label
            rect.addEventListener("mouseenter", function () {
                rect.setAttribute("opacity", "1.0");
                hoverLabel.textContent = `Residue ${i + 1}: ${count}`;
                const labelX = (i + 0.5) * residueWidth;
                const labelY = rectY - 8;
                hoverLabel.setAttribute("x", labelX);
                hoverLabel.setAttribute("y", labelY);
                hoverLabel.setAttribute("visibility", "visible");
            });
            rect.addEventListener("mouseleave", function () {
                // Remove reference to old global promiscuityHighlightRange
                // Always set opacity to 0.6 on mouseleave, highlight will be restored by updatePromiscuityBarHighlight if needed
                rect.setAttribute("opacity", "0.6");
                hoverLabel.setAttribute("visibility", "hidden");
            });
            barsGroup.appendChild(rect);
        }
    });

    if (!anyBars) {
        console.log("No bars drawn (all counts zero)");
    }

    g.appendChild(barsGroup);

    // After drawing, apply highlight if needed
    setTimeout(updatePromiscuityBarHighlight, 0);
}

// Read and filter all_interface_analysis_2025.06.05_shifted.csv for relevant rows
// Accepts optional filterCriteria object for additional filtering
async function fetchRelevantInterfaces(proteinName, proteinLength, filterCriteria = null) {
    // Initialise empty data structure (array) with length equal to proteinLength
    const coverageArray = Array(proteinLength).fill(0);

    try {
        const response = await fetch('all_interface_analysis_2025.06.05_shifted.csv');
        if (!response.ok) {
            console.error('Promiscuity Plot: Failed to load interface CSV:', response.statusText);
            return { filtered: [], indices: [], coverageArray };
        }
        const csvText = await response.text();
        return new Promise((resolve, reject) => {
            Papa.parse(csvText, {
                header: true,
                skipEmptyLines: true,
                complete: function(results) {
                    let data = results.data;
                    // Filter rows where Protein1 or Protein2 matches proteinName
                    let filtered = data.filter(row => row.Protein1 === proteinName || row.Protein2 === proteinName);

                    // Apply additional filter criteria if provided
                    if (filterCriteria && typeof filterCriteria === 'object') {
                        filtered = filtered.filter(row => {
                            // All criteria must match
                            return Object.entries(filterCriteria).every(([key, filterFn]) => {
                                // Ensure the column exists in the row and filterFn is a function
                                if (row[key] === undefined || typeof filterFn !== 'function') {
                                    // If filter expects a column not present, or filterFn is invalid,
                                    // decide if it should pass or fail. Passing (true) means non-applicable filters don't exclude rows.
                                    return true; 
                                }
                                return filterFn(row[key], row); // Pass value and full row
                            });
                        });
                    }

                    // Extract indices from absolute_location for each relevant row
                    const indices = [];
                    filtered.forEach(row => {
                        let key = null;
                        if (row.Protein1 === proteinName) key = 'Protein1';
                        else if (row.Protein2 === proteinName) key = 'Protein2';
                        if (key && row.absolute_location) {
                            try {
                                // Try JSON.parse, but if it fails, try eval as a fallback for single-quoted objects
                                let absLoc;
                                try {
                                    absLoc = JSON.parse(row.absolute_location);
                                } catch (jsonErr) {
                                    // Replace single quotes with double quotes for JSON compatibility
                                    let fixed = row.absolute_location
                                        .replace(/'/g, '"')
                                        .replace(/None/g, 'null');
                                    absLoc = JSON.parse(fixed);
                                }
                                if (absLoc[key] && Array.isArray(absLoc[key])) {
                                    absLoc[key].forEach(idx => {
                                        // Data is 1-indexed; convert to 0-indexed for JS arrays
                                        if (typeof idx === 'number' && idx >= 1 && idx <= proteinLength) {
                                            coverageArray[idx - 1] += 1;
                                            indices.push(idx);
                                        }
                                    });
                                }
                            } catch (e) {
                                // If parsing fails, skip this row
                                console.warn('Promiscuity Plot: Failed to parse absolute_location:', row.absolute_location);
                            }
                        }
                    });

                    resolve({ filtered, indices, coverageArray });
                },
                error: function(error) {
                    console.error('Promiscuity Plot: Error parsing interface CSV:', error);
                    resolve({ filtered: [], indices: [], coverageArray }); // Return empty on error
                }
            });
        });
    } catch (error) {
        console.error('Promiscuity Plot: Error fetching interface CSV:', error);
        return { filtered: [], indices: [], coverageArray };
    }
}

async function initPromiscuityPlot(optionsOrFilterCriteria = null) {
    // Support both old (filterCriteria) and new (options) signatures
    let options = {};
    let filterCriteria = {};
    if (optionsOrFilterCriteria && typeof optionsOrFilterCriteria === 'object' && (
        optionsOrFilterCriteria.containerSelector ||
        optionsOrFilterCriteria.captionSelector ||
        optionsOrFilterCriteria.proteinName
    )) {
        options = optionsOrFilterCriteria;
        filterCriteria = options.filterCriteria || {};
    } else if (optionsOrFilterCriteria && typeof optionsOrFilterCriteria === 'object') {
        filterCriteria = optionsOrFilterCriteria;
    }

    // --- FIX: Always pass interactionRegion if present in options ---
    const interactionRegion = options.interactionRegion || null;

    // Allow override of container/caption/proteinName for multi-protein support
    const containerSelector = options.containerSelector || '.promiscuityPlotContainer';
    const captionSelector = options.captionSelector || '.promiscuity-plot-caption';
    const proteinName = options.proteinName ||
        (function() {
            const urlParams = new URLSearchParams(window.location.search);
            return decodeURIComponent(urlParams.get('p1') || '');
        })();

    // Store last used filter criteria for highlight redraws or resize
    window._lastPromiscuityFilterCriteria = filterCriteria;

    // --- FIX: Always use local container/caption, do not share global state ---
    const container = document.querySelector(containerSelector);
    const captionElement = document.querySelector(captionSelector);

    // --- FIX: Clear only this container/caption, not all ---
    if (container) container.innerHTML = '';
    if (captionElement) captionElement.textContent = '';

    if (!proteinName) {
        if (container) container.innerHTML = `<p style="text-align:center; color:grey; padding-top: 20px;">Protein not specified.</p>`;
        if (captionElement) captionElement.textContent = 'Protein not specified for promiscuity plot.';
        return;
    }

    if (captionElement) captionElement.textContent = `Loading length data for ${proteinName}...`;
    if (container) container.innerHTML = `<p style="text-align:center; color:grey; padding-top: 20px;">Loading data...</p>`;

    const proteinLength = await fetchProteinLengthForPlot(proteinName);

    // Draw base plot and get svg/g for further drawing
    // --- FIX: Pass container/caption as third argument to ensure correct context ---
    const basePlot = drawPromiscuityBasePlot(
        proteinName,
        proteinLength,
        { containerSelector, captionSelector, ...options, interactionRegion } // ensure interactionRegion is always present
    );

    // After drawing base plot, fetch and filter interface data
    if (proteinName && proteinLength && basePlot) {
        const { filtered: relevantInterfaces, indices: relevantIndices, coverageArray } =
            await fetchRelevantInterfaces(proteinName, proteinLength, filterCriteria);
        // Overlay bar chart
        drawPromiscuityCoverageBars(
            basePlot.svg,
            basePlot.g,
            coverageArray,
            basePlot.plotWidth,
            basePlot.margin,
            basePlot.yPosition,
            basePlot.barHeight,
            basePlot.containerHeight,
            basePlot.interactionRegion // always present if passed above
        );
    }
}

// Helper to set highlight range and update bar opacity for a specific plot container
function highlightPromiscuityResidues(start, end, containerOrSelector = null) {
    let container = containerOrSelector;
    if (typeof containerOrSelector === "string") {
        container = document.querySelector(containerOrSelector);
    }
    if (!container) {
        // fallback to first plot container
        container = document.querySelector('.promiscuityPlotContainer');
    }
    if (!container) return;
    if (typeof start === "number" && typeof end === "number" && start <= end) {
        container._promiscuityHighlightRange = { start, end };
        updatePromiscuityBarHighlight(container);
    }
}
function clearPromiscuityHighlight(containerOrSelector = null) {
    let container = containerOrSelector;
    if (typeof containerOrSelector === "string") {
        container = document.querySelector(containerOrSelector);
    }
    if (!container) {
        // fallback to first plot container
        container = document.querySelector('.promiscuityPlotContainer');
    }
    if (!container) return;
    container._promiscuityHighlightRange = null;
    updatePromiscuityBarHighlight(container);
}

// Backward compatibility: old API (no container argument) operates on first plot
window.highlightPromiscuityResidues = highlightPromiscuityResidues;
window.clearPromiscuityHighlight = clearPromiscuityHighlight;

document.addEventListener('DOMContentLoaded', () => {
    // setTimeout(() => initPromiscuityPlot(), 100); // REMOVE or comment out this line

    // Instead, call with explicit options for each plot, e.g.:
    // setTimeout(() => {
    //     initPromiscuityPlot({
    //         containerSelector: '#plot1',
    //         captionSelector: '#caption1',
    //         proteinName: 'ProteinA',
    //         interactionRegion: [{start: 10, end: 20}]
    //     });
    //     initPromiscuityPlot({
    //         containerSelector: '#plot2',
    //         captionSelector: '#caption2',
    //         proteinName: 'ProteinB',
    //         interactionRegion: [{start: 30, end: 40}]
    //     });
    // }, 100);

    let resizeDebounceTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeDebounceTimer);
        resizeDebounceTimer = setTimeout(() => {
            // You must also update this to re-call with correct options for each plot!
            // Example:
            // initPromiscuityPlot({ ...options for plot 1... });
            // initPromiscuityPlot({ ...options for plot 2... });
        }, 250); // Debounce resize event
    });
});

// Expose initPromiscuityPlot for external modules to call with filter criteria
window.initPromiscuityPlot = initPromiscuityPlot;
