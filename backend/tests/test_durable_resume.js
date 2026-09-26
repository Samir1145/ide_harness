'use strict';

/**
 * Plan 16: Inbox Visibility Modes & Durable Resume Test Suite
 * Validates:
 * - VIS_INLINE vs VIS_INBOX categorization and list filtering.
 * - Idempotent resolution semantics keyed on composite natural tuple (session_id, tool_call_id).
 * - Durable suspension checkpointing to reviews/case_suspensions.json.
 * - Cold-process resumption across process lifecycles via DurableResumeCoordinator.
 * - Automatic sweep and unblocking of PolicyGuard hard floors.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
    VIS_INLINE,
    VIS_INBOX,
    VIS_ALL,
    SUSPENSION_STATE_SUSPENDED,
    SUSPENSION_STATE_READY,
    SUSPENSION_STATE_RESUMED,
    createItem,
    getItem,
    listItems,
    resolveItem,
    createSuspensionCheckpoint,
    getSuspension,
    listSuspensions,
    getSuspensionsFilePath
} = require('../lib/agents/inbox-manager');

const resumeCoordinator = require('../lib/agents/durable-resume-coordinator');

async function runTestSuite() {
    console.log('\n[Plan 16: Inbox Visibility Modes & Durable Resume Tests]');
    const tempCaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hayagriva-durable-resume-'));

    try {
        // =========================================================================
        // Stage 1: Visibility Mode Classification & Filtering (VIS_INLINE vs VIS_INBOX)
        // =========================================================================
        console.log('  -> Stage 1: Visibility mode classification & filtering');

        // Attended chat session -> defaults to VIS_INLINE
        const inlineItem = createItem(tempCaseDir, {
            title: 'Verify ₹48.1 Cr Admitted Amount',
            sessionId: 'chat_session_441',
            toolCallId: 'call_verify_sbi'
        });
        assert.strictEqual(inlineItem.visibility, VIS_INLINE, 'Attended chat session must default to VIS_INLINE');

        // Background session -> defaults to VIS_INBOX
        const backgroundItem = createItem(tempCaseDir, {
            title: 'Form G Deadline In 48h',
            sessionId: 'statutory_sentinel',
            toolCallId: 'call_cirp_day115'
        });
        assert.strictEqual(backgroundItem.visibility, VIS_INBOX, 'Statutory sentinel session must default to VIS_INBOX');

        // Explicit visibility override
        const explicitInboxItem = createItem(tempCaseDir, {
            title: 'Overnight Avoidance Inquest',
            sessionId: 'chat_interactive',
            visibility: VIS_INBOX,
            toolCallId: 'call_avoidance_batch'
        });
        assert.strictEqual(explicitInboxItem.visibility, VIS_INBOX, 'Explicit VIS_INBOX must be respected');

        // Test listing with visibility filters
        const allItems = listItems(tempCaseDir, { visibility: VIS_ALL });
        assert.strictEqual(allItems.totalCount, 3);
        assert.strictEqual(allItems.inlineCount, 1);
        assert.strictEqual(allItems.inboxCount, 2);

        const inlineOnly = listItems(tempCaseDir, { visibility: VIS_INLINE });
        assert.strictEqual(inlineOnly.items.length, 1);
        assert.strictEqual(inlineOnly.items[0].id, inlineItem.id);

        const inboxOnly = listItems(tempCaseDir, { visibility: VIS_INBOX });
        assert.strictEqual(inboxOnly.items.length, 2);

        // =========================================================================
        // Stage 2: Idempotent Anti-Duplication & Natural Tuple Keying (sessionId, toolCallId)
        // =========================================================================
        console.log('  -> Stage 2: Anti-duplication by composite tuple (sessionId, toolCallId)');

        const duplicateAttempt = createItem(tempCaseDir, {
            title: 'Duplicate Prompt Should Not Spawn Card',
            sessionId: 'chat_session_441',
            toolCallId: 'call_verify_sbi'
        });
        assert.strictEqual(duplicateAttempt.id, inlineItem.id, 'Duplicate (sessionId, toolCallId) must return existing item');

        // Idempotent resolution by tuple
        const res1 = resolveItem(tempCaseDir, { sessionId: 'chat_session_441', toolCallId: 'call_verify_sbi' }, 'allow', 'Advocate Verma');
        assert.strictEqual(res1.success, true);
        assert.strictEqual(res1.alreadyResolved, false);
        assert.strictEqual(res1.item.resolution, 'allow');
        assert.strictEqual(res1.idempotencyKey, 'chat_session_441::call_verify_sbi');

        // Second resolution attempt must be safely idempotent
        const res2 = resolveItem(tempCaseDir, { sessionId: 'chat_session_441', toolCallId: 'call_verify_sbi' }, 'deny', 'Other Counsel');
        assert.strictEqual(res2.success, true);
        assert.strictEqual(res2.alreadyResolved, true);
        assert.strictEqual(res2.item.resolution, 'allow', 'Idempotent resolution must not overwrite initial decision');

        // =========================================================================
        // Stage 3: Durable Suspension Checkpointing to reviews/case_suspensions.json
        // =========================================================================
        console.log('  -> Stage 3: Durable suspension checkpoint persistence');

        const testDraftRelPath = path.join('drafts', 'Test_CoC_Notice.md');
        const suspRecord = createSuspensionCheckpoint(tempCaseDir, {
            sessionId: 'session_doc_agent_01',
            toolCallId: 'call_draft_coc_notice',
            agentName: 'DocumentAgent',
            continuationContext: {
                targetFile: testDraftRelPath,
                content: '# 1st Meeting of the Committee of Creditors\nDate: 28-09-2026\nAgenda: Ratification of IRP Expenses'
            }
        });

        assert(suspRecord.id.startsWith('susp_'), 'Expected valid suspension ID');
        assert.strictEqual(suspRecord.state, SUSPENSION_STATE_SUSPENDED);

        const suspFile = getSuspensionsFilePath(tempCaseDir);
        assert(fs.existsSync(suspFile), 'reviews/case_suspensions.json must exist on disk');

        const diskSusp = JSON.parse(fs.readFileSync(suspFile, 'utf8'));
        assert.strictEqual(diskSusp.suspensions.length, 1);
        assert.strictEqual(diskSusp.suspensions[0].id, suspRecord.id);

        // Anti-duplication of suspensions
        const suspDup = createSuspensionCheckpoint(tempCaseDir, {
            sessionId: 'session_doc_agent_01',
            toolCallId: 'call_draft_coc_notice',
            agentName: 'DocumentAgent'
        });
        assert.strictEqual(suspDup.id, suspRecord.id, 'Duplicate suspension call must return existing checkpoint');

        // =========================================================================
        // Stage 4: Resolution & Durable Resume Synchronization
        // =========================================================================
        console.log('  -> Stage 4: Resolving inbox item triggers durable suspension resume');

        // Create an inbox item linked to this suspension
        const linkedInboxItem = createItem(tempCaseDir, {
            title: 'Authorize Writing 1st CoC Notice to drafts/',
            sessionId: 'session_doc_agent_01',
            toolCallId: 'call_draft_coc_notice'
        });

        // Resolve the inbox item (autoResume: true)
        const resolveOutcome = resolveItem(tempCaseDir, linkedInboxItem.id, 'allow', 'Insolvency Professional', {
            autoResume: true
        });
        assert.strictEqual(resolveOutcome.success, true);

        // Allow microtick for async resume dispatch
        await new Promise(r => setTimeout(r, 80));

        // Check suspension state on disk
        const updatedSusp = getSuspension(tempCaseDir, suspRecord.id);
        assert.strictEqual(updatedSusp.state, SUSPENSION_STATE_RESUMED, 'Suspension must transition to resumed');
        assert.strictEqual(updatedSusp.resolution, 'allow');
        assert(updatedSusp.resumedAt !== null, 'resumedAt timestamp must be recorded');

        // Verify draft was actually written to disk by DocumentAgent resumption handler!
        const fullDraftPath = path.join(tempCaseDir, testDraftRelPath);
        assert(fs.existsSync(fullDraftPath), 'DocumentAgent resumption handler must write draft file');
        const draftContent = fs.readFileSync(fullDraftPath, 'utf8');
        assert(draftContent.includes('1st Meeting of the Committee of Creditors'), 'Draft content must match continuation context');

        // Verify resuming an already resumed checkpoint is idempotent
        const secondResume = await resumeCoordinator.resumeSuspension(tempCaseDir, suspRecord.id);
        assert.strictEqual(secondResume.success, true);
        assert.strictEqual(secondResume.alreadyResumed, true, 'Resume must be idempotent');

        // =========================================================================
        // Stage 5: Cold-Process Restart Recovery & Startup Sweep
        // =========================================================================
        console.log('  -> Stage 5: Cold-process restart recovery & sweepAndResumePending');

        // Create a suspension that was approved while server was offline (state: ready_to_resume)
        const offlineDraftRelPath = path.join('drafts', 'Offline_Audit_Memo.md');
        const offlineSusp = createSuspensionCheckpoint(tempCaseDir, {
            sessionId: 'session_offline_99',
            toolCallId: 'call_offline_audit',
            agentName: 'DocumentAgent',
            continuationContext: {
                targetFile: offlineDraftRelPath,
                content: '# Forensic Audit Summary\nStatus: Reconciled after cold restart.'
            }
        });

        // Manually simulate offline approval state
        offlineSusp.state = SUSPENSION_STATE_READY;
        offlineSusp.resolution = 'allow';
        offlineSusp.resolvedBy = 'Court Commissioner';
        offlineSusp.resolvedAt = new Date().toISOString();
        const rawStore = JSON.parse(fs.readFileSync(suspFile, 'utf8'));
        const idx = rawStore.suspensions.findIndex(s => s.id === offlineSusp.id);
        rawStore.suspensions[idx] = offlineSusp;
        fs.writeFileSync(suspFile, JSON.stringify(rawStore, null, 2), 'utf8');

        // Perform cold startup sweep
        const sweepResult = await resumeCoordinator.sweepAndResumePending(tempCaseDir);
        assert.strictEqual(sweepResult.swept, 1, 'Startup sweep should pick up 1 pending suspension');
        assert.strictEqual(sweepResult.resumed.length, 1);
        assert.strictEqual(sweepResult.resumed[0].id, offlineSusp.id);

        // Verify file was generated after cold-restart sweep
        const offlineDraftPath = path.join(tempCaseDir, offlineDraftRelPath);
        assert(fs.existsSync(offlineDraftPath), 'Sweep must execute resumption and generate file');
        assert(fs.readFileSync(offlineDraftPath, 'utf8').includes('Reconciled after cold restart.'));

        // =========================================================================
        // Stage 6: PolicyGuard Hard Floor Durable Unblocking
        // =========================================================================
        console.log('  -> Stage 6: PolicyGuard hard floor unblocking via Durable Resume');

        const protectedFilePath = path.join(tempCaseDir, 'drafts', 'Section_30_Audit.md');
        const policySusp = createSuspensionCheckpoint(tempCaseDir, {
            sessionId: 'policy_session_10',
            toolCallId: 'call_policy_unblock_30',
            agentName: 'PolicyGuard',
            continuationContext: {
                hardFloor: 'OVERWRITE_DRAFT_HARD_FLOOR',
                operation: {
                    type: 'WRITE_LOCAL',
                    path: protectedFilePath,
                    content: '# Section 30(2) Mandatory Legal Checklist\nStatus: Unblocked & Verified'
                }
            }
        });

        // Link to inbox item and resolve
        const policyInboxItem = createItem(tempCaseDir, {
            title: 'Authorize Writing Section 30 Audit to drafts/',
            sessionId: 'policy_session_10',
            toolCallId: 'call_policy_unblock_30'
        });
        resolveItem(tempCaseDir, policyInboxItem.id, 'allow', 'Managing Partner', { autoResume: false });

        const policyResumeRes = await resumeCoordinator.resumeSuspension(tempCaseDir, policySusp.id);
        assert.strictEqual(policyResumeRes.success, true);
        assert.strictEqual(policyResumeRes.result.status, 'executed');
        assert(fs.existsSync(protectedFilePath), 'PolicyGuard resumed handler must execute authorized file write');

        console.log('\n  ✓ SUCCESS: All Plan 16 tests passed with 100% compliance!');

    } finally {
        try {
            fs.rmSync(tempCaseDir, { recursive: true, force: true });
        } catch (_) {}
    }
}

runTestSuite().catch(err => {
    console.error('\n❌ Plan 16 Test Suite Failed:', err);
    process.exit(1);
});
