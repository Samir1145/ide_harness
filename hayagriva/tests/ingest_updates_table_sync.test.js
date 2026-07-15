const fs = require('fs');
const path = require('path');
const { calculateFileHashSync } = require('../lib/utils/hashing');
const { parseMarkdownTable, generateMarkdownTable } = require('../lib/utils/table-sync');
const { getDb, closeDb } = require('../lib/core/sqlite-store');

console.log('==================================================');
console.log('   Running Ingestion & Table Sync Unit Tests...   ');
console.log('==================================================');

const caseDir = path.join(__dirname, 'fixtures', 'mock-sync-test-case');
fs.mkdirSync(caseDir, { recursive: true });

(async () => {
    try {
        // ── Test 1: File Hashing Utility ──
        console.log('\n[Test 1] Testing calculateFileHashSync...');
        const testFilePath = path.join(caseDir, 'test_hash.txt');
        fs.writeFileSync(testFilePath, 'Hello Hayagriva Sync Test!', 'utf8');
        
        const hash1 = calculateFileHashSync(testFilePath);
        console.log(`-> Hash of test_hash.txt: ${hash1}`);
        if (!hash1 || hash1.length !== 64) {
            throw new Error('Hash must be a valid 64-character SHA-256 hex string.');
        }
        
        // Check that same content yields same hash
        const hash2 = calculateFileHashSync(testFilePath);
        if (hash1 !== hash2) {
            throw new Error('Hashing same file yielded different outputs.');
        }
        console.log('✓ Hash utility tests passed!');

        // ── Test 2: Markdown Table Parser & Generator ──
        console.log('\n[Test 2] Testing parseMarkdownTable and generateMarkdownTable...');
        const mockTable = `
| Creditor | Claimed Amount | Admitted Amount | Rejection Reason |
|---|---|---|---|
| State Bank of India | 10,000,000 | 9,000,000 | Unverified interest charges |
| HDFC Bank | 5,500,000 | 5,500,000 | |
`;
        
        const parsedRows = parseMarkdownTable(mockTable);
        console.log('-> Parsed claims rows:', parsedRows);
        
        if (parsedRows.length !== 2) {
            throw new Error(`Expected 2 rows, found ${parsedRows.length}`);
        }
        if (parsedRows[0].creditor !== 'State Bank of India') {
            throw new Error(`Expected State Bank of India, got ${parsedRows[0].creditor}`);
        }
        if (parsedRows[0].claimed_amount !== 10000000) {
            throw new Error(`Expected claimed_amount to be 10000000, got ${parsedRows[0].claimed_amount}`);
        }
        if (parsedRows[0].admitted_amount !== 9000000) {
            throw new Error(`Expected admitted_amount to be 9000000, got ${parsedRows[0].admitted_amount}`);
        }
        if (parsedRows[0].rejection_reason !== 'Unverified interest charges') {
            throw new Error(`Expected rejection reason, got "${parsedRows[0].rejection_reason}"`);
        }

        // Test generator
        const headers = ['Creditor', 'Claimed Amount', 'Admitted Amount', 'Rejection Reason'];
        const generatedTable = generateMarkdownTable(headers, parsedRows);
        console.log('-> Generated Markdown Table:\n' + generatedTable);
        if (!generatedTable.includes('State Bank of India') || !generatedTable.includes('HDFC Bank')) {
            throw new Error('Generated table does not include original rows.');
        }
        console.log('✓ Table parser/generator tests passed!');

        // ── Test 3: Table Sync Database Integration ──
        console.log('\n[Test 3] Testing SQLite table database insertion...');
        
        const db = getDb(caseDir);
        db.exec('DELETE FROM claims;');
        const insertClaim = db.prepare(`
            INSERT INTO claims (creditor, claimed_amount, admitted_amount, admitted_interest, rejected_amount, rejection_reason, claim_date, status, last_updated)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        parsedRows.forEach(r => {
            insertClaim.run(
                r.creditor || '',
                r.claimed_amount || 0,
                r.admitted_amount || 0,
                r.admitted_interest || 0,
                r.rejected_amount || 0,
                r.rejection_reason || '',
                r.claim_date || '',
                r.status || 'admitted',
                new Date().toISOString()
            );
        });

        const claimsInDb = db.prepare('SELECT * FROM claims').all();
        console.log('-> Claims present in SQLite:', claimsInDb);
        
        if (claimsInDb.length !== 2) {
            throw new Error(`Expected 2 claims in DB, found ${claimsInDb.length}`);
        }
        if (claimsInDb[0].creditor !== 'State Bank of India' || claimsInDb[0].admitted_amount !== 9000000) {
            throw new Error('SQLite data does not match original parsed values.');
        }
        console.log('✓ SQLite table sync database integration passed!');

        // ── Test 4: Case Facts List Parsing & SQLite Sync ──
        console.log('\n[Test 4] Testing case_facts.md key-value list parsing & SQLite sync...');
        const mockFactsDoc = `
# Case Facts
- **company_name**: Tata Steel Ltd
- **agm_date**: July 18, 2026
- **paid_up_capital**: 500,000,000
- **insolvency_professional**: Atul Grover
`;

        const lines = mockFactsDoc.split('\n');
        const parsedKV = {};
        const listRegex = /^\s*[-*]\s*\*\*([a-zA-Z0-9_-]+)\*\*:\s*(.*)$/;
        const tableRegex = /^\|\s*([a-zA-Z0-9_-]+)\s*\|\s*([^|]+)\s*\|$/;

        for (let line of lines) {
            line = line.trim();
            let match = listRegex.exec(line);
            if (match) {
                parsedKV[match[1].trim()] = match[2].trim();
                continue;
            }
            match = tableRegex.exec(line);
            if (match) {
                const key = match[1].trim();
                const val = match[2].trim();
                if (key.toLowerCase() === 'parameter' || key.toLowerCase() === 'key' || key.startsWith('---')) {
                    continue;
                }
                parsedKV[key] = val;
            }
        }

        console.log('-> Parsed KV list:', parsedKV);
        if (parsedKV.company_name !== 'Tata Steel Ltd' || parsedKV.agm_date !== 'July 18, 2026') {
            throw new Error('List key-value parser failed.');
        }

        // Test SQLite insertion logic
        const upsertFact = db.prepare(`
            INSERT INTO case_facts (key, filename, value, source_clause, verified_by_user, last_updated)
            VALUES (?, ?, ?, ?, 1, ?)
            ON CONFLICT(key) DO UPDATE SET
                filename = excluded.filename,
                value = excluded.value,
                source_clause = excluded.source_clause,
                verified_by_user = 1,
                last_updated = excluded.last_updated
        `);
        for (const key in parsedKV) {
            upsertFact.run(
                key,
                'case_facts.md',
                parsedKV[key],
                'case_facts.md (Manual Edit)',
                new Date().toISOString()
            );
        }

        const dbFacts = db.prepare('SELECT * FROM case_facts').all();
        console.log('-> Facts present in SQLite case_facts table:', dbFacts);
        if (dbFacts.length < 4) {
            throw new Error(`Expected at least 4 case facts, found ${dbFacts.length}`);
        }
        const tataFact = dbFacts.find(f => f.key === 'company_name');
        if (!tataFact || tataFact.value !== 'Tata Steel Ltd' || tataFact.verified_by_user !== 1) {
            throw new Error('Case facts database values or verified_by_user flag did not store correctly.');
        }
        console.log('✓ Case Facts parsing & SQLite sync passed!');

        console.log('\n==================================================');
        console.log('      ✓ SUCCESS: All Custom Sync Tests Passed!    ');
        console.log('==================================================');

    } catch (e) {
        console.error('❌ Test failed:', e);
        process.exit(1);
    } finally {
        // Cleanup
        closeDb(caseDir);
        try {
            fs.rmSync(caseDir, { recursive: true, force: true });
        } catch (_) {}
    }
})();
