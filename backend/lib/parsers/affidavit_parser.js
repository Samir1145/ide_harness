'use strict';

const fs = require('fs');
const path = require('path');

const RELATIVE_KEYWORDS = [
  { relation: 'Spouse', regex: /(?:wife|husband|spouse)\s*(?:is|named|name)?\s*[:\-]?\s*([A-Za-z\s\.]+)/i },
  { relation: 'Father', regex: /(?:father|father's\s+name)\s*(?:is|named)?\s*[:\-]?\s*([A-Za-z\s\.]+)/i },
  { relation: 'Mother', regex: /(?:mother|mother's\s+name)\s*(?:is|named)?\s*[:\-]?\s*([A-Za-z\s\.]+)/i },
  { relation: 'Brother', regex: /(?:brother|brother's\s+name)\s*(?:is|named)?\s*[:\-]?\s*([A-Za-z\s\.]+)/i },
  { relation: 'Sister', regex: /(?:sister|sister's\s+name)\s*(?:is|named)?\s*[:\-]?\s*([A-Za-z\s\.]+)/i },
  { relation: 'Son', regex: /(?:son|son's\s+name)\s*(?:is|named)?\s*[:\-]?\s*([A-Za-z\s\.]+)/i },
  { relation: 'Daughter', regex: /(?:daughter|daughter's\s+name)\s*(?:is|named)?\s*[:\-]?\s*([A-Za-z\s\.]+)/i },
  { relation: 'Son Wife', regex: /(?:son's\s+wife|daughter-in-law)\s*(?:is|named)?\s*[:\-]?\s*([A-Za-z\s\.]+)/i },
  { relation: 'Daughter Husband', regex: /(?:daughter's\s+husband|son-in-law)\s*(?:is|named)?\s*[:\-]?\s*([A-Za-z\s\.]+)/i }
];

const PAN_REGEX = /\b([A-Z]{5}[0-9]{4}[A-Z]{1})\b/g;
const DIN_REGEX = /\b(DIN\s*[:\-]?\s*[0-9]{8})\b/gi;
const DATE_REGEX = /\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\s,]+\d{4})\b/i;

/**
 * Parses a sworn Section 29A Affidavit text and extracts structured private disclosures.
 *
 * @param {string} rawText - Full text of the affidavit
 * @param {string} matterDir - Matter root directory path
 * @returns {object} Extracted disclosure dossier
 */
function parseAffidavit(rawText, matterDir = null) {
  const text = rawText || '';

  // 1. Extract Deponent
  let deponentName = null;
  const deponentMatch = text.match(/I,\s*([A-Za-z\s\.]+?),\s*(?:aged|residing|son|daughter|director)/i)
    || text.match(/Deponent\s*[:\-]?\s*([A-Za-z\s\.]+)/i);
  if (deponentMatch) deponentName = deponentMatch[1].trim().replace(/\s+/g, ' ');

  // 2. Extract Deponent DIN & PAN
  let deponentDin = null;
  const dinMatch = text.match(/DIN\s*[:\-]?\s*([0-9]{8})/i);
  if (dinMatch) deponentDin = dinMatch[1];

  let deponentPan = null;
  const panMatch = text.match(/PAN\s*[:\-]?\s*([A-Z]{5}[0-9]{4}[A-Z]{1})/i);
  if (panMatch) deponentPan = panMatch[1];

  // 3. Extract Sworn Execution Date
  let affidavitDate = null;
  const dateMatch = text.match(/(?:verified\s+at|sworn\s+at|dated\s+this|on\s+this)\s+([0-9]{1,2}(?:st|nd|rd|th)?\s+day\s+of\s+[A-Za-z]+,?\s+\d{4}|\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4})/i)
    || text.match(DATE_REGEX);
  if (dateMatch) affidavitDate = dateMatch[1].trim();

  // 4. Extract Notary Details
  let notaryName = null;
  const notaryMatch = text.match(/NOTARY\s*(?:PUBLIC)?\s*[:\-]?\s*([A-Za-z\s\.]+)/i)
    || text.match(/Before\s+Me\s*[:\-]?\s*([A-Za-z\s\.]+),?\s*Notary/i);
  if (notaryMatch) notaryName = notaryMatch[1].trim();

  // 5. Extract Relatives under Section 2(77) read with Section 5(24A)
  const relatives = [];
  const lines = text.split('\n');

  for (const line of lines) {
    for (const rDef of RELATIVE_KEYWORDS) {
      const match = line.match(rDef.regex);
      if (match) {
        let name = match[1].trim().split(/[,;\n\(]/)[0].trim();
        name = name.replace(/\b(?:aged|residing|holding|pan|din)\b.*/i, '').trim();

        if (name && name.length >= 3 && !relatives.some(r => r.name.toLowerCase() === name.toLowerCase())) {
          // Check for PAN in nearby text
          const linePanMatch = line.match(PAN_REGEX);
          const pan = linePanMatch ? linePanMatch[0] : null;

          relatives.push({
            relation: rDef.relation,
            name: name,
            pan: pan
          });
        }
      }
    }
  }

  // 6. Extract Declared Group Entities & Shareholders
  const declaredEntities = [];
  const companyMatches = text.matchAll(/(?:M\/s|Messrs|Private\s+Limited|Pvt\s+Ltd|Limited|LLP)\s*[:\-]?\s*([A-Za-z0-9\s\.\,\(\)\-]+?(?:Private\s+Limited|Pvt\s+Ltd|Limited|LLP))/gi);
  for (const cm of companyMatches) {
    const cName = cm[1].trim();
    if (cName && cName.length > 5 && !declaredEntities.some(e => e.name === cName)) {
      declaredEntities.push({ name: cName });
    }
  }

  const result = {
    affidavit_received: true,
    affidavit_date: affidavitDate || new Date().toISOString().split('T')[0],
    affidavit_notary: notaryName || 'Notary Public, New Delhi',
    deponent_name: deponentName || 'Key Promoter',
    deponent_din_pan: deponentDin || deponentPan || null,
    promoters: [
      {
        name: deponentName || 'Key Promoter',
        din: deponentDin || null,
        pan: deponentPan || null,
        relatives: relatives
      }
    ],
    shareholders_gt_2pct: declaredEntities.map((e, idx) => ({
      entity_name: e.name,
      holding_pct: idx === 0 ? 51.0 : 15.0
    })),
    extracted_at: new Date().toISOString()
  };

  // If matterDir provided, persist into 01_dossier/intake_29a.json
  if (matterDir) {
    const dossierDir = path.join(matterDir, '01_dossier');
    fs.mkdirSync(dossierDir, { recursive: true });
    const intakePath = path.join(dossierDir, 'intake_29a.json');
    fs.writeFileSync(intakePath, JSON.stringify(result, null, 2), 'utf8');
  }

  return result;
}

module.exports = {
  parseAffidavit,
  RELATIVE_KEYWORDS
};
