// Chord plot module using vanilla JavaScript
// Usage: drawChordByPosition(csvText, containerSelector, options)

// Helper: color palette
const palettes = [
  "#66c2a5", "#fc8d62", "#8da0cb", "#e78ac3", "#a6d854", "#ffd92f", "#e5c494", "#b3b3b3",
  "#1b9e77", "#d95f02", "#7570b3", "#e7298a", "#66a61e", "#e6ab02", "#a6761d", "#666666"
];

// Helper: get unique values
function unique(arr) {
  return Array.from(new Set(arr));
}

// Helper: parse a range string
function parseRange(str) {
  if (!str || typeof str !== "string") return [];
  const parts = str.split(",");
  let min = Infinity;
  let max = -Infinity;
  
  parts.forEach(part => {
    const match = part.match(/(\d+)(?:-(\d+))?/);
    if (match) {
      const start = parseInt(match[1], 10);
      const end = match[2] ? parseInt(match[2], 10) : start;
      if (start < min) min = start;
      if (end > max) max = end;
    }
  });
  
  return min === Infinity ? [] : [min, max];
}

// Helper: polar to cartesian coordinates
function polar(theta, radius) {
  const rad = theta * Math.PI / 180;
  return [Math.cos(rad) * radius, Math.sin(rad) * radius];
}

// Helper to fetch all protein lengths from the fragments CSV
async function fetchAllProteinLengths() {
  // Use a simple cache to avoid re-fetching and re-parsing
  if (window._proteinLengthsCache) {
    return window._proteinLengthsCache;
  }
  try {
    // Ensure PapaParse is available
    if (typeof Papa === 'undefined') {
      console.error('[ChordPlot] PapaParse library is not loaded. Cannot fetch protein lengths.');
      return {};
    }
    const response = await fetch('all_fragments_2025.06.04.csv');
    if (!response.ok) {
      console.error('[ChordPlot] Failed to load all_fragments_2025.06.04.csv');
      return {};
    }
    const csvText = await response.text();
    return new Promise((resolve) => {
      Papa.parse(csvText, {
        header: true,
        skipEmptyLines: true,
        complete: function (results) {
          const lengths = results.data.reduce((acc, row) => {
            if (row.name && row.length && !isNaN(parseInt(row.length, 10))) {
              acc[row.name] = parseInt(row.length, 10);
            }
            return acc;
          }, {});
          window._proteinLengthsCache = lengths; // Cache it
          resolve(lengths);
        },
        error: function (error) {
          console.error('[ChordPlot] Error parsing protein lengths CSV:', error);
          resolve({});
        }
      });
    });
  } catch (error) {
    console.error('[ChordPlot] Error fetching or parsing protein lengths CSV:', error);
    return {};
  }
}

// Main function
export async function drawChordByPosition(data, containerSelector, opts = {}) {
  console.log("[ChordPlot] Options received:", {
    showDomainsOnArcs: opts.showDomainsOnArcs,
    domainColorMap: opts.domainColorMap,
    domainRanges: opts.domainRanges,
    arcColoringMode: opts.arcColoringMode
  });

  // Defensive: Ensure data is an array
  if (!Array.isArray(data)) {
    const container = document.querySelector(containerSelector);
    if (container) {
      container.innerHTML = `<p style="text-align:center; color:red; padding-top: 20px;">Error: Chord plot data is not an array.</p>`;
    }
    console.error("[ChordPlot] Data passed is not an array:", data);
    return;
  }

  // Default options
  const {
    size = 600,
    title = 'Chord Diagram showing predicted interfaces',
    padAngle = 2,
    proteinNamesForEmptyMessage = 'the selection',
    coloringMode = 'byProtein1',
    queryProtein = null,
    expandQuery = false, // expand query arc only (does NOT filter data)
    showDomainsOnArcs = false,
    domainColorMap = null,
    domainRanges = null,
    arcColoringMode = 'default'
  } = opts;

  // Data is assumed to be pre-filtered array of objects.
  // All parsing and filtering logic is removed.

  console.log("[ChordPlot] Received data rows for plotting:", data.length);

  if (data.length === 0) {
    const container = document.querySelector(containerSelector);
    if (container) {
      container.innerHTML = `<p style="text-align:center; color:grey; padding-top: 20px;">No interactions to display in chord plot for ${proteinNamesForEmptyMessage}.</p>`;
    }
    console.log("[ChordPlot] No data to plot, aborting.");
    return;
  }

  // Fetch all protein lengths from CSV
  const allProteinLengths = await fetchAllProteinLengths();

  // Extract proteins and their lengths
  const proteins = {};
  const proteinNames = [...new Set(data.flatMap(d => [d.Protein1 || d.protein1, d.Protein2 || d.protein2]))].filter(Boolean);

  proteinNames.forEach(name => {
    proteins[name] = { name: name, length: allProteinLengths[name] || 0 };
  });

  // Fallback for proteins that didn't have a length in the CSV: use max residue from interactions
  data.forEach(row => {
    const p1 = row.Protein1 || row.protein1;
    const p2 = row.Protein2 || row.protein2;

    const needsFallback = (p) => p && proteins[p] && proteins[p].length === 0;

    if (needsFallback(p1) || needsFallback(p2)) {
      let absLoc = {};
      if (row.absolute_location && typeof row.absolute_location === 'string') {
        try {
          absLoc = JSON.parse(row.absolute_location.replace(/'/g, '"'));
        } catch (e) {
          console.warn("[ChordPlot] Failed to parse absolute_location for row:", row, e);
        }
      }
      const absKeys = Object.keys(absLoc).reduce((acc, k) => { acc[k.toLowerCase()] = absLoc[k]; return acc; }, {});

      if (needsFallback(p1)) {
        const arr = absKeys['protein1'] || absKeys['chaina'] || absKeys['chain a'] || [];
        if (Array.isArray(arr) && arr.length > 0) {
          const max = Math.max(...arr);
          proteins[p1].length = Math.max(proteins[p1].length, max);
        }
      }
      if (needsFallback(p2)) {
        const arr = absKeys['protein2'] || absKeys['chainb'] || absKeys['chain b'] || [];
        if (Array.isArray(arr) && arr.length > 0) {
          const max = Math.max(...arr);
          proteins[p2].length = Math.max(proteins[p2].length, max);
        }
      }
    }
  });
  console.log("[ChordPlot] Proteins and their lengths:", proteins);

  const proteinList = Object.values(proteins);
  const names = proteinList.map(p => p.name);
  const seqLens = proteinList.reduce((acc, p) => {
    acc[p.name] = p.length || 100; // Default length if missing
    return acc;
  }, {});
  const totalLen = proteinList.reduce((sum, p) => sum + seqLens[p.name], 0);

  // Prepare interface data
  const ifaceData = data.map(row => {
    const p1 = row.Protein1 || row.protein1;
    const p2 = row.Protein2 || row.protein2;
    let absLoc = {};
    if (row.absolute_location && typeof row.absolute_location === 'string') {
      try {
        absLoc = JSON.parse(row.absolute_location.replace(/'/g, '"'));
      } catch (e) {
        console.warn("[ChordPlot] Failed to parse absolute_location for row (ifaceData):", row, e);
      }
    }
    const absKeys = Object.keys(absLoc).reduce((acc, k) => { acc[k.toLowerCase()] = absLoc[k]; return acc; }, {});
    // Get arrays for each protein
    const arr1 = absKeys['protein1'] || absKeys['chaina'] || absKeys['chain a'] || [];
    const arr2 = absKeys['protein2'] || absKeys['chainb'] || absKeys['chain b'] || [];
    // Use min/max as range
    const res1 = (Array.isArray(arr1) && arr1.length > 0) ? [Math.min(...arr1), Math.max(...arr1)] : [];
    const res2 = (Array.isArray(arr2) && arr2.length > 0) ? [Math.min(...arr2), Math.max(...arr2)] : [];
    if (!(res1.length && res2.length)) {
      //console.log("[ChordPlot] Skipping ifaceData row due to missing ranges:", {p1, p2, arr1, arr2});
    }
    return {
      protein1: p1,
      protein2: p2,
      res1,
      res2
    };
  }).filter(d => d.res1.length && d.res2.length);

  console.log("[ChordPlot] ifaceData (chords to draw):", ifaceData);

  // Create SVG container
  const container = document.querySelector(containerSelector);
  container.innerHTML = '';
  
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size + 40);
  
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  svg.appendChild(defs);

  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('transform', `translate(${size/2},${size/2})`);
  svg.appendChild(g);
  container.appendChild(svg);

  // Calculate angles for proteins
  const angles = {};
  let currentAngle = 0;

  // --- Orient queryProtein at the top if present and only one protein is the query ---
  let namesOrdered = names;
  if (queryProtein && names.length > 1 && names.includes(queryProtein)) {
    namesOrdered = [queryProtein, ...names.filter(n => n !== queryProtein)];
  }

  // --- Expand query arc if requested ---
  let arcFractions = {};
  if (expandQuery && queryProtein && namesOrdered[0] === queryProtein && namesOrdered.length > 1) {
    // Query gets 60% of the ring, others share 40%
    arcFractions[queryProtein] = 0.6;
    const rest = 1 - arcFractions[queryProtein];
    const nOthers = namesOrdered.length - 1;
    namesOrdered.slice(1).forEach(name => {
      arcFractions[name] = rest / nOthers;
    });
  } else {
    // Default: proportional to sequence length
    const totalLen = proteinList.reduce((sum, p) => sum + seqLens[p.name], 0);
    namesOrdered.forEach(name => {
      arcFractions[name] = seqLens[name] / totalLen;
    });
  }

  // Compute offset so that queryProtein arc is centered at -90deg (top)
  let angleOffset = 0;
  if (queryProtein && namesOrdered[0] === queryProtein) {
    const arcSpan = arcFractions[queryProtein] * (360 - padAngle * names.length);
    angleOffset = -90 - arcSpan / 2;
  }

  currentAngle = angleOffset;
  namesOrdered.forEach(name => {
    const span = arcFractions[name] * (360 - padAngle * names.length);
    angles[name] = {
      start: currentAngle,
      end: currentAngle + span
    };
    currentAngle += span + padAngle;
  });

  // Arc thickness
  const arcOuter = size * 0.38;
  const arcInner = size * 0.32;

  // Helper to get domains for a protein from the global domain plot data
  function getDomainsForProtein(proteinName) {
    if (!window.domainPlotInstancesData) return null;
    
    for (const instanceId of Object.keys(window.domainPlotInstancesData)) {
      const instance = window.domainPlotInstancesData[instanceId];
      if (instance && instance.proteinName === proteinName) {
        // Combine AlphaFold and UniProt domains into one array with type information
        const domains = [
          ...(instance.alphafoldDomains || []).map(d => ({...d, type: 'alphafold'})),
          ...(instance.uniprotDomains || []).map(d => ({...d, type: 'uniprot'}))
        ];
        return domains;
      }
    }
    return null;
  }

  // When drawing protein arcs, get domains and colors
  namesOrdered.forEach(name => {
    const { start, end } = angles[name];
    const domains = getDomainsForProtein(name);
    
    // Draw base arc
    const baseArc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const arcStartRad = start * Math.PI / 180;
    const arcEndRad = end * Math.PI / 180;
    const arcLargeArc = end - start <= 180 ? 0 : 1;

    const arcOuterX1 = Math.cos(arcStartRad) * arcOuter;
    const arcOuterY1 = Math.sin(arcStartRad) * arcOuter;
    const arcInnerX1 = Math.cos(arcStartRad) * arcInner;
    const arcInnerY1 = Math.sin(arcStartRad) * arcInner;
    const arcOuterX2 = Math.cos(arcEndRad) * arcOuter;
    const arcOuterY2 = Math.sin(arcEndRad) * arcOuter;
    const arcInnerX2 = Math.cos(arcEndRad) * arcInner;
    const arcInnerY2 = Math.sin(arcEndRad) * arcInner;

    baseArc.setAttribute('d', `
      M ${arcOuterX1} ${arcOuterY1}
      A ${arcOuter} ${arcOuter} 0 ${arcLargeArc} 1 ${arcOuterX2} ${arcOuterY2}
      L ${arcInnerX2} ${arcInnerY2}
      A ${arcInner} ${arcInner} 0 ${arcLargeArc} 0 ${arcInnerX1} ${arcInnerY1}
      Z
    `);

    if (!showDomainsOnArcs || !domains || domains.length === 0) {
      if (arcColoringMode === 'greyOnly') {
        // Use different shades of grey for the two proteins
        const greyShade = namesOrdered.indexOf(name) === 0 ? '#888888' : '#CCCCCC';
        baseArc.setAttribute('fill', greyShade);
      } else {
        // Use distinct colors for proteins when not showing domains
        const proteinColor = palettes[namesOrdered.indexOf(name) % palettes.length];
        baseArc.setAttribute('fill', proteinColor);
      }
      baseArc.setAttribute('opacity', '0.85');
    } else {
      // Use grey base for domain coloring mode
      baseArc.setAttribute('fill', '#cccccc');
      baseArc.setAttribute('opacity', '0.7');
    }
    g.appendChild(baseArc);

    // Draw domain segments if available
    if (showDomainsOnArcs && domains && domains.length > 0) {
        domains.forEach(domain => {
            if (!domain.start || !domain.end) return;
            
            const dStart = Math.max(1, domain.start);
            const dEnd = Math.min(seqLens[name], domain.end);
            if (dEnd < dStart) return;

            const arcSpan = end - start;
            const denominator = seqLens[name] > 1 ? seqLens[name] - 1 : 1;
            const segStart = start + ((dStart - 1) / denominator) * arcSpan;
            const segEnd = start + ((dEnd - 1) / denominator) * arcSpan;

            // Get color based on domain type
            let segColor;
            if (domain.type === 'alphafold') {
                segColor = '#8ecae6'; // Light blue for AlphaFold domains
            } else {
                const baseId = domain.id ? domain.id.replace(/_\d+$/, '').replace(/_/g, ' ') : '';
                segColor = window.domainPlot_domainBaseIdToColor[baseId] || '#cccccc';
            }
            
            // Create domain segment path
            const segPath = _createDomainArcPath(segStart, segEnd, arcInner, arcOuter);
            segPath.setAttribute('fill', segColor);
            segPath.setAttribute('opacity', '0.6');

            // Add hover effects
            const hoverLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            hoverLabel.setAttribute('visibility', 'hidden');
            hoverLabel.setAttribute('font-size', '10');
            hoverLabel.setAttribute('fill', '#222');
            hoverLabel.setAttribute('font-weight', 'bold');
            hoverLabel.setAttribute('text-anchor', 'middle');
            const labelAngle = (segStart + segEnd) / 2;
            const [labelX, labelY] = polar(labelAngle, arcInner - 15);
            hoverLabel.setAttribute('x', labelX);
            hoverLabel.setAttribute('y', labelY);
            const domainText = domain.type === 'alphafold' ? 
                `AlphaFold ${dStart}-${dEnd}` : 
                `${domain.id.replace(/_\d+$/, '').replace(/_/g, ' ')} ${dStart}-${dEnd}`;
            hoverLabel.textContent = domainText;

            segPath.addEventListener('mouseover', () => {
                segPath.setAttribute('opacity', '0.9');
                hoverLabel.setAttribute('visibility', 'visible');
                g.appendChild(hoverLabel);  // Move label to front
            });

            segPath.addEventListener('mouseout', () => {
                segPath.setAttribute('opacity', '0.6');
                hoverLabel.setAttribute('visibility', 'hidden');
            });

            g.appendChild(segPath);
            g.appendChild(hoverLabel);
        });
    }

    // Determine label placement and orientation
    const manyProteins = namesOrdered.length > 20;
    const midAngle = (start + end) / 2;
    const labelRadius = arcOuter + (manyProteins ? 28 : 28);
    const endLabelRadius = arcOuter + (manyProteins ? 10 : 8);

    // Protein name label (middle of arc, outside)
    const [lx, ly] = polar(midAngle, labelRadius);
    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', lx);
    label.setAttribute('y', ly);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('dominant-baseline', 'middle');
    label.setAttribute('font-size', '13');
    label.textContent = name;
    if (manyProteins) {
      // Orient perpendicular to the arc at the label position (radial, pointing outward)
      // Perpendicular = midAngle (degrees from center), so subtract 90 to get tangent
      // To keep upright, flip if on bottom half (midAngle between 90 and 270)
      let angle = midAngle;
      if (angle > 90 && angle < 270) {
        angle += 180;
      }
      label.setAttribute('transform', `rotate(${angle} ${lx} ${ly})`);
    }
    g.appendChild(label);

    // Final residue label (at arc end, smaller and closer to arc)
    const [ex, ey] = polar(end, arcOuter + 1); // Even closer to arc
    const endLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    endLabel.setAttribute('x', ex);
    endLabel.setAttribute('y', ey);
    endLabel.setAttribute('text-anchor', 'middle');
    endLabel.setAttribute('dominant-baseline', 'middle');
    endLabel.setAttribute('font-size', '7'); // Smaller font
    endLabel.setAttribute('fill', '#333');
    endLabel.textContent = seqLens[name];
    g.appendChild(endLabel);
  });

  // Helper function to create domain arc paths
  function _createDomainArcPath(startAngle, endAngle, innerRadius, outerRadius) {
    const segStartRad = startAngle * Math.PI / 180;
    const segEndRad = endAngle * Math.PI / 180;
    const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;

    const x1 = Math.cos(segStartRad) * outerRadius;
    const y1 = Math.sin(segStartRad) * outerRadius;
    const x2 = Math.cos(segEndRad) * outerRadius;
    const y2 = Math.sin(segEndRad) * outerRadius;
    const x3 = Math.cos(segEndRad) * innerRadius;
    const y3 = Math.sin(segEndRad) * innerRadius;
    const x4 = Math.cos(segStartRad) * innerRadius;
    const y4 = Math.sin(segStartRad) * innerRadius;

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `
      M ${x1} ${y1}
      A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 1 ${x2} ${y2}
      L ${x3} ${y3}
      A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 0 ${x4} ${y4}
      Z
    `);
    return path;
  }

  // Draw chords (interaction bands)
  const chordRadius = size * 0; // control point radius for curve
  // Store references for hover
  const chordElements = [];
  const hoverLabels = [];

  ifaceData.forEach((iface, i) => {
    const { protein1, protein2, res1, res2 } = iface;

    // Calculate arc positions for interaction region (as fraction of arc)
    const angle1 = angles[protein1];
    const angle2 = angles[protein2];

    // Map residue to angle along arc
    const arcSpan1 = angle1.end - angle1.start;
    const arcSpan2 = angle2.end - angle2.start;
    const pos1Start = angle1.start + ((res1[0] / seqLens[protein1]) * arcSpan1);
    const pos1End   = angle1.start + ((res1[1] / seqLens[protein1]) * arcSpan1);
    const pos2Start = angle2.start + ((res2[0] / seqLens[protein2]) * arcSpan2);
    const pos2End   = angle2.start + ((res2[1] / seqLens[protein2]) * arcSpan2);

    // --- Only separate the labels, keep band positions accurate to the data ---
    // Minimum angular separation in degrees (adjust as needed)
    const minLabelAngle = 8;
    // For protein1
    let label1StartAngle = pos1Start, label1EndAngle = pos1End;
    if (Math.abs(pos1End - pos1Start) < minLabelAngle) {
      const mid = (pos1Start + pos1End) / 2;
      label1StartAngle = mid - minLabelAngle / 2;
      label1EndAngle = mid + minLabelAngle / 2;
    }
    // For protein2
    let label2StartAngle = pos2Start, label2EndAngle = pos2End;
    if (Math.abs(pos2End - pos2Start) < minLabelAngle) {
      const mid = (pos2Start + pos2End) / 2;
      label2StartAngle = mid - minLabelAngle / 2;
      label2EndAngle = mid + minLabelAngle / 2;
    }

    // Chord starts/ends at INNER edge of arc, at correct position (use original, not adjusted, angles)
    const [x1s, y1s] = polar(pos1Start, arcInner);
    const [x1e, y1e] = polar(pos1End, arcInner);
    const [x2s, y2s] = polar(pos2Start, arcInner);
    const [x2e, y2e] = polar(pos2End, arcInner);

    // Control point for curve (midpoint between arc centers, at chordRadius)
    const midAngle = (pos1Start + pos2End) / 2;
    const [cx, cy] = polar(midAngle, chordRadius);

    // Draw chord as a closed shape (quadratic curves)
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `
      M ${x1s} ${y1s}
      Q ${cx} ${cy} ${x2e} ${y2e}
      L ${x2s} ${y2s}
      Q ${cx} ${cy} ${x1e} ${y1e}
      Z
    `);
    
    // --- Color the chord based on coloringMode ---
    switch (coloringMode) {
      case 'gradient':
        const gradientId = `grad-${i}`;
        const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
        gradient.setAttribute('id', gradientId);
        gradient.setAttribute('gradientUnits', 'userSpaceOnUse');

        const midAngle1 = (pos1Start + pos1End) / 2;
        const midAngle2 = (pos2Start + pos2End) / 2;
        const [m1x, m1y] = polar(midAngle1, arcInner);
        const [m2x, m2y] = polar(midAngle2, arcInner);

        gradient.setAttribute('x1', m1x);
        gradient.setAttribute('y1', m1y);
        gradient.setAttribute('x2', m2x);
        gradient.setAttribute('y2', m2y);

        const colorP1 = palettes[names.indexOf(protein1) % palettes.length];
        const colorP2 = palettes[names.indexOf(protein2) % palettes.length];

        const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        stop1.setAttribute('offset', '0%');
        stop1.setAttribute('stop-color', colorP2); // At protein1, use color of protein2

        const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        stop2.setAttribute('offset', '100%');
        stop2.setAttribute('stop-color', colorP1); // At protein2, use color of protein1

        gradient.appendChild(stop1);
        gradient.appendChild(stop2);
        defs.appendChild(gradient);

        path.setAttribute('fill', `url(#${gradientId})`);
        break;
      case 'byPartner':
        const partner = (protein1 === queryProtein) ? protein2 : protein1;
        const partnerColor = palettes[names.indexOf(partner) % palettes.length];
        path.setAttribute('fill', partnerColor);
        break;
      case 'varied':
        const variedColor = palettes[i % palettes.length];
        path.setAttribute('fill', variedColor);
        break;
      case 'byProtein1':
      default:
        const p1Color = palettes[names.indexOf(protein1) % palettes.length];
        path.setAttribute('fill', p1Color);
        break;
    }

    path.setAttribute('opacity', '0.5');
    path.setAttribute('stroke', 'none');
    path.classList.add('chord-shape');
    g.appendChild(path);

    // Store for hover
    chordElements.push(path);

    // --- BEGIN: Make chord clickable to interaction page ---
    // Helper: Convert array of indices to compact range string (e.g., 1-4, 6)
    function indicesToRanges(indices) {
      if (!Array.isArray(indices) || indices.length === 0) return '';
      const sorted = Array.from(new Set(indices)).map(Number).filter(n => !isNaN(n)).sort((a, b) => a - b);
      let result = [];
      let start = sorted[0], end = sorted[0];
      for (let i = 1; i <= sorted.length; i++) {
        if (sorted[i] === end + 1) {
          end = sorted[i];
        } else {
          if (start === end) {
            result.push(`${start}`);
          } else {
            result.push(`${start}-${end}`);
          }
          start = sorted[i];
          end = sorted[i];
        }
      }
      return result.join(', ');
    }

    // Find domain IDs for protein1 and protein2 if available in data
    // Try to find the row in the original data that matches this iface
    let row = data.find(r => {
      const p1 = r.Protein1 || r.protein1;
      const p2 = r.Protein2 || r.protein2;
      // Compare protein names and residue ranges
      let absLoc = {};
      if (r.absolute_location && typeof r.absolute_location === 'string') {
        try {
          absLoc = JSON.parse(r.absolute_location.replace(/'/g, '"'));
        } catch {}
      }
      const absKeys = Object.keys(absLoc).reduce((acc, k) => { acc[k.toLowerCase()] = absLoc[k]; return acc; }, {});
      const arr1 = absKeys['protein1'] || absKeys['chaina'] || absKeys['chain a'] || [];
      const arr2 = absKeys['protein2'] || absKeys['chainb'] || absKeys['chain b'] || [];
      const r1 = (Array.isArray(arr1) && arr1.length > 0) ? [Math.min(...arr1), Math.max(...arr1)] : [];
      const r2 = (Array.isArray(arr2) && arr2.length > 0) ? [Math.min(...arr2), Math.max(...arr2)] : [];
      return (
        p1 === protein1 && p2 === protein2 &&
        r1.length && r2.length &&
        r1[0] === res1[0] && r1[1] === res1[1] &&
        r2[0] === res2[0] && r2[1] === res2[1]
      );
    }) || {};

    // Get domain IDs
    const protein1Domain = row.Protein1_Domain || "";
    const protein2Domain = row.Protein2_Domain || "";
    const p1Base = protein1;
    const p2Base = protein2;
    const p1DomainParts = protein1Domain.split('_F');
    const f1Id = p1DomainParts.length > 1 ? `F${p1DomainParts[1]}` : '';
    const p2DomainParts = protein2Domain.split('_F');
    const f2Id = p2DomainParts.length > 1 ? `F${p2DomainParts[1]}` : '';

    // Get absolute location ranges for each protein
    let absLoc = {};
    if (row.absolute_location && typeof row.absolute_location === 'string') {
      try {
        absLoc = JSON.parse(row.absolute_location.replace(/'/g, '"'));
      } catch {}
    }
    const absKeys = Object.keys(absLoc).reduce((acc, k) => { acc[k.toLowerCase()] = absLoc[k]; return acc; }, {});
    let f1Loc = '';
    let f2Loc = '';
    if (absKeys['protein1']) {
      f1Loc = indicesToRanges(absKeys['protein1']);
    } else if (absKeys['chaina']) {
      f1Loc = indicesToRanges(absKeys['chaina']);
    } else if (absKeys['chain a']) {
      f1Loc = indicesToRanges(absKeys['chain a']);
    }
    if (absKeys['protein2']) {
      f2Loc = indicesToRanges(absKeys['protein2']);
    } else if (absKeys['chainb']) {
      f2Loc = indicesToRanges(absKeys['chainb']);
    } else if (absKeys['chain b']) {
      f2Loc = indicesToRanges(absKeys['chain b']);
    }

    // Round pdockq, iptm, min_pae, avg_pae to 2dp for the link
    function round2(val) {
      const num = Number(val);
      return isNaN(num) ? '' : num.toFixed(2);
    }
    const pdockq2 = round2(row.pdockq);
    const iptm2 = round2(row.iptm);
    const min_pae2 = round2(row.min_pae);
    const avg_pae2 = round2(row.avg_pae);

    // Compute shifts if possible
    let relLoc = {};
    if (row.location && typeof row.location === 'string') {
      try {
        relLoc = JSON.parse(row.location.replace(/'/g, '"'));
      } catch {}
    }
    const relKeys = Object.keys(relLoc).reduce((acc, k) => { acc[k.toLowerCase()] = relLoc[k]; return acc; }, {});
    function getFirstVal(val) {
      if (Array.isArray(val) && val.length > 0) return Number(val[0]);
      if (typeof val === 'string') {
        const match = val.match(/^(\d+)/);
        if (match) return Number(match[1]);
      }
      return undefined;
    }
    let absF1 = getFirstVal(absKeys['protein1'] || absKeys['chaina'] || absKeys['chain a']);
    let absF2 = getFirstVal(absKeys['protein2'] || absKeys['chainb'] || absKeys['chain b']);
    let relF1 = getFirstVal(relKeys['protein1'] || relKeys['chaina'] || relKeys['chain a']);
    let relF2 = getFirstVal(relKeys['protein2'] || relKeys['chainb'] || relKeys['chain b']);
    let f1_shift = '', f2_shift = '';
    if (typeof absF1 === 'number' && typeof relF1 === 'number') {
      f1_shift = absF1 - relF1;
    }
    if (typeof absF2 === 'number' && typeof relF2 === 'number') {
      f2_shift = absF2 - relF2;
    }

    // Compose the interaction link (same as table)
    const interactionLink = `interaction.html?&p1=${encodeURIComponent(p1Base)}&p2=${encodeURIComponent(p2Base)}&f1_id=${encodeURIComponent(f1Id)}&f2_id=${encodeURIComponent(f2Id)}&f1_loc=${encodeURIComponent(f1Loc)}&f2_loc=${encodeURIComponent(f2Loc)}&iptm=${encodeURIComponent(iptm2)}&min_pae=${encodeURIComponent(min_pae2)}&avg_pae=${encodeURIComponent(avg_pae2)}&rop=${encodeURIComponent(row.rop)}&pdockq=${encodeURIComponent(pdockq2)}&f1_shift=${encodeURIComponent(f1_shift)}&f2_shift=${encodeURIComponent(f2_shift)}`;

    path.style.cursor = "pointer";
    path.addEventListener('click', () => {
      window.location.href = interactionLink;
    });
    // --- END: Make chord clickable ---

    // Prepare hover label elements (hidden by default)
    const labelElems = [];

    // Protein1 start/end indices (use separated label angles)
    const [lx1s, ly1s] = polar(label1StartAngle, arcInner);
    const [lx1e, ly1e] = polar(label1EndAngle, arcInner);
    const label1Start = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label1Start.setAttribute('x', lx1s);
    label1Start.setAttribute('y', ly1s);
    label1Start.setAttribute('text-anchor', 'middle');
    label1Start.setAttribute('dominant-baseline', 'middle');
    label1Start.setAttribute('font-size', '10');
    label1Start.setAttribute('fill', '#222');
    label1Start.setAttribute('font-weight', 'bold');
    label1Start.textContent = res1[0];
    label1Start.setAttribute('visibility', 'hidden');
    labelElems.push(label1Start);

    const label1End = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label1End.setAttribute('x', lx1e);
    label1End.setAttribute('y', ly1e);
    label1End.setAttribute('text-anchor', 'middle');
    label1End.setAttribute('dominant-baseline', 'middle');
    label1End.setAttribute('font-size', '10');
    label1End.setAttribute('fill', '#222');
    label1End.setAttribute('font-weight', 'bold');
    label1End.textContent = res1[1];
    label1End.setAttribute('visibility', 'hidden');
    labelElems.push(label1End);

    // Protein2 start/end indices (use separated label angles)
    const [lx2s, ly2s] = polar(label2StartAngle, arcInner);
    const [lx2e, ly2e] = polar(label2EndAngle, arcInner);
    const label2Start = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label2Start.setAttribute('x', lx2s);
    label2Start.setAttribute('y', ly2s);
    label2Start.setAttribute('text-anchor', 'middle');
    label2Start.setAttribute('dominant-baseline', 'middle');
    label2Start.setAttribute('font-size', '10');
    label2Start.setAttribute('fill', '#222');
    label2Start.setAttribute('font-weight', 'bold');
    label2Start.textContent = res2[0];
    label2Start.setAttribute('visibility', 'hidden');
    labelElems.push(label2Start);

    const label2End = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label2End.setAttribute('x', lx2e);
    label2End.setAttribute('y', ly2e);
    label2End.setAttribute('text-anchor', 'middle');
    label2End.setAttribute('dominant-baseline', 'middle');
    label2End.setAttribute('font-size', '10');
    label2End.setAttribute('fill', '#222');
    label2End.setAttribute('font-weight', 'bold');
    label2End.textContent = res2[1];
    label2End.setAttribute('visibility', 'hidden');
    labelElems.push(label2End);

    hoverLabels.push(labelElems);

    // Add hover events
    path.addEventListener('mouseover', () => {
      g.appendChild(path);
      // Move labels to top (append after all chords)
      labelElems.forEach(el => g.appendChild(el));
      path.setAttribute('opacity', '0.85');
      path.setAttribute('stroke', 'none');
      path.setAttribute('stroke-width', '0');
      labelElems.forEach(el => el.setAttribute('visibility', 'visible'));
    });
    path.addEventListener('mouseout', () => {
      path.setAttribute('opacity', '0.5');
      path.setAttribute('stroke', 'none');
      labelElems.forEach(el => el.setAttribute('visibility', 'hidden'));
    });

    // Always append labels after chords so they are on top (but hidden by default)
    labelElems.forEach(el => g.appendChild(el));
  });

  // Add style for highlight (optional, in case you want to use CSS)
  // You can move this to your CSS file if preferred
  if (!document.getElementById('chord-plot-style')) {
    const style = document.createElement('style');
    style.id = 'chord-plot-style';
    style.textContent = `
      .chord-shape:hover {
        /* cursor: pointer; */
      }
      svg, svg * {
        cursor: default !important;
      }
    `;
    document.head.appendChild(style);
  }
}