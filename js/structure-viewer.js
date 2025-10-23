import { parseResidueLocations, loadProteinMetadata } from "./data.js";
import { displayInfo } from "./plot-utility.js";

export async function setUpStructureViewer(urlParams, proteins, proteinData) {
    const { viewerDiv, gridContainer } = _findContainerElements();
    if (!viewerDiv) return;

    if (gridContainer) {
        if (proteins.length !== 2) {
            displayInfo(gridContainer, "Structure grid requires exactly two proteins to compare.", true);
            return;
        }

        await _setUpStructurePickerGrid(gridContainer, viewerDiv, urlParams, proteins[0], proteins[1]);
        return;
    }

    if (proteins.length === 1) {
        const accessionId = proteinData ? proteinData.accessionId : null;
        const pdbUrl = await _getAlphaFoldPdb(viewerDiv, accessionId);
        const domainRanges = proteinData.alphafoldDomains || null;
        _displayStructureInViewer(viewerDiv, pdbUrl, { domainRangesArray: domainRanges, proteinData, proteins });
        return;
    }

    const f1_id = decodeURIComponent(urlParams.get('f1_id') || '');
    const f2_id = decodeURIComponent(urlParams.get('f2_id') || '');

    if (proteins.length != 2 || !f1_id || !f2_id) {
        displayInfo(viewerElement, "Protein/fragment parameters missing.", true);
        return;
    }

    const pdbFiles = await _getPdbFiles();
    const pdbFile = _findPdbFile(pdbFiles, proteins[0], f1_id, proteins[1], f2_id);

    if (!pdbFile) {
        displayInfo(viewerDiv, "PDB file not found for this interaction.");
        return;
    }

    const f1_shift = parseInt(urlParams.get('f1_shift'));
    const f2_shift = parseInt(urlParams.get('f2_shift'));
    const f1_loc = parseResidueLocations(urlParams.get('f1_loc'), f1_shift);
    const f2_loc = parseResidueLocations(urlParams.get('f2_loc'), f2_shift);
    const f1_selection = f1_loc ? {resi: f1_loc, chain: 'A'} : null;
    const f2_selection = f2_loc ? {resi: f2_loc, chain: 'B'} : null;
    const zoomSelection = (f1_selection && f2_selection) ? {or: [f1_selection, f2_selection]} : (f1_selection || f2_selection);
    _displayStructureInViewer(viewerDiv, `structures/${pdbFile}`, {zoomSelection, f1_loc, f2_loc, f1_id, f2_id, proteins});

}

async function _setUpStructurePickerGrid(gridContainer, viewerDiv, urlParams, p1, p2) {
    const f1_id = decodeURIComponent(urlParams.get('f1_id') || '');
    const f2_id = decodeURIComponent(urlParams.get('f2_id') || '');
    const f1Fragments = f1_id ? f1_id.split(',').map(f => f.trim()).filter(f => f) : null;
    const f2Fragments = f2_id ? f2_id.split(',').map(f => f.trim()).filter(f => f) : null;
    if (f1Fragments.length === 0 || f2Fragments.length === 0) {
        displayInfo(gridContainer, "Fragment information not available.", true);
        return;
    }

    const [proteinForX, fragmentsForX, proteinForY, fragmentsForY] = 
        f1Fragments.length < f2Fragments.length 
            ? [p2, f2Fragments, p1, f1Fragments]
            : [p1, f1Fragments, p2, f2Fragments];
    const pdbFiles = await _getPdbFiles();

    const proteinMetadata = await loadProteinMetadata();

    gridContainer.innerHTML = '';

    const proteinXLabel = document.createElement('div');
    proteinXLabel.className = 'structure-grid-protein-x-label';
    proteinXLabel.textContent = proteinForX;
    gridContainer.appendChild(proteinXLabel);

    const yLabelTableContainer = document.createElement('div');
    yLabelTableContainer.className = 'structure-grid-y-label-table-container';
    gridContainer.appendChild(yLabelTableContainer);

    const proteinYLabel = document.createElement('div');
    proteinYLabel.className = 'structure-grid-protein-y-label';
    proteinYLabel.textContent = proteinForY;
    yLabelTableContainer.appendChild(proteinYLabel);

    const table = document.createElement('table');
    table.className = 'structure-grid';
    yLabelTableContainer.appendChild(table);

    const headerRow = table.insertRow();
    headerRow.appendChild(document.createElement('th'));
    fragmentsForX.forEach(fX => {
        const th = document.createElement('th');
        th.className = 'structure-grid-col-header';
        th.textContent = fX;
        headerRow.appendChild(th);
    });

    fragmentsForY.forEach(fY => {
        const row = table.insertRow();
        const rowHeader = document.createElement('th');
        rowHeader.className = 'structure-grid-row-header';
        rowHeader.textContent = fY;
        row.appendChild(rowHeader);
        
        fragmentsForX.forEach(fX => {
            const cell = row.insertCell();
            cell.className = 'structure-grid-cell';

            const pdbFile = _findPdbFile(pdbFiles, proteinForX, fX, proteinForY, fY);
            const filePath = pdbFile ? `structures/${pdbFile}` : "";

            const button = document.createElement('button');
            button.className = 'structure-cell-btn';
            button.dataset.file = filePath;

            if (filePath) {
                button.title = `View structure for ${proteinForX} F${fX} + ${proteinForY} F${fY}`;
                button.innerHTML = '&#128269;'; // Magnifying glass
            } else {
                button.title = `Structure not available for ${proteinForX} F${fX} + ${proteinForY} F${fY}`;
                button.innerHTML = '&#10060;'; // Cross mark
                button.disabled = true;
            }

            button.dataset.fX = fX;
            button.dataset.fY = fY;

            cell.appendChild(button);
        });
    }); 

    gridContainer.addEventListener('click', function(event) {
        const button = event.target.closest('.structure-cell-btn');
        if (!button || button.disabled) {return};

        const currentlySelected = gridContainer.querySelector('.structure-grid-cell.selected');
        if (currentlySelected) {currentlySelected.classList.remove('selected')};

        const cell = button.closest('.structure-grid-cell');
        if (cell) {cell.classList.add('selected')};

        if (button.dataset.file && viewerDiv) {
            _displayStructureInViewer(viewerDiv, button.dataset.file, {proteins: [proteinForX, proteinForY], f1_id: button.dataset.fX, f2_id: button.dataset.fY, proteinMetadata});
        }
    });
}

function _findContainerElements() {
    const viewerDiv = document.getElementById('structure-viewer');
    const gridContainer = document.getElementById('structure-grid-container');
    const fallback = document.getElementById('structure-viewer-fallback');
    if (!viewerDiv) {
        displayInfo(fallback, "Structure viewer component missing from page.", true);
    }
    return { viewerDiv, gridContainer };
}

async function _getAlphaFoldPdb(container, accessionId) {
    try {
        const afResponse = await fetch(`https://alphafold.ebi.ac.uk/api/prediction/${accessionId}`);
        if (!afResponse.ok) {
            displayInfo(container, `Error fetching AlphaFold API: ${afResponse.status} ${afResponse.statusText}`, true);
            return;
        }
        const afData = await afResponse.json();

        if (!afData || afData.length == 0 || !afData[0].pdbUrl) {
            displayInfo(container, 'PDB URL not found in AlphaFold API response.', true);
            return;
        }
        return afData[0].pdbUrl
    } catch (error) {
        displayInfo(container, `Error fetching/loading AlphaFold PDB URL: ${error.message}`, true);
    }
}

function _findPdbFile(pdbFiles, p1, f1, p2, f2) {
    const prefix1 = `${p1}_F${f1}_${p2}_F${f2}`;
    const prefix2 = `${p2}_F${f2}_${p1}_F${f1}`;
    return pdbFiles.find(f => f.startsWith(prefix1) || f.startsWith(prefix2));
}

async function _getPdbFiles() {
        try {
        const response = await fetch('structures/pdb_files.txt');
        if (!response.ok) {
            throw new Error('Could not fetch structures/pdb_files.txt. Please ensure it exists.');
        }
        const fileListText = await response.text();
        return fileListText.split('\n').filter(f => f.endsWith('.pdb'));
    } catch (error) {
        console.error('Error fetching PDB file list:', error);
                        throw error;
    }
}

function _isValidDomainRanges(ranges) {
    return Array.isArray(ranges) && ranges.length > 0 &&
        ranges.every(r => r && typeof r.start === 'number' && typeof r.end === 'number' &&
            !isNaN(r.start) && !isNaN(r.end) && r.start > 0 && r.end >= r.start);
}

function _getDomainColor(atom, useDomainColoring, ranges) {
    if (useDomainColoring && atom.chain === 'A' && Array.isArray(ranges)) {
        for (const range of ranges) {
            if (atom.resi >= range.start && atom.resi <= range.end) {
                return 'dodgerblue';
            }
        }
    }
    return 'ghostwhite';
}

function _createButton(iconClass, text, title, clickHandler) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'control-button';
    button.title = title;
    button.innerHTML = `<i class="fas ${iconClass}"></i> ${text}`;
    button.addEventListener('click', clickHandler);
    return button;
}

function _setupStructureViewerControls(placeholder, callbacks) {
    if (!placeholder) return null;

    placeholder.innerHTML = '';

    const controlBar = document.createElement('div');
    controlBar.className = 'control-bar';

    const buttonGroup = document.createElement('div');
    buttonGroup.className = 'control-button-group';

    const resetButton = _createButton('fa-undo', 'Reset', 'Reset View', callbacks.onReset);
    const atomsButton = _createButton('fa-grip-lines', 'Atoms', 'Atoms', callbacks.onToggleAtoms);
    const surfaceButton = _createButton('fa-layer-group', 'Surface', 'Surface', callbacks.onToggleSurface);
    const colorModeButton = _createButton('fa-palette', 'Spectrum', 'Toggle Color Mode', callbacks.onToggleColorMode);

    buttonGroup.append(resetButton, atomsButton, surfaceButton, colorModeButton);
    controlBar.appendChild(buttonGroup);
    
    const controlsContainer = document.createElement('div');
    controlsContainer.className = 'structure-controls';
    controlsContainer.appendChild(controlBar);
    placeholder.appendChild(controlsContainer);

    return {
        container: controlsContainer,
        atomsBtn: atomsButton,
        surfaceBtn: surfaceButton,
        colorModeBtn: colorModeButton
    };
}

function _createColorKeyLegend(keyPlaceholder, proteins, location) {
    keyPlaceholder.innerHTML = '';
    const keyContainer = document.createElement('div');
    keyContainer.className = 'structure-key';

    const createProteinKey = (color, text, interactionColor) => {
        const proteinKey = document.createElement('div');
        proteinKey.className = 'structure-key-protein';
        proteinKey.innerHTML = `
            <div class="structure-key-item">
                <span class="structure-key-color" style="background-color:${color};"></span> ${text}
            </div>
            ${interactionColor ? `<div class="structure-key-item">
                <span class="structure-key-color" style="background-color:${interactionColor};"></span> interaction region
            </div>` : ''}
        `;
        return proteinKey;
    };

    keyContainer.appendChild(createProteinKey('lightcoral', proteins[0], location ? 'red' : null));
    keyContainer.appendChild(createProteinKey('lightskyblue', proteins[1], location ? 'blue' : null));
    keyPlaceholder.appendChild(keyContainer);
}

function _createResidueSpan(resCode, resi, inFragment, protein, handlers) {
    const span = document.createElement('span');
    span.textContent = resCode;
    span.dataset.resi = resi;
    span.dataset.protein = protein;
    span.dataset.region = 'mid';
    span.style.color = inFragment ? '' : 'lightgray';
    if (inFragment) {
        span.style.cursor = 'pointer';
        span.addEventListener('mousedown', handlers.onMouseDown);
        span.addEventListener('mouseenter', handlers.onMouseEnter);
    }
    return span;
}

function _renderSequenceRow({proteinSeqDiv, seq, rowStart, fragStart, fragEnd, protein, handlers}) {
    const ROW_SIZE = 100;
    const GROUP_SIZE = 5;
    const rowEnd = Math.min(seq.length, rowStart + ROW_SIZE - 1);
    const rowPre = document.createElement('pre');
    Object.assign(rowPre.style, {
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
        wordBreak: 'break-word',
        fontFamily: 'monospace',
        fontSize: '13px',
        margin: '0 0 2px 0',
        userSelect: 'none'
    });

    const label = document.createElement('span');
    label.style.color = '#666';
    label.textContent = String(rowStart).padStart(5, ' ') + '  ';
    rowPre.appendChild(label);

    for (let resi = rowStart; resi <= rowEnd; resi++) {
        const inFragment = resi >= fragStart && resi <= fragEnd;
        rowPre.appendChild(_createResidueSpan(seq[resi - 1], resi, inFragment, protein, handlers));
        if ((resi - rowStart + 1) % GROUP_SIZE === 0 && resi < rowEnd) {
            rowPre.appendChild(document.createTextNode(' '));
        }
    }

    proteinSeqDiv.appendChild(rowPre);
}

function _renderProteinSequence({sequencePlaceholder, proteins, fragmentIds, proteinMetadata, viewer, structureConfig}) {
    sequencePlaceholder.innerHTML = '';

    const section = document.createElement('div');
    section.className = 'collapsible-subsection collapsed';
    section.id = 'protein-sequence-collapsible-section';

    const titleDiv = document.createElement('div');
    titleDiv.className = 'collapsible-subsection-title';
    titleDiv.innerHTML = `
        <h4>${proteins.length > 1 ? 'Protein sequences' : 'Protein sequence'}</h4>
        <i class="fas fa-chevron-up"></i>
    `;
    titleDiv.addEventListener('click', () => section.classList.toggle('collapsed'));
    section.appendChild(titleDiv);

    const contentDiv = document.createElement('div');
    contentDiv.className = 'collapsible-subsection-content';
    section.appendChild(contentDiv);

    let activeHighlights = [];

    proteins.forEach((protein, idx) => {
        const proteinInfo = proteinMetadata.get(protein) || {};
        const seq = proteinInfo.sequence || '';
        const [fragStartRaw = 0, fragEndRaw = 0] = (proteinInfo.fragmentIndices?.[fragmentIds?.[idx] - 1] || [0, 0]);
        const hasFragment = fragStartRaw > 0 && fragEndRaw >= fragStartRaw;
        const fragStart = hasFragment ? Math.max(1, fragStartRaw) : 1;
        const fragEnd = hasFragment ? Math.min(seq.length, fragEndRaw) : seq.length;

        const proteinSeqDiv = document.createElement('div');
        proteinSeqDiv.className = 'protein-sequence-block';

        const header = document.createElement('h4');
        header.textContent = protein;
        header.style.textAlign = 'center';
        proteinSeqDiv.appendChild(header);

        let selecting = false;
        let anchorRes = null;
        let currentRes = null;

        const clearSelection = () =>
            proteinSeqDiv.querySelectorAll(`span[data-protein="${protein}"][data-region="mid"]`)
                .forEach(s => s.style.backgroundColor = '');

        const applySelection = (a, b) => {
            if (a == null || b == null) return;
            const start = Math.max(fragStart, Math.min(a, b));
            const end = Math.min(fragEnd, Math.max(a, b));
            proteinSeqDiv.querySelectorAll(`span[data-protein="${protein}"][data-region="mid"]`)
                .forEach(s => {
                    const r = parseInt(s.dataset.resi, 10);
                    s.style.backgroundColor = (r >= start && r <= end) ? '#fff3a1' : '';
                });
        };

        const onMouseDown = (e) => {
            e.preventDefault();
            clearSelection();
            _restoreStructureViewerHighlightedResidues(viewer, activeHighlights);
            activeHighlights = [];
            const resi = parseInt(e.currentTarget.dataset.resi, 10);
            selecting = true;
            anchorRes = currentRes = resi;
            applySelection(anchorRes, currentRes);

            const onUp = () => {
                if (!selecting) return;
                selecting = false;
                document.removeEventListener('mouseup', onUp);
                const start = Math.max(fragStart, Math.min(anchorRes, currentRes));
                const end = Math.min(fragEnd, Math.max(anchorRes, currentRes));
                window.sequenceSelectedRange = { protein, start, end };

                const chain = idx === 0 ? 'A' : 'B';
                if (viewer) {
                    const residues = [];
                    for (let r = start; r <= end; r++) {
                        residues.push({ chain: chain, resi: r-fragStart+1, resn: seq[r - 1] });
                    }
                    activeHighlights = residues;
                    _highlightStructureViewerResidues(structureConfig, residues, {showLabels: false});
                }
            };
            document.addEventListener('mouseup', onUp);
        };

        const onMouseEnter = (e) => {
            if (!selecting) return;
            currentRes = parseInt(e.currentTarget.dataset.resi, 10);
            applySelection(anchorRes, currentRes);
        };

        const handlers = { onMouseDown, onMouseEnter };

        for (let rowStart = 1; rowStart <= seq.length; rowStart += 100) {
            _renderSequenceRow({proteinSeqDiv, protein, seq, rowStart, fragStart, fragEnd, handlers});
        }

        const spacer = document.createElement('div');
        spacer.style.height = '6px';
        proteinSeqDiv.appendChild(spacer);

        contentDiv.appendChild(proteinSeqDiv);
    });

    sequencePlaceholder.appendChild(section);
}

function _highlightStructureViewerResidues(structureConfig, residues, {showLabels = true}) {
    const { viewer, atomsShown, f1_loc, f2_loc, f1_shift, f2_shift, styles } = structureConfig;
    const highlightStyle = {cartoon: { color: 'yellow', thickness: 1.5 }, stick: { color: 'yellow', radius: 0.4 }};
    const appliedLabels = [];

    residues.forEach(res => {
        const { chain, resi } = res;
        const shift = chain === 'A' ? f1_shift : f2_shift;
        const residueInfo = `${res.resn} ${resi + shift}`;

        res._origSelection = { chain, resi, byres: true };
        res._origAtomsShown = atomsShown;
        res._origWasInteraction =
            (f1_loc && chain === 'A' && f1_loc.includes(resi.toString())) ||
            (f2_loc && chain === 'B' && f2_loc.includes(resi.toString()));
        res._origStyle = styles;

        const atomList = viewer.selectedAtoms({ chain, resi });
        if (atomList.length > 0 && showLabels) {
            const label = viewer.addLabel(residueInfo, {position: atomList[0], fontSize: 14});
            appliedLabels.push(label);
        }

        viewer.setStyle(res._origSelection, highlightStyle);
    });

    viewer.render();
    return appliedLabels;
}

function _restoreStructureViewerHighlightedResidues(viewer, residues) {
    if (!viewer || !residues?.length) return;

    residues.forEach(res => {
        const selection = res._origSelection || { chain: res.chain, resi: res.resi, byres: true };
        let restoreStyle;

        if (res._origWasInteraction && !res._origAtomsShown) {
            restoreStyle = {
                cartoon: { color: res.chain === 'A' ? 'red' : 'blue', thickness: 1.0 },
                stick: { color: res.chain === 'A' ? 'red' : 'blue', radius: 0.2 }
            };
        } else {
            restoreStyle = res._origStyle || {};
            if (!res._origAtomsShown) delete restoreStyle.stick;
        }

        viewer.setStyle(selection, restoreStyle);

        delete res._origSelection;
        delete res._origAtomsShown;
        delete res._origWasInteraction;
        delete res._origStyle;
    });

    viewer.render();
}
  
function _setupResidueHover(structureConfig) {
    const { viewer } = structureConfig;

    viewer.setHoverable({}, true,
        function (atom, viewerInstance) {
            if (atom._hoverActive) return;
            atom._hoverActive = true;

            const residue = {chain: atom.chain, resi: atom.resi, resn: atom.resn};
            atom._hoverLabels = _highlightStructureViewerResidues(structureConfig, [residue], {});
            atom._hoverResidue = residue;
        },

        function (atom, viewerInstance) {
            if (!atom._hoverActive) return;
            atom._hoverActive = false;

            if (atom._hoverLabels) {
                atom._hoverLabels.forEach(label => viewerInstance.removeLabel(label));
                delete atom._hoverLabels;
            }

            if (atom._hoverResidue) {
                _restoreStructureViewerHighlightedResidues(viewerInstance, [atom._hoverResidue]);
                delete atom._hoverResidue;
            }
        }
    );
}

function _applyViewerState(structureConfig) {
    const { viewer, modelLoaded, atomsShown, surfaceShown, colorMode, useDomainColoring, domainRangesArray, f1_loc, f2_loc } = structureConfig;
    if (!modelLoaded) return;
    viewer.setStyle({}, {});
    viewer.removeAllSurfaces();

    let styles;
    if (colorMode === 'spectrum') {
        styles = { cartoon: { color: 'spectrum' } };
        if (atomsShown) {
            styles.stick = { color: 'spectrum', radius: 0.2 };
        }
    } else {
        let colorFunc;
        if (colorMode === 'alphafold') {
            colorFunc = atom => _getDomainColor(atom, useDomainColoring, domainRangesArray);
        } else {
            function baseChainColorFunc(atom) {
                if (f1_loc && atom.chain === 'A' && f1_loc.includes(atom.resi.toString())) return 'red';
                if (f2_loc && atom.chain === 'B' && f2_loc.includes(atom.resi.toString())) return 'blue';
                if (atom.chain === 'A') return 'lightcoral';
                if (atom.chain === 'B') return 'lightskyblue';
                return 'lightgray';
            }
            colorFunc = atom => baseChainColorFunc(atom);
        }
        styles = { cartoon: { colorfunc: colorFunc } };
        if (atomsShown) {
            styles.stick = { colorfunc: colorFunc, radius: 0.2 };
        }
    }
    viewer.setStyle({}, styles);
    structureConfig.styles = styles;

    if (!atomsShown) {
        const highlightStyle = (color) => ({ cartoon: { color, thickness: 1.0 }, stick: { color, radius: 0.2 } });
        if (f1_loc) viewer.setStyle({ chain: 'A', resi: f1_loc, byres: true }, highlightStyle("red"));
        if (f2_loc) viewer.setStyle({ chain: 'B', resi: f2_loc, byres: true }, highlightStyle("blue"));
    }

    _setupResidueHover(structureConfig);
  
    if (surfaceShown) {
        if (colorMode === 'chain') {
            const surfaceColors = [
                { color: 'lightcoral', sel: { chain: 'A' } },
                { color: 'lightskyblue', sel: { chain: 'B' } },
                { color: 'lightgray', sel: { chain: { $ne: 'A', $ne: 'B' } } }
            ];
            surfaceColors.forEach(s => viewer.addSurface($3Dmol.SurfaceType.VDW, { opacity: 0.7, color: s.color }, s.sel));
        } else {
            viewer.addSurface($3Dmol.SurfaceType.VDW, { opacity: 0.7, color: 'white' });
        }
    }
    viewer.render();
}

export async function _displayStructureInViewer(container, pdbPath, options={}) {
    const {domainRangesArray, zoomSelection, f1_loc, f2_loc, f1_id, f2_id, proteins} = options || {};
    if (!container) return;
    container.innerHTML = '';

    if (!window.$3Dmol) {
        displayInfo(container, "3Dmol.js library not loaded.", true);
        return;
    }
    if (!pdbPath) {
        displayInfo(container, "No PDB path provided.", true);
        const controls = container.getElementById("structure-controls");
        if (controls) controls.style.display = 'none';
        return;
    }
    const controlsPlaceholder = document.getElementById("structure-controls-placeholder");
    const keyPlaceholder = document.getElementById("structure-key-placeholder");
    const sequencePlaceholder = document.getElementById("structure-sequence-placeholder");
    sequencePlaceholder.innerHTML = '';

    let viewer = $3Dmol.createViewer(container, { defaultcolors: $3Dmol.rasmolElementColors });
    const useDomainColoring = _isValidDomainRanges(domainRangesArray);
    const initialColorMode = useDomainColoring ? 'alphafold' : 'chain';

    const proteinMetadata = await loadProteinMetadata();
    const p1Data = proteins && proteins[0] ? proteinMetadata.get(proteins[0]) : null;
    const p2Data = proteins && proteins[1] ? proteinMetadata.get(proteins[1]) : null;
    const f1_shift = (p1Data && f1_id) ? p1Data.fragmentIndices[f1_id-1][0] : 0;
    const f2_shift = (p2Data && f2_id) ? p2Data.fragmentIndices[f2_id-1][0] : 0;

    const structureConfig = {
        viewer,
        f1_loc,
        f2_loc,
        f1_shift,
        f2_shift,
        modelLoaded: false,
        atomsShown: false,
        surfaceShown: false,
        colorMode: initialColorMode,
        useDomainColoring: useDomainColoring,
        domainRangesArray: useDomainColoring ? domainRangesArray : []
    }
    const callbacks = {
        onReset: () => {
            structureConfig.atomsShown = false;
            structureConfig.surfaceShown = false;
            structureConfig.colorMode = initialColorMode;
            _applyViewerState(structureConfig);
            
            if (zoomSelection) {
                viewer.zoomTo(zoomSelection);
            } else {
                viewer.zoomTo();
            }
            viewer.render();
            updateColorModeButtonText();
            controls.atomsBtn.classList.remove('active');
            controls.surfaceBtn.classList.remove('active');
        },
        onToggleAtoms: function() {
            structureConfig.atomsShown = !structureConfig.atomsShown;
            this.classList.toggle('active', structureConfig.atomsShown);
            _applyViewerState(structureConfig);
        },
        onToggleSurface: function() {
            structureConfig.surfaceShown = !structureConfig.surfaceShown;
            this.classList.toggle('active', structureConfig.surfaceShown);
            _applyViewerState(structureConfig);
        },
        onToggleColorMode: () => {
            if (useDomainColoring) {
                structureConfig.colorMode = structureConfig.colorMode === 'alphafold' ? 'spectrum' : 'alphafold';
            } else {
                structureConfig.colorMode = structureConfig.colorMode === 'chain' ? 'spectrum' : 'chain';
            }
            updateColorModeButtonText();
            _applyViewerState(structureConfig);
        }
    };
    const controls = _setupStructureViewerControls(controlsPlaceholder, callbacks);

    const interaction = (f1_loc || f2_loc) ? true : false;
    if (proteins && proteins.length >= 2) {
        _createColorKeyLegend(keyPlaceholder, proteins, interaction);
        }
    const fragmentIds = [f1_id, f2_id];
    _renderProteinSequence({sequencePlaceholder, proteins, interaction, fragmentIds, proteinMetadata, viewer, structureConfig});

    if (controls) controls.container.style.display = 'none';

    function updateColorModeButtonText() {
        if (!controls?.colorModeBtn) return;
        let nextModeText;
        if (useDomainColoring) {
            nextModeText = structureConfig.colorMode === 'alphafold' ? 'Spectrum' : 'AlphaFold domain';
        } else {
            nextModeText = structureConfig.colorMode === 'chain' ? 'Spectrum' : 'By Chain';
        }
        controls.colorModeBtn.innerHTML = `<i class="fas fa-palette"></i> ${nextModeText}`;
    }

    fetch(pdbPath)
        .then(response => {
            if (!response.ok) throw new Error(`PDB file not found at ${pdbPath} (status: ${response.status})`);
            return response.text();
        })
        .then(pdbData => {
            viewer.addModel(pdbData, 'pdb');
            if (zoomSelection) {
                viewer.zoomTo(zoomSelection);
            } else {
                viewer.zoomTo();
            }
            viewer.render();
            structureConfig.modelLoaded = true;
            if (controls) controls.container.style.display = '';
            const fallback = document.getElementById("structure-viewer-fallback")
            if (fallback) fallback.style.display = 'none';
            _applyViewerState(structureConfig);
            updateColorModeButtonText();
        })
        .catch(error => {
            displayInfo(container, `Could not load structure: ${error.message}.`, true);
            if (controls) controls.container.style.display = 'none';
        });
}
