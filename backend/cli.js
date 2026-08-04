#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const { createWatcher, ingestFile, registerUnprocessedFile, updateStatus } = require('./lib/daemon/watcher');
const { readIndex } = require('./lib/core/indexer');
const { query } = require('./lib/core/rag');
const { loadVault } = require('./lib/utils/vault-loader');
const { loadCasesVault } = require('./lib/utils/cases-vault-loader');
const { getConceptsDir, getConversionsDir, getWikiDir } = require('./lib/pipeline/common/helper');

const BINARY_EXTS = ['.pdf', '.docx', '.doc', '.xlsx', '.xls'];

const HELP = `Usage: hayagriva <case-path>

Options:
  --watch-all    Watch all case directories under <case-path> (or /Documents/)
  --list         List cases in parent dir
  --ingest FILE  Ingest a single file immediately
  --query TEXT          Run query on the case
  --disable-doc2query   Bypass LLM generation during ingestion (Faster uploads)
  -h, --help            Show help
`;

async function bootstrapCase(caseDir) {
    if (!caseDir) return;
    const resolved = path.resolve(caseDir);
    const docsRoot = path.resolve(process.env.HOME || '', 'Documents');
    if (resolved === docsRoot) return;

    // Dynamically write/update .theia/settings.json and .vscode/settings.json to hide 'wiki' and 'concepts' database folders from File Explorer
    const configDirs = ['.theia', '.vscode'];
    for (const dirName of configDirs) {
        try {
            const dirPath = path.join(caseDir, dirName);
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
            }
            const settingsPath = path.join(dirPath, 'settings.json');
            let settings = {};
            if (fs.existsSync(settingsPath)) {
                try {
                    settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
                } catch (_) {}
            }
            if (!settings['files.exclude']) {
                settings['files.exclude'] = {};
            }
            settings['files.exclude']['**/.*'] = true;
            settings['files.exclude']['**/.*/**'] = true;
            settings['files.exclude']['.*'] = true;
            settings['files.exclude']['.*/**'] = true;
            settings['files.exclude']['**/.prompts'] = true;
            settings['files.exclude']['**/.prompts/**'] = true;
            settings['files.exclude']['**/.localized'] = true;
            settings['files.exclude']['**/concepts'] = true;
            settings['files.exclude']['**/conversions'] = true;
            settings['files.exclude']['concepts'] = true;
            settings['files.exclude']['conversions'] = true;
            settings['files.exclude']['**/concepts/**'] = true;
            settings['files.exclude']['**/conversions/**'] = true;
            settings['files.exclude']['concepts/'] = true;
            settings['files.exclude']['conversions/'] = true;
            // Never globally exclude *.md — companion .md files are shown inline as caption suffix on parent PDF row
            ['**/wiki', 'wiki', '**/wiki/**', 'wiki/', '**/*.md'].forEach(wKey => {
                delete settings['files.exclude'][wKey];
            });
            settings['files.exclude']['**/.trash'] = true;
            settings['files.exclude']['**/.trash/**'] = true;
            settings['files.exclude']['**/*.status'] = true;
            settings['files.exclude']['**/*.footer'] = true;
            settings['files.exclude']['**/*.cache'] = true;
            settings['files.exclude']['**/CASE_AUDIT.md'] = true;
            settings['files.exclude']['**/hayagriva_settings.json'] = true;
            settings['files.exclude']['**/index.md'] = true;
            settings['explorer.openEditors.visible'] = 0;
            fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
        } catch (e) {
            console.warn(`[hayagriva] failed to write ${dirName}/settings.json for case ${caseDir}:`, e.message);
        }
    }

    const index = readIndex(caseDir);
    const docExts = ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.csv', '.md', '.txt'];
    const nonMdFiles = [];
    const mdFiles = [];
    
    function scan(dir) {
        if (!fs.existsSync(dir)) return;
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            const lowerFile = file.toLowerCase();
            const ext = path.extname(file).toLowerCase();
            const isDoc = docExts.includes(ext) || lowerFile.endsWith('.wiki.html');
            if (stat.isDirectory()) {
                const lower = file.toLowerCase();
                if (!file.startsWith('.') && 
                    lower !== 'concepts' && 
                    lower !== 'wiki' && 
                    lower !== 'conversions' && 
                    !lower.endsWith('_concepts_haya') &&
                    !lower.endsWith('_conversions_haya') &&
                    !lower.endsWith('_wiki_haya') &&
                    lower !== 'reviews' && 
                    lower !== 'drafts' && 
                    lower !== 'exports') {
                    scan(filePath);
                }
            } else if (isDoc) {
                const relative = path.relative(caseDir, filePath);
                const baseLower = file.toLowerCase();
                if (baseLower === 'case_audit.md' || baseLower === 'index.md') {
                    continue;
                }
                if (ext === '.md') {
                    const hasParent = ['.pdf', '.docx', '.doc', '.xlsx', '.xls'].some(parentExt => {
                        const parentFile = filePath.replace(/\.md$/, parentExt);
                        return fs.existsSync(parentFile);
                    });
                    if (hasParent) {
                        continue;
                    }
                }
                if (ext === '.md' || ext === '.txt' || lowerFile.endsWith('.wiki.html')) {
                    mdFiles.push({ filePath, relative });
                } else {
                    nonMdFiles.push({ filePath, relative });
                }
            }
        }
    }
    scan(caseDir);

    // 1. Scan and register non-markdown files as 'unprocessed' if not already in index
    let changed = false;
    for (const file of nonMdFiles) {
        const alreadyIndexed = index.documents && index.documents.some(d => d.filename === file.relative);
        if (!alreadyIndexed) {
            const ext = path.extname(file.filePath).toLowerCase();
            const basename = path.basename(file.filePath, ext);
            // Check if companion exists (e.g. from previous run)
            const conversionsDir = getConversionsDir(caseDir);
            const subfolder = path.dirname(file.relative);
            const destDir = subfolder === '.' ? conversionsDir : path.join(conversionsDir, subfolder);
            const statusPath = path.join(destDir, `${basename}.status`);
            let fileStatus = 'unprocessed';
            if (fs.existsSync(statusPath)) {
                fileStatus = fs.readFileSync(statusPath, 'utf8').trim();
            }
            
            console.log(`[hayagriva] registering file profile: ${file.relative} with status: ${fileStatus}`);
            const { upsertDocument } = require('./lib/core/indexer');
            upsertDocument(index, {
                title: basename,
                filename: file.relative,
                conceptsDir: path.relative(caseDir, path.join(getConceptsDir(caseDir), basename)),
                type: ext.replace('.', ''),
                sections: 0,
                sectionTitles: [],
                ingestedAt: new Date().toISOString(),
                sizeBytes: fs.statSync(file.filePath).size,
                priority: 5,
                documentDate: null,
                status: fileStatus
            });
            changed = true;
        }
    }
    if (changed) {
        const { writeIndex } = require('./lib/core/indexer');
        writeIndex(caseDir, index);
    }

    // 2. Markdown, text, wiki files: only process if NOT auto-generated companions
    //    (companions are Phase 2 — user triggers "Build Concepts" manually)
    const updatedIndex = readIndex(caseDir);
    for (const file of mdFiles) {
        const alreadyIndexed = updatedIndex.documents && updatedIndex.documents.some(d => d.filename === file.relative);
        // Skip auto-generated companion .md files (they have a .status sidecar)
        const companionStatusPath = file.filePath.replace(/\.md$/, '.status');
        const isCompanion = fs.existsSync(companionStatusPath);
        if (!alreadyIndexed && !isCompanion) {
            console.log(`[hayagriva] bootstrapping concepts for ${file.relative}`);
            try {
                await ingestFile(caseDir, file.filePath);
            } catch (e) {
                console.error(`[hayagriva] Ingestion failed for ${file.relative}:`, e.message);
            }
        }
    }
}

async function main() {
    // Load .env file if it exists
    const envPath = path.join(__dirname, '.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        for (const line of envContent.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const index = trimmed.indexOf('=');
            if (index > -1) {
                const key = trimmed.slice(0, index).trim();
                const val = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
                process.env[key] = val;
            }
        }
    }

    // Load encrypted law vault into RAM (no decrypted content ever touches disk)
    loadVault();

    // Load cases vault (judgment summaries) — silently skipped if not yet downloaded
    loadCasesVault();


    const argv = process.argv.slice(2);
    let caseArg = null;
    let watchAll = false;
    let command = null;
    let commandArg = null;

    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--help' || argv[i] === '-h') {
            process.stdout.write(HELP);
            process.exit(0);
        } else if (argv[i] === '--watch-all') {
            watchAll = true;
        } else if (argv[i] === '--disable-doc2query') {
            process.env.DISABLE_DOC2QUERY = 'true';
        } else if (argv[i] === '--list') {
            command = 'list';
        } else if (argv[i] === '--ingest') {
            command = 'ingest';
            commandArg = argv[++i];
        } else if (argv[i] === '--query') {
            command = 'query';
            commandArg = argv[++i];
        } else if (!argv[i].startsWith('-')) {
            caseArg = argv[i];
        }
    }

    if (command === 'list') {
        const parent = caseArg || path.join(process.env.HOME || '', 'Documents');
        const SYSTEM_DIRS = ['concepts', 'conversions', 'wiki', 'drafts', 'exports', 'reviews', 'node_modules'];
        const dirs = fs.readdirSync(parent).filter(f => {
            const p = path.join(parent, f);
            return fs.statSync(p).isDirectory() && !f.startsWith('.') && !SYSTEM_DIRS.includes(f.toLowerCase());
        });
        console.log(dirs.join('\n'));
        process.exit(0);
    }

    const docsRoot = path.resolve(caseArg || path.join(process.env.HOME || '', 'Documents'));

    if (watchAll) {
        await runWatchAll(docsRoot);
        return;
    }

const repoRoot = path.resolve(__dirname, '..');

function isProjectRepoRoot(dir) {
    if (!dir) return false;
    try {
        const resolved = path.resolve(dir);
        if (resolved === repoRoot) return true;
        if (fs.existsSync(path.join(resolved, 'frontend/applications/electron')) &&
            fs.existsSync(path.join(resolved, 'backend/package.json'))) {
            return true;
        }
    } catch (_) {}
    return false;
}

    // Single case mode
    const caseDir = fs.realpathSync(caseArg || process.cwd());
    if (!isProjectRepoRoot(caseDir)) {
        getConceptsDir(caseDir);
    }

    if (command === 'ingest' && commandArg) {
        console.log(`[hayagriva] Ingesting ${commandArg}...`);
        const result = await ingestFile(caseDir, commandArg);
        if (result) {
            console.log(`[hayagriva] Ingested ${result.sections} sections to ${result.conceptsDir}`);
        }
        process.exit(result ? 0 : 1);
    }

    if (command === 'query') {
        const result = await query(caseDir, commandArg || 'Hello');
        console.log(JSON.stringify(result, null, 2));
        process.exit(0);
    }

    // Normal watch mode
    console.log(`[hayagriva] case: ${path.basename(caseDir)}`);
    console.log(`[hayagriva] watching: ${caseDir}`);

    const watcher = createWatcher(caseDir, {
        async onFileChange(filePath) {
            const ext = path.extname(filePath).toLowerCase();
            const relative = path.relative(caseDir, filePath);
            if (BINARY_EXTS.includes(ext)) {
                // Set status dot 1 to 'processing' (blue dot) immediately on drop
                updateStatus(caseDir, relative, 'processing');
                // D1: Auto-extract Phase 1 immediately on file drop (no user action needed)
                ingestFile(caseDir, filePath, { conversionOnly: true }).catch(err => {
                    console.error('[Auto-Extract] Phase 1 failed:', err.message);
                });
            } else {
                // .md / .txt / .wiki.html: register as unprocessed
                registerUnprocessedFile(caseDir, filePath).catch(err => {
                    console.error('[Watcher Queue] Failed to register unprocessed file:', err.message);
                });
            }
        }
    });

    const index = readIndex(caseDir);
    console.log(`[hayagriva] indexed ${index.documents ? index.documents.length : 0} documents`);

    const { startApiServer } = require('./lib/api-server');
    const port = parseInt(process.env.HAYAGRIVA_API_PORT || '3210', 10);
    const apiServer = startApiServer(path.dirname(caseDir), port);

    // Bootstrap asynchronously in background so API port binds immediately
    bootstrapCase(caseDir).catch(err => {
        console.error('[hayagriva] Bootstrap failed:', err.message);
    });

    process.on('SIGINT', () => {
        console.log('\n[hayagriva] shutting down');
        watcher.close();
        apiServer.close();
        process.exit(0);
    });
}


async function runWatchAll(docsRoot) {
    console.log(`[hayagriva] watch-all mode: ${docsRoot}`);

    const SYSTEM_DIRS = ['concepts', 'conversions', 'wiki', 'drafts', 'exports', 'reviews', 'node_modules'];
    const caseDirs = fs.readdirSync(docsRoot).filter(f => {
        const p = path.join(docsRoot, f);
        return fs.statSync(p).isDirectory() && !f.startsWith('.') && !SYSTEM_DIRS.includes(f.toLowerCase());
    });

    console.log(`[hayagriva] found cases: ${caseDirs.join(', ')}`);

    const watchers = new Map();

    const { startApiServer } = require('./lib/api-server');
    const port = parseInt(process.env.HAYAGRIVA_API_PORT || '3210', 10);
    const apiServer = startApiServer(docsRoot, port);

    // Bootstrap scan for existing active cases asynchronously
    (async () => {
        for (const caseName of caseDirs) {
            const caseDir = path.join(docsRoot, caseName);
            if (fs.existsSync(path.join(getConversionsDir(caseDir), 'case_manifest.json')) || fs.existsSync(path.join(caseDir, 'case_manifest.json')) || fs.existsSync(getConceptsDir(caseDir))) {
                await bootstrapCase(caseDir);
            }
        }
        console.log('[hayagriva] Active cases bootstrapped.');
    })().catch(err => {
        console.error('[hayagriva] watch-all bootstrap failed:', err.message);
    });

    // Watch each case directory
    for (const caseName of caseDirs) {
        const caseDir = path.join(docsRoot, caseName);
        const watcher = createWatcher(caseDir, {
            async onFileChange(filePath) {
                const ext = path.extname(filePath).toLowerCase();
                const relative = path.relative(caseDir, filePath);
                if (BINARY_EXTS.includes(ext)) {
                    // Set status dot 1 to 'processing' (blue dot) immediately on drop
                    updateStatus(caseDir, relative, 'processing');
                    // D1: Auto-extract Phase 1 immediately on file drop
                    ingestFile(caseDir, filePath, { conversionOnly: true }).catch(err => {
                        console.error('[Auto-Extract] Phase 1 failed:', err.message);
                    });
                } else {
                    registerUnprocessedFile(caseDir, filePath).catch(err => {
                        console.error('[Watcher Queue] Failed to register unprocessed file:', err.message);
                    });
                }
            }
        });
        watchers.set(caseName, watcher);
    }

    console.log(`[hayagriva] watching ${watchers.size} directories for changes...`);

    process.on('SIGINT', () => {
        console.log('\n[hayagriva] shutting down');
        watchers.forEach(w => w.close());
        apiServer.close();
        process.exit(0);
    });
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
