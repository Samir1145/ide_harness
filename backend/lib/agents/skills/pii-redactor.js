const { resolveSkill } = require('./skill-resolver');

const redactor = resolveSkill('pii-redaction') || {
    redactText: (txt) => txt || '',
    maskAccountNumber: (acc) => acc || '',
    maskAadhaar: (a) => a || '',
    maskPan: (p) => p || ''
};

module.exports = redactor;

