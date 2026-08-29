const fs = require('fs');
const path = require('path');
const { getChatResponse } = require('../../../../../lib/core/llm-client');
const { generateClaimForm, normalizeFormType } = require('../../../../../lib/agents/skills/claim-form-fill');
const { formatIndianCurrency } = require('../../../../../lib/agents/skills/claim-extract');
const { buildLiteFallback } = require('../../../../../lib/agents/skills/lite-fallback');

/**
 * Detects target claim form type and claimant name from user query
 * @param {string} userMessage
 * @returns {{ formType: string, claimantName: string }}
 */
function parseClaimIntent(userMessage = '') {
    const msg = userMessage.toLowerCase();
    let formType = 'form-c'; // Default to Form C (Financial)
    let claimantName = '';
    let principalAmount = undefined;
    let interestAmount = undefined;

    if (msg.includes('form b') || msg.includes('operational') || msg.includes('vendor') || msg.includes('supplier')) {
        formType = 'form-b';
    } else if (msg.includes('form ca') || msg.includes('class') || msg.includes('homebuyer') || msg.includes('allottee')) {
        formType = 'form-ca';
    } else if (msg.includes('form d') || msg.includes('workman') || msg.includes('employee') || msg.includes('salary')) {
        formType = 'form-d';
    } else if (msg.includes('form f') || msg.includes('statutory') || msg.includes('tax') || msg.includes('other')) {
        formType = 'form-f';
    } else if (msg.includes('form c') || msg.includes('financial') || msg.includes('bank') || msg.includes('loan')) {
        formType = 'form-c';
    }

    // Extract claimant name if mentioned: e.g. "for HDFC Bank", "claimant State Bank of India"
    const forMatch = userMessage.match(/(?:for|claimant|creditor)\s+([A-Za-z0-9\s&.,'-]+?)(?:\s+(?:under|as|with|from|having|claim|of|loan|amount)|$|\.)/i);
    if (forMatch && forMatch[1] && forMatch[1].trim().length > 2) {
        claimantName = forMatch[1].trim();
    }

    // Extract principal amount if explicitly specified in query
    const loanMatch = userMessage.match(/(?:principal|loan|debt|amount)\s*(?:of|is|:)?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{2})?)/i);
    if (loanMatch && loanMatch[1]) {
        const val = parseFloat(loanMatch[1].replace(/,/g, ''));
        if (!isNaN(val) && val > 0) principalAmount = val;
    }

    // Extract interest amount if explicitly specified in query
    const intMatch = userMessage.match(/(?:interest|accrued)\s*(?:of|is|:)?\s*(?:Rs\.?|INR|₹)?\s*([\d,]+(?:\.\d{2})?)/i);
    if (intMatch && intMatch[1]) {
        const val = parseFloat(intMatch[1].replace(/,/g, ''));
        if (!isNaN(val) && val > 0) interestAmount = val;
    }

    return { formType, claimantName, principalAmount, interestAmount };
}

class ClaimPreparationAgent {
    constructor() {
        this.name = 'ClaimPreparationAgent';
        const instructionsPath = path.join(__dirname, 'agent.md');
        if (fs.existsSync(instructionsPath)) {
            this.instructions = fs.readFileSync(instructionsPath, 'utf8');
        } else {
            this.instructions = 'You are HAYAGRIVA Claim Preparation Agent. Draft statutory IBBI proof of claim forms.';
        }
    }

    async run(caseDir, userMessage, history = []) {
        console.log(`[Claim Preparation Agent] Processing: "${userMessage}"`);

        const { formType, claimantName, principalAmount, interestAmount } = parseClaimIntent(userMessage);

        try {
            // 1. Generate the statutory claim form draft
            const overrides = {};
            if (claimantName) overrides.claimantName = claimantName;
            if (principalAmount !== undefined) overrides.principalAmount = principalAmount;
            if (interestAmount !== undefined) overrides.interestAmount = interestAmount;

            const claimResult = await generateClaimForm(caseDir, formType, overrides);

            // 2. Build structured financial summary block
            const formCode = claimResult.formId.replace('cirp-', '').toUpperCase();
            const summaryTable = `### 📋 Statutory Claim Draft Generated: ${formCode}\n\n` +
                `| Particulars | Details |\n` +
                `|---|---|\n` +
                `| **Creditor / Claimant** | **${claimResult.claimantName}** |\n` +
                `| **Statutory Form** | **IBBI ${formCode}** (${this.getStatutoryReference(formCode)}) |\n` +
                `| **Total Claim Amount** | **₹${claimResult.totalClaimFormatted}** |\n` +
                `| **Draft Location** | \`${path.relative(caseDir, claimResult.filePath)}\` |\n` +
                `| **Status** | 📝 **Draft Ready for Verification & Filing** |\n\n` +
                `> 💡 **Next Step:** You can review the draft in the Middle Panel, run \`@claim_verification verify\` to audit against CIRP records, or export to court-formatted DOCX.`;

            // 3. Compile prompt for LLM narrative response
            const promptContext = `[Claim Form Generation Succeeded]\n` +
                `- Form: ${formCode}\n` +
                `- Claimant: ${claimResult.claimantName}\n` +
                `- Total Claim: ₹${claimResult.totalClaimFormatted}\n` +
                `- File Path: ${claimResult.filePath}\n\n` +
                `[Draft Excerpt]\n${claimResult.markdown.substring(0, 800)}\n\n` +
                `[User Command]\n${userMessage}`;

            const messages = [{ role: 'system', content: this.instructions }];
            history.forEach(h => messages.push({ role: h.role, content: h.content }));
            messages.push({ role: 'user', content: promptContext });

            try {
                const llmResponse = await getChatResponse(messages, { caseDir });
                return `${summaryTable}\n\n---\n\n${llmResponse}`;
            } catch (llmErr) {
                if (llmErr.code === 'LITE_MODE' || llmErr.code === 'CONTEXT_EXCEEDED') {
                    return `> ℹ️ **Lite Mode** — Generated statutory draft without cloud LLM narrative.\n\n${summaryTable}`;
                }
                return summaryTable;
            }

        } catch (e) {
            console.error('[Claim Preparation Agent] Generation error:', e.message);
            return `❌ **Claim Preparation Failed:** ${e.message}\n\n` +
                `Please verify that claimant details and financial figures exist in \`case_facts.md\` or uploaded documents.`;
        }
    }

    getStatutoryReference(formCode) {
        switch (formCode) {
            case 'FORM-B': return 'Operational Creditors — CIRP Regulation 7';
            case 'FORM-C': return 'Financial Creditors — CIRP Regulation 8';
            case 'FORM-CA': return 'Class Creditors / Real Estate Allottees — CIRP Regulation 8A';
            case 'FORM-D': return 'Workmen & Employees — CIRP Regulation 9';
            case 'FORM-F': return 'Other Creditors — CIRP Regulation 9A';
            default: return 'IBBI CIRP Regulations 2016';
        }
    }
}

module.exports = ClaimPreparationAgent;
