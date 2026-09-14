const skill = require('../../../../skills/xbrl-intelligence');
module.exports = {
    ingestXbrlFilings: skill.ingestXbrlFilings,
    extractXbrlEntitiesFromXml: skill.extractXbrlEntitiesFromXml,
    canonicalizeName: skill.canonicalizeName
};
