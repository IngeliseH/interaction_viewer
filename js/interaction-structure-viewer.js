// Structure viewer module for 3Dmol.js

// Renamed and refactored function to be callable with a specific PDB path
// Now accepts an options object for highlight regions
function displayStructureInViewer(container, pdbPath) {
    if (!container) {
        console.error("Structure viewer container not provided to displayStructureInViewer.");
        return;
    }
    container.innerHTML = ''; // Clear previous content (fallback or old viewer)

    const fallbackElementId = "structure-viewer-fallback-protein"; // Assuming protein.html uses this ID
    let fallbackInContainer = container.querySelector(`#${fallbackElementId}`);
    if (!fallbackInContainer) { // If not specific, look for any p
        fallbackInContainer = container.querySelector('p');
    }


    if (!window.$3Dmol) {
        container.innerHTML = '<p style="color:red;text-align:center;">3Dmol.js library not loaded.</p>';
        return;
    }
    if (!pdbPath) {
        if (fallbackInContainer) {
            fallbackInContainer.textContent = 'No PDB path provided for structure viewer.';
            fallbackInContainer.style.display = 'block';
        } else {
            container.innerHTML = '<p style="color:grey;text-align:center;">No PDB path provided.</p>';
        }
        // Ensure controls are hidden if no PDB path
        const controls = container.closest('.content-section-content')?.querySelector('.structure-controls');
        if (controls) controls.style.display = 'none';
        return;
    }

    const controls = container.closest('.content-section-content')?.querySelector('.structure-controls');
    let viewer = $3Dmol.createViewer(container, { defaultcolors: $3Dmol.rasmolElementColors });
    let modelLoaded = false;

    if (controls) controls.style.display = 'none'; // Hide controls until PDB loaded

    // --- Move f1_loc and f2_loc constants here for global access in the viewer ---
    const urlParams = new URLSearchParams(window.location.search);
    const f1_loc_str = urlParams.get('f1_loc');
    const f2_loc_str = urlParams.get('f2_loc');
    const f1_shift = parseInt(urlParams.get('f1_shift') || "0", 10);
    const f2_shift = parseInt(urlParams.get('f2_shift') || "0", 10);

    let f1_loc = f1_loc_str ? f1_loc_str.split(',').map(s => s.trim()) : null;
    if (f1_loc) {
        const expandedF1 = [];
        f1_loc.forEach(resi => {
            const match = resi.match(/(\d+)(?:-(\d+))?/);
            if (match) {
                const start = parseInt(match[1], 10) - f1_shift;
                const end = match[2] ? parseInt(match[2], 10) - f1_shift : start;
                for (let i = start; i <= end; i++) {
                    expandedF1.push(i.toString());
                }
            } else if (!isNaN(parseInt(resi, 10))) {
                expandedF1.push((parseInt(resi, 10) - f1_shift).toString());
            } else {
                expandedF1.push(resi);
            }
        });
        f1_loc = expandedF1;
    }
    let f2_loc = f2_loc_str ? f2_loc_str.split(',').map(s => s.trim()) : null;
    if (f2_loc) {
        const expandedF2 = [];
        f2_loc.forEach(resi => {
            const match = resi.match(/(\d+)(?:-(\d+))?/);
            if (match) {
                const start = parseInt(match[1], 10) - f2_shift;
                const end = match[2] ? parseInt(match[2], 10) - f2_shift : start;
                for (let i = start; i <= end; i++) {
                    expandedF2.push(i.toString());
                }
            } else if (!isNaN(parseInt(resi, 10))) {
                expandedF2.push((parseInt(resi, 10) - f2_shift).toString());
            } else {
                expandedF2.push(resi);
            }
        });
        f2_loc = expandedF2;
    }

    // --- New: create selection for zooming and centering based on f1_loc and f2_loc ---
    let zoomSelection = null;
    const f1_selection = f1_loc ? {resi: f1_loc, chain: 'A'} : null;
    const f2_selection = f2_loc ? {resi: f2_loc, chain: 'B'} : null;

    if (f1_selection && f2_selection) {
        zoomSelection = {or: [f1_selection, f2_selection]};
    } else if (f1_selection) {
        zoomSelection = f1_selection;
    } else if (f2_selection) {
        zoomSelection = f2_selection;
    }

    function baseChainColorFunc(atom) {
        if (f1_loc) {
            if (atom.chain === 'A' && f1_loc.includes(atom.resi.toString())) return 'red';
        }
        if (f2_loc) {
            if (atom.chain === 'B' && f2_loc.includes(atom.resi.toString())) return 'blue';
        }
        if (atom.chain === 'A') return 'lightcoral';
        if (atom.chain === 'B') return 'lightskyblue';
        return 'lightgray';
    }
    function baseSpectrumColorFunc(atom) {
        // Let 3Dmol.js handle spectrum coloring
        return undefined;
    }

    // State for toggles
    let atomsShown = false;
    let surfaceShown = false;
    let colorMode = 'chain'; // 'chain' or 'spectrum'

    function applyViewerState() {
        if (!modelLoaded) return;
        viewer.setStyle({}, {});
        viewer.removeAllSurfaces();

        // Choose base color function
        let baseColorFunc = null;
        if (colorMode === 'chain') baseColorFunc = baseChainColorFunc;
        if (colorMode === 'spectrum') baseColorFunc = baseSpectrumColorFunc;

        // Apply cartoon and stick styles with colorfunc
        if (atomsShown) {
            viewer.setStyle(
                {},
                {
                    cartoon: {colorfunc: baseColorFunc},
                    stick: {colorfunc: baseColorFunc, radius: 0.2}
                }
            );
        } else {
            viewer.setStyle(
                {},
                {
                    cartoon: {colorfunc: baseColorFunc}
                }
            );
            if (f1_loc) {
                viewer.setStyle(
                    {chain: 'A', resi: f1_loc},
                    {cartoon: {color:"red", thickness:1.0}, stick: {color:"red", thickness:1.0}}
                );
            }
            if (f2_loc) {
                viewer.setStyle(
                    {chain: 'B', resi: f2_loc},
                    {cartoon: {color:"blue", thickness:1.0}, stick: {color:"blue", thickness:1.0}}
                );
            }
        }

        // Add surface if toggled
        if (surfaceShown) {
            const surfaceOptions = {opacity: 0.7};
            if (colorMode === 'chain') {
                viewer.addSurface($3Dmol.SurfaceType.VDW, {...surfaceOptions, color:'#a0c4ff'}, {chain: 'A'});
                viewer.addSurface($3Dmol.SurfaceType.VDW, {...surfaceOptions, color:'#ffb3ba'}, {chain: 'B'});
                viewer.addSurface($3Dmol.SurfaceType.VDW, {...surfaceOptions, color:'lightgray'}, {chain: {$ne:'A', $ne:'B'}});
            } else { // spectrum
                viewer.addSurface($3Dmol.SurfaceType.VDW, {...surfaceOptions, color:'white'});
            }
        }
        viewer.render();
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
            modelLoaded = true;
            if (controls) controls.style.display = '';
            if (fallbackInContainer) fallbackInContainer.style.display = 'none';
            applyViewerState();
        })
        .catch((error) => {
            console.error('Error loading PDB into viewer:', error);
            container.innerHTML = `<p style="color:red;text-align:center;">Could not load structure: ${error.message}.</p>`;
            if (controls) controls.style.display = 'none';
        });

    // Control logic (ensure this is robust if controls is null)
    if (controls) {
        controls.querySelector('.resetViewBtn')?.addEventListener('click', () => {
            if (!modelLoaded) return;
            atomsShown = false;
            surfaceShown = false;
            colorMode = 'chain';
            
            applyViewerState(); // Apply default styles first
            // --- Reset zoom/positioning to highlighted regions, matching initial load ---
            if (zoomSelection) {
                viewer.zoomTo(zoomSelection);
            } else {
                viewer.zoomTo();
            }
            viewer.render()
            updateColorModeButtonText(); // Update button text
        });

        controls.querySelector('.atomsBtn')?.addEventListener('click', () => {
            if (!modelLoaded) return;
            atomsShown = !atomsShown;
            applyViewerState();
        });

        controls.querySelector('.surfaceBtn')?.addEventListener('click', () => {
            if (!modelLoaded) return;
            surfaceShown = !surfaceShown;
            applyViewerState();
        });

        const colorModeBtn = controls.querySelector('.colorModeBtn');
        function updateColorModeButtonText() {
            if (!colorModeBtn) return;
            if (colorMode === 'chain') {
                colorModeBtn.innerHTML = '<i class="fas fa-palette"></i> Spectrum';
            } else {
                colorModeBtn.innerHTML = '<i class="fas fa-palette"></i> Chain';
            }
        }
        if (colorModeBtn) {
            colorModeBtn.addEventListener('click', () => {
                if (!modelLoaded) return;
                colorMode = (colorMode === 'chain') ? 'spectrum' : 'chain';
                updateColorModeButtonText();
                applyViewerState();
            });
            updateColorModeButtonText(); // Initial text
        }
    }
}

// Expose the function to the global scope for protein.html
window.displayStructureInViewer = displayStructureInViewer;

// This function initializes viewers. It's called either on DOMContentLoaded or immediately if the DOM is already loaded.
function initializeStructureViewers() {
    document.querySelectorAll('.structure-viewer').forEach(container => {
        const pdbPath = container.getAttribute('data-pdb');
        if (pdbPath && pdbPath.trim() !== "") {
            // The check for 'structure-viewer-fallback-protein' is to avoid auto-init on protein.html, which might have its own logic.
            if (!document.getElementById('structure-viewer-fallback-protein')) {
                displayStructureInViewer(container, pdbPath);
            }
        }
    });
}

// Run initialization.
if (document.readyState === 'loading') {
    // The document is still loading, so wait for the DOM to be ready.
    document.addEventListener('DOMContentLoaded', initializeStructureViewers);
} else {
    // The DOM is already loaded, so we can run the initialization function immediately.
    // This is the case for interaction.html where this script is loaded dynamically.
    initializeStructureViewers();
}
