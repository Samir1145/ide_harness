'use strict';

const path = require('path');
const fs = require('fs');
const { RiskClass, ExecutionMode, classify, assertPathWithinWorkspace } = require('../agents/risk-engine');
const inboxManager = require('../agents/inbox-manager');
const auditTrail = require('../core/audit_trail');

/**
 * Inviolable Policy Hard Floor Identifiers.
 * Operations in these categories CANNOT be bypassed by autonomous agents or auto-approve flags.
 * They strictly require human-in-the-loop (HITL) authorization.
 */
const HARD_FLOORS = Object.freeze({
    MUTATE_VERIFIED_KEY: 'HARD_FLOOR_MUTATE_VERIFIED_KEY',
    OVERWRITE_DRAFT: 'HARD_FLOOR_OVERWRITE_DRAFT',
    EXTERNAL_NETWORK: 'HARD_FLOOR_EXTERNAL_NETWORK',
    TERMINATE_ENGINE: 'HARD_FLOOR_TERMINATE_ENGINE',
    BLACKLISTED_ARG_EXECUTOR: 'HARD_FLOOR_BLACKLISTED_ARG_EXECUTOR'
});

/**
 * Arg-executors blacklisted from automatic execution (Plan 17).
 * The actual executed program lives inside their arguments, evading shallow allowlists.
 */
const BLACKLISTED_ARG_EXECUTORS = Object.freeze([
    'xargs',
    'npx',
    'sudo',
    'docker',
    'ssh',
    'eval',
    'su',
    'bash',
    'sh',
    'zsh'
]);

/**
 * Splits a compound shell command string into individual sub-commands
 * honoring quoted strings and splitting on operators (&&, ||, ;, |).
 */
function splitCompoundCommand(commandLine) {
    if (!commandLine || typeof commandLine !== 'string') return [];
    
    const tokens = [];
    let current = '';
    let inSingleQuote = false;
    let inDoubleQuote = false;

    for (let i = 0; i < commandLine.length; i++) {
        const char = commandLine[i];
        const nextChar = commandLine[i + 1] || '';

        if (char === "'" && !inDoubleQuote) {
            inSingleQuote = !inSingleQuote;
            current += char;
        } else if (char === '"' && !inSingleQuote) {
            inDoubleQuote = !inDoubleQuote;
            current += char;
        } else if (!inSingleQuote && !inDoubleQuote) {
            if ((char === '&' && nextChar === '&') || (char === '|' && nextChar === '|')) {
                if (current.trim()) tokens.push(current.trim());
                current = '';
                i++; // skip next char
            } else if (char === ';' || char === '|') {
                if (current.trim()) tokens.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        } else {
            current += char;
        }
    }

    if (current.trim()) {
        tokens.push(current.trim());
    }

    return tokens;
}

/**
 * Extracts the base executable name from a sub-command string.
 */
function extractExecutableName(subCmd) {
    const trimmed = subCmd.trim();
    if (!trimmed) return '';
    const firstWord = trimmed.split(/\s+/)[0];
    return path.basename(firstWord).toLowerCase();
}

/**
 * PolicyGuard enforces Plan 8 & Plan 17 Hard Floors and coordinates
 * Human-in-the-Loop (HITL) approval redirection.
 */
class PolicyGuard {
    constructor(options = {}) {
        this.options = options;
    }

    /**
     * Hard Floor 1: Prevent mutating a KV key marked as verified_by_user = 1.
     */
    checkKvMutation(caseDir, key, newValue) {
        if (!caseDir || !key) return { allowed: true };

        const candidates = [
            path.join(caseDir, 'reviews', 'case_kv_dictionary.json'),
            path.join(caseDir, 'concepts', 'case_kv_dictionary.json')
        ];

        for (const p of candidates) {
            if (fs.existsSync(p)) {
                try {
                    const dict = JSON.parse(fs.readFileSync(p, 'utf8'));
                    const item = dict[key];
                    if (item) {
                        const isVerified = item.verified_by_user === 1 ||
                                           item.verified_by_user === true ||
                                           item.verified === true;
                        
                        const existingVal = typeof item === 'object' && item !== null && 'value' in item
                            ? item.value
                            : item;

                        if (isVerified && existingVal !== newValue) {
                            return {
                                allowed: false,
                                hardFloor: HARD_FLOORS.MUTATE_VERIFIED_KEY,
                                key,
                                existingValue: existingVal,
                                attemptedValue: newValue,
                                reason: `Hard Floor Violation: Key "${key}" has been verified by the practitioner (verified_by_user=1). Modification requires explicit human re-authorization.`
                            };
                        }
                    }
                } catch (_) {}
            }
        }

        return { allowed: true };
    }

    /**
     * Hard Floor 2: Prevent unconfirmed overwriting of existing legal drafts.
     */
    checkDraftOverwrite(caseDir, targetPath) {
        if (!caseDir || !targetPath) return { allowed: true };

        let resolvedPath;
        try {
            resolvedPath = assertPathWithinWorkspace(caseDir, targetPath);
        } catch (err) {
            return {
                allowed: false,
                hardFloor: 'PATH_TRAVERSAL_BLOCKED',
                reason: err.message
            };
        }

        const draftsDir = path.join(caseDir, 'drafts');
        const isDraft = resolvedPath.startsWith(draftsDir + path.sep) || resolvedPath === draftsDir;

        if (isDraft && fs.existsSync(resolvedPath)) {
            return {
                allowed: false,
                hardFloor: HARD_FLOORS.OVERWRITE_DRAFT,
                targetPath: resolvedPath,
                fileName: path.basename(resolvedPath),
                reason: `Hard Floor Violation: Pleading/Draft "${path.basename(resolvedPath)}" already exists on disk. Overwriting an existing legal draft requires a version snapshot and human confirmation.`
            };
        }

        return { allowed: true };
    }

    /**
     * Hard Floor 3: Enforce strict air-gap boundary outside localhost.
     */
    checkNetworkDispatch(destinationUrl, context = {}) {
        if (!destinationUrl) return { allowed: true };

        try {
            const parsed = new URL(destinationUrl);
            const host = parsed.hostname.toLowerCase();
            const isLocal = host === 'localhost' ||
                            host === '127.0.0.1' ||
                            host === '::1' ||
                            host === '0.0.0.0';

            if (!isLocal) {
                if (context.humanAuthorized === true || context.allowExternal === true) {
                    return { allowed: true, authorized: true };
                }
                return {
                    allowed: false,
                    hardFloor: HARD_FLOORS.EXTERNAL_NETWORK,
                    destinationUrl,
                    host,
                    reason: `Hard Floor Violation: External network egress to "${host}" is blocked by in-chamber air-gap policy. Requires explicit human practitioner authorization.`
                };
            }
        } catch (_) {
            // Malformed URL, block safely
            return {
                allowed: false,
                hardFloor: HARD_FLOORS.EXTERNAL_NETWORK,
                destinationUrl,
                reason: `Hard Floor Violation: Invalid destination URL "${destinationUrl}".`
            };
        }

        return { allowed: true };
    }

    /**
     * Hard Floor 4: Protect local LLM engines from unintended termination during case activity.
     */
    checkEngineTermination(target, context = {}) {
        if (context.humanAuthorized === true) {
            return { allowed: true };
        }
        return {
            allowed: false,
            hardFloor: HARD_FLOORS.TERMINATE_ENGINE,
            target,
            reason: `Hard Floor Violation: Terminating local LLM engine process (${target}) requires practitioner confirmation.`
        };
    }

    /**
     * Hard Floor 5: Compound command splitting and arg-executor blacklist.
     */
    checkShellCommand(commandLine, context = {}) {
        if (!commandLine || typeof commandLine !== 'string') return { allowed: true };

        const subCommands = splitCompoundCommand(commandLine);

        for (const subCmd of subCommands) {
            const execName = extractExecutableName(subCmd);
            if (BLACKLISTED_ARG_EXECUTORS.includes(execName)) {
                return {
                    allowed: false,
                    hardFloor: HARD_FLOORS.BLACKLISTED_ARG_EXECUTOR,
                    commandLine,
                    blockedExecutable: execName,
                    subCommand: subCmd,
                    reason: `Hard Floor Violation: Arg-executor program "${execName}" is blacklisted from automatic execution because arguments conceal arbitrary execution.`
                };
            }
        }

        return { allowed: true };
    }

    /**
     * Evaluates any proposed operation against declarative policy rules.
     * Automatically routes violations to Case Action Inbox if autoRouteInbox is true.
     *
     * @param {string} caseDir
     * @param {Object} operation - { type, payload, ... }
     * @param {Object} [context]
     * @returns {Promise<Object>}
     */
    async evaluate(caseDir, operation = {}, context = {}) {
        const type = (operation.type || '').toUpperCase();
        let checkResult = { allowed: true };

        switch (type) {
            case 'KV_MUTATION':
            case 'KV_WRITE':
                checkResult = this.checkKvMutation(caseDir, operation.key, operation.value);
                break;

            case 'WRITE_DRAFT':
            case 'WRITE_FILE':
                checkResult = this.checkDraftOverwrite(caseDir, operation.targetPath || operation.filePath);
                break;

            case 'NETWORK_CALL':
            case 'EXTERNAL_DISPATCH':
                checkResult = this.checkNetworkDispatch(operation.destinationUrl || operation.url, context);
                break;

            case 'SHELL_EXEC':
            case 'COMMAND':
                checkResult = this.checkShellCommand(operation.commandLine || operation.cmd, context);
                break;

            case 'TERMINATE_ENGINE':
                checkResult = this.checkEngineTermination(operation.target, context);
                break;

            case 'TOOL_CALL':
                // Check if tool is external or shell execution
                const toolName = operation.toolName;
                const risk = classify(toolName, operation.metadata);
                if (risk === RiskClass.EXTERNAL) {
                    checkResult = this.checkNetworkDispatch(operation.args?.url || 'https://external-api', context);
                } else if (risk === RiskClass.WRITE_LOCAL && operation.args?.targetFile) {
                    checkResult = this.checkDraftOverwrite(caseDir, operation.args.targetFile);
                } else if (operation.args?.commandLine) {
                    checkResult = this.checkShellCommand(operation.args.commandLine, context);
                }
                break;

            default:
                checkResult = { allowed: true };
                break;
        }

        if (!checkResult.allowed) {
            console.warn(`[PolicyGuard] 🛡️ ${checkResult.hardFloor}: ${checkResult.reason}`);

            let inboxItem = null;
            if (context.autoRouteInbox !== false && caseDir) {
                try {
                    inboxItem = inboxManager.createItem(caseDir, {
                        kind: 'approval',
                        title: `Policy Guard: ${checkResult.hardFloor}`,
                        body: `${checkResult.reason}\n\nOperation: ${type}`,
                        riskClass: checkResult.hardFloor,
                        data: {
                            operation,
                            checkResult
                        }
                    });

                    // Log audit trail event
                    auditTrail.appendEntry(caseDir, {
                        actor: 'POLICY_GUARD',
                        event: 'HARD_FLOOR_INTERCEPTED',
                        matter: path.basename(caseDir),
                        task_id: inboxItem.id,
                        verdict: 'BLOCKED_PENDING_HITL',
                        inputs: operation,
                        metadata: {
                            hard_floor: checkResult.hardFloor,
                            inbox_item_id: inboxItem.id
                        }
                    }).catch(e => console.warn('[PolicyGuard] Audit trail write error:', e.message));

                } catch (inboxErr) {
                    console.warn(`[PolicyGuard] Error routing to Inbox: ${inboxErr.message}`);
                }
            }

            return {
                ...checkResult,
                blocked: true,
                inboxItem
            };
        }

        return {
            allowed: true,
            status: 'POLICY_PASSED'
        };
    }
}

const policyGuardInstance = new PolicyGuard();
module.exports = policyGuardInstance;
module.exports.PolicyGuard = PolicyGuard;
module.exports.HARD_FLOORS = HARD_FLOORS;
module.exports.BLACKLISTED_ARG_EXECUTORS = BLACKLISTED_ARG_EXECUTORS;
module.exports.splitCompoundCommand = splitCompoundCommand;
module.exports.extractExecutableName = extractExecutableName;
