const skill = require('../../../../skills/bank-forensic-audit');
module.exports = {
    runForensicAnalysis: skill.runForensicAnalysis,
    cleanNarration: skill.cleanNarration,
    isCashTransaction: skill.isCashTransaction,
    isSubThresholdSmurfing: skill.isSubThresholdSmurfing
};
