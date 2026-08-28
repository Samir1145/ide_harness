'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { DOMAIN_PROFILES, getActiveDomainProfile, bootstrapDomainTaxonomy } = require('../lib/core/domain-registry');
const { getConversionsDir } = require('../lib/pipeline/common/helper');

async function run() {
    console.log('[Workspace Onboarding & Domain Taxonomy Master Tests]');
    const testCaseDir = path.join(__dirname, 'fixtures', 'temp_taxonomy_workspace');
    if (fs.existsSync(testCaseDir)) {
        fs.rmSync(testCaseDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testCaseDir, { recursive: true });

    try {
        // ── Test 1: Unconfigured Workspace Returns Null Profile ──
        console.log('  -> Test 1: Unconfigured workspace returns null domain profile...');
        let profile = getActiveDomainProfile(testCaseDir);
        assert.strictEqual(profile, null, 'Unconfigured workspace should return null domain profile.');
        console.log('     ✓ Unconfigured workspace correctly detected as requiring onboarding.');

        // ── Test 2: Legal Domain Taxonomy Bootstrapping ──
        console.log('  -> Test 2: Bootstrapping Legal domain taxonomy folders...');
        const conversionsDir = getConversionsDir(testCaseDir);
        fs.mkdirSync(conversionsDir, { recursive: true });
        fs.writeFileSync(
            path.join(conversionsDir, 'case_manifest.json'),
            JSON.stringify({ domain: 'legal' }, null, 2),
            'utf8'
        );

        profile = getActiveDomainProfile(testCaseDir);
        assert.ok(profile !== null, 'Domain profile should resolve to legal.');
        assert.strictEqual(profile.id, 'legal');
        assert.strictEqual(profile.userRole, 'Advocate / Law Firm');

        const bootstrappedFolders = bootstrapDomainTaxonomy(testCaseDir);
        assert.strictEqual(bootstrappedFolders.length, 6);
        for (const folder of profile.taxonomy) {
            assert.ok(fs.existsSync(path.join(testCaseDir, folder)), `Expected folder ${folder} to exist.`);
        }
        console.log('     ✓ Legal domain taxonomy folders successfully created.');

        // ── Test 3: Switching Domain Profile to Finance & Safe Pruning ──
        console.log('  -> Test 3: Switching Domain Profile to Finance and pruning empty obsolete folders...');
        // Put a file in one legal folder (01_petitioner_plaintiff) to verify non-empty folders are NOT deleted
        fs.writeFileSync(path.join(testCaseDir, '01_petitioner_plaintiff', 'pleading.docx'), 'dummy content', 'utf8');

        // Update domain to finance
        fs.writeFileSync(
            path.join(conversionsDir, 'case_manifest.json'),
            JSON.stringify({ domain: 'finance' }, null, 2),
            'utf8'
        );

        const financeProfile = getActiveDomainProfile(testCaseDir);
        assert.strictEqual(financeProfile.id, 'finance');
        assert.strictEqual(financeProfile.embeddingModel, 'Finance-Embeddings');

        bootstrapDomainTaxonomy(testCaseDir);

        // Verify finance folders created
        for (const folder of financeProfile.taxonomy) {
            assert.ok(fs.existsSync(path.join(testCaseDir, folder)), `Expected finance folder ${folder} to exist.`);
        }

        // Verify empty legal folders were pruned (e.g. 02_respondent_defendant)
        assert.strictEqual(fs.existsSync(path.join(testCaseDir, '02_respondent_defendant')), false, 'Empty obsolete folder should be pruned.');
        
        // Verify non-empty legal folder was safely preserved
        assert.strictEqual(fs.existsSync(path.join(testCaseDir, '01_petitioner_plaintiff')), true, 'Non-empty obsolete folder must be preserved.');
        assert.strictEqual(fs.existsSync(path.join(testCaseDir, '01_petitioner_plaintiff', 'pleading.docx')), true);
        console.log('     ✓ Dynamic taxonomy switching and safe pruning verified.');

        // ── Test 4: Insolvency Profile Specification Check ──
        console.log('  -> Test 4: Insolvency profile 10-folder taxonomy check...');
        const insolvProfile = DOMAIN_PROFILES.insolvency;
        assert.strictEqual(insolvProfile.taxonomy.length, 10);
        assert.ok(insolvProfile.taxonomy.includes('00_inbox'));
        assert.ok(insolvProfile.taxonomy.includes('01_commencement'));
        assert.ok(insolvProfile.taxonomy.includes('02_claims'));
        assert.ok(insolvProfile.taxonomy.includes('05_plans'));
        console.log('     ✓ Insolvency 10-folder iPIE taxonomy structure verified.');

        console.log('  ✓ SUCCESS: All Workspace Onboarding & Domain Taxonomy Tests Passed!\n');
    } finally {
        try {
            fs.rmSync(testCaseDir, { recursive: true, force: true });
        } catch (_) {}
    }
}

module.exports = { run };
