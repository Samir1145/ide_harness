const { resolveSkill } = require('./skill-resolver');

const skill = resolveSkill('xbrl-intelligence') || {
    ingestXbrlFilings: async () => ({}),
    extractXbrlEntitiesFromXml: () => [],
    canonicalizeName: (n) => n || ''
};

module.exports = {
    ingestXbrlFilings: skill.ingestXbrlFilings,
    extractXbrlEntitiesFromXml: skill.extractXbrlEntitiesFromXml,
    canonicalizeName: skill.canonicalizeName
};

