'use strict';

/**
 * LLMService (Service Definition)
 * 
 * Capability Seam: LLM Generation & Streaming
 * Following DeepSeek Harness "Seams" pattern:
 * - Service Definition: Standard completion, streaming, and model switching protocol.
 * - Service Providers: llama-server, deterministic skeleton fallback, external API.
 * - Consumers: @document subagent, @statutory_auditor, chat routes.
 */
class LLMService {
  constructor() {
    this._providers = new Map();
    this._activeProvider = 'DETERMINISTIC';
  }

  registerProvider(name, providerInstance) {
    if (!name || !providerInstance) {
      throw new Error('[LLMSeam] name and providerInstance are required');
    }
    this._providers.set(name.toUpperCase(), providerInstance);
  }

  getProvider(name) {
    const key = (name || this._activeProvider).toUpperCase();
    const provider = this._providers.get(key);
    if (!provider) {
      return this._providers.get('DETERMINISTIC') || null;
    }
    return provider;
  }

  setActiveProvider(name) {
    const key = (name || '').toUpperCase();
    if (!this._providers.has(key)) {
      throw new Error(`[LLMSeam] Cannot activate unregistered provider '${name}'`);
    }
    this._activeProvider = key;
  }

  getActiveProviderName() {
    return this._activeProvider;
  }

  /**
   * Check if the active or specified engine is online and responding.
   * @param {string} [providerName]
   * @returns {Promise<boolean>}
   */
  async isHealthy(providerName) {
    const provider = this.getProvider(providerName);
    if (!provider || typeof provider.isHealthy !== 'function') return false;
    return await provider.isHealthy();
  }

  /**
   * Generate text completion.
   * @param {string|Array} promptOrMessages
   * @param {Object} [options]
   * @returns {Promise<Object>} { text, usage, finishReason }
   */
  async complete(promptOrMessages, options = {}) {
    const provider = this.getProvider(options.provider);
    return await provider.complete(promptOrMessages, options);
  }

  /**
   * Stream text completion.
   * @param {string|Array} promptOrMessages
   * @param {Function} onChunk - Callback for streaming chunks
   * @param {Object} [options]
   * @returns {Promise<Object>}
   */
  async stream(promptOrMessages, onChunk, options = {}) {
    const provider = this.getProvider(options.provider);
    return await provider.stream(promptOrMessages, onChunk, options);
  }
}

module.exports = LLMService;
