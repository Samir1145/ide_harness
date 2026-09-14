/**
 * Skill Module: preprocessor.js
 * Part of bank-forensic-audit Skill Package
 */

const TRANSACTION_WORDS = new Set([
    'POS', 'UPI', 'IMPS', 'NEFT', 'RTGS', 'ACH', 'ATM', 
    'DR', 'CR', 'NETBANK', 'INF', 'CMS', 'BIL', 'TRF', 
    'TRANSFER', 'CLEARING', 'INWARD', 'OUTWARD'
]);

const FURNITURE_MARKERS = [
    'STATEMENT OF ACCOUNT',
    'ACCOUNT STATEMENT',
    'STATEMENT FROM',
    'BALANCE CARRIED FORWARD',
    'OPENING BALANCE',
    'CLEAR BALANCE',
    'CLOSING BALANCE',
    'UNCLEARED',
    'TOTAL DEBITS',
    'TOTAL CREDITS',
    'PAGE NO',
    'PLEASE DO NOT SHARE',
    'POWER OF ATTORNEY',
    'TRANSACTIONS WITH EXTRA',
    'THANK YOU'
];

const CARD_PATTERN = /\b\d+X+\d+\b/gi;
const LONG_DIGIT_PATTERN = /\b\d{12,19}\b/g;
const IFSC_PATTERN = /\b[A-Z]{4}0[A-Z0-9]{6}\b/gi;
const UTR_REF_PATTERN = /\b(?:UTR|REF|TXN|ID|PUNB|BARB|MAHB|CORP)[\d\w]{8,22}\b/gi;
const INV_DATE_PATTERN = /\b(?:INV|BILL|DT|DATE)[\d\w/-]+\b/gi;

class NarrationPreprocessor {
    static isFurniture(text) {
        if (!text) return false;
        const upper = String(text).toUpperCase().trim();
        for (const marker of FURNITURE_MARKERS) {
            if (upper.includes(marker)) return true;
        }
        return false;
    }

    static extractKeyword(narration) {
        if (!narration) return '';
        let text = String(narration).trim();

        // 1. UPI Parsing
        const upiMatch = text.match(/^UPI[\s/:-]+([^-/:]+)/i);
        if (upiMatch && upiMatch[1]) {
            const candidate = upiMatch[1].trim();
            if (candidate.length > 2 && !/^\d+$/.test(candidate)) {
                return candidate;
            }
        }

        // 2. POS Card Parsing
        const posMatch = text.match(/^POS\s+(.+)$/i);
        if (posMatch && posMatch[1]) {
            const tokens = posMatch[1].split(/\s+/);
            if (tokens.length > 1 && (CARD_PATTERN.test(tokens[0]) || tokens[0].length >= 12)) {
                return tokens.slice(1).join(' ').trim();
            }
            return posMatch[1].trim();
        }

        return text;
    }

    static clean(narration) {
        if (!narration) return 'UNKNOWN COUNTERPARTY';
        if (this.isFurniture(narration)) return '';

        let text = this.extractKeyword(narration);

        text = text.replace(CARD_PATTERN, ' ');
        text = text.replace(LONG_DIGIT_PATTERN, ' ');
        text = text.replace(IFSC_PATTERN, ' ');
        text = text.replace(UTR_REF_PATTERN, ' ');
        text = text.replace(INV_DATE_PATTERN, ' ');

        const words = text.split(/\s+/).filter(w => !TRANSACTION_WORDS.has(w.toUpperCase()));
        text = words.join(' ');

        text = text.replace(/[/\\:;\-_*#@]/g, ' ');
        text = text.replace(/\s+/g, ' ').trim();

        if (text.length < 3) {
            return String(narration).trim().substring(0, 40);
        }
        return text;
    }
}

module.exports = NarrationPreprocessor;
