const { resolveSkill } = require('./skill-resolver');

const skill = resolveSkill('bank-forensic-audit') || {
    ingestBankStatements: async () => ({ transactions: [] }),
    parseExcelOrCsv: () => [],
    normalizeDate: (d) => d || '',
    cleanAmount: (a) => a || 0
};

module.exports = {
    ingestBankStatements: skill.ingestBankStatements,
    parseExcelOrCsv: skill.parseExcelOrCsv,
    normalizeDate: skill.normalizeDate,
    cleanAmount: skill.cleanAmount
};

