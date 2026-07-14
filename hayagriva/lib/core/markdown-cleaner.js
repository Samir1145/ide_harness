const path = require('path');
const fs = require('fs');
const { getChatResponse } = require('./llm-client');

/**
 * Loads case settings from hayagriva_settings.json.
 */
function loadCaseSettings(caseDir) {
    const settingsPath = path.join(caseDir, 'hayagriva_settings.json');
    if (fs.existsSync(settingsPath)) {
        try {
            return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        } catch (e) {
            console.error('[Markdown Cleaner] Failed to load case settings:', e.message);
        }
    }
    return {};
}

/**
 * Unwraps lines that are hard-wrapped by Pandoc within the same paragraph block,
 * keeping lists, headers, tables, and signature envelope fields separate.
 */
function unwrapMarkdown(text) {
    let lines = text.split('\n');
    let unwrapped = [];
    let currentParagraph = '';

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        let trimmed = line.trim();

        // Empty line ends the current paragraph block
        if (trimmed === '') {
            if (currentParagraph) {
                unwrapped.push(currentParagraph);
                currentParagraph = '';
            }
            unwrapped.push('');
            continue;
        }

        // Structural elements that must NOT be joined
        if (trimmed.startsWith('#') || 
            trimmed.startsWith('*') || 
            trimmed.startsWith('-') || 
            trimmed.startsWith('|') || 
            trimmed.startsWith('>') || 
            /^\d+\.\s+/.test(trimmed) ||
            /^[a-zA-Z\s]+:/.test(trimmed) || // Matches Place:, Subject:, Ref:, Dated:
            trimmed.startsWith('Ref.') ||
            trimmed.startsWith('Place:') ||
            trimmed.startsWith('To,') ||
            trimmed.startsWith('Subject:') ||
            trimmed.startsWith('___') ||
            trimmed.startsWith('(')) { // Matches list numbers like (a), (1), (i)
            
            if (currentParagraph) {
                unwrapped.push(currentParagraph);
                currentParagraph = '';
            }
            unwrapped.push(line);
            continue;
        }

        // Otherwise join continuous paragraph text
        if (currentParagraph) {
            currentParagraph += ' ' + trimmed;
        } else {
            currentParagraph = line;
        }
    }

    if (currentParagraph) {
        unwrapped.push(currentParagraph);
    }

    return unwrapped.join('\n');
}

/**
 * Fallback heuristic cleaner using regular expressions.
 */
function cleanWithRegex(rawMd) {
    console.log('[Markdown Cleaner] Running Regex/Heuristic post-processing pass...');
    
    // 1. Resolve Pandoc's escaping of standard markdown syntax
    let text = rawMd
        .replace(/\\([\.\[\]\_\*\(\)\~`\|])/g, '$1')
        .replace(/\\/g, '');

    // Normalize carriage returns
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // 2. Unwrap hard paragraph breaks
    text = unwrapMarkdown(text);

    // 3. Promote bold template headers to H2 headers
    let lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        let trimmed = line.trim();
        if (trimmed.startsWith('**') && trimmed.endsWith('**')) {
            let inner = trimmed.slice(2, -2).trim();
            // Outlines: A., I., 1., a., etc. or specific legal heading terms
            if (/^[A-Z0-9]+[\.\-\)]\s+/.test(inner) || 
                /^[a-z][\.\)]\s+/.test(inner) || 
                /^(Verification|Enclosures|Subject|Annexure|Compliance|Form\s+[A-Z])/i.test(inner)) {
                lines[i] = `## ${inner}`;
            }
        }
    }

    return lines.join('\n');
}

/**
 * Prompts the configured LLM to format and structure the raw markdown layout
 * without changing the words.
 */
async function cleanWithLlm(rawMd, caseDir) {
    console.log('[Markdown Cleaner] Routing markdown layout cleaning to LLM...');
    const systemPrompt = `You are a legal document formatting helper. Your task is to clean up raw converted markdown text.

Follow these strict rules:
1. Strip all backslash escapes (e.g. change 1\\. to 1., \\[ to [, \\( to (, \\* to *).
2. Promote bold title paragraphs to proper H2/H3 headings (e.g. convert "**A. Governing framework**" to "## A. Governing framework", "**Verification**" to "## Verification").
3. Unwrap hard line breaks within paragraphs so that paragraphs form continuous flowing lines of text. Keep list items, tables, and signature/address lines on separate lines as intended.
4. CRITICAL: Under no circumstances are you allowed to summarize, rephrase, correct wording, or change any characters of the legal text itself. Every word, date, name, and placeholder must remain exactly identical to the input.`;

    const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: rawMd }
    ];

    try {
        const cleaned = await getChatResponse(messages, { 
            caseDir, 
            timeout: 25000 // 25s timeout limit for large documents
        });
        if (cleaned && cleaned.trim().length > 0) {
            console.log('[Markdown Cleaner] LLM cleaning pass completed successfully.');
            return cleaned.trim();
        }
        throw new Error('LLM returned empty output');
    } catch (err) {
        console.warn(`[Markdown Cleaner] LLM cleaning pass failed: ${err.message}. Invoking Regex fallback.`);
        return cleanWithRegex(rawMd);
    }
}

/**
 * Hybrid Markdown Cleaner entry point.
 */
async function cleanMarkdown(rawMd, caseDir) {
    if (!rawMd) return '';
    
    const settings = loadCaseSettings(caseDir);
    const profile = settings.processingProfile || 'standard';
    
    // If the case is set to 'lite' profile, bypass the LLM entirely
    if (profile === 'lite') {
        console.log('[Markdown Cleaner] Ingestion profile is Lite: Bypassing LLM pass.');
        return cleanWithRegex(rawMd);
    }

    return cleanWithLlm(rawMd, caseDir);
}

module.exports = {
    cleanMarkdown,
    cleanWithRegex,
    cleanWithLlm
};
