'use strict';

/**
 * 100 Golden Benchmark Scenarios: Forensic Correlation Evaluation Suite
 * --------------------------------------------------------------------
 * Evaluates whether Hayagriva's forensic fact correlation engine correctly
 * identifies the statutory risk and maps to the appropriate LEXAI micro-service.
 * 
 * Target Accuracy: >= 98%
 */

const { evaluateFactTriggers } = require('../../lib/agents/skills/forensic-trigger-registry');

// Generate 100 distinct IBC matter scenarios across 10 statutory categories
const SCENARIOS = [];

// 1. Category: Corporate Debtor Identity & Shell Alerts (S01 - S10)
const sampleCins = [
    'U74899DL2018PTC333241', 'L17110MH1973PLC019786', 'U45200TG2008PTC057123',
    'U24230GJ2005PLC046890', 'L65191TN1994PLC029000', 'U72200KA2015PTC082341',
    'U51909WB2010PTC145678', 'L27100UP1985PLC007123', 'U01111HR2019PTC078901',
    'U63090MH2002PTC135790'
];
sampleCins.forEach((cin, i) => {
    SCENARIOS.push({
        id: `S${String(i + 1).padStart(2, '0')}`,
        category: 'CORPORATE_IDENTITY_SHELL',
        docType: 'Form A / Public Announcement',
        factKey: `corporate_debtor_cin_${i + 1}`,
        factValue: cin,
        expectedTools: ['lexai_resolve_entity_master', 'lexai_detect_vanishing_or_shell_alert'],
        statutoryRatio: 'Corporate Debtor identity resolution and shell alert screening'
    });
});

// 2. Category: Director MCA Disqualification & 2-Yr Cooling-Off (S11 - S20)
const sampleDins = [
    '00123456', '01293847', '07894561', '02384756', '09182736',
    '03456789', '05678901', '08901234', '04567890', '06789012'
];
sampleDins.forEach((din, i) => {
    SCENARIOS.push({
        id: `S${String(i + 11).padStart(2, '0')}`,
        category: 'DIRECTOR_GOVERNANCE',
        docType: 'RoC Form DIR-12 / Director Disclosures',
        factKey: `director_din_${i + 1}`,
        factValue: din,
        expectedTools: ['lexai_verify_director_cooling_off'],
        statutoryRatio: 'IBC Section 29A(e) 2-Year Cooling-Off threshold'
    });
});

// 3. Category: CIBIL Wilful Defaulter & Suit-Filed Accounts (S21 - S30)
const samplePans = [
    'AAACB1234F', 'BLMPG9876K', 'CRCPD4567L', 'DELPR3456M', 'EGKFS7890N',
    'FKJHT1234P', 'GMHNB5678Q', 'HNLKP9012R', 'JPQRS3456S', 'KRSTV7890T'
];
samplePans.forEach((pan, i) => {
    SCENARIOS.push({
        id: `S${String(i + 21).padStart(2, '0')}`,
        category: 'CREDIT_BANKING',
        docType: 'Form C / Bank Sanction Letter / Guarantee Invocation',
        factKey: `borrower_guarantor_pan_${i + 1}`,
        factValue: pan,
        expectedTools: ['lexai_screen_cibil_wilful_defaulter'],
        statutoryRatio: 'IBC Section 29A(b) RBI Wilful Defaulters & CIBIL Suits'
    });
});

// 4. Category: Bank Statement PUFE Lookback Windows (S31 - S40)
const sampleTxDates = [
    '2023-01-15', '2023-03-22', '2023-06-10', '2023-08-05', '2023-11-18',
    '2022-12-01', '2023-04-14', '2023-09-30', '2023-10-12', '2023-12-28'
];
sampleTxDates.forEach((txDate, i) => {
    SCENARIOS.push({
        id: `S${String(i + 31).padStart(2, '0')}`,
        category: 'AVOIDANCE_PUFE',
        docType: 'Bank Statement / RTGS Ledger / Tally Cash Flow',
        factKey: `transaction_date_voucher_${i + 1}`,
        factValue: txDate,
        contextKV: { 'cirp_admission_order_date': { value: '2024-01-15' } },
        expectedTools: ['lexai_screen_pufe_lookback_window'],
        statutoryRatio: 'IBC Section 43/45/50 1-Yr vs 2-Yr Lookback audit'
    });
});

// 5. Category: Section 5(24) Related Parties & CoC Disqualification (S41 - S50)
const sampleRelatedParties = [
    'Apogee Holdings Private Limited', 'Apex Real Estate Ventures LLP', 'Sunbeam Overseas FZE',
    'Zenith Infrastructure Associate', 'Bluecrest Logistics Subsidiary', 'Orion Power Promoter Group',
    'Titan Steels Sister Concern', 'Vanguard Finvest Holding Co', 'Omega Polymers KMP Entity',
    'Jupiter Global Trading Associate'
];
sampleRelatedParties.forEach((rp, i) => {
    SCENARIOS.push({
        id: `S${String(i + 41).padStart(2, '0')}`,
        category: 'RELATED_PARTY',
        docType: 'Audited Balance Sheet AS-18 Notes / Form CA',
        factKey: `related_party_associate_${i + 1}`,
        factValue: rp,
        expectedTools: ['lexai_probe_section_5_24_relationship'],
        statutoryRatio: 'IBC Section 5(24) connection & Section 21(2) voting ban'
    });
});

// 6. Category: Judicial Litigation Probing (S51 - S60)
const sampleLitigants = [
    'State Bank of India vs Apogee Infra', 'HDFC Bank Ltd vs Mittal Promoters', 'ICICI Bank vs Target Corp',
    'Punjab National Bank vs CD Directors', 'Bank of Baroda vs CD Guarantor', 'Axis Bank vs CD Logistics',
    'Canara Bank vs Industrial CD', 'Union Bank of India vs Commercial Borrower',
    'Kotak Mahindra Bank vs CD Founders', 'IndusInd Bank vs CIRP Respondent'
];
sampleLitigants.forEach((litigant, i) => {
    SCENARIOS.push({
        id: `S${String(i + 51).padStart(2, '0')}`,
        category: 'JUDICIAL_LITIGATION',
        docType: 'Section 7/9 CIRP Application / NCLT Case Docket',
        factKey: `litigation_case_party_${i + 1}`,
        factValue: litigant,
        expectedTools: ['lexai_filter_adverse_vs_creditor_role'],
        statutoryRatio: 'Judicial role discrimination (petitioner vs accused)'
    });
});

// 7. Category: Court Party Role Discrimination (S61 - S70)
sampleLitigants.forEach((litigant, i) => {
    SCENARIOS.push({
        id: `S${String(i + 61).padStart(2, '0')}`,
        category: 'JUDICIAL_ROLE_DISCRIMINATION',
        docType: 'High Court Writ Petition / SARFAESI DRT Notice',
        factKey: `court_case_respondent_${i + 1}`,
        factValue: `${litigant} (High Court of Delhi)`,
        expectedTools: ['lexai_filter_adverse_vs_creditor_role'],
        statutoryRatio: 'Clear recovering creditor from defaulting respondent taint'
    });
});

// 8. Category: Global Sanctions & Foreign Debarments (S71 - S80)
const sampleForeignBidders = [
    'Al-Maktoum Mining Consortium FZE (Dubai)', 'Evergreen Petrochemicals Pte Ltd (Singapore)',
    'Volga Metals International LLC (Cyprus)', 'Global Strategic Energy Holdings (London)',
    'Helios International Investments (Mauritius)', 'Trans-Pacific Resources SA (Geneva)',
    'Balkan Steel Works GmbH (Germany)', 'Orient Silk Road Trading (Hong Kong)',
    'Nordic Maritime Assets BV (Netherlands)', 'Caspian Mineral Resources Ltd (BVI)'
];
sampleForeignBidders.forEach((bidder, i) => {
    SCENARIOS.push({
        id: `S${String(i + 71).padStart(2, '0')}`,
        category: 'SANCTIONS',
        docType: 'Expression of Interest (EOI) / Form G Consortium Bid',
        factKey: `foreign_pra_applicant_${i + 1}`,
        factValue: bidder,
        expectedTools: ['lexai_screen_global_sanctions'],
        statutoryRatio: 'IBC Section 29A(i) OFAC / UK / EU Sanctions verification'
    });
});

// 9. Category: PRA Anti-Cartel & Syndicate Collusion (S81 - S90)
const sampleBidderSets = [
    ['Apogee Steels Ltd', 'Zenith Infra Pvt Ltd'],
    ['Consortium Alpha', 'Consortium Beta'],
    ['Sunrise Metals LLC', 'Sunrise Alloys Ltd'],
    ['Titan Heavy Engineering', 'Titan Power Systems'],
    ['Apex Resolution Applicant A', 'Apex Resolution Applicant B'],
    ['Bidder Blue Corp', 'Bidder Green Energy'],
    ['Pacific Holdings', 'Atlantic Investments'],
    ['National Industrial Bidders', 'Continental Infra Corp'],
    ['Pioneer Projects Ltd', 'Pioneer Logistics FZE'],
    ['Vector Restructuring LLP', 'Vector Asset Management Ltd']
];
sampleBidderSets.forEach((set, i) => {
    SCENARIOS.push({
        id: `S${String(i + 81).padStart(2, '0')}`,
        category: 'ANTI_CARTEL',
        docType: 'Resolution Plan Submission / Form H Schedule',
        factKey: `competing_bidders_pra_list_${i + 1}`,
        factValue: set,
        expectedTools: ['lexai_detect_cartel_collusion'],
        statutoryRatio: 'CIRP Reg 39(1)(b) Anti-Cartel cross-director check'
    });
});

// 10. Category: Compound Multi-Document Cases (S91 - S100)
const compoundCases = [
    { key: 'director_din_primary', val: '00234567', tools: ['lexai_verify_director_cooling_off'] },
    { key: 'guarantor_borrower_pan', val: 'ZZZPA9999K', tools: ['lexai_screen_cibil_wilful_defaulter'] },
    { key: 'corporate_debtor_cin_ref', val: 'L12345MH1990PLC056789', tools: ['lexai_resolve_entity_master', 'lexai_detect_vanishing_or_shell_alert'] },
    { key: 'related_party_associate_firm', val: 'KMP Associate Exports Pvt Ltd', tools: ['lexai_probe_section_5_24_relationship'] },
    { key: 'foreign_resolution_applicant_lead', val: 'Gulf Petrochem Assets FZE', tools: ['lexai_screen_global_sanctions'] },
    { key: 'transaction_date_contra_sweep', val: '2023-07-20', context: { 'cirp_commencement_date': { value: '2024-01-15' } }, tools: ['lexai_screen_pufe_lookback_window'] },
    { key: 'litigation_nclt_proceeding', val: 'SBI vs Apogee Enterprises Ltd', tools: ['lexai_filter_adverse_vs_creditor_role'] },
    { key: 'competing_bidders_resolution_plans', val: ['Bidder One Ltd', 'Bidder Two LLP'], tools: ['lexai_detect_cartel_collusion'] },
    { key: 'pra_director_din_secondary', val: '08123456', tools: ['lexai_verify_director_cooling_off'] },
    { key: 'debtor_holding_company_cin', val: 'U65990DL2012PTC240123', tools: ['lexai_resolve_entity_master', 'lexai_detect_vanishing_or_shell_alert'] }
];
compoundCases.forEach((c, i) => {
    SCENARIOS.push({
        id: `S${String(i + 91).padStart(2, '0')}`,
        category: 'COMPOUND_MULTI_DOC',
        docType: 'Complex CIRP Claim & Plan Compilation',
        factKey: c.key,
        factValue: c.val,
        contextKV: c.context || {},
        expectedTools: c.tools,
        statutoryRatio: 'Multi-document cross-register forensic validation'
    });
});

// Run Evaluation Suite
function runForensicCorrelationEval() {
    console.log('========================================================================');
    console.log('🏛️  HAYAGRIVA COORDINATOR: 100 GOLDEN BENCHMARK EVALUATION SUITE');
    console.log('    Testing Fact Atomization -> Forensic Trigger Correlation');
    console.log('========================================================================\n');

    let passedCount = 0;
    let failedCount = 0;
    const failures = [];

    for (const s of SCENARIOS) {
        const triggers = evaluateFactTriggers(s.factKey, s.factValue, s.contextKV || {});
        const matchedTools = triggers.map(t => t.tool);

        // Check if all expected tools are present
        const hasAllExpected = s.expectedTools.every(et => matchedTools.includes(et));

        if (hasAllExpected) {
            passedCount++;
        } else {
            failedCount++;
            failures.push({
                scenario: s.id,
                category: s.category,
                factKey: s.factKey,
                factValue: s.factValue,
                expected: s.expectedTools,
                got: matchedTools
            });
        }
    }

    const accuracy = ((passedCount / SCENARIOS.length) * 100).toFixed(2);

    console.log(`Total Scenarios Evaluated : ${SCENARIOS.length}`);
    console.log(`Passed                    : ${passedCount}`);
    console.log(`Failed                    : ${failedCount}`);
    console.log(`Evaluation Accuracy       : ${accuracy}%`);
    console.log('------------------------------------------------------------------------');

    if (failedCount > 0) {
        console.error('⚠️ Failures Encountered:');
        failures.forEach(f => {
            console.error(`  [${f.scenario}] ${f.category} - Key: ${f.factKey}`);
            console.error(`      Expected: ${JSON.stringify(f.expected)}`);
            console.error(`      Got:      ${JSON.stringify(f.got)}`);
        });
        process.exit(1);
    } else {
        console.log('✅ BENCHMARK PASSED: 100% Correlation Accuracy Across All 10 Categories!');
    }
}

runForensicCorrelationEval();
