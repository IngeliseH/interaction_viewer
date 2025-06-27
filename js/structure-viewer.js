// Structure viewer module for 3Dmol.js

// Renamed and refactored function to be callable with a specific PDB path
function displayStructureInViewer(container, pdbPath, domainRangesArray) {
    // console.log("[SV] displayStructureInViewer called with:", { pdbPath, domainRangesArray });
    if (!container) {
        console.error("Structure viewer container not provided to displayStructureInViewer.");
        return;
    }
    container.innerHTML = ''; // Clear previous content (fallback or old viewer)

    // Check if valid domain ranges are provided
    const isDomainRangesArrayAnArray = Array.isArray(domainRangesArray);
    const isDomainRangesArrayNotEmpty = isDomainRangesArrayAnArray && domainRangesArray.length > 0;
    let areAllDomainRangeElementsValid = false;

    if (isDomainRangesArrayNotEmpty) {
        areAllDomainRangeElementsValid = domainRangesArray.every((r, index) => {
            const isValidElement = r && typeof r.start === 'number' && typeof r.end === 'number' &&
                                   !isNaN(r.start) && !isNaN(r.end) &&
                                   r.start > 0 && r.end >= r.start;
            return isValidElement;
        });
    }
    
    const useDomainColoring = isDomainRangesArrayAnArray && isDomainRangesArrayNotEmpty && areAllDomainRangeElementsValid;



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

    // Helper function to determine color based on AlphaFold domain ranges
    function getAlphaFoldDomainColor(atom, doApplyDomainColoring, ranges) {
        let inDomain = false;
        let matchedRange = null;

        if (doApplyDomainColoring && atom.chain === 'A' && Array.isArray(ranges)) {
            for (const range of ranges) {
                if (atom.resi >= range.start && atom.resi <= range.end) {
                    inDomain = true;
                    matchedRange = range;
                    break; 
                }
            }
        }
        
        const color = inDomain ? 'dodgerblue' : 'ghostwhite';

        return color;
    }

    if (controls) controls.style.display = 'none'; // Hide controls until PDB loaded

    fetch(pdbPath)
        .then(response => {
            if (!response.ok) throw new Error(`PDB file not found at ${pdbPath} (status: ${response.status})`);
            return response.text();
        })
        .then(pdbData => {
            viewer.addModel(pdbData, 'pdb');
            
            viewer.setStyle({}, {cartoon: {colorfunc: (atom) => getAlphaFoldDomainColor(atom, useDomainColoring, domainRangesArray)}});
            
            viewer.zoomTo();
            viewer.render();
            modelLoaded = true;
            if (controls) controls.style.display = ''; // Show controls
            if (fallbackInContainer) fallbackInContainer.style.display = 'none';

        })
        .catch((error) => {
            console.error('Error loading PDB into viewer:', error);
            container.innerHTML = `<p style="color:red;text-align:center;">Could not load structure: ${error.message}.</p>`;
            if (controls) controls.style.display = 'none';
        });

    // Control logic (ensure this is robust if controls is null)
    if (controls) {
        // State for toggles
        let atomsShown = false;
        let surfaceShown = false;
        let colorMode = 'alphafold'; // Initial mode: 'alphafold' or 'spectrum'

        function applyViewerState() {
            if (!modelLoaded) {
                return;
            }
            // Clear all styles and surfaces
            viewer.setStyle({}, {}); // Clear previous styles
            viewer.removeAllSurfaces();

            // Both cartoon and stick (if atomsShown) should use the same coloring logic
            if (colorMode === 'alphafold') {
                // Cartoon always visible, colored by domain
                viewer.setStyle({}, {cartoon: {colorfunc: (atom) => getAlphaFoldDomainColor(atom, useDomainColoring, domainRangesArray)}});
                if (atomsShown) {
                    // Stick visible, colored by domain
                    viewer.setStyle({}, {cartoon: {colorfunc: (atom) => getAlphaFoldDomainColor(atom, useDomainColoring, domainRangesArray)},
                                         stick: {colorfunc: (atom) => getAlphaFoldDomainColor(atom, useDomainColoring, domainRangesArray), radius: 0.2}});
                }
            } else { // spectrum
                // Cartoon always visible, colored by spectrum
                viewer.setStyle({}, {cartoon: {color: 'spectrum'}});
                if (atomsShown) {
                    // Stick visible, colored by spectrum
                    viewer.setStyle({}, {cartoon: {color: 'spectrum'}, stick: {color: 'spectrum', radius: 0.2}});
                }
            }

            // Add surface if toggled
            if (surfaceShown) {
                viewer.addSurface($3Dmol.SurfaceType.VDW, {opacity: 0.7, color:'white'});
            }
            viewer.render();
        }
        
        controls.querySelector('.resetViewBtn')?.addEventListener('click', () => {
            if (!modelLoaded) return;
            atomsShown = false;
            surfaceShown = false;
            colorMode = 'alphafold'; // Reset to alphafold mode
            applyViewerState(); // Apply default styles first
            viewer.zoomTo(); // Then zoom
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
            if (colorMode === 'alphafold') {
                colorModeBtn.innerHTML = '<i class="fas fa-palette"></i> Spectrum';
            } else {
                colorModeBtn.innerHTML = '<i class="fas fa-palette"></i> AlphaFold domain';
            }
        }
        if (colorModeBtn) {
            colorModeBtn.addEventListener('click', () => {
                if (!modelLoaded) return;
                colorMode = (colorMode === 'alphafold') ? 'spectrum' : 'alphafold';
                updateColorModeButtonText();
                applyViewerState();
            });
            updateColorModeButtonText(); // Initial text
        }
    }
}

// Expose the function to the global scope for protein.html
window.displayStructureInViewer = displayStructureInViewer;

// Initialize all structure viewers on DOMContentLoaded that have a data-pdb attribute
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.structure-viewer').forEach(container => {
        const pdbPath = container.getAttribute('data-pdb');
        // Only initialize if data-pdb is present and non-empty.
        // protein.html will call displayStructureInViewer explicitly after fetching AFDB URL with domain ranges.
        if (pdbPath && pdbPath.trim() !== "") {
            // Check if we are on protein.html; if so, let its specific logic handle it.
            // This is a simple check; might need refinement if structure-viewer div is used elsewhere without this pattern.
            // The instance on protein.html is handled by fetchAndLoadAlphaFoldStructure.
            // This block is for other pages that might use .structure-viewer with just a data-pdb.
            if (!document.getElementById('structure-viewer-fallback-protein')) { // Avoid re-init on protein.html
                displayStructureInViewer(container, pdbPath, []); // Pass empty array for domains
            }
        }
    });
});
