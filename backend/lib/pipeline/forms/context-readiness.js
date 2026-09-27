/**
 * context-readiness.js
 * ─────────────────────────────────────────────────────────────────
 * Commercial Courts Context Readiness Checker (Pre-Flight Inquest)
 * 
 * Audits ingested case files and case_kv_dictionary.json against the
 * 5 mandatory statutory fact buckets required for Commercial Suits,
 * Order 38 Rule 5 (Attachment Before Judgment), Order 39 (Injunction),
 * and Section 12A PIMS mediation/urgency pleadings.
 * 
 * Provides:
 *   1. auditContextReadiness(caseDir)
 *   2. updateContextFact(caseDir, key, value)
 *   3. generateReadinessMarkdown(auditResult)
 * ─────────────────────────────────────────────────────────────────
 */

'use strict';

const fs   = require('fs');
const path = require('path');

/**
 * 5 Mandatory Statutory Fact Buckets for Commercial Court Proceedings.
 */
const STATUTORY_FACT_BUCKETS = {
  parties_and_capacity: {
    id: 'parties_and_capacity',
    title: '1. Forum, Parties & Corporate Capacity',
    description: 'Mandatory identification of Court, litigant entities, active authorized representatives, and board authorizations.',
    items: [
      {
        key: 'court_name',
        label: 'Court Name & Commercial Division',
        courtRequirement: 'Determines pecuniary threshold under Section 3/4 Commercial Courts Act, 2015 and local territorial jurisdiction.',
        suggestedDefault: 'Commercial Court / District Judge (Commercial Division)',
        searchRegex: /(?:before\s+the\s+(?:court|commercial\s+court|district\s+judge)|court\s+of\s+([A-Za-z\s,.]+))/i
      },
      {
        key: 'petitioner_name',
        label: 'Plaintiff / Petitioner Legal Entity',
        courtRequirement: 'Order VII Rule 1(b) CPC requires exact corporate name, registered address, and incorporation credentials.',
        suggestedDefault: 'Corporate Plaintiff / Landlord',
        searchRegex: /(?:m\/s\s+[A-Za-z0-9\s,.\-&]+(?:private\s+limited|pvt\.?\s*ltd\.?|limited|llp|firm))/i
      },
      {
        key: 'petitioner_rep',
        label: 'Authorized Signatory / Director',
        courtRequirement: 'Order VI Rule 14 CPC requires pleadings to be signed by an authorized principal officer or director.',
        suggestedDefault: 'Director / Authorized Signatory',
        searchRegex: /(?:through\s+(?:its\s+)?(?:director|partner|authorized\s+representative|signatory)[,\s]+([A-Za-z\s.]+))/i
      },
      {
        key: 'board_resolution_date',
        label: 'Board Resolution / Power of Attorney Date',
        courtRequirement: 'Mandatory for Order VI Rule 15A Statement of Truth to establish legal authority to swear deposition on behalf of company.',
        suggestedDefault: 'Date of Board Meeting Authorization',
        searchRegex: /(?:board\s+resolution\s+(?:dated|of)\s+(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4})|resolution\s+dated\s+(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4}))/i
      },
      {
        key: 'respondent_name',
        label: 'Principal Defendant / Debtor Entity',
        courtRequirement: 'Order VII Rule 1(c) CPC: Identifying primary borrower, lessee, or commercial contractor.',
        suggestedDefault: 'Defendant Entity / Firm',
        searchRegex: /(?:versus|vs\.?)\s*\n?([A-Za-z0-9\s,.\-&]+(?:hospitality|enterprises|traders|limited|pvt|firm))/i
      },
      {
        key: 'target_respondent_name',
        label: 'Personally Liable Partner / Guarantor',
        courtRequirement: 'Section 25 Partnership Act, 1932 or Section 128 Contract Act: Necessary for attaching personal assets of individual partners/guarantors.',
        suggestedDefault: 'Active Partner / Personal Guarantor',
        searchRegex: /(?:partner|guarantor|director)[,\s]+(?:shri|mr\.?|ms\.?)?\s*([A-Za-z\s]+)/i
      }
    ]
  },

  quantum_and_incurrence: {
    id: 'quantum_and_incurrence',
    title: '2. Monetary Quantum & Commercial Incurrence',
    description: 'Admitted claim quantification, contractual interest clauses, and commercial dispute categorization.',
    items: [
      {
        key: 'disputed_quantum',
        label: 'Quantified Monetary Claim (Principal + Arrears)',
        courtRequirement: 'Establishes Specified Value under Section 2(1)(i) Commercial Courts Act (minimum ₹3 Lakhs) and court fee computation.',
        suggestedDefault: '₹ Amount of Claim / Arrears',
        searchRegex: /(?:₹|rs\.?|inr)\s*([0-9,]+(?:\.[0-9]{2})?|-)/i
      },
      {
        key: 'nature_of_commercial_dispute',
        label: 'Commercial Dispute Classification (§ 2(1)(c))',
        courtRequirement: 'Commercial Court jurisdiction only attaches if dispute falls within clauses (i) to (xxii) of Section 2(1)(c) CCA.',
        suggestedDefault: 'Commercial lease arrears and building misuse penalty under Section 2(1)(c)(vii)',
        searchRegex: /(?:commercial\s+lease|mercantile|contract|distribution|intellectual\s+property|construction)/i
      },
      {
        key: 'agreement_date',
        label: 'Contract / Lease Deed Execution Date',
        courtRequirement: 'Establishes contractual entitlement, privity, and limitation period under Article 55 Limitation Act, 1963.',
        suggestedDefault: 'DD.MM.YYYY',
        searchRegex: /(?:agreement|lease\s+deed|contract)\s+dated\s+(\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4})/i
      },
      {
        key: 'contractual_interest_rate',
        label: 'Contractual Interest Rate (% p.a.)',
        courtRequirement: 'Section 34 CPC: Commercial contracts permit award of contractual rate above standard 6% statutory interest.',
        suggestedDefault: '18% per annum',
        searchRegex: /(\d{1,2}(?:\.\d+)?)\s*%\s*(?:per\s+annum|p\.a\.)/i
      },
      {
        key: 'mesne_profits_rate',
        label: 'Monthly Mesne Profits / Use & Occupation Charges',
        courtRequirement: 'Order XX Rule 12 CPC: Inquiry and recovery of unauthorized occupation charges post-termination of commercial lease/agreement.',
        suggestedDefault: '₹2,00,000/- per month',
        searchRegex: /(?:(?:mesne\s+profits|occupation\s+charges)[^0-9]*(?:@|of)?\s*(?:₹|rs\.?)\s*([0-9,]+(?:\.[0-9]{2})?)\s*(?:per\s+month|p\.m\.)|(?:₹|rs\.?)\s*([0-9,]+(?:\.[0-9]{2})?)(?:\/-\s*)?\s*(?:per\s+month|p\.m\.)\s*(?:as\s+)?(?:mesne\s+profits|damages))/i
      },
      {
        key: 'earnest_money_forfeited',
        label: 'Earnest Money Forfeited under Breach Clause',
        courtRequirement: 'Section 74 Contract Act: Justifying retention/forfeiture of earnest deposit upon buyer default.',
        suggestedDefault: '₹2,00,01,000/-',
        searchRegex: /(?:forfeit(?:ing|ed)?\s+(?:the\s+)?earnest\s+money\s+(?:of\s+)?(?:₹|rs\.?)\s*([0-9,]+)|clause\s+12)/i
      }
    ]
  },

  target_asset_schedule: {
    id: 'target_asset_schedule',
    title: '3. Target Asset Schedule (Order 38 Rule 5 CPC)',
    description: 'Precise immovable/movable asset schedule required for valid Attachment Before Judgment orders.',
    items: [
      {
        key: 'schedule_property_description',
        label: 'Identifiable Property Address & Municipal Description',
        courtRequirement: 'Order XXXVIII Rule 5 CPC: Attachment cannot be granted against vague assets. Court requires specific house/plot/khasra numbers.',
        suggestedDefault: 'House / Plot / Unit Number, Sector / Colony, City',
        searchRegex: /(?:house\s+no\.?|h\.no\.?|plot\s+no\.?|kothi\s+no\.?|sco\s+no\.?)\s*([0-9A-Za-z\/-]+).*?(?:sector|phase|colony|nagar)\s*([0-9A-Za-z\s]+)/i
      },
      {
        key: 'sub_registrar_jurisdiction',
        label: 'Sub-Registrar / Land Revenue Authority Jurisdiction',
        courtRequirement: 'Mandatory for Prayer (c) directing revenue authorities to register a prohibitory "Red Entry" lis-pendens note.',
        suggestedDefault: 'Sub-Registrar / Tehsildar / Estate Officer of District',
        searchRegex: /(?:sub-registrar|tehsildar|estate\s+officer|revenue\s+department)[,\s]+([A-Za-z\s,.]+)/i
      }
    ]
  },

  alienation_and_raman_tech: {
    id: 'alienation_and_raman_tech',
    title: '4. Fraudulent Alienation Evidence (Raman Tech Standard)',
    description: 'Specific factual averments proving imminent disposal to defeat decree, satisfying Supreme Court standard.',
    items: [
      {
        key: 'alienation_apprehension_facts',
        label: 'Factual Grounds of Attempted Alienation',
        courtRequirement: 'Raman Tech (2008) 2 SCC 302: Extraordinary power of Order 38 Rule 5 cannot be used merely because suit is strong; requires prima facie proof of active disposal.',
        suggestedDefault: 'Defendant actively negotiating with local property brokers to sell or transfer the schedule property to third parties',
        searchRegex: /(?:negotiat(?:ing|ed)\s+to\s+sell|attempting\s+to\s+alienate|disposing\s+of|market\s+sources|property\s+dealers)/i
      },
      {
        key: 'antecedents_of_default',
        label: 'Insolvency Risk & Antecedents of Dishonour',
        courtRequirement: 'Demonstrates risk of a "paper decree" where without pre-judgment attachment, recovery is impossible.',
        suggestedDefault: 'Bounced post-dated cheques under Section 138 NI Act and multiple landlord/vendor defaults',
        searchRegex: /(?:138\s+(?:of\s+the\s+)?(?:ni|negotiable\s+instruments)|cheque\s+bounce|default\s+of\s+approx|unpaid\s+default)/i
      }
    ]
  },

  statutory_procedural_gates: {
    id: 'statutory_procedural_gates',
    title: '5. Statutory & Procedural Gateways (CCA & CPC)',
    description: 'Section 12A PIMS mediation exemption and electronic evidence certificates.',
    items: [
      {
        key: 'section_12a_pims_status',
        label: 'Section 12A PIMS Compliance / Urgency Exemption',
        courtRequirement: 'Patil Automation (2022) 10 SCC 1: Suit is rejected under Order VII Rule 11 if instituted without pre-institution mediation, unless urgent interim relief is pleaded.',
        suggestedDefault: 'Urgent interim relief under Order 38 Rule 5 and Order 39 CPC contemplated (Section 12A(1) Proviso)',
        searchRegex: /(?:section\s+12a|pre-institution\s+mediation|non-starter|patil\s+automation|urgent\s+interim\s+relief)/i
      },
      {
        key: 'statement_of_truth_deponent',
        label: 'Order VI Rule 15A Statement of Truth Details',
        courtRequirement: 'Mandatory statutory verification format for commercial suits. Non-compliance results in striking off pleadings.',
        suggestedDefault: 'Deponent Name, Age, Father\'s Name, Residence, and Capacity',
        searchRegex: /(?:statement\s+of\s+truth|order\s+vi\s+rule\s+15a|solemnly\s+affirm\s+and\s+state\s+on\s+oath)/i
      },
      {
        key: 'electronic_records_certificate',
        label: 'Digital Records Declaration (§ 63 BSA / § 65B EA)',
        courtRequirement: 'Commercial suits relying on computer printouts, ledger statements, or emails require an electronic record certificate.',
        suggestedDefault: 'Complies with Section 63 of Bharatiya Sakshya Adhiniyam, 2023 / Section 65B Evidence Act',
        searchRegex: /(?:bharatiya\s+sakshya\s+adhiniyam|section\s+63|section\s+65b|computerized\s+electronic\s+record)/i
      },
      {
        key: 'affidavit_of_correct_email',
        label: 'Affidavit of Correct Email & Mobile Contacts (PIMS Rule 3)',
        courtRequirement: 'Mandatory sworn affidavit validating Opposite Party electronic service coordinates under Rule 3(2)/(3).',
        suggestedDefault: 'Sworn affidavit with verified emails & mobile numbers (Index Item 4)',
        searchRegex: /(?:affidavit\s+of\s+correct\s+e-?mail|correct\s+e-?mail\s+id)/i
      }
    ]
  }
};

/**
 * Reads all files and extracted companion text for a case.
 */
function harvestCaseTextCorpus(caseDir) {
  const corpus = [];
  if (!caseDir || !fs.existsSync(caseDir)) return corpus;

  const candidateDirs = [
    caseDir,
    path.join(caseDir, 'raw'),
    path.join(caseDir, 'companion')
  ];

  for (const cDir of candidateDirs) {
    if (!fs.existsSync(cDir)) continue;
    try {
      const files = fs.readdirSync(cDir);
      for (const file of files) {
        if (file.endsWith('.md') || file.endsWith('.txt')) {
          const filePath = path.join(cDir, file);
          try {
            const content = fs.readFileSync(filePath, 'utf8');
            corpus.push({
              filename: file,
              path: filePath,
              content
            });
          } catch (_) {}
        }
      }
    } catch (_) {}
  }

  return corpus;
}

/**
 * Audits the context readiness of a case directory for Commercial Court proceedings.
 * 
 * @param {string} caseDir - Absolute path to the case directory
 * @returns {Object} Complete diagnostic readiness matrix
 */
function auditContextReadiness(caseDir) {
  let kvDict = {};
  if (caseDir) {
    const kvPath = path.join(caseDir, 'reviews', 'case_kv_dictionary.json');
    if (fs.existsSync(kvPath)) {
      try {
        kvDict = JSON.parse(fs.readFileSync(kvPath, 'utf8'));
      } catch (_) {}
    }
  }

  const textCorpus = harvestCaseTextCorpus(caseDir);
  const bucketsResult = {};
  const foundItems = [];
  const missingItems = [];
  let totalCount = 0;
  let foundCount = 0;

  for (const [bucketKey, bucketMeta] of Object.entries(STATUTORY_FACT_BUCKETS)) {
    const evaluatedItems = [];

    for (const item of bucketMeta.items) {
      totalCount++;
      let status = 'MISSING';
      let value = null;
      let source = null;

      // 1. Check if explicitly in case_kv_dictionary.json
      if (kvDict[item.key] && String(kvDict[item.key]).trim() !== '' && kvDict[item.key] !== 'XXXX') {
        status = 'FOUND';
        value = String(kvDict[item.key]).trim();
        source = 'case_kv_dictionary.json';
        if (kvDict[`${item.key}_source`]) {
          source = `${kvDict[`${item.key}_source`]} (via KV)`;
        }
      } else {
        // 2. Scan text corpus with regex heuristics if not in KV dictionary
        if (item.searchRegex && textCorpus.length > 0) {
          for (const doc of textCorpus) {
            const match = doc.content.match(item.searchRegex);
            if (match) {
              status = 'INFERRED';
              value = (match[1] || match[0]).trim().replace(/\n+/g, ' ');
              source = `${doc.filename} (inferred)`;
              break;
            }
          }
        }
      }

      const itemRecord = {
        key: item.key,
        label: item.label,
        status,
        value,
        source,
        courtRequirement: item.courtRequirement,
        suggestedDefault: item.suggestedDefault
      };

      if (status === 'FOUND' || status === 'INFERRED') {
        foundCount++;
        foundItems.push(itemRecord);
      } else {
        missingItems.push(itemRecord);
      }

      evaluatedItems.push(itemRecord);
    }

    bucketsResult[bucketKey] = {
      id: bucketMeta.id,
      title: bucketMeta.title,
      description: bucketMeta.description,
      items: evaluatedItems,
      bucketFoundCount: evaluatedItems.filter(i => i.status !== 'MISSING').length,
      bucketTotalCount: evaluatedItems.length
    };
  }

  const readinessScore = totalCount > 0 ? Math.round((foundCount / totalCount) * 100) : 0;
  let readinessGrade = 'BLOCKED';
  if (readinessScore >= 85) {
    readinessGrade = 'READY';
  } else if (readinessScore >= 60) {
    readinessGrade = 'NEEDS_ATTENTION';
  }

  const result = {
    caseDir,
    summary: {
      totalFacts: totalCount,
      foundCount,
      missingCount: totalCount - foundCount,
      readinessScore,
      readinessGrade
    },
    buckets: bucketsResult,
    foundItems,
    missingItems
  };

  result.markdownReport = generateReadinessMarkdown(result);
  return result;
}

/**
 * Updates a specific key in case_kv_dictionary.json with user verification.
 * 
 * @param {string} caseDir - Absolute path to the case directory
 * @param {string} key - Fact key to update
 * @param {string} value - Fact value to write
 * @returns {Object} Updated readiness audit
 */
function updateContextFact(caseDir, key, value) {
  if (!caseDir) {
    throw new Error('caseDir is required to update context facts.');
  }

  const reviewsDir = path.join(caseDir, 'reviews');
  if (!fs.existsSync(reviewsDir)) {
    fs.mkdirSync(reviewsDir, { recursive: true });
  }

  const kvPath = path.join(reviewsDir, 'case_kv_dictionary.json');
  let kvDict = {};
  if (fs.existsSync(kvPath)) {
    try {
      kvDict = JSON.parse(fs.readFileSync(kvPath, 'utf8'));
    } catch (_) {}
  }

  kvDict[key] = value;
  kvDict[`${key}_verified_by_user`] = 1;
  kvDict[`${key}_updated_at`] = new Date().toISOString();

  fs.writeFileSync(kvPath, JSON.stringify(kvDict, null, 2), 'utf8');

  // Return fresh audit
  return auditContextReadiness(caseDir);
}

/**
 * Generates an executive Markdown audit report suitable for Monaco display or sidebar widgets.
 */
function generateReadinessMarkdown(auditResult) {
  const { summary, buckets, foundItems, missingItems } = auditResult;

  let gradeBadge = '🔴 BLOCKED (< 60% facts ready)';
  if (summary.readinessGrade === 'READY') {
    gradeBadge = '🟢 COURT READY (>= 85% facts verified)';
  } else if (summary.readinessGrade === 'NEEDS_ATTENTION') {
    gradeBadge = '🟡 NEEDS ATTENTION (60%–84% facts ready)';
  }

  let md = `## ⚖️ Commercial Court Context Readiness Audit\n\n`;
  md += `**Overall Readiness Score:** \`${summary.readinessScore}%\` — **${gradeBadge}**  \n`;
  md += `**Audit Metrics:** ${summary.foundCount} / ${summary.totalFacts} statutory facts verified (${summary.missingCount} missing context gaps)\n\n`;
  md += `---\n\n`;

  // Missing section first for fast practitioner triage
  if (missingItems.length > 0) {
    md += `### ❌ Missing Statutory Context (Action Required Before Filing)\n\n`;
    md += `The following mandatory elements were **not found** in your ingested files. The Court requires these for interlocutory orders:\n\n`;
    md += `| Missing Legal Fact | Statutory & Court Necessity | Recommended Action / Quick-Fill |\n`;
    md += `|:---|:---|:---|\n`;

    for (const item of missingItems) {
      md += `| **⚠️ ${item.label}** (\`${item.key}\`) | ${item.courtRequirement} | *e.g. "${item.suggestedDefault}"* |\n`;
    }
    md += `\n> **Tip:** You can provide any missing fact via the Case Action Inbox or by setting it in \`reviews/case_kv_dictionary.json\`.\n\n`;
    md += `---\n\n`;
  }

  // Found section
  md += `### ✅ Context Extracted & Verified from Your Case Files\n\n`;
  if (foundItems.length === 0) {
    md += `*No facts successfully extracted yet. Please upload agreements, bank statements, or notices to the case folder.*\n\n`;
  } else {
    md += `| Discovered Fact | Extracted Value | Provenance / Document Source |\n`;
    md += `|:---|:---|:---|\n`;
    for (const item of foundItems) {
      const icon = item.status === 'INFERRED' ? '🔍' : '✓';
      md += `| ${icon} **${item.label}** | \`${item.value}\` | \`${item.source}\` |\n`;
    }
    md += `\n`;
  }

  md += `---\n\n`;
  md += `### 📋 Statutory Fact Breakdown by Category\n\n`;
  for (const [_, b] of Object.entries(buckets)) {
    const pct = Math.round((b.bucketFoundCount / b.bucketTotalCount) * 100);
    md += `* **${b.title}:** \`${pct}%\` ready (${b.bucketFoundCount}/${b.bucketTotalCount})\n`;
  }

  return md;
}

module.exports = {
  auditContextReadiness,
  updateContextFact,
  generateReadinessMarkdown,
  STATUTORY_FACT_BUCKETS
};
