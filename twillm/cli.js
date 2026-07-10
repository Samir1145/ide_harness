#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const { createWatcher, ingestFile } = require('./lib/watcher');
const { readIndex } = require('./lib/indexer');
const { query } = require('./lib/rag');
const { loadVault } = require('./lib/vault-loader');

const HELP = `Usage: twillm <case-path>

Options:
  --watch-all    Watch all case directories under <case-path> (or /Documents/)
  --list         List cases in parent dir
  --ingest FILE  Ingest a single file immediately
  --query TEXT          Run query on the case
  --disable-doc2query   Bypass LLM generation during ingestion (Faster uploads)
  -h, --help            Show help
`;

async function bootstrapCase(caseDir) {
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
            settings['files.exclude']['**/wiki'] = true;
            settings['files.exclude']['**/concepts'] = true;
            settings['files.exclude']['wiki'] = true;
            settings['files.exclude']['concepts'] = true;
            settings['files.exclude']['**/wiki/**'] = true;
            settings['files.exclude']['**/concepts/**'] = true;
            settings['files.exclude']['wiki/'] = true;
            settings['files.exclude']['concepts/'] = true;
            fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
        } catch (e) {
            console.warn(`[twillm] failed to write ${dirName}/settings.json for case ${caseDir}:`, e.message);
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
                if (!file.startsWith('.') && file !== 'concepts') scan(filePath);
            } else if (isDoc) {
                const relative = path.relative(caseDir, filePath);
                if (ext === '.md' || ext === '.txt' || lowerFile.endsWith('.wiki.html')) {
                    mdFiles.push({ filePath, relative });
                } else {
                    nonMdFiles.push({ filePath, relative });
                }
            }
        }
    }
    scan(caseDir);

    // 1. Process non-markdown files first to generate companions
    for (const file of nonMdFiles) {
        const alreadyIndexed = index.documents && index.documents.some(d => d.filename === file.relative);
        if (!alreadyIndexed) {
            console.log(`[twillm] bootstrapping companion for ${file.relative}`);
            try {
                const result = await ingestFile(caseDir, file.filePath);
                if (result && result.companionPath) {
                    const compRelative = path.relative(caseDir, result.companionPath);
                    mdFiles.push({ filePath: result.companionPath, relative: compRelative });
                }
            } catch (e) {
                console.error(`[twillm] Ingestion failed for ${file.relative}:`, e.message);
            }
        }
    }

    // 2. Process markdown, text, wiki, and generated companion files
    const updatedIndex = readIndex(caseDir);
    for (const file of mdFiles) {
        const alreadyIndexed = updatedIndex.documents && updatedIndex.documents.some(d => d.filename === file.relative);
        if (!alreadyIndexed) {
            console.log(`[twillm] bootstrapping concepts for ${file.relative}`);
            try {
                await ingestFile(caseDir, file.filePath);
            } catch (e) {
                console.error(`[twillm] Ingestion failed for ${file.relative}:`, e.message);
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
        const dirs = fs.readdirSync(parent).filter(f => {
            const p = path.join(parent, f);
            return fs.statSync(p).isDirectory() && !f.startsWith('.');
        });
        console.log(dirs.join('\n'));
        process.exit(0);
    }

    const docsRoot = path.resolve(caseArg || path.join(process.env.HOME || '', 'Documents'));

    if (watchAll) {
        await runWatchAll(docsRoot);
        return;
    }

    // Single case mode
    const caseDir = fs.realpathSync(caseArg || process.cwd());
    if (!fs.existsSync(path.join(caseDir, 'concepts'))) {
        fs.mkdirSync(path.join(caseDir, 'concepts'), { recursive: true });
    }

    if (command === 'ingest' && commandArg) {
        console.log(`[twillm] Ingesting ${commandArg}...`);
        const result = await ingestFile(caseDir, commandArg);
        if (result) {
            console.log(`[twillm] Ingested ${result.sections} sections to ${result.conceptsDir}`);
        }
        process.exit(result ? 0 : 1);
    }

    if (command === 'query') {
        const result = await query(caseDir, commandArg || 'Hello');
        console.log(JSON.stringify(result, null, 2));
        process.exit(0);
    }

    // Normal watch mode
    console.log(`[twillm] case: ${path.basename(caseDir)}`);
    console.log(`[twillm] watching: ${caseDir}`);

    const watcher = createWatcher(caseDir, {
        async onFileChange(filePath) {
            console.log(`[twillm] ingesting ${path.relative(caseDir, filePath)}`);
            await ingestFile(caseDir, filePath);
        }
    });

    const index = readIndex(caseDir);
    console.log(`[twillm] indexed ${index.documents ? index.documents.length : 0} documents`);

    const { startApiServer } = require('./lib/api-server');
    const apiServer = startApiServer(path.dirname(caseDir), 3210);

    // Bootstrap asynchronously in background so API port 3210 binds immediately
    bootstrapCase(caseDir).catch(err => {
        console.error('[twillm] Bootstrap failed:', err.message);
    });

    process.on('SIGINT', () => {
        console.log('\n[twillm] shutting down');
        watcher.close();
        apiServer.close();
        process.exit(0);
    });
}

async function runWatchAll(docsRoot) {
    console.log(`[twillm] watch-all mode: ${docsRoot}`);

    const caseDirs = fs.readdirSync(docsRoot).filter(f => {
        const p = path.join(docsRoot, f);
        return fs.statSync(p).isDirectory() && !f.startsWith('.');
    });

    console.log(`[twillm] found cases: ${caseDirs.join(', ')}`);

    const watchers = new Map();

    const { startApiServer } = require('./lib/api-server');
    const apiServer = startApiServer(docsRoot, 3210);

    // Bootstrap scan for each case asynchronously
    (async () => {
        for (const caseName of caseDirs) {
            const caseDir = path.join(docsRoot, caseName);
            if (!fs.existsSync(path.join(caseDir, 'concepts'))) {
                fs.mkdirSync(path.join(caseDir, 'concepts'), { recursive: true });
            }
            await bootstrapCase(caseDir);
        }
        console.log('[twillm] All cases bootstrapped.');
    })().catch(err => {
        console.error('[twillm] watch-all bootstrap failed:', err.message);
    });

    // Watch each case directory
    for (const caseName of caseDirs) {
        const caseDir = path.join(docsRoot, caseName);
        const watcher = createWatcher(caseDir, {
            async onFileChange(filePath) {
                const relative = path.relative(caseDir, filePath);
                console.log(`[twillm] ingesting ${caseName}/${relative}`);
                await ingestFile(caseDir, filePath);
            }
        });
        watchers.set(caseName, watcher);
    }

    console.log(`[twillm] watching ${watchers.size} directories for changes...`);

    process.on('SIGINT', () => {
        console.log('\n[twillm] shutting down');
        watchers.forEach(w => w.close());
        apiServer.close();
        process.exit(0);
    });
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
