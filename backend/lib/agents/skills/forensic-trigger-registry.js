'use strict';

/**
 * Forensic Trigger Registry (Hayagriva Harness)
 * ---------------------------------------------
 * Deterministic mapping engine connecting atomized KV facts in case_kv_dictionary.json
 * to LEXAI micro-forensic services (Port 4000).
 * 
 * Provides:
 * 1. Pattern & semantic classifiers for atomized facts (DIN, CIN, PAN, Dates, Litigants).
 * 2. Statutory rationale and IBC clause associations.
 * 3. Exact micro MCP tool names, parameter payloads, and billable rates.
 */

const TRIGGER_RULES = [
    {
        id: 'DIN_COOLING_OFF',
        category: 'DIRECTOR_GOVERNANCE',
        tool: 'lexai_verify_director_cooling_off',
        clause: 'IBC Section 29A(e) & MCA Section 164(2)',
        rateInr: 75.00,
        description: 'Verify 2-year cooling-off period expiration for director disqualification',
        matcher: (key, val, allKV) => {
            const strVal = String(val || '').trim();
            const keyLower = String(key || '').toLowerCase();
            const isDinPattern = /^\d{8}$/.test(strVal);
            const isDinKey = keyLower.includes('din') || keyLower.includes('director_id');
            if (isDinPattern || (isDinKey && /\d{8}/.test(strVal))) {
                const match = strVal.match(/\d{8}/);
                return {
                    matched: true,
                    targetIdentifier: match ? match[0] : strVal,
                    args: { din: match ? match[0] : strVal }
                };
            }
            return { matched: false };
        }
    },
    {
        id: 'CIN_ENTITY_MASTER',
        category: 'CORPORATE_IDENTITY',
        tool: 'lexai_resolve_entity_master',
        clause: 'Corporate Identity & Active RoC Status Check',
        rateInr: 50.00,
        description: 'Resolve official RoC master details, paid-up capital, and corporate status',
        matcher: (key, val, allKV) => {
            const strVal = String(val || '').trim();
            const cinMatch = strVal.match(/[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}/i);
            if (cinMatch) {
                return {
                    matched: true,
                    targetIdentifier: cinMatch[0].toUpperCase(),
                    args: { cin: cinMatch[0].toUpperCase() }
                };
            }
            return { matched: false };
        }
    },
    {
        id: 'CIN_VANISHING_SHELL_ALERT',
        category: 'FORENSIC_ALERT',
        tool: 'lexai_detect_vanishing_or_shell_alert',
        clause: 'MCA Vanishing & Debarred Shell Company Screening',
        rateInr: 100.00,
        description: 'Scan corporate entity against MCA vanishing alerts and shell gazettes',
        matcher: (key, val, allKV) => {
            const strVal = String(val || '').trim();
            const cinMatch = strVal.match(/[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}/i);
            if (cinMatch) {
                return {
                    matched: true,
                    targetIdentifier: cinMatch[0].toUpperCase(),
                    args: { cin: cinMatch[0].toUpperCase() }
                };
            }
            return { matched: false };
        }
    },
    {
        id: 'PAN_CIBIL_WILFUL_DEFAULTER',
        category: 'CREDIT_BANKING',
        tool: 'lexai_screen_cibil_wilful_defaulter',
        clause: 'IBC Section 29A(b) - RBI Wilful Defaulter & CIBIL Suit-Filed',
        rateInr: 75.00,
        description: 'Screen PAN and entity against quarterly RBI Wilful Defaulters list (25L+ & 1Cr+)',
        matcher: (key, val, allKV) => {
            const strVal = String(val || '').trim();
            const panMatch = strVal.match(/[A-Z]{5}\d{4}[A-Z]/i);
            const keyLower = String(key || '').toLowerCase();
            const isPanKey = keyLower.includes('pan') || keyLower.includes('borrower') || keyLower.includes('guarantor');
            if (panMatch || (isPanKey && /[A-Z]{5}\d{4}[A-Z]/i.test(strVal))) {
                const actualPan = panMatch ? panMatch[0].toUpperCase() : strVal.toUpperCase();
                return {
                    matched: true,
                    targetIdentifier: actualPan,
                    args: { pan: actualPan, identifier: actualPan }
                };
            }
            return { matched: false };
        }
    },
    {
        id: 'PUFE_LOOKBACK_AUDIT',
        category: 'AVOIDANCE_PUFE',
        tool: 'lexai_screen_pufe_lookback_window',
        clause: 'IBC Section 43/45/50 (1-Year Third-Party vs 2-Year Related Party)',
        rateInr: 150.00,
        description: 'Mathematical audit of transaction date relative to CIRP admission threshold',
        matcher: (key, val, allKV) => {
            const keyLower = String(key || '').toLowerCase();
            const isTxDateKey = keyLower.includes('transaction_date') || keyLower.includes('transfer_date') || keyLower.includes('debit_date') || keyLower.includes('voucher_date');
            const dateMatch = String(val || '').match(/\b(\d{4}-\d{2}-\d{2})\b/);
            
            if (isTxDateKey && dateMatch) {
                let admissionDate = null;
                for (const k in allKV) {
                    const kl = k.toLowerCase();
                    if (kl.includes('admission') || kl.includes('commencement') || kl.includes('cirp_date')) {
                        const m = String(allKV[k]?.value || allKV[k] || '').match(/\b(\d{4}-\d{2}-\d{2})\b/);
                        if (m) {
                            admissionDate = m[1];
                            break;
                        }
                    }
                }
                if (admissionDate) {
                    return {
                        matched: true,
                        targetIdentifier: 'Tx: ' + dateMatch[1] + ' | CIRP: ' + admissionDate,
                        args: {
                            transaction_date: dateMatch[1],
                            cirp_commencement_date: admissionDate,
                            is_related_party: keyLower.includes('related') || keyLower.includes('promoter')
                        }
                    };
                }
            }
            return { matched: false };
        }
    },
    {
        id: 'RELATED_PARTY_VOTING_DISQUALIFICATION',
        category: 'RELATED_PARTY',
        tool: 'lexai_probe_section_5_24_relationship',
        clause: 'IBC Section 5(24) read with Section 21(2) First Proviso',
        rateInr: 150.00,
        description: 'Assess CoC voting disqualification for connected entities and associates',
        matcher: (key, val, allKV) => {
            const keyLower = String(key || '').toLowerCase();
            const isRpKey = keyLower.includes('related_party') || keyLower.includes('associate') || keyLower.includes('subsidiary') || keyLower.includes('holding_company');
            if (isRpKey && val) {
                const targetName = typeof val === 'object' ? (val.name || val.entity || JSON.stringify(val)) : String(val);
                return {
                    matched: true,
                    targetIdentifier: targetName,
                    args: { entity_name: targetName, name: targetName }
                };
            }
            return { matched: false };
        }
    },
    {
        id: 'JUDICIAL_ROLE_DISCRIMINATION',
        category: 'JUDICIAL_ECOURTS',
        tool: 'lexai_filter_adverse_vs_creditor_role',
        clause: 'IBC Section 29A(d)/(h) - Role Discrimination (Petitioner vs Accused)',
        rateInr: 100.00,
        description: 'Disambiguate court matches to clear financial creditors from defaulting respondent taint',
        matcher: (key, val, allKV) => {
            const keyLower = String(key || '').toLowerCase();
            const isLitigationKey = keyLower.includes('litigation') || keyLower.includes('case_party') || keyLower.includes('court_case');
            if (isLitigationKey && val) {
                return {
                    matched: true,
                    targetIdentifier: String(val),
                    args: { party_name: String(val) }
                };
            }
            return { matched: false };
        }
    },
    {
        id: 'GLOBAL_SANCTIONS_SCREENING',
        category: 'SANCTIONS',
        tool: 'lexai_screen_global_sanctions',
        clause: 'IBC Section 29A(i) - International Sanctions & UN/OFAC/EU Lists',
        rateInr: 75.00,
        description: 'Screen foreign bidders, offshore promoters, and beneficial owners',
        matcher: (key, val, allKV) => {
            const keyLower = String(key || '').toLowerCase();
            const isForeignOrPraKey = keyLower.includes('foreign') || keyLower.includes('offshore') || keyLower.includes('pra') || keyLower.includes('resolution_applicant');
            if (isForeignOrPraKey && val && typeof val === 'string' && val.length > 3) {
                return {
                    matched: true,
                    targetIdentifier: val,
                    args: { entity_name: val, name: val }
                };
            }
            return { matched: false };
        }
    },
    {
        id: 'CARTEL_COLLUSION_DETECTION',
        category: 'ANTI_CARTEL',
        tool: 'lexai_detect_cartel_collusion',
        clause: 'CIRP Regulation 39(1)(b) - Anti-Cartel & Common Controller Checks',
        rateInr: 200.00,
        description: 'Cross-match competing resolution applicants for shared DINs, auditors, or beneficial owners',
        matcher: (key, val, allKV) => {
            const keyLower = String(key || '').toLowerCase();
            if (keyLower.includes('bidders') || keyLower.includes('pra_list') || keyLower.includes('consortium_members')) {
                return {
                    matched: true,
                    targetIdentifier: 'PRA Consortium / Competing Bidders',
                    args: { bidders: Array.isArray(val) ? val : [val] }
                };
            }
            return { matched: false };
        }
    }
];

/**
 * Evaluates an atomized fact against all forensic trigger rules.
 * @param {string} key Key name from case_kv_dictionary.json
 * @param {any} val Fact value or entry object
 * @param {Object} allKV Full case_kv_dictionary.json for cross-variable context
 * @returns {Array} List of matched statutory recommendations
 */
function evaluateFactTriggers(key, val, allKV = {}) {
    const rawValue = (val && typeof val === 'object' && val.value !== undefined) ? val.value : val;
    const recommendations = [];

    for (const rule of TRIGGER_RULES) {
        try {
            const result = rule.matcher(key, rawValue, allKV);
            if (result && result.matched) {
                recommendations.push({
                    ruleId: rule.id,
                    category: rule.category,
                    tool: rule.tool,
                    clause: rule.clause,
                    rateInr: rule.rateInr,
                    description: rule.description,
                    targetIdentifier: result.targetIdentifier || String(rawValue),
                    args: result.args || {},
                    suggestedAt: new Date().toISOString()
                });
            }
        } catch (_) {}
    }

    return recommendations;
}

module.exports = {
    TRIGGER_RULES,
    evaluateFactTriggers
};
