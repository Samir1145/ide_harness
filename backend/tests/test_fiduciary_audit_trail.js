const assert = require('assert');
const fs = require('fs');
const path = require('path');
const auditTrail = require('../lib/core/audit_trail');
const { FiduciaryAuditTrail, GENESIS_PREV_HASH } = auditTrail;

async function run() {
    console.log('--- Testing Fiduciary Audit Trail (Modification 2) ---');

    const testDir = path.join(__dirname, 'fixtures', 'test_audit_case_' + Date.now());
    const dossierDir = path.join(testDir, '01_dossier');
    fs.mkdirSync(dossierDir, { recursive: true });

    try {
        const trail = new FiduciaryAuditTrail();

        // 1. Initial State Check
        console.log('1. Checking initial state on empty directory...');
        const initialVerify = trail.verifyChain(testDir);
        assert.strictEqual(initialVerify.valid, true);
        assert.strictEqual(initialVerify.total_entries, 0);

        // 2. Append Genesis Entry
        console.log('2. Appending Genesis Entry (seq = 0)...');
        const entry0 = await trail.appendEntry(testDir, {
            actor: '@statutory_auditor',
            event: 'SECTION_29A_AUDIT_COMPLETED',
            matter: 'Zenith Metals Ltd',
            task_id: 'task_001',
            verdict: 'STATUTORY_INELIGIBILITY_DETECTED',
            flagged_exceptions: ['§ 29A(c) NPA > 1 Year'],
            artifacts_generated: ['reports/report_11.json', 'reviews/audit_report_11.md']
        });

        assert.strictEqual(entry0.seq, 0);
        assert.strictEqual(entry0.prev_hash, GENESIS_PREV_HASH);
        assert.ok(entry0.curr_hash && entry0.curr_hash.length === 64);

        // 3. Append Second Entry
        console.log('3. Appending Second Entry (seq = 1)...');
        const entry1 = await trail.appendEntry(testDir, {
            actor: 'HUMAN_IP',
            event: 'HITL_APPROVAL_GRANTED',
            matter: 'Zenith Metals Ltd',
            task_id: 'task_001',
            verdict: 'CURE_NOTICE_APPROVED_FOR_DISPATCH'
        });

        assert.strictEqual(entry1.seq, 1);
        assert.strictEqual(entry1.prev_hash, entry0.curr_hash);
        assert.ok(entry1.curr_hash && entry1.curr_hash.length === 64);

        // 4. Verify Chain Integrity
        console.log('4. Verifying valid 2-node hash chain...');
        const verifyResult = trail.verifyChain(testDir);
        assert.strictEqual(verifyResult.valid, true);
        assert.strictEqual(verifyResult.total_entries, 2);
        assert.strictEqual(verifyResult.head_hash, entry1.curr_hash);

        // 5. Test Concurrent Serialization
        console.log('5. Testing concurrent append writes serialization...');
        const concurrentPromises = [
            trail.appendEntry(testDir, { actor: '@claims', event: 'CLAIM_VERIFIED', task_id: 'claim_1' }),
            trail.appendEntry(testDir, { actor: '@bank_analyzer', event: 'CONTRA_SWEEP_DETECTED', task_id: 'forensic_1' }),
            trail.appendEntry(testDir, { actor: '@document', event: 'DRAFT_SKELETON_COMPILED', task_id: 'draft_1' })
        ];

        const concurrentResults = await Promise.all(concurrentPromises);
        assert.strictEqual(concurrentResults.length, 3);

        const verifyAfterConcurrent = trail.verifyChain(testDir);
        assert.strictEqual(verifyAfterConcurrent.valid, true);
        assert.strictEqual(verifyAfterConcurrent.total_entries, 5);

        // 6. Test Tamper Detection
        console.log('6. Testing deliberate file tampering detection...');
        const auditFile = path.join(dossierDir, 'audit_trail.jsonl');
        const lines = fs.readFileSync(auditFile, 'utf8').trim().split('\n');
        
        // Tamper with line 1 (seq 1) payload
        const tamperedObj = JSON.parse(lines[1]);
        tamperedObj.verdict = 'MALICIOUS_MODIFICATION';
        lines[1] = JSON.stringify(tamperedObj);
        fs.writeFileSync(auditFile, lines.join('\n') + '\n', 'utf8');

        const tamperVerify = trail.verifyChain(testDir);
        assert.strictEqual(tamperVerify.valid, false);
        assert.strictEqual(tamperVerify.broken_at_seq, 1);
        console.log('   Correctly caught tampering at seq 1:', tamperVerify.reason);

        // Restore file
        tamperedObj.verdict = 'CURE_NOTICE_APPROVED_FOR_DISPATCH';
        lines[1] = JSON.stringify(tamperedObj);
        fs.writeFileSync(auditFile, lines.join('\n') + '\n', 'utf8');

        // 7. Test Evidence Certificate Generation
        console.log('7. Testing Section 65B / Section 63 BSA Evidence Certificate export...');
        const cert = trail.generateEvidenceCertificate(testDir, {
            matter: 'Zenith Metals Ltd',
            ip_name: 'CS Adv. Rajesh Verma',
            ibbi_reg_no: 'IBBI/IPA-002/IP-N00123/2026/10456'
        });

        assert.ok(cert.includes('ANNEXURE: STATUTORY CERTIFICATE OF ELECTRONIC EVIDENCE'));
        assert.ok(cert.includes('STATUS: VERIFIED & TAMPER-EVIDENT'));
        assert.ok(cert.includes('CS Adv. Rajesh Verma'));
        assert.ok(cert.includes('SECTION_29A_AUDIT_COMPLETED'));

        console.log('✅ All Fiduciary Audit Trail tests passed cleanly!');
        return true;
    } finally {
        try {
            fs.rmSync(testDir, { recursive: true, force: true });
        } catch (_) {}
    }
}

if (require.main === module) {
    run().catch(err => {
        console.error('❌ Test failed:', err);
        process.exit(1);
    });
}

module.exports = { run };
