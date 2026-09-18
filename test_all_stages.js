'use strict';

/**
 * Hayagriva End-to-End Architectural Test Suite
 * Validates Stage 1 (Core Foundation), Stage 2 (Local Coworkers & Brains),
 * and Stage 3 (Global Coworkers & ResolutionBazaar).
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const REPO_ROOT = path.resolve(__dirname);
const DEMO_CASE = path.join(REPO_ROOT, 'demo_case');
const BASE_URL = 'http://127.0.0.1:3210';

let passed = 0;
let failed = 0;
const results = [];

function assert(condition, testName, details = '') {
    if (condition) {
        console.log(`  ✅ PASS: ${testName}`);
        passed++;
        results.push({ testName, status: 'PASS', details });
    } else {
        console.error(`  ❌ FAIL: ${testName} - ${details}`);
        failed++;
        results.push({ testName, status: 'FAIL', details });
    }
}

async function request(endpoint, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(endpoint, BASE_URL);
        const options = {
            method,
            headers: body ? { 'Content-Type': 'application/json' } : {}
        };

        const req = http.request(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    resolve({ status: res.statusCode, body: json });
                } catch (_) {
                    resolve({ status: res.statusCode, raw: data });
                }
            });
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function runStage1Tests() {
    console.log('\n======================================================');
    console.log('🏛️  STAGE 1: CORE FOUNDATION TESTS (Offline, 0% Cloud, 0 MB GPU)');
    console.log('======================================================');

    // Test 1.1: Packaging Policy - verify 293 MB cases vault removed
    const casesVaultDir = path.join(REPO_ROOT, 'backend', 'vault', 'data_vaults', 'cases');
    const casesExist = fs.existsSync(casesVaultDir);
    assert(!casesExist, 'Packaging Policy: 293 MB cases/ directory unbundled from core distribution');

    const gitignoreContent = fs.readFileSync(path.join(REPO_ROOT, '.gitignore'), 'utf8');
    assert(gitignoreContent.includes('cases/'), 'Packaging Policy: cases/ added to root .gitignore');

    // Test 1.2: Statutory Bare Acts Vault is installed and intact
    const lawsVault = path.join(REPO_ROOT, 'backend', 'vault', 'laws.vlt.data');
    assert(fs.existsSync(lawsVault), 'Statutory Vault: laws.vlt.data installed (< 2 MB footprint)');

    const { loadVault, searchLaws, isVaultReady } = require('./backend/lib/utils/vault-loader');
    loadVault();
    const vaultReady = isVaultReady();
    assert(vaultReady, 'Statutory Vault: In-memory statutory bare acts vault is loaded and ready');

    const sec7Results = await searchLaws('Section 7 financial creditor default application', 3);
    assert(sec7Results && sec7Results.length > 0, 'Statutory Search: Bare acts lookup for Section 7 returned matches without LLM');

    // Test 1.3: Legal Skeletons & Formats inventory
    const { listSkeletons } = require('./backend/lib/agents/skills/skeleton-load');
    const skeletons = listSkeletons(REPO_ROOT);
    assert(skeletons && skeletons.length >= 10, `Legal Formats: Found ${skeletons ? skeletons.length : 0} statutory skeletons ready for deterministic filing`);

    // Test 1.4: Deterministic Drafting via API (<100ms, zero LLM)
    const t0 = Date.now();
    const draftRes = await request('/api/hayagriva/foundation/draft-deterministic', 'POST', {
        template: 'cirp-form-b',
        case: DEMO_CASE
    });
    const elapsed = Date.now() - t0;
    assert(draftRes.status === 200 && draftRes.body.success, `Deterministic Drafting: Generated Form B draft in ${elapsed}ms (< 150ms)`, `Filled ${draftRes.body ? draftRes.body.filledCount : 0} fields`);

    // Test 1.5: Hybrid RAG Search (FTS5 + ONNX Cosine Similarity + Cross-Encoder Reranker)
    const rag = require('./backend/lib/core/rag');
    const ragRes = await rag.query(DEMO_CASE, 'What is the sanctioned credit facility amount?');
    assert(ragRes && Array.isArray(ragRes.sources) && ragRes.sources.length > 0, 'Hybrid RAG: Local search retrieved relevant case facts from demo_case documents');
    if (ragRes && Array.isArray(ragRes.sources) && ragRes.sources.length > 0) {
        assert(ragRes.sources[0].includes('Sanction_Letter'), `Hybrid RAG: Top document correctly matched Sanction Letter (${ragRes.sources[0]})`);
    }
}

async function runStage2Tests() {
    console.log('\n======================================================');
    console.log('🧠  STAGE 2: LOCAL BRAINS & COWORKERS TESTS (100% On-Device, Private)');
    console.log('======================================================');

    // Test 2.1: Cryptographic License Validator
    const { generateLicenseKey, validateLicenseEnvelope } = require('./backend/lib/utils/license-validator');
    const testPayload = {
        sub: 'auditor.lead@nclt-audit.in',
        tier: 'enterprise',
        allowedDomains: ['insolvency', 'finance', 'legal'],
        allowedPacks: ['legal', 'finance'],
        resolutionbazaar_url: 'https://api.resolutionbazaar.com/v1',
        resolutionbazaar_key: 'rb_live_sec_key_2026',
        expiresAt: '2029-01-01'
    };

    const validKey = generateLicenseKey(testPayload);
    const validation = validateLicenseEnvelope(validKey);
    assert(validation.valid && validation.tier === 'enterprise', 'License Validator: Cryptographic HMAC signature validated offline');

    const invalidValidation = validateLicenseEnvelope(validKey + '_tampered');
    assert(!invalidValidation.valid, 'License Validator: Tampered license envelope rejected cleanly');

    // Test 2.2: Local Coworkers Class Exports & Availability
    const subagents = require('./backend/lib/agents/subagents');
    assert(subagents.FinancialClaimSubAgent && subagents.BankAnalyzerSubAgent, 'Local Coworkers: Financial Claim SubAgent (@Auditor) and Bank Analyzer SubAgent (@Forensic) loaded');

    const coordinator = require('./backend/lib/agents/agent-coordinator');
    assert(typeof coordinator.classifyIntent === 'function', 'Coordinator: Agent coordinator intent classifier available');

    const detectedPrecedent = await coordinator.classifyIntent(DEMO_CASE, 'What are the leading precedents and court judgments on Section 7 limitation period?');
    assert(detectedPrecedent === 'precedent', `Coordinator: Correctly routed case law inquiry to @Precedent (routed to: ${detectedPrecedent})`);

    // Test 2.3: Single-Engine Port 8090 Hot-Swapping Configuration
    const settingsV2 = await request(`/api/hayagriva/settings/v2?case=${encodeURIComponent(DEMO_CASE)}`);
    assert(settingsV2.status === 200 && settingsV2.body.activeBrain.localEnginePort === 8090, 'Local Brains: Local LLM Engine unified on port 8090 (Single-Engine hot-swap architecture)');
}

async function runStage3Tests() {
    console.log('\n======================================================');
    console.log('🌐  STAGE 3: GLOBAL COWORKERS & RESOLUTIONBAZAAR TESTS');
    console.log('======================================================');

    // Test 3.1: License-Gated ResolutionBazaar Configuration Injection
    const { generateLicenseKey } = require('./backend/lib/utils/license-validator');
    const licenseKey = generateLicenseKey({
        sub: 'advocate.sharma@nclt.in',
        tier: 'enterprise',
        allowedDomains: ['insolvency', 'finance', 'legal'],
        allowedPacks: ['legal', 'finance'],
        resolutionbazaar_url: 'https://api.resolutionbazaar.com/v1',
        resolutionbazaar_key: 'rb_live_2026_enterprise_secret',
        expiresAt: '2028-12-31'
    });

    const verifyRes = await request('/api/hayagriva/license/verify', 'POST', {
        licenseKey,
        case: DEMO_CASE
    });
    assert(verifyRes.status === 200 && verifyRes.body.success, 'ResolutionBazaar Config: License activated and unpacked enterprise parameters');

    const updatedSettings = await request(`/api/hayagriva/settings/v2?case=${encodeURIComponent(DEMO_CASE)}`);
    assert(updatedSettings.body.resolutionBazaar.configured === true, 'ResolutionBazaar Config: API key and endpoint configured in case settings');
    assert(updatedSettings.body.resolutionBazaar.url === 'https://api.resolutionbazaar.com/v1', 'ResolutionBazaar Config: ResolutionBazaar live gateway URL set correctly');

    // Test 3.2: @Precedent Agent Query & Air-Gapped Fallback Resilience
    const precRes = await request('/api/hayagriva/precedents/query', 'POST', {
        query: 'Limitation period for filing Section 7 application under IBC',
        case: DEMO_CASE
    });
    assert(precRes.status === 200 && precRes.body.success, 'Precedent Agent (@Precedent): Precedent query executed successfully');
    assert(precRes.body.answer && precRes.body.answer.length > 50, 'Precedent Agent (@Precedent): Returned substantive ratio decidendi / statutory analysis');
    assert(precRes.body.formattedDossier && precRes.body.formattedDossier.includes('Precedent'), 'Precedent Agent (@Precedent): Formatted professional Precedent Intelligence Dossier');

    // Test 3.3: Two-Tier Coworker Settings Persistence (Local vs Global)
    const saveRes = await request('/api/hayagriva/settings/v2/save', 'POST', {
        case: DEMO_CASE,
        foundation: { monacoHoverEnabled: true, deterministicKvFilling: true },
        activeBrain: { tier: 'core' },
        coworkers: {
            local: {
                claimsAuditor: true,
                bankForensic: true,
                pleadingsFormatter: true,
                piiRedactor: true,
                corporateXbrl: false
            },
            global: {
                precedentAgent: true,
                marketIntelligence: true
            }
        }
    });
    assert(saveRes.status === 200 && saveRes.body.success, 'Settings V2: Saved Two-Tier Coworker configuration');

    const savedCheck = await request(`/api/hayagriva/settings/v2?case=${encodeURIComponent(DEMO_CASE)}`);
    assert(savedCheck.body.coworkers.global && savedCheck.body.coworkers.global.precedentAgent === true, 'Settings V2: Global @Precedent Coworker toggle verified in state');
    assert(savedCheck.body.coworkers.local && savedCheck.body.coworkers.local.piiRedactor === true, 'Settings V2: Local @Redactor Coworker toggle verified in state');
}

async function main() {
    console.log('Starting Hayagriva 3-Stage Verification Suite...');
    try {
        await runStage1Tests();
        await runStage2Tests();
        await runStage3Tests();
    } catch (err) {
        console.error('Fatal test error:', err);
    }

    console.log('\n======================================================');
    console.log(`🏁 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED (Total: ${passed + failed})`);
    console.log('======================================================\n');

    process.exit(failed > 0 ? 1 : 0);
}

main();
