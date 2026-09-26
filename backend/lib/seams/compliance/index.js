'use strict';

const ComplianceService = require('./compliance-service');
const LocalSubagentProvider = require('./providers/local-subagent-provider');
const LexAICloudProvider = require('./providers/lexai-cloud-provider');
const AirGappedStagedProvider = require('./providers/airgap-staged-provider');

// Create default singleton instance
const complianceService = new ComplianceService();

// Register the three foundational providers
complianceService.registerProvider('LOCAL', new LocalSubagentProvider());
complianceService.registerProvider('GLOBAL', new LexAICloudProvider());
complianceService.registerProvider('LEXAI', new LexAICloudProvider());
complianceService.registerProvider('AIRGAP', new AirGappedStagedProvider());

module.exports = complianceService;
