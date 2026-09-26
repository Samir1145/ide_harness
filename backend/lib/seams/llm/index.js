'use strict';

const LLMService = require('./llm-service');
const DeterministicProvider = require('./providers/deterministic-provider');
const LlamaServerProvider = require('./providers/llama-server-provider');

const llmService = new LLMService();

// Register foundational providers
llmService.registerProvider('DETERMINISTIC', new DeterministicProvider());
llmService.registerProvider('LITE', new DeterministicProvider());
llmService.registerProvider('LEGAL', new LlamaServerProvider(8090, 'legal'));
llmService.registerProvider('FINANCE', new LlamaServerProvider(8091, 'finance'));
llmService.registerProvider('LOCAL', new LlamaServerProvider(8090, 'legal'));

module.exports = llmService;
