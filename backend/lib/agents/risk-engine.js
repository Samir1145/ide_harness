'use strict';

/**
 * Enterprise Risk-Tiered Tool Classification & Permission Engine (Hayagriva).
 * Adapted from Andrew Ng's OpenWorker architecture (coworker/risk.py & coworker/permissions.py).
 * 
 * Provides:
 * 1. RiskClass taxonomy (READ, WRITE_LOCAL, EXEC, EXTERNAL).
 * 2. ExecutionMode constraints (DISCUSS, PLAN, DRAFT, AUTO).
 * 3. Path containment verification (assertPathWithinWorkspace) preventing directory traversal.
 * 4. Comprehensive tool call evaluation (evaluateToolCall).
 */

const path = require('path');

const RiskClass = Object.freeze({
    READ: 'read',               // Pure inspection, zero mutations — always allowed
    WRITE_LOCAL: 'write_local', // Workspace mutations — path-scoped & mode-gated
    EXEC: 'exec',               // Command or binary execution — mode-gated & allowlisted
    EXTERNAL: 'external'        // Off-machine / network actions — requires explicit authorization
});

const ExecutionMode = Object.freeze({
    DISCUSS: 'discuss', // Read-only exploratory advisory
    PLAN: 'plan',       // Read-only strategy building
    DRAFT: 'draft',     // Local workspace writes allowed; exec & external restricted
    AUTO: 'auto'        // Autonomous agent execution; writes & exec allowed, external gated
});

// Built-in tool classifications by name
const TOOL_RISK_MAP = {
    // READ tools
    'retrievecontexts': RiskClass.READ,
    'retrieve_contexts': RiskClass.READ,
    'rag': RiskClass.READ,
    'getkvvalue': RiskClass.READ,
    'get_kv_value': RiskClass.READ,
    'read_kv': RiskClass.READ,
    'getallkv': RiskClass.READ,
    'get_all_kv': RiskClass.READ,
    'read_all_kv': RiskClass.READ,
    'querytimeline': RiskClass.READ,
    'query_timeline': RiskClass.READ,
    'timeline': RiskClass.READ,
    'vaultlookup': RiskClass.READ,
    'vault_lookup': RiskClass.READ,
    'laws': RiskClass.READ,
    'checkcrossreference': RiskClass.READ,
    'check_cross_reference': RiskClass.READ,
    'cross_reference': RiskClass.READ,
    'lintdraft': RiskClass.READ,
    'lint_draft': RiskClass.READ,
    'statutorylinter': RiskClass.READ,
    'statutory_linter': RiskClass.READ,
    'grep': RiskClass.READ,
    'read_file': RiskClass.READ,

    // WRITE_LOCAL tools
    'writekv': RiskClass.WRITE_LOCAL,
    'write_kv': RiskClass.WRITE_LOCAL,
    'mdappend': RiskClass.WRITE_LOCAL,
    'md_append': RiskClass.WRITE_LOCAL,
    'append_markdown': RiskClass.WRITE_LOCAL,
    'saveartifact': RiskClass.WRITE_LOCAL,
    'save_artifact': RiskClass.WRITE_LOCAL,
    'savedraft': RiskClass.WRITE_LOCAL,
    'save_draft': RiskClass.WRITE_LOCAL,
    'schedulewake': RiskClass.WRITE_LOCAL,
    'schedule_wake': RiskClass.WRITE_LOCAL,
    'sleep_until': RiskClass.WRITE_LOCAL,
    'write_file': RiskClass.WRITE_LOCAL,
    'replace_in_file': RiskClass.WRITE_LOCAL,
    'apply_patch': RiskClass.WRITE_LOCAL,

    // EXEC tools
    'exportsc': RiskClass.EXEC,
    'export_sc': RiskClass.EXEC,
    'export_supreme_court': RiskClass.EXEC,
    'runpandoc': RiskClass.EXEC,
    'run_pandoc': RiskClass.EXEC,
    'convertdocument': RiskClass.EXEC,
    'convert_document': RiskClass.EXEC,
    'run_shell': RiskClass.EXEC,

    // EXTERNAL tools
    'mcaportalsubmit': RiskClass.EXTERNAL,
    'mca_portal_submit': RiskClass.EXTERNAL,
    'submit_ipie': RiskClass.EXTERNAL,
    'dispatchnotice': RiskClass.EXTERNAL,
    'dispatch_notice': RiskClass.EXTERNAL,
    'sendemailnotice': RiskClass.EXTERNAL,
    'send_email_notice': RiskClass.EXTERNAL,
    'send_message': RiskClass.EXTERNAL
};

/**
 * Normalizes a tool name for lookup.
 */
function normalizeToolName(toolName) {
    if (!toolName) return '';
    return String(toolName).toLowerCase().trim().replace(/^(hayagriva|ipie):/i, '');
}

/**
 * Classifies a tool into its intrinsic RiskClass.
 * 
 * Precedence:
 * 1. User/Session Overrides
 * 2. By-Name Base Table
 * 3. Metadata (e.g. requires_approval -> EXTERNAL)
 * 4. Heuristics based on action verbs
 * 5. Default to READ
 * 
 * @param {string} toolName 
 * @param {Object} [metadata] 
 * @param {Function|Object} [overrides] 
 * @returns {string} RiskClass
 */
function classify(toolName, metadata = null, overrides = null) {
    const norm = normalizeToolName(toolName);

    // 1. Overrides
    if (overrides) {
        if (typeof overrides === 'function') {
            const ov = overrides(norm);
            if (ov && Object.values(RiskClass).includes(ov)) return ov;
        } else if (typeof overrides === 'object' && overrides[norm]) {
            return overrides[norm];
        }
    }

    // 2. Base mapping
    if (TOOL_RISK_MAP[norm]) {
        return TOOL_RISK_MAP[norm];
    }

    // 3. Explicit metadata flags
    if (metadata && (metadata.requires_approval || metadata.requiresApproval || metadata.category === 'external')) {
        return RiskClass.EXTERNAL;
    }

    // 4. Heuristic inference
    if (/^(write|append|create|save|replace|update|patch|delete|unlink)_/.test(norm)) {
        return RiskClass.WRITE_LOCAL;
    }
    if (/^(exec|run|spawn|compile|bash|shell)_/.test(norm)) {
        return RiskClass.EXEC;
    }
    if (/^(send|post|submit|publish|broadcast|webhook)_/.test(norm)) {
        return RiskClass.EXTERNAL;
    }

    // 5. Safe default
    return RiskClass.READ;
}

/**
 * Determines whether a risk class represents a consequential side-effect.
 */
function isConsequential(riskClass) {
    return riskClass !== RiskClass.READ;
}

/**
 * Asserts that a target file path resolves strictly within the workspace directory.
 * Throws a SecurityError if directory traversal (e.g., via `..`) is attempted.
 * 
 * @param {string} caseDir 
 * @param {string} targetPath 
 * @returns {string} The canonical absolute path
 */
function assertPathWithinWorkspace(caseDir, targetPath) {
    if (!caseDir) {
        throw new Error('Case directory must be provided for workspace-scoped path operations.');
    }
    if (!targetPath || typeof targetPath !== 'string') {
        throw new Error('Target path must be a non-empty string.');
    }

    const canonicalCaseDir = path.resolve(caseDir);
    const resolvedPath = path.isAbsolute(targetPath)
        ? path.resolve(targetPath)
        : path.resolve(canonicalCaseDir, targetPath);

    // Ensure resolved path starts with canonicalCaseDir
    if (resolvedPath !== canonicalCaseDir && !resolvedPath.startsWith(canonicalCaseDir + path.sep)) {
        const err = new Error(`Security Violation: Path traversal detected. Access to "${targetPath}" is outside workspace "${canonicalCaseDir}".`);
        err.code = 'ERR_PATH_TRAVERSAL';
        throw err;
    }

    return resolvedPath;
}

/**
 * Evaluates a proposed tool execution against current session context and security policy.
 * 
 * @param {string} caseDir Absolute path to the active case workspace
 * @param {string} toolName Name of the tool to execute
 * @param {Object} [args] Arguments supplied to the tool
 * @param {Object} [sessionContext] Execution context (mode, allowExternal, overrides, etc.)
 * @returns {Object} { allowed: boolean, riskClass: string, reason?: string, needsApproval: boolean, resolvedPaths?: Object }
 */
function evaluateToolCall(caseDir, toolName, args = {}, sessionContext = {}) {
    const mode = (sessionContext.mode || ExecutionMode.AUTO).toLowerCase();
    const risk = classify(toolName, sessionContext.metadata, sessionContext.overrides);

    // 1. READ actions are universally permitted in all modes
    if (risk === RiskClass.READ) {
        return {
            allowed: true,
            riskClass: risk,
            needsApproval: false
        };
    }

    // 2. Read-only modes (DISCUSS, PLAN) block all consequential actions unconditionally
    if (mode === ExecutionMode.DISCUSS || mode === ExecutionMode.PLAN) {
        return {
            allowed: false,
            riskClass: risk,
            needsApproval: false,
            reason: `Execution mode "${mode}" is strictly read-only. Tool "${toolName}" (${risk}) is blocked.`
        };
    }

    // 3. EXTERNAL actions require explicit approval or token confirmation
    if (risk === RiskClass.EXTERNAL) {
        if (sessionContext.allowExternal === true || sessionContext.acknowledgedRisk === true) {
            return {
                allowed: true,
                riskClass: risk,
                needsApproval: false
            };
        }
        return {
            allowed: false,
            riskClass: risk,
            needsApproval: true,
            reason: `External action "${toolName}" communicates outside the machine and requires human approval.`
        };
    }

    // 4. EXEC actions
    if (risk === RiskClass.EXEC) {
        // Allowed in AUTO mode or if specifically allowlisted
        const allowedExecs = sessionContext.allowedExecs || ['exportsc', 'export_sc', 'export_supreme_court', 'runpandoc'];
        const norm = normalizeToolName(toolName);
        if (mode === ExecutionMode.AUTO || allowedExecs.includes(norm)) {
            return {
                allowed: true,
                riskClass: risk,
                needsApproval: false
            };
        }
        return {
            allowed: false,
            riskClass: risk,
            needsApproval: true,
            reason: `Execution of tool "${toolName}" requires authorization.`
        };
    }

    // 5. WRITE_LOCAL actions: strictly enforce path confinement to caseDir
    if (risk === RiskClass.WRITE_LOCAL) {
        const pathFields = ['path', 'filePath', 'targetFile', 'targetPath', 'filename', 'file', 'dest'];
        const resolvedPaths = {};

        for (const field of pathFields) {
            if (args && args[field] && typeof args[field] === 'string') {
                try {
                    resolvedPaths[field] = assertPathWithinWorkspace(caseDir, args[field]);
                } catch (err) {
                    return {
                        allowed: false,
                        riskClass: risk,
                        needsApproval: false,
                        reason: err.message
                    };
                }
            }
        }

        return {
            allowed: true,
            riskClass: risk,
            needsApproval: false,
            resolvedPaths
        };
    }

    // Fallback safe default
    return {
        allowed: false,
        riskClass: risk,
        needsApproval: true,
        reason: `Unrecognized risk profile for tool "${toolName}".`
    };
}

module.exports = {
    RiskClass,
    ExecutionMode,
    TOOL_RISK_MAP,
    classify,
    isConsequential,
    assertPathWithinWorkspace,
    evaluateToolCall,
    normalizeToolName
};
