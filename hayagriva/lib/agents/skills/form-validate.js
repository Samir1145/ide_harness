/**
 * Skill: form-validate.js
 * Validates a populated form's fields against a schema's math and date rules.
 * Re-exports the existing pipeline validator for agent use.
 */
const { validateFormRules } = require('../../pipeline/forms/rules_validator');
const { populateFormInstance } = require('../../pipeline/forms/mapper');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..', '..', '..');

/**
 * Validates a named form against case data.
 * @param {string} caseDir
 * @param {string} formId  - e.g. 'aoc-4', 'ibbi-form-a'
 * @returns {Promise<{fields: Object, failures: Array, passed: boolean}>}
 */
async function validateForm(caseDir, formId) {
    const fields = await populateFormInstance(caseDir, formId);
    const schemaPath = path.join(REPO_ROOT, 'hayagriva', 'forms', formId, 'schema.json');
    let rules = [];
    if (fs.existsSync(schemaPath)) {
        rules = JSON.parse(fs.readFileSync(schemaPath, 'utf8')).rules || [];
    }
    const flatData = {};
    for (const k in fields) flatData[k] = fields[k].value;
    const failures = validateFormRules(flatData, rules);
    return { fields, failures, passed: failures.length === 0 };
}

module.exports = { validateForm };
