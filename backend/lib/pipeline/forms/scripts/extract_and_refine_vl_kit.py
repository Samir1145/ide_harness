#!/usr/bin/env python3
"""
extract_and_refine_vl_kit.py
─────────────────────────────────────────────────────────────────
Extracts and refines all 35 instruments for Section 59 Voluntary Liquidation
from `VLMASTERKIT.pdf`, `SpeciedistributioninVL.pdf`, and
`SaleofImmovablePropertyinLiquidationRegistrationandStampDuty.pdf`.

Applies the 5-Pillar Legal Quality Standard:
1. Watertight prayer matrices with ex-parte ad-interim reliefs for court pleadings
2. Order VI Rule 15A Statements of Truth
3. Section 63 Bharatiya Sakshya Adhiniyam, 2023 (BSA) digital certificates
4. Canonical double-brace {{mustache_tags}} mapped to case_kv_dictionary.json
5. Rich YAML frontmatter with canonical `monaco_slash_command` and `monaco_aliases`

Saves all instruments to:
`formats/02_refined_library/06_Voluntary_Liquidation/`
─────────────────────────────────────────────────────────────────
"""

import os
import re
import json
import pypdf

VL_KIT_PDF = '/Users/atulgrover/Desktop/HAYAGRIVA/formats/00_master_originals/08_Voluntary_Liquidation_And_Asset_Sale_Kits/VLMASTERKIT.pdf'
SPECIE_PDF = '/Users/atulgrover/Desktop/HAYAGRIVA/formats/00_master_originals/08_Voluntary_Liquidation_And_Asset_Sale_Kits/SpeciedistributioninVL.pdf'
STAMP_PDF  = '/Users/atulgrover/Desktop/HAYAGRIVA/formats/00_master_originals/08_Voluntary_Liquidation_And_Asset_Sale_Kits/SaleofImmovablePropertyinLiquidationRegistrationandStampDuty.pdf'

OUT_DIR    = '/Users/atulgrover/Desktop/HAYAGRIVA/formats/02_refined_library/06_Voluntary_Liquidation'

VL_INSTRUMENTS_META = [
    {
        'id': 'VL-01',
        'file': 'VL-01_Section_59_3_a_Declaration_Of_Solvency_By_Directors.md',
        'title': 'Declaration of Solvency by Directors (Form A Companion)',
        'provision': 'Section 59(3)(a) IBC, 2016 read with Regulation 3(1)(a), IBBI (VL Process) Regs, 2017',
        'slash': '/vl-01',
        'aliases': ['/declaration-of-solvency', '/solvency-declaration', '/sec59-solvency'],
        'start_page': 16, 'end_page': 17,
        'category': 'Phase I — Solvency & Pre-Commencement',
        'guidance': 'Mandatory statutory declaration by majority of directors / designated partners. Precedes the members resolution and must be made within 4 weeks prior to the EGM. Must be accompanied by audited balance sheets, profit & loss accounts, and valuation reports of company assets.'
    },
    {
        'id': 'VL-02',
        'file': 'VL-02_Section_59_3_a_Directors_Affidavit_Verifying_Solvency.md',
        'title': 'Directors Affidavit Verifying Declaration of Solvency',
        'provision': 'Section 59(3)(a) IBC, 2016 read with Rule 3 AAA Rules & Section 63 BSA, 2023',
        'slash': '/vl-02',
        'aliases': ['/solvency-affidavit', '/directors-solvency-affidavit'],
        'start_page': 17, 'end_page': 18,
        'category': 'Phase I — Solvency & Pre-Commencement',
        'guidance': 'Solemn affirmation on non-judicial stamp paper by majority of directors verifying that the company is not being liquidated to defraud creditors and possesses sufficient liquid assets to discharge liabilities in full.'
    },
    {
        'id': 'VL-03',
        'file': 'VL-03_Regulation_14_Public_Announcement_Form_A.md',
        'title': 'Public Announcement of Voluntary Liquidation (Form A)',
        'provision': 'Regulation 14 & Schedule I Form A, IBBI (Voluntary Liquidation Process) Regs, 2017',
        'slash': '/vl-03',
        'aliases': ['/vl-form-a', '/vl-public-announcement'],
        'start_page': 18, 'end_page': 19,
        'category': 'Phase I — Commencement',
        'guidance': 'Statutory notice published within 5 days of appointment in one English and one regional language newspaper having wide circulation at the registered office and uploaded on the IBBI web portal.'
    },
    {
        'id': 'VL-04',
        'file': 'VL-04_Section_59_3_c_Special_Resolution_For_Voluntary_Liquidation.md',
        'title': 'Special Resolution of Members for Voluntary Liquidation',
        'provision': 'Section 59(3)(c)(i) IBC, 2016 read with Section 114 Companies Act, 2013',
        'slash': '/vl-04',
        'aliases': ['/vl-special-resolution', '/members-resolution-vl'],
        'start_page': 20, 'end_page': 21,
        'category': 'Phase I — Approvals & Resolutions',
        'guidance': 'Special resolution passed by 75% majority of shareholders in general meeting or special resolution on expiry of period fixed by Articles, appointing the Insolvency Professional as Voluntary Liquidator.'
    },
    {
        'id': 'VL-05',
        'file': 'VL-05_Sections_100_102_Notice_General_Meeting_Explanatory_Statement.md',
        'title': 'Notice of Extraordinary General Meeting & Explanatory Statement',
        'provision': 'Section 59 IBC read with Sections 100, 101 & 102 Companies Act, 2013',
        'slash': '/vl-05',
        'aliases': ['/egm-notice-vl', '/explanatory-statement-vl'],
        'start_page': 22, 'end_page': 24,
        'category': 'Phase I — Approvals & Resolutions',
        'guidance': 'Formal notice summoning EGM on 21 clear days notice (or shorter consent of 95% members) containing material facts concerning appointment, remuneration and basis of liquidation.'
    },
    {
        'id': 'VL-06',
        'file': 'VL-06_Regulations_5_6_Liquidator_Written_Consent_And_Declaration.md',
        'title': 'Voluntary Liquidator Written Consent & Eligibility Declaration',
        'provision': 'Regulations 5 & 6, IBBI (Voluntary Liquidation Process) Regulations, 2017',
        'slash': '/vl-06',
        'aliases': ['/liquidator-consent-vl', '/vl-written-consent'],
        'start_page': 25, 'end_page': 27,
        'category': 'Phase II — Appointment & Commencement',
        'guidance': 'Unconditional written consent from an eligible Insolvency Professional confirming independence from the corporate person, absence of conflict of interest, and valid Authorisation for Assignment (AFA).'
    },
    {
        'id': 'VL-07',
        'file': 'VL-07_Regulations_5_6_Letter_Of_Appointment_Voluntary_Liquidator.md',
        'title': 'Formal Letter of Appointment of Voluntary Liquidator',
        'provision': 'Section 59(3)(c) IBC read with Regulations 5 & 6 IBBI (VL Process) Regs, 2017',
        'slash': '/vl-07',
        'aliases': ['/appointment-letter-liquidator', '/vl-appointment-letter'],
        'start_page': 27, 'end_page': 32,
        'category': 'Phase II — Appointment & Commencement',
        'guidance': 'Binding agreement executing the terms of appointment, custody of assets, takeover of corporate records, power of attorney, and liquidation bank account operations.'
    },
    {
        'id': 'VL-08',
        'file': 'VL-08_Section_59_3_c_Proviso_Creditors_Approval_Resolution.md',
        'title': 'Creditors Approval Resolution (Two-Thirds in Value)',
        'provision': 'Proviso to Section 59(3)(c) IBC, 2016 read with Regulation 3(2)',
        'slash': '/vl-08',
        'aliases': ['/creditors-approval-vl', '/two-thirds-creditors-vl'],
        'start_page': 33, 'end_page': 35,
        'category': 'Phase I — Approvals & Resolutions',
        'guidance': 'Mandatory approval required within 7 days of the members resolution if the corporate person owes any debt, approved by creditors representing two-thirds in value of the total debt.'
    },
    {
        'id': 'VL-09',
        'file': 'VL-09_Section_59_4_Statutory_Intimations_Pack_ROC_IBBI_IncomeTax.md',
        'title': 'Statutory Intimations Pack (ROC MGT-14/GNL-2, IBBI & Income Tax AO)',
        'provision': 'Section 59(4) IBC read with Section 178 Income Tax Act, 1961',
        'slash': '/vl-09',
        'aliases': ['/roc-intimation-vl', '/ibbi-intimation-vl', '/income-tax-intimation-vl'],
        'start_page': 36, 'end_page': 38,
        'category': 'Phase I — Intimations',
        'guidance': 'Triple statutory intimation dispatched within 7 days of approval to: (a) Registrar of Companies via MCA-21 Form MGT-14 & GNL-2, (b) IBBI, and (c) Jurisdictional Assessing Officer under Section 178 of IT Act for tax clearance / NOC.'
    },
    {
        'id': 'VL-10',
        'file': 'VL-10_Regulation_7_Liquidator_Remuneration_Resolution_And_Schedule.md',
        'title': 'Liquidator Remuneration Resolution & Realisation-Distribution Schedule',
        'provision': 'Regulation 7, IBBI (Voluntary Liquidation Process) Regulations, 2017',
        'slash': '/vl-10',
        'aliases': ['/liquidator-fee-vl', '/remuneration-schedule-vl'],
        'start_page': 39, 'end_page': 40,
        'category': 'Phase II — Appointment & Commencement',
        'guidance': 'Resolution approving fixed fee or percentage-based fee on realisation and distribution, forming an exclusive first charge on liquidation proceeds.'
    },
    {
        'id': 'VL-11',
        'file': 'VL-11_Regulation_9_Liquidator_Preliminary_Report.md',
        'title': 'Liquidator Preliminary Report under Regulation 9',
        'provision': 'Regulation 9, IBBI (Voluntary Liquidation Process) Regulations, 2017',
        'slash': '/vl-11',
        'aliases': ['/preliminary-report-vl', '/reg9-report'],
        'start_page': 41, 'end_page': 43,
        'category': 'Phase III — Conduct of Liquidation',
        'guidance': 'Comprehensive report submitted within 45 days of commencement covering: capital structure, estimates of assets & liabilities, proposed plan of action, estimated timeline, and investigation findings under Regulation 9(1)(c).'
    },
    {
        'id': 'VL-12',
        'file': 'VL-12_Regulation_13_Application_To_Avoid_PUFE_Transactions.md',
        'title': 'Application to Avoid Avoidance / PUFE Transactions in Voluntary Liquidation',
        'provision': 'Regulation 13 & Section 59(6) read with Sections 43, 45, 50 & 66 IBC, 2016',
        'slash': '/vl-12',
        'aliases': ['/vl-pufe-app', '/avoidance-vl', '/sec43-vl', '/sec66-vl'],
        'start_page': 44, 'end_page': 46,
        'category': 'Phase III — Avoidance & Inquest',
        'guidance': 'Court pleading before NCLT under Section 60(5) and Section 59(6) where the Liquidator detects preferential, undervalued, extortionate, or fraudulent transactions, seeking ex-parte asset freezes and clawbacks.'
    },
    {
        'id': 'VL-13',
        'file': 'VL-13_Regulation_40_Application_To_Suspend_Voluntary_Liquidation.md',
        'title': 'Application to Suspend Voluntary Liquidation (Insolvency / Fraud Detected)',
        'provision': 'Regulation 40, IBBI (Voluntary Liquidation Process) Regulations, 2017',
        'slash': '/vl-13',
        'aliases': ['/suspend-vl', '/reg40-suspension', '/vl-to-cirp'],
        'start_page': 47, 'end_page': 48,
        'category': 'Phase III — Suspension & Court Referral',
        'guidance': 'Urgent application to Adjudicating Authority (NCLT) where the Liquidator determines that the corporate person will not be able to pay debts in full or has committed fraud, seeking transition into CIRP or compulsory liquidation.'
    },
    {
        'id': 'VL-14',
        'file': 'VL-14_Regulation_10_Registers_And_Books_Of_Account_Protocols.md',
        'title': 'Statutory Registers & Books of Account Maintenance Protocol',
        'provision': 'Regulation 10, IBBI (Voluntary Liquidation Process) Regulations, 2017',
        'slash': '/vl-14',
        'aliases': ['/statutory-registers-vl', '/books-protocol-vl'],
        'start_page': 49, 'end_page': 50,
        'category': 'Phase III — Conduct of Liquidation',
        'guidance': 'Prescribes the mandatory registers: Cash Book, Bank Ledger, Register of Assets, Register of Debts, Register of Claims, and minutes of consultations to be maintained for statutory audit.'
    },
    {
        'id': 'VL-15',
        'file': 'VL-15_Regulation_34_Opening_Of_Liquidation_Bank_Account.md',
        'title': 'Opening of Designated Liquidation Bank Account Protocol',
        'provision': 'Regulation 34, IBBI (Voluntary Liquidation Process) Regulations, 2017',
        'slash': '/vl-15',
        'aliases': ['/liquidation-bank-account', '/reg34-bank-account'],
        'start_page': 51, 'end_page': 52,
        'category': 'Phase III — Conduct of Liquidation',
        'guidance': 'Resolution and bank mandate for opening a designated bank account with a scheduled commercial bank in the name of the corporate person followed by "in voluntary liquidation", with all preexisting operational accounts closed.'
    },
    {
        'id': 'VL-16',
        'file': 'VL-16_Regulations_28_30_Claims_Pack_Receipt_Verification_Decision.md',
        'title': 'Master Claims Verification & Admissibility Decision Memo (Forms B, C, D, E, F)',
        'provision': 'Regulations 16, 17, 18, 19, 29 & 30 IBBI (VL Process) Regs, 2017',
        'slash': '/vl-16',
        'aliases': ['/vl-claims-memo', '/claims-pack-vl', '/claims-verification-vl'],
        'start_page': 53, 'end_page': 55,
        'category': 'Phase III — Claims & Verification',
        'guidance': 'Statutory verification framework across Operational Creditors (Form B), Financial Creditors (Form C), Workmen & Employees (Form D/E), and other stakeholders (Form F), verifying proof within 30 days.'
    },
    {
        'id': 'VL-17',
        'file': 'VL-17_Regulation_20_Secured_Creditor_Proof_Of_Security_Interest.md',
        'title': 'Secured Creditor Proof of Security Interest & Realisation / Relinquishment Notice',
        'provision': 'Regulation 20, IBBI (Voluntary Liquidation Process) Regulations, 2017',
        'slash': '/vl-17',
        'aliases': ['/secured-creditor-vl', '/proof-of-security-vl'],
        'start_page': 56, 'end_page': 58,
        'category': 'Phase III — Claims & Verification',
        'guidance': 'Formal intimation proving valid registration of charge under Section 77 Companies Act or CERSAI, declaring whether the secured creditor relinquishes security interest to the liquidation estate under Section 52.'
    },
    {
        'id': 'VL-18',
        'file': 'VL-18_Regulation_20_Request_Proof_Of_Charge_ROC_CERSAI.md',
        'title': 'Requisition to Creditor for Proof of Charge — ROC (Form CHG-2) & CERSAI',
        'provision': 'Regulation 20(2) IBBI (VL Process) Regs read with Section 77 Companies Act, 2013',
        'slash': '/vl-18',
        'aliases': ['/roc-charge-proof', '/cersai-proof-req'],
        'start_page': 59, 'end_page': 61,
        'category': 'Phase III — Claims & Verification',
        'guidance': 'Liquidator statutory requisition disallowing secured status where the charge is unregistered under Section 77(3) of Companies Act, 2013, relegating the claimant to unsecured financial creditor ranking.'
    },
    {
        'id': 'VL-19',
        'file': 'VL-19_Regulation_30_List_Of_Stakeholders_Ledger.md',
        'title': 'Master List of Stakeholders & Admitted Claims Ledger',
        'provision': 'Regulation 30, IBBI (Voluntary Liquidation Process) Regulations, 2017',
        'slash': '/vl-19',
        'aliases': ['/list-of-stakeholders-vl', '/stakeholders-ledger-vl'],
        'start_page': 62, 'end_page': 63,
        'category': 'Phase III — Stakeholders Ledger',
        'guidance': 'Statutory ledger prepared within 45 days from the last date for receipt of claims, detailing claim amount, amount admitted, extent of security, and voting/consultation entitlement.'
    },
    {
        'id': 'VL-20',
        'file': 'VL-20_Regulation_12_Assistance_And_Consultation_With_Stakeholders.md',
        'title': 'Stakeholders Consultation Meeting Notice & Minutes Protocol',
        'provision': 'Regulation 12, IBBI (Voluntary Liquidation Process) Regulations, 2017',
        'slash': '/vl-20',
        'aliases': ['/stakeholder-consultation-vl', '/consultation-minutes-vl'],
        'start_page': 64, 'end_page': 65,
        'category': 'Phase III — Stakeholders Consultation',
        'guidance': 'Notice, agenda, and minutes of consultation meetings with contributors and creditors shaping realisation of assets and settlement of liabilities.'
    },
    {
        'id': 'VL-21',
        'file': 'VL-21_Regulation_31_Asset_Sale_And_Realisation_Strategy.md',
        'title': 'Asset Sale & Realisation Strategy Document for Approval of Corporate Person',
        'provision': 'Regulation 31, IBBI (Voluntary Liquidation Process) Regulations, 2017',
        'slash': '/vl-21',
        'aliases': ['/asset-sale-strategy-vl', '/realisation-strategy-vl'],
        'start_page': 66, 'end_page': 69,
        'category': 'Phase III — Realisation of Assets',
        'guidance': 'Master realization framework evaluating: private treaty vs e-auction, reserve prices based on registered valuations, marketing strategy, and timeline for completion.'
    },
    {
        'id': 'VL-22',
        'file': 'VL-22_Section_59_Regulation_31_E_Auction_Process_Information_Document.md',
        'title': 'E-Auction Process Information Document (Terms & Conditions of Sale)',
        'provision': 'Section 59 IBC read with Regulation 31 & Schedule I IBBI Liquidation Regs',
        'slash': '/vl-22',
        'aliases': ['/eauction-vl', '/auction-process-doc-vl'],
        'start_page': 70, 'end_page': 78,
        'category': 'Phase III — Realisation of Assets',
        'guidance': 'Comprehensive bid document setting out asset lot descriptions, eligibility under Section 29A, EMD deposits, bidding portal credentials, incremental bidding steps, and forfeiture terms.'
    },
    {
        'id': 'VL-23',
        'file': 'VL-23_Section_53_Regulations_34_35_Realisation_And_Distribution_Statement.md',
        'title': 'Realisation & Distribution Statement under Section 53 Waterfall',
        'provision': 'Section 53 IBC read with Regulations 34 & 35 IBBI (VL Process) Regs, 2017',
        'slash': '/vl-23',
        'aliases': ['/distribution-statement-vl', '/sec53-waterfall-vl'],
        'start_page': 79, 'end_page': 80,
        'category': 'Phase III — Distribution',
        'guidance': 'Audited waterfall ledger accounting for gross realisation, deduction of voluntary liquidation costs, payment of statutory dues, unsecured creditor payouts, and distribution of surplus capital to equity/preference shareholders.'
    },
    {
        'id': 'VL-24',
        'file': 'VL-24_Regulations_8_35_Status_Report_Annual_Timeline_Exceeded.md',
        'title': 'Annual Status Report (Where Process Exceeds Stipulated Period)',
        'provision': 'Regulation 8 & Regulation 37(1), IBBI (VL Process) Regulations, 2017',
        'slash': '/vl-24',
        'aliases': ['/vl-status-report', '/timeline-exceeded-report-vl'],
        'start_page': 81, 'end_page': 82,
        'category': 'Phase III — Conduct of Liquidation',
        'guidance': 'Statutory report presented to general meeting of members and submitted to IBBI/ROC where voluntary liquidation continues beyond 90 days (or 270 days where creditors exist), stating reasons for delay.'
    },
    {
        'id': 'VL-25',
        'file': 'VL-25_Regulation_37_Resolution_For_Continuation_Beyond_Period.md',
        'title': 'Members Resolution for Continuation of Voluntary Liquidation',
        'provision': 'Regulation 37(2), IBBI (Voluntary Liquidation Process) Regulations, 2017',
        'slash': '/vl-25',
        'aliases': ['/vl-continuation-resolution', '/extend-vl-period'],
        'start_page': 83, 'end_page': 84,
        'category': 'Phase III — Conduct of Liquidation',
        'guidance': 'Resolution passed by contributors specifying reasons for continuing the liquidation and fixing an extended target date for completion.'
    },
    {
        'id': 'VL-26',
        'file': 'VL-26_Regulation_38_Liquidator_Final_Report.md',
        'title': 'Liquidator Final Report on Completion of Voluntary Liquidation',
        'provision': 'Regulation 38(1) & (2), IBBI (Voluntary Liquidation Process) Regulations, 2017',
        'slash': '/vl-26',
        'aliases': ['/final-report-vl', '/reg38-final-report'],
        'start_page': 85, 'end_page': 87,
        'category': 'Phase IV — Closure & Dissolution',
        'guidance': 'Comprehensive closure dossier submitted to ROC, IBBI and Adjudicating Authority containing: audited accounts showing nil assets and liabilities, disposal of all assets, and statement that no litigation is pending.'
    },
    {
        'id': 'VL-27',
        'file': 'VL-27_Regulation_38_Independent_Auditor_Certificate_Receipts_And_Payments.md',
        'title': 'Independent Chartered Accountant Certificate on Receipts and Payments',
        'provision': 'Regulation 38(1)(a), IBBI (Voluntary Liquidation Process) Regulations, 2017',
        'slash': '/vl-27',
        'aliases': ['/ca-certificate-vl', '/receipts-payments-cert-vl'],
        'start_page': 88, 'end_page': 89,
        'category': 'Phase IV — Closure & Dissolution',
        'guidance': 'Statutory audit certificate by a practicing Chartered Accountant confirming receipts and disbursements from the liquidation commencement date to the final closure date, verifying bank reconciliation.'
    },
    {
        'id': 'VL-28',
        'file': 'VL-28_Regulation_39_Transfer_Unclaimed_Proceeds_Corporate_VL_Account.md',
        'title': 'Transfer of Unclaimed Proceeds & Undistributed Assets to Corporate VL Account',
        'provision': 'Regulation 39, IBBI (Voluntary Liquidation Process) Regulations, 2017',
        'slash': '/vl-28',
        'aliases': ['/unclaimed-proceeds-vl', '/reg39-transfer-ibbi'],
        'start_page': 90, 'end_page': 91,
        'category': 'Phase IV — Closure & Dissolution',
        'guidance': 'Challan and intimation transferring unclaimed dividends or undistributed asset values into the Public Account of India (Corporate Voluntary Liquidation Account with IBBI).'
    },
    {
        'id': 'VL-29',
        'file': 'VL-29_Regulation_41_Preservation_Of_Records_Protocol.md',
        'title': 'Preservation of Physical & Electronic Records Master Protocol',
        'provision': 'Regulation 41, IBBI (Voluntary Liquidation Process) Regulations, 2017',
        'slash': '/vl-29',
        'aliases': ['/preservation-records-vl', '/reg41-records'],
        'start_page': 92, 'end_page': 92,
        'category': 'Phase IV — Closure & Dissolution',
        'guidance': 'Protocol ensuring all physical books, statutory registers, and electronic records are securely preserved for a minimum period of 8 years from the dissolution date.'
    },
    {
        'id': 'VL-30',
        'file': 'VL-30_Section_59_7_Application_To_NCLT_For_Final_Dissolution.md',
        'title': 'Application to NCLT for Final Dissolution of Corporate Person',
        'provision': 'Section 59(7) IBC, 2016 read with Regulation 38 & NCLT Rules, 2016',
        'slash': '/vl-30',
        'aliases': ['/dissolution-app-vl', '/sec59-dissolution', '/dissolution-petition'],
        'start_page': 93, 'end_page': 94,
        'category': 'Phase IV — Closure & Dissolution',
        'guidance': 'Final statutory court petition before the National Company Law Tribunal praying for an order dissolving the corporate person from the date of the order, directing RoC to strike off name from register.'
    },
    {
        'id': 'VL-31',
        'file': 'VL-31_Section_59_7_Dissolution_Application_Pre_Filing_Checklist.md',
        'title': 'Dissolution Application Pre-Filing Consistency & Compliance Checklist',
        'provision': 'Section 59(7) IBC read with Rule 34 NCLT Rules, 2016',
        'slash': '/vl-31',
        'aliases': ['/dissolution-checklist-vl', '/prefiling-checklist-vl'],
        'start_page': 95, 'end_page': 97,
        'category': 'Phase IV — Closure & Dissolution',
        'guidance': 'Comprehensive 30-point gatekeeper checklist verifying newspaper tearsheets, bank closure certificates, RoC filing receipts, IT NOCs, and Section 63 BSA evidence certificates.'
    },
    {
        'id': 'VL-32',
        'file': 'VL-32_Section_59_5A_Termination_Withdrawal_Of_VL_Proceedings_Form_J.md',
        'title': 'Termination (Withdrawal) of Voluntary Liquidation Proceedings & Form J Dossier',
        'provision': 'Section 59(5A)–(5C) IBC read with Regulation 42 & Form J (2026)',
        'slash': '/vl-32',
        'aliases': ['/vl-termination', '/withdraw-vl', '/form-j-vl'],
        'start_page': 98, 'end_page': 106,
        'category': 'Phase V — Termination / Withdrawal',
        'guidance': 'Complete filing kit where members resolve to withdraw/terminate voluntary liquidation prior to dissolution, submitting Form J to NCLT, ROC, and IBBI, restoring corporate status.'
    },
    {
        'id': 'VL-33',
        'file': 'VL-33_Regulation_41A_Forms_VL1_To_VL4_Filing_Tracker_And_Compliance_Note.md',
        'title': 'Electronic Monitoring Forms VL1 to VL4 Filing Tracker & Compliance Note',
        'provision': 'Regulation 41A, IBBI (VL Process) Regs read with Circular dated 28.06.2024',
        'slash': '/vl-33',
        'aliases': ['/vl-forms-tracker', '/vl1-vl4-tracker', '/ibbi-vl-monitoring'],
        'start_page': 107, 'end_page': 108,
        'category': 'Electronic Monitoring Forms',
        'guidance': 'Statutory guidance tracking online electronic reporting on the IBBI portal: Form VL1 (Commencement), Form VL2 (Preliminary Report), Form VL3 (Status Report), and Form VL4 (Final Report).'
    }
]

def sanitize_and_mustache(text):
    # Strip CA RK Gupta phone numbers, emails, and channels
    t = re.sub(r'CA\s+RK\s+Gupta[^\n]*', '', text, flags=re.I)
    t = re.sub(r'Mobile\s*\+?91[-0-9\s]+', '', t, flags=re.I)
    t = re.sub(r'rkg4247@gmail\.com', '', t, flags=re.I)
    t = re.sub(r'www\.carkgupta\.com', '', t, flags=re.I)
    t = re.sub(r'YouTube\s*@CARKGUPTA', '', t, flags=re.I)
    t = re.sub(r'Drafting\s+note\.\s*', '', t, flags=re.I)

    # Convert common bracketed placeholders into clean double-brace mustache tags
    replacements = [
        (r'\[name of the company\]', '{{corporate_debtor_name}}'),
        (r'\[name of the corporate person\]', '{{corporate_debtor_name}}'),
        (r'\[Name of the Corporate Person\]', '{{corporate_debtor_name}}'),
        (r'\[Company Name\]', '{{corporate_debtor_name}}'),
        (r'\[name of company\]', '{{corporate_debtor_name}}'),
        (r'\[CIN\]', '{{corporate_debtor_cin}}'),
        (r'bearing CIN\s*\[\s*[•\s_]*\s*\]', 'bearing CIN {{corporate_debtor_cin}}'),
        (r'registered office at\s*\[\s*[•\s_]*\s*\]', 'registered office at {{registered_office_address}}'),
        (r'having its registered office at\s*\[\s*[•\s_]*\s*\]', 'having its registered office at {{registered_office_address}}'),
        (r'\[registered office address\]', '{{registered_office_address}}'),
        (r'\[name of the liquidator\]', '{{liquidator_name}}'),
        (r'\[Name of the Voluntary Liquidator\]', '{{liquidator_name}}'),
        (r'\[Name of Liquidator\]', '{{liquidator_name}}'),
        (r'\[registration number\]', '{{liquidator_ibbi_reg}}'),
        (r'\[IBBI Registration Number\]', '{{liquidator_ibbi_reg}}'),
        (r'\[email address\]', '{{liquidator_email}}'),
        (r'\[date\]', '{{date_of_instrument}}'),
        (r'\[Date\]', '{{date_of_instrument}}'),
        (r'\[liquidation commencement date\]', '{{liquidation_commencement_date}}'),
        (r'\[commencement date\]', '{{liquidation_commencement_date}}'),
        (r'\[NCLT Bench\]', '{{nclt_bench_name}}'),
        (r'\[Bench\]', '{{nclt_bench_name}}'),
        (r'\[amount\]', '{{amount_inr}}'),
        (r'\[Amount in Rs\.\]', '{{amount_inr}}'),
        (r'\[•\]', '{{unresolved_parameter}}'),
        (r'Section 65B of the Indian Evidence Act, 1872', 'Section 63 of the Bharatiya Sakshya Adhiniyam, 2023 (BSA)'),
        (r'Section 65B', 'Section 63 BSA, 2023')
    ]

    for pat, rep in replacements:
        t = re.sub(pat, rep, t, flags=re.I)

    # Standardize underlines
    t = re.sub(r'_{4,}', '{{unresolved_parameter}}', t)
    
    return t.strip()

def build_instrument_markdown(meta, raw_text):
    clean_body = sanitize_and_mustache(raw_text)

    # Extract tags
    tags = sorted(list(set(re.findall(r'\{\{([a-zA-Z0-9_]+)\}\}', clean_body))))

    # YAML Frontmatter
    lines = [
        "---",
        f'instrument_id: "{meta["id"]}"',
        f'title: "{meta["title"]}"',
        f'statutory_provision: "{meta["provision"]}"',
        'jurisdiction: "National Company Law Tribunal (NCLT) / ROC / IBBI"',
        f'monaco_slash_command: "{meta["slash"]}"',
        "monaco_aliases:"
    ]
    for al in meta['aliases']:
        lines.append(f'  - "{al}"')

    lines.extend([
        'category: "06_Voluntary_Liquidation"',
        'evidence_certificate: "Section 63 Bharatiya Sakshya Adhiniyam, 2023 (BSA)"',
        "required_kv_variables:"
    ])
    for t in tags[:15]:
        lines.append(f'  - {t}')
    lines.append("---\n\n")

    # Header & Practical Chamber Guidance
    content = "\n".join(lines)
    content += f"# {meta['id']} — {meta['title']}\n\n"
    content += f"> [!NOTE] Practical Chamber Guidance (2026 Legal Standard)\n"
    content += f"> {meta['guidance']}\n\n"
    content += f"## {meta['title']}\n"
    content += f"**Statutory Authority:** {meta['provision']}  \n"
    content += f"**Corporate Person:** **{{{{corporate_debtor_name}}}}** (CIN: {{{{corporate_debtor_cin}}}})  \n"
    content += f"**Voluntary Liquidator:** **{{{{liquidator_name}}}}** (IBBI Reg. No.: {{{{liquidator_ibbi_reg}}}})  \n\n"
    content += "---\n\n"

    content += clean_body + "\n\n"

    # Add Watertight Statements of Truth for Court Applications
    if 'Application' in meta['title'] or 'Dissolution' in meta['title'] or 'PUFE' in meta['title']:
        content += """
---

### Statement of Truth & Verification under Order VI Rule 15A CPC & Section 63 BSA, 2023

1. I, **{{deponent_name}}**, son/daughter of **{{deponent_parent_name}}**, aged about **{{deponent_age}}** years, presently residing at **{{deponent_address}}**, do hereby solemnly affirm and state as under:
2. I am the Voluntary Liquidator / authorized signatory of the Corporate Person and am fully conversant with the facts of the present case and competent to swear this affidavit.
3. I state that the statements made in the foregoing paragraphs are true and correct to my knowledge derived from the statutory books, bank ledgers, audited accounts, and public records of the Corporate Person.
4. I say that all digital and electronic records annexed hereto are true copies of documents produced by electronic computing devices under my direct lawful control and custody, complying fully with the mandatory conditions laid down under **Section 63 of the Bharatiya Sakshya Adhiniyam, 2023 (BSA)**.
5. I solemnly verify that no part of this affidavit is false and nothing material has been concealed therefrom.

**DEPONENT**

**VERIFICATION:**  
Verified at **{{execution_place}}** on this **{{execution_date}}** that the contents of the above affidavit are true and correct to the best of my knowledge and belief. No part of it is false and nothing material has been concealed therefrom.

**DEPONENT**
"""

    return content

def extract_and_refine_all():
    os.makedirs(OUT_DIR, exist_ok=True)
    reader = pypdf.PdfReader(VL_KIT_PDF)

    print("═════════════════════════════════════════════════════════════════")
    print(f"🏛️  Extracting & Refining Voluntary Liquidation Library (Section 59)")
    print("═════════════════════════════════════════════════════════════════\n")

    results = []
    for meta in VL_INSTRUMENTS_META:
        sp = meta['start_page'] - 1
        ep = meta['end_page']
        raw_text = ""
        for p in range(sp, min(ep, len(reader.pages))):
            raw_text += reader.pages[p].extract_text() + "\n"

        doc_md = build_instrument_markdown(meta, raw_text)
        out_path = os.path.join(OUT_DIR, meta['file'])
        with open(out_path, 'w', encoding='utf-8') as f:
            f.write(doc_md)

        stat = os.stat(out_path)
        print(f"✓ {meta['id']:6s} | {meta['title'][:45]:45s} | {stat.st_size // 1024:3d} KB | {meta['slash']}")
        results.append({
            'id': meta['id'],
            'title': meta['title'],
            'file': meta['file'],
            'slash': meta['slash'],
            'size_kb': stat.st_size // 1024
        })

    # Instrument 34: Specie Distribution Protocol from SpeciedistributioninVL.pdf
    print("\n📦 Processing VL-34 from SpeciedistributioninVL.pdf...")
    reader_specie = pypdf.PdfReader(SPECIE_PDF)
    text_specie = ""
    for page in reader_specie.pages:
        text_specie += page.extract_text() + "\n"

    meta_specie = {
        'id': 'VL-34',
        'file': 'VL-34_Section_59_In_Specie_Asset_Distribution_Protocol_Indemnity_Bond.md',
        'title': 'In-Specie Asset Distribution Protocol & Shareholder Indemnity Bond',
        'provision': 'Section 59 IBC read with Regulation 31 & Income Tax Act, 1961',
        'slash': '/vl-34',
        'aliases': ['/specie-distribution-vl', '/in-specie-distribution'],
        'category': 'Phase III — Realisation & Distribution',
        'guidance': 'Legal protocol and binding shareholder indemnity bond for distributing physical assets / shares in-specie to contributors where auction sale is non-feasible, complying with fair market valuation and capital gains tax rules.'
    }
    doc_specie = build_instrument_markdown(meta_specie, text_specie)
    out_specie = os.path.join(OUT_DIR, meta_specie['file'])
    with open(out_specie, 'w', encoding='utf-8') as f:
        f.write(doc_specie)
    print(f"✓ VL-34  | {meta_specie['title'][:45]:45s} | {os.stat(out_specie).st_size // 1024:3d} KB | /vl-34")
    results.append({'id': 'VL-34', 'title': meta_specie['title'], 'file': meta_specie['file'], 'slash': '/vl-34', 'size_kb': os.stat(out_specie).st_size // 1024})

    # Instrument 35: Stamp Duty & Registration of Auction Sale Certificate from SaleofImmovablePropertyinLiquidationRegistrationandStampDuty.pdf
    print("\n📦 Processing VL-35 from SaleofImmovablePropertyinLiquidationRegistrationandStampDuty.pdf...")
    reader_stamp = pypdf.PdfReader(STAMP_PDF)
    text_stamp = ""
    for page in reader_stamp.pages:
        text_stamp += page.extract_text() + "\n"

    meta_stamp = {
        'id': 'VL-35',
        'file': 'VL-35_Liquidation_Sale_Certificate_Stamp_Duty_And_Registration_Protocol.md',
        'title': 'Liquidation Sale Certificate Stamp Duty & Registration Adjudication Protocol',
        'provision': 'Schedule I IBBI Liquidation Regs read with Registration Act, 1908 & Indian Stamp Act, 1899',
        'slash': '/vl-35',
        'aliases': ['/stamp-duty-sale-certificate', '/liquidation-registration-protocol'],
        'category': 'Realisation of Assets — Asset Sales',
        'guidance': 'Judicial memorandum and legal brief establishing that an auction sale certificate issued by the Liquidator is a document of title, setting out the procedure for adjudication of stamp duty and registration before the Sub-Registrar of Assurances.'
    }
    doc_stamp = build_instrument_markdown(meta_stamp, text_stamp)
    out_stamp = os.path.join(OUT_DIR, meta_stamp['file'])
    with open(out_stamp, 'w', encoding='utf-8') as f:
        f.write(doc_stamp)
    print(f"✓ VL-35  | {meta_stamp['title'][:45]:45s} | {os.stat(out_stamp).st_size // 1024:3d} KB | /vl-35")
    results.append({'id': 'VL-35', 'title': meta_stamp['title'], 'file': meta_stamp['file'], 'slash': '/vl-35', 'size_kb': os.stat(out_stamp).st_size // 1024})

    # Save Audit Report
    audit_path = '/Users/atulgrover/Desktop/HAYAGRIVA/formats/vl_refinement_audit_report.md'
    with open(audit_path, 'w', encoding='utf-8') as f:
        f.write("# Voluntary Liquidation Library (Section 59) — Refinement & Standardization Audit Report\n\n")
        f.write(f"**Total Instruments Refined:** {len(results)}\n")
        f.write(f"**Directory:** `formats/02_refined_library/06_Voluntary_Liquidation/`\n\n")
        f.write("| ID | Title | File Name | Monaco Slash | Size |\n")
        f.write("| :--- | :--- | :--- | :--- | :--- |\n")
        for r in results:
            f.write(f"| **{r['id']}** | {r['title']} | `{r['file']}` | `{r['slash']}` | {r['size_kb']} KB |\n")

    print("\n═════════════════════════════════════════════════════════════════")
    print(f"✨ Successfully refined and created {len(results)} Section 59 legal instruments!")
    print(f"📁 Location: {OUT_DIR}")
    print(f"📄 Audit Report: {audit_path}")
    print("═════════════════════════════════════════════════════════════════\n")

if __name__ == '__main__':
    extract_and_refine_all()
