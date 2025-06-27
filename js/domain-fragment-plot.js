// Global or appropriately scoped variables to store fetched data for the domain/fragment plot
// Store state for each plot instance (e.g., 'p1', 'p2', 'main')
let domainPlotInstancesData = {};

// Global toggle states for all domain/fragment plots on the page
let globalDomainPlotToggleStates = {
    showUniprotDomains: true,
    showAlphafoldDomains: true,
    showFragments: true
};

// Global color management for "Other Domains" - kept global for simplicity
// If independent color schemes per plot are needed, this should be instanced.
let domainPlot_domainColors = ['#ED7AB0', '#8DC640', '#F68B1F', '#9F83BC', "#FFDD55", '#6DC8BF',
                               '#A74399', '#A6ADD3', '#E64425', '#C2C1B1', '#00A45D', '#BA836E', 
                               '#3E4291'];
let domainPlot_domainColorIndex = 0;
let domainPlot_domainBaseIdToColor = {};

function domainPlot_getDomainColor(baseId) {
    if (!domainPlot_domainBaseIdToColor[baseId]) {
        domainPlot_domainBaseIdToColor[baseId] = domainPlot_domainColors[domainPlot_domainColorIndex % domainPlot_domainColors.length];
        domainPlot_domainColorIndex++;
    }
    return domainPlot_domainBaseIdToColor[baseId];
}

// Default state for a new plot instance
function getDefaultPlotInstanceState() {
    return {
        proteinName: null,
        proteinLength: null,
        fragmentIndicesRaw: null,
        alphafoldDomains: null,
        otherDomains: null,
        // showUniprotDomains, showAlphafoldDomains, showFragments are now global
        // Selectors will be added during initialization
        selectors: {
            container: null,
            caption: null,
            // controls, uniprotDomainsBtn, alphafoldDomainsBtn, fragmentsBtn are removed
            subheading: null, // For protein name subheading
            plotSection: null // For showing/hiding the whole P2 section
        }
    };
}


async function fetchProteinDataForDomainPlot(proteinName) {
    try {
        // Ensure CSV path is correct if deploying
        const response = await fetch('all_fragments_2025.06.04.csv');
        if (!response.ok) {
            console.error('Domain/Fragment Plot: Failed to load CSV for protein data:', response.statusText);
            return { length: null, fragmentIndicesRaw: null, alphafoldDomains: null, otherDomains: null };
        }
        const csvText = await response.text();
        return new Promise((resolve) => {
            Papa.parse(csvText, {
                header: true,
                skipEmptyLines: true,
                complete: function(results) {
                    const data = results.data;
                    const proteinInfoRow = data.find(row => row.name === proteinName);
                    if (proteinInfoRow) {
                        const length = proteinInfoRow.length && !isNaN(parseInt(proteinInfoRow.length, 10)) ? parseInt(proteinInfoRow.length, 10) : null;
                        const fragmentIndicesRaw = proteinInfoRow.fragment_indices || null;
                        const domainsRaw = proteinInfoRow.domains || null;
                        let parsedDomains = null;
                        let alphafoldDomains = [];
                        let otherDomains = [];

                        if (domainsRaw) {
                            try {
                                // Convert Python-like string to JSON-compatible string
                                let jsonFriendlyDomainStr = domainsRaw
                                    .replace(/\(/g, '[')
                                    .replace(/\)/g, ']')
                                    .replace(/'/g, '"');
                                parsedDomains = JSON.parse(jsonFriendlyDomainStr);
                                // Further transform into an array of objects for easier use
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

                                // Separate domains
                                parsedDomains.forEach(domain => {
                                    if (domain.id.startsWith('AF')) {
                                        alphafoldDomains.push(domain);
                                    } else {
                                        otherDomains.push(domain);
                                    }
                                });

                            } catch (e) {
                                console.error(`Domain/Fragment Plot: Error parsing domains for ${proteinName}:`, e, "Raw string:", domainsRaw);
                                // Keep alphafoldDomains and otherDomains as empty arrays
                            }
                        }
                        // Ensure alphafoldDomains and otherDomains are always arrays
                        alphafoldDomains = alphafoldDomains || [];
                        otherDomains = otherDomains || [];


                        if (length === null) {
                            console.warn(`Domain/Fragment Plot: Length for ${proteinName} not found or invalid in CSV.`);
                        }
                        resolve({ length, fragmentIndicesRaw, alphafoldDomains, otherDomains });
                    } else {
                        console.warn(`Domain/Fragment Plot: Data for ${proteinName} not found in CSV.`);
                        resolve({ length: null, fragmentIndicesRaw: null, alphafoldDomains: null, otherDomains: null });
                    }
                },
                error: function(error) {
                    console.error('Domain/Fragment Plot: Error parsing CSV for protein data:', error);
                    resolve({ length: null, fragmentIndicesRaw: null, alphafoldDomains: null, otherDomains: null });
                }
            });
        });
    } catch (error) {
        console.error('Domain/Fragment Plot: Error fetching CSV for protein data:', error);
        return { length: null, fragmentIndicesRaw: null, alphafoldDomains: null, otherDomains: null };
    }
}

// Helper function to merge overlapping intervals
function mergeIntervals(intervals) {
    if (!intervals || intervals.length === 0) {
        return [];
    }
    // Sort intervals by start position
    intervals.sort((a, b) => a.start - b.start);

    const merged = [];
    let currentInterval = intervals[0];

    for (let i = 1; i < intervals.length; i++) {
        const nextInterval = intervals[i];
        if (nextInterval.start <= currentInterval.end) {
            // Overlapping or adjacent, merge them
            currentInterval.end = Math.max(currentInterval.end, nextInterval.end);
        } else {
            // Not overlapping, push current and start a new one
            merged.push(currentInterval);
            currentInterval = nextInterval;
        }
    }
    merged.push(currentInterval); // Add the last interval
    return merged;
}

// Helper: Parse a location string like "135, 139-143, 146-180" into array of {start, end}
function parseFragmentLocString(locStr) {
    if (!locStr) return [];
    return locStr.split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .flatMap(part => {
            if (part.includes('-')) {
                const [start, end] = part.split('-').map(Number);
                if (!isNaN(start) && !isNaN(end)) return [{start, end}];
            } else {
                const val = Number(part);
                if (!isNaN(val)) return [{start: val, end: val}];
            }
            return [];
        });
}

// Helper: Convert a range string like "1-4, 6, 8-10" to array of {start, end}
function parseRangeStringToIntervals(rangeStr) {
    if (!rangeStr || typeof rangeStr !== 'string') return [];
    return rangeStr.split(',')
        .map(s => s.trim())
        .filter(Boolean)
        .flatMap(part => {
            if (part.includes('-')) {
                const [start, end] = part.split('-').map(Number);
                if (!isNaN(start) && !isNaN(end)) return [{start, end}];
            } else {
                const val = Number(part);
                if (!isNaN(val)) return [{start: val, end: val}];
            }
            return [];
        });
}

function drawDomainFragmentBasePlot(instanceId) {
    const instance = domainPlotInstancesData[instanceId];
    if (!instance) {
        console.error(`Domain/Fragment Plot: Instance ${instanceId} not found.`);
        return;
    }

    // Use global toggle states for showing/hiding elements
    const { showUniprotDomains, showAlphafoldDomains, showFragments } = globalDomainPlotToggleStates;
    const { proteinName, proteinLength, fragmentIndicesRaw, alphafoldDomains, otherDomains } = instance;
    const container = document.querySelector(instance.selectors.container);
    const captionElement = document.querySelector(instance.selectors.caption);

    if (!container) {
        console.error(`Domain/Fragment Plot (${instanceId}): Container ${instance.selectors.container} not found.`);
        if (captionElement) captionElement.textContent = 'Plot container element not found.';
        return;
    }
    container.innerHTML = ''; // Clear previous content

    // Remove any old domain info table for this instance
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
    
    // If plot is successfully drawn, clear any residual "Loading..." or error messages from caption,
    // unless it's specifically set by an error condition above.
    if (captionElement && captionElement.textContent.startsWith('Loading data')) {
        captionElement.textContent = ''; 
    }


    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");

    const containerWidth = container.clientWidth;
    const currentContainerHeight = container.clientHeight || 100; // Use 100 as a base if clientHeight is 0.

    svg.setAttribute("width", "100%"); 
    svg.setAttribute("height", "100%");

    const margin = { top: 20, right: 60, bottom: 20, left: 60 };
    const plotWidth = containerWidth - margin.left - margin.right;

    if (plotWidth <= 0) {
        container.innerHTML = `<p style="text-align:center; color:grey; padding-top: 20px;">Not enough space to draw plot.</p>`;
        if (captionElement) captionElement.textContent = 'Plotting area too small for domain/fragment plot.';
        return;
    }

    // Constants for element heights and spacing
    const barHeight = 10;
    const fragmentBarHeight = barHeight * 1.5; // 15
    const afDomainHeightConstant = fragmentBarHeight * 7; // 105 (height of AF domain rectangles)
    const otherDomainRectHeightConstant = fragmentBarHeight * 6; // 90 (height of Other domain rectangles)
    
    // Label spacing constants (many were already implicitly used or defined as afLabel... )
    const labelOffsetVertical = 5; // General vertical offset for labels below domain rects
    const labelFontSize = 10;      // General font size for domain/fragment labels
    const baseIdLabelOffsetVertical = -5; // Offset for baseId label above "Other" domains

    // Dynamically calculate minimum required plot area height
    let dynamicMinPlotAreaHeight = barHeight + 20; // Base for protein bar + 1/N labels

    if (showAlphafoldDomains && alphafoldDomains && alphafoldDomains.length > 0) {
        const afDomainsTotalHeightRequired = afDomainHeightConstant + 2 * labelOffsetVertical + 2 * labelFontSize;
        dynamicMinPlotAreaHeight = Math.max(dynamicMinPlotAreaHeight, afDomainsTotalHeightRequired);
    }

    if (showUniprotDomains && otherDomains && otherDomains.length > 0) {
        const otherDomainsTotalHeightRequired = otherDomainRectHeightConstant + labelOffsetVertical + labelFontSize + Math.abs(baseIdLabelOffsetVertical) + labelFontSize;
        dynamicMinPlotAreaHeight = Math.max(dynamicMinPlotAreaHeight, otherDomainsTotalHeightRequired);
    }

    let hasVisibleFragments = false;
    if (showFragments && fragmentIndicesRaw) {
        try {
            // Attempt to parse fragment string to see if it's non-empty
            let jsonStr = fragmentIndicesRaw.replace(/\(/g, '[').replace(/\)/g, ']').replace(/'/g, '"');
            const parsedFragmentIndices = JSON.parse(jsonStr);
            if (Array.isArray(parsedFragmentIndices) && parsedFragmentIndices.length > 0) {
                hasVisibleFragments = true;
            }
        } catch (e) {
            // If parsing fails, assume no fragments for height calculation
            console.warn("Domain/Fragment Plot: Could not parse fragment_indices for height calculation.", e);
        }
    }
    if (hasVisibleFragments) {
        // Fragments are drawn above/below the central yPosition.
        // They span fragmentBarHeight above (bottom edge of frag) and fragmentBarHeight below (top edge at yPosition if symmetrical).
        // Total span around yPosition is effectively 2 * fragmentBarHeight. Add padding for labels.
        const fragmentsTotalHeightRequired = fragmentBarHeight * 2 + 2 * labelFontSize; // Accommodate labels within this space too
        dynamicMinPlotAreaHeight = Math.max(dynamicMinPlotAreaHeight, fragmentsTotalHeightRequired);
    }
    
    const minViewBoxHeight = dynamicMinPlotAreaHeight + margin.top + margin.bottom;
    const viewboxEffectiveHeight = Math.max(currentContainerHeight, minViewBoxHeight);

    svg.setAttribute("viewBox", `0 0 ${containerWidth} ${viewboxEffectiveHeight}`);

    const plotAreaHeight = viewboxEffectiveHeight - margin.top - margin.bottom;
    
    // This check was originally for AF domains, now more general
    if (plotAreaHeight <= 0) { 
        container.innerHTML = `<p style="text-align:center; color:grey; padding-top: 20px;">Not enough vertical space to draw plot.</p>`;
        if (captionElement) captionElement.textContent = 'Plotting area too small (height) for domain/fragment plot.';
        return;
    }
    
    const yPosition = plotAreaHeight / 2; 

    const g = document.createElementNS(svgNS, "g");
    g.setAttribute("transform", `translate(${margin.left}, ${margin.top})`); // Adjusted for margin.top

    // Conditionally draw the main protein bar
    if (!showFragments) {
        if (showUniprotDomains && otherDomains && otherDomains.length > 0 && proteinLength > 1) {
            // Draw segmented protein bar, hiding parts behind "Other Domains"
            const domainIntervals = otherDomains.map(d => ({
                start: Math.max(1, d.start),
                end: Math.min(proteinLength, d.end)
            })).filter(d => d.end >= d.start);

            const mergedDomainIntervals = mergeIntervals(domainIntervals);

            let lastVisibleX = 0;
            const proteinBarY = yPosition - (barHeight / 2);

            mergedDomainIntervals.forEach(domain => {
                const domainStartX = ((domain.start - 1) / (proteinLength - 1)) * plotWidth;
                const domainEndX = ((domain.end - 1) / (proteinLength - 1)) * plotWidth;

                if (domainStartX > lastVisibleX) {
                    // Draw segment before this domain
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

            // Draw any remaining segment after the last domain
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
            // Draw the full protein bar if "Other Domains" are not shown or no data
            const proteinBar = document.createElementNS(svgNS, "rect");
            proteinBar.setAttribute("x", 0);
            proteinBar.setAttribute("y", yPosition - (barHeight / 2));
            proteinBar.setAttribute("width", plotWidth);
            proteinBar.setAttribute("height", barHeight);
            proteinBar.setAttribute("fill", "#cccccc");
            g.appendChild(proteinBar);
        }
    }

    // --- Draw AlphaFold domains ---
    if (showAlphafoldDomains && alphafoldDomains && alphafoldDomains.length > 0 && proteinLength) {
        const afDomainHeight = afDomainHeightConstant; // Use the constant defined earlier
        const afDomainY = yPosition - (afDomainHeight / 2); // Centered on yPosition
        const originalAFDomainFill = "lightblue";
        const hoverAFDomainFill = "dodgerblue";
        // const labelOffsetVertical = afLabelOffsetVerticalConstant; // Now a general constant
        const afLabelFontSizeConstant = labelFontSize; // Use general constant
        const labelOffsetHorizontal = 2; // Horizontal offset for labels from domain edges

        alphafoldDomains.forEach((domain, index) => {
            if (domain.start === undefined || domain.end === undefined || domain.start > domain.end) return;

            const domainRectId = `af-domain-${instanceId}-${index}`;
            const startLabelId = `af-start-label-${instanceId}-${index}`;
            const endLabelId = `af-end-label-${instanceId}-${index}`;
            const rowId = `af-row-${instanceId}-${index}`;

            // Clamp to valid range
            const start = Math.max(1, domain.start);
            const end = Math.min(proteinLength, domain.end);
            if (end < start) return;

            // Map to plot coordinates
            const denominator = proteinLength > 1 ? proteinLength - 1 : 1;
            const x1_orig = ((start - 1) / denominator) * plotWidth;
            const x2_orig = ((end - 1) / denominator) * plotWidth;
            
            const rect_x = x1_orig - 0.5;
            const domainWidth = Math.max(1, x2_orig - x1_orig + 1); // Adjusted width

            const domainRect = document.createElementNS(svgNS, "rect");
            domainRect.setAttribute("x", rect_x); // Use adjusted x
            domainRect.setAttribute("y", afDomainY);
            domainRect.setAttribute("width", domainWidth); // Use adjusted width
            domainRect.setAttribute("height", afDomainHeight);
            domainRect.setAttribute("fill", originalAFDomainFill);
            domainRect.id = domainRectId; // Assign ID to domainRect

            // Add a title for hover tooltip (shows domain ID and range)
            const title = document.createElementNS(svgNS, "title");
            title.textContent = `${domain.id}: ${domain.start}-${domain.end}`;
            domainRect.appendChild(title);
            
            g.appendChild(domainRect);

            // Create text labels for domain indices (initially hidden)
            const afLabelYPos = afDomainY + afDomainHeight + labelOffsetVertical;

            const afStartLabel = document.createElementNS(svgNS, "text");
            afStartLabel.setAttribute("x", x1_orig - labelOffsetHorizontal); // Label position based on original x1
            afStartLabel.setAttribute("y", afLabelYPos);
            afStartLabel.setAttribute("dy", "0.35em"); // Vertical alignment
            afStartLabel.setAttribute("text-anchor", "end");
            afStartLabel.setAttribute("font-size", `${afLabelFontSizeConstant}px`); // Ensure consistent font size
            afStartLabel.setAttribute("fill", "#333333");
            afStartLabel.textContent = domain.start;
            afStartLabel.setAttribute("visibility", "hidden");
            afStartLabel.id = startLabelId; // Assign ID
            g.appendChild(afStartLabel);

            const afEndLabel = document.createElementNS(svgNS, "text");
            afEndLabel.setAttribute("x", x2_orig + labelOffsetHorizontal); // Label position based on original x2
            afEndLabel.setAttribute("y", afLabelYPos);
            afEndLabel.setAttribute("dy", "0.35em"); // Vertical alignment
            afEndLabel.setAttribute("text-anchor", "start");
            afEndLabel.setAttribute("font-size", `${afLabelFontSizeConstant}px`); // Ensure consistent font size
            afEndLabel.setAttribute("fill", "#333333");
            afEndLabel.textContent = domain.end;
            afEndLabel.setAttribute("visibility", "hidden");
            afEndLabel.id = endLabelId; // Assign ID
            g.appendChild(afEndLabel);

            // Add hover effects for AlphaFold domains
            domainRect.addEventListener("mouseover", () => {
                domainRect.setAttribute("fill", hoverAFDomainFill);
                afStartLabel.setAttribute("visibility", "visible");
                afEndLabel.setAttribute("visibility", "visible");
                document.getElementById(rowId)?.classList.add('domain-table-row-hover');
                // Highlight in promiscuity plot
                if (window.highlightPromiscuityResidues) window.highlightPromiscuityResidues(domain.start, domain.end);
            });
            domainRect.addEventListener("mouseout", () => {
                domainRect.setAttribute("fill", originalAFDomainFill);
                afStartLabel.setAttribute("visibility", "hidden");
                afEndLabel.setAttribute("visibility", "hidden");
                document.getElementById(rowId)?.classList.remove('domain-table-row-hover');
                // Remove highlight
                if (window.clearPromiscuityHighlight) window.clearPromiscuityHighlight();
            });
        });
    }

    // --- Draw Other (UniProt) domains ---
    if (showUniprotDomains && otherDomains && otherDomains.length > 0 && proteinLength) {
        const otherDomainRectHeight = otherDomainRectHeightConstant; // Use constant
        const otherDomainY = yPosition - (otherDomainRectHeight / 2); // Centered on yPosition
        // const labelOffsetVertical = afLabelOffsetVerticalConstant; // Use general constant
        const labelOffsetHorizontal = 2; // Reuse constant
        // const labelFontSize = `${afLabelFontSizeConstant}px`; // Use general constant, ensure it's applied as string if needed by setAttribute
        // const baseIdLabelOffsetVertical = -5; // Defined above

        otherDomains.forEach((domain, index) => {
            if (domain.start === undefined || domain.end === undefined || domain.start > domain.end) return;

            const domainRectId = `other-domain-${instanceId}-${index}`;
            const startLabelId = `other-start-label-${instanceId}-${index}`;
            const endLabelId = `other-end-label-${instanceId}-${index}`;
            const baseIdLabelId = `other-baseid-label-${instanceId}-${index}`;
            const rowId = `other-row-${instanceId}-${index}`;

            let baseId = domain.id;
            const underscoreIndex = baseId.lastIndexOf('_');
            if (underscoreIndex > -1 && /^\d+$/.test(baseId.substring(underscoreIndex + 1))) {
                baseId = baseId.substring(0, underscoreIndex);
            }
            baseId = baseId.replace(/_/g, ' '); // Replace remaining underscores with spaces

            const domainColor = domainPlot_getDomainColor(baseId);

            // Clamp to valid range
            const start = Math.max(1, domain.start);
            const end = Math.min(proteinLength, domain.end);
            if (end < start) return;

            // Map to plot coordinates
            const denominator = proteinLength > 1 ? proteinLength - 1 : 1;
            const x1_orig = ((start - 1) / denominator) * plotWidth;
            const x2_orig = ((end - 1) / denominator) * plotWidth;

            const rect_x = x1_orig - 0.5;
            const domainWidth = Math.max(1, x2_orig - x1_orig + 1); // Adjusted width

            const domainRect = document.createElementNS(svgNS, "rect");
            domainRect.setAttribute("x", rect_x); // Use adjusted x
            domainRect.setAttribute("y", otherDomainY);
            domainRect.setAttribute("width", domainWidth); // Use adjusted width
            domainRect.setAttribute("height", otherDomainRectHeight);
            domainRect.setAttribute("fill", domainColor);
            domainRect.setAttribute("opacity", "0.6");
            domainRect.id = domainRectId; // Assign ID

            const title = document.createElementNS(svgNS, "title");
            title.textContent = `${domain.id}: ${domain.start}-${domain.end}`;
            domainRect.appendChild(title);
            g.appendChild(domainRect);

            // Create text labels for domain indices (initially hidden)
            const otherLabelYPos = otherDomainY + otherDomainRectHeight + labelOffsetVertical;

            const otherStartLabel = document.createElementNS(svgNS, "text");
            otherStartLabel.setAttribute("x", x1_orig - labelOffsetHorizontal); // Label position based on original x1
            otherStartLabel.setAttribute("y", otherLabelYPos);
            otherStartLabel.setAttribute("dy", "0.35em");
            otherStartLabel.setAttribute("text-anchor", "end");
            otherStartLabel.setAttribute("font-size", `${labelFontSize}px`);
            otherStartLabel.setAttribute("fill", "#333333");
            otherStartLabel.textContent = domain.start;
            otherStartLabel.setAttribute("visibility", "hidden");
            otherStartLabel.id = startLabelId; // Assign ID
            g.appendChild(otherStartLabel);

            const otherEndLabel = document.createElementNS(svgNS, "text");
            otherEndLabel.setAttribute("x", x2_orig + labelOffsetHorizontal); // Label position based on original x2
            otherEndLabel.setAttribute("y", otherLabelYPos);
            otherEndLabel.setAttribute("dy", "0.35em");
            otherEndLabel.setAttribute("text-anchor", "start");
            otherEndLabel.setAttribute("font-size", `${labelFontSize}px`);
            otherEndLabel.setAttribute("fill", "#333333");
            otherEndLabel.textContent = domain.end;
            otherEndLabel.setAttribute("visibility", "hidden");
            otherEndLabel.id = endLabelId; // Assign ID
            g.appendChild(otherEndLabel);

            // Create text label for baseId (initially hidden, above the domain)
            const baseIdLabel = document.createElementNS(svgNS, "text");
            baseIdLabel.setAttribute("x", x1_orig + (x2_orig - x1_orig) / 2); // Centered horizontally based on original coords
            baseIdLabel.setAttribute("y", otherDomainY + baseIdLabelOffsetVertical); // Positioned above the domain
            baseIdLabel.setAttribute("dy", "0em"); // Adjust vertical alignment if needed, 0em is baseline
            baseIdLabel.setAttribute("text-anchor", "middle");
            baseIdLabel.setAttribute("font-size", `${labelFontSize}px`); // Reuse font size
            baseIdLabel.setAttribute("fill", "#333333");
            baseIdLabel.textContent = baseId;
            baseIdLabel.setAttribute("visibility", "hidden");
            baseIdLabel.id = baseIdLabelId; // Assign ID
            g.appendChild(baseIdLabel);


            // Add hover effects for Other domains
            domainRect.addEventListener("mouseover", () => {
                domainRect.setAttribute("opacity", "1.0");
                otherStartLabel.setAttribute("visibility", "visible");
                otherEndLabel.setAttribute("visibility", "visible");
                baseIdLabel.setAttribute("visibility", "visible");
                document.getElementById(rowId)?.classList.add('domain-table-row-hover');
                // Highlight in promiscuity plot
                if (window.highlightPromiscuityResidues) window.highlightPromiscuityResidues(domain.start, domain.end);
            });
            domainRect.addEventListener("mouseout", () => {
                domainRect.setAttribute("opacity", "0.6");
                otherStartLabel.setAttribute("visibility", "hidden");
                otherEndLabel.setAttribute("visibility", "hidden");
                baseIdLabel.setAttribute("visibility", "hidden");
                document.getElementById(rowId)?.classList.remove('domain-table-row-hover');
                // Remove highlight
                if (window.clearPromiscuityHighlight) window.clearPromiscuityHighlight();
            });
        });
    }


    // --- Draw fragments as red bars above/below the protein bar ---
    if (showFragments && proteinName && proteinLength && fragmentIndicesRaw) {
        let indicesArr = [];
        try {
            // Use eval safely by replacing with JSON-style brackets
            let jsonStr = fragmentIndicesRaw
                .replace(/\(/g, '[')
                .replace(/\)/g, ']').replace(/'/g, '"');
            indicesArr = JSON.parse(jsonStr);
        } catch (e) {
            console.error(`Domain/Fragment Plot: Error parsing fragment_indices for ${proteinName}:`, e, "Raw string:", fragmentIndicesRaw);
            indicesArr = []; // Ensure it's an array even on error
        }

        // --- Highlight logic for interaction.html ---
        let highlightFragmentIdx = null, highlightLocs = [];
        if (window.location.pathname.endsWith('interaction.html')) {
            const urlParams = new URLSearchParams(window.location.search);
            const f1_id = urlParams.get('f1_id');
            const f2_id = urlParams.get('f2_id');
            const f1_loc = urlParams.get('f1_loc');
            const f2_loc = urlParams.get('f2_loc');
            // Use absolute location highlight (range string, not fragment-relative)
            if (instanceId === 'p1' && f1_loc) {
                highlightLocs = parseRangeStringToIntervals(f1_loc);
            }
            if (instanceId === 'p2' && f2_loc) {
                highlightLocs = parseRangeStringToIntervals(f2_loc);
            }
        }
        // --- End highlight logic ---

        // Draw each fragment as a red bar
        indicesArr.forEach((frag, i) => {
            if (!Array.isArray(frag) || frag.length !== 2) return;
            let [start, end] = frag;
            // Clamp to valid range
            start = Math.max(1, parseInt(start));
            end = Math.min(proteinLength, parseInt(end));
            if (isNaN(start) || isNaN(end) || end < start) return;
            
            // Map to plot coordinates
            const denominator = proteinLength > 1 ? proteinLength - 1 : 1;
            const x1_orig = ((start - 1) / denominator) * plotWidth;
            const x2_orig = ((end - 1) / denominator) * plotWidth;

            const rect_x = x1_orig - 0.5;
            const fragmentWidth = Math.max(1, x2_orig - x1_orig + 1); // Adjusted width
            
            // Alternate above/below
            const isAbove = i % 2 === 0;
            const yRect = isAbove
                ? (yPosition - fragmentBarHeight) // Bottom edge at yPosition
                : (yPosition);                   // Top edge at yPosition
            
            const originalFill = "lightcoral";
            const originalStroke = "dimgrey";
            const hoverFill = "red";
            const hoverStroke = "black";

            // Draw main fragment bar
            const fragmentRect = document.createElementNS(svgNS, "rect");
            fragmentRect.setAttribute("x", rect_x); // Use adjusted x
            fragmentRect.setAttribute("y", yRect);
            fragmentRect.setAttribute("width", fragmentWidth); // Use adjusted width
            fragmentRect.setAttribute("height", fragmentBarHeight);
            fragmentRect.setAttribute("fill", originalFill); 
            fragmentRect.setAttribute("opacity", "1"); 
            fragmentRect.setAttribute("stroke", originalStroke); 
            fragmentRect.setAttribute("stroke-width", "0.5"); 
            g.appendChild(fragmentRect); // Add rect first

            // --- Draw highlight if this fragment overlaps any absolute highlight region ---
            if (highlightLocs.length > 0) {
                highlightLocs.forEach(loc => {
                    // Only highlight if this fragment overlaps the absolute highlight region
                    const overlapStart = Math.max(start, loc.start);
                    const overlapEnd = Math.min(end, loc.end);
                    if (overlapEnd >= overlapStart) {
                        // Map to plot coordinates
                        const x1_hl = ((overlapStart - 1) / denominator) * plotWidth;
                        const x2_hl = ((overlapEnd - 1) / denominator) * plotWidth;
                        const rect_x_hl = x1_hl - 0.5;
                        const width_hl = Math.max(1, x2_hl - x1_hl + 1);
                        const highlightRect = document.createElementNS(svgNS, "rect");
                        highlightRect.setAttribute("x", rect_x_hl);
                        highlightRect.setAttribute("y", yRect);
                        highlightRect.setAttribute("width", width_hl);
                        highlightRect.setAttribute("height", fragmentBarHeight);
                        highlightRect.setAttribute("fill", "#ff2a00"); // Brighter color
                        highlightRect.setAttribute("opacity", "1");
                        highlightRect.setAttribute("stroke", "#b30000");
                        highlightRect.setAttribute("stroke-width", "1.2");
                        g.appendChild(highlightRect);
                    }
                });
            }
            // --- End highlight ---

            // Create text labels for fragment indices (initially hidden)
            const labelYPos = yRect + fragmentBarHeight / 2;
            const labelOffset = 1; // Horizontal offset from fragment edge

            const fragStartLabel = document.createElementNS(svgNS, "text");
            fragStartLabel.setAttribute("x", x1_orig - labelOffset); // Label position based on original x1
            fragStartLabel.setAttribute("y", labelYPos);
            fragStartLabel.setAttribute("dy", "0.35em");
            fragStartLabel.setAttribute("text-anchor", "end");
            fragStartLabel.setAttribute("font-size", `${labelFontSize}px`);
            fragStartLabel.setAttribute("fill", "#333333");
            fragStartLabel.textContent = start;
            fragStartLabel.setAttribute("visibility", "hidden");
            g.appendChild(fragStartLabel);

            const fragEndLabel = document.createElementNS(svgNS, "text");
            fragEndLabel.setAttribute("x", x2_orig + labelOffset); // Label position based on original x2
            fragEndLabel.setAttribute("y", labelYPos);
            fragEndLabel.setAttribute("dy", "0.35em");
            fragEndLabel.setAttribute("text-anchor", "start");
            fragEndLabel.setAttribute("font-size", `${labelFontSize}px`);
            fragEndLabel.setAttribute("fill", "#333333");
            fragEndLabel.textContent = end;
            fragEndLabel.setAttribute("visibility", "hidden");
            g.appendChild(fragEndLabel);
            
            // Add hover effects
            fragmentRect.addEventListener("mouseover", () => {
                fragmentRect.setAttribute("fill", hoverFill);
                fragmentRect.setAttribute("stroke", hoverStroke);
                fragStartLabel.setAttribute("visibility", "visible");
                fragEndLabel.setAttribute("visibility", "visible");
                // Highlight in promiscuity plot
                if (window.highlightPromiscuityResidues) window.highlightPromiscuityResidues(start, end);
            });
            fragmentRect.addEventListener("mouseout", () => {
                fragmentRect.setAttribute("fill", originalFill);
                fragmentRect.setAttribute("stroke", originalStroke);
                fragStartLabel.setAttribute("visibility", "hidden");
                fragEndLabel.setAttribute("visibility", "hidden");
                // Remove highlight
                if (window.clearPromiscuityHighlight) window.clearPromiscuityHighlight();
            });

            // g.appendChild(fragmentRect); // Moved up to ensure labels are drawn on top if overlapping
        });
    }

    const startLabel = document.createElementNS(svgNS, "text");
    startLabel.setAttribute("x", -15); 
    startLabel.setAttribute("y", yPosition); // yPosition is still relevant for labels
    startLabel.setAttribute("dy", "0.35em"); 
    startLabel.setAttribute("text-anchor", "end"); 
    startLabel.setAttribute("font-size", "12px");
    startLabel.setAttribute("fill", "#333333");
    startLabel.textContent = "1";
    g.appendChild(startLabel);

    const endLabel = document.createElementNS(svgNS, "text");
    endLabel.setAttribute("x", plotWidth + 15); 
    endLabel.setAttribute("y", yPosition); // yPosition is still relevant for labels
    endLabel.setAttribute("dy", "0.35em");
    endLabel.setAttribute("text-anchor", "start"); 
    endLabel.setAttribute("font-size", "12px");
    endLabel.setAttribute("fill", "#333333");
    endLabel.textContent = proteinLength;
    g.appendChild(endLabel);
    
    svg.appendChild(g);
    container.appendChild(svg);

    // --- Create and append domain information table (collapsible) ---
    const domainInfoSection = document.createElement('div');
    domainInfoSection.className = 'content-section collapsed'; 
    domainInfoSection.id = `domain-info-collapsible-section-${instanceId}`; // Unique ID

    const titleDiv = document.createElement('div');
    titleDiv.className = 'content-section-title'; 
    
    const titleText = document.createElement('h4'); // Or h3, h2 as appropriate
    titleText.textContent = 'Domain Details';
    titleDiv.appendChild(titleText);

    const icon = document.createElement('i');
    icon.className = 'fas fa-chevron-down'; // Collapsed by default
    titleDiv.appendChild(icon);

    domainInfoSection.appendChild(titleDiv);

    const contentDiv = document.createElement('div');
    contentDiv.className = 'content-section-content'; 
    
    const table = document.createElement('table');
    table.id = `domain-info-table-${instanceId}`; // Unique ID

    const thead = table.createTHead();
    const headerRow = thead.insertRow();
    
    const thName = document.createElement('th');
    thName.textContent = 'Name';
    // Inline styles removed
    headerRow.appendChild(thName);

    const thPosition = document.createElement('th');
    thPosition.textContent = 'Position';
    // Inline styles removed
    headerRow.appendChild(thPosition);

    const tbody = table.createTBody();
    let hasTableData = false;

    // --- Collect, sort, and display domains in the table ---
    let allDomainsForTable = [];

    if (showAlphafoldDomains && alphafoldDomains && alphafoldDomains.length > 0) {
        alphafoldDomains.forEach((domain, index) => {
            if (domain.start === undefined || domain.end === undefined) return;
            allDomainsForTable.push({ ...domain, type: 'alphafold', originalIndex: index });
        });
    }

    if (showUniprotDomains && otherDomains && otherDomains.length > 0) {
        otherDomains.forEach((domain, index) => {
            if (domain.start === undefined || domain.end === undefined) return;
            allDomainsForTable.push({ ...domain, type: 'other', originalIndex: index });
        });
    }

    // Sort domains: by start index, then by end index
    allDomainsForTable.sort((a, b) => {
        if (a.start !== b.start) {
            return a.start - b.start;
        }
        return a.end - b.end;
    });

    if (allDomainsForTable.length > 0) {
        hasTableData = true;
        const originalAFDomainFill = "lightblue"; 
        const hoverAFDomainFill = "dodgerblue";   

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
                    if (rect) rect.setAttribute("fill", hoverAFDomainFill);
                    if (startLabel) startLabel.setAttribute("visibility", "visible");
                    if (endLabel) endLabel.setAttribute("visibility", "visible");
                });
                row.addEventListener("mouseout", () => {
                    row.classList.remove('domain-table-row-hover');
                    const rect = document.getElementById(domainRectId);
                    const startLabel = document.getElementById(startLabelId);
                    const endLabel = document.getElementById(endLabelId);
                    if (rect) rect.setAttribute("fill", originalAFDomainFill);
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


    // Append the table to the content div
    contentDiv.appendChild(table);
    domainInfoSection.appendChild(contentDiv);

    // Add event listener for toggling
    titleDiv.addEventListener('click', () => {
        domainInfoSection.classList.toggle('collapsed'); // MODIFIED: Toggle 'collapsed' on domainInfoSection
        icon.classList.toggle('fa-chevron-down');
        icon.classList.toggle('fa-chevron-up');
    });
    
    // Append the entire collapsible section to the main container (after the SVG plot)
    // The SVG is already in 'container'. We append this new section also to 'container'.
    if (hasTableData) {
        container.appendChild(domainInfoSection);
    }


    // Placeholder: Log current toggle states when redrawing
    // console.log(`Domain/Fragment Plot (${instanceId}) - Current states:`, {
    //     uniprot: showUniprotDomains,
    //     alphafold: showAlphafoldDomains,
    //     fragments: showFragments
    // });
    // console.log(`Domain/Fragment Plot (${instanceId}) - AlphaFold Domains data:`, alphafoldDomains);
    // console.log(`Domain/Fragment Plot (${instanceId}) - Other Domains data:`, otherDomains);
}

// Expose globals for use by other modules (e.g., chord plot)
window.domainPlotInstancesData = domainPlotInstancesData;
window.domainPlot_domainBaseIdToColor = domainPlot_domainBaseIdToColor;

// New function to update only the visual state of GLOBAL code changes
function updateGlobalDomainFragmentPlotControlsVisualState() {
    const uniprotDomainsBtn = document.querySelector('.global-uniprotDomainsBtn');
    const alphafoldDomainsBtn = document.querySelector('.global-alphafoldDomainsBtn');
    const fragmentsBtn = document.querySelector('.global-fragmentsBtn');

    if (uniprotDomainsBtn) {
        uniprotDomainsBtn.classList.toggle('active', globalDomainPlotToggleStates.showUniprotDomains);
    }
    if (alphafoldDomainsBtn) {
        alphafoldDomainsBtn.classList.toggle('active', globalDomainPlotToggleStates.showAlphafoldDomains);
    }
    if (fragmentsBtn) {
        fragmentsBtn.classList.toggle('active', globalDomainPlotToggleStates.showFragments);
    }
}

// Renamed and refactored function to set up event handlers ONCE for a specific instance
// function setupDomainFragmentPlotControlsEventHandlers(instanceId) { // REMOVED

// New function to set up event handlers for GLOBAL control buttons
function setupGlobalDomainFragmentPlotControls() {
    const uniprotDomainsBtn = document.querySelector('.global-uniprotDomainsBtn');
    const alphafoldDomainsBtn = document.querySelector('.global-alphafoldDomainsBtn');
    const fragmentsBtn = document.querySelector('.global-fragmentsBtn');

    const redrawAllActivePlots = () => {
        Object.keys(domainPlotInstancesData).forEach(id => {
            if (domainPlotInstancesData[id] && domainPlotInstancesData[id].proteinName) {
                drawDomainFragmentBasePlot(id);
            }
        });
    };

    if (uniprotDomainsBtn && !uniprotDomainsBtn.dataset.handlerAttached) {
        uniprotDomainsBtn.addEventListener('click', () => {
            globalDomainPlotToggleStates.showUniprotDomains = !globalDomainPlotToggleStates.showUniprotDomains;
            updateGlobalDomainFragmentPlotControlsVisualState();
            redrawAllActivePlots();
        });
        uniprotDomainsBtn.dataset.handlerAttached = 'true';
    }

    if (alphafoldDomainsBtn && !alphafoldDomainsBtn.dataset.handlerAttached) {
        alphafoldDomainsBtn.addEventListener('click', () => {
            globalDomainPlotToggleStates.showAlphafoldDomains = !globalDomainPlotToggleStates.showAlphafoldDomains;
            updateGlobalDomainFragmentPlotControlsVisualState();
            redrawAllActivePlots();
        });
        alphafoldDomainsBtn.dataset.handlerAttached = 'true';
    }

    if (fragmentsBtn && !fragmentsBtn.dataset.handlerAttached) {
        fragmentsBtn.addEventListener('click', () => {
            globalDomainPlotToggleStates.showFragments = !globalDomainPlotToggleStates.showFragments;
            updateGlobalDomainFragmentPlotControlsVisualState();
            redrawAllActivePlots();
        });
        fragmentsBtn.dataset.handlerAttached = 'true';
    }
}


async function initializeInstance(instanceId, proteinName, selectorsConfig) {
    if (!domainPlotInstancesData[instanceId]) {
        domainPlotInstancesData[instanceId] = getDefaultPlotInstanceState();
    }
    const instance = domainPlotInstancesData[instanceId];
    instance.proteinName = proteinName;
    instance.selectors = { ...instance.selectors, ...selectorsConfig };

    const container = document.querySelector(instance.selectors.container);
    const captionElement = document.querySelector(instance.selectors.caption);
    const subheadingElement = instance.selectors.subheading ? document.querySelector(instance.selectors.subheading) : null;

    if (subheadingElement) { // Update subheading if provided
        subheadingElement.textContent = proteinName ? proteinName : 'Protein not specified'; 
    }
    
    if (!proteinName) {
        console.warn(`Domain/Fragment Plot (${instanceId}): Protein name not provided.`);
        if (container) container.innerHTML = `<p style="text-align:center; color:grey; padding-top: 20px;">Protein not specified.</p>`;
        if (captionElement) captionElement.textContent = 'Protein not specified for domain/fragment plot.';
        drawDomainFragmentBasePlot(instanceId); 
        return;
    }

    // Check if data needs to be fetched or re-fetched
    if (instance.proteinName !== proteinName || instance.proteinLength === null) {
        if (captionElement) captionElement.textContent = `Loading data for ${proteinName}...`;
        if (container) container.innerHTML = `<p style="text-align:center; color:grey; padding-top: 20px;">Loading data for domain/fragment plot...</p>`;
        
        const proteinData = await fetchProteinDataForDomainPlot(proteinName);
        instance.proteinLength = proteinData.length;
        instance.fragmentIndicesRaw = proteinData.fragmentIndicesRaw;
        instance.alphafoldDomains = proteinData.alphafoldDomains;
        instance.otherDomains = proteinData.otherDomains;

        // If data loaded successfully (even if length is null, error will be handled by draw function)
        // clear the "Loading..." message from caption. Specific error messages will be set by draw function if needed.
        if (captionElement && captionElement.textContent.startsWith('Loading data')) {
            captionElement.textContent = '';
        }
    }
    
    drawDomainFragmentBasePlot(instanceId); // Draw the plot
}

// Main initialization logic, called on DOMContentLoaded
async function initializeAllDomainFragmentPlots() {
    const urlParams = new URLSearchParams(window.location.search);
    const p1 = decodeURIComponent(urlParams.get('p1') || '');
    const p2 = decodeURIComponent(urlParams.get('p2') || ''); // For pair/interaction pages

    const isProteinPage = window.location.pathname.endsWith('protein.html');
    const isProteinPairPage = window.location.pathname.endsWith('protein_pair.html');
    const isInteractionPage = window.location.pathname.endsWith('interaction.html');

    // Setup global controls once, then initialize instances
    // This ensures controls are interactive and plots use the global state from the start.
    setupGlobalDomainFragmentPlotControls();
    updateGlobalDomainFragmentPlotControlsVisualState(); // Set initial visual state of global buttons

    if (isProteinPage) {
        await initializeInstance('main', p1, {
            container: '.domainFragmentPlotContainer', 
            caption: '.domain-fragment-plot-caption',
            // No individual controls selectors needed here anymore
            // subheading: null, // protein.html has its own main title logic
        });
    } else if (isProteinPairPage || isInteractionPage) {
        const fallbackMessageDF = document.getElementById('fragments-fallback-message-df');

        if (!p1) { // p1 is mandatory for these pages to show anything meaningful
            if (fallbackMessageDF) {
                fallbackMessageDF.textContent = 'Protein 1 parameter (p1) not provided.';
                fallbackMessageDF.style.display = 'block';
            }
            // Hide both sections if p1 is missing
            const p1Section = document.getElementById('domain-fragment-plot-p1-section');
            const p2Section = document.getElementById('domain-fragment-plot-p2-section');
            if (p1Section) p1Section.style.display = 'none';
            if (p2Section) p2Section.style.display = 'none';
            return;
        }
        
        if (fallbackMessageDF) fallbackMessageDF.style.display = 'none';


        await initializeInstance('p1', p1, {
            container: '.domainFragmentPlotContainerP1',
            caption: '.domain-fragment-plot-caption-p1',
            // No individual controls selectors
            subheading: '#protein1-name-subheading-df',
        });

        const p2Section = document.getElementById('domain-fragment-plot-p2-section');
        if (p2 && p1 !== p2) {
            if (p2Section) p2Section.style.display = 'block';
            await initializeInstance('p2', p2, {
                container: '.domainFragmentPlotContainerP2',
                caption: '.domain-fragment-plot-caption-p2',
                // No individual controls selectors
                subheading: '#protein2-name-subheading-df',
                plotSection: '#domain-fragment-plot-p2-section'
            });
        } else {
            if (p2Section) p2Section.style.display = 'none';
             if (p1 === p2 && p2Section) { // Explicitly clear P2 if it's same as P1
                const p2Container = document.querySelector('.domainFragmentPlotContainerP2');
                const p2Caption = document.querySelector('.domain-fragment-plot-caption-p2');
                if (p2Container) p2Container.innerHTML = '';
                if (p2Caption) p2Caption.textContent = '';
                // No need to initialize 'p2' instance if proteins are the same
            }
        }
    }
}


document.addEventListener('DOMContentLoaded', () => {
    // Initial plot setup
    // setTimeout is used to ensure layout is stable for clientWidth/Height readings.
    setTimeout(initializeAllDomainFragmentPlots, 100); 

    let resizeDebounceTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeDebounceTimer);
        resizeDebounceTimer = setTimeout(() => {
            // Re-initialize all plots on resize. Data is cached if protein names haven't changed.
            // This will re-trigger fetches if instance data was cleared or not fully loaded.
            // For a smoother resize, drawDomainFragmentBasePlot could be called directly if data exists.
            // However, re-initializing ensures all states are correctly reapplied.
            Object.keys(domainPlotInstancesData).forEach(instanceId => {
                const instance = domainPlotInstancesData[instanceId];
                // Only re-draw if the instance was actually initialized with a protein
                if (instance && instance.proteinName && instance.selectors.container) {
                     // Re-fetch data or use cached. For resize, mostly to adjust SVG dimensions.
                     // A lighter redraw might be to just call drawDomainFragmentBasePlot if data is present.
                     // For simplicity, full re-init for now.
                    // initializeInstance(instanceId, instance.proteinName, instance.selectors); // This would re-fetch
                    // For resize, just redraw with existing data if available, respecting global toggles
                    if (instance.proteinLength !== null) { // Check if data was loaded
                        drawDomainFragmentBasePlot(instanceId);
                    } else {
                        // If data wasn't loaded (e.g. error or protein not found), re-init to show appropriate messages
                        initializeInstance(instanceId, instance.proteinName, instance.selectors);
                    }
                }
            });
        }, 250); 
    });
});
