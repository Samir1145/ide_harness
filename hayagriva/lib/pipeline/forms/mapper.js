const fs = require('fs');
const path = require('path');
const { retrieveContexts } = require('../../core/rag');
const { getChatResponse } = require('../../core/llm-client');
const { validateFormRules } = require('./rules_validator');

/**
 * Maps a form schema onto the Case KV Dictionary, performs targeted RAG fallbacks
 * for missing fields, evaluates rule validations, and outputs the filled form JSON.
 * 
 * @param {string} caseDir - Absolute path to the case directory
 * @param {string} formId - Identifier of the form (e.g. 'aoc-4')
 * @returns {Promise<Object>} The populated and validated form instance data
 */
async function populateFormInstance(caseDir, formId) {
    console.log(`[Form Mapper] Starting population for form "${formId}" in case directory...`);

    // 1. Resolve paths
    const formsRoot = path.join(__dirname, '..', '..', '..', '..', 'forms');
    const schemaPath = path.join(formsRoot, formId, 'schema.json');
    if (!fs.existsSync(schemaPath)) {
        throw new Error(`Form schema for "${formId}" not found in forms registry: ${schemaPath}`);
    }

    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

    const reviewsDir = path.join(caseDir, 'reviews');
    if (!fs.existsSync(reviewsDir)) {
        fs.mkdirSync(reviewsDir, { recursive: true });
    }

    const dictPath = path.join(reviewsDir, 'case_kv_dictionary.json');
    let kvDict = {};
    if (fs.existsSync(dictPath)) {
        try {
            kvDict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
        } catch (_) {}
    }

    const instancePath = path.join(reviewsDir, `filled-${formId}.json`);
    let existingInstance = {};
    if (fs.existsSync(instancePath)) {
        try {
            existingInstance = JSON.parse(fs.readFileSync(instancePath, 'utf8'));
        } catch (_) {}
    }

    const now = new Date().toISOString();
    const populatedFields = {};
    const missingFields = [];

    // Helper to find key in KV dict matching directly or via case-insensitive/alias matching
    function findValueInDict(keyName, labelName) {
        // Direct key check
        if (kvDict[keyName]) return { key: keyName, data: kvDict[keyName] };

        // Try simple lowercase match
        const lowerKey = keyName.toLowerCase();
        for (const k in kvDict) {
            if (k.toLowerCase() === lowerKey) {
                return { key: k, data: kvDict[k] };
            }
        }

        // Try semantic matching with label name
        const cleanLabel = labelName.toLowerCase().replace(/[^a-z0-9]/g, '');
        for (const k in kvDict) {
            const cleanKey = k.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (cleanKey.includes(cleanLabel) || cleanLabel.includes(cleanKey)) {
                return { key: k, data: kvDict[k] };
            }
        }

        return null;
    }

    // 2. Loop through schema sections and map existing variables
    for (const section of schema.sections || []) {
        for (const field of section.fields || []) {
            const key = field.key;
            
            // If field already exists in instance and was modified by user, preserve it
            if (existingInstance[key] && existingInstance[key].modifiedBy === 'user') {
                populatedFields[key] = { ...existingInstance[key], lastUpdated: now };
                continue;
            }

            // Look up in central KV dictionary
            const match = findValueInDict(key, field.label);
            if (match) {
                populatedFields[key] = {
                    value: match.data.value,
                    originalExtractedValue: match.data.originalExtractedValue !== undefined ? match.data.originalExtractedValue : match.data.value,
                    modifiedBy: match.data.modifiedBy || 'llm',
                    lastUpdated: now,
                    source: match.data.source || 'KV dictionary',
                    confidence: match.data.confidence || 'high',
                    explanation: match.data.explanation || 'Mapped from case KV dictionary.',
                    label: field.label,
                    description: field.description,
                    sectionId: section.sectionId
                };
            } else {
                // Key is missing, schedule for targeted RAG lookup
                missingFields.push({ field, sectionId: section.sectionId });
            }
        }
    }

    // 3. Targeted Fallback Lookups for missing fields
    if (missingFields.length > 0) {
        console.log(`[Form Mapper] Scheduled ${missingFields.length} missing fields for targeted lookup.`);
        
        for (const missing of missingFields) {
            const { field, sectionId } = missing;
            const queryText = `Extract "${field.label}". Guidance: ${field.instruction || field.description || 'find the field value'}`;
            
            try {
                // Search case files
                const contexts = await retrieveContexts(caseDir, queryText);
                if (contexts && contexts.length > 0) {
                    console.log(`[Form Mapper] Targeted search found context for "${field.key}"`);
                    
                    const prompt = `You are a legal form extraction assistant. Read the provided document context snippets and extract the value for this specific field.
                    
FIELD TO EXTRACT:
- Key: "${field.key}"
- Label: "${field.label}"
- Description: "${field.description || ''}"
- Guidance: "${field.instruction || ''}"

DOCUMENT CONTEXTS:
${contexts.map(c => `Source: ${c.docName} (Section/Page: ${c.title})\nContent:\n${c.content}`).join('\n\n')}

Extract the value. Respond STRICTLY in this JSON format (no markdown formatting code blocks like \`\`\`json):
{
  "value": "extracted value (string or number, write XXXX if not found)",
  "source": "matching text snippet or page reference",
  "confidence": "high/medium/low",
  "explanation": "brief extraction reason"
}`;

                    const llmRes = await getChatResponse([{ role: 'user', content: prompt }], { timeout: 35000 });
                    let cleanRes = (llmRes || '').trim();
                    if (cleanRes.startsWith('```')) {
                        cleanRes = cleanRes.replace(/^```(json)?/, '').replace(/```$/, '').trim();
                    }

                    let parsed = {};
                    try {
                        parsed = JSON.parse(cleanRes);
                    } catch (_) {}

                    if (parsed && parsed.value !== undefined && parsed.value !== null && parsed.value !== 'XXXX') {
                        // Successfully found value! Pop in form & dict
                        const entry = {
                            value: parsed.value,
                            originalExtractedValue: parsed.value,
                            modifiedBy: 'llm',
                            lastUpdated: now,
                            source: `${contexts[0].docName}: ${parsed.source || 'extracted text'}`,
                            confidence: parsed.confidence || 'medium',
                            explanation: parsed.explanation || 'Extracted during targeted lookup.',
                            label: field.label,
                            description: field.description,
                            sectionId: sectionId
                        };

                        populatedFields[field.key] = entry;

                        // Save back to main case KV dictionary so other forms can reuse
                        kvDict[field.key] = {
                            value: entry.value,
                            originalExtractedValue: entry.value,
                            modifiedBy: 'llm',
                            lastUpdated: now,
                            source: entry.source,
                            confidence: entry.confidence,
                            explanation: entry.explanation
                        };
                        continue;
                    }
                }
            } catch (e) {
                console.error(`[Form Mapper] Targeted fallback search failed for "${field.key}":`, e.message);
            }

            // Default fallback if targeted extraction fails
            populatedFields[field.key] = {
                value: 'XXXX',
                originalExtractedValue: 'XXXX',
                modifiedBy: 'llm',
                lastUpdated: now,
                source: 'N/A',
                confidence: 'low',
                explanation: 'Not found during targeted document lookup.',
                label: field.label,
                description: field.description,
                sectionId: sectionId
            };
        }

        // Write updated case KV dictionary back to disk
        fs.writeFileSync(dictPath, JSON.stringify(kvDict, null, 2), 'utf8');
    }

    // 4. Perform Rule Validation
    const flatData = {};
    for (const key in populatedFields) {
        flatData[key] = populatedFields[key].value;
    }

    const validationFailures = validateFormRules(flatData, schema.rules || []);
    console.log(`[Form Mapper] Rule validation completed: ${validationFailures.length} issues flagged.`);

    // Clear any previous validation errors
    for (const key in populatedFields) {
        delete populatedFields[key].validationError;
    }

    // Map failures back to fields
    for (const fail of validationFailures) {
        for (const fieldKey of fail.affectedFields || []) {
            if (populatedFields[fieldKey]) {
                populatedFields[fieldKey].validationError = fail.message;
            }
        }
    }

    // 5. Save form instance reviews
    fs.writeFileSync(instancePath, JSON.stringify(populatedFields, null, 2), 'utf8');
    console.log(`[Form Mapper] ✓ Saved populated instance to: ${path.basename(instancePath)}`);

    return populatedFields;
}

module.exports = { populateFormInstance };
