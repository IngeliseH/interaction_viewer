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

  // Draw protein arcs and labels
  namesOrdered.forEach(name => {
    const { start, end } = angles[name];
    let color;
    if (arcColoringMode === 'distinct') {
      const greyPalettes = ['#aaaaaa', '#cccccc'];
      color = greyPalettes[names.indexOf(name) % greyPalettes.length];
    } else {
      color = palettes[names.indexOf(name) % palettes.length];
    }

    // --- Always draw underlying grey arc for the whole protein ---
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

    // Draw the full grey arc as a base
    const baseArc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    baseArc.setAttribute('d', `
      M ${arcOuterX1} ${arcOuterY1}
      A ${arcOuter} ${arcOuter} 0 ${arcLargeArc} 1 ${arcOuterX2} ${arcOuterY2}
      L ${arcInnerX2} ${arcInnerY2}
      A ${arcInner} ${arcInner} 0 ${arcLargeArc} 0 ${arcInnerX1} ${arcInnerY1}
      Z
    `);
    baseArc.setAttribute('fill', '#cccccc');
    baseArc.setAttribute('opacity', '0.7');
    baseArc.setAttribute('stroke', 'none');
    g.appendChild(baseArc);

    // --- DOMAIN ARC SEGMENTS (AlphaFold below, then UniProt/other) ---
    if (showDomainsOnArcs && domainColorMap && domainRanges && domainRanges[name] && domainRanges[name].length > 0) {
      const domains = domainRanges[name];
      const seqLen = seqLens[name];
      const arcSpan = angles[name].end - angles[name].start;

      // --- AlphaFold domains (type: 'alphafold' or id starts with 'AF') ---
      let afDomains = domains.filter(domain =>
        domain.type === 'alphafold' || (domain.id && domain.id.startsWith('AF'))
      );
      // If not found, try to get from global domainPlotInstancesData
      if (afDomains.length === 0 && window.domainPlotInstancesData) {
        for (const k of Object.keys(window.domainPlotInstancesData)) {
          const inst = window.domainPlotInstancesData[k];
          if (inst && inst.proteinName === name && inst.alphafoldDomains && Array.isArray(inst.alphafoldDomains)) {
            afDomains = inst.alphafoldDomains.map(d => ({
              ...d,
              type: 'alphafold'
            }));
            break;
          }
        }
      }

      // --- UniProt ("other") domains (draw above AlphaFold) ---
      const otherDomains = domains.filter(domain => domain.type === 'other' || !domain.type);
      // Draw AlphaFold domains (below)
      afDomains.forEach(domain => {
        const dStart = Math.max(1, domain.start);
        const dEnd = Math.min(seqLen, domain.end);
        if (dEnd < dStart) return;
        const denominator = seqLen > 1 ? seqLen - 1 : 1;
        const segStart = angles[name].start + ((dStart - 1) / denominator) * arcSpan;
        const segEnd = angles[name].start + ((dEnd - 1) / denominator) * arcSpan;
        const segColor = '#8ecae6'; // Light blue for AlphaFold domains

        const segStartRad = segStart * Math.PI / 180;
        const segEndRad = segEnd * Math.PI / 180;
        const largeArcSeg = segEnd - segStart <= 180 ? 0 : 1;

        const outerX1s = Math.cos(segStartRad) * arcOuter;
        const outerY1s = Math.sin(segStartRad) * arcOuter;
        const innerX1s = Math.cos(segStartRad) * arcInner;
        const innerY1s = Math.sin(segStartRad) * arcInner;
        const outerX2s = Math.cos(segEndRad) * arcOuter;
        const outerY2s = Math.sin(segEndRad) * arcOuter;
        const innerX2s = Math.cos(segEndRad) * arcInner;
        const innerY2s = Math.sin(segEndRad) * arcInner;

        const arcSeg = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        arcSeg.setAttribute('d', `
          M ${outerX1s} ${outerY1s}
          A ${arcOuter} ${arcOuter} 0 ${largeArcSeg} 1 ${outerX2s} ${outerY2s}
          L ${innerX2s} ${innerY2s}
          A ${arcInner} ${arcInner} 0 ${largeArcSeg} 0 ${innerX1s} ${innerY1s}
          Z
        `);
        arcSeg.setAttribute('fill', segColor);
        arcSeg.setAttribute('opacity', '0.5'); // Reduced opacity
        arcSeg.setAttribute('stroke', 'none');
        g.appendChild(arcSeg);

        // --- DOMAIN NAME HOVER LABEL ---
        // Compute mid-angle for label
        const midAngle = (segStart + segEnd) / 2;
        const [labelX, labelY] = polar(midAngle, (arcOuter + arcInner) / 2);
        let domainLabelText = domain.name || domain.id || '';
        // Remove trailing _number and replace underscores with spaces
        domainLabelText = domainLabelText.replace(/_\d+$/, '').replace(/_/g, ' ');
        const domainLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        domainLabel.setAttribute('x', labelX);
        domainLabel.setAttribute('y', labelY);
        domainLabel.setAttribute('text-anchor', 'middle');
        domainLabel.setAttribute('dominant-baseline', 'middle');
        domainLabel.setAttribute('font-size', '11');
        domainLabel.setAttribute('font-weight', 'bold');
        domainLabel.setAttribute('fill', '#222');
        domainLabel.setAttribute('visibility', 'hidden');
        domainLabel.textContent = domainLabelText;
        g.appendChild(domainLabel);

        arcSeg.addEventListener('mouseover', () => {
          g.appendChild(domainLabel); // Move label to top
          domainLabel.setAttribute('visibility', 'visible');
        });
        arcSeg.addEventListener('mouseout', () => {
          domainLabel.setAttribute('visibility', 'hidden');
        });
      });

      // Draw UniProt/other domains (above)
      otherDomains.forEach(domain => {
        const dStart = Math.max(1, domain.start);
        const dEnd = Math.min(seqLen, domain.end);
        if (dEnd < dStart) return;
        const denominator = seqLen > 1 ? seqLen - 1 : 1;
        const segStart = angles[name].start + ((dStart - 1) / denominator) * arcSpan;
        const segEnd = angles[name].start + ((dEnd - 1) / denominator) * arcSpan;
        const segColor = domainColorMap[domain.baseId || domain.id] || color;

        const segStartRad = segStart * Math.PI / 180;
        const segEndRad = segEnd * Math.PI / 180;
        const largeArcSeg = segEnd - segStart <= 180 ? 0 : 1;

        const outerX1s = Math.cos(segStartRad) * arcOuter;
        const outerY1s = Math.sin(segStartRad) * arcOuter;
        const innerX1s = Math.cos(segStartRad) * arcInner;
        const innerY1s = Math.sin(segStartRad) * arcInner;
        const outerX2s = Math.cos(segEndRad) * arcOuter;
        const outerY2s = Math.sin(segEndRad) * arcOuter;
        const innerX2s = Math.cos(segEndRad) * arcInner;
        const innerY2s = Math.sin(segEndRad) * arcInner;

        const arcSeg = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        arcSeg.setAttribute('d', `
          M ${outerX1s} ${outerY1s}
          A ${arcOuter} ${arcOuter} 0 ${largeArcSeg} 1 ${outerX2s} ${outerY2s}
          L ${innerX2s} ${innerY2s}
          A ${arcInner} ${arcInner} 0 ${largeArcSeg} 0 ${innerX1s} ${innerY1s}
          Z
        `);
        arcSeg.setAttribute('fill', segColor);
        arcSeg.setAttribute('opacity', '0.5'); // Reduced opacity
        arcSeg.setAttribute('stroke', 'none');
        g.appendChild(arcSeg);

        // --- DOMAIN NAME HOVER LABEL ---
        // Compute mid-angle for label
        const midAngle = (segStart + segEnd) / 2;
        const [labelX, labelY] = polar(midAngle, (arcOuter + arcInner) / 2);
        let domainLabelText = domain.name || domain.id || '';
        // Remove trailing _number and replace underscores with spaces
        domainLabelText = domainLabelText.replace(/_\d+$/, '').replace(/_/g, ' ');
        const domainLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        domainLabel.setAttribute('x', labelX);
        domainLabel.setAttribute('y', labelY);
        domainLabel.setAttribute('text-anchor', 'middle');
        domainLabel.setAttribute('dominant-baseline', 'middle');
        domainLabel.setAttribute('font-size', '11');
        domainLabel.setAttribute('font-weight', 'bold');
        domainLabel.setAttribute('fill', '#222');
        domainLabel.setAttribute('visibility', 'hidden');
        domainLabel.textContent = domainLabelText;
        g.appendChild(domainLabel);

        arcSeg.addEventListener('mouseover', () => {
          g.appendChild(domainLabel); // Move label to top
          domainLabel.setAttribute('visibility', 'visible');
        });
        arcSeg.addEventListener('mouseout', () => {
          domainLabel.setAttribute('visibility', 'hidden');
        });
      });
    }

    // Arc path (narrower, fallback if no domains or not showing domains)
    const startRad = start * Math.PI / 180;
    const endRad = end * Math.PI / 180;
    const largeArc = end - start <= 180 ? 0 : 1;

    const outerX1 = Math.cos(startRad) * arcOuter;
    const outerY1 = Math.sin(startRad) * arcOuter;
    const innerX1 = Math.cos(startRad) * arcInner;
    const innerY1 = Math.sin(startRad) * arcInner;
    const outerX2 = Math.cos(endRad) * arcOuter;
    const outerY2 = Math.sin(endRad) * arcOuter;
    const innerX2 = Math.cos(endRad) * arcInner;
    const innerY2 = Math.sin(endRad) * arcInner;

    // Only draw the fallback arc if not showing domains or no domains for this protein
    if (!(showDomainsOnArcs && domainColorMap && domainRanges && domainRanges[name] && domainRanges[name].length > 0)) {
      const arc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      arc.setAttribute('d', `
        M ${outerX1} ${outerY1}
        A ${arcOuter} ${arcOuter} 0 ${largeArc} 1 ${outerX2} ${outerY2}
        L ${innerX2} ${innerY2}
        A ${arcInner} ${arcInner} 0 ${largeArc} 0 ${innerX1} ${innerY1}
        Z
      `);
      arc.setAttribute('fill', color);
      arc.setAttribute('opacity', '0.8');
      g.appendChild(arc);
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