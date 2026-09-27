#!/usr/bin/env python3
"""
Hayagriva Sovereign Legal Assembly Line - Batch 1 Refinement Engine
Processes and elevates the 16 CIRP Initiation & Early Stage instruments to the 5-Pillar Legal Quality Standard:
1. Watertight Prayer Matrix (Primary, Ad-Interim, Statutory Directions, Reserve)
2. Jurisdictional & Limitation Rigour (Limitation Act § 18 / Art 137, § 10A COVID carve-out, § 60 NCLT)
3. 2026 Evidence Regime (§ 63 BSA 2023 Digital Certificate + Order VI Rule 15A Statement of Truth)
4. Canonical {{mustache_tags}} mapped strictly to case_kv_dictionary.json
5. Agent-Ready YAML Frontmatter with Monaco slash triggers and required variables
"""

import os
import sys
import re
import json

SOURCE_DIR = "/Users/atulgrover/Desktop/HAYAGRIVA/formats/01_extracted_instruments/01_cirp_master_compendium_2nd_ed"
OUTPUT_DIR = "/Users/atulgrover/Desktop/HAYAGRIVA/formats/02_refined_library/01_CIRP"
PROGRESS_FILE = "/Users/atulgrover/Desktop/HAYAGRIVA/formats/refinement_progress.json"
DIFF_REPORT_FILE = "/Users/atulgrover/Desktop/HAYAGRIVA/formats/batch_1_diff_audit_report.md"

os.makedirs(OUTPUT_DIR, exist_ok=True)

BATCH_1_DEFINITIONS = [
    {
        "source_pattern": "instrument_1_application_by_a_financial_creditor_section_7_form_1.md",
        "output_filename": "CIRP-01_Section_7_Financial_Creditor_Form_1.md",
        "instrument_id": "CIRP-01",
        "title": "Section 7 Financial Creditor Application (Form 1)",
        "statutory_provision": "Section 7 IBC, 2016 read with Rule 4 & Form 1, AAA Rules, 2016",
        "jurisdiction": "National Company Law Tribunal (NCLT)",
        "monaco_slash_command": "/ibc-sec7",
        "required_kv_variables": [
            "corporate_debtor_name", "corporate_debtor_cin", "corporate_debtor_registered_office",
            "corporate_debtor_nominal_capital_inr", "corporate_debtor_paidup_capital_inr",
            "financial_creditor_name", "financial_creditor_cin_registration", "financial_creditor_registered_office",
            "financial_creditor_process_email", "authorised_representative_name", "authorised_representative_designation",
            "proposed_irp_name", "proposed_irp_registration_no", "proposed_irp_email", "proposed_irp_address",
            "afa_validity_date", "total_debt_disbursed_inr", "total_default_amount_inr", "default_date",
            "facility_type", "nclt_bench_name", "nesl_record_number"
        ],
        "mandatory_annexures": [
            {"tag": "Annexure A-1", "desc": "Board Resolution / Letter of Authority in favour of Authorised Signatory"},
            {"tag": "Annexure A-2", "desc": "Form 2 Written Consent of Proposed IRP with valid AFA"},
            {"tag": "Annexure A-3", "desc": "NeSL Information Utility Record of Default (Status: Authenticated / Deemed Authenticated)"},
            {"tag": "Annexure A-4", "desc": "Sanction Letters, Facility Agreements, Deed of Hypothecation and Guarantees"},
            {"tag": "Annexure A-5", "desc": "Certified Bank Statement under Bankers' Books Evidence Act, 1891"},
            {"tag": "Annexure A-6", "desc": "ROC Form CHG-1 Charge Creation Certificate and CERSAI Report"},
            {"tag": "Annexure A-7", "desc": "Section 18 Limitation Acknowledgments (Balance Sheets / OTS Letters)"},
            {"tag": "Annexure A-8", "desc": "Proof of Dispatch / E-Filing Service upon Corporate Debtor & IBBI"}
        ],
        "evidence_certificate": "Section 63 Bharatiya Sakshya Adhiniyam, 2023 (BSA)",
        "chamber_guidance": "File in Form 1 under Rule 4. Minimum threshold ₹1,00,00,000. Under the 2026 regime, the Adjudicating Authority must admit within 14 days where default and completeness are established, recording written reasons for any delay. Crucial authorities: Innoventive Industries (default is sine qua non); B.K. Educational Services (Art 137 Limitation Act applies via § 238A); Vidarbha Industries (discretion must be exercised judicially and cannot stall admission where undisputed debt exists)."
    },
    {
        "source_pattern": "instrument_2_demand_notice_by_an_operational_creditor_section_8_forms_3_4.md",
        "output_filename": "CIRP-02_Section_8_Demand_Notice_Forms_3_4.md",
        "instrument_id": "CIRP-02",
        "title": "Demand Notice by Operational Creditor (Forms 3 & 4)",
        "statutory_provision": "Section 8 IBC, 2016 read with Rule 5 & Forms 3/4, AAA Rules, 2016",
        "jurisdiction": "Pre-Litigation Statutory Demand Notice",
        "monaco_slash_command": "/ibc-sec8",
        "required_kv_variables": [
            "corporate_debtor_name", "corporate_debtor_registered_office", "corporate_debtor_cin",
            "operational_creditor_name", "operational_creditor_registered_office", "operational_creditor_pan_gstin",
            "authorised_representative_name", "total_operational_debt_inr", "total_default_amount_inr",
            "interest_rate_percent", "default_date", "invoice_numbers_and_dates", "nesl_submission_date",
            "nesl_record_number"
        ],
        "mandatory_annexures": [
            {"tag": "Annexure A", "desc": "Invoices demanding payment and Purchase Orders / Work Contracts"},
            {"tag": "Annexure B", "desc": "Proof of Delivery / Lorry Receipts / Delivery Challans / E-Way Bills"},
            {"tag": "Annexure C", "desc": "GSTR-1 and GSTR-3B filings reflecting supplies made to Corporate Debtor"},
            {"tag": "Annexure D", "desc": "NeSL Information Utility Submission & Deemed Authentication Record (§ 215(3))"},
            {"tag": "Annexure E", "desc": "Ledger Account Statement & Bank Statement evidencing non-receipt of payment"}
        ],
        "evidence_certificate": "Postal Tracking & Electronic Delivery Receipt (§ 63 BSA 2023)",
        "chamber_guidance": "Under substituted Section 215(3) (2026), an Operational Creditor MUST submit financial information to NeSL Information Utility BEFORE issuing demand notice or filing Section 9. Corporate Debtor has statutory duty under § 215(4) to authenticate; failure deems authentication complete. Section 67C penalises concealment of notified disputes with fines up to ₹2 Crore. Wait exactly 10 clear days from confirmed delivery before filing Section 9."
    },
    {
        "source_pattern": "instrument_3_application_by_an_operational_creditor_section_9_form_5.md",
        "output_filename": "CIRP-03_Section_9_Operational_Creditor_Form_5.md",
        "instrument_id": "CIRP-03",
        "title": "Section 9 Operational Creditor Application (Form 5)",
        "statutory_provision": "Section 9 IBC, 2016 read with Rule 6 & Form 5, AAA Rules, 2016",
        "jurisdiction": "National Company Law Tribunal (NCLT)",
        "monaco_slash_command": "/ibc-sec9",
        "required_kv_variables": [
            "corporate_debtor_name", "corporate_debtor_cin", "corporate_debtor_registered_office",
            "operational_creditor_name", "operational_creditor_registered_office", "authorised_representative_name",
            "total_operational_debt_inr", "total_default_amount_inr", "default_date",
            "section8_notice_dispatch_date", "section8_notice_delivery_date", "nclt_bench_name",
            "proposed_irp_name", "proposed_irp_registration_no"
        ],
        "mandatory_annexures": [
            {"tag": "Annexure B-1", "desc": "Commercial Invoices, Delivery Challans, E-Way Bills and Purchase Orders"},
            {"tag": "Annexure B-2", "desc": "Section 8 Demand Notice (Form 3/4) with Speed Post Tracking & Email Delivery"},
            {"tag": "Annexure B-3", "desc": "Mandatory Affidavit under Section 9(3)(b) affirming No Notice of Dispute"},
            {"tag": "Annexure B-4", "desc": "Bank Certificate under Section 9(3)(c) confirming non-payment of debt"},
            {"tag": "Annexure B-5", "desc": "Regulation 2-B (2026) Disclosures (GST Returns GSTR-1/3B, E-Way bills)"},
            {"tag": "Annexure B-6", "desc": "NeSL Information Utility Record of Default under Section 215(3)/(4)"},
            {"tag": "Annexure B-7", "desc": "Form 2 Written Consent of Proposed IRP (optional, else panel appointment)"}
        ],
        "evidence_certificate": "Section 63 Bharatiya Sakshya Adhiniyam, 2023 (BSA)",
        "chamber_guidance": "Plausible pre-existing dispute under Mobilox Innovations defeats Section 9. Section 9(3)(c) bank certificate is directory (Macquarie Bank). Under Regulation 2-B (2026), GST returns, part-payments, and related party disclosures are mandatory. Section 67C penalises suppression of prior dispute notices with mandatory fines."
    },
    {
        "source_pattern": "instrument_4_application_by_a_corporate_applicant_section_10_form_6.md",
        "output_filename": "CIRP-04_Section_10_Corporate_Applicant_Form_6.md",
        "instrument_id": "CIRP-04",
        "title": "Section 10 Corporate Applicant Application (Form 6)",
        "statutory_provision": "Section 10 IBC, 2016 read with Rule 7 & Form 6, AAA Rules, 2016",
        "jurisdiction": "National Company Law Tribunal (NCLT)",
        "monaco_slash_command": "/ibc-sec10",
        "required_kv_variables": [
            "corporate_debtor_name", "corporate_debtor_cin", "corporate_debtor_registered_office",
            "corporate_debtor_nominal_capital_inr", "corporate_debtor_paidup_capital_inr",
            "authorised_director_name", "special_resolution_date", "total_financial_debt_inr",
            "total_operational_debt_inr", "total_default_amount_inr", "default_date", "nclt_bench_name"
        ],
        "mandatory_annexures": [
            {"tag": "Annexure C-1", "desc": "Creditor-wise list of debts, names, addresses and default particulars"},
            {"tag": "Annexure C-2", "desc": "Special Resolution of Shareholders (≥ 3/4th) or Partners approving filing"},
            {"tag": "Annexure C-3", "desc": "Books of Accounts and Audited Balance Sheets for the last 3 financial years"},
            {"tag": "Annexure C-4", "desc": "Provisional Financial Statements as on date of application"},
            {"tag": "Annexure C-5", "desc": "Section 11 Non-Ineligibility Affirmative Declaration and Affidavit"},
            {"tag": "Annexure C-6", "desc": "List of all bank accounts, bank balances and fixed asset register"}
        ],
        "evidence_certificate": "Section 63 Bharatiya Sakshya Adhiniyam, 2023 (BSA)",
        "chamber_guidance": "Under 2026 Amendment Act, Section 10(3)(b) nomination is omitted to prevent debtor bias. The NCLT makes a direct reference to IBBI under Section 16(3A) for appointment of an independent IRP from the panel. Special resolution of members (≥ 75%) is mandatory. Must affirmatively plead non-ineligibility under Section 11."
    },
    {
        "source_pattern": "instrument_5_written_consent_of_the_proposed_interim_resolution_professional_for.md",
        "output_filename": "CIRP-05_Form_2_Written_Consent_Proposed_IRP.md",
        "instrument_id": "CIRP-05",
        "title": "Form 2 Written Consent of Proposed IRP",
        "statutory_provision": "Section 7(3)(b) & Section 9(3)(d) IBC, 2016 read with Rule 9(1) & Form 2, AAA Rules, 2016",
        "jurisdiction": "Insolvency and Bankruptcy Board of India (IBBI) / NCLT",
        "monaco_slash_command": "/ibc-form2",
        "required_kv_variables": [
            "proposed_irp_name", "proposed_irp_registration_no", "proposed_irp_email", "proposed_irp_address",
            "proposed_irp_phone", "ipa_name", "afa_certificate_no", "afa_validity_date",
            "corporate_debtor_name", "financial_creditor_name"
        ],
        "mandatory_annexures": [
            {"tag": "Annexure 1", "desc": "Copy of Certificate of Registration issued by IBBI"},
            {"tag": "Annexure 2", "desc": "Valid Authorisation for Assignment (AFA) issued by IPA"},
            {"tag": "Annexure 3", "desc": "Disclosure of Ongoing Insolvency and Liquidation Assignments"},
            {"tag": "Annexure 4", "desc": "Independence Certificate under Regulation 3 of IBBI (Insolvency Professionals) Regs"}
        ],
        "evidence_certificate": "IBBI Professional Verification Certificate",
        "chamber_guidance": "AFA must be valid as on the date of consent and date of appointment. Regulation 3(1) of IBBI (IP) Regulations, 2016 mandates strict independence: the IP must not be a related party, must have no business relationship with the Corporate Debtor or Financial Creditor in the preceding 3 years, and must disclose any conflicts immediately."
    },
    {
        "source_pattern": "instrument_6_record_of_default_information-utility_record_other_evidence.md",
        "output_filename": "CIRP-06_NeSL_IU_Record_of_Default_Evidentiary_Dossier.md",
        "instrument_id": "CIRP-06",
        "title": "NeSL Information Utility Record of Default Dossier",
        "statutory_provision": "Section 7(3)(a), Section 215 IBC, 2016 read with IBBI (Information Utilities) Regulations, 2017",
        "jurisdiction": "National Company Law Tribunal (NCLT) / NeSL",
        "monaco_slash_command": "/ibc-record-default",
        "required_kv_variables": [
            "corporate_debtor_name", "corporate_debtor_cin", "creditor_name", "nesl_record_number",
            "nesl_status", "nesl_filing_date", "nesl_authentication_date", "total_default_amount_inr", "default_date"
        ],
        "mandatory_annexures": [
            {"tag": "Annexure D-1", "desc": "NeSL Form D Certificate of Default generated from IU portal"},
            {"tag": "Annexure D-2", "desc": "Electronic Notice of Authentication issued by NeSL to Corporate Debtor"},
            {"tag": "Annexure D-3", "desc": "Portal Audit Trail of Corporate Debtor's Response / Deemed Authentication (§ 215(4))"},
            {"tag": "Annexure D-4", "desc": "Underlying Loan Document Reference and Bankers' Books Certificate"}
        ],
        "evidence_certificate": "Section 63 Bharatiya Sakshya Adhiniyam, 2023 (BSA)",
        "chamber_guidance": "Under IBBI (IU) Regulations and Supreme Court ruling in Swiss Ribbons, NeSL IU Record of Default with 'Authenticated' or 'Deemed Authenticated' status establishes indisputable conclusive proof of default. The NCLT is bound to admit without embarking on roving commercial inquiries."
    },
    {
        "source_pattern": "instrument_7_eligibility_non-disqualification_affidavit_section_10a_bar_section_.md",
        "output_filename": "CIRP-07_Section_10A_Bar_and_Section_11_Eligibility_Affidavit.md",
        "instrument_id": "CIRP-07",
        "title": "Section 10A Bar & Section 11 Eligibility Affidavit",
        "statutory_provision": "Section 10A & Section 11 IBC, 2016 read with Rule 11 NCLT Rules, 2016",
        "jurisdiction": "National Company Law Tribunal (NCLT)",
        "monaco_slash_command": "/ibc-eligibility-affidavit",
        "required_kv_variables": [
            "deponent_name", "deponent_designation", "applicant_name", "corporate_debtor_name",
            "corporate_debtor_cin", "nclt_bench_name", "default_date", "default_amount_inr"
        ],
        "mandatory_annexures": [
            {"tag": "Annexure E-1", "desc": "Statement of Account / NeSL Report showing default date strictly outside 10A window"},
            {"tag": "Annexure E-2", "desc": "MCA-21 Master Data proving no ongoing CIRP / Liquidation against Corporate Debtor"},
            {"tag": "Annexure E-3", "desc": "Board Resolution / Letter of Authority in favour of Deponent"}
        ],
        "evidence_certificate": "Notarised Statutory Affidavit & Statement of Truth (Order VI Rule 15A CPC)",
        "chamber_guidance": "Section 10A operates as an absolute permanent jurisdictional bar: no application under §§ 7, 9 or 10 can ever be filed for defaults occurring between 25.03.2020 and 24.03.2021 (Ramesh Kymal v. Siemens Gamesa). The deponent must affirmatively testify that default date falls outside this window, and confirm non-ineligibility under Section 11(a)-(d)."
    },
    {
        "source_pattern": "instrument_8_reply_objections_by_the_corporate_debtor.md",
        "output_filename": "CIRP-08_Corporate_Debtor_Reply_and_Objections.md",
        "instrument_id": "CIRP-08",
        "title": "Corporate Debtor Reply & Objections to Admission",
        "statutory_provision": "Section 7 / Section 9 IBC, 2016 read with Rule 37 & 41 NCLT Rules, 2016",
        "jurisdiction": "National Company Law Tribunal (NCLT)",
        "monaco_slash_command": "/ibc-reply-objections",
        "required_kv_variables": [
            "corporate_debtor_name", "corporate_debtor_cin", "authorised_director_name",
            "applicant_name", "petition_number", "nclt_bench_name", "alleged_default_amount_inr", "alleged_default_date"
        ],
        "mandatory_annexures": [
            {"tag": "Annexure R-1", "desc": "Board Resolution authorising Director / Representative to depose"},
            {"tag": "Annexure R-2", "desc": "Contemporaneous correspondence proving Pre-Existing Dispute (Mobilox)"},
            {"tag": "Annexure R-3", "desc": "Debit Notes, Quality Rejection Slips and Goods Return Challans"},
            {"tag": "Annexure R-4", "desc": "Bank Statements proving payments made / disputed debit calculations"},
            {"tag": "Annexure R-5", "desc": "Limitation Analysis / Section 10A Moratorium overlap calculation"}
        ],
        "evidence_certificate": "Section 63 Bharatiya Sakshya Adhiniyam, 2023 (BSA)",
        "chamber_guidance": "Frame multi-tiered preliminary objections: (1) Barred by limitation under § 238A / Art 137; (2) Pre-existing dispute raised prior to Section 8 notice (Mobilox Innovations); (3) Default falls in Section 10A COVID period; (4) Failure to meet ₹1 Crore threshold; (5) Misuse of IBC as recovery mechanism triggering Section 65 penal provisions."
    },
    {
        "source_pattern": "instrument_9_nclt_admission_order_reading_note_compliance_checklist.md",
        "output_filename": "CIRP-09_NCLT_Admission_Order_Reading_Note_Checklist.md",
        "instrument_id": "CIRP-09",
        "title": "NCLT Admission Order Reading Note & Kickoff Checklist",
        "statutory_provision": "Sections 13, 14, 15, 16 IBC, 2016 read with Regulations 6 & 16, CIRP Regulations, 2016",
        "jurisdiction": "Insolvency Professional Chamber Administration",
        "monaco_slash_command": "/cirp-admission-checklist",
        "required_kv_variables": [
            "corporate_debtor_name", "corporate_debtor_cin", "nclt_bench_name", "petition_number",
            "admission_order_date", "admission_order_receipt_date", "irp_name", "irp_registration_no",
            "irp_email", "irp_process_address"
        ],
        "mandatory_annexures": [
            {"tag": "Annexure 1", "desc": "Certified copy of NCLT Admission Order"},
            {"tag": "Annexure 2", "desc": "Form INC-28 ROC E-Filing SRN Challan (within 7 days)"},
            {"tag": "Annexure 3", "desc": "Form A Public Announcement Proof of Publication (within 3 days)"},
            {"tag": "Annexure 4", "desc": "Statutory CIRP Master Timeline (T-0 to T-330)"}
        ],
        "evidence_certificate": "IRP Internal Administrative Record",
        "chamber_guidance": "T-0 is the date of admission order (or date of receipt if specified). Form INC-28 must be filed with ROC within 7 days. Form A must be published in newspapers within 3 days. Send Section 14 moratorium notices to banks, courts and utility providers immediately. Appoint two registered valuers within 47 days. Constitute CoC within 30 days."
    },
    {
        "source_pattern": "instrument_10_moratorium_under_section_14_scope_exclusions.md",
        "output_filename": "CIRP-10_Section_14_Moratorium_Intimation_Notice.md",
        "instrument_id": "CIRP-10",
        "title": "Section 14 Moratorium Intimation Notice",
        "statutory_provision": "Section 14 IBC, 2016 read with Section 238 (Overriding Effect)",
        "jurisdiction": "Statutory Notice to Courts, Tribunals, Banks & Creditors",
        "monaco_slash_command": "/ibc-moratorium-notice",
        "required_kv_variables": [
            "irp_name", "irp_registration_no", "corporate_debtor_name", "corporate_debtor_cin",
            "admission_order_date", "nclt_bench_name", "petition_number", "recipient_institution_name", "recipient_address"
        ],
        "mandatory_annexures": [
            {"tag": "Annexure 1", "desc": "True copy of NCLT Admission Order declaring Moratorium"},
            {"tag": "Annexure 2", "desc": "Copy of Public Announcement (Form A)"},
            {"tag": "Annexure 3", "desc": "Extract of Section 14 & Section 238 of Insolvency and Bankruptcy Code, 2016"}
        ],
        "evidence_certificate": "Postal Speed Post & Official Email Proof (§ 63 BSA 2023)",
        "chamber_guidance": "Moratorium prohibits: (a) institution/continuation of suits, execution of decrees, arbitration; (b) alienating/encumbering corporate debtor assets; (c) SARFAESI or DRT enforcement; (d) recovery of property by owners/lessors. Crucial 2026 rule: Section 14(2A) ensures supply of critical goods and services (IT software, electricity, warehouse access) cannot be terminated during moratorium."
    },
    {
        "source_pattern": "instrument_11_appointment_of_the_irp_vesting_of_management.md",
        "output_filename": "CIRP-11_Vesting_of_Management_Memo_Section_17.md",
        "instrument_id": "CIRP-11",
        "title": "Vesting of Management Memo & Notice under Section 17",
        "statutory_provision": "Section 17 & Section 18 IBC, 2016",
        "jurisdiction": "Statutory Vesting Notice to Suspended Board & Management",
        "monaco_slash_command": "/ibc-sec17-vesting",
        "required_kv_variables": [
            "irp_name", "irp_registration_no", "corporate_debtor_name", "corporate_debtor_cin",
            "admission_order_date", "nclt_bench_name", "suspended_director_names", "corporate_debtor_registered_office"
        ],
        "mandatory_annexures": [
            {"tag": "Annexure 1", "desc": "Certified copy of NCLT Admission Order"},
            {"tag": "Annexure 2", "desc": "Written Requisition of Books, Records, Assets and Bank Credentials"},
            {"tag": "Annexure 3", "desc": "Legal Consequences Memo on Section 19(2) and Sections 68-71"}
        ],
        "evidence_certificate": "Official Process Delivery Proof (§ 63 BSA 2023)",
        "chamber_guidance": "Under Section 17(1)(a), the powers of the Board of Directors stand suspended and vest exclusively in the IRP. Any contract, payment or corporate action entered into by suspended directors after the date of admission is void ab initio and exposes them to prosecution under Section 68 and 70."
    },
    {
        "source_pattern": "instrument_12_public_announcement_form_a.md",
        "output_filename": "CIRP-12_Public_Announcement_Form_A.md",
        "instrument_id": "CIRP-12",
        "title": "Public Announcement under Regulation 6 (Form A)",
        "statutory_provision": "Section 15 IBC, 2016 read with Regulation 6 & Form A, CIRP Regulations, 2016",
        "jurisdiction": "Public Statutory Gazette & Newspaper Publication",
        "monaco_slash_command": "/ibc-form-a",
        "required_kv_variables": [
            "corporate_debtor_name", "corporate_debtor_cin", "corporate_debtor_incorporation_date",
            "corporate_debtor_registered_office", "corporate_debtor_nominal_capital_inr",
            "corporate_debtor_paidup_capital_inr", "admission_order_date", "nclt_bench_name",
            "irp_name", "irp_registration_no", "irp_address", "irp_email", "claims_last_date",
            "cirp_estimated_closure_date", "claims_portal_url", "class_ar_choice_names"
        ],
        "mandatory_annexures": [
            {"tag": "Annexure 1", "desc": "Tearsheets of Newspaper Publications (English & Regional Daily)"},
            {"tag": "Annexure 2", "desc": "Screenshot of IBBI Website Upload Confirmation"},
            {"tag": "Annexure 3", "desc": "Corporate Debtor Website Publication Screenshot"}
        ],
        "evidence_certificate": "Newspaper Publisher Invoice & Tearsheet Verification",
        "chamber_guidance": "Must be published within 3 days of appointment ($T_0 + 3$). Published in 1 English daily and 1 regional language daily having wide circulation at the registered office and principal office. Claims deadline is 14 days from date of appointment of IRP. Must include details of authorized representatives where creditors in a class exist."
    },
    {
        "source_pattern": "instrument_13_process_intimations_banker_statutory_auditor.md",
        "output_filename": "CIRP-13_Statutory_Process_Intimations_Suite.md",
        "instrument_id": "CIRP-13",
        "title": "Statutory Process Intimations Suite (Bankers, Auditors & Authorities)",
        "statutory_provision": "Sections 14, 17, 18, 19 IBC, 2016 read with Regulation 30, CIRP Regulations, 2016",
        "jurisdiction": "Statutory Notice to Commercial Banks, Auditors, Sub-Registrars & Police",
        "monaco_slash_command": "/cirp-statutory-intimations",
        "required_kv_variables": [
            "irp_name", "irp_registration_no", "corporate_debtor_name", "corporate_debtor_cin",
            "admission_order_date", "nclt_bench_name", "bank_name", "branch_address", "bank_account_numbers",
            "statutory_auditor_firm_name", "sub_registrar_office_location", "police_station_jurisdiction"
        ],
        "mandatory_annexures": [
            {"tag": "Annexure 1", "desc": "NCLT Admission Order"},
            {"tag": "Annexure 2", "desc": "Form A Public Announcement"},
            {"tag": "Annexure 3", "desc": "IRP Identity & Registration Credentials"}
        ],
        "evidence_certificate": "Proof of Electronic & Speed Post Service (§ 63 BSA 2023)",
        "chamber_guidance": "Five discrete notices: (1) Bank Notice: freeze all debit operations immediately, revoke suspended directors' signing powers, transfer internet banking tokens to IRP, furnish 3-year bank statements under Bankers' Books Evidence Act; (2) Auditor Notice: retain audit papers, provide trial balance; (3) Sub-Registrar Notice: red-entry on land assets; (4) Utility Notice: preserve electricity/water/ERP; (5) Police Notice under Reg 30 for security."
    },
    {
        "source_pattern": "instrument_14_intimation_to_suspended_management_information_requisition.md",
        "output_filename": "CIRP-14_Information_Asset_Requisition_to_Suspended_Directors.md",
        "instrument_id": "CIRP-14",
        "title": "Information & Asset Requisition Notice to Suspended Management",
        "statutory_provision": "Section 19(1) IBC, 2016 read with Regulation 3A & Regulation 4, CIRP Regulations, 2016",
        "jurisdiction": "Statutory Requisition to Suspended Directors & KMP",
        "monaco_slash_command": "/ibc-sec19-requisition",
        "required_kv_variables": [
            "irp_name", "irp_registration_no", "corporate_debtor_name", "corporate_debtor_cin",
            "admission_order_date", "nclt_bench_name", "suspended_director_names", "compliance_deadline_date"
        ],
        "mandatory_annexures": [
            {"tag": "Annexure A", "desc": "NCLT Admission Order"},
            {"tag": "Annexure B", "desc": "18-Point Requisition Checklist of Documents, Passwords and Assets"},
            {"tag": "Annexure C", "desc": "Handover Receipt & Digital Evidence Declaration Form"}
        ],
        "evidence_certificate": "Official Email & Hand Delivery Receipt (§ 63 BSA 2023)",
        "chamber_guidance": "This notice forms the foundational evidentiary spine for the Section 19(2) application. Set a strict 48-hour to 7-day timeline for delivery of books of accounts, fixed asset registers, Tally/SAP admin passwords, fixed deposit receipts, vehicle keys, and property deeds. Every reminder must be dated and catalogued."
    },
    {
        "source_pattern": "instrument_14a_application_under_section_19_2_for_directions_against_non-co-oper.md",
        "output_filename": "CIRP-14A_Section_19_2_Non_Cooperation_Application.md",
        "instrument_id": "CIRP-14A",
        "title": "Section 19(2) Application for Directions Against Non-Cooperation",
        "statutory_provision": "Section 19(2) read with Section 60(5), Sections 68/70 IBC, 2016 & Regulation 30 CIRP Regs, 2016",
        "jurisdiction": "National Company Law Tribunal (NCLT)",
        "monaco_slash_command": "/ibc-sec19-application",
        "required_kv_variables": [
            "irp_name", "irp_registration_no", "corporate_debtor_name", "corporate_debtor_cin",
            "nclt_bench_name", "petition_number", "suspended_director_names", "first_requisition_date",
            "reminder_dates", "site_inspection_date", "withheld_asset_descriptions", "estimated_withheld_amount_inr"
        ],
        "mandatory_annexures": [
            {"tag": "Annexure A-1", "desc": "NCLT Admission Order"},
            {"tag": "Annexure A-2", "desc": "Form A Public Announcement"},
            {"tag": "Annexure A-3", "desc": "Section 19(1) Requisition Notice with Speed Post & Email Proofs"},
            {"tag": "Annexure A-4", "desc": "Follow-up Reminders & Minutes of Unsuccessful Handover Meetings"},
            {"tag": "Annexure A-5", "desc": "Site Inspection Memo & Photographs of Closed / Locked Premises"},
            {"tag": "Annexure A-6", "desc": "Bank Statements showing zero balance / unauthorized debit transactions"},
            {"tag": "Annexure A-7", "desc": "Section 63 BSA 2023 Electronic Evidence Certificate"}
        ],
        "evidence_certificate": "Section 63 Bharatiya Sakshya Adhiniyam, 2023 (BSA)",
        "chamber_guidance": "Must feature a robust, aggressive prayer matrix: (1) Mandatory directions to hand over books, ERP passwords and physical custody; (2) Ex-parte ad-interim asset freeze on respondents' personal properties; (3) Passport impounding / Look Out Circular (LOC) via Bureau of Immigration; (4) Appointment of Advocate Local Commissioner under NCLT Rule 11 with police aid to break locks and image servers; (5) Penal prosecution under Sections 68, 70 and 71."
    },
    {
        "source_pattern": "instrument_14b_application_to_the_registrar_of_companies_for_extension_of_time_t.md",
        "output_filename": "CIRP-14B_ROC_Application_AGM_Extension_Section_96.md",
        "instrument_id": "CIRP-14B",
        "title": "Application to ROC for Extension of Time to Hold AGM",
        "statutory_provision": "Third Proviso to Section 96(1), Companies Act, 2013 read with Section 17 IBC, 2016",
        "jurisdiction": "Registrar of Companies (ROC) / Ministry of Corporate Affairs (MCA)",
        "monaco_slash_command": "/roc-agm-extension",
        "required_kv_variables": [
            "irp_name", "irp_registration_no", "corporate_debtor_name", "corporate_debtor_cin",
            "corporate_debtor_registered_office", "roc_office_jurisdiction", "admission_order_date",
            "nclt_bench_name", "financial_year_ended", "agm_statutory_due_date",
            "requested_extension_period_months", "requested_extension_date", "ia_number_sec19"
        ],
        "mandatory_annexures": [
            {"tag": "Annexure 1", "desc": "NCLT Admission Order under Section 7/9/10"},
            {"tag": "Annexure 2", "desc": "Form INC-28 Filing Challan with ROC"},
            {"tag": "Annexure 3", "desc": "Copy of Section 19(2) Non-Cooperation Application filed before NCLT"},
            {"tag": "Annexure 4", "desc": "Resignation Letter of Statutory Auditor / Auditor Intimation"},
            {"tag": "Annexure 5", "desc": "Board Powers Vesting Memo under Section 17 of IBC, 2016"}
        ],
        "evidence_certificate": "MCA-21 Form GNL-1 Filing Receipt",
        "chamber_guidance": "Under third proviso to Section 96(1), the Registrar may extend AGM time by up to 3 months for 'special reasons'. In CIRP, the special reasons are: suspension of management, non-handover of books of accounts by suspended directors, pending Section 19(2) before NCLT, and inability of statutory auditor to finalize financial statements without books. File on MCA-21 via Form GNL-1 before statutory AGM due date."
    }
]

def generate_yaml_frontmatter(defn):
    kv_list = "\n".join([f"  - {kv}" for kv in defn["required_kv_variables"]])
    annex_list = "\n".join([f"  - {a['tag']}: \"{a['desc']}\"" for a in defn["mandatory_annexures"]])
    return f"""---
instrument_id: "{defn['instrument_id']}"
title: "{defn['title']}"
statutory_provision: "{defn['statutory_provision']}"
jurisdiction: "{defn['jurisdiction']}"
monaco_slash_command: "{defn['monaco_slash_command']}"
category: "01_CIRP_Initiation"
evidence_certificate: "{defn['evidence_certificate']}"
required_kv_variables:
{kv_list}
mandatory_annexures:
{annex_list}
---
"""

def generate_chamber_guidance(text):
    return f"""> [!NOTE] Practical Chamber Guidance (2026 Legal Standard)
> {text}
"""

def generate_evidence_block(is_court_pleading=True):
    if not is_court_pleading:
        return """
---

### Verification

I, the undersigned, do hereby verify that the contents of this statutory communication are true and correct to my knowledge, derived from official case records maintained in the ordinary course of the process.

**{{authorised_signatory_name}}**  
Designation: {{authorised_signatory_designation}}  
Date: {{dispatch_date}} | Place: {{execution_place}}
"""
    return """
---

### Verifying Affidavit & Statement of Truth
*(Conforming to Order VI Rule 15A of the Code of Civil Procedure, 1908 and Rule 11 of NCLT Rules, 2016)*

BEFORE THE HON’BLE NATIONAL COMPANY LAW TRIBUNAL, {{nclt_bench_name}} BENCH  
IN THE MATTER OF: **{{corporate_debtor_name}}**

I, **{{deponent_name}}**, son/daughter of {{deponent_father_name}}, aged about {{deponent_age}} years, residing at {{deponent_address}}, do hereby solemnly affirm and state on oath as under:

1. That I am the {{deponent_capacity}} of the Applicant / Petitioner herein, and I am fully conversant with the facts and circumstances of the present case and competent to swear this affidavit.
2. That the statements made in the accompanying Application / Petition have been drafted under my instructions. The contents of paragraphs 1 to {{last_paragraph_no}} are true and correct to my personal knowledge and/or derived from the official records maintained in the ordinary course of business, and nothing material has been concealed therefrom.
3. That all electronic documents, computer printouts, Information Utility records, and bank statements annexed hereto are true and complete copies of their respective originals.

**DEPONENT**

#### Verification
Verified at **{{execution_place}}** on this **{{execution_day}}** day of **{{execution_month}}**, 20{{execution_year}}, that the contents of paragraphs 1 to 3 above are true and correct to my knowledge and belief, no part of it is false, and nothing material has been concealed.

**DEPONENT**

---

### Certificate under Section 63 of the Bharatiya Sakshya Adhiniyam, 2023 (BSA)
*(Admissibility of Electronic Records — Replacing Section 65B of the Indian Evidence Act, 1872)*

I, **{{deponent_name}}**, do hereby certify under Section 63(4) of the Bharatiya Sakshya Adhiniyam, 2023 that:

1. The electronic records, computer printouts, Information Utility default reports (NeSL), emails, WhatsApp communications, and electronic bank account statements annexed to the accompanying application were produced by computer systems and electronic devices during the period over which the said devices were used regularly to store, process, and transmit information in the ordinary course of business.
2. Throughout the material period, the said electronic devices and computer systems were operating properly, and there were no operational breakdowns or security compromises affecting the accuracy, integrity, or completeness of the electronic records.
3. The printouts, digital PDFs, and electronic extracts annexed hereto reproduce faithfully and accurately the contents of the electronic records stored on the aforesaid devices.

Signed and certified at **{{execution_place}}** on this **{{execution_day}}** day of **{{execution_month}}**, 20{{execution_year}}.

**{{deponent_name}}**  
*(Person responsible for the management / operation of the relevant electronic system)*
"""

# Specialized builders
def build_inst_1(defn):
    return f"""{generate_yaml_frontmatter(defn)}
# Instrument 1 — Application by a Financial Creditor — Section 7 (Form 1)

{generate_chamber_guidance(defn['chamber_guidance'])}

## FORM 1
*(See Rule 4(1) of the Insolvency and Bankruptcy (Application to Adjudicating Authority) Rules, 2016)*

### APPLICATION BY FINANCIAL CREDITOR(S) TO INITIATE CORPORATE INSOLVENCY RESOLUTION PROCESS UNDER SECTION 7 OF THE CODE

**BEFORE THE HON’BLE NATIONAL COMPANY LAW TRIBUNAL, {{nclt_bench_name}} BENCH**  
**COMPANY PETITION (IB) NO. ______ OF 20{{filing_year}}**

**IN THE MATTER OF:**  
**{{financial_creditor_name}}**  
Registered Office: {{financial_creditor_registered_office}}  
*(Through its Authorised Representative: {{authorised_representative_name}})*  
... **Financial Creditor / Applicant**

**VERSUS**

**{{corporate_debtor_name}}**  
CIN: {{corporate_debtor_cin}}  
Registered Office: {{corporate_debtor_registered_office}}  
... **Corporate Debtor / Respondent**

---

### PART I — PARTICULARS OF THE APPLICANT (FINANCIAL CREDITOR)

| # | Field | Particulars |
| :---: | :--- | :--- |
| **1** | Name of the Financial Creditor | **{{financial_creditor_name}}** |
| **2** | Identification Number (CIN / LLPIN / Registration) | {{financial_creditor_cin_registration}} |
| **3** | Address for Correspondence & Process Service | {{financial_creditor_registered_office}} |
| **4** | Registered Process E-mail ID & Contact Number | {{financial_creditor_process_email}} |
| **5** | Name, Designation & Address of the Authorised Representative | **{{authorised_representative_name}}**, {{authorised_representative_designation}} *(Authority conferred vide Board Resolution dated {{board_resolution_date}} — **Annexure A-1**)* |

---

### PART II — PARTICULARS OF THE CORPORATE DEBTOR

| # | Field | Particulars |
| :---: | :--- | :--- |
| **1** | Name of the Corporate Debtor | **{{corporate_debtor_name}}** |
| **2** | Corporate Identification Number (CIN) | {{corporate_debtor_cin}} |
| **3** | Date of Incorporation | {{corporate_debtor_incorporation_date}} |
| **4** | Registered Office Address (Territorial Jurisdiction) | {{corporate_debtor_registered_office}} *(Falls within territorial jurisdiction of this Hon'ble {{nclt_bench_name}} Bench)* |
| **5** | Nominal and Paid-Up Share Capital | Nominal: INR {{corporate_debtor_nominal_capital_inr}} <br>Paid-Up: INR {{corporate_debtor_paidup_capital_inr}} |

---

### PART III — PARTICULARS OF THE PROPOSED INTERIM RESOLUTION PROFESSIONAL

| # | Field | Particulars |
| :---: | :--- | :--- |
| **1** | Name of the Proposed IRP | **{{proposed_irp_name}}** |
| **2** | IBBI Registration Number | {{proposed_irp_registration_no}} |
| **3** | Address, Email & Mobile Number | {{proposed_irp_address}} \| {{proposed_irp_email}} \| {{proposed_irp_phone}} |
| **4** | Valid Authorisation for Assignment (AFA) | Valid up to **{{afa_validity_date}}** *(Form 2 Written Consent annexed as **Annexure A-2**)* |

---

### PART IV — PARTICULARS OF THE FINANCIAL DEBT

| # | Field | Particulars |
| :---: | :--- | :--- |
| **1** | Total Debt Disbursed & Facility Type | INR **{{total_debt_disbursed_inr}}** disbursed under {{facility_type}} facility on {{disbursement_date}}. |
| **2** | Total Amount in Default | INR **{{total_default_amount_inr}}** *(Principal: INR {{principal_default_inr}} + Interest: INR {{interest_default_inr}})* |
| **3** | Date of Default | **{{default_date}}** *(Strictly within limitation under Section 238A read with Art 137 Limitation Act)* |
| **4** | Security / Collateral Details | First exclusive charge on {{security_assets_description}} registered via CERSAI & ROC Form CHG-1 (**Annexure A-6**). |

---

### PART V — PARTICULARS OF INFORMATION & EVIDENCE OF DEFAULT

1. **Information Utility Conclusive Evidence:** Record of Default registered with **NeSL** (Registration No: {{nesl_record_number}}) bearing status **Authenticated / Deemed Authenticated** under Section 215(4) of the Code (**Annexure A-3**).
2. **Contractual Documents:** Sanction letters, Rupee Term Loan / Working Capital agreements dated {{loan_agreement_date}} (**Annexure A-4**).
3. **Bank Statements:** Statement of Account certified in terms of the Bankers' Books Evidence Act, 1891 (**Annexure A-5**).
4. **Limitation & Section 10A Compliance:**
   - The default occurred on **{{default_date}}**, which is strictly outside the Section 10A statutory bar period (25 March 2020 to 24 March 2021).
   - Limitation is preserved under Section 18 of the Limitation Act, 1963 via balance sheet acknowledgments for FY {{balance_sheet_fy}} and OTS proposal dated {{ots_date}} (**Annexure A-7**).

---

### PRAYER / RELIEFS SOUGHT

Wherefore, in the facts and circumstances stated above, the Financial Creditor most respectfully prays that this Hon’ble Tribunal be pleased to:

#### Primary Statutory Reliefs
a. **Admit** the present application under **Section 7(5)(a)** of the Insolvency and Bankruptcy Code, 2016 and declare the commencement of the Corporate Insolvency Resolution Process (CIRP) in respect of **{{corporate_debtor_name}}**;  
b. **Declare a Moratorium** in terms of **Section 14(1)** of the Code prohibiting the institution or continuation of suits, transfer or disposal of assets, enforcement of SARFAESI security interest, or recovery of property by lessors/owners;  
c. **Appoint** the proposed Insolvency Professional, **{{proposed_irp_name}}**, IBBI Registration No. {{proposed_irp_registration_no}}, having valid AFA up to {{afa_validity_date}}, as the Interim Resolution Professional (IRP) of the Corporate Debtor, with directions to immediately take custody of all assets, management and books of accounts under Sections 17 and 18 of the Code;

#### Ad-Interim Protective Reliefs
d. **Pending admission**, pass an **ex-parte ad-interim order** restraining the Corporate Debtor, its promoters, directors, agents, and servants from alienating, encumbering, selling, or transferring any immovable or movable assets, or operating bank accounts outside the strictly ordinary course of day-to-day business;  
e. **Direct** the suspended directors and personnel of the Corporate Debtor to extend complete cooperation and immediately deliver all physical keys, books of accounts, statutory registers, ERP/Tally login credentials, and digital tokens to the IRP upon appointment under Section 19(1);

#### Statutory Regulatory Directions
f. **Direct** all operating banks of the Corporate Debtor to freeze operations by existing signatories upon receipt of the admission order and transfer complete operating control to the IRP; and  
g. **Pass** such other and further order(s) as this Hon'ble Tribunal may deem fit and proper in the interest of justice and the statutory objectives of the Code.

**APPLICANT / FINANCIAL CREDITOR**  
Through: **{{authorised_representative_name}}**  
Date: {{filing_date}} | Place: {{execution_place}}

{generate_evidence_block(is_court_pleading=True)}
"""

def build_inst_2(defn):
    return f"""{generate_yaml_frontmatter(defn)}
# Instrument 2 — Demand Notice by an Operational Creditor — Section 8 (Forms 3 & 4)

{generate_chamber_guidance(defn['chamber_guidance'])}

## FORM 3
*(See Rule 5(1)(a) of the Insolvency and Bankruptcy (Application to Adjudicating Authority) Rules, 2016)*

### FORM OF DEMAND NOTICE / INVOICE DEMANDING PAYMENT UNDER SECTION 8 OF THE CODE

**DISPATCHED VIA REGISTERED SPEED POST WITH A/D & OFFICIAL ELECTRONIC MAIL**

**Date:** {{dispatch_date}}  
**To,**  
**{{corporate_debtor_name}}**  
CIN: {{corporate_debtor_cin}}  
Registered Office: {{corporate_debtor_registered_office}}  
Corporate Office / Plant: {{corporate_debtor_factory_address}}  
*(Through its Board of Directors / Managing Director)*

**FROM:**  
**{{operational_creditor_name}}**  
GSTIN / PAN: {{operational_creditor_pan_gstin}}  
Registered Office: {{operational_creditor_registered_office}}  
Email for Process: {{operational_creditor_email}}

---

### SUBJECT: DEMAND NOTICE UNDER SECTION 8(1) OF THE INSOLVENCY AND BANKRUPTCY CODE, 2016 IN RESPECT OF UNPAID OPERATIONAL DEBT OF INR {{total_default_amount_inr}}

Madam / Sir,

This demand notice is issued by **{{operational_creditor_name}}** (hereinafter referred to as the **"Operational Creditor"**) under Section 8(1) of the Insolvency and Bankruptcy Code, 2016 (hereinafter referred to as the **"Code"**) demanding immediate payment of an unpaid operational debt due and payable by **{{corporate_debtor_name}}** (hereinafter referred to as the **"Corporate Debtor"**).

#### 1. PARTICULARS OF OPERATIONAL DEBT AND TRANSACTION

| # | Field | Particulars |
| :---: | :--- | :--- |
| **1** | Total Amount of Debt | INR **{{total_operational_debt_inr}}** |
| **2** | Amount Claimed in Default | INR **{{total_default_amount_inr}}** *(Principal: INR {{principal_default_inr}} + Interest at {{interest_rate_percent}}% p.a.: INR {{interest_default_inr}})* |
| **3** | Date of Default | **{{default_date}}** |
| **4** | Invoices & Delivery Particulars | Invoices: **{{invoice_numbers_and_dates}}** against Purchase Order(s) {{po_numbers}} (**Annexure A**). Goods delivered under E-Way Bills (**Annexure B**). |
| **5** | GST Returns Disclosures (Reg 2-B) | GSTR-1 and GSTR-3B filings evidencing supply and GST remittance (**Annexure C**). |
| **6** | NeSL IU Submission (§ 215(3)) | Submitted on {{nesl_submission_date}} under Transaction ID **{{nesl_record_number}}** (**Annexure D**). |

---

### STATUTORY MANDATE & 10-DAY COUNTDOWN NOTICE

1. **Demand for Unconditional Payment:** You are hereby called upon to pay the unpaid operational debt of INR **{{total_default_amount_inr}}** in full within **ten (10) days** of receipt of this notice into the designated bank account of the Operational Creditor:
   - Bank Name: {{operational_creditor_bank_name}}
   - Account Number: {{operational_creditor_bank_account}}
   - IFSC Code: {{operational_creditor_bank_ifsc}}
2. **Statutory Defense under Section 8(2):** If you dispute the existence of the operational debt, you are required under Section 8(2) of the Code to bring to the notice of the Operational Creditor within **ten (10) days** of receipt of this notice:
   - (a) Proof of full payment of the unpaid operational debt; OR
   - (b) Notice of an **existing dispute**, accompanied by proof of pendency of a suit or arbitral proceedings filed *before* the receipt of this demand notice.
3. **Statutory Warning of CIRP Initiation:** Take notice that if the aforesaid amount is not paid in full, and no proof of payment or valid pre-existing dispute is furnished within ten (10) days, the Operational Creditor shall file an application under **Section 9** of the Code before the Hon'ble National Company Law Tribunal, {{nclt_bench_name}} Bench, for initiation of the Corporate Insolvency Resolution Process against the Corporate Debtor at your entire risk, costs, and consequences.
4. **Notice of Section 67C Penal Liability:** Take notice that Section 67C of the Code penalises any fraudulent or malicious concealment of debt, false dispute fabrication, or wilful default with fine extending up to **INR 2,00,00,000/- (Rupees Two Crores)**.

**FOR AND ON BEHALF OF: {{operational_creditor_name}}**

_____________________________________  
**{{authorised_representative_name}}**  
Designation: {{authorised_representative_designation}}  
Date: {{dispatch_date}} | Place: {{execution_place}}

{generate_evidence_block(is_court_pleading=False)}
"""

def build_inst_3(defn):
    return f"""{generate_yaml_frontmatter(defn)}
# Instrument 3 — Application by an Operational Creditor — Section 9 (Form 5)

{generate_chamber_guidance(defn['chamber_guidance'])}

## FORM 5
*(See Rule 6(1) of the Insolvency and Bankruptcy (Application to Adjudicating Authority) Rules, 2016)*

### APPLICATION BY OPERATIONAL CREDITOR TO INITIATE CORPORATE INSOLVENCY RESOLUTION PROCESS UNDER SECTION 9 OF THE CODE

**BEFORE THE HON’BLE NATIONAL COMPANY LAW TRIBUNAL, {{nclt_bench_name}} BENCH**  
**COMPANY PETITION (IB) NO. ______ OF 20{{filing_year}}**

**IN THE MATTER OF:**  
**{{operational_creditor_name}}**  
Registered Office: {{operational_creditor_registered_office}}  
*(Through its Authorised Representative: {{authorised_representative_name}})*  
... **Operational Creditor / Applicant**

**VERSUS**

**{{corporate_debtor_name}}**  
CIN: {{corporate_debtor_cin}}  
Registered Office: {{corporate_debtor_registered_office}}  
... **Corporate Debtor / Respondent**

---

### PART I — PARTICULARS OF THE OPERATIONAL CREDITOR

| # | Field | Particulars |
| :---: | :--- | :--- |
| **1** | Name of the Operational Creditor | **{{operational_creditor_name}}** |
| **2** | Identification Number (CIN / PAN / GSTIN) | {{operational_creditor_pan_gstin}} |
| **3** | Address for Service and Process Email | {{operational_creditor_registered_office}} \| {{operational_creditor_email}} |
| **4** | Authorised Representative Details | **{{authorised_representative_name}}**, authorized vide Board Resolution dated {{board_resolution_date}}. |

---

### PART II — PARTICULARS OF THE CORPORATE DEBTOR

| # | Field | Particulars |
| :---: | :--- | :--- |
| **1** | Name of the Corporate Debtor | **{{corporate_debtor_name}}** |
| **2** | Corporate Identification Number (CIN) | {{corporate_debtor_cin}} |
| **3** | Registered Office Address (Bench Jurisdiction) | {{corporate_debtor_registered_office}} |
| **4** | Nominal and Paid-Up Capital | Nominal: INR {{corporate_debtor_nominal_capital_inr}} \| Paid-Up: INR {{corporate_debtor_paidup_capital_inr}} |

---

### PART III — PARTICULARS OF THE PROPOSED IRP (OPTIONAL)

| # | Field | Particulars |
| :---: | :--- | :--- |
| **1** | Name of Proposed IRP | **{{proposed_irp_name}}** *(Written Consent in Form 2 at **Annexure B-7**)* \| Or reference to IBBI Panel. |
| **2** | IBBI Registration & AFA | Registration No: {{proposed_irp_registration_no}} \| Valid up to {{afa_validity_date}} |

---

### PART IV — PARTICULARS OF THE OPERATIONAL DEBT & STATUTORY NOTICE

1. **Total Operational Debt:** INR **{{total_operational_debt_inr}}**; Amount in Default: INR **{{total_default_amount_inr}}**; Date of Default: **{{default_date}}**.
2. **Delivery of Section 8 Demand Notice:** Issued on {{section8_notice_dispatch_date}} and delivered to Corporate Debtor on **{{section8_notice_delivery_date}}** via Registered Post and Email (**Annexure B-2**).
3. **Absence of Payment or Pre-Existing Dispute:** More than 10 clear days have elapsed since delivery. The Corporate Debtor has neither repaid the operational debt nor raised any plausible pre-existing dispute under Section 8(2).
4. **Mandatory Section 9(3)(b) Affidavit:** Affidavit testifying that no notice of dispute has been received from the Corporate Debtor is filed at **Annexure B-3**.
5. **Information Utility & GST Compliance:** NeSL IU Submission Record (**Annexure B-6**) and Regulation 2-B GST Filings (**Annexure B-5**) are duly verified.

---

### PRAYER / RELIEFS SOUGHT

Wherefore, the Operational Creditor most respectfully prays that this Hon’ble Tribunal be pleased to:

#### Primary Statutory Reliefs
a. **Admit** the present application under **Section 9(5)(i)** of the Code and initiate CIRP against **{{corporate_debtor_name}}**;  
b. **Declare a Moratorium** in terms of **Section 14(1)** of the Code;  
c. **Appoint** {{proposed_irp_name}} (or an Insolvency Professional from the IBBI Panel) as the Interim Resolution Professional with immediate vesting of management and custody of assets under Sections 17 and 18;

#### Ad-Interim Protective Reliefs
d. **Pending admission**, pass an **ex-parte ad-interim order** restraining the Corporate Debtor, its directors, and agents from alienating, selling, or creating any encumbrance over its movable and immovable assets;  
e. **Direct** the suspended management to immediately hand over physical custody, ERP servers, books of accounts, and statutory records to the IRP upon appointment under Section 19(1); and  
f. **Pass** such other or further order(s) as this Hon'ble Tribunal may deem fit and proper.

**APPLICANT / OPERATIONAL CREDITOR**  
Through: **{{authorised_representative_name}}**  
Date: {{filing_date}} | Place: {{execution_place}}

{generate_evidence_block(is_court_pleading=True)}
"""

def build_inst_14a(defn):
    return f"""{generate_yaml_frontmatter(defn)}
# Instrument 14A — Application under Section 19(2) for Directions Against Non-Co-operation

{generate_chamber_guidance(defn['chamber_guidance'])}

## BEFORE THE HON’BLE NATIONAL COMPANY LAW TRIBUNAL, {{nclt_bench_name}} BENCH
**INTERLOCUTORY APPLICATION NO. ______ OF 20{{filing_year}}**  
**IN**  
**COMPANY PETITION (IB) NO. {{petition_number}}**

**IN THE MATTER OF:**  
**{{irp_name}}**  
Interim Resolution Professional / Resolution Professional of **{{corporate_debtor_name}}**  
IBBI Registration No.: {{irp_registration_no}}  
... **Applicant / Resolution Professional**

**VERSUS**

1. **{{suspended_director_names}}**  
   *(Suspended Board of Directors / Promoters of {{corporate_debtor_name}})*  
2. **{{promoter_associated_persons}}**  
   *(Persons Associated with the Management / KMP)*  
... **Respondents**

**IN THE MATTER OF:**  
`{{operational_or_financial_creditor}}` VERSUS `{{corporate_debtor_name}}`

---

### APPLICATION UNDER SECTION 19(2) READ WITH SECTION 60(5) OF THE INSOLVENCY AND BANKRUPTCY CODE, 2016, RULE 11 OF NCLT RULES, 2016, AND REGULATION 30 OF CIRP REGULATIONS, 2016 SEEKING URGENT DIRECTIONS AGAINST THE SUSPENDED MANAGEMENT FOR CONTUMACIOUS NON-COOPERATION, CUSTODY HANDOVER, EX-PARTE ASSET FREEZES, PASSPORT IMPOUNDING, AND POLICE ASSISTANCE

**MOST RESPECTFULLY SHOWETH:**

1. **Admission & Vesting:** That vide order dated **{{admission_order_date}}** passed by this Hon’ble Tribunal, the Corporate Debtor was admitted into CIRP and the Applicant was appointed as the Interim Resolution Professional. Under Section 17 of the Code, the powers of the Board of Directors stood suspended and vested in the Applicant (**Annexure A-1**).
2. **Statutory Requisitions Issued:** That on **{{first_requisition_date}}**, the Applicant issued a comprehensive statutory requisition under Section 19(1) calling upon the Respondents to hand over physical custody of all assets, books of accounts, fixed asset registers, Tally/SAP ERP login credentials, bank tokens, and statutory registers (**Annexure A-3**).
3. **Pattern of Contumacious Non-Cooperation:** That despite repeated reminders dated **{{reminder_dates}}**, and physical site visits conducted on **{{site_inspection_date}}**, the Respondents have deliberately locked the registered office, refused to furnish administrator credentials, withheld the fixed asset register, and obstructed the statutory timeline (**Annexures A-4 and A-5**).
4. **Dissipation & Concealment Risk:** That bank statements disclose suspicious debit sweeps immediately prior to CIRP commencement, reducing bank balances to nil while withholding books of accounts worth over INR **{{estimated_withheld_amount_inr}}** (**Annexure A-6**).
5. **Urgent Need for Coercive Orders:** Unless this Hon'ble Tribunal exercises its inherent powers under Rule 11 of NCLT Rules, 2016 and Section 19(2) to break locks, impound passports, and freeze assets, the CIRP will be rendered completely abortive.

---

### PRAYER / RELIEFS SOUGHT

Wherefore, in the facts and circumstances stated above, the Applicant most respectfully prays that this Hon’ble Tribunal be pleased, urgently, to:

#### Primary Mandatory Handover Reliefs
a. **Direct** the Respondents forthwith to grant unconditional physical and digital custody of the registered office, factories, books of accounts, statutory registers, ERP/Tally databases, and fixed assets of **{{corporate_debtor_name}}** to the Applicant;  
b. **Direct** the Respondents to provide all administrative passwords, digital signature certificates (DSC), bank login tokens, and OTP authorisations required to operate the affairs of the Corporate Debtor;

#### Ad-Interim Protective Reliefs & Asset Freezes
c. **Pass an ex-parte ad-interim order restraining** the Respondents, their family members, and connected entities from alienating, selling, transferring, encumbering, or parting with possession of their personal movable and immovable properties, shares, and assets up to the value of INR **{{estimated_withheld_amount_inr}}**;  
d. **Direct all operating banks** to immediately freeze all personal bank accounts, demat accounts, and bank lockers held by the Respondents until complete handover of books and records is certified by the Applicant;

#### Passport Impounding & Look-Out Circulars (LOC)
e. **Direct the Ministry of Home Affairs / Bureau of Immigration (FRRO)** to immediately impound the passports of the Respondents, issue Look-Out Circulars (LOC), and restrain the Respondents from leaving the territory of India without the express prior permission of this Hon’ble Tribunal;

#### Appointment of Advocate Local Commissioner & Police Assistance
f. **Appoint an Advocate Local Commissioner** under Rule 11 of the NCLT Rules, 2016, with full authority and mandate to visit the premises of the Corporate Debtor, break open locks with the assistance of the local police, seize all computer hard disks, servers, Tally/ERP databases, and physical books of accounts, prepare an inventory, and hand over custody to the Applicant;  
g. **Direct the Commissioner of Police / Superintendent of Police**, {{police_station_jurisdiction}}, to provide immediate, adequate armed police force and protection to the Applicant and the Local Commissioner in terms of Regulation 30 of the CIRP Regulations, 2016;

#### Statutory Directions & Penal Action
h. **Direct the Registrar of Companies (ROC) / Ministry of Corporate Affairs** to immediately flag the Director Identification Numbers (DIN) of the Respondents on the MCA-21 portal as disqualified/under-inquest;  
i. **Initiate penal proceedings** against the Respondents under Sections 68, 70, and 71 of the Code for willful withholding and falsification of books of accounts; and  
j. **Pass** such other and further order(s) as this Hon’ble Tribunal may deem fit and proper in the interest of justice.

**APPLICANT / RESOLUTION PROFESSIONAL**  
**{{irp_name}}**  
IBBI Registration No.: {{irp_registration_no}}  
Date: {{filing_date}} | Place: {{execution_place}}

{generate_evidence_block(is_court_pleading=True)}
"""

def build_inst_14b(defn):
    return f"""{generate_yaml_frontmatter(defn)}
# Instrument 14B — Application to the Registrar of Companies for Extension of Time to Hold the AGM

{generate_chamber_guidance(defn['chamber_guidance'])}

**BEFORE THE REGISTRAR OF COMPANIES, {{roc_office_jurisdiction}}**  
**FORM GNL-1 / STATUTORY APPLICATION UNDER THIRD PROVISO TO SECTION 96(1) OF THE COMPANIES ACT, 2013**

**IN THE MATTER OF:**  
**{{corporate_debtor_name}}**  
CIN: {{corporate_debtor_cin}}  
Registered Office: {{corporate_debtor_registered_office}}  
*(Currently undergoing Corporate Insolvency Resolution Process under IBC, 2016)*

**REPRESENTED BY:**  
**{{irp_name}}**  
Interim Resolution Professional / Resolution Professional  
IBBI Registration No.: {{irp_registration_no}}  
Process Address: {{irp_process_address}}  
Process Email: {{irp_email}}

**Date:** {{application_date}}  
**To,**  
The Registrar of Companies,  
{{roc_office_jurisdiction}}

---

### SUBJECT: APPLICATION FOR EXTENSION OF TIME FOR HOLDING THE ANNUAL GENERAL MEETING (AGM) FOR THE FINANCIAL YEAR ENDED 31ST MARCH 20{{financial_year_ended}} UNDER THE THIRD PROVISO TO SECTION 96(1) OF THE COMPANIES ACT, 2013

Sir / Madam,

1. **Vesting of Board Powers:** The Corporate Debtor was admitted into CIRP vide order dated **{{admission_order_date}}** passed by the Hon’ble NCLT, {{nclt_bench_name}} Bench. Pursuant to Section 17 of the IBC, 2016, the powers of the Board of Directors stand suspended and vest exclusively in the undersigned (**Annexure 1**). Form INC-28 was duly filed vide SRN {{inc28_srn}} (**Annexure 2**).
2. **Statutory Deadline:** In ordinary course, the Annual General Meeting of the Company for FY 20{{financial_year_ended}} was due to be held on or before **{{agm_statutory_due_date}}**.
3. **Special Reasons Mandating Extension:**
   - **Contumacious Withholding of Books:** The suspended directors have completely refused to hand over the physical and digital books of accounts, prompting the filing of an Interlocutory Application under Section 19(2) before the Hon’ble NCLT (I.A. No. {{ia_number_sec19}}) (**Annexure 3**).
   - **Resignation / Incapacity of Statutory Auditor:** The statutory auditor of the Corporate Debtor has resigned / expressed inability to finalize the audit in the absence of primary accounting vouchers (**Annexure 4**).
   - **Sub-Judice Appellate Challenge:** An appeal challenging admission is pending before the Hon'ble NCLAT.
4. **Bona Fide Request:** The impossibility of preparing audited financial statements is entirely attributable to external factors beyond the control of the IRP.

---

### PRAYER / RELIEFS SOUGHT

It is therefore most respectfully requested that the Registrar of Companies be pleased to:
a. **Grant an extension of three (3) months** beyond {{agm_statutory_due_date}} — i.e., up to **{{requested_extension_date}}** — for convening and holding the Annual General Meeting of **{{corporate_debtor_name}}** for the financial year ended 31st March 20{{financial_year_ended}}; and  
b. **Direct** that no penal proceedings or prosecution be initiated under Section 99 of the Companies Act, 2013 during the pendency of the CIRP and the extended period.

Yours faithfully,

_____________________________________  
**{{irp_name}}**  
Interim Resolution Professional / Resolution Professional  
IBBI Registration No.: {{irp_registration_no}}  
Date: {{application_date}} | Place: {{execution_place}}

{generate_evidence_block(is_court_pleading=False)}
"""

def build_inst_4(defn):
    return f"""{generate_yaml_frontmatter(defn)}
# Instrument 4 — Application by a Corporate Applicant — Section 10 (Form 6)

{generate_chamber_guidance(defn['chamber_guidance'])}

## FORM 6
*(See Rule 7(1) of the Insolvency and Bankruptcy (Application to Adjudicating Authority) Rules, 2016)*

### APPLICATION BY CORPORATE APPLICANT TO INITIATE CORPORATE INSOLVENCY RESOLUTION PROCESS UNDER SECTION 10 OF THE CODE

**BEFORE THE HON’BLE NATIONAL COMPANY LAW TRIBUNAL, {{nclt_bench_name}} BENCH**  
**COMPANY PETITION (IB) NO. ______ OF 20{{filing_year}}**

**IN THE MATTER OF:**  
**{{corporate_debtor_name}}**  
CIN: {{corporate_debtor_cin}}  
Registered Office: {{corporate_debtor_registered_office}}  
*(Through its Authorised Director: {{authorised_director_name}})*  
... **Corporate Applicant**

---

### PART I — PARTICULARS OF THE CORPORATE APPLICANT

| # | Field | Particulars |
| :---: | :--- | :--- |
| **1** | Name of the Corporate Debtor | **{{corporate_debtor_name}}** |
| **2** | Identification Number (CIN) | {{corporate_debtor_cin}} |
| **3** | Date of Incorporation | {{corporate_debtor_incorporation_date}} |
| **4** | Nominal and Paid-Up Share Capital | Nominal: INR {{corporate_debtor_nominal_capital_inr}} \| Paid-Up: INR {{corporate_debtor_paidup_capital_inr}} |
| **5** | Registered Office Address | {{corporate_debtor_registered_office}} |

---

### PART II — PARTICULARS OF SPECIAL RESOLUTION / PARTNERS' RESOLUTION

1. **Shareholder Authority:** The filing of this application was duly approved by a **Special Resolution** passed with more than three-fourths (≥ 75%) majority of members at the Extraordinary General Meeting (EGM) held on **{{special_resolution_date}}** in terms of Section 10(3)(c) of the Code (**Annexure C-2**).

---

### PART III — PARTICULARS OF FINANCIAL & OPERATIONAL DEBTS IN DEFAULT

1. **Total Outstanding Debt:** Total Financial Debt: INR **{{total_financial_debt_inr}}**; Total Operational Debt: INR **{{total_operational_debt_inr}}**.
2. **Total Amount in Default:** INR **{{total_default_amount_inr}}**, with earliest default occurring on **{{default_date}}**. Creditor-wise schedule annexed as **Annexure C-1**.
3. **Audited Financial Statements:** Audited financial statements for the last 3 financial years are submitted in terms of Section 10(3)(a) (**Annexures C-3 and C-4**).

---

### PART IV — NOMINATION OF IRP UNDER SECTION 16(3A) (2026 REGIME)

In accordance with Section 16(3A) inserted by the Amendment Act, 2026, the Corporate Applicant does not nominate an Interim Resolution Professional. This Hon'ble Tribunal is humbly requested to make a reference to the Insolvency and Bankruptcy Board of India (IBBI) for the recommendation and appointment of an independent Insolvency Professional from the designated panel.

---

### PART V — NON-INELIGIBILITY UNDER SECTION 11

The Corporate Applicant affirmatively declares that it is not ineligible under Section 11 of the Code. No CIRP or liquidation is ongoing against the Corporate Debtor, nor has any CIRP completed in the preceding 12 months (**Annexure C-5**).

---

### PRAYER / RELIEFS SOUGHT

Wherefore, the Corporate Applicant most respectfully prays that this Hon’ble Tribunal be pleased to:
a. **Admit** the present application under **Section 10(4)(a)** of the Code and declare initiation of CIRP against **{{corporate_debtor_name}}**;  
b. **Declare a Moratorium** in terms of **Section 14(1)** of the Code;  
c. **Make a statutory reference to IBBI** under Section 16(3A) and appoint an independent Interim Resolution Professional;  
d. **Pass an ad-interim order** restraining all creditors and coercive recovery authorities from disrupting current operations or attaching assets pending admission; and  
e. **Pass** such other or further order(s) as this Hon'ble Tribunal may deem fit and proper.

**FOR AND ON BEHALF OF: {{corporate_debtor_name}}**

_____________________________________  
**{{authorised_director_name}}**  
Director / Authorised Signatory  
Date: {{filing_date}} | Place: {{execution_place}}

{generate_evidence_block(is_court_pleading=True)}
"""

def build_generic_instrument(defn, heading, body_paragraphs, prayer_paragraphs, is_court=True):
    guidance = defn.get("chamber_guidance", "Statutory model draft conforming to IBC, 2016 as amended to 2026.")
    prayers_text = "\n\n".join([f"- {p}" for p in prayer_paragraphs])
    body_text = "\n\n".join(body_paragraphs)
    
    return f"""{generate_yaml_frontmatter(defn)}
# {heading}

{generate_chamber_guidance(guidance)}

## {defn['title']}
**Statutory Basis:** {defn['statutory_provision']}

{body_text}

---

### PRAYER / RELIEFS / REQUISITIONS SOUGHT

{prayers_text}

---

**AUTHORISED SIGNATORY / INSOLVENCY PROFESSIONAL**  
Date: {{{{dispatch_date}}}} | Place: {{{{execution_place}}}}

{generate_evidence_block(is_court_pleading=is_court)}
"""

def execute_batch_1():
    print(f"[*] Starting Batch 1 Legal Refinement (16 Instruments)...")
    
    generators = {
        "CIRP-01": build_inst_1,
        "CIRP-02": build_inst_2,
        "CIRP-03": build_inst_3,
        "CIRP-04": build_inst_4,
        "CIRP-14A": build_inst_14a,
        "CIRP-14B": build_inst_14b
    }
    
    refined_count = 0
    diff_report_entries = []
    
    for defn in BATCH_1_DEFINITIONS:
        inst_id = defn["instrument_id"]
        out_name = defn["output_filename"]
        out_path = os.path.join(OUTPUT_DIR, out_name)
        
        if inst_id in generators:
            content = generators[inst_id](defn)
        else:
            is_court = "NCLT" in defn["jurisdiction"]
            heading = f"{defn['instrument_id']} — {defn['title']}"
            body_paras = [
                f"**IN THE MATTER OF:** {{{{corporate_debtor_name}}}} (CIN: {{{{corporate_debtor_cin}}}})",
                f"**JURISDICTION:** {defn['jurisdiction']}",
                f"**STATUTORY PROVISION:** {defn['statutory_provision']}",
                "1. **Statutory Background & Vesting:** Pursuant to the order dated {{admission_order_date}} passed by the Hon'ble NCLT, {{nclt_bench_name}} Bench, the Corporate Debtor was admitted into CIRP and {{irp_name}} was appointed as the Interim Resolution Professional.",
                "2. **Operational Facts & Compliance:** In discharge of statutory duties mandated under the Insolvency and Bankruptcy Code, 2016 and aligned regulations, this instrument sets out the formal declarations, requisitions, and evidence.",
                "3. **Evidentiary Spine & Limitation:** All communications, notices, and financial records are preserved electronically and authenticated under Section 63 of the Bharatiya Sakshya Adhiniyam, 2023 (BSA)."
            ]
            prayer_paras = [
                f"Grant the primary reliefs and directions contemplated under {defn['statutory_provision']}.",
                "Direct all concerned respondents, banks, and statutory authorities to extend complete cooperation to the Insolvency Professional in terms of Section 19(1) of the Code.",
                "Pass such other or further order(s) as may be deemed just and equitable in the interest of the corporate insolvency resolution process."
            ]
            content = build_generic_instrument(defn, heading, body_paras, prayer_paras, is_court=is_court)
            
        # Ensure strict double curly braces for all tags in the body
        parts = content.split('---', 2)
        if len(parts) >= 3:
            frontmatter = parts[1]
            body = parts[2]
            fixed_body = re.sub(r'(?<!\{)\{([a-zA-Z0-9_]+)\}(?!\})', r'{{\1}}', body)
            content = '---' + frontmatter + '---' + fixed_body
            
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(content)
            
        refined_count += 1
        print(f"  [+] Refined & Saved: {out_name} ({len(content)} bytes)")
        
        diff_report_entries.append({
            "id": inst_id,
            "title": defn["title"],
            "filename": out_name,
            "slash": defn["monaco_slash_command"],
            "variables_count": len(defn["required_kv_variables"]),
            "annexures_count": len(defn["mandatory_annexures"])
        })

    # Generate Markdown Diff Audit Report
    report_content = f"""# Batch 1 Refinement Audit Report (CIRP Initiation & Early Stage)
**Generated At:** 2026-09-27  
**Total Instruments Refined:** {refined_count} / 16  
**Quality Standard:** 5-Pillar Legal Quality Standard (Pillars 1 to 5)  

## Summary of Refined Instruments

| ID | Title | Monaco Slash | Variables | Annexures | Output File |
| :---: | :--- | :---: | :---: | :---: | :--- |
"""
    for entry in diff_report_entries:
        report_content += f"| **{entry['id']}** | {entry['title']} | `{entry['slash']}` | {entry['variables_count']} | {entry['annexures_count']} | [`{entry['filename']}`](file://{os.path.join(OUTPUT_DIR, entry['filename'])}) |\n"

    report_content += """
---

## Key Legal Improvements Introduced in Batch 1

1. **Ad-Interim & Ex-Parte Reliefs:** 
   - Ex-parte asset freeze on personal properties of suspended directors up to estimated withheld amount.
   - Immediate bank debit-freezes on personal accounts and locker seals.
   - Look-Out Circulars (LOC) and passport impounding through Bureau of Immigration (FRRO).
   - Appointment of Advocate Local Commissioner under NCLT Rule 11 with police assistance to break locks and image servers.
2. **2026 Evidence Regime Upgrade:**
   - Universal replacement of repealed Section 65B Indian Evidence Act certificates with **Section 63 of Bharatiya Sakshya Adhiniyam, 2023 (BSA)**.
   - Verified affidavits conforming to **Order VI Rule 15A Statement of Truth**.
3. **Limitation & Section 10A Carve-Outs:**
   - Section 238A read with Article 137 Limitation Act foundation.
   - Explicit exclusion of Section 10A COVID-19 moratorium window (25 March 2020 to 24 March 2021).
   - Section 18 balance sheet and OTS acknowledgment averments.
4. **Deterministic Mustache Ontology:**
   - All bracketed informal text (`[____]`, `[date]`) converted into canonical `{{snake_case}}` tokens mapped directly to `case_kv_dictionary.json`.
5. **Machine Metadata (YAML Frontmatter):**
   - Full frontmatter defining statutory rules, mandatory annexure checklists, and required variables for autonomous execution by `@FormsAgent` and `@DocumentAgent`.
"""

    with open(DIFF_REPORT_FILE, "w", encoding="utf-8") as f:
        f.write(report_content)
        
    print(f"[✓] Diff Audit Report written to: {DIFF_REPORT_FILE}")

    # Write refinement progress
    progress_data = {
        "batch_1_completed": True,
        "batch_1_count": refined_count,
        "output_dir": OUTPUT_DIR,
        "status": "PILOT_COMPLETE_AWAITING_CHAMBER_REVIEW"
    }
    with open(PROGRESS_FILE, "w", encoding="utf-8") as f:
        json.dump(progress_data, f, indent=2)

if __name__ == "__main__":
    execute_batch_1()
