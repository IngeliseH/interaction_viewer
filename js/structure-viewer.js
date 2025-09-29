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

function displayStructureInViewer(container, pdbPath, options = {}) {
    if (!container) return;
    container.innerHTML = '';

    const {
        domainRangesArray,
        zoomSelection,
        baseChainColorFunc,
        highlightStyle,
        f1_loc,
        f2_loc,
        surfaceOptions,
        surfaceColors
    } = options;

    const useDomainColoring = _isValidDomainRanges(domainRangesArray);
    const fallbackId = "structure-viewer-fallback-protein";
    let fallback = container.querySelector(`#${fallbackId}`) || container.querySelector('p');
    if (!window.$3Dmol) {
        container.innerHTML = '<p style="color:red;text-align:center;">3Dmol.js library not loaded.</p>';
        return;
    }
    if (!pdbPath) {
        if (fallback) {
            fallback.textContent = 'No PDB path provided for structure viewer.';
            fallback.style.display = 'block';
        } else {
            container.innerHTML = '<p style="color:grey;text-align:center;">No PDB path provided.</p>';
        }
        const controls = container.closest('.content-section-content')?.querySelector('.structure-controls');
        if (controls) controls.style.display = 'none';
        return;
    }

    const controls = container.closest('.content-section-content')?.querySelector('.structure-controls');
    let viewer = $3Dmol.createViewer(container, { defaultcolors: $3Dmol.rasmolElementColors });
    let modelLoaded = false;
    if (controls) controls.style.display = 'none';

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
            modelLoaded = true;
            if (controls) controls.style.display = '';
            if (fallback) fallback.style.display = 'none';
            applyViewerState();
        })
        .catch(error => {
            container.innerHTML = `<p style="color:red;text-align:center;">Could not load structure: ${error.message}.</p>`;
            if (controls) controls.style.display = 'none';
        });

    if (controls) {
        let atomsShown = false;
        let surfaceShown = false;
        let colorMode = useDomainColoring ? 'alphafold' : 'chain';
        const initialColorMode = colorMode;

        function applyViewerState() {
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
                } else { // 'chain'
                    colorFunc = baseChainColorFunc || (atom => atom.chain === 'A' ? 'lightcoral' : 'lightskyblue');
                }
                styles = { cartoon: { colorfunc: colorFunc } };
                if (atomsShown) {
                    styles.stick = { colorfunc: colorFunc, radius: 0.2 };
                }
            }
            viewer.setStyle({}, styles);

            if (!atomsShown && highlightStyle) {
                if (f1_loc) viewer.setStyle({ chain: 'A', resi: f1_loc }, highlightStyle("red"));
                if (f2_loc) viewer.setStyle({ chain: 'B', resi: f2_loc }, highlightStyle("blue"));
            }

            if (surfaceShown) {
                const defaultSurfaceOptions = { opacity: 0.7 };
                const finalSurfaceOptions = { ...defaultSurfaceOptions, ...(surfaceOptions || {}) };

                if (colorMode === 'chain' && surfaceColors) {
                    surfaceColors.forEach(s => viewer.addSurface($3Dmol.SurfaceType.VDW, { ...finalSurfaceOptions, color: s.color }, s.sel));
                } else {
                    viewer.addSurface($3Dmol.SurfaceType.VDW, { ...finalSurfaceOptions, color: 'white' });
                }
            }
            viewer.render();
        }

        function updateColorModeButtonText(btn) {
            if (!btn) return;
            let nextModeText;
            if (useDomainColoring) {
                nextModeText = colorMode === 'alphafold' ? 'Spectrum' : 'AlphaFold domain';
            } else {
                nextModeText = colorMode === 'chain' ? 'Spectrum' : 'By Chain';
            }
            btn.innerHTML = `<i class="fas fa-palette"></i> ${nextModeText}`;
        }

        controls.querySelector('.control-button.reset')?.addEventListener('click', () => {
            if (!modelLoaded) return;
            atomsShown = false;
            surfaceShown = false;
            colorMode = initialColorMode;
            
            applyViewerState();
            
            if (zoomSelection) {
                viewer.zoomTo(zoomSelection);
            } else {
                viewer.zoomTo();
            }
            viewer.render();
            updateColorModeButtonText(controls.querySelector('.control-button.color-mode'));
            controls.querySelector('.control-button.atoms-btn')?.classList.remove('active');
            controls.querySelector('.control-button.surface-btn')?.classList.remove('active');
        });

        controls.querySelector('.control-button.atoms-btn')?.addEventListener('click', function() {
            if (!modelLoaded) return;
            atomsShown = !atomsShown;
            this.classList.toggle('active', atomsShown);
            applyViewerState();
        });

        controls.querySelector('.control-button.surface-btn')?.addEventListener('click', function() {
            if (!modelLoaded) return;
            surfaceShown = !surfaceShown;
            this.classList.toggle('active', surfaceShown);
            applyViewerState();
        });

        const colorModeBtn = controls.querySelector('.control-button.color-mode');
        if (colorModeBtn) {
            colorModeBtn.addEventListener('click', () => {
                if (!modelLoaded) return;
                if (useDomainColoring) {
                    colorMode = colorMode === 'alphafold' ? 'spectrum' : 'alphafold';
                } else {
                    colorMode = colorMode === 'chain' ? 'spectrum' : 'chain';
                }
                updateColorModeButtonText(colorModeBtn);
                applyViewerState();
            });
            updateColorModeButtonText(colorModeBtn);
        }
    }
}

window.displayStructureInViewer = displayStructureInViewer;

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.structure-viewer').forEach(container => {
        const pdbPath = container.getAttribute('data-pdb');
        if (pdbPath && pdbPath.trim() !== "") {
            // This auto-initialization is mainly for protein.html's single viewer.
            // interaction.html and protein_pair.html have specific logic to call the viewer.
            // The check for the fallback element ID is a bit of a hack to prevent
            // this from running on protein.html before the specific data is ready.
            if (!document.getElementById('structure-viewer-fallback-protein')) {
                displayStructureInViewer(container, pdbPath, {});
            }
        }
    });
});
