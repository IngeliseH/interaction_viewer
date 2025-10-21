import { parseResidueLocations } from "./data.js";
import { displayInfo } from "./plot-utility.js";

export async function setUpStructureViewer(urlParams, proteins, proteinMetadata) {
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
        const accessionId = proteinMetadata ? proteinMetadata.accessionId : null;
        const pdbUrl = await _getAlphaFoldPdb(viewerDiv, accessionId);
        const domainRanges = proteinMetadata.alphafoldDomains || null;
        _displayStructureInViewer(viewerDiv, pdbUrl, { domainRangesArray: domainRanges });
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

    _displayStructureInViewer(viewerDiv, `structures/${pdbFile}`, {zoomSelection, f1_loc, f2_loc, proteins});

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

            const pdbFile = _findPdbFile(pdbFiles, proteinForX, `F${fX}`, proteinForY, `F${fY}`);
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
            _displayStructureInViewer(viewerDiv, button.dataset.file, {proteins: [p1, p2]});
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
    const prefix1 = `${p1}_${f1}_${p2}_${f2}`;
    const prefix2 = `${p2}_${f2}_${p1}_${f1}`;
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

    if (!atomsShown) {
        const highlightStyle = (color) => ({ cartoon: { color, thickness: 1.0 }, stick: { color, radius: 0.2 } });
        if (f1_loc) viewer.setStyle({ chain: 'A', resi: f1_loc, byres: true }, highlightStyle("red"));
        if (f2_loc) viewer.setStyle({ chain: 'B', resi: f2_loc, byres: true }, highlightStyle("blue"));
    }

    viewer.setHoverable({}, true,
        function(atom, viewerInstance, event, container) {
            const selResidue = { chain: atom.chain, resi: atom.resi, byres: true };
            const residueInfo = `${atom.resn} ${atom.resi}`;
            atom._hoverLabel = viewerInstance.addLabel(residueInfo, {position: atom, backgroundColor: 'white', fontColor: 'black', fontSize: 14});

            atom._origSelection = selResidue;
            atom._origAtomsShown = atomsShown;
            atom._origWasInteraction  = (
                (f1_loc && atom.chain === 'A' && f1_loc.includes(atom.resi.toString())) ||
                (f2_loc && atom.chain === 'B' && f2_loc.includes(atom.resi.toString()))
            );
            atom._origStyle = styles;

            viewerInstance.setStyle(selResidue, { cartoon: { color: 'yellow', thickness: 1.5 }, stick:   { color: 'yellow', radius: 0.4 }});
            viewerInstance.render();
        },
        function(atom, viewerInstance) {
            if (atom._hoverLabel) {
                viewerInstance.removeLabel(atom._hoverLabel);
                delete atom._hoverLabel;
            }

            let restoreStyle;
            if (atom._origWasInteraction && !atom._origAtomsShown) {
                restoreStyle = { cartoon: { color: (atom.chain === 'A' ? 'red' : 'blue'), thickness: 1.0 }, stick: { color: (atom.chain === 'A' ? 'red' : 'blue'), radius: 0.2 }};
            } else {
                restoreStyle = atom._origStyle;
                if (!atom._origAtomsShown) delete restoreStyle.stick;
            }

            viewerInstance.setStyle(atom._origSelection, restoreStyle);
            viewerInstance.render();

            delete atom._origSelection;
            delete atom._origAtomsShown;
            delete atom._origWasInteraction;
            delete atom._origStyle;
        }
    );

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

export function _displayStructureInViewer(container, pdbPath, options={}) {
    const {domainRangesArray, zoomSelection, f1_loc, f2_loc, proteins} = options || {};
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

    let viewer = $3Dmol.createViewer(container, { defaultcolors: $3Dmol.rasmolElementColors });
    const useDomainColoring = _isValidDomainRanges(domainRangesArray);
    const initialColorMode = useDomainColoring ? 'alphafold' : 'chain';

    const structureConfig = {
        viewer: viewer,
        f1_loc: f1_loc,
        f2_loc: f2_loc,
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

    if (proteins && proteins.length >= 2) {
        const interaction = (f1_loc || f2_loc) ? true : false;
        _createColorKeyLegend(keyPlaceholder, proteins, interaction);
    }

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
