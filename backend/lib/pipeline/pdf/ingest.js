const fs = require('fs');
const path = require('path');
const { convertPdf } = require('./upload');
const { getConversionsDir } = require('../common/helper');

/**
 * Ingests a PDF file by converting its first few pages to a Markdown companion file.
 * The background worker in watcher.js will then process subsequent pages.
 */
async function ingestPdf(caseDir, filePath, options = {}) {
    const ext = path.extname(filePath).toLowerCase();
    const relative = path.relative(caseDir, filePath);
    const basename = path.basename(filePath, ext);

    console.log(`[PDF Ingestion] Converting ${relative} to Markdown companion (front-loading first 3 pages)...`);
    const rawMd = await convertPdf(filePath, { limit: 3, multimodal: !!options.multimodal });

    let structuredMd = '';
    if (rawMd.pages) {
        for (const page of rawMd.pages) {
            structuredMd += page.content + '\n\n';
        }
    } else {
        structuredMd = String(rawMd);
    }

    const subfolder = path.dirname(relative);
    const conversionsDir = getConversionsDir(caseDir);
    const destDir = subfolder === '.' ? conversionsDir : path.join(conversionsDir, subfolder);
    fs.mkdirSync(destDir, { recursive: true });
    const companionPath = path.join(destDir, `${basename}.md`);
    const rootCompanionPath = path.join(path.dirname(filePath), `${basename}.md`);

    fs.writeFileSync(companionPath, structuredMd, 'utf8');
    
    // Clean up stale duplicate companion .md in root if it exists
    if (fs.existsSync(rootCompanionPath) && path.resolve(rootCompanionPath) !== path.resolve(companionPath)) {
        try {
            fs.unlinkSync(rootCompanionPath);
            console.log(`[PDF Ingestion] Removed stale root duplicate: ${rootCompanionPath}`);
        } catch (_) {}
    }

    console.log(`[PDF Ingestion] Created companion Markdown: ${companionPath}`);

    // If a verified QR code was found, record it into case_kv_dictionary.json and SQLite case_facts
    if (rawMd.qrUrl) {
        try {
            const reviewsDir = path.join(caseDir, 'reviews');
            fs.mkdirSync(reviewsDir, { recursive: true });
            const dictPath = path.join(reviewsDir, 'case_kv_dictionary.json');
            let dict = {};
            if (fs.existsSync(dictPath)) {
                try { dict = JSON.parse(fs.readFileSync(dictPath, 'utf8')); } catch (_) {}
            }
            const now = new Date().toISOString();
            dict['ecourts_verification_url'] = {
                value: rawMd.qrUrl,
                originalExtractedValue: rawMd.qrUrl,
                modifiedBy: 'system',
                lastUpdated: now,
                source: `${basename}: eCourts QR Verification Stamp`,
                confidence: 'high',
                explanation: 'Decoded digitally from court order QR verification stamp.'
            };
            dict['order_authenticity'] = {
                value: 'VERIFIED',
                originalExtractedValue: 'VERIFIED',
                modifiedBy: 'system',
                lastUpdated: now,
                source: `${basename}: eCourts QR Verification Stamp`,
                confidence: 'high',
                explanation: 'Digital verification stamp present and decoded.'
            };
            fs.writeFileSync(dictPath, JSON.stringify(dict, null, 2), 'utf8');
            console.log(`[PDF Ingestion] ✓ Recorded eCourts verification URL in case_kv_dictionary.json`);

            // Sync to SQLite case_facts
            try {
                const { getDb } = require('../../core/sqlite-store');
                const db = getDb(caseDir);
                const upsertFact = db.prepare(`
                    INSERT INTO case_facts (key, filename, value, source_clause, last_updated)
                    VALUES (?, ?, ?, ?, ?)
                    ON CONFLICT(key) DO UPDATE SET
                        value = excluded.value,
                        filename = excluded.filename,
                        source_clause = excluded.source_clause,
                        last_updated = excluded.last_updated
                    WHERE verified_by_user = 0
                `);
                upsertFact.run('ecourts_verification_url', relative, rawMd.qrUrl, 'eCourts QR Verification Stamp', now);
                upsertFact.run('order_authenticity', relative, 'VERIFIED', 'eCourts QR Verification Stamp', now);
            } catch (dbErr) {
                // SQLite sync optional if table not initialized yet
            }
        } catch (e) {
            console.warn(`[PDF Ingestion] Failed to update case_kv_dictionary.json with QR url:`, e.message);
        }
    }

    return {
        sections: 0,
        companionPath,
        isPartial: rawMd.isPartial || false,
        totalPages: rawMd.totalPages || 1,
        qrUrl: rawMd.qrUrl || null
    };
}

module.exports = { ingestPdf };
