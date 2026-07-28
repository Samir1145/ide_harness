const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');
const SOURCE_DIR = '/Users/atulgrover/Documents/zzz IBC formats/conversions';

const FORMS_DIR = path.join(REPO_ROOT, 'hayagriva', 'lib', 'pipeline', 'forms', 'skeletons', 'ibc_forms');
const MCA_FORMS_DIR = path.join(REPO_ROOT, 'hayagriva', 'lib', 'pipeline', 'forms', 'skeletons', 'mca_forms');
const PRECEDENTS_DIR = path.join(REPO_ROOT, 'hayagriva', 'lib', 'pipeline', 'forms', 'skeletons', 'ibc_precedents');
const OVERLAYS_DIR = path.join(REPO_ROOT, 'hayagriva', 'vault', 'user_overlays');

// Ensure target directories exist
fs.mkdirSync(FORMS_DIR, { recursive: true });
fs.mkdirSync(MCA_FORMS_DIR, { recursive: true });
fs.mkdirSync(PRECEDENTS_DIR, { recursive: true });
fs.mkdirSync(OVERLAYS_DIR, { recursive: true });


console.log('Ingesting IBC Formats & Knowledge into HAYAGRIVA...');

// Helper: Convert [bracketed placeholders] to {{ UPPER_CASE_PLACEHOLDERS }}
function convertPlaceholders(text) {
    return text.replace(/\[([A-Z0-9_\s\-\/]{3,60})\]/g, (match, inner) => {
        const cleaned = inner.trim().toUpperCase().replace(/[\s\-\/]+/g, '_');
        return `{{ ${cleaned} }}`;
    });
}

// 1. Process Forms Handbook MASTER
const handbookPath = path.join(SOURCE_DIR, 'IBC_2026_Forms_Handbook_MASTER_AllForms_20260707_0730_IST.md');
if (fs.existsSync(handbookPath)) {
    console.log('[Ingest] Processing IBBI Forms Master Handbook...');
    const raw = fs.readFileSync(handbookPath, 'utf8');
    const processed = convertPlaceholders(raw);

    // Save full handbook
    fs.writeFileSync(path.join(FORMS_DIR, 'ibc-2026-forms-master-handbook.md'), processed, 'utf8');

    // Split handbook into individual volume files
    const volumes = processed.split(/(?=__VOLUME\s+\d+__)/i);
    volumes.forEach((vol, idx) => {
        if (!vol.trim()) return;
        const volNum = idx > 0 ? idx : '1';
        const volName = `ibc-2026-volume-${volNum}-forms.md`;
        fs.writeFileSync(path.join(FORMS_DIR, volName), vol.trim(), 'utf8');
    });
}

// 2. Map specific source files to destination folders and clean slug names
const fileMappings = [
    // --- FORMS ---
    { src: 'IBC_2026_Forms_Filing_Checklist_20260707_0730_IST.md', dest: FORMS_DIR, name: 'ibc-2026-forms-checklist.md' },
    { src: 'application-form-annual-management-audit-may26.md', dest: FORMS_DIR, name: 'annual-management-audit-form.md' },
    { src: 'VL_FormH_ComplianceCert_and_FormJ_Termination.md', dest: FORMS_DIR, name: 'vl-form-h-and-j.md' },

    // --- DRAFTING PRECEDENTS & APPLICATIONS ---
    { src: '20260620_0344_IST_Letter_of_Appointment_Voluntary_Liquidator.md', dest: PRECEDENTS_DIR, name: 'letter-appointment-voluntary-liquidator.md' },
    { src: '20260620_0357_IST_Voluntary_Liquidation_Commencement_Pack.md', dest: PRECEDENTS_DIR, name: 'voluntary-liquidation-commencement-pack.md' },
    { src: '20260620_0401_IST_Creditors_Approval_Voluntary_Liquidation.md', dest: PRECEDENTS_DIR, name: 'creditors-approval-voluntary-liquidation.md' },
    { src: '20260621_0603_IST_Sec_99_Report_Anonymised_Blank_Format.md', dest: PRECEDENTS_DIR, name: 'sec99-report-blank.md' },
    { src: '20260621_0611_IST_Sec_99_Report_Sec94_Debtor_Anonymised_Format.md', dest: PRECEDENTS_DIR, name: 'sec99-report-sec94-debtor.md' },
    { src: '20260621_0621_IST_Sec_99_Report_Sec95_Creditor_Anonymised_Format.md', dest: PRECEDENTS_DIR, name: 'sec99-report-sec95-creditor.md' },
    { src: '20260622_1846_IST_PG_PartIII_Bankruptcy_Precedents.md', dest: PRECEDENTS_DIR, name: 'pg-part3-bankruptcy-precedents.md' },
    { src: '20260622_1846_IST_PG_PartIII_PostAdmission_Precedents.md', dest: PRECEDENTS_DIR, name: 'pg-part3-postadmission-precedents.md' },
    { src: '20260622_1846_IST_PG_PartIII_PreAdmission_Precedents.md', dest: PRECEDENTS_DIR, name: 'pg-part3-preadmission-precedents.md' },
    { src: '20260623_0818_IST_Index_RP_Reports_No_Format_CIRP.md', dest: PRECEDENTS_DIR, name: 'rp-reports-index-cirp.md' },
    { src: '20260623_0825_IST_A1_Report_Constitution_of_CoC_Reg17.md', dest: PRECEDENTS_DIR, name: 'a1-coc-constitution-report.md' },
    { src: '20260623_0825_IST_A3_Report_Examination_Resolution_Plan_Sec30(2).md', dest: PRECEDENTS_DIR, name: 'a3-resolution-plan-examination-report.md' },
    { src: '20260623_0825_IST_A4_Opinion_Determination_PUFE_Reg35A.md', dest: PRECEDENTS_DIR, name: 'a4-pufe-opinion-reg35a.md' },
    { src: '20260623_0839_IST_A5_RP_Comments_Transaction_Audit_Report.md', dest: PRECEDENTS_DIR, name: 'a5-transaction-audit-comments.md' },
    { src: '20260623_0839_IST_A6_Report_Development_Rights_Permissions_Reg30C.md', dest: PRECEDENTS_DIR, name: 'a6-development-rights-report.md' },
    { src: '20260623_0839_IST_A7_Progress_Report_to_CoC.md', dest: PRECEDENTS_DIR, name: 'a7-coc-progress-report.md' },
    { src: '20260623_0929_IST_B3_Application_Exclusion_of_Time_Rule11_Reg40C.md', dest: PRECEDENTS_DIR, name: 'b3-time-exclusion-application.md' },
    { src: '20260623_0929_IST_B4_Avoidance_Applications_Sec43_45_50_66.md', dest: PRECEDENTS_DIR, name: 'b4-avoidance-application-sec43-45-50-66.md' },
    { src: '20260623_0934_IST_B5_Residuary_Application_Sec60(5).md', dest: PRECEDENTS_DIR, name: 'b5-residuary-application-sec60-5.md' },
    { src: '20260623_0934_IST_B6_Plan_Approval_Application_Sec30(6)_with_FormH_Letter.md', dest: PRECEDENTS_DIR, name: 'b6-plan-approval-application.md' },
    { src: '20260623_0934_IST_B7_Application_Liquidation_Sec33.md', dest: PRECEDENTS_DIR, name: 'b7-liquidation-application-sec33.md' },
    { src: '20260623_0934_IST_B8_Withdrawal_Application_Sec12A_with_FormFA_Letter.md', dest: PRECEDENTS_DIR, name: 'b8-withdrawal-application-sec12a.md' },
    { src: '20260623_1640_IST_SCC_Proforma_Reg31A.md', dest: PRECEDENTS_DIR, name: 'scc-proforma-reg31a.md' },
    { src: '20260623_1701_IST_IM_Confidentiality_Undertakings.md', dest: PRECEDENTS_DIR, name: 'im-confidentiality-undertaking.md' },
    { src: '20260627_2210_IST_01_PHASE_I_Commencement_and_Appointment_Precedents.md', dest: PRECEDENTS_DIR, name: 'liquidation-phase-1-commencement.md' },
    { src: '20260627_2225_IST_02_PHASE_II_Liquidation_Estate_Custody_Reporting_Precedents.md', dest: PRECEDENTS_DIR, name: 'liquidation-phase-2-estate-reporting.md' },
    { src: '20260627_2230_IST_03_PHASE_III_Stakeholders_Consultation_Committee_Precedents.md', dest: PRECEDENTS_DIR, name: 'liquidation-phase-3-scc.md' },
    { src: '20260627_2241_IST_04_PHASE_IV_Claims_Verification_Determination_Precedents.md', dest: PRECEDENTS_DIR, name: 'liquidation-phase-4-claims.md' },
    { src: '20260627_2246_IST_05_PHASE_V_Avoidance_Wrongful_Trading_Applications_Precedents.md', dest: PRECEDENTS_DIR, name: 'liquidation-phase-5-avoidance.md' },
    { src: '20260627_2253_IST_06_PHASE_VI_Realisation_and_Sale_Precedents.md', dest: PRECEDENTS_DIR, name: 'liquidation-phase-6-sale.md' },
    { src: '20260627_2259_IST_07_PHASE_VII_Distribution_Section_53_Waterfall_Precedents.md', dest: PRECEDENTS_DIR, name: 'liquidation-phase-7-waterfall-distribution.md' },
    { src: '20260627_2305_IST_08_PHASE_VIII_Progress_Reporting_and_Completion_Precedents.md', dest: PRECEDENTS_DIR, name: 'liquidation-phase-8-completion.md' },
    { src: '20260627_2309_IST_09_PHASE_IX_Dissolution_Closure_and_eMonitoring_Precedents.md', dest: PRECEDENTS_DIR, name: 'liquidation-phase-9-dissolution.md' },
    { src: '20260701_0900_IST_VL_Termination_Sec59-5A_Reg42_Pack-2.md', dest: PRECEDENTS_DIR, name: 'vl-termination-sec59-pack.md' },
    { src: '20260704_1540_IST_Format_Application_Regulation_44_2_Liquidation_Continuation.md', dest: PRECEDENTS_DIR, name: 'liquidation-continuation-reg44-2.md' },
    { src: '20260710_1432_IST_IBC_Precedent_Pack_VL_Termination_Reg42.md', dest: PRECEDENTS_DIR, name: 'vl-termination-reg42-precedent-pack.md' },
    { src: 'VL_Termination_Complete_Kit.md', dest: PRECEDENTS_DIR, name: 'vl-termination-complete-kit.md' },
];

fileMappings.forEach(({ src, dest, name }) => {
    const srcPath = path.join(SOURCE_DIR, src);
    if (fs.existsSync(srcPath)) {
        const raw = fs.readFileSync(srcPath, 'utf8');
        const processed = convertPlaceholders(raw);
        fs.writeFileSync(path.join(dest, name), processed, 'utf8');
        console.log(`[Ingest] ${name} → ${path.relative(REPO_ROOT, dest)}`);
    }
});

// 3. Create Law Vault JSON overlays for Knowledge Compendia
const vaultOverlays = [
    {
        src: 'IBC_Precedent_Compendium_2026_20260628_2148_IST.md',
        id: 'overlay/ibc-precedents-2026',
        title: 'IBC Precedent Compendium 2026 (SC / NCLAT / NCLT Rulings)'
    },
    {
        src: '20260629_1258_IST_Insolvency_and_Liquidation_Process_for_Corporate_Persons.md',
        id: 'overlay/ibc-corporate-process-guide',
        title: 'Insolvency and Liquidation Process for Corporate Persons Master Guide'
    },
    {
        src: '20260711_0151_IST_Asset_Stripping_The_Quiet_Theft_of_a_Company-1.md',
        id: 'overlay/ibc-asset-stripping-analysis',
        title: 'Asset Stripping & Fraudulent Transactions Legal Analysis'
    },
    {
        src: 'IBBI_DC_Issue_Analysis_Anonymised_20260620_0846_IST.md',
        id: 'overlay/ibbi-dc-issue-analysis',
        title: 'IBBI Disciplinary Committee Issues & Standards Analysis'
    },
    {
        src: '50_Claude_Prompts_CFO_IP_20260630_1652_IST (1).md',
        id: 'overlay/ip-cfo-practitioner-prompts',
        title: 'Insolvency Professional & CFO Legal Analysis Prompts'
    },
    {
        src: '20260710_0437_IST_InSpecie_Distribution_Voluntary_Liquidation_IBC_Reference_Note_MCQs_and_Key.md',
        id: 'overlay/in-specie-distribution-vl-reference',
        title: 'In-Specie Distribution in Voluntary Liquidation Reference Note'
    }
];

vaultOverlays.forEach(({ src, id, title }) => {
    const srcPath = path.join(SOURCE_DIR, src);
    if (fs.existsSync(srcPath)) {
        const text = fs.readFileSync(srcPath, 'utf8');
        const overlayData = [{
            id,
            title,
            section: 'compendium',
            text
        }];
        const outName = `${id.replace(/\//g, '_')}.json`;
        fs.writeFileSync(path.join(OVERLAYS_DIR, outName), JSON.stringify(overlayData, null, 2), 'utf8');
        console.log(`[Ingest] Vault overlay: ${outName} → hayagriva/vault/user_overlays/`);
    }
});

console.log('✓ All 3 Ingestion Pipelines Complete!');
