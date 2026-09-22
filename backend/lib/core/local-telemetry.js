// backend/lib/core/local-telemetry.js
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

/**
 * Embedded Local Telemetry & Audit Logger.
 * Records all local neural operations (embeddings, reranking, local LLM generation)
 * into <caseDir>/ledgers/case_billing.db using Node.js built-in SQLite.
 */

function getTelemetryDb(caseDir) {
    if (!caseDir) {
        throw new Error('[LocalTelemetry] caseDir is required');
    }
    const ledgersDir = path.join(caseDir, 'ledgers');
    if (!fs.existsSync(ledgersDir)) {
        fs.mkdirSync(ledgersDir, { recursive: true });
    }

    const dbPath = path.join(ledgersDir, 'case_billing.db');
    const db = new DatabaseSync(dbPath);

    db.exec(`
        CREATE TABLE IF NOT EXISTS local_telemetry_spans (
            span_id TEXT PRIMARY KEY,
            case_id TEXT NOT NULL,
            task_name TEXT NOT NULL,
            category TEXT NOT NULL,
            target_subject TEXT,
            tokens_input INTEGER DEFAULT 0,
            tokens_output INTEGER DEFAULT 0,
            total_tokens INTEGER DEFAULT 0,
            duration_ms INTEGER DEFAULT 0,
            model_name TEXT NOT NULL,
            billing_status TEXT DEFAULT 'INCLUDED',
            rate_inr REAL DEFAULT 0.00,
            metadata_json TEXT DEFAULT '{}',
            executed_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_telemetry_case ON local_telemetry_spans(case_id);
        CREATE INDEX IF NOT EXISTS idx_telemetry_category ON local_telemetry_spans(category);
    `);

    return db;
}

/**
 * Logs a single telemetry span into the local case database.
 */
function logSpan(caseDir, {
    caseId = 'default_case',
    taskName,
    category = 'LOCAL_INFERENCE',
    targetSubject = '',
    tokensInput = 0,
    tokensOutput = 0,
    totalTokens = 0,
    durationMs = 0,
    modelName = 'local-neural',
    billingStatus = 'INCLUDED',
    rateInr = 0.00,
    metadata = {}
}) {
    try {
        const db = getTelemetryDb(caseDir);
        const spanId = 'span_' + crypto.randomUUID().replace(/-/g, '').substring(0, 16);
        const executedAt = new Date().toISOString();
        const computedTotal = totalTokens || (tokensInput + tokensOutput);

        const stmt = db.prepare(`
            INSERT INTO local_telemetry_spans (
                span_id, case_id, task_name, category, target_subject,
                tokens_input, tokens_output, total_tokens, duration_ms,
                model_name, billing_status, rate_inr, metadata_json, executed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
            spanId,
            caseId,
            taskName || 'Unnamed Local Task',
            category,
            targetSubject,
            tokensInput,
            tokensOutput,
            computedTotal,
            durationMs,
            modelName,
            billingStatus,
            rateInr,
            JSON.stringify(metadata || {}),
            executedAt
        );

        console.log(`[LocalTelemetry] ✓ Logged: "${taskName}" (${computedTotal} tokens, ${durationMs}ms, ${billingStatus})`);
        return { spanId, taskName, totalTokens: computedTotal, executedAt };
    } catch (e) {
        console.error('[LocalTelemetry] Failed to log span:', e.message);
        return null;
    }
}

/**
 * Returns summary statistics of local compute for a case.
 */
function getAuditSummary(caseDir, caseId) {
    try {
        const db = getTelemetryDb(caseDir);
        const altCaseId = caseId ? caseId.replace(/\s+/g, '_') : '';
        const query = caseId
            ? 'SELECT count(*) as count, coalesce(sum(total_tokens), 0) as total_tokens, coalesce(sum(duration_ms), 0) as total_duration_ms FROM local_telemetry_spans WHERE case_id = ? OR case_id = ?'
            : 'SELECT count(*) as count, coalesce(sum(total_tokens), 0) as total_tokens, coalesce(sum(duration_ms), 0) as total_duration_ms FROM local_telemetry_spans';
        
        const stmt = db.prepare(query);
        const row = caseId ? stmt.get(caseId, altCaseId) : stmt.get();

        // Breakdown by category
        const catQuery = caseId
            ? 'SELECT category, count(*) as count, sum(total_tokens) as tokens FROM local_telemetry_spans WHERE case_id = ? OR case_id = ? GROUP BY category'
            : 'SELECT category, count(*) as count, sum(total_tokens) as tokens FROM local_telemetry_spans GROUP BY category';
        const catStmt = db.prepare(catQuery);
        const categories = caseId ? catStmt.all(caseId, altCaseId) : catStmt.all();

        return {
            totalSpans: row.count || 0,
            totalTokens: row.total_tokens || 0,
            totalDurationMs: row.total_duration_ms || 0,
            categories: categories || []
        };
    } catch (e) {
        console.error('[LocalTelemetry] Failed to get summary:', e.message);
        return { totalSpans: 0, totalTokens: 0, totalDurationMs: 0, categories: [] };
    }
}

/**
 * Returns recent telemetry spans for auditing / UI display.
 */
function getRecentSpans(caseDir, limit = 50) {
    try {
        const db = getTelemetryDb(caseDir);
        const stmt = db.prepare(`
            SELECT span_id, case_id, task_name, category, target_subject,
                   tokens_input, tokens_output, total_tokens, duration_ms,
                   model_name, billing_status, rate_inr, executed_at
            FROM local_telemetry_spans
            ORDER BY executed_at DESC
            LIMIT ?
        `);
        return stmt.all(limit) || [];
    } catch (e) {
        console.error('[LocalTelemetry] Failed to get recent spans:', e.message);
        return [];
    }
}

module.exports = {
    logSpan,
    getAuditSummary,
    getRecentSpans
};
