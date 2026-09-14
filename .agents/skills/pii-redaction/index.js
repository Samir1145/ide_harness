/**
 * Skill Package: pii-redaction
 * Unified entry point for PII redaction and VDR sanitization
 */

const PiiRedactor = require('./redactor');

module.exports = {
    PiiRedactor,
    maskAccountNumber: PiiRedactor.maskAccountNumber.bind(PiiRedactor),
    redactText: PiiRedactor.redactText.bind(PiiRedactor)
};
