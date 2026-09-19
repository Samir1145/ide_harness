'use strict';

/**
 * Hayagriva Domain Profile Registry
 * ---------------------------------
 * Manages domain profiles for:
 * 1. Insolvency ('insolvency') - IP & IPEs (10 iPIE Folders)
 * 2. Legal ('legal')           - Advocates & Law Firms (5 Legal Folders)
 * 3. Finance ('finance')       - CAs & Auditors (5 Finance Folders)
 */

const fs = require('fs');
const path = require('path');
const { getConversionsDir } = require('../pipeline/common/helper');

const DOMAIN_PROFILES = {
    insolvency: {
        id: 'insolvency',
        name: 'Haya Insolvency (IP & IPE Edition)',
        userRole: 'Insolvency Professional / IPE',
        taxonomy: [
            '00_inbox',
            '01_commencement',
            '02_claims',
            '03_stakeholders',
            '04_records',
            '05_plans',
            '06_implementation',
            '07_compliance',
            '08_litigation',
            '09_costs'
        ],
        mountedVaultPacks: ['legal_agents.vlt', 'vault-laws', 'vault-cases', 'vault-ibc-precedents'],
        embeddingModel: 'InLegal-SBERT',
        activeLlmEngine: 'legalparam-2.9b.gguf',
        managers: [
            '@process_mgr',
            '@claims_mgr',
            '@stakeholder_mgr',
            '@records_mgr',
            '@plan_mgr',
            '@implementation_mgr',
            '@compliance_mgr',
            '@litigation_mgr',
            '@cost_mgr',
            '@dashboard_mgr'
        ]
    },
    legal: {
        id: 'legal',
        name: 'Haya Legal (Advocate & Law Firm Edition)',
        userRole: 'Advocate / Law Firm',
        taxonomy: [
            '00_inbox',
            '01_petitioner_plaintiff',
            '02_respondent_defendant',
            '03_evidence_exhibits',
            '04_orders_judgments',
            '05_statutes_precedents'
        ],
        mountedVaultPacks: ['legal_agents.vlt', 'vault-laws', 'vault-cases', 'vault-judgments-supreme-court', 'vault-bare-acts'],
        embeddingModel: 'InLegal-SBERT',
        activeLlmEngine: 'legalparam-2.9b.gguf',
        managers: [
            '@docket_mgr',
            '@pleading_mgr',
            '@brief_mgr',
            '@citation_mgr',
            '@appeal_mgr',
            '@dashboard_mgr'
        ]
    },
    finance: {
        id: 'finance',
        name: 'Haya Finance (CA & Forensic Auditor Edition)',
        userRole: 'Chartered Accountant / Forensic Auditor',
        taxonomy: [
            '00_inbox',
            '01_financial_statements',
            '02_tax_returns',
            '03_audit_ledgers',
            '04_vouchers_invoices',
            '05_bank_statements'
        ],
        mountedVaultPacks: ['finance_agents.vlt', 'vault-taxation', 'vault-corporate-compliance', 'vault-atticus-dealpoints'],
        embeddingModel: 'Finance-Embeddings',
        activeLlmEngine: 'financeparam-2.9b.gguf',
        managers: [
            '@audit_mgr',
            '@tax_mgr',
            '@reconciliation_mgr',
            '@ledger_mgr',
            '@gst_mgr',
            '@dashboard_mgr'
        ]
    }
};

/**
 * Resolves the active domain profile for a given workspace.
 */
function getActiveDomainProfile(caseDir) {
    let domainId = null;
    try {
        if (caseDir) {
            const manifestPath = path.join(getConversionsDir(caseDir), 'case_manifest.json');
            if (fs.existsSync(manifestPath)) {
                const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                if (manifest.domain && manifest.domain.toLowerCase() !== 'unconfigured' && DOMAIN_PROFILES[manifest.domain.toLowerCase()]) {
                    domainId = manifest.domain.toLowerCase();
                }
            }
            if (!domainId) {
                const settingsPath = path.join(caseDir, 'hayagriva_settings.json');
                if (fs.existsSync(settingsPath)) {
                    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
                    if (settings.activeDomain && settings.activeDomain.toLowerCase() !== 'unconfigured' && DOMAIN_PROFILES[settings.activeDomain.toLowerCase()]) {
                        domainId = settings.activeDomain.toLowerCase();
                    }
                }
            }
        }
    } catch (_) {}
    if (!domainId) return null;
    return DOMAIN_PROFILES[domainId] || null;
}

/**
 * Provisions essential workspace folders (drafts/ and exports/) in a Clean Flat Workspace (Option A).
 * Intrusive 6-10 numbered folders are no longer forced onto the user's hard drive.
 */
function bootstrapDomainTaxonomy(caseDir) {
    if (!caseDir) return [];
    const resolved = path.resolve(caseDir);
    const docsRoot = path.resolve(process.env.HOME || '', 'Documents');
    if (resolved === docsRoot) return [];

    const profile = getActiveDomainProfile(caseDir);
    if (!profile) return [];

    // Clean Workspace: Ensure essential AI output directories exist
    const essentialDirs = ['drafts', 'exports'];
    const createdFolders = [];
    for (const dirName of essentialDirs) {
        const p = path.join(caseDir, dirName);
        if (!fs.existsSync(p)) {
            try {
                fs.mkdirSync(p, { recursive: true });
                createdFolders.push(dirName);
            } catch (_) {}
        }
    }

    // Cleanly prune any legacy empty numbered taxonomy subfolders from earlier versions
    const allLegacyTaxonomyFolders = new Set();
    Object.values(DOMAIN_PROFILES).forEach(p => (p.taxonomy || []).forEach(f => allLegacyTaxonomyFolders.add(f)));

    for (const folderName of allLegacyTaxonomyFolders) {
        const legacyPath = path.join(caseDir, folderName);
        if (fs.existsSync(legacyPath)) {
            try {
                const files = fs.readdirSync(legacyPath);
                if (files.length === 0) {
                    fs.rmdirSync(legacyPath);
                    console.log(`[DomainRegistry] Pruned legacy empty taxonomy folder '${folderName}' for clean workspace`);
                }
            } catch (_) {}
        }
    }

    if (createdFolders.length > 0) {
        console.log(`[DomainRegistry] Clean workspace initialized with essential dirs [${createdFolders.join(', ')}] in ${caseDir}`);
    }
    return essentialDirs;
}

module.exports = {
    DOMAIN_PROFILES,
    getActiveDomainProfile,
    bootstrapDomainTaxonomy
};
