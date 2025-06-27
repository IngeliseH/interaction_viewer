export async function loadData() {
    return new Promise((resolve, reject) => {
        Papa.parse('all_interface_analysis_2025.06.05.csv', {
            download: true,
            header: true,
            dynamicTyping: true,
            skipEmptyLines: true,
            complete: (results) => {
                if (results.errors.length) {
                    console.error("Parsing errors:", results.errors);
                    reject(results.errors);
                } else {
                    // Process data
                    const data = results.data.map(row => ({
                        ...row,
                        Proteins: `${row.Protein1_Domain || ''}+${row.Protein2_Domain || ''}`,
                        min_pae: parseFloat(row.min_pae) || 0,
                        avg_pae: parseFloat(row.avg_pae) || 0,
                        iptm: parseFloat(row.iptm) || 0,
                        pdockq: parseFloat(row.pdockq) || 0,
                        max_promiscuity: parseFloat(row.max_promiscuity) || 0,
                        rop: parseFloat(row.rop) || 0,
                        size: parseFloat(row.size) || 0,
                        evenness: parseFloat(row.evenness) || 0
                    }));
                    resolve(data);
                }
            },
            error: (error) => reject(error)
        });
    });
}