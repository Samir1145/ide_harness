const skill = require('../../../../skills/bank-forensic-audit');
module.exports = {
    ingestBankStatements: skill.ingestBankStatements,
    parseExcelOrCsv: skill.parseExcelOrCsv,
    normalizeDate: skill.normalizeDate,
    cleanAmount: skill.cleanAmount
};
