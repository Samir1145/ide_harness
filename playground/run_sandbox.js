const fs = require('fs');
const path = require('path');
const { ingestFile } = require('../backend/lib/watcher');

const SANDBOX_DIR = __dirname;
const INPUT_DIR = path.join(SANDBOX_DIR, 'input');
const OUTPUT_DIR = path.join(SANDBOX_DIR, 'output');

// Ensure directories exist
if (!fs.existsSync(INPUT_DIR)) fs.mkdirSync(INPUT_DIR, { recursive: true });
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

async function run() {
    console.log('==================================================');
    console.log('       HAYAGRIVA INGESTION PLAYGROUND / SANDBOX     ');
    console.log('==================================================');
    console.log(`Input Directory (Place raw files here):  ${INPUT_DIR}`);
    console.log(`Output Directory (Splits will generate here): ${OUTPUT_DIR}\n`);

    const files = fs.readdirSync(INPUT_DIR).filter(f => !f.startsWith('.'));

    if (files.length === 0) {
        console.log('ℹ No files found in sandbox/input/.');
        console.log('Please place a PDF, DOCX, or XLSX file in "sandbox/input/" and run this script again:\n');
        console.log('   node sandbox/run_sandbox.js\n');
        return;
    }

    console.log(`Found ${files.length} file(s) to process. Starting ingestion...\n`);

    for (const file of files) {
        const filePath = path.join(INPUT_DIR, file);
        console.log(`Processing: "${file}"`);
        console.log('--------------------------------------------------');

        try {
            // Run core ingest (disabling doc2query LLM generation by default for fast local profiling)
            const result = await ingestFile(OUTPUT_DIR, filePath, true);
            
            if (result) {
                console.log(`✓ SUCCESS: ${file}`);
                console.log(`  - Total Chunks generated: ${result.sections}`);
                console.log(`  - Chunks directory:        sandbox/output/concepts/${path.basename(file, path.extname(file))}/`);
                if (result.companionPath) {
                    console.log(`  - Companion Markdown file: sandbox/output/${path.basename(result.companionPath)}`);
                }
            } else {
                console.warn(`⚠ Processing returned empty result for ${file}`);
            }
        } catch (e) {
            console.error(`✗ FAILED: ${file}`);
            console.error(`  Error detail: ${e.message}`);
        }
        console.log('--------------------------------------------------\n');
    }

    console.log('Sandbox execution completed.');
}

run().catch(e => {
    console.error('Sandbox failed to run:', e.message);
});
