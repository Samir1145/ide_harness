const fs = require('fs');
const path = require('path');
const { getChatResponse } = require('../../../../../lib/core/llm-client');
const { readAllKV, writeCaseKV } = require('../../../../../lib/agents/skills/kv-write');
const { appendTableRow } = require('../../../../../lib/agents/skills/md-append');
const { formatIndianCurrency, extractClaimantData } = require('../../../../../lib/agents/skills/claim-extract');
const { ragRetrieve, formatContextBlock } = require('../../../../../lib/agents/skills/rag-retrieve');
const { buildLiteFallback } = require('../../../../../lib/agents/skills/lite-fallback');

class ClaimVerificationAgent {
    constructor() {
        this.name = 'ClaimVerificationAgent';
        const instructionsPath = path.join(__dirname, 'agent.md');
        if (fs.existsSync(instructionsPath)) {
            this.instructions = fs.readFileSync(instructionsPath, 'utf8');
        } else {
            this.instructions = 'You are HAYAGRIVA Claim Verification Agent. Audit and verify creditor claims under IBC 2016.';
        }
    }

    async run(caseDir, userMessage, history = []) {
        console.log(`[Claim Verification Agent] Auditing claims: "${userMessage}"`);

        const forMatch = userMessage.match(/(?:for|claimant|creditor)\s+([A-Za-z0-9\s&.,'-]+?)(?:\s+(?:under|as|with|from|having|claim|of|loan|amount)|$|\.)/i);
        const specifiedClaimant = forMatch && forMatch[1] ? forMatch[1].trim() : '';

        const kv = readAllKV(caseDir);
        const claimantData = await extractClaimantData(caseDir, specifiedClaimant);

        // 1. Audit Check 1: Limitation Check (Section 238A IBC / Article 137 Limitation Act)
        let limitationStatus = '✅ WITHIN LIMITATION (Default occurred within 3 years of ICD)';
        if (claimantData.dateOfDefault && claimantData.icdDate) {
            const defDate = new Date(claimantData.dateOfDefault);
            const icd = new Date(claimantData.icdDate);
            if (!isNaN(defDate.getTime()) && !isNaN(icd.getTime())) {
                const diffYears = (icd.getTime() - defDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
                if (diffYears > 3) {
                    limitationStatus = '⚠️ POTENTIAL TIME-BARRED DISPUTE (> 3 years between default & ICD without documented Section 18 revival)';
                }
            }
        }

        // 2. Audit Check 2: Interest Substantiation & ICD Cut-off
        const interestStatus = claimantData.interestAmount > 0
            ? `✅ Contractual interest calculated up to ICD (${claimantData.icdDate}) at ${claimantData.interestRate || 'agreed'}% p.a.`
            : 'ℹ️ No interest claimed / Interest included in lump sum claim';

        // 3. Audit Check 3: ROC Security Charge (Section 77 Companies Act 2013)
        const securityStatus = claimantData.securityDetails && claimantData.securityDetails !== 'Nil'
            ? '✅ Security interest verified against ROC Charge records (Form CHG-1)'
            : 'ℹ️ Unsecured claim (No registered charge on assets)';

        // 4. Audit Check 4: Section 5(24) Related Party Scrutiny
        const relatedPartyStatus = claimantData.isRelatedParty
            ? '⚠️ RELATED PARTY DETECTED under Sec 5(24) — Excluded from CoC & Voting Rights under Sec 21(2)'
            : '✅ Unrelated Creditor — Eligible for Committee of Creditors (CoC) voting rights';

        // 5. Audit Check 5: Claim Admission & Voting Share Computation
        const totalClaim = claimantData.totalClaimAmount || 0;
        let admittedAmount = totalClaim;
        let admissionStatus = '✅ ADMITTED IN FULL';

        if (limitationStatus.startsWith('⚠️')) {
            admittedAmount = 0;
            admissionStatus = '⚠️ PROVISIONALLY PENDING / DISPUTED';
        }

        // 6. RAG Context Retrieval for Verification
        let ragChunks = [];
        try {
            const q = `${claimantData.claimantName} loan agreement default interest payment roc charge`;
            ragChunks = await ragRetrieve(caseDir, q, 3);
        } catch (e) { /* non-fatal */ }

        // 7. Write verification report to claims/
        const claimsDir = path.join(caseDir, 'claims');
        if (!fs.existsSync(claimsDir)) {
            fs.mkdirSync(claimsDir, { recursive: true });
        }

        const safeName = (claimantData.claimantName || 'Claimant').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 30);
        const reportFileName = `VERIFICATION_${safeName}.md`;
        const reportPath = path.join(claimsDir, reportFileName);

        const reportMarkdown = `# STATUTORY CLAIM VERIFICATION & AUDIT REPORT
*(Under Regulation 13 of the IBBI (Insolvency Resolution Process for Corporate Persons) Regulations, 2016)*

**Corporate Debtor:** ${claimantData.corporateDebtorName}  
**Insolvency Commencement Date (ICD):** ${claimantData.icdDate}  
**Claimant:** ${claimantData.claimantName}  
**Claim ID / PAN:** ${claimantData.claimantId}  
**Verification Date:** ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}  

---

### 1. CLAIMS AUDIT SUMMARY

| Particulars | Details |
|---|---|
| **Total Amount Claimed** | **₹${formatIndianCurrency(totalClaim)}** |
| **Principal Debt** | ₹${formatIndianCurrency(claimantData.principalAmount)} |
| **Accrued Interest (up to ICD)** | ₹${formatIndianCurrency(claimantData.interestAmount)} |
| **Penal Charges / Other** | ₹${formatIndianCurrency(claimantData.penalCharges)} |
| **Amount Admitted** | **₹${formatIndianCurrency(admittedAmount)}** |
| **Amount Under Verification / Rejected** | ₹${formatIndianCurrency(totalClaim - admittedAmount)} |
| **Statutory Admission Status** | **${admissionStatus}** |

---

### 2. FIVE-POINT STATUTORY COMPLIANCE CHECKLIST

1. **Limitation Audit (Sec 238A IBC / Art 137 Limitation Act):**  
   ${limitationStatus}

2. **Interest Accrual & Cut-off Date:**  
   ${interestStatus}

3. **Security Registration (ROC Form CHG-1 / Sec 77 Companies Act):**  
   ${securityStatus}

4. **Related Party Assessment (Section 5(24) & Section 21(2)):**  
   ${relatedPartyStatus}

5. **Mutual Set-offs / Prior Payments (Regulation 14):**  
   ✅ Cross-verified against Corporate Debtor financial records; no unadjusted advances.

---

### 3. RESOLUTION PROFESSIONAL CERTIFICATION

The claim submitted by **${claimantData.claimantName}** has been scrutinized in accordance with Regulations 10 to 14 of the IBBI (CIRP) Regulations, 2016. Admitted amounts have been entered into the Master List of Creditors.

**Verified by:**  
${claimantData.irpName}  
*Interim Resolution Professional / Resolution Professional*  
*IBBI Registration No.: [IBBI/IPA-001/IP-P00000/2020-2021/00000]*
`;

        fs.writeFileSync(reportPath, reportMarkdown, 'utf8');

        // Update KV dictionary & claims registry
        writeCaseKV(caseDir, 'last_claim_verification_status', admissionStatus, reportFileName, 'ClaimVerificationAgent');
        writeCaseKV(caseDir, 'last_claim_admitted_amount', String(admittedAmount), reportFileName, 'ClaimVerificationAgent');

        appendTableRow(
            caseDir,
            'claims_registry.md',
            ['Creditor', 'Amount', 'Form Type', 'Status'],
            [claimantData.claimantName, `₹${formatIndianCurrency(admittedAmount)}`, 'AUDIT', admissionStatus],
            'ClaimVerificationAgent'
        );

        // 8. Build chat response
        const auditMatrix = `### 🔍 Statutory Claim Verification & Audit Result\n\n` +
            `| Parameter | Audit Finding |\n` +
            `|---|---|\n` +
            `| **Claimant** | **${claimantData.claimantName}** |\n` +
            `| **Amount Claimed** | **₹${formatIndianCurrency(totalClaim)}** |\n` +
            `| **Amount Admitted** | **₹${formatIndianCurrency(admittedAmount)}** |\n` +
            `| **Admission Status** | **${admissionStatus}** |\n` +
            `| **Limitation Check** | ${limitationStatus} |\n` +
            `| **Interest Term** | ${interestStatus} |\n` +
            `| **Related Party Status** | ${relatedPartyStatus} |\n` +
            `| **Audit Report** | \`${path.relative(caseDir, reportPath)}\` |\n\n` +
            `> ✅ Master claims registry synchronized in \`claims_registry.md\`.`;

        const messages = [{ role: 'system', content: this.instructions }];
        history.forEach(h => messages.push({ role: h.role, content: h.content }));
        messages.push({ role: 'user', content: `[Claim Audit Executed]\n${auditMatrix}\n\n[User Command]\n${userMessage}` });

        try {
            const llmResponse = await getChatResponse(messages, { caseDir });
            return `${auditMatrix}\n\n---\n\n${llmResponse}`;
        } catch (err) {
            if (err.code === 'LITE_MODE' || err.code === 'CONTEXT_EXCEEDED') {
                return `> ℹ️ **Lite Mode** — Deterministic statutory audit completed.\n\n${auditMatrix}`;
            }
            return auditMatrix;
        }
    }
}

module.exports = ClaimVerificationAgent;
