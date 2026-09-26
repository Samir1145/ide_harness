'use strict';

/**
 * ComplianceService (Service Definition)
 * 
 * Capability Seam: Compliance Requisition & Dispatch
 * Following DeepSeek Harness "Seams" architectural pattern:
 * - Service Definition: Owns the standard dispatch/ingest contract and provider registry.
 * - Service Providers: Concrete execution adapters (Local Subagent, LexAI Cloud, Air-Gap Staged).
 * - Consumers: API route handlers, Compliance Queue, Case Action Inbox.
 */
class ComplianceService {
  constructor() {
    this._providers = new Map();
  }

  /**
   * Registers a provider instance under a tier name.
   * @param {string} tierName - e.g. 'LOCAL', 'GLOBAL', 'LEXAI', 'AIRGAP'
   * @param {Object} providerInstance
   */
  registerProvider(tierName, providerInstance) {
    if (!tierName || !providerInstance) {
      throw new Error('[ComplianceSeam] tierName and providerInstance are required for registration');
    }
    this._providers.set(tierName.toUpperCase(), providerInstance);
  }

  /**
   * Resolves a registered provider.
   * @param {string} tierName
   * @returns {Object}
   */
  getProvider(tierName) {
    const key = (tierName || 'LOCAL').toUpperCase();
    const provider = this._providers.get(key);
    if (!provider) {
      // Fallback aliases
      if (key === 'GLOBAL') return this._providers.get('LEXAI') || this._providers.get('LOCAL');
      if (key === 'LEXAI') return this._providers.get('GLOBAL') || this._providers.get('LOCAL');
      throw new Error(`[ComplianceSeam] No provider registered for execution tier: '${tierName}'`);
    }
    return provider;
  }

  /**
   * Check if a provider exists for a given tier.
   * @param {string} tierName
   * @returns {boolean}
   */
  hasProvider(tierName) {
    return this._providers.has((tierName || '').toUpperCase());
  }

  /**
   * Dispatches a statutory compliance task through the appropriate provider.
   *
   * @param {string} matterDir - Matter root directory
   * @param {Object} task - Task item from compliance_queue.json
   * @param {Object} [options] - Optional overrides (tier, serverUrl, etc.)
   * @returns {Promise<Object>} Dispatch result
   */
  async dispatch(matterDir, task, options = {}) {
    const tier = options.tier || task.execution_tier || 'LOCAL';
    const provider = this.getProvider(tier);
    return await provider.dispatch(matterDir, task, options);
  }

  /**
   * Ingests, audits, and generates cure notices for completed reports through the appropriate provider.
   *
   * @param {string} matterDir - Matter root directory
   * @param {Object} payload - { taskId, reportId, reportTitle, tiddlers, metadata }
   * @param {Object} [options]
   * @returns {Promise<Object>} Ingestion and audit result
   */
  async ingest(matterDir, payload, options = {}) {
    const tier = options.tier || payload.execution_tier || 'GLOBAL';
    const provider = this.getProvider(tier);
    return await provider.ingest(matterDir, payload, options);
  }
}

module.exports = ComplianceService;
