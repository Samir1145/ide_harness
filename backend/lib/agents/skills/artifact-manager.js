'use strict';

const fs = require('fs');
const path = require('path');
const { getConceptsDir } = require('../../pipeline/common/helper');
const { readAllKV } = require('./kv-write');

/**
 * Resolves high-priority case context chips (#case_facts, #timeline, #claims_registry, #avoidance_ledger).
 */
async function resolveContextChip(caseDir, chipName, activeFile = null) {
    if (!caseDir || !fs.existsSync(caseDir)) return '';

    const norm = String(chipName || '').toLowerCase().replace(/^[#@]/, '').trim();

    switch (norm) {
        case 'case_facts':
        case 'facts': {
            const kv = readAllKV(caseDir);
            const entries = Object.entries(kv);
            if (entries.length === 0) return 'No verified case facts recorded yet in case_kv_dictionary.json.';
            const lines = ['### 📋 Verified Case Facts:'];
            for (const [k, v] of entries) {
                const displayVal = typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v);
                lines.push(`- **${k}**: ${displayVal}`);
            }
            return lines.join('\n');
        }

        case 'timeline':
        case 'chronology': {
            const timelinePaths = [
                path.join(caseDir, 'timeline.md'),
                path.join(getConceptsDir(caseDir), 'timeline.md')
            ];
            for (const p of timelinePaths) {
                if (fs.existsSync(p)) {
                    try {
                        return fs.readFileSync(p, 'utf8');
                    } catch (_) {}
                }
            }
            const { buildTimeline } = require('./timeline-build');
            const events = await buildTimeline(caseDir);
            if (events && events.length > 0) {
                const lines = ['### ⏱️ CIRP Timeline & Chronology:'];
                for (const ev of events) {
                    lines.push(`- **${ev.date || 'Undated'}**: ${ev.event || ev.description || JSON.stringify(ev)}`);
                }
                return lines.join('\n');
            }
            return 'No timeline events recorded yet.';
        }

        case 'claims_registry':
        case 'claims': {
            const claimsPath = path.join(caseDir, 'claims_registry.md');
            if (fs.existsSync(claimsPath)) {
                try {
                    return fs.readFileSync(claimsPath, 'utf8');
                } catch (_) {}
            }
            return 'No claims_registry.md found in case workspace.';
        }

        case 'avoidance_ledger':
        case 'avoidance':
        case 'pufe': {
            const avoidancePath = path.join(caseDir, 'avoidance_ledger.md');
            if (fs.existsSync(avoidancePath)) {
                try {
                    return fs.readFileSync(avoidancePath, 'utf8');
                } catch (_) {}
            }
            return 'No avoidance_ledger.md found in case workspace.';
        }

        case 'active_file':
        case 'activefile':
        case 'file': {
            if (activeFile && fs.existsSync(activeFile)) {
                try {
                    return fs.readFileSync(activeFile, 'utf8');
                } catch (_) {}
            }
            return 'No active file selected in editor.';
        }

        default:
            return '';
    }
}

/**
 * Saves a generated draft or court document into <caseDir>/drafts/ or <caseDir>/artifacts/.
 */
function saveArtifact(caseDir, artifactData = {}) {
    if (!caseDir) throw new Error('caseDir is required to save artifact');
    
    const draftsDir = path.join(caseDir, 'drafts');
    fs.mkdirSync(draftsDir, { recursive: true });

    const rawName = artifactData.name || `draft_${Date.now()}.md`;
    const cleanName = path.basename(rawName).replace(/[^a-zA-Z0-9_.-]/g, '_');
    const filePath = path.join(draftsDir, cleanName);

    const content = artifactData.content || '';
    fs.writeFileSync(filePath, content, 'utf8');

    const stat = fs.statSync(filePath);

    return {
        success: true,
        id: `art_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        name: cleanName,
        filePath,
        type: artifactData.type || 'draft',
        sizeBytes: stat.size,
        createdAt: new Date().toISOString()
    };
}

/**
 * Lists all generated drafts and artifacts in the case.
 */
function listArtifacts(caseDir) {
    if (!caseDir || !fs.existsSync(caseDir)) return [];

    const dirsToScan = [
        path.join(caseDir, 'drafts'),
        path.join(caseDir, 'artifacts')
    ];

    const results = [];

    for (const dir of dirsToScan) {
        if (fs.existsSync(dir)) {
            try {
                const files = fs.readdirSync(dir, { withFileTypes: true });
                for (const file of files) {
                    if (file.isFile() && !file.name.startsWith('.')) {
                        const filePath = path.join(dir, file.name);
                        const stat = fs.statSync(filePath);
                        results.push({
                            name: file.name,
                            filePath,
                            dir: path.basename(dir),
                            sizeBytes: stat.size,
                            updatedAt: stat.mtime.toISOString()
                        });
                    }
                }
            } catch (_) {}
        }
    }

    return results;
}

module.exports = {
    resolveContextChip,
    saveArtifact,
    listArtifacts
};
