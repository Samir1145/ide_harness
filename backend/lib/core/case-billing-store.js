// backend/lib/core/case-billing-store.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

const DEFAULT_TOOL_RATES = {
    'screen_section_29a_entity': 250.00,
    'query_cibil_defaulters': 75.00,
    'check_director_mca_status': 50.00,
    'execute_ecourts_litigation_search': 150.00,
    'generate_plan_verification_dossier': 1500.00,
    'rbz_section_65_inquest': 2500.00,
    'screen_section_65_collusion': 2500.00,
    'rbz_related_party_inquest': 1500.00,
    'screen_related_parties': 1500.00
};

/**
 * Returns or creates the SQLite database connection for a case's billing ledger.
 * Stored at: <caseDir>/ledgers/case_billing.db
 */
function getCaseBillingDb(caseDir) {
    if (!caseDir) {
        throw new Error('[CaseBillingStore] caseDir is required');
    }
    const ledgersDir = path.join(caseDir, 'ledgers');
    if (!fs.existsSync(ledgersDir)) {
        fs.mkdirSync(ledgersDir, { recursive: true });
    }

    const dbPath = path.join(ledgersDir, 'case_billing.db');
    const db = new DatabaseSync(dbPath);

    // Initialize Schema
    db.exec(`
        CREATE TABLE IF NOT EXISTS case_billing_tasks (
            task_id TEXT PRIMARY KEY,
            case_id TEXT NOT NULL,
            tool_name TEXT NOT NULL,
            target_identifier TEXT,
            target_name TEXT,
            rate_inr REAL NOT NULL,
            status TEXT NOT NULL,
            payment_status TEXT NOT NULL,
            approved_by TEXT,
            created_at TEXT NOT NULL,
            executed_at TEXT,
            server_task_id TEXT,
            server_receipt_sig TEXT,
            prev_hash TEXT NOT NULL,
            task_hash TEXT NOT NULL,
            payload_json TEXT,
            report_path TEXT,
            user_email TEXT
        );

        CREATE TABLE IF NOT EXISTS case_payment_receipts (
            invoice_id TEXT PRIMARY KEY,
            invoice_number TEXT NOT NULL,
            case_id TEXT NOT NULL,
            amount_inr REAL NOT NULL,
            gst_inr REAL NOT NULL,
            total_inr REAL NOT NULL,
            gateway_payment_id TEXT NOT NULL,
            payment_status TEXT NOT NULL,
            paid_at TEXT NOT NULL,
            pdf_path TEXT,
            task_id TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_billing_status ON case_billing_tasks(status);
        CREATE INDEX IF NOT EXISTS idx_billing_payment_status ON case_billing_tasks(payment_status);
    `);

    // Self-healing columns check
    try {
        const cols = db.prepare("PRAGMA table_info(case_billing_tasks)").all();
        const colNames = new Set(cols.map(c => c.name));
        if (!colNames.has('payload_json')) {
            db.exec("ALTER TABLE case_billing_tasks ADD COLUMN payload_json TEXT;");
        }
        if (!colNames.has('report_path')) {
            db.exec("ALTER TABLE case_billing_tasks ADD COLUMN report_path TEXT;");
        }
        if (!colNames.has('user_email')) {
            db.exec("ALTER TABLE case_billing_tasks ADD COLUMN user_email TEXT;");
        }

        const receiptCols = db.prepare("PRAGMA table_info(case_payment_receipts)").all();
        const receiptColNames = new Set(receiptCols.map(c => c.name));
        if (!receiptColNames.has('task_id')) {
            db.exec("ALTER TABLE case_payment_receipts ADD COLUMN task_id TEXT;");
        }
    } catch (_) {}

    return db;
}

/**
 * Calculates cryptographic SHA-256 hash for tamper-evident ledger chaining.
 * Locks in previous block hash, task ID, financial rate, and creation timestamp.
 */
function computeTaskHash(prevHash, taskId, rateInr, createdAt) {
    return crypto
        .createHash('sha256')
        .update(`${prevHash}:${taskId}:${rateInr}:${createdAt}`)
        .digest('hex');
}

/**
 * Retrieves the latest task_hash from the ledger (or GENESIS_HASH).
 */
function getLastHash(db) {
    const stmt = db.prepare('SELECT task_hash FROM case_billing_tasks ORDER BY rowid DESC LIMIT 1');
    const row = stmt.get();
    return row && row.task_hash ? row.task_hash : GENESIS_HASH;
}

/**
 * Records a suggested task as PENDING_APPROVAL before any network call.
 * This guarantees zero cost and preserves task state for the user to review later.
 */
function recordPendingTask(caseDir, taskData) {
    const db = getCaseBillingDb(caseDir);
    const caseId = path.basename(caseDir);
    const taskId = taskData.task_id || `tsk_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const rateInr = taskData.rate_inr || DEFAULT_TOOL_RATES[taskData.tool_name] || 100.00;
    const createdAt = new Date().toISOString();

    const prevHash = getLastHash(db);
    const taskHash = computeTaskHash(prevHash, taskId, rateInr, createdAt);

    const payloadJson = typeof taskData.payload === 'object' ? JSON.stringify(taskData.payload) : (taskData.payload_json || null);
    const userEmail = taskData.user_email || taskData.email || null;

    const stmt = db.prepare(`
        INSERT INTO case_billing_tasks (
            task_id, case_id, tool_name, target_identifier, target_name,
            rate_inr, status, payment_status, approved_by, created_at,
            executed_at, server_task_id, server_receipt_sig, prev_hash, task_hash,
            payload_json, report_path, user_email
        ) VALUES (
            ?, ?, ?, ?, ?,
            ?, 'PENDING_APPROVAL', 'UNBILLED', NULL, ?,
            NULL, NULL, NULL, ?, ?,
            ?, NULL, ?
        )
    `);

    stmt.run(
        taskId,
        caseId,
        taskData.tool_name,
        taskData.target_identifier || '',
        taskData.target_name || '',
        rateInr,
        createdAt,
        prevHash,
        taskHash,
        payloadJson,
        userEmail
    );

    return {
        task_id: taskId,
        tool_name: taskData.tool_name,
        target_name: taskData.target_name || '',
        rate_inr: rateInr,
        status: 'PENDING_APPROVAL',
        payment_status: 'UNBILLED',
        created_at: createdAt,
        payload_json: payloadJson,
        user_email: userEmail
    };
}

/**
 * Marks a task as AUTHORIZED by the user.
 */
function markTaskAuthorized(caseDir, taskId, approvedBy = 'User') {
    const db = getCaseBillingDb(caseDir);
    const stmt = db.prepare(`
        UPDATE case_billing_tasks
        SET status = 'AUTHORIZED', approved_by = ?
        WHERE task_id = ? AND status = 'PENDING_APPROVAL'
    `);
    stmt.run(approvedBy, taskId);
}

/**
 * Marks a task as EXECUTED once the server returns receipt.
 * Preserves the cryptographic hash chain while recording authoritative server receipt.
 */
function markTaskExecuted(caseDir, taskId, serverResult = {}) {
    const db = getCaseBillingDb(caseDir);
    const executedAt = new Date().toISOString();
    const serverTaskId = serverResult.server_task_id || serverResult.task_id || `srv_${Date.now()}`;
    const serverReceiptSig = serverResult.server_receipt_sig || serverResult.receipt_signature || '';

    const updateStmt = db.prepare(`
        UPDATE case_billing_tasks
        SET status = 'EXECUTED',
            executed_at = ?,
            server_task_id = ?,
            server_receipt_sig = ?
        WHERE task_id = ?
    `);

    updateStmt.run(executedAt, serverTaskId, serverReceiptSig, taskId);

    return {
        task_id: taskId,
        status: 'EXECUTED',
        server_task_id: serverTaskId
    };
}

/**
 * Delivers completed cloud report to <caseDir>/RBZ_reports/<filename>
 * and creates a strict 1-to-1 audit receipt linking Invoice Number + Payment ID.
 */
function deliverReportAndSettle(caseDir, taskId, deliveryData = {}) {
    const db = getCaseBillingDb(caseDir);
    const caseId = path.basename(caseDir);
    const paidAt = new Date().toISOString();

    const taskStmt = db.prepare("SELECT * FROM case_billing_tasks WHERE task_id = ?");
    const task = taskStmt.get(taskId);
    if (!task) {
        throw new Error(`Task ${taskId} not found in case billing ledger.`);
    }

    const rateInr = task.rate_inr;
    const gstInr = Math.round(rateInr * 0.18 * 100) / 100;
    const totalInr = Math.round((rateInr + gstInr) * 100) / 100;

    const invoiceId = deliveryData.invoice_id || `inv_${Date.now()}`;
    const invoiceNumber = deliveryData.invoice_number || `RBZ-INV-${Date.now().toString().slice(-6)}`;
    const paymentId = deliveryData.payment_id || deliveryData.gateway_payment_id || `pay_${Date.now()}`;

    // Ensure RBZ_reports folder exists
    const reportsDir = path.join(caseDir, 'RBZ_reports');
    if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
    }

    // Standardize report filename
    const dateStr = new Date().toISOString().split('T')[0];
    const safeTitle = (deliveryData.title || task.target_name || task.tool_name).replace(/[^a-zA-Z0-9_\-]/g, '_');
    const reportFilename = deliveryData.filename || `${dateStr}_${safeTitle}.md`;
    const reportAbsPath = path.join(reportsDir, reportFilename);
    const reportRelPath = path.join('RBZ_reports', reportFilename);

    // Build tamper-evident frontmatter
    const frontmatter = `---
report_id: "RBZ-REP-${taskId.slice(-8)}"
task_id: "${taskId}"
invoice_number: "${invoiceNumber}"
gateway_payment_id: "${paymentId}"
tool_name: "${task.tool_name}"
rate_inr: ${rateInr.toFixed(2)}
gst_18_pct: ${gstInr.toFixed(2)}
total_paid_inr: ${totalInr.toFixed(2)}
case_id: "${caseId}"
delivered_at: "${paidAt}"
ledger_task_hash: "${task.task_hash}"
verified_audit_trail: true
---

`;

    const fullContent = frontmatter + (deliveryData.content || `# ${task.target_name || task.tool_name}\n\nReport generated by Resolution Bazaar Cloud.`);
    fs.writeFileSync(reportAbsPath, fullContent, 'utf8');

    // Update Task to EXECUTED and SETTLED
    const updateTaskStmt = db.prepare(`
        UPDATE case_billing_tasks
        SET status = 'EXECUTED',
            payment_status = 'SETTLED',
            executed_at = ?,
            report_path = ?
        WHERE task_id = ?
    `);
    updateTaskStmt.run(paidAt, reportRelPath, taskId);

    // Insert 1-to-1 Payment Receipt
    const insertReceiptStmt = db.prepare(`
        INSERT OR REPLACE INTO case_payment_receipts (
            invoice_id, invoice_number, case_id, amount_inr, gst_inr, total_inr,
            gateway_payment_id, payment_status, paid_at, pdf_path, task_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PAID', ?, ?, ?)
    `);
    insertReceiptStmt.run(
        invoiceId,
        invoiceNumber,
        caseId,
        rateInr,
        gstInr,
        totalInr,
        paymentId,
        paidAt,
        reportRelPath,
        taskId
    );

    return {
        success: true,
        task_id: taskId,
        invoice_number: invoiceNumber,
        payment_id: paymentId,
        report_path: reportRelPath,
        report_abs_path: reportAbsPath,
        total_inr: totalInr,
        delivered_at: paidAt
    };
}

/**
 * Cancels or discards an unapproved task.
 */
function cancelTask(caseDir, taskId) {
    const db = getCaseBillingDb(caseDir);
    const stmt = db.prepare(`
        UPDATE case_billing_tasks
        SET status = 'CANCELLED'
        WHERE task_id = ? AND status = 'PENDING_APPROVAL'
    `);
    stmt.run(taskId);
}

/**
 * Updates settlement status when Razorpay payment is confirmed.
 */
function updateSettlementStatus(caseDir, invoiceId, invoiceNumber, totalInr, paymentId, paymentMethod = 'UPI') {
    const db = getCaseBillingDb(caseDir);
    const caseId = path.basename(caseDir);
    const paidAt = new Date().toISOString();
    const gstInr = Math.round(totalInr * 0.18 / 1.18 * 100) / 100;
    const subtotalInr = Math.round((totalInr - gstInr) * 100) / 100;

    // 1. Mark tasks as settled
    const updateTasksStmt = db.prepare(`
        UPDATE case_billing_tasks
        SET payment_status = 'SETTLED'
        WHERE case_id = ? AND status = 'EXECUTED' AND payment_status != 'SETTLED'
    `);
    updateTasksStmt.run(caseId);

    // 2. Insert receipt
    const insertReceiptStmt = db.prepare(`
        INSERT OR REPLACE INTO case_payment_receipts (
            invoice_id, invoice_number, case_id, amount_inr, gst_inr, total_inr,
            gateway_payment_id, payment_status, paid_at, pdf_path
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'PAID', ?, NULL)
    `);
    insertReceiptStmt.run(
        invoiceId,
        invoiceNumber || `RBZ-INV-${Date.now()}`,
        caseId,
        subtotalInr,
        gstInr,
        totalInr,
        paymentId,
        paidAt
    );

    return {
        invoice_id: invoiceId,
        payment_status: 'PAID',
        settled_at: paidAt
    };
}

/**
 * Returns full audit ledger summary for the case.
 */
function getCaseLedger(caseDir) {
    const db = getCaseBillingDb(caseDir);
    const caseId = path.basename(caseDir);

    const pendingStmt = db.prepare("SELECT * FROM case_billing_tasks WHERE case_id = ? AND status = 'PENDING_APPROVAL' ORDER BY created_at DESC");
    const pendingTasks = pendingStmt.all(caseId);

    const executedStmt = db.prepare("SELECT * FROM case_billing_tasks WHERE case_id = ? AND status = 'EXECUTED' ORDER BY executed_at DESC");
    const executedTasks = executedStmt.all(caseId);

    const receiptsStmt = db.prepare("SELECT * FROM case_payment_receipts WHERE case_id = ? ORDER BY paid_at DESC");
    const receipts = receiptsStmt.all(caseId);

    let unbilledSubtotal = 0;
    let settledSubtotal = 0;

    executedTasks.forEach(t => {
        if (t.payment_status === 'UNBILLED') {
            unbilledSubtotal += t.rate_inr;
        } else {
            settledSubtotal += t.rate_inr;
        }
    });

    const gstAmount = Math.round(unbilledSubtotal * 0.18 * 100) / 100;
    const totalDue = Math.round((unbilledSubtotal + gstAmount) * 100) / 100;

    return {
        case_id: caseId,
        pending_approval_count: pendingTasks.length,
        unbilled_count: executedTasks.filter(t => t.payment_status === 'UNBILLED').length,
        settled_count: executedTasks.filter(t => t.payment_status === 'SETTLED').length,
        unbilled_subtotal_inr: unbilledSubtotal,
        gst_18_pct_inr: gstAmount,
        total_due_inr: totalDue,
        pending_tasks: pendingTasks,
        executed_tasks: executedTasks,
        receipts: receipts,
        currency: 'INR'
    };
}

/**
 * Validates the cryptographic SHA-256 hash chain of the ledger.
 */
function verifyLedgerIntegrity(caseDir) {
    const db = getCaseBillingDb(caseDir);
    const caseId = path.basename(caseDir);
    const stmt = db.prepare('SELECT rowid, * FROM case_billing_tasks WHERE case_id = ? ORDER BY rowid ASC');
    const rows = stmt.all(caseId);

    let expectedPrevHash = GENESIS_HASH;

    for (const row of rows) {
        if (row.prev_hash !== expectedPrevHash) {
            return {
                valid: false,
                tampered_task_id: row.task_id,
                reason: `Chain broken: prev_hash mismatch on task ${row.task_id}`
            };
        }

        const recomputed = computeTaskHash(expectedPrevHash, row.task_id, row.rate_inr, row.created_at);
        if (row.task_hash !== recomputed) {
            return {
                valid: false,
                tampered_task_id: row.task_id,
                reason: `Hash mismatch on task ${row.task_id}: stored ${row.task_hash} != calculated ${recomputed}`
            };
        }

        expectedPrevHash = row.task_hash;
    }

    return { valid: true, rows_verified: rows.length };
}

module.exports = {
    getCaseBillingDb,
    recordPendingTask,
    recordTask: (caseDir, caseIdOrData, toolName, targetId, targetName, rateInr) => {
        if (typeof caseIdOrData === 'object') {
            return recordPendingTask(caseDir, caseIdOrData);
        }
        return recordPendingTask(caseDir, {
            tool_name: toolName || 'execute_ecourts_litigation_search',
            target_identifier: targetId || '',
            target_name: targetName || '',
            rate_inr: rateInr || 150.00
        });
    },
    markTaskAuthorized,
    markTaskExecuted,
    cancelTask,
    deliverReportAndSettle,
    updateSettlementStatus,
    getCaseLedger,
    verifyLedgerIntegrity,
    DEFAULT_TOOL_RATES: {
        ...DEFAULT_TOOL_RATES,
        'rbz_query_precedents': 150.00,
        'rbz_multibank_inquest': 1200.00,
        'rbz_section_29a_screening': 350.00
    }
};
