/**
 * Sub-Agents Module Index
 * Central Registry of Specialized IBC Claim Sub-Agents
 */

const ClassOfCreditorsClaimSubAgent = require('./claim-class-creditors');
const FinancialClaimSubAgent = require('./claim-financial');
const OperationalClaimSubAgent = require('./claim-operational');
const WorkmenClaimSubAgent = require('./claim-workmen');
const OtherClaimSubAgent = require('./claim-other');
const BankAnalyzerSubAgent = require('./bank-analyzer');

const subAgentRegistry = {
    'CLASS_OF_CREDITORS': new ClassOfCreditorsClaimSubAgent(),
    'FINANCIAL_CREDITOR': new FinancialClaimSubAgent(),
    'OPERATIONAL_CREDITOR': new OperationalClaimSubAgent(),
    'WORKMEN_EMPLOYEE': new WorkmenClaimSubAgent(),
    'OTHER_CREDITOR': new OtherClaimSubAgent(),
    'BANK_ANALYZER': new BankAnalyzerSubAgent()
};

/**
 * Resolves the appropriate Sub-Agent instance for a given claimant type.
 * @param {string} claimantType 
 * @returns {object}
 */
function getSubAgentForType(claimantType) {
    const key = String(claimantType || 'CLASS_OF_CREDITORS').toUpperCase();
    return subAgentRegistry[key] || subAgentRegistry['CLASS_OF_CREDITORS'];
}

module.exports = {
    ClassOfCreditorsClaimSubAgent,
    FinancialClaimSubAgent,
    OperationalClaimSubAgent,
    WorkmenClaimSubAgent,
    OtherClaimSubAgent,
    BankAnalyzerSubAgent,
    subAgentRegistry,
    getSubAgentForType
};
