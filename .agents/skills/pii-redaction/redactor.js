/**
 * Skill Module: redactor.js
 * Part of pii-redaction Skill Package
 */

const EMAIL_PATTERN = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

// Indian and international mobile phone numbers (+91-9876543210, 9876543210, (555) 123-4567)
const PHONE_PATTERN = /(?<!\w)(?:(?:\+91[\s.-]?)?[6-9]\d{9}|\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})(?!\w)/g;

// Account number labeled pattern e.g. "Account No: 39120481920", "A/c: `39120481920`"
const ACCOUNT_LABEL_PATTERN = /(\b(?:account\s*(?:no|number)?|a\/c\s*(?:no)?|acc)[:\s-]*`?)([0-9]{8,18})(`?)/gi;

// Inline code blocks with 8-18 digits e.g. `39120481920`
const INLINE_ACCOUNT_CODE = /`([0-9]{8,18})`/g;

class PiiRedactor {
    /**
     * Partially masks an account number (e.g. 39120481920 -> XXXXXXX1920)
     */
    static maskAccountNumber(accountNo) {
        if (!accountNo) return 'XXXX';
        const str = String(accountNo).trim();
        if (str.length <= 4) return str;
        const lastFour = str.slice(-4);
        const maskedPrefix = 'X'.repeat(str.length - 4);
        return maskedPrefix + lastFour;
    }

    /**
     * Sanitizes full markdown text for external VDR distribution
     */
    static redactText(text) {
        if (!text) return '';
        let out = String(text);

        // 1. Redact Emails
        out = out.replace(EMAIL_PATTERN, '[REDACTED_EMAIL]');

        // 2. Redact Phone Numbers
        out = out.replace(PHONE_PATTERN, '[REDACTED_PHONE]');

        // 3. Mask Labeled Account Numbers
        out = out.replace(ACCOUNT_LABEL_PATTERN, (match, prefix, digits, suffix) => {
            return `${prefix}${this.maskAccountNumber(digits)}${suffix}`;
        });

        // 4. Mask Inline Code Block Account Numbers
        out = out.replace(INLINE_ACCOUNT_CODE, (match, digits) => {
            // Ensure not a year or round amount like `10000000` (8 zeros)
            if (/^10+$/.test(digits) || /^[12]\d{3}$/.test(digits)) {
                return match;
            }
            return `\`${this.maskAccountNumber(digits)}\``;
        });

        return out;
    }
}

module.exports = PiiRedactor;
