// backend/lib/core/task-namer.js
'use strict';

/**
 * Dynamic Task Titling Engine.
 * Formulates canonical, human-readable statutory task titles from runtime context:
 * Action/Diligence Activity : Target Subject/Entity/File (Statutory Scope/Context)
 */

function sanitizeText(text, maxLen = 60) {
    if (!text || typeof text !== 'string') return '';
    const clean = text.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (clean.length <= maxLen) return clean;
    return clean.substring(0, maxLen - 3) + '...';
}

function cleanFilename(filename) {
    if (!filename) return 'Document';
    const base = filename.split('/').pop().split('\\').pop();
    return base.replace(/\.(pdf|docx|xlsx|txt|md)$/i, '');
}

/**
 * Generates dynamic title for document ingestion and embedding.
 */
function synthesizeIngestionTitle({ filename, pageCount, chunkCount, sectionTitle }) {
    const docName = cleanFilename(filename);
    let details = [];
    if (pageCount) details.push(`Pages 1-${pageCount}`);
    if (chunkCount) details.push(`${chunkCount} Chunks`);
    if (sectionTitle) details.push(sanitizeText(sectionTitle, 30));

    const qualifier = details.length > 0 ? ` (${details.join(', ')})` : '';
    return `Forensic Ingestion: ${docName}${qualifier}`;
}

/**
 * Generates dynamic title for semantic & hybrid RAG queries.
 */
function synthesizeSearchTitle({ query, domain = 'statutory', topSection }) {
    const cleanQuery = sanitizeText(query, 50) || 'Diligence Query';
    const prefix = domain === 'finance' ? 'Financial Forensic Search' : 'Statutory Search';
    const qualifier = topSection ? ` [Focus: ${sanitizeText(topSection, 25)}]` : '';
    return `${prefix}: "${cleanQuery}"${qualifier}`;
}

/**
 * Generates dynamic title for local claim & contract extraction.
 */
function synthesizeExtractionTitle({ docType = 'Claim', claimantName, claimAmount, formType }) {
    const entity = sanitizeText(claimantName, 40) || 'Unspecified Creditor';
    let details = [];
    if (formType) details.push(formType);
    if (claimAmount) details.push(typeof claimAmount === 'number' ? `₹${claimAmount.toLocaleString('en-IN')}` : `${claimAmount}`);
    
    const qualifier = details.length > 0 ? ` (${details.join(' - ')})` : '';
    return `Claim Verification: ${entity}${qualifier}`;
}

/**
 * Generates dynamic title for local LLM generation and drafting.
 */
function synthesizeLlmTitle({ taskContext, modelName, promptPreview }) {
    if (taskContext) {
        return `Local Intelligence: ${sanitizeText(taskContext, 60)}`;
    }
    if (promptPreview) {
        return `Local Drafting: "${sanitizeText(promptPreview, 50)}"`;
    }
    const model = modelName ? ` (${modelName})` : '';
    return `Local Legal Intelligence Generation${model}`;
}

/**
 * Generates dynamic title for statutory cloud inquests.
 */
function synthesizeInquestTitle({ agentType = 'Statutory Inquest', entityName, identifier, qualifier }) {
    const subject = sanitizeText(entityName, 45) || 'Target Entity';
    let meta = [];
    if (identifier) meta.push(identifier);
    if (qualifier) meta.push(qualifier);

    const metaStr = meta.length > 0 ? ` (${meta.join(', ')})` : '';
    return `${agentType}: ${subject}${metaStr}`;
}

module.exports = {
    synthesizeIngestionTitle,
    synthesizeSearchTitle,
    synthesizeExtractionTitle,
    synthesizeLlmTitle,
    synthesizeInquestTitle
};
