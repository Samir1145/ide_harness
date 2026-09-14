/**
 * PDF Document Forensics and Anti-Tampering Integrity Inspector.
 * 
 * Inspects raw PDF byte streams, trailer dictionaries, metadata timestamps,
 * and font sets to detect document modifications, Photoshop/Canva tampering,
 * suspicious consumer editing tools, and incremental revision trailer stacks.
 * 
 * Zero external binary/npm dependencies (pure native Node.js buffer processing).
 */

const fs = require('fs');
const path = require('path');

const ForensicVerdict = {
    GENUINE: "GENUINE",
    LOW_RISK: "LOW_RISK",
    SUSPICIOUS: "SUSPICIOUS",
    HIGH_RISK_TAMPERED: "HIGH_RISK_TAMPERED"
};

// Tools known for manual image/document manipulation (not standard banking core engines)
const SUSPICIOUS_SOFTWARE_KEYWORDS = [
    "photoshop",
    "canva",
    "gimp",
    "ilovepdf",
    "sejda",
    "pdfescape",
    "smallpdf",
    "sodapdf",
    "inkscape",
    "illustrator",
    "coreldraw",
    "acrobat pro patch",
    "pdf editor",
    "foxit phantom",
    "master pdf",
    "nitro pdf",
    "pdf-xchange",
    "wondershare",
    "docupub"
];

// Standard banking core / treasury report engines
const BENIGN_PRODUCERS = [
    "sap",
    "oracle",
    "citi",
    "jpmorgan",
    "fiserv",
    "temenos",
    "finacle",
    "fisp",
    "openbill",
    "jasperreports",
    "apache fop",
    "itext",
    "reportlab",
    "cairo",
    "pdfkit",
    "wkhtmltopdf",
    "weasyprint",
    "quartz"
];

/**
 * Extract metadata, revisions, and font signatures from raw PDF bytes.
 * @param {Buffer} pdfBuffer 
 * @returns {object}
 */
function extractPdfMetadata(pdfBuffer) {
    const meta = {
        producer: null,
        creator: null,
        creationDate: null,
        modDate: null,
        revisions: 0,
        fonts: new Set(),
        hasImages: false
    };

    if (!Buffer.isBuffer(pdfBuffer)) {
        return meta;
    }

    const latinText = pdfBuffer.toString('latin1');

    // 1. Revisions count: count %%EOF markers
    const eofMatches = latinText.match(/%%EOF/g);
    meta.revisions = eofMatches ? eofMatches.length : 1;

    // 2. Images check
    meta.hasImages = latinText.includes('/Image') || latinText.includes('/XObject');

    // 3. Extract Producer
    const prodMatch = latinText.match(/\/Producer\s*(?:\(([^)]+)\)|<([0-9a-fA-F]+)>)/i);
    if (prodMatch) {
        meta.producer = (prodMatch[1] || prodMatch[2] || '').trim();
    }

    // 4. Extract Creator
    const creatMatch = latinText.match(/\/Creator\s*(?:\(([^)]+)\)|<([0-9a-fA-F]+)>)/i);
    if (creatMatch) {
        meta.creator = (creatMatch[1] || creatMatch[2] || '').trim();
    }

    // 5. Extract CreationDate
    const cdateMatch = latinText.match(/\/CreationDate\s*(?:\(([^)]+)\)|<([0-9a-fA-F]+)>)/i);
    if (cdateMatch) {
        meta.creationDate = (cdateMatch[1] || cdateMatch[2] || '').trim();
    }

    // 6. Extract ModDate
    const mdateMatch = latinText.match(/\/ModDate\s*(?:\(([^)]+)\)|<([0-9a-fA-F]+)>)/i);
    if (mdateMatch) {
        meta.modDate = (mdateMatch[1] || mdateMatch[2] || '').trim();
    }

    // 7. Extract Font signatures (/BaseFont /FontName)
    const fontRegex = /\/BaseFont\s*\/([A-Za-z0-9\+\-_]+)/g;
    let fMatch;
    while ((fMatch = fontRegex.exec(latinText)) !== null) {
        meta.fonts.add(fMatch[1]);
    }

    return meta;
}

/**
 * Inspect a PDF bank statement for signs of tampering, alteration, or forgery.
 * 
 * @param {string|Buffer} pdfInput - Absolute file path or raw Buffer
 * @param {string} [optionalFilename] - Display filename if buffer is provided
 * @returns {object} Structured ForensicsReport
 */
function inspectPdfForensics(pdfInput, optionalFilename) {
    let pdfBuffer;
    let filename = optionalFilename || 'unknown.pdf';

    if (typeof pdfInput === 'string') {
        filename = path.basename(pdfInput);
        if (!fs.existsSync(pdfInput)) {
            return {
                filename: filename,
                verdict: ForensicVerdict.HIGH_RISK_TAMPERED,
                riskScore: 1.00,
                isTampered: true,
                creationDate: null,
                modificationDate: null,
                producer: null,
                creator: null,
                revisionCount: 0,
                fontsCount: 0,
                findings: [{
                    category: "FILE_IO",
                    severity: "CRITICAL",
                    description: `PDF statement file not found: ${pdfInput}`
                }]
            };
        }
        pdfBuffer = fs.readFileSync(pdfInput);
    } else if (Buffer.isBuffer(pdfInput)) {
        pdfBuffer = pdfInput;
    } else {
        throw new Error("Invalid PDF input: expected file path or Buffer");
    }

    const meta = extractPdfMetadata(pdfBuffer);
    const findings = [];
    let riskPoints = 0.0;

    const producer = meta.producer || "";
    const creator = meta.creator || "";
    const cdate = meta.creationDate || "";
    const mdate = meta.modDate || "";
    const revisions = meta.revisions || 1;
    const fonts = meta.fonts || new Set();

    // 1. Check for suspicious consumer editing / manipulation software
    const combinedSoftware = `${producer} ${creator}`.toLowerCase();
    for (const sw of SUSPICIOUS_SOFTWARE_KEYWORDS) {
        if (combinedSoftware.includes(sw)) {
            riskPoints += 0.50;
            findings.push({
                category: "SOFTWARE_PROVENANCE",
                severity: "HIGH",
                description: `Statement was produced or modified using consumer graphic editing software '${sw}'.`,
                evidence: `Producer: '${producer}', Creator: '${creator}'`
            });
            break;
        }
    }

    // 2. Check for incremental revision updates (indicates layered modification or inserted overlays)
    if (revisions > 2) {
        riskPoints += 0.35;
        findings.push({
            category: "REVISION_TREE",
            severity: "HIGH",
            description: `PDF contains ${revisions} incremental revision trailers (%%EOF markers), indicating post-generation alteration.`,
            evidence: `Found ${revisions} EOF trailers`
        });
    } else if (revisions === 2) {
        riskPoints += 0.15;
        findings.push({
            category: "REVISION_TREE",
            severity: "LOW",
            description: `PDF contains 2 incremental revision trailers (minor update or linearization).`,
            evidence: `Found 2 EOF trailers`
        });
    }

    // 3. Check for metadata timestamp drift
    if (cdate && mdate && cdate !== mdate) {
        riskPoints += 0.15;
        findings.push({
            category: "METADATA_DRIFT",
            severity: "LOW",
            description: "PDF modification timestamp differs from original creation timestamp.",
            evidence: `Creation: '${cdate}', Modified: '${mdate}'`
        });
    }

    // 4. Check for fragmented font typography (typical bank statements use 1-6 fonts)
    if (fonts.size > 12) {
        riskPoints += 0.20;
        findings.push({
            category: "TYPOGRAPHY_ANOMALY",
            severity: "MEDIUM",
            description: `PDF contains an unusually high number of distinct embedded font subsets (${fonts.size} fonts), suggesting spliced text.`,
            evidence: `Fonts: ${Array.from(fonts).slice(0, 6).join(', ')}...`
        });
    }

    // Calculate final risk score and standardized verdict
    const finalRisk = Math.min(1.00, Math.round(riskPoints * 100) / 100);
    let verdict;
    let isTampered = false;

    if (finalRisk >= 0.50) {
        verdict = ForensicVerdict.HIGH_RISK_TAMPERED;
        isTampered = true;
    } else if (finalRisk >= 0.30) {
        verdict = ForensicVerdict.SUSPICIOUS;
        isTampered = false;
    } else if (finalRisk > 0.00) {
        verdict = ForensicVerdict.LOW_RISK;
        isTampered = false;
    } else {
        verdict = ForensicVerdict.GENUINE;
        isTampered = false;
    }

    return {
        filename: filename,
        verdict: verdict,
        riskScore: finalRisk,
        isTampered: isTampered,
        creationDate: cdate || null,
        modificationDate: mdate || null,
        producer: producer || null,
        creator: creator || null,
        revisionCount: revisions,
        fontsCount: fonts.size,
        findings: findings
    };
}

module.exports = {
    ForensicVerdict,
    inspectPdfForensics,
    extractPdfMetadata
};
