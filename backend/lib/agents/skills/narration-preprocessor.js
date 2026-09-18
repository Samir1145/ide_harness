const { resolveSkill } = require('./skill-resolver');

const preprocessor = resolveSkill('bank-forensic-audit', 'preprocessor') || {
    preprocessNarration: (n) => n || '',
    cleanString: (s) => s || ''
};

module.exports = preprocessor;

