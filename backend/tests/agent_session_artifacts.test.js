const assert = require('assert');
const path = require('path');
const fs = require('fs');

async function run() {
    console.log('[Track 4: Session Artifacts & Dynamic Context Chips Unit Tests]');

    const tempCaseDir = path.join(__dirname, 'fixtures', 'temp_artifacts_case');
    fs.mkdirSync(path.join(tempCaseDir, 'concepts'), { recursive: true });
    fs.mkdirSync(path.join(tempCaseDir, 'drafts'), { recursive: true });

    // Seed mock files for chips
    fs.writeFileSync(path.join(tempCaseDir, 'case_kv_dictionary.json'), JSON.stringify({
        'corporate_debtor': 'Matrix Infrastructure Ltd',
        'default_amount': '₹75,00,00,000'
    }, null, 2), 'utf8');

    fs.writeFileSync(path.join(tempCaseDir, 'timeline.md'), '# CIRP Chronology\n- **T0 (01/01/2024)**: Insolvency Commencement Date.\n- **T14 (15/01/2024)**: Public Announcement in Form A.', 'utf8');
    fs.writeFileSync(path.join(tempCaseDir, 'claims_registry.md'), '# Claims Registry\n| Creditor | Claimed | Admitted | Voting % |\n| Bank A | 50 Cr | 50 Cr | 66.6% |', 'utf8');
    fs.writeFileSync(path.join(tempCaseDir, 'avoidance_ledger.md'), '# Avoidance Ledger\n- Section 43: Preferential transfer of ₹5 Cr on 20/11/2023.', 'utf8');

    try {
        const { resolveContextChip, saveArtifact, listArtifacts } = require('../lib/agents/skills/artifact-manager');

        // 1. Test Context Chip Resolution for #case_facts
        console.log('  -> Testing #case_facts context chip resolution...');
        const factsChip = await resolveContextChip(tempCaseDir, 'case_facts');
        assert.ok(factsChip.includes('Matrix Infrastructure Ltd'), 'Must contain corporate debtor fact');
        console.log('     ✓ #case_facts chip resolved successfully.');

        // 2. Test Context Chip Resolution for #timeline
        console.log('  -> Testing #timeline context chip resolution...');
        const timelineChip = await resolveContextChip(tempCaseDir, 'timeline');
        assert.ok(timelineChip.includes('T0') && timelineChip.includes('Insolvency Commencement'), 'Must contain CIRP chronology');
        console.log('     ✓ #timeline chip resolved successfully.');

        // 3. Test Context Chip Resolution for #claims_registry
        console.log('  -> Testing #claims_registry context chip resolution...');
        const claimsChip = await resolveContextChip(tempCaseDir, 'claims_registry');
        assert.ok(claimsChip.includes('Bank A') && claimsChip.includes('66.6%'), 'Must contain claims table');
        console.log('     ✓ #claims_registry chip resolved successfully.');

        // 4. Test Context Chip Resolution for #avoidance_ledger
        console.log('  -> Testing #avoidance_ledger context chip resolution...');
        const avoidanceChip = await resolveContextChip(tempCaseDir, 'avoidance_ledger');
        assert.ok(avoidanceChip.includes('Section 43') && avoidanceChip.includes('Preferential'), 'Must contain avoidance findings');
        console.log('     ✓ #avoidance_ledger chip resolved successfully.');

        // 5. Test Session Artifact Creation and Listing
        console.log('  -> Testing session artifact creation & listing...');
        const artifactRes = saveArtifact(tempCaseDir, {
            name: 'Section_7_Petition_Draft.md',
            content: '# Section 7 Petition\nFiled before NCLT Mumbai Bench.',
            type: 'court_petition'
        });
        assert.ok(artifactRes.success, 'Artifact must be saved successfully');
        assert.ok(fs.existsSync(artifactRes.filePath), 'Physical artifact file must exist');

        const artifactsList = listArtifacts(tempCaseDir);
        assert.ok(Array.isArray(artifactsList), 'listArtifacts must return array');
        assert.ok(artifactsList.some(a => a.name === 'Section_7_Petition_Draft.md'), 'Must find created artifact in list');
        console.log(`     ✓ Created and listed ${artifactsList.length} session artifact(s).`);

    } finally {
        try {
            fs.rmSync(tempCaseDir, { recursive: true, force: true });
        } catch (_) {}
    }

    // 6. Verify Frontend Context Variable Contribution file
    console.log('  -> Checking frontend hayagriva-context-chips.ts...');
    const chipsPath = path.join(__dirname, '..', '..', 'frontend', 'theia-extensions', 'hayagriva', 'src', 'browser', 'hayagriva-context-chips.ts');
    assert.ok(fs.existsSync(chipsPath), 'hayagriva-context-chips.ts must exist');

    const chipsSrc = fs.readFileSync(chipsPath, 'utf8');
    assert.ok(chipsSrc.includes('HayagrivaContextChipsContribution'), 'Must export HayagrivaContextChipsContribution');
    assert.ok(chipsSrc.includes('case_facts'), 'Must register case_facts context variable');
    assert.ok(chipsSrc.includes('timeline'), 'Must register timeline context variable');
    console.log('     ✓ Frontend HayagrivaContextChipsContribution validated.');

    console.log('  ✓ SUCCESS: All Track 4 Session Artifacts & Context Chips tests passed!\n');
}

module.exports = { run };
