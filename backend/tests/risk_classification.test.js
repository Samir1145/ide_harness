'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const {
    RiskClass,
    ExecutionMode,
    classify,
    isConsequential,
    assertPathWithinWorkspace,
    evaluateToolCall
} = require('../lib/agents/risk-engine');
const { executeTool } = require('../lib/agents/skills/tool-dispatcher');

async function runTests() {
    console.log('[Enterprise Risk-Tiered Tool Classification & Permission Engine Tests]');

    const tempCaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hayagriva-risk-test-'));
    fs.mkdirSync(path.join(tempCaseDir, 'drafts'), { recursive: true });
    fs.writeFileSync(path.join(tempCaseDir, 'case_kv_dictionary.json'), JSON.stringify({
        corporate_debtor: { value: 'Acme Infra Ltd' }
    }, null, 2));

    try {
        // 1. Classification (classify)
        console.log('  -> Test 1: Classify read-only inspection tools as READ');
        const readTools = [
            'retrieveContexts', 'retrieve_contexts', 'rag',
            'getKVValue', 'get_kv_value', 'read_kv',
            'getAllKV', 'get_all_kv',
            'queryTimeline', 'timeline',
            'vaultLookup', 'laws',
            'checkCrossReference', 'cross_reference',
            'lintDraft', 'statutory_linter'
        ];
        for (const t of readTools) {
            assert.strictEqual(classify(t), RiskClass.READ, `Expected ${t} to be READ`);
        }

        console.log('  -> Test 2: Classify local mutating tools as WRITE_LOCAL');
        const writeTools = ['writeKV', 'write_kv', 'mdAppend', 'saveArtifact', 'save_draft', 'replace_in_file'];
        for (const t of writeTools) {
            assert.strictEqual(classify(t), RiskClass.WRITE_LOCAL, `Expected ${t} to be WRITE_LOCAL`);
        }

        console.log('  -> Test 3: Classify execution tools as EXEC');
        const execTools = ['exportSC', 'export_supreme_court', 'runPandoc', 'run_shell', 'convertDocument'];
        for (const t of execTools) {
            assert.strictEqual(classify(t), RiskClass.EXEC, `Expected ${t} to be EXEC`);
        }

        console.log('  -> Test 4: Classify off-machine / portal tools as EXTERNAL');
        const extTools = ['mcaPortalSubmit', 'submit_ipie', 'dispatchNotice', 'sendEmailNotice', 'send_message'];
        for (const t of extTools) {
            assert.strictEqual(classify(t), RiskClass.EXTERNAL, `Expected ${t} to be EXTERNAL`);
        }

        console.log('  -> Test 5: Metadata requires_approval fallback -> EXTERNAL');
        const meta = { requires_approval: true, category: 'connector' };
        assert.strictEqual(classify('custom_connector_tool', meta), RiskClass.EXTERNAL);

        console.log('  -> Test 6: Action verb heuristics for unknown tools');
        assert.strictEqual(classify('write_custom_notes'), RiskClass.WRITE_LOCAL);
        assert.strictEqual(classify('exec_custom_script'), RiskClass.EXEC);
        assert.strictEqual(classify('send_external_webhook'), RiskClass.EXTERNAL);
        assert.strictEqual(classify('unknown_inspector'), RiskClass.READ);

        console.log('  -> Test 7: User/session overrides prevail');
        const overrides = (name) => {
            if (name === 'write_file') return RiskClass.READ; // downgraded
            if (name === 'custom_tool') return RiskClass.EXEC;
            return null;
        };
        assert.strictEqual(classify('write_file', null, overrides), RiskClass.READ);
        assert.strictEqual(classify('custom_tool', null, overrides), RiskClass.EXEC);
        assert.strictEqual(classify('run_shell', null, overrides), RiskClass.EXEC);

        // 2. Consequentiality (isConsequential)
        console.log('  -> Test 8: isConsequential marks non-read actions as consequential');
        assert.strictEqual(isConsequential(RiskClass.READ), false);
        assert.strictEqual(isConsequential(RiskClass.WRITE_LOCAL), true);
        assert.strictEqual(isConsequential(RiskClass.EXEC), true);
        assert.strictEqual(isConsequential(RiskClass.EXTERNAL), true);

        // 3. Workspace Containment & Jailbreak Prevention
        console.log('  -> Test 9: assertPathWithinWorkspace resolves valid internal paths');
        const resolved = assertPathWithinWorkspace(tempCaseDir, 'drafts/form_h.md');
        assert.strictEqual(resolved, path.join(tempCaseDir, 'drafts', 'form_h.md'));

        console.log('  -> Test 10: assertPathWithinWorkspace blocks directory traversal (..)');
        assert.throws(() => {
            assertPathWithinWorkspace(tempCaseDir, '../escaped_secret.txt');
        }, /Security Violation: Path traversal detected/);

        console.log('  -> Test 11: assertPathWithinWorkspace blocks root escapes (/etc/passwd)');
        assert.throws(() => {
            assertPathWithinWorkspace(tempCaseDir, '/etc/passwd');
        }, /Security Violation: Path traversal detected/);

        // 4. Session Execution Mode Gating (evaluateToolCall)
        console.log('  -> Test 12: evaluateToolCall allows READ tools in DISCUSS mode');
        const discussDecision = evaluateToolCall(tempCaseDir, 'getKVValue', { key: 'corporate_debtor' }, { mode: ExecutionMode.DISCUSS });
        assert.strictEqual(discussDecision.allowed, true);
        assert.strictEqual(discussDecision.riskClass, RiskClass.READ);

        console.log('  -> Test 13: evaluateToolCall blocks WRITE_LOCAL tools in DISCUSS and PLAN modes');
        const discussWrite = evaluateToolCall(tempCaseDir, 'writeKV', { key: 'x', value: 'y' }, { mode: ExecutionMode.DISCUSS });
        assert.strictEqual(discussWrite.allowed, false);
        assert.strictEqual(discussWrite.riskClass, RiskClass.WRITE_LOCAL);
        assert.match(discussWrite.reason, /strictly read-only/);

        const planWrite = evaluateToolCall(tempCaseDir, 'saveArtifact', { targetFile: 'drafts/x.md', content: 'hello' }, { mode: ExecutionMode.PLAN });
        assert.strictEqual(planWrite.allowed, false);
        assert.strictEqual(planWrite.riskClass, RiskClass.WRITE_LOCAL);

        console.log('  -> Test 14: evaluateToolCall allows WRITE_LOCAL in DRAFT and AUTO modes');
        const draftDecision = evaluateToolCall(tempCaseDir, 'saveArtifact', { targetFile: 'drafts/test.md', content: 'test' }, { mode: ExecutionMode.DRAFT });
        assert.strictEqual(draftDecision.allowed, true);
        assert.strictEqual(draftDecision.riskClass, RiskClass.WRITE_LOCAL);

        const autoDecision = evaluateToolCall(tempCaseDir, 'writeKV', { key: 'status', value: 'admitted' }, { mode: ExecutionMode.AUTO });
        assert.strictEqual(autoDecision.allowed, true);

        console.log('  -> Test 15: evaluateToolCall blocks WRITE_LOCAL with path traversal even in AUTO mode');
        const escapeDecision = evaluateToolCall(tempCaseDir, 'saveArtifact', { targetFile: '../escape.md', content: 'malicious' }, { mode: ExecutionMode.AUTO });
        assert.strictEqual(escapeDecision.allowed, false);
        assert.match(escapeDecision.reason, /Path traversal detected/);

        console.log('  -> Test 16: evaluateToolCall gates EXTERNAL tools for human authorization');
        const unapproved = evaluateToolCall(tempCaseDir, 'mcaPortalSubmit', {}, { mode: ExecutionMode.AUTO });
        assert.strictEqual(unapproved.allowed, false);
        assert.strictEqual(unapproved.needsApproval, true);
        assert.strictEqual(unapproved.riskClass, RiskClass.EXTERNAL);

        const approved = evaluateToolCall(tempCaseDir, 'mcaPortalSubmit', {}, { mode: ExecutionMode.AUTO, allowExternal: true });
        assert.strictEqual(approved.allowed, true);
        assert.strictEqual(approved.needsApproval, false);

        // 5. End-to-End Tool Dispatcher Integration (executeTool)
        console.log('  -> Test 17: executeTool executes READ tools and attaches _riskClass');
        const res = await executeTool(tempCaseDir, 'getKVValue', { key: 'corporate_debtor' });
        assert.strictEqual(res.tool, 'getKVValue');
        assert.strictEqual(res.value, 'Acme Infra Ltd');
        assert.strictEqual(res._riskClass, RiskClass.READ);

        console.log('  -> Test 18: executeTool rejects writeKV when mode is DISCUSS');
        await assert.rejects(async () => {
            await executeTool(tempCaseDir, 'writeKV', { key: 'test', value: 'val' }, { mode: 'discuss' });
        }, /\[Permission Denied\] Tool "writeKV" \(write_local\) blocked/);

        console.log('  -> Test 19: executeTool successfully writes when mode is AUTO or DRAFT and contained');
        const writeRes = await executeTool(tempCaseDir, 'saveArtifact', {
            targetFile: 'drafts/interim_report.md',
            content: '# Interim Report\nEverything compliant.'
        }, { mode: 'draft' });
        assert.strictEqual(writeRes.tool, 'saveArtifact');
        assert.strictEqual(writeRes._riskClass, RiskClass.WRITE_LOCAL);
        assert.strictEqual(fs.existsSync(writeRes.path), true);
        assert.match(fs.readFileSync(writeRes.path, 'utf8'), /# Interim Report/);

        console.log('  -> Test 20: executeTool rejects saveArtifact with directory traversal');
        await assert.rejects(async () => {
            await executeTool(tempCaseDir, 'saveArtifact', {
                targetFile: '../../malicious.md',
                content: 'hacked'
            }, { mode: 'auto' });
        }, /Path traversal detected/);

        console.log('  -> Test 21: executeTool requires approval for mcaPortalSubmit by default');
        await assert.rejects(async () => {
            await executeTool(tempCaseDir, 'mcaPortalSubmit', {});
        }, /\[Permission Required\] Tool "mcaPortalSubmit" \(external\) requires authorization/);

        console.log('  -> Test 22: executeTool allows mcaPortalSubmit when allowExternal is explicitly true');
        const extRes = await executeTool(tempCaseDir, 'mcaPortalSubmit', {}, { allowExternal: true });
        assert.strictEqual(extRes.tool, 'mcaPortalSubmit');
        assert.strictEqual(extRes.status, 'submitted');
        assert.strictEqual(extRes._riskClass, RiskClass.EXTERNAL);

        console.log('  ✓ SUCCESS: All 22 Risk Classification & Permission Engine tests passed!');
    } finally {
        if (tempCaseDir && fs.existsSync(tempCaseDir)) {
            fs.rmSync(tempCaseDir, { recursive: true, force: true });
        }
    }
}

if (require.main === module) {
    runTests().catch(err => {
        console.error(err);
        process.exit(1);
    });
}

module.exports = { run: runTests, runTests };
