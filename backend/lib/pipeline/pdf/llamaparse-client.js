const fs = require('fs');
const path = require('path');

/**
 * LlamaParse Cloud OCR client for converting scanned PDFs to high-quality Markdown.
 */
async function parsePdfWithLlamaParse(filePath, options = {}) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
    }

    const apiKey = options.apiKey || process.env.LLAMA_CLOUD_API_KEY;
    if (!apiKey) {
        throw new Error('LlamaParse API Key is missing. Please configure it in Settings or set LLAMA_CLOUD_API_KEY.');
    }

    let LlamaCloud;
    try {
        const pkg = require('@llamaindex/llama-cloud');
        LlamaCloud = pkg.LlamaCloud || pkg.default || pkg;
    } catch (e) {
        throw new Error(`@llamaindex/llama-cloud package is not installed: ${e.message}`);
    }

    const client = new LlamaCloud({ apiKey });
    const tier = options.tier || 'agentic';

    console.log(`[LlamaParse] Uploading ${path.basename(filePath)} to LlamaParse (tier: ${tier})...`);
    
    // Step 1: Upload PDF file to LlamaCloud
    const file = await client.files.create({
        file: fs.createReadStream(filePath),
        purpose: 'parse'
    });

    console.log(`[LlamaParse] File uploaded (id: ${file.id}). Starting parse job...`);

    // Step 2: Run parsing job (blocks until complete)
    const parseParams = {
        file_id: file.id,
        tier: tier,
        version: 'latest',
        expand: ['markdown']
    };

    if (options.customPrompt && (tier === 'agentic' || tier === 'cost_effective')) {
        parseParams.agentic_options = {
            custom_prompt: options.customPrompt
        };
    }

    const result = await client.parsing.parse(parseParams);

    const jobStatus = result.job ? result.job.status : 'completed';
    console.log(`[LlamaParse] Job finished with status: ${jobStatus}`);

    const pages = (result.markdown && result.markdown.pages) ? result.markdown.pages : [];
    if (pages.length === 0) {
        throw new Error('LlamaParse returned 0 pages of markdown content.');
    }

    // Assemble full markdown with page dividers
    const pageMarkdowns = pages.map((p, idx) => {
        const pageNo = p.page_number !== undefined ? p.page_number : (idx + 1);
        const mdContent = (p.markdown || '').trim();
        return `## Page ${pageNo}\n\n${mdContent}`;
    });

    const fullMarkdown = pageMarkdowns.join('\n\n---\n\n');

    return {
        success: true,
        markdown: fullMarkdown,
        totalPages: pages.length,
        jobStatus: jobStatus,
        fileId: file.id
    };
}

/**
 * Tests the validity of a LlamaParse API Key by creating a client instance and querying files.
 */
async function testLlamaParseConnection(apiKey) {
    if (!apiKey) {
        return { success: false, message: 'API key is required.' };
    }

    try {
        let LlamaCloud;
        try {
            const pkg = require('@llamaindex/llama-cloud');
            LlamaCloud = pkg.LlamaCloud || pkg.default || pkg;
        } catch (e) {
            return { success: false, message: `@llamaindex/llama-cloud is not installed: ${e.message}` };
        }

        const client = new LlamaCloud({ apiKey });
        // Attempt a lightweight metadata list call
        if (client.files && typeof client.files.list === 'function') {
            await client.files.list({ limit: 1 });
        }
        return { success: true, message: 'LlamaParse API Key is valid and connected!' };
    } catch (err) {
        return { success: false, message: `LlamaParse Connection Failed: ${err.message}` };
    }
}

module.exports = {
    parsePdfWithLlamaParse,
    testLlamaParseConnection
};
