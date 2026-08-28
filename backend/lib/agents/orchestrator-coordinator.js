'use strict';

/**
 * Hayagriva Level 1 Orchestrator Coordinator (Domain Managers)
 * -------------------------------------------------------------
 * Manages background state and 5-stage pipelines (Fetch -> Delegate -> Visualize -> Resolve -> Push)
 * for Domain Managers across Insolvency, Legal, and Finance verticals.
 */

const fs = require('fs');
const path = require('path');
const agentLogger = require('./agent-logger');

class DomainManagerOrchestrator {
    constructor(managerTag, domainId, options = {}) {
        this.tag = (managerTag || '').toLowerCase().trim();
        this.domainId = domainId || 'insolvency';
        this.alignedModule = options.alignedModule || 'General';
        this.description = options.description || `Domain Manager for ${this.tag}`;
    }

    /**
     * Executes the 5-stage pipeline for this domain manager.
     */
    async runPipeline(caseDir, userMessage, options = {}) {
        const reqId = options.requestId || `req_${Date.now()}`;
        agentLogger.log(reqId, this.tag, 'STAGE_1_FETCH', `Fetching raw domain state for ${this.tag}...`);
        
        // Phase 1: Fetch
        const fetchSummary = await this.stageFetch(caseDir, userMessage);
        agentLogger.log(reqId, this.tag, 'STAGE_2_DELEGATE', `Delegating cognitive work to specialists...`);

        // Phase 2: Delegate
        const delegationReport = await this.stageDelegate(caseDir, fetchSummary, userMessage);
        agentLogger.log(reqId, this.tag, 'STAGE_3_VISUALIZE', `Updating IDE state and presentation panes...`);

        // Phase 3: Visualize
        const uiState = await this.stageVisualize(caseDir, delegationReport);

        return {
            manager: this.tag,
            domain: this.domainId,
            pipelineState: 'VISUALIZED_READY_FOR_RESOLVE',
            summary: delegationReport.summary,
            details: uiState
        };
    }

    async stageFetch(caseDir, message) {
        return { caseDir, message, timestamp: new Date().toISOString() };
    }

    async stageDelegate(caseDir, fetchSummary, message) {
        return {
            summary: `[${this.tag}] Processed request for case directory. State verified.`,
            fetchSummary
        };
    }

    async stageVisualize(caseDir, delegationReport) {
        return {
            leftPane: `Updated ${this.alignedModule} dashboard.`,
            rightPane: delegationReport.summary,
            middlePane: 'Ready for human-in-the-loop review in Monaco Editor.'
        };
    }
}

class OrchestratorRegistry {
    constructor() {
        this.managers = {};
        this.registerDefaultManagers();
    }

    registerDefaultManagers() {
        // Root Domain Managers
        const rootDomains = [
            { tag: 'insolvency', module: 'Insolvency & CIRP Management' },
            { tag: 'legal', module: 'Legal & Court Practice Management' },
            { tag: 'finance', module: 'Financial & Accounting Management' }
        ];
        for (const r of rootDomains) {
            const instance = new DomainManagerOrchestrator(`@${r.tag}`, r.tag, { alignedModule: r.module });
            this.managers[r.tag] = instance;
            this.managers[`@${r.tag}`] = instance;
        }

        const insolvencyManagers = [
            { tag: 'process_mgr', module: 'Process Commencement' },
            { tag: 'claims_mgr', module: 'Claims Management' },
            { tag: 'stakeholder_mgr', module: 'Stakeholder Management' },
            { tag: 'records_mgr', module: 'Records Management' },
            { tag: 'plan_mgr', module: 'Resolution / Repayment Plan' },
            { tag: 'implementation_mgr', module: 'Resolution / Liquidation Implementation' },
            { tag: 'compliance_mgr', module: 'Compliance Management' },
            { tag: 'litigation_mgr', module: 'Litigation Management' },
            { tag: 'cost_mgr', module: 'Finance / Cost Management' },
            { tag: 'dashboard_mgr', module: 'MIS & Reporting' }
        ];

        for (const m of insolvencyManagers) {
            const instance = new DomainManagerOrchestrator(`@${m.tag}`, 'insolvency', { alignedModule: m.module });
            this.managers[m.tag] = instance;
            this.managers[`@${m.tag}`] = instance;
        }

        // Add Legal & Finance Managers
        const legalManagers = [
            { tag: 'docket_mgr', module: 'Court Docket Management' },
            { tag: 'pleading_mgr', module: 'Pleadings & Petitions' },
            { tag: 'brief_mgr', module: 'Client Briefing' },
            { tag: 'citation_mgr', module: 'Citation & Precedents' },
            { tag: 'appeal_mgr', module: 'Appeals & SLP' }
        ];
        for (const m of legalManagers) {
            const instance = new DomainManagerOrchestrator(`@${m.tag}`, 'legal', { alignedModule: m.module });
            this.managers[m.tag] = instance;
            this.managers[`@${m.tag}`] = instance;
        }

        const financeManagers = [
            { tag: 'audit_mgr', module: 'Audit & Forensic Accounting' },
            { tag: 'tax_mgr', module: 'Tax Returns & GST Compliance' },
            { tag: 'reconciliation_mgr', module: 'Bank & Ledger Reconciliation' },
            { tag: 'ledger_mgr', module: 'General Ledger Audit' },
            { tag: 'gst_mgr', module: 'GST Portal Sync' }
        ];
        for (const m of financeManagers) {
            const instance = new DomainManagerOrchestrator(`@${m.tag}`, 'finance', { alignedModule: m.module });
            this.managers[m.tag] = instance;
            this.managers[`@${m.tag}`] = instance;
        }
    }

    getManager(tag) {
        if (!tag) return null;
        const norm = String(tag).toLowerCase().trim().replace(/^@/, '');
        return this.managers[norm] || null;
    }
}

const orchestratorRegistry = new OrchestratorRegistry();

module.exports = {
    DomainManagerOrchestrator,
    orchestratorRegistry
};
