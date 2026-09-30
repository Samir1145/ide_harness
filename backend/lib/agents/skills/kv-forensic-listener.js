'use strict';

/**
 * KV Forensic Listener (Hayagriva Harness)
 * ----------------------------------------
 * Listens to fact mutations and additions in reviews/case_kv_dictionary.json.
 * Correlates atomized facts with statutory IBC risks via forensic-trigger-registry.js
 * and posts actionable verification cards into the Case Action Inbox.
 */

const fs = require('fs');
const path = require('path');
const { evaluateFactTriggers } = require('./forensic-trigger-registry');

/**
 * Scans a case's KV dictionary and generates pending forensic recommendations.
 * @param {string} caseDir 
 * @param {Object} [incomingKVDelta] Optional subset of recently extracted facts
 * @returns {Array} List of newly generated probe recommendations
 */
function scanCaseKVForProbes(caseDir, incomingKVDelta = null) {
    if (!caseDir) return [];

    const reviewsDir = path.join(caseDir, 'reviews');
    const dictPath = path.join(reviewsDir, 'case_kv_dictionary.json');
    if (!fs.existsSync(dictPath)) return [];

    let currentDict = {};
    try {
        currentDict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
    } catch (_) {
        return [];
    }

    const verifications = currentDict.forensic_verifications || {};
    const pendingProbes = currentDict.pending_forensic_probes || {};
    const targetFacts = incomingKVDelta || currentDict;

    const newRecommendations = [];
    let updatedDict = false;

    for (const key in targetFacts) {
        if (key === 'forensic_verifications' || key === 'pending_forensic_probes') continue;

        const factEntry = targetFacts[key];
        const triggers = evaluateFactTriggers(key, factEntry, currentDict);

        for (const trig of triggers) {
            const probeKey = `${trig.tool}_${trig.targetIdentifier}`.replace(/[^a-zA-Z0-9_]/g, '_');

            // Skip if already verified with a valid receipt
            if (verifications[probeKey] && verifications[probeKey].status?.startsWith('VERIFIED')) {
                continue;
            }

            // Skip if already pending
            if (pendingProbes[probeKey]) {
                continue;
            }

            const probeItem = {
                probeKey,
                factKey: key,
                ruleId: trig.ruleId,
                category: trig.category,
                tool: trig.tool,
                clause: trig.clause,
                rateInr: trig.rateInr,
                description: trig.description,
                targetIdentifier: trig.targetIdentifier,
                args: trig.args,
                discoveredAt: new Date().toISOString(),
                status: 'PENDING_AUTHORIZATION'
            };

            pendingProbes[probeKey] = probeItem;
            newRecommendations.push(probeItem);
            updatedDict = true;

            // Create item in Case Action Inbox
            try {
                const inboxManager = require('../inbox-manager');
                inboxManager.createItem(caseDir, {
                    kind: 'approval',
                    title: `⚡ Statutory Check: ${trig.description} (${trig.targetIdentifier})`,
                    body: `Atomized fact "${key}" triggers mandatory ${trig.clause}. Diligence tool: ${trig.tool} (Est: ₹${trig.rateInr}).`,
                    riskClass: 'external',
                    data: {
                        toolName: trig.tool,
                        args: trig.args,
                        rate_inr: trig.rateInr,
                        probeKey,
                        clause: trig.clause,
                        targetIdentifier: trig.targetIdentifier
                    },
                    metadata: {
                        source: 'KV_FORENSIC_LISTENER',
                        probeKey,
                        factKey: key
                    }
                });
            } catch (inboxErr) {
                console.warn('[KVForensicListener] Inbox creation warning:', inboxErr.message);
            }
        }
    }

    if (updatedDict) {
        currentDict.pending_forensic_probes = pendingProbes;
        currentDict.forensic_verifications = verifications;
        try {
            fs.writeFileSync(dictPath, JSON.stringify(currentDict, null, 2), 'utf8');
        } catch (_) {}
    }

    return newRecommendations;
}

/**
 * Hook invoked immediately after extractFileKV() merges new elements.
 */
function onKVFactsExtracted(caseDir, newlyMergedKV) {
    if (!caseDir || !newlyMergedKV) return [];
    return scanCaseKVForProbes(caseDir, newlyMergedKV);
}

/**
 * Returns all active pending probes for a case.
 */
function getPendingProbes(caseDir) {
    if (!caseDir) return [];
    const dictPath = path.join(caseDir, 'reviews', 'case_kv_dictionary.json');
    if (!fs.existsSync(dictPath)) return [];
    try {
        const dict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
        return Object.values(dict.pending_forensic_probes || {});
    } catch (_) {
        return [];
    }
}

module.exports = {
    scanCaseKVForProbes,
    onKVFactsExtracted,
    getPendingProbes
};
