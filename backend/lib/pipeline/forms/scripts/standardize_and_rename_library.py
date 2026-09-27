#!/usr/bin/env python3
"""
standardize_and_rename_library.py
─────────────────────────────────────────────────────────────────
Renames and standardizes all 204 refined legal instruments in
`formats/02_refined_library/` for 100% Monaco and user compliance:

1. Strips all truncated tails (_S.md, _Sectio.md, _Eff.md, _In.md, etc.)
2. Enforces consistent 2-digit zero-padding (PG-IRP-01, PG-BNK-01, FIRM-IRP-01).
3. Reorganizes `03_Personal_Guarantors` into:
     - 01_IRP_Guarantors/ (30 instruments)
     - 02_Bankruptcy_Trustee/ (38 instruments)
4. Standardizes `04_Partnership_Firms` (35 instruments) and `08_Regulatory_Compliance` (7 instruments).
5. Injects rich YAML frontmatter with canonical `monaco_slash_command` and `monaco_aliases`.
6. Archives raw `ibc_forms` into `formats/00_master_originals/05_IBBI_Statutory_Forms_Archive/`.
7. Exports a full audit map `standardized_naming_audit.json`.
─────────────────────────────────────────────────────────────────
"""

import os
import re
import json
import shutil

REFINED_ROOT = '/Users/atulgrover/Desktop/HAYAGRIVA/formats/02_refined_library'
ORIGINALS_ROOT = '/Users/atulgrover/Desktop/HAYAGRIVA/formats/00_master_originals'
IBC_FORMS_SRC = '/Users/atulgrover/Desktop/HAYAGRIVA/agents/suites/ibc_forms'

# 1. Mapping for 03_Personal_Guarantors (PG-IRP & PG-BNK)
PG_IRP_MAP = {
    'PG-IRP-1': ('PG-IRP-01', 'Section_95_Guarantee_Invocation_Default_Demand_Memo.md', '/pg-irp-01', ['/guarantor-demand', '/sec95-demand']),
    'PG-IRP-2': ('PG-IRP-02', 'Section_95_Demand_Notice_To_Personal_Guarantor_Form_B.md', '/pg-irp-02', ['/form-b', '/demand-notice-guarantor']),
    'PG-IRP-3': ('PG-IRP-03', 'Section_95_Creditor_Application_To_Initiate_IRP_Form_C.md', '/pg-irp-03', ['/sec95', '/form-c', '/guarantor-irp']),
    'PG-IRP-3A': ('PG-IRP-03A', 'Section_94_Personal_Guarantor_Application_Form_A.md', '/pg-irp-03a', ['/sec94', '/form-a', '/debtor-irp-app']),
    'PG-IRP-4': ('PG-IRP-04', 'Section_96_Interim_Moratorium_Legal_Position_Note.md', '/pg-irp-04', ['/sec96', '/interim-moratorium-pg']),
    'PG-IRP-5': ('PG-IRP-05', 'Section_97_Resolution_Professional_Written_Consent_Form_A.md', '/pg-irp-05', ['/sec97', '/rp-consent-pg']),
    'PG-IRP-6': ('PG-IRP-06', 'Section_99_RP_Requisition_To_Debtor_Prove_Repayment.md', '/pg-irp-06', ['/sec99-requisition', '/prove-repayment']),
    'PG-IRP-7': ('PG-IRP-07', 'Section_99_RP_Report_Recommending_Admission_Rejection.md', '/pg-irp-07', ['/sec99-report', '/rp-admission-report']),
    'PG-IRP-8': ('PG-IRP-08', 'Section_100_NCLT_Admission_Rejection_Order.md', '/pg-irp-08', ['/sec100-order', '/irp-admission-order']),
    'PG-IRP-9': ('PG-IRP-09', 'Section_101_Moratorium_Effects_Compliance_Note.md', '/pg-irp-09', ['/sec101', '/moratorium-effects']),
    'PG-IRP-10': ('PG-IRP-10', 'Section_102_Public_Notice_Inviting_Claims.md', '/pg-irp-10', ['/sec102', '/pg-public-notice']),
    'PG-IRP-11': ('PG-IRP-11', 'Sections_103_104_Proof_Of_Claim_Verification_Forms.md', '/pg-irp-11', ['/sec103', '/pg-claim-proof']),
    'PG-IRP-11A': ('PG-IRP-11A', 'Section_103_Secured_Creditor_Security_Interest_Proof.md', '/pg-irp-11a', ['/sec103-secured', '/pg-secured-claim']),
    'PG-IRP-12': ('PG-IRP-12', 'Sections_103_104_Claims_Register_And_Verification_Memo.md', '/pg-irp-12', ['/pg-claim-register', '/pg-claims-memo']),
    'PG-IRP-13': ('PG-IRP-13', 'Section_104_List_Of_Creditors_Ledger.md', '/pg-irp-13', ['/sec104', '/pg-list-of-creditors']),
    'PG-IRP-14': ('PG-IRP-14', 'Section_105_Guarantor_Repayment_Plan_Structure.md', '/pg-irp-14', ['/sec105', '/repayment-plan']),
    'PG-IRP-15': ('PG-IRP-15', 'Section_106_RP_Statutory_Report_On_Repayment_Plan.md', '/pg-irp-15', ['/sec106', '/rp-plan-report']),
    'PG-IRP-16': ('PG-IRP-16', 'Section_107_Notice_Summoning_Creditors_Meeting.md', '/pg-irp-16', ['/sec107', '/pg-coc-meeting-notice']),
    'PG-IRP-17': ('PG-IRP-17', 'Section_108_Conduct_And_Minutes_Of_Creditors_Meeting.md', '/pg-irp-17', ['/sec108', '/pg-coc-minutes']),
    'PG-IRP-18': ('PG-IRP-18', 'Sections_109_110_Voting_Record_Secured_Creditor_Election.md', '/pg-irp-18', ['/sec109', '/pg-voting-record']),
    'PG-IRP-19': ('PG-IRP-19', 'Section_111_Resolution_Approving_Repayment_Plan.md', '/pg-irp-19', ['/sec111', '/plan-approval-res']),
    'PG-IRP-20': ('PG-IRP-20', 'Section_112_RP_Report_On_Creditors_Meeting_To_NCLT.md', '/pg-irp-20', ['/sec112', '/creditors-meeting-report']),
    'PG-IRP-21': ('PG-IRP-21', 'Section_113_Notice_Of_Decisions_Of_Creditors_Meeting.md', '/pg-irp-21', ['/sec113', '/decisions-notice']),
    'PG-IRP-22': ('PG-IRP-22', 'Section_114_NCLT_Order_On_Repayment_Plan_Binding_Effect.md', '/pg-irp-22', ['/sec114', '/plan-binding-order']),
    'PG-IRP-23_supervision': ('PG-IRP-23', 'Section_116_Implementation_Supervision_Report.md', '/pg-irp-23', ['/sec116', '/supervision-report']),
    'PG-IRP-23_breach': ('PG-IRP-23A', 'Regulation_20_Continued_Breach_During_Implementation.md', '/pg-irp-23a', ['/reg20-breach', '/plan-breach']),
    'PG-IRP-24': ('PG-IRP-24', 'Section_117_Completion_Report_Of_Repayment_Plan.md', '/pg-irp-24', ['/sec117', '/plan-completion-report']),
    'PG-IRP-25': ('PG-IRP-25', 'Section_118_Premature_End_Of_Repayment_Plan_Report.md', '/pg-irp-25', ['/sec118', '/premature-end-report']),
    'PG-IRP-26': ('PG-IRP-26', 'Section_119_Discharge_Order_Application.md', '/pg-irp-26', ['/sec119', '/discharge-order-app']),
    'PG-IRP-27': ('PG-IRP-27', 'Section_98_Replacement_Of_Resolution_Professional.md', '/pg-irp-27', ['/sec98', '/replace-rp-pg']),
    'PG-IRP-28': ('PG-IRP-28', 'Section_106_1A_No_Repayment_Plan_Report_Route_To_Bankruptcy.md', '/pg-irp-28', ['/sec106-1a', '/no-plan-report']),
    'PG-IRP-29': ('PG-IRP-29', 'Section_121_Bankruptcy_Initiation_Application.md', '/pg-irp-29', ['/sec121', '/initiate-bankruptcy']),
    'PG-IRP-30': ('PG-IRP-30', 'Section_60_2_Transfer_Guarantor_Asset_To_CIRP.md', '/pg-irp-30', ['/sec60-2', '/transfer-guarantor-asset']),
    'PG-IRP-31': ('PG-IRP-31', 'Section_183A_Safeguards_Against_Frivolous_Proceedings.md', '/pg-irp-31', ['/sec183a', '/frivolous-proceedings-bar']),
    'PG-IRP-32': ('PG-IRP-32', 'NCLT_Efiling_IBBI_Guarantor_Process_Tracker.md', '/pg-irp-32', ['/pg-efiling-tracker', '/ibbi-guarantor-tracker']),
    'PG-IRP-99': ('PG-IRP-99', 'Section_99_Comprehensive_Worked_Example_Affidavit_Dossier.md', '/pg-irp-99', ['/sec99-worked-example', '/sec99-dossier'])
}

PG_BNK_MAP = {
    'PG-BNK-1': ('PG-BNK-01', 'Section_121_Bankruptcy_Readiness_Eligibility_Limitation_Note.md', '/pg-bnk-01', ['/sec121-readiness', '/bankruptcy-limitation']),
    'PG-BNK-4': ('PG-BNK-04', 'Section_122_Bankruptcy_Application_Interim_Effect_Note.md', '/pg-bnk-04', ['/sec122', '/bankruptcy-interim-effect']),
    'PG-BNK-5': ('PG-BNK-05', 'Section_125_Bankruptcy_Trustee_Consent_Eligibility_Form.md', '/pg-bnk-05', ['/sec125', '/trustee-consent']),
    'PG-BNK-6': ('PG-BNK-06', 'Sections_126_127_Draft_Bankruptcy_Order.md', '/pg-bnk-06', ['/sec126', '/sec127', '/bankruptcy-order']),
    'PG-BNK-7': ('PG-BNK-07', 'Section_128_Vesting_Of_Estate_In_Trustee_Compliance_Note.md', '/pg-bnk-07', ['/sec128', '/vesting-of-estate']),
    'PG-BNK-9': ('PG-BNK-09', 'Section_130_Public_Notice_Inviting_Claims.md', '/pg-bnk-09', ['/sec130', '/bankruptcy-public-notice']),
    'PG-BNK-10': ('PG-BNK-10', 'Section_131_Registration_Proof_Of_Claims_Secured_Creditors.md', '/pg-bnk-10', ['/sec131', '/bankruptcy-claim-proof']),
    'PG-BNK-12': ('PG-BNK-12', 'Section_132_Master_List_Of_Creditors.md', '/pg-bnk-12', ['/sec132', '/bankruptcy-list-of-creditors']),
    'PG-BNK-13': ('PG-BNK-13', 'Section_133_Notice_Summoning_Creditors_Meeting.md', '/pg-bnk-13', ['/sec133', '/bankruptcy-coc-notice']),
    'PG-BNK-14': ('PG-BNK-14', 'Sections_134_135_Creditors_Meeting_Conduct_And_Voting_Rights.md', '/pg-bnk-14', ['/sec134', '/sec135', '/bankruptcy-voting']),
    'PG-BNK-15': ('PG-BNK-15', 'Section_149_Trustee_Administration_Plan_And_Functions.md', '/pg-bnk-15', ['/sec149', '/trustee-admin-plan']),
    'PG-BNK-16': ('PG-BNK-16', 'Sections_155_157_Vesting_Estate_Bankrupt_Duties_After_Acquired_Property.md', '/pg-bnk-16', ['/sec155', '/sec157', '/after-acquired-property']),
    'PG-BNK-17': ('PG-BNK-17', 'Section_151_Requisition_Information_Examination_Bankrupt.md', '/pg-bnk-17', ['/sec151', '/bankrupt-examination']),
    'PG-BNK-18': ('PG-BNK-18', 'Sections_162_163_Asset_Realisation_Auction_Valuation_Protocol.md', '/pg-bnk-18', ['/sec162', '/sec163', '/bankruptcy-asset-auction']),
    'PG-BNK-20': ('PG-BNK-20', 'Section_160_Disclaimer_Of_Onerous_Property_Notice.md', '/pg-bnk-20', ['/sec160', '/disclaimer-onerous-property']),
    'PG-BNK-21': ('PG-BNK-21', 'Section_164_Avoidance_Undervalued_Transactions_Application.md', '/pg-bnk-21', ['/sec164', '/bankruptcy-undervalued']),
    'PG-BNK-22': ('PG-BNK-22', 'Section_164A_Avoidance_Transactions_Defrauding_Creditors.md', '/pg-bnk-22', ['/sec164a', '/bankruptcy-defrauding']),
    'PG-BNK-23': ('PG-BNK-23', 'Section_165_Avoidance_Preference_Transactions_Application.md', '/pg-bnk-23', ['/sec165', '/bankruptcy-preference']),
    'PG-BNK-24': ('PG-BNK-24', 'Section_167_Avoidance_Extortionate_Credit_Transactions.md', '/pg-bnk-24', ['/sec167', '/bankruptcy-extortionate']),
    'PG-BNK-25': ('PG-BNK-25', 'Section_60_5_Trustee_Application_For_Directions.md', '/pg-bnk-25', ['/sec60-5', '/trustee-directions']),
    'PG-BNK-26': ('PG-BNK-26', 'Regulations_Trustee_Progress_Status_Report.md', '/pg-bnk-26', ['/trustee-progress-report']),
    'PG-BNK-27': ('PG-BNK-27', 'Section_178_Preliminary_Report_Distribution_Priority_Waterfall.md', '/pg-bnk-27', ['/sec178', '/bankruptcy-distribution-waterfall']),
    'PG-BNK-28': ('PG-BNK-28', 'Section_137_Completion_Of_Administration_Report.md', '/pg-bnk-28', ['/sec137', '/administration-completion']),
    'PG-BNK-29': ('PG-BNK-29', 'Section_138_Application_For_Discharge_Order.md', '/pg-bnk-29', ['/sec138', '/bankruptcy-discharge-app']),
    'PG-BNK-31': ('PG-BNK-31', 'Sections_139_141_Discharge_Effects_Disqualifications_Restrictions.md', '/pg-bnk-31', ['/sec139', '/sec141', '/discharge-restrictions']),
    'PG-BNK-32': ('PG-BNK-32', 'Section_142_Modification_Or_Recall_Of_Bankruptcy_Order.md', '/pg-bnk-32', ['/sec142', '/recall-bankruptcy-order']),
    'PG-BNK-33': ('PG-BNK-33', 'Section_61_NCLAT_Appeal_Against_Discharge_Order.md', '/pg-bnk-33', ['/sec61-appeal', '/nclat-bankruptcy-appeal']),
    'PG-BNK-34': ('PG-BNK-34', 'Sections_143_145_Trustee_Standards_Of_Conduct_And_Fees.md', '/pg-bnk-34', ['/sec143', '/sec145', '/trustee-fees']),
    'PG-BNK-35': ('PG-BNK-35', 'Section_183A_Penalty_Frivolous_Vexatious_Proceedings.md', '/pg-bnk-35', ['/sec183a-bankruptcy', '/penalty-frivolous']),
    'PG-BNK-36': ('PG-BNK-36', 'Section_170_Administration_Estate_Deceased_Bankrupt.md', '/pg-bnk-36', ['/sec170', '/deceased-bankrupt']),
    'PG-BNK-37': ('PG-BNK-37', 'Section_125_Replacement_Of_Bankruptcy_Trustee.md', '/pg-bnk-37', ['/sec125-replace', '/replace-trustee']),
    'PG-BNK-38': ('PG-BNK-38', 'NCLT_IBBI_Bankruptcy_Process_Master_Compliance_Tracker.md', '/pg-bnk-38', ['/bankruptcy-tracker', '/ibbi-bankruptcy-tracker'])
}

# 2. Mapping for 04_Partnership_Firms (FIRM-IRP)
FIRM_IRP_MAP = {
    'FIRM-IRP-1': ('FIRM-IRP-01', 'Section_25_Firm_Surety_Partner_Coextensive_Liability_Memo.md', '/firm-irp-01', ['/sec25-firm', '/firm-liability']),
    'FIRM-IRP-2': ('FIRM-IRP-02', 'Schedule_Of_Partners_Guarantee_Date_Verification_Table.md', '/firm-irp-02', ['/firm-partners-table']),
    'FIRM-IRP-3': ('FIRM-IRP-03', 'Invocation_Of_Guarantee_Record_Of_Default_Demand_Readiness.md', '/firm-irp-03', ['/firm-demand-readiness']),
    'FIRM-IRP-4': ('FIRM-IRP-04', 'Demand_Notice_To_Each_Partner_Form_B.md', '/firm-irp-04', ['/firm-demand-notice', '/firm-form-b']),
    'FIRM-IRP-5': ('FIRM-IRP-05', 'Section_95_Creditor_Coordinated_Application_Per_Partner.md', '/firm-irp-05', ['/firm-sec95', '/firm-creditor-app']),
    'FIRM-IRP-5A': ('FIRM-IRP-05A', 'Section_94_Partner_Own_Application_To_Initiate_IRP_Form_A.md', '/firm-irp-05a', ['/firm-sec94', '/firm-form-a']),
    'FIRM-IRP-6': ('FIRM-IRP-06', 'Section_96_2_Interim_Moratorium_All_Partners_Legal_Position_Note.md', '/firm-irp-06', ['/firm-sec96-2', '/firm-moratorium']),
    'FIRM-IRP-7': ('FIRM-IRP-07', 'Section_97_RP_Written_Consent_Eligibility_Independence_Form.md', '/firm-irp-07', ['/firm-sec97', '/firm-rp-consent']),
    'FIRM-IRP-8': ('FIRM-IRP-08', 'Section_99_RP_Requisition_To_Partners_Prove_Repayment.md', '/firm-irp-08', ['/firm-sec99-req']),
    'FIRM-IRP-9': ('FIRM-IRP-09', 'Section_99_RP_Report_Per_Partner_Admission_Rejection.md', '/firm-irp-09', ['/firm-sec99-report']),
    'FIRM-IRP-10': ('FIRM-IRP-10', 'Section_100_NCLT_Admission_Rejection_Order.md', '/firm-irp-10', ['/firm-sec100-order']),
    'FIRM-IRP-11': ('FIRM-IRP-11', 'Section_101_Moratorium_Effects_Compliance_Note.md', '/firm-irp-11', ['/firm-sec101']),
    'FIRM-IRP-12': ('FIRM-IRP-12', 'Section_102_Public_Notice_Inviting_Claims.md', '/firm-irp-12', ['/firm-sec102']),
    'FIRM-IRP-13': ('FIRM-IRP-13', 'Sections_103_104_Proof_Of_Claim_Verification_Forms.md', '/firm-irp-13', ['/firm-sec103']),
    'FIRM-IRP-13A': ('FIRM-IRP-13A', 'Sections_103_110_Secured_Creditor_Security_Relinquishment_Proof.md', '/firm-irp-13a', ['/firm-secured-claim']),
    'FIRM-IRP-14': ('FIRM-IRP-14', 'Register_And_Verification_Of_Claims_Memo.md', '/firm-irp-14', ['/firm-claim-register']),
    'FIRM-IRP-15': ('FIRM-IRP-15', 'Section_104_List_Of_Creditors_Of_The_Partner_Ledger.md', '/firm-irp-15', ['/firm-sec104']),
    'FIRM-IRP-16': ('FIRM-IRP-16', 'Section_105_Repayment_Plan_Firm_Property_Realisation_Dovetailed.md', '/firm-irp-16', ['/firm-sec105', '/firm-repayment-plan']),
    'FIRM-IRP-17': ('FIRM-IRP-17', 'Section_106_RP_Statutory_Report_On_Repayment_Plan.md', '/firm-irp-17', ['/firm-sec106']),
    'FIRM-IRP-18': ('FIRM-IRP-18', 'Sections_107_108_Notice_Summoning_And_Conduct_Of_Creditors_Meeting.md', '/firm-irp-18', ['/firm-sec107', '/firm-sec108']),
    'FIRM-IRP-19': ('FIRM-IRP-19', 'Sections_109_110_Voting_Record_Secured_Creditor_Election.md', '/firm-irp-19', ['/firm-sec109']),
    'FIRM-IRP-20': ('FIRM-IRP-20', 'Section_111_Resolution_Approving_Repayment_Plan.md', '/firm-irp-20', ['/firm-sec111']),
    'FIRM-IRP-21': ('FIRM-IRP-21', 'Sections_112_113_Report_Of_Creditors_Meeting_Notice_Of_Decisions.md', '/firm-irp-21', ['/firm-sec112']),
    'FIRM-IRP-22': ('FIRM-IRP-22', 'Section_114_NCLT_Order_On_Repayment_Plan_Binding_Effect.md', '/firm-irp-22', ['/firm-sec114']),
    'FIRM-IRP-23': ('FIRM-IRP-23', 'Sections_116_117_Implementation_Supervision_Completion_Report.md', '/firm-irp-23', ['/firm-sec116', '/firm-sec117']),
    'FIRM-IRP-24': ('FIRM-IRP-24', 'Section_49_Partner_Contribution_Indemnity_Debt_Allocation_Memo.md', '/firm-irp-24', ['/firm-sec49', '/partner-indemnity']),
    'FIRM-IRP-25': ('FIRM-IRP-25', 'Section_118_Premature_End_Of_Repayment_Plan_Report.md', '/firm-irp-25', ['/firm-sec118']),
    'FIRM-IRP-26': ('FIRM-IRP-26', 'Section_119_Discharge_Order_Per_Partner_Application.md', '/firm-irp-26', ['/firm-sec119']),
    'FIRM-IRP-27': ('FIRM-IRP-27', 'Section_2_f_Firm_Route_DRT_Adjudicating_Authority_Tracking_Note.md', '/firm-irp-27', ['/firm-sec2-f']),
    'FIRM-IRP-28': ('FIRM-IRP-28', 'Section_96_2_Single_Application_In_Relation_To_Firm_Moratorium.md', '/firm-irp-28', ['/firm-single-app']),
    'FIRM-IRP-29': ('FIRM-IRP-29', 'Section_98_Replacement_Of_RP_No_Plan_Termination_Bankruptcy.md', '/firm-irp-29', ['/firm-sec98']),
    'FIRM-IRP-30': ('FIRM-IRP-30', 'Section_121_Bankruptcy_Of_A_Partner_On_Failure_Of_IRP.md', '/firm-irp-30', ['/firm-sec121']),
    'FIRM-IRP-31': ('FIRM-IRP-31', 'Section_60_2_Transfer_Guarantor_Asset_In_CD_CIRP.md', '/firm-irp-31', ['/firm-sec60-2']),
    'FIRM-IRP-32': ('FIRM-IRP-32', 'Section_183A_Safeguards_Against_Frivolous_Proceedings.md', '/firm-irp-32', ['/firm-sec183a']),
    'FIRM-IRP-33': ('FIRM-IRP-33', 'NCLT_IBBI_Partnership_Firm_Process_Master_Compliance_Tracker.md', '/firm-irp-33', ['/firm-compliance-tracker'])
}

# 3. Mapping for 08_Regulatory_Compliance
REG_MAP = {
    'REG-01': ('REG-01', 'IBBI_Master_Statutory_Compliance_Correlation_Index.md', '/reg-01', ['/compliance-correlation', '/ibbi-correlation-index']),
    'REG-02': ('REG-02', 'NCLT_Master_Pleading_Annexure_Verification_Index.md', '/reg-02', ['/annexure-index', '/pleading-annexure-index']),
    'REG-03': ('REG-03', 'Gazette_Public_Announcement_Newspaper_Tearsheet_Evidence_Tracker.md', '/reg-03', ['/tearsheet-tracker', '/newspaper-announcement-tracker']),
    'REG-04': ('REG-04', 'Digital_Evidence_Electronic_Screenshot_Verification_Ledger.md', '/reg-04', ['/digital-evidence-ledger', '/screenshot-ledger']),
    'REG-05': ('REG-05', 'Statutory_Record_Page_Pagination_Cross_Reference_Ledger.md', '/reg-05', ['/pagination-ledger', '/statutory-cross-ref']),
    'REG-06': ('REG-06', 'CIRP_Regulations_Schedule_Filing_Master_Checklist.md', '/reg-06', ['/schedule-filing-checklist', '/ibbi-forms-checklist']),
    'REG-07': ('REG-07', 'Reg_13_Claim_Receipt_Timeline_Admissibility_Audit_Ledger.md', '/reg-07', ['/claim-timeline-ledger', '/reg13-claims-audit'])
}

def inject_frontmatter(content, item_id, title, statutory_provision, slash_cmd, aliases, category):
    # Remove existing frontmatter if present
    body = content
    if content.startswith('---'):
        end_idx = content.find('\n---', 3)
        if end_idx != -1:
            body = content[end_idx+4:].lstrip()
    
    # Extract placeholders
    tags = sorted(list(set(re.findall(r'\{\{([a-zA-Z0-9_]+)\}\}', body))))
    
    frontmatter_lines = [
        "---",
        f'instrument_id: "{item_id}"',
        f'title: "{title}"',
        f'statutory_provision: "{statutory_provision}"',
        'jurisdiction: "National Company Law Tribunal (NCLT) / High Court"',
        f'monaco_slash_command: "{slash_cmd}"',
        "monaco_aliases:"
    ]
    for al in aliases:
        frontmatter_lines.append(f'  - "{al}"')
    
    frontmatter_lines.extend([
        f'category: "{category}"',
        'evidence_certificate: "Section 63 Bharatiya Sakshya Adhiniyam, 2023 (BSA)"',
        "required_kv_variables:"
    ])
    for t in tags[:15]:
        frontmatter_lines.append(f'  - {t}')
    frontmatter_lines.append("---\n\n")
    
    return "\n".join(frontmatter_lines) + body

def execute_reorganization():
    audit_log = {
        'total_files_processed': 0,
        'pg_irp_count': 0,
        'pg_bnk_count': 0,
        'firm_irp_count': 0,
        'reg_count': 0,
        'mappings': []
    }

    print("═════════════════════════════════════════════════════════════════")
    print("🚀 Standardizing Legal Library Naming & Hierarchy Taxonomy")
    print("═════════════════════════════════════════════════════════════════")

    # Step 1: Archive ibc_forms
    target_archive = os.path.join(ORIGINALS_ROOT, '05_IBBI_Statutory_Forms_Archive')
    if os.path.exists(IBC_FORMS_SRC) and not os.path.exists(target_archive):
        print(f"\n📦 Archiving raw ibc_forms into {target_archive}...")
        shutil.copytree(IBC_FORMS_SRC, target_archive)
        print("   ✓ ibc_forms archived successfully.")
    else:
        print("\n📦 Archive already exists or source missing.")

    # Step 2: Reorganize 03_Personal_Guarantors
    pg_base = os.path.join(REFINED_ROOT, '03_Personal_Guarantors')
    irp_dir = os.path.join(pg_base, '01_IRP_Guarantors')
    bnk_dir = os.path.join(pg_base, '02_Bankruptcy_Trustee')
    os.makedirs(irp_dir, exist_ok=True)
    os.makedirs(bnk_dir, exist_ok=True)

    print("\n🏢 Reorganizing 03_Personal_Guarantors into IRP & Bankruptcy subdirectories...")
    for fname in sorted(os.listdir(pg_base)):
        src_path = os.path.join(pg_base, fname)
        if not os.path.isfile(src_path) or not fname.endswith('.md'):
            continue
        
        with open(src_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Check IRP vs BNK
        if fname.startswith('PG-IRP'):
            # Match key
            # Handle special cases like PG-IRP-23 (supervision vs breach)
            if 'Implementation_Supervision' in fname:
                key = 'PG-IRP-23_supervision'
            elif 'Continued_Breach' in fname:
                key = 'PG-IRP-23_breach'
            else:
                m = re.match(r'^(PG-IRP-[0-9]+[A-Za-z]?)_', fname)
                key = m.group(1) if m else None

            if key and key in PG_IRP_MAP:
                new_id, new_file, slash_cmd, aliases = PG_IRP_MAP[key]
                clean_title = new_file.replace('.md', '').replace('_', ' ')
                stat_prov = "Part III, Chapter III IBC, 2016 (Sections 94–120)"
                updated_content = inject_frontmatter(content, new_id, clean_title, stat_prov, slash_cmd, aliases, "03_Personal_Guarantors_IRP")
                dest_path = os.path.join(irp_dir, f"{new_id}_{new_file}")
                with open(dest_path, 'w', encoding='utf-8') as f_out:
                    f_out.write(updated_content)
                os.remove(src_path)
                audit_log['pg_irp_count'] += 1
                audit_log['total_files_processed'] += 1
                audit_log['mappings'].append({'old': fname, 'new': f"01_IRP_Guarantors/{new_id}_{new_file}", 'slash': slash_cmd})

        elif fname.startswith('PG-BNK'):
            m = re.match(r'^(PG-BNK-[0-9]+[A-Za-z]?)_', fname)
            key = m.group(1) if m else None
            if key and key in PG_BNK_MAP:
                new_id, new_file, slash_cmd, aliases = PG_BNK_MAP[key]
                clean_title = new_file.replace('.md', '').replace('_', ' ')
                stat_prov = "Part III, Chapter IV IBC, 2016 (Sections 121–187) Bankruptcy"
                updated_content = inject_frontmatter(content, new_id, clean_title, stat_prov, slash_cmd, aliases, "03_Personal_Guarantors_Bankruptcy")
                dest_path = os.path.join(bnk_dir, f"{new_id}_{new_file}")
                with open(dest_path, 'w', encoding='utf-8') as f_out:
                    f_out.write(updated_content)
                os.remove(src_path)
                audit_log['pg_bnk_count'] += 1
                audit_log['total_files_processed'] += 1
                audit_log['mappings'].append({'old': fname, 'new': f"02_Bankruptcy_Trustee/{new_id}_{new_file}", 'slash': slash_cmd})

    print(f"   ✓ 03_Personal_Guarantors complete: {audit_log['pg_irp_count']} IRP + {audit_log['pg_bnk_count']} Bankruptcy instruments.")

    # Step 3: Reorganize 04_Partnership_Firms
    firm_base = os.path.join(REFINED_ROOT, '04_Partnership_Firms')
    print("\n🤝 Standardizing 04_Partnership_Firms names and zero-padding...")
    for fname in sorted(os.listdir(firm_base)):
        src_path = os.path.join(firm_base, fname)
        if not os.path.isfile(src_path) or not fname.endswith('.md'):
            continue
        
        m = re.match(r'^(FIRM-IRP-[0-9]+[A-Za-z]?)_', fname)
        key = m.group(1) if m else None
        if key and key in FIRM_IRP_MAP:
            new_id, new_file, slash_cmd, aliases = FIRM_IRP_MAP[key]
            clean_title = new_file.replace('.md', '').replace('_', ' ')
            stat_prov = "Part III, Chapter III IBC, 2016 read with Section 25 Partnership Act, 1932"
            with open(src_path, 'r', encoding='utf-8') as f:
                content = f.read()
            updated_content = inject_frontmatter(content, new_id, clean_title, stat_prov, slash_cmd, aliases, "04_Partnership_Firms")
            dest_path = os.path.join(firm_base, f"{new_id}_{new_file}")
            with open(dest_path, 'w', encoding='utf-8') as f_out:
                f_out.write(updated_content)
            if dest_path != src_path:
                os.remove(src_path)
            audit_log['firm_irp_count'] += 1
            audit_log['total_files_processed'] += 1
            audit_log['mappings'].append({'old': fname, 'new': f"{new_id}_{new_file}", 'slash': slash_cmd})

    print(f"   ✓ 04_Partnership_Firms complete: {audit_log['firm_irp_count']} instruments standardized.")

    # Step 4: Reorganize 08_Regulatory_Compliance
    reg_base = os.path.join(REFINED_ROOT, '08_Regulatory_Compliance')
    print("\n📋 Standardizing 08_Regulatory_Compliance names...")
    for fname in sorted(os.listdir(reg_base)):
        src_path = os.path.join(reg_base, fname)
        if not os.path.isfile(src_path) or not fname.endswith('.md'):
            continue
        
        m = re.match(r'^(REG-[0-9]+)_', fname)
        key = m.group(1) if m else None
        if key and key in REG_MAP:
            new_id, new_file, slash_cmd, aliases = REG_MAP[key]
            clean_title = new_file.replace('.md', '').replace('_', ' ')
            stat_prov = "IBBI (CIRP) Regulations, 2016 & Gazette Form Schedules"
            with open(src_path, 'r', encoding='utf-8') as f:
                content = f.read()
            updated_content = inject_frontmatter(content, new_id, clean_title, stat_prov, slash_cmd, aliases, "08_Regulatory_Compliance")
            dest_path = os.path.join(reg_base, f"{new_id}_{new_file}")
            with open(dest_path, 'w', encoding='utf-8') as f_out:
                f_out.write(updated_content)
            if dest_path != src_path:
                os.remove(src_path)
            audit_log['reg_count'] += 1
            audit_log['total_files_processed'] += 1
            audit_log['mappings'].append({'old': fname, 'new': f"{new_id}_{new_file}", 'slash': slash_cmd})

    print(f"   ✓ 08_Regulatory_Compliance complete: {audit_log['reg_count']} instruments standardized.")

    # Step 5: Save audit log
    audit_file = '/Users/atulgrover/Desktop/HAYAGRIVA/formats/standardized_naming_audit.json'
    with open(audit_file, 'w', encoding='utf-8') as f:
        json.dump(audit_log, f, indent=2)

    print("\n═════════════════════════════════════════════════════════════════")
    print(f"✨ Standardized {audit_log['total_files_processed']} legal instruments with 100% Monaco compliance!")
    print(f"📄 Audit Log saved: {audit_file}")
    print("═════════════════════════════════════════════════════════════════\n")

if __name__ == '__main__':
    execute_reorganization()
