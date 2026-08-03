'use strict';

const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ACCOUNT_ID = 'f0b9b9d65437d2ef1c98d46b1c33337b';
const ACCESS_KEY_ID = '2401daa91ebf6faa34af796364b5f0a5';
const SECRET_ACCESS_KEY = 'd3149c7c8fda52c623542369d3fd55a8b3dcdd4f0e262774b505d7f8800e953f';
const BUCKET_NAME = 'hayagriva';

const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: ACCESS_KEY_ID,
        secretAccessKey: SECRET_ACCESS_KEY,
    },
});

const ROOT_DIR = path.join(__dirname, '..', '..');
const AGENT_PACKS_DIR = path.join(ROOT_DIR, 'vault', 'agent_packs');
const DATA_VAULTS_DIR = path.join(ROOT_DIR, 'vault', 'data_vaults');
const MODELS_DIR = path.join(ROOT_DIR, 'models', 'llm', 'llamafile');

// In-memory download progress tracker: { [itemId]: { progressPct: 0, status: 'downloading'|'extracting'|'completed'|'error', error: null } }
const activeJobs = new Map();

function ensureDirectories() {
    [AGENT_PACKS_DIR, DATA_VAULTS_DIR, MODELS_DIR].forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });
}

/**
 * Maps asset catalog IDs to R2 keys and local extraction target paths.
 */
const CATALOG_MANIFEST = {
    // Agent Packs
    'legal_agents.vlt': {
        type: 'agent_pack',
        r2Key: 'agent_packs/legal_agents.vlt',
        targetDir: path.join(AGENT_PACKS_DIR, 'legal_agents.vlt'),
        isZip: true
    },
    'finance_agents.vlt': {
        type: 'agent_pack',
        r2Key: 'agent_packs/finance_agents.vlt',
        targetDir: path.join(AGENT_PACKS_DIR, 'finance_agents.vlt'),
        isZip: true
    },
    'coding_agents.vlt': {
        type: 'agent_pack',
        r2Key: 'agent_packs/coding_agents.vlt',
        targetDir: path.join(AGENT_PACKS_DIR, 'coding_agents.vlt'),
        isZip: true
    },
    // LLM Engines
    'legalparam-2.9b': {
        type: 'model',
        r2Key: 'models/legalparam-2.9b.gguf',
        targetFilePath: path.join(MODELS_DIR, 'legalparam', 'legalparam-2.9b.gguf'),
        isZip: false
    },
    'financeparam-2.9b': {
        type: 'model',
        r2Key: 'models/financeparam-2.9b.gguf',
        targetFilePath: path.join(MODELS_DIR, 'financeparam', 'financeparam-2.9b.gguf'),
        isZip: false
    },
    // Domain Data Vaults
    'cases_vault': {
        type: 'data_vault',
        r2Key: 'vaults/cases_vault.zip',
        targetDir: path.join(DATA_VAULTS_DIR, 'cases'),
        isZip: true
    },
    'laws_vault': {
        type: 'data_vault',
        r2Key: 'vaults/laws_vault.zip',
        targetDir: path.join(DATA_VAULTS_DIR, 'laws'),
        isZip: true
    },
    'documents_vault': {
        type: 'data_vault',
        r2Key: 'vaults/documents_vault.zip',
        targetDir: path.join(DATA_VAULTS_DIR, 'documents'),
        isZip: true
    },
    'forms_vault': {
        type: 'data_vault',
        r2Key: 'vaults/forms_vault.zip',
        targetDir: path.join(DATA_VAULTS_DIR, 'forms'),
        isZip: true
    }
};

/**
 * Check if a catalog item is installed locally.
 */
function isItemInstalled(itemId) {
    const info = CATALOG_MANIFEST[itemId];
    if (!info) return false;

    if (info.targetFilePath) {
        return fs.existsSync(info.targetFilePath) && fs.statSync(info.targetFilePath).size > 0;
    }
    if (info.targetDir) {
        return fs.existsSync(info.targetDir) && fs.readdirSync(info.targetDir).length > 0;
    }
    return false;
}

/**
 * Get current installation status for all catalog items.
 */
function getCatalogStatus() {
    const status = {};
    for (const [id, info] of Object.entries(CATALOG_MANIFEST)) {
        const isInstalled = isItemInstalled(id);
        const job = activeJobs.get(id);

        status[id] = {
            installed: isInstalled,
            status: isInstalled ? 'installed' : (job ? job.status : 'available'),
            progressPct: job ? job.progressPct : (isInstalled ? 100 : 0),
            error: job ? job.error : null
        };
    }
    return status;
}

/**
 * Extract a zip file to a target directory cleanly using shell `unzip`.
 */
function extractZip(zipFilePath, targetDir) {
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }
    console.log(`[Vault Importer] Extracting "${zipFilePath}" -> "${targetDir}"...`);
    execSync(`unzip -o -q "${zipFilePath}" -d "${targetDir}"`, { stdio: 'pipe' });
    console.log(`[Vault Importer] ✓ Extraction complete: "${targetDir}"`);
}

/**
 * 1-Click Download and Install from Cloudflare R2 bucket.
 */
async function downloadAndInstall(itemId) {
    const itemInfo = CATALOG_MANIFEST[itemId];
    if (!itemInfo) {
        throw new Error(`Unknown catalog item: "${itemId}"`);
    }

    if (activeJobs.has(itemId) && activeJobs.get(itemId).status === 'downloading') {
        return { success: true, message: 'Download already in progress.' };
    }

    ensureDirectories();

    const job = { progressPct: 0, status: 'downloading', error: null };
    activeJobs.set(itemId, job);

    // Run async background worker
    (async () => {
        const tmpFile = path.join(ROOT_DIR, `branding`, `resources`, `.tmp_download_${Date.now()}_${itemId.replace(/[^a-zA-Z0-9]/g, '_')}`);
        fs.mkdirSync(path.dirname(tmpFile), { recursive: true });

        try {
            console.log(`[Vault Importer] Starting R2 download for "${itemId}" (${itemInfo.r2Key})...`);
            const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: itemInfo.r2Key });
            const response = await s3.send(command);

            const totalBytes = parseInt(response.ContentLength || '0', 10);
            let downloadedBytes = 0;

            const writeStream = fs.createWriteStream(tmpFile);

            for await (const chunk of response.Body) {
                downloadedBytes += chunk.length;
                writeStream.write(chunk);
                if (totalBytes > 0) {
                    job.progressPct = Math.min(99, Math.round((downloadedBytes / totalBytes) * 100));
                }
            }

            await new Promise((resolve, reject) => {
                writeStream.end();
                writeStream.on('finish', resolve);
                writeStream.on('error', reject);
            });

            console.log(`[Vault Importer] Downloaded ${downloadedBytes} bytes for "${itemId}". Processing installation...`);
            job.status = 'extracting';
            job.progressPct = 99;

            if (itemInfo.isZip) {
                extractZip(tmpFile, itemInfo.targetDir);
            } else if (itemInfo.targetFilePath) {
                fs.mkdirSync(path.dirname(itemInfo.targetFilePath), { recursive: true });
                fs.copyFileSync(tmpFile, itemInfo.targetFilePath);
                console.log(`[Vault Importer] ✓ Moved GGUF model -> "${itemInfo.targetFilePath}"`);
            }

            // Cleanup temp file
            if (fs.existsSync(tmpFile)) {
                fs.unlinkSync(tmpFile);
            }

            job.status = 'completed';
            job.progressPct = 100;
            console.log(`[Vault Importer] ✓ Successfully installed "${itemId}"!`);
        } catch (err) {
            console.error(`[Vault Importer Error] Failed installing "${itemId}":`, err);
            job.status = 'error';
            job.error = err.message;

            if (fs.existsSync(tmpFile)) {
                try { fs.unlinkSync(tmpFile); } catch (_) {}
            }
        }
    })();

    return { success: true, message: `Started downloading ${itemId}` };
}

/**
 * Offline / Local File Import handler.
 */
function installFromLocalPath(sourcePath, targetItemId) {
    if (!fs.existsSync(sourcePath)) {
        throw new Error(`Source file does not exist: ${sourcePath}`);
    }

    ensureDirectories();

    const ext = path.extname(sourcePath).toLowerCase();
    const basename = path.basename(sourcePath);

    // If targetItemId is provided, use its spec
    if (targetItemId && CATALOG_MANIFEST[targetItemId]) {
        const itemInfo = CATALOG_MANIFEST[targetItemId];
        if (itemInfo.isZip) {
            extractZip(sourcePath, itemInfo.targetDir);
        } else if (itemInfo.targetFilePath) {
            fs.mkdirSync(path.dirname(itemInfo.targetFilePath), { recursive: true });
            fs.copyFileSync(sourcePath, itemInfo.targetFilePath);
        }
        return { success: true, itemId: targetItemId };
    }

    // Auto-detect file type
    if (ext === '.gguf') {
        const modelName = basename.replace('.gguf', '').toLowerCase();
        const targetPath = path.join(MODELS_DIR, modelName, basename);
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.copyFileSync(sourcePath, targetPath);
        return { success: true, type: 'model', targetPath };
    }

    if (ext === '.vlt' || (ext === '.zip' && basename.includes('agent'))) {
        const packName = basename.endsWith('.vlt') ? basename : `${basename.replace('.zip', '')}.vlt`;
        const targetDir = path.join(AGENT_PACKS_DIR, packName);
        extractZip(sourcePath, targetDir);
        return { success: true, type: 'agent_pack', targetDir };
    }

    if (ext === '.zip') {
        const domainName = basename.replace(/_vault.*\.zip$/i, '').replace('.zip', '').toLowerCase();
        const targetDir = path.join(DATA_VAULTS_DIR, domainName);
        extractZip(sourcePath, targetDir);
        return { success: true, type: 'data_vault', targetDir };
    }

    throw new Error(`Unsupported file type: ${ext}`);
}

module.exports = {
    CATALOG_MANIFEST,
    isItemInstalled,
    getCatalogStatus,
    downloadAndInstall,
    installFromLocalPath
};
