/**
 * Skill Package: xbrl-intelligence
 * Unified entry point for MCA AOC-4 XBRL parsing
 */

const extractor = require('./extractor');

module.exports = {
    ingestXbrlFilings: extractor.ingestXbrlFilings,
    extractXbrlEntitiesFromXml: extractor.extractXbrlEntitiesFromXml,
    canonicalizeName: extractor.canonicalizeName
};
