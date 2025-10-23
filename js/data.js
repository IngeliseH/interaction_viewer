// =============================================================================
// Public API Functions
// =============================================================================
export async function fetchProteinData(proteinName) {
    const proteins = await loadProteinMetadata();
    if (!proteinName) return {
        length: null,
        fragmentIndices: null,
        alphafoldDomains: [],
        uniprotDomains: [],
        accessionId: null,
        category: null,
        sequence: null
    };
    
    return proteins.get(proteinName) || {
        length: null,
        fragmentIndices: null,
        alphafoldDomains: [],
        uniprotDomains: [],
        accessionId: null,
        category: null,
        sequence: null
    };
}

const dataCache = {
    csv: {},
    processedInteractions: null,
    processedMetadata: null
};

export function clearCache() { // Not currently used! but should add usage as data handling improves
    dataCache.csv = {};
    dataCache.processedInteractions = null;
    dataCache.processedMetadata = null;
}

// =============================================================================
// Core Data Loading
// =============================================================================
export async function loadInteractionData() {
    if (dataCache.processedInteractions) {
        return dataCache.processedInteractions;
    }

    const data = await fetchAndParseCSV('all_interface_analysis_2025.06.05_shifted.csv');
    if (!data) return [];
    
    dataCache.processedInteractions = data.map(row => ({
        ...row,
        Proteins: `${row.Protein1_Domain || ''}+${row.Protein2_Domain || ''}`,
        min_pae: parseFloat(row.min_pae) || null,
        avg_pae: parseFloat(row.avg_pae) || null,
        iptm: parseFloat(row.iptm) || null,
        pdockq: parseFloat(row.pdockq) || null,
        max_promiscuity: parseFloat(row.max_promiscuity) || null,
        rop: parseFloat(row.rop) || null,
        size: parseFloat(row.size) || null,
        evenness: parseFloat(row.evenness) || null
    }));
    
    return dataCache.processedInteractions;
}

export async function loadProteinMetadata() {
    if (dataCache.processedMetadata) {
        return dataCache.processedMetadata;
    }

    function parseFragmentIndices(indicesStr) {
        if (!indicesStr || typeof indicesStr !== 'string') return [];
        const fragments = [];
        const regex = /\((\d+),\s*(\d+)\)/g;
        let match;
        while ((match = regex.exec(indicesStr)) !== null) {
            fragments.push([parseInt(match[1]), parseInt(match[2])]);
        }
        return fragments;
    }

    const data = await fetchAndParseCSV('all_fragments_2025.06.04.csv');
    if (!data) return new Map();
    
    const proteinMap = new Map();
    for (const row of data) {
        if (!row.name) continue;
        
        const { alphafoldDomains, uniprotDomains } = _parseDomainString(row.domains);
        
        proteinMap.set(row.name, {
            length: row.length ? parseInt(row.length, 10) : null,
            fragmentIndices: parseFragmentIndices(row.fragment_indices) || null,
            alphafoldDomains,
            uniprotDomains,
            accessionId: row.accession_id || null,
            category: row.category || null,
            sequence: row.sequence || null
        });
    }
    
    dataCache.processedMetadata = proteinMap;
    return proteinMap;
}

export async function fetchAndParseCSV(url) {
    if (dataCache.csv[url]) {
        return dataCache.csv[url];
    }

    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`Failed to load CSV from ${url}:`, response.statusText);
            return null;
        }
        const csvText = await response.text();
        return new Promise((resolve) => {
            Papa.parse(csvText, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    dataCache.csv[url] = results.data;
                    resolve(results.data);
                },
                error: (error) => {
                    console.error(`Error parsing CSV from ${url}:`, error);
                    resolve(null);
                }
            });
        });
    } catch (error) {
        console.error(`Error fetching CSV from ${url}:`, error);
        return null;
    }
}

// =============================================================================
// Data Processing
// =============================================================================
//TODO: see if some of these functions can be combined
export function parseLocation(locationString) {
    if (!locationString || typeof locationString !== 'string') return {};

    try {
        const parsed = JSON.parse(locationString.replace(/'/g, '"'));
        return Object.keys(parsed).reduce((acc, k) => {
            const key = k.toLowerCase();
            const value = parsed[k];

            if (typeof value === 'string') {
                acc[key] = value.split(',').flatMap(range => {
                    const [start, end] = range.split('-').map(Number);
                    if (!isNaN(start) && !isNaN(end)) {
                        return Array.from({ length: end - start + 1 }, (_, i) => start + i);
                    } else if (!isNaN(start)) {
                        return [start];
                    }
                    return [];
                });
            } else if (Array.isArray(value)) {
                acc[key] = value;
            } else {
                acc[key] = [value];
            }

            return acc;
        }, {});
    } catch (e) {
        console.error('Error parsing location string:', locationString, e);
        return {};
    }
}

export function indicesToRanges(indices) {
    // Converts an array of integers into a compact range string, e.g. [2,3,4,7] -> "2-4,7"
    if (!Array.isArray(indices) || indices.length === 0) return '';
    
    const sorted = Array.from(new Set(indices))
        .map(Number)
        .filter(n => !isNaN(n))
        .sort((a, b) => a - b);
        
    let result = [];
    let start = sorted[0], end = sorted[0];
    
    for (let i = 1; i <= sorted.length; i++) {
        if (sorted[i] === end + 1) {
            end = sorted[i];
        } else {
            result.push(start === end ? `${start}` : `${start}-${end}`);
            start = sorted[i];
            end = sorted[i];
        }
    }
    
    return result.join(', ');
}

export function parseLocation2(loc) {
    // Converts a location string from a url like "2, 5-38" into an array of objects [{start: 2, end: 2}, {start: 5, end: 38}]
    if (!loc || typeof loc !== 'string') return [];
    return loc.split(',')
        .map(part => part.trim())
        .filter(Boolean)
        .flatMap(part => {
            const rangeMatch = part.match(/^(\d+)-(\d+)$/);
            if (rangeMatch) {
                const [start, end] = rangeMatch.slice(1).map(Number);
                if (!isNaN(start) && !isNaN(end)) return [{ start, end }];
            } else {
                const singleValue = Number(part);
                if (!isNaN(singleValue)) return [{ start: singleValue, end: singleValue }];
            }
            return [];
        });
}

export function parseResidueLocations(locStr, shift) {
    // Parses a string like "2, 5-38" into an array of residue numbers as strings ['2', '5', '6', .....], applying a shift if provided
    console.log('Parsing residue locations from:', locStr, 'with shift:', shift);
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

function _parseDomainString(domainsRaw) {
    if (!domainsRaw) return { alphafoldDomains: [], uniprotDomains: [] };
    
    try {
        const jsonFriendlyStr = domainsRaw
            .replace(/\(/g, '[')
            .replace(/\)/g, ']')
            .replace(/'/g, '"');
        const parsed = JSON.parse(jsonFriendlyStr);
        
        const domains = parsed
            .map(entry => {
                if (Array.isArray(entry) && entry.length === 2 &&
                    typeof entry[0] === 'string' && Array.isArray(entry[1]) && entry[1].length === 2) {
                    return {
                        id: entry[0],
                        start: parseInt(entry[1][0], 10),
                        end: parseInt(entry[1][1], 10)
                    };
                }
                return null;
            })
            .filter(d => d !== null && !isNaN(d.start) && !isNaN(d.end) && d.start <= d.end);

        return {
            alphafoldDomains: domains.filter(d => d.id.startsWith('AF')),
            uniprotDomains: domains.filter(d => !d.id.startsWith('AF'))
        };
    } catch (e) {
        console.error('Error parsing domain string:', e);
        return { alphafoldDomains: [], uniprotDomains: [] };
    }
}

export function formatNumber(value) {
    const num = parseFloat(value);
    return !isNaN(num) ? num.toFixed(2) : value;
}
