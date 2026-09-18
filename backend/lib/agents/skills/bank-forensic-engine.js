const { resolveSkill } = require('./skill-resolver');

const skill = resolveSkill('bank-forensic-audit') || {
    runForensicAnalysis: () => ({}),
    cleanNarration: (n) => n || '',
    isCashTransaction: () => false,
    isSubThresholdSmurfing: () => false
};

module.exports = {
    runForensicAnalysis: skill.runForensicAnalysis,
    cleanNarration: skill.cleanNarration,
    isCashTransaction: skill.isCashTransaction,
    isSubThresholdSmurfing: skill.isSubThresholdSmurfing
};

