/**
 * Skill Module: extractor.js
 * Part of xbrl-intelligence Skill Package
 */

const fs = require('fs');
const path = require('path');

function canonicalizeName(name) {
    if (!name) return '';
    return String(name)
        .toUpperCase()
        .replace(/\b(PRIVATE|PVT|LIMITED|LTD|LLP|CORP|CORPORATION|INC)\b/g, '')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function extractXbrlEntitiesFromXml(xmlContent) {
    const relatedParties = [];
    const disclosedLenders = new Set();
    const caroRemarks = [];

    const rpRegex = /<[^:]*:NameOfRelatedParty[^>]*>([^<]+)<\/[^:]*:NameOfRelatedParty>/gi;
    let match;
    const seenNames = new Set();

    while ((match = rpRegex.exec(xmlContent)) !== null) {
        const rawName = match[1].trim();
        const canonical = canonicalizeName(rawName);
        if (rawName && !seenNames.has(canonical) && canonical.length > 2) {
            seenNames.add(canonical);
            
            const surrounding = xmlContent.substring(Math.max(0, match.index - 500), Math.min(xmlContent.length, match.index + 1000));
            const relMatch = surrounding.match(/<[^:]*:(?:NatureOfRelationship|DescriptionOfRelationshipWithRelatedParty)[^>]*>([^<]+)<\//i);
            const amtMatch = surrounding.match(/<[^:]*:(?:AmountOfTransactionWithRelatedParty|OutstandingBalance[^>]*)>[^\d]*([\d.,]+)<\//i);

            relatedParties.push({
                name: rawName,
                canonicalName: canonical,
                relationship: relMatch ? relMatch[1].trim() : 'Related Party / KMP / Affiliate',
                amount: amtMatch ? parseFloat(amtMatch[1].replace(/,/g, '')) : null
            });
        }
    }

    const bankRegex = /<[^:]*:(?:NameOfBankOrFinancialInstitution|NameOfBank|LenderName)[^>]*>([^<]+)<\/[^:]*:(?:NameOfBankOrFinancialInstitution|NameOfBank|LenderName)>/gi;
    while ((match = bankRegex.exec(xmlContent)) !== null) {
        const bank = match[1].trim();
        if (bank && bank.length > 2) {
            disclosedLenders.add(bank);
        }
    }

    const knownBanks = [
        'State Bank of India', 'SBI', 'HDFC Bank', 'ICICI Bank', 'Punjab National Bank', 'PNB',
        'Bank of Baroda', 'BOB', 'Canara Bank', 'Axis Bank', 'Kotak Mahindra Bank',
        'Union Bank of India', 'IndusInd Bank', 'Yes Bank', 'IDBI Bank', 'Central Bank of India'
    ];
    for (const kb of knownBanks) {
        const kbRegex = new RegExp(`\\b${kb}\\b`, 'i');
        if (kbRegex.test(xmlContent)) {
            disclosedLenders.add(kb);
        }
    }

    const defaultMatch = xmlContent.match(/<[^:]*:(?:HasCompanyDefaultedInRepaymentOfLoansOrBorrowings|CompanyDefaultedInRepayment)[^>]*>([^<]+)<\//i);
    if (defaultMatch) {
        caroRemarks.push({
            clause: 'CARO Clause 3(ix) — Loan Defaults',
            remark: defaultMatch[1].trim(),
            defaultReported: /true|yes/i.test(defaultMatch[1])
        });
    }

    const fraudMatch = xmlContent.match(/<[^:]*:(?:DetailsOfFraudByCompanyOrItsEmployeesReported|FraudByCompanyOrItsEmployees)[^>]*>([^<]+)<\//i);
    if (fraudMatch) {
        caroRemarks.push({
            clause: 'CARO Clause 3(xi) — Fraud Inquest',
            remark: fraudMatch[1].trim(),
            defaultReported: !/nil|no|none/i.test(fraudMatch[1])
        });
    }

    return {
        relatedParties,
        disclosedLenders: Array.from(disclosedLenders),
        caroRemarks
    };
}

function ingestXbrlFilings(caseDir) {
    const candidates = [
        path.join(caseDir, 'docs', 'xbrl'),
        path.join(caseDir, 'xbrl'),
        path.join(caseDir, 'docs')
    ];

    let targetDir = null;
    for (const c of candidates) {
        if (fs.existsSync(c)) {
            targetDir = c;
            break;
        }
    }

    if (!targetDir) {
        return {
            relatedParties: [],
            disclosedLenders: [],
            caroRemarks: [],
            fileCount: 0,
            summary: 'No XBRL directory found.'
        };
    }

    const files = fs.readdirSync(targetDir).filter(f => f.toLowerCase().endsWith('.xml'));
    let combinedRelatedParties = [];
    let combinedLenders = new Set();
    let combinedCaro = [];

    for (const file of files) {
        const fullPath = path.join(targetDir, file);
        try {
            const content = fs.readFileSync(fullPath, 'utf8');
            const result = extractXbrlEntitiesFromXml(content);
            combinedRelatedParties.push(...result.relatedParties);
            result.disclosedLenders.forEach(l => combinedLenders.add(l));
            combinedCaro.push(...result.caroRemarks);
        } catch (err) {
            console.warn(`[XbrlExtractor] Error reading ${file}:`, err.message);
        }
    }

    const uniqueParties = [];
    const seen = new Set();
    for (const p of combinedRelatedParties) {
        if (!seen.has(p.canonicalName)) {
            seen.add(p.canonicalName);
            uniqueParties.push(p);
        }
    }

    return {
        relatedParties: uniqueParties,
        disclosedLenders: Array.from(combinedLenders),
        caroRemarks: combinedCaro,
        fileCount: files.length,
        summary: `Extracted ${uniqueParties.length} AS-18 related entities and ${combinedLenders.size} declared lenders from ${files.length} XBRL filing(s).`
    };
}

module.exports = {
    ingestXbrlFilings,
    extractXbrlEntitiesFromXml,
    canonicalizeName
};
