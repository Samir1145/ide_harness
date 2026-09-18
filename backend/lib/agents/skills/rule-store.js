const { resolveSkill } = require('./skill-resolver');

const ruleStore = resolveSkill('bank-forensic-audit', 'rules') || {
    loadRules: () => ({}),
    getRule: () => null
};

module.exports = ruleStore;

