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
 * Provisions the domain-specific folder taxonomy subdirectories inside caseDir.
 */
function bootstrapDomainTaxonomy(caseDir) {
    if (!caseDir) return [];
    const resolved = path.resolve(caseDir);
    const docsRoot = path.resolve(process.env.HOME || '', 'Documents');
    if (resolved === docsRoot) return [];

    const profile = getActiveDomainProfile(caseDir);
    if (!profile) return [];

    // Prune any empty taxonomy subfolders belonging to non-active domains
    const activeFolders = new Set(profile.taxonomy);
    const allTaxonomyFolders = new Set();
    Object.values(DOMAIN_PROFILES).forEach(p => p.taxonomy.forEach(f => allTaxonomyFolders.add(f)));

    for (const folderName of allTaxonomyFolders) {
        if (!activeFolders.has(folderName)) {
            const obsoleteFolderPath = path.join(caseDir, folderName);
            if (fs.existsSync(obsoleteFolderPath)) {
                try {
                    const files = fs.readdirSync(obsoleteFolderPath);
                    if (files.length === 0) {
                        fs.rmdirSync(obsoleteFolderPath);
                        console.log(`[DomainRegistry] Pruned empty obsolete taxonomy folder '${folderName}'`);
                    }
                } catch (_) {}
            }
        }
    }

    const createdFolders = [];
    for (const folderName of profile.taxonomy) {
        const folderPath = path.join(caseDir, folderName);
        if (!fs.existsSync(folderPath)) {
            try {
                fs.mkdirSync(folderPath, { recursive: true });
                createdFolders.push(folderName);
            } catch (e) {
                console.error(`[DomainRegistry] Failed to create folder ${folderName}:`, e.message);
            }
        }
    }
    if (createdFolders.length > 0) {
        console.log(`[DomainRegistry] Bootstrapped ${createdFolders.length} taxonomy folders for domain '${profile.id}' in ${caseDir}`);
    }
    return profile.taxonomy;
}

module.exports = {
    DOMAIN_PROFILES,
    getActiveDomainProfile,
    bootstrapDomainTaxonomy
};
