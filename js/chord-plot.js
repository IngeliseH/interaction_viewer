import { createSvgElement, createProteinLabel, createHoverLabel, createArcPath, 
         createGradient, setupHoverEffect, getArcAngles,
         createDomainPath, calculateChordAngles, createLabelGroup, createChordGroup } from './plot-utility.js';
import { createInteractionLink, loadTableData } from './table.js';
import { loadProteinMetadata } from './data.js';
import * as filter from './filter.js';

const palettes = [
  "#66c2a5", "#fc8d62", "#8da0cb", "#e78ac3", "#a6d854", "#ffd92f", "#e5c494", "#b3b3b3",
  "#1b9e77", "#d95f02", "#7570b3", "#e7298a", "#66a61e", "#e6ab02", "#a6761d", "#666666"
];

function polar(theta, radius) {
  const rad = theta * Math.PI / 180;
  return [Math.cos(rad) * radius, Math.sin(rad) * radius];
}

export async function initializeChordPlotCombined({
    containerSelector = '.chord-plot-container',
    data = null,
    size = 500,
    queryProteins = [],
    arcColoringMode = 'default',
    coloringMode = 'gradient',
    showDomainsOnArcs = false,
    expandQuery = false
} = {}) {
    const containerEl = document.querySelector(containerSelector);
    if (!containerEl) return;

    containerEl.innerHTML = `<p style="text-align:center; color:grey; padding-top: 20px;">Loading interaction data for chord plot...</p>`;

    try {
        if (!data) {
            const allData = await loadTableData();
            data = filter.getFilteredData ? filter.getFilteredData() : allData;
        }

        if (!data || data.length === 0) {
            containerEl.innerHTML = `<p style="text-align:center; color:grey; padding-top: 20px;">No data available for chord plot.</p>`;
            return;
        }

        if (queryProteins.length === 2) {
            data = data.map(row => ({
                ...row,
                Protein1: row.Protein1 || row.protein1,
                Protein2: row.Protein2 || row.protein2,
                absolute_location: row.absolute_location || row.location
            }));
        }

        await drawChordPlot(data, containerSelector, {
            size,
            queryProteins,
            coloringMode,
            arcColoringMode,
            showDomainsOnArcs,
            expandQuery
        });
    } catch (error) {
        console.error('Error initializing chord plot:', error);
        containerEl.innerHTML = `<p style="text-align:center; color:red; padding-top: 20px;">Could not load chord plot: ${error.message}</p>`;
    }
}


export async function drawChordPlot(data, containerSelector, opts = {}) {
  if (!Array.isArray(data)) {
    const container = document.querySelector(containerSelector);
    if (container) {
      container.innerHTML = `<p style="text-align:center; color:red; padding-top: 20px;">Error: Chord plot data is not an array.</p>`;
    }
    console.error("[ChordPlot] Data passed is not an array:", data);
    return;
  }

  const {
    size = 500,
    padAngle = 2,
    coloringMode = 'byProtein1',
    queryProteins = [],
    expandQuery = false,
    showDomainsOnArcs = false,
    arcColoringMode = 'default'
  } = opts;

  console.log("[ChordPlot] Received data rows for plotting:", data.length);

  if (data.length === 0) {
    const container = document.querySelector(containerSelector);
    if (container) {
      container.innerHTML = `<p style="text-align:center; color:grey; padding-top: 20px;">No interactions to display in chord plot.</p>`;
    }
    console.log("[ChordPlot] No data to plot, aborting.");
    return;
  }

  const filteredData = queryProteins.length > 0
    ? data.filter(row => queryProteins.includes(row.Protein1) || queryProteins.includes(row.Protein2))
    : data;
  console.log("[ChordPlot] Filtered data rows:", filteredData.length);

  const allProteinLengths = await loadProteinMetadata();

  const proteins = {};
  const proteinNames = [...new Set(filteredData.flatMap(d => [d.Protein1 || d.protein1, d.Protein2 || d.protein2]))].filter(Boolean);

  proteinNames.forEach(name => {
    const proteinData = allProteinLengths.get(name) || {};
    proteins[name] = { name: name, length: proteinData.length || 0 };
  });

  const proteinList = Object.values(proteins);
  const names = proteinList.map(p => p.name);
  const seqLens = proteinList.reduce((acc, p) => {
    acc[p.name] = p.length || 100;
    return acc;
  }, {});
  
  const ifaceData = filteredData.map(row => {
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

    const arr1 = absKeys['protein1'] || absKeys['chaina'] || absKeys['chain a'] || [];
    const arr2 = absKeys['protein2'] || absKeys['chainb'] || absKeys['chain b'] || [];

    const res1 = (Array.isArray(arr1) && arr1.length > 0) ? [Math.min(...arr1), Math.max(...arr1)] : [];
    const res2 = (Array.isArray(arr2) && arr2.length > 0) ? [Math.min(...arr2), Math.max(...arr2)] : [];
    if (!(res1.length && res2.length)) {
    }
    return {
      protein1: p1,
      protein2: p2,
      res1,
      res2
    };
  }).filter(d => d.res1.length && d.res2.length);
  
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

  const { angles, namesOrdered } = getArcAngles(names, seqLens, { 
    padAngle, 
    queryProteins, 
    expandQuery 
  });
  
  const arcOuter = size * 0.38;
  const arcInner = size * 0.32;

  drawArcs({ namesOrdered, angles, seqLens, g, arcInner, arcOuter, palettes, showDomainsOnArcs, arcColoringMode }, allProteinLengths, queryProteins);
  drawChords({ ifaceData, angles, seqLens, g, arcInner, defs, data: filteredData, names, palettes, coloringMode, queryProteins });
}

async function drawArcs(config, proteinMetadata, queryProteins) {
  const { namesOrdered, angles, seqLens, g, arcInner, arcOuter, palettes, showDomainsOnArcs, arcColoringMode } = config;

  const labelGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');

  for (const name of namesOrdered) {
    const { start, end } = angles[name];
    const proteinData = queryProteins.includes(name) ? proteinMetadata.get(name) : null;
    const domains = showDomainsOnArcs && proteinData ? [
      ...(proteinData.alphafoldDomains || []).map(d => ({ ...d, type: 'alphafold' })),
      ...(proteinData.uniprotDomains || []).map(d => ({ ...d, type: 'uniprot' }))
    ] : null;

    const baseArc = createArcPath(start, end, arcInner, arcOuter);

    if (!showDomainsOnArcs || !domains || domains.length === 0) {
      if (arcColoringMode === 'greyOnly') {
        const greyShade = namesOrdered.indexOf(name) === 0 ? '#888888' : '#CCCCCC';
        baseArc.setAttribute('fill', greyShade);
      } else {
        const proteinColor = palettes[namesOrdered.indexOf(name) % palettes.length];
        baseArc.setAttribute('fill', proteinColor);
      }
      baseArc.setAttribute('opacity', '0.85');
    } else {
      baseArc.setAttribute('fill', '#cccccc');
      baseArc.setAttribute('opacity', '0.7');
    }
    g.appendChild(baseArc);

    if (showDomainsOnArcs && domains && domains.length > 0) {
      drawDomains(name, domains, start, end, seqLens, arcInner, arcOuter, g);
    }

    const manyProteins = namesOrdered.length > 20;
    const midAngle = (start + end) / 2;
    const labelRadius = arcOuter + (manyProteins ? 7 : 25);

    const [lx, ly] = polar(midAngle, labelRadius);
    const labelAngle = manyProteins ? (midAngle > 90 && midAngle < 270 ? midAngle + 180 : midAngle) : 0;
    let textAnchor;
    if (manyProteins) {
      textAnchor = midAngle > 90 && midAngle < 270 ? 'end' : 'start';
    } else {
      if (midAngle > -67.5 && midAngle <= 67.5) {
        textAnchor = 'start';
      } else if (midAngle > 112.5 && midAngle <= 247.5) {
        textAnchor = 'end';
      } else {
        textAnchor = 'middle';
      }
    }
    const label = createProteinLabel(name, lx, ly, { angle: labelAngle, fontSize: manyProteins ? 12 : 15, textAnchor: textAnchor });
    labelGroup.appendChild(label);

    const [ex, ey] = polar(end, arcOuter + 1);
    const endLabel = createProteinLabel(seqLens[name], ex, ey, { fontSize: manyProteins ? 7 : 12 });
    labelGroup.appendChild(endLabel);
  }

  g.appendChild(labelGroup);
}

function drawDomains(name, domains, start, end, seqLens, arcInner, arcOuter, g) {
  if (domains && domains.length > 0) {
    domains.forEach(domain => {
      const domainPathResult = createDomainPath(domain, start, end, seqLens[name], arcInner, arcOuter);
      if (!domainPathResult) return;

      const { path: segPath, start: segStart, end: segEnd } = domainPathResult;
      const midAngle = (segStart + segEnd) / 2;
      const [labelX, labelY] = polar(midAngle, (arcOuter + arcInner) / 2);
      const domainText = (domain.name || domain.id || '').replace(/_\d+$/, '').replace(/_/g, ' ');
      const label = createHoverLabel(domainText, labelX, labelY, { bold: true });

      setupHoverEffect(segPath, [label], g);
      g.appendChild(segPath);
      g.appendChild(label);
    });
  }
}

function drawChords(config) {
  const { ifaceData, angles, seqLens, g, arcInner, defs, data, names, palettes, coloringMode, queryProteins } = config;

  ifaceData.forEach((iface, i) => {
    const { protein1, protein2, res1, res2 } = iface;

    const chordAngles = calculateChordAngles(protein1, protein2, res1, res2, angles, seqLens);
    const { label1StartAngle, label1EndAngle, label2StartAngle, label2EndAngle } = 
      createLabelGroup(chordAngles);

    const [x1s, y1s] = polar(chordAngles.pos1Start, arcInner);
    const [x1e, y1e] = polar(chordAngles.pos1End, arcInner);
    const [x2s, y2s] = polar(chordAngles.pos2Start, arcInner);
    const [x2e, y2e] = polar(chordAngles.pos2End, arcInner);

    const midAngle = (chordAngles.pos1Start + chordAngles.pos2End) / 2;
    const [cx, cy] = polar(midAngle, 0);

    const startPoints = [[x1s, y1s], [x1e, y1e]];
    const endPoints = [[x2s, y2s], [x2e, y2e]];
    const controlPoint = [cx, cy];

    let chordColor;
    switch (coloringMode) {
      case 'gradient':
        const gradientId = `grad-${i}`;
        const midAngle1 = (chordAngles.pos1Start + chordAngles.pos1End) / 2;
        const midAngle2 = (chordAngles.pos2Start + chordAngles.pos2End) / 2;
        const [m1x, m1y] = polar(midAngle1, arcInner);
        const [m2x, m2y] = polar(midAngle2, arcInner);
        const colorP1 = palettes[names.indexOf(protein1) % palettes.length];
        const colorP2 = palettes[names.indexOf(protein2) % palettes.length];
        
        const gradient = createGradient(gradientId, m1x, m1y, m2x, m2y, colorP2, colorP1);
        defs.appendChild(gradient);
        chordColor = `url(#${gradientId})`;
        break;
      case 'byPartner':
        const partner = queryProteins.includes(protein1) ? protein2 : protein1;
        chordColor = palettes[names.indexOf(partner) % palettes.length];
        break;
      case 'varied':
        chordColor = palettes[i % palettes.length];
        break;
    }

    const path = createChordGroup(startPoints, endPoints, controlPoint, chordColor);

    const labelElems = [
      createHoverLabel(res1[0], ...polar(label1StartAngle, arcInner), { bold: true }),
      createHoverLabel(res1[1], ...polar(label1EndAngle, arcInner), { bold: true }),
      createHoverLabel(res2[0], ...polar(label2StartAngle, arcInner), { bold: true }),
      createHoverLabel(res2[1], ...polar(label2EndAngle, arcInner), { bold: true })
    ];
  
    let row = data.find(r => {
      const p1 = r.Protein1 || r.protein1;
      const p2 = r.Protein2 || r.protein2;
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

    const interactionLink = createInteractionLink(row)

    path.style.cursor = "pointer";
    path.addEventListener('click', () => {
      window.location.href = interactionLink;
    });

    const interactionGroup = createSvgElement('g');
    interactionGroup.appendChild(path);
    labelElems.forEach(label => interactionGroup.appendChild(label));
  
    setupHoverEffect(path, labelElems);
    g.appendChild(interactionGroup);
  });
}