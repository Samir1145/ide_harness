/**
 * Skill: form-fill.js
 * Populates IBBI/MCA form fields from the case KV dictionary + RAG retrieval.
 * Knows the field mapping schemas for all supported forms.
 * Used by @forms agent.
 */

const { readAllKV, writeCaseKV } = require('./kv-write');
const { ragRetrieve } = require('./rag-retrieve');
const { getChatResponse } = require('../../core/llm-client');

// ─── Form field schemas ───────────────────────────────────────────────────────
// Maps form fields → KV keys or RAG queries used to find the value

const FORM_SCHEMAS = {
    'aoc-4': {
        label: 'AOC-4 (Annual Return Financial Statement)',
        fields: {
            corporate_debtor_name:    { kv: 'company_name',            rag: 'company name corporate debtor' },
            cin:                      { kv: 'cin',                      rag: 'CIN corporate identification number' },
            date_of_incorporation:    { kv: 'date_of_incorporation',    rag: 'date of incorporation registered' },
            registered_office:        { kv: 'registered_office',        rag: 'registered office address' },
            authorized_capital:       { kv: 'authorized_capital',       rag: 'authorized share capital' },
            paid_up_capital:          { kv: 'paid_up_capital',          rag: 'paid up capital shares' },
            total_revenue:            { kv: 'total_revenue',            rag: 'total revenue turnover annual' },
            net_profit:               { kv: 'net_profit',               rag: 'net profit loss after tax' },
            directors:                { kv: 'directors',                rag: 'board of directors DIN' },
        }
    },
    'ibbi-form-a': {
        label: 'Form A — Financial Creditor Claim (IBBI Reg 12)',
        fields: {
            creditor_name:            { kv: 'creditor_name',            rag: 'financial creditor bank name lender' },
            creditor_address:         { kv: 'creditor_address',         rag: 'creditor address registered office' },
            corporate_debtor_name:    { kv: 'company_name',            rag: 'corporate debtor company name' },
            cin:                      { kv: 'cin',                      rag: 'CIN corporate identification number' },
            total_claim_amount:       { kv: 'total_claim_amount',       rag: 'total outstanding dues amount claimed' },
            principal_amount:         { kv: 'principal_amount',         rag: 'principal loan amount sanctioned disbursed' },
            interest_amount:          { kv: 'interest_amount',          rag: 'interest accrued outstanding' },
            date_of_default:          { kv: 'date_of_default',          rag: 'date of default first default payment missed' },
            nature_of_credit_facility: { kv: 'credit_facility_type',   rag: 'nature of credit facility term loan OD CC' },
            security_details:         { kv: 'security_details',         rag: 'security mortgage charge registered' },
            bank_account_details:     { kv: 'bank_account',             rag: 'bank account number IFSC' },
        }
    },
    'ibbi-form-b': {
        label: 'Form B — Operational Creditor Claim (IBBI Reg 12)',
        fields: {
            creditor_name:            { kv: 'creditor_name',            rag: 'operational creditor supplier vendor name' },
            corporate_debtor_name:    { kv: 'company_name',            rag: 'corporate debtor company name' },
            total_claim_amount:       { kv: 'total_claim_amount',       rag: 'total outstanding invoice amount claimed' },
            invoice_details:          { kv: 'invoice_details',          rag: 'invoice number date goods services supplied' },
            date_of_default:          { kv: 'date_of_default',          rag: 'date of default payment due overdue' },
            demand_notice_date:       { kv: 'demand_notice_date',       rag: 'demand notice sent section 8 notice date' },
            dispute_details:          { kv: 'dispute_details',          rag: 'dispute pending arbitration court' },
        }
    },
    'ibbi-form-f': {
        label: 'Form F — Workman/Employee Claim (IBBI Reg 12)',
        fields: {
            employee_name:            { kv: 'employee_name',            rag: 'employee workman name designation' },
            corporate_debtor_name:    { kv: 'company_name',            rag: 'corporate debtor company employer name' },
            employment_period:        { kv: 'employment_period',        rag: 'employment period from to date joined' },
            salary_claimed:           { kv: 'salary_claimed',           rag: 'salary arrears dues gratuity provident fund' },
            date_of_default:          { kv: 'date_of_default',          rag: 'date last salary paid payment default' },
        }
    },
    'ibbi-h': {
        label: 'Form H — Resolution Plan Compliance (IBBI Reg 39)',
        fields: {
            resolution_applicant:     { kv: 'resolution_applicant',     rag: 'resolution applicant name eligibility' },
            plan_value:               { kv: 'plan_value',               rag: 'resolution plan total value consideration' },
            upfront_payment:          { kv: 'upfront_payment',          rag: 'upfront payment financial creditors operational' },
            implementation_timeline:  { kv: 'implementation_timeline',  rag: 'implementation timeline plan period' },
            sec29a_compliance:        { kv: 'sec29a_compliance',        rag: 'section 29A eligibility disqualification' },
        }
    },
};

/**
 * Fills a form by pulling values from KV dictionary, then RAG for gaps.
 * @param {string} caseDir
 * @param {string} formId  - e.g. 'ibbi-form-a'
 * @returns {Promise<{ formId, label, fields: Object, unfilled: string[] }>}
 */
async function fillForm(caseDir, formId) {
    const schema = FORM_SCHEMAS[formId];
    if (!schema) {
        const available = Object.keys(FORM_SCHEMAS).join(', ');
        throw new Error(`Unknown form "${formId}". Available: ${available}`);
    }

    const kv = readAllKV(caseDir);
    const result = {};
    const unfilled = [];

    for (const [fieldName, fieldDef] of Object.entries(schema.fields)) {
        let value = null;
        let source = null;

        // Step 1: KV dictionary lookup (instant)
        if (kv[fieldDef.kv]) {
            value = kv[fieldDef.kv];
            source = 'kv_dictionary';
        }

        // Step 2: RAG retrieval + LLM extraction (for unfilled fields)
        if (!value && fieldDef.rag) {
            const chunks = await ragRetrieve(caseDir, fieldDef.rag, 2);
            if (chunks.length > 0) {
                const context = chunks.map(c => c.content).join('\n\n');
                try {
                    const prompt = `From this legal document excerpt, extract the value for: "${fieldName.replace(/_/g, ' ')}".
Return ONLY the value as a short string. If not clearly found, return null.

Excerpt:
"""
${context.substring(0, 700)}
"""`;
                    const raw = await getChatResponse([
                        { role: 'system', content: 'Extract the requested field value. Return only the value or null.' },
                        { role: 'user', content: prompt }
                    ], { caseDir });
                    const cleaned = (raw || '').trim().replace(/^["']|["']$/g, '');
                    if (cleaned && cleaned.toLowerCase() !== 'null' && cleaned.length < 300) {
                        value = cleaned;
                        source = chunks[0].docName;
                        // Write discovered value back to KV
                        writeCaseKV(caseDir, fieldDef.kv, value, source, 'FormsAgent');
                    }
                } catch (e) { /* non-fatal */ }
            }
        }

        if (value) {
            result[fieldName] = { value, source, filled: true };
        } else {
            result[fieldName] = { value: null, source: null, filled: false };
            unfilled.push(fieldName);
        }
    }

    return { formId, label: schema.label, fields: result, unfilled };
}

/**
 * Returns list of available form IDs and their labels.
 */
function listForms() {
    return Object.entries(FORM_SCHEMAS).map(([id, s]) => ({ id, label: s.label }));
}

/**
 * Formats a filled form as a markdown table for LLM prompt injection.
 * @param {{ formId, label, fields, unfilled }} formData
 * @returns {string}
 */
function formatFormBlock(formData) {
    let block = `[Form: ${formData.label}]\n`;
    block += `| Field | Value | Source |\n|---|---|---|\n`;
    for (const [name, data] of Object.entries(formData.fields)) {
        const val = data.filled ? data.value : '⚠️ NOT FOUND';
        const src = data.source || '—';
        block += `| ${name} | ${val} | ${src} |\n`;
    }
    if (formData.unfilled.length > 0) {
        block += `\n⚠️ Unfilled fields requiring manual input: ${formData.unfilled.join(', ')}\n`;
    }
    return block;
}

module.exports = { fillForm, listForms, formatFormBlock, FORM_SCHEMAS };
