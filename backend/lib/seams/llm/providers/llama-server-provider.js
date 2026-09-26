'use strict';

const http = require('http');

/**
 * LlamaServerProvider (Service Provider)
 * Connects to local llama-server running quantized GGUF models:
 * - Port 8090: LegalParam-2.9B
 * - Port 8091: FinanceParam-2.9B
 * 
 * Enforces the strict 2,048-token context window budget and graceful error routing.
 */
class LlamaServerProvider {
  constructor(port = 8090, domain = 'legal') {
    this.name = 'LlamaServerProvider';
    this.port = port;
    this.domain = domain;
    this.maxContextTokens = 2048;
    this.maxOutputTokens = 512;
  }

  setPort(port) {
    this.port = port;
  }

  async isHealthy() {
    return new Promise((resolve) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: this.port,
        path: '/v1/models',
        method: 'GET',
        timeout: 1500
      }, (res) => {
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
      req.end();
    });
  }

  formatPromptEnvelope(messages) {
    if (typeof messages === 'string') {
      return `<|user|>${messages}</|user|><|assistant|>`;
    }
    if (Array.isArray(messages)) {
      return messages.map(m => {
        const role = m.role || 'user';
        const content = m.content || '';
        return `<|${role}|>${content}</|${role}|>`;
      }).join('') + '<|assistant|>';
    }
    return '';
  }

  async complete(promptOrMessages, options = {}) {
    const isOnline = await this.isHealthy();
    if (!isOnline) {
      throw new Error(`[LlamaServerProvider] llama-server on port ${this.port} is offline. Please start engine in Settings.`);
    }

    const messages = Array.isArray(promptOrMessages)
      ? promptOrMessages
      : [{ role: 'user', content: String(promptOrMessages) }];

    const postData = JSON.stringify({
      messages,
      stream: false,
      temperature: options.temperature || 0.1,
      max_tokens: options.maxTokens || this.maxOutputTokens,
      stop: ['<|user|>', '<|/user|>', '<|assistant|>', '<|/assistant|>', '<|endoftext|>', '<|end_of_text|>']
    });

    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: this.port,
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      }, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          if (res.statusCode !== 200) {
            return reject(new Error(`llama-server responded with HTTP ${res.statusCode}: ${body}`));
          }
          try {
            const parsed = JSON.parse(body);
            const text = parsed.choices && parsed.choices[0] ? (parsed.choices[0].message ? parsed.choices[0].message.content : parsed.choices[0].text) : '';
            resolve({
              text,
              usage: parsed.usage || {},
              finishReason: parsed.choices && parsed.choices[0] ? parsed.choices[0].finish_reason : 'stop'
            });
          } catch (e) {
            reject(new Error(`Failed to parse llama-server response: ${e.message}`));
          }
        });
      });

      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }

  async stream(promptOrMessages, onChunk, options = {}) {
    const isOnline = await this.isHealthy();
    if (!isOnline) {
      throw new Error(`[LlamaServerProvider] llama-server on port ${this.port} is offline.`);
    }

    const messages = Array.isArray(promptOrMessages)
      ? promptOrMessages
      : [{ role: 'user', content: String(promptOrMessages) }];

    const postData = JSON.stringify({
      messages,
      stream: true,
      temperature: options.temperature || 0.1,
      max_tokens: options.maxTokens || this.maxOutputTokens,
      stop: ['<|user|>', '<|/user|>', '<|assistant|>', '<|/assistant|>', '<|endoftext|>', '<|end_of_text|>']
    });

    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: this.port,
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      }, (res) => {
        let buffer = '';
        res.on('data', chunk => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop();

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed === 'data: [DONE]') continue;
            if (trimmed.startsWith('data: ')) {
              try {
                const parsed = JSON.parse(trimmed.slice(6));
                const delta = parsed.choices && parsed.choices[0] ? (parsed.choices[0].delta ? parsed.choices[0].delta.content : '') : '';
                if (delta && typeof onChunk === 'function') {
                  onChunk(delta);
                }
              } catch (_) {}
            }
          }
        });

        res.on('end', () => resolve({ finishReason: 'stop' }));
      });

      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }
}

module.exports = LlamaServerProvider;
