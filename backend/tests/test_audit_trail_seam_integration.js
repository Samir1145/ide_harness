const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');
const complianceSeam = require('../lib/seams/compliance');
const auditTrail = require('../lib/core/audit_trail');
const routes = require('../lib/routes');

async function run() {
    console.log('--- Testing Audit Trail + Seam Integration (Modification 2) ---');

    const testDir = path.join(__dirname, 'fixtures', 'test_audit_integration_' + Date.now());
    const dossierDir = path.join(testDir, '01_dossier');
    fs.mkdirSync(dossierDir, { recursive: true });

    let server;
    let baseUrl;

    try {
        // 1. Setup local HTTP server with dynamic routes
        console.log('1. Launching test API server with routes.js...');
        server = http.createServer(async (req, res) => {
            const url = require('url').parse(req.url, true);
            const methodRoutes = routes[req.method];
            if (methodRoutes && methodRoutes[url.pathname]) {
                try {
                    await methodRoutes[url.pathname](req, res, url, path.dirname(testDir));
                } catch (e) {
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: e.message }));
                }
            } else {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Not found' }));
            }
        });

        await new Promise(resolve => server.listen(0, resolve));
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        console.log(`   Server listening on ${baseUrl}`);

        const caseName = path.basename(testDir);

        // 2. Dispatch Local Subagent via ComplianceSeam
        console.log('2. Dispatching Local Subagent via complianceSeam...');
        const task1 = {
            task_id: 'task_local_01',
            report_code: 'irp-fee-proposal-reg34b',
            title: 'IRP Fee & IRPC Budget Proposal',
            statutory_citation: 'IBBI CIRP Reg 34B',
            target_agent: '@document',
            required_inputs: {
                corporate_debtor: 'Apex Logistics Ltd',
                irp_name: 'Mr. Arvind Sharma',
                admission_date: '2026-08-15'
            }
        };

        const localRes = await complianceSeam.dispatch(testDir, task1, { tier: 'LOCAL' });
        assert.strictEqual(localRes.success, true);
        assert.ok(fs.existsSync(path.join(testDir, 'drafts', 'irp-fee-proposal-reg34b.md')));

        // 3. Dispatch AirGap Staged Envelope via ComplianceSeam
        console.log('3. Dispatching AirGap Staged Envelope via complianceSeam...');
        const task2 = {
            task_id: 'task_airgap_02',
            report_code: 'REPORT_07',
            title: 'MCA Director Disqualification Check',
            statutory_citation: 'Companies Act § 164(2)',
            required_inputs: { din: '01234567' }
        };

        const airgapRes = await complianceSeam.dispatch(testDir, task2, { tier: 'AIRGAP' });
        assert.strictEqual(airgapRes.success, true);

        // 4. Ingest LexAI Forensic Dossier via ComplianceSeam
        console.log('4. Ingesting LexAI Forensic Dossier via complianceSeam...');
        const ingestPayload = {
            taskId: 'task_lexai_03',
            reportId: 'REPORT_11',
            reportTitle: 'Section 29A Eligibility Dossier',
            tiddlers: [
                {
                    title: 'Section 29A Eligibility Dossier/Dossier Summary',
                    text: 'Forensic evaluation revealed an NPA default over 1 year under Section 29A(c).'
                }
            ]
        };

        const ingestRes = await complianceSeam.ingest(testDir, ingestPayload, { simulated: true });
        assert.strictEqual(ingestRes.success, true);

        // 5. Verify Audit Trail Entries on Disk
        console.log('5. Verifying audit trail file entries and hash chain on disk...');
        const auditFile = path.join(dossierDir, 'audit_trail.jsonl');
        assert.ok(fs.existsSync(auditFile), 'audit_trail.jsonl must exist in 01_dossier/');

        const diskVerify = auditTrail.verifyChain(testDir);
        assert.strictEqual(diskVerify.valid, true, 'Audit hash chain must be cryptographically valid');
        assert.strictEqual(diskVerify.total_entries, 3, 'Must contain exactly 3 audit entries');
        console.log(`   Audit Chain Valid: ${diskVerify.total_entries} entries, Terminal Head Hash: ${diskVerify.head_hash.substring(0, 16)}...`);

        // 6. Test GET /api/hayagriva/case/audit-trail endpoint
        console.log('6. Testing GET /api/hayagriva/case/audit-trail...');
        const apiRes = await fetch(`${baseUrl}/api/hayagriva/case/audit-trail?case=${caseName}`);
        assert.strictEqual(apiRes.status, 200);
        const apiData = await apiRes.json();
        assert.strictEqual(apiData.success, true);
        assert.strictEqual(apiData.total, 3);
        assert.strictEqual(apiData.is_valid, true);
        assert.strictEqual(apiData.entries.length, 3);
        assert.strictEqual(apiData.entries[0].event, 'STATUTORY_DRAFT_COMPILED');
        assert.strictEqual(apiData.entries[1].event, 'AIRGAP_REQUISITION_STAGED');
        assert.strictEqual(apiData.entries[2].event, 'LEXAI_DOSSIER_INGESTED');

        // 7. Test GET /api/hayagriva/case/audit-trail/verify endpoint
        console.log('7. Testing GET /api/hayagriva/case/audit-trail/verify...');
        const verifyRes = await fetch(`${baseUrl}/api/hayagriva/case/audit-trail/verify?case=${caseName}`);
        assert.strictEqual(verifyRes.status, 200);
        const verifyData = await verifyRes.json();
        assert.strictEqual(verifyData.success, true);
        assert.strictEqual(verifyData.verification.valid, true);

        // 8. Test GET /api/hayagriva/case/audit-trail/export endpoint (Section 65B Certificate)
        console.log('8. Testing GET /api/hayagriva/case/audit-trail/export...');
        const exportRes = await fetch(`${baseUrl}/api/hayagriva/case/audit-trail/export?case=${caseName}&ip_name=Adv.+Sunil+Gupta&ibbi_reg_no=IBBI/IPA-001/IP-P00999/2026/11111`);
        assert.strictEqual(exportRes.status, 200);
        const certMarkdown = await exportRes.text();
        assert.ok(certMarkdown.includes('ANNEXURE: STATUTORY CERTIFICATE OF ELECTRONIC EVIDENCE'));
        assert.ok(certMarkdown.includes('STATUS: VERIFIED & TAMPER-EVIDENT'));
        assert.ok(certMarkdown.includes('Adv. Sunil Gupta'));
        assert.ok(certMarkdown.includes('IBBI/IPA-001/IP-P00999/2026/11111'));
        assert.ok(certMarkdown.includes('STATUTORY_DRAFT_COMPILED'));
        assert.ok(certMarkdown.includes('LEXAI_DOSSIER_INGESTED'));

        console.log('✅ All Audit Trail + Seam integration tests passed seamlessly!');
        return true;
    } finally {
        if (server) server.close();
        try {
            fs.rmSync(testDir, { recursive: true, force: true });
        } catch (_) {}
    }
}

if (require.main === module) {
    run().catch(err => {
        console.error('❌ Integration test failed:', err);
        process.exit(1);
    });
}

module.exports = { run };
