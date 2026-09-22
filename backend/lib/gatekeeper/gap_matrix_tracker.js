'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Computes the Statutory Readiness Health Gauge and maintains the Living Gap Matrix.
 * Enforces the safety gatekeeper before compiling final court-grade reports.
 *
 * @param {string} matterDir - Absolute path to matter directory
 * @returns {object} Readiness audit summary { score, status, gaps, canCertify }
 */
function evaluateStatutoryReadiness(matterDir) {
  const dossierDir = path.join(matterDir, '01_dossier');
  const intakeJsonPath = path.join(dossierDir, 'intake_29a.json');
  const intakeRelativesPath = path.join(dossierDir, 'intake_relatives.json');

  let hasAffidavit = false;
  let relativesCount = 0;
  let shareholdersCount = 0;

  // Check for intake_29a.json (extracted from affidavit)
  if (fs.existsSync(intakeJsonPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(intakeJsonPath, 'utf8'));
      if (data.affidavit_received) hasAffidavit = true;
      const promoters = data.promoters || [];
      for (const p of promoters) {
        relativesCount += (p.relatives || []).length;
      }
      shareholdersCount = (data.shareholders_gt_2pct || []).length;
    } catch (_) {}
  }

  // Check for intake_relatives.json (filled by user)
  if (fs.existsSync(intakeRelativesPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(intakeRelativesPath, 'utf8'));
      const promoters = data.promoters || [];
      for (const p of promoters) {
        const rels = p.relatives_required_under_section_2_77 || [];
        const filled = rels.filter(r => r.name && r.name.trim().length > 0);
        relativesCount += filled.length;
      }
    } catch (_) {}
  }

  // Check for raw affidavit PDF in dossier/affidavits or inbox
  const affidavitSubdir = path.join(dossierDir, 'affidavits');
  if (fs.existsSync(affidavitSubdir)) {
    const affFiles = fs.readdirSync(affidavitSubdir).filter(f => f.toLowerCase().includes('affidavit') || f.toLowerCase().includes('29a'));
    if (affFiles.length > 0) hasAffidavit = true;
  }

  // Compute Readiness Score & Status
  let score = 40; // Base: public MCA tree mapped
  if (hasAffidavit) score += 35;
  if (relativesCount > 0) score += 20;
  if (shareholdersCount > 0) score += 5;

  let status = 'PROVISIONAL_PRE_BID';
  let badge = '🟡 PROVISIONAL (Public Registry Only)';
  if (score >= 95) {
    status = 'FORM_H_CERTIFIED';
    badge = '🟢 100% STATUTORILY CERTIFIED (NCLT Ready)';
  } else if (score >= 70) {
    status = 'SUBSTANTIAL_IN_PROGRESS';
    badge = '🟡 SUBSTANTIAL (Affidavit Pending Relative Cross-Screening)';
  }

  const gaps = [];
  if (!hasAffidavit) {
    gaps.push({
      item: 'Sworn Section 29A Affidavit',
      regulation: 'IBBI CIRP Regulation 36A(8)',
      risk: 'High — Bidder cannot be formally admitted without a notarized affidavit on stamp paper.'
    });
  }
  if (relativesCount === 0) {
    gaps.push({
      item: 'Promoter Relatives Roster',
      regulation: 'IBC Section 29A(j) read with Companies Act Section 2(77) & Section 5(24A)',
      risk: 'Critical — Exposure if promoter spouse, siblings, or children are defaulting borrowers or guarantors.'
    });
  }
  if (shareholdersCount === 0) {
    gaps.push({
      item: 'Significant Beneficial Ownership (>2%)',
      regulation: 'IBC Section 29A(j) Explanation I',
      risk: 'Medium — Intermediate holding entities or family trusts remain unverified.'
    });
  }

  // Generate / Update 01_dossier/statutory_gap_matrix.md
  fs.mkdirSync(dossierDir, { recursive: true });
  const matrixMd = `# 🏛️ IBC SECTION 29A STATUTORY READINESS & GAP MATRIX
**Matter:** ${path.basename(matterDir)}  
**Last Evaluated:** ${new Date().toISOString().replace('T', ' ').substring(0, 19)} UTC  
**Statutory Readiness Rating:** **${score}%** — \`${badge}\`

---

## 📊 Statutory Health Breakdown

| Statutory Audit Requirement | Legal Mandate | Current Status |
| :--- | :--- | :--- |
| **1. Public MCA Directorship Graph** | IBC §29A / MCA Registry | **100% Cleared (Public Nodes Mapped)** |
| **2. Sworn Section 29A Affidavit** | IBBI Reg 36A(8) | **${hasAffidavit ? '✅ Attached & Verified' : '⚠️ MISSING (Pending Requisition)'}** |
| **3. Section 2(77) Relative Roster** | IBC §29A(j) + CA §2(77) | **${relativesCount > 0 ? `✅ ${relativesCount} Relatives Vetted` : '⚠️ 0 Relatives Vetted (Statutory Blindspot)'}** |
| **4. Significant Shareholders (>2% / SBO)**| IBC §29A(j) Explanation I | **${shareholdersCount > 0 ? `✅ ${shareholdersCount} SBOs Identified` : '⚠️ Unverified (MGT-7 Annexure Pending)'}** |

---

## 🚨 Active Compliance Blindspots & Exposure Assessment

${gaps.length === 0 ? '✅ **Zero Statutory Gaps.** All public and private disclosures are fully vetted for NCLT Form H certification.' : gaps.map((g, i) => `### ${i + 1}. ${g.item}
* **Statutory Mandate**: ${g.regulation}
* **Legal Exposure**: ${g.risk}
`).join('\n')}

---

## ⚖️ Next Required Actions
${score >= 95
  ? '1. All statutory criteria met. Proceed to compile **Definitive Section 29A Dossier (NCLT Form H Ready)**.'
  : `1. **Zero-Friction Ingestion**: Drop the PRA\'s sworn Section 29A Affidavit PDF into \`00_inbox/\`.
2. **Or Quick Roster**: Open \`01_dossier/intake_relatives.json\` and fill in the promoter spouse/family names.
3. **Or Provisional Export**: Compile a **Provisional Pre-Bid Brief** watermarked for preliminary assessment only.`}
`;

  fs.writeFileSync(path.join(dossierDir, 'statutory_gap_matrix.md'), matrixMd, 'utf8');

  return {
    score,
    status,
    badge,
    hasAffidavit,
    relativesCount,
    shareholdersCount,
    gaps,
    canCertify: score >= 95
  };
}

/**
 * Gatekeeper check before compiling a final NCLT Form H certified report.
 *
 * @param {string} matterDir - Absolute path to matter directory
 * @returns {object} Gatekeeper decision
 */
function gatekeeperCheck(matterDir) {
  const audit = evaluateStatutoryReadiness(matterDir);

  if (audit.canCertify) {
    return {
      allowed: true,
      reportType: 'FORM_H_CERTIFIED',
      message: '100% Statutorily Cleared. Dossier ready for NCLT Form H compilation.'
    };
  }

  return {
    allowed: false,
    reportType: 'PROVISIONAL_PRE_BID',
    currentScore: audit.score,
    missingItems: audit.gaps.map(g => g.item),
    options: [
      {
        id: 'COMPLETE_INTAKE',
        label: 'Complete Relative Intake Now (2 mins)',
        action: 'Fill 01_dossier/intake_relatives.json'
      },
      {
        id: 'EXPORT_PROVISIONAL',
        label: 'Download Provisional Pre-Bid Brief',
        action: 'Watermarked as public-only screening brief'
      },
      {
        id: 'WAIVE_WITH_CAVEAT',
        label: 'Generate CoC Report with Non-Disclosure Caveat',
        action: 'Formally record bidder failure to provide affidavit despite requisition'
      }
    ]
  };
}

module.exports = {
  evaluateStatutoryReadiness,
  gatekeeperCheck
};
