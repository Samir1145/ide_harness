'use strict';

const fs = require('fs');
const path = require('path');
const { classifyDocument } = require('../classifier/classifier');
const { parseAffidavit } = require('../parsers/affidavit_parser');
const { evaluateStatutoryReadiness } = require('../gatekeeper/gap_matrix_tracker');

/**
 * Scans a matter's 00_inbox (and matter root for loose files),
 * classifies each file using the 3-Tier engine, moves it to its JIT statutory folder,
 * and extracts private disclosures.
 *
 * @param {string} matterDir - Absolute path to matter directory
 * @returns {Array<object>} List of processed file actions
 */
function processInbox(matterDir) {
  const inboxDir = path.join(matterDir, '00_inbox');
  fs.mkdirSync(inboxDir, { recursive: true });

  const actions = [];
  const filesToProcess = [];

  // 1. Check loose files in matter root (excluding hidden, settings, and directories)
  const rootEntries = fs.readdirSync(matterDir);
  for (const entry of rootEntries) {
    const fullPath = path.join(matterDir, entry);
    const stat = fs.statSync(fullPath);
    if (stat.isFile() && !entry.startsWith('.') && !entry.endsWith('.json') && !entry.endsWith('.md')) {
      filesToProcess.push({ fullPath, filename: entry, source: 'root' });
    }
  }

  // 2. Check files in 00_inbox
  if (fs.existsSync(inboxDir)) {
    const inboxEntries = fs.readdirSync(inboxDir);
    for (const entry of inboxEntries) {
      const fullPath = path.join(inboxDir, entry);
      const stat = fs.statSync(fullPath);
      if (stat.isFile() && !entry.startsWith('.')) {
        filesToProcess.push({ fullPath, filename: entry, source: 'inbox' });
      }
    }
  }

  // 3. Process each file
  for (const item of filesToProcess) {
    const classification = classifyDocument(item.fullPath);

    // If unclassified, leave in 00_inbox
    if (classification.category === 'UNCLASSIFIED_GENERAL') {
      if (item.source === 'root') {
        const destInInbox = path.join(inboxDir, item.filename);
        fs.renameSync(item.fullPath, destInInbox);
        actions.push({ file: item.filename, action: 'MOVED_TO_INBOX', category: 'UNCLASSIFIED' });
      }
      continue;
    }

    // Prepare target JIT directory inside matter
    const targetDir = path.join(matterDir, classification.targetFolder);
    fs.mkdirSync(targetDir, { recursive: true });

    // Standardize destination filename
    let cleanName = item.filename;
    if (!cleanName.startsWith(classification.filePrefix)) {
      cleanName = `${classification.filePrefix}_${cleanName.replace(/^[\[\(].*?[\]\)]_?/, '')}`;
    }
    const destPath = path.join(targetDir, cleanName);

    // Move file
    fs.renameSync(item.fullPath, destPath);

    // If this is a Section 29A Affidavit, parse its text immediately
    let parsedDisclosures = null;
    if (classification.category === '29A_AFFIDAVIT') {
      const rawText = fs.readFileSync(destPath, 'utf8') || '';
      parsedDisclosures = parseAffidavit(rawText, matterDir);
    }

    actions.push({
      originalFile: item.filename,
      category: classification.category,
      label: classification.label,
      targetFolder: classification.targetFolder,
      destinationPath: destPath,
      parsedDisclosures
    });
  }

  // 4. Update the Statutory Readiness Gap Matrix
  const readiness = evaluateStatutoryReadiness(matterDir);

  return {
    actions,
    readiness
  };
}

module.exports = {
  processInbox
};
