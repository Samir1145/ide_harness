// backend/lib/core/suites-catalog.js
'use strict';

const fs = require('fs');
const path = require('path');
const { getLicenseStatus } = require('./license-manager');

/**
 * Resolves the agent packs directory dynamically.
 */
function getPacksDirectory() {
    if (process.env.HAYAGRIVA_AGENTS_PATH && fs.existsSync(process.env.HAYAGRIVA_AGENTS_PATH)) {
        return process.env.HAYAGRIVA_AGENTS_PATH;
    }
    const home = process.env.HOME || process.env.USERPROFILE || '.';
    const candidates = [
        path.join(home, 'Desktop', 'HAYAGRIVA', 'agents', 'packs'),
        path.join(__dirname, '..', '..', '..', '..', 'agents', 'packs'),
        path.join(home, 'Desktop', 'ide_agents', 'packs'),
        path.join(__dirname, '..', '..', '..', 'ide_agents', 'packs')
    ];
    for (const cand of candidates) {
        if (fs.existsSync(cand)) {
            return cand;
        }
    }
    return path.join(home, 'Desktop', 'HAYAGRIVA', 'agents', 'packs');
}

/**
 * Pricing and statutory workflow metadata definitions for the 6 suites.
 */
const SUITE_METADATA = {
    'suite_cirp': {
        priceMonthly: 2999,
        domainTag: 'legal',
        badge: 'Core Resolution Process',
        targetAudience: 'Insolvency Professionals & Resolution Teams',
        statutoryActs: ['IBC Part II (Insolvency Resolution)', 'IBBI (CIRP) Regulations, 2016'],
        coreWorkflows: [
            'Public Announcement (Form A)',
            'Creditor Claims Audit & Verification (Forms B, C, CA, D, F)',
            'Information Memorandum (IM) Drafting',
            'CoC Meeting Notices, Agenda & Voting Shares',
            'Avoidance Inquest (§§ 43, 45, 50, 66)',
            'Section 30(2) Resolution Plan Audit & Form H Compliance'
        ]
    },
    'suite_finance': {
        priceMonthly: 2999,
        domainTag: 'finance',
        badge: 'Forensic Audit & Accounting',
        targetAudience: 'Chartered Accountants, Forensic Auditors & Financial Analysts',
        statutoryActs: ['IBC Avoidance (§§ 43, 45, 50, 66)', 'Companies Act Sec 134/143', 'RBI Master Directions on Frauds'],
        coreWorkflows: [
            'Multi-Bank Statement Ledger Ingestion (.xlsx, .csv)',
            'Contra-Sweep & Round-Trip Transaction Identification',
            'Sister Concern & Related Party (§ 5(24)) Cash Siphoning Scans',
            'MCA-21 AOC-4 XBRL Balance Sheet Disclosure Extraction',
            'Court-Admissible Avoidance Petition Schedules'
        ]
    },
    'suite_liquidation': {
        priceMonthly: 2499,
        domainTag: 'legal',
        badge: 'Asset Realization & Liquidation',
        targetAudience: 'Liquidators, Auctioneers & Secured Lenders',
        statutoryActs: ['IBC Chapter III (Liquidation Process)', 'IBBI (Liquidation Process) Regulations, 2016'],
        coreWorkflows: [
            'Liquidation Order Applications (Sec 33)',
            'Stakeholders Consultation Committee (SCC) Convening',
            'Liquidation Claims Settlement (Forms A through J)',
            'Asset Sale Memorandum & E-Auction Reserve Pricing',
            'Section 53 Statutory Priority Waterfall Distribution',
            'Corporate Dissolution Petitions (Sec 54)'
        ]
    },
    'suite_msme': {
        priceMonthly: 1999,
        domainTag: 'legal',
        badge: 'Pre-Pack & Voluntary Winding Up',
        targetAudience: 'MSME Directors, Corporate Advisors & Winding-Up Liquidators',
        statutoryActs: ['IBC Chapter III-A (PPIRP)', 'IBC Section 59 (Voluntary Liquidation)', 'MSMED Act, 2006'],
        coreWorkflows: [
            'Pre-Packaged Insolvency (PPIRP) Eligibility & Sec 54A Audits',
            'Base Resolution Plan Swiss Challenge Management',
            'PPIRP Statutory Skeletons (Forms P1 through P14)',
            'Declaration of Solvency (Section 59)',
            'Voluntary Liquidation Claims & Reporting (Forms A through H)'
        ]
    },
    'suite_guarantor': {
        priceMonthly: 1999,
        domainTag: 'legal',
        badge: 'Individual Insolvency & Guarantees',
        targetAudience: 'Insolvency Professionals, Bank Recovery Officers & Litigators',
        statutoryActs: ['IBC Part III (Insolvency for Individuals & Guarantors)', 'Indian Contract Act §§ 126-147'],
        coreWorkflows: [
            'Personal Guarantor Demand Notices & Section 94/95 Petitions',
            'Section 96 Interim Moratorium Monitoring',
            'Section 99 Resolution Professional Reports',
            'Repayment Plan Formulation & Creditors Meeting',
            'Bankruptcy Trustee Petitions & Discharge Orders'
        ]
    },
    'suite_litigation': {
        priceMonthly: 2499,
        domainTag: 'legal',
        badge: 'Appellate & Constitutional Court',
        targetAudience: 'Advocates, Counsel & Supreme Court Practitioners',
        statutoryActs: ['IBC Section 61 (Appeals)', 'NCLAT Rules, 2016', 'Supreme Court Rules, 2013 (Order XXI)'],
        coreWorkflows: [
            'NCLT Section 60(5) Residuary Applications',
            'NCLAT Section 61 Statutory Appeal Drafting (Form NCLAT-1)',
            'Supreme Court Special Leave Petition (SLP) Compilation',
            'Limitation Exclusions & Condonation of Delay (§ 5 Limitation Act)',
            'Deterministic Supreme Court Rule Compliant DOCX Compiler'
        ]
    }
};

/**
 * Scans and returns all 6 suites with their full metadata, form counts, and licensing status.
 */
function getSuitesCatalog() {
    const packsDir = getPacksDirectory();
    const license = getLicenseStatus();
    const isProOrEnt = (license.tier === 'professional' || license.tier === 'enterprise') && license.status === 'ACTIVE';

    // Read active pack entitlements if stored in license state or settings
    let allowedPacks = [];
    try {
        const home = process.env.HOME || process.env.USERPROFILE || '.';
        const settingsPath = path.join(home, '.hayagriva', 'active_license_entitlements.json');
        if (fs.existsSync(settingsPath)) {
            const data = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            allowedPacks = data.allowed_packs || [];
        }
    } catch (e) {}

    const suites = [];
    const suiteDirs = [
        'suite_cirp.vlt',
        'suite_finance.vlt',
        'suite_liquidation.vlt',
        'suite_msme.vlt',
        'suite_guarantor.vlt',
        'suite_litigation.vlt'
    ];

    for (const dirName of suiteDirs) {
        const suitePath = path.join(packsDir, dirName);
        const manifestPath = path.join(suitePath, 'manifest.json');

        if (!fs.existsSync(manifestPath)) continue;

        try {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            const packId = manifest.packId || dirName.replace('.vlt', '');
            const meta = SUITE_METADATA[packId] || {};

            // Count forms
            let formsCount = 0;
            const formsList = [];
            const formsDir = path.join(suitePath, 'forms');
            if (fs.existsSync(formsDir)) {
                const files = fs.readdirSync(formsDir).filter(f => f.endsWith('.md'));
                formsCount = files.length;
                for (const f of files) {
                    formsList.push({
                        fileName: f,
                        displayName: f.replace('.md', '').replace(/-/g, ' ').toUpperCase()
                    });
                }
            }

            // Subagents
            const agentsList = (manifest.agents || []).map(a => ({
                id: a.id,
                name: a.name,
                tag: a.tag || a.id,
                description: a.description || ''
            }));

            // Determine status
            let status = 'demo'; // Free tier demo by default
            if (isProOrEnt) {
                if (allowedPacks.length === 0 || allowedPacks.includes(packId)) {
                    status = 'active';
                } else {
                    status = 'locked';
                }
            }

            suites.push({
                packId,
                folderName: dirName,
                name: manifest.name,
                domain: manifest.domain,
                version: manifest.version || '1.0.0',
                description: manifest.description,
                badge: meta.badge || 'Domain Suite',
                priceMonthly: meta.priceMonthly || 2499,
                targetAudience: meta.targetAudience || 'Legal & Financial Professionals',
                statutoryActs: meta.statutoryActs || [],
                coreWorkflows: meta.coreWorkflows || [],
                agentsCount: agentsList.length,
                agents: agentsList,
                formsCount,
                forms: formsList,
                status // 'active' | 'demo' | 'locked'
            });
        } catch (err) {
            console.error(`[SuitesCatalog] Failed to parse manifest in ${dirName}:`, err.message);
        }
    }

    return {
        packsDirectory: packsDir,
        licenseTier: license.tier,
        licenseStatus: license.status,
        suites
    };
}

module.exports = {
    getSuitesCatalog,
    getPacksDirectory,
    SUITE_METADATA
};
