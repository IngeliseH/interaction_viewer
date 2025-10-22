export function populateProteinSuggestionList(proteinMetadata, uniqueProteins, proteinNum="") {
    const proteinDatalist = document.createElement('datalist');
    proteinDatalist.id = `protein${proteinNum}-list`;
    document.body.appendChild(proteinDatalist);

    uniqueProteins.forEach(protein => {
        const option = document.createElement('option');
        option.value = protein;
        proteinDatalist.appendChild(option.cloneNode(true));
    });

    const proteinInput = document.getElementById(`protein${proteinNum}-search-input`);
    proteinInput.setAttribute('list', proteinDatalist.id);

    const optionsElement = document.getElementById(`protein${proteinNum}-optional-inputs`);
    if (optionsElement) {
        proteinInput.addEventListener('input', () => {
            const proteinName = proteinInput.value;
            if (uniqueProteins.includes(proteinName)) {
                optionsElement.style.visibility = 'visible';
                _populateFragmentList(proteinName, proteinNum, proteinMetadata);
            } else {
                optionsElement.style.visibility = 'hidden';
            }
        });
    }
}

function _populateFragmentList(proteinName, proteinNum, proteinMetadata) {
    const fragmentSelectElement = document.getElementById(`fragment${proteinNum}`);
    const fragmentIndices = proteinMetadata.find(p => p.name === proteinName)?.fragment_indices;
    if (!fragmentSelectElement || !fragmentIndices) return;
    fragmentSelectElement.innerHTML = ''; 

    if (fragmentIndices.length > 0) {
        fragmentIndices.forEach((frag, index) => {
            const option = document.createElement('option');
            const fragmentName = `Fragment ${index + 1}`;
            option.value = fragmentName;
            option.textContent = `${fragmentName} (${frag[0]}-${frag[1]})`;
            option.selected = true;
            fragmentSelectElement.appendChild(option);
        });
        fragmentSelectElement.disabled = false;
        fragmentSelectElement.size = Math.min(fragmentIndices.length, 4); 
    } else {
        const option = document.createElement('option');
        option.textContent = "No fragments available";
        option.disabled = true;
        fragmentSelectElement.appendChild(option);
        fragmentSelectElement.disabled = true;
        fragmentSelectElement.size = 1;
    }
}