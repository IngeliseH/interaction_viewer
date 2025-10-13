import { state } from './table.js';

export const statColorConfig = {
    'iptm': [[0.3, 'stat-red'], [0.55, 'stat-orange'], [0.7, 'stat-lightgreen'], [1, 'stat-darkgreen']],
    'min_pae': [[2, 'stat-darkgreen'], [3, 'stat-lightgreen'], [5, 'stat-yellow'], [7, 'stat-orange'], [30, 'stat-red']],
    'avg_pae': [[5, 'stat-darkgreen'], [10, 'stat-lightgreen'], [15, 'stat-yellow'], [20, 'stat-orange'], 30, 'stat-red'],
    'pdockq': [[0.1, 'stat-red'], [0.23, 'stat-orange'], [0.5, 'stat-yellow'], [0.7, 'stat-lightgreen'], [1, 'stat-darkgreen']],
    'rop': [[0, 'stat-red'], [1, 'stat-orange'], [2, 'stat-yellow'], [3, 'stat-lightgreen'], [4, 'stat-darkgreen']],
};

export function getStatColor(val, thresholds) {
    val = parseFloat(val);
    if (isNaN(val)) return '';
    for (const [threshold, color] of thresholds) {
        if (val <= threshold) return color;
    }
    return 'white';
}

export function setUpdateStatsUI(fn) { 
    state.setState({ updateStatsUI: fn }); 
}

export function updateInteractionStatsFromURL(urlParams) {
    function _setStatColor(element, value, thresholds) {
        element.classList.remove(
            'stat-red', 'stat-orange', 'stat-yellow', 'stat-lightgreen', 'stat-darkgreen'
        );
        const colorClass = getStatColor(value, thresholds);
        if (colorClass) element.classList.add(colorClass);
    }

    const stats = ['iptm', 'min_pae', 'avg_pae', 'rop', 'pdockq'];
    stats.forEach(stat => {
        const value = urlParams.get(stat);
        const element = document.getElementById(`stat-${stat.replace('_', '')}`);
        const cardElement = document.getElementById(`stat-card-${stat.replace('_', '')}`);

        element.textContent = value;

        _setStatColor(cardElement, value, statColorConfig[stat]);
    });
}