const csvDataCache = {};

export async function fetchAndParseCSV(url) {
    if (csvDataCache[url]) {
        return csvDataCache[url];
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
                    csvDataCache[url] = results.data;
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
