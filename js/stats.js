import { state, setState } from './table.js';

export const statColorConfig = {
    'iptm': [[0.3, 'stat-red'], [0.55, 'stat-orange'], [0.7, 'stat-lightgreen']],
    'min_pae': [[2, 'stat-darkgreen'], [3, 'stat-lightgreen'], [5, 'stat-yellow'], [7, 'stat-orange']],
    'avg_pae': [[5, 'stat-darkgreen'], [10, 'stat-lightgreen'], [15, 'stat-yellow'], [20, 'stat-orange']],
    'pdockq': [[0.1, 'stat-red'], [0.23, 'stat-orange'], [0.5, 'stat-yellow'], [0.7, 'stat-lightgreen']],
    'rop': [[1, 'stat-red'], [2, 'stat-orange'], [3, 'stat-yellow'], [4, 'stat-lightgreen']]
};

export function getStatColor(val, thresholds) {
    val = parseFloat(val);
    if (isNaN(val)) return '';
    for (const [threshold, color] of thresholds) {
        if (val < threshold) return color;
    }
    return 'stat-darkgreen';
}

export function setUpdateStatsUI(fn) { 
    state.setState({ updateStatsUI: fn }); 
}