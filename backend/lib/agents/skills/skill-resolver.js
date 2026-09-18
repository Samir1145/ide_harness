'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Dynamically resolves a domain skill module from ide_agents packs,
 * local skills directory, or returns a safe fallback.
 * @param {string} skillName
 * @param {string} [subpath]
 * @returns {*}
 */
function resolveSkill(skillName, subpath = '') {
    const candidateRoots = [
        path.join(os.homedir(), 'Desktop', 'ide_agents', 'packs', 'finance_agents.vlt', 'skills'),
        path.join(os.homedir(), 'Desktop', 'ide_agents', 'packs', 'legal_agents.vlt', 'skills'),
        path.join(__dirname, '..', '..', '..', '..', 'ide_agents', 'packs', 'finance_agents.vlt', 'skills'),
        path.join(__dirname, '..', '..', '..', '..', 'ide_agents', 'packs', 'legal_agents.vlt', 'skills'),
        path.join(os.homedir(), 'Desktop', 'ide_agents', 'skills'),
        path.join(__dirname, '..', '..', '..', '..', 'ide_agents', 'skills'),
        path.resolve(__dirname, '../../../../skills')
    ];

    for (const root of candidateRoots) {
        const full = subpath ? path.join(root, skillName, subpath) : path.join(root, skillName);
        if (fs.existsSync(full) || fs.existsSync(full + '.js')) {
            try {
                return require(full);
            } catch (err) {
                console.warn(`[SkillResolver] Found skill at ${full} but require failed:`, err.message);
            }
        }
    }

    return null;
}

module.exports = {
    resolveSkill
};
