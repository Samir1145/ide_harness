/**
 * Skill: md-append.js
 * Appends structured findings to case markdown files (case_facts.md,
 * claims_registry.md, avoidance_ledger.md, timeline.md, etc.).
 * Agents call this to write their discoveries back to the knowledge base.
 */

const fs = require('fs');
const path = require('path');

// Target markdown files agents are allowed to write to
const ALLOWED_TARGETS = new Set([
    'case_facts.md',
    'claims_registry.md',
    'avoidance_ledger.md',
    'timeline.md',
    'litigation_tracker.md',
    'evidence_matrix.md',
    'compliance_flags.md',
    'entity_graph.md',
]);

/**
 * Appends a markdown table row or section to a case markdown file.
 *
 * @param {string} caseDir   - Active case directory
 * @param {string} filename  - Target file (e.g. 'case_facts.md')
 * @param {string} section   - Section heading to append under (e.g. '## Agent Findings')
 * @param {string} content   - Markdown content to append (a row, paragraph, or block)
 * @param {string} agentName - Name of the writing agent (for provenance tracking)
 * @returns {boolean}
 */
function appendToMarkdown(caseDir, filename, section, content, agentName = 'agent') {
    if (!ALLOWED_TARGETS.has(filename)) {
        console.warn(`[Skill:mdAppend] "${filename}" is not in the allowed write targets list.`);
        return false;
    }

    const filePath = path.join(caseDir, filename);
    const timestamp = new Date().toISOString().split('T')[0];

    // Build the block to append
    const appendBlock = `\n\n<!-- Written by ${agentName} on ${timestamp} -->\n${section ? `\n${section}\n` : ''}${content}\n`;

    try {
        if (!fs.existsSync(filePath)) {
            // Create file with header if it doesn't exist
            fs.writeFileSync(filePath, `# ${filename.replace('.md', '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}\n${appendBlock}`, 'utf8');
        } else {
            fs.appendFileSync(filePath, appendBlock, 'utf8');
        }
        console.log(`[Skill:mdAppend] Appended to ${filename} under "${section}"`);
        return true;
    } catch (e) {
        console.error(`[Skill:mdAppend] Write failed for ${filename}:`, e.message);
        return false;
    }
}

/**
 * Appends a markdown table row to a case file.
 * Creates the table header if it doesn't already exist in the file.
 *
 * @param {string} caseDir
 * @param {string} filename
 * @param {string[]} headers  - Column headers e.g. ['Date', 'Event', 'Source']
 * @param {string[]} rowData  - Row values aligned to headers
 * @param {string} agentName
 * @returns {boolean}
 */
function appendTableRow(caseDir, filename, headers, rowData, agentName = 'agent') {
    if (!ALLOWED_TARGETS.has(filename)) return false;

    const filePath = path.join(caseDir, filename);
    const headerRow = `| ${headers.join(' | ')} |`;
    const dividerRow = `| ${headers.map(() => '---').join(' | ')} |`;
    const dataRow = `| ${rowData.map(v => String(v).replace(/\|/g, '\\|')).join(' | ')} |`;

    try {
        let existing = '';
        if (fs.existsSync(filePath)) {
            existing = fs.readFileSync(filePath, 'utf8');
        }

        // If the table header already exists, just append the row
        if (existing.includes(headerRow)) {
            fs.appendFileSync(filePath, `\n${dataRow}`, 'utf8');
        } else {
            // Create fresh table
            const table = `\n\n${headerRow}\n${dividerRow}\n${dataRow}`;
            if (!existing) {
                fs.writeFileSync(filePath, `# ${filename.replace('.md','')}\n${table}`, 'utf8');
            } else {
                fs.appendFileSync(filePath, table, 'utf8');
            }
        }
        console.log(`[Skill:mdAppend] Table row written to ${filename}`);
        return true;
    } catch (e) {
        console.error(`[Skill:mdAppend] Table row write failed:`, e.message);
        return false;
    }
}

module.exports = { appendToMarkdown, appendTableRow };
