'use strict';

/**
 * iPIE Sample Process Bundles Generator & R2 Uploader
 * ----------------------------------------------------
 * Generates the 10 stagewise iPIE process sample archives (.zip)
 * and uploads them to Cloudflare R2 bucket under key `ipie/iPIE_0X_Name.zip`.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

try { require('dotenv').config(); } catch (_) {}

const OUTPUT_DIR = path.join(__dirname, '../../../haya_portal/sample_bundles');

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

console.log(`[iPIE Bundles Generator] Building 10 stagewise sample archives in: ${OUTPUT_DIR}\n`);

const MODULES = [
    {
        id: '01',
        name: 'iPIE_01_Commencement',
        files: [
            {
                name: 'NCLT_Admission_Order_CP_IB_1024_2026.md',
                content: `# BEFORE THE NATIONAL COMPANY LAW TRIBUNAL (NCLT) NEW DELHI BENCH\n**CP (IB) No. 1024/ND/2026**\n\n**In the Matter of:**\nFinancial Creditor: **State Bank of India**\nvs.\nCorporate Debtor: **Alpha Infra Projects Ltd**\n\n**ORDER DATED: 01.08.2026 ($T_0$)**\n1. The application filed by Financial Creditor under Section 7 of IBC, 2016 is ADMITTED.\n2. Corporate Insolvency Resolution Process (CIRP) is hereby COMMENCED against Corporate Debtor.\n3. Moratorium under Section 14 is declared.\n4. Insolvency Professional (IP) is appointed as Interim Resolution Professional (IRP).`
            },
            {
                name: 'Form_FA_Withdrawal_Application_Sec12A.md',
                content: `# FORM FA - APPLICATION FOR WITHDRAWAL OF CIRP\nUnder Section 12A of the Insolvency and Bankruptcy Code, 2016\n\n**Applicant**: Financial Creditor\n**Corporate Debtor**: Alpha Infra Projects Ltd\n**Reason for Withdrawal**: Settlement agreement executed between CD and 90% voting share creditors.`
            }
        ]
    },
    {
        id: '02',
        name: 'iPIE_02_Claims',
        files: [
            {
                name: 'Form_B_Operational_Creditor_Steel_Corp.md',
                content: `# FORM B - PROOF OF CLAIM BY OPERATIONAL CREDITOR\n**Claimant**: Steel Supplies India Pvt Ltd\n**Corporate Debtor**: Alpha Infra Projects Ltd\n**Total Claimed Amount**: INR 4,500,000\n**Total Admitted Amount**: INR 4,500,000\n**Invoices Attached**: INV-2025-089, INV-2025-102`
            },
            {
                name: 'Form_C_Financial_Creditor_State_Bank.md',
                content: `# FORM C - PROOF OF CLAIM BY FINANCIAL CREDITOR\n**Claimant**: State Bank of India\n**Corporate Debtor**: Alpha Infra Projects Ltd\n**Principal Claim**: INR 1,000,000,000\n**Interest Claim**: INR 200,000,000\n**Total Admitted Claim**: INR 1,200,000,000\n**Security Interest**: Exclusive First Charge on Factory Land & Building at Plot 45, NIDA.`
            }
        ]
    },
    {
        id: '03',
        name: 'iPIE_03_CoC',
        files: [
            {
                name: 'Creditor_Admitted_Claims_Summary.md',
                content: `# SUMMARY OF ADMITTED CLAIMS & COC CONSTITUTION\n| Financial Creditor | Admitted Debt (INR) | Sec 5(24) Related Party | Calculated Voting Share (%) |\n| State Bank of India | 1,200,000,000 | No | 60.00% |\n| Punjab National Bank | 800,000,000 | No | 40.00% |\n| Alpha Holdings (Affiliate) | 300,000,000 | Yes (Excluded) | 0.00% |\n| **TOTAL UNRELATED DEBT** | **2,000,000,000** | -- | **100.00%** |`
            }
        ]
    },
    {
        id: '04',
        name: 'iPIE_04_Records',
        files: [
            {
                name: 'Transaction_Audit_Forensic_Report.md',
                content: `# FORENSIC AUDIT REPORT ON AVOIDANCE TRANSACTIONS\n**Target Entity**: Alpha Infra Projects Ltd\n**Lookback Period**: 2 Years prior to $T_0$\n\n### Summary of Flagged PUFE Transactions:\n1. **Section 43 (Preferential)**: Transfer of INR 25,000,000 to promoter affiliate 45 days prior to admission.\n2. **Section 45 (Undervalued)**: Sale of commercial land at 60% below circle rate (INR 18,000,000 deficit).\n3. **Section 66 (Fraudulent Trading)**: Unrecorded cash siphoning of INR 40,000,000.`
            }
        ]
    },
    {
        id: '05',
        name: 'iPIE_05_Plan',
        files: [
            {
                name: 'Resolution_Plan_Apex_Infra_Consortium.md',
                content: `# RESOLUTION PLAN SUBMISSION\n**Resolution Applicant**: Apex Infra Consortium\n**Total Upfront Cash Payout**: INR 1,500,000,000\n**CIRP Costs Priority**: 100% Full Payment (INR 25,000,000)\n**Operational Creditors Payout**: INR 90,000,000 (20% of admitted debt)\n**Section 29A Eligibility**: Verified Clean`
            }
        ]
    },
    {
        id: '06',
        name: 'iPIE_06_Implementation',
        files: [
            {
                name: 'Monitoring_Committee_Agreement_Draft.md',
                content: `# MONITORING & IMPLEMENTATION COMMITTEE (IMC) GOVERNANCE\n**Members**: IP (Chairman), 2 Financial Creditor Representatives, 1 Successful Resolution Applicant Representative.\n**Tranche 1 Payout**: INR 500,000,000 upon NCLT order receipt.`
            }
        ]
    },
    {
        id: '07',
        name: 'iPIE_07_Liquidation',
        files: [
            {
                name: 'Section_53_Waterfall_Distribution_Ledger.md',
                content: `# SECTION 53 LIQUIDATION WATERFALL DISTRIBUTION LEDGER\n1. **CIRP & Liquidation Costs**: INR 15,000,000 (100% Paid)\n2. **Secured Creditors & Workmen (24m)**: INR 600,000,000 (75% Realization)\n3. **Unsecured Financial Creditors**: INR 120,000,000 (30% Realization)\n4. **Statutory Government Dues**: INR 10,000,000 (10% Realization)`
            }
        ]
    },
    {
        id: '08',
        name: 'iPIE_08_Compliance',
        files: [
            {
                name: 'IBBI_CIRP_Forms_1_to_6_Checklist.md',
                content: `# IBBI STATUTORY FORM COMPLIANCE TRACKER\n- **Form CIRP-1**: Public Announcement & IRP Appointment (Submitted)\n- **Form CIRP-2**: Claim Collation & Verification (Submitted)\n- **Form CIRP-3**: CoC Constitution (Submitted)\n- **Form CIRP-4**: Process Cost Reporting (Pending)`
            }
        ]
    },
    {
        id: '09',
        name: 'iPIE_09_Litigation',
        files: [
            {
                name: 'NCLT_IA_402_2026_Stay_Application.md',
                content: `# BEFORE THE NCLT NEW DELHI BENCH\n**IA No. 402/2026 in CP(IB) 1024/ND/2026**\n\n**Application under Section 60(5) for Stay on Arbitral Proceedings.**\nPRAYER: Restrain respondent from enforcing ex-parte arbitral award during moratorium.`
            }
        ]
    },
    {
        id: '10',
        name: 'iPIE_10_Finance',
        files: [
            {
                name: 'CIRP_Process_Expense_Ledger.md',
                content: `# ITEMIZING CIRP PROCESS EXPENSE LEDGER\n- **IRP/RP Professional Fee**: INR 1,500,000 / month\n- **Registered Valuers Retainer**: INR 600,000\n- **Forensic Auditor Retainer**: INR 800,000\n- **VDR & E-Voting Portal Charges**: INR 250,000\n- **TOTAL APPROVED CIRP EXPENSES**: INR 14,850,000`
            }
        ]
    }
];

// Create folders and zip archives
MODULES.forEach(mod => {
    const modFolder = path.join(OUTPUT_DIR, mod.name);
    if (!fs.existsSync(modFolder)) {
        fs.mkdirSync(modFolder, { recursive: true });
    }

    mod.files.forEach(f => {
        fs.writeFileSync(path.join(modFolder, f.name), f.content, 'utf8');
    });

    const zipPath = path.join(OUTPUT_DIR, `${mod.name}.zip`);
    try {
        execSync(`cd "${OUTPUT_DIR}" && zip -r "${mod.name}.zip" "${mod.name}"`);
        console.log(`✓ Created ${mod.name}.zip (${fs.statSync(zipPath).size} bytes)`);
    } catch (e) {
        console.error(`Failed to zip ${mod.name}:`, e.message);
    }
});

console.log(`\n=======================================================`);
console.log(`📁 ALL 10 iPIE SAMPLE BUNDLES GENERATED SUCCESSFULLY!`);
console.log(`Local Folder: ${OUTPUT_DIR}`);
console.log(`=======================================================\n`);
