import { highlightStructureViewerResidues, restoreStructureViewerHighlightedResidues } from "./structure-viewer.js";

// =============================================================================
// Public API Functions
// =============================================================================
export function renderProteinSequenceSection({sequencePlaceholder, proteins, fragmentIds, proteinMetadata, structureConfig}) {
    sequencePlaceholder.innerHTML = '';

    const section = _createProteinSequenceDiv(proteins.length);
    const contentDiv = section.querySelector('.collapsible-subsection-content');

    let activeHighlights = [];

    proteins.forEach((protein, idx) => {
        const proteinInfo = proteinMetadata.get(protein) || {};
        proteinInfo.name = protein;
        proteinInfo.idx = idx;
        const [fragStartRaw = 0, fragEndRaw = 0] = (proteinInfo.fragmentIndices?.[fragmentIds?.[idx] - 1] || [0, 0]);
        const hasFragment = fragStartRaw > 0 && fragEndRaw >= fragStartRaw;
        proteinInfo.currentFragmentStart = hasFragment ? Math.max(1, fragStartRaw) : 1;
        proteinInfo.currentFragmentEnd = hasFragment ? Math.min(proteinInfo.sequence.length, fragEndRaw) : proteinInfo.sequence.length;
        if (structureConfig.f1_loc || structureConfig.f2_loc) {
            const interaction = idx === 0 ?  structureConfig.f1_loc : structureConfig.f2_loc;
            const relativeIntLoc = interaction.map(x => parseInt(x)).filter(n => !isNaN(n));
            proteinInfo.interactionLoc = new Set(relativeIntLoc.map(n => proteinInfo.currentFragmentStart + n - 1));
            proteinInfo.highlightColor = idx === 0 ? 'red' : 'blue';
        } else if (structureConfig.domainRangesArray) {
            proteinInfo.interactionLoc = new Set();
            structureConfig.domainRangesArray.forEach(range => {
                const start = Math.max(proteinInfo.currentFragmentStart, range.start);
                const end = Math.min(proteinInfo.currentFragmentEnd, range.end);
                for (let r = start; r <= end; r++) {
                    proteinInfo.interactionLoc.add(r);
                }
            });
            proteinInfo.highlightColor = 'blue';
        } else {
            proteinInfo.interactionLoc = null;
            proteinInfo.highlightColor = null;
        }

        const proteinBlock = _renderSingleProteinSequence({
            proteinInfo, structureConfig,
            activeHighlightsRef: { get: () => activeHighlights, set: (v) => activeHighlights = v },
        });
        contentDiv.appendChild(proteinBlock);
    });

    sequencePlaceholder.appendChild(section);
}

// =============================================================================
// Component rendering
// =============================================================================
function _createProteinSequenceDiv(numProteins) {
    const section = document.createElement('div');
    section.className = 'collapsible-subsection collapsed';
    section.id = 'protein-sequence-collapsible-section';

    const titleDiv = document.createElement('div');
    titleDiv.className = 'collapsible-subsection-title';
    titleDiv.innerHTML = `
        <h4>${numProteins > 1 ? 'Protein sequences' : 'Protein sequence'}</h4>
        <i class="fas fa-chevron-up"></i>
    `;
    titleDiv.addEventListener('click', () => section.classList.toggle('collapsed'));

    const contentDiv = document.createElement('div');
    contentDiv.className = 'collapsible-subsection-content';

    section.appendChild(titleDiv);
    section.appendChild(contentDiv);

    return section;
}

function _renderSingleProteinSequence({proteinInfo, structureConfig, activeHighlightsRef}) {
    const {name, sequence} = proteinInfo;
    const proteinSeqDiv = document.createElement('div');
    proteinSeqDiv.className = 'protein-sequence-block';

    const header = document.createElement('h4');
    header.textContent = name;
    header.style.textAlign = 'center';
    proteinSeqDiv.appendChild(header);

    const handlers = _createSequenceMouseHandlers({proteinInfo, structureConfig, activeHighlightsRef});

    for (let rowStart = 1; rowStart <= sequence.length; rowStart += 100) {
        _renderSequenceRow({proteinSeqDiv, proteinInfo, rowStart, handlers});
    }

    const spacer = document.createElement('div');
    spacer.style.height = '6px';
    proteinSeqDiv.appendChild(spacer);

    return proteinSeqDiv;
}

function _renderSequenceRow({proteinSeqDiv, proteinInfo, rowStart, handlers}) {
    const {name, sequence, currentFragmentStart, currentFragmentEnd, interactionLoc, highlightColor} = proteinInfo;
    const ROW_SIZE = 100;
    const GROUP_SIZE = 5;
    const rowEnd = Math.min(sequence.length, rowStart + ROW_SIZE - 1);
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
        const inFragment = resi >= currentFragmentStart && resi <= currentFragmentEnd;

        const span = document.createElement('span');
        span.textContent = sequence[resi - 1];
        span.dataset.resi = resi;
        span.dataset.protein = name;
        span.dataset.region = inFragment ? 'mid' : 'grey';
        span.style.color = inFragment ? '' : 'lightgray';

        if (inFragment && interactionLoc && interactionLoc.has(resi)) {
            span.style.color = highlightColor || span.style.color;
        }

        if (inFragment) {
            span.style.cursor = 'pointer';
            span.addEventListener('mousedown', handlers.onMouseDown);
            span.addEventListener('mouseenter', handlers.onMouseEnter);
        }

        rowPre.appendChild(span);
        if ((resi - rowStart + 1) % GROUP_SIZE === 0 && resi < rowEnd) {
            rowPre.appendChild(document.createTextNode(' '));
        }
    }

    proteinSeqDiv.appendChild(rowPre);
}

// =============================================================================
// Interactivity handlers
// =============================================================================
function _createSequenceMouseHandlers({proteinInfo, structureConfig, activeHighlightsRef}) {
    const {viewer} = structureConfig;
    const {name, idx, currentFragmentStart, currentFragmentEnd, sequence} = proteinInfo;
    let selecting = false;
    let anchorRes = null;
    let currentRes = null;

    const proteinSeqDivSelector = `span[data-protein="${name}"][data-region="mid"]`;

    const clearSelection = () => {
        document.querySelectorAll(proteinSeqDivSelector)
            .forEach(s => s.style.backgroundColor = '');
    };

    const applySelection = (a, b) => {
        if (a == null || b == null) return;
        const start = Math.max(currentFragmentStart, Math.min(a, b));
        const end = Math.min(currentFragmentEnd, Math.max(a, b));
        document.querySelectorAll(proteinSeqDivSelector)
            .forEach(s => {
                const r = parseInt(s.dataset.resi);
                s.style.backgroundColor = (r >= start && r <= end) ? '#fff3a1' : '';
            });
    };

    const onMouseDown = (e) => {
        e.preventDefault();
        clearSelection();
        restoreStructureViewerHighlightedResidues(viewer, activeHighlightsRef.get());
        activeHighlightsRef.set([]);
        const resi = parseInt(e.currentTarget.dataset.resi);
        selecting = true;
        anchorRes = currentRes = resi;
        applySelection(anchorRes, currentRes);

        const onUp = () => {
            if (!selecting) return;
            selecting = false;
            document.removeEventListener('mouseup', onUp);
            const start = Math.max(currentFragmentStart, Math.min(anchorRes, currentRes));
            const end = Math.min(currentFragmentEnd, Math.max(anchorRes, currentRes));
            window.sequenceSelectedRange = { name, start, end };

            const chain = idx === 0 ? 'A' : 'B';
            if (viewer) {
                const residues = [];
                for (let r = start; r <= end; r++) {
                    residues.push({chain, resi: r - currentFragmentStart + 1, resn: sequence[r - 1]});
                }
                activeHighlightsRef.set(residues);
                highlightStructureViewerResidues({structureConfig, residues, showLabels: false});
            }
        };
        document.addEventListener('mouseup', onUp);
    };

    const onMouseEnter = (e) => {
        if (!selecting) return;
        currentRes = parseInt(e.currentTarget.dataset.resi, 10);
        applySelection(anchorRes, currentRes);
    };

    return { onMouseDown, onMouseEnter };
}
