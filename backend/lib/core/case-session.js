'use strict';

/**
 * Mechanical Working-State Tracker for Case Compaction (Plan 14).
 * Adapted from Andrew Ng's OpenWorker architecture (coworker/session.py & compaction.py).
 * 
 * Maintains a lightweight, non-LLM `reviews/case_session.json` tracking:
 * - documents_indexed: files parsed/indexed (filename, path, pages, indexed_at)
 * - kv_keys_written: verified / extracted case facts (key, value, verified_by_user, updated_at)
 * - wiki_pages_modified: chamber wiki pages created or edited (slug, title, updated_at)
 * - drafts_modified: legal templates drafted or exported (filename, template_id, updated_at)
 * - active_focus: current intake/examination emphasis (e.g. 'waterfall', 's29a', 'general')
 * - turn_count: total conversation / agent interaction turns
 * - last_active_at: ISO timestamp of most recent activity
 * 
 * Invariants:
 * 1. Zero Hallucination: 100% mechanical tracking from code events, no LLM inference.
 * 2. Immutable persistence: atomic write to reviews/case_session.json.
 * 3. Compaction Grounding: formatted markdown block injected into compaction divider.
 */

const fs = require('fs');
const path = require('path');

const SESSION_FILENAME = 'case_session.json';

/**
 * Resolves path to reviews/case_session.json, ensuring reviews/ directory exists.
 * 
 * @param {string} caseDir 
 * @returns {string} Absolute path to session file
 */
function getSessionFilePath(caseDir) {
    if (!caseDir || typeof caseDir !== 'string') return null;
    const reviewsDir = path.join(caseDir, 'reviews');
    if (!fs.existsSync(reviewsDir)) {
        try {
            fs.mkdirSync(reviewsDir, { recursive: true });
        } catch (err) {
            console.warn(`[Case Session] Could not create reviews dir in ${caseDir}:`, err.message);
            return path.join(caseDir, SESSION_FILENAME);
        }
    }
    return path.join(reviewsDir, SESSION_FILENAME);
}

/**
 * Default empty session object.
 * 
 * @param {string} caseDir 
 * @returns {Object}
 */
function createDefaultSession(caseDir) {
    const now = new Date().toISOString();
    return {
        version: 1,
        case_dir: caseDir || '',
        matter_name: caseDir ? path.basename(caseDir) : '',
        created_at: now,
        last_active_at: now,
        turn_count: 0,
        active_focus: 'general',
        documents_indexed: {},
        kv_keys_written: {},
        wiki_pages_modified: {},
        drafts_modified: {}
    };
}

/**
 * Loads current case session from disk or creates default.
 * 
 * @param {string} caseDir 
 * @returns {Object}
 */
function loadCaseSession(caseDir) {
    const filePath = getSessionFilePath(caseDir);
    if (!filePath || !fs.existsSync(filePath)) {
        return createDefaultSession(caseDir);
    }
    try {
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') {
            return createDefaultSession(caseDir);
        }
        // Normalize fields
        parsed.documents_indexed = parsed.documents_indexed || {};
        parsed.kv_keys_written = parsed.kv_keys_written || {};
        parsed.wiki_pages_modified = parsed.wiki_pages_modified || {};
        parsed.drafts_modified = parsed.drafts_modified || {};
        parsed.turn_count = typeof parsed.turn_count === 'number' ? parsed.turn_count : 0;
        parsed.active_focus = parsed.active_focus || 'general';
        return parsed;
    } catch (err) {
        console.warn(`[Case Session] Failed to parse ${filePath}, returning default:`, err.message);
        return createDefaultSession(caseDir);
    }
}

/**
 * Persists session object to disk atomically via temp file.
 * 
 * @param {string} caseDir 
 * @param {Object} session 
 * @returns {boolean}
 */
function saveCaseSession(caseDir, session) {
    const filePath = getSessionFilePath(caseDir);
    if (!filePath) return false;
    try {
        session.last_active_at = new Date().toISOString();
        const serialized = JSON.stringify(session, null, 2);
        const tempPath = `${filePath}.${Date.now()}.${Math.random().toString(36).substring(2, 7)}.tmp`;
        fs.writeFileSync(tempPath, serialized, 'utf8');
        fs.renameSync(tempPath, filePath);
        return true;
    } catch (err) {
        console.error(`[Case Session] Atomic save failed for ${filePath}:`, err.message);
        return false;
    }
}

/**
 * Records that a document was indexed.
 * 
 * @param {string} caseDir 
 * @param {Object} docInfo { filename, pages, textDensity, status }
 */
function recordDocumentIndexed(caseDir, docInfo = {}) {
    if (!caseDir || !docInfo.filename) return null;
    const session = loadCaseSession(caseDir);
    const key = String(docInfo.filename);
    session.documents_indexed[key] = {
        filename: key,
        pages: typeof docInfo.pages === 'number' ? docInfo.pages : 1,
        text_density: typeof docInfo.textDensity === 'number' ? docInfo.textDensity : null,
        status: docInfo.status || 'indexed',
        indexed_at: new Date().toISOString()
    };
    saveCaseSession(caseDir, session);
    return session;
}

/**
 * Records that a factual KV key was extracted or verified.
 * 
 * @param {string} caseDir 
 * @param {Object} kvInfo { key, value, verified_by_user, source }
 */
function recordKVKeyWritten(caseDir, kvInfo = {}) {
    if (!caseDir || !kvInfo.key) return null;
    const session = loadCaseSession(caseDir);
    const key = String(kvInfo.key);
    session.kv_keys_written[key] = {
        key,
        value: kvInfo.value !== undefined ? String(kvInfo.value) : '',
        verified_by_user: kvInfo.verified_by_user === 1 || kvInfo.verified_by_user === true ? 1 : 0,
        source: kvInfo.source || 'agent',
        updated_at: new Date().toISOString()
    };
    saveCaseSession(caseDir, session);
    return session;
}

/**
 * Records that a chamber wiki page was created or modified.
 * 
 * @param {string} caseDir 
 * @param {Object} pageInfo { slug, title, action }
 */
function recordWikiPageModified(caseDir, pageInfo = {}) {
    if (!caseDir || !pageInfo.slug) return null;
    const session = loadCaseSession(caseDir);
    const slug = String(pageInfo.slug);
    session.wiki_pages_modified[slug] = {
        slug,
        title: pageInfo.title || slug,
        action: pageInfo.action || 'updated',
        updated_at: new Date().toISOString()
    };
    saveCaseSession(caseDir, session);
    return session;
}

/**
 * Records that a draft document was generated or modified.
 * 
 * @param {string} caseDir 
 * @param {Object} draftInfo { filename, template_id, action }
 */
function recordDraftModified(caseDir, draftInfo = {}) {
    if (!caseDir || !draftInfo.filename) return null;
    const session = loadCaseSession(caseDir);
    const key = String(draftInfo.filename);
    session.drafts_modified[key] = {
        filename: key,
        template_id: draftInfo.template_id || '',
        action: draftInfo.action || 'created',
        updated_at: new Date().toISOString()
    };
    saveCaseSession(caseDir, session);
    return session;
}

/**
 * Sets the active intake or legal analysis focus mode.
 * 
 * @param {string} caseDir 
 * @param {string} focusMode ('general' | 'waterfall' | 's29a' | 'avoidance')
 */
function recordFocusMode(caseDir, focusMode = 'general') {
    if (!caseDir) return null;
    const session = loadCaseSession(caseDir);
    session.active_focus = String(focusMode || 'general');
    saveCaseSession(caseDir, session);
    return session;
}

/**
 * Records an active conversational turn.
 * 
 * @param {string} caseDir 
 */
function recordTurn(caseDir) {
    if (!caseDir) return null;
    const session = loadCaseSession(caseDir);
    session.turn_count = (session.turn_count || 0) + 1;
    saveCaseSession(caseDir, session);
    return session;
}

/**
 * Synchronizes session records with disk artifacts (reviews/case_kv_dictionary.json, wiki/, drafts/)
 * Ensures complete factual consistency even if files existed prior to session initialization.
 * 
 * @param {string} caseDir 
 * @returns {Object} Updated session
 */
function syncFromDisk(caseDir) {
    if (!caseDir || !fs.existsSync(caseDir)) return null;
    const session = loadCaseSession(caseDir);

    // 1. Sync case_kv_dictionary.json
    const kvPath = path.join(caseDir, 'reviews', 'case_kv_dictionary.json');
    if (fs.existsSync(kvPath)) {
        try {
            const raw = fs.readFileSync(kvPath, 'utf8');
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                for (const [k, v] of Object.entries(parsed)) {
                    if (v && typeof v === 'object') {
                        session.kv_keys_written[k] = {
                            key: k,
                            value: v.value !== undefined ? String(v.value) : '',
                            verified_by_user: v.verified_by_user === 1 ? 1 : 0,
                            source: v.source || 'disk_sync',
                            updated_at: v.updated_at || new Date().toISOString()
                        };
                    } else if (v !== undefined) {
                        session.kv_keys_written[k] = {
                            key: k,
                            value: String(v),
                            verified_by_user: 0,
                            source: 'disk_sync',
                            updated_at: new Date().toISOString()
                        };
                    }
                }
            }
        } catch {
            // Ignore parse errors on sync
        }
    }

    // 2. Sync wiki pages
    const wikiDir = path.join(caseDir, 'wiki');
    if (fs.existsSync(wikiDir)) {
        try {
            const scanDir = (dir, prefix = '') => {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const e of entries) {
                    if (e.isDirectory()) {
                        scanDir(path.join(dir, e.name), path.join(prefix, e.name));
                    } else if (e.isFile() && e.name.endsWith('.md')) {
                        const slug = path.join(prefix, e.name.replace(/\.md$/, ''));
                        if (!session.wiki_pages_modified[slug]) {
                            session.wiki_pages_modified[slug] = {
                                slug,
                                title: e.name.replace(/\.md$/, ''),
                                action: 'synced',
                                updated_at: new Date().toISOString()
                            };
                        }
                    }
                }
            };
            scanDir(wikiDir);
        } catch {
            // Ignore scan errors
        }
    }

    // 3. Sync drafts
    const draftsDir = path.join(caseDir, 'drafts');
    if (fs.existsSync(draftsDir)) {
        try {
            const files = fs.readdirSync(draftsDir);
            for (const f of files) {
                if (f.endsWith('.docx') || f.endsWith('.md')) {
                    if (!session.drafts_modified[f]) {
                        session.drafts_modified[f] = {
                            filename: f,
                            template_id: '',
                            action: 'synced',
                            updated_at: new Date().toISOString()
                        };
                    }
                }
            }
        } catch {
            // Ignore draft scan errors
        }
    }

    saveCaseSession(caseDir, session);
    return session;
}

/**
 * Produces a deterministic, hallucination-free Markdown summary of the active working session
 * for direct injection into mathematical compaction blocks (Plan 14).
 * 
 * @param {string} caseDir 
 * @returns {string} Formatted markdown block
 */
function getFormattedSessionState(caseDir) {
    if (!caseDir) return '';
    const session = loadCaseSession(caseDir);
    const lines = [];

    const matterName = session.matter_name || path.basename(caseDir);
    lines.push(`Matter Workspace: ${matterName}`);
    if (session.active_focus && session.active_focus !== 'general') {
        lines.push(`Intake Focus Priority: ${session.active_focus.toUpperCase()}`);
    }

    // Ingested documents
    const docKeys = Object.keys(session.documents_indexed);
    if (docKeys.length > 0) {
        const docList = docKeys.slice(0, 10).map(k => {
            const d = session.documents_indexed[k];
            return d.pages ? `${k} (${d.pages} pp)` : k;
        }).join(', ');
        lines.push(`Documents Ingested (${docKeys.length}): ${docList}${docKeys.length > 10 ? '…' : ''}`);
    }

    // Verified / extracted key facts (prioritize verified)
    const kvEntries = Object.entries(session.kv_keys_written);
    if (kvEntries.length > 0) {
        lines.push(`Case Facts Ledger (${kvEntries.length} items):`);
        // Show verified facts first
        const sorted = kvEntries.sort((a, b) => (b[1].verified_by_user || 0) - (a[1].verified_by_user || 0));
        for (const [k, v] of sorted.slice(0, 12)) {
            const verifiedTag = v.verified_by_user ? ' [VERIFIED]' : '';
            lines.push(`- ${k}: "${v.value}"${verifiedTag}`);
        }
        if (sorted.length > 12) {
            lines.push(`- … and ${sorted.length - 12} additional registered factual parameters.`);
        }
    }

    // Wiki insights
    const wikiKeys = Object.keys(session.wiki_pages_modified);
    if (wikiKeys.length > 0) {
        const pages = wikiKeys.slice(0, 8).map(s => `wiki/${s}.md`).join(', ');
        lines.push(`Chamber Wiki Pages (${wikiKeys.length}): ${pages}${wikiKeys.length > 8 ? '…' : ''}`);
    }

    // Legal drafts
    const draftKeys = Object.keys(session.drafts_modified);
    if (draftKeys.length > 0) {
        lines.push(`Active Court Drafts (${draftKeys.length}): ${draftKeys.slice(0, 6).join(', ')}`);
    }

    return lines.join('\n');
}

module.exports = {
    SESSION_FILENAME,
    getSessionFilePath,
    createDefaultSession,
    loadCaseSession,
    saveCaseSession,
    recordDocumentIndexed,
    recordKVKeyWritten,
    recordWikiPageModified,
    recordDraftModified,
    recordFocusMode,
    recordTurn,
    syncFromDisk,
    getFormattedSessionState
};
