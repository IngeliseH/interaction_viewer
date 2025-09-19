// Structure viewer module used in interaction.html and protein_pair.html

function getInteractionViewerOptions() {
    function parseResidueLocations(locStr, shift) {
        if (!locStr) return null;
        const expanded = [];
        locStr.split(',').forEach(resi => {
            resi = resi.trim();
            const match = resi.match(/(\d+)(?:-(\d+))?/);
            if (match) {
                const start = parseInt(match[1], 10) - shift;
                const end = match[2] ? parseInt(match[2], 10) - shift : start;
                for (let i = start; i <= end; i++) {
                    expanded.push(i.toString());
                }
            } else {
                expanded.push(resi);
            }
        });
        return expanded;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const f1_shift = parseInt(urlParams.get('f1_shift') || "0", 10);
    const f2_shift = parseInt(urlParams.get('f2_shift') || "0", 10);
    const f1_loc = parseResidueLocations(urlParams.get('f1_loc'), f1_shift);
    const f2_loc = parseResidueLocations(urlParams.get('f2_loc'), f2_shift);

    const f1_selection = f1_loc ? {resi: f1_loc, chain: 'A'} : null;
    const f2_selection = f2_loc ? {resi: f2_loc, chain: 'B'} : null;
    const zoomSelection = (f1_selection && f2_selection) ? {or: [f1_selection, f2_selection]} : (f1_selection || f2_selection);

    function baseChainColorFunc(atom) {
        if (f1_loc && atom.chain === 'A' && f1_loc.includes(atom.resi.toString())) return 'red';
        if (f2_loc && atom.chain === 'B' && f2_loc.includes(atom.resi.toString())) return 'blue';
        if (atom.chain === 'A') return 'lightcoral';
        if (atom.chain === 'B') return 'lightskyblue';
        return 'lightgray';
    }

    const highlightStyle = (color) => ({ cartoon: { color, thickness: 1.0 }, stick: { color, thickness: 1.0 } });

    const surfaceColors = [
        { color: 'lightcoral', sel: { chain: 'A' } },
        { color: 'lightskyblue', sel: { chain: 'B' } },
        { color: 'lightgray', sel: { chain: { $ne: 'A', $ne: 'B' } } }
    ];

    return {
        zoomSelection,
        baseChainColorFunc,
        highlightStyle,
        f1_loc,
        f2_loc,
        surfaceOptions: { opacity: 0.7 },
        surfaceColors
    };
}

function displayInteractionInViewer(container, pdbPath) {
    if (!window.displayStructureInViewer) {
        console.error("Base displayStructureInViewer function not loaded. Make sure structure-viewer.js is included.");
        if (container) {
            container.innerHTML = '<p style="color:red;text-align:center;">Base viewer script not loaded.</p>';
        }
        return;
    }

    const viewerOptions = getInteractionViewerOptions();

    window.displayStructureInViewer(container, pdbPath, viewerOptions);
}

window.getInteractionViewerOptions = getInteractionViewerOptions;
window.displayInteractionInViewer = displayInteractionInViewer;
