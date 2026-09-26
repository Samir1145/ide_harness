'use strict';

/**
 * DeterministicProvider (Service Provider)
 * Default Lite Mode Engine: 0% CPU, 0 MB RAM, strictly deterministic.
 * Populates chamber factual templates without launching local model servers.
 */
class DeterministicProvider {
  constructor() {
    this.name = 'DeterministicProvider';
    this.tier = 'LITE';
  }

  async isHealthy() {
    return true; // Always healthy
  }

  async complete(promptOrMessages, options = {}) {
    const rawPrompt = typeof promptOrMessages === 'string'
      ? promptOrMessages
      : (Array.isArray(promptOrMessages) ? promptOrMessages.map(m => m.content || '').join('\n') : '');

    const notice = `\n\n> [!NOTE]\n` +
      `> **Compiled via Sovereign Fiduciary Engine (Lite Mode)**  \n` +
      `> Case facts populated deterministically from the factual repository. To enable neural text generation, start the local LLM engine in Settings.`;

    return {
      text: `Draft generated deterministically from statutory skeleton templates.${notice}`,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      finishReason: 'stop'
    };
  }

  async stream(promptOrMessages, onChunk, options = {}) {
    const res = await this.complete(promptOrMessages, options);
    if (typeof onChunk === 'function') {
      onChunk(res.text);
    }
    return res;
  }
}

module.exports = DeterministicProvider;
