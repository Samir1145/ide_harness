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

        // ── Test 2: Legal Domain Clean Workspace Bootstrapping ──
        console.log('  -> Test 2: Bootstrapping Legal domain clean workspace...');
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
        // Option A: Only essential workflow dirs (drafts, exports) are created
        assert.ok(bootstrappedFolders.includes('drafts'));
        assert.ok(bootstrappedFolders.includes('exports'));
        assert.ok(fs.existsSync(path.join(testCaseDir, 'drafts')));
        assert.ok(fs.existsSync(path.join(testCaseDir, 'exports')));

        // Crucial: No intrusive numbered folders on disk!
        assert.strictEqual(fs.existsSync(path.join(testCaseDir, '01_petitioner_plaintiff')), false, 'No physical numbered folder should be created on disk');
        assert.strictEqual(fs.existsSync(path.join(testCaseDir, '00_inbox')), false, 'No 00_inbox folder on disk');
        console.log('     ✓ Clean flat workspace verified: only drafts/ and exports/ created, disk remains clean.');

        // ── Test 3: Switching Domain Profile to Finance & Safe Handling ──
        console.log('  -> Test 3: Switching Domain Profile to Finance (Persona & Model Config)...');
        // Put a user file in the workspace to verify user files are NEVER touched
        fs.writeFileSync(path.join(testCaseDir, 'client_contract.pdf'), 'dummy pdf content', 'utf8');

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

        // Verify user file was safely preserved
        assert.strictEqual(fs.existsSync(path.join(testCaseDir, 'client_contract.pdf')), true, 'User files must never be touched.');
        // Verify no intrusive finance numbered folders were created
        assert.strictEqual(fs.existsSync(path.join(testCaseDir, '01_financial_statements')), false, 'No physical finance folders on disk');
        console.log('     ✓ Dynamic persona switching verified with zero file system intrusion.');

        // ── Test 4: Profile Metadata Taxonomy Specification Check ──
        console.log('  -> Test 4: Profile metadata specification check...');
        const insolvProfile = DOMAIN_PROFILES.insolvency;
        assert.strictEqual(insolvProfile.taxonomy.length, 10);
        assert.ok(insolvProfile.taxonomy.includes('00_inbox'));
        assert.ok(insolvProfile.taxonomy.includes('02_claims'));
        assert.ok(insolvProfile.taxonomy.includes('05_plans'));
        console.log('     ✓ Insolvency 10-category taxonomy metadata verified.');

        console.log('  ✓ SUCCESS: All Workspace Onboarding & Domain Taxonomy Tests Passed!\n');
    } finally {
        try {
            fs.rmSync(testCaseDir, { recursive: true, force: true });
        } catch (_) {}
    }
}

module.exports = { run };
