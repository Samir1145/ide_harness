/**
 * Skill Package: bank-forensic-audit
 * Unified entry point for multi-bank statement parsing, contra netting,
 * and statutory forensic analysis.
 */

const parser = require('./parser');
const preprocessor = require('./preprocessor');
const engine = require('./engine');
const ruleStore = require('./rules');
const sqliteExporter = require('./sqlite-exporter');
const pdfForensics = require('./pdf-forensics');

module.exports = {
    // Parser API
    ingestBankStatements: parser.ingestBankStatements,
    parseExcelOrCsv: parser.parseExcelOrCsv,
    parseMt940: parser.parseMt940,
    parseField86: parser.parseField86,
    deduplicateWithOccurrenceCount: parser.deduplicateWithOccurrenceCount,
    normalizeDate: parser.normalizeDate,
    cleanAmount: parser.cleanAmount,

    // PDF Document Forensics & Anti-Tampering API (Sebastien Rousseau Architecture)
    inspectPdfForensics: pdfForensics.inspectPdfForensics,
    extractPdfMetadata: pdfForensics.extractPdfMetadata,
    ForensicVerdict: pdfForensics.ForensicVerdict,

    // Preprocessor API
    cleanNarration: preprocessor.clean,
    extractKeyword: preprocessor.extractKeyword,
    isFurniture: preprocessor.isFurniture,

    // Forensic Engine API
    runForensicAnalysis: engine.runForensicAnalysis,
    isCashTransaction: engine.isCashTransaction,
    isSubThresholdSmurfing: engine.isSubThresholdSmurfing,

    // Rule Store API
    ruleStore: ruleStore,
    classify: ruleStore.classify.bind(ruleStore),

    // SQLite Exporter API (Node v24 native node:sqlite)
    exportToSqlite: sqliteExporter.exportToSqlite
};

