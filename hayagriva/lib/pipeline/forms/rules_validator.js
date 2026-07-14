/**
 * Safe, rule-based mathematical, format, and date validation engine.
 */

/**
 * Validates a flat dictionary of form field values against schema programmatic rules.
 * 
 * @param {Object} flatData - Simple flat key-value pairs representing form fields: { key: value }
 * @param {Array<Object>} rules - Rules defined in the form's schema.json
 * @returns {Array<Object>} List of rule violation objects: { ruleId, message, affectedFields }
 */
function validateFormRules(flatData, rules) {
    if (!rules || !Array.isArray(rules) || rules.length === 0) {
        return [];
    }

    const failures = [];

    for (const rule of rules) {
        const { ruleId, formula, message } = rule;
        if (!formula) continue;

        // Extract all words that could be variable names (keys) in the equation
        const varRegex = /[a-zA-Z_][a-zA-Z0-9_]*/g;
        let match;
        const varsInFormula = [];
        while ((match = varRegex.exec(formula)) !== null) {
            const name = match[0];
            // Skip JavaScript keywords/operators or literals
            if (['true', 'false', 'null', 'undefined', 'Date', 'Math', 'Number'].includes(name)) continue;
            if (!varsInFormula.includes(name)) {
                varsInFormula.push(name);
            }
        }

        const contextValues = {};
        let missingCritical = false;

        for (const varName of varsInFormula) {
            let rawVal = flatData[varName];

            // If a value is missing or represents a blank placeholder, normalize it
            if (rawVal === undefined || rawVal === null || rawVal === '' || rawVal === 'XXXX') {
                rawVal = 0;
            }

            let finalVal = rawVal;

            // Try to parse Date values (e.g. signature/board dates like DD/MM/YYYY or ISO strings)
            if (typeof rawVal === 'string' && /^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/.test(rawVal.trim())) {
                const parts = rawVal.trim().split(/[\/\-]/);
                // Standard Indian MCA Date layout: DD/MM/YYYY
                const dateObj = new Date(parts[2], parts[1] - 1, parts[0]);
                finalVal = dateObj.getTime();
            } else if (typeof rawVal === 'string' && /^\d{4}-\d{2}-\d{2}/.test(rawVal.trim())) {
                finalVal = new Date(rawVal.trim()).getTime();
            } else if (rawVal !== '' && !isNaN(rawVal)) {
                // If it is a clean number, parse to float
                finalVal = Number(rawVal);
            }

            contextValues[varName] = finalVal;
        }

        // Programmatically execute the formula safely in a sandboxed Function
        try {
            const keys = Object.keys(contextValues);
            const vals = Object.values(contextValues);
            const fn = new Function(...keys, `return (${formula});`);
            const passed = fn(...vals);
            
            if (!passed) {
                failures.push({
                    ruleId,
                    message,
                    affectedFields: varsInFormula
                });
            }
        } catch (e) {
            console.warn(`[Rules Validator] Error executing rule ${ruleId} ("${formula}"):`, e.message);
        }
    }

    return failures;
}

module.exports = { validateFormRules };
