const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const xlsx = require('xlsx');
const { query, retrieveContexts, buildPrompt } = require('./core/rag');
const { ingestFile, updateStatus, queueForLazyProcessing, startLazyWorker, ensureAuditDocs } = require('./daemon/watcher');
const { pendingPdfQueue, completedPdfSet } = require('./daemon/lazy_pdf_worker');
const { streamChat } = require('./core/llm-client');
const { resolveTrigger, searchLaws, getVaultVersion, isVaultReady } = require('./utils/vault-loader');
const { searchCases, isCasesVaultReady, getCasesVaultVersion } = require('./utils/cases-vault-loader');
const { getVaultStatus, downloadAndInstallVault, activateLicense, onProgress, onStatus } = require('./utils/vault-manager');
const { getConversionsDir, getConceptsDir, getWikiDir } = require('./pipeline/common/helper');
const crypto = require('crypto');

function resolveCaseDir(docsRoot, caseParam) {
    const caseName = caseParam || getDefaultCaseName(docsRoot);
    if (caseName && (caseName.startsWith('/') || caseName.includes(':\\') || caseName.startsWith('file:///'))) {
        let clean = caseName;
        if (clean.startsWith('file:///')) {
            clean = clean.substring(7);
            if (process.platform === 'win32' && clean.startsWith('/')) {
                clean = clean.substring(1);
            }
        }
        return clean;
    }
    return path.join(docsRoot, caseName || '');
}

const DEFAULT_SETTINGS = {
    processingProfile: 'lite',
    activeMode: 'lite',
    activeDomain: 'insolvency',
    remindLibreOffice: true,
    llamaCloudApiKey: 'llx-GYZ8XAQIJv5bzd4SA7pKd2af0BgqKgZ0ipPD7TNWxNPlCy1a',
    llamaCloudTier: 'agentic'
};

let activeEngineDomain = 'legal';

function killProcessOnPort(port) {
    try {
        const { execSync } = require('child_process');
        const output = execSync(`lsof -t -i:${port}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
        if (!output) return;
        
        const pids = output.split('\n').map(p => parseInt(p.trim(), 10)).filter(Boolean);
        for (const pid of pids) {
            if (pid > 0 && pid !== process.pid) {
                try {
                    process.kill(pid, 'SIGKILL');
                    console.log(`[Engine Lifecycle] Safely terminated process PID ${pid} on port ${port}`);
                } catch (_) {}
            }
        }
    } catch (_) {
        // Expected when no process is listening on port (lsof exit code 1)
    }
}

// D8: Sweep .trash/ items older than 7 days at bootstrap
function sweepTrash(caseDir) {
    try {
        const trashDir = path.join(caseDir, '.trash');
        const expiryFile = path.join(trashDir, '.expiry.json');
        if (!fs.existsSync(expiryFile)) return;
        const expiry = JSON.parse(fs.readFileSync(expiryFile, 'utf8'));
        const now = Date.now();
        let changed = false;
        for (const [key, ts] of Object.entries(expiry)) {
            if (now > ts) {
                const p = path.join(trashDir, key);
                try { fs.rmSync(p, { recursive: true, force: true }); } catch (_) {}
                delete expiry[key];
                changed = true;
                console.log(`[Trash Sweep] Permanently deleted expired item: ${key}`);
            }
        }
        if (changed) {
            fs.writeFileSync(expiryFile, JSON.stringify(expiry, null, 2), 'utf8');
        }
    } catch (e) {
        console.warn('[Trash Sweep] Error:', e.message);
    }
}


function ensureCaseSettings(caseDir) {

    try {
        if (!caseDir) return;
        const resolved = path.resolve(caseDir);
        const docsRoot = path.resolve(process.env.HOME || '', 'Documents');
        if (resolved === docsRoot) return;

        const configDirs = ['.theia', '.vscode'];
        for (const dirName of configDirs) {
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
            let changed = false;
            const excludeRules = {
                '**/.*': true,
                '**/.*/**': true,
                '.*': true,
                '.*/**': true,
                '**/.prompts': true,
                '**/.prompts/**': true,
                '**/.localized': true,
                '**/.trash': true,
                '**/.trash/**': true,
                '**/concepts': true,
                '**/conversions': true,
                '**/summaries': true,
                '**/reviews': true,
                '**/*_conversions_haya': true,
                '**/*_concepts_haya': true,
                '**/*_wiki_haya': true,
                '**/*_conversions_haya/**': true,
                '**/*_concepts_haya/**': true,
                '**/*_wiki_haya/**': true,
                '*_conversions_haya': true,
                '*_concepts_haya': true,
                '*_wiki_haya': true,
                'concepts': true,
                'conversions': true,
                'summaries': true,
                'reviews': true,
                '**/concepts/**': true,
                '**/conversions/**': true,
                '**/summaries/**': true,
                '**/reviews/**': true,
                'concepts/': true,
                'conversions/': true,
                'summaries/': true,
                'reviews/': true,
                '**/*.status': true,
                '**/*.error': true,
                '**/*.footer': true,
                '**/*.cache': true,
                '**/index.json': true,
                '**/index.sqlite': true,
                '**/sqlite.db': true,
                '**/case_manifest.json': true,
                '**/case_kv_dictionary.json': true,
                '**/CASE_AUDIT.md': true,
                '**/hayagriva_settings.json': true,
                '**/index.md': true,
                '**/.last-launch-build-checksum': true
            };
            for (const [key, val] of Object.entries(excludeRules)) {
                if (settings['files.exclude'][key] !== val) {
                    settings['files.exclude'][key] = val;
                    changed = true;
                }
            }
            // Ensure drafts, exports, and wiki are NEVER excluded
            ['**/wiki', 'wiki', '**/wiki/**', 'wiki/', '**/*.md', '**/drafts', 'drafts', '**/drafts/**', 'drafts/', '**/exports', 'exports', '**/exports/**', 'exports/'].forEach(visibleKey => {
                if (settings['files.exclude'][visibleKey] !== undefined) {
                    delete settings['files.exclude'][visibleKey];
                    changed = true;
                }
            });
            if (settings['explorer.openEditors.visible'] !== 0) {
                settings['explorer.openEditors.visible'] = 0;
                changed = true;
            }
            if (settings['workbench.editor.enablePreview'] !== true) {
                settings['workbench.editor.enablePreview'] = true;
                changed = true;
            }
            if (settings['workbench.editor.limit.enabled'] !== true) {
                settings['workbench.editor.limit.enabled'] = true;
                changed = true;
            }
            if (settings['workbench.editor.limit.value'] !== 2) {
                settings['workbench.editor.limit.value'] = 2;
                changed = true;
            }
            if (settings['workbench.editor.closeOnFileDelete'] !== true) {
                settings['workbench.editor.closeOnFileDelete'] = true;
                changed = true;
            }
            if (changed) {
                fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
                console.log(`[API Server] Dynamic settings updated at: ${settingsPath}`);
            }
        }
    } catch (e) {
        console.warn(`[API Server] Failed to enforce case settings for ${caseDir}:`, e.message);
    }
}

function ensureGlobalUserSettings() {
    try {
        const homeDir = process.env.HOME || process.env.USERPROFILE;
        if (!homeDir) return;
        const globalTheiaDir = path.join(homeDir, '.theia');
        if (!fs.existsSync(globalTheiaDir)) {
            fs.mkdirSync(globalTheiaDir, { recursive: true });
        }
        const settingsPath = path.join(globalTheiaDir, 'settings.json');
        let settings = {};
        if (fs.existsSync(settingsPath)) {
            try {
                settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            } catch (_) {}
        }
        if (!settings['files.exclude']) {
            settings['files.exclude'] = {};
        }
        let changed = false;
        const excludeRules = {
            '**/.*': true,
            '**/.*/**': true,
            '.*': true,
            '.*/**': true,
            '**/.prompts': true,
            '**/.prompts/**': true,
            '**/.localized': true,
            '**/.trash': true,
            '**/.trash/**': true,
            '**/concepts': true,
            '**/conversions': true,
            '**/summaries': true,
            '**/reviews': true,
            'concepts': true,
            'conversions': true,
            'summaries': true,
            'reviews': true,
            '**/concepts/**': true,
            '**/conversions/**': true,
            '**/summaries/**': true,
            '**/reviews/**': true,
            'concepts/': true,
            'conversions/': true,
            'summaries/': true,
            'reviews/': true,
            '**/*.status': true,
            '**/*.error': true,
            '**/*.footer': true,
            '**/*.cache': true,
            '**/index.json': true,
            '**/index.sqlite': true,
            '**/sqlite.db': true,
            '**/case_manifest.json': true,
            '**/case_kv_dictionary.json': true,
            '**/CASE_AUDIT.md': true,
            '**/hayagriva_settings.json': true,
            '**/index.md': true
        };
        for (const [key, val] of Object.entries(excludeRules)) {
            if (settings['files.exclude'][key] !== val) {
                settings['files.exclude'][key] = val;
                changed = true;
            }
        }
        ['**/wiki', 'wiki', '**/wiki/**', 'wiki/', '**/*.md', '**/drafts', 'drafts', '**/drafts/**', 'drafts/', '**/exports', 'exports', '**/exports/**', 'exports/'].forEach(visibleKey => {
            if (settings['files.exclude'][visibleKey] !== undefined) {
                delete settings['files.exclude'][visibleKey];
                changed = true;
            }
        });
        if (settings['explorer.openEditors.visible'] !== 0) {
            settings['explorer.openEditors.visible'] = 0;
            changed = true;
        }
        if (changed) {
            fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
            console.log(`[API Server] Global user settings updated at: ${settingsPath}`);
        }
    } catch (e) {
        console.warn('[API Server] Failed to update global user settings:', e.message);
    }
}

// Automatically enforce global user settings on server load
ensureGlobalUserSettings();

/**
 * Creates a case_manifest.json in caseDir if one does not already exist.
 * This is the workspace domain profile used by llm-client.js to determine
 * which embedding model to use per document (legal vs finance).
 *
 * Fields:
 *   caseId            - Unique ID for the workspace (uuid-style)
 *   domains           - Active domain(s): ["legal"] | ["finance"] | ["legal", "finance"]
 *   activeLlmEngine   - Currently active .gguf file name (hot-swapped on Port 8090)
 *   subscriptionTier  - "starter" | "professional" | "enterprise"
 *   mountedVaultPacks - Installed .vlt agent pack IDs
 *   fileDomains       - Per-file explicit domain tag, e.g. { "balance_sheet.pdf": "finance" }
 *                       Populated at ingestion; overrides extension heuristic in detectDocumentVectorType.
 */
function migrateRootInfrastructureToConversions(caseDir) {
    try {
        if (!caseDir) return;
        const resolved = path.resolve(caseDir);
        const docsRoot = path.resolve(process.env.HOME || '', 'Documents');
        if (resolved === docsRoot) return;

        const conversionsDir = getConversionsDir(caseDir);
        fs.mkdirSync(conversionsDir, { recursive: true });

        const filesToMigrate = ['case_manifest.json', 'CASE_AUDIT.md', 'index.md'];
        for (const fname of filesToMigrate) {
            const rootFile = path.join(caseDir, fname);
            const targetFile = path.join(conversionsDir, fname);
            if (fs.existsSync(rootFile)) {
                try {
                    if (fs.existsSync(targetFile) && path.resolve(rootFile) !== path.resolve(targetFile)) {
                        fs.unlinkSync(rootFile);
                    } else if (!fs.existsSync(targetFile)) {
                        fs.renameSync(rootFile, targetFile);
                    }
                    console.log(`[Infrastructure Migration] Relocated ${fname} to ${path.basename(conversionsDir)}/`);
                } catch (_) {}
            }
        }

        // Migrate any root .footer files
        const rootEntries = fs.readdirSync(caseDir);
        for (const entry of rootEntries) {
            if (entry.toLowerCase().endsWith('.footer')) {
                const rootFooter = path.join(caseDir, entry);
                const targetFooter = path.join(conversionsDir, entry);
                try {
                    if (fs.existsSync(targetFooter) && path.resolve(rootFooter) !== path.resolve(targetFooter)) {
                        fs.unlinkSync(rootFooter);
                    } else if (!fs.existsSync(targetFooter)) {
                        fs.renameSync(rootFooter, targetFooter);
                    }
                    console.log(`[Infrastructure Migration] Relocated ${entry} to ${path.basename(conversionsDir)}/`);
                } catch (_) {}
            }
        }
    } catch (e) {
        console.warn('[Infrastructure Migration] Error:', e.message);
    }
}

/**
 * Creates a case_manifest.json inside conversions/ if one does not already exist.
 * This is the workspace domain profile used by llm-client.js to determine
 * which embedding model to use per document (legal vs finance).
 */
function ensureCaseManifest(caseDir) {
    try {
        if (!caseDir) return;
        const resolved = path.resolve(caseDir);
        const docsRoot = path.resolve(process.env.HOME || '', 'Documents');
        if (resolved === docsRoot) return;

        migrateRootInfrastructureToConversions(caseDir);

        const conversionsDir = getConversionsDir(caseDir);
        const manifestPath = path.join(conversionsDir, 'case_manifest.json');
        const { isDomainLicensed } = require('./utils/license-validator');

        if (fs.existsSync(manifestPath)) {
            // Validate & fill any missing fields from a prior schema version
            let existing = {};
            try { existing = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch (_) {}
            let changed = false;
            if (!existing.caseId) { existing.caseId = crypto.randomUUID(); changed = true; }
            if (!existing.domain) {
                existing.domain = Array.isArray(existing.domains) ? existing.domains[0] : 'unconfigured';
                delete existing.domains; // Enforce single domain per workspace (No multi-domain combining)
                changed = true;
            }
            if (!existing.activeLlmEngine) { existing.activeLlmEngine = 'legalparam-2.9b.gguf'; changed = true; }
            if (!existing.subscriptionTier) { existing.subscriptionTier = 'starter'; changed = true; }
            if (!Array.isArray(existing.mountedVaultPacks)) { existing.mountedVaultPacks = ['legal_agents.vlt']; changed = true; }
            if (!existing.fileDomains) { existing.fileDomains = {}; changed = true; }
            if (existing.vectorMigrationStatus === undefined) { existing.vectorMigrationStatus = 'complete'; changed = true; }
            if (existing.vectorMigrationCheckpoint === undefined) { existing.vectorMigrationCheckpoint = null; changed = true; }
            
            // Check domain license validity
            if (!isDomainLicensed(existing.domain, caseDir)) {
                console.warn(`[API Server] Warning: Workspace domain '${existing.domain}' is not active under Ed25519 license.`);
            }

            if (changed) {
                fs.writeFileSync(manifestPath, JSON.stringify(existing, null, 2), 'utf8');
                console.log(`[API Server] case_manifest.json updated (Single Domain Mode): ${manifestPath}`);
            }
            return;
        }
        // Create fresh manifest with single domain enforcement inside conversions/
        const initialDomain = 'unconfigured';
        const isLicensed = isDomainLicensed(initialDomain, caseDir);
        const manifest = {
            caseId: crypto.randomUUID(),
            domain: initialDomain, // Enforce single domain per workspace
            isDomainLicensed: isLicensed,
            activeLlmEngine: 'legalparam-2.9b.gguf',
            subscriptionTier: 'starter',
            mountedVaultPacks: ['legal_agents.vlt'],
            fileDomains: {},
            vectorMigrationStatus: 'complete',
            vectorMigrationCheckpoint: null
        };
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
        console.log(`[API Server] case_manifest.json created (Unconfigured Domain Mode): ${manifestPath}`);
    } catch (e) {
        console.error('[API Server] ensureCaseManifest error:', e.message);
    }
}

function getDefaultCaseName(docsRoot) {
    try {
        const SYSTEM_DIRS = ['concepts', 'conversions', 'wiki', 'drafts', 'exports', 'reviews', 'node_modules'];
        const dirs = fs.readdirSync(docsRoot).filter(f => {
            const p = path.join(docsRoot, f);
            return fs.statSync(p).isDirectory() && !f.startsWith('.') && !SYSTEM_DIRS.includes(f.toLowerCase());
        });
        if (dirs.length > 0) {
            return dirs[0];
        }
    } catch (_) {}
    return '';
}

module.exports = {
    GET: {
        '/api/hayagriva/cases': (req, res, parsedUrl, docsRoot) => {
            const SYSTEM_DIRS = ['concepts', 'conversions', 'wiki', 'drafts', 'exports', 'reviews', 'node_modules'];
            const dirs = fs.readdirSync(docsRoot).filter(f => {
                const p = path.join(docsRoot, f);
                return fs.statSync(p).isDirectory() && !f.startsWith('.') && !SYSTEM_DIRS.includes(f.toLowerCase());
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ cases: dirs }));
        },

        '/api/hayagriva/wiki-port': (req, res, parsedUrl, docsRoot) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ port: null }));
        },

        '/api/billing/case-summary': (req, res, parsedUrl, docsRoot) => {
            try {
                const caseName = parsedUrl.query.case || '';
                const caseDir = resolveCaseDir(docsRoot, caseName);
                if (!caseDir) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Case directory not specified or not found' }));
                    return;
                }
                const { getCaseLedger } = require('./core/case-billing-store');
                const ledger = getCaseLedger(caseDir);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, ledger }));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        },

        '/api/billing/rate-card': (req, res, parsedUrl, docsRoot) => {
            try {
                const { DEFAULT_TOOL_RATES } = require('./core/case-billing-store');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, rateCard: DEFAULT_TOOL_RATES, currency: 'INR' }));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        },

        '/api/billing/verify-integrity': (req, res, parsedUrl, docsRoot) => {
            try {
                const caseName = parsedUrl.query.case || '';
                const caseDir = resolveCaseDir(docsRoot, caseName);
                if (!caseDir) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Case directory not specified or not found' }));
                    return;
                }
                const { verifyLedgerIntegrity } = require('./core/case-billing-store');
                const integrity = verifyLedgerIntegrity(caseDir);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, integrity }));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        },

        '/api/hayagriva/license/status': (req, res, parsedUrl, docsRoot) => {
            try {
                const caseName = parsedUrl.query.case || '';
                const caseDir = resolveCaseDir(docsRoot, caseName);
                const { getLicenseStatus, checkAgentAccess } = require('./core/license-manager');
                const status = getLicenseStatus();
                const access = checkAgentAccess(caseDir);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, license: status, access }));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        },

        '/api/hayagriva/documents': (req, res, parsedUrl, docsRoot) => {
            const caseName = parsedUrl.query.case || '';
            const caseDir = resolveCaseDir(docsRoot, caseName);
            const isDocsRoot = caseDir && path.resolve(caseDir) === path.resolve(docsRoot);
            if (isDocsRoot || !caseName) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ documents: [], shadowDocuments: [] }));
                return;
            }
            const documents = [];

            // 1. Collect indexed docs from index.json
            const indexPath = path.join(getConceptsDir(caseDir), 'index.json');
            let indexedBasenames = new Set();
            if (fs.existsSync(indexPath)) {
                try {
                    const idx = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
                    for (const doc of (idx.documents || [])) {
                        documents.push({ ...doc, status: doc.status || 'indexed' });
                        indexedBasenames.add(doc.title);
                    }
                } catch (_) {}
            }

            // 2. Scan for statuses in concepts/statuses.json
            const statusesJsonPath = path.join(getConceptsDir(caseDir), 'statuses.json');
            let persistentStatuses = {};
            if (fs.existsSync(statusesJsonPath)) {
                try {
                    persistentStatuses = JSON.parse(fs.readFileSync(statusesJsonPath, 'utf8')) || {};
                } catch (_) {}
            }

            for (const [relative, statusVal] of Object.entries(persistentStatuses)) {
                const ext = path.extname(relative);
                const basename = path.basename(relative, ext);
                if (indexedBasenames.has(basename)) continue;

                const mdPath = path.join(caseDir, relative.replace(/\.[a-zA-Z0-9]+$/, '.md'));
                const pdfPath = path.join(caseDir, relative.replace(/\.[a-zA-Z0-9]+$/, '.pdf'));
                const queueEntry = pendingPdfQueue.find(q => q.filePath === pdfPath);
                documents.push({
                    title: basename,
                    filename: relative,
                    status: statusVal,
                    companionPath: mdPath,
                    totalPages: queueEntry ? queueEntry.totalPages : null,
                    nextPage: queueEntry ? queueEntry.nextPage : null,
                    conversionComplete: completedPdfSet.has(pdfPath)
                });
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ documents }));
        },

        '/api/hayagriva/active-rag-docs': (req, res, parsedUrl, docsRoot) => {
            if (req.method === 'GET') {
                const caseName = parsedUrl.query.case || '';
                const caseDir = resolveCaseDir(docsRoot, caseName);
                const activeDocsPath = path.join(getConceptsDir(caseDir), 'active_rag_docs.json');
                
                let activeFiles = null;
                if (fs.existsSync(activeDocsPath)) {
                    try {
                        const data = JSON.parse(fs.readFileSync(activeDocsPath, 'utf8'));
                        if (data && Array.isArray(data.activeFiles)) {
                            activeFiles = data.activeFiles;
                        }
                    } catch (_) {}
                }
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, activeFiles }));
            } else if (req.method === 'POST') {
                let body = '';
                req.on('data', chunk => body += chunk);
                req.on('end', () => {
                    try {
                        const data = JSON.parse(body);
                        const caseName = data.case || '';
                        const caseDir = resolveCaseDir(docsRoot, caseName);
                        const activeDocsPath = path.join(getConceptsDir(caseDir), 'active_rag_docs.json');
                        
                        fs.writeFileSync(activeDocsPath, JSON.stringify({ activeFiles: data.activeFiles }, null, 2), 'utf8');
                        
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true }));
                    } catch (err) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, error: err.message }));
                    }
                });
            }
        },

        '/api/hayagriva/office-preview': async (req, res, parsedUrl, docsRoot) => {
            const filePath = parsedUrl.query.path || '';
            if (!filePath || !fs.existsSync(filePath)) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('File not found');
                return;
            }

            const ext = path.extname(filePath).toLowerCase();
            try {
                if (ext === '.docx' || ext === '.doc') {
                    const { value } = await mammoth.convertToHtml({ path: filePath });
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {
    background-color: var(--theia-editor-background, #fff);
    color: var(--theia-editor-foreground, #333);
    font-family: var(--theia-editor-font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
    font-size: 14px;
    line-height: 1.6;
    margin: 0;
    padding: 30px;
    display: flex;
    justify-content: center;
  }
  .document-content {
    max-width: 800px;
    width: 100%;
    background: var(--theia-layout-color1, #fff);
    border: 1px solid var(--theia-border-color, #e0e0e0);
    padding: 40px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.05);
    border-radius: 4px;
    overflow-x: auto;
  }
  table { border-collapse: collapse; width: 100%; margin: 15px 0; }
  th, td { border: 1px solid var(--theia-border-color, #ccc); padding: 8px; text-align: left; }
  th { background-color: var(--theia-layout-color2, #f5f5f5); }
  p { margin-bottom: 12px; }
  h1, h2, h3, h4 { margin-top: 20px; margin-bottom: 10px; color: var(--theia-brand-color1, #0ea5e9); }
</style>
<script>
  function syncTheme() {
    if (!window.parent) return;
    const ps = window.parent.getComputedStyle(window.parent.document.documentElement);
    const ds = document.documentElement.style;
    ['--theia-editor-background','--theia-editor-foreground','--theia-editor-font-family',
     '--theia-layout-color1','--theia-layout-color2','--theia-border-color','--theia-brand-color1'].forEach(v => {
      const val = ps.getPropertyValue(v); if (val) ds.setProperty(v, val);
    });
  }
  window.onload = () => {
    syncTheme();
    if (window.parent && window.parent.document.documentElement) {
      new MutationObserver(syncTheme).observe(
        window.parent.document.documentElement,
        { attributes: true, attributeFilter: ['class', 'style'] }
      );
    }
  };
</script>
</head>
<body>
  <div class="document-content">
    ${value}
  </div>
</body>
</html>`);
                } else if (ext === '.xlsx' || ext === '.xls' || ext === '.csv' || ext === '.tsv') {
                    const workbook = ext === '.csv' || ext === '.tsv' ? xlsx.read(fs.readFileSync(filePath, 'utf8'), { type: 'string' }) : xlsx.readFile(filePath);
                    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                    res.end(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {
    background-color: var(--theia-editor-background, #fff);
    color: var(--theia-editor-foreground, #333);
    font-family: var(--theia-editor-font-family, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif);
    font-size: 13px;
    margin: 0;
    padding: 20px;
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-sizing: border-box;
  }
  .tab-bar {
    display: flex;
    border-bottom: 1px solid var(--theia-border-color, #e0e0e0);
    margin-bottom: 15px;
    flex-shrink: 0;
    overflow-x: auto;
  }
  .tab-btn {
    padding: 8px 16px;
    cursor: pointer;
    border: 1px solid transparent;
    border-bottom: none;
    background: none;
    color: var(--theia-editor-foreground, #555);
    font-weight: bold;
    font-size: 12px;
    white-space: nowrap;
    outline: none;
    transition: all 0.15s;
  }
  .tab-btn:hover {
    color: var(--theia-brand-color1, #0ea5e9);
  }
  .tab-btn.active {
    border-color: var(--theia-border-color, #e0e0e0);
    background-color: var(--theia-layout-color1, #fff);
    border-radius: 4px 4px 0 0;
    color: var(--theia-brand-color1, #0ea5e9);
  }
  .sheet-container {
    flex: 1;
    overflow: auto;
    background-color: var(--theia-layout-color1, #fff);
    border: 1px solid var(--theia-border-color, #e0e0e0);
    border-radius: 4px;
  }
  .sheet-content { display: none; padding: 15px; }
  .sheet-content.active { display: block; }
  table { border-collapse: collapse; min-width: 100%; font-size: 13px; }
  th, td { border: 1px solid var(--theia-border-color, #ccc); padding: 6px 12px; text-align: left; }
  th { background-color: var(--theia-layout-color2, #f5f5f5); font-weight: bold; }
</style>
<script>
  function showSheet(idx) {
    document.querySelectorAll('.tab-btn').forEach((b, i) => b.classList.toggle('active', i === idx));
    document.querySelectorAll('.sheet-content').forEach((c, i) => c.classList.toggle('active', i === idx));
  }
  function syncTheme() {
    if (!window.parent) return;
    const ps = window.parent.getComputedStyle(window.parent.document.documentElement);
    const ds = document.documentElement.style;
    ['--theia-editor-background','--theia-editor-foreground','--theia-editor-font-family',
     '--theia-layout-color1','--theia-layout-color2','--theia-border-color','--theia-brand-color1'].forEach(v => {
      const val = ps.getPropertyValue(v); if (val) ds.setProperty(v, val);
    });
  }
  window.onload = () => {
    syncTheme();
    if (window.parent && window.parent.document.documentElement) {
      new MutationObserver(syncTheme).observe(
        window.parent.document.documentElement,
        { attributes: true, attributeFilter: ['class', 'style'] }
      );
    }
  };
</script>
</head>
<body>
  <div class="tab-bar">
    ${workbook.SheetNames.map((name, i) => `<button class="tab-btn ${i === 0 ? 'active' : ''}" onclick="showSheet(${i})">${name}</button>`).join('')}
  </div>
  <div class="sheet-container">
    ${workbook.SheetNames.map((name, i) => {
      const sheet = workbook.Sheets[name];
      const html = xlsx.utils.sheet_to_html(sheet);
      return `<div class="sheet-content ${i === 0 ? 'active' : ''}">${html}</div>`;
    }).join('')}
  </div>
</body>
</html>`);
                } else if (ext === '.pdf') {
                    res.writeHead(200, {
                        'Content-Type': 'application/pdf',
                        'Content-Disposition': `inline; filename="${encodeURIComponent(path.basename(filePath))}"`,
                        'Accept-Ranges': 'bytes'
                    });
                    fs.createReadStream(filePath).pipe(res);
                } else if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.ico'].includes(ext)) {
                    const mimeTypes = {
                        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                        '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
                        '.bmp': 'image/bmp', '.ico': 'image/x-icon'
                    };
                    res.writeHead(200, {
                        'Content-Type': mimeTypes[ext] || 'image/png',
                        'Content-Disposition': `inline; filename="${encodeURIComponent(path.basename(filePath))}"`
                    });
                    fs.createReadStream(filePath).pipe(res);
                } else if (['.md', '.markdown', '.mdown', '.mkdn'].includes(ext)) {
                    const MarkdownIt = require('markdown-it');
                    const md = new MarkdownIt({ html: true, linkify: true, typographer: true });
                    const raw = fs.readFileSync(filePath, 'utf8');
                    let content = raw;
                    try {
                        const parsed = matter(raw);
                        content = parsed.content;
                    } catch (_) {}
                    const htmlBody = md.render(content);
                    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                    res.end(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {
    background-color: #f1f5f9;
    color: #0f172a;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 14px;
    line-height: 1.6;
    margin: 0;
    padding: 32px 24px;
    display: flex;
    justify-content: center;
    box-sizing: border-box;
    min-height: 100vh;
  }
  .document-content {
    max-width: 860px;
    width: 100%;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    padding: 48px 56px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.07);
    border-radius: 6px;
    box-sizing: border-box;
    overflow-x: auto;
  }
  table { border-collapse: collapse; width: 100%; margin: 20px 0; font-size: 13px; }
  th, td { border: 1px solid #cbd5e1; padding: 9px 14px; text-align: left; vertical-align: top; }
  th { background-color: #f8fafc; font-weight: 600; color: #1e293b; border-bottom: 2px solid #cbd5e1; }
  tr:nth-child(even) td { background-color: #fcfdfe; }
  h1, h2, h3, h4 { color: #0369a1; margin-top: 28px; margin-bottom: 12px; font-weight: 600; }
  h1 { border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; font-size: 22px; margin-top: 10px; }
  h2 { font-size: 17px; border-bottom: 1px solid #f1f5f9; padding-bottom: 4px; }
  h3 { font-size: 15px; }
  p { margin: 10px 0; color: #1e293b; }
  strong { color: #0f172a; font-weight: 600; }
  hr { border: none; border-top: 1px solid #e2e8f0; margin: 24px 0; }
  blockquote { border-left: 4px solid #0284c7; margin: 16px 0; padding: 10px 18px; background: #f0f9ff; border-radius: 0 4px 4px 0; color: #334155; }
  code { background: #f1f5f9; padding: 2px 6px; border-radius: 3px; font-size: 12px; color: #0f172a; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
  pre { background: #f8fafc; border: 1px solid #e2e8f0; padding: 16px; border-radius: 6px; overflow-x: auto; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; color: #0f172a; }
</style>
</head>
<body>
  <div class="document-content">
    ${htmlBody}
  </div>
</body>
</html>`);
                } else {
                    // Universal text/code fallback
                    const raw = fs.readFileSync(filePath, 'utf8');
                    const escaped = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                    res.end(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {
    background-color: #f1f5f9;
    color: #0f172a;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 13px;
    line-height: 1.5;
    margin: 0;
    padding: 24px;
    display: flex;
    justify-content: center;
    box-sizing: border-box;
    min-height: 100vh;
  }
  .document-content {
    max-width: 900px;
    width: 100%;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    padding: 28px 36px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.07);
    border-radius: 6px;
    box-sizing: border-box;
    overflow-x: auto;
  }
  pre {
    margin: 0;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    white-space: pre-wrap;
    word-break: break-all;
    font-size: 12px;
    color: #0f172a;
  }
</style>
</head>
<body>
  <div class="document-content">
    <pre><code>${escaped}</code></pre>
  </div>
</body>
</html>`);
                }
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end(`Preview generation failed: ${err.message}`);
            }
        },

        '/api/hayagriva/ingest-status': (req, res, parsedUrl, docsRoot) => {
            const caseName = parsedUrl.query.case || '';
            const basename = parsedUrl.query.basename || '';
            const caseDir = resolveCaseDir(docsRoot, caseName);
            const pdfPath = path.join(caseDir, basename + '.pdf');
            const queueEntry = pendingPdfQueue.find(q => q.filePath === pdfPath);
            const complete = completedPdfSet.has(pdfPath);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                converting: !!queueEntry,
                complete,
                nextPage: queueEntry ? queueEntry.nextPage : null,
                totalPages: queueEntry ? queueEntry.totalPages : null
            }));
        },

        '/api/hayagriva/file-statuses': (req, res, parsedUrl, docsRoot) => {
            const caseName = parsedUrl.query.case || '';
            const caseDir = resolveCaseDir(docsRoot, caseName);
            const isDocsRoot = caseDir && path.resolve(caseDir) === path.resolve(docsRoot);
            if (isDocsRoot || !caseName) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ statuses: {} }));
                return;
            }
            
            if (fs.existsSync(caseDir)) {
                ensureCaseSettings(caseDir);
            }

            const statuses = {};

            if (fs.existsSync(caseDir)) {
                const { getDb } = require('./core/sqlite-store');
                let dbStatusesMap = {};
                try {
                    const db = getDb(caseDir);
                    const rows = db.prepare('SELECT filename, status FROM documents').all();
                    for (const row of rows) {
                        dbStatusesMap[row.filename] = row.status;
                    }
                } catch (e) {
                    console.warn('[API Server] Failed to query file statuses from SQLite:', e.message);
                }

                const { isTiddlyWikiHtml } = require('./pipeline/common/helper');
                const docExts = ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.wiki.html', '.html', '.md'];
                const scan = (dir) => {
                    const files = fs.readdirSync(dir);
                    for (const file of files) {
                        const filePath = path.join(dir, file);
                        const stat = fs.statSync(filePath);
                        const lower = file.toLowerCase();
                        if (stat.isDirectory()) {
                            if (!file.startsWith('.') && 
                                lower !== 'concepts' && 
                                lower !== 'wiki' && 
                                lower !== 'conversions' && 
                                lower !== 'reviews' && 
                                lower !== 'drafts' && 
                                lower !== 'exports' &&
                                lower !== 'summaries' &&
                                lower !== 'node_modules' &&
                                lower !== 'bower_components' &&
                                lower !== 'dist' &&
                                lower !== 'build' &&
                                lower !== 'out' &&
                                lower !== '.git' &&
                                lower !== '.github' &&
                                lower !== '.theia') {
                                scan(filePath);
                            }
                        } else {
                            const isWikiHtml = file.endsWith('.wiki.html') || (file.endsWith('.html') && isTiddlyWikiHtml(filePath));
                            const ext = isWikiHtml ? (file.endsWith('.wiki.html') ? '.wiki.html' : '.html') : path.extname(file).toLowerCase();
                            if (docExts.includes(ext)) {
                                if (ext === '.html' && !isWikiHtml) {
                                    continue; // Skip non-tiddlywiki HTML files
                                }
                                if (ext === '.md') {
                                    if (file === 'CASE_AUDIT.md' || file === 'case_facts.md' || file === 'index.md') {
                                        continue;
                                    }
                                    const hasParent = ['.pdf', '.docx', '.doc', '.xlsx', '.xls'].some(parentExt => {
                                        const parentFile = filePath.replace(/\.md$/, parentExt);
                                        return fs.existsSync(parentFile);
                                    });
                                    if (hasParent) {
                                        continue;
                                    }
                                }

                                const cleanBase = isWikiHtml 
                                    ? (file.endsWith('.wiki.html') ? path.basename(file, '.wiki.html') : path.basename(file, '.html')) 
                                    : path.basename(file, ext);
                                const relative = path.relative(caseDir, filePath);
                                let docStatus = dbStatusesMap[relative] || 'unprocessed';
                                const subfolder = path.dirname(relative);

                                // ── Computed disk paths ────────────────────────────────────────────
                                const conversionsDir = subfolder === '.' ?
                                    getConversionsDir(caseDir) :
                                    path.join(getConversionsDir(caseDir), subfolder);
                                const conversionCompanionPath = path.join(conversionsDir, `${cleanBase}.md`);
                                const rootCompanionPath = filePath.replace(/\.[a-zA-Z0-9]+$/, '.md');

                                const companionPath = isWikiHtml ? filePath : (ext === '.md' ? filePath : conversionCompanionPath);
                                const conceptsDir = subfolder === '.' ?
                                    path.join(getConceptsDir(caseDir), cleanBase) :
                                    path.join(getConceptsDir(caseDir), subfolder, cleanBase);
                                const treePath = path.join(conceptsDir, 'pageindex_tree.json');
                                const bm25IndexPath = path.join(getConceptsDir(caseDir), 'bm25_index.json');

                                // Auto-relocate root companion .md to conversions/ folder if it exists
                                if (ext !== '.md') {
                                    try {
                                        fs.mkdirSync(conversionsDir, { recursive: true });
                                        if (fs.existsSync(rootCompanionPath)) {
                                            if (!fs.existsSync(conversionCompanionPath)) {
                                                fs.renameSync(rootCompanionPath, conversionCompanionPath);
                                                console.log(`[File Statuses API] Relocated root companion .md to conversions/: ${conversionCompanionPath}`);
                                            } else if (path.resolve(rootCompanionPath) !== path.resolve(conversionCompanionPath)) {
                                                fs.unlinkSync(rootCompanionPath);
                                                console.log(`[File Statuses API] Cleaned up stale duplicate root companion: ${rootCompanionPath}`);
                                            }
                                        }

                                        // If companion is missing at conversionCompanionPath, search base conversions root or old subfolders
                                        if (!fs.existsSync(conversionCompanionPath)) {
                                            const baseConversionsDir = getConversionsDir(caseDir);
                                            const rootConvFile = path.join(baseConversionsDir, `${cleanBase}.md`);
                                            if (fs.existsSync(rootConvFile) && path.resolve(rootConvFile) !== path.resolve(conversionCompanionPath)) {
                                                fs.renameSync(rootConvFile, conversionCompanionPath);
                                                console.log(`[File Statuses API] Auto-relocated companion .md from root conversions to subfolder: ${conversionCompanionPath}`);
                                                // Also move .footer sidecar if exists
                                                const rootFooter = path.join(baseConversionsDir, `${cleanBase}.footer`);
                                                const subFooter = path.join(conversionsDir, `${cleanBase}.footer`);
                                                if (fs.existsSync(rootFooter)) {
                                                    try { fs.renameSync(rootFooter, subFooter); } catch (_) {}
                                                }
                                            }
                                        }

                                        // Auto-relocate concept folder if it was generated at concepts root or another subfolder
                                        if (!fs.existsSync(treePath)) {
                                            const baseConceptsDir = getConceptsDir(caseDir);
                                            const rootConceptDir = path.join(baseConceptsDir, cleanBase);
                                            const rootTreeFile = path.join(rootConceptDir, 'pageindex_tree.json');
                                            if (fs.existsSync(rootTreeFile) && path.resolve(rootConceptDir) !== path.resolve(conceptsDir)) {
                                                try {
                                                    fs.mkdirSync(path.dirname(conceptsDir), { recursive: true });
                                                    fs.renameSync(rootConceptDir, conceptsDir);
                                                    console.log(`[File Statuses API] Auto-relocated concept folder to subfolder: ${conceptsDir}`);
                                                } catch (e) {
                                                    console.warn(`[File Statuses API] Failed to relocate concept folder:`, e.message);
                                                }
                                            }
                                        }
                                    } catch (_) {}
                                }

                                const companionExists = !isWikiHtml && (ext === '.md' || fs.existsSync(conversionCompanionPath));
                                const treeExists = fs.existsSync(treePath);
                                const bm25Exists = fs.existsSync(bm25IndexPath);

                                // Count section cards in conceptsDir
                                let sectionCardCount = 0;
                                let enrichedCardCount = 0;
                                if (treeExists) {
                                    try {
                                        const mdFiles = fs.readdirSync(conceptsDir).filter(f => f.endsWith('.md'));
                                        sectionCardCount = mdFiles.length;
                                    } catch (_) {}
                                }

                                // ── Self-healing: Dot 1 — companion .md exists on disk ─────────────
                                 if (ext === '.md' && (docStatus === 'unprocessed' || docStatus === 'companion_ready')) {
                                     docStatus = 'reviewed';
                                     try {
                                         const { getDb } = require('./core/sqlite-store');
                                         const db = getDb(caseDir);
                                         const existing = db.prepare('SELECT status FROM documents WHERE filename = ?').get(relative);
                                         if (!existing) {
                                             db.prepare('INSERT INTO documents (filename, status) VALUES (?, ?)').run(relative, 'reviewed');
                                         } else {
                                             db.prepare('UPDATE documents SET status = ? WHERE filename = ?').run('reviewed', relative);
                                         }
                                     } catch (_) {}
                                 } else if ((docStatus === 'unprocessed' || docStatus === 'processing') && companionExists) {
                                     docStatus = 'companion_ready';
                                     try {
                                         const { getDb } = require('./core/sqlite-store');
                                         const db = getDb(caseDir);
                                         const existing = db.prepare('SELECT status FROM documents WHERE filename = ?').get(relative);
                                         if (!existing) {
                                             db.prepare('INSERT INTO documents (filename, status) VALUES (?, ?)').run(relative, 'companion_ready');
                                         } else {
                                             db.prepare('UPDATE documents SET status = ? WHERE filename = ?').run('companion_ready', relative);
                                         }
                                     } catch (_) {}
                                 } else if (docStatus === 'failed_convert' && companionExists) {
                                     // Scanned/rejected PDF where the user manually placed a companion .md:
                                     // advance to companion_ready so Enhance Markdown & Generate Vectors unlock.
                                     docStatus = 'companion_ready';
                                     try {
                                         const { getDb } = require('./core/sqlite-store');
                                         const db = getDb(caseDir);
                                         const existing = db.prepare('SELECT status FROM documents WHERE filename = ?').get(relative);
                                         if (!existing) {
                                             db.prepare('INSERT INTO documents (filename, status) VALUES (?, ?)').run(relative, 'companion_ready');
                                         } else {
                                             db.prepare('UPDATE documents SET status = ? WHERE filename = ?').run('companion_ready', relative);
                                         }
                                     } catch (_) {}
                                 } else if (!companionExists && !isWikiHtml && ext !== '.md' && (docStatus === 'companion_ready' || docStatus === 'indexed' || docStatus === 'enriched')) {
                                     docStatus = 'unprocessed';
                                     try {
                                         const { getDb } = require('./core/sqlite-store');
                                         const db = getDb(caseDir);
                                         db.prepare('UPDATE documents SET status = ? WHERE filename = ?').run('unprocessed', relative);
                                     } catch (_) {}
                                 }

                                // ── Self-healing: Dot 2 — pageindex_tree.json exists on disk ──────
                                if ((docStatus === 'unprocessed' || docStatus === 'companion_ready' || docStatus === 'failed_ingest') && treeExists) {
                                    docStatus = 'indexed';
                                    try {
                                        const { getDb } = require('./core/sqlite-store');
                                        const db = getDb(caseDir);
                                        const existing = db.prepare('SELECT status FROM documents WHERE filename = ?').get(relative);
                                        if (!existing) {
                                            db.prepare('INSERT INTO documents (filename, status) VALUES (?, ?)').run(relative, 'indexed');
                                        } else {
                                            db.prepare('UPDATE documents SET status = ? WHERE filename = ?').run('indexed', relative);
                                        }
                                        db.prepare('UPDATE document_sections SET filename = ? WHERE filename = ? OR filename = ?').run(relative, cleanBase, path.basename(filePath));
                                        db.prepare('UPDATE document_vectors SET filename = ? WHERE filename = ? OR filename = ?').run(relative, cleanBase, path.basename(filePath));
                                    } catch (_) {}
                                }

                                // ── Self-healing: Dot 3 — pageindex_tree fully enriched (all llmSummary:true) ──
                                if (docStatus === 'failed_enrich' || docStatus === 'indexed') {
                                    try {
                                        if (treeExists) {
                                            const treeData = JSON.parse(fs.readFileSync(treePath, 'utf8'));
                                            let hasUnenriched = false;
                                            function checkNode(node) {
                                                if (node.metadata && node.metadata.type === 'section' && node.content && (!node.metadata.llmSummary)) {
                                                    hasUnenriched = true;
                                                }
                                                if (node.children) {
                                                    for (const child of node.children) {
                                                        checkNode(child);
                                                    }
                                                }
                                            }
                                            if (treeData && treeData.tree) {
                                                checkNode(treeData.tree);
                                                if (!hasUnenriched) {
                                                    docStatus = 'enriched';
                                                    try {
                                                        const { getDb } = require('./core/sqlite-store');
                                                        const db = getDb(caseDir);
                                                        db.prepare('UPDATE documents SET status = ? WHERE filename = ?').run('enriched', relative);
                                                    } catch (_) {}
                                                } else {
                                                    // Count enriched section cards
                                                    try {
                                                        const mdFiles = fs.readdirSync(conceptsDir).filter(f => f.endsWith('.md'));
                                                        let enriched = 0;
                                                        for (const mdf of mdFiles) {
                                                            const content = fs.readFileSync(path.join(conceptsDir, mdf), 'utf8');
                                                            if (content.includes('llmSummary: true') || content.includes('### Hypothetical Questions')) enriched++;
                                                        }
                                                        enrichedCardCount = enriched;
                                                    } catch (_) {}
                                                }
                                            }
                                        }
                                    } catch (_) {}
                                }

                                // ── Resolve dot colors ─────────────────────────────────────────────
                                // D6: Dot 1 = text extracted (companion .md exists)
                                let dot1 = 'grey';
                                if (isWikiHtml || ext === '.md') {
                                    dot1 = 'green';  // wiki/standalone — always ready
                                } else if (docStatus === 'converting' || docStatus === 'processing') {
                                    dot1 = 'blue';   // extraction in progress
                                } else if (docStatus === 'failed_convert') {
                                    dot1 = 'red';    // extraction failed
                                } else if (companionExists) {
                                    dot1 = 'green';  // companion .md exists on disk
                                }
                                // else: grey — file just dropped, extraction not yet started

                                // D6: Dot 2 = indexed into AI memory (pageindex_tree exists)
                                let dot2 = 'grey';
                                if (['indexed', 'enriching', 'enriched', 'failed_enrich'].includes(docStatus)) {
                                    dot2 = 'green';
                                } else if (docStatus === 'ingesting') {
                                    dot2 = 'blue';
                                } else if (docStatus === 'failed_ingest') {
                                    dot2 = 'red';
                                }

                                // D6: Dot 3 = AI enrichment complete
                                let dot3 = 'grey';
                                if (docStatus === 'enriched') {
                                    dot3 = 'green';
                                } else if (docStatus === 'enriching') {
                                    dot3 = 'blue';
                                } else if (docStatus === 'failed_enrich') {
                                    dot3 = 'red';
                                }

                                // ── Error message ──────────────────────────────────────────────────
                                let errorMsg = '';
                                if (docStatus.startsWith('failed_')) {
                                    try {
                                        const errorPath = subfolder === '.' ?
                                            path.join(getConversionsDir(caseDir), `${cleanBase}.error`) :
                                            path.join(getConversionsDir(caseDir), subfolder, `${cleanBase}.error`);
                                        if (fs.existsSync(errorPath)) {
                                            errorMsg = fs.readFileSync(errorPath, 'utf8').trim();
                                        }
                                    } catch (_) {}
                                }

                                // ── Files audit sub-object ─────────────────────────────────────────
                                const filesAudit = {
                                    companion: {
                                        path: path.relative(caseDir, companionPath),
                                        exists: isWikiHtml ? true : companionExists
                                    },
                                    conceptsDir: {
                                        path: subfolder === '.' ? `concepts/${cleanBase}/` : `concepts/${subfolder}/${cleanBase}/`,
                                        exists: fs.existsSync(conceptsDir)
                                    },
                                    pageindexTree: {
                                        path: subfolder === '.' ? `concepts/${cleanBase}/pageindex_tree.json` : `concepts/${subfolder}/${cleanBase}/pageindex_tree.json`,
                                        exists: treeExists
                                    },
                                    bm25Index: {
                                        path: 'concepts/bm25_index.json',
                                        exists: bm25Exists
                                    },
                                    sectionCards: {
                                        total: sectionCardCount,
                                        enriched: enrichedCardCount
                                    }
                                };

                                const isScanned = (errorMsg && (errorMsg.includes('Fully scanned PDF') || errorMsg.includes('SCANNED_PDF_REJECTED'))) || (docStatus === 'failed_convert' && ext === '.pdf');
                                statuses[relative] = { dot1, dot2, dot3, error: errorMsg, isScanned, files: filesAudit };
                            }
                        }
                    }
                };
                try {
                    scan(caseDir);
                } catch (_) {}
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ statuses }));
        },

        '/api/laws/query': async (req, res, parsedUrl, docsRoot) => {
            const q = (parsedUrl.query.q || '').trim();
            const topN = Math.min(parseInt(parsedUrl.query.n || '5', 10), 20);

            if (!isVaultReady()) {
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Vault is not ready or missing VAULT_KEY' }));
                return;
            }
            if (!q) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing query parameter: q' }));
                return;
            }
            const results = await resolveTrigger(q, topN);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ query: q, results }));
        },

        '/api/laws/search': async (req, res, parsedUrl, docsRoot) => {
            const q = (parsedUrl.query.q || '').trim();
            const topN = Math.min(parseInt(parsedUrl.query.n || '5', 10), 20);

            if (!isVaultReady()) {
                res.writeHead(503, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Vault is not ready or missing VAULT_KEY' }));
                return;
            }
            const results = (await searchLaws(q, topN)).map(r => ({
                id: r.id, title: r.title, section: r.section, score: r.score,
                preview: r.text.slice(0, 300)
            }));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ query: q, results }));
        },

        '/api/laws/version': (req, res, parsedUrl, docsRoot) => {
            const ver = getVaultVersion();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(ver || { version: null, ready: isVaultReady() }));
        },
        '/api/hayagriva/wiki-cards': (req, res, parsedUrl, docsRoot) => {
            const caseName = parsedUrl.query.case || getDefaultCaseName(docsRoot);
            const caseDir = resolveCaseDir(docsRoot, caseName);
            const wikiDir = getWikiDir(caseDir);
            
            const { parseMarkdownWithFrontmatter } = require('./utils/okf');
            
            if (!fs.existsSync(wikiDir)) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ cards: [] }));
                return;
            }

            const allFiles = [];
            
            // Read root wiki folder
            fs.readdirSync(wikiDir).forEach(f => {
                if (f.endsWith('.md')) {
                    allFiles.push({ filename: f, fullPath: path.join(wikiDir, f) });
                }
            });
            
            // Read subfolder wiki/qna
            const qnaDir = path.join(wikiDir, 'qna');
            if (fs.existsSync(qnaDir)) {
                fs.readdirSync(qnaDir).forEach(f => {
                    if (f.endsWith('.md')) {
                        allFiles.push({ filename: 'qna/' + f, fullPath: path.join(qnaDir, f) });
                    }
                });
            }

            const cards = allFiles.map(item => {
                try {
                    const content = fs.readFileSync(item.fullPath, 'utf8');
                    const { frontmatter, body } = parseMarkdownWithFrontmatter(content);
                    
                    let answer = '';
                    const answerHeaderIndex = body.indexOf('### Answer');
                    if (answerHeaderIndex !== -1) {
                        const sub = body.substring(answerHeaderIndex);
                        const lines = sub.split('\n');
                        answer = lines.slice(1).join('\n').trim();
                    } else {
                        answer = body.trim();
                    }

                    // Format human-readable title
                    const displayTitle = frontmatter.title || path.basename(item.filename, '.md').replace(/_/g, ' ');

                    return {
                        filename: item.filename,
                        title: displayTitle,
                        tags: frontmatter.tags || [],
                        sourceDocument: frontmatter.sourceDocument || 'General Wiki',
                        answer: answer
                    };
                } catch (e) {
                    console.error('[API Server] Failed to parse wiki card file:', item.filename, e.message);
                    return null;
                }
            }).filter(Boolean);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ cards }));
        },

        '/api/hayagriva/tiddlywiki/create': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body || '{}');
                    const caseName = data.caseName || '';
                    let wikiTitle = (data.wikiTitle || 'Case Notes').trim();
                    const caseDir = resolveCaseDir(docsRoot, caseName);
                    const wikiDir = getWikiDir(caseDir);
                    fs.mkdirSync(wikiDir, { recursive: true });

                    const safeFilename = wikiTitle.toLowerCase().replace(/[^a-z0-9_-]/g, '_') + '.wiki.html';
                    const targetPath = path.join(wikiDir, safeFilename);

                    const { generateTiddlyWikiHtml } = require('./pipeline/wiki/tiddlywiki-template');
                    const htmlContent = generateTiddlyWikiHtml(wikiTitle, [], 3210, caseName, safeFilename);

                    fs.writeFileSync(targetPath, htmlContent, 'utf8');

                    // Trigger auto-ingestion for the newly created wiki
                    try {
                        const { ingestWiki } = require('./pipeline/wiki/ingest');
                        const bm25 = require('./core/bm25');
                        const bm25IndexFile = path.join(getConceptsDir(caseDir), 'bm25_index.json');
                        const bm25Index = bm25.loadIndex(bm25IndexFile);
                        await ingestWiki(caseDir, targetPath, bm25Index, bm25IndexFile);
                    } catch (ingestErr) {
                        console.warn('[TiddlyWiki API] Auto-ingestion note:', ingestErr.message);
                    }

                    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                    res.end(JSON.stringify({ success: true, caseName, filename: safeFilename, filePath: targetPath, viewUrl: `/api/hayagriva/tiddlywiki/view?case=${encodeURIComponent(caseName)}&file=${encodeURIComponent(safeFilename)}` }));
                } catch (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: err.message }));
                }
            });
        },

        '/api/hayagriva/tiddlywiki/export-chunks': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body || '{}');
                    const caseName = data.caseName || '';
                    const docFilename = data.docFilename || '';
                    const caseDir = resolveCaseDir(docsRoot, caseName);
                    const wikiDir = getWikiDir(caseDir);
                    fs.mkdirSync(wikiDir, { recursive: true });

                    const docBase = path.basename(docFilename, path.extname(docFilename));
                    const wikiTitle = (data.wikiTitle || `${docBase} Wiki`).trim();
                    const safeFilename = docBase.toLowerCase().replace(/[^a-z0-9_-]/g, '_') + '_wiki.wiki.html';
                    const targetPath = path.join(wikiDir, safeFilename);

                    const { getDb } = require('./core/sqlite-store');
                    const db = getDb(caseDir);

                    const relativeDoc = path.relative(caseDir, path.isAbsolute(docFilename) ? docFilename : path.join(caseDir, docFilename)).replace(/\\/g, '/');
                    const chunks = db.prepare("SELECT section_title, page_number, content FROM fts_chunks WHERE filename = ? ORDER BY page_number ASC, chunk_index ASC").all(relativeDoc);

                    const { generateTiddlyWikiHtml, buildTiddlersFromChunks } = require('./pipeline/wiki/tiddlywiki-template');
                    const tiddlers = buildTiddlersFromChunks(chunks, docBase);
                    const htmlContent = generateTiddlyWikiHtml(wikiTitle, tiddlers, 3210, caseName, safeFilename);

                    fs.writeFileSync(targetPath, htmlContent, 'utf8');

                    // Trigger auto-ingestion for generated wiki
                    try {
                        const { ingestWiki } = require('./pipeline/wiki/ingest');
                        const bm25 = require('./core/bm25');
                        const bm25IndexFile = path.join(getConceptsDir(caseDir), 'bm25_index.json');
                        const bm25Index = bm25.loadIndex(bm25IndexFile);
                        await ingestWiki(caseDir, targetPath, bm25Index, bm25IndexFile);
                    } catch (ingestErr) {
                        console.warn('[TiddlyWiki Export] Auto-ingestion note:', ingestErr.message);
                    }

                    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                    res.end(JSON.stringify({ success: true, caseName, filename: safeFilename, filePath: targetPath, viewUrl: `/api/hayagriva/tiddlywiki/view?case=${encodeURIComponent(caseName)}&file=${encodeURIComponent(safeFilename)}` }));
                } catch (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: err.message }));
                }
            });
        },

        '/api/hayagriva/tiddlywiki/view': (req, res, parsedUrl, docsRoot) => {
            const caseName = parsedUrl.query.case || '';
            const fileName = parsedUrl.query.file || '';
            const caseDir = resolveCaseDir(docsRoot, caseName);
            const targetPath = path.join(getWikiDir(caseDir), fileName);

            if (!fs.existsSync(targetPath)) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('TiddlyWiki file not found in case directory.');
                return;
            }

            const htmlContent = fs.readFileSync(targetPath, 'utf8');
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(htmlContent);
        },

        '/api/hayagriva/tiddlywiki/save': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', async () => {
                try {
                    const caseName = parsedUrl.query.case || '';
                    const fileName = parsedUrl.query.file || '';
                    const caseDir = resolveCaseDir(docsRoot, caseName);
                    const targetPath = path.join(getWikiDir(caseDir), fileName);

                    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
                    fs.writeFileSync(targetPath, body, 'utf8');

                    // Auto-ingest updated tiddlers into SQLite FTS and BM25 indices
                    try {
                        const { ingestWiki } = require('./pipeline/wiki/ingest');
                        const bm25 = require('./core/bm25');
                        const bm25IndexFile = path.join(getConceptsDir(caseDir), 'bm25_index.json');
                        const bm25Index = bm25.loadIndex(bm25IndexFile);
                        await ingestWiki(caseDir, targetPath, bm25Index, bm25IndexFile);
                        console.log(`[TiddlyWiki API] Saved and re-indexed: ${fileName}`);
                    } catch (e) {
                        console.error('[TiddlyWiki API] Failed to re-index saved wiki:', e.message);
                    }

                    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                    res.end(JSON.stringify({ success: true, savedPath: targetPath }));
                } catch (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: err.message }));
                }
            });
        },
        '/api/hayagriva/case-graph': (req, res, parsedUrl, docsRoot) => {
            const caseName = parsedUrl.query.case || getDefaultCaseName(docsRoot);
            const caseDir = resolveCaseDir(docsRoot, caseName);
            const conceptsDir = getConceptsDir(caseDir);
            const wikiDir = getWikiDir(caseDir);
            
            const nodes = [];
            const links = [];
            const titleToNode = new Map();
            const { parseMarkdownWithFrontmatter } = require('./utils/okf');

            // 1. Process Concepts Directory
            if (fs.existsSync(conceptsDir)) {
                const docs = fs.readdirSync(conceptsDir).filter(f => {
                    return fs.statSync(path.join(conceptsDir, f)).isDirectory() && !f.startsWith('.');
                });
                
                for (const doc of docs) {
                    const docId = `doc::${doc}`;
                    nodes.push({ id: docId, name: doc, type: 'document', path: '' });
                    
                    const docDir = path.join(conceptsDir, doc);
                    const files = fs.readdirSync(docDir).filter(f => f.endsWith('.md') && f !== 'index.md');
                    for (const f of files) {
                        const filePath = path.join(docDir, f);
                        const relPath = `concepts/${doc}/${f}`;
                        const content = fs.readFileSync(filePath, 'utf8');
                        const { frontmatter } = parseMarkdownWithFrontmatter(content);
                        const title = frontmatter.title || f.replace('.md', '');
                        
                        const nodeId = `concept::${relPath}`;
                        const conceptNode = {
                            id: nodeId,
                            name: title,
                            type: 'concept',
                            path: relPath,
                            links: frontmatter.links || [],
                            ancestors: frontmatter.ancestors || []
                        };
                        nodes.push(conceptNode);
                        titleToNode.set(title.toLowerCase(), nodeId);
                        
                        // Parent-child link
                        links.push({ source: docId, target: nodeId, type: 'hierarchy' });
                    }
                }
            }

            // 2. Process Wiki Directory
            if (fs.existsSync(wikiDir)) {
                const files = fs.readdirSync(wikiDir).filter(f => f.endsWith('.md'));
                for (const f of files) {
                    const filePath = path.join(wikiDir, f);
                    const relPath = `wiki/${f}`;
                    const content = fs.readFileSync(filePath, 'utf8');
                    const { frontmatter } = parseMarkdownWithFrontmatter(content);
                    const title = frontmatter.title || f.replace('.md', '');
                    
                    const nodeId = `wiki::${relPath}`;
                    const wikiNode = {
                        id: nodeId,
                        name: title,
                        type: 'wiki',
                        path: relPath,
                        links: frontmatter.links || [],
                        ancestors: []
                    };
                    nodes.push(wikiNode);
                    titleToNode.set(title.toLowerCase(), nodeId);
                }
            }

            // 3. Resolve References/Cross-links
            for (const node of nodes) {
                if (node.links && Array.isArray(node.links)) {
                    for (const linkTitle of node.links) {
                        const targetId = titleToNode.get(linkTitle.toLowerCase());
                        if (targetId && targetId !== node.id) {
                            links.push({ source: node.id, target: targetId, type: 'reference' });
                        }
                    }
                }
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ nodes, links }));
        },

        '/api/hayagriva/concepts': (req, res, parsedUrl, docsRoot) => {
            const caseName = parsedUrl.query.case || getDefaultCaseName(docsRoot);
            const caseDir = resolveCaseDir(docsRoot, caseName);
            const conceptsDir = getConceptsDir(caseDir);
            const list = [];
            
            if (fs.existsSync(conceptsDir)) {
                const folders = fs.readdirSync(conceptsDir).filter(f => {
                    return fs.statSync(path.join(conceptsDir, f)).isDirectory() && !f.startsWith('.');
                });
                for (const doc of folders) {
                    const docDir = path.join(conceptsDir, doc);
                    const files = fs.readdirSync(docDir).filter(f => f.endsWith('.md') && f !== 'index.md');
                    for (const f of files) {
                        list.push({
                            title: f.replace('.md', ''),
                            relativePath: `concepts/${doc}/${f}`
                        });
                    }
                }
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ concepts: list }));
        },

        '/api/hayagriva/learning-curves': async (req, res, parsedUrl) => {
            const q = parsedUrl.query.query || '';
            if (!isCasesVaultReady()) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ learningCurves: [], note: 'Cases vault not ready — download via Settings > Vault & License.' }));
            }
            try {
                const results = await searchCases(q || 'insolvency', 30);
                const list = results.map(r => {
                    let title = r.title;
                    let issue = '';
                    let citation = '';
                    let date = '';
                    let court = '';
                    if (r.text) {
                        const titleM = r.text.match(/Case-Title:\s*"([^"]+)"/i) || r.text.match(/Case-Title:\s*([^\r\n]+)/i);
                        if (titleM && titleM[1]) title = titleM[1].trim();

                        const issueM = r.text.match(/Issue:\s*"([^"]+)"/i) || r.text.match(/Issue:\s*([^\r\n]+)/i);
                        if (issueM && issueM[1]) issue = issueM[1].trim();

                        const citeM = r.text.match(/(?:Case-Citation|Citation):\s*"([^"]+)"/i) || r.text.match(/(?:Case-Citation|Citation):\s*([^\r\n]+)/i);
                        if (citeM && citeM[1]) citation = citeM[1].trim();

                        const dateM = r.text.match(/(?:Date-of-Order|Date):\s*"([^"]+)"/i) || r.text.match(/(?:Date-of-Order|Date):\s*([^\r\n]+)/i);
                        if (dateM && dateM[1]) date = dateM[1].trim();

                        const courtM = r.text.match(/(?:Court-Tribunal|Court):\s*"([^"]+)"/i) || r.text.match(/(?:Court-Tribunal|Court):\s*([^\r\n]+)/i);
                        if (courtM && courtM[1]) court = courtM[1].trim();

                        if (!court) {
                            if (/supreme court/i.test(title) || /supreme court/i.test(r.text.slice(0, 500))) court = 'Supreme Court';
                            else if (/nclat/i.test(title) || /nclat/i.test(r.text.slice(0, 500))) court = 'NCLAT';
                            else if (/nclt/i.test(title) || /nclt/i.test(r.text.slice(0, 500))) court = 'NCLT';
                            else if (/high court/i.test(title) || /high court/i.test(r.text.slice(0, 500))) court = 'High Court';
                        }
                    }

                    return {
                        case_title:    title,
                        filename:      r.id,
                        issue:         issue,
                        citation:      citation,
                        date_of_order: date,
                        court_tribunal:court,
                        content:       r.text,
                    };
                });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ learningCurves: list }));
            } catch (err) {
                console.error('[Route] learning-curves (cases vault):', err.message);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ learningCurves: [], error: err.message }));
            }
        },

        // ─────────────────────────────────────────────────────────────────
        // Vault Management Routes
        // ─────────────────────────────────────────────────────────────────

        '/api/vault/status': async (_req, res) => {
            // Returns version + update availability for all 4 vaults.
            try {
                const status = await getVaultStatus();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, vaults: status }));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: err.message }));
            }
        },

        '/api/vault/activate': async (req, res) => {
            // POST: { licenseKey: "HAYG-XXXX-XXXX-XXXX" }
            // Validates with api.hayagriva.app and stores vault key in Keychain.
            if (req.method !== 'POST') {
                res.writeHead(405); return res.end();
            }
            let body = '';
            req.on('data', d => { body += d; });
            req.on('end', async () => {
                try {
                    const { licenseKey } = JSON.parse(body);
                    const result = await activateLicense(licenseKey || '');
                    res.writeHead(result.ok ? 200 : 400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
                } catch (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ ok: false, error: err.message }));
                }
            });
        },

        '/api/vault/download': async (req, res, parsedUrl) => {
            // GET /api/vault/download?vault=cases
            // Streams download + install progress as Server-Sent Events.
            const vaultName = parsedUrl.query.vault;
            if (!['laws','cases','documents','forms'].includes(vaultName)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ ok: false, error: 'Invalid vault name.' }));
            }

            res.writeHead(200, {
                'Content-Type':  'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection':    'keep-alive',
            });

            const sendEvent = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

            const progressHandler = (p) => sendEvent({ type: 'progress', ...p });
            const statusHandler   = (s) => sendEvent({ type: 'status',   ...s });
            onProgress(progressHandler);
            onStatus(statusHandler);

            try {
                const manifest = await getVaultStatus();
                const entry = manifest[vaultName]?.remoteEntry;
                if (!entry || !entry.url) throw new Error('No download URL available for this vault. Check for updates first.');
                const result = await downloadAndInstallVault(vaultName, entry);
                sendEvent({ type: 'done', ...result });
            } catch (err) {
                sendEvent({ type: 'error', error: err.message });
            } finally {
                res.end();
            }
        },

        '/api/hayagriva/unprescribed-formats': (req, res, parsedUrl, docsRoot) => {
            try {
                const compendiumDir = path.join(__dirname, 'pipeline', 'forms', 'skeletons', 'unprescribed_compendium');
                const items = [];
                if (fs.existsSync(compendiumDir)) {
                    const subdirs = fs.readdirSync(compendiumDir, { withFileTypes: true });
                    for (const sub of subdirs) {
                        if (sub.isDirectory()) {
                            const subPath = path.join(compendiumDir, sub.name);
                            const files = fs.readdirSync(subPath).filter(f => f.endsWith('.md'));
                            for (const f of files) {
                                const fullPath = path.join(subPath, f);
                                const text = fs.readFileSync(fullPath, 'utf8');
                                const codeMatch = text.match(/code:\s*"([^"]+)"/);
                                const titleMatch = text.match(/title:\s*"([^"]+)"/);
                                const processMatch = text.match(/process:\s*"([^"]+)"/);
                                const sectionsMatch = text.match(/sections:\s*"([^"]+)"/);
                                items.push({
                                    filename: f,
                                    slug: f.replace('.md', ''),
                                    category: sub.name,
                                    code: codeMatch ? codeMatch[1] : f.split('-')[0].toUpperCase(),
                                    title: titleMatch ? titleMatch[1] : f.replace('.md', ''),
                                    process: processMatch ? processMatch[1] : 'IBC Process',
                                    sections: sectionsMatch ? sectionsMatch[1] : '',
                                    path: fullPath
                                });
                            }
                        }
                    }
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, count: items.length, items }));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        },

        '/api/vault/search-cases': async (req, res, parsedUrl) => {
            // GET /api/vault/search-cases?q=text&topN=10
            // Searches the cases vault globally.
            const q    = parsedUrl.query.q || '';
            const topN = Math.min(parseInt(parsedUrl.query.topN || '10', 10), 50);
            if (!isCasesVaultReady()) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ ok: false, results: [], note: 'Cases vault not loaded. Download via Settings.' }));
            }
            try {
                const results = await searchCases(q, topN);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: true, results }));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: err.message }));
            }
        },


        '/api/hayagriva/read-file': (req, res, parsedUrl, docsRoot) => {
            const filePath = parsedUrl.query.path;
            if (!filePath) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing path' }));
                return;
            }
            let targetPath = path.isAbsolute(filePath) ? filePath : path.join(docsRoot, filePath);
            if (!fs.existsSync(targetPath)) {
                // Self-healing: if an .md companion was requested directly, search case conversions folder
                if (filePath.endsWith('.md')) {
                    const baseName = path.basename(filePath);
                    const parsedCase = parsedUrl.query.case || '';
                    const caseDir = parsedCase ? resolveCaseDir(docsRoot, parsedCase) : (path.isAbsolute(filePath) ? path.dirname(filePath) : docsRoot);
                    if (caseDir && fs.existsSync(caseDir)) {
                        const convDir = getConversionsDir(caseDir);
                        const possibleConversions = [
                            path.join(convDir, baseName),
                            path.join(convDir, path.basename(path.dirname(filePath)), baseName)
                        ];
                        for (const p of possibleConversions) {
                            if (fs.existsSync(p)) {
                                targetPath = p;
                                break;
                            }
                        }
                    }
                }
            }
            if (!fs.existsSync(targetPath)) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'File not found' }));
                return;
            }
            const absolutePath = targetPath;
            const ext = path.extname(absolutePath).toLowerCase();
            let contentType = 'text/plain; charset=utf-8';
            if (ext === '.html' || ext === '.htm') {
                contentType = 'text/html; charset=utf-8';
            } else if (ext === '.json') {
                contentType = 'application/json; charset=utf-8';
            } else if (ext === '.pdf') {
                contentType = 'application/pdf';
            } else if (ext === '.svg') {
                contentType = 'image/svg+xml';
            }

            const content = fs.readFileSync(absolutePath);
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content);
        },

        '/api/forms/kv-dictionary': (req, res, parsedUrl, docsRoot) => {
            const caseName = parsedUrl.query.case || '';
            const caseDir = resolveCaseDir(docsRoot, caseName);
            const dictPath = path.join(caseDir, 'reviews', 'case_kv_dictionary.json');
            let dictionary = {};
            if (fs.existsSync(dictPath)) {
                dictionary = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ dictionary }));
        },

        '/api/forms/instance': async (req, res, parsedUrl, docsRoot) => {
            const caseName = parsedUrl.query.case || '';
            const formId = parsedUrl.query.formId || '';
            if (!caseName || !formId) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing case or formId' }));
                return;
            }
            const caseDir = resolveCaseDir(docsRoot, caseName);
            const instancePath = path.join(caseDir, 'reviews', `filled-${formId}.json`);
            let fields = {};
            if (fs.existsSync(instancePath)) {
                fields = JSON.parse(fs.readFileSync(instancePath, 'utf8'));
            } else {
                const { populateFormInstance } = require('./pipeline/forms/mapper');
                fields = await populateFormInstance(caseDir, formId);
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ fields }));
        },

        '/api/formats/registry': (req, res, parsedUrl, docsRoot) => {
            const workspaceRoot = path.join(__dirname, '../..');
            const formatsRoot = path.join(workspaceRoot, 'templates');
            const list = [];
            if (fs.existsSync(formatsRoot)) {
                const folders = fs.readdirSync(formatsRoot).filter(f => {
                    return fs.statSync(path.join(formatsRoot, f)).isDirectory() && !f.startsWith('.');
                });
                for (const f of folders) {
                    const schemaPath = path.join(formatsRoot, f, 'prompt.txt');
                    if (fs.existsSync(schemaPath)) {
                        const name = f.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                        list.push({ formatId: f, name });
                    }
                }
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ formats: list }));
        },

        '/api/hayagriva/settings/panel': (req, res, parsedUrl, docsRoot) => {
            const htmlPath = path.join(__dirname, 'assets', 'settings-dashboard.html');
            if (!fs.existsSync(htmlPath)) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Settings Panel view file not found');
                return;
            }
            const content = fs.readFileSync(htmlPath, 'utf8');
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(content);
        },

        '/api/hayagriva/chronology-panel': (req, res, parsedUrl, docsRoot) => {
            const htmlPath = path.join(__dirname, 'assets', 'chronology-panel.html');
            if (!fs.existsSync(htmlPath)) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Chronology Panel view file not found');
                return;
            }
            const content = fs.readFileSync(htmlPath, 'utf8');
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(content);
        },

        '/api/hayagriva/chronology': (req, res, parsedUrl, docsRoot) => {
            const caseName = parsedUrl.query.case || '';
            const caseDir = resolveCaseDir(docsRoot, caseName);
            const { extractChronology } = require('./utils/chronology');
            const events = extractChronology(caseDir);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, events }));
        },

        '/api/hayagriva/topic-overlap-panel': (req, res, parsedUrl, docsRoot) => {
            const htmlPath = path.join(__dirname, 'assets', 'topic-overlap-panel.html');
            if (!fs.existsSync(htmlPath)) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Topic Overlap Panel view file not found');
                return;
            }
            const content = fs.readFileSync(htmlPath, 'utf8');
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(content);
        },

        '/api/hayagriva/topic-overlap': (req, res, parsedUrl, docsRoot) => {
            const caseName = parsedUrl.query.case || '';
            const caseDir = resolveCaseDir(docsRoot, caseName);
            const { buildTopicOverlap } = require('./utils/topic-overlap');
            const topics = buildTopicOverlap(caseDir);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, topics }));
        },

        '/api/hayagriva/system/telemetry': (req, res, parsedUrl, docsRoot) => {
            const os = require('os');
            const totalMemBytes = os.totalmem();
            let freeMemBytes = os.freemem();
            
            // On macOS (darwin), os.freemem() only counts completely zeroed pages.
            // macOS uses 8-10GB of RAM for file system cache. Use vm_stat to get real available RAM.
            if (process.platform === 'darwin') {
                try {
                    const { execSync } = require('child_process');
                    const vmStat = execSync('vm_stat', { encoding: 'utf8' });
                    const getPages = (key) => {
                        const m = vmStat.match(new RegExp(`${key}:\\s+(\\d+)`));
                        return m ? parseInt(m[1], 10) : 0;
                    };
                    const pageSize = 4096;
                    const pagesFree = getPages('Pages free');
                    const pagesInactive = getPages('Pages inactive');
                    const pagesPurgeable = getPages('Pages purgeable');
                    const realFreeBytes = (pagesFree + pagesInactive + pagesPurgeable) * pageSize;
                    if (realFreeBytes > 0) freeMemBytes = realFreeBytes;
                } catch (_) {}
            }

            const totalMemGb = parseFloat((totalMemBytes / (1024 * 1024 * 1024)).toFixed(1));
            const freeMemGb = parseFloat((freeMemBytes / (1024 * 1024 * 1024)).toFixed(1));
            const usedMemGb = parseFloat((Math.max(0, totalMemBytes - freeMemBytes) / (1024 * 1024 * 1024)).toFixed(1));
            const usedPercent = Math.min(100, Math.round(((totalMemBytes - freeMemBytes) / totalMemBytes) * 100));
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                totalMemGb,
                freeMemGb,
                usedMemGb,
                usedPercent,
                cpuCores: os.cpus().length,
                platform: os.platform(),
                recommendedMode: totalMemGb >= 14 ? 'local' : 'lite'
            }));
        },

        '/api/hayagriva/settings/get': (req, res, parsedUrl, docsRoot) => {
            const caseName = parsedUrl.query.case || '';
            const caseDir = resolveCaseDir(docsRoot, caseName);
            const settingsPath = path.join(caseDir, 'hayagriva_settings.json');
            
            let config = { ...DEFAULT_SETTINGS };
            if (fs.existsSync(settingsPath)) {
                try {
                    const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
                    config = { ...config, ...saved };
                } catch (_) {}
            }

            let libreOfficeDetected = false;
            try {
                const { execSync } = require('child_process');
                const paths = [
                    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
                    'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
                    'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe'
                ];
                for (const p of paths) {
                    if (fs.existsSync(p)) {
                        libreOfficeDetected = true;
                        break;
                    }
                }
                if (!libreOfficeDetected) {
                    const cmd = process.platform === 'win32' ? 'where' : 'which';
                    execSync(`${cmd} soffice`, { stdio: 'ignore' });
                    libreOfficeDetected = true;
                }
            } catch (_) {}

            let documentCount = 0;
            try {
                const { getDb } = require('./core/sqlite-store');
                const db = getDb(caseDir);
                const row = db.prepare('SELECT COUNT(*) as count FROM documents').get();
                documentCount = row ? (row.count || 0) : 0;
            } catch (_) {}

            const conversionsDir = getConversionsDir(caseDir);
            const manifestPath = path.join(conversionsDir, 'case_manifest.json');
            let manifestDomain = null;
            if (fs.existsSync(manifestPath)) {
                try {
                    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                    manifestDomain = manifest.domain;
                } catch (_) {}
            }
            const activeDom = config.activeDomain || manifestDomain;
            const isDomainConfigured = !!activeDom && activeDom.toLowerCase() !== 'unconfigured';

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ...config, libreOfficeDetected, documentCount, isDomainConfigured }));
        },

        '/api/hayagriva/llm/model-info': (req, res, parsedUrl, docsRoot) => {
            const caseName = parsedUrl.query.case || '';
            const caseDir = resolveCaseDir(docsRoot, caseName);
            const { loadLlmConfig } = require('./core/llm-client');
            const config = loadLlmConfig({ caseDir });
            
            let vertical = 'legal';
            if (caseDir) {
                const caseConfigPath = path.join(getConceptsDir(caseDir), 'case_metadata.json');
                if (fs.existsSync(caseConfigPath)) {
                    try {
                        const caseMeta = JSON.parse(fs.readFileSync(caseConfigPath, 'utf8'));
                        vertical = caseMeta.vertical || 'legal';
                    } catch (_) {}
                } else if (caseDir.toLowerCase().includes('ibc') || caseDir.toLowerCase().includes('finance')) {
                    vertical = 'finance';
                }
            }
            
            const modelName = vertical === 'finance' ? 'financeparam-2.9b' : 'legalparam-2.9b';
            const sizeB = 2.9;
            const tier = config.activeMode === 'lite' ? 'none' : 'local';
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                activeMode: config.activeMode,
                modelName: config.activeMode === 'local' ? modelName : 'None',
                sizeB: config.activeMode === 'local' ? sizeB : null,
                tier
            }));
        },

        '/api/hayagriva/llm/engines-status': async (req, res) => {
            const { checkLlamafileHealth } = require('./core/llm-client');
            const isEngineRunning = await checkLlamafileHealth('http://127.0.0.1:8090');
            const legalActive = isEngineRunning && (activeEngineDomain === 'legal' || !activeEngineDomain);
            const financeActive = isEngineRunning && activeEngineDomain === 'finance';
            const saulActive = isEngineRunning && activeEngineDomain === 'saul';
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ legalActive, financeActive, saulActive, engineActive: isEngineRunning, activeDomain: activeEngineDomain }));
        },

        // ─── Marketplace: Catalog ──────────────────────────────────────────────
        '/api/hayagriva/marketplace/catalog': (req, res, parsedUrl, docsRoot) => {
            try {
                const vaultPacksDir = path.join(__dirname, '..', '..', 'vault', 'agent_packs');
                const dataVaultsDir = path.join(__dirname, '..', '..', 'vault', 'data_vaults');
                const modelsDir = path.join(__dirname, '..', '..', 'models', 'llm');
                const { getCatalogStatus } = require('./pipeline/vault-importer');
                const catalogStatus = getCatalogStatus();

                const installedPacks = fs.existsSync(vaultPacksDir)
                    ? fs.readdirSync(vaultPacksDir).filter(d =>
                        d.endsWith('.vlt') && fs.statSync(path.join(vaultPacksDir, d)).isDirectory()
                      )
                    : [];

                const installedModels = fs.existsSync(modelsDir)
                    ? fs.readdirSync(modelsDir, { recursive: true })
                        .filter(f => typeof f === 'string' && f.endsWith('.gguf'))
                        .map(f => path.basename(f).toLowerCase())
                    : [];

                const getStatus = (itemId, isInstalled) => {
                    const statusObj = catalogStatus[itemId];
                    if (statusObj && statusObj.status !== 'available') return statusObj.status;
                    return isInstalled ? 'installed' : 'available';
                };

                const catalog = {
                    agentPacks: [
                        {
                            id: 'legal_agents.vlt',
                            name: 'Legal Agents',
                            description: '19 subagents — @advisor, @avoidance, @nclt, @claims, and more.',
                            tier: 'starter',
                            status: getStatus('legal_agents.vlt', installedPacks.includes('legal_agents.vlt')),
                            progressPct: catalogStatus['legal_agents.vlt']?.progressPct || 0
                        },
                        {
                            id: 'finance_agents.vlt',
                            name: 'Finance Agents',
                            description: '2 subagents — @forensic, @tax for financial analysis.',
                            tier: 'starter',
                            status: getStatus('finance_agents.vlt', installedPacks.includes('finance_agents.vlt')),
                            progressPct: catalogStatus['finance_agents.vlt']?.progressPct || 0
                        },
                        {
                            id: 'coding_agents.vlt',
                            name: 'Coding Agents',
                            description: '4 subagents — @architecture, @debugger, @codewriter.',
                            tier: 'starter',
                            status: getStatus('coding_agents.vlt', installedPacks.includes('coding_agents.vlt')),
                            progressPct: catalogStatus['coding_agents.vlt']?.progressPct || 0
                        }
                    ],
                    dataVaults: [
                        {
                            id: 'laws_vault',
                            name: 'Laws & Acts Vault',
                            description: 'Comprehensive Indian statutory acts and rules database.',
                            sizeMb: 33.6,
                            status: getStatus('laws_vault', fs.existsSync(path.join(dataVaultsDir, 'laws'))),
                            progressPct: catalogStatus['laws_vault']?.progressPct || 0
                        },
                        {
                            id: 'cases_vault',
                            name: 'Judgments & Case Law Vault',
                            description: 'Supreme Court & NCLAT landmark case precedent indices.',
                            sizeMb: 132.8,
                            status: getStatus('cases_vault', fs.existsSync(path.join(dataVaultsDir, 'cases'))),
                            progressPct: catalogStatus['cases_vault']?.progressPct || 0
                        },
                        {
                            id: 'documents_vault',
                            name: 'Legal Templates Vault',
                            description: 'Standard pleadings, notices, agreements, and forms.',
                            sizeMb: 28.7,
                            status: getStatus('documents_vault', fs.existsSync(path.join(dataVaultsDir, 'documents'))),
                            progressPct: catalogStatus['documents_vault']?.progressPct || 0
                        }
                    ],
                    llmEngines: [
                        {
                            id: 'legalparam-2.9b',
                            name: 'LegalParam 2.9B',
                            description: 'Bundled starter LLM — Indian legal domain, 2K context.',
                            tier: 'starter',
                            sizeGb: 1.7,
                            context: '2K tokens',
                            status: getStatus('legalparam-2.9b', installedModels.some(m => m.includes('legalparam'))),
                            progressPct: catalogStatus['legalparam-2.9b']?.progressPct || 0
                        },
                        {
                            id: 'financeparam-2.9b',
                            name: 'FinanceParam 2.9B',
                            description: 'Bundled starter LLM — Indian financial domain, 2K context.',
                            tier: 'starter',
                            sizeGb: 1.7,
                            context: '2K tokens',
                            status: getStatus('financeparam-2.9b', installedModels.some(m => m.includes('financeparam'))),
                            progressPct: catalogStatus['financeparam-2.9b']?.progressPct || 0
                        },
                        {
                            id: 'saullm-7b',
                            name: 'SaulLM 7B Instruct',
                            badge: 'PRO — Available',
                            description: 'Specialized 7B Legal LLM pre-trained on 30B+ legal tokens. 2K context.',
                            tier: 'professional',
                            sizeGb: 4.37,
                            context: '2K tokens',
                            status: getStatus('saullm-7b', installedModels.some(m => m.toLowerCase().includes('saul'))),
                            progressPct: catalogStatus['saullm-7b']?.progressPct || 0
                        },
                        {
                            id: 'hayaparam-7b',
                            name: 'HayaParam 7B',
                            badge: 'PRO — Coming Soon',
                            description: 'Fine-tuned on Indian legal + financial corpus. 24K context.',
                            tier: 'professional',
                            sizeGb: 4.7,
                            context: '24K tokens',
                            status: 'locked'
                        },
                        {
                            id: 'hayaparam-14b',
                            name: 'HayaParam 14B',
                            badge: 'ENTERPRISE — Coming Soon',
                            description: 'Full document analysis — 64K context for complete resolution plans.',
                            tier: 'enterprise',
                            sizeGb: 8.5,
                            context: '64K tokens',
                            status: 'locked'
                        }
                    ]
                };

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(catalog));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            }
        },

        // ─── Marketplace & Suites Catalog (GET) ──────────────────────────────
        '/api/hayagriva/marketplace/suites-metadata': (req, res, parsedUrl, docsRoot) => {
            try {
                const { getSuitesCatalog } = require('./core/suites-catalog');
                const catalog = getSuitesCatalog();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, totalCount: (catalog.suites || []).length, ...catalog }));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: e.message }));
            }
        },

        // ─── Model Downloader & Status (GET) ─────────────────────────────────
        '/api/hayagriva/models/check': (req, res, parsedUrl, docsRoot) => {
            try {
                const modelDownloader = require('./core/model-downloader');
                const status = modelDownloader.checkModelsStatus();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, ...status }));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: e.message }));
            }
        },

        '/api/hayagriva/models/download-status': (req, res, parsedUrl, docsRoot) => {
            try {
                const domain = parsedUrl.query.domain || null;
                const modelDownloader = require('./core/model-downloader');
                const status = modelDownloader.getStatus(domain);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, status }));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: e.message }));
            }
        },

        // ─── License Activation Callback (GET Redirect from Browser) ─────────
        '/api/hayagriva/license/activate': (req, res, parsedUrl, docsRoot) => {
            const token = parsedUrl.query.token || parsedUrl.query.key || '';
            const caseName = parsedUrl.query.case || '';
            const caseDir = resolveCaseDir(docsRoot, caseName);
            const { activateLicense } = require('./core/license-manager');
            const { writeLicenseToSettings } = require('./utils/license-validator');

            const result = activateLicense(token, caseDir);
            if (!result.success) {
                res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(`<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;background:#0f172a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><div style="background:#1e293b;padding:32px;border-radius:12px;border:1px solid #ef4444;max-width:440px;text-align:center;"><h2 style="color:#ef4444;margin-top:0;">License Activation Failed</h2><p style="color:#94a3b8;font-size:14px;">${result.error || 'Invalid signature'}</p></div></body></html>`);
                return;
            }

            if (caseDir && fs.existsSync(caseDir)) {
                writeLicenseToSettings(caseDir, token);
            }

            const allowedBadges = (result.allowed_packs || []).map(p => `<span style="display:inline-block;padding:3px 10px;margin:3px;background:rgba(16,185,129,0.2);color:#34d399;border-radius:20px;font-size:12px;font-weight:700;">✓ ${p}</span>`).join(' ');

            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;background:#0f172a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;"><div style="background:#1e293b;padding:36px;border-radius:16px;border:1px solid #10b981;max-width:480px;text-align:center;box-shadow:0 20px 40px rgba(0,0,0,0.5);"><div style="font-size:48px;margin-bottom:12px;">🎉</div><h2 style="color:#10b981;margin:0 0 10px;">License Activated in Hayagriva IDE</h2><p style="color:#cbd5e1;font-size:14px;margin-bottom:16px;">Welcome <strong>${result.licensee || 'Practitioner'}</strong> (${result.tier || 'pro'}).</p><div style="margin-bottom:20px;">${allowedBadges}</div><p style="color:#64748b;font-size:12px;">You can now close this tab and return to your IDE.</p></div></body></html>`);
        }
    },

    POST: {
        '/api/billing/record-pending': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    const data = JSON.parse(body || '{}');
                    const caseName = data.case || parsedUrl.query.case || '';
                    const caseDir = resolveCaseDir(docsRoot, caseName);
                    if (!caseDir) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, error: 'Case directory not found' }));
                        return;
                    }
                    const { recordPendingTask } = require('./core/case-billing-store');
                    const task = recordPendingTask(caseDir, data.task || data);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, task }));
                } catch (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: err.message }));
                }
            });
        },

        '/api/billing/authorize-task': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    const data = JSON.parse(body || '{}');
                    const caseName = data.case || parsedUrl.query.case || '';
                    const caseDir = resolveCaseDir(docsRoot, caseName);
                    if (!caseDir) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, error: 'Case directory not found' }));
                        return;
                    }
                    const { markTaskAuthorized } = require('./core/case-billing-store');
                    const taskId = data.taskId || data.task_id;
                    markTaskAuthorized(caseDir, taskId, data.authorizedBy || 'user');
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, taskId }));
                } catch (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: err.message }));
                }
            });
        },

        '/api/billing/record-executed': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    const data = JSON.parse(body || '{}');
                    const caseName = data.case || parsedUrl.query.case || '';
                    const caseDir = resolveCaseDir(docsRoot, caseName);
                    if (!caseDir) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, error: 'Case directory not found' }));
                        return;
                    }
                    const { markTaskExecuted } = require('./core/case-billing-store');
                    const taskId = data.taskId || data.task_id;
                    const result = markTaskExecuted(caseDir, taskId, data.serverResult || data);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, result }));
                } catch (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: err.message }));
                }
            });
        },

        '/api/billing/cancel-task': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    const data = JSON.parse(body || '{}');
                    const caseName = data.case || parsedUrl.query.case || '';
                    const caseDir = resolveCaseDir(docsRoot, caseName);
                    if (!caseDir) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, error: 'Case directory not found' }));
                        return;
                    }
                    const { cancelTask } = require('./core/case-billing-store');
                    const taskId = data.taskId || data.task_id;
                    cancelTask(caseDir, taskId);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, taskId }));
                } catch (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: err.message }));
                }
            });
        },

        '/api/billing/sync-server': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body || '{}');
                    const caseName = data.case || parsedUrl.query.case || '';
                    const caseDir = resolveCaseDir(docsRoot, caseName);
                    if (!caseDir) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, error: 'Case directory not found' }));
                        return;
                    }
                    const caseId = path.basename(caseDir);
                    const serverUrl = data.serverUrl || 'http://127.0.0.1:8000';
                    const http = require('http');

                    const fetchUrl = `${serverUrl}/api/v1/billing/case-summary?case_id=${encodeURIComponent(caseId)}`;
                    const serverData = await new Promise((resolve) => {
                        http.get(fetchUrl, (srvRes) => {
                            let raw = '';
                            srvRes.on('data', c => raw += c);
                            srvRes.on('end', () => {
                                try {
                                    resolve(JSON.parse(raw));
                                } catch (e) {
                                    resolve({ error: e.message, raw });
                                }
                            });
                        }).on('error', err => resolve({ error: err.message, offline: true }));
                    });

                    const { getCaseLedger, updateSettlementStatus } = require('./core/case-billing-store');
                    if (serverData && serverData.invoices && Array.isArray(serverData.invoices)) {
                        for (const inv of serverData.invoices) {
                            if (inv.payment_status === 'PAID') {
                                updateSettlementStatus(
                                    caseDir,
                                    inv.invoice_id,
                                    inv.invoice_number,
                                    inv.total_inr,
                                    inv.gateway_payment_id || 'SERVER_SYNC',
                                    'WEBHOOK_SYNC'
                                );
                            }
                        }
                    }

                    const localLedger = getCaseLedger(caseDir);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: true,
                        serverOnline: !serverData.offline && !serverData.error,
                        serverData,
                        localLedger
                    }));
                } catch (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: err.message }));
                }
            });
        },
        '/api/hayagriva/engine/start': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body || '{}');
                    const engine = (data.engine === 'finance' || data.engine === 'hayafinance') ? 'finance' : ((data.engine === 'saul' || data.engine === 'hayapro') ? 'saul' : 'legal');
                    activeEngineDomain = engine;
                    const { spawn } = require('child_process');
                    
                    // Safely unbind port 8090 without shell pipe risks
                    killProcessOnPort(8090);

                    // 1,500ms grace period to allow macOS kernel to fully unbind port 8090
                    await new Promise(resolve => setTimeout(resolve, 1500));

                    const scriptPath = path.join(__dirname, '..', 'scripts', 'run-llama-server.sh');
                    const child = spawn('bash', [scriptPath, engine], {
                        detached: true,
                        stdio: 'ignore'
                    });
                    child.unref();

                    // Wait and verify server health
                    const { checkLlamafileHealth } = require('./core/llm-client');
                    let isHealthy = false;
                    for (let i = 0; i < 5; i++) {
                        await new Promise(resolve => setTimeout(resolve, 500));
                        if (await checkLlamafileHealth('http://127.0.0.1:8090')) {
                            isHealthy = true;
                            break;
                        }
                    }

                    // Update active case settings to activeMode: 'standard'
                    const caseName = data.case || '';
                    const caseDir = resolveCaseDir(docsRoot, caseName);
                    if (caseDir && fs.existsSync(caseDir)) {
                        const settingsPath = path.join(caseDir, 'hayagriva_settings.json');
                        let settings = {};
                        if (fs.existsSync(settingsPath)) {
                            try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch (_) {}
                        }
                        settings.activeMode = 'standard';
                        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
                    }

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: true,
                        healthy: isHealthy,
                        message: `${engine} engine started on port 8090. Mode set to Standard.`,
                        activeMode: 'standard'
                    }));
                } catch (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: err.message }));
                }
            });
        },

        '/api/hayagriva/engine/stop': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body || '{}');
                    
                    // Safely unbind port 8090 without shell pipe risks
                    killProcessOnPort(8090);

                    // Revert case settings to activeMode: 'lite'
                    const caseName = data.case || '';
                    const caseDir = resolveCaseDir(docsRoot, caseName);
                    if (caseDir && fs.existsSync(caseDir)) {
                        const settingsPath = path.join(caseDir, 'hayagriva_settings.json');
                        let settings = {};
                        if (fs.existsSync(settingsPath)) {
                            try { settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')); } catch (_) {}
                        }
                        settings.activeMode = 'lite';
                        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
                    }

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, message: 'LLM Engine on port 8090 stopped. Mode set to Lite.', activeMode: 'lite' }));
                } catch (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: err.message }));
                }
            });
        },

        // Called by the frontend at workspace startup to synchronously write settings.json
        // BEFORE Theia renders the sidebar — so Open Editors is hidden from the first render.
        '/api/hayagriva/bootstrap-case': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    const data = JSON.parse(body || '{}');
                    const caseName = data.case || '';
                    const caseDir = resolveCaseDir(docsRoot, caseName);
                    const isRoot = caseDir && path.resolve(caseDir) === path.resolve(docsRoot);
                    if (caseDir && fs.existsSync(caseDir) && !isRoot) {
                        ensureCaseSettings(caseDir);
                        ensureAuditDocs(caseDir);
                        ensureCaseManifest(caseDir);

                        // Bootstrap domain-specific folder taxonomy subdirectories (00_inbox, 01_commencement, etc.)
                        const { bootstrapDomainTaxonomy } = require('./core/domain-registry');
                        bootstrapDomainTaxonomy(caseDir);

                        // D8: Sweep expired .trash items (7-day retention)
                        sweepTrash(caseDir);

                        // Dynamically attach file watcher to workspace
                        const { ensureCaseWatcher } = require('./daemon/watcher');
                        ensureCaseWatcher(caseDir);

                        console.log(`[API Server] bootstrap-case: settings and audit docs initialized for ${caseDir}`);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, caseDir }));
                    } else {
                        res.writeHead(404, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Case directory not found', caseDir }));
                    }
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
        },

        // D8: Soft-delete — move PDF + companion + concepts to .trash/ (7-day retention)
        '/api/hayagriva/delete-file': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    const { file, case: caseName } = JSON.parse(body || '{}');
                    if (!file) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Missing file parameter' }));
                        return;
                    }
                    const caseDir = resolveCaseDir(docsRoot, caseName);
                    if (!caseDir || !fs.existsSync(caseDir)) {
                        res.writeHead(404, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Case directory not found' }));
                        return;
                    }

                    const trashDir = path.join(caseDir, '.trash');
                    fs.mkdirSync(trashDir, { recursive: true });
                    const expiryFile = path.join(trashDir, '.expiry.json');
                    let expiry = {};
                    try { expiry = JSON.parse(fs.readFileSync(expiryFile, 'utf8')); } catch (_) {}

                    const filePath = file; // absolute path sent from frontend
                    const ext = path.extname(filePath).toLowerCase();
                    const basename = path.basename(filePath, ext);
                    const relative = path.relative(caseDir, filePath).replace(/\\/g, '/');
                    const expireAt = Date.now() + 7 * 24 * 60 * 60 * 1000;

                    // 1. Move original file to .trash/
                    if (fs.existsSync(filePath)) {
                        const trashFilePath = path.join(trashDir, path.basename(filePath));
                        fs.renameSync(filePath, trashFilePath);
                        expiry[path.basename(filePath)] = expireAt;
                        console.log(`[Trash] Moved ${path.basename(filePath)} to .trash/`);
                    }

                    // 2. Move companion .md from conversions/
                    const companionPath = path.join(getConversionsDir(caseDir), `${basename}.md`);
                    if (fs.existsSync(companionPath)) {
                        const trashCompDir = path.join(trashDir, 'conversions');
                        fs.mkdirSync(trashCompDir, { recursive: true });
                        fs.renameSync(companionPath, path.join(trashCompDir, `${basename}.md`));
                        expiry[`conversions/${basename}.md`] = expireAt;
                        console.log(`[Trash] Moved conversions/${basename}.md to .trash/conversions/`);
                    }

                    // Also remove .status sidecar
                    const statusPath = path.join(getConversionsDir(caseDir), `${basename}.status`);
                    if (fs.existsSync(statusPath)) { try { fs.unlinkSync(statusPath); } catch (_) {} }

                    // 3. Move concepts folder
                    const conceptsPath = path.join(getConceptsDir(caseDir), basename);
                    if (fs.existsSync(conceptsPath)) {
                        const trashConceptDir = path.join(trashDir, 'concepts', basename);
                        fs.mkdirSync(path.join(trashDir, 'concepts'), { recursive: true });
                        fs.renameSync(conceptsPath, trashConceptDir);
                        expiry[`concepts/${basename}`] = expireAt;
                        console.log(`[Trash] Moved concepts/${basename}/ to .trash/concepts/`);
                    }

                    // 4. Remove from SQLite
                    try {
                        const { getDb } = require('./core/sqlite-store');
                        const db = getDb(caseDir);
                        db.prepare('DELETE FROM documents WHERE filename = ?').run(relative);
                        db.prepare('DELETE FROM document_sections WHERE filename = ?').run(relative);
                        db.prepare('DELETE FROM document_vectors WHERE filename = ?').run(relative);
                        db.prepare('DELETE FROM fts_chunks WHERE filename = ?').run(relative);
                        console.log(`[Trash] Removed ${relative} from SQLite`);
                    } catch (e) {
                        console.warn('[Trash] SQLite cleanup failed:', e.message);
                    }

                    // 5. Save expiry map
                    fs.writeFileSync(expiryFile, JSON.stringify(expiry, null, 2), 'utf8');

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, message: `Moved to .trash/ (expires in 7 days)` }));
                } catch (e) {
                    console.error('[Trash] delete-file error:', e.message);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: e.message }));
                }
            });
        },



        '/api/hayagriva/archive-case': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body || '{}');
                    const caseName = data.case || '';
                    const caseDir = resolveCaseDir(docsRoot, caseName);
                    if (caseDir && fs.existsSync(caseDir)) {
                        const { archiveCase } = require('./core/archive-service');
                        await archiveCase(caseDir);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, message: 'Case archived successfully in sqlite database' }));
                    } else {
                        res.writeHead(404, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Case directory not found', caseDir }));
                    }
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
        },

        '/api/hayagriva/restore-case': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body || '{}');
                    const caseName = data.case || '';
                    const caseDir = resolveCaseDir(docsRoot, caseName);
                    if (caseDir && fs.existsSync(caseDir)) {
                        const { restoreCase } = require('./core/archive-service');
                        const restored = await restoreCase(caseDir);
                        if (restored) {
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: true, message: 'Case restored successfully from sqlite database' }));
                        } else {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'No archive records found in database to restore' }));
                        }
                    } else {
                        res.writeHead(404, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Case directory not found', caseDir }));
                    }
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
        },

        '/api/hayagriva/settings/save': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    const data = JSON.parse(body || '{}');
                    const caseName = data.case || '';
                    const caseDir = resolveCaseDir(docsRoot, caseName);
                    
                    if (!fs.existsSync(caseDir)) {
                        res.writeHead(404, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Case directory not found' }));
                        return;
                    }

                    const settingsPath = path.join(caseDir, 'hayagriva_settings.json');
                    let existing = { ...DEFAULT_SETTINGS };
                    if (fs.existsSync(settingsPath)) {
                        try { existing = { ...existing, ...JSON.parse(fs.readFileSync(settingsPath, 'utf8')) }; } catch (_) {}
                    }
                    
                    const { validateWorkspaceDomain } = require('./utils/license-validator');
                    const { bootstrapDomainTaxonomy } = require('./core/domain-registry');

                    const activeMode = data.activeMode !== undefined ? data.activeMode : existing.activeMode;
                    const remindLibreOffice = data.remindLibreOffice !== undefined ? (data.remindLibreOffice !== false) : existing.remindLibreOffice;
                    
                    let activeDomain = existing.activeDomain || 'insolvency';
                    if (data.activeDomain) {
                        const targetDomain = String(data.activeDomain).toLowerCase().trim();
                        // Enforce Workspace Domain Locking Policy:
                        // If case workspace already contains ingested documents, block mid-case domain switching
                        let documentCount = 0;
                        try {
                            const { getDb } = require('./core/sqlite-store');
                            const db = getDb(caseDir);
                            const row = db.prepare('SELECT COUNT(*) as count FROM documents').get();
                            documentCount = row ? (row.count || 0) : 0;
                        } catch (_) {}

                        if (documentCount > 0 && targetDomain !== activeDomain.toLowerCase()) {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({
                                success: false,
                                error: `Workspace domain is locked to '${activeDomain}' because ${documentCount} document(s) have already been ingested into this workspace. To work on '${targetDomain}' tasks, please create or open a dedicated workspace for that domain.`
                            }));
                            return;
                        }

                        const domainValidation = validateWorkspaceDomain(targetDomain, caseDir);
                        if (domainValidation.allowed) {
                            activeDomain = domainValidation.domain;
                        } else {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: false, error: domainValidation.reason }));
                            return;
                        }
                    }

                    const lightragApiKey = data.lightragApiKey !== undefined ? data.lightragApiKey : (data.advisoryApiKey || existing.lightragApiKey || existing.advisoryApiKey || '');
                    const lightragApiUrl = data.lightragApiUrl !== undefined ? data.lightragApiUrl : (existing.lightragApiUrl || 'http://localhost:8020');

                    const savedConfig = {
                        ...existing,
                        processingProfile: activeMode === 'lite' ? 'lite' : 'standard',
                        activeMode: activeMode,
                        activeDomain: activeDomain,
                        remindLibreOffice: remindLibreOffice,
                        lightragApiKey: lightragApiKey,
                        advisoryApiKey: lightragApiKey,
                        lightragApiUrl: lightragApiUrl
                    };

                    fs.writeFileSync(settingsPath, JSON.stringify(savedConfig, null, 2), 'utf8');

                    // Also mirror to user global settings directory (~/.gemini/)
                    try {
                        const globalDir = path.join(require('os').homedir(), '.gemini');
                        if (!fs.existsSync(globalDir)) fs.mkdirSync(globalDir, { recursive: true });
                        const globalSettingsFile = path.join(globalDir, 'hayagriva_settings.json');
                        let globalExisting = {};
                        if (fs.existsSync(globalSettingsFile)) {
                            try { globalExisting = JSON.parse(fs.readFileSync(globalSettingsFile, 'utf8')); } catch (_) {}
                        }
                        fs.writeFileSync(globalSettingsFile, JSON.stringify({ ...globalExisting, ...savedConfig }, null, 2), 'utf8');
                    } catch (_) {}

                    // Mirror activeDomain into case_manifest.json and bootstrap domain folder taxonomy
                    const conversionsDir = getConversionsDir(caseDir);
                    const manifestPath = path.join(conversionsDir, 'case_manifest.json');
                    if (fs.existsSync(manifestPath)) {
                        try {
                            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                            manifest.domain = activeDomain;
                            fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
                        } catch (_) {}
                    }
                    bootstrapDomainTaxonomy(caseDir);

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, settings: savedConfig }));
                } catch (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: err.message }));
                }
            });
        },

        '/api/hayagriva/settings': (req, res, parsedUrl, docsRoot) => {
            if (req.method === 'POST') {
                return routes['/api/hayagriva/settings/save'](req, res, parsedUrl, docsRoot);
            }
            return routes['/api/hayagriva/settings/get'](req, res, parsedUrl, docsRoot);
        },

        '/api/hayagriva/switch-context': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                const data = JSON.parse(body);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, activeBag: data.doc }));
            });
        },

        '/api/hayagriva/query': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                const data = JSON.parse(body);
                const caseName = data.case || '';
                const caseDir = resolveCaseDir(docsRoot, caseName);
                const qResult = await query(caseDir, data.query || 'Hello', { model: data.model });
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(qResult));
            });
        },

        '/api/hayagriva/query-stream': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                const data = JSON.parse(body);
                const caseName = data.case || '';
                const caseDir = resolveCaseDir(docsRoot, caseName);
                const queryText = data.query || 'Hello';
                const contexts = await retrieveContexts(caseDir, queryText);
                
                res.writeHead(200, {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive'
                });

                if (contexts.length === 0) {
                    let skeletonName = null;
                    try {
                        const docAgent = require('./agents/document-agent/agent');
                        if (docAgent && docAgent.detectSkeleton) {
                            skeletonName = docAgent.detectSkeleton(queryText);
                        }
                    } catch (_) {}

                    let fallbackText = '';
                    if (skeletonName) {
                        try {
                            const { loadSkeleton } = require('./agents/skills/skeleton-load');
                            const REPO_ROOT = require('path').join(__dirname, '..', '..');
                            const loaded = loadSkeleton(skeletonName, REPO_ROOT);
                            if (loaded && loaded.content) {
                                fallbackText = `> ℹ️ **Note: No specific matching case files found in RAG context. Loaded standard template skeleton below:**\n\n${loaded.content}`;
                            }
                        } catch (_) {}
                    }

                    if (!fallbackText) {
                        fallbackText = `> ℹ️ **Note: No specific matching case files found in RAG context for your query.**\n\n` +
                            `Here is the standard legal format outline for **"${queryText}"**:\n\n` +
                            `### 1. Parties & Jurisdiction\n` +
                            `- **Applicant / Financial Creditor:** \`{{ FINANCIAL_CREDITOR_NAME }}\`\n` +
                            `- **Corporate Debtor:** \`{{ CORPORATE_DEBTOR_NAME }}\`\n` +
                            `- **Adjudicating Authority:** NCLT Bench \`{{ NCLT_BENCH_LOCATION }}\`\n\n` +
                            `### 2. Particulars of Debt & Default\n` +
                            `| Sl. | Particulars | Details |\n` +
                            `|---|---|---|\n` +
                            `| 1. | Total Amount of Debt | \`{{ TOTAL_DEBT_AMOUNT }}\` |\n` +
                            `| 2. | Date of Default | \`{{ DEFAULT_DATE }}\` |\n` +
                            `| 3. | Financial Contract Reference | \`{{ LOAN_AGREEMENT_REF }}\` |\n\n` +
                            `### 3. Reliefs & Prayers Sought\n` +
                            `1. Admit the application under Section 7 / Section 9 of the Insolvency & Bankruptcy Code, 2016.\n` +
                            `2. Declare a moratorium under Section 14 of the Code.\n` +
                            `3. Appoint \`{{ PROPOSED_IRP_NAME }}\` as the Interim Resolution Professional.`;
                    }

                    res.write(`data: ${JSON.stringify({ content: fallbackText })}\n\n`);
                    res.write(`data: ${JSON.stringify({ done: true, sources: [] })}\n\n`);
                    res.end();
                    return;
                }

                const prompt = buildPrompt(queryText, contexts);
                const messages = [{ role: 'user', content: prompt }];
                
                try {
                    const stream = streamChat(messages, { model: data.model, caseDir: caseDir });
                    for await (const chunk of stream) {
                        res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
                    }
                    const sources = Array.from(new Set(contexts.map(c => c.docName)));
                    res.write(`data: ${JSON.stringify({ done: true, sources })}\n\n`);
                } catch (e) {
                    res.write(`data: ${JSON.stringify({ content: `\nError calling local LLM: ${e.message}` })}\n\n`);
                    res.write(`data: ${JSON.stringify({ done: true, sources: [] })}\n\n`);
                }
                res.end();
            });
        },

        '/api/hayagriva/convert-to-md': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                const data = JSON.parse(body);
                const file = data.file || data.filePath;
                if (!file) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Missing file parameter' }));
                    return;
                }
                const caseName = data.case || '';
                const caseDir = resolveCaseDir(docsRoot, caseName);
                ensureCaseSettings(caseDir);
                const relative = path.relative(caseDir, file);
                const ext = path.extname(file).toLowerCase();
                const basename = path.basename(file, ext);

                // Perform clean-up if forced regeneration is requested
                if (data.force) {
                    console.log(`[API Server] Forced regeneration requested for: ${relative}. Cleaning up old sidecar assets...`);
                    const companionPath = file.replace(/\.[a-zA-Z0-9]+$/, '.md');
                    const statusPath1 = companionPath.replace(/\.md$/, '.status');
                    
                    const subfolder = path.dirname(relative);
                    const conversionsDir = getConversionsDir(caseDir);
                    const destDir = subfolder === '.' ? conversionsDir : path.join(conversionsDir, subfolder);
                    const statusPath2 = path.join(destDir, `${basename}.status`);
                    
                    const footerPath = file.toLowerCase().endsWith('.pdf') ? file.replace(/\.pdf$/i, '.footer') : '';
                    const cachePath = companionPath + '.cache';

                    const safeDelete = (p) => {
                        try {
                            if (p && p !== file && fs.existsSync(p)) {
                                fs.unlinkSync(p);
                                console.log(`[API Server] Cleaned up asset: ${path.basename(p)}`);
                            }
                        } catch (_) {}
                    };

                    safeDelete(companionPath);
                    safeDelete(statusPath1);
                    safeDelete(statusPath2);
                    if (footerPath) safeDelete(footerPath);
                    safeDelete(cachePath);

                    // Clear the completedPdfSet to reset lazy loading state
                    try {
                        const { completedPdfSet } = require('./daemon/lazy_pdf_worker');
                        if (completedPdfSet && typeof completedPdfSet.delete === 'function') {
                            completedPdfSet.delete(file);
                            console.log(`[API Server] Reset completedPdfSet for: ${file}`);
                        }
                    } catch (e) {
                        console.warn('[API Server] Could not clear completedPdfSet:', e.message);
                    }
                }

                updateStatus(caseDir, relative, 'converting');

                const { loadLlmConfig } = require('./core/llm-client');
                const config = loadLlmConfig({ caseDir });
                const allowMultimodal = config.activeMode !== 'lite' && !!data.multimodal;

                ingestFile(caseDir, file, { 
                    conversionOnly: true,
                    multimodal: allowMultimodal
                }).then(result => {
                    if (result && result.companionPath) {
                        updateStatus(caseDir, relative, 'companion_ready');
                    } else {
                        updateStatus(caseDir, relative, 'failed_convert');
                    }
                }).catch(err => {
                    console.error(`[API Server] Conversion failed for ${basename}:`, err.message);
                    updateStatus(caseDir, relative, 'failed_convert', err.message);
                });

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, status: 'converting' }));
            });
        },

        '/api/hayagriva/ingest-to-context': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                const data = JSON.parse(body);
                const file = data.file || data.filePath;
                if (!file) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Missing file parameter' }));
                    return;
                }
                const caseName = data.case || '';
                const caseDir = resolveCaseDir(docsRoot, caseName);
                ensureCaseSettings(caseDir);
                const relative = path.relative(caseDir, file);
                const isWikiHtml = file.endsWith('.wiki.html');
                const ext = isWikiHtml ? '.wiki.html' : path.extname(file).toLowerCase();
                const basename = isWikiHtml ? path.basename(file, '.wiki.html') : path.basename(file, ext);

                updateStatus(caseDir, relative, 'ingesting');

                const companionPath = isWikiHtml ? file : file.replace(/\.[a-zA-Z0-9]+$/, '.md');

                ingestFile(caseDir, companionPath, { 
                    conversionOnly: false,
                    disableDoc2Query: true 
                }).then(result => {
                    if (result) {
                        updateStatus(caseDir, relative, 'indexed');
                    } else {
                        updateStatus(caseDir, relative, 'failed_ingest');
                    }
                }).catch(err => {
                    console.error(`[API Server] Ingestion failed for ${basename}:`, err.message);
                    updateStatus(caseDir, relative, 'failed_ingest');
                });

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, status: 'ingesting' }));
            });
        },
        '/api/hayagriva/enhance-markdown': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    const file = data.file || data.filePath;
                    if (!file) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Missing file parameter' }));
                        return;
                    }
                    const caseName = data.case || '';
                    const caseDir = resolveCaseDir(docsRoot, caseName);
                    
                    const isWikiHtml = file.endsWith('.wiki.html');
                    const mdBaseName = path.basename(file).replace(/\.[a-zA-Z0-9]+$/, '.md');
                    const rootCompanionPath = path.join(path.dirname(file), mdBaseName);
                    const baseConversionsDir = getConversionsDir(caseDir);
                    const conversionsCompanionPath = path.join(baseConversionsDir, mdBaseName);
                    const subfolder = path.dirname(path.relative(caseDir, file));
                    const subConversionsPath = subfolder !== '.' ? path.join(baseConversionsDir, subfolder, mdBaseName) : conversionsCompanionPath;
                    const legacyConversionsPath = path.join(path.dirname(file), 'conversions', mdBaseName);
                    const companionPath = isWikiHtml
                        ? file
                        : (fs.existsSync(subConversionsPath) ? subConversionsPath : (fs.existsSync(conversionsCompanionPath) ? conversionsCompanionPath : (fs.existsSync(legacyConversionsPath) ? legacyConversionsPath : rootCompanionPath)));
                    
                    if (!fs.existsSync(companionPath)) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Companion markdown file not found. Please convert the file to Markdown first.' }));
                        return;
                    }

                    const originalContent = fs.readFileSync(companionPath, 'utf8');
                    
                    // Apply heuristic structuring
                    const lines = originalContent.split(/\r?\n/);
                    let inCodeBlock = false;
                    const enhancedLines = lines.map(line => {
                        let trimmed = line.trim();
                        if (trimmed.startsWith('```')) {
                            inCodeBlock = !inCodeBlock;
                            return line;
                        }
                        if (inCodeBlock) return line;

                        if (!trimmed) return line;

                        // Standardize existing headings: e.g. "##Heading##" -> "## Heading"
                        if (trimmed.startsWith('#')) {
                            let clean = trimmed.replace(/#+$/, '').trim();
                            const hashMatch = clean.match(/^(#+)(.*)$/);
                            if (hashMatch) {
                                const hashes = hashMatch[1];
                                const text = hashMatch[2].trim();
                                return `${hashes} ${text}`;
                            }
                        }

                        if (trimmed.startsWith('-') || (trimmed.startsWith('*') && !trimmed.startsWith('**')) || trimmed.startsWith('+')) return line;
                        if (trimmed.startsWith('>') || trimmed.startsWith('|')) return line;

                        // Heuristic 1: Bold wrapped line (e.g. "**Definitions**" or "**3(a) Reply...**")
                        const boldMatch = trimmed.match(/^\*\*(.*?)\*\*$/);
                        if (boldMatch) {
                            const cleanText = boldMatch[1].trim();
                            if (cleanText && cleanText.length < 80) {
                                return `### ${cleanText}`;
                            }
                        }

                        // Heuristic 2: Short capitalized line (e.g. "SECTION 1: APPOINTMENT")
                        const isAllCaps = trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed);
                        if (isAllCaps && trimmed.length > 3 && trimmed.length < 60) {
                            return `## ${trimmed}`;
                        }

                        // Heuristic 3: Numbered section prefix
                        const sectionPattern = /^(?:section\s+\d+|article\s+[ivxldcm]+|\b[ivxldcm]+\.|\d+\.\d*(?:\.\d*)*)\s+([A-Z].*)$/i;
                        if (sectionPattern.test(trimmed) && trimmed.length < 80) {
                            return `## ${trimmed}`;
                        }

                        return line;
                    });

                    const enhancedContent = enhancedLines.join('\n');
                    fs.writeFileSync(companionPath, enhancedContent, 'utf8');
                    console.log(`[API Server] Enhanced companion markdown structure: ${path.basename(companionPath)}`);

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true }));
                } catch (e) {
                    console.error('[API Server] Enhance Markdown failed:', e);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
        },

        '/api/hayagriva/ingest-to-ai': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                const data = JSON.parse(body);
                const file = data.file || data.filePath;
                if (!file) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Missing file parameter' }));
                    return;
                }
                const caseName = data.case || '';
                const caseDir = resolveCaseDir(docsRoot, caseName);
                ensureCaseSettings(caseDir);
                const relative = path.relative(caseDir, file);
                const isWikiHtml = (file.endsWith('.wiki.html') || file.endsWith('.html'));
                const ext = path.extname(file).toLowerCase();
                const basename = isWikiHtml 
                    ? (file.endsWith('.wiki.html') ? path.basename(file, '.wiki.html') : path.basename(file, '.html')) 
                    : path.basename(file, ext);
                const subfolder = path.dirname(relative);

                // Phase 1: Set status to ingesting
                updateStatus(caseDir, relative, 'ingesting');

                const conversionsPath = subfolder === '.' ?
                    path.join(getConversionsDir(caseDir), `${basename}.md`) :
                    path.join(getConversionsDir(caseDir), subfolder, `${basename}.md`);
                const rootPath = file.replace(/\.[a-zA-Z0-9]+$/, '.md');
                const companionPath = isWikiHtml ? file : (fs.existsSync(conversionsPath) ? conversionsPath : rootPath);

                ingestFile(caseDir, companionPath, { 
                    conversionOnly: false,
                    disableDoc2Query: true 
                }).then(result => {
                    if (result) {
                        console.log(`[API Server] Ingested context for: ${basename}.`);
                        updateStatus(caseDir, relative, 'indexed');

                        if (data.enrich !== false) {
                            console.log(`[API Server] Auto-starting AI enrichment for ${basename}...`);
                            const pageIndexTreePath = path.join(getConceptsDir(caseDir), subfolder, basename, 'pageindex_tree.json');
                            if (fs.existsSync(pageIndexTreePath)) {
                                let treeData;
                                try {
                                    treeData = JSON.parse(fs.readFileSync(pageIndexTreePath, 'utf8'));
                                    const sections = [];
                                    function collectSections(node) {
                                        if (node.metadata && node.metadata.type === 'section') {
                                            sections.push(node);
                                        }
                                        if (node.children) {
                                            node.children.forEach(collectSections);
                                        }
                                    }
                                    if (treeData.tree) {
                                        collectSections(treeData.tree);
                                    }

                                    // Phase 2: Set status to enriching & run AI pipeline
                                    updateStatus(caseDir, relative, 'enriching');
                                    queueForLazyProcessing(caseDir, basename, sections, relative);
                                } catch (e) {
                                    console.error(`[API Server] AI Enrichment auto-trigger failed for ${basename}:`, e.message);
                                    updateStatus(caseDir, relative, 'failed_enrich');
                                }
                            } else {
                                console.error(`[API Server] pageindex_tree.json not found for auto enrichment: ${pageIndexTreePath}`);
                                updateStatus(caseDir, relative, 'failed_enrich');
                            }
                        }
                    } else {
                        updateStatus(caseDir, relative, 'failed_ingest');
                    }
                }).catch(err => {
                    console.error(`[API Server] IngestToAi pipeline failed for ${basename}:`, err.message);
                    updateStatus(caseDir, relative, 'failed_ingest');
                });

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, status: 'ingesting' }));
            });
        },

        '/api/hayagriva/enrich-ai': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                const data = JSON.parse(body);
                const file = data.file || data.filePath;
                if (!file) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Missing file parameter' }));
                    return;
                }
                const caseName = data.case || '';
                const caseDir = resolveCaseDir(docsRoot, caseName);
                const relative = path.relative(caseDir, file);
                const isWikiHtml = file.endsWith('.wiki.html');
                const ext = isWikiHtml ? '.wiki.html' : path.extname(file).toLowerCase();
                const basename = isWikiHtml ? path.basename(file, '.wiki.html') : path.basename(file, ext);
                const subfolder = path.dirname(relative);

                const pageIndexTreePath = path.join(getConceptsDir(caseDir), subfolder, basename, 'pageindex_tree.json');
                if (fs.existsSync(pageIndexTreePath)) {
                    let treeData;
                    try {
                        treeData = JSON.parse(fs.readFileSync(pageIndexTreePath, 'utf8'));
                        const sections = [];
                        function collectSections(node) {
                            if (node.metadata && node.metadata.type === 'section') {
                                sections.push(node);
                            }
                            if (node.children) {
                                node.children.forEach(collectSections);
                            }
                        }
                        if (treeData.tree) {
                            collectSections(treeData.tree);
                        }

                        updateStatus(caseDir, relative, 'enriching');
                        queueForLazyProcessing(caseDir, basename, sections, relative);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, status: 'enriching' }));
                    } catch (e) {
                        console.error(`[API Server] AI Enrichment trigger failed for ${basename}:`, e.message);
                        updateStatus(caseDir, relative, 'failed_enrich');
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: e.message }));
                    }
                } else {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'pageindex_tree.json not found. Run vector generation first.' }));
                }
            });
        },

        '/api/hayagriva/mark-reviewed': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    const file = data.file || data.filePath;
                    if (!file) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Missing file parameter' }));
                        return;
                    }
                    const caseName = data.case || '';
                    const caseDir = resolveCaseDir(docsRoot, caseName);
                    const relative = path.relative(caseDir, file);
                    updateStatus(caseDir, relative, 'reviewed');

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, status: 'reviewed' }));
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
        },

        '/api/hayagriva/approve-outline': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    const file = data.file || data.filePath;
                    if (!file) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Missing file parameter' }));
                        return;
                    }
                    const caseName = data.case || '';
                    const caseDir = resolveCaseDir(docsRoot, caseName);
                    const relative = path.relative(caseDir, file);
                    updateStatus(caseDir, relative, 'outline_approved');

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, status: 'outline_approved' }));
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
        },

        '/api/hayagriva/enrich-with-ai': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                const data = JSON.parse(body);
                const file = data.file || data.filePath;
                if (!file) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Missing file parameter' }));
                    return;
                }
                const caseName = data.case || '';
                const caseDir = resolveCaseDir(docsRoot, caseName);
                const relative = path.relative(caseDir, file);
                const isWikiHtml = file.endsWith('.wiki.html');
                const ext = isWikiHtml ? '.wiki.html' : path.extname(file).toLowerCase();
                const basename = isWikiHtml ? path.basename(file, '.wiki.html') : path.basename(file, ext);
                const subfolder = path.dirname(relative);

                const pageIndexTreePath = path.join(getConceptsDir(caseDir), subfolder, basename, 'pageindex_tree.json');
                if (!fs.existsSync(pageIndexTreePath)) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'PageIndex tree not found. Ingest to context first.' }));
                    return;
                }

                let treeData;
                try {
                    treeData = JSON.parse(fs.readFileSync(pageIndexTreePath, 'utf8'));
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Failed to read PageIndex tree: ' + e.message }));
                    return;
                }

                // Read sections list from treeData
                const sections = [];
                function collectSections(node) {
                    if (node.metadata && node.metadata.type === 'section') {
                        sections.push(node);
                    }
                    if (node.children) {
                        node.children.forEach(collectSections);
                    }
                }
                if (treeData.tree) {
                    collectSections(treeData.tree);
                }

                updateStatus(caseDir, relative, 'enriching');

                // Queue to lazy worker
                queueForLazyProcessing(caseDir, basename, sections, relative);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, status: 'enriching' }));
            });
        },

        '/api/hayagriva/export-sc-docx': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body);
                    const file = data.file || data.filePath;
                    if (!file) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Missing file parameter' }));
                        return;
                    }
                    const caseName = data.case || '';
                    const caseDir = resolveCaseDir(docsRoot, caseName);
                    const absoluteFile = path.resolve(caseDir, file);
                    
                    if (!fs.existsSync(absoluteFile)) {
                        res.writeHead(404, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: `File not found: ${file}` }));
                        return;
                    }
                    
                    const docxPath = absoluteFile.replace(/\.md$/i, '_sc.docx');
                    const { exportMarkdownToDocxFile } = require('./core/docx-exporter');
                    await exportMarkdownToDocxFile(absoluteFile, docxPath);
                    
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, docxPath: path.relative(caseDir, docxPath) }));
                } catch (e) {
                    console.error('[API Server] Export to SC Docx failed:', e.message);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
        },

        '/api/hayagriva/export-pdf': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body);
                    const file = data.file || data.filePath;
                    if (!file) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Missing file parameter' }));
                        return;
                    }
                    const caseName = data.case || '';
                    const caseDir = resolveCaseDir(docsRoot, caseName);
                    const absoluteFile = path.resolve(caseDir, file);
                    
                    if (!fs.existsSync(absoluteFile)) {
                        res.writeHead(404, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: `File not found: ${file}` }));
                        return;
                    }
                    
                    const exportsDir = path.join(caseDir, 'exports');
                    if (!fs.existsSync(exportsDir)) {
                        fs.mkdirSync(exportsDir, { recursive: true });
                    }

                    const baseName = path.basename(absoluteFile, path.extname(absoluteFile));
                    const pdfExportPath = path.join(exportsDir, `${baseName}.pdf`);
                    const pdfLocalPath = absoluteFile.replace(/\.md$/i, '.pdf');

                    const { exportMarkdownToPdfFile } = require('./core/pdf-exporter');
                    await exportMarkdownToPdfFile(absoluteFile, pdfExportPath);
                    if (pdfLocalPath !== pdfExportPath) {
                        try {
                            fs.copyFileSync(pdfExportPath, pdfLocalPath);
                        } catch (_) {}
                    }
                    
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ 
                        success: true, 
                        pdfPath: path.relative(caseDir, pdfExportPath),
                        localPdfPath: path.relative(caseDir, pdfLocalPath),
                        absolutePdfPath: pdfExportPath
                    }));
                } catch (e) {
                    console.error('[API Server] Export to PDF failed:', e.message);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
        },

        '/api/forms/kv-dictionary/update': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                const data = JSON.parse(body);
                const caseDir = resolveCaseDir(docsRoot, data.case);
                const reviewsDir = path.join(caseDir, 'reviews');
                fs.mkdirSync(reviewsDir, { recursive: true });
                const dictPath = path.join(reviewsDir, 'case_kv_dictionary.json');
                fs.writeFileSync(dictPath, JSON.stringify(data.dictionary, null, 2), 'utf8');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            });
        },

        '/api/forms/populate': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                const data = JSON.parse(body);
                const caseDir = resolveCaseDir(docsRoot, data.case);
                const { populateFormInstance } = require('./pipeline/forms/mapper');
                const fields = await populateFormInstance(caseDir, data.formId);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, fields }));
            });
        },

        '/api/forms/instance/save': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                const data = JSON.parse(body);
                const caseDir = resolveCaseDir(docsRoot, data.case);
                const workspaceRoot = path.join(__dirname, '..');
                const schemaPath = path.join(__dirname, '../..', 'forms', data.formId, 'schema.json');
                const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
                
                const flatData = {};
                for (const k in data.fields) {
                    flatData[k] = data.fields[k].value;
                }
                
                const { validateFormRules } = require('./pipeline/forms/rules_validator');
                const failures = validateFormRules(flatData, schema.rules || []);
                
                for (const key in data.fields) {
                    delete data.fields[key].validationError;
                }
                for (const fail of failures) {
                    for (const fieldKey of fail.affectedFields || []) {
                        if (data.fields[fieldKey]) {
                            data.fields[fieldKey].validationError = fail.message;
                        }
                    }
                }

                const instancePath = path.join(caseDir, 'reviews', `filled-${data.formId}.json`);
                fs.writeFileSync(instancePath, JSON.stringify(data.fields, null, 2), 'utf8');
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, fields: data.fields, validationErrors: failures }));
            });
        },

        '/api/forms/instance/export': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                const data = JSON.parse(body);
                const caseDir = resolveCaseDir(docsRoot, data.case);
                const instancePath = path.join(caseDir, 'reviews', `filled-${data.formId}.json`);
                const fields = JSON.parse(fs.readFileSync(instancePath, 'utf8'));
                
                const { exportFormInstance } = require('./pipeline/forms/exporter');
                const result = await exportFormInstance(caseDir, data.formId, fields);
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    filledHtmlPath: result.filledHtmlPath,
                    filledHtmlName: result.filledHtmlName,
                    bookmarkletCode: result.bookmarkletCode
                }));
            });
        },

        '/api/formats/draft': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                const data = JSON.parse(body);
                const caseDir = resolveCaseDir(docsRoot, data.case);
                const { draftDocument } = require('./core/drafting');
                const result = await draftDocument(caseDir, data.formatId);
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    draftPath: result.draftPath,
                    draftName: result.draftName,
                    version: result.version,
                    placeholders: result.placeholders
                }));
            });
        },

        '/api/agents/chat': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body);
                    const caseDir = resolveCaseDir(docsRoot, data.case);
                    
                    // ── LITE MODE GATE ──────────────────────────────────────────
                    const { loadLlmConfig } = require('./core/llm-client');
                    const config = loadLlmConfig({ caseDir });
                    if (config.activeMode === 'lite' && !data.agent) {
                        const { query } = require('./core/rag');
                        const result = await query(caseDir, data.message, { caseDir });
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, response: result.answer, liteMode: true, sources: result.sources }));
                        return;
                    }
                    // ───────────────────────────────────────────────────────────

                    const coordinator = require('./agents/agent-coordinator');
                    const agentLogger = require('./agents/agent-logger');

                    const { response: responseText, logs } = await coordinator.run(caseDir, data.message, data.history || [], data.agent, { returnObject: true, mode: data.mode });
                    const accordionHtml = agentLogger.formatMarkdownAccordion(logs);
                    const finalResponse = (accordionHtml && !(responseText || '').startsWith('<details>')) 
                        ? accordionHtml + responseText 
                        : responseText;
                    
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, response: finalResponse, logs: logs || [] }));
                } catch (err) {
                    console.error('[API Server] Agent chat handler failed:', err.message);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: err.message }));
                }
            });
        },

        '/api/agents/tools/execute': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body);
                    const caseDir = resolveCaseDir(docsRoot, data.case || '');
                    const { executeTool } = require('./agents/skills/tool-dispatcher');
                    const sessionContext = {
                        mode: data.mode || 'auto',
                        allowExternal: Boolean(data.allowExternal),
                        acknowledgedRisk: Boolean(data.acknowledgedRisk),
                        metadata: data.metadata || null
                    };
                    const result = await executeTool(caseDir, data.tool, data.args || {}, sessionContext);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, result }));
                } catch (err) {
                    console.error('[API Server] Tool execute failed:', err.message);
                    const statusCode = err.code === 'ERR_PERMISSION_REQUIRED' ? 403 : (err.code === 'ERR_PERMISSION_DENIED' || err.code === 'ERR_PATH_TRAVERSAL' ? 400 : 500);
                    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: false,
                        error: err.message,
                        code: err.code || 'ERR_TOOL_EXECUTION',
                        needsApproval: Boolean(err.needsApproval),
                        riskClass: err.riskClass || null
                    }));
                }
            });
        },

        '/api/agents/artifacts': (req, res, parsedUrl, docsRoot) => {
            const caseParam = parsedUrl.query.case || '';
            const caseDir = resolveCaseDir(docsRoot, caseParam);
            const { listArtifacts, saveArtifact } = require('./agents/skills/artifact-manager');

            if (req.method === 'GET') {
                try {
                    const artifacts = listArtifacts(caseDir);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, artifacts }));
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: e.message }));
                }
            } else if (req.method === 'POST') {
                let body = '';
                req.on('data', chunk => body += chunk);
                req.on('end', () => {
                    try {
                        const data = JSON.parse(body);
                        const targetCaseDir = resolveCaseDir(docsRoot, data.case || caseParam);
                        const result = saveArtifact(targetCaseDir, data);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, result }));
                    } catch (e) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, error: e.message }));
                    }
                });
            }
        },

        '/api/hayagriva/inbox': (req, res, parsedUrl, docsRoot) => {
            const caseParam = parsedUrl.query.case || '';
            const caseDir = resolveCaseDir(docsRoot, caseParam);
            const inboxManager = require('./agents/inbox-manager');

            if (req.method === 'GET') {
                try {
                    const filters = {
                        state: parsedUrl.query.state || undefined,
                        kind: parsedUrl.query.kind || undefined
                    };
                    const result = inboxManager.listItems(caseDir, filters);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, ...result }));
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: e.message }));
                }
            } else if (req.method === 'POST') {
                let body = '';
                req.on('data', chunk => body += chunk);
                req.on('end', () => {
                    try {
                        const data = JSON.parse(body);
                        const targetCaseDir = resolveCaseDir(docsRoot, data.case || caseParam);
                        const item = inboxManager.createItem(targetCaseDir, data);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, item }));
                    } catch (e) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, error: e.message }));
                    }
                });
            }
        },

        '/api/hayagriva/inbox/resolve': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    const caseParam = data.case || parsedUrl.query.case || '';
                    const caseDir = resolveCaseDir(docsRoot, caseParam);
                    const inboxManager = require('./agents/inbox-manager');
                    const result = inboxManager.resolveItem(caseDir, data.itemId, data.resolution, data.resolvedBy);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, ...result }));
                } catch (e) {
                    const status = e.code === 'ERR_INBOX_ITEM_NOT_FOUND' ? 404 : 500;
                    res.writeHead(status, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: e.message }));
                }
            });
        },

        '/api/hayagriva/wakes': (req, res, parsedUrl, docsRoot) => {
            const caseParam = parsedUrl.query.case || '';
            const caseDir = resolveCaseDir(docsRoot, caseParam);
            const wakeScheduler = require('./daemon/wake-scheduler');

            try {
                const store = wakeScheduler.loadWakes(caseDir);
                const dueWakes = wakeScheduler.getDueWakes(caseDir);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    wakes: store.wakes,
                    dueCount: dueWakes.length,
                    pendingCount: store.wakes.filter(w => w.state === 'pending').length
                }));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: e.message }));
            }
        },

        '/api/hayagriva/wakes/schedule-cirp': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    const caseParam = data.case || parsedUrl.query.case || '';
                    const caseDir = resolveCaseDir(docsRoot, caseParam);
                    const wakeScheduler = require('./daemon/wake-scheduler');
                    const milestones = wakeScheduler.scheduleCirpMilestones(caseDir, data.admissionDate);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, scheduledCount: milestones.length, milestones }));
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: e.message }));
                }
            });
        },

        '/api/hayagriva/wakes/fire': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    const caseParam = data.case || parsedUrl.query.case || '';
                    const caseDir = resolveCaseDir(docsRoot, caseParam);
                    const wakeScheduler = require('./daemon/wake-scheduler');
                    const firedWake = wakeScheduler.fireWake(caseDir, data.wakeId);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, wake: firedWake }));
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: e.message }));
                }
            });
        },

        '/api/lsp/completions': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body);
                    const caseDir = resolveCaseDir(docsRoot, data.case || '');
                    const { getCompletions } = require('./core/lsp-service');
                    const result = await getCompletions(caseDir, data.docUri, data.docContent, data.position);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, items: result }));
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
        },

        '/api/lsp/hover': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body);
                    const caseDir = resolveCaseDir(docsRoot, data.case || '');
                    const { getHover } = require('./core/lsp-service');
                    const result = await getHover(caseDir, data.docUri, data.docContent, data.position);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, hover: result }));
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
        },

        '/api/lsp/diagnostics': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body);
                    const caseDir = resolveCaseDir(docsRoot, data.case || '');
                    const { getDiagnostics } = require('./core/lsp-service');
                    const result = await getDiagnostics(caseDir, data.docUri, data.docContent);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, diagnostics: result }));
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
        },

        '/api/hayagriva/lint-draft': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    const data = JSON.parse(body || '{}');
                    const text = data.text || '';
                    const { lintDraft } = require('./core/statutory-linter');
                    const result = lintDraft(text, data.options || {});
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, ...result }));
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: e.message }));
                }
            });
        },

        '/api/hayagriva/upload': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    const caseDir = resolveCaseDir(docsRoot, data.case);

                    if (!fs.existsSync(caseDir)) {
                        fs.mkdirSync(caseDir, { recursive: true });
                    }
                    getConceptsDir(caseDir);
                    ensureCaseSettings(caseDir);
                    const filePath = path.join(caseDir, data.filename);
                    const buffer = Buffer.from(data.content, 'base64');
                    fs.writeFileSync(filePath, buffer);
                    console.log(`[API Server] Uploaded file saved to: ${filePath}`);

                    // Dynamically ensure directory is watched
                    const { ensureCaseWatcher, ingestFile, updateStatus } = require('./daemon/watcher');
                    ensureCaseWatcher(caseDir);

                    // Automatically trigger Phase 1 Markdown conversion on upload
                    const ext = path.extname(filePath).toLowerCase();
                    const BINARY_EXTS = ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.csv', '.pptx'];
                    if (BINARY_EXTS.includes(ext) || filePath.toLowerCase().endsWith('.wiki.html')) {
                        const relative = path.relative(caseDir, filePath).replace(/\\/g, '/');
                        updateStatus(caseDir, relative, 'processing');
                        ingestFile(caseDir, filePath, { conversionOnly: true }).catch(err => {
                            console.error('[Upload Auto-Convert] Failed:', err.message);
                        });
                    }

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, filePath }));
                } catch (err) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: err.message }));
                }
            });
        },

        // ─── Marketplace: Catalog ──────────────────────────────────────────────
        // Returns the full catalog of agent packs, vault packs, and LLM engines
        // with their installation status ('installed' | 'downloading' | 'available' | 'locked').
        '/api/hayagriva/marketplace/catalog': (req, res, parsedUrl, docsRoot) => {
            try {
                const vaultPacksDir = path.join(__dirname, '..', '..', 'vault', 'agent_packs');
                const dataVaultsDir = path.join(__dirname, '..', '..', 'vault', 'data_vaults');
                const modelsDir = path.join(__dirname, '..', '..', 'models', 'llm');
                const { getCatalogStatus } = require('./pipeline/vault-importer');
                const catalogStatus = getCatalogStatus();

                // Discover installed agent packs from filesystem
                const installedPacks = fs.existsSync(vaultPacksDir)
                    ? fs.readdirSync(vaultPacksDir).filter(d =>
                        d.endsWith('.vlt') && fs.statSync(path.join(vaultPacksDir, d)).isDirectory()
                      )
                    : [];

                // Discover installed LLM models from filesystem
                const installedModels = fs.existsSync(modelsDir)
                    ? fs.readdirSync(modelsDir, { recursive: true })
                        .filter(f => typeof f === 'string' && f.endsWith('.gguf'))
                        .map(f => path.basename(f).toLowerCase())
                    : [];

                const getStatus = (itemId, isInstalled) => {
                    const statusObj = catalogStatus[itemId];
                    if (statusObj && statusObj.status !== 'available') return statusObj.status;
                    return isInstalled ? 'installed' : 'available';
                };

                const catalog = {
                    agentPacks: [
                        {
                            id: 'legal_agents.vlt',
                            name: 'Legal Agents',
                            description: '19 subagents — @advisor, @avoidance, @nclt, @claims, and more.',
                            tier: 'starter',
                            status: getStatus('legal_agents.vlt', installedPacks.includes('legal_agents.vlt')),
                            progressPct: catalogStatus['legal_agents.vlt']?.progressPct || 0
                        },
                        {
                            id: 'finance_agents.vlt',
                            name: 'Finance Agents',
                            description: '2 subagents — @forensic, @tax for financial analysis.',
                            tier: 'starter',
                            status: getStatus('finance_agents.vlt', installedPacks.includes('finance_agents.vlt')),
                            progressPct: catalogStatus['finance_agents.vlt']?.progressPct || 0
                        },
                        {
                            id: 'coding_agents.vlt',
                            name: 'Coding Agents',
                            description: '4 subagents — @architecture, @debugger, @codewriter.',
                            tier: 'starter',
                            status: getStatus('coding_agents.vlt', installedPacks.includes('coding_agents.vlt')),
                            progressPct: catalogStatus['coding_agents.vlt']?.progressPct || 0
                        }
                    ],
                    dataVaults: [
                        {
                            id: 'laws_vault',
                            name: 'Laws & Acts Vault',
                            description: 'Comprehensive Indian statutory acts and rules database.',
                            sizeMb: 33.6,
                            status: getStatus('laws_vault', fs.existsSync(path.join(dataVaultsDir, 'laws'))),
                            progressPct: catalogStatus['laws_vault']?.progressPct || 0
                        },
                        {
                            id: 'cases_vault',
                            name: 'Judgments & Case Law Vault',
                            description: 'Supreme Court & NCLAT landmark case precedent indices.',
                            sizeMb: 132.8,
                            status: getStatus('cases_vault', fs.existsSync(path.join(dataVaultsDir, 'cases'))),
                            progressPct: catalogStatus['cases_vault']?.progressPct || 0
                        },
                        {
                            id: 'documents_vault',
                            name: 'Legal Templates Vault',
                            description: 'Standard pleadings, notices, agreements, and forms.',
                            sizeMb: 28.7,
                            status: getStatus('documents_vault', fs.existsSync(path.join(dataVaultsDir, 'documents'))),
                            progressPct: catalogStatus['documents_vault']?.progressPct || 0
                        }
                    ],
                    llmEngines: [
                        {
                            id: 'legalparam-2.9b',
                            name: 'LegalParam 2.9B',
                            description: 'Bundled starter LLM — Indian legal domain, 2K context.',
                            tier: 'starter',
                            sizeGb: 1.7,
                            context: '2K tokens',
                            status: getStatus('legalparam-2.9b', installedModels.some(m => m.includes('legalparam'))),
                            progressPct: catalogStatus['legalparam-2.9b']?.progressPct || 0
                        },
                        {
                            id: 'financeparam-2.9b',
                            name: 'FinanceParam 2.9B',
                            description: 'Bundled starter LLM — Indian financial domain, 2K context.',
                            tier: 'starter',
                            sizeGb: 1.7,
                            context: '2K tokens',
                            status: getStatus('financeparam-2.9b', installedModels.some(m => m.includes('financeparam'))),
                            progressPct: catalogStatus['financeparam-2.9b']?.progressPct || 0
                        },
                        {
                            id: 'saullm-7b',
                            name: 'SaulLM 7B Instruct',
                            badge: 'PRO — Available',
                            description: 'Specialized 7B Legal LLM pre-trained on 30B+ legal tokens. 2K context.',
                            tier: 'professional',
                            sizeGb: 4.37,
                            context: '2K tokens',
                            status: getStatus('saullm-7b', installedModels.some(m => m.toLowerCase().includes('saul'))),
                            progressPct: catalogStatus['saullm-7b']?.progressPct || 0
                        },
                        {
                            id: 'hayaparam-7b',
                            name: 'HayaParam 7B',
                            badge: 'PRO — Coming Soon',
                            description: 'Fine-tuned on Indian legal + financial corpus. 24K context.',
                            tier: 'professional',
                            sizeGb: 4.7,
                            context: '24K tokens',
                            status: 'locked'
                        },
                        {
                            id: 'hayaparam-14b',
                            name: 'HayaParam 14B',
                            badge: 'ENTERPRISE — Coming Soon',
                            description: 'Full document analysis — 64K context for complete resolution plans.',
                            tier: 'enterprise',
                            sizeGb: 8.5,
                            context: '64K tokens',
                            status: 'locked'
                        }
                    ]
                };

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(catalog, null, 2));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: e.message }));
            }
        },

        // ─── Marketplace: 1-Click R2 Download & Install ───────────────────────
        '/api/hayagriva/marketplace/download': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const { itemId } = JSON.parse(body || '{}');
                    if (!itemId) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Missing required field "itemId"' }));
                        return;
                    }

                    const { downloadAndInstall } = require('./pipeline/vault-importer');
                    const result = await downloadAndInstall(itemId);

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
        },

        // ─── Marketplace: Local Offline Import ────────────────────────────────
        '/api/hayagriva/marketplace/import-local': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    const { sourcePath, itemId } = JSON.parse(body || '{}');
                    if (!sourcePath) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: 'Missing required field "sourcePath"' }));
                        return;
                    }

                    const { installFromLocalPath } = require('./pipeline/vault-importer');
                    const result = installFromLocalPath(sourcePath, itemId);

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
        },

        // ─── Marketplace & Suites Catalog ──────────────────────────────────────
        '/api/hayagriva/marketplace/suites-metadata': (req, res, parsedUrl, docsRoot) => {
            try {
                const { getSuitesCatalog } = require('./core/suites-catalog');
                const catalog = getSuitesCatalog();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, ...catalog }));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: e.message }));
            }
        },

        // ─── Model Downloader & Status ─────────────────────────────────────────
        '/api/hayagriva/models/check': (req, res, parsedUrl, docsRoot) => {
            try {
                const modelDownloader = require('./core/model-downloader');
                const status = modelDownloader.checkModelsStatus();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, ...status }));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: e.message }));
            }
        },

        '/api/hayagriva/models/download': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    const data = JSON.parse(body || '{}');
                    const domain = data.domain || 'legal';
                    const customUrl = data.url || null;
                    const modelDownloader = require('./core/model-downloader');
                    const result = modelDownloader.startDownload(domain, customUrl);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: e.message }));
                }
            });
        },

        '/api/hayagriva/models/download-status': (req, res, parsedUrl, docsRoot) => {
            try {
                const domain = parsedUrl.query.domain || null;
                const modelDownloader = require('./core/model-downloader');
                const status = modelDownloader.getStatus(domain);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, status }));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: e.message }));
            }
        },

        '/api/hayagriva/models/download-cancel': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    const data = JSON.parse(body || '{}');
                    const domain = data.domain || 'legal';
                    const modelDownloader = require('./core/model-downloader');
                    const result = modelDownloader.cancelDownload(domain);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: e.message }));
                }
            });
        },

        // ─── Marketplace: License Activation (GET Callback & POST) ────────────
        '/api/hayagriva/license/activate': (req, res, parsedUrl, docsRoot) => {
            const handleActivation = (licenseKey, caseName, isHtmlPreferred) => {
                const caseDir = resolveCaseDir(docsRoot, caseName || '');
                const { activateLicense } = require('./core/license-manager');
                const { writeLicenseToSettings } = require('./utils/license-validator');

                const result = activateLicense(licenseKey, caseDir);
                if (!result.success) {
                    if (isHtmlPreferred) {
                        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
                        res.end(`
                            <!DOCTYPE html>
                            <html>
                            <head><title>Activation Failed</title><style>body { font-family: sans-serif; background: #0f172a; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; } .card { background: #1e293b; padding: 30px; border-radius: 12px; border: 1px solid #ef4444; max-width: 450px; text-align: center; } h2 { color: #ef4444; margin-top: 0; } button { background: #38bdf8; border: none; padding: 10px 20px; color: #000; border-radius: 6px; cursor: pointer; font-weight: bold; margin-top: 15px; }</style></head>
                            <body>
                              <div class="card">
                                <h2>❌ License Activation Failed</h2>
                                <p>${result.error || 'The provided license token is invalid or corrupted.'}</p>
                                <button onclick="window.close()">Close Window</button>
                              </div>
                            </body>
                            </html>
                        `);
                    } else {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, error: result.error }));
                    }
                    return;
                }

                if (caseDir && fs.existsSync(caseDir)) {
                    writeLicenseToSettings(caseDir, result.tier, {
                        sub: result.licensee,
                        expiresAt: result.valid_until,
                        allowed_packs: result.allowed_packs
                    });
                }

                if (isHtmlPreferred) {
                    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                    res.end(`
                        <!DOCTYPE html>
                        <html>
                        <head><title>License Activated</title><style>body { font-family: sans-serif; background: #0f172a; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; } .card { background: #1e293b; padding: 36px; border-radius: 14px; border: 1px solid #10b981; max-width: 500px; text-align: center; box-shadow: 0 10px 25px rgba(0,0,0,0.5); } h2 { color: #10b981; margin-top: 0; } .badge { display: inline-block; background: rgba(16,185,129,0.15); color: #10b981; padding: 4px 10px; border-radius: 6px; font-weight: bold; font-size: 13px; margin: 4px; } .sub { color: #94a3b8; font-size: 14px; margin-bottom: 20px; } button { background: #38bdf8; border: none; padding: 12px 24px; color: #0f172a; border-radius: 8px; cursor: pointer; font-weight: bold; font-size: 14px; margin-top: 15px; }</style></head>
                        <body>
                          <div class="card">
                            <h2>✨ License Activated Successfully!</h2>
                            <p class="sub">Welcome, <strong>${result.licensee}</strong>. Your Hayagriva IDE is now unlocked.</p>
                            <div style="margin-bottom: 20px;">
                              <div>Tier: <span class="badge">${result.tier.toUpperCase()}</span></div>
                              <div style="margin-top: 8px;">Active Suites:</div>
                              <div>
                                ${(result.allowed_packs || []).map(p => `<span class="badge">✓ ${p}</span>`).join(' ') || '<span class="badge">All Suites</span>'}
                              </div>
                            </div>
                            <p style="font-size: 13px; color: #94a3b8;">You can now close this browser window and return to Hayagriva IDE.</p>
                            <button onclick="window.close()">Return to Hayagriva IDE</button>
                          </div>
                          <script>
                            setTimeout(() => { try { window.close(); } catch(e){} }, 4000);
                          </script>
                        </body>
                        </html>
                    `);
                } else {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: true,
                        tier: result.tier,
                        licensedTo: result.licensee,
                        allowed_packs: result.allowed_packs,
                        expiresAt: result.valid_until
                    }));
                }
            };

            if (req.method === 'GET') {
                const token = parsedUrl.query.token || parsedUrl.query.licenseKey;
                const caseName = parsedUrl.query.case || '';
                const accepts = req.headers['accept'] || '';
                const isHtmlPreferred = accepts.includes('text/html');
                if (!token) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Missing token in query parameter' }));
                    return;
                }
                handleActivation(token, caseName, isHtmlPreferred);
            } else {
                let body = '';
                req.on('data', chunk => body += chunk);
                req.on('end', () => {
                    try {
                        const { licenseKey, token, case: caseName } = JSON.parse(body || '{}');
                        handleActivation(licenseKey || token, caseName, false);
                    } catch (e) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: e.message }));
                    }
                });
            }
        },

        '/api/hayagriva/license/reanchor': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', () => {
                try {
                    const { serverUtcTimestamp } = JSON.parse(body || '{}');
                    const { reanchorFromNetwork } = require('./core/license-manager');
                    const result = reanchorFromNetwork(serverUtcTimestamp || Date.now());
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, result }));
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
        },

        // ─── LlamaParse: Scanned PDF Cloud OCR ──────────────────────────────
        '/api/hayagriva/llamaparse/parse': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body || '{}');
                    const caseName = data.case || '';
                    const caseDir = resolveCaseDir(docsRoot, caseName);
                    const file = data.file || data.filename;

                    if (!caseDir || !fs.existsSync(caseDir)) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, error: 'Invalid or missing case directory' }));
                        return;
                    }

                    if (!file) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, error: 'Missing required field "file"' }));
                        return;
                    }

                    const fullFilePath = path.isAbsolute(file) ? file : path.join(caseDir, file);
                    const relative = path.relative(caseDir, fullFilePath);
                    const ext = path.extname(fullFilePath);
                    const cleanBase = path.basename(fullFilePath, ext);

                    if (!fs.existsSync(fullFilePath)) {
                        res.writeHead(404, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, error: `File not found: ${fullFilePath}` }));
                        return;
                    }

                    // Load API key & tier from settings
                    const settingsPath = path.join(caseDir, 'hayagriva_settings.json');
                    let settings = { ...DEFAULT_SETTINGS };
                    if (fs.existsSync(settingsPath)) {
                        try {
                            const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
                            settings = { ...settings, ...saved };
                        } catch (_) {}
                    }

                    const apiKey = data.apiKey || settings.llamaCloudApiKey || process.env.LLAMA_CLOUD_API_KEY || DEFAULT_SETTINGS.llamaCloudApiKey;
                    const tier = data.tier || settings.llamaCloudTier || 'agentic';

                    // Update status to 'converting' (Dot 1 turns blue)
                    updateStatus(caseDir, relative, 'converting');

                    const { parsePdfWithLlamaParse } = require('./pipeline/pdf/llamaparse-client');

                    try {
                        const result = await parsePdfWithLlamaParse(fullFilePath, { apiKey, tier });

                        const conversionsDir = getConversionsDir(caseDir);
                        const subfolder = path.dirname(relative);
                        const destConversionsDir = subfolder === '.' ?
                            conversionsDir :
                            path.join(conversionsDir, subfolder);
                        fs.mkdirSync(destConversionsDir, { recursive: true });
                        const companionPath = path.join(destConversionsDir, `${cleanBase}.md`);
                        const rootCompanionPath = subfolder === '.' ?
                            path.join(caseDir, `${cleanBase}.md`) :
                            path.join(caseDir, subfolder, `${cleanBase}.md`);

                        // Clean up stale concept folders and vector records if re-parsing an existing file
                        try {
                            const conceptsRoot = getConceptsDir(caseDir);
                            const conceptsDir = subfolder === '.' ?
                                path.join(conceptsRoot, cleanBase) :
                                path.join(conceptsRoot, subfolder, cleanBase);
                            if (fs.existsSync(conceptsDir)) {
                                fs.rmSync(conceptsDir, { recursive: true, force: true });
                                console.log(`[LlamaParse] Cleaned up stale concepts folder: ${conceptsDir}`);
                            }
                        } catch (_) {}

                        try {
                            const { getDb } = require('./core/sqlite-store');
                            const db = getDb(caseDir);
                            db.prepare('DELETE FROM document_vectors WHERE filename = ?').run(relative);
                            db.prepare('DELETE FROM document_sections WHERE filename = ?').run(relative);
                        } catch (_) {}

                        // Write Markdown companion directly to conversions directory
                        fs.writeFileSync(companionPath, result.markdown, 'utf8');

                        // Clean up duplicate companion in root if it exists
                        if (fs.existsSync(rootCompanionPath) && path.resolve(rootCompanionPath) !== path.resolve(companionPath)) {
                            try { fs.unlinkSync(rootCompanionPath); } catch (_) {}
                        }

                        // Clear .error sidecar if present
                        const errorPath = subfolder === '.' ?
                            path.join(conversionsDir, `${cleanBase}.error`) :
                            path.join(conversionsDir, subfolder, `${cleanBase}.error`);
                        if (fs.existsSync(errorPath)) {
                            try { fs.unlinkSync(errorPath); } catch (_) {}
                        }

                        // Advance status to companion_ready (Dot 1 turns green, Dots 2/3 ready for fresh indexing)
                        updateStatus(caseDir, relative, 'companion_ready');

                        console.log(`[LlamaParse] Successfully generated companion ${companionPath} (${result.totalPages} pages)`);

                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            success: true,
                            message: `LlamaParse OCR complete (${result.totalPages} pages extracted)`,
                            companionPath: path.relative(caseDir, companionPath),
                            totalPages: result.totalPages
                        }));
                    } catch (parseErr) {
                        console.error(`[LlamaParse] Parsing failed for ${relative}:`, parseErr.message);
                        updateStatus(caseDir, relative, 'failed_convert', parseErr.message);
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, error: parseErr.message }));
                    }
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: e.message }));
                }
            });
        },

        // ─── LlamaParse: Connection Test ────────────────────────────────────
        '/api/hayagriva/llamaparse/test': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body || '{}');
                    const apiKey = data.apiKey || process.env.LLAMA_CLOUD_API_KEY || DEFAULT_SETTINGS.llamaCloudApiKey;
                    const { testLlamaParseConnection } = require('./pipeline/pdf/llamaparse-client');
                    const result = await testLlamaParseConnection(apiKey);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: e.message }));
                }
            });
        },

        // ─── LightRAG Precedents: Connection & Health Test ────────────────────
        '/api/hayagriva/lightrag/test': (req, res, parsedUrl, docsRoot) => {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body || '{}');
                    const lightRagClient = require('./core/lightrag-client');
                    if (data.apiUrl) lightRagClient.config.apiUrl = data.apiUrl.replace(/\/+$/, '');
                    if (data.apiKey) lightRagClient.config.apiKey = data.apiKey;
                    
                    const health = await lightRagClient.checkHealth(4000);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(health));
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ online: false, error: e.message }));
                }
            });
        }
    }
};
