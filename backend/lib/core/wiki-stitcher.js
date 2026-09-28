'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { parseTidCard } = require('../pipeline/wiki/split');
const { getWikiDir } = require('../pipeline/common/helper');
const { exportMarkdownToDocxFile } = require('./docx-exporter');

/**
 * Returns path to bundled or system pandoc binary.
 */
function getPandocBinary() {
    const binDir = path.join(__dirname, '../../bin');
    const isArm64 = process.arch === 'arm64';
    const bundledArm = path.join(binDir, 'pandoc-arm64');
    const bundledX64 = path.join(binDir, 'pandoc-x64');

    if (isArm64 && fs.existsSync(bundledArm)) {
        try {
            fs.chmodSync(bundledArm, 0o755);
            return bundledArm;
        } catch (_) {}
    }
    if (fs.existsSync(bundledX64)) {
        try {
            fs.chmodSync(bundledX64, 0o755);
            return bundledX64;
        } catch (_) {}
    }

    // Fall back to system pandoc if available
    try {
        cp.execSync('pandoc --version', { stdio: 'ignore' });
        return 'pandoc';
    } catch (_) {}

    return null;
}

/**
 * Reads ordered .tid cards, unrolls transclusions, normalizes sequential numbering (1. to N.),
 * and injects Court Header + Statement of Truth (Order VI Rule 15A CPC) + Section 63 BSA certificate.
 *
 * @param {string} caseDir - Matter directory
 * @param {string} docStem - Document filename stem
 * @param {Array<Object>|null} tiddlersOverride - In-memory cards array if provided by API
 * @returns {Object} { stitchedMarkdown, paraCount, cardsCount, cards }
 */
function stitchCaseWikiCards(caseDir, docStem, tiddlersOverride = null) {
    let cards = [];

    if (Array.isArray(tiddlersOverride) && tiddlersOverride.length > 0) {
        cards = [...tiddlersOverride];
    } else {
        // Read .tid cards from disk
        const wikiDir = getWikiDir(caseDir);
        let cardsDir = path.join(wikiDir, docStem);
        if (!fs.existsSync(cardsDir) && fs.existsSync(wikiDir)) {
            const alt1 = path.join(wikiDir, docStem.replace(/_/g, ' '));
            const alt2 = path.join(wikiDir, docStem.replace(/ /g, '_'));
            if (fs.existsSync(alt1)) {
                cardsDir = alt1;
            } else if (fs.existsSync(alt2)) {
                cardsDir = alt2;
            } else {
                const normDoc = docStem.toLowerCase().replace(/[^a-z0-9]/g, '');
                const subdirs = fs.readdirSync(wikiDir).filter(f => {
                    try { return fs.statSync(path.join(wikiDir, f)).isDirectory(); } catch (_) { return false; }
                });
                const match = subdirs.find(d => d.toLowerCase().replace(/[^a-z0-9]/g, '') === normDoc);
                if (match) cardsDir = path.join(wikiDir, match);
            }
        }

        if (fs.existsSync(cardsDir)) {
            const files = fs.readdirSync(cardsDir).filter(f => f.endsWith('.tid'));
            files.forEach(f => {
                try {
                    const raw = fs.readFileSync(path.join(cardsDir, f), 'utf8');
                    const parsed = parseTidCard(raw);
                    cards.push(parsed);
                } catch (_) {}
            });
        }
    }

    // Filter out system cards and metadata overviews
    const substantiveCards = cards.filter(c => {
        if (!c.title) return false;
        if (c.title.startsWith('$:/')) return false;
        if (c.title.toLowerCase().includes('getting started')) return false;
        if (c.title.toLowerCase().includes('master index') || c.title.toLowerCase() === 'index') return false;
        return true;
    });

    // Sort by order ascending
    substantiveCards.sort((a, b) => (a.order || 0) - (b.order || 0));

    // 1. Build Card Map for Transclusion Unrolling (e.g. {{03_Arrears_Table}})
    const cardMap = new Map();
    cards.forEach(c => {
        cardMap.set(c.title, c.text || '');
        // Also map title without prefix numbers (e.g. "03_Arrears_Table" -> "Arrears_Table")
        const strippedTitle = c.title.replace(/^[0-9]+_/, '');
        cardMap.set(strippedTitle, c.text || '');
    });

    // Unroll transclusions
    substantiveCards.forEach(c => {
        let text = c.text || '';
        text = text.replace(/\{\{([^}]+)\}\}/g, (match, refTitle) => {
            const trimmed = refTitle.trim();
            if (cardMap.has(trimmed)) {
                return cardMap.get(trimmed);
            }
            return match;
        });
        c.text = text;
    });

    // 2. Normalize Sequential Legal Paragraph Renumbering (1. to N.)
    const substantiveParas = [];
    let paraCounter = 1;

    for (const card of substantiveCards) {
        const text = (card.text || '').trim();
        if (!text) continue;

        // Skip standalone table cards that were already transcluded into another card
        const isPureTable = card.tags && card.tags.includes('Table') && !text.match(/^[0-9]+\./);
        const isTranscludedElsewhere = substantiveCards.some(other => other !== card && (other.text || '').includes(text.slice(0, 40)));
        if (isPureTable && isTranscludedElsewhere) {
            continue;
        }

        // Strip leading existing paragraph number (e.g. "12. That..." -> "That...")
        let paraBody = text;
        const matchLeadingNum = text.match(/^[0-9]+\.\s*(.*)/s);
        if (matchLeadingNum) {
            paraBody = matchLeadingNum[1];
        }

        // Format as sequential legal paragraph
        const formattedPara = `${paraCounter}. ${paraBody}`;
        substantiveParas.push(formattedPara);
        paraCounter++;
    }

    const paraCount = substantiveParas.length;

    // 3. Construct Complete Court Pleading Document
    const matterName = path.basename(caseDir);
    const headerBlock = [
        `# IN THE HON'BLE COMMERCIAL COURT / DISTRICT COURT AT CHANDIGARH`,
        `**COMMERCIAL SUIT NO. ________ OF 2026**`,
        ``,
        `**IN THE MATTER OF:**`,
        `**SATISH GROVER & ORS**`,
        `R/o SCO No. 123-124, Sector 17-C, Chandigarh`,
        `...PLAINTIFFS`,
        ``,
        `*VERSUS*`,
        ``,
        `**1. M/S INVENTIVE INFRASTRUCTURE PRIVATE LIMITED**`,
        `Through its Directors, Having Registered Office at Chandigarh`,
        `**2. PREM PAL SINGH**`,
        `**3. RAKESH MOHAN PUSHPAKAR**`,
        `...DEFENDANTS`,
        ``,
        `---`,
        ``,
        `### SUIT FOR RECOVERY OF ARREARS OF RENT UNDER COMMERCIAL COURTS ACT, 2015 ALONG WITH PENDENTE LITE AND FUTURE INTEREST @ 18% PER ANNUM`,
        ``,
        `**MOST RESPECTFULLY SHOWETH:**`,
        ``
    ].join('\n');

    const bodyBlock = substantiveParas.join('\n\n');

    const verificationBlock = [
        ``,
        `---`,
        ``,
        `### VERIFICATION`,
        ``,
        `Verified at Chandigarh on this ____ day of ____________, 2026 that the contents of paragraphs 1 to ${paraCount} of the above plaint are true and correct to my knowledge derived from official lease documents, registered lease deeds, judicial rent assessment orders, and banking ledger statements, and no part of it is false and nothing material has been concealed therefrom.`,
        ``,
        `**PLAINTIFFS**`,
        ``,
        `Through Counsel:`,
        `**ATUL GROVER & ASSOCIATES**`,
        `Advocates & Legal Consultants`,
        `Chamber No. 123, District Courts, Chandigarh`,
        ``,
        `---`,
        ``,
        `### STATEMENT OF TRUTH`,
        `*(Under Order VI Rule 15A of the Code of Civil Procedure, 1908 as amended by the Commercial Courts Act, 2015)*`,
        ``,
        `I, Satish Grover, aged about 58 years, Son of Late Shri R.P. Grover, Resident of Chandigarh, do hereby solemnly affirm and declare as under:`,
        ``,
        `1. I am the Plaintiff No. 1 in the above captioned suit and am fully conversant with the facts and circumstances of the case and duly competent to depose this affidavit.`,
        `2. I say that the statements made in paragraphs 1 to ${paraCount} of the accompanying plaint are true and correct to my knowledge and based on records of the commercial tenancy.`,
        `3. I say that all documents in my power, possession, control or custody pertaining to the tenancy, rent default, judicial assessments, and recovery quantum have been disclosed and true copies thereof annexed with the plaint.`,
        `4. I say that there are no false or misleading statements, concealment of material facts, or collusive pleadings in the present suit.`,
        ``,
        `**DEPONENT**`,
        ``,
        `**VERIFICATION:**`,
        `Verified at Chandigarh on this ____ day of ____________, 2026 that the contents of paragraphs 1 to 4 of the above Statement of Truth are true and correct to my knowledge, and no part of it is false and nothing material has been concealed therefrom.`,
        ``,
        `**DEPONENT**`,
        ``,
        `---`,
        ``,
        `### CERTIFICATE UNDER SECTION 63 OF BHARATIYA SAKSHYA ADHINIYAM, 2023`,
        `*(Corresponding to Section 65B of Indian Evidence Act, 1872)*`,
        ``,
        `I, Satish Grover, the undersigned Deponent, do hereby solemnly certify and declare as under:`,
        ``,
        `1. That the financial arrears tables, rental ledger computation schedules, and bank account transaction extracts incorporated in Paragraphs 9 and 10 of the plaint are electronic records produced by computer systems regularly used to store and process financial information in the ordinary course of business.`,
        `2. That throughout the material periods, the computers and digital accounting systems operated properly, and there were no operational defects or unauthorized access affecting the accuracy and integrity of the electronic records.`,
        `3. That the contents of the printed tables are true and faithful reproductions of the electronic data stored in the aforesaid computing devices.`,
        ``,
        `Dated: ____________`,
        `Place: Chandigarh`,
        ``,
        `**DEPONENT**`
    ].join('\n');

    const stitchedMarkdown = `${headerBlock}\n${bodyBlock}\n${verificationBlock}\n`;

    return {
        stitchedMarkdown,
        paraCount,
        cardsCount: substantiveCards.length,
        cards: substantiveCards
    };
}

/**
 * Stitches case wiki cards into continuous pleading and compiles a court-formatted .docx file.
 *
 * @param {string} caseDir - Matter directory
 * @param {string} docStem - Document filename stem
 * @param {Array<Object>|null} tiddlersOverride - Optional in-memory card array
 * @returns {Promise<Object>} { success, docxPath, mdPath, paraCount, cardsCount }
 */
async function exportCaseWikiToCourtDocx(caseDir, docStem, tiddlersOverride = null) {
    const exportsDir = path.join(caseDir, 'exports');
    fs.mkdirSync(exportsDir, { recursive: true });

    // 1. Stitch cards into normalized legal markdown
    const { stitchedMarkdown, paraCount, cardsCount } = stitchCaseWikiCards(caseDir, docStem, tiddlersOverride);

    const safeStem = docStem.replace(/[^a-zA-Z0-9\s-_]/g, '').trim().replace(/\s+/g, '_');
    const mdPath = path.join(exportsDir, `${safeStem}_Court_Pleading.md`);
    const docxPath = path.join(exportsDir, `${safeStem}_Court_Pleading.docx`);

    fs.writeFileSync(mdPath, stitchedMarkdown, 'utf8');

    // 2. Compile to Microsoft Word (.docx)
    let compiled = false;
    const pandocBin = getPandocBinary();

    if (pandocBin) {
        try {
            console.log(`[Wiki Stitcher] Compiling Court DOCX using Pandoc (${path.basename(pandocBin)})...`);
            cp.execFileSync(pandocBin, [
                '-f', 'gfm',
                '-t', 'docx',
                mdPath,
                '-o', docxPath
            ], { stdio: 'pipe' });

            if (fs.existsSync(docxPath) && fs.statSync(docxPath).size > 0) {
                compiled = true;
                console.log(`[Wiki Stitcher] ✓ Generated Court DOCX via Pandoc at: ${docxPath}`);
            }
        } catch (pandocErr) {
            console.warn(`[Wiki Stitcher] Pandoc compilation warning:`, pandocErr.message);
        }
    }

    // Fallback: Native docx exporter
    if (!compiled) {
        console.log(`[Wiki Stitcher] Compiling Court DOCX via native docx-exporter...`);
        await exportMarkdownToDocxFile(mdPath, docxPath);
        compiled = fs.existsSync(docxPath);
    }

    return {
        success: compiled,
        docxPath,
        mdPath,
        paraCount,
        cardsCount
    };
}

module.exports = {
    getPandocBinary,
    stitchCaseWikiCards,
    exportCaseWikiToCourtDocx
};
