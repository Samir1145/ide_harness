/**
 * compile-process-suites.cjs
 * ─────────────────────────────────────────────────────────────────
 * Compiles the 5 commercial process suites into distributable zip packages:
 *   1. suite_cirp (CIRP Master Suite)
 *   2. suite_liquidation (Liquidation / CILP Suite)
 *   3. suite_voluntary_liquidation (Voluntary Liquidation / CIVLP Suite)
 *   4. suite_ppirp (MSME Pre-pack Suite)
 *   5. suite_personal_guarantor (Personal Guarantors Suite)
 *
 * Output target:
 *   /Users/atulgrover/Desktop/haya_vaults_ide/output/client_vaults/dist/
 *
 * Each zip contains:
 *   - forms/ (pristine sources, markdown templates, forms-manifest.json)
 *   - agents/ (manifest.json, prompts/, skills/)
 *   - suite-manifest.json (entitlement metadata, version, checksums)
 *
 * Updates latest.json with SHA256 & download URLs.
 * ─────────────────────────────────────────────────────────────────
 */

'use strict';

const fs     = require('fs');
const path   = require('path');
const cp     = require('child_process');
const crypto = require('crypto');

const VAULTS_ROOT   = '/Users/atulgrover/Desktop/haya_vaults_ide';
const SUITES_ROOT   = path.join(VAULTS_ROOT, 'raw_data', 'suites');
const DIST_DIR      = path.join(VAULTS_ROOT, 'output', 'client_vaults', 'dist');
const LATEST_JSON   = path.join(DIST_DIR, 'latest.json');

// Ensure dist dir exists
fs.mkdirSync(DIST_DIR, { recursive: true });

function currentWeek() {
  const now   = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const week  = Math.ceil(((now - start) / 86_400_000 + start.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

const SUITES = [
  {
    id: 'cirp',
    suiteKey: 'suite_cirp',
    name: 'CIRP Master Process Suite',
    description: 'Statutory CIRP Forms A–H, Public Announcement, Claims Adjudication, EoI, and Sec 30(2)/Form H Compliance.',
    tier: 'cirp_practitioner',
    keychainAccount: 'vault-cirp',
    agents: [
      { id: 'cirp-launch', name: 'CIRP Inception & Notice Agent', tag: 'cirp-launch', forms: ['form-a', 'form-aa', 'form-ab'] },
      { id: 'claims-auditor', name: 'Claims Verification Suite', tag: 'claims-auditor', forms: ['form-b', 'form-c', 'form-ca', 'form-d', 'form-e', 'form-f'] },
      { id: 'coc-coordinator', name: 'CoC Coordinator & Voting Engine', tag: 'coc', forms: [] },
      { id: 'eoi-manager', name: 'Market Discovery & EoI Agent', tag: 'eoi-manager', forms: ['form-g'] },
      { id: 'cirp-exit', name: 'Section 12A Withdrawal Agent', tag: 'cirp-exit', forms: ['form-fa'] },
      { id: 'plan-evaluator', name: 'Plan Compliance & Form H Auditor', tag: 'plan-evaluator', forms: ['form-h'] }
    ]
  },
  {
    id: 'liquidation',
    suiteKey: 'suite_liquidation',
    name: 'Liquidation Process (CILP) Suite',
    description: 'Forms A_LP through J_LP & Schedule III, Stakeholders Consultation Committee (SCC), Asset E-Auction, and Sec 53 Waterfall.',
    tier: 'liquidator',
    keychainAccount: 'vault-cilp',
    agents: [
      { id: 'liquidator-launch', name: 'Liquidation Launch Agent', tag: 'liquidator-launch', forms: ['form-b-lp'] },
      { id: 'scc-coordinator', name: 'SCC Consultation Coordinator', tag: 'scc-coordinator', forms: ['form-a-lp'] },
      { id: 'liquidator-claims', name: 'Liquidation Claims Adjudicator', tag: 'liquidator-claims', forms: ['form-c-lp', 'form-d-lp', 'form-e-lp', 'form-f-1-lp', 'form-g-lp'] },
      { id: 'auction-manager', name: 'Asset Realization & E-Auction Agent', tag: 'auction-manager', forms: ['schedule-iii-lp'] },
      { id: 'waterfall-calc', name: 'Section 53 Priority Waterfall Calculator', tag: 'waterfall-calc', forms: ['form-h-compliance-certificate-2016'] },
      { id: 'liquidator-compliance', name: 'Corporate Liquidation Account Manager', tag: 'liquidator-compliance', forms: ['form-i-lp', 'form-j-lp'] }
    ]
  },
  {
    id: 'voluntary_liquidation',
    suiteKey: 'suite_voluntary_liquidation',
    name: 'Voluntary Liquidation (CIVLP) Suite',
    description: 'Forms A_VL through H_VL & Schedule II, Solvency Audit, Creditor Satisfaction, and Final NCLT Dissolution.',
    tier: 'voluntary_liquidator',
    keychainAccount: 'vault-civlp',
    agents: [
      { id: 'vl-solvency', name: 'Declaration of Solvency Auditor', tag: 'vl-solvency', forms: ['form-a-vl'] },
      { id: 'vl-claims', name: 'Solvency Claims Settlement Agent', tag: 'vl-claims', forms: ['form-b-vl', 'form-c-vl', 'form-d-vl', 'form-e-vl', 'form-f-vl'] },
      { id: 'vl-dissolution', name: 'Schedule II Final Report & Dissolution Drafter', tag: 'vl-dissolution', forms: ['schedule-ii-vl', 'form-g-vl', 'form-h-vl'] }
    ]
  },
  {
    id: 'ppirp',
    suiteKey: 'suite_ppirp',
    name: 'MSME Pre-pack (PPIRP) Suite',
    description: 'Forms P1 through P14, Base Resolution Plan evaluation, Swiss Challenge competition, and Section 54K Compliance.',
    tier: 'ppirp_practitioner',
    keychainAccount: 'vault-ppirp',
    agents: [
      { id: 'prepack-launch', name: 'Pre-Pack Inception & Approval Agent', tag: 'prepack-launch', forms: ['form-p1', 'form-p2', 'form-p3', 'form-p4', 'form-p5', 'form-p8', 'form-p9'] },
      { id: 'prepack-claims', name: 'MSME Creditor Claims Auditor', tag: 'prepack-claims', forms: ['form-p10'] },
      { id: 'prepack-evaluator', name: 'Swiss Challenge & Form P12 Compliance Agent', tag: 'prepack-evaluator', forms: ['form-p11', 'form-p12', 'form-p13', 'form-p14'] }
    ]
  },
  {
    id: 'personal_guarantor',
    suiteKey: 'suite_personal_guarantor',
    name: 'Personal Guarantors (PG) Suite',
    description: 'IIRP Forms A–C, Bankruptcy Forms A–B, Repayment Plan evaluation, and Bankruptcy Administration.',
    tier: 'personal_guarantor_practitioner',
    keychainAccount: 'vault-pg',
    agents: [
      { id: 'guarantor-insolvency', name: 'Guarantor Insolvency Resolution Agent', tag: 'guarantor-insolvency', forms: ['iirp-reg-form-a', 'iirp-reg-form-b', 'iirp-reg-form-c'] },
      { id: 'bankruptcy-trustee', name: 'Bankruptcy Trustee Administration Agent', tag: 'bankruptcy-trustee', forms: ['bankruptcy-reg-form-a', 'bankruptcy-reg-form-b'] }
    ]
  }
];

function setupSuiteAgentDefinitions(suite) {
  const suiteDir = path.join(SUITES_ROOT, suite.id);
  const agentsDir = path.join(suiteDir, 'agents');
  const promptsDir = path.join(agentsDir, 'prompts');
  const skillsDir = path.join(agentsDir, 'skills');

  fs.mkdirSync(promptsDir, { recursive: true });
  fs.mkdirSync(skillsDir, { recursive: true });

  // 1. Write agents manifest
  const manifest = {
    packId: `pack-${suite.id}`,
    domain: 'insolvency',
    suiteKey: suite.suiteKey,
    name: suite.name,
    description: suite.description,
    version: '1.0.0',
    keychainAccount: suite.keychainAccount,
    agents: suite.agents
  };

  fs.writeFileSync(path.join(agentsDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  // 2. Generate prompt stubs for each agent
  for (const ag of suite.agents) {
    const promptPath = path.join(promptsDir, `${ag.id}.md`);
    if (!fs.existsSync(promptPath)) {
      const promptContent = `# ${ag.name} (@${ag.tag})
You are the specialized **${ag.name}** within the Hayagriva Insolvency Framework.
Your primary mandate is governing the execution of statutory procedures for **${suite.name}**.

## Core Responsibilities:
- Statutory compliance and verification against IBBI Regulations.
- Ingestion of case facts and financial evidence from active workspace.
- Verification of legal conditions, arithmetic balance checks, and timeline compliance.
- Direct population and drafting of statutory forms: ${ag.forms.join(', ') || 'General Suite Actions'}.

## Output Guidelines:
- Produce publication-ready Markdown and DOCX exports.
- Highlight gaps or missing information as diagnostics for the practitioner.
`;
      fs.writeFileSync(promptPath, promptContent, 'utf8');
    }
  }

  // 3. Write suite metadata manifest
  const suiteMeta = {
    suiteKey: suite.suiteKey,
    name: suite.name,
    version: '1.0.0',
    updatedAt: new Date().toISOString(),
    formsCount: countFiles(path.join(suiteDir, 'forms', 'markdown')),
    agentsCount: suite.agents.length
  };
  fs.writeFileSync(path.join(suiteDir, 'suite-manifest.json'), JSON.stringify(suiteMeta, null, 2), 'utf8');
}

function countFiles(dir) {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir).filter(f => !f.startsWith('.')).length;
}

function packageSuiteZip(suite, week) {
  const suiteDir = path.join(SUITES_ROOT, suite.id);
  const zipName = `${suite.id}_suite_vault_${week}.zip`;
  const zipFile = path.join(DIST_DIR, zipName);

  if (fs.existsSync(zipFile)) {
    fs.unlinkSync(zipFile);
  }

  console.log(`[package] Compiling ${suite.name} -> ${zipName}...`);
  const cmd = `cd "${suiteDir}" && zip -r "${zipFile}" . -x "*.DS_Store"`;
  cp.execSync(cmd, { stdio: 'pipe' });

  const stats = fs.statSync(zipFile);
  const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(zipFile)).digest('hex');

  console.log(`[package] ✓ ${zipName} (${sizeMb} MB) | SHA256: ${sha256.substring(0, 12)}...`);

  return {
    suiteKey: suite.suiteKey,
    id: suite.id,
    name: suite.name,
    version: week,
    built: new Date().toISOString(),
    zipName,
    url: `https://github.com/[org]/hayagriva-vaults/releases/download/vault-${week}/${zipName}`,
    size_bytes: stats.size,
    size_mb: parseFloat(sizeMb),
    sha256,
    keychainAccount: suite.keychainAccount,
    tier: suite.tier
  };
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🚀 Hayagriva Process Suites Compiler');
  console.log('═══════════════════════════════════════════════════════════\n');

  const week = currentWeek();
  console.log(`Release Week: ${week}\n`);

  const compiledSuites = [];

  for (const suite of SUITES) {
    setupSuiteAgentDefinitions(suite);
    const result = packageSuiteZip(suite, week);
    compiledSuites.push(result);
  }

  // Update latest.json
  let latest = {};
  if (fs.existsSync(LATEST_JSON)) {
    try { latest = JSON.parse(fs.readFileSync(LATEST_JSON, 'utf8')); } catch (_) {}
  }

  // Ensure practiceSuites dictionary exists in latest.json
  if (!latest.practiceSuites) {
    latest.practiceSuites = {};
  }

  for (const cs of compiledSuites) {
    latest.practiceSuites[cs.suiteKey] = cs;
    // Also mirror as top-level entry for backward compatibility
    latest[cs.suiteKey] = {
      version: cs.version,
      built: cs.built,
      zipName: cs.zipName,
      url: cs.url,
      size_bytes: cs.size_bytes,
      sha256: cs.sha256
    };
  }

  fs.writeFileSync(LATEST_JSON, JSON.stringify(latest, null, 2), 'utf8');
  console.log(`\n[latest.json] ✓ Updated with ${compiledSuites.length} practice suites in ${LATEST_JSON}`);

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('✅ All 5 Process Suites Compiled & Ready for Distribution!');
  console.log('═══════════════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('Fatal Error:', err);
  process.exit(1);
});
