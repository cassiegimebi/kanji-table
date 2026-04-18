document.addEventListener('DOMContentLoaded', () => {
    const kanjiInput = document.getElementById('kanjiInput');
    const generateBtn = document.getElementById('generateBtn');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const errorContainer = document.getElementById('errorContainer');
    const resultsSection = document.getElementById('resultsSection');
    const kanjiTableBody = document.getElementById('kanjiTableBody');
    const downloadCSVBtn = document.getElementById('downloadCSV');
    const downloadXLSXBtn = document.getElementById('downloadXLSX');

    let currentTableData = [];

    // Helper to format Japanese explanations from Wiktionary
    function parseWiktionaryExtract(extract, meanings, character) {
        if (!extract) return { jpDesc: null, components: "—" };
        
        let cleanedExtract = extract.replace(/\/\*?[^\/]+\//g, '');
        
        // Try to extract the "意義" (Meaning) section
        const meaningMatch = cleanedExtract.match(/===\s*意義\s*===[\s\S]*?([^\n=]+)/i);
        let jpDesc = "";
        
        if (meaningMatch && meaningMatch[1]) {
            jpDesc = meaningMatch[1].trim();
        } else {
            // Find "名詞" section
            const nounMatch = cleanedExtract.match(/===\s*名詞\s*===[\s\S]*?([^\n=]+)/i);
            if (nounMatch && nounMatch[1]) jpDesc = nounMatch[1].trim();
        }

        const etymologyMatch = cleanedExtract.match(/===\s*字源\s*===[\s\S]*?([^\n=]+)/i);
        let etymology = etymologyMatch ? etymologyMatch[1].trim() : "";

        let components = [];
        if (etymology) {
            const kanjiRegex = /[\u4e00-\u9faf]/g;
            const found = etymology.match(kanjiRegex);
            if (found) {
                const ignoreKanjis = new Set(['形','声','音','符','会','意','字','源','本','体','偏','略','説','派','生','部','首','指','事','同','説','略','旧','古','俗','上','下','左','右']);
                components = [...new Set(found)].filter(k => k !== character && !ignoreKanjis.has(k));
            }
        }

        if (!jpDesc && !etymology) return { jpDesc: null, components: components.length ? components.join("、") : "—" };

        let res = "";
        if (jpDesc) res += `[意義] ${jpDesc}`;
        if (etymology) res += (res ? " " : "") + `[字源] ${etymology}`;
        
        return { jpDesc: res, components: components.length ? components.join("、") : "—" };
    }

    async function fetchKanjiData(character) {
        const row = [character, "—", "Not found", "—", "—", "—"];
        
        try {
            // Fetch core kanji stats
            const kanjiRes = await fetch(`https://kanjiapi.dev/v1/kanji/${character}`);
            if (!kanjiRes.ok) throw new Error("Not found");
            const kdata = await kanjiRes.json();

            // Format Readings
            const on = kdata.on_readings || [];
            const kun = kdata.kun_readings || [];
            const readings = [...on, ...kun].join("、");
            row[1] = readings || "—";
            
            // Format Meanings
            row[2] = (kdata.meanings || []).join("; ") || "—";

            // Fetch Compounds via KanjiAPI WORDS endpoint (robust native CORS)
            try {
                const wordsRes = await fetch(`https://kanjiapi.dev/v1/words/${character}`);
                if (wordsRes.ok) {
                    const wordsData = await wordsRes.json();
                    const compounds = [];
                    for (const item of wordsData) {
                        if (!item.variants || item.variants.length === 0) continue;
                        
                        const variant = item.variants[0];
                        const word = variant.written || "";
                        if (!word.includes(character) || word.length <= 1) continue;
                        
                        const reading = variant.pronounced || "";
                        const meaning = (item.meanings[0]?.glosses || []).slice(0, 2).join(", ") || "";
                        
                        compounds.push(`${word}${reading ? `（${reading}）` : ''}: ${meaning}`);
                        if (compounds.length >= 3) break;
                    }
                    row[4] = compounds.join("\n") || "No compounds found";
                }
            } catch (e) {
                row[4] = "Error fetching compounds";
            }

            // Fetch Wiktionary for TRUE Japanese Explanation (origin=* enables CORS)
            try {
                const wikRes = await fetch(`https://ja.wiktionary.org/w/api.php?action=query&prop=extracts&explaintext=1&titles=${character}&format=json&origin=*`);
                if (wikRes.ok) {
                    const wikData = await wikRes.json();
                    
                    let extract = "";
                    const pages = wikData.query?.pages || {};
                    for (const pid in pages) {
                        extract = pages[pid].extract || "";
                    }

                    let parsed = parseWiktionaryExtract(extract, kdata.meanings, character);
                    
                    row[3] = parsed.components;
                    
                    if (parsed.jpDesc) {
                        row[4] = parsed.jpDesc;
                    } else {
                        // Fallback
                        row[4] = `音読み：${(kdata.on_readings||[]).join('、')}　訓読み：${(kdata.kun_readings||[]).join('、')}　意味：${kdata.meanings?.[0]||''}`;
                    }
                }
            } catch (e) {
                row[4] = `音読み：${(kdata.on_readings||[]).join('、')}　意味：${kdata.meanings?.[0]||''}`;
            }

        } catch (err) {
            console.error(err);
        }

        return row;
    }

    generateBtn.addEventListener('click', async () => {
        const input = kanjiInput.value.trim();
        if (!input) return;

        // Parse input to keep unique Kanji characters
        let tokens = input.split("");
        tokens = [...new Set(tokens.filter(c => /[\u4e00-\u9fff]/.test(c)))];

        if (tokens.length === 0) {
            showError("Please enter valid kanji characters.");
            return;
        }

        hideError();
        resultsSection.classList.add('hidden');
        loadingIndicator.classList.remove('hidden');
        generateBtn.disabled = true;

        currentTableData = [];
        kanjiTableBody.innerHTML = '';

        try {
            for (const char of tokens) {
                const rowData = await fetchKanjiData(char);
                currentTableData.push(rowData);
                
                const tr = document.createElement('tr');
                rowData.forEach(cell => {
                    const td = document.createElement('td');
                    td.textContent = cell;
                    // Preserve newlines for compounds
                    td.style.whiteSpace = 'pre-line';
                    tr.appendChild(td);
                });
                kanjiTableBody.appendChild(tr);
            }
            resultsSection.classList.remove('hidden');
        } catch (e) {
            showError("An error occurred while generating the table.");
        } finally {
            loadingIndicator.classList.add('hidden');
            generateBtn.disabled = false;
        }
    });

    // Handle Enter key
    kanjiInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') generateBtn.click();
    });

    // Error handling
    function showError(msg) {
        errorContainer.textContent = msg;
        errorContainer.classList.remove('hidden');
    }
    function hideError() {
        errorContainer.classList.add('hidden');
    }

    // CSV Download
    downloadCSVBtn.addEventListener('click', () => {
        if (!currentTableData.length) return;
        const headers = ["Kanji", "Reading", "Meaning", "Components", "Japanese Explanation", "Compounds"];
        
        let csvContent = "\uFEFF" + headers.join(",") + "\n";
        currentTableData.forEach(row => {
            const escapedRow = row.map(v => `"${(v||"").replace(/"/g, '""')}"`);
            csvContent += escapedRow.join(",") + "\n";
        });
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'kanji_table.csv';
        a.click();
        URL.revokeObjectURL(url);
    });

    // XLSX Download via SheetJS
    downloadXLSXBtn.addEventListener('click', () => {
        if (!currentTableData.length || typeof XLSX === 'undefined') return;
        
        const headers = ["Kanji", "Reading", "Meaning", "Components", "Japanese Explanation", "Compounds"];
        const worksheet = XLSX.utils.aoa_to_sheet([headers, ...currentTableData]);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Kanji Reference");
        
        XLSX.writeFile(workbook, "kanji_table.xlsx");
    });
});

// Polyfill for array.append instead of array.push (mistake on line 42+)
Array.prototype.append = Array.prototype.push;
