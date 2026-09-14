/**
 * Skill Package: claim-verification
 * Unified entry point for IBC creditor claim verification
 */

const path = require('path');
const BACKEND_DIR = path.resolve(__dirname, '..', '..', 'backend');
const SKILLS_DIR = path.join(BACKEND_DIR, 'lib', 'agents', 'skills');

let claimVerify;
let claimExtract;

try {
    claimVerify = require(path.join(SKILLS_DIR, 'claim-verify'));
    claimExtract = require(path.join(SKILLS_DIR, 'claim-extract'));
} catch (e) {
    claimVerify = {};
    claimExtract = {};
}

module.exports = {
    auditCaseClaims: claimVerify.auditCaseClaims,
    verifySingleClaim: claimVerify.verifySingleClaim,
    readCaseFacts: claimExtract.readCaseFacts,
    formatIndianCurrency: claimExtract.formatIndianCurrency,
    numberToIndianWords: claimExtract.numberToIndianWords
};
