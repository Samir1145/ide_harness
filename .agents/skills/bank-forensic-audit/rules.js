/**
 * Skill Module: rules.js
 * Part of bank-forensic-audit Skill Package
 */

const fs = require('fs');
const path = require('path');

class RuleStore {
    constructor() {
        this.categories = {};
        this.loadDefaultRules();
    }

    parseSimpleYaml(content) {
        const categories = {};
        let currentCategory = null;
        let inContains = false;

        const lines = content.split(/\r?\n/);
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;

            const catMatch = line.match(/^ {2}([A-Z0-9_]+):/);
            if (catMatch) {
                currentCategory = catMatch[1];
                categories[currentCategory] = {
                    key: currentCategory,
                    label: currentCategory,
                    statutorySection: '',
                    contains: []
                };
                inContains = false;
                continue;
            }

            if (!currentCategory) continue;

            const labelMatch = trimmed.match(/^label:\s*["']?([^"']+)["']?/);
            if (labelMatch) {
                categories[currentCategory].label = labelMatch[1].trim();
                inContains = false;
                continue;
            }

            const secMatch = trimmed.match(/^statutorySection:\s*["']?([^"']+)["']?/);
            if (secMatch) {
                categories[currentCategory].statutorySection = secMatch[1].trim();
                inContains = false;
                continue;
            }

            if (trimmed.startsWith('contains:')) {
                inContains = true;
                continue;
            }

            if (inContains && trimmed.startsWith('-')) {
                const item = trimmed.replace(/^-\s*["']?/, '').replace(/["']?$/, '').trim().toUpperCase();
                if (item) {
                    categories[currentCategory].contains.push(item);
                }
            }
        }

        return categories;
    }

    loadDefaultRules() {
        const defaultPaths = [
            path.join(__dirname, 'rules.yml'),
            path.join(__dirname, '..', '..', 'config', 'forensic_rules.yml'),
            path.join(__dirname, 'forensic_rules.yml')
        ];

        for (const p of defaultPaths) {
            if (fs.existsSync(p)) {
                try {
                    const content = fs.readFileSync(p, 'utf8');
                    this.categories = this.parseSimpleYaml(content);
                    break;
                } catch (e) {
                    console.warn('[RuleStore] Error loading rules:', e.message);
                }
            }
        }
    }

    loadCaseOverrides(caseDir) {
        if (!caseDir) return;
        const localPath = path.join(caseDir, 'forensic_rules.local.yml');
        if (fs.existsSync(localPath)) {
            try {
                const content = fs.readFileSync(localPath, 'utf8');
                const overrides = this.parseSimpleYaml(content);
                for (const [key, val] of Object.entries(overrides)) {
                    if (!this.categories[key]) {
                        this.categories[key] = val;
                    } else {
                        this.categories[key].contains.push(...val.contains);
                    }
                }
            } catch (e) {
                console.warn('[RuleStore] Error loading case overrides:', e.message);
            }
        }
    }

    classify(narration, isRelatedParty = false) {
        if (isRelatedParty) {
            return {
                key: 'RELATED_PARTY',
                label: 'AS-18 Related Party / Connected Person',
                statutorySection: '§43 (Preferential) / §45 (Undervalued) / §66 (Fraud)'
            };
        }

        const text = String(narration || '').toUpperCase();

        for (const cat of Object.values(this.categories)) {
            for (const token of cat.contains) {
                if (text.includes(token)) {
                    return {
                        key: cat.key,
                        label: cat.label,
                        statutorySection: cat.statutorySection
                    };
                }
            }
        }

        return {
            key: 'TRADE_OPERATIONAL',
            label: 'Trade Operational Outflow / Creditors',
            statutorySection: 'Commercial Operations'
        };
    }
}

module.exports = new RuleStore();
