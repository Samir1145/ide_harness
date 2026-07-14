const fs = require('fs');
const path = require('path');
const { getChatResponse } = require('../../core/llm-client');

/**
 * Performs a schema-less LLM extraction pass over the text of an ingested file,
 * and merges the extracted key-value parameters with citations into the case's central KV dictionary.
 * 
 * @param {string} caseDir - Absolute path to the case directory
 * @param {string} filePath - Absolute path to the original or companion file
 * @param {string} fileContentText - Converted text content of the file
 */
async function extractFileKV(caseDir, filePath, fileContentText) {
    if (!fileContentText || !fileContentText.trim()) {
        return { success: false, error: 'No content to extract' };
    }

    const basename = path.basename(filePath);
    console.log(`[extract-file] Running schema-less extraction on ${basename}...`);

    // Grab a substantial chunk of text to extract facts from
    const textChunk = fileContentText.substring(0, 20000);

    const prompt = `You are a legal data extraction engine. Analyze the following document text and extract any critical key-value facts (entities, company names, registration details, financial balance sheet/profit & loss numbers, dates, signers, auditor info, etc.) that could be useful for compliance form filling (e.g. AOC-4, MGT-7, tax returns).

For each extracted item:
- Define a descriptive camelCase or snake_case key name.
- Return the output STRICTLY as a valid JSON object matching the following structure:
{
  "key_name": {
    "value": "extracted value (string or number)",
    "source": "matching text snippet or page reference",
    "confidence": "high/medium/low",
    "explanation": "brief reason why this value was extracted"
  }
}

Do NOT wrap the output in markdown code blocks like \`\`\`json. Return ONLY the raw JSON string.

DOCUMENT TEXT:
${textChunk}`;

    try {
        const response = await getChatResponse([{ role: 'user', content: prompt }], { timeout: 60000 });
        let cleanResponse = (response || '').trim();
        
        // Strip markdown JSON block ticks if present
        if (cleanResponse.startsWith('```')) {
            cleanResponse = cleanResponse.replace(/^```(json)?/, '').replace(/```$/, '').trim();
        }

        let newKV = {};
        try {
            newKV = JSON.parse(cleanResponse);
        } catch (e) {
            console.error(`[extract-file] Failed to parse LLM JSON response for ${basename}:`, e.message);
            // Try cleaning common issues
            const firstBrace = cleanResponse.indexOf('{');
            const lastBrace = cleanResponse.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1) {
                try {
                    newKV = JSON.parse(cleanResponse.substring(firstBrace, lastBrace + 1));
                } catch (_) {
                    return { success: false, error: 'Invalid JSON format returned by LLM' };
                }
            } else {
                return { success: false, error: 'Invalid JSON format returned by LLM' };
            }
        }

        // Setup reviews directory inside case
        const reviewsDir = path.join(caseDir, 'reviews');
        if (!fs.existsSync(reviewsDir)) {
            fs.mkdirSync(reviewsDir, { recursive: true });
        }

        const dictPath = path.join(reviewsDir, 'case_kv_dictionary.json');
        let currentDict = {};
        if (fs.existsSync(dictPath)) {
            try {
                currentDict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
            } catch (_) {}
        }

        // Merge key-value pairs incrementally
        let keysMerged = 0;
        const now = new Date().toISOString();

        for (const key in newKV) {
            const entry = newKV[key];
            if (entry && entry.value !== undefined && entry.value !== null) {
                // If user has edited a value, preserve the user modification
                const existing = currentDict[key];
                const modifiedBy = existing ? existing.modifiedBy : 'llm';
                const originalValue = existing ? existing.originalExtractedValue : entry.value;
                const finalValue = modifiedBy === 'user' ? existing.value : entry.value;

                currentDict[key] = {
                    value: finalValue,
                    originalExtractedValue: originalValue,
                    modifiedBy: modifiedBy,
                    lastUpdated: now,
                    source: `${basename}: ${entry.source || 'Document text'}`,
                    confidence: entry.confidence || 'medium',
                    explanation: entry.explanation || 'Extracted during ingestion.'
                };
                keysMerged++;
            }
        }

        fs.writeFileSync(dictPath, JSON.stringify(currentDict, null, 2), 'utf8');
        console.log(`[extract-file] ✓ Extracted ${keysMerged} elements from ${basename} and merged into case_kv_dictionary.json`);

        // Sync with SQLite database
        const { getDb } = require('../../core/sqlite-store');
        try {
            const db = getDb(caseDir);
            const relativeFile = path.relative(caseDir, filePath).replace(/\\/g, '/');
            const upsertFact = db.prepare(`
                INSERT INTO case_facts (key, filename, value, source_clause, last_updated)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET
                    filename = excluded.filename,
                    value = CASE WHEN verified_by_user = 1 THEN case_facts.value ELSE excluded.value END,
                    source_clause = excluded.source_clause,
                    last_updated = excluded.last_updated
            `);
            for (const key in newKV) {
                const entry = newKV[key];
                if (entry && entry.value !== undefined && entry.value !== null) {
                    upsertFact.run(
                        key,
                        relativeFile,
                        String(entry.value),
                        entry.source || 'Document text',
                        now
                    );
                }
            }
            console.log(`[extract-file] SQLite case_facts table updated successfully.`);
        } catch (dbErr) {
            console.error('[extract-file] Failed to write facts to SQLite database:', dbErr.message);
        }

        return { success: true, count: keysMerged };
    } catch (err) {
        console.error(`[extract-file] Error extracting file facts for ${basename}:`, err.message);
        return { success: false, error: err.message };
    }
}

module.exports = { extractFileKV };
