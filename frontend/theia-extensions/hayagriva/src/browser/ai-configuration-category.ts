/*********************************************************************************
 * Hayagriva – AiConfigurationCategory Scaffold
 *
 * Current Theia version: 1.73.1
 * Breaking change arrives: Theia v1.75.0
 *
 * In Theia v1.75.0 the per-tab AI configuration widget API was removed and
 * replaced by a contribution-point driven master-detail view.  Old registrations:
 *   AIAgentConfigurationWidget, AIVariableConfigurationWidget,
 *   AIToolsConfigurationWidget, etc. are GONE.
 *
 * New API (v1.75+):
 *   Contribute an `AiConfigurationCategory` to the `AiConfigurationCategory`
 *   multi-inject token.  Each category renders as a labelled section in the
 *   master-detail "AI Configuration" view.
 *
 * This file is a FORWARD-COMPATIBLE scaffold.  It contains:
 *   1. The interface + symbol definition (mirroring v1.75 shape) so we can
 *      compile against it today.
 *   2. Our concrete `HayagrivaAiConfigurationCategory` contribution.
 *   3. Binding exports ready to drop into hayagriva-frontend-module.ts the
 *      moment we upgrade to @theia packages ≥ 1.75.0.
 *
 * HOW TO ACTIVATE (on Theia 1.75.0 upgrade):
 *   a) Remove the interface + symbol block below (import them from
 *      '@theia/ai-core-ui/lib/browser/ai-configuration-category').
 *   b) Uncomment the `bind(AiConfigurationCategory)` lines in
 *      hayagriva-frontend-module.ts.
 *   c) Add '@theia/ai-core-ui' to hayagriva/package.json dependencies.
 *
 ********************************************************************************/

import { injectable } from '@theia/core/shared/inversify';

// ─── Scaffold: AiConfigurationCategory interface (v1.75 shape) ───────────────
// When upgrading to Theia 1.75, replace this block with:
//   import { AiConfigurationCategory } from '@theia/ai-core-ui/lib/browser/ai-configuration-category';

/**
 * Unique DI symbol for AiConfigurationCategory contributions.
 * Mirrors the v1.75 `@theia/ai-core-ui` export.
 */
export const AiConfigurationCategory = Symbol('AiConfigurationCategory');

/**
 * Shape of a v1.75 AI Configuration view category contribution.
 * Replace with the real import from @theia/ai-core-ui on upgrade.
 */
export interface AiConfigurationCategory {
    /** Short label shown as the section header in the master list. */
    readonly label: string;
    /**
     * Optional ordering hint (lower = earlier in list).
     * Hayagriva sections are placed after built-in Theia sections (order > 100).
     */
    readonly order?: number;
    /**
     * Render the configuration UI for this section.
     * Return an HTMLElement or React ReactNode (Theia handles both via its renderer).
     */
    renderConfiguration(): HTMLElement | undefined;
}

// ─── Hayagriva Engine & Model Configuration Category ─────────────────────────

@injectable()
export class HayagrivaEngineCategoryContribution implements AiConfigurationCategory {
    readonly label = 'Hayagriva — Engine & Model';
    readonly order = 110;

    renderConfiguration(): HTMLElement {
        const container = document.createElement('div');
        container.className = 'hayagriva-ai-config-section';
        container.innerHTML = `
            <p class="hayagriva-config-description">
                Configure the local LLM engine (LegalParam / FinanceParam) and API port.
                Use the <strong>Settings Dashboard</strong> (⚙️ Hayagriva → Open Settings) for
                full engine lifecycle management and real-time RAM telemetry.
            </p>
            <div class="hayagriva-config-link-row">
                <button class="theia-button secondary" id="haya-open-settings-btn">
                    Open Hayagriva Settings Dashboard
                </button>
            </div>
        `;

        const btn = container.querySelector<HTMLButtonElement>('#haya-open-settings-btn');
        if (btn) {
            btn.addEventListener('click', () => {
                // Dispatch a command that HayagrivaCommandContribution handles
                document.dispatchEvent(new CustomEvent('hayagriva:openSettings'));
            });
        }

        return container;
    }
}

// ─── Hayagriva Legal Agents Configuration Category ────────────────────────────

@injectable()
export class HayagrivaAgentsCategoryContribution implements AiConfigurationCategory {
    readonly label = 'Hayagriva — Legal Agents';
    readonly order = 111;

    /** Static agent metadata – keep in sync with chat-agents.ts */
    private readonly agents = [
        { id: 'Advisor',   name: '@advisor',   desc: 'Legal research & precedents',                 modes: ['plan', 'draft'] },
        { id: 'Precedent', name: '@precedent', desc: 'Supreme Court & NCLAT case law search',       modes: ['search', 'ratio'] },
        { id: 'Document',  name: '@document',  desc: 'Draft court petitions & filings',             modes: ['plan', 'draft'] },
        { id: 'Forms',     name: '@forms',     desc: 'Audit & fill statutory forms',                modes: ['fill', 'audit'] },
        { id: 'Claims',    name: '@claims',    desc: 'Creditor claims & debt voting shares',        modes: ['check'] },
        { id: 'IM',        name: '@im',        desc: 'Regulation 36 Information Memorandum',        modes: ['build'] },
        { id: 'Plan',      name: '@plan',      desc: 'Sec 30(2) Resolution Plan audit',             modes: ['audit'] },
        { id: 'Avoidance', name: '@avoidance', desc: 'Sec 43/45/49/50 avoidance transactions',     modes: ['scan'] },
        { id: 'Litigation',name: '@litigation',desc: 'NCLT bench briefs & counter-arguments',       modes: ['brief', 'counter'] },
    ];

    renderConfiguration(): HTMLElement {
        const container = document.createElement('div');
        container.className = 'hayagriva-ai-config-section';

        const table = document.createElement('table');
        table.className = 'hayagriva-agents-table';
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Agent</th>
                    <th>Description</th>
                    <th>Modes</th>
                </tr>
            </thead>
        `;
        const tbody = document.createElement('tbody');
        for (const agent of this.agents) {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><code>${agent.name}</code></td>
                <td>${agent.desc}</td>
                <td>${agent.modes.map(m => `<span class="haya-mode-badge">/${m}</span>`).join(' ')}</td>
            `;
            tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        container.appendChild(table);

        const notice = document.createElement('p');
        notice.className = 'hayagriva-config-description';
        notice.textContent =
            'All agents route to the Hayagriva backend via the API port configured in Settings. ' +
            'Enable / disable individual agents using the AI agent toggle in the Theia AI panel above.';
        container.appendChild(notice);

        return container;
    }
}

// ─── Hayagriva RAG & Context Configuration Category ───────────────────────────

@injectable()
export class HayagrivaRagCategoryContribution implements AiConfigurationCategory {
    readonly label = 'Hayagriva — RAG & Context';
    readonly order = 112;

    renderConfiguration(): HTMLElement {
        const container = document.createElement('div');
        container.className = 'hayagriva-ai-config-section';
        container.innerHTML = `
            <p class="hayagriva-config-description">
                Hayagriva uses a <strong>Hybrid FTS5 + Cosine-similarity RAG</strong> pipeline
                with dual vector spaces: <em>InLegal-SBERT</em> (legal documents) and
                <em>Finance-Embeddings</em> (financial sheets). Merged via Reciprocal Rank Fusion.
            </p>
            <ul class="hayagriva-config-list">
                <li><strong>Active-Context Control Matrix:</strong> Use the Concepts sidebar checkbox list to include/exclude documents from RAG retrieval.</li>
                <li><strong>Token Budget:</strong> Strict 2,048-token context window (≈1,200 words). Overflow triggers a graceful notice instead of silent truncation.</li>
                <li><strong>Idle Eviction:</strong> ONNX embedding pipelines are evicted after 5 min of inactivity to reclaim ~250 MB RAM.</li>
            </ul>
        `;
        return container;
    }
}
