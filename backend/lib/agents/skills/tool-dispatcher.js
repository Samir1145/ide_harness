'use strict';

const fs = require('fs');
const path = require('path');
const { retrieveContexts } = require('../../core/rag');
const { readCaseKV, readAllKV, writeCaseKV } = require('./kv-write');
const { buildTimeline } = require('./timeline-build');
const { vaultLookup } = require('./vault-lookup');
const { crossReferenceCheck } = require('./cross-ref-check');

/**
 * Centralized tool execution dispatcher for Hayagriva Agents & Theia AI Tool Invocation.
 */
async function executeTool(caseDir, toolName, args = {}) {
    const norm = String(toolName || '').toLowerCase().trim().replace(/^hayagriva:/i, '');

    switch (norm) {
        case 'retrievecontexts':
        case 'retrieve_contexts':
        case 'rag': {
            const query = args.query || args.prompt || '';
            const limit = typeof args.limit === 'number' ? args.limit : 4;
            const domain = args.domain || 'legal';
            const contexts = await retrieveContexts(caseDir, query, limit, domain);
            return {
                tool: 'retrieveContexts',
                query,
                contexts: contexts || []
            };
        }

        case 'getkvvalue':
        case 'get_kv_value':
        case 'read_kv': {
            const key = args.key || '';
            const val = readCaseKV(caseDir, key);
            return {
                tool: 'getKVValue',
                key,
                value: val || null
            };
        }

        case 'getallkv':
        case 'get_all_kv':
        case 'read_all_kv': {
            const kv = readAllKV(caseDir);
            return {
                tool: 'getAllKV',
                kv: kv || {}
            };
        }

        case 'writekv':
        case 'write_kv': {
            const key = args.key;
            const val = args.value;
            const src = args.source || 'Tool';
            const author = args.author || 'Assistant';
            if (key) {
                writeCaseKV(caseDir, key, val, src, author);
            }
            return {
                tool: 'writeKV',
                key,
                value: val,
                status: 'saved'
            };
        }

        case 'querytimeline':
        case 'query_timeline':
        case 'timeline': {
            const events = await buildTimeline(caseDir);
            return {
                tool: 'queryTimeline',
                events: events || []
            };
        }

        case 'vaultlookup':
        case 'vault_lookup':
        case 'laws': {
            const query = args.query || args.keyword || '';
            const limit = typeof args.limit === 'number' ? args.limit : 3;
            const laws = await vaultLookup(query, limit);
            return {
                tool: 'vaultLookup',
                query,
                laws: laws || []
            };
        }

        case 'checkcrossreference':
        case 'check_cross_reference':
        case 'cross_reference': {
            const stmt = args.statement || args.text || '';
            const limit = typeof args.limit === 'number' ? args.limit : 5;
            const xref = await crossReferenceCheck(caseDir, stmt, limit);
            return {
                tool: 'checkCrossReference',
                statement: stmt,
                report: xref
            };
        }

        case 'lintdraft':
        case 'lint_draft':
        case 'statutorylinter':
        case 'statutory_linter': {
            const text = args.text || args.content || args.draft || '';
            const { lintDraft } = require('../../core/statutory-linter');
            const lintReport = lintDraft(text, args.options || {});
            return {
                tool: 'lintDraft',
                report: lintReport
            };
        }

        default:
            throw new Error(`Unknown tool "${toolName}". Available tools: retrieveContexts, getKVValue, getAllKV, writeKV, queryTimeline, vaultLookup, checkCrossReference, lintDraft.`);
    }
}

module.exports = { executeTool };
